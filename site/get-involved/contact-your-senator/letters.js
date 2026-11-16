/* Letter writer for the Contact Your Senator and Contact Your Representative pages.
   Works for any issue in issues.js. Everything runs in the browser.
   Nothing is saved or sent. Facts and sources live in issues.js. */
(function () {
  'use strict';
  // The House page loads representatives.js only, so either data file may be the one here.
  var D = window.SENATE_CONTACTS || window.HOUSE_CONTACTS || { states: {} };
  var VOTES = {};
  (D.votes || []).forEach(function (v) { VOTES[v.id] = v; });

  function pick(a) { return a[Math.floor(Math.random() * a.length)]; }
  function chance(p) { return Math.random() < p; }
  function shuffle(a) {
    a = a.slice();
    for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }
  function clean(parts) { return parts.filter(function (p) { return p && String(p).trim(); }); }
  function para(parts) { return clean(parts).join(' '); }
  function join(paras) { return clean(paras).join('\n\n'); }
  function fill(s, c) { return String(s).replace(/\{(\w+)\}/g, function (_, k) { return c[k] != null ? c[k] : ''; }); }

  var SRC = {
    'TIME, Nov 13, 2026': { name: 'TIME', date: 'November 13', url: 'https://time.com/article/2026/11/13/chris-van-hollen-senate-majority-leader-chuck-schumer-progressive-democrats/' },
    'Al Jazeera, Nov 5, 2026': { name: 'Al Jazeera', date: 'November 5', url: 'https://www.aljazeera.com/amp/news/2026/11/5/division-among-us-democrats-over-schumers-leadership-role' }
  };

  /* Optional "about you" lines. Only used when the writer picks one. */
  var WHO = {
    veteran: ['As a veteran, I care a great deal about what happens in Washington.', 'I served in the military, and I take this seriously.', 'I am a veteran, and I pay close attention to how {body} votes.'],
    parent: ['As a parent, I think about the country my kids will grow up in.', 'I am a parent, and I want leaders who think about the next generation.', 'I have kids at home, and I pay attention to decisions made for them.'],
    business: ['I run a small business in {town}.', 'As a small business owner, I watch closely what {body} does.', 'I own a small business, and what {body} does reaches my bottom line.'],
    retiree: ['I am retired, and I have voted in a lot of elections.', 'As a retiree, I have seen a lot of Congresses come and go.', 'I am retired and follow {body} closely.'],
    student: ['I am a student, and this is the future I will live in.', 'As a student, I am paying close attention.', 'I am a student, and I care about where the country goes next.'],
    teacher: ['I am a teacher, and I teach my students that leaders answer to the people.', 'As a teacher, I care about what kind of country my students inherit.', 'I teach school, and I follow what happens in {body}.'],
    health: ['I work in health care, and I see every day how decisions in Congress reach real people.', 'As a nurse and health worker, I care about what {body} does.', 'I work in health care in {state}.'],
    farmer: ['I farm and ranch in {state}, and Washington decisions reach us fast.', 'As a farmer, I care about what {body} does.', 'I work the land here in {state}.'],
    union: ['I am a union member, and I care about who speaks for working people.', 'As a union member, I follow how {body} votes.', 'I belong to a union here in {state}.'],
    worker: ['I work hard for a living, and I want leaders who remember people like me.', 'I am a working person in {state}.', 'I punch a clock like a lot of people in {state}.'],
    firstvote: ['I am a new voter, and this is one of my first letters to {aone}.', 'I just started voting, and I want my voice heard.', 'I am new to voting, and I want to be part of this decision.']
  };

  var REASON_LEAD = ['In my own words:', 'Here is why this matters to me:', 'My reasons:', 'What I want you to know:', 'Why I feel this way:', 'This is what I think:', ''];

  function ctx(issue, sen, stance, opts) {
    var c = {
      issue: issue, sen: sen, stance: stance, pro: stance === 'for',
      special: (issue.special || {})[sen.id] || null,
      T: sen.title || 'Senator', S: (sen.title || 'Senator') + ' ' + sen.last, full: (sen.title || 'Senator') + ' ' + sen.name, last: sen.last,
      body: sen.title ? 'the House' : 'the Senate', aone: sen.title ? 'a member of Congress' : 'a senator',
      state: sen.stateName || (D.states || {})[sen.st], since: sen.since,
      name: (opts.name || '').trim() || '[Your name]',
      town: (opts.town || '').trim() || '[your town]',
      reasons: (opts.reasons || '').replace(/\r/g, '').trim(),
      who: opts.who || '',
      record: opts.record !== false
    };
    c.self = !!issue.subject && sen.id === issue.subject;
    c.facts = chosenFacts(issue, stance, opts.facts);
    c.views = opts.views ? opts.views.slice() : issue.views[stance].slice(0, 1);
    c.Town = c.town.charAt(0) === '[' ? '[Your town]' : c.town;
    c.topic = pick(issue.topic);
    return c;
  }

  function ask(c, size) {
    var src = c.special || c.issue.asks;
    var key = c.stance + (size === 'short' ? 'Short' : '');
    return fill(pick(src[key] || c.issue.asks[key]), c);
  }
  /* Facts the reader checked. Each one goes into the letter with its source (outlet, date, link). */
  function factPool(issue, stance) { return (issue.facts[stance] || []).concat(issue.facts.either || []); }
  function defaultFacts(issue, stance) { return factPool(issue, stance).filter(function (f) { return f.on; }).map(function (f) { return f.id; }); }
  function chosenFacts(issue, stance, ids) {
    if (!ids) ids = defaultFacts(issue, stance);
    var want = {};
    ids.forEach(function (id) { want[id] = true; });
    return factPool(issue, stance).filter(function (f) { return want[f.id]; });
  }
  function citeText(cites) {
    return (cites || []).map(function (s) { return s.src + ', ' + s.date + ', ' + s.url; }).join('; ');
  }
  function cite(cites) { var t = citeText(cites); return t ? ' (Source: ' + t + ')' : ''; }
  function factText(c, f) { return fill(c.self && f.you ? f.you : f.text, c) + cite(f.cite); }
  /* Every checked fact, in a new order each time. */
  function factSet(c) { return shuffle(c.facts).map(function (f) { return factText(c, f); }); }
  /* The checked facts as a block: each on its own line, after an optional lead line. */
  function factsBlock(c, leads, style) {
    var f = factSet(c);
    if (!f.length) return '';
    var lines = f.map(function (x, i) { return style === 'dash' ? '- ' + x : style === 'list' ? (i + 1) + '. ' + x : x; });
    var lead = pick(leads || ['']);
    return (lead ? lead + '\n' : '') + lines.join(style === 'plain' || !style ? '\n\n' : '\n');
  }
  /* Reasons the reader checked (opinions, in the writer's voice). */
  function view(c, n) { return shuffle(c.views).slice(0, n || c.views.length).map(function (x) { return fill(x, c); }); }
  function viewLine(c, n) { return view(c, n).join(' '); }
  function whoLine(c) { return c.who && WHO[c.who] ? fill(pick(WHO[c.who]), c) : ''; }
  function reasonsBlock(c, lead) {
    if (!c.reasons) return '';
    var l = lead == null ? pick(REASON_LEAD) : lead;
    return l ? l + '\n' + c.reasons : c.reasons;
  }
  function reasonLines(c) {
    if (!c.reasons) return [];
    return c.reasons.split(/\n+/).map(function (s) { return s.replace(/^[-*•\d.)\s]+/, '').trim(); }).filter(Boolean);
  }
  function sign(c, words) { return (c.alsoText ? c.alsoText + '\n\n' : '') + words + '\n' + c.name + '\n' + c.Town + ', ' + c.state; }

  /* More than one issue in one letter (Frank, Nov 16 2026). The letter is built for the main issue as before; each other
     issue the reader picked (any side, any mix, Senate or House) adds a short part before the closing: where they stand,
     the ask when this member votes on it, and the checked facts with their sources. When the member does not vote on it
     (the other chamber, or a party vote they are not part of), the part says where the reader stands and asks for no vote. */
  function issueById(id) { return (window.CS_ISSUES || []).filter(function (i) { return i.id === id; })[0] || null; }
  function chamberOf(sen) { return sen.title ? 'house' : 'senate'; }
  function votesOn(issue, sen) { return (issue.chamber || 'senate') === chamberOf(sen) && canVote(issue, sen); }
  /* The other issues as [{ issue, c, votes, line }]. A member the issue is about, or a candidate in it, gets where the
     reader stands instead of an ask. */
  function alsoList(main, sen, opts) {
    return (opts.also || []).map(function (a) {
      var x = issueById(a.id);
      if (!x || x.id === main.id || (a.stance !== 'for' && a.stance !== 'against')) return null;
      var c = ctx(x, sen, a.stance, { facts: a.facts, views: [], name: opts.name, town: opts.town });
      var votes = votesOn(x, sen) && !(x.special || {})[sen.id];
      return { issue: x, c: c, votes: votes, line: votes ? x.also[a.stance] : x.stand[a.stance] };
    }).filter(Boolean);
  }
  var ALSO_LEAD = ['I also want you to know where I stand on {short}.', 'One more thing, on {short}.', 'I am also writing about {short}.', 'On {short}:'];
  var NOT_YOURS = ['I know this is not your vote, but I wanted you to hear where I stand.', 'You do not vote on this one, but I want my view on the record with your office.',
    'This is not a vote you cast, but I wanted you to know how people back home see it.'];
  function alsoText(list) {
    return join(list.map(function (a) {
      var head = para([fill(pick(ALSO_LEAD), { short: a.issue.short }), a.line, a.votes ? '' : pick(NOT_YOURS)]);
      var facts = a.c.facts.map(function (f) { return '- ' + factText(a.c, f); });
      return head + (facts.length ? '\n' + facts.join('\n') : '');
    }));
  }
  function constituent(c) {
    return pick(['I live in ' + c.town + ', ' + c.state + '.', 'I am your constituent in ' + c.town + '.',
      'I am writing from ' + c.town + ', ' + c.state + '.', 'I am one of the people you represent, from ' + c.town + '.']);
  }
  function sinceLine(c) {
    if (c.special || !c.since) return '';
    return pick(['Thank you for serving ' + c.state + ' in ' + c.body + ' since ' + c.since + '.',
      'You have represented ' + c.state + ' since ' + c.since + ', and I appreciate your work.',
      'I have followed your work for ' + c.state + ' since you joined ' + c.body + ' in ' + c.since + '.']);
  }

  /* What a senator has said in public on this issue, when a source reported it. */
  function stanceLine(c) {
    if (!c.issue.reported) return '';
    var s = c.sen.stance;
    if (!s || s[0] !== 'backs') return '';
    var src = SRC[s[1]];
    if (!src) return '';
    return pick(c.pro ? [
      src.name + ' reported on ' + src.date + ' that you back Senator Schumer (' + src.url + '). Thank you for that.',
      'I saw that you have said you support Senator Schumer (Source: ' + src.name + ', ' + src.date + ', ' + src.url + '). I agree with you.'
    ] : [
      src.name + ' reported on ' + src.date + ' that you back Senator Schumer (' + src.url + '). I ask you to think again before the vote.',
      'I know you have said you support Senator Schumer (Source: ' + src.name + ', ' + src.date + ', ' + src.url + '). I hope you will keep an open mind until December 1.'
    ]);
  }

  /* The senator's own record. */
  var castCache = {};
  function castFor(issue, sen) {
    var r = issue.record;
    if (!r || r.type !== 'rollcall') return null;
    if (!castCache[issue.id]) {
      var map = {};
      var names = { Yea: r.yea, Nay: r.nay, NV: r.nv };
      Object.keys(names).forEach(function (k) {
        (names[k] || '').split(',').filter(Boolean).forEach(function (n) { map[n.trim()] = k; });
      });
      castCache[issue.id] = map;
    }
    var m = castCache[issue.id];
    return m[sen.last + '-' + sen.st] || m[sen.last] || r.rest || null;
  }
  function recordLine(c) {
    var r = c.issue.record;
    if (!r || !c.record) return '';
    if (r.type === 'rollcall') {
      var cast = castFor(c.issue, c.sen);
      if (!cast) return '';
      var data = { what: r.what, date: r.date };
      var src = ' (Source: Senate roll call, ' + r.date + ', ' + r.url + ')';
      if (cast === 'NV') return r.lines.nv ? fill(r.lines.nv, data) + src : '';
      return fill(pick(r.lines[c.stance][cast]), data) + src;
    }
    if (r.type === 'breaks') return breaksLine(c);
    return '';
  }
  function breaksLine(c) {
    var b = c.sen.breaks;
    if (!b) return '';
    /* A letter to the person the vote is about uses only the votes the reader checked. */
    if (c.self) return '';
    if (!b.length) {
      return pick(['On nine key Senate votes from 2025 and 2026, you voted with most Democratic senators each time.',
        'I looked at your record on nine key votes from 2025 and 2026. You voted with most Democratic senators on all of them.']) +
        ' (Source: Senate roll call votes, senate.gov, https://www.senate.gov/legislative/votes_new.htm)' + ' ' +
        pick(c.pro ? ['I hope you stay with the caucus on this one too.', 'You know the caucus well, and I trust you to keep it steady.'] :
          ['I hope you will help the caucus choose its next leader with the same care.', 'You know this caucus well. I hope you choose what is best for its future.']);
    }
    /* Only votes where the caucus split was clear (the other side had under 40 percent). */
    var clear = b.filter(function (x) { var w = VOTES[x.v]; var lo = Math.min(w.yes, w.no); return lo / (w.yes + w.no) < 0.4; });
    if (!clear.length) return '';
    var x = pick(clear), v = VOTES[x.v];
    var mine = x.cast === 'Yea' ? 'yes' : 'no', most = v.most === 'Yea' ? 'yes' : 'no';
    var lines = [
      'On ' + v.date + ', you voted ' + mine + ' on ' + v.what + ', when most Democratic senators voted ' + most + '.',
      'I noticed that on ' + v.date + ' you voted ' + mine + ' on ' + v.what + '. Most Democratic senators voted ' + most + '.',
      'Your record shows independence. On ' + v.date + ', you voted ' + mine + ' on ' + v.what + ', while most of your Democratic colleagues voted ' + most + '.'
    ];
    var line = pick(lines) + ' (Source: Senate roll call, ' + v.date + ', ' + v.url + ')';
    return line + ' ' + pick(['That tells me you make up your own mind.', 'I respect that you vote your own judgment.',
      'I hope you bring that same independence to this vote.']);
  }

  function civicLine(c) {
    return pick((c.issue.civic || []).concat(['Letters like this are how people back home take part, and I want my view on the record with your office.']));
  }

  /* Voices. Each one builds a letter with its own shape. */
  var VOICES = [
    { key: 'formal', label: 'Formal', build: function (c) {
      return join([
        pick(['Dear ' + c.full + ',', 'Dear ' + c.S + ':', 'The Honorable ' + c.sen.name + ',']),
        para([pick(['I am writing as a constituent from ' + c.town + ', ' + c.state + '.', 'I write to you as a resident of ' + c.town + ', ' + c.state + '.']), whoLine(c), ask(c)]),
        stanceLine(c),
        factsBlock(c, ['I ask you to consider the following.', 'The record supports my view:', 'Please consider these facts.', '']),
        recordLine(c),
        reasonsBlock(c),
        para([viewLine(c), pick(['I appreciate your attention to this matter.', 'Thank you for considering my view.', 'Thank you for your time and your service.'])]),
        sign(c, pick(['Respectfully,', 'Sincerely,', 'Respectfully yours,']))
      ]);
    } },
    { key: 'short', label: 'Short and plain', build: function (c) {
      return join([
        pick([c.S + ',', 'Dear ' + c.S + ',', 'Hello ' + c.S + ',']),
        para([constituent(c), ask(c, 'short'), viewLine(c)]),
        factsBlock(c, ['Why:', 'A few facts:', 'For the record:'], 'dash'),
        c.reasons,
        sign(c, pick(['Thank you,', 'Thanks,', 'Best,']))
      ]);
    } },
    { key: 'warm', label: 'Warm and personal', build: function (c) {
      return join([
        pick(['Hi ' + c.S + ',', 'Hello ' + c.S + ',', 'Dear ' + c.S + ',']),
        para([c.name.charAt(0) === '[' ? 'I live in ' + c.town + ', ' + c.state + '.' : 'My name is ' + c.name + ', and I live in ' + c.town + '.', whoLine(c), sinceLine(c)]),
        para([pick(['I wanted to reach out about ' + c.topic + '.', 'I have been thinking a lot about ' + c.topic + ', and I wanted you to hear from me.', 'I am writing about something I care about: ' + c.topic + '.']), ask(c)]),
        reasonsBlock(c, pick(['Here is what is on my mind:', 'This is where I am coming from:', ''])),
        para([stanceLine(c), viewLine(c)]),
        factsBlock(c, ['A few things I read that stuck with me:', 'Here is some of what I have read:', 'Some of what shaped my view:']),
        pick(['Thank you for reading this. I know your office hears from a lot of people.', 'Thanks for listening. It means a lot to know my voice gets to you.', 'I appreciate you, and I appreciate you reading this.']),
        sign(c, pick(['Warmly,', 'All the best,', 'With thanks,']))
      ]);
    } },
    { key: 'points', label: 'Point by point', build: function (c) {
      var items = factSet(c).concat(view(c));
      reasonLines(c).forEach(function (r) { items.push(r); });
      var rec = recordLine(c);
      if (rec) items.push(rec);
      var list = items.map(function (x, i) { return (i + 1) + '. ' + x; }).join('\n');
      return join([
        pick(['Dear ' + c.S + ',', c.S + ',']),
        para([constituent(c), whoLine(c), pick(['Here is why I am writing about ' + c.topic + ':', 'My reasons, point by point:', 'Here is my case, in short:'])]),
        list,
        para([pick(['So my ask is this:', 'My request:', 'Bottom line:']), ask(c)]),
        sign(c, pick(['Thank you,', 'Sincerely,', 'Regards,']))
      ]);
    } },
    { key: 'numbers', label: 'Facts first', build: function (c) {
      return join([
        pick(['Dear ' + c.S + ',', c.full + ',']),
        factsBlock(c, ['I want to start with the facts.', 'A few facts first.', 'Let me lead with what the record shows.']),
        recordLine(c),
        para([constituent(c), ask(c)]),
        viewLine(c),
        reasonsBlock(c),
        sign(c, pick(['Sincerely,', 'Thank you,', 'Respectfully,']))
      ]);
    } },
    { key: 'questions', label: 'Asking questions', build: function (c) {
      return join([
        pick(['Dear ' + c.S + ',', c.S + ',', 'Hello ' + c.S + ',']),
        para([constituent(c), whoLine(c), pick(['I have a few questions I hope you will think about.', 'Before this vote, I want to ask you a few things.'])]),
        shuffle(c.issue.questions[c.stance]).slice(0, 2).join('\n'),
        para([pick(['For me, the answer is clear.', 'I have thought about these, and here is where I land.', 'My own answer is simple.']), ask(c)]),
        reasonsBlock(c),
        factsBlock(c, ['What I base that on:', 'Here is what I have read:', '']),
        viewLine(c),
        sign(c, pick(['Thank you,', 'Best regards,', 'Sincerely,']))
      ]);
    } },
    { key: 'balanced', label: 'Thoughtful, both sides', build: function (c) {
      return join([
        pick(['Dear ' + c.S + ',', 'Dear ' + c.full + ',']),
        para([constituent(c), whoLine(c), pick(['I know good people disagree about ' + c.topic + '.', 'I have tried to look at ' + c.topic + ' from both sides.', 'This is not a simple question, and I do not think it should be treated like one.'])]),
        para([fill(c.issue.otherSide[c.stance], c), pick(['Still, I come down on one side.', 'After thinking it over, here is where I stand.', 'But on balance, my view is this.']), ask(c)]),
        factsBlock(c, ['What tipped it for me:', 'These facts weigh most with me:', '']),
        viewLine(c),
        reasonsBlock(c),
        recordLine(c),
        pick(['Whatever you decide, thank you for weighing it carefully.', 'I trust you to weigh this seriously.', 'Thank you for hearing me out.']),
        sign(c, pick(['Respectfully,', 'Sincerely,', 'With respect,']))
      ]);
    } },
    { key: 'forward', label: 'Looking ahead', build: function (c) {
      return join([
        pick(['Dear ' + c.S + ',', c.S + ',']),
        para([pick(['The next two years matter a great deal.', 'I am thinking about what comes next.', 'What ' + c.body + ' does now will shape the years ahead.']), constituent(c), whoLine(c)]),
        para([ask(c), viewLine(c)]),
        stanceLine(c),
        factsBlock(c, ['Here is what I am looking at:', 'What I have read so far:', '']),
        reasonsBlock(c, pick(['What I hope for:', 'What matters to me going forward:', ''])),
        pick(['I am hopeful about what ' + c.body + ' can do next.', 'I look forward to seeing what you do with this moment.', 'Thank you for helping shape what comes next.']),
        sign(c, pick(['Hopefully,', 'Thank you,', 'Best,']))
      ]);
    } },
    { key: 'note', label: 'Quick note', build: function (c) {
      return join([
        pick([c.S + ',', 'Dear ' + c.S + ',']),
        para([ask(c, 'short'), pick(['That is my view as your constituent in ' + c.town + '.', 'I live in ' + c.state + ' and wanted you to know.', 'Just wanted you to hear it from someone in ' + c.state + '.'])]),
        factsBlock(c, ['Why:', 'In short:', ''], 'dash'),
        c.reasons,
        sign(c, pick(['Thanks,', 'Thank you,']))
      ]);
    } },
    { key: 'civic', label: 'Civic minded', build: function (c) {
      return join([
        pick(['Dear ' + c.S + ',', 'Dear ' + c.full + ',']),
        para([constituent(c), whoLine(c), fill(civicLine(c), c)]),
        ask(c),
        para([sinceLine(c), stanceLine(c)]),
        factsBlock(c, ['I have looked at the record, and here is what I found:', 'These facts are part of the public record:', '']),
        viewLine(c),
        reasonsBlock(c),
        pick(['Thank you for taking the views of the people you represent into account.', 'Please carry the views of people in ' + c.state + ' with you into that vote.', 'Thank you for listening to the people you represent.']),
        sign(c, pick(['Sincerely,', 'Respectfully,', 'Thank you,']))
      ]);
    } },
    { key: 'plainspoken', label: 'Plain talk', build: function (c) {
      return join([
        pick([c.S + ',', 'Hello ' + c.S + ',']),
        para([pick(['I will keep this simple.', 'I will get right to it.', 'Straight to the point.']), ask(c)]),
        para([whoLine(c), viewLine(c), pick(['That is how I see it.', 'Simple as that.', ''])]),
        factsBlock(c, ['The facts:', 'Here is what I am going on:', ''], 'dash'),
        reasonsBlock(c, pick(['Here is why:', 'Why:', ''])),
        recordLine(c),
        pick(['Appreciate you reading this.', 'Thanks for your time.', 'Thanks for hearing me out.']),
        sign(c, pick(['Thanks,', 'Take care,', 'Best,']))
      ]);
    } }
  ];

  function subject(c) {
    var s = (c.special && c.special.subject) || c.issue.subjects;
    return fill(pick(s[c.stance]), c);
  }
  function tidy(s) {
    return s.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').replace(/ {2,}/g, ' ').replace(/ ([.,])/g, '$1').trim() + '\n';
  }

  function build(issue, sen, stance, opts, lastVoice) {
    opts = opts || {};
    var c = ctx(issue, sen, stance, opts);
    var also = alsoList(issue, sen, opts);
    c.alsoText = alsoText(also);
    var v;
    if (opts.voice) v = VOICES.filter(function (x) { return x.key === opts.voice; })[0];
    if (!v) v = pick(VOICES.filter(function (x) { return x.key !== lastVoice; }));
    var subj = subject(c);
    if (also.length) subj += ' (and my view on ' + also.map(function (a) { return a.issue.short; }).join(' and ') + ')';
    return { voice: v.key, label: v.label, subject: subj, body: tidy(v.build(c)), also: also.length };
  }

  /* Phone version: the same choices as the letter, made short enough to say out loud.
     points: what to say if a person answers. voicemail: a short script to read if no one does.
     Each point keeps its source (outlet and date, no link) in case the office asks; the voicemail is read out, so it leaves them off. */
  function spoken(f) {
    var s = (f.cite || [])[0];
    return s ? ' (' + s.src + ', ' + s.date + ')' : '';
  }
  /* The senator's own roll call vote, said about them (the caller is talking to their staff). */
  function phoneRecord(c) {
    var r = c.issue.record;
    if (!r || r.type !== 'rollcall' || !c.record || c.self) return '';
    var cast = castFor(c.issue, c.sen);
    if (cast !== 'Yea' && cast !== 'Nay') return '';
    return c.S + ' voted ' + (cast === 'Yea' ? 'yes' : 'no') + ' on ' + r.what + ' on ' + r.date + ' (Senate roll call).';
  }
  function callBuild(issue, sen, stance, opts) {
    opts = opts || {};
    var c = ctx(issue, sen, stance, opts);
    var want = fill(((c.special && c.special.call) || issue.call)[stance], c);
    var me = c.name.charAt(0) === '[' ? '[Your name]' : c.name;
    var hello = 'Hello, my name is ' + me + ', and I am a constituent from ' + c.town + ', ' + c.state + '.';
    var facts = c.facts.map(function (f) { return fill(f.text, c) + spoken(f); });
    var views = c.views.map(function (x) { return fill(x, c); });
    var own = reasonLines(c);
    var rec = phoneRecord(c);
    var also = alsoList(issue, sen, opts);
    var more = [];
    also.forEach(function (a) {
      more.push('Also, on ' + a.issue.short + ': ' + a.line + (a.votes ? '' : ' I know this is not ' + c.S + "'s vote, but I want my view on record."));
      a.c.facts.forEach(function (f) { more.push(fill(f.text, a.c) + spoken(f)); });
    });
    var points = clean([hello + (c.who && WHO[c.who] ? ' ' + whoLine(c) : ''), 'My ask: ' + want]
      .concat(facts, rec ? [rec] : [], views, own, more, ['Thank you. Could you please pass my view on to ' + c.S + '?']));
    /* Voicemail: who you are, the ask, one or two key points, thank you. */
    var key = c.facts.slice(0, 2).map(function (f) { return fill(f.text, c); });
    if (!key.length) key = own.slice(0, 1).concat(views).slice(0, 2);
    var voicemail = para([hello, whoLine(c), 'I am calling about ' + c.topic + '.', want].concat(key,
      also.map(function (a) { return 'Also, on ' + a.issue.short + ': ' + a.line; }), [
      'My ZIP code is [your ZIP code].', 'Thank you for passing my message on to ' + c.S + '.']));
    return { points: points, voicemail: tidy(voicemail).trim(), want: want };
  }
  /* The short script in the letter section is the same voicemail. */
  function callScript(issue, sen, stance, opts) { return callBuild(issue, sen, stance, opts).voicemail; }

  /* "Your own words" (D286): the reader's own issue, typed as a list or rough notes, cleaned by own.js.
     opts: topic, notes, ask, angry (the "Pissed off" version), name, town, who, also (other issues, as above).
     opts.aiText, when set, is a rewrite from The Way's own AI computer and replaces the cleaned notes. */
  function lowerStart(t) {
    var w = (t.match(/^[A-Za-z']+/) || [''])[0];
    return w && !/^[A-Za-z']+\s+[A-Z]/.test(t) && w !== w.toUpperCase() && w.slice(1) === w.slice(1).toLowerCase() && window.CSOwn && window.CSOwn.isWord(w.toLowerCase()) ? t.charAt(0).toLowerCase() + t.slice(1) : t;
  }
  function ownCtx(sen, opts) {
    var O = window.CSOwn, angry = !!opts.angry;
    var notes = O.tidyNotes(opts.notes || '', angry), topic = O.tidyLine(opts.topic || '', angry), want = O.tidyLine(opts.ask || '', angry);
    var t = topic.text ? lowerStart(topic.text) : '';
    var fake = { id: 'own', own: true, facts: { for: [], against: [], either: [] }, views: { for: [], against: [] }, topic: [t || 'an issue that matters to me'], special: {} };
    var c = ctx(fake, sen, 'for', { facts: [], views: [], name: opts.name, town: opts.town, who: opts.who });
    c.angry = angry; c.t = t; c.want = want.text; c.points = notes.points;
    c.ai = String(opts.aiText || '').replace(/\r/g, '').trim();
    var seen = {};
    c.changes = topic.changes.concat(notes.changes, want.changes).filter(function (x) { var k = x[0] + '>' + x[1]; return seen[k] ? false : (seen[k] = 1); });
    c.alsoItems = alsoList(fake, sen, opts);
    c.alsoText = alsoText(c.alsoItems);
    return c;
  }
  function ownIntro(c) {
    if (c.angry) return c.t ? pick(['I am angry about ' + c.t + ', and I want you to know it.', 'I am writing because I am fed up with ' + c.t + '.', 'I am furious about ' + c.t + '.'])
      : pick(['I am angry, and I want you to know why.', 'I am fed up, and I am writing to tell you why.']);
    return c.t ? pick(['I am writing about ' + c.t + '.', 'I want to share my concerns about ' + c.t + '.', 'I am writing to you about ' + c.t + '.'])
      : pick(['I am writing about something that matters to me.', 'I want to share a concern with you.']);
  }
  function ownAsk(c) {
    if (c.want) return pick(['What I am asking: ' + c.want + '.', 'Here is what I ' + (c.angry ? 'expect' : 'ask') + ': ' + c.want + '.']);
    return c.angry ? pick(['I expect you to do something about this.', 'I want to know what you are going to do about it.', 'I expect action, not excuses.'])
      : pick(['I would like to know where you stand on this and what you plan to do.', 'Please tell me where you stand and what you will do about it.']);
  }
  function ownPoints(c) {
    if (c.ai) return c.ai;
    if (!c.points.length) return '';
    if (c.points.length >= 3 || chance(0.4)) return pick(c.angry ? ['Here is what I am angry about:', 'Here is why:', 'This is what I am seeing:'] : ['Here are my concerns:', 'What concerns me:', 'Here is why:']) +
      '\n' + c.points.map(function (p) { return '- ' + p; }).join('\n');
    return c.points.join(' ');
  }
  function buildOwn(sen, opts) {
    opts = opts || {};
    var c = ownCtx(sen, opts);
    var body = join([
      pick(c.angry ? ['Dear ' + c.S + ',', c.S + ','] : ['Dear ' + c.S + ',', 'Dear ' + c.full + ',', 'Hello ' + c.S + ',']),
      para([constituent(c), whoLine(c), ownIntro(c)]),
      ownPoints(c),
      ownAsk(c),
      c.angry ? pick(['This is unacceptable, and I expect better from the people who represent me.', 'I am paying attention to what you do next.', 'People here are angry, and we are watching how you respond.'])
        : pick(['Thank you for your time.', 'Thank you for reading this.', 'I appreciate your attention to this.']),
      sign(c, pick(c.angry ? ['Sincerely,', 'Waiting for your answer,', 'Respectfully,'] : ['Sincerely,', 'Thank you,', 'Respectfully,']))
    ]);
    var subj = c.t ? (c.angry ? 'Angry about ' : 'About ') + c.t : (c.angry ? 'An angry constituent in ' : 'A message from a constituent in ') + c.state;
    if (c.alsoItems.length) subj += ' (and my view on ' + c.alsoItems.map(function (a) { return a.issue.short; }).join(' and ') + ')';
    return { voice: c.angry ? 'angry' : 'own', label: c.angry ? 'Pissed off, cleaned up' : 'Your own words', subject: subj.charAt(0).toUpperCase() + subj.slice(1), body: tidy(body), changes: c.changes, also: c.alsoItems.length };
  }
  function callOwn(sen, opts) {
    opts = opts || {};
    var c = ownCtx(sen, opts);
    var me = c.name.charAt(0) === '[' ? '[Your name]' : c.name;
    var hello = 'Hello, my name is ' + me + ', and I am a constituent from ' + c.town + ', ' + c.state + '.';
    var about = c.angry ? (c.t ? 'I am calling because I am angry about ' + c.t + '.' : 'I am calling because I am angry, and I want ' + c.S + ' to know it.')
      : (c.t ? 'I am calling about ' + c.t + '.' : 'I am calling about something that matters to me.');
    var want = c.want ? (c.angry ? 'I expect ' + c.S + ' to act: ' : 'I would like ' + c.S + ' to act: ') + c.want + '.'
      : (c.angry ? 'I expect ' + c.S + ' to do something about this.' : 'I would like to know where ' + c.S + ' stands on this.');
    var mine = c.ai ? c.ai.split(/\n+/).map(function (x) { return x.replace(/^[-*]\s*/, '').trim(); }).filter(Boolean) : c.points;
    var more = [];
    c.alsoItems.forEach(function (a) {
      more.push('Also, on ' + a.issue.short + ': ' + a.line + (a.votes ? '' : ' I know this is not ' + c.S + "'s vote, but I want my view on record."));
      a.c.facts.forEach(function (f) { more.push(fill(f.text, a.c) + spoken(f)); });
    });
    var points = clean([hello + (c.who && WHO[c.who] ? ' ' + whoLine(c) : ''), about].concat(mine, ['My ask: ' + want], more, ['Thank you. Could you please pass my message on to ' + c.S + '?']));
    var voicemail = para([hello, whoLine(c), about].concat(mine.slice(0, 2), [want],
      c.alsoItems.map(function (a) { return 'Also, on ' + a.issue.short + ': ' + a.line; }),
      ['My ZIP code is [your ZIP code].', 'Thank you for passing my message on to ' + c.S + '.']));
    return { points: points, voicemail: tidy(voicemail).trim(), want: want, changes: c.changes };
  }

  function canVote(issue, sen) { return issue.voters === 'all' || (issue.voters === 'dem' && sen.dem); }

  window.CSLetters = {
    build: build,
    callBuild: callBuild,
    callScript: callScript,
    buildOwn: buildOwn,
    callOwn: callOwn,
    canVote: canVote,
    votesOn: votesOn,
    castFor: castFor,
    defaultFacts: defaultFacts,
    factPool: factPool,
    citeText: citeText,
    voices: VOICES.map(function (v) { return { key: v.key, label: v.label }; })
  };
})();
