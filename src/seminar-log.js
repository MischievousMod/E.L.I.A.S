import { sanitizeForDisplay } from "./format.js";
import { buildOfficialLogPayload, LOG_EMBED_COLOR } from "./log-render.js";
const SEMINAR_FOOTER = "Seminar log - Official database";

export function buildSeminarReply({
  username,
  host,
  seminarType,
  officer,
  refId,
  filedAt,
  images = [],
}) {
  return buildOfficialLogPayload({
    title: "SEMINAR LOG — OFFICIAL RECORD",
    color: LOG_EMBED_COLOR,
    footer: SEMINAR_FOOTER,
    fields: [
      { name: "Username", value: username, inline: true },
      { name: "Host", value: host, inline: true },
      { name: "Seminar type", value: seminarType },
      {
        name: "Filed",
        value: `${filedAt.date}\n${filedAt.time}`,
        inline: true,
      },
      { name: "Executor", value: sanitizeForDisplay(officer), inline: true },
      { name: "Ref No.", value: refId, inline: true },
    ],
    evidenceItems: images,
  });
}
