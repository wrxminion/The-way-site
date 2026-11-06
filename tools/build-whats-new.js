// Builds site/whats-new.json: the newest few items in each top bar section, for the "New in ..." line in the full top bar (waybar.js).
// Run from the repo root: node tools/build-whats-new.js   (reads git history and the Money Trail data; no network)
// - History, Elections, Government: the newest pages by the date they were first added to git, with each page's <title>.
// - Money: the newest itemized money threads in the Money Trail data (who paid whom, on what date), each linked to the receiver's trail.
// News and every other page use the News page's own feed instead, so they need nothing here.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const SITE = path.join(ROOT, 'site');
const PER = 8;

function added(dir) {
  // first-add date for every .html file under dir, newest first
  const out = execFileSync('git', ['log', '--diff-filter=A', '--format=@%ad', '--date=short', '--name-only', '--', dir], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 << 20 });
  const seen = new Map(); let date = '';
  for (const line of out.split('\n')) {
    if (line.startsWith('@')) { date = line.slice(1); continue; }
    if (!/\.html$/.test(line) || seen.has(line)) continue;
    if (fs.existsSync(path.join(ROOT, line))) seen.set(line, date);
  }
  return [...seen].sort((a, b) => (a[1] < b[1] ? 1 : a[1] > b[1] ? -1 : 0));
}
function title(file) {
  const m = /<title>([^<]{3,200})<\/title>/i.exec(fs.readFileSync(path.join(ROOT, file), 'utf8'));
  return m ? m[1].replace(/&amp;/g, '&').replace(/&#39;|&rsquo;/g, "'").replace(/&quot;/g, '"').replace(/\s+[-|]\s+The Way\s*$/, '').trim() : '';
}
function url(file) { return '/' + path.relative(SITE, path.join(ROOT, file)).split(path.sep).join('/').replace(/index\.html$/, ''); }
function pages(dir, skip) {
  const list = [];
  for (const [file, d] of added(dir)) {
    if (skip && skip.test(file)) continue;
    const t = title(file);
    if (t) list.push({ t, u: url(file), d });
    if (list.length >= PER) break;
  }
  return list;
}
function money() {
  const src = fs.readFileSync(path.join(SITE, 'money-trail', 'data.js'), 'utf8');
  const R = JSON.parse(src.slice(src.indexOf('{'), src.lastIndexOf('}') + 1));
  const usd = n => '$' + Math.round(Number(n)).toLocaleString('en-US');
  const ent = {};
  for (const e of R.entities || []) ent[e.entity_id] = e;
  // the same link the Money Trail page itself uses for one trail (money-trail/app.js trailHref)
  // otherwise the Money Trail page searched for the name (?q=)
  const trail = (id, name) => ent[id] ? '/money-trail/follow.html?' + (/candidate_named/.test(ent[id].entity_type || '') ? 'candidate' : 'group') + '=' + encodeURIComponent(id) : '/money-trail/?q=' + encodeURIComponent(name);
  const rows = [];
  for (const t of R.transactions || []) if (t.transaction_date && t.source_name && t.recipient_name && Number(t.amount_usd) > 0)
    rows.push({ from: t.source_name, to: t.recipient_name, id: t.recipient_entity_id, usd: t.amount_usd, d: t.transaction_date });
  rows.sort((a, b) => (a.d < b.d ? 1 : a.d > b.d ? -1 : Number(b.usd) - Number(a.usd)));
  const list = [], seen = new Set();
  for (const r of rows) {
    const t = r.from + ' to ' + r.to + ', ' + usd(r.usd);
    if (seen.has(t)) continue;
    seen.add(t);
    list.push({ t, u: trail(r.id, r.to), d: r.d });
    if (list.length >= PER) break;
  }
  return list;
}
const out = {
  built: new Date().toISOString().slice(0, 10),
  note: 'Made by tools/build-whats-new.js. Page dates are when a page was first added to the site; money dates are the reported date on the filing.',
  sections: {
    cases: pages('site/cases', /\/(index\.html|packets\/)/),
    casestudies: pages('site/case-studies', /\/index\.html$/),
    govworks: pages('site/government'),
    money: money()
  }
};
fs.writeFileSync(path.join(SITE, 'whats-new.json'), JSON.stringify(out, null, 1) + '\n');
console.log(Object.entries(out.sections).map(([k, v]) => k + ' ' + v.length).join(', '));
