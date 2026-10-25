// Turns a section into a collapsible disclosure. Opt in with data-accordion on a heading, or it
// matches headings titled exactly "What People Do" (any case). Starts collapsed; the whole title row,
// chevron included, is one <button>. Content stays in the page for search and for people without JS.
(() => {
'use strict';
const TITLES = [/^what people do$/i];
const reduce = () => matchMedia('(prefers-reduced-motion:reduce)').matches;
let n = 0;

function level(h) { return +h.tagName[1]; }
function collect(h) {
  const out = []; let el = h.nextElementSibling;
  while (el && !(/^H[1-6]$/.test(el.tagName) && level(el) <= level(h))) { out.push(el); el = el.nextElementSibling; }
  return out;
}
function build(h) {
  const nodes = collect(h);
  if (!nodes.length || h.dataset.accDone) return null;
  h.dataset.accDone = '1';
  const id = 'acc-' + (++n);
  const title = h.textContent.trim();
  const btn = document.createElement('button');
  btn.type = 'button'; btn.className = 'acc-btn'; btn.id = id + '-btn';
  btn.setAttribute('aria-expanded', 'false'); btn.setAttribute('aria-controls', id);
  const label = document.createElement('span'); label.textContent = title;
  const chev = document.createElement('span'); chev.className = 'acc-chev'; chev.setAttribute('aria-hidden', 'true');
  btn.append(label, chev);
  h.textContent = ''; h.classList.add('acc-h'); h.append(btn);
  const wrap = document.createElement('div'); wrap.className = 'acc-wrap'; wrap.id = id;
  wrap.setAttribute('role', 'region'); wrap.setAttribute('aria-labelledby', btn.id);
  const panel = document.createElement('div'); panel.className = 'acc-panel';
  h.after(wrap); wrap.append(panel); nodes.forEach((x) => panel.append(x));
  // inert keeps links and controls out of the tab order and away from screen readers while collapsed
  panel.inert = true;
  const set = (open) => {
    btn.setAttribute('aria-expanded', String(open));
    wrap.classList.toggle('open', open);
    panel.inert = !open;
  };
  btn.addEventListener('click', () => set(btn.getAttribute('aria-expanded') !== 'true'));
  // a link that points inside opens the section first
  const openFor = () => { const t = location.hash && document.getElementById(decodeURIComponent(location.hash.slice(1))); if (t && panel.contains(t)) { set(true); t.scrollIntoView({ behavior: reduce() ? 'auto' : 'smooth' }); } };
  addEventListener('hashchange', openFor); openFor();
  return { btn, set };
}
function init() {
  for (const h of document.querySelectorAll('h2,h3,h4')) {
    if (h.hasAttribute('data-accordion') || TITLES.some((re) => re.test(h.textContent.trim()))) build(h);
  }
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
