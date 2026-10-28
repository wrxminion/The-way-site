// Node check of the Edge Function logic with a fake database (no Deno needed):  node handler.test.mjs
// It strips the Deno-only import and runs handler() with a stub client and a stub fetch.
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const src = readFileSync(new URL('./index.ts', import.meta.url), 'utf8')
  .replace(/^import .*$/m, 'const createClient = null;')
  .replace('if (import.meta.main) Deno.serve((req) => handler(req));', '')
  .replace('const ORIGINS = (Deno.env.get("ALLOWED_ORIGINS") ?? ', 'const ORIGINS = (undefined ?? ');
const f = join(tmpdir(), 'pull-thread-under-test.ts');
writeFileSync(f, src);
const js = execFileSync(process.execPath, ['--experimental-strip-types', '--no-warnings', '-e',
  `import('${f}').then(m => process.stdout.write(Object.keys(m).join(',')))`]).toString();
if (!js.includes('handler')) throw new Error('module did not load');
const m = await import(f);
let pass = 0; const ok = (c, w) => { if (!c) { console.error('FAIL:', w); process.exit(1); } pass++; console.log('pass:', w); };

const env = (o) => ({ get: (k) => ({ SUPABASE_URL: 'http://x', SUPABASE_SERVICE_ROLE_KEY: 'k', RATE_SALT: 's', TURNSTILE_SECRET: 't', ...o })[k] });
const calls = [];
const mk = (rpcResult = { data: { receipt: 'abc', status: 'queued', matches: [] }, error: null }, user = null) => () => ({
  auth: { getUser: async () => ({ data: { user } }) },
  from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: user ? { id: user.id, status: 'active' } : null }) }) }) }),
  storage: { from: () => ({ upload: async (p) => { calls.push(['upload', p]); return { error: null }; }, remove: async (p) => { calls.push(['remove', p]); } }) },
  rpc: async (n, a) => { calls.push(['rpc', n, a]); return rpcResult; },
});
const realFetch = globalThis.fetch;
const fetched = [];
globalThis.fetch = async (u) => { fetched.push(String(u)); return new Response(JSON.stringify({ success: true }), { status: 200 }); };
const post = (fields, headers = {}) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  const body = new Response(fd);
  return body.arrayBuffer().then(async (ab) => new Request('https://x/fn', { method: 'POST', body: ab,
    headers: { origin: 'https://michiinstitute.com', 'content-type': body.headers.get('content-type'), 'content-length': String(ab.byteLength), ...headers } }));
};

let r = await m.handler(await post({ kind: 'question', question: 'Is it?' }, { origin: 'https://evil.example' }), env({}), mk());
ok(r.status === 403, 'other websites are refused');
r = await m.handler(await post({ kind: 'question', question: 'Did the county approve the jail contract openly?' }), env({ RATE_SALT: undefined }), mk());
ok(r.status === 503, 'fails closed with no rate salt');
r = await m.handler(await post({ kind: 'question', question: 'Did the county approve the jail contract openly?' }), env({ TURNSTILE_SECRET: undefined }), mk());
ok(r.status === 503, 'signed-out with no human check configured is refused');
r = await m.handler(await post({ kind: 'question', question: 'Did the county approve the jail contract openly?' }), env({}), mk());
ok(r.status === 400, 'signed-out needs a human check token');
r = await m.handler(await post({ kind: 'question', question: 'Did the county approve the jail contract openly?', turnstile: 'tok' }), env({}), mk());
ok(r.status === 200 && (await r.json()).receipt === 'abc', 'signed-out with a passed check is accepted');
ok(fetched.length === 1 && fetched[0].startsWith('https://challenges.cloudflare.com/'), 'the only outbound request is the Turnstile check');
const rpc = calls.filter((c) => c[0] === 'rpc').pop();
ok(/^[0-9a-f]{64}$/.test(rpc[2].p_rate_key) && rpc[2].p_member === null, 'rate key is a hash and no member id for visitors');
fetched.length = 0;
r = await m.handler(await post({ kind: 'url', url: 'http://127.0.0.1/admin', turnstile: 'tok' }), env({}), mk({ data: null, error: { code: '22023', message: 'Send a full public web link' } }));
ok(r.status === 400 && fetched.length === 1, 'a private link is refused by the database and never fetched');
r = await m.handler(await post({ kind: 'question', question: 'Did the county approve the jail contract openly?', turnstile: 'tok' }), env({}), mk({ data: null, error: { code: '54000', message: 'That is a lot of submissions.' } }));
ok(r.status === 429, 'rate limit becomes 429');
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0, 1, 2, 3]);
r = await m.handler(await post({ kind: 'screenshot', note: 'what is true here', turnstile: 'tok', shot: new File([png], 'a.png', { type: 'image/png' }) }), env({}), mk());
ok(r.status === 200 && calls.some((c) => c[0] === 'upload' && /\.png$/.test(c[1])), 'png screenshot stored under a random name');
ok(calls.filter((c) => c[1] === 'intake_thread').pop()[2].p_image_mode === 'text_only', 'a screenshot is text only unless the sender allows a kept picture');
calls.length = 0;
r = await m.handler(await post({ kind: 'screenshot', note: 'what is true here', turnstile: 'tok', image_mode: 'review', shot: new File([png], 'a.png', { type: 'image/png' }) }), env({}), mk());
ok(calls.filter((c) => c[1] === 'intake_thread').pop()[2].p_image_mode === 'review', 'the sender can allow a kept picture');
calls.length = 0;
r = await m.handler(await post({ kind: 'question', question: 'XyzBDA says Elon Musk did a thing, is it true?', hide_names: '1', turnstile: 'tok' }), env({}), mk());
ok(calls.filter((c) => c[1] === 'intake_thread').pop()[2].p_hide_names === true, 'the hide names box reaches the database');
calls.length = 0;
r = await m.handler(await post({ kind: 'url', url: 'https://x.example/a/b', hide_names: '1', turnstile: 'tok' }), env({}), mk());
ok(calls.filter((c) => c[1] === 'intake_thread').pop()[2].p_hide_names === false, 'a link is never put through name hiding');
r = await m.handler(await post({ kind: 'screenshot', note: 'what is true here', turnstile: 'tok', shot: new File([new TextEncoder().encode('<html>hi</html>')], 'a.png', { type: 'image/png' }) }), env({}), mk());
ok(r.status === 400, 'a file that only claims to be an image is refused');
calls.length = 0;
r = await m.handler(await post({ kind: 'screenshot', note: 'what is true here', turnstile: 'tok', shot: new File([png], 'a.png') }), env({}), mk({ data: null, error: { code: '54000', message: 'busy' } }));
ok(r.status === 429 && calls.some((c) => c[0] === 'remove'), 'screenshot is deleted when the database refuses the submission');
r = await m.handler(await post({ kind: 'question', question: 'Did the county approve the jail contract openly?' }, { authorization: 'Bearer user-jwt' }), env({}), mk(undefined, { id: 'u-1' }));
ok(r.status === 200 && calls.filter((c) => c[0] === 'rpc').pop()[2].p_member === 'u-1', 'a signed-in member skips the human check and is passed on');
globalThis.fetch = realFetch;
console.log(`ALL ${pass} EDGE FUNCTION CHECKS PASSED`);
