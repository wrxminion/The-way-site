-- RUN THIS
-- 0042: private "Teacher" tag, with the member's own public/private choice.
-- Sign-up now also asks "Are you a teacher?". The answer is kept in its own table that only the member can read. The tag is
-- private by default; the member can turn "show publicly" on or off later. Nothing proves someone is a teacher: it is self-reported.
-- Needs 0041. Independent of everything else: one new table and three functions. Showing the public tag next to names is not built yet.

create table if not exists public.member_teacher (
  member_id   uuid primary key references public.members(id),
  is_teacher  boolean not null,
  tag_public  boolean not null default false check (not tag_public or is_teacher),
  updated_at  timestamptz not null default now()
);
comment on table public.member_teacher is 'Self-reported Teacher tag. Owner-only read. tag_public is the member''s own choice and defaults to private.';
alter table public.member_teacher enable row level security;
revoke all on public.member_teacher from anon, authenticated;
grant select on public.member_teacher to authenticated;
drop policy if exists member_teacher_own on public.member_teacher;
create policy member_teacher_own on public.member_teacher for select to authenticated using (member_id = auth.uid());

create or replace function public.set_teacher(p_teacher boolean, p_public boolean default false) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Not allowed: sign in first' using errcode = '42501'; end if;
  if p_teacher is null then raise exception 'Say yes or no'; end if;
  if not exists (select 1 from public.members where id = auth.uid() and status = 'active') then
    raise exception 'Not allowed: members only' using errcode = '42501';
  end if;
  insert into public.member_teacher (member_id, is_teacher, tag_public)
    values (auth.uid(), p_teacher, p_teacher and coalesce(p_public, false))
  on conflict (member_id) do update
    set is_teacher = excluded.is_teacher, tag_public = excluded.tag_public, updated_at = now();
end $$;
revoke all on function public.set_teacher(boolean, boolean) from public, anon;
grant execute on function public.set_teacher(boolean, boolean) to authenticated;

-- Member ids whose Teacher tag is public (for showing the tag later). Private tags never appear here.
create or replace function public.teacher_tags_public() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select member_id from public.member_teacher where is_teacher and tag_public;
$$;
revoke all on function public.teacher_tags_public() from public, anon;
grant execute on function public.teacher_tags_public() to authenticated;

-- Check: all lines must say ok.
select 'table exists' as item, case when to_regclass('public.member_teacher') is not null then 'ok' else 'FAIL' end as result
union all select 'anon cannot read', case when not has_table_privilege('anon', 'public.member_teacher', 'select') then 'ok' else 'FAIL' end
union all select 'anon cannot set', case when not has_function_privilege('anon', 'public.set_teacher(boolean,boolean)', 'execute') then 'ok' else 'FAIL' end
union all select 'members can set', case when has_function_privilege('authenticated', 'public.set_teacher(boolean,boolean)', 'execute') then 'ok' else 'FAIL' end
union all select 'members cannot write table', case when not has_table_privilege('authenticated', 'public.member_teacher', 'insert') then 'ok' else 'FAIL' end;
