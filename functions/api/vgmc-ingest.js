import { createClient } from '@supabase/supabase-js';
import { buildReconcileEntries, foldThread } from '../../src/lib/vgmcIngest.js';

// Ingest endpoint for the VGMC nomination-sync browser extension (see /extension).
//
// This is the *only* thing allowed to mutate a VGMC playlist — ingest_vgmc_thread_posts
// and reconcile_vgmc_playlist are both granted to service_role only (see the
// add_vgmc_ingest_pipeline migration), and the service-role key only ever lives in this
// server-side function's environment, never in the extension or the site's client bundle.
//
// The extension is a dumb extractor: it sends raw {post_id, author, text} per post. All
// parsing/fold/ordering logic lives in src/lib/vgmcIngest.js and runs here.

const MAX_POSTS_PER_REQUEST = 500;

function jsonResponse(body, status = 200) {
  return Response.json(body, {
    status,
    headers: { 'cache-control': 'no-store' },
  });
}

async function verifySupabaseUser(supabaseUrl, anonKey, accessToken) {
  if (!accessToken || typeof accessToken !== 'string') return null;

  try {
    const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        apikey: anonKey,
      },
    });
    if (!response.ok) return null;

    const user = await response.json();
    return user && user.id ? user : null;
  } catch {
    return null;
  }
}

function sanitizePosts(posts) {
  if (!Array.isArray(posts)) return [];

  return posts
    .filter(
      (post) =>
        post &&
        (typeof post.post_id === 'string' ||
          typeof post.post_id === 'number') &&
        typeof post.author === 'string' &&
        post.author.trim() &&
        typeof post.text === 'string' &&
        post.text.trim(),
    )
    .map((post) => ({
      post_id: String(post.post_id),
      author: post.author,
      text: post.text,
    }));
}

export async function onRequestPost(context) {
  const { request, env } = context;

  const supabaseUrl = env.VITE_SUPABASE_URL;
  const anonKey = env.VITE_SUPABASE_PUBLISHABLE_KEY;
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return jsonResponse({ error: 'Ingest endpoint is not configured.' }, 500);
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON body.' }, 400);
  }

  const {
    access_token: accessToken,
    thread_slug: threadSlug,
    scraper_version: scraperVersion,
    watermark,
    posts,
  } = payload || {};

  // Gate 1: must be a real, currently-signed-in nomplayer user.
  const user = await verifySupabaseUser(supabaseUrl, anonKey, accessToken);
  if (!user) {
    return jsonResponse({ error: 'Sign in required.' }, 401);
  }

  if (typeof threadSlug !== 'string' || !threadSlug.trim()) {
    return jsonResponse({ error: 'thread_slug is required.' }, 400);
  }

  const sanitizedPosts = sanitizePosts(posts);
  if (sanitizedPosts.length === 0) {
    return jsonResponse({ error: 'No valid posts in submission.' }, 400);
  }
  if (sanitizedPosts.length > MAX_POSTS_PER_REQUEST) {
    return jsonResponse(
      {
        error: `A single submission can include at most ${MAX_POSTS_PER_REQUEST} posts.`,
      },
      400,
    );
  }

  // Gate 2: the only client that ever holds this key is this Cloudflare Function.
  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: ingestResult, error: ingestError } = await adminClient.rpc(
    'ingest_vgmc_thread_posts',
    {
      thread_slug_input: threadSlug,
      scraper_version_input: Number.isFinite(scraperVersion)
        ? scraperVersion
        : 0,
      watermark_input: Number.isFinite(watermark) ? watermark : 0,
      posts_input: sanitizedPosts,
    },
  );

  if (ingestError) {
    const message = ingestError.message || 'Ingest rejected.';
    const isStaleOrOutdated = /update_required|stale_watermark/.test(message);
    return jsonResponse({ error: message }, isStaleOrOutdated ? 409 : 400);
  }

  // Replay the full thread (never a delta) and fold it into desired playlist order.
  const { data: threadPosts, error: fetchError } = await adminClient
    .from('vgmc_thread_posts')
    .select('post_id, author, raw_text')
    .eq('thread_id', ingestResult.threadId);

  if (fetchError) {
    return jsonResponse({ error: fetchError.message }, 500);
  }

  const records = foldThread(
    (threadPosts || []).map((row) => ({
      postId: row.post_id,
      author: row.author,
      text: row.raw_text,
    })),
  );
  const entries = buildReconcileEntries(records);

  const { data: reconcileResult, error: reconcileError } =
    await adminClient.rpc('reconcile_vgmc_playlist', {
      thread_slug_input: threadSlug,
      entries_input: entries,
    });

  if (reconcileError) {
    return jsonResponse({ error: reconcileError.message }, 500);
  }

  return jsonResponse({
    acceptedPosts: ingestResult.accepted,
    playlistSize: reconcileResult.playlistSize,
    skippedVideoConflicts: reconcileResult.skippedVideoConflicts || 0,
    promotedToCatalog: reconcileResult.promotedToCatalog || 0,
    updatedAt: new Date().toISOString(),
  });
}
