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


// ---------------------------------------------------------------- Save to notes
// Any result block can be saved as a private note (table private_research, owner-only). Unchecked things are flagged
// "not verified yet" so the member can go to the sources and check them. A note can also go on one item of My Ballot,
// printing as the headline alone or with the full details. Signed-out visitors are asked to log in.
const WB = window.WayBallot;
let asked = '';                                                   // what the visitor just sent, used as the default headline
const absUrl = (u) => { try { const x = new URL(u, location.origin); return x.protocol === 'https:' ? x.href : ''; } catch { return ''; } };
const hostOf = (u) => { try { return new URL(u).hostname; } catch { return u; } };
function ballotChoices() {
  const out = [];
  if (!WB) return out;
  for (const st of WB.states()) {
    const d = WB.read(st);
    for (const k of Object.keys(d.contests)) out.push({ value: `${st}|${k}`, label: `${WB.STATES[st]}: ${d.contests[k].title || k}` });
  }
  return out;
}
const MATCH_KIND = (m) => (m.kind === 'finding' ? 'A member-checked finding' : m.kind === 'case' ? 'A history case' : 'Already on the site');
const matchItem = (m, extra) => ({ headline: m.title, details: [m.blurb || MATCH_KIND(m), extra].filter(Boolean).join('\n'),
  sources: m.path ? [{ url: absUrl(m.path), title: m.title }] : [], origin: 'site_match', verified: m.kind === 'finding' });
