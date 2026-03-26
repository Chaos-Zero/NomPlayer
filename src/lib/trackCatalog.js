import { getYouTubeThumbnailUrl, parseYouTubeInput } from '../utils/youtube.js';

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
          typeof entry.placement === 'string' && entry.placement.trim()
            ? entry.placement.trim()
            : Number.isInteger(entry.placement) && entry.placement > 0
              ? String(entry.placement)
              : null,
        highestRound:
          typeof entry.highest_round === 'string' && entry.highest_round.trim()
            ? entry.highest_round.trim()
            : typeof entry.highestRound === 'string' &&
                entry.highestRound.trim()
              ? entry.highestRound.trim()
              : null,
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

export async function fetchAllTracks(supabase) {
  if (!supabase) return [];

  let allData = [];
  let from = 0;
  const pageSize = 1000;
  let hasMore = true;

  while (hasMore) {
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
      .range(from, from + pageSize - 1);

    if (error) {
      throw error;
    }

    if (data && data.length > 0) {
      allData = [...allData, ...data];
      from += pageSize;
      hasMore = data.length === pageSize;
    } else {
      hasMore = false;
    }
  }

  return allData.map(normalizeTrackCatalogEntry).filter(Boolean);
}

export async function fetchMaxVgmcNumber(supabase) {
  if (!supabase) return 0;
  // Sample tracks to find max sequence number
  const { data, error } = await supabase
    .from('track_catalog')
    .select('tournaments')
    .not('tournaments', 'eq', '[]')
    .limit(1000);

  if (error || !data) return 24;

  let max = 0;
  data.forEach((row) => {
    row.tournaments?.forEach((t) => {
      if (t.sequence_number > max) max = t.sequence_number;
      if (t.sequenceNumber > max) max = t.sequenceNumber;
    });
  });

  return max || 24;
}
export async function fetchPagedTracks(
  supabase,
  {
    offset = 0,
    limit = 50,
    searchTerm = '',
    vgmcFilter = '',
    viewMode = 'all',
    userFeedback = {},
    listenedStatusById = {},
    sortColumn = 'vgmc',
    sortAsc = true,
    maxVgmc = 0,
  } = {},
) {
  if (!supabase) return { data: [], totalCount: 0 };

  let query = supabase.from('track_catalog').select(
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
    { count: 'exact' },
  );

  // Search filter
  if (searchTerm) {
    const rawWords = searchTerm
      .trim()
      .split(/\s+/)
      .filter((w) => w.length >= 2);
    const words = rawWords.map((w) => cleanStr(w)).filter((w) => w.length > 0);

    if (words.length > 0) {
      // For each word, ensure it matches at least one of the fields (AND logic between words)
      words.forEach((word) => {
        query = query.or(
          `game_title.ilike.%${word}%,track_title.ilike.%${word}%,display_title.ilike.%${word}%`,
        );
      });
    }
  }

  // VGMC Filter
  if (vgmcFilter) {
    if (maxVgmc > 0 && Number(vgmcFilter) === maxVgmc + 1) {
      // interpreted as "Prospective"
      query = query.filter('tournaments', 'eq', '[]');
    } else {
      query = query.filter(
        'tournaments',
        'cs',
        `[{"sequence_number": ${vgmcFilter}}]`,
      );
    }
  }

  // View Mode Filters
  if (viewMode === 'prospective') {
    query = query.filter('tournaments', 'eq', '[]');
  } else if (viewMode === 'rated' || viewMode === 'unrated') {
    const ratedIds = Object.keys(userFeedback).filter(
      (id) => userFeedback[id]?.rating,
    );
    if (viewMode === 'rated') {
      if (ratedIds.length === 0) {
        return { data: [], totalCount: 0 };
      }
      query = query.in('track_id', ratedIds);
    } else if (viewMode === 'unrated') {
      if (ratedIds.length > 0) {
        query = query.not('track_id', 'in', `(${ratedIds.join(',')})`);
      }
    }
  } else if (viewMode === 'unplaced') {
    query = query.filter('has_result', 'eq', false);
  } else if (viewMode === 'placed') {
    query = query.filter('has_result', 'eq', true);
  } else if (viewMode === 'retired') {
    query = query.filter('is_retired', 'eq', true);
  } else if (viewMode === 'history_recovery') {
    const partialVideoIds = Object.keys(listenedStatusById).filter(
      (id) => listenedStatusById[id] === 'partial',
    );
    if (partialVideoIds.length === 0) {
      return { data: [], totalCount: 0 };
    }
    query = query.in('source_external_id', partialVideoIds);
  }

  // Sorting logic
  if (sortColumn === 'vgmc') {
    query = query
      .order('tournaments->0->sequence_number', {
        ascending: sortAsc,
        nullsFirst: false,
      })
      .order('game_title', { ascending: true });
  } else if (sortColumn === 'game') {
    query = query.order('game_title', { ascending: sortAsc });
  } else if (sortColumn === 'track') {
    query = query.order('track_title', { ascending: sortAsc });
  } else if (sortColumn === 'submissions') {
    query = query.order('tournament_count', { ascending: sortAsc });
  } else if (sortColumn === 'rating') {
    // Handling rating sorting (this might need a join or careful handling if sorting by user feedback)
    // For now, let's sort by game_title if rating is hard to sort server-side without a join
    query = query.order('game_title', { ascending: true });
  } else {
    query = query.order('game_title', { ascending: true });
  }

  const { data, error, count } = await query.range(offset, offset + limit - 1);

  if (error) {
    throw error;
  }

  return {
    data: (data || []).map(normalizeTrackCatalogEntry).filter(Boolean),
    totalCount: count || 0,
  };
}

