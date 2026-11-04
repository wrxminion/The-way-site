-- RUN THIS in the Supabase SQL editor (one paste, safe to run twice). Needs 0091.
-- 0102: The Media Director (the marketing role) can work the social post approval queue.
--   * Reads all posts including drafts. Adds drafts. Edits, approves and marks posts as posted.
--   * Cannot delete posts. Cannot change accounts or handles. Admins keep all they had.
--   * Admins and the Media Director can add drafts marked source llm (the Load AI suggestions button).
--   * The guard trigger is not changed, so approvals and dates still cannot be forged.
drop policy if exists social_posts_read on public.social_posts;
create policy social_posts_read on public.social_posts for select to authenticated
  using (private.has_role('admin') or private.has_role('super_admin') or private.has_role('marketing'));
drop policy if exists social_posts_add on public.social_posts;
create policy social_posts_add on public.social_posts for insert to authenticated
  with check ((private.has_role('admin') or private.has_role('super_admin') or private.has_role('marketing'))
              and created_by = auth.uid() and status = 'draft' and source in ('human','llm'));
drop policy if exists social_posts_edit on public.social_posts;
create policy social_posts_edit on public.social_posts for update to authenticated
  using (private.has_role('admin') or private.has_role('super_admin') or private.has_role('marketing'))
  with check (private.has_role('admin') or private.has_role('super_admin') or private.has_role('marketing'));

select 'marketing reads drafts and edits, cannot delete' as item,
  case when (select qual from pg_policies where schemaname = 'public' and tablename = 'social_posts' and policyname = 'social_posts_read') like '%marketing%'
        and (select qual from pg_policies where schemaname = 'public' and tablename = 'social_posts' and policyname = 'social_posts_edit') like '%marketing%'
        and (select qual from pg_policies where schemaname = 'public' and tablename = 'social_posts' and policyname = 'social_posts_remove') not like '%marketing%'
       then 'ok' else 'FAIL' end as result;
