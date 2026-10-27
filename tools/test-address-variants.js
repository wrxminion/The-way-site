// Test: spelling variants of one Boulder address all land in Colorado, and the states page "Pick your state / enter your address" box works.
// Nominatim is mocked. Set EXTRA_ADDR="..." to also try one more address string (kept out of the repo on purpose).
// Usage: node tools/test-address-variants.js
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
const VARIANTS = ['12 example street boulder colorado 80302', '12 Example St, Boulder, CO 80302', '12 Example Street Boulder CO', '12 EXAMPLE ST #4 Boulder Colorado 80302', 'Example Street, Boulder, CO 80302'];
if (process.env.EXTRA_ADDR) VARIANTS.push(process.env.EXTRA_ADDR);
(async () => {
  await new Promise((r) => server.listen(0, r));
  const base = 'http://127.0.0.1:' + server.address().port;
  const browser = await chromium.launch();
  const box = { type: 'FeatureCollection', features: [{ type: 'Feature', properties: { d: 2, n: 'Boulder', name: 'Boulder' }, geometry: { type: 'Polygon', coordinates: [[[-109.06, 36.99], [-102.04, 36.99], [-102.04, 41.01], [-109.06, 41.01], [-109.06, 36.99]]] } }] };
  async function newPage(asked) {
    const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
    await page.route('https://nominatim.openstreetmap.org/**', (route) => {
      const u = new URL(route.request().url()), q = u.searchParams.get('q'), bounded = u.searchParams.get('bounded') === '1';
      asked.push((bounded ? 'B ' : 'U ') + q);
      let body = [];
      if (!bounded) body = [{ lat: '44.5', lon: '-69.7', display_name: 'Wrong State Road, Maine', address: { state: 'Maine' } }];
      else if ((!/^\d+ /.test(q) && /example street|example st/i.test(q)) || /^(Colorado )?80302$/.test(q)) body = [{ lat: '40.015', lon: '-105.27', display_name: 'Boulder, Colorado', address: { city: 'Boulder', state: 'Colorado' } }];
      route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
    });
    await page.route(/tile\.openstreetmap|cloudflareinsights/, (r) => r.abort());
    await page.route(/\/data\/[a-z-]+\.geojson/, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(box) }));
    return page;
  }
  for (const v of VARIANTS) {
    const asked = []; const page = await newPage(asked);
    await page.goto(base + '/preview/pages/map/index.html');
    await page.waitForFunction(() => !/Loading/.test(document.getElementById('status').textContent), null, { timeout: 30000 });
    await page.fill('#q', v); await page.click('#search button');
    await page.waitForFunction(() => /Here is what|not the exact|could not find|No U.S. match|outside/.test(document.getElementById('status').textContent), null, { timeout: 40000 });
    const st = await page.textContent('#status');
    ok(/Here is what|not the exact/.test(st) && !/Maine/.test(await page.textContent('#selected')) && asked.every((a) => a.startsWith('B ')), 'lands in Colorado: "' + (v === process.env.EXTRA_ADDR ? '(extra address)' : v) + '"');
    await page.close();
  }
  // states page
  async function hub(text) {
    const asked = []; const page = await newPage(asked);
    await page.goto(base + '/preview/pages/states/index.html');
    ok(await page.locator('.vg-pick #vg-q').count() === 1 && /Pick your state \/ enter your address/.test(await page.textContent('.vg-pick b')), 'step 1 card reads "Pick your state / enter your address" with a box');
    await page.fill('#vg-q', text); await page.click('.vg-pick button');
    await page.waitForTimeout(800);
    return { page, asked };
  }
  let r = await hub('12 Example St, Boulder, CO 80302');
  await r.page.waitForFunction(() => /Here is what|not the exact/.test((document.getElementById('status') || {}).textContent || ''), null, { timeout: 40000 }).catch(async (e) => { console.log('URL', r.page.url(), 'STATUS', await r.page.textContent('#status').catch(() => '?'), 'Q', await r.page.inputValue('#q').catch(() => '?'), r.asked); throw e; });
  ok(/\/preview\/pages\/map\/$/.test(r.page.url()), 'Colorado address opens the Colorado map and finds the spot, address removed from the web address (' + new URL(r.page.url()).pathname + new URL(r.page.url()).hash + ')');
  ok(await r.page.inputValue('#q') !== '' && !/q=/.test(r.page.url()), 'address is not left in the link');
  await r.page.close();
  r = await hub('12 Example Street Boulder');
  ok(/states\/index\.html$/.test(r.page.url()) && /state at the end/.test(await r.page.textContent('#vg-addr-msg')), 'no state typed: asks for one, does not guess');
  await r.page.close();
  r = await hub('Maine');
  ok(/\/map-me\/$/.test(r.page.url()), 'a state name alone opens that state map');
  await r.page.close();
  r = await hub('5 Pine Rd, Portland, Maine 04101');
  ok(new URL(r.page.url()).pathname === '/preview/pages/map-me/', 'a full state name at the end works');
  await r.page.close();
  await browser.close(); server.close();
  console.log(fails ? fails + ' FAILED' : 'ALL ADDRESS VARIANT TESTS PASSED'); process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
