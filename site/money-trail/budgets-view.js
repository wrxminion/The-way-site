// D201 (Nov 2026): department budgets, where federal money comes from, and one law followed through the money web.
// D208 (Nov 2026): every law in laws.js (window.TW_LAWS) can be followed, picked from a list.
// Data: budgets.js (window.TW_BUDGETS) and laws.js, built from public USAspending, Treasury, Library of Congress and House Clerk records.
// Loaded after data.js and before app.js, so the law's lines join the Money web like any other record.
// Text goes in with textContent. No number here is estimated.
(function () {
  'use strict';
  const B = window.TW_BUDGETS;
  if (!B || typeof RESEARCH === 'undefined') return;
  // D208: the followed laws come from laws.js (window.TW_LAWS), built by tools/money-trail/follow_laws.py.
  const LAWS = ((window.TW_LAWS || {}).laws || []).filter(l => l && l.agencies);
  const hubOf = law => String(law.name || law.bill).toUpperCase();
  const codesOf = law => 'spending code' + ((law.codes || []).length > 1 ? 's ' : ' ') + (law.codes || []).join(' and ');
  const seenEntity = new Set((RESEARCH.entities || []).map(e => e.entity_id));
  const chamberName = (ch, n) => 'U.S. ' + (ch === 'house' ? 'HOUSE' : 'SENATE') + ' (' + n + (n % 10 === 1 && n !== 111 ? 'ST' : n % 10 === 2 && n !== 112 ? 'ND' : n % 10 === 3 && n !== 113 ? 'RD' : 'TH') + ' CONGRESS)';

  // 1. Each law's lines in the Money web. Amounts are dollars USAspending tags to the law's spending codes.
  //    They are totals, not single payments, so they are drawn as reported lines and are never added up.
  LAWS.forEach(law => {
    const HUB = hubOf(law), id = 'LAW-' + law.key + '-';
    const asOf = String(law.retrieved || '').slice(0, 10);
    const url = 'https://www.usaspending.gov/search';
    const edge = (eid, from, to, amt, note, src) => RESEARCH.graph_edges.push({ id: eid, from_name: from, to_name: to, amount_usd: amt, date: asOf,
      date_kind: 'total_to_date_as_of_pull_date_NOT_a_payment_date', jurisdiction: 'US', edge_type: 'federal_spending_aggregate_tagged_to_law',
      confidence: 'official_aggregate;not_itemized_transaction', source_url: src || url, notes: note });
    (law.agencies || []).filter(a => a.obligation > 0).slice(0, 12).forEach((a, i) =>
      edge(id + 'AG-' + (a.code || i), HUB, String(a.description || '').toUpperCase(), a.obligation,
        'Money promised (obligated) by this agency from the ' + law.name + ', ' + codesOf(law) + ', as of ' + asOf + '. Paid out so far: ' + fmt(a.outlay) + '.'));
    ((law.recipients || {}).rows || []).filter(r => r.obligation > 0).slice(0, 25).forEach((r, i) =>
      edge(id + 'RC-' + i, HUB, String(r.description || '').toUpperCase(), r.obligation,
        'Award money from the ' + law.name + ' promised to this recipient, as of ' + asOf + '. Paid out so far: ' + fmt(r.outlay) + '. Recipient ID ' + (r.code || 'not given') + '.',
        r.id ? 'https://www.usaspending.gov/recipient/' + encodeURIComponent(r.id) + '/latest' : url));
    for (const [ch, x] of Object.entries(law.votes || {})) {
      const t = x.totals || {};
      RESEARCH.graph_edges.push({ id: id + 'VOTE-' + ch, from_name: chamberName(ch, law.congress || 117), to_name: HUB,
        amount_usd: null, date: String(x.date || '').slice(0, 10), date_kind: 'roll_call_vote_date', jurisdiction: 'US', edge_type: 'vote_nonfinancial_context',
        confidence: x.how === 'roll call' ? 'official_roll_call' : 'official_record', source_url: x.source || law.bill_page,
        notes: (x.question || 'Vote') + ': ' + (x.how === 'roll call' ? 'Yea ' + (t.Yea ?? '?') + ', Nay ' + (t.Nay ?? '?') + '.' : 'passed by ' + x.how + ', no member-by-member record.') });
    }
    (law.agencies || []).filter(a => a.obligation > 0).slice(0, 12).forEach(a => {
      const eid = 'agency:' + (a.code || a.description);
      if (seenEntity.has(eid)) return;
      seenEntity.add(eid);
      RESEARCH.entities.push({ entity_id: eid, legal_or_reported_name: String(a.description || '').toUpperCase(),
        entity_type: 'federal agency', jurisdiction: 'US', registry_identifier: 'USAspending agency ' + (a.code || ''), source_url: 'https://www.usaspending.gov/agency', notes: 'Spends money from a law followed on this page.' });
    });
  });

  // 2. Words and numbers
  function fmt(n) {
    if (n == null || !isFinite(n)) return 'not reported';
    const a = Math.abs(n), s = n < 0 ? '-$' : '$';
    if (a >= 1e12) return s + (a / 1e12).toLocaleString('en-US', { maximumFractionDigits: 2 }) + ' trillion';
    if (a >= 1e9) return s + (a / 1e9).toLocaleString('en-US', { maximumFractionDigits: 1 }) + ' billion';
    if (a >= 1e6) return s + (a / 1e6).toLocaleString('en-US', { maximumFractionDigits: 1 }) + ' million';
    return s + Math.round(a).toLocaleString('en-US');
  }
  const day = s => /^\d{4}-\d{2}-\d{2}/.test(s || '') ? new Date(String(s).slice(0, 10) + 'T12:00:00Z').toLocaleDateString('en-US', { timeZone: 'UTC', year: 'numeric', month: 'long', day: 'numeric' }) : '';
  const el = (tag, cls, text) => { const d = document.createElement(tag); if (cls) d.className = cls; if (text != null) d.textContent = text; return d; };
  const link = (text, href) => { const a = el('a', 'bud-src', text); a.href = href; a.target = '_blank'; a.rel = 'noopener noreferrer'; return a; };
  const bar = (part, whole) => { const o = el('span', 'bud-bar'); const i = el('i'); i.style.width = Math.max(0.5, Math.min(100, 100 * part / whole)).toFixed(1) + '%'; o.append(i); return o; };

  function deptBlock() {
    const D = B.departments, box = el('section', 'bud-block');
    box.setAttribute('aria-label', 'Department budgets');
    box.append(el('h3', 'bud-h', 'Department budgets, fiscal year ' + D.fiscal_year));
    box.append(el('p', 'bud-lead', 'Money each federal department and agency had to spend, how much of it was promised (obligated) and how much was paid out, as the agencies reported it to USAspending.gov through quarter ' + D.quarter + '. "Available" can include money carried over from earlier years, so do not add rows together.'));
    const lab = el('label', 'tracker-search'); const inp = el('input'); inp.type = 'search'; inp.autocomplete = 'off'; inp.placeholder = 'Type part of a department name…';
    lab.append(el('span', null, 'Find a department'), inp); box.append(lab);
    const list = el('div', 'bud-list'), more = el('button', 'bud-more');
    more.type = 'button'; let all = false;
    const max = D.rows.reduce((m, r) => Math.max(m, r.resources || 0), 1);
    function draw() {
      list.replaceChildren();
      const q = inp.value.trim().toLowerCase();
      const rows = D.rows.filter(r => !q || (r.name + ' ' + r.abbr).toLowerCase().includes(q));
      rows.slice(0, all || q ? rows.length : 12).forEach(r => {
        const row = el('div', 'bud-row');
        const top = el('div', 'bud-top');
        top.append(el('b', 'bud-big', r.resources ? fmt(r.resources) : 'Not reported yet'), el('strong', 'bud-name', r.name + (r.abbr ? ' (' + r.abbr + ')' : '')));
        row.append(top);
        if (r.resources) row.append(bar(r.resources, max));
        row.append(el('small', 'bud-small', 'Promised ' + fmt(r.obligated) + ' · Paid out ' + fmt(r.outlays) + (r.share ? ' · ' + (100 * r.share).toLocaleString('en-US', { maximumFractionDigits: 2 }) + '% of all federal budget resources' : '')));
        const act = el('div', 'bud-act');
        if (r.slug) act.append(link('USAspending agency page ↗', 'https://www.usaspending.gov/agency/' + encodeURIComponent(r.slug) + '?fy=' + D.fiscal_year));
        if ((r.years || []).length) {
          const det = el('details', 'bud-years'); det.append(el('summary', null, 'Past years'));
          const ul = el('ul');
          r.years.slice().reverse().forEach(y => ul.append(el('li', null, 'FY ' + y[0] + ': available ' + fmt(y[1]) + ', promised ' + fmt(y[2]) + ', paid out ' + fmt(y[3]))));
          det.append(ul); act.append(det);
        }
        row.append(act); list.append(row);
      });
      if (!rows.length) list.append(el('div', 'empty', 'No department matches. Try fewer letters.'));
      more.hidden = !!q || rows.length <= 12;
      more.textContent = all ? 'Show the 12 largest' : 'Show all ' + D.rows.length + ' departments and agencies';
    }
    inp.addEventListener('input', draw);
    more.addEventListener('click', () => { all = !all; draw(); });
    box.append(list, more);
    box.append(el('p', 'bud-note', 'Source: USAspending.gov agency profiles (U.S. Treasury), pulled ' + day(D.retrieved) + '.'));
    draw();
    return box;
  }

  function moneyInBlock() {
    const M = B.money_in, box = el('section', 'bud-block');
    box.setAttribute('aria-label', 'Where federal money comes from');
    box.append(el('h3', 'bud-h', 'Where federal money came from, fiscal year ' + M.fiscal_year));
    const kp = el('div', 'bud-kpis');
    [[fmt(M.receipts_total), 'collected (taxes and other receipts)'], [fmt(M.outlays_total), 'spent'], [fmt(M.gap), 'gap (the deficit)']].forEach(([n, t]) => { const d = el('div', 'bud-kpi'); d.append(el('b', null, n), el('span', null, t)); kp.append(d); });
    box.append(kp);
    box.append(el('p', 'bud-lead', 'The year ran from October 1, ' + (M.fiscal_year - 1) + ' to September 30, ' + M.fiscal_year + '. The gap is the spending the year’s receipts did not cover. The government covers it mostly by borrowing: selling Treasury bills, notes and bonds.'));
    const ul = el('ul', 'bud-in');
    M.receipts.filter(r => r.level === 2).sort((a, b) => b.fytd - a.fytd).forEach(r => {
      const li = el('li'); const top = el('div', 'bud-top');
      top.append(el('b', 'bud-mid', fmt(r.fytd)), el('span', null, r.name + ' · ' + (100 * r.fytd / M.receipts_total).toLocaleString('en-US', { maximumFractionDigits: 1 }) + '%'));
      li.append(top, bar(r.fytd, M.receipts_total)); ul.append(li);
    });
    box.append(ul);
    const d = M.debt;
    box.append(el('p', 'bud-debt', 'Total federal debt on ' + day(d.date) + ': ' + fmt(d.total) + '. Held by the public: ' + fmt(d.public) + '. Held by government accounts (such as the Social Security trust funds): ' + fmt(d.intragov) + '.'));
    const src = el('p', 'bud-note'); src.append(document.createTextNode('Sources: '), link('Monthly Treasury Statement ↗', M.source), document.createTextNode(' (Table 9, through ' + day(M.through) + ') and '), link('Debt to the Penny ↗', d.source), document.createTextNode(', U.S. Treasury Fiscal Data.'));
    box.append(src);
    return box;
  }

  const PARTY = { Democratic: 'Democrats', Republican: 'Republicans', Independent: 'Independents' };
  function houseLine(h) {
    if (!h) return 'No final House vote was found in the bill record. ';
    if (h.how !== 'roll call') return 'The House passed it by ' + h.how + ' on ' + day(h.date) + ', so there is no member-by-member record. ';
    const parties = Object.entries(h.by_party || {}).filter(([, q]) => q.Yea + q.Nay > 0).map(([nm, q]) => (PARTY[nm] || nm) + ' ' + q.Yea + ' yes, ' + q.Nay + ' no').join('; ');
    return 'Final House vote, ' + day(h.date) + ': ' + h.totals.Yea + ' yes, ' + h.totals.Nay + ' no' + (parties ? ' (' + parties + ')' : '') + '. ';
  }
  function senateLine(s) {
    if (!s) return 'No final Senate vote was found in the bill record. ';
    if (s.how !== 'roll call') return 'The Senate passed it by ' + s.how + ' on ' + day(s.date) + '. ';
    return 'Final Senate vote, ' + day(s.date) + ': ' + s.totals.Yea + ' yes, ' + s.totals.Nay + ' no (record vote ' + s.roll + '). ';
  }
  function openHub(name) {
    if (typeof graphHub === 'undefined') return;
    graphHub = name; if (!hubs.includes(name)) { hubs.push(name); prepareHubRefresh(); }
    document.getElementById('hub').value = name; graphScale = 1; setView('network');
    document.querySelector('.center-panel').scrollIntoView({ block: 'start', behavior: 'smooth' });
  }
  function lawDetail(law) {
    const box = el('div', 'bud-lawone');
    box.append(el('h4', 'bud-h4', law.name));
    const ov = law.overview || {};
    const kp = el('div', 'bud-kpis');
    [[fmt(ov.total_budget_authority), 'given to agencies by the law'], [fmt(ov.total_obligations), 'promised so far'], [fmt(ov.total_outlays), 'paid out so far']].forEach(([n, t]) => { const d = el('div', 'bud-kpi'); d.append(el('b', null, n), el('span', null, t)); kp.append(d); });
    box.append(kp);
    const v = law.votes || {}, h = v.house, s = v.senate;
    box.append(el('p', 'bud-lead', law.bill + ', ' + law.public_law + ', signed into law ' + day(law.signed) + (law.sponsor ? '. Sponsor: ' + law.sponsor : '') + '. ' + houseLine(h) + senateLine(s) +
      'USAspending tags this law\u2019s money with ' + codesOf(law) + '. The amounts here count only tagged dollars.' + (law.code_note ? ' ' + law.code_note : '')));
    if (law.summary && law.summary.text) box.append(el('p', 'bud-sum', 'What it does, from the Library of Congress summary: \u201c' + law.summary.text + '\u201d'));
    const go = el('div', 'bud-act');
    const b = el('button', 'tracker-web', 'See this law in the Money web');
    b.type = 'button';
    b.addEventListener('click', () => openHub(hubOf(law)));
    const f = el('a', 'tracker-inspect', 'Follow this trail \u2192'); f.href = 'follow.html?bill=' + encodeURIComponent(law.slug);
    go.append(b, f); box.append(go);
    const rec = law.recipients;
    const lists = [['Agencies spending it', law.agencies, 12], ['Accounts the money sits in', law.accounts, 12], ['Who got the most so far (largest recipients)', rec && rec.rows, 25]];
    lists.forEach(([title, rows, n]) => {
      if (!rows || !rows.length) return;
      const det = el('details', 'bud-sub'); det.append(el('summary', null, title));
      const ul = el('ul', 'bud-in'); const mx = Math.max(...rows.map(r => r.obligation || 0), 1);
      const isRec = rec && rows === rec.rows;
      rows.filter(r => r.obligation > 0).slice(0, n).forEach(r => {
        const li = el('li'); const top = el('div', 'bud-top'); const who = el('span', null, ' \u00b7 paid ' + fmt(r.outlay));
        who.prepend(isRec && r.id ? link(r.description || '', 'https://www.usaspending.gov/recipient/' + encodeURIComponent(r.id) + '/latest') : document.createTextNode(r.description || ''));
        top.append(el('b', 'bud-mid', fmt(r.obligation)), who); li.append(top, bar(r.obligation, mx)); ul.append(li);
      });
      if (rows === law.agencies) [law.agency_tbr_note, law.agency_gap_note].filter(Boolean).forEach(t => det.append(el('p', 'bud-note', t)));
      if (isRec) det.append(el('p', 'bud-note', rec.note + ' Together they hold ' + fmt(rec.shown_total) + ' of the ' + fmt(rec.all_award_obligation || ov.award_obligations) + ' in award money promised so far. Being listed means the award was made to that organization. Some recipients pass the money on to others, the way a state agency passes it to cities and counties. Each name links to its USAspending page, which lists its awards.'));
      det.append(ul); box.append(det);
    });
    if (!rec) box.append(el('p', 'bud-note', 'Recipients are not shown for this law: no USAspending page counts only this law\u2019s dollars for each recipient yet.'));
    if (h && (h.members || []).length) {
      const det = el('details', 'bud-sub'); det.append(el('summary', null, 'How each House member voted (' + h.members.length + ')'));
      const ul = el('ul', 'bud-votes');
      h.members.slice().sort((a, b) => String(a[4]).localeCompare(String(b[4])) || String(a[1]).localeCompare(String(b[1]))).forEach(m => ul.append(el('li', null, m[1] + ' (' + m[2] + '-' + m[3] + '): ' + (m[4] === 'Yea' || m[4] === 'Aye' ? 'yes' : m[4] === 'Nay' || m[4] === 'No' ? 'no' : m[4]))));
      const src = el('p', 'bud-note'); src.append(link('House Clerk roll call ' + h.roll + ' \u2197', h.source));
      det.append(ul, src); box.append(det);
    }
    const note = el('p', 'bud-note');
    note.append(document.createTextNode('Sources: USAspending.gov disaster and emergency fund pages for ' + codesOf(law) + ', pulled ' + day(law.retrieved) + '; '), link('Library of Congress bill record \u2197', law.bill_record), document.createTextNode('; '));
    if (s && s.source) note.append(link('Senate vote record \u2197', s.source), document.createTextNode('; '));
    if (law.law_text) note.append(link('law text \u2197', law.law_text), document.createTextNode('; '));
    note.append(link('bill page \u2197', law.bill_page), document.createTextNode('. What the money accomplished is not in this data yet. Being paid from a law does not imply wrongdoing.'));
    box.append(note);
    return box;
  }

  function lawsBlock() {
    if (!LAWS.length) return null;
    const box = el('section', 'bud-block bud-law');
    box.setAttribute('aria-label', 'Follow a law');
    box.append(el('h3', 'bud-h', 'Follow a law from the vote to the money'));
    box.append(el('p', 'bud-lead', 'Pick a law. Each one has its own spending code at USAspending.gov, so its money can be followed from the agencies to who was promised it and what has been paid out. Votes come from the Library of Congress bill record and, for the House, the House Clerk\u2019s roll call. The laws are never added together.'));
    const pick = el('div', 'bud-pick'); pick.setAttribute('role', 'group'); pick.setAttribute('aria-label', 'Laws');
    const slot = el('div');
    const btns = LAWS.map(law => {
      const b = el('button', 'bud-chip', law.name + ' (' + law.bill + ')'); b.type = 'button';
      b.addEventListener('click', () => show(law));
      pick.append(b); return b;
    });
    function show(law) {
      btns.forEach((b, i) => b.setAttribute('aria-pressed', String(LAWS[i] === law)));
      slot.replaceChildren(lawDetail(law));
    }
    box.append(pick, slot);
    const want = new URLSearchParams(location.search).get('law');
    show(LAWS.find(l => l.key === want || l.slug === want) || LAWS[0]);
    return box;
  }

  function mount() {
    const box = document.getElementById('departments-view');
    if (!box || box.querySelector('.bud-area')) return;
    const area = el('div', 'bud-area');
    const l = lawsBlock();
    area.append(deptBlock(), moneyInBlock());
    if (l) area.append(l);
    box.prepend(area);
    if (typeof hubs !== 'undefined') {
      LAWS.forEach(law => { if (!hubs.includes(hubOf(law))) hubs.push(hubOf(law)); });
      if (LAWS.length && typeof prepareHubRefresh === 'function') prepareHubRefresh();
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
})();
