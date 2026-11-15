// D272 (Nov 2026): people who gave money to federal committees, on the Money web.
// donors.js (made by tools/money-trail/build_donors.py from the FEC individual contributions file) holds the people who
// gave $1,000,000 or more in all; they load with the page. People who gave $25,000 or more are in donors/NN.json and load
// only when someone searches for a person or opens one. The same dollar line for every side and every party.
// This file:
//   1. before app.js runs: adds each person as a dot, with one line per committee and year (gifts added together), and
//      when the link says ?donor=P1234abcd (up to 8, comma separated) it loads those people from donors/ first;
//   2. after the page is up: the two search boxes and the Person tracker's Find a person box also look in
//      donors/index.json (loaded on the first search only) and list matching people, each a link that opens them.
// Name, city, state, employer and occupation as filed. ZIP codes are not in these files. There is no download of the list.
// Text goes in with textContent. No inline script (CSP).
(function () {
  const D0 = window.TW_DONORS;
  if (!D0 || !D0.meta || typeof RESEARCH === 'undefined') return;
  const M = D0.meta, BASE = '/money-trail/donors/', SHARDS = 64, V = M.v || '1';
  const IMG = 'https://docquery.fec.gov/cgi-bin/fecimg/?';
  const LAW = 'From FEC public filings. Federal law bars using donor names from these filings to ask for money or for business (52 U.S.C. 30111(a)(4)).';
  const MATCH = 'Spellings are put together only when the name, the state and the ZIP code or employer on the filings match; that does not prove they are one person.';
  const NI = 'No inference of coordination or misconduct.';
  const TYPE = { X: 'Party - Nonqualified', Y: 'Party - Qualified', Z: 'National Party Nonfederal Account', N: 'PAC - Nonqualified', Q: 'PAC - Qualified',
    O: 'Super PAC (Independent Expenditure-Only)', U: 'Single-candidate independent expenditure', V: 'Hybrid PAC (with Non-Contribution Account) - Nonqualified',
    W: 'Hybrid PAC (with Non-Contribution Account) - Qualified', I: 'Independent expenditor (person or group)', C: 'Communication cost',
    E: 'Electioneering communication', D: 'Delegate committee', H: 'House candidate campaign', S: 'Senate candidate campaign', P: 'Presidential candidate campaign' };
  const money = n => '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const day = d => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d || ''); return m ? new Date(+m[1], +m[2] - 1, +m[3]).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''; };
  const title = s => String(s || '').toLowerCase().replace(/\b[a-z]/g, c => c.toUpperCase());
  const fecSearch = (name, st) => 'https://www.fec.gov/data/receipts/individual-contributions/?contributor_name=' + encodeURIComponent(name) +
    (st ? '&contributor_state=' + encodeURIComponent(st) : '') + '&two_year_transaction_period=2026';
  const CRC = (() => { const t = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = s => { let c = 0xFFFFFFFF; for (let i = 0; i < s.length; i++) c = CRC[(c ^ s.charCodeAt(i)) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  const shardOf = id => String(crc32(id) % SHARDS).padStart(2, '0');

  const haveT = new Set(RESEARCH.transactions.map(x => x.transaction_id));
  const ents = new Map(RESEARCH.entities.map(x => [x.entity_id, x]));
  // One person record from the files: [id, name, city, state, employer, occupation, total, gifts, committees, spellings, lines]
  // and each line: [committee ID, year, amount, gifts, largest gift, its filing image, first date, last date].
  function add(r, C) {
    const [id, name, city, st, emp, occ, total, gifts, ncm, spell, lines] = r, eid = 'fecind:' + id;
    const where = [title(city), st].filter(Boolean).join(', ');
    if (!ents.has(eid)) {
      const e = { entity_id: eid, legal_or_reported_name: name, entity_type: 'Person who gave to federal committees (FEC individual contributions)',
        jurisdiction: where || 'US', registry_identifier: 'None: the FEC gives people no ID', source_url: fecSearch(name, st), donor: true,
        notes: 'Gave ' + money(total) + ' in ' + gifts + (gifts === 1 ? ' itemized gift' : ' itemized gifts') + ' to ' + ncm + (ncm === 1 ? ' federal committee' : ' federal committees') +
          ' in 2025 and 2026, as filed with the FEC (individual contributions file dated ' + day(M.file_date) + ').' +
          (lines.length < ncm ? ' The web shows the ' + new Set(lines.map(x => x[0])).size + ' committees that got the most.' : '') +
          ' City and state: ' + (where || 'not on the filing') + '. Employer as filed: ' + (emp || 'not on the filing') + '. Occupation as filed: ' + (occ || 'not on the filing') + '.' +
          (spell && spell.length > 1 ? ' Spellings on the filings: ' + spell.join('; ') + '.' : '') + ' ' + MATCH + ' ' + LAW };
      ents.set(eid, e); RESEARCH.entities.push(e);
    }
    lines.forEach(([cid, yr, amt, n, big, img, first, last]) => {
      const tid = 'FEC-IND' + id + cid + yr; if (!(amt > 0) || haveT.has(tid)) return; haveT.add(tid);
      const rid = 'fec:' + cid, c = C[cid] || ['FEC COMMITTEE ' + cid, ''];
      let to = ents.get(rid);
      if (!to) {
        to = { entity_id: rid, legal_or_reported_name: c[0], entity_type: TYPE[c[1]] || 'FEC-registered committee', jurisdiction: 'US', registry_identifier: 'FEC ' + cid,
          source_url: 'https://www.fec.gov/data/committee/' + cid + '/', notes: 'Named on an FEC filing as a committee that a person on the Money Trail gave to.' };
        ents.set(rid, to); RESEARCH.entities.push(to);
      }
      const span = first && last && first !== last ? day(first) + ' to ' + day(last) : day(last || first);
      RESEARCH.transactions.push({ transaction_id: tid, source_entity_id: eid, recipient_entity_id: rid, source_name: name, recipient_name: to.legal_or_reported_name,
        amount_usd: amt, transaction_date: last || (yr !== 'none' ? yr + '-12-31' : ''), date_kind: 'Latest date among the gifts added together', cycle: '2026',
        jurisdiction: 'US / FEC filing', activity_type: 'FEC: Gifts from one person, added together (individual contributions)',
        filing_url: /^\d{11,18}$/.test(img || '') ? IMG + img : fecSearch(name, st) + '&committee_id=' + cid,
        filing_id: n + (n === 1 ? ' gift' : ' gifts') + (img ? '; the link opens the filing with the largest one (' + money(big) + ')' : ''),
        confidence: 'FEC itemized record from the FEC bulk data files', amendment_status: '',
        notes: n + (n === 1 ? ' gift' : ' gifts') + ' from ' + name + ' to ' + to.legal_or_reported_name + (span ? ' (' + span + ')' : '') + ', added together here, from the FEC individual contributions file dated ' +
          day(M.file_date) + '. ' + LAW + ' ' + NI,
        evidence_tier: 'fec_filing', record_kind: 'transaction', event_date: last || '', event_id: tid, fec_committee_id: cid });
    });
    return name;
  }
  D0.d.forEach(r => add(r, D0.c));

  // ---- ?donor= : load before app.js reads the data (a small synchronous request, so every view sees the same data)
  const q = new URLSearchParams(location.search);
  const ids = [...new Set((q.get('donor') || '').split(',').filter(x => /^P[0-9a-f]{8}$/.test(x)))].slice(0, 8);
  const loaded = new Set(D0.d.map(r => r[0]));
  const names = [];
  if (ids.length) {
    const by = {}; ids.forEach(id => (by[shardOf(id)] ??= new Set()).add(id));
    Object.entries(by).forEach(([sh, want]) => {
      try {
        const x = new XMLHttpRequest(); x.open('GET', BASE + sh + '.json?v=' + V, false); x.send();
        if (x.status !== 200) return;
        const S = JSON.parse(x.responseText);
        S.d.filter(r => want.has(r[0])).forEach(r => { loaded.add(r[0]); names.push([r[0], add(r, S.c)]); });
      } catch (e) { /* the page still works with the people who gave $1 million or more */ }
    });
    const first = ids.map(id => names.find(n => n[0] === id)).find(Boolean);
    if (first && !q.get('hub') && history.replaceState) {
      q.set('hub', first[1]); if (!q.get('view')) q.set('view', 'network');
      try { history.replaceState(history.state, '', location.pathname + '?' + q.toString() + location.hash); } catch (err) { /* keep the page as it is */ }
    }
  }
  RESEARCH.meta.donors = { file_date: M.file_date, main_line: M.main_line, search_line: M.search_line, people_main: M.people_main, people_search: M.people_search,
    dollars_main: M.dollars_main, loaded: names.length };

  // ---- 2. after the page is up: search lists
  let index = null, indexP = null;
  const normU = s => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const getIndex = () => indexP || (indexP = fetch(BASE + 'index.json?v=' + V).then(r => r.ok ? r.json() : null).then(d => {
    index = d && d.d ? d.d.map(r => ({ id: r[0], name: r[1], city: r[2], st: r[3], total: r[4], cms: r[5], key: normU(r[1]) + '|' + normU(r[3]) })) : [];
    return index;
  }).catch(() => (index = [])));
  const shortMoney = n => n >= 1e6 ? '$' + (n / 1e6).toLocaleString('en-US', { maximumFractionDigits: 1 }) + 'm' : n >= 1e3 ? '$' + Math.round(n / 1e3) + 'k' : '$' + n;
  const words = text => String(text || '').toUpperCase().split(/[\s,]+/).map(normU).filter(Boolean);
  const matches = text => { const w = words(text); if (w.join('').length < 3) return []; return index.filter(p => !loaded.has(p.id) && w.every(x => p.key.includes(x))); };
  const openHref = p => {
    const u = new URLSearchParams(location.search), have = (u.get('donor') || '').split(',').filter(x => /^P[0-9a-f]{8}$/.test(x) && x !== p.id);
    u.set('donor', [...have.slice(-7), p.id].join(',')); u.set('view', 'network'); u.set('hub', p.name); u.delete('q');
    return location.pathname + '?' + u.toString();
  };
  function hitList(text, max) {
    const all = matches(text); if (!all.length) return null;
    const wrap = document.createElement('div'); wrap.className = 'fec-more-list donor-more-list';
    const h = document.createElement('div'); h.className = 'fec-more-head';
    h.textContent = 'People who gave $' + Number(M.search_line).toLocaleString('en-US') + ' or more to federal committees' + (all.length > max ? ' (' + all.length + ' match, largest first)' : '') + '. Opening one loads their gifts:';
    wrap.append(h);
    all.slice(0, max).forEach(p => {
      const a = document.createElement('a'); a.className = 'mt-web-hit fec-more-hit'; a.href = openHref(p);
      const n1 = document.createElement('span'); n1.className = 'mt-web-hit-name'; n1.textContent = p.name;
      const n2 = document.createElement('span'); n2.className = 'mt-web-hit-size';
      n2.textContent = [title(p.city), p.st].filter(Boolean).join(', ') + ' · gave ' + shortMoney(p.total) + ' to ' + p.cms + (p.cms === 1 ? ' committee' : ' committees');
      a.append(n1, n2); wrap.append(a);
    });
    const law = document.createElement('div'); law.className = 'donor-law'; law.textContent = LAW; wrap.append(law);
    return wrap;
  }
  function under(input, holder, max, after) {
    let t = 0;
    const go = () => {
      const v = input.value.trim(); holder.replaceChildren(); if (v.replace(/\s/g, '').length < 3) return;
      getIndex().then(() => { if (input.value.trim() !== v) return; holder.replaceChildren(); const l = hitList(v, max); if (l) { holder.append(l); if (after) after(); } });
    };
    input.addEventListener('input', () => { clearTimeout(t); t = setTimeout(go, 300); });
    return go;
  }
  function wire() {
    // the Money web search: people go under the names already in the web and the FEC committees
    const box = document.getElementById('web-search'), list = document.getElementById('web-search-results');
    if (box && list) {
      const holder = document.createElement('div'); holder.className = 'donor-more-under';
      under(box, holder, 8, () => { if (!holder.isConnected || holder.parentNode !== list) list.append(holder); list.querySelectorAll('.mt-web-none').forEach(x => x.remove()); list.hidden = false; box.setAttribute('aria-expanded', 'true'); });
    }
    // the Filter the evidence search
    const s = document.getElementById('search');
    if (s) {
      const holder = document.createElement('div'); holder.className = 'fec-more-under donor-more-under'; holder.setAttribute('aria-live', 'polite');
      (s.closest('.field') || s.parentNode).append(holder);
      const go = under(s, holder, 5);
      if (q.get('q') && !ids.length) setTimeout(go, 0);
    }
    // the Person tracker's Find a person box (made by app.js when the tracker opens)
    const hook = () => {
      const inp = document.querySelector('#people-view .tracker-search input');
      if (!inp || inp.__donors) return; inp.__donors = true;
      const holder = document.createElement('div'); holder.className = 'donor-more-under donor-tracker-under'; holder.setAttribute('aria-live', 'polite');
      inp.closest('.tracker-search').after(holder);
      under(inp, holder, 8, () => document.querySelectorAll('#people-view .tracker-list .empty').forEach(x => x.remove()));
    };
    const pv = document.getElementById('people-view');
    if (pv) { hook(); new MutationObserver(hook).observe(pv, { childList: true, subtree: true }); }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire); else setTimeout(wire, 0);
})();
