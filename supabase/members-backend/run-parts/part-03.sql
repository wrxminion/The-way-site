-- The Way members setup, part 3 of 7. Run parts in order. Safe to run again.
create or replace function public.case_review_history(case_slug text default null, max_rows int default 200)
returns table (id bigint, case_slug text, event_type text, claim_text text, note text, created_at timestamptz, reviewer text)
language sql stable security definer set search_path = '' as $$
  select e.id, e.case_slug, e.event_type, e.claim_text, e.note, e.created_at, 'a reviewer'::text
    from public.case_review_events e
   where case_review_history.case_slug is null or e.case_slug = case_review_history.case_slug
   order by e.id desc
   limit greatest(1, least(coalesce(max_rows, 200), 500));
$$;

revoke all on function public.review_case_claim(text, text, text, text, text), public.review_case(text, text, text),
  public.case_review_status(), public.case_review_history(text, int) from public, anon, authenticated;

grant execute on function public.review_case_claim(text, text, text, text, text), public.review_case(text, text, text) to authenticated;

grant execute on function public.case_review_status(), public.case_review_history(text, int) to anon, authenticated;

create table if not exists public.claim_reviews (
  id               bigint generated always as identity primary key,
  case_slug        text not null check (case_slug ~ '^[a-z0-9-]{2,80}$'),
  claim_key        text not null check (claim_key ~ '^[0-9a-f]{10}$'),
  claim_text       text not null check (char_length(btrim(claim_text)) between 3 and 1000),
  source_label     text not null check (char_length(btrim(source_label)) between 2 and 300),
  source_url       text check (source_url is null or (source_url ~* '^https?://[^[:space:]]+$' and char_length(source_url) <= 1000)),
  source_access    text not null check (source_access in ('opened','inaccessible','questioned')),
  verdict          text not null check (verdict in ('supported','partially_supported','contradicted','insufficient_evidence','inaccessible','pending')),
  evidence_passage text check (evidence_passage is null or char_length(btrim(evidence_passage)) between 3 and 1500),
  rationale        text check (rationale is null or char_length(btrim(rationale)) between 3 and 2000),
  flags            text[] not null default '{}' check (flags <@ array['needs_second_look','source_conflict','possible_error','outdated','other']::text[]),
  review_mode      text not null default 'independent' check (review_mode in ('independent','collaborative')),
  supersedes_id    bigint references public.claim_reviews(id),
  reviewer_id      uuid not null references public.members(id),
  created_at       timestamptz not null default now(),
    check (verdict in ('pending','inaccessible') or rationale is not null),
  check (verdict not in ('supported','partially_supported','contradicted') or evidence_passage is not null),
    check ((verdict = 'inaccessible') = (source_access = 'inaccessible') or verdict = 'pending'),
  check (verdict <> 'inaccessible' or rationale is not null)
);

create index if not exists claim_reviews_claim on public.claim_reviews (case_slug, claim_key, id);

create index if not exists claim_reviews_reviewer on public.claim_reviews (reviewer_id, case_slug);

create unique index if not exists claim_reviews_one_successor on public.claim_reviews (supersedes_id) where supersedes_id is not null;

revoke all on public.claim_reviews from public, anon, authenticated;

grant select on public.claim_reviews to authenticated;

alter table public.claim_reviews enable row level security;

drop policy if exists claim_reviews_read on public.claim_reviews;

create policy claim_reviews_read on public.claim_reviews for select to authenticated
  using (reviewer_id = auth.uid() or private.has_role('admin'));

drop trigger if exists claim_reviews_append_only on public.claim_reviews;

create trigger claim_reviews_append_only before update or delete on public.claim_reviews
  for each row execute function private.forbid_change();

drop trigger if exists claim_reviews_no_truncate on public.claim_reviews;

create trigger claim_reviews_no_truncate before truncate on public.claim_reviews
  for each statement execute function private.forbid_change();

drop trigger if exists claim_reviews_audit on public.claim_reviews;

create trigger claim_reviews_audit after insert on public.claim_reviews
  for each row execute function private.audit();

create or replace view private.claim_reviews_current as
  select r.* from public.claim_reviews r
   where not exists (select 1 from public.claim_reviews n where n.supersedes_id = r.id);

create or replace view private.claim_reviewer_numbers as
  select case_slug, reviewer_id,
         dense_rank() over (partition by case_slug order by first_id) as reviewer_no
    from (select case_slug, reviewer_id, min(id) as first_id
            from public.claim_reviews group by case_slug, reviewer_id) f;

revoke all on private.claim_reviews_current, private.claim_reviewer_numbers from public, anon, authenticated;
