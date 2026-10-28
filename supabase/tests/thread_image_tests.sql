-- Tests for 0035 (screenshot privacy). Run after 0001 to 0019, 0026, 0030 to 0035 in a fresh database with the Supabase stub.
\set ON_ERROR_STOP 1
\set QUIET 1
create schema if not exists itt;
grant usage on schema itt to anon, authenticated, service_role;
create or replace function itt.ok(cond boolean, what text) returns void language plpgsql as $$
begin if cond is not true then raise exception 'FAIL: %', what; end if; raise notice 'pass: %', what; end $$;
create or replace function itt.fails(stmt text, pattern text, what text) returns void language plpgsql as $$
begin
  begin execute stmt;
  exception when others then
    if sqlerrm ilike '%' || pattern || '%' then raise notice 'pass: %', what; return; end if;
    raise exception 'FAIL: % (wrong error: %)', what, sqlerrm;
  end;
  raise exception 'FAIL: % (statement succeeded)', what;
end $$;
grant execute on all functions in schema itt to anon, authenticated, service_role;
grant select on public.thread_intakes to service_role;
create table itt.keep (k text primary key, v text);
grant all on itt.keep to anon, authenticated, service_role;
insert into auth.users values ('00000000-0000-0000-0000-0000000000a1','a@x.org'),('00000000-0000-0000-0000-0000000000e1','e@x.org'),('00000000-0000-0000-0000-0000000000e2','e2@x.org') on conflict do nothing;
insert into public.members (id, display_name) values ('00000000-0000-0000-0000-0000000000a1','Admin A'),('00000000-0000-0000-0000-0000000000e1','Reviewer One'),('00000000-0000-0000-0000-0000000000e2','Reviewer Two') on conflict do nothing;
insert into public.member_roles (member_id, role) values ('00000000-0000-0000-0000-0000000000a1','admin'),('00000000-0000-0000-0000-0000000000e1','reviewer'),('00000000-0000-0000-0000-0000000000e2','reviewer') on conflict do nothing;
insert into private.checker_keys (key_hash, label, created_by) values (encode(extensions.digest('ARCH-' || repeat('d', 64), 'sha256'), 'hex'), 'img-test', '00000000-0000-0000-0000-0000000000a1');

