/** Date and time parts for display and sheet storage. */
export function splitDateAndTime(date = new Date()) {
  return {
    date: date.toLocaleString("en-US", { dateStyle: "medium" }),
    time: date.toLocaleString("en-US", { timeStyle: "short" }),
  };
}

/** Single line for Google Sheets (date and time on one row). */
export function formatSubmissionTimestamp(date = new Date()) {
  const { date: day, time } = splitDateAndTime(date);
  return `${day}, ${time}`;
}

/** Two lines for the Discord citation slip only. */
export function formatSubmissionTimestampDisplay(date = new Date()) {
  const { date: day, time } = splitDateAndTime(date);
  return `${day}\n${time}`;
}

/** Normalize user input before saving to Google Sheets. Keeps all characters. */
export function normalizeInput(value) {
  if (value == null) {
    return "";
  }

  return String(value)
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim();
}

/** Escape only what would break Discord code blocks in the UI. */
export function sanitizeForDisplay(value) {
  return normalizeInput(value).replace(/```/g, "'''");
}

export function formatAmountForDisplay(rawValue) {
  const safe = sanitizeForDisplay(rawValue);
  if (!safe) {
    return "—";
  }

  const numeric = safe.replace(/[$,\s]/g, "");
  if (numeric && !Number.isNaN(Number(numeric))) {
    return `$${Number(numeric).toFixed(2)}`;
  }

  return safe;
}

export function formatFieldForDisplay(field, rawValue) {
  const safe = sanitizeForDisplay(rawValue);
  if (!safe) {
    return "—";
  }

  if (field.name === "amount_owed") {
    return formatAmountForDisplay(rawValue);
  }

  return safe;
}

/** Build a Google Sheets HYPERLINK formula that displays as clickable text. */
export function buildSheetHyperlink(url, label = "link") {
  const safeUrl = String(url ?? "").replace(/"/g, '""');
  const safeLabel = String(label ?? "link").replace(/"/g, '""');
  return `=HYPERLINK("${safeUrl}","${safeLabel}")`;
}
