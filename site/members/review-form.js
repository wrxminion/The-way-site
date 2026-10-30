// The review form for a news article, written in plain words. Used on the welcome page and on the article discussion page.
// Real reviews only: it saves a real read check (submit_read_check_v2, 0061). Points come only after a different reviewer accepts it.
// Usage: WayReviewForm.build({ sb, user, itemId, title, url, onDone })  ->  element
(() => {
'use strict';
const SHOT_MAX_PICK = 12 * 1024 * 1024, SHOT_MAX_OUT = 1500 * 1024, SHOT_MAX_SIDE = 1800;
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
async function cleanShot(file) {
  if (!/^image\/(png|jpeg|webp)$/.test(file.type)) throw new Error('Please pick a PNG, JPEG or WebP picture.');
  if (file.size > SHOT_MAX_PICK) throw new Error('That picture is over 12 MB. Please crop it or pick a smaller one.');
  let bmp;
  try { bmp = await createImageBitmap(file); } catch { throw new Error('We could not open that file as a picture.'); }
  const k = Math.min(1, SHOT_MAX_SIDE / Math.max(bmp.width, bmp.height));
  const cv = document.createElement('canvas');
  cv.width = Math.max(1, Math.round(bmp.width * k)); cv.height = Math.max(1, Math.round(bmp.height * k));
  const cx = cv.getContext('2d');
  cx.fillStyle = '#fff'; cx.fillRect(0, 0, cv.width, cv.height); cx.drawImage(bmp, 0, 0, cv.width, cv.height);
  if (bmp.close) bmp.close();
  for (const q of [0.85, 0.7, 0.55]) {
    const blob = await new Promise((res) => cv.toBlob(res, 'image/jpeg', q));
    if (blob && blob.size <= SHOT_MAX_OUT) return blob;
  }
  throw new Error('That picture is still too big after shrinking. Please crop it.');
}
const TITLE = [['yes', 'Yes'], ['mostly', 'Mostly'], ['no', 'No'], ['unsure', 'I am not sure']];
const STANCE = [['supports', 'It backs up what the title says'], ['argues_against', 'It argues against what the title says'], ['mixed', 'Some of both'], ['no_claim', 'It does not make a clear claim'], ['unsure', 'I am not sure']];
const EVID = [['yes', 'Yes, a lot'], ['some', 'A little'], ['no', 'No evidence shown']];
const KINDS = [['named_source', 'A person named in the article'], ['document', 'A document'], ['data', 'Numbers or data'], ['court_record', 'A court record'],
  ['video_photo', 'A video or photo'], ['expert', 'An expert'], ['official_statement', 'An official statement'], ['anonymous', 'An unnamed source']];
const niceError = (e) => {
  const m = (e && e.message) || String(e);
  if (/jwt|expired|not authenticated/i.test(m)) return 'Your sign-in ran out. Please sign in again.';
  if (/already checked/i.test(m)) return 'You already reviewed this article. Thank you!';
  if (/Daily limit/i.test(m)) return 'You have done 10 reviews today. Please come back tomorrow.';
  if (/submit_read_check_v2|PGRST202|schema cache/i.test(m)) return 'Reviews are not open yet. Please try again later. Nothing was lost.';
  return m;
};

function radioGroup(name, legend, options, onChange) {
  const box = h('fieldset', { class: 'wrf-group' }, h('legend', { text: legend }));
  options.forEach(([v, label]) => {
    const id = `wrf-${name}-${v}`;
    const inp = h('input', { type: 'radio', name: `wrf-${name}`, id, value: v });
    if (onChange) inp.addEventListener('change', onChange);
    box.append(h('div', { class: 'wrf-opt' }, inp, h('label', { for: id, text: label })));
  });
  box.value = () => { const c = box.querySelector('input:checked'); return c ? c.value : null; };
  return box;
}

function build({ sb, user, itemId, title, url, onDone }) {
  const draftKey = `way-review-draft:${itemId}`;
  const liked = h('textarea', { maxlength: 450, rows: 3, 'aria-label': 'What did you like?', placeholder: 'Short is fine. Use your own words.' });
  const disliked = h('textarea', { maxlength: 450, rows: 3, 'aria-label': 'What did you not like?', placeholder: 'If nothing, write "nothing".' });
  const gTitle = radioGroup('title', 'Does the title match the article?', TITLE);
  const gStance = radioGroup('stance', 'Does the article back up the title, or argue against it?', STANCE);
  const kindsBox = h('fieldset', { class: 'wrf-group wrf-kinds' }, h('legend', { text: 'What kind of evidence? Pick all that you saw.' }));
  KINDS.forEach(([v, label]) => kindsBox.append(h('div', { class: 'wrf-opt' }, h('input', { type: 'checkbox', id: `wrf-k-${v}`, value: v }), h('label', { for: `wrf-k-${v}`, text: label }))));
  const syncKinds = () => {
    const none = gEvid.value() === 'no';
    kindsBox.hidden = none;
    if (none) kindsBox.querySelectorAll('input').forEach((i) => { i.checked = false; });
  };
  const gEvid = radioGroup('evid', 'Does the article show evidence for what it says?', EVID, syncKinds);
  const file = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp', 'aria-label': 'Screenshot (optional)' });
  const msg = h('p', { class: 'wrf-msg', role: 'status' });
  const go = h('button', { type: 'button', class: 'primary', text: 'Send my review' });

  // Keep the words if the tab closes: draft saved on this device only.
  try {
    const d = JSON.parse(localStorage.getItem(draftKey) || 'null');
    if (d) { liked.value = d.liked || ''; disliked.value = d.disliked || ''; }
  } catch { /* storage may be blocked; the form still works */ }
  const saveDraft = () => { try { localStorage.setItem(draftKey, JSON.stringify({ liked: liked.value, disliked: disliked.value })); } catch { /* ignore */ } };
  liked.addEventListener('input', saveDraft); disliked.addEventListener('input', saveDraft);

  go.addEventListener('click', async () => {
    msg.className = 'wrf-msg'; msg.textContent = '';
    const fail = (t) => { msg.className = 'wrf-msg wrf-err'; msg.textContent = t; };
    if (liked.value.trim().length < 10) return fail('Please tell us a little about what you liked (a short sentence is fine).');
    if (disliked.value.trim().length < 2) return fail('Please tell us what you did not like. If nothing, write "nothing".');
    if (!gTitle.value()) return fail('Please answer: does the title match the article?');
    if (!gStance.value()) return fail('Please answer: does the article back up the title or argue against it?');
    const ev = gEvid.value();
    if (!ev) return fail('Please answer: does the article show evidence?');
    const kinds = ev === 'no' ? [] : [...kindsBox.querySelectorAll('input:checked')].map((i) => i.value);
    if (ev !== 'no' && !kinds.length) return fail('Please pick the kind of evidence you saw, or choose "No evidence shown".');
    go.disabled = true;
    try {
      let path = null;
      const f = file.files && file.files[0];
      if (f) {
        const blob = await cleanShot(f);
        const rid = crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2);
        path = `${user.id}/${itemId}/${rid}.jpg`;
        const up = await sb.storage.from('read-screenshots').upload(path, blob, { contentType: 'image/jpeg', upsert: false });
        if (up.error) throw up.error;
      }
      const r = await sb.rpc('submit_read_check_v2', { p_item: `news:${itemId}`, p_liked: liked.value, p_disliked: disliked.value,
        p_title_accurate: gTitle.value(), p_stance: gStance.value(), p_evidence_given: ev, p_evidence_kinds: kinds, p_path: path });
      if (r.error && /submit_read_check_v2|PGRST202|schema cache/i.test(r.error.message || '')) {   // 0061 not run yet: save the older way
        const o = await sb.rpc('submit_read_check', { p_item: `news:${itemId}`, p_note: `Liked: ${liked.value.trim()}\nDid not like: ${disliked.value.trim()}`, p_path: path });
        if (o.error) throw o.error;
      } else if (r.error) throw r.error;
      try { localStorage.removeItem(draftKey); } catch { /* ignore */ }
      if (onDone) onDone(); else msg.textContent = 'Sent. Thank you!';
    } catch (e) { fail(niceError(e)); go.disabled = false; }
  });

  return h('div', { class: 'wrf' },
    h('h3', { class: 'wrf-title', text: title || 'This article' }),
    url ? h('p', {}, h('a', { href: url, target: '_blank', rel: 'noopener noreferrer', text: 'Open the article in a new window' }), h('span', { class: 'wrf-muted', text: ' (read it, then come back here)' })) : null,
    h('p', { class: 'wrf-muted', text: 'Read it as best you can. You do not need to be an expert. This is a real review. A real person on our team will read it and say thank you.' }),
    h('label', { class: 'wrf-label', text: 'What did you like about the article?' }), liked,
    h('label', { class: 'wrf-label', text: 'What did you not like?' }), disliked,
    gTitle, gStance, gEvid, kindsBox,
    h('label', { class: 'wrf-label', text: 'Screenshot (you can skip this)' }), file,
    h('p', { class: 'wrf-muted wrf-small', text: 'Only you and our reviewers can see a screenshot. Hide names, addresses and emails first. We save it as a plain picture and make it smaller.' }),
    h('p', { class: 'wrf-muted wrf-small', text: 'You earn points only after a reviewer says yes. We look at honesty and evidence. Spelling and grammar do not matter.' }),
    h('div', { class: 'wrf-row' }, go), msg);
}
window.WayReviewForm = { build, niceError };
})();
