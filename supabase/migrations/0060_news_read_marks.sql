-- RUN THIS
-- 0060: read marks for the members home news feed, and link provenance (tracker codes) for submitted articles.
-- Safe to run twice. Needs 0017 (members, roles) and 0024 (author_submissions).
--
-- news_reads: one row per member and story. clicked_at is the FIRST click on the story link, read_at is "Mark read",
-- where_seen is the answer to "Where did you see this article?" (asked when Review is pressed before the story is marked read).
-- The database refuses Mark read less than 20 seconds after the click (the page's own wait is newsReadSeconds, 60 by default).
-- Members see only their own rows. Admins can see who read what and when, to watch for brigading.
--
-- link_provenance: ADMIN ONLY. When a member submits an article, the link saved and opened is the CLEAN one. The tracker TYPE
-- (google, facebook, newsletter...), the raw tracking parameters that were cut off, and the member's "Where did you see it?" answer
-- are kept here, nowhere else. Never shown to reviewers, other members or the public, never in the saved link, never in a repo file.
-- Codes such as fbclid and gclid can tie to a person's ad profile: the privacy policy must say this is kept, and the lawyer should review it.

create table if not exists public.news_reads (
  member_id     uuid not null references public.members(id) on delete cascade,
  item_id       text not null check (item_id ~ '^[a-z0-9][a-z0-9._-]{0,119}$'),
  clicked_at    timestamptz,
  read_at       timestamptz,
  where_seen    text check (char_length(where_seen) <= 200),
  where_seen_at timestamptz,
  primary key (member_id, item_id)
);
revoke all on public.news_reads from public, anon, authenticated;
alter table public.news_reads enable row level security;
create index if not exists news_reads_item_idx on public.news_reads (item_id, read_at);

create or replace function public.news_click(p_item text) returns timestamptz
language plpgsql security definer set search_path = '' as $$
declare t timestamptz;
begin
  if auth.uid() is null or not private.is_member() then raise exception 'Sign in first' using errcode = '42501'; end if;
  if (select count(*) from public.news_reads where member_id = auth.uid() and clicked_at > now() - interval '1 day') >= 300 then
    raise exception 'That is enough stories for today.' using errcode = '54000';
  end if;
  insert into public.news_reads (member_id, item_id, clicked_at) values (auth.uid(), p_item, now())
    on conflict (member_id, item_id) do update set clicked_at = coalesce(public.news_reads.clicked_at, now())
    returning clicked_at into t;
  return t;
end $$;

create or replace function public.news_mark_read(p_item text, p_min_seconds int default 60) returns timestamptz
language plpgsql security definer set search_path = '' as $$
declare r public.news_reads;
begin
  if auth.uid() is null or not private.is_member() then raise exception 'Sign in first' using errcode = '42501'; end if;
  select * into r from public.news_reads where member_id = auth.uid() and item_id = p_item;
  if not found or r.clicked_at is null then raise exception 'Open the story first.' using errcode = '22023'; end if;
  if r.read_at is not null then return r.read_at; end if;
  if now() - r.clicked_at < make_interval(secs => greatest(20, least(coalesce(p_min_seconds, 60), 600))) then
    raise exception 'Give it a little longer, then mark it read.' using errcode = '22023';
  end if;
  update public.news_reads set read_at = now() where member_id = auth.uid() and item_id = p_item returning read_at into r.read_at;
  return r.read_at;
end $$;

create or replace function public.news_where_seen(p_item text, p_answer text) returns void
language plpgsql security definer set search_path = '' as $$
declare a text := nullif(btrim(p_answer), '');
begin
  if auth.uid() is null or not private.is_member() then raise exception 'Sign in first' using errcode = '42501'; end if;
  if a is null or char_length(a) > 200 then raise exception 'Say where you saw it' using errcode = '22023'; end if;
  insert into public.news_reads (member_id, item_id, where_seen, where_seen_at) values (auth.uid(), p_item, a, now())
    on conflict (member_id, item_id) do update set where_seen = coalesce(public.news_reads.where_seen, excluded.where_seen),
      where_seen_at = coalesce(public.news_reads.where_seen_at, excluded.where_seen_at);
end $$;

create or replace function public.news_my_state() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('now', now(), 'rows', coalesce(jsonb_agg(jsonb_build_object('item_id', item_id, 'clicked_at', clicked_at,
    'read_at', read_at, 'where_seen', where_seen)), '[]'::jsonb))
  from (select * from public.news_reads where member_id = auth.uid() order by coalesce(read_at, clicked_at, where_seen_at) desc limit 2000) m
$$;

-- admin: who read a story, when, how fast after the click, and where they said they saw it
create or replace function public.admin_news_read_detail(p_item text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.has_role('admin') then raise exception 'Admins only' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('member', m.display_name, 'clicked_at', r.clicked_at, 'read_at', r.read_at,
      'seconds_to_read', extract(epoch from r.read_at - r.clicked_at)::int, 'where_seen', r.where_seen) order by coalesce(r.read_at, r.clicked_at))
    from public.news_reads r join public.members m on m.id = r.member_id where r.item_id = p_item), '[]'::jsonb);
