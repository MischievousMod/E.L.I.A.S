/** Sheet columns and matching /outstanding citation options (order matters). */
export const fieldDefinitions = [
  {
    name: "outstanding_message_link",
    label: "Outstanding Message Link",
    column: "L",
    headerAliases: ["message link", "citation link", "discord link"],
    /** Filled with the Discord link to the posted citation message. */
    auto: true,
  },
  {
    name: "offender",
    label: "Offender",
    column: "B",
    headerAliases: ["username", "user name", "name", "member"],
    description: "Offender username",
    required: true,
    maxLength: 500,
  },
  {
    name: "rank",
    label: "Rank",
    column: "C",
    headerAliases: ["level"],
    description: "Member rank level",
    required: true,
    choices: ["L0", "L1", "L2", "L3", "L4", "L5"],
  },
  {
    name: "infractions",
    label: "Infractions",
    column: "F",
    headerAliases: ["infraction", "notes"],
    description: "Infraction count or notes",
    required: true,
    maxLength: 1000,
  },
  {
    name: "amount_owed",
    label: "Amount Owed",
    column: "G",
    headerAliases: ["amount", "owed", "balance"],
    description: "Amount owed (e.g. 0, 25.50, $100)",
    required: true,
    maxLength: 200,
  },
  {
    name: "start_date",
    label: "Start Date",
    column: "H",
    headerAliases: ["date", "start", "started"],
    /** Filled from the slash-command submission time, not user input. */
    auto: true,
  },
];

/** Fields shown on /outstanding citation (excludes auto-filled sheet columns). */
export const commandFields = fieldDefinitions.filter((field) => !field.auto);

/** Discord citation embed only — not saved to the spreadsheet. */
export const citationDiscordFields = [
  {
    name: "fine_message",
    label: "Fine Message",
    description: "Message about the fine",
    required: true,
    maxLength: 1000,
  },
];

/** Last column letter used when building a row. */
export const lastDataColumn = "L";
