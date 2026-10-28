# Pull a Thread: how it works and how a front end plugs in

Anyone sends a link, a screenshot of a conversation, or a written question. If we already have sources, we say so. If not, it goes into a review queue ranked by our own score. Pages today are minimal (`site/members/pull-a-thread.html`, `thread-queue.html`, `notifications.html`); a designed page only has to keep the contract below.

## The contract (what the page calls)

| Who | Call | What it does |
|---|---|---|
| Anyone | `POST {supabaseUrl}/functions/v1/pull-thread` (multipart form) | Fields: `kind` = `url` / `screenshot` / `question`; `url`, `question`, `note` (optional, up to 500), `shot` (file: PNG, JPEG or WebP, up to 4 MB), `turnstile` (token; signed-out only). Signed-in members send `Authorization: Bearer <session token>` instead of a token. Returns `{ receipt, status, matches }`. Errors come back as `{ error }` with 400 (fix the input), 413, 429 (slow down) or 503 (switched off). |
| Anyone | `rpc thread_status(p_receipt)` | `{ kind, received, reading, status, matches, note }`. `reading` is true while the archiver is still opening the link. |
| Anyone | `rpc thread_dispute(p_receipt)` | "That is not what I asked": puts a matched item in the queue. |
| Anyone | `rpc thread_follow_up(p_receipt, p_email)` | Members: no email needed (they get a notification). Visitors: one email, used once, then erased. Show it after about 35 seconds, or when `reading` is false and a person has to take over. |
| Member | `rpc my_notifications(p_unread_only, p_limit)`, `my_unread_count()`, `mark_notifications_read(p_ids)` | The notification list. `p_ids = null` marks all read. |
| Reviewer, editor, admin | `rpc list_thread_queue(p_include, p_limit)`, `pick_thread`, `release_thread`, `adjust_thread_priority`, `resolve_thread`, `thread_intake_history` | The queue. `p_include` is `open`, `matched` or `all`. |

`matches` entries: `{ kind: finding | case | claim | guide, title, path, strength: source | words, why }`. `strength: source` means a finding or case cites that very link. `words` means shared key words: always say "may be related", never "this is the answer". Findings are members-only, so `path` is null for them.

Statuses: `matched` (we already have something), `queued`, `in_review`, `accepted`, `needs_evidence`, `duplicate`, `declined`, `answered`.

## The score (ours, not first in first out)

Every queue row carries `score` and `parts` (a list of `{ key, label, pts }` that adds up to the score). Show the parts to reviewers.

| Reason | Points |
|---|---|
| Fits an active research project | +15 |
| Comes with a link we can read | +10 |
| The archiver says it makes a claim that can be checked against sources | +20 |
| Each other sender of the same thing (up to 5) | +5 |
| Each day waiting (up to 20) | +1 |
| Reviewers moved it (each move up to 40, total up to 80, with a reason) | plus or minus |

Rank 1 is a suggestion. Any open item can be picked; the pick records whether it was the top item. Candidate scoring stays off: nothing here scores a person or a party.

## Privacy and safety rules (do not break these in a redesign)

- Who sent it is never shown to anyone, reviewers and admins included. No function returns the submitter or the rate key. The sender gets a receipt code.
- Render every piece of text from a sender or from a web page with `textContent`. Never `innerHTML`.
- The website never opens a sender's link. Only the archiver does, through the public-addresses-only fetcher in `precheck.py`.
- Screenshots go to the private bucket `thread-screenshots` (4 MB, PNG/JPEG/WebP). Only reviewers read them, through signed links that last 5 minutes. They are never published.
- Signed-out sending needs the Turnstile check. Rate limits: visitors 4 an hour and 12 a day, members 10 an hour and 30 a day, the whole site 150 an hour.
- Emails left for a follow-up sit in a table no browser can read, are used for one reply, and are then erased (or after 30 days). The mailing list stays off. The mail step (`thread-followup-mail`) does nothing until Frank sets `THREAD_MAIL_ON = yes` and a mail key.
- No direct messages between members (transparency rule). Notifications come only from the site.

## Easy to use first (Frank's priority for the 2-minute visitors)

One screen, one question at a time, the three choices as big buttons, labels above fields, 44 px minimum targets, visible focus, status text in `aria-live` regions, no cursive text and no thread art behind words (thread images only around the input boxes), works at 200 percent zoom and on a phone, works with the keyboard alone.

## Files

- Database: `migrations/0030` (queue), `0031` (notifications), `0032` (follow-ups), `0033` (screenshot text), `0034` (admin alerts), `0035` (screenshot privacy, drafts, hide names). `run-parts-0030/` to `run-parts-0035/` are the same SQL for the SQL editor.
- Edge Functions: `functions/pull-thread`, `functions/thread-followup-mail` (off until switched on), `functions/thread-shot` (hands one image to the archiver worker for reading; Verify JWT off, checker key plus a database check).
- The reader that runs on our own computer (a Python worker and its small hook) is kept outside this public repository.
- Tests: `tests/pull_thread_tests.sql`, `tests/thread_followup_tests.sql`, `functions/*/handler.test.mjs` and `run.test.mjs`, the worker's own `--self-test`, `tools/test-pull-a-thread-pages.js`.

