// Turns the answer of public.public_numbers() (see supabase/migrations/0029) into the two static files the
// Research page reads: site/research/by-the-numbers-data.js and by-the-numbers-data.json.
// Usage: node tools/build-by-the-numbers.js <answer.json>
// Defensive on purpose: only known keys are copied, any number under 10 becomes "under 10" again, paths must look
// like site paths, and nothing else (referrers, daily rows, member data) can get through.
const fs = require('fs');
const path = require('path');

const src = process.argv[2];
if (!src) { console.error('usage: node tools/build-by-the-numbers.js <answer.json>'); process.exit(2); }
const raw = JSON.parse(fs.readFileSync(src, 'utf8'));
if (!raw || raw.ready !== true) { console.log('Not ready (' + (raw && raw.month) + '): nothing written.'); process.exit(0); }
if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(raw.month)) { console.error('bad month'); process.exit(1); }

const UNDER = 'under 10';
const count = (v) => (typeof v === 'number' && Number.isFinite(v) && v >= 10 ? Math.floor(v) : UNDER);
const STATES = new Set('AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC'.split(' '));
const TOPICS = new Set(['Home', 'History cases', 'State guides', 'State maps', 'News', 'Research and methods', 'Timeline', 'Other pages']);

const out = {
  month: raw.month,
  visits: count(raw.visits),
  page_views: count(raw.page_views),
  countries: count(raw.countries),
  members: count(raw.members),
  sources_checked: count(raw.sources_checked),
  pages: (raw.pages || []).filter((p) => /^\/[A-Za-z0-9._\/-]*$/.test(p.path) && !/^\/members(\/|$)/.test(p.path) && p.views >= 10)
    .slice(0, 10).map((p) => ({ path: p.path, views: Math.floor(p.views) })),
  topics: (raw.topics || []).filter((t) => TOPICS.has(t.topic) && t.views >= 10).map((t) => ({ topic: t.topic, views: Math.floor(t.views) })),
  states: (raw.states || []).filter((s) => STATES.has(s.code)).map((s) => ({ code: s.code, views: count(s.views) })),
};

const dir = path.join(__dirname, '..', 'site', 'research');
const json = JSON.stringify(out, null, 1) + '\n';
fs.writeFileSync(path.join(dir, 'by-the-numbers-data.json'), json);
fs.writeFileSync(path.join(dir, 'by-the-numbers-data.js'),
  '// Written by tools/build-by-the-numbers.js from public.public_numbers(). Do not edit by hand.\n' +
  'window.BY_THE_NUMBERS = ' + JSON.stringify(out) + ';\n');
console.log('Wrote ' + out.month + ': ' + out.pages.length + ' pages, ' + out.states.length + ' states.');
