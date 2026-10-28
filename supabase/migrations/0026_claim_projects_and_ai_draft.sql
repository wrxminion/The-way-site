-- The Way: research projects, linking a finding to them, and "AI help write my claim" (Frank, Oct 28 2026).
-- Needs 0004 (findings and the checker key). Safe to run twice.
--
--   1. research_projects: topics that findings belong to ("Policing and ICE", with strands such as
--      "Corruption and misconduct" and "Reform and what works"). Admins manage the list.
--   2. research_item_links: a finding (research item) is linked to one or more projects with a relation:
--      supports, counter_example or related. Up to 8 links per finding. Changes are logged.
--   3. claim_drafts: a private queue. An author sends notes and source links; the Frak computer (local Ollama,
--      checker key, no outside AI company) writes neutral draft wording and hands it back. The draft is labelled
--      "AI draft, unchecked". It is only ever shown to the author who asked. Nothing here reads or writes
--      candidate scores, which stay off until the lawyer says otherwise.

do $guard$
begin
  if to_regclass('public.research_prechecks') is null or to_regprocedure('private.checker_key_id(text)') is null then
    raise exception 'Stop: run 0004 (findings) first';
  end if;
end $guard$;

-- ---------------------------------------------------------------- log subjects (merge into the existing list)
do $c$
declare def text; vals text[];
begin
  select pg_get_constraintdef(oid) into def from pg_constraint
   where conrelid = 'public.moderation_actions'::regclass and conname = 'moderation_actions_subject_type_check';
  select array_agg(distinct m[1]) into vals from regexp_matches(coalesce(def, ''), '''([a-z_]+)''', 'g') m;
  select array_agg(distinct v) into vals from unnest(coalesce(vals, '{}') || array['research_project','claim_link']) v;
  alter table public.moderation_actions drop constraint if exists moderation_actions_subject_type_check;
  execute format('alter table public.moderation_actions add constraint moderation_actions_subject_type_check check (subject_type in (%s))',
                 (select string_agg(quote_literal(v), ',') from unnest(vals) v));
end $c$;

-- ---------------------------------------------------------------- 1. projects
create table if not exists public.research_projects (
  id          bigint generated always as identity primary key,
  slug        text not null unique check (slug ~ '^[a-z0-9-]{3,80}$'),
  title       text not null check (char_length(btrim(title)) between 3 and 120 and title !~ '[<>]'),
  description text check (description is null or (char_length(description) <= 600 and description !~ '[<>]')),
  parent_id   bigint references public.research_projects(id),   -- a strand sits under one top-level project
  active      boolean not null default true,
  created_by  uuid references public.members(id),
  created_at  timestamptz not null default now(),
  check (parent_id is distinct from id)
);
comment on table public.research_projects is 'Topics a finding can belong to. Managed by admins. A strand has a parent; strands do not nest.';

alter table public.research_projects enable row level security;
revoke all on public.research_projects from public, anon, authenticated;
grant select on public.research_projects to authenticated;
drop policy if exists research_projects_read on public.research_projects;
create policy research_projects_read on public.research_projects for select to authenticated using (private.is_member());

create or replace function public.save_research_project(p_id bigint, p_slug text, p_title text, p_description text,
                                                         p_parent bigint, p_active boolean)
