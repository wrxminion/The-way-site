// The Way, member area. Plain JavaScript, no build step.
// Every piece of user text goes into the page with textContent, never innerHTML.
(() => {
'use strict';

const cfg = window.THE_WAY_CONFIG;
if (!cfg || /YOUR-PROJECT/.test(cfg.supabaseUrl)) {
  document.getElementById('app').textContent = 'Setup needed: put the Supabase project URL and anon key in config.js.';
  throw new Error('config.js not filled in');
}
const sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
  // Implicit flow: the emailed link carries the session itself, so it works even when
  // the email is opened in a different browser or device from where it was requested.
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'implicit' },
});

const app = document.getElementById('app');
const state = { user: null, me: null, roles: new Set() };

// ---------------------------------------------------------------- tiny DOM helpers

function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k === 'style') el.style.cssText = v;   // the page CSP blocks a style attribute, but allows setting it through the style object
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid == null || kid === false) continue;
    el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  return el;
}
// A missing value must never show up as the word "null" (or "undefined"): treat those as empty.
const clean = (v) => { if (v == null) return null; const t = String(v).trim(); return !t || /^(null|undefined|nan)$/i.test(t) ? null : t; };
const srcTitle = (s) => clean(s.title) || (() => { try { return new URL(s.url).hostname.replace(/^www\./, ''); } catch { return clean(s.url) || 'Untitled source'; } })();
const when = (iso) => iso ? new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '';
const day = (iso) => iso ? new Date(iso).toLocaleDateString(undefined, { dateStyle: 'medium' }) : '';
// What members see for a role. The stored value stays 'reviewer' / 'researcher'.
// Deshi is Japanese for student; both words are shown so people learn it (Frank, Oct 27 2026).
const ROLE_LABEL = { reviewer: 'Deshi (student, reviewer)', researcher: 'Author (Submitter)', editor: 'Renshi (editor)' };
const roleName = (r) => ROLE_LABEL[r] || r;
const can = (role) => state.roles.has(role) || state.roles.has('admin');

function render(...nodes) { app.replaceChildren(...nodes.flat().filter((n) => n != null && n !== false)); app.focus({ preventScroll: true }); window.scrollTo(0, 0); }
function notice(msg, kind = 'error') { return h('div', { class: `notice ${kind}`, role: kind === 'error' ? 'alert' : 'status', text: msg }); }
function friendly(err) {
  const m = (err && (err.message || err.error_description)) || String(err);
  if (/row-level security/i.test(m)) return 'You do not have permission to do that.';
  if (/JWT|expired/i.test(m)) return 'Your sign-in expired. Please sign in again.';
  if (/captcha/i.test(m)) return 'The human check did not pass. Reload the page and try again.';
  return m;
}
// Run an async action from a button or form, showing errors next to it.
function action(fn, slot) {
  return async (ev) => {
    if (ev && ev.preventDefault) ev.preventDefault();
    const btn = ev && ev.submitter || (ev && ev.currentTarget instanceof HTMLButtonElement ? ev.currentTarget : null);
    if (btn) btn.disabled = true;
    if (slot) slot.replaceChildren();
    try { await fn(ev); }
    catch (err) { (slot || app).prepend(notice(friendly(err))); }
    finally { if (btn) btn.disabled = false; }
  };
}
async function q(promise) { const { data, error } = await promise; if (error) throw error; return data; }
// Research projects, finding links and "AI help write my claim" live in claim-links.js (migration 0026).
const STATS = window.TheWayStats ? window.TheWayStats.make({ sb, h, q, when }) : null;
const LEDGER = window.TheWayLedger ? window.TheWayLedger.make({ sb, h, q }) : null;
const TODO = window.TheWayTodo ? window.TheWayTodo.make({ sb, h, q, render, notice }) : null;
const CSTAT = window.TheWayContentStatus ? window.TheWayContentStatus.make({ sb, h, q, render, notice, when }) : null;
const CL = window.TheWayClaim ? window.TheWayClaim.make({ sb, h, q, notice, action, render, can }) : null;

const askDialog = document.getElementById('ask');
function ask(label) {
  return new Promise((resolve) => {
    document.getElementById('ask-label').textContent = label;
    const input = document.getElementById('ask-input');
    input.value = '';
    askDialog.onclose = () => resolve(askDialog.returnValue === 'ok' ? input.value.trim() : null);
    askDialog.showModal();
  });
}

// ---------------------------------------------------------------- session

async function loadMe() {
  const { data: { session } } = await sb.auth.getSession();
  state.user = session ? session.user : null;
  state.me = null; state.roles = new Set(); state.hasRecord = false; state.hasModLog = false; state.place = null;
  if (!state.user) return;
  const rows = await q(sb.from('members').select('*').eq('id', state.user.id));
  state.me = rows[0] || null;
  if (state.me && state.me.status === 'active') {
    const roles = await q(sb.from('member_roles').select('role').eq('member_id', state.user.id));
    state.roles = new Set(roles.map((r) => r.role));
    [state.hasRecord, state.hasModLog, state.place] = await Promise.all([hasPublishedRecord(), hasAny('moderation_actions'), readPlace()]);
  }
}
async function hasAny(table) {
  try {
    const { count, error } = await sb.from(table).select('id', { count: 'exact', head: true });
    return !error && count > 0;
  } catch { return false; }
}
// Findings stay hidden until something has been published (Frank, Oct 15 2026). A publication
// event exists only once a reviewer publishes; read as the signed-in member; if the check fails, hidden.
const hasPublishedRecord = () => hasAny('research_publication_events');

// The top bar is the shared one (waybar.js, the same on every page of the site). The member area
// tells it who is signed in; the guide, map and case pages read the same note from this browser.
function drawNav() {
  const member = !!(state.me && state.me.status === 'active');
  if (!window.WayBar) return;
  if (!member) { WayBar.save(null); WayBar.render(null, { pending: !!state.user }); return; }
  const st = focusAbbr();
  // Findings and the moderation log appear only once they have something in them (Frank, Oct 15).
  const data = { v: 1, name: state.me.display_name, roles: [...state.roles], findings: !!state.hasRecord, modlog: !!state.hasModLog,
    ballot: st && READY.has(st) ? stateLinks(st).guide.slice(-1)[0] : null, state: st && READY.has(st) ? US[st][0] : '' };
  WayBar.save(data); WayBar.render(data);
}

// ---------------------------------------------------------------- sign in and accepting an invitation

const PASSWORD_MIN = cfg.passwordMin || 10;
// Every emailed link (sign-in, password reset, invitation) comes back to this folder, the member
// area itself (/members/), never to whatever page or file name was open when it was requested.
const APP_URL = new URL('./', location.href).href;
// An invite link (#/join/WAY-...) leaves its code here, so it survives the email round-trip
// (the sign-in email opens a fresh page). Cleared once the code is used.
const INVITE_KEY = 'theway.invite';
function takeInviteFromLink() {
  const fromQuery = new URLSearchParams(location.search).get('invite');
  const m = fromQuery ? [null, fromQuery] : location.hash.match(/^#\/join\/([A-Za-z0-9-]{8,80})/);
  if (!m || !/^[A-Za-z0-9-]{8,80}$/.test(m[1])) return;
  try { localStorage.setItem(INVITE_KEY, m[1]); } catch { /* private mode: they paste it instead */ }
  // Drop ?invite= but keep any sign-in tokens Supabase put in the #hash for readSignInLink.
  const q2 = new URLSearchParams(location.search); q2.delete('invite');
  history.replaceState(null, '', location.pathname + (q2.toString() ? '?' + q2 : '') + (fromQuery ? location.hash : '#/'));
}
function savedInvite() { try { return localStorage.getItem(INVITE_KEY) || ''; } catch { return ''; } }
function forgetInvite() { try { localStorage.removeItem(INVITE_KEY); } catch { /* ignore */ } }
let recovering = false; // true after a "Forgot password" link until the new password is saved

// ---------------------------------------------------------------- human check (Cloudflare Turnstile)
// Every step that makes Supabase send an email (or try a password) carries a one-time token
// from the widget. With no turnstileSiteKey in config.js the widget is off and nothing changes.
const TS_KEY = cfg.turnstileSiteKey || '';
const TS_BLOCKED = 'The human check could not load. If an ad or script blocker is on, allow challenges.cloudflare.com for this page, or try another browser.';
const TS_FAILED = 'The human check did not pass. Reload the page and try again.';
const TS_SLOW = 'The human check is taking too long. If a box shows just above the buttons, tick it, then try again. On a slow connection, wait a moment and press the button again.';
let tsLoading = null;
function loadTurnstile() {
  if (!tsLoading) {
    tsLoading = new Promise((resolve, reject) => {
      if (window.turnstile) return resolve(window.turnstile);
      const s = document.createElement('script');
      s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      s.async = true;
      s.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error(TS_BLOCKED)));
      s.onerror = () => { tsLoading = null; reject(new Error(TS_BLOCKED)); };
      document.head.append(s);
    });
  }
  return tsLoading;
}
function humanCheck() {
  if (!TS_KEY) return { el: null, token: async () => undefined };
  const el = h('div', { class: 'human-check' });
  const status = h('p', { class: 'small dim', role: 'status' });
  const wrap = h('div', {}, el, status);
  let id = null, ready = null, problem = null, waiting = [];
  const settle = (fn) => waiting.splice(0).forEach(fn);
  // Draw the widget only once its box is really on the page (the view is drawn after this runs), and drop it if the view is drawn
  // again, which would otherwise delete the box in the middle of the challenge ("Cannot find Widget").
  const onPage = () => new Promise((res, rej) => {
    let n = 0;
    (function look() { if (wrap.isConnected) return res(); if (++n > 100) return rej(new Error(TS_FAILED)); setTimeout(look, 100); })();
  });
  Promise.all([loadTurnstile(), onPage()]).then(([ts]) => {
    id = ts.render(el, {
      sitekey: TS_KEY,
      callback: (t) => { ready = t; problem = null; status.textContent = ''; settle((w) => w.ok(t)); },
      'expired-callback': () => { ready = null; },
      'error-callback': () => { problem = TS_FAILED; status.textContent = TS_FAILED; settle((w) => w.no(new Error(TS_FAILED))); return true; },
    });
    const watch = setInterval(() => {
      if (wrap.isConnected) return;
      clearInterval(watch);
      try { ts.remove(id); } catch { /* already gone */ }
      id = null; ready = null;
      settle((w) => w.no(new Error('The page was redrawn during the human check. Press the button again.')));
    }, 500);
  }).catch((err) => { problem = err.message; status.textContent = err.message; settle((w) => w.no(err)); });
  return {
    el: wrap,
    // one token per call; the widget then makes a fresh one for the next
    token: () => new Promise((ok, no) => {
      if (problem) return no(new Error(problem));
      const take = (t) => { ready = null; try { if (id !== null) window.turnstile.reset(id); } catch { /* ignore */ } ok(t); };
      if (ready) return take(ready);
      status.textContent = 'Checking you are a person…';
      let timer = null;
      const w = { ok: (t) => { clearTimeout(timer); take(t); }, no: (e) => { clearTimeout(timer); no(e); } };
      timer = setTimeout(() => { waiting = waiting.filter((x) => x !== w); status.textContent = ''; no(new Error(TS_SLOW)); }, 60000);
      waiting.push(w);
    }),
  };
}

// Age question (migration 0041). A neutral question with no answer chosen in advance. 18 or older may go on; anyone younger stops
// with a friendly note. Only "adult confirmed" is ever stored (members.adult_confirmed_at). An under-18 answer is remembered in this
// browser only, so pressing Back does not offer the question again; nothing is sent to us.
const AGE_KEY = 'theway.agegate';
const ageStopped = () => { try { return localStorage.getItem(AGE_KEY) === 'under18'; } catch { return false; } };
const markAgeStopped = () => { try { localStorage.setItem(AGE_KEY, 'under18'); } catch { /* private mode */ } };
function ageQuestion() {
  const id = 'age-' + Math.random().toString(36).slice(2, 8);
  const opt = (value, label) => h('label', { class: 'age-opt' }, h('input', { type: 'radio', name: id, value }), ' ' + label);
  const el = h('fieldset', { class: 'age-q' },
    h('legend', { text: 'Are you 18 or older?' }),
    opt('yes', 'Yes'), opt('no', 'No'),
    h('p', { class: 'small dim', text: 'We ask so we can keep younger visitors safe. We do not keep your age or birth date.' }));
  const note = notice('Thank you for being honest. Member accounts are for people 18 and older right now. A login for kids and teens is on the plan. You can still read the public guides, cases and maps without an account.', 'ok');
  note.hidden = true;
  return {
    el, note,
    value: () => { const r = el.querySelector('input:checked'); return r ? r.value : ''; },
    // true when the person may go on; shows the note and stops otherwise
    check(form) {
      const v = this.value();
      if (!v) throw new Error('Please answer: are you 18 or older?');
      if (v === 'yes') return true;
      markAgeStopped();
      if (form) form.hidden = true;
      note.hidden = false;
      return false;
    },
  };
}

// "Are you a teacher?" (migration 0042). Yes or No, neither chosen in advance. Self-reported; kept private by default.
function teacherQuestion() {
  const id = 'teacher-' + Math.random().toString(36).slice(2, 8);
  const opt = (value, label) => h('label', { class: 'age-opt' }, h('input', { type: 'radio', name: id, value }), ' ' + label);
  const el = h('fieldset', { class: 'age-q' },
    h('legend', { text: 'Are you a teacher?' }),
    opt('yes', 'Yes'), opt('no', 'No'),
    h('p', { class: 'small dim', text: 'Teachers get a private Teacher tag and, soon, classroom resources. Nobody else sees it unless you choose to show it later, on your account page.' }));
  return { el, value: () => { const r = el.querySelector('input:checked'); return r ? r.value : ''; } };
}

// "Do you make art?" and "a relevant field or skill we didn't think of?" (migration 0046). Private; self-reported.
function artQuestion() {
  const id = 'art-' + Math.random().toString(36).slice(2, 8);
  const opt = (value, label) => h('label', { class: 'age-opt' }, h('input', { type: 'radio', name: id, value }), ' ' + label);
  const other = h('input', { type: 'text', name: 'other-field', maxlength: 300, autocomplete: 'off', placeholder: 'Optional' });
  const fs = h('fieldset', { class: 'age-q' },
    h('legend', { text: 'Do you make art?' }),
    opt('yes', 'Yes'), opt('no', 'No'),
    h('p', { class: 'small dim', text: 'We would like to replace our AI-made graphics with real art. Artists can donate work and we credit them by name. Only the team sees your answer.' }));
  const el = h('div', {}, fs, h('label', {}, 'A relevant field or skill we did not think of? (optional)', other,
    h('span', { class: 'small dim', text: 'Please do not put private details here.' })));
  return { el, art: () => { const r = fs.querySelector('input:checked'); return r ? r.value : ''; }, other: () => other.value.trim() };
}

// The answers given on the create-account steps, kept in this browser until the join screen, so nobody is asked twice.
const ADULT_KEY = 'theway.age18', TEACH_KEY = 'theway.teacher', ART_KEY = 'theway.art', FIELD_KEY = 'theway.field';
const keptAdult = () => { try { return localStorage.getItem(ADULT_KEY) === 'yes'; } catch { return false; } };
const keptTeacher = () => { try { return localStorage.getItem(TEACH_KEY) || ''; } catch { return ''; } };
const keptArt = () => { try { return { art: localStorage.getItem(ART_KEY) || '', other: localStorage.getItem(FIELD_KEY) || '' }; } catch { return { art: '', other: '' }; } };
const keepAnswers = (teacher, art, other) => { try { localStorage.setItem(ADULT_KEY, 'yes'); if (teacher) localStorage.setItem(TEACH_KEY, teacher); else localStorage.removeItem(TEACH_KEY); if (art) localStorage.setItem(ART_KEY, art); else localStorage.removeItem(ART_KEY); if (other) localStorage.setItem(FIELD_KEY, other); else localStorage.removeItem(FIELD_KEY); } catch { /* private mode: asked again on the join screen */ } };
const forgetAnswers = () => { try { localStorage.removeItem(ADULT_KEY); localStorage.removeItem(TEACH_KEY); localStorage.removeItem(ART_KEY); localStorage.removeItem(FIELD_KEY); } catch { /* ignore */ } };

async function signInView() {
  // Open sign-up (migration 0018): anyone can make an account with their email, no invitation code.
  let open = false;
  try { const { data } = await sb.rpc('signup_is_open'); open = data === true; } catch { /* closed: invitation only */ }

  // Sign-in wording; change it here or override any line with cfg.signInText in config.js.
  const T = Object.assign({
    title: 'Sign in',
    invitedTitle: "You're invited to The Way",
    member: 'Members sign in here with their email and password, or ask for a sign-in link by email.',
    memberBtn: 'Sign in',
    linkInstead: 'Email me a sign-in link',
    forgot: 'Forgot password?',
    resetSent: "If that email belongs to a member, we've sent a link to choose a new password. Open it in this same browser.",
    badPassword: "That email and password don't match. No password yet? Choose \"Email me a sign-in link\", then set one on your account page.",
    memberSent: 'Check your email and click the link. Open it in this same browser and you go straight in.',
    noMember: "We couldn't find a member with that email. Have an invitation code? Use the box below.",
    newTitle: 'Have an invitation code?',
    code: "The member area is invite only. If a member gave you an invitation code, enter your email and we'll send you a sign-in link. Your code goes in on the next screen.",
    own: "No invitation? Enter your email and we'll let you know when The Way opens to the public.",
    codeBtn: 'I have an invitation code',
    ownBtn: "Tell me when it's public",
    sent: 'Check your email and click the link. Open it in this same browser. Your invitation code goes in on the next screen.',
    invited: "Enter your email and we'll send you a sign-in link. Your invitation code is saved in this browser and fills in on the next screen.",
    invitedBtn: 'Send my sign-in link',
    memberTitle: 'Already a member?',
    thanks: "Thanks, we'll let you know.",
    openTitle: 'New here? Create your account',
    openText: "Enter your email and we'll send you a 6-digit code. Type it on the next screen, pick a display name, and you're in. Your email stays private.",
    openBtn: 'Create my account',
  }, cfg.signInText || {});

  // After any emailed link: with emailCodes on, the 6-digit code from the email can be typed here.
  function codeEntry(emailIn, msg) {
    const codeIn = h('input', { name: 'code', inputmode: 'numeric', autocomplete: 'one-time-code', pattern: '[0-9]{6,8}', placeholder: '6-digit code' });
    const form = h('form', { hidden: true, onsubmit: action(async () => {
      await q(sb.auth.verifyOtp({ email: emailIn.value.trim(), token: codeIn.value.trim(), type: 'email' }));
      await boot();
    }, msg) }, h('label', {}, '6-digit code from the email (not your invitation code)', codeIn), h('div', { class: 'btns' }, h('button', { class: 'primary' }, 'Sign in')));
    return { form, show: () => { form.hidden = false; codeIn.focus(); } };
  }

  // Members get a link only if their account already exists; nobody new is created that way.
  async function sendLink(emailIn, asMember, msg, code, human) {
    const email = emailIn.value.trim();
    if (!emailIn.reportValidity()) return;
    const captchaToken = await human.token();
    const { error } = await sb.auth.signInWithOtp({ email, options: { shouldCreateUser: !asMember, emailRedirectTo: APP_URL, captchaToken } });
    if (error) {
      if (asMember && /signup|not allowed|not found/i.test(error.message || '')) throw new Error(T.noMember);
      throw error;
    }
    if (cfg.emailCodes) {
      msg.append(notice('Check your email. Click the link, or type the 6-digit sign-in code from it here.', 'ok'));
      code.show();
    } else {
      msg.append(notice(asMember ? T.memberSent : T.sent, 'ok'));
    }
  }

  // Members: email + password, or an emailed link. The human check sits under these buttons
  // and covers every form on the page.
  function memberPanel(main) {
    const msg = h('div');
    const human = humanCheck(); // its own widget, right above the buttons, so it is always in view when you press Sign in
    const emailIn = h('input', { type: 'email', name: 'email', required: true, autocomplete: 'username', placeholder: 'you@example.org' });
    const passIn = h('input', { type: 'password', name: 'password', autocomplete: 'current-password', placeholder: 'Password' });
    const code = codeEntry(emailIn, msg);
    const form = h('form', { class: 'signin', onsubmit: action(async (ev) => {
      if (ev.submitter && ev.submitter.value === 'link') return sendLink(emailIn, true, msg, code, human);
      if (!passIn.value) { passIn.focus(); throw new Error('Type your password, or choose "' + T.linkInstead + '".'); }
      const { error } = await sb.auth.signInWithPassword({ email: emailIn.value.trim(), password: passIn.value, options: { captchaToken: await human.token() } });
      if (error) throw new Error(/invalid login/i.test(error.message || '') ? T.badPassword : error.message);
      await boot();
    }, msg) },
      h('label', {}, 'Email', emailIn),
      h('label', {}, 'Password', passIn),
      human.el,
      h('div', { class: 'btns' },
        h('button', { class: main ? 'primary' : '', value: 'member' }, T.memberBtn),
        h('button', { value: 'link' }, T.linkInstead)));
    const forgot = h('p', { class: 'small switch' }, h('a', { href: '#/', onclick: action(async () => {
      if (!emailIn.reportValidity()) return;
      await q(sb.auth.resetPasswordForEmail(emailIn.value.trim(), { redirectTo: APP_URL, captchaToken: await human.token() }));
      msg.append(notice(T.resetSent, 'ok'));
    }, msg), text: T.forgot }));
    return h('div', { class: main ? 'panel signin-panel' : 'panel' },
      main ? null : h('h2', { text: T.memberTitle }),
      h('p', { class: 'muted', text: T.member }), msg, form, forgot, code.form);
  }

  // Invite only: people with an invitation code, plus a quiet "tell me when it's public" note.
  function newcomerPanel(invited) {
    const msg = h('div');
    const emailIn = h('input', { type: 'email', name: 'new-email', required: true, autocomplete: 'email', placeholder: 'you@example.org' });
    const code = codeEntry(emailIn, msg);
    const age = ageQuestion();
    const human = humanCheck();
    const stopped = ageStopped();
    age.note.hidden = !stopped;
    const form = h('form', { hidden: stopped, onsubmit: action(async (ev) => {
      if (!age.check(form)) return;
      if (ev.submitter && ev.submitter.value === 'own') {
        await q(sb.rpc('notify_signup', { email: emailIn.value.trim(), source: 'commons' }));
        form.hidden = true;
        msg.append(notice(T.thanks, 'ok'));
        return;
      }
      await sendLink(emailIn, false, msg, code, human);
    }, msg) },
      age.el,
      h('label', {}, 'Email', emailIn),
      human.el,
      h('div', { class: 'btns' },
        h('button', { class: invited || open ? 'primary' : '', value: 'code' }, invited ? T.invitedBtn : open ? T.openBtn : T.codeBtn)),
      invited || open ? null : h('div', { class: 'notify-public' },
        h('p', { class: 'small dim', text: T.own }),
        h('div', { class: 'btns' }, h('button', { class: 'quiet', value: 'own' }, T.ownBtn))));
    return h('div', { class: invited ? 'panel signin-panel' : 'panel' },
      invited ? null : h('h2', { text: open ? T.openTitle : T.newTitle }),
      h('p', { class: 'muted', text: invited ? T.invited : open ? T.openText : T.code }),
      msg, age.note, form, code.form);
  }

  // Create an account, open sign-up: a button first, then "Are you 18 or older?", then (on Yes) the teacher question and email.
  function createPanel(invited) {
    const msg = h('div');
    const emailIn = h('input', { type: 'email', name: 'new-email', required: true, autocomplete: 'email', placeholder: 'you@example.org' });
    const code = codeEntry(emailIn, msg);
    const age = ageQuestion();
    const teacher = teacherQuestion();
    const art = artQuestion();
    const stopped = ageStopped();
    // The human check is made when the form is revealed and sits right above the button, so it is in view.
    let human = null;
    const humanSlot = h('div');
    const form = h('form', { hidden: true, onsubmit: action(async () => {
      if (!age.check(form)) return;
      keepAnswers(teacher.value(), art.art(), art.other());
      await sendLink(emailIn, false, msg, code, human || { token: async () => undefined });
    }, msg) },
      teacher.el,
      art.el,
      h('label', {}, 'Email', emailIn),
      humanSlot,
      h('div', { class: 'btns' }, h('button', { class: 'primary', value: 'code' }, invited ? T.invitedBtn : T.openBtn)));
    const step1 = h('div', { hidden: !invited || stopped }, age.el);
    age.el.addEventListener('change', () => {
      if (age.value() === 'yes') {
        age.note.hidden = true; form.hidden = false;
        if (!human) { human = humanCheck(); if (human.el) humanSlot.append(human.el); }
        return;
      }
      age.check(form); // No: remembers it in this browser, hides the form, shows the note
      age.el.querySelectorAll('input').forEach((i) => { i.disabled = true; });
    });
    const start = h('button', { type: 'button', class: 'primary', 'data-create-start': '', onclick: () => { start.hidden = true; step1.hidden = false; } }, 'Create an account');
    start.hidden = invited || stopped;
    age.note.hidden = !stopped;
    return h('div', { class: invited ? 'panel signin-panel' : 'panel' },
      h('h2', { text: invited ? T.invitedTitle : 'New here?' }),
      h('p', { class: 'muted', text: invited ? T.invited : T.openText }),
      msg, h('div', { class: 'btns' }, start), step1, age.note, form, code.form);
  }

  // Sign-in comes first. Someone who arrived on an invitation link sees their invitation first
  // instead, with member sign-in under it.
  const invited = !!savedInvite();
  render(
    h('p', { class: 'overline', text: 'The Way · Members' }),
    h('h1', { text: invited ? T.invitedTitle : T.title }),
    ...(invited ? [createPanel(true), memberPanel(false)] : open ? [memberPanel(true), createPanel(false)] : [memberPanel(true), newcomerPanel(false)]),
  );
  app.dataset.view = 'signin';
  // The bar's "Sign up" link (#/signup) lands on the create-account box.
  if (location.hash === '#/signup') { const b = app.querySelector('[data-create-start]'); const f = app.querySelector('[name=new-email]'); const t = (b && !b.hidden) ? b : f; if (t) { t.scrollIntoView({ block: 'center' }); if (b && !b.hidden) b.click(); } }
}

