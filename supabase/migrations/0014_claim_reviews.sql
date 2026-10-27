-- The Way: Phase A of community verification. Independent, claim-by-claim review records.
-- Builds on 0013 (case_review_events stays exactly as it is: the case-level steps and the
-- "marked reviewed" flag). This adds what 0013 does not have: several reviewers can each judge the
-- SAME claim on their own, with the source, a verdict, the passage that backs it, a rationale and
-- flags. Nothing is overwritten.
--   * public.claim_reviews is append-only. A reviewer who changes their mind adds a new row that
--     points at the old one (supersedes_id). Old rows stay, with their dates.
--   * One account counts once per claim: a second row by the same reviewer for the same claim and
--     source is refused unless it is a revision of their own earlier row. Revisions never add to
--     the reviewer count.
--   * The claim_key (from cases-claims.js) is a hash of the claim text. Edit a claim and it gets a
--     new key, so earlier reviews stay on the old text and do not carry over to the new wording.
--   * Verdicts are separate from source access. A source can be 'inaccessible' while the verdict
--     stays 'pending'. Counts are process numbers (how many reviewers, do they disagree), never a
--     truth vote. A disagreement opens a task for moderators; it changes no published finding.
--   * Independent means independent: a reviewer sees other reviewers' rows for a claim only after
--     submitting their own. review_mode 'collaborative' marks a review made after talking with
--     another reviewer, and the public history says so.
--   * Public view: reviewers appear as "Reviewer 1", "Reviewer 2" ... numbered per case, in order
--     of first review. No names, no ids, and the number cannot be linked across cases. Names are
--     kept in the audit chain and visible to admins in the table. The evidence passage, rationale
--     and source are public, so reviewers are told not to write personal data.
--   * Nothing here runs by itself. Frank pastes this file into the Supabase SQL editor after 0013.

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
  -- a real verdict names its basis; 'pending' and 'inaccessible' need only a short reason
  check (verdict in ('pending','inaccessible') or rationale is not null),
  check (verdict not in ('supported','partially_supported','contradicted') or evidence_passage is not null),
  -- 'inaccessible' verdict and 'inaccessible' source go together; a verdict of 'inaccessible' needs a reason
  check ((verdict = 'inaccessible') = (source_access = 'inaccessible') or verdict = 'pending'),
  check (verdict <> 'inaccessible' or rationale is not null)
);
create index if not exists claim_reviews_claim on public.claim_reviews (case_slug, claim_key, id);
create index if not exists claim_reviews_reviewer on public.claim_reviews (reviewer_id, case_slug);
-- each row can be revised once, so a revision history is a straight line
create unique index if not exists claim_reviews_one_successor on public.claim_reviews (supersedes_id) where supersedes_id is not null;

revoke all on public.claim_reviews from public, anon, authenticated;
grant select on public.claim_reviews to authenticated;
alter table public.claim_reviews enable row level security;

-- Direct reads: your own rows, or everything for an admin. Everyone else goes through
-- claim_reviews_for_claim(), which only opens other reviewers' rows after you have submitted yours.
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

-- ---------------------------------------------------------------------------
-- Helpers (private)
-- ---------------------------------------------------------------------------

-- The live row of every revision chain: rows nobody has revised.
create or replace view private.claim_reviews_current as
  select r.* from public.claim_reviews r
   where not exists (select 1 from public.claim_reviews n where n.supersedes_id = r.id);

-- Each reviewer's number inside a case: 1 for whoever reviewed first, and so on.
create or replace view private.claim_reviewer_numbers as
  select case_slug, reviewer_id,
         dense_rank() over (partition by case_slug order by first_id) as reviewer_no
    from (select case_slug, reviewer_id, min(id) as first_id
            from public.claim_reviews group by case_slug, reviewer_id) f;

revoke all on private.claim_reviews_current, private.claim_reviewer_numbers from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Writing a review (moderators and admins)
-- ---------------------------------------------------------------------------

create or replace function public.submit_claim_review(
  p_case_slug text, p_claim_key text, p_claim_text text,
  p_source_label text, p_source_url text, p_source_access text,
  p_verdict text, p_evidence_passage text, p_rationale text,
  p_flags text[] default '{}', p_review_mode text default 'independent',
  p_supersedes_id bigint default null)
returns bigint language plpgsql security definer set search_path = '' as $$
declare
  me   uuid := auth.uid();
  txt  text := nullif(btrim(p_claim_text), '');
  src  text := nullif(btrim(p_source_label), '');
  url  text := nullif(btrim(p_source_url), '');
  pass text := nullif(btrim(p_evidence_passage), '');
  rat  text := nullif(btrim(p_rationale), '');
  prev public.claim_reviews;
  dup  bigint;
  new_id bigint;
