-- Tests for 0031 (member notifications) and 0032 (Pull a Thread follow-ups). Run after 0001 to 0019, 0026, 0030, 0031, 0032
-- on a throwaway Postgres 16 with the Supabase stub, in a fresh database, AFTER or instead of pull_thread_tests.sql.
\set ON_ERROR_STOP 1
\set QUIET 1
create schema if not exists ftt;
grant usage on schema ftt to anon, authenticated, service_role;
create or replace function ftt.ok(cond boolean, what text) returns void language plpgsql as $$
begin if cond is not true then raise exception 'FAIL: %', what; end if; raise notice 'pass: %', what; end $$;
create or replace function ftt.fails(stmt text, pattern text, what text) returns void language plpgsql as $$
begin
  begin execute stmt;
  exception when others then
    if sqlerrm ilike '%' || pattern || '%' then raise notice 'pass: %', what; return; end if;
    raise exception 'FAIL: % (wrong error: %)', what, sqlerrm;
  end;
  raise exception 'FAIL: % (statement succeeded)', what;
end $$;
grant execute on all functions in schema ftt to anon, authenticated, service_role;
create table ftt.keep (k text primary key, v text);
grant all on ftt.keep to anon, authenticated, service_role;
grant select on public.thread_intakes, public.thread_followups to service_role;

insert into auth.users values ('00000000-0000-0000-0000-0000000000b1','b@x.org'),('00000000-0000-0000-0000-0000000000c1','c@x.org'),
  ('00000000-0000-0000-0000-0000000000e1','e@x.org') on conflict do nothing;
insert into public.members (id, display_name) values ('00000000-0000-0000-0000-0000000000b1','Member B'),('00000000-0000-0000-0000-0000000000c1','Member C'),
  ('00000000-0000-0000-0000-0000000000e1','Deshi E') on conflict do nothing;
insert into public.member_roles (member_id, role) values ('00000000-0000-0000-0000-0000000000e1','reviewer') on conflict do nothing;

------------------------------------------------------------------ notifications
select private.notify('00000000-0000-0000-0000-0000000000b1','welcome_note','First notice','Hello there','/members/',null,null);
select private.notify('00000000-0000-0000-0000-0000000000b1','thread_reply','Same source twice','Body','/members/','thread_intake','7');
select private.notify('00000000-0000-0000-0000-0000000000b1','thread_reply','Same source twice','Body','/members/','thread_intake','7');
select ftt.ok((select count(*) from public.member_notifications where member_id = '00000000-0000-0000-0000-0000000000b1') = 2, 'a repeat for the same source is ignored');
select private.notify('00000000-0000-0000-0000-0000000000f9','x_y_z','Nobody','x','/',null,null);
select ftt.ok((select count(*) from public.member_notifications) = 2, 'a notice for a non-member is dropped');
select ftt.fails($$select private.notify('00000000-0000-0000-0000-0000000000b1','bad kind!','t t t','b','/',null,null)$$, 'violates check', 'kind is checked');
select ftt.fails($$select private.notify('00000000-0000-0000-0000-0000000000b1','abc_def','<b>hi</b>','b','/',null,null)$$, 'violates check', 'markup in a title is refused');
select ftt.fails($$select private.notify('00000000-0000-0000-0000-0000000000b1','abc_def','Fine title','b','https://evil.example/',null,null)$$, 'violates check', 'links must stay on this site');
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b1"}', true);
set local role authenticated;
select ftt.ok((select count(*) from public.my_notifications()) = 2, 'a member reads their notices');
select ftt.ok(public.my_unread_count() = 2, 'unread count');
select ftt.fails($$select private.notify('00000000-0000-0000-0000-0000000000b1','abc_def','Self made','b','/',null,null)$$, 'permission denied', 'a member cannot write a notice');
select ftt.fails($$insert into public.member_notifications (member_id,kind,title) values ('00000000-0000-0000-0000-0000000000b1','abc','Self made')$$, 'permission denied', 'no direct inserts');
select ftt.fails($$update public.member_notifications set read_at = null$$, 'permission denied', 'no direct updates');
select ftt.ok(public.mark_notifications_read((select array_agg(id) from (select id from public.my_notifications() limit 1) x)) = 1, 'mark one read');
select ftt.ok(public.my_unread_count() = 1, 'one left unread');
select ftt.ok(public.mark_notifications_read() = 1, 'mark all read');
select ftt.ok(public.my_unread_count() = 0, 'nothing unread afterwards');
commit;
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c1"}', true);
set local role authenticated;
select ftt.ok((select count(*) from public.my_notifications()) = 0 and public.my_unread_count() = 0, 'another member sees none of them');
select ftt.ok((select count(*) from public.member_notifications) = 0, 'row security hides other members rows');
select ftt.ok(public.mark_notifications_read() = 0, 'cannot mark someone elses read');
commit;
begin;
set local role anon;
select ftt.fails($$select * from public.my_notifications()$$, 'permission denied', 'visitors have no notifications');
commit;
-- keeps only the newest 300
do $$ begin for i in 1..305 loop perform private.notify('00000000-0000-0000-0000-0000000000c1','bulk_note','Note ' || i,'b','/','bulk',i::text); end loop; end $$;
select ftt.ok((select count(*) from public.member_notifications where member_id = '00000000-0000-0000-0000-0000000000c1') = 300, 'each member keeps the newest 300');

