-- RUN THIS in the Supabase SQL editor (one paste, safe to run twice). Needs 0089.
-- 0091: Media page, part 3. Conversation openers and closers, ready-made copy, and planned social media posts.
--   * marketing_ideas.kind: 'idea' (default), 'opener', 'closer' or 'copy'. Same review rules as 0089.
--   * social_accounts: one row per platform (facebook, bluesky, x, ...). The handle is the name a post goes out as.
--     Marketing and admins read. Only admins and super admins write.
--   * social_posts: planned posts. Drafts are visible ONLY to admins and super admins. Marketing sees approved and posted posts.
--     Only admins and super admins add, edit, approve, delete, and mark a post as posted.
--   * Approving a post copies the account's handle onto it and records who approved and when. An account with no handle
--     cannot be used to approve. Editing an approved post sends it back to draft.
--   * "Posted" is a manual click. This site never posts anywhere by itself. A person posts by hand after approval, and a
--     post made by an AI must carry the AI label.
-- Plain text only (no angle brackets). No member data. No existing function is changed. Seeds are in 0092, a separate paste.

-- ---------------------------------------------------------------- kinds of text on the ideas list
alter table public.marketing_ideas add column if not exists kind text not null default 'idea';
alter table public.marketing_ideas drop constraint if exists marketing_ideas_kind_check;
alter table public.marketing_ideas add constraint marketing_ideas_kind_check check (kind in ('idea','opener','closer','copy'));

-- ---------------------------------------------------------------- social accounts
create table if not exists public.social_accounts (
  platform   text primary key check (platform ~ '^[a-z0-9_]{2,24}$'),
  handle     text check (handle is null or (char_length(btrim(handle)) between 1 and 100 and handle !~ '[<>]')),
  active     boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.members(id)
);
create or replace function private.social_accounts_touch() returns trigger
language plpgsql set search_path = '' as $fn$
begin new.updated_at := now(); new.updated_by := auth.uid(); return new; end $fn$;
drop trigger if exists social_accounts_touch on public.social_accounts;
create trigger social_accounts_touch before insert or update on public.social_accounts
  for each row execute function private.social_accounts_touch();
alter table public.social_accounts enable row level security;
revoke all on public.social_accounts from anon, authenticated;
grant select, insert, update, delete on public.social_accounts to authenticated;
drop policy if exists social_accounts_read on public.social_accounts;
create policy social_accounts_read on public.social_accounts for select to authenticated
  using (private.has_role('marketing') or private.has_role('super_admin'));
drop policy if exists social_accounts_add on public.social_accounts;
create policy social_accounts_add on public.social_accounts for insert to authenticated
  with check (private.has_role('admin') or private.has_role('super_admin'));
drop policy if exists social_accounts_edit on public.social_accounts;
create policy social_accounts_edit on public.social_accounts for update to authenticated
  using (private.has_role('admin') or private.has_role('super_admin'))
  with check (private.has_role('admin') or private.has_role('super_admin'));
drop policy if exists social_accounts_remove on public.social_accounts;
create policy social_accounts_remove on public.social_accounts for delete to authenticated
  using (private.has_role('admin') or private.has_role('super_admin'));

-- ---------------------------------------------------------------- planned posts
create table if not exists public.social_posts (
  id           bigint generated always as identity primary key,
  platform     text not null references public.social_accounts(platform),
  body         text not null check (char_length(btrim(body)) between 3 and 500 and body !~ '[<>]'),
  planned_slot text check (planned_slot is null or (char_length(planned_slot) <= 20 and planned_slot !~ '[<>]')),
  handle       text,
  status       text not null default 'draft' check (status in ('draft','approved','posted')),
  source       text not null default 'human' check (source in ('human','llm')),
  created_by   uuid references public.members(id) default auth.uid(),
  created_at   timestamptz not null default now(),
  approved_by  uuid references public.members(id),
  approved_at  timestamptz,
  posted_at    timestamptz,
  updated_at   timestamptz not null default now()
);

