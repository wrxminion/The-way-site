-- Tests for 0026 (research projects, links, AI draft queue). Standalone: run after migrations 0001 to 0019 and 0026
-- on a throwaway Postgres 16 with the Supabase stub (see CONTRIBUTING). Not run against the live project.
\set ON_ERROR_STOP 1
\set QUIET 1
create schema if not exists cpt;
grant usage on schema cpt to anon, authenticated;
create or replace function cpt.ok(cond boolean, what text) returns void language plpgsql as $$
begin if cond is not true then raise exception 'FAIL: %', what; end if; raise notice 'pass: %', what; end $$;
create or replace function cpt.fails(stmt text, pattern text, what text) returns void language plpgsql as $$
begin
  begin execute stmt;
  exception when others then
    if sqlerrm ilike '%' || pattern || '%' then raise notice 'pass: %', what; return; end if;
    raise exception 'FAIL: % (wrong error: %)', what, sqlerrm;
  end;
  raise exception 'FAIL: % (statement succeeded)', what;
end $$;
grant execute on all functions in schema cpt to anon, authenticated;

-- people: A admin, B author (researcher), C author, D plain member, E reviewer
insert into auth.users values
  ('00000000-0000-0000-0000-0000000000a1','a@x.org'),('00000000-0000-0000-0000-0000000000b1','b@x.org'),
  ('00000000-0000-0000-0000-0000000000c1','c@x.org'),('00000000-0000-0000-0000-0000000000d1','d@x.org'),
  ('00000000-0000-0000-0000-0000000000e1','e@x.org') on conflict do nothing;
insert into public.members (id, display_name) values
  ('00000000-0000-0000-0000-0000000000a1','Admin A'),('00000000-0000-0000-0000-0000000000b1','Author B'),
  ('00000000-0000-0000-0000-0000000000c1','Author C'),('00000000-0000-0000-0000-0000000000d1','Plain D'),
  ('00000000-0000-0000-0000-0000000000e1','Deshi E') on conflict do nothing;
insert into public.member_roles (member_id, role) values
  ('00000000-0000-0000-0000-0000000000a1','admin'),('00000000-0000-0000-0000-0000000000b1','researcher'),
  ('00000000-0000-0000-0000-0000000000c1','researcher'),('00000000-0000-0000-0000-0000000000e1','reviewer') on conflict do nothing;
insert into private.checker_keys (key_hash, label, created_by)
  values (encode(extensions.digest('FRAK-' || repeat('a', 64), 'sha256'), 'hex'), 'test', '00000000-0000-0000-0000-0000000000a1');

begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b1"}', true);
set local role authenticated;
insert into public.research_items (slug, title, question)
  values ('sheriff-deescalation', 'A sheriff trained deputies in de-escalation', 'Did it matter?');
commit;

------------------------------------------------------------------ seed and who can read/manage projects
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d1"}', true);
set local role authenticated;
select cpt.ok((select count(*) from public.research_projects) >= 5, 'a member sees the starting projects');
select cpt.ok((select count(*) from public.research_projects where parent_id is not null) >= 2, 'strands sit under a project');
select cpt.fails($$select public.save_research_project(null,'x-topic','X topic',null,null,true)$$, 'needs the admin role', 'a plain member cannot add a project');
select cpt.fails($$insert into public.research_projects (slug,title) values ('hack-it','Hack it')$$, 'permission denied', 'no direct inserts');
commit;
begin;
set local role anon;
select cpt.fails($$select count(*) from public.research_projects$$, 'permission denied', 'visitors cannot read projects');
commit;
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1"}', true);
set local role authenticated;
select cpt.ok(public.save_research_project(null,'schools','Schools','How schools work',null,true) is not null, 'admin adds a project');
select cpt.fails($$select public.save_research_project(null,'bad<slug','Bad','',null,true)$$, 'violates check', 'bad slug refused');
select cpt.fails($$select public.save_research_project(null,'strand-of-strand','Nested',null,(select id from public.research_projects where slug='policing-reform'),true)$$, 'cannot have its own strands', 'strands do not nest');
select cpt.fails($$select public.save_research_project((select id from public.research_projects where slug='policing-and-ice'),'policing-and-ice','Policing and ICE',null,(select id from public.research_projects where slug='schools'),true)$$, 'has strands', 'a project with strands cannot become a strand');
select cpt.ok(public.save_research_project((select id from public.research_projects where slug='schools'),'schools','Schools','Retired',null,false) is not null, 'admin retires a project');
select cpt.ok((select count(*) from public.moderation_actions where subject_type='research_project') = 2, 'project changes are logged');
commit;

