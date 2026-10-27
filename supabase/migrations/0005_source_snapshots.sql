-- The Way: snapshots of every source the AI checks ("Wayback + screenshot", Frank, Oct 13 2026).
-- Run once in the Supabase SQL editor, after 0004_findings.sql.
--
-- Each source gets two copies, both permanent:
--   * wayback: a public copy in the Internet Archive, with the SHA-256 and size of the
--     archived bytes. Linked on the public finding.
--   * private: a screenshot and the page text, stored in the private Storage bucket
--     "source-snapshots", with SHA-256, size and capture time. Only researchers and
--     reviewers can open them.
-- Only the checker (Frak, holding its FRAK- key) can write either. For a file it first asks
-- for a one-time upload ticket: an unguessable path that is valid for 15 minutes. The bucket
-- lets the public API create an object only at a live ticket path, and nobody can update or
-- delete objects, so a copy can never be overwritten.

begin;

create table public.research_source_snapshots (
  id           bigint generated always as identity primary key,
  source_id    bigint not null references public.research_sources(id),
  kind         text not null check (kind in ('wayback','private')),
  archive_url  text check (archive_url ~ '^https://web\.archive\.org/web/[0-9]{14}/https?://' and char_length(archive_url) <= 2200),
  sha256       text check (sha256 ~ '^[0-9a-f]{64}$'),
  bytes        bigint check (bytes between 0 and 100000000),
  shot_path    text check (shot_path ~ '^[0-9]+/shot-[0-9a-f]{32}\.png$'),
  shot_sha256  text check (shot_sha256 ~ '^[0-9a-f]{64}$'),
  shot_bytes   bigint check (shot_bytes between 0 and 20000000),
  text_path    text check (text_path ~ '^[0-9]+/text-[0-9a-f]{32}\.txt$'),
  text_sha256  text check (text_sha256 ~ '^[0-9a-f]{64}$'),
  text_bytes   bigint check (text_bytes between 0 and 20000000),
  captured_at  timestamptz not null,
  created_at   timestamptz not null default now(),
  unique (source_id, kind),
  check ((kind = 'wayback' and archive_url is not null and sha256 is not null and bytes is not null)
      or (kind = 'private' and text_path is not null and text_sha256 is not null and text_bytes is not null
          and (shot_path is null) = (shot_sha256 is null) and (shot_path is null) = (shot_bytes is null)))
);
comment on table public.research_source_snapshots is 'Append-only. Permanent copies of each source: a public Wayback copy and a private screenshot + text.';
create index research_source_snapshots_source on public.research_source_snapshots (source_id);

create trigger research_source_snapshots_append_only before update or delete on public.research_source_snapshots
  for each row execute function private.forbid_change();
create trigger research_source_snapshots_no_truncate before truncate on public.research_source_snapshots
  for each statement execute function private.forbid_change();
create trigger research_source_snapshots_audit after insert on public.research_source_snapshots
  for each row execute function private.audit();

revoke all on public.research_source_snapshots from anon, authenticated;
grant select on public.research_source_snapshots to anon, authenticated;
alter table public.research_source_snapshots enable row level security;
create policy snapshots_read on public.research_source_snapshots for select to anon, authenticated
  using (exists (select 1 from public.research_sources s where s.id = source_id
                  and (private.version_is_public(s.version_id) or private.has_role('researcher') or private.has_role('reviewer'))));

-- one-time upload tickets and retry bookkeeping (private schema: not reachable through the API)
create table private.snapshot_tickets (
  path        text primary key,
  source_id   bigint not null references public.research_sources(id),
  part        text not null check (part in ('shot','text')),
  expires_at  timestamptz not null,
  created_at  timestamptz not null default now()
);
create table private.snapshot_attempts (
  source_id   bigint not null references public.research_sources(id),
  kind        text not null check (kind in ('wayback','private')),
  tries       int not null default 0,
  last_try    timestamptz,
  last_error  text,
  primary key (source_id, kind)
);
revoke all on private.snapshot_tickets, private.snapshot_attempts from public, anon, authenticated;
alter table private.snapshot_tickets enable row level security;
alter table private.snapshot_attempts enable row level security;

-- ---------------------------------------------------------------------------
-- Storage bucket and its rules
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('source-snapshots', 'source-snapshots', false, 15728640, array['image/png', 'text/plain'])
on conflict (id) do nothing;

create or replace function private.snapshot_upload_ok(object_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from private.snapshot_tickets t where t.path = object_name and t.expires_at > now());
$$;
revoke all on function private.snapshot_upload_ok(text) from public;
grant execute on function private.snapshot_upload_ok(text) to anon, authenticated;

-- create only at a live ticket path (the upload reads its own row back, so select is allowed for that path too)
create policy source_snapshots_ticket_insert on storage.objects for insert to anon
  with check (bucket_id = 'source-snapshots' and private.snapshot_upload_ok(name));
create policy source_snapshots_ticket_select on storage.objects for select to anon
  using (bucket_id = 'source-snapshots' and private.snapshot_upload_ok(name));
-- researchers and reviewers can open the private copies; nobody can update or delete them
create policy source_snapshots_desk_read on storage.objects for select to authenticated
  using (bucket_id = 'source-snapshots' and (private.has_role('researcher') or private.has_role('reviewer')));