returns bigint language plpgsql security definer set search_path = '' as $$
declare rid bigint; par public.research_projects; verb text;
begin
  if not (private.has_role('admin') or private.has_role('super_admin')) then
    raise exception 'Not allowed: needs the admin role' using errcode = '42501';
  end if;
  if p_parent is not null then
    select * into par from public.research_projects where id = p_parent;
    if par.id is null then raise exception 'No such parent project' using errcode = '02000'; end if;
    if par.parent_id is not null then raise exception 'A strand cannot have its own strands' using errcode = '22023'; end if;
    if p_parent = p_id then raise exception 'A project cannot be its own parent' using errcode = '22023'; end if;
    if p_id is not null and exists (select 1 from public.research_projects c where c.parent_id = p_id) then
      raise exception 'This project has strands, so it cannot become a strand' using errcode = '22023';
    end if;
  end if;
  if p_id is null then
    insert into public.research_projects (slug, title, description, parent_id, active, created_by)
    values (btrim(p_slug), btrim(p_title), nullif(btrim(coalesce(p_description,'')), ''), p_parent, coalesce(p_active, true), auth.uid())
    returning id into rid;
    verb := 'create_project';
  else
    update public.research_projects set slug = btrim(p_slug), title = btrim(p_title),
           description = nullif(btrim(coalesce(p_description,'')), ''), parent_id = p_parent, active = coalesce(p_active, true)
     where id = p_id returning id into rid;
    if rid is null then raise exception 'No such project' using errcode = '02000'; end if;
    verb := case when coalesce(p_active, true) then 'edit_project' else 'retire_project' end;
  end if;
  insert into public.moderation_actions (moderator_id, action, subject_type, subject_id, reason)
  values (auth.uid(), verb, 'research_project', rid::text, 'Project "' || left(btrim(p_title), 100) || '"');
  return rid;
end $$;

