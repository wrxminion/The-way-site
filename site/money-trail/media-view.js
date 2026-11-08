// D249 (Nov 2026): media companies in the Money web. Data: media.js (window.TW_MEDIA), built by tools/money-trail/build_media.py
// from the FEC 2025-2026 bulk files and from SEC, IRS or the outlet's own records for who owns each outlet.
// Loaded after data.js and fec-data.js and before app.js, so the lines join the Money web like any other record.
// Each company is one dot. Its outlets, its owners and its PAC hang from it on dotted (no money) lines.
// Money lines are single FEC filing rows: political committees paying the company, and the company PAC giving.
(function () {
  'use strict';
  const M = window.TW_MEDIA;
  if (!M || typeof RESEARCH === 'undefined') return;
  const IMG = M.meta.img, CM = M.meta.cmte, names = M.committees || {};
  const seenT = new Set(RESEARCH.transactions.map(t => t.transaction_id));
  const seenE = new Set(RESEARCH.entities.map(e => e.entity_id));
  const addE = e => { if (!seenE.has(e.entity_id)) { seenE.add(e.entity_id); RESEARCH.entities.push(e); } };
  // Same shape as fec-data.js rows, so the Timeline and the Evidence inspector read them like any other FEC record.
  const addT = t => { if (!seenT.has(t.transaction_id)) { seenT.add(t.transaction_id); t.record_kind = 'transaction'; t.event_date = t.transaction_date; t.event_id = t.transaction_id; RESEARCH.transactions.push(t); } };
  const PARTY = { DEM: 'a Democratic', REP: 'a Republican', OTHER: 'another party\'s', NONE: '' };
  const PNAME = { DEM: 'Democratic', REP: 'Republican', OTHER: 'another party', NONE: '' };
  const money = n => '$' + Math.round(n).toLocaleString('en-US');
  window.TW_MEDIA_HUB = {};
  (M.groups || []).forEach(g => {
    const HUB = String(g.name).toUpperCase(), hid = 'media:' + g.id, id = 'MEDIA-' + g.id + '-';
    window.TW_MEDIA_HUB[g.id] = HUB;
    const src = g.source_url || (g.pacs[0] ? CM + g.pacs[0].id + '/' : '');
    addE({ entity_id: hid, legal_or_reported_name: HUB, entity_type: 'media company', jurisdiction: 'US',
      registry_identifier: g.cik ? 'SEC CIK ' + g.cik + (g.ticker ? ' (' + g.ticker + ')' : '') : '', source_url: src,
      notes: 'Media company. Owns ' + g.outlets.join(', ') + '.' + (g.source_kind ? ' Who owns it: ' + g.source_kind + (g.filing_date ? ' filed ' + g.filing_date : '') + '.' : '') + ' Payments to it are matched by the payee name written on each FEC filing.' });
    // Outlets it owns (no money on these lines)
    g.outlets.forEach((o, i) => {
      const on = String(o).toUpperCase();
      RESEARCH.graph_edges.push({ id: id + 'OUT-' + i, from_name: HUB, from_entity_id: hid, to_name: on, to_entity_id: hid + ':outlet-' + i, amount_usd: null, date: g.filing_date || '',
        date_kind: 'ownership_as_of_filing', jurisdiction: 'US', edge_type: 'media_outlet_owned_nonfinancial', confidence: g.source_kind || 'company record', source_url: src,
        notes: g.name + ' owns ' + o + (g.source_kind ? ' (' + g.source_kind + ')' : '') + '. Owning an outlet is not a payment.' });
      addE({ entity_id: hid + ':outlet-' + i, legal_or_reported_name: on, entity_type: 'media outlet', jurisdiction: 'US', registry_identifier: '', source_url: src, notes: o + ' is owned by ' + g.name + '.' });
    });
    // Owners named in the filing (largest holders, as written)
    (g.owners || []).forEach((w, i) => {
      const wn = String(w.name).toUpperCase(), wid = 'mediaowner:' + wn.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const stake = [w.percent != null && w.percent !== '' ? w.percent + (String(w.percent).includes('%') ? '' : '%') + (w['class'] ? ' of ' + w['class'] : '') : '', w.voting_percent ? w.voting_percent + (String(w.voting_percent).includes('%') ? '' : '%') + ' of the votes' : ''].filter(Boolean).join(', ');
      RESEARCH.graph_edges.push({ id: id + 'OWN-' + i, from_name: wn, from_entity_id: wid, to_name: HUB, to_entity_id: hid, amount_usd: null, date: w.as_of || g.filing_date || '',
        date_kind: 'ownership_as_of_filing', jurisdiction: 'US', edge_type: 'media_ownership_stake_nonfinancial', confidence: g.source_kind || 'company record', source_url: g.source_url || '',
        notes: w.name + ' holds ' + (stake || 'a stake') + ' in ' + g.name + (w.as_of ? ' as of ' + w.as_of : '') + ', as written in ' + (g.source_kind || 'the company record') + (w.quote ? ': "' + w.quote + '"' : '') + '. Owning shares is not a payment.' });
      addE({ entity_id: wid, legal_or_reported_name: wn, entity_type: w.person ? 'media_owner_person' : 'media owner', jurisdiction: 'US', registry_identifier: '', source_url: g.source_url || '',
        notes: 'Named as a large holder of ' + g.name + ' in ' + (g.source_kind || 'the company record') + '.' });
    });
    // The company PAC (connected organization on the FEC committee record)
    (g.pacs || []).forEach(p => {
      RESEARCH.graph_edges.push({ id: id + 'PAC-' + p.id, from_name: HUB, from_entity_id: hid, to_name: p.name, to_entity_id: 'fec:' + p.id, amount_usd: null, date: '',
        date_kind: 'committee_registration', jurisdiction: 'US', edge_type: 'media_company_pac_nonfinancial', confidence: 'FEC committee record', source_url: CM + p.id + '/',
        notes: 'The FEC committee record for ' + p.name + ' names ' + (p.connected_org || g.name) + ' as its connected organization. The PAC is paid for by gifts from people who work there; the company itself may not give to candidates.' });
      addE({ entity_id: 'fec:' + p.id, legal_or_reported_name: p.name, entity_type: 'PAC (FEC, company PAC of a media company)', jurisdiction: 'US', registry_identifier: 'FEC ' + p.id, source_url: CM + p.id + '/',
        notes: 'Company PAC. Connected organization on the FEC record: ' + (p.connected_org || 'not listed') + '.' });
    });
    // Political committees paying the company: [kind, cmte, payee, amount, date, purpose, image, sub, side, state]
    (g.rows || []).forEach(r => {
      const [k, cm, payee, amt, date, purpose, img, sub, sd] = r, cn = names[cm] || cm, ie = k === 'E';
      addE({ entity_id: 'fec:' + cm, legal_or_reported_name: cn, entity_type: 'Committee (FEC)', jurisdiction: 'US', registry_identifier: 'FEC ' + cm, source_url: CM + cm + '/', notes: 'Political committee that paid a media company (FEC filing).' });
      addT({ transaction_id: (ie ? 'FEC-IE-' : 'FEC-') + sub, source_entity_id: 'fec:' + cm, recipient_entity_id: hid, source_name: cn, recipient_name: HUB, amount_usd: amt,
        transaction_date: date, date_kind: 'FEC_reported_disbursement_date', cycle: M.meta.cycle, jurisdiction: 'US / FEC filing',
        activity_type: ie ? 'FEC Schedule E: independent expenditure paid to a media company' : 'FEC Schedule B: payment to a media company',
        filing_url: img ? IMG + img : CM + cm + '/', filing_id: 'FEC image ' + (img || 'not listed') + '; ' + (ie ? 'file-transaction ' : 'sub_id ') + sub,
        confidence: 'FEC bulk data record (one filing line)', evidence_tier: 'fec_filing',
        notes: 'Payee as written on the filing: ' + payee + '. Purpose as written: ' + (purpose || 'not given') + '.' + (PARTY[sd] ? ' The FEC record lists the payer as ' + PARTY[sd] + ' committee.' : '') + ' Matched to ' + g.name + ' by the payee name only.' });
    });
    // The company PAC giving: [kind C=candidate committee M=other committee, pac, other_id, name, amount, date, candidate, image, sub, side, type]
    (g.pac_rows || []).forEach(r => {
      const [k, pac, oid, who, amt, date, cand, img, sub, sd] = r, pn = names[pac] || pac;
      const rid = oid ? 'fec:' + oid : 'fecname:' + String(who).toUpperCase().replace(/[^A-Z0-9]+/g, '_');
      addE({ entity_id: rid, legal_or_reported_name: who, entity_type: k === 'C' ? 'Candidate committee (FEC)' : 'Committee (FEC)', jurisdiction: 'US', registry_identifier: oid ? 'FEC ' + oid : '', source_url: oid ? CM + oid + '/' : '',
        notes: k === 'C' && cand ? 'Committee of candidate ' + cand + '.' : 'Political committee (FEC).' });
      addT({ transaction_id: 'FEC-' + sub, source_entity_id: 'fec:' + pac, recipient_entity_id: rid, source_name: pn, recipient_name: who, amount_usd: amt,
        transaction_date: date, date_kind: 'FEC_reported_disbursement_date', cycle: M.meta.cycle, jurisdiction: 'US / FEC filing',
        activity_type: k === 'C' ? 'FEC: company PAC gift to a candidate committee' : 'FEC: company PAC gift to another committee',
        filing_url: img ? IMG + img : CM + pac + '/', filing_id: 'FEC image ' + (img || 'not listed') + '; sub_id ' + sub,
        confidence: 'FEC bulk data record (one filing line)', evidence_tier: 'fec_filing',
        notes: (cand ? 'Candidate: ' + cand + '. ' : '') + (PNAME[sd] ? 'Party on the FEC record: ' + PNAME[sd] + '. ' : '') + 'Gift of ' + money(amt) + ' from the company PAC, as filed.' });
    });
  });
  RESEARCH.meta.media = M.meta;
})();
