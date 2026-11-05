// Admin > Facebook (super admins only). Shows the Page numbers and the comment inbox that the fb-insights Edge Function
// pulls from the Facebook Graph API (migration 0098), and lets a super admin mark items read and reply to a comment.
// Plain JavaScript, no build step. Every piece of text goes into the page with textContent, never innerHTML.
// app.js hands over its helpers once: TheWayFb.make({ sb, h, q, when, action }).
// No Facebook token is ever in the browser: replies go through the Edge Function, which holds it as a secret.
(() => {
'use strict';

const num = (n) => Number(n || 0).toLocaleString();
// Only a Facebook or Bluesky address becomes a link.
const fbHref = (u) => (/^https:\/\/((www\.|m\.)?facebook\.com|bsky\.app)\/[^\s]*$/i.test(u || '') ? u : null);
const DAY = 86400000;
const iso = (d) => d.toISOString().slice(0, 10);
const LABELS = {
  followers_count: 'Followers now',
  page_follows: 'Followers (end of day)',
  page_daily_follows_unique: 'New followers',
  page_daily_unfollows_unique: 'Lost followers',
  page_media_view: 'Content views',
  page_total_media_view_unique: 'People who viewed',
  page_post_engagements: 'Post engagements',
  page_views_total: 'Page visits',
};
const SUMMED = ['page_daily_follows_unique', 'page_daily_unfollows_unique', 'page_media_view', 'page_post_engagements', 'page_views_total'];

function make(ctx) {
  const { sb, h, q, when, action } = ctx;

  async function unread() {
    const { count, error } = await sb.from('fb_inbox').select('id', { count: 'exact', head: true }).is('read_at', null);
    return error ? null : count;
  }
  // Put "(N new)" on the Admin section heading. Quiet if anything is missing.
  async function badge(root) {
    try {
      const n = await unread();
      if (!n) return;
      for (const t of (root || document).querySelectorAll('.adm-toggle span:not(.adm-arrow), .md-tabbtn span')) {
        if (/^Post online/.test(t.textContent) && !/new\)$/.test(t.textContent)) t.textContent += ` (${n} new)`;
      }
    } catch { /* not installed yet */ }
  }

  function panel(opts) {
    const root = h('div', { class: 'fb-root' });
    const status = h('p', { class: 'muted small' });
    const body = h('div');
    let busy = false;
    const onlyNew = { bluesky: true, facebook: true };

    async function load() {
      status.textContent = 'Loading...';
      try {
        const from = iso(new Date(Date.now() - 29 * DAY));
        const [meta, nums, inbox] = await Promise.all([
          q(sb.from('fb_meta').select('*').eq('id', 1)),
          q(sb.from('fb_insights_daily').select('day,metric,value').gte('day', from).order('day')),
          q(sb.from('fb_inbox').select('*').order('posted_at', { ascending: false }).limit(200)),
        ]);
        const m = meta[0];
        fbOk.v = !!(m && m.ok); syncTicks();   // Facebook can be ticked only once a pull has worked
        status.textContent = !m ? 'No data yet. Press "Refresh now" once the Edge Function and its secrets are set up.'
          : `${m.ok ? 'Last refreshed' : 'Last attempt failed'} ${when(m.refreshed_at)}${m.note ? `. ${m.note}` : ''}`;
        draw(nums, inbox);
      } catch (e) {
        status.textContent = `Could not load: ${e.message || e}. If this is the first time, run supabase/migrations/0098_facebook_page_insights.sql in the Supabase SQL editor.`;
      }
    }

    function numbers(nums) {
      if (!nums.length) return h('p', { class: 'muted', text: 'No numbers yet. A brand-new Page may show nothing for a few days; Facebook only gives Insights to Pages with 100 or more likes.' });
      const latest = (metric) => { const r = nums.filter((n) => n.metric === metric); return r.length ? r[r.length - 1].value : null; };
      const last7 = iso(new Date(Date.now() - 6 * DAY));
      const sum7 = (metric) => nums.filter((n) => n.metric === metric && n.day >= last7).reduce((a, n) => a + Number(n.value), 0);
      const tile = (n, label) => h('div', { class: 'as-tile' }, h('strong', { text: n == null ? '-' : num(n) }), h('span', { class: 'small muted', text: label }));
      const followers = latest('followers_count') ?? latest('page_follows');
      const days = [...new Set(nums.map((n) => n.day))].sort().reverse().slice(0, 14);
      const cols = ['page_follows', 'page_daily_follows_unique', 'page_media_view', 'page_post_engagements', 'page_views_total'];
      const val = (d, k) => { const r = nums.find((n) => n.day === d && n.metric === k); return r ? num(r.value) : '-'; };
      return h('div', {},
        h('div', { class: 'as-tiles' }, tile(followers, 'followers'),
          ...SUMMED.map((k) => tile(nums.some((n) => n.metric === k) ? sum7(k) : null, `${LABELS[k].toLowerCase()}, last 7 days`))),
        h('div', { class: 'as-scroll' }, h('table', { class: 'as-table as-byday' },
          h('thead', {}, h('tr', {}, h('th', { text: 'Day' }), cols.map((k) => h('th', { class: 'num', text: LABELS[k] })))),
          h('tbody', {}, days.map((d) => h('tr', {}, h('td', { text: d }), cols.map((k) => h('td', { class: 'num', text: val(d, k) }))))))));
    }

    async function mark(ids, read) {
      await q(sb.rpc('fb_inbox_mark', { p_ids: ids, p_read: read }));
      load();
    }

    function item(r) {
      const slot = h('div');
      const link = fbHref(r.post_link);
      const box = h('textarea', { rows: '3', maxlength: '2000', 'aria-label': 'Your reply', placeholder: 'Reply as the Page' });
      const sendBtn = h('button', { class: 'primary', onclick: action(async () => {
        const message = box.value.trim();
        if (!message) throw new Error('Write a reply first.');
        const bsky = r.platform === 'bluesky';
        const { data, error } = await sb.functions.invoke(bsky ? 'bsky-inbox' : 'fb-insights', { body: bsky ? { action: 'reply', id: r.id, message } : { action: 'reply', comment_id: r.id, message } });
        if (error) throw error;
        if (data && data.ok === false) throw new Error(data.error);
        load();
      }, slot) }, 'Send reply');
      return h('li', { class: r.read_at ? 'fb-item' : 'fb-item fb-new' },
        h('div', { class: 'row' },
          h('strong', { text: r.author_name || 'Someone' }),
          h('span', {}, r.kind === 'visitor_post' ? h('span', { class: 'tag', text: 'post on the Page' }) : r.parent_id ? h('span', { class: 'tag', text: 'reply' }) : h('span', { class: 'tag', text: 'comment' }), ' ',
            r.replied_at ? h('span', { class: 'tag ok', text: 'answered' }) : null, ' ',
            !r.read_at ? h('span', { class: 'tag warn', text: 'new' }) : null)),
        h('div', { class: 'meta', text: when(r.posted_at) }),
        h('p', { text: r.message || '(no text, maybe a photo or sticker)' }),
        r.reply_text ? h('p', { class: 'muted small', text: `You replied: ${r.reply_text}` }) : null,
        h('div', { class: 'btns' },
          link ? h('a', { class: 'button quiet', href: link, target: '_blank', rel: 'noopener noreferrer', text: r.platform === 'bluesky' ? 'Open on Bluesky' : 'Open on Facebook' }) : null,
          h('button', { class: 'quiet', onclick: action(() => mark([r.id], !r.read_at), slot) }, r.read_at ? 'Mark unread' : 'Mark read')),
        r.kind === 'comment' && (r.platform === 'bluesky' ? !!r.ref_cid : /^\d+_\d+$/.test(r.id)) ? h('details', {}, h('summary', { text: r.replied_at ? 'Reply again' : 'Reply' }), box, h('div', { class: 'btns' }, sendBtn)) : null,
        slot);
    }

    // One drop-down per network, built from the same inbox rows (filtered by platform). Each heading shows its own unread count.
    // The open or closed choice is remembered by the admin page helper, under the id given here.
    function draw(nums, inbox) {
      const AT = window.TheWayAdminTools;
      const of = (p) => inbox.filter((r) => (r.platform || 'facebook') === p);
      const unreadOf = (p) => of(p).filter((r) => !r.read_at).length;
      const title = (name, p) => (unreadOf(p) ? `${name} (${unreadOf(p)} new)` : name);
      function inboxPanel(p, blurb) {
        const mine = of(p), fresh = mine.filter((r) => !r.read_at), shown = onlyNew[p] ? fresh : mine;
        const toggle = h('button', { class: 'quiet', onclick: () => { onlyNew[p] = !onlyNew[p]; draw(nums, inbox); } }, onlyNew[p] ? 'Show all' : 'Show only new');
        const markAll = fresh.length ? h('button', { class: 'quiet', onclick: action(() => mark(fresh.map((r) => r.id), true)) }, 'Mark all read') : null;
        return h('div', { class: 'panel' }, h('h3', { text: 'Inbox' }),
          h('p', { class: 'muted small', text: `${fresh.length} new. ${blurb}` }),
          h('div', { class: 'btns' }, toggle, markAll),
          shown.length ? h('ul', { class: 'list' }, shown.map(item)) : h('p', { class: 'muted', text: onlyNew[p] ? 'Nothing new.' : 'Nothing here yet.' }));
      }
      const drop = (id, name, p, nodes) => (AT ? AT.section(id, title(name, p), nodes, { open: false })
        : h('div', {}, h('h3', { text: title(name, p) }), nodes));
      body.replaceChildren(
        drop('post-online-bluesky', 'Bluesky', 'bluesky', [
          inboxPanel('bluesky', 'Replies, mentions and quotes of the Bluesky account. Direct messages are not included.')]),
        drop('post-online-facebook', 'Facebook', 'facebook', [
          fbOk.v ? null : h('p', { class: 'muted', text: 'Facebook is not set up yet.' }),
          inboxPanel('facebook', "Comments on the Page's posts and posts visitors made on the Page. Direct messages are not included."),
          h('div', { class: 'panel' }, h('h3', { text: 'Page numbers' }), numbers(nums))]));
    }

    async function refreshNow() {
      if (busy) return; busy = true; refresh.disabled = true; status.textContent = 'Asking Facebook...';
      try { await sb.functions.invoke('bsky-inbox', { body: { action: 'pull' } }); } catch { /* Bluesky not set up yet */ }
      let notSetUp = false;
      try {
        const { data, error } = await sb.functions.invoke('fb-insights', { body: { action: 'pull', days: 30 } });
        if (error) throw error;
        if (data && data.ok === false) throw new Error(data.error);
      } catch (e) {
        // The function not being deployed, or its secrets not being added yet, is a setup state, not a failure.
        const m = String((e && e.message) || e);
        if (!/Failed to send a request|Not set up yet|not found/i.test(m)) { status.textContent = `Refresh failed: ${m}`; busy = false; refresh.disabled = false; return; }
        notSetUp = true;
      }
      busy = false; refresh.disabled = false;
      await load();
      if (notSetUp) status.textContent = `Facebook is not set up yet. ${status.textContent}`;
    }
    const refresh = h('button', { class: 'primary', onclick: refreshNow }, 'Refresh now');

    // Ready to post. The queue is the Media page "Social media posts" list (social_posts): only APPROVED posts for Bluesky or
    // Facebook are shown, each with a Post button. Posting is outward-facing, so it still asks first; then the post is marked
    // posted (the database records the time and who). An AI-made post gets the AI label added, as the Media page rule says.
    const SITE = 'https://michiinstitute.com';
    const REVIEW = { checked: 'Checked by a person', ai_unreviewed: 'AI quick check, not yet reviewed by a person' };
    const AI_LABEL = '\n\n(AI-written)';
    const charsOf = (s) => [...s].length;
    const textOf = (x) => {
      let t = x.body;
      if (x.link_path && x.link_title) t += `\n${x.link_title}\n${SITE}${x.link_path}`;
      else if (x.source_url) t += `\n${x.source_url}`;
      return x.source === 'llm' ? t + AI_LABEL : t;
    };
    // One set of tick boxes at the top of the section says who a post goes to. It governs both the Ready to post list and the
    // New post box. Facebook stays unticked and disabled until its function has pulled successfully once (fb_meta.ok).
    const sel = { bs: true, fb: false }, fbOk = { v: false }, onChange = [];
    const tickBs = h('input', { type: 'checkbox', id: 'po-bs', checked: 'checked' });
    const tickFb = h('input', { type: 'checkbox', id: 'po-fb', disabled: 'disabled' });
    const fbNote = h('span', { class: 'muted small', text: ' Facebook is not set up yet, so it cannot be ticked.' });
    function syncTicks() {
      tickBs.checked = sel.bs;
      tickFb.disabled = !fbOk.v;
      tickFb.checked = fbOk.v && sel.fb;
      fbNote.hidden = fbOk.v;
      onChange.forEach((f) => f());
    }
    tickBs.addEventListener('change', () => { sel.bs = tickBs.checked; syncTicks(); });
    tickFb.addEventListener('change', () => { sel.fb = tickFb.checked; syncTicks(); });
    const ticksBar = h('div', { class: 'panel fb-ticks' }, h('strong', { text: 'Post to:' }), ' ',
      h('label', {}, tickBs, ' Bluesky'), ' ', h('label', {}, tickFb, ' Facebook'), fbNote);
    const PLACE = { bluesky: 'Bluesky', facebook: 'Facebook' };
    const FN = { bluesky: 'bsky-inbox', facebook: 'fb-insights' };
    // Send one text to the ticked places. Returns { done: [...], failed: ['Facebook: reason', ...] }.
    async function publish(places, message) {
      const done = [], failed = [];
      for (const p of places) {
        try {
          const { data, error } = await sb.functions.invoke(FN[p], { body: { action: 'post', message } });
          if (error) throw error;
          if (data && data.ok === false) throw new Error(data.error);
          done.push(p);
        } catch (e) { failed.push(`${PLACE[p]}: ${e.message || e}`); }
      }
      return { done, failed };
    }
    const resultText = (r, pending) => `${r.done.length ? `Posted on ${r.done.map((p) => PLACE[p]).join(' and ')}. ` : ''}${r.failed.length ? `Failed: ${r.failed.join(' | ')}${pending ? '. Still pending there.' : ''}` : ''}`;

    function ready() {
      const list = h('div'), slot = h('div');
      let rows = [];
      async function loadReady() {
        try {
          rows = await q(sb.from('social_posts')
            .select('id,platform,body,source,link_path,link_title,source_name,source_url,review_status,posted_platforms')
            .eq('status', 'approved').in('platform', ['bluesky', 'facebook']).order('id', { ascending: true }).limit(100));
          draw();
        } catch (e) {
          list.replaceChildren(h('p', { class: 'muted', text: `Could not load the list: ${e.message || e}. Have migrations 0100 and 0101 been run?` }));
        }
      }
      let focusId = null;
      function draw() {
        list.replaceChildren(rows.length ? h('ul', { class: 'list' }, rows.map(one))
          : h('p', { class: 'muted', text: 'Nothing approved and waiting. Approve a post on the Posts tab and it shows up here.' }));
        if (focusId != null) {
          const li = list.querySelector(`[data-id="${Number(focusId)}"]`);
          focusId = null;
          if (li) { li.classList.add('fb-focus'); li.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
        }
      }
      onChange.push(draw);
      // The Media page says when the approved list changed (a post was approved, or the Post online tab was opened).
      window.addEventListener('way-social-changed', (e) => {
        if (!list.isConnected) return;   // not on screen; it reloads when the tab is opened
        focusId = e.detail && e.detail.focusId;
        loadReady();
      });
      function one(x) {
        const text = textOf(x), n = charsOf(text);
        const had = new Set(x.posted_platforms || []);
        // places this click would publish to: ticked, available, and not already done for this item
        const places = [sel.bs && !had.has('bluesky') ? 'bluesky' : null, sel.fb && fbOk.v && !had.has('facebook') ? 'facebook' : null].filter(Boolean);
        const overBsky = places.includes('bluesky') && n > 300;
        const why = overBsky ? `Too long for Bluesky (${n} of 300). Shorten it on the Media page, or untick Bluesky.`
          : !places.length ? (had.size && (sel.bs || sel.fb) ? 'Already posted on the ticked places.' : 'Tick Bluesky or Facebook above.') : '';
        const res = h('div');
        const go = h('button', { class: 'primary', disabled: why ? 'disabled' : null, onclick: action(async () => {
          if (!confirm(`Publish this now on ${places.map((p) => PLACE[p]).join(' and ')}? It goes live right away.\n\n${text}`)) return;
          const r = await publish(places, text);
          const nowHad = [...had, ...r.done];
          if (r.done.length) {
            // record what succeeded; the post counts as posted only when every ticked place succeeded
            const patch = { posted_platforms: nowHad };
            if (!r.failed.length) patch.status = 'posted';
            try { await q(sb.from('social_posts').update(patch).eq('id', x.id)); }
            catch (e) { r.failed.push(`could not save the result: ${e.message || e}`); }
          }
          slot.replaceChildren(h('p', { class: r.failed.length ? 'md-warn' : 'tag ok', text: resultText(r, true) }));
          await loadReady();
        }, slot) }, 'Post');
        return h('li', { class: 'fb-item', 'data-id': String(x.id) },
          h('div', { class: 'row' }, h('span', {},
            x.review_status ? h('span', { class: x.review_status === 'checked' ? 'tag ok' : 'tag warn', text: REVIEW[x.review_status] }) : null, ' ',
            x.source === 'llm' ? h('span', { class: 'tag', text: 'AI-made: label added' }) : null, ' ',
            had.size ? h('span', { class: 'tag ok', text: `Posted on ${[...had].map((p) => PLACE[p]).join(' and ')}` }) : null)),
          h('p', { class: 'fb-text', text: text }),
          x.source_name ? h('p', { class: 'muted small', text: `Source: ${x.source_name}` }) : null,
          h('p', { class: overBsky ? 'small md-warn' : 'muted small', text: `${n} characters. Bluesky allows 300.` }),
          why ? h('p', { class: 'small md-warn', text: why }) : null,
          h('div', { class: 'btns' }, go), res);
      }
      loadReady();
      return h('div', { class: 'panel' }, h('h3', { text: 'Ready to post' }),
        h('p', { class: 'muted small', text: 'Approved posts from the Media page. One click publishes to the places ticked above, after a quick confirm. A post is marked posted, with the time and who did it, once every ticked place has it.' }),
        list, slot);
    }

    // New post. Kept out of `body` so a refresh never wipes what is being typed. Publishing is outward-facing, so it asks first.
    function composer() {
      const slot = h('div');
      const box = h('textarea', { rows: '4', maxlength: '5000', 'aria-label': 'New post', placeholder: 'Write a post' });
      const count = h('span', { class: 'muted small' });
      const onAi = h('input', { type: 'checkbox', id: 'fb-post-ai' });
      const AI = '\n\n(AI-written)';   // the label our rules require on a post an AI wrote
      const chars = (s) => [...s].length;
      const withLabel = (s) => (onAi.checked ? s + AI : s);
      const upd = () => { count.textContent = `${chars(withLabel(box.value.trim()))} characters. Bluesky allows 300.`; };
      onAi.addEventListener('change', upd);
      box.addEventListener('input', upd); upd();
      const send = h('button', { class: 'primary', onclick: action(async () => {
        const text = box.value.trim();
        if (!text) throw new Error('Write something first.');
        const message = withLabel(text);
        const places = [sel.bs ? 'bluesky' : null, sel.fb && fbOk.v ? 'facebook' : null].filter(Boolean);
        if (!places.length) throw new Error('Tick Bluesky or Facebook at the top first.');
        if (places.includes('bluesky') && chars(message) > 300) throw new Error('Bluesky posts are 300 characters at most. Shorten it or untick Bluesky at the top.');
        if (!confirm(`Publish this now on ${places.map((p) => PLACE[p]).join(' and ')}? It goes live right away.`)) return;
        const r = await publish(places, message);
        if (!r.failed.length) box.value = '';
        upd();
        slot.replaceChildren(h('p', { class: r.failed.length ? 'md-warn' : 'tag ok', text: resultText(r, false) }));
      }, slot) }, 'Post');
      return h('div', { class: 'panel' }, h('h3', { text: 'New post' }),
        h('p', { class: 'muted small', text: 'Publishes right away to the places ticked at the top, as the Michi Institute account. Facebook also needs the pages_manage_posts permission on the Page token.' }),
        box, count,
        h('div', { class: 'btns' }, h('label', {}, onAi, ' AI-written (adds the AI label)'), ' ', send), slot);
    }

    if (opts && opts.postOnly) {   // Media Director: posting only, no inbox or page numbers
      root.append(h('h2', { text: 'Post online' }),
        h('p', { class: 'muted small', text: 'Tick where to post, then send approved posts or write a new one. Each post asks first and is marked posted with the time and who.' }),
        ticksBar, ready(), composer());
      syncTicks();
      return root;
    }
    root.append(
      h('h2', { text: 'Post online' }),
      h('p', { class: 'muted small', text: 'Tick where to post, then send approved posts or write a new one. Below, each network has its own drop-down for replies and incoming items (Facebook also has the Page numbers). Those are pulled on a schedule and when you press Refresh.' }),
      h('div', { class: 'btns' }, refresh), status, ticksBar, ready(), composer(), body);
    syncTicks();
    load();
    return root;
  }

  return { panel, badge };
}

window.TheWayFb = { make };
})();
