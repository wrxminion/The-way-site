// The Way: comments, and "Did you actually read it?" checks, for ANY page. News comments are public to read (0072).
//
// Drop-in:
//   <link rel="stylesheet" href="/members/discuss.css">
//   <div data-way-discuss="news:<article-id>" data-way-title="Headline here"></div>
//   <script src="/members/config.js"></script>
//   <script src="/members/vendor/supabase-js-2.110.9.js"></script>
//   <script src="/members/discuss.js"></script>
// The key is <kind>:<id>, kind = news | case | measure | candidate, id = lowercase letters, digits, . _ -
// (anything else in the id is turned into "-"). News pages also get the read check (data-way-readcheck="off" hides it).
// Signed-out visitors can read comments on kinds the database marks public (news); they cannot post. Other kinds show a sign-in link.
// A kind switched off in the database (candidate, for now) shows nothing. News comments are checked by an AI first, then
// published, held for a reviewer (new members) or declined (the writer can appeal). Nothing here counts likes or scores.
// All text is placed with textContent. Rules (length, rate limits, one level of replies, hide, log) live in the database (0021).
(() => {
'use strict';
const cfg = window.THE_WAY_CONFIG;
const nodes = Array.from(document.querySelectorAll('[data-way-discuss]'));
if (!cfg || !window.supabase || !nodes.length) return;
const sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, { auth: { persistSession: true, autoRefreshToken: false } });

// replaceChildren stringifies null, so drop empties first
const put = (el, ...kids) => el.replaceChildren(...kids.flat().filter((x) => x != null && x !== false));

function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  return el;
}
const when = (iso) => new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
const KINDS = { news: 'this article', case: 'this case', measure: 'this measure', candidate: 'this candidate' };
const SIGN_IN = '/members/';

function normKey(raw) {
  const i = String(raw || '').indexOf(':');
  const kind = String(raw || '').slice(0, i);
  const id = String(raw || '').slice(i + 1).toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^[^a-z0-9]+/, '').slice(0, 120);
  return i > 0 && KINDS[kind] && id ? { kind, id, key: `${kind}:${id}` } : null;
}
const niceError = (e) => {
  const m = (e && e.message) || String(e);
  if (/jwt|expired|not authenticated/i.test(m)) return 'Your sign-in ran out. Sign in again from the members page.';
  return m;
};

// ---- Screenshot cleaning (same safe pattern as the review screen, 0020): re-draw as plain JPEG, cap the size.
const SHOT_MAX_PICK = 12 * 1024 * 1024, SHOT_MAX_OUT = 1500 * 1024, SHOT_MAX_SIDE = 1800;
async function cleanShot(file) {
  if (!/^image\/(png|jpeg|webp)$/.test(file.type)) throw new Error('Only PNG, JPEG or WebP pictures can be attached.');
  if (file.size > SHOT_MAX_PICK) throw new Error('That picture is over 12 MB. Crop it or save it smaller.');
  let bmp;
  try { bmp = await createImageBitmap(file); } catch { throw new Error('That file is not a readable picture.'); }
  const k = Math.min(1, SHOT_MAX_SIDE / Math.max(bmp.width, bmp.height));
  const cv = document.createElement('canvas');
  cv.width = Math.max(1, Math.round(bmp.width * k)); cv.height = Math.max(1, Math.round(bmp.height * k));
  const cx = cv.getContext('2d');
  cx.fillStyle = '#fff'; cx.fillRect(0, 0, cv.width, cv.height); cx.drawImage(bmp, 0, 0, cv.width, cv.height);
  if (bmp.close) bmp.close();
  for (const qual of [0.85, 0.7, 0.55]) {
    const blob = await new Promise((res) => cv.toBlob(res, 'image/jpeg', qual));
    if (blob && blob.size <= SHOT_MAX_OUT) return blob;
  }
  throw new Error('Even after shrinking, that picture is too big. Crop it.');
}

