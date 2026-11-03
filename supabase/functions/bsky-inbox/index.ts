// Supabase Edge Function "bsky-inbox" (reference copy; deployed by hand in the Supabase dashboard).
// Pulls replies, mentions and quotes of the Michi Institute Bluesky account into public.fb_inbox (0098, 0099) and posts a
// reply when a super admin asks from Admin > Facebook. The app password is a function secret that Frank sets himself;
// it never reaches the browser or the repo. Use an App Password (Bluesky Settings > Privacy and security), never the main password.
//
// Secrets (Edge Functions > Secrets): BSKY_HANDLE (for example name.bsky.social), BSKY_APP_PASSWORD,
// STATS_CRON_SECRET (same one site-stats uses, for the scheduled call).
// Who may call it: a signed-in super admin, or (pull only) a caller with header x-cron-secret = STATS_CRON_SECRET.
// Body: { action: 'pull' } or { action: 'reply', id, message }.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const PDS = 'https://bsky.social';   // fixed address, never taken from a request
type Json = Record<string, any>;
async function xrpc(method: 'GET' | 'POST', nsid: string, jwt: string | null, params?: Json): Promise<Json> {
  const url = `${PDS}/xrpc/${nsid}${method === 'GET' && params ? '?' + new URLSearchParams(params) : ''}`;
  const res = await fetch(url, {
    method,
    headers: { ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}), ...(method === 'POST' ? { 'Content-Type': 'application/json' } : {}) },
    body: method === 'POST' ? JSON.stringify(params ?? {}) : undefined,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.message || body.error || `Bluesky ${res.status}`);
  return body;
}
const link = (uri: string) => {
  const m = /^at:\/\/(did:[a-z]+:[A-Za-z0-9._:%-]+)\/app\.bsky\.feed\.post\/([A-Za-z0-9]+)$/.exec(uri);
  return m ? `https://bsky.app/profile/${m[1]}/post/${m[2]}` : null;
};

// A plain web address in a post is not clickable on Bluesky unless it is marked up. Offsets are UTF-8 byte positions.
function facets(text: string) {
  const enc = new TextEncoder(), out: Json[] = [];
  for (const m of text.matchAll(/https?:\/\/[^\s]+/g)) {
    const url = m[0].replace(/[.,;:!?)\]]+$/, '');
    const start = enc.encode(text.slice(0, m.index)).length;
    out.push({ index: { byteStart: start, byteEnd: start + enc.encode(url).length },
      features: [{ $type: 'app.bsky.richtext.facet#link', uri: url }] });
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const env = (k: string) => Deno.env.get(k) ?? '';
  const admin = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });

  let body: Json = {};
  try { body = await req.json(); } catch { /* no body */ }
  const act = body?.action === 'reply' ? 'reply' : body?.action === 'post' ? 'post' : 'pull';

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

  const handle = env('BSKY_HANDLE'), pass = env('BSKY_APP_PASSWORD');
  if (!handle || !pass) return json({ ok: false, error: 'Not set up yet: add BSKY_HANDLE and BSKY_APP_PASSWORD in Edge Functions > Secrets.' });

  try {
    const s = await xrpc('POST', 'com.atproto.server.createSession', null, { identifier: handle, password: pass });
    const jwt = s.accessJwt as string, did = s.did as string;

    if (act === 'post') {
      const message = String(body.message ?? '').trim();
      if (!message || [...message].length > 300) return json({ ok: false, error: 'A Bluesky post must be 1 to 300 characters.' }, 400);
      const r = await xrpc('POST', 'com.atproto.repo.createRecord', jwt, {
        repo: did, collection: 'app.bsky.feed.post',
        record: { $type: 'app.bsky.feed.post', text: message, createdAt: new Date().toISOString(), facets: facets(message) },
      });
      return json({ ok: true, uri: r.uri });
    }

    if (act === 'reply') {
      const id = String(body.id ?? ''), message = String(body.message ?? '').trim();
      if (!message || [...message].length > 300) return json({ ok: false, error: 'A Bluesky reply must be 1 to 300 characters.' }, 400);
      const { data: row } = await admin.from('fb_inbox').select('id,ref_cid,root_uri,root_cid').eq('id', id).eq('platform', 'bluesky').maybeSingle();
      if (!row || !row.ref_cid) return json({ ok: false, error: 'That post is not in the inbox.' }, 404);
      const now = new Date().toISOString();
      await xrpc('POST', 'com.atproto.repo.createRecord', jwt, {
        repo: did, collection: 'app.bsky.feed.post',
        record: { $type: 'app.bsky.feed.post', text: message, createdAt: now, facets: facets(message),
          reply: { root: { uri: row.root_uri || row.id, cid: row.root_cid || row.ref_cid }, parent: { uri: row.id, cid: row.ref_cid } } },
      });
      await admin.from('fb_inbox').update({ replied_at: now, reply_text: message, read_at: now }).eq('id', id);
      return json({ ok: true });
    }

    const n = await xrpc('GET', 'app.bsky.notification.listNotifications', jwt, { limit: '50' });
    const items = (n.notifications ?? []).filter((x: Json) => ['reply', 'mention', 'quote'].includes(x.reason) && x.author?.did !== did)
      .map((x: Json) => ({
        id: String(x.uri), platform: 'bluesky', kind: 'comment', post_id: x.reasonSubject ? String(x.reasonSubject).slice(0, 80) : null,
        post_link: link(String(x.uri)), parent_id: x.reason === 'reply' ? String(x.record?.reply?.parent?.uri ?? '').slice(0, 300) || null : null,
        author_name: String(x.author?.displayName || x.author?.handle || 'Someone').slice(0, 200),
        message: x.record?.text ? String(x.record.text).slice(0, 8000) : null,
        posted_at: x.record?.createdAt || x.indexedAt, ref_cid: String(x.cid),
        root_uri: x.record?.reply?.root?.uri ? String(x.record.reply.root.uri) : null, root_cid: x.record?.reply?.root?.cid ? String(x.record.reply.root.cid) : null,
      }));
    if (items.length) {
      const ins = await admin.from('fb_inbox').upsert(items, { onConflict: 'id', ignoreDuplicates: true });
      if (ins.error) throw new Error(ins.error.message);
    }
    return json({ ok: true, items: items.length });
  } catch (e) {
    return json({ ok: false, error: String((e as Error).message || e) });
  }
});
