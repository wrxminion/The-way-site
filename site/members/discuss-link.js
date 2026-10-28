// Adds a "Member discussion" link under ballot measures and history cases, and under candidates for admins only
// (Frank Oct 27; the database enforces the same limit, so this link is only a convenience). Loaded by waybar.js. The discussion itself lives on /members/discuss.html because the
// public pages' security policy does not allow them to talk to the database.
(() => {
'use strict';
const path = location.pathname;
// Roles come from what the member area wrote for the top bar ("theway.bar"). To open candidate comments to more
// people later, change the role test here AND run set_comment_kind_role in the database.
function isAdmin() {
  try {
    const bar = JSON.parse(localStorage.getItem('theway.bar') || 'null');
    return !!(bar && Array.isArray(bar.roles) && (bar.roles.includes('admin') || bar.roles.includes('super_admin')));
  } catch (e) { return false; }
}
let kind = null, id = null, m;
if ((m = /^\/guide(?:-([a-z]{2}))?\/measures\/([a-z0-9][a-z0-9-]*)\.html$/.exec(path))) { kind = 'measure'; id = `${m[1] || 'co'}-${m[2]}`; }
else if ((m = /^\/guide(?:-([a-z]{2}))?\/local\/m\/([a-z0-9][a-z0-9-]*)\.html$/.exec(path))) { kind = 'measure'; id = `${m[1] || 'co'}-local-${m[2]}`; }
else if (isAdmin() && (m = /^\/guide(?:-([a-z]{2}))?\/candidates\/([a-z0-9][a-z0-9-]*)\.html$/.exec(path))) { kind = 'candidate'; id = `${m[1] || 'co'}-${m[2]}`; }
else if ((m = /^\/cases\/([a-z0-9][a-z0-9-]*)\.html$/.exec(path)) && m[1] !== 'index') { kind = 'case'; id = m[1]; }
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
