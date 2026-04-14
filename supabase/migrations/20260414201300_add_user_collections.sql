-- 1. Create track_nominations
create table if not exists public.track_nominations (
  track_id uuid not null references public.tracks (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (track_id, user_id)
);

create index if not exists track_nominations_user_id_idx on public.track_nominations (user_id);

alter table public.track_nominations enable row level security;

drop policy if exists "track_nominations_select_all" on public.track_nominations;
create policy "track_nominations_select_all"
on public.track_nominations for select using (true);

drop policy if exists "track_nominations_insert_own" on public.track_nominations;
create policy "track_nominations_insert_own"
on public.track_nominations for insert with check (auth.uid() = user_id);

drop policy if exists "track_nominations_delete_own" on public.track_nominations;
create policy "track_nominations_delete_own"
on public.track_nominations for delete using (auth.uid() = user_id);

grant select, insert, delete on public.track_nominations to authenticated;
grant select on public.track_nominations to anon;

-- 2. Create user_playlists
create table if not exists public.user_playlists (
  id uuid not null default gen_random_uuid() primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  is_active_queue boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists user_playlists_active_queue_idx on public.user_playlists (user_id) where (is_active_queue is true);
create index if not exists user_playlists_user_id_idx on public.user_playlists (user_id);

drop trigger if exists set_user_playlists_updated_at on public.user_playlists;
create trigger set_user_playlists_updated_at
before update on public.user_playlists
for each row
execute function public.set_updated_at();

alter table public.user_playlists enable row level security;

drop policy if exists "user_playlists_select_own" on public.user_playlists;
create policy "user_playlists_select_own" on public.user_playlists for select using (auth.uid() = user_id);

drop policy if exists "user_playlists_insert_own" on public.user_playlists;
create policy "user_playlists_insert_own" on public.user_playlists for insert with check (auth.uid() = user_id);

drop policy if exists "user_playlists_update_own" on public.user_playlists;
create policy "user_playlists_update_own" on public.user_playlists for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "user_playlists_delete_own" on public.user_playlists;
create policy "user_playlists_delete_own" on public.user_playlists for delete using (auth.uid() = user_id);

grant select, insert, update, delete on public.user_playlists to authenticated;

-- 3. Create user_playlist_tracks
create table if not exists public.user_playlist_tracks (
  playlist_id uuid not null references public.user_playlists (id) on delete cascade,
  track_id uuid not null references public.tracks (id) on delete cascade,
  order_index integer not null,
  added_at timestamptz not null default timezone('utc', now()),
  primary key (playlist_id, track_id)
);

create index if not exists user_playlist_tracks_playlist_id_idx on public.user_playlist_tracks (playlist_id);

alter table public.user_playlist_tracks enable row level security;

-- Policies for joining through user_playlists
drop policy if exists "user_playlist_tracks_select_own" on public.user_playlist_tracks;
create policy "user_playlist_tracks_select_own" on public.user_playlist_tracks for select
using (exists (select 1 from public.user_playlists p where p.id = playlist_id and p.user_id = auth.uid()));

drop policy if exists "user_playlist_tracks_insert_own" on public.user_playlist_tracks;
create policy "user_playlist_tracks_insert_own" on public.user_playlist_tracks for insert
with check (exists (select 1 from public.user_playlists p where p.id = playlist_id and p.user_id = auth.uid()));

drop policy if exists "user_playlist_tracks_update_own" on public.user_playlist_tracks;
create policy "user_playlist_tracks_update_own" on public.user_playlist_tracks for update
using (exists (select 1 from public.user_playlists p where p.id = playlist_id and p.user_id = auth.uid()))
with check (exists (select 1 from public.user_playlists p where p.id = playlist_id and p.user_id = auth.uid()));

drop policy if exists "user_playlist_tracks_delete_own" on public.user_playlist_tracks;
create policy "user_playlist_tracks_delete_own" on public.user_playlist_tracks for delete
using (exists (select 1 from public.user_playlists p where p.id = playlist_id and p.user_id = auth.uid()));

grant select, insert, update, delete on public.user_playlist_tracks to authenticated;

-- 4. Data Migration
DO $$
DECLARE
    r RECORD;
    n RECORD;
    t RECORD;
    v RECORD;
    active_queue_id uuid;
    custom_pl_id uuid;
    order_idx integer;
BEGIN
    FOR r IN SELECT user_id, state FROM public.user_player_states LOOP
        -- Migrate Nominations
        IF r.state ? 'nominationList' THEN
            FOR n IN SELECT value FROM jsonb_array_elements(r.state->'nominationList') LOOP
                IF n.value->>'trackId' IS NOT NULL THEN
                    BEGIN
                        INSERT INTO public.track_nominations (user_id, track_id)
                        VALUES (r.user_id, (n.value->>'trackId')::uuid)
                        ON CONFLICT DO NOTHING;
                    EXCEPTION WHEN OTHERS THEN
                    END;
                END IF;
            END LOOP;
        END IF;

        -- Migrate Active Queue
        IF r.state ? 'playlist' AND jsonb_array_length(r.state->'playlist') > 0 THEN
            INSERT INTO public.user_playlists (user_id, name, is_active_queue)
            VALUES (r.user_id, 'Now Playing', true)
            ON CONFLICT (user_id) WHERE is_active_queue IS TRUE DO UPDATE SET name = 'Now Playing'
            RETURNING id INTO active_queue_id;

            order_idx := 0;
            FOR t IN SELECT value FROM jsonb_array_elements(r.state->'playlist') LOOP
                IF t.value->>'trackId' IS NOT NULL THEN
                    BEGIN
                        INSERT INTO public.user_playlist_tracks (playlist_id, track_id, order_index)
                        VALUES (active_queue_id, (t.value->>'trackId')::uuid, order_idx)
                        ON CONFLICT DO NOTHING;
                        order_idx := order_idx + 1;
                    EXCEPTION WHEN OTHERS THEN
                    END;
                END IF;
            END LOOP;
        END IF;

        -- Migrate Custom Playlists
        IF r.state ? 'customPlaylists' THEN
            FOR t IN SELECT value FROM jsonb_array_elements(r.state->'customPlaylists') LOOP
                INSERT INTO public.user_playlists (user_id, name, is_active_queue)
                VALUES (
                    r.user_id,
                    coalesce(t.value->>'name', 'Untitled Playlist'),
                    false
                )
                RETURNING id INTO custom_pl_id;

                IF custom_pl_id IS NOT NULL AND t.value ? 'videos' THEN
                    order_idx := 0;
                    FOR v IN SELECT value FROM jsonb_array_elements(t.value->'videos') LOOP
                        IF v.value->>'trackId' IS NOT NULL THEN
                            BEGIN
                                INSERT INTO public.user_playlist_tracks (playlist_id, track_id, order_index)
                                VALUES (custom_pl_id, (v.value->>'trackId')::uuid, order_idx)
                                ON CONFLICT DO NOTHING;
                                order_idx := order_idx + 1;
                            EXCEPTION WHEN OTHERS THEN
                            END;
                        END IF;
                    END LOOP;
                END IF;
            END LOOP;
        END IF;
    END LOOP;
END $$;
