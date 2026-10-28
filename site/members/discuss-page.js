// discuss.html?item=<kind>:<id>&title=<text>: one page of member discussion, reachable from news cards, guide
// pages and case pages (those pages' security policy blocks the database, so they link here instead).
(() => {
'use strict';
const q = new URLSearchParams(location.search);
const item = String(q.get('item') || '');
const m = /^(news|case|measure|candidate):([a-z0-9][a-z0-9._-]{0,119})$/.exec(item);
const mount = document.getElementById('dp-mount');
if (!m) { mount.textContent = 'This page needs an item to discuss. Go back and use the member discussion link on the page you were reading.'; return; }
const title = String(q.get('title') || '').slice(0, 200);
document.getElementById('dp-title').textContent = title;
if (title) document.title = `Discussion: ${title.slice(0, 60)} · The Way`;
const back = { news: ['/news/', 'Back to the news'], case: [`/cases/${m[2]}.html`, 'Back to the case'], measure: null, candidate: null }[m[1]];
const pb = document.getElementById('dp-back');
if (back) { const a = document.createElement('a'); a.href = back[0]; a.textContent = back[1]; pb.append(a); }
else { pb.append('Use your browser\'s back button to return to the page you were reading.'); }
mount.setAttribute('data-way-discuss', item);
if (title) mount.setAttribute('data-way-title', title);
})();
