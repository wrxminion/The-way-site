-- Tests for 0027 (live draft status, cancel, heartbeat, more draft sections). Run after claim_projects_tests.sql.
\set ON_ERROR_STOP 1
\set QUIET 1
-- users from claim_projects_tests.sql: b1 and c1 are authors, d1 a plain member
update private.checker_keys set last_seen_at = null, draft_state = null;

-- clean slate for position tests: finish whatever the earlier file left open
update public.claim_drafts set status = 'failed', error = 'test cleanup' where status in ('queued','running');

begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c1"}', true);
set local role authenticated;
select public.request_claim_draft('Author C notes that are long enough for the check.', array['https://example.org/c']);
commit;
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b1"}', true);
set local role authenticated;
select public.request_claim_draft('Author B notes that are long enough for the check.', array['https://example.org/b']);
create temp table mine as select id from public.claim_drafts where status = 'queued' and requested_by = auth.uid();
grant all on mine to authenticated;
select cpt.ok((public.draft_progress((select id from mine))->>'position')::int = 1, 'place in line counts the drafts ahead');
select cpt.ok((public.draft_progress((select id from mine))->>'online')::boolean = false, 'no heartbeat yet means offline');
select cpt.ok((public.draft_progress((select id from mine))->>'age_secs')::int >= 0, 'elapsed time is reported');
commit;
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d1"}', true);
set local role authenticated;
select cpt.ok(public.draft_progress((select min(id) from public.claim_drafts)) is null, 'nobody else can see a draft''s progress');
select cpt.fails($$select public.cancel_claim_draft((select min(id) from public.claim_drafts))$$, 'Nothing to cancel', 'nobody else can cancel it');
commit;

-- heartbeat
begin;
set local role anon;
select cpt.fails($$select public.checker_ping('FRAK-' || repeat('b', 64), 'ready', 'x')$$, 'Unknown checker key', 'a wrong key cannot ping');
select public.checker_ping('FRAK-' || repeat('a', 64), 'paused', 'Our computer is busy with another job, so your draft is waiting its turn.');
commit;
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b1"}', true);
set local role authenticated;
select cpt.ok((public.draft_progress((select id from mine))->>'online')::boolean, 'after a ping the AI computer is online');
select cpt.ok(public.draft_progress((select id from mine))->>'worker_state' = 'paused' and public.draft_progress((select id from mine))->>'worker_note' like 'Our computer is busy%', 'the worker''s plain reason reaches the author');
commit;
update private.checker_keys set last_seen_at = now() - interval '3 minutes';
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b1"}', true);
set local role authenticated;
select cpt.ok(not (public.draft_progress((select id from mine))->>'online')::boolean, 'no ping for 2 minutes means offline');
commit;
update private.checker_keys set last_seen_at = now();

-- progress and cancel
begin;
set local role anon;
create temp table job as select public.checker_draft_claim('FRAK-' || repeat('a', 64)) j;
select cpt.ok((select (j->>'notes') like 'Author C%' from job), 'the oldest draft goes first');
select cpt.ok(public.checker_draft_progress('FRAK-' || repeat('a', 64), (select (j->>'draft_id')::bigint from job), 'Reading your sources'), 'progress says keep going');
commit;
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b1"}', true);
set local role authenticated;
select cpt.ok((public.draft_progress((select id from mine))->>'position')::int = 1, 'still one ahead while it runs');
commit;
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c1"}', true);
set local role authenticated;
select cpt.ok((select status_note from public.claim_drafts where status = 'running') = 'Reading your sources', 'the author sees the note');
select public.cancel_claim_draft((select id from public.claim_drafts where status = 'running'));
select cpt.ok((select count(*) from public.claim_drafts where status = 'cancelled') = 1, 'the author cancelled it');
select cpt.fails($$select public.cancel_claim_draft((select id from public.claim_drafts where status = 'cancelled'))$$, 'Nothing to cancel', 'a finished draft cannot be cancelled');
commit;
-- new sections come through, verdict never does
begin;
set local role anon;
create temp table job2 as select public.checker_draft_claim('FRAK-' || repeat('a', 64)) j;
select cpt.fails($$select public.checker_draft_complete('FRAK-' || repeat('a', 64), (select (j->>'draft_id')::bigint from job2),
  '{"claim":"After training in 2019, complaints fell from 80 to 52.","methods":"Ask the Republican office."}'::jsonb, 'm')$$, 'never a candidate or party', 'a party word in methods is refused');
select public.checker_draft_complete('FRAK-' || repeat('a', 64), (select (j->>'draft_id')::bigint from job2),
  '{"claim":"After training in 2019, complaints fell from 80 to 52.","summary":"The source reports that complaints fell.","evidence":"\"Complaints fell.\" Source: https://example.org/b",
    "counterargument":"Body cameras came the same years.","counter_response":"The source does not say which change mattered.","methods":"Read the source page.","limitations":"Covers one county.",
    "notes":["No second source was given."],"verdict":"supported","passages":[1,{"url":"https://example.org/b","text":"Complaints fell."}]}'::jsonb, 'qwen3:8b');
commit;
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b1"}', true);
set local role authenticated;
select cpt.ok((select draft ? 'evidence' and draft ? 'counter_response' and draft ? 'methods' and draft ? 'limitations' and not draft ? 'verdict' from public.claim_drafts where status = 'done' order by id desc limit 1), 'new sections stored, a verdict is never stored');
select cpt.ok((select jsonb_array_length(draft->'passages') = 1 and draft->'notes'->>0 = 'No second source was given.' from public.claim_drafts where status = 'done' order by id desc limit 1), 'junk passages dropped, notes kept');
select cpt.ok((public.draft_progress((select id from mine))->>'status') = 'done', 'progress shows done');
commit;