export async function bulkUpdateTracks(supabase, updatesMap) {
  if (!supabase || !updatesMap || Object.keys(updatesMap).length === 0) {
    return;
  }

  const trackIds = Object.keys(updatesMap);

  for (const trackId of trackIds) {
    const fields = updatesMap[trackId];
    const trackPayload = {};
    const sourcePayload = {};

    if (fields.gameTitle !== undefined)
      trackPayload.canonical_game_title = fields.gameTitle;
    if (fields.trackTitle !== undefined)
      trackPayload.canonical_track_title = fields.trackTitle;

    if (fields.sourceUrl !== undefined) {
      sourcePayload.source_url = fields.sourceUrl;
      sourcePayload.submitted_url = fields.sourceUrl;
      const parsed = parseYouTubeInput(fields.sourceUrl);
      if (parsed?.type === 'video' && parsed.videoId) {
        sourcePayload.external_id = parsed.videoId;
      }
    }

    // 1. Update tracks table
    if (Object.keys(trackPayload).length > 0) {
      const { error: trackError } = await supabase
        .from('tracks')
        .update({
          ...trackPayload,
          updated_at: new Date().toISOString(),
        })
        .eq('id', trackId);

      if (trackError) {
        console.error(
          `bulkUpdateTracks: Error updating tracks for ${trackId}:`,
          trackError,
        );
        throw trackError;
      }
    }

    // 2. Update track_sources table (only primary source)
    if (Object.keys(sourcePayload).length > 0) {
      const { error: sourceError } = await supabase
        .from('track_sources')
        .update({
          ...sourcePayload,
          updated_at: new Date().toISOString(),
        })
        .eq('track_id', trackId)
        .eq('is_primary', true);

      if (sourceError) {
        console.warn(
          `bulkUpdateTracks: Error updating track_sources for ${trackId}:`,
          sourceError,
        );
      }
    }
  }
}

// Smart cleaning: replace brackets with spaces to keep their content, then remove punctuation
const cleanStr = (str) =>
  (str || '')
    .toLowerCase()
    .replace(/[()[\]{}]/g, ' ') // replace brackets with spaces
    .replace(/[^a-z0-9\s]/g, '') // remove other punctuation
    .trim();

