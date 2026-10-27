# Members: roles, profiles, review pipeline, Commons, karma

Status: PLAN ONLY. Nothing here is merged or run. The SQL sketch is `0017_roles_profiles_karma.DRAFT.sql` (compiles and re-runs cleanly on Postgres 16; award rules smoke-tested). 0016 stays reserved for My Ballot. Frank approves before any of it ships.

Written from the code and migrations as they stand (0001 to 0015, app.js). I did not see the live database.

## 1. What exists today (checked in the files)

**Roles in the database:** member (anyone with a row in `members`), `moderator`, `researcher`, `reviewer`, `admin`. The check on `member_roles.role` allows only those four. `admin` counts as every role. Admins grant roles through `set_role` (logged in the moderation log). Nobody can remove their own admin.

**What each does today**
- member: Commons posting, make 5 open share links (admins have no cap), report a case for revision (10 a day), submit sources, see Findings.
- researcher: write research items, versions and sources, send a version for review.
- reviewer: publish, correct or retract a version. Never the version's own author.
- moderator: hide posts, lock or hide or pin threads, decide case reports, check case claims (0013), triage Pull a Thread (0015), revoke any invite.
- admin: roles, suspensions, invitation codes with many uses, checker keys.

**Review flows today (six separate ones)**
1. Findings desk: researcher writes a claim about a policy with 2+ sources and the strongest counterargument, sends it. Frak (local Ollama) pre-checks: fake quote is a hard stop, language filter blocks our own opinion words, each source gets a Wayback copy plus private screenshot and text. A second member with the reviewer role publishes, corrects or retracts. Versions lock once sent.
2. Case reviews (0013): a moderator marks each key claim of a history case checked or flagged, then marks the case reviewed. Append-only.
3. Claim reviews (0014): several reviewers judge the same claim independently (verdict, passage, rationale, flags). One account counts once per claim. Others' rows show only after you submit. Public history shows "Reviewer 1, 2...". Disagreement opens a moderator task. Counts are process numbers, never a truth vote.
4. Pull a Thread (0015): anyone, signed out too, sends one link and a reason. Private. A moderator sets new, accepted, needs_evidence, duplicate or declined, with a reason.
5. Report for revision (0008): a member says a case needs a change; a moderator decides; logged.
6. Provenance `human_verified` (evidence vault on FRAK, schema `theway-provenance/1`, default false). This lives in files on FRAK, not in the database. Nothing in the member app can set it yet. That is the gap that matters for karma (section 5).

## 2. Roles (proposed)

Rule: a role is permission to do a job. It is never a prize and never points-based. Karma may be a reason to apply, never a way to get one automatically.

| Role | Can do (in addition to member) | How someone gets it |
|---|---|---|
| member | Commons, share links, submit sources, report problems, independent claim review of cases (see note) , own place and profile | Redeems an invite. |
| scholar | Their sources and comments are labelled "scholar" in research threads; can be asked to sign off on topic accuracy; can propose research items. Cannot publish. | Apply with affiliation and 1 to 3 public links (faculty page, ORCID, publications). An admin checks the links and approves. Re-confirmed yearly. |
| journalist | Same labelling as scholar for news questions; can send "Pull a Thread" tips with a named outlet; can request a correction note. Cannot publish. | Apply with outlet or portfolio links, and an editor or published byline link. An admin checks and approves. Freelancers: 3 bylines in the last 24 months. |
| researcher | Write research items and versions, attach sources (exists today). | Apply; a reviewer or admin approves after one accepted sample item. Karma of 20+ from checked sources is a reason to ask, not a rule. |
| reviewer | Publish, correct, retract; verify sources (set human_verified); decide claim review outcomes. Never on own work. | Invite-only by an admin after a track record: 10+ accepted claim reviews or sources and no fabrication finding. Two admins agree for the first six months. |
| moderator | Commons moderation, triage, case flags, revoke invites. Cannot publish research. | Admin appoints; applicants named in section 7 questions. Logged. |
| admin | Roles (except admin and super admin), suspensions, multi-use invites, settings. | Super admin only. |
| super admin | Make or remove admins. At least one must always exist. Cannot be removed by an admin. | Frank (and later one named backup). In the sketch, only a super admin can grant or remove admin. |

Notes
- Today a single account holding researcher and reviewer is possible, but the database refuses reviewing your own version. Keep that rule everywhere: **no one decides on their own work, and no one's role approval is decided by themselves.**
- Claim review (0014) currently needs a role check inside its function. I did not read the exact gate; decide whether plain members may do independent claim reviews. Recommendation: yes after 14 days and one accepted source, because independence and numbers are the point. Needs a yes from Frank.
- scholar and journalist are LABELS with a small duty (be accurate about the label), not extra powers. This keeps neutrality: credentials never outvote a source.
- The public site never says "audit" or "peer review". Public words: "checked", "verified by a person", "second look".

