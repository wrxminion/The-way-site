'use strict';
// Information Currents: reads static JSON from ./data/ and renders it. All text goes in via textContent.
(function(){
  const DATA = 'data/';
  const PAGE = 60;
  const WINDOW_DAYS = 7;
  const MAX_ITEMS = 20000;
  const KIND_LABEL = {news:'News', official:'Official source', factcheck:'Fact-check', discussion:'Discussion'};
  const $ = id => document.getElementById(id);
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

  const state = {mode:'now', asof:null, place:'', kind:'', q:'', items:[], shown:0, filtered:[], latest:null, stateDoc:null, index:null, indexError:false, dayCache:new Map()};

  const fmtTime = new Intl.DateTimeFormat(undefined, {month:'short', day:'numeric', hour:'numeric', minute:'2-digit', timeZoneName:'short'});
  const fmtDay = new Intl.DateTimeFormat(undefined, {weekday:'long', month:'long', day:'numeric', year:'numeric'});
  const fmtDate = new Intl.DateTimeFormat(undefined, {month:'long', day:'numeric', year:'numeric'});

  function parseTime(s){ if (typeof s !== 'string') return null; const t = Date.parse(s); return Number.isFinite(t) ? t : null; }
  function localISO(d){ return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0'); }
  function utcISO(ms){ return new Date(ms).toISOString().slice(0,10); }
  function endOfLocalDay(iso){ const [y,m,d] = iso.split('-').map(Number); return new Date(y, m-1, d, 23, 59, 59, 999).getTime(); }
  function safeUrl(u){ if (typeof u !== 'string' || u.length > 2048) return null; try { const x = new URL(u); return (x.protocol === 'https:' || x.protocol === 'http:') ? x.href : null; } catch { return null; } }
  function str(v, max){ return typeof v === 'string' ? v.slice(0, max) : ''; }
  function list(v){ return Array.isArray(v) ? v.filter(x => typeof x === 'string').slice(0, 20).map(x => x.slice(0, 40).toLowerCase()) : []; }

  function aboutOf(v){
    // [{label, page}] from the publisher; page is a guide path under the pages folder, checked strictly.
    return (Array.isArray(v) ? v : []).filter(x => x && typeof x === 'object' && /^[a-z0-9-]+(\/[a-z0-9-]+)*\.html$/.test(String(x.page)) && typeof x.label === 'string' && x.label.trim())
      .slice(0, 6).map(x => ({label: x.label.trim().slice(0, 120), page: String(x.page)}));
  }

  function snapOf(v){
    if (!v || v.status !== 'snapped') return null;
    const at = parseTime(v.captured_at), sha = typeof v.sha256 === 'string' && /^[0-9a-f]{64}$/.test(v.sha256) ? v.sha256 : null;
    if (at == null || !sha) return null;
    const arch = typeof v.archive_url === 'string' && v.archive_url.startsWith('https://web.archive.org/') ? v.archive_url : null;
    return {at, sha, arch};
  }

  function clean(raw){
    if (!raw || typeof raw !== 'object') return null;
    const url = safeUrl(raw.source_url) || safeUrl(raw.url), title = str(raw.title, 400).trim(), seen = parseTime(raw.first_seen_at);
    if (!url || !title || seen == null) return null;
    const dateOnly = typeof raw.published_at === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.published_at);
    const pub = dateOnly ? endOfLocalDay(raw.published_at) - 12 * 3600e3 : parseTime(raw.published_at);
    return {id:str(raw.id, 80) || url, url, title, source:str(raw.source, 120).trim() || new URL(url).hostname,
      kind:KIND_LABEL[raw.kind] ? raw.kind : 'news', pub, dateOnly, seen, sort:pub != null ? pub : seen,
      places:list(raw.places), states:list(raw.states), topics:list(raw.topics), snap:snapOf(raw.snapshot), measures:list(raw.measures).filter(m => /^[a-z0-9-]{1,80}$/.test(m)).slice(0, 5), about:aboutOf(raw.about), hay:(title + ' ' + str(raw.source, 120)).toLowerCase()};
  }

  async function getJSON(path){
    const r = await fetch(DATA + path, {cache:'no-cache', credentials:'same-origin'});
    if (!r.ok) throw new Error(r.status === 404 ? 'missing' : 'http ' + r.status);
    return r.json();
  }
  function itemsOf(doc){ return Array.isArray(doc && doc.items) ? doc.items.slice(0, MAX_ITEMS).map(clean).filter(Boolean) : []; }

  function dedupe(items){ const seen = new Map(); for (const it of items){ const prev = seen.get(it.id); if (!prev || it.seen < prev.seen) seen.set(it.id, it); } return [...seen.values()]; }

  async function loadNow(){
    if (state.place){
      try { state.stateDoc = await getJSON('states/' + state.place + '.json'); }
      catch (e) { if (e.message !== 'missing') throw e; state.stateDoc = {items:[]}; }
      state.items = dedupe(itemsOf(state.stateDoc));
      return;
    }
    if (!state.latest) state.latest = await getJSON('latest.json');
    state.items = dedupe(itemsOf(state.latest));
  }

  async function loadIndex(){
    if (state.index) return state.index;
    try { const doc = await getJSON('index.json'); state.index = Array.isArray(doc.days) ? doc.days.filter(d => d && /^\d{4}-\d{2}-\d{2}$/.test(d.date)).map(d => d.date).sort() : []; }
    catch { state.indexError = true; state.index = []; }
    return state.index;
  }

  async function loadThen(iso){
    const days = await loadIndex();
    const cutoff = endOfLocalDay(iso), start = cutoff - WINDOW_DAYS * 864e5;
    const from = utcISO(start), to = utcISO(cutoff);
    const want = days.filter(d => d >= from && d <= to);
    const docs = await Promise.all(want.map(async d => {
      if (!state.dayCache.has(d)) { try { state.dayCache.set(d, await getJSON('days/' + d + '.json')); } catch { state.dayCache.set(d, null); } }
      return state.dayCache.get(d);
    }));
    state.items = dedupe(docs.flatMap(itemsOf)).filter(it => it.seen <= cutoff && it.seen > start);
    return {days, want, missing:want.filter(d => !state.dayCache.get(d))};
  }

  function applyFilters(){
    const q = state.q.trim().toLowerCase();
    state.filtered = state.items.filter(it =>
      (!state.place || state.mode === 'now' || it.states.includes(state.place) || it.places.includes(state.place)) &&
      (!state.kind || it.kind === state.kind) &&
      (!q || it.hay.includes(q))
    ).sort((a, b) => b.sort - a.sort);
    state.shown = 0;
    $('cards').replaceChildren();
    renderMore();
    renderKinds();
  }

  function card(it){
    const li = el('li', 'card');
    const src = el('div', 'src');
    src.append(el('b', null, it.source), el('span', 'pill kind', KIND_LABEL[it.kind]), el('span', 'pill unchecked', 'Unchecked'));
    if (it.snap){
      const b = el(it.snap.arch ? 'a' : 'span', 'pill snapped', 'Snapped');
      b.title = 'A full copy of this page was saved ' + fmtTime.format(it.snap.at) + '. Fingerprint ' + it.snap.sha.slice(0, 12) + '…' + (it.snap.arch ? ' Opens the saved copy.' : '');
      if (it.snap.arch){ b.href = it.snap.arch; b.target = '_blank'; b.rel = 'noopener noreferrer nofollow'; }
      src.append(b);
    } else {
      const b = el('span', 'pill notsnapped', 'Not snapped');
      b.title = 'Only the headline, link and times are saved so far. No copy of the page yet.';
      src.append(b);
    }
    const h = el('h3'); const a = el('a', null, it.title);
    a.href = it.url; a.target = '_blank'; a.rel = 'noopener noreferrer nofollow';
    h.append(a);
    if (new URL(it.url).hostname === 'news.google.com') h.append(el('span', 'link-via', ' (via Google News)'));
    const times = el('div', 'times');
    times.append(el('span', null, it.pub != null ? 'Published ' + (it.dateOnly ? fmtDate.format(it.pub) : fmtTime.format(it.pub)) : 'Publish time not given'), document.createTextNode(' · '), el('span', null, 'First seen ' + fmtTime.format(it.seen)));
    li.append(src, h, times);
    const tags = it.states.slice(0, 3).map(s => s.toUpperCase()).concat(it.places.filter(p => p === 'colorado' || p === 'boulder'), it.topics.slice(0, 4));
    if (tags.length){ const t = el('div', 'tags'); t.append(el('span', null, 'Automatic tags, may be incorrect: ')); for (const x of tags) t.append(el('span', 'pill', x.replace(/[-_]/g, ' '))); li.append(t); }
    const about = it.about.length ? it.about : it.measures.map(m => ({
      // older items: measure ids only (Colorado guide)
      label: m.replace(/^city-of-|^city-and-county-of-/, '').replace(/-/g, ' ').replace(/\b(\d+[a-z]|nn)\b/g, x => x.toUpperCase()).replace(/^./, c => c.toUpperCase()),
      page: 'guide/' + (/^(amendment|proposition|ballot-issue)-/.test(m) ? 'measures/' : 'local/m/') + m + '.html'}));
    if (about.length){
      // Matched by name or measure wording in the headline (automatic, may be wrong). Links into the voter guides next door.
      const p = el('div', 'onballot', 'May be about: ');
      const seen = new Set();
      about.forEach(x => {
        if (seen.has(x.label)) return;
        const a = el('a', null, x.label);
        a.href = '../' + x.page;
        if (seen.size) p.append(document.createTextNode(', '));
        seen.add(x.label);
        p.append(a);
      });
      li.append(p);
    }
    return li;
  }

  function renderMore(){
    const list = $('cards'), next = state.filtered.slice(state.shown, state.shown + PAGE);
    let lastDay = state.shown ? fmtDay.format(state.filtered[state.shown - 1].sort) : '';
    for (const it of next){
      const day = fmtDay.format(it.sort);
      if (day !== lastDay){ list.append(el('li', 'day', day)); lastDay = day; }
      list.append(card(it));
    }
    state.shown += next.length;
    $('more').hidden = state.shown >= state.filtered.length;
    const n = state.filtered.length, total = state.items.length;
    $('status').textContent = !total ? (state.mode === 'now' ? 'No headlines in the current right now.' : 'No headlines are available from the public archive for those days.')
      : !n ? 'No headlines match those filters.'
      : n.toLocaleString() + (n === 1 ? ' headline' : ' headlines') + (n < total ? ' match (of ' + total.toLocaleString() + ')' : '') + (state.mode === 'then' ? ', as seen by the end of ' + fmtDate.format(endOfLocalDay(state.asof)) : '') + '.';
  }

  function renderKinds(){
    const box = $('kinds'), counts = {};
    for (const it of state.items) counts[it.kind] = (counts[it.kind] || 0) + 1;
    const kinds = Object.keys(KIND_LABEL).filter(k => counts[k]);
    if (state.kind && !counts[state.kind]) state.kind = '';
    box.replaceChildren();
    if (kinds.length < 2) return;
    for (const k of [''].concat(kinds)){
      const b = el('button', null, k ? KIND_LABEL[k] : 'All sources');
      b.type = 'button'; b.dataset.kind = k; b.setAttribute('aria-pressed', String(state.kind === k));
      box.append(b);
    }
  }

  function renderFacts(meta){
    const dl = $('facts'); dl.replaceChildren();
    const add = (k, v) => { if (v) dl.append(el('dt', null, k), el('dd', null, v)); };
    for (const [k, v] of meta) add(k, v);
  }

  function banner(lines){
    const b = $('banner'); b.replaceChildren();
    lines = lines.filter(Boolean);
    b.hidden = !lines.length;
    for (const l of lines) b.append(el('p', null, l));
  }

  function sources(){ return new Set(state.items.map(i => i.source)).size; }

  async function showNow(){
    state.mode = 'now'; setTabs();
    try { await loadNow(); }
    catch (e) {
      state.items = [];
      banner([e.message === 'missing' ? 'The news current is not connected yet. Check back soon.' : 'The news current could not be loaded right now. Try again in a few minutes.']);
      applyFilters(); renderFacts([]); done(); return;
    }
    const doc = state.place ? state.stateDoc : state.latest, gen = parseTime(doc.generated_at);
    const notes = Array.isArray(doc.coverage && doc.coverage.notes) ? doc.coverage.notes.filter(n => typeof n === 'string').slice(0, 5).map(n => n.slice(0, 300)) : [];
    const stale = doc.starter !== true && gen != null && Date.now() - gen > 6 * 3600e3;
    const windowLabel = typeof (doc.coverage && doc.coverage.window_label) === 'string' ? doc.coverage.window_label.slice(0, 80) : 'the last ' + WINDOW_DAYS + ' days';
    banner([doc.demo === true ? 'Preview with example headlines. These are placeholders to show the layout, not real news.' : '',
      stale ? 'The current has not updated since ' + fmtTime.format(gen) + '. Newer headlines may be missing.' : ''].concat(notes));
    applyFilters();
    renderFacts([['Updated', gen != null ? fmtTime.format(gen) : ''], ['Headlines', state.items.length.toLocaleString()], ['Sources', sources().toLocaleString()], ['Covers', windowLabel]]);
    done();
  }

  async function showThen(iso){
    state.mode = 'then'; setTabs();
    const days = await loadIndex();
    const today = localISO(new Date()), first = days[0] || today;
    const input = $('asof'); input.max = today; input.min = first;
    if (!iso || iso > today) iso = today;
    if (iso < first) iso = first;
    state.asof = iso; input.value = iso;
    $('first-day').disabled = !days.length;
    history.replaceState(null, '', '#then=' + iso);
    $('status').textContent = 'Travelling back…';
    const result = await loadThen(iso);
    const last = days[days.length - 1];
    banner([state.indexError ? 'The public archive index could not be loaded. Historical results may be incomplete.' : !days.length ? 'The public archive index contains no saved days. Other archived records may exist elsewhere.' : '',
      days.length && endOfLocalDay(iso) - WINDOW_DAYS * 864e5 < Date.parse(first) ? 'The public archive index begins on ' + fmtDate.format(endOfLocalDay(first)) + '. Earlier coverage is not shown here.' : '',
      last && last < iso ? 'The public archive index was last updated through ' + fmtDate.format(endOfLocalDay(last)) + '. Newer archived headlines may be missing here.' : '',
      result.missing.length ? 'Some indexed archive files could not be loaded. Results may be incomplete.' : '']);
    applyFilters();
    renderFacts([['As of', 'end of ' + fmtDate.format(endOfLocalDay(iso))], ['Headlines', state.items.length.toLocaleString()], ['Sources', sources().toLocaleString()], ['Archive kept since', days.length ? fmtDate.format(endOfLocalDay(first)) : 'not started']]);
    done();
  }

  function done(){ document.querySelector('.feed').setAttribute('aria-busy', 'false'); }

  function setTabs(){
    const then = state.mode === 'then';
    $('tab-now').setAttribute('aria-selected', String(!then));
    $('tab-then').setAttribute('aria-selected', String(then));
    $('panel').setAttribute('aria-labelledby', then ? 'tab-then' : 'tab-now');
    $('timemachine').hidden = !then;
    if (!then) history.replaceState(null, '', location.pathname + location.search);
  }

  $('tab-now').addEventListener('click', () => showNow());
  $('tab-then').addEventListener('click', () => showThen(state.asof));
  $('asof').addEventListener('change', e => { if (e.target.value) showThen(e.target.value); });
  document.querySelector('.presets').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.id === 'first-day') { if (state.index && state.index.length) showThen(state.index[0]); return; }
    const d = new Date(); d.setDate(d.getDate() - Number(b.dataset.back)); showThen(localISO(d));
  });
  $('st').addEventListener('change', e => {
    state.place = e.target.value; state.kind = '';
    if (state.mode === 'now') showNow(); else applyFilters();
  });
  $('kinds').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; state.kind = b.dataset.kind; applyFilters(); });
  let t; $('q').addEventListener('input', e => { clearTimeout(t); t = setTimeout(() => { state.q = e.target.value; applyFilters(); }, 150); });
  $('more').addEventListener('click', renderMore);

  const m = /^#then=(\d{4}-\d{2}-\d{2})$/.exec(location.hash);
  if (m) showThen(m[1]); else showNow();
})();
