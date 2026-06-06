import { formatAmountForDisplay, sanitizeForDisplay } from "./format.js";
import { buildOfficialLogPayload, LOG_EMBED_COLOR } from "./log-render.js";
const SENTENCE_FOOTER = "Issued by the Ethics Committee - Official database";

export function buildSentenceCitationReply({
  offender,
  codesBroken,
  amountOwed,
  rankPostInfraction,
  officer,
  refId,
  filedAt,
  evidenceItems = [],
}) {
  return buildOfficialLogPayload({
    title: "OUTSTANDING CITATION SENTENCE — OFFICIAL RECORD",
    color: LOG_EMBED_COLOR,
    footer: SENTENCE_FOOTER,
    fields: [
      { name: "Offender", value: offender, inline: true },
      { name: "Status", value: "SENTENCED", inline: true },
      { name: "Codes broken", value: codesBroken },
      {
        name: "Amount owed",
        value: formatAmountForDisplay(amountOwed),
        inline: true,
      },
      {
        name: "Rank post-infraction",
        value: rankPostInfraction,
        inline: true,
      },
      {
        name: "Filed",
        value: `${filedAt.date}\n${filedAt.time}`,
        inline: true,
      },
      { name: "Executor", value: sanitizeForDisplay(officer), inline: true },
      { name: "Ref No.", value: refId, inline: true },
    ],
    evidenceItems,
  });
}

/** Map fields from an outstanding citation log into a sentence record. */
export function sentenceDataFromOutstandingCitation(parsed, usernameFallback) {
  return {
    offender: parsed?.offender || usernameFallback || "—",
    codesBroken: parsed?.infractions || "—",
    amountOwed: parsed?.amountOwed || "—",
    rankPostInfraction: parsed?.rank || "—",
  };
}
