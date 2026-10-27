// Test: Colorado map address search never sends a Colorado address to another state, and "Open my ballot" opens the breakdown.
// Nominatim is mocked (the network is not used). Usage: node tools/test-map-address.js
'use strict';
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const ROOT = path.resolve(__dirname, '..', 'site');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.geojson': 'application/json' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('nf'); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
});
let fails = 0; const ok = (c, m) => { console.log((c ? 'pass: ' : 'FAIL: ') + m); if (!c) fails++; };
(async () => {
  await new Promise((r) => server.listen(0, r));
  const base = 'http://127.0.0.1:' + server.address().port;
  const browser = await chromium.launch(); const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  const asked = [];
  await page.route('https://nominatim.openstreetmap.org/**', (route) => {
    const u = new URL(route.request().url()), q = u.searchParams.get('q'), bounded = u.searchParams.get('bounded') === '1';
    asked.push((bounded ? 'B ' : 'U ') + q);
    let body = [];
    if (!bounded) body = [{ lat: '44.5', lon: '-69.7', display_name: 'Example Street Road, Maine', address: { state: 'Maine' } }];   // the wrong-state street
    else if (!/^\d+ /.test(q.replace(/, Colorado$/, '')) && /Example Street/.test(q)) body = [{ lat: '40.0150', lon: '-105.2705', display_name: 'Example Street Road, Boulder, Colorado', address: { city: 'Boulder', state: 'Colorado' } }];
    route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
  });
  await page.route(/tile\.openstreetmap|cloudflareinsights|geocoding\.geo\.census\.gov/, (r) => r.abort());
  // the district shapes are large and kept out of this test: one box over Colorado stands in for every layer
  const box = { type: 'FeatureCollection', features: [{ type: 'Feature', properties: { d: 2, n: 'Boulder', name: 'Boulder' }, geometry: { type: 'Polygon', coordinates: [[[-109.06, 36.99], [-102.04, 36.99], [-102.04, 41.01], [-109.06, 41.01], [-109.06, 36.99]]] } }] };
  await page.route(/\/data\/[a-z-]+\.geojson/, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(box) }));
  await page.goto(base + '/preview/pages/map/index.html');
  await page.waitForFunction(() => !/Loading/.test(document.getElementById('status').textContent), null, { timeout: 30000 });
  await page.fill('#q', '1 Example Street Boulder CO 80302');
  page.on('console', (m) => process.env.DBG && console.log('console:', m.text()));
  page.on('pageerror', (e) => console.log('pageerror', e.message));
  await page.click('#search button');
  await page.waitForFunction(() => /Here is what applies|street|ZIP|could not find|No U.S. match/.test(document.getElementById('status').textContent), null, { timeout: 30000 }).catch(async (e) => { console.log('STATUS:', await page.textContent('#status'), 'ASKED:', asked); throw e; });
  const st = await page.textContent('#status');
  const sel = await page.textContent('#selected');
  ok(!/Maine/.test(sel) && !/Maine/.test(await page.textContent('#results')), 'a Boulder address is never sent to Maine');
  ok(/Colorado/.test(sel) && /not the exact house|street/.test(st), 'falls back to the street in Colorado and says it is not the exact house');
  ok(asked.filter((a) => !a.startsWith('CENSUS')).every((a) => a.startsWith('B ')), 'only Colorado-bounded searches were made (' + asked.length + ')');
  ok((await page.locator('#results .result').count()) > 0, 'district cards are shown for the spot');
  ok(await page.locator('#ballot .bb-plan').count() === 1, 'the ballot breakdown has a "Plan your vote" link');
  const href = await page.getAttribute('#ballot .bb-plan', 'href');
  ok(href === '/members/my-ballot.html?state=CO#mark', 'the link goes to the planner for Colorado');
  ok(await page.locator('.ballot-banner').isVisible(), 'Open your ballot banner shows once a spot is picked');
  ok((await page.getAttribute('.bb-main', 'href')) === '/members/my-ballot.html?state=CO#mark', '"Open my ballot" goes to the marking screen of the planner');
  ok((await page.getAttribute('#ballot .bb-plan', 'href')) === '/members/my-ballot.html?state=CO#mark', 'the breakdown has the same link');
  await page.evaluate(() => { document.querySelector('.bb-main').addEventListener('click', (e) => e.preventDefault()); });
  await page.click('.bb-main');
  const stash = await page.evaluate(() => JSON.parse(sessionStorage.getItem('theway.mymarks.v1') || 'null'));
  ok(stash && stash.state === 'CO' && Array.isArray(stash.items) && !JSON.stringify(stash).match(/Example Street/i), 'the list of your races is passed on, without the address');
  ok(await page.locator('#ballot .bb-plan').count() === 1, 'still only one Plan your vote link after the page redraws');
  // no state typed and nothing in Colorado: other-state help is still allowed
  await page.waitForTimeout(1500); asked.length = 0;
  await page.fill('#q', 'Zzzz Nowhere Lane');
  await page.click('#search button');
  await page.waitForFunction(() => /outside Colorado/.test(document.getElementById('status').textContent), null, { timeout: 30000 }).catch(async (e) => { console.log('STATUS', await page.textContent('#status'), asked); throw e; });
  ok(asked.some((a) => a.startsWith('U ')), 'with no state typed, an any-state search is still tried last');
  await browser.close(); server.close();
  console.log(fails ? fails + ' FAILED' : 'ALL MAP ADDRESS TESTS PASSED'); process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
