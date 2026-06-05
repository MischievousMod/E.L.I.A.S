import { AttachmentBuilder, EmbedBuilder } from "discord.js";
import { sanitizeForDisplay } from "./format.js";

/** Legacy SCP wiki link on old logs (used when parsing evidence, not for new posts). */
export const GALLERY_URL = "https://www.scpwiki.com/";

const DEFAULT_GALLERY_GROUPING_URL =
  "https://docs.google.com/document/d/1ochsmZwAg4P75pi-lgS1xVBCqXrdYz3XSzStmGsn3jQ/edit?tab=t.0";

/**
 * Shared embed URL so Discord groups evidence screenshots into one gallery.
 * Override with EVIDENCE_GALLERY_URL in .env (must be https). Not shown as a label.
 */
export function getGalleryGroupingUrl() {
  const custom = process.env.EVIDENCE_GALLERY_URL?.trim() ?? "";
  return isHttpUrl(custom) ? custom : DEFAULT_GALLERY_GROUPING_URL;
}

export function isGalleryGroupingUrl(url) {
  const value = String(url ?? "").trim();
  return value === GALLERY_URL || value === getGalleryGroupingUrl();
}

/** Optional branding image (top-right) on every official log embed. Set in .env. */
export function getLogThumbnailUrl() {
  const url = process.env.LOG_THUMBNAIL_URL?.trim() ?? "";
  return isHttpUrl(url) ? url : "";
}

export function isLogBrandingThumbnailUrl(url) {
  const branding = getLogThumbnailUrl();
  return branding !== "" && String(url ?? "").trim() === branding;
}

const DISCORD_MAX_EMBEDS = 10;
const DISCORD_MAX_ATTACHMENTS = 10;
const FIELD_VALUE_LIMIT = 1024;
const SHORT_VALUE_LIMIT = 80;

function extensionFor(item) {
  const fromName = String(item.name ?? "").match(/\.[a-z0-9]{1,5}$/i)?.[0];
  if (fromName) {
    return fromName.toLowerCase();
  }

  try {
    const { pathname } = new URL(item.url);
    const fromUrl = pathname.match(/\.[a-z0-9]{1,5}$/i)?.[0];
    if (fromUrl) {
      return fromUrl.toLowerCase();
    }
  } catch {
    // ignore
  }

  return item.type === "video" ? ".mp4" : ".png";
}

function isHttpUrl(url) {
  return /^https?:\/\//i.test(String(url ?? "").trim());
}

function formatValue(value) {
  const text = sanitizeForDisplay(value);

  if (!text) {
    return "—";
  }

  return text;
}

/** Split long values across multiple embed fields (Discord 1024 char limit). */
function fieldEntries(name, value, inline = false) {
  const text = formatValue(value);
  const entries = [];

  if (text.length <= FIELD_VALUE_LIMIT) {
    entries.push({ name: name.slice(0, 256), value: text, inline });
    return entries;
  }

  let rest = text;
  let part = 1;

  while (rest.length) {
    const chunk = rest.slice(0, FIELD_VALUE_LIMIT);
    rest = rest.slice(FIELD_VALUE_LIMIT);
    entries.push({
      name: (part === 1 ? name : `${name} (continued)`).slice(0, 256),
      value: chunk,
      inline: false,
    });
    part += 1;
  }

  return entries;
}

function appendFields(embed, fields) {
  const pending = [];

  for (const field of fields) {
    const wantInline =
      field.inline === true &&
      formatValue(field.value).length <= SHORT_VALUE_LIMIT;

    if (wantInline && pending.length === 1) {
      const first = pending[0];
      pending.push(field);
      embed.addFields(
        {
          name: first.name,
          value: formatValue(first.value),
          inline: true,
        },
        {
          name: field.name.slice(0, 256),
          value: formatValue(field.value),
          inline: true,
        }
      );
      pending.length = 0;
      continue;
    }

    if (pending.length === 1) {
      const solo = pending[0];
      embed.addFields({
        name: solo.name,
        value: formatValue(solo.value),
        inline: false,
      });
      pending.length = 0;
    }

    if (wantInline) {
      pending.push(field);
    } else {
      for (const entry of fieldEntries(field.name, field.value, false)) {
        embed.addFields(entry);
      }
    }
  }

  if (pending.length === 1) {
    const solo = pending[0];
    embed.addFields({
      name: solo.name,
      value: formatValue(solo.value),
      inline: false,
    });
  }
}

