-- The Way: ONE paste to finish the members database (migrations 0013, 0014, 0015).
-- Safe to run more than once. Run it in the Supabase SQL Editor, project michi-institute.
-- It changes nothing until it has checked that 0001-0012 are already in. If one is missing,
-- it stops with a message that says which. The last result is a checklist: every row should say ok.

do $guard$
declare missing text[] := '{}'; t text;
begin
  foreach t in array array['members','invitations','member_roles','moderation_actions','member_places',
                           'case_revision_reports','categories','research_versions'] loop
    if to_regclass('public.' || t) is null then missing := missing || ('table public.' || t); end if;
  end loop;
  foreach t in array array['public.redeem_invitation(text,text)','public.create_share_link(text,text)',
                           'public.revoke_invitation(bigint,text)','public.notify_signup(text,text)',
                           'private.has_role(text)','private.is_member()','private.audit()'] loop
    if to_regprocedure(t) is null then missing := missing || ('function ' || t); end if;
  end loop;
  if cardinality(missing) > 0 then
    raise exception 'Stop: earlier updates are missing (%). Run the older update files first, in order, then this one.', array_to_string(missing, ', ');
  end if;
end $guard$;

-- ===================== 0013_case_reviews =====================
-- The Way: a person reviews each history case ("The record"), claim by claim.
--   * Every case page starts with a "Not yet reviewed by a person" banner. A moderator (or admin)
--     checks the page's key claims one at a time, flags problems with a note, and when every claim
--     is checked and nothing is flagged, marks the case reviewed. The page banner itself is
--     switched off by hand in the case builder (cases-build/reviewed.json), not by this database.
--   * Everything a reviewer does is one new row in case_review_events. Rows are never changed or
--     deleted (append-only, audited). "Current state" is always worked out from the latest rows.
--   * The history is public: case_review_status() and case_review_history() answer to anyone, even
--     signed out, and show the date, what happened, the claim and the note. They do not show who
--     the reviewer was ("a reviewer"); the moderators' own screen and the audit chain do.
--   * A reviewer role is not a new role. A moderator is made by an admin in the Admin page
--     (set_role), after the person has joined with an ordinary invitation: invitations never carry
--     a role (0007). Admins can review too (has_role treats admin as every role).
--   * Nothing here runs by itself. Frank pastes this file into the Supabase SQL editor.

create table if not exists public.case_review_events (
  id          bigint generated always as identity primary key,
  case_slug   text not null check (case_slug ~ '^[a-z0-9-]{2,80}$'),
  claim_key   text check (claim_key is null or claim_key ~ '^[0-9a-f]{10}$'),
  claim_text  text check (claim_text is null or char_length(btrim(claim_text)) between 3 and 1000),
  event_type  text not null check (event_type in
                ('claim_checked','claim_flagged','claim_cleared','review_started','note','marked_reviewed','reopened')),
  note        text check (note is null or char_length(btrim(note)) between 3 and 2000),
  actor_id    uuid not null references public.members(id),
  created_at  timestamptz not null default now(),
  -- claim events name a claim; case events do not
  check ((event_type in ('claim_checked','claim_flagged','claim_cleared')) = (claim_key is not null)),
  check ((claim_key is null) = (claim_text is null)),
  -- a flag, a cleared flag, a note, a mark and a reopen always say why
  check (event_type in ('claim_checked','review_started') or note is not null)
);
create index if not exists case_review_events_case on public.case_review_events (case_slug, id);

-- No direct writes: only the two functions below add rows.
revoke all on public.case_review_events from public, anon, authenticated;
grant select on public.case_review_events to authenticated;
alter table public.case_review_events enable row level security;

drop policy if exists case_review_events_read on public.case_review_events;
create policy case_review_events_read on public.case_review_events for select to authenticated
  using (private.has_role('moderator'));

drop trigger if exists case_review_events_append_only on public.case_review_events;
create trigger case_review_events_append_only before update or delete on public.case_review_events
  for each row execute function private.forbid_change();
drop trigger if exists case_review_events_no_truncate on public.case_review_events;
create trigger case_review_events_no_truncate before truncate on public.case_review_events
  for each statement execute function private.forbid_change();
drop trigger if exists case_review_events_audit on public.case_review_events;
create trigger case_review_events_audit after insert on public.case_review_events
  for each row execute function private.audit();

-- the moderation log can name a case review
alter table public.moderation_actions drop constraint if exists moderation_actions_subject_type_check;
alter table public.moderation_actions add constraint moderation_actions_subject_type_check
  check (subject_type in ('post','thread','member','report','role','invitation','case_report','case_review'));

-- ---------------------------------------------------------------------------
-- Helpers (private)
-- ---------------------------------------------------------------------------

