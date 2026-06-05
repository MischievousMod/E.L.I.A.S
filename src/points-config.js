/** Configuration for the button-authorized points system. */

/** Separate spreadsheet that holds the points. Override with POINTS_SPREADSHEET_ID on Railway. */
export const POINTS_SPREADSHEET_ID =
  process.env.POINTS_SPREADSHEET_ID?.trim() ||
  "1GOah1JPDp7n-A4DkJV4AvA0z65dF_7-ZHcFvTB7MNDg";

/** Tab within the points spreadsheet. */
export const POINTS_TAB = "Ethics Committee";

/** Column holding the ROBLOX/Discord name used to match the officer on a slip. */
export const POINTS_OFFICER_COLUMN = "C";

/** Only members with this role may authorize a point via the button. */
export const POINTS_AUTH_ROLE_ID = "1511867275945181325";

/** Label shown on the authorize button (💻). */
export const POINTS_EMOJI = "💻";

/** Monthly job count (resets each calendar month). */
export const POINTS_MONTHLY_JOBS_COLUMN = "K";

/**
 * Timezone for month boundaries (when column K resets). IANA name, e.g. America/New_York.
 */
export const POINTS_RESET_TIMEZONE =
  process.env.POINTS_RESET_TIMEZONE?.trim() || "UTC";

/**
 * Maps a log channel id to the points column it credits.
 * Column L (total jobs) is a spreadsheet formula and is left untouched.
 *
 *   E citations | F interviews | G spectates | H investigations |
 *   I sentences | J seminars | K monthly jobs (all types combined)
 */
export const POINTS_CHANNEL_COLUMNS = {
  "1511598741478441002": "E", // #citations (paid citation log)
  "1511806603521822800": "F", // #interview
  "1511806517228077237": "G", // #spectator
  // "<investigations channel id>": "H", // future command
  "1511806847634374837": "I", // outstanding citation sentences
  "1511806370972831825": "I", // class-e sentences
  "1511857029377949826": "J", // #seminar
};

/** Friendly label for each points column (used in confirmation DMs). */
export const POINTS_COLUMN_LABELS = {
  E: "Citation",
  F: "Interview",
  G: "Spectate",
  H: "Investigation",
  I: "Sentence",
  J: "Seminar",
};