------------------------------------------------------------------ follow-ups
begin;
set local role service_role;
insert into ftt.keep select 'r1', public.intake_thread('question',null,'Who decides how the county spends its road maintenance budget each year?',null,null,null,null,repeat('1',64))->>'receipt';
insert into ftt.keep select 'r2', public.intake_thread('question',null,'Which board approved the new school bus contract and when did it vote?',null,null,null,null,repeat('2',64))->>'receipt';
insert into ftt.keep select 'r3', public.intake_thread('question',null,'Is the state really short of poll workers for the November election?',null,null,null,null,repeat('3',64))->>'receipt';
commit;
begin;
set local role anon;
select ftt.fails($$select public.thread_follow_up((select v from ftt.keep where k='r1'), 'not an email')$$, 'full email', 'a bad address is refused');
select ftt.fails($$select public.thread_follow_up((select v from ftt.keep where k='r1'), null)$$, 'full email', 'a visitor must give an email');
select ftt.fails($$select public.thread_follow_up((select v from ftt.keep where k='r1'), E'a@b.org\r\nBcc: x@y.org')$$, 'full email', 'header injection refused');
select ftt.fails($$select public.thread_follow_up('nope','a@b.org')$$, 'Unknown receipt', 'unknown receipt refused');
select ftt.ok(public.thread_follow_up((select v from ftt.keep where k='r1'), 'Reader@Example.org') = 'email', 'a visitor leaves an email');
select ftt.fails($$select public.thread_follow_up((select v from ftt.keep where k='r1'), 'other@example.org')$$, 'already set', 'only one follow-up per item');
select ftt.fails($$select count(*) from public.thread_followups$$, 'permission denied', 'nobody reads the addresses from the browser');
commit;
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b1"}', true);
set local role authenticated;
select ftt.ok(public.thread_follow_up((select v from ftt.keep where k='r2'), null) = 'member', 'a member presses Notify me, no email needed');
select ftt.ok(public.thread_follow_up((select v from ftt.keep where k='r2'), null) = 'member', 'pressing it twice is harmless');
commit;
begin;
set local role service_role;
select ftt.ok((select email from public.thread_followups where email is not null) = 'reader@example.org', 'email is stored lowercase');
select ftt.ok((select count(*) from public.mail_due_thread_followups()) = 0, 'nothing is due before there is an answer');
commit;
-- a reviewer closes both items with a note for the sender
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000e1"}', true);
set local role authenticated;
select public.pick_thread((select id from public.list_thread_queue() where question like 'Which board%'));
select public.resolve_thread((select id from public.list_thread_queue() where question like 'Which board%'), 'accepted', 'Worth a finding', 'We will look at the bus contract vote.');
select public.pick_thread((select id from public.list_thread_queue() where question like 'Who decides%'));
select public.resolve_thread((select id from public.list_thread_queue() where question like 'Who decides%'), 'needs_evidence', 'Nothing to check yet', 'Send us the budget page you saw.');
commit;
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b1"}', true);
set local role authenticated;
select ftt.ok((select count(*) from public.my_notifications() where kind = 'thread_reply' and title = 'Your thread has an update' and body like 'Your thread was accepted%' and link like '/members/pull-a-thread.html?thread=%') = 1, 'the member who pressed Notify me is told, with a link to that thread');
select ftt.ok((select body from public.my_notifications() where title = 'Your thread has an update') like '%bus contract%', 'the notice carries the note for the sender');
select ftt.ok(public.my_thread_status((select (regexp_match(link, 'thread=([0-9]+)'))[1]::bigint from public.my_notifications() limit 1))->>'code' = 'accepted', 'the member can open that thread from the notification');
select ftt.ok(not exists (select 1 from public.my_notifications() where body like '%Worth a finding%'), 'the reviewers private reason never reaches the sender');
commit;
begin;
set local role service_role;
select ftt.ok((select count(*) from public.mail_due_thread_followups()) = 1, 'the visitor reply is due once the item is closed');
select ftt.ok((select headline from public.mail_due_thread_followups()) = 'Your thread needs more evidence', 'headline matches the outcome');
select ftt.ok((select body from public.mail_due_thread_followups()) like '%budget page%', 'email body is the public note');
select public.mail_thread_followup_result((select followup_id from public.mail_due_thread_followups()), true);
select ftt.ok((select email is null and mail_state = 'sent' from public.thread_followups where intake_id = (select id from public.thread_intakes where question like 'Who decides%')), 'the address is erased after the reply');
select ftt.ok((select count(*) from public.mail_due_thread_followups()) = 0, 'nothing more is due');
commit;
-- unsent addresses expire
insert into public.thread_followups (intake_id, email, mail_state, created_at)
  select id, 'old@example.org', 'waiting', now() - interval '31 days' from public.thread_intakes where question like 'Is the state really short%';
begin;
set local role service_role;
select ftt.ok(public.mail_expire_thread_followups() = 1, 'an address unsent after 30 days is erased');
select ftt.ok(not exists (select 1 from public.thread_followups where email is not null), 'no address is kept');
commit;
begin;
set local role authenticated;
select ftt.fails($$select public.mail_due_thread_followups()$$, 'permission denied', 'only the mail step can read what is due');
commit;

select 'ALL FOLLOW-UP TESTS PASSED' as result;
