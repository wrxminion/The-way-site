-- The Way: member area, phase 1
-- Supabase (Postgres 15+). Run once in the Supabase SQL editor or with `supabase db push`.
--
-- What this gives you
--   * Invite-only membership on top of Supabase Auth (email sign-in, no passwords stored here).
--     Anyone can create an auth login, but a login without a redeemed invitation sees nothing.
--   * The Commons: categories, threads, posts, edit history, reports, public moderation log.
--   * The Observatory research desk: research items, append-only versions and sources,
--     and a public Record History (publication, correction, retraction events).
--   * "Delete nothing": history tables reject UPDATE and DELETE at the database level,
--     and an audit log chains every important write with SHA-256 hashes.
--
-- Security model
--   * Row-level security is on for every table. The browser only ever holds the anon key.
--   * Table privileges are revoked from anon/authenticated and granted back narrowly.
--   * Anything privileged (invites, moderation, publishing, roles) goes through
--     SECURITY DEFINER functions that check roles themselves.
--   * Helper functions live in the `private` schema, which the API does not expose.

begin;

create extension if not exists pgcrypto with schema extensions;

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.members (
  id            uuid primary key references auth.users(id) on delete restrict,
  display_name  text not null check (char_length(btrim(display_name)) between 2 and 40),
  status        text not null default 'active' check (status in ('active','suspended','left')),
  invited_by    uuid references public.members(id),
  joined_at     timestamptz not null default now()
);
comment on table public.members is 'One row per person who redeemed an invitation. Email stays in auth.users only.';

create table public.member_roles (
  member_id   uuid not null references public.members(id),
  role        text not null check (role in ('moderator','researcher','reviewer','admin')),
  granted_by  uuid references public.members(id),
  granted_at  timestamptz not null default now(),
  primary key (member_id, role)
);

create table public.invitations (
  id               bigint generated always as identity primary key,
  code_hash        bytea not null unique,
  created_by       uuid references public.members(id),
  note             text check (char_length(note) <= 200),
  recipient_email  text check (char_length(recipient_email) <= 254),
  max_uses         int not null default 1 check (max_uses between 1 and 100),
  use_count        int not null default 0,
  expires_at       timestamptz not null,
  revoked_at       timestamptz,
  created_at       timestamptz not null default now(),
  check (use_count <= max_uses)
);
comment on table public.invitations is 'Only the SHA-256 of each code is stored. The code itself is shown once, when it is created.';

create table public.invitation_redemptions (
  invitation_id  bigint not null references public.invitations(id),
  member_id      uuid not null references public.members(id),
  redeemed_at    timestamptz not null default now(),
  primary key (invitation_id, member_id)
);

create table public.categories (
  id           bigint generated always as identity primary key,
  slug         text not null unique check (slug ~ '^[a-z0-9-]{2,40}$'),
  title        text not null check (char_length(title) between 2 and 80),
  description  text not null default '' check (char_length(description) <= 300),
  sort_order   int not null default 0,
  locked       boolean not null default false
);

create table public.threads (
  id            bigint generated always as identity primary key,
  category_id   bigint not null references public.categories(id),
  author_id     uuid not null references public.members(id),
  title         text not null check (char_length(btrim(title)) between 3 and 200),
  status        text not null default 'open' check (status in ('open','locked','hidden')),
  created_at    timestamptz not null default now(),
  last_post_at  timestamptz not null default now()
);
create index threads_category_recent on public.threads (category_id, last_post_at desc);

create table public.posts (
  id          bigint generated always as identity primary key,
  thread_id   bigint not null references public.threads(id),
  author_id   uuid not null references public.members(id),
  body        text not null check (char_length(btrim(body)) between 1 and 20000),
  created_at  timestamptz not null default now(),
  edited_at   timestamptz,
  hidden_at   timestamptz,
  hidden_by   uuid references public.members(id)
);
create index posts_thread_order on public.posts (thread_id, id);
create index posts_author_recent on public.posts (author_id, created_at desc);

create table public.post_revisions (
  id          bigint generated always as identity primary key,
  post_id     bigint not null references public.posts(id),
  editor_id   uuid not null references public.members(id),
  prior_body  text not null,
  created_at  timestamptz not null default now()
);
comment on table public.post_revisions is 'Append-only. Every edit stores the text it replaced.';
create index post_revisions_post on public.post_revisions (post_id, id);

