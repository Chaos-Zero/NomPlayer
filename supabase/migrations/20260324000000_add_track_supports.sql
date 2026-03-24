-- Add tiered support levels formally to the database
create table if not exists public.track_supports (
  track_id uuid not null references public.tracks (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  level smallint not null default 1,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (track_id, user_id),
  constraint track_supports_level_range check (level between 1 and 3)
);

-- Index for cross-user analytics and counts
create index if not exists track_supports_track_id_level_idx on public.track_supports (track_id, level);

-- Automatic updated_at management
drop trigger if exists set_track_supports_updated_at on public.track_supports;
create trigger set_track_supports_updated_at
before update on public.track_supports
for each row
execute function public.set_updated_at();

-- RLS Policies
alter table public.track_supports enable row level security;

drop policy if exists "track_supports_select_own" on public.track_supports;
create policy "track_supports_select_own"
on public.track_supports
for select
using (auth.uid() = user_id);

drop policy if exists "track_supports_insert_own" on public.track_supports;
create policy "track_supports_insert_own"
on public.track_supports
for insert
with check (auth.uid() = user_id);

drop policy if exists "track_supports_update_own" on public.track_supports;
create policy "track_supports_update_own"
on public.track_supports
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "track_supports_delete_own" on public.track_supports;
create policy "track_supports_delete_own"
on public.track_supports
for delete
using (auth.uid() = user_id);

-- Explicit grants
grant select, insert, update, delete on public.track_supports to authenticated;
