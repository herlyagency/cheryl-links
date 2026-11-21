-- Analytics v2: cookieless counting, richer (still anonymous) behaviour fields,
-- and a server-side aggregate report so the dashboard never downloads raw events.

alter table public.analytics_events
  drop constraint if exists analytics_events_event_type_check,
  drop constraint if exists analytics_events_check;

alter table public.analytics_events
  add column if not exists session uuid,
  add column if not exists identity text not null default 'persistent',
  add column if not exists city text,
  add column if not exists os text not null default '',
  add column if not exists app text not null default '',
  add column if not exists lang text not null default '',
  add column if not exists duration_s int,
  add column if not exists scroll smallint;

alter table public.analytics_events
  add constraint analytics_events_type_check
    check (event_type in ('page_view','link_click','engagement','share')),
  add constraint analytics_events_link_check
    check ((event_type = 'link_click') = (link_id is not null)),
  add constraint analytics_events_identity_check check (identity in ('daily','persistent')),
  add constraint analytics_events_city_check check (city is null or length(city) <= 80),
  add constraint analytics_events_os_check check (length(os) <= 20),
  add constraint analytics_events_app_check check (length(app) <= 30),
  add constraint analytics_events_lang_check check (lang = '' or lang ~ '^[a-z]{2,3}$'),
  add constraint analytics_events_duration_check
    check ((event_type = 'engagement') = (duration_s is not null) and (duration_s is null or duration_s between 0 and 1800)),
  add constraint analytics_events_scroll_check check (scroll is null or scroll between 0 and 100);

create index if not exists analytics_session_idx on public.analytics_events(session);
create index if not exists analytics_country_idx on public.analytics_events(country, timestamp);

-- Owner-only aggregate report. p_tz is an IANA zone used for day/hour buckets.
create or replace function public.analytics_summary(p_from timestamptz, p_to timestamptz, p_tz text default 'UTC')
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  tz text := 'UTC';
  span interval;
  unit text;
  step interval;
  p_prev timestamptz;
  result jsonb;
