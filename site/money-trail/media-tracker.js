// D249 (Nov 2026): the Media tracker tab. One card per media company: what political committees paid it (FEC filings),
// what its company PAC gave and to which party, who owns it, and buttons to the Money web and the Evidence inspector.
// Data: media.js (window.TW_MEDIA). Loaded after app.js. Text goes in with textContent. Nothing here is estimated.
(function () {
  'use strict';
  const M = window.TW_MEDIA, HUB = window.TW_MEDIA_HUB || {};
  const box = document.getElementById('media-view');
  if (!M || !box || typeof setView !== 'function') return;
  // Largest big number first; companies with no payments follow, largest company PAC first.
  const G = (M.groups || []).slice().sort((a, b) => (b.paid.total - a.paid.total) || (b.pac_gave.total - a.pac_gave.total));
  const el = (tag, cls, text) => { const d = document.createElement(tag); if (cls) d.className = cls; if (text != null) d.textContent = text; return d; };
  const link = (text, href) => { const a = el('a', 'bud-src', text); a.href = href; a.target = '_blank'; a.rel = 'noopener noreferrer'; return a; };
  const art = src => { const im = document.createElement('img'); im.src = src; im.alt = ''; im.width = 22; im.height = 24; im.className = 'tracker-btn-art'; im.decoding = 'async'; return im; };
  const WEB_ART = '/money-trail/art/money-web-link-blue.webp';
  const lines = (n, one, many) => n + ' ' + (n === 1 ? one : many);
  const sides = (o, one, many) => [['DEM', 'Democratic'], ['REP', 'Republican'], ['OTHER', 'another party'], ['NONE', 'no party on the FEC record']]
    .filter(([k]) => o[k + '_n']).map(([k, w]) => bigMoney(o[k]) + ' ' + (k === 'NONE' ? w : 'from ' + w) + ' (' + lines(o[k + '_n'], one, many) + ')');
  const pacSides = o => [['DEM', 'to Democrats'], ['REP', 'to Republicans'], ['OTHER', 'to other parties'], ['NONE', 'to committees with no party on the FEC record']]
    .filter(([k]) => o[k + '_n']).map(([k, w]) => bigMoney(o[k]) + ' ' + w);
  function openWeb(name) { graphHub = name; if (!hubs.includes(graphHub)) { hubs.push(graphHub); prepareHubRefresh(); } $('#hub').value = graphHub; graphScale = 1; setView('network'); $('.center-panel').scrollIntoView({ block: 'start', behavior: 'smooth' }); }
  function card(g, max) {
    const c = el('div', 'tracker-card bud-row media-card'), top = el('div', 'bud-top'), p = g.paid, v = p.total;
    top.append(el('b', 'bud-big' + (v > 0 ? '' : ' none'), v > 0 ? bigMoney(v) : 'No payments found'), el('strong', 'bud-name', g.name));
    c.append(top);
    if (v > 0 && max > 0) { const b = el('span', 'bud-bar'), i = el('i'); i.style.width = Math.max(0.5, Math.min(100, 100 * v / max)).toFixed(1) + '%'; b.append(i); c.append(b); }
    c.append(el('small', 'bud-small media-owns', 'Owns: ' + g.outlets.join(', ')));
    if (v > 0) {
      const parts = [p.ad_n ? bigMoney(p.ad) + ' for ads and media' : '', p.other_n ? bigMoney(p.other) + ' for other things (purpose as written)' : '', p.ie_n ? bigMoney(p.ie) + ' in independent expenditures' : ''].filter(Boolean);
      c.append(el('small', 'bud-small', 'Paid to it by political committees in 2025-2026, after refunds: ' + lines(p.n, 'filing line', 'filing lines') + '. ' + parts.join(' · ') + '.'));
      c.append(el('small', 'bud-small', 'Who paid: ' + sides(p, 'line', 'lines').join(' · ') + '.'));
    } else c.append(el('small', 'bud-small', p.n ? lines(p.n, 'FEC filing line names', 'FEC filing lines name') + ' this company as the payee in 2025-2026, but after refunds nothing is left.' : 'No 2025-2026 FEC filing line names this company as the payee.'));
    const q = g.pac_gave;
    if (g.pacs.length) {
      const pn = g.pacs.map(x => x.name).join('; ');
      c.append(el('small', 'bud-small', q.n ? 'Company PAC (' + pn + ') gave ' + bigMoney(q.total) + ' in ' + lines(q.n, 'gift', 'gifts') + ': ' + pacSides(q).join(' · ') + '.' : 'Company PAC: ' + pn + '. No gifts in the 2025-2026 FEC files.'));
    } else c.append(el('small', 'bud-small', 'No company PAC found in the FEC committee list.'));
    if (g.owners && g.owners.length) {
      const ow = g.owners.slice(0, 5).map(w => w.name + (w.percent ? ' ' + w.percent + (String(w.percent).includes('%') ? '' : '%') + (w['class'] ? ' of ' + w['class'] : '') : '') + (w.voting_percent ? ', ' + w.voting_percent + (String(w.voting_percent).includes('%') ? '' : '%') + ' of the votes' : ''));
      c.append(el('small', 'bud-small media-owners', 'Largest owners (' + (g.source_kind || 'company record') + (g.owners[0].as_of ? ', as of ' + g.owners[0].as_of : '') + '): ' + ow.join(' · ') + (g.owners.length > 5 ? ' · and ' + (g.owners.length - 5) + ' more' : '') + '.'));
    } else c.append(el('small', 'bud-small media-owners', 'Owners: no filed record of the owner found yet.'));
    if (g.caveat) c.append(el('small', 'bud-small media-caveat', 'Note: ' + g.caveat));
    const act = el('div', 'bud-act');
    if (g.source_url) act.append(link('Ownership record ↗', g.source_url));
    g.pacs.slice(0, 2).forEach(x => act.append(link('FEC: ' + (g.pacs.length > 1 ? x.id : 'company PAC') + ' ↗', M.meta.cmte + x.id + '/')));
    const hub = HUB[g.id];
    const b = el('button', 'tracker-web', 'See in the Money web'); b.type = 'button'; b.prepend(art(WEB_ART)); b.addEventListener('click', () => openWeb(hub)); act.append(b);
    const ins = el('button', 'tracker-inspect', 'Inspect'); ins.type = 'button'; ins.prepend(art(CABINET));
    ins.addEventListener('click', () => pick({ record_kind: 'entity', name: hub, entity_type: 'media company', id: g.cik ? 'SEC CIK ' + g.cik : 'media:' + g.id, jurisdiction: 'US', source_url: g.source_url || '',
      notes: 'Owns ' + g.outlets.join(', ') + '. ' + (v > 0 ? 'Political committees paid it ' + bigMoney(v) + ' in ' + lines(p.n, 'FEC filing line', 'FEC filing lines') + ' (2025-2026). ' : '') + (q.n ? 'Its company PAC gave ' + bigMoney(q.total) + '. ' : '') + 'Payees are matched to the company by the name written on each filing; a matching name is not proof of the same legal company.' }));
    act.append(ins); c.append(act);
    return c;
  }
  let query = '', all = false, built = false;
  function draw() {
    const list = box.querySelector('.tracker-list'); list.replaceChildren();
    const qq = query.trim().toLowerCase();
    const rows = G.filter(g => !qq || (g.name + ' ' + g.outlets.join(' ') + ' ' + (g.owners || []).map(w => w.name).join(' ')).toLowerCase().includes(qq));
    const max = rows.reduce((m, g) => Math.max(m, g.paid.total), 0);
    rows.slice(0, all || qq ? rows.length : 12).forEach(g => list.append(card(g, max)));
    if (!rows.length) list.append(el('div', 'empty', 'No outlet or owner matches. Try fewer letters.'));
    const more = box.querySelector('.tracker-more'); more.hidden = !!qq || rows.length <= 12; more.textContent = all ? 'Show the 12 largest' : 'Show all ' + rows.length;
    $('#feed-sub').textContent = G.length + ' media companies and their outlets';
  }
  function render() {
    if (!built) {
      built = true;
      const area = el('div', 'tracker-area'); box.append(area);
      area.append(el('p', 'state-lead', 'TV, cable, newspapers, radio and online news, grouped by the company that owns them. The big number is what political committees paid the company in 2025-2026, from FEC filings. Payees are matched by the name written on each filing. Paying an outlet for ads does not mean the outlet supports anyone.'));
      const lab = el('label', 'tracker-search'), inp = el('input'); inp.type = 'search'; inp.autocomplete = 'off'; inp.placeholder = 'Type an outlet, company or owner…';
      inp.addEventListener('input', () => { query = inp.value; draw(); }); lab.append(el('span', null, 'Find a media outlet'), inp);
      const more = el('button', 'bud-more tracker-more'); more.type = 'button'; more.addEventListener('click', () => { all = !all; draw(); });
      const m = M.meta, note = el('p', 'bud-note media-note', 'Source: FEC bulk data files for 2025-2026, pulled ' + String(m.retrieved || '').slice(0, 10) + '. Memo lines are left out so nothing counts twice. The web shows the ' + m.limit + ' largest lines for each company, the same for every company. Individuals who are not owners are not named.');
      area.append(lab, el('div', 'tracker-list bud-list'), more, note);
    }
    draw();
  }
  const base = setView;
  setView = function (v) {
    base(v);
    box.hidden = v !== 'media';
    if (v === 'media') { $('#feed-title').textContent = 'The media tracker'; render(); }
  };
  if (new URLSearchParams(location.search).get('view') === 'media') setView('media');
})();
