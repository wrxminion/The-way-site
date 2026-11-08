// Admin > Reading room (super admins only). Internal drafts that are not public.
// The drafts are NOT in this repository and NOT on the web server. They live in the private
// team-research bucket as reading-room/pages.json, which the database lets only super admins
// read or replace. This file is only the viewer: with no super admin sign-in it has nothing to show.
// The notes bar (reading-notes.js) is loaded only after the drafts have downloaded, so only for
// super admins. Notes stay in that browser (localStorage); nothing is sent anywhere.
// Plain JavaScript, no build step. app.js hands over its helpers once:
// TheWayReadingRoom.make({ sb, h, q, render, notice, action }).
(() => {
'use strict';

const PATH = 'reading-room/pages.json';
const NOTES_JS = '/members/reading-notes.js?v=1';
const NOTES_CSS = '/members/reading-notes.css?v=1';

// What the drafts may contain. Anything else is dropped; text always goes in as text.
const TAGS = new Set(['h1', 'h2', 'h3', 'h4', 'p', 'ul', 'ol', 'li', 'a', 'strong', 'em', 'b', 'i', 'code', 'pre', 'br', 'hr',
  'blockquote', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'span', 'div', 'sup', 'sub', 'del']);
const DROP = new Set(['script', 'style', 'iframe', 'object', 'embed', 'form', 'input', 'button', 'textarea', 'select', 'svg', 'math', 'img', 'video', 'audio', 'link', 'meta', 'template']);
const CLASS_OK = /^(lbl|lbl-(fact|claim|judgment|unconfirmed)|tablewrap|even|odd|header)$/;

function make(ctx) {
  const { sb, h, render, notice, action } = ctx;
  let cache = null;          // the downloaded drafts, kept in memory for this visit only
  let shown = null;          // { id, root } of the page on screen
  let notesReady = null;

  const link = (pid, sec) => `#/reading/${encodeURIComponent(pid)}${sec ? '/' + encodeURIComponent(sec) : ''}`;

  function clean(src, pages, pid) {
    const doc = new DOMParser().parseFromString(`<body>${src}</body>`, 'text/html');   // a parsed document never runs scripts
    const ids = new Set(pages.map((p) => p.id));
    const walk = (node, out) => {
      for (const n of node.childNodes) {
        if (n.nodeType === 3) { out.append(document.createTextNode(n.nodeValue)); continue; }
        if (n.nodeType !== 1) continue;
        const tag = n.tagName.toLowerCase();
        if (DROP.has(tag)) continue;
        if (!TAGS.has(tag)) { walk(n, out); continue; }
        const el = document.createElement(tag);
        if (/^h[1-4]$/.test(tag) && /^[A-Za-z0-9_-]{1,120}$/.test(n.id)) el.id = n.id;
        const cls = (n.getAttribute('class') || '').split(/\s+/).filter((c) => CLASS_OK.test(c));
        if (cls.length) el.className = cls.join(' ');
        if (tag === 'ol' && /^[1aAiI]$/.test(n.getAttribute('type') || '')) el.setAttribute('type', n.getAttribute('type'));
        if ((tag === 'td' || tag === 'th') && /^\d{1,2}$/.test(n.getAttribute('colspan') || '')) el.setAttribute('colspan', n.getAttribute('colspan'));
        if (tag === 'a') {
          const href = (n.getAttribute('href') || '').trim();
          let m;
          if (/^https?:\/\//i.test(href)) { el.href = href; el.target = '_blank'; el.rel = 'noopener noreferrer nofollow'; }
          else if (/^mailto:[^\s"<>]+$/i.test(href)) el.href = href;
          else if ((m = href.match(/^#([A-Za-z0-9_-]{1,120})$/))) el.href = link(pid, m[1]);
          else if ((m = href.match(/^([a-z0-9-]{1,60})\.html(?:#([A-Za-z0-9_-]{1,120}))?$/)) && ids.has(m[1])) el.href = link(m[1], m[2]);
          if (n.getAttribute('title')) el.title = n.getAttribute('title');
        }
        walk(n, el);
        out.append(el);
      }
    };
    const frag = document.createDocumentFragment();
    walk(doc.body, frag);
    return frag;
  }

  function contents(root, pid) {
    const heads = [...root.querySelectorAll('h2[id], h3[id]')];
    const top = h('a', { class: 'rr-toc-top', href: link(pid), text: 'Top of page' });
    return h('details', { class: 'rr-toc', open: window.matchMedia('(min-width: 1000px)').matches },
      h('summary', { text: 'Contents' }), top,
      h('ul', {}, heads.map((x) => h('li', { class: x.tagName === 'H3' ? 'rr-sub' : '' },
        h('a', { href: link(pid, x.id), text: x.textContent.trim() })))));
  }

  function uploadForm(after) {
    const input = h('input', { type: 'file', accept: '.json,application/json', 'aria-label': 'The drafts file' });
    const out = h('div');
    return h('div', { class: 'panel' }, h('h2', { text: 'Upload the drafts file' }),
      h('p', { class: 'small dim', text: 'Pick the file named reading-room-pages.json. It replaces the one there now. It goes to the private team research storage, which only super admins can read.' }),
      input, out,
      h('div', { class: 'btns' }, h('button', { class: 'primary', type: 'button', text: 'Upload', onclick: action(async () => {
        const f = input.files && input.files[0];
        if (!f) throw new Error('Pick the file first.');
        let data;
        try { data = JSON.parse(await f.text()); } catch { throw new Error('That file is not the drafts file.'); }
        if (!data || !Array.isArray(data.pages) || !data.pages.length) throw new Error('That file is not the drafts file.');
        out.replaceChildren(h('p', { class: 'small', text: 'Uploading…' }));
        const { error } = await sb.storage.from('team-research').upload(PATH, f, { upsert: true, contentType: 'application/json' });
        if (error) throw error;
        cache = null; shown = null;
        out.replaceChildren(notice('Uploaded.', 'ok'));
        await after();
      }, out) })));
  }

  async function load() {
    if (cache) return cache;
    const { data, error } = await sb.storage.from('team-research').download(PATH);
    if (error) return null;
    let d;
    try { d = JSON.parse(await data.text()); } catch { return null; }
    if (!d || !Array.isArray(d.pages)) return null;
    d.pages = d.pages.filter((p) => p && /^[a-z0-9-]{1,60}$/.test(p.id) && typeof p.html === 'string');
    cache = d;
    return d;
  }

  function notes() {
    if (!notesReady) notesReady = new Promise((ok, bad) => {
      const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = NOTES_CSS; document.head.append(css);
      const s = document.createElement('script'); s.src = NOTES_JS;
      s.onload = () => (window.TheWayReadingNotes ? ok(window.TheWayReadingNotes) : bad(new Error('notes')));
      s.onerror = () => { notesReady = null; bad(new Error('notes')); };
      document.head.append(s);
    });
    return notesReady;
  }

  function go(sec) {
    const el = sec && document.getElementById(sec);
    if (el) el.scrollIntoView({ block: 'start' });
    else window.scrollTo(0, 0);
  }

  async function view(pidRaw, secRaw) {
    const pid = decodeURIComponent(pidRaw || ''), sec = decodeURIComponent(secRaw || '');
    // Same page already on screen: only move to the section.
    if (shown && shown.root.isConnected && (shown.id === pid || (!pid && shown.first))) { go(sec); return; }
    document.body.classList.add('rr-on');
    render(h('h1', { text: 'Reading room' }), h('p', { class: 'muted', text: 'Loading…' }));
    const d = await load();
    const back = h('p', {}, h('a', { href: '#/admin', text: '← Admin' }));
    if (!d || !d.pages.length) {
      return render(back, h('h1', { text: 'Reading room' }),
        h('p', { class: 'muted', text: 'Nothing is uploaded yet. Upload the drafts file below.' }), uploadForm(() => view(pidRaw, secRaw)));
    }
    const page = d.pages.find((p) => p.id === pid) || d.pages[0];
    const article = h('article', { class: 'rr-paper' });
    article.append(clean(page.html, d.pages, page.id));
    const bar = h('nav', { class: 'rr-pages', 'aria-label': 'Drafts' }, d.pages.map((p) =>
      h('a', { href: link(p.id), class: p.id === page.id ? 'here' : null, 'aria-current': p.id === page.id ? 'page' : null, text: p.title || p.id })));
    render(back,
      h('div', { class: 'rr-head' }, h('span', { class: 'rr-tag', text: 'Super admins only. Not public.' }),
        d.built ? h('span', { class: 'small dim', text: `File built ${d.built}` }) : null),
      bar,
      h('div', { class: 'rr-wrap' }, h('aside', { class: 'rr-side', 'aria-label': 'Contents' }, contents(article, page.id)),
        h('div', { class: 'rr-main' }, article, h('p', { class: 'rr-totop' }, h('a', { href: link(page.id), text: 'Back to top' })))),
      h('details', { class: 'rr-replace' }, h('summary', { text: 'Replace the drafts file' }), uploadForm(() => view(page.id, ''))));
    shown = { id: page.id, root: article, first: page === d.pages[0] };
    go(sec);
    try {
      const N = await notes();
      if (shown && shown.root === article && article.isConnected) N.attach({ root: article, page: page.id, title: page.title || page.id, link });
    } catch { article.before(notice('The notes bar did not load. Reload the page to try again.')); }
  }

  // Leaving the reading room takes the notes bar and the wide layout away.
  window.addEventListener('hashchange', () => {
    if (/^#\/reading(\/|$)/.test(location.hash)) return;
    document.body.classList.remove('rr-on');
    shown = null;
    if (window.TheWayReadingNotes) window.TheWayReadingNotes.detach();
  });

  return { view };
}

window.TheWayReadingRoom = { make };
})();
