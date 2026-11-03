// Admin > Media ("Media relations"). Three parts: the site analytics panel, a short list of suggested marketing ideas
// (marketing and admins add drafts, admins approve: the database enforces that), and the
// "The Way / Not The Way" guide. Client-side only, no build step. Text goes in through textContent only.
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

function make({ sb, h, q, notice, action, ask, STATS, IMAGES, canWrite, uid }) {
  const list = (items) => h('ul', { class: 'md-list' }, items.map((t) => h('li', { text: t })));

  function guide() {
    return h('div', { class: 'md-guide' },
      h('p', { class: 'muted', text: 'We are not another algorithm pushing news at people. We let our work spread on its own, the way a good book or a good tip does. If something is already blowing up, a light nudge is fine.' }),
      h('div', { class: 'md-cols' },
        h('div', { class: 'panel md-way' }, h('h3', { text: 'The Way' }), list(THE_WAY)),
        h('div', { class: 'panel md-not' }, h('h3', { text: 'Not The Way' }), list(NOT_THE_WAY))));
  }

  function ideas() {
    const isAdmin = typeof canWrite === 'function' ? canWrite() : !!canWrite;   // admins and super admins: approve, edit and delete anything
    const me = typeof uid === 'function' ? uid() : uid;
    const msg = h('div');
    const approvedList = h('ul', { class: 'list panel md-ideas' });
    const draftList = h('ul', { class: 'list panel md-ideas' });
    const tabApproved = h('button', { type: 'button', class: 'quiet md-tab', 'aria-pressed': 'true' });
    const tabDrafts = h('button', { type: 'button', class: 'quiet md-tab', 'aria-pressed': 'false' });
    const body = h('textarea', { maxlength: 500, rows: 2, placeholder: 'One idea, in a sentence or two', 'aria-label': 'New idea' });
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
      const rows = await q(sb.from('marketing_ideas').select('id,body,reason,status,source,created_by,created_at').order('id', { ascending: false }).limit(300));
      const ok = rows.filter((r) => r.status === 'approved'), dr = rows.filter((r) => r.status !== 'approved');
      tabApproved.textContent = `Approved (${ok.length})`;
      tabDrafts.textContent = `Drafts waiting (${dr.length})`;
      approvedList.replaceChildren(...(ok.length ? ok.map(row) : [h('li', { class: 'muted', text: 'No approved ideas yet.' })]));
      draftList.replaceChildren(...(dr.length ? dr.map(row) : [h('li', { class: 'muted', text: 'No drafts waiting.' })]));
    }
    const row = (r) => {
      const mineDraft = r.status !== 'approved' && r.source === 'human' && r.created_by === me;
      return h('li', {},
        h('div', { text: r.body }),
        r.reason ? h('div', { class: 'small muted', text: `Why: ${r.reason}` }) : null,
        h('div', { class: 'meta' }, `added ${new Date(r.created_at).toLocaleDateString(undefined, { dateStyle: 'medium' })} `,
          r.status !== 'approved' ? h('span', { class: 'tag warn', text: 'draft' }) : null, ' ',
          r.source === 'llm' ? h('span', { class: 'tag', text: 'suggested by the assistant' }) : null),
        isAdmin || mineDraft ? h('div', { class: 'btns' },
          isAdmin && r.status !== 'approved' ? h('button', { class: 'quiet', onclick: action(async () => {
            await q(sb.from('marketing_ideas').update({ status: 'approved' }).eq('id', r.id));
            await load();
          }, msg) }, 'Approve') : null,
          h('button', { class: 'quiet', onclick: action(async () => {
            const t = await ask('Edit the idea (3 to 500 characters):', r.body);
            if (!t) return;
            await q(sb.from('marketing_ideas').update({ body: t.trim() }).eq('id', r.id));
            await load();
          }, msg) }, 'Edit'),
          isAdmin ? h('button', { class: 'quiet', onclick: action(async () => {
            if ((await ask('Type DELETE to remove this idea:')) !== 'DELETE') return;
            await q(sb.from('marketing_ideas').delete().eq('id', r.id));
            await load();
          }, msg) }, 'Delete') : null) : null);
    };

    // Marketing and admins add ideas. A marketing idea is a draft until an admin approves it; an admin's own idea is approved at once.
    const add = h('form', { class: 'panel', onsubmit: action(async () => {
      const t = body.value.trim();
      if (t.length < 3) throw new Error('Write at least a few words.');
      const row = { body: t, status: isAdmin ? 'approved' : 'draft', source: 'human' };
      if (why.value.trim()) row.reason = why.value.trim();
      await q(sb.from('marketing_ideas').insert(row));
      body.value = ''; why.value = '';
      await load();
      showTab(isAdmin ? 'approved' : 'drafts');
    }, msg) }, h('label', {}, 'Add an idea', body), h('label', {}, 'Reason', why),
      h('p', { class: 'small dim', text: isAdmin ? 'Ideas you add are approved right away.' : 'Your idea waits as a draft until an admin approves it.' }),
      h('div', { class: 'btns' }, h('button', { class: 'primary', type: 'submit' }, 'Add idea')));

    load().catch((e) => approvedList.replaceChildren(h('li', {}, notice(e.message || 'Could not load the ideas. Has migration 0089 been run?'))));
    showTab('approved');
    return h('div', {}, msg, add, h('div', { class: 'btns md-tabs' }, tabApproved, tabDrafts), approvedList, draftList,
      h('p', { class: 'small dim', text: 'Only approved ideas are shown by default. Admins approve drafts. Nothing here is posted anywhere by itself.' }));
  }

  function view(section, render) {
    render(h('h1', { text: 'Media' }), h('p', { class: 'lede', text: 'Media relations' }),
      section('guide', 'The Way / Not The Way', guide()),
      section('ideas', 'Suggested marketing ideas', ideas()),
      STATS ? section('analytics', 'Site analytics and SEO', STATS.panel()) : null,
      IMAGES ? section('images', 'Image copy', IMAGES.panel()) : null);
  }
  return { view };
}
window.TheWayMedia = { make, THE_WAY, NOT_THE_WAY };
})();
