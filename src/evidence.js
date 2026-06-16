import {
  classifyAttachment,
  classifyEvidenceUrl,
} from "./evidence-utils.js";
import {
  isGalleryGroupingUrl,
  isLogBrandingThumbnailUrl,
} from "./log-render.js";

export { classifyEvidenceUrl, classifyAttachment } from "./evidence-utils.js";

export function itemFromAttachment(attachment) {
  const proxyURL = attachment.proxyURL ?? "";
  const url = attachment.url ?? "";
  const primary = proxyURL || url;

  return {
    url: primary,
    fetchUrls: [proxyURL, url].filter(Boolean),
    type: classifyAttachment(attachment),
    name: attachment.name ?? "",
  };
}

function evidenceItemKeys(item) {
  const urls = [item.url, ...(item.fetchUrls ?? [])].filter(Boolean);
  const keys = new Set();

  for (const candidate of urls) {
    const key = evidenceUrlDedupeKey(candidate);

    if (key) {
      keys.add(key);
    }
  }

  return keys;
}

/** attachment:// URLs cannot be re-fetched for a new log message. */
function isNonFetchableMediaUrl(url) {
  return String(url ?? "").startsWith("attachment://");
}

/**
 * Discord may expose the same file as an attachment URL and a different embed
 * image URL (often expired). Dedupe by attachment id when present.
 */
export function evidenceUrlDedupeKey(url) {
  const raw = String(url ?? "").trim();

  if (!raw) {
    return "";
  }

  const attachmentId = raw.match(/\/attachments\/\d+\/(\d+)\//)?.[1];

  if (attachmentId) {
    return `att:${attachmentId}`;
  }

  const mediaId = raw.match(/\/ephemeral\/(\d+)\//)?.[1];

  if (mediaId) {
    return `eph:${mediaId}`;
  }

  return raw.split("?")[0];
}

/** Pull every http(s) URL out of free text (supports multiple links in one field). */
export function parseUrlsFromText(text) {
  const raw = String(text ?? "");
  const urls = [];

  for (const part of raw.split(/(?=https?:\/\/)/i).filter(Boolean)) {
    const matches = part.match(/https?:\/\/[^\s<>,]+/gi) ?? [];

    for (const url of matches) {
      urls.push(url.replace(/[.,;:!?)>\]]+$/, ""));
    }
  }

  return [...new Set(urls)];
}

/** Default single-file attachment option on slash commands. */
export const EVIDENCE_FILE_OPTION_NAMES = ["evidence_file"];

/** Up to four attachment slots (e.g. /cite). */
export const MULTI_EVIDENCE_FILE_OPTION_NAMES = [
  "evidence_file",
  "evidence_file_2",
  "evidence_file_3",
  "evidence_file_4",
];

/** Optional evidence_link / evidence_file from the slash command (not saved to the sheet). */
export function evidenceFromCommandOptions(
  interaction,
  normalizeInput,
  fileOptionNames = EVIDENCE_FILE_OPTION_NAMES
) {
  const items = [];
  const seen = new Set();

  const add = (url, type, name = "") => {
    if (!url) {
      return;
    }

    const key = evidenceUrlDedupeKey(url);

    if (!key || seen.has(key)) {
      return;
    }

    seen.add(key);
    items.push({ url, type, name });
  };

  const linkText = normalizeInput(interaction.options.getString("evidence_link"));

  for (const url of parseUrlsFromText(linkText)) {
    add(url, classifyEvidenceUrl(url), "link");
  }

  for (const optionName of fileOptionNames) {
    const file = interaction.options.getAttachment(optionName);

    if (file) {
      const item = itemFromAttachment(file);
      add(item.url, item.type, item.name);
    }
  }

  return items;
}

export function mergeEvidenceItems(...lists) {
  const items = [];
  const seen = new Set();

  for (const list of lists) {
    for (const item of list) {
      if (!item.url) {
        continue;
      }

      const keys = evidenceItemKeys(item);

      if (!keys.size || [...keys].some((key) => seen.has(key))) {
        continue;
      }

      for (const key of keys) {
        seen.add(key);
      }

      items.push(item);
    }
  }

  return items;
}

async function resolveMessage(message) {
  let full = message;

  if (message.partial) {
    try {
      full = await message.fetch();
    } catch {
      full = message;
    }
  }

  if (full.channel?.messages) {
    try {
      full = await full.channel.messages.fetch(full.id, { force: true });
    } catch {
      // keep best-effort message
    }
  }

  return full;
}

