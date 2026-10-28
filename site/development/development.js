(async () => {
  const note = document.getElementById('note'), list = document.getElementById('list'), f = document.getElementById('filters');
  const el = (t, c, x) => { const e = document.createElement(t); if (c) e.className = c; if (x != null) e.textContent = x; return e; };
  const bucket = (s) => /LIVE_VERIFIED/.test(s) ? 'live' : /declin/i.test(s) ? 'declined' : /defer/i.test(s) ? 'deferred' : /merged|implemented|built|prototype|demonstrated|reported|designed|accepted|adopted|approved|superseded/i.test(s) ? 'in progress' : 'planned';
  let data, sel = 'all', order = 'new';
  const sorts = document.getElementById('sorts');
  const stamp = (r) => (String(r.decision_date_or_range).match(/\d{4}-\d{2}-\d{2}/) || ['0000-00-00'])[0] + String(parseInt(String(r.id).replace(/\D/g, ''), 10) || 0).padStart(4, '0');
  try { data = window.LEDGER_DATA || await (await fetch('/development/data/ledger.json', { cache: 'no-cache' })).json(); } catch (e) { note.textContent = 'The ledger could not load. Reload the page.'; return; }
  // Rows added by merges since the last page build: the deploy copies live-rows.json from the ledger-data branch (see .cpanel.yml). The page works without it.
  try {
    const ac = new AbortController(); const tm = setTimeout(() => ac.abort(), 4000);
    const lr = await fetch('/development/data/live-rows.json', { cache: 'no-cache', signal: ac.signal }); clearTimeout(tm);
    if (lr.ok) {
      const tag = (r) => (String(r.origin).match(/PR #\d+/) || [])[0];
      const have = new Set(data.rows.map(tag).filter(Boolean));
      const extra = ((await lr.json()).rows || []).filter((r) => tag(r) && !have.has(tag(r)));
      if (extra.length) data = Object.assign({}, data, { rows: data.rows.concat(extra) });
    }
  } catch (e) { /* offline or blocked: show the rows built into the page */ }
  // Admin ticks ("checked by a person") come the same way (checks.json); a tick or an un-tick there wins over the built-in mark.
  const ticked = new Set(), unticked = new Set();
  try {
    const ac = new AbortController(); const tm = setTimeout(() => ac.abort(), 4000);
    const cr = await fetch('/development/data/checks.json', { cache: 'no-cache', signal: ac.signal }); clearTimeout(tm);
    if (cr.ok) { const c = await cr.json(); (c.checked || []).forEach((i) => ticked.add(i)); (c.unchecked || []).forEach((i) => unticked.add(i)); }
  } catch (e) { /* same: fall back to the marks built into the page */ }
  const checked = (r) => !unticked.has(r.id) && (r.checked_by_person === true || ticked.has(r.id));
  const STALE = /(a person|anyone|someone|no one)[^.]*\bnot\b[^.]*\b(checked|compared|tried|tested|followed|verified|opened)|not (yet |independently )?verified|not yet checked|live (appearance|behavior)[^.]*not yet/i;
  const evidence = (r) => { const t = r.evidence_and_limits || ''; if (!checked(r)) return t; const keep = t.split(/(?<=[.!?])\s+/).filter((x) => x && !STALE.test(x)); keep.push('Checked on the live site by a person.'); return keep.join(' '); };
  const det = el('details', 'notice notice-warn'), sm = el('summary'), more = el('span', 'notice-more');
  more.append(el('span', 'on-closed', 'Details'), el('span', 'on-open', 'Hide details'));
  sm.append(el('span', 'notice-tag', 'Warning'), el('span', 'notice-sum', 'Dates up to 2026-10-25 were reconstructed from project discussions; only LIVE_VERIFIED rows were checked on the live site.'), more);
  det.append(sm, el('div', 'notice-body', data.note));
  note.replaceChildren(det);
  const draw = () => {
    f.replaceChildren(...['all', 'live', 'in progress', 'planned', 'deferred', 'declined'].map((k) => { const b = el('button', null, k); b.type = 'button'; b.setAttribute('aria-pressed', String(k === sel)); b.onclick = () => { sel = k; draw(); }; return b; }));
    sorts.replaceChildren(...[['new', 'Newest first'], ['old', 'Oldest first']].map(([k, l]) => { const b = el('button', null, l); b.type = 'button'; b.setAttribute('aria-pressed', String(k === order)); b.onclick = () => { order = k; draw(); }; return b; }));
    const rows = data.rows.filter((r) => sel === 'all' || (checked(r) ? 'live' : bucket(r.status_as_of_2026_10_25)) === sel).sort((a, b) => (order === 'new' ? -1 : 1) * stamp(a).localeCompare(stamp(b)));
    list.replaceChildren(...(rows.length ? rows.map((r) => { const d = el('div', 'row'); d.id = r.id;
      d.append(el('h3', null, r.id + ': ' + r.title), (checked(r) ? el('span', 'pill ok', 'Live, checked by a person') : el('span', 'pill warn', r.status_as_of_2026_10_25)));
      for (const [k, l] of [['decision_date_or_range', 'When'], ['decision_or_proposal', 'Decision'], ['why', 'Why'], ['origin', 'Where it came from'], ['evidence_and_limits', 'Evidence and limits']]) { const p = el('p'); p.append(el('b', null, l + ': '), document.createTextNode(k === 'evidence_and_limits' ? evidence(r) : (r[k] || ''))); d.append(p); }
      return d; }) : [el('p', 'lede', 'Nothing in this group yet.')]));
  };
  draw();
})();
