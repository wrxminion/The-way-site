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
      for (const t of (root || document).querySelectorAll('.adm-toggle span:not(.adm-arrow)')) {
        if (/^Post online/.test(t.textContent) && !/new\)$/.test(t.textContent)) t.textContent += ` (${n} new)`;
      }
    } catch { /* not installed yet */ }
  }

  function panel() {
    const root = h('div', { class: 'fb-root' });
    const status = h('p', { class: 'muted small' });
    const body = h('div');
    let busy = false, onlyNew = true;

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
          h('strong', { text: r.author_name || 'Someone' }), r.platform === 'bluesky' ? h('span', { class: 'tag', text: 'Bluesky' }) : null,
          h('span', {}, r.kind === 'visitor_post' ? h('span', { class: 'tag', text: 'post on the Page' }) : r.parent_id ? h('span', { class: 'tag', text: 'reply' }) : h('span', { class: 'tag', text: 'comment' }), ' ',
            r.replied_at ? h('span', { class: 'tag ok', text: 'answered' }) : null, ' ',
            !r.read_at ? h('span', { class: 'tag warn', text: 'new' }) : null)),
        h('div', { class: 'meta', text: when(r.posted_at) }),
        h('p', { text: r.message || '(no text, maybe a photo or sticker)' }),
        r.reply_text ? h('p', { class: 'muted small', text: `You replied: ${r.reply_text}` }) : null,
        h('div', { class: 'btns' },
          link ? h('a', { class: 'button quiet', href: link, target: '_blank', rel: 'noopener noreferrer', text: 'Open on Facebook' }) : null,
          h('button', { class: 'quiet', onclick: action(() => mark([r.id], !r.read_at), slot) }, r.read_at ? 'Mark unread' : 'Mark read')),
        r.kind === 'comment' && (r.platform === 'bluesky' ? !!r.ref_cid : /^\d+_\d+$/.test(r.id)) ? h('details', {}, h('summary', { text: r.replied_at ? 'Reply again' : 'Reply' }), box, h('div', { class: 'btns' }, sendBtn)) : null,
        slot);
    }

    function draw(nums, inbox) {
      const fresh = inbox.filter((r) => !r.read_at);
      const shown = onlyNew ? fresh : inbox;
      const toggle = h('button', { class: 'quiet', onclick: () => { onlyNew = !onlyNew; draw(nums, inbox); } }, onlyNew ? 'Show all' : 'Show only new');
      const markAll = fresh.length ? h('button', { class: 'quiet', onclick: action(() => mark(fresh.map((r) => r.id), true)) }, 'Mark all read') : null;
      body.replaceChildren(
        h('div', { class: 'panel' }, h('h3', { text: 'Inbox' }),
          h('p', { class: 'muted small', text: `${fresh.length} new. Comments on the Page's posts and posts visitors made on the Page, pulled from Facebook about every few hours. Direct messages are not included.` }),
          h('div', { class: 'btns' }, toggle, markAll),
          shown.length ? h('ul', { class: 'list' }, shown.map(item)) : h('p', { class: 'muted', text: onlyNew ? 'Nothing new.' : 'Nothing here yet.' })),
        h('div', { class: 'panel' }, h('h3', { text: 'Page numbers' }), numbers(nums)));
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
    function ready() {
      const list = h('div'), slot = h('div');
      async function loadReady() {
        try {
          const rows = await q(sb.from('social_posts')
            .select('id,platform,body,source,link_path,link_title,source_name,source_url,review_status')
            .eq('status', 'approved').in('platform', ['bluesky', 'facebook']).order('id', { ascending: true }).limit(100));
          list.replaceChildren(rows.length ? h('ul', { class: 'list' }, rows.map(one))
            : h('p', { class: 'muted', text: 'Nothing approved and waiting. Approve a post on the Media page (Social media posts) and it shows up here.' }));
        } catch (e) {
          list.replaceChildren(h('p', { class: 'muted', text: `Could not load the list: ${e.message || e}. Has migration 0100 been run?` }));
        }
      }
      function one(x) {
        const text = textOf(x), n = charsOf(text), bsky = x.platform === 'bluesky';
        const tooLong = bsky && n > 300;
        const res = h('div');
        const go = h('button', { class: 'primary', disabled: tooLong ? 'disabled' : null, onclick: action(async () => {
          if (!confirm(`Publish this now on ${bsky ? 'Bluesky' : 'Facebook'}? It goes live right away.\n\n${text}`)) return;
          const { data, error } = await sb.functions.invoke(bsky ? 'bsky-inbox' : 'fb-insights', { body: { action: 'post', message: text } });
          if (error) throw error;
          if (data && data.ok === false) throw new Error(data.error);
          try { await q(sb.from('social_posts').update({ status: 'posted' }).eq('id', x.id)); }
          catch (e) { throw new Error(`It was posted, but could not be marked posted: ${e.message || e}`); }
          await loadReady();
        }, res) }, `Post to ${bsky ? 'Bluesky' : 'Facebook'}`);
        return h('li', { class: 'fb-item' },
          h('div', { class: 'row' }, h('strong', { text: bsky ? 'Bluesky' : 'Facebook' }), h('span', {},
            x.review_status ? h('span', { class: x.review_status === 'checked' ? 'tag ok' : 'tag warn', text: REVIEW[x.review_status] }) : null, ' ',
            x.source === 'llm' ? h('span', { class: 'tag', text: 'AI-made: label added' }) : null)),
          h('p', { class: 'fb-text', text: text }),
          x.source_name ? h('p', { class: 'muted small', text: `Source: ${x.source_name}` }) : null,
          h('p', { class: tooLong ? 'small md-warn' : 'muted small', text: bsky ? `${n} of 300 characters${tooLong ? '. Too long for Bluesky: shorten it on the Media page.' : '.'}` : `${n} characters.` }),
          h('div', { class: 'btns' }, go), res);
      }
      loadReady();
      return h('div', { class: 'panel' }, h('h3', { text: 'Ready to post' }),
        h('p', { class: 'muted small', text: 'Approved posts from the Media page. One click publishes, after a quick confirm. The post is then marked posted with the time and who did it.' }),
        list, slot);
    }

    // New post. Kept out of `body` so a refresh never wipes what is being typed. Publishing is outward-facing, so it asks first.
    function composer() {
      const slot = h('div');
      const box = h('textarea', { rows: '4', maxlength: '5000', 'aria-label': 'New post', placeholder: 'Write a post' });
      const count = h('span', { class: 'muted small' });
      const onFb = h('input', { type: 'checkbox', id: 'fb-post-fb', checked: 'checked' });
      const onBs = h('input', { type: 'checkbox', id: 'fb-post-bs', checked: 'checked' });
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
        const targets = [onFb.checked ? 'Facebook' : null, onBs.checked ? 'Bluesky' : null].filter(Boolean);
        if (!targets.length) throw new Error('Pick Facebook, Bluesky, or both.');
        if (onBs.checked && chars(message) > 300) throw new Error('Bluesky posts are 300 characters at most. Shorten it or untick Bluesky.');
        if (!confirm(`Publish this now on ${targets.join(' and ')}? It goes live right away.`)) return;
        const done = [], failed = [];
        for (const t of targets) {
          try {
            const { data, error } = await sb.functions.invoke(t === 'Facebook' ? 'fb-insights' : 'bsky-inbox', { body: { action: 'post', message } });
            if (error) throw error;
            if (data && data.ok === false) throw new Error(data.error);
            done.push(t);
          } catch (e) { failed.push(`${t}: ${e.message || e}`); }
        }
        if (!failed.length) box.value = '';
        upd();
        slot.replaceChildren(h('p', { class: failed.length ? 'muted' : 'tag ok', text: `${done.length ? `Posted on ${done.join(' and ')}. ` : ''}${failed.length ? `Failed: ${failed.join(' | ')}` : ''}` }));
      }, slot) }, 'Post');
      return h('div', { class: 'panel' }, h('h3', { text: 'New post' }),
        h('p', { class: 'muted small', text: 'Publishes right away, as the Michi Institute account. Facebook needs the pages_manage_posts permission on the Page token.' }),
        box, count,
        h('div', { class: 'btns' }, h('label', {}, onFb, ' Facebook'), ' ', h('label', {}, onBs, ' Bluesky'), ' ', h('label', {}, onAi, ' AI-written (adds the AI label)'), ' ', send), slot);
    }

    root.append(
      h('h2', { text: 'Post online' }),
      h('p', { class: 'muted small', text: 'Super admins only. Publish to Bluesky and Facebook, and answer what comes back: approved posts ready to send, a box for a new post, replies and comments in one inbox, and the Facebook Page numbers. Inbox and numbers are pulled on a schedule and when you press Refresh.' }),
      h('div', { class: 'btns' }, refresh), status, ready(), composer(), body);
    load();
    return root;
  }

  return { panel, badge };
}

window.TheWayFb = { make };
})();
