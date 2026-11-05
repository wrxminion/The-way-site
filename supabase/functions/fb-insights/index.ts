// Supabase Edge Function "fb-insights" (reference copy; deployed by hand in the Supabase dashboard).
// Reads the Michi Institute Facebook Page through the Graph API and writes small summaries into public.fb_insights_daily,
// public.fb_inbox and public.fb_meta (0098). Also posts a reply to a comment when a super admin asks from Admin > Facebook.
// The Page token is a function secret that Frank sets himself; it never reaches the browser or the repo.
//
// Secrets (Edge Functions > Secrets): FB_PAGE_ID, FB_PAGE_TOKEN, optionally FB_GRAPH_VERSION (default v25.0) and
// STATS_CRON_SECRET (the same one site-stats uses, for the scheduled call).
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase.
// Who may call it: a signed-in super admin, or (pull only) a caller with header x-cron-secret = STATS_CRON_SECRET.
// Body: { action: 'pull', days?: 1..60 } or { action: 'reply', comment_id, message }
//   or { action: 'post', message, image?: 'data:image/jpeg;base64,...' } (super admins and the Media Director)
//   or { action: 'preview', url } (same people): the article's preview pictures as data: URLs, for the picker.
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

// ---- article pictures for the Media page picker
// Reads one public https page (15 s, 1.5 MB), collects its preview pictures (og:image first), and returns up to 4 of them
// as data: URLs (2 MB each, 6 MB in all). Only public https hosts: no IP addresses, no localhost.
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) MichiInstitute-preview/1';
function okUrl(u: string) {
  try {
    const x = new URL(u);
    if (x.protocol !== 'https:') return false;
    const host = x.hostname.toLowerCase();
    if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal') || !host.includes('.')) return false;
    if (/^[\d.]+$/.test(host) || host.includes(':') || host.startsWith('[')) return false;   // IP literals
    return true;
  } catch { return false; }
}
async function readCapped(res: Response, cap: number): Promise<Uint8Array> {
  const reader = res.body?.getReader();
  if (!reader) return new Uint8Array();
  const parts: Uint8Array[] = []; let n = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    n += value.length;
    if (n > cap) { try { await reader.cancel(); } catch { /* ignore */ } throw new Error('too big'); }
    parts.push(value);
  }
  const out = new Uint8Array(n); let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}
