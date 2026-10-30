// Thread queue (thread-queue.html): reviewers (Deshi), editors and admins work the Pull a Thread queue.
// The list is ranked by OUR score, not by who sent first; every score shows its reasons. Any item can be picked, not
// only the top one. The sender's identity is not in any of this data. Text from senders and from web pages is
// put on the page with textContent only.
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
const note = h('p', { class: 'small', role: 'status', 'aria-live': 'polite' });
let include = 'open';
let canChange = false;   // admins may change a closed decision (can_change_thread_decision)
let projects = [];   // active research projects, for the Close button and the Researching tab
async function call(name, args) { const { data, error } = await sb.rpc(name, args); if (error) throw error; return data; }
async function act(p, okText) { try { await p; note.textContent = okText; await load(); } catch (e) { note.textContent = e.message || 'That did not work.'; } }

function parts(list) {
  return h('ul', { class: 'pt-parts' }, list.map((p) => h('li', { class: p.pts < 0 ? 'neg' : '' }, `${p.pts > 0 ? '+' : ''}${p.pts}  ${p.label}`)));
}
function safeLink(url) {
  return /^https?:\/\//i.test(url) ? h('a', { href: url, rel: 'noopener noreferrer nofollow', target: '_blank', text: url }) : h('span', { text: url });
}
// The preliminary answer made from our records. The reviewer who picked the item can check it, move a record, or remove one (reason required, logged).
function prelimBox(r) {
  if (r.prelim_status === 'pending' || r.prelim_status === 'running') return h('p', { class: 'muted small', text: 'Preliminary answer: still being made.' });
  if (r.prelim_status === 'failed') return h('p', { class: 'muted small', text: 'Preliminary answer: it could not be made (the local model was not available). Use the records below.' });
  const p = r.prelim; if (!p) return null;
  const wrap = h('div', { class: 'pt-excerpt' }, h('strong', { text: p.checked ? 'Preliminary answer (checked by a reviewer):' : 'Preliminary answer (AI-generated, not checked yet):' }),
    !p.enough ? h('p', { class: 'small', text: 'Not enough evidence in our records to say.' }) : null);
  const names = { supports: 'Supports it', contradicts: 'Contradicts it', related: 'Related, does not settle it' };
  for (const sec of ['supports', 'contradicts', 'related']) {
    for (const it of (p[sec] || [])) {
      const row = h('div', { class: 'small' }, h('strong', { text: `${names[sec]}: ` }), `${it.title} (${it.kind})`);
      if (r.claimed_by_me) {
        const sel = h('select', { 'aria-label': `Move ${it.title}` }, ['supports', 'contradicts', 'related', 'remove'].map((v) => h('option', { value: v, text: v === 'remove' ? 'Remove from answer' : names[v], selected: v === sec })));
        const b = h('button', { type: 'button', class: 'quiet', text: 'Change', onclick: async () => {
          if (sel.value === sec) return;
          const reason = window.prompt('Why? (5 to 300 characters. This is logged with your name.)'); if (reason === null) return;
          act(call('thread_prelim_correct', { p_id: r.id, p_kind: it.kind, p_ref: it.ref, p_section: sel.value, p_reason: reason }), 'Answer changed.');
        } });
        row.append(' ', sel, ' ', b);
      }
      wrap.append(row);
    }
  }
  if (r.claimed_by_me) wrap.append(h('div', { class: 'pt-actions' }, h('button', { type: 'button', class: 'quiet', text: 'I checked this answer', onclick: () => {
    const reason = window.prompt('Anything to note? (5 to 300 characters)', 'I read it and it stands as it is'); if (reason === null) return;
    act(call('thread_prelim_correct', { p_id: r.id, p_kind: null, p_ref: null, p_section: 'keep', p_reason: reason }), 'Marked as checked.');
  } })));
  return wrap;
}

