// "Go to the news source?" page. Feed links point here: /news/go.html?id=<item id>.
// The source link is shown at the top for everyone. Below it: signed in sees a link to the member area,
// signed out sees the invitation to join. The link is looked up by id in our own data, never taken from the address.
(() => {
'use strict';
const app = document.getElementById('go');
const id = (new URLSearchParams(location.search).get('id') || '');
function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) { if (k === 'hidden') el.hidden = true; else if (k === 'class') el.className = v; else if (k === 'text') el.textContent = v; else el.setAttribute(k, v); }
  for (const kid of kids.flat()) if (kid != null) el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  return el;
}
function safe(u) { try { const x = new URL(u); return /^https?:$/.test(x.protocol) ? x.href : ''; } catch { return ''; } }
async function signedIn() {
  try {
    const cfg = window.THE_WAY_CONFIG;
    const sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data } = await window.WaySession.getSession(sb);
    return !!(data && data.session);
  } catch { return false; }
}
async function run() {
  if (!/^[a-f0-9]{8,64}$/.test(id)) { app.replaceChildren(h('p', { text: 'That link is not valid.' }), h('p', {}, h('a', { href: '/news/', text: 'Go to the news page' }))); return; }
  let item = null;
  try {
    const r = await fetch('data/latest.json', { cache: 'no-cache' });
    const d = await r.json();
    item = (d.items || []).find((x) => x.id === id) || null;
  } catch { /* handled below */ }
  const url = item ? safe(item.url) : '';
  if (!url) { app.replaceChildren(h('p', { text: 'We could not find this article any more.' }), h('p', {}, h('a', { href: '/news/', text: 'Search the news page' }))); return; }
  // Related research: the tagged copy of this item (days/<date>.json) says which candidate or measure pages it is about.
  let about = [];
  try {
    const day = String(item.first_seen_at || '').slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(day)) {
      const dd = await (await fetch('data/days/' + day + '.json', { cache: 'no-cache' })).json();
      const t = (dd.items || []).find((x) => x.id === id);
      about = ((t && t.about) || []).filter((a) => /^guide[a-z-]*\/[A-Za-z0-9_\/-]+\.html$/.test(a.page || ''));
    }
  } catch { /* no related pages: fine */ }
  const related = about.length
    ? h('div', { class: 'go-rel' }, h('h2', { text: 'Related research' }), h('ul', {}, about.map((a) => h('li', {}, h('a', { href: '/' + a.page, text: a.label || a.id })))))
    : null;
  // AI quick check (written by the local AI, not yet reviewed by a person). Shown only if a file exists for this item.
  let qc = null;
  try {
    const r = await fetch('data/quickcheck/' + id + '.json', { cache: 'no-cache' });
    if (r.ok) { const j = await r.json(); if (j && Array.isArray(j.claims)) qc = j; }
  } catch { /* none yet: fine */ }
  // Every claim must carry a source link. A claim without a usable link is dropped, never shown.
  const claims = qc && Array.isArray(qc.claims) ? qc.claims.filter((c) => c && typeof c.text === 'string' && c.text && safe(c.url)) : [];
  const qcBox = claims.length
    ? h('div', { class: 'go-qc' }, h('h2', { text: qc.checked_by_person === true ? 'Checked by a person' : 'AI quick check (not yet reviewed by a person)' }),
        h('ul', {}, claims.map((c) => h('li', {}, c.text + ' ', h('a', { href: safe(c.url), rel: 'noopener noreferrer', text: '(' + (c.label || 'source') + ')' })))),
        h('p', { class: 'go-small', text: qc.checked_by_person === true ? 'The AI wrote this fast check and a person has looked at it.' : 'Written by AI as a fast check. It is not a confirmed review. Anything unproven is called alleged.' }))
    : null;
  const me = await signedIn();
  const box = me
    ? h('div', { class: 'go-join' }, h('p', { text: 'You are signed in. Review this article and give your opinion in the member area.' }), h('a', { class: 'button', href: '/members/', text: 'Open the member area' }))
    : h('div', { class: 'go-join' }, h('p', { text: 'Join The Way to review and give your opinions on the news article. Sign up!' }), h('a', { class: 'button', href: '/members/#/signup', text: 'Sign up' }), ' ', h('a', { href: '/members/', text: 'Log in' }));
  app.replaceChildren(
    h('h1', { text: 'Go to news source?' }),
    h('a', { class: 'go-src', href: url, rel: 'noopener noreferrer', text: 'Go to ' + (item.source || 'the news source') + ' now' }),
    h('p', { text: item.title }),
    h('p', { class: 'go-small', text: 'Source: ' + (item.source || 'unknown') + '. Headline collected by The Way, not reviewed by a person.' }),
    qcBox,
    box,
    related,
    // Comments slot: stays hidden until the news comments table exists (SQL 0072 is on hold). Nothing fills it yet.
    h('section', { id: 'go-comments', hidden: '' }));
}
run();
})();
