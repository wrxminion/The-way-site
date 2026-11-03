-- RUN THIS in the Supabase SQL editor (one paste, safe to run twice). Needs 0091.
-- 0094: posts and ideas can carry ONE link to real content on this site.
--   * New columns link_path and link_title on social_posts and marketing_ideas. link_path is a path on this site only
--     (starts with '/', no 'http', no angle brackets). link_title is the title of that page. Both are set together or both empty.
--   * They are chosen from a picker on the Media page and never typed. The post text is separate, and admins edit it.
--   * Only admins and super admins may change a link on an existing row. Anyone else changing a link is refused.
--   * Two unique indexes stop the same post or idea (same text and link) from being added twice.
--   * marketing_ideas.category groups the ideas on the Media page: copy, posts, canned_response, debate_reply, conversation, idea.
--     Existing rows are sorted by plain UPDATE statements (copy stays copy, openers and closers become conversation, the rest stay
--     idea). Approvals are NOT touched: no status is changed. Admins can move an item to another category on the Media page.
-- Plain text only. No member data. Nothing posts anywhere. The seed with real links is in 0095, a separate paste.

alter table public.marketing_ideas add column if not exists link_path text;
alter table public.marketing_ideas add column if not exists link_title text;
alter table public.social_posts add column if not exists link_path text;
alter table public.social_posts add column if not exists link_title text;

alter table public.marketing_ideas drop constraint if exists marketing_ideas_link_check;
alter table public.marketing_ideas add constraint marketing_ideas_link_check check (
  (link_path is null and link_title is null)
  or (link_path is not null and link_title is not null and link_path ~ '^/[A-Za-z0-9_./~-]*$' and link_path !~* 'http' and char_length(link_path) <= 200
      and char_length(btrim(link_title)) between 1 and 200 and link_title !~ '[<>]'));

alter table public.social_posts drop constraint if exists social_posts_link_check;
alter table public.social_posts add constraint social_posts_link_check check (
  (link_path is null and link_title is null)
  or (link_path is not null and link_title is not null and link_path ~ '^/[A-Za-z0-9_./~-]*$' and link_path !~* 'http' and char_length(link_path) <= 200
      and char_length(btrim(link_title)) between 1 and 200 and link_title !~ '[<>]'));

do $$
begin
  if exists (select 1 from public.marketing_ideas group by kind, body, coalesce(link_path, '') having count(*) > 1)
     or exists (select 1 from public.social_posts group by platform, body, coalesce(link_path, '') having count(*) > 1) then
    raise exception 'Some posts or ideas appear twice. Stop and ask Claude to list them before running this.';
  end if;
end $$;
create unique index if not exists social_posts_dedupe on public.social_posts (platform, body, (coalesce(link_path, '')));
create unique index if not exists marketing_ideas_dedupe on public.marketing_ideas (kind, body, (coalesce(link_path, '')));

alter table public.marketing_ideas add column if not exists category text default 'idea';
alter table public.marketing_ideas drop constraint if exists marketing_ideas_category_check;
alter table public.marketing_ideas add constraint marketing_ideas_category_check
  check (category in ('copy','posts','canned_response','debate_reply','conversation','idea'));
update public.marketing_ideas set category = 'copy' where kind = 'copy' and category = 'idea';
update public.marketing_ideas set category = 'conversation' where kind in ('opener','closer') and category = 'idea';

-- A link on an existing idea or post can be changed only by an admin or super admin (a person at the SQL editor has no
-- sign-in, so that is allowed too). New function and new trigger; nothing existing is changed.
create or replace function private.link_lock() returns trigger
language plpgsql set search_path = '' as $fn$
begin
  if (new.link_path is distinct from old.link_path or new.link_title is distinct from old.link_title)
     and auth.uid() is not null
     and not (private.has_role('admin') or private.has_role('super_admin')) then
    raise exception 'Only an admin can change a link' using errcode = '42501';
  end if;
  return new;
end $fn$;
drop trigger if exists marketing_ideas_link_lock on public.marketing_ideas;
create trigger marketing_ideas_link_lock before update on public.marketing_ideas
  for each row execute function private.link_lock();
drop trigger if exists social_posts_link_lock on public.social_posts;
create trigger social_posts_link_lock before update on public.social_posts
  for each row execute function private.link_lock();

-- Check: all lines must say ok.
select 'link columns exist on both tables' as item,
  case when (select count(*) from information_schema.columns where table_schema = 'public'
              and table_name in ('social_posts','marketing_ideas') and column_name in ('link_path','link_title')) = 4 then 'ok' else 'FAIL' end as result
union all select 'link checks in place',
  case when (select count(*) from pg_constraint where conname in ('marketing_ideas_link_check','social_posts_link_check')) = 2 then 'ok' else 'FAIL' end
union all select 'unique indexes in place',
  case when (select count(*) from pg_indexes where schemaname = 'public' and indexname in ('social_posts_dedupe','marketing_ideas_dedupe')) = 2 then 'ok' else 'FAIL' end
union all select 'link lock triggers in place',
  case when (select count(*) from pg_trigger where tgname in ('marketing_ideas_link_lock','social_posts_link_lock') and not tgisinternal) = 2 then 'ok' else 'FAIL' end
union all select 'category column and check in place',
  case when (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'marketing_ideas' and column_name = 'category') = 1
        and (select count(*) from pg_constraint where conname = 'marketing_ideas_category_check') = 1 then 'ok' else 'FAIL' end
union all select 'every idea has a category',
  case when (select count(*) from public.marketing_ideas where category is null) = 0 then 'ok' else 'FAIL' end
union all select 'copy, openers and closers are sorted',
  case when (select count(*) from public.marketing_ideas where (kind = 'copy' and category = 'idea') or (kind in ('opener','closer') and category = 'idea')) = 0 then 'ok' else 'note: some were left in ideas' end
union all select 'no stored link has http or angle brackets',
  case when (select count(*) from public.social_posts where link_path ~* 'http' or link_path ~ '[<>]') = 0
        and (select count(*) from public.marketing_ideas where link_path ~* 'http' or link_path ~ '[<>]') = 0 then 'ok' else 'FAIL' end;
