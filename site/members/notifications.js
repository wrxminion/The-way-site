// Notifications (notifications.html): replies and updates for the signed-in member. Notices come only from the site
// itself (for example, a reply to a Pull a Thread you asked about). There are no direct messages between members,
// on purpose: everything on The Way is open to everyone. All text goes on the page with textContent.
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
const keepCount = (n) => { try { localStorage.setItem('theway.unread', JSON.stringify({ n, t: Date.now() })); } catch { /* ignore */ } };
const status = h('p', { class: 'small', role: 'status', 'aria-live': 'polite' });
let unreadOnly = false;

async function load() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) { app.replaceChildren(h('h1', { text: 'Notifications' }), h('p', {}, 'Please ', h('a', { href: '/members/', text: 'sign in' }), ' to see yours.')); return; }
  const { data, error } = await sb.rpc('my_notifications', { p_unread_only: unreadOnly, p_limit: 100 });
  if (error) { app.replaceChildren(h('h1', { text: 'Notifications' }), h('p', { class: 'muted', text: 'Could not load them right now.' })); return; }
  const unread = data.filter((n) => !n.read_at).length;
  if (!unreadOnly) keepCount(unread);
  const items = data.map((n) => h('li', { class: 'pt-note', 'data-unread': n.read_at ? null : '1' },
    h('div', { class: 'row' }, h('strong', {}, n.link ? h('a', { href: n.link, text: n.title }) : n.title), h('span', { class: 'muted small', text: when(n.created_at) })),
    n.body ? h('p', { text: n.body }) : null,
    n.read_at ? null : h('span', { class: 'tag ok', text: 'new' })));
  app.replaceChildren(
    h('p', { class: 'overline', text: 'You' }),
    h('h1', { text: 'Notifications' }),
    h('p', { class: 'lede', text: 'Replies and updates from the site. No one can message you here, and you cannot message anyone: everything on The Way stays open to everyone.' }),
    h('div', { class: 'btns' },
      h('button', { type: 'button', 'aria-pressed': String(!unreadOnly), onclick: () => { unreadOnly = false; load(); }, text: 'All' }),
      h('button', { type: 'button', 'aria-pressed': String(unreadOnly), onclick: () => { unreadOnly = true; load(); }, text: 'Unread' }),
      unread ? h('button', { type: 'button', class: 'quiet', onclick: async () => {
        const { error: e } = await sb.rpc('mark_notifications_read', { p_ids: null });
        status.textContent = e ? 'Could not mark them read.' : 'All marked read.'; if (!e) keepCount(0); load();
      }, text: 'Mark all read' }) : null),
    status,
    items.length ? h('ul', { class: 'list panel' }, items) : h('p', { class: 'muted', text: unreadOnly ? 'Nothing unread.' : 'Nothing yet. When we reply to something you asked about, it will show up here.' }));
}
load();
})();
