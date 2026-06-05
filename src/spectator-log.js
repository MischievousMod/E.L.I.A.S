import { sanitizeForDisplay } from "./format.js";
import { buildOfficialLogPayload } from "./log-render.js";

const SPECTATOR_COLOR = 0x2e7d32;
const SPECTATOR_FOOTER = "Spectator log - Official database";

export function buildSpectatorReply({
  username,
  rank,
  comments,
  officer,
  refId,
  filedAt,
  images = [],
}) {
  return buildOfficialLogPayload({
    title: "SPECTATOR LOG — OFFICIAL RECORD",
    color: SPECTATOR_COLOR,
    footer: SPECTATOR_FOOTER,
    fields: [
      { name: "Username", value: username, inline: true },
      { name: "Rank", value: rank, inline: true },
      {
        name: "Filed",
        value: `${filedAt.date}\n${filedAt.time}`,
        inline: true,
      },
      { name: "Executor", value: sanitizeForDisplay(officer), inline: true },
      { name: "Ref No.", value: refId, inline: true },
    ],
    sections: [{ title: "Comments", body: comments }],
    evidenceItems: images,
  });
}
