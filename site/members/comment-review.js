// Reviewer queue for news comments (0072). Reviewers and moderators only.
// Three kinds of comment wait here: appeals (the AI check declined it and the writer asked for a person), new members' first
// comments (held until a person approves them), and comments the AI check never answered in time. Approve = it appears.
// Decline = the writer is told why (a short reason is required). You can never review your own. Every decision is logged.
// All text goes in via textContent.
(() => {
'use strict';
const cfg = window.THE_WAY_CONFIG;
const app = document.getElementById('app');
if (!cfg || /YOUR-PROJECT/.test(cfg.supabaseUrl)) { app.textContent = 'Setup needed.'; return; }
const sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, { auth: { persistSession: true, autoRefreshToken: false } });
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
const head = [h('p', { class: 'overline', text: 'Reviewers' }), h('h1', { text: 'Comment review' }),
  h('p', { class: 'lede', text: 'Comments waiting for a person. Does it follow the rules: on topic, no insults or threats, "alleged" for anything unproven about a named person, no private information, no asking for votes? Approve it and it appears. Decline it and the writer sees your short reason. Appeals come first. You cannot review your own.' })];
const LABEL = { appealed: 'Appeal', held: 'Held', ai_timeout: 'Checker did not answer' };
const niceError = (e) => { const m = (e && e.message) || String(e); return /jwt|expired/i.test(m) ? 'Your sign-in ran out. Sign in again.' : m; };

async function load() {
  const { data: sess } = await window.WaySession.getSession(sb);
  if (!sess.session) { app.replaceChildren(...head, h('p', {}, h('a', { href: '/members/', text: 'Sign in' }), ' to see the queue.')); return; }
  const { data, error } = await sb.rpc('comment_review_queue', { max_rows: 60 });
  if (error) { app.replaceChildren(...head, h('p', { class: 'notice', text: /reviewer/i.test(error.message) ? 'The queue is for reviewers and moderators.' : niceError(error) })); return; }
  if (!data.length) { app.replaceChildren(...head, h('p', { class: 'muted', text: 'Nothing waiting. Thank you.' })); return; }
  const cards = data.map((c) => {
    const msg = h('div');
    const why = h('textarea', { maxlength: 500, rows: 2, 'aria-label': 'Reason (needed to decline)', placeholder: 'Reason for the writer (needed to decline, optional to approve)' });
    const ok = h('button', { type: 'button', text: 'Approve' });
    const no = h('button', { type: 'button', class: 'wd-quiet', text: 'Decline' });
    const act = (approve) => async () => {
      msg.textContent = ''; ok.disabled = no.disabled = true;
      const r = await sb.rpc('review_comment', { p_id: c.id, p_approve: approve, p_reason: why.value });
      if (r.error) { msg.className = 'wd-err'; msg.textContent = niceError(r.error); ok.disabled = no.disabled = false; return; }
      card.replaceChildren(h('p', { class: 'muted', text: approve ? 'Approved. Thank you.' : 'Declined. The writer was told.' }));
    };
    ok.addEventListener('click', act(true)); no.addEventListener('click', act(false));
    const card = h('section', { class: 'panel' },
      h('p', { class: 'wd-meta', text: `${LABEL[c.state] || c.state} · ${c.author_name}${c.author_is_new ? ' (new member)' : ''} · ${when(c.created_at)} · on ${c.item_key}` }),
      h('p', { class: 'wd-body', text: c.body }),
      c.state === 'appealed' && c.reason ? h('p', { class: 'wd-small', text: `The AI check said: ${c.reason}` }) : null,
      c.appeal_note ? h('p', { class: 'wd-small', text: `The writer says: ${c.appeal_note}` }) : null,
      h('p', {}, h('a', { href: '/members/discuss.html?item=' + encodeURIComponent(c.item_key), text: 'Open the article page' })),
      why, h('div', { class: 'wd-row' }, ok, no), msg);
    return card;
  });
  app.classList.add('wd');
  app.replaceChildren(...head, ...cards);
}
load().catch((e) => { app.replaceChildren(...head, h('p', { class: 'notice', text: niceError(e) })); });
})();
