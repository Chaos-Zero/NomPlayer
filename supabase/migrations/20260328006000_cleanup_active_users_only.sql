-- Definitive cleanup for orphaned tracks (v5: active users only for all checks)
create or replace function public.cleanup_orphaned_tracks_v5()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_count int;
begin
  -- 1. Cleanup orphaned player states (no profile)
  delete from public.user_player_states ups
  where not exists (select 1 from public.profiles p where p.id = ups.user_id);

  -- 2. Cleanup orphaned tracks
  delete from public.tracks t
  where
    -- NOT in any VGMC tournament
    not exists (select 1 from public.track_tournament_appearances tta where tta.track_id = t.id)

    -- NOT supported by an ACTIVE user
    and not exists (
      select 1 from public.track_supports ts
      join public.profiles p on p.id = ts.user_id
      where ts.track_id = t.id
    )

    -- NO listen history from an ACTIVE user
    and not exists (
      select 1 from public.track_user_listen_history tulh
      join public.profiles p on p.id = tulh.user_id
      where tulh.track_id = t.id
    )

    -- NO feedback/notes from an ACTIVE user
    and not exists (
      select 1 from public.track_user_feedback tuf
      join public.profiles p on p.id = tuf.user_id
      where tuf.track_id = t.id
    )

    -- NOT in any list of an ACTIVE user
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

-- Global wrapper
create or replace function public.cleanup_orphaned_tracks()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.cleanup_orphaned_tracks_v5();
end;
$$;

-- Automation Trigger
create or replace function public.on_user_player_state_change()
returns trigger
language plpgsql
security definer
as $$
begin
  -- Only run if the state has changed significantly (e.g. list shrink)
  -- For now, run on any update to ensure consistency
  perform public.cleanup_orphaned_tracks_v5();
  return new;
end;
$$;

drop trigger if exists trigger_cleanup_orphaned_tracks on public.user_player_states;
create trigger trigger_cleanup_orphaned_tracks
after update on public.user_player_states
for each row
execute function public.on_user_player_state_change();

-- Run it now
select public.cleanup_orphaned_tracks_v5();
