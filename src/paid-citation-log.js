import {
  formatAmountForDisplay,
  sanitizeForDisplay,
  splitDateAndTime,
} from "./format.js";
import {
  isManualOutstandingCitation,
  parseOutstandingCitationFromMessage,
} from "./citation-log.js";
import { resolveOfficerNameFromAuthor } from "./registry.js";
import { buildOfficialLogPayload, LOG_EMBED_COLOR } from "./log-render.js";

export const PAID_FOOTER = "Issued by the Ethics Committee - Citation archive";
export const PAID_COLOR = LOG_EMBED_COLOR;

export function mergeCitationRecord({
  sheetFields,
  discordParsed,
  usernameFallback,
}) {
  const sheet = sheetFields ?? {};

  const sheetInfractions = String(sheet.infractions ?? "").trim();
  const sheetAmount = String(sheet.amount_owed ?? "").trim();

  return {
    offender:
      discordParsed?.offender ||
      sheet.offender ||
      usernameFallback ||
      "—",
    infractions:
      sheetInfractions || discordParsed?.infractions || "—",
    amountPaid: sheetAmount || discordParsed?.amountOwed || "—",
    fineMessage: discordParsed?.fineMessage || "",
    officer: discordParsed?.officer || "",
    refNo: discordParsed?.refNo || "",
  };
}

export async function parseCitationFromDiscordMessage(message) {
  const parsed = parseOutstandingCitationFromMessage(message);

  if (!parsed) {
    return parsed;
  }

  if (isManualOutstandingCitation(message) && !parsed.officer) {
    parsed.officer = await resolveOfficerNameFromAuthor(message);
  }

  return parsed;
}

export function buildPaidCitationReply({
  record,
  processedBy,
  paidAt,
  refId,
  evidenceItems = [],
}) {
  const filedAt = splitDateAndTime(paidAt ?? new Date());
  const amountDisplay = formatAmountForDisplay(record.amountPaid);
  const fineMessage = sanitizeForDisplay(record.fineMessage) || "—";

  return buildOfficialLogPayload({
    title: "CITATION LOG — OFFICIAL RECORD",
    color: PAID_COLOR,
    footer: PAID_FOOTER,
    fields: [
      { name: "Offender", value: record.offender, inline: true },
      { name: "Status", value: "PAID", inline: true },
      { name: "Infractions", value: record.infractions },
      { name: "Amount paid", value: amountDisplay, inline: true },
      { name: "Fine message", value: fineMessage },
      {
        name: "Filed",
        value: `${filedAt.date}\n${filedAt.time}`,
        inline: true,
      },
      { name: "Executor", value: sanitizeForDisplay(processedBy), inline: true },
      { name: "Ref No.", value: refId, inline: true },
    ],
    evidenceItems,
    paymentOnMainCard: true,
  });
}
