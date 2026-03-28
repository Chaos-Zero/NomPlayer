-- Definitive cleanup for orphaned tracks (v6: aggressive empty track purge)
create or replace function public.cleanup_orphaned_tracks_v6()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_count int;
  base_deleted int;
begin
  -- 1. Cleanup orphaned player states (no profile)
  delete from public.user_player_states ups
  where not exists (select 1 from public.profiles p where p.id = ups.user_id);

  -- 2. Aggressive purge of "Empty" tracks (no metadata at all)
  -- These are tracks that were nominated but never filled in, or bad links.
  -- We delete them even if they have listen history/feedback, IF they are not in a tournament.
  delete from public.tracks t
  where
    (canonical_game_title is null or canonical_game_title = '')
    and (canonical_track_title is null or canonical_track_title = '')
    and not exists (select 1 from public.track_tournament_appearances tta where tta.track_id = t.id);

  get diagnostics deleted_count = row_count;

  -- 3. Standard cleanup for valid tracks that are just no longer referenced
  perform public.cleanup_orphaned_tracks_v5();

  return deleted_count;
end;
$$;

-- Global wrapper
create or replace function public.cleanup_orphaned_tracks()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.cleanup_orphaned_tracks_v6();
end;
$$;

-- Run it now
select public.cleanup_orphaned_tracks_v6();