begin;
set local role service_role;
-- 1 = text only (the default), 2 = kept for a reviewer
insert into itt.keep select 'r1', public.intake_thread('screenshot',null,null,'Text only picture check','00000000-0000-0000-0000-0000000000b1.png',2000,null,repeat('1',64))->>'receipt';
insert into itt.keep select 'r2', public.intake_thread('screenshot',null,null,'Kept picture check here','00000000-0000-0000-0000-0000000000b2.png',2000,null,repeat('2',64),'review')->>'receipt';
insert into itt.keep select 'r3', public.intake_thread('screenshot',null,null,'Strange mode becomes text only','00000000-0000-0000-0000-0000000000b3.png',2000,null,repeat('3',64),'whatever')->>'receipt';
commit;
select itt.ok((select image_mode from public.thread_intakes where id = 1) = 'text_only', 'the default is send only the text');
select itt.ok((select image_mode from public.thread_intakes where id = 2) = 'review', 'the sender can allow a kept picture');
select itt.ok((select image_mode from public.thread_intakes where id = 3) = 'text_only', 'any other value means text only');
select itt.ok((select image_delete_after from public.thread_intakes where id = 1) <= now() + interval '1 day 1 minute', 'a text-only picture is due within a day at the latest');
select itt.ok((select image_delete_after from public.thread_intakes where id = 2) > now() + interval '3 days', 'a kept picture is not due yet');
-- the reader finishes both
begin;
set local role anon;
select public.checker_thread_ocr_next('ARCH-' || repeat('d', 64));
select public.checker_thread_ocr_done('ARCH-' || repeat('d', 64), 1, 'Some conversation text that is long enough to count as readable text here', false);
select public.checker_thread_ocr_next('ARCH-' || repeat('d', 64));
select public.checker_thread_ocr_done('ARCH-' || repeat('d', 64), 2, 'Another conversation text that is long enough to count as readable text here', false);
select public.checker_thread_ocr_next('ARCH-' || repeat('d', 64));
select public.checker_thread_ocr_fail('ARCH-' || repeat('d', 64), 3, 'reader failed');
commit;
select itt.ok((select image_delete_after from public.thread_intakes where id = 1) <= now(), 'text-only: due as soon as the text is read');
select itt.ok((select image_delete_after from public.thread_intakes where id = 3) <= now(), 'text-only: due even when the reader failed');
select itt.ok((select image_delete_after from public.thread_intakes where id = 2) <= now() + interval '3 days 1 minute', 'kept: due 3 days after the text is read');
select itt.ok((select image_delete_after from public.thread_intakes where id = 2) > now() + interval '2 days', 'kept: not before then');
begin;
set local role anon;
select itt.fails($$select * from public.checker_thread_images_due('ARCH-nope')$$, 'Unknown checker key', 'the due list needs the key');
select itt.ok((select count(*) from public.checker_thread_images_due('ARCH-' || repeat('d', 64))) = 2, 'only the text-only pictures are due');
commit;
begin;
set local role service_role;
select itt.ok(public.checker_thread_image_due_ok('ARCH-' || repeat('d', 64), 1, '00000000-0000-0000-0000-0000000000b1.png'), 'the delete step may remove a due picture');
select itt.ok(not public.checker_thread_image_due_ok('ARCH-' || repeat('d', 64), 2, '00000000-0000-0000-0000-0000000000b2.png'), 'it may not remove a picture that is not due');
select itt.ok(not public.checker_thread_image_due_ok('ARCH-' || repeat('d', 64), 1, '00000000-0000-0000-0000-0000000000b2.png'), 'it may not remove a different file');
commit;
begin;
set local role anon;
select public.checker_thread_image_deleted('ARCH-' || repeat('d', 64), 1, '00000000-0000-0000-0000-0000000000b1.png');
select public.checker_thread_image_deleted('ARCH-' || repeat('d', 64), 2, '00000000-0000-0000-0000-0000000000b2.png');   -- not due: ignored
commit;
select itt.ok((select image_deleted_at is not null from public.thread_intakes where id = 1), 'a deleted picture is marked');
select itt.ok((select image_deleted_at is null from public.thread_intakes where id = 2), 'a picture that was not due is untouched');
-- drafts: nothing is visible or alerted until the sender sends
select itt.ok((select count(*) from public.thread_intakes where status = 'draft') = 3, 'a screenshot starts as a draft');
select itt.ok((select count(*) from public.member_notifications where kind = 'thread_new') = 0, 'a draft raises no alert');
select itt.ok((select draft_expires_at <= now() + interval '1 hour 1 minute' from public.thread_intakes where id = 1), 'a draft has an hour left once the text is read');
begin;
set local role anon;
select itt.ok((public.thread_status((select v from itt.keep where k='r1'))->>'code') = 'draft', 'the sender sees it is waiting for them');
select itt.ok((public.thread_status((select v from itt.keep where k='r1'))->>'draft_minutes_left')::int between 1 and 60, 'and how long is left');
select itt.fails($$select public.thread_confirm((select v from itt.keep where k='r3'))$$, 'Type or paste', 'a draft with no readable text cannot be sent');
select public.thread_correct_text((select v from itt.keep where k='r3'), 'I typed what the picture says myself');
select public.thread_confirm((select v from itt.keep where k='r1'));
select public.thread_confirm((select v from itt.keep where k='r2'));
select public.thread_confirm((select v from itt.keep where k='r3'));
select itt.ok((public.thread_confirm((select v from itt.keep where k='r3'))->>'status') = 'queued', 'sending twice does nothing more');
commit;
select itt.ok((select count(*) from public.thread_intakes where status = 'queued') = 3, 'sent drafts join the queue');
select itt.ok((select count(*) from public.member_notifications where kind = 'thread_new') = 3, 'and alert the admin once each');
-- an unsent draft and a discarded draft lose their text
begin;
set local role service_role;
insert into itt.keep select 'r4', public.intake_thread('screenshot',null,null,'Never sent picture here','00000000-0000-0000-0000-0000000000b4.png',2000,null,repeat('4',64))->>'receipt';
insert into itt.keep select 'r5', public.intake_thread('screenshot',null,null,'Discarded picture here','00000000-0000-0000-0000-0000000000b5.png',2000,null,repeat('5',64))->>'receipt';
commit;
begin;
set local role anon;
select public.checker_thread_ocr_next('ARCH-' || repeat('d', 64));
select public.checker_thread_ocr_done('ARCH-' || repeat('d', 64), 4, 'Private conversation text that nobody should keep if it is never sent on', false);
select public.checker_thread_ocr_next('ARCH-' || repeat('d', 64));
select public.checker_thread_ocr_done('ARCH-' || repeat('d', 64), 5, 'Another private conversation text that the sender decided to throw away now', false);
select public.thread_discard((select v from itt.keep where k='r5'));
select itt.ok((public.thread_status((select v from itt.keep where k='r5'))->>'ocr_text') is null and (public.thread_status((select v from itt.keep where k='r5'))->>'code') = 'discarded', 'a discarded draft loses its text at once');
select itt.fails($$select public.thread_discard((select v from itt.keep where k='r1'))$$, 'already sent', 'a sent request cannot be discarded here');
commit;
update public.thread_intakes set draft_expires_at = now() - interval '1 minute' where id = 4;
begin;
set local role anon;
select count(*) from public.checker_thread_images_due('ARCH-' || repeat('d', 64));   -- the worker pass also sweeps drafts
commit;
select itt.ok((select status = 'expired' and ocr_text is null and ocr_text_fixed is null and note is null from public.thread_intakes where id = 4), 'an unsent draft loses its text and note after the window');
select itt.ok((select status = 'discarded' and note is null and ocr_text is null from public.thread_intakes where id = 5), 'a discarded draft keeps neither');
select itt.ok((select image_delete_after <= now() from public.thread_intakes where id = 4), 'and its picture is due now');
begin;
set local role anon;
select itt.fails($$select public.thread_confirm((select v from itt.keep where k='r4'))$$, 'not sent in time', 'an expired draft cannot be sent');
commit;
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000e1"}', true);
set local role authenticated;
select itt.ok((select count(*) from public.list_thread_queue('all') where id in (4,5)) = 0, 'reviewers never see drafts, expired or discarded ones');
commit;
-- hide names of posters
begin;
set local role service_role;
insert into itt.keep select 'q1', public.intake_thread('question',null,'XyzBDA says Elon Musk bought the company with secret money',null,null,null,null,repeat('6',64),'text_only',true)->>'receipt';
insert into itt.keep select 'q2', public.intake_thread('question',null,'A second pasted post by AnotherAccount about the county budget',null,null,null,null,repeat('7',64),'text_only',true)->>'receipt';
insert into itt.keep select 'q3', public.intake_thread('question',null,'A plain question without hiding anything at all',null,null,null,null,repeat('8',64))->>'receipt';
commit;
select itt.ok((select count(*) from public.thread_intakes where kind = 'question' and status = 'draft' and hide_names) = 2, 'a pasted text with hide names is held as a draft');
select itt.ok((select status from public.thread_intakes where question like 'A plain question%') = 'queued', 'without the box a question goes straight to the queue as before');
select itt.ok((select count(*) from public.member_notifications where kind = 'thread_new') = 4, 'a draft question raises no alert (3 earlier + the plain question)');
begin;
set local role anon;
select itt.ok((public.thread_status((select v from itt.keep where k='q1'))->>'ocr_reading')::boolean, 'the sender is told it is being read');
select itt.fails($$select public.thread_confirm((select v from itt.keep where k='q1'))$$, 'still reading', 'it cannot be sent before the names are hidden');
select itt.fails($$select public.checker_thread_redact_next('ARCH-wrong')$$, 'Unknown checker key', 'the redact job needs the key');
insert into itt.keep select 'j1', public.checker_thread_redact_next('ARCH-' || repeat('d', 64))::text;
select itt.ok((select v::jsonb->>'text' from itt.keep where k='j1') like 'XyzBDA says%', 'the archiver is handed the text');
select public.checker_thread_redact_done('ARCH-' || repeat('d', 64), (select (v::jsonb->>'intake_id')::bigint from itt.keep where k='j1'),
  '[poster 1] says Elon Musk bought the company with secret money', null, true, null);
