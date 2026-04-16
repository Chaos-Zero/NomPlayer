-- Add missing index on track_tournament_appearances(track_id).
-- The correlated subqueries in track_catalog were doing full table scans
-- for every row because only tournament_id was indexed, not track_id.
create index if not exists track_tournament_appearances_track_id_idx
  on public.track_tournament_appearances (track_id);

-- Partial index for the global feedback status query (App.jsx fetchGlobalFeedbackStatus).
-- Only indexes rows that actually have notes, keeping it small.
create index if not exists track_user_feedback_with_note_idx
  on public.track_user_feedback (track_id)
  where note is not null and note <> '';

-- Rewrite track_catalog to use lateral aggregated joins instead of 6 correlated
-- subqueries per row. Each lateral block does one pass over the relevant rows
-- using the (track_id) and (track_id, level) indexes instead of N subqueries.
create or replace view "public"."track_catalog"
  with ("security_invoker"='true') as
select
  t.id                                          as track_id,
  t.canonical_game_title                        as game_title,
  t.canonical_track_title                       as track_title,
  case
    when nullif(btrim(coalesce(t.canonical_game_title, '')), '') is not null
     and nullif(btrim(coalesce(t.canonical_track_title, '')), '') is not null
    then t.canonical_game_title || ' - ' || t.canonical_track_title
    else coalesce(
      nullif(btrim(coalesce(t.canonical_track_title, '')), ''),
      nullif(btrim(coalesce(t.canonical_game_title, '')), ''),
      nullif(btrim(coalesce(src.cached_title, '')), ''),
      src.external_id
    )
  end                                           as display_title,
  t.metadata_status,
  t.is_retired,
  rt.slug                                       as retired_by_tournament_slug,
  rt.name                                       as retired_by_tournament_name,
  src.id                                        as primary_source_id,
  src.provider,
  src.external_id                               as source_external_id,
  src.source_url,
  src.submitted_url,
  src.cached_title                              as source_title,
  src.cached_channel_title                      as source_channel_title,
  src.cached_thumbnail_url                      as source_thumbnail_url,
  src.last_fetched_at,
  t.updated_at,
  coalesce(ta.tournaments_json, '[]'::jsonb)    as tournaments,
  coalesce(ta.tournament_count, 0)              as tournament_count,
  coalesce(sc.support_count_1, 0)              as support_count_1,
  coalesce(sc.support_count_2, 0)              as support_count_2,
  coalesce(sc.support_count_3, 0)              as support_count_3,
  coalesce(ta.has_result, false)                as has_result
from public.tracks t
left join public.tournaments rt
  on rt.id = t.retired_by_tournament_id
left join public.track_sources src
  on src.track_id = t.id and src.is_primary
left join lateral (
  select
    jsonb_agg(
      jsonb_build_object(
        'slug',             tr.slug,
        'name',             tr.name,
        'sequence_number',  tr.sequence_number,
        'appearance_label', a.appearance_label,
        'placement',        a.placement,
        'highest_round',    a.highest_round,
        'is_retired',       a.is_retired_in_tournament,
        'notes',            a.notes
      ) order by tr.sequence_number, tr.name
    )                                           as tournaments_json,
    count(*)                                    as tournament_count,
    bool_or(a.placement is not null or a.highest_round is not null) as has_result
  from public.track_tournament_appearances a
  join public.tournaments tr on tr.id = a.tournament_id
  where a.track_id = t.id
) ta on true
left join lateral (
  select
    count(*) filter (where level = 1) as support_count_1,
    count(*) filter (where level = 2) as support_count_2,
    count(*) filter (where level = 3) as support_count_3
  from public.track_supports
  where track_id = t.id
) sc on true;
