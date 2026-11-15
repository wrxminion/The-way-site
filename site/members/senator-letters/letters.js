/* Letter writer for the Contact Your Senator page.
   Works for any issue in issues.js. Everything runs in the browser.
   Nothing is saved or sent. Facts and sources live in issues.js. */
(function () {
  'use strict';
  var D = window.SENATE_CONTACTS;
  var VOTES = {};
  D.votes.forEach(function (v) { VOTES[v.id] = v; });

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
    'TIME, Nov 13, 2026': { name: 'TIME', date: 'November 13' },
    'Al Jazeera, Nov 5, 2026': { name: 'Al Jazeera', date: 'November 5' }
  };

  /* Optional "about you" lines. Only used when the writer picks one. */
  var WHO = {
    veteran: ['As a veteran, I care a great deal about what happens in Washington.', 'I served in the military, and I take this seriously.', 'I am a veteran, and I pay close attention to how the Senate votes.'],
    parent: ['As a parent, I think about the country my kids will grow up in.', 'I am a parent, and I want leaders who think about the next generation.', 'I have kids at home, and I pay attention to decisions made for them.'],
    business: ['I run a small business in {town}.', 'As a small business owner, I watch closely what the Senate does.', 'I own a small business, and what the Senate does reaches my bottom line.'],
    retiree: ['I am retired, and I have voted in a lot of elections.', 'As a retiree, I have seen a lot of Senates come and go.', 'I am retired and follow the Senate closely.'],
    student: ['I am a student, and this is the future I will live in.', 'As a student, I am paying close attention.', 'I am a student, and I care about where the country goes next.'],
    teacher: ['I am a teacher, and I teach my students that leaders answer to the people.', 'As a teacher, I care about what kind of country my students inherit.', 'I teach school, and I follow what happens in the Senate.'],
    health: ['I work in health care, and I see every day how Senate decisions reach real people.', 'As a nurse and health worker, I care about what the Senate does.', 'I work in health care in {state}.'],
    farmer: ['I farm and ranch in {state}, and Washington decisions reach us fast.', 'As a farmer, I care about what the Senate does.', 'I work the land here in {state}.'],
    union: ['I am a union member, and I care about who speaks for working people.', 'As a union member, I follow how the Senate votes.', 'I belong to a union here in {state}.'],
    worker: ['I work hard for a living, and I want leaders who remember people like me.', 'I am a working person in {state}.', 'I punch a clock like a lot of people in {state}.'],
    firstvote: ['I am a new voter, and this is one of my first letters to a senator.', 'I just started voting, and I want my voice heard.', 'I am new to voting, and I want to be part of this decision.']
  };

  var REASON_LEAD = ['In my own words:', 'Here is why this matters to me:', 'My reasons:', 'What I want you to know:', 'Why I feel this way:', 'This is what I think:', ''];

  function ctx(issue, sen, stance, opts) {
    var c = {
      issue: issue, sen: sen, stance: stance, pro: stance === 'for',
      special: (issue.special || {})[sen.id] || null,
      S: 'Senator ' + sen.last, full: 'Senator ' + sen.name, last: sen.last,
      state: D.states[sen.st], since: sen.since,
      name: (opts.name || '').trim() || '[Your name]',
      town: (opts.town || '').trim() || '[your town]',
      reasons: (opts.reasons || '').replace(/\r/g, '').trim(),
      who: opts.who || ''
    };
    c.Town = c.town.charAt(0) === '[' ? '[Your town]' : c.town;
    c.topic = pick(issue.topic);
    return c;
  }

  function ask(c, size) {
    var src = c.special || c.issue.asks;
    var key = c.stance + (size === 'short' ? 'Short' : '');
    return fill(pick(src[key] || c.issue.asks[key]), c);
  }
  function factSet(c, n) {
    return shuffle(c.issue.facts[c.stance]).slice(0, n).map(function (f) { return fill(pick(f), c); });
  }
  function view(c, n) { return shuffle(c.issue.views[c.stance]).slice(0, n || 1).map(function (x) { return fill(x, c); }); }
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
  function sign(c, words) { return words + '\n' + c.name + '\n' + c.Town + ', ' + c.state; }
  function constituent(c) {
    return pick(['I live in ' + c.town + ', ' + c.state + '.', 'I am your constituent in ' + c.town + '.',
      'I am writing from ' + c.town + ', ' + c.state + '.', 'I am one of the people you represent, from ' + c.town + '.']);
  }
  function sinceLine(c) {
    if (c.special || !c.since) return '';
    return pick(['Thank you for serving ' + c.state + ' in the Senate since ' + c.since + '.',
      'You have represented ' + c.state + ' since ' + c.since + ', and I appreciate your work.',
      'I have followed your work for ' + c.state + ' since you joined the Senate in ' + c.since + '.']);
  }

  /* What a senator has said in public on this issue, when a source reported it. */
  function stanceLine(c) {
    if (!c.issue.reported) return '';
    var s = c.sen.stance;
    if (!s || s[0] !== 'backs') return '';
    var src = SRC[s[1]];
    if (!src) return '';
    return pick(c.pro ? [
      src.name + ' reported on ' + src.date + ' that you back Senator Schumer. Thank you for that.',
      'I saw that you have said you support Senator Schumer (' + src.name + ', ' + src.date + '). I agree with you.'
    ] : [
      src.name + ' reported on ' + src.date + ' that you back Senator Schumer. I ask you to think again before the vote.',
      'I know you have said you support Senator Schumer (' + src.name + ', ' + src.date + '). I hope you will keep an open mind until December 1.'
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
    if (!r) return '';
    if (r.type === 'rollcall') {
      var cast = castFor(c.issue, c.sen);
      if (!cast) return '';
      var data = { what: r.what, date: r.date };
      if (cast === 'NV') return r.lines.nv ? fill(r.lines.nv, data) : '';
      return fill(pick(r.lines[c.stance][cast]), data);
    }
    if (r.type === 'breaks') return breaksLine(c);
    return '';
  }
  function breaksLine(c) {
    var b = c.sen.breaks;
    if (!b) return '';
    var isSelf = c.special && c.sen.id === 'S000148';
    if (isSelf && c.pro) return '';
    if (!b.length) {
      return pick(['On nine key Senate votes from 2025 and 2026, you voted with most Democratic senators each time.',
        'I looked at your record on nine key votes from 2025 and 2026. You voted with most Democratic senators on all of them.']) + ' ' +
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
    var line = pick(isSelf ? lines.slice(0, 2) : lines);
    if (isSelf) return line + ' ' + pick(['Many Democratic voters remember votes like that one.', 'Votes like that are part of why I am writing.']);
    return line + ' ' + pick(['That tells me you make up your own mind.', 'I respect that you vote your own judgment.',
      'I hope you bring that same independence to this vote.']);
  }

  function civicLine(c) {
    return pick((c.issue.civic || []).concat(['Letters like this are how people back home take part, and I want my view on the record with your office.']));
  }

  /* Voices. Each one builds a letter with its own shape. */
  var VOICES = [
    { key: 'formal', label: 'Formal', build: function (c) {
      var f = factSet(c, 2);
      return join([
        pick(['Dear ' + c.full + ',', 'Dear ' + c.S + ':', 'The Honorable ' + c.sen.name + ',']),
        para([pick(['I am writing as a constituent from ' + c.town + ', ' + c.state + '.', 'I write to you as a resident of ' + c.town + ', ' + c.state + '.']), whoLine(c), ask(c)]),
        para([stanceLine(c), f[0], f[1]]),
        recordLine(c),
        reasonsBlock(c),
        para([view(c)[0], pick(['I appreciate your attention to this matter.', 'Thank you for considering my view.', 'Thank you for your time and your service.'])]),
        sign(c, pick(['Respectfully,', 'Sincerely,', 'Respectfully yours,']))
      ]);
    } },
    { key: 'short', label: 'Short and plain', build: function (c) {
      return join([
        pick([c.S + ',', 'Dear ' + c.S + ',', 'Hello ' + c.S + ',']),
        para([constituent(c), ask(c, 'short'), view(c)[0]]),
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
        para([stanceLine(c), view(c)[0]]),
        pick(['Thank you for reading this. I know your office hears from a lot of people.', 'Thanks for listening. It means a lot to know my voice gets to you.', 'I appreciate you, and I appreciate you reading this.']),
        sign(c, pick(['Warmly,', 'All the best,', 'With thanks,']))
      ]);
    } },
    { key: 'points', label: 'Point by point', build: function (c) {
      var items = factSet(c, 2).concat(view(c, 1));
      reasonLines(c).forEach(function (r) { items.push(r); });
      var rec = recordLine(c);
      if (rec && chance(0.6)) items.push(rec);
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
      var f = factSet(c, 3);
      return join([
        pick(['Dear ' + c.S + ',', c.full + ',']),
        para([pick(['I want to start with the facts.', 'A few facts first.', 'Let me lead with what the record shows.']), f[0]]),
        para([f[1], f[2]]),
        recordLine(c),
        para([constituent(c), ask(c)]),
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
        para([factSet(c, 1)[0]]),
        sign(c, pick(['Thank you,', 'Best regards,', 'Sincerely,']))
      ]);
    } },
    { key: 'balanced', label: 'Thoughtful, both sides', build: function (c) {
      return join([
        pick(['Dear ' + c.S + ',', 'Dear ' + c.full + ',']),
        para([constituent(c), whoLine(c), pick(['I know good people disagree about ' + c.topic + '.', 'I have tried to look at ' + c.topic + ' from both sides.', 'This is not a simple question, and I do not think it should be treated like one.'])]),
        para([fill(c.issue.otherSide[c.stance], c), pick(['Still, I come down on one side.', 'After thinking it over, here is where I stand.', 'But on balance, my view is this.']), ask(c)]),
        para([factSet(c, 1)[0], view(c)[0]]),
        reasonsBlock(c),
        recordLine(c),
        pick(['Whatever you decide, thank you for weighing it carefully.', 'I trust you to weigh this seriously.', 'Thank you for hearing me out.']),
        sign(c, pick(['Respectfully,', 'Sincerely,', 'With respect,']))
      ]);
    } },
    { key: 'forward', label: 'Looking ahead', build: function (c) {
      return join([
        pick(['Dear ' + c.S + ',', c.S + ',']),
        para([pick(['The next two years matter a great deal.', 'I am thinking about what comes next.', 'What the Senate does now will shape the years ahead.']), constituent(c), whoLine(c)]),
        para([ask(c), view(c)[0]]),
        para([factSet(c, 1)[0], stanceLine(c)]),
        reasonsBlock(c, pick(['What I hope for:', 'What matters to me going forward:', ''])),
        pick(['I am hopeful about what the Senate can do next.', 'I look forward to seeing what you do with this moment.', 'Thank you for helping shape what comes next.']),
        sign(c, pick(['Hopefully,', 'Thank you,', 'Best,']))
      ]);
    } },
    { key: 'note', label: 'Quick note', build: function (c) {
      return join([
        pick([c.S + ',', 'Dear ' + c.S + ',']),
        para([ask(c, 'short'), pick(['That is my view as your constituent in ' + c.town + '.', 'I live in ' + c.state + ' and wanted you to know.', 'Just wanted you to hear it from someone in ' + c.state + '.'])]),
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
        para(factSet(c, 2)),
        reasonsBlock(c),
        pick(['Thank you for taking the views of the people you represent into account.', 'Please carry the views of people in ' + c.state + ' with you into that vote.', 'Thank you for listening to the people you represent.']),
        sign(c, pick(['Sincerely,', 'Respectfully,', 'Thank you,']))
      ]);
    } },
    { key: 'plainspoken', label: 'Plain talk', build: function (c) {
      return join([
        pick([c.S + ',', 'Hello ' + c.S + ',']),
        para([pick(['I will keep this simple.', 'I will get right to it.', 'Straight to the point.']), ask(c)]),
        para([whoLine(c), view(c)[0], pick(['That is how I see it.', 'Simple as that.', ''])]),
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
    var v;
    if (opts.voice) v = VOICES.filter(function (x) { return x.key === opts.voice; })[0];
    if (!v) v = pick(VOICES.filter(function (x) { return x.key !== lastVoice; }));
    return { voice: v.key, label: v.label, subject: subject(c), body: tidy(v.build(c)) };
  }

  function callScript(issue, sen, stance, opts) {
    var c = ctx(issue, sen, stance, opts || {});
    var me = c.name.charAt(0) === '[' ? 'I am a constituent' : 'My name is ' + c.name + ', and I am a constituent';
    var want = fill(((c.special && c.special.call) || issue.call)[stance], c);
    var why = reasonLines(c)[0] || view(c)[0];
    return 'Hello, ' + me + ' from ' + c.town + ', ' + c.state + '. ' + want + ' ' + why + ' Thank you.';
  }

  function canVote(issue, sen) { return issue.voters === 'all' || (issue.voters === 'dem' && sen.dem); }

  window.CSLetters = {
    build: build,
    callScript: callScript,
    canVote: canVote,
    castFor: castFor,
    voices: VOICES.map(function (v) { return { key: v.key, label: v.label }; })
  };
})();
