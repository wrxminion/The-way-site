// Notes bar for the Admin reading room. Loaded by reading-room.js only after a super admin's drafts
// have downloaded. Notes are saved in this browser only (localStorage). Nothing is sent anywhere.
// TheWayReadingNotes.attach({ root, page, title, link }) builds the panel for one page; detach() removes it.
// Every piece of text goes in with textContent.
(() => {
'use strict';

const PREFIX = 'pmnotes:';
const memory = {};
function store() { try { const s = window.localStorage; s.getItem('x'); return s; } catch { return null; } }
function get(k) { const s = store(); if (s) { try { return s.getItem(k) || ''; } catch { /* fall through */ } } return memory[k] || ''; }
function set(k, v) {
  const s = store();
  if (s) { try { if (v) s.setItem(k, v); else s.removeItem(k); return; } catch { /* fall through */ } }
  if (v) memory[k] = v; else delete memory[k];
}
function keys() {
  const s = store(); const out = [];
  if (s) { try { for (let i = 0; i < s.length; i++) { const k = s.key(i); if (k && k.indexOf(PREFIX) === 0) out.push(k); } } catch { /* none */ } }
  else out.push(...Object.keys(memory));
  return out;
}
function el(tag, attrs, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null) continue;
    if (k === 'text') e.textContent = v; else if (k === 'class') e.className = v; else e.setAttribute(k, v);
  }
  for (const c of kids) if (c != null) e.append(c);
  return e;
}

let live = null;   // what attach() made, so detach() can take it away

function detach() {
  if (!live) return;
  live.obs && live.obs.disconnect();
  live.off.forEach((f) => f());
  live.nodes.forEach((n) => n.remove());
  live.buttons.forEach((b) => b.remove());
  document.body.classList.remove('notes-open');
  live = null;
}

