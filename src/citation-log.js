import { commandFields, fieldDefinitions } from "./config.js";
import {
  formatFieldForDisplay,
  formatSubmissionTimestampDisplay,
  normalizeInput,
  sanitizeForDisplay,
  splitDateAndTime,
} from "./format.js";
import { buildOfficialLogPayload, LOG_EMBED_COLOR } from "./log-render.js";

const CITATION_MARKER = "OUTSTANDING CITATION";
export const OUTSTANDING_TITLE = "OUTSTANDING CITATION — OFFICIAL RECORD";
export const OUTSTANDING_COLOR = LOG_EMBED_COLOR;
export const SUCCESS_FOOTER = "Issued by the Ethics Committee - Official database";
const ERROR_FOOTER = "Issued by the Ethics Committee - Filing unsuccessful";

function normalizeFieldName(name) {
  return String(name ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function collectEmbedFieldMap(message) {
  const map = new Map();

  for (const embed of message.embeds ?? []) {
    for (const field of embed.fields ?? []) {
      const key = normalizeFieldName(field.name);
      const existing = map.get(key);

      if (existing) {
        map.set(key, `${existing}\n${field.value ?? ""}`);
      } else {
        map.set(key, field.value ?? "");
      }
    }
  }

  return map;
}

function fieldFromMap(map, ...aliases) {
  for (const alias of aliases) {
    const value = map.get(normalizeFieldName(alias));

    if (String(value ?? "").trim()) {
      return normalizeInput(value);
    }
  }

  return "";
}

function normalizeUsername(value) {
  return normalizeInput(value).toLowerCase();
}

function citationBody(text) {
  return String(text ?? "").replace(/```/g, "");
}

/** Labels that appear on outstanding / paid citation slips (for continuation detection). */
const CITATION_LABELS = [
  "OFFENDER",
  "USERNAME",
  "RANK",
  "INFRACTIONS",
  "AMOUNT OWED",
  "START DATE",
  "FINE MESSAGE",
  "STATUS",
  "FILED",
  "EXECUTOR",
  "OFFICER",
  "REF NO.",
];

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isCitationLabelLine(line) {
  const trimmed = line.trimStart();

  for (const label of CITATION_LABELS) {
    const re = new RegExp(`^${escapeRegExp(label)}\\s+\\S`, "i");

    if (re.test(trimmed)) {
      return true;
    }
  }

  return false;
}

/**
 * Read a label and all indented continuation lines (wrapped values in the slip).
 * Single-line labels still work the same way.
 */
export function readCitationLabelBlock(text, label) {
  const lines = citationBody(text).split("\n");
  const escaped = escapeRegExp(label);
  const labelUpper = label.toUpperCase();

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();

    const inline = trimmed.match(new RegExp(`^${escaped}\\s+(.+)$`, "i"));

    if (inline) {
      return readCitationLabelInline(lines, i, inline[1].trimEnd());
    }

    if (trimmed.toUpperCase() === labelUpper) {
      return readCitationLabelStacked(lines, i + 1);
    }
  }

  return "";
}

/** Legacy side-by-side: value starts on the same line as the label. */
function readCitationLabelInline(lines, startIdx, firstValue) {
  const parts = firstValue ? [firstValue] : [];

  for (let i = startIdx + 1; i < lines.length; i++) {
    const line = lines[i];

    if (!line.trim()) {
      continue;
    }

    if (line.startsWith("────────")) {
      break;
    }

    const trimmed = line.trimStart();

    if (isCitationLabelLine(trimmed)) {
      break;
    }

    parts.push(trimmed);
  }

  return normalizeInput(parts.join("\n"));
}

/** Stacked layout: label line, then value lines until the next label. */
function readCitationLabelStacked(lines, startIdx) {
  const parts = [];

  for (let i = startIdx; i < lines.length; i++) {
    const line = lines[i];

    if (!line.trim()) {
      continue;
    }

    if (line.startsWith("────────")) {
      break;
    }

    const trimmed = line.trim();

    if (isCitationLabelLine(trimmed)) {
      break;
    }

    parts.push(trimmed);
  }

  return normalizeInput(parts.join("\n"));
}

function readCitationLabel(text, label) {
  return readCitationLabelBlock(text, label);
}

/** Executor from embed fields or legacy slip text. */
export function extractExecutorFromMessage(message) {
  const map = collectEmbedFieldMap(message);
  const fromEmbed = fieldFromMap(
    map,
    "executor",
    "officer",
    "processed by"
  );

  if (fromEmbed) {
    return fromEmbed;
  }

  const body = messageText(message).replace(/```/g, "");

  for (const label of ["EXECUTOR", "OFFICER", "PROCESSED BY"]) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = body.match(new RegExp(`^${escaped}\\s+(.+)$`, "im"));

    if (match) {
      return normalizeInput(match[1]);
    }
  }

  return "";
}

/** Offender from the OFFENDER row inside a citation code block (legacy: USERNAME). */
export function extractCitationOffender(text) {
  return (
    readCitationLabel(text, "OFFENDER") || readCitationLabel(text, "USERNAME")
  );
}

/** @deprecated Use extractCitationOffender */
export function extractCitationUsername(text) {
  return extractCitationOffender(text);
}

/** Parse fields from an outstanding citation Discord embed (legacy code-block text). */
export function parseOutstandingCitationText(text) {
  return {
    offender: extractCitationOffender(text),
    rank: readCitationLabelBlock(text, "RANK"),
    infractions: readCitationLabelBlock(text, "INFRACTIONS"),
    amountOwed: readCitationLabelBlock(text, "AMOUNT OWED"),
    fineMessage: readCitationLabelBlock(text, "FINE MESSAGE"),
    startDate: readCitationLabelBlock(text, "START DATE"),
    status: readCitationLabel(text, "STATUS"),
    officer:
      readCitationLabelBlock(text, "EXECUTOR") ||
      readCitationLabelBlock(text, "OFFICER"),
    refNo: readCitationLabel(text, "REF NO."),
  };
}

/** Parse a citation log message that uses embed fields (current UI). */
export function parseOutstandingCitationFromEmbeds(message) {
  const map = collectEmbedFieldMap(message);

  if (!map.size) {
    return null;
  }

  const offender = fieldFromMap(map, "offender", "username");

  if (!offender && !fieldFromMap(map, "infractions")) {
    return null;
  }

  return {
    offender,
    rank: fieldFromMap(map, "rank"),
    infractions: fieldFromMap(map, "infractions", "codes broken"),
    amountOwed: fieldFromMap(map, "amount owed", "amount paid"),
    fineMessage: fieldFromMap(map, "fine message"),
    startDate: fieldFromMap(map, "start date", "filed"),
    status: fieldFromMap(map, "status"),
    officer: fieldFromMap(map, "executor", "officer", "processed by"),
    refNo: fieldFromMap(map, "ref no.", "ref no", "reference"),
  };
}

export function parseOutstandingCitationFromMessage(message) {
  return (
    parseOutstandingCitationFromEmbeds(message) ??
    parseOutstandingCitationText(messageText(message))
  );
}

/** Official embed log for a newly filed outstanding citation. */
export function buildOutstandingCitationReply({
  officer,
  refId,
  values,
  submittedAt,
  evidenceItems = [],
  fineMessage = "",
}) {
  const filedAt = splitDateAndTime(new Date());
  const valueByName = {};

  fieldDefinitions.forEach((field, index) => {
    valueByName[field.name] = values[index];
  });

  const fields = [];

  for (const field of commandFields) {
    fields.push({
      name: field.label,
      value: formatFieldForDisplay(field, valueByName[field.name]),
      inline: field.name === "rank" || field.name === "amount_owed",
    });

    if (field.name === "amount_owed" && fineMessage) {
      fields.push({
        name: "Fine message",
        value: sanitizeForDisplay(fineMessage),
      });
    }
  }

  fields.push({
    name: "Start date",
    value: formatSubmissionTimestampDisplay(submittedAt),
    inline: true,
  });
  fields.push({ name: "Status", value: "RECORDED", inline: true });
  fields.push({
    name: "Filed",
    value: `${filedAt.date}\n${filedAt.time}`,
    inline: true,
  });
  fields.push({
    name: "Executor",
    value: sanitizeForDisplay(officer),
    inline: true,
  });
  fields.push({ name: "Ref No.", value: refId, inline: true });

  return buildOfficialLogPayload({
    title: OUTSTANDING_TITLE,
    color: OUTSTANDING_COLOR,
    footer: SUCCESS_FOOTER,
    fields,
    evidenceItems,
  });
}

export function buildCitationErrorReply(message) {
  return buildOfficialLogPayload({
    title: "CITATION FILING — ERROR",
    color: LOG_EMBED_COLOR,
    footer: ERROR_FOOTER,
    fields: [
      { name: "Details", value: message },
      {
        name: "Action",
        value: "Retry the command or contact an administrator.",
      },
    ],
  });
}

export function messageText(message) {
  const parts = [];

  if (message.content) {
    parts.push(message.content);
  }

  for (const embed of message.embeds) {
    if (embed.title) {
      parts.push(embed.title);
    }

    if (embed.description) {
      parts.push(embed.description);
    }

    for (const field of embed.fields ?? []) {
      parts.push(`${field.name}\n${field.value}`);
    }

    if (embed.footer?.text) {
      parts.push(embed.footer.text);
    }
  }

  return parts.join("\n");
}

function embedTitleMatchesOutstanding(title) {
  return String(title ?? "").toUpperCase().includes(CITATION_MARKER);
}

export function isOutstandingCitationLog(message, botUserId) {
  if (botUserId && message.author.id !== botUserId) {
    return false;
  }

  for (const embed of message.embeds) {
    if (!embedTitleMatchesOutstanding(embed.title)) {
      continue;
    }

    const footerOk = embed.footer?.text === SUCCESS_FOOTER;
    const map = collectEmbedFieldMap(message);
    const offender = fieldFromMap(map, "offender", "username");

    if (footerOk && offender) {
      return true;
    }
  }

  const text = messageText(message);

  if (!text.includes(CITATION_MARKER)) {
    return false;
  }

  const footerOk =
    message.embeds.some((embed) => embed.footer?.text === SUCCESS_FOOTER) ||
    text.includes(SUCCESS_FOOTER);

  return footerOk && Boolean(extractCitationUsername(text));
}

export function citationLogMatchesUsername(message, username, botUserId) {
  if (!isOutstandingCitationLog(message, botUserId)) {
    return false;
  }

  const parsed = parseOutstandingCitationFromMessage(message);
  const cited =
    parsed?.offender || extractCitationUsername(messageText(message));
  return normalizeUsername(cited) === normalizeUsername(username);
}

/** Scan recent channel messages for outstanding citation logs for this username. */
export async function findCitationLogMessages(
  channel,
  username,
  botUserId,
  { maxScan = 500 } = {}
) {
  const matches = [];
  let before;
  let scanned = 0;

  while (scanned < maxScan) {
    const limit = Math.min(100, maxScan - scanned);
    const options = { limit };

    if (before) {
      options.before = before;
    }

    const batch = await channel.messages.fetch(options);

    if (!batch.size) {
      break;
    }

    for (const message of batch.values()) {
      scanned++;

      if (citationLogMatchesUsername(message, username, botUserId)) {
        matches.push(message);
      }
    }

    const oldest = batch.last();

    if (!oldest) {
      break;
    }

    before = oldest.id;

    if (batch.size < limit) {
      break;
    }
  }

  return matches;
}

export async function deleteCitationLogMessages(messages) {
  const deleted = [];
  const failed = [];

  for (const message of messages) {
    try {
      await message.delete();
      deleted.push(message.id);
    } catch (err) {
      failed.push({ id: message.id, reason: err.message });
    }
  }

  return { deleted, failed };
}
