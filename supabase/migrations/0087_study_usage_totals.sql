-- RUN THIS in the Supabase SQL editor (one paste, safe to run twice). Needs 0016, 0004 and 0028.
-- 0087: totals only, for the Admin analytics page. A super admin can see HOW MANY ballot plans, ballot study
-- submissions and anonymous forecast shares exist, and how many are not their own. Nobody's picks are returned:
-- no plan contents, no choices, no state, no member name or id. Only counts and the newest date.
--
-- ballot_plans stays unreadable to everyone but the member who saved it (0016). This function is the only way
-- an admin gets anything about it, and it returns plain numbers. It is security definer so it can count rows the
-- caller's own row-level security would hide, and it refuses anyone who is not a super admin.
create or replace function public.study_usage_totals()
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.has_role('super_admin') then
    raise exception 'super admins only' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'ballot_plans', jsonb_build_object(
      'saved',         (select count(*) from public.ballot_plans),
      'members',       (select count(distinct member_id) from public.ballot_plans),
      'members_not_me',(select count(distinct member_id) from public.ballot_plans where member_id <> auth.uid()),
      'last_saved',    (select max(updated_at) from public.ballot_plans)),
    'research_submissions', jsonb_build_object(
      'submitted',     (select count(*) from public.research_submissions),
      'people',        (select count(distinct submitted_by) from public.research_submissions),
      'people_not_me', (select count(distinct submitted_by) from public.research_submissions where submitted_by <> auth.uid()),
      'last_submitted',(select max(created_at) from public.research_submissions)),
    'forecast_shares', jsonb_build_object(
      'shares',        (select count(*) from public.forecast_shares),
      'last_shared',   (select max(updated_at) from public.forecast_shares)),
    'members',         (select count(*) from public.members));
end $$;
revoke all on function public.study_usage_totals() from public, anon;
grant execute on function public.study_usage_totals() to authenticated;
