-- Tests for 0037 (preliminary answers). Run after 0001 to 0019, 0026, 0030 to 0037 in a fresh database with the Supabase stub.
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
insert into private.checker_keys (key_hash, label, created_by) values (encode(extensions.digest(current_setting('test.kp') || repeat('e', 64), 'sha256'), 'hex'), 'prelim-test', '00000000-0000-0000-0000-0000000000a1');
insert into public.thread_match_index (kind, ref, title, blurb, path, urls) values
  ('case','iran-contra','Iran-Contra secret arms sales to Iran and funding for the contras','Secret arms sales to Iran defied congressional limits on funding for the contras.','/preview/pages/cases/iran-contra.html','{}'),
  ('case','church-committee','Church Committee hearings on intelligence abuses by the arms of government','The Senate studied intelligence agency abuses and contra style secret funding in the 1970s.','/preview/pages/cases/church-committee.html','{}');

begin;
set local role service_role;
insert into ptp.keep select 'm', public.intake_thread('question',null,'Did the secret arms sales to Iran fund the contras against congressional limits?',null,null,null,null,repeat('1',64))->>'receipt';
insert into ptp.keep select 'u', public.intake_thread('question',null,'Is the new library hours schedule posted anywhere for the weekend?',null,null,null,null,repeat('2',64))->>'receipt';
commit;
select ptp.ok((select status from public.thread_intakes where question like 'Did the secret arms%') = 'matched', 'a question we already have records for is matched');
select ptp.ok((select prelim_status from public.thread_intakes where question like 'Did the secret arms%') = 'pending', 'every sent request waits for its preliminary answer');
begin;
set local role anon;
select ptp.fails($$select public.checker_thread_prelim_next('wrong-key')$$, 'Unknown checker key', 'the answer job needs the key');
insert into ptp.keep select 'job', public.checker_thread_prelim_next(current_setting('test.kp') || repeat('e', 64))::text;
commit;
select ptp.ok((select v::jsonb->>'text' from ptp.keep where k='job') like 'Did the secret arms%', 'the archiver gets the text');
select ptp.ok(jsonb_array_length((select v::jsonb->'candidates' from ptp.keep where k='job')) >= 1 and (select v from ptp.keep where k='job') not like '%"path"%', 'and our own records, without links for it to copy');
select ptp.ok((select v::jsonb->'candidates'->0->>'blurb' from ptp.keep where k='job') like 'Secret arms sales%', 'the description comes from our table');
select ptp.ok((select prelim_status from public.thread_intakes where question like 'Is the new library%') = 'done', 'with nothing to compare, the answer is made at once: not enough evidence');
select ptp.ok(not (select (prelim->>'enough')::boolean from public.thread_intakes where question like 'Is the new library%'), 'and it says there is not enough');
-- the model answers: one real record, one invented, one weird word
begin;
set local role anon;
select public.checker_thread_prelim_done(current_setting('test.kp') || repeat('e', 64), (select (v::jsonb->>'intake_id')::bigint from ptp.keep where k='job'),
  '[{"kind":"case","ref":"iran-contra","relation":"supports","title":"INVENTED TITLE"},{"kind":"case","ref":"made-up","relation":"supports"}]'::jsonb);
