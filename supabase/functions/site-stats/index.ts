// Supabase Edge Function "site-stats" (reference copy; deployed by hand in the Supabase dashboard).
// Reads Cloudflare Web Analytics through Cloudflare's GraphQL Analytics API and writes small daily summaries into
// public.site_stats_daily (0028). The Cloudflare token is a function secret that Frank sets himself; it never reaches
// the browser or the repo. No IP addresses and no per-visitor data are requested: only counts by day, page path,
// referrer host and country. "Interest by state" is worked out here from which state guide or map pages were viewed.
//
// Secrets (Edge Functions > Secrets): CF_API_TOKEN, CF_ACCOUNT_ID, optionally CF_SITE_TAG (else the michiinstitute.com
// hostname is used) and STATS_CRON_SECRET.
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase.
// Who may call it: a signed-in super admin (the Refresh button), or a caller with header x-cron-secret = STATS_CRON_SECRET.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const STATES = new Set('AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC'.split(' '));
// /guide-nc/..., /map-nc/..., /preview/pages/guide-nc/... ; Colorado's pages are /guide/ and /map/
function stateOf(path: string): string | null {
  const m = /\/(?:guide|map)-([a-z]{2})(?:\/|$)/i.exec(path);
  if (m) { const s = m[1].toUpperCase(); return STATES.has(s) ? s : null; }
  return /\/(?:guide|map)(?:\/|$)/i.test(path) ? 'CO' : null;
}

const CF = 'https://api.cloudflare.com/client/v4/graphql';
// Which site to read: by Cloudflare's site tag, or (fallback) by hostname.
type Scope = { site?: string; hosts?: string[] };
const HOSTS = ['michiinstitute.com', 'www.michiinstitute.com'];
async function cfQuery(token: string, account: string, scope: Scope, from: string, to: string, dim: string, limit: number) {
  // the hostnames are fixed constants above, so they are written into the query; only the site tag is a variable
  const siteFilter = scope.site ? '{ OR: [{ siteTag: $site }] }' : `{ requestHost_in: ${JSON.stringify(scope.hosts ?? HOSTS)} }`;
  const query = `query($acc: String!, ${scope.site ? '$site: String!, ' : ''}$from: Time!, $to: Time!) {
    viewer { accounts(filter: { accountTag: $acc }) {
      rumPageloadEventsAdaptiveGroups(
        filter: { AND: [{ datetime_geq: $from, datetime_leq: $to }, ${siteFilter}] }
        limit: ${limit}, orderBy: [count_DESC]) {
        count
        sum { visits }
        dimensions { date ${dim} }
      } } } }`;
  const res = await fetch(CF, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables: scope.site ? { acc: account, site: scope.site, from, to } : { acc: account, from, to } }),
  });
  const body = await res.json();
  if (!res.ok || body.errors?.length) throw new Error(`Cloudflare ${dim || 'total'}: ${body.errors?.[0]?.message || res.status}`);
  return (body.data?.viewer?.accounts?.[0]?.rumPageloadEventsAdaptiveGroups ?? []) as
    { count: number; sum: { visits: number }; dimensions: Record<string, string> }[];
}

