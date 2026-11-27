// D299 (Nov 2026): federal lobbying in the Money web. Data: lobbying.js (window.TW_LOBBYING), built by
// tools/money-trail/build_lobbying.py from every 2025-2026 quarterly lobbying report (LD-2). Loaded after companies-view.js
// and upcoming-web.js (so Company tracker dots and upcoming bill dots exist) and before app.js, so these lines join the web.
// Dots and lines:
//   - one dot for all federal lobbying in 2025-2026; a dashed line to it from each of the clients that spent the most,
//     carrying the client's counted total (a total of quarterly reports, never one payment);
//   - from each of those clients (not the 33 Company tracker companies, which already have these lines) to the outside
//     lobbying firms it paid the most, same ids as the Company tracker uses (lda-registrant:<id>);
//   - from each of those clients to the bills it named most often in its reports, for the bills named by the most clients.
//     These lines carry no money: a report names the bill, it does not say how much was spent on it.
(function () {
  'use strict';
  const L = window.TW_LOBBYING;
  if (!L || typeof RESEARCH === 'undefined') return;
  const M = L.meta;
  // app.js (and its bigMoney) loads after this file, so the notes use their own short money words.
  const bigMoney = n => n >= 1e9 ? '$' + (n / 1e9).toFixed(2).replace(/\.?0+$/, '') + ' billion' : n >= 1e6 ? '$' + (n / 1e6).toFixed(2).replace(/\.?0+$/, '') + ' million' : '$' + Math.round(n).toLocaleString('en-US');
  const ents = new Map((RESEARCH.entities || []).map(e => [e.entity_id, e]));
  const addE = e => { if (!ents.has(e.entity_id)) { ents.set(e.entity_id, e); RESEARCH.entities.push(e); } return ents.get(e.entity_id); };
  const edge = x => RESEARCH.graph_edges.push(Object.assign({ jurisdiction: 'US', amount_usd: null }, x));
  const CH = window.TW_COMPANY_HUB || {};
  const UP = new Map((((window.TW_UPCOMING_WEB || {}).bills) || []).map(b => [b.slug, b.hub]));
  const PAGE = '/money-trail/?view=lobbying';
  const HUB = 'FEDERAL LOBBYING, 2025-2026 (LOBBYING TRACKER)', HID = 'lobby:federal-2025-2026';
  const KIND = { HR: ['H.R.', 'house-bill', 'hr'], S: ['S.', 'senate-bill', 's'], HJRES: ['H.J.Res.', 'house-joint-resolution', 'hjres'], SJRES: ['S.J.Res.', 'senate-joint-resolution', 'sjres'],
    HRES: ['H.Res.', 'house-resolution', 'hres'], SRES: ['S.Res.', 'senate-resolution', 'sres'], HCONRES: ['H.Con.Res.', 'house-concurrent-resolution', 'hconres'], SCONRES: ['S.Con.Res.', 'senate-concurrent-resolution', 'sconres'] };
  // A bill number as the reports write it ("HR 1") in plain form, with its congress.gov link and its Money web dot.
  window.TW_LOBBY_BILL = id => {
    const [base, cong0] = String(id).split('@'), cong = cong0 || '119', [k, n] = base.split(' '), K = KIND[k];
    if (!K) return null;
    const slug = K[2] + '-' + n + (cong === '119' ? '' : '-' + cong), b = L.bills.find(x => x.id === id), label = K[0] + ' ' + n + (cong === '119' ? '' : ' (' + cong + 'th Congress)');
    return { id, label, slug, congress: cong, url: 'https://www.congress.gov/bill/' + cong + 'th-congress/' + K[1] + '/' + n, name: b ? b.name : '',
      hub: UP.get(slug) || (b ? label + ': ' + String(b.name).toUpperCase() : '') };
  };
  const span = '2025 through ' + M.through.replace(' Q', ', quarter ');
  addE({ entity_id: HID, legal_or_reported_name: HUB, entity_type: 'Federal lobbying total (Lobbying tracker)', jurisdiction: 'US', registry_identifier: '', source_url: M.sources[0][1],
    notes: 'All federal lobbying reported in quarterly LD-2 reports, ' + span + ': ' + bigMoney(M.tot.t25) + ' in 2025 and ' + bigMoney(M.tot.t26) + ' in 2026 so far, by ' +
      M.tot.clients.toLocaleString('en-US') + ' clients. Page on this site: michiinstitute.com' + PAGE });
  window.TW_LOBBY_HUB = {};
  const billHubs = new Map();
  L.bills.slice(0, 20).forEach(b => {
    const B = window.TW_LOBBY_BILL(b.id); if (!B || !B.hub) return;
    billHubs.set(b.id, B);
    addE({ entity_id: 'bill:' + B.slug, legal_or_reported_name: B.hub, entity_type: UP.has(B.slug) ? 'upcoming bill' : 'Bill named in lobbying reports (Lobbying tracker)', jurisdiction: 'US',
      registry_identifier: B.label + (B.congress === '119' ? ' (119th Congress)' : ''), source_url: B.url,
      notes: B.label + ', ' + b.name + '. Named in ' + b.r.toLocaleString('en-US') + ' lobbying reports by ' + b.c.toLocaleString('en-US') + ' clients, ' + span + '.' +
        (b.law ? ' Became ' + b.law + '.' : '') + ' Page on this site: michiinstitute.com' + PAGE + '#lobby-bills' });
  });
  L.clients.slice(0, M.web).forEach(c => {
    const own = c.co && CH[c.co];
    const name = own || c.n + ' (lobbying client)', cid = c.co ? 'company:' + c.co : 'lobbyclient:' + c.s, id = 'LOB-' + c.s + '-';
    window.TW_LOBBY_HUB[c.s] = name;
    addE({ entity_id: cid, legal_or_reported_name: name, entity_type: c.co ? 'company' : 'Lobbying client (Lobbying tracker)', jurisdiction: c.st || 'US', registry_identifier: '',
      source_url: c.l ? 'https://lda.gov/filings/public/filing/' + c.l + '/print/' : M.sources[1][1], notes: c.n + ', as named in its lobbying reports. On the Lobbying tracker: michiinstitute.com' + PAGE + '#lobby-' + c.s });
    const tot = c.a[0] + c.a[1];
    edge({ id: id + 'TOTAL', from_name: name, from_entity_id: cid, to_name: HUB, to_entity_id: HID, amount_usd: tot, date: M.through, date_kind: 'quarterly_report_totals_NOT_a_payment_date',
      edge_type: 'lobbying_spending_reported_aggregate', confidence: 'official LD-2 reports;amounts rounded to the nearest $10,000 by law',
      source_url: c.l ? 'https://lda.gov/filings/public/filing/' + c.l + '/print/' : M.sources[1][1],
      notes: 'Federal lobbying by ' + c.n + ', ' + span + ': ' + bigMoney(c.a[0]) + ' in 2025 and ' + bigMoney(c.a[1]) + ' in 2026, from ' + c.r + ' quarterly reports, added together. ' +
        (c.self ? 'It files its own reports; its total includes what it paid outside firms.' : 'It hires outside firms; this is their reported fees.') + ' The link opens its largest report.' });
    if (!c.co) c.f.filter(f => f[1] > 0 && !f[3]).slice(0, 4).forEach((f, i) => {
      const fid = 'lda-registrant:' + f[4];
      addE({ entity_id: fid, legal_or_reported_name: f[0], entity_type: 'lobbying firm', jurisdiction: 'US', registry_identifier: 'LDA registrant ' + f[4], source_url: M.sources[1][1],
        notes: 'Registered lobbying firm (Lobbying Disclosure Act).' });
      edge({ id: id + 'FIRM-' + i, from_name: name, from_entity_id: cid, to_name: f[0], to_entity_id: fid, amount_usd: f[1], date: M.through, date_kind: 'quarterly_report_totals_NOT_a_payment_date',
        edge_type: 'lobbying_fees_reported_aggregate', confidence: 'official LD-2 reports;amounts rounded to the nearest $10,000 by law', source_url: M.sources[1][1],
        notes: 'Lobbying fees ' + c.n + ' paid this firm, ' + span + ', as the firm reported in ' + f[2] + ' quarterly report' + (f[2] === 1 ? '' : 's') + ', added together.' +
          (c.self ? ' ' + c.n + ' also files its own reports, and those already include these fees, so the Lobbying tracker does not add them again.' : '') });
    });
    c.b.filter(([b]) => billHubs.has(b)).slice(0, 3).forEach(([b, n], i) => {
      const B = billHubs.get(b);
      edge({ id: id + 'BILL-' + i, from_name: name, from_entity_id: cid, to_name: B.hub, to_entity_id: 'bill:' + B.slug, date: M.through, date_kind: 'quarterly_reports',
        edge_type: 'lobbied_on_bill_nonfinancial', confidence: 'official LD-2 reports', source_url: B.url,
        notes: c.n + ' named ' + B.label + ' (' + B.name + ') in ' + n + ' of its lobbying reports, ' + span + '. A report names the bill; it does not say how much was spent on it, so this line carries no money.' });
    });
  });
  RESEARCH.meta.lobby_hubs = [HUB].concat([...billHubs.values()].slice(0, 10).map(B => B.hub));

  // The tab and its box. Made here so the page file only gains script lines, and before app.js wires every tab.
  const nav = document.querySelector('nav.tabs');
  if (nav && !nav.querySelector('[data-view="lobbying"]')) {
    const b = document.createElement('button'); b.className = 'tab'; b.dataset.view = 'lobbying'; b.textContent = '☷   Lobbying tracker';
    const help = nav.querySelector('.tabs-helper');
    nav.insertBefore(b, help || null);
  }
  const center = document.querySelector('.center-panel');
  if (center && !document.getElementById('lobbying-view')) { const d = document.createElement('div'); d.id = 'lobbying-view'; d.hidden = true; center.append(d); }
})();
