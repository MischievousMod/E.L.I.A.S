import { sanitizeForDisplay } from "./format.js";
import { buildOfficialLogPayload, LOG_EMBED_COLOR } from "./log-render.js";

const INVESTIGATION_FOOTER = "Investigation log - Official database";

export function buildInvestigationReply({
  username,
  documentLink,
  verdict,
  officer,
  refId,
  filedAt,
}) {
  return buildOfficialLogPayload({
    title: "INVESTIGATION LOG — OFFICIAL RECORD",
    color: LOG_EMBED_COLOR,
    footer: INVESTIGATION_FOOTER,
    fields: [
      { name: "Username", value: username, inline: true },
      {
        name: "Document",
        value: documentLink,
        inline: false,
      },
      { name: "Verdict", value: verdict, inline: false },
      {
        name: "Filed",
        value: `${filedAt.date}\n${filedAt.time}`,
        inline: true,
      },
      { name: "Executor", value: sanitizeForDisplay(officer), inline: true },
      { name: "Ref No.", value: refId, inline: true },
    ],
  });
}

/** Short /investigation log (interrogation form + evidence). */
export function buildShortInvestigationReply({
  username,
  interrogation,
  verdict,
  comments,
  officer,
  refId,
  filedAt,
  evidenceItems = [],
}) {
  return buildOfficialLogPayload({
    title: "INVESTIGATION LOG — OFFICIAL RECORD",
    color: LOG_EMBED_COLOR,
    footer: INVESTIGATION_FOOTER,
    fields: [
      { name: "Username", value: username, inline: true },
      { name: "Verdict", value: verdict, inline: true },
      {
        name: "Filed",
        value: `${filedAt.date}\n${filedAt.time}`,
        inline: true,
      },
      { name: "Executor", value: sanitizeForDisplay(officer), inline: true },
      { name: "Ref No.", value: refId, inline: true },
    ],
    sections: [
      { title: "Interrogation", body: interrogation },
      { title: "Comments", body: comments },
    ],
    evidenceItems,
  });
}
