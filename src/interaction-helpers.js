import { MessageFlags } from "discord.js";

/** Reply privately to a validation/early-return error (keeps channels clean). */
export async function replyEphemeral(interaction, content) {
  try {
    await interaction.reply({ content, flags: MessageFlags.Ephemeral });
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