create table public.reports (
  id            bigint generated always as identity primary key,
  reporter_id   uuid not null references public.members(id),
  post_id       bigint not null references public.posts(id),
  reason        text not null check (char_length(btrim(reason)) between 3 and 1000),
  created_at    timestamptz not null default now(),
  resolved_at   timestamptz,
  resolved_by   uuid references public.members(id),
  resolution    text check (char_length(resolution) <= 1000)
);

create table public.moderation_actions (
  id            bigint generated always as identity primary key,
  moderator_id  uuid not null references public.members(id),
  action        text not null,
  subject_type  text not null check (subject_type in ('post','thread','member','report','role','invitation')),
  subject_id    text not null,
  reason        text not null check (char_length(btrim(reason)) between 3 and 1000),
  created_at    timestamptz not null default now()
);
comment on table public.moderation_actions is 'Append-only, visible to every member, so moderation is accountable.';

create table public.research_items (
  id                    bigint generated always as identity primary key,
  slug                  text not null unique check (slug ~ '^[a-z0-9-]{3,80}$'),
  title                 text not null check (char_length(title) between 3 and 200),
  question              text not null check (char_length(question) between 3 and 1000),
  created_by            uuid not null references public.members(id),
  created_at            timestamptz not null default now(),
  published_version_id  bigint
);

create table public.research_versions (
  id                 bigint generated always as identity primary key,
  item_id            bigint not null references public.research_items(id),
  version_no         int not null,
  author_id          uuid not null references public.members(id),
  summary            text not null check (char_length(summary) between 10 and 4000),
  body               text not null check (char_length(body) <= 200000),
  methods            text not null check (char_length(methods) between 3 and 20000),
  limitations        text not null check (char_length(limitations) between 3 and 20000),
  reason_for_change  text not null check (char_length(reason_for_change) between 3 and 2000),
  created_at         timestamptz not null default now(),
  unique (item_id, version_no)
);
comment on table public.research_versions is 'Append-only. A change is a new version with a reason, never an edit.';

alter table public.research_items
  add constraint research_items_published_fk
  foreign key (published_version_id) references public.research_versions(id);

create table public.research_sources (
  id                    bigint generated always as identity primary key,
  version_id            bigint not null references public.research_versions(id),
  url                   text not null check (url ~ '^https?://' and char_length(url) <= 2000),
  title                 text not null check (char_length(title) between 1 and 500),
  publisher             text check (char_length(publisher) <= 200),
  published_at_claimed  date,
  retrieved_at          timestamptz not null default now(),
  content_sha256        text check (content_sha256 ~ '^[0-9a-f]{64}$'),
  quote                 text check (char_length(quote) <= 5000),
  locator               text check (char_length(locator) <= 200),
  created_at            timestamptz not null default now()
);
comment on column public.research_sources.published_at_claimed is 'The date the publisher claims. retrieved_at is when we captured it. They are kept apart on purpose.';
comment on column public.research_sources.locator is 'Page number, section or timestamp where the quote appears.';
create index research_sources_version on public.research_sources (version_id);

create table public.research_publication_events (
  id           bigint generated always as identity primary key,
  item_id      bigint not null references public.research_items(id),
  version_id   bigint not null references public.research_versions(id),
  event_type   text not null check (event_type in ('published','corrected','retracted')),
  reason       text not null check (char_length(btrim(reason)) between 3 and 2000),
  reviewer_id  uuid not null references public.members(id),
  created_at   timestamptz not null default now()
);
comment on table public.research_publication_events is 'Append-only. This is the public Record History.';

create table public.audit_events (
  id           bigint generated always as identity primary key,
  actor_id     uuid,
  table_name   text not null,
  operation    text not null,
  row_id       text not null,
  row_sha256   text not null,
  prior_hash   text,
  event_hash   text not null,
  created_at   timestamptz not null default now()
);
comment on table public.audit_events is 'Append-only hash chain. Stores a hash of each row, not its text, so private content does not leak into the log.';

-- ---------------------------------------------------------------------------
-- Helpers (private schema, not exposed by the API)
-- ---------------------------------------------------------------------------

create or replace function private.is_member() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.members m where m.id = auth.uid() and m.status = 'active');
$$;

