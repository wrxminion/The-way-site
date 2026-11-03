-- Tests for 0098 (Facebook Page numbers and inbox). Standalone: run after migrations 0001 to 0017, 0028 and 0098 on a
-- throwaway Postgres 16 with the Supabase stub. Not run against the live project.
\set ON_ERROR_STOP 1
\set QUIET 1
create schema if not exists art;
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
grant usage on schema art to anon, authenticated;
grant execute on all functions in schema art to anon, authenticated;
create or replace function art.as_user(uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, false);
  perform set_config('role', 'authenticated', false);
end $$;
grant execute on function art.as_user(text) to anon, authenticated;

insert into auth.users values ('00000000-0000-0000-0000-0000000000b1','b@x.org'),('00000000-0000-0000-0000-0000000000d1','d@x.org') on conflict do nothing;
insert into public.members (id, display_name) values ('00000000-0000-0000-0000-0000000000b1','Super B'),('00000000-0000-0000-0000-0000000000d1','Plain D') on conflict do nothing;
insert into public.member_roles (member_id, role) values ('00000000-0000-0000-0000-0000000000b1','super_admin') on conflict do nothing;

insert into public.fb_inbox (id, kind, author_name, message, posted_at) values ('1_2', 'comment', 'Pat', 'hello', now());
insert into public.fb_insights_daily values (current_date, 'page_follows', 7);

select art.as_user('00000000-0000-0000-0000-0000000000d1');
select art.ok((select count(*) from public.fb_inbox) = 0, 'plain member reads no inbox');
select art.ok((select count(*) from public.fb_insights_daily) = 0, 'plain member reads no Facebook numbers');
select art.fails($$insert into public.fb_inbox (id, kind, posted_at) values ('9_9','comment',now())$$, 'permission', 'members cannot write the inbox');
select art.fails($$select public.fb_inbox_mark(array['1_2'])$$, 'Super admins only', 'members cannot mark items read');
reset role;
select art.as_user('00000000-0000-0000-0000-0000000000b1');
select art.ok((select count(*) from public.fb_inbox) = 1, 'super admin reads the inbox');
select art.ok((select count(*) from public.fb_insights_daily) = 1, 'super admin reads Facebook numbers');
select art.ok(public.fb_inbox_mark(array['1_2']) = 1, 'super admin marks an item read');
select art.ok((select read_at is not null from public.fb_inbox where id = '1_2'), 'item is read');
select art.fails($$update public.fb_inbox set message = 'x'$$, 'permission', 'super admin cannot edit inbox rows directly');
reset role;
\echo ALL FACEBOOK INSIGHTS TESTS PASSED
