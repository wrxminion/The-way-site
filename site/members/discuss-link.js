// Adds a "Member discussion" link under ballot measures and history cases (and candidates, once switched on here
// AND in the database). Loaded by waybar.js. The discussion itself lives on /members/discuss.html because the
// public pages' security policy does not allow them to talk to the database.
(() => {
'use strict';
const CANDIDATES_ON = false;   // keep OFF until the lawyer answers questions 47-50, then also run set_comment_kind in the database
const path = location.pathname;
let kind = null, id = null, m;
if ((m = /^\/preview\/pages\/guide(?:-([a-z]{2}))?\/measures\/([a-z0-9][a-z0-9-]*)\.html$/.exec(path))) { kind = 'measure'; id = `${m[1] || 'co'}-${m[2]}`; }
else if ((m = /^\/preview\/pages\/guide(?:-([a-z]{2}))?\/local\/m\/([a-z0-9][a-z0-9-]*)\.html$/.exec(path))) { kind = 'measure'; id = `${m[1] || 'co'}-local-${m[2]}`; }
else if (CANDIDATES_ON && (m = /^\/preview\/pages\/guide(?:-([a-z]{2}))?\/candidates\/([a-z0-9][a-z0-9-]*)\.html$/.exec(path))) { kind = 'candidate'; id = `${m[1] || 'co'}-${m[2]}`; }
else if ((m = /^\/preview\/pages\/cases\/([a-z0-9][a-z0-9-]*)\.html$/.exec(path)) && m[1] !== 'index') { kind = 'case'; id = m[1]; }
if (!kind || id.length > 120) return;
let signedIn = false;
try { for (let i = 0; i < localStorage.length; i++) if (/^sb-.+-auth-token$/.test(localStorage.key(i) || '')) signedIn = true; } catch (e) { /* private mode */ }
const what = { measure: 'this measure', case: 'this case', candidate: 'this candidate' }[kind];
const h1 = document.querySelector('h1');
const title = ((h1 && (h1.innerText || h1.textContent)) || document.title || '').trim().slice(0, 200);
const a = document.createElement('a');
a.href = `/members/discuss.html?item=${kind}:${encodeURIComponent(id)}&title=${encodeURIComponent(title)}`;
a.textContent = signedIn ? `Join the member discussion on ${what}` : `Member discussion on ${what}`;
const p = document.createElement('p');
p.append(a, signedIn ? '' : ' (members only; sign in or join)');
const box = document.createElement('aside');
box.className = 'wd-link';
box.setAttribute('aria-label', 'Member discussion');
box.append(p);
const foot = document.querySelector('footer');
if (foot && foot.parentNode) foot.parentNode.insertBefore(box, foot); else (document.querySelector('main') || document.body).append(box);
})();