select itt.ok((public.thread_status((select v from itt.keep where k='q1'))->>'ocr_text') like '[poster 1] says Elon Musk%', 'the sender sees the redacted text, names inside the content stay');
select public.thread_correct_text((select v from itt.keep where k='q1'), '[poster 1] says Elon Musk bought the company with secret money, I think');
select itt.ok((public.thread_status((select v from itt.keep where k='q1'))->>'ocr_text') like '%I think', 'the sender can edit before sending');
insert into itt.keep select 'j2', public.checker_thread_redact_next('ARCH-' || repeat('d', 64))::text;
select public.checker_thread_redact_done('ARCH-' || repeat('d', 64), (select (v::jsonb->>'intake_id')::bigint from itt.keep where k='j2'),
  'A second pasted post by [handle] about the county budget', null, false, 'The model could not be used');
select itt.ok((public.thread_status((select v from itt.keep where k='q2'))->>'redact_note') like 'The model could not%', 'when the model could not finish, the sender is told');
select itt.fails($$select public.checker_thread_redact_done('ARCH-' || repeat('d', 64), 999999, 'text long enough here', null, true, null)$$, 'not being redacted', 'only a running job can be filled');
select public.thread_confirm((select v from itt.keep where k='q1'));
commit;
select itt.ok((select question not like '%XyzBDA%' from public.thread_intakes where id = (select (v::jsonb->>'intake_id')::bigint from itt.keep where k='j1')), 'the unredacted text is gone from the database');
select itt.ok((select count(*) from public.member_notifications where kind = 'thread_new') = 5, 'sending the redacted text alerts the admin');
select itt.ok((select status from public.thread_intakes where question like '[poster 1]%') in ('queued','matched'), 'and it joins the queue');
update public.thread_intakes set draft_expires_at = now() - interval '1 minute' where question like 'A second pasted post%';
begin;
set local role anon;
select count(*) from public.checker_thread_images_due('ARCH-' || repeat('d', 64));
commit;
select itt.ok((select question = 'Deleted: not sent in time' and note is null from public.thread_intakes where status = 'expired' and kind = 'question'), 'an unsent pasted text is wiped');
-- screenshot flagged hide names reaches the reader with the flag
begin;
set local role service_role;
select public.intake_thread('screenshot',null,null,'Hidden names picture here','00000000-0000-0000-0000-0000000000b9.png',2000,null,repeat('9',64),'text_only',true);
commit;
begin;
set local role anon;
select itt.ok((public.checker_thread_ocr_next('ARCH-' || repeat('d', 64))::jsonb->>'hide_names')::boolean, 'the reader is told to hide poster names');
commit;
-- reviewers
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000e1"}', true);
set local role authenticated;
select itt.ok(pg_get_function_result('public.list_thread_queue(text,int)'::regprocedure) !~ 'shot_path', 'the queue no longer returns a file name');
select itt.ok((select image_state from public.list_thread_queue() where id = 1) = 'deleted', 'queue says deleted');
select itt.ok((select image_state from public.list_thread_queue() where id = 2) = 'available', 'queue says a picture is available');
select itt.ok((select image_state from public.list_thread_queue() where id = 3) = 'text_only', 'queue says text only');
select itt.fails($$select public.thread_image_request(2, 'The text is garbled and needs the picture')$$, 'Pick this item first', 'not without picking it');
select public.pick_thread(2);
select public.pick_thread(3);
select itt.fails($$select public.thread_image_request(3, 'The text is garbled and needs the picture')$$, 'only the text', 'a text-only item has no picture to open');
select itt.fails($$select public.thread_image_request(2, 'short')$$, 'Say why', 'a reason is required');
select itt.ok(public.thread_image_request(2, 'The text is garbled and needs the picture') = '00000000-0000-0000-0000-0000000000b2.png', 'the picture is opened with a reason');
select itt.ok(private.thread_image_open('00000000-0000-0000-0000-0000000000b2.png'), 'the storage policy opens it for this reviewer for a while');
select itt.ok(not private.thread_image_open('00000000-0000-0000-0000-0000000000b1.png'), 'and not for a picture nobody asked for');
select itt.fails($$select * from public.thread_image_log()$$, 'admins only', 'reviewers cannot read the log');
commit;
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000e2"}', true);
set local role authenticated;
select itt.ok(not private.thread_image_open('00000000-0000-0000-0000-0000000000b2.png'), 'another reviewer cannot open it through the first reviewer''s request');
select itt.fails($$select public.thread_image_request(2, 'I also want to look at it please')$$, 'Pick this item first', 'only the reviewer who has it can ask');
commit;
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1"}', true);
set local role authenticated;
select itt.ok((select count(*) from public.thread_image_log(2)) = 1 and (select reason from public.thread_image_log(2)) like 'The text is garbled%', 'admins read the log');
commit;
select itt.ok((select image_delete_after > now() + interval '6 days' from public.thread_intakes where id = 2), 'a picture that was needed is kept longer');
do $$ begin
  begin update public.thread_image_views set reason = 'changed reason text here'; raise exception 'FAIL: log changed';
  exception when others then if sqlerrm like 'FAIL%' then raise; end if; raise notice 'pass: the log cannot be changed'; end;
end $$;
-- closing an item brings the delete time forward
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000e1"}', true);
set local role authenticated;
select public.resolve_thread(2, 'declined', 'Not something we can research further');
commit;
select itt.ok((select image_delete_after <= now() + interval '1 day 1 minute' from public.thread_intakes where id = 2), 'a closed item: picture gone within a day');
select 'ALL PICTURE PRIVACY TESTS PASSED' as result;