-- Is the case currently marked reviewed? The latest of marked_reviewed / reopened decides.
create or replace function private.case_is_reviewed(slug text) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select e.event_type = 'marked_reviewed'
                     from public.case_review_events e
                    where e.case_slug = slug and e.event_type in ('marked_reviewed','reopened')
                    order by e.id desc limit 1), false);
$$;

-- Claims whose latest event is a flag nobody has cleared.
create or replace function private.case_open_flags(slug text) returns int
language sql stable security definer set search_path = '' as $$
  select count(*)::int from (
    select distinct on (e.claim_key) e.event_type
      from public.case_review_events e
     where e.case_slug = slug and e.claim_key is not null
     order by e.claim_key, e.id desc) x
   where x.event_type = 'claim_flagged';
$$;

revoke all on function private.case_is_reviewed(text), private.case_open_flags(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Reviewer actions (moderators and admins)
-- ---------------------------------------------------------------------------

create or replace function public.review_case_claim(case_slug text, claim_key text, claim_text text, event_type text, note text default null)
returns bigint language plpgsql security definer set search_path = '' as $$
declare
  n   text := nullif(btrim(note), '');
  txt text := nullif(btrim(claim_text), '');
  last_type text;
  new_id bigint;
begin
  perform private.require_role('moderator');
  if case_slug is null or case_slug !~ '^[a-z0-9-]{2,80}$' then
    raise exception 'Unknown case' using errcode = '22023';
  end if;
  if claim_key is null or claim_key !~ '^[0-9a-f]{10}$' then
    raise exception 'Unknown claim' using errcode = '22023';
  end if;
  if txt is null or char_length(txt) not between 3 and 1000 then
    raise exception 'The claim text is missing or too long' using errcode = '22023';
  end if;
  if event_type not in ('claim_checked','claim_flagged','claim_cleared') then
    raise exception 'A claim can be checked, flagged or cleared' using errcode = '22023';
  end if;
  if event_type <> 'claim_checked' and (n is null or char_length(n) < 3) then
    raise exception 'Add a short note (3 to 2000 characters) saying why' using errcode = '22023';
  end if;
  if n is not null and char_length(n) > 2000 then
    raise exception 'Keep the note under 2000 characters' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtext('the_way_case_review'), hashtext(case_slug));
  if private.case_is_reviewed(case_slug) then
    raise exception 'This case is marked reviewed. Reopen it first' using errcode = '55000';
  end if;
  select e.event_type into last_type from public.case_review_events e
   where e.case_slug = review_case_claim.case_slug and e.claim_key = review_case_claim.claim_key
   order by e.id desc limit 1;
  if event_type = 'claim_cleared' and last_type is distinct from 'claim_flagged' then
    raise exception 'That claim is not flagged' using errcode = '55000';
  end if;
  if event_type = 'claim_checked' and last_type = 'claim_flagged' then
    raise exception 'Clear the flag first, with a note saying what was fixed' using errcode = '55000';
  end if;
  insert into public.case_review_events (case_slug, claim_key, claim_text, event_type, note, actor_id)
  values (review_case_claim.case_slug, review_case_claim.claim_key, txt, review_case_claim.event_type, n, auth.uid())
  returning id into new_id;
  return new_id;
end $$;

create or replace function public.review_case(case_slug text, event_type text, note text default null)
returns bigint language plpgsql security definer set search_path = '' as $$
declare
  n   text := nullif(btrim(note), '');
  new_id bigint;
  flags int;
  checks int;
begin
  perform private.require_role('moderator');
  if case_slug is null or case_slug !~ '^[a-z0-9-]{2,80}$' then
    raise exception 'Unknown case' using errcode = '22023';
  end if;
  if event_type not in ('review_started','note','marked_reviewed','reopened') then
    raise exception 'Unknown review step' using errcode = '22023';
  end if;
  if event_type in ('note','reopened') and (n is null or char_length(n) < 3) then
    raise exception 'Add a short note (3 to 2000 characters) saying why' using errcode = '22023';
  end if;
  if event_type = 'marked_reviewed' and (n is null or char_length(n) < 10) then
    raise exception 'Say in a sentence or two what you reviewed (at least 10 characters)' using errcode = '22023';
  end if;
  if n is not null and char_length(n) > 2000 then
    raise exception 'Keep the note under 2000 characters' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtext('the_way_case_review'), hashtext(case_slug));
  if event_type = 'marked_reviewed' then
    if private.case_is_reviewed(case_slug) then
      raise exception 'This case is already marked reviewed' using errcode = '55000';
    end if;
    flags := private.case_open_flags(case_slug);
    if flags > 0 then
      raise exception '% flagged claim(s) are still open. Clear each flag first', flags using errcode = '55000';
    end if;
    select count(distinct e.claim_key) into checks from public.case_review_events e
     where e.case_slug = review_case.case_slug and e.event_type = 'claim_checked';
    if checks = 0 then
      raise exception 'No claim has been checked yet' using errcode = '55000';
    end if;
  elsif event_type = 'reopened' and not private.case_is_reviewed(case_slug) then
    raise exception 'This case is not marked reviewed' using errcode = '55000';
  elsif event_type in ('review_started','note') and private.case_is_reviewed(case_slug) then
    raise exception 'This case is marked reviewed. Reopen it first' using errcode = '55000';
  end if;
  insert into public.case_review_events (case_slug, event_type, note, actor_id)
  values (review_case.case_slug, review_case.event_type, n, auth.uid())
  returning id into new_id;
  if event_type in ('marked_reviewed','reopened') then
    insert into public.moderation_actions (moderator_id, action, subject_type, subject_id, reason)
    values (auth.uid(), review_case.event_type || '_case', 'case_review', review_case.case_slug, coalesce(n, review_case.event_type));
  end if;
  return new_id;
