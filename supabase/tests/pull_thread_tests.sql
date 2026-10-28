-- Tests for 0030 (Pull a Thread intake and queue). Standalone: run after migrations 0001 to 0019 and 0026, 0030
-- on a throwaway Postgres 16 with the Supabase stub (see CONTRIBUTING). Not run against the live project.
\set ON_ERROR_STOP 1
\set QUIET 1
create schema if not exists ptt;
grant usage on schema ptt to anon, authenticated, service_role;
create or replace function ptt.ok(cond boolean, what text) returns void language plpgsql as $$
begin if cond is not true then raise exception 'FAIL: %', what; end if; raise notice 'pass: %', what; end $$;
create or replace function ptt.fails(stmt text, pattern text, what text) returns void language plpgsql as $$
begin
  begin execute stmt;
  exception when others then
    if sqlerrm ilike '%' || pattern || '%' then raise notice 'pass: %', what; return; end if;
    raise exception 'FAIL: % (wrong error: %)', what, sqlerrm;
  end;
  raise exception 'FAIL: % (statement succeeded)', what;
end $$;
grant execute on all functions in schema ptt to anon, authenticated, service_role;
-- Supabase's service role has table privileges by default; the stub does not, so give it select for the checks below.
grant select on public.thread_intakes, public.thread_intake_events, public.thread_match_index to service_role;
create table ptt.keep (k text primary key, v text);
grant all on ptt.keep to anon, authenticated, service_role;

-- people: A admin, B plain member, E reviewer (Deshi), F second reviewer
insert into auth.users values
  ('00000000-0000-0000-0000-0000000000a1','a@x.org'),('00000000-0000-0000-0000-0000000000b1','b@x.org'),
  ('00000000-0000-0000-0000-0000000000e1','e@x.org'),('00000000-0000-0000-0000-0000000000f1','f@x.org') on conflict do nothing;
insert into public.members (id, display_name) values
  ('00000000-0000-0000-0000-0000000000a1','Admin A'),('00000000-0000-0000-0000-0000000000b1','Plain B'),
  ('00000000-0000-0000-0000-0000000000e1','Deshi E'),('00000000-0000-0000-0000-0000000000f1','Deshi F') on conflict do nothing;
insert into public.member_roles (member_id, role) values
  ('00000000-0000-0000-0000-0000000000a1','admin'),('00000000-0000-0000-0000-0000000000e1','reviewer'),
  ('00000000-0000-0000-0000-0000000000f1','reviewer') on conflict do nothing;
insert into private.checker_keys (key_hash, label, created_by)
  values (encode(extensions.digest('ARCH-' || repeat('b', 64), 'sha256'), 'hex'), 'pt-test', '00000000-0000-0000-0000-0000000000a1');

-- one published finding that cites a link, to match against (the insert triggers read the signed-in id)
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1"}', false);
insert into public.research_items (slug, title, question, created_by)
  values ('sheriff-deescalation', 'Sheriff deputies de-escalation training and use of force complaints', 'Did de-escalation training reduce use of force complaints?', '00000000-0000-0000-0000-0000000000a1');
insert into public.research_versions (item_id, version_no, author_id, summary, body, methods, limitations, reason_for_change)
  select id, 1, created_by, 'Complaints about use of force fell after the training began in 2019.', 'x', 'methods', 'limits', 'first' from public.research_items;
insert into public.research_sources (version_id, url, title) select id, 'https://county.example.gov/report-2021/?utm_source=x#top', 'County report' from public.research_versions;
insert into public.research_publication_events (item_id, version_id, event_type, reason, reviewer_id)
  select item_id, id, 'published', 'checked', author_id from public.research_versions;
update public.research_items set published_version_id = (select id from public.research_versions);
select set_config('request.jwt.claims', '', false);

