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
  const row = (label, a, b) => h('tr', {}, h('td', { text: label }), h('td', { class: 'num', text: num(a) }), h('td', { class: 'num', text: num(b) }));

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

  function panel() {
    const root = h('div', { class: 'as-root' });
    const body = h('div');
    const status = h('p', { class: 'muted small' });
    let days = 30, busy = false;

    async function load() {
      status.textContent = 'Loading...';
      const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
      try {
        const [meta, totals, pages, refs, countries, states] = await Promise.all([
          q(sb.from('site_stats_meta').select('*').eq('id', 1)),
          q(sb.from('site_stats_daily').select('day,visits,page_views').eq('kind', 'total').gte('day', since).order('day')),
          q(sb.rpc('site_stats_top', { p_kind: 'page', p_days: days, p_limit: 15 })),
          q(sb.rpc('site_stats_top', { p_kind: 'referrer', p_days: days, p_limit: 15 })),
          q(sb.rpc('site_stats_top', { p_kind: 'country', p_days: days, p_limit: 300 })),
          q(sb.rpc('site_stats_top', { p_kind: 'state', p_days: days, p_limit: 60 })),
        ]);
        const m = meta[0];
        status.textContent = !m ? 'No data yet. Press "Refresh now" once the Edge Function is set up.'
          : `${m.ok ? 'Last refreshed' : 'Last attempt failed'} ${when(m.refreshed_at)}${m.note ? `. ${m.note}` : ''}`;
        draw(totals, pages, refs, countries, states);
      } catch (e) {
        status.textContent = `Could not load: ${e.message || e}`;
      }
    }

    function draw(totals, pages, refs, countries, states) {
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

      body.replaceChildren(
        h('div', { class: 'as-tiles' },
          h('div', { class: 'as-tile' }, h('strong', { text: num(sum('visits')) }), h('span', { class: 'small muted', text: `visits, last ${days} days` })),
          h('div', { class: 'as-tile' }, h('strong', { text: num(sum('page_views')) }), h('span', { class: 'small muted', text: 'page views' }))),
        totals.length ? h('div', { class: 'panel' }, h('h3', { text: 'Page views per day' }), bars) : null,
        h('div', { class: 'as-cols' },
          h('div', { class: 'panel' }, h('h3', { text: 'Top pages' }),
            table(['Page', 'Visits', 'Views'], pages.map((p) => row(p.label, p.visits, p.page_views)))),
          h('div', { class: 'panel' }, h('h3', { text: 'Top referrers' }),
            table(['Site', 'Visits', 'Views'], refs.map((p) => row(p.label, p.visits, p.page_views))))),
        h('div', { class: 'panel' }, h('h3', { text: 'Where visits come from (country)' }),
          h('p', { class: 'muted small', text: 'Cloudflare reports country only. No IP addresses and no individual visitors are stored or shown.' }),
          world, world ? legend() : null,
          table(['Country', 'Visits', 'Views'], countries.slice(0, 15).map((c) => row(SPECIAL[c.label] || regionName(c.label), c.visits, c.page_views)))),
        h('div', { class: 'panel' }, h('h3', { text: 'Interest by state (which state guides were viewed)' }),
          h('p', { class: 'muted small', text: 'This is NOT where visitors live. It counts views of each state\'s guide and map pages. No location of any visitor is used.' }),
          usa || h('p', { class: 'muted', text: 'No state guide views yet.' }), usa ? legend() : null,
          states.length ? table(['State', 'Visits', 'Views'], states.slice(0, 15).map((c) => row((window.US_STATES && window.US_STATES[c.label] ? window.US_STATES[c.label][0] : c.label), c.visits, c.page_views))) : null));
    }

    const range = (n) => h('button', { class: 'quiet', 'aria-pressed': String(n === days), onclick: () => { days = n; root.querySelectorAll('.as-range button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.d === String(days)))); load(); }, 'data-d': n }, `${n} days`);
    const refresh = h('button', { class: 'primary', onclick: async () => {
      if (busy) return; busy = true; refresh.disabled = true; status.textContent = 'Asking Cloudflare...';
      try {
        const { data, error } = await sb.functions.invoke('site-stats', { body: { days: 62 } });
        if (error) throw error;
        if (data && data.ok === false) throw new Error(data.error);
      } catch (e) { status.textContent = `Refresh failed: ${e.message || e}`; busy = false; refresh.disabled = false; return; }
      busy = false; refresh.disabled = false; load();
    } }, 'Refresh now');

    root.append(
      h('h2', { text: 'Site analytics and SEO' }),
      h('p', { class: 'muted small', text: 'Super admins only. Numbers come from Cloudflare Web Analytics (privacy-first: no cookies, no IP addresses kept). They are estimates, refreshed by hand or daily.' }),
      h('div', { class: 'btns as-range' }, range(7), range(30), refresh), status, body);
    seoBlock().then((b) => root.append(b));
    load();
    return root;
  }

  return { panel };
}

window.TheWayStats = { make };
})();
