import fs from "node:fs";
import path from "node:path";
import { google } from "googleapis";
import { fieldDefinitions, lastDataColumn } from "./config.js";
import { sentenceCheckboxColumn } from "./sentence-config.js";

const SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets";

let sheetsApi = null;

function loadGoogleCredentials() {
  const raw = process.env.GOOGLE_CREDENTIALS_JSON?.trim();
  if (raw) {
    try {
      return JSON.parse(raw);
    } catch {
      throw new Error(
        "GOOGLE_CREDENTIALS_JSON is set but is not valid JSON. Paste the full service account key file contents."
      );
    }
  }

  const credentialsPath = path.join(process.cwd(), "credentials.json");
  if (fs.existsSync(credentialsPath)) {
    return { keyFile: credentialsPath };
  }

  throw new Error(
    "Google credentials not configured. Add credentials.json locally, or set GOOGLE_CREDENTIALS_JSON in Railway/host env (full service account JSON)."
  );
}

function createGoogleAuth() {
  const creds = loadGoogleCredentials();
  if (creds.keyFile) {
    return new google.auth.GoogleAuth({
      keyFile: creds.keyFile,
      scopes: [SHEETS_SCOPE],
    });
  }
  return new google.auth.GoogleAuth({
    credentials: creds,
    scopes: [SHEETS_SCOPE],
  });
}

export function getSheets() {
  if (sheetsApi) {
    return sheetsApi;
  }

  const auth = createGoogleAuth();
  sheetsApi = google.sheets({ version: "v4", auth });
  return sheetsApi;
}

/** Test seam: inject a fake Sheets client (used by the mock stress test only). */
export function __setSheetsClientForTests(client) {
  sheetsApi = client;
}

/** Load the Google client on startup so the first citation is not slow. */
export async function warmSheetClient() {
  getSheets();
}

function escapeSheetName(sheetName) {
  return sheetName.replace(/'/g, "''");
}

function range(sheetName, cellRange) {
  const safeName = escapeSheetName(sheetName);
  return `'${safeName}'!${cellRange}`;
}

function columnToIndex(column) {
  let index = 0;
  for (const char of column.toUpperCase()) {
    index = index * 26 + (char.charCodeAt(0) - 64);
  }
  return index - 1;
}

function indexToColumn(index) {
  let n = index + 1;
  let letters = "";

  while (n > 0) {
    const remainder = (n - 1) % 26;
    letters = String.fromCharCode(65 + remainder) + letters;
    n = Math.floor((n - 1) / 26);
  }

  return letters;
}

function normalizeHeader(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function normalizeUsername(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

function headerNamesForField(field) {
  return [field.label, field.name, ...(field.headerAliases ?? [])].map(
    normalizeHeader
  );
}

function buildDefaultHeaderRow() {
  const width = columnToIndex(lastDataColumn) + 1;
  const row = Array(width).fill("");

  for (const field of fieldDefinitions) {
    row[columnToIndex(field.column)] = field.label;
  }

  return row;
}

async function readHeaderRow(sheets, spreadsheetId, sheetName) {
  const { data } = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: range(sheetName, "1:1"),
  });

  return data.values?.[0] ?? [];
}

function buildSheetLayout(headerRow) {
  const normalizedHeaders = headerRow.map(normalizeHeader);
  const fieldColumnIndex = {};

  for (const field of fieldDefinitions) {
    const names = headerNamesForField(field);
    let colIndex = normalizedHeaders.findIndex((header) =>
      names.includes(header)
    );

    if (colIndex === -1) {
      colIndex = columnToIndex(field.column);
    }

    fieldColumnIndex[field.name] = colIndex;
  }

  const lastColIndex = Math.max(
    headerRow.length - 1,
    ...Object.values(fieldColumnIndex),
    columnToIndex(lastDataColumn)
  );

  return {
    headerRow,
    fieldColumnIndex,
    lastColIndex,
    offenderColIndex: fieldColumnIndex.offender,
    hasHeaders: headerRow.some((cell) => String(cell ?? "").trim()),
  };
}

async function getSheetLayout(sheets, spreadsheetId, sheetName) {
  const headerRow = await readHeaderRow(sheets, spreadsheetId, sheetName);
  return buildSheetLayout(headerRow);
}

function fieldUpdatesForRow(sheetName, layout, rowNumber, fieldValues) {
  const updates = [];

  for (let i = 0; i < fieldDefinitions.length; i++) {
    const value = fieldValues[i];

    if (value === undefined || value === null || value === "") {
      continue;
    }

    const field = fieldDefinitions[i];
    const colIndex = layout.fieldColumnIndex[field.name];
    const column = indexToColumn(colIndex);

    updates.push({
      range: range(sheetName, `${column}${rowNumber}`),
      values: [[value]],
    });
  }

  return updates;
}

/** First data row with no offender in the column mapped from the sheet headers. */
async function getNextRowNumber(sheets, spreadsheetId, sheetName, layout) {
  const offenderColumn = indexToColumn(layout.offenderColIndex);

  const { data } = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: range(sheetName, `${offenderColumn}2:${offenderColumn}`),
  });

  const rows = data.values ?? [];

  for (let i = 0; i < rows.length; i++) {
    const offender = rows[i]?.[0];
    if (!String(offender ?? "").trim()) {
      return i + 2;
    }
  }

  return rows.length + 2;
}

