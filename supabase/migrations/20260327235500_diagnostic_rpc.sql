-- Diagnostic function to see why a track is being kept
create or replace function public.debug_track_retention(target_track_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  result jsonb := '{}'::jsonb;
  appearance_count int;
  support_count int;
  nomination_matches int;
  support_matches int;
  playlist_matches int;
  custom_playlist_matches int;
begin
  select count(*) into appearance_count from public.track_tournament_appearances where track_id = target_track_id;
  select count(*) into support_count from public.track_supports where track_id = target_track_id;

  select count(*) into nomination_matches
  from public.user_player_states
  where (state -> 'nominationList') @> jsonb_build_array(jsonb_build_object('trackId', target_track_id::text));

  select count(*) into support_matches
  from public.user_player_states
  where (state -> 'supportList') @> jsonb_build_array(jsonb_build_object('trackId', target_track_id::text));

  select count(*) into playlist_matches
  from public.user_player_states
  where (state -> 'playlist') @> jsonb_build_array(jsonb_build_object('trackId', target_track_id::text));

  select count(*) into custom_playlist_matches
  from public.user_player_states
  where exists (
    select 1 from jsonb_array_elements(
      case when jsonb_typeof(state -> 'customPlaylists') = 'array' then state -> 'customPlaylists' else '[]'::jsonb end
    ) pl
    where (pl -> 'videos') @> jsonb_build_array(jsonb_build_object('trackId', target_track_id::text))
  );

  result := jsonb_build_object(
    'track_id', target_track_id,
    'appearance_count', appearance_count,
    'support_count', support_count,
    'nomination_matches', nomination_matches,
    'support_matches', support_matches,
    'playlist_matches', playlist_matches,
    'custom_playlist_matches', custom_playlist_matches
  );

  return result;
end;
$$;

grant execute on function public.debug_track_retention(uuid) to anon;
grant execute on function public.debug_track_retention(uuid) to authenticated;
