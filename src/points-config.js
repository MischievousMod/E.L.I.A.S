import { POINTS_CHANNEL_COLUMNS as CHANNEL_POINTS_COLUMNS } from "./channels.js";

/** Configuration for the button-authorized points system. */

/** Separate spreadsheet that holds the points. Override with POINTS_SPREADSHEET_ID on Railway. */
export const POINTS_SPREADSHEET_ID =
  process.env.POINTS_SPREADSHEET_ID?.trim() ||
  "1GOah1JPDp7n-A4DkJV4AvA0z65dF_7-ZHcFvTB7MNDg";

/** Tab within the points spreadsheet. */
export const POINTS_TAB = "Ethics Committee";

/** Column holding the ROBLOX/Discord name used to match the officer on a slip. */
export const POINTS_OFFICER_COLUMN = "C";

/** First row with officer names (row 5 on the sheet is the column header row). */
export const POINTS_FIRST_DATA_ROW = Math.max(
  2,
  Number.parseInt(process.env.POINTS_FIRST_DATA_ROW ?? "6", 10) || 6
);

/** Only members with this role may authorize a point via the button. */
export const POINTS_AUTH_ROLE_ID = "1511867275945181325";

/** Label shown on the authorize button (💻). */
export const POINTS_EMOJI = "💻";

/** Monthly job count (resets each calendar month). */
export const POINTS_MONTHLY_JOBS_COLUMN = "K";

/** Career per-type job columns (not monthly). */
export const POINTS_CAREER_COLUMNS = ["E", "F", "G", "H", "I", "J"];

/** Sheet formula total of career jobs (SUM of E–J). Bot reads only; does not write. */
export const POINTS_TOTAL_COLUMN = "L";

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
export const POINTS_CHANNEL_COLUMNS = CHANNEL_POINTS_COLUMNS;

/** Friendly label for each points column (used in confirmation DMs). */
export const POINTS_COLUMN_LABELS = {
  E: "Citation",
  F: "Interview",
  G: "Spectate",
  H: "Investigation",
  I: "Sentence",
  J: "Seminar",
};

/** Slash-command choices for /award point → career column (E–J). */
export const AWARD_JOB_TYPE_CHOICES = [
  { name: "Citation", value: "citation" },
  { name: "Interview", value: "interview" },
  { name: "Spectate", value: "spectate" },
  { name: "Investigation", value: "investigation" },
  { name: "Sentence", value: "sentence" },
  { name: "Seminar", value: "seminar" },
];

export const AWARD_JOB_TYPE_COLUMNS = {
  citation: "E",
  interview: "F",
  spectate: "G",
  investigation: "H",
  sentence: "I",
  seminar: "J",
};
