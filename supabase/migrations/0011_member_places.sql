-- The Way: "Your place" in the member's own account panel (update 28, Frank Oct 15 2026).
-- Each member may save their state, and optionally a ZIP code and a street address, so the
-- map and the ballot link open on their state on any device. Only that member can read or
-- change their row: not other members, not moderators, not admins (no role check here on
-- purpose). It is never shown on any page but their own account panel, it is not in the
-- audit chain, and "Forget it" deletes the row for good.

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