// Choose a new password: from the account page, or after a "Forgot password" email.
function passwordView(fromReset, justJoined) {
  const msg = h('div');
  const p1 = h('input', { type: 'password', required: true, minlength: PASSWORD_MIN, autocomplete: 'new-password' });
  const p2 = h('input', { type: 'password', required: true, minlength: PASSWORD_MIN, autocomplete: 'new-password' });
  render(
    h('p', { class: 'overline', text: 'Members' }),
    h('h1', { text: justJoined ? `Welcome, ${state.me ? state.me.display_name : 'friend'}` : fromReset ? 'Choose a new password' : 'Set or change your password' }),
    justJoined ? h('p', { class: 'lede', text: 'You are in. One last step: choose a password so next time you sign in with your email and password, no email link needed.' }) : null,
    h('div', { class: 'panel' },
      h('p', { class: 'muted', text: `Signed in as ${state.user.email}. Use at least ${PASSWORD_MIN} characters. You can still sign in with an email link any time.` }),
      msg,
      h('form', { onsubmit: action(async () => {
        if (p1.value !== p2.value) throw new Error('The two passwords do not match.');
        await q(sb.auth.updateUser({ password: p1.value }));
        p1.value = p2.value = ''; recovering = false;
        msg.append(notice('Password saved. Next time, sign in with your email and this password.', 'ok'));
      }, msg) },
        h('label', {}, 'New password', p1),
        h('label', {}, 'Type it again', p2),
        h('div', { class: 'btns' }, h('button', { class: 'primary' }, 'Save password'),
          h('a', { class: 'button quiet', href: '#/', onclick: () => { recovering = false; if (justJoined) setTimeout(route); }, text: justJoined ? 'Skip for now' : 'Back to the Commons' })))),
  );
}

async function joinView() {
  const msg = h('div');
  let open = false;
  try { const { data } = await sb.rpc('signup_is_open'); open = data === true; } catch { /* closed */ }
  const code = h('input', { name: 'code', required: !open, autocomplete: 'off', spellcheck: 'false', placeholder: 'WAY-xxxxxxxx-xxxxxxxx-xxxxxxxx-xxxxxxxx' });
  const carried = savedInvite();
  if (carried) code.value = carried;
  const name = h('input', { name: 'name', required: true, minlength: 2, maxlength: 40, placeholder: 'How other members will see you' });
  const age = ageQuestion();
  const teacher = teacherQuestion();
  const art = artQuestion();
  const knownAdult = keptAdult(), knownTeacher = keptTeacher(), knownArt = keptArt();
  render(
    h('h1', { text: 'Welcome' }),
    h('p', { class: 'lede', text: carried ? 'You are signed in. Your invitation code is filled in from your link. Pick a display name to accept it.' : open ? 'You are signed in. Pick a display name to finish creating your account. Got an invitation code? You can leave it in the box, but you do not need one.' : 'You are signed in. Enter your invitation code (it starts with WAY-) to accept it.' }),
    h('div', { class: 'panel' }, msg,
      age.note,
      h('form', { id: 'join-form', onsubmit: action(async (ev) => {
        if (!knownAdult && !age.check(ev.target)) {
          // Under 18: no account is made. Sign out so the half-made sign-in does not linger.
          await sb.auth.signOut();
          return;
        }
        if (code.value.trim()) await q(sb.rpc('redeem_invitation', { code: code.value.trim(), display_name: name.value }));
        else await q(sb.rpc('join_open', { display_name: name.value }));
        try { await sb.rpc('confirm_adult'); } catch { /* migration 0041 not run yet: do not block joining */ }
        const said = knownTeacher || teacher.value();
        const artSaid = knownArt.art || art.art(), otherSaid = knownArt.other || art.other();
        forgetAnswers();
        if (artSaid || otherSaid) { try { await sb.rpc('set_skills', { p_art: artSaid === 'yes', p_other: otherSaid || null }); } catch { /* migration 0046 not run yet: do not block joining */ } }
        if (said) { try { await sb.rpc('set_teacher', { p_teacher: said === 'yes', p_public: false }); } catch { /* migration 0042 not run yet: do not block joining */ } }
        forgetInvite();
        await loadMe(); drawNav();
        passwordView(false, true);
      }, msg) },
        knownAdult ? null : age.el,
        knownTeacher ? null : teacher.el,
        knownArt.art || knownArt.other ? null : art.el,
        h('label', {}, open ? 'Invitation code (optional)' : 'Invitation code', code),
        h('label', {}, 'Display name', name),
        h('p', { class: 'small dim', text: 'Your email stays private. Members only see your display name. Choose it carefully: after this, only an admin can change it.' }),
        h('div', { class: 'btns' }, h('button', { class: 'primary' }, open ? 'Join The Way' : 'Accept invitation'), h('button', { type: 'button', onclick: signOut }, 'Sign out')))),
  );
}

async function signOut() { if (window.WayBar) WayBar.save(null); await sb.auth.signOut(); location.hash = '#/'; await boot(); }

// ---------------------------------------------------------------- Commons

// Where the public pages live, relative to the members page. Overridable in config.js.
// The state guides and maps stay in / while the member area lives in /members/.
const PAGES = cfg.pagesBase || '/';
const LINKS = Object.assign({
  guide: `${PAGES}guide/`, map: `${PAGES}map/`, news: `${PAGES}news/`, states: `${PAGES}states/`, cases: `${PAGES}cases/`, record: 'record.html',
}, cfg.links || {});

const STATES = ['Alabama','Alaska','Arizona','Arkansas','California','Colorado','Connecticut','Delaware','District of Columbia',
  'Florida','Georgia','Hawaii','Idaho','Illinois','Indiana','Iowa','Kansas','Kentucky','Louisiana','Maine','Maryland',
  'Massachusetts','Michigan','Minnesota','Mississippi','Missouri','Montana','Nebraska','Nevada','New Hampshire','New Jersey',
  'New Mexico','New York','North Carolina','North Dakota','Ohio','Oklahoma','Oregon','Pennsylvania','Rhode Island',
  'South Carolina','South Dakota','Tennessee','Texas','Utah','Vermont','Virginia','Washington','West Virginia','Wisconsin','Wyoming'];
const slugOf = (name) => name.toLowerCase().replace(/ /g, '-');

// "Your place": state, and optionally ZIP and street address, saved to the member's own row
// (member_places). Only that member can read it; not other members, moderators or admins.
// Older versions kept it in this browser (theway.place); that copy is offered once, then removed.
const PLACE_KEY = 'theway.place';
function oldLocalPlace() { try { return JSON.parse(localStorage.getItem(PLACE_KEY)) || null; } catch { return null; } }
async function readPlace() {
  try {
    const { data, error } = await sb.from('member_places').select('state,zip,address').eq('member_id', state.user.id).maybeSingle();
    return !error && data && US[data.state] ? data : null;
  } catch { return null; }
}
function loadPlace() {
  if (state.place) return { state: US[state.place.state][0], code: state.place.state, zip: state.place.zip || '', address: state.place.address || '' };
  return null;
}
async function savePlace(p) {
  if (p) {
    await q(sb.from('member_places').upsert({ member_id: state.user.id, state: p.code, zip: p.zip || null, address: p.address || null }));
  } else {
    await q(sb.from('member_places').delete().eq('member_id', state.user.id));
  }
  try { localStorage.removeItem(PLACE_KEY); } catch { /* private mode */ }
  state.place = p ? { state: p.code, zip: p.zip || null, address: p.address || null } : null;
}

function placePanel() {
  const box = h('div', { class: 'panel', id: 'place' });
  const msg = h('div');
  const draw = (editing) => {
    const place = loadPlace();
    if (place && !editing) {
      const ab = place.code;
      const guideLink = h('a', { class: 'button quiet', href: stateLinks(ab).page, text: `${place.state} voter guide` });
      if (READY.has(ab)) guideLink.href = stateLinks(ab).guide.slice(-1)[0];
      box.replaceChildren(
        h('div', { class: 'row' }, h('h2', { text: 'Your place' }), h('span', { class: 'tag', text: 'only you can see this' })),
        msg,
        h('p', {}, h('strong', { text: place.state }), place.zip ? ` · ZIP ${place.zip}` : '', place.address ? ` · ${place.address}` : ''),
        h('div', { class: 'btns' },
          guideLink,
          h('button', { class: 'quiet', onclick: () => draw(true) }, 'Change'),
          h('button', { class: 'quiet', onclick: action(async () => { await savePlace(null); drawNav(); draw(false); }, msg) }, 'Forget it')),
        h('p', { class: 'small dim', text: 'Matching your exact districts comes once the guide has official district data. Until then this takes you to your state.' }));
      return;
    }
    const old = place || oldLocalPlace();
    const oldCode = old ? (old.code || abbrOf(old.state)) : null;
    const codes = Object.keys(US).sort((x, y) => US[x][0].localeCompare(US[y][0]));
    const sel = h('select', { name: 'state', required: true }, h('option', { value: '', text: 'Choose your state' }),
      codes.map((c) => h('option', { value: c, text: US[c][0], selected: oldCode === c })));
    const zip = h('input', { name: 'zip', inputmode: 'numeric', pattern: '[0-9]{5}', maxlength: 5, placeholder: 'Optional, 5 digits', autocomplete: 'postal-code' });
    const addr = h('input', { name: 'address', maxlength: 200, placeholder: 'Optional: street address', autocomplete: 'street-address' });
    if (old && old.zip) zip.value = old.zip;
    if (old && old.address && !/^[0-9]{5}$/.test(old.address)) addr.value = old.address;
    else if (old && /^[0-9]{5}$/.test(old.address || '') && !zip.value) zip.value = old.address;
    box.replaceChildren(
      h('h2', { text: 'Your place (optional)' }), msg,
      h('p', { class: 'small muted', text: 'Save your state, and your ZIP or address if you like, so the map and your ballot open on your state on any device. Only you can see it: not other members, moderators or admins. "Forget it" deletes it for good.' }),
      h('form', { onsubmit: action(async () => {
        const a = addr.value.trim(), z = zip.value.trim();
        if (z && !/^[0-9]{5}$/.test(z)) throw new Error('A ZIP code is 5 digits.');
        if (/[<>]/.test(a)) throw new Error('Please leave out < and > in the address.');
        await savePlace({ code: sel.value, zip: z, address: a });
        drawNav(); draw(false);
      }, msg) },
        h('label', {}, 'State', sel), h('label', {}, 'ZIP code', zip), h('label', {}, 'Street address', addr),
        h('div', { class: 'btns' }, h('button', { class: 'primary' }, 'Save'),
          place ? h('button', { type: 'button', onclick: () => draw(false) }, 'Cancel') : null)));
  };
  draw(false);
  return box;
}

// ---------------------------------------------------------------- the whole-US map
// Shapes come from usmap-data.js (window.US_STATES = { CO: [name, svgPath, [cx, cy]] }).
// Which states have a guide and a map is a fixed list (READY below), set when each state
// is uploaded. The member area never asks / itself: that folder has its own
// password, and asking would pop the browser's password box.
const US = window.US_STATES || {};
const abbrOf = (name) => Object.keys(US).find((a) => US[a][0] === name) || null;
const myAbbr = () => { const p = loadPlace(); return p && p.state ? abbrOf(p.state) : null; };
// The state picked last on the map (this browser only). The small map and the guide card follow the saved
// "Your place" state first (so they always match the line under the cards); with no place saved they
// follow the state last picked on the map; with neither, nothing is lit.
const PICK_KEY = 'theway.mapPick';
const pickedAbbr = () => { try { const a = localStorage.getItem(PICK_KEY); return a && US[a] ? a : null; } catch { return null; } };
const setPick = (a) => { try { a ? localStorage.setItem(PICK_KEY, a) : localStorage.removeItem(PICK_KEY); } catch { /* private mode */ } };
const focusAbbr = () => myAbbr() || pickedAbbr();
const stateLinks = (a) => {
  const ab = a.toLowerCase();
  const own = (cfg.stateLinks || {})[a] || {};
  // Colorado was first, so its guide and map also live at the plain guide/ and map/.
  const guide = own.guide ? [own.guide] : a === 'CO' ? [`${PAGES}guide-${ab}/`, LINKS.guide] : [`${PAGES}guide-${ab}/`];
  const map = own.map ? [own.map] : a === 'CO' ? [`${PAGES}map-${ab}/`, LINKS.map] : [`${PAGES}map-${ab}/`];
  return { guide, map, page: `${LINKS.states}${slugOf(US[a][0])}.html` };
};
// States whose guide and map are live in /. Add a state here (or in config.js
// as readyStates: ['CO', ...]) when its pages go up.
const READY = new Set(cfg.readyStates || ['CO', 'OK', 'NC', 'FL', 'CA', 'TX', 'VA', 'NJ', 'MI', 'KY', 'MD', 'MO', 'MA']);
function available(a) {
  const l = stateLinks(a);
  // Colorado's live pages are the plain guide/ and map/.
  const pick = (urls) => (READY.has(a) ? urls[urls.length - 1] : null);
  return Promise.resolve({ guide: pick(l.guide), map: pick(l.map), page: l.page });
}

function usSvg(opts) {
  // The small map on the home card is the whole country with nothing lit; the full map page lights your state.
  const mine = opts.small ? null : myAbbr();
  const wrap = document.createElement('div');
  wrap.className = 'usmap' + (opts.small ? ' small' : '');
  const paths = Object.keys(US).map((a) =>
    `<path data-st="${a}" class="${a === mine ? 'mine' : ''}" d="${US[a][1]}"${opts.small ? '' : ` tabindex="0" role="button" aria-label="${US[a][0]}"`}><title>${US[a][0]}</title></path>`).join('');
  const pin = mine && US[mine] ? `<circle class="pin" cx="${US[mine][2][0]}" cy="${US[mine][2][1]}" r="${opts.small ? 14 : 7}"/>` : '';
  wrap.innerHTML = `<svg viewBox="0 0 975 610" role="img" aria-label="${mine ? `Map of the United States with ${US[mine][0]} highlighted` : 'Map of the United States'}">${paths}${pin}</svg>`;
  return wrap;
}

async function mapView() {
  const mine = myAbbr();
  const picked = pickedAbbr();
  const info = h('div', { class: 'panel state-pick', 'aria-live': 'polite' },
    h('p', { class: 'muted', text: 'Pick a state on the map or from the list.' }));
  const map = usSvg({});
  const show = async (a, opts = {}) => {
    setPick(a);
    // A click goes straight to that state's district map (its own bar links on to the guide).
    if (opts.go) { const m = READY.has(a) ? stateLinks(a).map.slice(-1)[0] : null; if (m) { location.href = m; return; } }
    map.querySelectorAll('path.on').forEach((el) => el.classList.remove('on'));
    const el = map.querySelector(`path[data-st="${a}"]`); if (el) el.classList.add('on');
    info.replaceChildren(h('h3', { text: US[a][0] }), h('p', { class: 'small muted', text: 'Checking what is ready…' }));
    const v = await available(a);
    const btns = [
      v.guide ? h('a', { class: 'button primary', href: v.guide, text: 'Voter guide' }) : null,
      v.map ? h('a', { class: 'button quiet', href: v.map, text: 'District map' }) : null,
      h('a', { class: 'button quiet', href: v.page, text: 'State page' }),
      h('button', { type: 'button', class: 'quiet', onclick: () => {
        setPick(null);
        map.querySelectorAll('path.on').forEach((el) => el.classList.remove('on'));
        info.replaceChildren(h('p', { class: 'muted', text: 'Pick a state on the map or from the list.' }));
      } }, 'Clear')];
    info.replaceChildren(...[h('h3', { text: US[a][0] }),
      (v.guide || v.map) ? null : h('p', { class: 'small muted', text: 'The full guide and map for this state are still being built. The state page has what is ready.' }),
      h('div', { class: 'btns' }, btns)].filter(Boolean));
  };
  map.addEventListener('click', (ev) => { const a = ev.target.closest('path') && ev.target.closest('path').dataset.st; if (a) show(a, { go: true }); });
  map.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Enter' && ev.key !== ' ') return;
    const a = ev.target.dataset && ev.target.dataset.st; if (a) { ev.preventDefault(); show(a, { go: true }); }
  });
  const names = Object.keys(US).sort((x, y) => US[x][0].localeCompare(US[y][0]));
  const list = h('div', { class: 'state-list' }, names.map((a) =>
    h('button', { type: 'button', class: 'quiet' + (a === mine ? ' mine' : ''), 'data-st': a, onclick: () => show(a, { go: true }) }, US[a][0])));
  render(
    h('p', { class: 'overline' }, h('a', { href: '#/', text: 'Home' })),
    h('h1', { text: 'The map' }),
    h('p', { class: 'lede', text: 'Every state. Bright states have a voter guide or district map ready.' }),
    map,
    h('p', { class: 'small dim maplegend' }, h('span', { class: 'key has' }), ' guide or map ready ', h('span', { class: 'key' }), ' coming ',
      mine ? [h('span', { class: 'key mine' }), ` your state (${US[mine][0]})`] : h('a', { href: '#/account', text: 'Save your state in your account to highlight it' })),
    info, list);
  for (const a of names) available(a).then((v) => {
    if (v.guide || v.map) {
      const p = map.querySelector(`path[data-st="${a}"]`); if (p) p.classList.add('has');
      const b = list.querySelector(`button[data-st="${a}"]`); if (b) b.classList.add('has');
    }
  });
  if (picked || mine) show(picked || mine);
}

// The Ranks page lives in ranks.html (how ranks and points work, plus the title picker).
function rolesView() { location.replace('/members/ranks.html'); }

// One list for the home page: threads and the newest posts together, one line per thread (a thread's first post is the
// same text as the thread, so it is shown once, with the newest post under it).
function activityFeed(threads, posts, catById) {
  const byThread = new Map();
  for (const p of posts) {   // posts arrive newest first, so the first one seen is the latest
    if (!p.thread_id || byThread.has(p.thread_id)) continue;
    byThread.set(p.thread_id, { id: p.thread_id, title: p.thread ? p.thread.title : 'Thread', at: p.created_at,
      who: p.author ? p.author.display_name : 'a member', body: p.body, cat: null });
  }
  for (const t of threads) {
    const e = byThread.get(t.id) || { id: t.id, who: t.author ? t.author.display_name : 'a member', body: '', at: t.last_post_at };
    e.title = t.title; e.cat = catById[t.category_id] || null;
    if ((t.last_post_at || '') > (e.at || '')) e.at = t.last_post_at;
    byThread.set(t.id, e);
  }
  return [...byThread.values()].sort((a, b) => (b.at || '').localeCompare(a.at || '')).slice(0, 8);
}

// The narrow bar at the very top of Home: the member's score first, then rank and what is next. Figures come from 0017
// (my_karma) and rank_progress; if either is missing the bar still shows, with dashes.
function scoreBar(wantsMod) {
  const points = h('strong', { class: 'sb-num', text: '…' }), recent = h('span', { class: 'sb-note' });
  const rank = h('strong', { class: 'sb-rank', text: roleLabelFor() }), next = h('span', { class: 'sb-note' });
  const waiting = h('span', { class: 'sb-note', text: '…' });
  const reviewLink = h('a', { class: 'button quiet sb-review', href: '#/review', text: 'Continue reviewing', hidden: true });
  const bar = h('div', { class: 'score-bar', role: 'group', 'aria-label': 'Your score and rank' },
    h('div', { class: 'sb-cell' }, h('span', { class: 'sb-label', text: 'Your score' }), h('span', {}, points, recent)),
    h('div', { class: 'sb-cell' }, h('span', { class: 'sb-label', text: 'Rank' }), h('span', {}, rank, next)),
    wantsMod ? h('div', { class: 'sb-cell' }, h('span', { class: 'sb-label', text: 'Your reviews' }), waiting) : null,
    wantsMod ? reviewLink : null,
    h('a', { class: 'sb-link', href: '#/roles', text: 'Ranks & awards' }));
  (async () => {
    try {
      const k = (await q(sb.rpc('my_karma')))[0];
      points.textContent = String(k.total);
      recent.textContent = ` · ${k.last_30_days >= 0 ? '+' : ''}${k.last_30_days} in 30 days`;
    } catch { points.textContent = '–'; }
    // my_review_summary (0023): reviewed = claims you have judged, waiting_second = how many of those still have no second reviewer.
    if (wantsMod) {
      try {
        const r = (await q(sb.rpc('my_review_summary')))[0];
        waiting.textContent = r.reviewed
          ? `${r.waiting_second} of your ${r.reviewed} checked ${r.reviewed === 1 ? 'claim is' : 'claims are'} waiting for a 2nd reviewer`
          : 'none yet';
        reviewLink.textContent = r.reviewed ? 'Continue reviewing' : 'Start your first review';
        reviewLink.hidden = false;
      } catch { waiting.textContent = '–'; reviewLink.hidden = false; }
    }
    try {
      const rows = await q(sb.rpc('rank_progress'));
      const todo = rows.find((p) => !p.have_it && !p.open_request);
      if (todo) next.textContent = ` · next: ${todo.label}, ${todo.events} of ${todo.need_events} accepted`;
    } catch { /* the rank name still shows */ }
  })();
  return bar;
}
function roleLabelFor() {
  for (const r of ['admin', 'moderator', 'editor', 'reviewer', 'researcher']) if (state.roles.has(r)) return { admin: 'Admin', moderator: 'Moderator' }[r] || roleName(r);
  return 'Member';
}

// "Waiting for you" on Home: unread notifications (latest three) and the review queues this member can act on.
// Every part loads on its own and quietly stays out of the way if it fails or the member has nothing there.
function homeInbox(wantsMod) {
  const noteList = h('ul', { class: 'list home-inbox-list' });
  const notes = h('section', { class: 'panel home-inbox', 'aria-labelledby': 'hi-notes' },
    h('div', { class: 'row' }, h('h2', { id: 'hi-notes', text: 'Notifications' }), h('a', { href: 'notifications.html', text: 'All notifications' })), noteList);
  const queues = h('ul', { class: 'list home-inbox-list' });
  const pending = h('section', { class: 'panel home-inbox', 'aria-labelledby': 'hi-rev', hidden: true },
    h('div', { class: 'row' }, h('h2', { id: 'hi-rev', text: 'Pending reviews' })), queues);
  noteList.append(h('li', { class: 'muted small', text: 'Loading…' }));
  (async () => {
    try {
      const rows = await q(sb.rpc('my_notifications', { p_unread_only: true, p_limit: 3 }));
      noteList.replaceChildren(...(rows.length ? rows.map((n) => h('li', {},
        h('div', { class: 'row' }, h('strong', {}, n.link ? h('a', { href: n.link, text: n.title }) : n.title), h('span', { class: 'meta', text: when(n.created_at) })),
        n.body ? h('div', { class: 'small', text: n.body.length > 160 ? n.body.slice(0, 160) + '…' : n.body }) : null))
        : [h('li', { class: 'muted small', text: 'Nothing new.' })]));
    } catch { noteList.replaceChildren(h('li', { class: 'muted small', text: 'Could not load them just now.' })); }
  })();
  const line = (href, label, n) => h('li', {}, h('div', { class: 'row' }, h('a', { href, text: label }), h('span', { class: n ? 'tag warn' : 'tag', text: n ? `${n} waiting` : 'none waiting' })));
  const tasks = [];
  if (can('reviewer') || can('moderator')) tasks.push(q(sb.rpc('read_check_queue', { max_rows: 30 })).then((r) => line('read-checks.html', 'Read checks to sign off', r.length)).catch(() => null));
  if (can('reviewer') || can('editor')) tasks.push(q(sb.rpc('author_queue', { p_max: 50 })).then((r) => line('author.html', 'Submitted articles and sources to check', r.length)).catch(() => null));
  Promise.all(tasks).then((ls) => { const ok = ls.filter(Boolean); if (ok.length) { queues.replaceChildren(...ok); pending.hidden = false; } });
  return h('div', { class: 'home-inbox-wrap' }, notes, pending);
}

// Newest member comments on articles, cases and measures (0070 recent_comments). Reply opens that page's discussion.
// Stays out of the way (empty) if 0070 is not run yet or there is nothing to show.
const KIND_LABEL = { news: 'Article', case: 'Case', measure: 'Measure', candidate: 'Candidate' };
function homeComments() {
  const box = h('div', { class: 'home-comments', hidden: true }, h('h3', { text: 'New comments on articles' }));
  const ul = h('ul', { class: 'list panel home-feed' });
  box.append(ul);
  (async () => {
    try {
      const rows = await q(sb.rpc('recent_comments', { p_limit: 5 }));
      if (!rows.length) return;
      ul.replaceChildren(...rows.map((c) => h('li', {},
        h('div', { class: 'row' }, h('span', { class: 'tag', text: KIND_LABEL[c.kind] || 'Page' }), h('span', { class: 'meta', text: when(c.created_at) })),
        h('div', { class: 'meta', text: c.parent_id ? `${c.author_name} replied` : c.author_name }),
        h('div', { class: 'small post', text: c.body }),
        h('div', { class: 'btns home-reply' }, h('a', { class: 'button quiet', 'data-reply-comment': c.id,
          href: `discuss.html?item=${encodeURIComponent(c.item_key)}`, text: 'Reply' })))));
      box.hidden = false;
    } catch { /* leave it hidden */ }
  })();
  return box;
}

