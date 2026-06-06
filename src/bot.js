import "dotenv/config";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Client,
  Events,
  GatewayIntentBits,
  MessageFlags,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import { buildHelpText } from "./commands.js";
import { commandFields, fieldDefinitions } from "./config.js";
import {
  resolveCitationsChannel,
  resolveClassESentencesChannel,
  resolveInterviewChannel,
  resolveOutstandingCitationsChannel,
  resolveOutstandingSentencesChannel,
  resolvePointsLogChannel,
  resolveSeminarChannel,
  resolveSpectatorChannel,
  requiredChannelForCommand,
} from "./channels.js";
import { buildSpectatorReply } from "./spectator-log.js";
import { buildInterviewReply } from "./interview-log.js";
import { buildSeminarReply } from "./seminar-log.js";
import {
  adjustOfficerPoints,
  parseOfficerFromMessage,
  startMonthlyJobsResetScheduler,
} from "./points.js";
import {
  POINTS_AUTH_ROLE_ID,
  POINTS_CHANNEL_COLUMNS,
  POINTS_COLUMN_LABELS,
  POINTS_EMOJI,
} from "./points-config.js";
import {
  cePermanentColumns,
  ceColumns,
  ceTabNames,
  isPermanentTab,
  parseSentenceDays,
  resolveCeTab,
} from "./ce-config.js";
import { buildCeSentenceReply } from "./ce-sentence-log.js";
import {
  buildCitationErrorReply,
  buildOutstandingCitationReply,
  deleteCitationLogMessages,
  findCitationLogMessages,
  isOutstandingCitationLog,
  messageText,
  extractCitationUsername,
} from "./citation-log.js";
import {
  evidenceFromCommandOptions,
  extractCitationImagesFromMessage,
  extractCitationLinksFromMessage,
  extractEvidenceFromCitationMessages,
  materializeEvidenceForUpload,
  itemFromAttachment,
  mergeEvidenceItems,
  MULTI_EVIDENCE_FILE_OPTION_NAMES,
} from "./evidence.js";
import {
  buildSheetHyperlink,
  formatSubmissionTimestamp,
  normalizeInput,
  sanitizeForDisplay,
  splitDateAndTime,
} from "./format.js";
import {
  fetchDiscordMessage,
  parseDiscordMessageUrl,
  resolveDiscordMessageUrl,
} from "./discord-message.js";
import {
  buildPaidCitationReply,
  mergeCitationRecord,
  parseCitationFromDiscordMessage,
} from "./paid-citation-log.js";
import {
  buildSentenceCitationReply,
  sentenceDataFromOutstandingCitation,
} from "./sentence-log.js";
import {
  appendRowToTab,
  appendSubmission,
  deleteCeRowsByOffender,
  deleteSheetRow,
  findAllCitationsByOffender,
  markSentenceCheckboxesForOffender,
  warmSheetClient,
  writeCellOnTab,
  writeFieldOnRow,
} from "./sheets.js";
import { ensureGoogleCredentialsFile } from "./google-credentials.js";
import { postCommandAudit } from "./audit-log.js";
import {
  formatOfficerStatsMessage,
  getOfficerPointsStats,
} from "./officer-stats.js";
import {
  buildRegistryListText,
  discordDisplayName,
  getRegisteredUsername,
  listRegistrations,
  removeRegistration,
  resolveOfficerName,
  upsertRegistration,
} from "./registry.js";

ensureGoogleCredentialsFile();

const token = process.env.DISCORD_TOKEN;
const sheetName = process.env.SHEET_NAME || "Sheet1";

/** Screenshots awaiting the /interview modal submit, keyed by interaction id. */
const pendingInterviews = new Map();
const INTERVIEW_FORM_TTL_MS = 15 * 60 * 1000;
const REGISTER_MODAL_ID = "register_modal";

/** Commands usable without being in the registry. */
const OPEN_COMMANDS = new Set(["register", "help"]);

/** Reply privately to a validation/early-return error (keeps channels clean). */
async function replyEphemeral(interaction, content) {
  try {
    await interaction.reply({ content, flags: MessageFlags.Ephemeral });
  } catch (err) {
    console.error("Could not send validation reply:", err.message);
  }
}

function buildDiscordMessageLink(interaction, message) {
  const channelId = message.channelId;
  const messageId = message.id;

  if (interaction.guildId) {
    return `https://discord.com/channels/${interaction.guildId}/${channelId}/${messageId}`;
  }

  return `https://discord.com/channels/@me/${channelId}/${messageId}`;
}

function buildSubmissionValues(interaction) {
  const startDate = formatSubmissionTimestamp(interaction.createdAt);
  const valuesByName = {
    start_date: startDate,
    outstanding_message_link: "",
  };

  for (const field of commandFields) {
    valuesByName[field.name] = normalizeInput(
      interaction.options.getString(field.name)
    );
  }

  return fieldDefinitions.map((field) => valuesByName[field.name] ?? "");
}

async function deleteCitationDiscordMessage(client, messageLink) {
  try {
    const message = await fetchDiscordMessage(client, messageLink);
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
        !channels.some((ch) => ch.id === linkChannel.id)
      ) {
        channels.push(linkChannel);
      }
    } catch (err) {
      console.warn("Could not open citation link channel:", err.message);
    }
  }

  return channels;
}

function normalizeUsernameMatch(value) {
  return normalizeInput(value).toLowerCase();
}

