-- Tests for 0045 (save to notes). Run after 0001 to 0019, 0025, 0026, 0030 to 0045 with the Supabase stub.
\set ON_ERROR_STOP 1
\set QUIET 1
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
insert into auth.users values ('00000000-0000-0000-0000-0000000000b1','m1@x.org'),('00000000-0000-0000-0000-0000000000b2','m2@x.org'),('00000000-0000-0000-0000-0000000000b3','r@x.org') on conflict do nothing;
insert into public.members (id, display_name) values ('00000000-0000-0000-0000-0000000000b1','Member One'),('00000000-0000-0000-0000-0000000000b2','Member Two'),('00000000-0000-0000-0000-0000000000b3','Reviewer R') on conflict do nothing;
insert into public.member_roles (member_id, role) values ('00000000-0000-0000-0000-0000000000b3','reviewer') on conflict do nothing;

begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}', true);
insert into public.private_research (owner_id, title, body, origin, sources, verified, ballot_state, ballot_key, print_mode)
  values ('00000000-0000-0000-0000-0000000000b1', 'Candidate X in scandal', 'details', 'ai_answer', '[{"url":"https://example.org/a","title":"A","checked":false}]', false, 'CO', 'race:governor', 'full');
select ptp.ok((select count(*) from public.private_research) = 1, 'owner saves a note with source, flag and ballot place');
select ptp.fails($$insert into public.private_research (owner_id, title, sources) values ('00000000-0000-0000-0000-0000000000b1','x','[{"url":"javascript:alert(1)"}]')$$, 'https link', 'non-https source refused');
select ptp.fails($$insert into public.private_research (owner_id, title, ballot_key) values ('00000000-0000-0000-0000-0000000000b1','x','../bad')$$, 'check', 'bad ballot key refused');
select ptp.fails($$insert into public.private_research (owner_id, title, print_mode) values ('00000000-0000-0000-0000-0000000000b1','x','all')$$, 'check', 'bad print mode refused');
select public.submit_source_check('https://example.org/a', 'A', 'confirmed', 'Read it, it backs the claim');
select ptp.fails($$select public.submit_source_check('https://example.org/b','B','confirmed','no')$$, 'Say what you checked', 'a check needs a reason');
select ptp.fails($$select public.submit_source_check('http://example.org/b','B','confirmed','long enough reason')$$, 'check', 'a check needs an https link');
select ptp.fails($$select * from public.source_checks$$, 'permission denied', 'members cannot read the checks table');
select ptp.fails($$select public.source_checks_for_review()$$, 'reviewers only', 'a plain member cannot read the review list');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b2","role":"authenticated"}', true);
select ptp.ok((select count(*) from public.private_research) = 0, 'another member cannot read the note');
select public.submit_source_check('https://example.org/a', 'A', 'not_confirmed', 'The page does not say that');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b3","role":"authenticated"}', true);
select ptp.ok((public.source_checks_for_review() -> 0 ->> 'members_confirmed') = '1' and (public.source_checks_for_review() -> 0 ->> 'members_not_confirmed') = '1', 'reviewer sees counts');
select ptp.ok(public.source_checks_for_review()::text not like '%b1%' and public.source_checks_for_review()::text not like '%Member%', 'reviewer never sees who');
select ptp.ok((select count(*) from public.private_research) = 0, 'reviewer cannot read a private note');
rollback;
do $$ begin raise notice 'ALL save-to-notes TESTS PASSED'; end $$;
