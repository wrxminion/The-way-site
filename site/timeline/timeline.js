// Timeline: Intent vs. Outcome. Chapters load one file at a time from data/chapters.json.
// Every card has a stable deep link (#EVENT-ID). Text is set with textContent only.
(() => {
'use strict';
const $ = (id) => document.getElementById(id);
const rail = $('rail'), detail = $('detail'), chips = $('chips'), status = $('status'), live = $('live'), q = $('q');
let events = [], filter = 'all', term = '', current = null;

function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'text') el.textContent = v; else if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v); else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  return el;
}
const safeUrl = (u) => /^https:\/\//i.test(u) ? u : null;
async function json(path) { if (window.TL_DATA && window.TL_DATA[path]) return window.TL_DATA[path]; const r = await fetch(path, { cache: 'no-cache' }); if (!r.ok) throw new Error(path); return r.json(); }

function visible() {
  const t = term.trim().toLowerCase();
  return events.filter((e) => (filter === 'all' || e.kind === filter)
    && (!t || [e.name, e.year, e.intent, e.outcome, e.mechanism].join(' ').toLowerCase().includes(t)));
}
function drawChips() {
  const kinds = ['all', ...new Set(events.map((e) => e.kind))];
  chips.replaceChildren(...kinds.map((k) => h('button', { type: 'button', 'aria-pressed': String(k === filter), text: k === 'all' ? 'All' : k,
    onclick: () => { filter = k; drawChips(); drawRail(); } })));
}
function drawRail() {
  const list = visible();
  live.textContent = `${list.length} event${list.length === 1 ? '' : 's'} shown`;
  if (!list.length) { rail.replaceChildren(h('p', { class: 'none', text: 'No events match. Clear the search or pick All.' })); return; }
  rail.replaceChildren(...list.map((e) => h('button', { type: 'button', class: 'stop', role: 'tab', id: 'stop-' + e.id,
    'aria-selected': String(current && current.id === e.id), onclick: () => select(e.id, true) },
    h('span', { class: 'kind', text: e.kind }), h('span', { class: 'yr', text: e.year }), h('span', { class: 'nm', text: e.name }))));
}
function select(id, push) {
  const list = visible(); const e = events.find((x) => x.id === id) || list[0];
  if (!e) return; current = e;
  if (push && location.hash !== '#' + e.id) history.pushState(null, '', '#' + e.id);
  drawRail();
  const idx = list.findIndex((x) => x.id === e.id), prev = list[idx - 1], next = list[idx + 1];
  const sel = $('stop-' + e.id); if (sel) sel.scrollIntoView({ inline: 'center', block: 'nearest', behavior: matchMedia('(prefers-reduced-motion:reduce)').matches ? 'auto' : 'smooth' });
  const chk = e.check || { verified: [], unverified: [] };
  const drawer = h('div', { class: 'drawer', id: 'drawer-' + e.id },
    h('h3', { text: 'Evidence' }),
    h('p', { class: 'pill ok', text: 'Checked ' + (chk.checked || 'not yet') }),
    h('p', { text: 'What we confirmed in the sources:' }),
    chk.verified.length ? h('ul', {}, chk.verified.map((v) => h('li', { text: v }))) : h('p', { text: 'Nothing yet.' }),
    h('p', { text: 'What we could not confirm:' }),
    chk.unverified.length ? h('ul', {}, chk.unverified.map((v) => h('li', { text: v }))) : h('p', { text: 'Nothing flagged.' }),
    h('p', { text: 'Sources:' }),
    h('ul', {}, (e.sources || []).map((s) => { const u = safeUrl(s.url); return h('li', {}, u ? h('a', { href: u, rel: 'noopener noreferrer', target: '_blank', text: s.name }) : s.name); })));
  detail.replaceChildren(
    h('h2', { text: e.year + ': ' + e.name }),
    h('span', { class: 'pill warn', text: e.status }),
    h('div', { class: 'pair' },
      h('div', { class: 'lane' }, h('h3', { text: 'What they said' }), h('p', { text: e.intent }), h('p', {}, h('strong', { text: 'How: ' }), e.mechanism)),
      h('div', { class: 'lane obs' }, h('h3', { text: 'What the records show' }), h('p', { text: e.outcome }),
        h('p', {}, h('strong', { text: 'Gain: ' }), e.benefit), h('p', {}, h('strong', { text: 'Cost or risk: ' }), e.tradeoff))),
    h('p', { class: 'banner', text: 'Caution: ' + e.caveat }),
    h('div', { class: 'nav2' },
      h('button', { type: 'button', disabled: !prev, onclick: () => select(prev.id, true) }, 'Earlier: why did this happen?'),
      h('button', { type: 'button', disabled: !next, onclick: () => select(next.id, true) }, 'Later: what happened next?')),
    drawer);
}
rail.addEventListener('keydown', (ev) => {
  if (ev.key !== 'ArrowRight' && ev.key !== 'ArrowLeft') return;
  const list = visible(); const i = list.findIndex((x) => current && x.id === current.id);
  const n = list[Math.max(0, Math.min(list.length - 1, i + (ev.key === 'ArrowRight' ? 1 : -1)))];
  if (n) { ev.preventDefault(); select(n.id, true); const b = $('stop-' + n.id); if (b) b.focus(); }
});
q.addEventListener('input', () => { term = q.value; drawRail(); });
window.addEventListener('hashchange', () => select(location.hash.slice(1), false));

(async () => {
  try {
    const idx = await json('data/chapters.json');
    const loaded = [];
    for (const c of idx.chapters) { const ch = await json(c.file); loaded.push(ch); events.push(...ch.events); }
    status.textContent = loaded.map((c) => c.status).join(' ') + (idx.pending && idx.pending.length ? ' Not yet imported: ' + idx.pending.join('; ') + '.' : '');
    drawChips(); drawRail(); select(location.hash.slice(1) || events[0].id, false);
  } catch (err) { status.textContent = 'The timeline data could not load. Reload the page.'; }
})();

// Pull a Thread intake. Writes one row to public.thread_submissions (see 0015). Nothing is shown publicly.
const form = $('ptform'), msg = $('ptmsg');
form.addEventListener('submit', async (ev) => {
  ev.preventDefault(); msg.textContent = '';
  const fd = new FormData(form);
  if (fd.get('website')) { msg.textContent = 'Thanks. We received it.'; return; }
  const url = String(fd.get('url') || '').trim();
  if (!/^https?:\/\/\S{4,}$/i.test(url)) { msg.textContent = 'Please paste a full link that starts with http:// or https://'; return; }
  const cfg = window.THE_WAY_CONFIG;
  if (!cfg || !window.supabase) { msg.textContent = 'Sending is not switched on yet.'; return; }
  const sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await sb.rpc('submit_thread', { p_url: url, p_why: String(fd.get('why') || '').trim() || null, p_category: fd.get('category') });
  msg.textContent = error ? 'That did not go through (limit reached or sending is not switched on yet). Try again later.' : 'Thanks. A person will read it. We do not promise an investigation.';
  if (!error) form.reset();
});
})();