function attach(opts) {
  detach();
  const { root, page, title, link } = opts;
  const key = (id) => PREFIX + page + '#' + id;
  const heads = [...root.querySelectorAll('h1, h2, h3')];
  const used = {};
  heads.forEach((hd) => {
    if (!hd.id) {
      const base = (hd.textContent || 'section').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'section';
      let id = base, n = 2; while (document.getElementById(id) || used[id]) id = base + '-' + (n++);
      hd.id = id;
    }
    used[hd.id] = true;
  });
  const titles = { general: 'General notes for this page' };
  heads.forEach((hd) => { titles[hd.id] = hd.textContent.trim(); });

  const toggle = el('button', { id: 'notes-toggle', type: 'button', 'aria-controls': 'notes', 'aria-expanded': 'false' }, 'Notes', el('span', { class: 'count' }));
  const close = el('button', { id: 'notes-close', type: 'button', text: 'Close' });
  const secTitle = el('a', { id: 'notes-sec-title', href: link(page), text: 'Section' });
  const secBox = el('textarea', { id: 'notes-sec', placeholder: 'Type a note. It saves as you type.' });
  const genBox = el('textarea', { id: 'notes-gen', placeholder: 'Anything about the whole page.' });
  const exportBtn = el('button', { id: 'notes-export', type: 'button', text: 'Export all notes (.md)' });
  const clearBtn = el('button', { id: 'notes-clear', type: 'button', text: 'Clear this page' });
  const status = el('p', { id: 'notes-status' });
  const list = el('ul', { id: 'notes-list' });
  const panel = el('section', { id: 'notes', 'aria-label': 'Admin notes' },
    el('div', { class: 'notes-head' }, el('span', { text: 'Admin notes' }), close),
    el('div', { class: 'notes-body' },
      el('label', { for: 'notes-sec', text: 'Note for this section' }), secTitle, secBox,
      el('label', { for: 'notes-gen', text: 'General notes for this page' }), genBox,
      el('div', { class: 'notes-btns' }, exportBtn, clearBtn), status,
      el('p', { class: 'notes-tip', text: 'Notes stay in this browser only. Nothing is sent anywhere. The section box follows where you are reading. Click a Note button next to any heading to pick that section.' }),
      el('label', { text: 'Sections with notes' }), list));
  panel.hidden = true;
  document.body.append(toggle, panel);

  let current = heads.length ? heads[0].id : 'general';
  let pinned = false;
  const off = [];
  const on = (target, ev, fn, o) => { target.addEventListener(ev, fn, o); off.push(() => target.removeEventListener(ev, fn, o)); };

  const saved = () => { status.textContent = 'Saved in this browser ' + new Date().toLocaleTimeString(); };
  function loadSection(id) {
    current = id;
    secTitle.textContent = titles[id] || id;
    secTitle.href = link(page, id === 'general' ? '' : id);
    secBox.value = get(key(id));
  }
  function refreshList() {
    list.replaceChildren();
    let count = 0;
    heads.forEach((hd) => {
      const v = get(key(hd.id));
      hd.classList.toggle('has-note', !!v);
      if (!v) return;
      count++;
      const a = el('a', { href: link(page, hd.id), text: titles[hd.id] });
      a.addEventListener('click', () => { pinned = true; loadSection(hd.id); });
      list.append(el('li', {}, a, el('div', { class: 'notes-snip', text: v.length > 140 ? v.slice(0, 140) + '...' : v })));
    });
    toggle.querySelector('.count').textContent = count ? ' (' + count + ')' : '';
    if (!count) list.append(el('li', { class: 'notes-none', text: 'No section notes on this page yet.' }));
  }
  function open(v) {
    panel.hidden = !v;
    toggle.setAttribute('aria-expanded', v ? 'true' : 'false');
    document.body.classList.toggle('notes-open', v);
    set(PREFIX + '_open', v ? '1' : '');
  }

  const buttons = heads.map((hd) => {
    const b = el('button', { type: 'button', class: 'notebtn', text: 'Note', 'aria-label': 'Add a note to: ' + titles[hd.id] });
    b.addEventListener('click', () => { pinned = true; loadSection(hd.id); open(true); secBox.focus(); });
    hd.append(b);
    return b;
  });

  let obs = null;
  if ('IntersectionObserver' in window) {
    obs = new IntersectionObserver((entries) => {
      if (pinned || document.activeElement === secBox) return;
      entries.forEach((e) => { if (e.isIntersecting) loadSection(e.target.id); });
    }, { rootMargin: '-120px 0px -65% 0px' });
    heads.forEach((hd) => obs.observe(hd));
  }
  on(window, 'wheel', () => { pinned = false; }, { passive: true });
  on(window, 'touchmove', () => { pinned = false; }, { passive: true });
  secBox.addEventListener('input', () => { set(key(current), secBox.value); saved(); refreshList(); });
  genBox.addEventListener('input', () => { set(key('general'), genBox.value); saved(); });
  toggle.addEventListener('click', () => open(panel.hidden));
  close.addEventListener('click', () => open(false));

  exportBtn.addEventListener('click', () => {
    const byPage = {};
    keys().forEach((k) => {
      if (k === PREFIX + '_open' || k.indexOf(PREFIX + '_title:') === 0) return;
      const rest = k.slice(PREFIX.length); const i = rest.indexOf('#');
      (byPage[rest.slice(0, i)] = byPage[rest.slice(0, i)] || []).push({ id: rest.slice(i + 1), key: k });
    });
    const lines = ['# Admin notes from the reading room', '', 'Exported ' + new Date().toString(), ''];
    const pages = Object.keys(byPage).sort();
    if (!pages.length) lines.push('No notes yet.');
    pages.forEach((pg) => {
      lines.push('## Page: ' + (get(PREFIX + '_title:' + pg) || pg) + ' (' + pg + ')', '');
      byPage[pg].sort((a, b) => (a.id === 'general' ? -1 : b.id === 'general' ? 1 : 0));
      byPage[pg].forEach((n) => { lines.push('### ' + (get(PREFIX + '_title:' + pg + '#' + n.id) || n.id) + ' (#' + n.id + ')', '', get(n.key), ''); });
    });
    const a = el('a', { href: URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/markdown' })) });
    const d = new Date(); const p2 = (x) => (x < 10 ? '0' : '') + x;
    a.download = 'reading-room-notes-' + d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()) + '.md';
    document.body.append(a); a.click(); a.remove();
    status.textContent = 'Exported ' + a.download;
  });
  clearBtn.addEventListener('click', () => {
    if (!window.confirm('Clear every note on THIS page? Export first if you want a copy. This cannot be undone.')) return;
    keys().forEach((k) => { if (k.indexOf(PREFIX + page + '#') === 0) set(k, ''); });
    loadSection(current); genBox.value = ''; refreshList(); status.textContent = 'Notes on this page cleared.';
  });

  set(PREFIX + '_title:' + page, title);
  Object.keys(titles).forEach((id) => set(PREFIX + '_title:' + page + '#' + id, titles[id]));
  loadSection(current);
  genBox.value = get(key('general'));
  refreshList();
  if (!store()) status.textContent = 'This browser blocks storage here. Notes last only until you close the page. Export before closing.';
  open(get(PREFIX + '_open') === '1');
  live = { obs, off, nodes: [toggle, panel], buttons };
}

window.TheWayReadingNotes = { attach, detach };
})();
