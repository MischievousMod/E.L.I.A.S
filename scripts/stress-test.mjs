/**
 * Stress test the sheet + points layer against an in-memory mock of Google
 * Sheets. Drives the SAME functions the Discord handlers call, so it verifies
 * tab routing, column placement, and point math without touching live sheets.
 */
process.env.SPREADSHEET_ID = "MOCK_MAIN";
process.env.SHEET_NAME = "Test Outstanding Citations";
process.env.REGISTRY_FILE = "scripts/.tmp-registry.json";
process.env.POINTS_MONTH_STATE_FILE = "scripts/.tmp-points-month.json";

import fs from "node:fs";
// Start from a clean registry so counts are deterministic.
try { fs.rmSync(process.env.REGISTRY_FILE, { force: true }); } catch {}
try { fs.rmSync(process.env.POINTS_MONTH_STATE_FILE, { force: true }); } catch {}
import { createMockSheets, indexToCol } from "./mock-sheets.mjs";
import { __setSheetsClientForTests } from "../src/sheets.js";
import {
  appendSubmission,
  appendRowToTab,
  writeFieldOnRow,
  writeCellOnTab,
  findAllCitationsByOffender,
  markSentenceCheckboxesForOffender,
  deleteCeRowsByOffender,
  findCeRowsByOffender,
} from "../src/sheets.js";
import { fieldDefinitions } from "../src/config.js";
import {
  ceTabNames,
  ceColumns,
  cePermanentColumns,
  resolveCeTab,
  isPermanentTab,
  parseSentenceDays,
} from "../src/ce-config.js";
import {
  adjustOfficerPoints,
  ensureMonthlyJobsResetIfNeeded,
  parseOfficerFromMessage,
} from "../src/points.js";
import {
  formatOfficerStatsMessage,
  getOfficerPointsStats,
} from "../src/officer-stats.js";
import { setStoredMonthKey } from "../src/points-month-state.js";
import { POINTS_SPREADSHEET_ID, POINTS_TAB, POINTS_CHANNEL_COLUMNS } from "../src/points-config.js";
import { buildSheetHyperlink, formatSubmissionTimestamp } from "../src/format.js";

const MAIN = "MOCK_MAIN";
let pass = 0;
let fail = 0;
const fails = [];
function check(name, cond, detail = "") {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    fail++;
    fails.push(name);
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}
function colOf(grid, rowNumber, letter) {
  const r = grid[rowNumber - 1] ?? [];
  let n = 0;
  for (const ch of letter) n = n * 26 + (ch.charCodeAt(0) - 64);
  return String(r[n - 1] ?? "");
}

// --- seed the mock ---------------------------------------------------------
const officer = "TestOfficer";
const pointsSeed = [
  ["", "", "Header", "", "Citations", "Interviews", "Spectates", "Investig", "Sentences", "Seminars", "Monthly jobs", "TotalFormula"],
  ["", "", officer, "", 0, 0, 0, 0, 0, 0, 0, "=SUM(E2:J2)"],
  ["", "", "OtherPerson", "", 5, 0, 0, 0, 0, 0, 0, "=SUM(E3:J3)"],
];
const ceSeedHeaders = [["x"], ["x"], ["x"], ["x"]]; // rows 1-4 occupy col A so data starts row 5

const mock = createMockSheets({
  [MAIN]: {
    "Test Outstanding Citations": [],
    [ceTabNames.short]: ceSeedHeaders.map((r) => [...r]),
    [ceTabNames.week]: ceSeedHeaders.map((r) => [...r]),
    [ceTabNames.month]: ceSeedHeaders.map((r) => [...r]),
    [ceTabNames.permanent]: ceSeedHeaders.map((r) => [...r]),
  },
  [POINTS_SPREADSHEET_ID]: { [POINTS_TAB]: pointsSeed },
});
__setSheetsClientForTests(mock.client);

// ===========================================================================
console.log("\n[1] /outstanding citation → Test Outstanding Citations");
{
  // fieldDefinitions order: message_link, offender, rank, infractions, amount_owed, start_date
  const start = formatSubmissionTimestamp(new Date("2026-06-04T15:00:00"));
  const values = ["", "Offender_A", "L3", "Speeding x2", "150", start];
  const row = await appendSubmission(process.env.SHEET_NAME, values);
  await writeFieldOnRow(process.env.SHEET_NAME, row, "outstanding_message_link", buildSheetHyperlink("https://discord.com/x/y/z"));
  const g = mock.dump(MAIN, "Test Outstanding Citations");
  check("offender → col B", colOf(g, row, "B") === "Offender_A");
  check("rank → col C", colOf(g, row, "C") === "L3");
  check("infractions → col F", colOf(g, row, "F") === "Speeding x2");
  check("amount owed → col G", colOf(g, row, "G") === "150");
  check("start date → col H", colOf(g, row, "H") === start);
  check("message link → col L (HYPERLINK)", colOf(g, row, "L").startsWith("=HYPERLINK("));
  check("nothing written to col D/E", colOf(g, row, "D") === "" && colOf(g, row, "E") === "");
}