/** Force-fetch a citation log message so attachments and embed assets are populated. */
export async function resolveCitationMessage(client, message) {
  const channelId = message?.channelId ?? message?.channel?.id;

  if (client && message?.id && channelId) {
    try {
      const channel = await client.channels.fetch(channelId);

      if (channel?.messages?.fetch) {
        return await channel.messages.fetch(message.id, { force: true });
      }
    } catch (err) {
      console.warn(
        `Could not force-fetch citation message ${message.id}:`,
        err.message
      );
    }
  }

  return resolveMessage(message);
}

function embedImageCandidates(embed) {
  if (!embed.image) {
    return [];
  }

  const proxy = embed.image.proxyURL ?? embed.image.proxy_url ?? "";
  const direct = embed.image.url ?? "";

  return [proxy, direct]
    .map((value) => String(value ?? "").trim())
    .filter(Boolean);
}

function addEmbedImageUrls(embed, addImage) {
  for (const candidate of embedImageCandidates(embed)) {
    if (candidate.startsWith("attachment://")) {
      continue;
    }

    if (
      isGalleryGroupingUrl(candidate) ||
      isLogBrandingThumbnailUrl(candidate)
    ) {
      continue;
    }

    addImage(candidate, "image", embed.title ?? "");
  }
}

/** Download evidence bytes so reposting does not rely on expiring CDN links. */
export async function materializeEvidenceForUpload(items) {
  const materialized = [];

  for (const item of items) {
    if (!item.url || (item.type !== "image" && item.type !== "video")) {
      continue;
    }

    const candidates = [
      ...(item.fetchUrls ?? []),
      item.url,
    ].filter(Boolean);
    const seen = new Set();
    let buffer = null;

    for (const candidate of candidates) {
      const key = candidate.split("?")[0];

      if (seen.has(key)) {
        continue;
      }

      seen.add(key);

      try {
        const res = await fetch(candidate);

        if (!res.ok) {
          continue;
        }

        const data = Buffer.from(await res.arrayBuffer());

        if (data.length) {
          buffer = data;
          break;
        }
      } catch {
        // try next URL
      }
    }

    if (!buffer) {
      console.warn(
        `Could not download evidence "${item.name || item.url}" for repost`
      );
      continue;
    }

    materialized.push({ ...item, buffer });
  }

  return materialized;
}

function addImageFromAttachmentUrl(message, embedImageUrl, addItem) {
  if (!embedImageUrl?.startsWith("attachment://")) {
    return;
  }

  const name = embedImageUrl.slice("attachment://".length);

  for (const attachment of message.attachments.values()) {
    if (attachment.name === name) {
      const item = itemFromAttachment(attachment);
      addItem(item.url, item.type, item.name);
      return;
    }
  }
}

/**
 * Pull image files from a citation log message (file attachments, gallery embeds,
 * and overflow link fields). Used by /outstanding delete so evidence carries
 * into the paid citation log.
 */
export async function extractCitationImagesFromMessage(message, client = null) {
  const full = await resolveCitationMessage(client, message);
  const items = [];
  const seen = new Set();

  const addImage = (url, type = "image", name = "") => {
    if (!url || isNonFetchableMediaUrl(url)) {
      return;
    }

    if (type !== "image" && type !== "video") {
      return;
    }

    const key = evidenceUrlDedupeKey(url);

    if (!key || seen.has(key)) {
      return;
    }

    seen.add(key);
    items.push({
      url,
      fetchUrls: [url],
      type: type === "video" ? "video" : "image",
      name,
    });
  };

  const attachments = [...full.attachments.values()].sort((a, b) =>
    String(a.name ?? "").localeCompare(String(b.name ?? ""), undefined, {
      numeric: true,
    })
  );

  for (const attachment of attachments) {
    const item = itemFromAttachment(attachment);

    if (item.type === "image" || item.type === "video") {
      addImage(item.url, item.type, item.name);
    }
  }

  for (const embed of full.embeds) {
    const attachmentRef = embed.image?.url;

    if (attachmentRef?.startsWith("attachment://")) {
      addImageFromAttachmentUrl(full, attachmentRef, addImage);
    }

    addEmbedImageUrls(embed, addImage);
  }

  for (const embed of full.embeds) {
    for (const field of embed.fields ?? []) {
      if (!/additional images/i.test(String(field.name ?? ""))) {
        continue;
      }

      for (const url of parseUrlsFromText(field.value)) {
        if (isGalleryGroupingUrl(url) || isLogBrandingThumbnailUrl(url)) {
          continue;
        }

        const type = classifyEvidenceUrl(url);

        if (type === "image" || type === "video") {
          addImage(url, type, "");
        }
      }
    }
  }

  return items;
}

