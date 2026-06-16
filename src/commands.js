import { SlashCommandBuilder } from "discord.js";
import { citationDiscordFields, commandFields } from "./config.js";
import { ceBannedChoices, ceRankChoices } from "./ce-config.js";
import { AWARD_JOB_TYPE_CHOICES } from "./points-config.js";

/**
 * Single source of truth for every slash command.
 *
 * Both command registration (register-commands.js) and the /help listing
 * (buildHelpText) are derived from these builders, so any command added here
 * is automatically registered AND shown in /help with no extra steps.
 */
export function buildCommands() {
  const outstanding = new SlashCommandBuilder()
    .setName("outstanding")
    .setDescription("Outstanding member records")
    .addSubcommand((sub) => {
      sub
        .setName("citation")
        .setDescription(
          "Submit outstanding member information to the database (Google Sheet)"
        );

      for (const field of commandFields) {
        sub.addStringOption((opt) => {
          opt
            .setName(field.name)
            .setDescription(field.description)
            .setRequired(Boolean(field.required));

          if (field.maxLength) {
            opt.setMaxLength(field.maxLength);
          }

          if (field.choices?.length) {
            opt.addChoices(
              ...field.choices.map((choice) => ({
                name: choice,
                value: choice,
              }))
            );
          }

          return opt;
        });
      }

      for (const field of citationDiscordFields) {
        sub.addStringOption((opt) => {
          opt
            .setName(field.name)
            .setDescription(field.description)
            .setRequired(Boolean(field.required));

          if (field.maxLength) {
            opt.setMaxLength(field.maxLength);
          }

          return opt;
        });
      }

      sub.addStringOption((opt) =>
        opt
          .setName("evidence_link")
          .setDescription(
            "Optional evidence link(s) — paste multiple URLs separated by spaces or new lines"
          )
          .setRequired(false)
          .setMaxLength(1000)
      );

      sub.addAttachmentOption((opt) =>
        opt
          .setName("evidence_file")
          .setDescription("Evidence — drag image/video into the box")
          .setRequired(false)
      );
      sub.addAttachmentOption((opt) =>
        opt
          .setName("evidence_file_2")
          .setDescription("Optional second evidence file")
          .setRequired(false)
      );
      sub.addAttachmentOption((opt) =>
        opt
          .setName("evidence_file_3")
          .setDescription("Optional third evidence file")
          .setRequired(false)
      );
      sub.addAttachmentOption((opt) =>
        opt
          .setName("evidence_file_4")
          .setDescription("Optional fourth evidence file")
          .setRequired(false)
      );

      return sub;
    })
    .addSubcommand((sub) =>
      sub
        .setName("sentences")
        .setDescription("File an outstanding citation sentence")
        .addStringOption((opt) =>
          opt
            .setName("username")
            .setDescription(
              "Username — must match an outstanding citation in the Outstanding Citations thread"
            )
            .setRequired(true)
            .setMaxLength(500)
        )
        .addAttachmentOption((opt) =>
          opt
            .setName("screenshot")
            .setDescription("Screenshot — drag file into the attachment box")
            .setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("delete")
        .setDescription(
          "Mark citation paid — remove sheet/Discord row and post paid log to Citations"
        )
        .addStringOption((opt) =>
          opt
            .setName("username")
            .setDescription("Member username to mark as paid")
            .setRequired(true)
            .setMaxLength(500)
        )
        .addAttachmentOption((opt) =>
          opt
            .setName("screenshot")
            .setDescription(
              "Screenshot of payment (drag file into the attachment box)"
            )
            .setRequired(true)
        )
    );

  const ce = new SlashCommandBuilder()
    .setName("ce")
    .setDescription("Class-E sentence records")
    .addSubcommand((sub) =>
      sub
        .setName("sentence")
        .setDescription("File a Class-E sentence")
        .addStringOption((opt) =>
          opt
            .setName("offender")
            .setDescription("Offender username")
            .setRequired(true)
            .setMaxLength(500)
        )
        .addStringOption((opt) =>
          opt
            .setName("codes_broken")
            .setDescription("Codes broken")
            .setRequired(true)
            .setMaxLength(1000)
        )
        .addStringOption((opt) =>
          opt
            .setName("class_e_sentence")
            .setDescription(
              'Duration, e.g. "3 days", "2 weeks", "1 month", or "Permanent"'
            )
            .setRequired(true)
            .setMaxLength(200)
        )
        .addStringOption((opt) =>
          opt
            .setName("punishment")
            .setDescription("Punishment")
            .setRequired(true)
            .setMaxLength(1000)
        )
        .addStringOption((opt) =>
          opt
            .setName("rank_post_infraction")
            .setDescription("Rank after infraction (not used for Permanent)")
            .setRequired(false)
            .addChoices(
              ...ceRankChoices.map((choice) => ({ name: choice, value: choice }))
            )
        )
        .addStringOption((opt) =>
          opt
            .setName("authorization")
            .setDescription("Permanent only — who/what authorized the ban")
            .setRequired(false)
            .setMaxLength(500)
        )
        .addStringOption((opt) =>
          opt
            .setName("banned")
            .setDescription("Permanent only — is the offender banned?")
            .setRequired(false)
            .addChoices(
              ...ceBannedChoices.map((choice) => ({
                name: choice,
                value: choice,
              }))
            )
        )
        .addStringOption((opt) =>
          opt
            .setName("evidence_link")
            .setDescription(
              "Evidence link(s) — paste URLs separated by spaces or new lines"
            )
            .setRequired(false)
            .setMaxLength(1000)
        )
        .addAttachmentOption((opt) =>
          opt
            .setName("evidence_file")
            .setDescription("Evidence — drag image/video into the box")
            .setRequired(false)
        )
        .addAttachmentOption((opt) =>
          opt
            .setName("evidence_file_2")
            .setDescription("Optional second evidence file")
            .setRequired(false)
        )
        .addAttachmentOption((opt) =>
          opt
            .setName("evidence_file_3")
            .setDescription("Optional third evidence file")
            .setRequired(false)
        )
        .addAttachmentOption((opt) =>
          opt
            .setName("evidence_file_4")
            .setDescription("Optional fourth evidence file")
            .setRequired(false)
        )
        .addStringOption((opt) =>
          opt
            .setName("notes")
            .setDescription("Optional notes")
            .setRequired(false)
            .setMaxLength(1000)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("delete")
        .setDescription(
          "Delete a Class-E sentence from the spreadsheet only (when the sentence is over)"
        )
        .addStringOption((opt) =>
          opt
            .setName("offender")
            .setDescription("Offender username to remove from the Class-E tabs")
            .setRequired(true)
            .setMaxLength(500)
        )
    );

  const spectator = new SlashCommandBuilder()
    .setName("spectator")
    .setDescription("File a spectator log (posted to the Spectator thread)")
    .addStringOption((opt) =>
      opt
        .setName("username")
        .setDescription("Username")
        .setRequired(true)
        .setMaxLength(500)
    )
    .addStringOption((opt) =>
      opt
        .setName("rank")
        .setDescription("Rank of Scientist/Doctor")
        .setRequired(true)
        .setMaxLength(500)
    )
    .addStringOption((opt) =>
      opt
        .setName("comments")
        .setDescription("Comments")
        .setRequired(true)
        .setMaxLength(1000)
    )
    .addAttachmentOption((opt) =>
      opt
        .setName("screenshot")
        .setDescription("Screenshot — drag image into the box")
        .setRequired(true)
    )
    .addAttachmentOption((opt) =>
      opt
        .setName("screenshot_2")
        .setDescription("Optional second screenshot")
        .setRequired(false)
    )
    .addAttachmentOption((opt) =>
      opt
        .setName("screenshot_3")
        .setDescription("Optional third screenshot")
        .setRequired(false)
    )
    .addAttachmentOption((opt) =>
      opt
        .setName("screenshot_4")
        .setDescription("Optional fourth screenshot")
        .setRequired(false)
    );

  const interview = new SlashCommandBuilder()
    .setName("interview")
    .setDescription(
      "File an interview log — opens a form for the questions/answers (posted to the Interview thread)"
    )
    .addAttachmentOption((opt) =>
      opt
        .setName("screenshot")
        .setDescription("Screenshot — drag image into the box")
        .setRequired(true)
    )
    .addAttachmentOption((opt) =>
      opt
        .setName("screenshot_2")
        .setDescription("Optional second screenshot")
        .setRequired(false)
    )
    .addAttachmentOption((opt) =>
      opt
        .setName("screenshot_3")
        .setDescription("Optional third screenshot")
        .setRequired(false)
    )
    .addAttachmentOption((opt) =>
      opt
        .setName("screenshot_4")
        .setDescription("Optional fourth screenshot")
        .setRequired(false)
    );

  const seminar = new SlashCommandBuilder()
    .setName("seminar")
    .setDescription("File a seminar log (posted to the Seminar thread)")
    .addStringOption((opt) =>
      opt
        .setName("username")
        .setDescription("Username")
        .setRequired(true)
        .setMaxLength(500)
    )
    .addStringOption((opt) =>
      opt
        .setName("host_username")
        .setDescription("Username of host (write N/A if you are the main host)")
        .setRequired(true)
        .setMaxLength(500)
    )
    .addStringOption((opt) =>
      opt
        .setName("seminar_type")
        .setDescription("Seminar type")
        .setRequired(true)
        .setMaxLength(500)
    )
    .addAttachmentOption((opt) =>
      opt
        .setName("screenshot")
        .setDescription("Screenshot — drag image into the box")
        .setRequired(true)
    )
    .addAttachmentOption((opt) =>
      opt
        .setName("screenshot_2")
        .setDescription("Optional second screenshot")
        .setRequired(false)
    )
    .addAttachmentOption((opt) =>
      opt
        .setName("screenshot_3")
        .setDescription("Optional third screenshot")
        .setRequired(false)
    )
    .addAttachmentOption((opt) =>
      opt
        .setName("screenshot_4")
        .setDescription("Optional fourth screenshot")
        .setRequired(false)
    );

  const watchlist = new SlashCommandBuilder()
    .setName("watchlist")
    .setDescription("File a watchlist entry (posted to the Watchlist thread)")
    .addStringOption((opt) =>
      opt
        .setName("username")
        .setDescription("Username")
        .setRequired(true)
        .setMaxLength(500)
    )
    .addStringOption((opt) =>
      opt
        .setName("duration")
        .setDescription("Watchlist duration (e.g. 2 weeks, 30 days)")
        .setRequired(true)
        .setMaxLength(200)
    )
    .addStringOption((opt) =>
      opt
        .setName("reason")
        .setDescription("Reason for watchlist")
        .setRequired(true)
        .setMaxLength(1000)
    )
    .addStringOption((opt) =>
      opt
        .setName("evidence_link")
        .setDescription("Optional evidence link(s) — separate multiple URLs with spaces")
        .setRequired(false)
        .setMaxLength(1000)
    )
    .addAttachmentOption((opt) =>
      opt
        .setName("evidence_file")
        .setDescription("Optional evidence image")
        .setRequired(false)
    )
    .addAttachmentOption((opt) =>
      opt
        .setName("evidence_file_2")
        .setDescription("Optional second evidence image")
        .setRequired(false)
    );

  const longInvestigation = new SlashCommandBuilder()
    .setName("long")
    .setDescription(
      "Long-form investigation logs (Google Doc + custom point awards)"
    )
    .addSubcommand((sub) =>
      sub
        .setName("investigation")
        .setDescription(
          "File a long investigation from a Google Doc (Investigations thread)"
        )
        .addStringOption((opt) =>
          opt
            .setName("username")
            .setDescription("Username of the person being investigated")
            .setRequired(true)
            .setMaxLength(500)
        )
        .addStringOption((opt) =>
          opt
            .setName("document_link")
            .setDescription("Link to the investigation Google Doc")
            .setRequired(true)
            .setMaxLength(1000)
        )
        .addStringOption((opt) =>
          opt
            .setName("verdict")
            .setDescription("Investigation verdict")
            .setRequired(true)
            .addChoices(
              { name: "Guilty", value: "Guilty" },
              { name: "Not Guilty", value: "Not Guilty" }
            )
        )
    );

  const investigation = new SlashCommandBuilder()
    .setName("investigation")
    .setDescription(
      "File a short investigation log (form + evidence, Investigations thread)"
    )
    .addStringOption((opt) =>
      opt
        .setName("evidence_link")
        .setDescription(
          "Optional evidence link(s) — separate multiple URLs with spaces"
        )
        .setRequired(false)
        .setMaxLength(1000)
    )
    .addAttachmentOption((opt) =>
      opt
        .setName("evidence_file")
        .setDescription("Optional evidence image or video")
        .setRequired(false)
    )
    .addAttachmentOption((opt) =>
      opt
        .setName("evidence_file_2")
        .setDescription("Optional second evidence file")
        .setRequired(false)
    )
    .addAttachmentOption((opt) =>
      opt
        .setName("evidence_file_3")
        .setDescription("Optional third evidence file")
        .setRequired(false)
    )
    .addAttachmentOption((opt) =>
      opt
        .setName("evidence_file_4")
        .setDescription("Optional fourth evidence file")
        .setRequired(false)
    );

  const cite = new SlashCommandBuilder()
    .setName("cite")
    .setDescription(
      "File a paid citation log in the Citations thread (same format as a paid outstanding citation)"
    )
    .addStringOption((opt) =>
      opt
        .setName("offender")
        .setDescription("Offender username")
        .setRequired(true)
        .setMaxLength(500)
    )
    .addStringOption((opt) =>
      opt
        .setName("infractions")
        .setDescription("Infractions")
        .setRequired(true)
        .setMaxLength(1000)
    )
    .addStringOption((opt) =>
      opt
        .setName("amount_paid")
        .setDescription("Amount paid")
        .setRequired(true)
        .setMaxLength(200)
    )
    .addStringOption((opt) =>
      opt
        .setName("fine_message")
        .setDescription("Fine message")
        .setRequired(true)
        .setMaxLength(1000)
    )
    .addStringOption((opt) =>
      opt
        .setName("evidence_link")
        .setDescription(
          "Optional evidence link(s) — paste multiple URLs separated by spaces or new lines"
        )
        .setRequired(false)
        .setMaxLength(1000)
    )
    .addAttachmentOption((opt) =>
      opt
        .setName("evidence_file")
        .setDescription("Evidence — drag image/video into the box")
        .setRequired(false)
    )
    .addAttachmentOption((opt) =>
      opt
        .setName("evidence_file_2")
        .setDescription("Optional second evidence file")
        .setRequired(false)
    )
    .addAttachmentOption((opt) =>
      opt
        .setName("evidence_file_3")
        .setDescription("Optional third evidence file")
        .setRequired(false)
    )
    .addAttachmentOption((opt) =>
      opt
        .setName("evidence_file_4")
        .setDescription("Optional fourth evidence file")
        .setRequired(false)
    );

  const register = new SlashCommandBuilder()
    .setName("register")
    .setDescription(
      "Register your officer username for logs (opens a form — run again to update)"
    );

  const award = new SlashCommandBuilder()
    .setName("award")
    .setDescription("Award job points on the points sheet (auth role only)")
    .addSubcommand((sub) =>
      sub
        .setName("point")
        .setDescription("Add career and monthly job points for an officer")
        .addStringOption((opt) =>
          opt
            .setName("username")
            .setDescription("Officer username (must match column C on points sheet)")
            .setRequired(true)
            .setMaxLength(500)
        )
        .addStringOption((opt) =>
          opt
            .setName("job_type")
            .setDescription("Job type to credit")
            .setRequired(true)
            .addChoices(...AWARD_JOB_TYPE_CHOICES)
        )
        .addIntegerOption((opt) =>
          opt
            .setName("points")
            .setDescription("How many points to add")
            .setRequired(true)
            .setMinValue(1)
            .setMaxValue(999)
        )
    );

  const registry = new SlashCommandBuilder()
    .setName("registry")
    .setDescription("View or manage the officer registry")
    .addSubcommand((sub) =>
      sub
        .setName("stats")
        .setDescription(
          "Your job counts on the points sheet (monthly + career totals)"
        )
        .addStringOption((opt) =>
          opt
            .setName("username")
            .setDescription(
              "Look up another officer (points-auth role only)"
            )
            .setRequired(false)
            .setMaxLength(500)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("list")
        .setDescription(
          "List everyone who registered with /register and their usernames"
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("delete")
        .setDescription("Remove a member from the registry")
        .addUserOption((opt) =>
          opt
            .setName("member")
            .setDescription("Member to remove from the registry")
            .setRequired(true)
        )
    );

  const help = new SlashCommandBuilder()
    .setName("help")
    .setDescription("List all commands and what they do");

  return [
    outstanding,
    ce,
    spectator,
    interview,
    seminar,
    watchlist,
    longInvestigation,
    investigation,
    cite,
    register,
    award,
    registry,
    help,
  ];
}

const SUBCOMMAND_TYPE = 1;
const SUBCOMMAND_GROUP_TYPE = 2;

/** Build a readable /help listing from the command definitions. */
export function buildHelpText() {
  const blocks = [];

  for (const command of buildCommands()) {
    const json = command.toJSON();
    const subcommands = (json.options ?? []).filter(
      (opt) =>
        opt.type === SUBCOMMAND_TYPE || opt.type === SUBCOMMAND_GROUP_TYPE
    );

    const group = [];

    if (subcommands.length) {
      for (const sub of subcommands) {
        group.push(`\`/${json.name} ${sub.name}\` — ${sub.description}`);
      }
    } else {
      group.push(`\`/${json.name}\` — ${json.description}`);
    }

    blocks.push(group.join("\n"));
  }

  const header =
    "**📖 Command Guide** · run **/register** once before using anything else";

  return [header, ...blocks].join("\n\n");
}