// ===========================================================================
console.log("\n[2] /ce sentence → routing + columns by duration");
const ceCases = [
  { sentence: "2 days", expect: ceTabNames.short },
  { sentence: "10 days", expect: ceTabNames.week },
  { sentence: "2 months", expect: ceTabNames.month },
  { sentence: "Permanent", expect: ceTabNames.permanent },
];
for (const c of ceCases) {
  const tab = resolveCeTab(c.sentence);
  check(`"${c.sentence}" routes to ${c.expect}`, tab === c.expect, `got ${tab}`);
  const submittedAt = new Date("2026-06-04T12:00:00");
  if (isPermanentTab(tab)) {
    const row = await appendRowToTab(tab, {
      [cePermanentColumns.offender]: "Perp_Perm",
      [cePermanentColumns.codesBroken]: "Code 1",
      [cePermanentColumns.authorization]: "AdminX",
      [cePermanentColumns.banned]: "TRUE",
    }, cePermanentColumns.offender);
    const g = mock.dump(MAIN, tab);
    check("perm offender → B", colOf(g, row, "B") === "Perp_Perm");
    check("perm codes → C", colOf(g, row, "C") === "Code 1");
    check("perm authorization → D", colOf(g, row, "D") === "AdminX");
    check("perm banned → E (checkbox TRUE)", colOf(g, row, "E") === "TRUE");
    check("perm wrote data at row 5 (after 4 header rows)", row === 5, `row=${row}`);
  } else {
    const days = parseSentenceDays(c.sentence);
    const endDate = formatSubmissionTimestamp(new Date(submittedAt.getTime() + days * 86400000));
    const start = formatSubmissionTimestamp(submittedAt);
    const row = await appendRowToTab(tab, {
      [ceColumns.offender]: "Perp_" + c.expect.slice(0, 4),
      [ceColumns.codesBroken]: "Code 1",
      [ceColumns.startDate]: start,
      [ceColumns.endDate]: endDate,
      [ceColumns.classESentence]: c.sentence,
      [ceColumns.rankPostInfraction]: "CE",
    }, ceColumns.offender);
    await writeCellOnTab(tab, row, ceColumns.messageLink, buildSheetHyperlink("https://discord.com/a/b/c"));
    const g = mock.dump(MAIN, tab);
    check("offender → B", colOf(g, row, "B").startsWith("Perp_"));
    check("codes → C", colOf(g, row, "C") === "Code 1");
    check("start → D", colOf(g, row, "D") === start);
    check("end date → E (start + duration)", colOf(g, row, "E") === endDate, `got ${colOf(g, row, "E")}`);
    check("sentence → F", colOf(g, row, "F") === c.sentence);
    check("rank → G", colOf(g, row, "G") === "CE");
    check("message link → H (HYPERLINK)", colOf(g, row, "H").startsWith("=HYPERLINK("));
    check("data starts at row 5", row === 5, `row=${row}`);
  }
}

// ===========================================================================
console.log("\n[3] /ce delete → scan full offender column + name normalization");
{
  await appendRowToTab(ceTabNames.month, { [ceColumns.offender]: "DeleteMe", [ceColumns.codesBroken]: "z" }, ceColumns.offender);
  await writeCellOnTab(ceTabNames.week, 1, "B", "Offender");
  await writeCellOnTab(ceTabNames.week, 3, "B", "EarlyRowUser");

  const foundEarly = await findCeRowsByOffender(ceTabNames.week, "@ EarlyRowUser ");
  check("find CE row above row 5", foundEarly.matches.includes(3), JSON.stringify(foundEarly));

  const outBefore = mock.dump(MAIN, "Test Outstanding Citations").length;
  const monthDelete = await deleteCeRowsByOffender(ceTabNames.month, "deleteme");
  check("removed the CE row for DeleteMe", monthDelete.deleted === 1, JSON.stringify(monthDelete));
  const weekDelete = await deleteCeRowsByOffender(ceTabNames.week, "earlyrowuser");
  check("removed early-row CE offender", weekDelete.deleted === 1, JSON.stringify(weekDelete));
  const stillThere = (await findCeRowsByOffender(ceTabNames.month, "DeleteMe")).matches.length;
  check("CE row is gone", stillThere === 0);
  const outAfter = mock.dump(MAIN, "Test Outstanding Citations").length;
  check("outstanding tab row count unchanged", outBefore === outAfter, `${outBefore} -> ${outAfter}`);
}