------------------------------------------------------------------ nobody reaches the tables or the entry function directly
begin;
set local role anon;
select ptt.fails($$select count(*) from public.thread_intakes$$, 'permission denied', 'visitors cannot read the queue table');
select ptt.fails($$select count(*) from public.thread_rate_hits$$, 'permission denied', 'visitors cannot read rate data');
select ptt.fails($$select public.intake_thread('question',null,'Is the sheriff training program working well?',null,null,null,null,repeat('1',64))$$, 'permission denied', 'visitors cannot call the entry function; only the Edge Function can');
commit;
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000e1"}', true);
set local role authenticated;
select ptt.fails($$select count(*) from public.thread_intakes$$, 'permission denied', 'even a reviewer reads only through the functions');
select ptt.fails($$insert into public.thread_intake_events (intake_id,event_type,reason) values (1,'priority','x')$$, 'permission denied', 'no direct event writes');
commit;

------------------------------------------------------------------ intake (as the Edge Function: service role)
begin;
set local role service_role;
-- bad input
select ptt.fails($$select public.intake_thread('url','ftp://x.org/a',null,null,null,null,null,repeat('1',64))$$, 'full public web link', 'ftp refused');
select ptt.fails($$select public.intake_thread('url','http://localhost/a',null,null,null,null,null,repeat('1',64))$$, 'full public web link', 'localhost refused');
select ptt.fails($$select public.intake_thread('url','http://user:pw@example.com/a',null,null,null,null,null,repeat('1',64))$$, 'full public web link', 'link with a login refused');
select ptt.fails($$select public.intake_thread('url','http://10.0.0.1/a',null,null,null,null,null,repeat('1',64))$$, 'full public web link', 'bare IP refused');
select ptt.fails($$select public.intake_thread('question',null,'short',null,null,null,null,repeat('1',64))$$, '10 to 1500', 'tiny question refused');
select ptt.fails($$select public.intake_thread('question',null,'Is <script>alert(1)</script> allowed here?',null,null,null,null,repeat('1',64))$$, 'leave out', 'angle brackets refused');
select ptt.fails($$select public.intake_thread('screenshot',null,null,'what is true here',null,null,null,repeat('1',64))$$, 'did not arrive', 'screenshot needs a stored file');
select ptt.fails($$select public.intake_thread('screenshot',null,null,'what is true here','00000000-0000-0000-0000-000000000001.exe',100,null,repeat('1',64))$$, 'did not arrive', 'screenshot type is checked');
select ptt.fails($$select public.intake_thread('screenshot',null,null,'x','00000000-0000-0000-0000-000000000001.png',9999999,null,repeat('1',64))$$, 'did not arrive', 'screenshot size is checked');
select ptt.fails($$select public.intake_thread('question',null,'Is the new county jail contract legal under state law?',null,null,null,null,'nothex')$$, 'rate key', 'rate key required');
-- the oldest item is a plain question nobody else sent; a first-in-first-out queue would show it first
select public.intake_thread('question',null,'Who approved the new county jail contract and was it bid openly?',null,null,null,null,repeat('4',64));
-- a link nobody has cited: queued, with a receipt
insert into ptt.keep select 'r_url', (public.intake_thread('url','https://news.example.com/story/42?utm_source=tw','',null,null,null,null,repeat('1',64)))->>'receipt';
select ptt.ok((select status from public.thread_intakes where kind='url' and status <> 'matched') = 'queued', 'a new link is queued');
select ptt.ok((select canonical_url from public.thread_intakes where kind='url') = 'https://news.example.com/story/42', 'tracking parameters are stripped');
select ptt.ok((select enrich_status from public.thread_intakes where kind='url') = 'pending', 'a link waits for the archiver to read it');
select ptt.ok((public.thread_status((select v from ptt.keep where k='r_url'))->>'reading')::boolean = true, 'status says the link is still being read');
-- a link a finding already cites: matched at once, canonical form compared
select ptt.ok((public.intake_thread('url','https://COUNTY.example.gov/report-2021',null,'saw it on a post',null,null,null,repeat('2',64))->>'status') = 'matched', 'a link a finding cites is answered, not queued');
select ptt.ok((select (matches->0->>'strength') from public.thread_intakes where kind='url' and status='matched') = 'source', 'link match is marked as a source match');
-- a question that shares words with the finding
insert into ptt.keep select 'r_q', (public.intake_thread('question',null,'Did the sheriff deputies training on de-escalation reduce use of force complaints?',null,null,null,null,repeat('3',64)))->>'receipt';
select ptt.ok((select status from public.thread_intakes where question like 'Did the sheriff%') = 'matched', 'a question that shares key words is matched');
select ptt.ok((select count(*) from public.thread_intakes where status='matched') = 2, 'two matched');
-- the sender never sees the finding link (findings are members only) and gets no identity data
select ptt.ok((public.thread_status((select v from ptt.keep where k='r_q'))->'matches'->0->'path') = 'null'::jsonb, 'finding links are not given to the sender');
select ptt.ok(not (public.thread_status((select v from ptt.keep where k='r_q'))::text ~ 'submitter|rate_key'), 'status carries no identity fields');
-- a question we have nothing on is queued
select ptt.ok((select status from public.thread_intakes where question like 'Who approved%') = 'queued', 'no match: queued');
-- screenshot
select public.intake_thread('screenshot',null,null,'Is the claim about the school levy in this chat right?','00000000-0000-0000-0000-0000000000aa.png',2000,null,repeat('5',64));
select ptt.ok((select kind from public.thread_intakes where shot_path is not null) = 'screenshot', 'screenshot stored by path only');
-- rate limit: anonymous key allowed 4 an hour
select public.intake_thread('question',null,'Does the state fund all-day kindergarten for every district?',null,null,null,null,repeat('6',64));
select public.intake_thread('question',null,'Does the state fund all-day kindergarten for every district?',null,null,null,null,repeat('6',64));
select public.intake_thread('question',null,'Does the state fund all-day kindergarten for every district?',null,null,null,null,repeat('6',64));
select public.intake_thread('question',null,'Does the state fund all-day kindergarten for every district?',null,null,null,null,repeat('6',64));
select ptt.fails($$select public.intake_thread('question',null,'Does the state fund all-day kindergarten for every district?',null,null,null,null,repeat('6',64))$$, 'lot of submissions', 'fifth submission in an hour is refused');
-- signed-in key gets the higher cap
select public.intake_thread('question',null,'Which agency inspects the county jail kitchen and how often?',null,null,null,'00000000-0000-0000-0000-0000000000b1',repeat('7',64));
commit;
-- repeats of one link from different people raise reach
begin;
set local role service_role;
select public.intake_thread('url','https://news.example.com/story/42',null,null,null,null,null,repeat('8',64));
select public.intake_thread('url','https://news.example.com/story/42/',null,null,null,null,null,repeat('9',64));
commit;

