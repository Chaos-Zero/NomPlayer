function normalizeCatalogVideo(video) {
  if (!video || typeof video !== 'object') return null;

  const videoId = typeof video.videoId === 'string' ? video.videoId.trim() : '';
  if (!/^[A-Za-z0-9_-]{11}$/.test(videoId)) {
    return null;
  }

  const cachedTitle =
    typeof video.title === 'string' && video.title.trim()
      ? video.title.trim()
      : null;
  const cachedChannelTitle =
    typeof video.channelTitle === 'string' && video.channelTitle.trim()
      ? video.channelTitle.trim()
      : null;
  const cachedThumbnailUrl =
    typeof video.thumbnail === 'string' && video.thumbnail.trim()
      ? video.thumbnail.trim()
      : null;

  return {
    video_id: videoId,
    cached_title: cachedTitle,
    cached_channel_title: cachedChannelTitle,
    cached_thumbnail_url: cachedThumbnailUrl,
    submitted_url: `https://www.youtube.com/watch?v=${videoId}`,
  };
}

export function createYouTubeTrackIngestPayload(videos) {
  if (!Array.isArray(videos)) {
    return [];
  }

  const payload = [];
  const seenVideoIds = new Set();

  for (const video of videos) {
    const normalizedVideo = normalizeCatalogVideo(video);
    if (!normalizedVideo || seenVideoIds.has(normalizedVideo.video_id)) {
      continue;
    }

    seenVideoIds.add(normalizedVideo.video_id);
    payload.push(normalizedVideo);
  }

  return payload;
}

export async function ingestYouTubeTrackSources(supabase, videos) {
  const payload = createYouTubeTrackIngestPayload(videos);
  if (!payload.length) {
    return [];
  }

  const { data, error } = await supabase.rpc('ingest_youtube_track_sources', {
    youtube_sources: payload,
  });

  if (error) {
    throw error;
  }

  return Array.isArray(data) ? data : [];
}