-- A first set to start from (Frank's examples). Admins can rename, add and retire.
insert into public.research_projects (slug, title, description, parent_id) values
  ('policing-and-ice', 'Policing and ICE', 'What policing and immigration enforcement do, and what the record shows.', null),
  ('epstein-record', 'The Epstein record', 'What the public documents say, and what they do not.', null),
  ('elections', 'Elections', 'How elections are run, counted and funded.', null)
on conflict (slug) do nothing;
insert into public.research_projects (slug, title, description, parent_id)
select v.slug, v.title, v.descr, p.id
  from (values
    ('policing-corruption', 'Corruption and misconduct', 'Cases and records of misconduct.', 'policing-and-ice'),
    ('policing-reform', 'Reform and what works', 'Training, oversight and other changes, and what happened after.', 'policing-and-ice')
  ) as v(slug, title, descr, parent_slug)
  join public.research_projects p on p.slug = v.parent_slug
on conflict (slug) do nothing;

-- ---------------------------------------------------------------- 2. links from a finding to projects
create table if not exists public.research_item_links (
  id          bigint generated always as identity primary key,
  item_id     bigint not null references public.research_items(id),
  project_id  bigint not null references public.research_projects(id),
  relation    text not null check (relation in ('supports','counter_example','related')),
  note        text check (note is null or (char_length(btrim(note)) between 3 and 300 and note !~ '[<>]')),
  linked_by   uuid not null default auth.uid() references public.members(id),
  created_at  timestamptz not null default now(),
  removed_at  timestamptz,
  removed_by  uuid references public.members(id)
);
comment on table public.research_item_links is 'A finding belongs to a project, with a relation: supports, counter_example or related. Rows are never deleted; removal sets removed_at.';
create unique index if not exists research_item_links_one_open on public.research_item_links (item_id, project_id) where removed_at is null;
create index if not exists research_item_links_project on public.research_item_links (project_id) where removed_at is null;

drop trigger if exists research_item_links_audit on public.research_item_links;
create trigger research_item_links_audit after insert or update on public.research_item_links
  for each row execute function private.audit();
drop trigger if exists research_item_links_no_truncate on public.research_item_links;
create trigger research_item_links_no_truncate before truncate on public.research_item_links
  for each statement execute function private.forbid_change();

alter table public.research_item_links enable row level security;
revoke all on public.research_item_links from public, anon, authenticated;
grant select on public.research_item_links to authenticated;
drop policy if exists research_item_links_read on public.research_item_links;
create policy research_item_links_read on public.research_item_links for select to authenticated using (private.is_member());

create or replace function private.may_link_item(p_item bigint) returns boolean
language sql stable security definer set search_path = '' as $$
  select (private.has_role('researcher') or private.has_role('reviewer') or private.has_role('editor'))
     and (private.has_role('reviewer') or private.has_role('editor')
          or exists (select 1 from public.research_items i where i.id = p_item and i.created_by = auth.uid())
          or exists (select 1 from public.research_versions v where v.item_id = p_item and v.author_id = auth.uid()));
$$;

create or replace function public.link_item_to_project(p_item bigint, p_project bigint, p_relation text, p_note text default null)
returns bigint language plpgsql security definer set search_path = '' as $$
declare lid bigint; pr public.research_projects; n text := nullif(btrim(coalesce(p_note,'')), '');
begin
  if not private.may_link_item(p_item) then
    raise exception 'Not allowed: only the finding''s author, a Deshi or a Renshi can link it' using errcode = '42501';
  end if;
  if p_relation not in ('supports','counter_example','related') then
    raise exception 'Unknown relation' using errcode = '22023';
  end if;
  select * into pr from public.research_projects where id = p_project;
  if pr.id is null or not pr.active then raise exception 'That project is not open for new links' using errcode = '22023'; end if;
  select id into lid from public.research_item_links where item_id = p_item and project_id = p_project and removed_at is null;
  if lid is not null then
    update public.research_item_links set relation = p_relation, note = n where id = lid;
  else
    if (select count(*) from public.research_item_links where item_id = p_item and removed_at is null) >= 8 then
      raise exception 'A finding can be linked to at most 8 projects' using errcode = '54000';
    end if;
    insert into public.research_item_links (item_id, project_id, relation, note) values (p_item, p_project, p_relation, n) returning id into lid;
  end if;
  insert into public.moderation_actions (moderator_id, action, subject_type, subject_id, reason)
  values (auth.uid(), 'link_' || p_relation, 'claim_link', lid::text, 'Finding ' || p_item || ' linked to "' || left(pr.title, 100) || '"');
  return lid;
end $$;

create or replace function public.unlink_item_from_project(p_link bigint)
returns void language plpgsql security definer set search_path = '' as $$
declare l public.research_item_links;
begin
  select * into l from public.research_item_links where id = p_link and removed_at is null;
  if l.id is null then raise exception 'No such link' using errcode = '02000'; end if;
  if not private.may_link_item(l.item_id) then
    raise exception 'Not allowed: only the finding''s author, a Deshi or a Renshi can change links' using errcode = '42501';
  end if;
  update public.research_item_links set removed_at = now(), removed_by = auth.uid() where id = p_link;
  insert into public.moderation_actions (moderator_id, action, subject_type, subject_id, reason)
  values (auth.uid(), 'unlink', 'claim_link', p_link::text, 'Link removed from finding ' || l.item_id);
end $$;

-- ---------------------------------------------------------------- 3. AI help write my claim (queue; Frak answers)
create table if not exists public.claim_drafts (
  id                  bigint generated always as identity primary key,
  requested_by        uuid not null default auth.uid() references public.members(id),
  notes               text not null check (char_length(btrim(notes)) between 20 and 6000),
  source_urls         text[] not null check (cardinality(source_urls) between 1 and 5),
  status              text not null default 'queued' check (status in ('queued','running','done','failed')),
  draft               jsonb,
  model               text check (char_length(model) <= 100),
  error               text check (char_length(error) <= 500),
  attempts            int not null default 0,
  created_at          timestamptz not null default now(),
  claimed_at          timestamptz,
  completed_at        timestamptz,
  used_in_version_id  bigint references public.research_versions(id),
  claim_changed       boolean
);
comment on table public.claim_drafts is 'AI wording help for authors. Advice only: shown only to the requester, labelled "AI draft, unchecked", and the author confirms it. The Frak worker answers through the checker key.';
create index if not exists claim_drafts_queue on public.claim_drafts (status, id);
create index if not exists claim_drafts_owner on public.claim_drafts (requested_by, id);
create unique index if not exists claim_drafts_one_use on public.claim_drafts (used_in_version_id) where used_in_version_id is not null;

drop trigger if exists claim_drafts_audit on public.claim_drafts;
create trigger claim_drafts_audit after insert on public.claim_drafts for each row execute function private.audit();

alter table public.claim_drafts enable row level security;
revoke all on public.claim_drafts from public, anon, authenticated;
grant select on public.claim_drafts to authenticated;
drop policy if exists claim_drafts_own on public.claim_drafts;
create policy claim_drafts_own on public.claim_drafts for select to authenticated using (requested_by = auth.uid());

create or replace function public.request_claim_draft(p_notes text, p_urls text[]) returns bigint
language plpgsql security definer set search_path = '' as $$
declare urls text[]; u text; did bigint;
begin
  if not private.has_role('researcher') then
    raise exception 'Not allowed: needs the Author (Submitter) role' using errcode = '42501';
  end if;
  select coalesce(array_agg(btrim(x)), '{}') into urls from unnest(coalesce(p_urls, '{}')) x where btrim(x) <> '';
  if cardinality(urls) < 1 or cardinality(urls) > 5 then
    raise exception 'Give between 1 and 5 source links' using errcode = '22023';
  end if;
  foreach u in array urls loop
    if u !~* '^https?://[^[:space:]]+$' or char_length(u) > 1000 then
      raise exception 'Every source must be a full web link starting with http:// or https://' using errcode = '22023';
    end if;
  end loop;
  perform pg_advisory_xact_lock(hashtext('the_way_claim_draft'), hashtext(auth.uid()::text));
  if (select count(*) from public.claim_drafts d where d.requested_by = auth.uid() and d.status in ('queued','running')) >= 2 then
    raise exception 'You already have drafts waiting. Wait for them to finish.' using errcode = '54000';
  end if;
  if (select count(*) from public.claim_drafts d where d.requested_by = auth.uid() and d.created_at > now() - interval '1 day') >= 10 then
    raise exception 'That is 10 AI drafts today; try again tomorrow' using errcode = '54000';
  end if;
  insert into public.claim_drafts (requested_by, notes, source_urls) values (auth.uid(), btrim(p_notes), urls) returning id into did;
  return did;
end $$;

-- Called after the author saves a version that started from a draft. Records only whether the author changed the claim.
create or replace function public.mark_claim_draft_used(p_draft bigint, p_version bigint) returns void
language plpgsql security definer set search_path = '' as $$
declare d public.claim_drafts; v public.research_versions;
begin
  select * into d from public.claim_drafts where id = p_draft and requested_by = auth.uid();
  if d.id is null or d.status <> 'done' then raise exception 'No such draft' using errcode = '02000'; end if;
  if d.used_in_version_id is not null then raise exception 'That draft was already used' using errcode = '22023'; end if;
  select * into v from public.research_versions where id = p_version and author_id = auth.uid();
  if v.id is null then raise exception 'No such version' using errcode = '02000'; end if;
  update public.claim_drafts set used_in_version_id = v.id,
         claim_changed = btrim(coalesce(v.claim,'')) is distinct from btrim(coalesce(d.draft->>'claim',''))
   where id = d.id;
end $$;

-- Readers (the author, a Deshi or a Renshi) learn only that a version began from an AI draft, never the draft text.
create or replace function public.version_ai_note(p_version bigint) returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when private.has_role('researcher') or private.has_role('reviewer') or private.has_role('editor')
    then (select jsonb_build_object('claim_changed', d.claim_changed) from public.claim_drafts d where d.used_in_version_id = p_version)
    else null end;
$$;

-- What Frak calls (anon key + checker key), same pattern as the fact-check queue.
create or replace function public.checker_draft_claim(checker_key text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare d public.claim_drafts;
begin
  perform private.checker_key_id(checker_key);
  update public.claim_drafts set status = 'failed', error = 'Frak did not finish the draft', completed_at = now()
   where status = 'running' and claimed_at < now() - interval '10 minutes' and attempts >= 2;
  select * into d from public.claim_drafts c
   where c.status = 'queued' or (c.status = 'running' and c.claimed_at < now() - interval '10 minutes')
   order by c.id limit 1 for update skip locked;
  if d.id is null then return null; end if;
  update public.claim_drafts set status = 'running', claimed_at = now(), attempts = attempts + 1 where id = d.id;
  return jsonb_build_object('draft_id', d.id, 'notes', d.notes, 'urls', to_jsonb(d.source_urls));
end $$;

-- draft: {"claim": "...", "summary": "...", "counterargument": "...", "passages": [{"url": "...", "text": "..."}]}
create or replace function public.checker_draft_complete(checker_key text, draft_id bigint, draft jsonb, model text)
returns void language plpgsql security definer set search_path = '' as $$
declare cl text; sm text; ca text; ps jsonb := '[]'::jsonb; p jsonb; n int := 0;
  banned constant text := '\m(democrat\w*|republican\w*|gop|libertarian|green party|candidates?|vote for|vote against)\M';
begin
  perform private.checker_key_id(checker_key);
  if jsonb_typeof(draft) is distinct from 'object' then raise exception 'Draft must be an object' using errcode = '22023'; end if;
  cl := btrim(coalesce(draft->>'claim', ''));
  sm := nullif(btrim(coalesce(draft->>'summary', '')), '');
  ca := nullif(btrim(coalesce(draft->>'counterargument', '')), '');
  if char_length(cl) not between 10 and 300 then raise exception 'Draft claim must be 10 to 300 characters' using errcode = '22023'; end if;
  if cl ~* banned or coalesce(sm,'') ~* banned or coalesce(ca,'') ~* banned then
    raise exception 'A claim is about a policy and what it did, never a candidate or party' using errcode = '22023';
  end if;
  if jsonb_typeof(draft->'passages') = 'array' then
    for p in select x from jsonb_array_elements(draft->'passages') x loop
      exit when n >= 5;
      continue when jsonb_typeof(p) <> 'object' or coalesce(btrim(p->>'text'), '') = '' or coalesce(btrim(p->>'url'), '') = '';
      ps := ps || jsonb_build_array(jsonb_build_object('url', left(btrim(p->>'url'), 1000), 'text', left(btrim(p->>'text'), 400)));
      n := n + 1;
    end loop;
  end if;
  update public.claim_drafts c
     set status = 'done', completed_at = now(), model = left(checker_draft_complete.model, 100), error = null,
         draft = jsonb_build_object('claim', cl, 'summary', left(sm, 1000), 'counterargument', left(ca, 1500), 'passages', ps)
   where c.id = checker_draft_complete.draft_id and c.status = 'running';
  if not found then raise exception 'That draft is not running' using errcode = '42501'; end if;
end $$;

create or replace function public.checker_draft_fail(checker_key text, draft_id bigint, error text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.checker_key_id(checker_key);
  update public.claim_drafts c set status = 'failed', error = left(checker_draft_fail.error, 500), completed_at = now()
   where c.id = checker_draft_fail.draft_id and c.status = 'running';
end $$;

-- ---------------------------------------------------------------- function privileges
revoke all on function
  private.may_link_item(bigint),
  public.save_research_project(bigint,text,text,text,bigint,boolean),
  public.link_item_to_project(bigint,bigint,text,text), public.unlink_item_from_project(bigint),
  public.request_claim_draft(text,text[]), public.mark_claim_draft_used(bigint,bigint), public.version_ai_note(bigint),
  public.checker_draft_claim(text), public.checker_draft_complete(text,bigint,jsonb,text), public.checker_draft_fail(text,bigint,text)
  from public, anon, authenticated;
grant execute on function
  public.save_research_project(bigint,text,text,text,bigint,boolean),
  public.link_item_to_project(bigint,bigint,text,text), public.unlink_item_from_project(bigint),
  public.request_claim_draft(text,text[]), public.mark_claim_draft_used(bigint,bigint), public.version_ai_note(bigint)
  to authenticated;
grant execute on function
  public.checker_draft_claim(text), public.checker_draft_complete(text,bigint,jsonb,text), public.checker_draft_fail(text,bigint,text)
  to anon, authenticated;
