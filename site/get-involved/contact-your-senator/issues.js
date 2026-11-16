/* Issues for the Contact Your Senator page.
   To add an issue, copy one block below and fill it in. Rules:
   - Every fact is one sentence or two, with its source in "cite": outlet, date and link. The letter prints the
     source after the fact, so the senator's office can check it.
   - "on: true" means the box starts checked. The reader can check or uncheck any fact.
   - Give each side every real, sourced fact you find. The sides do not have to be the same size, but do not pad
     the thinner side with weak points.
   - "either" holds facts that either side can use, such as how a senator voted.
   - "you" is the same fact written to the senator it is about (used when the letter goes to that senator).
   - Plain words, no em dashes, no threats, no telling people how to vote in an election.
   - Vote counts in "summary" and "status" must link to the official roll call: [73 to 25](https://www.senate.gov/...).
     Link to our page for that vote, /government/congress/votes.html#rc-119-S-N (made by
     tools/contact-senator/build_votes.py), which links on to senate.gov. A voice vote has no roll call;
     link the official record of the action instead.
   - "record" is optional: a Senate roll call with how each senator voted ("short" is the card label).
     Names are last names; add -ST when two senators share a last name (Scott-FL).
     "rest" is the vote of every senator not listed; "check" must match the official totals.
   Placeholders you can use in text: {S} (Senator Last), {last}, {state}. */