function b64(bytes: Uint8Array) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
async function previewImages(url: string) {
  if (!okUrl(url) || url.length > 500) throw new Error('That is not a public https link.');
  const page = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html' }, redirect: 'follow', signal: AbortSignal.timeout(15000) });
  if (!page.ok) throw new Error(`The page answered ${page.status}.`);
  if (!okUrl(page.url)) throw new Error('The page moved to a link that is not public https.');
  const html = new TextDecoder().decode(await readCapped(page, 1_500_000).catch(() => { throw new Error('The page is too big to read.'); }));
  const found: string[] = [];
  const add = (src: string | undefined) => {
    if (!src) return;
    try {
      const abs = new URL(src.replace(/&amp;/g, '&').trim(), page.url).toString();
      if (okUrl(abs) && !found.includes(abs) && !/\.svg(\?|$)/i.test(abs)) found.push(abs);
    } catch { /* bad address */ }
  };
  const metaRe = /<meta\b[^>]*>/gi;
  const attr = (tag: string, name: string) => (new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`, 'i').exec(tag) || [])[1];
  for (const want of ['og:image:secure_url', 'og:image', 'og:image:url', 'twitter:image', 'twitter:image:src']) {
    for (const tag of html.match(metaRe) ?? []) {
      const key = (attr(tag, 'property') || attr(tag, 'name') || '').toLowerCase();
      if (key === want) add(attr(tag, 'content'));
    }
  }
  for (const tag of html.match(/<link\b[^>]*rel=["']image_src["'][^>]*>/gi) ?? []) add(attr(tag, 'href'));
  for (const tag of (html.match(/<img\b[^>]*>/gi) ?? []).slice(0, 60)) {
    const w = Number(attr(tag, 'width') || 0);
    if (w && w < 300) continue;                                        // icons, avatars, tracking pixels
    if (/logo|icon|avatar|sprite|pixel|badge/i.test(tag)) continue;
    add(attr(tag, 'src') || attr(tag, 'data-src'));
    if (found.length >= 10) break;
  }
  const out: { url: string; data: string }[] = []; let total = 0;
  const got = await Promise.all(found.slice(0, 8).map(async (src) => {
    try {
      const r = await fetch(src, { headers: { 'User-Agent': UA, Accept: 'image/*' }, signal: AbortSignal.timeout(10000) });
      const type = (r.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
      if (!r.ok || !/^image\/(jpeg|png|webp|gif)$/.test(type)) return null;
      const bytes = await readCapped(r, 2_000_000);
      if (bytes.length < 5000) return null;                            // too small to be a real picture
      return { url: src, type, bytes };
    } catch { return null; }
  }));
  for (const g of got) {
    if (!g || out.length >= 4 || total + g.bytes.length > 6_000_000) continue;
    total += g.bytes.length;
    out.push({ url: g.url, data: `data:${g.type};base64,${b64(g.bytes)}` });
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const env = (k: string) => Deno.env.get(k) ?? '';
  const admin = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });

  let body: Json = {};
  try { body = await req.json(); } catch { /* no body */ }
  const act = body?.action === 'reply' ? 'reply' : body?.action === 'post' ? 'post' : body?.action === 'preview' ? 'preview' : 'pull';
  const mediaAct = act === 'post' || act === 'preview';   // the Media Director may do these too

  // ---- who is asking
  const cron = env('STATS_CRON_SECRET');
  let allowed = act === 'pull' && !!cron && req.headers.get('x-cron-secret') === cron;
  if (!allowed) {
    const jwt = (req.headers.get('authorization') ?? '').replace(/^Bearer /i, '');
    const { data } = await admin.auth.getUser(jwt);
    if (data?.user) {
      const { data: roles } = await admin.from('member_roles').select('role').eq('member_id', data.user.id).in('role', mediaAct ? ['super_admin', 'marketing'] : ['super_admin']);
      const { data: m } = await admin.from('members').select('status').eq('id', data.user.id).maybeSingle();
      allowed = !!roles?.length && m?.status === 'active';
    }
  }
  if (!allowed) return json({ ok: false, error: mediaAct ? 'Super admins and the Media Director only.' : 'Super admins only.' }, 403);

  // ---- the pictures an article offers (og:image, twitter:image, large <img>), for the picker on the Media page.
  // Returned as data: URLs, because the members page only shows images from itself or data: (CSP img-src 'self' data:).
  if (act === 'preview') {
    try { return json({ ok: true, images: await previewImages(String(body.url ?? '')) }); }
    catch (e) { return json({ ok: false, error: String((e as Error).message || e) }); }
  }

  const pageId = env('FB_PAGE_ID'), token = env('FB_PAGE_TOKEN'), ver = env('FB_GRAPH_VERSION') || 'v25.0';
  const fail = async (note: string) => {
    if (act === 'pull') await admin.from('fb_meta').upsert({ id: 1, refreshed_at: new Date().toISOString(), ok: false, note: note.slice(0, 1000) });
    return json({ ok: false, error: note });
  };
  if (!pageId || !token) return fail('Not set up yet: add FB_PAGE_ID and FB_PAGE_TOKEN in Edge Functions > Secrets.');
  if (!/^\d{5,25}$/.test(pageId)) return fail('FB_PAGE_ID should be the numeric Page id.');

  // ---- publish a new post on the Page (needs the pages_manage_posts permission on the token)
  if (act === 'post') {
    const message = String(body.message ?? '').trim();
    if (!message || message.length > 5000) return json({ ok: false, error: 'A post must be 1 to 5000 characters.' }, 400);
    try {
      // With a picture (a JPEG or PNG made on the Media page: the chosen article picture with our small logo, or our logo
      // card), it goes up as a Page photo post with the text as its caption. Without one, a plain text post as before.
      const image = String(body.image ?? '');
      if (image) {
        const m = /^data:(image\/(?:jpeg|png));base64,([A-Za-z0-9+/=]+)$/.exec(image);
        if (!m) return json({ ok: false, error: 'The picture must be a JPEG or PNG.' }, 400);
        const bytes = Uint8Array.from(atob(m[2]), (c) => c.charCodeAt(0));
        if (bytes.length > 4_000_000) return json({ ok: false, error: 'The picture is too big (4 MB at most).' }, 400);
        const fd = new FormData();
        fd.append('caption', message);
        fd.append('published', 'true');
        fd.append('source', new Blob([bytes], { type: m[1] }), m[1] === 'image/png' ? 'picture.png' : 'picture.jpg');
        const res = await fetch(`${BASE}/${ver}/${pageId}/photos`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd });
        const r = await res.json().catch(() => ({}));
        if (!res.ok || r.error) throw new Error(r.error?.message ? `${r.error.message} (code ${r.error.code})` : `Facebook ${res.status}`);
        return json({ ok: true, id: r.post_id || r.id });
      }
      const r = await graph(`${pageId}/feed`, token, ver, { message }, true);
      return json({ ok: true, id: r.id });
    } catch (e) { return json({ ok: false, error: String((e as Error).message || e) }); }
  }

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
