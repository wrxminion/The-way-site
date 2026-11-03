// Admin > Site analytics and SEO (super admins only). Reads the daily summaries in site_stats_daily (migration 0028),
// which the site-stats Edge Function fills from Cloudflare Web Analytics. Plain JavaScript, no build step.
// Every piece of text goes into the page with textContent, never innerHTML. Maps are static inline SVG; the hover
// text is an SVG <title> element. No IP addresses or per-visitor data exist anywhere in this path.
// app.js hands over its helpers once: TheWayStats.make({ sb, h, q, when }).
(() => {
'use strict';

const NS = 'http://www.w3.org/2000/svg';
const svg = (tag, attrs, ...kids) => {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs || {})) el.setAttribute(k, v);
  for (const kid of kids) if (kid) el.append(kid);
  return el;
};
const SITE = 'https://michiinstitute.com';
const num = (n) => Number(n || 0).toLocaleString();
const LEVELS = 5;
const level = (v, max) => (v > 0 && max > 0 ? Math.max(1, Math.ceil(LEVELS * Math.sqrt(v / max))) : 0);
const regionName = (() => {
  try { const d = new Intl.DisplayNames(undefined, { type: 'region' }); return (c) => { try { return d.of(c) || c; } catch { return c; } }; }
  catch { return (c) => c; }
})();
const SPECIAL = { XX: 'Unknown', T1: 'Tor network' };

