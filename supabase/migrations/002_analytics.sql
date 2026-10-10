create table public.analytics_events (
 id uuid primary key,event_type text not null check(event_type in ('page_view','link_click')),
 link_id uuid,timestamp timestamptz not null default now(),source text not null check(length(source)<=100),
 medium text not null default '' check(length(medium)<=100),campaign text not null default '' check(length(campaign)<=100),
 referrer text not null default '' check(length(referrer)<=200),device text not null check(device in ('mobile','desktop','tablet')),
 country text check(country ~ '^[A-Z]{2}$'),visitor uuid not null,
 check((event_type='page_view' and link_id is null) or (event_type='link_click' and link_id is not null))
);
create index analytics_timestamp_idx on public.analytics_events(timestamp);
create index analytics_visitor_idx on public.analytics_events(visitor,timestamp);
create index analytics_link_idx on public.analytics_events(link_id,timestamp);
create table public.analytics_limits(key text not null,bucket timestamptz not null,count int not null default 1,primary key(key,bucket));
alter table public.analytics_events enable row level security;
alter table public.analytics_limits enable row level security;
revoke all on public.analytics_events,public.analytics_limits from anon,authenticated;
grant insert on public.analytics_events to service_role;
-- No public INSERT, SELECT, or collector RPC permission. Only the Edge Function service role collects.
create function public.take_budget(p_key text,p_bucket timestamptz,p_limit int) returns boolean language plpgsql security definer set search_path='' as $$
declare n int;
begin
 insert into public.analytics_limits(key,bucket,count) values(p_key,p_bucket,1)
 on conflict(key,bucket) do update set count=public.analytics_limits.count+1
 returning count into n;
 return n<=p_limit;
end $$;
revoke all on function public.take_budget(text,timestamptz,int) from public, anon, authenticated, service_role;
grant execute on function public.take_budget(text,timestamptz,int) to service_role;

create function public.analytics_report(p_from timestamptz,p_to timestamptz) returns jsonb language plpgsql security definer set search_path='' as $$
declare r jsonb; n bigint;
begin
 if not public.is_owner() then raise exception 'Owner access required' using errcode='42501'; end if;
 if p_to<p_from or p_to-p_from>interval '366 days' then raise exception 'Invalid date range'; end if;
 select count(*) into n from public.analytics_events where timestamp>=p_from and timestamp<p_to;
 select coalesce(jsonb_agg(to_jsonb(e)||jsonb_build_object('returning',exists(select 1 from public.analytics_events old where old.visitor=e.visitor and old.timestamp<p_from)) order by e.timestamp),'[]'::jsonb)
 into r from (select * from public.analytics_events where timestamp>=p_from and timestamp<p_to order by timestamp limit 20000) e;
 return jsonb_build_object('events',r,'limited',n>20000);
end $$;
revoke all on function public.analytics_report(timestamptz,timestamptz) from public, anon, authenticated, service_role;
grant execute on function public.analytics_report(timestamptz,timestamptz) to authenticated;

-- Activate the Supabase Cron integration before running 003_retention.sql.
