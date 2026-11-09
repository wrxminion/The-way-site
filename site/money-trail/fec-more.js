// D262 (Nov 2026): every FEC committee on the Money Trail, not only the large ones.
// fec-data.js (loaded with the page) holds the large committees on every side. Every other committee and candidate
// campaign with money in the FEC files is in fec-more/NNN.json (made by tools/money-trail/add_fec_batch.py), with the same
// rule and the same depth. This file:
//   1. before app.js runs: when the link says ?fec=C00123456 (up to 8, comma separated), it loads those committees'
//      own filings and adds them to the data, so the web, the trackers and the inspector show them like any other;
//   2. after the page is up: the two search boxes also look in fec-more/index.json (loaded on the first search only)
//      and list matching committees, each a link that opens it in the Money web;
//   3. the inspector offers "Open its own FEC filings" for a dot whose own filings are in fec-more.
// Text goes in with textContent. No inline script (CSP).
(function () {
  if (typeof FEC_FILINGS === 'undefined' || !FEC_FILINGS.meta || !FEC_FILINGS.meta.more) return;
  const F0 = FEC_FILINGS, MORE = F0.meta.more, V = String(F0.meta.updated || '').replace(/\D/g, '') + 'n' + MORE.records;
  const BASE = '/money-trail/fec-more/', SHARDS = MORE.shards || 256;
  const IMG = 'https://docquery.fec.gov/cgi-bin/fecimg/?', NI = 'No inference of coordination or misconduct.';
  const CN = 'Committee whose FEC filings were pulled for the Money Trail. Records are its largest itemized receipts from groups, its largest payments and its largest independent expenditures, with the same depth for every committee.';
  const ON = 'Named on an FEC filing of a committee in the Money Trail.';
  const NN = 'Name as written on the filing. A group with the same name elsewhere is not proven to be the same group.';
  const normU = s => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const CRC = (() => { const t = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = s => { let c = 0xFFFFFFFF; for (let i = 0; i < s.length; i++) c = CRC[(c ^ s.charCodeAt(i)) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  const shardOf = cid => String(crc32(cid) % SHARDS).padStart(3, '0');

  // The same rebuild as the end of fec-data.js, for one shard and only the committees asked for.
  function expand(D, want) {
    const S = D.s, E = D.e, cm = new Set(D.committees.map(c => c.committee_id));
    const tx = D.rows.filter(r => want.has(r[12])).map(r => {
      const [sub, src, rec, amt, day, act, img, fil, amd, nh, npl, nd, cid, dk, conf] = r, tid = 'FEC-' + sub, s = S[src], t = S[rec];
      return { transaction_id: tid, source_entity_id: s, recipient_entity_id: t, source_name: E[s][0], recipient_name: E[t][0], amount_usd: amt,
        transaction_date: day, date_kind: S[dk], cycle: '2026', jurisdiction: 'US / FEC filing', activity_type: S[act],
        filing_url: img && /^[0-9]/.test(img) ? IMG + img : img, filing_id: fil < 0 ? S[-fil - 1] : S[fil] + '; sub_id ' + sub, confidence: S[conf],
        amendment_status: S[amd], notes: npl < 0 ? S[nh] : S[nh] + (S[npl] ? 'Address on the filing: ' + S[npl] + '. ' : '') + (S[nd] ? 'Description on the filing: ' + S[nd] + '. ' : '') + NI,
        evidence_tier: 'fec_filing', record_kind: 'transaction', event_date: day, event_id: tid, fec_committee_id: cid };
    });
    const used = new Set(); tx.forEach(t => { used.add(t.source_entity_id); used.add(t.recipient_entity_id); }); want.forEach(c => used.add('fec:' + c));
    const ents = [...used].filter(id => E[id]).map(id => {
      const v = E[id], c = id.slice(0, 4) === 'fec:' ? id.slice(4) : '';
      return { entity_id: id, legal_or_reported_name: v[0], entity_type: S[v[1]], jurisdiction: 'US', registry_identifier: c ? 'FEC ' + c : '',
        source_url: c ? 'https://www.fec.gov/data/committee/' + c + '/' : '', notes: v.length > 2 ? S[v[2]] : (cm.has(c) ? CN : c ? ON : NN) };
    });
    return { tx, ents, committees: D.committees.filter(c => want.has(c.committee_id)) };
  }

  // ---- 1. ?fec= : load before app.js reads the data (a small synchronous request, so every view sees the same data)
  const q = new URLSearchParams(location.search);
  const ids = [...new Set((q.get('fec') || '').toUpperCase().split(',').filter(x => /^C\d{8}$/.test(x)))].slice(0, 8);
  const loaded = new Set();
  if (ids.length && typeof RESEARCH !== 'undefined') {
    const by = {}; ids.forEach(c => (by[shardOf(c)] ??= new Set()).add(c));
    const haveT = new Set(RESEARCH.transactions.map(x => x.transaction_id)), haveE = new Map(RESEARCH.entities.map((x, i) => [x.entity_id, i]));
    Object.entries(by).forEach(([sh, want]) => {
      try {
        const x = new XMLHttpRequest(); x.open('GET', BASE + sh + '.json?v=' + V, false); x.send();
        if (x.status !== 200) return;
        const got = expand(JSON.parse(x.responseText), want);
        got.tx.forEach(t => { if (!haveT.has(t.transaction_id)) { haveT.add(t.transaction_id); RESEARCH.transactions.push(t); } });
        got.ents.forEach(e => {
          const own = want.has(e.entity_id.slice(4)) && e.entity_id.slice(0, 4) === 'fec:';
          if (!haveE.has(e.entity_id)) { haveE.set(e.entity_id, RESEARCH.entities.length); RESEARCH.entities.push(e); }
          else if (own) RESEARCH.entities[haveE.get(e.entity_id)] = e; // its own filings are here now
        });
        got.committees.forEach(c => { loaded.add(c.committee_id); (RESEARCH.meta.fec_more_loaded ??= []).push(c.name); });
      } catch (e) { /* the page still works with the large committees only */ }
    });
  }

  // ---- 2 and 3. after the page is up
  let index = null, indexP = null;
  const getIndex = () => indexP || (indexP = fetch(BASE + 'index.json?v=' + V).then(r => r.ok ? r.json() : null).then(d => {
    index = d && d.c ? d.c.map(r => ({ id: r[0], name: r[1], money: r[2], kind: (d.kinds || [])[r[3]] || '', lines: r[4], cand: r[5] || '', key: normU(r[1]) + '|' + normU(r[5] || '') })) : [];
    return index;
  }).catch(() => (index = [])));
  const shortMoney = n => n >= 1e6 ? '$' + (n / 1e6).toLocaleString('en-US', { maximumFractionDigits: 1 }) + 'm' : n >= 1e3 ? '$' + Math.round(n / 1e3) + 'k' : '$' + n;
  const openHref = (id, name) => {
    const u = new URLSearchParams(location.search), have = (u.get('fec') || '').toUpperCase().split(',').filter(x => /^C\d{8}$/.test(x) && x !== id);
    u.set('fec', [...have.slice(-7), id].join(',')); u.set('view', 'network'); u.set('hub', name); u.delete('q');
    return location.pathname + '?' + u.toString();
  };
  const find = text => {
    const words = String(text || '').toUpperCase().split(/\s+/).map(normU).filter(Boolean);
    if (!index || !words.join('') || words.join('').length < 3) return [];
    const id = /^C\d{8}$/.test(words[0]) ? words[0] : '';
    return index.filter(c => !loaded.has(c.id) && (id ? c.id === id : words.every(w => c.key.includes(w)))).slice(0, 8);
  };
  const hitList = (hits, total, cls) => {
    const wrap = document.createElement('div'); wrap.className = 'fec-more-list ' + (cls || '');
    const h = document.createElement('div'); h.className = 'fec-more-head';
    h.textContent = 'More FEC committees' + (total > hits.length ? ' (' + total + ' match, largest first)' : '') + '. Opening one loads its own filings:';
    wrap.append(h);
    hits.forEach(c => {
      const a = document.createElement('a'); a.className = 'mt-web-hit fec-more-hit'; a.href = openHref(c.id, c.name);
      const n1 = document.createElement('span'); n1.className = 'mt-web-hit-name'; n1.textContent = c.name;
      const n2 = document.createElement('span'); n2.className = 'mt-web-hit-size';
      n2.textContent = c.kind + ' · ' + shortMoney(c.money) + ' raised · ' + c.lines + (c.lines === 1 ? ' filing line' : ' filing lines');
      a.append(n1, n2); wrap.append(a);
    });
    return wrap;
  };
  function count(text) {
    const words = String(text || '').toUpperCase().split(/\s+/).map(normU).filter(Boolean);
    return index.filter(c => !loaded.has(c.id) && words.every(w => c.key.includes(w))).length;
  }
  function wire() {
    // the Money web search: matches go under the names already in the web
    const box = document.getElementById('web-search'), list = document.getElementById('web-search-results');
    let t1 = 0;
    if (box && list) box.addEventListener('input', () => {
      clearTimeout(t1);
      t1 = setTimeout(() => {
        const v = box.value.trim(); if (v.replace(/\s/g, '').length < 3) return;
        getIndex().then(() => {
          if (box.value.trim() !== v) return;
          list.querySelectorAll('.fec-more-list').forEach(x => x.remove());
          const hits = find(v); if (!hits.length) return;
          list.querySelectorAll('.mt-web-none').forEach(x => x.remove());
          list.append(hitList(hits, count(v))); list.hidden = false; box.setAttribute('aria-expanded', 'true');
        });
      }, 250);
    });
    // the Filter the evidence search: a short list under the box
    const s = document.getElementById('search');
    if (s) {
      const holder = document.createElement('div'); holder.className = 'fec-more-under'; holder.setAttribute('aria-live', 'polite');
      (s.closest('.field') || s.parentNode).append(holder);
      let t2 = 0;
      const under = () => {
        const v = s.value.trim(); holder.replaceChildren(); if (v.replace(/\s/g, '').length < 3) return;
        getIndex().then(() => { if (s.value.trim() !== v) return; const hits = find(v).slice(0, 5); holder.replaceChildren(); if (hits.length) holder.append(hitList(hits, count(v))); });
      };
      s.addEventListener('input', () => { clearTimeout(t2); t2 = setTimeout(under, 300); });
      if (q.get('q') && !ids.length) setTimeout(under, 0); // a search from the front page (?q=) also looks here
    }
    // the inspector: a dot whose own filings are in fec-more gets a link that opens them
    const more = new Map();
    (RESEARCH.entities || []).forEach(e => { if (/^fec:C\d{8}$/.test(e.entity_id) && /load when you open it/.test(e.notes || '') && !loaded.has(e.entity_id.slice(4))) more.set(normU(e.legal_or_reported_name), e); });
    const det = document.getElementById('detail-content');
    if (det && more.size) {
      const add = () => {
        const h = det.querySelector('h2.mt-selected'); if (!h || det.querySelector('.fec-more-open')) return;
        const e = more.get(normU(h.textContent)); if (!e) return;
        const p = document.createElement('p'); p.className = 'fec-more-open';
        const a = document.createElement('a'); a.href = openHref(e.entity_id.slice(4), e.legal_or_reported_name); a.textContent = 'Open its own FEC filings in the Money web';
        p.append(a); h.after(p);
      };
      new MutationObserver(add).observe(det, { childList: true }); add();
    }
    // say which committees this link loaded
    if (loaded.size) {
      const note = document.getElementById('network-desc');
      if (note && RESEARCH.meta.fec_more_loaded) {
        const p = document.createElement('p'); p.className = 'fec-more-loaded';
        p.textContent = 'Also loaded for this link: the FEC filings of ' + RESEARCH.meta.fec_more_loaded.join(', ') + '.';
        note.after(p);
      }
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(wire, 0)); else setTimeout(wire, 0);
})();
