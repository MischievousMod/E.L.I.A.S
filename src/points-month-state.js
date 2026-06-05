import fs from "node:fs";
import path from "node:path";

function resolveStateFile() {
  const explicit = process.env.POINTS_MONTH_STATE_FILE?.trim();
  if (explicit) {
    return explicit;
  }

  const volume = process.env.RAILWAY_VOLUME_MOUNT_PATH?.trim();
  if (volume) {
    return path.join(volume, "points-month-state.json");
  }

  return path.join(process.cwd(), "data", "points-month-state.json");
}

const STATE_FILE = resolveStateFile();

function ensureDir() {
  const dir = path.dirname(STATE_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export function getStoredMonthKey() {
  try {
    if (!fs.existsSync(STATE_FILE)) {
      return "";
    }

    const raw = fs.readFileSync(STATE_FILE, "utf8").trim();

    if (!raw) {
      return "";
    }

    const parsed = JSON.parse(raw);
    return String(parsed?.monthKey ?? "").trim();
  } catch {
    return "";
  }
}

export function setStoredMonthKey(monthKey) {
  ensureDir();
  fs.writeFileSync(
    STATE_FILE,
    `${JSON.stringify({ monthKey }, null, 2)}\n`,
    "utf8"
  );
}

export function getPointsMonthStatePath() {
  return STATE_FILE;
}
