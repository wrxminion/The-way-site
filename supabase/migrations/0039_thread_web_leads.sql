-- 0039: unchecked web leads for a sent Pull a Thread request.
-- After a request is SENT (never a draft), the archiver's computer searches the public web for sources and hands them back as
-- "unchecked leads". Reviewers mark each lead verified or rejected, with a reason. The sender sees unchecked and verified leads
-- through their code, always labelled. Leads are never shown on a public page. The excerpt is copied by code from the page the
-- archiver fetched; no model writes it. Independent of 0038 (matcher): new table, new columns, new functions only.
-- Needs 0030 to 0037.

alter table public.thread_intakes add column if not exists leads_status text not null default 'none' check (leads_status in ('none','pending','running','done','failed'));
alter table public.thread_intakes add column if not exists leads_claimed_at timestamptz;
alter table public.thread_intakes add column if not exists leads_tries int not null default 0;

create table if not exists public.thread_leads (
  id          bigint generated always as identity primary key,
  intake_id   bigint not null references public.thread_intakes(id),
  url         text not null check (url ~ '^https://[^/\s]+\.[^/\s]+' and char_length(url) <= 1000 and url !~ '^https://(localhost|[0-9.]+|\[)'),
  title       text not null check (char_length(title) <= 200),
  excerpt     text not null check (char_length(excerpt) between 1 and 600),
  archive_sha text check (archive_sha ~ '^[0-9a-f]{64}$'),
  state       text not null default 'unchecked' check (state in ('unchecked','verified','rejected')),
  found_at    timestamptz not null default now(),
  reviewed_by uuid references public.members(id),
  reviewed_at timestamptz,
  unique (intake_id, url)
);
comment on table public.thread_leads is 'AI-found web sources for a sent request. Unchecked until a human reviewer verifies or rejects them. Never public.';
create index if not exists thread_leads_item on public.thread_leads (intake_id, id);
revoke all on public.thread_leads from public, anon, authenticated;
alter table public.thread_leads enable row level security;

create table if not exists public.thread_lead_reviews (
  id        bigint generated always as identity primary key,
  lead_id   bigint not null references public.thread_leads(id),
  member_id uuid not null references public.members(id),
  verdict   text not null check (verdict in ('verified','rejected')),
  reason    text not null check (char_length(btrim(reason)) between 5 and 300),
  created_at timestamptz not null default now()
);
comment on table public.thread_lead_reviews is 'Append-only log of reviewer verdicts on web leads.';
revoke all on public.thread_lead_reviews from public, anon, authenticated;
alter table public.thread_lead_reviews enable row level security;
drop trigger if exists thread_lead_reviews_append_only on public.thread_lead_reviews;
create trigger thread_lead_reviews_append_only before update or delete on public.thread_lead_reviews for each row execute function private.forbid_change();
drop trigger if exists thread_lead_reviews_no_truncate on public.thread_lead_reviews;
create trigger thread_lead_reviews_no_truncate before truncate on public.thread_lead_reviews for each statement execute function private.forbid_change();
drop trigger if exists thread_lead_reviews_audit on public.thread_lead_reviews;
create trigger thread_lead_reviews_audit after insert on public.thread_lead_reviews for each row execute function private.audit();

-- a request that is sent waits for its leads; a draft, expired or discarded request never does
create or replace function private.thread_leads_flag() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.leads_status := case when new.status = 'draft' then 'none' else 'pending' end;
  elsif old.status = 'draft' and new.status in ('queued','matched') then
    new.leads_status := 'pending';
  end if;
  if new.status in ('expired','discarded') then new.leads_status := 'none'; end if;
  return new;
end $$;
drop trigger if exists thread_intakes_leads_flag on public.thread_intakes;
create trigger thread_intakes_leads_flag before insert or update on public.thread_intakes for each row execute function private.thread_leads_flag();
update public.thread_intakes set leads_status = 'pending' where leads_status = 'none' and status in ('queued','matched','in_review');

