// Node check of the Edge Function logic with a fake database (no Deno needed):  node handler.test.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const src = readFileSync(new URL('./index.ts', import.meta.url), 'utf8')
  .replace(/^import .*$/m, 'const createClient = null;')
  .replace('if (import.meta.main) Deno.serve((req) => handler(req));', '')
  .replace('const ORIGINS = (Deno.env.get("ALLOWED_ORIGINS") ?? ', 'const ORIGINS = (undefined ?? ');
const f = join(tmpdir(), 'submit-art-under-test.ts');
writeFileSync(f, src);
const m = await import(f);
const ok = (c, w) => { if (!c) { console.error('FAIL:', w); process.exit(1); } console.log('pass:', w); };
const env = (o) => ({ get: (k) => ({ SUPABASE_URL: 'http://x', SUPABASE_SERVICE_ROLE_KEY: 'k', RATE_SALT: 's', TURNSTILE_SECRET: 't', ...o })[k] });
const calls = [];
const mk = (rpc = { data: 'abc123', error: null }) => () => ({
  storage: { from: () => ({ upload: async (p) => { calls.push(['upload', p]); return { error: null }; }, remove: async (p) => { calls.push(['remove', p]); } }) },
  rpc: async (n, a) => { calls.push(['rpc', n, a]); return rpc; },
});
let tsOk = true;
globalThis.fetch = async () => new Response(JSON.stringify({ success: tsOk }), { status: 200 });
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10, 0, 0, 0, 13, 1, 2, 3]);
const good = { name: 'Ana', email: 'ana@example.com', target: 'Watergate banner', consent: '1', turnstile: 'tok', link: 'https://example.com/a.png' };
const post = async (fields, headers = {}) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  const resp = new Response(fd), ab = await resp.arrayBuffer();
  return new Request('https://x/fn', { method: 'POST', body: ab, headers: { origin: 'https://michiinstitute.com', 'content-type': resp.headers.get('content-type'), 'content-length': String(ab.byteLength), ...headers } });
};
let r = await m.handler(await post(good, { origin: 'https://evil.example' }), env({}), mk()); ok(r.status === 403, 'other websites are refused');
r = await m.handler(await post(good), env({ RATE_SALT: undefined }), mk()); ok(r.status === 503, 'off until the secrets are set');
r = await m.handler(await post({ ...good, consent: '' }), env({}), mk()); ok(r.status === 400, 'consent is required');
r = await m.handler(await post({ ...good, email: 'nope' }), env({}), mk()); ok(r.status === 400, 'bad email refused');
r = await m.handler(await post({ ...good, link: 'http://x.com/a' }), env({}), mk()); ok(r.status === 400, 'link must be https');
r = await m.handler(await post({ ...good, link: '' }), env({}), mk()); ok(r.status === 400, 'needs an image or a link');
r = await m.handler(await post({ ...good, portfolio: 'http://x.com' }), env({}), mk()); ok(r.status === 400, 'portfolio must be https');
r = await m.handler(await post({ ...good, turnstile: '' }), env({}), mk()); ok(r.status === 400, 'human check required');
tsOk = false; r = await m.handler(await post(good), env({}), mk()); ok(r.status === 400, 'failed human check refused'); tsOk = true;
r = await m.handler(await post({ ...good, website: 'spam' }), env({}), mk()); ok(r.status === 200 && !calls.some((c) => c[0] === 'rpc'), 'trap field gets a quiet ok and stores nothing');
r = await m.handler(await post(good), env({}), mk()); ok(r.status === 200 && (await r.json()).receipt === 'abc123', 'link submission accepted');
const rp = calls.find((c) => c[0] === 'rpc'); ok(rp[1] === 'submit_art' && rp[2].p_link === good.link && rp[2].p_portfolio === null && rp[2].p_rate_key.length === 64, 'rpc called with a hashed rate key');
calls.length = 0;
r = await m.handler(await post({ ...good, link: '', file: new File([PNG], 'a.png', { type: 'image/png' }) }), env({}), mk()); ok(r.status === 200 && calls[0][0] === 'upload', 'png upload stored');
calls.length = 0;
r = await m.handler(await post({ ...good, link: '', file: new File([new Uint8Array(20)], 'a.png') }), env({}), mk()); ok(r.status === 400 && !calls.length, 'a file that is not an image is refused');
calls.length = 0;
r = await m.handler(await post({ ...good, link: '', file: new File([PNG], 'a.png') }), env({}), mk({ data: null, error: { code: '54000', message: 'slow down' } })); ok(r.status === 429 && calls.some((c) => c[0] === 'remove'), 'rate limit passes through and the stored image is removed');
console.log('all passed');
