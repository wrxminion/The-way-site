-- Tests for 0061 (titles, onboarding, read-check answers, early review bonus). Needs 0001-0024 plus 0021 comments/read checks on the Supabase stub.
-- Own members: Ann (new, joined today), Ben, Rey (reviewer), Rey2 (reviewer), Sue (super_admin), Cal (CalidDancer).
\set ON_ERROR_STOP 1
\set QUIET 1
create schema if not exists t;
grant usage on schema t to anon, authenticated;
create or replace function t.ok(cond boolean, what text) returns void language plpgsql as $$
begin if cond is not true then raise exception 'FAIL: %', what; end if; raise notice 'pass: %', what; end $$;
create or replace function t.fails(stmt text, pattern text, what text) returns void language plpgsql as $$
begin
  begin execute stmt;
  exception when others then
    if sqlerrm ilike '%' || pattern || '%' then raise notice 'pass: %', what; return; end if;
    raise exception 'FAIL: % (wrong error: %)', what, sqlerrm;
  end;
  raise exception 'FAIL: % (statement succeeded)', what;
end $$;
grant execute on all functions in schema t to anon, authenticated;

insert into auth.users (id, email) values
 ('00000000-0000-0000-0000-0000000000b1','ann@x.org'),('00000000-0000-0000-0000-0000000000b2','ben@x.org'),
 ('00000000-0000-0000-0000-0000000000b3','rey@x.org'),('00000000-0000-0000-0000-0000000000b4','rey2@x.org'),
 ('00000000-0000-0000-0000-0000000000b5','sue@x.org'),('00000000-0000-0000-0000-0000000000b6','cal@x.org');
insert into public.members (id, display_name, joined_at) values
 ('00000000-0000-0000-0000-0000000000b1','Ann', now()),('00000000-0000-0000-0000-0000000000b2','Ben', now() - interval '40 days'),
 ('00000000-0000-0000-0000-0000000000b3','Rey', now() - interval '90 days'),('00000000-0000-0000-0000-0000000000b4','Rey2', now() - interval '90 days'),
 ('00000000-0000-0000-0000-0000000000b5','Sue', now() - interval '90 days'),('00000000-0000-0000-0000-0000000000b6','CalidDancer', now());
insert into public.member_roles (member_id, role) values
 ('00000000-0000-0000-0000-0000000000b3','reviewer'),('00000000-0000-0000-0000-0000000000b4','reviewer'),('00000000-0000-0000-0000-0000000000b5','super_admin');

------------------------------------------------------------------ signed out
begin;
set local role anon;
select t.fails($$select * from public.my_titles()$$, 'permission denied', 'signed out cannot list titles');
select t.fails($$select * from public.my_onboarding()$$, 'permission denied', 'signed out cannot read onboarding');
select t.fails($$select * from public.member_onboarding$$, 'permission denied', 'signed out cannot read onboarding table');
commit;

------------------------------------------------------------------ titles
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b5"}', true);
set local role authenticated;
select public.award_title('00000000-0000-0000-0000-0000000000b6', 'first_ripple', 'First to find us on their own');
select t.fails($$select public.award_title('00000000-0000-0000-0000-0000000000b1', 'first_ripple', 'Second try')$$, 'already given', 'one-of-one title cannot go to a second member');
select t.fails($$select public.award_title('00000000-0000-0000-0000-0000000000b1', 'nope', 'Because I said')$$, 'Unknown title', 'unknown title refused');
select t.fails($$select public.award_title('00000000-0000-0000-0000-0000000000b1', 'first_ripple', 'hi')$$, 'Give a reason', 'reason needed');
commit;
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b1"}', true);
set local role authenticated;
select t.fails($$select public.award_title('00000000-0000-0000-0000-0000000000b1', 'first_ripple', 'Give myself it')$$, 'super_admin', 'a member cannot award titles');
select t.fails($$update public.member_title_awards set reason = 'x'$$, 'permission denied', 'awards cannot be edited by members');
select t.fails($$select public.set_shown_title('first_ripple')$$, 'do not hold', 'cannot show a title you do not hold');
select t.fails($$select public.set_shown_title('editor')$$, 'do not hold', 'cannot show a rank you do not hold');
select t.ok((select count(*) from public.my_titles()) = 1 and (select slug from public.my_titles()) = 'member', 'new member holds only Member');
commit;
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b6"}', true);
set local role authenticated;
select t.ok((select count(*) from public.my_titles()) = 2, 'CalidDancer holds Member and First Ripple');
select t.ok(public.member_title('00000000-0000-0000-0000-0000000000b6') = 'Member', 'default shows the rank, not the special title');
select public.set_shown_title('first_ripple');
select t.ok(public.member_title('00000000-0000-0000-0000-0000000000b6') = 'First Ripple', 'picked title shows');
select t.ok((select shown from public.my_titles() where slug = 'first_ripple'), 'picker marks the shown title');
select public.set_shown_title(null);
select t.ok(public.member_title('00000000-0000-0000-0000-0000000000b6') = 'Member', 'clearing the pick returns to default');
select t.ok((select count(*) from public.member_title_awards) = 1, 'a member sees only their own award row');
commit;
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b3"}', true);
set local role authenticated;
select t.ok(public.member_title('00000000-0000-0000-0000-0000000000b3') = 'Deshi', 'reviewer role shows as Deshi');
select t.ok(public.member_title('00000000-0000-0000-0000-0000000000b1') = 'Member', 'anyone can see another member title');
commit;