async function ensureHeaders(sheets, spreadsheetId, sheetName) {
  let layout = await getSheetLayout(sheets, spreadsheetId, sheetName);

  if (layout.hasHeaders) {
    return layout;
  }

  const headerRow = buildDefaultHeaderRow();
  const endColumn = indexToColumn(headerRow.length - 1);

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: range(sheetName, `A1:${endColumn}1`),
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [headerRow] },
  });

  return buildSheetLayout(headerRow);
}

export async function appendSubmission(sheetName, fieldValues) {
  const spreadsheetId = process.env.SPREADSHEET_ID;

  if (!spreadsheetId) {
    throw new Error("SPREADSHEET_ID is not set in .env");
  }

  const sheets = getSheets();
  const layout = await ensureHeaders(sheets, spreadsheetId, sheetName);
  const nextRow = await getNextRowNumber(
    sheets,
    spreadsheetId,
    sheetName,
    layout
  );
  const updates = fieldUpdatesForRow(
    sheetName,
    layout,
    nextRow,
    fieldValues
  );

  if (updates.length) {
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId,
      requestBody: {
        valueInputOption: "USER_ENTERED",
        data: updates,
      },
    });
  }

  return nextRow;
}

async function getSheetId(sheets, spreadsheetId, sheetName) {
  const { data } = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: "sheets(properties(sheetId,title))",
  });

  const sheet = data.sheets?.find(
    (entry) => entry.properties?.title === sheetName
  );

  if (!sheet?.properties?.sheetId) {
    throw new Error(`Sheet not found: ${sheetName}`);
  }

  return sheet.properties.sheetId;
}

/** All data rows whose offender column matches (case-insensitive). */
export async function findAllCitationsByOffender(sheetName, username) {
  const spreadsheetId = process.env.SPREADSHEET_ID;

  if (!spreadsheetId) {
    throw new Error("SPREADSHEET_ID is not set in .env");
  }

  const sheets = getSheets();
  const layout = await getSheetLayout(sheets, spreadsheetId, sheetName);
  const offenderColumn = indexToColumn(layout.offenderColIndex);
  const target = normalizeUsername(username);
  const matches = [];

  if (!target) {
    return matches;
  }

  const { data } = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: range(sheetName, `${offenderColumn}2:${offenderColumn}`),
  });

  const rows = data.values ?? [];

  for (let i = 0; i < rows.length; i++) {
    const cellUsername = rows[i]?.[0];

    if (normalizeUsername(cellUsername) !== target) {
      continue;
    }

    const rowNumber = i + 2;
    const endColumn = indexToColumn(layout.lastColIndex);
    /** FORMULA render so a HYPERLINK("url","link") cell still exposes its URL. */
    const { data: rowData } = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: range(sheetName, `A${rowNumber}:${endColumn}${rowNumber}`),
      valueRenderOption: "FORMULA",
    });
    const row = rowData.values?.[0] ?? [];
    const fields = {};

    for (const field of fieldDefinitions) {
      const colIndex = layout.fieldColumnIndex[field.name];
      fields[field.name] = String(row[colIndex] ?? "").trim();
    }

    matches.push({
      rowNumber,
      offender: String(cellUsername ?? "").trim(),
      messageLink: fields.outstanding_message_link ?? "",
      fields,
    });
  }

  return matches;
}

/** Find the first data row whose offender column matches (case-insensitive). */
export async function findCitationByUsername(sheetName, username) {
  const matches = await findAllCitationsByOffender(sheetName, username);
  return matches[0] ?? null;
}

export async function deleteSheetRow(sheetName, rowNumber) {
  const spreadsheetId = process.env.SPREADSHEET_ID;

  if (!spreadsheetId) {
    throw new Error("SPREADSHEET_ID is not set in .env");
  }

  const sheets = getSheets();
  const sheetId = await getSheetId(sheets, spreadsheetId, sheetName);

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        {
          deleteDimension: {
            range: {
              sheetId,
              dimension: "ROWS",
              startIndex: rowNumber - 1,
              endIndex: rowNumber,
            },
          },
        },
      ],
    },
  });
}

/** Check the sentence checkbox in column D for every matching offender row (column B). */
export async function markSentenceCheckboxesForOffender(sheetName, offender) {
  const spreadsheetId = process.env.SPREADSHEET_ID;

  if (!spreadsheetId) {
    throw new Error("SPREADSHEET_ID is not set in .env");
  }

  const matches = await findAllCitationsByOffender(sheetName, offender);

  if (!matches.length) {
    throw new Error(
      `No spreadsheet row found for offender "${offender}" in column B.`
    );
  }

  const sheets = getSheets();
  const sheetId = await getSheetId(sheets, spreadsheetId, sheetName);
  const colIndex = columnToIndex(sentenceCheckboxColumn);

  const requests = matches.map((match) => ({
    repeatCell: {
      range: {
        sheetId,
        startRowIndex: match.rowNumber - 1,
        endRowIndex: match.rowNumber,
        startColumnIndex: colIndex,
        endColumnIndex: colIndex + 1,
      },
      cell: {
        userEnteredValue: { boolValue: true },
      },
      fields: "userEnteredValue",
    },
  }));

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: { requests },
  });

  return {
    rowNumbers: matches.map((match) => match.rowNumber),
    offender: matches[0].offender,
  };
}

