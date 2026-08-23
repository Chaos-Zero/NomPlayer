-- Pins vgmc-20's lock cutoff to the exact post where the TC announced locks
-- were finished (banshiryuu, GameFAQs thread 81182579 #253, post id
-- 989659201, 2026-08-22): "Locks are now finished!! Any song that reaches
-- the 7 point threshold will no longer be guaranteed a spot in the contest,
-- but also will not freeze your support slots."
--
-- Set directly rather than via freeze_vgmc_lock_cutoff() (see
-- 20260823040000_add_vgmc_lock_cutoff.sql, which this depends on for the
-- lock_cutoff_post_id column and must run first): that helper freezes at
-- whatever post is newest in vgmc_thread_posts *at the moment it's called*,
-- which isn't reliably this exact post - anything nominated/supported
-- between #253 and whenever the helper actually runs would slip in under
-- the cutoff too. Pinning the id directly needs no sync state at all, so
-- there's no window for that drift.
update public.vgmc_ingest_threads
set lock_cutoff_post_id = '989659201',
    updated_at = timezone('utc', now())
where thread_slug = 'vgmc-20';
