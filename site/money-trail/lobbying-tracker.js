// D299 (Nov 2026): the Lobbying tracker tab (?view=lobbying), its box in the Evidence inspector, and plain labels for the
// lobbying lines. The tab shows: what was spent on federal lobbying in 2025 and 2026, who paid the most (one card per
// client: its total, the firms it hired, the issues and bills its reports name, the offices lobbied and how many of its
// lobbyists list a past government job), the bills named by the most clients, every issue area, and the lobbying firms
// with the most income. Data: lobbying.js (window.TW_LOBBYING). Loaded after app.js. Text goes in with textContent.
(function () {
  'use strict';
  const L = window.TW_LOBBYING, HUB = window.TW_LOBBY_HUB || {}, BILL = window.TW_LOBBY_BILL;
  if (!L || typeof setView !== 'function' || !BILL) return;
  const M = L.meta, T = M.tot, IN = L.issue_names || {};
  const box = document.getElementById('lobbying-view');
  const el = (tag, cls, text) => { const d = document.createElement(tag); if (cls) d.className = cls; if (text != null) d.textContent = text; return d; };
  const ext = (text, href) => { const a = el('a', 'bud-src lob-src', text + ' ↗'); a.href = href; a.target = '_blank'; a.rel = 'noopener noreferrer'; return a; };
  const art = src => { const im = document.createElement('img'); im.src = src; im.alt = ''; im.width = 22; im.height = 24; im.className = 'tracker-btn-art'; im.decoding = 'async'; return im; };
  const WEB_ART = '/money-trail/art/money-web-link-blue.webp';
  const n = x => Number(x).toLocaleString('en-US');
  const report = u => 'https://lda.gov/filings/public/filing/' + u + '/print/';
  const SEARCH = 'https://lda.gov/filings/public/filing/search/';
  const THRU = M.through === '2026 Q3' ? 'January to September 2026' : M.through;
  const BY_HUB = new Map(L.clients.map(c => [norm(HUB[c.s] || ''), c]).filter(([k]) => k));
  const BY_SLUG = new Map(L.clients.map(c => [c.s, c]));
  const TOP_HUB = 'FEDERAL LOBBYING, 2025-2026 (LOBBYING TRACKER)';
  const COMPANY = new Set(Object.values(window.TW_COMPANY_HUB || {}).map(norm));

  // ---- Plain labels for the lobbying lines.
  const baseKind = kindLabel;
  kindLabel = function (e) {
    const id = String((e && (e.id || e.event_id)) || '');
    if (e && e.record_kind === 'entity') {
      const nm = norm(e.name || '');
      if (nm === norm(TOP_HUB)) return 'All federal lobbying, 2025-2026 (Lobbying tracker)';
      if (BY_HUB.has(nm) && !COMPANY.has(nm)) return 'Lobbying client (Lobbying tracker)';
    }
    if (e && e.record_kind === 'graph' && /^LOB-/.test(id)) {
      if (/-TOTAL$/.test(id)) return 'Lobbying tracker: what it spent on lobbying, a total of quarterly reports (not one payment)';
      if (/-FIRM-\d+$/.test(id)) return 'Lobbying tracker: fees paid to a lobbying firm, a total of quarterly reports (not one payment)';
      if (/-BILL-\d+$/.test(id)) return 'Lobbying tracker: a bill its reports name (no money on this link)';
    }
    return baseKind(e);
  };

  // ---- The money box. Same box on the card and in the inspector.
  function moneyBox(c, cls) {
    const b = el('div', 'lob-box ' + (cls || ''));
    b.append(el('span', 'lob-box-label', 'Spent on lobbying'), el('b', 'lob-box-n', bigMoney(c.a[0] + c.a[1])),
      el('small', 'lob-box-note', '2025: ' + bigMoney(c.a[0]) + ' · ' + THRU + ': ' + bigMoney(c.a[1])));
    return b;
  }
  function about(c) {
    const b = el('div', 'mt-about lob-about');
    b.append(el('div', 'mt-evcard-head', 'Federal lobbying'), moneyBox(c));
    b.append(el('p', 'mt-about-src', (c.self ? 'Lobbies with its own staff and files its own reports' : 'Hires outside lobbying firms') + '. ' + n(c.r) + ' quarterly reports, ' + n(c.lb) + ' lobbyists named.'));
    const a = el('a', 'detail-link mt-about-site', 'Open it on the Lobbying tracker, with every source →'); a.href = '?view=lobbying#lobby-' + c.s;
    a.addEventListener('click', ev => { ev.preventDefault(); openCard(c.s); });
    b.append(a);
    return b;
  }
  function aboutAll() {
    const b = el('div', 'mt-about lob-about');
    b.append(el('div', 'mt-evcard-head', 'All federal lobbying'));
    const x = el('div', 'lob-box'); x.append(el('span', 'lob-box-label', 'Reported, 2025'), el('b', 'lob-box-n', bigMoney(T.t25)), el('small', 'lob-box-note', THRU + ': ' + bigMoney(T.t26))); b.append(x);
    b.append(el('p', 'mt-about-src', 'The lines into this dot are the ' + M.web + ' clients that spent the most. ' + n(T.clients) + ' clients reported spending in all.'));
    const a = el('a', 'detail-link mt-about-site', 'Open the Lobbying tracker →'); a.href = '?view=lobbying';
    a.addEventListener('click', ev => { ev.preventDefault(); setView('lobbying'); });
    b.append(a);
    return b;
  }
  const baseDetails = details;
  details = function (e) {
    baseDetails(e);
    if (!e || e.record_kind !== 'entity') return;
    const nm = norm(e.name || ''), c = BY_HUB.get(nm);
    if (!c && nm !== norm(TOP_HUB)) return;
    const head = document.querySelector('#detail-content .event-kind');
    if (head) head.after(c ? about(c) : aboutAll());
  };

  // ---- The lobbying dot and the most-lobbied bills are in the center list of the web.
  let added = false;
  (RESEARCH.meta.lobby_hubs || []).forEach(h => { if (!hubs.includes(h)) { hubs.push(h); added = true; } });
  if (added && typeof prepareHubRefresh === 'function') prepareHubRefresh();
  const fn = document.getElementById('fec-note');
  if (fn) fn.textContent += ' Lobbying tracker: every quarterly lobbying report for 2025 to ' + THRU + ', checked ' + M.built + '. Lobbying totals are added from quarterly reports and drawn as dashed lines.';
  if (!box) return;

  // ---- The tab.
  function openWeb(name) { graphHub = name; if (!hubs.includes(graphHub)) { hubs.push(graphHub); prepareHubRefresh(); } $('#hub').value = graphHub; graphScale = 1; setView('network'); $('.center-panel').scrollIntoView({ block: 'start', behavior: 'smooth' }); }
  function inspect(c) { pick({ record_kind: 'entity', name: HUB[c.s] || c.n, entity_type: c.co ? 'company' : 'Lobbying client (Lobbying tracker)', id: c.s, jurisdiction: c.st || 'US', source_url: c.l ? report(c.l) : SEARCH, notes: c.n }); }
  function section(title, id) { const s = el('section', 'lob-sec'); if (id) s.id = id; s.append(el('h4', 'lob-h', title)); return s; }
  function billLink(id, extra) {
    const B = BILL(id); if (!B) return null;
    const a = ext(B.label + (extra || ''), B.url); a.classList.add('lob-bill'); if (B.name) a.title = B.name; return a;
  }
  // Offices are written in capitals in the reports ("COMMERCE - DEPT OF (DOC)"). Shown in plain case, short forms kept.
  const SMALL = new Set(['of', 'and', 'the', 'for', 'on', 'to', 'in']);
  const office = g => String(g).split(' ').map((w, i) => /^\(.*\)$|\./.test(w) || /^[A-Z]{2,4}$/.test(w) && !/^(DEPT|THE|AND|FOR|OF|HOUSE|OFFICE|ARMY|NAVY|AIR)$/.test(w) && w.length <= 3 ? w.toUpperCase()
    : (i && SMALL.has(w.toLowerCase())) ? w.toLowerCase() : w.charAt(0) + w.slice(1).toLowerCase()).join(' ');
  function card(c) {
    const k = el('article', 'tracker-card bud-row lob-card'); k.id = 'lobby-' + c.s;
    const top = el('div', 'lob-top'), head = el('div', 'lob-head');
    head.append(el('span', 'lob-kind' + (c.self ? ' self' : ''), c.self ? 'Lobbies with its own staff' : 'Hires outside firms'), el('h3', 'lob-name', c.n));
    top.append(head, moneyBox(c)); k.append(top);
    const ul = el('ul', 'lob-list');
    // outside firms
    if (c.fc) {
      const li = el('li'); li.append(el('b', null, c.fc === 1 ? 'Outside firm: ' : 'Outside firms (' + c.fc + '): '));
      li.append(document.createTextNode(c.f.slice(0, 5).map(f => f[0] + ' ' + (f[1] > 0 ? bigMoney(f[1]) : 'under $5,000 a quarter') + (f[3] ? ' (hired through another firm)' : '')).join(' · ') + (c.fc > 5 ? ' · and ' + (c.fc - 5) + ' more' : '') + '.'));
      if (c.self) li.append(el('small', 'lob-dim', ' Already part of its own total, so not added again.'));
      ul.append(li);
    }
    if (c.i.length) { const li = el('li'); li.append(el('b', null, 'Issues its reports list most: ')); li.append(document.createTextNode(c.i.map(([k]) => IN[k] || k).join(' · ') + '.')); ul.append(li); }
    if (c.b.length) {
      const li = el('li'); li.append(el('b', null, 'Bills its reports name most: '));
      c.b.forEach(([b, x], i) => { const a = billLink(b); if (!a) return; if (i) li.append(document.createTextNode(' ')); li.append(a); });
      li.append(el('small', 'lob-dim', ' Numbers as written in the reports.'));
      ul.append(li);
    }
    if (c.g.length) { const li = el('li'); li.append(el('b', null, 'Offices lobbied most: ')); li.append(document.createTextNode(c.g.slice(0, 5).map(([g]) => office(g)).join(' · ') + '.')); ul.append(li); }
    {
      const li = el('li'); li.append(el('b', null, 'Lobbyists: '));
      li.append(document.createTextNode(n(c.lb) + ' named' + (c.fo ? ', and ' + n(c.fo) + ' of them list a past government job' : '') + '.'));
      if (c.fx.length) li.append(el('small', 'lob-dim lob-former', ' For example: ' + c.fx.slice(0, 3).map(([p, j]) => p + ' (' + j.replace(/\s+/g, ' ').slice(0, 140) + (j.length > 140 ? '…' : '') + ')').join('; ') + '.'));
      ul.append(li);
    }
    { const li = el('li'); if (c.l) li.append(ext('Its largest report (' + c.lw + ', ' + bigMoney(c.la) + ') on LDA.gov', report(c.l))); else li.append(ext('Search its reports on LDA.gov', SEARCH)); ul.append(li); }
    k.append(ul);
    const act = el('div', 'bud-act');
    if (HUB[c.s]) { const b = el('button', 'tracker-web', 'See in the Money web'); b.type = 'button'; b.prepend(art(WEB_ART)); b.addEventListener('click', () => openWeb(HUB[c.s])); act.append(b); }
    const ins = el('button', 'tracker-inspect', 'Inspect'); ins.type = 'button'; ins.prepend(art(CABINET)); ins.addEventListener('click', () => inspect(c)); act.append(ins);
    if (c.co) { const t = el('a', 'tracker-web', 'Company tracker →'); t.href = 'follow.html?company=' + c.co; t.prepend(art(CABINET)); act.append(t); }
    k.append(act);
    return k;
  }
  function row(r) {
    const d = el('div', 'tracker-card lob-row');
    d.append(el('b', 'lob-row-n', bigMoney(r[1] + r[2])), el('strong', 'lob-row-name', r[0]),
      el('small', 'bud-small', '2025: ' + bigMoney(r[1]) + ' · ' + THRU + ': ' + bigMoney(r[2]) + ' · ' + (r[5] ? 'files its own reports' : r[3] + ' outside firm' + (r[3] === 1 ? '' : 's')) + (r[4] ? ' · most listed issue: ' + (IN[r[4]] || r[4]) : '')));
    return d;
  }
  let query = '', order = 'all', shown = 30, built = false;
  const val = c => order === '2025' ? c.a[0] : order === '2026' ? c.a[1] : c.a[0] + c.a[1];
  const rval = r => order === '2025' ? r[1] : order === '2026' ? r[2] : r[1] + r[2];
  function draw() {
    const list = box.querySelector('.lob-cards'); list.replaceChildren();
    const qq = query.trim().toLowerCase();
    const cards = L.clients.filter(c => !qq || c.n.toLowerCase().includes(qq)).sort((a, b) => val(b) - val(a));
    const rows = qq ? L.more.filter(r => r[0].toLowerCase().includes(qq)).sort((a, b) => rval(b) - rval(a)) : [];
    cards.slice(0, qq ? 60 : shown).forEach(c => list.append(card(c)));
    if (rows.length) { list.append(el('p', 'bud-small lob-dim', 'Smaller clients (totals only):')); rows.slice(0, 40).forEach(r => list.append(row(r))); }
    if (!cards.length && !rows.length) list.append(el('div', 'empty', 'Nothing matches in the ' + n(L.clients.length + L.more.length) + ' clients that spent the most. Try fewer letters, or search every report on LDA.gov.'));
    const more = box.querySelector('.lob-more');
    more.hidden = !!qq || shown >= cards.length;
    $('#feed-sub').textContent = qq ? (cards.length + rows.length) + ' clients match' : 'Top ' + Math.min(shown, cards.length) + ' of ' + n(T.clients) + ' clients';
  }
  function stat(label, big, note, cls) { const s = el('div', 'lob-stat ' + (cls || '')); s.append(el('span', 'lob-box-label', label), el('b', 'lob-stat-n', big)); if (note) s.append(el('small', 'lob-box-note', note)); return s; }
  function render() {
    if (built) { draw(); return; }
    built = true;
    const area = el('div', 'tracker-area'); box.append(area);
    area.append(el('p', 'state-lead', 'Who pays to lobby Congress and federal agencies, how much, and on which bills, from every quarterly lobbying report filed for 2025 and 2026. Every group that lobbies must file these reports under the Lobbying Disclosure Act. Same rules for every client, every party and every issue. Each card links to the report itself.'));
    const rule = el('div', 'lob-rule'); rule.append(el('strong', null, 'How the money is counted: '), document.createTextNode(M.rule)); area.append(rule);
    const stats = el('div', 'lob-stats');
    stats.append(stat('Spent on lobbying, 2025', bigMoney(T.t25), 'Every quarterly report for 2025, counted once.'),
      stat('Spent, ' + THRU, bigMoney(T.t26), 'Reports for the last quarter of 2026 are due in January 2027.'),
      stat('Clients who reported spending', n(T.clients), 'Companies, trade groups, unions, nonprofits, cities, tribes and others.'),
      stat('Lobbying firms', n(T.firms), 'Firms and groups that filed reports for a client.'),
      stat('Lobbyists named', n(T.lobbyists), n(T.former) + ' of them list a past job in Congress or a federal agency.', 'lob-stat-people'));
    area.append(stats);

    const cs = section('Who paid the most');
    cs.append(el('p', 'bud-small', 'The ' + L.clients.length + ' clients that spent the most have a full card; the next ' + n(L.more.length) + ' show their totals when you search. A company\'s dues to a trade group can count in both, because the law has the trade group report the part of dues it uses for lobbying.'));
    const tools = el('div', 'lob-tools');
    const lab = el('label', 'tracker-search'), inp = el('input'); inp.type = 'search'; inp.autocomplete = 'off'; inp.placeholder = 'Type a company, group or union…';
    inp.addEventListener('input', () => { query = inp.value; draw(); }); lab.append(el('span', null, 'Find one'), inp);
    const chips = el('div', 'lob-chips'); chips.setAttribute('role', 'group'); chips.setAttribute('aria-label', 'Which years');
    [['all', '2025 and 2026'], ['2025', '2025'], ['2026', THRU]].forEach(([v, t]) => {
      const c = el('button', 'lob-chip' + (v === order ? ' on' : ''), t); c.type = 'button'; c.setAttribute('aria-pressed', v === order ? 'true' : 'false');
      c.addEventListener('click', () => { order = v; chips.querySelectorAll('.lob-chip').forEach(x => { const on = x === c; x.classList.toggle('on', on); x.setAttribute('aria-pressed', on ? 'true' : 'false'); }); draw(); });
      chips.append(c);
    });
    tools.append(lab, chips);
    const more = el('button', 'lob-more tracker-web', 'Show 30 more'); more.type = 'button'; more.addEventListener('click', () => { shown += 30; draw(); });
    cs.append(tools, el('div', 'lob-cards bud-list'), more);
    area.append(cs);

    const bs = section('Bills named by the most clients', 'lobby-bills');
    bs.append(el('p', 'bud-small', 'How many different clients named each bill number in their reports, ' + '2025 to ' + THRU + '. Spending bills and the defense bill top the list every year because almost every group asks for something in them. A report names a bill; it does not say how much was spent on it.'));
    const bl = el('ol', 'lob-bills');
    L.bills.slice(0, 40).forEach(b => {
      const li = el('li', 'lob-bill-row'), B = BILL(b.id);
      const h = el('div', 'lob-bill-head'); h.append(billLink(b.id) || el('b', null, b.id), el('span', 'lob-bill-name', ' ' + (B && B.name || '')));
      li.append(h, el('small', 'bud-small', n(b.c) + ' clients in ' + n(b.r) + ' reports' + (b.law ? ' · became ' + b.law : '') + (b.sponsor ? ' · sponsor: ' + b.sponsor : '') + '.'),
        el('small', 'bud-small lob-dim', 'Clients that spent the most and named it: ' + b.top.slice(0, 6).join(' · ') + '.'));
      if (B && B.hub && hubs.includes(B.hub)) { const w = el('button', 'lob-link-btn', 'See in the Money web'); w.type = 'button'; w.addEventListener('click', () => openWeb(B.hub)); li.append(w); }
      bl.append(li);
    });
    bs.append(bl); area.append(bs);

    const is = section('Every issue area');
    is.append(el('p', 'bud-small', 'Each report lists one or more of 79 issue areas. The number is how many clients listed it at least once.'));
    const ig = el('div', 'lob-issues');
    const maxI = L.issues.length ? L.issues[0][1] : 1;
    L.issues.forEach(([k, c, r]) => { const d = el('div', 'lob-issue'); const bar = el('span', 'bud-bar'), i = el('i'); i.style.width = Math.max(1, 100 * c / maxI).toFixed(1) + '%'; bar.append(i); d.append(el('strong', null, IN[k] || k), el('small', 'bud-small', n(c) + ' clients · ' + n(r) + ' reports'), bar); ig.append(d); });
    is.append(ig); area.append(is);

    const fs = section('Lobbying firms with the most income');
    fs.append(el('p', 'bud-small', 'Fees each firm reported from all its clients, 2025 to ' + THRU + ', added together.'));
    const fl = el('div', 'lob-firms');
    L.firms.slice(0, 30).forEach(f => {
      const d = el('div', 'tracker-card lob-firm');
      d.append(el('b', 'lob-row-n', bigMoney(f.amt)), el('strong', 'lob-row-name', f.n),
        el('small', 'bud-small', n(f.c) + ' clients · ' + n(f.lb) + ' lobbyists' + (f.fo ? ', ' + n(f.fo) + ' with a past government job' : '') + '.'),
        el('small', 'bud-small lob-dim', 'Biggest clients: ' + f.top.slice(0, 4).map(([nm, a]) => nm + ' ' + bigMoney(a)).join(' · ') + '.'));
      if (f.l) { const s = el('small', 'bud-small'); s.append(ext('Its largest report on LDA.gov', report(f.l))); d.append(s); }
      fl.append(d);
    });
    fs.append(fl); area.append(fs);

    if (M.held.length) {
      const h = M.held[0];
      const p = el('p', 'bud-small lob-held');
      p.append(el('b', null, 'Reports not added: '), document.createTextNode(h.firm + ' reported ' + bigMoney(h.amt) + ' a quarter from one client, ' + h.client + ', in ' + M.held.length + ' quarterly reports (' + bigMoney(M.held_total) + ' in all). That is more than any group reports spending on its own lobbying' + (M.held_firm_clients === 1 ? ', from a firm with no other client' : '') + ', so it is left out of every total here. The reports are as filed on LDA.gov.'));
      area.append(p);
    }
    const lim = section('Limits');
    ['Reports give good faith estimates, rounded to the nearest $10,000. A quarter under $5,000 shows no amount.',
      'Clients are matched by name. "The Boeing Company" and "Boeing Company" are one client, but a parent company and its parts that file under different names (for example Amazon.com Services and Amazon Web Services) stay separate.',
      'A lobbyist must list a past government job held in the last 20 years only the first time the firm lists that person for a client, so a lobbyist first listed before 2025 may not show one here.',
      'Bill numbers are read from the report text, which rarely says which Congress. Bill numbers are given out in order, so a number that had not yet been reached when the report was due is taken to mean the 118th Congress bill (2023-2024) and is labeled that way; any other number is taken to mean the 119th Congress bill (2025-2026). A report can still mean an older bill with a low number.',
      'Lobbying is legal and is protected by the First Amendment right to petition the government. A report shows who paid to be heard, not how anyone voted or why.'].forEach(t => lim.append(el('p', 'bud-small', t)));
    area.append(lim);
    const src = el('p', 'bud-note'); src.append(document.createTextNode('Checked ' + M.built + '. Sources: '));
    M.sources.forEach(([t, u], i) => { if (i) src.append(document.createTextNode(' · ')); src.append(ext(t, u)); });
    area.append(src);
    draw();
  }
  function openCard(slug) {
    setView('lobbying');
    let c = document.getElementById('lobby-' + slug);
    if (!c) { const i = L.clients.findIndex(x => x.s === slug); if (i >= 0) { shown = Math.max(shown, i + 1); draw(); c = document.getElementById('lobby-' + slug); } }
    if (c) { c.classList.add('on'); c.scrollIntoView({ block: 'start', behavior: 'smooth' }); setTimeout(() => c.classList.remove('on'), 2400); }
  }
  const base = setView;
  setView = function (v) {
    base(v);
    box.hidden = v !== 'lobbying';
    if (v === 'lobbying') { $('#feed-title').textContent = 'The lobbying tracker'; render(); }
  };
  const q = new URLSearchParams(location.search);
  if (q.get('view') === 'lobbying') {
    setView('lobbying');
    const m = /^#lobby-([a-z0-9-]+)$/.exec(location.hash);
    if (m && BY_SLUG.has(m[1])) openCard(m[1]);
    else if (location.hash === '#lobby-bills') { const b = document.getElementById('lobby-bills'); if (b) b.scrollIntoView({ block: 'start' }); }
  }
})();
