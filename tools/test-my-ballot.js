// Browser test for My Ballot (members/ballot-*.js, members/my-ballot.*). Serves site/ with the live CSP and runs headless Chromium.
// Usage: node tools/test-my-ballot.js [screenshot-dir]    (needs the `playwright` package and a Chromium)
'use strict';
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const ROOT = path.resolve(__dirname, '..', 'site');
const SHOTS = process.argv[2] || '';
const SB = 'https://tiuhyulxdiiiqspysfci.supabase.co';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp' };
const CSP_GUIDE = "default-src 'none'; style-src 'self'; script-src 'self' https://static.cloudflareinsights.com; img-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";
const CSP_MEMBERS = "default-src 'none'; script-src 'self' https://challenges.cloudflare.com; frame-src https://challenges.cloudflare.com; style-src 'self'; img-src 'self' data:; connect-src 'self' https://challenges.cloudflare.com " + SB + " wss://tiuhyulxdiiiqspysfci.supabase.co; form-action 'self'; base-uri 'none'; frame-ancestors 'none'";
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p.endsWith('/')) p += 'index.html';
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('nf'); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream',
    'Content-Security-Policy': p.startsWith('/members/') ? CSP_MEMBERS : CSP_GUIDE });
  fs.createReadStream(f).pipe(res);
});
let fails = 0;
const ok = (c, m) => { console.log((c ? 'pass: ' : 'FAIL: ') + m); if (!c) fails++; };

