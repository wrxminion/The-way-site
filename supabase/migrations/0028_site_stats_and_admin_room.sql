-- The Way 0028: (1) an "Admin" room in the Commons that only admins and super admins can see or post in,
-- enforced by row-level security; (2) site analytics summaries (Cloudflare Web Analytics) that only super admins can read.
-- Safe to run again. Needs 0001 and 0017 (super_admin role).

-- ---------------------------------------------------------------- Admin room
alter table public.categories add column if not exists min_role text check (min_role is null or min_role = 'admin');

-- True when the caller may see and post in this room. A room with no min_role is open to every member.
create or replace function private.room_ok(cat bigint) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.categories c where c.id = cat and (c.min_role is null or private.has_role(c.min_role)));
$$;
grant execute on function private.room_ok(bigint) to authenticated;

drop policy if exists categories_read on public.categories;
create policy categories_read on public.categories for select to authenticated
  using (private.is_member() and private.room_ok(id));

drop policy if exists threads_read on public.threads;
create policy threads_read on public.threads for select to authenticated
  using (private.is_member() and private.room_ok(category_id) and (status <> 'hidden' or private.has_role('moderator')));

drop policy if exists threads_create on public.threads;
create policy threads_create on public.threads for insert to authenticated
  with check (private.is_member() and private.room_ok(category_id)
    and exists (select 1 from public.categories c where c.id = category_id and not c.locked));

drop policy if exists posts_read on public.posts;
create policy posts_read on public.posts for select to authenticated
  using (private.is_member()
    and (hidden_at is null or author_id = auth.uid() or private.has_role('moderator'))
    and exists (select 1 from public.threads t where t.id = thread_id and private.room_ok(t.category_id)));

drop policy if exists posts_create on public.posts;
create policy posts_create on public.posts for insert to authenticated
  with check (private.is_member()
    and exists (select 1 from public.threads t where t.id = thread_id and t.status = 'open' and private.room_ok(t.category_id)));

-- moderate() is security definer, so a plain moderator could otherwise pin, lock or hide an Admin-room
-- thread by its id. These guards stop that. They only apply to signed-in callers (auth.uid() is not null).
create or replace function private.room_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare cat bigint;
begin
  if auth.uid() is null then return new; end if;
  if tg_table_name = 'threads' then cat := new.category_id;
  else select t.category_id into cat from public.threads t where t.id = new.thread_id;
  end if;
  if not private.room_ok(cat) then
    raise exception 'Not allowed in this room' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists threads_room_guard on public.threads;
create trigger threads_room_guard before update on public.threads for each row execute function private.room_guard();
drop trigger if exists posts_room_guard on public.posts;
create trigger posts_room_guard before update on public.posts for each row execute function private.room_guard();

insert into public.categories (slug, title, description, sort_order, min_role) values
  ('admin', 'Admin', 'Admins and super admins only. Not visible to other members.', 90, 'admin')
on conflict (slug) do update set min_role = 'admin';

-- ---------------------------------------------------------------- Site stats
-- Written only by the site-stats Edge Function (service role, which holds the Cloudflare token as a secret).
-- Read only by super admins. No IP addresses, no per-visitor rows: only daily counts by page, referrer host,
-- country and state-guide interest.
create table if not exists public.site_stats_daily (
  day        date not null,
  kind       text not null check (kind in ('total','page','referrer','country','state')),
  label      text not null check (char_length(label) <= 200),
  visits     int  not null default 0 check (visits >= 0),
  page_views int  not null default 0 check (page_views >= 0),
  primary key (day, kind, label)
);
create table if not exists public.site_stats_meta (
  id           int primary key check (id = 1),
  refreshed_at timestamptz,
  ok           boolean,
  note         text check (note is null or char_length(note) <= 500)
);
alter table public.site_stats_daily enable row level security;
alter table public.site_stats_meta  enable row level security;
revoke all on public.site_stats_daily, public.site_stats_meta from anon, authenticated;
grant select on public.site_stats_daily, public.site_stats_meta to authenticated;
drop policy if exists site_stats_daily_read on public.site_stats_daily;
create policy site_stats_daily_read on public.site_stats_daily for select to authenticated using (private.has_role('super_admin'));
drop policy if exists site_stats_meta_read on public.site_stats_meta;
create policy site_stats_meta_read on public.site_stats_meta for select to authenticated using (private.has_role('super_admin'));

-- Totals for the Admin panel: the busiest labels of one kind over the last p_days days. Security invoker, so the
-- table's row-level security still applies: anyone who is not a super admin gets no rows.
create or replace function public.site_stats_top(p_kind text, p_days int default 30, p_limit int default 15)
returns table (label text, visits bigint, page_views bigint)
language sql stable security invoker set search_path = '' as $$
  select d.label, sum(d.visits)::bigint, sum(d.page_views)::bigint
    from public.site_stats_daily d
   where d.kind = p_kind and d.day >= current_date - greatest(1, least(coalesce(p_days, 30), 400))
   group by d.label
   order by sum(d.page_views) desc, d.label
   limit greatest(1, least(coalesce(p_limit, 15), 300));
$$;
revoke all on function public.site_stats_top(text, int, int) from public, anon;
grant execute on function public.site_stats_top(text, int, int) to authenticated;