(function () {
  'use strict';
  var RC = 'https://www.senate.gov/legislative/LIS/roll_call_votes/';
  var rc = function (sess, n) { return RC + 'vote119' + sess + '/vote_119_' + sess + '_' + ('0000' + n).slice(-5) + '.htm'; };
  function c(src, date, url) { return { src: src, date: date, url: url }; }
  /* Our own page for a tracked vote (it links to the official roll call). */
  var ours = function (sess, n) { return '/government/congress/votes.html#rc-119-' + sess + '-' + n; };

  /* Sources used below. */
  var TIME = c('TIME', 'November 13, 2026', 'https://time.com/article/2026/11/13/chris-van-hollen-senate-majority-leader-chuck-schumer-progressive-democrats/');
  var AP = c('Associated Press via PBS NewsHour', 'November 13, 2026', 'https://www.pbs.org/newshour/politics/van-hollen-to-challenge-schumer-for-senate-democratic-leader');
  var PBS = c('PBS NewsHour', 'November 13, 2026', 'https://www.pbs.org/newshour/show/does-van-hollen-have-enough-support-to-beat-schumer-in-senate-leadership-race');
  var AJ = c('Al Jazeera', 'November 5, 2026', 'https://www.aljazeera.com/amp/news/2026/11/5/division-among-us-democrats-over-schumers-leadership-role');
  var NW = c('Newsweek', 'August 12, 2026', 'https://www.newsweek.com/full-list-democrats-rallying-against-chuck-schumer-senate-12315442');
  var HILL = c('The Hill', 'April 16, 2025', 'https://digital-release.thehill.com/homenews/senate/5252256-schumer-democrats-news-york-favorability/amp');
  var EMERSON = c('Consensus Strategies release on its poll with Emerson College Polling (PR Newswire, via Webull)', 'December 4, 2025', 'https://www.webull.com/news/13968883130213376');
  var PROSPECT = c('The American Prospect, opinion column by Robert Kuttner', 'November 13, 2026', 'https://prospect.org/2026/11/13/van-hollens-challenge-to-chuck-schumer');
  var BIO = c('Senator Schumer\'s official biography, schumer.senate.gov', 'read November 15, 2026', 'https://www.schumer.senate.gov/about/biography');
  var REMARKS = c('Senator Schumer\'s floor remarks, Senate Democrats', 'November 12, 2024', 'https://www.democrats.senate.gov/newsroom/press-releases/majority-leader-schumer-floor-remarks-on-the-outcome-of-2024-election-and-the-path-forward');
  var FEC_AIPAC = c('FEC filings as listed by ProPublica\'s FEC Itemizer', 'read November 15, 2026', 'https://projects.propublica.org/itemizer/committee/C00346312/pac-donations/C00797670');
  var FEC_NORPAC = c('FEC filings as listed by ProPublica\'s FEC Itemizer', 'read November 15, 2026', 'https://projects.propublica.org/itemizer/committee/C00346312/pac-donations/C00247403');
  var SLUDGE = c('Sludge', 'July 25, 2025', 'https://readsludge.com/2025/07/25/aipac-gives-millions-in-pac-donations-to-house-allies-senators-in-2026-races/');
  var vote = function (sess, n, date) { return c('Senate roll call ' + n, date, rc(sess, n)); };

  var BILL_S5653 = c('Bill text, S. 5653 (GovInfo)', 'introduced September 30, 2026', 'https://www.govinfo.gov/content/pkg/BILLS-119s5653is/html/BILLS-119s5653is.htm');
  var SPONSORS = c('Sponsors\' release, Senate Energy Committee', 'September 30, 2026', 'https://www.energy.senate.gov/press/dem/heinrich-lee-capito-and-whitehouse-introduce-bipartisan-american-affordability-and-jobs-act-of-2026/');
  var ICN = c('Inside Climate News', 'November 10, 2026', 'https://insideclimatenews.org/news/10112026/senate-advances-permitting-bill/');
  var ABQ = c('Albuquerque Journal', 'November 9, 2026', 'https://www.abqjournal.com/news/heinrich-permitting-bill-clears-senate-hurdle/3159360');
  var CD = c('Common Dreams', 'November 10, 2026', 'https://www.commondreams.org/news/senate-advances-permitting-reform');
  var NARF = c('Native American Rights Fund', 'read November 11, 2026', 'https://narf.org/baaja-reform-bill/');

  var BILL_HR9237 = c('Bill text, H.R. 9237 (GovInfo)', 'introduced June 10, 2026', 'https://www.govinfo.gov/content/pkg/BILLS-119hr9237ih/xhtml/BILLS-119hr9237ih.html');
  var MT = c('Military Times', 'November 12, 2026', 'https://www.militarytimes.com/news/2026/11/12/house-passes-sweeping-veterans-benefits-bill-with-polarizing-tactic/');
  var SS = c('Stars and Stripes', 'November 12, 2026', 'https://www.stripes.com/veterans/2026-11-12/house-sweeping-veterans-bill-vfw-23444750.html');
  var BLUM = c('Senate Veterans\' Affairs Committee, Blumenthal statement', 'November 11, 2026', 'https://www.veterans.senate.gov/2026/11/blumenthal-statement-on-house-republicans-secretive-effort-to-cut-veterans-benefits-on-veterans-day');
  var MILCOM = c('Military.com', 'November 12, 2026', 'https://www.military.com/major-richard-star-act-passes-house-all-democrats-support-18-republicans-oppose');
  var ACTIONS_9237 = 'https://www.congress.gov/bill/119th-congress/house-bill/9237/all-actions';

  /* House Speaker: Hakeem Jeffries (House page). */
  var NW_REVOLT = c('Newsweek', 'November 2026', 'https://www.newsweek.com/jeffries-path-to-house-speaker-raises-specter-of-mccarthy-style-revolt-12697313');
  var NW_PET = c('Newsweek', 'November 5, 2026', 'https://www.newsweek.com/petition-to-replace-jeffries-hits-500k-as-ruffalo-wades-in-12668658');
  var PUNCH = c('Punchbowl News', 'November 4, 2026', 'https://punchbowl.news/article/house/jeffries-speaker/');
  var ABC7 = c('ABC News live updates via ABC7', 'November 4, 2026', 'https://abc7news.com/live-updates/midterm-elections-2026-live-updates-election-results-key-races-us/20001292/entry/20016171/');
  var REUTERS = c('Reuters via GV Wire', 'November 3, 2026', 'https://gvwire.com/2026/11/03/hakeem-jeffries-poised-to-become-speaker-of-us-house-of-representatives/');
  var UPRISE = c('Uprise RI', 'November 10, 2026', 'https://upriseri.com/article/as-dem-house-leader-faces-fierce-opposition-incoming-congressman-says-jeffries-allies-threatened-him/');
  var SEMAFOR = c('Semafor', 'July 7, 2026', 'https://www.semafor.com/article/07/07/2026/why-hakeem-jeffries-may-not-have-a-vote-problem');
  var NEWARAB = c('The New Arab', 'November 6, 2026', 'https://www.newarab.com/news/mamdani-speaks-out-us-petition-against-hakeem-jeffries-surges');
  var CDJ = c('Common Dreams', 'November 7, 2026', 'https://www.commondreams.org/news/petition-opposing-hakeem-jeffries-for-speaker');
  var SLUDGE_J = c('Sludge', 'November 4, 2026', 'https://readsludge.com/2026/11/04/the-money-behind-hakeem-jeffries/');
  var PETITION = c('Change.org petition page', 'read November 8, 2026', 'https://www.change.org/p/house-democrats-choose-a-new-speaker');
  var house = function (year, n, date) { return c('House roll call ' + n + ' of ' + year + ' (Office of the Clerk)', date, 'https://clerk.house.gov/evs/' + year + '/roll' + ('00' + n).slice(-3) + '.xml'); };

  var ABC_VH = c('ABC News', 'November 13, 2026', 'https://abcnews.com/Politics/schumer-van-hollen-facing-off-senate-majority-leader/story?id=138111386');
  var NW_VH = c('Newsweek', 'November 9, 2026', 'https://newsweek.com/chuck-schumer-chris-van-hollen-senate-majority-leader-challenge-12687780');
  var FOX5_VH = c('FOX 5 DC', 'November 5, 2026', 'https://www.fox5dc.com/news/maryland-sen-van-hollen-eyes-2028-presidential-bid-declines-endorse-schumer-senate-majority-leader');
  var TRACKER = c('On Point Politics Majority Tracker (estimates, updated November 12, 2026)', 'read November 16, 2026', 'https://www.onpointpolitics.us/majority-tracker');
  var GRIO = c('theGrio', 'November 12, 2026', 'https://thegrio.com/2026/11/12/progressives-want-ayanna-pressley-not-hakeem-jeffries-as-next-house-speaker/');
  var CD_PRESSLEY = c('Common Dreams', 'November 11, 2026', 'https://www.commondreams.org/news/ayanna-pressley-for-speaker');
  var SEARCHED = 'How we built this list: we searched news reports from outlets across the spectrum, official records (Senate roll calls, bill text, FEC filings) and statements from people on both sides, and we kept every point we could tie to a source. We publish both sides the same way and do not take a side. ';

  window.CS_ISSUES = [

  {
    id: 'jeffries-speaker',
    chamber: 'house',
    menu: 'House Speaker: Hakeem Jeffries (Yes Jeffries / No Jeffries)',
    title: 'Should Hakeem Jeffries lead House Democrats as Speaker?',
    status: 'House Democrats vote on their leader on November 18, 2026 (closed vote). The full House elects the Speaker on January 3, 2027.',
    summary: [
      'Democrats won the House majority on November 3. Representative Hakeem Jeffries, who leads House Democrats now, asked his colleagues on November 4 to back him for Speaker (ABC News, Punchbowl News).',
      'House Democrats pick their leader in a closed vote on November 18 (Punchbowl News, Newsweek). Then the whole House, both parties, elects the Speaker when the new Congress meets on January 3, 2027 (Newsweek). No one has said they will run against him (Newsweek, Reuters).',
      'Some progressives are circulating a petition to draft Representative Ayanna Pressley for Speaker, but she has not said she will run, and no House Democrat has said they will challenge him (theGrio, Common Dreams).'
    ],
    searched: 'How we built this list: we searched news reports from outlets across the spectrum, House roll calls and FEC filings, and statements from people on both sides, and we kept every point we could tie to a source. We publish both sides the same way and do not take a side. Searched November 8 to 16, 2026. Representative Jeffries\'s own House votes are listed for either side to use. Some reports below quote other outlets; we say so where they do.',
    subject: 'J000294',
    about: {
      id: 'J000294',
      title: 'About Hakeem Jeffries',
      facts: [
        { cite: [c('congress-legislators dataset (official records)', 'snapshot November 15, 2026', 'https://github.com/unitedstates/congress-legislators')],
          text: 'U.S. Representative for New York\'s 8th District, in Brooklyn and Queens, since January 2013.' },
        { cite: [NW_REVOLT],
          text: 'He has led House Democrats as minority leader since January 2023.' },
        { cite: [REUTERS],
          text: 'He is 56. Reuters describes him as known as a consensus-builder.' },
        { cite: [SLUDGE_J],
          text: 'Sludge reports that executives at Anduril and Palantir, crypto industry advocates and investors giving through AIPAC helped fund him as he prepares to become Speaker.' }
      ]
    },
    voters: 'all',
    question: 'Are you for or against Hakeem Jeffries as Speaker?',
    labels: { for: 'Yes Jeffries', against: 'No Jeffries' },
    // For a letter about several issues: a short name, where the writer stands (any office), and the ask (members who vote on it).
    short: 'Hakeem Jeffries for Speaker',
    stand: { for: 'I support Hakeem Jeffries for Speaker.', against: 'I want House Democrats to choose someone other than Hakeem Jeffries for Speaker.' },
    also: { for: 'Please vote for Hakeem Jeffries for Speaker.', against: 'Please vote for someone other than Hakeem Jeffries for Speaker.' },
    eitherLabel: 'Representative Jeffries\'s House votes (official roll calls)',
    topic: ['the vote for House Speaker', 'who should lead House Democrats', 'the Speaker vote'],
    asks: {
      for: ['Please support Hakeem Jeffries for Speaker, in the House Democratic leader vote on November 18 and on the House floor on January 3.',
        'I ask you to vote for Hakeem Jeffries for Speaker of the House.',
        'When the House chooses its Speaker, I hope you will vote for Hakeem Jeffries.',
        'I am writing to ask you to back Hakeem Jeffries as the next Speaker.'],
      forShort: ['Please vote for Hakeem Jeffries for Speaker.', 'Back Jeffries for Speaker.'],
      against: ['Please do not vote for Hakeem Jeffries for Speaker, in the House Democratic leader vote on November 18 or on the House floor on January 3.',
        'I ask you to support someone other than Hakeem Jeffries for Speaker.',
        'When the House chooses its Speaker, I hope you will choose someone other than Hakeem Jeffries.',
        'I am writing to ask you to support a change in House Democratic leadership.'],
      againstShort: ['Please do not vote for Jeffries for Speaker.', 'Choose someone else for Speaker.']
    },
    special: {
      J000294: {
        for: ['I support you for Speaker, and I hope your colleagues back you on November 18 and January 3.', 'Please keep leading House Democrats. I am behind you for Speaker.'],
        forShort: ['I support you for Speaker.', 'I want you to lead the House.'],
        against: ['I respectfully ask you not to seek the Speaker job, and to let someone new lead House Democrats.', 'I ask you to step aside as leader of House Democrats.'],
        againstShort: ['I think it is time for someone new to lead House Democrats.', 'Please step aside as leader.'],
        subject: { for: ['I support you for Speaker', 'Behind you for Speaker'], against: ['Please step aside as leader', 'Time for new House Democratic leadership'] },
        call: { for: 'I support Representative Jeffries becoming Speaker.', against: 'I would like Representative Jeffries to step aside as leader of House Democrats.' }
      }
    },
    subjects: {
      for: ['Please vote for Hakeem Jeffries for Speaker', 'Yes on Jeffries for Speaker', 'The Speaker vote', 'From a constituent in {state}: support Jeffries', 'My view on the Speaker vote'],
      against: ['Please choose someone other than Jeffries for Speaker', 'No on Jeffries for Speaker', 'The Speaker vote', 'From a constituent in {state}: new House leadership', 'My view on the Speaker vote']
    },
    call: { for: 'I would like {S} to vote for Hakeem Jeffries for Speaker.', against: 'I would like {S} to vote for someone other than Hakeem Jeffries for Speaker.' },
    facts: {
      for: [
        { id: 'jmajority', on: true, cite: [NW_REVOLT],
          text: 'Democrats won the House majority on November 3 under his leadership. Newsweek counted at least 254 Democrats to 165 Republicans, with some races still undecided.',
          you: 'Democrats won the House majority on November 3 under your leadership. Newsweek counted at least 254 Democrats to 165 Republicans, with some races still undecided.' },
        { id: 'jnochallenger', on: true, cite: [NW_REVOLT, REUTERS],
          text: 'No one has said they will run against him. Newsweek calls him uncontested so far and expected to win the nomination, and Reuters reports that no one is seen posing a serious threat, according to multiple Democratic aides.',
          you: 'No one has said they will run against you. Newsweek calls you uncontested so far and expected to win the nomination, and Reuters reports that no one is seen posing a serious threat, according to multiple Democratic aides.' },
        { id: 'jletter', cite: [NW_PET],
          text: 'In his letter asking for votes, he wrote: "Against all odds, House Democrats were consistently successful in the minority. We must now deliver the dramatic change the American people are demanding in the majority." (Politico, as quoted by Newsweek)',
          you: 'In your letter asking for votes, you wrote that House Democrats "were consistently successful in the minority" and must now "deliver the dramatic change the American people are demanding in the majority." (Politico, as quoted by Newsweek)' },
        { id: 'jhimes', cite: [UPRISE],
          text: 'Representative Jim Himes said Jeffries "absolutely will be speaker." (Axios, as quoted by Uprise RI)' },
        { id: 'jmamdani', cite: [NEWARAB, NW_PET],
          text: 'New York City Mayor Zohran Mamdani said: "I continue to support Congressman Jeffries and his bid to become the leader."' },
        { id: 'jcasar', cite: [UPRISE],
          text: 'Progressive Caucus chair Greg Casar said the caucus would deliver votes for Jeffries. (Drop Site News, as quoted by Uprise RI)' },
        { id: 'jjstreet', cite: [SEMAFOR],
          text: 'J Street endorsed Jeffries and his leadership team in July 2026, for the first time this Congress.' },
        { id: 'jconsensus', cite: [REUTERS],
          text: 'Reuters describes him as a consensus-builder, and his first speech after the election said: "Today begins the great American comeback."' }
      ],
      against: [
        { id: 'jpetition', on: true, cite: [NW_REVOLT, PETITION],
          text: 'A Change.org petition asking House Democrats to choose a different Speaker has passed 1.1 million signatures. It says: "Hakeem Jeffries is simply not the right choice."' },
        { id: 'jpoll', on: true, cite: [UPRISE, c('Newsweek', 'November 6, 2026', 'https://www.newsweek.com/jeffries-approval-rating-worse-than-mike-johnson-as-democratic-voters-rebel-12679163')],
          text: 'In an Economist/YouGov poll of registered voters from October 23 to 26, 2026, 26 percent approved of Jeffries and 47 percent disapproved.',
          you: 'In an Economist/YouGov poll of registered voters from October 23 to 26, 2026, 26 percent approved of you and 47 percent disapproved.' },
        { id: 'jaipac', cite: [SLUDGE_J],
          text: 'Sludge reports that AIPAC\'s PAC routed more than $427,000 in donor contributions to his campaign and fundraising committees this cycle, based on FEC filings.',
          you: 'Sludge reports that AIPAC\'s PAC routed more than $427,000 in donor contributions to your campaign and fundraising committees this cycle, based on FEC filings.' },
        { id: 'jdefense', cite: [SLUDGE_J],
          text: 'Sludge reports that executives at the defense companies Anduril and Palantir gave to his fundraising committees. FEC filings show $144,300 from Anduril\'s chief executive and chief operating officer and $44,300 from a Palantir manager.',
          you: 'Sludge reports that executives at the defense companies Anduril and Palantir gave to your fundraising committees. FEC filings show $144,300 from Anduril\'s chief executive and chief operating officer and $44,300 from a Palantir manager.' },
        { id: 'jleonard', cite: [UPRISE],
          text: 'Ohio Representative-elect Don Leonard said senior House Democrats threatened to make his life "a living hell" over the conditions he set for backing Jeffries. Drop Site News, which first reported it, described them as Jeffries allies. (Uprise RI)' },
        { id: 'juncommitted', cite: [NW_REVOLT, REUTERS],
          text: 'Newsweek lists incoming members Claire Valdez, Darializa Avila Chevalier and Melat Kiros as uncertain whether they will support him. Reuters reports Avila Chevalier would not commit to voting for him.' },
        { id: 'jtrent', cite: [CDJ],
          text: 'Corbin Trent, a former top aide to Representative Ocasio-Cortez, said: "the Democratic leadership we have today is completely ill-suited for this moment."' },
        { id: 'jleft', cite: [NW_REVOLT, SEMAFOR],
          text: 'Criticism of his stance on Israel and his donors comes mainly from the progressive wing of the caucus, according to Newsweek and Semafor.' }
      ],
      either: [
        { id: 'jv200', cite: [house(2025, 200, 'July 17, 2025')],
          text: 'On July 17, 2025, Representative Jeffries voted yes on the GENIUS Act (S. 1582), rules for stablecoins. 102 House Democrats voted yes and 110 voted no.',
          you: 'On July 17, 2025, you voted yes on the GENIUS Act (S. 1582), rules for stablecoins. 102 House Democrats voted yes and 110 voted no.' },
        { id: 'jv500', cite: [house(2024, 500, 'December 11, 2024')],
          text: 'On December 11, 2024, Representative Jeffries voted yes on the final defense bill for 2025 (H.R. 5009). 81 House Democrats voted yes and 124 voted no.',
          you: 'On December 11, 2024, you voted yes on the final defense bill for 2025 (H.R. 5009). 81 House Democrats voted yes and 124 voted no.' },
        { id: 'jv164', cite: [house(2026, 164, 'May 13, 2026')],
          text: 'On May 13, 2026, Representative Jeffries voted yes on H.R. 1346, year-round sales of E15 ethanol fuel. 95 House Democrats voted yes and 113 voted no.',
          you: 'On May 13, 2026, you voted yes on H.R. 1346, year-round sales of E15 ethanol fuel. 95 House Democrats voted yes and 113 voted no.' },
        { id: 'jv305', cite: [house(2025, 305, 'November 21, 2025')],
          text: 'On November 21, 2025, Representative Jeffries voted yes on H.Con.Res. 58, a resolution denouncing socialism. 86 House Democrats voted yes and 98 voted no.',
          you: 'On November 21, 2025, you voted yes on H.Con.Res. 58, a resolution denouncing socialism. 86 House Democrats voted yes and 98 voted no.' },
        { id: 'jv697', cite: [house(2023, 697, 'December 5, 2023')],
          text: 'On December 5, 2023, Representative Jeffries voted present on H.Res. 894, which said anti-Zionism is antisemitism.',
          you: 'On December 5, 2023, you voted present on H.Res. 894, which said anti-Zionism is antisemitism.' }
      ]
    },
    views: {
      for: ['I value steady, experienced leadership.', 'He just led the party to a House majority, and that should count.', 'A fight over the Speaker job would cost time the country does not have.', 'I want a Speaker who can hold a big, diverse caucus together.'],
      against: ['I want a younger generation to take over leadership.', 'After so many progressive candidates won, I do not want a centrist leading the caucus.', 'I do not want our leader tied to AIPAC money.', 'I want leaders who will push back harder.', 'Leadership should change when voters ask for change.']
    },
    questions: {
      for: ['Why change leaders right after winning the House?', 'Who else in the caucus has the experience to run the House on day one?', 'What would the caucus gain by starting over now?'],
      against: ['What message does it send to keep the same leader after voters asked for change?', 'Who will connect best with the voters who just showed up?', 'What would new leadership make possible in the next two years?']
    },
    otherSide: { for: 'Some people want a new face at the top, and I understand why.', against: 'Representative Jeffries has led the caucus through hard years, and I respect that.' },
    civic: ['The House Democratic leader vote is a closed caucus vote, so letters like this are one of the few ways people back home can weigh in.', 'Voters do not get a ballot in the Speaker race. This letter is my way to take part.'],
    sources: [NW_REVOLT, NW_PET, PUNCH, ABC7, REUTERS, UPRISE, SEMAFOR, NEWARAB, CDJ, SLUDGE_J, PETITION, GRIO, CD_PRESSLEY]
  },
  {
    id: 'schumer-leader',
    menu: 'Senate Democratic leader: Chuck Schumer',
    title: 'Who should lead Senate Democrats?',
    status: 'Closed vote of Democratic senators on December 1, 2026.',
    summary: [
      'Senate Democrats will pick their leader in a closed vote on December 1. Senator Chuck Schumer has the job now. Senator Chris Van Hollen is running against him (TIME, November 13).',
      'Only the Democratic senators and the two independents who work with them (King and Sanders) vote.'
    ],
    searched: SEARCHED + 'Searched November 15, 2026. The against side has more points because more has been reported against him since the March 2025 funding vote. Senator Schumer\'s own Senate votes are listed for either side to use.',
    subject: 'S000148',
    about: {
      id: 'S000148',
      title: 'About Chuck Schumer',
      facts: [
        { cite: [c('Biographical Directory of Congress', 'read November 15, 2026', 'https://bioguide.congress.gov/search/bio/S000148')],
          text: 'U.S. Senator for New York since 1999. Before that he served in the U.S. House from 1981 to 1999.' },
        { cite: [BIO, c('Ballotpedia', 'read November 15, 2026', 'https://ballotpedia.org/Chuck_Schumer')],
          text: 'Leader of Senate Democrats since 2017. He was Majority Leader from 2021, the first New Yorker in that job, and has been Minority Leader since 2025.' },
        { cite: [AJ, BIO],
          text: 'He is 75 and was born and raised in Brooklyn.' },
        { cite: [c('congress-legislators dataset (official records)', 'snapshot November 4, 2026', 'https://github.com/unitedstates/congress-legislators')],
          text: 'His current term ends January 3, 2029. His seat is next on the ballot in November 2028.' },
        { cite: [c('FEC, Friends of Schumer (C00346312)', 'totals through September 30, 2026', 'https://www.fec.gov/data/committee/C00346312/')],
          text: 'His campaign committee, Friends of Schumer, reported $1,159,716 in receipts in 2025 and 2026, through September 30, 2026.' },
        { cite: [BIO],
          text: 'His office lists the Inflation Reduction Act, the CHIPS and Science Act, the bipartisan infrastructure law and the American Rescue Plan as passed under his leadership.' },
        { cite: [TIME],
          text: 'For the next Congress he has laid out bills on tariffs and health care and efforts to end the war in Iran.' }
      ]
    },
    voters: 'dem',
    question: 'Are you for or against Chuck Schumer as Democratic leader?',
    labels: { for: 'For Schumer', against: 'Against Schumer' },
    short: 'the Senate Democratic leader vote',
    stand: { for: 'I support Chuck Schumer as the Senate Democratic leader.', against: 'I want Senate Democrats to choose a new leader on December 1.' },
    also: { for: 'Please vote for Chuck Schumer as Democratic leader on December 1.', against: 'Please vote for new Democratic leadership on December 1.' },
    eitherLabel: 'Senator Schumer\'s Senate votes (official roll calls)',
    topic: ['the vote for Democratic leader', 'the December 1 leader vote', 'who should lead Senate Democrats'],
    asks: {
      for: ['Please vote to keep Chuck Schumer as Democratic leader when the caucus meets on December 1.',
        'I ask you to support Senator Schumer for Democratic leader on December 1.',
        'When Senate Democrats choose their leader on December 1, I hope you will vote for Chuck Schumer.',
        'I am writing to ask you to back Chuck Schumer as leader in the December 1 caucus vote.'],
      forShort: ['Please vote for Senator Schumer.', 'Keep Chuck Schumer as leader.'],
      against: ['Please vote for new Democratic leadership when the caucus meets on December 1.',
        'I ask you not to vote for Chuck Schumer as Democratic leader on December 1.',
        'When Senate Democrats choose their leader on December 1, I hope you will choose someone new.',
        'I am writing to ask you to support a change in Democratic leadership in the December 1 caucus vote.'],
      againstShort: ['Please vote for a new leader.', 'Choose someone new to lead.']
    },
    special: {
      S000148: {
        for: ['I hope you will stay on as Democratic leader, and I support you in the December 1 vote.', 'Please keep leading Senate Democrats. I am behind you for December 1.'],
        forShort: ['I want you to stay on as leader.', 'I support you for Democratic leader.'],
        against: ['I respectfully ask you to step aside as Democratic leader and let someone new lead.', 'I ask you not to seek another term as Democratic leader.'],
        againstShort: ['I think it is time for you to hand the leader job to someone new.', 'Please step aside as leader.'],
        subject: { for: ['Please stay on as leader', 'I support you for Democratic leader'], against: ['Please step aside as leader', 'Time for new Democratic leadership'] },
        call: { for: 'I support the Senator staying on as Democratic leader.', against: 'I would like the Senator to step aside as Democratic leader.' }
      },
      V000128: {
        for: ['I respect your choice to run, but I ask you to support Senator Schumer for leader on December 1.', 'I hope the caucus keeps Senator Schumer as leader, and I ask you to back him.'],
        forShort: ['I ask you to support Senator Schumer for Democratic leader.', 'Please back Senator Schumer.'],
        against: ['I support your run for Democratic leader, and I hope the caucus picks you on December 1.', 'Thank you for offering to lead. I hope you win the December 1 vote.'],
        againstShort: ['I am glad you are running for leader.', 'I back your run for leader.'],
        subject: { for: ['Please support Senator Schumer for leader', 'My view on the leader race'], against: ['I support your run for leader', 'Behind your run for Democratic leader'] },
        call: { for: 'I would like the Senator to support Senator Schumer for leader.', against: 'I support the Senator\'s run for Democratic leader.' }
      }
    },
    subjects: {
      for: ['Please vote for Senator Schumer on December 1', 'Keep Chuck Schumer as Democratic leader', 'The December 1 leader vote', 'From a constituent in {state}: support Schumer', 'My view on the Democratic leader vote'],
      against: ['Please vote for new Democratic leadership', 'The December 1 leader vote', 'Time for a new Democratic leader', 'From a constituent in {state}: new leadership', 'My view on the Democratic leader vote']
    },
    call: { for: 'I would like Senator {last} to vote for Chuck Schumer as Democratic leader on December 1.', against: 'I would like Senator {last} to vote for new Democratic leadership on December 1.' },
    facts: {
      for: [
        { id: 'wave', on: true, cite: [TIME],
          text: 'In the November 3 election, Democrats flipped at least eight Republican-held Senate seats, for a caucus of at least 55, up from 47, with Senator Schumer as leader.',
          you: 'In the November 3 election, Democrats flipped at least eight Republican-held Senate seats, for a caucus of at least 55, up from 47, with you as leader.' },
        { id: 'recruit', on: true, cite: [AP],
          text: 'The Associated Press reports that Senator Schumer recruited many of the party\'s winning candidates and raised money for them.',
          you: 'The Associated Press reports that you recruited many of the party\'s winning candidates and raised money for them.' },
        { id: 'backers', cite: [TIME],
          text: 'TIME named 14 senators and senators-elect who publicly back Senator Schumer, including Alsobrooks, Baldwin, Blumenthal, Cortez Masto, Fetterman, Gallego, Gillibrand, Kaine, Kelly, King, Rosen, Schatz and Whitehouse.',
          you: 'TIME named 14 senators and senators-elect who publicly back you, including Alsobrooks, Baldwin, Blumenthal, Cortez Masto, Fetterman, Gallego, Gillibrand, Kaine, Kelly, King, Rosen, Schatz and Whitehouse.' },
        { id: 'king', cite: [AP],
          text: 'Senator Angus King called Senator Schumer "one of the principal architects of the most successful election in modern history."',
          you: 'Senator Angus King called you "one of the principal architects of the most successful election in modern history."' },
        { id: 'laws', cite: [BIO],
          text: 'Senator Schumer became the first New Yorker to serve as Senate Majority Leader in 2021. His office lists the Inflation Reduction Act, the CHIPS and Science Act, the bipartisan infrastructure law and the American Rescue Plan as passed under his leadership.',
          you: 'You became the first New Yorker to serve as Senate Majority Leader in 2021. Your office lists the Inflation Reduction Act, the CHIPS and Science Act, the bipartisan infrastructure law and the American Rescue Plan as passed under your leadership.' },
        { id: 'remarks', cite: [REMARKS],
          text: 'In November 2024, Senator Schumer listed what the Senate did while Democrats held the majority, including care for veterans, help for Ukraine and protecting marriage equality.',
          you: 'In November 2024, you listed what the Senate did while Democrats held the majority, including care for veterans, help for Ukraine and protecting marriage equality.' },
        { id: 'tenure', cite: [TIME],
          text: 'Senator Schumer has led the Democratic caucus since 2017, through both Trump terms and the Biden years.',
          you: 'You have led the Democratic caucus since 2017, through both Trump terms and the Biden years.' },
        { id: 'money', cite: [PROSPECT],
          text: 'The super PAC and nonprofit allied with Senator Schumer raised over $200 million in the third quarter of 2026, according to a column in The American Prospect.',
          you: 'The super PAC and nonprofit allied with you raised over $200 million in the third quarter of 2026, according to a column in The American Prospect.' },
        { id: 'agenda', cite: [TIME],
          text: 'Senator Schumer has laid out a first 100 days agenda with bills on tariffs and health care and efforts to end the war in Iran.',
          you: 'You have laid out a first 100 days agenda with bills on tariffs and health care and efforts to end the war in Iran.' },
        { id: 'age-close', cite: [AP],
          text: 'The challenger, Senator Van Hollen, is 67. The Associated Press notes he is "not that much younger than Schumer, 75."',
          you: 'Your challenger, Senator Van Hollen, is 67. The Associated Press notes he is "not that much younger than Schumer, 75."' }
      ],
      against: [
        { id: 'poll-politico', on: true, cite: [NW],
          text: 'In a June 2026 Politico poll, 47 percent of likely Democratic voters said Senator Schumer should not stay in leadership, and 28 percent said he should.',
          you: 'In a June 2026 Politico poll, 47 percent of likely Democratic voters said you should not stay in leadership, and 28 percent said you should.' },
        { id: 'freshmen', on: true, cite: [AJ],
          text: 'At least seven incoming Democratic senators have said they will not commit to supporting Senator Schumer, or have said so outright.',
          you: 'At least seven incoming Democratic senators have said they will not commit to supporting you, or have said so outright.' },
        { id: 'new-senators', cite: [PBS],
          text: 'PBS NewsHour reports that most of the 11 new Democratic senators elected so far oppose Senator Schumer as leader.',
          you: 'PBS NewsHour reports that most of the 11 new Democratic senators elected so far oppose you as leader.' },
        { id: 'age', cite: [AJ, BIO],
          text: 'Senator Schumer is 75. He has been in the Senate since 1999 and has led Senate Democrats since 2017.',
          you: 'You are 75. You have been in the Senate since 1999 and have led Senate Democrats since 2017.' },
        { id: 'generation', cite: [AJ],
          text: 'Incoming Senator Chris Pappas said "voters are hungry for … a new generation of leadership in the Senate," and Peggy Flanagan said "It is time for new leadership."' },
        { id: 'march-2025', on: true, cite: [AP],
          text: 'The Associated Press reports that the party\'s divisions over Senator Schumer\'s leadership opened in the spring of 2025, when he sided with Republicans on a spending vote.',
          you: 'The Associated Press reports that the party\'s divisions over your leadership opened in the spring of 2025, when you sided with Republicans on a spending vote.' },
        { id: 'compromise', cite: [TIME],
          text: 'TIME reports that critics say Senator Schumer is too willing to compromise and not forceful enough in confronting President Trump.',
          you: 'TIME reports that critics say you are too willing to compromise and not forceful enough in confronting President Trump.' },
        { id: 'aipac-pac', cite: [FEC_AIPAC],
          text: 'FEC filings list 33 contributions from AIPAC PAC to Senator Schumer\'s campaign committee, Friends of Schumer, totaling $43,400, from February to July 2022.',
          you: 'FEC filings list 33 contributions from AIPAC PAC to your campaign committee, Friends of Schumer, totaling $43,400, from February to July 2022.' },
        { id: 'aipac-earmark', cite: [SLUDGE],
          text: 'Sludge reports that AIPAC PAC\'s contributions to candidates are "overwhelmingly earmarked donations," meaning money from individual AIPAC members that the PAC passes on to a campaign.' },
        { id: 'norpac', cite: [FEC_NORPAC],
          text: 'FEC filings list $117,354 in contributions from NORPAC to Friends of Schumer from 2002 to 2021, including $85,100 on July 14, 2021.',
          you: 'FEC filings list $117,354 in contributions from NORPAC to your campaign committee from 2002 to 2021, including $85,100 on July 14, 2021.' },
        { id: 'aipac-vh', cite: [TIME],
          text: 'Senator Van Hollen has criticized Senator Schumer for his alignment with the pro-Israel lobbying group AIPAC.',
          you: 'Senator Van Hollen has criticized you for your alignment with the pro-Israel lobbying group AIPAC.' },
        { id: 'israel-aid', cite: [AJ],
          text: 'Senator Schumer said in February 2026: "We delivered more security assistance to Israel, our ally, under my leadership than ever, ever before."',
          you: 'You said in February 2026: "We delivered more security assistance to Israel, our ally, under my leadership than ever, ever before."' },
        { id: 'progressive', cite: [TIME],
          text: 'MoveOn, Indivisible and the Working Families Party opposed Senator Schumer, and in Michigan he backed Haley Stevens over the progressive candidate Abdul El-Sayed.',
          you: 'MoveOn, Indivisible and the Working Families Party opposed you, and in Michigan you backed Haley Stevens over the progressive candidate Abdul El-Sayed.' },
        { id: 'sanders', cite: [TIME],
          text: 'Asked about the direction the caucus needs, Senator Sanders said: "Do I think Chuck has been leading in that direction? No."' },
        { id: 'fav-yougov', cite: [HILL],
          text: 'An Economist/YouGov poll in April 2025 found 23 percent of U.S. adults had a favorable view of Senator Schumer and 51 percent unfavorable. A Marist poll the same spring found 53 percent of New Yorkers thought he should step down as leader.',
          you: 'An Economist/YouGov poll in April 2025 found 23 percent of U.S. adults had a favorable view of you and 51 percent unfavorable. A Marist poll the same spring found 53 percent of New Yorkers thought you should step down as leader.' },
        { id: 'emerson', cite: [EMERSON],
          text: 'In a November 2025 national survey released by Consensus Strategies with Emerson College Polling, 76 percent of likely voters said Senator Schumer should step down as leader, either right away or after 2026.',
          you: 'In a November 2025 national survey released by Consensus Strategies with Emerson College Polling, 76 percent of likely voters said you should step down as leader, either right away or after 2026.' }
      ],
      either: [
        { id: 'v257', vote: 'rc-119-2-257', cite: [vote(2, 257, 'November 9, 2026')],
          text: 'On November 9, 2026, Senator Schumer voted yes to move ahead with the permitting reform bill (BAAJA). 22 members of the Democratic caucus voted yes, 24 voted no and 1 did not vote.',
          you: 'On November 9, 2026, you voted yes to move ahead with the permitting reform bill (BAAJA). 22 members of the Democratic caucus voted yes, 24 voted no and 1 did not vote.' },
        { id: 'v128', vote: 'rc-119-1-128', cite: [vote(1, 128, 'March 14, 2025')],
          text: 'On March 14, 2025, Senator Schumer voted yes to end debate on H.R. 1968, the full-year funding bill. 10 members of the Democratic caucus voted yes and 37 voted no.',
          you: 'On March 14, 2025, you voted yes to end debate on H.R. 1968, the full-year funding bill. 10 members of the Democratic caucus voted yes and 37 voted no.' },
        { id: 'v455', vote: 'rc-119-1-455', cite: [vote(1, 455, 'July 30, 2025')],
          text: 'On July 30, 2025, Senator Schumer voted no on bringing up S.J.Res. 34, which would have blocked a weapons sale to Israel. 24 members of the Democratic caucus voted yes and 20 voted no.',
          you: 'On July 30, 2025, you voted no on bringing up S.J.Res. 34, which would have blocked a weapons sale to Israel. 24 members of the Democratic caucus voted yes and 20 voted no.' },
        { id: 'v618', vote: 'rc-119-1-618', cite: [vote(1, 618, 'November 10, 2025')],
          text: 'On November 10, 2025, Senator Schumer voted no on H.R. 5371, the funding bill that ended the fall 2025 shutdown. 8 members of the Democratic caucus voted yes.',
          you: 'On November 10, 2025, you voted no on H.R. 5371, the funding bill that ended the fall 2025 shutdown. 8 members of the Democratic caucus voted yes.' },
        { id: 'v7', vote: 'rc-119-1-7', cite: [vote(1, 7, 'January 20, 2025')],
          text: 'On January 20, 2025, Senator Schumer voted no on final passage of the Laken Riley Act (S. 5), an immigration detention bill. 12 members of the Democratic caucus voted yes.',
          you: 'On January 20, 2025, you voted no on final passage of the Laken Riley Act (S. 5), an immigration detention bill. 12 members of the Democratic caucus voted yes.' },
        { id: 'v17', vote: 'rc-119-1-17', cite: [vote(1, 17, 'January 25, 2025')],
          text: 'On January 25, 2025, Senator Schumer voted no on confirming Kristi Noem as Secretary of Homeland Security. 7 members of the Democratic caucus voted yes.',
          you: 'On January 25, 2025, you voted no on confirming Kristi Noem as Secretary of Homeland Security. 7 members of the Democratic caucus voted yes.' },
        { id: 'v318', vote: 'rc-119-1-318', cite: [vote(1, 318, 'June 17, 2025')],
          text: 'On June 17, 2025, Senator Schumer voted no on final passage of the GENIUS Act (S. 1582), rules for stablecoins. 18 members of the Democratic caucus voted yes.',
          you: 'On June 17, 2025, you voted no on final passage of the GENIUS Act (S. 1582), rules for stablecoins. 18 members of the Democratic caucus voted yes.' },
        { id: 'v203', vote: 'rc-119-2-203', cite: [vote(2, 203, 'July 22, 2026')],
          text: 'On July 22, 2026, Senator Schumer voted no on ending debate on Michael C. Martin, a nominee for federal judge in the Eastern District of Michigan. 11 members of the Democratic caucus voted yes.',
          you: 'On July 22, 2026, you voted no on ending debate on Michael C. Martin, a nominee for federal judge in the Eastern District of Michigan. 11 members of the Democratic caucus voted yes.' },
        { id: 'v254', vote: 'rc-119-2-254', cite: [vote(2, 254, 'September 30, 2026')],
          text: 'On September 30, 2026, Senator Schumer voted no on moving to H.R. 9340, a federal rule for who pays grid upgrades for large power users. 4 members of the Democratic caucus voted yes.',
          you: 'On September 30, 2026, you voted no on moving to H.R. 9340, a federal rule for who pays grid upgrades for large power users. 4 members of the Democratic caucus voted yes.' }
      ]
    },
    views: {
      for: ['I value steady, experienced leadership.', 'He just led the party to a big win, and that should count.', 'Changing leaders now would cost time the country does not have.', 'I would rather keep a leader who has been tested than start over.', 'He knows how to raise money and recruit candidates who win.'],
      against: ['I want a younger generation to take over leadership.', 'After so many progressive candidates won, I do not want a centrist leading the caucus.', 'I do not want our leader tied to AIPAC money.', 'I want leaders who will push back harder.', 'Leadership should change when voters ask for change.', 'I think new voices would help the party connect with voters.']
    },
    questions: {
      for: ['Why change leaders right after a strong election?', 'Who in the caucus has more experience getting bills through the Senate?', 'What would the caucus gain by starting over now?'],
      against: ['What message does it send to keep the same leader after voters asked for change?', 'Who will connect best with the voters who just showed up?', 'What would new leadership make possible in the next two years?']
    },
    otherSide: { for: 'Some people want a new face at the top, and I understand why.', against: 'Senator Schumer has long experience, and I respect that.' },
    civic: ['The leader vote is a closed caucus vote, so letters like this are one of the few ways people back home can weigh in.', 'Voters do not get a ballot in the leader race. This letter is my way to take part.'],
    record: { type: 'breaks' },
    reported: true,
    sources: [TIME, AP, PBS, AJ, NW, HILL, EMERSON, PROSPECT, BIO, REMARKS, FEC_AIPAC, FEC_NORPAC, SLUDGE]
  },

  {
    id: 'van-hollen-leader',
    menu: 'Senate Democratic leader: Chris Van Hollen (Yes Van Hollen / No Van Hollen)',
    title: 'Should Chris Van Hollen lead Senate Democrats?',
    status: 'Closed, secret-ballot vote of Democratic senators on December 1, 2026 (TIME). ABC News and the AP say early December, with no date announced.',
    summary: [
      'Senator Chris Van Hollen of Maryland announced on November 12 that he is running against Senator Chuck Schumer for Senate Democratic leader (TIME, AP). He is the only declared challenger (On Point Politics tracker).',
      'Senator Elissa Slotkin has called for new leadership but has not endorsed him, and Senator Brian Schatz is running for whip, the number two job (TIME, On Point Politics tracker). A winner needs a majority of the 55 or 56 Democratic votes, 28 or 29 (ABC News).',
      'Only the Democratic senators and the two independents who work with them vote. Newly elected senators vote; outgoing senators do not (ABC News).'
    ],
    searched: SEARCHED + 'Searched November 16, 2026. CNN, The Hill, Axios and the Washington Times did not load for us, so their reporting is not used. No poll of this race was found.',
    subject: 'V000128',
    about: {
      id: 'V000128',
      title: 'About Chris Van Hollen',
      facts: [
        { cite: [TIME], text: 'Elected to the Senate from Maryland in 2016 and reelected in 2022. Before that he served seven terms in the House.' },
        { cite: [TIME], text: 'He chaired the House Democrats\' campaign committee (DCCC) in 2008 and the Senate Democrats\' campaign committee (DSCC) in the 2018 cycle.' },
        { cite: [AP], text: 'He is 67. Senator Schumer is 75.' },
        { cite: [NW_VH, TIME], text: 'Before he entered the race, he said he was "kicking the tires" on a 2028 run for president.' }
      ]
    },
    voters: 'dem',
    question: 'Are you for or against Chris Van Hollen as Democratic leader?',
    labels: { for: 'Yes Van Hollen', against: 'No Van Hollen' },
    short: 'Chris Van Hollen for Senate Democratic leader',
    stand: { for: 'I support Chris Van Hollen for Senate Democratic leader.', against: 'I do not want Chris Van Hollen as Senate Democratic leader.' },
    also: { for: 'Please vote for Chris Van Hollen as Democratic leader on December 1.', against: 'Please do not vote for Chris Van Hollen as Democratic leader on December 1.' },
    topic: ['the vote for Democratic leader', 'Senator Van Hollen\'s run for leader', 'who should lead Senate Democrats'],
    asks: {
      for: ['Please vote for Chris Van Hollen for Democratic leader when the caucus meets on December 1.',
        'I ask you to support Senator Van Hollen for Democratic leader on December 1.',
        'When Senate Democrats choose their leader on December 1, I hope you will vote for Chris Van Hollen.'],
      forShort: ['Please vote for Senator Van Hollen.', 'Back Van Hollen for leader.'],
      against: ['Please do not vote for Chris Van Hollen for Democratic leader on December 1.',
        'I ask you not to support Senator Van Hollen for Democratic leader on December 1.',
        'When Senate Democrats choose their leader on December 1, I hope you will not vote for Chris Van Hollen.'],
      againstShort: ['Please do not vote for Senator Van Hollen.', 'Do not back Van Hollen for leader.']
    },
    special: {
      V000128: {
        for: ['I support your run for Democratic leader, and I hope the caucus picks you on December 1.', 'Thank you for running for leader. I am behind you for December 1.'],
        forShort: ['I back your run for leader.', 'I am glad you are running for leader.'],
        against: ['I respect your choice to run, but I ask you to step back from the race for Democratic leader.', 'I do not support your run for Democratic leader, and I ask you to reconsider.'],
        againstShort: ['I do not support your run for leader.', 'Please reconsider your run for leader.'],
        subject: { for: ['I support your run for leader', 'Behind your run for Democratic leader'], against: ['Your run for Democratic leader', 'Please reconsider your run for leader'] },
        call: { for: 'I support the Senator\'s run for Democratic leader.', against: 'I do not support the Senator\'s run for Democratic leader.' }
      },
      S000148: {
        for: ['I respect your years as leader, but I hope Senator Van Hollen wins the December 1 vote.', 'I support Senator Van Hollen for Democratic leader on December 1.'],
        forShort: ['I support Senator Van Hollen for leader.', 'I hope Senator Van Hollen wins.'],
        against: ['I do not support Senator Van Hollen for Democratic leader.', 'I hope the caucus does not choose Senator Van Hollen on December 1.'],
        againstShort: ['I do not support Senator Van Hollen for leader.', 'I hope Senator Van Hollen does not win.'],
        subject: { for: ['The December 1 leader vote', 'I support Senator Van Hollen for leader'], against: ['The December 1 leader vote', 'My view on the leader race'] },
        call: { for: 'I support Senator Van Hollen for Democratic leader.', against: 'I do not support Senator Van Hollen for Democratic leader.' }
      }
    },
    subjects: {
      for: ['Please vote for Senator Van Hollen on December 1', 'Chris Van Hollen for Democratic leader', 'The December 1 leader vote', 'From a constituent in {state}: Van Hollen for leader'],
      against: ['Please do not vote for Senator Van Hollen on December 1', 'The December 1 leader vote', 'My view on the Democratic leader vote', 'From a constituent in {state}: not Van Hollen']
    },
    call: { for: 'I would like Senator {last} to vote for Chris Van Hollen as Democratic leader on December 1.', against: 'I would like Senator {last} not to vote for Chris Van Hollen as Democratic leader on December 1.' },
    facts: {
      for: [
        { id: 'vh-why', on: true, cite: [TIME],
          text: 'Senator Van Hollen says the race is "not about any one individual" and that "a little democracy in the Senate Democratic Caucus is a good thing."',
          you: 'You have said the race is "not about any one individual" and that "a little democracy in the Senate Democratic Caucus is a good thing."' },
        { id: 'vh-agenda', on: true, cite: [TIME, FOX5_VH],
          text: 'He has pledged to use the Senate\'s full power to end the war in Iran and to lower the cost of living, which he calls a "kitchen table agenda."',
          you: 'You have pledged to use the Senate\'s full power to end the war in Iran and to lower the cost of living, which you call a "kitchen table agenda."' },
        { id: 'vh-backers', on: true, cite: [ABC_VH, TIME],
          text: 'Senator Bernie Sanders, Senator-elect Abdul El-Sayed of Michigan and Senator-elect Peggy Flanagan of Minnesota back him, and so does the Working Families Party.',
          you: 'Senator Bernie Sanders, Senator-elect Abdul El-Sayed of Michigan and Senator-elect Peggy Flanagan of Minnesota back you, and so does the Working Families Party.' },
        { id: 'vh-campaigns', cite: [TIME],
          text: 'He has run both party campaign committees: the DCCC in 2008 and the DSCC in the 2018 cycle.',
          you: 'You have run both party campaign committees: the DCCC in 2008 and the DSCC in the 2018 cycle.' },
        { id: 'vh-aipac', cite: [TIME],
          text: 'He has said the DSCC should not take AIPAC money. A tracker TIME cites shows the DSCC took $15,000 from AIPAC\'s PAC in the 2025 to 2026 cycle.',
          you: 'You have said the DSCC should not take AIPAC money. A tracker TIME cites shows the DSCC took $15,000 from AIPAC\'s PAC in the 2025 to 2026 cycle.' },
        { id: 'vh-coronation', cite: [NW_VH],
          text: 'Before he entered, he said: "There should be no coronation of the next Democratic leader."',
          you: 'Before you entered, you said: "There should be no coronation of the next Democratic leader."' },
        { id: 'vh-contest', cite: [TIME],
          text: 'TIME reports the last contested race for this job was in 1994.' }
      ],
      against: [
        { id: 'vh-schumer-votes', on: true, cite: [TIME, ABC_VH],
          text: 'Senator Schumer says he has "the votes to continue serving as Democratic Leader," and TIME counted 14 senators and senators-elect who publicly back him.' },
        { id: 'vh-underdog', on: true, cite: [TIME, ABC_VH],
          text: 'Senator Van Hollen calls himself the underdog and says he has more than 10 votes. A winner needs 28 or 29.',
          you: 'You call yourself the underdog and say you have more than 10 votes. A winner needs 28 or 29.' },
        { id: 'vh-king', on: true, cite: [ABC_VH],
          text: 'Senator Angus King, backing Senator Schumer, asked: "Why would you fire the manager when you just won the World Series?"' },
        { id: 'vh-2028', cite: [NW_VH],
          text: 'On November 9, before he entered, Newsweek reported he was "kicking the tires" on a 2028 run for president and "not looking to be the next Democratic leader."',
          you: 'On November 9, before you entered, Newsweek reported you were "kicking the tires" on a 2028 run for president and "not looking to be the next Democratic leader."' },
        { id: 'vh-plan', cite: [AP],
          text: 'The Associated Press reported on November 13 that he had not yet laid out his own agenda.',
          you: 'The Associated Press reported on November 13 that you had not yet laid out your own agenda.' },
        { id: 'vh-age', cite: [AP],
          text: 'He is 67. The Associated Press notes he is "not that much younger than Schumer, 75."',
          you: 'You are 67. The Associated Press notes you are "not that much younger than Schumer, 75."' },
        { id: 'vh-slotkin', cite: [TIME],
          text: 'Senator Elissa Slotkin, who will not back Senator Schumer, has not endorsed Senator Van Hollen either. She says she wants "a concrete plan that\'s definitely different."' }
      ],
      either: []
    },
    views: {
      for: ['I want new leadership in the Senate.', 'I want a leader who will fight harder for working families.', 'A contested race is good for the caucus.', 'I agree with his priorities.'],
      against: ['I value steady, experienced leadership.', 'I do not think now is the time to change leaders.', 'I want to hear a full plan before backing a new leader.', 'I would rather see a different candidate for leader.']
    },
    questions: {
      for: ['What would new leadership make possible in the next two years?', 'Who will push hardest on the cost of living?', 'Should the caucus have a real choice for leader?'],
      against: ['Why change leaders right after a strong election?', 'What is the full plan for the caucus?', 'Who has the votes to lead from day one?']
    },
    otherSide: { for: 'Senator Schumer has long experience and just helped win a bigger majority, and I respect that.', against: 'Some people want a new face at the top, and I understand why.' },
    civic: ['The leader vote is a closed caucus vote, so letters like this are one of the few ways people back home can weigh in.', 'Voters do not get a ballot in the leader race. This letter is my way to take part.'],
    sources: [TIME, AP, ABC_VH, NW_VH, FOX5_VH, TRACKER]
  },

  {
    id: 'permitting-baaja',
    menu: 'Permitting reform bill (BAAJA, S. 5653)',
    title: 'The permitting reform bill (BAAJA)',
    status: 'The Senate voted [73 to 25](' + ours(2, 257) + ') on November 9 and [62 to 21](' + ours(2, 258) + ') on November 10, 2026 to take up the bill. No final vote as of November 12.',
    summary: [
      'The Bipartisan American Affordability and Jobs Act of 2026 (S. 5653) changes how federal permits are reviewed for energy and building projects, including power lines, pipelines, and wind and solar. It sets deadlines for reviews and limits court challenges. Sponsors: Senators Capito (R-W.Va.), Lee (R-Utah), Whitehouse (D-R.I.) and Heinrich (D-N.M.).',
      'On November 9 the Senate voted [73 to 25](' + ours(2, 257) + ') to end debate on taking up the bill, using a House bill (H.R. 2347) as the vehicle, and on November 10 it voted [62 to 21](' + ours(2, 258) + ') to take it up. Those were first steps, not final passage. The Senate vote list through November 12 shows no final vote yet.'
    ],
    searched: SEARCHED + 'Searched November 11 to 15, 2026, including the bill text, the sponsors, industry groups, environmental groups and tribal groups.',
    voters: 'all',
    question: 'Are you for or against the permitting reform bill (BAAJA)?',
    labels: { for: 'For the bill', against: 'Against the bill' },
    short: 'the permitting reform bill (BAAJA, S. 5653)',
    stand: { for: 'I support the permitting reform bill, BAAJA (S. 5653).', against: 'I oppose the permitting reform bill, BAAJA (S. 5653).' },
    also: { for: 'Please vote yes on the permitting reform bill, BAAJA (S. 5653).', against: 'Please vote no on the permitting reform bill, BAAJA (S. 5653).' },
    topic: ['the permitting reform bill (BAAJA)', 'the Bipartisan American Affordability and Jobs Act', 'S. 5653, the permitting bill'],
    asks: {
      for: ['Please vote yes on the permitting reform bill, the Bipartisan American Affordability and Jobs Act (S. 5653).',
        'I ask you to support BAAJA, the permitting reform bill, when it comes up for a final vote.',
        'When the permitting bill comes up for final passage, I hope you will vote yes.',
        'I am writing to ask you to pass the Bipartisan American Affordability and Jobs Act.'],
      forShort: ['Please vote yes on BAAJA.', 'Pass the permitting bill.'],
      against: ['Please vote no on the permitting reform bill, the Bipartisan American Affordability and Jobs Act (S. 5653), as it is written now.',
        'I ask you to oppose BAAJA, the permitting reform bill, when it comes up for a final vote.',
        'When the permitting bill comes up for final passage, I hope you will vote no.',
        'I am writing to ask you not to pass the Bipartisan American Affordability and Jobs Act in its current form.'],
      againstShort: ['Please vote no on BAAJA.', 'Do not pass the permitting bill as written.']
    },
    subjects: {
      for: ['Please vote yes on BAAJA (S. 5653)', 'Support the permitting reform bill', 'From a constituent in {state}: pass BAAJA', 'My view on the permitting bill'],
      against: ['Please vote no on BAAJA (S. 5653)', 'Oppose the permitting bill as written', 'From a constituent in {state}: vote no on BAAJA', 'My view on the permitting bill']
    },
    call: { for: 'I would like Senator {last} to vote yes on the permitting reform bill, BAAJA, S. 5653.', against: 'I would like Senator {last} to vote no on the permitting reform bill, BAAJA, S. 5653.' },
    facts: {
      for: [
        { id: 'deadlines', on: true, cite: [BILL_S5653],
          text: 'The bill sets deadlines: one year for an environmental assessment and two years for a full environmental impact statement.' },
        { id: 'datacenters', on: true, cite: [SPONSORS, ABQ],
          text: 'Under the bill, data centers would have to pay all of their own power line and grid connection costs.' },
        { id: 'both-industries', on: true, cite: [ICN],
          text: 'Both the American Clean Power Association and the American Petroleum Institute support the bill, and its sponsors are two Republicans and two Democrats.' },
        { id: 'savings', cite: [ICN],
          text: 'The Center for Climate and Energy Solutions estimates the bill would save households about $2.5 billion a year and add more wind, solar and battery storage.' },
        { id: 'lines', cite: [ABQ],
          text: 'The bill gives federal regulators limited authority to approve interstate power lines that fail to get state permits.' },
        { id: 'certainty', cite: [SPONSORS],
          text: 'The sponsors say projects that get permits would keep them "absent extraordinary circumstances, violations of law, or court order," so builders can count on them.' },
        { id: 'white-house', cite: [ICN],
          text: 'President Trump called it "a great bill" and said "We are behind it 100 percent."' }
      ],
      against: [
        { id: 'courts', on: true, cite: [BILL_S5653],
          text: 'The bill gives people 150 days to sue over a permit, tells courts to give agencies "substantial deference," and lets a permit stay in effect while a flawed review is fixed.' },
        { id: 'pipelines', on: true, cite: [BILL_S5653],
          text: 'Section 1102 of the bill takes a category of natural gas pipeline actions out of federal environmental review.' },
        { id: 'tribes', on: true, cite: [ICN, NARF],
          text: 'The Native American Rights Fund says the bill cuts back tribal consultation, and tribal groups asked to delay it or remove the historic preservation changes.' },
        { id: 'future-presidents', cite: [ICN],
          text: 'Critics say the permit protections would keep a future President from stopping fossil fuel projects approved now.' },
        { id: 'wind', cite: [ICN],
          text: 'While the Senate was voting on November 9, President Trump said: "I will not approve wind turbines because wind turbines are a major loser."' },
        { id: 'hearing', cite: [CD],
          text: 'Senator Jeff Merkley said the bill never had a public hearing.' }
      ]
    },
    views: {
      for: ['Projects of every kind take too long to approve.', 'We need to build power lines and clean energy faster.', 'Clear deadlines are fair to everyone.', 'Lower power bills matter to my family.'],
      against: ['Faster permits should not come at the cost of fewer protections.', 'People should keep a fair chance to challenge a project in court.', 'A bill this big deserves public hearings first.', 'Tribes and local communities should have a real say.']
    },
    questions: {
      for: ['How many good projects stall for years waiting on paperwork?', 'Who pays when power lines are not built?', 'If not this bill, then what?'],
      against: ['Who speaks up for a community once a permit cannot be stopped?', 'Why move a bill this big without full public hearings?', 'What happens to tribal consultation under these rules?']
    },
    otherSide: { for: 'I know some groups worry about the limits on lawsuits, and I take that seriously.', against: 'I agree that permits take too long and that we need more power lines.' },
    civic: ['This bill changes rules that will last for years, so I want my view on the record with your office before the final vote.', 'Big changes to how projects are approved affect everyone, and this letter is my way to take part.'],
    record: {
      type: 'rollcall',
      date: 'November 9, 2026',
      short: 'to move ahead with the bill',
      what: 'moving ahead with the permitting bill (cloture on the motion to proceed to H.R. 2347)',
      url: rc(2, 257),
      ours: 'rc-119-2-257',
      yea: 'Blumenthal,Coons,Cortez Masto,Fetterman,Gallego,Gillibrand,Heinrich,Hickenlooper,Kim,King,Klobuchar,Ossoff,Peters,Reed,Rosen,Schatz,Schumer,Shaheen,Slotkin,Warner,Warnock,Whitehouse',
      nay: 'Alsobrooks,Baldwin,Bennet,Blunt Rochester,Booker,Cantwell,Duckworth,Durbin,Hassan,Hirono,Kaine,Kelly,Luján,Markey,Merkley,Murray,Padilla,Schiff,Smith,Van Hollen,Warren,Welch,Wyden,Sanders,Rounds',
      nv: 'Murphy,Sheehy',
      rest: 'Yea',
      check: { yea: 73, nay: 25, nv: 2 },
      lines: {
        for: {
          Yea: ['Thank you for voting yes on {what} on {date}. Please vote yes again on final passage.', 'You voted yes to move ahead with it on {date}. I hope you will finish the job.'],
          Nay: ['I saw that you voted no on {what} on {date}. I hope you will take another look before the final vote.', 'You voted no on moving ahead with it on {date}. I respectfully ask you to reconsider.']
        },
        against: {
          Yea: ['I saw that you voted yes on {what} on {date}. Moving ahead is not the same as passing it, and I ask you to vote no on the final bill.', 'You voted yes to move ahead with it on {date}. I hope you will vote no on final passage.'],
          Nay: ['Thank you for voting no on {what} on {date}. Please hold that line on the final vote.', 'You voted no on moving ahead with it on {date}. Thank you. Please vote no again.']
        },
        nv: 'The Senate record shows you did not vote on {what} on {date}.'
      }
    },
    sources: [vote(2, 257, 'November 9, 2026'), vote(2, 258, 'November 10, 2026'), BILL_S5653, SPONSORS, ICN, ABQ, CD, NARF,
      c('Senate floor log', 'November 10, 2026', 'https://www.dailypress.senate.gov/tuesday-november-10-2026/')]
  },

  {
    id: 'veterans-hr9237',
    menu: 'Veterans benefits bill with sleep apnea and tinnitus changes (H.R. 9237)',
    title: 'The House veterans bill (H.R. 9237)',
    status: 'Passed the House by [voice vote](' + ACTIONS_9237 + ') on November 11, 2026, so there is no roll call. The Senate has not voted.',
    summary: [
      'H.R. 9237, the Take Care of America\'s Veterans Act, bundles more than 60 veterans measures. It adds a benefit for combat-injured military retirees (the Major Richard Star Act). To help pay for it, Section 108 lowers disability ratings for sleep apnea and tinnitus on future claims. The bill says ratings already in effect are protected.',
      'The House passed it by [voice vote](' + ACTIONS_9237 + ') on November 11, so there is no list of how each member voted. The Senate version is S. 4744. It must pass both chambers by January 3 or it dies.'
    ],
    searched: SEARCHED + 'Searched November 14 and 15, 2026, including the bill text, veterans groups, and statements from both parties. The against side has more points because more sourced criticism has been published so far.',
    voters: 'all',
    question: 'Are you for or against the Senate passing H.R. 9237 as the House passed it?',
    labels: { for: 'For the bill', against: 'Against the bill' },
    short: "H.R. 9237, the Take Care of America's Veterans Act",
    stand: { for: "I support H.R. 9237, the Take Care of America's Veterans Act.", against: 'I oppose H.R. 9237 unless the sleep apnea and tinnitus rating cuts are removed.' },
    also: { for: "Please vote yes on H.R. 9237, the Take Care of America's Veterans Act.", against: 'Please vote no on H.R. 9237 unless the sleep apnea and tinnitus rating cuts are removed.' },
    topic: ['the House veterans bill, H.R. 9237', 'the Take Care of America\'s Veterans Act', 'H.R. 9237 and its sleep apnea and tinnitus changes'],
    asks: {
      for: ['Please vote yes on H.R. 9237, the Take Care of America\'s Veterans Act, as the House passed it.',
        'I ask you to support the Take Care of America\'s Veterans Act when it comes to the Senate.',
        'When the House veterans bill reaches the Senate, I hope you will vote yes.',
        'I am writing to ask you to pass H.R. 9237 this year.'],
      forShort: ['Please pass H.R. 9237.', 'Vote yes on the veterans bill.'],
      against: ['Please vote no on H.R. 9237 as the House passed it, because of the cuts to sleep apnea and tinnitus ratings.',
        'I ask you to oppose the Take Care of America\'s Veterans Act unless the rating cuts in Section 108 are removed.',
        'When the House veterans bill reaches the Senate, I hope you will vote no on it as written.',
        'I am writing to ask you not to pass H.R. 9237 with the sleep apnea and tinnitus changes.'],
      againstShort: ['Please vote no on H.R. 9237 as written.', 'Take the rating cuts out of the veterans bill.']
    },
    subjects: {
      for: ['Please pass H.R. 9237', 'Support the Take Care of America\'s Veterans Act', 'From a constituent in {state}: pass the veterans bill', 'My view on H.R. 9237'],
      against: ['Please vote no on H.R. 9237 as written', 'Remove the sleep apnea and tinnitus cuts', 'From a constituent in {state}: no on H.R. 9237 as written', 'My view on H.R. 9237']
    },
    call: { for: 'I would like Senator {last} to vote yes on H.R. 9237, the Take Care of America\'s Veterans Act.', against: 'I would like Senator {last} to vote no on H.R. 9237 unless the sleep apnea and tinnitus rating cuts are removed.' },
    facts: {
      for: [
        { id: 'star', on: true, cite: [MT],
          text: 'The package pays for the Major Richard Star Act, a new benefit for combat-injured military retirees, and bundles more than 60 veterans measures.' },
        { id: 'protected', on: true, cite: [BILL_HR9237],
          text: 'The bill text protects disability ratings already in effect. The rating changes apply to future claims (Section 108).' }
      ],
      against: [
        { id: 'cost', on: true, cite: [SS],
          text: 'A VA analysis cited by veterans groups says the sleep apnea and tinnitus changes cut up to $57 billion in benefits over 10 years and affect up to 1.5 million veterans.' },
        { id: 'ratings', on: true, cite: [BILL_HR9237],
          text: 'Today a veteran with sleep apnea who uses a CPAP machine usually gets a 50 percent rating. Under Section 108, partial relief from treatment would mean 10 percent, and tinnitus would lose its own 10 percent rating in most cases.' },
        { id: 'vfw', cite: [SS],
          text: 'The VFW called the package "the largest net benefit cut since the Great Depression."' },
        { id: 'voice', cite: [MT, c('Congress.gov, H.R. 9237 actions', 'November 11, 2026', ACTIONS_9237)],
          text: 'The House passed it by voice vote on Veterans Day, so there is no record of how each member voted.' },
        { id: 'star-alone', cite: [MILCOM],
          text: 'On November 12, the House also passed the Major Richard Star Act on its own (H.R. 2102), without the sleep apnea and tinnitus cuts.' },
        { id: 'blumenthal', cite: [BLUM],
          text: 'Senator Richard Blumenthal, the top Democrat on the Senate Veterans\' Affairs Committee, opposes the cuts and says they will be defeated in the Senate.' }
      ]
    },
    views: {
      for: ['Combat-injured retirees have waited long enough.', 'A big package that helps many veterans is worth passing this year.', 'It is fair to match ratings to how well treatment works.', 'I would rather pass this now than start over next year.'],
      against: ['Future veterans should not lose benefits to pay for other veterans.', 'One group of veterans should not pay for another.', 'A change this big deserved a recorded vote.', 'Pass the Star Act on its own, without the cuts.']
    },
    questions: {
      for: ['How much longer should combat-injured retirees wait?', 'If this package fails, what happens to the other 60 measures in it?', 'Is there a better way to get this done before January?'],
      against: ['Why should future veterans pay for a benefit for other veterans?', 'Why did the House pass this without a recorded vote?', 'Can the Star Act pass on its own instead?']
    },
    otherSide: { for: 'I know veterans groups object to the sleep apnea and tinnitus changes, and I take that seriously.', against: 'I support the Star Act benefit for combat-injured retirees.' },
    civic: ['The House passed this by voice vote, so there is no record of who voted how. The Senate vote is where people back home can be heard.', 'This bill affects veterans for years to come, so I want my view on the record with your office.'],
    sources: [BILL_HR9237, c('Congress.gov, H.R. 9237 actions (voice vote)', 'November 11, 2026', ACTIONS_9237), MT, SS, MILCOM, BLUM]
  }
  ];
})();
