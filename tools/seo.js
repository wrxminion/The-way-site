// Search-engine basics for the public pages. Run with Node from the repository root.
//   node tools/seo.js build   unique titles, canonical, Open Graph, Twitter and schema.org tags (safe to re-run)
//   node tools/seo.js off     every public page says noindex, sitemap lists the home page only (the committed state)
//   node tools/seo.js on      removes noindex from the public pages and writes the full sitemap
//   node tools/seo.js on cases states   same, but only for the named sections
// Sections: top guide candidates local map cases case-studies states news. "top" is the essay pages at the site root;
// "guide" is the state guide pages except candidate profiles ("candidates") and local measures ("local").
// Never touched: members, search, ai, development, research, timeline, join, 404 (they stay noindex).
const fs = require('fs'), path = require('path');
const SITE = path.join(__dirname, '..', 'site') + path.sep;
const ORIGIN = 'https://michiinstitute.com';
const ORG = { '@type': 'Organization', name: 'Michi Institute', alternateName: 'The Way', url: ORIGIN + '/', logo: ORIGIN + '/favicon.svg' };
const TOP = ['foundation.html', 'deeper.html', 'founder.html', 'how-government-works.html', 'research-press.html', 'walk-with-everyone.html'];
const STATES = { ak: 'Alaska', al: 'Alabama', ar: 'Arkansas', az: 'Arizona', ca: 'California', co: 'Colorado', ct: 'Connecticut', de: 'Delaware', fl: 'Florida', ga: 'Georgia', hi: 'Hawaii', ia: 'Iowa', id: 'Idaho', il: 'Illinois', in: 'Indiana', ks: 'Kansas', ky: 'Kentucky', la: 'Louisiana', ma: 'Massachusetts', md: 'Maryland', me: 'Maine', mi: 'Michigan', mn: 'Minnesota', mo: 'Missouri', ms: 'Mississippi', mt: 'Montana', nc: 'North Carolina', nd: 'North Dakota', ne: 'Nebraska', nh: 'New Hampshire', nj: 'New Jersey', nm: 'New Mexico', nv: 'Nevada', ny: 'New York', oh: 'Ohio', ok: 'Oklahoma', or: 'Oregon', pa: 'Pennsylvania', ri: 'Rhode Island', sc: 'South Carolina', sd: 'South Dakota', tn: 'Tennessee', tx: 'Texas', ut: 'Utah', va: 'Virginia', vt: 'Vermont', wa: 'Washington', wi: 'Wisconsin', wv: 'West Virginia', wy: 'Wyoming' };
const GUIDEISH = ['guide', 'candidates', 'local'];
const ROBOTS = /[ \t]*<meta name="robots" content="[^"]*">\r?\n?/;
const NOINDEX = '<meta name="robots" content="noindex, nofollow">\n';

