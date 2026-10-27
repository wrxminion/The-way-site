# Contributing

`main` is the live website. Merging to `main` publishes within about 15 minutes.

How changes reach `main`: Codex and any larger change go through a pull request that the maintainer reviews and merges. The maintainer's workstation (small fixes) and the scheduled news task commit directly to `main`; the repository rules let the owner do that.

1. Work on a branch. Never push to `main`.
2. Open a pull request and describe what changed, what you checked, and what you could not check.
3. Do not deploy by other means and do not change the deploy recipe (`.cpanel.yml`) without saying so in the pull request.
4. Keep every review label, source link, date and status note on a page. Do not upgrade a page from "not independently reviewed" or "draft" unless a person has reviewed it. Do not remove a caveat to make a page look finished.
5. Use only real text and data from the site or from a cited source. Do not invent copy, numbers, quotes or sources. A fact needs a source link.
6. Pages must work under the strict content security policy: no inline `<script>`, no inline `style=` attributes, no external images or fonts. Put code in files.
7. Keep URLs and record IDs stable. If a page moves, leave a redirect page at the old address.
8. Never commit secrets, credentials, `.htaccess` files, database files, member data, logs or zip files. See `OUTSIDE-GIT.md` for what lives elsewhere.
9. Do not edit the files under `site/preview/pages/news/data/` by hand. A scheduled task rewrites them.
10. Use plain language, short sentences, and no em dashes.

11. Database SQL lives in `supabase/` as reference only. It is not deployed. Never edit an applied migration; add a new numbered file, and do not run or merge anything in `supabase/members-backend/draft-unapproved/`.

Last reviewed: October 27, 2026.
