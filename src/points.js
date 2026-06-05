import { getSheets } from "./sheets.js";
import { extractExecutorFromMessage } from "./citation-log.js";
import {
  POINTS_MONTHLY_JOBS_COLUMN,
  POINTS_OFFICER_COLUMN,
  POINTS_RESET_TIMEZONE,
  POINTS_SPREADSHEET_ID,
  POINTS_TAB,
} from "./points-config.js";
import {
  getStoredMonthKey,
  setStoredMonthKey,
} from "./points-month-state.js";

function a1(range) {
  return `'${POINTS_TAB.replace(/'/g, "''")}'!${range}`;
}

/** Calendar month key in the configured timezone, e.g. "2026-06". */
export function currentMonthKey(
  timeZone = POINTS_RESET_TIMEZONE,
  date = new Date()
) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
  }).formatToParts(date);

  const year = parts.find((part) => part.type === "year")?.value ?? "";
  const month = parts.find((part) => part.type === "month")?.value ?? "";

  return `${year}-${month}`;
}

/**
 * Pull the executor's name off a posted slip. New slips use the EXECUTOR label;
 * older slips used OFFICER or PROCESSED BY, kept here for backward compatibility.
 */
export function parseOfficerFromMessage(message) {
  return extractExecutorFromMessage(message);
}

async function findOfficerRow(sheets, officerName) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: POINTS_SPREADSHEET_ID,
    range: a1(`${POINTS_OFFICER_COLUMN}1:${POINTS_OFFICER_COLUMN}`),
  });

  const rows = res.data.values ?? [];
  const target = officerName.trim().toLowerCase();

  for (let i = 0; i < rows.length; i += 1) {
    const value = String(rows[i]?.[0] ?? "").trim().toLowerCase();

    if (value && value === target) {
      return i + 1;
    }
  }

  return null;
}

async function readCellNumber(sheets, column, row) {
  const cell = a1(`${column}${row}`);
  const current = await sheets.spreadsheets.values.get({
    spreadsheetId: POINTS_SPREADSHEET_ID,
    range: cell,
  });

  const raw = current.data.values?.[0]?.[0];
  return Number(String(raw ?? "0").replace(/[^0-9.-]/g, "")) || 0;
}

async function writeCellNumber(sheets, column, row, value) {
  await sheets.spreadsheets.values.update({
    spreadsheetId: POINTS_SPREADSHEET_ID,
    range: a1(`${column}${row}`),
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [[value]] },
  });
}

/** Set column K to 0 for every officer row (row 2+). */
export async function resetMonthlyJobsColumn() {
  const sheets = getSheets();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: POINTS_SPREADSHEET_ID,
    range: a1(`${POINTS_OFFICER_COLUMN}2:${POINTS_OFFICER_COLUMN}`),
  });

  const rows = res.data.values ?? [];

  if (!rows.length) {
    return { cleared: 0 };
  }

  const zeros = rows.map(() => [0]);

  await sheets.spreadsheets.values.update({
    spreadsheetId: POINTS_SPREADSHEET_ID,
    range: a1(`K2:K${rows.length + 1}`),
    valueInputOption: "USER_ENTERED",
    requestBody: { values: zeros },
  });

  return { cleared: rows.length };
}

/**
 * If the calendar month changed, clear column K and remember the new month.
 * Safe to call often (startup, hourly, before each points update).
 */
export async function ensureMonthlyJobsResetIfNeeded() {
  const monthKey = currentMonthKey();
  const stored = getStoredMonthKey();

  if (stored === monthKey) {
    return { reset: false, monthKey };
  }

  const { cleared } = await resetMonthlyJobsColumn();
  setStoredMonthKey(monthKey);

  console.log(
    `Monthly jobs reset for ${monthKey} (${POINTS_RESET_TIMEZONE}): cleared ${cleared} row(s) in column K`
  );

  return { reset: true, monthKey, cleared };
}

/** Hourly check so K resets even if the bot was offline at midnight on the 1st. */
export function startMonthlyJobsResetScheduler() {
  const tick = () => {
    ensureMonthlyJobsResetIfNeeded().catch((err) => {
      console.error("Monthly jobs reset check failed:", err.message);
    });
  };

  tick();
  setInterval(tick, 60 * 60 * 1000);
}

/** Add `delta` (e.g. +1 / -1) to job-type column and monthly jobs (K). */
export async function adjustOfficerPoints(officerName, column, delta) {
  if (!officerName) {
    return { ok: false, reason: "no-officer" };
  }

  await ensureMonthlyJobsResetIfNeeded();

  const sheets = getSheets();
  const row = await findOfficerRow(sheets, officerName);

  if (!row) {
    return { ok: false, reason: "officer-not-found" };
  }

  const value = await readCellNumber(sheets, column, row);
  const next = Math.max(0, value + delta);
  await writeCellNumber(sheets, column, row, next);

  const monthlyPrevious = await readCellNumber(
    sheets,
    POINTS_MONTHLY_JOBS_COLUMN,
    row
  );
  const monthlyNext = Math.max(0, monthlyPrevious + delta);
  await writeCellNumber(sheets, POINTS_MONTHLY_JOBS_COLUMN, row, monthlyNext);

  return {
    ok: true,
    row,
    previous: value,
    next,
    monthlyPrevious,
    monthlyNext,
  };
}
