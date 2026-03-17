insert into public.tournaments (
  id,
  slug,
  name,
  sequence_number,
  started_at,
  ended_at
)
values
  (
    '00000000-0000-0000-0000-000000000001',
    'vgmc-1',
    'VGMC 1',
    1,
    '2011-06-01',
    '2011-09-01'
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    'vgmc-2',
    'VGMC 2',
    2,
    '2012-06-01',
    '2012-09-01'
  )
on conflict (id) do nothing;

insert into public.tracks (
  id,
  canonical_game_title,
  canonical_track_title,
  metadata_status,
  is_retired,
  retired_by_tournament_id
)
values
  (
    '11111111-1111-1111-1111-111111111111',
    'Chrono Trigger',
    'Corridors of Time',
    'confirmed',
    false,
    null
  ),
  (
    '22222222-2222-2222-2222-222222222222',
    'Final Fantasy VII',
    'Aerith''s Theme',
    'confirmed',
    true,
    '00000000-0000-0000-0000-000000000002'
  ),
  (
    '33333333-3333-3333-3333-333333333333',
    null,
    null,
    'pending',
    false,
    null
  )
on conflict (id) do nothing;

insert into public.track_sources (
  id,
  track_id,
  provider,
  external_id,
  source_url,
  submitted_url,
  is_primary,
  cached_title,
  cached_channel_title,
  cached_thumbnail_url,
  cached_description,
  youtube_payload,
  last_fetched_at
)
values
  (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1',
    '11111111-1111-1111-1111-111111111111',
    'youtube',
    'CTimeA12345',
    'https://www.youtube.com/watch?v=CTimeA12345',
    'https://youtu.be/CTimeA12345',
    true,
    'Corridors of Time - Chrono Trigger',
    'VGMC Archive',
    'https://i.ytimg.com/vi/CTimeA12345/mqdefault.jpg',
    'Sample cached YouTube metadata for local catalog testing.',
    jsonb_build_object('title', 'Corridors of Time - Chrono Trigger'),
    timezone('utc', now())
  ),
  (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2',
    '22222222-2222-2222-2222-222222222222',
    'youtube',
    'Aerith12345',
    'https://www.youtube.com/watch?v=Aerith12345',
    'https://www.youtube.com/watch?v=Aerith12345',
    true,
    'Aerith''s Theme | Final Fantasy VII',
    'VGMC Archive',
    'https://i.ytimg.com/vi/Aerith12345/mqdefault.jpg',
    'Retired sample track with tournament placements.',
    jsonb_build_object('title', 'Aerith''s Theme | Final Fantasy VII'),
    timezone('utc', now())
  ),
  (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3',
    '33333333-3333-3333-3333-333333333333',
    'youtube',
    'Mystery7890',
    'https://www.youtube.com/watch?v=Mystery7890',
    'https://www.youtube.com/watch?v=Mystery7890',
    true,
    'Unknown Battle Theme Mix',
    'New Nomination Dump',
    'https://i.ytimg.com/vi/Mystery7890/mqdefault.jpg',
    'Pending metadata example to show YouTube-only ingest.',
    jsonb_build_object('title', 'Unknown Battle Theme Mix'),
    timezone('utc', now())
  )
on conflict (id) do nothing;

insert into public.track_tournament_appearances (
  track_id,
  tournament_id,
  appearance_label,
  placement,
  is_retired_in_tournament,
  notes
)
values
  (
    '11111111-1111-1111-1111-111111111111',
    '00000000-0000-0000-0000-000000000001',
    'Main bracket',
    12,
    false,
    'Sample appearance without retirement.'
  ),
  (
    '22222222-2222-2222-2222-222222222222',
    '00000000-0000-0000-0000-000000000001',
    'Main bracket',
    4,
    false,
    'Reached the latter stages of VGMC 1.'
  ),
  (
    '22222222-2222-2222-2222-222222222222',
    '00000000-0000-0000-0000-000000000002',
    'Retired appearance',
    9,
    true,
    'Retired after its VGMC 2 run.'
  ),
  (
    '33333333-3333-3333-3333-333333333333',
    '00000000-0000-0000-0000-000000000002',
    'Nomination list',
    null,
    false,
    'Metadata still needs curation.'
  )
on conflict (track_id, tournament_id) do nothing;
