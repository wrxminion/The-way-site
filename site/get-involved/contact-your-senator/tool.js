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
    const ISSUES = (window.CS_ISSUES || []).filter((i) => (i.chamber || 'senate') === (HOUSE ? 'house' : 'senate'));
    if (!D || !L || !window.CSOwn || !ISSUES) { render(notice('The letter tool did not load. The page may be out of date; please reload it.')); return; }
    // Your own words first (the default), then the listed votes for this chamber (D286, Frank Nov 16 2026).
    const OWN = [
      { id: 'own', own: true, menu: 'Your own issue: type it in your own words' },
      { id: 'angry', own: true, angry: true, menu: 'Pissed off about something: say it your way, swearing and all' }];
    tool(D, L, OWN.concat(ISSUES), issueId || 'own', window.CS_ISSUES || [], also || '');
  }

  function tool(D, L, ISSUES, startId, ALL, startAlso) {
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
    const castWord = (c) => (c === 'Yea' ? 'Voted yes' : c === 'Nay' ? 'Voted no' : 'Did not vote');
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
    const issueSel = h('select', { id: 'cs-issue' }, ISSUES.map((i) => h('option', { value: i.id, text: i.menu })));
    const votable = (i) => i.own || !chosen || L.canVote(i, chosen);
    function markIssues() {
      [...issueSel.options].forEach((op) => {
        const i = byIssue[op.value];
        op.disabled = !votable(i);
        op.textContent = i.menu + (op.disabled ? ` (not ${titleOf(chosen)} ${chosen.last}'s vote)` : '');
      });
    }
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

    const issueStep = h('div', { class: 'cs-step' }, h('h3', null, num(2), 'Pick an issue, or say it in your own words'), field('Issue or vote', issueSel, true), panel);

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
      panel.replaceChildren(...[
        h('h4', { class: 'cs-issue-title', text: issue.title }),
        h('p', { class: 'cs-status-line' }, rich(issue.status)),
        issue.summary.map((p) => h('p', null, rich(p))),
        issue.searched ? h('p', { class: 'cs-searched', text: issue.searched }) : null,
        aboutBox(issue.about),
        h('div', { class: 'cs-sides' },
          factList(issue.labels.for, issue.facts.for),
          factList(issue.labels.against, issue.facts.against)),
        either.length ? h('div', { class: 'cs-side cs-either' }, h('h4', { text: `${issue.eitherLabel || 'Either side'} (${either.length})` }),
          h('p', { class: 'cs-small', text: 'Either side can use these. They are the votes as cast, from the official record, with how their party voted. Each line opens our page for that vote, which says what it was and links to the official roll call.' }),
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
        group(`Facts for your side: ${issue.labels[st]}`, side),
        either.length ? group(issue.eitherLabel || 'Either side', either, 'Votes as cast. Use any that fit your view.') : null,
        group('Reasons (your opinion, no source needed)', viewBoxes),
        recordBox ? group('Their own record', [recordBox]) : null].filter(Boolean));
    }
    // More issues in the same letter or call. Each other issue gets Leave out / one side / the other side; a picked side shows
    // its facts to check, like step 4. A member who does not vote on it gets where the reader stands, with no ask.
    function showAlso() {
      const others = ALL.filter((x) => x.id !== issue.id);
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
        h('p', { class: 'cs-small', text: s.office + ', Washington, DC 20510' }),
        h('p', { class: 'cs-small' }, s.page ? own('Their page and votes', pageOf(s) + '#votes') : null, s.page && s.web ? ' · ' : '', s.web ? own('Money web', s.web) : null),
        cast ? h('p', { class: 'cs-record' }, `${castWord(cast)}${issue.record.short ? ' ' + issue.record.short : ''} on ${issue.record.date}: `,
          issue.record.ours ? own('the vote on The Way', VOTES_PAGE + '#' + issue.record.ours) : null, issue.record.ours ? ' · ' : '', ext('Senate roll call ↗', issue.record.url)) : null,
        issue.own || L.canVote(issue, s) ? null : h('p', { class: 'cs-note', text: HOUSE
          ? `${titleOf(s)} ${s.last} is a Republican, and only House Democrats vote on this. You can still write or call about it in your own words, or about anything else.`
          : `Senator ${s.last} is a Republican, and only Democratic senators and the two independents who work with them vote on this. You can still write or call about it in your own words, or about anything else.` }),
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
      if (chosen) markIssues();
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
      issueSel.value = issue.id;
      aiNote.textContent = '';
      if (issue.own) loadWords();
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

    if (startId && byIssue[startId]) issueSel.value = startId;
    setIssue(issueSel.value);
    if (AI_ON) privacy.textContent = "What you type stays in your browser. This page does not save it or send it anywhere, unless you press Rewrite it with The Way's AI: then your notes go to The Way's own AI computer to be rewritten, and are not saved there.";
  }

  return { view };
}

window.TheWaySenatorLetters = { make };
})();
