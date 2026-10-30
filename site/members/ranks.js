// "How the ranking works": ranks, points and titles in plain words, plus the title picker for signed-in members.
(() => {
'use strict';
const cfg = window.THE_WAY_CONFIG;
const app = document.getElementById('app');
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
const RANKS = [
  ['Member', 'Everyone starts here. You can read, join the Commons, and review articles.'],
  ['Author', 'You send in articles and sources. You get this when 3 different reviewers have accepted 10 of your reviews, and you have been a member for 7 days.'],
  ['Deshi', 'Deshi is Japanese for student. You check and publish work. You get this after 14 days as an Author, 10 accepted submissions signed by 3 different reviewers, and 30 days as a member.'],
  ['Renshi', 'An editor. You get this after 60 days as a Deshi, 25 accepted submissions signed by 5 different reviewers, and 90 days as a member. A super admin makes the final yes.'],
  ['Researcher', 'This one is given by hand. A Researcher checks sources on items marked "needs review".']
];
const POINTS = [
  ['A review of an article, accepted', '3'], ['A submitted article, accepted', '8'], ['A submitted source, accepted', '5'],
  ['A source you checked, and another reviewer agreed', '3'], ['A correction you reported, accepted', '8'], ['A revision you wrote, published', '4'],
  ['A "Pull a Thread" link, accepted', '3'], ['Welcome bonus: each accepted review in your first 10 days (up to 10 reviews)', '10 extra'],
  ['A made-up quote or source', '-25, and you cannot ask for a new rank for 180 days']
];
const intro = [
  h('p', { class: 'overline', text: 'Members' }), h('h1', { text: 'How the ranking works' }),
  h('p', { class: 'lede', text: 'Points show honest work that someone else checked. They do not show who is smarter. Facts are facts, said by AI, a 6th grader, or a professor.' })
];
const ranks = h('section', { class: 'panel' }, h('h2', { text: 'Ranks' }), h('ul', { class: 'list' }, RANKS.map(([n, t]) => h('li', {}, h('b', { text: n }), h('p', { class: 'muted', text: t })))));
const points = h('section', { class: 'panel' }, h('h2', { text: 'Points' }),
  h('p', { class: 'muted', text: 'You earn points only after a different person checks your work and says yes. You can never check your own. Points do not buy rank by themselves. Rank needs accepted work from several different reviewers.' }),
  h('ul', { class: 'list' }, POINTS.map(([a, b]) => h('li', {}, h('span', { text: a }), ' ', h('b', { text: b })))));
const titlesInfo = h('section', { class: 'panel' }, h('h2', { text: 'Titles' }),
  h('p', { class: 'muted', text: 'Your title shows next to your name. You can hold more than one. Your rank is a title. Some titles are special and one-of-a-kind. You choose which one shows.' }));
const way = h('p', {}, h('a', { class: 'button quiet', href: '/members/welcome.html?again=1', text: 'Show me the way' }));
const mine = h('div');
app.replaceChildren(h('div', { class: 'wl' }, intro, mine, ranks, points, titlesInfo, way));

async function signedIn() {
  if (!cfg || !window.supabase) return;
  const sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, { auth: { persistSession: true, autoRefreshToken: false } });
  const { data: sess } = await window.WaySession.getSession(sb);
  if (!sess || !sess.session) { titlesInfo.append(h('p', {}, h('a', { href: '/members/', text: 'Sign in' }), ' to choose your title.')); return; }
  const k = await sb.rpc('my_karma');
  const row = k.data && k.data[0];
  if (row) mine.replaceChildren(h('section', { class: 'panel' }, h('h2', { text: 'Your points' }), h('p', {}, h('b', { text: String(row.total) }), ` points. ${row.last_30_days} in the last 30 days.`)));
  const t = await sb.rpc('my_titles');
  if (t.error) return;
  const msg = h('p', { class: 'small', role: 'status' });
  const list = h('ul', { class: 'list' });
  for (const x of t.data) {
    const id = `title-${x.slug}`;
    const inp = h('input', { type: 'radio', name: 'title', id, value: x.slug });
    inp.checked = !!x.shown;
    inp.addEventListener('change', async () => {
      msg.textContent = 'Saving…';
      const r = await sb.rpc('set_shown_title', { p_slug: x.slug });
      msg.textContent = r.error ? 'We could not save that. Please try again.' : `Saved. "${x.label}" now shows next to your name.`;
    });
    list.append(h('li', { class: 'wrf-opt' }, inp, h('label', { for: id }, h('b', { text: x.label }), x.kind === 'award' ? h('span', { class: 'tag', text: ' special' }) : null, h('span', { class: 'muted', text: ' ' + x.description }))));
  }
  titlesInfo.append(h('h3', { text: 'Your titles' }), list, msg);
}
signedIn().catch(() => {});
})();
