import { getYouTubeThumbnailUrl, parseYouTubeInput } from '../utils/youtube.js';
import { checkContent } from '../utils/profanityFilter.js';

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
    supportCount1:
      Number(entry.support_count_1) || Number(entry.supportCount1) || 0,
    supportCount2:
      Number(entry.support_count_2) || Number(entry.supportCount2) || 0,
    supportCount3:
      Number(entry.support_count_3) || Number(entry.supportCount3) || 0,
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
    supportCount1: normalizedEntry.supportCount1,
    supportCount2: normalizedEntry.supportCount2,
    supportCount3: normalizedEntry.supportCount3,
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
        tournaments,
        support_count_1,
        support_count_2,
        support_count_3
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
          tournaments,
          support_count_1,
          support_count_2,
          support_count_3
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
export async function findTrackInCatalog(supabase, videoId) {
  if (!videoId) return null;
  const catalog = await getFullCatalog(supabase);
  const found = catalog.find(
    (t) => t.source_external_id === videoId || t.videoId === videoId,
  );
  if (found) {
    return normalizeTrackCatalogEntry(found);
  }
  return null;
}

let memoryCatalog = null;

async function getFullCatalog(supabase) {
  if (memoryCatalog) return memoryCatalog;

  // 1. Load static snapshot
  let snapshot = [];
  let exportedAt = new Date(0).toISOString();
  try {
    const mod = await import('../data/catalogSnapshot.json');
    const catalogData = mod.default || mod;
    snapshot = catalogData.tracks || [];
    exportedAt = catalogData.exportedAt || exportedAt;
  } catch (e) {
    console.warn('Failed to load static catalog snapshot', e);
  }

  if (!supabase) return snapshot;

  // 2. Fetch Delta & Stats concurrently
  const [deltaRes, statsRes] = await Promise.all([
    supabase.from('track_catalog').select('*').gt('updated_at', exportedAt),
    supabase
      .from('track_stats_summary')
      .select('track_id, total_comments, average_rating'),
  ]);

  const deltaTracks = deltaRes.data || [];
  const statsList = statsRes.data || [];

  const statsMap = {};
  for (const s of statsList) statsMap[s.track_id] = s;

  const deltaMap = {};
  for (const t of deltaTracks) deltaMap[t.track_id] = t;

  const merged = [];
  for (const t of snapshot) {
    if (deltaMap[t.track_id]) {
      merged.push(deltaMap[t.track_id]);
      delete deltaMap[t.track_id];
    } else {
      merged.push(t);
    }
  }
  for (const key in deltaMap) {
    merged.push(deltaMap[key]);
  }

  // Attach stats formatting seamlessly
  for (const t of merged) {
    const s = statsMap[t.track_id];
    t.totalComments = s ? s.total_comments : 0;
    t.averageRating = s ? s.average_rating : 0;
  }

  memoryCatalog = merged;
  return memoryCatalog;
}

export function clearCatalogCache() {
  memoryCatalog = null;
}

