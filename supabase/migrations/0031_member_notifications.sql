-- The Way: member notifications (Frank, Oct 28 2026). Needs 0001. Safe to run twice.
-- A plain list, one row per notice, readable only by the member it is for. Anything on the site can raise one through
-- private.notify() from inside a database function; there is no way to send a notice from the browser.
-- No direct messages between members, by design (transparency rule): notices come from the site, never from a person.
-- Notices carry site-written text only (a short title and body) and a link to a page on this site.

create table if not exists public.member_notifications (
  id           bigint generated always as identity primary key,
  member_id    uuid not null references public.members(id),
  kind         text not null check (kind ~ '^[a-z_]{3,40}$'),
  title        text not null check (char_length(btrim(title)) between 3 and 120 and title !~ '[<>]'),
  body         text check (body is null or (char_length(body) <= 600 and body !~ '[<>]')),
  link         text check (link is null or link ~ '^/[A-Za-z0-9/_#.?=&%-]{0,250}$'),
  source_type  text check (source_type is null or source_type ~ '^[a-z_]{3,40}$'),
  source_id    text check (source_id is null or char_length(source_id) <= 80),
  created_at   timestamptz not null default now(),
  read_at      timestamptz
);
comment on table public.member_notifications is 'One notice for one member. Written only by private.notify(). The member can read their own and mark them read; nothing else.';
create index if not exists member_notifications_inbox on public.member_notifications (member_id, id desc);
create index if not exists member_notifications_unread on public.member_notifications (member_id) where read_at is null;
create unique index if not exists member_notifications_once on public.member_notifications (member_id, kind, source_type, source_id) where source_id is not null;
revoke all on public.member_notifications from public, anon, authenticated;
grant select on public.member_notifications to authenticated;
alter table public.member_notifications enable row level security;
drop policy if exists member_notifications_own on public.member_notifications;
create policy member_notifications_own on public.member_notifications for select to authenticated using (member_id = auth.uid());

-- Internal: raise a notice. Not granted to anyone; other security-definer functions call it. A repeat for the same
-- (member, kind, source) is ignored. Each member keeps their newest 300.
create or replace function private.notify(p_member uuid, p_kind text, p_title text, p_body text, p_link text,
                                          p_source_type text default null, p_source_id text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_member is null or not exists (select 1 from public.members where id = p_member and status = 'active') then return; end if;
  insert into public.member_notifications (member_id, kind, title, body, link, source_type, source_id)
  values (p_member, p_kind, left(btrim(p_title), 120), nullif(left(btrim(coalesce(p_body, '')), 600), ''), p_link, p_source_type, p_source_id)
  on conflict do nothing;
  delete from public.member_notifications
   where member_id = p_member and id < (select min(id) from (select id from public.member_notifications where member_id = p_member order by id desc limit 300) k);
end $$;

create or replace function public.my_notifications(p_unread_only boolean default false, p_limit int default 50)
returns table (id bigint, kind text, title text, body text, link text, created_at timestamptz, read_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select n.id, n.kind, n.title, n.body, n.link, n.created_at, n.read_at
    from public.member_notifications n
   where n.member_id = auth.uid() and (not coalesce(p_unread_only, false) or n.read_at is null)
   order by n.id desc limit greatest(1, least(coalesce(p_limit, 50), 200));
$$;

create or replace function public.my_unread_count() returns int
language sql stable security definer set search_path = '' as $$
  select count(*)::int from public.member_notifications where member_id = auth.uid() and read_at is null;
$$;

-- p_ids null = mark everything read
create or replace function public.mark_notifications_read(p_ids bigint[] default null) returns int
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  if auth.uid() is null then raise exception 'Sign in first' using errcode = '42501'; end if;
  update public.member_notifications set read_at = now()
   where member_id = auth.uid() and read_at is null and (p_ids is null or id = any(p_ids));
  get diagnostics n = row_count;
  return n;
end $$;

revoke all on function private.notify(uuid,text,text,text,text,text,text), public.my_notifications(boolean,int), public.my_unread_count(),
  public.mark_notifications_read(bigint[]) from public, anon, authenticated;
grant execute on function public.my_notifications(boolean,int), public.my_unread_count(), public.mark_notifications_read(bigint[]) to authenticated;
