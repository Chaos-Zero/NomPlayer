create or replace function public.derive_profile_username_from_auth(
  user_email text,
  user_id uuid,
  raw_user_meta_data jsonb,
  raw_app_meta_data jsonb
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  base_username text;
  is_discord boolean;
begin
  is_discord := lower(coalesce(raw_app_meta_data->>'provider', '')) = 'discord';

  base_username := nullif(
    trim(
      coalesce(
        raw_user_meta_data->>'preferred_username',
        raw_user_meta_data->>'user_name',
        raw_user_meta_data->>'username',
        raw_user_meta_data->>'name',
        raw_user_meta_data->>'global_name',
        raw_user_meta_data->>'full_name',
        ''
      )
    ),
    ''
  );

  if base_username is null then
    base_username := split_part(coalesce(user_email, user_id::text), '@', 1);
  end if;

  if is_discord then
    return 'dc:' || base_username;
  end if;

  return base_username;
end;
$$;

alter table public.profiles
drop constraint if exists profiles_username_length;

alter table public.profiles
add constraint profiles_username_length
check (char_length(username) between 3 and 64);

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  next_username text;
begin
  next_username := public.derive_profile_username_from_auth(
    new.email,
    new.id,
    new.raw_user_meta_data,
    new.raw_app_meta_data
  );

  insert into public.profiles (
    id,
    username,
    email,
    gamefaqs_username
  )
  values (
    new.id,
    next_username,
    coalesce(new.email, ''),
    nullif(trim(coalesce(new.raw_user_meta_data->>'gamefaqs_username', '')), '')
  )
  on conflict (id) do update
  set
    username = excluded.username,
    email = excluded.email,
    gamefaqs_username = excluded.gamefaqs_username,
    updated_at = timezone('utc', now());

  return new;
end;
$$;

update public.profiles as profiles
set
  username = public.derive_profile_username_from_auth(
    users.email,
    users.id,
    users.raw_user_meta_data,
    users.raw_app_meta_data
  ),
  updated_at = timezone('utc', now())
from auth.users as users
where profiles.id = users.id
  and lower(coalesce(users.raw_app_meta_data->>'provider', '')) = 'discord'
  and profiles.username not like 'dc:%'
  and profiles.username = coalesce(
    nullif(
      trim(
        coalesce(
          users.raw_user_meta_data->>'preferred_username',
          users.raw_user_meta_data->>'user_name',
          users.raw_user_meta_data->>'username',
          users.raw_user_meta_data->>'name',
          users.raw_user_meta_data->>'global_name',
          users.raw_user_meta_data->>'full_name',
          ''
        )
      ),
      ''
    ),
    split_part(coalesce(users.email, users.id::text), '@', 1)
  );