// Web leads found by our own computer. Unchecked until a reviewer who picked the item says verified or rejected (reason required, logged).
function leadsBox(r) {
  const holder = h('div', { class: 'pt-excerpt' });
  const paint = async () => {
    let d; try { d = await call('thread_leads_for_review', { p_intake: r.id }); } catch (e) { holder.replaceChildren(); return; }
    const list = (d && d.leads) || [];
    if (!list.length) { holder.replaceChildren(h('p', { class: 'muted small', text: d && (d.status === 'pending' || d.status === 'running') ? 'Web leads: still being looked for.' : 'Web leads: none found.' })); return; }
    holder.replaceChildren(h('strong', { text: 'Web leads (AI-found, not checked until you decide):' }), ...list.map((l) => {
      const row = h('div', { class: 'small' }, safeLink(l.url), h('span', { class: 'muted', text: ` ${l.state}${l.archived ? ', copy kept' : ''}` }), h('div', { class: 'pt-excerpt', text: l.excerpt }));
      if (r.claimed_by_me && l.state === 'unchecked') {
        for (const [v, label] of [['verified', 'Verified'], ['rejected', 'Reject']]) {
          row.append(h('button', { type: 'button', class: 'quiet', text: label, onclick: async () => {
            const reason = window.prompt(`Why ${v === 'verified' ? 'verified' : 'rejected'}? (5 to 300 characters. This is logged with your name.)`); if (reason === null) return;
            try { await call('thread_lead_review', { p_lead: l.id, p_verdict: v, p_reason: reason }); note.textContent = v === 'verified' ? 'Lead verified.' : 'Lead rejected.'; await paint(); } catch (e) { note.textContent = e.message || 'That did not work.'; }
          } }), ' ');
        }
      }
      return row;
    }));
  };
  paint();
  return holder;
}

// The picture is hidden by default. Opening it needs the item picked by you, the sender allowing it, and a written reason; it is logged.
async function openImage(r, holder, btn) {
  const reason = window.prompt('Why is the picture absolutely needed for this review? (8 to 300 characters)\nThis is logged with your name.');
  if (reason === null) return;
  btn.disabled = true;
  const asked = await sb.rpc('thread_image_request', { p_intake: r.id, p_reason: reason });
  btn.disabled = false;
  if (asked.error || !asked.data) return holder.replaceChildren(h('p', { class: 'pt-err', role: 'alert', text: (asked.error && asked.error.message) || 'Could not open the picture.' }));
  const { data, error } = await sb.storage.from('thread-screenshots').createSignedUrl(asked.data, 300);
  if (error || !data) return holder.replaceChildren(h('p', { class: 'muted', text: 'Could not load the screenshot.' }));
  holder.replaceChildren(h('img', { class: 'pt-shot', src: data.signedUrl, alt: 'Screenshot sent by a reader' }));
}

