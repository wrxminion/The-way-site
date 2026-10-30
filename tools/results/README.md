# Election results: data format, collector, email notice

Page: `/results/` (site/results/). Collector: `tools/results/scrape.py`. Format name: `theway-results/1`.
No keys, tokens or passwords anywhere. Only public official pages are read.

## How the pieces fit

1. `scrape.py` reads public official sources, writes JSON under `site/results/data/`.
2. `publish.py` commits only `site/results/data/` to `main` (same way the news task does). The host deploys `main` about every 15 minutes, so the live page can trail the collector by up to about 15 minutes.
3. `/results/` loads `data/manifest.json` every minute and shows what is there. Every number on the page comes from these files. The page never calls a race.

## Files in `site/results/data/`

- `manifest.json`: index, source health, seat counts.
- `co.json`: Colorado measures, candidates, judges.
- `house.json`: every U.S. House race, all states.
- `senate.json`: every U.S. Senate race.
- `state-<xx>.json`: one other state (two letters), for example `state-tx.json`.
- `city-<slug>.json`: one city, for example `city-denver-co.json`.

Every file is UTF-8 JSON. Write each file to a temp name and rename it, so the page never reads half a file (`scrape.py` does this).

### manifest.json

```json
{
  "schema": "theway-results/1",
  "election": {"name": "2026 General Election", "date": "2026-11-03", "timezone": "America/Denver"},
  "generated_at": "2026-11-04T03:12:00Z",
  "mode": "waiting | live | final",
  "certified": false,
  "sources": [{
    "id": "co-sos", "name": "Colorado Secretary of State", "url": "https://...",
    "status": "ok | waiting | stale | error",
    "checked_at": "ISO time we last looked", "data_updated_at": "ISO time the source says it updated",
    "note": "plain words, optional"}],
  "files": [{"scope": "co", "label": "Colorado", "path": "co.json", "contests": 41, "updated_at": "ISO"}],
  "balance": {"house": {"D": 0, "R": 0, "O": 0, "U": 435, "note": "..."}, "senate": {"...": 0}}
}
```

- `status`: `ok` = last look worked. `waiting` = source reachable but has no results yet. `stale` = no change for a long time during counting. `error` = last look failed (old numbers stay up).
- `balance` counts only seats the source itself marked as won (`called`). D/R/O is the `party_code`. `U` is expected seats minus called seats. It is not a prediction.
- `mode`: `waiting` before results exist, `live` while counting, `final` when collection stops. Certified results set `certified: true` (set by hand later).

### Scope files (co, house, senate, state-xx, city-slug)

```json
{
  "schema": "theway-results/1", "scope": "co", "label": "Colorado",
  "source_ids": ["co-sos"], "updated_at": "ISO", "certified": false,
  "contests": [{
    "id": "co-101",
    "kind": "measure | candidate | judicial | local",
    "level": "federal | state | county | city",
    "state": "co",
    "office": "Governor",
    "district": null,
    "title": "Governor",
    "text": "short official ballot title (measures), optional",
    "vote_for": 1,
    "precincts": {"reporting": 640, "total": 1000, "unit": "precincts"},
    "called": null,
    "choices": [{"id": "sample-candidate-one", "name": "Sample Candidate One",
                 "party": "DEM", "party_code": "D", "votes": 412000}]
  }]
}
```

- `id`: stable for the whole night. Never reuse or rename; the page and the email sender key on it.
- `kind: measure` choices are normally `Yes` and `No`. Judges use `Yes` and `No` and kind `judicial`.
- `party_code`: `D`, `R`, or `O` (all others, including independents and no party). `party` is the label as the source wrote it. Measures have no party.
- `votes`: whole numbers, never negative. Percentages are computed by the page, not stored.
- `called`: `null`, or `{"winner": "<choice id>", "by": "<source name>", "at": "ISO or null"}`. Set only when the official source says the race is decided. We never call a race ourselves.
- Order of contests and choices does not matter; the page sorts by votes.

### Collector safety rules (built into scrape.py)

- Rows that fail checks (negative votes, duplicate choices, winner not in the choices) are refused and the last good file stays.
- If a contest's counted votes fall by more than 5% against the last good copy, the new copy is refused (bad scrape). Small corrections are accepted.
- A failed fetch keeps the old numbers and marks the source `error`.
- Fetches use ETag and Last-Modified, wait at least 60 seconds between passes, and identify themselves with a plain user agent.

## Running it

```
python3 tools/results/test.py                      # dry run on invented sample files; must print only "ok"
python3 tools/results/scrape.py --config tools/results/config.json --out site/results/data --loop 300
python3 tools/results/publish.py --repo <repo folder>   # after each pass, or from a loop
```

Copy `config.example.json` to `config.json` (not committed) and replace the sample sources with the real ones. Sources, adapters:

