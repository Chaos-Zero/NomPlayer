-- RPC function to clean up tracks that are not referenced by any nomination/support/playlist/tournament
create or replace function public.cleanup_orphaned_tracks()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Delete tracks from public.tracks that meet ALL deletion criteria:
  -- 1. Not in track_tournament_appearances (VGMC history)
  -- 2. Not in track_supports (Formal community supports)
  -- 3. Not in any user's nominationList, supportList, playlist, or customPlaylists in user_player_states
  delete from public.tracks
  where id not in (select track_id from public.track_tournament_appearances)
    and id not in (select track_id from public.track_supports)
    and not exists (
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

-- Trigger function to run cleanup when a user's player state changes
create or replace function public.on_player_state_change_cleanup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- If it's a delete, or a meaningful update, run sweep
  if (tg_op = 'DELETE') or
     (old.state -> 'nominationList' is distinct from new.state -> 'nominationList') or
     (old.state -> 'supportList' is distinct from new.state -> 'supportList') or
     (old.state -> 'playlist' is distinct from new.state -> 'playlist') or
     (old.state -> 'customPlaylists' is distinct from new.state -> 'customPlaylists') then

    perform public.cleanup_orphaned_tracks();
  end if;

  if (tg_op = 'DELETE') then
    return old;
  end if;
  return new;
end;
$$;

-- Trigger function to run cleanup when track supports change
create or replace function public.on_track_supports_change_cleanup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Any change to supports (update or delete) might orphan a track
  perform public.cleanup_orphaned_tracks();

  if (tg_op = 'DELETE') then
    return old;
  end if;
  return new;
end;
$$;

-- Trigger on user_player_states
drop trigger if exists cleanup_orphaned_tracks_trigger on public.user_player_states;
create trigger cleanup_orphaned_tracks_trigger
after update or delete on public.user_player_states
for each row
execute function public.on_player_state_change_cleanup();

-- Trigger on track_supports
drop trigger if exists cleanup_orphaned_tracks_on_support_trigger on public.track_supports;
create trigger cleanup_orphaned_tracks_on_support_trigger
after update or delete on public.track_supports
for each row
execute function public.on_track_supports_change_cleanup();

-- Create GIN index for JSONB state to optimize orphaned track cleanup sweeps
create index if not exists user_player_states_state_gin_idx on public.user_player_states using gin (state);

-- Also run it once immediately to clean up any current orphans
select public.cleanup_orphaned_tracks();
