// Search and filters over the case list that is already on the page. Nothing is added: each card's own text is used.
// A card's small label reads "Case 01 · Public integrity · 1982 to 1993": topic = second part, period = first year.
(() => {
'use strict';
const hub = document.querySelector('.cases-hub .hub');
if (!hub) return;
const cards = [...hub.querySelectorAll('a.hub-card')];
if (!cards.length) return;
const info = cards.map((a) => {
  const parts = (a.querySelector('.depth') || { textContent: '' }).textContent.split('·').map((s) => s.trim());
  const year = (parts[2] || parts[1] || '').match(/\d{4}/);
  const y = year ? +year[0] : null;
  return { a, topic: parts[1] || '', decade: y ? Math.floor(y / 10) * 10 : null, text: a.textContent.toLowerCase() };
});
const topics = [...new Set(info.map((i) => i.topic).filter(Boolean))].sort();
const decades = [...new Set(info.map((i) => i.decade).filter((d) => d != null))].sort((a, b) => a - b);
const bar = document.createElement('div'); bar.className = 'cf-bar'; bar.setAttribute('role', 'search');
const field = (label, node) => { const w = document.createElement('div'); const l = document.createElement('label'); l.textContent = label; l.htmlFor = node.id; w.append(l, node); return w; };
const q = document.createElement('input'); q.type = 'search'; q.id = 'cf-q'; q.placeholder = 'Search the cases'; q.autocomplete = 'off';
const st = document.createElement('select'); st.id = 'cf-topic'; st.innerHTML = '<option value="">All topics</option>' + topics.map((t) => '<option>' + t.replace(/&/g, '&amp;').replace(/</g, '&lt;') + '</option>').join('');
const sd = document.createElement('select'); sd.id = 'cf-decade'; sd.innerHTML = '<option value="">All time periods</option>' + decades.map((d) => '<option value="' + d + '">' + d + 's</option>').join('');
const row = document.createElement('div'); row.className = 'cf-row';
row.append(field('Search', q), field('Topic', st), field('Time period', sd));
const rnd = document.createElement('button'); rnd.type = 'button'; rnd.className = 'cf-random'; rnd.textContent = 'Read a random record';
rnd.addEventListener('click', () => {
  const shown = info.filter((i) => !i.a.hidden);
  const pool = shown.length ? shown : info;
  const pick = pool[Math.floor(Math.random() * pool.length)];
  count.textContent = 'Opening ' + ((pick.a.querySelector('h2,h3,strong') || pick.a).textContent || '').trim().slice(0, 90) + '\u2026';
  location.href = pick.a.href;
});
row.append(rnd);
const count = document.createElement('p'); count.className = 'cf-count'; count.setAttribute('role', 'status'); count.setAttribute('aria-live', 'polite');
bar.append(row, count);
const slot = document.querySelector('.cf-slot');
if (slot) slot.appendChild(bar);
else { const anchor = document.getElementById('read') || hub; anchor.parentElement.insertBefore(bar, anchor); }
function run() {
  const t = q.value.trim().toLowerCase(), tp = st.value, dc = sd.value;
  let n = 0;
  info.forEach((i) => {
    const ok = (!t || i.text.includes(t)) && (!tp || i.topic === tp) && (!dc || String(i.decade) === dc);
    i.a.hidden = !ok; if (ok) n++;
  });
  count.textContent = 'Showing ' + n + ' of ' + info.length + ' cases.';
}
[q, st, sd].forEach((e) => e.addEventListener('input', run));
const qs = new URLSearchParams(location.search); if (qs.get('q')) q.value = qs.get('q');
run();
})();
