-- Tests for 0033 (screenshot text). Run after 0001 to 0019, 0026, 0030 to 0033 on a fresh throwaway Postgres 16 with the Supabase stub.
\set ON_ERROR_STOP 1
\set QUIET 1
select set_config('test.kp', substring(pg_get_functiondef('private.checker_key_id(text)'::regprocedure) from '\^([A-Z]+-)'), false);   -- the key prefix the database expects, read from the database
create schema if not exists ott;
grant usage on schema ott to anon, authenticated, service_role;
create or replace function ott.ok(cond boolean, what text) returns void language plpgsql as $$
begin if cond is not true then raise exception 'FAIL: %', what; end if; raise notice 'pass: %', what; end $$;
create or replace function ott.fails(stmt text, pattern text, what text) returns void language plpgsql as $$
begin
  begin execute stmt;
  exception when others then
    if sqlerrm ilike '%' || pattern || '%' then raise notice 'pass: %', what; return; end if;
    raise exception 'FAIL: % (wrong error: %)', what, sqlerrm;
  end;
  raise exception 'FAIL: % (statement succeeded)', what;
end $$;
grant execute on all functions in schema ott to anon, authenticated, service_role;
create table ott.keep (k text primary key, v text);
grant all on ott.keep to anon, authenticated, service_role;
grant select on public.thread_intakes to service_role;

insert into auth.users values ('00000000-0000-0000-0000-0000000000a1','a@x.org'),('00000000-0000-0000-0000-0000000000e1','e@x.org') on conflict do nothing;
insert into public.members (id, display_name) values ('00000000-0000-0000-0000-0000000000a1','Admin A'),('00000000-0000-0000-0000-0000000000e1','Deshi E') on conflict do nothing;
insert into public.member_roles (member_id, role) values ('00000000-0000-0000-0000-0000000000a1','admin'),('00000000-0000-0000-0000-0000000000e1','reviewer') on conflict do nothing;
insert into private.checker_keys (key_hash, label, created_by) values (encode(extensions.digest(current_setting('test.kp') || repeat('c', 64), 'sha256'), 'hex'), 'ocr-test', '00000000-0000-0000-0000-0000000000a1');
-- a case the screenshot text can match
insert into public.thread_match_index (kind, ref, title, blurb, path, urls)
  values ('case','iran-contra','Iran-Contra secret arms sales to Iran and funding for the contras','Secret arms sales defied congressional limits on contra funding','/preview/pages/cases/iran-contra.html','{}');

begin;
set local role service_role;
insert into ott.keep select 'r', public.intake_thread('screenshot',null,null,'Is what this chat says about the arms sales true?','00000000-0000-0000-0000-0000000000aa.png',2000,null,repeat('1',64))->>'receipt';
select public.intake_thread('screenshot',null,null,'Second picture to read','00000000-0000-0000-0000-0000000000ab.jpg',2000,null,repeat('2',64));
commit;
begin;
set local role anon;
select ott.ok((public.thread_status((select v from ott.keep where k='r'))->>'ocr_reading')::boolean = true, 'a new screenshot is waiting to be read');
select ott.fails($$select public.thread_correct_text((select v from ott.keep where k='r'), 'I typed this myself before it was read')$$, 'still reading', 'the sender cannot correct before the reader finishes');
select ott.fails($$select public.checker_thread_ocr_next('wrong-key')$$, 'Unknown checker key', 'wrong key refused');
insert into ott.keep select 'job', public.checker_thread_ocr_next(current_setting('test.kp') || repeat('c', 64))::text;
select ott.ok((select v::jsonb->>'shot_path' from ott.keep where k='job') = '00000000-0000-0000-0000-0000000000aa.png', 'the reader is handed the oldest screenshot');
set local role service_role;
select ott.ok(public.checker_thread_ocr_ok(current_setting('test.kp') || repeat('c', 64), (select (v::jsonb->>'intake_id')::bigint from ott.keep where k='job'), '00000000-0000-0000-0000-0000000000aa.png'), 'the image server may serve the running job');
set local role anon;
set local role service_role;
select ott.ok(not public.checker_thread_ocr_ok(current_setting('test.kp') || repeat('c', 64), (select (v::jsonb->>'intake_id')::bigint from ott.keep where k='job'), '00000000-0000-0000-0000-0000000000ab.jpg'), 'it will not serve a different file for that job');
set local role anon;
set local role service_role;
select ott.ok(not public.checker_thread_ocr_ok(current_setting('test.kp') || repeat('c', 64), 999999, '00000000-0000-0000-0000-0000000000aa.png'), 'it will not serve a job that is not running');
set local role anon;
set local role service_role;
select ott.fails($$select public.checker_thread_ocr_ok('wrong-key', 1, 'x')$$, 'Unknown checker key', 'the image server check needs the key');
set local role anon;
select public.checker_thread_ocr_done(current_setting('test.kp') || repeat('c', 64), (select (v::jsonb->>'intake_id')::bigint from ott.keep where k='job'),
  E'Iran <b>arms</b> sales were secret\n\n\n\nThey funded the contras in defiance of Congress and the arms sales to Iran continued', true);
