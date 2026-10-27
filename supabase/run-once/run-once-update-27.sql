-- run-once-update-27.sql
-- Run AFTER update 26 is live, then upload the update 27 zip. Safe to run more than once.
-- The Commons forum, small additions (migration 0010_commons_pins_rooms.sql):
--   * threads get a "pinned" mark that only moderators can set or clear, through the existing
--     moderate() function (pin_thread / unpin_thread), and each pin goes in the moderation log;
--   * two new rooms: "Research help" and "Local".
-- Nothing is deleted. The existing moderation actions work exactly as before.
begin;
do $$ begin
  if to_regclass('public.case_revision_reports') is null or has_table_privilege('anon', 'public.research_items', 'select') then
    raise exception 'Run run-once-update-25.sql and run-once-update-26.sql first.';
  end if;
end $$;

alter table public.threads add column if not exists pinned_at timestamptz;
-- members insert only (category_id, title); pinned_at is never theirs to set
create or replace function private.before_thread_pin_insert() returns trigger
language plpgsql as $$ begin new.pinned_at := null; return new; end $$;
drop trigger if exists threads_before_insert_pin on public.threads;
create trigger threads_before_insert_pin before insert on public.threads
  for each row execute function private.before_thread_pin_insert();

create or replace function public.moderate(action text, subject_id bigint, reason text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_role('moderator');
  case action
    when 'hide_post' then
      update public.posts set hidden_at = now(), hidden_by = auth.uid() where id = subject_id and hidden_at is null;
    when 'unhide_post' then
      update public.posts set hidden_at = null, hidden_by = null where id = subject_id;
    when 'lock_thread' then
      update public.threads set status = 'locked' where id = subject_id;
    when 'unlock_thread', 'unhide_thread' then
      update public.threads set status = 'open' where id = subject_id;
    when 'hide_thread' then
      update public.threads set status = 'hidden' where id = subject_id;
    when 'pin_thread' then
      update public.threads set pinned_at = now() where id = subject_id and pinned_at is null;
    when 'unpin_thread' then
      update public.threads set pinned_at = null where id = subject_id and pinned_at is not null;
    else
      raise exception 'Unknown moderation action %', action using errcode = '22023';
  end case;
  if not found then
    raise exception 'Nothing to change for % %', action, subject_id using errcode = '02000';
  end if;
  insert into public.moderation_actions (moderator_id, action, subject_type, subject_id, reason)
  values (auth.uid(), action, case when action like '%post' then 'post' else 'thread' end, subject_id::text, reason);
end $$;

insert into public.categories (slug, title, description, sort_order) values
  ('research-help', 'Research help', 'Finding sources, reading data, and checking a claim before it goes to the Research desk', 25),
  ('local',         'Local',         'Your town, county and state: what is going on and what is on your ballot', 35)
on conflict (slug) do nothing;
commit;
