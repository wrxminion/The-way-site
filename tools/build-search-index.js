// Builds site/search/search-index.js from the page files. Run: node tools/build-search-index.js
// Reads only titles, descriptions, headings and a few labelled fields from the pages. No page text is copied wholesale.
const fs = require('fs'), path = require('path');
const SITE = path.join(__dirname, '..', 'site') + path.sep;
const PAGES = SITE; // the guide, map, cases, news and states folders sit at the site root
const STATES = { ak: 'Alaska', al: 'Alabama', ar: 'Arkansas', az: 'Arizona', ca: 'California', co: 'Colorado', ct: 'Connecticut', de: 'Delaware', fl: 'Florida', ga: 'Georgia', hi: 'Hawaii', ia: 'Iowa', id: 'Idaho', il: 'Illinois', in: 'Indiana', ks: 'Kansas', ky: 'Kentucky', la: 'Louisiana', ma: 'Massachusetts', md: 'Maryland', me: 'Maine', mi: 'Michigan', mn: 'Minnesota', mo: 'Missouri', ms: 'Mississippi', mt: 'Montana', nc: 'North Carolina', nd: 'North Dakota', ne: 'Nebraska', nh: 'New Hampshire', nj: 'New Jersey', nm: 'New Mexico', nv: 'Nevada', ny: 'New York', oh: 'Ohio', ok: 'Oklahoma', or: 'Oregon', pa: 'Pennsylvania', ri: 'Rhode Island', sc: 'South Carolina', sd: 'South Dakota', tn: 'Tennessee', tx: 'Texas', ut: 'Utah', va: 'Virginia', vt: 'Vermont', wa: 'Washington', wi: 'Wisconsin', wv: 'West Virginia', wy: 'Wyoming' };
const ent = (s) => s.replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&ldquo;|&rdquo;/g, '"').replace(/&mdash;|&ndash;/g, '-').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
const strip = (s) => ent(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
const clean = (t) => t.replace(/\s*[-—|]\s*The Way\s*$/, '').trim();
function walk(dir, out = []) { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, e.name); if (e.isDirectory()) walk(p, out); else if (e.name.endsWith('.html')) out.push(p); } return out; }
function yearOf(text) { const m = text.match(/\b(1[6-9]\d\d|20\d\d)\b/); return m ? +m[1] : 0; }

