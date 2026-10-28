// Browser check for the two Pull a Thread pages with a fake backend:  node tools/test-pull-a-thread-pages.js
// Needs the pre-installed Playwright. Serves site/members from memory-free static files and fakes Supabase calls.
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..', 'site', 'members');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp', '.png': 'image/png' };
const srv = http.createServer((q, s) => {
  const p = path.join(root, decodeURIComponent(q.url.split('?')[0].replace(/^\/members\//, '/')));
  if (!p.startsWith(root) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { s.writeHead(404); return s.end(); }
  s.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(s);
});
const XSS = '<img src=x onerror="window.__pwned=1">';
(async () => {
  await new Promise((r) => srv.listen(0, r));
  const base = `http://localhost:${srv.address().port}`;
  const b = await chromium.launch(); let fail = 0;
  const ok = (c, w) => { console.log((c ? 'pass: ' : 'FAIL: ') + w); if (!c) fail = 1; };
  const ctx = await b.newContext(); const page = await ctx.newPage();
  const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  let sent = null;
  await page.route('**/functions/v1/pull-thread', async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' } });
    sent = route.request().postData();
    route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*' }, contentType: 'application/json',
      body: JSON.stringify({ receipt: 'abc123', status: 'matched', matches: [{ kind: 'case', title: XSS, path: '/cases/x.html', strength: 'words', why: XSS }] }) });
  });
  await page.route('**/rest/v1/rpc/**', (route) => route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*' }, contentType: 'application/json', body: 'null' }));
  await page.addInitScript(() => { window.fetchOrig = window.fetch; });
  // signed-in session so the human check is not needed
  const sess = { access_token: 'x.y.z', refresh_token: 'r', expires_at: 4102444800, expires_in: 3600, token_type: 'bearer', user: { id: 'u1', aud: 'authenticated', email: 'a@b.c' } };
  await page.addInitScript((s) => localStorage.setItem('sb-tiuhyulxdiiiqspysfci-auth-token', JSON.stringify(s)), sess);
  await page.goto(base + '/members/pull-a-thread.html');
  await page.waitForSelector('form.pt-form');
  ok(await page.locator('input[name=mode]').count() === 4, 'four ways to start');
  ok(await page.locator('input[name=mode]:checked').getAttribute('value') === 'question', 'ask a question is the default');
  ok(await page.locator('.pt-hand').getAttribute('aria-hidden') === 'true', 'decorative hand is hidden from screen readers');
  // too-short question: error summary, nothing sent
  await page.fill('textarea[name=question]', 'hi');
  await page.click('form.pt-form button[type=submit]');
  ok(await page.locator('.pt-summary').isVisible() && sent === null, 'short question shows an error summary and sends nothing');
  ok(await page.locator('#pt-question').getAttribute('aria-invalid') === 'true', 'the field is marked invalid');
  await page.fill('textarea[name=question]', 'Did the county approve the jail contract in an open vote?');
  await page.click('form.pt-form button[type=submit]');
  await page.waitForSelector('.pt-matches', { timeout: 3000 });
  ok(sent && sent.includes('name="kind"') && sent.includes('jail contract'), 'form posts kind and question to the function');
  ok(await page.evaluate(() => window.__pwned === undefined) && await page.locator('.pt-matches img').count() === 0, 'sender-facing text is shown as text, never as markup');
  ok((await page.locator('.pt-matches a').first().innerText()) === XSS, 'markup in a title appears literally');
  ok(await page.locator('text=abc123').count() >= 1, 'receipt code is shown');
  ok(await page.locator('.pt-related').count() === 1, 'word-match shows as Related evidence, not as an answer');
  ok(await page.locator('.pt-related .pt-lead em').innerText() === 'together!', 'the reply leads with Frank\'s line, together in bold italics');
  // a link typed in the question box is sent as a link
  sent = null;
  await page.click('input[name=mode][value=question]', { force: true });
  await page.fill('textarea[name=question]', 'https://x.example/post/1');
  await page.click('form.pt-form button[type=submit]');
  await page.waitForTimeout(500);
  ok(sent && sent.includes('name="kind"\r\n\r\nurl') && sent.includes('https://x.example/post/1'), 'a link typed in the question box is sent as a link');
  // screenshot mode needs a file
  await page.click('input[name=mode][value=screenshot]', { force: true });
  sent = null;
  await page.click('form.pt-form button[type=submit]');
  ok(await page.locator('.pt-summary li').count() === 2 && sent === null, 'screenshot mode asks for a file and a note');
  // honeypot
  await page.click('input[name=mode][value=question]', { force: true });
  ok(await page.locator('input[name=hide_names]').count() === 0, 'Ask a question has no Hide names option');
  await page.click('input[name=mode][value=text]', { force: true });
  ok(await page.locator('input[name=hide_names]').count() === 1, 'Add text keeps the Hide names option');
  await page.click('input[name=mode][value=question]', { force: true });
  await page.click('input[name=mode][value=url]', { force: true });
  await page.fill('input[name=url]', 'https://x.example/a');
  await page.evaluate(() => { document.querySelector('input[name=website]').value = 'bot'; });
  sent = null;
  await page.click('form.pt-form button[type=submit]');
  await page.waitForTimeout(300);
  ok(sent === null, 'a filled trap field sends nothing');
  // screenshot privacy: notice, text-only box, hide names box, draft flow
  await page.click('input[name=mode][value=screenshot]', { force: true });
  const bodyText = await page.locator('form.pt-form').innerText();
  ok(/read only by our own AI program/.test(bodyText) && /does not learn from or train/.test(bodyText) && /absolutely needed/.test(bodyText), 'screenshot notice: own AI, no training, no person sees it unless needed');
  ok(await page.locator('input[name=text_only]').isChecked(), 'send only the text is ticked by default');
  ok(/public official/.test(bodyText) && /harder for us to check/.test(bodyText), 'hide names has the public official warning');
  const rpcs = []; let statusReply = { kind: 'screenshot', code: 'draft', status: 'Waiting for you to check the text and send it', ocr_reading: false, ocr_text: 'text from [poster 1] about Elon Musk', hide_names: true, draft_minutes_left: 55, matches: [] };
  await page.route('**/rest/v1/rpc/thread_status', (route) => route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*' }, contentType: 'application/json', body: JSON.stringify(statusReply) }));
  for (const n of ['thread_correct_text', 'thread_confirm', 'thread_discard']) {
    await page.route('**/rest/v1/rpc/' + n, (route) => { rpcs.push([n, route.request().postData()]); route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*' }, contentType: 'application/json', body: n === 'thread_confirm' ? '{"status":"queued"}' : 'null' }); });
  }
  await page.route('**/functions/v1/pull-thread', (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' } });
    sent = route.request().postData();
    route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*' }, contentType: 'application/json', body: JSON.stringify({ receipt: 'shot9', status: 'draft', matches: [] }) });
  });
  await page.setInputFiles('input[name=shot]', { name: 'a.png', mimeType: 'image/png', buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]) });
  await page.fill('textarea[name=note]', 'is this claim about the budget true');
  await page.check('input[name=hide_names]');
  await page.click('form.pt-form button[type=submit]');
  await page.waitForSelector('.pt-ocr textarea', { timeout: 8000 });
  ok(sent.includes('name="image_mode"\r\n\r\ntext_only') && sent.includes('name="hide_names"\r\n\r\n1'), 'the choices are sent with the screenshot');
  ok(await page.locator('.pt-sent').innerText().then((t) => /Nothing is sent to the reviewers yet/.test(t)), 'nothing is shown as sent before the sender checks the text');
  ok(/55 minutes/.test(await page.locator('.pt-ocr').innerText()), 'the sender is told how long the draft lasts');
  ok(await page.locator('.pt-ocr textarea').inputValue() === 'text from [poster 1] about Elon Musk', 'the sender sees the redacted text');
  await page.fill('.pt-ocr textarea', 'text from [poster 1] about Elon Musk, edited');
  await page.click('button:has-text("Send this to the reviewers")');
  await page.waitForFunction(() => !document.querySelector('.pt-ocr'));
  ok(rpcs.map((r) => r[0]).join() === 'thread_correct_text,thread_confirm', 'an edited text is saved, then confirmed');
  rpcs.length = 0;
  // delete now
  await page.fill('textarea[name=note]', 'second screenshot check here');
  await page.setInputFiles('input[name=shot]', { name: 'a.png', mimeType: 'image/png', buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]) });
  await page.click('form.pt-form button[type=submit]');
  await page.waitForSelector('.pt-ocr textarea');
  await page.click('button:has-text("Delete it now")');
  await page.waitForSelector('text=Deleted. The text and your note are gone');
  ok(rpcs.map((r) => r[0]).join() === 'thread_discard', 'delete now discards the draft');
  // unticking text only sends review
  await page.click('input[name=mode][value=screenshot]', { force: true });
  await page.uncheck('input[name=text_only]');
  await page.setInputFiles('input[name=shot]', { name: 'a.png', mimeType: 'image/png', buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]) });
  await page.fill('textarea[name=note]', 'third screenshot check here');
  await page.click('form.pt-form button[type=submit]');
  await page.waitForSelector('.pt-ocr textarea');
  ok(sent.includes('name="image_mode"\r\n\r\nreview') && !sent.includes('name="hide_names"'), 'unticking send only the text lets a reviewer open the picture; hide names off sends no flag');
  // preliminary answer card
  await page.route('**/rest/v1/rpc/thread_status', (route) => route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*' }, contentType: 'application/json',
    body: JSON.stringify({ kind: 'question', code: 'matched', status: 'We already have something on this', reading: false, prelim_reading: false, matches: [],
      prelim: { label: 'Preliminary, AI-generated', enough: true, supports: [{ kind: 'case', title: 'Iran-Contra arms sales', path: '/cases/iran-contra.html', blurb: XSS }],
        contradicts: [], related: [{ kind: 'finding', title: 'A finding title', path: null, blurb: null }] } }) }));
  await page.fill('#pt-receipt', 'abc123').catch(() => {});
  await page.goto(base + '/members/pull-a-thread.html');
  await page.waitForSelector('form.pt-form');
  await page.route('**/rest/v1/rpc/thread_leads', (route) => route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*' }, contentType: 'application/json',
    body: JSON.stringify({ status: 'done', leads: [{ url: 'https://www.archives.gov/x', title: 'Archives page', excerpt: XSS, checked: false }, { url: 'javascript:alert(1)', title: 'bad link', excerpt: 'x', checked: true }] }) }));
  await page.click('summary:has-text("Check on something you sent")');
  await page.fill('#pt-receipt', 'abc123');
  await page.click('button:has-text("Check")');
  await page.waitForSelector('.pt-prelim .pt-badge');
  await page.waitForSelector('.pt-leads .pt-badge');
  ok((await page.locator('.pt-leads .pt-badge').innerText()) === 'AI-researched leads, not yet checked by a person' && /human reviewer verifies the sources/.test(await page.locator('.pt-leads .pt-help').innerText()), 'leads are labelled AI-researched and unchecked, with the update promise');
  ok(await page.locator('.pt-leads a').count() === 1 && (await page.locator('.pt-leads a').getAttribute('href')) === 'https://www.archives.gov/x', 'only https leads become links');
  ok(await page.locator('.pt-leads li', { hasText: 'Checked by a person' }).count() === 1 && await page.locator('.pt-leads li', { hasText: 'Not checked yet' }).count() === 1, 'each lead says whether a person checked it');
  ok(!(await page.locator('.pt-leads').innerHTML()).includes('<img') && !(await page.locator('.pt-leads').innerHTML()).includes('<script'), 'lead text is shown as text, not as code');
  ok((await page.locator('.pt-prelim .pt-badge').innerText()) === 'Preliminary, AI-generated', 'the answer is labeled Preliminary, AI-generated');
  ok(await page.locator('.pt-prelim h3').allInnerTexts().then((t) => t.join('|') === 'Supports it|Related, but does not settle it'), 'sections: supports and related shown, empty contradicts hidden');
  ok(await page.locator('.pt-prelim .pt-lead em').innerText() === 'together!' && /Here.s what our records show so far/.test(await page.locator('.pt-prelim .pt-lead').innerText()), 'the answer carries Frank\'s line');
  ok(await page.locator('.pt-prelim img[src^="x"]').count() === 0 && await page.evaluate(() => window.__pwned === undefined), 'record text is shown as text');
  ok(await page.locator('.pt-prelim a[href="/cases/iran-contra.html"]').count() === 1 && await page.locator('.pt-prelim a:has-text("A finding title")').count() === 0, 'a finding has a title but no link');
  // queue page
  await page.route('**/rest/v1/rpc/list_thread_queue', (route) => route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*' }, contentType: 'application/json',
    body: JSON.stringify([{ id: 5, kind: 'url', url: 'javascript:alert(1)', question: null, note: XSS, shot_path: null, status: 'queued', created_at: '2026-10-28T10:00:00Z',
      score: 45, parts: [{ key: 'a', label: XSS, pts: 30 }, { key: 'b', label: 'Waiting 2 day(s)', pts: 2 }], rank: 1, matches: [], page_title: XSS, excerpt: XSS, fetch_note: null,
      times_sent: 3, claimed_by_name: null, claimed_by_me: false, public_note: null }]) }));
  await page.goto(base + '/members/thread-queue.html');
  await page.waitForSelector('.pt-item');
  ok(await page.locator('.pt-item img').count() === 0 && await page.evaluate(() => window.__pwned === undefined), 'queue shows sender and page text as text only');
  ok(await page.locator('.pt-item a[href^="javascript"]').count() === 0, 'a javascript: link is not made clickable');
  ok((await page.locator('.pt-score').innerText()).toLowerCase().includes('score 45'), 'score is shown');
  ok((await page.locator('details li').allTextContents()).some((t) => t.includes('+30')), 'score reasons are listed');
  ok(await page.locator('button:has-text("Pick this one")').count() === 1, 'any item can be picked');
  // slow lookup: after about 35 seconds a member can press Notify me
  const calls = [];
  await page.route('**/rest/v1/rpc/thread_status', (route) => route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*' }, contentType: 'application/json', body: JSON.stringify({ kind: 'question', reading: true, status: 'Waiting for a reviewer', matches: [] }) }));
  await page.route('**/rest/v1/rpc/thread_follow_up', (route) => { calls.push(route.request().postData()); route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*' }, contentType: 'application/json', body: '"member"' }); });
  await page.unroute('**/functions/v1/pull-thread');
  await page.route('**/functions/v1/pull-thread', (route) => route.request().method() === 'OPTIONS'
    ? route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' } })
    : route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*' }, contentType: 'application/json', body: JSON.stringify({ receipt: 'slow1', status: 'queued', matches: [] }) }));
  await page.goto(base + '/members/pull-a-thread.html');
  await page.clock.install();
  await page.waitForSelector('form.pt-form');
  await page.fill('textarea[name=question]', 'Who approved the new county jail contract and was it bid openly?');
  await page.click('form.pt-form button[type=submit]');
  await page.waitForSelector('.pt-sent');
  ok(await page.locator('button:has-text("Notify me in my profile")').count() === 0, 'no follow-up offer in the first seconds');
  await page.clock.fastForward(40000);
  await page.waitForSelector('button:has-text("Notify me in my profile")');
  ok(true, 'after about 35 seconds a member is offered Notify me');
  await page.click('button:has-text("Notify me in my profile")');
  await page.waitForSelector('text=Look for the bell in your profile');
  ok(calls.length === 1 && calls[0].includes('slow1') && calls[0].includes('"p_email":null'), 'Notify me asks the database with the receipt and no email');
  // notifications page
  await page.route('**/rest/v1/rpc/my_notifications', (route) => route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*' }, contentType: 'application/json',
    body: JSON.stringify([{ id: 1, kind: 'thread_reply', title: XSS, body: XSS, link: '/members/pull-a-thread.html', created_at: '2026-10-28T10:00:00Z', read_at: null }]) }));
  await page.goto(base + '/members/notifications.html');
  await page.waitForSelector('.pt-note');
  ok(await page.locator('.pt-note img').count() === 0 && await page.evaluate(() => window.__pwned === undefined), 'notifications show text, never markup');
  ok(await page.locator('.pt-note .tag').count() === 1, 'unread notices are marked new');
  ok(errs.length === 0, 'no script errors' + (errs.length ? ': ' + errs[0] : ''));
  await b.close(); srv.close(); process.exit(fail);
})();
