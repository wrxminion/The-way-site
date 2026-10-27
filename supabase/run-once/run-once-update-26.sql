-- run-once-update-26.sql
-- Run AFTER update 25 is live (its SQL and zip), and upload the update 26 zip right after this.
-- Paste into the Supabase SQL editor and press Run. Safe to run more than once.
-- Published Findings become members only (migration 0009_members_only_findings.sql, Frank: "Lock it").
-- Anonymous visitors can no longer read findings, versions, sources, snapshots, check results or
-- publication events; signed-in active members (and the research desk) read as before.
-- Only read rules change: nothing is written or deleted. The AI checker keeps working (it uses its
-- own functions and upload tickets, which this does not touch).
-- Why the order matters: before update 26, the Findings pages read with the public key, so with
-- this lock they would show "permission denied" until the update 26 zip is up.
begin;
do $$ begin
  if to_regclass('public.case_revision_reports') is null then
    raise exception 'Run run-once-update-25.sql first (this database is missing update 25).';
  end if;
end $$;

revoke select on public.research_items, public.research_versions, public.research_sources,
  public.research_publication_events, public.research_submissions, public.research_source_snapshots from anon;

drop policy if exists research_items_read on public.research_items;
create policy research_items_read on public.research_items for select to authenticated
  using ((published_version_id is not null and private.is_member()) or private.has_role('researcher') or private.has_role('reviewer'));

drop policy if exists research_versions_read on public.research_versions;
create policy research_versions_read on public.research_versions for select to authenticated
  using ((private.version_is_public(id) and private.is_member()) or private.has_role('researcher') or private.has_role('reviewer'));

drop policy if exists research_sources_read on public.research_sources;
create policy research_sources_read on public.research_sources for select to authenticated
  using (((private.version_is_public(version_id) and private.is_member()) or private.has_role('researcher') or private.has_role('reviewer'))
         and not private.source_withdrawn(id));

drop policy if exists research_events_read on public.research_publication_events;
create policy research_events_read on public.research_publication_events for select to authenticated
  using (private.is_member());

drop policy if exists submissions_read on public.research_submissions;
create policy submissions_read on public.research_submissions for select to authenticated
  using ((private.version_is_public(version_id) and private.is_member()) or private.has_role('researcher') or private.has_role('reviewer'));

drop policy if exists snapshots_read on public.research_source_snapshots;
create policy snapshots_read on public.research_source_snapshots for select to authenticated
  using (exists (select 1 from public.research_sources s where s.id = source_id
                  and ((private.version_is_public(s.version_id) and private.is_member()) or private.has_role('researcher') or private.has_role('reviewer'))));
commit;