select ptp.fails($$select public.checker_thread_prelim_done(current_setting('test.kp') || repeat('e', 64), 1, '[]'::jsonb)$$, 'not being made', 'a finished answer cannot be filled twice');
select ptp.fails($$select public.checker_thread_prelim_done(current_setting('test.kp') || repeat('e', 64), 99999, '[]'::jsonb)$$, 'not being made', 'an unknown item cannot be filled');
select ptp.ok((public.thread_status((select v from ptp.keep where k='m'))->'prelim'->>'label') = 'Preliminary, AI-generated', 'the sender sees the label');
select ptp.ok((public.thread_status((select v from ptp.keep where k='m'))->'prelim'->'supports'->0->>'title') like 'Iran-Contra secret arms%', 'the title is our own, not the one the model sent');
select ptp.ok((public.thread_status((select v from ptp.keep where k='m'))->'prelim'->'supports'->0->>'blurb') like 'Secret arms sales%', 'the description is our own text');
select ptp.ok(jsonb_array_length(public.thread_status((select v from ptp.keep where k='m'))->'prelim'->'supports') = 1, 'an invented record is ignored');
select ptp.ok((public.thread_status((select v from ptp.keep where k='m'))->'prelim'->>'enough')::boolean, 'a supporting record means there is enough to say something');
select ptp.ok(not (public.thread_status((select v from ptp.keep where k='u'))->'prelim'->>'enough')::boolean and public.thread_status((select v from ptp.keep where k='u'))->'prelim'->>'label' = 'Preliminary, AI-generated', 'not enough evidence is a valid answer');
select ptp.ok(not (public.thread_status((select v from ptp.keep where k='m'))->>'prelim_reading')::boolean, 'no longer waiting');
commit;
-- reviewers: the queue holds every request, answers can be checked and corrected
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000e1"}', true);
set local role authenticated;
select ptp.ok((select count(*) from public.list_thread_queue()) = 2, 'matched requests are in the queue too');
select ptp.ok((select prelim->'supports'->0->>'ref' from public.list_thread_queue() where status = 'matched') = 'iran-contra', 'reviewers see the answer');
select ptp.fails($$select public.thread_prelim_correct((select id from public.list_thread_queue() where status = 'matched'), 'case', 'iran-contra', 'related', 'It only relates')$$, 'Pick this item first', 'not without picking it');
select public.pick_thread((select id from public.list_thread_queue() where status = 'matched'));
select ptp.fails($$select public.thread_prelim_correct((select id from public.list_thread_queue() where status = 'in_review'), 'case', 'iran-contra', 'related', 'no')$$, 'Say why', 'a reason is needed');
select ptp.fails($$select public.thread_prelim_correct((select id from public.list_thread_queue() where status = 'in_review'), 'case', 'nothing-here', 'related', 'Not in the answer')$$, 'not in the answer', 'only records in the answer can be moved');
select public.thread_prelim_correct((select id from public.list_thread_queue() where status = 'in_review'), 'case', 'iran-contra', 'related', 'It only relates, it does not settle it');
select ptp.ok((select jsonb_array_length(prelim->'supports') = 0 and jsonb_array_length(prelim->'related') = 2 and not (prelim->>'enough')::boolean and (prelim->>'checked')::boolean from public.list_thread_queue() where status = 'in_review'), 'the record moved, enough is recalculated and the answer is marked checked');
select public.thread_prelim_correct((select id from public.list_thread_queue() where status = 'in_review'), 'case', 'iran-contra', 'contradicts', 'On reading it, it contradicts the claim');
select public.thread_prelim_correct((select id from public.list_thread_queue() where status = 'in_review'), null, null, 'keep', 'I read it and it stands as it is');
select ptp.fails($$select * from public.thread_prelim_log()$$, 'admins only', 'reviewers cannot read the log');
commit;
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000e2"}', true);
set local role authenticated;
select ptp.fails($$select public.thread_prelim_correct((select id from public.list_thread_queue() where status = 'in_review'), 'case', 'iran-contra', 'remove', 'I want to remove it')$$, 'Pick this item first', 'only the reviewer who has it can change it');
commit;
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1"}', true);
set local role authenticated;
select ptp.ok((select count(*) from public.thread_prelim_log()) = 3, 'admins read the log of changes');
commit;
select ptp.ok((public.thread_status((select v from ptp.keep where k='m'))->'prelim'->>'label') = 'Checked by a reviewer. First made by AI.', 'once checked, the label says so');
do $$ begin
  begin update public.thread_prelim_edits set reason = 'changed reason'; raise exception 'FAIL: log changed';
  exception when others then if sqlerrm like 'FAIL%' then raise; end if; raise notice 'pass: the log cannot be changed'; end;
end $$;
-- drafts wait until they are sent
begin;
set local role service_role;
insert into ptp.keep select 's', public.intake_thread('screenshot',null,null,'A screenshot that waits to be sent','00000000-0000-0000-0000-0000000000c1.png',2000,null,repeat('3',64))->>'receipt';
commit;
select ptp.ok((select prelim_status from public.thread_intakes where note like 'A screenshot that waits%') = 'none', 'a draft has no answer yet');
update public.thread_intakes set ocr_status = 'done', ocr_text = 'Some readable text about the arms sales to Iran and the contras funding limits' where note like 'A screenshot that waits%';
begin;
set local role anon;
select public.thread_confirm((select v from ptp.keep where k='s'));
commit;
select ptp.ok((select prelim_status from public.thread_intakes where note like 'A screenshot that waits%') = 'pending', 'once sent, it waits for its answer');
select 'ALL PRELIMINARY ANSWER TESTS PASSED' as result;