async function homeView() {
  const wantsAdmin = can('admin'), wantsMod = can('moderator');
  const [cats, posts] = await Promise.all([
    q(sb.from('categories').select('*').order('sort_order')),
    q(sb.from('posts').select('id,body,created_at,thread_id,author:members!posts_author_id_fkey(display_name),thread:threads(title)')
      .is('hidden_at', null).order('id', { ascending: false }).limit(12)),
  ]);
  // Latest threads: a failure here must never break Home, so it is loaded on its own; the feed then shows posts only.
  let recent = [];
  const catById = Object.fromEntries((cats || []).map((c) => [c.id, c]));
  try {
    const ts = await q(sb.from('threads').select('id,title,status,last_post_at,pinned_at,category_id,author:members!threads_author_id_fkey(display_name)')
      .order('last_post_at', { ascending: false }).limit(30));
    recent = ts.filter((t) => !t.pinned_at).slice(0, 6);
  } catch { /* the feed still has the posts */ }
  const feed = activityFeed(recent, posts, catById);
  const a0 = focusAbbr();
  const place = loadPlace();
  const ballotCard = h('a', { class: 'home-card home-ballot', href: LINKS.guide },
    h('strong', { class: 'home-card-title', text: 'Your ballot' }),
    h('span', { class: 'home-card-sub', text: a0 ? `${US[a0][0]}: what is on your ballot, from official sources` : 'Save your state to see what is on your ballot' }),
    h('span', { class: 'home-cta', text: a0 ? 'Open your voter guide' : 'Choose your state' }));
  if (!a0) ballotCard.href = '#/account';
  // A small map of the whole country: click a state to open its voter guide (its state page if there is no guide yet).
  const homeMap = usSvg({});
  const goState = async (a) => { setPick(a); const v = await available(a); location.href = v.guide || v.page; };
  homeMap.addEventListener('click', (ev) => { const p = ev.target.closest('path'); if (p && p.dataset.st) goState(p.dataset.st); });
  homeMap.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Enter' && ev.key !== ' ') return;
    const a = ev.target.dataset && ev.target.dataset.st; if (a) { ev.preventDefault(); goState(a); }
  });
  const mapCard = h('div', { class: 'home-card home-map' },
    h('strong', { class: 'home-card-title', text: 'Map' }),
    h('span', { class: 'home-card-sub', text: 'Click a state to open its voter guide' }),
    homeMap,
    h('a', { class: 'button', href: '#/map', text: 'Open the map' }));

  const feedBox = h('div', { class: 'home-news' });
  const inbox = homeInbox(wantsMod);
  const seasonBox = h('div', { class: 'home-season' });
  render(
    h('div', { class: 'home-head' },
      h('h1', { class: 'home-hello', text: `Welcome back, ${state.me.display_name}` }),
      h('p', { class: 'small place-line' }, ...(place
        ? ['Your state: ', h('strong', { text: place.state }), ' · ', h('a', { href: '#/account', text: 'Change' })]
        : [h('a', { href: '#/account', text: 'Save your state in your account' }), ' to open the map and your ballot on it.']))),
    scoreBar(wantsMod),
    // Two cards side by side: My ballot (the season card: voter guide link and upcoming votes) and the clickable Map.
    // "Your tools" is the "My tools" drop-down in the header (waybar.js); the Review link lives in the score bar.
    h('div', { class: 'home-trio' }, seasonBox, mapCard),
    inbox,
    h('h2', { text: 'Recent in the Commons' }),
    feed.length ? h('ul', { class: 'list panel home-feed' }, feed.map((e) => h('li', {},
      h('div', { class: 'row' }, h('a', { href: `#/t/${e.id}`, text: e.title }), h('span', { class: 'meta', text: when(e.at) })),
      h('div', { class: 'meta', text: [e.who, e.cat ? e.cat.title : null].filter(Boolean).join(' · ') }),
      e.body ? h('div', { class: 'small post', text: e.body.length > 220 ? e.body.slice(0, 220) + '…' : e.body }) : null,
      // Quick Reply: for now it opens the thread; the in-thread reply (tagging a comment) is built in its own change and plugs in here.
      h('div', { class: 'btns home-reply' }, h('a', { class: 'button quiet', href: `#/t/${e.id}`, 'data-reply-thread': e.id, text: 'Reply' })))))
      : h('p', { class: 'muted', text: 'Nothing posted yet. Start the first thread in the Commons.' }),
    homeComments(),
    feedBox,
  );
  if (window.WaySeason) { try { window.WaySeason.mount(seasonBox, { abbr: a0 || '', stateName: a0 ? US[a0][0] : '', guideHref: () => ballotCard.href }); } catch { /* the card is optional */ } }
  if (window.WayHomeFeed) { try { window.WayHomeFeed.mount(feedBox, { sb, abbr: a0 || '' }); } catch { /* Home still works without the feed */ } }
  if (a0) available(a0).then((v) => { if (v.guide) ballotCard.href = v.guide; });
}

// ---------------------------------------------------------------- the Commons (forum front page)
const pinTag = (t) => (t.pinned_at ? h('span', { class: 'tag pin', text: 'pinned' }) : null);
// pinned first (newest pin on top), then by latest activity
const byPinThenRecent = (a, b) => (b.pinned_at || '').localeCompare(a.pinned_at || '') || (b.last_post_at || '').localeCompare(a.last_post_at || '');

function newThreadForm(cats, preset) {
  const msg = h('div');
  const open = cats.filter((c) => !c.locked);
  const room = h('select', { required: true }, h('option', { value: '', text: 'Choose a room' }),
    open.map((c) => h('option', { value: c.id, text: c.title, selected: preset === c.id })));
  const title = h('input', { required: true, minlength: 3, maxlength: 200, placeholder: 'What do you want to talk about?' });
  const body = h('textarea', { required: true, maxlength: 20000, placeholder: 'Plain text. Links are fine.' });
  return h('form', { class: 'panel', id: 'new-thread', onsubmit: action(async () => {
    if (!(await okToPost(`${title.value} ${body.value}`))) return;
    const tid = await q(sb.rpc('start_thread', { category_id: +room.value, title: title.value, body: body.value }));
    location.hash = `#/t/${tid}`;
  }, msg) }, h('h2', { text: 'Start a thread' }), msg,
    h('label', {}, 'Room', room), h('label', {}, 'Title', title), h('label', {}, 'First post', body),
    h('p', { class: 'small dim', text: 'Up to 5 new threads an hour. Edits stay visible in the post history.' }),
    h('div', { class: 'btns' }, h('button', { class: 'primary' }, 'Post thread')));
}

const ROOM_ART = new Set(['general', 'ideas', 'research-help', 'workshop', 'local', 'ballot']);
async function commonsView() {
  const [cats, threads] = await Promise.all([
    q(sb.from('categories').select('*').order('sort_order')),
    q(sb.from('threads').select('id,title,status,last_post_at,pinned_at,category_id,author:members!threads_author_id_fkey(display_name)')
      .order('last_post_at', { ascending: false }).limit(300)),
  ]);
  const catById = Object.fromEntries(cats.map((c) => [c.id, c]));
  const stats = (c) => { const ts = threads.filter((t) => t.category_id === c.id); return { n: ts.length, last: ts[0] ? ts[0].last_post_at : null }; };
  const pinned = threads.filter((t) => t.pinned_at).sort(byPinThenRecent);
  const recent = threads.filter((t) => !t.pinned_at).slice(0, 12);
  const formSlot = h('div');
  render(
    h('img', { class: 'page-art', src: 'art/commons.svg?v=1', alt: '', width: 320, height: 180 }),
    h('p', { class: 'overline', text: 'Members' }),
    h('h1', { text: 'The Commons' }),
    h('p', { class: 'lede', text: 'Where members talk: questions, ideas, research help and what is happening where you live. Members may talk about anything, candidates included. The Way itself never takes sides.' }),
    h('div', { class: 'btns' }, h('button', { class: 'primary', onclick: () => { formSlot.replaceChildren(newThreadForm(cats)); formSlot.querySelector('select').focus(); } }, 'Start a thread')),
    formSlot,
    threads.length ? null : h('div', { class: 'panel empty commons-empty' },
      h('h3', { text: 'Nothing posted yet' }),
      h('p', { class: 'muted', text: 'Be the first. Pick a room below, or press "Start a thread".' }),
      h('ul', { class: 'small muted' },
        h('li', { text: 'Only members can read or post here.' }),
        h('li', { text: 'Be civil. Argue with ideas, not people.' }),
        h('li', { text: 'If a post breaks the rules, press Report. Moderators review every report, and every moderation action is logged.' }),
        h('li', { text: 'Posts are plain text. Edits stay visible in the post history.' }))),
    pinned.length ? h('div', {}, h('h2', { text: 'Pinned' }), threadList(pinned, catById)) : null,
    recent.length ? h('div', {}, h('h2', { text: 'Latest threads' }), threadList(recent, catById)) : null,
    h('h2', { text: 'Rooms' }),
    h('div', { class: 'rooms' }, cats.map((c) => { const s = stats(c); return h('a', { class: 'room', href: `#/c/${c.slug}` },
      ROOM_ART.has(c.slug) ? h('img', { class: 'room-art', src: `art/room-${c.slug}.svg?v=1`, alt: '', width: 320, height: 180, loading: 'lazy' }) : null,
      h('strong', { text: c.title }, c.min_role ? h('span', { class: 'tag warn', text: 'admins only' }) : null),
      h('span', { class: 'muted small', text: c.description }),
      h('span', { class: 'meta', text: s.n ? `${s.n} thread${s.n === 1 ? '' : 's'} · last post ${when(s.last)}` : (c.locked ? 'read only' : 'no threads yet') })); })),
  );
}

function threadList(threads, catById) {
  if (!threads.length) return h('p', { class: 'muted', text: 'No threads here yet. Start the first one below.' });
  return h('ul', { class: 'list panel' }, threads.map((t) => h('li', {},
    h('div', { class: 'row' }, h('a', { href: `#/t/${t.id}`, text: t.title }), h('span', {}, pinTag(t), ' ', statusTag(t.status))),
    h('div', { class: 'meta' }, [
      catById && catById[t.category_id] ? catById[t.category_id].title + ' · ' : '',
      'started by ', t.author ? t.author.display_name : 'a member', ' · last post ', when(t.last_post_at)]))));
}
function statusTag(s) {
  if (s === 'locked') return h('span', { class: 'tag warn', text: 'locked' });
  if (s === 'hidden') return h('span', { class: 'tag bad', text: 'hidden' });
  return null;
}

async function categoryView(slug) {
  const cat = (await q(sb.from('categories').select('*').eq('slug', slug)))[0];
  if (!cat) return render(notice('That category does not exist.'));
  const threads = await q(sb.from('threads')
    .select('id,title,status,last_post_at,pinned_at,category_id,author:members!threads_author_id_fkey(display_name)')
    .eq('category_id', cat.id).order('last_post_at', { ascending: false }).limit(100));
  threads.sort(byPinThenRecent);
  const msg = h('div');
  const title = h('input', { required: true, minlength: 3, maxlength: 200 });
  const body = h('textarea', { required: true, maxlength: 20000 });
  render(
    h('p', { class: 'overline' }, h('a', { href: '#/commons', text: 'Commons' })),
    h('h1', { text: cat.title }), h('p', { class: 'lede', text: cat.description }),
    threadList(threads),
    cat.locked ? null : h('div', { class: 'panel' }, h('h2', { text: 'Start a thread' }), msg,
      h('form', { onsubmit: action(async () => {
        if (!(await okToPost(`${title.value} ${body.value}`))) return;
        const tid = await q(sb.rpc('start_thread', { category_id: cat.id, title: title.value, body: body.value }));
        location.hash = `#/t/${tid}`;
      }, msg) }, h('label', {}, 'Title', title), h('label', {}, 'First post', body),
        h('div', { class: 'btns' }, h('button', { class: 'primary' }, 'Post')))),
  );
}

async function threadView(id, jump) {
  if (can('moderator')) await langTerms();
  const thread = (await q(sb.from('threads')
    .select('*,category:categories(slug,title),author:members!threads_author_id_fkey(display_name)').eq('id', id)))[0];
  if (!thread) return render(notice('That thread does not exist or is not visible to you.'));
  const posts = await q(sb.from('posts')
    .select('*,author:members!posts_author_id_fkey(display_name)').eq('thread_id', id).order('id'));
  const msg = h('div');
  const reload = () => threadView(id);
  const byId = new Map(posts.map((p) => [p.id, p]));
  const reported = new Set(await q(sb.rpc('my_reported', { p_kind: 'post', p_ids: posts.map((p) => p.id) })).catch(() => []));
  const ctx = { thread, byId, reported, canReply: thread.status === 'open' };

  const modTools = can('moderator') ? h('div', { class: 'btns' },
    thread.status === 'open'
      ? h('button', { class: 'quiet', onclick: action(() => moderate('lock_thread', id, reload), msg) }, 'Lock thread')
      : h('button', { class: 'quiet', onclick: action(() => moderate(thread.status === 'hidden' ? 'unhide_thread' : 'unlock_thread', id, reload), msg) }, thread.status === 'hidden' ? 'Unhide thread' : 'Unlock thread'),
    thread.status !== 'hidden' ? h('button', { class: 'quiet danger', onclick: action(() => moderate('hide_thread', id, reload), msg) }, 'Hide thread') : null,
    h('button', { class: 'quiet', onclick: action(() => moderate(thread.pinned_at ? 'unpin_thread' : 'pin_thread', id, reload), msg) }, thread.pinned_at ? 'Unpin' : 'Pin to top'),
  ) : null;

  const reply = h('textarea', { required: true, maxlength: 20000 });
  render(
    h('p', { class: 'overline' }, h('a', { href: '#/commons', text: 'Commons' }), ' / ', h('a', { href: `#/c/${thread.category.slug}`, text: thread.category.title })),
    h('div', { class: 'row' }, h('h1', { text: thread.title }), h('span', {}, pinTag(thread), ' ', statusTag(thread.status))),
    h('p', { class: 'meta', text: `Started by ${thread.author ? thread.author.display_name : 'a member'} · ${when(thread.created_at)}` }),
    modTools, msg,
    h('ul', { class: 'list panel' }, posts.map((p) => postItem(p, msg, reload, ctx))),
    thread.status === 'open'
      ? h('div', { class: 'panel' }, h('form', { onsubmit: action(async () => {
          if (!(await okToPost(reply.value))) return;
          await q(sb.from('posts').insert({ thread_id: id, body: reply.value }));
          await reload();
        }, msg) }, h('label', {}, 'Reply', reply), h('div', { class: 'btns' }, h('button', { class: 'primary' }, 'Post reply'))))
      : h('p', { class: 'muted', text: 'This thread is closed to new replies.' }),
  );
  // #/t/12/p5 jumps to post 5; #/t/12/r5 jumps to post 5 and opens the reply box under it.
  const m = /^([pr])(\d+)$/.exec(jump || '');
  if (m) {
    const li = document.getElementById(`p${m[2]}`);
    if (li) {
      li.scrollIntoView({ block: 'center' });
      li.classList.add('jumped');
      if (m[1] === 'r') { const b = li.querySelector('[data-reply]'); if (b) b.click(); }
    }
  }
}

function postItem(p, msg, reload, ctx) {
  const mine = state.user && p.author_id === state.user.id;
  const bodyEl = h('div', { class: `post${p.hidden_at ? ' hidden' : ''}`, text: p.body });
  const extra = h('div');
  const li = h('li', { id: `p${p.id}` },
    h('div', { class: 'meta' }, [h('strong', { text: p.author ? p.author.display_name : 'a member' }), ' · ', when(p.created_at),
      p.edited_at ? ` · edited ${when(p.edited_at)}` : '', p.hidden_at ? ' · hidden by a moderator' : '']),
    bodyEl, extra);
  if (p.parent_post_id && ctx) {
    const par = ctx.byId.get(p.parent_post_id);
    const gone = !par || par.hidden_at;
    li.insertBefore(h('a', { class: 'replying', href: `#/t/${p.thread_id}/p${p.parent_post_id}`, title: 'Jump to the post this answers',
      text: gone ? 'Replying to a hidden post' : `Replying to ${par.author ? par.author.display_name : 'a member'}: ${par.body.replace(/\s+/g, ' ').slice(0, 80)}${par.body.length > 80 ? '...' : ''}` }), bodyEl);
  }
  const hits = can('moderator') ? strongWords(p.body, TERMS) : [];
  if (hits.length) li.firstChild.append(' ', h('span', { class: 'tag warn', title: hits.join(', '), text: 'strong language' }));

  const tools = h('div', { class: 'btns' });
  if (mine && !p.hidden_at) tools.append(h('button', { class: 'quiet', onclick: () => {
    const ta = h('textarea', { required: true, maxlength: 20000 }); ta.value = p.body;
    extra.replaceChildren(h('form', { onsubmit: action(async () => {
      if (!(await okToPost(ta.value))) return;
      await q(sb.from('posts').update({ body: ta.value }).eq('id', p.id));
      await reload();
    }, msg) }, ta, h('p', { class: 'small dim', text: 'Edits are public: the earlier wording stays in the post history.' }),
      h('div', { class: 'btns' }, h('button', { class: 'primary' }, 'Save edit'), h('button', { type: 'button', onclick: () => extra.replaceChildren() }, 'Cancel'))));
  } }, 'Edit'));
  if (p.edited_at) tools.append(h('button', { class: 'quiet', onclick: action(async () => {
    const revs = await q(sb.from('post_revisions').select('prior_body,created_at').eq('post_id', p.id).order('id'));
    extra.replaceChildren(h('div', { class: 'small' }, h('p', { class: 'dim', text: 'Earlier wording, oldest first:' }),
      revs.map((r) => h('div', {}, h('div', { class: 'meta', text: `replaced ${when(r.created_at)}` }), h('blockquote', { text: r.prior_body })))));
  }, msg) }, 'History'));
  if (ctx && ctx.canReply && !p.hidden_at) tools.append(h('button', { class: 'quiet', 'data-reply': '1', onclick: () => {
    if (extra.querySelector('.replybox')) return extra.replaceChildren();
    const ta = h('textarea', { required: true, maxlength: 20000, 'aria-label': 'Your reply' });
    const rm = h('div');
    extra.replaceChildren(h('form', { class: 'replybox', onsubmit: action(async () => {
      if (!(await okToPost(ta.value))) return;
      await q(sb.from('posts').insert({ thread_id: p.thread_id, body: ta.value, parent_post_id: p.id }));
      await reload();
    }, rm) }, h('p', { class: 'small dim', text: `Your reply will say it answers ${p.author ? p.author.display_name : 'a member'}.` }), ta, rm,
      h('div', { class: 'btns' }, h('button', { class: 'primary' }, 'Post reply'), h('button', { type: 'button', onclick: () => extra.replaceChildren() }, 'Cancel'))));
    ta.focus();
  } }, 'Reply'));
  if (!mine) tools.append(ctx && ctx.reported.has(p.id)
    ? h('button', { class: 'quiet', disabled: true }, 'Reported')
    : h('button', { class: 'quiet', onclick: () => {
        if (extra.querySelector('.reportbox')) return extra.replaceChildren();
        extra.replaceChildren(reportForm('post', p.id, extra, () => { if (ctx) ctx.reported.add(p.id); }));
      } }, 'Report'));
  if (can('moderator')) tools.append(p.hidden_at
    ? h('button', { class: 'quiet', onclick: action(() => moderate('unhide_post', p.id, reload), msg) }, 'Unhide')
    : h('button', { class: 'quiet danger', onclick: action(() => moderate('hide_post', p.id, reload), msg) }, 'Hide'));
  li.insertBefore(tools, extra);
  return li;
}

// Report form for a post or comment: pick a reason, add an optional note. The poster never sees who reported.
const REPORT_REASONS = [
  ['attack', 'Attacks or insults a person'], ['hate', 'Hate toward a group'], ['false_claim', 'States something false as fact'],
  ['politics', 'Asks for votes or backs a party or candidate'], ['private_info', 'Shares private information'],
  ['spam', 'Spam or an ad'], ['other', 'Something else (tell us below)'],
];
function reportForm(kind, id, slot, done) {
  const msg = h('div');
  const note = h('textarea', { maxlength: 500, 'aria-label': 'Note (optional)', placeholder: 'Add a note (optional)' }); note.style.minHeight = '70px';
  const radios = REPORT_REASONS.map(([code, label]) => h('label', { class: 'choice' }, h('input', { type: 'radio', name: `rr-${kind}-${id}`, value: code }), ' ', label));
  return h('form', { class: 'reportbox', onsubmit: action(async () => {
    const pick = radios.map((l) => l.firstChild).find((i) => i.checked);
    if (!pick) throw new Error('Pick a reason first.');
    await q(sb.rpc('report_item', { p_kind: kind, p_id: id, p_code: pick.value, p_note: note.value }));
    if (done) done();
    slot.replaceChildren(notice('Thanks. A moderator will look at it. The person who wrote it will not be told who reported.', 'ok'));
  }, msg) }, h('p', { class: 'small', text: 'What is wrong with this?' }), ...radios, note, msg,
    h('p', { class: 'small dim', text: 'Only moderators see your report and your name. One report per item.' }),
    h('div', { class: 'btns' }, h('button', { class: 'primary' }, 'Send report'), h('button', { type: 'button', onclick: () => slot.replaceChildren() }, 'Cancel')));
}

async function moderate(act, id, after) {
  const reason = await ask('Reason (every member can read the moderation log):');
  if (!reason) return;
  await q(sb.rpc('moderate', { action: act, subject_id: id, reason }));
  await after();
}

async function logView() {
  const rows = await q(sb.from('moderation_actions')
    .select('*,moderator:members!moderation_actions_moderator_id_fkey(display_name)').order('id', { ascending: false }).limit(200));
  render(
    h('h1', { text: 'Moderation log' }),
    h('p', { class: 'lede', text: 'Every moderation action, who took it, and why. Nothing here can be edited or removed.' }),
    rows.length ? h('ul', { class: 'list panel' }, rows.map((r) => h('li', {},
      h('div', { class: 'row' }, h('strong', { text: r.action.replace(/_/g, ' ') }), h('span', { class: 'meta', text: when(r.created_at) })),
      h('div', { class: 'meta', text: `${r.moderator ? r.moderator.display_name : '?'} · ${r.subject_type} ${r.subject_type === 'member' || r.subject_type === 'role' ? '' : '#' + r.subject_id}` }),
      h('div', { class: 'post', text: r.reason })))) : h('p', { class: 'muted', text: 'No moderation yet.' }),
  );
}

