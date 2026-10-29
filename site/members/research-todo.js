// Admin > Research to-do (super admins only). The list lives in the private team-research bucket as research-todo.json,
// never in this repository. Each item carries three 1-5 numbers; the page adds them up, so the formula is visible.
// Plain JavaScript, no build step; every string goes in through textContent. app.js hands over its helpers once:
// TheWayTodo.make({ sb, h, q, render, notice }).
(() => {
'use strict';

const BONUS = 5;
const score = (i) => i.reach + i.sig + i.interest + (i.interesting ? BONUS : 0);
const byScore = (a, b) => score(b) - score(a) || String(a.name).localeCompare(String(b.name));

function make(ctx) {
  const { sb, h, q, render, notice } = ctx;

  async function view() {
    render(h('h1', { text: 'Research to-do' }), h('p', { class: 'muted', text: 'Loading...' }));
    const { data, error } = await sb.storage.from('team-research').download('research-todo.json');
    if (error) return render(h('p', {}, h('a', { href: '#/admin', text: '← Admin' })), h('h1', { text: 'Research to-do' }),
      notice('The to-do list is not uploaded yet. On Private research, use Upload folder with the research-todo upload folder.'));
    let list;
    try { list = JSON.parse(await data.text()); } catch { return render(notice('The to-do file could not be read.')); }
    const items = list.items || [];
    const states = list.states || {};

    const search = h('input', { type: 'search', placeholder: 'Filter by name', 'aria-label': 'Filter by name' });
    const hideDone = h('input', { type: 'checkbox' });
    const body = h('div');

    const row = (i) => h('li', { class: 'todo-row' },
      h('span', { class: 'todo-score', title: `reach ${i.reach} + significance ${i.sig} + interest ${i.interest}${i.interesting ? ' + ' + BONUS + ' interesting' : ''}`, text: String(score(i)) }),
      h('div', {},
        h('strong', { text: i.name }), i.interesting ? h('span', { class: 'tag ok', text: 'interesting' }) : null,
        i.done ? h('span', { class: 'tag', text: 'human reviewed' }) : null,
        h('div', { class: 'small dim', text: [i.list === 'Tribes' ? i.state : '', i.progress, i.note].filter(Boolean).join(' · ') })));

    const ul = (arr) => h('ul', { class: 'list todo-list' }, arr.map(row));
    const section = (title, blurb, open, ...kids) => h('details', { class: 'panel', open: open ? '' : null },
      h('summary', {}, h('h2', { class: 'todo-h', text: title })), h('p', { class: 'small dim', text: blurb }), ...kids);

    function draw() {
      const needle = search.value.trim().toLowerCase();
      const keep = (i) => (!hideDone.checked || !i.done) && (!needle || (i.name + ' ' + i.note + ' ' + i.state + ' ' + (i.stateName || '')).toLowerCase().includes(needle));
      const pick = (g) => items.filter((i) => i.group === g && keep(i));

      // 1. ballot measures and people running, one block per state in Frank's order
      const stateOrder = Object.entries(states).sort((a, b) => a[1].order - b[1].order);
      const first = stateOrder.map(([ab, s]) => {
        const mine = items.filter((i) => i.group === 'ballot-people' && i.state === ab && keep(i));
        if (!mine.length) return needle ? null : h('div', { class: 'todo-state' }, h('strong', { text: `${s.order}. ${s.name}` }), h('span', { class: 'small dim', text: ' no ballot measures or races listed yet' }));
        const bal = mine.filter((i) => i.list === 'Ballot measures').sort(byScore), ppl = mine.filter((i) => i.list === 'People running').sort(byScore);
        const det = h('details', { class: 'todo-state' }, h('summary', {}, h('strong', { text: `${s.order}. ${s.name}` }),
          h('span', { class: 'small dim', text: ` ${bal.length} ballot measures, ${ppl.length} races` })));
        let built = false;
        const fill = () => {
          if (built) return; built = true;
          det.append(bal.length ? h('h3', { text: 'Ballot measures (lineage dives)' }) : null, bal.length ? ul(bal) : null,
            ppl.length ? h('h3', { text: 'People running (candidate research)' }) : null, ppl.length ? ul(ppl) : null);
        };
        det.addEventListener('toggle', () => { if (det.open) fill(); });
        if (needle && mine.length < 40) { det.open = true; fill(); }
        return det;
      }).filter(Boolean);

      const tribes = pick('tribes').sort(byScore);
      const others = pick('other').sort(byScore);
      const lists = [...new Set(others.map((i) => i.list))];
      body.replaceChildren(
        section('1. State ballot measures and people running', 'In Frank\'s state order: Colorado, Oklahoma, North Carolina, South Carolina, Florida, then by population. Inside a state, highest score first.', true, ...first),
        section(`2. Tribes (${tribes.length})`, 'Highest score first.', false, ul(tribes)),
        section(`3. Everything else (${others.length})`, 'Ideas lists and state history topics, highest score first. Items already built are left out.', false,
          h('p', { class: 'small dim', text: 'Lists: ' + lists.join(', ') }), ul(others)));
    }
    search.oninput = draw; hideDone.onchange = draw;

    render(
      h('p', {}, h('a', { href: '#/admin', text: '← Admin' })),
      h('h1', { text: 'Research to-do' }), h('span', { class: 'tag', text: 'super admins only' }),
      h('div', { class: 'panel' }, h('h2', { text: 'How the score works' }),
        h('p', { text: `Score = Reach + Significance + Interest, each 1 to 5, plus ${BONUS} if the item is flagged "interesting". Highest score goes first, inside each of the three groups.` }),
        h('ul', { class: 'small' },
          h('li', { text: 'Reach: how many people it touches (state or nation population; for a race, how big the office is).' }),
          h('li', { text: 'Significance: historical and legal weight (court rulings, treaties, constitutional change).' }),
          h('li', { text: 'Interest: how much the public is likely to look for it.' }),
          h('li', { text: `Interesting: a small but notable item gets +${BONUS}, so it can jump ahead of larger ones.` })),
        h('p', { class: 'small dim', text: `Numbers are our first guess and can be changed in the file. Built ${list.built || 'unknown'}. ${items.length} items. Hover a score to see its parts.` })),
      h('div', { class: 'panel' }, h('label', {}, 'Filter ', search), ' ', h('label', { class: 'small' }, hideDone, ' hide human-reviewed')),
      body);
    draw();
  }
  return { view };
}

window.TheWayTodo = { make };
})();
