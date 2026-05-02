import { checkContent } from '../utils/profanityFilter.js';
import { getCachedCatalog } from './trackCatalog.js';

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
        track_sources (external_id)
      )
    `,
    )
    .not('note', 'is', null)
    .order('updated_at', { ascending: false })
    .limit(limit);
  return data || [];
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
