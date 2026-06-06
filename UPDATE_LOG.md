# Update Log

What's new since the last update. Newest at the top.

---

## `/ce delete` lookup fix

- Scans the **full offender column** from row 2 (not only row 5+), skipping header cells like "Offender" / "Username".
- Detects the offender column from sheet headers when present.
- Normalizes names (trim, collapse spaces, strip `@`) and matches spreadsheet tab names case-insensitively.
- Clearer error when no row is found (including missing tab names).

## Registry stats fix and citation status removed

- **Removed `/citation status`** (slash command, handler, and module).
- **`/registry stats` fix** — defers immediately (avoids Discord timeouts), reads each points cell individually, normalizes officer names (whitespace / `@`), and tries registered + display names when looking up yourself.

## Command audit trail (delete only)

- **`#points-log`** — command audit lines only for **`/outstanding delete`** and **`/ce delete`** (who deleted what, with links/notes), in addition to 💻 authorizations.

## `/registry stats`

- Your points sheet totals (monthly **K** + career **E–J** + total **L**). Points-auth role can pass **`username`** to look up someone else.

## Monthly jobs (column K) on points sheet

- Every 💻 authorization now updates **column K (Monthly jobs)** as well as the job-type column (E–J).
- Undo on the button subtracts from monthly jobs too.
- **Column K resets to 0** at the start of each calendar month (all officer rows).
- Reset runs on bot startup, **hourly**, and before each points update (so a missed midnight still clears K when the bot runs again).
-
- Button confirmation shows **Monthly jobs** total alongside the job-type total.

## Log UI redesign & paid citation evidence (latest)

### Official embed cards (all log types)
- Citations, Class-E sentences, spectator, interview, and seminar logs now use **structured Discord embeds** instead of monospace code-block “slips.”
- Each value has a clear label (Offender, Infractions, Executor, Ref No., etc.) so records are easier to read and copy.
- **Older code-block logs still work** for search, `/outstanding delete`, and the points button.

### Evidence layout
- Long text stays on the **record card**; screenshots sit in an **Evidence gallery** underneath (so write-ups are not squeezed beside images).
- Gallery images are **grouped into one strip** using a shared link to [Orakulus' Code of Ethics](https://docs.google.com/document/d/1ochsmZwAg4P75pi-lgS1xVBCqXrdYz3XSzStmGsn3jQ/edit?tab=t.0) (no more SCP Wiki title link). Override with `EVIDENCE_GALLERY_URL` in `.env` if needed.
- Optional **branding thumbnail** on every record card: set `LOG_THUMBNAIL_URL` in `.env` to a public `https://` image URL.

### `/outstanding delete` → paid citation log
- **Payment screenshot** appears on the **first card** (main record embed).
- **Recovered citation screenshots** (up to 4) appear in the **Evidence gallery** on the cards below.
- **Evidence links** from the original outstanding citation (`evidence_link`) are copied into the paid log’s **Links** field.
- Images are **downloaded and re-uploaded** when building the paid log so they do not depend on expired Discord CDN URLs.
- Recovery reads message attachments, gallery embed **proxy URLs**, and the **Links** field on the original log.

### Up to 4 evidence images
- `/outstanding citation` and `/ce sentence` accept up to **4** `evidence_file` attachments (same as `/cite`).

### Behind-the-scenes (this release)
- Fixed evidence recovery passing filenames as image types (images were skipped on delete).
- Executor name is read from embed fields or legacy slip text for the points button.
- Regression tests cover image recovery, link recovery, and sheet/points behavior (78 checks).

---

## Commands are now locked to specific channels
- Each command only works in its proper channel — run it somewhere else and you'll get a private "this command can only be used in #channel" notice.
  - `/outstanding citation`, `/outstanding delete` → **#outstanding-citations**
  - `/outstanding sentences` → **#outstanding-citation-sentences**
  - `/ce sentence`, `/ce delete` → **#class-e-sentences**
  - `/cite` → **#citations**
  - `/spectator` → **#spectator**, `/interview` → **#interview**, `/seminar` → **#seminar**
- `/help`, `/register`, and `/registry` can be used anywhere.

## New: `/register` — you must register before using commands
- Run `/register` and enter your username. From then on, every log you file shows **your registered username** as the Executor instead of your Discord name.
- Running `/register` again just updates your username (no duplicates).
- **You have to register before any other command works** (except `/help` and `/register`). Unregistered users get a prompt to register first.
- Registrations now **survive redeploys** (stored on a persistent volume), so you only register once.

## New: `/registry` — see and manage who's registered
- `/registry list` shows everyone who has registered and the username they chose.
- `/registry delete` removes a member from the registry (they'll need to `/register` again).

## New: `/cite` command
- Files a paid citation log directly (same style as the log produced by `/outstanding delete`).
- Fields: Offender, Infractions, Amount Paid, Fine Message — plus evidence links and up to 4 images.
- Posts to **#citations** and is point-eligible via the button (counts as a citation).

## New: `/ce delete` command
- Removes a finished Class-E sentence from the spreadsheet when it's over.
- Only touches the Class-E tabs — it never affects outstanding citations.

## "Officer" / "Processed by" is now "Executor"
- Every log and the paid-citation notice now label the person who filed it as **Executor**.

## `/ce sentences` is now `/ce sentence`
- Same command, just dropped the "s".

## `/help` cleaned up
- More compact and easier to read, with clear separation between commands. Visible to everyone.

## Earlier reliability fixes
- **Images no longer expire** on new logs — evidence is re-uploaded when posting.
- **Long write-ups no longer get cut off** — lengthy interviews/notes are split across embed fields instead of being truncated.
- **Validation errors are private** — "missing field" / "wrong channel" messages only show to you, keeping channels clean.
