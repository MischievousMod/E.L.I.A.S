import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import { sanitizeForDisplay } from "./format.js";
import { POINTS_EMOJI } from "./points-config.js";

export const INVESTIGATION_POINTS_AWARD_BUTTON = "inv_points_award";
export const INVESTIGATION_POINTS_FINALIZE_BUTTON = "inv_points_finalize";
export const INVESTIGATION_POINTS_CLOSED_BUTTON = "inv_points_closed";
export const INVESTIGATION_POINTS_UNDO_PREFIX = "inv_points_undo:";
export const INVESTIGATION_POINTS_MODAL_ID = "inv_points_modal";
export const INVESTIGATION_POINTS_AWARDED_FIELD = "Points awarded";
export const INVESTIGATION_POINTS_STATUS_FIELD = "Points status";
export const INVESTIGATION_POINTS_CLOSED_LABEL = "All points awarded";

const AWARD_LINE = /^• \*\*(.+?)\*\* · \+(\d+)\s*$/;
const MAX_UNDO_BUTTONS = 20;
const MAX_POINTS = 9999;

/** @typedef {{ officer: string, points: number }} InvestigationAward */

/** @param {import("discord.js").Embed | import("discord.js").APIEmbed} embed */
function parseInvestigationAwardsFromEmbed(embed) {
  const field = embed?.fields?.find(
    (entry) => entry.name === INVESTIGATION_POINTS_AWARDED_FIELD
  );

  if (!field?.value) {
    return [];
  }

  /** @type {InvestigationAward[]} */
  const awards = [];

  for (const line of field.value.split("\n")) {
    const match = line.match(AWARD_LINE);

    if (!match) {
      continue;
    }

    const points = Number.parseInt(match[2], 10);

    if (!Number.isFinite(points) || points <= 0) {
      continue;
    }

    awards.push({ officer: match[1], points });
  }

  return awards;
}

/** @param {InvestigationAward[]} awards */
export function formatInvestigationAwardsField(awards) {
  return awards
    .map(
      (award) =>
        `• **${sanitizeForDisplay(award.officer)}** · +${award.points}`
    )
    .join("\n");
}

/** @param {import("discord.js").Embed | import("discord.js").APIEmbed} embed */
function isInvestigationPointsClosed(embed) {
  const field = embed?.fields?.find(
    (entry) => entry.name === INVESTIGATION_POINTS_STATUS_FIELD
  );

  return field?.value?.startsWith(INVESTIGATION_POINTS_CLOSED_LABEL) ?? false;
}

/** @param {InvestigationAward[]} awards */
export function buildInvestigationPointsComponents(awards = [], closed = false) {
  if (closed) {
    return [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(INVESTIGATION_POINTS_CLOSED_BUTTON)
          .setLabel(INVESTIGATION_POINTS_CLOSED_LABEL)
          .setStyle(ButtonStyle.Success)
          .setDisabled(true)
      ),
    ];
  }

  const rows = [];
  const awardButton = new ButtonBuilder()
    .setCustomId(INVESTIGATION_POINTS_AWARD_BUTTON)
    .setEmoji(POINTS_EMOJI)
    .setLabel(
      awards.length
        ? "Add investigation points"
        : "Award investigation points"
    )
    .setStyle(ButtonStyle.Secondary);

  const finalizeButton = new ButtonBuilder()
    .setCustomId(INVESTIGATION_POINTS_FINALIZE_BUTTON)
    .setLabel(INVESTIGATION_POINTS_CLOSED_LABEL)
    .setStyle(ButtonStyle.Success);

  rows.push(
    new ActionRowBuilder().addComponents(awardButton, finalizeButton)
  );

  const undoButtons = awards
    .slice(0, MAX_UNDO_BUTTONS)
    .map((award, index) => {
      const label = `Undo ${award.officer} +${award.points}`.slice(0, 80);

      return new ButtonBuilder()
        .setCustomId(`${INVESTIGATION_POINTS_UNDO_PREFIX}${index}`)
        .setLabel(label)
        .setStyle(ButtonStyle.Danger);
    });

  for (let i = 0; i < undoButtons.length; i += 5) {
    rows.push(
      new ActionRowBuilder().addComponents(...undoButtons.slice(i, i + 5))
    );
  }

  return rows.slice(0, 5);
}

export function buildInvestigationPointsModal() {
  const officerInput = new TextInputBuilder()
    .setCustomId("officer")
    .setLabel("Officer username")
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(500)
    .setPlaceholder("Name as it appears on the points sheet (column C)");

  const pointsInput = new TextInputBuilder()
    .setCustomId("points")
    .setLabel("Points to award")
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(4)
    .setPlaceholder("Whole number, e.g. 1 or 5");

  return new ModalBuilder()
    .setCustomId(INVESTIGATION_POINTS_MODAL_ID)
    .setTitle("Award investigation points")
    .addComponents(
      new ActionRowBuilder().addComponents(officerInput),
      new ActionRowBuilder().addComponents(pointsInput)
    );
}

