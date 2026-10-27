-- The Way members setup, part 5 of 7. Run parts in order. Safe to run again.
create or replace function public.my_claim_reviews(p_case_slug text)
returns table (id bigint, claim_key text, source_label text, source_url text, source_access text, verdict text,
               evidence_passage text, rationale text, flags text[], review_mode text, created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_role('moderator');
  return query
    select c.id, c.claim_key, c.source_label, c.source_url, c.source_access, c.verdict,
           c.evidence_passage, c.rationale, c.flags, c.review_mode, c.created_at
      from private.claim_reviews_current c
     where c.case_slug = p_case_slug and c.reviewer_id = auth.uid()
     order by c.id;
end $$;

create or replace function public.claim_review_disagreements(p_case_slug text default null)
returns table (case_slug text, claim_key text, claim_text text, reviewers int, verdicts text[], last_activity timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_role('moderator');
  return query
    with latest as (
      select distinct on (c.case_slug, c.claim_key, c.reviewer_id)
             c.case_slug, c.claim_key, c.claim_text, c.reviewer_id, c.verdict, c.created_at
        from private.claim_reviews_current c
       where c.verdict not in ('pending','inaccessible')
         and (p_case_slug is null or c.case_slug = p_case_slug)
       order by c.case_slug, c.claim_key, c.reviewer_id, c.id desc)
    select l.case_slug, l.claim_key, (array_agg(l.claim_text))[1], count(*)::int,
           array_agg(distinct l.verdict order by l.verdict), max(l.created_at)
      from latest l
     group by l.case_slug, l.claim_key
    having count(distinct l.verdict) > 1
     order by max(l.created_at) desc;
end $$;

create or replace function public.claim_review_summary(p_case_slug text)
returns table (claim_key text, claim_text text, reviewers int, supported int, partially_supported int, contradicted int,
               insufficient_evidence int, inaccessible int, pending int, disagree boolean, last_activity timestamptz)
language sql stable security definer set search_path = '' as $$
  with latest as (
    select distinct on (c.claim_key, c.reviewer_id) c.claim_key, c.claim_text, c.reviewer_id, c.verdict, c.created_at
      from private.claim_reviews_current c
     where c.case_slug = p_case_slug
     order by c.claim_key, c.reviewer_id, c.id desc)
  select l.claim_key, (array_agg(l.claim_text))[1],
         count(distinct l.reviewer_id) filter (where l.verdict <> 'pending')::int,
         (count(*) filter (where l.verdict = 'supported'))::int,
         (count(*) filter (where l.verdict = 'partially_supported'))::int,
         (count(*) filter (where l.verdict = 'contradicted'))::int,
         (count(*) filter (where l.verdict = 'insufficient_evidence'))::int,
         (count(*) filter (where l.verdict = 'inaccessible'))::int,
         (count(*) filter (where l.verdict = 'pending'))::int,
         count(distinct l.verdict) filter (where l.verdict not in ('pending','inaccessible')) > 1,
         max(l.created_at)
    from latest l group by l.claim_key
   order by max(l.created_at) desc;
$$;

create or replace function public.claim_review_public(p_case_slug text, p_claim_key text default null, p_max_rows int default 300)
returns table (id bigint, claim_key text, claim_text text, reviewer_label text, source_label text, source_url text,
               source_access text, verdict text, evidence_passage text, rationale text, flags text[], review_mode text,
               revises_id bigint, superseded boolean, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select r.id, r.claim_key, r.claim_text, 'Reviewer ' || n.reviewer_no, r.source_label, r.source_url,
         r.source_access, r.verdict, r.evidence_passage, r.rationale, r.flags, r.review_mode, r.supersedes_id,
         exists (select 1 from public.claim_reviews s where s.supersedes_id = r.id), r.created_at
    from public.claim_reviews r
    join private.claim_reviewer_numbers n on n.case_slug = r.case_slug and n.reviewer_id = r.reviewer_id
   where r.case_slug = p_case_slug and (p_claim_key is null or r.claim_key = p_claim_key)
   order by r.id desc
   limit greatest(1, least(coalesce(p_max_rows, 300), 500));
$$;

revoke all on function public.submit_claim_review(text,text,text,text,text,text,text,text,text,text[],text,bigint),
  public.claim_reviews_for_claim(text,text), public.my_claim_reviews(text), public.claim_review_disagreements(text),
  public.claim_review_summary(text), public.claim_review_public(text,text,int) from public, anon, authenticated;

grant execute on function public.submit_claim_review(text,text,text,text,text,text,text,text,text,text[],text,bigint),
  public.claim_reviews_for_claim(text,text), public.my_claim_reviews(text), public.claim_review_disagreements(text) to authenticated;

grant execute on function public.claim_review_summary(text), public.claim_review_public(text,text,int) to anon, authenticated;

create table if not exists public.thread_submissions (
  id            bigint generated always as identity primary key,
  url           text not null check (url ~* '^https?://[^[:space:]]{4,}$' and char_length(url) <= 1000),
  canonical_url text not null,
  why           text check (why is null or char_length(btrim(why)) between 3 and 1000),
  category      text not null check (category in ('finance','ballot','case','other')),
  created_at    timestamptz not null default now()
);

create index if not exists thread_submissions_canon on public.thread_submissions (canonical_url, created_at);

revoke all on public.thread_submissions from public, anon, authenticated;

alter table public.thread_submissions enable row level security;

drop trigger if exists thread_submissions_append_only on public.thread_submissions;

create trigger thread_submissions_append_only before update or delete on public.thread_submissions
  for each row execute function private.forbid_change();
