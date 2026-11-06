# Local resources for the district lookup page

Page: `/lookup/` (site/lookup/). Job: `local_resources.py` in this folder. Format name: `theway-local/1`.
No keys, tokens or passwords anywhere. Only public official pages are read. Runs on a home computer with a local Ollama model, so it costs no cloud tokens.

## What a reader sees

After an address search, under the districts: **Local resources for <county>**.

1. Your local election help: the county election office (biggest, on top), then the clerk or recorder, the official county site and the public library. Each link says the day it was last checked.
2. Upcoming local elections: date, name, the exact sentence from the official page, the source link and the check date.
3. State election office links.

In "Know your district number?": a card listing the counties the district covers, each with its election office link and next election date.

Until the job has checked a county, the page says so in plain words. Nothing is filled in by hand or guessed.

## How the job finds things

1. `seed` (once, and again monthly): downloads CISA's official .gov domain registry (github.com/cisagov/dotgov-data) and matches each county's government to its .gov sites. About 1,936 of 3,142 counties match. State election sites come from the same registry plus the official links already on our state voting-rules pages (site/states/). Sites for sheriffs, courts, health and the like are skipped.
2. `run` (every hour, about 20 counties a run, oldest check first):
   - Reads the state election site and looks for its county clerk or election office directory, which fills in many counties the registry misses.
   - For each county, opens its official sites, then follows links whose words say elections, voting, clerk, recorder, auditor or library.
   - The finder model reads each page and says what it is and lists upcoming elections with the exact sentence that gives the date.
   - Code checks: the page loaded, the address is official (.gov, .us, a registry site, or linked from one), the quoted sentence is word for word on the page, the date is in that sentence, the date is real and in the next 400 days.
   - The checker model (a different model) must agree, on its own, with each link and each date.
   - Anything that fails goes to `review.md` in the work folder, never to the site.
3. `publish`: writes `site/lookup/local/xx.json` (one per state) and `index.json`. In `hold` mode it writes to `work\outbox\` instead, so a person can look first. `push: true` commits only `site/lookup/local/` to `main`, the same way the results and news data are published.

Districts to counties is worked out by code from each state map's own district files and the county outlines in `site/lookup/data/counties/`. The district files are not in git, so when the repo copy has none the job copies them from the live site (`map_data_url`) into `work\mapdata\` once a month. It is cached and only redone when a district file changes.

## Being polite and safe

- One request every 3 seconds, robots.txt respected, a clear user agent naming the site.
- A 403, 429, 503, captcha or challenge page pauses that site for a week. Never worked around.
- Before every county it stops if: `local-resources.off` or `idle-research.off` exists, Ollama has a model loaded that is not ours (someone else is using it), the busy check (games, GPU) says busy (a nonzero exit, or any printed reason other than free or idle), or it is inside `quiet_hours_local`.
- One run at a time (lock file), 45 minutes at most, below-normal priority, no window.
- Its own scheduled task, "TheWay Local Resources". It never touches any other task.

## Install on the home computer

1. Copy this folder to `D:\theway\local-resources\` (or the machine's own work folder).
2. Copy `config.example.json` to `config.json`. Set `repo` (the site repo on that machine), the two model names (`ollama list`), and the busy check path if there is one.
3. `python local_resources.py --config config.json seed`
4. `python local_resources.py --config config.json run` once by hand. Read `local-resources.log` and `review.md`, and look at `outbox\`.
5. `install-task.ps1` registers the hourly task. It looks for a real `pythonw.exe` (for example `C:\Program Files\Python311`), not the Microsoft Store stub. Windows may ask a person to run it, because a Claude session on the machine is not allowed to create scheduled tasks.
6. After a person has looked at the first outbox, set `"publish_mode": "live"` (and `"push": true` on a machine with a git login).

To stop it: create the file `local-resources.off` in the work folder. Delete it to start again.

## Files the job keeps (work folder, not in git)

`seed\xx.json` candidate sites, `found\xx.json` checked items, `notes\xx.json` what failed and why, `hosts.json` paused sites, `districts\xx.json` district to county cache, `review.md`, `local-resources.log`, `outbox\`.

## Published file (site/lookup/local/xx.json)

```json
{
  "schema": "theway-local/1", "state": "CO", "name": "Colorado", "updated_at": "ISO",
  "note": "plain words",
  "state_links": [{"k": "state_election_office", "t": "page title", "u": "https://...", "c": "2026-11-06", "s": "registry"}],
  "counties": {
    "08013": {
      "name": "Boulder County",
      "links": [{"k": "election_office | clerk | government | library", "t": "page title", "u": "https://...", "c": "YYYY-MM-DD checked", "s": "where we found it"}],
      "elections": [{"k": "election", "d": "YYYY-MM-DD", "n": "name as on the page", "q": "exact sentence from the page", "u": "https://...", "c": "YYYY-MM-DD checked"}]
    }
  },
  "districts": {"us_house:2": ["08013", "08069"], "state_senate:18": ["08013"]}
}
```

Keys are short because some states have hundreds of counties. County keys are 5 digit FIPS codes.

## Not done yet

- Cities and towns. In New England, Wisconsin and Michigan, towns or townships run elections; the job only covers counties so far, so those pages lean on the state links.
- Alaska runs elections from the state Division of Elections, not boroughs.
- County outlines are coarse (1:10 million). When the address search names the county, the page uses that name instead.

## Rebuild the county outlines

`python build_counties.py --atlas counties-10m.json --out ../../site/lookup/data/counties` with `counties-10m.json` from the `us-atlas@3.0.1` npm package (U.S. Census Bureau cartographic boundaries).
