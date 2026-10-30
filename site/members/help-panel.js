// Floating "What do I do here?" button and panel for signed-in members. Also renders inline on help.html.
(() => {
'use strict';
const C = window.WayHelpContent;
function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  return el;
}
function body() {
  const out = [h('p', { class: 'wh-lead', text: 'Short answers, in plain words. Tap a question.' })];
  (C || []).forEach((x, i) => out.push(h('details', { class: 'wh-q', open: i === 0 ? true : null },
    h('summary', { text: x.q }), x.a.map((t) => h('p', { text: t })), x.link ? h('p', {}, h('a', { href: x.link[0], text: x.link[1] })) : null)));
  out.push(h('p', {}, h('a', { class: 'wh-way', href: '/members/welcome.html?again=1', text: 'Show me the way' }), h('span', { class: 'wh-muted', text: ' (the short welcome, again)' })));
  out.push(h('p', {}, h('a', { href: '/members/', text: 'Go to Home' })));
  return out;
}
if (!C) return;
if (document.getElementById('way-help-inline')) { document.getElementById('way-help-inline').replaceChildren(...body()); return; }
if (/\/members\/(welcome|help)\.html$/.test(location.pathname)) return;   // the welcome flow has its own guide
const panel = h('aside', { id: 'way-help-panel', class: 'wh-panel', role: 'dialog', 'aria-label': 'What do I do here?', hidden: true },
  h('div', { class: 'wh-head' }, h('b', { text: 'What do I do here?' }), h('button', { type: 'button', class: 'wh-x', 'aria-label': 'Close', text: '×', onclick: () => close() })), ...body());
const btn = h('button', { type: 'button', id: 'way-help-btn', class: 'wh-btn', 'aria-expanded': 'false', 'aria-controls': 'way-help-panel', text: 'What do I do here?', onclick: () => (panel.hidden ? open() : close()) });
function open() { panel.hidden = false; btn.setAttribute('aria-expanded', 'true'); }
function close() { panel.hidden = true; btn.setAttribute('aria-expanded', 'false'); btn.focus(); }
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !panel.hidden) close(); });
document.body.append(btn, panel);
})();
