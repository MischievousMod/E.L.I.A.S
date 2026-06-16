/** Parse a Discord message URL into channel and message ids. */
export function parseDiscordMessageUrl(url) {
  const match = String(url ?? "")
    .trim()
    .match(/discord(?:app)?\.com\/channels\/(?:\d+|@me)\/(\d+)\/(\d+)/i);

  if (!match) {
    return null;
  }

  return {
    channelId: match[1],
    messageId: match[2],
  };
}

/**
 * Sheet cells store links as =HYPERLINK("https://...","link"). Extract the real URL.
 */
export function resolveDiscordMessageUrl(raw) {
  const text = String(raw ?? "").trim();

  if (!text) {
    return "";
  }

  const hyperlink = text.match(/HYPERLINK\s*\(\s*"([^"]+)"/i);

  if (hyperlink) {
    return hyperlink[1].trim();
  }

  const urlMatch = text.match(/https?:\/\/[^\s"]+/i);

  return urlMatch ? urlMatch[0].trim() : text;
}

/** Fetch a message from a raw sheet link or Discord URL. */
export async function fetchDiscordMessage(client, rawUrl) {
  const url = resolveDiscordMessageUrl(rawUrl);
  const parsed = parseDiscordMessageUrl(url);

  if (!parsed) {
    return null;
  }

  try {
    const channel = await client.channels.fetch(parsed.channelId);

    if (!channel?.isTextBased?.()) {
      return null;
    }

    return await channel.messages.fetch(parsed.messageId, { force: true });
  } catch (err) {
    console.warn("Could not fetch Discord message:", err.message);
    return null;
  }
}
