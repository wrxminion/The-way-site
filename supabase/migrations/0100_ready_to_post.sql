-- RUN THIS
-- 0100: make the Media page "Social media posts" list the queue for Admin > Post online. Needs 0091 and 0094. Safe to run twice.
-- No new table. Four new columns on social_posts: who posted it and where, a review label, and a source (for items that come from a
-- news feed later). Only approved posts get a Post button, and only a super admin can press it; the site function that publishes
-- checks the same. The guard now also records who marked a post posted. Same read and write rules as before (RLS is unchanged).
alter table public.social_posts add column if not exists posted_by   uuid references public.members(id);
alter table public.social_posts add column if not exists review_status text;
alter table public.social_posts add column if not exists source_name text;
alter table public.social_posts add column if not exists source_url  text;
alter table public.social_posts drop constraint if exists social_posts_review_status_check;
alter table public.social_posts add constraint social_posts_review_status_check
  check (review_status is null or review_status in ('checked','ai_unreviewed'));
alter table public.social_posts drop constraint if exists social_posts_source_check;
alter table public.social_posts add constraint social_posts_source_check check (
  (source_name is null or (char_length(btrim(source_name)) between 1 and 120 and source_name !~ '[<>]'))
  and (source_url is null or (source_url ~ '^https://[A-Za-z0-9.-]+(/[^ <>"]*)?$' and char_length(source_url) <= 500)));

create or replace function private.social_posts_guard() returns trigger
language plpgsql set search_path = '' as $fn$
declare h text;
begin
  if tg_op = 'UPDATE' then
    new.updated_at := now();
    if new.platform is distinct from old.platform and old.status <> 'draft' then
      raise exception 'An approved post keeps its platform' using errcode = '22023';
    end if;
    if new.status = old.status and new.body is distinct from old.body and old.status <> 'draft' then
      new.status := 'draft';
    end if;
    if new.status is distinct from old.status then
      if new.status = 'approved' then
        if old.status <> 'draft' then raise exception 'Only a draft can be approved' using errcode = '22023'; end if;
        select a.handle into h from public.social_accounts a where a.platform = new.platform and a.active;
        if h is null or btrim(h) = '' then raise exception 'Set the account handle first' using errcode = '22023'; end if;
        new.handle := h; new.approved_by := auth.uid(); new.approved_at := now(); new.posted_at := null; new.posted_by := null;
      elsif new.status = 'posted' then
        if old.status <> 'approved' then raise exception 'Only an approved post can be marked posted' using errcode = '22023'; end if;
        new.posted_at := now(); new.posted_by := auth.uid();
      else
        new.handle := null; new.approved_by := null; new.approved_at := null; new.posted_at := null; new.posted_by := null;
      end if;
    else
      new.handle := old.handle; new.approved_by := old.approved_by; new.approved_at := old.approved_at;
      new.posted_at := old.posted_at; new.posted_by := old.posted_by;
    end if;
  end if;
  return new;
end $fn$;
