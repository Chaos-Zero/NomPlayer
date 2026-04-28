-- Grant anon read access for the Community Playlists view.
-- RLS on user_playlists already restricts SELECT to is_public = true (or own rows).
-- RLS on user_playlist_tracks restricts via playlist's is_public flag.
-- profiles_select_public policy already allows all reads; this grants the privilege.
grant select on public.user_playlists       to anon;
grant select on public.user_playlist_tracks to anon;
grant select on public.profiles             to anon;
