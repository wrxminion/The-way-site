-- RUN THIS in the Supabase SQL editor after 0091 (one paste, safe to run twice: anything whose text already exists is skipped).
-- 0092: seeds for the Media page, from Frank (2026-11-03). Everything below is a DRAFT for an admin to read and approve,
-- except the Facebook account row. Source is human. Nothing here posts anywhere. Rows are entered from the SQL editor,
-- so created_by stays empty.

-- Facebook account. For now it is Frank's personal profile, not a business Page. An admin can change the name on the Media page.
insert into public.social_accounts (platform, handle, active)
values ('facebook', 'Shihan Master (personal profile, temporary)', true)
on conflict (platform) do nothing;

-- 15 Facebook posts, one per hour from 07:00 to 21:00 MT, in this order.
insert into public.social_posts (platform, body, planned_slot, status, source)
select 'facebook', v.body, v.slot, 'draft', 'human'
from (values
  ('07:00 MT', 'Before you read the news today, ask one question: who says so, and how do they know? That is the whole idea of The Way. michiinstitute.com'),
  ('08:00 MT', 'Election day tip: your state''s guide page lists what is on your ballot in plain words. No account needed. michiinstitute.com'),
  ('09:00 MT', 'A claim is not a fact until it has two sources and one primary source. That is how we check things at The Way.'),
  ('10:00 MT', 'We show both sides of a claim, with the sources for each. You decide.'),
  ('11:00 MT', 'If a story makes you angry fast, slow down and look for the original document.'),
  ('12:00 MT', 'Lunch break challenge: pick one claim you saw this week and check it with two sources.'),
  ('13:00 MT', 'The Way takes no donations, so no money influences what we show you.'),
  ('14:00 MT', 'Judges on your ballot? Our judges pages explain who they are in plain words. michiinstitute.com'),
  ('15:00 MT', 'We use the word "alleged" for anything not proven. Words matter.'),
  ('16:00 MT', 'Facts are facts, whether they are said by an AI, a sixth grader, or a professor. We check the evidence, not the speaker.'),
  ('17:00 MT', 'Looking for results? Use your state''s official election site. That is the source, not a rumor on your feed.'),
  ('18:00 MT', 'Seeing a shocking post tonight? Wait for two sources before you share it.'),
  ('19:00 MT', 'The Way is not a party and does not endorse anyone. The Way belongs to no one. The Way belongs to you.'),
  ('20:00 MT', 'Counting takes time, and that is normal. Official results can take days in many places.'),
  ('21:00 MT', 'Whatever happens tonight, the facts will still be there tomorrow. Come check them with us.')
) as v(slot, body)
where not exists (select 1 from public.social_posts p where p.platform = 'facebook' and p.body = v.body);

-- Conversation openers, closers, ready-made copy and the first retention ideas (all drafts).
insert into public.marketing_ideas (body, reason, kind, status, source)
select v.body, v.reason, v.kind, 'draft', 'human'
from (values
  -- openers
  ('Hi, can I ask where you saw that? I like to look at the original source.', 'A calm first question that points to the source.', 'opener'),
  ('That is interesting. Have you seen what the other side says about it?', 'Invites both sides without arguing.', 'opener'),
  ('I read something different, want to compare sources together?', 'Turns a disagreement into a shared check.', 'opener'),
  ('Thanks for sharing. Is there a document we can both look at?', 'Moves the talk to a document anyone can read.', 'opener'),
  ('Good question. Let''s check it with two sources.', 'Shows the two-source habit in one line.', 'opener'),
  -- closers
  ('Thanks for talking it through. The sources are on the page if you want to look later.', 'Ends kindly and leaves the sources open.', 'closer'),
  ('We may not agree, and that is fine. The facts are there for you to weigh.', 'Leaves the decision with the reader.', 'closer'),
  ('If I got something wrong, tell me and I will fix it.', 'Invites correction in the open.', 'closer'),
  ('Take your time. Nothing here is meant to push you, only to help you check.', 'Keeps the tone calm and not pushy.', 'closer'),
  ('The Way belongs to no one. It belongs to you.', 'Short sign-off that matches the site.', 'closer'),
  -- ready-made copy: taglines
  ('The Way belongs to no one. The Way belongs to you.', 'Tagline.', 'copy'),
  ('Check it. Don''t just share it.', 'Tagline.', 'copy'),
  ('Both sides. Real sources. Your call.', 'Tagline.', 'copy'),
  ('Facts first. Always plain.', 'Tagline.', 'copy'),
  -- ready-made copy: short descriptions
  ('The Way is a nonpartisan site that explains elections, laws and claims in plain words, with the sources shown, so you can decide for yourself.', 'Short description.', 'copy'),
  ('No party, no ads, no donations. Just claims, checked with two sources and one primary source, and both sides shown.', 'Short description.', 'copy'),
  ('A free guide for every state: what is on your ballot, who the judges are, and where the facts come from.', 'Short description.', 'copy'),
  -- ready-made copy: explainers
  ('How we check a claim: we find two sources and one primary source, we show both sides, and we say ''alleged'' when something is not proven.', 'Explainer.', 'copy'),
  ('Why no donations? The Way takes no donations, so no money influences what we show you.', 'Explainer.', 'copy'),
  ('Who is behind it? The Way is a personal website, not a party. It belongs to no one. It belongs to you.', 'Explainer.', 'copy'),
  -- year-round retention ideas
  ('After results are official, add a short ''what happens next'' note to each race page: who won, when they take office, and what they will vote on first.', 'Gives people a reason to come back after election day.', 'idea'),
  ('Follow the new officials: for each winner, link to the bills they vote on, in plain words, with sources.', 'Keeps the site useful all year, with sources.', 'idea'),
  ('Send a calm local-race reminder before each future election, only to people who opted in, never to anyone else.', 'Opt-in only. Nobody gets contacted who did not ask.', 'idea'),
  ('Make short lessons and games for teachers, built on checking claims with two sources, free to use in class.', 'Teachers are a main audience and share what works.', 'idea'),
  ('Offer an opt-in ''follow'' choice (a monthly note) once the PO box exists. Email stays off until then.', 'Opt-in. Waits for the PO box rule.', 'idea'),
  ('Each month, publish ''Claims we checked this month'' with the sources, so people have a reason to come back.', 'A steady, honest reason to return.', 'idea'),
  ('When a topic is already in the news, link the plain explainer from our pages so people who search find us.', 'Helps people who are already looking. We never push it.', 'idea'),
  ('Keep a visible ''what changed'' note on pages we update, so returning readers see what is new.', 'Returning readers see what is new at a glance.', 'idea')
) as v(body, reason, kind)
where not exists (select 1 from public.marketing_ideas m where m.body = v.body);

-- Check: all lines must say ok.
select 'facebook account is set up' as item,
  case when (select count(*) from public.social_accounts where platform = 'facebook' and active and handle is not null) = 1 then 'ok' else 'FAIL' end as result
union all select '15 facebook posts are present',
  case when (select count(*) from public.social_posts where platform = 'facebook' and source = 'human') >= 15 then 'ok' else 'FAIL' end
union all select '5 openers, 5 closers and 10 pieces of copy are present',
  case when (select count(*) from public.marketing_ideas where kind = 'opener') >= 5
        and (select count(*) from public.marketing_ideas where kind = 'closer') >= 5
        and (select count(*) from public.marketing_ideas where kind = 'copy') >= 10 then 'ok' else 'FAIL' end
union all select 'no seeded post was added twice',
  case when (select count(*) from (select platform, body from public.social_posts group by platform, body having count(*) > 1) d) = 0 then 'ok' else 'note: some posts repeat' end;
