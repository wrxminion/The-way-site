// Review status of AI-written pages. Reached from the dropdown on a public page (#/status/<page>/<new status>) and from
// Admin > Review status of AI-written pages. Saves with public.content_review_set (migration 0044), which checks the role
// and logs who changed what. A scheduled GitHub Action copies the statuses to the public site about every 15 minutes.
// app.js hands over its helpers once: TheWayContentStatus.make({ sb, h, q, render, notice, when }).
(() => {
'use strict';

const STATUS = {
  ai_unchecked: 'AI written, unchecked',
  skimmed: 'AI written, human skimmed',
  read: 'AI written, human read',
  under_review: 'Under review (some sources verified)',
  confirmed: 'Confirmed accurate by a human (all sources verified)',
};

function make(ctx) {
  const { sb, h, q, render, notice, when } = ctx;
  const fromB64 = (s) => { try { return atob(String(s).replace(/-/g, '+').replace(/_/g, '/')); } catch { return ''; } };
  const OK = /^\/(preview\/pages|research)\/[A-Za-z0-9_./-]{1,300}$/;

  async function view(code, pick) {
    const path = fromB64(code);
    if (!OK.test(path) || path.includes('..')) return render(notice('That page address is not valid.'));
    let allowed = false;
    try { allowed = await q(sb.rpc('content_review_can_set')); } catch { /* migration 0044 not run */ }
    if (!allowed) return render(h('h1', { text: 'Review status' }), notice('Your role cannot change review status, or migration 0044 has not been run yet.'));
    const current = await q(sb.rpc('content_review_get', { p_path: path }));
    const sel = h('select', { id: 'cs-status' }, Object.keys(STATUS).map((k) => h('option', { value: k, text: STATUS[k] })));
    sel.value = STATUS[pick] ? pick : current;
    const note = h('input', { type: 'text', maxlength: '300', id: 'cs-note', placeholder: 'Optional note, for example which sources you checked' });
    const msg = h('div');
    const save = h('button', { class: 'primary', type: 'button', text: 'Save status' });
    save.onclick = async () => {
      save.disabled = true;
      try {
        await q(sb.rpc('content_review_set', { p_path: path, p_status: sel.value, p_note: note.value.trim() || null }));
        msg.replaceChildren(notice('Saved. The public page shows it within about 15 minutes.', 'ok'));
      } catch (e) { msg.replaceChildren(notice('Could not save: ' + (e.message || e))); save.disabled = false; }
    };
    render(h('h1', { text: 'Review status' }),
      h('div', { class: 'panel' },
        h('p', {}, 'Page: ', h('a', { href: path, target: '_blank', rel: 'noopener', text: path })),
        h('p', { class: 'muted', text: 'Now: ' + STATUS[current] }),
        h('label', { for: 'cs-status', text: 'New status' }), sel,
        h('label', { for: 'cs-note', text: 'Note (kept in the change log)' }), note,
        h('div', { class: 'btns' }, save, h('a', { class: 'button quiet', href: '#/admin', text: 'Back to Admin' })), msg),
      h('p', { class: 'small muted', text: 'Skimmed means a person looked it over for obvious problems. Read means a person read all of it. Under review means some sources are verified. Confirmed means every source is verified.' }));
  }

  function panel() {
    const root = h('div', { class: 'panel' });
    const status = h('p', { class: 'muted small', text: 'Loading...' });
    const list = h('div');
    const rolesLine = h('p', { class: 'muted small' });
    const AT = window.TheWayAdminTools;
    const bar = AT ? AT.filterBar({ placeholder: 'Filter by page, person or note', facets: [
      { key: 'verified', label: 'Verified', options: [['yes', 'Verified (all sources)'], ['part', 'Partly verified'], ['no', 'Not verified']] },
      { key: 'status', label: 'Status', options: Object.keys(STATUS).map((k) => [k, STATUS[k]]) }] }) : null;
    root.append(h('h2', { text: 'Review status of AI-written pages' }),
      h('p', { class: 'muted small', text: 'Every AI-written page shows "AI written, human skimmed" until its status is changed. Admins (and later reviewers and editors) change a page from the dropdown on the page itself. Recent changes:' }),
      rolesLine, status, bar ? bar.el : null, list);
    (async () => {
      try {
        const [rows, roles] = await Promise.all([q(sb.rpc('content_review_log_recent', { p_limit: 30 })), q(sb.rpc('content_review_roles'))]);
        if (roles) rolesLine.textContent = 'Roles that can change a status (besides admin): ' + (roles.filter((r) => r !== 'admin').join(', ') || 'none') + '. Widen with content_review_set_roles.';
        status.textContent = rows.length ? '' : 'No changes yet. Everything shows the default.';
        const rowEls = rows.map((r) => h('div', { style: 'padding:4px 0;border-top:1px solid var(--line)', class: 'small' },
          h('a', { href: r.path, target: '_blank', rel: 'noopener', text: r.path }), ` ${STATUS[r.old_status] || r.old_status} to ${STATUS[r.new_status] || r.new_status}, by ${r.changed_by_name}, ${when ? when(r.changed_at) : r.changed_at}` + (r.note ? ': ' + r.note : '')));
        list.replaceChildren(...rowEls);
        if (bar) bar.set(rows.map((r, i) => ({ el: rowEls[i], text: `${r.path} ${r.changed_by_name} ${r.note || ''}`,
          facets: { verified: r.new_status === 'confirmed' ? 'yes' : r.new_status === 'under_review' ? 'part' : 'no', status: r.new_status } })));
      } catch (e) { status.textContent = 'Could not load. If this says the function does not exist, migration 0044 has not been run yet. ' + (e.message || ''); }
    })();
    return root;
  }
  return { view, panel };
}

window.TheWayContentStatus = { make };
})();
