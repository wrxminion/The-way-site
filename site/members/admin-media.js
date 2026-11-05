// Admin > Media. One page with tabs: Posts (social post drafts, approval, and asks to the local drafter), Ideas and copy,
// Post online, Analytics, Images, and The Way / Not The Way. Marketing and admins add drafts of ideas, openers, closers
// and copy; admins approve (the database enforces that). Social drafts are seen by admins and the Media Director.
// Nothing here posts anywhere by itself, and no LLM or API key is ever used here. Client-side only, no build step.
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

function make({ sb, h, q, notice, action, ask, STATS, IMAGES, canWrite, canReview, uid }) {
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

  // ---- links to real pages of this site: chosen from a picker, never typed ----
  const CAT = window.TheWayCatalog || { origin: 'https://michiinstitute.com', pages: [], topics: [] };
  const KIND_LABEL = { judges: 'Judges pages', guide: 'State guides', case: 'Civics and history', site: 'Site pages', research: 'Research' };
  const KIND_ORDER = ['judges', 'guide', 'case', 'site', 'research'];
  // text, then the page title, then the link. The title is always there when there is a link.
  const assemble = (body, path, title) => (path && title ? `${body}\n${title}\n${CAT.origin}${path}` : body);
  const linkLine = (path, title) => (path && title
    ? h('div', { class: 'small md-link' }, 'Link: ', h('strong', { text: title }), ` ${CAT.origin}${path}`) : null);

  function picker(initial, onPick) {
    const pages = CAT.pages || [];
    if (!pages.length) return { el: h('p', { class: 'small dim', text: 'The page list is not available, so a link cannot be added.' }), get: () => null, set() {} };
    let cur = initial ? (pages.find((p) => p.path === initial.path) || null) : null;
    const filter = h('input', { type: 'search', placeholder: 'Find a page to link (type part of its title)', 'aria-label': 'Find a page' });
    const sel = h('select', { 'aria-label': 'Page to link' });
    const el = h('label', {}, 'Link to a page on this site (optional)', filter, sel);
    function fill() {
      const needle = filter.value.trim().toLowerCase();
      const opts = [h('option', { value: '', text: 'No link' })];
      for (const k of KIND_ORDER) {
        const items = pages.filter((p) => p.kind === k && (!needle || p.title.toLowerCase().includes(needle)
          || p.path.toLowerCase().includes(needle) || (cur && cur.path === p.path)));
        if (!items.length) continue;
        const g = h('optgroup', { label: KIND_LABEL[k] || k });
        for (const p of items) g.append(h('option', { value: p.path, text: p.title }));
        opts.push(g);
      }
      sel.replaceChildren(...opts);
      sel.value = cur ? cur.path : '';
    }
    filter.addEventListener('input', fill);
    sel.addEventListener('change', () => { cur = sel.value ? (pages.find((p) => p.path === sel.value) || null) : null; if (onPick) onPick(cur); });
    fill();
    return {
      el,
      get: () => (cur ? { path: cur.path, title: cur.title } : null),
      set(v) { cur = v ? (pages.find((p) => p.path === v.path) || null) : null; filter.value = ''; fill(); if (onPick) onPick(cur); },
    };
  }

  // The link part of an add form: picker, the count lines, and a live preview of what will be copied.
  function composer(ta) {
    const pre = h('pre', { class: 'md-pre' });
    const pk = picker(null, refresh);
    const topics = (CAT.topics || []).filter((t) => t.count > 0);
    const tsel = h('select', { 'aria-label': 'Count line' });
    tsel.append(h('option', { value: '', text: 'Pick a count line' }), ...topics.map((t, i) => h('option', { value: String(i), text: `${t.count} articles about ${t.label.toLowerCase()}` })));
    tsel.addEventListener('change', () => {
      if (tsel.value === '') return;
      const t = topics[+tsel.value];
      ta.value = `We have ${t.count} articles about ${t.label.toLowerCase()}, come see our research on it.`;
      pk.set({ path: t.path, title: t.title });
      tsel.value = '';
    });
    function refresh() { const l = pk.get(); pre.textContent = assemble(ta.value.trim() || '(your text)', l && l.path, l && l.title); }
    ta.addEventListener('input', refresh);
    refresh();
    return {
      els: [pk.el,
        topics.length ? h('label', {}, 'Count line (the number comes from the real article list)', tsel) : null,
        h('div', { class: 'md-preview' }, h('div', { class: 'small dim', text: 'As it will be copied:' }), pre)],
      fields() { const l = pk.get(); return l ? { link_path: l.path, link_title: l.title } : {}; },
      reset() { pk.set(null); refresh(); },
    };
  }

  // Admins change a link on an existing row only through the picker.
  function changeLink(table, row, reload, msg) {
    const pk = picker(row.link_path ? { path: row.link_path, title: row.link_title } : null);
    const save = h('button', { type: 'button', class: 'quiet', text: 'Save link' });
    save.onclick = action(async () => {
      const l = pk.get();
      await q(sb.from(table).update({ link_path: l ? l.path : null, link_title: l ? l.title : null }).eq('id', row.id));
      await reload();
    }, msg);
    return h('details', { class: 'md-change' }, h('summary', { text: 'Change link' }), pk.el, save);
  }

  function guide() {
    return h('div', { class: 'md-guide' },
      h('p', { class: 'muted', text: 'We are not another algorithm pushing news at people. We let our work spread on its own, the way a good book or a good tip does. If something is already blowing up, a light nudge is fine.' }),
      h('div', { class: 'md-cols' },
        h('div', { class: 'panel md-way' }, h('h3', { text: 'The Way' }), list(THE_WAY)),
        h('div', { class: 'panel md-not' }, h('h3', { text: 'Not The Way' }), list(NOT_THE_WAY))));
  }

  // The ideas table holds short texts. A category groups them (copy, posts, canned responses, debate replies,
  // conversation lines, ideas). Same review rules for all: drafts wait for an admin, and nothing posts by itself.
  const CATEGORIES = [
    { id: 'copy', label: 'Copy', kind: 'copy', addLabel: 'Add copy', addButton: 'Add copy', placeholder: 'A tagline, short description or explainer',
      lead: 'Taglines, short descriptions and explainers. No results or outcome claims. Copy and paste by hand.', copy: true },
    { id: 'posts', label: 'Posts', kind: 'idea', addLabel: 'Add a post idea', addButton: 'Add post idea', placeholder: 'An idea for a post, in a sentence or two', links: true, copy: true, showReason: true, postsLink: true,
      lead: 'Ideas for posts. The drafts and approved posts themselves are on the Posts tab.' },
    { id: 'canned_response', label: 'Canned responses', kind: 'copy', showReason: true, reasonLabel: 'Note', addLabel: 'Add a canned response', addButton: 'Add response', placeholder: 'A short reply to a common question', copy: true,
      lead: 'Short replies to questions people ask often. Copy one and use it by hand.' },
    { id: 'debate_reply', label: 'They want a debate', kind: 'copy', showReason: true, reasonLabel: 'When to use', links: true, addLabel: 'Add a debate reply', addButton: 'Add reply', placeholder: 'A calm, short reply that moves the talk to sources', copy: true,
      lead: 'Kill them with kindness and facts. Warm, gentle humor is fine. Never mock. Do not feed bad faith. Drop the sources once, then disengage. Drop the link once, then go quiet. Do not reply again. Engage only with people who engage with the sources. Never follow anyone from one post, platform or comment section to another. If a troll carries the argument elsewhere, that is free attention for us. We stay where we posted. The reason on each reply says when to use it. Copy one and use it by hand.' },
    { id: 'conversation', label: 'Openers and closers', kind: 'opener', kinds: ['opener', 'closer'], addLabel: 'Add an opener or closer', addButton: 'Add', placeholder: 'A kind line to start or end a talk', copy: true,
      lead: 'Short, kind lines to start or end a conversation. Copy one and use it by hand.' },
    { id: 'idea', label: 'Ideas', kind: 'idea', addLabel: 'Add an idea', addButton: 'Add idea', placeholder: 'One idea, in a sentence or two', links: true, copy: true, showReason: true },
  ];
  const CAT_LABEL = Object.fromEntries(CATEGORIES.map((c) => [c.id, c.label]));

  function ideaBlock(cfg, go) {
    const admin = isAdmin();
    const me = typeof uid === 'function' ? uid() : uid;
    const msg = h('div');
    const approvedList = h('ul', { class: 'list panel md-ideas' });
    const draftList = h('ul', { class: 'list panel md-ideas' });
    const tabApproved = h('button', { type: 'button', class: 'quiet md-tab', 'aria-pressed': 'true' });
    const tabDrafts = h('button', { type: 'button', class: 'quiet md-tab', 'aria-pressed': 'false' });
    const body = h('textarea', { maxlength: 500, rows: 2, placeholder: cfg.placeholder, 'aria-label': cfg.addLabel });
    const why = h('input', { maxlength: 300, placeholder: 'Why it could work (optional, up to 300 characters)', 'aria-label': 'Reason' });
    const kindSel = cfg.kinds ? h('select', { 'aria-label': 'Opener or closer' }, h('option', { value: 'opener', text: 'Opener (starts a talk)' }), h('option', { value: 'closer', text: 'Closer (ends a talk)' })) : null;

    function showTab(which) {
      approvedList.hidden = which !== 'approved';
      draftList.hidden = which !== 'drafts';
      tabApproved.setAttribute('aria-pressed', String(which === 'approved'));
      tabDrafts.setAttribute('aria-pressed', String(which === 'drafts'));
    }
    tabApproved.onclick = () => showTab('approved');
    tabDrafts.onclick = () => showTab('drafts');

    async function load() {
      const rows = await q(sb.from('marketing_ideas').select('id,body,reason,kind,category,status,source,created_by,created_at,link_path,link_title').eq('category', cfg.id).order('id', { ascending: true }).limit(300));
      const ok = rows.filter((r) => r.status === 'approved'), dr = rows.filter((r) => r.status !== 'approved');
      tabApproved.textContent = `Approved (${ok.length})`;
      tabDrafts.textContent = `Drafts waiting (${dr.length})`;
      approvedList.replaceChildren(...(ok.length ? ok.map(row) : [h('li', { class: 'muted', text: 'Nothing approved yet.' })]));
      draftList.replaceChildren(...(dr.length ? dr.map(row) : [h('li', { class: 'muted', text: 'No drafts waiting.' })]));
    }
    const row = (r) => {
      const mineDraft = r.status !== 'approved' && r.source === 'human' && r.created_by === me;
      const mover = admin ? h('select', { 'aria-label': 'Move to another category' }, h('option', { value: '', text: 'Move to...' }),
        ...CATEGORIES.filter((c) => c.id !== r.category).map((c) => h('option', { value: c.id, text: c.label }))) : null;
      if (mover) mover.addEventListener('change', action(async () => {
        if (!mover.value) return;
        await q(sb.from('marketing_ideas').update({ category: mover.value }).eq('id', r.id));
        await load();
      }, msg));
      return h('li', {},
        h('div', { text: r.body }),
        r.reason && cfg.showReason ? h('div', { class: 'small muted', text: `${cfg.reasonLabel || 'Why'}: ${r.reason}` }) : null,
        cfg.links ? linkLine(r.link_path, r.link_title) : null,
        h('div', { class: 'meta' }, `added ${dateOf(r.created_at)} `,
          r.status !== 'approved' ? h('span', { class: 'tag warn', text: 'draft' }) : null, ' ',
          cfg.kinds ? h('span', { class: 'tag', text: r.kind }) : null, ' ',
          r.source === 'llm' ? h('span', { class: 'tag', text: 'suggested by the assistant' }) : null),
        h('div', { class: 'btns' },
          cfg.copy ? copyBtn(assemble(r.body, r.link_path, r.link_title)) : null,
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
          mover,
          admin ? h('button', { class: 'quiet', onclick: action(async () => {
            if ((await ask('Type DELETE to remove this one:')) !== 'DELETE') return;
            await q(sb.from('marketing_ideas').delete().eq('id', r.id));
            await load();
          }, msg) }, 'Delete') : null),
        admin && cfg.links ? changeLink('marketing_ideas', r, load, msg) : null);
    };

    // Marketing and admins add. A marketing entry is a draft until an admin approves it; an admin's own entry is approved at once.
    const comp = cfg.links ? composer(body) : null;
    const add = h('form', { class: 'panel', onsubmit: action(async () => {
      const t = body.value.trim();
      if (t.length < 3) throw new Error('Write at least a few words.');
      const r = { body: t, kind: kindSel ? kindSel.value : cfg.kind, category: cfg.id, status: admin ? 'approved' : 'draft', source: 'human' };
      if (why.value.trim()) r.reason = why.value.trim();
      if (comp) Object.assign(r, comp.fields());
      await q(sb.from('marketing_ideas').insert(r));
      body.value = ''; why.value = '';
      if (comp) comp.reset();
      await load();
      showTab(admin ? 'approved' : 'drafts');
    }, msg) }, h('label', {}, cfg.addLabel, body), kindSel ? h('label', {}, 'Type', kindSel) : null, comp ? comp.els : null,
      cfg.showReason ? h('label', {}, 'Reason', why) : null,
      h('p', { class: 'small dim', text: admin ? 'What you add is approved right away.' : 'What you add waits as a draft until an admin approves it.' }),
      h('div', { class: 'btns' }, h('button', { class: 'primary', type: 'submit' }, cfg.addButton)));

    const toSocial = cfg.postsLink && go ? h('div', { class: 'btns' }, h('button', { type: 'button', class: 'quiet', onclick: () => go('posts') }, 'Open Posts')) : null;

    load().catch((e) => approvedList.replaceChildren(h('li', {}, notice(e.message || 'Could not load this list. Has migration 0094 been run?'))));
    showTab('approved');
    return h('div', {}, cfg.lead ? h('p', { class: 'muted small', text: cfg.lead }) : null, toSocial, msg, add,
      h('div', { class: 'btns md-tabs' }, tabApproved, tabDrafts), approvedList, draftList,
      h('p', { class: 'small dim', text: 'Only approved items are shown by default. Admins approve drafts. Nothing here is posted anywhere by itself.' }));
  }

  // The six groups, one tab each. A group is built the first time its tab is opened.
  function ideasHub(go) {
    let current = CATEGORIES[0].id;
    const built = new Map();
    const tabs = h('div', { class: 'btns md-tabs', role: 'tablist', 'aria-label': 'Ideas by group' });
    const panel = h('div');
    function draw() {
      tabs.replaceChildren(...CATEGORIES.map((c) => {
        const b = h('button', { type: 'button', class: 'quiet md-tab', role: 'tab', 'aria-pressed': String(c.id === current), text: c.label });
        b.onclick = () => { current = c.id; draw(); };
        return b;
      }));
      if (!built.has(current)) built.set(current, ideaBlock(CATEGORIES.find((c) => c.id === current), go));
      panel.replaceChildren(built.get(current));
    }
    draw();
    return h('div', {}, tabs, panel);
  }

  // ---- Posts tab: the social post queue, and asks to the local drafter ----
  // Drafts are seen by admins, super admins and the Media Director (marketing). Nothing is posted by itself.
  // An ask (social_draft_requests, migration 0103) is picked up by the drafter on the research computer, which adds
  // drafts marked AI-made. This page never holds an LLM or an API key; it only writes the ask.
  const PLAT_LABEL = Object.fromEntries(PLATFORMS.map((p) => [p.id, p.label]));
  const STATUS = [
    { id: 'draft', label: 'Drafts' }, { id: 'approved', label: 'Approved' }, { id: 'posted', label: 'Posted' }, { id: 'dismissed', label: 'Hidden' }];
  const URL_OK = /^https:\/\/[A-Za-z0-9.-]+(\/[^ <>"]*)?$/;   // same rule as the database
  const timeMT = (iso) => `${new Date(iso).toLocaleString('en-US', { timeZone: 'America/Denver', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} MT`;
  const reviewerNow = () => isAdmin() || (typeof canReview === 'function' && canReview());

  // Tell the Post online tab that the approved list changed, so its Ready to post list reloads.
  const changed = (focusId) => window.dispatchEvent(new CustomEvent('way-social-changed', { detail: { focusId: focusId || null } }));

  function social(nav) {
    const admin = isAdmin();
    const reviewer = reviewerNow();
    const msg = h('div');
    const accounts = new Map();   // platform id -> { handle, active }
    let posts = [], asks = [], asksReady = true;
    let sub = reviewer ? 'draft' : 'approved';
    let plat = 'all';
    let timer = null;
    const asksEl = h('div', { class: 'md-asks' });
    const chipsEl = h('div', { class: 'md-chiprow' });
    const listEl = h('div', { class: 'md-cards' });
    const extraEl = h('div');
    const hintEl = h('p', { class: 'small dim md-hint' });

    const isOn = (id) => { const a = accounts.get(id); return !!(a && a.active); };
    const handleOf = (id) => { const a = accounts.get(id); return a && a.handle && a.handle.trim() ? a.handle.trim() : null; };

    let lastLoad = 0;
    async function load() {
      lastLoad = Date.now();
      const [accs, rows] = await Promise.all([
        q(sb.from('social_accounts').select('platform,handle,active')),
        q(sb.from('social_posts').select('*').order('id', { ascending: false }).limit(500)),
      ]);
      accounts.clear(); for (const a of accs) accounts.set(a.platform, a);
      posts = rows;
      if (reviewer) {
        const since = new Date(Date.now() - 864e5).toISOString().replace(/\.\d+Z$/, 'Z');
        try {
          asks = await q(sb.from('social_draft_requests').select('id,kind,link,idea,platform,wanted,status,note,post_count,created_at,done_at')
            .or(`status.in.(waiting,working),and(status.eq.failed,done_at.gte.${since})`).order('id', { ascending: false }).limit(40));
          asksReady = true;
        } catch { asks = []; asksReady = false; }
      }
      draw();
      // While an ask is open, look again every 45 seconds so new drafts show up without a reload.
      clearTimeout(timer);
      if (asks.some((a) => a.status === 'waiting' || a.status === 'working')) {
        timer = setTimeout(function again() {
          if (!root.isConnected) return;
          if (document.hidden) { timer = setTimeout(again, 45000); return; }
          load().catch(() => { /* keep the last list */ });
        }, 45000);
      }
    }

    // ---- "Get a draft": a link or an idea, and "Ask for more drafts"
    function askPanel() {
      const ta = h('textarea', { class: 'md-ask-in', rows: 2, maxlength: 600, placeholder: 'A news link, or an idea in a sentence', 'aria-label': 'Paste a link or write an idea' });
      const pf = h('select', { 'aria-label': 'Which network', class: 'md-ask-plat' },
        h('option', { value: 'both', text: 'Facebook and Bluesky' }), h('option', { value: 'facebook', text: 'Facebook only' }), h('option', { value: 'bluesky', text: 'Bluesky only' }));
      const form = h('form', { class: 'md-ask', onsubmit: action(async () => {
        const t = ta.value.trim().replace(/[<>]/g, '');
        if (t.length < 3) throw new Error('Paste a link or write a few words first.');
        if (/(^|\s)http:\/\//.test(t)) throw new Error('Use the https link (it starts with https://).');
        const m = t.match(/https:\/\/\S+/);
        let row;
        if (m) {
          const link = m[0].replace(/[).,;]+$/, '');
          if (!URL_OK.test(link) || link.length > 500) throw new Error('That link does not look right. Copy it again from the address bar.');
          const rest = t.replace(m[0], '').trim();
          row = { kind: 'link', link, platform: pf.value };
          if (rest.length >= 3) row.idea = rest.slice(0, 500);
        } else {
          if (t.length > 500) throw new Error('Keep the idea under 500 characters.');
          row = { kind: 'idea', idea: t, platform: pf.value };
        }
        await q(sb.from('social_draft_requests').insert(row));
        ta.value = '';
        sub = 'draft';
        await load();
        msg.replaceChildren(notice('Sent to the drafter. The draft shows up below when the research computer is free.', 'ok'));
      }, msg) },
      h('p', { class: 'md-label', text: 'Get a draft' }),
      h('div', { class: 'md-ask-grid' },
        h('label', {}, 'Paste a link or write an idea', ta),
        h('div', { class: 'md-ask-go' }, pf, h('button', { class: 'primary', type: 'submit' }, 'Draft it'))));

      // One button does both: it loads the drafts the research model already made (/social-picks/data.json, new ones
      // become AI-made drafts) and asks the drafter for 5 more. The ask is skipped if one is already open.
      const loadPicks = h('button', { type: 'button', class: 'quiet', onclick: action(async () => {
        let asked = '';
        if (asksReady) {
          if (asks.some((a) => a.kind === 'more' && (a.status === 'waiting' || a.status === 'working'))) asked = ' An ask for more is already open.';
          else {
            try { await q(sb.from('social_draft_requests').insert({ kind: 'more', wanted: 5, platform: 'both' })); asked = ' Asked the drafter for 5 more. They show up here when the research computer is free.'; }
            catch (e) { asked = ` Could not ask for more: ${e.message || e}.`; }
          }
        }
        const r = await fetch('/social-picks/data.json?t=' + Date.now(), { cache: 'no-store' });
        if (!r.ok) { await load(); throw new Error('Could not read the suggestions file.' + asked); }
        const d = await r.json();
        const have = new Set(posts.map((x) => x.platform + '|' + x.body));
        const rows = [];
        for (const s of (d && d.posts) || []) {
          const plats = s.platform === 'both' ? ['facebook', 'bluesky'] : [s.platform];
          for (const pl of plats) {
            const body = String(s.text || '').replace(/[<>]/g, '').trim() + (s.link ? '\n' + s.link : '');
            if (!accounts.has(pl) || body.length < 3 || body.length > 500 || have.has(pl + '|' + body)) continue;
            have.add(pl + '|' + body);
            const row = { platform: pl, body, status: 'draft', source: 'llm' };
            if (s.link && URL_OK.test(s.link)) row.source_url = s.link;
            if (s.source) row.source_name = String(s.source).replace(/[<>]/g, '').trim().slice(0, 120) || null;
            rows.push(row);
          }
        }
        if (rows.length) await q(sb.from('social_posts').insert(rows));
        sub = 'draft'; await load();
        msg.replaceChildren(notice((rows.length ? `Added ${rows.length} AI draft${rows.length === 1 ? '' : 's'}. Read each one before you approve it.` : 'No new drafts in the saved batch.') + asked, 'ok'));
      }, msg) }, 'Get AI drafts');

      return h('section', { class: 'panel md-askbox' }, form,
        h('div', { class: 'md-ask-more' }, hintEl, h('div', { class: 'btns' }, loadPicks)));
    }

    function askCard(a) {
      const what = a.kind === 'more' ? `More drafts (${a.wanted})`
        : a.kind === 'link' ? `Your link: ${a.link}${a.idea ? ` (${a.idea})` : ''}` : `Your idea: ${a.idea}`;
      const tag = a.status === 'waiting' ? h('span', { class: 'tag', text: 'waiting for the drafter' })
        : a.status === 'working' ? h('span', { class: 'tag ok', text: 'drafting now' })
        : h('span', { class: 'tag bad', text: 'could not draft' });
      return h('article', { class: 'md-card md-askcard' },
        h('div', { class: 'md-card-top' }, tag, a.platform !== 'both' ? h('span', { class: 'tag', text: PLAT_LABEL[a.platform] || a.platform }) : null,
          h('span', { class: 'small dim', text: timeMT(a.created_at) })),
        h('div', { class: 'md-card-body dim', text: what }),
        a.note ? h('div', { class: 'small muted', text: a.note }) : null,
        a.status === 'waiting' ? h('div', { class: 'btns' }, h('button', { type: 'button', class: 'quiet', onclick: action(async () => {
          await q(sb.from('social_draft_requests').update({ status: 'cancelled' }).eq('id', a.id)); await load();
        }, msg) }, 'Cancel')) : null);
    }

    function draw() {
      if (reviewer) {
        hintEl.textContent = asksReady ? 'The drafter runs on the research computer when it is free (not gaming or trading). It reads each ask and adds drafts here.'
          : 'Asking for drafts turns on after database step 0103 is run.';
        asksEl.replaceChildren(...asks.map(askCard));
      }
      const onPlats = PLATFORMS.filter((p) => isOn(p.id) || posts.some((x) => x.platform === p.id));
      if (plat !== 'all' && !onPlats.some((p) => p.id === plat)) plat = 'all';
      const inPlat = posts.filter((x) => plat === 'all' || x.platform === plat);
      const subs = STATUS.filter((s) => reviewer || s.id === 'approved' || s.id === 'posted');
      const chip = (on, label, n, fn) => {
        const b = h('button', { type: 'button', class: 'md-chip', 'aria-pressed': String(on) }, label, n == null ? null : h('span', { class: 'md-n', text: String(n) }));
        b.onclick = fn; return b;
      };
      chipsEl.replaceChildren(
        h('div', { class: 'md-chips', role: 'group', 'aria-label': 'Status' }, subs.map((s) => chip(sub === s.id, s.label, inPlat.filter((x) => x.status === s.id).length, () => { sub = s.id; draw(); }))),
        onPlats.length > 1 ? h('div', { class: 'md-chips', role: 'group', 'aria-label': 'Network' },
          chip(plat === 'all', 'All', null, () => { plat = 'all'; draw(); }),
          onPlats.map((p) => chip(plat === p.id, p.label, null, () => { plat = p.id; draw(); }))) : null);
      const shown = inPlat.filter((x) => x.status === sub);
      const EMPTY = { draft: reviewer ? 'No drafts waiting. Paste a link or an idea above, or ask for more drafts.' : 'Nothing here.', approved: 'Nothing approved yet.', posted: 'Nothing posted yet.', dismissed: 'Nothing hidden.' };
      listEl.replaceChildren(...(shown.length ? shown.map(card) : [h('p', { class: 'muted md-empty', text: EMPTY[sub] })]));
      extraEl.replaceChildren(...[reviewer ? writeOwn(onPlats) : null, admin ? accountsBox() : null].filter(Boolean));
    }

    function card(x) {
      const as = x.handle || handleOf(x.platform);
      const btn = (label, fn, primary) => h('button', { type: 'button', class: primary ? 'primary' : 'quiet', onclick: action(fn, msg) }, label);
      const copyB = copyBtn(assemble(x.body, x.link_path, x.link_title));
      const btns = [];
      if (x.status === 'draft') {
        if (reviewer) btns.push(btn('Approve', async () => {
          await q(sb.from('social_posts').update({ status: 'approved' }).eq('id', x.id));
          await load();
          changed();
          afterApprove(x);
        }, true));
        btns.push(copyB);
        if (reviewer) btns.push(btn('Edit', () => editPost(x)), btn('Not this one', async () => { await q(sb.from('social_posts').update({ status: 'dismissed' }).eq('id', x.id)); await load(); }));
      } else if (x.status === 'dismissed') {
        btns.push(copyB);
        if (reviewer) btns.push(btn('Back to draft', async () => { await q(sb.from('social_posts').update({ status: 'draft' }).eq('id', x.id)); await load(); }));
      } else {
        copyB.className = 'primary';
        btns.push(copyB);
        if (reviewer && x.status === 'approved') btns.push(btn('Mark as posted', async () => {
          if ((await ask('Type POSTED once you have posted this by hand:')) !== 'POSTED') return;
          await q(sb.from('social_posts').update({ status: 'posted' }).eq('id', x.id)); await load();
        }));
        if (reviewer) btns.push(btn('Edit', () => editPost(x)), btn('Back to draft', async () => { await q(sb.from('social_posts').update({ status: 'draft' }).eq('id', x.id)); await load(); }));
      }
      if (admin) btns.push(btn('Delete', async () => {
        if ((await ask('Type DELETE to remove this post for good:')) !== 'DELETE') return;
        await q(sb.from('social_posts').delete().eq('id', x.id)); await load();
      }));
      return h('article', { class: `md-card md-st-${x.status}` },
        h('div', { class: 'md-card-top' },
          h('span', { class: `md-plat md-plat-${x.platform}`, text: PLAT_LABEL[x.platform] || x.platform }),
          x.status === 'approved' ? h('span', { class: 'tag ok', text: 'approved' }) : x.status === 'posted' ? h('span', { class: 'tag ok', text: 'posted' }) : null,
          x.source === 'llm' ? h('span', { class: 'tag', text: 'AI-made' }) : null,
          x.request_id ? h('span', { class: 'tag', text: 'from your ask' }) : null,
          x.planned_slot ? h('span', { class: 'tag', text: x.planned_slot }) : null,
          h('span', { class: 'small dim', text: timeMT(x.created_at) })),
        h('div', { class: 'md-card-body', text: x.body }),
        linkLine(x.link_path, x.link_title),
        x.source_name ? h('div', { class: 'small dim md-link', text: `Source: ${x.source_name}` }) : null,
        as ? null : h('div', { class: 'small md-warn', text: 'Handle not set for this account.' }),
        h('div', { class: 'btns' }, btns),
        admin ? changeLink('social_posts', x, load, msg) : null);
    }

    // After Approve: post it now (opens Post online with this post at the top of the view) or keep it for later.
    function afterApprove(x) {
      const canPost = nav && nav.has('online') && (x.platform === 'bluesky' || x.platform === 'facebook');
      if (!canPost) { msg.replaceChildren(notice('Approved. It is under Approved until it is posted.', 'ok')); return; }
      const now = h('button', { type: 'button', class: 'primary' }, 'Post now');
      const later = h('button', { type: 'button', class: 'quiet' }, 'Post later');
      now.onclick = () => { msg.replaceChildren(); nav.go('online', x.id); };
      later.onclick = () => msg.replaceChildren(notice('Kept for later. It is under Approved, and in Post online under Ready to post.', 'ok'));
      msg.replaceChildren(h('div', { class: 'notice ok md-postnow', role: 'status' },
        h('span', { text: 'Approved. Post it now, or keep it for later?' }), h('div', { class: 'btns' }, now, later)));
      msg.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    async function editPost(x) {
      const t = await ask('Edit the post (3 to 500 characters). An approved post goes back to draft:', x.body);
      if (!t) return;
      await q(sb.from('social_posts').update({ body: t.trim() }).eq('id', x.id)); await load();
    }

    // Write a draft by hand. Folded away so the page stays short.
    function writeOwn(onPlats) {
      const live = onPlats.filter((p) => isOn(p.id));
      if (!live.length) return null;
      const ps = h('select', { 'aria-label': 'Network' }, live.map((p) => h('option', { value: p.id, text: p.label })));
      const pb = h('textarea', { maxlength: 500, rows: 3, placeholder: 'Post text (up to 500 characters)', 'aria-label': 'New post' });
      const slot = h('input', { maxlength: 20, placeholder: 'For example 07:00 MT', 'aria-label': 'Planned time' });
      const comp = composer(pb);
      const form = h('form', { onsubmit: action(async () => {
        const t = pb.value.trim();
        if (t.length < 3) throw new Error('Write at least a few words.');
        const r = { platform: ps.value, body: t, status: 'draft', source: 'human' };
        if (slot.value.trim()) r.planned_slot = slot.value.trim();
        Object.assign(r, comp.fields());
        await q(sb.from('social_posts').insert(r));
        sub = 'draft'; await load();
      }, msg) }, h('label', {}, 'Network', ps), h('label', {}, 'Post text (saved as a draft)', pb), comp.els,
        h('label', {}, 'Planned time (optional)', slot), h('div', { class: 'btns' }, h('button', { class: 'primary', type: 'submit' }, 'Add draft')));
      return h('details', { class: 'panel md-fold' }, h('summary', { text: 'Write a post yourself' }), form);
    }

    // Accounts and handles, for admins. Folded away: it is set once and rarely changed.
    function accountsBox() {
      const rows = PLATFORMS.map((p) => {
        const handle = handleOf(p.id);
        const parts = [h('div', {}, h('strong', { text: p.label }), h('span', { class: 'small dim', text: ` for ${p.audience}` }))];
        if (!isOn(p.id)) {
          parts.push(p.locked ? h('div', { class: 'small dim', text: p.locked }) : h('div', { class: 'btns' }, h('button', { type: 'button', class: 'quiet', onclick: action(async () => {
            const t = await ask(`Turn on ${p.label}. Name or handle it posts as (up to 100 characters, plain text):`);
            if (t === null) return;
            await q(sb.from('social_accounts').upsert({ platform: p.id, handle: t.trim() || null, active: true }));
            await load();
          }, msg) }, `Turn on ${p.label}`)));
        } else {
          const hin = h('input', { maxlength: 100, placeholder: 'Name or handle it posts as', 'aria-label': `${p.label} handle` });
          hin.value = handle || '';
          parts.push(h('form', { class: 'btns md-inline', onsubmit: action(async () => {
            const t = hin.value.trim();
            if (!t) throw new Error('Type the name or handle first.');
            await q(sb.from('social_accounts').update({ handle: t }).eq('platform', p.id));
            await load();
          }, msg) }, hin, h('button', { class: 'quiet', type: 'submit' }, handle ? 'Change' : 'Save')));
        }
        return h('li', {}, parts);
      });
      return h('details', { class: 'panel md-fold' }, h('summary', { text: 'Accounts and handles' }), h('ul', { class: 'list md-accounts' }, rows));
    }

    const root = h('div', { id: 'md-social' },
      reviewer ? askPanel() : h('p', { class: 'small dim', text: 'You see approved and posted posts. Drafts are seen by admins and the Media Director.' }),
      msg, asksEl, chipsEl, listEl, extraEl,
      h('p', { class: 'small dim', text: 'Nothing is posted automatically. A person posts after approval, by hand or from Post online. A post made by an AI must carry the AI label. Posts are for adults and teachers, not children.' }));
    load().catch((e) => listEl.replaceChildren(notice(e.message || 'Could not load social posts.')));
    window.addEventListener('way-media-posts', () => {
      if (root.isConnected && Date.now() - lastLoad > 2000) load().catch(() => { /* keep the last list */ });
    });
    return root;
  }

  // The page: a title, a row of tabs, and one tab shown at a time. Each tab is built the first time it is opened and
  // keeps its state after that. The last tab used is remembered in this browser.
  const TAB_KEY = 'way-media-tab';
  function view(render, parts) {
    const p = parts || {};
    const TABS = [
      { id: 'posts', label: 'Posts', make: () => social(nav) },
      { id: 'ideas', label: 'Ideas and copy', make: () => ideasHub(go) },
      p.postNode ? { id: 'online', label: 'Post online', make: () => p.postNode } : null,
      STATS ? { id: 'analytics', label: 'Analytics', make: () => STATS.panel() } : null,
      IMAGES ? { id: 'images', label: 'Images', make: () => IMAGES.panel() } : null,
      { id: 'guide', label: 'The Way', make: guide, hidden: true },
    ].filter(Boolean);
    const built = new Map();
    let cur = 'posts';
    try { const s = localStorage.getItem(TAB_KEY); if (TABS.some((t) => t.id === s)) cur = s; } catch { /* private mode */ }
    const bar = h('div', { class: 'md-tabbar', role: 'tablist', 'aria-label': 'Media' });
    const panel = h('div', { class: 'md-panel', role: 'tabpanel' });
    const buttons = TABS.filter((t) => !t.hidden).map((t) => {
      const b = h('button', { type: 'button', role: 'tab', class: 'md-tabbtn', id: 'md-tab-' + t.id }, h('span', { text: t.label }));
      b.onclick = () => go(t.id);
      b.addEventListener('keydown', (e) => {
        if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
        const vis = TABS.filter((x) => !x.hidden);
        const i = vis.findIndex((x) => x.id === t.id);
        const n = vis[(i + (e.key === 'ArrowRight' ? 1 : vis.length - 1)) % vis.length];
        go(n.id); document.getElementById('md-tab-' + n.id).focus();
      });
      return b;
    });
    bar.append(...buttons);
    const nav = { go: (id, focusId) => go(id, focusId), has: (id) => TABS.some((x) => x.id === id) };
    function go(id, focusId) {
      const t = TABS.find((x) => x.id === id) || TABS[0];
      cur = t.id;
      try { localStorage.setItem(TAB_KEY, cur); } catch { /* private mode */ }
      for (const b of buttons) {
        const on = b.id === 'md-tab-' + cur;
        b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1;
      }
      if (!built.has(cur)) built.set(cur, t.make());
      panel.setAttribute('aria-labelledby', 'md-tab-' + (t.hidden ? 'posts' : cur));
      panel.replaceChildren(built.get(cur));
      if (cur === 'online') changed(focusId);   // Post online reloads Ready to post each time it is opened
      if (cur === 'posts') window.dispatchEvent(new CustomEvent('way-media-posts'));   // Posts reloads too, after posting elsewhere
    }
    const guideLink = h('button', { type: 'button', class: 'md-guidelink', text: 'The Way / Not The Way' });
    guideLink.onclick = () => go(cur === 'guide' ? 'posts' : 'guide');
    render(h('div', { class: 'md-page' },
      h('div', { class: 'md-head' }, h('h1', { text: 'Media' }), guideLink),
      bar, panel));
    go(cur);
  }
  return { view };
}
window.TheWayMedia = { make, THE_WAY, NOT_THE_WAY, PLATFORMS };
})();
