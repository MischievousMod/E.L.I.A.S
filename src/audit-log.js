import { sanitizeForDisplay } from "./format.js";
import { resolvePointsLogChannel } from "./channels.js";

/**
 * Post a command audit line to #points-log (same channel as 💻 authorizations).
 */
export async function postCommandAudit(
  guild,
  {
    action,
    actor,
    executor,
    subject = "",
    links = [],
    note = "",
  }
) {
  if (!guild) {
    return false;
  }

  try {
    const channel = await resolvePointsLogChannel(guild);

    if (!channel) {
      return false;
    }

    const actorLabel = actor?.username
      ? `**${sanitizeForDisplay(actor.username)}**`
      : "Someone";
    const executorPart = executor
      ? ` · Executor: **${sanitizeForDisplay(executor)}**`
      : "";
    const subjectPart = subject
      ? ` for **${sanitizeForDisplay(subject)}**`
      : "";
    const linkPart = links.filter(Boolean).join(" ");
    const notePart = note ? `\n_${sanitizeForDisplay(note)}_` : "";

    await channel.send({
      content: `📋 ${actorLabel} ran **${action}**${subjectPart}${executorPart}${linkPart ? ` ${linkPart}` : ""}${notePart}`,
    });

    return true;
  } catch (err) {
    console.warn("Could not post command audit log:", err.message);
    return false;
  }
}