-- Handles the status changes so the browser cannot forge an approval, a handle or a date.
create or replace function private.social_posts_guard() returns trigger
language plpgsql set search_path = '' as $fn$
declare h text;
begin
  if tg_op = 'UPDATE' then
    new.updated_at := now();
    if new.platform is distinct from old.platform and old.status <> 'draft' then
      raise exception 'An approved post keeps its platform' using errcode = '22023';
    end if;
    -- editing the words of an approved or posted post sends it back to draft
    if new.status = old.status and new.body is distinct from old.body and old.status <> 'draft' then
      new.status := 'draft';
    end if;
    if new.status is distinct from old.status then
      if new.status = 'approved' then
        if old.status <> 'draft' then raise exception 'Only a draft can be approved' using errcode = '22023'; end if;
        select a.handle into h from public.social_accounts a where a.platform = new.platform and a.active;
        if h is null or btrim(h) = '' then raise exception 'Set the account handle first' using errcode = '22023'; end if;
        new.handle := h; new.approved_by := auth.uid(); new.approved_at := now(); new.posted_at := null;
      elsif new.status = 'posted' then
        if old.status <> 'approved' then raise exception 'Only an approved post can be marked posted' using errcode = '22023'; end if;
        new.posted_at := now();
      else
        new.handle := null; new.approved_by := null; new.approved_at := null; new.posted_at := null;
      end if;
    else
      new.handle := old.handle; new.approved_by := old.approved_by; new.approved_at := old.approved_at; new.posted_at := old.posted_at;
    end if;
  end if;
  return new;
end $fn$;
drop trigger if exists social_posts_guard on public.social_posts;
create trigger social_posts_guard before update on public.social_posts
  for each row execute function private.social_posts_guard();

alter table public.social_posts enable row level security;
revoke all on public.social_posts from anon, authenticated;
grant select, insert, update, delete on public.social_posts to authenticated;
drop policy if exists social_posts_read on public.social_posts;
create policy social_posts_read on public.social_posts for select to authenticated
  using (
    private.has_role('admin') or private.has_role('super_admin')
    or (private.has_role('marketing') and status in ('approved','posted')));
drop policy if exists social_posts_add on public.social_posts;
create policy social_posts_add on public.social_posts for insert to authenticated
  with check ((private.has_role('admin') or private.has_role('super_admin'))
              and created_by = auth.uid() and status = 'draft' and source = 'human');
drop policy if exists social_posts_edit on public.social_posts;
create policy social_posts_edit on public.social_posts for update to authenticated
  using (private.has_role('admin') or private.has_role('super_admin'))
  with check (private.has_role('admin') or private.has_role('super_admin'));
drop policy if exists social_posts_remove on public.social_posts;
create policy social_posts_remove on public.social_posts for delete to authenticated
  using (private.has_role('admin') or private.has_role('super_admin'));

-- Check: all lines must say ok.
select 'ideas kind column and check' as item,
  case when (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'marketing_ideas' and column_name = 'kind') = 1
        and (select count(*) from pg_constraint where conrelid = 'public.marketing_ideas'::regclass and conname = 'marketing_ideas_kind_check') = 1 then 'ok' else 'FAIL' end as result
union all select 'social_accounts and social_posts exist with row-level security on',
  case when (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
              where n.nspname = 'public' and c.relname in ('social_accounts','social_posts') and c.relrowsecurity) = 2 then 'ok' else 'FAIL' end
union all select 'four policies on each table',
  case when (select count(*) from pg_policies where schemaname = 'public' and tablename = 'social_accounts') = 4
        and (select count(*) from pg_policies where schemaname = 'public' and tablename = 'social_posts') = 4 then 'ok' else 'FAIL' end
union all select 'marketing cannot write accounts or posts',
  case when (select count(*) from pg_policies where schemaname = 'public' and tablename in ('social_accounts','social_posts')
              and cmd <> 'SELECT' and (coalesce(qual, '') || coalesce(with_check, '')) like '%marketing%') = 0 then 'ok' else 'FAIL' end
union all select 'marketing reads only approved and posted posts',
  case when (select qual from pg_policies where schemaname = 'public' and tablename = 'social_posts' and policyname = 'social_posts_read') like '%approved%' then 'ok' else 'FAIL' end
union all select 'post status guard trigger in place',
  case when (select count(*) from pg_trigger where tgrelid = 'public.social_posts'::regclass and tgname = 'social_posts_guard' and not tgisinternal) = 1 then 'ok' else 'FAIL' end
union all select 'new posts must be drafts from the browser',
  case when (select with_check from pg_policies where schemaname = 'public' and tablename = 'social_posts' and policyname = 'social_posts_add') like '%draft%' then 'ok' else 'FAIL' end;
