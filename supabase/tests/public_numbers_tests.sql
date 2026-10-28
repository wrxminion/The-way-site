-- Tests for 0029 (public monthly numbers). Run after 0001 to 0017, 0028 and 0029 on a throwaway Postgres 16 with the stub.
\set ON_ERROR_STOP 1
\set QUIET 1
create schema if not exists pnt;
grant usage on schema pnt to anon, authenticated;
create or replace function pnt.ok(cond boolean, what text) returns void language plpgsql as $$
begin if cond is not true then raise exception 'FAIL: %', what; end if; raise notice 'pass: %', what; end $$;

delete from public.site_stats_daily; delete from public.site_stats_meta;
grant execute on all functions in schema pnt to anon, authenticated;
set role anon;
select pnt.ok((public.public_numbers() ->> 'ready') = 'false', 'not ready when no refresh has happened');
reset role;
do $$
declare m0 date := (date_trunc('month', current_date) - interval '1 month')::date;
begin
  insert into public.site_stats_meta values (1, now(), true, 'x', m0 - 2);
  insert into public.site_stats_daily values
    (m0, 'total', 'all', 40, 100), (m0 + 1, 'total', 'all', 3, 4),
    (m0, 'country', 'US', 30, 90), (m0, 'country', 'CA', 5, 6), (m0, 'country', 'XX', 5, 5),
    (m0, 'page', '/cases/abc/', 5, 60), (m0 + 1, 'page', '/preview/pages/cases/abc/', 1, 5),
    (m0, 'page', '/news/', 2, 12), (m0, 'page', '/rare/', 1, 3), (m0, 'page', '/members/secret', 9, 99),
    (m0, 'referrer', 'evil.example', 9, 99),
    (m0, 'state', 'CO', 9, 40), (m0, 'state', 'NC', 1, 4);
  -- last month's data outside the month must not count
  insert into public.site_stats_daily values (m0 - 5, 'total', 'all', 1000, 1000);
end $$;
set role anon;
select pnt.ok((public.public_numbers() ->> 'ready') = 'true', 'ready once refreshed after month end');
select pnt.ok((public.public_numbers() ->> 'visits')::int = 43, 'visits are the month only');
select pnt.ok((public.public_numbers() ->> 'page_views')::int = 104, 'page views are the month only');
select pnt.ok((public.public_numbers() ->> 'countries') = 'under 10', 'countries exclude unknown and Tor');
select pnt.ok(public.public_numbers() #>> '{pages,0,path}' = '/cases/abc/', 'old preview paths are folded in');
select pnt.ok(public.public_numbers() #>> '{pages,0,views}' = '65', 'folded page views add up');
select pnt.ok(jsonb_array_length(public.public_numbers() -> 'pages') = 2, 'pages under 10 views are left out, members pages too');
select pnt.ok(not (public.public_numbers()::text like '%evil.example%'), 'referrers never appear');
select pnt.ok(not (public.public_numbers()::text like '%secret%'), 'members paths never appear');
select pnt.ok(public.public_numbers() #>> '{states,1,views}' = 'under 10', 'state counts under 10 read under 10');
select pnt.ok(public.public_numbers() -> 'members' = '"under 10"'::jsonb or (public.public_numbers() ->> 'members')::int >= 10, 'member count obeys the rule');
reset role;
update public.site_stats_meta set window_from = current_date;
set role anon;
select pnt.ok((public.public_numbers() ->> 'ready') = 'false', 'not ready when the refresh did not reach the month start');
select pnt.ok(not has_table_privilege('anon', 'public.site_stats_daily', 'select'), 'anon still cannot read the raw table');
reset role;
\echo ALL PUBLIC NUMBERS TESTS PASSED