------------------------------------------------------------------ dispute puts a matched item in the queue
begin;
set local role anon;
select public.thread_dispute((select v from ptt.keep where k='r_q'));
select ptt.ok((public.thread_status((select v from ptt.keep where k='r_q'))->>'status') = 'Waiting for a reviewer', 'sender can say the match is not what they asked');
select ptt.fails($$select public.thread_dispute('nope')$$, 'Unknown receipt', 'bad receipt refused');
select ptt.ok(public.thread_status('nope') is null, 'unknown receipt returns nothing');
commit;

------------------------------------------------------------------ the archiver reads the link (checker key)
begin;
set local role anon;
select ptt.fails($$select public.checker_thread_next('ARCH-wrong')$$, 'Unknown checker key', 'wrong key refused');
insert into ptt.keep select 'job', public.checker_thread_next('ARCH-' || repeat('b', 64))::text;
select ptt.ok((select v::jsonb->>'url' from ptt.keep where k='job') like 'https://news.example.com/story/42%', 'worker is handed a link');
select public.checker_thread_done('ARCH-' || repeat('b', 64), ((select v::jsonb->>'intake_id' from ptt.keep where k='job'))::bigint,
  '{"title":"County jail <b>contract</b> approved","excerpt":"The board voted 3-2 to approve the contract.","checkable":true,"fetch":"ok"}'::jsonb);