export async function findPotentialDuplicates(supabase, track) {
  if (!supabase || !track) return [];

  const baseTrackTitle = cleanStr(track.trackTitle);
  const baseGameTitle = cleanStr(track.gameTitle);

  // Split into words, filter out common short words
  const trackWords = baseTrackTitle.split(/\s+/).filter((w) => w.length >= 2);
  const gameWords = baseGameTitle.split(/\s+/).filter((w) => w.length >= 2);

  // Build a set of conditions
  const orConditions = [];

  // 1. Exact Match Pass (Escape quotes for Supabase filter string)
  const esc = (s) => (s || '').replace(/"/g, '"');
  orConditions.push(
    `and(game_title.eq."${esc(track.gameTitle)}",track_title.eq."${esc(track.trackTitle)}")`,
  );

  // 2. Word-Pairing logic for significant words
  if (trackWords.length > 0 && gameWords.length > 0) {
    const topGameWords = gameWords.slice(0, 3);
    const topTrackWords = trackWords.slice(0, 3);

    topGameWords.forEach((gWord) => {
      topTrackWords.forEach((tWord) => {
        orConditions.push(
          `and(game_title.ilike.%${gWord}%,track_title.ilike.%${tWord}%)`,
        );
      });
    });
  }

  // 3. Long track title fallback
  if (baseTrackTitle.length > 12) {
    orConditions.push(`track_title.ilike.%${baseTrackTitle}%`);
  }

  if (orConditions.length === 0) return [];

  const { data, error } = await supabase
    .from('track_catalog')
    .select('*')
    .or(orConditions.join(','))
    .neq('track_id', track.trackId)
    .limit(40);

  if (error) {
    console.error('Error finding duplicates:', error);
    return [];
  }

  return (data || []).map(normalizeTrackCatalogEntry).filter(Boolean);
}

export async function mergeTracks(
  supabase,
  targetTrack,
  sourceTracks,
  finalValues,
) {
  const sourceIds = (sourceTracks || []).map((s) => s.trackId);
  console.log('mergeTracks: Starting update/merge on base tables', {
    targetId: targetTrack.trackId,
    sourceIds,
    finalValues,
  });

  // 1. Update main tracks table
  const { error: trackUpdateError } = await supabase
    .from('tracks')
    .update({
      canonical_game_title: finalValues.gameTitle || targetTrack.gameTitle,
      canonical_track_title: finalValues.trackTitle || targetTrack.trackTitle,
      updated_at: new Date().toISOString(),
    })
    .eq('id', targetTrack.trackId);

  if (trackUpdateError) {
    console.error('mergeTracks: Tracks update failed', trackUpdateError);
    throw trackUpdateError;
  }

  // 2. Update primary track source
  const youtubeData = parseYouTubeInput(
    finalValues.sourceUrl || targetTrack.sourceUrl,
  );
  if (youtubeData?.videoId) {
    const { error: sourceUpdateError } = await supabase
      .from('track_sources')
      .update({
        external_id: youtubeData.videoId,
        source_url: `https://www.youtube.com/watch?v=${youtubeData.videoId}`,
        updated_at: new Date().toISOString(),
      })
      .eq('track_id', targetTrack.trackId)
      .eq('is_primary', true);

    if (sourceUpdateError) {
      console.warn(
        'mergeTracks: Source update failed (might not be a primary source for this ID)',
        sourceUpdateError,
      );
      // We don't throw here as the main track was updated, but we'll log it
    }
  }

  // 3. Handle tournaments
  if (
    finalValues.tournaments !== undefined &&
    finalValues.tournaments !== null
  ) {
    // Custom tournament list provided (comma-separated sequence numbers)
    const numbers = finalValues.tournaments
      .split(',')
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => !isNaN(n));

    // a. Fetch all tournament IDs for these numbers
    const { data: tournaments, error: tError } = await supabase
      .from('tournaments')
      .select('id, sequence_number')
      .in('sequence_number', numbers);

    if (tError) {
      console.error('mergeTracks: Failed to fetch tournaments', tError);
    } else {
      // b. Clear existing appearances for target track
      await supabase
        .from('track_tournament_appearances')
        .delete()
        .eq('track_id', targetTrack.trackId);

      // c. Insert new appearances
      if (tournaments.length > 0) {
        const inserts = tournaments.map((t) => ({
          track_id: targetTrack.trackId,
          tournament_id: t.id,
          updated_at: new Date().toISOString(),
        }));
        await supabase.from('track_tournament_appearances').insert(inserts);
      }
    }
  } else {
    // Standard behavior: Move tournament appearances from sources to target
    for (const sourceId of sourceIds) {
      const { data: appearances, error: fetchError } = await supabase
        .from('track_tournament_appearances')
        .select('*')
        .eq('track_id', sourceId);

      if (!fetchError && appearances) {
        for (const app of appearances) {
          const { error: moveError } = await supabase
            .from('track_tournament_appearances')
            .insert({
              ...app,
              track_id: targetTrack.trackId,
              updated_at: new Date().toISOString(),
            });

          if (moveError && moveError.code === '23505') {
            console.log(
              `mergeTracks: Tournament ${app.tournament_id} already exists for target, skipping move.`,
            );
          } else if (moveError) {
            console.error('mergeTracks: Error moving appearance', moveError);
          }
        }
      }
    }
  }

  // 4. Delete source tracks (cascading deletes will handle sources/appearances)
  if (sourceIds.length > 0) {
    const { error: deleteError } = await supabase
      .from('tracks')
      .delete()
      .in('id', sourceIds);

    if (deleteError) {
      console.error('mergeTracks: Delete failed', deleteError);
      throw deleteError;
    }
  }

  console.log('mergeTracks: Multi-track merge complete.');
}

export async function fetchRandomUnplacedVgmcTrack(
  supabase,
  excludeVideoIds = [],
) {
  if (!supabase) return null;

  let from = 0;
  const pageSize = 200;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await supabase
      .from('track_catalog')
      .select('*')
      .not('tournaments', 'eq', '[]')
      .range(from, from + pageSize - 1);

    if (error || !data || data.length === 0) {
      break;
    }

    const candidates = data.filter((entry) => {
      const vid = entry.source_external_id || entry.videoId;
      if (vid && excludeVideoIds.includes(vid)) return false;

      const tournaments = entry.tournaments || [];
      if (!Array.isArray(tournaments) || tournaments.length === 0) return false;

      // Unplaced means all recorded tournament appearances have no valid placement
      return tournaments.every((t) => !t.placement || t.placement <= 0);
    });

    if (candidates.length > 0) {
      const randomEntry =
        candidates[Math.floor(Math.random() * candidates.length)];
      return normalizeTrackCatalogEntry(randomEntry);
    }

    from += pageSize;
  }

  return null;
}
