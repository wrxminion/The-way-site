// The bubble menus never overlap and stay on screen:  node tools/test-floating-buttons.js   (uses the pre-installed Playwright)
// Desktop: right = Tools, Pull a thread, News, Home (plus the diver and hide arrow); left = VOTE! (and, signed in, Commons, Help, and Review for reviewers; signed out, Log in / Sign up).
// Phones (760 px and under): one bubble per side (Explore, My side) plus the diver. Escape closes a list and returns focus to its bubble.
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..', 'site', 'members');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp', '.svg': 'image/svg+xml' };
const page = '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="waybar.css"><link rel="stylesheet" href="_t.css"></head><body><header id="waybar" class="waybar"></header><script src="waybar.js"></script></body></html>';
const srv = http.createServer((q, s) => {
  const u = q.url.split('?')[0].replace(/^\/members\//, '/');
  if (u === '/_t.html') { s.writeHead(200, { 'content-type': 'text/html', 'content-security-policy': "default-src 'none'; style-src 'self'; script-src 'self'; img-src 'self'; connect-src 'self' https:" }); return s.end(page); }   // the real site blocks inline styles, so the test does too
  if (u === '/_t.css') { s.writeHead(200, { 'content-type': 'text/css' }); return s.end('body{height:3000px}'); }
  const p = path.join(root, u);
  if (!p.startsWith(root) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { s.writeHead(404); return s.end(); }
  s.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(s);
});
(async () => {
  await new Promise((r) => srv.listen(0, r));
  const b = await chromium.launch(); let fail = 0;
  const ok = (c, w) => { console.log((c ? 'pass: ' : 'FAIL: ') + w); if (!c) fail = 1; };
  for (const signedIn of [false, true]) {
    for (const [w, h] of [[320, 600], [390, 800], [760, 700], [768, 800], [1280, 800], [1280, 600]]) {
      const pg = await b.newPage({ viewport: { width: w, height: h } });
      await pg.route('**/rest/**', (r) => r.fulfill({ status: 200, body: 'null', contentType: 'application/json' }));
      if (signedIn) await pg.addInitScript(() => { localStorage.setItem('sb-x-auth-token', '{}'); localStorage.setItem('theway.bar', JSON.stringify({ v: 1, name: 'Test', roles: ['moderator'] })); });
      await pg.goto(`http://localhost:${srv.address().port}/members/_t.html`);
      await pg.waitForTimeout(500); await pg.evaluate(() => window.scrollTo(0, 600)); await pg.waitForTimeout(300);
      const r = await pg.evaluate(() => {
        const vis = (e) => e && !e.hidden && getComputedStyle(e).display !== 'none' && e.getClientRects().length;
        const nodes = [...document.querySelectorAll('.wb-dock .way-bubble, .wb-bubs-l .way-bubble, .wb-thread-fab, .wb-floating, .wb-bubbles-toggle, .wb-bub-auth')].filter(vis);
        const box = nodes.map((e) => { const x = e.getBoundingClientRect(); return { n: e.getAttribute('data-icon') || e.className.split(' ')[0], l: x.left - 4, r: x.right + 4, t: x.top - 4, b: x.bottom + 4 }; });
        const ov = [];
        for (let i = 0; i < box.length; i++) for (let j = i + 1; j < box.length; j++) { const a = box[i], c = box[j]; if (!(a.r <= c.l || c.r <= a.l || a.b <= c.t || c.b <= a.t)) ov.push(a.n + '/' + c.n); }
        const flow = getComputedStyle(document.querySelector('.wb-dock')).position === 'static';
        const off = flow ? [] : box.filter((x) => x.l < 0 || x.r > innerWidth || x.b > innerHeight + 4 || x.t < 0).map((x) => x.n);
        return { icons: nodes.map((e) => e.getAttribute('data-icon')).filter(Boolean), ov, off, wide: document.documentElement.scrollWidth > innerWidth };
      });
      const tag = `${signedIn ? 'signed in' : 'signed out'} at ${w}x${h}`;
      const phone = w <= 760, has = (k) => r.icons.includes(k);
      const want = phone ? ['explore', 'my-side'] : ['home', 'news', 'tools', 'vote'].concat(signedIn ? ['commons', 'help', 'review'] : []);
      ok(want.every(has) && (phone ? !has('home') && !has('vote') : !has('explore') && !has('my-side')), `${tag}: the right bubbles are there (${r.icons.join(', ')})`);
      ok(!r.ov.length && !r.off.length && !r.wide, `${tag}: no overlap, none off screen` + (r.ov.length ? ' ' + r.ov : '') + (r.off.length ? ' off:' + r.off : ''));
      if (phone) {
        await pg.click('.wb-bub-explore .way-bubble');
        ok(await pg.getAttribute('.wb-bub-explore .way-bubble', 'aria-expanded') === 'true' && await pg.isVisible('.wb-bub-explore .wb-fan'), `${tag}: Explore opens its list`);
        await pg.click('.wb-bub-my-side .way-bubble');
        ok(await pg.getAttribute('.wb-bub-explore .way-bubble', 'aria-expanded') === 'false' && await pg.isVisible('.wb-bub-my-side .wb-fan'), `${tag}: only one side is open at a time`);
        await pg.keyboard.press('Escape');
        ok(await pg.evaluate(() => document.activeElement.getAttribute('data-icon')) === 'my-side' && !(await pg.isVisible('.wb-bub-my-side .wb-fan')), `${tag}: Escape closes and returns focus`);
      } else {
        await pg.click('.wb-bub-tools .way-bubble');
        ok(await pg.isVisible('.wb-bub-tools .wb-pop'), `${tag}: Tools opens`);
        await pg.keyboard.press('Escape');
        ok(await pg.evaluate(() => document.activeElement.getAttribute('data-icon')) === 'tools' && !(await pg.isVisible('.wb-bub-tools .wb-pop')), `${tag}: Escape closes and returns focus`);
      }
      await pg.close();
    }
  }
  await b.close(); srv.close(); process.exit(fail);
})();
