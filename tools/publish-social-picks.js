// Copies recommended social posts from the research output folder into
// site/social-picks/data.json (an admin then clicks "Load AI suggestions" in Admin, Media, Social posts), then (with --push) commits and pushes that one file.
// No AI, no network calls except git, no keys or tokens stored here.
//
// Usage (Windows, from the repo checkout):
//   node tools/publish-social-picks.js --out D:\theway\idle-research\out
//   node tools/publish-social-picks.js --out D:\theway\idle-research\out --push
//
// What it reads in the --out folder (newest first, last 7 days):
//   *.json   an array of posts, or {"posts":[...]}. Each post: {platform, text, link?, source?}
//   *.md *.txt  blocks separated by a blank line. A block starts with "Facebook:" or "Bluesky:"
//               (or "Both:"). Everything after the colon is the post text.
// platform must be facebook, bluesky or both. Anything else is skipped.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; };
const outDir = opt('out');
const repo = path.resolve(opt('repo', path.join(__dirname, '..')));
const push = args.includes('--push');
const MAX_POSTS = 60, MAX_AGE_DAYS = 7, MAX_LEN = 500; // the social_posts table allows 3 to 500 characters
if (!outDir || !fs.existsSync(outDir)) { console.error('Need --out <existing folder>'); process.exit(2); }

const dataFile = path.join(repo, 'site', 'social-picks', 'data.json');
const clean = s => String(s || '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').replace(/\r\n?/g, '\n').trim();
const PLAT = { facebook: 'facebook', fb: 'facebook', bluesky: 'bluesky', bsky: 'bluesky', both: 'both' };

function norm(p, mtime) {
  const platform = PLAT[String(p.platform || '').toLowerCase().trim()];
  const text = clean(p.text).replace(/[<>]/g, '');
  if (!platform || text.length < 3) return null;
  let link = clean(p.link);
  if (link && !/^https:\/\/[^\s]+$/.test(link)) link = '';
  // the site adds the link on its own line, so the whole post must fit
  const total = [...text].length + (link ? [...link].length + 1 : 0);
  if (total > MAX_LEN) return null;
  // Bluesky allows 300, and Post online adds the AI label ("\n\n(AI-written)", 15 characters) to AI posts
  let plat = platform;
  if (plat !== 'facebook' && total + 15 > 300) {
    if (plat === 'bluesky') return null;
    plat = 'facebook'; // too long for Bluesky: keep it for Facebook only
  }
  const source = clean(p.source).slice(0, 200);
  const id = crypto.createHash('sha1').update(plat + '|' + text + '|' + link).digest('hex').slice(0, 12);
  return { id, platform: plat, text, link, source, created: mtime.toISOString().slice(0, 10) };
}

function fromText(raw) {
  return raw.replace(/\r\n?/g, '\n').split(/\n\s*\n/).map(b => {
    const m = b.trim().match(/^(facebook|bluesky|both|fb|bsky)\s*:\s*([\s\S]+)$/i);
    return m ? { platform: m[1], text: m[2] } : null;
  }).filter(Boolean);
}

const cutoff = Date.now() - MAX_AGE_DAYS * 864e5;
const files = fs.readdirSync(outDir).map(f => path.join(outDir, f))
  .filter(f => /\.(json|md|txt)$/i.test(f)).map(f => ({ f, st: fs.statSync(f) }))
  .filter(x => x.st.isFile() && x.st.mtimeMs >= cutoff)
  .sort((a, b) => b.st.mtimeMs - a.st.mtimeMs);

const seen = new Set(), posts = [];
for (const { f, st } of files) {
  let items = [];
  try {
    const raw = fs.readFileSync(f, 'utf8').replace(/^\uFEFF/, '');
    if (/\.json$/i.test(f)) { const j = JSON.parse(raw); items = Array.isArray(j) ? j : (j.posts || []); }
    else items = fromText(raw);
  } catch (e) { console.error('Skipped ' + path.basename(f) + ': ' + e.message); continue; }
  for (const it of items) {
    const p = norm(it || {}, st.mtime);
    if (p && !seen.has(p.id)) { seen.add(p.id); posts.push(p); }
  }
}
posts.splice(MAX_POSTS);

let old = null;
try { old = JSON.parse(fs.readFileSync(dataFile, 'utf8')); } catch (e) {}
if (old && JSON.stringify(old.posts) === JSON.stringify(posts)) { console.log('No change (' + posts.length + ' posts).'); process.exit(0); }

fs.mkdirSync(path.dirname(dataFile), { recursive: true });
fs.writeFileSync(dataFile, JSON.stringify({ updated: new Date().toISOString().replace(/\.\d+Z$/, 'Z'), posts }, null, 2) + '\n');
console.log('Wrote ' + posts.length + ' posts.');

if (push) {
  const git = a => execFileSync('git', ['-C', repo, ...a], { stdio: 'inherit' });
  git(['pull', '--rebase', '--autostash', 'origin', 'main']);
  git(['add', 'site/social-picks/data.json']);
  git(['commit', '-m', 'Update recommended social posts', '--', 'site/social-picks/data.json']);
  git(['push', 'origin', 'HEAD:main']);
}
