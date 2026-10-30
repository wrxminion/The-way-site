// Reusable interactive timeline for election studies. Data: window.TIMELINES[id] (see tabor-timeline.js).
// Mount: <div data-timeline="tabor"></div>. Every event also appears in a plain chronological list, so nothing
// depends on swiping, hovering or precise gestures. Standard library of the browser only; no inline script.
(() => {
'use strict';
const root = document.querySelector('[data-timeline]');
if (!root) return;
const data = (window.TIMELINES || {})[root.getAttribute('data-timeline')];
if (!data) return;
const all = data.events.slice().sort((a, b) => a.sort.localeCompare(b.sort));
const state = { view: 'happened', types: new Set(Object.keys(data.types)), i: 0 };

const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const visible = () => all.filter((e) => state.types.has(e.type));

// ----- controls -----
const controls = el('div', 'tl-controls');
const viewBox = el('div', 'tl-view');
viewBox.setAttribute('role', 'group'); viewBox.setAttribute('aria-label', 'What to show on each card');
const viewBtns = {};
[['purpose', 'Stated purpose'], ['happened', 'What happened']].forEach(([k, label]) => {
  const b = el('button', 'tl-btn', label); b.type = 'button';
  b.addEventListener('click', () => { state.view = k; draw(); });
  viewBtns[k] = b; viewBox.append(b);
});
const filt = el('fieldset', 'tl-filters');
filt.append(el('legend', null, 'Show these kinds of events'));
Object.entries(data.types).forEach(([k, label]) => {
  const l = el('label', 'tl-chip'); const c = document.createElement('input'); c.type = 'checkbox'; c.checked = true;
  c.addEventListener('change', () => {
    const sel = (visible()[state.i] || {}).id;
    if (c.checked) state.types.add(k); else state.types.delete(k);
    if (!state.types.size) { state.types.add(k); c.checked = true; return; }   // never an empty timeline
    state.i = Math.max(0, visible().findIndex((e) => e.id === sel)); draw();
  });
  l.append(c, document.createTextNode(' ' + label)); filt.append(l);
});
controls.append(viewBox, filt);

// ----- selected card, buttons, rail -----
const stage = el('div', 'tl-stage');
const card = el('article', 'tl-card'); card.id = 'tl-card'; card.setAttribute('tabindex', '-1');
const nav = el('div', 'tl-nav');
const prev = el('button', 'tl-btn', 'Previous event'); prev.type = 'button';
const next = el('button', 'tl-btn', 'Next event'); next.type = 'button';
const pos = el('p', 'tl-pos'); pos.setAttribute('aria-live', 'polite');
nav.append(prev, pos, next);
const hint = el('p', 'tl-hint', 'On a phone you can also swipe the card left or right. Swiping is optional; the buttons and the list below do the same thing.');
const rail = el('ol', 'tl-rail'); rail.setAttribute('aria-label', 'Events in date order');
stage.append(card, nav, hint);
const layout = el('div', 'tl-layout'); layout.append(rail, stage);

// ----- plain chronological list (always complete) -----
const listWrap = el('div', 'tl-listwrap');
listWrap.append(el('h3', null, 'Every event in date order'));
const list = el('ol', 'tl-list');
all.forEach((e) => {
  const li = el('li'); li.id = 'tlx-' + e.id;
  li.append(el('b', null, e.when + ': ' + e.title), el('span', 'tl-st tl-' + e.status.level, e.status.label));
  if (e.purpose) li.append(el('p', null, 'Stated purpose (' + e.purpose.by + '): ' + e.purpose.text));
  li.append(el('p', null, e.happened));
  const s = el('p', 'tl-srcs', 'Sources: ');
  e.sources.forEach((x, n) => { const a = el('a', null, x.label); a.href = x.url; a.target = '_blank'; a.rel = 'noopener'; if (n) s.append(' · '); s.append(a); });
  li.append(s); list.append(li);
});
listWrap.append(list);

root.replaceChildren(controls, layout, listWrap);

// ----- drawing -----
function draw() {
  const v = visible();
  if (state.i > v.length - 1) state.i = v.length - 1;
  if (state.i < 0) state.i = 0;
  const e = v[state.i];
  Object.entries(viewBtns).forEach(([k, b]) => { b.setAttribute('aria-pressed', String(state.view === k)); });
  rail.replaceChildren(...v.map((x, n) => {
    const li = el('li'); const b = el('button', 'tl-dot'); b.type = 'button';
    b.append(el('span', 'tl-when', x.when), el('span', 'tl-ttl', x.title));
    if (n === state.i) b.setAttribute('aria-current', 'true');
    b.addEventListener('click', () => { state.i = n; draw(); });
    li.append(b); return li;
  }));
  const parts = [el('p', 'tl-date', e.when), el('h3', null, e.title)];
  const badges = el('p', 'tl-badges');
  badges.append(el('span', 'tl-type', data.types[e.type]), el('span', 'tl-st tl-' + e.status.level, e.status.label));
  parts.push(badges);
  if (state.view === 'purpose') {
    if (e.purpose) { parts.push(el('p', 'tl-by', 'Stated in: ' + e.purpose.by), el('p', null, e.purpose.text)); }
    else parts.push(el('p', 'tl-none', 'No stated purpose is recorded for this event. Switch to "What happened" to read it.'));
  } else {
    parts.push(el('p', null, e.happened));
  }
  const src = el('ul', 'tl-srclist');
  e.sources.forEach((x) => { const li = el('li'); const a = el('a', null, 'Open the source: ' + x.label); a.href = x.url; a.target = '_blank'; a.rel = 'noopener'; li.append(a); src.append(li); });
  parts.push(src);
  card.replaceChildren(...parts);
  card.setAttribute('aria-label', 'Event ' + (state.i + 1) + ' of ' + v.length + ': ' + e.title);
  prev.disabled = state.i === 0; next.disabled = state.i === v.length - 1;
  pos.textContent = (state.i + 1) + ' of ' + v.length + (state.i === 0 ? ' (first event)' : state.i === v.length - 1 ? ' (last event)' : '');
}
prev.addEventListener('click', () => { if (state.i > 0) { state.i--; draw(); } });
next.addEventListener('click', () => { if (state.i < visible().length - 1) { state.i++; draw(); } });

// ----- swipe: only clearly horizontal gestures, never from the screen edge (browser back/forward) -----
let sx = null, sy = null;
card.addEventListener('touchstart', (ev) => {
  const t = ev.touches[0];
  if (ev.touches.length !== 1 || t.clientX < 28 || t.clientX > window.innerWidth - 28) { sx = null; return; }
  sx = t.clientX; sy = t.clientY;
}, { passive: true });
card.addEventListener('touchend', (ev) => {
  if (sx == null) return;
  const t = ev.changedTouches[0], dx = t.clientX - sx, dy = t.clientY - sy; sx = null;
  if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
  if (dx < 0) next.click(); else prev.click();
}, { passive: true });

draw();
})();