async function gatherCitationLogMessages(
  client,
  interaction,
  username,
  messageLinks = []
) {
  const botUserId = client.user.id;
  const target = normalizeUsernameMatch(username);
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

    const parsed = parseCitationFromDiscordMessage(message);
    const cited =
      parsed?.offender || extractCitationUsername(messageText(message));

    if (normalizeUsernameMatch(cited) !== target) {
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

  const channels = await collectChannelsToSearch(
    client,
    interaction,
    links[0] ?? ""
  );

  if (interaction.guild) {
    const outstandingChannel = await resolveOutstandingCitationsChannel(
      interaction.guild
    );

    if (
      outstandingChannel?.isTextBased() &&
      !channels.some((channel) => channel.id === outstandingChannel.id)
    ) {
      channels.push(outstandingChannel);
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

async function deleteGatheredCitationLogs(client, messageLinks, messages) {
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

  const toDelete = messages.filter((msg) => !skipIds.has(msg.id));

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

async function postPaidCitationToChannel(client, guild, payload) {
  const channel = await resolveCitationsChannel(guild);

  if (!channel) {
    throw new Error(
      "Could not find #citations. Create that channel or set CITATIONS_CHANNEL_ID in .env."
    );
  }

  await channel.send(payload);
  return channel;
}

function screenshotFromDeleteCommand(interaction) {
  const file = interaction.options.getAttachment("screenshot");

  if (!file) {
    return [];
  }

  const item = itemFromAttachment(file);
  return [{ ...item, role: "payment" }];
}

function buildCitationPaidMessage(memberUsername, processedBy) {
  const member = sanitizeForDisplay(memberUsername);
  const officer = sanitizeForDisplay(processedBy);
  return `${member}'s citation has been paid!\nExecutor: ${officer}`;
}

async function auditLogFiling(interaction, options) {
  const {
    action,
    executor,
    subject = "",
    postedMessage = null,
    links = [],
    note = "",
  } = options;

  const messageLinks = [...links];

  if (postedMessage) {
    messageLinks.unshift(buildDiscordMessageLink(interaction, postedMessage));
  }

  await postCommandAudit(interaction.guild, {
    action,
    actor: interaction.user,
    executor,
    subject,
    links: messageLinks,
    note,
  });
}

function screenshotFromSentenceCommand(interaction) {
  const file = interaction.options.getAttachment("screenshot");

  if (!file) {
    return [];
  }

  return [itemFromAttachment(file)];
}

async function handleOutstandingSentences(interaction) {
  const username = normalizeInput(interaction.options.getString("username"));
  const screenshot = interaction.options.getAttachment("screenshot");

  if (!username) {
    await replyEphemeral(interaction, "Please provide a username.");
    return;
  }

  if (!screenshot) {
    await replyEphemeral(
      interaction,
      "Please attach a screenshot to the command (drag into the attachment box)."
    );
    return;
  }

  if (!interaction.guild) {
    await replyEphemeral(
      interaction,
      "Run this command in a server with an **#outstanding-citations** channel."
    );
    return;
  }

  const officer = await resolveOfficerName(interaction);
  const filedAt = splitDateAndTime(interaction.createdAt);

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    const citationsChannel = await resolveOutstandingCitationsChannel(
      interaction.guild
    );

    if (!citationsChannel) {
      throw new Error(
        "Could not find #outstanding-citations. Create that channel or set OUTSTANDING_CITATIONS_CHANNEL_ID in .env."
      );
    }

    const citationMessages = await findCitationLogMessages(
      citationsChannel,
      username,
      interaction.client.user.id
    );

    if (!citationMessages.length) {
      throw new Error(
        `No outstanding citation found for "${username}" in #${citationsChannel.name}.`
      );
    }

    const screenshotItems = screenshotFromSentenceCommand(interaction);
    const sentencePayloads = [];

    for (let i = 0; i < citationMessages.length; i++) {
      const sourceMessage = citationMessages[i];
      const parsed = parseCitationFromDiscordMessage(sourceMessage);
      const sentenceData = sentenceDataFromOutstandingCitation(
        parsed,
        username
      );

      const evidenceItems = screenshotItems;
      const entryRefId = `${interaction.id.slice(-6)}${i + 1}`.toUpperCase();
      sentencePayloads.push(
        buildSentenceCitationReply({
          ...sentenceData,
          officer,
          refId: entryRefId,
          filedAt,
          evidenceItems,
        })
      );
    }

    if (!sentencePayloads.length) {
      throw new Error("Could not build citation sentence records.");
    }

    let checkboxResult = null;

    try {
      checkboxResult = await markSentenceCheckboxesForOffender(
        sheetName,
        sentenceDataFromOutstandingCitation(
          parseCitationFromDiscordMessage(citationMessages[0]),
          username
        ).offender
      );
    } catch (err) {
      console.error("Could not check column D:", err.message);
    }

    const sentencesChannel = await resolveOutstandingSentencesChannel(
      interaction.guild
    );

    if (!sentencesChannel) {
      throw new Error(
        "Could not find the outstanding citation sentences channel. Set OUTSTANDING_SENTENCES_CHANNEL_ID in .env."
      );
    }

    const checkedRows = checkboxResult?.rowNumbers?.length ?? 0;
    const checkboxNote = checkedRows
      ? ""
      : "\n_No matching spreadsheet row was found in column B, so column D was not checked._";
    const confirmation = `Citation sentence filed for **${sanitizeForDisplay(username)}**${
      sentencePayloads.length > 1 ? ` (${sentencePayloads.length} records)` : ""
    }.${checkboxNote}`;

    for (let i = 0; i < sentencePayloads.length; i += 1) {
      const payload = sentencePayloads[i];

      await sentencesChannel.send({
        ...(i === 0 ? { content: confirmation } : {}),
        ...payload,
        components: [buildPointsButtonRow()],
      });
    }

    await clearDeferredReply(interaction);

    console.log(
      `Citation sentences filed for ${username} by ${officer} (${sentencePayloads.length} record(s), ${checkedRows} column D box(es) checked)`
    );
  } catch (err) {
    console.error("Citation sentence failed:", err);

    try {
      await interaction.editReply({
        content: `Could not file citation sentence: ${err.message}`,
      });
    } catch (replyErr) {
      console.error("Could not send sentence error reply:", replyErr.message);
    }
  }
}

async function clearDeferredReply(interaction) {
  try {
    await interaction.deleteReply();
  } catch (err) {
    console.warn("Could not clear command reply:", err.message);
  }
}

function collectScreenshots(interaction) {
  const images = [];
  for (const optionName of [
    "screenshot",
    "screenshot_2",
    "screenshot_3",
    "screenshot_4",
  ]) {
    const attachment = interaction.options.getAttachment(optionName);
    if (attachment) {
      images.push(itemFromAttachment(attachment));
    }
  }
  return images;
}

const INTERVIEW_MODAL_PREFIX = "interview_modal:";

async function handleRegister(interaction) {
  const modal = new ModalBuilder()
    .setCustomId(REGISTER_MODAL_ID)
    .setTitle("Register Username");

  const usernameInput = new TextInputBuilder()
    .setCustomId("username")
    .setLabel("Username")
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(500)
    .setPlaceholder("Your in-game / Roblox username for logs and points");

  modal.addComponents(new ActionRowBuilder().addComponents(usernameInput));

  await interaction.showModal(modal);
}

async function handleRegisterModalSubmit(interaction) {
  const username = normalizeInput(
    interaction.fields.getTextInputValue("username")
  );

  if (!username) {
    await interaction.reply({
      content: "Please enter a username.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    const result = await upsertRegistration(interaction.user.id, username);
    const action = result.isUpdate ? "Updated" : "Registered";

    await interaction.editReply({
      content: `${action} as **${sanitizeForDisplay(username)}**. Your logs will show this name as **Executor** (and for point authorization on the points sheet).`,
    });

    console.log(
      `${action} ${interaction.user.tag} → ${username} (${interaction.user.id})`
    );
  } catch (err) {
    console.error("Register failed:", err);

    try {
      await interaction.editReply({
        content: `Could not save registration: ${err.message}`,
      });
    } catch (replyErr) {
      console.error("Could not send register error reply:", replyErr.message);
    }
  }
}

async function handleRegistryStats(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const requestedName = normalizeInput(
    interaction.options.getString("username")
  );
  let lookupName = "";
  let alsoTry = [];

  try {
    if (requestedName) {
      if (!(await memberHasAuthRole(interaction.guild, interaction.user.id))) {
        await interaction.editReply({
          content:
            "Only members with the points authorization role can look up another officer's stats.",
        });
        return;
      }

      lookupName = requestedName;
    } else {
      const registered = await getRegisteredUsername(interaction.user.id);
      lookupName = registered || discordDisplayName(interaction);

      if (registered && registered !== lookupName) {
        alsoTry.push(registered);
      }

      const display = discordDisplayName(interaction);

      if (display && display !== lookupName) {
        alsoTry.push(display);
      }
    }

    if (!lookupName) {
      await interaction.editReply({
        content:
          "No username to look up. Run **/register** or pass **username** (auth role).",
      });
      return;
    }

    const stats = await getOfficerPointsStats(lookupName, { alsoTry });

    await interaction.editReply({
      content: formatOfficerStatsMessage(stats),
    });
  } catch (err) {
    console.error("Registry stats failed:", err);

    try {
      await interaction.editReply({
        content: `Could not load stats: ${err.message}`,
      });
    } catch (replyErr) {
      console.error("Could not send stats error reply:", replyErr.message);
    }
  }
}

async function handleRegistry(interaction) {
  const subcommand = interaction.options.getSubcommand(false);

  if (subcommand === "stats") {
    await handleRegistryStats(interaction);
    return;
  }

  if (subcommand === "delete") {
    await handleRegistryDelete(interaction);
    return;
  }

  await interaction.deferReply();

  try {
    const entries = await listRegistrations();
    await interaction.editReply({
      content: buildRegistryListText(entries),
    });
  } catch (err) {
    console.error("Registry list failed:", err);

    try {
      await interaction.editReply({
        content: `Could not load registry: ${err.message}`,
      });
    } catch (replyErr) {
      console.error("Could not send registry error reply:", replyErr.message);
    }
  }
}

async function handleRegistryDelete(interaction) {
  const member = interaction.options.getUser("member");

  if (!member) {
    await interaction.reply({
      content: "Please choose a member to remove.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    const removed = await removeRegistration(member.id);

    if (!removed) {
      await interaction.editReply({
        content: `<@${member.id}> is not in the registry.`,
      });
      return;
    }

    await interaction.editReply({
      content: `Removed **${sanitizeForDisplay(removed.username)}** (<@${member.id}>) from the registry. They must run **/register** again to use commands.`,
    });

    console.log(
      `Registry: ${interaction.user.tag} removed ${member.tag ?? member.id} (${removed.username})`
    );
  } catch (err) {
    console.error("Registry delete failed:", err);

    try {
      await interaction.editReply({
        content: `Could not remove from registry: ${err.message}`,
      });
    } catch (replyErr) {
      console.error("Could not send registry delete error:", replyErr.message);
    }
  }
}

async function handleInterview(interaction) {
  if (!interaction.guild) {
    await replyEphemeral(
      interaction,
      "Run this command in a server with an **#interview** channel."
    );
    return;
  }

  const images = collectScreenshots(interaction);

  if (!images.length) {
    await replyEphemeral(interaction, "At least one screenshot is required.");
    return;
  }

  const token = interaction.id;
  pendingInterviews.set(token, {
    images,
    createdAt: Date.now(),
  });

  setTimeout(() => pendingInterviews.delete(token), INTERVIEW_FORM_TTL_MS);

  const modal = new ModalBuilder()
    .setCustomId(`${INTERVIEW_MODAL_PREFIX}${token}`)
    .setTitle("Interview Log");

  const usernameInput = new TextInputBuilder()
    .setCustomId("username")
    .setLabel("Username")
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(500);

  const qaInput = new TextInputBuilder()
    .setCustomId("questions_answers")
    .setLabel("Questions & Answers")
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setMaxLength(4000)
    .setPlaceholder(
      "Q1: ...\nA1: ...\nQ2: ...\nA2: ...\n(add as many as you need)"
    );

  const verdictInput = new TextInputBuilder()
    .setCustomId("verdict")
    .setLabel("Verdict")
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(500);

  const commentsInput = new TextInputBuilder()
    .setCustomId("comments")
    .setLabel("Comments")
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setMaxLength(1000);

  modal.addComponents(
    new ActionRowBuilder().addComponents(usernameInput),
    new ActionRowBuilder().addComponents(qaInput),
    new ActionRowBuilder().addComponents(verdictInput),
    new ActionRowBuilder().addComponents(commentsInput)
  );

  await interaction.showModal(modal);
}

async function handleInterviewModalSubmit(interaction) {
  const token = interaction.customId.slice(INTERVIEW_MODAL_PREFIX.length);
  const pending = pendingInterviews.get(token);

  const username = normalizeInput(
    interaction.fields.getTextInputValue("username")
  );
  const questionsAnswers = normalizeInput(
    interaction.fields.getTextInputValue("questions_answers")
  );
  const verdict = normalizeInput(interaction.fields.getTextInputValue("verdict"));
  const comments = normalizeInput(
    interaction.fields.getTextInputValue("comments")
  );

  if (!pending) {
    await interaction.reply({
      content:
        "This interview form expired — please run `/interview` again with your screenshot.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  pendingInterviews.delete(token);

  const officer = await resolveOfficerName(interaction);
  const refId = interaction.id.slice(-8).toUpperCase();
  const filedAt = splitDateAndTime(interaction.createdAt);

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    const channel = await resolveInterviewChannel(interaction.guild);

    if (!channel) {
      throw new Error(
        "Could not find #interview. Create that channel or set INTERVIEW_CHANNEL_ID in .env."
      );
    }

    const confirmation = `Interview log filed for **${sanitizeForDisplay(username)}**.`;

    const payload = buildInterviewReply({
      username,
      questionsAnswers,
      verdict,
      comments,
      officer,
      refId,
      filedAt,
      images: pending.images,
    });

    const posted = await channel.send({
      content: confirmation,
      ...payload,
      components: [buildPointsButtonRow()],
    });

    await clearDeferredReply(interaction);

    console.log(`Interview log filed for ${username} by ${officer}`);
  } catch (err) {
    console.error("Interview log failed:", err);

    try {
      await interaction.editReply({
        content: `Could not file interview log: ${err.message}`,
      });
    } catch (replyErr) {
      console.error("Could not send interview error reply:", replyErr.message);
    }
  }
}

async function handleSeminar(interaction) {
  const username = normalizeInput(interaction.options.getString("username"));
  const host = normalizeInput(interaction.options.getString("host_username"));
  const seminarType = normalizeInput(
    interaction.options.getString("seminar_type")
  );

  if (!username || !host || !seminarType) {
    await replyEphemeral(
      interaction,
      "Please fill in username, host username, and seminar type."
    );
    return;
  }

  if (!interaction.guild) {
    await replyEphemeral(
      interaction,
      "Run this command in a server with a **#seminar** channel."
    );
    return;
  }

  const images = collectScreenshots(interaction);

  if (!images.length) {
    await replyEphemeral(interaction, "At least one screenshot is required.");
    return;
  }

  const officer = await resolveOfficerName(interaction);
  const refId = interaction.id.slice(-8).toUpperCase();
  const filedAt = splitDateAndTime(interaction.createdAt);

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    const channel = await resolveSeminarChannel(interaction.guild);

    if (!channel) {
      throw new Error(
        "Could not find #seminar. Create that channel or set SEMINAR_CHANNEL_ID in .env."
      );
    }

    const confirmation = `Seminar log filed for **${sanitizeForDisplay(username)}**.`;

    const payload = buildSeminarReply({
      username,
      host,
      seminarType,
      officer,
      refId,
      filedAt,
      images,
    });

    const posted = await channel.send({
      content: confirmation,
      ...payload,
      components: [buildPointsButtonRow()],
    });

    await clearDeferredReply(interaction);

    console.log(`Seminar log filed for ${username} by ${officer}`);
  } catch (err) {
    console.error("Seminar log failed:", err);

    try {
      await interaction.editReply({
        content: `Could not file seminar log: ${err.message}`,
      });
    } catch (replyErr) {
      console.error("Could not send seminar error reply:", replyErr.message);
    }
  }
}

async function handleSpectator(interaction) {
  const username = normalizeInput(interaction.options.getString("username"));
  const rank = normalizeInput(interaction.options.getString("rank"));
  const comments = normalizeInput(interaction.options.getString("comments"));

  if (!username || !rank || !comments) {
    await replyEphemeral(
      interaction,
      "Please fill in username, rank, and comments."
    );
    return;
  }

  if (!interaction.guild) {
    await replyEphemeral(
      interaction,
      "Run this command in a server with a **#spectator** channel."
    );
    return;
  }

  const images = collectScreenshots(interaction);

  if (!images.length) {
    await replyEphemeral(interaction, "At least one screenshot is required.");
    return;
  }

  const officer = await resolveOfficerName(interaction);
  const refId = interaction.id.slice(-8).toUpperCase();
  const filedAt = splitDateAndTime(interaction.createdAt);

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    const channel = await resolveSpectatorChannel(interaction.guild);

    if (!channel) {
      throw new Error(
        "Could not find #spectator. Create that channel or set SPECTATOR_CHANNEL_ID in .env."
      );
    }

    const confirmation = `Spectator log filed for **${sanitizeForDisplay(username)}**.`;

    const payload = buildSpectatorReply({
      username,
      rank,
      comments,
      officer,
      refId,
      filedAt,
      images,
    });

    const posted = await channel.send({
      content: confirmation,
      ...payload,
      components: [buildPointsButtonRow()],
    });

    await clearDeferredReply(interaction);

    console.log(`Spectator log filed for ${username} by ${officer}`);
  } catch (err) {
    console.error("Spectator log failed:", err);

    try {
      await interaction.editReply({
        content: `Could not file spectator log: ${err.message}`,
      });
    } catch (replyErr) {
      console.error("Could not send spectator error reply:", replyErr.message);
    }
  }
}

async function handleCeDelete(interaction) {
  const offender = normalizeInput(interaction.options.getString("offender"));

  if (!offender) {
    await interaction.reply({
      content: "Please provide an offender username.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    const tabs = Object.values(ceTabNames);
    let totalDeleted = 0;
    const perTab = [];
    const missingTabs = [];
    const tabErrors = [];

    for (const tabName of tabs) {
      try {
        const result = await deleteCeRowsByOffender(tabName, offender);

        if (result.reason === "tab-not-found") {
          missingTabs.push(tabName);
          continue;
        }

        if (result.deleted > 0) {
          totalDeleted += result.deleted;
          perTab.push(`${result.tabName} (${result.deleted})`);
        }
      } catch (err) {
        console.warn(`CE delete on tab "${tabName}" failed:`, err.message);
        tabErrors.push(`${tabName}: ${err.message}`);
      }
    }

    if (!totalDeleted) {
      const lines = [
        `No Class-E sentence found for **${sanitizeForDisplay(offender)}** in any CE tab.`,
        "Check that the **offender** option matches column B (or the Offender/Username header) exactly — extra spaces and `@` are ignored.",
      ];

      if (missingTabs.length) {
        lines.push(
          "",
          `These configured tabs were not found on the spreadsheet: ${missingTabs.join(", ")}`
        );
      }

      if (tabErrors.length) {
        lines.push("", `Errors: ${tabErrors.join("; ")}`);
      }

      await interaction.editReply({
        content: lines.join("\n"),
      });
      return;
    }

    await interaction.editReply({
      content: `Removed **${sanitizeForDisplay(offender)}**'s Class-E sentence from the spreadsheet — ${perTab.join(", ")}.`,
    });

    const officer = await resolveOfficerName(interaction);

    await auditLogFiling(interaction, {
      action: "/ce delete",
      executor: officer,
      subject: offender,
      note: `Removed ${totalDeleted} row(s): ${perTab.join(", ")}.`,
    });

    console.log(
      `CE sentence deleted for ${offender} by ${interaction.user.tag} (${totalDeleted} row(s): ${perTab.join(", ")})`
    );
  } catch (err) {
    console.error("CE delete failed:", err);

    try {
      await interaction.editReply({
        content: `Could not delete Class-E sentence: ${err.message}`,
      });
    } catch (replyErr) {
      console.error("Could not send CE delete error:", replyErr.message);
    }
  }
}

async function handleCeSentences(interaction) {
  const offender = normalizeInput(interaction.options.getString("offender"));
  const codesBroken = normalizeInput(
    interaction.options.getString("codes_broken")
  );
  const classESentence = normalizeInput(
    interaction.options.getString("class_e_sentence")
  );
  const punishment = normalizeInput(
    interaction.options.getString("punishment")
  );
  const rankPostInfraction = normalizeInput(
    interaction.options.getString("rank_post_infraction")
  );
  const authorization = normalizeInput(
    interaction.options.getString("authorization")
  );
  const banned = normalizeInput(interaction.options.getString("banned"));
  const notes = normalizeInput(interaction.options.getString("notes"));

  if (!offender || !codesBroken || !classESentence || !punishment) {
    await replyEphemeral(
      interaction,
      "Please fill in offender, codes broken, Class-E sentence, and punishment."
    );
    return;
  }

  const evidenceItems = evidenceFromCommandOptions(
    interaction,
    normalizeInput,
    MULTI_EVIDENCE_FILE_OPTION_NAMES
  );

  if (!evidenceItems.length) {
    await replyEphemeral(
      interaction,
      "Evidence is required — provide an evidence link or attach a file."
    );
    return;
  }

  if (!interaction.guild) {
    await replyEphemeral(
      interaction,
      "Run this command in a server with a **#class-e-sentences** channel."
    );
    return;
  }

  const tabName = resolveCeTab(classESentence);

  if (!tabName) {
    await replyEphemeral(
      interaction,
      `Could not determine the duration from "${sanitizeForDisplay(classESentence)}". Use a value like "3 days", "2 weeks", "1 month", or "Permanent".`
    );
    return;
  }

  const permanent = isPermanentTab(tabName);

  if (permanent) {
    if (!authorization || !banned) {
      await replyEphemeral(
        interaction,
        "Permanent sentences require **authorization** and **banned** (Yes/No)."
      );
      return;
    }
  } else if (!rankPostInfraction) {
    await replyEphemeral(
      interaction,
      "Please choose a **rank_post_infraction** (CD, CE, or L0–L5)."
    );
    return;
  }

  const officer = await resolveOfficerName(interaction);
  const refId = interaction.id.slice(-8).toUpperCase();
  const submittedAt = interaction.createdAt;
  const filedAt = splitDateAndTime(submittedAt);

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    const channel = await resolveClassESentencesChannel(interaction.guild);

    if (!channel) {
      throw new Error(
        "Could not find #class-e-sentences. Create that channel or set CLASS_E_CHANNEL_ID in .env."
      );
    }

    let rowNumber;

    if (permanent) {
      rowNumber = await appendRowToTab(
        tabName,
        {
          [cePermanentColumns.offender]: offender,
          [cePermanentColumns.codesBroken]: codesBroken,
          [cePermanentColumns.authorization]: authorization,
          [cePermanentColumns.banned]:
            banned.toLowerCase() === "yes" ? "TRUE" : "",
        },
        cePermanentColumns.offender
      );
    } else {
      const sentenceDays = parseSentenceDays(classESentence);
      const rowValues = {
        [ceColumns.offender]: offender,
        [ceColumns.codesBroken]: codesBroken,
        [ceColumns.startDate]: formatSubmissionTimestamp(submittedAt),
        [ceColumns.classESentence]: classESentence,
        [ceColumns.rankPostInfraction]: rankPostInfraction,
      };

      if (sentenceDays !== null && !Number.isNaN(sentenceDays)) {
        const endDate = new Date(
          submittedAt.getTime() + sentenceDays * 24 * 60 * 60 * 1000
        );
        rowValues[ceColumns.endDate] = formatSubmissionTimestamp(endDate);
      }

      rowNumber = await appendRowToTab(tabName, rowValues, ceColumns.offender);
    }

    const confirmation = `Class-E sentence filed for **${sanitizeForDisplay(offender)}** in tab **${tabName}** (row ${rowNumber}).`;

    const payload = buildCeSentenceReply({
      offender,
      codesBroken,
      classESentence,
      punishment,
      rankPostInfraction: permanent ? "" : rankPostInfraction,
      authorization: permanent ? authorization : "",
      banned: permanent ? banned : "",
      notes,
      officer,
      refId,
      filedAt,
      evidenceItems,
    });

    const posted = await channel.send({
      content: confirmation,
      ...payload,
      components: [buildPointsButtonRow()],
    });

    if (!permanent) {
      const messageLink = buildDiscordMessageLink(interaction, posted);
      await writeCellOnTab(
        tabName,
        rowNumber,
        ceColumns.messageLink,
        buildSheetHyperlink(messageLink)
      );
    }

    await clearDeferredReply(interaction);

    console.log(
      `Class-E sentence filed for ${offender} by ${officer} (tab "${tabName}", row ${rowNumber})`
    );
  } catch (err) {
    console.error("Class-E sentence failed:", err);

    try {
      await interaction.editReply({
        content: `Could not file Class-E sentence: ${err.message}`,
      });
    } catch (replyErr) {
      console.error("Could not send Class-E error reply:", replyErr.message);
    }
  }
}

async function handleCite(interaction) {
  if (!interaction.guild) {
    await replyEphemeral(
      interaction,
      "Run this command in a server with a **#citations** channel."
    );
    return;
  }

  const offender = normalizeInput(interaction.options.getString("offender"));
  const infractions = normalizeInput(
    interaction.options.getString("infractions")
  );
  const amountPaid = normalizeInput(
    interaction.options.getString("amount_paid")
  );
  const fineMessage = normalizeInput(
    interaction.options.getString("fine_message")
  );

  if (!offender || !infractions || !amountPaid || !fineMessage) {
    await replyEphemeral(
      interaction,
      "Please provide **offender**, **infractions**, **amount_paid**, and **fine_message**."
    );
    return;
  }

  const processedBy = await resolveOfficerName(interaction);

  const evidenceItems = evidenceFromCommandOptions(
    interaction,
    normalizeInput,
    MULTI_EVIDENCE_FILE_OPTION_NAMES
  );

  const paidAt = interaction.createdAt;
  const refId = interaction.id.slice(-8).toUpperCase();
  const record = {
    offender,
    infractions,
    amountPaid,
    fineMessage,
    officer: "",
    refNo: "",
  };

  const payload = buildPaidCitationReply({
    record,
    processedBy,
    paidAt,
    refId,
    evidenceItems,
  });

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    const citationsChannel = await resolveCitationsChannel(interaction.guild);

    if (!citationsChannel) {
      throw new Error(
        "Could not find #citations. Create that channel or set CITATIONS_CHANNEL_ID in .env."
      );
    }

    const confirmation = `Citation logged for **${sanitizeForDisplay(offender)}**.`;

    const posted = await citationsChannel.send({
      content: confirmation,
      ...payload,
      components: [buildPointsButtonRow()],
    });

    await clearDeferredReply(interaction);

    console.log(
      `/cite filed for ${offender} by ${interaction.user.tag} (${evidenceItems.length} evidence item(s))`
    );
  } catch (err) {
    console.error("Cite command failed:", err);

    try {
      await interaction.editReply({
        content: `Could not file citation: ${err.message}`,
      });
    } catch (replyErr) {
      console.error("Could not send cite error reply:", replyErr.message);
    }
  }
}

async function handleOutstandingDelete(interaction) {
  const username = normalizeInput(interaction.options.getString("username"));

  if (!username) {
    await replyEphemeral(interaction, "Please provide a username.");
    return;
  }

  const screenshot = interaction.options.getAttachment("screenshot");

  if (!screenshot) {
    await replyEphemeral(
      interaction,
      "Please attach a payment screenshot to the command."
    );
    return;
  }

  if (!interaction.guild) {
    await replyEphemeral(
      interaction,
      "Run this command in a server with a **#citations** channel."
    );
    return;
  }

  const processedBy = await resolveOfficerName(interaction);

  const screenshotItems = screenshotFromDeleteCommand(interaction);
  const paidAt = interaction.createdAt;

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    let sheetMatches = [];

    try {
      sheetMatches = await findAllCitationsByOffender(sheetName, username);
    } catch (err) {
      console.error("Sheet lookup failed:", err.message);
    }

    const lookupName = sheetMatches[0]?.offender || username;
    const messageLinks = sheetMatches
      .map((match) => match.messageLink)
      .filter(Boolean);
    const citationMessages = await gatherCitationLogMessages(
      interaction.client,
      interaction,
      lookupName,
      messageLinks
    );

    if (!citationMessages.length && !sheetMatches.length) {
      await interaction.editReply({
        content: `No outstanding citation found for **${sanitizeForDisplay(lookupName)}** in the spreadsheet or channel history.`,
      });
      return;
    }

    const paidPayloads = [];
    const entryCount = Math.max(citationMessages.length, sheetMatches.length, 1);

    for (let i = 0; i < entryCount; i++) {
      const sheetMatch = sheetMatches[i] ?? sheetMatches[0];
      let sourceMessage = citationMessages[i] ?? null;

      if (!sourceMessage && sheetMatch?.messageLink) {
        try {
          sourceMessage = await fetchDiscordMessage(
            interaction.client,
            sheetMatch.messageLink
          );
        } catch (err) {
          console.warn(
            "Could not fetch citation from sheet message link:",
            err.message
          );
        }
      }

      const discordParsed = sourceMessage
        ? parseCitationFromDiscordMessage(sourceMessage)
        : null;
      const record = mergeCitationRecord({
        sheetFields: sheetMatch?.fields ?? sheetMatches[0]?.fields,
        discordParsed,
        usernameFallback: lookupName,
      });

      let citationEvidence = [];

      if (sourceMessage) {
        try {
          const citationImages = await extractCitationImagesFromMessage(
            sourceMessage,
            interaction.client
          );
          const citationLinks = await extractCitationLinksFromMessage(
            sourceMessage,
            interaction.client
          );
          citationEvidence = mergeEvidenceItems(
            await materializeEvidenceForUpload(citationImages),
            citationLinks
          );

          if (!citationEvidence.length) {
            console.warn(
              `No evidence recovered from outstanding citation message ${sourceMessage.id} (${sourceMessage.attachments.size} attachment(s), ${citationImages.length} image URL(s), ${citationLinks.length} link(s)).`
            );
          } else {
            console.log(
              `Recovered ${citationImages.length} image(s) and ${citationLinks.length} link(s) from citation message ${sourceMessage.id}`
            );
          }
        } catch (err) {
          console.warn("Could not read evidence from citation log:", err.message);
        }
      }

      const paymentEvidence = await materializeEvidenceForUpload(
        screenshotItems
      );
      const paidEvidence = mergeEvidenceItems(
        citationEvidence,
        paymentEvidence
      );
      const paidRefId = `${interaction.id.slice(-6)}${i + 1}`.toUpperCase();
      paidPayloads.push(
        buildPaidCitationReply({
          record,
          processedBy,
          paidAt,
          refId: paidRefId,
          evidenceItems: paidEvidence,
        })
      );
    }

    let discordDeletedCount = 0;

    try {
      discordDeletedCount = await deleteGatheredCitationLogs(
        interaction.client,
        messageLinks,
        citationMessages
      );
    } catch (err) {
      console.error("Discord citation delete failed:", err.message);
    }

    const rowNumbers = [
      ...new Set(sheetMatches.map((match) => match.rowNumber)),
    ].sort((a, b) => b - a);
    let sheetDeletedCount = 0;

    for (const rowNumber of rowNumbers) {
      try {
        await deleteSheetRow(sheetName, rowNumber);
        sheetDeletedCount++;
      } catch (err) {
        console.error(`Sheet row ${rowNumber} delete failed:`, err.message);
      }
    }

    const displayName = sanitizeForDisplay(lookupName);
    const discordDeleted = discordDeletedCount > 0;
    const sheetDeleted = sheetDeletedCount > 0;

    if (!sheetDeleted && !discordDeleted && !paidPayloads.length) {
      await interaction.editReply({
        content: `No outstanding citation found for **${displayName}** in the spreadsheet or channel history.`,
      });
      return;
    }

    let content = buildCitationPaidMessage(displayName, processedBy);

    if (paidPayloads.length > 1) {
      content += `\n_${paidPayloads.length} citation logs created._`;
    }

    if (sheetDeleted && !discordDeleted) {
      content +=
        "\n_(Spreadsheet row(s) removed; no matching citation log was found in Discord.)_";
    } else if (discordDeleted && !sheetDeleted) {
      content +=
        "\n_(Citation log(s) removed from Discord; no matching spreadsheet row was found.)_";
    } else if (
      sheetMatches.length !== citationMessages.length &&
      sheetMatches.length &&
      citationMessages.length
    ) {
      content += `\n_(Discord logs: ${citationMessages.length}, spreadsheet rows: ${sheetMatches.length}.)_`;
    }

    let posted = false;
    const paidLogLinks = [];

    try {
      const citationsChannel = await resolveCitationsChannel(interaction.guild);

      if (!citationsChannel) {
        throw new Error(
          "Could not find #citations. Create that channel or set CITATIONS_CHANNEL_ID in .env."
        );
      }

      for (const payload of paidPayloads) {
        const paidMessage = await citationsChannel.send({
          ...payload,
          components: [buildPointsButtonRow()],
        });
        paidLogLinks.push(buildDiscordMessageLink(interaction, paidMessage));
      }

      posted = true;
      console.log(
        `Paid citation log(s) posted to #${citationsChannel.name} (${paidPayloads.length})`
      );
    } catch (err) {
      console.error("Paid citation log post failed:", err.message);
      content += `\n_(Paid citation log could not be posted: ${err.message})_`;
    }

    if (sheetDeleted || discordDeleted) {
      await auditLogFiling(interaction, {
        action: "/outstanding delete",
        executor: processedBy,
        subject: displayName,
        links: paidLogLinks,
        note: `Sheet rows removed: ${sheetDeletedCount}, Discord logs removed: ${discordDeletedCount}.`,
      });
    }

    try {
      const outstandingChannel = await resolveOutstandingCitationsChannel(
        interaction.guild
      );

      if (outstandingChannel) {
        await outstandingChannel.send({
          content: buildCitationPaidMessage(displayName, processedBy),
        });
      }
    } catch (err) {
      console.warn(
        "Could not post paid notice to outstanding-citations:",
        err.message
      );
    }

    if (posted) {
      await clearDeferredReply(interaction);
    } else {
      await interaction.editReply({ content });
    }

    console.log(
      `Citation paid for ${displayName} (sheet=${sheetDeletedCount}, discord=${discordDeletedCount}, logs=${paidPayloads.length})`
    );
  } catch (err) {
    console.error("Citation delete failed:", err);

    try {
      await interaction.editReply({
        content: `Could not remove citation: ${err.message}`,
      });
    } catch (replyErr) {
      console.error("Could not send delete error reply:", replyErr.message);
    }
  }
}

async function completeCitation(session, evidenceItems) {
  const { interaction, values, officer, refId, submittedAt, fineMessage } =
    session;

  try {
    const rowNumber = await appendSubmission(sheetName, values);

    const payload = buildOutstandingCitationReply({
      officer,
      refId,
      values,
      submittedAt,
      evidenceItems,
      fineMessage,
    });

    const offenderName = sanitizeForDisplay(
      normalizeInput(interaction.options.getString("offender"))
    );
    const confirmation = `Outstanding citation filed for **${offenderName || "member"}**.`;

    const targetChannel =
      (await resolveOutstandingCitationsChannel(interaction.guild)) ??
      interaction.channel;
    const citationMessage = await targetChannel.send({
      content: confirmation,
      ...payload,
    });

    if (citationMessage) {
      const messageLink = buildDiscordMessageLink(interaction, citationMessage);
      await writeFieldOnRow(
        sheetName,
        rowNumber,
        "outstanding_message_link",
        buildSheetHyperlink(messageLink)
      );
      console.log(`Outstanding message link saved: ${messageLink}`);
    }

    await clearDeferredReply(interaction);

    console.log(
      `Citation filed for ${officer} (${evidenceItems.length} evidence item(s)).`
    );
  } catch (err) {
    console.error("Citation submit failed:", err);

    try {
      await interaction.editReply(buildCitationErrorReply(err.message));
    } catch (replyErr) {
      console.error("Could not send error reply:", replyErr.message);
    }
  }
}

if (!token) {
  console.error("Set DISCORD_TOKEN in .env");
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
  ],
});

client.once(Events.ClientReady, async (c) => {
  console.log(`Logged in as ${c.user.tag}`);
  console.log(
    "Listening for slash commands, modals, and point authorization buttons…"
  );
  console.log("Keep only ONE bot window open.");

  try {
    await warmSheetClient();
    console.log("Google Sheets client ready.");
    startMonthlyJobsResetScheduler();
  } catch (err) {
    console.error("Google Sheets warm-up failed:", err.message);
    if (!process.env.GOOGLE_CREDENTIALS_JSON?.trim()) {
      console.error(
        "Set variable GOOGLE_CREDENTIALS_JSON in Railway (full service account JSON), then redeploy."
      );
    }
  }
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (interaction.isModalSubmit() && interaction.customId === REGISTER_MODAL_ID) {
    try {
      await handleRegisterModalSubmit(interaction);
    } catch (err) {
      console.error("Register modal submit failed:", err);
    }
    return;
  }

  if (
    interaction.isModalSubmit() &&
    interaction.customId.startsWith(INTERVIEW_MODAL_PREFIX)
  ) {
    try {
      await handleInterviewModalSubmit(interaction);
    } catch (err) {
      console.error("Interview modal submit failed:", err);
    }
    return;
  }

  if (
    interaction.isButton() &&
    interaction.customId.startsWith(POINTS_BUTTON_PREFIX)
  ) {
    try {
      await handlePointsButton(interaction);
    } catch (err) {
      console.error("Points button failed:", err);
    }
    return;
  }

  if (!interaction.isChatInputCommand()) {
    return;
  }

  if (!OPEN_COMMANDS.has(interaction.commandName)) {
    let registeredName = "";

    try {
      registeredName = await getRegisteredUsername(interaction.user.id);
    } catch (err) {
      console.error("Registration check failed:", err.message);
      try {
        await interaction.reply({
          content:
            "Could not verify your registration right now. Please try again in a moment.",
          flags: MessageFlags.Ephemeral,
        });
      } catch (replyErr) {
        console.error("Could not send registration error:", replyErr.message);
      }
      return;
    }

    if (!registeredName) {
      try {
        await interaction.reply({
          content:
            "You must register first. Run **/register** and enter your username before using this command.",
          flags: MessageFlags.Ephemeral,
        });
      } catch (err) {
        console.error("Could not send registration prompt:", err.message);
      }
      return;
    }
  }

  // Channel restriction: each command may be locked to a specific channel.
  {
    const subForChannel = interaction.options.getSubcommand(false);
    const required = requiredChannelForCommand(
      interaction.commandName,
      subForChannel
    );

    if (required && interaction.channelId !== required.id) {
      try {
        await interaction.reply({
          content: `This command can only be used in <#${required.id}>.`,
          flags: MessageFlags.Ephemeral,
        });
      } catch (err) {
        console.error("Could not send channel restriction notice:", err.message);
      }
      return;
    }
  }

  if (interaction.commandName === "interview") {
    try {
      await handleInterview(interaction);
    } catch (err) {
      console.error("Interview command failed:", err);
    }
    return;
  }

  if (interaction.commandName === "register") {
    try {
      await handleRegister(interaction);
    } catch (err) {
      console.error("Register command failed:", err);
    }
    return;
  }

  if (interaction.commandName === "registry") {
    try {
      await handleRegistry(interaction);
    } catch (err) {
      console.error("Registry command failed:", err);
    }
    return;
  }

  if (interaction.commandName === "help") {
    try {
      await interaction.reply({
        content: buildHelpText(),
      });
    } catch (err) {
      console.error("Help command failed:", err);
    }
    return;
  }

  if (interaction.commandName === "ce") {
    const ceSub = interaction.options.getSubcommand(false);

    if (ceSub === "sentence") {
      try {
        await handleCeSentences(interaction);
      } catch (err) {
        console.error("Class-E sentences command failed:", err);
      }
    } else if (ceSub === "delete") {
      try {
        await handleCeDelete(interaction);
      } catch (err) {
        console.error("Class-E delete command failed:", err);
      }
    }
    return;
  }

  if (interaction.commandName === "spectator") {
    try {
      await handleSpectator(interaction);
    } catch (err) {
      console.error("Spectator command failed:", err);
    }
    return;
  }

  if (interaction.commandName === "seminar") {
    try {
      await handleSeminar(interaction);
    } catch (err) {
      console.error("Seminar command failed:", err);
    }
    return;
  }

  if (interaction.commandName === "cite") {
    try {
      await handleCite(interaction);
    } catch (err) {
      console.error("Cite command failed:", err);
    }
    return;
  }

  if (interaction.commandName !== "outstanding") {
    return;
  }

  const subcommand = interaction.options.getSubcommand(false);

  if (subcommand === "delete") {
    try {
      await handleOutstandingDelete(interaction);
    } catch (err) {
      console.error("Delete command failed:", err);
    }
    return;
  }

  if (subcommand === "sentences") {
    try {
      await handleOutstandingSentences(interaction);
    } catch (err) {
      console.error("Sentences command failed:", err);
    }
    return;
  }

  if (subcommand !== "citation") {
    return;
  }

  if (!interaction.guild) {
    await replyEphemeral(
      interaction,
      "Run this command in a server with an **#outstanding-citations** channel."
    );
    return;
  }

  const officer = await resolveOfficerName(interaction);
  const refId = interaction.id.slice(-8).toUpperCase();
  const submittedAt = interaction.createdAt;
  const values = buildSubmissionValues(interaction);
  const fineMessage = normalizeInput(
    interaction.options.getString("fine_message")
  );

  if (!fineMessage) {
    await replyEphemeral(
      interaction,
      "Please provide a fine message on the command."
    );
    return;
  }

  const commandEvidence = evidenceFromCommandOptions(
    interaction,
    normalizeInput,
    MULTI_EVIDENCE_FILE_OPTION_NAMES
  );

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  console.log(`/outstanding citation from ${interaction.user.tag}`);

  await completeCitation(
    { interaction, values, officer, refId, submittedAt, fineMessage },
    commandEvidence
  );
});

const pointsLocks = new Map();

/** Serialize point operations per message to avoid double-counting races. */
function withMessageLock(messageId, fn) {
  const prev = pointsLocks.get(messageId) ?? Promise.resolve();
  const next = prev.then(fn, fn);
  pointsLocks.set(
    messageId,
    next.finally(() => {
      if (pointsLocks.get(messageId) === next) {
        pointsLocks.delete(messageId);
      }
    })
  );
  return next;
}

async function memberHasAuthRole(guild, userId) {
  try {
    const member = await guild.members.fetch(userId);
    return member.roles.cache.has(POINTS_AUTH_ROLE_ID);
  } catch (err) {
    console.warn(`Could not fetch member ${userId}:`, err.message);
    return false;
  }
}

const POINTS_BUTTON_PREFIX = "points_auth:";

/** Build the authorize/undo points button row (state 1 = already authorized). */
function buildPointsButtonRow(state = 0) {
  const button = new ButtonBuilder()
    .setCustomId(`${POINTS_BUTTON_PREFIX}${state}`)
    .setEmoji(POINTS_EMOJI)
    .setLabel(state ? "Point authorized" : "Authorize point")
    .setStyle(state ? ButtonStyle.Success : ButtonStyle.Secondary);

  return new ActionRowBuilder().addComponents(button);
}

/** Read the current authorized state (0/1) from a message's points button. */
function readPointsButtonState(message) {
  const customId = message.components?.[0]?.components?.[0]?.customId ?? "";
  return customId.endsWith(":1") ? 1 : 0;
}

async function handlePointsButton(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    if (!interaction.guild) {
      await interaction.editReply({ content: "This only works in a server." });
      return;
    }

    const column = POINTS_CHANNEL_COLUMNS[interaction.channelId];

    if (!column) {
      await interaction.editReply({
        content: "This log isn't tracked for points.",
      });
      return;
    }

    if (!(await memberHasAuthRole(interaction.guild, interaction.user.id))) {
      await interaction.editReply({
        content: "You don't have permission to authorize points.",
      });
      return;
    }

    await withMessageLock(interaction.message.id, async () => {
      const currentState = readPointsButtonState(interaction.message);
      const delta = currentState === 1 ? -1 : 1;
      const newState = currentState === 1 ? 0 : 1;

      const officer = parseOfficerFromMessage(interaction.message);

      if (!officer) {
        await interaction.editReply({
          content: "Could not read the officer from this log.",
        });
        return;
      }

      const result = await adjustOfficerPoints(officer, column, delta);
      const jobLabel = POINTS_COLUMN_LABELS[column] ?? "job";

      if (!result.ok) {
        await interaction.editReply({
          content:
            result.reason === "officer-not-found"
              ? `⚠️ **${officer}** was not found in the points sheet (column C). Check the name matches.`
              : `Could not update points (${result.reason}).`,
        });
        return;
      }

      await interaction.message.edit({
        components: [buildPointsButtonRow(newState)],
      });

      await interaction.editReply({
        content:
          delta > 0
            ? `✅ ${jobLabel} point logged for **${officer}**. ${jobLabel} total: **${result.next}** · Monthly jobs: **${result.monthlyNext}** · Total jobs: **${result.totalJobs}**.`
            : `↩️ ${jobLabel} point removed for **${officer}**. ${jobLabel} total: **${result.next}** · Monthly jobs: **${result.monthlyNext}** · Total jobs: **${result.totalJobs}**.`,
      });

      try {
        const logChannel = await resolvePointsLogChannel(interaction.guild);

        if (logChannel) {
          const logLink = buildDiscordMessageLink(
            interaction,
            interaction.message
          );
          await logChannel.send({
            content:
              delta > 0
                ? `💻 **${interaction.user.username}** authorized a **${jobLabel}** point for **${sanitizeForDisplay(officer)}** (${jobLabel}: ${result.next}, monthly: ${result.monthlyNext}, total jobs: ${result.totalJobs}). ${logLink}`
                : `↩️ **${interaction.user.username}** removed a **${jobLabel}** point from **${sanitizeForDisplay(officer)}** (${jobLabel}: ${result.next}, monthly: ${result.monthlyNext}, total jobs: ${result.totalJobs}). ${logLink}`,
          });
        }
      } catch (err) {
        console.warn("Could not post points audit log:", err.message);
      }

      console.log(
        `Points ${delta > 0 ? "+1" : "-1"} (${column}) for ${officer} → ${result.next} by ${interaction.user.tag}`
      );
    });
  } catch (err) {
    console.error("Points button failed:", err);

    try {
      await interaction.editReply({
        content: `Something went wrong: ${err.message}`,
      });
    } catch (replyErr) {
      console.error("Could not send points error reply:", replyErr.message);
    }
  }
}

client.on("error", (err) => console.error("Discord client error:", err));

process.on("unhandledRejection", (err) => {
  console.error("Unhandled error:", err);
});

client.login(token);
