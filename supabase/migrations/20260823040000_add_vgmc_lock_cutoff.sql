-- Lets a VGMC thread's owner permanently stop new songs from locking in,
-- without disturbing anything that already has: "no more songs can move to
-- locked, anything after this time stays in the other view."
--
-- lock_cutoff_post_id is null by default (unchanged behavior - locking works
-- exactly as it always has). Once set, it's the last post whose support can
-- newly cross LOCK_THRESHOLD (see markLockOrder/foldThread in
-- src/lib/vgmcIngest.js) - a song that only reaches 7+ points on some later
-- post never gets a locked_order at all, on this replay or any future one,
-- so partitionStandings (src/lib/vgmcStandings.js, itself changed alongside
-- this to key membership on locked_order rather than raw points) keeps it in
-- Current Standings for good, however high its points climb. A song that
-- already qualified at or before the cutoff is untouched, same as any other
-- already-assigned locked_order (see the sticky-lock-order rule it already
-- had).
--
-- ingest_vgmc_thread_posts already loads the full thread_row (for
-- min_scraper_version), so returning lock_cutoff_post_id alongside threadId/
-- accepted costs nothing extra - functions/api/vgmc-ingest.js reads it
-- straight off that response and passes it into foldThread, no separate
-- query needed.
alter table public.vgmc_ingest_threads
  add column if not exists lock_cutoff_post_id text;

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
    'accepted', accepted_count,
    'lockCutoffPostId', thread_row.lock_cutoff_post_id
  );
end;
$$;

-- Flips the switch: freezes thread_slug_input's lock cutoff at whatever's
-- currently the newest ingested post for it. One-way in effect (it can be
-- called again later to push the cutoff further out, but there's no "undo"
-- back to null short of a manual UPDATE) - sync the thread fresh first so
-- this captures everything posted right up to the moment you actually want
-- the freeze to take effect, then run e.g.
-- `select public.freeze_vgmc_lock_cutoff('vgmc-20');` once, via the SQL
-- editor (service_role only, same as every other function in this pipeline -
-- there's no user-facing UI trigger for this on purpose, it's a rare,
-- deliberate call).
create or replace function public.freeze_vgmc_lock_cutoff(thread_slug_input text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  thread_row public.vgmc_ingest_threads%rowtype;
  new_cutoff text;
begin
  if thread_slug_input is null then
    raise exception 'thread_slug is required';
  end if;

  select *
  into thread_row
  from public.vgmc_ingest_threads
  where thread_slug = thread_slug_input
  for update;

  if not found then
    raise exception 'Unknown VGMC ingest thread: %', thread_slug_input;
  end if;

  select max(post_id::bigint)::text
  into new_cutoff
  from public.vgmc_thread_posts
  where thread_id = thread_row.id;

  if new_cutoff is null then
    raise exception 'Thread % has no ingested posts to freeze against', thread_slug_input;
  end if;

  update public.vgmc_ingest_threads
  set lock_cutoff_post_id = new_cutoff,
      updated_at = timezone('utc', now())
  where id = thread_row.id;

  return jsonb_build_object(
    'threadSlug', thread_slug_input,
    'lockCutoffPostId', new_cutoff
  );
end;
$$;

revoke all on function public.ingest_vgmc_thread_posts(text, text, integer, integer, jsonb)
from public, anon, authenticated;

grant execute on function public.ingest_vgmc_thread_posts(text, text, integer, integer, jsonb)
to service_role;

revoke all on function public.freeze_vgmc_lock_cutoff(text)
from public, anon, authenticated;

grant execute on function public.freeze_vgmc_lock_cutoff(text)
to service_role;