// ---------------------------------------------------------------- language filter
// The word list lives in the database (Admin > Language filter). A term ending in * matches any word
// starting with it; other terms match whole words. Findings are blocked by the database; posts only warn.
let TERMS = null;
async function langTerms(fresh) {
  if (!TERMS || fresh) TERMS = await q(sb.from('language_terms').select('term,kind').order('term')).catch(() => []);
  return TERMS;
}
function strongWords(text, terms) {
  const t = (text || '').toLowerCase();
  return (terms || []).filter(({ term }) => {
    const w = term.replace(/\*$/, '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(^|[^a-z0-9])${w}${term.endsWith('*') ? '' : '(?![a-z0-9])'}`).test(t);
  }).map((x) => x.term);
}
// before a post goes up: a warning, never a block
async function okToPost(text) {
  const hits = strongWords(text, await langTerms());
  return !hits.length || confirm(`This has strong language (${hits.join(', ')}). You can still post it, but moderators will see it flagged. Post it?`);
}

// ---------------------------------------------------------------- reports (moderators)

// ---------------------------------------------------------------- Cases (the history cases) and revision reports
// The list comes from cases-data.js (made by tools/cases_data.py from the built cases index).
// The case pages live in /cases/ and open in a new tab (that folder asks for its
// own password). Any member can report a case for revision; moderators accept or decline.
const CASES = window.WAY_CASES || [];
const caseBySlug = (slug) => CASES.find((c) => c.slug === slug) || null;
const caseUrl = (c) => `${LINKS.cases}${c.slug}.html`;
const STATUS_TAG = { open: ['open', ''], accepted: ['accepted', 'ok'], declined: ['declined', 'warn'] };
const safeLink = (u) => (/^https?:\/\/\S+$/i.test(u || '') ? h('a', { href: u, target: '_blank', rel: 'noopener noreferrer nofollow', text: u }) : null);

function caseReportForm(preset, done) {
  const msg = h('div');
  const pick = h('select', { name: 'case', required: true }, h('option', { value: '', text: 'Choose a case' }),
    CASES.map((c) => h('option', { value: c.slug, text: `Case ${c.num}: ${c.title}`, selected: preset === c.slug })));
  const problem = h('textarea', { name: 'problem', required: true, minlength: 10, maxlength: 2000, rows: 5,
    placeholder: 'What is wrong or missing? Quote the sentence if you can.' });
  const src = h('input', { name: 'source', type: 'url', maxlength: 500, placeholder: 'https://… (optional)' });
  const form = h('form', { class: 'panel case-report', onsubmit: action(async () => {
    const url = src.value.trim();
    if (url && !/^https?:\/\/\S+$/i.test(url)) throw new Error('The source link must start with http:// or https://');
    await q(sb.rpc('report_case_revision', { case_slug: pick.value, problem: problem.value.trim(), source_url: url || null }));
    form.replaceChildren(notice('Thanks. Your report is in. A moderator will review it, and you can follow it under "Your reports".', 'ok'));
    if (done) done();
  }, msg) },
    h('h3', { text: 'Report for revision' }), msg,
    h('label', {}, 'Case', pick),
    h('label', {}, 'What should change', problem),
    h('label', {}, 'Source that shows it (optional)', src),
    h('p', { class: 'small dim', text: 'Moderators see your display name with the report. Up to 10 reports a day.' }),
    h('div', { class: 'btns' }, h('button', { class: 'primary' }, 'Send report'),
      h('button', { type: 'button', class: 'quiet', onclick: () => { form.remove(); if (location.hash.startsWith('#/cases/')) location.hash = '#/cases'; } }, 'Cancel')));
  setTimeout(() => (preset ? problem : pick).focus());
  return form;
}

async function casesView(openSlug) {
  const isMod = can('moderator');
  const [mine, queue] = await Promise.all([
    q(sb.from('case_revision_reports').select('id,case_slug,problem,status,created_at,decision_note,decided_at')
      .eq('reporter_id', state.user.id).order('id', { ascending: false }).limit(50)),
    isMod ? q(sb.from('case_revision_reports')
      .select('id,case_slug,problem,source_url,created_at,reporter:members!case_revision_reports_reporter_id_fkey(display_name)')
      .eq('status', 'open').order('id')) : [],
  ]);
  const msg = h('div');
  const caseName = (slug) => { const c = caseBySlug(slug); return c ? `Case ${c.num}: ${c.title}` : slug; };
  // Reporting starts on the case page itself ("Report this case" links to #/cases/<slug>); the list has no report buttons.
  const target = openSlug && caseBySlug(openSlug);
  const formSlot = target ? h('div', { id: `report-${target.slug}` },
    h('p', { class: 'overline', text: caseName(target.slug) }),
    caseReportForm(target.slug, () => setTimeout(() => { location.hash = '#/cases'; }, 2500)),
    h('p', { class: 'small' }, h('a', { href: '#/cases', text: 'Back to all cases' }))) : null;

  const list = CASES.length ? h('ul', { class: 'list panel cases' }, CASES.map((c) => {
    return h('li', { id: `case-${c.slug}` },
      h('div', { class: 'meta', text: `Case ${c.num} · ${c.area} · ${c.years}` }),
      h('h3', {}, h('a', { href: caseUrl(c), text: c.title })),
      h('p', { class: 'muted small', text: c.blurb }),
      h('div', { class: 'btns' },
        h('a', { class: 'button quiet', href: caseUrl(c), text: 'Read the case' })));
  })) : h('p', { class: 'muted', text: 'No cases yet.' });

  const decide = (r, decision) => action(async () => {
    const note = await ask(decision === 'accepted' ? 'Accept: what will be changed?' : 'Decline: why? (the reporter sees this)');
    if (!note) return;
    await q(sb.rpc('decide_case_report', { report_id: r.id, decision, note }));
    await casesView();
  }, msg);

  render(
    h('img', { class: 'page-art', src: 'art/cases.svg?v=1', alt: '', width: 320, height: 180 }),
    h('p', { class: 'overline', text: 'Research' }),
    h('h1', { text: 'Cases' }),
    h('p', { class: 'lede', text: `The history cases we have written so far (${CASES.length} of a planned 24). Each opens in a new tab. If something in a case is wrong or missing, use "Report this case" on the case itself; a moderator reviews every report.` }),
    msg,
    formSlot,
    list,
    isMod ? h('div', { class: 'panel' }, h('h2', { text: `Revision reports to review (${queue.length})` }),
      queue.length ? h('ul', { class: 'list' }, queue.map((r) => h('li', {},
        h('div', { class: 'meta', text: `${caseName(r.case_slug)} · from ${r.reporter ? r.reporter.display_name : 'a member'} · ${when(r.created_at)}` }),
        h('div', { class: 'post', text: r.problem }),
        r.source_url ? h('p', { class: 'small' }, 'Source: ', safeLink(r.source_url) || r.source_url) : null,
        h('div', { class: 'btns' },
          caseBySlug(r.case_slug) ? h('a', { class: 'button quiet', href: caseUrl(caseBySlug(r.case_slug)), text: 'Open the case' }) : null,
          h('button', { class: 'quiet', onclick: decide(r, 'accepted') }, 'Accept'),
          h('button', { class: 'quiet danger', onclick: decide(r, 'declined') }, 'Decline'))))) : h('p', { class: 'muted small', text: 'Nothing waiting.' })) : null,
    h('div', { class: 'panel' }, h('h2', { text: 'Your reports' }),
      mine.length ? h('ul', { class: 'list' }, mine.map((r) => h('li', {},
        h('div', { class: 'row' }, h('strong', { text: caseName(r.case_slug) }),
          h('span', { class: `tag ${STATUS_TAG[r.status][1]}`, text: STATUS_TAG[r.status][0] })),
        h('div', { class: 'meta', text: when(r.created_at) }),
        h('div', { class: 'post', text: r.problem }),
        r.decision_note ? h('p', { class: 'small' }, h('strong', { text: 'Moderator: ' }), r.decision_note) : null))) : h('p', { class: 'muted small', text: 'You have not reported anything yet.' })),
  );
  if (formSlot) window.scrollTo(0, Math.max(0, formSlot.getBoundingClientRect().top + window.scrollY - 24));
}

async function reportsView() {
  const rows = await q(sb.rpc('report_queue'));
  const msg = h('div');
  const terms = await langTerms();
  const recent = await q(sb.from('posts').select('id,body,thread_id,created_at,hidden_at,author:members!posts_author_id_fkey(display_name)')
    .is('hidden_at', null).order('id', { ascending: false }).limit(300)).catch(() => []);
  const flagged = recent.map((p) => ({ p, hits: strongWords(p.body, terms) })).filter((x) => x.hits.length);
  render(
    h('h1', { text: 'Reports' }), msg,
    h('div', { class: 'panel' }, h('h2', { text: `Strong language in recent posts (${flagged.length})` }),
      h('p', { class: 'muted small', text: 'Posts are never blocked for language; the author was warned. Hide one only if it breaks the rules.' }),
      flagged.length ? h('ul', { class: 'list' }, flagged.map(({ p, hits }) => h('li', {},
        h('div', { class: 'meta', text: `${p.author ? p.author.display_name : 'a member'} · ${when(p.created_at)} · ${hits.join(', ')}` }),
        h('blockquote', { text: p.body.slice(0, 400) }),
        h('div', { class: 'btns' }, h('a', { class: 'button quiet', href: `#/t/${p.thread_id}/p${p.id}`, text: 'Open thread' }),
          h('button', { class: 'quiet danger', onclick: action(() => moderate('hide_post', p.id, reportsView), msg) }, 'Hide post'))))) : h('p', { class: 'muted small', text: 'None.' })),
    h('h2', { text: 'Open reports' }),
    rows.length ? h('ul', { class: 'list panel' }, rows.map((r) => h('li', {},
      h('div', { class: 'meta', text: `${r.kind === 'comment' ? 'Article comment' : 'Commons post'} by ${r.author_name || 'a member'} · reported by ${r.reporter_name || '?'} · ${when(r.created_at)}${r.hidden ? ' · already hidden' : ''}` }),
      h('div', { class: 'post', text: r.reason }),
      r.body ? h('blockquote', { text: r.body.slice(0, 600) }) : null,
      h('div', { class: 'btns' },
        r.kind === 'post' ? h('a', { class: 'button quiet', href: `#/t/${r.thread_id}/p${r.post_id}`, text: 'Open thread' }) : null,
        r.kind === 'comment' && r.item_key ? h('a', { class: 'button quiet', href: `/members/discuss.html?item=${encodeURIComponent(r.item_key)}`, text: 'Open discussion' }) : null,
        !r.hidden ? h('button', { class: 'quiet danger', onclick: action(async () => {
          if (r.kind === 'post') return moderate('hide_post', r.post_id, reportsView);
          const why = await ask('Reason (every member can read the moderation log):');
          if (!why) return;
          await q(sb.rpc('moderate_comment', { p_id: r.comment_id, p_hide: true, p_reason: why }));
          await reportsView();
        }, msg) }, r.kind === 'post' ? 'Hide post' : 'Hide comment') : null,
        h('button', { class: 'quiet', onclick: action(async () => {
          const res = await ask('How was this resolved?');
          if (!res) return;
          await q(sb.rpc('resolve_report', { report_id: r.id, resolution: res }));
          await reportsView();
        }, msg) }, 'Resolve'))))) : h('p', { class: 'muted', text: 'No open reports.' }),
  );
}

// ---------------------------------------------------------------- research desk

const VERDICTS = { supported: 'Supported', mixed: 'Mixed', not_supported: 'Not supported', too_early: 'Too early to tell' };
const verdictTag = (v) => v ? h('span', { class: `tag verdict v-${v}`, text: VERDICTS[v] || v }) : null;
const slugify = (s) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9\s-]/g, '').trim()
  .replace(/\s+/g, '-').replace(/-+/g, '-').slice(0, 70).replace(/^-|-$/g, '');
const CLAIM_RULE = 'One checkable sentence about a policy and what it did. Never about a candidate, a party or a person.';
const CHECK_LABEL = { clear: 'AI check: nothing glaring', flagged_confirmed: 'AI check flagged something; the author sent it anyway', unchecked: 'AI check did not run' };

// Where each version stands, from the append-only tables.
function versionState(v, subs, rets, evs) {
  const e = evs.filter((x) => x.version_id === v.id);
  if (e.some((x) => x.event_type === 'retracted')) return 'retracted';
  if (e.length) return 'published';
  if (rets.some((r) => r.version_id === v.id)) return 'returned';
  if (subs.some((s) => s.version_id === v.id)) return 'in_review';
  return 'draft';
}
const STATE_TAG = {
  draft: ['tag', 'draft'], in_review: ['tag warn', 'waiting for review'], returned: ['tag bad', 'sent back'],
  published: ['tag ok', 'published'], retracted: ['tag bad', 'retracted'],
};
const stateTag = (s) => h('span', { class: STATE_TAG[s][0], text: STATE_TAG[s][1] });

// The Research desk's "how it works" box and one worked example (Frank, Oct 15 2026).
// The example is plain text in this file: it is not in the database, not published, and not a Finding.
const DESK_EXAMPLE = {
  claim: 'The federal minimum wage has been $7.25 an hour since July 24, 2009.',
  verdict: 'Supported',
  summary: 'Yes. Congress last raised it in 2007, in three steps; the last step, to $7.25, took effect on July 24, 2009. No federal increase has been enacted since (as of October 2026).',
  evidence: 'The Fair Minimum Wage Act of 2007 (part of Public Law 110-28) raised the federal minimum in three steps: $5.85 on July 24, 2007, $6.55 on July 24, 2008, and $7.25 on July 24, 2009. The rate is written into federal law at 29 U.S.C. 206(a)(1)(C). The U.S. Department of Labor\'s history chart lists $7.25 as the federal rate from July 24, 2009.',
  against: 'Most workers are not paid as little as $7.25. Many states and cities set higher minimums, so saying "the minimum wage is $7.25" can mislead.',
  answer: 'True and worth saying, but this claim is only about the federal floor. Where a state or city sets a higher minimum, the higher one applies; the federal rate itself has not changed.',
  methods: 'Read the text of the 2007 law, the current U.S. Code section, and the Labor Department\'s chart, and checked that the dates and amounts match in all three.',
  limits: 'This says nothing about whether the rate should change. That is a policy argument, not a factual question.',
  sources: [
    ['primary', 'Public Law 110-28, section 8102 (Fair Minimum Wage Act of 2007), text of the law', 'https://www.congress.gov/110/plaws/publ28/PLAW-110publ28.pdf'],
    ['primary', '29 U.S.C. 206, minimum wage (current U.S. Code)', 'https://www.law.cornell.edu/uscode/text/29/206'],
    ['secondary', 'U.S. Department of Labor, History of Federal Minimum Wage Rates Under the Fair Labor Standards Act, 1938 to 2009', 'https://www.dol.gov/agencies/whd/minimum-wage/history/chart'],
  ],
};
function deskGuide() {
  const e = DESK_EXAMPLE;
  const part = (label, text) => h('div', { class: 'ex-part' }, h('span', { class: 'why-label', text: label }), h('p', { text }));
  return h('div', { class: 'panel desk-guide' },
    h('h2', { text: 'How a finding gets published' }),
    h('ol', { class: 'steps' },
      h('li', {}, h('strong', { text: 'Write the claim. ' }), 'One factual claim about a policy, never about a candidate or a party. Add the evidence, at least three sources (one of them primary), the strongest case against it, your answer, and a verdict.'),
      h('li', {}, h('strong', { text: 'AI pre-check. ' }), 'Our AI opens every source and checks the links, quotes and numbers. It only flags glaring problems; you can fix them or send it on anyway.'),
      h('li', {}, h('strong', { text: 'A second member reviews it, then it is published. ' }), 'A reviewer checks it before it goes up. Every later change stays visible in the finding\'s history.')),
    h('details', { class: 'example' },
      h('summary', { text: 'Read a worked example first' }),
      h('p', { class: 'notice', text: 'Example only. Not published and not counted as a Finding. It shows the shape of a good one.' }),
      part('Claim', e.claim),
      h('p', {}, h('span', { class: 'tag ok', text: e.verdict })),
      part('Short answer', e.summary),
      part('Evidence', e.evidence),
      part('Strongest case against it', e.against),
      part('Our answer', e.answer),
      part('How we checked', e.methods),
      part('Limits', e.limits),
      h('div', { class: 'ex-part' }, h('span', { class: 'why-label', text: 'Sources' }),
        h('ul', { class: 'small' }, e.sources.map(([type, title, url]) => h('li', {},
          h('span', { class: `tag ${type === 'primary' ? 'ok' : ''}`, text: type }), ' ',
          h('a', { href: url, target: '_blank', rel: 'noopener noreferrer', text: title })))))));
}

async function researchView() {
  const [items, versions, subs, rets, evs] = await Promise.all([
    q(sb.from('research_items').select('*').order('created_at', { ascending: false })),
    q(sb.from('research_versions').select('id,item_id,version_no,claim,verdict,author_id,created_at').order('id')),
    q(sb.from('research_submissions').select('version_id,check_state,created_at')),
    q(sb.from('research_returns').select('version_id')),
    q(sb.from('research_publication_events').select('version_id,event_type')),
  ]);
  const latestOf = (id) => versions.filter((v) => v.item_id === id).pop();
  const itemById = Object.fromEntries(items.map((i) => [i.id, i]));
  const waiting = versions.filter((v) => versionState(v, subs, rets, evs) === 'in_review');

  const msg = h('div');
  const title = h('input', { required: true, minlength: 10, maxlength: 200, placeholder: 'The 2012 Kansas income-tax cuts did not deliver the growth promised' });
  const question = h('textarea', { required: true, minlength: 3, maxlength: 1000, rows: 3, placeholder: 'Why it matters, and what question this answers' });
  const slug = h('input', { required: true, pattern: '[a-z0-9-]{3,80}', placeholder: 'kansas-2012-tax-cuts' });
  let slugTouched = false;
  slug.addEventListener('input', () => { slugTouched = true; });
  title.addEventListener('input', () => { if (!slugTouched) slug.value = slugify(title.value); });
  const picker = CL ? CL.startPicker() : null;

  render(
    h('p', { class: 'overline', text: 'Findings' }),
    h('h1', { text: 'Research desk' }),
    h('p', { class: 'lede', text: 'Make a claim, back it with evidence, face the strongest case against it, and pick a verdict. The AI fact-checks it, a second member reviews it, and then it is published.' }),
    CL ? h('p', {}, h('a', { href: '#/projects', text: 'Research projects' }), ' · findings grouped by topic') : null,
    deskGuide(),
    h('details', { class: 'small how-ai' }, h('summary', { text: 'How the AI fact-check works' }),
      h('p', { class: 'muted', text: 'Our own AI, running on our own computer; the checking stays local and drafts never go to an outside AI company. It opens every source, checks links, quotes and numbers, saves each source (a public Wayback copy plus our own private screenshot and text), and flags only glaring problems. It never decides: you can fix it or send it on anyway, a second member always reviews it, and the public finding says what the AI check found.' })),
    state.hasRecord ? h('p', {}, h('a', { href: 'findings.html', text: 'See the published Findings' })) : null,
    can('reviewer') && waiting.length ? h('div', { class: 'panel' }, h('h2', { text: `Waiting for review (${waiting.length})` }),
      h('ul', { class: 'list' }, waiting.map((v) => {
        const s = subs.find((x) => x.version_id === v.id);
        return h('li', {}, h('div', { class: 'row' }, h('a', { href: `#/research/${v.item_id}`, text: v.claim || itemById[v.item_id].title }), verdictTag(v.verdict)),
          h('div', { class: 'meta', text: `Version ${v.version_no} · sent ${when(s.created_at)} · ${CHECK_LABEL[s.check_state]}` }));
      }))) : null,
    items.length ? h('ul', { class: 'list panel' }, items.map((i) => {
      const v = latestOf(i.id);
      return h('li', {},
        h('div', { class: 'row' }, h('a', { href: `#/research/${i.id}`, text: (v && v.claim) || i.title }),
          h('span', {}, v ? verdictTag(v.verdict) : null, ' ', i.published_version_id ? stateTag('published') : v ? stateTag(versionState(v, subs, rets, evs)) : stateTag('draft'))),
        h('div', { class: 'muted small', text: i.question }));
    })) : h('p', { class: 'muted', text: 'No findings yet.' }),
    can('researcher') ? h('div', { class: 'panel' }, h('h2', { text: 'Start a new finding' }),
      h('p', { class: 'muted small', text: CLAIM_RULE }), msg,
      h('form', { onsubmit: action(async () => {
        const row = (await q(sb.from('research_items').insert({ slug: slug.value, title: title.value.trim(), question: question.value.trim() }).select('id')))[0];
        if (picker) await picker.link(row.id);   // a failed link never loses the finding; link it again from its page
        location.hash = `#/research/${row.id}`;
      }, msg) }, h('label', {}, 'The claim', title), h('label', {}, 'Why it matters', question), picker ? picker.node : null,
        h('details', {}, h('summary', { text: 'Web address (filled in for you)' }), h('label', {}, 'Lowercase words and dashes', slug)),
        h('div', { class: 'btns' }, h('button', { class: 'primary' }, 'Start')))) : null,
  );
}

async function researchItemView(id) {
  const item = (await q(sb.from('research_items').select('*').eq('id', id)))[0];
  if (!item) return render(notice('Not found.'));
  const [versions, events] = await Promise.all([
    q(sb.from('research_versions').select('*,author:members!research_versions_author_id_fkey(display_name)').eq('item_id', id).order('version_no')),
    q(sb.from('research_publication_events').select('*,reviewer:members!research_publication_events_reviewer_id_fkey(display_name)').eq('item_id', id).order('id')),
  ]);
  const vids = versions.map((v) => v.id);
  const [srcs, subs, rets, checks] = vids.length ? await Promise.all([
    q(sb.from('research_sources').select('*').in('version_id', vids).order('id')),
    q(sb.from('research_submissions').select('*,by:members!research_submissions_submitted_by_fkey(display_name)').in('version_id', vids)),
    q(sb.from('research_returns').select('*,by:members!research_returns_reviewer_id_fkey(display_name)').in('version_id', vids)),
    q(sb.from('research_prechecks').select('*').in('version_id', vids).order('id')),
  ]) : [[], [], [], []];
  const snaps = srcs.length ? await q(sb.from('research_source_snapshots').select('*').in('source_id', srcs.map((x) => x.id))) : [];
  const terms = await langTerms();
  const msg = h('div');
  const reload = () => researchItemView(id);
  const latest = versions[versions.length - 1];
  const canLink = can('reviewer') || can('editor') || (can('researcher') && state.user && (item.created_by === state.user.id || versions.some((v) => v.author_id === state.user.id)));
  const linksPanel = CL ? await CL.itemLinks(item, canLink, reload) : null;

  const fakeOf = (vid) => new Set(checks.filter((c) => c.version_id === vid && c.status === 'done')
    .flatMap((c) => (c.findings || []).filter((f) => f.kind === 'quote_missing').map((f) => f.source_id)));
  const carrySources = (v) => { const bad = fakeOf(v.id); return srcs.filter((x) => x.version_id === v.id && !bad.has(x.id)); };

  const versionPanels = versions.slice().reverse().map((v) => {
    const evs = events.filter((e) => e.version_id === v.id);
    const st = versionState(v, subs, rets, events);
    const vs = srcs.filter((s) => s.version_id === v.id);
    const sub = subs.find((s) => s.version_id === v.id);
    const ret = rets.find((r) => r.version_id === v.id);
    const check = checks.filter((c) => c.version_id === v.id).pop();
    // sources a check found quoting words that are not on their page: a hard stop until removed
    const fakeIds = fakeOf(v.id);
    const blocked = vs.filter((x) => fakeIds.has(x.id));
    // sent to the AI = locked for good; any change is a new version
    const locked = checks.some((c) => c.version_id === v.id);
    const cards = groupSources(vs);
    const hasPrimary = vs.some((x) => x.source_type === 'primary');
    const mine = state.user && v.author_id === state.user.id;
    const editable = mine && st === 'draft' && !locked;
    const ownHits = strongWords([item.title, item.question, v.claim, v.summary, v.body, v.counterargument, v.counter_response, v.methods, v.limitations].join(' '), terms);
    const quoteHits = vs.some((x) => strongWords(x.quote, terms).length);
    const tools = h('div', { class: 'btns' });

    if (can('reviewer') && !mine && st === 'in_review') {
      tools.append(
        h('button', { class: 'primary', onclick: action(async () => {
          const reason = await ask("Publish: what did you check? (shown in the finding's history)");
          if (!reason) return;
          await q(sb.rpc('review_research_version', { version_id: v.id, event_type: item.published_version_id ? 'corrected' : 'published', reason }));
          await reload();
        }, msg) }, item.published_version_id ? 'Publish as correction' : 'Publish'),
        h('button', { onclick: action(async () => {
          const note = await ask('Send back: what needs fixing? (the author sees this)');
          if (!note) return;
          await q(sb.rpc('return_for_changes', { version_id: v.id, note }));
          await reload();
        }, msg) }, 'Send back'));
    }
    if (can('reviewer') && !mine && st === 'published') {
      tools.append(h('button', { class: 'quiet danger', onclick: action(async () => {
        const reason = await ask("Retract: why? (shown to members in the finding's history)");
        if (!reason) return;
        await q(sb.rpc('review_research_version', { version_id: v.id, event_type: 'retracted', reason }));
        await reload();
      }, msg) }, 'Retract'));
    }

    let authorBox = null;
    if (mine && st === 'draft') {
      const url = h('input', { type: 'url', required: true, placeholder: 'https://' });
      const stitle = h('input', { required: true, maxlength: 500 });
      const pub = h('input', { maxlength: 200 });
      const pdate = h('input', { type: 'date', min: '1400-01-01', max: new Date(Date.now() + 864e5).toISOString().slice(0, 10) });
      const quote = h('textarea', { maxlength: 5000, rows: 3, placeholder: 'Exact words, copied from the source' });
      const loc = h('input', { maxlength: 200, placeholder: 'p. 12, table 3, or 14:05' });
      const stype = typeSelect('secondary');
      const sendBox = h('div');
      const ready = v.claim && v.verdict && v.counterargument && v.counter_response;
      authorBox = h('div', {},
        locked ? h('p', { class: 'muted small', text: 'Sent to the AI, so this version is locked and recorded. To change anything, write a new version; it starts as a copy of this one.' })
        : h('details', { open: cards.length < 3 }, h('summary', { text: `Add a source (${cards.length} of at least 3, one primary)` }), h('form', { onsubmit: action(async () => {
          await q(sb.from('research_sources').insert({ version_id: v.id, url: url.value.trim(), title: clean(stitle.value) || '', source_type: stype.value,
            publisher: clean(pub.value), published_at_claimed: pdate.value || null, quote: clean(quote.value), locator: clean(loc.value) }));
          await reload();
        }, msg) }, h('label', {}, 'Link', url), h('label', {}, 'Title', stitle), h('label', {}, 'Type of source', stype), h('p', { class: 'muted small', text: PRIMARY_HINT }),
          h('label', {}, 'Publisher', pub),
          h('label', {}, 'Date the publisher gives', pdate), h('label', {}, 'Quote (the AI checks it is really on the page)', quote), h('label', {}, 'Where in the source', loc),
          h('p', { class: 'muted small', text: 'More quotes from the same page go on its card: "Add another quote from this source".' }),
          h('div', { class: 'btns' }, h('button', { class: 'primary' }, 'Add source')))),
        h('div', { class: 'sendbox' },
          !ready ? h('p', { class: 'muted small', text: 'This version is missing the claim, verdict or the other side. Write a new version with them to send it for review.' })
          : ownHits.length ? h('div', { class: 'notice error', role: 'note' }, h('strong', { text: 'Strong language in your own words: ' }),
              h('span', { text: `${ownHits.join(', ')}. Reword it in a new version, or quote it from a source (quotes the AI verifies on the page are allowed).` }),
              h('div', { class: 'btns' }, h('button', { class: 'primary', onclick: openNewVersion }, 'Write a new version')))
          : cards.length < 3 ? h('p', { class: 'muted small', text: 'Add at least three different sources (several quotes from one page count as one), then send it for review.' })
          : !hasPrimary ? h('p', { class: 'muted small', text: 'Mark at least one source as primary (a court record, official data, a statute or government document, or an original study), then send it for review.' })
          : blocked.length ? h('div', { class: 'notice error', role: 'note' },
              h('strong', { text: 'This finding can\'t go to review yet. ' }),
              h('span', { text: `The quote for ${blocked.map((x) => `"${srcTitle(x)}"`).join(', ')} is not on its page. Write a new version: your other sources are copied over, then add that one again with the exact words from the page.` }),
              h('div', { class: 'btns' }, h('button', { class: 'primary', onclick: openNewVersion }, 'Write a new version')))
          : h('div', {}, h('p', { class: 'muted small', text: 'The AI checks it for glaring errors first, then it goes to a second member for review.' }),
              locked ? null : h('p', { class: 'notice warn lock-warn', role: 'note', text: LOCK_WARNING }),
              h('div', { class: 'btns' }, h('button', { class: 'primary', onclick: action(() => {
                if (!locked && !confirm(LOCK_WARNING + '\n\nSend it to the AI now?')) return;
                return sendForReview(v, sendBox, reload);
              }, msg) }, locked ? 'Check again and send' : 'Send to AI'))),
          sendBox));
    }

    const aiNote = h('div');
    if (CL) CL.versionNote(v.id).then((n) => { if (n) aiNote.append(n); });
    return h('div', { class: 'panel' },
      h('div', { class: 'row' }, h('h3', { text: `Version ${v.version_no}` }),
        h('span', {}, item.published_version_id === v.id ? h('span', { class: 'tag ok', text: 'current' }) : null, ' ', stateTag(st))),
      h('div', { class: 'meta', text: `${v.author ? v.author.display_name : '?'} · ${when(v.created_at)} · why: ${v.reason_for_change}` }),
      v.claim ? h('p', { class: 'claim' }, h('span', { text: v.claim }), ' ', verdictTag(v.verdict)) : null,
      aiNote,
      h('p', { text: v.summary }),
      h('details', {}, h('summary', { text: 'Evidence, the other side, how we checked' }),
        h('h3', { text: 'Evidence' }), h('div', { class: 'post', text: v.body || '—' }),
        v.counterargument ? [h('h3', { text: 'The strongest case against' }), h('div', { class: 'post', text: v.counterargument }),
          h('h3', { text: 'Our answer' }), h('div', { class: 'post', text: v.counter_response })] : null,
        h('h3', { text: 'How we checked' }), h('div', { class: 'post', text: v.methods }),
        h('h3', { text: 'Limits' }), h('div', { class: 'post', text: v.limitations })),
      h('h3', { text: `Sources (${cards.length})` }),
      cards.length ? h('div', { class: 'source-cards' }, cards.map((g, i) => sourceCard(g, i + 1, snaps, {
        fakeIds, editable, msg, reload, version: v }))) : h('p', { class: 'muted small', text: 'None yet.' }),
      check ? checkBlock(check) : null,
      sub ? h('p', { class: 'meta', text: `Sent for review by ${sub.by ? sub.by.display_name : '?'} on ${when(sub.created_at)} · ${CHECK_LABEL[sub.check_state]}` }) : null,
      ret ? h('div', { class: 'notice error', role: 'note' }, h('strong', { text: `Sent back by ${ret.by ? ret.by.display_name : '?'}: ` }), h('span', { text: ret.note }),
        mine ? h('div', { class: 'small', text: 'Write a new version with the fixes below.' }) : null) : null,
      quoteHits && (st === 'in_review' || st === 'draft') ? h('p', { class: 'notice warn', role: 'note', text: 'Contains quoted strong language: it appears only inside source quotes, which is allowed when the AI verified the quote on its page.' }) : null,
      can('reviewer') && !mine && st === 'in_review' ? h('p', { class: 'muted small', text: 'Before publishing: open every source and find the quote, check the numbers, make sure the claim is about a policy and not a person, and that the verdict matches the evidence.' }) : null,
      authorBox,
      evs.length ? h('ul', { class: 'small list' }, evs.map((e) => h('li', { text: `${e.event_type} by ${e.reviewer ? e.reviewer.display_name : '?'} on ${when(e.created_at)}: ${e.reason}` }))) : null,
      tools);
  });

  // only the newest version open; earlier ones folded away but still there for the record
  // ...plus the published version and any older version still waiting for a reviewer, so neither is hidden
  const newestFirst = versions.slice().reverse();
  const keepOpen = versionPanels.filter((_, i) => i === 0 || newestFirst[i].id === item.published_version_id
    || versionState(newestFirst[i], subs, rets, events) === 'in_review');
  const folded = versionPanels.filter((p) => !keepOpen.includes(p));
  const versionBlocks = [...keepOpen,
    folded.length ? h('details', { class: 'panel earlier' }, h('summary', { text: `Earlier versions (${folded.length})` }), folded) : null];

  let newVersion = null;
  if (can('researcher')) {
    const ta = (name, label, min, max, rows, hint) => {
      const el = h('textarea', { name, required: min > 0, minlength: min || null, maxlength: max, rows, placeholder: hint || null });
      if (latest) el.value = latest[name] || '';
      return h('label', {}, label, el);
    };
    const claim = h('input', { name: 'claim', required: true, minlength: 10, maxlength: 300, value: (latest && latest.claim) || item.title });
    const verdict = h('select', { name: 'verdict', required: true },
      h('option', { value: '', text: 'Choose a verdict' }),
      Object.entries(VERDICTS).map(([k, label]) => h('option', { value: k, text: label, selected: latest && latest.verdict === k ? true : null })));
    const reason = h('input', { required: true, minlength: 3, maxlength: 2000, placeholder: latest ? 'What changed, and why' : 'First version' });
    const form = h('form', { onsubmit: action(async () => {
        const fd = new FormData(form);
        const [nv] = await q(sb.from('research_versions').insert({ item_id: item.id, claim: fd.get('claim').trim(), verdict: fd.get('verdict'),
          summary: fd.get('summary'), body: fd.get('body') || '', counterargument: fd.get('counterargument'), counter_response: fd.get('counter_response'),
          methods: fd.get('methods'), limitations: fd.get('limitations'), reason_for_change: reason.value }).select('id'));
        // carry the sources over as new rows (the old version keeps its own, frozen); a quote the AI
        // could not find on its page is left behind, so it has to be added again with the real words
        const carry = latest ? carrySources(latest) : [];
        if (nv && carry.length) {
          const okDate = (d) => d && d >= '1400-01-01' && d <= new Date(Date.now() + 864e5).toISOString().slice(0, 10) ? d : null;
          await q(sb.from('research_sources').insert(carry.map((x) => ({ version_id: nv.id, url: x.url, title: srcTitle(x), publisher: clean(x.publisher),
            published_at_claimed: okDate(x.published_at_claimed), quote: clean(x.quote), locator: clean(x.locator), source_type: x.source_type }))));
        }
        if (aiBox && nv) { try { await CL.draftUsed(aiBox, nv.id); } catch { /* the version is saved; only the AI note and drafted sources are missing */ } }
        await reload();
      }, msg) },
        h('label', {}, 'The claim', claim), h('p', { class: 'muted small', text: CLAIM_RULE }),
        h('label', {}, 'Verdict', verdict),
        ta('summary', 'Short answer (what a reader sees first)', 10, 4000, 3),
        ta('body', 'Evidence: the facts and numbers, and which source says each one', 20, 200000, 12),
        ta('counterargument', 'The strongest case against the claim, stated fairly', 20, 20000, 4),
        ta('counter_response', 'Our answer: why the claim still holds, or where it does not', 10, 20000, 4),
        ta('methods', 'How we checked', 3, 20000, 3),
        ta('limitations', 'Limits: what this cannot tell you', 3, 20000, 3),
        h('label', {}, 'Reason for this version', reason),
        h('div', { class: 'btns' }, h('button', { class: 'primary' }, 'Save version')));
    const aiBox = CL ? CL.draftBox(form) : null;
    if (aiBox) form.prepend(aiBox.node);
    const proof = CL ? CL.proofreadBox(form) : null;
    if (proof) form.insertBefore(proof.node, form.lastElementChild);
    const carry = latest ? carrySources(latest) : [];
    const left = latest ? srcs.filter((x) => x.version_id === latest.id).length - carry.length : 0;
    if (latest) form.prepend(h('p', { class: 'muted small', text: `Everything below starts from version ${latest.version_no}. `
      + (carry.length ? `Its sources (${groupSources(carry).length}, with ${carry.length} quote${carry.length === 1 ? '' : 's'}) will be copied into the new version, where you can edit or remove each one.` : '')
      + (left > 0 ? ` ${left}${left === 1 ? ' quote that is' : ' quotes that are'} not on the page won't be copied; add ${left === 1 ? 'it' : 'them'} again with the exact words.` : '') }));
    newVersion = h('details', { class: 'panel', id: 'new-version', open: !latest || null },
      h('summary', { text: latest ? 'Write a new version' : 'Write the first version' }), form);
  }

  render(
    h('p', { class: 'overline' }, h('a', { href: '#/research', text: 'Research desk' })),
    h('h1', { text: (latest && latest.claim) || item.title }), h('p', { class: 'lede', text: item.question }),
    item.published_version_id ? h('p', {}, h('a', { href: `findings.html#${encodeURIComponent(item.slug)}`, text: 'View the published finding' }), ' · ',
      h('a', { href: `record.html?item=${encodeURIComponent(item.slug)}`, text: 'History' })) : null,
    msg, linksPanel, newVersion, versionBlocks,
  );
}

