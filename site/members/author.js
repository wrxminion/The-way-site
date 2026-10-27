// Author desk and ranks (migration 0024).
//   * Your ranks: how close you are to Author (Submitter), Deshi (student, reviewer) and Renshi (editor), and a button to ask when the numbers are met.
//   * Send an article or a source (Authors, Deshi, Renshi). No daily limit; points come only after someone else accepts it.
//   * Review queue (Deshi and Renshi): accept, decline (with a reason) or flag as fabricated. You never see your own.
//   * Rank requests (admins; Renshi requests need a super admin).
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
const notice = (t, kind) => h('p', { class: 'notice' + (kind === 'ok' ? ' ok' : ''), role: kind === 'ok' ? 'status' : 'alert', text: t });
const ROLE_LABEL = { researcher: 'Author (Submitter)', reviewer: 'Deshi (student, reviewer)', editor: 'Renshi (editor)' };
const STATUS_LABEL = { waiting: 'Waiting for a check', accepted: 'Accepted', declined: 'Declined', fabricated: 'Flagged as fabricated' };
let roles = new Set();
const can = (r) => roles.has(r) || roles.has('admin') || roles.has('super_admin');

function head() {
  return [h('p', { class: 'overline' }, h('a', { href: '/members/', text: 'Members' })),
    h('h1', { text: 'Author desk and ranks' }),
    h('p', { class: 'lede', text: 'Send articles and sources, check other people\'s, and earn ranks through confirmed work. You can send as many as you like. Points arrive only after someone else checks and accepts an item. Points alone never give a rank: an admin confirms it.' })];
}

function checklistRow(label, have, need, unit) {
  const ok = have >= need;
  return h('li', {}, h('span', { class: ok ? 'tag' : 'tag warn', text: ok ? 'met' : 'not yet' }), ` ${label}: ${have} of ${need}${unit || ''}`);
}

async function ranksPanel() {
  const { data, error } = await sb.rpc('rank_progress');
  if (error) return h('div', { class: 'panel' }, h('h2', { text: 'Your ranks' }), notice(error.message));
  const msg = h('div');
  return h('div', { class: 'panel' }, h('h2', { text: 'Your ranks' }), msg,
    data.map((p) => h('div', { class: 'panel' },
      h('div', { class: 'row' }, h('strong', { text: p.label }), p.have_it ? h('span', { class: 'tag', text: 'you have it' }) : p.open_request ? h('span', { class: 'tag warn', text: 'waiting for confirmation' }) : null),
      h('p', { class: 'small muted', text: p.note }),
      p.have_it ? null : h('ul', { class: 'small list' },
        checklistRow('Accepted items', p.events, p.need_events),
        checklistRow('Different people who signed them off', p.signers, p.need_signers),
        checklistRow('Days as a member', p.days_member, p.need_days_member),
        p.requires_role ? h('li', {}, h('span', { class: p.has_required_role ? 'tag' : 'tag warn', text: p.has_required_role ? 'met' : 'not yet' }), ` Needs ${ROLE_LABEL[p.requires_role]} first`) : null,
        p.requires_role && p.need_days_in_prior ? checklistRow(`Days as ${ROLE_LABEL[p.requires_role]}`, p.days_in_prior, p.need_days_in_prior) : null,
        p.fabrication_block ? h('li', {}, h('span', { class: 'tag warn', text: 'blocked' }), ' A fabricated source was found in the last 180 days.') : null),
      p.have_it || p.open_request ? null : h('div', { class: 'btns' }, h('button', {
        class: p.eligible ? 'primary' : '', type: 'button', disabled: !p.eligible,
        text: p.eligible ? `Ask for ${p.label}` : 'Not yet',
        onclick: async (e) => {
          e.target.disabled = true;
          const r = await sb.rpc('request_rank', { p_role: p.role });
          if (r.error) { msg.replaceChildren(notice(r.error.message)); e.target.disabled = false; } else render();
        } })),
      p.eligible && !p.have_it && !p.open_request ? h('p', { class: 'small dim', text: `A ${p.confirm_role === 'super_admin' ? 'super admin' : 'admin'} confirms it. The record is public in the moderation log.` }) : null)));
}

function submitPanel() {
  const msg = h('div');
  const kind = h('select', { id: 'a-kind' }, h('option', { value: 'article', text: 'Article' }), h('option', { value: 'source', text: 'Source' }));
  const title = h('input', { id: 'a-title', minlength: 5, maxlength: 200, required: true });
  const url = h('input', { id: 'a-url', type: 'url', required: true, placeholder: 'https://…' });
  const sum = h('textarea', { id: 'a-sum', rows: 5, minlength: 20, maxlength: 2000, required: true, placeholder: 'What is it, and why does it matter? Say what the source actually says. No opinions about candidates or parties.' });
  return h('div', { class: 'panel' }, h('h2', { text: 'Send an article or a source' }),
    h('p', { class: 'muted small', text: 'There is no daily limit. Up to 20 can be waiting for a check at once. You earn points only after a different Deshi or Renshi accepts it. A made-up quote or source costs you points and blocks rank requests for 180 days.' }),
    msg,
    h('form', { onsubmit: async (e) => {
      e.preventDefault(); msg.replaceChildren();
      const r = await sb.rpc('submit_author_item', { p_kind: kind.value, p_title: title.value, p_url: url.value, p_summary: sum.value });
      if (r.error) { msg.replaceChildren(notice(r.error.message)); return; }
      title.value = url.value = sum.value = ''; msg.replaceChildren(notice('Sent. A Deshi or Renshi will check it.', 'ok')); render();
    } },
      h('label', { for: 'a-kind' }, 'Kind', kind), h('label', { for: 'a-title' }, 'Title', title),
      h('label', { for: 'a-url' }, 'Link to the original', url), h('label', { for: 'a-sum' }, 'Summary', sum),
      h('div', { class: 'btns' }, h('button', { class: 'primary', text: 'Send for checking' }))));
}

