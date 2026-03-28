-- Definitive cleanup for orphaned tracks
-- This version:
-- 1. Only considers references from users who have a record in the 'profiles' table.
-- 2. Respects track_user_listen_history and track_user_feedback to avoid data loss for active users.
-- 3. Correctly handles both trackId and videoId references in all known JSONB list keys.

create or replace function public.cleanup_orphaned_tracks_v3()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_count int;
begin
  delete from public.tracks t
  where
    -- 1. Not part of any VGMC tournament
    not exists (select 1 from public.track_tournament_appearances tta where tta.track_id = t.id)

    -- 2. Not formally supported in the tiered support table
    and not exists (select 1 from public.track_supports ts where ts.track_id = t.id)

    -- 3. No listen history from ANY user (conservative)
    and not exists (select 1 from public.track_user_listen_history tulh where tulh.track_id = t.id)

    -- 4. No feedback/notes from ANY user
    and not exists (select 1 from public.track_user_feedback tuf where tuf.track_id = t.id)

    -- 5. NOT in any list of an ACTIVE user (has a profile)
    and not exists (
      select 1
      from public.user_player_states ups
      join public.profiles p on p.id = ups.user_id
      where (
        -- Check standard collections by trackId
        (ups.state -> 'nominationList') @> jsonb_build_array(jsonb_build_object('trackId', t.id::text))
        or (ups.state -> 'supportList') @> jsonb_build_array(jsonb_build_object('trackId', t.id::text))
        or (ups.state -> 'playlist') @> jsonb_build_array(jsonb_build_object('trackId', t.id::text))
        or exists (
          select 1 from jsonb_array_elements(case when jsonb_typeof(ups.state -> 'customPlaylists') = 'array' then ups.state -> 'customPlaylists' else '[]'::jsonb end) pl
          where (pl -> 'videos') @> jsonb_build_array(jsonb_build_object('trackId', t.id::text))
        )
      )
      OR exists (
        -- Check collections by videoId (legacy/unsynced entries) via track_sources
        select 1 from public.track_sources src
        where src.track_id = t.id
          and (
            (ups.state -> 'nominationList') @> jsonb_build_array(jsonb_build_object('videoId', src.external_id))
            or (ups.state -> 'supportList') @> jsonb_build_array(jsonb_build_object('videoId', src.external_id))
            or (ups.state -> 'playlist') @> jsonb_build_array(jsonb_build_object('videoId', src.external_id))
            or exists (
              select 1 from jsonb_array_elements(case when jsonb_typeof(ups.state -> 'customPlaylists') = 'array' then ups.state -> 'customPlaylists' else '[]'::jsonb end) pl
              where (pl -> 'videos') @> jsonb_build_array(jsonb_build_object('videoId', src.external_id))
            )
          )
      )
    );

  get diagnostics deleted_count = row_count;
  raise notice 'Deleted % orphaned tracks.', deleted_count;

  -- Also cleanup orphaned player states that have no corresponding profile
  -- (These are abandoned accounts or partial signups that shouldn't hold references)
  delete from public.user_player_states ups
  where not exists (select 1 from public.profiles p where p.id = ups.user_id);
end;
$$;

-- Update the standard wrapper
create or replace function public.cleanup_orphaned_tracks()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.cleanup_orphaned_tracks_v3();
end;
$$;

-- Perform cleanup immediately
select public.cleanup_orphaned_tracks_v3();
