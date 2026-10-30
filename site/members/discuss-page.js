// discuss.html?item=<kind>:<id>&title=<text>[&src=<publisher>&u=<article link>&d=<date>]: one page of discussion, reachable from news cards,
// guide pages and case pages (those pages' security policy blocks the database, so they link here instead).
// News layout, plain like old forums: article title (links to the publisher, source in brackets), an image slot
// (empty until a picture is allowed), one line of facts, then the comments. All text goes in via textContent.
(() => {
'use strict';
const q = new URLSearchParams(location.search);
const item = String(q.get('item') || '');
const m = /^(news|case|measure|candidate):([a-z0-9][a-z0-9._-]{0,119})$/.exec(item);
const mount = document.getElementById('dp-mount');
if (!m) { mount.textContent = 'This page needs an item to discuss. Go back and use the discussion link on the page you were reading.'; return; }
const title = String(q.get('title') || '').slice(0, 200);
const src = String(q.get('src') || '').slice(0, 80);
const day = /^\d{4}-\d{2}-\d{2}$/.test(String(q.get('d') || '')) ? q.get('d') : '';
let link = '';
try { const u = new URL(String(q.get('u') || '')); if (u.protocol === 'https:' && String(u).length <= 2048) link = u.href; } catch (e) { /* no link */ }
const h1 = document.getElementById('dp-h');
const meta = document.getElementById('dp-meta');
if (title) {
  h1.textContent = '';
  if (link && m[1] === 'news') {
    const a = document.createElement('a'); a.href = link; a.target = '_blank'; a.rel = 'noopener noreferrer nofollow'; a.textContent = title; h1.append(a);
    if (src) h1.append(document.createTextNode(' '), Object.assign(document.createElement('span'), { className: 'dp-src', textContent: '(' + src + ')' }));
  } else h1.textContent = title;
  document.title = `Comments: ${title.slice(0, 60)} · The Way`;
}
// image slot: filled only with a picture from this site (members pages allow images from this site). Thumbnails are off, so nothing is passed today.
const img = String(q.get('img') || '');
if (/^\/[A-Za-z0-9\/_.-]{1,200}\.(webp|jpg|png)$/.test(img) && !img.includes('..')) {
  const box = document.getElementById('dp-img'); const i = document.createElement('img');
  i.src = img; i.alt = ''; i.loading = 'lazy'; box.append(i); box.hidden = false;
}
if (m[1] === 'news') meta.textContent = [day ? 'Published ' + day : '', 'Discussion by readers of The Way. We link to the article; we do not host it.'].filter(Boolean).join(' · ');
else meta.hidden = true;
const back = { news: ['/news/', 'Back to the news'], case: [`/cases/${m[2]}.html`, 'Back to the case'], measure: null, candidate: null }[m[1]];
const pb = document.getElementById('dp-back');
if (back) { const a = document.createElement('a'); a.href = back[0]; a.textContent = back[1]; pb.append(a); }
else { pb.append('Use your browser\'s back button to return to the page you were reading.'); }
mount.setAttribute('data-way-discuss', item);
if (title) mount.setAttribute('data-way-title', title);
})();
