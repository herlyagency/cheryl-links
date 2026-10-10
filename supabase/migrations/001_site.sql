-- Run with the Supabase SQL editor. Then set the one owner UUID (README).
create table public.site_owner (id boolean primary key default true check (id), user_id uuid not null unique references auth.users(id));
alter table public.site_owner enable row level security;
revoke all on public.site_owner from anon, authenticated;
create function public.is_owner() returns boolean language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.site_owner where user_id=auth.uid());
$$;
revoke all on function public.is_owner() from public, anon, authenticated, service_role;
grant execute on function public.is_owner() to authenticated;

create function public.valid_destination(u text, image boolean default false) returns boolean language sql immutable set search_path = '' as $$
 select length(u) between 1 and 2048 and u !~ '[[:space:]"''<>\\]' and
 case when image then u ~ '^(https://[^/]+|/[a-zA-Z0-9_.-][a-zA-Z0-9/_.-]*$)' else u ~ '^(https?://[^/]+|mailto:[^@]+@[^@]+|tel:[+0-9()-]+)$' or u ~ '^https?://[^/]+' end;
$$;
-- A bounded single document keeps draft/publish atomic, including link order.
create function public.validate_config(c jsonb) returns boolean language plpgsql immutable set search_path = '' as $$
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
 return true;
exception when others then return false;
end $$;

create table public.site_drafts(id int primary key check(id=1),config jsonb not null check(public.validate_config(config)),updated_at timestamptz not null default now());
create table public.site_published(id int primary key check(id=1),config jsonb not null check(public.validate_config(config)),updated_at timestamptz not null default now());
alter table public.site_drafts enable row level security;
alter table public.site_published enable row level security;
revoke all on public.site_drafts, public.site_published from anon,authenticated;
grant select,update on public.site_drafts to authenticated;
create policy owner_read_draft on public.site_drafts for select to authenticated using(public.is_owner());
create policy owner_edit_draft on public.site_drafts for update to authenticated using(public.is_owner()) with check(public.is_owner());
create function public.get_public_site() returns jsonb language sql stable security definer set search_path = '' as $$
 select jsonb_set(jsonb_set(config,'{links}',coalesce((select jsonb_agg(l order by ord) from jsonb_array_elements(config->'links') with ordinality as x(l,ord)
 where (l->>'active')::boolean and (nullif(l->>'start','') is null or (l->>'start')::timestamptz<=now()) and (nullif(l->>'end','') is null or (l->>'end')::timestamptz>now())),'[]'::jsonb)),
 '{socials}',coalesce((select jsonb_agg(l order by ord) from jsonb_array_elements(config->'socials') with ordinality as x(l,ord) where (l->>'active')::boolean),'[]'::jsonb)) from public.site_published where id=1;
$$;
revoke all on function public.get_public_site() from public, anon, authenticated, service_role;
grant execute on function public.get_public_site() to anon,authenticated,service_role;
create function public.publish_site() returns void language plpgsql security definer set search_path = '' as $$
begin
 if not public.is_owner() then raise exception 'Owner access required' using errcode='42501'; end if;
 insert into public.site_published(id,config,updated_at) select id,config,now() from public.site_drafts where id=1
 on conflict(id) do update set config=excluded.config,updated_at=excluded.updated_at;
end $$;
revoke all on function public.publish_site() from public, anon, authenticated, service_role;
grant execute on function public.publish_site() to authenticated;

-- Public read is intentional for images already uploaded by the owner. SVG uploads are disabled.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('images','images',true,3145728,array['image/jpeg','image/png','image/webp']);
create policy owner_upload_images on storage.objects for insert to authenticated with check(bucket_id='images' and public.is_owner());
create policy owner_delete_images on storage.objects for delete to authenticated using(bucket_id='images' and public.is_owner());
create policy owner_list_images on storage.objects for select to authenticated using(bucket_id='images' and public.is_owner());
