// Admin > Ledger checks. Admins tick the rows of the public Development Ledger that a person has looked at on the live
// site. Ticks are saved with public.ledger_check_set (migration 0040); a scheduled GitHub Action copies them to the
// ledger-data branch about every 15 minutes and the public ledger page shows "Live, checked by a person".
// Only row ids and true/false are stored, never who ticked. Plain JavaScript, no build step; text goes in with textContent.
// app.js hands over its helpers once: TheWayLedger.make({ sb, h, q }).
(() => {
'use strict';

function make(ctx) {
  const { sb, h, q } = ctx;

  function panel() {
    const root = h('div', { class: 'panel' });
    const status = h('p', { class: 'muted small', text: 'Loading...' });
    const list = h('div');
    root.append(h('h2', { text: 'Ledger checks' }),
      h('p', { class: 'muted small', text: 'Tick a row once a person has looked at it on the live site. The public ledger then shows "Live, checked by a person" for it, within about 15 minutes. Un-tick to take the mark off.' }),
      status, list);

    async function load() {
      try {
        const [rowsRes, marks] = await Promise.all([
          fetch('/development/data/ledger.json', { cache: 'no-store' }).then((r) => r.json()),
          q(sb.rpc('ledger_checks_public')),
        ]);
        const on = new Set(marks.checked || []), off = new Set(marks.unchecked || []);
        const rows = (rowsRes.rows || []).slice().reverse();
        status.textContent = `${rows.length} rows. Saved ticks: ${on.size}. Saved un-ticks: ${off.size}.`;
        list.replaceChildren(...rows.map((r) => {
          const base = r.checked_by_person === true;
          const state = off.has(r.id) ? false : on.has(r.id) ? true : base;
          const box = h('input', { type: 'checkbox' });
          box.checked = state;
          const note = h('span', { class: 'small dim' });
          box.onchange = async () => {
            box.disabled = true; note.textContent = ' saving...';
            try { await q(sb.rpc('ledger_check_set', { p_row: r.id, p_checked: box.checked })); note.textContent = ' saved'; }
            catch (e) { box.checked = !box.checked; note.textContent = ' could not save: ' + (e.message || e); }
            box.disabled = false;
          };
          return h('label', { style: 'display:block;padding:4px 0;border-top:1px solid var(--line)' }, box, ' ',
            h('strong', { text: r.id }), ' ' + String(r.title || '').slice(0, 90), note);
        }));
      } catch (e) {
        status.textContent = 'Could not load. If this says the function does not exist, migration 0040 has not been run yet. ' + (e.message || '');
      }
    }
    load();
    return root;
  }
  return { panel };
}

window.TheWayLedger = { make };
})();