------------------------------------------------------------------ linking
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b1"}', true);
set local role authenticated;
select cpt.ok(public.link_item_to_project((select id from public.research_items), (select id from public.research_projects where slug='policing-reform'), 'supports', 'Crime fell after the training') is not null, 'author links own finding');
select cpt.ok(public.link_item_to_project((select id from public.research_items), (select id from public.research_projects where slug='policing-reform'), 'related', null) is not null, 'linking again updates the relation');
select cpt.ok((select count(*) from public.research_item_links where removed_at is null) = 1 and (select relation from public.research_item_links) = 'related', 'one open link per project');
select cpt.fails($$select public.link_item_to_project((select id from public.research_items), (select id from public.research_projects where slug='policing-reform'), 'proves', null)$$, 'Unknown relation', 'relation is checked');
select cpt.fails($$select public.link_item_to_project((select id from public.research_items), (select id from public.research_projects where slug='schools'), 'related', null)$$, 'not open for new links', 'retired project refuses links');
select cpt.fails($$insert into public.research_item_links (item_id, project_id, relation) values (1,1,'related')$$, 'permission denied', 'no direct link inserts');
commit;
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c1"}', true);
set local role authenticated;
select cpt.fails($$select public.link_item_to_project((select id from public.research_items), (select id from public.research_projects where slug='elections'), 'related', null)$$, 'Not allowed', 'another author cannot link it');
select cpt.fails($$select public.unlink_item_from_project((select id from public.research_item_links limit 1))$$, 'Not allowed', 'another author cannot unlink it');
commit;
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d1"}', true);
set local role authenticated;
select cpt.fails($$select public.link_item_to_project((select id from public.research_items), (select id from public.research_projects where slug='elections'), 'related', null)$$, 'Not allowed', 'a plain member cannot link');
commit;
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000e1"}', true);
set local role authenticated;
select cpt.ok(public.link_item_to_project((select id from public.research_items), (select id from public.research_projects where slug='policing-corruption'), 'counter_example', 'A reviewer spotted this') is not null, 'a Deshi can add a link');
select public.unlink_item_from_project((select id from public.research_item_links where removed_at is null order by id limit 1));
select cpt.ok((select count(*) from public.research_item_links where removed_at is null) = 1, 'unlink sets removed_at, the row stays');
select cpt.ok((select count(*) from public.research_item_links) = 2, 'removed links are kept for the record');
commit;
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b1"}', true);
set local role authenticated;
select public.link_item_to_project((select id from public.research_items), (select id from public.research_projects where slug='epstein-record'), 'related', null);
select public.link_item_to_project((select id from public.research_items), (select id from public.research_projects where slug='elections'), 'related', null);
select public.link_item_to_project((select id from public.research_items), (select id from public.research_projects where slug='policing-and-ice'), 'related', null);
select cpt.ok((select count(*) from public.research_item_links where removed_at is null) = 4, 'four open links');
commit;

------------------------------------------------------------------ AI draft queue
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d1"}', true);
set local role authenticated;
select cpt.fails($$select public.request_claim_draft('Notes that are long enough to pass the length check.', array['https://example.org/a'])$$, 'Author (Submitter)', 'only authors can ask for a draft');
commit;
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b1"}', true);
set local role authenticated;
select cpt.fails($$select public.request_claim_draft('too short', array['https://example.org/a'])$$, 'violates check', 'short notes refused');
select cpt.fails($$select public.request_claim_draft('Notes that are long enough to pass the length check.', array[]::text[])$$, 'between 1 and 5', 'a source is required');
select cpt.fails($$select public.request_claim_draft('Notes that are long enough to pass the length check.', array['javascript:alert(1)'])$$, 'full web link', 'only web links');
select cpt.fails($$select public.request_claim_draft('Notes that are long enough to pass the length check.', array['https://a.org/1','https://a.org/2','https://a.org/3','https://a.org/4','https://a.org/5','https://a.org/6'])$$, 'between 1 and 5', 'at most 5 sources');
select public.request_claim_draft('Deputy training in de-escalation began in 2019. Use of force complaints fell afterward.', array['https://example.org/report']);
select public.request_claim_draft('A second set of notes that is long enough to pass the check.', array['https://example.org/other']);
select cpt.fails($$select public.request_claim_draft('A third set of notes that is long enough to pass the check.', array['https://example.org/x'])$$, 'drafts waiting', 'two waiting drafts at most');
select cpt.fails($$insert into public.claim_drafts (notes, source_urls) values ('direct insert attempt that is long enough', array['https://a.org'])$$, 'permission denied', 'no direct draft inserts');
select cpt.ok((select count(*) from public.claim_drafts) = 2, 'the author sees their drafts');
commit;
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c1"}', true);
set local role authenticated;
select cpt.ok((select count(*) from public.claim_drafts) = 0, 'another author cannot see them');
commit;
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1"}', true);
set local role authenticated;
select cpt.ok((select count(*) from public.claim_drafts) = 0, 'not even an admin reads another member''s draft');
commit;

