-- The Way 0029: the monthly public "By the numbers" summary. Needs 0028.
-- public.public_numbers() returns ONE small jsonb for the last full calendar month. It is readable by anyone on
-- purpose, so it only ever holds what Frank approved to publish: monthly totals, most-read pages and topics,
-- state-guide interest, number of countries, member count and sources checked. It never holds referrers, daily
-- rows or per-member data, and every count under 10 comes back as the text "under 10".
-- Safe to run again.
alter table public.site_stats_meta add column if not exists window_from date;

create or replace function private.u10(n bigint) returns jsonb
language sql immutable set search_path = '' as $$
  select case when n is null or n < 10 then to_jsonb('under 10'::text) else to_jsonb(n) end;
$$;

create or replace function public.public_numbers() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  m0 date := (date_trunc('month', current_date) - interval '1 month')::date;
  m1 date := date_trunc('month', current_date)::date;
  meta public.site_stats_meta;
  v bigint; pv bigint; nc bigint; nm bigint; ns bigint;
  pages jsonb; topics jsonb; states jsonb;
begin
  select * into meta from public.site_stats_meta where id = 1;
  -- only publish a month once a refresh after the month ended has covered all of it
  if meta.id is null or meta.ok is not true or meta.window_from is null
     or meta.refreshed_at < m1::timestamptz or meta.window_from > m0 then
    return jsonb_build_object('ready', false, 'month', to_char(m0, 'YYYY-MM'));
  end if;

  select coalesce(sum(visits), 0), coalesce(sum(page_views), 0) into v, pv
    from public.site_stats_daily where kind = 'total' and day >= m0 and day < m1;
  select count(distinct label) into nc
    from public.site_stats_daily where kind = 'country' and day >= m0 and day < m1 and label not in ('XX', 'T1');
  select count(*) into nm from public.members where status = 'active';
  select count(distinct source_id) into ns from public.research_source_snapshots;

  -- public pages only, old /preview/pages paths folded into their new place, no query strings
  with pg as materialized (
    select regexp_replace(label, '^/preview/pages', '') as path, sum(page_views)::bigint as views
      from public.site_stats_daily
     where kind = 'page' and day >= m0 and day < m1
       and label ~ '^/[A-Za-z0-9._/-]*$' and label !~ '^/members(/|$)'
     group by 1)
  select
    (select coalesce(jsonb_agg(jsonb_build_object('path', t.path, 'views', t.views) order by t.views desc, t.path), '[]')
       from (select path, views from pg where views >= 10 order by views desc, path limit 10) t),
    (select coalesce(jsonb_agg(jsonb_build_object('topic', g.topic, 'views', g.views) order by g.views desc, g.topic), '[]')
       from (select case
                when path = '/' then 'Home'
                when path ~ '^/cases(/|$)' then 'History cases'
                when path ~ '^/(guide|states)(/|$)' or path ~ '^/guide-' then 'State guides'
                when path ~ '^/map(/|-)' then 'State maps'
                when path ~ '^/news(/|$)' then 'News'
                when path ~ '^/(research|development|ai)(/|$)' then 'Research and methods'
                when path ~ '^/timeline(/|$)' then 'Timeline'
                else 'Other pages' end as topic, sum(views)::bigint as views
               from pg group by 1) g where g.views >= 10)
    into pages, topics;
  select coalesce(jsonb_agg(jsonb_build_object('code', label, 'views', private.u10(v2)) order by label), '[]') into states
    from (select label, sum(page_views)::bigint as v2 from public.site_stats_daily
           where kind = 'state' and day >= m0 and day < m1 group by label) s;

  return jsonb_build_object('ready', true, 'month', to_char(m0, 'YYYY-MM'),
    'visits', private.u10(v), 'page_views', private.u10(pv), 'countries', private.u10(nc),
    'members', private.u10(nm), 'sources_checked', private.u10(ns),
    'pages', pages, 'topics', topics, 'states', states);
end $$;
revoke all on function public.public_numbers() from public;
grant execute on function public.public_numbers() to anon, authenticated;
