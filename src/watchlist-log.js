import { sanitizeForDisplay } from "./format.js";
import { buildOfficialLogPayload, LOG_EMBED_COLOR } from "./log-render.js";

const WATCHLIST_FOOTER = "Watchlist log - Official database";

export function buildWatchlistReply({
  username,
  duration,
  reason,
  officer,
  refId,
  filedAt,
  evidenceItems = [],
}) {
  return buildOfficialLogPayload({
    title: "WATCHLIST LOG — OFFICIAL RECORD",
    color: LOG_EMBED_COLOR,
    footer: WATCHLIST_FOOTER,
    fields: [
      { name: "Username", value: username, inline: true },
      { name: "Duration", value: duration, inline: true },
      {
        name: "Filed",
        value: `${filedAt.date}\n${filedAt.time}`,
        inline: true,
      },
      { name: "Executor", value: sanitizeForDisplay(officer), inline: true },
      { name: "Ref No.", value: refId, inline: true },
    ],
    sections: [{ title: "Reason", body: reason }],
    evidenceItems,
  });
}
