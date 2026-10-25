// Public review history (reviews.html, reviews.html?case=<slug>): which history cases a person has
// checked, and every flag, note and correction since. Open to anyone, signed in or not. Reviewer
// names are not shown. Rows come from public.case_review_status() and public.case_review_history().
(() => {
'use strict';
const cfg = window.THE_WAY_CONFIG;
const app = document.getElementById('app');
if (!cfg || /YOUR-PROJECT/.test(cfg.supabaseUrl)) { app.textContent = 'Setup needed.'; return; }
const sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, { auth: { persistSession: false, autoRefreshToken: false } });
const CASES = window.WAY_CASES || [];
const byslug = (s) => CASES.find((c) => c.slug === s) || null;
const caseName = (s) => { const c = byslug(s); return c ? `Case ${c.num}: ${c.title}` : s; };

function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  return el;
}
const day = (iso) => new Date(iso).toLocaleDateString(undefined, { dateStyle: 'medium' });
const when = (iso) => new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
const LABEL = { claim_checked: 'Claim checked', claim_flagged: 'Claim flagged', claim_cleared: 'Flag cleared', review_started: 'Review started',
  note: 'Note', marked_reviewed: 'Marked reviewed by a person', reopened: 'Reopened' };
async function q(p) { const { data, error } = await p; if (error) throw error; return data; }

function event(e, withCase) {
  return h('li', {},
    h('div', { class: 'meta', text: `${LABEL[e.event_type] || e.event_type} · ${when(e.created_at)}${withCase ? ` · ${caseName(e.case_slug)}` : ''}` }),
    e.claim_text ? h('p', { class: 'small', text: e.claim_text }) : null,
    e.note ? h('p', { class: 'post', text: e.note }) : null);
}

async function listView() {
  const [status, recent] = await Promise.all([q(sb.rpc('case_review_status')), q(sb.rpc('case_review_history', { max_rows: 30 }))]);
  const done = status.filter((s) => s.status === 'reviewed');
  app.replaceChildren(
    h('p', { class: 'overline', text: 'The record' }),
    h('h1', { text: 'Review history' }),
    h('p', { class: 'lede', text: 'Every history case starts as a draft that no person has checked. A reviewer checks its key claims against the sources, one by one. Every flag, note and correction is kept here, and nothing is ever changed or deleted.' }),
    h('p', { class: 'muted', text: `${done.length} of ${CASES.length || 'all'} cases are marked reviewed by a person. The rest say "Not yet reviewed by a person" at the top of the page.` }),
    status.length ? h('ul', { class: 'list panel' }, status.map((s) => h('li', {},
      h('div', { class: 'row' }, h('strong', {}, h('a', { href: `?case=${encodeURIComponent(s.case_slug)}`, text: caseName(s.case_slug) })),
        h('span', { class: `tag ${s.status === 'reviewed' ? 'ok' : ''}`, text: s.status === 'reviewed' ? `reviewed ${day(s.reviewed_at)}` : 'in review' })),
      h('p', { class: 'muted small', text: `${s.claims_checked} claim(s) checked${s.claims_flagged ? ` · ${s.claims_flagged} flagged` : ''} · last activity ${day(s.last_activity)}` }))))
      : h('p', { class: 'muted', text: 'No review has started yet.' }),
    recent.length ? h('div', { class: 'panel' }, h('h2', { text: 'Latest activity' }), h('ul', { class: 'list' }, recent.map((e) => event(e, true)))) : null);
}

async function caseView(slug) {
  const rows = await q(sb.rpc('case_review_history', { case_slug: slug, max_rows: 500 }));
  const c = byslug(slug);
  app.replaceChildren(
    h('p', { class: 'overline', text: 'Review history' }),
    h('h1', { text: caseName(slug) }),
    h('p', { class: 'small' }, h('a', { href: 'reviews.html', text: 'All cases' }),
      c ? [' · ', h('a', { href: `/preview/pages/cases/${slug}.html`, text: 'Read the case' })] : null),
    rows.length ? h('ul', { class: 'list panel' }, rows.map((e) => event(e, false)))
      : h('p', { class: 'muted', text: 'No person has reviewed this case yet.' }));
}

(async () => {
  const slug = new URLSearchParams(location.search).get('case');
  try { await (slug && /^[a-z0-9-]{2,80}$/.test(slug) ? caseView(slug) : listView()); }
  catch (err) { app.replaceChildren(h('div', { class: 'notice error', role: 'alert', text: 'Could not load the review history. Try again later.' })); }
})();
})();