end $$;

-- admin: read counts per story since a date (the data a "most read" sort or a brigading rule would use; nothing shows it to members yet)
create or replace function public.admin_news_read_counts(p_since timestamptz default now() - interval '30 days') returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.has_role('admin') then raise exception 'Admins only' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(x order by (x->>'readers')::int desc) from (
    select jsonb_build_object('item_id', item_id, 'readers', count(*) filter (where read_at is not null),
      'first_read', min(read_at), 'last_read', max(read_at)) x
    from public.news_reads where coalesce(read_at, clicked_at) >= p_since group by item_id) t), '[]'::jsonb);
end $$;

-- ---------------------------------------------------------------- link provenance (admin only)
create table if not exists public.link_provenance (
  id          bigint generated always as identity primary key,
  member_id   uuid not null references public.members(id),
  kind        text not null check (kind in ('author_submission','news_item')),
  ref         text not null check (char_length(ref) between 1 and 120),
  clean_url   text not null check (char_length(clean_url) <= 2048),
  tracker_types text[] not null default '{}' check (cardinality(tracker_types) <= 12),
  raw_params  text not null default '' check (char_length(raw_params) <= 2000),
  where_seen  text not null check (char_length(where_seen) between 1 and 200),
  created_at  timestamptz not null default now()
);
comment on table public.link_provenance is 'ADMIN ONLY. Tracker types and the raw tracking parameters cut from a submitted link, plus where the member said they saw it. Never exposed to reviewers, members or the public.';
revoke all on public.link_provenance from public, anon, authenticated;
alter table public.link_provenance enable row level security;
create index if not exists link_provenance_ref_idx on public.link_provenance (kind, ref);
drop trigger if exists link_provenance_append_only on public.link_provenance;
create trigger link_provenance_append_only before update or delete on public.link_provenance for each row execute function private.forbid_change();

create or replace function public.record_link_provenance(p_kind text, p_ref text, p_clean_url text, p_types text[], p_params text, p_where text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not private.is_member() then raise exception 'Sign in first' using errcode = '42501'; end if;
  if p_kind not in ('author_submission','news_item') then raise exception 'Unknown kind' using errcode = '22023'; end if;
  if (select count(*) from public.link_provenance where member_id = auth.uid() and created_at > now() - interval '1 day') >= 200 then
    raise exception 'That is enough for today.' using errcode = '54000';
  end if;
  insert into public.link_provenance (member_id, kind, ref, clean_url, tracker_types, raw_params, where_seen)
    values (auth.uid(), p_kind, left(coalesce(p_ref, ''), 120), left(coalesce(p_clean_url, ''), 2048),
            coalesce((select array_agg(distinct left(t, 30)) from unnest(coalesce(p_types, '{}')) t), '{}'),
            left(coalesce(p_params, ''), 2000), left(coalesce(nullif(btrim(p_where), ''), 'no answer'), 200));
end $$;

create or replace function public.admin_link_provenance(p_limit int default 200) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.has_role('admin') then raise exception 'Admins only' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('when', created_at, 'member', m.display_name, 'kind', kind, 'ref', ref, 'clean_url', clean_url,
      'tracker_types', tracker_types, 'raw_params', raw_params, 'where_seen', where_seen) order by created_at desc)
    from (select * from public.link_provenance order by created_at desc limit least(greatest(coalesce(p_limit, 200), 1), 1000)) p
    join public.members m on m.id = p.member_id), '[]'::jsonb);
end $$;

revoke all on function public.news_click(text), public.news_mark_read(text, int), public.news_where_seen(text, text), public.news_my_state(),
  public.admin_news_read_detail(text), public.admin_news_read_counts(timestamptz),
  public.record_link_provenance(text, text, text, text[], text, text), public.admin_link_provenance(int) from public, anon, authenticated;
grant execute on function public.news_click(text), public.news_mark_read(text, int), public.news_where_seen(text, text), public.news_my_state(),
  public.admin_news_read_detail(text), public.admin_news_read_counts(timestamptz),
  public.record_link_provenance(text, text, text, text[], text, text), public.admin_link_provenance(int) to authenticated;
