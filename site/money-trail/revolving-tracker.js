// D300 (Nov 2026): the Revolving door tracker tab (?view=revolving), its box in the Evidence inspector, and plain labels
// for its lines. The tab shows lobbyists who list a past job in Congress or the federal government, from every 2025-2026
// lobbying report and registration: former members of Congress who lobby (checked against the official list of members),
// a search of the lobbyists on the most clients, the firms and clients with the most of them, and where they used to work.
// Data: revolving.js (window.TW_REVOLVING). Loaded after app.js. Text goes in with textContent. Uses the lob- styles.
(function () {
  'use strict';
  const R = window.TW_REVOLVING, HUB = window.TW_REVOLVING_HUB || {};
  if (!R || typeof setView !== 'function') return;
  const M = R.meta, T = M.tot;
  const box = document.getElementById('revolving-view');
  const el = (tag, cls, text) => { const d = document.createElement(tag); if (cls) d.className = cls; if (text != null) d.textContent = text; return d; };
  const ext = (text, href) => { const a = el('a', 'bud-src lob-src', text + ' ↗'); a.href = href; a.target = '_blank'; a.rel = 'noopener noreferrer'; return a; };
  const art = src => { const im = document.createElement('img'); im.src = src; im.alt = ''; im.width = 22; im.height = 24; im.className = 'tracker-btn-art'; im.decoding = 'async'; return im; };
  const WEB_ART = '/money-trail/art/money-web-link-blue.webp';
  const n = x => Number(x).toLocaleString('en-US');
  const PARTY = { R: 'Republican', D: 'Democrat', I: 'Independent' };
  const STATE = { AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', FL: 'Florida', GA: 'Georgia',
    HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts',
    MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico',
    NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina',
    SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont', VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
    PR: 'Puerto Rico', DC: 'District of Columbia', GU: 'Guam', VI: 'U.S. Virgin Islands', AS: 'American Samoa', MP: 'Northern Mariana Islands' };
  const BIO = 'https://bioguide.congress.gov/search/bio/';
  const SEARCH = 'https://lda.gov/filings/public/filing/search/';
  const BY_HUB = new Map(R.members.map(m => [norm(HUB[m.bio] || ''), m]).filter(([k]) => k));
  const BY_BIO = new Map(R.members.map(m => [m.bio, m]));
  const TOP_HUB = 'FORMER MEMBERS OF CONGRESS WHO LOBBY (REVOLVING DOOR TRACKER)';
  const end = t => String(t).replace(/[.\s]+$/, '') + '.';
  const served = m => m.ch + ', ' + m.y0 + ' to ' + m.y1;
  const who = m => (PARTY[m.p] || m.p) + ', ' + (STATE[m.st] || m.st);

  // ---- Plain labels for the revolving door lines and dots.
  const baseKind = kindLabel;
  kindLabel = function (e) {
    const id = String((e && (e.id || e.event_id)) || '');
    if (e && e.record_kind === 'entity') {
      const nm = norm(e.name || '');
      if (nm === norm(TOP_HUB)) return 'Former members of Congress who lobby (Revolving door tracker)';
      if (BY_HUB.has(nm)) return 'Former member of Congress who lobbies (Revolving door tracker)';
    }
    if (e && e.record_kind === 'graph' && /^REV-/.test(id)) {
      if (/-HUB$/.test(id)) return 'Revolving door tracker: a former member of Congress listed as a lobbyist (no money on this link)';
      if (/-FIRM-\d+$/.test(id)) return 'Revolving door tracker: a firm that lists this former member as a lobbyist (no money on this link)';
    }
    return baseKind(e);
  };
  function about(m) {
    const b = el('div', 'mt-about lob-about');
    b.append(el('div', 'mt-evcard-head', 'Former member of Congress, now a lobbyist'));
    const x = el('div', 'lob-box'); x.append(el('span', 'lob-box-label', 'Served'), el('b', 'lob-box-n', m.y0 + ' to ' + m.y1), el('small', 'lob-box-note', m.ch + ' · ' + who(m))); b.append(x);
    b.append(el('p', 'mt-about-src', 'Listed as a lobbyist for ' + n(m.cn) + ' client' + (m.cn === 1 ? '' : 's') + ' in 2025-2026 reports. Job as filed: "' + m.cp + '"'));
    const a = el('a', 'detail-link mt-about-site', 'Open it on the Revolving door tracker →'); a.href = '?view=revolving#rev-' + m.bio;
    a.addEventListener('click', ev => { ev.preventDefault(); openCard(m.bio); });
    b.append(a);
    return b;
  }
  const baseDetails = details;
  details = function (e) {
    baseDetails(e);
    if (!e || e.record_kind !== 'entity') return;
    const m = BY_HUB.get(norm(e.name || ''));
    if (!m) return;
    const head = document.querySelector('#detail-content .event-kind');
    if (head) head.after(about(m));
  };
  let added = false;
  (RESEARCH.meta.revolving_hubs || []).forEach(h => { if (!hubs.includes(h)) { hubs.push(h); added = true; } });
  if (added && typeof prepareHubRefresh === 'function') prepareHubRefresh();
  if (!box) return;

  // ---- The tab.
  function openWeb(name) { graphHub = name; if (!hubs.includes(graphHub)) { hubs.push(graphHub); prepareHubRefresh(); } $('#hub').value = graphHub; graphScale = 1; setView('network'); $('.center-panel').scrollIntoView({ block: 'start', behavior: 'smooth' }); }
  function inspect(m) { pick({ record_kind: 'entity', name: HUB[m.bio] || m.n, entity_type: 'Former member of Congress who lobbies (Revolving door tracker)', id: m.bio, jurisdiction: m.st, source_url: BIO + m.bio, notes: m.cp }); }
  function section(title, id) { const s = el('section', 'lob-sec'); if (id) s.id = id; s.append(el('h4', 'lob-h', title)); return s; }
  function line(label, text) { const li = el('li'); li.append(el('b', null, label), document.createTextNode(text)); return li; }
  function card(m) {
    const k = el('article', 'tracker-card bud-row lob-card'); k.id = 'rev-' + m.bio;
    const top = el('div', 'lob-top'), head = el('div', 'lob-head');
    head.append(el('span', 'lob-kind', 'Former ' + (m.ch === 'Senate' ? 'senator' : m.ch === 'House' ? 'representative' : 'representative and senator')), el('h3', 'lob-name', m.n));
    const x = el('div', 'lob-box'); x.append(el('span', 'lob-box-label', 'Lobbyist for'), el('b', 'lob-box-n', n(m.cn) + ' client' + (m.cn === 1 ? '' : 's')), el('small', 'lob-box-note', 'in 2025-2026 reports'));
    top.append(head, x); k.append(top);
    const ul = el('ul', 'lob-list');
    ul.append(line('Served: ', served(m) + ' · ' + who(m) + '.'));
    ul.append(line('Past job as filed: ', '"' + m.cp + '"' + (m.as.length > 1 || m.as[0] !== m.n ? ' (filed as ' + m.as.join(', ') + ')' : '') + '.'));
    if (m.f.length) ul.append(line(m.f.length === 1 ? 'Firm: ' : 'Firms: ', end(m.f.join(' · '))));
    if (m.c.length) ul.append(line('Clients on the most reports: ', end(m.c.join(' · ') + (m.cn > m.c.length ? ' · and ' + (m.cn - m.c.length) + ' more' : ''))));
    { const li = el('li'); li.append(ext('Official biography (Congress)', BIO + m.bio), document.createTextNode(' · '), ext('Search the reports on LDA.gov', SEARCH)); ul.append(li); }
    k.append(ul);
    const act = el('div', 'bud-act');
    if (HUB[m.bio]) { const b = el('button', 'tracker-web', 'See in the Money web'); b.type = 'button'; b.prepend(art(WEB_ART)); b.addEventListener('click', () => openWeb(HUB[m.bio])); act.append(b); }
    const ins = el('button', 'tracker-inspect', 'Inspect'); ins.type = 'button'; ins.prepend(art(CABINET)); ins.addEventListener('click', () => inspect(m)); act.append(ins);
    k.append(act);
    return k;
  }
  function person(p) {
    const d = el('div', 'tracker-card lob-row');
    const m = p[6] && BY_BIO.get(p[6]);
    d.append(el('strong', 'lob-row-name', p[0] + (m ? ' (former member of Congress)' : '')), el('small', 'bud-small', '"' + p[1] + '"'),
      el('small', 'bud-small lob-dim', end('Lobbyist for ' + n(p[4]) + ' client' + (p[4] === 1 ? '' : 's') + (p[2].length ? ' · ' + p[2].join(' · ') : '') + (p[3].length ? ' · clients include ' + p[3].join(', ') : ''))));
    return d;
  }
  let mq = '', pq = '', mparty = 'all', shown = 30, built = false;
  function drawMembers() {
    const list = box.querySelector('.rev-members'); list.replaceChildren();
    const q = mq.trim().toLowerCase();
    const ms = R.members.filter(m => (mparty === 'all' || m.p === mparty) && (!q || (m.n + ' ' + m.as.join(' ') + ' ' + m.f.join(' ') + ' ' + m.c.join(' ') + ' ' + (STATE[m.st] || '')).toLowerCase().includes(q)));
    ms.slice(0, q ? 80 : shown).forEach(m => list.append(card(m)));
    if (!ms.length) list.append(el('div', 'empty', 'No former member matches. Try fewer letters.'));
    box.querySelector('.rev-more').hidden = !!q || shown >= ms.length;
    $('#feed-sub').textContent = n(T.members) + ' former members of Congress · ' + n(T.former) + ' lobbyists with a past government job';
  }
  function drawPeople() {
    const list = box.querySelector('.rev-people'); list.replaceChildren();
    const q = pq.trim().toLowerCase();
    if (!q) { list.append(el('p', 'bud-small lob-dim', 'Type at least 2 letters: a name, a past office, a committee, a firm or a client.')); return; }
    if (q.length < 2) return;
    const ps = R.people.filter(p => (p[0] + ' ' + p[1] + ' ' + p[2].join(' ') + ' ' + p[3].join(' ')).toLowerCase().includes(q));
    ps.slice(0, 40).forEach(p => list.append(person(p)));
    list.prepend(el('p', 'bud-small lob-dim', ps.length ? n(ps.length) + ' match' + (ps.length === 1 ? '' : 'es') + (ps.length > 40 ? ', the 40 on the most clients shown' : '') + '.' : 'Nothing matches. Only the ' + n(R.people.length) + ' lobbyists on the most clients are here; LDA.gov can search every report.'));
  }
  function stat(label, big, note, cls) { const s = el('div', 'lob-stat ' + (cls || '')); s.append(el('span', 'lob-box-label', label), el('b', 'lob-stat-n', big)); if (note) s.append(el('small', 'lob-box-note', note)); return s; }
  function bars(rows, unit) {
    const g = el('div', 'lob-issues'); const max = rows.length ? rows[0][1] : 1;
    rows.forEach(([k, c]) => { const d = el('div', 'lob-issue'); const bar = el('span', 'bud-bar'), i = el('i'); i.style.width = Math.max(1, 100 * c / max).toFixed(1) + '%'; bar.append(i); d.append(el('strong', null, k), el('small', 'bud-small', n(c) + ' ' + unit), bar); g.append(d); });
    return g;
  }
  function render() {
    if (built) { drawMembers(); return; }
    built = true;
    const area = el('div', 'tracker-area'); box.append(area);
    area.append(el('p', 'state-lead', 'Lobbyists who used to work in Congress or the federal government, and who hired them, from every lobbying report and registration filed for 2025 and 2026. The law asks each lobbyist to list any such job held in the last 20 years. Same rules for every party.'));
    const rule = el('div', 'lob-rule'); rule.append(el('strong', null, 'How this is counted: '), document.createTextNode(M.rule)); area.append(rule);
    const stats = el('div', 'lob-stats');
    stats.append(stat('Lobbyists named', n(T.lobbyists), 'In 2025-2026 lobbying reports and registrations.', 'lob-stat-people'),
      stat('List a past government job', n(T.former), 'About ' + Math.round(100 * T.former / T.lobbyists) + ' in 100 of the lobbyists named.'),
      stat('Former members of Congress', n(T.members), Object.entries(M.party).sort((a, b) => b[1] - a[1]).map(([p, c]) => n(c) + ' ' + (PARTY[p] || p) + (c === 1 ? '' : 's')).join(', ') + '. Checked against the official list of members.', 'lob-stat-people'),
      stat('Registrations read', n(T.regs), 'New lobbying registrations (LD-1), where most past jobs are first listed.'));
    area.append(stats);

    const ms = section('Former members of Congress who lobby', 'rev-members');
    ms.append(el('p', 'bud-small', 'Each former member listed as a lobbyist in a 2025-2026 report or registration, on the most clients first. Former House members may not lobby Congress for one year after leaving, and former senators for two years; they may lobby federal agencies sooner (18 U.S.C. 207).'));
    const tools = el('div', 'lob-tools');
    const lab = el('label', 'tracker-search'), inp = el('input'); inp.type = 'search'; inp.autocomplete = 'off'; inp.placeholder = 'Name, state, firm or client…';
    inp.addEventListener('input', () => { mq = inp.value; drawMembers(); }); lab.append(el('span', null, 'Find one'), inp);
    const chips = el('div', 'lob-chips'); chips.setAttribute('role', 'group'); chips.setAttribute('aria-label', 'Which party');
    [['all', 'Every party']].concat(Object.keys(M.party).sort().map(p => [p, PARTY[p] || p])).forEach(([v, t]) => {
      const c = el('button', 'lob-chip' + (v === mparty ? ' on' : ''), t); c.type = 'button'; c.setAttribute('aria-pressed', v === mparty ? 'true' : 'false');
      c.addEventListener('click', () => { mparty = v; chips.querySelectorAll('.lob-chip').forEach(x => { const on = x === c; x.classList.toggle('on', on); x.setAttribute('aria-pressed', on ? 'true' : 'false'); }); drawMembers(); });
      chips.append(c);
    });
    tools.append(lab, chips);
    const more = el('button', 'rev-more lob-more tracker-web', 'Show 30 more'); more.type = 'button'; more.addEventListener('click', () => { shown += 30; drawMembers(); });
    ms.append(tools, el('div', 'rev-members lob-cards bud-list'), more);
    area.append(ms);

    const ps = section('Find any lobbyist with a past government job', 'rev-people');
    ps.append(el('p', 'bud-small', 'The ' + n(R.people.length) + ' lobbyists with a past government job who are on the most clients. The job is quoted as filed.'));
    const pt = el('div', 'lob-tools'), pl = el('label', 'tracker-search'), pi = el('input'); pi.type = 'search'; pi.autocomplete = 'off'; pi.placeholder = 'Try Ways and Means, Treasury or a name…';
    pi.addEventListener('input', () => { pq = pi.value; drawPeople(); }); pl.append(el('span', null, 'Search'), pi); pt.append(pl);
    ps.append(pt, el('div', 'rev-people lob-cards'));
    area.append(ps);

    const fs = section('Firms with the most lobbyists who had a government job');
    fs.append(el('p', 'bud-small', 'Lobbyists each firm listed in its 2025-2026 reports who give a past government job, and the firm\'s reported lobbying income.'));
    const fl = el('div', 'lob-firms');
    R.firms.forEach(([nm, fo, lb, amt]) => { const d = el('div', 'tracker-card lob-firm'); d.append(el('b', 'lob-row-n', n(fo) + ' of ' + n(lb)), el('strong', 'lob-row-name', nm), el('small', 'bud-small', 'lobbyists list a past government job · income ' + bigMoney(amt) + ', 2025-2026.')); fl.append(d); });
    fs.append(fl); area.append(fs);
    const cs = section('Clients with the most lobbyists who had a government job');
    cs.append(el('p', 'bud-small', 'Counting every lobbyist listed for the client, its own staff and outside firms.'));
    const cl = el('div', 'lob-firms');
    R.clients.forEach(([nm, fo, lb, amt]) => { const d = el('div', 'tracker-card lob-firm'); d.append(el('b', 'lob-row-n', n(fo) + ' of ' + n(lb)), el('strong', 'lob-row-name', nm), el('small', 'bud-small', 'lobbyists list a past government job · spent ' + bigMoney(amt) + ' on lobbying, 2025-2026.')); cl.append(d); });
    cs.append(cl); area.append(cs);

    const ws = section('Where they used to work');
    ws.append(el('p', 'bud-small', 'How many lobbyists name each committee or agency in their past jobs. One person can name several. Most past jobs are in a member\'s own office and name no committee, so these counts are the ones that can be read from the text.'));
    ws.append(el('h5', 'lob-h', 'Committees of Congress'), bars(M.comm, 'lobbyists'), (h => { h.style.marginTop = '16px'; return h; })(el('h5', 'lob-h', 'Agencies and the White House')), bars(M.exec, 'lobbyists'));
    area.append(ws);

    const lim = section('Limits');
    ['A lobbyist lists a past government job only the first time a firm lists that person for a client, and only jobs from the last 20 years. Someone who has lobbied for the same client since before 2025, or who left government more than 20 years ago, may not show one.',
      'People are matched by name as filed. Two people with the same name are counted once, and one person filed under two spellings is counted twice.',
      'Former members of Congress are matched to the official list by name. A misspelled name is not matched, so the list can miss someone. A staff job in a member\'s office is not counted as being a member.',
      'Committee and agency counts read the job text with fixed word lists, so a job written in an unusual way can be missed.',
      'Working in government and then lobbying is legal, within the waiting periods in 18 U.S.C. 207. Being listed here does not mean anyone broke a rule.'].forEach(t => lim.append(el('p', 'bud-small', t)));
    area.append(lim);
    const src = el('p', 'bud-note'); src.append(document.createTextNode('Checked ' + M.built + '. Sources: '));
    M.sources.forEach(([t, u], i) => { if (i) src.append(document.createTextNode(' · ')); src.append(ext(t, u)); });
    area.append(src);
    drawMembers(); drawPeople();
  }
  function openCard(bio) {
    setView('revolving');
    let c = document.getElementById('rev-' + bio);
    if (!c) { const i = R.members.findIndex(x => x.bio === bio); if (i >= 0) { shown = Math.max(shown, i + 1); drawMembers(); c = document.getElementById('rev-' + bio); } }
    if (c) { c.classList.add('on'); c.scrollIntoView({ block: 'start', behavior: 'smooth' }); setTimeout(() => c.classList.remove('on'), 2400); }
  }
  const base = setView;
  setView = function (v) {
    base(v);
    box.hidden = v !== 'revolving';
    if (v === 'revolving') { $('#feed-title').textContent = 'The revolving door tracker'; render(); }
  };
  const q = new URLSearchParams(location.search);
  if (q.get('view') === 'revolving') {
    setView('revolving');
    const m = /^#rev-([A-Z0-9]+)$/.exec(location.hash);
    if (m && BY_BIO.has(m[1])) openCard(m[1]);
  }
})();
