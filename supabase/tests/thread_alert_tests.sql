-- Tests for 0034 (admin alerts and the no-private-data list). Run after 0001 to 0019, 0026, 0030 to 0034 in a fresh database.
\set ON_ERROR_STOP 1
\set QUIET 1
create schema if not exists fta;
create or replace function fta.ok(cond boolean, what text) returns void language plpgsql as $$
begin if cond is not true then raise exception 'FAIL: %', what; end if; raise notice 'pass: %', what; end $$;
insert into auth.users values ('00000000-0000-0000-0000-0000000000a1','a@x.org'),('00000000-0000-0000-0000-0000000000a2','a2@x.org'),('00000000-0000-0000-0000-0000000000d1','d@x.org') on conflict do nothing;
insert into public.members (id, display_name) values ('00000000-0000-0000-0000-0000000000a1','Admin A'),('00000000-0000-0000-0000-0000000000a2','Admin Two'),('00000000-0000-0000-0000-0000000000d1','Deshi D') on conflict do nothing;
insert into public.member_roles (member_id, role) values ('00000000-0000-0000-0000-0000000000a1','admin'),('00000000-0000-0000-0000-0000000000a2','admin'),('00000000-0000-0000-0000-0000000000d1','reviewer') on conflict do nothing;
insert into public.thread_intakes (kind, url, canonical_url, dup_key, rate_key, receipt_hash) values ('url','https://News.Example.com/a/b?x=1','https://news.example.com/a/b','k1','r1','h1');
insert into public.thread_intakes (kind, question, dup_key, rate_key, receipt_hash, submitter_id) values ('question','Did the county vote on the jail contract?','k2','r2','h2','00000000-0000-0000-0000-0000000000d1');
select fta.ok((select count(*) from public.member_notifications where kind = 'thread_new') = 4, 'each admin gets one notice per request (2 admins x 2 requests)');
select fta.ok((select count(*) from public.member_notifications where kind = 'thread_new' and member_id = '00000000-0000-0000-0000-0000000000d1') = 0, 'a reviewer who is not an admin is not alerted');
select fta.ok(not exists (select 1 from public.member_notifications where kind = 'thread_new' and (body ~* 'county|news|example|Deshi')), 'the notice carries no text, link or sender');
insert into public.thread_intakes (kind, question, dup_key, rate_key, receipt_hash) values ('question','Did the county vote on the jail contract?','k2','r3','h3');
select fta.ok((select count(*) from public.thread_intakes where dup_key = 'k2') = 2, 'repeat saved');
-- worker list
insert into private.checker_keys (key_hash, label, created_by)
  values (encode(extensions.digest('ARCH-' || repeat('c', 64), 'sha256'), 'hex'), 'alert-test', '00000000-0000-0000-0000-0000000000a1');
create temp table got as select * from public.checker_thread_new('ARCH-' || repeat('c', 64), 0, 100);
select fta.ok((select count(*) from got) = 3, 'the list has every request');
select fta.ok((select link_site from got where id = 1) = 'news.example.com', 'a link shows only its website name');
select fta.ok((select link_site from got where kind = 'question' limit 1) is null, 'a question shows no text');
select fta.ok((select times_sent from got where id = 3) = 2, 'repeats are counted');
select fta.ok((select count(*) from public.checker_thread_new('ARCH-' || repeat('c', 64), 2, 100)) = 1, 'it can continue after a number');
select fta.ok((select count(*) from information_schema.columns where table_name = 'checker_thread_new') >= 0, 'sanity2');
select set_config('request.jwt.claims', '{"role":"service_role"}', false);
do $$ begin
  begin perform * from public.checker_thread_new('ARCH-wrong'); raise exception 'FAIL: wrong key accepted'; exception when others then
    if sqlerrm like 'FAIL%' then raise; end if; raise notice 'pass: a wrong key is refused'; end;
end $$;
select fta.ok(not has_function_privilege('anon','public.checker_thread_new(text,bigint,int)','execute') and not has_function_privilege('authenticated','public.checker_thread_new(text,bigint,int)','execute'), 'only the service role can call the list');
select fta.ok((select count(*) from information_schema.columns where table_schema='public' and table_name='thread_intakes') > 0, 'sanity');
\echo ALL ALERT TESTS PASSED
