/* Contact tools: issues that fit each member, and that change over time (D298, Frank Nov 27 2026).
   Reads fit.js (built by tools/contact-senator/build_fit.py) and adds to the issue list:
   - Previous votes: each recent House or Senate roll call, with how every member voted, from the official record.
   - Coming up: the bills on the weekly House and Senate schedule (tools/get-involved/upcoming.json), and dates.
   Each one is shown only while it fits: an upcoming bill leaves when its floor date passes and a roll call takes its
   place; a listed issue with "until" leaves the menus after that date. Party votes (a party's own leader race) show
   only to members of that party's caucus in that chamber. The same rules apply to every party.
   Also gives the page CSFit: each member's committees, tags (their committee, their bill, their state, how they
   voted), the Local, State and National filter, and the issue search with words that mean the same thing.
   Plain JavaScript, no build step. Nothing typed on the page is saved or sent. */
(function () {
  'use strict';
  var F = window.CS_FIT;
  var ISSUES = window.CS_ISSUES = window.CS_ISSUES || [];
  if (!F) { window.CSFit = null; return; }

  var today = (function () { var d = new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); })();
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  function dateLabel(iso) { var p = iso.split('-'); return MONTHS[+p[1] - 1] + ' ' + (+p[2]) + ', ' + p[0]; }
  function dayDiff(a, b) { return Math.round((Date.parse(a + 'T12:00:00') - Date.parse(b + 'T12:00:00')) / 864e5); }
  function c(src, date, url) { return { src: src, date: date, url: url }; }
  function cut(s, n) { s = String(s || ''); if (s.length <= n) return s; var t = s.slice(0, n); return t.slice(0, t.lastIndexOf(' ')) + '…'; }
  var BILLNAMES = { hr: 'H.R.', s: 'S.', hres: 'H.Res.', sres: 'S.Res.', hjres: 'H.J.Res.', sjres: 'S.J.Res.', hconres: 'H.Con.Res.', sconres: 'S.Con.Res.' };
  function billLabel(k) { var m = /^([a-z]+)(\d+)$/.exec(k || ''); return m && BILLNAMES[m[1]] ? BILLNAMES[m[1]] + ' ' + m[2] : ''; }
  function govinfo(k) { var m = /^([a-z]+)(\d+)$/.exec(k); return 'https://www.govinfo.gov/bulkdata/BILLSTATUS/119/' + m[1] + '/BILLSTATUS-119' + k + '.xml'; }
  var CH = { house: 'the House', senate: 'the Senate' };
  var PARTY = { R: 'Republicans', D: 'Democrats', I: 'Independents' };

  // Listed issues that are bills: their committees and sponsors, so they can be tagged for each member.
  // Kept here so issues.js entries stay as they are.
  var ISSUE_FIT = {
    'permitting-baaja': { committees: ['SSEG'], sponsors: ['H001046', 'L000577', 'C001047', 'W000802'],
      follow: { bill: 'hr2347', ch: 'senate', after: '2026-11-11', label: 'Later Senate votes on H.R. 2347, the House bill the Senate is using to carry this bill (see the summary above)' } },
    'veterans-hr9237': { committees: ['SSVA', 'HSVR'], sponsors: ['B001295'] },
    'open-courts-s4667': { committees: ['SSJU', 'HSJU'], sponsors: ['K000393', 'W000779'] }
  };

  // How each member voted: the vote's cast string, in the order of fit.js "order" for that chamber.
  var POS = { house: {}, senate: {} };
  ['house', 'senate'].forEach(function (ch) { (F.order[ch] || []).forEach(function (id, i) { POS[ch][id] = i; }); });
  var VOTES = {};
  F.votes.forEach(function (v) { VOTES[v.id] = v; });
  var CASTS = { Y: 'Yea', N: 'Nay', P: 'Present', X: 'NV' };
  function castOf(v, id) {
    var i = POS[v.ch][id];
    if (i == null) return null;
    var ch = v.c.charAt(i);
    return CASTS[ch] || null;   // null: not in office for that vote
  }

  // Short titles of bills, from the weekly list and from House roll calls, so a Senate vote can use the short name too.
  var LONG = /^(Providing|Directing|Establishing|Proposing|In the matter|Impeaching|To amend|An Act|Making)/;
  var TITLES = {};
  F.votes.forEach(function (v) { if (v.ch === 'house' && v.bill && v.title && !LONG.test(v.title)) TITLES[v.bill] = v.title; });
  Object.keys(F.bills).forEach(function (k) { TITLES[k] = F.bills[k].title; });
  function lower1(t) { return t.charAt(0).toLowerCase() + t.slice(1); }
  // A plain name for the measure, the way a person would say it.
  function voteWhat(v) {
    var b = v.bill ? billLabel(v.bill) : '';
    var known = v.bill ? TITLES[v.bill] || '' : '';
    var desc = v.desc || '';
    var nom = /^(.*?), of [^,]+, to be (.*)$/.exec(desc);
    if (v.ch === 'senate' && /^PN/.test(v.doc) && nom) {
      var who = 'the nomination of ' + nom[1] + ' to be ' + nom[2];
      return /Cloture/.test(v.q) ? 'ending debate on ' + who : who;
    }
    var tail = function (t) { return lower1(t.replace(/,? and for other purposes\.?$/i, '').replace(/\.$/, '')); };
    var name = v.ch === 'house' ? (b + (v.title ? (LONG.test(v.title) ? ', ' + tail(v.title) : ', the ' + v.title) : ''))
      : (b + (known ? ', the ' + known : desc ? ', ' + tail(desc) : ''));
    if (/Motion to Table/.test(v.q)) return 'setting aside (tabling) ' + name;
    if (/Motion to Refer/.test(v.q)) return 'sending to committee (referring) ' + name;
    if (/Motion to Discharge/.test(v.q)) return 'bringing ' + name + ' out of committee';
    if (/Cloture on the Motion to Proceed/.test(v.q)) return 'starting debate on ' + name;
    if (/Motion to Proceed/.test(v.q)) return 'taking up ' + name;
    if (/Concur in the Senate/.test(v.q)) return 'agreeing to the Senate changes to ' + name;
    if (/Cloture/.test(v.q)) return 'ending debate on ' + name;
    return name;
  }
  function splitLine(v) {
    var t = {};
    if (v.tot) { Object.keys(v.tot).forEach(function (p) { t[p] = v.tot[p]; }); }
    else {
      // Senate: count from the casts and each senator's party.
      var D = window.SENATE_CONTACTS;
      (F.order.senate || []).forEach(function (id, i) {
        var s = D && D.senators ? D.senators[i] : null;
        var p = s && s.id === id ? s.party : null;
        var ch = v.c.charAt(i);
        if (!p || ch === '.') return;
        t[p] = t[p] || [0, 0, 0, 0];
        t[p]['YNPX'.indexOf(ch)] += 1;
      });
    }
    return ['R', 'D', 'I'].filter(function (p) { return t[p] && (t[p][0] + t[p][1] + t[p][2] + t[p][3]); }).map(function (p) {
      var x = t[p];
      return PARTY[p] + ': ' + x[0] + ' yes, ' + x[1] + ' no' + (x[2] ? ', ' + x[2] + ' present' : '') + (x[3] ? ', ' + x[3] + ' did not vote' : '');
    }).join('. ') + '.';
  }
  // The result in plain words, and the votes it needed when that is not a simple majority.
  function plainResult(v) {
    var ok = /Passed|Agreed|Confirmed/i.test(v.res), word = /Confirmed/i.test(v.res) ? 'confirmed' : ok ? 'it passed' : 'it failed';
    var need = /Cloture/.test(v.q) ? ' (it needed 60 votes)' : /Suspend the Rules/.test(v.q) ? ' (this fast-track vote needed two thirds)' : '';
    return word + ', ' + v.yes + ' to ' + v.no + need;
  }
  function rollSrc(v) { return c((v.ch === 'house' ? 'House' : 'Senate') + ' roll call ' + v.n + (v.ch === 'house' ? ' of ' + v.date.slice(0, 4) + ' (Office of the Clerk)' : ' (senate.gov)'), dateLabel(v.date), v.url); }
  var firstVote = {}, lastVote = {};
  F.votes.forEach(function (v) {
    if (!firstVote[v.ch] || v.date < firstVote[v.ch]) firstVote[v.ch] = v.date;
    if (!lastVote[v.ch] || v.date > lastVote[v.ch]) lastVote[v.ch] = v.date;
  });

  function voteIssue(v) {
    var what = voteWhat(v), when = dateLabel(v.date), src = rollSrc(v), body = v.ch === 'house' ? 'The House' : 'The Senate';
    var bill = v.bill && F.bills[v.bill];
    var either = [
      { id: 'result', on: true, cite: [src], text: body + ' voted on ' + what + ' on ' + when + '. Result: ' + plainResult(v) + '.' },
      { id: 'split', on: false, cite: [src], text: 'How each party voted: ' + splitLine(v) }];
    if (bill && bill.summary) either.push({ id: 'what', on: true, cite: [c('Official bill summary (' + (bill.summaryOf || 'Library of Congress') + '), govinfo', 'read November 2026', govinfo(v.bill))], text: 'What the bill does, from the official summary: ' + bill.summary });
    var sources = [src].concat(bill && bill.summary ? [either[2].cite[0]] : []);
    return {
      id: 'vote-' + v.id, kind: 'vote', chamber: v.ch, when: v.date, vote: v.id, bill: v.bill || '',
      committees: bill ? bill.committees : [], sponsors: bill && bill.sponsor ? [bill.sponsor] : [],
      states: [],
      menu: 'Past vote, ' + when + ': ' + cut(what.charAt(0).toUpperCase() + what.slice(1), 110) + ' (' + (/Passed|Agreed|Confirmed/i.test(v.res) ? 'passed' : 'failed') + ', ' + v.yes + ' to ' + v.no + ')',
      title: what.charAt(0).toUpperCase() + what.slice(1),
      status: body + ' voted on ' + when + ' (official question: ' + v.q + '). Result: ' + plainResult(v).replace(v.yes + ' to ' + v.no, '[' + v.yes + ' to ' + v.no + '](' + v.url + ')') + '.',
      summary: [splitLine(v)].concat(bill && bill.summary ? ['What the bill does, from the official summary (' + (bill.summaryOf || 'Library of Congress') + '): ' + bill.summary] : []),
      searched: 'From the official roll call on ' + (v.ch === 'house' ? 'clerk.house.gov' : 'senate.gov') + '. We list the recorded votes on bills, resolutions and nominations from ' + dateLabel(firstVote[v.ch]) + ' to ' + dateLabel(lastVote[v.ch]) + ', the same way for every member. ' + (v.ch === 'house' ? 'Amendments, motions to recommit and votes on the House rules for a bill are left out.' : 'Amendments, budget waivers and debate votes that were followed by a final vote are left out.') + ' Write to thank them or to say you disagree.',
      voters: 'all',
      question: 'Were you for or against ' + what + '?',
      labels: { for: 'For it (yes)', against: 'Against it (no)' },
      short: what,
      stand: { for: 'I was for ' + what + ' (' + when + ').', against: 'I was against ' + what + ' (' + when + ').' },
      also: { for: 'I was for ' + what + ' (' + when + ').', against: 'I was against ' + what + ' (' + when + ').' },
      eitherLabel: 'The official record',
      topic: [what],
      asks: {
        for: ['Please keep my view in mind the next time a vote like this comes up.', 'I want you to know where I stand on this vote.', 'I hope you will keep standing up for this.'],
        forShort: ['I was for it.', 'I support it.'],
        against: ['Please keep my view in mind the next time a vote like this comes up.', 'I want you to know where I stand on this vote.', 'I hope you will work to change course on this.'],
        againstShort: ['I was against it.', 'I oppose it.']
      },
      subjects: { for: ['Your vote on ' + cut(what, 70), 'My view on the ' + when + ' vote', 'From a constituent in {state}: I was for it'],
        against: ['Your vote on ' + cut(what, 70), 'My view on the ' + when + ' vote', 'From a constituent in {state}: I was against it'] },
      call: { for: 'I am calling about ' + what + ' on ' + when + '. I was for it, and I want {S} to know.', against: 'I am calling about ' + what + ' on ' + when + '. I was against it, and I want {S} to know.' },
      facts: { for: [], against: [], either: either },
      views: { for: ['I think this was the right call.', 'This matters to people where I live.', 'I want my view on the record with your office.'],
        against: ['I think this was the wrong call.', 'I do not think this helps people where I live.', 'I want my view on the record with your office.'] },
      record: { type: 'fit', vote: v.id, what: what, date: when, url: v.url, srcLabel: (v.ch === 'house' ? 'House' : 'Senate') + ' roll call', short: '',
        lines: {
          for: { Yea: ['Thank you for voting yes on {what} on {date}.', 'I saw that you voted yes on {what} on {date}, and I am glad you did.'],
            Nay: ['I was disappointed that you voted no on {what} on {date}.', 'You voted no on {what} on {date}. I wish you had voted yes.'],
            Present: ['You voted present on {what} on {date}. I wish you had voted yes.'] },
          against: { Yea: ['I was disappointed that you voted yes on {what} on {date}.', 'You voted yes on {what} on {date}. I wish you had voted no.'],
            Nay: ['Thank you for voting no on {what} on {date}.', 'I saw that you voted no on {what} on {date}, and I am glad you did.'],
            Present: ['You voted present on {what} on {date}. I wish you had voted no.'] },
          nv: 'The official record shows you did not vote on {what} on {date}.' } },
      civic: ['Letters like this are how people back home let you know what they think of your votes.'],
      sources: sources
    };
  }

  function billIssue(u) {
    var body = CH[u.ch], Body = body.charAt(0).toUpperCase() + body.slice(1);
    var what = u.number + ', the ' + u.title;
    var gi = c('Bill record, ' + u.number + ' (Library of Congress, govinfo)', 'read ' + (F.checked.upcoming || 'November 2026'), govinfo(u.bill));
    var sched = u.ch === 'house' ? c('House Majority Leader, weekly schedule', 'week of ' + u.whenLabel, 'https://www.majorityleader.gov/schedule/weekly-schedule.htm')
      : c('U.S. Senate floor schedule', u.whenLabel, 'https://www.senate.gov/legislative/schedule/floor_schedule.htm');
    var sp = u.sponsor && u.sponsor.name ? 'Sponsor: ' + u.sponsor.name + '.' : '';
    var co = u.cosponsors ? ' Cosponsors: ' + u.cosponsors.total + ' (' + ['D', 'R', 'I'].filter(function (p) { return u.cosponsors[p]; }).map(function (p) { return u.cosponsors[p] + ' ' + p; }).join(', ') + ').' : '';
    var comm = (u.committees || []).map(function (k) { return F.committees[k] ? F.committees[k].name : ''; }).filter(Boolean).join(' and ');
    var either = [];
    if (u.summary) either.push({ id: 'what', on: true, cite: [gi], text: 'What the bill does, from the official summary: ' + u.summary });
    if (sp) either.push({ id: 'sponsor', on: false, cite: [gi], text: sp + co });
    if (comm) either.push({ id: 'committee', on: false, cite: [gi], text: 'It went through the ' + comm + '.' });
    if (u.latest) either.push({ id: 'latest', on: false, cite: [gi], text: 'Latest action (' + dateLabel(u.latest.date) + '): ' + u.latest.text });
    return {
      id: u.id, kind: 'bill', chamber: u.ch, when: u.when, bill: u.bill, committees: u.committees || [], sponsors: u.sponsor && u.sponsor.id ? [u.sponsor.id] : [],
      states: u.states || [], page: u.page || '',
      menu: 'Coming up, ' + u.whenLabel + ': ' + cut(what, 110),
      title: what,
      status: 'On ' + body + ' schedule for ' + u.whenLabel + (u.how === 'suspension' ? ', under a fast-track rule that needs two thirds to pass' : u.how === 'rule' ? ', under a rule for debate' : '') + ' ([schedule](' + sched.url + ')).' + (u.page ? ' More on [our page for this bill](' + u.page + ').' : ''),
      summary: [u.summary ? 'What the bill does, from the official summary (' + (u.summaryOf || 'Library of Congress') + '): ' + u.summary : 'The official summary is not out yet.', (sp + co).trim()].filter(Boolean),
      searched: 'From the official bill record (Library of Congress, govinfo) and the ' + (u.ch === 'house' ? 'House Majority Leader\'s weekly schedule' : 'Senate floor schedule') + ', checked ' + (F.checked.upcoming || '') + '. Every bill on the schedule is listed the same way. We have not gathered arguments for and against this one yet, so the letter uses your reasons and the official facts.',
      voters: 'all',
      question: 'Should ' + body + ' pass ' + what + '?',
      labels: { for: 'Vote yes', against: 'Vote no' },
      short: what,
      stand: { for: 'I support ' + what + '.', against: 'I oppose ' + what + '.' },
      also: { for: 'Please vote yes on ' + u.number + '.', against: 'Please vote no on ' + u.number + '.' },
      eitherLabel: 'The official record',
      topic: [what, u.number],
      asks: {
        for: ['Please vote yes on ' + what + '.', 'I ask you to support ' + u.number + ' when it comes up.', 'When ' + u.number + ' comes to the floor, I hope you will vote yes.'],
        forShort: ['Please vote yes on ' + u.number + '.', 'Pass ' + u.number + '.'],
        against: ['Please vote no on ' + what + '.', 'I ask you to oppose ' + u.number + ' when it comes up.', 'When ' + u.number + ' comes to the floor, I hope you will vote no.'],
        againstShort: ['Please vote no on ' + u.number + '.', 'Stop ' + u.number + '.']
      },
      subjects: { for: ['Please vote yes on ' + u.number, 'Yes on ' + u.number, 'From a constituent in {state}: ' + u.number], against: ['Please vote no on ' + u.number, 'No on ' + u.number, 'From a constituent in {state}: ' + u.number] },
      call: { for: 'I would like {S} to vote yes on ' + u.number + ', the ' + u.title + '.', against: 'I would like {S} to vote no on ' + u.number + ', the ' + u.title + '.' },
      facts: { for: [], against: [], either: either },
      views: { for: ['I think this bill will help people where I live.', 'This is a sensible step.', 'I want my view on the record before the vote.'],
        against: ['I do not think this bill is the right approach.', 'I have concerns about what this bill would do.', 'I want my view on the record before the vote.'] },
      sources: [gi, sched]
    };
  }

  // A date that is coming up, written about in your own words (no sides to pick).
  function dateIssue(u) {
    return { id: u.id, kind: 'date', own: true, chamber: 'both', when: u.when, states: [], committees: [], sponsors: [],
      menu: 'Coming up, ' + u.whenLabel + ': ' + cut(u.title, 100), topicText: cut(u.title.split(/\.\s/)[0].replace(/\.$/, ''), 120), note: u.title, noteSrc: u.src || [], noteMore: u.note || '' };
  }

  // Build the extra issues. Party dates (a party's own leader vote) are left out: those are listed issues with party rules.
  var votedBills = {};
  F.votes.forEach(function (v) { if (v.bill) { (votedBills[v.ch + v.bill] = votedBills[v.ch + v.bill] || []).push(v.date); } });
  F.votes.slice().sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : b.n - a.n; }).forEach(function (v) {
    if (dayDiff(today, v.date) <= 365) ISSUES.push(voteIssue(v));
  });
  F.upcoming.forEach(function (u) {
    if (u.kind === 'bill') {
      var voted = (votedBills[u.ch + u.bill] || []).some(function (d) { return d >= u.when; });
      if (voted) return;                                  // its roll call is under Previous votes now
      var past = dayDiff(today, u.when);
      if (past > 21) return;                              // three weeks after its date, it leaves the list
      var it = billIssue(u);
      if (past > 0) {
        it.recent = true;
        it.menu = 'Was set for a vote ' + u.whenLabel + ': ' + cut(it.title, 100);
        it.status = 'It was on ' + CH[u.ch] + ' schedule for ' + u.whenLabel + '. We found no recorded vote on it: it may have passed by voice vote, or it may not have come up yet.' + (u.page ? ' Check [our page for this bill](' + u.page + ') for its latest action.' : '');
      }
      ISSUES.push(it);
    } else if (u.kind === 'date') {
      if (/party vote/i.test(u.note || '')) return;
      if (dayDiff(today, u.when) > 0) return;
      ISSUES.push(dateIssue(u));
    }
    // Nominations on the schedule are voted on fast, so they show up under Previous votes once voted.
  });

  // Listed issues: committees, sponsors and "until".
  ISSUES.forEach(function (i) {
    var x = ISSUE_FIT[i.id];
    if (x) { i.committees = i.committees || x.committees; i.sponsors = i.sponsors || x.sponsors; if (x.follow) i.follow = x.follow; }
    if (!i.kind) i.kind = 'issue';
  });

  // ---- For the page ----
  function committeesOf(m) {
    return (F.member[m.id] || []).map(function (x) { return typeof x === 'string' ? { code: x, role: '' } : { code: x[0], role: x[1] }; })
      .filter(function (x) { return F.committees[x.code]; });
  }
  function shortCommittee(code) { return F.committees[code].name.replace(/^(House|Senate) (Permanent Select |Select |Special )?Committee on (the )?/, ''); }
  function party(i) { return i.voters === 'dem' ? 'dem' : i.voters === 'rep' ? 'rep' : ''; }
  function chamberOf(m) { return m.title ? 'house' : 'senate'; }
  // Does this issue belong on this member's list at all? Party votes go only to that party's caucus, in that chamber.
  function shows(i, m) {
    if (i.own && !i.kind) return true;
    if (!m) return true;
    var p = party(i);
    if (p) return (i.chamber || 'senate') === chamberOf(m) && (p === 'dem' ? !!m.dem : m.party === 'R');
    if (i.kind === 'vote') return castOf(VOTES[i.vote], m.id) !== null;  // they were in office for it
    return true;
  }
  function expired(i) { return !!(i.until && today > i.until); }
  // Tags for one member: their committee, their bill, their state, how they voted. Scope for the filter.
  function tags(i, m, stateCode) {
    var out = [], st = m ? m.st : stateCode;
    if (m) {
      var mine = committeesOf(m).map(function (x) { return x.code; });
      (i.committees || []).filter(function (k) { return mine.indexOf(k) >= 0; }).forEach(function (k) { out.push({ k: 'committee', text: 'Their committee: ' + shortCommittee(k) }); });
      if ((i.sponsors || []).indexOf(m.id) >= 0) out.push({ k: 'bill', text: 'Their bill' });
      if (i.kind === 'vote') {
        var cst = castOf(VOTES[i.vote], m.id);
        out.push({ k: 'cast', cast: cst, text: cst === 'Yea' ? 'They voted yes' : cst === 'Nay' ? 'They voted no' : cst === 'Present' ? 'They voted present' : 'They did not vote' });
      }
    }
    if (st && (i.states || []).indexOf(st) >= 0) out.push({ k: 'state', text: 'About ' + (F.states[st] ? F.states[st].name : st) });
    if (party(i)) out.push({ k: 'party', text: party(i) === 'dem' ? 'Democratic caucus vote' : 'Republican conference vote' });
    if (i.kind === 'bill' && !i.recent) out.push({ k: 'soon', text: 'Coming up' });
    if (i.kind === 'date') out.push({ k: 'soon', text: 'Coming up' });
    return out;
  }
  // The filters an item fits: a list of 'national', 'state' and 'local'. An issue can set its own "scope";
  // 'state' and 'local' then still need the member's state to be in its "states" when it lists any.
  function scope(i, m, stateCode) {
    var st = m ? m.st : stateCode;
    var here = st && (i.states || []).indexOf(st) >= 0;
    if (i.scope) {
      return [].concat(i.scope).filter(function (k) { return k === 'national' || !(i.states || []).length || here; });
    }
    return [here ? 'state' : 'national'];
  }
  function score(t) {
    return t.reduce(function (s, x) { return s + (x.k === 'bill' ? 5 : x.k === 'committee' ? 3 : x.k === 'state' ? 3 : x.k === 'soon' ? 2 : 0); }, 0);
  }

  // Search: words, bill numbers, and words that mean the same thing (topics.json).
  function norm(s) { return String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim(); }
  function textOf(i) {
    if (i._text) return i._text;
    var bits = [i.menu, i.title, i.short, (i.summary || []).join(' '), i.topicText, i.note, i.bill ? billLabel(i.bill) + ' ' + i.bill : '',
      (i.committees || []).map(function (k) { return F.committees[k] ? F.committees[k].name : ''; }).join(' ')];
    i._text = ' ' + norm(bits.join(' ')).replace(/\b(h r|s) (\d+)/g, '$1$2 $1 $2') + ' ';
    return i._text;
  }
  function expand(q) {
    var nq = norm(q), words = nq.split(' ').filter(function (w) { return w.length > 1 || /\d/.test(w); }), groups = [];
    F.topics.forEach(function (g) {
      var hit = g.words.some(function (w) { var nw = norm(w); return (' ' + nq + ' ').indexOf(' ' + nw + ' ') >= 0 || (nw.length >= 4 && words.some(function (x) { return x.length >= 3 && nw.indexOf(x) === 0; })); });
      if (hit) groups.push(g);
    });
    return { words: words, groups: groups };
  }
  function has(text, w) { return w.length <= 3 ? text.indexOf(' ' + w + ' ') >= 0 : text.indexOf(' ' + w) >= 0; }
  function search(q, list) {
    var e = expand(q);
    if (!e.words.length) return { items: [], groups: [] };
    var out = [];
    list.forEach(function (i) {
      var t = textOf(i), s = 0;
      e.words.forEach(function (w) { if (has(t, w)) s += 3; });
      e.groups.forEach(function (g) { if (g.words.some(function (w) { return has(t, norm(w)); })) s += 2; });
      if (s) out.push({ i: i, s: s });
    });
    out.sort(function (a, b) { return b.s - a.s; });
    return { items: out.map(function (x) { return x.i; }), groups: e.groups };
  }

  window.CSFit = {
    today: today, dateLabel: dateLabel, dayDiff: dayDiff, votes: VOTES, castOf: castOf, committeesOf: committeesOf, shortCommittee: shortCommittee,
    shows: shows, expired: expired, tags: tags, scope: scope, score: score, search: search, states: F.states, checked: F.checked
  };
})();
