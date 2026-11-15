// Admin > Contact Your Senator (super admins only, preview). Not linked from public pages.
// Phone and official contact page for all 100 senators, and a letter writer for listed Senate votes:
// pick an issue, a senator, for or against, your own reasons, and one of 11 voices.
// The data and the letter writer live in /members/senator-letters/ and load only when this view opens.
// Nothing typed here is saved or sent anywhere. Text from the data goes on the page with textContent only.
// Plain JavaScript, no build step. app.js hands over its helpers once: TheWaySenatorLetters.make({ h, render, notice }).
(() => {
'use strict';

const BASE = '/members/senator-letters/';
const FILES = ['senators.js?v=3', 'issues.js?v=3', 'letters.js?v=3'];
const CSS = BASE + 'senator-letters.css?v=3';
const MEMBER = '/government/congress/members/';
const VOTES_PAGE = '/government/congress/votes.html';

function loadScript(src) {
  return new Promise((ok, bad) => {
    const s = document.createElement('script');
    s.src = src; s.onload = ok; s.onerror = () => bad(new Error('Could not load ' + src));
    document.head.append(s);
  });
}
function loadCss(href) {
  if (document.querySelector(`link[href="${href}"]`)) return;
  const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = href; document.head.append(l);
}

function make(ctx) {
  const { h, render, notice } = ctx;
  let ready = null;
  function load() {
    if (!ready) {
      loadCss(CSS);
      ready = FILES.reduce((p, f) => p.then(() => loadScript(BASE + f)), Promise.resolve());
    }
    return ready;
  }

  async function view(issueId) {
    render(h('p', { class: 'muted', text: 'Loading the senator list…' }));
    try { await load(); } catch (e) { ready = null; render(notice(e.message || 'Could not load the letter tool.')); return; }
    const D = window.SENATE_CONTACTS, L = window.CSLetters, ISSUES = window.CS_ISSUES;
    if (!D || !L || !ISSUES || !ISSUES.length) { render(notice('The letter tool did not load.')); return; }
    tool(D, L, ISSUES, decodeURIComponent(issueId || ''));
  }

  function tool(D, L, ISSUES, startId) {
    const byId = {}, byIssue = {};
    D.senators.forEach((s) => { byId[s.id] = s; });
    ISSUES.forEach((i) => { byIssue[i.id] = i; });
    let issue = byIssue[startId] || ISSUES[0], chosen = null, lastVoice = '';
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
    const stateSel = h('select', { id: 'cs-state' }, h('option', { value: '', text: 'Choose a state' }),
      Object.keys(D.states).sort((a, b) => D.states[a].localeCompare(D.states[b])).map((k) => h('option', { value: k, text: D.states[k] })));
    const senSel = h('select', { id: 'cs-senator' }, h('option', { value: '', text: 'Choose a senator' }),
      D.senators.slice().sort((a, b) => a.last.localeCompare(b.last)).map((s) => h('option', { value: s.id, text: `${s.name} (${s.party}-${s.st})` })));
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
    const callScript = h('p');
    const openForm = h('a', { class: 'cs-btn', href: '#', target: '_blank', rel: 'noopener', text: 'Open their form' });
    const callBtn = h('a', { class: 'cs-btn', href: '#', text: 'Call' });
    const field = (label, input, wide) => h('label', { class: 'cs-field' + (wide ? ' cs-wide' : '') }, h('span', { text: label }), input);
    const picks = h('div', { class: 'cs-picks', hidden: true });
    const pickHead = h('h3', { hidden: true }, num(4), 'Pick what goes in your letter');
    let factBoxes = [], viewBoxes = [], recordBox = null;
    const stance = () => (rFor.checked ? 'for' : rAgainst.checked ? 'against' : '');

    const step2 = h('div', { class: 'cs-step', hidden: true },
      h('h3', null, num(3), question),
      h('div', { class: 'cs-choice', role: 'radiogroup', 'aria-label': 'Your answer' },
        h('label', { class: 'cs-pill' }, rFor, labFor), h('label', { class: 'cs-pill' }, rAgainst, labAgainst)),
      pickHead, picks,
      h('h3', null, num(5), 'Your own reasons ', h('span', { class: 'cs-opt', text: '(optional, but it helps)' })),
      field('Type your reasons in your own words. The letter will include them as you wrote them.', reasons, true),
      h('div', { class: 'cs-row' }, field('Your name (optional)', nameIn), field('Your town (optional)', townIn)),
      h('div', { class: 'cs-row' }, field('About you (optional)', whoSel), field('Voice', voiceSel)),
      h('p', { class: 'cs-privacy', text: 'What you type stays in your browser. This page does not save it or send it anywhere.' }),
      h('p', null, h('button', { type: 'button', class: 'cs-btn cs-main', text: 'Write my letter', onclick: () => { write(); if (!out.hidden) out.scrollIntoView({ behavior: 'smooth', block: 'start' }); } })));

    const out = h('div', { class: 'cs-step', hidden: true, 'aria-live': 'polite' },
      h('h3', null, num(6), 'Your letter'), voiceLine,
      field('Subject', subject, true),
      field('Letter (you can edit it here before you copy it)', letter, true),
      h('div', { class: 'cs-actions' },
        h('button', { type: 'button', class: 'cs-btn cs-main', text: 'Copy letter', onclick: () => copy(letter.value, 'Letter copied. Now open their form and paste it into the message box.') }),
        h('button', { type: 'button', class: 'cs-btn', text: 'Copy subject', onclick: () => copy(subject.value, 'Subject copied.') }),
        h('button', { type: 'button', class: 'cs-btn', text: 'Make another', onclick: () => write() }),
        openForm, callBtn),
      status,
      h('details', { class: 'cs-script' }, h('summary', { text: 'Calling instead? A short script' }), callScript,
        h('p', null, h('button', { type: 'button', class: 'cs-btn', text: 'Copy script', onclick: () => copy(callScript.textContent, 'Call script copied.') }))),
      tip);

    // Issue panel
    const factLi = (f) => h('li', null, f.text + ' ', h('span', { class: 'cs-cite' }, '(', srcLinks(f.cite), ')'));
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
          s.page ? own(`${s.name}: his page on The Way`, pageOf(s), 'cs-btn') : null,
          s.web ? own(`${s.webName || 'Campaign committee'} on the Money web`, s.web, 'cs-btn') : null) : null);
    }
    function showIssue() {
      const either = issue.facts.either || [];
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
          h('p', { class: 'cs-small', text: 'Either side can use these. They are the votes as cast, from the official record.' }),
          h('ul', null, either.map(factLi))) : null,
        h('details', { class: 'cs-sources' }, h('summary', { text: 'All sources for this issue' }),
          h('ul', null, issue.sources.map((x) => h('li', null, ext(`${x.src}, ${x.date}`, x.url)))))].flat().filter(Boolean));
      question.textContent = issue.question;
      labFor.textContent = issue.labels.for;
      labAgainst.textContent = issue.labels.against;
    }

    // Step 4: the reader picks the facts and reasons for the letter.
    function box(label, checked, extra) {
      const i = h('input', { type: 'checkbox' }); i.checked = !!checked;
      i.addEventListener('change', () => { if (!out.hidden) write(); });
      return { input: i, el: h('label', { class: 'cs-check' }, i, h('span', null, label, extra || null)) };
    }
    function group(title, items, note) {
      const all = h('button', { type: 'button', class: 'cs-link', text: 'Check all', onclick: () => { items.forEach((b) => { b.input.checked = true; }); if (!out.hidden) write(); } });
      const none = h('button', { type: 'button', class: 'cs-link', text: 'Clear', onclick: () => { items.forEach((b) => { b.input.checked = false; }); if (!out.hidden) write(); } });
      return h('fieldset', { class: 'cs-group' }, h('legend', { text: title }),
        note ? h('p', { class: 'cs-small', text: note }) : null,
        h('p', { class: 'cs-group-tools' }, all, ' · ', none), items.map((b) => b.el));
    }
    function showPicks() {
      const st = stance();
      pickHead.hidden = picks.hidden = !st || !chosen;
      if (!st || !chosen) return;
      const self = issue.subject && chosen.id === issue.subject;
      const on = new Set(L.defaultFacts(issue, st));
      const mk = (f) => Object.assign(box((self && f.you ? f.you : f.text) + ' ', on.has(f.id), h('span', { class: 'cs-cite' }, '(', srcLinks(f.cite), ')')), { id: f.id });
      const side = (issue.facts[st] || []).map(mk), either = (issue.facts.either || []).map(mk);
      factBoxes = side.concat(either);
      viewBoxes = issue.views[st].map((v, i) => Object.assign(box(v, i === 0), { text: v }));
      const hasRecord = issue.record && !self && (issue.record.type === 'breaks' ? !!chosen.breaks : !!L.castFor(issue, chosen));
      recordBox = hasRecord ? box(`Mention how Senator ${chosen.last} voted (from the official roll call, with the link)`, true) : null;
      picks.replaceChildren(...[
        h('p', { class: 'cs-small', text: 'Every checked fact goes into the letter with its source: the outlet, the date and the link, so the office can check it. Uncheck anything you do not want to use.' }),
        group(`Facts for your side: ${issue.labels[st]}`, side),
        either.length ? group(issue.eitherLabel || 'Either side', either, 'Votes as cast. Use any that fit your view.') : null,
        group('Reasons (your opinion, no source needed)', viewBoxes),
        recordBox ? group('Their own record', [recordBox]) : null].filter(Boolean));
    }
    rFor.addEventListener('change', showPicks);
    rAgainst.addEventListener('change', showPicks);

    // Senator cards
    function card(s) {
      const cast = L.castFor(issue, s);
      const on = chosen && chosen.id === s.id;
      return h('div', { class: 'cs-card' + (on ? ' cs-on' : '') },
        h('h4', null, nameLink(s)),
        h('p', { class: 'cs-sub', text: `${partyWord(s.party)}, ${D.states[s.st]}${s.since ? ' · in the Senate since ' + s.since : ''}` }),
        h('p', { class: 'cs-links' }, h('a', { class: 'cs-btn', href: tel(s.phone), text: 'Call ' + s.phone }), ext('Contact form', s.form, 'cs-btn')),
        h('p', { class: 'cs-small', text: s.office + ', Washington, DC 20510' }),
        h('p', { class: 'cs-small' }, s.page ? own('Their page and votes', pageOf(s) + '#votes') : null, s.page && s.web ? ' · ' : '', s.web ? own('Money web', s.web) : null),
        cast ? h('p', { class: 'cs-record' }, `${castWord(cast)}${issue.record.short ? ' ' + issue.record.short : ''} on ${issue.record.date}: `,
          issue.record.ours ? own('the vote on The Way', VOTES_PAGE + '#' + issue.record.ours) : null, issue.record.ours ? ' · ' : '', ext('Senate roll call ↗', issue.record.url)) : null,
        L.canVote(issue, s)
          ? h('button', { type: 'button', class: 'cs-btn cs-main', text: (on ? 'Writing to ' : 'Write to ') + s.last, onclick: () => choose(s, true) })
          : h('p', { class: 'cs-note', text: `Senator ${s.last} is a Republican. Only Democratic senators and the two independents who work with them vote on this. You can still call or write about anything else, or pick another issue above.` }));
    }
    const listForState = (st) => D.senators.filter((s) => s.st === st);
    function currentList() {
      if (stateSel.value) return listForState(stateSel.value);
      const s = byId[senSel.value];
      return s ? [s] : [];
    }
    function showCards() { cards.replaceChildren(...currentList().map(card)); }
    function choose(s, scroll) {
      chosen = s && L.canVote(issue, s) ? s : null;
      showCards();
      step2.hidden = !chosen;
      if (!chosen) out.hidden = true;
      showPicks();
      if (chosen && scroll) step2.scrollIntoView({ behavior: 'smooth', block: 'start' });
      if (chosen && !out.hidden) write();
    }
    function autoChoose() {
      const ok = currentList().filter((s) => L.canVote(issue, s));
      if (chosen && ok.includes(chosen)) return choose(chosen, false);
      choose(ok.length === 1 ? ok[0] : null, false);
    }
    function setIssue(id) {
      issue = byIssue[id] || ISSUES[0];
      issueSel.value = issue.id;
      rFor.checked = false; rAgainst.checked = false;
      out.hidden = true;
      showPicks();
      showIssue();
      autoChoose();
      try { history.replaceState(null, '', '#/senator-letters/' + encodeURIComponent(issue.id)); } catch { /* ignore */ }
    }
    issueSel.addEventListener('change', () => setIssue(issueSel.value));
    stateSel.addEventListener('change', () => { senSel.value = ''; chosen = null; out.hidden = true; autoChoose(); });
    senSel.addEventListener('change', () => {
      const s = byId[senSel.value];
      stateSel.value = s ? s.st : '';
      chosen = null; out.hidden = true;
      if (s) choose(s, false); else { cards.replaceChildren(); step2.hidden = true; }
    });

    function write() {
      const st = rFor.checked ? 'for' : rAgainst.checked ? 'against' : '';
      if (!chosen) { status.textContent = 'Pick a senator first.'; return; }
      if (!st) { status.textContent = 'Pick a side first.'; out.hidden = false; return; }
      const o = { reasons: reasons.value, name: nameIn.value, town: townIn.value, who: whoSel.value, voice: voiceSel.value,
        facts: factBoxes.filter((b) => b.input.checked).map((b) => b.id),
        views: viewBoxes.filter((b) => b.input.checked).map((b) => b.text),
        record: recordBox ? recordBox.input.checked : false };
      const r = L.build(issue, chosen, st, o, lastVoice);
      lastVoice = r.voice;
      subject.value = r.subject;
      letter.value = r.body;
      voiceLine.textContent = `To Senator ${chosen.name} · ${issue.labels[st]} · ${o.facts.length} ${o.facts.length === 1 ? 'fact' : 'facts'} with sources · Voice: ${r.label}${o.voice ? '' : ' (picked at random)'}`;
      openForm.href = chosen.form;
      callBtn.href = tel(chosen.phone);
      callBtn.textContent = 'Call ' + chosen.phone;
      callScript.textContent = L.callScript(issue, chosen, st, o);
      tip.textContent = `Senator ${chosen.last}'s form may only accept messages from people who live in ${D.states[chosen.st]}. It will ask for your address. If you live somewhere else, a phone call works from any state. Fill in anything in [brackets], read the letter over, and change anything that does not sound like you.`;
      status.textContent = '';
      out.hidden = false;
    }
    function copy(text, done) {
      const fallback = () => {
        const ta = h('textarea', { readonly: true, class: 'cs-offscreen' }); ta.value = text;
        document.body.append(ta); ta.select();
        let ok = false;
        try { ok = document.execCommand('copy'); } catch { ok = false; }
        ta.remove();
        status.textContent = ok ? done : 'Copy did not work here. Select the text and copy it yourself.';
      };
      if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(() => { status.textContent = done; }, fallback);
      else fallback();
    }

    // All 100 senators
    const table = h('div', { class: 'cs-table-wrap' }, h('table', { class: 'cs-table' },
      h('thead', null, h('tr', null, ['State', 'Senator', 'Phone', 'Contact'].map((t) => h('th', { scope: 'col', text: t })))),
      h('tbody', null, D.senators.map((s) => h('tr', null,
        h('td', { text: D.states[s.st] }),
        h('td', null, nameLink(s), ' ', h('span', { class: 'cs-party', text: `(${s.party})` })),
        h('td', null, h('a', { href: tel(s.phone), text: s.phone })),
        h('td', null, ext('Contact form', s.form)))))));

    render(h('div', { class: 'cs-admin' },
      h('p', { class: 'small' }, h('a', { href: '#/admin', text: '← Admin' })),
      h('h1', { text: 'Contact Your Senator' }),
      h('p', { class: 'cs-preview', text: 'Preview for super admins. This is not on the public site yet. Try it, then say what to change before it goes public.' }),
      h('p', { class: 'lede', text: 'Phone and official contact form for all 100 senators. Pick an issue, say where you stand, add your own reasons, and get a letter. Every click writes a different letter, in a different voice.' }),
      h('p', { class: 'cs-neutral' }, h('strong', { text: 'The Way takes no side. ' }), 'For each issue we searched for the arguments on both sides and publish every one we could tie to a source, the same way for both sides. You pick which ones go in your letter, and each one carries its source.'),
      h('div', { class: 'cs-step' }, h('h3', null, num(1), 'Pick an issue'), field('Issue or vote', issueSel, true), panel),
      h('div', { class: 'cs-step' }, h('h3', null, num(2), 'Pick your senator'),
        h('div', { class: 'cs-row' }, field('Your state', stateSel), field('Or any senator', senSel)), cards),
      step2, out,
      h('h2', { text: 'Why it cannot fill in their form' }),
      h('p', { text: 'Each senator runs a different form on their own website. Ten of them were tested on November 15, 2026 by putting text in the link, and none filled it in. Most ask for your street address and ZIP code, many say they only answer people who live in their state, and some use a robot check. So the tool gives Copy letter, Open their form and Call instead.' }),
      h('h2', { text: 'How the facts are chosen' }),
      h('ul', null,
        h('li', { text: 'We searched news reports, official records (Senate roll calls, bill text, FEC filings) and statements from both sides, and kept every point we could tie to a source. Some issues have more points on one side, because the record has more. We do not pad the thinner side.' }),
        h('li', { text: 'Every fact you check goes into the letter with its source written out: outlet, date and link.' }),
        h('li', null, 'Every vote count links to ', own('our page for that vote', VOTES_PAGE), ', which shows how every senator voted and links to the official roll call on senate.gov so you can check us. A voice vote has no roll call, so it links to the official record of the action.'),
        h('li', { text: 'When the Senate has already voted, the card and the letter can say how that senator voted, from the official roll call.' }),
        h('li', { text: 'For the Democratic leader vote, a letter can name a vote where that senator broke from most Democratic senators (nine official roll calls from 2025 and 2026; close splits left out).' }),
        h('li', { text: 'Only the Senate is covered. House members are not listed, because all 435 House contacts could not be checked yet.' }),
        h('li', { text: 'To add an issue, copy one block in /members/senator-letters/issues.js.' })),
      h('h2', { text: 'All 100 senators' }),
      h('p', { class: 'muted small', text: `Washington office phone and official contact page, checked on senate.gov on ${D.checked}. No senator lists a public email address. Each name opens that senator's page on The Way, with the Senate votes we track.` }),
      table));

    if (startId && byIssue[startId]) issueSel.value = startId;
    setIssue(issueSel.value);
  }

  return { view };
}

window.TheWaySenatorLetters = { make };
})();
