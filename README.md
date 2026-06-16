# Ethics Committee Discord bot

Discord slash commands for filing Ethics Committee records: official embed logs in the right channels, rows in Google Sheets, and optional point authorization via a 💻 button.

Built with **Node.js**, **discord.js v14**, and the **Google Sheets API**.

---

## What it does

- **Logs** — Outstanding citations, paid citations, Class-E sentences, spectator/interview/seminar records, and related workflows.
- **Sheets** — Appends and updates rows on the main spreadsheet (outstanding citations, Class-E tabs, sentence checkboxes, etc.).
- **Points** — Authorized members can award or undo job points per log; updates job-type columns **E–J** and **monthly jobs (K)** on a separate points spreadsheet.
- **Registry** — Officers register a username once; every log shows that name as **Executor** and matches the points sheet (column C).

Logs use structured **embed cards** (readable fields, evidence gallery, optional branding thumbnail). Older code-block logs still parse for delete, search, and points.

---

## Commands

| Command | Channel | Summary |
|---------|---------|---------|
| `/outstanding citation` | `#outstanding-citations` | File outstanding citation + evidence (up to 4 images, links) |
| `/outstanding delete` | `#outstanding-citations` | Mark citation paid: payment screenshot, paid log in `#citations`, removes sheet/Discord outstanding row |
| `/outstanding sentences` | `#outstanding-citation-sentences` | File sentence from outstanding citation + screenshot |
| `/ce sentence` | `#class-e-sentences` | Class-E sentence + sheet tab routing by duration |
| `/ce delete` | `#class-e-sentences` | Remove finished Class-E row from sheet |
| `/cite` | `#citations` | Paid citation log directly (same style as delete output) |
| `/spectator` | `#spectator` | Spectator log + screenshots |
| `/interview` | `#interview` | Interview log (modal for Q&A) + screenshots |
| `/seminar` | `#seminar` | Seminar log + screenshots |
| `/register` | Anywhere | Register officer username (required before other commands) |
| `/registry stats` | Anywhere | Your points totals (monthly K + career E–J); auth role can pass `username` |
| `/registry list` / `delete` | Anywhere | List or remove registrations |
| `/help` | Anywhere | Command reference (public) |

Wrong channel → private ephemeral error. Validation errors are ephemeral.

---

## Points (💻 button)

- Appears on posted logs in point-tracked channels.
- Only members with the configured auth role can authorize or undo.
- **E–J** — Per job type (citation, interview, spectate, sentence, seminar).
- **K** — **Monthly jobs** (all types combined); resets to **0** at the start of each calendar month.
- **L** — Sheet formula (`SUM` of E–J); the bot does not write to L.

Monthly reset runs on bot startup, every hour, and before each 💻 action. Default month boundary: **UTC** (`POINTS_RESET_TIMEZONE` to override).

Audit messages go to `#points-log` when configured: 💻 point authorizations and **delete command audit** lines (`/outstanding delete`, `/ce delete`).

---

## Requirements

- [Node.js](https://nodejs.org/) **18+**
- A [Discord application](https://discord.com/developers/applications) (bot token + application ID)
- Google Cloud project with **Google Sheets API** enabled
- Service account JSON with **Editor** access to your spreadsheets
- Bot invited with scopes **`bot`** + **`applications.commands`**

---

## Environment variables

Create a `.env` file in the project root (never commit it).

### Required

| Variable | Description |
|----------|-------------|
| `DISCORD_TOKEN` | Bot token |
| `DISCORD_CLIENT_ID` | Application ID |
| `SPREADSHEET_ID` | Main Google Sheet ID (outstanding citations, etc.) |
| `GOOGLE_CREDENTIALS_JSON` | Full service account JSON (recommended on Railway), **or** local `credentials.json` |

### Common

| Variable | Description |
|----------|-------------|
| `SHEET_NAME` | Outstanding citations tab name (default: `Sheet1`) |
| `GUILD_ID` | Server ID — register commands to one guild for instant updates while developing |
| `POINTS_SPREADSHEET_ID` | Points spreadsheet (has a default in code if unset) |

### Channel overrides (optional)

If channel IDs change, set any of:

`CITATIONS_CHANNEL_ID`, `OUTSTANDING_CITATIONS_CHANNEL_ID`, `OUTSTANDING_SENTENCES_CHANNEL_ID`, `CLASS_E_CHANNEL_ID`, `SPECTATOR_CHANNEL_ID`, `INTERVIEW_CHANNEL_ID`, `SEMINAR_CHANNEL_ID`, `POINTS_LOG_CHANNEL_ID`

Defaults are in `src/channels.js`.

### Optional tuning

| Variable | Description |
|----------|-------------|
| `POINTS_RESET_TIMEZONE` | IANA timezone for monthly K reset (default: `UTC`) |
| `LOG_THUMBNAIL_URL` | `https://` image URL for branding thumbnail on record cards |
| `EVIDENCE_GALLERY_URL` | Override evidence gallery grouping link (default: Code of Ethics Google Doc) |
| `RAILWAY_VOLUME_MOUNT_PATH` | Persistent volume path (registry + monthly reset state) |
| `REGISTRY_FILE` | Custom path for `registry.json` |
| `POINTS_MONTH_STATE_FILE` | Custom path for monthly reset state |

---

## Local setup

**PowerShell** may block `npm` — use `npm.cmd`, the `.bat` files, or **Command Prompt**.

```powershell
cd path\to\discord-sheets-bot
npm.cmd install
```

1. Copy service account JSON to `credentials.json` **or** put the JSON in `GOOGLE_CREDENTIALS_JSON`.
2. Create `.env` with the variables above.
3. Share both spreadsheets with the service account email (Editor).
4. Register slash commands once (and again after changing `src/commands.js`):

```powershell
npm.cmd run register
```

5. Start the bot:

```powershell
npm.cmd start
```

Or double-click **`register.bat`** once, then **`start-bot.bat`**.

### Slash commands not showing?

1. Run `npm run register`.
2. Set `GUILD_ID` and register again for instant guild commands.
3. Re-invite the bot with **`applications.commands`** scope.
4. Type `/` and pick commands under **your bot’s name**.

---

## Railway deployment

1. Connect the repo and set the same env vars (use `GOOGLE_CREDENTIALS_JSON` as the full JSON string, not a file).
2. Attach a **volume** and set `RAILWAY_VOLUME_MOUNT_PATH` so `/register` data and monthly reset state survive redeploys.
3. Start command: `npm start`.
4. Run `npm run register` locally once per command change (or add a one-off deploy step).

---

## Development

```powershell
npm.cmd run register   # after editing src/commands.js
```

Key source files:

| Path | Role |
|------|------|
| `src/bot.js` | Handlers, dispatch, points button |
| `src/commands.js` | Slash command definitions + `/help` text |
| `src/sheets.js` | Google Sheets read/write |
| `src/log-render.js` | Official embed log layout |
| `src/points.js` | Point updates + monthly K reset |
| `src/registry.js` | Officer registration |
| `src/channels.js` | Channel IDs and command restrictions |
| `UPDATE_LOG.md` | Recent feature notes for your team |

---

## Security

- Do **not** commit `.env`, `credentials.json`, or `data/` on a public repo.
- Bot token and service account key are full credentials.
- Most command confirmations to the user are **ephemeral**; official logs post in the configured channels.

---

## License

Private project (`"private": true` in `package.json`).