// ===========================================================================
console.log("\n[4] /outstanding sentences → checkbox in column D");
{
  // append an outstanding row, then mark its sentence checkbox
  const start = formatSubmissionTimestamp(new Date());
  const row = await appendSubmission(process.env.SHEET_NAME, ["", "BoxGuy", "L1", "stuff", "10", start]);
  const res = await markSentenceCheckboxesForOffender(process.env.SHEET_NAME, "BoxGuy");
  const g = mock.dump(MAIN, "Test Outstanding Citations");
  check("checkbox set TRUE in column D", colOf(g, row, "D").toLowerCase() === "true", `got ${colOf(g, row, "D")}`);
  check("markSentence returned the matched row", res.rowNumbers.includes(row));
}

// ===========================================================================
console.log("\n[5] Points — officer parsing + award/undo per channel");
{
  const slip = "```\nCITATION LOG\nEXECUTOR        " + officer + "\nREF NO.         ABC\n```";
  const fakeMsg = { content: "", embeds: [{ description: slip, footer: { text: "" } }] };
  check("parse EXECUTOR from slip", parseOfficerFromMessage(fakeMsg) === officer, `got "${parseOfficerFromMessage(fakeMsg)}"`);

  const legacy = { content: "", embeds: [{ description: "```\nPROCESSED BY     " + officer + "\n```", footer: {} }] };
  check("parse legacy PROCESSED BY", parseOfficerFromMessage(legacy) === officer);

  const expectCol = {
    "1511598741478441002": "E", // citations
    "1511806603521822800": "F", // interview
    "1511806517228077237": "G", // spectator
    "1511806847634374837": "I", // outstanding sentences
    "1511806370972831825": "I", // class-e
    "1511857029377949826": "J", // seminar
  };
  for (const [chId, col] of Object.entries(expectCol)) {
    check(`channel ${chId} maps to column ${col}`, POINTS_CHANNEL_COLUMNS[chId] === col, `got ${POINTS_CHANNEL_COLUMNS[chId]}`);
  }

  const pg = () => mock.dump(POINTS_SPREADSHEET_ID, POINTS_TAB);
  const valAt = (col) => Number(colOf(pg(), 2, col)) || 0;

  // award one point in each distinct column, then undo
  for (const col of ["E", "F", "G", "I", "J"]) {
    const before = valAt(col);
    const add = await adjustOfficerPoints(officer, col, +1);
    check(`+1 ${col}: ${before}→${add.next}`, add.ok && add.next === before + 1, JSON.stringify(add));
    check(`+1 ${col} includes totalJobs`, typeof add.totalJobs === "number", JSON.stringify(add));
    const sub = await adjustOfficerPoints(officer, col, -1);
    check(`-1 ${col}: back to ${before}`, sub.ok && sub.next === before, JSON.stringify(sub));
  }

  // running total accumulates (two awards)
  await adjustOfficerPoints(officer, "I", +1);
  const second = await adjustOfficerPoints(officer, "I", +1);
  check("two sentence points accumulate to 2", second.next === 2, `got ${second.next}`);
  await adjustOfficerPoints(officer, "I", -1);
  await adjustOfficerPoints(officer, "I", -1);

  // clamp at zero
  const clamp = await adjustOfficerPoints(officer, "E", -1);
  check("cannot go below 0", clamp.ok && clamp.next === 0, JSON.stringify(clamp));

  // column L (formula) untouched
  check("column L formula untouched", colOf(pg(), 2, "L") === "=SUM(E2:J2)");

  await adjustOfficerPoints(officer, "E", +1);
  check("monthly jobs (K) +1 with citation", valAt("K") === 1, `got ${valAt("K")}`);
  await adjustOfficerPoints(officer, "F", +1);
  check("monthly jobs accumulates across types", valAt("K") === 2, `got ${valAt("K")}`);
  await adjustOfficerPoints(officer, "E", -1);
  await adjustOfficerPoints(officer, "F", -1);
  check("monthly jobs undo works", valAt("K") === 0, `got ${valAt("K")}`);

  setStoredMonthKey("2020-01");
  const reset = await ensureMonthlyJobsResetIfNeeded();
  check("month rollover clears column K", reset.reset === true, JSON.stringify(reset));
  check("column K zero after reset", valAt("K") === 0, `got ${valAt("K")}`);
  await adjustOfficerPoints(officer, "J", +1);
  check("monthly jobs count after reset", valAt("K") === 1, `got ${valAt("K")}`);
  await adjustOfficerPoints(officer, "J", -1);

  const stats = await getOfficerPointsStats(officer);
  check("officer stats load", stats.ok === true, JSON.stringify(stats));
  check(
    "stats message includes monthly jobs",
    formatOfficerStatsMessage(stats).includes("Monthly jobs")
  );

  // unknown officer
  const missing = await adjustOfficerPoints("NobodyHere", "E", +1);
  check("unknown officer → officer-not-found", !missing.ok && missing.reason === "officer-not-found");

  // other person's points never moved
  check("OtherPerson citations untouched (=5)", Number(colOf(pg(), 3, "E")) === 5);
}

