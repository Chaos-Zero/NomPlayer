import { checkContent } from '../utils/profanityFilter.js';

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

  return (data || []).reduce((acc, item) => {
    acc[item.track_id] = {
      rating: item.rating,
      note: item.note,
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

export async function fetchDetailedUserActivity(
  supabase,
  userId,
  nominatedTrackIds = [],
) {
  if (!supabase || !userId) return { personal: [], peer: [] };

  // Fetch personal feedback with track info
  const { data: personalData, error: personalError } = await supabase
    .from('track_user_feedback')
    .select(
      `
      track_id,
      rating,
      note,
      updated_at,
      tracks (
        id,
        canonical_game_title,
        canonical_track_title,
        track_sources (external_id)
      )
    `,
    )
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });

  if (personalError) {
    console.error('Error fetching personal feedback:', personalError);
  }

  // Fetch peer feedback on user's nominated tracks
  let peerData = [];
  if (nominatedTrackIds.length > 0) {
    const { data, error: peerError } = await supabase
      .from('track_user_feedback')
      .select(
        `
        track_id,
        rating,
        note,
        updated_at,
        user_id,
        profiles (
          username,
          avatar_url
        ),
        tracks (
          id,
          canonical_game_title,
          canonical_track_title,
          track_sources (external_id)
        )
      `,
      )
      .in('track_id', nominatedTrackIds)
      .neq('user_id', userId)
      .order('updated_at', { ascending: false });

    if (peerError) {
      console.error('Error fetching peer feedback:', peerError);
    } else {
      peerData = data || [];
    }
  }

  // Fetch some general community highlights (last 10 comments globally)
  const { data: globalData, error: globalError } = await supabase
    .from('track_user_feedback')
    .select(
      `
      track_id,
      rating,
      note,
      updated_at,
      user_id,
      profiles (
        username,
        avatar_url
      ),
      tracks (
        id,
        canonical_game_title,
        canonical_track_title,
        track_sources (external_id)
      )
    `,
    )
    .not('note', 'is', null)
    .neq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(10);

  if (globalError) {
    console.error('Error fetching global highlights:', globalError);
  }

  return {
    personal: personalData || [],
    peer: peerData || [],
    highlights: globalData || [],
  };
}