async function minePanel() {
  const { data, error } = await sb.rpc('my_author_items');
  if (error) return null;
  return h('div', {}, h('h2', { text: 'What you sent' }),
    data.length ? h('ul', { class: 'list panel' }, data.map((i) => h('li', {},
      h('div', { class: 'row' }, h('span', { text: i.title }), h('span', { class: i.status === 'accepted' ? 'tag' : 'tag warn', text: STATUS_LABEL[i.status] || i.status })),
      h('div', { class: 'meta', text: `${i.kind} · ${when(i.created_at)}${i.reason ? ' · ' + i.reason : ''}` })))) : h('p', { class: 'muted', text: 'Nothing sent yet.' }));
}

async function queuePanel() {
  const { data, error } = await sb.rpc('author_queue', { p_max: 50 });
  if (error) return null;
  return h('div', {}, h('h2', { text: `To check (${data.length})` }),
    h('p', { class: 'small muted', text: 'Open the link and compare it with the summary. Accept only what you could stand behind. Decline needs a short reason. Use "Fabricated" only when a quote or source does not exist.' }),
    data.length ? h('ul', { class: 'list panel' }, data.map((i) => {
      const why = h('input', { type: 'text', maxlength: 500, placeholder: 'Reason (needed to decline)', 'aria-label': 'Reason' });
      const msg = h('p', { class: 'small' });
      const act = (decision) => async (e) => {
        if (decision === 'fabricated' && !confirm('Flag as fabricated? The sender loses points and cannot ask for a rank for 180 days.')) return;
        e.target.disabled = true; msg.textContent = '';
        const r = await sb.rpc('decide_author_item', { p_id: i.id, p_decision: decision, p_reason: why.value || null });
        if (r.error) { msg.textContent = r.error.message; e.target.disabled = false; } else render();
      };
      return h('li', {},
        h('div', { class: 'row' }, h('strong', { text: i.title }), h('span', { class: 'tag', text: i.kind })),
        h('p', { class: 'small' }, h('a', { href: i.url, target: '_blank', rel: 'noopener noreferrer', text: i.url })),
        h('p', { class: 'post', text: i.summary }),
        h('div', { class: 'btns' }, h('button', { class: 'primary', type: 'button', text: 'Accept', onclick: act('accepted') }),
          h('button', { type: 'button', text: 'Decline', onclick: act('declined') }),
          h('button', { class: 'quiet danger', type: 'button', text: 'Fabricated', onclick: act('fabricated') }), why), msg);
    })) : h('p', { class: 'muted', text: 'Nothing waiting. Thank you.' }));
}

async function requestsPanel() {
  const { data, error } = await sb.rpc('open_rank_requests');
  if (error) return null;
  return h('div', {}, h('h2', { text: `Rank requests (${data.length})` }),
    data.length ? h('ul', { class: 'list panel' }, data.map((r) => {
      const why = h('input', { type: 'text', maxlength: 500, placeholder: 'Reason (shown in the moderation log)', 'aria-label': 'Reason' });
      const msg = h('p', { class: 'small' });
      const act = (approve) => async (e) => {
        e.target.disabled = true; msg.textContent = '';
        const x = await sb.rpc('decide_rank_request', { p_id: r.id, p_approve: approve, p_reason: why.value });
        if (x.error) { msg.textContent = x.error.message; e.target.disabled = false; } else render();
      };
      const b = r.basis || {};
      return h('li', {}, h('div', { class: 'row' }, h('strong', { text: `${r.member_name} asks for ${r.label}` }), h('span', { class: 'meta', text: when(r.created_at) })),
        h('p', { class: 'small', text: `${b.events} accepted items, ${b.signers} different signers, ${b.days_member} days a member.` }),
        h('div', { class: 'btns' }, h('button', { class: 'primary', type: 'button', text: 'Confirm', onclick: act(true) }), h('button', { type: 'button', text: 'Decline', onclick: act(false) }), why), msg);
    })) : h('p', { class: 'muted', text: 'No open requests.' }));
}

async function render() {
  const { data: sess } = await sb.auth.getSession();
  if (!sess.session) { app.replaceChildren(...head(), h('p', {}, h('a', { href: '/members/', text: 'Sign in' }), ' to use the Author desk.')); return; }
  const { data: rows, error } = await sb.from('member_roles').select('role').eq('member_id', sess.session.user.id);
  if (error) { app.replaceChildren(...head(), notice(error.message)); return; }
  roles = new Set(rows.map((r) => r.role));
  const canSend = can('researcher') || can('reviewer') || can('editor');
  const canCheck = can('reviewer') || can('editor');
  const parts = await Promise.all([
    ranksPanel(), canSend ? Promise.resolve(submitPanel()) : null, canSend ? minePanel() : null,
    canCheck ? queuePanel() : null, can('admin') ? requestsPanel() : null]);
  app.replaceChildren(...head(), ...parts.filter(Boolean));
}
render().catch((e) => { app.textContent = e.message; });
})();