/**
 * Build an official-looking log message using Discord embed fields (legible,
 * easy to copy values) plus a separate image gallery when needed.
 *
 * @param {object} options
 * @param {string} options.title - Record title (e.g. "OUTSTANDING CITATION — OFFICIAL RECORD")
 * @param {number} options.color - Embed color
 * @param {string} [options.footer] - Footer line
 * @param {Array<{name: string, value: string, inline?: boolean}>} options.fields
 * @param {Array<{title: string, body: string}>} [options.sections] - Long free-text blocks
 * @param {Array} [options.evidenceItems] - Images / links to attach
 * @param {boolean} [options.paymentOnMainCard] - Paid logs: payment screenshot on the record card, other images in the gallery below
 */
export function buildOfficialLogPayload({
  title,
  color,
  footer,
  fields = [],
  sections = [],
  evidenceItems = [],
  paymentOnMainCard = false,
}) {
  const images = evidenceItems.filter((item) => item.type === "image");
  const paymentImages = images.filter((item) => item.role === "payment");
  const otherImages = images.filter((item) => item.role !== "payment");
  const paymentOnMain = paymentOnMainCard && paymentImages.length > 0;
  const galleryImages = paymentOnMain ? otherImages : [...otherImages, ...paymentImages];

  const videosAndLinks = evidenceItems.filter(
    (item) => item.type === "video" || item.type === "link"
  );

  const embeds = [];
  const main = new EmbedBuilder()
    .setColor(color)
    .setTitle(String(title ?? "OFFICIAL RECORD").slice(0, 256))
    .setDescription("Official record · Ethics Committee");

  const thumbnailUrl = getLogThumbnailUrl();

  if (thumbnailUrl) {
    main.setThumbnail(thumbnailUrl);
  }

  appendFields(main, fields);

  for (const section of sections) {
    for (const entry of fieldEntries(
      section.title,
      section.body,
      false
    )) {
      main.addFields(entry);
    }
  }

  if (videosAndLinks.length) {
    main.addFields({
      name: "Links",
      value: videosAndLinks
        .map((item) => item.url)
        .join("\n")
        .slice(0, FIELD_VALUE_LIMIT),
      inline: false,
    });
  }

  const files = [];
  const attachmentNames = [];
  const canAttachImage = (item) => item.buffer || isHttpUrl(item.url);
  const maxGalleryFiles = Math.max(
    0,
    paymentOnMain
      ? Math.min(DISCORD_MAX_ATTACHMENTS - 1, DISCORD_MAX_EMBEDS - 1)
      : Math.min(DISCORD_MAX_ATTACHMENTS, DISCORD_MAX_EMBEDS - 1)
  );
  const embeddedImages = galleryImages
    .filter(canAttachImage)
    .slice(0, maxGalleryFiles);
  const overflowImages = galleryImages
    .filter(canAttachImage)
    .slice(embeddedImages.length);

  if (embeddedImages.length) {
    main.addFields({
      name: "Evidence",
      value: "Attached below.",
      inline: false,
    });
  }

  if (overflowImages.length) {
    let imageIndex = 0;
    const linkLines = overflowImages
      .filter((item) => isHttpUrl(item.url))
      .map((item) => {
        const label =
          item.role === "payment"
            ? "Payment screenshot"
            : `Image ${(imageIndex += 1)}`;
        return `[${label}](${item.url})`;
      });

    if (linkLines.length) {
      main.addFields({
        name: "Additional images",
        value: linkLines.join("\n").slice(0, FIELD_VALUE_LIMIT),
        inline: false,
      });
    }
  }

  if (footer) {
    main.setFooter({ text: footer.slice(0, 2048) });
  }

  if (paymentOnMain) {
    const payment = paymentImages[0];
    const paymentName = `payment${extensionFor(payment)}`;
    files.push(
      new AttachmentBuilder(payment.buffer ?? payment.url, { name: paymentName })
    );
    main.setImage(`attachment://${paymentName}`);
  }

  embeds.push(main);

  embeddedImages.forEach((item, index) => {
    const name = `evidence-${index + 1}${extensionFor(item)}`;
    const source = item.buffer ?? item.url;
    files.push(new AttachmentBuilder(source, { name }));
    attachmentNames.push(name);
  });

  const groupingUrl = getGalleryGroupingUrl();

  attachmentNames.forEach((name) => {
    embeds.push(
      new EmbedBuilder()
        .setURL(groupingUrl)
        .setImage(`attachment://${name}`)
        .setColor(color)
    );
  });

  return { embeds, files };
}

/** @deprecated Use buildOfficialLogPayload — kept for any legacy call sites. */
export function buildLogPayload(options) {
  if (options.block) {
    return buildOfficialLogPayload({
      title: "OFFICIAL RECORD",
      color: options.color,
      footer: options.footer,
      sections: [{ title: "Details", body: options.block }],
      evidenceItems: options.evidenceItems ?? [],
    });
  }

  return buildOfficialLogPayload(options);
}