function checkBlock(c) {
  const head = c.status === 'queued' ? 'AI fact-check: waiting for the AI'
    : c.status === 'running' ? 'AI fact-check: checking now'
    : c.status === 'failed' ? `AI fact-check: could not finish (${c.error || 'unknown error'})`
    : c.outcome === 'flagged' ? 'AI fact-check: found something glaring' : 'AI fact-check: nothing glaring';
  return h('div', { class: `check ${c.outcome || c.status}` },
    h('div', { class: 'meta', text: `${head}${c.completed_at ? ' · ' + when(c.completed_at) : ''}${c.model ? ' · ' + c.model : ''}` }),
    c.summary ? h('p', { class: 'small', text: c.summary }) : null,
    findingsList(c.findings || []));
}
function findingsList(fs) {
  if (!fs.length) return null;
  const sorted = fs.slice().sort((a, b) => (a.severity === 'glaring' ? 0 : 1) - (b.severity === 'glaring' ? 0 : 1));
  return h('ul', { class: 'findings' }, sorted.map((f) => h('li', { class: f.severity },
    h('span', { class: `tag ${f.severity === 'glaring' ? 'bad' : ''}`, text: f.severity === 'glaring' ? 'glaring' : 'note' }), ' ',
    h('span', { text: f.issue }), f.where ? h('span', { class: 'meta', text: ` (${f.where})` }) : null, reasons(f))));
}
// Why the AI flagged it: what it checked, what the source actually says, why that matters, what would fix it.
function reasons(f) {
  const row = (label, val, quote) => val ? h('div', { class: 'why-row' }, h('span', { class: 'why-label', text: label }),
    quote ? h('blockquote', { text: val }) : h('span', { text: val })) : null;
  const says = f.source_says || (f.checked && f.why && !f.source_says ? 'Nothing in the sources says this.' : '');
  const rows = [row('What I checked', f.checked, true), row('The source says', says, !!f.source_says),
    row('Why it matters', f.why), row('To fix it', f.fix)].filter(Boolean);
  return rows.length ? h('div', { class: 'why' }, rows) : null;
}

const LOCK_WARNING = 'Once sent, this version is locked and recorded permanently in the record. Changes will become a new version.';
function openNewVersion() {
  const nv = document.getElementById('new-version');
  if (nv) { nv.open = true; nv.scrollIntoView({ behavior: 'smooth' }); }
}

// Ask the AI to fact-check, wait for the answer, then send for review, or ask "are you sure?".
async function sendForReview(v, box, reload) {
  const say = (...n) => box.replaceChildren(...n.flat().filter(Boolean));
  if (box.previousElementSibling) box.previousElementSibling.hidden = true;  // the "Fact-check and send" button
  const submit = async (confirmWord) => {
    const st = await q(sb.rpc('submit_for_review', { version_id: v.id, confirm: confirmWord || null }));
    await reload();
    return st;
  };
  const btn = (label, fn, cls) => h('button', { class: cls || null, onclick: action(fn, box) }, label);
  const withoutCheck = (why) => say(notice(why, 'warn'),
    h('div', { class: 'btns' }, btn('Send without the check', () => submit('unchecked'), 'primary'), btn('Try the check again', () => sendForReview(v, box, reload))));

  const status = await q(sb.rpc('checker_status')).catch(() => null);
  const pid = await q(sb.rpc('request_precheck', { version_id: v.id }));
  if (status && !status.online) {
    return withoutCheck("The AI fact-checker is offline right now, so this version can't be checked. You can send it anyway; the reviewer will see it wasn't checked.");
  }
  const started = Date.now();
  say(notice('The AI is fact-checking this version. This usually takes under a minute.', 'ok'));
  for (;;) {
    await new Promise((r) => setTimeout(r, 3000));
    if (!document.body.contains(box)) return;  // the page moved on
    const c = (await q(sb.from('research_prechecks').select('*').eq('id', pid)))[0];
    if (c && c.status === 'done') {
      const fakes = (c.findings || []).filter((f) => f.kind === 'quote_missing');
      if (fakes.length) {
        return say(h('h3', { text: 'I found this:' }), findingsList(c.findings),
          h('div', { class: 'notice error', role: 'note' },
            h('strong', { text: 'This can\'t be posted for review until it\'s fixed. ' }),
            h('span', { text: 'A quote is not on the page it links to. This version is locked now, so write a new version: your other sources are copied over; add that one again with the exact words from the page, then send it to the AI.' })),
          h('div', { class: 'btns' }, btn('Write a new version', async () => { await reload(); openNewVersion(); }, 'primary')));
      }
      if (c.outcome === 'flagged') {
        return say(h('h3', { text: 'I found this:' }), findingsList(c.findings),
          c.summary ? h('p', { class: 'small muted', text: c.summary }) : null,
          h('p', { class: 'ask', text: 'Are you sure you want to post this for review?' }),
          h('div', { class: 'btns' },
            btn('Go back and fix it', () => {
              openNewVersion();
              say(h('p', { class: 'muted small', text: 'Fix it in a new version below; it will be checked again when you send it.' }));
            }, 'primary'),
            btn('Post for review anyway', () => submit('flagged'))));
      }
      await submit(null);
      return;
    }
    if (c && c.status === 'failed') return withoutCheck(`The AI couldn't finish the check (${c.error || 'unknown error'}).`);
    if (Date.now() - started > 150000) return withoutCheck("The AI hasn't answered yet. It may be busy or offline.");
  }
}

function languagePanel(msg) {
  const box = h('div', { class: 'panel' });
  const draw = async () => {
    const terms = await langTerms(true);
    const term = h('input', { required: true, maxlength: 40, placeholder: 'word, or start of a word followed by *' });
    const kind = h('select', {}, h('option', { value: 'profanity', text: 'Profanity' }), h('option', { value: 'slur', text: 'Slur' }));
    const list = (k) => h('p', { class: 'small' }, terms.filter((x) => x.kind === k).map((x) => h('span', { class: 'term-chip' }, x.term,
      h('button', { class: 'quiet small-btn', title: 'Remove', onclick: action(async () => {
        await q(sb.from('language_terms').delete().eq('term', x.term)); await draw();
      }, msg) }, '×'))));
    box.replaceChildren(
      h('h2', { text: 'Language filter' }),
      h('p', { class: 'muted small', text: 'A finding cannot go to review or be published with these words in its own text. Inside a source quote the AI verified, they are allowed (quoting someone is context), and the reviewer sees a note. Commons posts are never blocked: the author gets a warning and moderators see a flag. A word ending in * also catches longer words that start with it.' }),
      h('details', {}, h('summary', { text: `Profanity (${terms.filter((x) => x.kind === 'profanity').length})` }), list('profanity')),
      h('details', {}, h('summary', { text: `Slurs (${terms.filter((x) => x.kind === 'slur').length})` }), list('slur')),
      h('form', { class: 'row', onsubmit: action(async () => {
        await q(sb.from('language_terms').insert({ term: term.value.trim().toLowerCase(), kind: kind.value })); await draw();
      }, msg) }, term, kind, h('button', { class: 'primary' }, 'Add word')));
  };
  draw().catch((e) => box.replaceChildren(notice(friendly(e))));
  return box;
}

function aiPanel(msg) {
  const box = h('div', { class: 'panel' }, h('p', { class: 'muted', text: 'Loading…' }));
  const draw = async () => {
    const [keys, status] = await Promise.all([q(sb.rpc('list_checker_keys')), q(sb.rpc('checker_status'))]);
    const fresh = h('div');
    box.replaceChildren(
      h('h2', { text: 'AI fact-checker' }),
      h('p', { class: 'muted small', text: 'The AI checks each finding before review. It runs on our own computer, and signs in with a checker key that can only take checks and hand back results.' }),
      h('p', {}, h('span', { class: `tag ${status && status.online ? 'ok' : 'bad'}`, text: status && status.online ? 'online' : 'offline' }),
        h('span', { class: 'meta', text: ` last seen ${status && status.last_seen_at ? when(status.last_seen_at) : 'never'} · ${status ? status.queued : 0} waiting` })),
      keys.length ? h('ul', { class: 'list' }, keys.map((k) => h('li', {},
        h('div', { class: 'row' }, h('span', { text: `${k.label} · made ${day(k.created_at)}` }),
          k.revoked_at ? h('span', { class: 'tag bad', text: 'revoked' }) : h('span', { class: 'meta', text: k.last_seen_at ? `seen ${when(k.last_seen_at)}` : 'never used' })),
        k.revoked_at ? null : h('div', { class: 'btns' }, h('button', { class: 'quiet danger', onclick: action(async () => {
          if (!confirm('Revoke this key? The AI stops checking until its computer gets a new one.')) return;
          await q(sb.rpc('revoke_checker_key', { key_id: k.id }));
          await draw();
        }, msg) }, 'Revoke'))))) : null,
      h('div', { class: 'btns' }, h('button', { onclick: action(async () => {
        const key = await q(sb.rpc('create_checker_key', { label: 'AI checker' }));
        fresh.replaceChildren(notice('Copy this key now and paste it into the installer on the AI computer when it asks. It is shown only once.', 'ok'),
          h('div', { class: 'code', text: key }),
          h('div', { class: 'btns' }, h('button', { type: 'button', onclick: () => navigator.clipboard.writeText(key) }, 'Copy')));
        await draw().then(() => box.append(fresh));
      }, msg) }, keys.some((k) => !k.revoked_at) ? 'Make a new key' : 'Make a key for the AI checker')),
      fresh);
  };
  draw().catch((err) => box.replaceChildren(notice(friendly(err))));
  return box;
}

const PRIMARY_HINT = 'Primary = the original record itself: a court record, official data, a statute or government document, an original study. '
  + 'Secondary = news, encyclopedias (Wikipedia), books and articles about those records. A finding needs at least one primary source.';
