// Supabase Edge Function "fb-insights" (reference copy; deployed by hand in the Supabase dashboard).
// Reads the Michi Institute Facebook Page through the Graph API and writes small summaries into public.fb_insights_daily,
// public.fb_inbox and public.fb_meta (0098). Also posts a reply to a comment when a super admin asks from Admin > Facebook.
// The Page token is a function secret that Frank sets himself; it never reaches the browser or the repo.
//
// Secrets (Edge Functions > Secrets): FB_PAGE_ID, FB_PAGE_TOKEN, optionally FB_GRAPH_VERSION (default v25.0) and
// STATS_CRON_SECRET (the same one site-stats uses, for the scheduled call).
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase.
// Who may call it: a signed-in super admin, or (pull only) a caller with header x-cron-secret = STATS_CRON_SECRET.
// Body: { action: 'pull', days?: 1..60 } or { action: 'reply', comment_id, message }.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

// Page Insights metrics that exist today (checked against Meta's docs, Nov 2026). Meta has renamed and removed many:
// page_fans, page_impressions*, page_fan_adds and page_fan_removes are gone (use page_follows and page_media_view).
// Each is asked for on its own, so one that Meta later retires only drops that one number, not the whole pull.
const METRICS = [
  'page_follows',                  // total followers at the end of the day
  'page_daily_follows_unique',     // new followers that day
  'page_daily_unfollows_unique',   // lost followers that day
  'page_media_view',               // views of the Page's content (replaces impressions)
  'page_total_media_view_unique',  // people who viewed the content (replaces reach)
  'page_post_engagements',         // reactions, comments, shares, clicks on posts
  'page_views_total',              // visits to the Page itself
];
const BASE = 'https://graph.facebook.com';
const DAY = 86400000;