function section(rel) {
  if (rel.startsWith('cases/packets/')) return null; // downloadable research packets stay noindex
  const first = rel.split('/')[0];
  if (!rel.includes('/')) return TOP.includes(rel) ? 'top' : null;
  if (first === 'guide' || /^guide-[a-z]{2}$/.test(first)) {
    const sub = rel.split('/')[1];
    return sub === 'candidates' ? 'candidates' : sub === 'local' ? 'local' : 'guide';
  }
  if (first === 'map' || /^map-[a-z]{2}$/.test(first)) return 'map';
  return ['cases', 'case-studies', 'states', 'news'].includes(first) ? first : null;
}
function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== 'data' && e.name !== 'vendor') walk(p, out); }
    else if (e.name.endsWith('.html')) out.push(p);
  }
  return out;
}
function pages() {
  const out = [];
  for (const file of walk(SITE)) {
    const rel = path.relative(SITE, file).split(path.sep).join('/');
    const s = section(rel);
    if (s) out.push({ file, rel, s });
  }
  return out;
}
const urlOf = (rel) => ORIGIN + '/' + rel.replace(/index\.html$/, '');
const esc = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const unesc = (s) => s.replace(/&quot;/g, '"').replace(/&#0?39;|&#x27;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const ST = (rel) => { const m = rel.match(/^(?:guide|map)-([a-z]{2})\//); return m ? STATES[m[1]] : (/^(guide|map)\//.test(rel) ? 'Colorado' : ''); };

function build() {
  let n = 0;
  for (const { file, rel, s } of pages()) {
    let html = fs.readFileSync(file, 'utf8');
    const orig = html;
    const tm = html.match(/<title>([^<]*)<\/title>/);
    if (!tm) continue;
    let title = unesc(tm[1]);
    const tidy = title.replace(/\s+/g, ' ').replace(/ ,/g, ',').trim();
    if (tidy !== title) {
      title = tidy;
      html = html.replace(tm[0], '<title>' + esc(title) + '</title>').replace(/(<meta property="og:title" content=")[^"]*"/, `$1${esc(title)}"`);
    }
    // One title per page: say which state a guide or map page is about.
    const place = ST(rel);
    if (place && !title.includes(place) && (GUIDEISH.includes(s) || s === 'map')) {
      title = (title.replace(/ - The Way$/, '').replace(/\s+/g, ' ').trim() + ', ' + place + ' - The Way');
      html = html.replace(/<title>[^<]*<\/title>/, '<title>' + esc(title) + '</title>');
    }
    const dm = html.match(/<meta name="description" content="([^"]*)"/);
    const desc = dm ? unesc(dm[1]) : '';
    const url = urlOf(rel);
    const tags = [];
    const add = (re, tag) => { if (!re.test(html)) tags.push(tag); };
    add(/rel="canonical"/, `<link rel="canonical" href="${url}">`);
    const kind = s === 'cases' ? 'article' : 'website';
    if (!/property="og:title"/.test(html)) {
      tags.push(`<meta property="og:type" content="${kind}">`, `<meta property="og:title" content="${esc(title)}">`);
      if (desc) tags.push(`<meta property="og:description" content="${esc(desc)}">`);
    } else if (/property="og:title"/.test(html) && place && (GUIDEISH.includes(s) || s === 'map')) {
      html = html.replace(/(<meta property="og:title" content=")[^"]*"/, `$1${esc(title)}"`);
    }
    add(/property="og:url"/, `<meta property="og:url" content="${url}">`);
    add(/property="og:site_name"/, '<meta property="og:site_name" content="The Way | Michi Institute">');
    add(/property="og:image"/, `<meta property="og:image" content="${ORIGIN}/og-image.png">`);
    add(/name="twitter:card"/, '<meta name="twitter:card" content="summary_large_image">');
    if (!/application\/ld\+json/.test(html) && s === 'cases' && rel !== 'cases/index.html') {
      const ld = { '@context': 'https://schema.org', '@type': 'Article', headline: title.replace(/ - The Way$/, ''), description: desc, url, mainEntityOfPage: url, inLanguage: 'en-US', author: ORG, publisher: ORG };
      tags.push(`<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>`);
    }
    if (tags.length) html = html.replace('</head>', tags.join('\n') + '\n</head>');
    if (html !== orig) { fs.writeFileSync(file, html); n++; }
  }
  // Home page: add WebSite with the site search.
  const home = SITE + 'index.html';
  let h = fs.readFileSync(home, 'utf8');
  if (!/"@type":"WebSite"/.test(h)) {
    const ld = { '@context': 'https://schema.org', '@type': 'WebSite', name: 'The Way', alternateName: 'Michi Institute', url: ORIGIN + '/', publisher: ORG, potentialAction: { '@type': 'SearchAction', target: ORIGIN + '/search/?q={search_term_string}', 'query-input': 'required name=search_term_string' } };
    h = h.replace('</head>', `<script type="application/ld+json">${JSON.stringify(ld)}</script>\n</head>`);
    fs.writeFileSync(home, h);
    n++;
  }
  console.log('pages changed:', n);
}

function setIndexing(mode, only) {
  let changed = 0;
  for (const { file, s } of pages()) {
    if (only.length && !only.includes(s)) continue;
    let html = fs.readFileSync(file, 'utf8');
    const has = ROBOTS.test(html);
    let next = html;
    if (mode === 'on') next = html.replace(ROBOTS, '');
    else if (!has) next = html.replace(/<head>\s*/, (m) => m + NOINDEX);
    if (next !== html) { fs.writeFileSync(file, next); changed++; }
  }
  console.log(mode, 'pages changed:', changed);
}

function sitemap() {
  const urls = [ORIGIN + '/'];
  for (const { file, rel } of pages()) {
    const head = fs.readFileSync(file, 'utf8').slice(0, 4000);
    if (!ROBOTS.test(head)) urls.push(urlOf(rel));
  }
  // The research library and the timeline are separate pages with their own noindex setting.
  urls.sort();
  const xml = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + urls.map((u) => `  <url><loc>${u}</loc></url>`).join('\n') + '\n</urlset>\n';
  fs.writeFileSync(SITE + 'sitemap.xml', xml);
  console.log('sitemap urls:', urls.length);
}

const [cmd, ...args] = process.argv.slice(2);
if (cmd === 'build') build();
else if (cmd === 'on' || cmd === 'off') { setIndexing(cmd, args); sitemap(); }
else console.log('usage: node tools/seo.js build | on [sections] | off [sections]');