export async function fetchFilteredTracks(
  supabase,
  {
    searchTerm = '',
    vgmcFilter = '',
    viewMode = 'all',
    userFeedback = {},
    listenedStatusById = {},
    sortColumn = 'vgmc',
    sortAsc = true,
    maxVgmc = 0,
    limit,
    offset = 0,
  } = {},
) {
  let catalog = await getFullCatalog(supabase);

  // Search filter
  if (searchTerm) {
    const rawWords = searchTerm
      .trim()
      .split(/\s+/)
      .filter((w) => w.length >= 2);
    // Note: cleanStr should be defined in this file
    const words = rawWords.map((w) => cleanStr(w)).filter((w) => w.length > 0);

    if (words.length > 0) {
      catalog = catalog.filter((t) => {
        return words.every((word) => {
          return (
            (t.game_title && cleanStr(t.game_title).includes(word)) ||
            (t.track_title && cleanStr(t.track_title).includes(word)) ||
            (t.display_title && cleanStr(t.display_title).includes(word))
          );
        });
      });
    }
  }

  // VGMC Filter
  if (vgmcFilter) {
    if (maxVgmc > 0 && Number(vgmcFilter) === maxVgmc + 1) {
      catalog = catalog.filter(
        (t) => !t.tournaments || t.tournaments.length === 0,
      );
    } else {
      catalog = catalog.filter(
        (t) =>
          t.tournaments &&
          t.tournaments.some(
            (trn) => trn.sequence_number === Number(vgmcFilter),
          ),
      );
    }
  }

  // View Mode Filters
  if (viewMode === 'prospective') {
    catalog = catalog.filter(
      (t) => !t.tournaments || t.tournaments.length === 0,
    );
  } else if (viewMode === 'rated') {
    const ratedIds = new Set(
      Object.keys(userFeedback).filter((id) => userFeedback[id]?.rating),
    );
    catalog = catalog.filter((t) => ratedIds.has(t.track_id));
  } else if (viewMode === 'unrated') {
    const ratedIds = new Set(
      Object.keys(userFeedback).filter((id) => userFeedback[id]?.rating),
    );
    catalog = catalog.filter((t) => !ratedIds.has(t.track_id));
  } else if (viewMode === 'unplaced') {
    catalog = catalog.filter((t) => !t.has_result);
  } else if (viewMode === 'placed') {
    catalog = catalog.filter((t) => t.has_result);
  } else if (viewMode === 'retired') {
    catalog = catalog.filter((t) => t.is_retired);
  } else if (viewMode === 'history_recovery') {
    const partialVideoIds = new Set(
      Object.keys(listenedStatusById).filter(
        (id) => listenedStatusById[id] === 'partial',
      ),
    );
    if (partialVideoIds.size === 0) return { data: [], totalCount: 0 };
    catalog = catalog.filter((t) => partialVideoIds.has(t.source_external_id));
  }

  // Sorting logic
  catalog.sort((a, b) => {
    let diff = 0;
    if (sortColumn === 'vgmc') {
      const aSeq = a.tournaments?.[0]?.sequence_number ?? 999;
      const bSeq = b.tournaments?.[0]?.sequence_number ?? 999;
      diff = aSeq - bSeq;
      if (diff === 0)
        diff = (a.game_title || '').localeCompare(b.game_title || '');
    } else if (sortColumn === 'game') {
      diff = (a.game_title || '').localeCompare(b.game_title || '');
    } else if (sortColumn === 'track') {
      diff = (a.track_title || '').localeCompare(b.track_title || '');
    } else if (sortColumn === 'submissions') {
      diff = (a.tournament_count || 0) - (b.tournament_count || 0);
    } else if (sortColumn === 'rating') {
      const aRating = userFeedback[a.track_id]?.rating;
      const bRating = userFeedback[b.track_id]?.rating;

      if (aRating && !bRating) return -1;
      if (!aRating && bRating) return 1;

      if (aRating && bRating) {
        diff = Number(aRating) - Number(bRating);
        if (diff === 0)
          diff = (a.game_title || '').localeCompare(b.game_title || '');
      } else {
        diff = (a.game_title || '').localeCompare(b.game_title || '');
      }
    } else if (sortColumn === 'comments') {
      diff = (a.totalComments || 0) - (b.totalComments || 0);
      if (diff === 0)
        diff = (a.game_title || '').localeCompare(b.game_title || '');
    } else {
      diff = (a.game_title || '').localeCompare(b.game_title || '');
    }
    return sortAsc ? diff : -diff;
  });

  const totalCount = catalog.length;
  if (limit) {
    catalog = catalog.slice(offset, offset + limit);
  }

  return {
    data: catalog
      .map((p) => {
        const normalized = normalizeTrackCatalogEntry(p);
        if (normalized) {
          normalized.averageRating = p.averageRating;
          normalized.totalComments = p.totalComments;
        }
        return normalized;
      })
      .filter(Boolean),
    totalCount,
  };
}

export const fetchPagedTracks = fetchFilteredTracks;

export async function bulkUpdateTracks(supabase, updatesMap) {
  if (!supabase || !updatesMap || Object.keys(updatesMap).length === 0) {
    return;
  }

  const trackIds = Object.keys(updatesMap);

  for (const trackId of trackIds) {
    const fields = updatesMap[trackId];
    const trackPayload = {};
    const sourcePayload = {};

    if (fields.gameTitle !== undefined) {
      const { isBlocked, message } = checkContent(fields.gameTitle);
      if (isBlocked) {
        const error = new Error(message);
        error.isValidationError = true;
        throw error;
      }
      trackPayload.canonical_game_title = fields.gameTitle;
    }
    if (fields.trackTitle !== undefined) {
      const { isBlocked, message } = checkContent(fields.trackTitle);
      if (isBlocked) {
        const error = new Error(message);
        error.isValidationError = true;
        throw error;
      }
      trackPayload.canonical_track_title = fields.trackTitle;
    }

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

  try {
    // 1. Get the total count of unplaced tracks
    const { count, error: countError } = await supabase
      .from('track_catalog')
      .select('*', { count: 'exact', head: true })
      .not('tournaments', 'eq', '[]')
      .eq('has_result', false);

    if (countError || !count) {
      console.warn('Could not fetch count for random spotlight:', countError);
      return null;
    }

    // 2. Try a few random offsets to find a candidate that isn't excluded
    // We fetch a small batch (10 tracks) at a random offset to increase chances of finding an unlistened track
    const maxAttempts = 3;
    for (let i = 0; i < maxAttempts; i++) {
      const randomOffset = Math.max(0, Math.floor(Math.random() * count) - 5);
      const { data, error } = await supabase
        .from('track_catalog')
        .select('*')
        .not('tournaments', 'eq', '[]')
        .eq('has_result', false)
        .range(randomOffset, randomOffset + 20);

      if (error || !data || data.length === 0) continue;

      const candidates = data.filter((entry) => {
        const vid = entry.source_external_id || entry.videoId;
        return vid && !excludeVideoIds.includes(vid);
      });

      if (candidates.length > 0) {
        // Pick a random candidate from the filtered batch
        const finalPick =
          candidates[Math.floor(Math.random() * candidates.length)];
        return normalizeTrackCatalogEntry(finalPick);
      }
    }
  } catch (err) {
    console.error('Error during random track fetch:', err);
  }

  return null;
}
