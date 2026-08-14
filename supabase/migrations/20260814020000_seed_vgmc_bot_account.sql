-- Seeds the VGMC 20 bot account + playlist + ingest-thread row as code, instead of
-- a manual dashboard step. This is a system/service account, not a real user:
-- `encrypted_password` is left NULL, so GoTrue can never authenticate it, nobody
-- can sign in as this account. It exists purely to satisfy user_playlists.user_id's
-- foreign key to auth.users. Owning the row grants it no special privilege; the
-- playlist can still only be mutated through the service_role-only ingest RPCs (see
-- 20260813000000_add_vgmc_ingest_pipeline.sql).
--
-- Column list below matches this project's live auth.users schema (checked via
-- `supabase db dump --linked --schema auth` before writing this), auth.users is
-- owned/migrated by GoTrue, not app code, so if a future Supabase platform upgrade
-- changes required columns, this may need revisiting.
--
-- Fixed, well-known UUIDs (not gen_random_uuid()) make this idempotent and
-- reproducible across environments rather than a one-off manual step per project.

insert into auth.users (
  id,
  instance_id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
values (
  '11111111-1111-4111-8111-111111111111',
  '00000000-0000-0000-0000-000000000000',
  'authenticated',
  'authenticated',
  'vgmc-bot@nomplayer.internal',
  null, -- no password hash, this account can never log in
  timezone('utc', now()),
  '{"provider": "system", "providers": ["system"]}'::jsonb,
  '{}'::jsonb,
  timezone('utc', now()),
  timezone('utc', now())
)
on conflict (id) do nothing;

-- public.handle_new_auth_user() (20260317022000_namespace_discord_usernames.sql)
-- fires on the insert above and creates the matching public.profiles row
-- automatically, no need to insert it here too.

insert into public.user_playlists (id, user_id, name, is_public, is_active_queue)
values (
  '22222222-2222-4222-8222-222222222222',
  '11111111-1111-4111-8111-111111111111',
  'VGMC 20',
  true,
  false
)
on conflict (id) do nothing;

insert into public.vgmc_ingest_threads (thread_slug, playlist_id, min_scraper_version)
values ('vgmc-20', '22222222-2222-4222-8222-222222222222', 1)
on conflict (thread_slug) do nothing;
