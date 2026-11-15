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
     A voice vote has no roll call; link the official record of the action instead.
   - "record" is optional: a Senate roll call with how each senator voted ("short" is the card label).
     Names are last names; add -ST when two senators share a last name (Scott-FL).
     "rest" is the vote of every senator not listed; "check" must match the official totals.
   Placeholders you can use in text: {S} (Senator Last), {last}, {state}. */
(function () {
  'use strict';
  var RC = 'https://www.senate.gov/legislative/LIS/roll_call_votes/';
  var rc = function (sess, n) { return RC + 'vote119' + sess + '/vote_119_' + sess + '_' + ('0000' + n).slice(-5) + '.htm'; };
  function c(src, date, url) { return { src: src, date: date, url: url }; }

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

  var SEARCHED = 'How we built this list: we searched news reports from outlets across the spectrum, official records (Senate roll calls, bill text, FEC filings) and statements from people on both sides, and we kept every point we could tie to a source. We publish both sides the same way and do not take a side. ';

  window.CS_ISSUES = [
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
    voters: 'dem',
    question: 'Are you for or against Chuck Schumer as Democratic leader?',
    labels: { for: 'For Schumer', against: 'Against Schumer' },
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
        { id: 'v257', cite: [vote(2, 257, 'November 9, 2026')],
          text: 'On November 9, 2026, Senator Schumer voted yes to move ahead with the permitting reform bill (BAAJA). 22 members of the Democratic caucus voted yes and 25 voted no.',
          you: 'On November 9, 2026, you voted yes to move ahead with the permitting reform bill (BAAJA). 22 members of the Democratic caucus voted yes and 25 voted no.' },
        { id: 'v128', cite: [vote(1, 128, 'March 14, 2025')],
          text: 'On March 14, 2025, Senator Schumer voted yes to end debate on H.R. 1968, the full-year funding bill. 10 members of the Democratic caucus voted yes and 37 voted no.',
          you: 'On March 14, 2025, you voted yes to end debate on H.R. 1968, the full-year funding bill. 10 members of the Democratic caucus voted yes and 37 voted no.' },
        { id: 'v455', cite: [vote(1, 455, 'July 30, 2025')],
          text: 'On July 30, 2025, Senator Schumer voted no on bringing up S.J.Res. 34, which would have blocked a weapons sale to Israel. 24 members of the Democratic caucus voted yes and 20 voted no.',
          you: 'On July 30, 2025, you voted no on bringing up S.J.Res. 34, which would have blocked a weapons sale to Israel. 24 members of the Democratic caucus voted yes and 20 voted no.' },
        { id: 'v618', cite: [vote(1, 618, 'November 10, 2025')],
          text: 'On November 10, 2025, Senator Schumer voted no on H.R. 5371, the funding bill that ended the fall 2025 shutdown. 8 members of the Democratic caucus voted yes.',
          you: 'On November 10, 2025, you voted no on H.R. 5371, the funding bill that ended the fall 2025 shutdown. 8 members of the Democratic caucus voted yes.' },
        { id: 'v7', cite: [vote(1, 7, 'January 20, 2025')],
          text: 'On January 20, 2025, Senator Schumer voted no on final passage of the Laken Riley Act (S. 5), an immigration detention bill. 12 members of the Democratic caucus voted yes.',
          you: 'On January 20, 2025, you voted no on final passage of the Laken Riley Act (S. 5), an immigration detention bill. 12 members of the Democratic caucus voted yes.' },
        { id: 'v17', cite: [vote(1, 17, 'January 25, 2025')],
          text: 'On January 25, 2025, Senator Schumer voted no on confirming Kristi Noem as Secretary of Homeland Security. 7 members of the Democratic caucus voted yes.',
          you: 'On January 25, 2025, you voted no on confirming Kristi Noem as Secretary of Homeland Security. 7 members of the Democratic caucus voted yes.' },
        { id: 'v318', cite: [vote(1, 318, 'June 17, 2025')],
          text: 'On June 17, 2025, Senator Schumer voted no on final passage of the GENIUS Act (S. 1582), rules for stablecoins. 18 members of the Democratic caucus voted yes.',
          you: 'On June 17, 2025, you voted no on final passage of the GENIUS Act (S. 1582), rules for stablecoins. 18 members of the Democratic caucus voted yes.' },
        { id: 'v203', cite: [vote(2, 203, 'July 22, 2026')],
          text: 'On July 22, 2026, Senator Schumer voted no on ending debate on Michael C. Martin, a nominee for federal judge in the Eastern District of Michigan. 11 members of the Democratic caucus voted yes.',
          you: 'On July 22, 2026, you voted no on ending debate on Michael C. Martin, a nominee for federal judge in the Eastern District of Michigan. 11 members of the Democratic caucus voted yes.' },
        { id: 'v254', cite: [vote(2, 254, 'September 30, 2026')],
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
    id: 'permitting-baaja',
    menu: 'Permitting reform bill (BAAJA, S. 5653)',
    title: 'The permitting reform bill (BAAJA)',
    status: 'The Senate voted [73 to 25](' + rc(2, 257) + ') on November 9 and [62 to 21](' + rc(2, 258) + ') on November 10, 2026 to take up the bill. No final vote as of November 12.',
    summary: [
      'The Bipartisan American Affordability and Jobs Act of 2026 (S. 5653) changes how federal permits are reviewed for energy and building projects, including power lines, pipelines, and wind and solar. It sets deadlines for reviews and limits court challenges. Sponsors: Senators Capito (R-W.Va.), Lee (R-Utah), Whitehouse (D-R.I.) and Heinrich (D-N.M.).',
      'On November 9 the Senate voted [73 to 25](' + rc(2, 257) + ') to end debate on taking up the bill, using a House bill (H.R. 2347) as the vehicle, and on November 10 it voted [62 to 21](' + rc(2, 258) + ') to take it up. Those were first steps, not final passage. The Senate vote list through November 12 shows no final vote yet.'
    ],
    searched: SEARCHED + 'Searched November 11 to 15, 2026, including the bill text, the sponsors, industry groups, environmental groups and tribal groups.',
    voters: 'all',
    question: 'Are you for or against the permitting reform bill (BAAJA)?',
    labels: { for: 'For the bill', against: 'Against the bill' },
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