-- ---------------------------------------------------------------------------
-- What the checker calls
-- ---------------------------------------------------------------------------
-- Sources to snap: only sources of versions their author sent to the AI, newest first.
create or replace function public.checker_next_snaps(checker_key text, max_items int default 5) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare out jsonb;
begin
  perform private.checker_key_id(checker_key);
  select coalesce(jsonb_agg(x order by x->>'source_id' desc), '[]'::jsonb) into out from (
    select jsonb_build_object('source_id', s.id, 'url', s.url, 'need', jsonb_agg(k.kind order by k.kind)) x
      from public.research_sources s
      cross join (values ('wayback'), ('private')) k(kind)
      left join private.snapshot_attempts a on a.source_id = s.id and a.kind = k.kind
     where exists (select 1 from public.research_prechecks p where p.version_id = s.version_id)
       and s.created_at > now() - interval '60 days'
       and not exists (select 1 from public.research_source_snapshots n where n.source_id = s.id and n.kind = k.kind)
       and (a.tries is null or (a.tries < 4 and a.last_try < now() - make_interval(hours => a.tries * a.tries)))
     group by s.id, s.url
     order by s.id desc
     limit greatest(1, least(coalesce(max_items, 5), 20))) q;
  return out;
end $$;

create or replace function public.checker_upload_ticket(checker_key text, source_id bigint, part text) returns text
language plpgsql security definer set search_path = '' as $$
declare p text;
begin
  perform private.checker_key_id(checker_key);
  if part not in ('shot','text') then raise exception 'Unknown part' using errcode = '22023'; end if;
  if not exists (select 1 from public.research_sources s where s.id = checker_upload_ticket.source_id) then
    raise exception 'No such source' using errcode = '02000';
  end if;
  delete from private.snapshot_tickets where expires_at < now() - interval '1 day';
  p := checker_upload_ticket.source_id || '/' || part || '-' || encode(extensions.gen_random_bytes(16), 'hex')
       || case part when 'shot' then '.png' else '.txt' end;
  insert into private.snapshot_tickets (path, source_id, part, expires_at)
  values (p, checker_upload_ticket.source_id, part, now() + interval '15 minutes');
  return p;
end $$;

create or replace function public.checker_snapshot(
  checker_key text, source_id bigint, kind text, captured_at timestamptz,
  archive_url text default null, sha256 text default null, bytes bigint default null,
  shot_path text default null, shot_sha256 text default null, shot_bytes bigint default null,
  text_path text default null, text_sha256 text default null, text_bytes bigint default null) returns void
language plpgsql security definer set search_path = '' as $$
declare sid bigint := checker_snapshot.source_id; src_url text;
begin
  perform private.checker_key_id(checker_key);
  select s.url into src_url from public.research_sources s where s.id = sid;
  if src_url is null then raise exception 'No such source' using errcode = '02000'; end if;
  if captured_at > now() + interval '10 minutes' or captured_at < now() - interval '30 days' then
    raise exception 'Capture time is out of range' using errcode = '22023';
  end if;
  if kind = 'private' then
    -- each file must sit at a ticket issued for this source and actually be in the bucket
    if not exists (select 1 from private.snapshot_tickets t where t.path = text_path and t.source_id = sid and t.part = 'text')
       or not exists (select 1 from storage.objects o where o.bucket_id = 'source-snapshots' and o.name = text_path) then
      raise exception 'The page text was not uploaded' using errcode = '23514';
    end if;
    if shot_path is not null and (
         not exists (select 1 from private.snapshot_tickets t where t.path = shot_path and t.source_id = sid and t.part = 'shot')
         or not exists (select 1 from storage.objects o where o.bucket_id = 'source-snapshots' and o.name = shot_path)) then
      raise exception 'The screenshot was not uploaded' using errcode = '23514';
    end if;
    archive_url := null; sha256 := null; bytes := null;
  elsif kind = 'wayback' then
    shot_path := null; shot_sha256 := null; shot_bytes := null; text_path := null; text_sha256 := null; text_bytes := null;
  else
    raise exception 'Unknown kind' using errcode = '22023';
  end if;
  insert into public.research_source_snapshots (source_id, kind, archive_url, sha256, bytes,
    shot_path, shot_sha256, shot_bytes, text_path, text_sha256, text_bytes, captured_at)
  values (sid, kind, archive_url, lower(sha256), bytes, shot_path, lower(shot_sha256), shot_bytes,
          text_path, lower(text_sha256), text_bytes, captured_at)
  on conflict on constraint research_source_snapshots_source_id_kind_key do nothing;  -- the first copy stands
  delete from private.snapshot_attempts a where a.source_id = sid and a.kind = checker_snapshot.kind;
end $$;

create or replace function public.checker_snapshot_fail(checker_key text, source_id bigint, kind text, error text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.checker_key_id(checker_key);
  if kind not in ('wayback','private') then raise exception 'Unknown kind' using errcode = '22023'; end if;
  insert into private.snapshot_attempts as a (source_id, kind, tries, last_try, last_error)
  values (checker_snapshot_fail.source_id, checker_snapshot_fail.kind, 1, now(), left(checker_snapshot_fail.error, 500))
  on conflict on constraint snapshot_attempts_pkey do update set tries = a.tries + 1, last_try = now(), last_error = left(excluded.last_error, 500);
end $$;

revoke all on function public.checker_next_snaps(text,int), public.checker_upload_ticket(text,bigint,text),
  public.checker_snapshot(text,bigint,text,timestamptz,text,text,bigint,text,text,bigint,text,text,bigint),
  public.checker_snapshot_fail(text,bigint,text,text) from public, anon, authenticated;
grant execute on function public.checker_next_snaps(text,int), public.checker_upload_ticket(text,bigint,text),
  public.checker_snapshot(text,bigint,text,timestamptz,text,text,bigint,text,text,bigint,text,text,bigint),
  public.checker_snapshot_fail(text,bigint,text,text) to anon, authenticated;

commit;