## 3. Member profile: what we ask for

**Today collected:** email (in Supabase Auth only, never shown), display name (2 to 40 characters, locked after joining, admin can rename), join date, status, roles, and optional **place** (`member_places`: state required if saved, ZIP optional, street address optional; only that member can read it; "Forget it" deletes the row). Posts, edit history, reports and reviews are kept as records. Invites no longer record who invited whom (Frank, Oct 15). The waiting list (`notify_signups`) holds emails of people who asked to be told.

**Proposed**

| Field | Required? | Who can see | Why |
|---|---|---|---|
| Email | Yes (sign-in) | Nobody but the member and the database owner. Never shown, never exported to other members. | Sign in |
| Display name | Yes | All members; research byline uses it only if the member allows | Identity in the Commons |
| Password | Yes after first login | Nobody | Sign in |
| State | Optional | Only the member | Opens the right guide |
| ZIP, street address | Optional | Only the member. Never published. Never used for anything but showing their districts to them. | Ballot matching later |
| Bio (300 characters) | Optional | Members | Introductions |
| Affiliation (120) | Optional; required for scholar and journalist, only shown when the member ticks "show" | Members, if ticked | Role labels |
| Public links (up to 3) | Optional; required for scholar and journalist | Members, if ticked | Role checks |
| Phone | Never collected | n/a | Not needed |
| Real name | Not collected | n/a | Display names are enough; the role check sees links, not ID documents |
| Birth date, ID, photos | Never | n/a | Not needed |

Role evidence (links, statement) lives in `role_applications`: visible to the applicant and admins only. After a decision, evidence links are cleared after 90 days; the decision, date and reason stay in the log.

**Retention rule (proposed)**
- Account data lives while the account does. Leaving: `forget_member` already blanks the name to "Former member" and removes the email; posts stay under that name.
- Place and profile rows are deleted on leaving (they are not history).
- Role application evidence: 90 days after decision (above).
- Invite codes: used or expired codes forget who made them (already built in 0007).
- Waiting-list emails: delete when the person joins, or after 12 months with no activity.
- Moderation log, audit chain, review records: kept (they are the record), with no email or address in them.
- Never published: email, phone, address, ZIP.

## 4. One review pipeline

Same five steps for every kind of thing a member can bring: a source, a claim, a tip, a correction, a revision.

| Step | What happens | Who | Today's piece it reuses |
|---|---|---|---|
| 1 Submit | Member sends it with a source link and, for claims, the exact quote and page. Tips can come from anyone. | member / researcher / signed-out tipster | research versions and sources, Pull a Thread, Report for revision |
| 2 Check (machine) | Fake quote is a hard stop; language filter; Wayback copy; private screenshot and text; hash stored. | Frak pre-check | 0004 to 0006 |
| 3 Review (people) | At least two different people, independent, each with a verdict and the exact passage. Disagreement goes to a moderator; counts are process numbers, never a vote on truth. | reviewers (and members, once allowed) | 0014 claim reviews |
| 4 Publish | A different reviewer publishes. Publishing needs: sources present, AI check passed, 2 agreeing independent reviews, and human_verified set on every source. | reviewer | 0004 review_research_version |
| 5 Correct | Anyone can report a problem. Fix is a new version, never an edit. Old versions stay readable with a "corrected" mark; retraction is public with a reason. | any member reports; reviewer decides | 0008 and 0004 |

**Audit trail.** Every step is an append-only row and enters the SHA-256 chain (already true for 0013, 0014, 0015). Reviewer identity: public pages show "Reviewer 1, 2" per case; names stay in the chain and are visible to admins.

**Bridge to human_verified.** Today it is a flag in a file on FRAK. Proposal: a `source_verifications` table (append-only: source hash, reviewer, what was compared, date). The evidence vault keeps the files and hashes; the table is the human act of checking. A source is "verified by a person" when two different reviewers each wrote a row for the same hash. I'd build this after 0017 (call it 0018) so karma can point at it. FRAK changes are Frank's call.

**Who does which step**
- Submit: member, researcher, scholar, journalist (scholar and journalist labelled).
- Machine check: Frak.
- Review: reviewer, plus eligible members for claim reviews.
- Publish and verify: reviewer only.
- Correct: report by anyone; decision by a reviewer different from the author.
- Tie-breaks: moderator opens the task; an admin decides only if two reviewers still disagree after discussion marked "collaborative".

## 5. Karma ("awards")

Goal: reward careful work, not loud work. Reddit karma rewards popularity. This must not.

**Earns points** (SQL sketch has these as editable rows in `karma_rules`)

