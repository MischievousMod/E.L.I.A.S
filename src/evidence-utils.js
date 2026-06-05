const IMAGE_EXT = /\.(png|jpe?g|gif|webp|bmp|avif)(\?|$)/i;
const VIDEO_EXT = /\.(mp4|webm|mov|m4v)(\?|$)/i;
const VIDEO_HOST =
  /(?:youtube\.com|youtu\.be|twitch\.tv|vimeo\.com|streamable\.com|tiktok\.com)/i;

export function classifyEvidenceUrl(url) {
  const value = String(url ?? "").trim();
  if (!value) {
    return "none";
  }

  const lower = value.toLowerCase();

  if (VIDEO_HOST.test(lower) || VIDEO_EXT.test(lower)) {
    return "video";
  }

  if (IMAGE_EXT.test(lower)) {
    return "image";
  }

  if (lower.includes("cdn.discordapp.com/attachments")) {
    return VIDEO_EXT.test(lower) ? "video" : "image";
  }

  if (lower.includes("media.discordapp.net")) {
    return VIDEO_EXT.test(lower) ? "video" : "image";
  }

  return "link";
}

export function classifyAttachment(attachment) {
  if (!attachment) {
    return "none";
  }

  const type = attachment.contentType ?? "";
  const name = attachment.name ?? "";

  if (
    type.startsWith("image/") ||
    IMAGE_EXT.test(name) ||
    /^evidence-\d+\.[a-z0-9]+$/i.test(name)
  ) {
    return "image";
  }

  if (type.startsWith("video/") || VIDEO_EXT.test(name)) {
    return "video";
  }

  return classifyEvidenceUrl(attachment.url);
}