const recs = [];
function add(file, r) {
  const rel = path.relative(SITE, file).split(path.sep).join('/');
  let url = '/' + rel.replace(/index\.html$/, '');
  recs.push(Object.assign({ u: url }, r));
}
for (const file of walk(PAGES)) {
  const rel = path.relative(PAGES, file).split(path.sep).join('/');
  const html = fs.readFileSync(file, 'utf8');
  const head = html.slice(0, html.indexOf('</head>') + 7);
  const t = (head.match(/<title>([^<]*)<\/title>/) || [])[1];
  if (!t) continue;
  const title = clean(ent(t));
  const desc = ent(((head.match(/<meta name="description" content="([^"]*)"/) || [])[1]) || '');
  const first = rel.split('/')[0];
  let section = '', type = '', place = '', year = 0, verified = '', extra = '';
  const sm = first.match(/^(?:guide|map)-([a-z]{2})$/);
  const stCode = sm ? sm[1] : (first === 'guide' || first === 'map' ? 'co' : '');
  if (stCode) place = STATES[stCode];
  const body = html.slice(html.indexOf('<main'));
  if (first === 'guide' || /^guide-/.test(first)) {
    section = 'Voter Guide';
    const sub = rel.split('/')[1] || '';
    if (sub === 'candidates') {
      type = 'Candidate';
      const eb = strip((body.match(/<div class="eyebrow">([\s\S]*?)<\/div>/) || [])[1] || '').replace(/^Candidate\s*[·.]\s*/i, '');
      const meta = strip((body.match(/<p class="meta">([\s\S]*?)<\/p>/) || [])[1] || '');
      const lives = strip((body.match(/<dt>Lives in<\/dt><dd>([\s\S]*?)<\/dd>/) || [])[1] || '');
      extra = [eb, meta.split('·')[0].trim(), lives ? 'lives in ' + lives : ''].filter(Boolean).join(' | ');
    } else if (sub === 'races') { type = 'Race'; }
    else if (sub === 'measures') { type = 'Ballot measure'; const m = title.match(/^(Amendment|Proposition|Ballot Issue)\s*([0-9A-Za-z]+)/i); extra = m ? m[1] + ' ' + m[2] + ' measure number ' + m[2] : ''; }
    else if (sub === 'local') { type = 'Local measure'; }
    else { type = 'State guide'; }
    year = 2026;
  } else if (/^map(-|$)/.test(first)) { section = 'Voter Guide'; type = 'District map'; year = 2026; }
  else if (first === 'cases') { section = 'Civics & History'; type = rel === 'cases/index.html' ? 'Collection' : 'Case study'; year = yearOf(title) || yearOf(desc); const v = html.match(/Sources checked (\d{4}-\d{2}-\d{2})/); if (v) verified = v[1]; }
  else if (first === 'case-studies') { section = 'Election Studies'; type = 'Election study'; year = 2026; place = 'Colorado'; extra = 'initial draft not independently reviewed'; }
  else if (first === 'news') { section = 'News'; type = 'News'; }
  else if (first === 'states') { section = 'Voter Guide'; type = 'State voting rules'; const nm = title.replace(/^Voting in\s+/, ''); if (Object.values(STATES).includes(nm)) place = nm; }
  else continue;
  const heads = [...body.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/g)].map((m) => strip(m[1])).slice(0, 8).join('; ');
  const isC = type === 'Candidate';
  const t2 = (!isC && place && !title.includes(place) && title.split(' ').length < 4) ? place + ': ' + title : title;
  add(file, { t: t2, s: section, y: type, p: place, yr: year, d: isC ? '' : desc.slice(0, 200), k: (isC ? extra : [extra, heads].filter(Boolean).join(' | ')).slice(0, 240), v: verified });
}
// Research library and timeline pages that live at the docroot.
const research = path.join(SITE, 'research/packages.json');
if (fs.existsSync(research)) {
  for (const p of JSON.parse(fs.readFileSync(research, 'utf8')).packages) {
    recs.push({ u: p.path, t: p.title, s: 'Research', y: 'Research package', p: p.state, yr: +String(p.year).slice(0, 4) || 0, d: 'Version ' + p.version + ', released ' + p.released + '. ' + p.institution + '.', k: [p.topic, p.source_type, 'draft, not publication-verified'].join(' | '), v: p.released });
  }
}
recs.push({ u: '/research/', t: 'Research library', s: 'Research', y: 'Collection', p: 'United States', yr: 0, d: 'Versioned research packages with data files, source registers and citation text.', k: 'research packages datasets', v: '' });
recs.push({ u: '/development/methods/research-methodology.html', t: 'Research methodology: working draft', s: 'Research', y: 'Methods paper', p: 'United States', yr: 0, d: 'Version 0.1. Proposed research standards for sources, uncertainty, competing explanations, human review and corrections.', k: 'methodology methods evidence preservation AI limitations working draft proposed', v: '' });
recs.push({ u: '/timeline/', t: 'Timeline: Intent vs. Outcome', s: 'Civics & History', y: 'Timeline', p: 'United States', yr: 1933, d: 'For each moment, the stated goal on one side and what the records show on the other.', k: 'banking 1933 1991 intent outcome', v: '' });
recs.sort((a, b) => a.u.localeCompare(b.u));
const out = { built: new Date().toISOString().slice(0, 10), count: recs.length, recs };
fs.mkdirSync(SITE + 'search', { recursive: true });
fs.writeFileSync(SITE + 'search/search-index.js', 'window.SEARCH_INDEX=' + JSON.stringify(out) + ';\n');
const bySection = {};
for (const r of recs) bySection[r.s] = (bySection[r.s] || 0) + 1;
console.log(out.count, JSON.stringify(bySection), (fs.statSync(SITE + 'search/search-index.js').size / 1024) | 0, 'KB');