------------------------------------------------------------------ onboarding
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b1"}', true);
set local role authenticated;
select t.ok((select needs_welcome from public.my_onboarding()), 'new member needs the welcome');
select public.save_onboarding('review', null, 'interests');
select t.ok((select step = 'interests' and reason = 'review' and not needs_welcome from public.my_onboarding()), 'progress saved, welcome no longer forced');
select public.save_onboarding(null, 'the courts, schools', 'tour');
select t.ok((select interests = 'the courts, schools' and reason = 'review' from public.my_onboarding()), 'answers kept when a later step sends none');
select t.fails($$select public.save_onboarding('bogus', null, 'why')$$, 'Bad answer', 'bad reason refused');
select t.fails($$select public.save_onboarding('review', '<b>x</b>', 'why')$$, 'no < or >', 'markup refused');
select t.fails($$select public.save_onboarding('review', repeat('x', 501), 'why')$$, '500', 'too long refused');
select t.fails($$select public.save_onboarding('review', null, 'weird')$$, 'Bad step', 'bad step refused');
select public.save_onboarding(null, null, 'done', true);
select t.ok((select finished from public.my_onboarding()), 'skipping finishes it');
select public.save_onboarding(null, null, 'why');
select t.ok((select reason = 'review' from public.my_onboarding()), 'reopening keeps earlier answers');
commit;
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b2"}', true);
set local role authenticated;
select t.ok(exists (select 1 from public.my_onboarding()), 'old member can call it');
select t.ok((select not needs_welcome from public.my_onboarding()), 'member who joined before this shipped is NOT forced into onboarding' );
select t.fails($$select * from public.admin_onboarding_summary()$$, 'admin', 'a member cannot read the admin summary');
select t.fails($$select * from public.member_onboarding$$, 'permission denied', 'member cannot read the onboarding table directly');
commit;
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b5"}', true);
set local role authenticated;
select t.ok((select members from public.admin_onboarding_summary() where reason = 'review') = 1, 'admin sees counts by answer');
commit;

------------------------------------------------------------------ read-check answers and the early bonus
-- Ann (joined today) makes 12 checks. Different articles. Rey signs them off.
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b1"}', true);
set local role authenticated;
select t.fails($$select public.submit_read_check_v2('news:a0','Good facts here ok','nothing','maybe','supports','yes','{document}')$$, 'check', 'bad title answer refused');
select t.fails($$select public.submit_read_check_v2('news:a0','Good facts here ok','nothing','yes','supports','no','{document}')$$, 'check', 'evidence kinds with "no evidence" refused');
select t.fails($$select public.submit_read_check_v2('news:a0','short','nothing','yes','supports','yes','{document}')$$, 'little more', 'liked too short refused');
select t.fails($$select public.submit_read_check_v2('news:a0','I liked the clear numbers','nothing','yes','supports','yes','{made_up}')$$, 'check', 'unknown evidence kind refused');
select public.submit_read_check_v2('news:a1','I liked the clear numbers in it','the headline was long','yes','supports','yes','{document,data}');
select t.fails($$select public.submit_read_check_v2('news:a1','I liked the clear numbers in it','nothing','yes','supports','yes','{data}')$$, 'already checked', 'same article twice refused');
select public.submit_read_check_v2('news:a2','I liked the clear numbers in it','nothing','mostly','mixed','some','{named_source}');
select public.submit_read_check_v2('news:a3','I liked the clear numbers in it','nothing','no','no_claim','no','{}');
select t.ok((select count(*) from public.read_check_answers) = 3, 'answers saved with the checks');
select t.ok((select count(*) from public.read_checks) = 3, 'the plain read check rows exist too');
-- old path still works (no answers, so no bonus)
select public.submit_read_check('news:old1', 'I read this one the old way, it was fine');
select t.fails($$update public.read_check_answers set liked = 'x'$$, 'permission denied', 'answers cannot be edited');
commit;

begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b3"}', true);
set local role authenticated;
select t.ok((select first_review_no from public.read_check_answers_for(array[(select min(id) from public.read_checks)])) = 1, 'reviewer sees review number 1 flagged as a first review');
select t.ok((select title_accurate = 'yes' from public.read_check_answers_for(array[(select min(id) from public.read_checks)])), 'reviewer sees the answers');
select public.signoff_read_check(id, true, null) from public.read_checks where item_key in ('news:a1','news:a2','news:old1');
commit;
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b1"}', true);
set local role authenticated;
select t.ok((select count(*) from public.karma_events where kind = 'early_review_bonus') = 2, 'bonus paid for the 2 accepted checks WITH answers, not for the old-path one');
select t.ok((select sum(points) from public.karma_events where kind = 'early_review_bonus') = 20, 'bonus is 10 each');
select t.ok((select count(*) from public.karma_events where kind = 'article_read') = 3, 'normal article_read points still paid (3 checks)');
commit;
-- a decline pays nothing; a self sign-off cannot happen; alt-account rule: bonus needs a different member
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b4"}', true);
set local role authenticated;
select public.signoff_read_check(id, false, 'Please say which part you liked') from public.read_checks where item_key = 'news:a3';
commit;
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b1"}', true);
set local role authenticated;
select t.ok((select count(*) from public.karma_events where kind = 'early_review_bonus') = 2, 'declined check earns no bonus');
select t.fails($$select * from public.admin_early_bonus_watch()$$, 'admin', 'a member cannot read the bonus watch');
commit;
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b5"}', true);
set local role authenticated;
select t.ok((select bonus_count from public.admin_early_bonus_watch() where member_name = 'Ann') = 2, 'admin watch lists who earned the bonus');
commit;

-- Ten-bonus cap and 10-day window, checked as the database owner.
do $$
declare i int; cid bigint; n int;
begin
  -- Ben joined 40 days ago: his checks are outside the window, so no bonus even when accepted.
  insert into public.read_checks (item_key, member_id, note) values ('news:ben1', '00000000-0000-0000-0000-0000000000b2', 'Ben read it, it was interesting to him') returning id into cid;
  insert into public.read_check_answers (check_id, title_accurate, stance, evidence_given, evidence_kinds, liked, disliked) values (cid,'yes','supports','yes','{data}','Good clear numbers','nothing');
  insert into public.read_check_signoffs (check_id, reviewer_id, decision) values (cid, '00000000-0000-0000-0000-0000000000b3', 'accepted');
  perform t.ok((select count(*) from public.karma_events where member_id = '00000000-0000-0000-0000-0000000000b2' and kind = 'early_review_bonus') = 0, 'no bonus after the first 10 days');
  -- Cal (new) gets 12 accepted checks with answers: only 10 pay.
  for i in 1..12 loop
    insert into public.read_checks (item_key, member_id, note) values ('news:cal' || i, '00000000-0000-0000-0000-0000000000b6', 'Cal read number ' || i || ' and liked it') returning id into cid;
    insert into public.read_check_answers (check_id, title_accurate, stance, evidence_given, evidence_kinds, liked, disliked) values (cid,'yes','supports','yes','{data}','Good clear numbers','nothing');
    insert into public.read_check_signoffs (check_id, reviewer_id, decision) values (cid, case when i % 2 = 0 then '00000000-0000-0000-0000-0000000000b3'::uuid else '00000000-0000-0000-0000-0000000000b4'::uuid end, 'accepted');
  end loop;
  select count(*) into n from public.karma_events where member_id = '00000000-0000-0000-0000-0000000000b6' and kind = 'early_review_bonus';
  perform t.ok(n = 10, 'bonus stops at 10 reviews (got ' || n || ')');
end $$;
\echo ALL TITLES/ONBOARDING TESTS PASSED