function typeSelect(val) {
  return h('select', {}, h('option', { value: 'secondary', text: 'Secondary (news, encyclopedia, book, article)', selected: val !== 'primary' || null }),
    h('option', { value: 'primary', text: 'Primary (court record, official data, statute, government document, original study)', selected: val === 'primary' || null }));
}
const pageKey = (u) => (u || '').trim().toLowerCase().replace(/#.*$/, '').replace(/\/+$/, '');
// rows that link the same page are one source card, in the order they were first added
function groupSources(rows) {
  const by = new Map();
  rows.forEach((r) => { const k = pageKey(r.url); if (!by.has(k)) by.set(k, []); by.get(k).push(r); });
  return [...by.values()];
}

// One source = one card: the page (title, link, type, publisher, date, snapshots) and its quotes.
function sourceCard(rows, n, snaps, o = {}) {
  const s = rows[0];
  const ed = o.editable;
  const rpcEdit = (row, vals) => q(sb.rpc('edit_source', { source_id: row.id, url: vals.url, title: vals.title, publisher: vals.publisher,
    published_at_claimed: vals.published_at_claimed, quote: vals.quote, locator: vals.locator, source_type: vals.source_type }));
  const fields = (row) => ({ url: row.url, title: srcTitle(row), publisher: clean(row.publisher), published_at_claimed: row.published_at_claimed,
    quote: clean(row.quote), locator: clean(row.locator), source_type: row.source_type });
  const card = h('div', { class: 'source-card' });
  const draw = () => card.replaceChildren(
    h('div', { class: 'row' },
      h('div', {}, h('span', { class: 'meta', text: `${n}. ` }),
        h('a', { href: s.url, rel: 'noopener noreferrer nofollow', target: '_blank', text: srcTitle(s) }), ' ',
        h('span', { class: `tag ${s.source_type === 'primary' ? 'ok' : ''}`, text: s.source_type === 'primary' ? 'primary' : 'secondary' })),
      ed ? h('span', {},
        h('button', { class: 'quiet small-btn', onclick: () => card.replaceChildren(pageForm(s, async (vals) => {
          for (const r of rows) await rpcEdit(r, { ...fields(r), ...vals });
          await o.reload();
        }, draw)) }, 'Edit source'),
        h('button', { class: 'quiet small-btn', onclick: action(async () => {
          if (!confirm(`Remove "${srcTitle(s)}" and its ${rows.length} quote${rows.length === 1 ? '' : 's'} from this draft?`)) return;
          for (const r of rows) await q(sb.rpc('withdraw_source', { source_id: r.id }));
          await o.reload();
        }, o.msg) }, 'Remove source')) : null),
    h('div', { class: 'meta', text: [clean(s.publisher), s.published_at_claimed ? `dated ${s.published_at_claimed}` : null, `retrieved ${day(s.retrieved_at)}`].filter(Boolean).join(' · ') }),
    snaps ? snapLine(rows, snaps) : null,
    h('ul', { class: 'quotes' }, rows.map((r, qi) => {
      const fake = o.fakeIds && o.fakeIds.has(r.id);
      const li = h('li', {});
      const drawQ = () => li.replaceChildren(
        clean(r.quote) ? h('blockquote', { text: clean(r.quote) }) : h('p', { class: 'muted small', text: 'No quote given.' }),
        h('div', { class: 'small' }, clean(r.locator) ? h('span', { class: 'meta', text: clean(r.locator) }) : null,
          fake ? [' ', h('span', { class: 'tag bad', text: 'quote not on page' })] : null,
          strongWords(clean(r.quote) || '', TERMS).length ? [' ', h('span', { class: 'tag warn', text: 'quoted strong language' })] : null,
          ed ? [' ', h('button', { class: 'quiet small-btn', onclick: () => li.replaceChildren(quoteForm(r, async (vals) => {
            await rpcEdit(r, { ...fields(r), ...vals }); await o.reload();
          }, drawQ)) }, 'Edit quote'),
          rows.length > 1 ? h('button', { class: 'quiet small-btn', onclick: action(async () => {
            if (!confirm('Remove this quote?')) return;
            await q(sb.rpc('withdraw_source', { source_id: r.id })); await o.reload();
          }, o.msg) }, 'Remove quote') : null] : null));
      drawQ();
      return li;
    })),
    ed ? h('details', { class: 'add-quote' }, h('summary', { text: 'Add another quote from this source' }),
      quoteForm({}, async (vals) => {
        await q(sb.from('research_sources').insert({ version_id: s.version_id, url: s.url, title: srcTitle(s), source_type: s.source_type,
          publisher: clean(s.publisher), published_at_claimed: s.published_at_claimed, quote: clean(vals.quote), locator: clean(vals.locator) }));
        await o.reload();
      }, null, 'Add quote')) : null);
  draw();
  return card;
}

// Edit the page itself: link, title, type, publisher, date (saved as replacements; old copies stay on record).
function pageForm(s, save, cancel) {
  const f = (tag, attrs, val) => { const el = h(tag, attrs); el.value = val || ''; return el; };
  const url = f('input', { type: 'url', required: true }, s.url);
  const title = f('input', { required: true, maxlength: 500 }, srcTitle(s));
  const type = typeSelect(s.source_type);
  const pub = f('input', { maxlength: 200 }, s.publisher);
  const date = f('input', { type: 'date', min: '1400-01-01', max: new Date(Date.now() + 864e5).toISOString().slice(0, 10) }, s.published_at_claimed);
  const err = h('div');
  return h('form', { class: 'source-edit page-edit', onsubmit: action(() => save({ url: url.value, title: title.value, source_type: type.value,
      publisher: clean(pub.value), published_at_claimed: date.value || null }), err) },
    h('label', {}, 'Link', url), h('label', {}, 'Title', title), h('label', {}, 'Type of source', type), h('p', { class: 'muted small', text: PRIMARY_HINT }),
    h('label', {}, 'Publisher', pub), h('label', {}, 'Date the publisher gives', date),
    err, h('div', { class: 'btns' }, h('button', { class: 'primary' }, 'Save source'), h('button', { type: 'button', onclick: cancel }, 'Cancel')));
}

function quoteForm(r, save, cancel, label) {
  const quote = h('textarea', { maxlength: 5000, rows: 3, required: true, placeholder: 'Exact words, copied from the page' });
  quote.value = clean(r.quote) || '';
  const loc = h('input', { maxlength: 200, placeholder: 'section, page, paragraph or timestamp' });
  loc.value = clean(r.locator) || '';
  const err = h('div');
  return h('form', { class: 'source-edit', onsubmit: action(() => save({ quote: clean(quote.value), locator: clean(loc.value) }), err) },
    h('label', {}, 'Quote (exact words from the page)', quote), h('label', {}, 'Where in the source', loc),
    err, h('div', { class: 'btns' }, h('button', { class: 'primary' }, label || 'Save quote'),
      cancel ? h('button', { type: 'button', onclick: cancel }, 'Cancel') : null));
}

// "Snapped": the public Wayback copy, and the private screenshot and page text (desk members only).
function snapLine(rows, snaps) {
  const ids = new Set((Array.isArray(rows) ? rows : [rows]).map((r) => r.id));
  const wb = snaps.find((x) => ids.has(x.source_id) && x.kind === 'wayback');
  const pv = snaps.find((x) => ids.has(x.source_id) && x.kind === 'private');
  if (!wb && !pv) return h('div', { class: 'snaps' }, h('span', { class: 'tag', text: 'not snapped yet' }));
  const open = (path, label) => h('a', { href: '#', onclick: async (ev) => {
    ev.preventDefault();
    const w = window.open('', '_blank');
    try {
      const { data, error } = await sb.storage.from('source-snapshots').createSignedUrl(path, 120);
      if (error) throw error;
      if (w) { w.opener = null; w.location = data.signedUrl; }
    } catch (err) { if (w) w.close(); alert(friendly(err)); }
  }, text: label });
  const fp = (sha, bytes) => `SHA-256 ${sha.slice(0, 12)}… · ${(bytes / 1024).toFixed(0)} KB`;
  return h('div', { class: 'snaps' },
    h('span', { class: 'tag ok', text: 'snapped' }), ' ',
    wb ? [h('a', { href: wb.archive_url, rel: 'noopener noreferrer', target: '_blank', text: 'Wayback copy' }),
      h('span', { class: 'meta', title: fp(wb.sha256, wb.bytes), text: ` ${day(wb.captured_at)}` })] : null,
    wb && pv ? ' · ' : null,
    pv ? [...(pv.shot_path ? [open(pv.shot_path, 'Screenshot'), ' · '] : []), open(pv.text_path, 'Page text'),
      h('span', { class: 'meta', title: fp(pv.text_sha256, pv.text_bytes), text: ` private copy ${day(pv.captured_at)}` })] : null);
}

// ---------------------------------------------------------------- admin

// ---------------------------------------------------------------- invitations

const inviteLink = (code) => `${APP_URL}?invite=${encodeURIComponent(code)}`;
function inviteLetter({ code, who, to, uses = 1, days = 14 }) {
  return [
    who ? `Hi ${who},` : 'Hi,', '',
    `${state.me ? state.me.display_name : 'A member'} invited you to The Way (Michi Institute).`, '',
    `1. Open this link: ${inviteLink(code)}`,
    `2. Enter ${to ? `your email (${to})` : 'your own email'} and tap "Send my sign-in link".`,
    '3. Open the email from Michi Institute in the same browser and click the link (or type its 6-digit code).',
    '4. Pick the name other members will see, then choose a password.', '',
    `If the link loses your invitation code, it is: ${code}`,
    `It works ${+uses === 1 ? 'once' : `${uses} times`} and expires in ${days} days.`,
  ].join('\n');
}
function copyButton(label, text, area) {
  return h('button', { type: 'button', onclick: async (ev) => {
    const b = ev.currentTarget;
    try { await navigator.clipboard.writeText(text); b.textContent = 'Copied'; }
    catch { if (area) { area.focus(); area.select(); } b.textContent = 'Selected: press Ctrl+C (or Cmd+C)'; }
    setTimeout(() => { b.textContent = label; }, 2500);
  } }, label);
}
function letterBox(letter) {
  const box = h('textarea', { class: 'invite-letter', rows: 12, readonly: true, 'aria-label': 'Invitation message' });
  box.value = letter;
  return box;
}
function inviteStatus(i) {
  return i.revoked_at ? h('span', { class: 'tag bad', text: 'revoked' })
    : i.use_count >= i.max_uses ? h('span', { class: 'tag ok', text: 'used' })
    : new Date(i.expires_at) < new Date() ? h('span', { class: 'tag', text: 'expired' })
    : h('span', { class: 'tag warn', text: i.max_uses > 1 ? `open ${i.use_count}/${i.max_uses}` : 'open' });
}
const isOpen = (i) => !i.revoked_at && i.use_count < i.max_uses && new Date(i.expires_at) > new Date();

// Role invitations (migration 0019): a code that gives submitter (researcher) or reviewer access.
// Reviewers and admins make submitter codes; only admins make reviewer codes. Single use, 14 days.
function roleInvitePanel() {
  const msg = h('div'), out = h('div');
  const role = h('select', { id: 'role-invite-role' },
    h('option', { value: 'researcher', text: 'Submitter: can add and send sources' }),
    can('admin') ? h('option', { value: 'reviewer', text: 'Deshi (student, reviewer): can check sources and publish' }) : null);
  const note = h('input', { id: 'role-invite-note', maxlength: 200, placeholder: 'Who is it for? Only you see this' });
  const email = h('input', { id: 'role-invite-email', type: 'email', placeholder: 'Optional: lock it to their email', autocomplete: 'off' });
  return h('div', { class: 'panel' },
    h('h2', { text: 'Give someone a role' }),
    h('p', { class: 'muted small', text: 'Anyone can join The Way. This code gives one person Submitter or Deshi (student, reviewer) access. A Deshi checks and publishes work. It works once and lasts 14 days. The role grant is recorded in the moderation log with your name.' }),
    msg,
    h('form', { onsubmit: action(async () => {
      const code = await q(sb.rpc('create_role_invite', { p_role: role.value, p_note: note.value.trim() || null, p_email: email.value.trim() || null }));
      const link = inviteLink(code);
      out.replaceChildren(notice('Your role invitation is ready. Copy it now: it is shown only once.', 'ok'),
        h('div', { class: 'code', text: link }), h('div', { class: 'btns' }, copyButton('Copy link', link, null)));
      note.value = ''; email.value = '';
    }, msg) },
      h('label', { for: 'role-invite-role' }, 'Role', role),
      h('label', { for: 'role-invite-note' }, 'Who is it for?', note),
      h('label', { for: 'role-invite-email' }, 'Their email (optional)', email),
      h('div', { class: 'btns' }, h('button', { class: 'primary' }, 'Create role invitation'))),
    out);
}

// Any member: make a single-use share link (the database caps members at 5 open, 20 a day; admins are not capped).
async function inviteView() {
  const mod = can('moderator');
  const [mine, names] = await Promise.all([
    q(sb.from('invitations').select('*').eq('created_by', state.user.id).order('id', { ascending: false }).limit(50)),
    q(sb.from('members').select('id,display_name')),
  ]);
  const nameOf = (id) => (names.find((m) => m.id === id) || {}).display_name || 'a member';
  const msg = h('div');
  const note = h('input', { id: 'invite-note', maxlength: 200, placeholder: 'Who is it for? Only you see this' });
  const email = h('input', { id: 'invite-email', type: 'email', placeholder: 'Optional: their email', autocomplete: 'off' });
  const fresh = h('div');
  const human = humanCheck();

  const row = (i, withCreator) => h('li', {},
    h('div', { class: 'row' }, h('span', { text: i.note || '(no note)' }), inviteStatus(i)),
    h('div', { class: 'meta', text: [withCreator ? `by ${nameOf(i.created_by)}` : null, `made ${day(i.created_at)}`,
      i.recipient_email ? `for ${i.recipient_email}` : null, `expires ${day(i.expires_at)}`].filter(Boolean).join(' · ') }),
    isOpen(i) ? h('div', { class: 'btns' }, h('button', { class: 'quiet danger', onclick: action(async () => {
      let reason = 'not needed';
      if (i.created_by !== state.user.id) { reason = await ask(`Revoke ${nameOf(i.created_by)}'s link: why? (shown in the moderation log)`); if (!reason) return; }
      else if (!confirm('Revoke this link? Nobody will be able to use it.')) return;
      await q(sb.rpc('revoke_invitation', { invitation_id: i.id, reason }));
      await inviteView();
    }, msg) }, 'Revoke')) : null);

  const all = mod ? await q(sb.from('invitations').select('*').order('id', { ascending: false }).limit(200)) : [];
  render(
    h('p', { class: 'overline' }, h('a', { href: '#/', text: 'Home' })),
    h('h1', { text: 'Invite someone to The Way' }),
    h('p', { class: 'lede', text: 'Email an invitation to one person, or make a link and send it yourself. Each link works once and lasts 14 days.' }),
    msg,
    h('div', { class: 'panel' },
      h('form', { onsubmit: action(async (ev) => {
        const sendIt = !!(ev.submitter && ev.submitter.value === 'send');
        const to = email.value.trim();
        if (sendIt && !to) { email.focus(); throw new Error('Type their email first, or use "Create share link" and send it yourself.'); }
        if (sendIt && !email.reportValidity()) return;
        const who = note.value.trim();
        const code = await q(sb.rpc('create_share_link', { note: who || null, recipient_email: to || null }));
        const link = inviteLink(code);
        const letter = inviteLetter({ code, who, to });
        const box = letterBox(letter);
        const sent = h('div');
        const resend = h('button', { type: 'button', hidden: true }, 'Send the email again');
        const mail = async () => {
          resend.hidden = true;
          sent.replaceChildren(notice(`Sending the invitation to ${to}…`, 'ok'));
          // Same path as the admin form: the sign-in email doubles as the invitation. Its link signs
          // them in and lands on ?invite=CODE, which fills in the code. Your own session is untouched.
          let captchaToken;
          try { captchaToken = await human.token(); } catch (err) { sent.replaceChildren(notice(`The link was made, but the email did not go out: ${err.message}`)); resend.hidden = false; return; }
          const { error } = await sb.auth.signInWithOtp({ email: to, options: { shouldCreateUser: true, emailRedirectTo: link, captchaToken } });
          if (!error) { sent.replaceChildren(notice(`Invitation emailed to ${to}. The link in it signs them in with the code already filled in.`, 'ok')); return; }
          const text = error.message || String(error);
          const wait = text.match(/after (\d+) seconds?/i);
          let why = `The link was made, but the email did not go out: ${text}`;
          if (wait) why = `The link was made, but only one email per address per minute can go out. Wait ${wait[1]} seconds, then press "Send the email again".`;
          else if (/rate limit|too many|429/i.test(text)) why = 'The link was made, but the hourly email limit is used up. Try "Send the email again" later, or copy the message below and send it yourself.';
          else if (/redirect/i.test(text)) why = 'The link was made, but Supabase refused the link address. Copy the message below and send it yourself.';
          sent.replaceChildren(notice(why));
          resend.hidden = false;
        };
        resend.onclick = action(mail, sent);
        fresh.replaceChildren(sent, h('div', { class: 'btns' }, resend),
          notice('Your link is ready. Copy it now: it is shown only once.', 'ok'),
          h('div', { class: 'code', text: link }),
          h('div', { class: 'btns' }, copyButton('Copy link', link, null), copyButton('Copy message', letter, box)),
          h('p', { class: 'small muted', text: sendIt ? 'Backup: the same invitation as a message you can send yourself.' : 'Or send this ready-made message by text or email.' }),
          box);
        note.value = ''; email.value = '';
        if (sendIt) await mail();
        refreshMine();
      }, msg) },
        h('label', { for: 'invite-note' }, 'Who is it for?', note),
        h('label', { for: 'invite-email' }, 'Their email (needed to send it; the link then works only for that address)', email),
        human.el,
        h('div', { class: 'btns' }, h('button', { class: 'primary', value: 'send' }, 'Send by email'),
          h('button', { value: 'link' }, 'Create share link only')),
        h('p', { class: 'small dim', text: can('admin') ? 'As an admin you have no limit on share links.' : 'You can have 5 open links at a time and make 20 a day.' })),
      fresh),
    can('reviewer') ? roleInvitePanel() : null,
    h('h2', { text: 'Your links' }),
    h('ul', { class: 'list panel', id: 'my-invites' }),
    h('p', { class: 'small muted', text: 'A link drops off this list once it is used. The Way does not keep who joined through whom.' }),
    mod ? [h('h2', { text: 'Every open link (moderators)' }),
      h('ul', { class: 'list panel' }, all.filter(isOpen).length ? all.filter(isOpen).map((i) => row(i, true)) : [h('li', { class: 'muted', text: 'No open links.' })])] : null,
  );
  drawMine(mine);
  async function refreshMine() { drawMine(await q(sb.from('invitations').select('*').eq('created_by', state.user.id).order('id', { ascending: false }).limit(50))); }
  function drawMine(list) {
    document.getElementById('my-invites').replaceChildren(...(list.length ? list.map((i) => row(i, false))
      : [h('li', { class: 'muted', text: 'No links yet.' })]));
  }
}

// ---------------------------------------------------------------- private research
// Every member gets a private notebook (table private_research, owner-only). Super admins also see the
// team's own research files from the private bucket team-research (index.json lists them).

const isSuper = () => state.roles.has('super_admin');
const kb = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

// Plain-text view of a note or file: headings, bullets and paragraphs, all through textContent.
function textBlocks(text) {
  const out = []; let para = [];
  const flush = () => { if (para.length) { out.push(h('p', { text: para.join(' ') })); para = []; } };
  for (const raw of String(text).split('\n')) {
    const line = raw.trimEnd();
    const hd = line.match(/^(#{1,4})\s+(.*)$/);
    if (!line.trim()) flush();
    else if (hd) { flush(); out.push(h(hd[1].length === 1 ? 'h2' : 'h3', { text: hd[2] })); }
    else if (/^\s*[-*]\s+/.test(line)) { flush(); out.push(h('p', { class: 'small', text: '• ' + line.replace(/^\s*[-*]\s+/, '') })); }
    else para.push(line.trim());
  }
  flush();
  return out;
}

const TEAM_TYPES = { md: 'text/markdown', txt: 'text/plain', json: 'application/json', csv: 'text/csv', pdf: 'application/pdf' };
// Super admins pick the prepared folder (it holds index.json); each file is added or replaced, index.json last.
function teamUploadForm() {
  const input = h('input', { type: 'file', multiple: true, webkitdirectory: true });
  const out = h('div');
  return h('div', { class: 'panel' }, h('h3', { text: 'Upload folder' }),
    h('p', { class: 'small dim', text: 'Pick the prepared team-research-upload folder. Files with the same name are replaced.' }), input, out,
    h('div', { class: 'btns' }, h('button', { class: 'primary', type: 'button', text: 'Upload', onclick: action(async () => {
      const files = [...input.files].map((f) => {
        const parts = (f.webkitRelativePath || f.name).split('/'); if (parts.length > 1) parts.shift();
        return { f, path: parts.join('/'), type: TEAM_TYPES[(parts[parts.length - 1].split('.').pop() || '').toLowerCase()] };
      }).filter((x) => x.type && !/(^|\/)\.\.?(\/|$)/.test(x.path));
      if (!files.length) throw new Error('Pick the folder first.');
      files.sort((a, b) => (a.path === 'index.json') - (b.path === 'index.json'));
      for (let i = 0; i < files.length; i++) {
        out.replaceChildren(h('p', { class: 'small', text: `Uploading ${i + 1} of ${files.length}` }));
        await q(sb.storage.from('team-research').upload(files[i].path, files[i].f, { upsert: true, contentType: files[i].type }));
      }
      await privateResearchView();
    }, out) })));
}

async function privateResearchView() {
  const mine = await q(sb.from('private_research').select('id,title,visibility,updated_at,origin,verified').eq('owner_id', state.user.id).order('updated_at', { ascending: false }));
  const desk = can('researcher') || can('reviewer') || can('moderator');
  const shared = desk ? await q(sb.from('private_research').select('id,title,owner_id,shared_at').eq('visibility', 'shared').neq('owner_id', state.user.id).order('shared_at', { ascending: false }).limit(100)) : [];
  let team = [], teamErr = null;
  if (isSuper()) {
    const { data, error } = await sb.storage.from('team-research').download('index.json');
    if (error) {   // a folder with only research-todo.json has no index.json: not an error
      const have = await sb.storage.from('team-research').list('');
      if (!(have.data || []).some((f) => f.name === 'research-todo.json')) teamErr = 'The team research is not uploaded yet.';
    }
    else { try { team = JSON.parse(await data.text()); } catch { teamErr = 'The team research index could not be read.'; } }
  }
  const title = h('input', { maxlength: 200, required: true, placeholder: 'Title' });
  const slot = h('div');
  const groups = [...new Set(team.map((f) => f.group))].sort();
  render(
    h('h1', { text: 'Private research' }),
    h('p', { class: 'lede', text: 'Your notes, kept private by default. Only you can read them, not moderators or admins. Share one when you are ready and the research desk can review it.' }),
    slot,
    h('form', { class: 'panel', onsubmit: action(async () => {
      const t = title.value.trim(); if (!t) return;
      const row = (await q(sb.from('private_research').insert({ owner_id: state.user.id, title: t }).select('id')))[0];
      location.hash = `#/private/${row.id}`;
    }, slot) }, h('h2', { text: 'New note' }), title, h('div', { class: 'btns' }, h('button', { class: 'primary', type: 'submit', text: 'Create' }))),
    h('h2', { text: 'Your notes' }),
    h('ul', { class: 'list panel' }, mine.length ? mine.map((n) => (n.origin ? savedNoteRow(n) : h('li', {},
      h('div', { class: 'row' }, h('a', { href: `#/private/${n.id}`, text: n.title }),
        h('span', {}, h('span', { class: 'tag', text: n.visibility === 'shared' ? 'shared' : 'private' }), ' ', h('span', { class: 'meta', text: day(n.updated_at) })))))) : [h('li', { class: 'muted', text: 'Nothing yet.' })]),
    desk ? [h('h2', { text: 'Shared with the research desk' }),
      h('ul', { class: 'list panel' }, shared.length ? shared.map((n) => h('li', {}, h('div', { class: 'row' }, h('a', { href: `#/private/${n.id}`, text: n.title }), h('span', { class: 'meta', text: day(n.shared_at) })))) : [h('li', { class: 'muted', text: 'Nothing shared yet.' })])] : null,
    isSuper() ? [h('h2', { text: 'Team research (super admins only)' }),
      teamErr ? h('p', { class: 'muted', text: teamErr }) : null,
      teamUploadForm(),
      groups.map((g) => h('div', { class: 'panel' }, h('h3', { text: g }),
        h('ul', { class: 'list' }, team.filter((f) => f.group === g).map((f) => h('li', {},
          h('div', { class: 'row' }, h('a', { href: `#/private/team/${encodeURIComponent(f.path)}`, text: f.title }), h('span', { class: 'meta', text: kb(f.size || 0) })))))))] : null);
}


// Notes saved from Pull a Thread or elsewhere carry their sources and a "not verified yet" flag until the member has checked every source.
const noteFlag = (n) => h('span', { class: `tag ${n.verified ? '' : 'warn'}`, text: n.verified ? 'checked' : 'not verified yet' });
// In the list a saved note is an accordion: the headline shows, and it opens to the details and sources.
function savedNoteRow(n) {
  const inner = h('div', { class: 'small' }, h('p', { class: 'muted', text: 'Loading…' }));
  let loaded = false;
  const det = h('details', { class: 'saved-note' },
    h('summary', {}, h('b', { text: n.title }), ' ', noteFlag(n), ' ', h('span', { class: 'meta', text: day(n.updated_at) })), inner);
  det.addEventListener('toggle', async () => {
    if (!det.open || loaded) return; loaded = true;
    try {
      const r = (await q(sb.from('private_research').select('body,sources').eq('id', n.id)))[0] || { body: '', sources: [] };
      inner.replaceChildren(...textBlocks(r.body), sourceLinks(r.sources), h('p', {}, h('a', { href: `#/private/${n.id}`, text: n.verified ? 'Open the note' : 'Open the note to check the sources' })));
    } catch { loaded = false; inner.replaceChildren(h('p', { class: 'muted', text: 'Could not load this note.' })); }
  });
  return h('li', {}, det);
}
function sourceLinks(list) {
  const src = Array.isArray(list) ? list : [];
  return src.length ? h('ul', { class: 'small' }, src.map((x) => h('li', {}, h('a', { href: x.url, target: '_blank', rel: 'noopener noreferrer nofollow', text: x.title || x.url }),
    x.checked ? ` (${x.verdict === 'not_confirmed' ? 'checked: did not back it up' : 'checked'})` : ' (not checked yet)'))) : h('p', { class: 'small dim', text: 'No sources were kept with this note.' });
}
// Check each source yourself. A check can also be sent to the reviewers: the link, your verdict and your reason, never your name or your note.
function sourceChecker(n, redraw, slot) {
  const src = Array.isArray(n.sources) ? n.sources : [];
  if (!src.length) return null;
  const rows = src.map((x, i) => {
    if (x.checked) return h('li', {}, h('a', { href: x.url, target: '_blank', rel: 'noopener noreferrer nofollow', text: x.title || x.url }),
      h('span', { class: 'small dim', text: x.verdict === 'not_confirmed' ? ' You checked it: it did not back the note up.' : ' You checked it.' }));
    const verdict = h('select', { 'aria-label': 'What you found' }, h('option', { value: 'confirmed', text: 'It backs this up' }), h('option', { value: 'not_confirmed', text: 'It does not back this up' }));
    const reason = h('input', { maxlength: 300, placeholder: 'What did you check? (5 or more characters)', 'aria-label': 'What you checked' });
    const share = h('input', { type: 'checkbox', checked: true });
    return h('li', {}, h('a', { href: x.url, target: '_blank', rel: 'noopener noreferrer nofollow', text: x.title || x.url }),
      h('div', { class: 'row' }, verdict, reason),
      h('label', { class: 'small' }, share, ' Also send this check to the reviewers (the link, your answer and your reason; not your name, not your note)'),
      h('button', { type: 'button', class: 'quiet', text: 'Mark checked', onclick: action(async () => {
        const why = reason.value.trim();
        if (why.length < 5) throw new Error('Say what you checked, in at least 5 characters.');
        if (share.checked) await q(sb.rpc('submit_source_check', { p_url: x.url, p_title: x.title || '', p_verdict: verdict.value, p_reason: why }));
        const next = src.map((y, j) => (j === i ? { ...y, checked: true, verdict: verdict.value } : y));
        const ok = next.every((y) => y.checked && y.verdict !== 'not_confirmed');
        await q(sb.from('private_research').update({ sources: next, verified: ok }).eq('id', n.id));
        if (window.WayBallot && n.ballot_state) {      // keep the line on this device's ballot in step
          try { const d = window.WayBallot.read(n.ballot_state), f = d.facts[window.WayBallot.factId('thread-note', String(n.id))]; if (f) { f.flag = ok ? 'checked' : 'unverified'; window.WayBallot.write(window.WayBallot.clean(d, n.ballot_state)); } } catch { /* ballot is optional */ }
        }
        await redraw();
      }, slot) }));
  });
  return h('div', { class: 'panel' }, h('h2', { text: 'Sources' }), noteFlag(n),
    h('p', { class: 'small dim', text: n.verified ? 'You checked every source.' : 'Open each source, read it, and mark it checked. Until then this note is flagged as not verified.' }),
    h('ul', { class: 'list' }, rows));
}

async function privateNoteView(id) {
  const rows = await q(sb.from('private_research').select('*').eq('id', id));
  if (!rows.length) return render(notice('That note was not found, or it is private to someone else.'));
  const n = rows[0], own = n.owner_id === state.user.id, slot = h('div');
  const title = h('input', { maxlength: 200, required: true, value: n.title });
  const body = h('textarea', { maxlength: 100000, rows: 22 }); body.value = n.body;
  const save = (patch, then) => action(async () => { await q(sb.from('private_research').update(patch()).eq('id', id)); await then(); }, slot);
  if (!own) return render(h('p', {}, h('a', { href: '#/private', text: '← Private research' })), h('h1', { text: n.title }), h('span', { class: 'tag', text: 'shared with the research desk' }), textBlocks(n.body));
  render(
    h('p', {}, h('a', { href: '#/private', text: '← Private research' })),
    h('h1', { text: 'Your note' }), slot,
    n.origin ? sourceChecker(n, () => privateNoteView(id), slot) : null,
    n.ballot_key ? h('p', { class: 'small dim', text: `On your ballot (${n.ballot_state}), printing ${n.print_mode === 'full' ? 'the full details' : 'the headline only'}. Change that in My Ballot.` }) : null,
    h('form', { class: 'panel', onsubmit: save(() => ({ title: title.value.trim(), body: body.value }), async () => { slot.replaceChildren(notice('Saved.', 'ok')); }) },
      title, body,
      h('div', { class: 'btns' }, h('button', { class: 'primary', type: 'submit', text: 'Save' }),
        n.visibility === 'shared'
          ? h('button', { type: 'button', class: 'quiet', text: 'Make private again', onclick: save(() => ({ title: title.value.trim(), body: body.value, visibility: 'private' }), privateResearchView) })
          : h('button', { type: 'button', class: 'quiet', text: 'Share with the research desk', onclick: save(() => ({ title: title.value.trim(), body: body.value, visibility: 'shared' }), privateResearchView) }),
        h('button', { type: 'button', class: 'quiet', text: 'Delete', onclick: action(async () => {
          if (!confirm('Delete this note for good?')) return;
          await q(sb.from('private_research').delete().eq('id', id)); location.hash = '#/private';
        }, slot) })),
      h('p', { class: 'small dim', text: n.visibility === 'shared' ? 'Shared: members on the research desk can read this note. You can make it private again at any time.' : 'Private: only you can read this note.' })));
}

async function teamFileView(path) {
  if (!isSuper()) return render(notice('Super admins only.'));
  const { data, error } = await sb.storage.from('team-research').download(path);
  if (error) throw error;
  const text = await data.text();
  let shown;
  if (/\.json$/i.test(path)) { let pretty = text; try { pretty = JSON.stringify(JSON.parse(text), null, 2); } catch { /* show as is */ } shown = h('pre', { class: 'panel', text: pretty }); }
  else if (/\.(md|txt)$/i.test(path)) shown = h('div', { class: 'panel' }, textBlocks(text));
  else shown = h('pre', { class: 'panel', text });
  render(h('p', {}, h('a', { href: '#/private', text: '← Private research' })), h('h1', { text: path.split('/').pop() }), h('span', { class: 'tag', text: 'team research, super admins only' }), shown);
}

async function adminView() {
  const [invites, members, roles, notify] = await Promise.all([
    q(sb.from('invitations').select('*').order('id', { ascending: false }).limit(100)),
    q(sb.from('members').select('*').order('joined_at')),
    q(sb.from('member_roles').select('*')),
    q(sb.from('notify_signups').select('id,email,source,created_at').order('created_at', { ascending: false }).limit(1000)),
  ]);
  const msg = h('div');
  const note = h('input', { maxlength: 200, placeholder: 'Who is this for? (only you and moderators see this)' });
  const email = h('input', { type: 'email', placeholder: 'name@example.org', autocomplete: 'off' });
  const uses = h('input', { type: 'number', min: 1, max: 100, value: 1 });
  const days = h('input', { type: 'number', min: 1, max: 90, value: 14 });
  const fresh = h('div');
  const adminHuman = humanCheck();


  const rolesOf = (id) => roles.filter((r) => r.member_id === id).map((r) => r.role);
  const nameOf = (id) => (members.find((m) => m.id === id) || {}).display_name || (id ? 'a former member' : 'setup');
  const ALL = ['moderator', 'researcher', 'reviewer', 'editor', 'admin'];

  const AT = window.TheWayAdminTools;
  let nSec = 0;
  const sec = (id, title, ...nodes) => AT.section(id, title, nodes, { open: nSec++ === 0 });
  const memberBar = AT.filterBar({ placeholder: 'Filter members by name', facets: [
    { key: 'status', label: 'Status', options: [['active', 'Active'], ['suspended', 'Suspended']] },
    { key: 'role', label: 'Role', options: [['none', 'No role'], ...ALL.map((r) => [r, roleName(r)])] }] });
  const inviteBar = AT.filterBar({ placeholder: 'Filter invitations by note, email or number', facets: [
    { key: 'state', label: 'Status', options: [['open', 'Open'], ['used', 'Used'], ['expired', 'Expired'], ['revoked', 'Revoked']] }] });
  const notifySources = [...new Set(notify.map((n) => n.source).filter(Boolean))].sort();
  const notifyBar = AT.filterBar({ placeholder: 'Filter notify list by email', facets: [
    { key: 'source', label: 'Source', options: notifySources.map((x) => [x, x]) }] });
  render(
    h('h1', { text: 'Admin' }), msg,
    state.roles.has('super_admin') && STATS ? sec('analytics', 'Site analytics and SEO', STATS.panel()) : null,
    can('admin') && LEDGER ? sec('ledger', 'Ledger checks', LEDGER.panel()) : null,
    can('admin') && CSTAT ? sec('review-status', 'Review status of AI-written pages', CSTAT.panel()) : null,
    state.roles.has('super_admin') && TODO ? sec('todo', 'Research to-do', h('div', { class: 'panel' }, h('p', { class: 'muted small', text: 'Every research list in one place, highest priority first. Super admins only.' }), h('a', { class: 'button primary', href: '#/todo', text: 'Open the research to-do' }))) : null,
    sec('invite', 'Invite someone to The Way', h('div', { class: 'panel' },
      h('p', { class: 'muted', text: 'Admins invite people the same way every member does, from the Invite page in the top bar. Every invitation shows in the list below.' }),
      h('div', { class: 'btns' }, h('a', { class: 'button primary', href: '#/invite', text: 'Go to Invite' })))),
    sec('invitations', 'Invitations', inviteBar.el, h('ul', { class: 'list panel', id: 'invites' })),
    sec('members', 'Members', memberBar.el, h('ul', { class: 'list panel', id: 'members-list' }, members.map((m) => {
      const mine = rolesOf(m.id);
      return h('li', {},
        h('div', { class: 'row' }, h('strong', { text: m.display_name }),
          h('span', {}, m.status !== 'active' ? h('span', { class: 'tag bad', text: m.status }) : null, ' ', mine.map((r) => h('span', { class: 'tag', text: r })))),
        h('div', { class: 'meta', text: `joined ${day(m.joined_at)}` }),
        h('div', { class: 'btns' }, h('button', { class: 'quiet', onclick: action(async () => {
          const name = await ask(`New display name for ${m.display_name} (2 to 40 characters):`);
          if (!name) return;
          const reason = await ask(`Rename ${m.display_name} to "${name.trim()}": why? (shown in the moderation log)`);
          if (!reason) return;
          await q(sb.rpc('rename_member', { member_id: m.id, new_name: name, reason }));
          if (m.id === state.user.id) await loadMe();
          await adminView();
        }, msg) }, 'Rename')),
        m.id === state.user.id ? null : h('div', { class: 'btns' },
          ALL.map((r) => h('button', { class: 'quiet', onclick: action(async () => {
            const reason = await ask(`${mine.includes(r) ? 'Remove' : 'Give'} the ${roleName(r)} role: why?`);
            if (!reason) return;
            await q(sb.rpc('set_role', { member_id: m.id, role: r, grant_it: !mine.includes(r), reason }));
            await adminView();
          }, msg) }, `${mine.includes(r) ? '− ' : '+ '}${roleName(r)}`)),
          h('button', { class: `quiet ${m.status === 'active' ? 'danger' : ''}`, onclick: action(async () => {
            const next = m.status === 'active' ? 'suspended' : 'active';
            const reason = await ask(`${next === 'suspended' ? 'Suspend' : 'Reinstate'} ${m.display_name}: why?`);
            if (!reason) return;
            await q(sb.rpc('set_member_status', { member_id: m.id, new_status: next, reason }));
            await adminView();
          }, msg) }, m.status === 'active' ? 'Suspend' : 'Reinstate')));
    }))),
    sec('ai', 'AI fact-checker', aiPanel(msg)),
    sec('language', 'Language filter', languagePanel(msg)),
    sec('notify', `Notify list (${notify.length})`, h('p', { class: 'muted small', text: 'People who left their email on the public page to hear when The Way launches. Only admins see this.' }),
    notify.length ? h('div', { class: 'btns' }, h('button', { class: 'quiet', onclick: () => navigator.clipboard.writeText(notify.map((n) => n.email).join('\n')) }, 'Copy all addresses')) : null,
    notifyBar.el,
    h('ul', { class: 'list panel', id: 'notify-list' }, notify.length ? notify.map((n) => h('li', {},
      h('div', { class: 'row' }, h('span', { text: n.email }), h('span', { class: 'meta', text: `${n.source} · ${day(n.created_at)}` })),
      h('div', { class: 'btns' }, h('button', { class: 'quiet danger', onclick: action(async () => {
        if (!confirm(`Remove ${n.email} from the notify list?`)) return;
        await q(sb.from('notify_signups').delete().eq('id', n.id));
        await adminView();
      }, msg) }, 'Remove')))) : [h('li', { class: 'muted', text: 'Nobody yet.' })])),
  );
  const mItems = [...document.querySelectorAll("#members-list > li")];
  memberBar.set(mItems.map((li, i) => ({ el: li, text: members[i].display_name, facets: { status: members[i].status, role: rolesOf(members[i].id).length ? rolesOf(members[i].id) : ['none'] } })));
  const nItems = [...document.querySelectorAll('#notify-list > li')];
  if (notify.length) notifyBar.set(nItems.map((li, i) => ({ el: li, text: notify[i].email, facets: { source: notify[i].source } })));

  async function refreshInvites() {
    const list = await q(sb.from('invitations').select('*').order('id', { ascending: false }).limit(100));
    drawInvites(list);
  }
  function drawInvites(list) {
    document.getElementById('invites').replaceChildren(...(list.length ? list.map((i) => h('li', {},
      h('div', { class: 'row' }, h('span', { text: i.note || (i.use_count >= i.max_uses ? '(used)' : '(no note)') }), inviteStatus(i)),
      h('div', { class: 'meta', text: `#${i.id}${i.created_by ? ` · by ${nameOf(i.created_by)}` : ''}${i.recipient_email ? ' · for ' + i.recipient_email : ''} · expires ${day(i.expires_at)}` }),
      !i.revoked_at && i.use_count < i.max_uses ? h('div', { class: 'btns' }, h('button', { class: 'quiet danger', onclick: action(async () => {
        const reason = await ask('Revoke this invitation: why?');
        if (!reason) return;
        await q(sb.rpc('revoke_invitation', { invitation_id: i.id, reason }));
        await refreshInvites();
      }, msg) }, 'Revoke')) : null)) : [h('li', { class: 'muted', text: 'No invitations yet.' })]));
    if (list.length) inviteBar.set([...document.querySelectorAll('#invites > li')].map((li, k) => ({ el: li, text: `${list[k].note || ''} ${list[k].recipient_email || ''} #${list[k].id}`,
      facets: { state: list[k].revoked_at ? 'revoked' : list[k].use_count >= list[k].max_uses ? 'used' : new Date(list[k].expires_at) < new Date() ? 'expired' : 'open' } })));
  }
  drawInvites(invites);
}

// ---------------------------------------------------------------- account

function roleCodePanel() {
  const msg = h('div');
  const code = h('input', { name: 'role-code', autocomplete: 'off', spellcheck: 'false', placeholder: 'WAY-xxxxxxxx-xxxxxxxx-xxxxxxxx-xxxxxxxx' });
  return h('div', { class: 'panel' },
    h('h2', { text: 'Have a role code?' }),
    h('p', { class: 'muted small', text: 'If a Deshi or admin gave you a code for Submitter or Deshi (student, reviewer) access, enter it here.' }),
    msg,
    h('form', { onsubmit: action(async () => {
      const got = await q(sb.rpc('redeem_role_invite', { code: code.value.trim() }));
      forgetInvite(); code.value = '';
      await loadMe(); drawNav();
      msg.replaceChildren(notice(`Done. You now have the ${roleName(got)} role.`, 'ok'));
    }, msg) }, h('label', {}, 'Code', code), h('div', { class: 'btns' }, h('button', { class: 'primary' }, 'Use code'))));
}

// Teacher tag on the account page: only the member can see this row. "Show publicly" is the member's own choice, off by default.
function teacherPanel() {
  const box = h('div', { class: 'panel' }, h('h2', { text: 'Teacher tag' }), h('p', { class: 'small dim', text: 'Loading…' }));
  (async () => {
    let row = null;
    try { row = (await q(sb.from('member_teacher').select('is_teacher,tag_public').eq('member_id', state.user.id)))[0] || null; }
    catch { box.replaceChildren(h('h2', { text: 'Teacher tag' }), h('p', { class: 'small dim', text: 'Not available yet.' })); return; }
    const msg = h('div');
    const isT = !!(row && row.is_teacher);
    const pub = h('input', { type: 'checkbox', checked: !!(row && row.tag_public) });
    const save = (t, p) => action(async () => { await q(sb.rpc('set_teacher', { p_teacher: t, p_public: p })); accountView(); }, msg);
    box.replaceChildren(
      h('h2', { text: 'Teacher tag' }),
      h('p', { class: 'small muted', text: isT ? 'You told us you are a teacher. The tag is private unless you show it. Nobody checks it; it is your own word.' : 'Are you a teacher? Say so and you get a private Teacher tag and, soon, classroom resources.' }),
      msg,
      isT ? h('label', { class: 'small' }, pub, ' Show the Teacher tag publicly') : null,
      h('div', { class: 'btns' },
        isT ? h('button', { onclick: () => save(true, pub.checked)() }, 'Save') : h('button', { onclick: () => save(true, false)() }, 'I am a teacher'),
        isT ? h('button', { class: 'quiet', onclick: () => save(false, false)() }, 'Remove the tag') : null));
  })();
  return box;
}

// Art and skills on the account page: owner-only (and the team). Nothing here is shown to other members.
function skillsPanel() {
  const box = h('div', { class: 'panel' }, h('h2', { text: 'Art and skills' }), h('p', { class: 'small dim', text: 'Loading…' }));
  (async () => {
    let row = null;
    try { row = (await q(sb.from('member_skills').select('makes_art,other_field').eq('member_id', state.user.id)))[0] || null; }
    catch { box.replaceChildren(h('h2', { text: 'Art and skills' }), h('p', { class: 'small dim', text: 'Not available yet.' })); return; }
    const msg = h('div');
    const art = h('input', { type: 'checkbox', checked: !!(row && row.makes_art) });
    const other = h('input', { type: 'text', maxlength: 300, autocomplete: 'off', value: (row && row.other_field) || '' });
    box.replaceChildren(
      h('h2', { text: 'Art and skills' }),
      h('p', { class: 'small muted', text: 'Only you and the team see this. Artists can donate work to replace our AI-made graphics, and we credit them by name.' }),
      msg,
      h('label', { class: 'small' }, art, ' I make art'),
      h('label', {}, 'A relevant field or skill we did not think of?', other),
      h('div', { class: 'btns' }, h('button', { onclick: action(async () => { await q(sb.rpc('set_skills', { p_art: art.checked, p_other: other.value.trim() || null })); msg.append(notice('Saved.', 'ok')); }, msg) }, 'Save')));
  })();
  return box;
}

// Bubble settings on the account page: hide a bubble you do not use. Its links move to a small "Hidden links" list on the same side.
// Nothing is removed from the site; Restore defaults brings every bubble back. Saved in this browser only.
function bubblePanel() {
  const KEY = 'theway.bubbles-hide';
  const ALL = [['home', 'Home (right)'], ['news', 'News (right)'], ['tools', 'Tools (right)'], ['vote', 'VOTE! (left)'], ['review', 'Review (left)'], ['commons', 'Commons (left)'], ['help', 'Help (left)']];
  let hid = [];
  try { hid = JSON.parse(localStorage.getItem(KEY) || '[]'); if (!Array.isArray(hid)) hid = []; } catch { hid = []; }
  const msg = h('div');
  const boxes = ALL.map(([k, label]) => [k, h('input', { type: 'checkbox', checked: !hid.includes(k) }), label]);
  const apply = () => { if (window.WayBar && window.WayBar.render) window.WayBar.render(); };
  const save = (list) => { try { list.length ? localStorage.setItem(KEY, JSON.stringify(list)) : localStorage.removeItem(KEY); } catch { /* no storage */ } apply(); };
  return h('div', { class: 'panel' },
    h('h2', { text: 'Bubble settings' }),
    h('p', { class: 'small muted', text: 'The round buttons at the edges of the page. Untick one to hide it. Its links move to a small "Hidden links" list on the same side, so nothing is lost. Saved in this browser.' }),
    msg,
    h('form', { onsubmit: (e) => { e.preventDefault(); save(boxes.filter(([, b]) => !b.checked).map(([k]) => k)); msg.replaceChildren(notice('Saved.', 'ok')); } },
      ...boxes.map(([, b, label]) => h('label', { class: 'small' }, b, ` ${label}`)),
      h('div', { class: 'btns' },
        h('button', { class: 'primary', type: 'submit' }, 'Save'),
        h('button', { class: 'quiet', type: 'button', onclick: () => { boxes.forEach(([, b]) => { b.checked = true; }); save([]); msg.replaceChildren(notice('Every bubble is back.', 'ok')); } }, 'Restore defaults'))));
}

function accountView() {
  render(
    h('p', { class: 'overline', text: 'Your account' }),
    h('h1', { text: state.me.display_name }),
    h('div', { class: 'panel' },
      h('h2', { text: 'You' }),
      h('p', { class: 'muted small', text: `Signed in as ${state.user.email}. Only you and the site's administrators can see your email.` }),
      h('p', { class: 'small dim', text: 'Display names are chosen once, when you join. To change yours, ask an admin.' }),
      h('p', { class: 'small', text: `Roles: ${state.roles.size ? [...state.roles].map(roleName).join(', ') : 'member'}` })),
    placePanel(),
    teacherPanel(),
    skillsPanel(),
    bubblePanel(),
    roleCodePanel(),
    h('div', { class: 'panel' },
      h('h2', { text: 'Signing in' }),
      h('p', { class: 'small muted', text: 'Sign in with your email and password, or ask for a sign-in link on the sign-in page and we email you one. Setting a password is optional.' }),
      h('div', { class: 'btns' }, h('a', { class: 'button', href: '#/password', text: 'Set / change password' }), h('button', { onclick: signOut }, 'Sign out'))),
  );
}

// ---------------------------------------------------------------- Case review (moderators)
// A moderator checks each key claim of a case, flags problems with a note, and marks the case reviewed.
// Every step is one new row in case_review_events (append-only). The notes and the date are PUBLIC
// (members/reviews.html); the reviewer's name is not shown there, but it is kept in the audit log.
// The "Not yet reviewed by a person" banner on the case page itself is switched off by hand in the
// case builder (cases-build/reviewed.json), after the review here is done.
const REVIEW_PUBLIC = 'reviews.html';
let claimsLoad = null;
function loadClaims() {
  if (window.WAY_CASE_CLAIMS) return Promise.resolve(window.WAY_CASE_CLAIMS);
  if (!claimsLoad) claimsLoad = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'cases-claims.js?v=2';
    s.onload = () => resolve(window.WAY_CASE_CLAIMS || {});
    s.onerror = () => { claimsLoad = null; reject(new Error('Could not load the list of claims. Reload and try again.')); };
    document.head.append(s);
  });
  return claimsLoad;
}
const CLAIM_LABEL = { primary: 'Primary source opened', secondary: 'Secondary source only', disputed: 'Sources disagree', unverified: 'Unverified' };
const CLAIM_TAG = { primary: 'ok', secondary: '', disputed: 'warn', unverified: 'bad' };
const EVENT_LABEL = { claim_checked: 'Claim checked', claim_flagged: 'Claim flagged', claim_cleared: 'Flag cleared', review_started: 'Review started',
  note: 'Note', marked_reviewed: 'Marked reviewed', reopened: 'Reopened' };

async function reviewView(slug) {
  if (!can('moderator')) return render(notice('Moderators only.'));
  if (slug) return reviewCaseView(slug);
  const rows = await q(sb.rpc('case_review_status'));
  const by = Object.fromEntries(rows.map((r) => [r.case_slug, r]));
  render(
    h('p', { class: 'overline', text: 'Moderation' }),
    h('h1', { text: 'Review sources' }),
    h('p', { class: 'lede', text: 'Open a case, check its key claims against the sources one by one, flag anything wrong, and mark the case reviewed when every claim is checked. What you write in a note is public.' }),
    h('p', { class: 'small' }, h('a', { href: REVIEW_PUBLIC, target: '_blank', rel: 'noopener', text: 'The public review history' })),
    randomClaimBox(),
    CASES.length ? h('ul', { class: 'list panel cases' }, CASES.map((c) => {
      const r = by[c.slug];
      const tag = !r ? ['not started', ''] : r.status === 'reviewed' ? ['reviewed', 'ok'] : r.claims_flagged ? [`${r.claims_flagged} flagged`, 'warn'] : ['in review', ''];
      return h('li', { id: `case-${c.slug}` },
        h('div', { class: 'row' }, h('strong', {}, h('a', { href: `#/review/${c.slug}`, text: `Case ${c.num}: ${c.title}` })),
          h('span', { class: `tag ${tag[1]}`, text: tag[0] })),
        r ? h('p', { class: 'muted small', text: `${r.claims_checked} claim(s) checked · last activity ${day(r.last_activity)}` }) : null);
    })) : h('p', { class: 'muted', text: 'No cases yet.' }));
}

// "Review a random claim": picks one claim that still needs a look and opens it inside its case. Chosen in the browser
// from the claims list plus what this moderator can already read (case_review_events, own claim_reviews), so row-level
// security decides what is visible. Order of preference: not checked or flagged and not yet reviewed by this person,
// in a case not marked reviewed; then any claim this person has not reviewed; then nothing.
function randomClaimBox() {
  const status = h('p', { class: 'rand-status', role: 'status', 'aria-live': 'polite' });
  const btn = h('button', { type: 'button', class: 'primary rand-btn' }, 'Review a random claim');
  btn.addEventListener('click', async () => {
    btn.disabled = true; status.textContent = 'Looking for a claim that needs a check\u2026';
    try {
      const [claimsAll, events, mine] = await Promise.all([
        loadClaims(),
        q(sb.from('case_review_events').select('case_slug,claim_key,event_type,id').order('id')),
        q(sb.from('claim_reviews').select('case_slug,claim_key')),
      ]);
      const latest = new Map(), done = new Set();
      for (const e of events) {
        if (e.claim_key) latest.set(`${e.case_slug}|${e.claim_key}`, e.event_type);
        if (e.event_type === 'marked_reviewed') done.add(e.case_slug);
        if (e.event_type === 'reopened') done.delete(e.case_slug);
      }
      const mineSet = new Set(mine.map((m) => `${m.case_slug}|${m.claim_key}`));
      const all = [];
      for (const c of CASES) for (const cl of claimsAll[c.slug] || []) {
        const key = `${c.slug}|${cl.k}`;
        if (mineSet.has(key)) continue;
        const ev = latest.get(key);
        all.push({ slug: c.slug, k: cl.k, open: !done.has(c.slug) && ev !== 'claim_checked' && ev !== 'claim_cleared' });
      }
      const open = all.filter((x) => x.open);
      const pool = open.length ? open : all;
      if (!pool.length) { status.textContent = 'You have reviewed every claim on the list. Thank you.'; return; }
      const pick = pool[Math.floor(Math.random() * pool.length)];
      const c = caseBySlug(pick.slug);
      status.textContent = `Opening a claim in Case ${c.num}: ${c.title}`;
      const target = `#/review/${pick.slug}`;
      const focusClaim = async () => {
        for (let i = 0; i < 40; i++) {
          const el = document.getElementById(`claim-${pick.k}`);
          if (el) { el.setAttribute('tabindex', '-1'); el.scrollIntoView({ block: 'start' }); el.focus({ preventScroll: true }); el.classList.add('rand-hit'); return; }
          await new Promise((r) => setTimeout(r, 150));
        }
      };
      if (location.hash === target) await reviewCaseView(pick.slug); else location.hash = target;
      await focusClaim();
    } catch (err) { status.textContent = friendly(err); } finally { btn.disabled = false; }
  });
  return h('div', { class: 'rand-box' }, btn, status);
}

async function reviewCaseView(slug) {
  const c = caseBySlug(slug);
  if (!c) return render(notice('Unknown case.'), h('p', {}, h('a', { href: '#/review', text: 'Back to the list' })));
  const y = window.scrollY;
  const [claimsAll, events, mineAll, summaryAll, shotRows, page] = await Promise.all([
    loadClaims(),
    q(sb.from('case_review_events')
      .select('id,claim_key,claim_text,event_type,note,created_at,actor:members!case_review_events_actor_id_fkey(display_name)')
      .eq('case_slug', slug).order('id')),
    // Phase A (0014). If the migration has not been run yet these fail quietly and the screen works as before.
    q(sb.rpc('my_claim_reviews', { p_case_slug: slug })).catch(() => null),
    q(sb.rpc('claim_review_summary', { p_case_slug: slug })).catch(() => null),
    // Screenshots (0020). Null until that migration has been run: the upload button then stays hidden.
    q(sb.from('review_screenshots').select('claim_key').eq('case_slug', slug)).catch(() => null),
    // The case page itself, for the source link and the "expand context" buttons. Not essential.
    loadCasePage(c).catch(() => null),
  ]);
  const shotCount = new Map();
  for (const r of shotRows || []) shotCount.set(r.claim_key, (shotCount.get(r.claim_key) || 0) + 1);
  const phaseA = mineAll !== null && summaryAll !== null;
  const mineBy = new Map();
  for (const m of mineAll || []) { if (!mineBy.has(m.claim_key)) mineBy.set(m.claim_key, []); mineBy.get(m.claim_key).push(m); }
  const sumBy = new Map((summaryAll || []).map((x) => [x.claim_key, x]));
  const claims = claimsAll[slug] || [];
  const latest = new Map();
  let reviewed = false;
  for (const e of events) {
    if (e.claim_key) latest.set(e.claim_key, e);
    if (e.event_type === 'marked_reviewed') reviewed = true;
    if (e.event_type === 'reopened') reviewed = false;
  }
  const isOk = (k) => { const e = latest.get(k); return !!e && (e.event_type === 'claim_checked' || e.event_type === 'claim_cleared'); };
  const flagged = claims.filter((cl) => (latest.get(cl.k) || {}).event_type === 'claim_flagged');
  const okCount = claims.filter((cl) => isOk(cl.k)).length;
  const msg = h('div');
  const refresh = async () => { await reviewCaseView(slug); window.scrollTo(0, y); };

  const claimStep = (cl, type, label, needNote) => action(async () => {
    let note = null;
    if (needNote) {
      note = await ask(type === 'claim_flagged' ? 'Flag this claim: what is wrong? (public)' : 'Clear the flag: what was fixed or confirmed? (public)');
      if (!note) return;
    }
    await q(sb.rpc('review_case_claim', { case_slug: slug, claim_key: cl.k, claim_text: cl.claim, event_type: type, note }));
    await refresh();
  }, msg);
  const caseStep = (type, question, minLen) => action(async () => {
    let note = null;
    if (question) { note = await ask(question); if (!note) return; }
    if (minLen && note.length < minLen) throw new Error(`Please write at least ${minLen} characters.`);
    await q(sb.rpc('review_case', { case_slug: slug, event_type: type, note }));
    await refresh();
  }, msg);

  const claimRow = (cl) => {
    const e = latest.get(cl.k);
    const st = !e ? ['not checked', ''] : e.event_type === 'claim_flagged' ? ['flagged', 'bad'] : e.event_type === 'claim_cleared' ? ['flag cleared', 'ok'] : ['checked', 'ok'];
    return h('li', { id: `claim-${cl.k}` },
      h('div', { class: 'row' }, h('span', { class: `tag ${CLAIM_TAG[cl.status] || ''}`, text: CLAIM_LABEL[cl.status] || cl.detail }),
        h('span', { class: `tag ${st[1]}`, text: st[0] })),
      h('p', { class: 'post' }, h('strong', { text: `\u201c${cl.claim}\u201d` })),
      cl.source ? h('p', { class: 'small muted', text: `Source on the page: ${cl.source}` }) : null,
      sourceLinks(cl, c, page),
      claimContext(cl, c, page),
      e && e.note ? h('p', { class: 'small', text: `Last note: ${e.note}` }) : null,
      phaseA ? claimReviewPanel(cl, mineBy.get(cl.k) || [], sumBy.get(cl.k), slug, msg, refresh) : null,
      shotRows !== null ? screenshotPanel(cl, slug, shotCount.get(cl.k) || 0) : null,
      reviewed ? null : h('div', { class: 'btns' },
        !e || e.event_type !== 'claim_flagged' ? h('button', { class: 'quiet', disabled: isOk(cl.k) && e.event_type === 'claim_checked', onclick: claimStep(cl, 'claim_checked') }, 'Mark checked') : null,
        !e || e.event_type !== 'claim_flagged' ? h('button', { class: 'quiet danger', onclick: claimStep(cl, 'claim_flagged', null, true) }, 'Flag') : null,
        e && e.event_type === 'claim_flagged' ? h('button', { class: 'quiet', onclick: claimStep(cl, 'claim_cleared', null, true) }, 'Clear flag') : null));
  };

  const log = events.slice().reverse();
  render(
    h('p', { class: 'overline', text: `Case ${c.num} · review` }),
    h('h1', { text: c.title }),
    h('p', { class: 'small' }, h('a', { href: '#/review', text: 'All cases' }), ' · ', h('a', { href: caseUrl(c), target: '_blank', rel: 'noopener', text: 'Read the case' }),
      ' · ', h('a', { href: `${REVIEW_PUBLIC}?case=${encodeURIComponent(slug)}`, target: '_blank', rel: 'noopener', text: 'Public review history' })),
    h('p', { class: 'notice ok', text: 'Notes and dates are public. Do not write names, addresses, phone numbers or email addresses in a note.' }),
    msg,
    h('div', { class: 'panel' },
      h('div', { class: 'row' }, h('strong', { text: reviewed ? 'Marked reviewed' : 'Not yet marked reviewed' }),
        h('span', { class: 'small muted', text: `${okCount} of ${claims.length} claims checked · ${flagged.length} flagged` })),
      reviewed
        ? h('div', { class: 'btns' }, h('button', { class: 'quiet danger', onclick: caseStep('reopened', 'Reopen this case: why? (public)') }, 'Reopen'))
        : h('div', { class: 'btns' },
            events.length === 0 ? h('button', { class: 'quiet', onclick: caseStep('review_started') }, 'Start review') : null,
            h('button', { class: 'quiet', onclick: caseStep('note', 'Add a note to this case (public)') }, 'Add a note'),
            h('button', { class: 'primary', disabled: !claims.length || okCount < claims.length || flagged.length > 0,
              title: 'Every claim must be checked and no flag left open',
              onclick: caseStep('marked_reviewed', 'Mark reviewed: say in a sentence or two what you reviewed (public)', 10) }, 'Mark reviewed')),
      reviewed ? h('p', { class: 'small muted', text: 'After this, a person switches off the "Not yet reviewed" banner on the case page by adding the case to cases-build/reviewed.json and rebuilding.' }) : null),
    claims.length ? h('ul', { class: 'list panel review-claims' }, claims.map(claimRow))
      : h('p', { class: 'muted', text: 'This case has no key-claims table to review.' }),
    h('div', { class: 'panel' }, h('h2', { text: 'Everything done on this case' }),
      log.length ? h('ul', { class: 'list' }, log.map((e) => h('li', {},
        h('div', { class: 'meta', text: `${EVENT_LABEL[e.event_type] || e.event_type} · ${e.actor ? e.actor.display_name : 'a reviewer'} · ${when(e.created_at)}` }),
        e.claim_text ? h('p', { class: 'small', text: e.claim_text }) : null,
        e.note ? h('p', { class: 'post', text: e.note }) : null)))
        : h('p', { class: 'muted small', text: 'Nothing yet.' })));
}


// ---- Phase A: independent claim reviews (0014). Each reviewer records their own verdict on a claim, with the
// source, the passage that backs it and a reason. Nobody overwrites anybody: a change of mind is a new row that
// points at the old one. Counts are process numbers (how many people looked, do they differ), not a vote.
const VERDICT_LABEL = { supported: 'Supported', partially_supported: 'Partially supported', contradicted: 'Contradicted',
  insufficient_evidence: 'Insufficient evidence', inaccessible: 'Source inaccessible', pending: 'Pending' };
const ACCESS_LABEL = { opened: 'I opened the source', inaccessible: 'I could not open the source', questioned: 'The source itself looks altered or not what it claims' };
const FLAG_LABEL = { needs_second_look: 'Needs a second look', source_conflict: 'Sources conflict', possible_error: 'Possible error in the claim', outdated: 'Out of date', other: 'Other' };

function claimReviewPanel(cl, mine, sum, slug, msg, refresh) {
  const current = mine[mine.length - 1] || null; // newest of my own rows for this claim
  const wrap = h('div', { class: 'claim-reviews' });
  const bits = [];
  if (sum) bits.push(`${sum.reviewers} reviewer${sum.reviewers === 1 ? '' : 's'} so far`);
  if (sum && sum.disagree) bits.push('verdicts differ: a moderator will take a second look');
  wrap.append(h('p', { class: 'small muted', text: bits.length ? bits.join(' · ') : 'No one has recorded a review of this claim yet.' }));
  if (current) wrap.append(h('p', { class: 'small', text: `Your review: ${VERDICT_LABEL[current.verdict]} (source: ${current.source_label})` }));

  const open = h('div');
  const form = () => {
    const f = h('form', { class: 'panel', novalidate: true });
    const sel = (name, opts, val) => h('select', { name }, Object.entries(opts).map(([k, v]) => h('option', { value: k, selected: k === val, text: v })));
    const src = h('input', { name: 'source_label', type: 'text', maxlength: 300, required: true, value: current ? current.source_label : (cl.source || '') });
    const url = h('input', { name: 'source_url', type: 'url', maxlength: 1000, placeholder: 'https://…', value: current && current.source_url ? current.source_url : (cl.srcUrl || '') });
    const pass = h('textarea', { name: 'evidence_passage', rows: 3, maxlength: 1500 }); pass.value = current && current.evidence_passage ? current.evidence_passage : '';
    const rat = h('textarea', { name: 'rationale', rows: 3, maxlength: 2000 }); rat.value = current && current.rationale ? current.rationale : '';
    const flags = Object.entries(FLAG_LABEL).map(([k, v]) => h('label', { class: 'small' }, h('input', { type: 'checkbox', name: 'flag', value: k, checked: !!(current && current.flags.includes(k)) }), ' ' + v));
    const collab = h('input', { type: 'checkbox', name: 'collab', checked: !!(current && current.review_mode === 'collaborative') });
    const fields = [
      ['Source you checked', src], ['Link to the source (optional)', url], ['Could you open it?', sel('source_access', ACCESS_LABEL, current ? current.source_access : 'opened')],
      ['Your verdict on the claim', sel('verdict', VERDICT_LABEL, current ? current.verdict : 'pending')],
      ['The passage in the source that backs the verdict (quote or page)', pass], ['Why (one or two sentences)', rat]];
    for (const [label, input] of fields) f.append(h('label', { class: 'field' }, h('span', { text: label }), input));
    f.append(h('fieldset', {}, h('legend', { class: 'small', text: 'Flags' }), flags));
    f.append(h('label', { class: 'small' }, collab, ' I talked this over with another reviewer before deciding'));
    f.append(h('p', { class: 'small muted', text: 'Passage, reason and source are public, shown under a number like "Reviewer 2". No names, addresses, phone numbers or emails.' }));
    f.append(h('div', { class: 'btns' },
      h('button', { class: 'primary', type: 'submit' }, current ? 'Save as a new revision' : 'Record my review'),
      h('button', { class: 'quiet', type: 'button', onclick: () => open.replaceChildren() }, 'Cancel')));
    f.onsubmit = action(async (ev) => {
      ev.preventDefault();
      const fd = new FormData(f);
      await q(sb.rpc('submit_claim_review', {
        p_case_slug: slug, p_claim_key: cl.k, p_claim_text: cl.claim,
        p_source_label: fd.get('source_label'), p_source_url: fd.get('source_url') || null, p_source_access: fd.get('source_access'),
        p_verdict: fd.get('verdict'), p_evidence_passage: fd.get('evidence_passage') || null, p_rationale: fd.get('rationale') || null,
        p_flags: fd.getAll('flag'), p_review_mode: collab.checked ? 'collaborative' : 'independent',
        p_supersedes_id: current ? current.id : null }));
      await refresh();
    }, msg);
    return f;
  };
  const others = h('div');
  const showOthers = action(async () => {
    const rows = await q(sb.rpc('claim_reviews_for_claim', { p_case_slug: slug, p_claim_key: cl.k }));
    others.replaceChildren(rows.length ? h('ul', { class: 'list small' }, rows.map((r) => h('li', {},
      h('div', { class: 'meta', text: `${r.is_mine ? 'You' : r.reviewer_label} · ${VERDICT_LABEL[r.verdict]} · ${when(r.created_at)}${r.is_current ? '' : ' · replaced by a later revision'}${r.review_mode === 'collaborative' ? ' · discussed with another reviewer' : ''}` }),
      h('p', { text: `Source: ${r.source_label} (${r.source_access})` }),
      r.evidence_passage ? h('p', { text: `Passage: ${r.evidence_passage}` }) : null,
      r.rationale ? h('p', { text: `Why: ${r.rationale}` }) : null,
      r.flags.length ? h('p', { class: 'muted', text: 'Flags: ' + r.flags.map((x) => FLAG_LABEL[x]).join(', ') }) : null)))
      : h('p', { class: 'muted small', text: 'Nothing to show yet.' }));
  }, msg);
  wrap.append(h('div', { class: 'btns' },
    h('button', { class: 'quiet', type: 'button', onclick: () => open.replaceChildren(form()) }, current ? 'Revise my review' : 'Record my review'),
    current ? h('button', { class: 'quiet', type: 'button', onclick: showOthers }, 'See the other reviewers') : null),
    !current ? h('p', { class: 'small muted', text: 'Other reviewers\' answers open after you record yours, so no one steers anyone.' }) : null, open, others);
  return wrap;
}


// ---- Source link and context for a claim. Both come from the case page itself (same site), read as text only:
// the page is parsed into an inert document and nothing from it is ever inserted as HTML.
const casePages = new Map();
function loadCasePage(c) {
  if (!casePages.has(c.slug)) casePages.set(c.slug, fetch(caseUrl(c)).then((r) => {
    if (!r.ok) throw new Error('Could not load the case page.');
    return r.text();
  }).then((t) => new DOMParser().parseFromString(t, 'text/html')).catch((err) => { casePages.delete(c.slug); throw err; }));
  return casePages.get(c.slug);
}
const normText = (t) => String(t || '').toLowerCase().replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[‐-―−]/g, '-')
  .replace(/(\d),(\d)/g, '$1$2').replace(/[^a-z0-9$%]+/g, ' ').replace(/\s+/g, ' ').trim();
