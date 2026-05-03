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
      typeof entry.source_url === 'string' && entry.source_url
        ? entry.source_url
        : typeof entry.sourceUrl === 'string' && entry.sourceUrl
          ? entry.sourceUrl
          : `https://www.youtube.com/watch?v=${videoId}`,
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
    commentCount:
      Number(entry.comment_count) || Number(entry.commentCount) || 0,
    avgRating:
      entry.avg_rating != null
        ? Number(entry.avg_rating)
        : entry.avgRating != null
          ? Number(entry.avgRating)
          : null,
    totalComments:
      entry.total_comments != null
        ? Number(entry.total_comments)
        : entry.totalComments != null
          ? Number(entry.totalComments)
          : 0,
    averageRating:
      entry.average_rating != null
        ? Number(entry.average_rating)
        : entry.averageRating != null
          ? Number(entry.averageRating)
          : null,
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

  if (normalizedIds.length === 0) {
    return [];
  }

  // Serve from memory cache when available — avoids a DB roundtrip.
  const cached = getCachedCatalog();
  if (cached) {
    const idSet = new Set(normalizedIds);
    return cached.filter((entry) => idSet.has(entry.videoId));
  }

  if (!supabase) return [];

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

export async function fetchTrackCatalogByTrackIds(supabase, trackIds) {
  const normalizedIds = Array.from(
    new Set(
      Array.isArray(trackIds)
        ? trackIds.filter((id) => typeof id === 'string' && id.trim())
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
    .in('track_id', normalizedIds);

  if (error) {
    throw error;
  }

  return Array.isArray(data)
    ? data.map(normalizeTrackCatalogEntry).filter(Boolean)
    : [];
}

export async function fetchSupportedTracks(supabase) {
  if (!supabase) return [];

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
    .or('support_count_1.gt.0,support_count_2.gt.0,support_count_3.gt.0');

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
  const { data, error } = await supabase
    .from('tournaments')
    .select('sequence_number')
    .order('sequence_number', { ascending: false })
    .limit(1);

  if (error || !data?.[0]) return 24;
  return data[0].sequence_number || 24;
}
export async function findTrackInCatalog(supabase, videoId) {
  if (!videoId) return null;
  const catalog = await getFullCatalog(supabase);
  const found = catalog.find((t) => t.videoId === videoId);
  return found || null;
}

let memoryCatalog = null;
let activeCatalogPromise = null;
let catalogStatsLoaded = false;
let deltaTrackIds = new Set();

export async function getFullCatalog(supabase) {
  if (memoryCatalog) return memoryCatalog;
  if (activeCatalogPromise) return activeCatalogPromise;

  activeCatalogPromise = (async () => {
    try {
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

      // Attach stats formatting seamlessly and normalize once
      const output = [];
      const deletedIds = new Set();
      const deltaMap = {};
      const supportStatsMap = {};

      if (supabase) {
        // 2. Fetch Delta, Deletions & live support counts concurrently.
        // track_stats_summary (all-time comments/ratings) is deferred — only
        // loaded when the track database opens via loadCatalogStatsIfNeeded().
        const [deltaRes, deletionRes, supportStatsRes] = await Promise.all([
          supabase
            .from('track_catalog')
            .select(
              `track_id, game_title, track_title, display_title, is_retired,
               retired_by_tournament_name, source_external_id, source_url,
               submitted_url, source_title, source_channel_title,
               source_thumbnail_url, tournaments, support_count_1,
               support_count_2, support_count_3, comment_count, avg_rating,
               has_result, tournament_count, updated_at`,
            )
            .gt('updated_at', exportedAt),
          supabase
            .from('track_deletions')
            .select('track_id')
            .gt('deleted_at', exportedAt),
          // Support counts are maintained by triggers and don't touch tracks.updated_at,
          // so the snapshot+delta approach misses them. Fetch all live counts here.
          supabase
            .from('track_allotment_stats')
            .select(
              'track_id, support_count_1, support_count_2, support_count_3',
            )
            .or(
              'support_count_1.gt.0,support_count_2.gt.0,support_count_3.gt.0',
            ),
        ]);

        if (deltaRes.error) {
          console.warn(
            'Catalog Sync Warning: Failed to fetch delta from DB.',
            deltaRes.error,
          );
        }

        const deltaTracks = deltaRes.data || [];
        const supportStatsList = supportStatsRes.data || [];
        for (const s of supportStatsList) supportStatsMap[s.track_id] = s;
        for (const d of deletionRes.data || []) deletedIds.add(d.track_id);
        deltaTrackIds = new Set();
        for (const t of deltaTracks) {
          deltaMap[t.track_id] = t;
          deltaTrackIds.add(t.track_id);
        }
      }

      let patchCount = 0;
      const merged = [];

      // Merge snapshot with deltas
      for (const t of snapshot) {
        const tid = t.track_id || t.trackId;
        if (deletedIds.has(tid)) continue;
        if (deltaMap[tid]) {
          merged.push(deltaMap[tid]);
          delete deltaMap[tid];
          patchCount++;
        } else {
          merged.push(t);
        }
      }

      // Add new tracks from delta
      for (const key in deltaMap) {
        if (!deletedIds.has(key)) {
          merged.push(deltaMap[key]);
        }
      }

      if (patchCount > 0) {
        console.log(
          `%c[Catalog] Initialized with ${patchCount} updates from database.`,
          'color: #3b82f6; font-weight: bold;',
        );
      }

      // Normalization and indexing
      for (const t of merged) {
        const ss = supportStatsMap[t.track_id];
        const normalized = normalizeTrackCatalogEntry(t);
        if (normalized) {
          normalized.hasResult = Boolean(t.has_result);
          normalized.tournamentCount = t.tournament_count || 0;
          // Override snapshot support counts with live trigger-maintained values
          if (ss) {
            normalized.supportCount1 = ss.support_count_1 || 0;
            normalized.supportCount2 = ss.support_count_2 || 0;
            normalized.supportCount3 = ss.support_count_3 || 0;
          }
          output.push(normalized);
        }
      }

      memoryCatalog = output;
      return memoryCatalog;
    } catch (error) {
      console.error('Catalog Sync: Fatal error loading catalog.', error);
      throw error;
    } finally {
      activeCatalogPromise = null;
    }
  })();

  return activeCatalogPromise;
}

export function getCachedCatalog() {
  return memoryCatalog;
}

export function clearCatalogCache() {
  memoryCatalog = null;
  catalogStatsLoaded = false;
  deltaTrackIds = new Set();
}

export async function loadCatalogStatsIfNeeded(supabase) {
  if (!supabase || catalogStatsLoaded || !memoryCatalog) return;
  catalogStatsLoaded = true;

  // Snapshot tracks already have stats embedded; only fetch for delta tracks
  // (those updated since the last snapshot export).
  if (deltaTrackIds.size === 0) return;

  const { data, error } = await supabase
    .from('track_stats_summary')
    .select('track_id, total_comments, average_rating')
    .in('track_id', [...deltaTrackIds]);

  if (error || !data) return;

  const statsMap = {};
  for (const s of data) statsMap[s.track_id] = s;
  for (const track of memoryCatalog) {
    const s = statsMap[track.trackId];
    if (s) {
      track.totalComments = s.total_comments;
      track.averageRating = s.average_rating;
    }
  }
}

export function patchCatalogCache(updates = [], deletedTrackIds = []) {
  if (!memoryCatalog) return;

  const updateMap = new Map();
  for (const u of updates) {
    const key = u.trackId || u.oldVideoId || u.videoId;
    updateMap.set(key, u);
  }

  const deletedSet = new Set(deletedTrackIds);

  memoryCatalog = memoryCatalog
    .filter((entry) => !deletedSet.has(entry.trackId))
    .map((entry) => {
      const update =
        updateMap.get(entry.trackId) || updateMap.get(entry.videoId);
      if (!update) return entry;

      let videoId = update.videoId || entry.videoId;
      if (!update.videoId && update.sourceUrl) {
        const parsed = parseYouTubeInput(update.sourceUrl);
        if (parsed?.type === 'video' && parsed.videoId) {
          videoId = parsed.videoId;
        }
      }

      return {
        ...entry,
        trackId: update.trackId || entry.trackId,
        videoId: videoId,
        gameTitle:
          update.gameTitle !== undefined ? update.gameTitle : entry.gameTitle,
        trackTitle:
          update.trackTitle !== undefined
            ? update.trackTitle
            : entry.trackTitle,
        displayTitle:
          update.displayTitle !== undefined
            ? update.displayTitle
            : `${update.gameTitle || entry.gameTitle} - ${update.trackTitle || entry.trackTitle}`,
        sourceThumbnailUrl: update.thumbnail || entry.sourceThumbnailUrl,
        sourceChannelTitle: update.channelTitle || entry.sourceChannelTitle,
        sourceUrl:
          update.sourceUrl || `https://www.youtube.com/watch?v=${videoId}`,
        submittedUrl:
          update.sourceUrl || `https://www.youtube.com/watch?v=${videoId}`,
        tournaments:
          update.tournaments !== undefined
            ? update.tournaments
            : entry.tournaments,
        tournamentCount:
          update.tournamentCount !== undefined
            ? update.tournamentCount
            : entry.tournamentCount,
        hasResult:
          update.hasResult !== undefined ? update.hasResult : entry.hasResult,
      };
    });
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

  // Search filter — delegate to DB slim search RPC; client-side filtering
  // (vgmcFilter, viewMode, sort) is applied to the returned rows below.
  if (searchTerm && searchTerm.trim().length >= 2) {
    if (supabase) {
      const { data: rawResults, error: searchError } = await supabase.rpc(
        'search_track_catalog_slim',
        { search_term: searchTerm.trim(), result_limit: 200 },
      );
      if (searchError) {
        console.error('Catalog search error:', searchError);
        catalog = [];
      } else {
        catalog = (rawResults || [])
          .map(normalizeTrackCatalogEntry)
          .filter(Boolean);
      }
    } else {
      // Lightweight client-side fallback (mostly for integration tests)
      const normalize = (s) =>
        (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      const term = normalize(searchTerm);
      catalog = (catalog || []).filter(
        (t) =>
          normalize(t.gameTitle).includes(term) ||
          normalize(t.trackTitle).includes(term) ||
          normalize(t.displayTitle).includes(term),
      );
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
            (trn) => trn.sequenceNumber === Number(vgmcFilter),
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
    catalog = catalog.filter((t) => ratedIds.has(t.trackId));
  } else if (viewMode === 'unrated') {
    const ratedIds = new Set(
      Object.keys(userFeedback).filter((id) => userFeedback[id]?.rating),
    );
    catalog = catalog.filter((t) => !ratedIds.has(t.trackId));
  } else if (viewMode === 'unplaced') {
    catalog = catalog.filter((t) => !t.hasResult);
  } else if (viewMode === 'placed') {
    catalog = catalog.filter((t) => t.hasResult);
  } else if (viewMode === 'retired') {
    catalog = catalog.filter((t) => t.isRetired);
  } else if (viewMode === 'history_recovery') {
    const partialVideoIds = new Set(
      Object.keys(listenedStatusById).filter(
        (id) => listenedStatusById[id] === 'partial',
      ),
    );
    if (partialVideoIds.size === 0) return { data: [], totalCount: 0 };
    catalog = catalog.filter((t) => partialVideoIds.has(t.videoId));
  }

  // Sorting logic
  catalog.sort((a, b) => {
    let diff = 0;
    if (sortColumn === 'vgmc') {
      const aSeq = a.tournaments?.[0]?.sequenceNumber ?? 999;
      const bSeq = b.tournaments?.[0]?.sequenceNumber ?? 999;
      diff = aSeq - bSeq;
      if (diff === 0)
        diff = (a.gameTitle || '').localeCompare(b.gameTitle || '');
    } else if (sortColumn === 'game') {
      diff = (a.gameTitle || '').localeCompare(b.gameTitle || '');
    } else if (sortColumn === 'track') {
      diff = (a.trackTitle || '').localeCompare(b.trackTitle || '');
    } else if (sortColumn === 'submissions') {
      diff = (a.tournamentCount || 0) - (b.tournamentCount || 0);
    } else if (sortColumn === 'rating') {
      const aRating = userFeedback[a.trackId]?.rating;
      const bRating = userFeedback[b.trackId]?.rating;

      if (aRating && !bRating) return -1;
      if (!aRating && bRating) return 1;

      if (aRating && bRating) {
        diff = Number(aRating) - Number(bRating);
        if (diff === 0)
          diff = (a.gameTitle || '').localeCompare(b.gameTitle || '');
      } else {
        diff = (a.gameTitle || '').localeCompare(b.gameTitle || '');
      }
    } else if (sortColumn === 'comments') {
      diff = (a.totalComments || 0) - (b.totalComments || 0);
      if (diff === 0)
        diff = (a.gameTitle || '').localeCompare(b.gameTitle || '');
    } else {
      diff = (a.gameTitle || '').localeCompare(b.gameTitle || '');
    }
    return sortAsc ? diff : -diff;
  });

  const totalCount = catalog.length;
  if (limit) {
    catalog = catalog.slice(offset, offset + limit);
  }

  return {
    data: catalog,
    totalCount,
  };
}

export const fetchPagedTracks = fetchFilteredTracks;

export async function bulkUpdateTracks(supabase, updatesMap) {
  if (!supabase || !updatesMap || Object.keys(updatesMap).length === 0) {
    return {};
  }

  const results = {};

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

    let trackRowsAffected = 0;
    let sourceRowsAffected = 0;

    // 1. Update tracks table - ALWAYS update updated_at if anything changed
    if (
      Object.keys(trackPayload).length > 0 ||
      Object.keys(sourcePayload).length > 0
    ) {
      const { error: trackError, count: tCount } = await supabase
        .from('tracks')
        .update(
          {
            ...trackPayload,
            updated_at: new Date().toISOString(),
          },
          { count: 'exact' },
        )
        .eq('id', trackId);

      if (trackError) {
        console.error(
          `bulkUpdateTracks: Error updating tracks for ${trackId}:`,
          trackError,
        );
        throw trackError;
      }
      trackRowsAffected = tCount || 0;
      console.log(
        `bulkUpdateTracks: Successfully updated tracks.id=${trackId} (${trackRowsAffected} rows affected)`,
      );
    }

    // 2. Update track_sources table (only primary source)
    if (Object.keys(sourcePayload).length > 0) {
      console.log(
        `bulkUpdateTracks: Updating track_sources for ${trackId}`,
        sourcePayload,
      );
      const { error: sourceError, count: sCount } = await supabase
        .from('track_sources')
        .update(
          {
            ...sourcePayload,
            updated_at: new Date().toISOString(),
          },
          { count: 'exact' },
        )
        .eq('track_id', trackId)
        .eq('is_primary', true);

      if (sourceError) {
        console.error(
          `bulkUpdateTracks: Error updating track_sources for ${trackId}:`,
          sourceError,
        );
        throw sourceError;
      }
      sourceRowsAffected = sCount || 0;
      console.log(
        `bulkUpdateTracks: Successfully updated sources for ${trackId} (${sourceRowsAffected} rows affected)`,
      );
    }

    results[trackId] = { trackRowsAffected, sourceRowsAffected };
  }

  // Update memory cache
  patchCatalogCache(
    Object.keys(updatesMap).map((trackId) => ({
      trackId,
      ...updatesMap[trackId],
    })),
  );

  return results;
}

export async function findPotentialDuplicates(supabase, track) {
  if (!supabase || !track) return [];

  const searchTerm = [track.gameTitle, track.trackTitle]
    .filter(Boolean)
    .join(' ')
    .trim();
  if (!searchTerm) return [];

  const { data: rawResults, error } = await supabase.rpc(
    'search_track_catalog_slim',
    { search_term: searchTerm, result_limit: 50 },
  );
  if (error || !rawResults) return [];

  const targetGame = String(track.gameTitle || '').toLowerCase();
  const targetTrack = String(track.trackTitle || '').toLowerCase();

  return rawResults
    .map(normalizeTrackCatalogEntry)
    .filter(Boolean)
    .filter((item) => {
      if (item.trackId === track.trackId) return false;

      const gameSim = String(item.gameTitle || '').toLowerCase();
      const trackSim = String(item.trackTitle || '').toLowerCase();

      const gameExact = gameSim === targetGame;
      const trackExact = trackSim === targetTrack;

      if (gameExact && trackExact) return true;
      if (
        gameExact &&
        (trackSim.includes(targetTrack) || targetTrack.includes(trackSim))
      )
        return true;
      if (
        trackExact &&
        (gameSim.includes(targetGame) || targetGame.includes(gameSim))
      )
        return true;

      const hasGameWord = targetGame
        .split(/\s+/)
        .some(
          (w) =>
            (w.length >= 3 && gameSim.includes(w)) ||
            (w.length < 3 && w === gameSim),
        );
      const hasTrackWord = targetTrack
        .split(/\s+/)
        .some(
          (w) =>
            (w.length >= 3 && trackSim.includes(w)) ||
            (w.length < 3 && w === trackSim),
        );

      return hasGameWord && hasTrackWord;
    })
    .slice(0, 15);
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

  // 0. Migrate user data (Feedback, Supports, History) from sources to target
  if (sourceIds.length > 0) {
    const { error: migrationError } = await supabase.rpc(
      'migrate_track_user_data',
      {
        target_track_id: targetTrack.trackId,
        source_track_ids: sourceIds,
      },
    );
    if (migrationError) {
      console.error('mergeTracks: User data migration failed', migrationError);
      // We continue since the source tracks were not yet deleted,
      // but the data might be inconsistent.
    }
  }

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
        submitted_url: finalValues.sourceUrl || targetTrack.sourceUrl,
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
        .select('track_id, tournament_id, updated_at')
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

  // Aggregate data for local cache update
  const affectedEntries = memoryCatalog.filter(
    (e) => e.trackId === targetTrack.trackId || sourceIds.includes(e.trackId),
  );

  const mergedTournamentsMap = new Map();
  let mergedHasResult = false;

  affectedEntries.forEach((entry) => {
    if (entry.hasResult) mergedHasResult = true;
    (entry.tournaments || []).forEach((t) => {
      mergedTournamentsMap.set(t.sequenceNumber, t);
    });
  });

  const mergedTournaments = Array.from(mergedTournamentsMap.values()).sort(
    (a, b) => a.sequenceNumber - b.sequenceNumber,
  );

  patchCatalogCache(
    [
      {
        trackId: targetTrack.trackId,
        videoId: youtubeData?.videoId || targetTrack.videoId,
        gameTitle: finalValues.gameTitle || targetTrack.gameTitle,
        trackTitle: finalValues.trackTitle || targetTrack.trackTitle,
        sourceUrl: finalValues.sourceUrl || targetTrack.sourceUrl,
        tournaments: mergedTournaments,
        tournamentCount: mergedTournaments.length,
        hasResult: mergedHasResult,
      },
    ],
    sourceIds,
  );
  console.log('mergeTracks: Multi-track merge complete.');
}

export async function fetchRandomUnplacedVgmcTrack(
  supabase,
  excludeVideoIds = [],
) {
  if (!supabase) return null;

  try {
    const { data, error } = await supabase.rpc(
      'get_random_unplaced_vgmc_track',
      { exclude_video_ids: excludeVideoIds },
    );

    if (error) {
      console.warn('Could not fetch random spotlight:', error);
      return null;
    }

    const row = Array.isArray(data) ? data[0] : data;
    return row ? normalizeTrackCatalogEntry(row) : null;
  } catch (err) {
    console.error('Error during random track fetch:', err);
  }

  return null;
}
