// Email updates: join (with an item pre-picked), confirm, manage, leave. No account needed.
// Every request goes through the email_* functions in the database; the token in the link is the key.
(function () {
'use strict';
const app = document.getElementById('app');
const cfg = window.THE_WAY_CONFIG;
if (!cfg || /YOUR-PROJECT/.test(cfg.supabaseUrl)) { app.textContent = 'Setup needed.'; return; }
const sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, { auth: { persistSession: true, autoRefreshToken: false } });
const q = new URLSearchParams(location.search);
const TOPIC_RE = /^((measure|candidate|state|case|research|dataset|deadlines|review):[a-z0-9-]{1,80}|new:(research|cases|candidates))$/;

function el(tag, attrs, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) { if (k === 'class') n.className = v; else n.setAttribute(k, v); }
  for (const k of kids) n.append(k);
  return n;
}
function show(...nodes) { app.replaceChildren(...nodes); }
function say(title, text) { show(el('h1', {}, title), el('p', {}, text), el('p', {}, el('a', { href: '/' }, 'Back to The Way'))); }
function label(t) {
  const [k, v] = t.split(':');
  const nice = (s) => (s || '').replace(/-/g, ' ');
  return ({ measure: 'Ballot measure: ', candidate: 'Candidate (neutral news): ', state: 'State: ', case: 'Case: ', research: 'Research: ', dataset: 'Dataset: ', deadlines: 'Election deadlines: ', review: 'Review work: ' }[k] || '') + (k === 'new' ? 'New ' + v : v === 'all' ? 'everything' : nice(v));
}
const isReviewer = () => { try { return ((JSON.parse(localStorage.getItem('theway.bar') || 'null') || {}).roles || []).some(r => r === 'reviewer' || r === 'admin' || r === 'super_admin'); } catch { return false; } };

async function confirm(tok) {
  const { data, error } = await sb.rpc('email_confirm', { p_token: tok });
  if (error || !data) return say('That link did not work', 'It may have been used already or expired. You can ask for a new one from the box on the home page.');
  say('You are on the list', 'Thank you. You will get a short email only when there is news on what you follow, and every email has a one-click way to stop.');
}

async function join(topic, title) {
  const email = el('input', { type: 'email', required: '', maxlength: '254', autocomplete: 'email', placeholder: 'your@email', id: 'em' });
  const freq = el('select', { id: 'fq' }, el('option', { value: 'weekly' }, 'One email a week (default)'), el('option', { value: 'daily' }, 'One email a day, only if there is news'), el('option', { value: 'instant' }, 'As it happens'));
  const out = el('p', { role: 'status', 'aria-live': 'polite' });
  const form = el('form', {}, el('label', { for: 'em' }, 'Email'), email, el('label', { for: 'fq' }, 'How often'), freq, el('button', { type: 'submit' }, 'Email me updates'), out);
  form.addEventListener('submit', async (e) => {
    e.preventDefault(); out.textContent = '';
    const { error } = await sb.rpc('email_subscribe', { p_email: email.value.trim(), p_source: 'follow', p_topics: [topic, 'new:research', 'new:cases'].filter((t, i, a) => TOPIC_RE.test(t) && a.indexOf(t) === i), p_frequency: freq.value });
    if (error) { out.textContent = /valid email/.test(error.message) ? 'Please enter a valid email address.' : 'Something went wrong. Please try again later.'; return; }
    form.replaceChildren(el('p', {}, 'You are signed up. Emails start soon; we will send one confirmation email first, and nothing else until you click it.'));
  });
  const { data: sess } = await sb.auth.getSession();
  const signed = sess && sess.session;
  const nodes = [el('h1', {}, 'Email me updates'), el('p', {}, topic ? 'About: ' + (title || label(topic)) : 'Choose what you want, then confirm your email.'),
    el('p', {}, 'Coming soon: emails start shortly. You can sign up now; we will send one confirmation email when they begin, and nothing else until you click it.'), el('p', { class: 'muted' }, 'Free. Separate from membership. We send only when there is news on what you follow, and every email has a one-click unsubscribe.')];
  if (signed && topic) {
    const b = el('button', { type: 'button' }, 'Use my member email: follow this');
    b.addEventListener('click', async () => {
      const { error } = await sb.rpc('email_follow_me', { p_topic: topic, p_on: true });
      b.replaceWith(el('p', {}, error ? 'Could not save that. Try again later.' : 'Saved. Emails start soon; you will get updates by email once they begin.'));
    });
    nodes.push(b, el('p', { class: 'muted' }, 'or use a different address:'));
  }
  nodes.push(form, el('p', {}, el('a', { href: '/' }, 'Back to The Way')));
  show(...nodes);
}

async function manage(tok, leave) {
  const { data: p } = await sb.rpc('email_prefs', { p_unsub_token: tok });
  if (!p) return say('That link did not work', 'Use the link from your most recent email.');
  if (p.status !== 'confirmed') return say('You are not on the list', 'No emails will be sent to ' + p.email + '.');
  const out = el('p', { role: 'status', 'aria-live': 'polite' });
  const leaveAll = el('button', { type: 'button', class: 'danger' }, 'Unsubscribe from everything');
  leaveAll.addEventListener('click', async () => {
    const { data } = await sb.rpc('email_unsubscribe', { p_unsub_token: tok, p_topic: null });
    say(data ? 'You are unsubscribed' : 'Something went wrong', data ? 'No more emails will be sent to ' + p.email + '. You can rejoin from the home page any time.' : 'Please try again.');
  });
  if (leave) return show(el('h1', {}, 'Unsubscribe'), el('p', {}, p.email), leaveAll, el('p', {}, el('a', { href: '/members/email.html?t=' + tok }, 'Or choose what to keep instead')));
  const all = [...new Set([...p.topics, 'new:research', 'new:cases', ...(isReviewer() ? ['review:all'] : [])])];
  const boxes = all.map(t => { const c = el('input', { type: 'checkbox', value: t }); c.checked = p.topics.includes(t); return el('label', { class: 'row' }, c, ' ' + label(t)); });
  const freq = el('select', { id: 'fq' }, ...[['weekly', 'One email a week'], ['daily', 'One email a day, only if there is news'], ['instant', 'As it happens']].map(([v, t]) => { const o = el('option', { value: v }, t); if (v === p.frequency) o.selected = true; return o; }));
  const save = el('button', { type: 'button' }, 'Save');
  save.addEventListener('click', async () => {
    const picked = boxes.map(l => l.firstChild).filter(c => c.checked).map(c => c.value);
    const { data } = await sb.rpc('email_set_prefs', { p_unsub_token: tok, p_frequency: freq.value, p_topics: picked });
    out.textContent = data ? 'Saved.' : 'Could not save. Try again later.';
  });
  show(el('h1', {}, 'Your email updates'), el('p', {}, p.email), el('h2', {}, 'What you follow'), ...boxes, el('label', { for: 'fq' }, 'How often'), freq, save, out, el('hr'), leaveAll);
}

const c = q.get('c'), t = q.get('t'), f = q.get('follow');
if (c && /^[0-9a-f]{48}$/.test(c)) confirm(c);
else if (t && /^[0-9a-f]{48}$/.test(t)) manage(t, q.get('leave') === '1');
else if (f && TOPIC_RE.test(f)) join(f, q.get('label') || '');
else join('', '');
})();
