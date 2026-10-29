// Shared sign-in check:  node tools/test-way-session.js   (uses the pre-installed Playwright)
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const code = fs.readFileSync(path.join(__dirname, '..', 'site', 'members', 'way-session.js'), 'utf8');
(async () => {
  const b = await chromium.launch(); const pg = await b.newPage(); let fail = 0;
  const ok = (c, w) => { console.log((c ? 'pass: ' : 'FAIL: ') + w); if (!c) fail = 1; };
  await pg.route('http://localhost/**', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>t</title>' }));
  await pg.goto('http://localhost/t.html'); await pg.evaluate(code);
  const run = (saved, getS, refresh) => pg.evaluate(async ([saved, getS, refresh]) => {
    localStorage.clear(); if (saved) localStorage.setItem('sb-abc-auth-token', JSON.stringify({ refresh_token: 'r' }));
    const sb = { auth: { getSession: async () => (getS ? { data: { session: { id: 1 } }, error: null } : (localStorage.removeItem('sb-abc-auth-token'), { data: { session: null }, error: { message: 'gone' } })),
      refreshSession: async () => (refresh ? { data: { session: { id: 2 } }, error: null } : { data: { session: null }, error: { message: 'Invalid Refresh Token' } }) } };
    const r = await window.WaySession.getSession(sb); return { id: r.data.session && r.data.session.id, note: window.WaySession.note };
  }, [saved, getS, refresh]);
  let r = await run(true, true, false); ok(r.id === 1 && !r.note, 'a good session is returned as is');
  r = await run(false, false, false); ok(r.id === null && !r.note, 'a visitor (nothing saved) stays a visitor, no note');
  r = await run(true, false, true); ok(r.id === 2 && !r.note, 'an old saved sign-in is refreshed and used');
  r = await run(true, false, false); ok(r.id === null && /could not use your sign-in \(Invalid Refresh Token\)/.test(r.note), 'a saved sign-in that cannot be refreshed gives a plain note with the reason');
  await b.close(); process.exit(fail);
})();