-- ---------------------------------------------------------------- the archiver's computer
-- Gives the computer only the text it needs to make a short search phrase: the same text the preliminary answer uses (already
-- redacted when the sender asked for it). Never the note, the receipt, the email or the picture.
create or replace function public.checker_thread_leads_next(checker_key text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare t public.thread_intakes; txt text;
begin
  perform private.checker_key_id(checker_key);
  update public.thread_intakes set leads_status = 'failed'
   where leads_status = 'running' and leads_claimed_at < now() - interval '15 minutes' and leads_tries >= 2;
  select * into t from public.thread_intakes x
   where (x.leads_status = 'pending' or (x.leads_status = 'running' and x.leads_claimed_at < now() - interval '15 minutes'))
     and x.status in ('queued','matched','in_review') and (x.kind <> 'url' or x.enrich_status in ('done','failed','skipped'))
     and (x.kind <> 'screenshot' or x.ocr_status in ('done','failed','skipped'))
   order by x.id limit 1 for update skip locked;
  if t.id is null then return null; end if;
  update public.thread_intakes set leads_status = 'running', leads_claimed_at = now(), leads_tries = leads_tries + 1 where id = t.id;
  txt := case t.kind when 'question' then t.question when 'url' then coalesce(t.page_title, '') || '. ' || coalesce(t.excerpt, '')
                     else coalesce(t.ocr_text_fixed, t.ocr_text, '') end;
  return jsonb_build_object('intake_id', t.id, 'kind', t.kind, 'text', left(coalesce(txt, ''), 2000));
end $$;

-- leads: [{"url","title","excerpt","archive_sha"}] at most 8. The database checks the shape; the computer already fetched each page
-- through the guarded fetcher and copied the excerpt from it.
create or replace function public.checker_thread_leads_done(checker_key text, intake_id bigint, leads jsonb)
returns int language plpgsql security definer set search_path = '' as $$
declare t public.thread_intakes; l jsonb; n int := 0;
begin
  perform private.checker_key_id(checker_key);
  select * into t from public.thread_intakes x where x.id = checker_thread_leads_done.intake_id and x.leads_status = 'running' for update;
  if t.id is null then raise exception 'Those leads are not being made' using errcode = '42501'; end if;
  if jsonb_typeof(leads) is distinct from 'array' then raise exception 'leads must be a list' using errcode = '22023'; end if;
  for l in select * from jsonb_array_elements(leads) limit 8 loop
    begin
      insert into public.thread_leads (intake_id, url, title, excerpt, archive_sha)
      values (t.id, btrim(l->>'url'), left(btrim(coalesce(l->>'title', '')), 200), left(btrim(coalesce(l->>'excerpt', '')), 600), nullif(l->>'archive_sha', ''))
      on conflict on constraint thread_leads_intake_id_url_key do nothing;
      if found then n := n + 1; end if;
    exception when check_violation then null;   -- a malformed lead is dropped, the rest are kept
    end;
  end loop;
  update public.thread_intakes set leads_status = 'done' where id = t.id;
  return n;
end $$;

create or replace function public.checker_thread_leads_fail(checker_key text, intake_id bigint, note text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.checker_key_id(checker_key);
  update public.thread_intakes x set leads_status = 'failed' where x.id = checker_thread_leads_fail.intake_id and x.leads_status = 'running';
end $$;

-- ---------------------------------------------------------------- the sender (code only), reviewers
-- Rejected leads are hidden from the sender. Verified ones are marked as checked by a person.
create or replace function public.thread_leads(p_receipt text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare t public.thread_intakes;
begin
  select * into t from public.thread_intakes where receipt_hash = encode(extensions.digest(btrim(coalesce(p_receipt, '')), 'sha256'), 'hex');
  if t.id is null or t.status in ('draft','expired','discarded') then return null; end if;
  return jsonb_build_object('status', t.leads_status,
    'leads', coalesce((select jsonb_agg(jsonb_build_object('url', l.url, 'title', l.title, 'excerpt', l.excerpt, 'checked', l.state = 'verified') order by l.id)
                         from public.thread_leads l where l.intake_id = t.id and l.state <> 'rejected'), '[]'::jsonb));
end $$;

create or replace function public.thread_leads_for_review(p_intake bigint) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.may_triage() then raise exception 'Not allowed: reviewers only' using errcode = '42501'; end if;
  return jsonb_build_object('status', (select leads_status from public.thread_intakes where id = p_intake),
    'leads', coalesce((select jsonb_agg(jsonb_build_object('id', l.id, 'url', l.url, 'title', l.title, 'excerpt', l.excerpt, 'state', l.state,
                                                           'archived', l.archive_sha is not null) order by l.id)
                         from public.thread_leads l where l.intake_id = p_intake), '[]'::jsonb));
end $$;

create or replace function public.thread_lead_review(p_lead bigint, p_verdict text, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare l public.thread_leads; t public.thread_intakes; r text := nullif(btrim(p_reason), '');
begin
  if not private.may_triage() then raise exception 'Not allowed: reviewers only' using errcode = '42501'; end if;
  select * into l from public.thread_leads where id = p_lead for update;
  if l.id is null then raise exception 'No such lead' using errcode = '22023'; end if;
  select * into t from public.thread_intakes where id = l.intake_id;
  if t.status <> 'in_review' or t.claimed_by is distinct from auth.uid() then raise exception 'Pick this item first' using errcode = '42501'; end if;
  if p_verdict not in ('verified','rejected') then raise exception 'Choose verified or rejected' using errcode = '22023'; end if;
  if r is null or char_length(r) not between 5 and 300 then raise exception 'Say why (5 to 300 characters)' using errcode = '22023'; end if;
  insert into public.thread_lead_reviews (lead_id, member_id, verdict, reason) values (l.id, auth.uid(), p_verdict, r);
  update public.thread_leads set state = p_verdict, reviewed_by = auth.uid(), reviewed_at = now() where id = l.id;
end $$;

revoke all on function private.thread_leads_flag(), public.checker_thread_leads_next(text), public.checker_thread_leads_done(text,bigint,jsonb),
  public.checker_thread_leads_fail(text,bigint,text), public.thread_leads(text), public.thread_leads_for_review(bigint), public.thread_lead_review(bigint,text,text)
  from public, anon, authenticated;
grant execute on function public.checker_thread_leads_next(text), public.checker_thread_leads_done(text,bigint,jsonb), public.checker_thread_leads_fail(text,bigint,text) to anon, authenticated;   -- guarded by the checker key
grant execute on function public.thread_leads(text) to anon, authenticated, service_role;
grant execute on function public.thread_leads_for_review(bigint), public.thread_lead_review(bigint,text,text) to authenticated;
