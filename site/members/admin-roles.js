// Admin > Roles tree. Each role is one entry in ROLE_NODES with an optional parent, so a new sibling or child role
// (for example super mods) is one new line here, plus the database role list. Nothing here grants access: the
// database decides that. This only shows who sits where. Client-side only, no build step.
(() => {
'use strict';
const ROLE_NODES = [
  { id: 'super_admin', parent: null, label: 'Super admin', sees: 'Everything, including analytics, research to-do and who holds the admin roles.' },
  { id: 'admin', parent: 'super_admin', label: 'Admin', sees: 'Members, invitations, ledger checks, review status, notify list.' },
  { id: 'marketing', parent: 'admin', label: 'Marketing', sees: 'Site analytics and SEO numbers only. No member picks, member data, review queues or user management.' },
  { id: 'drafter', parent: 'marketing', label: 'Drafter', sees: 'Only for the account the local drafter signs in as. Reads draft asks from the Media page and adds AI-made drafts. Cannot approve, post or delete.' },
];

function make({ h }) {
  const kids = (id) => ROLE_NODES.filter((n) => (n.parent || null) === id);
  const node = (n) => {
    const sub = kids(n.id);
    return h('li', { class: 'rt-node' },
      h('div', { class: 'rt-card' },
        h('strong', { text: n.label }), ' ', h('span', { class: 'tag', text: n.id }),
        h('div', { class: 'small dim', text: n.sees })),
      sub.length ? h('ul', { class: 'rt-kids' }, sub.map(node)) : null);
  };
  const panel = () => h('div', { class: 'panel' },
    h('p', { class: 'muted small', text: 'Admin roles, from the top down. A role sits under the one that can hand it out. Give or remove a role from the Members list below.' }),
    h('ul', { class: 'rt-tree', 'aria-label': 'Admin role hierarchy' }, kids(null).map(node)));
  return { panel };
}
window.TheWayRoles = { make, nodes: ROLE_NODES };
})();
