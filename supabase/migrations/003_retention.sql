create extension if not exists pg_cron;
select cron.schedule('cheryl-analytics-retention','17 3 * * *',
 $$delete from public.analytics_events where timestamp < now()-interval '90 days';
 delete from public.analytics_limits where bucket < now()-interval '2 days';$$);
