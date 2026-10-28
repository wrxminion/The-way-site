-- Tests for 0039 (web leads). Run after 0001 to 0019, 0026, 0030 to 0037 and 0039 in a fresh database with the Supabase stub.
\set ON_ERROR_STOP 1
\set QUIET 1
select set_config('test.kp', substring(pg_get_functiondef('private.checker_key_id(text)'::regprocedure) from '\^([A-Z]+-)'), false);   -- the key prefix the database expects, read from the database
create schema if not exists ptp;
grant usage on schema ptp to anon, authenticated, service_role;
create or replace function ptp.ok(cond boolean, what text) returns void language plpgsql as $$
begin if cond is not true then raise exception 'FAIL: %', what; end if; raise notice 'pass: %', what; end $$;
create or replace function ptp.fails(stmt text, pattern text, what text) returns void language plpgsql as $$
begin
  begin execute stmt;
  exception when others then
    if sqlerrm ilike '%' || pattern || '%' then raise notice 'pass: %', what; return; end if;
    raise exception 'FAIL: % (wrong error: %)', what, sqlerrm;
  end;
  raise exception 'FAIL: % (statement succeeded)', what;
end $$;
grant execute on all functions in schema ptp to anon, authenticated, service_role;
create table ptp.keep (k text primary key, v text);
grant all on ptp.keep to anon, authenticated, service_role;
grant select on public.thread_intakes to service_role;
insert into auth.users values ('00000000-0000-0000-0000-0000000000a1','a@x.org'),('00000000-0000-0000-0000-0000000000e1','e@x.org'),('00000000-0000-0000-0000-0000000000e2','e2@x.org') on conflict do nothing;
insert into public.members (id, display_name) values ('00000000-0000-0000-0000-0000000000a1','Admin A'),('00000000-0000-0000-0000-0000000000e1','Reviewer One'),('00000000-0000-0000-0000-0000000000e2','Reviewer Two') on conflict do nothing;
insert into public.member_roles (member_id, role) values ('00000000-0000-0000-0000-0000000000a1','admin'),('00000000-0000-0000-0000-0000000000e1','reviewer'),('00000000-0000-0000-0000-0000000000e2','reviewer') on conflict do nothing;
insert into private.checker_keys (key_hash, label, created_by) values (encode(extensions.digest(current_setting('test.kp') || repeat('e', 64), 'sha256'), 'hex'), 'leads-test', '00000000-0000-0000-0000-0000000000a1');
insert into public.thread_match_index (kind, ref, title, blurb, path, urls) values
  ('case','iran-contra','Iran-Contra secret arms sales to Iran and funding for the contras','Secret arms sales to Iran defied congressional limits on funding for the contras.','/preview/pages/cases/iran-contra.html','{}'),
  ('case','church-committee','Church Committee hearings on intelligence abuses by the arms of government','The Senate studied intelligence agency abuses and contra style secret funding in the 1970s.','/preview/pages/cases/church-committee.html','{}');