function make(ctx) {
  const { sb, h, q, when } = ctx;

  function table(head, rows) {
    return h('table', { class: 'as-table' },
      h('thead', {}, h('tr', {}, head.map((t, i) => h('th', { class: i ? 'num' : '', text: t })))),
      h('tbody', {}, rows.length ? rows : h('tr', {}, h('td', { colspan: head.length, class: 'muted', text: 'Nothing yet.' }))));
  }
  const row = (label, a, b, href) => h('tr', {},
    h('td', {}, href ? h('a', { class: 'as-link', href, target: '_blank', rel: 'noopener noreferrer', text: label }) : label),
    h('td', { class: 'num', text: num(a) }), h('td', { class: 'num', text: num(b) }));
  // A page label is a path such as /guide-ny/races/judges.html; only a plain path becomes a link.
  const pageHref = (label) => (/^\/[^\s?#]*$/.test(label) ? SITE + label : null);
  // A referrer label is a host name. "None (direct)" and app ids such as com.reddit.frontpage are not sites.
  const refHref = (label) => (/^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(label) && !/^(com|org|net|android-app)\./i.test(label) ? `https://${label}/` : null);
  const pageRow = (p) => row(p.label, p.visits, p.page_views, pageHref(p.label));

  // Range picker. The daily rows are whole UTC days, so every range counts UTC days ending today. "All time" is
  // everything still stored (the Edge Function keeps about 400 days, and only days it has pulled so far exist).
  const DAY = 86400000;
  const iso = (d) => d.toISOString().slice(0, 10);
  const RANGES = [
    { id: 'today', label: 'Today', days: 1 },
    { id: 'byday', label: 'By day', days: 14 },
    { id: 'week', label: 'Week', days: 7 },
    { id: 'month', label: 'Month', days: 30 },
    { id: 'six', label: '6 months', days: 182 },
    { id: 'all', label: 'All time', days: null },
  ];
  const BY_DAY_MAX = 31;   // the state-by-day table is only drawn for ranges this short
  // site_stats_daily is read straight through its row-level security (super admins only), a page of 1000 at a time.
  async function fetchRows(from) {
    const out = [];
    for (let at = 0; at < 80000; at += 1000) {
      let qy = sb.from('site_stats_daily').select('day,kind,label,visits,page_views')
        .in('kind', ['total', 'page', 'referrer', 'country', 'state']);
      if (from) qy = qy.gte('day', from);
      const part = await q(qy.order('day').order('kind').order('label').range(at, at + 999));
      out.push(...part);
      if (part.length < 1000) break;
    }
    return out;
  }
  // Add up one kind over the rows: [{ label, visits, page_views }], busiest first.
  function tally(rows, kind) {
    const m = new Map();
    for (const r of rows) {
      if (r.kind !== kind) continue;
      const t = m.get(r.label) || { label: r.label, visits: 0, page_views: 0 };
      t.visits += r.visits; t.page_views += r.page_views; m.set(r.label, t);
    }
    return [...m.values()].sort((a, b) => b.page_views - a.page_views || (a.label < b.label ? -1 : 1));
  }
  const stateName = (c) => (window.US_STATES && window.US_STATES[c] ? window.US_STATES[c][0] : c);

  // Page views of the busiest states, one row per day (newest first). Other states are summed into one column.
  function stateByDay(rows, states) {
    const top = states.slice(0, 8).map((s) => s.label);
    const days = new Map();
    for (const r of rows) {
      if (r.kind !== 'state') continue;
      const d = days.get(r.day) || { day: r.day, by: new Map(), other: 0, all: 0 };
      if (top.includes(r.label)) d.by.set(r.label, r.page_views); else d.other += r.page_views;
      d.all += r.page_views; days.set(r.day, d);
    }
    const list = [...days.values()].sort((a, b) => (a.day < b.day ? 1 : -1));
    const cell = (n) => h('td', { class: 'num', text: n ? num(n) : '-' });
    return h('div', { class: 'as-scroll' }, h('table', { class: 'as-table as-byday' },
      h('thead', {}, h('tr', {}, h('th', { text: 'Day (UTC)' }),
        top.map((c) => h('th', { class: 'num', title: stateName(c), text: c })),
        top.length < states.length ? h('th', { class: 'num', text: 'Others' }) : null,
        h('th', { class: 'num', text: 'All' }))),
      h('tbody', {}, list.map((d) => h('tr', {}, h('td', { text: d.day }),
        top.map((c) => cell(d.by.get(c))),
        top.length < states.length ? cell(d.other) : null,
        h('td', { class: 'num', text: num(d.all) }))))));
  }

  function legend() {
    return h('div', { class: 'as-legend small dim' }, 'Fewer ',
      [1, 2, 3, 4, 5].map((n) => h('span', { class: `as-swatch as-l${n}` })), ' more');
  }

  // Choropleth over a shape table: shapes[key] = [name, pathData]. counts: Map key -> { visits, page_views }.
  function choropleth(shapes, viewBox, counts, nameOf) {
    const max = Math.max(0, ...[...counts.values()].map((c) => c.page_views));
    const s = svg('svg', { viewBox, role: 'img', class: 'as-map', preserveAspectRatio: 'xMidYMid meet' });
    for (const [key, shape] of Object.entries(shapes)) {
      const c = counts.get(key);
      const p = svg('path', { d: shape[1], class: `as-shape as-l${level(c ? c.page_views : 0, max)}` });
      p.append(svg('title', {}));
      p.firstChild.textContent = `${nameOf(key, shape)}: ${c ? `${num(c.visits)} visits, ${num(c.page_views)} page views` : 'none'}`;
      s.append(p);
    }
    return s;
  }

  async function seoBlock() {
    const out = h('div', { class: 'panel' }, h('h3', { text: 'SEO status' }), h('p', { class: 'muted small', text: 'Checking the live site...' }));
    const get = async (path) => {
      try { const r = await fetch(path, { cache: 'no-store' }); return r.ok ? await r.text() : null; } catch { return null; }
    };
    const [home, robots, sitemap] = await Promise.all([get('/'), get('/robots.txt'), get('/sitemap.xml')]);
    let noindex = null;
    if (home) {
      const doc = new DOMParser().parseFromString(home, 'text/html');
      const m = doc.querySelector('meta[name="robots" i]');
      noindex = !!(m && /noindex/i.test(m.getAttribute('content') || ''));
    }
    const blocked = robots != null && /^\s*disallow:\s*\/\s*$/im.test(robots);
    const urls = sitemap ? (sitemap.match(/<loc>/gi) || []).length : null;
    const on = noindex === false && !blocked;
    const line = (label, tag, text) => h('li', {}, h('strong', { text: label + ' ' }), tag, ' ', h('span', { class: 'muted small', text }));
    out.replaceChildren(h('h3', { text: 'SEO status' }), h('ul', { class: 'as-seo' },
      line('Search indexing:', h('span', { class: `tag ${on ? 'ok' : 'warn'}`, text: noindex == null ? 'could not check' : on ? 'on' : 'off' }),
        noindex == null ? 'The home page did not load.' : on ? 'The home page allows indexing and robots.txt does not block the site.'
          : `${noindex ? 'The home page says noindex. ' : ''}${blocked ? 'robots.txt blocks the whole site. ' : ''}Search engines are asked to stay away until it is switched on.`),
      line('robots.txt:', h('span', { class: `tag ${robots ? 'ok' : 'warn'}`, text: robots ? 'found' : 'missing' }), ''),
      line('Sitemap:', h('span', { class: `tag ${urls ? 'ok' : 'warn'}`, text: urls ? `${urls} URL${urls === 1 ? '' : 's'}` : 'none' }),
        urls === 1 ? 'Only the home page is listed.' : ''),
      line('Google Search Console:', h('span', { class: 'tag', text: 'not connected' }), 'Placeholder. Add the site there, then link it here.'),
      line('Bing Webmaster Tools:', h('span', { class: 'tag', text: 'not connected' }), 'Placeholder.')),
      h('p', { class: 'btns' },
        h('a', { class: 'button quiet', href: 'https://search.google.com/search-console', target: '_blank', rel: 'noopener noreferrer', text: 'Open Search Console' }),
        h('a', { class: 'button quiet', href: 'https://dash.cloudflare.com/?to=/:account/web-analytics', target: '_blank', rel: 'noopener noreferrer', text: 'Open Cloudflare Web Analytics' })));
    return out;
  }

  // My Ballot and ballot study use. Counts only; the SQL function never returns anyone's picks, names or ids.
  function studyCard(s) {
    const when2 = (t) => (t ? String(t).slice(0, 10) : 'none yet');
    if (!s) return h('div', { class: 'panel' }, h('h3', { text: 'Ballot study use (totals only)' }),
      h('p', { class: 'muted small', text: 'Not available yet. Run supabase/migrations/0087_study_usage_totals.sql in the Supabase SQL editor, then reload.' }));
    const b = s.ballot_plans || {}, r = s.research_submissions || {}, f = s.forecast_shares || {};
    const tile = (n, label) => h('div', { class: 'as-tile' }, h('strong', { text: num(n) }), h('span', { class: 'small muted', text: label }));
    return h('div', { class: 'panel' }, h('h3', { text: 'Ballot study use (totals only)' }),
      h('p', { class: 'muted small', text: 'How many people use My Ballot and the study, never what they picked. These are counts of saved plans, submissions and anonymous shares; no choices, names or accounts are read or shown. "Not you" means other than the signed-in admin.' }),
      h('div', { class: 'as-tiles' },
        tile(b.saved, 'saved ballot plans'), tile(b.members, 'members who saved one'), tile(b.members_not_me, 'of them, not you'),
        tile(r.submitted, 'research submissions'), tile(r.people, 'people who submitted'), tile(r.people_not_me, 'of them, not you'),
        tile(f.shares, 'anonymous forecast shares'), tile(s.members, 'members in total')),
      h('p', { class: 'muted small', text: `Newest saved plan: ${when2(b.last_saved)}. Newest submission: ${when2(r.last_submitted)}. Newest share: ${when2(f.last_shared)}.` }));
  }

  function panel() {
    const root = h('div', { class: 'as-root' });
    const body = h('div');
    const status = h('p', { class: 'muted small' });
    let range = RANGES[3], loadId = 0, busy = false, autoTried = false;

    async function load() {
      const mine = ++loadId;   // a slow answer for an earlier button press must not overwrite a newer one
      status.textContent = 'Loading...';
      const from = range.days ? iso(new Date(Date.now() - (range.days - 1) * DAY)) : null;
      try {
        const [meta, rows, gToday, gWeek, study] = await Promise.all([
          q(sb.from('site_stats_meta').select('*').eq('id', 1)),
          fetchRows(from),
          q(sb.rpc('site_stats_top', { p_kind: 'google_landing', p_days: 1, p_limit: 25 })),
          q(sb.rpc('site_stats_top', { p_kind: 'google_landing', p_days: 7, p_limit: 25 })),
          // Totals only (migration 0087). If it is not installed yet the card says so instead of breaking the page.
          ctx.hideStudy && ctx.hideStudy() ? Promise.resolve(null) : q(sb.rpc('study_usage_totals')).catch(() => null),
        ]);
        if (mine !== loadId) return;
        const m = meta[0];
        status.textContent = !m ? 'No data yet. Press "Refresh now" once the Edge Function is set up.'
          : `${m.ok ? 'Last refreshed' : 'Last attempt failed'} ${when(m.refreshed_at)}${m.note ? `. ${m.note}` : ''}`;
        if (!m) { body.replaceChildren(h('p', { class: 'muted', text: 'Nothing to show yet. The numbers appear after the first successful refresh.' })); return; }
        draw(rows, from, gToday, gWeek, study);
        // The numbers only change when the Edge Function runs, so a panel opened hours later showed old counts.
        // Refresh quietly once if the last run is over an hour old (a short 3-day pull, so it is quick).
        if (!autoTried && (!m.ok || Date.now() - new Date(m.refreshed_at).getTime() > 3600000)) { autoTried = true; refreshNow(3, true); }
      } catch (e) {
        if (mine === loadId) status.textContent = `Could not load: ${e.message || e}`;
      }
    }

    function draw(rows, from, gToday, gWeek, study) {
      const totals = rows.filter((r) => r.kind === 'total');   // already in day order
      const pages = tally(rows, 'page').slice(0, 15), refs = tally(rows, 'referrer').slice(0, 15);
      const countries = tally(rows, 'country'), states = tally(rows, 'state');
      const first = totals.length ? totals[0].day : null;
      const span = range.days ? `${from} to ${iso(new Date())}` : first ? `${first} to ${iso(new Date())}` : 'nothing stored yet';
      const sum = (k) => totals.reduce((a, t) => a + (t[k] || 0), 0);
      const biggest = Math.max(1, ...totals.map((t) => t.page_views));
      const bars = svg('svg', { viewBox: `0 0 ${Math.max(totals.length, 1) * 10} 40`, class: 'as-bars', role: 'img', preserveAspectRatio: 'none' });
      totals.forEach((t, i) => {
        const hgt = Math.max(1, Math.round((t.page_views / biggest) * 38));
        const r = svg('rect', { x: i * 10 + 1, y: 40 - hgt, width: 8, height: hgt, class: 'as-bar' });
        const tt = svg('title', {}); tt.textContent = `${t.day}: ${num(t.visits)} visits, ${num(t.page_views)} page views`; r.append(tt);
        bars.append(r);
      });
      const cMap = new Map(countries.map((c) => [String(c.label).toUpperCase(), c]));
      const sMap = new Map(states.map((c) => [String(c.label).toUpperCase(), c]));
      const world = window.WORLD_COUNTRIES && countries.length
        ? choropleth(window.WORLD_COUNTRIES, '0 0 960 500', cMap, (k, s) => s[0]) : null;
      const usa = window.US_STATES && states.length
        ? choropleth(window.US_STATES, '0 0 975 610', sMap, (k, s) => s[0]) : null;

      body.replaceChildren(...[
        h('p', { class: 'muted small', text: `${range.label}: ${span} (whole UTC days).${range.days ? '' : ' Only days already pulled from Cloudflare are stored, so this goes back as far as the data does.'}` }),
        h('div', { class: 'as-tiles' },
          h('div', { class: 'as-tile' }, h('strong', { text: num(sum('visits')) }), h('span', { class: 'small muted', text: `visits, ${range.label.toLowerCase()}` })),
          h('div', { class: 'as-tile' }, h('strong', { text: num(sum('page_views')) }), h('span', { class: 'small muted', text: 'page views' }))),
        h('div', { class: 'panel' }, h('h3', { text: 'Pages Google sends people to' }),
          h('p', { class: 'muted small', text: 'Visits that arrived from a Google search, by the page they landed on. Google does not tell us the words searched; those are only in Search Console. Counts are by calendar day (UTC), so "Today and yesterday" is about the last 24 to 48 hours.' }),
          h('div', { class: 'as-cols' },
            h('div', {}, h('h4', { text: 'Today and yesterday' }),
              table(['Page', 'Visits', 'Views'], gToday.map(pageRow))),
            h('div', {}, h('h4', { text: 'Last 7 days' }),
              table(['Page', 'Visits', 'Views'], gWeek.map(pageRow))))),
        totals.length > 1 ? h('div', { class: 'panel' }, h('h3', { text: 'Page views per day' }), bars) : null,
        h('div', { class: 'as-cols' },
          h('div', { class: 'panel' }, h('h3', { text: 'Top pages' }),
            table(['Page', 'Visits', 'Views'], pages.map(pageRow))),
          h('div', { class: 'panel' }, h('h3', { text: 'Top referrers' }),
            table(['Site', 'Visits', 'Views'], refs.map((p) => row(p.label, p.visits, p.page_views, refHref(p.label)))))),
        h('div', { class: 'panel' }, h('h3', { text: 'Where visits come from (country)' }),
          h('p', { class: 'muted small', text: 'Cloudflare reports country only. No IP addresses and no individual visitors are stored or shown.' }),
          world, world ? legend() : null,
          table(['Country', 'Visits', 'Views'], countries.slice(0, 15).map((c) => row(SPECIAL[c.label] || regionName(c.label), c.visits, c.page_views)))),
        ctx.hideStudy && ctx.hideStudy() ? null : studyCard(study),
        h('div', { class: 'panel' }, h('h3', { text: 'Interest by state (which state guides were viewed)' }),
          h('p', { class: 'muted small', text: 'This is NOT where visitors live. It counts views of each state\'s guide and map pages. No location of any visitor is used.' }),
          usa || h('p', { class: 'muted', text: 'No state guide views yet.' }), usa ? legend() : null,
          states.length ? table(['State', 'Visits', 'Views'], states.slice(0, 15).map((c) => row(stateName(c.label), c.visits, c.page_views))) : null,
          states.length && range.days && range.days <= BY_DAY_MAX ? h('h4', { text: 'By day (page views, busiest states)' }) : null,
          states.length && range.days && range.days <= BY_DAY_MAX ? stateByDay(rows, states) : null,
          states.length && !(range.days && range.days <= BY_DAY_MAX) ? h('p', { class: 'muted small', text: 'Pick Today, By day, Week or Month to see this table day by day.' }) : null)
      ].filter(Boolean));   // replaceChildren would print a null as the word "null"
    }

    const rangeBtn = (r) => h('button', { class: 'quiet', 'aria-pressed': String(r === range), onclick: () => { range = r; root.querySelectorAll('.as-range button[data-r]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.r === range.id))); load(); }, 'data-r': r.id }, r.label);
    async function refreshNow(n, quiet) {
      if (busy) return; busy = true; refresh.disabled = true; status.textContent = 'Asking Cloudflare...';
      try {
        const { data, error } = await sb.functions.invoke('site-stats', { body: { days: n } });
        if (error) throw error;
        if (data && data.ok === false) throw new Error(data.error);
      } catch (e) { status.textContent = `${quiet ? 'Automatic refresh' : 'Refresh'} failed: ${e.message || e}`; busy = false; refresh.disabled = false; return; }
      busy = false; refresh.disabled = false; load();
    }
    const refresh = h('button', { class: 'primary', onclick: () => refreshNow(62, false) }, 'Refresh now');

    root.append(
      h('h2', { text: 'Site analytics and SEO' }),
      h('p', { class: 'muted small', text: 'Super admins only. Numbers come from Cloudflare Web Analytics (privacy-first: no cookies, no IP addresses kept). They are estimates, refreshed by hand or daily.' }),
      h('div', { class: 'btns as-range' }, RANGES.map(rangeBtn), refresh), status, body);
    seoBlock().then((b) => root.append(b));
    load();
    return root;
  }

  return { panel };
}

window.TheWayStats = { make };
})();