-- the worker, with the checker key
begin;
set local role anon;
select cpt.fails($$select public.checker_draft_claim('FRAK-' || repeat('b', 64))$$, 'Unknown checker key', 'a wrong key is refused');
select cpt.fails($$select public.checker_draft_claim(null)$$, 'Unknown checker key', 'no key is refused');
select cpt.fails($$select count(*) from public.claim_drafts$$, 'permission denied', 'visitors cannot read drafts');
create temp table job as select public.checker_draft_claim('FRAK-' || repeat('a', 64)) j;
grant all on job to anon;
select cpt.ok((select (j->>'draft_id') is not null and j->>'notes' like 'Deputy%' and jsonb_array_length(j->'urls') = 1 from job), 'the worker gets the oldest job with notes and links');
select cpt.fails($$select public.checker_draft_complete('FRAK-' || repeat('a', 64), (select (j->>'draft_id')::bigint from job), '{"claim":"Vote for the Democrat because it works well here."}'::jsonb, 'm')$$, 'never a candidate or party', 'a party or candidate claim is refused by the database too');
select cpt.fails($$select public.checker_draft_complete('FRAK-' || repeat('a', 64), (select (j->>'draft_id')::bigint from job), '{"claim":"Too short"}'::jsonb, 'm')$$, '10 to 300', 'a tiny claim is refused');
select public.checker_draft_complete('FRAK-' || repeat('a', 64), (select (j->>'draft_id')::bigint from job),
  '{"claim":"After deputies were trained in de-escalation in 2019, use-of-force complaints fell.","summary":"The report says complaints fell after training began.","counterargument":"Other changes happened in the same years.","passages":[{"url":"https://example.org/report","text":"Complaints fell after training."}],"extra":"dropped"}'::jsonb, 'qwen3:8b');
select public.checker_draft_fail('FRAK-' || repeat('a', 64), (select (j->>'draft_id')::bigint from job), 'should not change a done draft');
commit;
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b1"}', true);
set local role authenticated;
select cpt.ok((select status = 'done' and draft ? 'claim' and not draft ? 'extra' and model = 'qwen3:8b' from public.claim_drafts order by id limit 1), 'the author sees the finished draft, extra keys dropped');
select cpt.ok((select count(*) from public.claim_drafts where status = 'queued') = 1, 'the other draft still waits');
commit;

------------------------------------------------------------------ using a draft
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b1"}', true);
set local role authenticated;
insert into public.research_versions (item_id, claim, verdict, summary, body, counterargument, counter_response, methods, limitations, reason_for_change)
select id, 'After deputies were trained in de-escalation in 2019, use-of-force complaints fell by a third.', 'mixed',
       'A short summary here.', 'Evidence evidence evidence evidence.', 'The strongest case against it is long enough.', 'Our answer is here.', 'Read it', 'Limits', 'First version'
  from public.research_items;
select public.mark_claim_draft_used((select id from public.claim_drafts where status = 'done'), (select id from public.research_versions));
select cpt.ok((select claim_changed from public.claim_drafts where status = 'done'), 'the record shows the author changed the claim');
select cpt.fails($$select public.mark_claim_draft_used((select id from public.claim_drafts where status = 'done'), (select id from public.research_versions))$$, 'already used', 'a draft is used once');
select cpt.ok((public.version_ai_note((select id from public.research_versions))->>'claim_changed')::boolean, 'the author can see the flag, not the text');
commit;
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000e1"}', true);
set local role authenticated;
select cpt.ok(public.version_ai_note((select id from public.research_versions)) is not null, 'a Deshi sees that the version began from an AI draft');
select cpt.ok((select count(*) from public.claim_drafts) = 0, 'a Deshi does not see the draft text');
commit;
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d1"}', true);
set local role authenticated;
select cpt.ok(public.version_ai_note((select id from public.research_versions)) is null, 'a plain member sees nothing');
commit;

------------------------------------------------------------------ nothing touches scores
select cpt.ok(not exists (select 1 from pg_depend d join pg_class c on c.oid = d.refobjid
  where d.objid = 'public.claim_drafts'::regclass and c.relname ilike '%score%'), 'claim_drafts has no tie to any score table');
do $$ begin raise notice 'ALL CLAIM PROJECT TESTS PASSED'; end $$;
