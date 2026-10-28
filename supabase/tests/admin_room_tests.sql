-- Tests for 0028 (Admin room, site stats). Standalone: run after migrations 0001 to 0017 and 0028 on a throwaway
-- Postgres 16 with the Supabase stub. Not run against the live project.
\set ON_ERROR_STOP 1
\set QUIET 1
create schema if not exists art;
grant usage on schema art to anon, authenticated;
create or replace function art.ok(cond boolean, what text) returns void language plpgsql as $$
begin if cond is not true then raise exception 'FAIL: %', what; end if; raise notice 'pass: %', what; end $$;
create or replace function art.fails(stmt text, pattern text, what text) returns void language plpgsql as $$
begin
  begin execute stmt;
  exception when others then
    if sqlerrm ilike '%' || pattern || '%' then raise notice 'pass: %', what; return; end if;
    raise exception 'FAIL: % (wrong error: %)', what, sqlerrm;
  end;
  raise exception 'FAIL: % (statement succeeded)', what;
end $$;
grant execute on all functions in schema art to anon, authenticated;

insert into auth.users values
  ('00000000-0000-0000-0000-0000000000a1','a@x.org'),('00000000-0000-0000-0000-0000000000b1','b@x.org'),
  ('00000000-0000-0000-0000-0000000000c1','c@x.org'),('00000000-0000-0000-0000-0000000000d1','d@x.org') on conflict do nothing;
insert into public.members (id, display_name) values
  ('00000000-0000-0000-0000-0000000000a1','Admin A'),('00000000-0000-0000-0000-0000000000b1','Super B'),
  ('00000000-0000-0000-0000-0000000000c1','Mod C'),('00000000-0000-0000-0000-0000000000d1','Plain D') on conflict do nothing;
insert into public.member_roles (member_id, role) values
  ('00000000-0000-0000-0000-0000000000a1','admin'),('00000000-0000-0000-0000-0000000000b1','super_admin'),
  ('00000000-0000-0000-0000-0000000000c1','moderator') on conflict do nothing;

create or replace function art.as_user(uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, false);
  perform set_config('role', 'authenticated', false);
end $$;
grant execute on function art.as_user(text) to anon, authenticated;

-- an admin (as admin) starts a thread in the Admin room
select art.as_user('00000000-0000-0000-0000-0000000000a1');
select public.start_thread((select id from public.categories where slug = 'admin'), 'Admin only thread', 'secret planning');
select art.ok((select count(*) from public.categories where slug = 'admin') = 1, 'admin sees the Admin room');
select art.ok((select count(*) from public.threads where title = 'Admin only thread') = 1, 'admin reads an Admin room thread');
select art.ok((select count(*) from public.posts where body = 'secret planning') = 1, 'admin reads an Admin room post');

select art.as_user('00000000-0000-0000-0000-0000000000b1');
select art.ok((select count(*) from public.threads where title = 'Admin only thread') = 1, 'super admin reads an Admin room thread');
select public.start_thread((select id from public.categories where slug = 'admin'), 'Super admin thread', 'hello admins');
select art.ok(true, 'super admin posts in the Admin room');
select art.ok((select count(*) from public.site_stats_meta) = 0, 'super admin can read site stats tables');

-- moderator and plain member see and do nothing in the Admin room
select art.as_user('00000000-0000-0000-0000-0000000000c1');
select art.ok((select count(*) from public.categories where slug = 'admin') = 0, 'moderator does not see the Admin room');
select art.ok((select count(*) from public.threads where title like '%thread') = 0, 'moderator does not read Admin room threads');
select art.ok((select count(*) from public.posts where body = 'secret planning') = 0, 'moderator does not read Admin room posts');
select art.fails($$select public.start_thread((select id from public.categories where slug = 'admin'), 'Sneaky', 'hi')$$, '', 'moderator cannot start an Admin room thread');
select art.fails($$select public.moderate('lock_thread', (select id from public.threads where title = 'Admin only thread'), 'test')$$, '', 'moderator cannot moderate an Admin room thread');

select art.as_user('00000000-0000-0000-0000-0000000000d1');
select art.ok((select count(*) from public.categories where slug = 'admin') = 0, 'plain member does not see the Admin room');
select art.ok((select count(*) from public.threads) = 0, 'plain member reads no Admin room threads');
select art.fails($$select public.start_thread((select id from public.categories where slug = 'admin'), 'Sneaky', 'hi')$$, '', 'plain member cannot post in the Admin room');
select art.fails($$insert into public.site_stats_daily values (current_date,'total','x',1,1)$$, 'permission', 'members cannot write site stats');
select art.ok((select count(*) from public.categories where slug = 'general') = 1, 'plain member still sees open rooms');
reset role;
select art.as_user('00000000-0000-0000-0000-0000000000d1');
select public.start_thread((select id from public.categories where slug = 'general'), 'Open thread', 'hello');
select art.ok((select count(*) from public.threads where title = 'Open thread') = 1, 'plain member can still post in open rooms');

select art.as_user('00000000-0000-0000-0000-0000000000d1');
select art.ok((select count(*) from public.site_stats_daily) = 0, 'plain member reads no site stats');
reset role;
insert into public.site_stats_daily values (current_date, 'total', 'all', 5, 9);
select art.as_user('00000000-0000-0000-0000-0000000000d1');
select art.ok((select count(*) from public.site_stats_daily) = 0, 'plain member still reads no site stats once rows exist');
select art.as_user('00000000-0000-0000-0000-0000000000a1');
select art.ok((select count(*) from public.site_stats_daily) = 0, 'a plain admin (not super) reads no site stats');
select art.as_user('00000000-0000-0000-0000-0000000000b1');
select art.ok((select count(*) from public.site_stats_daily) = 1, 'super admin reads site stats');
select art.as_user('00000000-0000-0000-0000-0000000000b1');
select art.ok((select visits from public.site_stats_top('total', 30, 5)) = 5, 'super admin reads the summary');
select art.as_user('00000000-0000-0000-0000-0000000000a1');
select art.ok((select count(*) from public.site_stats_top('total', 30, 5)) = 0, 'a plain admin gets an empty summary');
reset role;
\echo ALL ADMIN ROOM TESTS PASSED
