-- RUN THIS
-- 0097: when an artist says yes to selling (0096), they also choose how to handle their share. Needs 0096. Safe to run twice.
-- sell_share is 'share' (the artist would like a share of what the art earns, with the amount agreed in writing before anything is sold)
-- or 'donate' (the artist donates their share to the wildlife fund The Way is featuring at the time; the fund rotates). It is set only when sell_ok is true. No amount or payment is promised here.
-- The ten-argument submit_art() from 0096 is left alone so the live Edge Function keeps working until the new one is deployed.

do $guard$
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'art_submissions' and column_name = 'sell_ok') then
    raise exception 'Stop: run 0096 first';
  end if;
end $guard$;

alter table public.art_submissions add column if not exists sell_share text;
do $c$ begin
  if not exists (select 1 from pg_constraint where conname = 'art_submissions_sell_share_ok') then
    alter table public.art_submissions add constraint art_submissions_sell_share_ok
      check (sell_share is null or (sell_ok and sell_share in ('share', 'donate')));
  end if;
end $c$;
comment on column public.art_submissions.sell_share is 'Only when sell_ok: share = the artist would like a share of what the art earns, amount agreed in writing before anything is sold; donate = the artist donates their share to the wildlife fund The Way is featuring at the time (the fund rotates). Null otherwise.';

create or replace function public.submit_art(p_name text, p_email text, p_target text, p_link text, p_portfolio text, p_file_path text,
  p_file_bytes integer, p_note text, p_rate_key text, p_sell_ok boolean, p_sell_share text) returns text
language plpgsql security definer set search_path = '' as $$
declare v_receipt text;
begin
  if coalesce(p_sell_ok, false) and (p_sell_share is null or p_sell_share not in ('share', 'donate')) then
    raise exception 'Please choose whether you would like a share or donate it.' using errcode = '22023';
  end if;
  v_receipt := public.submit_art(p_name, p_email, p_target, p_link, p_portfolio, p_file_path, p_file_bytes, p_note, p_rate_key, coalesce(p_sell_ok, false));
  if coalesce(p_sell_ok, false) then
    update public.art_submissions set sell_share = p_sell_share where receipt = v_receipt;
  end if;
  return v_receipt;
end $$;
revoke all on function public.submit_art(text,text,text,text,text,text,integer,text,text,boolean,text) from public, anon, authenticated;
grant execute on function public.submit_art(text,text,text,text,text,text,integer,text,text,boolean,text) to service_role;

-- Check: all lines must say ok.
select 'sell_share column exists' as item, case when exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'art_submissions' and column_name = 'sell_share') then 'ok' else 'FAIL' end as result
union all select 'anon cannot call new', case when not has_function_privilege('anon', 'public.submit_art(text,text,text,text,text,text,integer,text,text,boolean,text)', 'execute') then 'ok' else 'FAIL' end
union all select 'no sell_share without sell_ok', case when not exists (select 1 from public.art_submissions where sell_share is not null and not sell_ok) then 'ok' else 'FAIL' end;
