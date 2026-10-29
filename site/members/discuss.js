// The Way: members-only comments, and "Did you actually read it?" checks, for ANY page.
//
// Drop-in:
//   <link rel="stylesheet" href="/members/discuss.css">
//   <div data-way-discuss="news:<article-id>" data-way-title="Headline here"></div>
//   <script src="/members/config.js"></script>
//   <script src="/members/vendor/supabase-js-2.110.9.js"></script>
//   <script src="/members/discuss.js"></script>
// The key is <kind>:<id>, kind = news | case | measure | candidate, id = lowercase letters, digits, . _ -
// (anything else in the id is turned into "-"). News pages also get the read check (data-way-readcheck="off" hides it).
// Signed-out visitors see only a sign-in link. A kind switched off in the database (candidate, for now) shows nothing.
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
    put(root, h('h2', { text: 'Member discussion' }),
      h('p', { class: 'wd-muted', text: `Members can read and join the discussion on ${KINDS[k.kind]}${k.kind === 'news' ? ' and record that they read it' : ''}.` }),
      h('p', {}, h('a', { href: SIGN_IN, text: 'Sign in or join' })));
    return;
  }
  let isMod = false;
  try {
    const r = await sb.from('member_roles').select('role').eq('member_id', user.id);
    isMod = !r.error && r.data.some((x) => ['moderator', 'admin', 'super_admin'].includes(x.role));
  } catch { /* the database still enforces everything */ }

  const readSlot = h('div');
  const listSlot = h('div', { class: 'wd-box' });
  const formSlot = h('div', { class: 'wd-box' });
  put(root, h('h2', { text: 'Member discussion' }),
    h('p', { class: 'wd-rules', text: 'Members only. Stick to the facts and the sources. The site does not endorse candidates or parties, so no asking for votes for or against anyone. Moderators can hide comments; every hide is logged and visible to members.' }),
    k.kind === 'news' && root.getAttribute('data-way-readcheck') !== 'off' ? readSlot : null, listSlot, formSlot);

  // ---------------------------------------------------------- comments
  const msg = h('div');
  async function loadComments() {
    const { data, error } = await sb.rpc('comments_for', { p_item: k.key });
    if (error) {
      if (/higher role/.test(error.message)) { root.replaceChildren(); root.classList.remove('wd'); return false; }   // limited to a higher role: show nothing
      put(listSlot, h('p', { class: 'wd-err', text: /Members only/.test(error.message) ? 'Only active members can read the discussion.' : niceError(error) })); return false; }
    const top = data.filter((c) => c.parent_id == null);
    const kids = (id) => data.filter((c) => c.parent_id === id);
    const item = (c, isReply) => {
      const flagMsg = h('span', { class: 'wd-small' });
      const acts = h('div', { class: 'wd-row' });
      if (!isReply) acts.append(h('button', { class: 'wd-quiet', type: 'button', text: 'Reply', onclick: () => replyBox(c, li) }));
      if (!c.mine) acts.append(h('button', { class: 'wd-quiet', type: 'button', text: 'Flag', onclick: async (e) => {
        e.target.disabled = true; const r = await sb.rpc('flag_comment', { p_id: c.id }); flagMsg.textContent = r.error ? niceError(r.error) : 'Flagged for the moderators.'; } }));
      if (isMod) acts.append(h('button', { class: 'wd-quiet', type: 'button', text: c.hidden ? 'Restore' : 'Hide', onclick: async () => {
        const reason = window.prompt(c.hidden ? 'Why restore this comment?' : 'Why hide this comment? (logged and visible to members)');
        if (!reason) return;
        const r = await sb.rpc('moderate_comment', { p_id: c.id, p_hide: !c.hidden, p_reason: reason });
        if (r.error) flagMsg.textContent = niceError(r.error); else loadComments(); } }));
      acts.append(flagMsg);
      const li = h('li', { class: isReply ? 'wd-c wd-reply' : 'wd-c' },
        h('div', { class: 'wd-meta', text: `${c.author_name} · ${when(c.created_at)}${isMod && c.flags ? ` · ${c.flags} flag${c.flags === 1 ? '' : 's'}` : ''}` }),
        c.hidden ? h('p', { class: 'wd-hidden', text: isMod ? 'Hidden by a moderator. Text shown to moderators only.' : 'Hidden by a moderator.' }) : null,
        c.body ? h('p', { class: 'wd-body', text: c.body }) : null,
        c.hidden && isMod && c.hidden_reason ? h('p', { class: 'wd-meta', text: `Reason: ${c.hidden_reason}` }) : null,
        acts);
      return li;
    };
    put(listSlot, h('h3', { text: `Comments (${data.length})` }),
      top.length ? h('ul', {}, top.map((c) => h('div', {}, item(c, false), kids(c.id).map((r) => item(r, true)))))
                 : h('p', { class: 'wd-muted', text: 'No comments yet.' }));
    return true;
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
    if (r.error) throw r.error; ta.value = ''; await loadComments(); }));
  formSlot.append(h('h3', { text: 'Join in' }), ta, h('div', { class: 'wd-row' }, post, h('span', { class: 'wd-small wd-muted', text: 'Comments cannot be edited or deleted once posted.' })), msg);
  if (!(await loadComments())) put(formSlot);

  // ---------------------------------------------------------- read check (news only)
  if (k.kind === 'news' && root.getAttribute('data-way-readcheck') !== 'off') readCheck();
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
        done.decision === 'declined' && done.reason ? h('p', { class: 'wd-small', text: `Reviewer note: ${done.reason}` }) : null, tally);
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
      await readCheck();
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
