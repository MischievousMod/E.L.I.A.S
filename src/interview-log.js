import { sanitizeForDisplay } from "./format.js";
import { buildOfficialLogPayload } from "./log-render.js";

const INTERVIEW_COLOR = 0x6a1b9a;
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
    color: INTERVIEW_COLOR,
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