begin
  perform private.require_role('moderator');
  if p_case_slug is null or p_case_slug !~ '^[a-z0-9-]{2,80}$' then
    raise exception 'Unknown case' using errcode = '22023';
  end if;
  if p_claim_key is null or p_claim_key !~ '^[0-9a-f]{10}$' then
    raise exception 'Unknown claim' using errcode = '22023';
  end if;
  if txt is null or char_length(txt) not between 3 and 1000 then
    raise exception 'The claim text is missing or too long' using errcode = '22023';
  end if;
  if src is null or char_length(src) not between 2 and 300 then
    raise exception 'Name the source you checked (2 to 300 characters)' using errcode = '22023';
  end if;
  if url is not null and (url !~* '^https?://[^[:space:]]+$' or char_length(url) > 1000) then
    raise exception 'The source link must start with http:// or https://' using errcode = '22023';
  end if;
  if p_source_access not in ('opened','inaccessible','questioned') then
    raise exception 'Say whether you could open the source' using errcode = '22023';
  end if;
  if p_verdict not in ('supported','partially_supported','contradicted','insufficient_evidence','inaccessible','pending') then
    raise exception 'Unknown verdict' using errcode = '22023';
  end if;
  if p_review_mode not in ('independent','collaborative') then
    raise exception 'Unknown review mode' using errcode = '22023';
  end if;
  if p_verdict not in ('pending','inaccessible') and (rat is null or char_length(rat) < 10) then
    raise exception 'Say in a sentence why (at least 10 characters)' using errcode = '22023';
  end if;
  if p_verdict in ('supported','partially_supported','contradicted') and pass is null then
    raise exception 'Quote or point to the passage in the source that backs this verdict' using errcode = '22023';
  end if;
  if p_verdict = 'inaccessible' and (rat is null or char_length(rat) < 3) then
    raise exception 'Say what stopped you opening the source' using errcode = '22023';
  end if;
  if (p_verdict = 'inaccessible') <> (p_source_access = 'inaccessible') and p_verdict <> 'pending' then
    raise exception 'An inaccessible source gives the verdict "inaccessible"; otherwise pick what the source shows' using errcode = '22023';
  end if;
  if (rat is not null and char_length(rat) > 2000) or (pass is not null and char_length(pass) > 1500) then
    raise exception 'Keep the rationale under 2000 and the passage under 1500 characters' using errcode = '22023';
  end if;
  if not (coalesce(p_flags, '{}') <@ array['needs_second_look','source_conflict','possible_error','outdated','other']::text[]) then
    raise exception 'Unknown flag' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtext('the_way_claim_review'), hashtext(p_case_slug || p_claim_key));

  if p_supersedes_id is not null then
    select * into prev from public.claim_reviews where id = p_supersedes_id;
    if not found or prev.reviewer_id <> me then
      raise exception 'You can only revise your own review' using errcode = '42501';
    end if;
    if prev.case_slug <> p_case_slug or prev.claim_key <> p_claim_key then
      raise exception 'That review is for a different claim' using errcode = '22023';
    end if;
    if exists (select 1 from public.claim_reviews n where n.supersedes_id = p_supersedes_id) then
      raise exception 'That review was already revised. Revise the newest one' using errcode = '55000';
    end if;
  else
    -- a second fresh review of the same claim and source by the same person is refused
    select c.id into dup from private.claim_reviews_current c
     where c.reviewer_id = me and c.case_slug = p_case_slug and c.claim_key = p_claim_key
       and lower(c.source_label) = lower(src) limit 1;
    if dup is not null then
      raise exception 'You already reviewed this claim against that source. Revise your review instead of adding another' using errcode = '55000';
    end if;
  end if;

  insert into public.claim_reviews (case_slug, claim_key, claim_text, source_label, source_url, source_access,
    verdict, evidence_passage, rationale, flags, review_mode, supersedes_id, reviewer_id)
  values (p_case_slug, p_claim_key, txt, src, url, p_source_access,
    p_verdict, pass, rat, coalesce(p_flags, '{}'), p_review_mode, p_supersedes_id, me)
  returning id into new_id;
  return new_id;
end $$;

-- ---------------------------------------------------------------------------
-- Reading (reviewers)
-- ---------------------------------------------------------------------------

-- The other reviewers' rows on one claim. Opens only after the caller has submitted their own,
-- so a reviewer cannot be steered by the others. Reviewers appear by their per-case number.
create or replace function public.claim_reviews_for_claim(p_case_slug text, p_claim_key text)
returns table (id bigint, reviewer_label text, is_mine boolean, source_label text, source_url text, source_access text,
               verdict text, evidence_passage text, rationale text, flags text[], review_mode text,
               supersedes_id bigint, is_current boolean, created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_role('moderator');
  if not exists (select 1 from public.claim_reviews m
                  where m.case_slug = p_case_slug and m.claim_key = p_claim_key and m.reviewer_id = auth.uid()) then
    return;
  end if;
  return query
    select r.id, 'Reviewer ' || n.reviewer_no, r.reviewer_id = auth.uid(), r.source_label, r.source_url, r.source_access,
           r.verdict, r.evidence_passage, r.rationale, r.flags, r.review_mode, r.supersedes_id,
           not exists (select 1 from public.claim_reviews s where s.supersedes_id = r.id), r.created_at
      from public.claim_reviews r
      join private.claim_reviewer_numbers n on n.case_slug = r.case_slug and n.reviewer_id = r.reviewer_id
     where r.case_slug = p_case_slug and r.claim_key = p_claim_key
     order by r.id;
end $$;

-- Which claims of a case have at least one review by the caller (so the screen can show "you reviewed this").
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

-- Claims where reviewers' current verdicts differ. This is a task list for moderators, not a result:
-- it never changes what the case page says.
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

-- ---------------------------------------------------------------------------
-- Public (anyone, signed out too)
-- ---------------------------------------------------------------------------

-- Per claim: how many different people have judged it and how many verdicts of each kind.
-- Process numbers, not a vote. 'disagree' is true when judged reviewers' verdicts differ.
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

-- Every review row, old revisions included, newest first. The full public record.
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
