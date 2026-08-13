import { parseYouTubeInput } from '../utils/youtube.js';

// Server-side parser/fold for the GameFAQs VGMC nomination-thread convention:
//
//   + Game | Song | Link      adds (or updates the link of) a nomination
//   - Game | Song | Link      removes a nomination
//
// This is the single place that convention lives. The browser extension is a dumb
// extractor — it only ships {postId, author, text} per post — so a parsing fix or a
// convention change ships by deploying this module, never by updating anyone's
// extension. See functions/api/vgmc-ingest.js for the caller.
//
// Assumption: `text` has already had GameFAQs' quoted-post blocks stripped by the
// content script before it reaches here. That's a DOM-structure concern the server
// can't see, so it has to happen at extraction time, not here.

const COMMAND_LINE_PATTERN = /^\s*([+-])\s*([^|]+)\|([^|]+)\|(.+)$/;

function normalizeText(value) {
  return (value || '').toLowerCase().trim().replace(/\s+/g, ' ');
}

export function normalizeKey(game, song) {
  return `${normalizeText(game)}|${normalizeText(song)}`;
}

export function extractVideoId(rawLink) {
  const parsed = parseYouTubeInput((rawLink || '').trim());
  if (parsed && parsed.type === 'video' && parsed.videoId) {
    return parsed.videoId;
  }
  return null;
}

/**
 * Parses a single line of post text as a nomination command.
 * Returns null for anything that isn't a well-formed command line — including a
 * '+' line whose link doesn't resolve to a YouTube video id, since you can't add a
 * song with no playable link.
 */
export function parseCommandLine(line) {
  if (typeof line !== 'string') return null;

  const match = line.match(COMMAND_LINE_PATTERN);
  if (!match) return null;

  const [, sign, rawGame, rawSong, rawLink] = match;
  const game = rawGame.trim();
  const song = rawSong.trim();
  if (!game || !song) return null;

  const videoId = extractVideoId(rawLink);
  if (sign === '+' && !videoId) return null;

  return {
    sign,
    game,
    song,
    videoId, // may be null on a well-formed '-' line with a stale/invalid link
    sourceKey: normalizeKey(game, song),
  };
}

function comparePostIds(a, b) {
  const numA = Number(a);
  const numB = Number(b);
  if (Number.isFinite(numA) && Number.isFinite(numB)) {
    return numA - numB;
  }
  return String(a).localeCompare(String(b));
}

/**
 * Replays every post in thread order (post 1 -> N) and folds nomination commands
 * into a final record set, keyed by normalized (game, song) identity.
 *
 * Two rules make this work:
 *  - Authority rule: a '-' only removes a nomination if it comes from the same
 *    author who most recently affirmed it with a '+'. A '-' from anyone else, or on
 *    a key that isn't currently present, is a no-op for playlist purposes (it reads
 *    socially as a downvote, not a removal).
 *  - Ordinal stability: a key's `ordinal` is assigned once, the first time it's ever
 *    introduced, and is never reassigned — not even across removal. A later '+' pair
 *    that only changes the link updates the record in place; a removed-then-re-added
 *    song returns to its original slot.
 *
 * Always replays from the full post set — never call this with a delta. Returns the
 * full record map (including tombstones); use buildReconcileEntries to get the
 * desired playlist order.
 */
export function foldThread(posts) {
  const records = new Map();
  let nextOrdinal = 0;

  const sortedPosts = [...(posts || [])]
    .filter((post) => post && typeof post.text === 'string' && post.author)
    .sort((a, b) => comparePostIds(a.postId, b.postId));

  for (const post of sortedPosts) {
    for (const line of post.text.split(/\r?\n/)) {
      const command = parseCommandLine(line);
      if (!command) continue;

      const { sign, sourceKey, game, song, videoId } = command;
      const existing = records.get(sourceKey);

      if (sign === '+') {
        if (existing) {
          existing.present = true;
          existing.videoId = videoId;
          existing.game = game;
          existing.song = song;
          existing.owner = post.author;
        } else {
          records.set(sourceKey, {
            sourceKey,
            game,
            song,
            videoId,
            present: true,
            owner: post.author,
            ordinal: nextOrdinal++,
          });
        }
        continue;
      }

      // sign === '-': authority rule — only the current owner can remove.
      if (existing && existing.present && existing.owner === post.author) {
        existing.present = false;
      }
      // TODO: once downvotes are wired to track_supports/feedback, record a
      // non-owner '-' there instead of silently dropping it for playlist purposes.
    }
  }

  return records;
}

/** Maps a folded record set to the ordered payload reconcile_vgmc_playlist expects. */
export function buildReconcileEntries(records) {
  return [...records.values()]
    .filter((record) => record.present && record.videoId)
    .sort((a, b) => a.ordinal - b.ordinal)
    .map((record) => ({
      source_key: record.sourceKey,
      video_id: record.videoId,
      game: record.game,
      song: record.song,
    }));
}
