create or replace function public.validate_config(c jsonb) returns boolean language plpgsql immutable set search_path = '' as $$
declare l jsonb; k text; v text; ids text[] := '{}';
begin
 if c is null or pg_column_size(c)>200000 or jsonb_typeof(c)<>'object' then return false; end if;
 if jsonb_typeof(c->'profile') is distinct from 'object' or jsonb_typeof(c->'theme') is distinct from 'object'
 or jsonb_typeof(c->'links') is distinct from 'array' or jsonb_typeof(c->'socials') is distinct from 'array' then return false; end if;
 if length(btrim(coalesce(c#>>'{profile,display_name}',''))) not between 1 and 60 or length(coalesce(c#>>'{profile,bio}',''))>300 then return false; end if;
 if length(coalesce(c#>>'{profile,username}',''))>60 or length(coalesce(c#>>'{profile,footer}',''))>120 then return false; end if;
 if coalesce(c#>>'{profile,avatar_url}','')<>'' and not public.valid_destination(c#>>'{profile,avatar_url}',true) then return false; end if;
 if jsonb_typeof(c#>'{profile,badge}') is distinct from 'boolean' or jsonb_typeof(c#>'{profile,share}') is distinct from 'boolean' or jsonb_typeof(c#>'{theme,gradient}') is distinct from 'boolean' then return false; end if;
 if jsonb_array_length(c->'links')>50 or jsonb_array_length(c->'socials')>12 then return false; end if;
 foreach k in array array['background','backgroundEnd','text','card','accent'] loop
  if coalesce(c->'theme'->>k,'') !~ '^#[0-9a-fA-F]{6}$' then return false; end if;
 end loop;
 foreach k in array array['radius','gap','width','shadow','avatarSize'] loop
  if jsonb_typeof(c->'theme'->k) is distinct from 'number' then return false; end if;
 end loop;
 if (c#>>'{theme,radius}')::numeric not between 0 and 40 or (c#>>'{theme,gap}')::numeric not between 8 and 28
 or (c#>>'{theme,width}')::numeric not between 320 and 620 or (c#>>'{theme,shadow}')::numeric not between 0 and 2
 or (c#>>'{theme,avatarSize}')::numeric not between 64 and 160 then return false; end if;
 if coalesce(c#>>'{theme,font}','') not in ('serif','sans') or coalesce(c#>>'{theme,align}','') not in ('left','center') or coalesce(c#>>'{theme,mode}','') not in ('light','dark') then return false; end if;
 if coalesce(c#>>'{theme,backgroundImage}','')<>'' and not public.valid_destination(c#>>'{theme,backgroundImage}',true) then return false; end if;
 for l in select value from jsonb_array_elements((c->'links')||(c->'socials')) loop
  if jsonb_typeof(l) is distinct from 'object' or not coalesce(public.valid_destination(l->>'url'),false) or (l->>'id') is null or (l->>'id') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$' then return false; end if;
  if (l->>'id')=any(ids) then return false; end if; ids:=array_append(ids,l->>'id');
  if jsonb_typeof(l->'active') is distinct from 'boolean' then return false; end if;
  if coalesce(l->>'icon','') not in ('instagram','youtube','tiktok','mail','heart','globe','twitch') then return false; end if;
 end loop;
 for l in select value from jsonb_array_elements(c->'links') loop
  if jsonb_typeof(l->'featured') is distinct from 'boolean' then return false; end if;
  if length(btrim(coalesce(l->>'title',''))) not between 1 and 100 or length(coalesce(l->>'description',''))>180 then return false; end if;
  foreach k in array array['background','text','border'] loop
   v:=coalesce(l->>k,''); if v<>'' and v !~ '^#[0-9a-fA-F]{6}$' then return false; end if;
  end loop;
  foreach k in array array['thumbnail','backgroundImage'] loop
   v:=coalesce(l->>k,''); if v<>'' and not public.valid_destination(v,true) then return false; end if;
  end loop;
  if coalesce(l->>'radius','18')::numeric not between 0 and 40 then return false; end if;
  if coalesce(l->>'start','')<>'' then perform (l->>'start')::timestamptz; end if;
  if coalesce(l->>'end','')<>'' then perform (l->>'end')::timestamptz; end if;
  if coalesce(l->>'start','')<>'' and coalesce(l->>'end','')<>'' and (l->>'end')::timestamptz <= (l->>'start')::timestamptz then return false; end if;
 end loop;
 if coalesce(c#>>'{theme,look}','classic') not in ('classic','neon','paper','glass','bold') or coalesce(c#>>'{theme,animation}','none') not in ('none','fade','rise') then return false; end if;
 return true;
exception when others then return false;
end $$;

-- Cached public total, owner-only account status. API credentials stay in Edge Function secrets.
create table public.site_followers (
 id integer primary key check(id=1),
 accounts jsonb not null default '[]'::jsonb check(jsonb_typeof(accounts)='array'),
 synced_at timestamptz not null default now()
);
alter table public.site_followers enable row level security;
revoke all on public.site_followers from public, anon, authenticated;
grant select on public.site_followers to authenticated;
grant all on public.site_followers to service_role;
create policy owner_reads_followers on public.site_followers for select to authenticated using(public.is_owner());
create function public.get_follower_total() returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('total',sum((a->>'count')::bigint),'synced_at',max(s.synced_at))
 from public.site_followers s cross join lateral jsonb_array_elements(s.accounts) a
 where jsonb_typeof(a->'count')='number' and (a->>'count')::numeric>=0;
$$;
revoke all on function public.get_follower_total() from public,anon,authenticated,service_role;
grant execute on function public.get_follower_total() to anon,authenticated,service_role;
