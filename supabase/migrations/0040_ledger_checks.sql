-- The Way 0040: "Live, checked by a person" marks for the public Development Ledger. Needs 0001.
-- Admins tick rows on Admin > Ledger checks. A scheduled GitHub Action reads public.ledger_checks_public() with the
-- site's public key and writes the answer to the ledger-data branch, which the ledger page reads. Only row ids and
-- true/false are stored: no names, no times shown, nobody is credited. Safe to run again.
do $guard$
begin
  if to_regprocedure('private.has_role(text)') is null then raise exception 'Stop: run 0001 first'; end if;
end $guard$;

create table if not exists public.ledger_checks (
  row_id text primary key check (row_id ~ '^(D[0-9]{3}|PR[0-9]{1,6})$'),
  checked boolean not null,
  updated_at timestamptz not null default now()
);
alter table public.ledger_checks enable row level security;
revoke all on public.ledger_checks from anon, authenticated;

create or replace function public.ledger_checks_public() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'checked', coalesce(jsonb_agg(row_id order by row_id) filter (where checked), '[]'::jsonb),
    'unchecked', coalesce(jsonb_agg(row_id order by row_id) filter (where not checked), '[]'::jsonb))
  from public.ledger_checks;
$$;
revoke all on function public.ledger_checks_public() from public;
grant execute on function public.ledger_checks_public() to anon, authenticated;

create or replace function public.ledger_check_set(p_row text, p_checked boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.has_role('admin') then raise exception 'Not allowed: admins only' using errcode = '42501'; end if;
  if p_row is null or p_row !~ '^(D[0-9]{3}|PR[0-9]{1,6})$' then raise exception 'Bad ledger row id'; end if;
  insert into public.ledger_checks (row_id, checked) values (p_row, p_checked)
    on conflict (row_id) do update set checked = excluded.checked, updated_at = now();
end $$;
revoke all on function public.ledger_check_set(text, boolean) from public, anon;
grant execute on function public.ledger_check_set(text, boolean) to authenticated;

-- Check: both lines must say ok.
select 'ledger_checks_public' as item, case when public.ledger_checks_public() is not null then 'ok' else 'FAIL' end as result
union all select 'anon cannot set', case when not has_function_privilege('anon', 'public.ledger_check_set(text,boolean)', 'execute') then 'ok' else 'FAIL' end;
