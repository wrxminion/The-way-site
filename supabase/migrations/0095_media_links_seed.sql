-- RUN THIS in the Supabase SQL editor after 0094 (one paste). Draft Facebook posts and ideas that use real links, plus starter canned responses and debate replies.
-- Plain inserts with ON CONFLICT DO NOTHING, so running it twice adds nothing twice. Every row is a DRAFT for an admin to approve.
-- Links are paths on michiinstitute.com. Titles were taken from the real pages by tools/build-media-catalog.py.
-- The "N articles" number was counted from the real cases list when this file was made.

insert into public.social_posts (platform, body, link_path, link_title, status, source) values
  ('facebook', 'Come read about your judges before you vote!', '/guide/races/judges-rtd.html', 'Judges and RTD board - The Way, Colorado', 'draft', 'human'),
  ('facebook', 'Come read about your judges before you vote!', '/guide-ak/races/judges.html', 'Judges on the ballot, Alaska', 'draft', 'human'),
  ('facebook', 'Come read about your judges before you vote!', '/guide-az/races/judges.html', 'Judges up for retention, Arizona', 'draft', 'human'),
  ('facebook', 'Come read about your judges before you vote!', '/guide-ca/races/judges.html', 'Justices on the retention ballot, California', 'draft', 'human'),
  ('facebook', 'Come read about your judges before you vote!', '/guide-fl/races/judges.html', 'Judges on the retention ballot, Florida', 'draft', 'human'),
  ('facebook', 'Come read about your judges before you vote!', '/guide-ia/races/judges.html', 'Judges on the ballot, Iowa', 'draft', 'human'),
  ('facebook', 'Come read about your judges before you vote!', '/guide-il/races/judges.html', 'Judges on the ballot, Illinois', 'draft', 'human'),
  ('facebook', 'Come read about your judges before you vote!', '/guide-in/races/judges.html', 'Judges on the retention ballot, Indiana', 'draft', 'human'),
  ('facebook', 'Come read about your judges before you vote!', '/guide-ks/races/judges.html', 'Judges on the retention ballot, Kansas', 'draft', 'human'),
  ('facebook', 'Come read about your judges before you vote!', '/guide-md/races/judges.html', 'Judges on the ballot, Maryland', 'draft', 'human'),
  ('facebook', 'Come read about your judges before you vote!', '/guide-mi/races/judges.html', 'Judges on the ballot, Michigan', 'draft', 'human'),
  ('facebook', 'Come read about your judges before you vote!', '/guide-mo/races/judges.html', 'Judges on the ballot, Missouri', 'draft', 'human'),
  ('facebook', 'Come read about your judges before you vote!', '/guide-ne/races/judges.html', 'Judges on the ballot, Nebraska', 'draft', 'human'),
  ('facebook', 'Come read about your judges before you vote!', '/guide-nm/races/judges.html', 'Judges on the ballot, New Mexico', 'draft', 'human'),
  ('facebook', 'Come read about your judges before you vote!', '/guide-ny/races/judges.html', 'Supreme Court justices on the ballot, New York', 'draft', 'human'),
  ('facebook', 'Come read about your judges before you vote!', '/guide-ok/races/judges.html', 'Judges on the retention ballot, Oklahoma', 'draft', 'human'),
  ('facebook', 'Come read about your judges before you vote!', '/guide-sd/races/judges.html', 'Judges on the ballot, South Dakota', 'draft', 'human'),
  ('facebook', 'Come read about your judges before you vote!', '/guide-ut/races/judges.html', 'Judges on the retention ballot, Utah', 'draft', 'human'),
  ('facebook', 'Come read about your judges before you vote!', '/guide-wy/races/judges.html', 'Judges on the ballot, Wyoming', 'draft', 'human'),
  ('facebook', 'Your state guide lists what is on your ballot, in plain words. Come take a look before you vote.', '/guide/', 'Colorado voter guide 2026', 'draft', 'human'),
  ('facebook', 'Make a plan before you vote. Come see how it works.', '/vote/', 'VOTE!', 'draft', 'human'),
  ('facebook', 'We have 22 articles about public programs, come see our research on it.', '/cases/', 'Civics & History: the record', 'draft', 'human')
on conflict (platform, body, (coalesce(link_path, ''))) do nothing;

