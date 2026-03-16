create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null unique,
  email text not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint profiles_username_length check (char_length(username) between 3 and 32)
);

create table if not exists public.user_player_states (
  user_id uuid primary key references auth.users (id) on delete cascade,
  state jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at
before update on public.profiles
for each row
execute function public.set_updated_at();

drop trigger if exists set_user_player_states_updated_at on public.user_player_states;
create trigger set_user_player_states_updated_at
before update on public.user_player_states
for each row
execute function public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.user_player_states enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
on public.profiles
for select
using (auth.uid() = id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
on public.profiles
for insert
with check (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
on public.profiles
for update
using (auth.uid() = id)
with check (auth.uid() = id);

drop policy if exists "player_states_select_own" on public.user_player_states;
create policy "player_states_select_own"
on public.user_player_states
for select
using (auth.uid() = user_id);

drop policy if exists "player_states_insert_own" on public.user_player_states;
create policy "player_states_insert_own"
on public.user_player_states
for insert
with check (auth.uid() = user_id);

drop policy if exists "player_states_update_own" on public.user_player_states;
create policy "player_states_update_own"
on public.user_player_states
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