(async () => {
  await new Promise((r) => server.listen(0, r));
  const base = 'http://127.0.0.1:' + server.address().port;
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 900 }, acceptDownloads: true });
  const page = await ctx.newPage();
  const problems = [], requests = [];
  page.on('console', (m) => { if (process.env.DBG) console.log('console:', m.text()); if (/Content Security Policy|Refused|violat/i.test(m.text()) && !/cloudflareinsights/.test(m.text())) problems.push(m.text()); });
  page.on('pageerror', (e) => process.env.DBG && console.log('pageerror', e.message) || problems.push('pageerror: ' + e.message));
  page.on('request', (r) => { if (!r.url().startsWith(base)) requests.push(r.url()); });
  const shot = async (n) => { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, n + '.png'), fullPage: true }); };
  const store = () => page.evaluate(() => JSON.parse(localStorage.getItem('theway.ballot.v1.CO') || 'null'));
  const G = base + '/preview/pages/guide/';

  // ---- race page
  await page.goto(G + 'races/governor.html');
  await page.waitForTimeout(1500); if (process.env.DBG) console.log(await page.evaluate(() => [document.querySelectorAll('.bp-bar').length, [...document.scripts].map((x) => x.src).join(' ')]));
  await page.waitForSelector('.bp-bar');
  ok(await page.locator('.bp-bar').count() === 2, 'governor page has two contests (governor, lieutenant governor)');
  const weiser = page.locator('ul.cands li', { hasText: 'Phil Weiser' });
  await weiser.getByRole('button', { name: /^Pick/ }).click();
  await page.locator('ul.cands li', { hasText: 'Victor Marx' }).getByRole('button', { name: /to my comparison/ }).click();
  await page.locator('ul.cands li', { hasText: 'Greg Lopez' }).getByRole('button', { name: /to my comparison/ }).click();
  await page.locator('ul.cands li', { hasText: 'Greg Lopez' }).getByRole('button', { name: /^Pick/ }).click(); // single seat: replaces Weiser
  let s = await store();
  const gov = s.contests[Object.keys(s.contests).find((k) => /governor$/.test(k) || k === 'race:governor:governor')];
  ok(gov && gov.picks.length === 1 && gov.picks[0] === 'greg-lopez', 'one-seat race keeps only the latest pick (Greg Lopez)');
  ok(gov && gov.compare.length === 2, 'compare list has two people');
  await page.locator('.bp-bar').nth(1).getByRole('button', { name: 'Not sure yet' }).click();
  s = await store();
  ok(Object.values(s.contests).some((c) => c.undecided), 'lieutenant governor marked undecided');
  ok(await page.locator('.bp-open').innerText().then((t) => /\(\d+\)/.test(t)), 'dock shows a count');
  await shot('01-governor');

  // ---- candidate page
  await page.goto(G + 'candidates/phil-weiser.html');
  await page.waitForSelector('.bp-bar:not(.bp-wait)');
  await page.locator('.bp-bar').getByRole('button', { name: /to my comparison/ }).click();
  const saves = page.locator('ul.sourced > li .bp-save');
  ok(await saves.count() > 3, 'candidate page has Save buttons on facts');
  await saves.nth(0).click(); await saves.nth(1).click();
  s = await store();
  ok(Object.keys(s.facts).length === 2, 'two facts saved');
  const f0 = Object.values(s.facts)[0];
  ok(/^https:\/\//.test(f0.srcUrl) && !/source:/i.test(f0.text) && f0.subject === 'phil-weiser', 'fact keeps its source link, clean text and subject');
  // highlight
  await page.evaluate(() => { const li = document.querySelector('dl.facts dd'); const r = document.createRange(); r.selectNodeContents(li); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); });
  await page.waitForSelector('.bp-hl:not([hidden])');
  await page.locator('.bp-hl').click();
  s = await store();
  ok(Object.values(s.facts).some((f) => f.kind === 'highlight' && !/Save/.test(f.text)), 'highlighted text saved without button labels');
  await shot('02-candidate');

  // ---- measure page
  await page.goto(G + 'measures/amendment-81.html');
  await page.waitForSelector('.bp-bar');
  await page.locator('.bp-bar').getByRole('button', { name: /I would vote yes/ }).click();
  await page.locator('.glance .tablewrap tbody tr .bp-save').first().click();
  await page.locator('#why ul.sourced li .bp-save').first().click();
  s = await store();
  ok(s.contests['measure:amendment-81'].picks[0] === 'yes', 'measure Yes saved');
  ok(Object.values(s.facts).filter((f) => f.contest === 'measure:amendment-81').length === 2, 'two measure facts saved');
  ok(Object.values(s.facts).some((f) => / · /.test(f.text) && /Today:/.test(f.text)), 'table row saved with column names');

  // ---- another state
  await page.goto(base + '/preview/pages/guide-ok/races/index.html');
  const okRace = await page.evaluate(async () => { const a = document.querySelector('main a[href$=".html"]'); return a ? a.getAttribute('href') : ''; });
  if (okRace) { await page.goto(new URL(okRace, base + '/preview/pages/guide-ok/races/index.html').href); await page.waitForTimeout(400);
    ok(await page.locator('.bp-dock').count() === 1, 'Oklahoma guide pages get the dock'); }

  // ---- planner
  await page.goto(base + '/members/my-ballot.html?state=CO');
  await page.waitForSelector('.mb-sheet');
  ok(await page.locator('text=Who can see this').count() === 1, 'privacy panel is shown');
  ok(await page.locator('.mb-card').count() === 5, 'five saved facts listed');
  ok(await page.locator('.mb-cmp').count() >= 2, 'comparison blocks for undecided contests');
  ok((await page.locator('.mb-sheet').innerText()).includes('Greg Lopez'), 'sheet shows the pick');
  ok((await page.locator('.mb-sheet').innerText()).includes('Phil Weiser'), 'sheet shows the compared candidate with facts');
  await page.locator('.mb-card').first().getByLabel('Put on my printed sheet').uncheck();
  s = await store();
  ok(Object.values(s.facts).filter((f) => !f.print).length === 1, 'unchecking Print is saved');
  const sel = page.locator('.mb-card select').first();
  if (await sel.count()) { await sel.selectOption('yes'); s = await store(); ok(Object.values(s.facts).some((f) => f.side === 'yes'), 'measure fact can be sorted toward Yes'); }
  const note = page.locator('.mb-card textarea').first(); await note.fill('ask about cost'); await note.blur();
  s = await store(); ok(Object.values(s.facts).some((f) => f.note === 'ask about cost'), 'note saved');
  await shot('03-planner');
  await page.emulateMedia({ media: 'print' });
  const printVisible = await page.evaluate(() => [...document.querySelectorAll('#app > *')].filter((e) => e.offsetParent !== null).map((e) => e.className));
  ok(printVisible.length === 1 && /mb-sheet-wrap/.test(printVisible[0]), 'print shows only the sheet (' + printVisible.join('|') + ')');
  if (SHOTS) await page.pdf({ path: path.join(SHOTS, '04-sheet.pdf'), format: 'Letter' });
  await page.emulateMedia({ media: 'screen' });

  // backup + restore
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /Download a backup/ }).click()]);
  const bk = await dl.path(); const txt = fs.readFileSync(bk, 'utf8');
  ok(JSON.parse(txt).state === 'CO', 'backup downloads');
  await page.evaluate(() => localStorage.clear()); await page.reload();
  await page.setInputFiles('#mb-file', bk);
  await page.waitForSelector('.mb-card');
  ok(await page.locator('.mb-card').count() === 5, 'restore from backup works');
  // hostile backup is cleaned
  const evil = path.join(require('os').tmpdir(), 'evil.json');
  fs.writeFileSync(evil, JSON.stringify({ v: 1, state: 'CO', contests: { 'race:x': { key: 'race:x', title: '<img src=x onerror=alert(1)>', url: 'javascript:alert(1)', options: [{ id: 'A B', label: 'ok' }], picks: ['a'] } },
    facts: { deadbeef: { text: '<script>x</script>', srcUrl: 'javascript:alert(1)', pageUrl: 'http://evil' } } }));
  await page.setInputFiles('#mb-file', evil);
  await page.waitForTimeout(200);
  s = await store();
  ok(s.contests['race:x'].url === '' && s.facts.deadbeef.srcUrl === '' && s.facts.deadbeef.pageUrl === '', 'hostile links are dropped on restore');
  ok(await page.locator('script', { hasText: 'x' }).count() === 0 && await page.locator('img[src="x"]').count() === 0, 'hostile text is shown as text only');
  await page.evaluate(() => localStorage.clear());

  // ---- share (network mocked: nothing real is called)
  await page.goto(G + 'races/governor.html'); await page.waitForSelector('.bp-bar');
  await page.locator('ul.cands li', { hasText: 'Phil Weiser' }).getByRole('button', { name: /^Pick/ }).click();
  await page.goto(base + '/members/my-ballot.html?state=CO'); await page.waitForSelector('.mb-sheet');
  ok(requests.filter((u) => u.includes('supabase')).length === 0, 'no Supabase request before any button is pressed');
  const sent = [];
  await page.route(SB + '/**', (route) => { const rq = route.request(); sent.push({ url: rq.url(), method: rq.method(), body: rq.postData() || '', auth: rq.headers().authorization || '' });
    route.fulfill({ status: 200, contentType: 'application/json', body: 'null', headers: { 'access-control-allow-origin': '*' } }); });
  ok(await page.getByRole('button', { name: 'Share my picks' }).isDisabled(), 'Share is disabled until the box is ticked');
  await page.getByLabel(/I understand this is a self-selected sample/).check();
  await page.getByRole('button', { name: 'Share my picks' }).click();
  await page.waitForSelector('text=Shared. Thank you');
  const rpc = sent.find((x) => /share_intended_votes/.test(x.url));
  const body = rpc && JSON.parse(rpc.body);
  ok(!!rpc && body.p_state === 'CO' && /^[0-9a-f]{32}$/.test(body.p_token) && Object.keys(body.p_picks).length === 1, 'share sends state, code and picks only');
  ok(rpc && Object.keys(body).sort().join() === 'p_picks,p_state,p_token', 'and nothing else');
  ok(rpc && !/Bearer eyJ/.test(rpc.auth), 'share is sent without a user session token');
  await page.getByRole('button', { name: 'Take my shared picks back' }).click();
  await page.waitForSelector('text=Your shared picks were deleted');
  ok(sent.some((x) => /withdraw_intended_votes/.test(x.url)), 'withdraw calls the server');
  await shot('05-share');

  // ---- phone width
  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto(base + '/members/my-ballot.html?state=CO'); await page.waitForSelector('.mb-sheet');
  ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'planner has no sideways scroll on a phone');
  await page.goto(G + 'races/governor.html'); await page.waitForSelector('.bp-bar');
  ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'race page has no sideways scroll on a phone');
  await shot('06-phone');

  ok(problems.length === 0, 'no CSP violations or page errors' + (problems.length ? ': ' + problems.slice(0, 3).join(' || ') : ''));
  await browser.close(); server.close();
  console.log(fails ? fails + ' FAILED' : 'ALL MY BALLOT TESTS PASSED');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
