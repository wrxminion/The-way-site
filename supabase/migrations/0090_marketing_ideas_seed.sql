-- RUN THIS in the Supabase SQL editor after 0089 (one paste, safe to run twice: an idea whose text already exists is skipped).
-- 0090: the first seven suggested marketing ideas, approved by Frank on 2026-11-03. Status approved, source human.
-- Plain text only. No member data. created_by stays empty because these are entered from the SQL editor.

insert into public.marketing_ideas (body, reason, status, source)
select v.body, v.reason, 'approved', 'human'
from (values
  ('When a story is already spreading on its own, add a short plain summary with its sources, and let people choose to read it.',
   'Helps a story that is already moving, without pushing anything at anyone.'),
  ('When many people search a topic, make sure our plain explainer for it is easy to find. We never push it.',
   'People who search are already asking. Make the answer easy to reach.'),
  ('Answer journalists who ask us questions with facts and sources. We never pitch anyone who did not ask.',
   'Spread comes from being useful when asked, not from pitching.'),
  ('When the news moves, update the "what changed" note on the page, so old shares stay correct.',
   'Links people already shared keep telling the truth.'),
  ('When a local race is in the news, point to that state''s guide page.',
   'Connects a story people already care about to the facts for their own ballot.'),
  ('If we get something wrong, say so publicly and fast, and show what changed.',
   'Trust grows when mistakes are fixed in the open.'),
  ('Keep a short list of newsrooms and teachers who asked to hear from us, and contact only them.',
   'Only people who opted in. Nobody gets contacted who did not ask.')
) as v(body, reason)
where not exists (select 1 from public.marketing_ideas m where m.body = v.body);

-- Check: both lines must say ok.
select 'all seven ideas are present' as item,
  case when (select count(*) from public.marketing_ideas where status = 'approved' and source = 'human' and body in (
    'When a story is already spreading on its own, add a short plain summary with its sources, and let people choose to read it.',
    'When many people search a topic, make sure our plain explainer for it is easy to find. We never push it.',
    'Answer journalists who ask us questions with facts and sources. We never pitch anyone who did not ask.',
    'When the news moves, update the "what changed" note on the page, so old shares stay correct.',
    'When a local race is in the news, point to that state''s guide page.',
    'If we get something wrong, say so publicly and fast, and show what changed.',
    'Keep a short list of newsrooms and teachers who asked to hear from us, and contact only them.')) >= 7 then 'ok' else 'FAIL' end as result
union all select 'no idea was added twice',
  case when (select count(*) from (select body from public.marketing_ideas group by body having count(*) > 1) d) = 0 then 'ok' else 'note: some ideas repeat' end;