select ptt.fails($$select public.checker_thread_done('ARCH-' || repeat('b', 64), 1, '{"title":"again"}'::jsonb)$$, 'not being read', 'a finished item cannot be filled twice');
select public.checker_thread_index_put('ARCH-' || repeat('b', 64), '[{"kind":"case","ref":"iran-contra","title":"Iran-Contra secret arms sales","blurb":"Secret arms sales defied congressional limits","path":"/cases/iran-contra/","urls":["https://news.example.com/story/42"]}]'::jsonb);
commit;
begin;
set local role service_role;
select ptt.ok((select page_title from public.thread_intakes where page_title is not null) = 'County jail contract approved', 'angle brackets stripped from page title');
select ptt.ok((select count(*) from public.thread_match_index) = 1, 'case index loaded');
-- a new send of that link is now answered by the case index
select ptt.ok((public.intake_thread('url','https://news.example.com/story/42',null,null,null,null,null,repeat('a',64))->>'status') = 'matched', 'a link a case cites is answered');
commit;

------------------------------------------------------------------ the queue: score, not first in first out
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b1"}', true);
set local role authenticated;
select ptt.fails($$select * from public.list_thread_queue()$$, 'reviewers only', 'a plain member cannot read the queue');
select ptt.fails($$select public.pick_thread(1)$$, 'reviewers only', 'a plain member cannot pick');
commit;
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000e1"}', true);
set local role authenticated;
select ptt.ok((select count(*) from public.list_thread_queue()) >= 5, 'reviewer reads the queue');
select ptt.ok((select count(*) from public.list_thread_queue() where status = 'matched') = 0, 'matched items are not in the open queue');
-- the item the archiver marked checkable and the link with 2 other senders must outrank a plain older question
select ptt.ok((select kind from public.list_thread_queue() order by rank limit 1) = 'url', 'the link with reach and a checkable claim ranks first, not the oldest');
select ptt.ok((select id from public.list_thread_queue() order by rank limit 1) <> (select min(id) from public.list_thread_queue() where status='queued'), 'ranking is not first in first out');
select ptt.ok((select jsonb_array_length(parts) >= 3 from public.list_thread_queue() order by rank limit 1), 'every score lists its reasons');
select ptt.ok((select (parts::text like '%checked against sources%' and parts::text like '%other sender%') from public.list_thread_queue() order by rank limit 1), 'reasons name checkable claim and reach');
select ptt.ok((select score = (select sum((x->>'pts')::int) from jsonb_array_elements(parts) x) from public.list_thread_queue() order by rank limit 1), 'score equals the sum of the listed reasons');
select ptt.ok(pg_get_function_result('public.list_thread_queue(text,int)'::regprocedure) !~ 'submitter|rate_key|receipt' and pg_get_function_result('public.thread_intake_history(bigint)'::regprocedure) !~ 'actor_id', 'reviewer functions return no identity columns');
-- pick the LAST item (an override), it records that it was not the top one
insert into ptt.keep select 'last', (select id::text from public.list_thread_queue() order by rank desc limit 1);
select public.pick_thread((select v::bigint from ptt.keep where k='last'));
select ptt.ok((select status from public.list_thread_queue() where id = (select v::bigint from ptt.keep where k='last')) = 'in_review', 'any item can be picked');
select ptt.ok((select was_top from public.thread_intake_history((select v::bigint from ptt.keep where k='last')) where event_type='picked') = false, 'the pick records it was not the top item');
select ptt.fails($$select public.pick_thread((select v::bigint from ptt.keep where k='last'))$$, 'not waiting', 'cannot pick an item twice');
commit;
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000f1"}', true);
set local role authenticated;
select ptt.fails($$select public.resolve_thread((select v::bigint from ptt.keep where k='last'),'declined','not mine')$$, 'Another reviewer', 'another reviewer cannot close a picked item');
select ptt.fails($$select public.release_thread((select v::bigint from ptt.keep where k='last'))$$, 'Only the reviewer', 'another reviewer cannot take it back');
-- move an item up with a reason
select ptt.fails($$select public.adjust_thread_priority((select v::bigint from ptt.keep where k='last'), 15, '')$$, 'Say why', 'priority change needs a reason');
select ptt.fails($$select public.adjust_thread_priority((select v::bigint from ptt.keep where k='last'), 99, 'urgent')$$, '1 to 40', 'priority change is capped');
select public.pick_thread((select id from public.list_thread_queue() where status = 'queued' order by rank desc limit 1));
commit;
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000f1"}', true);
set local role authenticated;
insert into ptt.keep select 'low', (select id::text from public.list_thread_queue() where status='queued' order by rank desc limit 1);
select public.adjust_thread_priority((select v::bigint from ptt.keep where k='low'), 40, 'Election is next week');
select public.adjust_thread_priority((select v::bigint from ptt.keep where k='low'), 40, 'Ballot deadline is Friday');
select ptt.ok((select rank from public.list_thread_queue() where id = (select v::bigint from ptt.keep where k='low')) = 1, 'a reviewer can move an item to the top, and the reason is kept');
select ptt.ok((select string_agg(reason, '; ' order by created_at, reason) from public.thread_intake_history((select v::bigint from ptt.keep where k='low')) where event_type='priority') like '%Election is next week%', 'priority history keeps the reason');
select ptt.ok((select count(*) from public.list_thread_queue() where parts::text like '%Moved by reviewers%') = 1, 'the move shows as a reason');
commit;
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000e1"}', true);
set local role authenticated;
select public.release_thread((select v::bigint from ptt.keep where k='last'));
select ptt.ok((select status from public.list_thread_queue() where id = (select v::bigint from ptt.keep where k='last')) = 'queued', 'the picker can put it back');
select public.pick_thread((select v::bigint from ptt.keep where k='last'));
select ptt.fails($$select public.resolve_thread((select v::bigint from ptt.keep where k='last'),'duplicate','same as another')$$, 'which earlier item', 'duplicate must name the original');
select ptt.fails($$select public.resolve_thread((select v::bigint from ptt.keep where k='last'),'maybe','x y z')$$, 'Unknown disposition', 'disposition is checked');
select public.resolve_thread((select v::bigint from ptt.keep where k='last'),'accepted','Worth a full finding','We will research this.',(select id from public.research_projects limit 1));
select ptt.fails($$select public.resolve_thread((select v::bigint from ptt.keep where k='last'),'declined','changed my mind')$$, 'already closed', 'a closed item stays closed');
commit;

------------------------------------------------------------------ history cannot be rewritten
begin;
select ptt.fails($$update public.thread_intake_events set reason = 'edited'$$, 'append-only', 'events cannot be edited');
select ptt.fails($$delete from public.thread_intake_events$$, 'append-only', 'events cannot be deleted');
commit;

------------------------------------------------------------------ storage: screenshots are private
begin;
select ptt.ok((select public from storage.buckets where id = 'thread-screenshots') = false, 'screenshot bucket is private');
select ptt.ok((select file_size_limit from storage.buckets where id = 'thread-screenshots') = 4194304, 'screenshot bucket has a size limit');
select ptt.ok((select allowed_mime_types from storage.buckets where id = 'thread-screenshots') = array['image/png','image/jpeg','image/webp'], 'screenshot bucket allows only png, jpeg, webp');
select ptt.ok(not exists (select 1 from pg_policies where tablename = 'objects' and policyname like 'thread_shots%' and cmd in ('INSERT','UPDATE','DELETE','ALL')), 'no client can write or delete screenshots');
commit;

select 'ALL PULL A THREAD TESTS PASSED' as result;
