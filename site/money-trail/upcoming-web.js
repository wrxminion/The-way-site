// D282 (Nov 2026): every upcoming bill on Get Involved (/get-involved/bills/) gets its own spot on the Money web.
// Data: upcoming-web-data.js (window.TW_UPCOMING_WEB), built by tools/get-involved/build_get_involved.py from the
// Library of Congress bill records, our member pages, FEC bulk data and lobbying reports from lda.gov.
// Lines: sponsor -> bill, committee -> bill, campaign committee -> sponsor, lobbying client -> bill, and
// client -> lobbying firm (the fee the firm reported). Only the fee is money; the other lines carry no dollars.
// Loaded after budgets-view.js (so members already on the web keep one dot) and before app.js.
(function () {
  'use strict';
  const U = window.TW_UPCOMING_WEB;
  if (!U || typeof RESEARCH === 'undefined') return;
  const NAMES = window.TW_MEMBER_NAMES || {};
  const ents = new Map((RESEARCH.entities || []).map(e => [e.entity_id, e]));
  const edge = x => RESEARCH.graph_edges.push(Object.assign({ jurisdiction: 'US', amount_usd: null }, x));
  function person(p) {
    const id = 'bioguide:' + p.bioguide;
    const have = ents.get(id);
    if (have) return have.legal_or_reported_name;
    const label = (NAMES[p.bioguide] || p.name) + ' (' + p.party + '-' + p.st + ')';
    const e = { entity_id: id, legal_or_reported_name: label, entity_type: 'member_of_Congress', jurisdiction: p.st,
      registry_identifier: 'Bioguide ' + p.bioguide, source_url: 'https://bioguide.congress.gov/search/bio/' + p.bioguide,
      notes: 'Member of Congress. Page on this site: ' + p.page };
    RESEARCH.entities.push(e); ents.set(id, e);
    return label;
  }
  function entity(id, name, type, src, notes) {
    if (ents.has(id)) return;
    const e = { entity_id: id, legal_or_reported_name: name, entity_type: type, jurisdiction: 'US', source_url: src, notes };
    RESEARCH.entities.push(e); ents.set(id, e);
  }
  (U.bills || []).forEach(b => {
    const id = 'UPC-' + b.slug + '-';
    entity('bill:' + b.slug, b.hub, 'upcoming bill', b.record, 'Coming up for a vote. Page on this site: ' + b.page);
    if (b.sponsor) {
      const who = person(b.sponsor);
      edge({ id: id + 'SP', from_name: who, from_entity_id: 'bioguide:' + b.sponsor.bioguide, to_name: b.hub, date: b.introduced,
        date_kind: 'sponsorship_date', edge_type: 'bill_sponsor_nonfinancial', confidence: 'official_bill_record;matched_by_bioguide_id',
        source_url: b.record, notes: who + ' sponsored ' + b.number + ', from the Library of Congress bill record. A sponsorship is not a payment.' });
      if (b.campaign) {
        edge({ id: id + 'CC', from_name: b.campaign.name, to_name: who, date: b.campaign.through, date_kind: 'fec_totals_through_date',
          edge_type: 'principal_campaign_committee_nonfinancial', confidence: 'official_fec_record', source_url: b.campaign.fec,
          notes: b.campaign.name + ' is the campaign committee of ' + who + '. It reported ' + b.campaign.receipts + ' in receipts for 2025 to 2026, from all donors (FEC). Not money tied to this bill.' });
      }
    }
    (b.committees || []).forEach((c, i) => {
      entity('committee:' + c.toLowerCase().replace(/[^a-z0-9]+/g, '-'), c.toUpperCase(), 'congressional committee', b.record, 'A committee of Congress.');
      edge({ id: id + 'CM-' + i, from_name: c.toUpperCase(), to_name: b.hub, date: b.introduced, date_kind: 'referral_date',
        edge_type: 'committee_referral_nonfinancial', confidence: 'official_bill_record', source_url: b.record,
        notes: b.number + ' was sent to the ' + c + ', from the Library of Congress bill record.' });
    });
    (b.lobby || []).forEach((f, i) => {
      edge({ id: id + 'LB-' + i, from_name: f.client, to_name: b.hub, date: f.end, date_kind: 'lobbying_report_period_end',
        edge_type: 'lobbying_report_names_bill_nonfinancial', confidence: 'official_lda_filing', source_url: f.url,
        notes: f.client + ' lobbied on ' + b.number + ' (' + f.period + ' report, filed by ' + f.registrant + '): "' + f.text + '". ' + f.money });
      if (f.registrant !== f.client && f.income) {
        edge({ id: id + 'LF-' + i, from_name: f.client, to_name: f.registrant, amount_usd: f.income, date: f.end, date_kind: 'lobbying_report_period_end',
          edge_type: 'lobbying_fee_reported', confidence: 'official_lda_filing', source_url: f.url,
          notes: f.registrant + ' reported this income from ' + f.client + ' for lobbying in the ' + f.period + ' report, for every issue on the report, not only ' + b.number + '.' });
      }
    });
  });
  function mount() {
    if (typeof hubs === 'undefined') return;
    let added = false;
    (U.bills || []).forEach(b => { if (!hubs.includes(b.hub)) { hubs.push(b.hub); added = true; } });
    if (added && typeof prepareHubRefresh === 'function') prepareHubRefresh();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
})();
