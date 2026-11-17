// D289 (Nov 2026): tariffs and tariff refunds in the Money web. Data: tariffs.js (window.TW_TARIFFS), built by
// tools/money-trail/build_tariffs.py from tools/money-trail/tariffs.json. Loaded after companies-view.js and war-view.js
// (so the Company tracker dots and the Treasury and president dots exist) and before app.js, so these lines join the web.
// Dots and lines:
//   - each tariff program is one dot (IEEPA, Section 122, Section 301);
//   - the president who ordered it, and the Supreme Court for the IEEPA ruling (no money on those lines);
//   - IEEPA tariffs collected into the Treasury, and refunds sent back out for payment (CBO and CBP totals, dashed);
//   - the refund each company reports, from the IEEPA dot to the company (dashed: a total as reported, never added up);
//   - what the company said it did with it: a line to "Bonuses and incentive pay", "Paid back to customers",
//     "Lower prices" or "Sold the refund claim" (dashed; an amount only where the company or a named source gives one).
(function () {
  'use strict';
  const T = window.TW_TARIFFS;
  if (!T || typeof RESEARCH === 'undefined') return;
  const ents = new Map((RESEARCH.entities || []).map(e => [e.entity_id, e]));
  const addE = e => { if (!ents.has(e.entity_id)) { ents.set(e.entity_id, e); RESEARCH.entities.push(e); } return ents.get(e.entity_id); };
  const edge = x => RESEARCH.graph_edges.push(Object.assign({ jurisdiction: 'US', amount_usd: null }, x));
  const CH = window.TW_COMPANY_HUB || {};
  const PAGE = '/money-trail/?view=tariffs';
  const TREAS = 'DEPARTMENT OF THE TREASURY', PRES = 'PRESIDENT DONALD J. TRUMP', COURT = 'SUPREME COURT OF THE UNITED STATES';
  const USE_DOT = {
    bonuses: 'TARIFF REFUNDS TO BONUSES AND INCENTIVE PAY (TARIFF TRACKER)',
    customers: 'TARIFF REFUNDS PAID BACK TO CUSTOMERS (TARIFF TRACKER)',
    prices: 'TARIFF REFUNDS TO LOWER PRICES (TARIFF TRACKER)',
    sold: 'TARIFF REFUND CLAIMS SOLD TO BUYERS (TARIFF TRACKER)'
  };
  window.TW_TARIFF_HUB = {};
  const hubs = [];
  addE({ entity_id: 'president:donald-j-trump', legal_or_reported_name: PRES, entity_type: 'president_of_the_united_states', jurisdiction: 'US', registry_identifier: '',
    source_url: '/government/presidents/donald-j-trump.html', notes: 'President of the United States. Page on this site: /government/presidents/donald-j-trump.html' });
  T.programs.forEach(p => {
    const HUB = p.hub, HID = 'tariff:' + p.slug, id = 'TAR-' + p.slug + '-';
    window.TW_TARIFF_HUB[p.slug] = HUB; hubs.push(HUB);
    addE({ entity_id: HID, legal_or_reported_name: HUB, entity_type: 'Tariff program (Tariff tracker)', jurisdiction: 'US', registry_identifier: p.law, source_url: p.url,
      notes: p.name + ', ' + p.rate + '. ' + p.status + ' Page on this site: michiinstitute.com' + PAGE });
    edge({ id: id + 'PRES', from_name: PRES, from_entity_id: 'president:donald-j-trump', to_name: HUB, to_entity_id: HID, date: p.start, date_kind: 'start_of_the_tariff',
      edge_type: 'president_ordered_tariff_nonfinancial', confidence: 'official_record', source_url: p.url,
      notes: 'President Donald J. Trump ordered the ' + p.name + ' (' + p.law + '). This line carries no money.' });
    if (p.collected) {
      edge({ id: id + 'COLLECTED', from_name: HUB, from_entity_id: HID, to_name: TREAS, amount_usd: p.collected, date: '2026-02-20', date_kind: 'total_as_of_date_NOT_a_payment_date',
        edge_type: 'tariff_revenue_total_aggregate', confidence: p.collected_who, source_url: p.collected_url,
        notes: 'Tariffs collected by U.S. Customs and Border Protection under this program, as given by the ' + p.collected_who + '. A total, not one payment.' });
    }
  });
  const IE = window.TW_TARIFF_HUB.ieepa, IEID = 'tariff:ieepa';
  edge({ id: 'TAR-ieepa-COURT', from_name: COURT, from_entity_id: 'court:supreme-court-of-the-united-states', to_name: IE, to_entity_id: IEID, date: '2026-02-20', date_kind: 'date_of_ruling',
    edge_type: 'court_ruling_nonfinancial', confidence: 'official_record', source_url: T.programs[0].url,
    notes: 'Learning Resources v. Trump (Nos. 24-1287 and 25-250), decided Feb 20, 2026, 6 to 3: IEEPA does not authorize the President to impose tariffs. A ruling is not a payment.' });
  const sent = T.totals.find(t => t.key === 'sent');
  if (sent) edge({ id: 'TAR-ieepa-REFUNDS', from_name: TREAS, to_name: IE, to_entity_id: IEID, amount_usd: sent.amount, date: sent.asof, date_kind: 'total_as_of_date_NOT_a_payment_date',
    edge_type: 'tariff_refunds_total_aggregate', confidence: 'CBP court filing', source_url: sent.url,
    notes: 'IEEPA tariff refunds certified and sent to the Treasury for payment to importers, including interest, as of ' + sent.asof + '. A total, not one payment.' });
  Object.entries(USE_DOT).forEach(([k, nm]) => addE({ entity_id: 'tariffuse:' + k, legal_or_reported_name: nm, entity_type: 'Use of tariff refunds (Tariff tracker)', jurisdiction: 'US',
    registry_identifier: '', source_url: '', notes: T.uses[k] + '. Companies join this dot when their own filing or a named source says so. Page on this site: michiinstitute.com' + PAGE }));
  T.companies.forEach(c => {
    const HUB = c.company_slug ? (CH[c.company_slug] || c.name + ' (company)') : c.hub;
    const CID = 'company:' + (c.company_slug || c.slug), id = 'TAR-co-' + c.slug + '-';
    c.web_hub = HUB;
    addE({ entity_id: CID, legal_or_reported_name: HUB, entity_type: 'company', jurisdiction: 'US', registry_identifier: '', source_url: (c.refund || c.use_box || {}).url || '',
      notes: c.name + '. On the Tariff tracker: michiinstitute.com' + PAGE + '#tariff-' + c.slug });
    const r = c.refund || c.paid;
    if (r) edge({ id: id + (c.refund ? 'REFUND' : 'PAID'), from_name: c.refund ? IE : HUB, from_entity_id: c.refund ? IEID : CID, to_name: c.refund ? HUB : IE, to_entity_id: c.refund ? CID : IEID,
      amount_usd: r.amount, date: r.asof, date_kind: 'total_as_reported', edge_type: c.refund ? 'tariff_refund_to_company_aggregate' : 'tariffs_paid_by_company_aggregate',
      confidence: r.who, source_url: r.url, notes: r.label + '. ' + r.who + '. A total as reported, not one payment, and never added to other companies\' figures.' });
    if (USE_DOT[c.use]) {
      const u = c.use_box || {};
      edge({ id: id + 'USE', from_name: HUB, from_entity_id: CID, to_name: USE_DOT[c.use], to_entity_id: 'tariffuse:' + c.use, amount_usd: (!u.mixed && u.amount) || null, date: (c.refund || {}).asof || T.checked,
        date_kind: 'as_reported', edge_type: u.amount && !u.mixed ? 'tariff_refund_use_aggregate' : 'tariff_refund_use_nonfinancial', confidence: 'company filing or named source', source_url: u.url || '',
        notes: (u.label ? u.label + ': ' : '') + (u.text || T.uses[c.use]) + (u.amount && !u.mixed ? '' : u.mixed ? ' The filing gives one amount for more than one use, so this line carries none.' : ' No dollar amount is given, so this line carries none.') });
    }
  });
  RESEARCH.meta.tariff_hubs = hubs;

  // The tab and its box. Made here so the page file only gains script lines, and before app.js wires every tab.
  const nav = document.querySelector('nav.tabs');
  if (nav && !nav.querySelector('[data-view="tariffs"]')) {
    const b = document.createElement('button'); b.className = 'tab'; b.dataset.view = 'tariffs'; b.textContent = '⚖   Tariff tracker';
    const help = nav.querySelector('.tabs-helper');
    nav.insertBefore(b, help || null);
  }
  const center = document.querySelector('.center-panel');
  if (center && !document.getElementById('tariffs-view')) { const d = document.createElement('div'); d.id = 'tariffs-view'; d.hidden = true; center.append(d); }
})();
