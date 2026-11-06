-- 0106: Pull a Thread: no hourly submission limit for staff (Frank, Nov 6 2026). Needs 0030, 0043 and 0088. Safe to run twice.
--   * Members who hold the admin, super_admin or marketing role are no longer stopped by the per-person hourly limit
--     (10 an hour when signed in). Their per-person daily limit (30 a day) and the whole-site limit (150 an hour) stay.
--   * Everyone else keeps the same limits as before: signed in 10 an hour and 30 a day, not signed in 4 an hour and 12 a day.
--   * The role is read from member_roles for the member the Edge Function signed in, so it cannot be claimed from the browser.
--   * Only the one call to the rate check inside private.intake_thread_core changes; the rest of that function is untouched.

do $guard$
begin
  if to_regprocedure('private.thread_rate_ok(text,boolean)') is null
     or to_regprocedure('private.intake_thread_core(text,text,text,text,text,integer,uuid,text)') is null then
    raise exception 'Stop: run 0030 and 0043 first';
  end if;
end $guard$;

-- staff: admin, super_admin or marketing, and an active member
create or replace function private.thread_rate_staff(p_member uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_member is not null and exists (
    select 1 from public.member_roles r join public.members m on m.id = r.member_id
     where r.member_id = p_member and m.status = 'active' and r.role in ('admin','super_admin','marketing'));
$$;

-- Anyone: 4 an hour, 12 a day per key. Signed in: 10 an hour, 30 a day. Staff: no hourly limit, 30 a day. Whole site: 150 an hour.
create or replace function private.thread_rate_ok(p_key text, p_member boolean, p_member_id uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare h int; d int; g int; staff boolean := private.thread_rate_staff(p_member_id);
        hmax int := case when p_member then 10 else 4 end; dmax int := case when p_member then 30 else 12 end;
begin
  perform pg_advisory_xact_lock(hashtext('the_way_thread_rate'), hashtext(p_key));
  delete from public.thread_rate_hits where at < now() - interval '2 days';
  select count(*) filter (where at > now() - interval '1 hour'), count(*) into h, d
    from public.thread_rate_hits where rate_key = p_key and at > now() - interval '1 day';
  select count(*) into g from public.thread_rate_hits where at > now() - interval '1 hour';
  if g >= 150 or (h >= hmax and not staff) or d >= dmax then
    return false;
  end if;
  insert into public.thread_rate_hits (rate_key) values (p_key);
  return true;
end $$;

revoke all on function private.thread_rate_staff(uuid), private.thread_rate_ok(text,boolean,uuid) from public, anon, authenticated;

-- point the intake at the new check, passing the signed-in member
do $swap$
declare v_fn text; v_new text;
begin
  v_fn := pg_get_functiondef('private.intake_thread_core(text,text,text,text,text,integer,uuid,text)'::regprocedure);
  if v_fn like '%thread_rate_ok(p_rate_key, p_member is not null, p_member)%' then
    raise notice 'intake already uses the staff-aware rate check';
  else
    v_new := replace(v_fn, 'private.thread_rate_ok(p_rate_key, p_member is not null)', 'private.thread_rate_ok(p_rate_key, p_member is not null, p_member)');
    if v_new = v_fn then raise exception 'rate check call not found in intake_thread_core; stop and ask'; end if;
    execute v_new;
  end if;
end $swap$;

-- checks: every line should say ok
select 'intake uses the staff-aware rate check' as item,
  case when pg_get_functiondef('private.intake_thread_core(text,text,text,text,text,integer,uuid,text)'::regprocedure)
            like '%thread_rate_ok(p_rate_key, p_member is not null, p_member)%' then 'ok' else 'FAIL' end as result
union all select 'staff roles are admin, super_admin and marketing',
  case when pg_get_functiondef('private.thread_rate_staff(uuid)'::regprocedure) like '%''admin'',''super_admin'',''marketing''%' then 'ok' else 'FAIL' end
union all select 'browser roles cannot call the rate check',
  case when not has_function_privilege('anon', 'private.thread_rate_ok(text,boolean,uuid)', 'execute')
        and not has_function_privilege('authenticated', 'private.thread_rate_ok(text,boolean,uuid)', 'execute') then 'ok' else 'FAIL' end
union all select 'staff members now (no hourly limit)',
  (select count(distinct r.member_id)::text from public.member_roles r join public.members m on m.id = r.member_id
    where m.status = 'active' and r.role in ('admin','super_admin','marketing'));
