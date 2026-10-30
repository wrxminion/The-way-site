// "Show me the way": the short welcome after sign-up. One question at a time. Every screen can be skipped.
// Progress is saved to the database after each step (0061) so a closed tab or a refresh picks up where the member left off.
// The review at the end is a REAL review of a real article. Points come only after a different reviewer accepts it.
(() => {
'use strict';
const cfg = window.THE_WAY_CONFIG;
const app = document.getElementById('app');
if (!cfg || /YOUR-PROJECT/.test(cfg.supabaseUrl)) { app.textContent = 'Setup needed.'; return; }
const sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, { auth: { persistSession: true, autoRefreshToken: false } });
const HOME = '/members/';
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
const put = (...kids) => { app.replaceChildren(h('div', { class: 'wl' }, ...kids.flat().filter((x) => x != null && x !== false))); window.scrollTo(0, 0); app.focus({ preventScroll: true }); };

const WHY = [['review', 'To review articles'], ['community', 'For community'], ['learn', 'To learn'], ['elections', 'To follow the elections'], ['other', 'Something else']];
const S = { user: null, reason: null, interests: '' };

// Saving must never block the member. If it fails we keep going and the page still works.
async function save(step, extra = {}) {
  try { await sb.rpc('save_onboarding', { p_reason: S.reason, p_interests: S.interests || null, p_step: step, p_skipped: !!extra.skipped }); } catch { /* keep going */ }
}
async function leave(skipped) { await save('done', { skipped }); location.href = HOME; }

function skipBar(label) {
  return h('div', { class: 'wl-bar' }, h('button', { type: 'button', class: 'wl-skip', text: label || 'Skip. Take me to Home.', onclick: () => leave(true) }));
}

function whyScreen() {
  put(h('p', { class: 'overline', text: 'Welcome' }), h('h1', { text: 'Why did you join The Way?' }),
    h('p', { class: 'lede', text: 'One quick question. There is no wrong answer. We only use it to show you around.' }),
    h('div', { class: 'wl-opts' }, WHY.map(([v, label]) => h('button', { type: 'button', class: 'wl-opt', text: label, onclick: async () => {
      S.reason = v;
      if (v === 'review') { await save('interests'); interestsScreen(); } else { await save('tour'); pathScreen(); }
    } }))),
    skipBar());
}

function interestsScreen() {
  const box = h('textarea', { maxlength: 500, 'aria-label': 'What kinds of articles do you like?', placeholder: 'For example: the economy, schools, the courts, my state. Write anything you like.' });
  box.value = S.interests || '';
  put(h('p', { class: 'wl-dots', text: 'Step 2 of 3' }), h('h1', { text: 'What kinds of articles do you like to read?' }),
    h('p', { class: 'muted', text: 'This is optional. Only our team can see it. We never show it to other members.' }), box,
    h('div', { class: 'wl-bar' },
      h('button', { type: 'button', class: 'primary', text: 'Next', onclick: async () => { S.interests = box.value.trim().slice(0, 500); await save('tour'); articlesScreen(); } }),
      h('button', { type: 'button', class: 'quiet', text: 'Skip this question', onclick: async () => { await save('tour'); articlesScreen(); } }),
      h('button', { type: 'button', class: 'quiet', text: 'Back', onclick: whyScreen })),
    skipBar());
}

async function loadArticles() {
  const r = await fetch('/news/data/latest.json', { cache: 'no-cache' });
  if (!r.ok) throw new Error('news');
  const j = await r.json();
  const seen = new Set(); const out = [];
  for (const it of (j.items || [])) {
    if (!it || !it.id || !/^[a-z0-9]{6,64}$/.test(it.id) || !it.title || !it.url || !/^https?:\/\//.test(it.url)) continue;
    if (seen.has(it.source)) continue;            // different sources, so the list is not five stories from one paper
    seen.add(it.source); out.push(it);
    if (out.length >= 14) break;
  }
  // Leave out anything this member already reviewed. If the check is not available yet, keep the list.
  const mine = await Promise.all(out.map((it) => sb.rpc('my_read_check', { p_item: `news:${it.id}` }).then((x) => !!(x.data && x.data[0]), () => false)));
  return out.filter((_, i) => !mine[i]).slice(0, 5);
}

async function articlesScreen() {
  put(h('p', { class: 'wl-dots', text: 'Step 3 of 3' }), h('p', { class: 'muted', text: 'Loading articles…' }));
  let list = [];
  try { list = await loadArticles(); } catch { list = []; }
  if (!list.length) {
    put(h('h1', { text: 'No articles are waiting right now' }), h('p', { class: 'lede', text: 'That is fine. You can review one any time from Home.' }),
      h('div', { class: 'wl-bar' }, h('button', { type: 'button', class: 'primary', text: 'Go to Home', onclick: () => leave(false) })));
    return;
  }
  const rows = list.map((it) => h('li', {},
    h('div', { class: 'wl-qt' }, h('b', { text: it.title }), h('span', { text: `${it.source || 'News'}${it.published_at ? ' · ' + it.published_at : ''}` })),
    h('button', { type: 'button', class: 'primary', text: 'Review this one', onclick: () => reviewScreen(it, list) })));
  put(h('p', { class: 'wl-dots', text: 'Step 3 of 3' }), h('h1', { text: 'Your review page' }),
    h('p', { class: 'lede', text: 'This is what your article review page looks like. These are real articles waiting for a review.' }),
    h('p', { class: 'wl-note', text: 'You can review one now, or just go to Home. Both are fine.' }),
    h('ul', { class: 'wl-queue' }, rows),
    h('div', { class: 'wl-bar' },
      h('button', { type: 'button', class: 'primary', text: 'Read. Take me to Home.', onclick: () => leave(false) }),
      h('button', { type: 'button', class: 'quiet', text: 'Back', onclick: interestsScreen })));
}

function reviewScreen(it, list) {
  const form = window.WayReviewForm.build({ sb, user: S.user, itemId: it.id, title: it.title, url: it.url, onDone: () => thanksScreen() });
  put(h('p', { class: 'wl-dots', text: 'Your review' }), form,
    h('div', { class: 'wl-bar' }, h('button', { type: 'button', class: 'quiet', text: 'Back to the list', onclick: () => articlesScreen() }), h('button', { type: 'button', class: 'wl-skip', text: 'Skip. Take me to Home.', onclick: () => leave(true) })));
}

async function thanksScreen() {
  await save('done');
  put(h('h1', { text: 'Thank you!' }),
    h('p', { class: 'lede', text: 'Your review was sent. A real person on our team will read it. You earn points after they say yes.' }),
    h('p', { class: 'wl-note', text: 'Welcome bonus: in your first 10 days, each accepted review earns 10 extra points, up to 10 reviews.' }),
    h('div', { class: 'wl-bar' }, h('button', { type: 'button', class: 'primary', text: 'Go to Home', onclick: () => { location.href = HOME; } }),
      h('button', { type: 'button', class: 'quiet', text: 'Review another one', onclick: () => articlesScreen() })));
}

const PATHS = {
  community: { t: 'Meet the community', p: 'The Commons is where members talk about news, cases and ideas.', links: [['Go to the Commons', HOME + '#/commons']] },
  learn: { t: 'Start learning', p: 'Our guides explain how government works and how to read a ballot. Our history cases show every source.', links: [['Open the guides', '/guide/'], ['See how ranks work', '/members/ranks.html']] },
  elections: { t: 'Follow the elections', p: 'Build your ballot and see results as they come in.', links: [['Build My Ballot', '/members/my-ballot.html'], ['Election results', '/results/']] },
  other: { t: 'Look around', p: 'Home has your news feed and quick buttons. You can find everything else in the menu.', links: [] }
};
function pathScreen() {
  const p = PATHS[S.reason] || PATHS.other;
  put(h('h1', { text: p.t }), h('p', { class: 'lede', text: p.p }),
    h('div', { class: 'wl-bar' },
      p.links.map(([label, href]) => h('button', { type: 'button', class: 'primary', text: label, onclick: async () => { await save('done'); location.href = href; } })),
      h('button', { type: 'button', class: p.links.length ? 'quiet' : 'primary', text: 'Go to Home', onclick: () => leave(false) }),
      h('button', { type: 'button', class: 'quiet', text: 'Back', onclick: whyScreen })),
    h('p', { class: 'muted small', text: 'You can come back to this any time from "Show me the way" on the Ranks page.' }));
}

(async () => {
  const { data: sess } = await window.WaySession.getSession(sb);
  if (!sess || !sess.session) { put(h('h1', { text: 'Welcome' }), h('p', {}, h('a', { href: HOME, text: 'Sign in' }), ' to see the welcome.')); return; }
  S.user = sess.session.user;
  let step = 'why';
  if (!/[?&]again=1/.test(location.search)) {
    try {
      const o = await sb.rpc('my_onboarding');
      const row = o.data && o.data[0];
      if (row) { S.reason = row.reason; S.interests = row.interests || ''; if (row.finished) { location.replace(HOME); return; } step = row.step; }
    } catch { /* start from the top */ }
  }
  if (step === 'interests' && S.reason === 'review') interestsScreen();
  else if (step === 'tour' && S.reason === 'review') articlesScreen();
  else if (step === 'tour' && S.reason) pathScreen();
  else whyScreen();
})().catch(() => whyScreen());
})();