const POINTS_AWARDED_CONTENT_MARKER = `\n\n**${INVESTIGATION_POINTS_AWARDED_FIELD}:**`;
const POINTS_STATUS_CONTENT_MARKER = `\n\n**${INVESTIGATION_POINTS_STATUS_FIELD}:**`;

function stripInvestigationPointsContent(content) {
  let text = String(content ?? "").trim();
  const awardsIdx = text.indexOf(POINTS_AWARDED_CONTENT_MARKER);

  if (awardsIdx !== -1) {
    text = text.slice(0, awardsIdx).trim();
  }

  const statusIdx = text.indexOf(POINTS_STATUS_CONTENT_MARKER);

  if (statusIdx !== -1) {
    text = text.slice(0, statusIdx).trim();
  }

  return text;
}

/** @param {InvestigationAward[]} awards */
function formatInvestigationLogContent(
  content,
  awards,
  closedMeta = null
) {
  let text = stripInvestigationPointsContent(content);

  if (awards.length) {
    text += `${POINTS_AWARDED_CONTENT_MARKER}\n${formatInvestigationAwardsField(awards)}`;
  }

  if (closedMeta) {
    const parts = [INVESTIGATION_POINTS_CLOSED_LABEL];

    if (closedMeta.by) {
      parts.push(`by **${sanitizeForDisplay(closedMeta.by)}**`);
    }

    if (closedMeta.at) {
      parts.push(`· ${closedMeta.at}`);
    }

    text += `${POINTS_STATUS_CONTENT_MARKER} ${parts.join(" ")}`;
  }

  return text.slice(0, 2000);
}

function parseInvestigationAwardsFromContent(content) {
  const text = String(content ?? "");
  const marker = `**${INVESTIGATION_POINTS_AWARDED_FIELD}:**`;
  const idx = text.indexOf(marker);

  if (idx === -1) {
    return [];
  }

  const after = text.slice(idx + marker.length);
  const statusIdx = after.indexOf(`**${INVESTIGATION_POINTS_STATUS_FIELD}:**`);
  const block = statusIdx === -1 ? after : after.slice(0, statusIdx);

  /** @type {InvestigationAward[]} */
  const awards = [];

  for (const line of block.split("\n")) {
    const match = line.match(AWARD_LINE);

    if (!match) {
      continue;
    }

    const points = Number.parseInt(match[2], 10);

    if (!Number.isFinite(points) || points <= 0) {
      continue;
    }

    awards.push({ officer: match[1], points });
  }

  return awards;
}

/** @param {import("discord.js").Message} message */
export function parseInvestigationAwardsFromMessage(message) {
  const contentAwards = parseInvestigationAwardsFromContent(message.content);

  if (contentAwards.length) {
    return contentAwards;
  }

  return parseInvestigationAwardsFromEmbed(message.embeds?.[0]);
}

/** @param {import("discord.js").Message} message */
export function isInvestigationPointsClosedMessage(message) {
  const content = message.content ?? "";

  if (
    content.includes(`**${INVESTIGATION_POINTS_STATUS_FIELD}:**`) &&
    content.includes(INVESTIGATION_POINTS_CLOSED_LABEL)
  ) {
    return true;
  }

  return isInvestigationPointsClosed(message.embeds?.[0]);
}

/**
 * Edit payload for investigation point updates.
 * Never pass embeds/files — Discord breaks evidence galleries when embeds are edited.
 *
 * @param {import("discord.js").Message} logMessage
 * @param {InvestigationAward[]} awards
 * @param {import("discord.js").ActionRowBuilder[]} components
 * @param {{ by?: string, at?: string } | null} [closedMeta]
 */
export function buildInvestigationLogEditPayload(
  logMessage,
  awards,
  components,
  closedMeta = null
) {
  return {
    content: formatInvestigationLogContent(
      logMessage.content ?? "",
      awards,
      closedMeta
    ),
    components,
  };
}

/** @returns {{ ok: true, officer: string, points: number } | { ok: false, reason: string }} */
export function parseInvestigationPointsModalInput(officerRaw, pointsRaw) {
  const officer = String(officerRaw ?? "").trim();

  if (!officer) {
    return { ok: false, reason: "Please enter an officer username." };
  }

  const pointsText = String(pointsRaw ?? "").trim();

  if (!/^\d+$/.test(pointsText)) {
    return { ok: false, reason: "Points must be a whole number." };
  }

  const points = Number.parseInt(pointsText, 10);

  if (!Number.isFinite(points) || points < 1) {
    return { ok: false, reason: "Points must be at least 1." };
  }

  if (points > MAX_POINTS) {
    return {
      ok: false,
      reason: `Points cannot exceed ${MAX_POINTS}.`,
    };
  }

  return { ok: true, officer, points };
}
