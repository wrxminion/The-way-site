// Browser test for "Save to notes" on Pull a Thread and the note accordion / print choice in My Ballot.
// Usage: node tools/test-save-notes.js    (needs the `playwright` package and a Chromium)
'use strict';
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const root = path.join(__dirname, '..', 'site');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp', '.png': 'image/png', '.svg': 'image/svg+xml' };
const srv = http.createServer((q, s) => {
  let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  const f = path.join(root, p);
  if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { s.writeHead(404); return s.end(); }
  s.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(s);
});
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
const BALLOT = { v: 1, state: 'CO', updated: 1, facts: {}, contests: { 'race:governor': { key: 'race:governor', kind: 'race', title: 'Governor', url: '/guide/races/governor.html', seats: 1,
  options: [{ id: 'a', label: 'Candidate A', sub: '', url: '' }], picks: ['a'], undecided: false, compare: [], note: '', why: '', leans: {}, ranks: {}, whys: {} } } };
let fails = 0;
const ok = (c, m) => { console.log((c ? 'pass: ' : 'FAIL: ') + m); if (!c) fails++; };
(async () => {
  await new Promise((r) => srv.listen(0, r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const b = await chromium.launch();
  const sess = { access_token: 'x.y.z', refresh_token: 'r', expires_at: 4102444800, expires_in: 3600, token_type: 'bearer', user: { id: 'u1', aud: 'authenticated', email: 'a@b.c' } };
  async function newPage(signedIn) {
    const ctx = await b.newContext({ viewport: { width: 1000, height: 900 } }); const page = await ctx.newPage();
    const errs = []; page.on('pageerror', (e) => errs.push(e.message)); page.errs = errs; page.inserts = [];
    await page.route('**/functions/v1/pull-thread', (route) => route.request().method() === 'OPTIONS' ? route.fulfill({ status: 204, headers: CORS })
      : route.fulfill({ status: 200, headers: CORS, contentType: 'application/json', body: JSON.stringify({ receipt: 'abc123', status: 'matched',
        matches: [{ kind: 'case', title: 'Iran-Contra', path: 'https://michiinstitute.com/cases/iran-contra.html', strength: 'words', blurb: 'Secret arms sales.' }] }) }));
    await page.route('**/rest/v1/rpc/**', (route) => route.fulfill({ status: 200, headers: CORS, contentType: 'application/json', body: 'null' }));
    await page.route('**/rest/v1/private_research*', (route) => {
      if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
      page.inserts.push(JSON.parse(route.request().postData() || '{}'));
      route.fulfill({ status: 201, headers: CORS, contentType: 'application/json', body: '[{"id":7}]' });
    });
    await page.addInitScript(([s, bal, si]) => { if (si) localStorage.setItem('sb-tiuhyulxdiiiqspysfci-auth-token', JSON.stringify(s)); if (bal && !localStorage.getItem('theway.ballot.v1.CO')) localStorage.setItem('theway.ballot.v1.CO', JSON.stringify(bal)); }, [sess, BALLOT, signedIn]);
    return page;
  }
  async function ask(page) {
    await page.goto(base + '/members/pull-a-thread.html'); await page.waitForSelector('form.pt-form');
    await page.fill('textarea[name=question]', 'Did Candidate A hide the Iran-Contra story?');
    await page.click('form.pt-form button[type=submit]'); await page.waitForSelector('.pt-matches .pt-save-btn');
  }
  // signed in
  const page = await newPage(true);
  await ask(page);
  ok(await page.locator('.pt-matches .pt-save-btn').innerText() === 'Save to notes', 'each match has a Save to notes button');
  await page.click('.pt-matches .pt-save-btn');
  if (process.env.DBG) console.log(await page.evaluate(() => [typeof WayBallot, WayBallot && WayBallot.states(), document.querySelector(".pt-save-panel").innerHTML]));
  ok(await page.locator('.pt-save-panel .pt-flag').count() === 1, 'an unchecked result says it is flagged not verified');
  ok(await page.locator('.pt-save-panel select option').count() === 2, 'ballot choices come from My Ballot');
  await page.selectOption('.pt-save-panel select', 'CO|race:governor');
  await page.check('.pt-save-panel input[value=full]');
  await page.click('.pt-save-panel button.primary'); await page.waitForSelector('.pt-save-panel a');
  const row = page.inserts[0] || {};
  ok(row.owner_id === 'u1' && row.origin === 'site_match' && row.verified === false && row.ballot_key === 'race:governor' && row.ballot_state === 'CO' && row.print_mode === 'full', 'the note row has owner, origin, unverified flag and ballot place');
  ok(row.sources && row.sources[0].url.startsWith('http') && row.sources[0].checked === false, 'the source link is kept, unchecked');
  ok((await page.locator('.pt-save-panel a').getAttribute('href')) === '/members/#/private/7', 'links to the saved note');
  const fact = await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('theway.ballot.v1.CO')); return Object.values(d.facts)[0]; });
  ok(fact && fact.kind === 'note' && fact.flag === 'unverified' && fact.printMode === 'full' && fact.contest === 'race:governor' && fact.srcs.length === 1, 'the note is also a fact on the ballot, flagged unverified');
  ok(page.errs.length === 0, 'no page errors on Pull a Thread');
  // My Ballot: accordion + print choice
  await page.goto(base + '/members/my-ballot.html?state=CO'); await page.waitForTimeout(800); if (process.env.DBG) console.log(await page.evaluate(() => document.getElementById('app').innerText.split('Facts you saved')[1] || document.body.innerText.slice(-1500))); await page.waitForSelector('.mb-acc');
  ok(await page.locator('.mb-acc summary').innerText() !== '' && (await page.locator('.mb-acc summary').innerText()).includes('Iran-Contra'), 'the note is an accordion with the headline showing');
  ok(!(await page.locator('.mb-acc').evaluate((e) => e.open)), 'the accordion starts closed');
  ok((await page.locator('.mb-sheet').innerText()).includes('Secret arms sales'), 'full details print by default for this note (chosen full)');
  await page.selectOption('.mb-card select[aria-label="What to print for this note"]', 'headline');
  await page.waitForSelector('.mb-sheet');
  const sheet = await page.locator('.mb-sheet').innerText();
  ok(sheet.includes('Iran-Contra') && !sheet.includes('Secret arms sales') && /not verified yet/i.test(sheet), 'headline only prints the headline and the unverified flag, not the details');
  ok(page.errs.length === 0, 'no page errors on My Ballot');
  await b.close(); srv.close();
  process.exit(fails ? 1 : 0);
})();
