/* "Your own words" for the Contact Your Senator and Contact Your Representative pages (D286, Nov 2026).
   The reader types a list or rough notes, spelled any way, and this turns them into clean sentences for a letter or call.
   The "Pissed off" version keeps the anger and drops the swearing and name calling.
   Everything runs here in the browser with fixed rules. Nothing typed is saved or sent anywhere.
   Spelling fixes use words.js (loaded only when the box is used): a word not in the list is changed only when a
   close, common word is found, and capitalized words (names, places) are left alone. Every change is listed for the reader. */
(function () {
  'use strict';

  /* Shorthand and common misspellings, fixed first. */
  var FIX = {
    u: 'you', ur: 'your', r: 'are', ppl: 'people', pple: 'people', peeps: 'people', govt: 'government', gov: 'government', gvt: 'government',
    thx: 'thanks', pls: 'please', plz: 'please', cuz: 'because', coz: 'because', cos: 'because', bc: 'because', b4: 'before', w: 'with',
    tho: 'though', thru: 'through', wat: 'what', wut: 'what', ya: 'you', yall: "y'all", dont: "don't", doesnt: "doesn't", didnt: "didn't",
    isnt: "isn't", arent: "aren't", wasnt: "wasn't", werent: "weren't", havent: "haven't", hasnt: "hasn't", hadnt: "hadn't", wouldnt: "wouldn't",
    couldnt: "couldn't", shouldnt: "shouldn't", cant: "can't", wont: "won't", aint: "isn't", im: "I'm", ive: "I've", id: "I'd", ill: "I'll",
    youre: "you're", theyre: "they're", thats: "that's", whats: "what's", theres: "there's", lets: "let's", gonna: 'going to', wanna: 'want to',
    gotta: 'have to', kinda: 'kind of', sorta: 'sort of', alot: 'a lot', becuase: 'because', becasue: 'because', becaus: 'because', beacuse: 'because',
    goverment: 'government', govermant: 'government', govenment: 'government', governmant: 'government', definately: 'definitely', definatly: 'definitely',
    thier: 'their', wich: 'which', realy: 'really', beleive: 'believe', belive: 'believe', untill: 'until', tommorow: 'tomorrow', wierd: 'weird',
    peple: 'people', poeple: 'people', pepole: 'people', senitor: 'senator', senater: 'senator', sentor: 'senator', congres: 'Congress', congess: 'Congress',
    seperate: 'separate', recieve: 'receive', enviroment: 'environment', buisness: 'business', bussiness: 'business', probly: 'probably', prolly: 'probably',
    shoud: 'should', woud: 'would', coud: 'could', sumthing: 'something', somthing: 'something', ther: 'there', freind: 'friend', acually: 'actually',
    actualy: 'actually', basicly: 'basically', finaly: 'finally', comming: 'coming', diffrent: 'different', intrest: 'interest', litteraly: 'literally',
    alright: 'all right', everytime: 'every time', medicade: 'Medicaid', medicaide: 'Medicaid', medicair: 'Medicare', socail: 'social', securty: 'security',
    secuirty: 'security', imigration: 'immigration', immagration: 'immigration', healthcare: 'health care', helthcare: 'health care', taxs: 'taxes',
    vetrans: 'veterans', veterens: 'veterans', vets: 'veterans', democracey: 'democracy', democrasy: 'democracy', corupt: 'corrupt', coruption: 'corruption',
    elction: 'election', elecion: 'election', presidant: 'president', presedent: 'president', constituant: 'constituent', represent: 'represent',
    representitive: 'representative', represenative: 'representative', responsable: 'responsible', accountible: 'accountable', unacceptible: 'unacceptable',
    rediculous: 'ridiculous', ridiculus: 'ridiculous', disgustng: 'disgusting', disapointed: 'disappointed', dissapointed: 'disappointed', embarassing: 'embarrassing'
  };
  /* Names that take a capital. */
  var PROPER = { congress: 'Congress', washington: 'Washington', senate: 'Senate', america: 'America', american: 'American', americans: 'Americans',
    medicare: 'Medicare', medicaid: 'Medicaid', democrats: 'Democrats', democrat: 'Democrat', republicans: 'Republicans', republican: 'Republican',
    trump: 'Trump', biden: 'Biden', obama: 'Obama', obamacare: 'Obamacare', schumer: 'Schumer', jeffries: 'Jeffries', musk: 'Musk', christmas: 'Christmas',
    january: 'January', february: 'February', april: 'April', june: 'June', july: 'July', august: 'August', september: 'September', october: 'October',
    november: 'November', december: 'December', monday: 'Monday', tuesday: 'Tuesday', wednesday: 'Wednesday', thursday: 'Thursday', friday: 'Friday',
    saturday: 'Saturday', sunday: 'Sunday', english: 'English', spanish: 'Spanish', mexico: 'Mexico', canada: 'Canada', china: 'China', ukraine: 'Ukraine',
    israel: 'Israel', gaza: 'Gaza', iran: 'Iran', russia: 'Russia', supreme: 'Supreme' };
  /* Kept in capitals when typed in capitals. */
  var ACRONYMS = { usa: 1, us: 1, va: 1, gop: 1, fbi: 1, cia: 1, doj: 1, dhs: 1, ice: 1, irs: 1, epa: 1, fda: 1, ssa: 1, snap: 1, wic: 1, aca: 1, nato: 1,
    un: 1, nra: 1, aipac: 1, pac: 1, ssi: 1, ssdi: 1, dc: 1, ai: 1, hr: 1, ceo: 1, ceos: 1, gdp: 1, ok: 1, tv: 1, ptsd: 1, lgbt: 1, lgbtq: 1, maga: 1, doge: 1, noaa: 1, fema: 1, osha: 1 };

  /* Swearing and name calling, in the order they are tried. "Pissed off" keeps it angry; the calm box keeps it polite. */
  var STRONG = 'ridiculous|insane|crazy|stupid|wrong|terrible|unacceptable|awful|outrageous|disgusting|sick|tired|done|pathetic|corrupt|useless|absurd|' +
    'unfair|cruel|evil|shameful|bad|broken|expensive|ugly|dangerous|disappointed|angry|mad|furious|scared|worried|serious|hard|impossible|clear|obvious|real';
  var SWEAR = [
    [/\b(?:wtf|what the (?:fuck|f\*+k|f\*ck|hell|heck)) (is|are|was|were|did|does|do|has|have|happened)\b/gi, function (m) { return 'what ' + m.split(' ').pop(); }],
    [/\bgive a (?:shit|damn|fuck|f\*+k|crap|rat'?s ass|flying fuck)\b/gi, 'care'],
    [/\bscrew(?:ing)? (\w+) over\b/gi, function (m, who) { return (/ing\b/i.test(m.split(' ')[0]) ? 'hurting ' : 'hurt ') + who; }],
    [/\bscrewed (\w+) over\b/gi, function (m, who) { return 'hurt ' + who; }],
    [/\b(these|those|the|all these|all those|all the|bunch of) (?:assholes|bastards|dickheads|dicks|douchebags|scumbags|jackasses|pricks|idiots|morons|dumbasses|clowns|imbeciles|dipshits|fools|crooks)\b/gi, function (m, w) { return w + ' people'; }],
    [/\b(?:what|wtf) the (?:fuck|f\*+k|f\*ck|hell|heck)\b[?!]*|\bwtf\b[?!]*|\bwth\b[?!]*/gi, 'how is this acceptable?'],
    [/\b(?:fuck|f\*+k|f\*ck|screw) (?:you|them|him|her|this|that|it|off|all of you|all of them|congress)(?: (?:shit|sh\*t|s\*+t|crap|mess|nonsense|bs))?\b/gi, 'enough is enough'],
    [/\bthe (?:fuck|f\*+k|f\*ck|hell|heck)\b/gi, ''],
    [/\b(?:clusterfuck|cluster fuck|shit ?show|dumpster fire)s?\b/gi, 'disaster'],
    [/\bpiece of (?:shit|crap|garbage|trash)(?= (?!and\b|of\b|is\b|was\b|that\b)[a-z])/gi, 'disgraceful'],
    [/\bpiece of (?:shit|crap|garbage|trash)\b|\bpos\b/gi, 'disgrace'],
    [/\b(?:fucked|f\*+ked|f\*cked|screwed) (?:up|over)\b/gi, 'badly harmed'],
    [/\bfucked up\b/gi, 'broken'],
    [/\b(?:fucked|f\*+ked|f\*cked|screwed)\b/gi, 'harmed'],
    [/\b(?:bull|horse|chicken) ?(?:shit|crap|s\*+t)\b|\bbs\b/gi, 'nonsense'],
    [/\b(?:shitty|crappy|sucky|shite)\b/gi, 'terrible'],
    [/\b(?:pissed off|pissed|ticked off|p\*ssed)\b/gi, 'angry'],
    [/\bpisses me off\b/gi, 'makes me angry'],
    [/\bthis sucks\b/gi, 'this is terrible'],
    [/\b(?:it|that|he|she) sucks\b/gi, function (m) { return m.split(' ')[0] + ' is terrible'; }],
    [/\b(?:they|you) suck\b/gi, function (m) { return m.split(' ')[0] + ' are failing us'; }],
    [/\bsucks\b/gi, 'is terrible'],
    [/\b(?:kick|whoop) (?:their|his|her|your) (?:ass|asses|butt|butts)\b/gi, 'hold them accountable'],
    [/\b(?:cover|save) (?:their|his|her|your) (?:own )?(?:ass|asses|butt|butts)\b/gi, 'protect themselves'],
    [/\bpain in the (?:ass|butt)\b/gi, 'serious problem'],
    [/\byou (?:assholes?|bastards?|idiots?|morons?|clowns?|jerks?|dumbasses?|scumbags?|cowards?|liars?)\b/gi, 'you'],
    [/\b(?:assholes|bastards|dickheads|dicks|douchebags|douches|scumbags|scum|jackasses|pricks|sob's|sobs)\b/gi, 'the people responsible'],
    [/\b(?:asshole|bastard|dickhead|douchebag|scumbag|jackass|prick|sob)\b/gi, 'the person responsible'],
    [/\b(?:idiots|morons|dumbasses|clowns|imbeciles|dipshits|fools)\b/gi, 'people who should know better'],
    [/\b(?:idiot|moron|dumbass|clown|imbecile|dipshit|fool)\b/gi, 'someone who should know better'],
    [/\b(?:retarded|idiotic|moronic|braindead|brain dead|dumbass)\b/gi, 'foolish'],
    [/\bbitching\b/gi, 'complaining'],
    [/\bbitch(?:es)?\b/gi, ''],
    [/\b(?:shit|crap|s\*+t|sh\*t)\b/gi, 'mess'],
    [/\b(?:damn it|dammit|damnit|goddammit|goddamnit)\b[!.]*/gi, ''],
    [/\bas hell\b/gi, ''],
    [/\b(?:hell|heck) no\b/gi, 'no'],
    [/\bhell\b(?= (?:yes|yeah))/gi, ''],
    [/\bass\b/gi, '']
  ];
  var INTENS = /\b(?:fucking|f\*+king|f\*cking|freaking|frickin|friggin|effing|damn|damned|goddamn|goddamned|bloody|frigging|flipping)\s+(\w+)/gi;

  function words() {
    if (words.set) return words.set;
    if (!window.CS_WORDS) return null;
    var list = window.CS_WORDS.split(' '), rank = Object.create(null);
    for (var i = 0; i < list.length; i++) rank[list[i]] = i + 1;
    words.set = rank;
    return rank;
  }
  var ABC = 'abcdefghijklmnopqrstuvwxyz';
  function edits(w) {
    var out = [];
    for (var i = 0; i <= w.length; i++) {
      var a = w.slice(0, i), b = w.slice(i);
      if (b) out.push(a + b.slice(1));
      if (b.length > 1) out.push(a + b[1] + b[0] + b.slice(2));
      for (var j = 0; j < 26; j++) {
        if (b) out.push(a + ABC[j] + b.slice(1));
        out.push(a + ABC[j] + b);
      }
    }
    return out;
  }
  function best(cands, rank) {
    var top = null, r = Infinity;
    for (var i = 0; i < cands.length; i++) { var x = rank[cands[i]]; if (x && x < r) { r = x; top = cands[i]; } }
    return top;
  }
  /* A close, common word for an unknown one, or null. Two edits only for longer words, and only common results. */
  function suggest(w, rank) {
    var one = best(edits(w), rank);
    if (one) return one;
    if (w.length < 5) return null;
    var seen = Object.create(null), cands = [];
    edits(w).forEach(function (e) { if (!seen[e]) { seen[e] = 1; cands.push(e); } });
    var top = null, r = 20000;
    for (var i = 0; i < cands.length; i++) {
      var e2 = edits(cands[i]);
      for (var j = 0; j < e2.length; j++) { var x = rank[e2[j]]; if (x && x < r) { r = x; top = e2[j]; } }
    }
    return top;
  }
  function keepCase(from, to) {
    if (to.charAt(0) === to.charAt(0).toUpperCase() && to.charAt(0) !== to.charAt(0).toLowerCase()) return to;
    return from.charAt(0) === from.charAt(0).toUpperCase() && from.charAt(0) !== from.charAt(0).toLowerCase()
      ? to.charAt(0).toUpperCase() + to.slice(1) : to;
  }

  /* Split notes into points: one per line or bullet; a single paragraph splits into sentences. */
  function points(text) {
    var lines = String(text || '').replace(/\r/g, '').replace(/\bb\.s\.(?=[\s,!?]|$)/gi, 'bs').split(/\n+|\s+[•●▪◦]\s+|^\s*[•●▪◦]\s*/m)
      .map(function (s) { return s.replace(/^\s*(?:[-*•●▪◦>]+|\d+[.)]|[a-z][.)](?=\s))\s*/i, '').trim(); }).filter(Boolean);
    if (lines.length === 1) {
      var parts = lines[0].match(/[^.!?]+(?:[.!?]+|$)/g) || [lines[0]];
      lines = parts.map(function (s) { return s.trim(); }).filter(Boolean);
    }
    return lines;
  }

  /* Clean one point. changes collects [what was typed, what it became]. */
  function cleanPoint(s, angry, changes, rank) {
    var orig = s;
    // Mostly capitals: lower it, keeping known acronyms.
    var letters = s.replace(/[^A-Za-z]/g, '');
    if (letters.length > 8 && letters.replace(/[^A-Z]/g, '').length / letters.length > 0.6) {
      s = s.replace(/[A-Za-z']+/g, function (w) { return ACRONYMS[w.toLowerCase()] ? w.toUpperCase() : w.toLowerCase(); });
    }
    // Stretched words (sooooo, pleeease) and repeated punctuation.
    s = s.replace(/([a-z])\1{2,}/gi, '$1$1').replace(/([!?])[!?1]+/g, '$1').replace(/\.{4,}/g, '...').replace(/,{2,}/g, ',');
    // Intensifiers: "fucking ridiculous" -> "absolutely ridiculous"; before anything else they are dropped.
    s = s.replace(INTENS, function (m, next) {
      var strong = new RegExp('^(?:' + STRONG + ')$', 'i').test(next) || /(?:ous|ful|able|ible|ive|less|ing|ed)$/i.test(next) && !/^(?:thing|nothing|everything|something|need|feed|seed|bed|red)$/i.test(next);
      var to = strong ? (angry ? 'absolutely ' : 'very ') + next : next;
      changes.push([m, to]);
      return to;
    });
    SWEAR.forEach(function (p) {
      s = s.replace(p[0], function (m) {
        var to = typeof p[1] === 'function' ? p[1].apply(null, arguments) : p[1];
        changes.push([m, to || '(left out)']);
        return to;
      });
    });
    // Words: shorthand and known misspellings, then the word list.
    s = s.replace(/[A-Za-z]+(?:'[A-Za-z]+)?/g, function (w, at) {
      var low = w.toLowerCase();
      if (low === 'i') return 'I';
      if (FIX[low] && !(low === 'us' || (low === 'id' && w === 'ID'))) { var f = keepCase(w, FIX[low]); if (f !== w) changes.push([w, f]); return f; }
      if (PROPER[low] && w === low) { changes.push([w, PROPER[low]]); return PROPER[low]; }
      if (!rank || w.length < 3 || ACRONYMS[low]) return w;
      if (/^[A-Z]/.test(w) && at > 0) return w; // names and places
      if (/^[A-Z]{2,}$/.test(w)) return w;
      if (rank[low] || rank[low.replace(/'s$/, '')] || rank[low.replace(/s$/, '')]) return w;
      var g = suggest(low, rank);
      if (!g) return w;
      g = keepCase(w, g);
      changes.push([w, g]);
      return g;
    });
    s = s.replace(/\bsocial security\b/gi, 'Social Security');
    // Tidy spaces and punctuation, then sentence case and an end mark.
    s = s.replace(/\s+/g, ' ').replace(/\s+([,.!?;:])/g, '$1').replace(/([?!])[.,]+/g, '$1').replace(/([,;:])(?=[A-Za-z])/g, '$1 ').replace(/^[\s,.;:]+/, '').replace(/,\s*([.!?])/g, '$1').trim();
    s = s.replace(/\bi\b/g, 'I').replace(/(^|[.!?]\s+)([a-z])/g, function (m, a, b) { return a + b.toUpperCase(); });
    if (s && !/[.!?]["')]?$/.test(s)) s += '.';
    // A question typed without a question mark.
    s = s.replace(/(^|[.!?]\s+)((?:what|why|how|when|who|where|is|are|do|does|did|can|will|would|should|could|have|has)\b[^.!?]*)\.(?=\s|$)/gi, '$1$2?');
    if (!angry) s = s.replace(/!/g, '.');
    if (s !== orig && !changes.length) { /* case and punctuation only; not listed */ }
    return s;
  }

  /* The reader's notes, cleaned: { points: [...], changes: [[typed, became], ...], spelling: true when words.js was used }. */
  function tidyNotes(text, angry) {
    var rank = words(), changes = [];
    var pts = points(text).map(function (p) { return cleanPoint(p, angry, changes, rank); }).filter(function (p) { return p.replace(/[^A-Za-z]/g, '').length > 1; });
    var seen = {}, list = [];
    changes.forEach(function (c) { var k = c[0] + '>' + c[1]; if (!seen[k] && c[0].toLowerCase() !== String(c[1]).toLowerCase()) { seen[k] = 1; list.push(c); } });
    return { points: pts, changes: list, spelling: !!rank };
  }
  function tidyLine(text, angry) {
    var r = tidyNotes(text, angry);
    return { text: r.points.join(' ').replace(/[.!?]$/, ''), changes: r.changes };
  }

  window.CSOwn = { tidyNotes: tidyNotes, tidyLine: tidyLine, ready: function () { return !!words(); },
    isWord: function (w) { var r = words(); return !PROPER[w] && !!(r && r[w]); } };
})();
