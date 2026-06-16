/**
 * Channel routing for every log type.
 *
 * Resolution order for each: env var override → hardcoded channel id → channel
 * name fallback. The ids below are the live destinations configured for this
 * server.
 */
const CHANNEL_CONFIG = {
  citations: {
    id: "1511598741478441002",
    envVar: "CITATIONS_CHANNEL_ID",
    name: "citations",
  },
  outstandingCitations: {
    id: "1511598718770610308",
    envVar: "OUTSTANDING_CITATIONS_CHANNEL_ID",
    name: "outstanding-citations",
  },
  outstandingSentences: {
    id: "1511806847634374837",
    envVar: "OUTSTANDING_SENTENCES_CHANNEL_ID",
    name: "outstanding-citation-sentences",
  },
  classE: {
    id: "1511806370972831825",
    envVar: "CLASS_E_CHANNEL_ID",
    name: "class-e-sentences",
  },
  spectator: {
    id: "1511806517228077237",
    envVar: "SPECTATOR_CHANNEL_ID",
    name: "spectator",
  },
  interview: {
    id: "1511806603521822800",
    envVar: "INTERVIEW_CHANNEL_ID",
    name: "interview",
  },
  seminar: {
    id: "1511857029377949826",
    envVar: "SEMINAR_CHANNEL_ID",
    name: "seminar",
  },
  pointsLog: {
    id: "1511872947185258618",
    envVar: "POINTS_LOG_CHANNEL_ID",
    name: "points-log",
  },
};

/**
 * Which channel each command must be run in (keyed by "command" or
 * "command subcommand"). Commands not listed here are allowed anywhere
 * (e.g. /help, /register, /registry).
 */
const COMMAND_CHANNEL_KEYS = {
  "outstanding citation": "outstandingCitations",
  "outstanding delete": "outstandingCitations",
  "outstanding sentences": "outstandingSentences",
  "ce sentence": "classE",
  "ce delete": "classE",
  cite: "citations",
  spectator: "spectator",
  interview: "interview",
  seminar: "seminar",
};

function resolvedChannelId(config) {
  return process.env[config.envVar]?.trim() || config.id;
}

/**
 * The channel a command is restricted to, or null if it may be run anywhere.
 * Returns { id, name } so the caller can compare and build a helpful message.
 */
export function requiredChannelForCommand(commandName, subcommand) {
  const key = subcommand ? `${commandName} ${subcommand}` : commandName;
  const configKey =
    COMMAND_CHANNEL_KEYS[key] ?? COMMAND_CHANNEL_KEYS[commandName];

  if (!configKey) {
    return null;
  }

  const config = CHANNEL_CONFIG[configKey];

  if (!config) {
    return null;
  }

  return { id: resolvedChannelId(config), name: config.name };
}

async function resolveConfiguredChannel(guild, config) {
  if (!guild) {
    return null;
  }

  const targetId = process.env[config.envVar]?.trim() || config.id;

  if (targetId) {
    try {
      const channel = await guild.channels.fetch(targetId);

      if (channel?.isTextBased()) {
        return channel;
      }
    } catch (err) {
      console.warn(`${config.envVar} fetch failed:`, err.message);
    }
  }

  const channels = await guild.channels.fetch();
  const match = channels.find(
    (channel) =>
      channel.isTextBased() &&
      channel.name.toLowerCase() === config.name
  );

  return match ?? null;
}

/** Resolve #citations (paid citation logs). */
export function resolveCitationsChannel(guild) {
  return resolveConfiguredChannel(guild, CHANNEL_CONFIG.citations);
}

/** Resolve #outstanding-citations (new outstanding citation slips). */
export function resolveOutstandingCitationsChannel(guild) {
  return resolveConfiguredChannel(guild, CHANNEL_CONFIG.outstandingCitations);
}

/** Resolve the outstanding citation sentences channel. */
export function resolveOutstandingSentencesChannel(guild) {
  return resolveConfiguredChannel(guild, CHANNEL_CONFIG.outstandingSentences);
}

/** Resolve #class-e-sentences. */
export function resolveClassESentencesChannel(guild) {
  return resolveConfiguredChannel(guild, CHANNEL_CONFIG.classE);
}

/** Resolve #spectator. */
export function resolveSpectatorChannel(guild) {
  return resolveConfiguredChannel(guild, CHANNEL_CONFIG.spectator);
}

/** Resolve #interview. */
export function resolveInterviewChannel(guild) {
  return resolveConfiguredChannel(guild, CHANNEL_CONFIG.interview);
}

/** Resolve #seminar. */
export function resolveSeminarChannel(guild) {
  return resolveConfiguredChannel(guild, CHANNEL_CONFIG.seminar);
}

/** Resolve the points authorization audit channel. */
export function resolvePointsLogChannel(guild) {
  return resolveConfiguredChannel(guild, CHANNEL_CONFIG.pointsLog);
}

/**
 * Maps log channel ids to points sheet columns (E–J).
 * Single source of truth — keep in sync with POINTS_COLUMN_LABELS in points-config.js.
 */
export function buildPointsChannelColumns() {
  return {
    [resolvedChannelId(CHANNEL_CONFIG.citations)]: "E",
    [resolvedChannelId(CHANNEL_CONFIG.interview)]: "F",
    [resolvedChannelId(CHANNEL_CONFIG.spectator)]: "G",
    [resolvedChannelId(CHANNEL_CONFIG.outstandingSentences)]: "I",
    [resolvedChannelId(CHANNEL_CONFIG.classE)]: "I",
    [resolvedChannelId(CHANNEL_CONFIG.seminar)]: "J",
  };
}

export const POINTS_CHANNEL_COLUMNS = buildPointsChannelColumns();
