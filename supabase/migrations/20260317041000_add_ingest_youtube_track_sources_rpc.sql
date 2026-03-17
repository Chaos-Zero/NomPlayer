create or replace function public.ingest_youtube_track_sources(
  youtube_sources jsonb
)
returns table (
  track_id uuid,
  source_id uuid,
  youtube_video_id text,
  was_created boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  active_user_id uuid := auth.uid();
  source_entry jsonb;
  normalized_video_id text;
  normalized_title text;
  normalized_channel_title text;
  normalized_thumbnail_url text;
  normalized_submitted_url text;
  now_utc timestamptz := timezone('utc', now());
  existing_source public.track_sources%rowtype;
  created_track_id uuid;
  created_source_id uuid;
begin
  if active_user_id is null then
    raise exception 'Authentication required';
  end if;

  if youtube_sources is null or jsonb_typeof(youtube_sources) <> 'array' then
    return;
  end if;

  for source_entry in
    select value
    from jsonb_array_elements(youtube_sources)
  loop
    normalized_video_id := nullif(btrim(source_entry ->> 'video_id'), '');
    normalized_title := nullif(btrim(source_entry ->> 'cached_title'), '');
    normalized_channel_title := nullif(
      btrim(source_entry ->> 'cached_channel_title'),
      ''
    );
    normalized_thumbnail_url := nullif(
      btrim(source_entry ->> 'cached_thumbnail_url'),
      ''
    );
    normalized_submitted_url := nullif(btrim(source_entry ->> 'submitted_url'), '');

    if normalized_video_id is null
      or normalized_video_id !~ '^[A-Za-z0-9_-]{11}$' then
      continue;
    end if;

    select *
    into existing_source
    from public.track_sources
    where provider = 'youtube'
      and external_id = normalized_video_id
    order by is_primary desc, created_at asc
    limit 1;

    if found then
      update public.track_sources
      set source_url = format(
            'https://www.youtube.com/watch?v=%s',
            normalized_video_id
          ),
          submitted_url = coalesce(
            normalized_submitted_url,
            public.track_sources.submitted_url
          ),
          cached_title = coalesce(
            normalized_title,
            public.track_sources.cached_title
          ),
          cached_channel_title = coalesce(
            normalized_channel_title,
            public.track_sources.cached_channel_title
          ),
          cached_thumbnail_url = coalesce(
            normalized_thumbnail_url,
            public.track_sources.cached_thumbnail_url
          ),
          last_seen_at = now_utc,
          last_fetched_at = case
            when normalized_title is not null
              or normalized_channel_title is not null
              or normalized_thumbnail_url is not null
              then now_utc
            else public.track_sources.last_fetched_at
          end
      where id = existing_source.id
      returning
        public.track_sources.track_id,
        public.track_sources.id,
        public.track_sources.external_id,
        false
      into track_id, source_id, youtube_video_id, was_created;

      return next;
      continue;
    end if;

    insert into public.tracks (created_by)
    values (active_user_id)
    returning id into created_track_id;

    insert into public.track_sources (
      track_id,
      provider,
      external_id,
      source_url,
      submitted_url,
      is_primary,
      cached_title,
      cached_channel_title,
      cached_thumbnail_url,
      first_seen_at,
      last_seen_at,
      last_fetched_at,
      created_by
    )
    values (
      created_track_id,
      'youtube',
      normalized_video_id,
      format('https://www.youtube.com/watch?v=%s', normalized_video_id),
      normalized_submitted_url,
      true,
      normalized_title,
      normalized_channel_title,
      normalized_thumbnail_url,
      now_utc,
      now_utc,
      case
        when normalized_title is not null
          or normalized_channel_title is not null
          or normalized_thumbnail_url is not null
          then now_utc
        else null
      end,
      active_user_id
    )
    returning id into created_source_id;

    track_id := created_track_id;
    source_id := created_source_id;
    youtube_video_id := normalized_video_id;
    was_created := true;
    return next;
  end loop;
end;
$$;

revoke all
on function public.ingest_youtube_track_sources(jsonb)
from public;

grant execute
on function public.ingest_youtube_track_sources(jsonb)
to authenticated;
