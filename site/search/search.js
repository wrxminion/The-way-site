(() => {
'use strict';
const D = window.SEARCH_INDEX;
const $ = (id) => document.getElementById(id);
const q = $('q'), fs = $('f-section'), ft = $('f-type'), fp = $('f-place'), fy1 = $('f-from'), fy2 = $('f-to');
const status = $('status'), list = $('results'), more = $('more');
if (!D) { status.textContent = 'The search index could not load. Reload the page.'; return; }
const recs = D.recs.map((r) => ({
  r,
  t: r.t.toLowerCase(), y: r.y.toLowerCase(), p: (r.p || '').toLowerCase(), s: r.s.toLowerCase(),
  k: (r.k || '').toLowerCase(), d: (r.d || '').toLowerCase()
}));
const uniq = (key) => [...new Set(D.recs.map((r) => r[key]).filter(Boolean))].sort();
const fill = (sel, vals) => vals.forEach((v) => { const o = document.createElement('option'); o.value = v; o.textContent = v; sel.append(o); });
fill(fs, ['Voter Guide', 'Research', 'Civics & History', 'Ballot Case Studies', 'News'].filter((s) => D.recs.some((r) => r.s === s)));
fill(ft, uniq('y')); fill(fp, uniq('p'));
let shown = 0, hits = [];
const PAGE = 25;
const FIELDS = [['t', 'title', 5], ['y', 'type', 3], ['p', 'place', 3], ['k', 'measure number, topic or heading', 2], ['d', 'description', 1], ['s', 'section', 1]];
function terms() { return q.value.toLowerCase().split(/[^a-z0-9'&.-]+/).filter(Boolean); }
function run() {
  const T = terms();
  const sec = fs.value, typ = ft.value, pl = fp.value;
  const y1 = parseInt(fy1.value, 10), y2 = parseInt(fy2.value, 10);
  hits = [];
  for (const e of recs) {
    const r = e.r;
    if (sec && r.s !== sec) continue;
    if (typ && r.y !== typ) continue;
    if (pl && r.p !== pl) continue;
    if (!isNaN(y1) || !isNaN(y2)) { if (!r.yr) continue; if (!isNaN(y1) && r.yr < y1) continue; if (!isNaN(y2) && r.yr > y2) continue; }
    let score = 0; const why = []; let ok = true;
    for (const term of T) {
      let best = null;
      for (const [f, label, w] of FIELDS) { if (e[f].includes(term)) { if (!best || w > best.w) best = { label, w }; } }
      if (!best) { ok = false; break; }
      score += best.w; why.push([term, best.label]);
    }
    if (!ok) continue;
    hits.push({ r, score, why });
  }
  if (T.length) hits.sort((a, b) => b.score - a.score || a.r.t.localeCompare(b.r.t));
  else hits.sort((a, b) => a.r.s.localeCompare(b.r.s) || a.r.t.localeCompare(b.r.t));
  shown = 0; list.replaceChildren(); draw(); ext();
}
function esc(s) { return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
function mark(text, T) {
  let h = esc(text);
  for (const t of T) { const re = new RegExp('(' + esc(t).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'ig'); h = h.replace(re, '<mark>$1</mark>'); }
  return h;
}
function draw() {
  const T = terms();
  const slice = hits.slice(shown, shown + PAGE);
  for (const h of slice) {
    const r = h.r, li = document.createElement('li');
    const bits = [r.s, r.y, r.p, r.yr || ''].filter(Boolean).map((b) => '<span>' + esc(String(b)) + '</span>').join('');
    const why = T.length ? 'Matched: ' + h.why.map(([t, f]) => '"' + esc(t) + '" in ' + f).join('; ') : 'Showing everything that fits the filters.';
    li.innerHTML = '<h3><a href="' + esc(r.u) + '">' + mark(r.t, T) + '</a></h3><div class="badges">' + bits + '</div>' +
      (r.d ? '<p class="meta2">' + mark(r.d, T) + '</p>' : '') +
      '<p class="why">' + why + '</p><p class="meta2">Last verified: ' + (r.v ? esc(r.v) : 'not recorded on the page') + '</p>';
    list.append(li);
  }
  shown += slice.length;
  const total = hits.length;
  status.textContent = total ? 'Showing ' + shown + ' of ' + total + ' result' + (total === 1 ? '' : 's') + '.' : 'No pages match. Try fewer words or clear a filter.';
  more.hidden = shown >= total;
}
function ext() {
  const parts = [];
  const base = q.value.trim(); if (base) parts.push(base);
  if (fp.value && !/united states/i.test(fp.value) && !base.toLowerCase().includes(fp.value.toLowerCase())) parts.push(fp.value);
  const y1 = fy1.value.trim(), y2 = fy2.value.trim();
  if (y1 && y2) parts.push(y1 + ' ' + y2); else if (y1) parts.push(y1); else if (y2) parts.push(y2);
  const text = parts.join(' ');
  $('qtext').textContent = text || '(nothing yet)';
  const e = encodeURIComponent(text);
  $('x-bp').href = text ? 'https://ballotpedia.org/wiki/index.php?search=' + e : 'https://ballotpedia.org/';
}
$('copyq').addEventListener('click', async () => {
  const t = $('qtext').textContent;
  try { await navigator.clipboard.writeText(t); $('copyq').textContent = 'Copied'; } catch (err) { $('copyq').textContent = 'Select the query and copy it'; }
  setTimeout(() => { $('copyq').textContent = 'Copy query'; }, 2500);
});
more.addEventListener('click', draw);
for (const el of [q, fs, ft, fp, fy1, fy2]) el.addEventListener('input', run);
$('sform').addEventListener('submit', (ev) => ev.preventDefault());
$('reset').addEventListener('click', () => { fs.value = ft.value = fp.value = ''; fy1.value = fy2.value = ''; run(); });
const init = new URLSearchParams(location.search).get('q'); if (init) q.value = init;
run();
})();