const flat = (t) => String(t || '').replace(/\s+/g, ' ').trim();
const safeHref = (href, base) => { try { const u = new URL(href, new URL(base, location.href)); return /^https?:$/.test(u.protocol) ? u.href : null; } catch { return null; } };
const NUMW = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, hundred: 100, first: 1, second: 2, third: 3 };
const STOP = new Set(['the', 'and', 'page', 'host', 'read', 'through', 'tool', 'returned', 'text', 'seen', 'only', 'from', 'with', 'for', 'that', 'was', 'were', 'not', 'are', 'its', 'has', 'had', 'his', 'her', 'who', 'did', 'but', 'this', 'than', 'also', 'into', 'been', 'which', 'when', 'they', 'their', 'there', 'then', 'about']);
const stem = (w) => (NUMW[w] ? String(NUMW[w]) : w.length > 4 ? w.replace(/(ing|ed|es|s|ly)$/, '') : w);
const words = (t) => normText(t).split(' ').filter((w) => (w.length >= 3 || /^\d+$/.test(w)) && !STOP.has(w)).map(stem);
const hostWords = (href) => { try { const u = new URL(href); return [...u.hostname.replace(/^www\./, '').split('.'), ...u.pathname.split(/[\/._-]+/)].filter((x) => x.length >= 3).map((x) => x.toLowerCase()); } catch { return []; } };