// ===========================================================================
console.log("\n[6] Registry (internal file) — register/list/delete + gate");
{
  const reg = await import("../src/registry.js");
  await reg.upsertRegistration("user1", "RobloxOne");
  const u = await reg.upsertRegistration("user1", "RobloxOneEdited");
  check("re-register edits (no duplicate)", u.isUpdate === true);
  check("getRegisteredUsername returns latest", (await reg.getRegisteredUsername("user1")) === "RobloxOneEdited");
  await reg.upsertRegistration("user2", "RobloxTwo");
  const list = await reg.listRegistrations();
  check("registry lists 2 entries", list.length === 2, `got ${list.length}`);
  const removed = await reg.removeRegistration("user1");
  check("removeRegistration returns entry", removed && removed.username === "RobloxOneEdited");
  check("gate: removed user no longer registered", (await reg.getRegisteredUsername("user1")) === "");
  check("gate: unregistered user blocked", (await reg.getRegisteredUsername("ghost")) === "");
}

// ===========================================================================
console.log("\n[7] Citation evidence recovery (/outstanding delete)");
{
  const {
    extractCitationImagesFromMessage,
    extractCitationLinksFromMessage,
  } = await import("../src/evidence.js");

  const att = (id, name) => {
    const url = `https://cdn.discordapp.com/attachments/9/${id}/${name}`;
    return { id, name, url, proxyURL: url, contentType: "image/png" };
  };

  const fourAttachments = new Map([
    ["1", att("101", "evidence-1.png")],
    ["2", att("102", "evidence-2.png")],
    ["3", att("103", "evidence-3.png")],
    ["4", att("104", "evidence-4.png")],
  ]);

  const fromFiles = await extractCitationImagesFromMessage({
    id: "citation-msg",
    partial: false,
    attachments: fourAttachments,
    embeds: [],
  });
  check(
    "recovers all 4 message attachments",
    fromFiles.length === 4,
    `got ${fromFiles.length}`
  );

  const galleryMessage = {
    id: "gallery-msg",
    partial: false,
    attachments: fourAttachments,
    embeds: [
      { image: { url: "attachment://evidence-1.png" } },
      { image: { url: "attachment://evidence-2.png" } },
      { image: { url: "attachment://evidence-3.png" } },
      { image: { url: "attachment://evidence-4.png" } },
    ],
  };
  const fromGallery = await extractCitationImagesFromMessage(galleryMessage);
  check(
    "recovers 4 gallery embeds (deduped with files)",
    fromGallery.length === 4,
    `got ${fromGallery.length}`
  );

  const proxyOnlyMessage = {
    id: "proxy-msg",
    partial: false,
    attachments: new Map(),
    embeds: [
      {
        image: {
          url: "attachment://evidence-1.png",
          proxy_url:
            "https://media.discordapp.net/attachments/9/101/evidence-1.png",
        },
      },
      {
        image: {
          url: "attachment://evidence-2.png",
          proxy_url:
            "https://media.discordapp.net/attachments/9/102/evidence-2.png",
        },
      },
      {
        image: {
          url: "attachment://evidence-3.png",
          proxy_url:
            "https://media.discordapp.net/attachments/9/103/evidence-3.png",
        },
      },
      {
        image: {
          url: "attachment://evidence-4.png",
          proxy_url:
            "https://media.discordapp.net/attachments/9/104/evidence-4.png",
        },
      },
    ],
  };
  const fromProxy = await extractCitationImagesFromMessage(proxyOnlyMessage);
  check(
    "recovers 4 embed proxy URLs when attachment list is empty",
    fromProxy.length === 4,
    `got ${fromProxy.length}`
  );

  const linkMessage = {
    id: "link-msg",
    partial: false,
    attachments: new Map(),
    content: "",
    embeds: [
      {
        title: "OUTSTANDING CITATION — OFFICIAL RECORD",
        fields: [
          {
            name: "Links",
            value:
              "https://example.com/policy\nhttps://www.youtube.com/watch?v=test123",
          },
        ],
      },
    ],
  };
  const links = await extractCitationLinksFromMessage(linkMessage);
  check(
    "recovers URLs from Links field on citation log",
    links.length === 2,
    `got ${links.length}`
  );
}

// --- cleanup temp registry file -------------------------------------------
try { fs.rmSync(process.env.REGISTRY_FILE, { force: true }); } catch {}
try { fs.rmSync(process.env.POINTS_MONTH_STATE_FILE, { force: true }); } catch {}

console.log(`\n==== RESULTS: ${pass} passed, ${fail} failed ====`);
if (fail) {
  console.log("Failed:", fails.join(", "));
  process.exit(1);
}
