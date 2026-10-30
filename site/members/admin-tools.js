// Admin page helpers: collapsible sections and list filters. Client-side only, no build step.
// section(id, title, nodes, { open }) wraps content in a heading with an expand/collapse button (aria-expanded).
// The open or closed choice is remembered per browser in localStorage. filterBar({ placeholder, facets }) makes a text
// box plus dropdowns; call bar.set(items) with [{ el, text, facets: { key: value or () => value } }].
(() => {
'use strict';
const KEY = 'way-admin-open';
const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } };
const save = (o) => { try { localStorage.setItem(KEY, JSON.stringify(o)); } catch { /* private mode */ } };
const mk = (tag, props, ...kids) => {
  const e = document.createElement(tag);
  for (const k in props || {}) { if (k === 'text') e.textContent = props[k]; else e.setAttribute(k, props[k]); }
  for (const c of kids.flat()) if (c != null) e.append(c);
  return e;
};
let uid = 0;

function section(id, title, nodes, opts) {
  const saved = load();
  let open = id in saved ? !!saved[id] : !!(opts && opts.open);
  const n = ++uid;
  const btn = mk('button', { type: 'button', class: 'adm-toggle', 'aria-controls': 'adm-body-' + n });
  const label = mk('span', { text: title });
  const arrow = mk('span', { class: 'adm-arrow', 'aria-hidden': 'true' });
  btn.append(arrow, label);
  const body = mk('div', { class: 'adm-body', id: 'adm-body-' + n }, nodes);
  const set = (v) => { open = v; btn.setAttribute('aria-expanded', String(v)); body.hidden = !v; arrow.textContent = v ? '▾' : '▸'; };
  btn.onclick = () => { set(!open); const s = load(); s[id] = open; save(s); };
  set(open);
  return mk('section', { class: 'adm-sec' }, mk('h2', { class: 'adm-h' }, btn), body);
}

function filterBar(cfg) {
  const facets = cfg.facets || [];
  let items = [];
  const box = mk('input', { type: 'search', placeholder: cfg.placeholder || 'Filter', 'aria-label': cfg.placeholder || 'Filter' });
  const sels = facets.map((f) => {
    const s = mk('select', { 'aria-label': f.label });
    s.append(mk('option', { value: '', text: f.label + ': all' }));
    for (const [v, t] of f.options) s.append(mk('option', { value: v, text: t }));
    return s;
  });
  const count = mk('span', { class: 'small dim adm-count', 'aria-live': 'polite' });
  const el = mk('div', { class: 'adm-filter' }, box, sels, count);
  const val = (x) => (typeof x === 'function' ? x() : x);
  function apply() {
    const needle = box.value.trim().toLowerCase();
    let shown = 0;
    for (const it of items) {
      let ok = !needle || String(it.text || '').toLowerCase().includes(needle);
      facets.forEach((f, i) => {
        if (!ok || !sels[i].value) return;
        const v = val((it.facets || {})[f.key]);
        ok = Array.isArray(v) ? v.includes(sels[i].value) : String(v) === sels[i].value;
      });
      it.el.hidden = !ok;
      if (ok) shown++;
    }
    count.textContent = items.length ? `${shown} of ${items.length}` : '';
  }
  box.oninput = apply;
  sels.forEach((s) => { s.onchange = apply; });
  return { el, set(list) { items = list; apply(); }, apply };
}

window.TheWayAdminTools = { section, filterBar };
})();
