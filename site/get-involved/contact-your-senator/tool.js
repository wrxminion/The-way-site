// Get Involved > Contact Your Senator (/get-involved/contact-your-senator/), a public page.
// Phone and official contact page for all 100 senators, and a letter and call script writer for listed Senate votes:
// pick an issue, a senator, for or against, the facts to use, your own reasons, and one of 11 voices.
// The page loads senators.js, issues.js and letters.js first, then this file, then page.js.
// Nothing typed here is saved or sent anywhere. Text from the data goes on the page with textContent only.
// Plain JavaScript, no build step. page.js hands over its helpers: TheWaySenatorLetters.make({ h, render, notice }).
(() => {
'use strict';

const MEMBER = '/government/congress/members/';
const VOTES_PAGE = '/government/congress/votes.html';

function make(ctx) {
  const { h, render, notice } = ctx;
  // One tool, two pages: the Senate page (senators.js) and the House page (representatives.js, ctx.chamber 'house').
  // Each issue in issues.js says its chamber ('senate' when not set); each page shows only its own issues.
  const HOUSE = ctx.chamber === 'house';
  const W = HOUSE
    ? { title: 'Representative', one: 'representative', pick: 'Pick your representative', any: 'Or any House member', choose: 'Choose a House member', since: 'in the House since', form: 'Website' }
    : { title: 'Senator', one: 'senator', pick: 'Pick your senator', any: 'Or any senator', choose: 'Choose a senator', since: 'in the Senate since', form: 'Contact form' };

  // issueId: the issue to open. also: other issues to add to the same letter, as "id:for,id:against" (from ?also=).
  function view(issueId, also) {
    const D = HOUSE ? window.HOUSE_CONTACTS : window.SENATE_CONTACTS, L = window.CSLetters;
    const ISSUES = (window.CS_ISSUES || []).filter((i) => i.chamber === 'both' || (i.chamber || 'senate') === (HOUSE ? 'house' : 'senate')); // 'both': both pages (D310)
    if (!D || !L || !window.CSOwn || !ISSUES || !window.CSFit) { render(notice('The letter tool did not load. The page may be out of date; please reload it.')); return; }
    // From a shared link: ?side=for|against, and #letter=... (a friend's letter, in the part of the link that is never sent to any server).
    let side = '', shared = null;
    try { side = new URLSearchParams(location.search).get('side') || ''; } catch { side = ''; }
    try { const m = /(?:^#|&)letter=([^&]+)/.exec(location.hash); if (m) shared = JSON.parse(unb64(m[1])); } catch { shared = null; }
    if (shared && (typeof shared.t !== 'string' || shared.t.length > 12000)) shared = null;
    // Your own words first (the default), then the listed votes for this chamber (D286, Frank Nov 16 2026).
    const OWN = [
      { id: 'own', own: true, menu: 'Your own issue: type it in your own words' },
      { id: 'angry', own: true, angry: true, menu: 'Pissed off about something: say it your way, swearing and all' }];
    tool(D, L, OWN.concat(ISSUES), issueId || (shared && shared.i) || 'own', window.CS_ISSUES || [], also || '', { side, shared });
  }
  // A letter in a link: UTF-8 text as URL-safe base64.
  function b64(str) { return btoa(unescape(encodeURIComponent(str))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
  function unb64(str) { return decodeURIComponent(escape(atob(str.replace(/-/g, '+').replace(/_/g, '/')))); }

  function tool(D, L, ISSUES, startId, ALL, startAlso, start) {
    const FIT = window.CSFit;
    start = start || {};
    let sharedLetter = start.shared || null;
    const MEMBERS = D.members || D.senators;
    const titleOf = (s) => s.title || W.title;
    const byId = {}, byIssue = {};
    MEMBERS.forEach((s) => { byId[s.id] = s; });
    ISSUES.forEach((i) => { byIssue[i.id] = i; });
    // Other issues the reader adds to the same letter or call (any chamber, any side): id -> 'for' or 'against', and the facts they checked.
    const byAll = {}, alsoPick = {}, alsoFacts = {}, alsoItems = {};
    ALL.forEach((i) => { byAll[i.id] = i; });
    String(startAlso).split(',').forEach((x) => { const [id, st] = x.split(':'); if (byAll[id] && (st === 'for' || st === 'against')) alsoPick[id] = st; });
    let issue = byIssue[startId] || ISSUES[0], chosen = null, lastVoice = '';
    // The AI rewrite: off until The Way's own AI computer is connected (data-ai="on" on the page). Text goes out only on a button press.
    const AI_ON = ctx.ai === true;
    let aiText = '', aiFor = '';
    // 'letter' or 'call': what the reader asked for, from the Write or Call script button.
    let mode = 'letter';
    const partyWord = (p) => (p === 'D' ? 'Democrat' : p === 'R' ? 'Republican' : 'Independent');
    const tel = (p) => 'tel:+1' + p.replace(/-/g, '');
    const castWord = (c) => (c === 'Yea' ? 'Voted yes' : c === 'Nay' ? 'Voted no' : c === 'Present' ? 'Voted present' : 'Did not vote');
    const ext = (text, href, cls) => h('a', { class: cls || null, href, target: '_blank', rel: 'noopener', text });
    const num = (n) => h('span', { class: 'cs-num', text: String(n) });
    // Text from issues.js may hold links written as [words](https://...) or [words](/our/page). They become real links; the rest stays text.
    const rich = (str) => {
      const out = [], re = /\[([^\]]+)\]\(((?:https:\/\/|\/)[^)\s]+)\)/g;
      let last = 0, m;
      while ((m = re.exec(str))) { out.push(str.slice(last, m.index)); out.push(ext(m[1], m[2])); last = re.lastIndex; }
      out.push(str.slice(last));
      return out.filter((x) => x !== '');
    };
    const own = (text, href, cls) => h('a', { class: cls || null, href, target: '_blank', rel: 'noopener', text });
    const pageOf = (s) => (s && s.page ? MEMBER + s.page + '.html' : '');
    const nameLink = (s, cls) => (s.page ? own(s.name, pageOf(s), cls) : s.name);
    const srcLinks = (cites) => (cites || []).flatMap((x, i) => [i ? '; ' : '', ext(`${x.src}, ${x.date}`, x.url)]);

    // Controls
    const issueSel = h('select', { id: 'cs-issue' });
    // An issue fits a member when they vote on it (their chamber, their party's own vote) and were in office for it (D298).
    const votable = (i) => (i.own && !i.kind) || !chosen || (FIT.shows(i, chosen) && (i.own || L.canVote(i, chosen)));
    // Local, State and National (Frank Nov 27 2026). "All" shows everything that fits.
    let scopeF = 'all';
    const stateNow = () => (chosen ? chosen.st : stateSel ? stateSel.value : '');
    const tagsOf = (i) => (i.own && !i.kind ? [] : FIT.tags(i, chosen, stateNow()));
    const inScope = (i) => (i.own && !i.kind) || scopeF === 'all' || FIT.scope(i, chosen, stateNow()).indexOf(scopeF) >= 0;
    // What the menu and the search offer now: fits the member, not past its date, in the filter.
    const offered = () => ISSUES.filter((i) => votable(i) && !FIT.expired(i) && inScope(i));
    const GROUPS = [
      ['own', 'Say it your way'],
      ['soon', 'Coming up'],
      ['issue', 'Issues we researched, both sides'],
      ['recent', 'Set for a vote, no recorded vote found yet'],
      ['vote', 'Previous votes: thank them or say you disagree']];
    const groupOf = (i) => (i.own && !i.kind ? 'own' : i.kind === 'vote' ? 'vote' : i.recent ? 'recent' : i.kind === 'bill' || i.kind === 'date' ? 'soon' : 'issue');
    const tagLine = (i) => tagsOf(i).filter((t) => t.k !== 'soon').map((t) => t.text).join(' · ');
    function fillMenu() {
      const list = offered();
      if (issue && !list.includes(issue)) list.push(issue);   // a link can open an issue that is past its date or out of the filter
      const opts = GROUPS.map(([g, label]) => {
        const items = list.filter((i) => groupOf(i) === g);
        if (g === 'soon' || g === 'issue') items.sort((a, b) => FIT.score(tagsOf(b)) - FIT.score(tagsOf(a)));
        return items.length ? h('optgroup', { label }, items.map((i) => {
          const tl = tagLine(i);
          return h('option', { value: i.id, text: i.menu + (tl ? ' · ' + tl : '') + (FIT.expired(i) ? ' (vote date passed)' : '') });
        })) : null;
      }).filter(Boolean);
      issueSel.replaceChildren(...opts);
      issueSel.value = issue ? issue.id : 'own';
      menuCount.textContent = `${list.filter((i) => !(i.own && !i.kind)).length} issues and votes${chosen ? ` fit ${titleOf(chosen)} ${chosen.last}` : ''}${scopeF !== 'all' ? ` (${scopeWord[scopeF]})` : ''}.`;
    }
    const markIssues = () => fillMenu();
    const scopeWord = { all: 'all', national: 'national', state: 'state', local: 'local' };
    const menuCount = h('p', { class: 'cs-small cs-count', role: 'status' });
    const stateSel = h('select', { id: 'cs-state' }, h('option', { value: '', text: 'Choose a state' }),
      Object.keys(D.states).sort((a, b) => D.states[a].localeCompare(D.states[b])).map((k) => h('option', { value: k, text: D.states[k] })));
    const senSel = h('select', { id: 'cs-senator' }, h('option', { value: '', text: W.choose }),
      MEMBERS.slice().sort((a, b) => a.last.localeCompare(b.last)).map((s) => h('option', { value: s.id, text: `${s.name} (${s.party}-${s.st}${HOUSE && s.title === 'Representative' ? '-' + (s.district || 'AL') : ''})` })));
    const panel = h('div', { class: 'cs-issue', 'aria-live': 'polite' });
    const cards = h('div', { class: 'cs-cards', 'aria-live': 'polite' });
    const question = h('span', { text: '' });
    const labFor = h('span', { text: 'For' }), labAgainst = h('span', { text: 'Against' });
    const rFor = h('input', { type: 'radio', name: 'cs-stance', value: 'for' });
    const rAgainst = h('input', { type: 'radio', name: 'cs-stance', value: 'against' });
    const reasons = h('textarea', { rows: '5', maxlength: '1500', placeholder: 'Example: This matters to my family because...' });
    const nameIn = h('input', { type: 'text', maxlength: '80', autocomplete: 'off' });
    const townIn = h('input', { type: 'text', maxlength: '80', autocomplete: 'off' });
    const whoSel = h('select', null, [['', 'Just me'], ['veteran', 'Veteran'], ['parent', 'Parent'], ['business', 'Small business owner'], ['retiree', 'Retired'],
      ['student', 'Student'], ['teacher', 'Teacher'], ['health', 'Nurse or health worker'], ['farmer', 'Farmer or rancher'], ['union', 'Union member'],
      ['worker', 'Working person'], ['firstvote', 'New voter']].map(([v, t]) => h('option', { value: v, text: t })));
    const voiceSel = h('select', null, h('option', { value: '', text: 'Surprise me' }), L.voices.map((v) => h('option', { value: v.key, text: v.label })));
    const subject = h('input', { type: 'text' });
    const letter = h('textarea', { class: 'cs-letter', rows: '18' });
    const voiceLine = h('p', { class: 'cs-voice-line' });
    const status = h('p', { class: 'cs-status', role: 'status' });
    const tip = h('p', { class: 'cs-tip' });
    // Call script output: tap-to-call, points to say if someone answers, and a voicemail to read.
    const callTo = h('p', { class: 'cs-voice-line' });
    const callPhone = h('a', { class: 'cs-btn cs-main cs-phone', href: '#', text: 'Call' });
    const callPoints = h('ul', { class: 'cs-points' });
    const voicemail = h('textarea', { class: 'cs-letter cs-vm', rows: '11' });
    const callStatus = h('p', { class: 'cs-status', role: 'status' });
    const callTip = h('p', { class: 'cs-tip' });
    const openForm = h('a', { class: 'cs-btn', href: '#', target: '_blank', rel: 'noopener', text: 'Open their form' });
    const callBtn = h('a', { class: 'cs-btn', href: '#', text: 'Call' });
    const field = (label, input, wide) => h('label', { class: 'cs-field' + (wide ? ' cs-wide' : '') }, h('span', { text: label }), input);
    const picks = h('div', { class: 'cs-picks', hidden: true });
    const ownTopic = h('input', { type: 'text', maxlength: '120', autocomplete: 'off', placeholder: 'Example: Social Security cuts' });
    const ownNotes = h('textarea', { rows: '8', maxlength: '3000', placeholder: 'Type a list, one thing per line, or just write it out. Spelling does not matter.' });
    const ownAsk = h('input', { type: 'text', maxlength: '200', autocomplete: 'off', placeholder: 'Example: Vote no on any cuts' });
    const ownHelp = h('p', { class: 'cs-small' });
    const aiBtn = AI_ON ? h('button', { type: 'button', class: 'cs-btn', text: "Rewrite it with The Way's AI", onclick: () => aiRewrite() }) : null;
    const aiNote = h('p', { class: 'cs-small', role: 'status' });
    const ownBox = h('div', { class: 'cs-own', hidden: true },
      ownHelp,
      field('What is it about? (optional)', ownTopic, true),
      field('Your concerns, your way (a list or rough notes is fine)', ownNotes, true),
      field('What do you want them to do? (optional)', ownAsk, true),
      aiBtn ? h('p', { class: 'cs-actions' }, aiBtn) : null, aiNote);
    const changes = h('details', { class: 'cs-sources cs-changes', hidden: true });
    const callChanges = h('details', { class: 'cs-sources cs-changes', hidden: true });
    [ownTopic, ownNotes, ownAsk].forEach((el) => el.addEventListener('change', () => { if (shown()) write(); }));
    const alsoBox = h('div', { class: 'cs-picks cs-also', hidden: true });
    const pickWords = h('span', { text: 'Pick what goes in your letter' });
    const pickHead = h('h3', { hidden: true }, num(4), pickWords);
    const shown = () => !out.hidden || !callOut.hidden;
    const hideOut = () => { out.hidden = true; callOut.hidden = true; };
    function setMode(m) {
      mode = m;
      pickWords.textContent = m === 'call' ? 'Pick what to say on your call' : 'Pick what goes in your letter';
      writeBtn.className = 'cs-btn' + (m === 'letter' ? ' cs-main' : '');
      callMake.className = 'cs-btn' + (m === 'call' ? ' cs-main' : '');
    }
    const go = (m) => {
      if (m && issue.own && !ownNotes.value.trim() && !ownTopic.value.trim()) { ownNotes.focus(); aiNote.textContent = 'Type your concerns first.'; return; } setMode(m); write(); const o = m === 'call' ? callOut : out; if (!o.hidden) o.scrollIntoView({ behavior: 'smooth', block: 'start' }); };
    const writeBtn = h('button', { type: 'button', class: 'cs-btn cs-main', text: 'Write my letter', onclick: () => go('letter') });
    const callMake = h('button', { type: 'button', class: 'cs-btn', text: 'Make my call script', onclick: () => go('call') });
    let factBoxes = [], viewBoxes = [], recordBox = null;
    const stance = () => (rFor.checked ? 'for' : rAgainst.checked ? 'against' : '');

    const stanceWrap = h('div', { class: 'cs-choice', role: 'radiogroup', 'aria-label': 'Your answer' },
      h('label', { class: 'cs-pill' }, rFor, labFor), h('label', { class: 'cs-pill' }, rAgainst, labAgainst));
    const reasonsWrap = h('div', null,
      h('h3', null, num(5), 'Your own reasons ', h('span', { class: 'cs-opt', text: '(optional, but it helps)' })),
      field('Type your reasons in your own words. The letter will include them as you wrote them.', reasons, true));
    const voiceWrap = field('Voice', voiceSel);
    const privacy = h('p', { class: 'cs-privacy', text: 'What you type stays in your browser. This page does not save it or send it anywhere.' });
    const step2 = h('div', { class: 'cs-step', hidden: true },
      h('h3', null, num(3), question),
      stanceWrap, ownBox,
      pickHead, picks, alsoBox,
      reasonsWrap,
      h('div', { class: 'cs-row' }, field('Your name (optional)', nameIn), field('Your town (optional)', townIn)),
      h('div', { class: 'cs-row' }, field('About you (optional)', whoSel), voiceWrap),
      privacy,
      h('p', { class: 'cs-actions' }, writeBtn, callMake));

    const out = h('div', { class: 'cs-step', hidden: true, 'aria-live': 'polite' },
      h('h3', null, num(6), 'Your letter'), voiceLine, changes,
      field('Subject', subject, true),
      field('Letter (you can edit it here before you copy it)', letter, true),
      h('div', { class: 'cs-actions' },
        h('button', { type: 'button', class: 'cs-btn cs-main', text: 'Copy letter', onclick: () => copy(letter.value, 'Letter copied. Now open their form and paste it into the message box.') }),
        h('button', { type: 'button', class: 'cs-btn', text: 'Copy subject', onclick: () => copy(subject.value, 'Subject copied.') }),
        h('button', { type: 'button', class: 'cs-btn', text: 'Make another', onclick: () => write() }),
        openForm, callBtn),
      status,
      h('p', null, h('button', { type: 'button', class: 'cs-btn', text: 'Calling instead? Make a call script', onclick: () => go('call') })),
      tip);

    const callOut = h('div', { class: 'cs-step', hidden: true, 'aria-live': 'polite' },
      h('h3', null, num(6), 'Your call script'), callTo, callChanges,
      h('p', null, callPhone),
      h('h4', { class: 'cs-call-h', text: 'If someone answers, say these points' }),
      h('p', { class: 'cs-small', text: 'A staff member will take your message. Each fact shows its source in case they ask.' }),
      callPoints,
      h('h4', { class: 'cs-call-h', text: 'If you get voicemail, read this' }),
      field('Voicemail script (you can edit it here)', voicemail, true),
      h('div', { class: 'cs-actions' },
        h('button', { type: 'button', class: 'cs-btn cs-main', text: 'Copy call script', onclick: () => copy(callText(), 'Call script copied.', callStatus) }),
        h('button', { type: 'button', class: 'cs-btn', text: 'Copy voicemail', onclick: () => copy(voicemail.value, 'Voicemail script copied.', callStatus) }),
        h('button', { type: 'button', class: 'cs-btn', text: 'Write a letter instead', onclick: () => go('letter') })),
      callStatus, callTip);
    const callText = () => `If someone answers:\n${[...callPoints.children].map((li) => '- ' + li.textContent).join('\n')}\n\nIf you get voicemail:\n${voicemail.value}\n`;

    // Search with a list that drops down as you type. Words that mean the same thing count (ice finds immigration).
    const findIn = h('input', { type: 'search', id: 'cs-find', autocomplete: 'off', spellcheck: 'false', role: 'combobox', 'aria-expanded': 'false', 'aria-controls': 'cs-find-list', 'aria-autocomplete': 'list', placeholder: 'Type a topic, like ice, veterans, judges or H.R. 4464' });
    const findList = h('ul', { id: 'cs-find-list', class: 'cs-find-list', role: 'listbox', 'aria-label': 'Matching issues and votes', hidden: true });
    const findNote = h('p', { class: 'cs-small cs-find-note', role: 'status' });
    let findHits = [], findAt = -1;
    function closeFind() { findList.hidden = true; findIn.setAttribute('aria-expanded', 'false'); findAt = -1; findIn.removeAttribute('aria-activedescendant'); }
    function pickHit(i) {
      closeFind();
      if (!i) return;
      if (i === 'own') { const q = findIn.value.trim(); setIssue('own'); if (q && !ownTopic.value) ownTopic.value = q; findIn.value = ''; findNote.textContent = ''; return; }
      setIssue(i.id); findIn.value = ''; findNote.textContent = '';
      issueSel.focus();
    }
    function runFind() {
      const q = findIn.value.trim();
      if (q.length < 2) { closeFind(); findNote.textContent = ''; return; }
      const r = FIT.search(q, offered().filter((i) => !(i.own && !i.kind)));
      // Their own vote on it comes first, then the rest by how well it matches.
      findHits = r.items.slice(0, 8);
      const rows = findHits.map((i, n) => {
        const t = tagsOf(i);
        return h('li', { id: 'cs-hit-' + n, role: 'option', class: 'cs-hit', 'aria-selected': 'false', onmousedown: (e) => { e.preventDefault(); pickHit(i); } },
          h('span', { class: 'cs-hit-t', text: i.menu }),
          t.length ? h('span', { class: 'cs-tags' }, t.map((x) => h('span', { class: 'cs-tag cs-tag-' + x.k, text: x.text }))) : null);
      });
      rows.push(h('li', { id: 'cs-hit-own', role: 'option', class: 'cs-hit cs-hit-own', 'aria-selected': 'false', onmousedown: (e) => { e.preventDefault(); pickHit('own'); } },
        h('span', { class: 'cs-hit-t', text: `Write about "${q}" in your own words` })));
      findHits.push('own');
      findList.replaceChildren(...rows);
      findList.hidden = false; findIn.setAttribute('aria-expanded', 'true'); findAt = -1;
      findNote.replaceChildren(
        r.items.length ? `${r.items.length} ${r.items.length === 1 ? 'match' : 'matches'}` : 'Nothing in this list matches yet',
        r.groups.length ? `, counting words like it (${r.groups.map((g) => g.name).join(', ')})` : '',
        '. ', own(`Search all of The Way for "${q}"`, '/search/?q=' + encodeURIComponent(q)), ' for case studies and more.');
    }
    findIn.addEventListener('input', runFind);
    findIn.addEventListener('focus', () => { if (findIn.value.trim().length >= 2) runFind(); });
    findIn.addEventListener('blur', () => setTimeout(closeFind, 150));
    findIn.addEventListener('keydown', (e) => {
      if (findList.hidden) { if (e.key === 'ArrowDown') runFind(); return; }
      const rows = [...findList.children];
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        findAt = (findAt + (e.key === 'ArrowDown' ? 1 : -1) + rows.length) % rows.length;
        rows.forEach((r, n) => r.setAttribute('aria-selected', n === findAt ? 'true' : 'false'));
        findIn.setAttribute('aria-activedescendant', rows[findAt].id);
        rows[findAt].scrollIntoView({ block: 'nearest' });
      } else if (e.key === 'Enter') {
        if (findAt >= 0) { e.preventDefault(); pickHit(findHits[findAt]); } else if (findHits.length > 1) { e.preventDefault(); pickHit(findHits[0]); }
      } else if (e.key === 'Escape') closeFind();
    });
    // Filter buttons
    const scopeBtns = [['all', 'All'], ['national', 'National'], ['state', 'State'], ['local', 'Local']].map(([k, t]) =>
      h('button', { type: 'button', class: 'cs-filter' + (k === scopeF ? ' cs-on' : ''), 'aria-pressed': k === scopeF ? 'true' : 'false', text: t, onclick: () => setScope(k) }));
    const scopeBox = h('div', { class: 'cs-scope', 'aria-live': 'polite' });
    function setScope(k) {
      scopeF = k;
      scopeBtns.forEach((b, n) => { const on = ['all', 'national', 'state', 'local'][n] === k; b.className = 'cs-filter' + (on ? ' cs-on' : ''); b.setAttribute('aria-pressed', on ? 'true' : 'false'); });
      fillMenu(); showScope();
      if (findIn.value.trim().length >= 2) runFind();
    }
    // State and Local: what Congress does not decide, and where to take part.
    let localData = {}, localPick = '';
    function showScope() {
      const st = stateNow(), S = st ? FIT.states[st] : null;
      if (scopeF === 'national') { scopeBox.replaceChildren(h('p', { class: 'cs-small', text: 'National: bills, votes and nominations for the whole country.' })); return; }
      if (scopeF === 'all') { scopeBox.replaceChildren(); return; }
      if (!S) { scopeBox.replaceChildren(h('p', { class: 'cs-small', text: `Pick your state or your ${W.one} in step 1 to see ${scopeF} issues.` })); return; }
      if (scopeF === 'state') {
        const leg = S.leg || {};
        scopeBox.replaceChildren(h('div', { class: 'cs-box' },
          h('h4', { text: `State: ${S.name}` }),
          h('p', { class: 'cs-small', text: `Listed above: votes and bills that name ${S.name} or its people. State laws are made by your state lawmakers, not Congress.` }),
          h('p', { class: 'cs-links' },
            leg.home ? ext(`${S.name} legislature ↗`, leg.home, 'cs-btn') : null,
            leg.bills ? ext('Bills in the legislature ↗', leg.bills, 'cs-btn') : null,
            S.page ? own(`${S.name} on The Way`, S.page, 'cs-btn') : null),
          (S.elections || []).filter((e) => !e.date || e.date >= FIT.today).length
            ? h('ul', null, S.elections.filter((e) => !e.date || e.date >= FIT.today).map((e) => h('li', null, `${e.date ? FIT.dateLabel(e.date) + ': ' : ''}${e.what} `, e.src ? ext('(official page)', e.src, 'cs-cite') : null)))
            : h('p', { class: 'cs-small', text: S.elections_note || (leg.home ? 'No upcoming state elections listed on the official pages we checked.' : `We have not read ${S.name}'s official state pages yet. The state page on The Way has what we have.`) })));
        return;
      }
      // Local: counties (for a House member, the counties in their district), with their official links and election dates.
      const head = [h('h4', { text: `Local: ${S.name}` }),
        h('p', { class: 'cs-small', text: 'Local issues are decided by your county, city, town and school board, not Congress. They meet in public, and most let you speak. Your member of Congress can still help with a problem with a federal agency, so you can write to them about that in your own words.' }),
        h('p', { class: 'cs-actions' }, h('button', { type: 'button', class: 'cs-btn', text: 'Write about a local problem in your own words', onclick: () => { setIssue('own'); ownTopic.focus(); } }))];
      if (!S.localData) {
        scopeBox.replaceChildren(h('div', { class: 'cs-box' }, head, h('p', { class: 'cs-small' }, `We have not collected county and city pages for ${S.name} yet. `,
          S.local ? ext('County election offices (official state page) ↗', S.local) : null, S.local && S.page ? ' · ' : '', S.page ? own(`${S.name} on The Way`, S.page) : null)));
        return;
      }
      const box2 = h('div', { class: 'cs-box' }, head, h('p', { class: 'cs-small', text: 'Loading county pages…' }));
      scopeBox.replaceChildren(box2);
      const draw = (J) => {
        const dist = chosen && chosen.title && J.districts ? J.districts['us_house:' + (chosen.district || 0)] : null;
        const fips = Object.keys(J.counties || {}).filter((f) => !dist || dist.includes(f)).sort((a, b) => J.counties[a].name.localeCompare(J.counties[b].name));
        if (!fips.includes(localPick)) localPick = '';
        const sel = h('select', { id: 'cs-county' }, h('option', { value: '', text: 'Choose a county' }), fips.map((f) => h('option', { value: f, text: J.counties[f].name })));
        sel.value = localPick;
        const list = h('div');
        const KIND = { government: 'County government', election_office: 'Election office', clerk: 'County clerk', library: 'Library', meeting: 'Public meetings' };
        const show = () => {
          localPick = sel.value;
          const cty = J.counties[sel.value];
          if (!cty) { list.replaceChildren(); return; }
          const els = (cty.elections || []).filter((e) => !e.d || e.d >= FIT.today);
          list.replaceChildren(
            h('ul', null, (cty.links || []).map((l) => h('li', null, ext(`${KIND[l.k] || l.k}: ${l.t}`, l.u), h('span', { class: 'cs-cite', text: ` (checked ${l.c})` })))),
            ...(els.length ? [h('p', { class: 'cs-small' }, 'Coming up: ', els.map((e, n) => [n ? '; ' : '', ext(`${e.n || 'Election'}, ${FIT.dateLabel(e.d)}`, e.u)]))] : []));
        };
        sel.addEventListener('change', show);
        box2.replaceChildren(head[0], head[1],
          h('p', { class: 'cs-small', text: dist ? `${fips.length} counties are in ${chosen.seat || 'this district'}, by the official district maps.` : `${fips.length} counties with official pages so far.` }),
          field('Your county', sel), list, ...(J.note ? [h('p', { class: 'cs-small', text: J.note })] : []), head[2]);
        show();
      };
      if (localData[st]) draw(localData[st]);
      else fetch(S.localData).then((r) => (r.ok ? r.json() : Promise.reject(new Error('no')))).then((J) => { localData[st] = J; if (scopeF === 'local' && stateNow() === st) draw(J); })
        .catch(() => { box2.replaceChildren(head[0], head[1], h('p', { class: 'cs-small' }, 'The county list did not load. ', S.page ? own(`${S.name} on The Way`, S.page) : null), head[2]); });
    }
    const sharedNote = h('p', { class: 'cs-shared-note', hidden: !sharedLetter, text: `A friend shared a letter with you. Pick your ${W.one} in step 1, and the letter will be ready for them in step 6. Read it over and change anything you like.` });
    const issueStep = h('div', { class: 'cs-step' }, h('h3', null, num(2), 'Pick an issue, or say it in your own words'),
      sharedNote,
      h('div', { class: 'cs-find' }, field('Search issues and votes', findIn, true), findList), findNote,
      h('div', { class: 'cs-filters', role: 'group', 'aria-label': 'Show issues' }, scopeBtns),
      scopeBox,
      field('Or pick from the list', issueSel, true), menuCount, panel);

    // Issue panel
    const factLi = (f) => h('li', null, f.text + ' ', h('span', { class: 'cs-cite' }, '(', srcLinks(f.cite), ')'));
    // A tracked vote as one short line: "YES: <bill> · <date> · Democratic caucus: 22 yes, 24 no", for the senator the issue
    // centers on. The vote, the split and our page for it come from senators.js (build_votes.py, from the senate.gov roll calls).
    const CAST_WORD = { Y: 'YES', N: 'NO', X: 'DID NOT VOTE', P: 'PRESENT' };
    const tracked = {};
    (D.tracked || []).forEach((v, i) => { tracked[v.id] = Object.assign({ i }, v); });
    function voteLine(f, iss) {
      const on = iss || issue, v = f.vote && tracked[f.vote], s = on.subject && byId[on.subject];
      const word = v && s && s.tv ? CAST_WORD[s.tv[v.i]] : null;
      if (!word) return null;
      return { v, parts: [h('strong', { class: 'cs-cast', text: word }), `: ${v.short} · ${v.date} · ${s.dem ? v.dem : v.rep}`] };
    }
    const voteLi = (f) => {
      const l = voteLine(f);
      return l ? h('li', { class: 'cs-vline' }, h('a', { href: l.v.ours, target: '_blank', rel: 'noopener' }, l.parts)) : factLi(f);
    };
    function factList(title, facts) {
      return h('div', { class: 'cs-side' }, h('h4', { text: `${title} (${facts.length})` }), h('ul', null, facts.map(factLi)));
    }
    // A short, sourced box about the person an issue centers on, with links to their page and the Money web.
    function aboutBox(a) {
      if (!a) return null;
      const s = byId[a.id];
      return h('div', { class: 'cs-about' },
        h('h4', { text: a.title }),
        h('ul', null, a.facts.map(factLi)),
        s ? h('p', { class: 'cs-links' },
          s.page ? own(`${s.name} on The Way`, pageOf(s), 'cs-btn') : null,
          s.web ? own(`${s.webName || 'Campaign committee'} on the Money web`, s.web, 'cs-btn') : null) : null);
    }
    // Tracked votes show newest first, like the senator pages.
    const byDate = (list) => list.slice().sort((x, y) => ((x.vote && tracked[x.vote] ? tracked[x.vote].i : 99) - (y.vote && tracked[y.vote] ? tracked[y.vote].i : 99)));
    function showIssue() {
      if (issue.own && issue.kind === 'date') {
        panel.replaceChildren(
          h('h4', { class: 'cs-issue-title', text: `Coming up, ${issue.menu.replace(/^Coming up, /, '').split(':')[0]}` }),
          h('p', null, issue.note, ' ', (issue.noteSrc || []).map(([t, u], n) => [n ? '; ' : '(', ext(t, u), n === issue.noteSrc.length - 1 ? ')' : ''])),
          ...(issue.noteMore ? [h('p', { class: 'cs-small', text: issue.noteMore })] : []),
          h('p', { class: 'cs-small', text: 'There are no sides to pick on a date. Say what you want them to do in your own words below.' }));
        question.textContent = 'What do you want them to do?';
        return;
      }
      if (issue.own) {
        panel.replaceChildren(
          h('h4', { class: 'cs-issue-title', text: issue.angry ? 'Pissed off about something? Say it your way.' : 'Your own issue, in your own words' }),
          h('p', { text: issue.angry
            ? 'Type it the way you would say it, swearing and all. The letter and call script keep your anger clear, but take out the swearing and name calling, so the office takes it seriously.'
            : 'Type your concerns as a list or rough notes. Spelling does not matter. The letter and call script turn them into clear sentences you can read over and change.' }),
          h('p', { class: 'cs-small', text: 'Spelling is fixed with a word list in your browser. Names and places with a capital letter are left alone, and every word that was changed is listed so you can check it.' }));
        question.textContent = issue.angry ? 'What has you angry?' : 'What do you want to tell them?';
        return;
      }
      const either = byDate(issue.facts.either || []);
      const tg = tagsOf(issue);
      const pastNotes = (issue.past || []).filter((x) => x.at < FIT.today).map((x) => h('p', { class: 'cs-past', text: x.text }));
      if (FIT.expired(issue)) pastNotes.unshift(h('p', { class: 'cs-past', text: `The last day for this vote was ${FIT.dateLabel(issue.until)}. It is no longer on the list, but you can still write about it.` }));
      const f = issue.follow;
      const later = f ? Object.values(FIT.votes).filter((v) => v.bill === f.bill && v.ch === f.ch && v.date > f.after).sort((a, b) => (a.date < b.date ? -1 : 1)) : [];
      const cast = chosen && issue.record && issue.record.type === 'fit' ? L.castFor(issue, chosen) : null;
      panel.replaceChildren(...[
        h('h4', { class: 'cs-issue-title', text: issue.title }),
        tg.length ? h('p', { class: 'cs-tags' }, tg.map((x) => h('span', { class: 'cs-tag cs-tag-' + x.k, text: x.text }))) : null,
        h('p', { class: 'cs-status-line' }, rich(issue.status)),
        pastNotes,
        cast ? h('p', { class: 'cs-record' }, `${titleOf(chosen)} ${chosen.last}: ${castWord(cast).toLowerCase()}. `, ext(`${issue.record.srcLabel} ↗`, issue.record.url)) : null,
        later.length ? h('div', { class: 'cs-side cs-either' }, h('h4', { text: f.label }),
          h('ul', null, later.map((v) => {
            const cs = chosen ? FIT.castOf(v, chosen.id) : null;
            return h('li', null, ext(`${FIT.dateLabel(v.date)}: ${v.q}, ${v.res.toLowerCase()} ${v.yes} to ${v.no}`, v.url), cs ? ` · ${titleOf(chosen)} ${chosen.last}: ${castWord(cs).toLowerCase()}` : '');
          }))) : null,
        issue.summary.map((p) => h('p', null, rich(p))),
        issue.searched ? h('p', { class: 'cs-searched', text: issue.searched }) : null,
        aboutBox(issue.about),
        issue.facts.for.length || issue.facts.against.length ? h('div', { class: 'cs-sides' },
          factList(issue.labels.for, issue.facts.for),
          factList(issue.labels.against, issue.facts.against)) : null,
        either.length ? h('div', { class: 'cs-side cs-either' }, h('h4', { text: `${issue.eitherLabel || 'Either side'} (${either.length})` }),
          h('p', { class: 'cs-small', text: issue.kind === 'issue' ? 'Either side can use these. They are the votes as cast, from the official record, with how their party voted. Each line opens our page for that vote, which says what it was and links to the official roll call.' : 'Either side can use these. They come from the official record.' }),
          h('ul', null, either.map(voteLi))) : null,
        h('details', { class: 'cs-sources' }, h('summary', { text: 'All sources for this issue' }),
          h('ul', null, issue.sources.map((x) => h('li', null, ext(`${x.src}, ${x.date}`, x.url)))))].flat().filter(Boolean));
      question.textContent = issue.question;
      labFor.textContent = issue.labels.for;
      labAgainst.textContent = issue.labels.against;
    }

    // Step 4: the reader picks the facts and reasons for the letter.
    function box(label, checked, extra) {
      const i = h('input', { type: 'checkbox' }); i.checked = !!checked;
      i.addEventListener('change', () => { if (shown()) write(); });
      return { input: i, el: h('label', { class: 'cs-check' }, i, h('span', null, label, extra || null)) };
    }
    function group(title, items, note) {
      const all = h('button', { type: 'button', class: 'cs-link', text: 'Check all', onclick: () => { items.forEach((b) => { b.input.checked = true; }); if (shown()) write(); } });
      const none = h('button', { type: 'button', class: 'cs-link', text: 'Clear', onclick: () => { items.forEach((b) => { b.input.checked = false; }); if (shown()) write(); } });
      return h('fieldset', { class: 'cs-group' }, h('legend', { text: title }),
        note ? h('p', { class: 'cs-small', text: note }) : null,
        h('p', { class: 'cs-group-tools' }, all, ' · ', none), items.map((b) => b.el));
    }
    function showPicks() {
      const st = stance();
      stanceWrap.hidden = reasonsWrap.hidden = !!issue.own;
      voiceWrap.hidden = !!issue.own;
      ownBox.hidden = !issue.own;
      pickHead.hidden = picks.hidden = issue.own || !st || !chosen;
      if (issue.own || !st || !chosen) return;
      const self = issue.subject && chosen.id === issue.subject;
      const on = new Set(L.defaultFacts(issue, st));
      const mk = (f) => Object.assign(box((self && f.you ? f.you : f.text) + ' ', on.has(f.id), h('span', { class: 'cs-cite' }, '(', srcLinks(f.cite), ')')), { id: f.id });
      // A vote shows as its short line, with a link to our page for it. The letter still uses the full sentence and its source.
      const mkVote = (f) => {
        const l = voteLine(f);
        return l ? Object.assign(box(l.parts, on.has(f.id), [' ', own('the vote ↗', l.v.ours, 'cs-cite')]), { id: f.id }) : mk(f);
      };
      const side = (issue.facts[st] || []).map(mk), either = byDate(issue.facts.either || []).map(mkVote);
      factBoxes = side.concat(either);
      viewBoxes = issue.views[st].map((v, i) => Object.assign(box(v, i === 0), { text: v }));
      const hasRecord = issue.record && !self && (issue.record.type === 'breaks' ? !!chosen.breaks : !!L.castFor(issue, chosen));
      recordBox = hasRecord ? box(`Mention how ${titleOf(chosen)} ${chosen.last} voted (from the official roll call, with the link)`, true) : null;
      picks.replaceChildren(...[
        h('p', { class: 'cs-small', text: 'Every checked fact goes into the letter with its source: the outlet, the date and the link, so the office can check it. Uncheck anything you do not want to use.' }),
        side.length ? group(`Facts for your side: ${issue.labels[st]}`, side) : null,
        either.length ? group(issue.eitherLabel || 'Either side', either, 'Votes as cast. Use any that fit your view.') : null,
        group('Reasons (your opinion, no source needed)', viewBoxes),
        recordBox ? group('Their own record', [recordBox]) : null].filter(Boolean));
    }
    // More issues in the same letter or call. Each other issue gets Leave out / one side / the other side; a picked side shows
    // its facts to check, like step 4. A member who does not vote on it gets where the reader stands, with no ask.
    function showAlso() {
      // Other issues that fit this member: listed issues (any chamber) and bills coming up in their chamber. Past votes and party
      // votes of another caucus are left out.
      const others = ALL.filter((x) => x.id !== issue.id && !x.own && !FIT.expired(x) && FIT.shows(x, chosen)
        && (x.kind === 'issue' || (x.kind === 'bill' && !x.recent && x.chamber === (HOUSE ? 'house' : 'senate'))));
      const st0 = issue.own ? 'own' : stance();
      // Keep what the reader checked when this redraws (a new member or side).
      Object.keys(alsoItems).forEach((id) => { alsoFacts[id] = alsoItems[id].filter((b) => b.input.checked).map((b) => b.id); delete alsoItems[id]; });
      alsoBox.hidden = !st0 || !chosen || !others.length;
      if (alsoBox.hidden) return;
      const rows = others.map((x) => {
        const facts = h('div');
        const draw = () => {
          const st = alsoPick[x.id];
          delete alsoItems[x.id];
          if (!st) { facts.replaceChildren(); return; }
          const self = x.subject && chosen.id === x.subject;
          const on = new Set(alsoFacts[x.id] || L.defaultFacts(x, st));
          const items = [];
          const mk = (f) => {
            const l = voteLine(f, x);
            const b = l ? box(l.parts, on.has(f.id), [' ', own('the vote ↗', l.v.ours, 'cs-cite')])
              : box((self && f.you ? f.you : f.text) + ' ', on.has(f.id), h('span', { class: 'cs-cite' }, '(', srcLinks(f.cite), ')'));
            return Object.assign(b, { id: f.id });
          };
          (x.facts[st] || []).concat(byDate(x.facts.either || [])).forEach((f) => items.push(mk(f)));
          alsoItems[x.id] = items;
          // Folded, so a long list of facts does not push the rest of the page down. The checked ones go in.
          const sum = h('summary');
          const count = () => { const n = items.filter((b) => b.input.checked).length; sum.textContent = `${n} ${n === 1 ? 'fact' : 'facts'} with sources will go in. Open to change them.`; };
          const g = group(`Facts: ${x.labels[st]}`, items);
          g.addEventListener('change', count);
          g.addEventListener('click', () => setTimeout(count, 0));
          count();
          facts.replaceChildren(h('details', { class: 'cs-sources cs-also-facts' }, sum, g));
        };
        const pill = (val, text) => {
          const r = h('input', { type: 'radio', name: 'cs-also-' + x.id, value: val });
          r.checked = (alsoPick[x.id] || '') === val;
          r.addEventListener('change', () => { if (val) alsoPick[x.id] = val; else delete alsoPick[x.id]; delete alsoFacts[x.id]; draw(); if (shown()) write(); });
          return h('label', { class: 'cs-pill' }, r, h('span', { text }));
        };
        draw();
        return h('div', { class: 'cs-also-row' },
          h('h4', { text: x.menu }),
          L.votesOn(x, chosen) ? null : h('p', { class: 'cs-small', text: `${titleOf(chosen)} ${chosen.last} does not vote on this. Your letter or call will say where you stand, without asking for a vote.` }),
          h('div', { class: 'cs-choice', role: 'radiogroup', 'aria-label': x.menu }, pill('', 'Leave out'), pill('for', x.labels.for), pill('against', x.labels.against)),
          facts);
      });
      alsoBox.replaceChildren(h('fieldset', { class: 'cs-group' }, h('legend', { text: 'More issues in the same letter or call (optional)' }),
        h('p', { class: 'cs-small', text: 'Pick a side on any other issue, and it goes into this one letter or call script too, with the facts you check. Any mix works.' }),
        rows));
    }
    const alsoList = () => Object.keys(alsoPick).filter((id) => id !== issue.id && byAll[id] && !byAll[id].own)
      .map((id) => ({ id, stance: alsoPick[id],
        facts: alsoItems[id] ? alsoItems[id].filter((b) => b.input.checked).map((b) => b.id) : (alsoFacts[id] || L.defaultFacts(byAll[id], alsoPick[id])) }));
    rFor.addEventListener('change', showAlso);
    rAgainst.addEventListener('change', showAlso);
    rFor.addEventListener('change', showPicks);
    rAgainst.addEventListener('change', showPicks);

    // Senator cards
    function card(s) {
      const cast = issue.own ? null : L.castFor(issue, s);
      const on = chosen && chosen.id === s.id;
      return h('div', { class: 'cs-card' + (on ? ' cs-on' : '') },
        h('h4', null, nameLink(s)),
        h('p', { class: 'cs-sub', text: `${partyWord(s.party)}, ${s.seat || D.states[s.st]}${s.since ? ' · ' + W.since + ' ' + s.since : ''}` }),
        h('p', { class: 'cs-links' }, h('a', { class: 'cs-btn', href: tel(s.phone), text: 'Call ' + s.phone }), ext(W.form, s.form, 'cs-btn')),
        h('p', { class: 'cs-small', text: s.office + (HOUSE ? ', Washington, DC 20515' : ', Washington, DC 20510') }),
        FIT.committeesOf(s).length ? h('p', { class: 'cs-small cs-comms', text: 'Committees: ' + FIT.committeesOf(s).map((x) => FIT.shortCommittee(x.code) + (x.role ? ` (${x.role})` : '')).join('; ') }) : null,
        h('p', { class: 'cs-small' }, s.page ? own('Their page and votes', pageOf(s) + '#votes') : null, s.page && s.web ? ' · ' : '', s.web ? own('Money web', s.web) : null),
        cast ? h('p', { class: 'cs-record' }, `${castWord(cast)}${issue.record.short ? ' ' + issue.record.short : ''} on ${issue.record.date}: `,
          issue.record.ours ? own('the vote on The Way', VOTES_PAGE + '#' + issue.record.ours) : null, issue.record.ours ? ' · ' : '', ext(`${issue.record.srcLabel || 'Senate roll call'} ↗`, issue.record.url)) : null,
        issue.own || (L.canVote(issue, s) && FIT.shows(issue, s)) ? null : h('p', { class: 'cs-note', text: issue.kind === 'vote'
          ? `${titleOf(s)} ${s.last} was not in office for this vote. You can still write or call about it in your own words, or about anything else.`
          : issue.voters === 'dem' ? (HOUSE
            ? `${titleOf(s)} ${s.last} is not a House Democrat, and this is about who leads House Democrats, so it is not on ${s.last}'s list. You can still write or call in your own words, or about anything else.`
            : `Senator ${s.last} is not in the Senate Democratic caucus, and only Democratic senators and the two independents who work with them vote on this. You can still write or call about it in your own words, or about anything else.`)
          : issue.voters === 'rep' ? `${titleOf(s)} ${s.last} is not a Republican, and only Republicans vote on this. You can still write or call in your own words, or about anything else.`
          : `${titleOf(s)} ${s.last} does not vote on this. You can still write or call in your own words, or about anything else.` }),
        h('p', { class: 'cs-card-go' },
          h('button', { type: 'button', class: 'cs-btn cs-main', text: (on && mode === 'letter' ? 'Writing to ' : 'Write to ') + s.last, onclick: () => { setMode('letter'); choose(s, true); } }),
          h('button', { type: 'button', class: 'cs-btn', text: 'Call script for ' + s.last, onclick: () => { setMode('call'); choose(s, true); } })));
    }
    const listForState = (st) => MEMBERS.filter((s) => s.st === st);
    function currentList() {
      if (stateSel.value) return listForState(stateSel.value);
      const s = byId[senSel.value];
      return s ? [s] : [];
    }
    function showCards() { cards.replaceChildren(...currentList().map(card)); }
    function choose(s, scroll) {
      chosen = s || null;
      markIssues();
      if (scopeF === 'state' || scopeF === 'local') showScope();
      if (chosen && !votable(issue)) {
        const was = issue;
        setIssue('own', true);
        status.textContent = callStatus.textContent = '';
        aiNote.textContent = `${titleOf(chosen)} ${chosen.last} does not vote on "${was.menu}". You can write about it in your own words here, or pick another issue.`;
      }
      showCards();
      step2.hidden = !chosen;
      if (!chosen) hideOut();
      showPicks();
      showAlso();
      if (chosen && sharedLetter) { showIssue(); useShared(); return; }
      if (chosen) showIssue();
      if (chosen && scroll) issueStep.scrollIntoView({ behavior: 'smooth', block: 'start' });
      if (chosen && shown()) write();
    }
    function autoChoose() {
      const ok = currentList();
      if (chosen && ok.includes(chosen)) return choose(chosen, false);
      choose(ok.length === 1 ? ok[0] : null, false);
    }
    function setIssue(id, quiet) {
      issue = byIssue[id] || ISSUES[0];
      fillMenu();
      aiNote.textContent = '';
      if (issue.own) loadWords();
      if (issue.kind === 'date' && !ownTopic.value) ownTopic.value = issue.topicText || '';
      rFor.checked = false; rAgainst.checked = false;
      hideOut();
      showPicks();
      showAlso();
      showIssue();
      if (quiet) return;
      showCards();
      if (chosen) step2.hidden = false;
      try { history.replaceState(null, '', location.pathname + (issue.id === 'own' ? '' : '?issue=' + encodeURIComponent(issue.id))); } catch { /* ignore */ }
    }
    function setSide(st) {
      if (issue.own || (st !== 'for' && st !== 'against')) return;
      (st === 'for' ? rFor : rAgainst).checked = true;
      showPicks(); showAlso();
    }
    // A friend's letter from the link, written for the member the reader picks.
    function fillTokens(text) {
      const T = titleOf(chosen);
      return String(text || '').replace(/\{FULL\}/g, `${T} ${chosen.name}`).replace(/\{NAME\}/g, chosen.name).replace(/\{S\}/g, `${T} ${chosen.last}`)
        .replace(/\{STATE\}/g, chosen.stateName || D.states[chosen.st] || '');
    }
    function useShared() {
      setMode('letter');
      subject.value = fillTokens(sharedLetter.j || '');
      letter.value = fillTokens(sharedLetter.t);
      voiceLine.textContent = `A letter a friend shared, now addressed to ${titleOf(chosen)} ${chosen.name}. Read it over and make it yours.`;
      changes.hidden = true;
      openForm.href = chosen.form; callBtn.href = tel(chosen.phone); callBtn.textContent = 'Call ' + chosen.phone;
      tip.textContent = HOUSE ? 'Most House offices take messages only through the contact page on their website, and only from people who live in their district. Fill in anything in [brackets] and change anything that does not sound like you.'
        : `Senator ${chosen.last}'s form may only accept messages from people who live in ${D.states[chosen.st]}. Fill in anything in [brackets] and change anything that does not sound like you.`;
      status.textContent = '';
      callOut.hidden = true; out.hidden = false;
      out.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    // Share links (Frank Nov 27 2026): the same letter, or just the topic so a friend writes their own.
    function letterToken(text) {
      if (!chosen) return text;
      const T = titleOf(chosen), st = chosen.stateName || D.states[chosen.st] || '';
      let t = String(text || '');
      const swap = (a, b) => { if (a && a.length > 2) t = t.split(a).join(b); };
      swap(`${T} ${chosen.name}`, '{FULL}'); swap(`The Honorable ${chosen.name}`, 'The Honorable {NAME}'); swap(chosen.name, '{NAME}'); swap(`${T} ${chosen.last}`, '{S}');
      const nm = nameIn.value.trim(), tw = townIn.value.trim();
      if (nm.length > 1) t = t.split(nm).join('[Your name]');
      if (tw.length > 1) t = t.split(tw).join('[your town]');
      // Their state goes with the friend's member, except inside a fact's source.
      if (st) t = t.split('\n').map((line) => (/\(Source:/.test(line) ? line : line.split(st).join('{STATE}'))).join('\n');
      return t;
    }
    function shareUrl(withLetter) {
      const st = stance();
      let u = location.origin + location.pathname + (issue.id === 'own' ? '' : '?issue=' + encodeURIComponent(issue.id) + (st ? '&side=' + st : ''));
      if (withLetter) u += '#letter=' + b64(JSON.stringify({ i: issue.id, s: st, t: letterToken(letter.value), j: letterToken(subject.value) }));
      return u;
    }
    function share(withLetter) {
      const url = shareUrl(withLetter);
      const done = withLetter ? 'Link copied. Paste it in a text or email. Your friend gets this letter, ready for their own member.'
        : 'Link copied. Your friend gets the same topic and writes their own letter.';
      if (navigator.share && /Mobi|Android|iPhone|iPad/.test(navigator.userAgent)) {
        navigator.share({ title: 'Contact your ' + W.one, url }).then(() => { shareStatus.textContent = 'Shared.'; }, () => copy(url, done, shareStatus));
      } else copy(url, done, shareStatus);
    }
    const shareStatus = h('p', { class: 'cs-status', role: 'status' });
    const shareBox = h('div', { class: 'cs-share' },
      h('h4', { text: 'Share with a friend' }),
      h('p', { class: 'cs-actions' },
        h('button', { type: 'button', class: 'cs-btn', text: 'Share my letter', onclick: () => share(true) }),
        h('button', { type: 'button', class: 'cs-btn', text: 'Share the topic', onclick: () => share(false) })),
      h('p', { class: 'cs-small', text: 'Share my letter: your friend gets this same letter, ready to send to their own member. Your name and town are taken out, and the letter rides in the link itself, so take out anything private first.' }),
      h('p', { class: 'cs-small', text: 'Share the topic: your friend gets the same issue and side, and writes their own letter.' }),
      shareStatus);
    status.after(shareBox);
    issueSel.addEventListener('change', () => setIssue(issueSel.value));
    stateSel.addEventListener('change', () => { senSel.value = ''; chosen = null; hideOut(); autoChoose(); });
    senSel.addEventListener('change', () => {
      const s = byId[senSel.value];
      stateSel.value = s ? s.st : '';
      chosen = null; hideOut();
      if (s) choose(s, false); else { cards.replaceChildren(); step2.hidden = true; }
    });

    function write() {
      const st = rFor.checked ? 'for' : rAgainst.checked ? 'against' : '';
      if (!chosen) { status.textContent = `Pick a ${W.one} first.`; return; }
      if (issue.own) return writeOwn();
      if (!st) {
        const o = mode === 'call' ? callOut : out;
        (mode === 'call' ? callStatus : status).textContent = 'Pick a side first.';
        hideOut(); o.hidden = false; return;
      }
      const o = { reasons: reasons.value, name: nameIn.value, town: townIn.value, who: whoSel.value, voice: voiceSel.value,
        facts: factBoxes.filter((b) => b.input.checked).map((b) => b.id),
        views: viewBoxes.filter((b) => b.input.checked).map((b) => b.text),
        record: recordBox ? recordBox.input.checked : false, also: alsoList() };
      if (mode === 'call') return writeCall(st, o);
      const r = L.build(issue, chosen, st, o, lastVoice);
      lastVoice = r.voice;
      subject.value = r.subject;
      letter.value = r.body;
      const more = o.also.length ? ` · plus ${o.also.map((a) => byAll[a.id].labels[a.stance]).join(', ')}` : '';
      voiceLine.textContent = `To ${titleOf(chosen)} ${chosen.name} · ${issue.labels[st]}${more} · ${o.facts.length} ${o.facts.length === 1 ? 'fact' : 'facts'} with sources · Voice: ${r.label}${o.voice ? '' : ' (picked at random)'}`;
      openForm.href = chosen.form;
      callBtn.href = tel(chosen.phone);
      callBtn.textContent = 'Call ' + chosen.phone;
      tip.textContent = HOUSE ? `Most House offices take messages only through the contact page on their website, and only from people who live in their district. It will ask for your address. ${titleOf(chosen)} ${chosen.last}'s website: ${chosen.site}. A phone call works too. Fill in anything in [brackets], read the letter over, and change anything that does not sound like you.` : `Senator ${chosen.last}'s form may only accept messages from people who live in ${D.states[chosen.st]}. It will ask for your address. If you live somewhere else, a phone call works from any state. Fill in anything in [brackets], read the letter over, and change anything that does not sound like you.`;
      status.textContent = '';
      callOut.hidden = true;
      out.hidden = false;
    }
    // Your own words: the cleaned notes (or the AI rewrite, when the reader asked for one) as a letter or call script.
    function ownOpts() {
      const key = [issue.id, ownTopic.value, ownNotes.value, ownAsk.value].join('|');
      return { topic: ownTopic.value, notes: ownNotes.value, ask: ownAsk.value, angry: !!issue.angry, name: nameIn.value, town: townIn.value, who: whoSel.value,
        also: alsoList(), aiText: aiFor === key + '|' + mode ? aiText : '' };
    }
    function showChanges(el, list) {
      el.hidden = !list.length;
      if (!list.length) return;
      el.replaceChildren(h('summary', { text: `Words we changed (${list.length}). Check them.` }),
        h('ul', null, list.map(([a, b]) => h('li', { text: `${a} → ${b}` }))));
    }
    function writeOwn() {
      const o = ownOpts();
      const more = o.also.length ? ` · plus ${o.also.map((a) => byAll[a.id].labels[a.stance]).join(', ')}` : '';
      if (mode === 'call') {
        const r = L.callOwn(chosen, o);
        callTo.textContent = `To ${titleOf(chosen)} ${chosen.name}'s Washington office · ${issue.angry ? 'Pissed off, cleaned up' : 'Your own words'}${more}${o.aiText ? " · rewritten by The Way's AI" : ''}`;
        showChanges(callChanges, o.aiText ? [] : r.changes);
        callPhone.href = tel(chosen.phone);
        callPhone.textContent = 'Call ' + chosen.phone;
        callPoints.replaceChildren(...r.points.map((x) => h('li', { text: x })));
        voicemail.value = r.voicemail;
        callTip.textContent = `Calls work from any state. Staff may ask for your name and ZIP code. Fill in anything in [brackets], and say it in your own words if you like. ${titleOf(chosen)} ${chosen.last}'s ${HOUSE ? 'website' : 'contact form'} is here if you would rather write: `;
        callTip.append(ext(HOUSE ? 'Open their website' : 'Open their form', chosen.form));
        callStatus.textContent = '';
        out.hidden = true; callOut.hidden = false;
        return;
      }
      const r = L.buildOwn(chosen, o);
      subject.value = r.subject;
      letter.value = r.body;
      voiceLine.textContent = `To ${titleOf(chosen)} ${chosen.name} · ${r.label}${more}${o.aiText ? " · rewritten by The Way's AI" : ''}`;
      showChanges(changes, o.aiText ? [] : r.changes);
      openForm.href = chosen.form;
      callBtn.href = tel(chosen.phone);
      callBtn.textContent = 'Call ' + chosen.phone;
      tip.textContent = HOUSE ? `Most House offices take messages only through the contact page on their website, and only from people who live in their district. It will ask for your address. Read the letter over, fill in anything in [brackets], and change anything that does not sound like you.`
        : `Senator ${chosen.last}'s form may only accept messages from people who live in ${D.states[chosen.st]}. It will ask for your address. Read the letter over, fill in anything in [brackets], and change anything that does not sound like you.`;
      status.textContent = '';
      callOut.hidden = true; out.hidden = false;
    }
    // The word list for spelling fixes loads only when the own-words box is used.
    function loadWords() {
      if (window.CS_WORDS || document.getElementById('cs-words')) return;
      const src = [...document.scripts].map((x) => x.src).find((x) => /\/own\.js/.test(x));
      if (!src) return;
      const sc = document.createElement('script');
      sc.id = 'cs-words';
      sc.src = src.replace(/own\.js(\?.*)?$/, 'words.js$1');
      sc.addEventListener('load', () => { if (issue.own && shown()) write(); });
      document.head.append(sc);
    }
    // Rewrite with The Way's own AI computer (only when it is connected). Sends the notes, the kind and the member's title and state.
    async function aiRewrite() {
      if (!chosen) { aiNote.textContent = `Pick a ${W.one} first.`; return; }
      if (!ownNotes.value.trim()) { aiNote.textContent = 'Type your concerns first.'; ownNotes.focus(); return; }
      aiNote.textContent = 'Asking our AI computer. This can take up to 30 seconds…';
      const key = [issue.id, ownTopic.value, ownNotes.value, ownAsk.value].join('|') + '|' + mode;
      const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 30000);
      try {
        const res = await fetch('/api/rewrite', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: ctl.signal,
          body: JSON.stringify({ kind: mode === 'call' ? 'call' : 'letter', angry: !!issue.angry, topic: ownTopic.value.slice(0, 120), notes: ownNotes.value.slice(0, 3000), ask: ownAsk.value.slice(0, 200), to: `${titleOf(chosen)} ${chosen.last}` }) });
        const j = res.ok ? await res.json() : null;
        if (!j || typeof j.text !== 'string' || !j.text.trim()) throw new Error('no text');
        aiText = j.text.slice(0, 4000); aiFor = key;
        aiNote.textContent = 'Rewritten by our AI. Read it over before you send it.';
        go(mode);
      } catch {
        aiNote.textContent = 'Our AI computer is not answering right now, so the letter uses the built-in cleanup. You can still edit it.';
        go(mode);
      } finally { clearTimeout(timer); }
    }
    function writeCall(st, o) {
      const r = L.callBuild(issue, chosen, st, o);
      const more = o.also.length ? ` · plus ${o.also.map((a) => byAll[a.id].labels[a.stance]).join(', ')}` : '';
      callTo.textContent = `To ${titleOf(chosen)} ${chosen.name}'s Washington office · ${issue.labels[st]}${more} · ${o.facts.length} ${o.facts.length === 1 ? 'fact' : 'facts'}`;
      callPhone.href = tel(chosen.phone);
      callPhone.textContent = 'Call ' + chosen.phone;
      callPoints.replaceChildren(...r.points.map((x) => h('li', { text: x })));
      voicemail.value = r.voicemail;
      callTip.textContent = `Calls work from any state. Staff may ask for your name and ZIP code. Fill in anything in [brackets], and say it in your own words if you like. ${titleOf(chosen)} ${chosen.last}'s ${HOUSE ? 'website' : 'contact form'} is here if you would rather write: `;
      callTip.append(ext(HOUSE ? 'Open their website' : 'Open their form', chosen.form));
      callStatus.textContent = '';
      out.hidden = true;
      callOut.hidden = false;
    }
    function copy(text, done, where) {
      const msg = where || status;
      const fallback = () => {
        const ta = h('textarea', { readonly: true, class: 'cs-offscreen' }); ta.value = text;
        document.body.append(ta); ta.select();
        let ok = false;
        try { ok = document.execCommand('copy'); } catch { ok = false; }
        ta.remove();
        msg.textContent = ok ? done : 'Copy did not work here. Select the text and copy it yourself.';
      };
      if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(() => { msg.textContent = done; }, fallback);
      else fallback();
    }

    // Everyone in this chamber
    const table = h('div', { class: 'cs-table-wrap' }, h('table', { class: 'cs-table' },
      h('thead', null, h('tr', null, ['State', HOUSE ? 'Member' : 'Senator', 'Phone', 'Contact'].map((t) => h('th', { scope: 'col', text: t })))),
      h('tbody', null, MEMBERS.map((s) => h('tr', null,
        h('td', { text: HOUSE ? s.seat : D.states[s.st] }),
        h('td', null, nameLink(s), ' ', h('span', { class: 'cs-party', text: `(${s.party})` })),
        h('td', null, h('a', { href: tel(s.phone), text: s.phone })),
        h('td', null, ext(W.form, s.form)))))));

    const formWhy = HOUSE
      ? h('p', { text: 'House offices take messages through the contact page on their own website. Most ask for your street address and ZIP code and answer only people who live in their district. So the tool gives Copy letter, Open their website and Call instead.' })
      : h('p', { text: 'Each senator runs a different form on their own website. Ten of them were tested on November 15, 2026 by putting text in the link, and none filled it in. Most ask for your street address and ZIP code, many say they only answer people who live in their state, and some use a robot check. So the tool gives Copy letter, Open their form and Call instead.' });
    const howList = HOUSE
      ? h('ul', null,
        h('li', { text: 'We searched news reports, official records (House roll calls, FEC filings) and statements from both sides, and kept every point we could tie to a source. Some issues have more points on one side, because the record has more. We do not pad the thinner side.' }),
        h('li', { text: 'Every fact you check goes into the letter with its source written out: outlet, date and link.' }),
        h('li', null, 'Do not know your district? The House has a lookup by ZIP code: ', ext('Find your representative (house.gov) ↗', 'https://www.house.gov/representatives/find-your-representative'), '.'),
        h('li', { text: 'This list shows the House members in office now (the 119th Congress). Members elected on November 3 who are not in office yet have no Washington office until January; reach them through their campaign.' }))
      : h('ul', null,
        h('li', { text: 'We searched news reports, official records (Senate roll calls, bill text, FEC filings) and statements from both sides, and kept every point we could tie to a source. Some issues have more points on one side, because the record has more. We do not pad the thinner side.' }),
        h('li', { text: 'Every fact you check goes into the letter with its source written out: outlet, date and link.' }),
        h('li', null, 'Every vote count links to ', own('our page for that vote', VOTES_PAGE), ', which shows how every senator voted and links to the official roll call on senate.gov so you can check us. A voice vote has no roll call, so it links to the official record of the action.'),
        h('li', { text: 'When the Senate has already voted, the card and the letter can say how that senator voted, from the official roll call.' }),
        h('li', { text: 'For the Democratic leader vote, a letter can name a vote where that senator broke from most Democratic senators (nine official roll calls from 2025 and 2026; close splits left out).' }),
        h('li', null, 'For the House, use ', own('Contact Your Representative', '/get-involved/contact-your-representative/'), '.'));

    render(h('div', { class: 'cs-admin' },
      h('p', { class: 'cs-neutral' }, h('strong', { text: 'The Way takes no side. ' }), 'For each issue we searched for the arguments on both sides and publish every one we could tie to a source, the same way for both sides. You pick which ones go in your letter, and each one carries its source.'),
      h('div', { class: 'cs-step' }, h('h3', null, num(1), W.pick),
        h('div', { class: 'cs-row' }, field('Your state', stateSel), field(W.any, senSel)), cards),
      issueStep,
      step2, out, callOut,
      h('h2', { text: HOUSE ? 'Why it cannot fill in their contact page' : 'Why it cannot fill in their form' }),
      formWhy,
      h('h2', { text: 'How the facts are chosen' }),
      howList,
      h('h2', { text: HOUSE ? `All ${MEMBERS.length} House members` : 'All 100 senators' }),
      h('p', { class: 'muted small', text: HOUSE
        ? `Washington office phone and website for every House member, from the congress-legislators public dataset (checked ${D.checked}). Each name opens that member's page on The Way.`
        : `Washington office phone and official contact page, checked on senate.gov on ${D.checked}. No senator lists a public email address. Each name opens that senator's page on The Way, with the Senate votes we track.` }),
      table));

    issue = byIssue[startId] || ISSUES[0];
    setIssue(issue.id);
    if (start.side) setSide(start.side);
    else if (sharedLetter && sharedLetter.s) setSide(sharedLetter.s);
    if (AI_ON) privacy.textContent = "What you type stays in your browser. This page does not save it or send it anywhere, unless you press Rewrite it with The Way's AI: then your notes go to The Way's own AI computer to be rewritten, and are not saved there.";
  }

  return { view };
}

window.TheWaySenatorLetters = { make };
})();
