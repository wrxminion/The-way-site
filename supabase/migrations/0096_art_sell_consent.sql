-- RUN THIS
-- 0096: optional, separate "you may sell my art" choice on the Submit your art form. Needs 0047. Safe to run twice.
-- Default is NO. Art already sent stays "no" (never sold). Only a person who ticks the separate box is marked yes, and even then
-- nothing is sold from the art until that artist approves the final layout (shirt print, billboard, article and so on).
-- The old nine-argument submit_art() is left alone so the live Edge Function keeps working until the new one is deployed.

do $guard$
begin
  if to_regclass('public.art_submissions') is null then raise exception 'Stop: run 0047 first'; end if;
end $guard$;

alter table public.art_submissions add column if not exists sell_ok boolean not null default false;
comment on column public.art_submissions.sell_ok is 'True only if the artist ticked the separate box that lets The Way sell products made from this art to raise funds, with the artist approving each final layout first. Default false: never sold.';

create or replace function public.submit_art(p_name text, p_email text, p_target text, p_link text, p_portfolio text, p_file_path text,
  p_file_bytes integer, p_note text, p_rate_key text, p_sell_ok boolean) returns text
language plpgsql security definer set search_path = '' as $$
declare v_receipt text := public.submit_art(p_name, p_email, p_target, p_link, p_portfolio, p_file_path, p_file_bytes, p_note, p_rate_key);
begin
  if coalesce(p_sell_ok, false) then
    update public.art_submissions set sell_ok = true where receipt = v_receipt;
  end if;
  return v_receipt;
end $$;
revoke all on function public.submit_art(text,text,text,text,text,text,integer,text,text,boolean) from public, anon, authenticated;
grant execute on function public.submit_art(text,text,text,text,text,text,integer,text,text,boolean) to service_role;

-- Check: all lines must say ok.
select 'sell_ok column exists' as item, case when exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'art_submissions' and column_name = 'sell_ok') then 'ok' else 'FAIL' end as result
union all select 'anon cannot call new', case when not has_function_privilege('anon', 'public.submit_art(text,text,text,text,text,text,integer,text,text,boolean)', 'execute') then 'ok' else 'FAIL' end
union all select 'no existing art is marked sellable', case when not exists (select 1 from public.art_submissions where sell_ok and created_at < now() - interval '1 minute') then 'ok' else 'CHECK' end;
