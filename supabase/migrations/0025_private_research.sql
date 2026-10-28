-- The Way: Private research (0025). One part. Safe to run again.
do $guard$
begin
  if to_regprocedure('private.award_karma(uuid,text,text,text,uuid)') is null then
    raise exception 'Stop: run 0017 first';
  end if;
end $guard$;

-- Every member's own notes. Private until the member shares them.
create table if not exists public.private_research (
  id         bigint generated always as identity primary key,
  owner_id   uuid not null references public.members(id) on delete cascade,
  title      text not null check (char_length(title) between 1 and 200),
  body       text not null default '' check (char_length(body) <= 100000),
  visibility text not null default 'private' check (visibility in ('private','shared')),
  shared_at  timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists private_research_owner_idx on public.private_research (owner_id, updated_at desc);

create or replace function private.private_research_touch() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.updated_at := now();
  if new.visibility = 'shared' and (tg_op = 'INSERT' or old.visibility <> 'shared') then new.shared_at := now(); end if;
  if new.visibility = 'private' then new.shared_at := null; end if;
  if tg_op = 'UPDATE' then new.owner_id := old.owner_id; end if;
  return new;
end $$;
drop trigger if exists private_research_touch on public.private_research;
create trigger private_research_touch before insert or update on public.private_research
  for each row execute function private.private_research_touch();

alter table public.private_research enable row level security;
revoke all on public.private_research from anon;
grant select, insert, update, delete on public.private_research to authenticated;

drop policy if exists private_research_owner_select on public.private_research;
drop policy if exists private_research_owner_insert on public.private_research;
drop policy if exists private_research_owner_update on public.private_research;
drop policy if exists private_research_owner_delete on public.private_research;
drop policy if exists private_research_shared_select on public.private_research;

-- Owner only. Admins and super admins cannot read a private item.
create policy private_research_owner_select on public.private_research for select to authenticated
  using (owner_id = auth.uid());
create policy private_research_owner_insert on public.private_research for insert to authenticated
  with check (owner_id = auth.uid() and private.is_member());
create policy private_research_owner_update on public.private_research for update to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid() and private.is_member());
create policy private_research_owner_delete on public.private_research for delete to authenticated
  using (owner_id = auth.uid());
-- Shared items only: the research desk (researchers, reviewers, moderators, admins) can read them to review.
create policy private_research_shared_select on public.private_research for select to authenticated
  using (visibility = 'shared' and (private.has_role('researcher') or private.has_role('reviewer') or private.has_role('moderator')));

-- The team's own research files: a private bucket only super admins can read, add to or replace.
insert into storage.buckets (id, name, public, file_size_limit)
values ('team-research', 'team-research', false, 31457280)
on conflict (id) do update set public = false;

drop policy if exists team_research_super_admin_read on storage.objects;
drop policy if exists team_research_super_admin_insert on storage.objects;
drop policy if exists team_research_super_admin_update on storage.objects;
create policy team_research_super_admin_read on storage.objects for select to authenticated
  using (bucket_id = 'team-research' and private.has_role('super_admin'));
create policy team_research_super_admin_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'team-research' and private.has_role('super_admin'));
create policy team_research_super_admin_update on storage.objects for update to authenticated
  using (bucket_id = 'team-research' and private.has_role('super_admin'))
  with check (bucket_id = 'team-research' and private.has_role('super_admin'));

-- Check: every row must say ok.
select 'private_research owner-only policies' as check_name,
       case when (select count(*) from pg_policies where tablename = 'private_research') = 5 then 'ok' else 'MISSING' end as result
union all
select 'team-research bucket is private',
       case when exists (select 1 from storage.buckets where id = 'team-research' and public = false) then 'ok' else 'MISSING' end
union all
select 'team-research read, add and replace policies',
       case when (select count(*) from pg_policies where policyname like 'team_research_super_admin_%') = 3 then 'ok' else 'MISSING' end;