end $$;

-- ---------------------------------------------------------------------------
-- Public history (anyone, signed out too). No reviewer names.
-- ---------------------------------------------------------------------------

-- One row per case that has any review activity.
create or replace function public.case_review_status()
returns table (case_slug text, status text, reviewed_at timestamptz, claims_checked int, claims_flagged int, last_activity timestamptz)
language sql stable security definer set search_path = '' as $$
  select s.slug,
         case when private.case_is_reviewed(s.slug) then 'reviewed' else 'in_review' end,
         (select max(e.created_at) from public.case_review_events e
           where e.case_slug = s.slug and e.event_type = 'marked_reviewed' and private.case_is_reviewed(s.slug)),
         (select count(*)::int from (
            select distinct on (e.claim_key) e.event_type from public.case_review_events e
             where e.case_slug = s.slug and e.claim_key is not null order by e.claim_key, e.id desc) c
           where c.event_type in ('claim_checked','claim_cleared')),
         private.case_open_flags(s.slug),
         (select max(e.created_at) from public.case_review_events e where e.case_slug = s.slug)
    from (select distinct e.case_slug as slug from public.case_review_events e) s
   order by 6 desc;
$$;

-- The history itself, newest first.
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

-- ===================== 0014_claim_reviews =====================
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

-- ===================== 0015_pull_a_thread =====================
-- The Way: "Pull a Thread" public intake. Anyone, signed out too, can send one link and a short reason.
--   * Rows go in a private table. Nobody reads them from the browser: anon and authenticated have no
--     SELECT. Moderators and admins read them through list_thread_submissions().
--   * Nothing is published from here and nothing is promised. A moderator sets the disposition
--     (new, accepted, needs_evidence, duplicate, declined) with a reason through triage_thread(); each
--     triage is a new row in thread_submission_events (append-only), so the history is kept.
--   * The link is stored as sent plus a canonical form (lowercased host, no fragment, no tracking
--     parameters) used to spot duplicates. Only http(s) links are accepted.
--   * No email, name or IP is collected. A per-day cap on identical canonical links and a hidden
--     honeypot field on the form blunt spam; the real rate limit is the Supabase project's own.
--   * Nothing here runs by itself. Frank pastes this file into the Supabase SQL editor after 0014.

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

create table if not exists public.thread_submission_events (
  id            bigint generated always as identity primary key,
  submission_id bigint not null references public.thread_submissions(id),
  disposition   text not null check (disposition in ('accepted','needs_evidence','duplicate','declined')),
  reason        text not null check (char_length(btrim(reason)) between 3 and 1000),
  actor_id      uuid not null references public.members(id),
  created_at    timestamptz not null default now()
);
revoke all on public.thread_submission_events from public, anon, authenticated;
alter table public.thread_submission_events enable row level security;
drop trigger if exists thread_submission_events_append_only on public.thread_submission_events;
create trigger thread_submission_events_append_only before update or delete on public.thread_submission_events
  for each row execute function private.forbid_change();
drop trigger if exists thread_submission_events_audit on public.thread_submission_events;
create trigger thread_submission_events_audit after insert on public.thread_submission_events
  for each row execute function private.audit();

-- Public: send one link.
create or replace function public.submit_thread(p_url text, p_why text default null, p_category text default 'other')
returns void language plpgsql security definer set search_path = '' as $$
declare
  u     text := btrim(coalesce(p_url, ''));
  why   text := nullif(btrim(p_why), '');
  canon text;