insert into public.marketing_ideas (body, reason, kind, category, status, source, link_path, link_title) values
  ('Point people to their state judges page a few days before the election, in a post that links the page.', 'Judges are the part of the ballot people know least about.', 'idea', 'idea', 'draft', 'human', '/guide-wy/races/judges.html', 'Judges on the ballot, Wyoming'),
  ('Share the civics and history cases that match the news of the week, with a link to the case.', 'Real cases give a debate something to stand on.', 'idea', 'idea', 'draft', 'human', '/cases/', 'Civics & History: the record'),
  ('When an argument is about who does what in government, link our how-government-works page.', 'It answers a common question with sources.', 'idea', 'idea', 'draft', 'human', '/how-government-works.html', 'How government works'),
  ('When someone asks for sources, share the research package page.', 'A page people can point to as proof.', 'idea', 'idea', 'draft', 'human', '/research/packages/intent-outcome-banking-1933-1991/', 'Intent vs. Outcome: banking rules, 1933 to 1991'),
  ('Who funds this? The Way takes no donations and runs no ads. It is a personal website, so no outside money decides what it shows. The sources for every claim are on the page.', 'Answers a common question plainly.', 'copy', 'canned_response', 'draft', 'human', null, null),
  ('Are you left or right? Neither. The Way is not a party and does not endorse anyone. We show both sides of a claim with their sources, and you decide.', 'Keeps the answer neutral and short.', 'copy', 'canned_response', 'draft', 'human', null, null),
  ('How do you check claims? We look for two sources and one primary source, like the original document. We show both sides. If something is not proven, we say alleged.', 'Explains the method in three steps.', 'copy', 'canned_response', 'draft', 'human', null, null),
  ('Where is the source? Sources are on the page. Each claim lists them, so you can open them and read for yourself.', 'Points people to the proof.', 'copy', 'canned_response', 'draft', 'human', null, null),
  ('Can I trust AI? Do not trust any speaker just because of who or what it is. Check the evidence. We label pages made with AI, and the sources are always shown so you can check them.', 'Honest answer that moves to evidence.', 'copy', 'canned_response', 'draft', 'human', null, null),
  ('Why no donations? Money can push what gets shown. The Way takes no donations, so no money influences what we show you.', 'Explains the no donations rule.', 'copy', 'canned_response', 'draft', 'human', null, null),
  ('Here is some good sauce, may you find peace on your path.', 'Use for bad faith or trolls. Drop the link once, then go quiet. Do not reply again.', 'copy', 'debate_reply', 'draft', 'human', '/how-government-works.html', 'How government works'),
  ('The sources are below if you ever want them. I will leave it here. You take care now.', 'Use for someone who only wants a fight. Drop the link once, then go quiet. Do not reply again.', 'copy', 'debate_reply', 'draft', 'human', '/cases/', 'Civics & History: the record'),
  ('Ohh that''s cute, here is some sauce.', 'Light and teasing. Can read as a dig, so use only when the tone is already playful.', 'copy', 'debate_reply', 'draft', 'human', '/research/', 'Research library'),
  ('Good point. Here is a second source and the primary document that bears on it. If it disproves our claim, we will correct it.', 'Use when someone reads the sources and answers calmly. Offer more research.', 'copy', 'debate_reply', 'draft', 'human', null, null),
  ('Thank you kindly for reading it. Which part of the source do you read differently? Show me the line and I will look at it with you.', 'Use when someone engages with a source but disagrees on one part. Ask for the exact line.', 'copy', 'debate_reply', 'draft', 'human', null, null),
  ('Well now, that is a fair challenge. Here is more research that tests the claim from the other side, with its sources.', 'Use when someone brings a real counter point. Reply with more research that supports or disproves the claim.', 'copy', 'debate_reply', 'draft', 'human', null, null),
  ('Correction: we had this wrong. Here is the updated claim and the source. What changed: [fill in what changed].', 'Use when we find our claim was wrong. Say it plainly, no apology, and show what changed.', 'copy', 'debate_reply', 'draft', 'human', null, null),
  ('Correction: you are right on this point. The claim now reads: [fill in the new claim]. Source: [fill in the source].', 'Use when a reader shows us a mistake. Fix it in public and name the new source.', 'copy', 'debate_reply', 'draft', 'human', null, null),
  ('Update: this page was changed. Old claim: [fill in the old claim]. New claim: [fill in the new claim]. Why: [fill in the reason and source].', 'Use after a page is updated, so old shares stay correct.', 'copy', 'debate_reply', 'draft', 'human', null, null)
on conflict (kind, body, (coalesce(link_path, ''))) do nothing;

select (select count(*) from public.social_posts where link_path is not null) as posts_with_links,
       (select count(*) from public.marketing_ideas where link_path is not null) as ideas_with_links;