function item(r, mineId) {
  const li = h('li', { class: 'pt-item', 'data-top': r.rank === 1 && r.status === 'queued' ? '1' : null });
  const reason = h('input', { placeholder: 'Reason (needed to move or close)', maxlength: '1000' });
  const pub = h('input', { placeholder: 'Note for the sender (optional, shown to them)', maxlength: '500' });
  const dup = h('input', { placeholder: 'Repeats item #', inputmode: 'numeric', style: 'max-width:140px' });
  const disp = h('select', {}, [['accepted', 'Accept: we will research it'], ['needs_evidence', 'Needs more evidence'], ['answered', 'Answered with what we have'],
    ['duplicate', 'Repeat of another item'], ['declined', 'Decline']].map(([v, l]) => h('option', { value: v, text: l })));
  const proj = h('select', { 'aria-label': 'Research project (for accepted items)' }, [h('option', { value: '', text: 'Research project (optional)' }),
    ...projects.map((p) => h('option', { value: String(p.id), text: p.title }))]);
  const shotBox = h('div');
  li.append(...[   // empty parts are null; append(null) would print the word null, so they are dropped
    h('div', { class: 'row' },
      h('strong', {}, `#${r.rank} · item ${r.id} · `, r.kind === 'url' ? 'link' : r.kind === 'screenshot' ? 'screenshot' : 'question'),
      h('span', { class: 'pt-score' }, h('span', { class: 'tag ok', text: `score ${r.score}` }), ' ', h('span', { class: `tag ${r.status === 'in_review' ? 'warn' : ''}`, text: r.status.replace('_', ' ') }))),
    h('p', { class: 'muted small', text: `Sent ${when(r.created_at)}${r.times_sent > 1 ? ` · ${r.times_sent} sends` : ''}${r.claimed_by_name ? ` · picked by ${r.claimed_by_name}` : ''}` }),
    r.url ? h('p', {}, safeLink(r.url)) : null,
    r.question ? h('p', { text: r.question }) : null,
    r.note ? h('p', { class: 'small', text: `Sender's note: ${r.note}` }) : null,
    r.page_title ? h('p', { class: 'small' }, h('strong', { text: 'Page starts: ' }), r.page_title) : null,
    r.excerpt ? h('div', { class: 'pt-excerpt', text: r.excerpt }) : null,
    r.ocr_text ? h('div', { class: 'pt-excerpt' }, h('strong', { text: r.ocr_fixed ? 'Text from the screenshot (corrected by the sender):' : 'Text read from the screenshot (by machine, may be wrong):' }), h('div', { text: r.ocr_text })) : null,
    r.kind === 'screenshot' && r.ocr_status === 'failed' ? h('p', { class: 'muted small', text: 'The text reader could not read this picture. Please read it yourself.' }) : null,
    r.fetch_note ? h('p', { class: 'muted small', text: r.fetch_note }) : null,
    r.image_state === 'available' ? (r.claimed_by_me
      ? h('div', {}, (() => { const b = h('button', { type: 'button', class: 'quiet', text: 'View image (needed for review)' }); b.addEventListener('click', () => openImage(r, shotBox, b)); return b; })(), shotBox)
      : h('p', { class: 'muted small', text: 'A picture was kept for review. Pick this item to open it if the text is not enough.' }))
      : r.image_state === 'text_only' ? h('p', { class: 'muted small', text: 'The sender chose to send only the text. There is no picture.' })
      : r.image_state === 'deleted' ? h('p', { class: 'muted small', text: 'The picture has been deleted. Use the text.' }) : null,
    prelimBox(r),
    leadsBox(r),
    r.matches && r.matches.length ? h('div', {}, h('strong', { class: 'small', text: 'We may already have:' }), r.matches.map((m) => h('div', { class: 'pt-match small', text: `${m.title} (${m.kind}, ${m.strength === 'source' ? 'cites this link' : m.why})` }))) : null,
    h('details', {}, h('summary', { text: 'Why this score' }), parts(r.parts))].filter(Boolean));
  const acts = h('div', { class: 'pt-actions' });
  if (r.status === 'queued' || r.status === 'matched') acts.append(h('button', { type: 'button', class: 'primary', onclick: () => act(call('pick_thread', { p_id: r.id }), 'Picked. It is yours until you close or put it back.'), text: 'Pick this one' }));
  if (r.status === 'in_review' && r.claimed_by_me) acts.append(h('button', { type: 'button', onclick: () => act(call('release_thread', { p_id: r.id }), 'Put back in the queue.'), text: 'Put back' }));
  if (['queued', 'in_review', 'matched'].includes(r.status)) {
    acts.append(reason,
      h('button', { type: 'button', class: 'quiet', onclick: () => act(call('adjust_thread_priority', { p_id: r.id, p_delta: 20, p_reason: reason.value }), 'Moved up.'), text: 'Move up' }),
      h('button', { type: 'button', class: 'quiet', onclick: () => act(call('adjust_thread_priority', { p_id: r.id, p_delta: -20, p_reason: reason.value }), 'Moved down.'), text: 'Move down' }));
    if (r.status === 'in_review') acts.append(disp, proj, dup, pub,
      h('button', { type: 'button', onclick: () => act(call('resolve_thread', { p_id: r.id, p_disposition: disp.value, p_reason: reason.value, p_public_note: pub.value || null,
        p_dup_of: dup.value ? Number(dup.value) : null, p_project: disp.value === 'accepted' && proj.value ? Number(proj.value) : null }),
        disp.value === 'accepted' ? 'Accepted. It is now on the Researching tab.' : 'Closed.'), text: 'Close it' }));
  }
  { const cb = changeBox(r); if (cb) acts.append(cb); }
  const hist = h('div');
  acts.append(h('button', { type: 'button', class: 'quiet', onclick: async () => {
    try {
      const ev = await call('thread_intake_history', { p_id: r.id });
      hist.replaceChildren(h('ul', { class: 'list small' }, ev.length ? ev.map((e) => h('li', { text: `${when(e.created_at)} · ${e.actor_name || 'a reader'} · ${e.event_type}${e.delta ? ` ${e.delta > 0 ? '+' : ''}${e.delta}` : ''}${e.disposition ? ` ${e.disposition}` : ''}${e.was_top === false ? ' (not the top item)' : ''}${e.reason ? `: ${e.reason}` : ''}` })) : [h('li', { text: 'Nothing yet.' })]));
    } catch (e) { hist.textContent = e.message; }
  }, text: 'History' }));
  li.append(acts, hist);
  return li;
}

