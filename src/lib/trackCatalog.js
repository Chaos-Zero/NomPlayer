import { getYouTubeThumbnailUrl } from '../utils/youtube.js';

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

function normalizeTournamentRows(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => {
      if (!entry || typeof entry !== 'object') {
        return null;
      }

      const sequenceNumber =
        Number.isInteger(entry.sequence_number) && entry.sequence_number > 0
          ? entry.sequence_number
          : Number.isInteger(entry.sequenceNumber) && entry.sequenceNumber > 0
            ? entry.sequenceNumber
            : null;

      return {
        slug: typeof entry.slug === 'string' ? entry.slug : '',
        name: typeof entry.name === 'string' ? entry.name : '',
        sequenceNumber,
        appearanceLabel:
          typeof entry.appearance_label === 'string'
            ? entry.appearance_label
            : typeof entry.appearanceLabel === 'string'
              ? entry.appearanceLabel
              : '',
        placement:
          Number.isInteger(entry.placement) && entry.placement > 0
            ? entry.placement
            : null,
        highestRound:
          typeof entry.highest_round === 'string'
            ? entry.highest_round
            : typeof entry.highestRound === 'string'
              ? entry.highestRound
              : '',
        isRetired:
          typeof entry.is_retired === 'boolean'
            ? entry.is_retired
            : Boolean(entry.isRetired),
        notes: typeof entry.notes === 'string' ? entry.notes : '',
      };
    })
    .filter(Boolean);
}

function normalizeTrackCatalogEntry(entry) {
  if (!entry || typeof entry !== 'object') {
    return null;
  }

  const videoId =
    typeof entry.source_external_id === 'string'
      ? entry.source_external_id.trim()
      : typeof entry.videoId === 'string'
        ? entry.videoId.trim()
        : '';
  if (!/^[A-Za-z0-9_-]{11}$/.test(videoId)) {
    return null;
  }

  const tournaments = normalizeTournamentRows(entry.tournaments);

  return {
    trackId:
      typeof entry.track_id === 'string'
        ? entry.track_id
        : typeof entry.trackId === 'string'
          ? entry.trackId
          : null,
    videoId,
    gameTitle:
      typeof entry.game_title === 'string'
        ? entry.game_title
        : typeof entry.gameTitle === 'string'
          ? entry.gameTitle
          : '',
    trackTitle:
      typeof entry.track_title === 'string'
        ? entry.track_title
        : typeof entry.trackTitle === 'string'
          ? entry.trackTitle
          : '',
    displayTitle:
      typeof entry.display_title === 'string' && entry.display_title.trim()
        ? entry.display_title.trim()
        : typeof entry.displayTitle === 'string' && entry.displayTitle.trim()
          ? entry.displayTitle.trim()
          : '',
    sourceTitle:
      typeof entry.source_title === 'string' && entry.source_title.trim()
        ? entry.source_title.trim()
        : typeof entry.sourceTitle === 'string' && entry.sourceTitle.trim()
          ? entry.sourceTitle.trim()
          : '',
    sourceChannelTitle:
      typeof entry.source_channel_title === 'string' &&
      entry.source_channel_title.trim()
        ? entry.source_channel_title.trim()
        : typeof entry.sourceChannelTitle === 'string' &&
            entry.sourceChannelTitle.trim()
          ? entry.sourceChannelTitle.trim()
          : '',
    sourceThumbnailUrl:
      typeof entry.source_thumbnail_url === 'string'
        ? entry.source_thumbnail_url
        : typeof entry.sourceThumbnailUrl === 'string'
          ? entry.sourceThumbnailUrl
          : '',
    sourceUrl:
      typeof entry.source_url === 'string'
        ? entry.source_url
        : typeof entry.sourceUrl === 'string'
          ? entry.sourceUrl
          : '',
    submittedUrl:
      typeof entry.submitted_url === 'string'
        ? entry.submitted_url
        : typeof entry.submittedUrl === 'string'
          ? entry.submittedUrl
          : '',
    isRetired:
      typeof entry.is_retired === 'boolean'
        ? entry.is_retired
        : Boolean(entry.isRetired),
    retiredByTournamentName:
      typeof entry.retired_by_tournament_name === 'string'
        ? entry.retired_by_tournament_name
        : typeof entry.retiredByTournamentName === 'string'
          ? entry.retiredByTournamentName
          : '',
    tournaments,
  };
}

export function mapTrackCatalogEntryToVideo(entry) {
  const normalizedEntry = normalizeTrackCatalogEntry(entry);
  if (!normalizedEntry) {
    return null;
  }

  return {
    videoId: normalizedEntry.videoId,
    title:
      normalizedEntry.displayTitle ||
      normalizedEntry.sourceTitle ||
      normalizedEntry.videoId,
    thumbnail:
      normalizedEntry.sourceThumbnailUrl ||
      getYouTubeThumbnailUrl(normalizedEntry.videoId),
    channelTitle: normalizedEntry.sourceChannelTitle,
    trackId: normalizedEntry.trackId,
    gameTitle: normalizedEntry.gameTitle,
    trackTitle: normalizedEntry.trackTitle,
    displayTitle: normalizedEntry.displayTitle,
    isRetired: normalizedEntry.isRetired,
    retiredByTournamentName: normalizedEntry.retiredByTournamentName,
  };
}

export function getTrackCatalogTournamentSummary(entry) {
  const normalizedEntry = normalizeTrackCatalogEntry(entry);
  if (!normalizedEntry) {
    return '';
  }

  const sequenceNumbers = [
    ...new Set(
      normalizedEntry.tournaments
        .map((row) => row.sequenceNumber)
        .filter((value) => Number.isInteger(value)),
    ),
  ].sort((left, right) => left - right);

  if (!sequenceNumbers.length) {
    return '';
  }

  return `VGMC ${sequenceNumbers.join(', ')}`;
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

export async function searchTrackCatalog(
  supabase,
  searchTerm,
  limitCount = 12,
) {
  const normalizedTerm =
    typeof searchTerm === 'string' ? searchTerm.trim() : '';
  if (!supabase || !normalizedTerm) {
    return [];
  }

  const { data, error } = await supabase.rpc('search_track_catalog', {
    search_term: normalizedTerm,
    limit_count: limitCount,
  });

  if (error) {
    throw error;
  }

  return Array.isArray(data)
    ? data.map(normalizeTrackCatalogEntry).filter(Boolean)
    : [];
}

export async function fetchTrackCatalogByVideoIds(supabase, videoIds) {
  const normalizedIds = Array.from(
    new Set(
      Array.isArray(videoIds)
        ? videoIds
            .map((videoId) =>
              typeof videoId === 'string' ? videoId.trim() : '',
            )
            .filter((videoId) => /^[A-Za-z0-9_-]{11}$/.test(videoId))
        : [],
    ),
  );

  if (!supabase || normalizedIds.length === 0) {
    return [];
  }

  const { data, error } = await supabase
    .from('track_catalog')
    .select(
      `
        track_id,
        game_title,
        track_title,
        display_title,
        is_retired,
        retired_by_tournament_name,
        source_external_id,
        source_url,
        submitted_url,
        source_title,
        source_channel_title,
        source_thumbnail_url,
        tournaments
      `,
    )
    .in('source_external_id', normalizedIds);

  if (error) {
    throw error;
  }

  return Array.isArray(data)
    ? data.map(normalizeTrackCatalogEntry).filter(Boolean)
    : [];
}
