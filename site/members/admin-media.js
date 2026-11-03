// Admin > Media ("Media relations"). Three parts: the site analytics panel, a short list of suggested marketing ideas
// (read by marketing and admins, written by admins and super admins: the database enforces that), and the
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

function make({ sb, h, q, notice, action, ask, STATS, canWrite }) {
  const list = (items) => h('ul', { class: 'md-list' }, items.map((t) => h('li', { text: t })));

  function guide() {
    return h('div', { class: 'md-guide' },
      h('p', { class: 'muted', text: 'We are not another algorithm pushing news at people. We let our work spread on its own, the way a good book or a good tip does. If something is already blowing up, a light nudge is fine.' }),
      h('div', { class: 'md-cols' },
        h('div', { class: 'panel md-way' }, h('h3', { text: 'The Way' }), list(THE_WAY)),
        h('div', { class: 'panel md-not' }, h('h3', { text: 'Not The Way' }), list(NOT_THE_WAY))));
  }

  function ideas() {
    const writable = typeof canWrite === 'function' ? canWrite() : !!canWrite;
    const msg = h('div');
    const ul = h('ul', { class: 'list panel md-ideas' });
    const body = h('textarea', { maxlength: 500, rows: 2, placeholder: 'One idea, in a sentence or two', 'aria-label': 'New idea' });

    async function load() {
      const rows = await q(sb.from('marketing_ideas').select('id,body,created_at,updated_at').order('id', { ascending: false }).limit(200));
      ul.replaceChildren(...(rows.length ? rows.map(row) : [h('li', { class: 'muted', text: 'No ideas yet.' })]));
    }
    const row = (r) => h('li', {},
      h('div', { text: r.body }),
      h('div', { class: 'meta', text: `added ${new Date(r.created_at).toLocaleDateString(undefined, { dateStyle: 'medium' })}` }),
      writable ? h('div', { class: 'btns' },
        h('button', { class: 'quiet', onclick: action(async () => {
          const t = await ask('Edit the idea (3 to 500 characters):', r.body);
          if (!t) return;
          await q(sb.from('marketing_ideas').update({ body: t.trim() }).eq('id', r.id));
          await load();
        }, msg) }, 'Edit'),
        h('button', { class: 'quiet', onclick: action(async () => {
          if ((await ask('Type DELETE to remove this idea:')) !== 'DELETE') return;
          await q(sb.from('marketing_ideas').delete().eq('id', r.id));
          await load();
        }, msg) }, 'Delete')) : null);

    const add = writable ? h('form', { class: 'panel', onsubmit: action(async () => {
      const t = body.value.trim();
      if (t.length < 3) throw new Error('Write at least a few words.');
      await q(sb.from('marketing_ideas').insert({ body: t }));
      body.value = '';
      await load();
    }, msg) }, h('label', {}, 'Add an idea', body), h('div', { class: 'btns' }, h('button', { class: 'primary', type: 'submit' }, 'Add idea'))) : null;

    load().catch((e) => ul.replaceChildren(h('li', {}, notice(e.message || 'Could not load the ideas. Has migration 0088 been run?'))));
    return h('div', {}, msg, add, ul,
      h('p', { class: 'small dim', text: writable ? 'Admins and super admins can add, edit and delete ideas. Marketing can read them.' : 'Admins add and edit these ideas. You can read them here.' }));
  }

  function view(section, render) {
    render(h('h1', { text: 'Media' }), h('p', { class: 'lede', text: 'Media relations' }),
      section('guide', 'The Way / Not The Way', guide()),
      section('ideas', 'Suggested marketing ideas', ideas()),
      STATS ? section('analytics', 'Site analytics and SEO', STATS.panel()) : null);
  }
  return { view };
}
window.TheWayMedia = { make, THE_WAY, NOT_THE_WAY };
})();
