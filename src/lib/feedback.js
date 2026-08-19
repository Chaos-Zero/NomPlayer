import { checkContent } from '../utils/profanityFilter.js';
import { getCachedCatalog } from './trackCatalog.js';
import { getDisplayProfileName } from './playerState.js';

export async function fetchUserFeedback(supabase, userId) {
  if (!supabase || !userId) return {};

  const { data, error } = await supabase
    .from('track_user_feedback')
    .select('track_id, rating, note')
    .eq('user_id', userId);

  if (error) {
    console.error('Failed to fetch user feedback:', error);
    return {};
  }

  const catalog = getCachedCatalog();
  const trackIdToVideoId = catalog
    ? new Map(catalog.map((t) => [t.trackId, t.videoId]))
    : new Map();

  return (data || []).reduce((acc, item) => {
    acc[item.track_id] = {
      rating: item.rating,
      note: item.note,
      videoId: trackIdToVideoId.get(item.track_id) ?? null,
    };
    return acc;
  }, {});
}

export async function upsertUserFeedback(supabase, userId, trackId, feedback) {
  if (!supabase || !userId || !trackId) return null;

  // Profanity Filter Check
  if (feedback.note) {
    const { isBlocked, message } = checkContent(feedback.note);
    if (isBlocked) {
      const error = new Error(message);
      error.isValidationError = true;
      throw error;
    }
  }

  const { data, error } = await supabase
    .from('track_user_feedback')
    .upsert(
      {
        user_id: userId,
        track_id: trackId,
        rating: feedback.rating,
        note: feedback.note,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'track_id, user_id' },
    )
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function fetchCommunityFeedback(supabase, trackId) {
  if (!supabase || !trackId) return [];

  const { data, error } = await supabase
    .from('track_user_feedback')
    .select(
      `
      track_id,
      user_id,
      rating,
      note,
      updated_at,
      profiles (
        username,
        avatar_url
      )
    `,
    )
    .eq('track_id', trackId)
    .order('updated_at', { ascending: false });

  if (error) {
    console.error('Failed to fetch community feedback:', error);
    return [];
  }

  return data || [];
}
export async function deleteUserFeedback(supabase, userId, trackId) {
  if (!supabase || !userId || !trackId) return;

  const { error } = await supabase
    .from('track_user_feedback')
    .delete()
    .eq('user_id', userId)
    .eq('track_id', trackId);

  if (error) {
    throw error;
  }
}

// Per-level list of supporter display names for a track, given its videoId -
// the same track_supports + profiles lookup CommunityActivity.jsx already
// does inline for the player's activity panel (track_supports has no FK
// PostgREST can embed profiles through, hence the manual second query),
// extracted here so the home page leaderboard's clickable support badges
// (see HomePage.jsx) can reuse it too. Always resolves all three levels,
// even the empty ones, so callers don't need an extra existence check.
export async function fetchTrackSupportersByLevel(supabase, videoId) {
  const emptyResult = { 1: [], 2: [], 3: [] };
  if (!supabase || !videoId) return emptyResult;

  const { data: catalogData } = await supabase
    .from('track_catalog')
    .select('track_id')
    .eq('source_external_id', videoId)
    .maybeSingle();

  const trackId = catalogData?.track_id;
  if (!trackId) return emptyResult;

  const { data: supportRows, error } = await supabase
    .from('track_supports')
    .select('level, user_id')
    .eq('track_id', trackId);

  if (error) {
    console.error('Failed to fetch track supporters:', error);
    return emptyResult;
  }

  const rows = supportRows || [];
  const userIds = [...new Set(rows.map((row) => row.user_id))];

  let usernameByUserId = new Map();
  if (userIds.length > 0) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, username')
      .in('id', userIds);
    usernameByUserId = new Map(
      (profiles || []).map((profile) => [profile.id, profile.username]),
    );
  }

  const byLevel = { 1: [], 2: [], 3: [] };
  for (const row of rows) {
    if (!byLevel[row.level]) continue;
    byLevel[row.level].push(
      getDisplayProfileName(
        usernameByUserId.get(row.user_id),
        'Anonymous listener',
      ),
    );
  }
  return byLevel;
}

export async function fetchRecentComments(supabase, limit = 20) {
  if (!supabase) return [];
  const { data } = await supabase
    .from('track_user_feedback')
    .select(
      `
      rating,
      note,
      updated_at,
      user_id,
      profiles (username, avatar_url),
      tracks (
        id,
        canonical_game_title,
        canonical_track_title,
        track_sources (provider, external_id)
      )
    `,
    )
    .not('note', 'is', null)
    .order('updated_at', { ascending: false })
    .limit(limit);
  return data || [];
}

export async function fetchAllCommunityFeedback(supabase) {
  if (!supabase) return [];

  const { data, error } = await supabase
    .from('track_user_feedback')
    .select(
      `
      track_id,
      user_id,
      rating,
      note,
      updated_at,
      profiles (username, avatar_url),
      tracks (
        id,
        canonical_game_title,
        canonical_track_title,
        track_sources (provider, external_id)
      )
    `,
    )
    .order('updated_at', { ascending: false });

  if (error) {
    console.error('Failed to fetch all community feedback:', error);
    return { entries: [], vgmcByTrackId: {} };
  }

  const entries = data || [];

  // Fetch VGMC/tournament data separately via the catalog view
  const trackIds = [...new Set(entries.map((e) => e.track_id).filter(Boolean))];
  let vgmcByTrackId = {};
  if (trackIds.length > 0) {
    const { data: catalogRows } = await supabase
      .from('track_catalog')
      .select('track_id, tournaments')
      .in('track_id', trackIds);

    if (catalogRows) {
      for (const row of catalogRows) {
        const nums = Array.isArray(row.tournaments)
          ? row.tournaments
              .map((t) => t.sequence_number)
              .filter((n) => Number.isInteger(n) && n > 0)
          : [];
        vgmcByTrackId[row.track_id] = [...new Set(nums)].sort((a, b) => b - a);
      }
    }
  }

  return { entries, vgmcByTrackId };
}

export async function fetchDetailedUserActivity(
  supabase,
  userId,
  nominatedTrackIds = [],
) {
  if (!supabase || !userId) return { personal: [], peer: [], highlights: [] };

  const { data, error } = await supabase.rpc('get_user_activity_summary', {
    req_user_id: userId,
    nominated_track_ids: nominatedTrackIds,
  });

  if (error) {
    console.error('Error fetching user activity:', error);
    return { personal: [], peer: [], highlights: [] };
  }

  return {
    personal: data?.personal || [],
    peer: data?.peer || [],
    highlights: data?.highlights || [],
  };
}
