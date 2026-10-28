-- RUN THIS
-- 0041: "adult confirmed" flag for new sign-ups.
-- Sign-up now asks a neutral age question (no default answer). Someone who says they are 18 or older gets a flag with the time
-- they said so. Nothing else about age is stored: no birth date, no age, and nothing at all for someone who says they are under 18
-- (they stop before an account is made). Existing members have no flag (null); that is not a claim they are minors.
-- Independent of 0030 to 0040: one new column and one new function.

alter table public.members add column if not exists adult_confirmed_at timestamptz;
comment on column public.members.adult_confirmed_at is 'When the member said they are 18 or older at sign-up. Null for members who joined before the age question. No birth date is kept.';

create or replace function public.confirm_adult() returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Not allowed: sign in first' using errcode = '42501'; end if;
  update public.members set adult_confirmed_at = now() where id = auth.uid() and adult_confirmed_at is null;
end $$;
revoke all on function public.confirm_adult() from public, anon;
grant execute on function public.confirm_adult() to authenticated;

-- Check: all three lines must say ok.
select 'column exists' as item, case when exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'members' and column_name = 'adult_confirmed_at') then 'ok' else 'FAIL' end as result
union all select 'anon cannot confirm', case when not has_function_privilege('anon', 'public.confirm_adult()', 'execute') then 'ok' else 'FAIL' end
union all select 'members can confirm', case when has_function_privilege('authenticated', 'public.confirm_adult()', 'execute') then 'ok' else 'FAIL' end;
