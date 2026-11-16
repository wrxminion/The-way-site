// D287 (Nov 2026): wars, military actions and non-combat military missions in the Money web. Data: wars.js (window.TW_WARS),
// built by tools/money-trail/build_wars.py from tools/money-trail/wars.json. Loaded after budgets-view.js (so the Department
// of Defense, Army Corps of Engineers and president dots already exist) and before app.js, so these lines join the web.
// Each war or mission is one dot. Lines to it:
//   - its cost, from the department that paid it (dashed: an official or research total, never one payment, never added up);
//   - each president who ordered or carried it on (no money on the line);
//   - the law Congress passed to authorize it, when there is one (no money on the line);
//   - contracts tied to it, from the dot to the company (dashed totals).
// Lives lost are never drawn as lines and never given a dollar value. They are shown only as counts of people, in the
// War tracker tab and in the Evidence inspector (war-tracker.js).
(function () {
  'use strict';
  const W = window.TW_WARS;
  if (!W || typeof RESEARCH === 'undefined') return;
  const ents = new Map((RESEARCH.entities || []).map(e => [e.entity_id, e]));
  const addE = e => { if (!ents.has(e.entity_id)) { ents.set(e.entity_id, e); RESEARCH.entities.push(e); } return ents.get(e.entity_id); };
  const edge = x => RESEARCH.graph_edges.push(Object.assign({ jurisdiction: 'US', amount_usd: null }, x));
  const money = n => '$' + Math.round(n).toLocaleString('en-US');
  const longDate = d => { const p = String(d || '').split('-'); if (p.length < 3) return p[0] || ''; const t = new Date(d + 'T12:00:00Z'); return isNaN(t) ? d : t.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' }); };
  window.TW_WAR_HUB = {};
  const hubs = [];
  W.items.forEach(it => {
    const HUB = it.hub, HID = 'war:' + it.slug, id = 'WAR-' + it.slug + '-', page = '/money-trail/?view=wars#war-' + it.slug;
    window.TW_WAR_HUB[it.slug] = HUB; hubs.push(HUB);
    addE({ entity_id: HID, legal_or_reported_name: HUB, entity_type: it.combat ? 'Military action (War tracker)' : 'Non-combat military mission (War tracker)',
      jurisdiction: 'US', registry_identifier: it.kind_label, source_url: (it.lives[0] || it.money[0] || {}).url || '',
      notes: it.name + '. ' + it.what + ' Lives lost are counted on the War tracker tab as lives, never as money. Page on this site: michiinstitute.com' + page });
    (it.money || []).forEach((m, i) => {
      if (!m.web) return;
      edge({ id: id + 'COST-' + i, from_name: m.from, to_name: HUB, to_entity_id: HID, amount_usd: m.amount, date: m.asof, date_kind: 'total_as_of_date_NOT_a_payment_date',
        edge_type: it.combat ? 'war_cost_total_aggregate' : 'military_mission_cost_total_aggregate', confidence: m.label, source_url: m.url,
        notes: m.what + ' Label: ' + m.label + '. This is a total, not one payment, and is never added to filing lines or to other cost figures.' });
    });
    (it.presidents || []).forEach((p, i) => {
      const pn = 'PRESIDENT ' + p.name.toUpperCase();
      addE({ entity_id: 'president:' + p.slug, legal_or_reported_name: pn, entity_type: 'president_of_the_united_states', jurisdiction: 'US',
        registry_identifier: '', source_url: p.page, notes: 'President of the United States. Page on this site: ' + p.page });
      edge({ id: id + 'PRES-' + i, from_name: pn, to_name: HUB, to_entity_id: HID, date: it.start, date_kind: 'start_of_the_action',
        edge_type: it.combat ? 'president_ordered_or_continued_military_action_nonfinancial' : 'president_in_office_during_mission_nonfinancial',
        confidence: 'dates of office and of the action', source_url: p.page,
        notes: 'President ' + p.name + ' was in office during ' + it.name + (it.combat ? ' and was commander in chief for part or all of it.' : '.') + ' The same rule is used for every president. This line carries no money.' });
    });
    (it.authority || []).forEach((a, i) => {
      const LN = a.name.toUpperCase();
      const LID = 'warlaw:' + a.law.replace(/[^A-Za-z0-9]+/g, '-').toLowerCase();
      addE({ entity_id: LID, legal_or_reported_name: LN, entity_type: 'federal law authorizing military force',
        jurisdiction: 'US', registry_identifier: a.law, source_url: a.url, notes: a.name + ', ' + a.law + ', ' + longDate(a.date) + '. Votes: ' + a.votes + '.' });
      edge({ id: id + 'LAW-' + i, from_name: LN, from_entity_id: LID, to_name: HUB, to_entity_id: HID, date: a.date, date_kind: 'date_signed_into_law', edge_type: 'law_authorizing_military_force_nonfinancial',
        confidence: 'official_record', source_url: a.url, notes: 'Congress passed ' + a.name + ' (' + a.law + '), ' + a.votes + ', signed ' + longDate(a.date) + '. A vote is not a payment.' });
    });
    (it.contracts || []).forEach((c, i) => {
      addE({ entity_id: c.id, legal_or_reported_name: c.hub, entity_type: 'company', jurisdiction: 'US', registry_identifier: '', source_url: c.url,
        notes: c.company + '. Named as a contractor on the War tracker.' });
      edge({ id: id + 'CON-' + i, from_name: HUB, from_entity_id: HID, to_name: c.hub, to_entity_id: c.id, amount_usd: c.amount, date: c.date, date_kind: 'contract_obligations_total_as_reported',
        edge_type: 'war_contract_obligations_aggregate', confidence: 'official report', source_url: c.url,
        notes: c.what + ' A total over years, not one payment. ' + money(c.amount) + ' as reported.' });
    });
  });
  RESEARCH.meta.war_hubs = hubs;
  RESEARCH.meta.wars = { checked: W.checked, count: W.items.length };

  // The tab and its box. Made here so the page file only gains script lines, and before app.js wires every tab.
  const nav = document.querySelector('nav.tabs');
  if (nav && !nav.querySelector('[data-view="wars"]')) {
    const b = document.createElement('button'); b.className = 'tab'; b.dataset.view = 'wars'; b.textContent = '⚑   War tracker';
    const help = nav.querySelector('.tabs-helper');
    nav.insertBefore(b, help || null);
  }
  const center = document.querySelector('.center-panel');
  if (center && !document.getElementById('wars-view')) { const d = document.createElement('div'); d.id = 'wars-view'; d.hidden = true; center.append(d); }
})();
