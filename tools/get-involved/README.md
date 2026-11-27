# Get Involved (/get-involved/)

Built by `build_get_involved.py`. Run it after `tools/government/build_congress.py` and `tools/contact-senator/build_votes.py`.
No keys, tokens or passwords anywhere.

## Data files (hand-checked, every fact from an official page)

- `upcoming.json`: the House and Senate schedule for the week, the bills, the dates and the date pages.
- `meetings.json`: Senate and House committee meetings for the week and federal agency meetings (Federal Register).
- `states.json`: state facts read on official state pages (elections, legislature start, public meeting calendars). A state with nothing here says "not checked yet".
- `lda.json`: lobbying reports that name each bill, from lda.gov. Refreshed by `fetch_lda.py`.

## What it writes

- `site/get-involved/`: landing page, `bills/`, `dates/`, `states/` (51 pages), `reps.html`, `meetings.html`.
- An "Upcoming votes and dates" section on every member page (between `<!-- tw-upcoming -->` markers).
- `site/money-trail/upcoming-web-data.js`: each bill's spot on the Money web (read by `site/money-trail/upcoming-web.js`).

## Each week

1. Update `upcoming.json` and `meetings.json` from the official schedules.
2. On a home computer (the cloud cannot reach lda.gov): `python fetch_lda.py`. It reads the official lobbying API with no key,
   one request every 4.5 seconds (lda.gov allows 15 a minute without a key), and stops at the first refusal.
3. `python build_get_involved.py`, then send the change through the push queue.

## Groups on all sides

Party committees from the FEC data on the Money Trail, placed in a state by their FEC mailing state (saved by
`tools/money-trail/add_fec_batch.py` from the next daily FEC run on) or, until then, by a state named in their registered name.
National party committees are not on state pages.

## County elections and meetings

The state pages read `/lookup/local/xx.json` live in the browser. That file comes from the local resources job
(`tools/local-resources/`), which now also collects county board, commission and council meeting dates.

## Issue pages (D295)

A date in `upcoming.json` `events` can also carry: `view` (a box that speaks to readers on one side, such as
"If you think court records should be free"; it is the reader's choice, not The Way's position), `stance_note` (replaces the
"does not take a side" line; leave it out unless Frank asks), `sides` (each point with its sources), `tools` (free resources, as links)
and `checked` (its own last-checked date). The first one is `free-court-records` (the Open Courts Act and the PACER fee rise).

## We wish we had this (D310)

`build_wish.py` writes `site/get-involved/wish-we-had-this/index.html`: public records that are hidden or hard to get, each with a
sourced fact and a button to the letter tool. The letter issues for these cards are in
`site/get-involved/contact-your-senator/issues-wish.js` (chamber `both`, so they show on the Senate and House pages).
Edit `CARDS` in the script and run `python build_wish.py`. Every number needs its sources on the card.
