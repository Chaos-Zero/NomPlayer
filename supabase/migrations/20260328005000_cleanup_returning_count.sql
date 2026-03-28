-- Definitive cleanup for orphaned tracks (v4: returns count)
create or replace function public.cleanup_orphaned_tracks_v4()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_count int;
begin
  -- First cleanup orphaned player states
  delete from public.user_player_states ups
  where not exists (select 1 from public.profiles p where p.id = ups.user_id);

  -- Then cleanup orphaned tracks
  delete from public.tracks t
  where
    not exists (select 1 from public.track_tournament_appearances tta where tta.track_id = t.id)
    and not exists (select 1 from public.track_supports ts where ts.track_id = t.id)
    and not exists (select 1 from public.track_user_listen_history tulh where tulh.track_id = t.id)
    and not exists (select 1 from public.track_user_feedback tuf where tuf.track_id = t.id)
    and not exists (
      select 1
      from public.user_player_states ups
      join public.profiles p on p.id = ups.user_id
      where (
        (ups.state -> 'nominationList') @> jsonb_build_array(jsonb_build_object('trackId', t.id::text))
        or (ups.state -> 'supportList') @> jsonb_build_array(jsonb_build_object('trackId', t.id::text))
        or (ups.state -> 'playlist') @> jsonb_build_array(jsonb_build_object('trackId', t.id::text))
        or exists (
          select 1 from jsonb_array_elements(case when jsonb_typeof(ups.state -> 'customPlaylists') = 'array' then ups.state -> 'customPlaylists' else '[]'::jsonb end) pl
          where (pl -> 'videos') @> jsonb_build_array(jsonb_build_object('trackId', t.id::text))
        )
      )
      OR exists (
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
  return deleted_count;
end;
$$;

-- Standard wrapper
create or replace function public.cleanup_orphaned_tracks()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.cleanup_orphaned_tracks_v4();
end;
$$;
