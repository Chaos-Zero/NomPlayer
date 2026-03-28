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