begin
  if not public.is_owner() then raise exception 'Owner access required' using errcode = '42501'; end if;
  if p_to <= p_from or p_to - p_from > interval '366 days' then raise exception 'Invalid date range'; end if;
  if exists (select 1 from pg_catalog.pg_timezone_names where name = p_tz) then tz := p_tz; end if;
  span := p_to - p_from;
  p_prev := p_from - span;
  unit := case when span <= interval '2 days' then 'hour' else 'day' end;
  step := case when unit = 'hour' then interval '1 hour' else interval '1 day' end;

  with
  cur as (
    select e.*, e.timestamp at time zone tz as lt
    from public.analytics_events e where e.timestamp >= p_from and e.timestamp < p_to
  ),
  prev as (
    select e.*, e.timestamp at time zone tz as lt
    from public.analytics_events e where e.timestamp >= p_prev and e.timestamp < p_from
  ),
  -- Engaged time arrives in increments; sum per session (max scroll) before taking medians.
  cur_eng as (
    select sum(duration_s) as d, max(scroll) as sc from cur
    where event_type = 'engagement' group by coalesce(session, id)
  ),
  prev_eng as (
    select sum(duration_s) as d, max(scroll) as sc from prev
    where event_type = 'engagement' group by coalesce(session, id)
  ),
  buckets as (
    select b, row_number() over (order by b) - 1 as i
    from generate_series(date_trunc(unit, p_from at time zone tz),
                         (p_to at time zone tz) - interval '1 microsecond', step) b
  ),
  sessions as (
    select session,
      bool_or(event_type = 'link_click') as clicked,
      min(timestamp) filter (where event_type = 'page_view') as opened,
      min(timestamp) filter (where event_type = 'link_click') as first_click
    from cur where session is not null group by session
    having bool_or(event_type = 'page_view')
  ),
  totals as (
    select
      count(*) filter (where event_type = 'page_view') as views,
      count(*) filter (where event_type = 'link_click') as clicks,
      count(*) filter (where event_type = 'share') as shares,
      count(distinct visitor) filter (where event_type = 'page_view') as visitors,
      count(distinct visitor) filter (where event_type = 'link_click') as clickers,
      count(distinct (lt::date)) filter (where event_type in ('page_view','link_click')) as active_days,
      (select percentile_cont(0.5) within group (order by d) from cur_eng) as median_seconds,
      (select avg(sc) from cur_eng) as avg_scroll
    from cur
  ),
  ptotals as (
    select
      count(*) filter (where event_type = 'page_view') as views,
      count(*) filter (where event_type = 'link_click') as clicks,
      count(*) filter (where event_type = 'share') as shares,
      count(distinct visitor) filter (where event_type = 'page_view') as visitors,
      count(distinct visitor) filter (where event_type = 'link_click') as clickers,
      count(distinct (lt::date)) filter (where event_type in ('page_view','link_click')) as active_days,
      (select percentile_cont(0.5) within group (order by d) from prev_eng) as median_seconds,
      (select avg(sc) from prev_eng) as avg_scroll
    from prev
  ),
  views as (select * from cur where event_type = 'page_view'),
  clicks as (select * from cur where event_type = 'link_click'),
  -- Grouped once, then joined to the bucket list (no per-bucket subqueries).
  per_bucket as (
    select date_trunc(unit, lt) as b,
      count(*) filter (where event_type = 'page_view') as v,
      count(*) filter (where event_type = 'link_click') as c
    from cur group by 1
  ),
  per_link_bucket as (
    select link_id, date_trunc(unit, lt) as b, count(*) as n from clicks group by 1, 2
  ),
  per_hour as (
    select extract(hour from lt)::int as h, 'cur' as period, count(*) as n
    from cur where event_type in ('page_view','link_click') group by 1
    union all
    select extract(hour from lt)::int, 'prev', count(*)
    from prev where event_type in ('page_view','link_click') group by 1
  ),
  recent as (
    select 29 - floor(extract(epoch from now() - e.timestamp) / 60)::int as m,
      count(*) filter (where e.event_type = 'page_view') as v,
      count(*) filter (where e.event_type = 'link_click') as c
    from public.analytics_events e
    where e.timestamp > now() - interval '30 minutes' and e.timestamp <= now()
    group by 1
  )
  select jsonb_build_object(
    'unit', unit,
    'tz', tz,
    'totals', (select to_jsonb(t) from totals t),
    'previous', (select to_jsonb(t) from ptotals t),
    'sessions', (select jsonb_build_object(
        'count', count(*),
        'bounced', count(*) filter (where not clicked),
        'median_time_to_click', percentile_cont(0.5) within group (order by extract(epoch from first_click - opened))
          filter (where first_click is not null and first_click >= opened)
      ) from sessions),
    'returning', (select count(distinct v.visitor) from views v
        where v.identity = 'persistent' and exists (
          select 1 from public.analytics_events o where o.visitor = v.visitor and o.timestamp < p_from)),
    'series', (select coalesce(jsonb_agg(jsonb_build_object(
          'at', to_char(b.b, 'YYYY-MM-DD"T"HH24:MI:SS'),
          'views', coalesce(pb.v, 0),
          'clicks', coalesce(pb.c, 0)
        ) order by b.b), '[]'::jsonb) from buckets b left join per_bucket pb on pb.b = b.b),
    'hours', (select jsonb_agg(jsonb_build_object(
          'hour', h,
          'current', coalesce((select n from per_hour where per_hour.h = g.h and period = 'cur'), 0),
          'previous', coalesce((select n from per_hour where per_hour.h = g.h and period = 'prev'), 0)
        ) order by h) from generate_series(0, 23) as g(h)),
    'weekdays', (select jsonb_agg(jsonb_build_object('day', g.d, 'count', coalesce(w.n, 0)) order by g.d)
        from generate_series(1, 7) as g(d)
        left join (select extract(isodow from lt)::int as d, count(*) as n from cur
                   where event_type in ('page_view','link_click') group by 1) w on w.d = g.d),
    'sources', (select coalesce(jsonb_agg(jsonb_build_object('source', source, 'host', host, 'count', n) order by n desc), '[]'::jsonb)
        from (select source, mode() within group (order by nullif(referrer, '')) as host, count(*) as n from views group by source) s),
    'devices', (select coalesce(jsonb_agg(jsonb_build_object('key', device, 'count', n) order by n desc), '[]'::jsonb)
        from (select device, count(*) as n from views group by device) s),
    'os', (select coalesce(jsonb_agg(jsonb_build_object('key', os, 'count', n) order by n desc), '[]'::jsonb)
        from (select os, count(*) as n from views where os <> '' group by os) s),
    'apps', (select coalesce(jsonb_agg(jsonb_build_object('key', app, 'count', n) order by n desc), '[]'::jsonb)
        from (select app, count(*) as n from views where app <> '' group by app) s),
    'languages', (select coalesce(jsonb_agg(jsonb_build_object('key', lang, 'count', n) order by n desc), '[]'::jsonb)
        from (select lang, count(*) as n from views where lang <> '' group by lang) s),
    'campaigns', (select coalesce(jsonb_agg(jsonb_build_object('campaign', campaign, 'medium', medium, 'source', source, 'count', n) order by n desc), '[]'::jsonb)
        from (select campaign, medium, source, count(*) as n from views where campaign <> '' or medium <> '' group by campaign, medium, source) s),
    'countries', (select coalesce(jsonb_agg(jsonb_build_object('key', country, 'count', n) order by n desc), '[]'::jsonb)
        from (select country, count(*) as n from cur where country is not null and event_type in ('page_view','link_click') group by country) s),
    'cities', (select coalesce(jsonb_agg(jsonb_build_object('key', city, 'country', country, 'count', n) order by n desc), '[]'::jsonb)
        from (select city, country, count(*) as n from cur where city is not null and event_type in ('page_view','link_click') group by city, country) s),
    'destinations', (select coalesce(jsonb_agg(jsonb_build_object(
          'id', link_id, 'clicks', n, 'unique', u,
          'series', (select jsonb_agg(coalesce(lb.n, 0) order by b.b) from buckets b
              left join per_link_bucket lb on lb.b = b.b and lb.link_id = d.link_id),
          'sources', (select jsonb_agg(jsonb_build_object('source', source, 'count', k) order by k desc)
              from (select source, count(*) as k from clicks c where c.link_id = d.link_id group by source) x),
          'devices', (select jsonb_agg(jsonb_build_object('key', device, 'count', k) order by k desc)
              from (select device, count(*) as k from clicks c where c.link_id = d.link_id group by device) x)
        ) order by n desc), '[]'::jsonb)
        from (select link_id, count(*) as n, count(distinct visitor) as u from clicks group by link_id) d),
    'realtime', (select jsonb_agg(jsonb_build_object('minute', g.m, 'views', coalesce(r.v, 0), 'clicks', coalesce(r.c, 0)) order by g.m)
        from generate_series(0, 29) as g(m) left join recent r on r.m = g.m),
    'dropped', (select coalesce(sum(l.count), 0) from public.analytics_limits l
        where l.key = 'dropped' and l.bucket >= date_trunc('day', p_from) and l.bucket < p_to)
  ) into result;
  return result;
end $$;
revoke all on function public.analytics_summary(timestamptz, timestamptz, text) from public, anon, authenticated, service_role;
grant execute on function public.analytics_summary(timestamptz, timestamptz, text) to authenticated;

-- Keep the "dropped" counter as long as events; other limiter buckets still expire after two days.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('cheryl-analytics-retention', '17 3 * * *',
      $job$delete from public.analytics_events where timestamp < now() - interval '90 days';
      delete from public.analytics_limits where key <> 'dropped' and bucket < now() - interval '2 days';
      delete from public.analytics_limits where key = 'dropped' and bucket < now() - interval '90 days';$job$);
  end if;
end $$;
