// Admin > Media ("Media relations"). Parts: The Way / Not The Way, suggested marketing ideas, conversation openers and
// closers, ready-made copy, planned social media posts, and the site analytics panel. Marketing and admins add drafts of
// ideas, openers, closers and copy; admins approve (the database enforces that). Social drafts are seen only by admins.
// Nothing here posts anywhere: a person posts by hand after approval. Client-side only, no build step.
// Text goes in through textContent only.
(() => {
'use strict';

// Plain words, short sentences. To change the guide, edit these two lists.
const THE_WAY = [
  'Let people find us. Good work gets shared by people who like it.',
  'Answer questions when someone asks. Be clear and be kind.',
  'Give every claim a source people can check.',
  'Share the same facts with everyone, no matter which side they are on.',
  'Nudge lightly, and only when something is already catching on. Help the spread that is already happening.',
  'Say thank you when someone shares our work.',
  'Fix mistakes in public and say what changed.',
  'Be the same person in every post: calm, plain and honest.',
];
const NOT_THE_WAY = [
  'Do not push posts at people who did not ask for them.',
  'Do not chase clicks with scary or shouting headlines.',
  'Do not pay to boost, spam or tag strangers.',
  'Do not use fake accounts or ask friends to pretend to be fans.',
  'Do not pick a team. We show the facts, not a side.',
  'Do not post the same thing again and again to force it to trend.',
  'Do not share private member details or member picks. Ever.',
  'Do not argue with trolls. Let the sources talk.',
];

// One entry per platform, in tab order. To add a platform, add one line here (the id is also the row key in social_accounts).
// An account is "set up" only when an admin has turned it on in social_accounts. locked: stays off (note says why).
const PLATFORMS = [
  { id: 'facebook', label: 'Facebook', audience: 'voters' },
  { id: 'bluesky', label: 'Bluesky', audience: 'journalists, researchers' },
  { id: 'x', label: 'X', audience: 'journalists, voters' },
  { id: 'threads', label: 'Threads', audience: 'voters' },
  { id: 'instagram', label: 'Instagram', audience: 'voters, teachers' },
  { id: 'youtube', label: 'YouTube', audience: 'explainers, teachers' },
  { id: 'tiktok', label: 'TikTok', audience: 'voters (adults only)' },
  { id: 'reddit', label: 'Reddit', audience: 'researchers, voters' },
  { id: 'linkedin', label: 'LinkedIn', audience: 'researchers, journalists, teachers' },
  { id: 'mastodon', label: 'Mastodon', audience: 'researchers' },
  { id: 'newsletter', label: 'Newsletter', audience: 'all (email)', locked: 'Email is off until a PO box exists.' },
];

function make({ sb, h, q, notice, action, ask, STATS, canWrite, uid }) {
  const isAdmin = () => (typeof canWrite === 'function' ? canWrite() : !!canWrite);   // admins and super admins
  const list = (items) => h('ul', { class: 'md-list' }, items.map((t) => h('li', { text: t })));

  // Copy a piece of text to the clipboard so a person can paste it by hand. Nothing is sent anywhere.
  async function copyText(text, btn) {
    let ok = false;
    try { await navigator.clipboard.writeText(text); ok = true; } catch { /* fall back below */ }
    if (!ok) {
      const t = h('textarea', { 'aria-hidden': 'true' });
      t.style.position = 'fixed'; t.style.left = '-9999px';
      t.value = text; document.body.append(t); t.select();
      try { ok = document.execCommand('copy'); } catch { ok = false; }
      t.remove();
    }
    const was = btn.textContent;
    btn.textContent = ok ? 'Copied' : 'Press Ctrl+C to copy';
    setTimeout(() => { btn.textContent = was; }, 1600);
  }
  const copyBtn = (text) => { const b = h('button', { type: 'button', class: 'quiet', text: 'Copy' }); b.onclick = () => copyText(text, b); return b; };
  const dateOf = (iso) => new Date(iso).toLocaleDateString(undefined, { dateStyle: 'medium' });

  function guide() {
    return h('div', { class: 'md-guide' },
      h('p', { class: 'muted', text: 'We are not another algorithm pushing news at people. We let our work spread on its own, the way a good book or a good tip does. If something is already blowing up, a light nudge is fine.' }),
      h('div', { class: 'md-cols' },
        h('div', { class: 'panel md-way' }, h('h3', { text: 'The Way' }), list(THE_WAY)),
        h('div', { class: 'panel md-not' }, h('h3', { text: 'Not The Way' }), list(NOT_THE_WAY))));
  }

  // The ideas table holds four kinds of short text: idea, opener, closer, copy. Same review rules for all.
  function ideaBlock(kind, cfg) {
    const admin = isAdmin();
    const me = typeof uid === 'function' ? uid() : uid;
    const msg = h('div');
    const approvedList = h('ul', { class: 'list panel md-ideas' });
    const draftList = h('ul', { class: 'list panel md-ideas' });
    const tabApproved = h('button', { type: 'button', class: 'quiet md-tab', 'aria-pressed': 'true' });
    const tabDrafts = h('button', { type: 'button', class: 'quiet md-tab', 'aria-pressed': 'false' });
    const body = h('textarea', { maxlength: 500, rows: 2, placeholder: cfg.placeholder, 'aria-label': cfg.addLabel });
    const why = h('input', { maxlength: 300, placeholder: 'Why it could work (optional, up to 300 characters)', 'aria-label': 'Reason' });

    function showTab(which) {
      approvedList.hidden = which !== 'approved';
      draftList.hidden = which !== 'drafts';
      tabApproved.setAttribute('aria-pressed', String(which === 'approved'));
      tabDrafts.setAttribute('aria-pressed', String(which === 'drafts'));
    }
    tabApproved.onclick = () => showTab('approved');
    tabDrafts.onclick = () => showTab('drafts');

    async function load() {
      const rows = await q(sb.from('marketing_ideas').select('id,body,reason,status,source,created_by,created_at').eq('kind', kind).order('id', { ascending: true }).limit(300));
      const ok = rows.filter((r) => r.status === 'approved'), dr = rows.filter((r) => r.status !== 'approved');
      tabApproved.textContent = `Approved (${ok.length})`;
      tabDrafts.textContent = `Drafts waiting (${dr.length})`;
      approvedList.replaceChildren(...(ok.length ? ok.map(row) : [h('li', { class: 'muted', text: 'Nothing approved yet.' })]));
      draftList.replaceChildren(...(dr.length ? dr.map(row) : [h('li', { class: 'muted', text: 'No drafts waiting.' })]));
    }
    const row = (r) => {
      const mineDraft = r.status !== 'approved' && r.source === 'human' && r.created_by === me;
      return h('li', {},
        h('div', { text: r.body }),
        r.reason && cfg.showReason ? h('div', { class: 'small muted', text: `Why: ${r.reason}` }) : null,
        h('div', { class: 'meta' }, `added ${dateOf(r.created_at)} `,
          r.status !== 'approved' ? h('span', { class: 'tag warn', text: 'draft' }) : null, ' ',
          r.source === 'llm' ? h('span', { class: 'tag', text: 'suggested by the assistant' }) : null),
        h('div', { class: 'btns' },
          cfg.copy ? copyBtn(r.body) : null,
          admin && r.status !== 'approved' ? h('button', { class: 'quiet', onclick: action(async () => {
            await q(sb.from('marketing_ideas').update({ status: 'approved' }).eq('id', r.id));
            await load();
          }, msg) }, 'Approve') : null,
          admin || mineDraft ? h('button', { class: 'quiet', onclick: action(async () => {
            const t = await ask('Edit the text (3 to 500 characters):', r.body);
            if (!t) return;
            await q(sb.from('marketing_ideas').update({ body: t.trim() }).eq('id', r.id));
            await load();
          }, msg) }, 'Edit') : null,
          admin ? h('button', { class: 'quiet', onclick: action(async () => {
            if ((await ask('Type DELETE to remove this one:')) !== 'DELETE') return;
            await q(sb.from('marketing_ideas').delete().eq('id', r.id));
            await load();
          }, msg) }, 'Delete') : null));
    };

    // Marketing and admins add. A marketing entry is a draft until an admin approves it; an admin's own entry is approved at once.
    const add = h('form', { class: 'panel', onsubmit: action(async () => {
      const t = body.value.trim();
      if (t.length < 3) throw new Error('Write at least a few words.');
      const r = { body: t, kind, status: admin ? 'approved' : 'draft', source: 'human' };
      if (why.value.trim()) r.reason = why.value.trim();
      await q(sb.from('marketing_ideas').insert(r));
      body.value = ''; why.value = '';
      await load();
      showTab(admin ? 'approved' : 'drafts');
    }, msg) }, h('label', {}, cfg.addLabel, body), cfg.showReason ? h('label', {}, 'Reason', why) : null,
      h('p', { class: 'small dim', text: admin ? 'What you add is approved right away.' : 'What you add waits as a draft until an admin approves it.' }),
      h('div', { class: 'btns' }, h('button', { class: 'primary', type: 'submit' }, cfg.addButton)));

    load().catch((e) => approvedList.replaceChildren(h('li', {}, notice(e.message || 'Could not load this list. Has migration 0091 been run?'))));
    showTab('approved');
    return h('div', {}, cfg.lead ? h('p', { class: 'muted small', text: cfg.lead }) : null, msg, add,
      h('div', { class: 'btns md-tabs' }, tabApproved, tabDrafts), approvedList, draftList,
      h('p', { class: 'small dim', text: 'Only approved items are shown by default. Admins approve drafts. Nothing here is posted anywhere by itself.' }));
  }

  // Planned social media posts. Drafts are visible only to admins (the database hides them from marketing).
  function social() {
    const admin = isAdmin();
    const msg = h('div');
    const accounts = new Map();   // platform id -> { handle, active }
    let posts = [];
    let platform = PLATFORMS[0].id;
    let sub = admin ? 'draft' : 'approved';
    const tabsEl = h('div', { class: 'btns md-tabs', role: 'tablist', 'aria-label': 'Platforms' });
    const bodyEl = h('div');

    async function load() {
      const [accs, rows] = await Promise.all([
        q(sb.from('social_accounts').select('platform,handle,active')),
        q(sb.from('social_posts').select('id,platform,body,planned_slot,handle,status,source,created_at').order('id', { ascending: true }).limit(500)),
      ]);
      accounts.clear(); for (const a of accs) accounts.set(a.platform, a);
      posts = rows;
      draw();
    }
    const isOn = (id) => { const a = accounts.get(id); return !!(a && a.active); };
    const handleOf = (id) => { const a = accounts.get(id); return a && a.handle && a.handle.trim() ? a.handle.trim() : null; };

    function draw() {
      tabsEl.replaceChildren(...PLATFORMS.map((p) => {
        const b = h('button', { type: 'button', class: 'quiet md-tab', role: 'tab', 'aria-pressed': String(p.id === platform) },
          p.label, isOn(p.id) ? null : h('span', { class: 'tag md-badge', text: 'no account yet' }));
        b.onclick = () => { platform = p.id; draw(); };
        return b;
      }));
      const p = PLATFORMS.find((x) => x.id === platform);
      const handle = handleOf(p.id);
      const kids = [h('p', { class: 'small dim', text: `Main audience: ${p.audience}` })];

      if (!isOn(p.id)) {
        kids.push(h('p', { class: 'muted', text: 'Not set up yet.' }));
        if (p.locked) kids.push(h('p', { class: 'small dim', text: p.locked }));
        else if (admin) kids.push(h('div', { class: 'btns' }, h('button', { class: 'quiet', onclick: action(async () => {
          const t = await ask(`Turn on ${p.label}. Name or handle it posts as (up to 100 characters, plain text):`);
          if (t === null) return;
          await q(sb.from('social_accounts').upsert({ platform: p.id, handle: t.trim() || null, active: true }));
          await load();
        }, msg) }, `Turn on ${p.label}`)));
        else kids.push(h('p', { class: 'small dim', text: 'An admin turns an account on when it exists.' }));
        bodyEl.replaceChildren(...kids); return;
      }

      kids.push(h('p', {}, 'Posts as: ', handle ? h('strong', { text: handle }) : h('strong', { class: 'md-warn', text: 'Handle not set' })));
      if (admin) {
        const hin = h('input', { maxlength: 100, placeholder: 'Name or handle it posts as', 'aria-label': 'Handle' });
        hin.value = handle || '';
        kids.push(h('form', { class: 'btns md-inline', onsubmit: action(async () => {
          const t = hin.value.trim();
          if (!t) throw new Error('Type the name or handle first.');
          await q(sb.from('social_accounts').update({ handle: t }).eq('platform', p.id));
          await load();
        }, msg) }, hin, h('button', { class: 'quiet', type: 'submit' }, handle ? 'Change handle' : 'Save handle')));
      }

      // add a draft (admins only)
      if (admin) {
        const pb = h('textarea', { maxlength: 500, rows: 2, placeholder: 'Post text (up to 500 characters)', 'aria-label': 'New post' });
        const slot = h('input', { maxlength: 20, placeholder: 'Planned time, for example 07:00 MT', 'aria-label': 'Planned time' });
        kids.push(h('form', { class: 'panel', onsubmit: action(async () => {
          const t = pb.value.trim();
          if (t.length < 3) throw new Error('Write at least a few words.');
          const r = { platform: p.id, body: t, status: 'draft', source: 'human' };
          if (slot.value.trim()) r.planned_slot = slot.value.trim();
          await q(sb.from('social_posts').insert(r));
          sub = 'draft'; await load();
        }, msg) }, h('label', {}, `New ${p.label} post (saved as a draft)`, pb), h('label', {}, 'Planned time', slot),
          h('div', { class: 'btns' }, h('button', { class: 'primary', type: 'submit' }, 'Add draft'))));
      }

      const mine = posts.filter((x) => x.platform === p.id);
      const subs = admin ? ['draft', 'approved', 'posted'] : ['approved', 'posted'];
      const LBL = { draft: 'Drafts', approved: 'Approved', posted: 'Posted' };
      kids.push(h('div', { class: 'btns md-tabs' }, subs.map((s) => {
        const b = h('button', { type: 'button', class: 'quiet md-tab', 'aria-pressed': String(sub === s), text: `${LBL[s]} (${mine.filter((x) => x.status === s).length})` });
        b.onclick = () => { sub = s; draw(); };
        return b;
      })));
      const shown = mine.filter((x) => x.status === sub);
      kids.push(h('ul', { class: 'list panel md-ideas' }, shown.length ? shown.map((x) => postRow(x, handle)) : [h('li', { class: 'muted', text: 'Nothing here.' })]));
      bodyEl.replaceChildren(...kids);
    }

    function postRow(x, accountHandle) {
      const as = x.handle || accountHandle;   // approved posts keep the name copied when they were approved
      return h('li', {},
        h('div', { class: 'meta' }, x.planned_slot ? h('span', { class: 'tag', text: x.planned_slot }) : null, ' ',
          h('span', { class: `tag ${x.status === 'draft' ? 'warn' : 'ok'}`, text: x.status }), ' ',
          x.source === 'llm' ? h('span', { class: 'tag', text: 'AI-made: needs the AI label' }) : null),
        h('div', { text: x.body }),
        h('div', { class: 'small muted' }, 'Posts as: ', as ? h('strong', { text: as }) : h('strong', { class: 'md-warn', text: 'Handle not set' })),
        h('div', { class: 'btns' },
          copyBtn(x.body),
          admin && x.status === 'draft' ? h('button', { class: 'quiet', onclick: action(async () => {
            await q(sb.from('social_posts').update({ status: 'approved' }).eq('id', x.id)); await load();
          }, msg) }, 'Approve') : null,
          admin && x.status === 'approved' ? h('button', { class: 'quiet', onclick: action(async () => {
            if (!(await ask('Type POSTED once you have posted this by hand:') === 'POSTED')) return;
            await q(sb.from('social_posts').update({ status: 'posted' }).eq('id', x.id)); await load();
          }, msg) }, 'Mark as posted') : null,
          admin && x.status !== 'draft' ? h('button', { class: 'quiet', onclick: action(async () => {
            await q(sb.from('social_posts').update({ status: 'draft' }).eq('id', x.id)); await load();
          }, msg) }, 'Back to draft') : null,
          admin ? h('button', { class: 'quiet', onclick: action(async () => {
            const t = await ask('Edit the post (3 to 500 characters). An approved post goes back to draft:', x.body);
            if (!t) return;
            await q(sb.from('social_posts').update({ body: t.trim() }).eq('id', x.id)); await load();
          }, msg) }, 'Edit') : null,
          admin ? h('button', { class: 'quiet', onclick: action(async () => {
            if ((await ask('Type DELETE to remove this post:')) !== 'DELETE') return;
            await q(sb.from('social_posts').delete().eq('id', x.id)); await load();
          }, msg) }, 'Delete') : null));
    }

    load().catch((e) => bodyEl.replaceChildren(notice(e.message || 'Could not load social posts. Has migration 0091 been run?')));
    return h('div', {},
      h('p', { class: 'muted small', text: 'Nothing is posted by this site. A person posts by hand after approval, and a post made by an AI must carry the AI label. Our audiences are voters, teachers and researchers or journalists. Posts are aimed at adults and teachers, not at children, and accounts follow each platform\'s own age rules.' }),
      admin ? null : h('p', { class: 'small dim', text: 'You see approved and posted posts. Drafts are seen by admins only.' }),
      msg, tabsEl, bodyEl);
  }

  function view(section, render) {
    render(h('h1', { text: 'Media' }), h('p', { class: 'lede', text: 'Media relations' }),
      section('guide', 'The Way / Not The Way', guide()),
      section('ideas', 'Suggested marketing ideas', ideaBlock('idea', { addLabel: 'Add an idea', addButton: 'Add idea', placeholder: 'One idea, in a sentence or two', showReason: true })),
      section('openers', 'Conversation openers', ideaBlock('opener', { addLabel: 'Add an opener', addButton: 'Add opener', placeholder: 'A calm first line to start a talk', showReason: false, copy: true,
        lead: 'Short, kind lines to start a conversation. Copy one and use it by hand.' })),
      section('closers', 'Conversation closers', ideaBlock('closer', { addLabel: 'Add a closer', addButton: 'Add closer', placeholder: 'A kind line to end a talk', showReason: false, copy: true,
        lead: 'Short, kind lines to end a conversation. Copy one and use it by hand.' })),
      section('copy', 'Ready-made copy', ideaBlock('copy', { addLabel: 'Add copy', addButton: 'Add copy', placeholder: 'A tagline, short description or explainer', showReason: false, copy: true,
        lead: 'Taglines, short descriptions and explainers. No results or outcome claims. Copy and paste by hand.' })),
      section('social', 'Social media posts', social()),
      STATS ? section('analytics', 'Site analytics and SEO', STATS.panel()) : null);
  }
  return { view };
}
window.TheWayMedia = { make, THE_WAY, NOT_THE_WAY, PLATFORMS };
})();
