import { parseYouTubeInput } from '../utils/youtube.js';

// Server-side parser/fold for the GameFAQs VGMC nomination-thread convention:
//
//   + Game | Song | Link      adds (or updates the link of) a nomination; 1 support point
//   ++ Game | Song | Link     same, but worth 2 support points (can also be the initial nomination)
//   - Game | Song | Link      removes a nomination (owner only) and casts a -1 point vote
//   -- Game | Song | Link     casts a -2 point vote; never removes
//
// This is the single place that convention lives. The browser extension is a dumb
// extractor, it only ships {postId, author, text} per post, so a parsing fix or a
// convention change ships by deploying this module, never by updating anyone's
// extension. See functions/api/vgmc-ingest.js for the caller.
//
// Assumption: `text` has already had GameFAQs' quoted-post blocks stripped by the
// content script before it reaches here. That's a DOM-structure concern the server
// can't see, so it has to happen at extraction time, not here.

const COMMAND_LINE_PATTERN = /^\s*([+-]{1,2})\s*([^|]+)\|([^|]+)\|(.+)$/;

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
 * Parses a single line of post text as a nomination/support command. `sign` is the
 * matched run's polarity ('+' or '-'); `value` is its signed point weight, ±1 for a
 * single symbol, ±2 for a doubled one (the regex caps the run at two characters, so
 * that's the natural ceiling, there's no `+++`).
 *
 * Returns null for anything that isn't a well-formed command line, including a
 * '+'/'++' line whose link doesn't resolve to a YouTube video id, since you can't
 * nominate or support a song with no playable link.
 */
export function parseCommandLine(line) {
  if (typeof line !== 'string') return null;

  const match = line.match(COMMAND_LINE_PATTERN);
  if (!match) return null;

  const [, signRun, rawGame, rawSong, rawLink] = match;
  const game = rawGame.trim();
  const song = rawSong.trim();
  if (!game || !song) return null;

  const sign = signRun[0];
  const magnitude = signRun.length;
  const value = sign === '+' ? magnitude : -magnitude;

  const videoId = extractVideoId(rawLink);
  if (sign === '+' && !videoId) return null;

  return {
    sign,
    magnitude,
    value,
    game,
    song,
    videoId, // may be null on a well-formed '-'/'--' line with a stale/invalid link
    sourceKey: normalizeKey(game, song),
  };
}

const MAX_AUTHOR_MAGNITUDE = 2;

/** Adds `value` onto `author`'s running total in `votes`, clamped to
 * [-MAX_AUTHOR_MAGNITUDE, MAX_AUTHOR_MAGNITUDE], see the "two points max per
 * author" rule on foldThread. */
function applyVote(votes, author, value) {
  const runningTotal = (votes.get(author) || 0) + value;
  const clamped = Math.max(
    -MAX_AUTHOR_MAGNITUDE,
    Math.min(MAX_AUTHOR_MAGNITUDE, runningTotal),
  );
  votes.set(author, clamped);
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
 * Replays every post in thread order (post 1 -> N) and folds nomination/support
 * commands into a final record set, keyed by normalized (game, song) identity.
 *
 * Three rules make this work:
 *  - Authority rule: only a single '-' (never '--') from the song's current owner
 *    (the author of its most recent '+'/'++') removes it. Anything else with '-'
 *    polarity is a vote, never a removal.
 *  - Two points max per author: every +/++/-/-- from the same author on the same
 *    song accumulates onto their running total for it (across as many separate
 *    posts as they like, one ++ and two separate +'s both get you to the same
 *    place), but that running total is clamped to [-2, 2] after each event. A
 *    third '+' on top of an already-maxed pair of them is a no-op; a later '-'
 *    still pulls a maxed-out total back down, it just can't be pushed past the
 *    cap. This is what stops one person inflating or tanking a song's score by
 *    reposting, while still counting genuine repeat show-of-support.
 *  - Ordinal stability: a key's `ordinal` is assigned once, the first time it's ever
 *    introduced, and is never reassigned, not even across removal. Votes persist
 *    across a removal/re-add too, for the same reason a tombstoned song keeps its
 *    slot: the record's identity doesn't reset just because it's temporarily absent.
 *
 * Always replays from the full post set, never call this with a delta. Returns the
 * full record map (including tombstones); use buildReconcileEntries to get the
 * desired playlist order plus each record's total support points.
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

      const { sign, magnitude, value, sourceKey, game, song, videoId } =
        command;
      const existing = records.get(sourceKey);

      if (sign === '+') {
        if (existing) {
          // Only the owner (the current nominator) can change what the record
          // points at. Anyone else's '+'/'++' is pure support, it must not silently
          // edit the link/game/song, and critically must not steal removal rights
          // away from the person who actually nominated it (see the authority-rule
          // regression this guards: a supporter's '++' used to reassign `owner` to
          // themselves, which meant the original nominator could no longer remove
          // their own nomination).  A fresh re-add of a tombstoned record is the one
          // exception, whoever revives it becomes the new owner.
          const wasAbsent = !existing.present;
          const isOwnerAction = wasAbsent || existing.owner === post.author;

          existing.present = true;
          if (isOwnerAction) {
            existing.videoId = videoId;
            existing.game = game;
            existing.song = song;
            existing.owner = post.author;
          }
          applyVote(existing.votes, post.author, value);
        } else {
          const votes = new Map();
          applyVote(votes, post.author, value);
          records.set(sourceKey, {
            sourceKey,
            game,
            song,
            videoId,
            present: true,
            owner: post.author,
            ordinal: nextOrdinal++,
            votes,
          });
        }
        continue;
      }

      // sign === '-': nothing to vote on or remove if the song was never nominated.
      if (!existing) continue;

      // Authority rule, only a single '-' (magnitude 1) from the current owner
      // removes. A '--' (magnitude 2) never removes, only votes.
      if (
        magnitude === 1 &&
        existing.present &&
        existing.owner === post.author
      ) {
        existing.present = false;
      }

      applyVote(existing.votes, post.author, value);
    }
  }

  return records;
}

/** Sums a record's per-author votes into its total support point count. */
export function supportPoints(record) {
  let total = 0;
  for (const value of record.votes.values()) total += value;
  return total;
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
      support_points: supportPoints(record),
    }));
}
