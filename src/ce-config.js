export const ceRankChoices = ["CD", "CE", "L0", "L1", "L2", "L3", "L4", "L5"];
export const ceBannedChoices = ["Yes", "No"];

/** Sheet tabs by duration. */
export const ceTabNames = {
  short: "24H - <7 Days",
  week: "7 Days - <1 Month",
  month: "1 Month+",
  permanent: "Permanent",
};

/** Sheet columns for a standard (non-permanent) Class-E entry (only these are written). */
export const ceColumns = {
  offender: "B",
  codesBroken: "C",
  startDate: "D",
  endDate: "E",
  classESentence: "F",
  rankPostInfraction: "G",
  messageLink: "H",
};

/** Sheet columns for a Permanent Class-E entry. */
export const cePermanentColumns = {
  offender: "B",
  codesBroken: "C",
  authorization: "D",
  banned: "E",
};

export function isPermanentTab(tabName) {
  return tabName === ceTabNames.permanent;
}

/** Convert a Class-E sentence string to a number of days (null if unparseable). */
export function parseSentenceDays(sentence) {
  const text = String(sentence ?? "").toLowerCase();
  const match = text.match(
    /(\d+(?:\.\d+)?)\s*(hours?|hrs?|h|days?|d|weeks?|wks?|w|months?|mo|m|years?|yrs?|y)\b/
  );

  if (!match) {
    const bareNumber = text.match(/\d+(?:\.\d+)?/);
    return bareNumber ? Number(bareNumber[0]) : null;
  }

  const value = Number(match[1]);
  const unit = match[2];

  if (unit.startsWith("h")) {
    return value / 24;
  }

  if (unit.startsWith("w")) {
    return value * 7;
  }

  if (unit.startsWith("y")) {
    return value * 365;
  }

  if (unit === "mo" || unit.startsWith("month") || unit === "m") {
    return value * 30;
  }

  return value;
}

/** Resolve the destination tab for a Class-E sentence (null if undeterminable). */
export function resolveCeTab(sentence) {
  const text = String(sentence ?? "").toLowerCase();

  if (/\bperm/.test(text)) {
    return ceTabNames.permanent;
  }

  const days = parseSentenceDays(sentence);

  if (days === null || Number.isNaN(days)) {
    return null;
  }

  if (days >= 30) {
    return ceTabNames.month;
  }

  if (days >= 7) {
    return ceTabNames.week;
  }

  return ceTabNames.short;
}