| Event | Points | Daily cap | Condition |
|---|---|---|---|
| Source you submitted is checked by someone else and the quote matches | +5 | 25 | other member signs off |
| You verify a source against the original and another reviewer agrees | +3 | 30 | two people |
| Your independent claim review matches the final outcome of the process | +2 | 20 | outcome, not truth vote; no reward for agreeing with the crowd, reviews are hidden until you submit |
| You report an error and a reviewer accepts the correction | +8 | 24 | other reviewer accepts |
| A revision you wrote is published by a different reviewer | +4 | 16 | |
| A Pull a Thread link you sent is accepted for research | +3 | 15 | |
| Fabricated source or quote found | -25 | n/a | hard stop (already a hard stop in the pre-check) |
| Repeated corrections rejected as unsupported | -2 | n/a | |

**Never earns points:** posts, replies, likes, votes, follower counts, positions on any issue, speed, volume, being agreed with by the crowd, reporting other members' behaviour, number of invites made.

**Anti-gaming rules** (built into `award_karma`)
1. One award per piece of work (unique key on member, kind, thing).
2. Never for your own sign-off: the member who awards must differ from the member who earns.
3. Daily cap per kind (above).
4. Points arrive only after a second person acts, so rings of two accounts are limited by the cap; add a weekly rule that no pair of members may award each other more than 3 times in 30 days.
5. New members: nothing counts for 3 days after joining and for 14 days it is shown as "pending". Reduces invite-farming.
6. A claim that argues for a political party or candidate position yields no points; reviewers judge sourcing, not the position. Neutrality check: the rules read only process fields (source, quote, verdict), never the claim's text.
7. Fabrication costs more than a fix earns: -25 versus +5.
8. Karma is a ledger, append-only. A reversal is a new negative row with a reason. Admins cannot edit totals.
9. Power never flows from karma: it can be listed on a role application; humans decide.
10. Private by default: a member sees their own total and history. Moderators can see events. A public badge is optional later (e.g. "Verifier"), never a number leaderboard. Leaderboards tempt volume.

**Recognition without ranks.** Small public labels earned by counts of accepted work, e.g. "Source finder" (10 accepted), "Verifier" (25 verifications), "Corrector" (5 accepted corrections). Labels show on a member's own page only unless they choose to show them.

## 6. The Commons

Today: rooms (categories), threads, posts with edit history, reports, public moderation log, pinned threads, rooms "Research help" and "Local". Rate limits 5 threads an hour, 20 posts per 10 minutes. Candidates may be discussed; The Way takes no side. Nothing is deleted; moderators hide with a reason.

**Proposed structure**
- Keep the current rooms. Add one room per kind of work: "Open sources" (threads about sources waiting for a check), "Corrections" (what was fixed and why), "Scholars and journalists" (introductions, expertise).
- A research item, a case or a claim gets an optional linked thread, one per item. The "Discuss" link on a finding opens it. A reviewer's decision note can be linked there.
- Pin: moderators pin the rules, current review drives and "how to check a source".
- Labels: scholar and journalist labels show next to a name only in research threads, not in the Commons at large, so credentials do not decide arguments.
- Moderation: same as now plus three checks. (1) Moderators cannot moderate a thread they started or post in heavily that week (another moderator). (2) Appeals: a hidden post's author can appeal once; a different moderator decides; both entries are in the public log. (3) Reports from reviewers about fabricated quotes go straight to the top of the queue.
- Link to review work: only to open it, never to settle it. Commons discussion does not count as a review; reviews happen in the review screens with a verdict and a passage.
- Karma: nothing from posting. The only Commons-related karma is a source or correction that comes from a thread and later passes the pipeline.

## 7. Open questions for Frank

1. Can ordinary members do independent claim reviews (after 14 days and one accepted source), or reviewers only? (Recommendation: members, after that gate.)
2. Should karma be visible to others (a number) or private with labels only? (Recommendation: private number, public labels if the member opts in.)
3. Who is the backup super admin?
4. Should `human_verified` move into the database (the `source_verifications` table) or stay in the vault on FRAK with a sync? (Recommendation: table in Supabase for the human act, files stay on FRAK.)
5. How strict should scholar and journalist checks be? (Recommendation: links only, no ID documents, an admin looks at them.)
6. Retention: OK with 90 days for role evidence and 12 months for the waiting list?
7. Do we want a thread per research item, or one room per topic?
8. Lawyer questions to add: does labelling "scholar" or "journalist" create any representation issue for the 501(c)(3)? Does the karma ledger count as member rights or benefits?

## 8. Build order (nothing starts without your yes)
1. Finish the join link (the run-once file in this folder). Done when the checklist rows say ok.
2. 0016 My Ballot (separate).
3. 0017: roles, profile, role applications, empty karma ledger. No auto-awards yet.
4. 0018: `source_verifications`, then wire `award_karma` into the existing review functions one by one, each with tests added to the existing test files.
5. App screens: profile, apply for a role, my karma, review queue. Commons rooms and linked threads.
