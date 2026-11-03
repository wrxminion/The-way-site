-- RUN THIS
-- 0098: Facebook Page numbers and a Facebook inbox, for super admins only (Admin > Facebook). Needs 0001 and 0028. Safe to run twice.
-- Filled only by the fb-insights Edge Function (service role). The Page token is a function secret that never reaches the
-- browser or the repo. fb_insights_daily holds one number per day per Meta Page Insights metric. fb_inbox holds comments on
-- the Page's posts and posts that visitors made on the Page: the commenter's public display name and the text, no Facebook
-- user ids. "platform" is there so other networks can share the inbox later. Nothing here is readable by anon or members.
create table if not exists public.fb_insights_daily (
  day    date not null,
  metric text not null check (char_length(metric) <= 80),
  value  bigint not null default 0,
  primary key (day, metric)
);
create table if not exists public.fb_inbox (
  id          text primary key check (char_length(id) <= 80),
  platform    text not null default 'facebook' check (platform in ('facebook')),
  kind        text not null check (kind in ('comment','visitor_post')),
  post_id     text check (post_id is null or char_length(post_id) <= 80),
  post_link   text check (post_link is null or char_length(post_link) <= 500),
  parent_id   text check (parent_id is null or char_length(parent_id) <= 80),
  author_name text check (author_name is null or char_length(author_name) <= 200),
  message     text check (message is null or char_length(message) <= 8000),
  posted_at   timestamptz not null,
  read_at     timestamptz,
  replied_at  timestamptz,
  reply_text  text check (reply_text is null or char_length(reply_text) <= 2000)
);
create index if not exists fb_inbox_posted_idx on public.fb_inbox (posted_at desc);
create table if not exists public.fb_meta (
  id           int primary key check (id = 1),
  refreshed_at timestamptz,
  ok           boolean,
  note         text check (note is null or char_length(note) <= 1000)
);
alter table public.fb_insights_daily enable row level security;
alter table public.fb_inbox          enable row level security;
alter table public.fb_meta           enable row level security;
revoke all on public.fb_insights_daily, public.fb_inbox, public.fb_meta from anon, authenticated;
grant select on public.fb_insights_daily, public.fb_inbox, public.fb_meta to authenticated;
drop policy if exists fb_insights_daily_read on public.fb_insights_daily;
create policy fb_insights_daily_read on public.fb_insights_daily for select to authenticated using (private.has_role('super_admin'));
drop policy if exists fb_inbox_read on public.fb_inbox;
create policy fb_inbox_read on public.fb_inbox for select to authenticated using (private.has_role('super_admin'));
drop policy if exists fb_meta_read on public.fb_meta;
create policy fb_meta_read on public.fb_meta for select to authenticated using (private.has_role('super_admin'));

-- Mark inbox items read (or unread). The only write a signed-in super admin can make; replies go through the Edge Function.
create or replace function public.fb_inbox_mark(p_ids text[], p_read boolean default true) returns integer
language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  if not private.has_role('super_admin') then raise exception 'Super admins only' using errcode = '42501'; end if;
  update public.fb_inbox set read_at = case when p_read then coalesce(read_at, now()) else null end
   where id = any(coalesce(p_ids, '{}'::text[]));
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.fb_inbox_mark(text[], boolean) from public, anon;
grant execute on function public.fb_inbox_mark(text[], boolean) to authenticated;
