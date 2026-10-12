-- Expand optional link highlights and validate per-link intensity levels.
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
  if coalesce(l->>'icon','') not in ('auto','venmo','cashapp','instagram','youtube','tiktok','twitter','kick','threads','bluesky','facebook','linkedin','discord','telegram','reddit','spotify','patreon','pinterest','snapchat','twitch','mail','heart','globe') then return false; end if;
 end loop;
 for l in select value from jsonb_array_elements(c->'links') loop
  if coalesce(l->>'highlight','none') not in ('none','float','bounce','wiggle','pulse','tilt','shine','glow') then return false; end if;
  if l ? 'highlightIntensity' then
   if jsonb_typeof(l->'highlightIntensity') is distinct from 'number' or (l->>'highlightIntensity')::numeric not between 1 and 5 or (l->>'highlightIntensity')::numeric <> trunc((l->>'highlightIntensity')::numeric) then return false; end if;
  end if;
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
 for l in select value from jsonb_array_elements(c->'socials') loop
  if l ? 'followers' and jsonb_typeof(l->'followers') <> 'null' then
   if jsonb_typeof(l->'followers') <> 'number' then return false; end if;
   if (l->>'followers')::numeric < 0 or (l->>'followers')::numeric > 1000000000000 or (l->>'followers')::numeric <> trunc((l->>'followers')::numeric) then return false; end if;
  end if;
 end loop;
 if coalesce(c#>>'{theme,celebration}','none') not in ('none','confetti','birthday','snow','hearts','halloween','sparkles') then return false; end if;
 if (c->'theme') ? 'celebrationDuration' then
  if jsonb_typeof(c#>'{theme,celebrationDuration}') is distinct from 'number' or (c#>>'{theme,celebrationDuration}')::numeric not in (5,10,20) then return false; end if;
 end if;
 return true;
exception when others then return false;
end $$;

