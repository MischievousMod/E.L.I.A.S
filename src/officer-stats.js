import {
  POINTS_CAREER_COLUMNS,
  POINTS_COLUMN_LABELS,
  POINTS_MONTHLY_JOBS_COLUMN,
  POINTS_RESET_TIMEZONE,
  POINTS_SPREADSHEET_ID,
  POINTS_TAB,
  POINTS_TOTAL_COLUMN,
} from "./points-config.js";
import {
  currentMonthKey,
  findOfficerRowForNames,
  readCellNumber,
} from "./points.js";
import { getSheets } from "./sheets.js";

/** Read career + monthly point counts for an officer (points sheet column C). */
export async function getOfficerPointsStats(officerName, { alsoTry = [] } = {}) {
  const names = [officerName, ...alsoTry]
    .map((name) => String(name ?? "").trim())
    .filter(Boolean);

  if (!names.length) {
    return { ok: false, reason: "no-name" };
  }

  const sheets = getSheets();
  const match = await findOfficerRowForNames(sheets, names);

  if (!match) {
    return { ok: false, reason: "officer-not-found", officer: names[0] };
  }

  const { row, matchedName } = match;
  const columns = [
    ...POINTS_CAREER_COLUMNS,
    POINTS_MONTHLY_JOBS_COLUMN,
    POINTS_TOTAL_COLUMN,
  ];
  const byColumn = {};

  for (const column of columns) {
    byColumn[column] = await readCellNumber(sheets, column, row);
  }

  return {
    ok: true,
    officer: matchedName,
    row,
    byColumn,
    monthKey: currentMonthKey(),
    timezone: POINTS_RESET_TIMEZONE,
  };
}

export function formatOfficerStatsMessage(stats) {
  if (!stats.ok) {
    if (stats.reason === "officer-not-found") {
      return [
        `No points row found for **${stats.officer}** in tab **${POINTS_TAB}** (column C).`,
        "Your **/register** username must match the officer name on the points sheet.",
      ].join("\n");
    }

    return "Could not load stats.";
  }

  const careerLines = POINTS_CAREER_COLUMNS.map((column) => {
    const label = POINTS_COLUMN_LABELS[column] ?? column;
    return `• **${label}** (${column}): **${stats.byColumn[column] ?? 0}**`;
  });

  const monthly = stats.byColumn[POINTS_MONTHLY_JOBS_COLUMN] ?? 0;
  const total = stats.byColumn[POINTS_TOTAL_COLUMN] ?? 0;

  return [
    `**Officer stats — ${stats.officer}**`,
    "",
    `**Monthly jobs** (${POINTS_MONTHLY_JOBS_COLUMN}): **${monthly}**`,
    `_Month: ${stats.monthKey} (${stats.timezone})_`,
    "",
    "**Career totals by job type**",
    ...careerLines,
    "",
    `**Total jobs** (${POINTS_TOTAL_COLUMN}, sheet formula): **${total}**`,
  ].join("\n");
}