create or replace function private.has_role(wanted text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.member_roles r join public.members m on m.id = r.member_id
    where r.member_id = auth.uid() and m.status = 'active'
      and (r.role = wanted or r.role = 'admin'));
$$;

create or replace function private.require_role(wanted text) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.has_role(wanted) then
    raise exception 'Not allowed: needs the % role', wanted using errcode = '42501';
  end if;
end $$;

create or replace function private.version_is_public(v bigint) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.research_publication_events e
    where e.version_id = v);
$$;
comment on function private.version_is_public(bigint) is
  'True once a reviewer has acted on a version. Retracted versions stay readable, marked as retracted, because that is what Record History is for.';

grant execute on function private.is_member(), private.has_role(text), private.version_is_public(bigint)
  to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Append-only guard and audit chain
-- ---------------------------------------------------------------------------

create or replace function private.forbid_change() returns trigger
language plpgsql as $$
begin
  raise exception '% is append-only; % is not allowed', tg_table_name, tg_op
    using errcode = '42501', hint = 'Add a new row instead. Legal or privacy removals go through the documented exception process.';
end $$;

do $$
declare t text;
begin
  foreach t in array array['post_revisions','moderation_actions','research_versions',
                           'research_sources','research_publication_events','audit_events',
                           'invitation_redemptions']
  loop
    execute format('create trigger %I before update or delete on public.%I
                    for each row execute function private.forbid_change()', t || '_append_only', t);
    execute format('create trigger %I before truncate on public.%I
                    for each statement execute function private.forbid_change()', t || '_no_truncate', t);
  end loop;
end $$;

create or replace function private.audit() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  prev text;
  rh   text;
  rid  text;
begin
  -- one writer at a time so the chain stays linear
  perform pg_advisory_xact_lock(hashtext('the_way_audit_chain'));
  select a.event_hash into prev from public.audit_events a order by a.id desc limit 1;
  rid := coalesce(to_jsonb(new)->>'id', to_jsonb(new)->>'member_id', '?');
  rh  := encode(extensions.digest(to_jsonb(new)::text, 'sha256'), 'hex');
  insert into public.audit_events (actor_id, table_name, operation, row_id, row_sha256, prior_hash, event_hash)
  values (auth.uid(), tg_table_name, tg_op, rid, rh, prev,
          encode(extensions.digest(coalesce(prev,'genesis') || '|' || tg_table_name || '|' || tg_op || '|' || rid || '|' || rh, 'sha256'), 'hex'));
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['members','member_roles','invitations','threads','posts','post_revisions',
                           'reports','moderation_actions','research_items','research_versions',
                           'research_sources','research_publication_events']
  loop
    execute format('create trigger %I after insert or update on public.%I
                    for each row execute function private.audit()', t || '_audit', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Content triggers: authorship, edit history, rate limits
-- ---------------------------------------------------------------------------

create or replace function private.before_thread_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.author_id := auth.uid();
  new.status := 'open';
  new.created_at := now();
  new.last_post_at := now();
  if (select count(*) from public.threads t
      where t.author_id = new.author_id and t.created_at > now() - interval '1 hour') >= 5 then
    raise exception 'Slow down: at most 5 new threads an hour' using errcode = '54000';
  end if;
  return new;
end $$;
create trigger threads_before_insert before insert on public.threads
  for each row execute function private.before_thread_insert();

create or replace function private.before_post_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.author_id := auth.uid();
  new.created_at := now();
  new.edited_at := null;
  new.hidden_at := null;
  new.hidden_by := null;
  if (select count(*) from public.posts p
      where p.author_id = new.author_id and p.created_at > now() - interval '10 minutes') >= 20 then
    raise exception 'Slow down: at most 20 posts every 10 minutes' using errcode = '54000';
  end if;
  return new;
end $$;
create trigger posts_before_insert before insert on public.posts
  for each row execute function private.before_post_insert();

create or replace function private.after_post_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.threads set last_post_at = new.created_at where id = new.thread_id;
  return new;
end $$;
create trigger posts_after_insert after insert on public.posts
  for each row execute function private.after_post_insert();

create or replace function private.before_post_update() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.body is distinct from old.body then
    insert into public.post_revisions (post_id, editor_id, prior_body)
    values (old.id, coalesce(auth.uid(), old.author_id), old.body);
    new.edited_at := now();
  end if;
  -- authorship and timestamps never change
  new.author_id := old.author_id;
  new.thread_id := old.thread_id;
  new.created_at := old.created_at;
  return new;
end $$;
create trigger posts_before_update before update on public.posts
  for each row execute function private.before_post_update();

create or replace function private.before_report_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.reporter_id := auth.uid();
  new.created_at := now();
  new.resolved_at := null; new.resolved_by := null; new.resolution := null;
  return new;
end $$;
create trigger reports_before_insert before insert on public.reports
  for each row execute function private.before_report_insert();

create or replace function private.before_research_item_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.created_by := auth.uid();
  new.created_at := now();
  new.published_version_id := null;
  return new;
end $$;
create trigger research_items_before_insert before insert on public.research_items
  for each row execute function private.before_research_item_insert();

create or replace function private.before_research_version_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtext('research_version_' || new.item_id));
  new.author_id := auth.uid();
  new.created_at := now();
  select coalesce(max(v.version_no), 0) + 1 into new.version_no
    from public.research_versions v where v.item_id = new.item_id;
  return new;
end $$;
create trigger research_versions_before_insert before insert on public.research_versions
  for each row execute function private.before_research_version_insert();

create or replace function private.before_research_source_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  -- sources freeze once their version has been reviewed
  if exists (select 1 from public.research_publication_events e where e.version_id = new.version_id) then
    raise exception 'This version has already been reviewed; add sources to a new version' using errcode = '42501';
  end if;
  new.created_at := now();
  return new;
end $$;
create trigger research_sources_before_insert before insert on public.research_sources
  for each row execute function private.before_research_source_insert();

-- ---------------------------------------------------------------------------
-- Privileges: revoke the Supabase defaults, grant back narrowly
-- ---------------------------------------------------------------------------

revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

grant select on public.members, public.member_roles, public.categories, public.threads, public.posts,
  public.post_revisions, public.reports, public.moderation_actions, public.invitations,
  public.invitation_redemptions, public.audit_events to authenticated;
grant select on public.research_items, public.research_versions, public.research_sources,
  public.research_publication_events to anon, authenticated;

grant update (display_name) on public.members to authenticated;
grant insert (category_id, title) on public.threads to authenticated;
grant insert (thread_id, body) on public.posts to authenticated;
grant update (body) on public.posts to authenticated;
grant insert (post_id, reason) on public.reports to authenticated;
grant insert (slug, title, question) on public.research_items to authenticated;
grant insert (item_id, summary, body, methods, limitations, reason_for_change) on public.research_versions to authenticated;
grant insert (version_id, url, title, publisher, published_at_claimed, retrieved_at, content_sha256, quote, locator)
  on public.research_sources to authenticated;

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------

alter table public.members                     enable row level security;
alter table public.member_roles                enable row level security;
alter table public.invitations                 enable row level security;
alter table public.invitation_redemptions      enable row level security;
alter table public.categories                  enable row level security;
alter table public.threads                     enable row level security;
alter table public.posts                       enable row level security;
alter table public.post_revisions              enable row level security;
alter table public.reports                     enable row level security;
alter table public.moderation_actions          enable row level security;
alter table public.research_items              enable row level security;
alter table public.research_versions           enable row level security;
alter table public.research_sources            enable row level security;
alter table public.research_publication_events enable row level security;
alter table public.audit_events                enable row level security;

-- members
create policy members_read on public.members for select to authenticated
  using (private.is_member() or id = auth.uid());
create policy members_rename_self on public.members for update to authenticated
  using (id = auth.uid() and status = 'active') with check (id = auth.uid());

create policy roles_read on public.member_roles for select to authenticated
  using (private.is_member());

create policy invitations_admin_read on public.invitations for select to authenticated
  using (private.has_role('admin'));
create policy redemptions_admin_read on public.invitation_redemptions for select to authenticated
  using (private.has_role('admin'));

-- Commons
create policy categories_read on public.categories for select to authenticated
  using (private.is_member());

create policy threads_read on public.threads for select to authenticated
  using (private.is_member() and (status <> 'hidden' or private.has_role('moderator')));
create policy threads_create on public.threads for insert to authenticated
  with check (private.is_member()
    and exists (select 1 from public.categories c where c.id = category_id and not c.locked));

create policy posts_read on public.posts for select to authenticated
  using (private.is_member()
    and (hidden_at is null or author_id = auth.uid() or private.has_role('moderator'))
    and exists (select 1 from public.threads t where t.id = thread_id));
create policy posts_create on public.posts for insert to authenticated
  with check (private.is_member()
    and exists (select 1 from public.threads t where t.id = thread_id and t.status = 'open'));
create policy posts_edit_own on public.posts for update to authenticated
  using (private.is_member() and author_id = auth.uid() and hidden_at is null)
  with check (author_id = auth.uid());

create policy revisions_read on public.post_revisions for select to authenticated
  using (private.is_member() and exists (
    select 1 from public.posts p where p.id = post_id));

create policy reports_read on public.reports for select to authenticated
  using (reporter_id = auth.uid() or private.has_role('moderator'));
create policy reports_create on public.reports for insert to authenticated
  with check (private.is_member() and exists (select 1 from public.posts p where p.id = post_id));

create policy moderation_read on public.moderation_actions for select to authenticated
  using (private.is_member());

-- Observatory: the public sees published work, the desk sees drafts
create policy research_items_read on public.research_items for select to anon, authenticated
  using (published_version_id is not null or private.has_role('researcher') or private.has_role('reviewer'));
create policy research_items_create on public.research_items for insert to authenticated
  with check (private.has_role('researcher'));

create policy research_versions_read on public.research_versions for select to anon, authenticated
  using (private.version_is_public(id) or private.has_role('researcher') or private.has_role('reviewer'));
create policy research_versions_create on public.research_versions for insert to authenticated
  with check (private.has_role('researcher'));

create policy research_sources_read on public.research_sources for select to anon, authenticated
  using (private.version_is_public(version_id) or private.has_role('researcher') or private.has_role('reviewer'));
create policy research_sources_create on public.research_sources for insert to authenticated
  with check (private.has_role('researcher') and exists (
    select 1 from public.research_versions v where v.id = version_id and v.author_id = auth.uid()));

create policy research_events_read on public.research_publication_events for select to anon, authenticated
  using (true);

create policy audit_read on public.audit_events for select to authenticated
  using (private.has_role('admin') or private.has_role('reviewer'));

-- ---------------------------------------------------------------------------
-- Functions the site calls (RPC)
-- ---------------------------------------------------------------------------

-- Start a thread and its first post together, so a failed post never leaves an empty thread.
-- SECURITY INVOKER: the caller's own row-level security and triggers apply.
create or replace function public.start_thread(category_id bigint, title text, body text)
returns bigint language plpgsql security invoker set search_path = '' as $$
declare tid bigint;
begin
  insert into public.threads (category_id, title) values (start_thread.category_id, btrim(start_thread.title))
  returning id into tid;
  insert into public.posts (thread_id, body) values (tid, start_thread.body);
  return tid;
end $$;

-- Mint an invitation. Shared by the admin RPC and the one-time bootstrap.
create or replace function private.mint_invitation(
  p_creator uuid, p_note text, p_max_uses int, p_days int, p_email text)
returns text language plpgsql security definer set search_path = '' as $$
declare code text;
begin
  -- 128 bits of randomness, grouped for reading aloud: WAY-xxxxxxxx-xxxxxxxx-xxxxxxxx-xxxxxxxx
  code := 'WAY-' || array_to_string(array(
            select substr(h, i, 8) from (select encode(extensions.gen_random_bytes(16), 'hex') h) s,
            generate_series(1, 25, 8) i), '-');
  insert into public.invitations (code_hash, created_by, note, recipient_email, max_uses, expires_at)
  values (extensions.digest(upper(code), 'sha256'), p_creator, p_note, lower(nullif(btrim(p_email), '')),
          greatest(1, least(coalesce(p_max_uses, 1), 100)),
          now() + make_interval(days => greatest(1, least(coalesce(p_days, 14), 90))));
  return upper(code);
end $$;
revoke all on function private.mint_invitation(uuid, text, int, int, text) from public, anon, authenticated;

create or replace function public.create_invitation(
  note text default null, max_uses int default 1, valid_days int default 14, recipient_email text default null)
returns text language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_role('admin');
  return private.mint_invitation(auth.uid(), note, max_uses, valid_days, recipient_email);
end $$;

create or replace function public.revoke_invitation(invitation_id bigint, reason text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_role('admin');
  update public.invitations set revoked_at = now() where id = invitation_id and revoked_at is null;
  insert into public.moderation_actions (moderator_id, action, subject_type, subject_id, reason)
  values (auth.uid(), 'revoke_invitation', 'invitation', invitation_id::text, reason);
end $$;

create or replace function public.redeem_invitation(code text, display_name text)
returns public.members language plpgsql security definer set search_path = '' as $$
declare
  inv public.invitations;
  me  public.members;
  my_email text := lower(auth.jwt() ->> 'email');
begin
  if auth.uid() is null then
    raise exception 'Sign in first' using errcode = '28000';
  end if;
  if exists (select 1 from public.members m where m.id = auth.uid()) then
    raise exception 'You are already a member' using errcode = '23505';
  end if;

  select * into inv from public.invitations i
   where i.code_hash = extensions.digest(upper(btrim(code)), 'sha256')
   for update;

  if inv.id is null or inv.revoked_at is not null or inv.expires_at < now()
     or inv.use_count >= inv.max_uses
     or (inv.recipient_email is not null and inv.recipient_email is distinct from my_email) then
    -- one message for every failure, so codes can't be probed
    raise exception 'That invitation code is not valid' using errcode = '22023';
  end if;

  insert into public.members (id, display_name, invited_by)
  values (auth.uid(), btrim(display_name), inv.created_by)
  returning * into me;
  insert into public.invitation_redemptions (invitation_id, member_id) values (inv.id, me.id);
  update public.invitations set use_count = use_count + 1 where id = inv.id;
  return me;
end $$;

create or replace function public.moderate(action text, subject_id bigint, reason text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_role('moderator');
  case action
    when 'hide_post' then
      update public.posts set hidden_at = now(), hidden_by = auth.uid() where id = subject_id and hidden_at is null;
    when 'unhide_post' then
      update public.posts set hidden_at = null, hidden_by = null where id = subject_id;
    when 'lock_thread' then
      update public.threads set status = 'locked' where id = subject_id;
    when 'unlock_thread', 'unhide_thread' then
      update public.threads set status = 'open' where id = subject_id;
    when 'hide_thread' then
      update public.threads set status = 'hidden' where id = subject_id;
    else
      raise exception 'Unknown moderation action %', action using errcode = '22023';
  end case;
  if not found then
    raise exception 'Nothing to change for % %', action, subject_id using errcode = '02000';
  end if;
  insert into public.moderation_actions (moderator_id, action, subject_type, subject_id, reason)
  values (auth.uid(), action, case when action like '%post' then 'post' else 'thread' end, subject_id::text, reason);
end $$;

create or replace function public.resolve_report(report_id bigint, resolution text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_role('moderator');
  update public.reports set resolved_at = now(), resolved_by = auth.uid(), resolution = resolve_report.resolution
   where id = report_id and resolved_at is null;
  if not found then raise exception 'Report already resolved or missing' using errcode = '02000'; end if;
  insert into public.moderation_actions (moderator_id, action, subject_type, subject_id, reason)
  values (auth.uid(), 'resolve_report', 'report', report_id::text, resolution);
end $$;

create or replace function public.set_member_status(member_id uuid, new_status text, reason text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_role('admin');
  if new_status not in ('active','suspended') then
    raise exception 'Status must be active or suspended' using errcode = '22023';
  end if;
  if member_id = auth.uid() then
    raise exception 'You cannot change your own status' using errcode = '42501';
  end if;
  update public.members set status = new_status where id = member_id;
  if not found then raise exception 'No such member' using errcode = '02000'; end if;
  insert into public.moderation_actions (moderator_id, action, subject_type, subject_id, reason)
  values (auth.uid(), 'set_status_' || new_status, 'member', member_id::text, reason);
end $$;

create or replace function public.set_role(member_id uuid, role text, grant_it boolean, reason text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_role('admin');
  if role not in ('moderator','researcher','reviewer','admin') then
    raise exception 'Unknown role %', role using errcode = '22023';
  end if;
  if grant_it then
    insert into public.member_roles (member_id, role, granted_by) values (member_id, role, auth.uid())
    on conflict do nothing;
  else
    if role = 'admin' and member_id = auth.uid() then
      raise exception 'An admin cannot remove their own admin role' using errcode = '42501';
    end if;
    delete from public.member_roles r where r.member_id = set_role.member_id and r.role = set_role.role;
  end if;
  insert into public.moderation_actions (moderator_id, action, subject_type, subject_id, reason)
  values (auth.uid(), case when grant_it then 'grant_' else 'remove_' end || role, 'role', member_id::text, reason);
end $$;

-- A reviewer (never the version's own author) publishes, corrects or retracts.
create or replace function public.review_research_version(version_id bigint, event_type text, reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare v public.research_versions;
begin
  perform private.require_role('reviewer');
  select * into v from public.research_versions rv where rv.id = version_id;
  if v.id is null then raise exception 'No such version' using errcode = '02000'; end if;
  if v.author_id = auth.uid() then
    raise exception 'A version must be reviewed by someone other than its author' using errcode = '42501';
  end if;
  if event_type not in ('published','corrected','retracted') then
    raise exception 'Unknown event type %', event_type using errcode = '22023';
  end if;
  if event_type = 'published' and not exists (select 1 from public.research_sources s where s.version_id = v.id) then
    raise exception 'A version needs at least one source before it can be published' using errcode = '23514';
  end if;
  insert into public.research_publication_events (item_id, version_id, event_type, reason, reviewer_id)
  values (v.item_id, v.id, event_type, reason, auth.uid());
  if event_type in ('published','corrected') then
    update public.research_items set published_version_id = v.id where id = v.item_id;
  elsif event_type = 'retracted' then
    update public.research_items i set published_version_id = (
      select e.version_id from public.research_publication_events e
       where e.item_id = v.item_id and e.event_type in ('published','corrected')
         and e.version_id <> v.id
         and not exists (select 1 from public.research_publication_events r
                          where r.version_id = e.version_id and r.event_type = 'retracted')
       order by e.id desc limit 1)
    where i.id = v.item_id and i.published_version_id = v.id;
  end if;
end $$;

revoke all on function public.start_thread(bigint,text,text), public.create_invitation(text,int,int,text), public.revoke_invitation(bigint,text),
  public.redeem_invitation(text,text), public.moderate(text,bigint,text), public.resolve_report(bigint,text),
  public.set_member_status(uuid,text,text), public.set_role(uuid,text,boolean,text),
  public.review_research_version(bigint,text,text) from public, anon;
grant execute on function public.start_thread(bigint,text,text), public.create_invitation(text,int,int,text), public.revoke_invitation(bigint,text),
  public.redeem_invitation(text,text), public.moderate(text,bigint,text), public.resolve_report(bigint,text),
  public.set_member_status(uuid,text,text), public.set_role(uuid,text,boolean,text),
  public.review_research_version(bigint,text,text) to authenticated;

-- Someone asks to leave and be forgotten. Run by Frank in the SQL editor, never from the site:
--   select private.forget_member('<member uuid>', 'Requested by email on <date>');
-- Their name and email are removed and they can no longer sign in. Their posts stay in the
-- Commons record under "Former member". Removing the posts themselves is a privacy exception
-- (see README) because it means switching off the append-only guard on purpose.
create or replace function private.forget_member(p_member uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.members set display_name = 'Former member', status = 'left' where id = p_member;
  if not found then raise exception 'No such member'; end if;
  delete from public.member_roles where member_id = p_member;
  update auth.users set email = p_member::text || '@forgotten.invalid' where id = p_member;
  insert into public.moderation_actions (moderator_id, action, subject_type, subject_id, reason)
  select m.id, 'forget_member', 'member', p_member::text, p_reason
    from public.members m join public.member_roles r on r.member_id = m.id and r.role = 'admin'
   order by m.joined_at limit 1;
end $$;
revoke all on function private.forget_member(uuid, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Starting categories (from the ChatGPT Commons design)
-- ---------------------------------------------------------------------------

insert into public.categories (slug, title, description, sort_order) values
  ('general',  'General discussion',  'Introductions and questions', 10),
  ('ideas',    'Ideas and proposals', 'Policies, hypotheses and counterarguments', 20),
  ('workshop', 'The workshop',        'Research, models, methods and code', 30),
  ('ballot',   'Ballot questions',    'What is on the ballot and what it actually says. The Way never tells anyone how to vote.', 40);

commit;
