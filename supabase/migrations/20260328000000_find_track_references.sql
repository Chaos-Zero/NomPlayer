-- Optimized RPC to find track references across JSONB lists
create or replace function public.find_track_references(target_track_id uuid)
returns table (
  user_id uuid,
  list_name text,
  entry jsonb
)
language plpgsql
security definer
set search_path = public
as $$
declare
  ts_external_id text;
begin
  select external_id into ts_external_id from public.track_sources where track_id = target_track_id and is_primary limit 1;

  -- Nomination List Check
  return query
  select ups.user_id, 'nominationList'::text, nom
  from public.user_player_states ups
  cross join lateral jsonb_array_elements(state -> 'nominationList') nom
  where (
    (state -> 'nominationList') @> jsonb_build_array(jsonb_build_object('trackId', target_track_id::text))
    or (ts_external_id is not null and (state -> 'nominationList') @> jsonb_build_array(jsonb_build_object('videoId', ts_external_id)))
  )
  and (
    (nom ->> 'trackId')::uuid = target_track_id
    or (nom ->> 'videoId' = ts_external_id)
  );

  -- Support List Check
  return query
  select ups.user_id, 'supportList'::text, sup
  from public.user_player_states ups
  cross join lateral jsonb_array_elements(state -> 'supportList') sup
  where (
    (state -> 'supportList') @> jsonb_build_array(jsonb_build_object('trackId', target_track_id::text))
    or (ts_external_id is not null and (state -> 'supportList') @> jsonb_build_array(jsonb_build_object('videoId', ts_external_id)))
  )
  and (
    (sup ->> 'trackId')::uuid = target_track_id
    or (sup ->> 'videoId' = ts_external_id)
  );

  -- Playlist Check
  return query
  select ups.user_id, 'playlist'::text, pl
  from public.user_player_states ups
  cross join lateral jsonb_array_elements(state -> 'playlist') pl
  where (
    (state -> 'playlist') @> jsonb_build_array(jsonb_build_object('trackId', target_track_id::text))
    or (ts_external_id is not null and (state -> 'playlist') @> jsonb_build_array(jsonb_build_object('videoId', ts_external_id)))
  )
  and (
    (pl ->> 'trackId')::uuid = target_track_id
    or (pl ->> 'videoId' = ts_external_id)
  );
end;
$$;

grant execute on function public.find_track_references(uuid) to anon;
grant execute on function public.find_track_references(uuid) to authenticated;
