-- Renames the seeded "VGMC 20" playlist to "VGMC 20 Nominations" for consistency
-- with how the frontend labels it everywhere else (see App.jsx's
-- handleLoadVgmcPlaylist, which passes this same name into the "Now Playing"
-- view). Targets the fixed UUID from 20260814020000_seed_vgmc_bot_account.sql.
update public.user_playlists
set name = 'VGMC 20 Nominations'
where id = '22222222-2222-4222-8222-222222222222';
