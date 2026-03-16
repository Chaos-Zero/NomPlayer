create unique index if not exists profiles_username_lower_unique
on public.profiles (lower(username));

create unique index if not exists profiles_email_lower_unique
on public.profiles (lower(email));

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  next_username text;
begin
  next_username := nullif(trim(coalesce(new.raw_user_meta_data->>'username', '')), '');

  if next_username is null then
    next_username := split_part(coalesce(new.email, new.id::text), '@', 1);
  end if;

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

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_new_auth_user();

insert into public.profiles (
  id,
  username,
  email,
  gamefaqs_username
)
select
  users.id,
  coalesce(
    nullif(trim(coalesce(users.raw_user_meta_data->>'username', '')), ''),
    split_part(coalesce(users.email, users.id::text), '@', 1)
  ),
  coalesce(users.email, ''),
  nullif(trim(coalesce(users.raw_user_meta_data->>'gamefaqs_username', '')), '')
from auth.users as users
on conflict (id) do update
set
  username = excluded.username,
  email = excluded.email,
  gamefaqs_username = excluded.gamefaqs_username,
  updated_at = timezone('utc', now());

create or replace function public.check_signup_availability(
  check_email text,
  check_username text
)
returns jsonb
language sql
security definer
set search_path = public, auth
as $$
  select jsonb_build_object(
    'email_available',
    not exists(
      select 1
      from auth.users
      where email is not null
        and lower(email) = lower(trim(check_email))
    ),
    'username_available',
    not exists(
      select 1
      from public.profiles
      where lower(username) = lower(trim(check_username))
    )
  );
$$;

revoke all on function public.check_signup_availability(text, text) from public;
grant execute on function public.check_signup_availability(text, text) to anon;
grant execute on function public.check_signup_availability(text, text) to authenticated;
