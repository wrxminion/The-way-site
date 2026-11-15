// Company tracker (Nov 2026): companies in the Money web. Data: companies.js (window.TW_COMPANIES), made by
// tools/money-trail/build_companies.py from FEC bulk files, LD-2 lobbying reports (lda.gov) and USAspending records.
// Loaded after budgets-view.js, media-view.js and fec-more.js, and before app.js, so the lines join the Money web like any other record.
// Each company is one dot (Comcast and Charter reuse their Media tracker dot). Lines from it:
//   - a dotted line to each PAC the FEC lists the company as sponsoring (a registration, not money);
//   - its PAC's largest gifts to candidates and committees, added together per recipient (FEC filings, solid purple),
//     unless the PAC's own filing rows are already loaded (then those rows are used and nothing is added twice);
//   - federal agencies' fiscal 2026 contract and grant money to it (USAspending totals, dashed: totals, not single payments);
//   - fees it paid outside lobbying firms in 2025-2026 (LD-2 reports, dashed: quarterly totals, not single payments).
(function () {
  'use strict';
  const D = window.TW_COMPANIES;
  if (!D || typeof RESEARCH === 'undefined') return;
  const norm = s => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const seenE = new Set(RESEARCH.entities.map(e => e.entity_id));
  const seenT = new Set(RESEARCH.transactions.map(t => t.transaction_id));
  const byName = new Map();
  RESEARCH.entities.forEach(e => { const k = norm(e.legal_or_reported_name); if (!byName.has(k)) byName.set(k, e.entity_id); });
  const addE = e => { if (!seenE.has(e.entity_id)) { seenE.add(e.entity_id); RESEARCH.entities.push(e); if (!byName.has(norm(e.legal_or_reported_name))) byName.set(norm(e.legal_or_reported_name), e.entity_id); } };
  const addT = t => { if (!seenT.has(t.transaction_id)) { seenT.add(t.transaction_id); RESEARCH.transactions.push(t); } };
  const edge = e => RESEARCH.graph_edges.push(e);
  const money = n => '$' + Math.round(n).toLocaleString('en-US');
  // PACs whose own FEC filing rows are already in the data (main FEC layer, a loaded search layer, or the Media tracker)
  const ownRows = new Set(RESEARCH.transactions.map(t => t.fec_committee_id).filter(Boolean));
  const CM = 'https://www.fec.gov/data/committee/', MH = window.TW_MEDIA_HUB || {};
  window.TW_COMPANY_HUB = {};
  (D.companies || []).forEach(c => {
    // c.hub is the dot's name: the Media tracker's dot for a media company, else the company name with "(company)"
    const media = !!(c.media_id && MH[c.media_id]);
    const HUB = media ? MH[c.media_id] : c.hub;
    const hid = media ? (byName.get(norm(HUB)) || 'media:' + c.media_id) : 'company:' + c.slug;
    const id = 'CO-' + c.slug + '-', trail = '/money-trail/follow.html?company=' + c.slug;
    window.TW_COMPANY_HUB[c.slug] = HUB;
    const p = c.pac || {}, pacs = p.committees || [];
    if (!media) addE({ entity_id: hid, legal_or_reported_name: HUB, entity_type: 'company', jurisdiction: 'US',
      registry_identifier: pacs.length ? 'Sponsor of FEC PAC ' + pacs.map(x => x.id).join(', ') : '', source_url: pacs.length ? CM + pacs[0].id + '/' : 'https://michiinstitute.com' + trail,
      notes: c.name + ', ' + c.sector.toLowerCase() + '. On the Company tracker because its PAC is one of the three largest in its sector (FEC 2025-2026). Its whole record, with every source, is on its trail page: michiinstitute.com' + trail + '.' });
    if (!media) pacs.forEach((x, i) => {
      const pid = 'fec:' + x.id;
      addE({ entity_id: pid, legal_or_reported_name: x.name, entity_type: 'political action committee (company PAC)', jurisdiction: 'US', registry_identifier: 'FEC ' + x.id, source_url: CM + x.id + '/',
        notes: 'Raised ' + money(x.receipts) + ' in 2025-2026 through ' + x.through + ' (FEC totals file).' });
      edge({ id: id + 'PAC-' + i, from_name: HUB, from_entity_id: hid, to_name: x.name, to_entity_id: pid, amount_usd: null, date: '', date_kind: 'committee registration, not a transaction',
        jurisdiction: 'US', edge_type: 'company_sponsors_PAC_registration_NOT_money', confidence: 'FEC committee master file (connected organization)', source_url: CM + x.id + '/',
        notes: 'The FEC lists ' + c.name + ' as the company behind this PAC. A company may pay its PAC’s running costs, but the money the PAC gives comes from employees and shareholders who chose to give to it, not from the company’s own treasury.' });
    });
    // the PAC's largest gifts, added together per recipient
    const pacIds = new Set(pacs.map(x => x.id));
    if (!media && ![...pacIds].some(x => ownRows.has(x))) (p.top || []).forEach(g => {
      if (!g.cmte) return;
      const pac = pacs.find(x => x.id === g.pac) || pacs[0];
      addE({ entity_id: 'fec:' + g.cmte, legal_or_reported_name: g.name, entity_type: g.kind === 'candidates' ? 'candidate committee' : 'FEC committee', jurisdiction: 'US', registry_identifier: 'FEC ' + g.cmte, source_url: CM + g.cmte + '/', notes: g.cand ? 'Campaign committee of ' + g.cand + '.' : '' });
      addT({ transaction_id: 'CO-FEC-' + pac.id + '-' + g.cmte, source_entity_id: 'fec:' + pac.id, recipient_entity_id: 'fec:' + g.cmte, source_name: pac.name, recipient_name: g.name,
        amount_usd: g.amt, transaction_date: g.last, date_kind: 'Latest date among the gifts added together', cycle: '2026', jurisdiction: 'US / FEC filing',
        activity_type: 'FEC: PAC contributions to this committee, added together', filing_url: g.link, filing_id: 'FEC file ' + g.file + ' (largest of ' + g.n + ' gifts added together)',
        confidence: 'FEC itemized records from the FEC bulk data files', amendment_status: '', evidence_tier: 'fec_filing', record_kind: 'transaction', event_date: g.last, event_id: 'CO-FEC-' + pac.id + '-' + g.cmte, fec_committee_id: pac.id,
        notes: g.n + ' gift' + (g.n === 1 ? '' : 's') + ' from ' + pac.name + ' to ' + g.name + (g.cand ? ' (' + g.cand + ')' : '') + ', ' + g.first + ' to ' + g.last + ', in the FEC 2025-2026 bulk files, added together here. The link opens the filing with the largest one. No inference of coordination or misconduct.' });
    });
    // federal money, fiscal 2026
    const f = c.fed;
    if (f) [['contracts', 'contracts'], ['grants', 'grants and other aid']].forEach(([k, word]) => (f[k] || []).filter(a => a.amt > 0).slice(0, k === 'contracts' ? 6 : 3).forEach((a, i) => {
      const AG = String(a.agency).toUpperCase(), aid = byName.get(norm(AG)) || 'agency-name:' + norm(AG);
      addE({ entity_id: aid, legal_or_reported_name: AG, entity_type: 'federal agency', jurisdiction: 'US', registry_identifier: '', source_url: 'https://www.usaspending.gov/agency', notes: 'Federal agency (USAspending).' });
      edge({ id: id + 'FED-' + k + '-' + i, from_name: AG, from_entity_id: aid, to_name: HUB, to_entity_id: hid, amount_usd: a.amt, date: f.as_of, date_kind: 'fiscal_year_total_NOT_a_payment_date',
        jurisdiction: 'US', edge_type: 'federal_' + k + '_obligations_aggregate_fiscal_year', confidence: 'official_aggregate;not_itemized_transaction', source_url: f.url,
        notes: 'Money ' + a.agency + ' obligated (promised) to ' + f.recipient.name + ' in federal ' + word + ' in fiscal year ' + f.fy + ' (Oct 1, ' + (f.fy - 1) + ' to Sep 30, ' + f.fy + '), the USAspending total for this recipient and its child companies. A total, not one payment.' });
    }));
    // outside lobbying firms
    const L = c.lobby;
    if (L) (L.firms || []).filter(x => x.amt > 0).slice(0, 8).forEach((x, i) => {
      const fid = 'lda-registrant:' + x.id;
      addE({ entity_id: fid, legal_or_reported_name: x.name, entity_type: 'lobbying firm', jurisdiction: 'US', registry_identifier: String(x.id).startsWith('name-') ? '' : 'LDA registrant ' + x.id, source_url: x.link, notes: 'Registered lobbying firm (Lobbying Disclosure Act).' });
      edge({ id: id + 'LDA-' + i, from_name: HUB, from_entity_id: hid, to_name: x.name, to_entity_id: fid, amount_usd: x.amt, date: x.last, date_kind: 'quarterly_report_totals_NOT_a_payment_date',
        jurisdiction: 'US', edge_type: 'lobbying_fees_reported_aggregate', confidence: 'official LD-2 reports;amounts rounded to the nearest $10,000 by law', source_url: x.link,
        notes: 'Lobbying fees ' + c.name + ' paid this firm in 2025-2026, as the firm reported in ' + x.reports + ' quarterly LD-2 report' + (x.reports === 1 ? '' : 's') + ', added together. A quarter under $5,000 is reported with no amount. The link opens the largest report.' });
    });
  });
})();