begin
  if u !~* '^https?://[^[:space:]]{4,}$' or char_length(u) > 1000 then
    raise exception 'Send a full link that starts with http:// or https://' using errcode = '22023';
  end if;
  if why is not null and char_length(why) not between 3 and 1000 then
    raise exception 'Keep the reason between 3 and 1000 characters' using errcode = '22023';
  end if;
  if p_category not in ('finance','ballot','case','other') then
    raise exception 'Unknown topic' using errcode = '22023';
  end if;
  -- canonical form: lowercase scheme and host, drop #fragment and utm_/fbclid/gclid parameters, drop trailing slash
  canon := regexp_replace(u, '#.*$', '');
  canon := regexp_replace(canon, '([?&])(utm_[a-z]+|fbclid|gclid)=[^&]*', '\1', 'gi');
  canon := regexp_replace(canon, '[?&]+$', '');
  canon := regexp_replace(canon, '/+$', '');
  canon := lower(substring(canon from '^https?://[^/?]+')) || coalesce(substring(canon from '^https?://[^/?]+(.*)$'), '');
  if (select count(*) from public.thread_submissions s
       where s.canonical_url = canon and s.created_at > now() - interval '1 day') >= 3 then
    return; -- already received today; say nothing different to the sender
  end if;
  if (select count(*) from public.thread_submissions s where s.created_at > now() - interval '1 hour') >= 200 then
    raise exception 'Too many submissions right now. Try again later' using errcode = '54000';
  end if;
  insert into public.thread_submissions (url, canonical_url, why, category) values (u, canon, why, p_category);
end $$;

-- Moderators: read the queue with each link's latest disposition and how many times it was sent.
create or replace function public.list_thread_submissions(p_max_rows int default 100)
returns table (id bigint, url text, why text, category text, created_at timestamptz, times_sent int, disposition text, reason text)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_role('moderator');
  return query
    select s.id, s.url, s.why, s.category, s.created_at,
           (select count(*)::int from public.thread_submissions d where d.canonical_url = s.canonical_url),
           coalesce((select e.disposition from public.thread_submission_events e where e.submission_id = s.id order by e.id desc limit 1), 'new'),
           (select e.reason from public.thread_submission_events e where e.submission_id = s.id order by e.id desc limit 1)
      from public.thread_submissions s
     order by s.id desc
     limit greatest(1, least(coalesce(p_max_rows, 100), 500));
end $$;

-- Moderators: record what happened to a submission, and why.
create or replace function public.triage_thread(p_submission_id bigint, p_disposition text, p_reason text)
returns bigint language plpgsql security definer set search_path = '' as $$
declare r text := nullif(btrim(p_reason), ''); new_id bigint;
begin
  perform private.require_role('moderator');
  if not exists (select 1 from public.thread_submissions where id = p_submission_id) then
    raise exception 'Unknown submission' using errcode = '22023';
  end if;
  if p_disposition not in ('accepted','needs_evidence','duplicate','declined') then
    raise exception 'Unknown disposition' using errcode = '22023';
  end if;
  if r is null or char_length(r) not between 3 and 1000 then
    raise exception 'Say why (3 to 1000 characters)' using errcode = '22023';
  end if;
  insert into public.thread_submission_events (submission_id, disposition, reason, actor_id)
  values (p_submission_id, p_disposition, r, auth.uid()) returning id into new_id;
  return new_id;
end $$;

revoke all on function public.submit_thread(text,text,text), public.list_thread_submissions(int), public.triage_thread(bigint,text,text)
  from public, anon, authenticated;
grant execute on function public.submit_thread(text,text,text) to anon, authenticated;
grant execute on function public.list_thread_submissions(int), public.triage_thread(bigint,text,text) to authenticated;


-- ===================== checklist (read this result) =====================
select what, case when ok then 'ok' else 'MISSING' end as status from (
  select 'join: redeem_invitation' what, to_regprocedure('public.redeem_invitation(text,text)') is not null ok
  union all select 'join: create_share_link', to_regprocedure('public.create_share_link(text,text)') is not null
  union all select 'join: notify_signup (waiting list)', to_regprocedure('public.notify_signup(text,text)') is not null
  union all select '0013 case_review_events', to_regclass('public.case_review_events') is not null
  union all select '0013 review_case_claim', to_regprocedure('public.review_case_claim(text,text,text,text,text)') is not null
  union all select '0014 claim_reviews', to_regclass('public.claim_reviews') is not null
  union all select '0014 submit_claim_review', exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='submit_claim_review')
  union all select '0015 thread_submissions', to_regclass('public.thread_submissions') is not null
  union all select 'append-only guard on claim_reviews', exists (select 1 from pg_trigger where tgrelid='public.claim_reviews'::regclass and tgname='claim_reviews_append_only')
  union all select 'at least one active admin exists', exists (select 1 from public.member_roles r join public.members m on m.id=r.member_id where r.role='admin' and m.status='active')
) c order by 2 desc, 1;
