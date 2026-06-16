/**
 * Log routing for forum threads.
 *
 * Each log type posts to a dedicated thread inside the ethics log forum.
 * Resolution order: env var override → hardcoded thread id → thread name
 * search inside the forum.
 */
export const LOG_FORUM = {
  id: "1516297804824313927",
  envVar: "LOG_FORUM_CHANNEL_ID",
};

const THREAD_CONFIG = {
  citations: {
    id: "1516298162346659890",
    envVar: "CITATIONS_THREAD_ID",
    legacyEnvVar: "CITATIONS_CHANNEL_ID",
    name: "citations",
    displayName: "Citations",
  },
  outstandingCitations: {
    id: "1516298047095570463",
    envVar: "OUTSTANDING_CITATIONS_THREAD_ID",
    legacyEnvVar: "OUTSTANDING_CITATIONS_CHANNEL_ID",
    name: "outstanding-citations",
    displayName: "Outstanding Citations",
  },
  outstandingSentences: {
    id: "1516298290281451660",
    envVar: "OUTSTANDING_SENTENCES_THREAD_ID",
    legacyEnvVar: "OUTSTANDING_SENTENCES_CHANNEL_ID",
    name: "outstanding-citation-sentences",
    displayName: "Outstanding Citation Sentences",
  },
  classE: {
    id: "1516298096374714448",
    envVar: "CLASS_E_THREAD_ID",
    legacyEnvVar: "CLASS_E_CHANNEL_ID",
    name: "class-e-sentences",
    displayName: "Class-E Sentences",
  },
  spectator: {
    id: "1516298374360469554",
    envVar: "SPECTATOR_THREAD_ID",
    legacyEnvVar: "SPECTATOR_CHANNEL_ID",
    name: "spectator",
    displayName: "Spectator",
  },
  interview: {
    id: "1516298221423431710",
    envVar: "INTERVIEW_THREAD_ID",
    legacyEnvVar: "INTERVIEW_CHANNEL_ID",
    name: "interview",
    displayName: "Interview",
  },
  seminar: {
    id: "1516298435370680460",
    envVar: "SEMINAR_THREAD_ID",
    legacyEnvVar: "SEMINAR_CHANNEL_ID",
    name: "seminar",
    displayName: "Seminar",
  },
  investigation: {
    id: "1516298342664245339",
    envVar: "INVESTIGATION_THREAD_ID",
    legacyEnvVar: "INVESTIGATION_CHANNEL_ID",
    name: "investigations",
    displayName: "Investigations",
  },
  watchlist: {
    id: "1516298408271417374",
    envVar: "WATCHLIST_THREAD_ID",
    legacyEnvVar: "WATCHLIST_CHANNEL_ID",
    name: "watchlist",
    displayName: "Watchlist",
  },
  pointsLog: {
    id: "1511872947185258618",
    envVar: "POINTS_LOG_CHANNEL_ID",
    name: "points-log",
    displayName: "Points Log",
    kind: "channel",
  },
};

/**
 * Which thread each command must be run in (keyed by "command" or
 * "command subcommand"). Commands not listed here are allowed anywhere
 * (e.g. /help, /register, /registry).
 */
const COMMAND_THREAD_KEYS = {
  "outstanding citation": "outstandingCitations",
  "outstanding delete": "outstandingCitations",
  "outstanding sentences": "outstandingSentences",
  "ce sentence": "classE",
  "ce delete": "classE",
  cite: "citations",
  spectator: "spectator",
  interview: "interview",
  seminar: "seminar",
  watchlist: "watchlist",
  investigation: "investigation",
  "long investigation": "investigation",
};

export function resolveLogForumId() {
  return process.env[LOG_FORUM.envVar]?.trim() || LOG_FORUM.id;
}

function resolvedThreadId(config) {
  const fromEnv = process.env[config.envVar]?.trim();

  if (fromEnv) {
    return fromEnv;
  }

  if (config.id) {
    return config.id;
  }

  const legacy =
    config.legacyEnvVar && process.env[config.legacyEnvVar]?.trim();

  if (legacy) {
    return legacy;
  }

  return config.id;
}

/** Discord mention for a configured log thread. */
export function threadMention(configKey) {
  const config = THREAD_CONFIG[configKey];

  if (!config) {
    return "the configured log thread";
  }

  return `<#${resolvedThreadId(config)}>`;
}

/** User-facing error when a log thread cannot be resolved. */
export function threadNotFoundMessage(configKey) {
  const config = THREAD_CONFIG[configKey];

  if (!config) {
    return "Could not find the configured log thread.";
  }

  if (config.kind === "channel") {
    return `Could not find **#${config.name}**. Set ${config.envVar} in .env (see src/channels.js).`;
  }

  return `Could not find the **${config.displayName}** thread. Set ${config.envVar} in .env (see src/channels.js).`;
}

