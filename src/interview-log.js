import { sanitizeForDisplay } from "./format.js";
import { buildOfficialLogPayload, LOG_EMBED_COLOR } from "./log-render.js";
const INTERVIEW_FOOTER = "Interview log - Official database";

export function buildInterviewReply({
  username,
  questionsAnswers,
  verdict,
  comments,
  officer,
  refId,
  filedAt,
  images = [],
}) {
  return buildOfficialLogPayload({
    title: "INTERVIEW LOG — OFFICIAL RECORD",
    color: LOG_EMBED_COLOR,
    footer: INTERVIEW_FOOTER,
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
      { title: "Questions & answers", body: questionsAnswers },
      { title: "Comments", body: comments },
    ],
    evidenceItems: images,
  });
}
