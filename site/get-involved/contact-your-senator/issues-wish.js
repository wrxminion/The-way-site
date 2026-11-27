/* "We wish we had this" issues (D310, Nov 27 2026). Public records that are hidden, partial or hard to get.
   Same rules as issues.js: every fact has its source, plain words, no em dashes, both sides from real sources.
   These issues go to both chambers (chamber: 'both'), so they show on the Senate page and the House page.
   The page that lists them is /get-involved/wish-we-had-this/. Each card there links here with ?issue=ID.
   "for" = make the record public (or keep it public). "against" = keep the rules as they are. Neither side is ours. */
(function () {
  'use strict';
  if (!window.CS_ISSUES) return;
  function c(src, date, url) { return { src: src, date: date, url: url }; }
  var SEARCHED = 'How we built this list: we read official records and news reports from outlets across the spectrum, and kept every point we could tie to a source. We publish both sides the same way and do not take a side. Searched November 27, 2026. ';

  /* Sources */
  var BOULDER_MEMO = c('City of Boulder, City Council agenda item 3G (Franco settlement)', 'June 21, 2022', 'https://webappsprod.bouldercolorado.gov/mailing-lists/mailman-archive/bouldercouncilhotline/attachments/20220617/54aed551/attachment.pdf');
  var BB_2022 = c('Boulder Beat', 'July 15, 2022', 'https://boulderbeat.news/2022/07/15/police-payouts/');
  var BB_2021 = c('Boulder Beat', 'January 2, 2021', 'https://boulderbeat.news/2021/01/02/city-settles-with-man-tased-by-boulder-police-officer/');
  var IJ_2021 = c('Insurance Journal (Associated Press)', 'January 11, 2021', 'https://www.insurancejournal.com/news/west/2021/01/11/597018.htm');
  var WW_STEWART = c('Westword', '2022', 'https://www.westword.com/news/boulder-pays-13-million-to-settle-coleman-stewart-police-shooting-lawsuit-14624473/');
  var BRL_2024 = c('Boulder Reporting Lab', 'May 2, 2024', 'https://boulderreportinglab.org/?p=66559');
  var BW_2024 = c('Boulder Weekly', 'May 8, 2024', 'https://boulderweekly.com/news/boco-briefly-may-8-2024/');
  var MARSHALL = c('The Marshall Project, with NBC News', 'December 18, 2020', 'https://www.themarshallproject.org/2020/12/18/colorado-tries-new-way-to-punish-rogue-cops');
  var KUNC = c('KUNC', 'September 10, 2021', 'https://www.kunc.org/kunc/2021-09-10/company-pitches-liability-insurance-for-colorado-cops-following-passage-of-police-reform-law');
  var BJS = c('Bureau of Justice Statistics, National Law Enforcement Accountability Database', 'read November 27, 2026', 'https://bjs.ojp.gov/national-law-enforcement-accountability-database');
  var NPR_NLEAD = c('NPR', 'February 28, 2025', 'https://www.npr.org/2025/02/28/nx-s1-5305281/trump-police-misconduct-database-background-checks');

  var BRENNAN = c('Brennan Center for Justice', 'May 7, 2025', 'https://www.brennancenter.org/our-work/research-reports/dark-money-hit-record-high-19-billion-2024-federal-races');
  var TPR = c('Texas Public Radio, The Source', 'July 29, 2026', 'https://www.tpr.org/podcast/the-source/2026-07-29/dark-money-becomes-a-formidable-force-in-american-elections');
  var JOFA = c('Journal of Accountancy', 'May 27, 2020', 'https://www.journalofaccountancy.com/news/2020/may/irs-reporting-by-tax-exempt-organizations.html');
  var VENABLE = c('Venable LLP', 'May 29, 2020', 'https://www.venable.com/insights/publications/2020/05/irs-issues-final-regulations-on-nonprofit-donor');
  var STRIPES = c('Stars and Stripes, opinion by Heather Lauer, People United for Privacy Foundation', 'January 6, 2025', 'https://www.stripes.com/opinion/2025-01-06/dark-money-not-the-boogeyman-16392703.html');

  var GAO_EAR = c('U.S. Government Accountability Office, GAO-26-107944', 'July 16, 2026', 'https://www.gao.gov/products/gao-26-107944');
  var LEGIS1 = c('Legis1', 'July 21, 2026', 'https://legis1.com/news/congressional-earmarks-spending-return-with-catch');
  var RC_EAR = c('Roll Call', 'February 17, 2026', 'https://rollcall.com/2026/02/17/earmarks-flood-spending-bills-after-a-years-hiatus/');

  var CASE_OMB = c('Court record, Protect Democracy Project v. OMB, No. 1:25-cv-01111 (D.D.C.), Civil Rights Litigation Clearinghouse', 'read November 27, 2026', 'https://clearinghouse.net/case/46392/');
  var RC_APP = c('Roll Call', 'August 19, 2025', 'https://rollcall.com/2025/08/19/white-house-restores-spending-database-it-sought-to-keep-secret/');
  var GOVEXEC = c('Government Executive (States Newsroom)', 'July 21, 2025', 'https://www.govexec.com/management/2025/07/judge-orders-trump-administration-stop-violating-law-and-publish-spending-details/406876/');

  var ODNI = c('Office of the Director of National Intelligence, release 39-25', 'October 31, 2025', 'https://www.odni.gov/4623/pr-39-25/');
  var EG_NIP = c('ExecutiveGov', 'November 3, 2025', 'https://www.executivegov.com/?p=278729');
  var EG_MIP = c('ExecutiveGov', 'November 4, 2025', 'https://www.executivegov.com/articles/dod-fy2025-military-intelligence-program-budget');

  var FOX_LOGS = c('Fox News', 'February 11, 2025', 'https://www.foxnews.com/politics/white-house-not-release-visitor-logs-during-trumps-second-term');
  var PW_LOGS = c('Political Wire, citing the Washington Examiner', 'February 11, 2025', 'https://politicalwire.com/2025/02/11/white-house-will-not-release-visitor-logs/');
  var PBS_LOGS = c('PBS NewsHour (Associated Press)', 'April 14, 2017', 'https://www.pbs.org/newshour/nation/white-house-says-wont-release-visitor-records');
  var WH_VD = c('whitehouse.gov, Voluntary Disclosure Policy (the 2021 policy, still posted)', 'read November 27, 2026', 'https://www.whitehouse.gov/VoluntaryDisclosure');

  var SKADDEN = c('Skadden, Arps, Slate, Meagher & Flom', 'February 6, 2025', 'https://www.skadden.com/insights/publications/2025/02/attorney-general-announces-shift-in-foreign-agents');
  var CYBERSCOOP = c('CyberScoop', 'February 6, 2025', 'https://cyberscoop.com/doj-disbands-foreign-influence-task-force/');
  var SALON = c('Salon', 'February 6, 2025', 'https://salon.com/2025/02/06/an-invitation-to-foreign-actors-bondi-tells-doj-to-quit-worrying-about-foreign-lobbying-campaigns');
  var FARA = c('U.S. Department of Justice, FARA eFile public filings', 'read November 27, 2026', 'https://efile.fara.gov/ords/fara/f?p=1381:1');

  var LAW_13104 = c('The law: 5 U.S.C. 13104(a)(5)(A) (Cornell Legal Information Institute)', 'read November 27, 2026', 'https://www.law.cornell.edu/uscode/text/5/13104');
  var LWV = c('League of Women Voters of the United States, policy paper on judicial financial disclosure', 'undated, after 2023', 'https://my.lwv.org/sites/default/files/leagues/new-orleans/fjspolicypaperfinancialdisclosure1.pdf');
  var JEFS = c('U.S. Courts, Federal Judicial Financial Disclosure Reports', 'read November 27, 2026', 'https://pub.jefs.uscourts.gov/');

  /* Fills the parts every "wish" issue shares. */
  function W(o) {
    var seen = {}, sources = [];
    ['for', 'against'].forEach(function (k) {
      (o.facts[k] || []).forEach(function (f) {
        f.cite.forEach(function (s) { if (!seen[s.url]) { seen[s.url] = 1; sources.push(s); } });
      });
    });
    return {
      id: o.id, chamber: 'both', voters: 'all', wish: true, scope: o.scope || 'national', states: o.states,
      menu: o.menu, title: o.title, status: o.status, summary: o.summary,
      searched: SEARCHED + (o.searched || ''),
      question: o.question,
      labels: o.labels || { for: 'Make it public', against: 'Keep the rules as they are' },
      short: o.short, stand: o.stand, also: o.also, topic: o.topic, asks: o.asks,
      subjects: o.subjects || {
        for: ['Please make ' + o.short + ' public', 'From a constituent in {state}: ' + o.short, 'A request about ' + o.short, 'My view on ' + o.short],
        against: ['My view on ' + o.short, 'From a constituent in {state}: ' + o.short, 'Please keep the current rules on ' + o.short, 'About ' + o.short]
      },
      call: o.call, facts: o.facts, views: o.views, questions: o.questions, otherSide: o.otherSide,
      civic: o.civic || ['Public records are how people check the people who work for them, so I want my view on the record with your office.', 'I am asking because I want to be able to check this myself.'],
      sources: sources
    };
  }

  var WISH = [

  W({
    id: 'wish-police-payouts', scope: ['local', 'national'], states: ['CO'], /* scope and states: the National, State and Local filters (D298) */
    menu: 'Police misconduct payouts: a public record of what cities pay',
    title: 'Police misconduct payouts and records: what cities pay, and who can see it',
    status: 'There is no national public list of what cities pay to settle police cases. A federal database of misconduct records for federal officers was shut down on January 20, 2025.',
    summary: [
      'Boulder, Colorado paid at least $5.47 million in seven settlements of lawsuits and claims about its police from 2020 to 2024 (city records and local news). We found no single city list of these payments; we added them up from news reports and city council papers.',
      'Under Colorado law (SB20-217), an officer who loses a case in state court and did not act in good faith may pay 5 percent of the damages, up to $25,000. The city or county pays the rest (The Marshall Project). In 2021 a Texas company offered Colorado officers their own liability insurance for about $25 a month (KUNC).',
      'A federal database of misconduct records for federal officers was created in 2022, opened in December 2023, and shut down when its executive order was revoked on January 20, 2025 (Bureau of Justice Statistics, NPR).'
    ],
    searched: 'Each Boulder payment is in at least two sources. One more report (two 2019 cases, $220,000 together) had only one source, so we left it out.',
    question: 'Should cities and the federal government keep a public record of police misconduct cases and the money paid to settle them?',
    short: 'a public record of police misconduct payouts',
    stand: { for: 'I want a public record of police misconduct cases and the tax money paid to settle them.', against: 'I do not think a new public record of police misconduct cases and payouts is needed.' },
    also: { for: 'Please support a public record of police misconduct cases and the money paid to settle them.', against: 'Please do not create a new public record of police misconduct cases without protecting officers\' fair treatment.' },
    topic: ['police misconduct payouts', 'a public record of police settlements', 'police accountability records'],
    asks: {
      for: ['Please support a law that makes every city and federal agency publish what it pays to settle police misconduct cases each year.',
        'I ask you to help bring back a national record of police misconduct, and to make the totals public.',
        'If you think police should carry their own liability insurance, as some have proposed, I hope you will look into it.',
        'I am writing to ask for a public, yearly record of police misconduct payouts in my area.'],
      forShort: ['Publish police payouts.', 'Bring back the misconduct database.'],
      against: ['Please do not add new reporting rules for police without hearing from officers and the cities that hire them.',
        'I ask you to keep police records decisions with local governments.',
        'When this comes up, I hope you will protect officers\' fair treatment.',
        'I am writing to ask you not to create a new national police misconduct database.'],
      againstShort: ['Leave it to local governments.', 'Protect officers\' fair treatment.']
    },
    call: { for: 'I would like {S} to support a public, yearly record of police misconduct cases and the money paid to settle them.', against: 'I would like {S} not to create a new national police misconduct database.' },
    facts: {
      for: [
        { id: 'pp-boulder', on: true, cite: [BOULDER_MEMO, BB_2022, BB_2021, BRL_2024],
          text: 'Boulder, Colorado paid at least $5.47 million in seven settlements of cases about its police from 2020 to 2024. The largest was $2 million in 2022.' },
        { id: 'pp-co-law', on: true, cite: [MARSHALL],
          text: 'Under Colorado law, an officer who did not act in good faith may pay 5 percent of the damages, up to $25,000. The city or county pays the rest.' },
        { id: 'pp-insure', cite: [KUNC],
          text: 'In 2021 a Texas company offered Colorado officers liability insurance for about $25 a month.' },
        { id: 'pp-nlead', on: true, cite: [BJS, NPR_NLEAD],
          text: 'The federal database of misconduct records for federal officers was shut down after its executive order was revoked on January 20, 2025.' },
        { id: 'pp-hire', cite: [NPR_NLEAD],
          text: 'NPR reported that without the database it is harder for agencies to catch job applicants with problems in their past.' }
      ],
      against: [
        { id: 'pp-recruit', on: true, cite: [MARSHALL],
          text: 'Local governments in Colorado said the personal pay rule could hurt hiring and keeping officers, and Greenwood Village said it would cover its officers.' },
        { id: 'pp-qi', cite: [MARSHALL],
          text: 'Police unions say legal protections keep officers from being sued for doing their jobs.' },
        { id: 'pp-local', cite: [NPR_NLEAD],
          text: 'NPR noted that local departments mostly hire from other state and local agencies, which the federal database did not cover.' },
        { id: 'pp-ndi', cite: [NPR_NLEAD],
          text: 'A separate national list of decertified officers, run outside the federal government, still exists.' }
      ]
    },
    views: {
      for: ['Taxpayers should know what police cases cost them.', 'If the money is public, people can judge whether training works.', 'Every city should post its totals the same way.', 'If police carried insurance, the cost would follow the officer, not the taxpayer.'],
      against: ['Most officers do their jobs well and should not be treated as suspects.', 'Police hiring is a local decision.', 'New rules can make it harder to hire officers.', 'Settlements are often made to avoid court costs, not because anyone did wrong.']
    },
    questions: {
      for: ['How much did my city pay to settle police cases last year?', 'Why is there no single public list?', 'Would you support making the totals public every year?'],
      against: ['How would a new database protect officers who did nothing wrong?', 'Who would run it and pay for it?', 'Would it make police hiring harder?']
    },
    otherSide: { for: 'I know most officers do their jobs well, and I am not asking you to judge any one officer.', against: 'I agree people should know how their tax money is spent.' }
  }),

  W({
    id: 'wish-dark-money',
    menu: 'Dark money: who gives to groups that spend on elections',
    title: 'Dark money: the donors behind groups that spend on elections',
    status: 'Groups that do not name their donors put $1.9 billion into 2024 federal races, a record. Since 2020, most of these groups do not even list donors for the IRS.',
    summary: [
      'Dark money is election spending by nonprofits and shell companies that do not have to name their donors. The Brennan Center counted $1.9 billion in 2024 federal races, about double the 2020 record of $1 billion. About $1.2 billion backed Democrats and about $664 million backed Republicans.',
      'Since May 2020, tax-exempt groups other than charities (501(c)(3)s) and political groups (527s) no longer list big donors on their IRS forms. They must still keep the names and give them to the IRS if asked (Journal of Accountancy, Venable).'
    ],
    question: 'Should groups that spend money on elections have to name their donors?',
    short: 'the donors behind dark money groups',
    stand: { for: 'I want groups that spend money on elections to name their donors.', against: 'I think donors to nonprofit groups should keep their privacy.' },
    also: { for: 'Please support a law that makes groups that spend on elections name their donors.', against: 'Please protect the privacy of donors to nonprofit groups.' },
    topic: ['dark money', 'donor disclosure for election spending', 'who funds election ads'],
    asks: {
      for: ['Please support a law that makes groups that spend money on elections name their big donors.',
        'I ask you to make dark money groups show who pays for their ads.',
        'If you think voters should know who pays for election ads, I hope you will say so in public.',
        'I am writing to ask you to bring dark money into the open.'],
      forShort: ['Name the donors.', 'Show who pays for the ads.'],
      against: ['Please do not pass a law that forces nonprofits to hand over their donor lists.',
        'I ask you to protect donor privacy for groups on every side.',
        'When this comes up, I hope you will vote no on forced donor lists.',
        'I am writing to ask you to keep the current donor privacy rules.'],
      againstShort: ['Protect donor privacy.', 'No forced donor lists.']
    },
    call: { for: 'I would like {S} to support a law that makes groups that spend on elections name their donors.', against: 'I would like {S} to protect the privacy of donors to nonprofit groups.' },
    facts: {
      for: [
        { id: 'dm-total', on: true, cite: [BRENNAN, TPR],
          text: 'Groups that do not name their donors put $1.9 billion into 2024 federal races, about double the 2020 record of $1 billion.' },
        { id: 'dm-both', on: true, cite: [BRENNAN],
          text: 'About $1.2 billion of it backed Democrats and about $664 million backed Republicans, so both parties benefit.' },
        { id: 'dm-irs', on: true, cite: [JOFA, VENABLE],
          text: 'Since May 2020, tax-exempt groups other than charities and political groups no longer list big donors on their IRS forms.' },
        { id: 'dm-under', cite: [BRENNAN],
          text: 'The Brennan Center says its $1.9 billion count likely falls short of the real total.' }
      ],
      against: [
        { id: 'dm-naacp', on: true, cite: [STRIPES],
          text: 'In NAACP v. Alabama (1958), the Supreme Court said forced disclosure of members can restrain freedom of association.' },
        { id: 'dm-harass', on: true, cite: [STRIPES],
          text: 'Donor privacy groups say disclosure exposes donors to harassment and retaliation for their beliefs.' },
        { id: 'dm-keep', cite: [JOFA],
          text: 'These groups must still keep their donor records and give them to the IRS if asked.' }
      ]
    },
    views: {
      for: ['Voters should know who is paying for the ads they see.', 'Big money should not hide behind a nonprofit name.', 'This should apply to every side the same way.', 'If a donor is proud of the cause, they can stand behind it.'],
      against: ['People should be able to support a cause without being targeted.', 'Donor lists have been used to punish people before.', 'Privacy protects small groups and unpopular views.', 'The IRS can already get the names if it needs them.']
    },
    questions: {
      for: ['Do you think voters have a right to know who pays for election ads?', 'Would you support the same rule for groups on every side?', 'Why should a nonprofit be able to hide its election donors?'],
      against: ['How would you protect donors from harassment?', 'Would small groups lose members if lists were public?', 'Is the IRS rule enough?']
    },
    otherSide: { for: 'I know donor privacy matters to many people, and I take that seriously.', against: 'I agree voters should know a lot about who pays for election ads.' }
  }),

  W({
    id: 'wish-earmarks',
    menu: 'Earmarks: follow each earmarked dollar to where it went',
    title: 'Earmarks: following earmarked dollars to what they paid for',
    status: 'Congress set aside about $39 billion for more than 20,000 earmarked projects since 2022. By September 30, 2024, about 16 percent had been paid out (GAO).',
    summary: [
      'Earmarks (Community Project Funding in the House, Congressionally Directed Spending in the Senate) are dollars a member of Congress sets aside for a project back home. Since 2022, Congress set aside about $39 billion for more than 20,000 projects (GAO, July 16, 2026).',
      'By the end of fiscal 2024, agencies had promised about 61 percent of that money and paid out about 16 percent. Sixteen of 19 agencies said they had problems that affected their oversight (GAO, Legis1). For fiscal 2026, Congress has enacted nearly $15.5 billion in earmarks (Roll Call).'
    ],
    question: 'Should every earmark be tracked in public, from the bill to the money spent and what it built?',
    short: 'public tracking of earmarked dollars',
    stand: { for: 'I want every earmark tracked in public, from the bill to what the money paid for.', against: 'I think the current earmark rules and GAO reviews are enough.' },
    also: { for: 'Please support public tracking of every earmark, from the bill to what the money paid for.', against: 'Please do not add new earmark tracking rules that slow down projects.' },
    topic: ['earmarks', 'tracking earmarked dollars', 'community project funding'],
    asks: {
      for: ['Please support one public website that follows every earmark from the bill to the money spent and what it built.',
        'I ask you to post, for each of your earmarks, how much has been paid out and what it paid for.',
        'If you think people should see where earmarked dollars went, I hope you will push for it.',
        'I am writing to ask that earmarks be tracked in public all the way to the end.'],
      forShort: ['Track every earmark.', 'Show where the money went.'],
      against: ['Please do not add new reporting rules that slow down earmarked projects.',
        'I ask you to keep the current earmark rules and GAO reviews.',
        'When this comes up, I hope you will keep it simple for local projects.',
        'I am writing to say the current earmark rules are enough.'],
      againstShort: ['Keep the current rules.', 'Do not slow down projects.']
    },
    call: { for: 'I would like {S} to support public tracking of every earmark, from the bill to what the money paid for.', against: 'I would like {S} to keep the current earmark rules.' },
    facts: {
      for: [
        { id: 'ea-total', on: true, cite: [GAO_EAR, LEGIS1],
          text: 'Since 2022, Congress set aside about $39 billion for more than 20,000 earmarked projects.' },
        { id: 'ea-paid', on: true, cite: [GAO_EAR, LEGIS1],
          text: 'By September 30, 2024, about 16 percent of that money had been paid out.' },
        { id: 'ea-oversight', on: true, cite: [GAO_EAR],
          text: 'Sixteen of 19 agencies told GAO they had problems that affected their oversight of earmarks.' },
        { id: 'ea-2026', cite: [RC_EAR],
          text: 'For fiscal 2026, Congress has enacted nearly $15.5 billion more in earmarks.' }
      ],
      against: [
        { id: 'ea-moving', on: true, cite: [GAO_EAR],
          text: 'GAO found that about 61 percent of the money had been promised to projects, and only about 1 percent of projects are not moving forward.' },
        { id: 'ea-gao', cite: [GAO_EAR],
          text: 'GAO is already tracking the funds to help keep them in the open.' },
        { id: 'ea-hard', cite: [GAO_EAR, LEGIS1],
          text: 'About 60 percent of recipients reported at least one problem carrying out their project.' }
      ]
    },
    views: {
      for: ['If my tax money pays for a project, I want to see what it built.', 'Earmarks should be easy to follow from start to finish.', 'Members should show their own earmarks, paid and unpaid.', 'This should apply to both parties the same way.'],
      against: ['Local projects need money, not more forms.', 'GAO already checks this.', 'Small towns cannot afford more paperwork.', 'Members already answer for their earmarks at election time.']
    },
    questions: {
      for: ['Where can I see what my area\'s earmarks paid for?', 'How much of your earmarked money has been spent?', 'Would you support one public tracking site?'],
      against: ['Would new rules slow down local projects?', 'Is GAO\'s review enough?', 'Who would pay to build a new tracking site?']
    },
    otherSide: { for: 'I know local projects need the money, and I am not against any one project.', against: 'I agree people should be able to see what earmarks paid for.' }
  }),

  W({
    id: 'wish-spending-detail',
    menu: 'Agency spending: keep the budget office\'s spending data public',
    title: 'Agency spending: how the White House budget office releases money to agencies',
    status: 'The public website that shows how the budget office releases money to agencies was taken down in March 2025 and came back in August 2025 after a court order. The case is on appeal.',
    summary: [
      'After Congress passes a budget, the White House Office of Management and Budget (OMB) releases the money to agencies in steps called apportionments. A law passed by Congress says OMB must post them online within two business days (Roll Call, Government Executive).',
      'OMB took the site down in March 2025. On July 21, 2025, Judge Emmet Sullivan ruled that this broke the law. The appeals court let his order take effect on August 15, 2025, and the site came back (court record, Roll Call). The government is appealing.'
    ],
    question: 'Should the law that makes the budget office post its spending decisions online stay in place, with more detail?',
    short: 'public data on how agencies get their money',
    stand: { for: 'I want the budget office\'s spending decisions posted online, with more detail.', against: 'I think the budget office needs room to make spending decisions without posting each step.' },
    also: { for: 'Please keep the law that makes the budget office post its spending decisions online.', against: 'Please give the budget office room to make spending decisions without posting each step.' },
    topic: ['agency spending data', 'OMB apportionments', 'how agencies get their money'],
    asks: {
      for: ['Please keep the law that makes the budget office post its spending decisions online, and add more detail to it.',
        'I ask you to make sure the public can see how agencies get the money Congress passed.',
        'If you think spending decisions should be public, I hope you will defend the posting law.',
        'I am writing to ask for more detail on how agencies spend money.'],
      forShort: ['Keep spending data public.', 'Post the details.'],
      against: ['Please look again at the rule that makes the budget office post every step within two days.',
        'I ask you to give the budget office room to plan before it posts.',
        'When this comes up, I hope you will weigh the work it takes.',
        'I am writing to ask you to change the posting rule.'],
      againstShort: ['Give the budget office room.', 'Change the two day rule.']
    },
    call: { for: 'I would like {S} to keep the law that makes the budget office post its spending decisions online, with more detail.', against: 'I would like {S} to change the rule that makes the budget office post every spending step within two days.' },
    facts: {
      for: [
        { id: 'sd-down', on: true, cite: [RC_APP, CASE_OMB],
          text: 'The budget office took down the public apportionment website in March 2025.' },
        { id: 'sd-ruling', on: true, cite: [GOVEXEC, CASE_OMB],
          text: 'On July 21, 2025, Judge Emmet Sullivan ruled that taking the site down broke the law.' },
        { id: 'sd-back', on: true, cite: [CASE_OMB, RC_APP],
          text: 'The appeals court let the order take effect on August 15, 2025, and the site came back.' },
        { id: 'sd-noevidence', cite: [GOVEXEC],
          text: 'The judge found "no evidence in the record remotely supporting" the claim that the papers were privileged.' }
      ],
      against: [
        { id: 'sd-deliberative', on: true, cite: [RC_APP],
          text: 'The administration said posting meant disclosing "sensitive, pre-decisional and deliberative information."' },
        { id: 'sd-micro', cite: [GOVEXEC],
          text: 'The government argued the law is unconstitutional and micromanages how the executive branch spends funds.' },
        { id: 'sd-staff', cite: [GOVEXEC],
          text: 'It also said posting within two business days takes budget office staff away from other work.' }
      ]
    },
    views: {
      for: ['Congress passes the budget, so people should see how it is carried out.', 'Hidden spending decisions make it hard to check the government.', 'This should not depend on which party is in the White House.', 'A judge already found the law was broken once.'],
      against: ['Planning needs some privacy before decisions are final.', 'Two days is a tight deadline for a small office.', 'The President runs the executive branch, not Congress.', 'Spending totals are already public.']
    },
    questions: {
      for: ['Will you defend the law that keeps this data public?', 'Can we see more detail on how agencies spend money?', 'Why was the site taken down?'],
      against: ['Is two business days a fair deadline?', 'How much planning should be private?', 'Does this rule go too far?']
    },
    otherSide: { for: 'I know the budget office has a hard job, and I am not asking it to post private advice.', against: 'I agree people should see how their tax money is spent.' }
  }),

  W({
    id: 'wish-black-budget',
    menu: 'The black budget: how secret intelligence money is spent',
    title: 'The black budget: secret intelligence spending',
    status: 'The public is told one number each year for the intelligence budget: $73.3 billion for fiscal 2025. The rest stays classified.',
    summary: [
      'The Director of National Intelligence said the National Intelligence Program got $73.3 billion in fiscal 2025, and that "there will be no other disclosures of currently classified NIP budget information" (ODNI, October 31, 2025; ExecutiveGov).',
      'The Defense Department separately said its Military Intelligence Program got $27.8 billion in fiscal 2025, and gave no more detail (ExecutiveGov). Together that is about $101 billion with almost no public breakdown.'
    ],
    question: 'Should the public see more of how the intelligence budget is spent, such as totals by agency?',
    labels: { for: 'Show more of it', against: 'Keep it secret' },
    short: 'more public detail on the intelligence budget',
    stand: { for: 'I want the public to see more of how the intelligence budget is spent, such as totals by agency.', against: 'I think the intelligence budget details should stay secret.' },
    also: { for: 'Please support releasing more of the intelligence budget, such as totals by agency.', against: 'Please keep the intelligence budget details secret.' },
    topic: ['the intelligence budget', 'the black budget', 'secret intelligence spending'],
    asks: {
      for: ['Please support releasing the intelligence budget by agency, not just one total.',
        'I ask you to make the intelligence agencies show more of how they spend public money.',
        'If you think more of the black budget can be shown without risk, I hope you will push for it.',
        'I am writing to ask for more public detail on intelligence spending.'],
      forShort: ['Show totals by agency.', 'Open up the black budget.'],
      against: ['Please keep the intelligence budget details secret.',
        'I ask you to protect intelligence sources and methods.',
        'When this comes up, I hope you will keep the current rules.',
        'I am writing to ask you to keep the black budget classified.'],
      againstShort: ['Keep it secret.', 'Protect sources and methods.']
    },
    call: { for: 'I would like {S} to support releasing more of the intelligence budget, such as totals by agency.', against: 'I would like {S} to keep the intelligence budget details secret.' },
    facts: {
      for: [
        { id: 'bb-nip', on: true, cite: [ODNI, EG_NIP],
          text: 'The National Intelligence Program got $73.3 billion in fiscal 2025, and that one number is all that was released.' },
        { id: 'bb-mip', on: true, cite: [EG_MIP],
          text: 'The Military Intelligence Program got another $27.8 billion in fiscal 2025, with no more detail made public.' },
        { id: 'bb-none', cite: [ODNI],
          text: 'The DNI said "there will be no other disclosures of currently classified NIP budget information."' }
      ],
      against: [
        { id: 'bb-classified', on: true, cite: [EG_MIP],
          text: 'The Defense Department says program details stay classified.' },
        { id: 'bb-law', cite: [ODNI],
          text: 'The DNI releases only the total each year, as the law (50 U.S.C. 3306(b)) calls for.' }
      ]
    },
    views: {
      for: ['$100 billion a year is too much to spend with almost no public detail.', 'Totals by agency would not reveal secrets.', 'Congress and the public both need to check this money.', 'Secrecy should be the exception, not the rule.'],
      against: ['Details could help other countries learn what we do.', 'Congress\'s intelligence committees already see the full budget.', 'Some secrets keep people safe.', 'The current rules have worked for years.']
    },
    questions: {
      for: ['Could totals by agency be released safely?', 'Who outside the government checks this money?', 'Would you support more detail?'],
      against: ['What would other countries learn from more detail?', 'Do the intelligence committees already see enough?', 'Is the current total enough for the public?']
    },
    otherSide: { for: 'I know some details must stay secret to keep people safe.', against: 'I agree the public should know the total and that Congress should check it.' }
  }),

  W({
    id: 'wish-visitor-logs',
    menu: 'White House visitor logs: who meets with the President\'s staff',
    title: 'White House visitor logs and calendars',
    status: 'On February 11, 2025, the White House said it will not release visitor logs during President Trump\'s second term.',
    summary: [
      'Visitor logs show who came to the White House and whom they met. The Obama White House began releasing them in December 2009. The first Trump White House stopped in April 2017 (PBS NewsHour, AP). The Biden White House started again in 2021, and its policy page is still on whitehouse.gov.',
      'On February 11, 2025, the White House said it will not release visitor logs during the second term. A spokeswoman said the Presidential Records Act protects them until five years after the President leaves office (Fox News, Political Wire).'
    ],
    question: 'Should the White House release its visitor logs, whoever is President?',
    short: 'White House visitor logs',
    stand: { for: 'I want the White House to release its visitor logs, whoever is President.', against: 'I think the White House should decide for itself whether to release visitor logs.' },
    also: { for: 'Please support a law that makes the White House release its visitor logs, whoever is President.', against: 'Please leave visitor log releases up to each White House.' },
    topic: ['White House visitor logs', 'who visits the White House', 'White House calendars'],
    asks: {
      for: ['Please support a law that makes every White House release its visitor logs, whoever is President.',
        'I ask you to push for public visitor logs and agency leaders\' calendars.',
        'If you think people should know who meets with the President\'s staff, I hope you will say so.',
        'I am writing to ask for White House visitor logs to be made public.'],
      forShort: ['Release the visitor logs.', 'Same rule for every President.'],
      against: ['Please leave visitor log releases up to each White House.',
        'I ask you to protect the privacy of White House visitors.',
        'When this comes up, I hope you will keep the current law.',
        'I am writing to ask you not to force the release of visitor logs.'],
      againstShort: ['Leave it to each White House.', 'Protect visitors\' privacy.']
    },
    call: { for: 'I would like {S} to support a law that makes the White House release its visitor logs, whoever is President.', against: 'I would like {S} to leave visitor log releases up to each White House.' },
    facts: {
      for: [
        { id: 'vl-2025', on: true, cite: [FOX_LOGS, PW_LOGS],
          text: 'On February 11, 2025, the White House said it will not release visitor logs during President Trump\'s second term.' },
        { id: 'vl-history', on: true, cite: [PBS_LOGS, WH_VD, FOX_LOGS],
          text: 'Whether the logs come out has changed with each President: released from 2009, stopped in 2017, released again from 2021, and stopped in 2025.' }
      ],
      against: [
        { id: 'vl-pra', on: true, cite: [FOX_LOGS],
          text: 'The White House says the Presidential Records Act protects the logs until five years after the President leaves office.' },
        { id: 'vl-security', on: true, cite: [PBS_LOGS],
          text: 'In 2017 the White House cited "grave national security risks and privacy concerns" for hundreds of thousands of visitors a year.' },
        { id: 'vl-policy', cite: [PBS_LOGS],
          text: 'Officials said releasing the logs could interfere with policy work, and that most earlier Presidents did not release them.' }
      ]
    },
    views: {
      for: ['People should know who has the ear of the President\'s staff.', 'The rule should be the same for every President.', 'Visitor names can be released with privacy and security exceptions.', 'Lobbyists should not be able to meet in secret.'],
      against: ['Visitors have a right to privacy.', 'Some meetings must stay private for security.', 'The records come out later under the law anyway.', 'Each President should run the White House their way.']
    },
    questions: {
      for: ['Why should this change with each President?', 'Would you support one rule for every White House?', 'Could the logs come out with privacy exceptions?'],
      against: ['How would visitors\' privacy be protected?', 'Is the five year wait enough?', 'Should Congress set rules for the White House?']
    },
    otherSide: { for: 'I know some meetings must stay private for security reasons.', against: 'I agree people should know who has influence in the White House.' }
  }),

  W({
    id: 'wish-fara',
    menu: 'Foreign lobbying (FARA): enforce the foreign agent law',
    title: 'Foreign lobbying: who works for foreign governments, and the law that covers them',
    status: 'Foreign agent filings are public on the Justice Department\'s FARA website. Since February 5, 2025, the Justice Department brings criminal charges under the law only for conduct like spying.',
    summary: [
      'The Foreign Agents Registration Act (FARA) says people who lobby or do public relations in the U.S. for foreign governments and groups must register. Their filings are public on efile.fara.gov.',
      'A February 5, 2025 memo from the Attorney General limited criminal charges under FARA to "conduct similar to more traditional espionage by foreign government actors" and disbanded the FBI\'s Foreign Influence Task Force (Skadden, CyberScoop, Salon).'
    ],
    question: 'Should the Justice Department fully enforce the foreign agent law again?',
    labels: { for: 'Enforce it fully', against: 'Keep the new focus' },
    short: 'enforcement of the foreign agent law (FARA)',
    stand: { for: 'I want the foreign agent law (FARA) fully enforced, so people know who works for foreign governments.', against: 'I support the Justice Department\'s narrower focus on foreign agent cases.' },
    also: { for: 'Please push for full enforcement of the foreign agent law (FARA).', against: 'Please support the Justice Department\'s narrower focus on foreign agent cases.' },
    topic: ['foreign lobbying', 'the foreign agent law (FARA)', 'foreign influence'],
    asks: {
      for: ['Please push the Justice Department to fully enforce the foreign agent law again.',
        'I ask you to support bringing back the Foreign Influence Task Force.',
        'If you think people should know who works for foreign governments, I hope you will say so.',
        'I am writing to ask for full enforcement of FARA.'],
      forShort: ['Enforce FARA.', 'Bring back the task force.'],
      against: ['Please support the Justice Department\'s narrower focus on foreign agent cases.',
        'I ask you to let the Justice Department set its own priorities.',
        'When this comes up, I hope you will back the new approach.',
        'I am writing to support the current FARA focus.'],
      againstShort: ['Keep the new focus.', 'Let DOJ set priorities.']
    },
    call: { for: 'I would like {S} to push for full enforcement of the foreign agent law, FARA.', against: 'I would like {S} to support the Justice Department\'s narrower focus on foreign agent cases.' },
    facts: {
      for: [
        { id: 'fa-memo', on: true, cite: [SKADDEN, CYBERSCOOP],
          text: 'Since February 5, 2025, criminal charges under FARA are limited to "conduct similar to more traditional espionage by foreign government actors."' },
        { id: 'fa-task', on: true, cite: [SALON, CYBERSCOOP],
          text: 'The same memo disbanded the FBI\'s Foreign Influence Task Force, created in 2017.' },
        { id: 'fa-zelinsky', cite: [SALON],
          text: 'A former Justice Department national security prosecutor called the changes "an invitation to foreign actors to interfere in American affairs."' }
      ],
      against: [
        { id: 'fa-free', on: true, cite: [CYBERSCOOP],
          text: 'The memo said the change frees resources for more pressing priorities.' },
        { id: 'fa-civil', on: true, cite: [SKADDEN],
          text: 'The FARA Unit is told to focus on civil enforcement, rules and public guidance instead of criminal cases.' },
        { id: 'fa-public', cite: [FARA],
          text: 'Foreign agent filings are still public on the Justice Department\'s FARA website.' }
      ]
    },
    views: {
      for: ['People should know who is paid by foreign governments to sway our leaders.', 'A law that is not enforced does not protect anyone.', 'Foreign influence is a risk no matter which party it helps.', 'Registration only works if breaking the rule has a cost.'],
      against: ['Prosecutors should focus on real spying.', 'Most FARA mistakes are paperwork problems.', 'Civil rules and guidance can fix most cases.', 'The filings are still public.']
    },
    questions: {
      for: ['Who checks that foreign agents register now?', 'Will you support bringing back the task force?', 'How will we catch foreign influence that is not spying?'],
      against: ['Should paperwork mistakes be crimes?', 'Is civil enforcement enough?', 'What should prosecutors focus on?']
    },
    otherSide: { for: 'I know prosecutors have to choose their cases, and spying is the top concern.', against: 'I agree people should know who works for foreign governments.' }
  }),

  W({
    id: 'wish-judge-homes',
    menu: 'Judges\' finances: homes and easy access to disclosure reports',
    title: 'Judges\' financial disclosures: home purchases and access to reports',
    status: 'Federal judges file yearly financial reports. The law does not require them to report buying or selling the home they live in. To read the reports online you must register each visit.',
    summary: [
      'Federal judges file a financial disclosure report each year. The law says they must report buying or selling real estate over $1,000, "other than property used solely as a personal residence" of the judge or spouse (5 U.S.C. 13104(a)(5)(A); League of Women Voters).',
      'Reports filed in 2022 and later are online at pub.jefs.uscourts.gov, but readers must register each time they visit. Reports are destroyed six years after they are filed (U.S. Courts). This is not about any one judge. It is about what the rules show.'
    ],
    question: 'Should judges report home purchases and sales, and should their reports be easy to read online?',
    short: 'judges\' financial disclosure reports',
    stand: { for: 'I want judges to report home purchases and sales, and their reports to be easy to read online.', against: 'I think the current disclosure rules for judges are enough.' },
    also: { for: 'Please support a law that makes judges report home purchases and sales and puts their reports online without sign-up.', against: 'Please keep the current financial disclosure rules for judges.' },
    topic: ['judges\' financial disclosures', 'judges\' home purchases', 'court ethics records'],
    asks: {
      for: ['Please support a law that makes federal judges report buying or selling the home they live in, and how it was paid for.',
        'I ask you to make judges\' financial reports free to read online without registering each visit.',
        'If you think people should see how judges pay for big purchases, I hope you will push for it.',
        'I am writing to ask that judges\' financial reports be kept and posted in full.'],
      forShort: ['Report home sales.', 'Post the reports in full.'],
      against: ['Please keep the current disclosure rules for judges.',
        'I ask you to protect judges\' home privacy and safety.',
        'When this comes up, I hope you will keep judges\' home details private.',
        'I am writing to say the current rules are enough.'],
      againstShort: ['Keep the current rules.', 'Protect judges\' safety.']
    },
    call: { for: 'I would like {S} to support a law that makes judges report home purchases and sales, with their reports free to read online.', against: 'I would like {S} to keep the current disclosure rules for judges.' },
    facts: {
      for: [
        { id: 'jh-law', on: true, cite: [LAW_13104, LWV],
          text: 'Federal law does not require a judge to report buying or selling the home they live in on their yearly financial report.' },
        { id: 'jh-register', on: true, cite: [JEFS],
          text: 'To read judges\' reports online, people must register with their name and address each time they visit.' },
        { id: 'jh-destroy', cite: [JEFS],
          text: 'Judges\' reports are destroyed six years after they are filed.' }
      ],
      against: [
        { id: 'jh-invest', on: true, cite: [LAW_13104],
          text: 'Judges must still report buying or selling other real estate over $1,000, such as rental or investment property.' },
        { id: 'jh-online', cite: [JEFS],
          text: 'Reports filed in 2022 and later are already online, and older ones can be requested.' }
      ]
    },
    views: {
      for: ['Judges decide cases about our lives, so their finances should be easy to check.', 'A home is often the biggest purchase a person makes.', 'Readers should not have to register to read a public record.', 'The same rules should apply to judges picked by every party.'],
      against: ['Judges and their families face real threats, so home details need care.', 'A family home is not a conflict of interest.', 'The reports already cover investments.', 'More rules could discourage good people from becoming judges.']
    },
    questions: {
      for: ['Why are home purchases left off the report?', 'Why must readers register each visit?', 'Should the reports be kept longer than six years?'],
      against: ['How would judges\' safety be protected?', 'Is a family home a conflict of interest?', 'Are the current rules enough?']
    },
    otherSide: { for: 'I know judges face real safety threats, and I am not asking for home addresses.', against: 'I agree people should be able to check judges\' finances.' }
  })
  ];

  window.CS_ISSUES.push.apply(window.CS_ISSUES, WISH);
})();
