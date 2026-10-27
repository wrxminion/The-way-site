-- The Way: published Findings are for members only (Frank, Oct 15 2026: "Lock it").
-- Before: anyone with the public key could read published findings, their versions, sources,
-- source snapshots, check results and publication events. After: only signed-in active members
-- (and the research desk, as before). Only read access changes; nothing is written or deleted.
-- The AI checker is unaffected: it uses its own security-definer functions and upload tickets.

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
