-- RUN THIS
-- 0101: remember which networks a post already went to, so a post that reached Bluesky but not Facebook stays in the Ready to post
-- list for the one that is still pending. Needs 0100. Safe to run twice. One new column on social_posts; RLS is unchanged.
-- The guard clears the list whenever a post goes back to draft or is approved again, so an edited post starts clean.
alter table public.social_posts add column if not exists posted_platforms text[] not null default '{}';
alter table public.social_posts drop constraint if exists social_posts_posted_platforms_check;
alter table public.social_posts add constraint social_posts_posted_platforms_check
  check (posted_platforms <@ array['bluesky','facebook']::text[]);

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
        new.posted_platforms := '{}';
      elsif new.status = 'posted' then
        if old.status <> 'approved' then raise exception 'Only an approved post can be marked posted' using errcode = '22023'; end if;
        new.posted_at := now(); new.posted_by := auth.uid();
      else
        new.handle := null; new.approved_by := null; new.approved_at := null; new.posted_at := null; new.posted_by := null;
        new.posted_platforms := '{}';
      end if;
    else
      new.handle := old.handle; new.approved_by := old.approved_by; new.approved_at := old.approved_at;
      new.posted_at := old.posted_at; new.posted_by := old.posted_by;
    end if;
  end if;
  return new;
end $fn$;
