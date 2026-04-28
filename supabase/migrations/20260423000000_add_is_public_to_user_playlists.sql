alter table public.user_playlists
  add column if not exists is_public boolean not null default false;

-- Update RLS: public playlists are readable by anyone
drop policy if exists "user_playlists_select_own" on public.user_playlists;
create policy "user_playlists_select_own" on public.user_playlists
  for select using (auth.uid() = user_id or is_public = true);

-- Track table: public playlist tracks are readable by anyone (via playlist ownership check)
drop policy if exists "user_playlist_tracks_select_own" on public.user_playlist_tracks;
create policy "user_playlist_tracks_select_own" on public.user_playlist_tracks
  for select using (
    exists (
      select 1 from public.user_playlists p
      where p.id = playlist_id
        and (p.user_id = auth.uid() or p.is_public = true)
    )
  );
