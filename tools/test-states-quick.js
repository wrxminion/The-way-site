// Test: quick Yes/No and Yes/Maybe/No picks and title-link layout on other states' map pages (OK, NC, ME). Network mocked.
// Usage: node tools/test-states-quick.js
'use strict';
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const ROOT = path.resolve(__dirname, '..', 'site');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('nf'); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
});
let fails = 0; const ok = (c, m) => { console.log((c ? 'pass: ' : 'FAIL: ') + m); if (!c) fails++; };
const CASES = [['ok', 'OK', 35.47, -97.52], ['nc', 'NC', 35.78, -78.64], ['me', 'ME', 44.31, -69.78], ['ak', 'AK', 61.2, -149.9], ['az', 'AZ', 33.4, -112.0], ['id', 'ID', 43.6, -116.2], ['mt', 'MT', 46.6, -112.0], ['wv', 'WV', 38.3, -81.6]];
(async () => {
  await new Promise((r) => server.listen(0, r));
  const base = 'http://127.0.0.1:' + server.address().port;
  const browser = await chromium.launch();
  for (const [sl, ST, lat, lon] of CASES) {
    const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
    page.on('pageerror', (e) => { console.log('pageerror', ST, e.message); fails++; });
    await page.route('https://nominatim.openstreetmap.org/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify([{ lat: String(lat), lon: String(lon), display_name: 'Main, ' + ST, address: { state: ST } }]) }));
    await page.route(/tile\.openstreetmap|cloudflareinsights|geocoding\.geo\.census\.gov/, (r) => r.abort());
    const j = (o) => ({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(o) });
    const poly = { type: 'FeatureCollection', features: [{ type: 'Feature', properties: { d: '1', n: 'One', name: 'One', NAME: 'One' }, geometry: { type: 'Polygon', coordinates: [[[-180, 15], [-60, 15], [-60, 72], [-180, 72], [-180, 15]]] } }] };
    const g = '/preview/pages/guide-' + sl + '/';
    await page.route(/\/data\/[a-z-]+\.geojson/, (r) => r.fulfill(j(poly)));
    await page.route(/\/data\/config\.json/, (r) => r.fulfill(j({ name: ST, abbr: ST, bounds: [[lat - 2, lon - 2], [lat + 2, lon + 2]], officialList: { url: 'https://example.gov/', label: 'Official list' }, sampleBallot: { url: 'https://example.gov/', label: 'Sample ballot' }, senateNotUp: 'Not up.', houseNotOnBallot: 'Not up.' })));
    await page.route(/\/data\/ballot\.json/, (r) => r.fulfill(j({ election: 'General election', status: 'Test.', statewide: [{ code: 'SQ 1', title: 'Test measure', what: 'A test.', yes: 'Yes does a.', no: 'No does b.', needs: 'Majority' }], links: {} })));
    await page.route(/\/data\/candidates\.json/, (r) => r.fulfill(j({ statewideOrder: ['gov'], raceNames: { gov: 'Governor' }, races: { gov: [{ name: 'Ann Able', party: 'Independent' }, { name: 'Bo Baker', party: 'Independent' }] } })));
    await page.route(/\/data\/guide\.json/, (r) => r.fulfill(j({ base: g, home: '', races: { gov: 'races/governor.html' }, measures: { 'SQ 1': 'measures/sq-1.html' }, candidates: { 'gov|Ann Able': 'candidates/ann-able.html', 'gov|Bo Baker': 'candidates/bo-baker.html' }, local: {} })));
    await page.addInitScript((a) => { try { if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); localStorage.setItem('theway.ballot.v1.' + a[0], JSON.stringify({ v: 1, state: a[0], contests: { 'race:governor': { key: 'race:governor', kind: 'race', title: 'Governor', url: '/preview/pages/guide-' + a[1] + '/races/governor.html', seats: 1, options: [{ id: 'ann-able', label: 'Ann Able' }], picks: ['ann-able'] } }, facts: {} })); } } catch (e) {} }, [ST, sl]);
    await page.goto(base + '/preview/pages/map-' + sl + '/index.html');
    await page.waitForFunction(() => !/Loading/.test(document.getElementById('status').textContent), null, { timeout: 30000 });
    ok(await page.locator('.bb-saved').isVisible(), ST + ': saved picks and no address yet shows the "Your picks are saved" line');
    await page.waitForFunction(() => !/Loading/.test(document.getElementById('status').textContent), null, { timeout: 30000 });
    await page.fill('#q', '1 Main Street');
    await page.click('#search button');
    await page.waitForFunction(() => document.querySelectorAll('#ballot .measure, #ballot .quick').length > 0, null, { timeout: 30000 }).catch(() => {});
    ok(!(await page.locator('.bb-saved').isVisible()), ST + ': the line goes away once an address is searched');
    const nM = await page.locator('#ballot div.measure').count(), nQ = await page.locator('#ballot .quick').count();
    ok(nQ > 0, ST + ': quick answer rows are on the ballot (' + nQ + ' rows, ' + nM + ' measures)');
    if (nM) {
      const m = page.locator('#ballot div.measure').first();
      ok(await m.locator('.m-title a').count() === 1, ST + ': measure title is a link');
      ok((await m.evaluate((e) => [...e.children].map((c) => c.className).slice(0, 3).join(','))) === 'm-title,m-see,m-what', ST + ': See details sits under the title');
      await m.getByRole('button', { name: 'Yes', exact: true }).first().click();
      const stored = await page.evaluate((s) => JSON.parse(localStorage.getItem('theway.ballot.v1.' + s) || '{}'), ST);
      const k = Object.keys(stored.contests || {}).find((x) => x.startsWith('measure:'));
      ok(k && stored.contests[k].picks[0] === 'yes', ST + ': Yes saved to the shared store (' + k + ')');
      ok(await m.getByRole('button', { name: 'Yes', exact: true }).first().getAttribute('aria-pressed') === 'true', ST + ': Yes shows pressed');
    }
    const cand = page.locator('#ballot .quick').filter({ has: page.getByRole('button', { name: 'Maybe', exact: true }) }).first();
    if (await cand.count()) {
      await cand.getByRole('button', { name: 'Maybe', exact: true }).click();
      const stored = await page.evaluate((s) => JSON.parse(localStorage.getItem('theway.ballot.v1.' + s) || '{}'), ST);
      ok(Object.values(stored.contests || {}).some((c) => Object.values(c.leans || {}).includes('maybe')), ST + ': Maybe saved as a private leaning');
    } else console.log('note: ' + ST + ' no candidate rows in this view');
    await page.close();
  }
  await browser.close(); server.close();
  console.log(fails ? fails + ' FAILED' : 'all passed'); process.exit(fails ? 1 : 0);
})();
