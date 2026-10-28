-- RUN THIS
-- 0044: review status for every page the AI wrote (voter guides, measures, cases, government guide, news synopses, research).
-- Statuses, in order: ai_unchecked ("AI written, unchecked"), skimmed ("AI written, human skimmed"), read ("AI written, human read"),
-- under_review ("Under review, some sources verified"), confirmed ("Confirmed accurate by a human", all sources verified).
-- A page with no row shows the default (skimmed, per Frank Oct 28: everything published so far has been skimmed).
-- Who may change a status is a setting (content_review_settings.allowed_roles, default admin only); widen it later with
-- content_review_set_roles, no rebuild. Every change is logged with who, when and the old and new status.
-- Public pages cannot call the database, so a scheduled Action copies content_review_public() to the ledger-data branch
-- and the deploy publishes it as /content-status.json. Needs 0001. Safe to run again.
do $guard$
begin
  if to_regprocedure('private.has_role(text)') is null then raise exception 'Stop: run 0001 first'; end if;
end $guard$;

create table if not exists public.content_review_settings (
  id int primary key check (id = 1),
  allowed_roles text[] not null default array['admin']::text[],
  default_status text not null default 'skimmed'
    check (default_status in ('ai_unchecked','skimmed','read','under_review','confirmed'))
);
insert into public.content_review_settings (id) values (1) on conflict (id) do nothing;

create table if not exists public.content_review (
  path text primary key check (path ~ '^/(preview/pages|research)/[A-Za-z0-9_./-]{1,300}$' and path !~ '\.\.'),
  status text not null check (status in ('ai_unchecked','skimmed','read','under_review','confirmed')),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.members(id)
);

create table if not exists public.content_review_log (
  id bigserial primary key,
  path text not null,
  old_status text,
  new_status text not null,
  changed_by uuid references public.members(id),
  changed_at timestamptz not null default now(),
  note text check (note is null or char_length(note) <= 300)
);

alter table public.content_review_settings enable row level security;
alter table public.content_review enable row level security;
alter table public.content_review_log enable row level security;
revoke all on public.content_review_settings, public.content_review, public.content_review_log from anon, authenticated;

create or replace function private.content_review_can() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.member_roles r
    join public.members m on m.id = r.member_id
    cross join public.content_review_settings s
    where r.member_id = auth.uid() and m.status = 'active'
      and (r.role = 'admin' or r.role = any (s.allowed_roles)));
$$;
revoke all on function private.content_review_can() from public, anon;
grant execute on function private.content_review_can() to authenticated;

create or replace function public.content_review_public() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'default', (select default_status from public.content_review_settings where id = 1),
    'items', coalesce((select jsonb_object_agg(path, status order by path) from public.content_review), '{}'::jsonb));
$$;
revoke all on function public.content_review_public() from public;
grant execute on function public.content_review_public() to anon, authenticated;

create or replace function public.content_review_can_set() returns boolean
language sql stable security definer set search_path = '' as $$ select private.content_review_can(); $$;
revoke all on function public.content_review_can_set() from public, anon;
grant execute on function public.content_review_can_set() to authenticated;

create or replace function public.content_review_get(p_path text) returns text
language plpgsql stable security definer set search_path = '' as $$
declare s text;
begin
  if not private.content_review_can() then raise exception 'Not allowed' using errcode = '42501'; end if;
  select status into s from public.content_review where path = p_path;
  return coalesce(s, (select default_status from public.content_review_settings where id = 1));
end $$;
revoke all on function public.content_review_get(text) from public, anon;
grant execute on function public.content_review_get(text) to authenticated;

create or replace function public.content_review_set(p_path text, p_status text, p_note text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare old text;
begin
  if not private.content_review_can() then raise exception 'Not allowed: your role cannot change review status' using errcode = '42501'; end if;
  if p_path is null or p_path !~ '^/(preview/pages|research)/[A-Za-z0-9_./-]{1,300}$' or p_path ~ '\.\.' then raise exception 'Bad page path'; end if;
  if p_status is null or p_status not in ('ai_unchecked','skimmed','read','under_review','confirmed') then raise exception 'Bad status'; end if;
  if p_note is not null and char_length(p_note) > 300 then raise exception 'Note is too long (300 characters at most)'; end if;
  select status into old from public.content_review where path = p_path;
  if old is null then select default_status into old from public.content_review_settings where id = 1; end if;
  insert into public.content_review (path, status, updated_by) values (p_path, p_status, auth.uid())
    on conflict (path) do update set status = excluded.status, updated_at = now(), updated_by = excluded.updated_by;
  insert into public.content_review_log (path, old_status, new_status, changed_by, note)
    values (p_path, old, p_status, auth.uid(), nullif(btrim(p_note), ''));
end $$;
revoke all on function public.content_review_set(text, text, text) from public, anon;
grant execute on function public.content_review_set(text, text, text) to authenticated;

create or replace function public.content_review_log_recent(p_limit int default 50) returns table
  (path text, old_status text, new_status text, changed_by_name text, changed_at timestamptz, note text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.content_review_can() then raise exception 'Not allowed' using errcode = '42501'; end if;
  return query
    select l.path, l.old_status, l.new_status, coalesce(m.display_name, 'a former member'), l.changed_at, l.note
    from public.content_review_log l left join public.members m on m.id = l.changed_by
    order by l.id desc limit least(greatest(coalesce(p_limit, 50), 1), 200);
end $$;
revoke all on function public.content_review_log_recent(int) from public, anon;
grant execute on function public.content_review_log_recent(int) to authenticated;

-- Admins widen (or narrow) who may change a status, for example array['reviewer','editor'] as members rank up.
create or replace function public.content_review_set_roles(p_roles text[]) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.has_role('admin') then raise exception 'Not allowed: admins only' using errcode = '42501'; end if;
  if p_roles is null or not (p_roles <@ array['moderator','researcher','reviewer','editor','admin']::text[]) then raise exception 'Unknown role in the list'; end if;
  update public.content_review_settings set allowed_roles = p_roles where id = 1;
end $$;
revoke all on function public.content_review_set_roles(text[]) from public, anon;
grant execute on function public.content_review_set_roles(text[]) to authenticated;

create or replace function public.content_review_roles() returns text[]
language sql stable security definer set search_path = '' as $$
  select case when private.has_role('admin') then (select allowed_roles from public.content_review_settings where id = 1) end;
$$;
revoke all on function public.content_review_roles() from public, anon;
grant execute on function public.content_review_roles() to authenticated;

-- Check: every line must say ok.
select 'public json' as item, case when public.content_review_public() ->> 'default' = 'skimmed' then 'ok' else 'FAIL' end as result
union all select 'anon cannot set', case when not has_function_privilege('anon', 'public.content_review_set(text,text,text)', 'execute') then 'ok' else 'FAIL' end
union all select 'anon cannot read log', case when not has_function_privilege('anon', 'public.content_review_log_recent(int)', 'execute') then 'ok' else 'FAIL' end
union all select 'tables closed', case when not has_table_privilege('authenticated', 'public.content_review', 'select') then 'ok' else 'FAIL' end;
