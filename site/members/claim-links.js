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
const NONE_TEXT = 'None given in the sources.';
const OPTIONAL = ['counterargument', 'counter_response', 'methods', 'limitations'];
const FIELD_LABEL = { claim: 'The claim', summary: 'Short answer', body: 'Evidence', counterargument: 'The case against', counter_response: 'Our answer', methods: 'How we checked', limitations: 'Limits' };
const POLL_MS = 4000;   // about 30 minutes of polling at most; the request stays in line after that

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

  // ---------------------------------------------------------------- shared pieces for the AI helpers
  // A box under a field: tick "None given in the sources" instead of writing. The ticked box stores the sentence itself,
  // so reviewers read it plainly and the database sees an ordinary value. Claim and evidence have no such box.
  function noneBoxes(formEl) {
    const api = { tick() {} };
    const boxes = {};
    for (const name of OPTIONAL) {
      const el = formEl.elements[name]; const lab = el && el.closest('label');
      if (!el || !lab) continue;
      const cb = h('input', { type: 'checkbox', id: `cl-none-${name}` });
      const set = (on) => {
        cb.checked = on;
        if (on) { if (el.value.trim() !== NONE_TEXT) el.dataset.prev = el.value; el.value = NONE_TEXT; el.readOnly = true; el.classList.add('cl-none-on'); }
        else { el.readOnly = false; el.classList.remove('cl-none-on'); if (el.value.trim() === NONE_TEXT) el.value = el.dataset.prev || ''; }
      };
      cb.addEventListener('change', () => set(cb.checked));
      lab.after(h('label', { class: 'cl-none', for: cb.id }, cb, ' None given in the sources'));
      boxes[name] = set;
      if (el.value.trim() === NONE_TEXT) set(true);
    }
    api.tick = (name, on) => { if (boxes[name]) boxes[name](on); };
    return api;
  }
  function tagField(formEl, name, text) {
    const el = formEl.elements[name]; const lab = el && el.closest('label');
    if (lab && !lab.querySelector('.cl-field-tag')) lab.prepend(h('span', { class: 'tag warn cl-field-tag', text: text || AI_LABEL }), ' ');
  }

  // Live status for a queued AI job: elapsed time, place in line, a plain reason from the worker, the worker heartbeat,
  // and Cancel. It polls draft_progress; the clock ticks on its own between polls.
  function tracker() {
    const line = h('p', { class: 'cl-live', role: 'status', 'aria-live': 'polite' }); const sub = h('p', { class: 'muted small' });
    const cancel = h('button', { type: 'button', class: 'quiet', text: 'Cancel' });
    const node = h('div', { class: 'cl-tracker' }, line, sub, h('div', { class: 'btns' }, cancel)); node.hidden = true;
    let st = null; let id = null; let polls = 0; let handlers = {}; let pollTimer = null; let clockTimer = null;
    const mmss = (n) => `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`;
    const ago = (n) => n < 90 ? `${n} seconds` : n < 5400 ? `${Math.round(n / 60)} minutes` : `${Math.round(n / 3600)} hours`;
    function paint() {
      if (!st) return;
      const add = Math.max(0, Math.round((Date.now() - st.at) / 1000)); const p = st.p;
      const clock = p.status === 'running' ? `Working ${mmss((p.run_secs || 0) + add)}` : `Waiting ${mmss((p.age_secs || 0) + add)}`;
      let msg;
      if (!p.online) msg = 'The AI computer is offline right now. Your request is saved and will run when it is back.';
      else if (p.status === 'running') msg = `${p.note || 'Working on your request'}…`;
      else msg = `${p.worker_state && p.worker_note ? p.worker_note : 'In line for the AI computer.'} ${p.position > 0 ? `You are number ${p.position + 1} in line.` : 'You are next.'}`;
      line.textContent = `${clock} · ${msg}`;
      sub.textContent = p.last_seen_secs == null ? 'The AI computer has not checked in yet.'
        : p.online ? `The AI computer checked in ${ago(p.last_seen_secs + add)} ago, so this is not frozen.` : `Last heard from the AI computer ${ago(p.last_seen_secs + add)} ago.`;
    }
    function stop() { clearInterval(pollTimer); clearInterval(clockTimer); pollTimer = clockTimer = null; }
    async function poll() {
      if (!node.isConnected) { stop(); return; }
      const p = await q(sb.rpc('draft_progress', { p_draft: id }));
      if (!p) { stop(); node.hidden = true; return; }
      if (p.status === 'queued' || p.status === 'running') { st = { p, at: Date.now() }; paint(); if (++polls > 450) stop(); return; }
      stop(); node.hidden = true;
      if (p.status === 'done') handlers.done((await q(sb.from('claim_drafts').select('id,kind,draft,model').eq('id', id)))[0]);
      else if (p.status === 'failed') handlers.failed(p.error || 'The AI could not finish this time. Please try again later.');
      else handlers.cancelled();
    }
    cancel.addEventListener('click', async () => {
      cancel.disabled = true;
      try { await q(sb.rpc('cancel_claim_draft', { p_draft: id })); await poll(); } catch (e) { line.textContent = e.message; } finally { cancel.disabled = false; }
    });
    return { node, stop,
      watch(newId, hs) {
        stop(); id = newId; handlers = hs; polls = 0; st = null; node.hidden = false; line.textContent = 'Sending your request…'; sub.textContent = '';
        poll().catch(() => {}); pollTimer = setInterval(() => poll().catch(() => {}), POLL_MS); clockTimer = setInterval(paint, 1000);
      } };
  }

  // ---------------------------------------------------------------- 4. "AI help write my claim"
  // draftBox(formEl): returns { node, used(), sources(), none }.
  // The draft only fills the form (never the verdict); each filled box gets its own "AI draft, unchecked" tag; the author
  // edits it and must tick the box below before the form can be saved.
  const FILL = [['claim', 'claim'], ['summary', 'summary'], ['body', 'evidence'], ['counterargument', 'counterargument'],
    ['counter_response', 'counter_response'], ['methods', 'methods'], ['limitations', 'limitations']];
  function draftBox(formEl) {
    const msg = h('div'); const out = h('div'); const none = noneBoxes(formEl);
    const notes = h('textarea', { form: 'cl-detached', rows: 5, minlength: 20, maxlength: 6000, placeholder: 'Your notes: what you found, in your own words. Numbers and names you mention can be used in the draft; nothing else will be.' });
    const urls = h('textarea', { form: 'cl-detached', rows: 3, placeholder: 'One source link per line (1 to 5). Web pages only; PDFs cannot be read yet.' });
    const confirmBox = h('input', { type: 'checkbox', id: 'cl-confirm' });
    const confirmRow = h('label', { class: 'cl-confirm', for: 'cl-confirm' }, confirmBox, ' I rewrote or checked every box the AI filled against the sources. These are my words now, and I stand behind them.');
    confirmRow.hidden = true;
    let used = null; let picks = [];
    const btn = h('button', { type: 'button', class: 'primary', text: 'Ask the AI for a draft' });
    const live = tracker();
    const done = () => { btn.disabled = false; };

    function showDraft(d) {
      const dr = d.draft || {};
      const field = (label, text) => text ? h('div', { class: 'ex-part' }, h('span', { class: 'why-label', text: label }), h('p', { text })) : null;
      picks = (dr.passages || []).map((p) => ({ p, cb: h('input', { type: 'checkbox', checked: true }) }));
      out.replaceChildren(h('div', { class: 'panel cl-draft' },
        h('div', { class: 'row' }, h('span', { class: 'tag warn', text: AI_LABEL }), h('span', { class: 'muted small', text: d.model ? `made on our own computer with ${d.model}` : '' })),
        field('Claim', dr.claim), field('Short answer', dr.summary), field('Evidence', dr.evidence), field('Strongest case against', dr.counterargument),
        field('Our answer', dr.counter_response), field('How we checked', dr.methods), field('Limits', dr.limitations),
        picks.length ? h('div', { class: 'ex-part' }, h('span', { class: 'why-label', text: 'Passages copied word for word from your sources' }),
          h('ul', { class: 'small list' }, picks.map(({ p, cb }) => h('li', {}, h('label', {}, cb, ` "${p.text}" `), h('a', { href: p.url, target: '_blank', rel: 'noopener noreferrer', text: 'source' })))),
          h('p', { class: 'muted small', text: 'Ticked passages are added as sources, with that quote, when you save the version. The AI check opens each page and confirms the words are there. You mark which source is primary.' })) : null,
        (dr.notes || []).length ? h('div', { class: 'notice warn', role: 'note' }, h('ul', { class: 'small list' }, dr.notes.map((n) => h('li', { text: n })))) : null,
        h('p', { class: 'muted small', text: 'The verdict is always your choice; the AI never fills it. The AI can be wrong or miss a side. It only had your notes and links. Edit everything before you save.' }),
        h('div', { class: 'btns' }, h('button', { type: 'button', class: 'primary', text: 'Put this draft in the form', onclick: () => {
          for (const [name, key] of FILL) {
            const v = dr[key]; const el = formEl.elements[name];
            if (!v || !el) continue;
            if (OPTIONAL.includes(name) && v.trim() === NONE_TEXT) none.tick(name, true);
            else { none.tick(name, false); el.value = v; }
            tagField(formEl, name);
          }
          used = d.id; confirmBox.required = true; confirmRow.hidden = false;
          if (formEl.elements.claim) formEl.elements.claim.focus();
        } }))));
    }
    const hs = {
      done: (row) => { done(); showDraft(row); },
      failed: (m) => { done(); out.replaceChildren(notice(m)); },
      cancelled: () => { done(); out.replaceChildren(h('p', { class: 'muted small', text: 'Cancelled. Nothing was changed.' })); },
    };
    btn.addEventListener('click', action(async () => {
      out.replaceChildren();
      const list = urls.value.split(/\n+/).map((x) => x.trim()).filter(Boolean);
      const id = await q(sb.rpc('request_claim_draft', { p_notes: notes.value, p_urls: list }));
      btn.disabled = true; live.watch(id, hs);
    }, msg));
    // pick up a request made before a page reload
    const since = new Date(Date.now() - 2 * 864e5).toISOString();
    q(sb.from('claim_drafts').select('id,status').eq('kind', 'draft').is('used_in_version_id', null).gte('created_at', since).order('id', { ascending: false }).limit(1)).then((r) => {
      if (r[0] && (r[0].status === 'queued' || r[0].status === 'running' || r[0].status === 'done')) { btn.disabled = r[0].status !== 'done'; live.watch(r[0].id, hs); }
    }).catch(() => {});
    const node = h('details', { class: 'panel cl-ai' }, h('summary', { text: 'AI help write my claim' }),
      h('p', { class: 'muted small', text: 'Paste your notes and the links to your sources. Our own AI, running on our own computer, fills in as much of the form as the sources allow: claim, short answer, evidence (word-for-word passages), the case against and our answer, how we checked, and limits. Anything the sources do not cover says "None given in the sources." It uses only what you give it, never writes about a candidate or party, and never chooses your verdict. A person always reviews the finished finding.' }),
      h('label', {}, 'Your notes', notes), h('label', {}, 'Source links', urls), msg,
      h('div', { class: 'btns' }, btn), live.node, out, confirmRow);
    return { node, none, used: () => used, sources: () => picks.filter((x) => x.cb.checked).map((x) => x.p) };
  }
  // After the version is saved: record the draft and add the ticked passages as sources (skipping any already there).
  async function draftUsed(box, versionId) {
    const id = box && box.used();
    if (!id) return;
    await q(sb.rpc('mark_claim_draft_used', { p_draft: id, p_version: versionId }));
    const have = await q(sb.from('research_sources').select('url,quote').eq('version_id', versionId));
    const rows = box.sources().filter((p) => !have.some((x) => x.url === p.url && (x.quote || '').trim() === p.text.trim()))
      .map((p) => ({ version_id: versionId, url: p.url, title: '', source_type: 'secondary', publisher: null, quote: p.text, locator: null }));
    if (rows.length) await q(sb.from('research_sources').insert(rows));
  }

  // ---------------------------------------------------------------- 4b. "Check spelling and grammar" (suggestions only)
  const PROOF = ['claim', 'summary', 'body', 'counterargument', 'counter_response', 'methods', 'limitations'];
  const guarded = (t) => JSON.stringify([(t.match(/"[^"\n]{3,}"|“[^”\n]{3,}”|https?:\/\/[^\s)\]>]+/g) || []), (t.match(/\d[\d,.]*\d|\d/g) || [])]);
  function wordDiff(a, b) {
    const x = a.split(/(\s+)/); const y = b.split(/(\s+)/);
    if (x.length * y.length > 4e6) return [h('span', { class: 'cl-del', text: a }), ' ', h('span', { class: 'cl-ins', text: b })];
    const dp = Array.from({ length: x.length + 1 }, () => new Uint16Array(y.length + 1));
    for (let i = x.length - 1; i >= 0; i--) for (let j = y.length - 1; j >= 0; j--) dp[i][j] = x[i] === y[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    const out = []; let i = 0; let j = 0;
    const push = (cls, t) => { if (t) out.push(cls ? h('span', { class: cls, text: t }) : document.createTextNode(t)); };
    while (i < x.length && j < y.length) {
      if (x[i] === y[j]) { push('', x[i]); i++; j++; }
      else if (dp[i + 1][j] >= dp[i][j + 1]) { push('cl-del', x[i]); i++; } else { push('cl-ins', y[j]); j++; }
    }
    while (i < x.length) push('cl-del', x[i++]);
    while (j < y.length) push('cl-ins', y[j++]);
    return out;
  }
  function proofreadBox(formEl) {
    const msg = h('div'); const out = h('div'); const live = tracker();
    const btn = h('button', { type: 'button', text: 'Check spelling and grammar (AI)' });
    const hs = {
      done: (row) => {
        btn.disabled = false;
        const d = row.draft || {}; const fixes = d.fixes || [];
        const accept = [];
        const items = fixes.map((f) => {
          const state = h('span', { class: 'muted small' });
          const a = h('button', { type: 'button', class: 'primary', text: 'Accept' }); const r = h('button', { type: 'button', text: 'Reject' });
          const doAccept = () => {
            const el = formEl.elements[f.field];
            if (!el || el.readOnly) { state.textContent = 'That box is not editable now.'; return false; }
            if (el.value.trim() !== f.original.trim()) { state.textContent = 'You changed this box since the check, so the fix was skipped.'; a.disabled = r.disabled = true; return false; }
            if (guarded(f.original) !== guarded(f.suggested)) { state.textContent = 'Refused: this fix touches a quote, a link or a number.'; a.disabled = r.disabled = true; return false; }
            el.value = f.suggested; state.textContent = 'Accepted.'; a.disabled = r.disabled = true; return true;
          };
          accept.push(() => (a.disabled ? null : doAccept()));
          a.addEventListener('click', doAccept); r.addEventListener('click', () => { state.textContent = 'Rejected. Nothing changed.'; a.disabled = r.disabled = true; });
          return h('li', {}, h('strong', { text: FIELD_LABEL[f.field] || f.field }), h('p', { class: 'cl-diff post' }, wordDiff(f.original, f.suggested)),
            h('div', { class: 'btns' }, a, r, state));
        });
        out.replaceChildren(h('div', { class: 'panel cl-draft' },
          h('div', { class: 'row' }, h('span', { class: 'tag warn', text: 'AI suggestions, unchecked' }), h('span', { class: 'muted small', text: row.model ? `made on our own computer with ${row.model}` : '' })),
          fixes.length ? h('div', {}, h('p', { class: 'muted small', text: 'Struck-out words are replaced by the underlined ones. Quotes, links, numbers and names are never changed. You decide each fix.' }),
            h('ul', { class: 'list' }, items),
            fixes.length > 1 ? h('div', { class: 'btns' }, h('button', { type: 'button', text: 'Accept all', onclick: () => accept.forEach((fn) => fn()) })) : null)
            : h('p', { text: 'No spelling or grammar fixes to suggest.' }),
          (d.notes || []).length ? h('ul', { class: 'small list' }, d.notes.map((n) => h('li', { text: n }))) : null));
      },
      failed: (m) => { btn.disabled = false; out.replaceChildren(notice(m)); },
      cancelled: () => { btn.disabled = false; out.replaceChildren(h('p', { class: 'muted small', text: 'Cancelled. Nothing was changed.' })); },
    };
    btn.addEventListener('click', action(async () => {
      out.replaceChildren();
      const fields = {};
      for (const name of PROOF) { const el = formEl.elements[name]; if (el && el.value.trim() && el.value.trim() !== NONE_TEXT) fields[name] = el.value; }
      const id = await q(sb.rpc('request_proofread', { p_fields: fields }));
      btn.disabled = true; live.watch(id, hs);
    }, msg));
    const node = h('div', { class: 'panel cl-proof' }, h('h3', { text: 'Spelling and grammar' }),
      h('p', { class: 'muted small', text: 'Our AI suggests fixes for typos, punctuation and grammar in the boxes above. It only suggests: you accept or reject each one. It does not change facts, names, numbers or quotes, and never touches the verdict.' }),
      msg, h('div', { class: 'btns' }, btn), live.node, out);
    return { node };
  }

  // ---------------------------------------------------------------- 5. what a reviewer sees on a version
  async function versionNote(versionId) {
    const n = await q(sb.rpc('version_ai_note', { p_version: versionId })).catch(() => null);
    if (!n) return null;
    return h('p', { class: 'small' }, h('span', { class: 'tag warn', text: 'Started from an AI draft' }), ' ',
      n.claim_changed ? 'The author changed the claim wording.' : 'The author kept the claim wording as drafted; check it carefully.');
  }

  return { startPicker, itemLinks, projectsView, draftBox, draftUsed, proofreadBox, noneBoxes, versionNote, RELATIONS };
}

window.TheWayClaim = { make };
})();