function saveBar(getItem) {
  const wrap = h('div', { class: 'pt-save' });
  const btn = h('button', { type: 'button', class: 'quiet pt-save-btn', 'aria-expanded': 'false', text: 'Save to notes' });
  const panel = h('div', { class: 'pt-save-panel', hidden: true });
  const open = () => {
    const item = getItem();
    const choices = ballotChoices();
    const head = h('input', { id: `pt-sv-${++svId}`, maxlength: '200', value: String(item.headline || 'Pull a Thread note').slice(0, 200) });
    const sel = h('select', { id: `pt-svb-${svId}` }, h('option', { value: '', text: 'Not on my ballot' }), choices.map((c) => h('option', { value: c.value, text: c.label })));
    const mode = (v, t, on) => h('label', { class: 'pt-check-row' }, h('input', { type: 'radio', name: `pt-pm-${svId}`, value: v, checked: on }), h('span', { text: t }));
    const modes = h('fieldset', { class: 'pt-modes-print', hidden: true }, h('legend', { class: 'pt-sr', text: 'What prints on my ballot' }),
      mode('headline', 'Print the headline only (a short reminder)', true), mode('full', 'Print the full details and sources', false));
    sel.addEventListener('change', () => { modes.hidden = !sel.value; });
    const out = h('p', { class: 'pt-err', role: 'status' });
    const save = h('button', { type: 'button', class: 'primary', text: 'Save note' });
    save.addEventListener('click', async () => {
      const title = head.value.trim();
      if (!title) { out.textContent = 'Give the note a headline.'; return; }
      save.disabled = true; out.textContent = '';
      const srcs = (item.sources || []).filter((x) => x && /^https:\/\//i.test(x.url || '') && x.url.length <= 1000).slice(0, 12);
      const [st, key] = sel.value ? sel.value.split('|') : [null, null];
      const pm = (panel.querySelector(`input[name="pt-pm-${svId}"]:checked`) || {}).value === 'full' ? 'full' : 'headline';
      const row = { owner_id: session.user.id, title: title.slice(0, 200), body: String(item.details || '').slice(0, 100000), origin: item.origin,
        sources: srcs.map((x) => ({ url: x.url, title: String(x.title || '').slice(0, 200), checked: !!item.verified })), verified: !!item.verified,
        ballot_state: st, ballot_key: key, print_mode: pm };
      const { data, error } = await sb.from('private_research').insert(row).select('id');
      if (error) { save.disabled = false; out.textContent = error.message || 'Could not save. Please try again.'; return; }
      let onBallot = false;
      if (st && WB) {
        try {
          const d = WB.read(st), id = WB.factId('thread-note', String(data && data[0] && data[0].id));   // the note's id, so checking the note later can update this line
          d.facts[id] = { id, kind: 'note', headline: title.slice(0, 160), text: String(item.details || title).slice(0, 1200), contest: key, subject: '', subjectLabel: '',
            pageUrl: '', pageTitle: 'Pull a Thread', srcUrl: srcs[0] ? srcs[0].url : '', srcLabel: srcs[0] ? (srcs[0].title || hostOf(srcs[0].url)) : '',
            srcs: srcs.map((x) => ({ url: x.url, label: x.title || hostOf(x.url) })), print: true, compare: false, side: '', note: '', ts: Date.now(),
            flag: item.verified ? 'checked' : 'unverified', printMode: pm };
          onBallot = WB.write(WB.clean(d, st));
        } catch { onBallot = false; }
      }
      const id = data && data[0] && data[0].id;
      panel.replaceChildren(h('p', { role: 'status' }, 'Saved to your private notes. ',
        item.verified ? '' : 'It is marked not verified yet: open it to check the sources yourself. ',
        id ? h('a', { href: `/members/#/private/${id}`, text: 'Open the note' }) : null,
        st ? (onBallot ? ' It is also on your ballot.' : ' We could not add it to your ballot on this device.') : ''));
      btn.disabled = true; btn.textContent = 'Saved'; live.textContent = 'Saved to your notes.';
    });
    panel.replaceChildren(h('label', { for: head.id, text: 'Headline' }), head,
      item.verified ? h('p', { class: 'pt-help', text: 'Already checked by a person on our side.' })
        : h('p', { class: 'pt-flag', text: 'Not verified yet. This note will be flagged so you can go back to the sources and check them yourself. Your check can also help our reviewers.' }),
      ...(choices.length ? [h('label', { for: sel.id, text: 'Also put it on my ballot (optional)' }), sel, modes] : [h('p', { class: 'pt-help', text: 'Mark a race or measure in My Ballot first if you want notes on your printed ballot.' })]),
      h('div', { class: 'btns' }, save), out);
  };
  btn.addEventListener('click', () => {
    if (!session) {
      panel.hidden = false;
      panel.replaceChildren(h('p', { role: 'status' }, 'Log in to save notes. Your notes are private to you. ', h('a', { href: '/members/', text: 'Log in' })));
      return;
    }
    if (panel.hidden) { open(); panel.hidden = false; btn.setAttribute('aria-expanded', 'true'); } else { panel.hidden = true; btn.setAttribute('aria-expanded', 'false'); }
  });
  wrap.append(btn, panel);
  return wrap;
}
let svId = 0;

// ---------------------------------------------------------------- outcome cards
function matchList(matches) {
  if (!matches || !matches.length) return null;
  return h('ul', { class: 'pt-matches' }, matches.map((m) => h('li', {},
    h('strong', {}, m.path ? h('a', { href: m.path, text: m.title }) : m.title),
    h('span', { class: 'muted small', text: ` ${m.kind === 'finding' ? 'A member-checked finding (members can read it)' : m.kind === 'case' ? 'A history case' : 'Already on the site'} · ${m.strength === 'source' ? 'cites the link you sent' : 'shares key words with what you sent'}` }),
    saveBar(() => matchItem(m)))));
}
const lead = () => h('p', { class: 'pt-lead' }, 'Here\u2019s what our records show so far. Follow this thread as we learn more ', h('strong', {}, h('em', { text: 'together!' })));
function card(kind, title, ...kids) {
  const f = { reviewed: 'pat-reviewed-evidence.svg', related: 'pat-related-evidence.svg', closer: 'pat-needs-review.svg' }[kind];
  return h('section', { class: `pt-outcome pt-${kind}` }, h('h2', {}, icon(f), title), ...kids);
}
// The quick answer from our own records: supports, contradicts, related but does not settle it. Labeled AI-generated until a reviewer checks it.
function prelimItem(t) {
  const pr = t.prelim, lines = [pr.label, ''], sources = [];
  for (const [key, title] of [['supports', 'Supports it'], ['contradicts', 'Contradicts it'], ['related', 'Related, but does not settle it']]) {
    if (!(pr[key] && pr[key].length)) continue;
    lines.push(`${title}:`);
    for (const m of pr[key]) { lines.push(`- ${m.title}${m.blurb ? ': ' + m.blurb : ''}`); if (m.path && absUrl(m.path) && !sources.some((x) => x.url === absUrl(m.path))) sources.push({ url: absUrl(m.path), title: m.title }); }
  }
  if (lines.length === 2) lines.push(pr.enough ? 'See the records on our site.' : 'We did not have enough evidence in our records to say yet.');
  return { headline: asked || 'Pull a Thread answer', details: lines.join('\n'), sources, origin: 'ai_answer', verified: false };
}
function prelimCard(t) {
  const pr = t.prelim;
  const sec = (key, title, hint) => (pr[key] && pr[key].length)
    ? h('div', { class: 'pt-sec' }, h('h3', { text: title }), h('p', { class: 'pt-help', text: hint }), h('ul', { class: 'pt-matches' }, pr[key].map((m) => h('li', {},
        h('strong', {}, m.path ? h('a', { href: m.path, text: m.title }) : m.title),
        h('span', { class: 'muted small', text: m.kind === 'finding' ? ' A member-checked finding (members can read it)' : m.kind === 'case' ? ' A history case' : ' Already on the site' }),
        m.blurb ? h('p', { class: 'pt-blurb', text: m.blurb }) : null,
        saveBar(() => matchItem(m, `${title}: ${hint}`)))))) : null;
  return h('section', { class: 'pt-outcome pt-prelim' }, h('h2', {}, icon('pat-related-evidence.svg'), 'What our records show'),
    h('p', { class: 'pt-badge', text: pr.label }),
    lead(),
    pr.enough || (pr.related && pr.related.length) ? null : h('p', { text: 'We do not have enough evidence in our records to say yet. That is a real answer, and a reviewer will look into it.' }),
    !pr.enough && pr.related && pr.related.length ? h('p', { text: 'Nothing we have settles this yet. What we found is related only.' }) : null,
    sec('supports', 'Supports it', 'Records that back up what you sent.'),
    sec('contradicts', 'Contradicts it', 'Records that point the other way.'),
    sec('related', 'Related, but does not settle it', 'Records on the same subject that neither back it up nor rule it out.'),
    saveBar(() => prelimItem(t)),
    h('p', { class: 'muted small', text: 'This answer comes from everything public on our site: all our data points. Outside sources are looked for only after a request is sent, and a person checks them before they count as evidence. A reviewer can check this answer, correct it, or start a deeper investigation. Every change is logged.' }));
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
  if (t.prelim) parts.push(prelimCard(t));
  else if (t.prelim_reading) parts.push(h('section', { class: 'pt-outcome pt-prelim' }, h('h2', {}, icon('pat-progress-static.svg'), 'Checking our records…'),
    h('p', { role: 'status', text: 'We are comparing what you sent with what we already have. This can take a minute.' })));
  if (t.code === 'answered' || (t.status === 'Answered')) {
    parts.push(card('reviewed', 'Reviewed evidence', lead(), h('p', { text: t.note || 'A reviewer answered this with what we already have.' }), matchList(m),
      h('p', { class: 'muted small', text: 'Status: answered by a reviewer.' }),
      saveBar(() => ({ headline: asked || 'Reviewed answer', details: t.note || 'A reviewer answered this with what we already have.',
        sources: m.map((x) => (x.path ? { url: absUrl(x.path), title: x.title } : null)).filter((x) => x && x.url), origin: 'reviewed', verified: true }))));
  } else if (m.length && !t.prelim && !t.prelim_reading) {
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
    leadsSection(receipt, box.closest('.pt-sent') || box);
  });
  del.addEventListener('click', async () => {
    busy(true);
    const r = await sb.rpc('thread_discard', { p_receipt: receipt });
    if (r.error) { busy(false); out.textContent = r.error.message || 'Could not delete it. Please try again.'; return; }
    box.replaceChildren(h('p', { role: 'status', text: 'Deleted. The text and your note are gone, and the picture is removed.' }));
    live.textContent = 'Deleted.';
  });
  wrap.append(...[
    h('p', { text: shot ? 'Our own program read this from your picture and may have made mistakes. Fix anything that is wrong.'
      : 'Our own program hid the names of the people who wrote the posts. Names inside the posts were left alone. Check that nothing you want private is left.' }),
    t.hide_names && shot ? h('p', { text: 'We also hid the names of the people who wrote the posts. Names inside the posts were left alone.' }) : null,
    t.redact_note ? h('p', { class: 'pt-err', role: 'alert', text: t.redact_note }) : null,
    !t.ocr_text && shot ? h('p', { text: 'We could not read any text in your picture. Type or paste what it says instead.' }) : null,
    h('label', { for: 'pt-ocr-text', text: shot ? 'What the screenshot says' : 'Your text' }), ta,
    h('p', { class: 'muted small', text: `Not sent yet. If you do not press Send within about ${Math.max(1, t.draft_minutes_left || 60)} minutes, we delete ${shot ? 'the picture and ' : ''}this text for good.` }),
    h('div', { class: 'btns' }, send, del), out].filter(Boolean));   // DOM append() would print "null"
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
    const waiting = data && (data.reading || data.prelim_reading);
    if (data && data.prelim_reading && !askedFollow) results.querySelector('.pt-dynamic')?.replaceChildren(...outcome(Object.assign({ code: data.code }, data), receipt));
    if (data && !waiting && !askedFollow && !['In review'].includes(data.status)) {
      const fresh = outcome(Object.assign({ code: data.code }, data), receipt);
      results.querySelector('.pt-dynamic')?.replaceChildren(...fresh);
      if (data.status === 'Waiting for a reviewer') { askedFollow = true; followUp(receipt, box); }
    }
    if (Date.now() - t0 >= WAIT_MS && !askedFollow) { askedFollow = true; followUp(receipt, box); }
    if (Date.now() - t0 < 180000 && (waiting || !askedFollow)) setTimeout(tick, 5000);
  };
  setTimeout(tick, draft ? 1500 : 3000);
}
// Unchecked web leads, found by our own computer after a request is sent. Always labelled; a person checks them later.
function leadsSection(receipt, box) {
  box.querySelector('.pt-leads')?.remove();
  const sec = h('section', { class: 'pt-leads' });
  box.append(sec);
  let tries = 0;
  const paint = async () => {
    if (!sec.isConnected) return;
    const { data } = await sb.rpc('thread_leads', { p_receipt: receipt });
    if (!sec.isConnected || !data) return;
    const list = data.leads || [];
    if (!list.length && (data.status === 'none' || data.status === 'failed')) { sec.replaceChildren(); return; }
    if (!list.length && data.status === 'done') { sec.replaceChildren(h('p', { class: 'muted small', text: 'We looked for outside sources and found none we could use yet. A reviewer will look further.' })); return; }
    if (!list.length) { sec.replaceChildren(h('p', { class: 'muted small', role: 'status', text: 'Looking for outside sources…' })); if (++tries < 80) setTimeout(paint, 15000); return; }
    sec.replaceChildren(h('h2', {}, 'Leads we found on the web'),
      h('p', { class: 'pt-badge', text: 'AI-researched leads, not yet checked by a person' }),
      h('p', { class: 'pt-help', text: 'We will update this when a human reviewer verifies the sources. Until then, treat these as places to look, not as proof.' }),
      h('ul', { class: 'pt-matches' }, list.map((l) => h('li', {},
        h('strong', {}, /^https:\/\//i.test(l.url) ? h('a', { href: l.url, rel: 'noopener noreferrer nofollow', target: '_blank', text: l.title || l.url }) : (l.title || l.url)),
        h('span', { class: 'muted small', text: l.checked ? ' Checked by a person' : ' Not checked yet' }),
        h('p', { class: 'pt-blurb', text: l.excerpt }),
        saveBar(() => ({ headline: l.title || l.url, details: l.excerpt, sources: [{ url: l.url, title: l.title || hostOf(l.url) }], origin: 'web_lead', verified: !!l.checked }))))));
    if (data.status === 'pending' || data.status === 'running') { if (++tries < 80) setTimeout(paint, 15000); }
  };
  paint();
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
  if (!draft) leadsSection(receipt, box);
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
  asked = (kind === 'url' ? `Link: ${hostOf(fd.get('url'))}` : kind === 'screenshot' ? (form.elements.note.value.trim() || 'Screenshot') : q).replace(/\s+/g, ' ').slice(0, 160);
  form.reset(); shotFile = null; view();
  showSent(body.receipt, body.status, body.matches, kind === 'screenshot' || body.status === 'draft');
}

function modeField(form) {
  const f = h('div', { class: 'pt-field' });
  if (mode === 'question' || mode === 'text') {
    f.append(h('label', { for: 'pt-question', text: mode === 'text' ? 'Paste the text you want checked' : 'What thread do you want to pull?' }),
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
    checks.push(h('p', { class: 'pt-help', text: 'Our AI runs on our own computer. No outside AI service is used, and it does not learn from or train on what you send. Your first answer comes from everything public on our site, all our data points. After you send, our program also looks for outside sources on the web: only a short search phrase about the subject is used, never your name, email, picture or full text. Those leads stay marked as not checked until a person verifies them.' }));
  }
  if (mode === 'text' || mode === 'screenshot') {   // not for typed questions
    checks.push(h('label', { class: 'pt-check-row' }, h('input', { type: 'checkbox', name: 'hide_names' }),
      h('span', {}, h('strong', { text: 'Hide names of senders. ' }), 'Our program hides the names and handles of the people who wrote the posts or comments (yours too). Names inside the posts stay. You see the result before anything is sent.',
        h('span', { class: 'pt-help', text: ' If the person who wrote the post is the public official you are asking about, hiding names also hides that it is their quote. That can make it harder for us to check.' }))));
  }
  const trap = h('div', { class: 'pt-hp', 'aria-hidden': 'true' }, h('input', { name: 'website', tabindex: '-1', autocomplete: 'off' }));
  const ts = h('div', { class: 'pt-ts' });
  const BA = '/members/art/', still = BA + 'thread-slack-480.webp', pulled = BA + 'thread-pull-480.webp';
  const goImg = h('img', { src: still, alt: '', width: '480', height: '153', class: 'pt-go-art', 'aria-hidden': 'true' });
  const go = h('button', { type: 'submit', class: 'pt-go' }, goImg, h('span', { class: 'pt-go-text', text: 'Submit' }));   // real text under the picture is the button's name
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)');
  go.addEventListener('click', () => { if (reduce && reduce.matches) { goImg.src = BA + 'thread-taut-480.webp'; return; } goImg.src = pulled + '?t=' + Date.now(); });   // plays once per press; still for reduced motion
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
    leadsSection(inp.value.trim(), out);
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
