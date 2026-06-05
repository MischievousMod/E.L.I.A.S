const LABEL_WIDTH = 14;

/**
 * Target total line width for a slip (monospace). Discord renders embed code
 * blocks in a fairly narrow column (~42 chars before it soft-wraps), so we
 * pre-wrap a touch under that so our own hanging indent always controls the
 * layout and value text never spills back under the labels.
 */
export const SLIP_TARGET_WIDTH = 44;
/** When the slip shares a card with an image gallery, the text column is narrower. */
export const SLIP_TARGET_WIDTH_WITH_IMAGES = 34;

/**
 * Greedy word-wrap to `width` characters. Words longer than the width are
 * hard-split (e.g. long URLs) so a single token can never overflow the column.
 */
function wrapText(text, width) {
  const safeWidth = Math.max(1, width);
  const out = [];
  let line = "";

  const hardSplit = (word) => {
    let rest = word;
    while (rest.length > safeWidth) {
      out.push(rest.slice(0, safeWidth));
      rest = rest.slice(safeWidth);
    }
    return rest;
  };

  for (const word of String(text).split(/\s+/)) {
    if (!word) {
      continue;
    }

    if (!line) {
      line = word.length > safeWidth ? hardSplit(word) : word;
    } else if (line.length + 1 + word.length <= safeWidth) {
      line += ` ${word}`;
    } else {
      out.push(line);
      line = word.length > safeWidth ? hardSplit(word) : word;
    }
  }

  if (line) {
    out.push(line);
  }

  return out.length ? out : [""];
}

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

/**
 * Label on its own line, value underneath (stacked). Copy-paste from Discord
 * stays readable — no padding spaces or single-word line breaks from a narrow
 * side-by-side column.
 */
export function formatLabelBlock(label, value, _labelWidth, valueWidth) {
  const rawLines = String(value ?? "")
    .split("\n")
    .map((line) => sanitizeForDisplay(line))
    .filter((line, index, all) => line.length > 0 || index === 0 || all.length === 1);

  const wrapped = [];
  for (const line of rawLines) {
    if (!line) {
      wrapped.push("");
      continue;
    }
    wrapped.push(...wrapText(line, valueWidth));
  }

  if (!wrapped.length || (wrapped.length === 1 && wrapped[0] === "")) {
    return `${label}\n—`;
  }

  return `${label}\n${wrapped.join("\n")}`;
}

/**
 * Render a full record block.
 *
 * `entries` is an array where each item is either:
 *   - a string  → emitted as-is (headers, dividers, free-text sections), or
 *   - [label, value] → a stacked label + value block.
 */
/** Pick slip width — use the narrower cap when the message will include an image gallery. */
export function slipTargetWidth(hasImages = false) {
  return hasImages ? SLIP_TARGET_WIDTH_WITH_IMAGES : SLIP_TARGET_WIDTH;
}

export function renderRecord(
  entries,
  { targetWidth = SLIP_TARGET_WIDTH } = {}
) {
  return entries
    .map((entry) =>
      Array.isArray(entry)
        ? formatLabelBlock(entry[0], entry[1], 0, targetWidth)
        : entry
    )
    .join("\n");
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

/**
 * Discord embed descriptions allow 4096 chars. The code-block fences add a few,
 * so cap each block body comfortably under that.
 */
export const MAX_CODE_BLOCK_BODY = 3900;

export function wrapCodeBlock(text) {
  let body = text;

  if (body.length > MAX_CODE_BLOCK_BODY) {
    body = `${body.slice(0, MAX_CODE_BLOCK_BODY)}\n... (truncated for Discord)`;
  }

  return ["```", body, "```"].join("\n");
}

/**
 * Split a long block into chunks that each fit inside one code-block embed.
 * Splits on line boundaries; hard-splits any single line longer than the cap.
 */
export function splitCodeBlockChunks(text, maxBody = MAX_CODE_BLOCK_BODY) {
  const source = String(text ?? "");

  if (source.length <= maxBody) {
    return [source];
  }

  const chunks = [];
  let current = "";

  const pushCurrent = () => {
    if (current.length) {
      chunks.push(current);
      current = "";
    }
  };

  for (const rawLine of source.split("\n")) {
    let line = rawLine;

    // A single line longer than the cap is hard-split.
    while (line.length > maxBody) {
      pushCurrent();
      chunks.push(line.slice(0, maxBody));
      line = line.slice(maxBody);
    }

    const candidate = current.length ? `${current}\n${line}` : line;

    if (candidate.length > maxBody) {
      pushCurrent();
      current = line;
    } else {
      current = candidate;
    }
  }

  pushCurrent();

  return chunks.length ? chunks : [""];
}

/** Build a Google Sheets HYPERLINK formula that displays as clickable text. */
export function buildSheetHyperlink(url, label = "link") {
  const safeUrl = String(url ?? "").replace(/"/g, '""');
  const safeLabel = String(label ?? "link").replace(/"/g, '""');
  return `=HYPERLINK("${safeUrl}","${safeLabel}")`;
}
