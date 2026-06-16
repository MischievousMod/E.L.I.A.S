import { resolveOutstandingCitationsChannel } from "./channels.js";
import {
  deleteCitationLogMessages,
  extractCitationUsername,
  findCitationLogMessages,
  isOutstandingCitationLog,
  messageText,
  parseOutstandingCitationFromMessage,
} from "./citation-log.js";
import {
  fetchDiscordMessage,
  parseDiscordMessageUrl,
  resolveDiscordMessageUrl,
} from "./discord-message.js";
import { normalizeUsernameKey } from "./format.js";

async function deleteCitationDiscordMessage(client, messageLink) {
  try {
    const message = await fetchDiscordMessage(client, messageLink);

    if (!message) {
      return { deleted: false, reason: "Invalid or unreadable citation link." };
    }

    await message.delete();
    return { deleted: true, messageId: message.id };
  } catch (err) {
    return { deleted: false, reason: err.message };
  }
}

async function collectChannelsToSearch(client, interaction, messageLink) {
  const channels = [];

  if (interaction.channel?.isTextBased()) {
    channels.push(interaction.channel);
  }

  const parsed = parseDiscordMessageUrl(resolveDiscordMessageUrl(messageLink));

  if (parsed) {
    try {
      const linkChannel = await client.channels.fetch(parsed.channelId);

      if (
        linkChannel?.isTextBased() &&
        !channels.some((channel) => channel.id === linkChannel.id)
      ) {
        channels.push(linkChannel);
      }
    } catch (err) {
      console.warn("Could not open citation link channel:", err.message);
    }
  }

  return channels;
}

export async function gatherCitationLogMessages(
  client,
  interaction,
  username,
  messageLinks = []
) {
  const botUserId = client.user.id;
  const target = normalizeUsernameKey(username);
  const found = [];
  const seen = new Set();
  const links = (Array.isArray(messageLinks) ? messageLinks : [messageLinks])
    .map((link) => resolveDiscordMessageUrl(link))
    .filter(Boolean);

  const tryAdd = (message) => {
    if (!message || seen.has(message.id)) {
      return;
    }

    if (!isOutstandingCitationLog(message, botUserId)) {
      return;
    }

    const parsed = parseOutstandingCitationFromMessage(message);
    const cited =
      parsed?.offender || extractCitationUsername(messageText(message));

    if (normalizeUsernameKey(cited) !== target) {
      return;
    }

    seen.add(message.id);
    found.push(message);
  };

  for (const messageLink of links) {
    try {
      const message = await fetchDiscordMessage(client, messageLink);
      tryAdd(message);
    } catch (err) {
      console.warn("Could not fetch citation link message:", err.message);
    }
  }

  const channels = [];

  if (interaction.guild) {
    const outstandingChannel = await resolveOutstandingCitationsChannel(
      interaction.guild
    );

    if (outstandingChannel?.isTextBased()) {
      channels.push(outstandingChannel);
    }
  }

  for (const channel of await collectChannelsToSearch(
    client,
    interaction,
    links[0] ?? ""
  )) {
    if (!channels.some((entry) => entry.id === channel.id)) {
      channels.push(channel);
    }
  }

  for (const channel of channels) {
    const logs = await findCitationLogMessages(channel, username, botUserId);

    for (const message of logs) {
      tryAdd(message);
    }
  }

  return found;
}

export async function deleteGatheredCitationLogs(
  client,
  messageLinks,
  messages
) {
  const links = (Array.isArray(messageLinks) ? messageLinks : [messageLinks])
    .map((link) => String(link ?? "").trim())
    .filter(Boolean);
  const skipIds = new Set();
  let deletedCount = 0;

  for (const messageLink of links) {
    const linkResult = await deleteCitationDiscordMessage(client, messageLink);

    if (linkResult.deleted && linkResult.messageId) {
      skipIds.add(linkResult.messageId);
      deletedCount++;
    }
  }

  const toDelete = messages.filter((message) => !skipIds.has(message.id));

  if (toDelete.length) {
    const { deleted, failed } = await deleteCitationLogMessages(toDelete);
    deletedCount += deleted.length;

    for (const entry of failed) {
      console.warn(
        `Could not delete citation log ${entry.id}:`,
        entry.reason
      );
    }
  }

  return deletedCount;
}
