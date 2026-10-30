// Reviewer queue for "Did you actually read it?" checks (0021). Reviewers and moderators only.
// Shows what a member said was interesting and their private screenshot; sign off "accepted" (the member earns points) or
// "declined" (with a reason). You can never sign off your own. Every sign-off is logged.
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
const head0 = [h('p', { class: 'overline', text: 'Reviewers' }), h('h1', { text: 'Read checks' }),
  window.WayReviewerGuidance ? h('div', { class: 'panel' }, h('h2', { text: window.WayReviewerGuidance.headline }),
    h('ul', {}, window.WayReviewerGuidance.note.map((t) => h('li', { text: t })))) : null,
  h('p', { class: 'lede', text: 'A member says they read a news article and what was interesting. Does the note sound like someone who read it? Does the screenshot, if there is one, match the article? Accept it and they earn points. Decline it (with a reason) and they earn nothing. You cannot sign off your own.' })];
const head = head0.filter(Boolean);

async function load() {
  const { data: sess } = await window.WaySession.getSession(sb);
  if (!sess.session) { app.replaceChildren(...head, h('p', {}, h('a', { href: '/members/', text: 'Sign in' }), ' to see the queue.')); return; }
  const { data, error } = await sb.rpc('read_check_queue', { max_rows: 30 });
  if (error) { app.replaceChildren(...head, h('p', { class: 'notice', text: /reviewer/.test(error.message) ? 'The queue is for reviewers and moderators.' : error.message })); return; }
  if (!data.length) { app.replaceChildren(...head, h('p', { class: 'muted', text: 'Nothing waiting. Thank you.' })); return; }
  // The page's security policy only allows images from this site or data: URLs, so each private screenshot is downloaded
  // (access is still checked by the database) and shown as a data: URL.
  const toData = (blob) => new Promise((res) => { const f = new FileReader(); f.onload = () => res(String(f.result)); f.onerror = () => res(null); f.readAsDataURL(blob); });
  const urls = await Promise.all(data.map(async (r) => {
    if (!r.path) return null;
    const d = await sb.storage.from('read-screenshots').download(r.path);
    return d.error ? null : toData(d.data);
  }));
  // Extra answers (0061) and a marker for a member's first three reviews. Missing function = older database: carry on without.
  const ctx = {};
  try { const c = await sb.rpc('read_check_answers_for', { p_ids: data.map((r) => r.id) }); (c.data || []).forEach((x) => { ctx[x.check_id] = x; }); } catch { /* ignore */ }
  const L = { yes: 'Yes', mostly: 'Mostly', no: 'No', unsure: 'Not sure', supports: 'Backs up the title', argues_against: 'Argues against the title', mixed: 'Some of both', no_claim: 'No clear claim', some: 'A little' };
  app.replaceChildren(...head, h('ul', { class: 'list panel' }, data.map((r, i) => {
    const u = urls[i];
    const why = h('input', { type: 'text', maxlength: 500, placeholder: 'Reason (needed to decline)', 'aria-label': 'Reason' });
    const msg = h('p', { class: 'small' });
    const act = (accept) => async (e) => {
      e.target.disabled = true; msg.textContent = '';
      const res = await sb.rpc('signoff_read_check', { p_id: r.id, p_accept: accept, p_reason: why.value || null });
      if (res.error) { msg.textContent = res.error.message; e.target.disabled = false; } else load();
    };
    return h('li', {},
      h('div', { class: 'meta', text: `${r.member_name} · ${when(r.created_at)} · ${r.item_key}` }),
      ctx[r.id] && ctx[r.id].first_review_no ? h('p', { class: 'notice', text: `New member: this is review number ${ctx[r.id].first_review_no} of their first 3. Be kind. Say one thing they did well and one thing to try next time.` }) : null,
      h('p', { class: 'post', text: r.note }),
      ctx[r.id] && ctx[r.id].title_accurate ? h('p', { class: 'small muted', text: `Title matches: ${L[ctx[r.id].title_accurate]}. Article: ${L[ctx[r.id].stance]}. Evidence shown: ${L[ctx[r.id].evidence_given]}${ctx[r.id].evidence_kinds && ctx[r.id].evidence_kinds.length ? ' (' + ctx[r.id].evidence_kinds.join(', ').replace(/_/g, ' ') + ')' : ''}.` }) : null,
      u ? h('img', { src: u, alt: 'Member screenshot', class: 'rc-shot' }) : h('p', { class: 'small muted', text: 'No screenshot.' }),
      h('div', { class: 'btns' }, h('button', { class: 'primary', type: 'button', text: 'Accept', onclick: act(true) }), h('button', { type: 'button', text: 'Decline', onclick: act(false) }), why),
      window.WayReviewerGuidance ? h('div', { class: 'btns' }, h('span', { class: 'small muted', text: 'Gentle reasons:' }),
        window.WayReviewerGuidance.declineTemplates.map((t) => h('button', { type: 'button', class: 'quiet small-btn', text: t.label, onclick: () => { why.value = t.text; } }))) : null, msg);
  })));
}
load().catch((e) => { app.textContent = e.message; });
})();