// run an async click/submit handler, show its error in `msg`, disable `btn` while it runs
function guarded(btn, msg, fn) {
  return async (ev) => {
    if (ev && ev.preventDefault) ev.preventDefault();
    msg.className = ''; msg.textContent = '';
    if (btn) btn.disabled = true;
    try { await fn(); } catch (e) { msg.className = 'wd-err'; msg.textContent = niceError(e); }
    if (btn) btn.disabled = false;
  };
}

// ---- shared by the public (signed-out) view and the members view
const ORDERS = [['oldest', 'Oldest first'], ['newest', 'Newest first']];
function orderBar(current, onPick) {
  return h('div', { class: 'wd-order', role: 'group', 'aria-label': 'Sort comments' }, 'Sort: ',
    ORDERS.map(([v, label]) => h('button', { class: 'wd-quiet', type: 'button', text: label, 'aria-pressed': String(v === current), disabled: v === current, onclick: () => onPick(v) })));
}
// top-level comments in the chosen order; replies always oldest first under their parent
function arrange(data, order) {
  const top = data.filter((c) => c.parent_id == null);
  if (order === 'newest') top.reverse();
  return top.map((c) => ({ c, kids: data.filter((r) => r.parent_id === c.id) }));
}
const countShown = (data) => data.filter((c) => !c.hidden && (c.state == null || c.state === 'published')).length;
async function pageSettings() {
  try {
    const r = await sb.rpc('comment_page_settings');
    const row = !r.error && r.data && r.data[0];
    return { order: row && row.default_order === 'newest' ? 'newest' : 'oldest', appeals: !row || row.appeal_allowed !== false };
  } catch { return { order: 'oldest', appeals: true }; }
}
const NEWS_RULES = 'Anyone can read. Members can comment. An AI check looks at every comment before it appears (language, on topic, and "alleged" for anything unproven about a named person). The AI only checks; it never writes or changes a comment. New members’ comments are also read by a person first. If the check declines your comment you can appeal to a reviewer. No scores, no likes. Stick to the facts and the sources, and do not ask for votes for or against anyone. Moderators can hide comments; every hide is logged.';

// Signed-out visitors: read-only view of a public kind. Returns false when the kind is not public (caller shows the sign-in blurb).
async function publicView(root, k, title) {
  const first = await sb.rpc('public_comments_for', { p_item: k.key });
  if (first.error) return false;
  const cfg = await pageSettings();
  let order = cfg.order, data = first.data || [];
  const listSlot = h('div', { class: 'wd-box' });
  const status = h('div');
  const draw = () => {
    const n = countShown(data);
    const rows = arrange(data, order);
    const item = (c, isReply) => h('li', { class: isReply ? 'wd-c wd-reply' : 'wd-c' },
      h('div', { class: 'wd-meta', text: `${c.author_name} · ${when(c.created_at)}` }, c.tag === 'read_note' ? '  ' : null,
        c.tag === 'read_note' ? h('span', { class: 'wd-tag', text: 'Read the article' }) : null),
      c.hidden ? h('p', { class: 'wd-hidden', text: 'Hidden by a moderator.' }) : null,
      c.body ? h('p', { class: 'wd-body', text: c.body }) : null);
    put(listSlot, h('h3', { text: n ? `${n} comment${n === 1 ? '' : 's'}` : 'Comments' }),
      rows.length ? orderBar(order, (v) => { order = v; draw(); }) : null,
      rows.length ? h('ul', {}, rows.map(({ c, kids }) => h('div', {}, item(c, false), kids.map((r) => item(r, true)))))
                  : h('p', { class: 'wd-muted', text: 'No comments yet.' }));
  };
  root.classList.add('wd');
  put(root, h('h2', { text: 'Comments' }), h('p', { class: 'wd-rules', text: NEWS_RULES }), listSlot, status);
  draw();
  let open = true;
  try { const t = await sb.rpc('thread_status', { p_item: k.key }); open = !t.error && t.data && t.data[0] ? t.data[0].open : true; } catch { /* show the plain prompt */ }
  put(status, h('div', { class: 'wd-box' },
    open ? h('p', { class: 'wd-muted', text: 'Want to join in?' })
         : h('p', { class: 'wd-muted', text: 'Comments open once a member has read this article and recorded what they found. Be the first: your note can be the opening comment.' }),
    h('p', {}, h('a', { href: SIGN_IN, text: 'Sign in or join' }), ' to comment.')));
  return true;
}