/** Pull link/video evidence from a citation log (e.g. evidence_link on /outstanding citation). */
export async function extractCitationLinksFromMessage(message, client = null) {
  const full = await resolveCitationMessage(client, message);
  const items = [];
  const seen = new Set();

  const addLink = (url, type = null) => {
    if (
      !url ||
      isNonFetchableMediaUrl(url) ||
      isGalleryGroupingUrl(url) ||
      isLogBrandingThumbnailUrl(url)
    ) {
      return;
    }

    const classified = type ?? classifyEvidenceUrl(url);

    if (classified !== "link" && classified !== "video") {
      return;
    }

    const key = evidenceUrlDedupeKey(url);

    if (!key || seen.has(key)) {
      return;
    }

    seen.add(key);
    items.push({
      url,
      fetchUrls: [url],
      type: classified,
      name: "",
    });
  };

  for (const embed of full.embeds) {
    const isGalleryCard =
      embed.image?.url && !(embed.fields?.length);

    if (isGalleryCard) {
      continue;
    }

    if (embed.video?.url) {
      addLink(embed.video.url, "video");
    }

    for (const field of embed.fields ?? []) {
      const fieldName = String(field.name ?? "").trim().toLowerCase();

      if (fieldName === "additional images" || fieldName === "evidence") {
        continue;
      }

      for (const url of parseUrlsFromText(field.value)) {
        addLink(url);
      }
    }
  }

  for (const url of parseUrlsFromText(full.content)) {
    addLink(url);
  }

  return items;
}

/** Collect images and links from one or more citation log messages. */
export async function extractEvidenceFromCitationMessages(messages) {
  let items = [];

  for (const message of messages) {
    if (!message) {
      continue;
    }

    const images = await extractCitationImagesFromMessage(message);
    const links = await extractCitationLinksFromMessage(message);
    const { items: found } = await extractEvidenceFromMessage(message);
    items = mergeEvidenceItems(items, images, links, found);
  }

  return items;
}

export async function extractEvidenceFromMessage(message) {
  const full = await resolveMessage(message);
  const items = [];
  const seen = new Set();

  const addItem = (url, type, name = "") => {
    if (!url || isNonFetchableMediaUrl(url)) {
      return;
    }

    const key = evidenceUrlDedupeKey(url);

    if (!key || seen.has(key)) {
      return;
    }

    seen.add(key);
    items.push({ url, type, name });
  };

  for (const attachment of full.attachments.values()) {
    const item = itemFromAttachment(attachment);
    addItem(item.url, item.type, item.name);
  }

  for (const embed of full.embeds) {
    if (embed.image?.url && isNonFetchableMediaUrl(embed.image.url)) {
      addImageFromAttachmentUrl(full, embed.image.url, addItem);
    }
  }

  for (const embed of full.embeds) {
    for (const candidate of embedImageCandidates(embed)) {
      if (candidate.startsWith("attachment://")) {
        continue;
      }

      if (
        isGalleryGroupingUrl(candidate) ||
        isLogBrandingThumbnailUrl(candidate)
      ) {
        continue;
      }

      addItem(candidate, "image", embed.title ?? "embedded image");
    }

    if (
      embed.thumbnail?.url &&
      !embed.image?.url &&
      !isNonFetchableMediaUrl(embed.thumbnail.url) &&
      !isLogBrandingThumbnailUrl(embed.thumbnail.url)
    ) {
      addItem(embed.thumbnail.url, "image", "thumbnail");
    }

    if (embed.video?.url) {
      addItem(embed.video.url, "video", "embedded video");
    }

    if (
      embed.url &&
      !embed.video?.url &&
      !isGalleryGroupingUrl(embed.url) &&
      !embed.image?.url
    ) {
      addItem(embed.url, classifyEvidenceUrl(embed.url), "link");
    }

    for (const field of embed.fields ?? []) {
      for (const url of parseUrlsFromText(field.value)) {
        if (isGalleryGroupingUrl(url)) {
          continue;
        }

        addItem(url, classifyEvidenceUrl(url), "link");
      }
    }

    for (const url of parseUrlsFromText(embed.description)) {
      if (isGalleryGroupingUrl(url)) {
        continue;
      }

      addItem(url, classifyEvidenceUrl(url), "link");
    }
  }

  for (const url of parseUrlsFromText(full.content)) {
    if (isGalleryGroupingUrl(url)) {
      continue;
    }

    addItem(url, classifyEvidenceUrl(url), "link");
  }

  return {
    items,
    messages: items.length ? [full] : [],
  };
}