/**
 * Append a row to a specific tab, writing only the given column→value pairs.
 * Finds the first empty row by scanning the offender column (default B).
 */
export async function appendRowToTab(
  tabName,
  columnValues,
  scanColumn = "B",
  firstDataRow = 5
) {
  const spreadsheetId = process.env.SPREADSHEET_ID;

  if (!spreadsheetId) {
    throw new Error("SPREADSHEET_ID is not set in .env");
  }

  const sheets = getSheets();

  let rows;

  try {
    const { data } = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: range(tabName, `${scanColumn}${firstDataRow}:${scanColumn}`),
    });
    rows = data.values ?? [];
  } catch (err) {
    throw new Error(
      `Could not read tab "${tabName}". Make sure that tab exists. (${err.message})`
    );
  }

  let nextRow = rows.length + firstDataRow;

  for (let i = 0; i < rows.length; i++) {
    if (!String(rows[i]?.[0] ?? "").trim()) {
      nextRow = i + firstDataRow;
      break;
    }
  }

  const data = Object.entries(columnValues)
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .map(([column, value]) => ({
      range: range(tabName, `${column}${nextRow}`),
      values: [[value]],
    }));

  if (data.length) {
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId,
      requestBody: {
        valueInputOption: "USER_ENTERED",
        data,
      },
    });
  }

  return nextRow;
}

/**
 * Find every row on a tab whose scan column matches `value` (case-insensitive).
 * Returns row numbers (1-based). Data is assumed to start at `firstDataRow`.
 */
export async function findRowsByColumnValue(
  tabName,
  value,
  scanColumn = "B",
  firstDataRow = 5
) {
  const spreadsheetId = process.env.SPREADSHEET_ID;

  if (!spreadsheetId) {
    throw new Error("SPREADSHEET_ID is not set in .env");
  }

  const target = normalizeUsername(value);

  if (!target) {
    return [];
  }

  const sheets = getSheets();
  let rows;

  try {
    const { data } = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: range(tabName, `${scanColumn}${firstDataRow}:${scanColumn}`),
    });
    rows = data.values ?? [];
  } catch (err) {
    throw new Error(
      `Could not read tab "${tabName}". Make sure that tab exists. (${err.message})`
    );
  }

  const matches = [];

  for (let i = 0; i < rows.length; i++) {
    if (normalizeUsername(rows[i]?.[0]) === target) {
      matches.push(i + firstDataRow);
    }
  }

  return matches;
}

/**
 * Delete every row on a tab whose scan column matches `value`.
 * Deletes from the bottom up so row indices stay valid. Returns deleted count.
 */
export async function deleteRowsByColumnValue(
  tabName,
  value,
  scanColumn = "B",
  firstDataRow = 5
) {
  const rowNumbers = await findRowsByColumnValue(
    tabName,
    value,
    scanColumn,
    firstDataRow
  );

  if (!rowNumbers.length) {
    return 0;
  }

  const spreadsheetId = process.env.SPREADSHEET_ID;
  const sheets = getSheets();
  const sheetId = await getSheetId(sheets, spreadsheetId, tabName);

  const requests = rowNumbers
    .sort((a, b) => b - a)
    .map((rowNumber) => ({
      deleteDimension: {
        range: {
          sheetId,
          dimension: "ROWS",
          startIndex: rowNumber - 1,
          endIndex: rowNumber,
        },
      },
    }));

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: { requests },
  });

  return rowNumbers.length;
}

/** Write a single cell on a specific tab (by column letter). */
export async function writeCellOnTab(tabName, rowNumber, column, value) {
  const spreadsheetId = process.env.SPREADSHEET_ID;

  if (!spreadsheetId) {
    throw new Error("SPREADSHEET_ID is not set in .env");
  }

  const sheets = getSheets();

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: range(tabName, `${column}${rowNumber}`),
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [[value]] },
  });
}

export async function writeFieldOnRow(sheetName, rowNumber, fieldName, value) {
  const spreadsheetId = process.env.SPREADSHEET_ID;

  if (!spreadsheetId) {
    throw new Error("SPREADSHEET_ID is not set in .env");
  }

  const sheets = getSheets();
  const layout = await getSheetLayout(sheets, spreadsheetId, sheetName);
  const colIndex = layout.fieldColumnIndex[fieldName];

  if (colIndex === undefined) {
    throw new Error(`Sheet column not found for field: ${fieldName}`);
  }

  const column = indexToColumn(colIndex);

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: range(sheetName, `${column}${rowNumber}`),
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [[value]] },
  });
}
