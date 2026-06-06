import fs from "node:fs";
import path from "node:path";

const credentialsPath = path.join(process.cwd(), "credentials.json");

/**
 * On Railway (and similar hosts), credentials.json is not in the repo.
 * If GOOGLE_CREDENTIALS_JSON is set, write credentials.json before Sheets loads.
 */
export function ensureGoogleCredentialsFile() {
  if (fs.existsSync(credentialsPath)) {
    return;
  }

  const raw = process.env.GOOGLE_CREDENTIALS_JSON?.trim();
  if (!raw) {
    return;
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    console.error(
      "GOOGLE_CREDENTIALS_JSON is set but invalid JSON:",
      err.message
    );
    return;
  }

  if (!parsed.client_email || !parsed.private_key) {
    console.error(
      "GOOGLE_CREDENTIALS_JSON must be a full service account key (client_email and private_key)."
    );
    return;
  }

  fs.writeFileSync(credentialsPath, `${JSON.stringify(parsed, null, 2)}\n`, {
    mode: 0o600,
  });
  console.log(`Wrote ${credentialsPath} from GOOGLE_CREDENTIALS_JSON.`);
}