async function load() {
  const { data: { session } } = await window.WaySession.getSession(sb);
  if (!session) { app.replaceChildren(h('h1', { text: 'Thread queue' }), h('p', {}, 'Please ', h('a', { href: '/members/', text: 'sign in' }), ' first.')); return; }
  let rows;
  try { canChange = !!(await call('can_change_thread_decision', {})); } catch { canChange = false; }
  if (!projects.length) { const { data } = await sb.from('research_projects').select('id,title').eq('active', true).order('title'); projects = data || []; }
  try { rows = include === 'researching' ? await call('list_accepted_threads', { p_include: 'researching' }) : await call('list_thread_queue', { p_include: include, p_limit: 100 }); }
  catch (e) { app.replaceChildren(h('h1', { text: 'Thread queue' }), h('p', { class: 'muted', text: /Not allowed/.test(e.message) ? 'This page is for reviewers.' : (e.message || 'Could not load.') })); return; }
  const tabs = h('div', { class: 'pt-kinds' }, [['open', 'Waiting'], ['matched', 'Already answered'], ['researching', 'Researching'], ['all', 'Everything']].map(([k, l]) =>
    h('button', { type: 'button', 'aria-pressed': String(k === include), onclick: () => { include = k; load(); }, text: l })));
  app.replaceChildren(
    h('p', { class: 'overline', text: 'Reviewers' }),
    h('h1', { class: 'pt-queue-title' }, [h('img', { src: '/members/art/thread-pull-480.webp?v=3', width: '480', height: '153', alt: '' }), h('span', { class: 'pt-vh', text: 'Pull a Thread queue' })]),
    h('p', { class: 'lede', text: 'Ranked by our score, highest first. The top item is a suggestion: pick any item you want, and say why when you move or close one.' }),
    tabs, note,
    rows.length ? h('ul', { class: 'list panel' }, rows.map((r) => (include === 'researching' ? researchItem(r) : item(r)))) : h('p', { class: 'muted', text: 'Nothing here right now.' }),
    await memberChecks());
}
// Admin only: switch a closed item to another decision or put it back in the queue. The old decision stays in History.
function changeBox(r) {
  if (!canChange || !['accepted', 'needs_evidence', 'answered', 'declined'].includes(r.status)) return null;
  const to = h('select', { 'aria-label': 'New decision' }, [['declined', 'Decline'], ['needs_evidence', 'Needs more evidence'], ['answered', 'Answered with what we have'],
    ['accepted', 'Accept: we will research it'], ['queued', 'Put back in the waiting queue']].filter(([v]) => v !== r.status).map(([v, l]) => h('option', { value: v, text: l })));
  const why = h('input', { placeholder: 'Why (needed, goes in History)', maxlength: '900' });
  const pn = h('input', { placeholder: 'Note for the sender (optional)', maxlength: '500' });
  const tell = h('input', { type: 'checkbox', id: `tell-${r.id}` });
  return h('details', { class: 'pt-change' }, h('summary', { text: 'Change decision (admin)' }), h('div', { class: 'pt-actions' }, to, why, pn,
    h('label', { for: `tell-${r.id}`, class: 'small' }, tell, ' Tell the sender'),
    h('button', { type: 'button', text: 'Change it', onclick: () => act(call('change_thread_decision', { p_id: r.id, p_to: to.value, p_reason: why.value, p_public_note: pn.value || null, p_tell_sender: tell.checked }), 'Changed. The old decision is kept in History.') })));
}
// Accepted items: the six steps are Accepted, Sent to research, AI dive running, Dive done, With a researcher, Finished.
const STEP = { researching: 'Accepted', sent: 'Sent to research', diving: 'AI dive running', dive_done: 'Dive done', with_researcher: 'With a researcher', finished: 'Finished' };
function diveDraft(r) {
  const box = h('div', { class: 'small' });
  const d = h('details', { class: 'panel' }, h('summary', { text: 'AI draft (Unchecked)' }), box);
  d.addEventListener('toggle', async () => {
    if (!d.open || box.childNodes.length) return;
    try {
      const v = await call('get_thread_dive', { p_id: r.id });
      box.replaceChildren(v && v.draft ? h('div', {}, h('p', { class: 'pt-badge', text: `${v.label}: written by ${v.model || 'a local model'}, not checked by a person` }), h('pre', { text: v.draft })) : h('p', { class: 'muted', text: 'No draft yet.' }));
    } catch { box.replaceChildren(h('p', { class: 'muted', text: 'Could not load the draft.' })); }
  });
  return d;
}
function researchItem(r) {
  const li = h('li', { class: 'pt-item' });
  const st = r.research_state;
  const reason = h('input', { placeholder: 'Reason for changing the project', maxlength: '1000' });
  const why = h('input', { placeholder: 'Why send it to research (3 to 1000 characters)', maxlength: '1000' });
  const proj = h('select', { 'aria-label': 'Research project' }, [h('option', { value: '', text: 'No project yet' }),
    ...projects.map((p) => h('option', { value: String(p.id), text: p.title, selected: p.id === r.project_id ? '' : null }))]);
  const summary = h('input', { placeholder: 'What we found (shown to the sender, up to 500 characters)', maxlength: '500' });
  const link = h('input', { placeholder: 'Page on this site with the result, like /research/ (optional)', maxlength: '250' });
  li.append(h('div', { class: 'row' }, h('strong', { text: `#${r.id} ${r.kind}` }),
      h('span', { class: 'tag', text: st === 'finished' ? `finished ${when(r.research_done_at)}` : `${STEP[st] || 'Accepted'} · accepted ${when(r.resolved_at)}` })),
    r.url ? h('p', {}, safeLink(r.url)) : null, r.question ? h('p', { text: r.question }) : null, r.note ? h('p', { class: 'muted small', text: r.note }) : null,
    r.project_title ? h('p', { class: 'small', text: `Project: ${r.project_title}` }) : null,
    r.research_note ? h('p', { class: 'small', text: `Result: ${r.research_note}` }) : null);
  { const cb = changeBox(r); if (cb) li.append(cb); }
  if (r.dive_label) li.append(diveDraft(r));
  if (st === 'diving') li.append(h('p', { class: 'muted small', text: 'The AI dive is running on a local model. This page does not need to stay open.' }));
  if (st === 'researching' || (st === 'sent' && r.dive_status === 'failed')) li.append(h('div', { class: 'pt-actions' }, why,
    h('button', { type: 'button', class: 'primary', text: st === 'sent' ? 'Send to the AI dive again' : 'Send to research (AI dive first)', onclick: () => act(call('send_thread_to_research', { p_id: r.id, p_reason: why.value }), 'Sent. A local AI model will write a draft for a researcher.') })));
  if (st === 'sent') li.append(h('p', { class: 'muted small', text: r.dive_status === 'failed' ? 'The AI dive failed three times. Send it again, or take it yourself.' : 'Waiting for the AI dive.' }));
  if (st === 'sent' || st === 'dive_done') li.append(h('div', { class: 'pt-actions' },
    h('button', { type: 'button', class: 'quiet', text: st === 'dive_done' ? 'I will research this (use the draft)' : 'Skip the dive: I will research this', onclick: () => act(call('take_thread_research', { p_id: r.id }), 'It is with you now.') })));
  if (st === 'researching' || st === 'with_researcher') li.append(h('div', { class: 'pt-actions' }, proj, reason,
    h('button', { type: 'button', class: 'quiet', text: 'Save project', onclick: () => act(call('set_thread_project', { p_id: r.id, p_project: Number(proj.value), p_reason: reason.value }), 'Project saved.') }),
    summary, link,
    h('button', { type: 'button', class: 'primary', text: 'Research finished: tell the sender', onclick: () => act(call('finish_thread_research', { p_id: r.id, p_summary: summary.value, p_link: link.value || null }), 'Done. The sender gets a notice.') })));
  return li;
}
// Sources that members read for themselves and chose to send us: the link, their answer and their reason. No names.
async function memberChecks() {
  let list;
  try { list = await call('source_checks_for_review', { p_limit: 100 }); } catch { return null; }
  if (!Array.isArray(list)) return null;
  return h('details', { class: 'panel' }, h('summary', { text: `Sources members checked (${list.length})` }),
    h('p', { class: 'muted small', text: 'These are members\u2019 own checks, not ours yet. Use them to decide which sources to look at first.' }),
    list.length ? h('ul', { class: 'list small' }, list.map((c) => h('li', {},
      /^https:\/\//i.test(c.url) ? h('a', { href: c.url, target: '_blank', rel: 'noopener noreferrer nofollow', text: c.title || c.url }) : (c.title || c.url),
      h('span', { class: 'muted', text: ` ${c.verdict === 'confirmed' ? 'backs it up' : 'does not back it up'} · ${c.members_confirmed} said yes, ${c.members_not_confirmed} said no · ${when(c.created_at)}` }),
      h('p', { text: c.reason })))) : h('p', { class: 'muted', text: 'None yet.' }));
}
load();
})();
