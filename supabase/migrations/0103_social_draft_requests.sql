-- RUN THIS in the Supabase SQL editor (one paste, safe to run twice). Needs 0088, 0091, 0100, 0101 and 0102.
-- 0103: the Media page can ask the local drafter for social post drafts. The site never holds an LLM or an API key.
--   * social_draft_requests: one row per ask. Three kinds:
--       'more'  ask for a fresh batch of drafts (the number is 'wanted', 1 to 10)
--       'link'  write a draft about one https link
--       'idea'  write a draft about an idea in plain words
--     Admins, super admins and the Media Director (marketing) add asks and see them. They can cancel a waiting ask.
--     Nobody can delete an ask (there is no delete policy). At most 20 open asks per person.
--   * A new role, 'drafter', for the one member account the local drafter on MULTIVAC signs in as. It can read the asks,
--     mark them working, done or failed with a short note, and add social post drafts marked source 'llm'.
--     It cannot approve, post, edit or delete posts, and it sees no member data. Nobody is given the role here:
--     an admin assigns it from Admin > Members to the drafter's own account.
--   * social_posts.request_id links a draft to the ask it answers.
--   * social_posts status 'dismissed': "Not this one" hides a draft without deleting it. Back to draft undoes it.
-- Plain text only (no angle brackets). The guard trigger on social_posts is not changed.

-- ---------------------------------------------------------------- the drafter role
do $$
declare v_def text; v_fn text; v_fn_new text;
begin
  select pg_get_constraintdef(c.oid) into v_def
    from pg_constraint c where c.conrelid = 'public.member_roles'::regclass and c.conname = 'member_roles_role_check';
  if v_def is null then raise exception 'member_roles_role_check not found; stop and ask'; end if;
  if v_def like '%drafter%' then
    raise notice 'role check already allows drafter';
  else
    -- keep every role the check allows today and add drafter
    v_def := regexp_replace(v_def, '\]\)+\s*$', '');
    v_def := regexp_replace(v_def, '^.*ARRAY\[', '');
    if v_def = '' or v_def not like '%marketing%' then raise exception 'could not read the role list; stop and ask'; end if;
    alter table public.member_roles drop constraint member_roles_role_check;
    execute format('alter table public.member_roles add constraint member_roles_role_check check (role = any (array[%s, %L::text]))', v_def, 'drafter');
  end if;

  v_fn := pg_get_functiondef('public.set_role(uuid,text,boolean,text)'::regprocedure);
  if v_fn like '%drafter%' then
    raise notice 'set_role already allows drafter';
  else
    v_fn_new := regexp_replace(v_fn, 'not in \(([^)]*)\)', 'not in (\1,''drafter'')');
    if v_fn_new = v_fn then raise exception 'set_role role list not found; stop and ask'; end if;
    execute v_fn_new;
  end if;
end $$;

-- ---------------------------------------------------------------- the asks
create table if not exists public.social_draft_requests (
  id           bigint generated always as identity primary key,
  kind         text not null check (kind in ('more','link','idea')),
  link         text check (link is null or (link ~ '^https://[A-Za-z0-9.-]+(/[^ <>"]*)?$' and char_length(link) <= 500)),
  idea         text check (idea is null or (char_length(btrim(idea)) between 3 and 500 and idea !~ '[<>]')),
  platform     text not null default 'both' check (platform in ('facebook','bluesky','both')),
  wanted       smallint not null default 1 check (wanted between 1 and 10),
  status       text not null default 'waiting' check (status in ('waiting','working','done','failed','cancelled')),
  note         text check (note is null or (char_length(note) <= 300 and note !~ '[<>]')),
  post_count   smallint not null default 0 check (post_count between 0 and 50),
  requested_by uuid references public.members(id) default auth.uid(),
  created_at   timestamptz not null default now(),
  picked_at    timestamptz,
  done_at      timestamptz,
  constraint social_draft_requests_shape check (
    (kind = 'more' and link is null and idea is null)
    or (kind = 'link' and link is not null)
    or (kind = 'idea' and idea is not null and link is null))
);
create index if not exists social_draft_requests_open on public.social_draft_requests (status, id) where status in ('waiting','working');

-- The browser cannot forge who asked, when, or the drafter's answer. Only the drafter moves an ask past 'waiting'.
create or replace function private.social_draft_requests_guard() returns trigger
language plpgsql set search_path = '' as $fn$
declare n int; drafter boolean := private.has_role('drafter');
begin
  if tg_op = 'INSERT' then
    select count(*) into n from public.social_draft_requests r
      where r.requested_by = auth.uid() and r.status in ('waiting','working');
    if n >= 20 then raise exception 'You have 20 asks waiting. Wait for some drafts first.' using errcode = '22023'; end if;
    new.requested_by := auth.uid(); new.created_at := now(); new.status := 'waiting';
    new.note := null; new.post_count := 0; new.picked_at := null; new.done_at := null;
    if new.kind <> 'more' then new.wanted := 1; end if;
    return new;
  end if;
  -- UPDATE: the ask itself never changes
  new.kind := old.kind; new.link := old.link; new.idea := old.idea; new.platform := old.platform; new.wanted := old.wanted;
  new.requested_by := old.requested_by; new.created_at := old.created_at;
  if new.status is distinct from old.status then
    if new.status = 'cancelled' then
      if old.status <> 'waiting' then raise exception 'Only a waiting ask can be cancelled' using errcode = '22023'; end if;
      new.done_at := now();
    elsif not drafter then
      raise exception 'Only the drafter changes this' using errcode = '42501';
    elsif new.status = 'working' then
      if old.status <> 'waiting' then raise exception 'Only a waiting ask can be picked up' using errcode = '22023'; end if;
      new.picked_at := now();
    elsif new.status in ('done','failed') then
      if old.status not in ('waiting','working') then raise exception 'This ask is already closed' using errcode = '22023'; end if;
      new.done_at := now(); new.picked_at := coalesce(old.picked_at, now());
    elsif new.status = 'waiting' then
      if old.status <> 'working' then raise exception 'Only a working ask can go back to waiting' using errcode = '22023'; end if;
      new.picked_at := null;
    end if;
  else
    new.picked_at := old.picked_at; new.done_at := old.done_at;
  end if;
  if not drafter then new.note := old.note; new.post_count := old.post_count; end if;
  return new;
