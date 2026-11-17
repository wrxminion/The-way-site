// D289 (Nov 2026): the Tariff tracker tab (?view=tariffs), its boxes in the Evidence inspector, and plain labels for the
// tariff lines. The tab shows: what the IEEPA tariffs collected and how much CBP has sent back (CBO and CBP totals), the
// refunds paid over time, the tariff programs, the court timeline, one card per company (its refund and what it said it did
// with it, each with a link), and what each side says. Data: tariffs.js (window.TW_TARIFFS). Loaded after app.js.
// Text goes in with textContent. Refunds of different companies are never added together.
(function () {
  'use strict';
  const T = window.TW_TARIFFS, HUB = window.TW_TARIFF_HUB || {};
  if (!T || typeof setView !== 'function') return;
  const box = document.getElementById('tariffs-view');
  const el = (tag, cls, text) => { const d = document.createElement(tag); if (cls) d.className = cls; if (text != null) d.textContent = text; return d; };
  const ext = (text, href) => { const a = el('a', 'bud-src tar-src', text + ' ↗'); a.href = href; a.target = '_blank'; a.rel = 'noopener noreferrer'; return a; };
  const art = src => { const im = document.createElement('img'); im.src = src; im.alt = ''; im.width = 22; im.height = 24; im.className = 'tracker-btn-art'; im.decoding = 'async'; return im; };
  const WEB_ART = '/money-trail/art/money-web-link-blue.webp';
  const host = u => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch (e) { return 'source'; } };
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const day = d => { const p = String(d || '').split('-'); if (!p[0]) return ''; if (p.length === 1) return p[0]; if (p.length === 2) return MONTHS[+p[1] - 1] + ' ' + p[0]; return MONTHS[+p[1] - 1] + ' ' + (+p[2]) + ', ' + p[0]; };
  const amt = m => m.hi ? bigMoney(m.amount) + ' to ' + bigMoney(m.hi) : bigMoney(m.amount);
  const links = (parent, x) => { parent.append(ext(host(x.url), x.url)); if (x.url2) { parent.append(document.createTextNode(' ')); parent.append(ext(host(x.url2), x.url2)); } };
  const BY_PROG = new Map(T.programs.map(p => [norm(p.hub), p]));
  const BY_CO = new Map(T.companies.map(c => [norm(c.web_hub || c.hub || ''), c]));
  const BY_SLUG = new Map(T.companies.map(c => [c.slug, c]));
  const USE_HUBS = new Set(['TARIFF REFUNDS TO BONUSES AND INCENTIVE PAY (TARIFF TRACKER)', 'TARIFF REFUNDS PAID BACK TO CUSTOMERS (TARIFF TRACKER)', 'TARIFF REFUNDS TO LOWER PRICES (TARIFF TRACKER)', 'TARIFF REFUND CLAIMS SOLD TO BUYERS (TARIFF TRACKER)'].map(norm));

  // ---- Plain labels for the tariff lines.
  const baseKind = kindLabel;
  kindLabel = function (e) {
    const id = String((e && (e.id || e.event_id)) || '');
    if (e && e.record_kind === 'entity') { const nm = norm(e.name || ''); if (BY_PROG.has(nm)) return 'Tariff program (Tariff tracker)'; if (USE_HUBS.has(nm)) return 'What companies did with tariff refunds (Tariff tracker)'; }
    if (e && e.record_kind === 'graph' && /^TAR-/.test(id)) {
      if (/-COLLECTED$/.test(id)) return 'Tariff tracker: tariffs collected, a total (not one payment)';
      if (/-REFUNDS$/.test(id)) return 'Tariff tracker: refunds sent for payment, a total (not one payment)';
      if (/-REFUND$/.test(id)) return 'Tariff tracker: refund the company reports, a total (not one payment)';
      if (/-PAID$/.test(id)) return 'Tariff tracker: tariffs the company paid, a total (not one payment)';
      if (/-USE$/.test(id)) return 'Tariff tracker: what the company said it did with its refund';
      if (/-COURT$/.test(id)) return 'Tariff tracker: court ruling (no money on this link)';
      return 'Tariff tracker: president who ordered it (no money on this link)';
    }
    return baseKind(e);
  };

  // ---- Boxes: the refund a company got, and what it did with it. Same boxes on the card and in the inspector.
  function refundBox(c, cls) {
    const b = el('div', 'tar-box tar-refund ' + (cls || ''));
    const r = c.refund || c.paid;
    b.append(el('span', 'tar-box-label', c.refund ? 'Refund' : c.paid ? 'Tariffs it paid' : 'Refund'));
    if (r) { b.append(el('b', 'tar-box-n', amt(r))); const n = el('small', 'tar-box-note', r.label + ', as of ' + day(r.asof) + '. ' + r.who + ' '); links(n, r); b.append(n); }
    else b.append(el('b', 'tar-box-n none', 'Amount not public'));
    return b;
  }
  function useBox(c, cls) {
    const u = c.use_box, b = el('div', 'tar-box tar-use tar-use-' + c.use + ' ' + (cls || ''));
    b.append(el('span', 'tar-box-label', T.uses[c.use]));
    if (u && u.amount && u.mixed) { b.append(el('b', 'tar-box-n none', 'Amount not split out')); b.append(el('small', 'tar-box-note', amt(u) + ' for ' + u.label.charAt(0).toLowerCase() + u.label.slice(1) + '.')); }
    else if (u && u.amount) b.append(el('b', 'tar-box-n', amt(u)));
    else if (u) b.append(el('b', 'tar-box-n none', u.label));
    else b.append(el('b', 'tar-box-n none', 'Not said yet'));
    return b;
  }
  function aboutCo(c) {
    const b = el('div', 'mt-about tar-about');
    b.append(el('div', 'mt-evcard-head', 'Tariff refund'));
    const row = el('div', 'tar-boxes'); row.append(refundBox(c), useBox(c)); b.append(row);
    if (c.use_box) { const p = el('p', 'mt-about-src', c.use_box.text + ' '); links(p, c.use_box); b.append(p); }
    const a = el('a', 'detail-link mt-about-site', 'Open it on the Tariff tracker, with every source →'); a.href = '?view=tariffs#tariff-' + c.slug;
    a.addEventListener('click', ev => { ev.preventDefault(); openCard(c.slug); });
    b.append(a);
    return b;
  }
  function aboutProg(p) {
    const b = el('div', 'mt-about tar-about');
    b.append(el('div', 'mt-evcard-head', p.name));
    b.append(el('p', 'mt-about-src', p.rate + '. ' + day(p.start) + ' to ' + (p.end ? day(p.end) : 'now') + '. ' + p.status));
    if (p.slug === 'ieepa') {
      const row = el('div', 'tar-boxes');
      T.totals.slice(0, 2).forEach(t => { const x = el('div', 'tar-box tar-refund'); x.append(el('span', 'tar-box-label', t.label), el('b', 'tar-box-n', bigMoney(t.amount)), el('small', 'tar-box-note', 'As of ' + day(t.asof) + '.')); row.append(x); });
      b.append(row);
    }
    const a = el('a', 'detail-link mt-about-site', 'Open the Tariff tracker →'); a.href = '?view=tariffs';
    a.addEventListener('click', ev => { ev.preventDefault(); setView('tariffs'); });
    b.append(a);
    return b;
  }
  const baseDetails = details;
  details = function (e) {
    baseDetails(e);
    if (!e || e.record_kind !== 'entity') return;
    const nm = norm(e.name || ''), c = BY_CO.get(nm), p = BY_PROG.get(nm);
    if (!c && !p) return;
    const head = document.querySelector('#detail-content .event-kind');
    if (head) head.after(c ? aboutCo(c) : aboutProg(p));
  };

  // ---- The tariff program dots are in the center list of the web.
  let added = false;
  T.programs.forEach(p => { if (!hubs.includes(p.hub)) { hubs.push(p.hub); added = true; } });
  if (added && typeof prepareHubRefresh === 'function') prepareHubRefresh();
  const fn = document.getElementById('fec-note');
  if (fn) fn.textContent += ' Tariff tracker: ' + T.programs.length + ' tariff programs and ' + T.companies.length + ' companies, checked ' + day(T.checked) + '. Refunds are totals as reported, drawn as dashed lines and never added up.';
  if (!box) return;

  // ---- The tab.
  function openWeb(name) { graphHub = name; if (!hubs.includes(graphHub)) { hubs.push(graphHub); prepareHubRefresh(); } $('#hub').value = graphHub; graphScale = 1; setView('network'); $('.center-panel').scrollIntoView({ block: 'start', behavior: 'smooth' }); }
  function inspect(c) { pick({ record_kind: 'entity', name: c.web_hub || c.hub, entity_type: 'company', id: c.slug, jurisdiction: 'US', source_url: (c.refund || c.use_box || {}).url || '', notes: c.name }); }
  function section(title, cls) { const s = el('section', 'tar-sec' + (cls ? ' ' + cls : '')); s.append(el('h4', 'tar-h', title)); return s; }
  function card(c) {
    const k = el('article', 'tracker-card bud-row tar-card tar-card-' + c.use); k.id = 'tariff-' + c.slug;
    const top = el('div', 'tar-top');
    const head = el('div', 'tar-head');
    head.append(el('span', 'tar-kind tar-kind-' + c.use, (T.uses_short || {})[c.use] || T.uses[c.use]), el('h3', 'tar-name', c.name));
    const side = el('div', 'tar-side'); side.append(refundBox(c), useBox(c));
    top.append(head, side); k.append(top);
    const ul = el('ul', 'tar-list');
    if (c.use_box) { const li = el('li'); li.append(el('span', null, c.use_box.text + ' ')); links(li, c.use_box); ul.append(li); }
    (c.lines || []).forEach(x => { const li = el('li'); li.append(el('span', null, x.text + ' ')); links(li, x); ul.append(li); });
    if (c.response) { const li = el('li', 'tar-resp'); li.append(el('b', null, 'Company response: '), el('span', null, c.response.text + ' ')); links(li, c.response); ul.append(li); }
    if (c.lawsuit) { const li = el('li', 'tar-law'); li.append(el('b', null, 'In court: '), el('span', null, c.lawsuit.text + ' ')); links(li, c.lawsuit); ul.append(li); }
    k.append(ul);
    const act = el('div', 'bud-act');
    const b = el('button', 'tracker-web', 'See in the Money web'); b.type = 'button'; b.prepend(art(WEB_ART)); b.addEventListener('click', () => openWeb(c.web_hub || c.hub)); act.append(b);
    const ins = el('button', 'tracker-inspect', 'Inspect'); ins.type = 'button'; ins.prepend(art(CABINET)); ins.addEventListener('click', () => inspect(c)); act.append(ins);
    if (c.company_slug) { const t = el('a', 'tracker-web', 'Company tracker →'); t.href = 'follow.html?company=' + c.company_slug; t.prepend(art(CABINET)); act.append(t); }
    k.append(act);
    return k;
  }
  let query = '', use = 'all', built = false;
  function draw() {
    const list = box.querySelector('.tar-cards'); list.replaceChildren();
    const qq = query.trim().toLowerCase();
    const rows = T.companies.filter(c => (use === 'all' || c.use === use) && (!qq || (c.name + ' ' + T.uses[c.use] + ' ' + ((c.use_box || {}).text || '')).toLowerCase().includes(qq)));
    rows.forEach(c => list.append(card(c)));
    if (!rows.length) list.append(el('div', 'empty', 'Nothing matches. Try fewer letters or All.'));
    $('#feed-sub').textContent = rows.length + ' of ' + T.companies.length + ' companies';
  }
  function render() {
    if (built) { draw(); return; }
    built = true;
    const area = el('div', 'tracker-area'); box.append(area);
    area.append(el('p', 'state-lead', 'The emergency tariffs of 2025 under IEEPA, what they collected, the court case that struck them down, the refunds CBP is paying back, and what companies say they did with their refunds. Same rules for every company and every President. Every number names who gives it and links to where it is written.'));
    const rule = el('div', 'tar-rule'); rule.append(el('strong', null, 'Who gets a refund: '), document.createTextNode(T.who_gets_it)); area.append(rule);

    const stats = el('div', 'tar-stats');
    T.totals.forEach(t => { const s = el('div', 'tar-stat tar-stat-' + t.key); s.append(el('span', 'tar-box-label', t.label), el('b', 'tar-stat-n', bigMoney(t.amount)), el('small', 'tar-box-note', 'As of ' + day(t.asof) + '. ' + t.who + ' ')); links(s.lastChild, t); stats.append(s); });
    area.append(stats);

    const pg = section('Refunds paid back so far');
    const pl = el('ul', 'tar-list tar-progress');
    T.progress.forEach(p => { const li = el('li'); li.append(el('b', 'tar-n', bigMoney(p.amount)), el('span', null, ' by ' + day(p.asof) + '. ' + p.text + ' From: ' + p.who + '. ')); links(li, p); pl.append(li); });
    pg.append(pl, el('p', 'bud-small tar-dim', 'These are different stages of the same refunds (authorized, paid, sent to the Treasury), so they are not added together.'));
    area.append(pg);

    const cs = section('Companies and their refunds');
    cs.append(el('p', 'bud-small', 'Publicly traded companies only report refunds when they choose to or when the amount matters to their results, so this list is not complete. Each card shows what the company said in its own filing or statement first, then what news reports and outside groups say, each named. A price rise can have other causes, such as tariffs still in place.'));
    const tools = el('div', 'tar-tools');
    const lab = el('label', 'tracker-search'), inp = el('input'); inp.type = 'search'; inp.autocomplete = 'off'; inp.placeholder = 'Type a company…';
    inp.addEventListener('input', () => { query = inp.value; draw(); }); lab.append(el('span', null, 'Find one'), inp);
    const chips = el('div', 'tar-chips'); chips.setAttribute('role', 'group'); chips.setAttribute('aria-label', 'What it did with the refund');
    [['all', 'All']].concat(Object.entries(T.uses)).forEach(([v, t]) => {
      const n = v === 'all' ? T.companies.length : (T.use_counts || {})[v] || 0;
      const c = el('button', 'tar-chip' + (v === use ? ' on' : ''), t + ' (' + n + ')'); c.type = 'button'; c.setAttribute('aria-pressed', v === use ? 'true' : 'false');
      c.addEventListener('click', () => { use = v; chips.querySelectorAll('.tar-chip').forEach(x => { const on = x === c; x.classList.toggle('on', on); x.setAttribute('aria-pressed', on ? 'true' : 'false'); }); draw(); });
      chips.append(c);
    });
    tools.append(lab, chips); cs.append(tools, el('div', 'tar-cards bud-list'));
    area.append(cs);

    const ps = section('The tariff programs');
    const pr = el('div', 'tar-progs');
    T.programs.forEach(p => {
      const d = el('div', 'tracker-card tar-prog');
      d.append(el('strong', 'tar-prog-name', p.name), el('small', 'bud-small', p.law), el('small', 'bud-small', p.rate + '. ' + day(p.start) + ' to ' + (p.end ? day(p.end) : 'now') + '.'),
        el('small', 'bud-small tar-prog-status', p.status), el('small', 'bud-small', p.collected ? 'Collected: ' + bigMoney(p.collected) + ' (' + p.collected_who + ').' : 'Collected: not yet sourced.'));
      const s = el('small', 'bud-small'); links(s, p); d.append(s);
      const act = el('div', 'bud-act'); const b = el('button', 'tracker-web', 'See in the Money web'); b.type = 'button'; b.prepend(art(WEB_ART)); b.addEventListener('click', () => openWeb(HUB[p.slug] || p.hub)); act.append(b); d.append(act);
      pr.append(d);
    });
    ps.append(pr, el('p', 'bud-small tar-dim', T.programs_note));
    area.append(ps);

    const ts = section('How it happened');
    const tl = el('ol', 'tar-time');
    T.timeline.forEach(t => { const li = el('li'); li.append(el('b', 'tar-date', day(t.date)), el('span', null, ' ' + t.text + ' ')); links(li, t); tl.append(li); });
    ts.append(tl); area.append(ts);

    const ss = section('What was said, all sides');
    T.says.forEach(x => { const p = el('p', 'bud-small'); p.append(el('b', null, x.who + ': '), document.createTextNode(x.text + ' ')); links(p, x); ss.append(p); });
    area.append(ss);

    if (T.trigger) { const p = el('p', 'bud-small tar-dim'); p.append(document.createTextNode('Added after this story: ' + T.trigger.text + ' ')); links(p, T.trigger); area.append(p); }
    area.append(el('p', 'bud-note', 'Checked ' + day(T.checked) + '. CBP figures come from its own sworn updates to the Court of International Trade, as reported by Supply Chain Dive and C.H. Robinson; the IEEPA total comes from the Congressional Budget Office. Company figures come from each company\'s SEC filings and earnings releases where we could read them; where we could not, the source is named (ProPublica, Forbes, Yahoo Finance, or Groundwork Collaborative, an advocacy group). Refunds are totals as reported and are never added together.'));
    draw();
  }
  function openCard(slug) {
    setView('tariffs');
    const c = document.getElementById('tariff-' + slug);
    if (c) { c.classList.add('on'); c.scrollIntoView({ block: 'start', behavior: 'smooth' }); setTimeout(() => c.classList.remove('on'), 2400); }
  }
  const base = setView;
  setView = function (v) {
    base(v);
    box.hidden = v !== 'tariffs';
    if (v === 'tariffs') { $('#feed-title').textContent = 'The tariff tracker'; render(); }
  };
  const q = new URLSearchParams(location.search);
  if (q.get('view') === 'tariffs') {
    setView('tariffs');
    const m = /^#tariff-([a-z0-9-]+)$/.exec(location.hash);
    if (m && BY_SLUG.has(m[1])) openCard(m[1]);
  }
})();
