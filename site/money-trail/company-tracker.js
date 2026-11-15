// Company tracker tab (Nov 2026). One card per company: what its PAC gave and to which party, what people who list it
// as their employer gave, what it spent on lobbying, and the federal money it got. Buttons open its trail page (every
// figure with its source), the Money web and the FEC record. Data: companies.js (window.TW_COMPANIES). Loaded after app.js.
// Text goes in with textContent. Nothing here is estimated.
(function () {
  'use strict';
  const D = window.TW_COMPANIES, HUB = window.TW_COMPANY_HUB || {};
  const box = document.getElementById('companies-view');
  if (!D || !box || typeof setView !== 'function') return;
  const el = (tag, cls, text) => { const d = document.createElement(tag); if (cls) d.className = cls; if (text != null) d.textContent = text; return d; };
  const ext = (text, href) => { const a = el('a', 'bud-src', text); a.href = href; a.target = '_blank'; a.rel = 'noopener noreferrer'; return a; };
  const art = src => { const im = document.createElement('img'); im.src = src; im.alt = ''; im.width = 22; im.height = 24; im.className = 'tracker-btn-art'; im.decoding = 'async'; return im; };
  const WEB_ART = '/money-trail/art/money-web-link-blue.webp';
  const M = D.meta || {};
  // What the big number on each card is. The list is ordered by it, largest first.
  const ORDER = [
    ['pac', 'Company PAC gifts', c => (c.pac || {}).gave || 0, 'given by its PAC to candidates and committees, 2025-2026'],
    ['lobby', 'Lobbying', c => (c.lobby || {}).total || 0, 'spent on federal lobbying, 2025 to ' + (M.lobby_through || 'now')],
    ['fed', 'Federal money', c => (c.fed || {}).amt || 0, 'in federal contracts, grants and other awards, fiscal ' + (M.fy || '2026')],
    ['emp', 'Gifts from its employees', c => (c.emp || {}).amt || 0, 'given by people who list it as their employer, 2025-2026']
  ];
  let order = 'pac', sector = '', query = '', all = false, built = false;
  function openWeb(name) { graphHub = name; if (!hubs.includes(graphHub)) { hubs.push(graphHub); prepareHubRefresh(); } $('#hub').value = graphHub; graphScale = 1; setView('network'); $('.center-panel').scrollIntoView({ block: 'start', behavior: 'smooth' }); }
  const sides = o => [['to_rep', 'to Republicans'], ['to_dem', 'to Democrats'], ['to_other', 'to committees with no party on the FEC record']]
    .filter(([k]) => o[k] > 0).map(([k, w]) => bigMoney(o[k]) + ' ' + w).join(' · ');
  function card(c, o, max) {
    const v = o[2](c), k = el('div', 'tracker-card bud-row company-card'), top = el('div', 'bud-top');
    top.append(el('b', 'bud-big' + (v > 0 ? '' : ' none'), v > 0 ? bigMoney(v) : 'None found'), el('strong', 'bud-name', c.name));
    k.append(top, el('small', 'bud-small company-what', o[3] + ' · ' + c.sector));
    if (v > 0 && max > 0) { const b = el('span', 'bud-bar'), i = el('i'); i.style.width = Math.max(0.5, Math.min(100, 100 * v / max)).toFixed(1) + '%'; b.append(i); k.append(b); }
    const p = c.pac || {};
    k.append(el('small', 'bud-small', p.gifts ? 'Its PAC gave ' + bigMoney(p.gave) + ' in ' + p.gifts.toLocaleString('en-US') + ' gifts: ' + sides(p) + '.' : 'Its PAC: no gifts in the 2025-2026 FEC files.'));
    const e = c.emp || {};
    if (e.amt) k.append(el('small', 'bud-small', 'People who list it as their employer gave ' + bigMoney(e.amt) + ' (' + e.people.toLocaleString('en-US') + ' people), ' + bigMoney(e.own_pac) + ' of it to the company’s own PAC. Their own gifts, not the company’s.' + (e.largest_is_musk ? ' Most of it is Elon Musk, who lists SpaceX as his employer.' : '')));
    const L = c.lobby;
    k.append(el('small', 'bud-small', L && L.total ? 'Lobbying: ' + bigMoney(L.total) + ' (' + bigMoney(L.in_house) + ' with its own staff, ' + bigMoney(L.outside) + ' to ' + L.firm_count + ' outside firm' + (L.firm_count === 1 ? '' : 's') + '). Top issues: ' + (L.issues || []).slice(0, 3).map(x => x.issue).join(', ') + '.' : 'Lobbying: no LD-2 report with an amount found for 2025-2026.'));
    const F = c.fed;
    const topAg = F ? [...(F.contracts || []), ...(F.grants || [])].sort((a, b) => b.amt - a.amt)[0] : null;
    k.append(el('small', 'bud-small', !(F && F.amt) ? 'Federal money: no USAspending awards found under this company’s name for fiscal ' + (M.fy || '2026') + '.'
      : F.subsidiary_only ? 'Federal money, fiscal ' + F.fy + ': only one part of the company matched on USAspending (' + F.recipient.name + '), ' + bigMoney(F.amt) + '.'
      : 'Federal money, fiscal ' + F.fy + ': ' + bigMoney(F.amt) + (topAg && topAg.amt >= F.amt / 2 ? ', most from ' + topAg.agency : '') + '.'));
    const act = el('div', 'bud-act');
    const t = el('a', 'tracker-web', 'Follow this trail →'); t.prepend(art(CABINET)); t.href = 'follow.html?company=' + c.slug; act.append(t);
    const hub = HUB[c.slug];
    if (hub) { const b = el('button', 'tracker-web', 'See in the Money web'); b.type = 'button'; b.prepend(art(WEB_ART)); b.addEventListener('click', () => openWeb(hub)); act.append(b); }
    if ((p.committees || [])[0]) act.append(ext('Its PAC on FEC.gov ↗', 'https://www.fec.gov/data/committee/' + p.committees[0].id + '/?cycle=2026'));
    k.append(act);
    return k;
  }
  function draw() {
    const o = ORDER.find(x => x[0] === order), list = box.querySelector('.tracker-list'); list.replaceChildren();
    const q = query.trim().toLowerCase();
    const rows = (D.companies || []).filter(c => (!sector || c.sector === sector) && (!q || (c.name + ' ' + c.sector).toLowerCase().includes(q)))
      .sort((a, b) => o[2](b) - o[2](a) || a.name.localeCompare(b.name));
    const max = rows.reduce((m, c) => Math.max(m, o[2](c)), 0);
    rows.slice(0, all || q || sector ? rows.length : 12).forEach(c => list.append(card(c, o, max)));
    if (!rows.length) list.append(el('div', 'empty', 'No company matches. Try fewer letters.'));
    const more = box.querySelector('.tracker-more'); more.hidden = !!q || !!sector || rows.length <= 12; more.textContent = all ? 'Show the 12 largest' : 'Show all ' + rows.length;
    $('#feed-sub').textContent = (D.companies || []).length + ' companies in ' + (M.sectors || []).length + ' sectors';
  }
  function render() {
    if (!built) {
      built = true;
      const area = el('div', 'tracker-area'); box.append(area);
      area.append(el('p', 'state-lead', 'Large companies and their money in politics and government, from public filings: what each company’s PAC gave, what its employees gave on their own, what it spent lobbying Congress and federal agencies, and the federal contracts and grants it got. Each trail page links every figure to its filing. Being listed does not imply wrongdoing.'));
      const pick = el('div', 'company-picks');
      const ol = el('label', 'tracker-search'), os = el('select');
      ORDER.forEach(([k, w]) => { const op = el('option', null, w); op.value = k; os.append(op); });
      os.addEventListener('change', () => { order = os.value; draw(); }); ol.append(el('span', null, 'Order by'), os);
      const sl = el('label', 'tracker-search'), ss = el('select'); const any = el('option', null, 'All sectors'); any.value = ''; ss.append(any);
      (M.sectors || []).forEach(s => { const op = el('option', null, s); op.value = s; ss.append(op); });
      ss.addEventListener('change', () => { sector = ss.value; draw(); }); sl.append(el('span', null, 'Sector'), ss);
      const lab = el('label', 'tracker-search'), inp = el('input'); inp.type = 'search'; inp.autocomplete = 'off'; inp.placeholder = 'Type part of a company name…';
      inp.addEventListener('input', () => { query = inp.value; draw(); }); lab.append(el('span', null, 'Find a company'), inp);
      pick.append(lab, ol, sl);
      const more = el('button', 'bud-more tracker-more'); more.type = 'button'; more.addEventListener('click', () => { all = !all; draw(); });
      const note = el('p', 'bud-note company-note', M.rule_text || '');
      area.append(pick, el('div', 'tracker-list bud-list'), more, note);
    }
    draw();
  }
  const base = setView;
  setView = function (v) {
    base(v);
    box.hidden = v !== 'companies';
    if (v === 'companies') { $('#feed-title').textContent = 'The company tracker'; render(); }
  };
  if (new URLSearchParams(location.search).get('view') === 'companies') setView('companies');
})();
