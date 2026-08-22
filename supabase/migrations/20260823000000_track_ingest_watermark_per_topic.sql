-- Track the VGMC ingest staleness watermark per (thread, topic) instead of
-- once per thread_slug.
--
-- vgmc_ingest_threads.watermark assumed every GameFAQs topic feeding a
-- thread_slug had mutually ordered post ids - true for two browsers racing
-- on the SAME topic (the actual case the "small drift tolerance" comment
-- on ingest_vgmc_thread_posts below was written for), false the moment a
-- second topic (e.g. a "part 2" continuation - explicitly supported, see
-- THREAD_SLUG's comment in extension/config.js) feeds the same thread_slug:
-- GameFAQs message ids are global, not per-topic, so an older, already-
-- finished topic's own max post id can legitimately sit far behind a newer,
-- concurrently-active topic's. A single shared watermark mistook that gap
-- for staleness and 409'd a perfectly fine first sync of the older topic
-- (confirmed live, thread 81182579, 2026-08-22) - the ingest below is
-- upserted keyed by (thread_id, post_id), so a topic's own submission can
-- never actually regress another topic's rows regardless of watermark.
create table if not exists public.vgmc_ingest_topic_watermarks (
  thread_id uuid not null references public.vgmc_ingest_threads (id) on delete cascade,
  topic_id text not null,
  watermark integer not null default 0,
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (thread_id, topic_id)
);

alter table public.vgmc_ingest_topic_watermarks enable row level security;
-- No policies, same rationale as vgmc_ingest_threads/vgmc_thread_posts (see
-- add_vgmc_ingest_pipeline): RLS default-denies anon/authenticated with
-- nothing to fall back on, explicit REVOKE/GRANT below is belt-and-suspenders
-- on top of that.
revoke all on public.vgmc_ingest_topic_watermarks from public, anon, authenticated;
grant all on public.vgmc_ingest_topic_watermarks to service_role;

-- New signature (topic_id_input added) - create or replace doesn't drop a
-- function with a different arg list, so the old one is dropped explicitly,
-- and before the column drop just below, so nothing references
-- vgmc_ingest_threads.watermark by the time it's gone.
drop function if exists public.ingest_vgmc_thread_posts(text, integer, integer, jsonb);

-- Superseded by the per-topic table above.
alter table public.vgmc_ingest_threads drop column if exists watermark;

-- Extension protocol change (submissions now carry topic_id) - existing
-- installs must update before they can ingest again, same mechanism as any
-- other min_scraper_version bump.
update public.vgmc_ingest_threads set min_scraper_version = 2
where thread_slug = 'vgmc-20';

create or replace function public.ingest_vgmc_thread_posts(
  thread_slug_input text,
  topic_id_input text,
  scraper_version_input integer,
  watermark_input integer,
  posts_input jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  thread_row public.vgmc_ingest_threads%rowtype;
  normalized_topic_id text;
  stored_watermark integer;
  post_entry jsonb;
  accepted_count integer := 0;
  normalized_post_id text;
  normalized_author text;
  normalized_text text;
begin
  if thread_slug_input is null then
    raise exception 'thread_slug is required';
  end if;

  normalized_topic_id := nullif(btrim(topic_id_input), '');
  if normalized_topic_id is null then
    raise exception 'topic_id is required';
  end if;

  select *
  into thread_row
  from public.vgmc_ingest_threads
  where thread_slug = thread_slug_input
  for update;

  if not found then
    raise exception 'Unknown VGMC ingest thread: %', thread_slug_input;
  end if;

  if scraper_version_input is null
     or scraper_version_input < thread_row.min_scraper_version then
    raise exception 'update_required: scraper_version % is below minimum %',
      scraper_version_input, thread_row.min_scraper_version;
  end if;

  -- Row-per-topic, locked the same way thread_row is above so two concurrent
  -- submissions for the same topic still serialize correctly. A topic seen
  -- for the first time (this exact "first sync" case) has no row yet -
  -- insert one at 0 so the drift check and the update after it both have
  -- something to compare/bump.
  insert into public.vgmc_ingest_topic_watermarks (thread_id, topic_id)
  values (thread_row.id, normalized_topic_id)
  on conflict (thread_id, topic_id) do nothing;

  select watermark
  into stored_watermark
  from public.vgmc_ingest_topic_watermarks
  where thread_id = thread_row.id and topic_id = normalized_topic_id
  for update;

  -- Small drift tolerance: two browsers can legitimately race by a few posts
  -- on the same topic.
  if watermark_input is null or watermark_input < stored_watermark - 50 then
    raise exception 'stale_watermark: submitted watermark % is behind stored watermark %',
      watermark_input, stored_watermark;
  end if;

  if posts_input is null or jsonb_typeof(posts_input) <> 'array' then
    raise exception 'posts must be a JSON array';
  end if;

  if jsonb_array_length(posts_input) > 500 then
    raise exception 'too many posts in a single submission';
  end if;

  for post_entry in select value from jsonb_array_elements(posts_input)
  loop
    normalized_post_id := nullif(btrim(post_entry ->> 'post_id'), '');
    normalized_author := nullif(btrim(post_entry ->> 'author'), '');
    normalized_text := post_entry ->> 'text';

    if normalized_post_id is null
       or normalized_author is null
       or normalized_text is null then
      continue;
    end if;

    insert into public.vgmc_thread_posts (thread_id, post_id, author, raw_text)
    values (thread_row.id, normalized_post_id, normalized_author, normalized_text)
    on conflict (thread_id, post_id) do update
    set author = excluded.author,
        raw_text = excluded.raw_text,
        updated_at = timezone('utc', now());

    accepted_count := accepted_count + 1;
  end loop;

  update public.vgmc_ingest_topic_watermarks
  set watermark = greatest(watermark, watermark_input),
      updated_at = timezone('utc', now())
  where thread_id = thread_row.id and topic_id = normalized_topic_id;

  update public.vgmc_ingest_threads
  set updated_at = timezone('utc', now())
  where id = thread_row.id;

  return jsonb_build_object(
    'threadId', thread_row.id,
    'accepted', accepted_count
  );
end;
$$;

revoke all on function public.ingest_vgmc_thread_posts(text, text, integer, integer, jsonb)
from public, anon, authenticated;

grant execute on function public.ingest_vgmc_thread_posts(text, text, integer, integer, jsonb)
to service_role;
