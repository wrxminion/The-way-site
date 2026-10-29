-- RUN THIS
-- 0049: add a "Researcher" rank. In the database it is stored as 'source_checker', because 'researcher' is already the Author (Submitter) rank.
-- The rank carries no new power by itself. It marks a member who reviews items marked "needs review" and checks their sources. Deshi still publish.
-- Safe to run twice. It widens the existing role check by reading the current list, so it keeps every role already allowed (editor, super_admin, etc.).

do $$
declare v_def text; v_new text;
begin
  select pg_get_constraintdef(c.oid) into v_def
    from pg_constraint c where c.conrelid = 'public.member_roles'::regclass and c.conname = 'member_roles_role_check';
  if v_def is null then raise exception 'member_roles_role_check not found; stop and ask'; end if;
  if v_def like '%source_checker%' then
    raise notice 'already allowed';
  else
    v_new := regexp_replace(v_def, '\)\)\s*$', ', ''source_checker''::text]))');
    if v_new = v_def then
      v_new := regexp_replace(v_def, '\)\s*$', ' or role = ''source_checker'')');
    end if;
    alter table public.member_roles drop constraint member_roles_role_check;
    execute 'alter table public.member_roles add constraint member_roles_role_check ' || v_new;
  end if;
end $$;

-- Check: all lines must say ok.
select 'role check allows source_checker' as item,
  case when (select pg_get_constraintdef(oid) from pg_constraint where conrelid = 'public.member_roles'::regclass and conname = 'member_roles_role_check') like '%source_checker%' then 'ok' else 'FAIL' end as result
union all select 'role check still allows reviewer and admin',
  case when (select pg_get_constraintdef(oid) from pg_constraint where conrelid = 'public.member_roles'::regclass and conname = 'member_roles_role_check') like '%reviewer%'
        and (select pg_get_constraintdef(oid) from pg_constraint where conrelid = 'public.member_roles'::regclass and conname = 'member_roles_role_check') like '%admin%' then 'ok' else 'FAIL' end
union all select 'set_role function accepts it (read this row)',
  case when (select pg_get_functiondef('public.set_role(uuid,text,boolean,text)'::regprocedure)) like '%source_checker%' then 'ok' else 'NOT YET: set_role has its own role list, send this row to Claude' end;
