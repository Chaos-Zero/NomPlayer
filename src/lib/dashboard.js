function normalizeVideoEntry(entry) {
  if (!entry || typeof entry !== 'object') return null;
  if (typeof entry.videoId !== 'string' || entry.videoId.trim() === '') {
    return null;
  }

  return {
    videoId: entry.videoId,
    title: typeof entry.title === 'string' ? entry.title : 'Untitled video',
    thumbnail: typeof entry.thumbnail === 'string' ? entry.thumbnail : '',
    channelTitle:
      typeof entry.channelTitle === 'string' ? entry.channelTitle : '',
  };
}

function normalizeVideoList(list) {
  if (!Array.isArray(list)) return [];

  const knownIds = new Set();
  const normalized = [];

  for (const entry of list) {
    const normalizedEntry = normalizeVideoEntry(entry);
    if (!normalizedEntry || knownIds.has(normalizedEntry.videoId)) {
      continue;
    }

    knownIds.add(normalizedEntry.videoId);
    normalized.push(normalizedEntry);
  }

  return normalized;
}

function normalizeOptionalString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function normalizeNominationDashboardUpdate(entry) {
  if (!entry || typeof entry !== 'object') return null;

  const userId =
    typeof entry.user_id === 'string' && entry.user_id.trim()
      ? entry.user_id
      : null;
  const username =
    typeof entry.username === 'string' && entry.username.trim()
      ? entry.username.trim()
      : 'Unknown user';
  const nominations = normalizeVideoList(entry.nominations);

  if (!userId || nominations.length === 0) {
    return null;
  }

  return {
    userId,
    username,
    gamefaqsUsername: normalizeOptionalString(entry.gamefaqs_username),
    avatarUrl: normalizeOptionalString(entry.avatar_url),
    updatedAt:
      typeof entry.updated_at === 'string' && entry.updated_at.trim()
        ? entry.updated_at
        : null,
    nominations,
  };
}

export async function fetchDashboardNominationUpdates(
  supabase,
  limitCount = 8,
) {
  if (!supabase) return [];

  const { data, error } = await supabase.rpc('get_dashboard_nomination_lists', {
    limit_count: limitCount,
  });

  if (error) {
    throw error;
  }

  const rows = Array.isArray(data) ? data : [];
  return rows.map(normalizeNominationDashboardUpdate).filter(Boolean);
}

export function buildDiscoveryCandidates(
  nominationUpdates,
  {
    currentPlaylistIds = new Set(),
    listenedStatusById = {},
    excludeUserId = null,
    limit = 8,
    ignoreFilterVideoIds = [],
  } = {},
) {
  const aggregated = new Map();
  const ignoreSet = new Set(ignoreFilterVideoIds || []);

  for (const update of nominationUpdates) {
    if (!update || (excludeUserId && update.userId === excludeUserId)) {
      continue;
    }

    for (const nomination of update.nominations) {
      if (!nomination?.videoId) continue;

      if (!ignoreSet.has(nomination.videoId)) {
        if (currentPlaylistIds.has(nomination.videoId)) continue;
        if (listenedStatusById[nomination.videoId] === 'complete') continue;
      }

      const existing = aggregated.get(nomination.videoId);
      if (!existing) {
        aggregated.set(nomination.videoId, {
          ...nomination,
          nominationCount: 1,
          latestUpdatedAt: update.updatedAt,
          nominators: [
            {
              userId: update.userId,
              username: update.username,
              avatarUrl: update.avatarUrl,
            },
          ],
        });
        continue;
      }

      existing.nominationCount += 1;
      existing.latestUpdatedAt =
        typeof update.updatedAt === 'string' &&
        (!existing.latestUpdatedAt ||
          update.updatedAt > existing.latestUpdatedAt)
          ? update.updatedAt
          : existing.latestUpdatedAt;

      if (
        !existing.nominators.some(
          (nominator) => nominator.userId === update.userId,
        )
      ) {
        existing.nominators.push({
          userId: update.userId,
          username: update.username,
          avatarUrl: update.avatarUrl,
        });
      }
    }
  }

  return [...aggregated.values()]
    .sort((left, right) => {
      if (right.nominationCount !== left.nominationCount) {
        return right.nominationCount - left.nominationCount;
      }

      if ((right.latestUpdatedAt || '') !== (left.latestUpdatedAt || '')) {
        return (right.latestUpdatedAt || '').localeCompare(
          left.latestUpdatedAt || '',
        );
      }

      return left.title.localeCompare(right.title);
    })
    .slice(0, Math.max(1, limit));
}

export function pickNextDiscoveryCandidate(candidates, currentVideoId = null) {
  if (!Array.isArray(candidates) || candidates.length === 0) {
    return null;
  }

  if (!currentVideoId) {
    return candidates[0];
  }

  const currentIndex = candidates.findIndex(
    (candidate) => candidate.videoId === currentVideoId,
  );

  if (currentIndex < 0) {
    return candidates[0];
  }

  return candidates[(currentIndex + 1) % candidates.length];
}

export function formatRelativeDashboardTime(value) {
  if (!value) return 'Updated recently';

  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) return 'Updated recently';

  const elapsedSeconds = Math.max(
    1,
    Math.round((Date.now() - timestamp) / 1000),
  );
  const ranges = [
    ['day', 86_400],
    ['hour', 3_600],
    ['minute', 60],
  ];

  for (const [unit, secondsPerUnit] of ranges) {
    if (elapsedSeconds >= secondsPerUnit) {
      const amount = Math.round(elapsedSeconds / secondsPerUnit);
      return `${amount} ${unit}${amount === 1 ? '' : 's'} ago`;
    }
  }

  return 'Just now';
}

function decodeHtmlEntities(value) {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#039;|&#x27;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function stripTags(value) {
  return value.replace(/<[^>]+>/g, ' ');
}

export async function fetchGameFaqsThreadsFromRss(rssUrl, limit = 8) {
  if (!rssUrl) return [];

  const response = await fetch(rssUrl);

  if (!response.ok) {
    throw new Error(`RSS feed responded with ${response.status}`);
  }

  const xml = await response.text();
  const threads = [];
  const itemMatches = xml.matchAll(/<item>([\s\S]*?)<\/item>/gi);

  for (const itemMatch of itemMatches) {
    const itemContent = itemMatch[1];
    const titleMatch = itemContent.match(
      /<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i,
    );
    const linkMatch = itemContent.match(
      /<link>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/link>/i,
    );

    if (titleMatch && linkMatch) {
      const rawTitle = titleMatch[1];
      const title = decodeHtmlEntities(stripTags(rawTitle))
        .replace(/\s+/g, ' ')
        .trim();

      if (!title || !/vgmc/i.test(title)) {
        continue;
      }

      const url = linkMatch[1].trim();
      threads.push({
        title,
        url,
      });

      if (threads.length >= limit) {
        break;
      }
    }
  }

  return threads;
}

export async function fetchDashboardVgmcUpdates(limit = 8) {
  const response = await fetch(`/api/gamefaqs-vgmc-updates?limit=${limit}`);

  if (!response.ok) {
    throw new Error('Failed to load VGMC updates.');
  }

  const data = await response.json();
  return Array.isArray(data?.threads) ? data.threads : [];
}
