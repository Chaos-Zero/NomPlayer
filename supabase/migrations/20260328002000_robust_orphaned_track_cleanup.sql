-- Comprehensive and robust cleanup of orphaned tracks
-- This version checks both trackId AND videoId references in the JSONB state fields
create or replace function public.cleanup_orphaned_tracks_v2()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.tracks t
  where not exists (select 1 from public.track_tournament_appearances tta where tta.track_id = t.id)
    and not exists (select 1 from public.track_supports ts where ts.track_id = t.id)
    and not exists (
      select 1
      from public.user_player_states ups
      where (
        -- Check for presence by trackId (standard)
        (ups.state -> 'nominationList') @> jsonb_build_array(jsonb_build_object('trackId', t.id::text))
        or (ups.state -> 'supportList') @> jsonb_build_array(jsonb_build_object('trackId', t.id::text))
        or (ups.state -> 'playlist') @> jsonb_build_array(jsonb_build_object('trackId', t.id::text))
        or exists (
          select 1 from jsonb_array_elements(case when jsonb_typeof(ups.state -> 'customPlaylists') = 'array' then ups.state -> 'customPlaylists' else '[]'::jsonb end) pl
          where (pl -> 'videos') @> jsonb_build_array(jsonb_build_object('trackId', t.id::text))
        )
      )
      OR exists (
        -- ALSO check for presence by videoId (covers unsynced/legacy nominations)
        select 1 from public.track_sources ts
        where ts.track_id = t.id
          and (
            (ups.state -> 'nominationList') @> jsonb_build_array(jsonb_build_object('videoId', ts.external_id))
            or (ups.state -> 'supportList') @> jsonb_build_array(jsonb_build_object('videoId', ts.external_id))
            or (ups.state -> 'playlist') @> jsonb_build_array(jsonb_build_object('videoId', ts.external_id))
            or exists (
              select 1 from jsonb_array_elements(case when jsonb_typeof(ups.state -> 'customPlaylists') = 'array' then ups.state -> 'customPlaylists' else '[]'::jsonb end) pl
              where (pl -> 'videos') @> jsonb_build_array(jsonb_build_object('videoId', ts.external_id))
            )
          )
      )
    );
end;
$$;

-- Keep the V1 name as a wrapper for backward compatibility or triggers
create or replace function public.cleanup_orphaned_tracks()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.cleanup_orphaned_tracks_v2();
end;
$$;

-- Run a clean sweep immediately
select public.cleanup_orphaned_tracks_v2();