/**
 * The thread a command is restricted to, or null if it may be run anywhere.
 * Returns { id, name, displayName } so the caller can compare and build messages.
 */
export function requiredChannelForCommand(commandName, subcommand) {
  const key = subcommand ? `${commandName} ${subcommand}` : commandName;
  const configKey =
    COMMAND_THREAD_KEYS[key] ?? COMMAND_THREAD_KEYS[commandName];

  if (!configKey) {
    return null;
  }

  const config = THREAD_CONFIG[configKey];

  if (!config) {
    return null;
  }

  return {
    id: resolvedThreadId(config),
    name: config.name,
    displayName: config.displayName,
    kind: config.kind ?? "thread",
  };
}

async function resolveConfiguredChannel(guild, config) {
  if (!guild) {
    return null;
  }

  const targetId = resolvedThreadId(config);

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

  if (config.kind === "channel" || !config.name) {
    const channels = await guild.channels.fetch();
    const match = channels.find(
      (channel) =>
        channel.isTextBased() &&
        channel.name.toLowerCase() === config.name
    );

    return match ?? null;
  }

  try {
    const forumId = resolveLogForumId();
    const forum = await guild.channels.fetch(forumId);

    if (!forum?.threads?.fetchActive) {
      return null;
    }

    const active = await forum.threads.fetchActive();
    const archived = await forum.threads.fetchArchived({ limit: 100 }).catch(
      () => null
    );

    const threads = [
      ...active.threads.values(),
      ...(archived?.threads?.values() ?? []),
    ];

    const match = threads.find(
      (thread) => thread.name.toLowerCase() === config.name
    );

    return match ?? null;
  } catch (err) {
    console.warn(`Forum thread lookup failed for ${config.name}:`, err.message);
    return null;
  }
}

/** Resolve the Citations forum thread (paid citation logs). */
export function resolveCitationsChannel(guild) {
  return resolveConfiguredChannel(guild, THREAD_CONFIG.citations);
}

/** Post one or more messages to the Citations forum thread. */
export async function postToCitationsThread(guild, payloads) {
  const thread = await resolveCitationsChannel(guild);

  if (!thread) {
    throw new Error(threadNotFoundMessage("citations"));
  }

  const items = Array.isArray(payloads) ? payloads : [payloads];
  const messages = [];

  for (const payload of items) {
    messages.push(await thread.send(payload));
  }

  return { thread, messages };
}

/** Resolve the Outstanding Citations forum thread. */
export function resolveOutstandingCitationsChannel(guild) {
  return resolveConfiguredChannel(guild, THREAD_CONFIG.outstandingCitations);
}

/** Resolve the Outstanding Citation Sentences forum thread. */
export function resolveOutstandingSentencesChannel(guild) {
  return resolveConfiguredChannel(guild, THREAD_CONFIG.outstandingSentences);
}

/** Resolve the Class-E Sentences forum thread. */
export function resolveClassESentencesChannel(guild) {
  return resolveConfiguredChannel(guild, THREAD_CONFIG.classE);
}

/** Resolve the Spectator forum thread. */
export function resolveSpectatorChannel(guild) {
  return resolveConfiguredChannel(guild, THREAD_CONFIG.spectator);
}

/** Resolve the Interview forum thread. */
export function resolveInterviewChannel(guild) {
  return resolveConfiguredChannel(guild, THREAD_CONFIG.interview);
}

/** Resolve the Seminar forum thread. */
export function resolveSeminarChannel(guild) {
  return resolveConfiguredChannel(guild, THREAD_CONFIG.seminar);
}

/** Resolve the Investigations forum thread. */
export function resolveInvestigationChannel(guild) {
  return resolveConfiguredChannel(guild, THREAD_CONFIG.investigation);
}

/** Resolve the Watchlist forum thread. */
export function resolveWatchlistChannel(guild) {
  return resolveConfiguredChannel(guild, THREAD_CONFIG.watchlist);
}

/** Resolve the points authorization audit channel. */
export function resolvePointsLogChannel(guild) {
  return resolveConfiguredChannel(guild, THREAD_CONFIG.pointsLog);
}

/**
 * Maps log thread ids to points sheet columns (E–J).
 * Single source of truth — keep in sync with POINTS_COLUMN_LABELS in points-config.js.
 */
export function buildPointsChannelColumns() {
  const mapping = {
    citations: "E",
    interview: "F",
    spectator: "G",
    investigation: "H",
    outstandingSentences: "I",
    classE: "I",
    seminar: "J",
  };
  const columns = {};

  for (const [key, column] of Object.entries(mapping)) {
    const config = THREAD_CONFIG[key];

    if (!config) {
      continue;
    }

    const id = resolvedThreadId(config);

    if (id) {
      columns[id] = column;
    }
  }

  return columns;
}

export const POINTS_CHANNEL_COLUMNS = buildPointsChannelColumns();
