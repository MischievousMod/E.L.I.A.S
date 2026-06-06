import { sanitizeForDisplay } from "./format.js";
import { buildOfficialLogPayload, LOG_EMBED_COLOR } from "./log-render.js";
const CE_FOOTER = "Issued by the Ethics Committee - Official database";

export function buildCeSentenceReply({
  offender,
  codesBroken,
  classESentence,
  punishment,
  rankPostInfraction,
  authorization,
  banned,
  notes,
  officer,
  refId,
  filedAt,
  evidenceItems = [],
}) {
  const fields = [
    { name: "Offender", value: offender, inline: true },
    { name: "Status", value: "SENTENCED", inline: true },
    { name: "Codes broken", value: codesBroken },
    { name: "Class-E sentence", value: classESentence },
    { name: "Punishment", value: punishment },
  ];

  if (rankPostInfraction) {
    fields.push({
      name: "Rank post-infraction",
      value: rankPostInfraction,
      inline: true,
    });
  }

  if (authorization) {
    fields.push({ name: "Authorization", value: authorization });
  }

  if (banned) {
    fields.push({ name: "Banned", value: banned, inline: true });
  }

  if (notes) {
    fields.push({ name: "Notes", value: notes });
  }

  fields.push(
    {
      name: "Filed",
      value: `${filedAt.date}\n${filedAt.time}`,
      inline: true,
    },
    { name: "Executor", value: sanitizeForDisplay(officer), inline: true },
    { name: "Ref No.", value: refId, inline: true }
  );

  return buildOfficialLogPayload({
    title: "CLASS-E SENTENCE — OFFICIAL RECORD",
    color: LOG_EMBED_COLOR,
    footer: CE_FOOTER,
    fields,
    evidenceItems,
  });
}
