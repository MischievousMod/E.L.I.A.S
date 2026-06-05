import fs from "node:fs";
import path from "node:path";
import { formatSubmissionTimestampDisplay } from "./format.js";

/**
 * Internal registry file (Discord user ID → officer username). Not on the sheet.
 *
 * Resolution order (first match wins) so registrations survive redeploys:
 *   1. REGISTRY_FILE env var — explicit full path.
 *   2. RAILWAY_VOLUME_MOUNT_PATH — Railway sets this when a volume is attached;
 *      we store registry.json inside the persistent volume.
 *   3. ./data/registry.json — local development fallback (ephemeral on Railway).
 */
function resolveRegistryFile() {
  const explicit = process.env.REGISTRY_FILE?.trim();
  if (explicit) {
    return explicit;
  }

  const volume = process.env.RAILWAY_VOLUME_MOUNT_PATH?.trim();
  if (volume) {
    return path.join(volume, "registry.json");
  }

  return path.join(process.cwd(), "data", "registry.json");
}

const REGISTRY_FILE = resolveRegistryFile();
console.log(`Registry file: ${REGISTRY_FILE}`);

/** In-memory copy so lookups don't hit disk on every command. */
let cache = null;

function loadFromDisk() {
  try {
    if (fs.existsSync(REGISTRY_FILE)) {
      const raw = fs.readFileSync(REGISTRY_FILE, "utf8").trim();
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object") {
          return parsed;
        }
      }
    }
  } catch (err) {
    console.error("Could not read registry file:", err.message);
  }
  return {};
}

function getStore() {
  if (!cache) {
    cache = loadFromDisk();
  }
  return cache;
}

function persist() {
  const dir = path.dirname(REGISTRY_FILE);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(REGISTRY_FILE, `${JSON.stringify(getStore(), null, 2)}\n`);
}

/** Discord display name when the user has not registered. */
export function discordDisplayName(interaction) {
  return (
    interaction.member?.displayName ??
    interaction.user.globalName ??
    interaction.user.username
  );
}

/** Registered username for logs/points, or Discord name if not registered. */
export async function resolveOfficerName(interaction) {
  const registered = await getRegisteredUsername(interaction.user.id);
  return registered || discordDisplayName(interaction);
}

export async function getRegisteredUsername(userId) {
  const target = String(userId).trim();

  if (!target) {
    return "";
  }

  return getStore()[target]?.username ?? "";
}

/**
 * Register or update a user's officer username (replaces any previous entry).
 */
export async function upsertRegistration(userId, username) {
  const id = String(userId).trim();
  const name = String(username).trim();

  if (!id || !name) {
    throw new Error("User ID and username are required.");
  }

  const store = getStore();
  const isUpdate = Boolean(store[id]);
  const updated = formatSubmissionTimestampDisplay(new Date());

  store[id] = { username: name, updated };
  persist();

  return { userId: id, username: name, updated, isUpdate };
}

/** Remove a user from the registry. Returns the removed entry, or null if absent. */
export async function removeRegistration(userId) {
  const id = String(userId).trim();

  if (!id) {
    return null;
  }

  const store = getStore();
  const existing = store[id];

  if (!existing) {
    return null;
  }

  delete store[id];
  persist();

  return { userId: id, username: existing.username ?? "" };
}

export async function listRegistrations() {
  const store = getStore();

  return Object.entries(store)
    .map(([userId, value]) => ({
      userId,
      username: String(value?.username ?? "").trim(),
      updated: String(value?.updated ?? "").trim(),
    }))
    .filter((entry) => entry.userId && entry.username)
    .sort((a, b) =>
      a.username.localeCompare(b.username, undefined, { sensitivity: "base" })
    );
}

/** Plain-text listing for /registry (Discord message content). */
export function buildRegistryListText(entries) {
  if (!entries.length) {
    return "**Officer registry**\n\nNo one has registered yet. Use `/register` to add your username.";
  }

  const lines = entries.map(
    (entry) => `• **${entry.username}** — <@${entry.userId}>`
  );

  const header = `**Officer registry** (${entries.length} registered)\n\n`;
  const body = lines.join("\n");

  if (header.length + body.length <= 2000) {
    return header + body;
  }

  const maxLines = Math.floor((2000 - header.length - 20) / 40);
  const shown = lines.slice(0, maxLines);
  const remaining = lines.length - shown.length;

  return (
    header +
    shown.join("\n") +
    (remaining > 0 ? `\n\n_…and ${remaining} more._` : "")
  );
}
