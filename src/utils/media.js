// Single entrypoint for "the user pasted a link, what is it and how do we
// play/store it" across all three supported providers. UI call sites
// (TopBar, CollectionAdder, ListExplorer, the VGMC ingest pipeline) should
// go through this module rather than importing a provider-specific parser
// directly, so adding a fourth provider later only means adding a branch
// here instead of touching every call site again.
import {
  fetchPlaylistItems,
  getYouTubeThumbnailUrl,
  parseYouTubeInput,
  singleVideoEntry,
} from './youtube.js';
import {
  parseSoundCloudInput,
  singleTrackEntry as singleSoundCloudTrackEntry,
} from './soundcloud.js';
import {
  parseBandcampInput,
  singleTrackEntry as singleBandcampTrackEntry,
} from './bandcamp.js';

/** Every provider a video/track object's `provider` field can legitimately be. */
export const MEDIA_PROVIDERS = ['youtube', 'soundcloud', 'bandcamp'];

/**
 * Parse a pasted URL (or, for YouTube, a bare id) against every supported
 * provider in turn. Each provider parser only matches its own hostname
 * shape, so at most one of these can return non-null for a given input.
 * Returns null if nothing recognized it.
 */
export function parseMediaInput(input) {
  return (
    parseYouTubeInput(input) ||
    parseSoundCloudInput(input) ||
    parseBandcampInput(input)
  );
}

/**
 * Resolve a parseMediaInput() result to playable item(s) + an optional
 * "start playing here" id, ready to hand to a playlist/queue loader.
 *
 * Playlist-type results are YouTube-only today (SoundCloud sets and
 * Bandcamp albums aren't wired up as multi-track adds yet — a Bandcamp
 * "album" URL still resolves as a single playable entry via its own
 * embed, just not expanded track-by-track).
 */
export async function fetchMediaItems(parsed, { apiKey } = {}) {
  if (!parsed) return { items: [], startVideoId: null };

  if (parsed.type === 'playlist') {
    const items = await fetchPlaylistItems(parsed.playlistId, apiKey);
    return {
      items: items.map((item) => ({ ...item, provider: 'youtube' })),
      startVideoId: parsed.videoId || null,
    };
  }

  let item;
  if (parsed.provider === 'soundcloud') {
    item = await singleSoundCloudTrackEntry(parsed.videoId);
  } else if (parsed.provider === 'bandcamp') {
    item = await singleBandcampTrackEntry(parsed.videoId);
  } else {
    item = { ...(await singleVideoEntry(parsed.videoId)), provider: 'youtube' };
  }

  return { items: [item], startVideoId: item.videoId };
}

/**
 * Thumbnail for any provider's video/track object. A cached thumbnail URL
 * (set at add-time, e.g. from oEmbed or the Bandcamp resolver) always wins;
 * only YouTube has a predictable CDN URL to fall back to when none is
 * cached — SoundCloud/Bandcamp entries with no cached thumbnail just have
 * none.
 */
export function getMediaThumbnailUrl(video) {
  if (!video) return '';
  if (video.thumbnail) return video.thumbnail;
  if (!video.provider || video.provider === 'youtube') {
    return getYouTubeThumbnailUrl(video.videoId);
  }
  return '';
}
