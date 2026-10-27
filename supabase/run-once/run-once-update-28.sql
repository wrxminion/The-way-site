-- run-once-update-28.sql
-- Run AFTER update 27 is live, then upload the update 28 zip. Safe to run more than once.
-- "Your place" in each member's account panel (migration 0011_member_places.sql):
--   * a new table, member_places: the member's state, and optionally their ZIP and street address;
--   * only that member can read, change or delete their own row: not other members, not
--     moderators, not admins; signed-out visitors have no access at all;
--   * it is not in the audit chain, and "Forget it" deletes the row for good.
-- Nothing existing is changed or deleted.
begin;
do $$ begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'threads' and column_name = 'pinned_at') then
    raise exception 'Run run-once-update-27.sql first.';
  end if;
end $$;

create table if not exists public.member_places (
  member_id  uuid primary key references public.members(id) on delete cascade,
  state      text not null check (state in ('AL','AK','AZ','AR','CA','CO','CT','DE','DC','FL','GA','HI','ID','IL','IN',
               'IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH',
               'OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY')),
  zip        text check (zip ~ '^[0-9]{5}$'),
  address    text check (char_length(address) between 1 and 200 and address !~ '[<>]'),
  updated_at timestamptz not null default now()
);

create or replace function private.member_places_touch() returns trigger
language plpgsql as $$ begin new.updated_at := now(); return new; end $$;
drop trigger if exists member_places_touch on public.member_places;
create trigger member_places_touch before insert or update on public.member_places
  for each row execute function private.member_places_touch();

alter table public.member_places enable row level security;
alter table public.member_places force row level security;
revoke all on public.member_places from public, anon, authenticated;
grant select, insert, update, delete on public.member_places to authenticated;

drop policy if exists member_places_own on public.member_places;
create policy member_places_own on public.member_places for all to authenticated
  using (member_id = auth.uid() and private.is_member())
  with check (member_id = auth.uid() and private.is_member());

commit;