begin;
set local role service_role;
insert into ptp.keep select 'm', public.intake_thread('question',null,'Did the secret arms sales to Iran fund the contras against congressional limits?',null,null,null,null,repeat('1',64))->>'receipt';
commit;
select ptp.ok((select leads_status from public.thread_intakes limit 1) = 'pending', 'a sent request waits for its web leads');
begin;
set local role anon;
select ptp.fails($$select public.checker_thread_leads_next('wrong-key')$$, 'Unknown checker key', 'the leads job needs the key');
insert into ptp.keep select 'job', public.checker_thread_leads_next(current_setting('test.kp') || repeat('e', 64))::text;
commit;
select ptp.ok((select v::jsonb->>'text' from ptp.keep where k='job') like 'Did the secret arms%' and (select v from ptp.keep where k='job') not like '%receipt%' and (select v from ptp.keep where k='job') not like '%note%', 'the computer gets the text only: no note, no receipt');
begin;
set local role anon;
select ptp.ok(public.checker_thread_leads_done(current_setting('test.kp') || repeat('e', 64), (select (v::jsonb->>'intake_id')::bigint from ptp.keep where k='job'),
  ('[{"url":"https://www.archives.gov/research/iran-contra","title":"Iran-Contra records","excerpt":"Records of the affair.","archive_sha":"'||repeat('a',64)||'"},
    {"url":"http://insecure.example.org/a","title":"plain http","excerpt":"x"},
    {"url":"https://localhost/admin","title":"local","excerpt":"x"},
    {"url":"https://10.0.0.5/x","title":"private address","excerpt":"x"},
    {"url":"https://example.org/b","title":"no excerpt","excerpt":""},
    {"url":"https://example.org/c","title":"Second","excerpt":"Another page."}]')::jsonb) = 2, 'only well-formed https leads on real hosts are kept');
select ptp.fails($$select public.checker_thread_leads_done(current_setting('test.kp') || repeat('e', 64), 1, '[]'::jsonb)$$, 'not being made', 'a finished item cannot be filled twice');
set local role service_role;
select ptp.ok(jsonb_array_length(public.thread_leads((select v from ptp.keep where k='m'))->'leads') = 2 and public.thread_leads((select v from ptp.keep where k='m'))->>'status' = 'done', 'the sender sees both leads through the code');
select ptp.ok((select bool_and(not (x->>'checked')::boolean) from jsonb_array_elements(public.thread_leads((select v from ptp.keep where k='m'))->'leads') x), 'and they are marked as not checked');
select ptp.ok(public.thread_leads('not-a-code') is null, 'a wrong code shows nothing');
commit;
begin;
set local role anon;
select ptp.fails($$select count(*) from public.thread_leads$$, 'permission denied', 'the table is not readable by visitors');
select ptp.fails($$select public.thread_leads_for_review(1)$$, 'permission denied', 'visitors cannot list leads for review');
commit;
-- reviewers
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000e1"}', true);
set local role authenticated;
select ptp.fails($$select public.thread_lead_review((select id from public.thread_leads order by id limit 1), 'verified', 'Checked it by hand')$$, 'permission denied', 'reviewers use the function, not the table');
select public.pick_thread((select id from public.list_thread_queue() limit 1));
select ptp.ok(jsonb_array_length(public.thread_leads_for_review((select id from public.list_thread_queue() limit 1))->'leads') = 2, 'reviewers see the leads');
select ptp.fails($$select public.thread_lead_review(999999, 'verified', 'Checked it by hand')$$, 'No such lead', 'an unknown lead is refused');
select ptp.fails($$select public.thread_lead_review((public.thread_leads_for_review((select id from public.list_thread_queue() limit 1))->'leads'->0->>'id')::bigint, 'verified', 'no')$$, 'Say why', 'a reason is needed');
select ptp.fails($$select public.thread_lead_review((public.thread_leads_for_review((select id from public.list_thread_queue() limit 1))->'leads'->0->>'id')::bigint, 'maybe', 'Not sure about it')$$, 'verified or rejected', 'only two verdicts');
select public.thread_lead_review((public.thread_leads_for_review((select id from public.list_thread_queue() limit 1))->'leads'->0->>'id')::bigint, 'verified', 'The page says what the lead claims');
select public.thread_lead_review((public.thread_leads_for_review((select id from public.list_thread_queue() limit 1))->'leads'->1->>'id')::bigint, 'rejected', 'Page is unrelated to the claim');
commit;
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000e2"}', true);
set local role authenticated;
select ptp.fails($$select public.thread_lead_review((public.thread_leads_for_review((select id from public.list_thread_queue() limit 1))->'leads'->0->>'id')::bigint, 'rejected', 'Someone else picked it')$$, 'Pick this item first', 'only the reviewer who picked the item can decide');
commit;
begin;
set local role service_role;
select ptp.ok(jsonb_array_length(public.thread_leads((select v from ptp.keep where k='m'))->'leads') = 1 and (public.thread_leads((select v from ptp.keep where k='m'))->'leads'->0->>'checked')::boolean, 'the sender now sees only the verified lead, marked checked; the rejected one is gone');
commit;
select ptp.ok((select count(*) from public.thread_lead_reviews) = 2, 'every verdict is logged');
select ptp.fails($$update public.thread_lead_reviews set reason = 'changed it later'$$, 'append', 'the log cannot be edited');
select 'ALL WEB LEAD TESTS PASSED' as result;
