// Pull a thread (pull-a-thread.html): ChatGPT's approved design, wired to the pull-thread backend (supabase/PULL-A-THREAD.md).
// Four ways in: ask a question, paste a link, upload a screenshot, add text. Signed-out visitors pass a Cloudflare Turnstile
// check; signed-in members send their session token. This page never opens a link anyone sent, and every piece of text from a
// person or a web page is put on the page with textContent. No name, email or address is asked for, except an email the
// visitor chooses to leave for one follow-up.
(() => {
'use strict';
const cfg = window.THE_WAY_CONFIG;
const app = document.getElementById('app');
if (!cfg || /YOUR-PROJECT/.test(cfg.supabaseUrl)) { app.textContent = 'Setup needed.'; return; }
const sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, { auth: { persistSession: true, autoRefreshToken: false } });
const FN = `${cfg.supabaseUrl}/functions/v1/pull-thread`;
const TS_KEY = cfg.turnstileSiteKey || '';
const RECEIPT_KEY = 'theway.thread.receipts';
const MAX_SHOT = 4 * 1024 * 1024;
const ART = '/members/art/pat/';
const WAIT_MS = 35000;                       // after this long, offer a follow-up
const MODES = [
  { id: 'question', label: 'Ask a question', icon: 'pat-ask-question.svg' },
  { id: 'url', label: 'Paste a link', icon: 'pat-paste-link.svg' },
  { id: 'screenshot', label: 'Upload a screenshot', icon: 'pat-upload-screenshot.svg' },
  { id: 'text', label: 'Add text', icon: 'pat-add-text.svg' },
];

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
const icon = (f) => h('img', { class: 'pt-icon', src: ART + f, alt: '', 'aria-hidden': 'true', width: '24', height: '24' });
const loadTs = () => new Promise((ok, no) => {
  if (window.turnstile) return ok(window.turnstile);
  const s = h('script', { src: 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit', async: true });
  s.onload = () => (window.turnstile ? ok(window.turnstile) : no(new Error('blocked')));
  s.onerror = () => no(new Error('blocked'));
  document.head.append(s);
});
function remembered() { try { return JSON.parse(localStorage.getItem(RECEIPT_KEY) || '[]'); } catch { return []; } }
function remember(r) { try { localStorage.setItem(RECEIPT_KEY, JSON.stringify([r, ...remembered().filter((x) => x !== r)].slice(0, 5))); } catch { /* no storage: fine */ } }
const kb = (n) => (n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB');

let session = null, mode = 'question', tsToken = null, tsId = null, watching = 0, sending = false, shotFile = null;
const live = h('p', { class: 'pt-live', role: 'status', 'aria-live': 'polite' });     // short announcements only
const results = h('div', { class: 'pt-results' });

// ---------------------------------------------------------------- outcome cards
function matchList(matches) {
  if (!matches || !matches.length) return null;
  return h('ul', { class: 'pt-matches' }, matches.map((m) => h('li', {},
    h('strong', {}, m.path ? h('a', { href: m.path, text: m.title }) : m.title),
    h('span', { class: 'muted small', text: ` ${m.kind === 'finding' ? 'A member-checked finding (members can read it)' : m.kind === 'case' ? 'A history case' : 'Already on the site'} · ${m.strength === 'source' ? 'cites the link you sent' : 'shares key words with what you sent'}` }))));
}
const lead = () => h('p', { class: 'pt-lead' }, 'Here\u2019s what our records show so far. Follow this thread as we learn more ', h('strong', {}, h('em', { text: 'together!' })));
function card(kind, title, ...kids) {
  const f = { reviewed: 'pat-reviewed-evidence.svg', related: 'pat-related-evidence.svg', closer: 'pat-needs-review.svg' }[kind];
  return h('section', { class: `pt-outcome pt-${kind}` }, h('h2', {}, icon(f), title), ...kids);
}
// What a person sees depends on what is true. Only a reviewer's "answered" is shown as reviewed evidence.
function outcome(t, receipt) {
  const m = t.matches || [];
  const parts = [];
  if (['draft', 'expired', 'discarded'].includes(t.code)) {
    parts.push(card('closer', t.code === 'draft' ? 'Waiting for you' : 'Deleted', h('p', { text: t.status }),
      t.code === 'draft' ? h('p', { class: 'muted small', text: 'Open the page you sent it from to check the text and send it.' }) : null));
    return parts;
  }
  if (t.code === 'answered' || (t.status === 'Answered')) {
    parts.push(card('reviewed', 'Reviewed evidence', lead(), h('p', { text: t.note || 'A reviewer answered this with what we already have.' }), matchList(m),
      h('p', { class: 'muted small', text: 'Status: answered by a reviewer.' })));
  } else if (m.length) {
    parts.push(card('related', 'Related evidence', lead(), h('p', { text: 'We already have something related to what you sent. It does not by itself answer your question, and it is not a review of your item.' }), matchList(m),
      receipt ? h('div', { class: 'btns' }, h('button', { type: 'button', onclick: async (ev) => {
        ev.currentTarget.disabled = true;
        const { error } = await sb.rpc('thread_dispute', { p_receipt: receipt });
        live.textContent = error ? 'Could not send that. Try again later.' : 'Sent to the reviewers.';
        if (error) ev.currentTarget.disabled = false;
      }, text: 'That is not what I asked' })) : null));
  }
  if (!m.length || ['queued', 'in_review', 'accepted', 'needs_evidence', 'declined', 'duplicate'].includes(t.code || '')) {
    if (!(t.code === 'answered')) {
      parts.push(card('closer', 'Needs a closer look', h('p', { text: t.code === 'in_review' ? 'A reviewer is looking at it now.' : t.code === 'accepted' ? 'Accepted: we will research it.'
        : t.code === 'needs_evidence' ? 'We need more evidence to take it on.' : t.code === 'declined' ? 'We did not take this one on.' : 'We have no reviewed evidence on this yet. It is waiting for a reviewer.' }),
        t.note ? h('p', { text: t.note }) : null, h('p', { class: 'muted small', text: `Status: ${t.status}` })));
    }
  }
  return parts;
}

// ---------------------------------------------------------------- after sending: watch, then offer a follow-up
function followUp(receipt, box) {
  if (box.querySelector('.pt-still')) return;
  const err = h('p', { class: 'pt-err', role: 'alert' });
  const wrap = h('section', { class: 'pt-still' }, h('h2', {}, icon('pat-progress-static.svg'), 'Still checking...'),
    h('p', { text: 'You can leave this page. Choose how to hear back.' }),
    h('p', {}, 'Follow this thread as we learn more ', h('strong', {}, h('em', { text: 'together!' }))));
  let busy = false;
  const save = async (btn, p, okText) => {
    if (busy) return; busy = true; btn.disabled = true; err.textContent = '';
    const { error } = await p();
    busy = false;
    if (error) { btn.disabled = false; err.textContent = error.message || 'We could not save that. Please try again.'; return; }
    wrap.replaceChildren(h('p', { role: 'status', text: okText }));            // only now do we say it is saved
  };
  if (session) {
    const b = h('button', { type: 'button', class: 'primary', text: 'Notify me in my profile' });
    b.addEventListener('click', () => save(b, () => sb.rpc('thread_follow_up', { p_receipt: receipt, p_email: null }), 'Saved. Look for the bell in your profile.'));
    wrap.append(b);
  } else {
    const em = h('input', { id: 'pt-follow-email', type: 'email', name: 'followup-email', autocomplete: 'email', maxlength: '254', placeholder: 'you@example.com' });
    const b = h('button', { type: 'button', class: 'primary', text: 'Send me the result' });
    b.addEventListener('click', () => save(b, () => sb.rpc('thread_follow_up', { p_receipt: receipt, p_email: em.value }), 'Saved. We keep your email only to write once about this, then erase it.'));
    wrap.append(h('label', { for: 'pt-follow-email' }, 'Email (optional)'), em, b,
      h('p', { class: 'muted small', text: 'You can also just keep waiting here. We never add your email to a list, and email follow-ups may not be switched on yet; if not, we keep it up to 30 days and send as soon as they are.' }));
  }
  wrap.append(err);
  box.append(wrap);
}
// A screenshot (or a pasted text with "Hide names") is a DRAFT: the sender checks the text, then sends it, or it is all deleted.
function draftPanel(receipt, t, box, shot) {
  box.querySelector('.pt-ocr')?.remove();
  const wrap = h('section', { class: 'pt-ocr' }, h('h2', {}, shot ? 'Check the text from your screenshot' : 'Check the text before it is sent'));
  if (t.ocr_reading) { wrap.append(h('p', { text: shot ? 'Reading your screenshot…' : 'Hiding the names of the posters…' })); box.append(wrap); return; }
  const ta = h('textarea', { id: 'pt-ocr-text', maxlength: shot ? '3000' : '1500', rows: '8' }); ta.value = t.ocr_text || '';
  const out = h('p', { class: 'pt-err', role: 'status' });
  const send = h('button', { type: 'button', class: 'primary', text: 'Send this to the reviewers' });
  const del = h('button', { type: 'button', class: 'quiet', text: 'Delete it now' });
  const busy = (v) => { send.disabled = v; del.disabled = v; };
  send.addEventListener('click', async () => {
    busy(true); out.textContent = '';
    if (ta.value.trim() !== (t.ocr_text || '').trim()) {
      const r = await sb.rpc('thread_correct_text', { p_receipt: receipt, p_text: ta.value });
      if (r.error) { busy(false); out.textContent = r.error.message || 'Could not save that.'; return; }
    }
    const r = await sb.rpc('thread_confirm', { p_receipt: receipt });
    if (r.error) { busy(false); out.textContent = r.error.message || 'Could not send it. Please try again.'; return; }
    wrap.remove();
    live.textContent = 'Sent. It is waiting for a reviewer.';
    const { data } = await sb.rpc('thread_status', { p_receipt: receipt });
    if (data) box.querySelector('.pt-dynamic')?.replaceChildren(...outcome(Object.assign({ code: data.code }, data), receipt));
    watch(receipt, box, false);
  });
  del.addEventListener('click', async () => {
    busy(true);
    const r = await sb.rpc('thread_discard', { p_receipt: receipt });
    if (r.error) { busy(false); out.textContent = r.error.message || 'Could not delete it. Please try again.'; return; }
    box.replaceChildren(h('p', { role: 'status', text: 'Deleted. The text and your note are gone, and the picture is removed.' }));
    live.textContent = 'Deleted.';
  });
  wrap.append(
    h('p', { text: shot ? 'Our own program read this from your picture and may have made mistakes. Fix anything that is wrong.'
      : 'Our own program hid the names of the people who wrote the posts. Names inside the posts were left alone. Check that nothing you want private is left.' }),
    t.hide_names && shot ? h('p', { text: 'We also hid the names of the people who wrote the posts. Names inside the posts were left alone.' }) : null,
    t.redact_note ? h('p', { class: 'pt-err', role: 'alert', text: t.redact_note }) : null,
    !t.ocr_text && shot ? h('p', { text: 'We could not read any text in your picture. Type or paste what it says instead.' }) : null,
    h('label', { for: 'pt-ocr-text', text: shot ? 'What the screenshot says' : 'Your text' }), ta,
    h('p', { class: 'muted small', text: `Not sent yet. If you do not press Send within about ${Math.max(1, t.draft_minutes_left || 60)} minutes, we delete ${shot ? 'the picture and ' : ''}this text for good.` }),
    h('div', { class: 'btns' }, send, del), out);
  box.append(wrap);
}
function watch(receipt, box, draft) {
  const token = ++watching, t0 = Date.now();
  let askedFollow = false, shown = false;
  const tick = async () => {
    if (token !== watching || !box.isConnected) return;
    const { data } = await sb.rpc('thread_status', { p_receipt: receipt });
    if (token !== watching) return;
    if (data && draft) {
      if (data.code === 'expired' || data.code === 'discarded') { box.querySelector('.pt-ocr')?.remove(); box.querySelector('.pt-dynamic')?.replaceChildren(...outcome(data, null)); return; }
      if (!data.ocr_reading && !shown) { shown = true; draftPanel(receipt, data, box, data.kind === 'screenshot'); }
      if (!shown || data.ocr_reading) setTimeout(tick, 4000);
      return;
    }
    const waiting = data && data.reading;
    if (data && !waiting && !askedFollow && !['In review'].includes(data.status)) {
      const fresh = outcome(Object.assign({ code: data.code }, data), receipt);
      results.querySelector('.pt-dynamic')?.replaceChildren(...fresh);
      if (data.status === 'Waiting for a reviewer') { askedFollow = true; followUp(receipt, box); }
    }
    if (Date.now() - t0 >= WAIT_MS && !askedFollow) { askedFollow = true; followUp(receipt, box); }
    if (Date.now() - t0 < 120000 && (waiting || !askedFollow)) setTimeout(tick, 5000);
  };
  setTimeout(tick, draft ? 1500 : 3000);
}
function showSent(receipt, status, matches, draft) {
  const first = draft ? h('p', { class: 'muted', text: 'Nothing is sent to the reviewers yet. First you check the text.' })
    : outcome({ status: status === 'matched' ? 'We already have something on this' : 'Waiting for a reviewer', code: status, matches }, receipt);
  const box = h('div', { class: 'pt-sent' },
    h('p', { class: 'pt-code' }, 'Your code: ', h('code', { text: receipt }), h('span', { class: 'muted small', text: '  Keep it to check on this later. Nobody sees who sent it.' })),
    h('div', { class: 'pt-dynamic' }, ...(Array.isArray(first) ? first : [first])));
  results.replaceChildren(box);
  live.textContent = draft ? 'Received. Reading it now.' : status === 'matched' ? 'We found related evidence.' : 'Sent. It is waiting for a reviewer.';
  if (draft || status === 'queued') watch(receipt, box, draft);
  box.scrollIntoView?.({ block: 'nearest' });
}

// ---------------------------------------------------------------- the form
function errorsFor(form) {
  const errs = [];
  const v = (name) => (form.elements[name] ? form.elements[name].value.trim() : '');
  if (mode === 'question' || mode === 'text') {
    const q = v('question');
    if (/^https?:\/\/\S+$/i.test(q)) return [];                       // a single link typed in the question box counts as a link
    if (q.length < 10) errs.push(['question', mode === 'text' ? 'Paste at least 10 characters of the text.' : 'Ask in at least 10 characters, or paste a link.']);
  } else if (mode === 'url') {
    if (!/^https?:\/\/\S{4,}$/i.test(v('url'))) errs.push(['url', 'Paste a full link that starts with http:// or https://']);
  } else if (mode === 'screenshot') {
    if (!shotFile) errs.push(['shot', 'Choose a screenshot (PNG, JPEG or WebP).']);
    else if (shotFile.size > MAX_SHOT) errs.push(['shot', 'That image is over 4 MB. Try a smaller one.']);
    if (v('note').length < 3) errs.push(['note', 'Say in a few words what we should check in it.']);
  }
  return errs;
}
async function send(form, summary) {
  if (sending) return;
  const errs = errorsFor(form);
  for (const el of form.querySelectorAll('[aria-invalid]')) { el.removeAttribute('aria-invalid'); el.removeAttribute('aria-describedby'); }
  form.querySelectorAll('.pt-fielderr').forEach((e) => e.remove());
  summary.replaceChildren(); summary.hidden = true;
  if (errs.length) {
    summary.hidden = false;
    summary.append(h('strong', { text: errs.length === 1 ? 'One thing to fix:' : `${errs.length} things to fix:` }),
      h('ul', {}, errs.map(([f, m]) => h('li', {}, h('a', { href: `#pt-${f}`, text: m, onclick: (ev) => { ev.preventDefault(); document.getElementById(`pt-${f}`)?.focus(); } })))));
    for (const [f, m] of errs) {
      const el = document.getElementById(`pt-${f}`); if (!el) continue;
      const e = h('p', { class: 'pt-fielderr', id: `pt-${f}-err`, text: m });
      el.setAttribute('aria-invalid', 'true'); el.setAttribute('aria-describedby', `pt-${f}-err`);
      el.closest('.pt-field').append(e);
    }
    summary.focus();
    return;
  }
  if (form.elements.website && form.elements.website.value) return;   // bot trap
  const fd = new FormData();
  const q = form.elements.question ? form.elements.question.value.trim() : '';
  let kind = mode === 'text' ? 'question' : mode;
  if (kind === 'question' && /^https?:\/\/\S+$/i.test(q)) { kind = 'url'; fd.append('url', q); }
  else if (kind === 'url') fd.append('url', form.elements.url.value.trim());
  else if (kind === 'question') fd.append('question', q);
  else if (kind === 'screenshot') fd.append('shot', shotFile);
  fd.append('kind', kind);
  if (kind === 'screenshot') fd.append('image_mode', form.elements.text_only && !form.elements.text_only.checked ? 'review' : 'text_only');
  if (kind !== 'url' && form.elements.hide_names && form.elements.hide_names.checked) fd.append('hide_names', '1');
  fd.append('note', form.elements.note ? form.elements.note.value.trim() : '');
  const headers = {};
  if (session) headers.Authorization = `Bearer ${session.access_token}`;
  else { if (!tsToken) { live.textContent = 'Please complete the human check first.'; return; } fd.append('turnstile', tsToken); }
  sending = true; form.querySelector('button[type=submit]').disabled = true; live.textContent = 'Sending…';
  let res, body;
  try { res = await fetch(FN, { method: 'POST', body: fd, headers }); body = await res.json(); }
  catch { live.textContent = 'Could not reach the site. Your text is still here; try again in a minute.'; res = null; }
  sending = false; form.querySelector('button[type=submit]').disabled = false;
  if (tsId !== null) { tsToken = null; try { window.turnstile.reset(tsId); } catch { /* ignore */ } }
  if (!res) return;
  if (!res.ok) { live.textContent = body && body.error ? body.error : 'Something went wrong. Please try again.'; return; }
  remember(body.receipt);
  form.reset(); shotFile = null; view();
  showSent(body.receipt, body.status, body.matches, kind === 'screenshot' || body.status === 'draft');
}

function modeField(form) {
  const f = h('div', { class: 'pt-field' });
  if (mode === 'question' || mode === 'text') {
    f.append(h('label', { for: 'pt-question', text: mode === 'text' ? 'Paste the text you want checked' : 'What would you like to understand?' }),
      h('textarea', { id: 'pt-question', name: 'question', maxlength: '1500', rows: mode === 'text' ? '8' : '4', placeholder: mode === 'text' ? 'Paste a conversation, a message or a passage…' : 'Ask a question or paste an article or post link...' }),
      h('p', { class: 'pt-help', text: mode === 'text' ? 'Up to 1,500 characters. Remove names and private details first.' : 'A question in your own words, or a link to an article or a social media post.' }));
  } else if (mode === 'url') {
    f.append(h('label', { for: 'pt-url', text: 'Link to an article or a social media post' }),
      h('input', { id: 'pt-url', name: 'url', type: 'url', maxlength: '1000', placeholder: 'https://', autocomplete: 'off', inputmode: 'url' }),
      h('p', { class: 'pt-help', text: 'We do not open the link from this page. If a post cannot be read, use Add text or Upload a screenshot instead.' }));
  } else {
    const file = h('input', { id: 'pt-shot', name: 'shot', type: 'file', accept: 'image/png,image/jpeg,image/webp', class: 'pt-file' });
    const info = h('p', { class: 'pt-fileinfo', role: 'status', 'aria-live': 'polite' });
    const remove = h('button', { type: 'button', class: 'quiet', hidden: true, text: 'Remove file' });
    file.addEventListener('change', () => {
      shotFile = file.files[0] || null;
      info.textContent = shotFile ? `${shotFile.name} (${kb(shotFile.size)})` : '';
      remove.hidden = !shotFile;
    });
    remove.addEventListener('click', () => { file.value = ''; shotFile = null; info.textContent = 'File removed.'; remove.hidden = true; file.focus(); });
    f.append(h('label', { for: 'pt-shot', text: 'Choose a screenshot' }), file, info, remove,
      h('p', { class: 'pt-help', text: 'PNG, JPEG or WebP, up to 4 MB. Remove names and private details from screenshots.' }));
  }
  return f;
}

function view() {
  const prior = mode;
  const form = h('form', { class: 'pt-form', novalidate: true });
  const summary = h('div', { class: 'pt-summary', role: 'alert', tabindex: '-1', hidden: true });
  const legend = h('legend', { class: 'pt-sr', text: 'How do you want to start?' });
  const modes = h('fieldset', { class: 'pt-modes' }, legend, MODES.map((m) => h('label', { class: 'pt-mode' },
    h('input', { type: 'radio', name: 'mode', value: m.id, checked: m.id === prior, onchange: () => { mode = m.id; shotFile = null; view(); document.querySelector(`input[name=mode][value=${m.id}]`)?.focus(); } }),
    h('span', { class: 'pt-mode-box' }, icon(m.icon), h('span', { text: m.label })))));
  const field = modeField(form);
  const framed = h('div', { class: 'pt-framed' }, h('span', { class: 'pt-thread-corner', 'aria-hidden': 'true' }),
    h('img', { class: 'pt-hand', src: '/members/art/pull-a-thread-hand-120.webp', srcset: '/members/art/pull-a-thread-hand-120.webp 1x, /members/art/pull-a-thread-hand-240.webp 2x', alt: '', 'aria-hidden': 'true', width: '120', height: '102' }), field);
  const noteLabel = mode === 'screenshot' ? 'What should we check in it?' : 'Anything we should know? (optional)';
  const note = h('div', { class: 'pt-field' }, h('label', { for: 'pt-note', text: noteLabel }), h('textarea', { id: 'pt-note', name: 'note', maxlength: '500', rows: '2' }));
  const checks = [];
  if (mode === 'screenshot') {
    checks.push(h('div', { class: 'pt-notice' },
      h('p', {}, h('strong', { text: 'Your screenshot is private. ' }), 'It is read only by our own AI program, running on our own computer. No outside AI service is used. The program does not learn from or train on what you send: its models are fixed and nothing is retrained.'),
      h('p', { text: 'No person sees your picture unless your request goes to review and the picture is absolutely needed. Then a reviewer must give a reason, and it is logged.' }),
      h('p', { text: 'Pictures are stored with our database provider only until they are read and deleted. You check the text before anything goes to reviewers. If you do not send it within about an hour, we delete the picture and the text.' })));
    checks.push(h('label', { class: 'pt-check-row' }, h('input', { type: 'checkbox', name: 'text_only', checked: true }),
      h('span', {}, h('strong', { text: 'Send only the text. ' }), 'We read the text, then delete the picture right away. A reviewer never sees it.')));
  } else if (mode === 'question' || mode === 'text') {
    checks.push(h('p', { class: 'pt-help', text: 'Our AI runs on our own computer. No outside AI service is used, and it does not learn from or train on what you send.' }));
  }
  if (mode !== 'url') {
    checks.push(h('label', { class: 'pt-check-row' }, h('input', { type: 'checkbox', name: 'hide_names' }),
      h('span', {}, h('strong', { text: 'Hide names of senders. ' }), 'Our program hides the names and handles of the people who wrote the posts or comments (yours too). Names inside the posts stay. You see the result before anything is sent.',
        h('span', { class: 'pt-help', text: ' If the person who wrote the post is the public official you are asking about, hiding names also hides that it is their quote. That can make it harder for us to check.' }))));
  }
  const trap = h('div', { class: 'pt-hp', 'aria-hidden': 'true' }, h('input', { name: 'website', tabindex: '-1', autocomplete: 'off' }));
  const ts = h('div', { class: 'pt-ts' });
  const go = h('button', { type: 'submit', class: 'primary pt-go', text: 'Follow this thread' });
  form.append(modes, summary, framed, note, ...checks, trap, ts, h('div', { class: 'pt-gorow' }, go, session ? null : h('span', { class: 'muted', text: 'No account needed' })),
    h('p', { class: 'pt-privacy', text: 'Reviewers see what you send, never who you are. Your screenshot and email stay private. Questions and evidence can become public after review, reworded without names or private details. Email addresses stay private.' }));
  form.addEventListener('submit', (ev) => { ev.preventDefault(); send(form, summary); });
  app.replaceChildren(
    h('p', { class: 'overline', text: 'FOLLOW THE EVIDENCE' }),
    h('h1', { text: 'Pull a thread' }),
    h('p', { class: 'lede', text: 'Bring a question. See what the evidence says.' }),
    form, live, results, otherPanels());
  if (!session && TS_KEY) {
    loadTs().then((t) => { tsId = t.render(ts, { sitekey: TS_KEY, callback: (tok) => { tsToken = tok; }, 'expired-callback': () => { tsToken = null; } }); })
      .catch(() => { live.textContent = 'The human check could not load. If a blocker is on, allow challenges.cloudflare.com for this page.'; });
  } else if (!session) ts.append(h('p', { class: 'muted small', text: 'The human check is not switched on yet, so sending without an account is paused. Members can sign in and send.' }));
}

function otherPanels() {
  const out = h('div'), inp = h('input', { id: 'pt-receipt', name: 'receipt', maxlength: '40', autocomplete: 'off' });
  const saved = remembered()[0]; if (saved) inp.value = saved;
  const btn = h('button', { type: 'button', text: 'Check', onclick: async () => {
    const { data, error } = await sb.rpc('thread_status', { p_receipt: inp.value.trim() });
    if (error) return out.replaceChildren(h('p', { class: 'muted', text: 'Could not check right now.' }));
    if (!data) return out.replaceChildren(h('p', { class: 'muted', text: 'No match for that code.' }));
    out.replaceChildren(...outcome(data, inp.value.trim()));
  } });
  return h('details', { class: 'pt-check' }, h('summary', { text: 'Check on something you sent' }), h('label', { for: 'pt-receipt', text: 'Your code' }), inp, btn, out);
}

// a member opens one of their threads from a notification: ?thread=<id>
async function openThread(id) {
  const { data } = await sb.rpc('my_thread_status', { p_intake: id });
  app.replaceChildren(h('p', { class: 'overline', text: 'FOLLOW THE EVIDENCE' }), h('h1', { text: 'Your thread' }),
    data ? h('div', {}, outcome(data, null)) : h('p', { class: 'muted', text: 'We could not find that thread under your account.' }),
    h('p', {}, h('a', { href: '/members/pull-a-thread.html', text: 'Pull another thread' })));
}

sb.auth.getSession().then(({ data }) => {
  session = data && data.session;
  const m = /[?&]thread=(\d{1,12})\b/.exec(location.search);
  if (m && session) openThread(Number(m[1])); else view();
}, () => view());
})();
