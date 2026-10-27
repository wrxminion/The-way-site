-- The Way: the numbers on the "Review the sources" card on a moderator's home page.
--   * my_review_summary(): for the signed-in moderator, how many claims they have judged, how many of those
--     are still waiting for a second reviewer, how many have a second reviewer, and how many of those differ.
--   * Counts only. It never shows another reviewer's verdict (those stay hidden until you submit your own).
-- Run after 0014. Safe to run twice.
create or replace function public.my_review_summary()
returns table (reviewed int, waiting_second int, second_done int, differ int)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_role('moderator');
  return query
    with latest as (
      select distinct on (c.case_slug, c.claim_key, c.reviewer_id)
             c.case_slug, c.claim_key, c.reviewer_id, c.verdict
        from private.claim_reviews_current c
       where c.verdict not in ('pending', 'inaccessible')
       order by c.case_slug, c.claim_key, c.reviewer_id, c.id desc),
    mine as (select l.case_slug, l.claim_key from latest l where l.reviewer_id = auth.uid()),
    per as (
      select m.case_slug, m.claim_key,
             count(distinct l.reviewer_id)::int as people,
             count(distinct l.verdict)::int as kinds
        from mine m join latest l using (case_slug, claim_key)
       group by m.case_slug, m.claim_key)
    select count(*)::int,
           (count(*) filter (where p.people < 2))::int,
           (count(*) filter (where p.people >= 2))::int,
           (count(*) filter (where p.people >= 2 and p.kinds > 1))::int
      from per p;
end $$;
revoke all on function public.my_review_summary() from public, anon;
grant execute on function public.my_review_summary() to authenticated;
