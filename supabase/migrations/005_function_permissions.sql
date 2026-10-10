-- Supabase may explicitly grant new functions to anon/authenticated by default.
-- Revoking only PUBLIC is insufficient: remove direct role grants as well.
revoke all on function public.is_owner() from public, anon, authenticated, service_role;
grant execute on function public.is_owner() to authenticated;
revoke all on function public.publish_site() from public, anon, authenticated, service_role;
grant execute on function public.publish_site() to authenticated;
revoke all on function public.analytics_report(timestamptz,timestamptz) from public, anon, authenticated, service_role;
grant execute on function public.analytics_report(timestamptz,timestamptz) to authenticated;
revoke all on function public.take_budget(text,timestamptz,int) from public, anon, authenticated, service_role;
grant execute on function public.take_budget(text,timestamptz,int) to service_role;
revoke all on function public.get_public_site() from public, anon, authenticated, service_role;
grant execute on function public.get_public_site() to anon, authenticated, service_role;