async function mount(root) {
  const k = normKey(root.getAttribute('data-way-discuss'));
  if (!k) return;
  const on = await sb.rpc('comments_enabled', { p_kind: k.kind });
  if (on.error || on.data !== true) return;                       // off (or setup not run): show nothing
  root.classList.add('wd');
  const title = root.getAttribute('data-way-title');
  const { data: sess } = await window.WaySession.getSession(sb);
  const user = sess && sess.session && sess.session.user;
  if (!user) {
    if (await publicView(root, k, title)) return;
    put(root, h('h2', { text: 'Member discussion' }),
      h('p', { class: 'wd-muted', text: `Members can read and join the discussion on ${KINDS[k.kind]}${k.kind === 'news' ? ' and record that they read it' : ''}.` }),
      h('p', {}, h('a', { href: SIGN_IN, text: 'Sign in or join' })));
    return;
  }
  let isMod = false, isReviewer = false;
  try {
    const r = await sb.from('member_roles').select('role').eq('member_id', user.id);
    isMod = !r.error && r.data.some((x) => ['moderator', 'admin', 'super_admin'].includes(x.role));
    isReviewer = isMod || (!r.error && r.data.some((x) => x.role === 'reviewer'));
  } catch { /* the database still enforces everything */ }
  const cfg = await pageSettings();
  let order = cfg.order, myReadNote = false;

  const readSlot = h('div');
  const listSlot = h('div', { class: 'wd-box' });
  const formSlot = h('div', { class: 'wd-box' });
  put(root, h('h2', { text: 'Member discussion' }),
    h('p', { class: 'wd-rules', text: k.kind === 'news' ? NEWS_RULES : 'Members only. Stick to the facts and the sources. The site does not endorse candidates or parties, so no asking for votes for or against anyone. Moderators can hide comments; every hide is logged and visible to members.' }),
    isReviewer && k.kind === 'news' ? h('p', { class: 'wd-small' }, h('a', { href: '/members/comment-review.html', text: 'Comment review queue (reviewers)' })) : null,
    k.kind === 'news' && root.getAttribute('data-way-readcheck') !== 'off' ? readSlot : null, listSlot, formSlot);

  // ---------------------------------------------------------- comments
  const msg = h('div');
  let reportedIds = new Set();
  const REASONS = [['attack', 'Attacks or insults a person'], ['hate', 'Hate toward a group'], ['false_claim', 'States something false as fact'],
    ['politics', 'Asks for votes or backs a party or candidate'], ['private_info', 'Shares private information'], ['spam', 'Spam or an ad'],
    ['other', 'Something else (tell us below)']];
  // Report a comment: pick a reason, optional note. Only moderators see who reported.
  function reportBox(c, li, out) {
    const old = li.querySelector('.wd-reportbox'); if (old) { old.remove(); return; }
    const name = 'wr' + c.id;
    const note = h('textarea', { maxlength: 500, 'aria-label': 'Note (optional)', placeholder: 'Add a note (optional)' }); note.style.minHeight = '60px';
    const radios = REASONS.map(([code, label]) => h('label', { class: 'wd-choice' }, h('input', { type: 'radio', name, value: code }), ' ' + label));
    const m = h('div'); const send = h('button', { type: 'button', text: 'Send report' });
    const box = h('div', { class: 'wd-reportbox' }, h('p', { class: 'wd-small', text: 'What is wrong with this?' }), ...radios, note, m,
      h('p', { class: 'wd-small wd-muted', text: 'Only moderators see your report and your name. One report per comment.' }), h('div', { class: 'wd-row' }, send));
    send.addEventListener('click', guarded(send, m, async () => {
      const pick = radios.map((l) => l.firstChild).find((i) => i.checked);
      if (!pick) throw new Error('Pick a reason first.');
      const r = await sb.rpc('report_item', { p_kind: 'comment', p_id: c.id, p_code: pick.value, p_note: note.value });
      if (r.error) throw r.error;
      box.replaceChildren(h('p', { class: 'wd-ok', text: 'Thanks. A moderator will look at it. The writer will not be told who reported.' }));
      reportedIds.add(c.id);
    }));
    li.append(box);
  }
  async function loadComments() {
    const { data, error } = await sb.rpc('comments_for', { p_item: k.key });
    if (error) {
      if (/higher role/.test(error.message)) { root.replaceChildren(); root.classList.remove('wd'); return false; }   // limited to a higher role: show nothing
      put(listSlot, h('p', { class: 'wd-err', text: /Members only/.test(error.message) ? 'Only active members can read the discussion.' : niceError(error) })); return false; }
    const mine = await sb.rpc('my_reported', { p_kind: 'comment', p_ids: data.map((c) => c.id) });
    reportedIds = new Set(mine.error ? [] : mine.data);
    myReadNote = data.some((c) => c.mine && c.tag === 'read_note');
    const STATUS = {
      queued: 'Being checked by the AI. It will appear in a moment.',
      held: 'Waiting for a reviewer to approve it. Nothing is wrong; new comments from new members are read by a person first.',
      appealed: 'Appeal sent. A reviewer will look at it.',
    };
    const item = (c, isReply) => {
      const flagMsg = h('span', { class: 'wd-small' });
      const acts = h('div', { class: 'wd-row' });
      const published = !c.state || c.state === 'published';
      if (!isReply && published) acts.append(h('button', { class: 'wd-quiet', type: 'button', text: 'Reply', onclick: () => replyBox(c, li) }));
      if (!c.mine && published) acts.append(h('button', { class: 'wd-quiet', type: 'button', text: reportedIds.has(c.id) ? 'Reported' : 'Report', disabled: reportedIds.has(c.id),
        onclick: () => reportBox(c, li, flagMsg) }));
      if (c.mine && c.state === 'ai_rejected' && cfg.appeals) acts.append(h('button', { class: 'wd-quiet', type: 'button', text: 'Appeal to a reviewer', onclick: () => appealBox(c, li) }));
      if (isMod && published) acts.append(h('button', { class: 'wd-quiet', type: 'button', text: c.hidden ? 'Restore' : 'Hide', onclick: async () => {
        const reason = window.prompt(c.hidden ? 'Why restore this comment?' : 'Why hide this comment? (logged and visible to members)');
        if (!reason) return;
        const r = await sb.rpc('moderate_comment', { p_id: c.id, p_hide: !c.hidden, p_reason: reason });
        if (r.error) flagMsg.textContent = niceError(r.error); else loadComments(); } }));
      acts.append(flagMsg);
      const stateLine = c.mine && !published
        ? (c.state === 'ai_rejected' ? `Not posted. ${c.state_reason || 'The automatic check declined it.'} You can appeal to a reviewer; nothing is deleted.`
          : c.state === 'rejected' ? `Not posted. A reviewer said: ${c.state_reason || 'it does not fit the rules.'}`
          : STATUS[c.state] || '') : '';
      const li = h('li', { class: isReply ? 'wd-c wd-reply' : 'wd-c' },
        h('div', { class: 'wd-meta', text: `${c.author_name} · ${when(c.created_at)}${isMod && c.flags ? ` · ${c.flags} flag${c.flags === 1 ? '' : 's'}` : ''}` },
          c.tag === 'read_note' ? ' ' : null, c.tag === 'read_note' ? h('span', { class: 'wd-tag', text: 'Read the article' }) : null),
        stateLine ? h('p', { class: 'wd-status', text: stateLine }) : null,
        c.hidden ? h('p', { class: 'wd-hidden', text: isMod ? 'Hidden by a moderator. Text shown to moderators only.' : 'Hidden by a moderator.' }) : null,
        c.body ? h('p', { class: 'wd-body', text: c.body }) : null,
        c.hidden && isMod && c.hidden_reason ? h('p', { class: 'wd-meta', text: `Reason: ${c.hidden_reason}` }) : null,
        acts);
      return li;
    };
    const rows = arrange(data, order);
    const shown = countShown(data);
    put(listSlot, h('h3', { text: shown ? `${shown} comment${shown === 1 ? '' : 's'}` : 'Comments' }),
      rows.length > 1 ? orderBar(order, (v) => { order = v; loadComments(); }) : null,
      rows.length ? h('ul', {}, rows.map(({ c, kids }) => h('div', {}, item(c, false), kids.map((r) => item(r, true)))))
                  : h('p', { class: 'wd-muted', text: 'No comments yet.' }));
    return true;
  }
  function appealBox(c, li) {
    if (li.querySelector('.wd-replybox')) return;
    const ta2 = h('textarea', { maxlength: 500, 'aria-label': 'Why should a reviewer approve it? (optional)', placeholder: 'Why should a reviewer approve it? (optional, up to 500 characters)' });
    ta2.style.minHeight = '60px';
    const m = h('div'); const send = h('button', { type: 'button', text: 'Send appeal' });
    send.addEventListener('click', guarded(send, m, async () => {
      const r = await sb.rpc('appeal_comment', { p_id: c.id, p_note: ta2.value });
      if (r.error) throw r.error; await loadComments(); }));
    li.append(h('div', { class: 'wd-replybox' }, ta2, h('div', { class: 'wd-row' }, send), m));
  }
  function replyBox(parent, li) {
    if (li.querySelector('.wd-replybox')) return;
    const ta = h('textarea', { maxlength: 2000, 'aria-label': 'Your reply' });
    const m = h('div'); const send = h('button', { type: 'button', text: 'Post reply' });
    send.addEventListener('click', guarded(send, m, async () => {
      const r = await sb.rpc('post_comment', { p_item: k.key, p_body: ta.value, p_parent: parent.id });
      if (r.error) throw r.error; await loadComments(); }));
    li.append(h('div', { class: 'wd-replybox' }, ta, h('div', { class: 'wd-row' }, send), m));
  }
  const ta = h('textarea', { maxlength: 2000, placeholder: `Add to the discussion on ${KINDS[k.kind]}…`, 'aria-label': 'Your comment' });
  const post = h('button', { type: 'button', text: 'Post comment' });
  post.addEventListener('click', guarded(post, msg, async () => {
    const r = await sb.rpc('post_comment', { p_item: k.key, p_body: ta.value });
    if (r.error) throw r.error; ta.value = ''; await loadComments();
    if (k.kind === 'news') { msg.className = 'wd-ok'; msg.textContent = 'Sent. It appears once the AI check (and, for new members, a reviewer) is done. You can see its status above.'; } }));
  // News threads open once a member has read the article (setting open_rule). Until then the box is replaced by a prompt.
  async function renderForm() {
    let open = true;
    if (k.kind === 'news') {
      try { const t = await sb.rpc('thread_status', { p_item: k.key }); open = !t.error && t.data && t.data[0] ? t.data[0].open : true; } catch { /* the database still enforces it */ }
    }
    if (!open) {
      put(formSlot, h('h3', { text: 'Join in' }),
        h('p', { class: 'wd-muted', text: 'Comments open once a member has read this article and recorded what they found. Do that above, and your note can be the opening comment.' }));
      return;
    }
    put(formSlot, h('h3', { text: 'Join in' }), ta, h('div', { class: 'wd-row' }, post, h('span', { class: 'wd-small wd-muted', text: 'Comments cannot be edited or deleted once posted. An AI check runs before a comment appears.' })), msg);
  }
  if (!(await loadComments())) put(formSlot); else await renderForm();

  // ---------------------------------------------------------- read check (news only)
  if (k.kind === 'news' && root.getAttribute('data-way-readcheck') !== 'off') readCheck();
  // Your read note is private unless you choose to share it as a comment. Once per article; the AI check and review rules still apply.
  function shareNote(done) {
    if (k.kind !== 'news' || myReadNote || !done || done.decision === 'declined') return null;
    const box = h('textarea', { maxlength: 2000, 'aria-label': 'Your read note as a comment' });
    box.value = String(done.note || '').slice(0, 2000);
    const m = h('div'); const go = h('button', { type: 'button', text: 'Share as a comment' });
    go.addEventListener('click', guarded(go, m, async () => {
      const r = await sb.rpc('post_read_note', { p_item: k.key, p_body: box.value });
      if (r.error) throw r.error;
      await loadComments(); await readCheck(); await renderForm();
    }));
    return h('div', { class: 'wd-box' }, h('h3', { text: 'Share your note as a comment?' }),
      h('p', { class: 'wd-small wd-muted', text: 'Optional. Your read note is private today. If you share it, it becomes a public comment tagged "Read the article". Edit it first if you like, and leave out anything private.' }),
      box, h('div', { class: 'wd-row' }, go), m);
  }
  async function readCheck() {
    const [mine, count] = await Promise.all([sb.rpc('my_read_check', { p_item: k.key }), sb.rpc('item_read_count', { p_item: k.key })]);
    if (mine.error) return;                                        // 0021 not run yet, or not a member: skip quietly
    const done = mine.data && mine.data[0];
    const n = count.data || 0;
    const head = h('h3', { text: 'Did you actually read the article?' });
    const tally = n ? h('p', { class: 'wd-small wd-muted', text: `${n} member${n === 1 ? ' has' : 's have'} read this and had it confirmed by a reviewer.` }) : null;
    if (done) {
      const status = done.decision === 'accepted' ? h('span', { class: 'wd-tag', text: 'Confirmed by a reviewer' })
        : done.decision === 'declined' ? h('span', { class: 'wd-tag', text: 'Not confirmed' }) : h('span', { class: 'wd-tag', text: 'Waiting for a reviewer' });
      put(readSlot, head, h('p', { class: 'wd-muted', text: `You recorded this on ${when(done.created_at)}.` }), status,
        h('p', { class: 'wd-body', text: done.note }), done.has_screenshot ? h('p', { class: 'wd-small wd-muted', text: 'Your screenshot is on file (private).' }) : null,
        done.decision === 'declined' && done.reason ? h('p', { class: 'wd-small', text: `Reviewer note: ${done.reason}` }) : null, tally,
        shareNote(done));
      return;
    }
    if (window.WayReviewForm && user && user.id) {   // 0061 form: plain-language questions, saves answers too
      put(readSlot, head, window.WayReviewForm.build({ sb, user, itemId: k.id, title, onDone: async () => { await readCheck(); await renderForm(); } }), tally);
      return;
    }
    const note = h('textarea', { maxlength: 1000, placeholder: 'What was interesting to you? A sentence or two in your own words.', 'aria-label': 'What was interesting' });
    const file = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp', 'aria-label': 'Screenshot (optional)' });
    const m = h('div'); const go = h('button', { type: 'button', text: 'Record that I read it' });
    go.addEventListener('click', guarded(go, m, async () => {
      if (note.value.trim().length < 20) throw new Error('Tell us a bit more about what was interesting (at least 20 characters).');
      let path = null;
      const f = file.files && file.files[0];
      if (f) {
        const blob = await cleanShot(f);
        const rid = crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2);
        path = `${user.id}/${k.id}/${rid}.jpg`;
        const up = await sb.storage.from('read-screenshots').upload(path, blob, { contentType: 'image/jpeg', upsert: false });
        if (up.error) throw up.error;
      }
      const r = await sb.rpc('submit_read_check', { p_item: k.key, p_note: note.value, p_path: path });
      if (r.error) throw r.error;
      await readCheck(); await renderForm();
    }));
    put(readSlot, head,
      h('p', { class: 'wd-muted', text: `${title ? `“${title}”. ` : ''}Tell us what you found interesting and, if you like, add a screenshot of the page for our records. A reviewer confirms it, and only then do you earn points.` }),
      note, h('div', { class: 'wd-row' }, file),
      h('p', { class: 'wd-small wd-muted', text: 'Screenshots are private (you, reviewers and moderators only). Blur names, addresses and emails first. Pictures are re-saved as plain JPEG and capped in size.' }),
      h('div', { class: 'wd-row' }, go), m, tally);
  }
}
nodes.forEach((n) => { mount(n).catch(() => {}); });
})();
