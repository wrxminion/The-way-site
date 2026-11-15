/* Issues for the Contact Your Senator page.
   To add an issue, copy one block below and fill it in. Rules:
   - Every fact needs a source named in the sentence and listed in "sources".
   - Give the same number of facts for each side ("for" and "against").
   - Plain words, no em dashes, no threats, no telling people how to vote in an election.
   - "record" is optional: a Senate roll call with how each senator voted ("short" is the card label).
     Names are last names; add -ST when two senators share a last name (Scott-FL).
     "rest" is the vote of every senator not listed; "check" must match the official totals.
   Placeholders you can use in text: {S} (Senator Last), {last}, {state}. */
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
    voters: 'dem',
    question: 'Are you for or against Chuck Schumer as Democratic leader?',
    labels: { for: 'For Schumer', against: 'Against Schumer' },
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
        ['On November 3, Democrats flipped at least eight Republican Senate seats and won the House, with Senator Schumer as leader (TIME, November 13).',
          'TIME reports that Democrats flipped at least eight Republican Senate seats on November 3 and won the House. Senator Schumer led Senate Democrats through that election.'],
        ['TIME named 14 senators who publicly back Senator Schumer (November 13).',
          'According to TIME, 14 senators have said in public that they back Senator Schumer.']
      ],
      against: [
        ['In a June Politico poll, 47 percent of likely Democratic voters said Senator Schumer should not stay in leadership, and 28 percent said he should (reported by Newsweek, August 12).',
          'Newsweek reported a June Politico poll: 47 percent of likely Democratic voters said Senator Schumer should not stay in leadership. Only 28 percent said he should.'],
        ['At least seven incoming Democratic senators have said they want new leadership or will not commit to Senator Schumer (Al Jazeera, November 5).',
          'Al Jazeera reported on November 5 that at least seven incoming Democratic senators want new leadership or will not commit to Senator Schumer.']
      ]
    },
    views: {
      for: ['I value steady, experienced leadership.', 'He knows how the Senate works, and that matters when there are bills to pass.', 'Changing leaders now would cost time the country does not have.', 'I would rather keep a leader who has been tested than start over.'],
      against: ['I think new voices would help the party connect with voters.', 'It is time for a new generation of leadership.', 'I want leaders who will push back harder.', 'Leadership should change when voters ask for change.']
    },
    questions: {
      for: ['Why change leaders right after a strong election?', 'Who in the caucus has more experience getting bills through the Senate?', 'What would the caucus gain by starting over now?'],
      against: ['What message does it send to keep the same leader after voters asked for change?', 'Who will connect best with the voters who just showed up?', 'What would new leadership make possible in the next two years?']
    },
    otherSide: { for: 'Some people want a new face at the top, and I understand why.', against: 'Senator Schumer has long experience, and I respect that.' },
    civic: ['The leader vote is a closed caucus vote, so letters like this are one of the few ways people back home can weigh in.', 'Voters do not get a ballot in the leader race. This letter is my way to take part.'],
    record: { type: 'breaks' },
    reported: true,
    sources: [
      { label: 'TIME, November 13, 2026', url: 'https://time.com/article/2026/11/13/chris-van-hollen-senate-majority-leader-chuck-schumer-progressive-democrats/' },
      { label: 'Newsweek, August 12, 2026 (reports the June Politico poll)', url: 'https://www.newsweek.com/full-list-democrats-rallying-against-chuck-schumer-senate-12315442' },
      { label: 'Al Jazeera, November 5, 2026', url: 'https://www.aljazeera.com/amp/news/2026/11/5/division-among-us-democrats-over-schumers-leadership-role' }
    ]
  },

  {
    id: 'permitting-baaja',
    menu: 'Permitting reform bill (BAAJA, S. 5653)',
    title: 'The permitting reform bill (BAAJA)',
    status: 'The Senate voted 73 to 25 on November 9 and 62 to 21 on November 10, 2026 to take up the bill. No final vote as of November 12.',
    summary: [
      'The Bipartisan American Affordability and Jobs Act of 2026 (S. 5653) changes how federal permits are reviewed for energy and building projects, including power lines, pipelines, and wind and solar. It sets deadlines for reviews and limits court challenges. Sponsors: Senators Capito (R-W.Va.), Lee (R-Utah), Whitehouse (D-R.I.) and Heinrich (D-N.M.).',
      'On November 9 the Senate voted 73 to 25 to end debate on taking up the bill, using a House bill (H.R. 2347) as the vehicle, and on November 10 it voted 62 to 21 to take it up. Those were first steps, not final passage. The Senate vote list through November 12 shows no final vote yet.'
    ],
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
        ['The bill sets deadlines: one year for an environmental assessment and two years for a full environmental impact statement (bill text, S. 5653).',
          'Under the bill text, federal agencies get one year for an environmental assessment and two years for a full environmental impact statement.'],
        ['The sponsors and news reports say data centers would have to pay their own power line and grid connection costs (sponsors\' release; Albuquerque Journal, November 9).',
          'According to the sponsors and the Albuquerque Journal, data centers would pay all of their own grid connection costs under the bill.'],
        ['Both the American Clean Power Association and the American Petroleum Institute support it, and the sponsors are two Republicans and two Democrats (Inside Climate News, November 10).',
          'The bill has two Republican and two Democratic sponsors, and both clean energy and oil industry groups back it (Inside Climate News, November 10).']
      ],
      against: [
        ['The bill text gives people 150 days to sue over a permit, tells courts to give agencies "substantial deference," and lets a permit stay in effect while a flawed review is fixed.',
          'Under the bill text, lawsuits must be filed within 150 days, and a court that finds a bad review must send it back to be fixed without stopping the permit.'],
        ['The bill text excludes a category of natural gas pipeline actions from federal environmental review (Sec. 1102).',
          'Section 1102 of the bill takes a category of natural gas pipeline actions out of federal environmental review.'],
        ['The Native American Rights Fund says the bill cuts back tribal consultation, and tribal groups asked to delay it or remove the historic preservation changes (Inside Climate News, November 10).',
          'Tribal organizations, including the Native American Rights Fund, oppose the bill and say it weakens tribal consultation (Inside Climate News, November 10).']
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
      url: 'https://www.senate.gov/legislative/LIS/roll_call_votes/vote1192/vote_119_2_00257.htm',
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
    sources: [
      { label: 'Senate roll call 257, November 9, 2026 (official)', url: 'https://www.senate.gov/legislative/LIS/roll_call_votes/vote1192/vote_119_2_00257.htm' },
      { label: 'Bill text, S. 5653 (GovInfo)', url: 'https://www.govinfo.gov/content/pkg/BILLS-119s5653is/html/BILLS-119s5653is.htm' },
      { label: 'Sponsors\' release (Senate Energy Committee)', url: 'https://www.energy.senate.gov/press/dem/heinrich-lee-capito-and-whitehouse-introduce-bipartisan-american-affordability-and-jobs-act-of-2026/' },
      { label: 'Inside Climate News, November 10, 2026', url: 'https://insideclimatenews.org/news/10112026/senate-advances-permitting-bill/' },
      { label: 'Albuquerque Journal, November 9, 2026', url: 'https://www.abqjournal.com/news/heinrich-permitting-bill-clears-senate-hurdle/3159360' },
      { label: 'Senate floor log, November 10, 2026', url: 'https://www.dailypress.senate.gov/tuesday-november-10-2026/' },
      { label: 'Senate roll call list, 2026 (votes 257 and 258)', url: 'https://www.senate.gov/legislative/LIS/roll_call_lists/vote_menu_119_2.xml' }
    ]
  },

  {
    id: 'veterans-hr9237',
    menu: 'Veterans benefits bill with sleep apnea and tinnitus changes (H.R. 9237)',
    title: 'The House veterans bill (H.R. 9237)',
    status: 'Passed the House by voice vote on November 11, 2026. The Senate has not voted.',
    summary: [
      'H.R. 9237, the Take Care of America\'s Veterans Act, bundles more than 60 veterans measures. It adds a benefit for combat-injured military retirees (the Major Richard Star Act). To help pay for it, Section 108 lowers disability ratings for sleep apnea and tinnitus on future claims. The bill says ratings already in effect are protected.',
      'The House passed it by voice vote on November 11, so there is no list of how each member voted. The Senate version is S. 4744. It must pass both chambers by January 3 or it dies.'
    ],
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
        ['The package pays for the Major Richard Star Act, a new benefit for combat-injured military retirees, and bundles more than 60 veterans measures (Military Times, November 12).',
          'According to Military Times, the bill bundles more than 60 veterans measures and pays for the Star Act benefit for combat-injured retirees.'],
        ['The bill text protects disability ratings already in effect. The rating changes apply to future claims (H.R. 9237, Sec. 108).',
          'Under Section 108 of the bill, current ratings are protected, and the changes apply to claims filed after it becomes law.']
      ],
      against: [
        ['A VA analysis cited by veterans groups says the sleep apnea and tinnitus changes cut up to $57 billion over 10 years and affect up to 1.5 million veterans (Stars and Stripes, November 12).',
          'Veterans groups cite a VA analysis: up to $57 billion less in benefits over 10 years, for up to 1.5 million veterans (Stars and Stripes, November 12).'],
        ['Today a veteran with sleep apnea who uses a CPAP machine usually gets a 50 percent rating. Under the bill, partial relief from treatment would mean 10 percent, and tinnitus would lose its own 10 percent rating in most cases (bill text, Sec. 108).',
          'Section 108 drops most sleep apnea ratings with a working CPAP from 50 percent to 10 percent, and ends the separate 10 percent tinnitus rating in most cases.']
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
    sources: [
      { label: 'Bill text, H.R. 9237 (GovInfo)', url: 'https://www.govinfo.gov/content/pkg/BILLS-119hr9237ih/xhtml/BILLS-119hr9237ih.html' },
      { label: 'Military Times, November 12, 2026', url: 'https://www.militarytimes.com/news/2026/11/12/house-passes-sweeping-veterans-benefits-bill-with-polarizing-tactic/' },
      { label: 'Stars and Stripes, November 12, 2026', url: 'https://www.stripes.com/veterans/2026-11-12/house-sweeping-veterans-bill-vfw-23444750.html' },
      { label: 'Senate Veterans\' Affairs Committee, Blumenthal statement, November 11, 2026', url: 'https://www.veterans.senate.gov/2026/11/blumenthal-statement-on-house-republicans-secretive-effort-to-cut-veterans-benefits-on-veterans-day' }
    ]
  }
];
