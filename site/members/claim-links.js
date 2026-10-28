// Research desk: link a finding to research projects, the Projects page, and "AI help write my claim" (migration 0026).
// Plain JavaScript, no build step. Every piece of user text goes into the page with textContent, never innerHTML.
// app.js hands over its own helpers once: TheWayClaim.make({ sb, h, q, notice, action, render, can, when }).
(() => {
'use strict';

const RELATIONS = { supports: 'Supports', counter_example: 'Counter-example', related: 'Related' };
const RELATION_HELP = {
  supports: 'This finding adds evidence for the project\'s theme.',
  counter_example: 'This finding cuts against, or is an exception to, the project\'s theme.',
  related: 'Connected, but it neither supports nor cuts against it.',
};
const AI_LABEL = 'AI draft, unchecked';
const POLL_MS = 6000;
const POLL_MAX = 100;   // about 10 minutes, then it keeps waiting in the queue and the box says so

const slugify = (s) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9\s-]/g, '').trim()
  .replace(/\s+/g, '-').replace(/-+/g, '-').slice(0, 70).replace(/^-|-$/g, '');

function make(ctx) {
  const { sb, h, q, notice, action, render, can } = ctx;

  // ---------------------------------------------------------------- projects (shared by the pieces below)
  let cache = null;
  async function projects(fresh) {
    if (!cache || fresh) cache = await q(sb.from('research_projects').select('*').order('title'));
    return cache;
  }
  const top = (all) => all.filter((p) => !p.parent_id);
  const strandsOf = (all, p) => all.filter((x) => x.parent_id === p.id);
  const titleOf = (all, p) => { const par = p.parent_id && all.find((x) => x.id === p.parent_id); return par ? `${par.title}: ${p.title}` : p.title; };

  function projectSelect(all, name) {
    const sel = h('select', { name }, h('option', { value: '', text: 'Choose a project' }));
    for (const p of top(all).filter((x) => x.active)) {
      const kids = strandsOf(all, p).filter((x) => x.active);
      sel.append(kids.length
        ? h('optgroup', { label: p.title }, h('option', { value: p.id, text: `${p.title} (whole project)` }), kids.map((k) => h('option', { value: k.id, text: k.title })))
        : h('option', { value: p.id, text: p.title }));
    }
    return sel;
  }
  function relationSelect(name) {
    return h('select', { name }, Object.entries(RELATIONS).map(([k, label]) => h('option', { value: k, text: label })));
  }
  const relationHelp = (sel) => { const p = h('p', { class: 'muted small', text: RELATION_HELP[sel.value] }); sel.addEventListener('change', () => { p.textContent = RELATION_HELP[sel.value]; }); return p; };

  // ---------------------------------------------------------------- 1. optional link when starting a finding
  function startPicker() {
    const slot = h('div', { class: 'cl-start' }, h('p', { class: 'muted small', text: 'Loading projects…' }));
    let sel = null; let rel = null; let note = null;
    projects().then((all) => {
      sel = projectSelect(all, 'project'); rel = relationSelect('relation'); note = h('input', { name: 'link_note', maxlength: 300, placeholder: 'Optional: how it connects (for example, crime fell after the training)' });
      slot.replaceChildren(
        h('label', {}, 'Part of a research project (optional)', sel),
        h('label', {}, 'How it connects', rel), relationHelp(rel),
        h('label', {}, 'Note (optional)', note));
    }).catch(() => { slot.replaceChildren(h('p', { class: 'muted small', text: 'Projects could not be loaded. You can link the finding later.' })); });
    return {
      node: h('div', { class: 'cl-start-wrap' }, slot),
      // call after the finding exists; never throws, so a failed link cannot lose the finding
      async link(itemId) {
        if (!sel || !sel.value) return null;
        try { await q(sb.rpc('link_item_to_project', { p_item: itemId, p_project: +sel.value, p_relation: rel.value, p_note: note.value.trim() || null })); return null; }
        catch (e) { return e; }
      },
    };
  }

  // ---------------------------------------------------------------- 2. links panel on a finding
  async function itemLinks(item, canEdit, reload) {
    const [all, links] = await Promise.all([projects(), q(sb.from('research_item_links').select('*').eq('item_id', item.id).is('removed_at', null).order('id'))]);
    const msg = h('div');
    const rows = links.map((l) => {
      const p = all.find((x) => x.id === l.project_id);
      return h('li', {},
        h('div', { class: 'row' }, h('span', {}, h('strong', { text: p ? titleOf(all, p) : 'A project' }), ' ', h('span', { class: `tag ${l.relation === 'supports' ? 'ok' : l.relation === 'counter_example' ? 'warn' : ''}`, text: RELATIONS[l.relation] })),
          canEdit ? h('button', { class: 'quiet', type: 'button', text: 'Remove', onclick: action(async () => { await q(sb.rpc('unlink_item_from_project', { p_link: l.id })); await reload(); }, msg) }) : null),
        l.note ? h('div', { class: 'muted small', text: l.note }) : null);
    });
    let adder = null;
    if (canEdit) {
      const sel = projectSelect(all, 'project'); const rel = relationSelect('relation'); const note = h('input', { name: 'note', maxlength: 300, placeholder: 'Optional: how it connects' });
      adder = h('details', {}, h('summary', { text: links.length ? 'Link to another project' : 'Link to a project' }),
        h('form', { onsubmit: action(async () => {
          if (!sel.value) throw new Error('Choose a project.');
          await q(sb.rpc('link_item_to_project', { p_item: item.id, p_project: +sel.value, p_relation: rel.value, p_note: note.value.trim() || null }));
          await reload();
        }, msg) }, h('label', {}, 'Project', sel), h('label', {}, 'How it connects', rel), relationHelp(rel), h('label', {}, 'Note (optional)', note),
          h('div', { class: 'btns' }, h('button', { class: 'primary', text: 'Save link' }))));
    }
    return h('div', { class: 'panel' }, h('h2', { text: 'Research projects' }),
      rows.length ? h('ul', { class: 'list' }, rows) : h('p', { class: 'muted small', text: 'Not linked to a project yet.' }),
      msg, adder, h('p', { class: 'small' }, h('a', { href: '#/projects', text: 'See all projects' })));
  }

  // ---------------------------------------------------------------- 3. the Projects page (and admin list)
  async function projectsView() {
    const [all, links] = await Promise.all([
      projects(true),
      q(sb.from('research_item_links').select('id,project_id,relation,note,item:research_items(id,title)').is('removed_at', null).order('id')),
    ]);
    const msg = h('div');
    const admin = can('admin');
    const block = (p) => {
      const mine = links.filter((l) => l.project_id === p.id && l.item);
      return h('div', { class: 'cl-proj' },
        h('div', { class: 'row' }, h('strong', { text: p.title }), p.active ? null : h('span', { class: 'tag bad', text: 'retired' })),
        p.description ? h('p', { class: 'muted small', text: p.description }) : null,
        mine.length ? Object.keys(RELATIONS).map((r) => {
          const rs = mine.filter((l) => l.relation === r);
          return rs.length ? h('div', {}, h('span', { class: 'why-label', text: RELATIONS[r] }),
            h('ul', { class: 'small list' }, rs.map((l) => h('li', {}, h('a', { href: `#/research/${l.item.id}`, text: l.item.title }), l.note ? h('span', { class: 'muted', text: ` · ${l.note}` }) : null)))) : null;
        }) : h('p', { class: 'muted small', text: 'No findings linked yet.' }),
        admin ? h('div', { class: 'btns' }, h('button', { class: 'quiet', type: 'button', text: 'Edit', onclick: () => fillForm(p) }),
          h('button', { class: 'quiet', type: 'button', text: p.active ? 'Retire' : 'Bring back', onclick: action(async () => {
            await q(sb.rpc('save_research_project', { p_id: p.id, p_slug: p.slug, p_title: p.title, p_description: p.description, p_parent: p.parent_id, p_active: !p.active }));
            await projectsView();
          }, msg) })) : null);
    };
    // admin form
    let form = null; let editId = null;
    const f = {
      title: h('input', { required: true, minlength: 3, maxlength: 120, placeholder: 'Policing and ICE' }),
      slug: h('input', { required: true, pattern: '[a-z0-9\\-]{3,80}', placeholder: 'policing-and-ice' }),
      desc: h('textarea', { rows: 2, maxlength: 600, placeholder: 'One or two plain sentences on what this project covers' }),
      parent: h('select', {}, h('option', { value: '', text: 'No (this is a top-level project)' }), top(all).map((p) => h('option', { value: p.id, text: `Strand of: ${p.title}` }))),
    };
    let slugTouched = false;
    f.slug.addEventListener('input', () => { slugTouched = true; });
    f.title.addEventListener('input', () => { if (!slugTouched && !editId) f.slug.value = slugify(f.title.value); });
    function fillForm(p) {
      editId = p.id; slugTouched = true; f.title.value = p.title; f.slug.value = p.slug; f.desc.value = p.description || ''; f.parent.value = p.parent_id || '';
      form.querySelector('button.primary').textContent = 'Save changes'; form.scrollIntoView({ block: 'center' });
    }
    if (admin) {
      form = h('form', { onsubmit: action(async () => {
        const cur = editId && all.find((x) => x.id === editId);
        await q(sb.rpc('save_research_project', { p_id: editId, p_slug: f.slug.value.trim(), p_title: f.title.value.trim(), p_description: f.desc.value.trim() || null,
          p_parent: f.parent.value ? +f.parent.value : null, p_active: cur ? cur.active : true }));
        await projectsView();
      }, msg) }, h('label', {}, 'Title', f.title), h('label', {}, 'Strand?', f.parent), h('label', {}, 'What it covers', f.desc),
        h('details', {}, h('summary', { text: 'Web address (filled in for you)' }), h('label', {}, 'Lowercase words and dashes', f.slug)),
        h('div', { class: 'btns' }, h('button', { class: 'primary' }, 'Add project')));
    }
    render(
      h('p', { class: 'overline' }, h('a', { href: '#/research', text: 'Research desk' })),
      h('h1', { text: 'Research projects' }),
      h('p', { class: 'lede', text: 'Findings are grouped by topic. A finding can support a project\'s theme, be a counter-example to it, or just be related. Pick a project when you start a finding, or link it later from the finding\'s page.' }),
      msg,
      top(all).map((p) => h('div', { class: 'panel' }, block(p), strandsOf(all, p).length ? h('div', { class: 'cl-strands' }, strandsOf(all, p).map(block)) : null)),
      admin ? h('div', { class: 'panel' }, h('h2', { text: 'Add or edit a project' }), h('p', { class: 'muted small', text: 'Admins only. Changes are recorded in the moderation log. Retiring a project keeps its links but stops new ones.' }), form) : null);
  }

  // ---------------------------------------------------------------- 4. "AI help write my claim"
  // draftBox(formEl): returns { node, used(): the draft id when the author applied it, else null }.
  // The draft only fills the form; the author edits it and must tick the box before the form can be saved.
  function draftBox(formEl) {
    const msg = h('div'); const out = h('div'); const status = h('p', { class: 'muted small' });
    const notes = h('textarea', { form: 'cl-detached', rows: 5, minlength: 20, maxlength: 6000, placeholder: 'Your notes: what you found, in your own words. Numbers and names you mention can be used in the draft; nothing else will be.' });
    const urls = h('textarea', { form: 'cl-detached', rows: 3, placeholder: 'One source link per line (1 to 5). Web pages only; PDFs cannot be read yet.' });
    const confirmBox = h('input', { type: 'checkbox', id: 'cl-confirm' });
    const confirmRow = h('label', { class: 'cl-confirm', for: 'cl-confirm' }, confirmBox, ' I rewrote or checked this against the sources. These are my words now, and I stand behind them.');
    confirmRow.hidden = true;
    let used = null; let timer = null; let polls = 0;
    const btn = h('button', { type: 'button', class: 'primary', text: 'Ask the AI for a draft' });
    const stop = () => { if (timer) { clearInterval(timer); timer = null; } };

    function showDraft(d) {
      const dr = d.draft || {};
      const field = (label, text) => text ? h('div', { class: 'ex-part' }, h('span', { class: 'why-label', text: label }), h('p', { text })) : null;
      out.replaceChildren(h('div', { class: 'panel cl-draft' },
        h('div', { class: 'row' }, h('span', { class: 'tag warn', text: AI_LABEL }), h('span', { class: 'muted small', text: d.model ? `made on our own computer with ${d.model}` : '' })),
        field('Claim', dr.claim), field('Short answer', dr.summary), field('Strongest case against', dr.counterargument),
        (dr.passages || []).length ? h('div', { class: 'ex-part' }, h('span', { class: 'why-label', text: 'Passages copied word for word from your sources' }),
          h('ul', { class: 'small list' }, dr.passages.map((p) => h('li', {}, h('span', { text: `"${p.text}"` }), ' ', h('a', { href: p.url, target: '_blank', rel: 'noopener noreferrer', text: 'source' })))),
          h('p', { class: 'muted small', text: 'Use these as the quote when you add each source. They are checked against the page.' })) : null,
        h('p', { class: 'muted small', text: 'The AI can be wrong or miss a side. It only had your notes and links. Edit everything before you save.' }),
        h('div', { class: 'btns' }, h('button', { type: 'button', class: 'primary', text: 'Put this draft in the form', onclick: () => {
          const set = (name, v) => { const el = formEl.elements[name]; if (el && v) el.value = v; };
          set('claim', dr.claim); set('summary', dr.summary); set('counterargument', dr.counterargument);
          used = d.id; confirmBox.required = true; confirmRow.hidden = false;
          status.textContent = 'The draft is in the form below, labelled AI draft, unchecked. Edit it, then tick the box before you save.';
          if (formEl.elements.claim) formEl.elements.claim.focus();
        } }))));
    }
    async function poll(id) {
      const d = (await q(sb.from('claim_drafts').select('id,status,draft,model,error').eq('id', id)))[0];
      if (!d) return;
      if (d.status === 'done') { stop(); status.textContent = ''; btn.disabled = false; showDraft(d); }
      else if (d.status === 'failed') { stop(); btn.disabled = false; status.textContent = ''; out.replaceChildren(notice(d.error || 'The AI could not make a draft this time. Write the claim by hand.')); }
      else {
        const st = await q(sb.rpc('checker_status')).catch(() => null);
        status.textContent = d.status === 'running' ? 'The AI is writing a draft now…'
          : st && st.online ? 'In line for the AI computer…' : 'The AI computer is busy or switched off. Your request waits in line; you can keep writing and come back.';
        if (++polls > POLL_MAX) stop();
      }
    }
    function watch(id) { stop(); polls = 0; btn.disabled = true; poll(id).catch(() => {}); timer = setInterval(() => poll(id).catch(() => {}), POLL_MS); }
    btn.addEventListener('click', action(async () => {
      out.replaceChildren();
      const list = urls.value.split(/\n+/).map((x) => x.trim()).filter(Boolean);
      const id = await q(sb.rpc('request_claim_draft', { p_notes: notes.value, p_urls: list }));
      watch(id);
    }, msg));
    // pick up a request made before a page reload
    const since = new Date(Date.now() - 2 * 864e5).toISOString();
    q(sb.from('claim_drafts').select('id,status').is('used_in_version_id', null).gte('created_at', since).order('id', { ascending: false }).limit(1)).then((r) => {
      if (r[0] && r[0].status !== 'failed') watch(r[0].id);
    }).catch(() => {});
    const node = h('details', { class: 'panel cl-ai' }, h('summary', { text: 'AI help write my claim' }),
      h('p', { class: 'muted small', text: 'Paste your notes and the links to your sources. Our own AI, running on our own computer, drafts neutral wording that you then edit. It uses only what you give it, never writes about a candidate or party, and never decides your verdict. A person always reviews the finished finding.' }),
      h('label', {}, 'Your notes', notes), h('label', {}, 'Source links', urls), msg,
      h('div', { class: 'btns' }, btn), status, out, confirmRow);
    return { node, used: () => used };
  }
  async function draftUsed(box, versionId) {
    const id = box && box.used();
    if (id) await q(sb.rpc('mark_claim_draft_used', { p_draft: id, p_version: versionId }));
  }

  // ---------------------------------------------------------------- 5. what a reviewer sees on a version
  async function versionNote(versionId) {
    const n = await q(sb.rpc('version_ai_note', { p_version: versionId })).catch(() => null);
    if (!n) return null;
    return h('p', { class: 'small' }, h('span', { class: 'tag warn', text: 'Started from an AI draft' }), ' ',
      n.claim_changed ? 'The author changed the claim wording.' : 'The author kept the claim wording as drafted; check it carefully.');
  }

  return { startPicker, itemLinks, projectsView, draftBox, draftUsed, versionNote, RELATIONS };
}

window.TheWayClaim = { make };
})();