- `csv`: one row per contest choice. Default headers: `state, district, contest, choice, party, votes, precincts_reporting, precincts_total, winner`. Rename with `"columns": {"choice": "Candidate Name"}` in the source entry.
- `clarity-xml`: the "detail.xml" style file from Clarity election-night sites (Contest, then Choice with vote totals). **Not yet checked against a real file.** The build machine cannot reach election sites, so the real Colorado file must be fetched on the collector machine and compared with the official page, contest by contest, before the first real run. If its shape differs, only `a_clarity_xml` changes.

### Monday plan

1. Monday daytime: on the collector machine, open the official Colorado results site, find the downloadable results file, put its address in `config.json`, run once, compare 5 contests by hand against the official page.
2. Do the same for the House and Senate source and one or two other states.
3. Monday night: start the loop (every 5 minutes) and the publish step. Page opens to the public Monday noon Mountain per `site/results/config.json`.
4. Watch the "Where the numbers come from" box on the page: any source not `working` needs a look.

Source addresses were NOT verified from the build side. Do not trust any address until it has been fetched and compared by hand.

## Page settings: site/results/config.json

- `release_at`: before this time, `/results/` shows the "Results will be posted as they come in" message and sends people to `redirect_to` (the ballot map) after `redirect_after_seconds`. Add `?preview=1` to look at the page early.
- `election_ends_at`: first countdown ("Election day ends in").
- `most_results_by` and `most_results_by_is_placeholder`: second countdown. **The placeholder (Wed Nov 4, 2:00 am Mountain) needs Frank's real value;** set `most_results_by_is_placeholder` to false then.
- `stale_after_minutes`: the page warns when the data is older than this while `mode` is `live`.

## Email notice (framework only, nothing is sent)

- Signup page: `/results/notify.html`. Saves the choices through `public.results_notice_join` (0054), which reuses the email list's double opt-in from 0022: confirmation email first, nothing after until the link is clicked.
- What a person picks: own state, optional county and House district number (no street address), own measures, own races, every House race, every Senate race, extra states (any of 51), up to 10 cities, and timing (`each_call`, `daily_wrap`, `final_only`).
- Tables (supabase/migrations/0054_results_notice.sql): `results_notice_prefs` (one row per subscriber), `results_notice_log` (one row per notice sent, so nothing is mailed twice). Anon cannot read either. A confirmed person's choices change only through their own link (`results_notice_get`, `results_notice_set`, `results_notice_stop`), never by someone typing their address into the form.
- Tested on a local Postgres with a stub of the 0022 tables: applies twice, cleans bad input, refuses overwrites of confirmed people, anon cannot read.
- Later sender (not built): a function reads `manifest.json` and the scope files, finds contests whose `called` just became non-null (or the daily/final moment), matches them to each confirmed person's prefs (`state`, `district`, `kind`, extra states/cities, `level: federal` for House and Senate), queues one email per person per run through the existing `email_outbox`, and writes `results_notice_log`. Every email carries the "unofficial, not checked by a person" line and the one-click unsubscribe from 0022.

## Decisions that are Frank's

1. Email service. 0022 plans Resend (needs an API key stored as a Supabase secret by Frank). Results emails on election night are a burst; confirm the Resend plan's daily and per-second limits cover the list size, or choose another service.
2. Privacy. Choices are stored with the email address. Keep the "state, county, district only" rule? Delete all results preferences after certification, or keep until the person leaves? Needs a line in the privacy page and the lawyer's questions (CAN-SPAM wording, mailing address, candidate-related emails).
3. Whether race emails may name candidates (they do in the page) while the lawyer review of candidate content is open. The sender is off until this is decided.
4. "Most results should be in by" date.
5. Polls close 7 pm Mountain on Nov 3 is set in the config. It could not be checked against the Colorado Secretary of State from the build side; confirm before Monday.

## Map counts (built, hidden with the page)

On the ballot map (`/states/`), `site/results/map-counts.js` adds the House and Senate counts after release, using only called seats. No party colors: a state with more called seats for Democratic candidates gets stripes leaning right, more for Republican candidates stripes leaning left, tied or other gets vertical stripes, and every state with a called seat also gets a written label like "D1 R0". Under the map: national totals, the plain-words explanation, a link to `/results/`, and a text list of every state's counts (so the map is readable without seeing patterns). Nothing shows before `release_at` in `site/results/config.json`, while `mode` is `waiting`, or if `data/balance.json` is missing, so the map is unchanged until then.

The collector writes `data/balance.json` on every pass: per state, `house` and `senate` counts `{D, R, O, U}` where `U` is a race collected but not called yet. States with no collected race are simply not labeled.

The map script is loaded from one line in `site/states/index.html` (plus a stylesheet line). Other map pages (`/map/`, state guides) are generated by the shared builder and are not changed.
