(async () => {
  const note = document.getElementById('note'), list = document.getElementById('list'), f = document.getElementById('filters');
  const el = (t, c, x) => { const e = document.createElement(t); if (c) e.className = c; if (x != null) e.textContent = x; return e; };
  const bucket = (s) => /live|verified live/i.test(s) && !/pending|unverified/i.test(s) ? 'live' : /declin/i.test(s) ? 'declined' : /defer/i.test(s) ? 'deferred' : /built|prototype|demonstrated|reported|designed|accepted|adopted|approved/i.test(s) ? 'in progress' : 'planned';
  let data, sel = 'all';
  try { data = window.LEDGER_DATA || await (await fetch('/development/data/ledger.json', { cache: 'no-cache' })).json(); } catch (e) { note.textContent = 'The ledger could not load. Reload the page.'; return; }
  note.textContent = data.note;
  const draw = () => {
    f.replaceChildren(...['all', 'live', 'in progress', 'planned', 'deferred', 'declined'].map((k) => { const b = el('button', null, k); b.type = 'button'; b.setAttribute('aria-pressed', String(k === sel)); b.onclick = () => { sel = k; draw(); }; return b; }));
    const rows = data.rows.filter((r) => sel === 'all' || bucket(r.status_as_of_2026_10_25) === sel);
    list.replaceChildren(...(rows.length ? rows.map((r) => { const d = el('div', 'row'); d.id = r.id;
      d.append(el('h3', null, r.id + ': ' + r.title), el('span', 'pill warn', r.status_as_of_2026_10_25));
      for (const [k, l] of [['decision_date_or_range', 'When'], ['decision_or_proposal', 'Decision'], ['why', 'Why'], ['origin', 'Where it came from'], ['evidence_and_limits', 'Evidence and limits']]) { const p = el('p'); p.append(el('b', null, l + ': '), document.createTextNode(r[k] || '')); d.append(p); }
      return d; }) : [el('p', 'lede', 'Nothing in this group yet.')]));
  };
  draw();
})();
