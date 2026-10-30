// Browser check for "Add a screenshot" on Pull a Thread:  node tools/test-pull-a-thread-ocr.js
// The picture must be read in the browser under the members security rules (plus 'wasm-unsafe-eval'), and only text may be sent.
// Needs the pre-installed Playwright. Fakes Supabase. Pass --no-wasm-eval to see it fail without the one added rule.
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..', 'site', 'members');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp', '.png': 'image/png', '.gz': 'application/gzip', '.svg': 'image/svg+xml' };
const SB = 'https://tiuhyulxdiiiqspysfci.supabase.co';
const WASM = process.argv.includes('--no-wasm-eval') ? '' : " 'wasm-unsafe-eval'";
const CSP = `default-src 'none'; script-src 'self'${WASM} https://challenges.cloudflare.com; frame-src https://challenges.cloudflare.com; style-src 'self'; img-src 'self' data:; connect-src 'self' https://challenges.cloudflare.com ${SB} wss://tiuhyulxdiiiqspysfci.supabase.co; form-action 'self'; base-uri 'none'; frame-ancestors 'none'`;
const srv = http.createServer((q, s) => {
  const p = path.join(root, decodeURIComponent(q.url.split('?')[0].replace(/^\/members\//, '/')));
  if (!p.startsWith(root) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { s.writeHead(404); return s.end(); }
  s.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream', 'content-security-policy': CSP }); fs.createReadStream(p).pipe(s);
});
const LINES = ['The county commissioners voted 3 to 2 on Tuesday', 'to approve the new jail contract without a public hearing.', 'Residents said they were never told about the vote.'];
(async () => {
  await new Promise((r) => srv.listen(0, r));
  const base = `http://localhost:${srv.address().port}`;
  const b = await chromium.launch(); let fail = 0;
  const ok = (c, w) => { console.log((c ? 'pass: ' : 'FAIL: ') + w); if (!c) fail = 1; };
  // make two screenshots: dark text on light, and light text on dark
  const mk = async (name, bg, fg) => {
    const pg = await b.newPage({ viewport: { width: 700, height: 220 } });
    await pg.setContent(`<body style="margin:0;background:${bg};color:${fg};font:26px Arial;padding:24px">${LINES.map((l) => `<p style="margin:6px 0">${l}</p>`).join('')}</body>`);
    const f = path.join(require('os').tmpdir(), name); await pg.screenshot({ path: f }); await pg.close(); return f;
  };
  const light = await mk('ocr-light.png', '#fff', '#111'), dark = await mk('ocr-dark.png', '#15202b', '#e7e9ea');
  for (const [label, file] of [['light', light], ['dark', dark]]) {
    const page = await (await b.newContext()).newPage();
    const seen = [], posts = [], errs = [], viol = [];
    page.on('pageerror', (e) => errs.push(e.message));
    page.on('console', (m) => { if (/Content Security Policy|violat/i.test(m.text())) viol.push(m.text().slice(0, 160)); });
    page.on('request', (r) => { seen.push(r.url()); });
    await page.route('**/functions/v1/pull-thread', async (route) => {
      if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' } });
      posts.push(route.request().postDataBuffer());
      route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*' }, contentType: 'application/json', body: JSON.stringify({ receipt: 'abc123', status: 'queued', matches: [] }) });
    });
    await page.route('**/rest/v1/rpc/**', (route) => route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*' }, contentType: 'application/json', body: 'null' }));
    const sess = { access_token: 'x.y.z', refresh_token: 'r', expires_at: 4102444800, expires_in: 3600, token_type: 'bearer', user: { id: 'u1', aud: 'authenticated', email: 'a@b.c' } };
    await page.addInitScript((s) => localStorage.setItem('sb-tiuhyulxdiiiqspysfci-auth-token', JSON.stringify(s)), sess);
    await page.goto(base + '/members/pull-a-thread.html');
    await page.waitForSelector('form.pt-form');
    ok(!seen.some((u) => /vendor\/ocr|pull-a-thread-ocr/.test(u)), `${label}: nothing from the reading program is downloaded before a picture is chosen`);
    await page.check('input[name=mode][value=screenshot]');
    ok(await page.locator('input[name=text_only]').count() === 0, `${label}: the old keep-the-picture choice is gone`);
    await page.setInputFiles('#pt-shot', file);
    let done = true;
    await page.waitForFunction(() => /^Done|could not read|could not be/.test(document.querySelector('.pt-fileinfo').textContent), null, { timeout: 90000 }).catch(() => { done = false; });
    const info = await page.locator('.pt-fileinfo').innerText();
    const text = await page.inputValue('#pt-shottext');
    console.log(`  [${label}] status: ${info} | text: ${JSON.stringify(text)}`);
    ok(done && /jail contract/i.test(text) && /public hearing/i.test(text) && /Residents/i.test(text), `${label}: text read in the browser`);
    ok(viol.length === 0 && errs.length === 0, `${label}: no security-rule violations or page errors ${viol.concat(errs).join(' | ')}`);
    ok(seen.every((u) => u.startsWith(base) || u.startsWith(SB) || u.startsWith('data:')), `${label}: nothing was requested from outside our own site`);
    await page.fill('#pt-note', 'Is this true?');
    await page.fill('#pt-shottext', text.replace(/Tuesday/, 'Tuesday (fixed)'));
    await page.click('form.pt-form button[type=submit]');
    await page.waitForSelector('.pt-sent', { timeout: 5000 });
    const body = posts[0] ? posts[0].toString('latin1') : '';
    ok(posts.length === 1 && body.includes('name="kind"') && body.includes('Tuesday (fixed)'), `${label}: the corrected text was sent`);
    ok(!/filename=|name="shot"|image\/|PNG|image_mode/.test(body) && posts[0].length < 4000, `${label}: request holds text only (${posts[0] && posts[0].length} bytes, no file part)`);
    // old path removed: a screenshot-kind request is never made from this page
    ok(!body.includes('value="screenshot"') && !/name="kind"\r\n\r\nscreenshot/.test(body), `${label}: sent as an ordinary text request`);
    await page.context().close();
  }
  await b.close(); srv.close();
  console.log(fail ? 'SOME CHECKS FAILED' : 'all checks passed'); process.exit(fail);
})();
