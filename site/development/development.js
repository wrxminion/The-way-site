(async () => {
  const note = document.getElementById('note'), list = document.getElementById('list'), f = document.getElementById('filters');
  const el = (t, c, x) => { const e = document.createElement(t); if (c) e.className = c; if (x != null) e.textContent = x; return e; };
  const bucket = (s) => /LIVE_VERIFIED/.test(s) ? 'live' : /declin/i.test(s) ? 'declined' : /defer/i.test(s) ? 'deferred' : /merged|implemented|built|prototype|demonstrated|reported|designed|accepted|adopted|approved|superseded/i.test(s) ? 'in progress' : 'planned';
  let data, sel = 'all', order = 'new';
  const sorts = document.getElementById('sorts');
  const stamp = (r) => (String(r.decision_date_or_range).match(/\d{4}-\d{2}-\d{2}/) || ['0000-00-00'])[0] + String(parseInt(String(r.id).slice(1), 10) || 0).padStart(4, '0');
  try { data = window.LEDGER_DATA || await (await fetch('/development/data/ledger.json', { cache: 'no-cache' })).json(); } catch (e) { note.textContent = 'The ledger could not load. Reload the page.'; return; }
  note.textContent = data.note;
  const draw = () => {
    f.replaceChildren(...['all', 'live', 'in progress', 'planned', 'deferred', 'declined'].map((k) => { const b = el('button', null, k); b.type = 'button'; b.setAttribute('aria-pressed', String(k === sel)); b.onclick = () => { sel = k; draw(); }; return b; }));
    sorts.replaceChildren(...[['new', 'Newest first'], ['old', 'Oldest first']].map(([k, l]) => { const b = el('button', null, l); b.type = 'button'; b.setAttribute('aria-pressed', String(k === order)); b.onclick = () => { order = k; draw(); }; return b; }));
    const rows = data.rows.filter((r) => sel === 'all' || bucket(r.status_as_of_2026_10_25) === sel).sort((a, b) => (order === 'new' ? -1 : 1) * stamp(a).localeCompare(stamp(b)));
    list.replaceChildren(...(rows.length ? rows.map((r) => { const d = el('div', 'row'); d.id = r.id;
      d.append(el('h3', null, r.id + ': ' + r.title), el('span', 'pill warn', r.status_as_of_2026_10_25));
      for (const [k, l] of [['decision_date_or_range', 'When'], ['decision_or_proposal', 'Decision'], ['why', 'Why'], ['origin', 'Where it came from'], ['evidence_and_limits', 'Evidence and limits']]) { const p = el('p'); p.append(el('b', null, l + ': '), document.createTextNode(r[k] || '')); d.append(p); }
      return d; }) : [el('p', 'lede', 'Nothing in this group yet.')]));
  };
  draw();
})();
