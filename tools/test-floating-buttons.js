// Floating buttons never overlap and stay on screen:  node tools/test-floating-buttons.js   (uses the pre-installed Playwright)
// Three separate bubbles. Signed out: Log in / Sign up, Pull a thread (bottom left), Back to surface (bottom right). On phones (760 px and under) the Log in / Sign up bubble is hidden.
// Signed in: no Log in / Sign up; the dock sits above the phone bottom bar.
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..', 'site', 'members');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp', '.svg': 'image/svg+xml' };
const page = '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="waybar.css"><link rel="stylesheet" href="_t.css"></head><body><header id="waybar" class="waybar"></header><script src="waybar.js"></script></body></html>';
const srv = http.createServer((q, s) => {
  const u = q.url.split('?')[0].replace(/^\/members\//, '/');
  if (u === '/_t.html') { s.writeHead(200, { 'content-type': 'text/html', 'content-security-policy': "default-src 'none'; style-src 'self'; script-src 'self'; img-src 'self'; connect-src 'self' https:" }); return s.end(page); }   // the real site blocks inline styles, so the test does too
  if (u === '/_t.css') { s.writeHead(200, { 'content-type': 'text/css' }); return s.end('body{height:3000px}'); }   // tall page, from a file because inline styles are blocked
  const p = path.join(root, u);
  if (!p.startsWith(root) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { s.writeHead(404); return s.end(); }
  s.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(s);
});
(async () => {
  await new Promise((r) => srv.listen(0, r));
  const b = await chromium.launch(); let fail = 0;
  const ok = (c, w) => { console.log((c ? 'pass: ' : 'FAIL: ') + w); if (!c) fail = 1; };
  for (const signedIn of [false, true]) {
    for (const w of [320, 360, 390, 520, 768, 1280]) {
      const pg = await b.newPage({ viewport: { width: w, height: 700 } });
      await pg.route('**/rest/**', (r) => r.fulfill({ status: 200, body: 'null', contentType: 'application/json' }));
      if (signedIn) await pg.addInitScript(() => { localStorage.setItem('sb-x-auth-token', '{}'); localStorage.setItem('theway.bar', JSON.stringify({ v: 1, name: 'Test', roles: [] })); });
      await pg.goto(`http://localhost:${srv.address().port}/members/_t.html`);
      await pg.waitForTimeout(400); await pg.evaluate(() => window.scrollTo(0, 600)); await pg.waitForTimeout(300);
      const r = await pg.evaluate(() => {
        const q = (s) => { const e = document.querySelector(s); if (!e || e.hidden || getComputedStyle(e).display === 'none') return null; const x = e.getBoundingClientRect(); return { l: x.left - 4, r: x.right + 4, t: x.top - 4, b: x.bottom + 4 }; };   // 4 px of room for the slow drift
        const items = { auth: q('.wb-dock-auth'), fab: q('.wb-thread-fab'), back: q('.wb-floating'), toggle: q('.wb-bubbles-toggle') }; const bar = q('.wb-bottom');
        const names = Object.keys(items).filter((k) => items[k]); const ov = [];
        for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) { const a = items[names[i]], c = items[names[j]]; if (!(a.r <= c.l || c.r <= a.l || a.b <= c.t || c.b <= a.t)) ov.push(names[i] + '/' + names[j]); }
        const off = names.filter((k) => items[k].l < 0 || items[k].r > innerWidth || items[k].b > innerHeight + 4);
        const covers = bar && bar.t > 0 ? names.filter((k) => items[k].b > bar.t) : [];
        return { has: { auth: !!items.auth, fab: !!items.fab, back: !!items.back, toggle: !!items.toggle }, ov, off, covers, wide: document.documentElement.scrollWidth > innerWidth };
      });
      const tag = `${signedIn ? 'signed in' : 'signed out'} at ${w}px`;
      ok(r.has.fab && r.has.back && r.has.toggle && r.has.auth === (!signedIn && w > 760), `${tag}: the right buttons are there (Log in / Sign up only for signed-out visitors on wider screens)`);
      ok(!r.ov.length && !r.off.length && !r.covers.length && !r.wide, `${tag}: no overlap, none off screen, bottom bar not covered` + (r.ov.length ? ' ' + r.ov : ''));
      await pg.close();
    }
  }
  // motion: bubbles drift, stop on hover and focus, and do not move for reduced motion
  for (const reduce of [false, true]) {
    const ctx = await b.newContext({ viewport: { width: 1280, height: 700 }, reducedMotion: reduce ? 'reduce' : 'no-preference' });
    const pg = await ctx.newPage();
    await pg.route('**/rest/**', (r) => r.fulfill({ status: 200, body: 'null', contentType: 'application/json' }));
    await pg.goto(`http://localhost:${srv.address().port}/members/_t.html`); await pg.waitForTimeout(500);
    const name = await pg.evaluate(() => getComputedStyle(document.querySelector('.wb-thread-fab')).animationName);
    ok(reduce ? name === 'none' : name === 'wb-bubble-drift', reduce ? 'reduced motion: no drift' : 'the bubbles drift');
    if (!reduce) {
      await pg.hover('.wb-thread-fab', { force: true }); await pg.waitForTimeout(100);
      ok(await pg.evaluate(() => getComputedStyle(document.querySelector('.wb-thread-fab')).animationPlayState) === 'paused', 'the drift stops on mouse over');
      await pg.mouse.move(5, 5); await pg.focus('.wb-dock-auth a');
      ok(await pg.evaluate(() => getComputedStyle(document.querySelector('.wb-dock-auth')).animationPlayState) === 'paused', 'the drift stops on keyboard focus');
    }
    await ctx.close();
  }
  // the down arrow hides the bubbles, the up arrow brings them back, and the choice is remembered
  {
    const ctx = await b.newContext({ viewport: { width: 1280, height: 700 } });
    const pg = await ctx.newPage();
    await pg.route('**/rest/**', (r) => r.fulfill({ status: 200, body: 'null', contentType: 'application/json' }));
    await pg.goto(`http://localhost:${srv.address().port}/members/_t.html`); await pg.waitForTimeout(500); await pg.evaluate(() => window.scrollTo(0, 600)); await pg.waitForTimeout(300);
    const vis = () => pg.evaluate(() => ['.wb-thread-fab', '.wb-floating'].map((s) => { const e = document.querySelector(s); return !!e && getComputedStyle(e).display !== 'none'; }));
    const lay = await pg.evaluate(() => { const r = (q) => document.querySelector(q).getBoundingClientRect(); const t = r('.wb-bubbles-toggle'), b = r('.wb-floating'), a = r('.wb-dock-auth'), f = r('.wb-thread-fab');
      return { right: [t, b, a, f].every((x) => innerWidth - x.right >= 4 && innerWidth - x.right <= 20), order: t.bottom <= b.top + 4 && b.bottom <= a.top + 4 && a.bottom <= f.top + 4,
               text: document.querySelector('.wb-floating a').querySelector('img.wb-art').getAttribute('aria-hidden'), sr: document.querySelector('.wb-floating .wb-sr').getBoundingClientRect().width, name: document.querySelector('.wb-floating a').textContent.trim() }; });
    ok(lay.right, 'all four bubbles sit in the bottom right corner');
    ok(lay.order, 'top to bottom: hide arrow, Back to surface, Log in / Sign up, Pull a thread');
    ok(lay.text === 'true' && lay.sr <= 1 && /Back to surface/.test(lay.name), 'the Back to surface picture is hidden from screen readers and its real name stays as hidden text');
    ok((await vis()).every(Boolean) && await pg.getAttribute('.wb-bubbles-toggle', 'aria-label') === 'Hide the floating buttons', 'the down arrow is there, labeled Hide the floating buttons');
    await pg.focus('.wb-bubbles-toggle'); await pg.keyboard.press('Enter'); await pg.waitForTimeout(100);
    ok((await vis()).every((v) => !v) && await pg.getAttribute('.wb-bubbles-toggle', 'aria-label') === 'Show the floating buttons' && await pg.getAttribute('.wb-bubbles-toggle', 'aria-expanded') === 'false', 'Enter on the arrow hides the bubbles and relabels it');
    await pg.reload(); await pg.waitForTimeout(500);
    ok((await vis()).every((v) => !v), 'the choice is remembered after a reload');
    await pg.keyboard.press('Tab').catch(() => {}); await pg.focus('.wb-bubbles-toggle'); await pg.keyboard.press('Space'); await pg.waitForTimeout(100);
    await pg.evaluate(() => window.scrollTo(0, 700)); await pg.waitForTimeout(200);
    ok((await vis()).every(Boolean) && await pg.evaluate(() => localStorage.getItem('theway.bubbles')) === null, 'the up arrow brings them back and forgets the choice');
    ok(await pg.evaluate(() => document.querySelector('.wb-rise').classList.contains('wb-burst') && getComputedStyle(document.querySelector('.wb-rise i.wb-b')).display === 'block'), 'a short extra burst of bubbles when the arrow brings them back');
    await ctx.close();
  }
  // tap targets
  {
    const ctx = await b.newContext({ viewport: { width: 1280, height: 700 }, reducedMotion: 'no-preference' });
    const pg = await ctx.newPage();
    await pg.route('**/rest/**', (r) => r.fulfill({ status: 200, body: 'null', contentType: 'application/json' }));
    await pg.goto(`http://localhost:${srv.address().port}/members/_t.html`); await pg.waitForTimeout(500); await pg.evaluate(() => window.scrollTo(0, 600)); await pg.waitForTimeout(300);
    const sizes = await pg.evaluate(() => ['.wb-floating a', '.wb-dock-login', '.wb-dock-signup', '.wb-thread-fab', '.wb-bubbles-toggle'].map((q) => { const r = document.querySelector(q).getBoundingClientRect(); return [q, Math.round(r.width), Math.round(r.height)]; }));
    ok(sizes.every(([, w, h]) => w >= 40 && h >= 40), 'every bubble and link is at least 40 px each way (' + sizes.map((x) => x.join(' ')).join(', ') + ')');
    const wd = await pg.evaluate(() => ['.wb-floating .wb-art', '.wb-dock-auth .wb-art', '.wb-thread-fab .wb-art'].map((q) => Math.round(document.querySelector(q).getBoundingClientRect().width)));
    ok(Math.max(...wd) - Math.min(...wd) <= 2 && wd[0] >= 100, 'the three bubbles are the same size on desktop (' + wd.join(', ') + ') with the real page security policy');
    const rise = await pg.evaluate(() => { const r = document.querySelector('.wb-rise'); return r && { n: r.children.length, hidden: r.getAttribute('aria-hidden'), pe: getComputedStyle(r).pointerEvents, anim: getComputedStyle(r.firstChild).animationName }; });
    ok(rise && rise.n >= 6 && rise.hidden === 'true' && rise.pe === 'none' && rise.anim === 'wb-rise', 'small decorative bubbles rise: hidden from screen readers, no pointer events');
    // hover motion on our own art
    const anim = (q, on) => pg.evaluate(([qq]) => getComputedStyle(document.querySelector(qq)).animationName, [q]);
    await pg.hover('.wb-floating a', { force: true }); await pg.waitForTimeout(100);
    ok(await anim('.wb-floating .wb-diver') === 'wb-swim', 'the diver swims on hover');
    await pg.hover('.wb-dock-auth', { force: true }); await pg.waitForTimeout(100);
    ok(await anim('.wb-dock-auth .wb-art') === 'wb-pop', 'the Log in bubble pops on hover');
    await pg.hover('.wb-thread-fab', { force: true }); await pg.waitForTimeout(100);
    ok(await anim('.wb-thread-fab .wb-art') === 'wb-tug', 'the Pull a thread bubble tugs on hover');
    await pg.mouse.move(5, 5);
    await pg.focus('.wb-dock-login'); await pg.waitForTimeout(100);
    ok(await anim('.wb-dock-auth .wb-art') === 'wb-pop', 'and on keyboard focus');
    await ctx.close();
    const rc = await b.newContext({ viewport: { width: 1280, height: 700 }, reducedMotion: 'reduce' });
    const pr = await rc.newPage();
    await pr.route('**/rest/**', (r) => r.fulfill({ status: 200, body: 'null', contentType: 'application/json' }));
    await pr.goto(`http://localhost:${srv.address().port}/members/_t.html`); await pr.waitForTimeout(500); await pr.evaluate(() => window.scrollTo(0, 600)); await pr.waitForTimeout(300);
    await pr.hover('.wb-floating a', { force: true }); await pr.hover('.wb-dock-auth', { force: true }); await pr.hover('.wb-thread-fab', { force: true }); await pr.waitForTimeout(100);
    ok(['.wb-floating .wb-diver', '.wb-dock-auth .wb-art', '.wb-thread-fab .wb-art'].every((q) => true) && (await pr.evaluate(() => ['.wb-floating .wb-diver', '.wb-dock-auth .wb-art', '.wb-thread-fab .wb-art'].map((q) => getComputedStyle(document.querySelector(q)).animationName))).every((n) => n === 'none'), 'reduced motion: no hover motion');
    ok(await pr.evaluate(() => getComputedStyle(document.querySelector('.wb-rise')).display) === 'none', 'reduced motion: the rising bubbles are not shown');
    await rc.close();
  }
  await b.close(); srv.close(); process.exit(fail);
})();
