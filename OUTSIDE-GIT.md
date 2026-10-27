# What is not in this repository

This repository is public. It holds the website source only. The items below exist outside it. No secret values are written here, and none should ever be committed.

## Things the site depends on that are kept elsewhere

| Item | Where it lives | Why it is not in git |
|---|---|---|
| Server password lock and per-folder server rules (`.htaccess`) | On the web host only | Holds access rules. Ignored by `.gitignore` and skipped by every deploy. |
| Database (members, posts, reviews, sign-ins) | A hosted Supabase project | Private user data. The SQL that defines the tables and rules is in `supabase/` (reference only, not deployed); which of it has been applied to the live project is not recorded in git. The site only carries the project URL and a publishable key in `site/members/config.js`, which is public by design. Row-level security protects the data. Service keys and the database password are never in git. |
| Email sending settings, Turnstile secret, analytics tokens beyond the public beacon | The Supabase dashboard and the host | Secrets. |
| Deploy credentials (host SSH key, cPanel login) | The maintainer's workstation and the host | Secrets. The deploy copies only what `.cpanel.yml` lists. |
| News collector and publisher scripts | The maintainer's workstation | Not part of the site. They write the JSON files under `site/preview/pages/news/data/` and push them to this repository on a schedule. |
| Private news archive (every headline ever collected, with the time it was fetched) | The maintainer's workstation | Large, append-only, and never trimmed. The site publishes only the newest 200 per state and 3,000 overall. |
| Evidence vault (dated copies of cited government sources: original files, screenshots, text, OCR, hashes, provenance records) | The maintainer's workstation | Private copies. Only federal works may be shown publicly. |
| Logs of collector runs and the weekly method audit reports | The maintainer's workstation | Operational records. |
| Scheduled tasks | The maintainer's workstation | A task every 2 hours runs the news collector and pushes news data to `main`; a weekly task writes the audit. |
| Research files and drafts used to build pages | Shared project storage | Source material, some under review. |

## How the live site relates to this repository

- `main` is the live site. The host pulls `main` and runs the recipe in `.cpanel.yml` about every 15 minutes. Anything merged to `main` goes live.
- The recipe copies `site/*.*`, `site/members/`, `site/preview/pages/`, `site/timeline/`, `site/development/`, `site/ai/`, `site/layout/`, `site/research/` and `site/search/`. It deletes nothing on the server.
- Some files on the server are not in this repository on purpose: `.htaccess` files and any host-only configuration. News data for candidates and measures that already existed on the server was copied into the repository on October 26, 2026 so a deploy cannot overwrite newer server files with older ones.
- The scheduled news task commits only under `site/preview/pages/news/data/`. It pushes straight to `main`, so branch protection must let the repository owner bypass the pull-request rule.

## Running the site locally

The site is static HTML, CSS and JavaScript. Any static file server pointed at the `site/` folder works. Pages are written for a strict content security policy: no inline scripts or inline styles, images only from the same site. Pages that read data load it from script files or the site's own JSON. Sign-in, the commons and the review tools need the hosted database and are not expected to work offline.

## Tools that are in the repository

`tools/build-search-index.js` rebuilds `site/search/search-index.js` from the page files. Run it with Node after adding or renaming pages.
