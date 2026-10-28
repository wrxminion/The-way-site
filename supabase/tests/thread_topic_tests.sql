-- Tests for 0043 (topic fit for Pull a Thread scores). Run after the usual migrations plus 0043 on a throwaway Postgres with the Supabase stub.
\set ON_ERROR_STOP 1
\set QUIET 1
create schema if not exists ttt;
grant usage on schema ttt to anon, authenticated, service_role;
create or replace function ttt.ok(cond boolean, what text) returns void language plpgsql as $$
begin if cond is not true then raise exception 'FAIL: %', what; end if; raise notice 'pass: %', what; end $$;
insert into public.research_projects (slug, title, description, active) values
  ('epstein-test', 'The Epstein record', 'What the public court records and flight logs say', true) on conflict (slug) do update set title = excluded.title, description = excluded.description, active = true;
grant select on public.thread_intakes to service_role;
grant execute on all functions in schema ttt to service_role;
set role service_role;
-- the sender's words that wrongly scored +15 before: nothing about Epstein in them
select public.intake_thread('question', null, 'Jo bob sent me this website. Is there anything about iran contra? what was the public perception during that event', null, null, null, null, repeat('1', 64));
select ttt.ok((select count(*) from public.thread_intakes i where i.question like '%iran contra%' and i.project_id is null and not exists (select 1 from jsonb_array_elements(i.base_parts) p where p->>'key' = 'topic')) = 1,
  'an Iran-Contra question does not get the Epstein project fit');
select public.intake_thread('question', null, 'What do the flight logs say about Epstein and who flew with him?', null, null, null, null, repeat('2', 64));
select ttt.ok((select count(*) from public.thread_intakes i where i.question like '%Epstein and who flew%' and i.base_parts::text like '%The Epstein record%') = 1,
  'a question that names Epstein still fits the Epstein project');
reset role;
do $$ begin raise notice 'ALL PASSED'; end $$;
