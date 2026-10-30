// Browser test for the news comments page (discuss.html) with a mocked database. Run: node tools/test-news-comments-page.js (needs playwright).
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = require('path').join(__dirname, '..', 'site');
const srv = http.createServer((q, r) => {
  let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f)) { r.writeHead(404); return r.end('nf'); }
  const ext = path.extname(f); r.writeHead(200, { 'Content-Type': { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' }[ext] || 'application/octet-stream' }); r.end(fs.readFileSync(f));
}).listen(0);
const MOCK = `
window.__calls = [];
window.supabase = { createClient: () => {
  const S = window.__state;
  const rpcs = {
    comments_enabled: () => true,
    comment_page_settings: () => [{ default_order: 'oldest', appeal_allowed: true, open_rule: 'read_check_submitted' }],
    thread_status: () => [{ open: S.open, rule: 'read_check_submitted', read_count: 0 }],
    public_comments_for: () => S.pub,
    comments_for: () => S.mem,
    my_reported: () => [], my_read_check: () => [], item_read_count: () => 0,
    post_comment: (a) => { window.__calls.push(['post_comment', a]); return 99; },
    appeal_comment: (a) => { window.__calls.push(['appeal_comment', a]); return null; },
  };
  const chain = { select: () => chain, eq: () => Promise.resolve({ data: [], error: null }) };
  return {
    auth: { getSession: async () => ({ data: { session: S.user ? { user: { id: 'u1' } } : null }, error: null }) },
    from: () => chain,
    rpc: async (n, a) => { if (!(n in rpcs)) return { data: null, error: { message: 'unmocked ' + n } }; if (n === 'public_comments_for' && S.notPublic) return { data: null, error: { message: 'Not public' } }; return { data: rpcs[n](a), error: null }; },
    storage: { from: () => ({}) },
  };
} };`;
(async () => {
  const b = await chromium.launch(); let fails = 0;
  const ok = (c, w) => { console.log((c ? 'pass: ' : 'FAIL: ') + w); if (!c) fails++; };
  async function open(state, url, w = 1000) {
    const ctx = await b.newContext({ viewport: { width: w, height: 900 } }); const pg = await ctx.newPage();
    const errs = []; pg.on('pageerror', (e) => errs.push(e.message));
    await pg.route('**/vendor/supabase-js-2.110.9.js', (r) => r.fulfill({ contentType: 'text/javascript', body: MOCK }));
    await pg.addInitScript((s) => { window.__state = s; }, state);
    await pg.goto('http://localhost:' + srv.address().port + url); await pg.waitForTimeout(500); pg.errs = errs; return pg;
  }
  const u = '/members/discuss.html?item=news:abc&title=' + encodeURIComponent('Council <b>votes</b> budget') + '&src=Daily%20Paper&d=2026-10-30&u=' + encodeURIComponent('https://example.com/a');
  const pub = [
    { id: 1, parent_id: null, author_name: 'Ann', body: 'First <img src=x onerror=alert(1)> comment', created_at: '2026-10-30T10:00:00Z', hidden: false, tag: 'read_note' },
    { id: 2, parent_id: 1, author_name: 'Ben', body: 'A reply', created_at: '2026-10-30T10:05:00Z', hidden: false, tag: null },
    { id: 3, parent_id: null, author_name: 'Cy', body: null, created_at: '2026-10-30T11:00:00Z', hidden: true, tag: null },
    { id: 4, parent_id: null, author_name: 'Di', body: 'Newest top-level', created_at: '2026-10-30T12:00:00Z', hidden: false, tag: null }];
  // signed out, public, open
  let pg = await open({ user: false, open: true, pub }, u);
  let txt = await pg.innerText('body');
  ok(/Council <b>votes<\/b> budget/.test(await pg.innerText('#dp-h')), 'title shown as text');
  ok(await pg.locator('#dp-h a[rel*=noopener]').count() === 1 && /\(Daily Paper\)/.test(txt), 'title links out, source in brackets');
  ok(/3 comments/.test(txt), 'count shows published, not-hidden comments only (4 rows, 1 hidden)');
  ok(await pg.locator('textarea').count() === 0, 'signed out: no post box');
  ok(/Sign in or join/.test(txt) && /Read the article/.test(txt), 'sign-in prompt and read-note tag');
  ok(/Hidden by a moderator\./.test(txt), 'hidden comment shows no text');
  ok(await pg.locator('.wd-body img').count() === 0 && /<img src=x/.test(txt), 'hostile text stays text');
  let order = await pg.locator('.wd-meta').allInnerTexts();
  ok(/Ann/.test(order[0]), 'oldest first by default');
  await pg.getByRole('button', { name: 'Newest first' }).click();
  order = await pg.locator('.wd-meta').allInnerTexts();
  ok(/Di/.test(order[0]) && /Ann/.test(order[order.length - 2]), 'newest first flips top-level, reply stays under its parent');
  ok(pg.errs.length === 0, 'no page errors ' + pg.errs.join('|'));
  // signed out, closed thread
  pg = await open({ user: false, open: false, pub: [] }, u);
  txt = await pg.innerText('body');
  ok(/open once a member has read this article/.test(txt), 'closed thread explains why');
  // signed out, kind not public
  pg = await open({ user: false, open: true, notPublic: true, pub: [] }, '/members/discuss.html?item=case:ludlow&title=x');
  txt = await pg.innerText('body'); ok(/Sign in or join/.test(txt) && !/comment/i.test(txt.split('Sign in')[0].slice(-80)), 'non public kind shows the old sign-in blurb');
  // phone width
  pg = await open({ user: false, open: true, pub }, u, 375);
  ok(await pg.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'phone: no sideways scroll');
  // signed in
  const mem = [
    { id: 1, parent_id: null, author_id: 'u2', author_name: 'Ann', body: 'Published one', created_at: '2026-10-30T10:00:00Z', hidden: false, flags: 0, mine: false, state: 'published', state_reason: null, tag: null },
    { id: 5, parent_id: null, author_id: 'u1', author_name: 'Me', body: 'Senator X is a crook', created_at: '2026-10-30T11:00:00Z', hidden: false, flags: 0, mine: true, state: 'ai_rejected', state_reason: 'It states something unproven about a named person as fact.', tag: null },
    { id: 6, parent_id: null, author_id: 'u1', author_name: 'Me', body: 'Just posted', created_at: '2026-10-30T11:30:00Z', hidden: false, flags: 0, mine: true, state: 'queued', state_reason: null, tag: null },
    { id: 7, parent_id: null, author_id: 'u1', author_name: 'Me', body: 'New member text', created_at: '2026-10-30T11:40:00Z', hidden: false, flags: 0, mine: true, state: 'held', state_reason: 'New member', tag: null }];
  pg = await open({ user: true, open: true, mem }, u);
  txt = await pg.innerText('body');
  ok(/Not posted\. It states something unproven/.test(txt), 'writer sees the plain reason');
  ok(/Being checked by the AI/.test(txt) && /Waiting for a reviewer/.test(txt), 'queued and held labels show');
  ok(await pg.getByRole('button', { name: 'Appeal to a reviewer' }).count() === 1, 'appeal button only on the declined one');
  ok(await pg.getByRole('button', { name: 'Reply' }).count() === 1 && await pg.getByRole('button', { name: 'Report' }).count() === 1, 'reply/report only on the published comment by someone else');
  await pg.getByRole('button', { name: 'Appeal to a reviewer' }).click();
  await pg.locator('.wd-replybox textarea').fill('It is in the indictment.');
  await pg.getByRole('button', { name: 'Send appeal' }).click(); await pg.waitForTimeout(300);
  ok(await pg.evaluate(() => window.__calls.some((c) => c[0] === 'appeal_comment' && c[1].p_id === 5)), 'appeal sends the right call');
  await pg.locator('textarea[aria-label="Your comment"]').fill('A new comment about the budget.');
  await pg.getByRole('button', { name: 'Post comment' }).click(); await pg.waitForTimeout(300);
  ok(/AI check/.test(await pg.innerText('body')) && await pg.evaluate(() => window.__calls.some((c) => c[0] === 'post_comment')), 'posting says an AI check comes first');
  ok(pg.errs.length === 0, 'no page errors (members) ' + pg.errs.join('|'));
  pg = await open({ user: true, open: false, mem: [] }, u);
  ok(await pg.locator('textarea[aria-label="Your comment"]').count() === 0 && /open once a member has read/.test(await pg.innerText('body')), 'signed in, closed thread: no post box, shows why');
  await b.close(); srv.close(); console.log(fails ? fails + ' FAILED' : 'ALL BROWSER CHECKS PASSED'); process.exit(fails ? 1 : 0);
})();