select ott.ok((public.thread_status((select v from ott.keep where k='r'))->>'ocr_reading')::boolean = false, 'reading is finished');
select ott.ok((public.thread_status((select v from ott.keep where k='r'))->>'ocr_text') like 'Iran arms sales were secret%' and (public.thread_status((select v from ott.keep where k='r'))->>'ocr_text') not like '%<%', 'the sender sees the text, with markup removed');
select ott.ok(jsonb_array_length(public.thread_status((select v from ott.keep where k='r'))->'matches') >= 1, 'the text found a case we already have');
select ott.fails($$select public.checker_thread_ocr_done(current_setting('test.kp') || repeat('c', 64), (select (v::jsonb->>'intake_id')::bigint from ott.keep where k='job'), 'again', false)$$, 'not being read', 'a finished screenshot cannot be filled twice');
-- the sender fixes it
select public.thread_correct_text((select v from ott.keep where k='r'), 'Iran arms sales were secret. The contras were funded against the law.');
select ott.ok((public.thread_status((select v from ott.keep where k='r'))->>'ocr_text') like '%against the law%' and (public.thread_status((select v from ott.keep where k='r'))->>'ocr_fixed')::boolean, 'the sender text replaces the read text');
select ott.fails($$select public.thread_correct_text((select v from ott.keep where k='r'), 'ab')$$, 'Type what', 'too short refused');
select ott.fails($$select public.thread_correct_text('nope', 'some text here')$$, 'Unknown receipt', 'unknown receipt refused');
select public.thread_correct_text((select v from ott.keep where k='r'), '<script>x</script> clean text about the arms sales 1');
select public.thread_correct_text((select v from ott.keep where k='r'), 'clean text about the arms sales 2');
select public.thread_correct_text((select v from ott.keep where k='r'), 'clean text about the arms sales 3');
select public.thread_correct_text((select v from ott.keep where k='r'), 'clean text about the arms sales 4');
select ott.fails($$select public.thread_correct_text((select v from ott.keep where k='r'), 'clean text about the arms sales 5')$$, 'enough corrections', 'corrections are capped at 5');
select public.thread_confirm((select v from ott.keep where k='r'));
-- second job: reading fails, a person must read it
insert into ott.keep select 'job2', public.checker_thread_ocr_next(current_setting('test.kp') || repeat('c', 64))::text;
select public.checker_thread_ocr_fail(current_setting('test.kp') || repeat('c', 64), (select (v::jsonb->>'intake_id')::bigint from ott.keep where k='job2'), 'No reader installed on the archiver');
commit;
begin;
set local role service_role;
select ott.ok((select ocr_status from public.thread_intakes where note like 'Second picture%') = 'failed', 'a failed read is recorded');
commit;
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000e1"}', true);
set local role authenticated;
select ott.ok((select count(*) from public.list_thread_queue() where ocr_text like '%against the law%' or ocr_text like '%clean text%') = 1, 'reviewers see the sender corrected text');
select ott.ok((select ocr_fixed from public.list_thread_queue() where note like 'Is what this chat%'), 'and are told it was corrected');
select ott.ok((select parts::text like '%Text could be read%' and parts::text like '%checked against sources%' from public.list_thread_queue() where note like 'Is what this chat%'), 'the score has credit for readable, checkable text');
select ott.ok((select count(*) from public.list_thread_queue() where note like 'Second picture%') = 0, 'an unsent draft is not in the reviewers queue');
select ott.ok(pg_get_function_result('public.list_thread_queue(text,int)'::regprocedure) !~ 'submitter|rate_key', 'the queue still returns no identity');
commit;

select 'ALL SCREENSHOT TEXT TESTS PASSED' as result;
