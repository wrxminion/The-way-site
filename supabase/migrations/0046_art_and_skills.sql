-- RUN THIS
-- 0046: private "Do you make art?" tag and an optional "relevant field or skill we didn't think of" note.
-- Artists can donate work to replace our AI-made graphics; we credit them. The answers sit in their own table: the member can read and
-- change their own row, and administrators can read all rows (to find artists and skills). Other members cannot. Self-reported.
-- Needs 0001. Independent: one new table and one function.

create table if not exists public.member_skills (
  member_id   uuid primary key references public.members(id),
  makes_art   boolean not null default false,
  other_field text check (other_field is null or char_length(other_field) <= 300),
  updated_at  timestamptz not null default now()
);
comment on table public.member_skills is 'Self-reported: makes art (may donate work, credited) and a short free-text field or skill. Owner and admins only. Never public.';
alter table public.member_skills enable row level security;
revoke all on public.member_skills from anon, authenticated;
grant select on public.member_skills to authenticated;
drop policy if exists member_skills_own on public.member_skills;
create policy member_skills_own on public.member_skills for select to authenticated using (member_id = auth.uid());
drop policy if exists member_skills_admin on public.member_skills;
create policy member_skills_admin on public.member_skills for select to authenticated using (private.has_role('admin'));

create or replace function public.set_skills(p_art boolean, p_other text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare v_other text := nullif(btrim(coalesce(p_other, '')), '');
begin
  if auth.uid() is null then raise exception 'Not allowed: sign in first' using errcode = '42501'; end if;
  if not exists (select 1 from public.members where id = auth.uid() and status = 'active') then
    raise exception 'Not allowed: members only' using errcode = '42501';
  end if;
  if v_other is not null and char_length(v_other) > 300 then raise exception 'Keep it to 300 characters'; end if;
  insert into public.member_skills (member_id, makes_art, other_field) values (auth.uid(), coalesce(p_art, false), v_other)
  on conflict (member_id) do update set makes_art = excluded.makes_art, other_field = excluded.other_field, updated_at = now();
end $$;
revoke all on function public.set_skills(boolean, text) from public, anon;
grant execute on function public.set_skills(boolean, text) to authenticated;

-- Check: all lines must say ok.
select 'table exists' as item, case when to_regclass('public.member_skills') is not null then 'ok' else 'FAIL' end as result
union all select 'anon cannot read', case when not has_table_privilege('anon', 'public.member_skills', 'select') then 'ok' else 'FAIL' end
union all select 'anon cannot set', case when not has_function_privilege('anon', 'public.set_skills(boolean,text)', 'execute') then 'ok' else 'FAIL' end
union all select 'members can set', case when has_function_privilege('authenticated', 'public.set_skills(boolean,text)', 'execute') then 'ok' else 'FAIL' end
union all select 'members cannot write table', case when not has_table_privilege('authenticated', 'public.member_skills', 'insert') then 'ok' else 'FAIL' end;