## Screenshot text (0033)

- A screenshot job gets `ocr_status` pending. The archiver worker reads the picture locally (default: Windows built-in OCR through the OCR script on the archiver, nothing to install, called as `powershell -File ocr.ps1 <image>` with the text read from stdout; fallbacks Tesseract or a local Ollama vision model; config keys `ocr_off`, `ocr_engine` = windows/tesseract/ollama, `ocr_script`, `ocr_script_args`, `tesseract_path`, `ocr_lang`, `ocr_model`), inside the same busy and pause checks as every other job. Nothing leaves the computer.
- The text goes into matching and the score (+10 when readable) and is shown to the sender to correct: `rpc thread_correct_text(p_receipt, p_text)` (up to 5 edits). `thread_status` returns `ocr_reading`, `ocr_text`, `ocr_fixed`. Reviewers see the text with a note when the sender corrected it; if the reader failed they see that and read the picture.
- If no reader is installed on the archiver the job fails with a plain note and a person reads the picture.
- `rpc my_thread_status(p_intake)` lets a signed-in member reopen their own thread from a notification (`/members/pull-a-thread.html?thread=<id>`).

## Design (ChatGPT, Oct 28)

Four choices as a radio group (ask a question, paste a link, upload a screenshot, add text), threaded frame and the hand only around the input (hidden under 640 px, never behind text), outcome cards (reviewed, related, closer), "Still checking..." after 35 s, error summary with per-field errors. Icons in `site/members/art/pat/`. No cursive on the page; the floating link is a text-free hand plus a printed label.

## Alerts for new requests (0034)

- Every new request puts a bell notice (`thread_new`, link to the queue) on each active admin's profile. It says only the kind (link, screenshot, question) and whether we already had something related. No text, no link, no sender.
- The coordinator is told through a file, not a key: the archiver calls `checker_thread_new` (checker key, no private data: number, time, kind, status, website name of a link, times sent, score) and appends one line per request to a plain list file kept on the archiver (config `inbox_dir`, `inbox_off`; it remembers where it stopped in `state.json`). No question text, screenshot text or sender is ever written there.

## Screenshot privacy, drafts and hide names (0035, Frank Oct 28)

What the page says and what the code does (keep them in step):
- Our AI is in-house. The only model address is `ollama_url`, and the worker refuses to run if it is not this computer (`model_is_local`). OCR is Windows built-in (or Tesseract). No outside AI service is called anywhere on this path. Nothing is trained or fine-tuned: the models are fixed. Uploads sit in our Supabase private bucket until read and deleted.
- **Send only the text** (ticked by default, `image_mode` = `text_only`): the picture is deleted as soon as the text is read. Unticked (`review`): kept up to 3 days after reading so a reviewer can open it if truly needed, 7 days after a view, 1 day after the item is closed.
- Deleting a file needs the Storage API, so the worker does it: `checker_thread_images_due` lists due pictures and calls `thread-shot` with `action: delete` (database re-checks it is due, removes the file, marks `image_deleted_at`).
- **Drafts**: every screenshot, and every pasted text sent with Hide names, is a `draft`. Reviewers never see drafts, no admin alert is raised, no follow-up fires. The sender sees the text (`thread_status` gives `ocr_text`, `ocr_reading`, `draft_minutes_left`, `redact_note`), can edit it (`thread_correct_text`, 5 edits), then `thread_confirm(receipt)` puts it in the queue, or `thread_discard(receipt)` deletes it. Not sent within 1 hour of the text being ready (6 hours at the very most): `private.thread_expire_drafts()` wipes the text, the note and the pasted question and marks it `expired`; the picture is due at once. The sweep runs on every worker pass and on every new submission.
- **Reviewers**: `list_thread_queue` no longer returns a file name; it returns `image_state` = none / text_only / available / deleted. `thread_image_request(intake, reason)` needs the item picked by that reviewer, the sender to have allowed it, and a reason of 8 to 300 characters; it writes the append-only `thread_image_views` log and opens a 10-minute window in the storage policy. Admins read the log with `thread_image_log`.
- **Hide names of senders** (`hide_names`): hides ONLY the posters (the accounts that wrote the posts or comments, the sender's own included). Names mentioned inside the posts stay, so "XyzBDA posts about Elon Musk" becomes "[poster 1] posts about Elon Musk". Done on the archiver with the local model plus patterns (@handles, u/names, emails). A screenshot's text is redacted in the same job that reads it, so the unredacted text never reaches the database. A pasted text is held in the draft until the worker redacts it, then replaced. The worker only accepts a model answer that adds no new words and is not mostly deleted; otherwise the pattern-only version goes back with a plain note and the sender must check it. The page warns that hiding the name also hides that it is the official's own quote. Not offered for links.
- Not hidden: names inside the sender's optional note for a screenshot.
