// D300 (Nov 2026): former members of Congress who lobby, in the Money web. Data: revolving.js (window.TW_REVOLVING), built by
// tools/money-trail/build_revolving.py from every 2025-2026 lobbying report and registration and the official list of
// members of Congress. Loaded after lobbying-view.js (so lobbying firm dots exist) and before app.js.
// Dots and lines (no money on any of them: a report lists who lobbies, not what each lobbyist was paid):
//   - one dot for former members of Congress who lobby; a line to it from each of the former members on the most clients;
//   - from each of those former members to the lobbying firms the reports list them at, same ids as the Lobbying tracker.
(function () {
  'use strict';
  const R = window.TW_REVOLVING;
  if (!R || typeof RESEARCH === 'undefined') return;
  const M = R.meta;
  const ents = new Map((RESEARCH.entities || []).map(e => [e.entity_id, e]));
  const addE = e => { if (!ents.has(e.entity_id)) { ents.set(e.entity_id, e); RESEARCH.entities.push(e); } return ents.get(e.entity_id); };
  const edge = x => RESEARCH.graph_edges.push(Object.assign({ jurisdiction: 'US', amount_usd: null }, x));
  const PAGE = '/money-trail/?view=revolving';
  const HUB = 'FORMER MEMBERS OF CONGRESS WHO LOBBY (REVOLVING DOOR TRACKER)', HID = 'revolving:former-members';
  const PARTY = { R: 'Republican', D: 'Democrat', I: 'Independent' };
  const slug = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
  window.TW_REVOLVING_HUB = {};
  addE({ entity_id: HID, legal_or_reported_name: HUB, entity_type: 'Former members of Congress who lobby (Revolving door tracker)', jurisdiction: 'US', registry_identifier: '',
    source_url: M.sources[0][1], notes: M.tot.members + ' former members of Congress are listed as lobbyists in 2025-2026 lobbying reports or registrations (' +
      Object.entries(M.party).map(([p, n]) => n + ' ' + (PARTY[p] || p) + (n === 1 ? '' : 's')).join(', ') + '). Page on this site: michiinstitute.com' + PAGE });
  R.members.slice(0, M.web).forEach(m => {
    const name = m.n.toUpperCase() + ' (FORMER ' + (m.ch === 'Senate' ? 'SENATOR' : m.ch === 'House' ? 'REPRESENTATIVE' : 'MEMBER OF CONGRESS') + ', LOBBYIST)';
    const id = 'revolving:' + m.bio, eid = 'REV-' + m.bio + '-';
    window.TW_REVOLVING_HUB[m.bio] = name;
    addE({ entity_id: id, legal_or_reported_name: name, entity_type: 'Former member of Congress who lobbies (Revolving door tracker)', jurisdiction: m.st, registry_identifier: 'Bioguide ' + m.bio,
      source_url: 'https://bioguide.congress.gov/search/bio/' + m.bio, notes: m.n + ', ' + (PARTY[m.p] || m.p) + ', ' + m.st + ', ' + m.ch + ' ' + m.y0 + '-' + m.y1 +
        '. Listed as a lobbyist for ' + m.cn + ' client' + (m.cn === 1 ? '' : 's') + ' in 2025-2026. Job as filed: "' + m.cp + '". On the Revolving door tracker: michiinstitute.com' + PAGE + '#rev-' + m.bio });
    edge({ id: eid + 'HUB', from_name: name, from_entity_id: id, to_name: HUB, to_entity_id: HID, date: '2025-2026', date_kind: 'lobbying_reports',
      edge_type: 'former_member_registered_lobbyist_nonfinancial', confidence: 'official LD-1 and LD-2 reports;name matched to the Bioguide list', source_url: M.sources[1][1],
      notes: m.n + ' served in the ' + m.ch + ' (' + m.y0 + '-' + m.y1 + ') and is listed as a lobbyist in 2025-2026 reports. This line carries no money.' });
    m.f.forEach((f, i) => {
      const rid = R.rid[f], fid = rid ? 'lda-registrant:' + rid : 'lobbyfirm:' + slug(f);
      addE({ entity_id: fid, legal_or_reported_name: f, entity_type: 'lobbying firm', jurisdiction: 'US', registry_identifier: rid ? 'LDA registrant ' + rid : '', source_url: M.sources[1][1],
        notes: 'Registered lobbying firm or group (Lobbying Disclosure Act).' });
      edge({ id: eid + 'FIRM-' + i, from_name: name, from_entity_id: id, to_name: f, to_entity_id: fid, date: '2025-2026', date_kind: 'lobbying_reports',
        edge_type: 'lobbyist_listed_by_firm_nonfinancial', confidence: 'official LD-1 and LD-2 reports', source_url: M.sources[1][1],
        notes: f + ' lists ' + m.n + ' as one of its lobbyists in 2025-2026 reports. A report lists who lobbies; it does not say what each lobbyist is paid, so this line carries no money.' });
    });
  });
  RESEARCH.meta.revolving_hubs = [HUB];

  // The tab and its box, made here before app.js wires every tab.
  const nav = document.querySelector('nav.tabs');
  if (nav && !nav.querySelector('[data-view="revolving"]')) {
    const b = document.createElement('button'); b.className = 'tab'; b.dataset.view = 'revolving'; b.textContent = '⇄ \u00a0 Revolving door tracker';
    nav.insertBefore(b, nav.querySelector('.tabs-helper') || null);
  }
  const center = document.querySelector('.center-panel');
  if (center && !document.getElementById('revolving-view')) { const d = document.createElement('div'); d.id = 'revolving-view'; d.hidden = true; center.append(d); }
})();