// Every external link on the case page, with the words around it (its own text, its table row or list item, the host).
function pageLinks(c, doc) {
  const out = [];
  const seen = new Set();
  for (const a of doc.querySelectorAll('a[href]')) {
    const url = safeHref(a.getAttribute('href'), caseUrl(c));
    if (!url || seen.has(url) || /^https?:\/\/(www\.)?(michiinstitute|thewayparty)\./.test(url)) continue;
    seen.add(url);
    const box = a.closest('tr, li, p') || a.parentElement;
    const inSources = !!a.closest('table') && !!(box && box.closest('table')) && !!doc.querySelector('#sources') && !!(doc.querySelector('#sources').compareDocumentPosition(a) & 4);
    out.push({ url, title: flat(a.textContent) || url, have: new Set([...words(box ? box.textContent : a.textContent), ...hostWords(url).map(stem)]), inSources });
  }
  return out;
}
function matchSources(cl, c, doc) {
  const want = [...new Set(words(cl.source))];
  if (!want.length) return { hits: [], close: false };
  const scored = pageLinks(c, doc).map((l) => ({ ...l, score: want.filter((w) => l.have.has(w)).length / want.length + (l.inSources ? 0.05 : 0) }))
    .filter((x) => x.score > 0.2).sort((x, y) => y.score - x.score);
  if (!scored.length) return { hits: [], close: false };
  const best = scored[0].score;
  return { hits: scored.filter((x) => x.score >= best - 0.1).slice(0, 2), close: best < 0.6 };
}

function findClaimBlock(cl, doc) {
  const all = [...doc.querySelectorAll('p, li, tr, blockquote, dd')].filter((b) => !b.closest('nav, header, footer, .toc, #sources ~ *') && !b.querySelector('p, li, tr'));
  const want = normText(cl.claim);
  const exact = all.filter((b) => normText(b.textContent).includes(want)).sort((a, b) => a.textContent.length - b.textContent.length)[0];
  if (exact) return { el: exact, exact: true };
  const ws = [...new Set(words(cl.claim))];
  if (ws.length < 3) return null;
  let best = null;
  for (const b of all) {
    const have = new Set(words(b.textContent));
    let sc = ws.filter((w) => have.has(w)).length / ws.length;
    // numbers are the strongest clue: a block missing any number of the claim loses ground
    const nums = ws.filter((w) => /^\d/.test(w));
    if (nums.length && nums.every((n) => have.has(n))) sc += 0.1;
    if (b.closest('.in-brief')) sc -= 0.05;
    if (!best || sc > best.sc + 0.02 || (Math.abs(sc - best.sc) <= 0.02 && b.textContent.length < best.el.textContent.length)) best = { el: b, sc };
  }
  return best && best.sc >= 0.45 ? { el: best.el, exact: false, sc: best.sc } : null;
}

function sourceLinks(cl, c, doc) {
  const m = doc ? matchSources(cl, c, doc) : { hits: [], close: false };
  if (m.hits[0]) cl.srcUrl = m.hits[0].url;
  const link = (href, text) => h('a', { href, target: '_blank', rel: 'noopener noreferrer', text });
  const clipT = (t) => (t.length > 90 ? t.slice(0, 87) + '\u2026' : t);
  return h('p', { class: 'small' }, m.hits.length
    ? [m.close ? h('span', { class: 'muted', text: 'Closest match: ' }) : null,
       m.hits.map((x, i) => [i ? ' \u00b7 ' : '', link(x.url, `Open the source: ${clipT(x.title)} \u2197`)])]
    : [link(`${caseUrl(c)}#sources`, 'See the case\u2019s source list \u2197'), h('span', { class: 'muted', text: ' (this claim names no single source)' })]);
}

function blockText(el) {
  if (el.tagName === 'TR') {
    const table = el.closest('table');
    const heads = table ? [...table.querySelectorAll('thead th')].map((t) => flat(t.textContent)) : [];
    return [...el.children].map((cell, i) => (heads[i] ? `${heads[i]}: ` : '') + flat(cell.textContent)).join('\n');
  }
  if (/^(UL|OL)$/.test(el.tagName)) return [...el.children].map((li) => '• ' + flat(li.textContent)).join('\n');
  if (el.tagName === 'TABLE') return [...el.querySelectorAll('tbody tr')].map((r) => [...r.children].map((x) => flat(x.textContent)).join(' | ')).join('\n');
  return flat(el.textContent);
}
const clip = (t, n) => (t.length > n ? t.slice(0, n).replace(/\s+\S*$/, '') + ' …' : t);
function claimContext(cl, c, doc) {
  const slot = h('div', { class: 'claim-context' });
  if (!doc) return h('p', { class: 'small' }, h('a', { href: caseUrl(c), target: '_blank', rel: 'noopener noreferrer', text: 'Open the case page \u2197' }), h('span', { class: 'muted', text: ' (the case text could not be loaded here)' }));
  const hit = findClaimBlock(cl, doc);
  const level = { n: 0 };
  const draw = () => {
    if (level.n === 0) return slot.replaceChildren(h('div', { class: 'btns' }, h('button', { class: 'quiet', type: 'button', onclick: () => { level.n = 1; draw(); } }, 'Expand context')));
    if (!hit) return slot.replaceChildren(h('p', { class: 'small muted', text: 'No paragraph on the case page matches this claim closely (it may come from a table or a number list). ' }, ''),
      h('a', { class: 'small', href: caseUrl(c), target: '_blank', rel: 'noopener noreferrer', text: 'Open the case page ↗' }));
    const el = hit.el;
    const box = h('div', { class: 'panel small' });
    if (level.n === 1) {
      const txt = blockText(el);
      box.append(h('p', { class: 'muted', text: hit.exact ? 'Paragraph on the case page' : 'Closest paragraph on the case page (the wording differs, so check it is the right one)' }), h('div', { class: 'post', text: txt }));
    } else {
      const unit = el.closest('table, ul, ol') || el;
      const head = (() => { let n = unit; while (n && n.previousElementSibling) { n = n.previousElementSibling; if (/^H[23]$/.test(n.tagName)) return n; } return null; })();
      const prev = unit.previousElementSibling && !/^H[1-6]$/.test(unit.previousElementSibling.tagName) ? unit.previousElementSibling : null;
      const next = unit.nextElementSibling && !/^H[1-6]$/.test(unit.nextElementSibling.tagName) ? unit.nextElementSibling : null;
      box.append(h('p', { class: 'muted', text: head ? `Wider context, under “${flat(head.textContent)}”` : 'Wider context' }));
      for (const [label, n, mark] of [['Before', prev], ['The claim is here', unit, true], ['After', next]]) {
        if (!n) continue;
        box.append(h('p', { class: 'muted', text: label }), h('div', { class: mark ? 'post ctx-here' : 'post', text: clip(blockText(n), 1800) }));
      }
    }
    const acts = h('div', { class: 'btns' });
    if (level.n === 1) acts.append(h('button', { class: 'quiet', type: 'button', onclick: () => { level.n = 2; draw(); } }, 'See even more context'));
    acts.append(h('button', { class: 'quiet', type: 'button', onclick: () => { level.n = level.n === 2 ? 1 : 0; draw(); } }, level.n === 2 ? 'Back to the paragraph' : 'Hide context'));
    acts.append(h('a', { class: 'small', href: caseUrl(c), target: '_blank', rel: 'noopener noreferrer', text: 'Open the case page ↗' }));
    slot.replaceChildren(box, acts);
  };
  slot.append(h('div', { class: 'btns' }, h('button', { class: 'quiet', type: 'button', onclick: () => { level.n = 1; draw(); } }, 'Expand context')));
  return slot;
}

// ---- Screenshots (0020). A reviewer can attach a screenshot of the source to a claim. Safe by design:
// the browser re-draws the picture (which drops all hidden data such as location and device info), rejects
// anything that is not a real image, caps size, and the file goes to a PRIVATE bucket that only moderators and
// the uploader can read. Screenshots are never shown on the public review history.
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
function screenshotPanel(cl, slug, count) {
  const slot = h('div', { class: 'shots' });
  const list = h('div');
  const msg = h('div');
  let n = count;
  const status = h('p', { class: 'small muted' });
  const label = () => { status.textContent = n ? `${n} screenshot${n === 1 ? '' : 's'} attached (private: moderators only).` : 'No screenshots attached.'; };
  label();
  const show = action(async () => {
    const rows = await q(sb.from('review_screenshots').select('id,path,note,created_at').eq('case_slug', slug).eq('claim_key', cl.k).order('id'));
    // The page's CSP allows images only from this site or data: URLs, so download each file and show it as a data: URL.
    const toData = (blob) => new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(blob); });
    const imgs = await Promise.all(rows.map(async (r) => {
      const { data, error } = await sb.storage.from('review-screenshots').download(r.path);
      return error || !data ? null : toData(data);
    }));
    list.replaceChildren(rows.length ? h('div', { class: 'btns' }, rows.map((r, i) => {
      if (!imgs[i]) return h('span', { class: 'small muted', text: 'A screenshot could not be loaded.' });
      const img = h('img', { src: imgs[i], alt: r.note || 'Screenshot', title: (r.note ? r.note + ' \u00b7 ' : '') + 'click to enlarge', style: 'max-width:160px;max-height:120px;border-radius:8px;border:1px solid var(--line);cursor:zoom-in' });
      img.addEventListener('click', () => {
        const big = img.dataset.big === '1';
        img.dataset.big = big ? '0' : '1';
        img.style.maxWidth = big ? '160px' : '100%'; img.style.maxHeight = big ? '120px' : 'none'; img.style.cursor = big ? 'zoom-in' : 'zoom-out';
      });
      return img;
    })) : h('p', { class: 'small muted', text: 'Nothing attached yet.' }));
  }, msg);
  const input = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp', hidden: true });
  const note = h('input', { type: 'text', maxlength: 200, placeholder: 'What this shows (optional, public-safe, no names)', style: 'min-width:240px' });
  input.addEventListener('change', action(async () => {
    const f = input.files && input.files[0];
    if (!f) return;
    const blob = await cleanShot(f);
    const id = (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2));
    const path = `${state.user.id}/${slug}/${cl.k}/${id}.jpg`;
    const up = await sb.storage.from('review-screenshots').upload(path, blob, { contentType: 'image/jpeg', upsert: false });
    if (up.error) throw up.error;
    await q(sb.from('review_screenshots').insert({ case_slug: slug, claim_key: cl.k, path, note: note.value.trim() || null }));
    input.value = ''; note.value = ''; n += 1; label();
    await show();
  }, msg));
  slot.append(status, h('div', { class: 'btns' },
    h('button', { class: 'quiet', type: 'button', onclick: () => input.click() }, 'Attach a screenshot'),
    n ? h('button', { class: 'quiet', type: 'button', onclick: show }, 'Show screenshots') : null, note, input),
    h('p', { class: 'small muted', text: 'Private to moderators; never shown on the public history. Blur names, addresses and emails first. Pictures are re-saved as plain JPEG and capped in size.' }), msg, list);
  return slot;
}

// ---------------------------------------------------------------- router

async function route() {
  drawNav();
  const parts = (location.hash.replace(/^#\/?/, '') || '').split('/');
  try {
    switch (parts[0]) {
      case '': return await homeView();
      case 'map': return await mapView();
      case 'commons': return await commonsView();
      case 'invite': return await inviteView();
      case 'roles': return rolesView();
      case 'status': return CSTAT ? await CSTAT.view(parts[1] || '', parts[2] || '') : render(notice('Page not found.'));
      case 'cases': return await casesView(decodeURIComponent(parts[1] || ''));
      case 'review': return await reviewView(decodeURIComponent(parts[1] || ''));
      case 'c': return await categoryView(decodeURIComponent(parts[1] || ''));
      case 't': return await threadView(parseInt(parts[1], 10), parts[2] || (/#/.test(parts[1]) ? parts[1].split('#')[1] : ''));
      case 'log': return state.hasModLog ? await logView() : await homeView();
      case 'reports': return can('moderator') ? await reportsView() : render(notice('Moderators only.'));
      case 'research': return (can('researcher') || can('reviewer'))
        ? (parts[1] ? await researchItemView(+parts[1]) : await researchView()) : render(notice('Research desk members only.'));
      case 'private': return parts[1] === 'team' ? await teamFileView(decodeURIComponent(parts[2] || '')) : (parts[1] ? await privateNoteView(+parts[1]) : await privateResearchView());
      case 'projects': return CL && (can('researcher') || can('reviewer')) ? await CL.projectsView() : render(notice('Research desk members only.'));
      case 'todo': return isSuper() && TODO ? await TODO.view() : render(notice('Super admins only.'));
      case 'admin': return can('admin') ? await adminView() : render(notice('Admins only.'));
      case 'account': return accountView();
      case 'password': return passwordView(false);
      case 'signup': return await homeView();
      case 'signout': return await signOut();
      default: return render(notice('Page not found.'));
    }
  } catch (err) { render(notice(friendly(err))); }
}

// Deal with whatever an emailed sign-in link put in the address bar, then tidy it away.
async function readSignInLink() {
  const query = new URLSearchParams(location.search);
  const frag = new URLSearchParams(location.hash.replace(/^#\/?/, ''));
  let problem = query.get('error_description') || frag.get('error_description');
  const code = query.get('code');
  if (!problem && code) {
    // A link from the older code-exchange flow; it only works in the browser that asked for it.
    const { data: { session } } = await sb.auth.getSession();
    if (!session) {
      const { error } = await sb.auth.exchangeCodeForSession(code);
      if (error) problem = 'That sign-in link can only be used in the browser it was requested from, or it has expired.';
    }
  }
  if (frag.get('type') === 'recovery') recovering = true;
  if (location.search || frag.has('access_token') || frag.has('error')) {
    await sb.auth.getSession(); // let the library finish reading the link first
    history.replaceState(null, '', location.pathname + '#/');
  }
  if (!problem) return null;
  problem = problem.replace(/\+/g, ' ').trim();
  return (/[.!?]$/.test(problem) ? problem : problem + '.') + ' Please request a new sign-in link below.';
}

// A deep link (for example #/cases/ludlow from a case page) is kept through sign-in, including the
// emailed sign-in link, and opened once the member is in. Only the address is kept, for one day.
const AFTER = 'theway.after';
const DEEP = /^#\/[a-z]+(\/[A-Za-z0-9_-]{1,80})?$|^#\/status\/[A-Za-z0-9_-]{1,400}(\/[a-z_]{1,20})?$/;
function keepTarget() {
  if (!DEEP.test(location.hash) || location.hash === '#/' || location.hash === '#/signup') return;
  try { localStorage.setItem(AFTER, JSON.stringify({ hash: location.hash, at: Date.now() })); } catch {}
}
function takeTarget() {
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(AFTER) || 'null'); localStorage.removeItem(AFTER); } catch {}
  if (!saved || !DEEP.test(saved.hash || '') || Date.now() - saved.at > 864e5) return;
  if (location.hash === '' || location.hash === '#' || location.hash === '#/') history.replaceState(null, '', location.pathname + saved.hash);
}

async function boot() {
  delete app.dataset.view;
  keepTarget();
  takeInviteFromLink();
  let linkProblem = null;
  try { linkProblem = await readSignInLink(); } catch (err) { linkProblem = friendly(err); }
  try { await loadMe(); } catch (err) { render(notice(friendly(err))); return; }
  drawNav();
  if (!state.user) { await signInView(); if (linkProblem) app.prepend(notice(linkProblem)); return; }
  if (!state.me) return await joinView();
  if (state.me.status !== 'active') {
    return render(h('h1', { text: 'Account paused' }),
      h('p', { class: 'lede', text: 'An administrator has suspended this account. Every suspension is recorded with its reason in the moderation log.' }),
      h('button', { onclick: signOut }, 'Sign out'));
  }
  if (recovering) return passwordView(true);
  // An existing member who opened a role-invitation link: use the saved code once, then forget it.
  const pending = savedInvite();
  if (pending) {
    forgetInvite();
    try {
      const got = await q(sb.rpc('redeem_role_invite', { code: pending }));
      await loadMe(); drawNav();
      setTimeout(() => app.prepend(notice(`Your invitation worked. You now have the ${roleName(got)} role.`, 'ok')), 300);
    } catch { /* an ordinary site link, or already used: nothing to do */ }
  }
  takeTarget();
  return route();
}

window.addEventListener('hashchange', () => {
  if (state.me && state.me.status === 'active') route();
  else if (!state.user && app.dataset.view === 'signin') {
    // Already showing the sign-in page: redrawing it would delete the human-check widget mid-challenge (the page's own skip links
    // change the hash). Only the bar's Sign up link (#/signup) does something: open the Create an account step.
    if (location.hash === '#/signup') { const b = app.querySelector('[data-create-start]'); if (b && !b.hidden) b.click(); }
  }
  else boot(); // signed out: every address shows the sign-in page
});
boot();
})();