type Json = Record<string, any>;
async function graph(path: string, token: string, ver: string, params: Record<string, string> = {}, post = false): Promise<Json> {
  const qs = new URLSearchParams(params);
  // the token travels in a header, never in the URL
  const res = await fetch(`${BASE}/${ver}/${path}${post ? '' : '?' + qs}`, {
    method: post ? 'POST' : 'GET',
    headers: { Authorization: `Bearer ${token}`, ...(post ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}) },
    body: post ? qs : undefined,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.error) throw new Error(body.error?.message ? `${body.error.message} (code ${body.error.code})` : `Facebook ${res.status}`);
  return body;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const env = (k: string) => Deno.env.get(k) ?? '';
  const admin = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });

  let body: Json = {};
  try { body = await req.json(); } catch { /* no body */ }
  const act = body?.action === 'reply' ? 'reply' : 'pull';

  // ---- who is asking
  const cron = env('STATS_CRON_SECRET');
  let allowed = act === 'pull' && !!cron && req.headers.get('x-cron-secret') === cron;
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

  const pageId = env('FB_PAGE_ID'), token = env('FB_PAGE_TOKEN'), ver = env('FB_GRAPH_VERSION') || 'v25.0';
  const fail = async (note: string) => {
    if (act === 'pull') await admin.from('fb_meta').upsert({ id: 1, refreshed_at: new Date().toISOString(), ok: false, note: note.slice(0, 1000) });
    return json({ ok: false, error: note });
  };
  if (!pageId || !token) return fail('Not set up yet: add FB_PAGE_ID and FB_PAGE_TOKEN in Edge Functions > Secrets.');
  if (!/^\d{5,25}$/.test(pageId)) return fail('FB_PAGE_ID should be the numeric Page id.');

  // ---- reply to a comment
  if (act === 'reply') {
    const id = String(body.comment_id ?? ''), message = String(body.message ?? '').trim();
    if (!/^\d+_\d+$/.test(id)) return json({ ok: false, error: 'Bad comment id.' }, 400);
    if (!message || message.length > 2000) return json({ ok: false, error: 'Reply must be 1 to 2000 characters.' }, 400);
    const { data: row } = await admin.from('fb_inbox').select('id').eq('id', id).maybeSingle();
    if (!row) return json({ ok: false, error: 'That comment is not in the inbox.' }, 404);
    try {
      await graph(`${id}/comments`, token, ver, { message }, true);
    } catch (e) { return json({ ok: false, error: String((e as Error).message || e) }); }
    const now = new Date().toISOString();
    await admin.from('fb_inbox').update({ replied_at: now, reply_text: message, read_at: now }).eq('id', id);
    return json({ ok: true });
  }

  // ---- pull numbers and new comments
  try {
    const days = Math.max(1, Math.min(60, Math.floor(+body?.days || 7)));
    const until = new Date(), since = new Date(until.getTime() - days * DAY);
    const notes: string[] = [];
    const rows = new Map<string, { day: string; metric: string; value: number }>();

    // Followers right now. Works for a brand-new Page; the Insights metrics below need more history and may be empty.
    try {
      const p = await graph(pageId, token, ver, { fields: 'followers_count,fan_count' });
      const today = until.toISOString().slice(0, 10);
      if (typeof p.followers_count === 'number') rows.set(`${today}|followers_count`, { day: today, metric: 'followers_count', value: p.followers_count });
    } catch (e) { notes.push(`Page info: ${(e as Error).message}`); }

    let gotAny = false;
    for (const metric of METRICS) {
      try {
        const r = await graph(`${pageId}/insights`, token, ver,
          { metric, period: 'day', since: String(Math.floor(since.getTime() / 1000)), until: String(Math.floor(until.getTime() / 1000)) });
        for (const series of r.data ?? []) for (const v of series.values ?? []) {
          // end_time is the end of the day measured; a metric with a breakdown returns an object, which is summed
          const n = typeof v.value === 'number' ? v.value : Object.values(v.value ?? {}).reduce((a: number, b: unknown) => a + (typeof b === 'number' ? b : 0), 0);
          const d = new Date(new Date(v.end_time).getTime() - 1000).toISOString().slice(0, 10);
          rows.set(`${d}|${metric}`, { day: d, metric, value: n as number }); gotAny = true;
        }
      } catch (e) { notes.push(`${metric}: ${(e as Error).message}`); }
    }
    if (!gotAny) notes.unshift('No Insights data returned yet. Facebook only gives Insights to Pages with 100 or more likes, and new Pages can take days to start.');

    const list = [...rows.values()];
    for (let i = 0; i < list.length; i += 500) {
      const up = await admin.from('fb_insights_daily').upsert(list.slice(i, i + 500), { onConflict: 'day,metric' });
      if (up.error) throw new Error(up.error.message);
    }

    // Comments (and replies to them) on recent Page posts, plus posts visitors made on the Page.
    type Item = { id: string; kind: string; post_id: string | null; post_link: string | null; parent_id: string | null; author_name: string | null; message: string | null; posted_at: string };
    const items: Item[] = [], ownReplies: string[] = [];
    const take = (c: Json, postId: string, link: string | null, parent: string | null) => {
      if (!c?.id) return;
      if (c.from?.id === pageId) { if (parent) ownReplies.push(parent); return; }   // our own reply: just mark the parent answered
      items.push({ id: c.id, kind: 'comment', post_id: postId, post_link: link, parent_id: parent,
        author_name: c.from?.name ? String(c.from.name).slice(0, 200) : null, message: c.message ? String(c.message).slice(0, 8000) : null,
        posted_at: c.created_time });
    };
    try {
      const feed = await graph(`${pageId}/feed`, token, ver, {
        fields: 'id,permalink_url,comments.limit(100){id,message,created_time,from,comments.limit(50){id,message,created_time,from}}',
        since: String(Math.floor((until.getTime() - 60 * DAY) / 1000)), limit: '25' });
      for (const post of feed.data ?? []) for (const c of post.comments?.data ?? []) {
        take(c, post.id, post.permalink_url ?? null, null);
        for (const r of c.comments?.data ?? []) take(r, post.id, post.permalink_url ?? null, c.id);
      }
    } catch (e) { notes.push(`Comments: ${(e as Error).message}`); }
    try {
      const vp = await graph(`${pageId}/visitor_posts`, token, ver, { fields: 'id,message,created_time,from,permalink_url', limit: '25' });
      for (const v of vp.data ?? []) if (v.from?.id !== pageId) items.push({ id: v.id, kind: 'visitor_post', post_id: v.id, post_link: v.permalink_url ?? null,
        parent_id: null, author_name: v.from?.name ? String(v.from.name).slice(0, 200) : null, message: v.message ? String(v.message).slice(0, 8000) : null, posted_at: v.created_time });
    } catch (e) { notes.push(`Visitor posts: ${(e as Error).message}`); }

    // New items only: an existing row keeps its read and replied marks.
    if (items.length) {
      const ins = await admin.from('fb_inbox').upsert(items, { onConflict: 'id', ignoreDuplicates: true });
      if (ins.error) throw new Error(ins.error.message);
    }
    if (ownReplies.length) await admin.from('fb_inbox').update({ replied_at: new Date().toISOString() }).in('id', ownReplies).is('replied_at', null);

    // keep two years of daily numbers
    await admin.from('fb_insights_daily').delete().lt('day', new Date(until.getTime() - 730 * DAY).toISOString().slice(0, 10));
    await admin.from('fb_meta').upsert({ id: 1, refreshed_at: new Date().toISOString(), ok: true,
      note: `${list.length} daily numbers, ${items.length} comments or posts seen${notes.length ? '. ' + notes.join(' | ') : ''}`.slice(0, 1000) });
    return json({ ok: true, numbers: list.length, items: items.length, notes });
  } catch (e) {
    return await fail(String((e as Error).message || e));
  }
});
