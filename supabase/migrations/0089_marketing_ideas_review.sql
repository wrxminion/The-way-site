-- RUN THIS in the Supabase SQL editor (one paste, safe to run twice). Needs 0088.
-- 0089: Suggested marketing ideas get a review step.
--   * New columns on marketing_ideas: status ('draft' or 'approved'), source ('human' or 'llm'), reason (max 300 characters).
--     Ideas that already exist stay visible: they become 'approved'. New rows default to 'draft'.
--   * Marketing, admins and super admins may ADD ideas, but a person adding one always makes a draft with source 'human'.
--     Marketing may edit only its own drafts, and cannot approve (status must stay 'draft').
--   * Admins and super admins may add, edit, approve and delete anything.
--   * Suggestions from an assistant arrive only as status 'draft' and source 'llm', through a step Frank runs in the SQL editor.
--     The browser cannot make a source 'llm' row, because the add policy requires source 'human'.
-- Plain text only: no angle brackets in any text column. No member data is stored here. No existing function is changed.

alter table public.marketing_ideas add column if not exists status text not null default 'approved';
alter table public.marketing_ideas add column if not exists source text not null default 'human';
alter table public.marketing_ideas add column if not exists reason text;
alter table public.marketing_ideas alter column status set default 'draft';

alter table public.marketing_ideas drop constraint if exists marketing_ideas_status_check;
alter table public.marketing_ideas add constraint marketing_ideas_status_check check (status in ('draft','approved'));
alter table public.marketing_ideas drop constraint if exists marketing_ideas_source_check;
alter table public.marketing_ideas add constraint marketing_ideas_source_check check (source in ('human','llm'));
alter table public.marketing_ideas drop constraint if exists marketing_ideas_reason_check;
alter table public.marketing_ideas add constraint marketing_ideas_reason_check
  check (reason is null or (char_length(reason) <= 300 and reason !~ '[<>]'));

-- Read: marketing, admins and super admins (the Media page shows approved ideas first and drafts on a second tab).
drop policy if exists marketing_ideas_read on public.marketing_ideas;
create policy marketing_ideas_read on public.marketing_ideas for select to authenticated
  using (private.has_role('marketing') or private.has_role('super_admin'));

-- Add: marketing and admins add drafts of their own. An admin may also add an idea already approved. Never source 'llm'.
drop policy if exists marketing_ideas_add on public.marketing_ideas;
create policy marketing_ideas_add on public.marketing_ideas for insert to authenticated
  with check (
    (private.has_role('marketing') or private.has_role('super_admin'))
    and created_by = auth.uid() and source = 'human'
    and (status = 'draft' or private.has_role('admin') or private.has_role('super_admin')));

-- Edit: an admin or super admin edits anything and may approve. Marketing edits only its own drafts and they stay drafts.
drop policy if exists marketing_ideas_edit on public.marketing_ideas;
create policy marketing_ideas_edit on public.marketing_ideas for update to authenticated
  using (
    private.has_role('admin') or private.has_role('super_admin')
    or (private.has_role('marketing') and created_by = auth.uid() and status = 'draft' and source = 'human'))
  with check (
    private.has_role('admin') or private.has_role('super_admin')
    or (private.has_role('marketing') and created_by = auth.uid() and status = 'draft' and source = 'human'));

-- Delete: admins and super admins only.
drop policy if exists marketing_ideas_remove on public.marketing_ideas;
create policy marketing_ideas_remove on public.marketing_ideas for delete to authenticated
  using (private.has_role('admin') or private.has_role('super_admin'));

-- Check: all lines must say ok.
select 'columns status, source, reason exist' as item,
  case when (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'marketing_ideas'
              and column_name in ('status','source','reason')) = 3 then 'ok' else 'FAIL' end as result
union all select 'new rows default to draft',
  case when (select column_default from information_schema.columns where table_schema = 'public' and table_name = 'marketing_ideas' and column_name = 'status') like '%draft%' then 'ok' else 'FAIL' end
union all select 'status, source and reason checks in place',
  case when (select count(*) from pg_constraint where conrelid = 'public.marketing_ideas'::regclass
              and conname in ('marketing_ideas_status_check','marketing_ideas_source_check','marketing_ideas_reason_check')) = 3 then 'ok' else 'FAIL' end
union all select 'no idea is left without a valid status',
  case when (select count(*) from public.marketing_ideas where status not in ('draft','approved')) = 0 then 'ok' else 'FAIL' end
union all select 'four policies on the table',
  case when (select count(*) from pg_policies where schemaname = 'public' and tablename = 'marketing_ideas') = 4 then 'ok' else 'FAIL' end
union all select 'marketing can add but not delete',
  case when (select count(*) from pg_policies where schemaname = 'public' and tablename = 'marketing_ideas' and policyname = 'marketing_ideas_add' and with_check like '%marketing%') = 1
        and (select count(*) from pg_policies where schemaname = 'public' and tablename = 'marketing_ideas' and policyname = 'marketing_ideas_remove' and qual like '%marketing%') = 0 then 'ok' else 'FAIL' end
union all select 'browser adds must be source human',
  case when (select with_check from pg_policies where schemaname = 'public' and tablename = 'marketing_ideas' and policyname = 'marketing_ideas_add') like '%human%' then 'ok' else 'FAIL' end
union all select 'marketing edits only its own drafts',
  case when (select qual from pg_policies where schemaname = 'public' and tablename = 'marketing_ideas' and policyname = 'marketing_ideas_edit') like '%draft%'
        and (select qual from pg_policies where schemaname = 'public' and tablename = 'marketing_ideas' and policyname = 'marketing_ideas_edit') like '%created_by%' then 'ok' else 'FAIL' end;
