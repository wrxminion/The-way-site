-- RUN THIS in the Supabase SQL editor (one paste, safe to run twice). Needs 0028, 0049 and 0087.
-- 0088: a "marketing" role. It can read the site analytics numbers and nothing else.
--   * member_roles accepts 'marketing' (the role check is replaced by an explicit list of every role in use, plus marketing).
--   * set_role accepts 'marketing' (its role list is read and widened; the admin checks in it stay as they are).
--   * the two site stats tables are readable by marketing as well as super admins (daily counts only: no IP
--     addresses, no visitor rows, no member data). site_stats_top is security invoker, so it follows.
--   * a small table, marketing_ideas, for the Media page's suggested ideas list (marketing reads, admins write).
-- Not changed: study_usage_totals (ballot study totals) stays super admin only. Marketing gets no access to ballot
-- picks, member data, reviewer queues, invitations, the notify list or role changes.
-- Nobody is given the role here. Assign it later from Admin > Members.

do $$
declare v_def text; v_fn text; v_fn_new text;
begin
  select pg_get_constraintdef(c.oid) into v_def
    from pg_constraint c where c.conrelid = 'public.member_roles'::regclass and c.conname = 'member_roles_role_check';
  if v_def is null then raise exception 'member_roles_role_check not found; stop and ask'; end if;
  if v_def like '%marketing%' then
    raise notice 'role check already allows marketing';
  else
    alter table public.member_roles drop constraint member_roles_role_check;
    alter table public.member_roles add constraint member_roles_role_check check (role in
      ('moderator','researcher','reviewer','admin','scholar','journalist','super_admin','editor','source_checker','marketing'));
  end if;

  v_fn := pg_get_functiondef('public.set_role(uuid,text,boolean,text)'::regprocedure);
  if v_fn like '%marketing%' then
    raise notice 'set_role already allows marketing';
  else
    v_fn_new := regexp_replace(v_fn, 'not in \(([^)]*)\)', 'not in (\1,''marketing'')');
    if v_fn_new = v_fn then raise exception 'set_role role list not found; stop and ask'; end if;
    execute v_fn_new;
  end if;
end $$;

drop policy if exists site_stats_daily_read on public.site_stats_daily;
create policy site_stats_daily_read on public.site_stats_daily for select to authenticated
  using (private.has_role('super_admin') or private.has_role('marketing'));
drop policy if exists site_stats_meta_read on public.site_stats_meta;
create policy site_stats_meta_read on public.site_stats_meta for select to authenticated
  using (private.has_role('super_admin') or private.has_role('marketing'));

-- Suggested marketing ideas (Admin > Media). A plain list of short text notes: no member data, no personal details.
-- Read by marketing, admins and super admins. Written (add, edit, delete) by admins and super admins only.
create table if not exists public.marketing_ideas (
  id         bigint generated always as identity primary key,
  body       text not null check (char_length(btrim(body)) between 3 and 500 and body !~ '[<>]'),
  created_by uuid references public.members(id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create or replace function private.marketing_ideas_touch() returns trigger
language plpgsql as $fn$ begin new.updated_at := now(); return new; end $fn$;
drop trigger if exists marketing_ideas_touch on public.marketing_ideas;
create trigger marketing_ideas_touch before update on public.marketing_ideas
  for each row execute function private.marketing_ideas_touch();
alter table public.marketing_ideas enable row level security;
revoke all on public.marketing_ideas from anon, authenticated;
grant select, insert, update, delete on public.marketing_ideas to authenticated;
drop policy if exists marketing_ideas_read on public.marketing_ideas;
create policy marketing_ideas_read on public.marketing_ideas for select to authenticated
  using (private.has_role('marketing') or private.has_role('super_admin'));
drop policy if exists marketing_ideas_add on public.marketing_ideas;
create policy marketing_ideas_add on public.marketing_ideas for insert to authenticated
  with check ((private.has_role('admin') or private.has_role('super_admin')) and created_by = auth.uid());
drop policy if exists marketing_ideas_edit on public.marketing_ideas;
create policy marketing_ideas_edit on public.marketing_ideas for update to authenticated
  using (private.has_role('admin') or private.has_role('super_admin'))
  with check (private.has_role('admin') or private.has_role('super_admin'));
drop policy if exists marketing_ideas_remove on public.marketing_ideas;
create policy marketing_ideas_remove on public.marketing_ideas for delete to authenticated
  using (private.has_role('admin') or private.has_role('super_admin'));

-- Check: all lines must say ok.
select 'role check allows marketing and keeps the others' as item,
  case when (select pg_get_constraintdef(oid) from pg_constraint where conrelid = 'public.member_roles'::regclass and conname = 'member_roles_role_check') like '%marketing%'
        and (select pg_get_constraintdef(oid) from pg_constraint where conrelid = 'public.member_roles'::regclass and conname = 'member_roles_role_check') like '%super_admin%'
        and (select pg_get_constraintdef(oid) from pg_constraint where conrelid = 'public.member_roles'::regclass and conname = 'member_roles_role_check') like '%reviewer%' then 'ok' else 'FAIL' end as result
union all select 'set_role accepts marketing',
  case when pg_get_functiondef('public.set_role(uuid,text,boolean,text)'::regprocedure) like '%marketing%' then 'ok' else 'FAIL' end
union all select 'stats tables readable by marketing',
  case when (select count(*) from pg_policies where schemaname = 'public' and tablename in ('site_stats_daily','site_stats_meta') and qual like '%marketing%') = 2 then 'ok' else 'FAIL' end
union all select 'ballot study totals still super admin only',
  case when pg_get_functiondef('public.study_usage_totals()'::regprocedure) not like '%marketing%' then 'ok' else 'FAIL' end
union all select 'ideas table: 4 policies, read by marketing, write needs admin',
  case when (select count(*) from pg_policies where schemaname = 'public' and tablename = 'marketing_ideas') = 4
        and (select count(*) from pg_policies where schemaname = 'public' and tablename = 'marketing_ideas' and cmd <> 'SELECT' and coalesce(qual, '') || coalesce(with_check, '') like '%marketing%') = 0 then 'ok' else 'FAIL' end
union all select 'nobody holds the role yet',
  case when (select count(*) from public.member_roles where role = 'marketing') = 0 then 'ok' else 'note: ' || (select count(*) from public.member_roles where role = 'marketing') || ' member(s) hold it' end;
