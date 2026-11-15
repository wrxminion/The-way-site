// D280 (Nov 2026): nonprofits in the Money web. Data: nonprofits.js (window.TW_NONPROFITS), built by tools/money-trail/build_nonprofits.py
// from IRS Form 990 returns (IRS e-file XML). Loaded after data.js and fec-data.js and before app.js, so the lines join the web.
// Each group is one dot. When FEC filings already on the web name the group with the same name and state, its 990 lines start
// at that same dot, so its FEC lines and its 990 lines meet. Every other dot is one EIN (one legal group), whatever spelling a return used.
// Lines: Schedule I grants and Schedule C payments to political groups are yearly totals for one recipient, so they are drawn as
// reported figures (dashed) and never added to filing lines. Related groups (Schedule R) are links without money.
(function () {
  'use strict';
  const N = window.TW_NONPROFITS;
  if (!N || typeof RESEARCH === 'undefined') return;
  const PP = 'https://projects.propublica.org/nonprofits/organizations/';
  const byId = new Map(RESEARCH.entities.map(e => [e.entity_id, e]));
  const addE = e => { if (!byId.has(e.entity_id)) { byId.set(e.entity_id, e); RESEARCH.entities.push(e); } return byId.get(e.entity_id); };
  const ein = s => String(s || '').replace(/^(\d{2})(\d{7})$/, '$1-$2');
  const money = n => '$' + Math.round(n).toLocaleString('en-US');
  const year = o => 'the tax year ' + o.begin + ' to ' + o.end;
  window.TW_NONPROFIT_HUB = {};
  const hubs = [];
  const set = new Map(N.orgs.map(o => [o.ein, o]));
  N.orgs.forEach(o => {
    const id = o.web_id, HUB = o.web_name, filing = PP + o.ein.replace(/^0+/, '') + '/' + o.object_id + '/full';
    window.TW_NONPROFIT_HUB[o.ein] = HUB; hubs.push(HUB);
    const type = 'Nonprofit, IRS ' + o.section + (id.slice(0, 4) === 'irs:' ? '' : ' (also named on FEC filings)');
    const note = o.label + ' files IRS Form 990 as a ' + o.section + ' group (EIN ' + ein(o.ein) + '). Its return for ' + year(o) + ' reports ' + money(o.totals.revenue || 0) + ' in revenue and ' + money(o.totals.expenses || 0) + ' in expenses. Donor names are not public.' + (o.web_note ? ' ' + o.web_note : '');
    const ent = addE({ entity_id: id, legal_or_reported_name: HUB, entity_type: type, jurisdiction: 'US', registry_identifier: 'EIN ' + ein(o.ein), source_url: filing, notes: note });
    // A dot first made by fec-data.js keeps its id and name and gains the IRS record.
    ent.entity_type = type; ent.registry_identifier = 'EIN ' + ein(o.ein); ent.source_url = filing; ent.notes = note; ent.nonprofit_ein = o.ein;
    const base = { from_name: HUB, from_entity_id: id, date: o.end, jurisdiction: 'US / IRS Form 990', confidence: 'IRS Form 990 return, as filed', source_url: filing };
    const recip = (x, what) => {
      if (!x.to_id) return undefined;
      addE({ entity_id: x.to_id, legal_or_reported_name: x.to_name, entity_type: x.to_id.slice(0, 4) === 'irs:' ? 'Group named on an IRS Form 990 (' + what + ')' : 'Committee (FEC)', jurisdiction: 'US',
        registry_identifier: x.ein ? 'EIN ' + ein(x.ein) : '', source_url: '', notes: x.to_id.slice(0, 4) === 'irs:' ? 'Named on the Form 990 return of ' + o.label + '. One dot per EIN.' : 'Political committee (FEC).' });
      return x.to_id;
    };
    const seen527 = new Set();
    o.grants.forEach((g, i) => {
      const amt = (g.cash || 0) + (g.noncash || 0);
      if (!(amt > 0)) return;
      if (g.ein) seen527.add(g.ein);
      RESEARCH.graph_edges.push(Object.assign({}, base, { id: 'IRS990-' + o.ein + '-I-' + i, to_name: g.to_name, to_entity_id: recip(g, 'Schedule I grant'), amount_usd: amt,
        date_kind: 'IRS_990_tax_year_total', edge_type: 'irs990_schedule_i_grant_aggregate',
        notes: 'Form 990 Schedule I: ' + o.label + ' reports giving ' + money(amt) + (g.noncash ? ' (' + money(g.cash) + ' cash, ' + money(g.noncash) + ' not cash)' : '') + ' to ' + g.name + (g.ein ? ' (EIN ' + ein(g.ein) + ')' : '') + ' in ' + year(o) + '. Purpose as written: ' + (g.purpose || 'not given') + '. This is one yearly total, not one payment. The same money can also show on FEC filings, so never add the two.' + (g.match === 'fec' ? ' Matched to the FEC committee by its name only.' : g.match === 'fecname' ? ' Matched to a name on FEC filings by name and state.' : '') }));
    });
    (o.politics.p527 || []).forEach((p, i) => {
      const amt = (p.paid || 0) + (p.passed_on || 0);
      if (!(amt > 0) || (p.ein && seen527.has(p.ein))) return; // already drawn as a Schedule I grant to the same EIN
      RESEARCH.graph_edges.push(Object.assign({}, base, { id: 'IRS990-' + o.ein + '-C-' + i, to_name: p.to_name, to_entity_id: recip(p, 'Schedule C political group'), amount_usd: amt,
        date_kind: 'IRS_990_tax_year_total', edge_type: 'irs990_schedule_c_527_payment_aggregate',
        notes: 'Form 990 Schedule C, Part I-C line 5: ' + o.label + ' reports ' + money(p.paid || 0) + ' paid from its own funds' + (p.passed_on ? ' and ' + money(p.passed_on) + ' of gifts it collected and passed on' : '') + ' to the political organization ' + p.name + (p.ein ? ' (EIN ' + ein(p.ein) + ')' : '') + ' in ' + year(o) + '. This is one yearly total, not one payment. The same money can also show on FEC filings, so never add the two.' + (p.match === 'fec' ? ' Matched to the FEC committee by its name only.' : p.match === 'fecname' ? ' Matched to a name on FEC filings by name and state.' : '') }));
    });
    (o.related || []).forEach((r, i) => {
      const other = set.get(r.ein), rid = other ? other.web_id : r.ein ? 'irs:' + r.ein : '', rn = other ? other.web_name : String(r.name).toUpperCase();
      if (rid) addE({ entity_id: rid, legal_or_reported_name: rn, entity_type: 'Related group named on an IRS Form 990 (Schedule R)', jurisdiction: 'US', registry_identifier: r.ein ? 'EIN ' + ein(r.ein) : '', source_url: '', notes: 'Listed as a related group by ' + o.label + '.' });
      RESEARCH.graph_edges.push(Object.assign({}, base, { id: 'IRS990-' + o.ein + '-R-' + i, to_name: rn, to_entity_id: rid || undefined, amount_usd: null,
        date_kind: 'IRS_990_related_as_of_tax_year', edge_type: 'irs990_schedule_r_related_group_nonfinancial',
        notes: 'Form 990 Schedule R: ' + o.label + ' lists ' + r.name + ' (' + (r.kind || 'kind not given') + (r.activity ? ', ' + r.activity.toLowerCase() : '') + ') as a related group' + (r.controlled ? ' that it controls' : '') + '. Being related is not a payment.' }));
    });
  });
  RESEARCH.meta.nonprofits = N.meta;
  RESEARCH.meta.nonprofit_hubs = hubs;
})();