type Row = { day: string; kind: string; label: string; visits: number; page_views: number };
const add = (m: Map<string, Row>, day: string, kind: string, label: string, visits: number, pv: number) => {
  const k = `${day}|${kind}|${label}`;
  const r = m.get(k) ?? { day, kind, label: label.slice(0, 200), visits: 0, page_views: 0 };
  r.visits += visits; r.page_views += pv; m.set(k, r);
};
// keep the busiest `n` labels of one kind per day
function topPerDay(rows: Row[], kind: string, n: number) {
  const byDay = new Map<string, Row[]>();
  for (const r of rows.filter((x) => x.kind === kind)) byDay.set(r.day, [...(byDay.get(r.day) ?? []), r]);
  return [...byDay.values()].flatMap((l) => l.sort((a, b) => b.page_views - a.page_views).slice(0, n));
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const env = (k: string) => Deno.env.get(k) ?? '';
  const admin = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });

  // ---- who is asking
  const cron = env('STATS_CRON_SECRET');
  let allowed = !!cron && req.headers.get('x-cron-secret') === cron;
  if (!allowed) {
    const jwt = (req.headers.get('authorization') ?? '').replace(/^Bearer /i, '');
    const { data } = await admin.auth.getUser(jwt);
    if (data?.user) {
      const { data: roles } = await admin.from('member_roles').select('role').eq('member_id', data.user.id).eq('role', 'super_admin');
      const { data: m } = await admin.from('members').select('status').eq('id', data.user.id).maybeSingle();
      allowed = !!roles?.length && m?.status === 'active';
    }
  }
  if (!allowed) return json({ ok: false, error: 'Super admins only.' }, 403);

  const token = env('CF_API_TOKEN'), account = env('CF_ACCOUNT_ID'), site = env('CF_SITE_TAG');   // CF_SITE_TAG is optional
  const fail = async (note: string) => {
    await admin.from('site_stats_meta').upsert({ id: 1, refreshed_at: new Date().toISOString(), ok: false, note: note.slice(0, 500) });
    return json({ ok: false, error: note });
  };
  if (!token || !account) return fail('Not set up yet: add CF_API_TOKEN and CF_ACCOUNT_ID (and CF_SITE_TAG if you have it) in Edge Functions > Secrets.');

  try {
    let days = 30;
    try { const b = await req.json(); if (b?.days) days = Math.max(1, Math.min(62, Math.floor(+b.days))); } catch { /* no body */ }
    const end = new Date();
    const first = new Date(end.getTime() - days * 86400000).toISOString().slice(0, 10);
    const start = new Date(first + 'T00:00:00Z');   // whole UTC days, so slices never overlap

    // Cloudflare limits how long one query may span, so ask in slices of at most 28 days.
    type G = Awaited<ReturnType<typeof cfQuery>>;
    const pull = async (scope: Scope) => {
      const out = { totals: [] as G, paths: [] as G, refs: [] as G, countries: [] as G };
      for (let a = start.getTime(); a < end.getTime(); a += 28 * 86400000) {
        const from = new Date(a).toISOString().slice(0, 10) + 'T00:00:00Z';
        const to = new Date(Math.min(a + 28 * 86400000 - 1000, end.getTime())).toISOString();
        const [t, p, r, c] = await Promise.all([
          cfQuery(token, account, scope, from, to, '', 1000),
          cfQuery(token, account, scope, from, to, 'requestPath', 5000),
          cfQuery(token, account, scope, from, to, 'refererHost', 1000),
          cfQuery(token, account, scope, from, to, 'countryName', 1000),
        ]);
        out.totals.push(...t); out.paths.push(...p); out.refs.push(...r); out.countries.push(...c);
      }
      return out;
    };
    // A wrong site tag does not error, it just returns nothing, so fall back to the hostname.
    let got = site ? await pull({ site }) : null;
    let via = 'site tag';
    if (!got || !got.totals.length) { got = await pull({ hosts: HOSTS }); via = 'hostname'; }
    const { totals, paths, refs, countries } = got;

    const m = new Map<string, Row>();
    for (const g of totals) add(m, g.dimensions.date, 'total', 'all', g.sum?.visits ?? 0, g.count);
    for (const g of paths) {
      const p = (g.dimensions.requestPath || '/').slice(0, 200);
      add(m, g.dimensions.date, 'page', p, g.sum?.visits ?? 0, g.count);
      const st = stateOf(p);
      if (st) add(m, g.dimensions.date, 'state', st, g.sum?.visits ?? 0, g.count);
    }
    for (const g of refs) if (g.dimensions.refererHost) add(m, g.dimensions.date, 'referrer', g.dimensions.refererHost, g.sum?.visits ?? 0, g.count);
    for (const g of countries) if (g.dimensions.countryName) add(m, g.dimensions.date, 'country', g.dimensions.countryName, g.sum?.visits ?? 0, g.count);

    const all = [...m.values()];
    const rows = [...all.filter((r) => ['total', 'state', 'country'].includes(r.kind)),
      ...topPerDay(all, 'page', 25), ...topPerDay(all, 'referrer', 25)];

    // replace the window, then drop anything older than a year
    const del = await admin.from('site_stats_daily').delete().gte('day', first);
    if (del.error) throw new Error(del.error.message);
    for (let i = 0; i < rows.length; i += 500) {
      const ins = await admin.from('site_stats_daily').insert(rows.slice(i, i + 500));
      if (ins.error) throw new Error(ins.error.message);
    }
    await admin.from('site_stats_daily').delete().lt('day', new Date(end.getTime() - 400 * 86400000).toISOString().slice(0, 10));
    await admin.from('site_stats_meta').upsert({ id: 1, refreshed_at: new Date().toISOString(), ok: true, window_from: first, note: `${rows.length} rows for ${days} days (matched by ${via})` });
    return json({ ok: true, rows: rows.length, days });
  } catch (e) {
    return await fail(String((e as Error).message || e));
  }
});