-- ---------------------------------------------------------------- spelling and grammar check
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d1"}', true);
set local role authenticated;
select cpt.fails($$select public.request_proofread('{"claim":"Complaints fell by a third."}'::jsonb)$$, 'Author (Submitter)', 'only authors can ask for a check');
commit;
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b1"}', true);
set local role authenticated;
select cpt.fails($$select public.request_proofread('{"verdict":"supported"}'::jsonb)$$, 'Unknown field', 'the verdict is never sent for checking');
select cpt.fails($$select public.request_proofread('{"claim":"None given in the sources."}'::jsonb)$$, 'no written text', 'a ticked box is not text to check');
select cpt.fails($$select public.request_proofread('{"claim":5}'::jsonb)$$, 'must be text', 'fields must be text');
select cpt.ok(public.request_proofread('{"claim":"Complaints fel from 80 to 52.","summary":"The source reports that complaints fell.","counterargument":"None given in the sources."}'::jsonb) is not null, 'author asks for a check');
select cpt.ok((select input ? 'claim' and input ? 'summary' and not input ? 'counterargument' from public.claim_drafts where kind = 'proofread'), 'only written fields are queued');
commit;
begin;
set local role anon;
create temp table pj as select public.checker_draft_claim('FRAK-' || repeat('a', 64)) j;
select cpt.ok((select j->>'kind' = 'proofread' and (j->'input'->>'claim') like 'Complaints fel %' from pj), 'the worker gets the fields and the kind');
select cpt.fails($$select public.checker_draft_complete('FRAK-' || repeat('a', 64), (select (j->>'draft_id')::bigint from pj), '{"claim":"After training in 2019, complaints fell from 80 to 52."}'::jsonb, 'm')$$, 'not running', 'a draft completion cannot answer a check');
select public.checker_proofread_complete('FRAK-' || repeat('a', 64), (select (j->>'draft_id')::bigint from pj),
  '[{"field":"claim","suggested":"Complaints fell from 80 to 52."},{"field":"summary","suggested":"The source reports that complaints fell."},{"field":"methods","suggested":"not asked"}]'::jsonb,
  '["Left the quotes alone."]'::jsonb, 'qwen3:8b');
commit;
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b1"}', true);
set local role authenticated;
select cpt.ok((select jsonb_array_length(draft->'fixes') = 1 and draft->'fixes'->0->>'original' = 'Complaints fel from 80 to 52.' from public.claim_drafts where kind = 'proofread'), 'only real changes to asked fields are kept; the original comes from the saved request');
select cpt.ok((public.draft_progress((select id from public.claim_drafts where kind = 'proofread'))->>'kind') = 'proofread', 'progress says what kind it is');
select cpt.fails($$select public.mark_claim_draft_used((select id from public.claim_drafts where kind = 'proofread'), (select min(id) from public.research_versions))$$, 'No such draft', 'a check is not a draft that can be used');
commit;

-- ---------------------------------------------------------------- claim and evidence stay required
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b1"}', true);
set local role authenticated;
insert into public.research_versions (item_id, claim, verdict, summary, body, counterargument, counter_response, methods, limitations, reason_for_change)
select id, 'None given in the sources.', 'mixed', 'A short summary here.', 'Evidence evidence evidence evidence.', 'None given in the sources.', 'None given in the sources.', 'None given in the sources.', 'None given in the sources.', 'Second version' from public.research_items;
insert into public.research_versions (item_id, claim, verdict, summary, body, counterargument, counter_response, methods, limitations, reason_for_change)
select id, 'Complaints fell from 80 to 52 after the training.', 'mixed', 'A short summary here.', 'None given in the sources.', 'None given in the sources.', 'None given in the sources.', 'None given in the sources.', 'None given in the sources.', 'Third version' from public.research_items;
insert into public.research_versions (item_id, claim, verdict, summary, body, counterargument, counter_response, methods, limitations, reason_for_change)
select id, 'Complaints fell from 80 to 52 after the training.', 'mixed', 'A short summary here.', 'Evidence evidence evidence evidence.', 'None given in the sources.', 'None given in the sources.', 'None given in the sources.', 'None given in the sources.', 'Fourth version' from public.research_items;
commit;
select cpt.fails($$insert into public.research_submissions (version_id, submitted_by, check_state) select id, author_id, 'unchecked' from public.research_versions where reason_for_change = 'Second version'$$, 'claim is required', 'the marker cannot stand in for the claim');
select cpt.fails($$insert into public.research_submissions (version_id, submitted_by, check_state) select id, author_id, 'unchecked' from public.research_versions where reason_for_change = 'Third version'$$, 'evidence is required', 'the marker cannot stand in for the evidence');
insert into public.research_submissions (version_id, submitted_by, check_state) select id, author_id, 'unchecked' from public.research_versions where reason_for_change = 'Fourth version';
select cpt.ok((select count(*) from public.research_submissions s join public.research_versions v on v.id = s.version_id where v.reason_for_change = 'Fourth version') = 1, 'the marker is fine for the optional sections');
do $$ begin raise notice 'ALL DRAFT STATUS TESTS PASSED'; end $$;
