/**
 * In-memory fake of the subset of the Google Sheets API our code uses.
 * Lets the stress test exercise real command logic without touching live sheets.
 */

function colToIndex(col) {
  let n = 0;
  for (const ch of col.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

export function indexToCol(index) {
  let n = index + 1;
  let s = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function parseA1(range) {
  const bang = range.indexOf("!");
  const tab = range.slice(0, bang).replace(/^'/, "").replace(/'$/, "").replace(/''/g, "'");
  const a1 = range.slice(bang + 1);
  const [start, end] = a1.split(":");

  const parse = (token) => {
    const m = String(token ?? "").match(/^([A-Za-z]*)(\d*)$/);
    return {
      col: m && m[1] ? colToIndex(m[1]) : null,
      row: m && m[2] ? Number(m[2]) - 1 : null,
    };
  };

  const s = parse(start);
  const e = end != null ? parse(end) : s;
  return { tab, startCol: s.col, startRow: s.row, endCol: e.col, endRow: e.row };
}

export function createMockSheets(initial = {}) {
  /** store[spreadsheetId] = { nextId, tabs: Map<title,{sheetId, grid}> } */
  const store = {};

  const ensureBook = (id) => {
    if (!store[id]) store[id] = { nextId: 1, tabs: new Map() };
    return store[id];
  };
  const ensureTab = (id, title) => {
    const book = ensureBook(id);
    if (!book.tabs.has(title)) book.tabs.set(title, { sheetId: book.nextId++, grid: [] });
    return book.tabs.get(title);
  };
  const cell = (grid, r, c) => (grid[r] && grid[r][c] != null ? grid[r][c] : "");
  const setCell = (grid, r, c, v) => {
    while (grid.length <= r) grid.push([]);
    while (grid[r].length <= c) grid[r].push("");
    grid[r][c] = v;
  };

  for (const [id, tabs] of Object.entries(initial)) {
    for (const [title, rows] of Object.entries(tabs)) {
      const t = ensureTab(id, title);
      t.grid = rows.map((r) => [...r]);
    }
  }

  const readRange = (id, range) => {
    const { tab, startCol, startRow, endCol, endRow } = parseA1(range);
    const t = ensureTab(id, tab);
    const grid = t.grid;
    const lastRowWithData = grid.length;
    const r0 = startRow ?? 0;
    const r1 = endRow != null ? endRow : lastRowWithData - 1;
    const c0 = startCol ?? 0;
    const maxCols = Math.max(0, ...grid.map((row) => row.length));
    const c1 = endCol != null ? endCol : maxCols - 1;

    const out = [];
    for (let r = r0; r <= r1; r++) {
      const row = [];
      for (let c = c0; c <= c1; c++) row.push(cell(grid, r, c));
      out.push(row);
    }
    // Mimic Sheets: trim fully-trailing empty rows.
    while (out.length && out[out.length - 1].every((v) => String(v ?? "") === "")) out.pop();
    return out;
  };

  const writeRange = (id, range, values) => {
    const { tab, startCol, startRow } = parseA1(range);
    const t = ensureTab(id, tab);
    const r0 = startRow ?? 0;
    const c0 = startCol ?? 0;
    values.forEach((row, i) =>
      row.forEach((v, j) => setCell(t.grid, r0 + i, c0 + j, v))
    );
  };

  const tabBySheetId = (id, sheetId) => {
    for (const [title, t] of ensureBook(id).tabs) if (t.sheetId === sheetId) return { title, t };
    return null;
  };

  const spreadsheets = {
    get: async ({ spreadsheetId, fields }) => {
      const book = ensureBook(spreadsheetId);
      return {
        data: {
          sheets: [...book.tabs.entries()].map(([title, t]) => ({
            properties: {
              title,
              sheetId: t.sheetId,
              gridProperties: { rowCount: 1000, columnCount: 26 },
            },
          })),
        },
      };
    },
    batchUpdate: async ({ spreadsheetId, requestBody }) => {
      for (const req of requestBody.requests ?? []) {
        if (req.addSheet) {
          ensureTab(spreadsheetId, req.addSheet.properties.title);
        } else if (req.deleteDimension) {
          const { sheetId, startIndex, endIndex } = req.deleteDimension.range;
          const found = tabBySheetId(spreadsheetId, sheetId);
          if (found) found.t.grid.splice(startIndex, endIndex - startIndex);
        } else if (req.repeatCell) {
          const { range, cell: c } = req.repeatCell;
          const found = tabBySheetId(spreadsheetId, range.sheetId);
          if (found) {
            const v = c.userEnteredValue;
            const val = v.boolValue != null ? v.boolValue : v.stringValue ?? v.numberValue ?? "";
            for (let r = range.startRowIndex; r < range.endRowIndex; r++)
              for (let col = range.startColumnIndex; col < range.endColumnIndex; col++)
                setCell(found.t.grid, r, col, val);
          }
        }
      }
      return { data: {} };
    },
    values: {
      get: async ({ spreadsheetId, range }) => ({ data: { values: readRange(spreadsheetId, range) } }),
      update: async ({ spreadsheetId, range, requestBody }) => {
        writeRange(spreadsheetId, range, requestBody.values);
        return { data: {} };
      },
      batchUpdate: async ({ spreadsheetId, requestBody }) => {
        for (const d of requestBody.data ?? []) writeRange(spreadsheetId, d.range, d.values);
        return { data: {} };
      },
    },
  };

  return {
    client: { spreadsheets },
    dump: (id, title) => ensureBook(id).tabs.get(title)?.grid ?? [],
    book: store,
  };
}
