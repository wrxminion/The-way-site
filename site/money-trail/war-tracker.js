// D287 (Nov 2026): the War tracker tab (?view=wars), the lives box in the Evidence inspector, and plain labels for the
// war lines. One card per war, military action or non-combat mission: when, which presidents, what Congress voted, the lives
// lost (each count with who gives it and a link), the cost and contracts (each with a link). Data: wars.js (window.TW_WARS).
// Loaded after app.js. Text goes in with textContent.
// Lives lost are shown as numbers of people only. No life is given a dollar value, and lives are never added to a cost.
// D288 (Nov 2026): the big lives number is the total of all sides (U.S., allies, opposing forces, civilians). The breakdown
// splits it by side, with civilians on their own line, and names any side that has no sourced count yet. The cost sits in
// its own box under the lives box: one sourced figure (it.cost, picked by build_wars.py), or "Cost not yet sourced".
(function () {
  'use strict';
  const W = window.TW_WARS, HUB = window.TW_WAR_HUB || {};
  if (!W || typeof setView !== 'function') return;
  const box = document.getElementById('wars-view');
  const el = (tag, cls, text) => { const d = document.createElement(tag); if (cls) d.className = cls; if (text != null) d.textContent = text; return d; };
  const ext = (text, href) => { const a = el('a', 'bud-src war-src', text + ' ↗'); a.href = href; a.target = '_blank'; a.rel = 'noopener noreferrer'; return a; };
  const art = src => { const im = document.createElement('img'); im.src = src; im.alt = ''; im.width = 22; im.height = 24; im.className = 'tracker-btn-art'; im.decoding = 'async'; return im; };
  const WEB_ART = '/money-trail/art/money-web-link-blue.webp';
  const n = x => Number(x).toLocaleString('en-US');
  const host = u => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch (e) { return 'source'; } };
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const day = d => { const p = String(d || '').split('-'); if (!p[0]) return ''; if (p.length === 1) return p[0]; if (p.length === 2) return MONTHS[+p[1] - 1] + ' ' + p[0]; return MONTHS[+p[1] - 1] + ' ' + (+p[2]) + ', ' + p[0]; };
  const span = it => it.end === it.start ? day(it.start) : day(it.start) + ' to ' + (it.end ? day(it.end) : 'now');
  const livesText = it => it.lives_low === 0 && it.lives_high === 0 ? 'None reported' : it.lives_range ? n(it.lives_low) + ' to ' + n(it.lives_high) : n(it.lives_low);
  const range = (lo, hi) => lo === hi ? n(lo) : n(lo) + ' to ' + n(hi);
  const costText = c => c.hi ? bigMoney(c.amount) + ' to ' + bigMoney(c.hi) : bigMoney(c.amount);
  const missText = it => (it.sides_missing || []).length ? 'No sourced count yet for: ' + it.sides_missing.map(x => /^U\.S\./.test(x) ? x : x.toLowerCase()).join(', ') + '.' : '';
  const COST_RULE = 'A separate sourced figure. It is never added to lives lost, and no life is counted in it.';
  // The cost box. Same box on the card and in the inspector.
  function costBox(it, cls) {
    const b = el('div', cls);
    b.append(el('span', 'war-cost-label', 'Cost'));
    if (it.cost) {
      b.append(el('b', 'war-cost-n', costText(it.cost)));
      b.append(el('small', 'war-cost-note', it.cost.label + ', as of ' + day(it.cost.asof) + '. ' + COST_RULE));
    } else {
      b.append(el('b', 'war-cost-n none', 'Cost not yet sourced'));
      const gap = it.money_gap && !/^No (official|full official|official U\.S\.) cost found yet\.$/.test(it.money_gap) ? it.money_gap : '';
      if (gap) b.append(el('small', 'war-cost-note', gap));
    }
    return b;
  }
  const BY_HUB = new Map(W.items.map(it => [norm(it.hub), it]));
  const BY_SLUG = new Map(W.items.map(it => [it.slug, it]));
  const LIVES_RULE = 'We count the people who died as people. We do not put a dollar value on a human life, and we refuse to. No death on this page or in the Money web is turned into money, and lives are never added to a cost.';

  // ---- Plain labels for the war lines.
  const baseKind = kindLabel;
  kindLabel = function (e) {
    const id = String((e && (e.id || e.event_id)) || '');
    if (e && e.record_kind === 'entity') { const it = BY_HUB.get(norm(e.name || '')); if (it) return it.combat ? 'War or military action (War tracker)' : 'Non-combat military mission (War tracker)'; }
    if (e && e.record_kind === 'graph' && /^WAR-/.test(id)) {
      if (/-COST-/.test(id)) return 'War tracker: total cost as reported, not one payment';
      if (/-CON-/.test(id)) return 'War tracker: contract total as reported, not one payment';
      if (/-LAW-/.test(id)) return 'War tracker: law that authorized it (no money on this link)';
      return 'War tracker: president in office (no money on this link)';
    }
    return baseKind(e);
  };

  // ---- Evidence inspector: a war or mission dot shows its lives lost and a link to its card.
  function livesBox(it) {
    const b = el('div', 'mt-about war-about');
    b.append(el('div', 'mt-evcard-head', it.combat ? 'Lives lost, all sides' : 'Lives lost in the disaster'));
    b.append(el('div', 'war-count', livesText(it)));
    if (it.combat) b.append(el('p', 'mt-about-src war-all', 'Total of all sides counted. ' + missText(it)));
    const ul = el('ul', 'np-about-list');
    (it.sides || []).forEach(sd => {
      if (sd.side === 'mixed' || sd.side === 'disaster') {
        it.lives.filter(l => l.side === sd.side).forEach(l => ul.append(el('li', null, l.group + ': ' + (l.hi ? n(l.n) + ' to ' + n(l.hi) : n(l.n)) + (l.total === false ? ' (already inside a count above)' : ''))));
      } else ul.append(el('li', null, sd.label + ': ' + range(sd.low, sd.high)));
    });
    b.append(ul);
    b.append(el('p', 'mt-about-src', LIVES_RULE));
    const a = el('a', 'detail-link mt-about-site', 'Open it on the War tracker, with every source →'); a.href = '?view=wars#war-' + it.slug;
    a.addEventListener('click', ev => { ev.preventDefault(); openCard(it.slug); });
    b.append(a);
    return b;
  }
  const baseDetails = details;
  details = function (e) {
    baseDetails(e);
    if (!e || e.record_kind !== 'entity') return;
    const it = BY_HUB.get(norm(e.name || ''));
    if (!it) return;
    const head = document.querySelector('#detail-content .event-kind');
    if (head) { const lb = livesBox(it); head.after(lb); lb.after(costBox(it, 'mt-about war-about war-cost war-cost-about')); }
  };

  // ---- The war dots are in the center list of the web.
  function mount() {
    let added = false;
    W.items.forEach(it => { if (!hubs.includes(it.hub)) { hubs.push(it.hub); added = true; } });
    if (added && typeof prepareHubRefresh === 'function') prepareHubRefresh();
  }
  mount();

  const fn = document.getElementById('fec-note');
  if (fn) fn.textContent += ' War tracker: ' + W.items.length + ' wars, military actions and non-combat missions, checked ' + day(W.checked) + '. Costs are totals as reported, drawn as dashed lines and never added up. Lives lost are never given a dollar value.';
  if (!box) return;

  // ---- The tab.
  function openWeb(name) { graphHub = name; if (!hubs.includes(graphHub)) { hubs.push(graphHub); prepareHubRefresh(); } $('#hub').value = graphHub; graphScale = 1; setView('network'); $('.center-panel').scrollIntoView({ block: 'start', behavior: 'smooth' }); }
  function inspect(it) {
    pick({ record_kind: 'entity', name: it.hub, entity_type: it.combat ? 'Military action (War tracker)' : 'Non-combat military mission (War tracker)', id: it.kind_label, jurisdiction: 'US',
      source_url: (it.lives[0] || {}).url || '', notes: it.what });
  }
  function section(title) { const s = el('div', 'war-sec'); s.append(el('h4', 'war-h', title)); return s; }
  function card(it) {
    const c = el('article', 'tracker-card bud-row war-card' + (it.combat ? '' : ' war-help')); c.id = 'war-' + it.slug;
    const top = el('div', 'war-top');
    const head = el('div', 'war-head');
    head.append(el('span', 'war-kind', it.kind_label), el('h3', 'war-name', it.name), el('small', 'bud-small', span(it) + '. ' + it.where + '. ' + it.status));
    const pres = el('small', 'bud-small war-pres', it.presidents.length === 1 ? 'President: ' : 'Presidents: ');
    it.presidents.forEach((p, i) => { const a = el('a', 'bud-src', p.name); a.href = p.page; pres.append(a); if (i < it.presidents.length - 1) pres.append(document.createTextNode(', ')); });
    head.append(pres);
    const life = el('div', 'war-lives');
    life.append(el('span', 'war-lives-label', it.combat ? 'Lives lost, all sides' : 'Lives lost in the disaster'), el('b', 'war-count', livesText(it)),
      el('small', 'war-lives-note', (it.lives_low > 0 ? 'At least this many, from the counts below' : 'From the counts below') + (it.combat ? '. U.S., allies, opposing forces and civilians together.' : '.')));
    const miss = missText(it);
    if (miss) life.append(el('small', 'war-lives-miss', miss));
    const side = el('div', 'war-side');
    side.append(life, costBox(it, 'war-cost'));
    top.append(head, side); c.append(top);
    c.append(el('p', 'war-what', it.what));

    const ls = section(it.combat ? 'Lives lost, by side' : 'Lives lost, by who counts them');
    const line = l => {
      const li = el('li');
      li.append(el('b', 'war-n', l.hi ? n(l.n) + ' to ' + n(l.hi) : n(l.n)), el('span', 'war-g', ' ' + l.group + '. '), el('span', null, l.who + ' As of ' + day(l.asof) + '. '));
      if (l.side_note) li.append(el('span', 'war-dim', l.side_note + ' '));
      if (l.total === false) li.append(el('span', 'war-dim', 'Already inside a count on this card, so not added again. '));
      li.append(ext(host(l.url), l.url)); if (l.url2) { li.append(document.createTextNode(' ')); li.append(ext(host(l.url2), l.url2)); }
      return li;
    };
    (it.sides || []).forEach(sd => {
      const grp = el('div', 'war-grp war-grp-' + sd.side);
      if (it.combat) {
        const h = el('h5', 'war-grp-h'); h.append(el('span', null, sd.label), el('b', 'war-grp-n', sd.side === 'mixed' ? '' : range(sd.low, sd.high)));
        grp.append(h);
      }
      const ul = el('ul', 'war-list');
      it.lives.filter(l => l.side === sd.side).forEach(l => ul.append(line(l)));
      grp.append(ul); ls.append(grp);
    });
    if (miss) ls.append(el('p', 'bud-small war-gap war-miss', miss + ' The total above is only the sides we can source, so the real total is higher.'));
    if (it.lives_gap) ls.append(el('p', 'bud-small war-gap', 'Not yet counted: ' + it.lives_gap.replace(/^Not counted here yet: /, '')));
    c.append(ls);

    const ms = section('Money');
    if ((it.money || []).length) {
      const mu = el('ul', 'war-list');
      it.money.forEach(m => { const li = el('li'); li.append(el('b', 'war-n', bigMoney(m.amount)), el('span', 'war-label', ' ' + m.label + '. '), el('span', null, m.what + ' '), ext(host(m.url), m.url)); if (m.url2) { li.append(document.createTextNode(' ')); li.append(ext(host(m.url2), m.url2)); } mu.append(li); });
      ms.append(mu);
    }
    if (it.money_gap) ms.append(el('p', 'bud-small war-gap', it.money_gap));
    if (!(it.money || []).length && !it.money_gap) ms.append(el('p', 'bud-small war-gap', 'No cost figure found yet.'));
    (it.contracts || []).forEach(k => { const p = el('p', 'bud-small'); p.append(el('b', null, 'Contract: ' + k.company + ', ' + bigMoney(k.amount) + '. '), document.createTextNode(k.what + ' '), ext(host(k.url), k.url)); ms.append(p); });
    c.append(ms);

    if ((it.authority || []).length) {
      const as = section('What Congress voted');
      it.authority.forEach(a => { const p = el('p', 'bud-small'); p.append(document.createTextNode(a.name + ', ' + a.law + ', signed ' + day(a.date) + '. ' + a.votes + '. '), ext(host(a.url), a.url)); as.append(p); });
      c.append(as);
    }
    if ((it.says || []).length) {
      const ss = section('What was said');
      it.says.forEach(x => { const p = el('p', 'bud-small'); p.append(el('b', null, x.who + ': '), document.createTextNode(x.text + ' '), ext(host(x.url), x.url)); ss.append(p); });
      c.append(ss);
    }
    if (it.trigger) { const p = el('p', 'bud-small war-dim'); p.append(document.createTextNode('Added after this story: ' + it.trigger.text + ' '), ext(host(it.trigger.url), it.trigger.url)); c.append(p); }

    const act = el('div', 'bud-act');
    const b = el('button', 'tracker-web', 'See in the Money web'); b.type = 'button'; b.prepend(art(WEB_ART)); b.addEventListener('click', () => openWeb(HUB[it.slug] || it.hub)); act.append(b);
    const ins = el('button', 'tracker-inspect', 'Inspect'); ins.type = 'button'; ins.prepend(art(CABINET)); ins.addEventListener('click', () => inspect(it)); act.append(ins);
    c.append(act);
    return c;
  }
  let query = '', kind = 'all', pres = 'all', built = false;
  function draw() {
    const list = box.querySelector('.war-cards'); list.replaceChildren();
    const qq = query.trim().toLowerCase();
    const rows = W.items.filter(it => (kind === 'all' || (kind === 'combat') === it.combat) && (pres === 'all' || it.presidents.some(p => p.slug === pres))
      && (!qq || (it.name + ' ' + it.short + ' ' + it.where + ' ' + it.what + ' ' + it.kind_label + ' ' + it.presidents.map(p => p.name).join(' ')).toLowerCase().includes(qq)));
    rows.forEach(it => list.append(card(it)));
    if (!rows.length) list.append(el('div', 'empty', 'Nothing matches. Try fewer letters or All.'));
    $('#feed-sub').textContent = rows.length + ' of ' + W.items.length + ' wars, military actions and missions';
  }
  function render() {
    if (!built) {
      built = true;
      const area = el('div', 'tracker-area'); box.append(area);
      area.append(el('p', 'state-lead', 'U.S. wars and military actions, and the military\'s non-combat work such as Army Corps of Engineers projects and disaster relief. For each one: when, which presidents, what Congress voted, the lives lost on every side we can source, and what it cost. Same rules for every President. Every number names who gives it and links to where it is written.'));
      const rule = el('div', 'war-rule'); rule.append(el('strong', null, 'On lives lost: '), document.createTextNode(LIVES_RULE)); area.append(rule);
      const tools = el('div', 'war-tools');
      const lab = el('label', 'tracker-search'), inp = el('input'); inp.type = 'search'; inp.autocomplete = 'off'; inp.placeholder = 'Type a war, a place or a president…';
      inp.addEventListener('input', () => { query = inp.value; draw(); }); lab.append(el('span', null, 'Find one'), inp);
      const k = el('div', 'war-chips'); k.setAttribute('role', 'group'); k.setAttribute('aria-label', 'Kind');
      [['all', 'All'], ['combat', 'Wars and strikes'], ['help', 'Non-combat missions']].forEach(([v, t]) => {
        const c = el('button', 'war-chip' + (v === kind ? ' on' : ''), t); c.type = 'button'; c.setAttribute('aria-pressed', v === kind ? 'true' : 'false');
        c.addEventListener('click', () => { kind = v; k.querySelectorAll('.war-chip').forEach(x => { const on = x === c; x.classList.toggle('on', on); x.setAttribute('aria-pressed', on ? 'true' : 'false'); }); draw(); });
        k.append(c);
      });
      const pl = el('label', 'tracker-search war-pick'), ps = el('select');
      const all = new Map(); W.items.forEach(it => it.presidents.forEach(p => all.set(p.slug, p.name)));
      [['all', 'Every president']].concat([...all.entries()]).forEach(([v, t]) => { const o = el('option', null, t); o.value = v; ps.append(o); });
      ps.addEventListener('change', () => { pres = ps.value; draw(); }); pl.append(el('span', null, 'President'), ps);
      tools.append(lab, pl, k); area.append(tools);
      area.append(el('div', 'war-cards bud-list'));
      area.append(el('p', 'bud-note', 'Checked ' + day(W.checked) + '. This list is not complete: more wars, strikes and missions will be added with the same rules. U.S. military deaths come from the Pentagon\'s Defense Casualty Analysis System or the Congressional Research Service. Other counts come from governments, the UN, Brown University\'s Costs of War project, Iraq Body Count, Airwars, Human Rights Watch and news reports, and each one is named. When counts disagree, both ends are shown. Costs are totals as reported, in the dollars of their own time, and are never added together.'));
    }
    draw();
  }
  function openCard(slug) {
    setView('wars');
    const c = document.getElementById('war-' + slug);
    if (c) { c.classList.add('on'); c.scrollIntoView({ block: 'start', behavior: 'smooth' }); setTimeout(() => c.classList.remove('on'), 2400); }
  }
  const base = setView;
  setView = function (v) {
    base(v);
    box.hidden = v !== 'wars';
    if (v === 'wars') { $('#feed-title').textContent = 'The war tracker'; render(); }
  };
  const q = new URLSearchParams(location.search);
  if (q.get('view') === 'wars') {
    setView('wars');
    const m = /^#war-([a-z0-9-]+)$/.exec(location.hash);
    if (m && BY_SLUG.has(m[1])) openCard(m[1]);
  }
})();