end $fn$;
drop trigger if exists social_draft_requests_guard on public.social_draft_requests;
create trigger social_draft_requests_guard before insert or update on public.social_draft_requests
  for each row execute function private.social_draft_requests_guard();

alter table public.social_draft_requests enable row level security;
revoke all on public.social_draft_requests from anon, authenticated;
grant select, insert, update on public.social_draft_requests to authenticated;
drop policy if exists social_draft_requests_read on public.social_draft_requests;
create policy social_draft_requests_read on public.social_draft_requests for select to authenticated
  using (private.has_role('super_admin') or private.has_role('marketing') or private.has_role('drafter'));
drop policy if exists social_draft_requests_add on public.social_draft_requests;
create policy social_draft_requests_add on public.social_draft_requests for insert to authenticated
  with check ((private.has_role('super_admin') or private.has_role('marketing')) and requested_by = auth.uid());
drop policy if exists social_draft_requests_edit on public.social_draft_requests;
create policy social_draft_requests_edit on public.social_draft_requests for update to authenticated
  using (private.has_role('super_admin') or private.has_role('marketing') or private.has_role('drafter'))
  with check (private.has_role('super_admin') or private.has_role('marketing') or private.has_role('drafter'));

-- ---------------------------------------------------------------- posts: link to the ask, "Not this one", drafter adds drafts
alter table public.social_posts add column if not exists request_id bigint references public.social_draft_requests(id);
alter table public.social_posts drop constraint if exists social_posts_status_check;
alter table public.social_posts add constraint social_posts_status_check check (status in ('draft','approved','posted','dismissed'));

drop policy if exists social_posts_drafter_read on public.social_posts;
create policy social_posts_drafter_read on public.social_posts for select to authenticated
  using (private.has_role('drafter') and source = 'llm');
drop policy if exists social_posts_drafter_add on public.social_posts;
create policy social_posts_drafter_add on public.social_posts for insert to authenticated
  with check (private.has_role('drafter') and created_by = auth.uid() and status = 'draft' and source = 'llm');

-- Check: all lines must say ok.
select 'role check allows drafter' as item,
  case when (select pg_get_constraintdef(oid) from pg_constraint where conrelid = 'public.member_roles'::regclass and conname = 'member_roles_role_check') like '%drafter%'
        and (select pg_get_constraintdef(oid) from pg_constraint where conrelid = 'public.member_roles'::regclass and conname = 'member_roles_role_check') like '%marketing%'
        and (select pg_get_constraintdef(oid) from pg_constraint where conrelid = 'public.member_roles'::regclass and conname = 'member_roles_role_check') like '%super_admin%'
       then 'ok' else 'FAIL' end as result
union all select 'set_role allows drafter',
  case when pg_get_functiondef('public.set_role(uuid,text,boolean,text)'::regprocedure) like '%drafter%' then 'ok' else 'FAIL' end
union all select 'social_draft_requests has row-level security and no delete policy',
  case when (select c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname = 'social_draft_requests')
        and (select count(*) from pg_policies where schemaname = 'public' and tablename = 'social_draft_requests' and cmd = 'DELETE') = 0
       then 'ok' else 'FAIL' end
union all select 'ask guard trigger in place',
  case when (select count(*) from pg_trigger where tgrelid = 'public.social_draft_requests'::regclass and tgname = 'social_draft_requests_guard' and not tgisinternal) = 1 then 'ok' else 'FAIL' end
union all select 'posts accept dismissed and link to an ask',
  case when (select pg_get_constraintdef(oid) from pg_constraint where conrelid = 'public.social_posts'::regclass and conname = 'social_posts_status_check') like '%dismissed%'
        and (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'social_posts' and column_name = 'request_id') = 1
       then 'ok' else 'FAIL' end
union all select 'drafter adds only llm drafts and cannot edit or delete posts',
  case when (select with_check from pg_policies where schemaname = 'public' and tablename = 'social_posts' and policyname = 'social_posts_drafter_add') like '%llm%'
        and (select count(*) from pg_policies where schemaname = 'public' and tablename = 'social_posts' and cmd in ('UPDATE','DELETE')
              and (coalesce(qual, '') || coalesce(with_check, '')) like '%drafter%') = 0
       then 'ok' else 'FAIL' end;
