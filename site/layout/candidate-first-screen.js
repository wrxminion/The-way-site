// Candidate first-screen redesign (progressive enhancement of the existing generated pages).
// Order becomes: name, party and office line, "In their own words", then everything else. The generic office
// description and Background become collapsed "About the office" and "Background" blocks. Facts, links and
// sources are moved, never rewritten. If a page has no sourced statements it shows "Statements being verified".
(() => {
'use strict';
const main = document.querySelector('main.wrap');
const eyebrow = main && main.querySelector('.eyebrow');
if (!main || !eyebrow || !/^candidate/i.test(eyebrow.textContent.trim())) return;
document.body.classList.add('cfs');
const h1 = main.querySelector('h1');
const meta = main.querySelector('p.meta');
const facts = main.querySelector('dl.facts');
const officeNote = [...main.querySelectorAll(':scope > p.note')].find((p) => /^what this job does/i.test(p.textContent.trim()));
const sections = [...main.querySelectorAll(':scope > section')];
const own = sections.find((s) => /in their own words/i.test((s.querySelector('h2') || {}).textContent || ''));
const bg = sections.find((s) => /^background$/i.test(((s.querySelector('h2') || {}).textContent || '').trim()));

function more(title, nodes, cls) {
  const d = document.createElement('details'); d.className = 'cfs-more ' + (cls || '');
  const s = document.createElement('summary'); s.textContent = title; d.append(s);
  nodes.forEach((n) => d.append(n)); return d;
}
// 1. identity line stays on top: eyebrow, h1, meta, current office from the facts list
let anchor = meta || h1;
if (facts) { facts.classList.add('cfs-office'); anchor.after(facts); anchor = facts; }
// 2. "In their own words" immediately after
let ownEl = own;
if (own) { own.classList.add('cfs-own'); }
else {
  ownEl = document.createElement('section'); ownEl.className = 'cfs-own';
  ownEl.innerHTML = '<h2>In their own words</h2><p class="cfs-pending note">Statements being verified. We only list what a candidate has said when we can link the original.</p>';
}
anchor.after(ownEl);
// 3. office description and background go below, collapsed
const tail = [];
if (officeNote) { const t = more('About the office', [officeNote], 'cfs-about'); tail.push(t); }
if (bg) { const h = bg.querySelector('h2'); if (h) h.remove(); tail.push(more('Background', [...bg.childNodes], 'cfs-bg')); bg.remove(); }
// 4. the evidence sections already on the page keep their order; the collapsed blocks sit after them
const last = [...main.querySelectorAll(':scope > section, :scope > p.note')].pop();
tail.forEach((t) => (last ? last.before(t) : main.append(t)));
// a link pointing inside a collapsed block opens it
const openFor = () => { const t = location.hash && document.getElementById(decodeURIComponent(location.hash.slice(1))); const d = t && t.closest('details'); if (d) d.open = true; };
addEventListener('hashchange', openFor); openFor();
})();
