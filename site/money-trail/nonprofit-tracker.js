// D280 (Nov 2026): the Nonprofit tracker tab (?view=nonprofits), the Form 990 box in the Evidence inspector, and plain labels
// for the Form 990 lines. One card per group: what its latest reachable IRS Form 990 return reports, with links to the return
// and to the group's own trail page (nonprofits.html?ein=...). Data: nonprofits.js (window.TW_NONPROFITS). Loaded after app.js.
// Text goes in with textContent. Nothing here is estimated, and donor names are never shown because the returns do not have them.
(function () {
  'use strict';
  const N = window.TW_NONPROFITS, HUB = window.TW_NONPROFIT_HUB || {};
  const box = document.getElementById('nonprofits-view');
  if (!N || typeof setView !== 'function') return;
  const PP = 'https://projects.propublica.org/nonprofits/organizations/';
  const el = (tag, cls, text) => { const d = document.createElement(tag); if (cls) d.className = cls; if (text != null) d.textContent = text; return d; };
  const link = (text, href, ext) => { const a = el('a', 'bud-src', text + (ext ? ' ↗' : '')); a.href = href; if (ext) { a.target = '_blank'; a.rel = 'noopener noreferrer'; } return a; };
  const art = src => { const im = document.createElement('img'); im.src = src; im.alt = ''; im.width = 22; im.height = 24; im.className = 'tracker-btn-art'; im.decoding = 'async'; return im; };
  const WEB_ART = '/money-trail/art/money-web-link-blue.webp';
  const filing = o => PP + o.ein.replace(/^0+/, '') + '/' + o.object_id + '/full';
  const ein = s => String(s || '').replace(/^(\d{2})(\d{7})$/, '$1-$2');
  const year = o => o.begin.slice(0, 7).replace('-', '/') + ' to ' + o.end.slice(0, 7).replace('-', '/');
  const pol = o => { const p = o.politics || {}; return Math.max(p.exempt_function_total || 0, p.political_expenditures || 0); };
  const BY_HUB = new Map(N.orgs.map(o => [norm(o.web_name), o]));
  const BY_EIN = new Map(N.orgs.map(o => [o.ein, o]));

  // ---- Plain labels: a Form 990 line is a yearly total for one recipient, not one payment.
  const baseKind = kindLabel;
  kindLabel = function (e) {
    const id = String((e && (e.id || e.event_id)) || '');
    if (e && e.record_kind === 'graph' && /^IRS990-/.test(id)) return /-R-/.test(id) ? 'IRS Form 990: related group (no money on this link)' : 'IRS Form 990: yearly total to one recipient, not one payment';
    return baseKind(e);
  };

  // ---- Evidence inspector: a nonprofit dot shows its Form 990 numbers and a link to its trail page.
  function npBox(o) {
    const T = o.totals, b = el('div', 'mt-about np-about');
    b.append(el('div', 'mt-evcard-head', 'From its IRS Form 990 (' + o.section + ', tax year ' + year(o) + ')'));
    const rows = [['Revenue', T.revenue], ['Gifts and grants received', T.gifts], ['Expenses', T.expenses], ['Grants it paid', T.grants], ['Political spending reported (Schedule C)', pol(o)]];
    const ul = el('ul', 'np-about-list');
    rows.forEach(([k, v]) => { if (v != null) ul.append(el('li', null, k + ': ' + bigMoney(v))); });
    b.append(ul);
    b.append(el('p', 'mt-about-src', 'Donor names are not public: the IRS public copy of the return leaves them out.'));
    const a = el('a', 'detail-link mt-about-site', 'Follow its nonprofit trail →'); a.href = 'nonprofits.html?ein=' + o.ein; b.append(a);
    const f = el('a', 'detail-link mt-about-site', 'Open the return (ProPublica view of the IRS file) ↗'); f.href = filing(o); f.target = '_blank'; f.rel = 'noopener noreferrer'; b.append(f);
    return b;
  }
  const baseDetails = details;
  details = function (e) {
    baseDetails(e);
    if (!e || e.record_kind !== 'entity') return;
    const o = BY_HUB.get(norm(e.name || ''));
    if (!o) return;
    const head = document.querySelector('#detail-content .event-kind');
    if (head) head.after(npBox(o));
  };

  // ---- Footer: where the nonprofit numbers come from.
  const fn = document.getElementById('fec-note');
  if (fn) fn.textContent += ' Nonprofits: ' + N.orgs.length + ' groups, from each one\'s latest IRS Form 990 return we could reach (IRS e-file XML), checked ' + N.meta.checked + '. Their grants and payments to political groups are yearly totals for one recipient, drawn as dashed lines and never added to filing lines. Their donors are not public and are not named.';
  if (!box) return;
  // ---- The tab. Largest revenue first, the same card for every group.
  const G = N.orgs.slice().sort((a, b) => (b.totals.revenue || 0) - (a.totals.revenue || 0));
  function openWeb(name) { graphHub = name; if (!hubs.includes(graphHub)) { hubs.push(graphHub); prepareHubRefresh(); } $('#hub').value = graphHub; graphScale = 1; setView('network'); $('.center-panel').scrollIntoView({ block: 'start', behavior: 'smooth' }); }
  function card(o, max) {
    const T = o.totals, c = el('div', 'tracker-card bud-row np-card'), top = el('div', 'bud-top'), v = T.revenue || 0;
    top.append(el('b', 'bud-big', bigMoney(v)), el('strong', 'bud-name', o.label));
    c.append(top);
    if (v > 0 && max > 0) { const b = el('span', 'bud-bar'), i = el('i'); i.style.width = Math.max(0.5, Math.min(100, 100 * v / max)).toFixed(1) + '%'; b.append(i); c.append(b); }
    c.append(el('small', 'bud-small', 'Revenue in its IRS Form 990 for ' + year(o) + '. ' + o.section + ', EIN ' + ein(o.ein) + ', ' + [o.city, o.state].filter(Boolean).join(', ') + '.'));
    c.append(el('small', 'bud-small', 'Spent ' + bigMoney(T.expenses || 0) + '. Grants it paid: ' + bigMoney(T.grants || 0) + (o.grants_all.lines ? ' (' + o.grants_all.lines + ' U.S. grant lines)' : '') + '. Political spending reported on Schedule C: ' + (o.politics.filed ? bigMoney(pol(o)) : 'no Schedule C filed') + '.'));
    const pay = (o.people || [])[0];
    if (pay && pay[2] + pay[3] + pay[4] > 0) c.append(el('small', 'bud-small', 'Highest pay listed: ' + pay[0] + ' (' + pay[1] + '), ' + bigMoney(pay[2] + pay[3] + pay[4]) + ' in all, as filed.'));
    c.append(el('small', 'bud-small np-donors', 'Donors: not public. The IRS public copy leaves out donor names.'));
    if (o.note) c.append(el('small', 'bud-small media-caveat', 'Note: ' + o.note));
    const act = el('div', 'bud-act');
    act.append(link('Follow its trail →', 'nonprofits.html?ein=' + o.ein));
    act.append(link('IRS return', filing(o), true));
    const b = el('button', 'tracker-web', 'See in the Money web'); b.type = 'button'; b.prepend(art(WEB_ART)); b.addEventListener('click', () => openWeb(HUB[o.ein])); act.append(b);
    const ins = el('button', 'tracker-inspect', 'Inspect'); ins.type = 'button'; ins.prepend(art(CABINET));
    ins.addEventListener('click', () => pick({ record_kind: 'entity', name: HUB[o.ein], entity_type: 'Nonprofit, IRS ' + o.section, id: 'EIN ' + ein(o.ein), jurisdiction: 'US', source_url: filing(o),
      notes: o.label + ' files IRS Form 990 as a ' + o.section + ' group. The figures come from its return for ' + year(o) + ', filed ' + o.filed + '. Donor names are not public.' }));
    act.append(ins); c.append(act);
    return c;
  }
  let query = '', built = false;
  function draw() {
    const list = box.querySelector('.tracker-list'); list.replaceChildren();
    const qq = query.trim().toLowerCase();
    const rows = G.filter(o => !qq || (o.label + ' ' + o.filed_name + ' ' + o.ein + ' ' + ein(o.ein) + ' ' + (o.people || []).map(p => p[0]).join(' ')).toLowerCase().includes(qq));
    const max = rows.reduce((m, o) => Math.max(m, o.totals.revenue || 0), 0);
    rows.forEach(o => list.append(card(o, max)));
    if (!rows.length) list.append(el('div', 'empty', 'No group matches. Try fewer letters.'));
    $('#feed-sub').textContent = G.length + ' nonprofits, from their IRS Form 990 returns';
  }
  function render() {
    if (!built) {
      built = true;
      const area = el('div', 'tracker-area'); box.append(area);
      area.append(el('p', 'state-lead', 'Politically active nonprofits from across the spectrum, the same number from each side, read with the same rules. The big number is the revenue on the group\'s latest IRS Form 990 return we could reach. Donors to these groups are not public, so no donor is named or guessed.'));
      const lab = el('label', 'tracker-search'), inp = el('input'); inp.type = 'search'; inp.autocomplete = 'off'; inp.placeholder = 'Type a group, an EIN or an officer…';
      inp.addEventListener('input', () => { query = inp.value; draw(); }); lab.append(el('span', null, 'Find a nonprofit'), inp);
      const all = el('p', 'bud-note'); all.append(link('Open the Nonprofit Trail: every group, its grants, its officers and pay →', 'nonprofits.html'));
      area.append(lab, all, el('div', 'tracker-list bud-list'), el('p', 'bud-note', 'Source: IRS Form 990 e-file returns (the IRS XML files), checked ' + N.meta.checked + '. A return covers one tax year and arrives months after the year ends. In the web, grants and payments to political groups are yearly totals, drawn as dashed lines, and are never added to FEC filing lines.'));
    }
    draw();
  }
  const base = setView;
  setView = function (v) {
    base(v);
    box.hidden = v !== 'nonprofits';
    if (v === 'nonprofits') { $('#feed-title').textContent = 'The nonprofit tracker'; render(); }
  };
  if (new URLSearchParams(location.search).get('view') === 'nonprofits') setView('nonprofits');
})();
