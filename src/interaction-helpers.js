import { MessageFlags } from "discord.js";

/** Reply privately to a validation/early-return error (keeps channels clean). */
export async function replyEphemeral(interaction, content) {
  try {
    await interaction.reply({ content, flags: MessageFlags.Ephemeral });
  } catch (err) {
    console.error("Could not send validation reply:", err.message);
  }
}

/** Use after a central defer, or before defer when validation may run either way. */
export async function replyOrEditEphemeral(interaction, content) {
  try {
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply({ content });
    } else {
      await interaction.reply({ content, flags: MessageFlags.Ephemeral });
    }
  } catch (err) {
    console.error("Could not send validation reply:", err.message);
  }
}

export async function clearDeferredReply(interaction) {
  try {
    await interaction.deleteReply();
  } catch (err) {
    console.warn("Could not clear command reply:", err.message);
  }
}

/** Reply when a handler throws before Discord got any response. */
export async function failInteraction(interaction, err, fallback = "Something went wrong.") {
  const detail = err?.message ? String(err.message) : "";
  const content = detail ? `${fallback} (${detail})` : fallback;

  try {
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply({ content });
    } else if (interaction.isRepliable()) {
      await interaction.reply({ content, flags: MessageFlags.Ephemeral });
    }
  } catch (replyErr) {
    console.error("Could not send failure reply:", replyErr.message);
  }
}

/**
 * Acknowledge repliable interactions within Discord's 3-second window.
 * Skips commands/buttons that must show a modal instead of deferring.
 */
export async function acknowledgeInteraction(interaction, { skipModal = false } = {}) {
  if (!interaction.isRepliable()) {
    return true;
  }

  if (interaction.deferred || interaction.replied) {
    return true;
  }

  if (skipModal) {
    return true;
  }

  try {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    return true;
  } catch (err) {
    const target =
      interaction.isChatInputCommand?.() && interaction.commandName
        ? `/${interaction.commandName}`
        : interaction.customId || "interaction";

    if (err?.code === 10062) {
      console.error(
        `Could not acknowledge ${target}: Unknown interaction — another bot instance likely answered first (stop Railway/extra node windows, then use start-bot.bat).`
      );
    } else {
      console.error(`Could not acknowledge ${target}:`, err.message);
    }

    return false;
  }
}
