-- Update the cleanup RPC to ensure robust JSONB comparison by explicitly casting UUIDs to text
create or replace function public.cleanup_orphaned_tracks()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.tracks
  where id not in (select track_id from public.track_tournament_appearances) -- Not in VGMC
    and id not in (select track_id from public.track_supports) -- Not in supports table
    and not exists ( -- Not in any user collection lists
      select 1
      from public.user_player_states ups
      where (ups.state -> 'nominationList') @> jsonb_build_array(jsonb_build_object('trackId', public.tracks.id::text))
         or (ups.state -> 'supportList') @> jsonb_build_array(jsonb_build_object('trackId', public.tracks.id::text))
         or (ups.state -> 'playlist') @> jsonb_build_array(jsonb_build_object('trackId', public.tracks.id::text))
         or exists (
           select 1
           from jsonb_array_elements(
             case
               when jsonb_typeof(ups.state -> 'customPlaylists') = 'array'
               then ups.state -> 'customPlaylists'
               else '[]'::jsonb
             end
           ) pl
           where (pl -> 'videos') @> jsonb_build_array(jsonb_build_object('trackId', public.tracks.id::text))
         )
    );
end;
$$;

-- Run a clean sweep immediately
select public.cleanup_orphaned_tracks();
