# The Way site repo

Collaborators: read `CONTRIBUTING.md` first (work on a branch, open a pull request, never push to `main`) and `OUTSIDE-GIT.md` (what is deliberately not in this repository). `main` is the live site.

Source of truth for the site files. Lives on FRAK at `D:\theway\site-repo`. The live copy on HostGator is made from this repo by cPanel Git Version Control, using `.cpanel.yml`.

## Layout

- `site/index.html`, `site/404.html`, `site/style.css`: the splash files at the docroot.
- `site/members/`: the public member area.
- `site/preview/pages/<folder>/`: guides (`guide`, `guide-<st>`), maps (`map`, `map-<st>`), `cases`, `news`, `states`, `pages`.
- `.cpanel.yml`: the deploy recipe.

Never in this repo: any `.htaccess`, `splash.js`, `notify.js`, passwords, keys, tokens, zips, database files.

## Commit a change

```
cd D:\theway\site-repo
git status
git add site
git commit -m "short plain description"
```

## Push to the server (after the one-time key step is done)

```
git push hostgator main
```

The remote named `hostgator` points at the repo on the HostGator account. After the push, cPanel Git Version Control runs "Deploy HEAD Commit" (or deploys automatically if switched on), which runs `.cpanel.yml`.

## What a deploy does

- Copies the docroot files in `site/`, and the folders `site/members/`, `site/preview/pages/`, `site/timeline/`, `site/development/`, `site/ai/`, `site/layout/`, `site/research/` and `site/search/` into `/home3/minion/public_html/thewayparty.com/`.
- Skips every `.htaccess`, so the password lock and the members config stay exactly as they are.
- Deletes nothing on the server.
- Sets files to 0644 and folders to 0755 inside `members` and `preview/pages` only.

## One-time setup (done by a person, not stored here)

1. In cPanel, Git Version Control: create a repository on the account.
2. On FRAK, create an SSH key for this and add the public half in cPanel (SSH Access, Authorize). The private key stays on FRAK in the user's `.ssh` folder and is never copied into this repo.
3. `git remote add hostgator <ssh url shown in cPanel>`, then the first push.
