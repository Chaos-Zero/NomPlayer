import { parseMediaInput } from '../utils/media.js';

// Server-side parser/fold for the GameFAQs VGMC nomination-thread convention:
//
//   + Game | Song | Link      adds (or updates the link of) a nomination; 1 support point
//   ++ Game | Song | Link     same, but worth 2 support points (can also be the initial nomination)
//   - Game | Song | Link      owner-only: marks a nomination dropped and casts a -1 point vote.
//                             A dropped nomination stays in the playlist as long as its total
//                             support points stay above zero (other people's support can carry
//                             it), it only actually disappears once its points hit zero.
//   -- Game | Song | Link     casts a -2 point vote; never drops the nomination
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

// Curly/smart quote variants get folded onto their straight equivalents before
// keying: GameFAQs posts mix them freely (mobile keyboards and copy-paste both
// autocorrect apostrophes), and two posters typing the same song title with
// different quote styles must still land on the same sourceKey - see the
// "Furi - You're Mine" incident where a smart-quote '++' silently lost its
// support points to a phantom duplicate record instead of merging.
const SINGLE_QUOTE_VARIANTS = /[‘’‚‛′‵´`]/g;
const DOUBLE_QUOTE_VARIANTS = /[“”„‟″‶]/g;

function normalizeText(value) {
  return (value || '')
    .toLowerCase()
    .trim()
    .replace(SINGLE_QUOTE_VARIANTS, "'")
    .replace(DOUBLE_QUOTE_VARIANTS, '"')
    .replace(/\s+/g, ' ');
}

export function normalizeKey(game, song) {
  return `${normalizeText(game)}|${normalizeText(song)}`;
}

/**
 * Resolve a nomination line's link to a single playable item, across any
 * supported provider. Rejects a playlist (YouTube) or album (Bandcamp) link
 * - a nomination is one song, not a whole list, even though those link
 * shapes are fine elsewhere (general playback add-by-URL).
 * Returns { videoId, provider } or null.
 */
export function extractVideoId(rawLink) {
  const parsed = parseMediaInput((rawLink || '').trim());
  if (!parsed || (parsed.type !== 'video' && parsed.type !== 'track')) {
    return null;
  }
  return { videoId: parsed.videoId, provider: parsed.provider || 'youtube' };
}

/**
 * Parses a single line of post text as a nomination/support command. `sign` is the
 * matched run's polarity ('+' or '-'); `value` is its signed point weight, ±1 for a
 * single symbol, ±2 for a doubled one (the regex caps the run at two characters, so
 * that's the natural ceiling, there's no `+++`).
 *
 * Returns null for anything that isn't a well-formed command line, including a
 * '+'/'++' line whose link doesn't resolve to a playable YouTube/SoundCloud/
 * Bandcamp track, since you can't nominate or support a song with no playable link.
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

  const media = extractVideoId(rawLink);
  if (sign === '+' && !media) return null;

  return {
    sign,
    magnitude,
    value,
    game,
    song,
    // both null on a well-formed '-'/'--' line with a stale/invalid link
    videoId: media?.videoId ?? null,
    provider: media?.provider ?? null,
    sourceKey: normalizeKey(game, song),
  };
}

// Support points at which a nomination "locks in" - see partitionStandings
// in src/lib/vgmcStandings.js, which must keep using this same threshold for
// splitting Current Standings from Locked Noms.
const LOCK_THRESHOLD = 7;

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
 * Whether a record currently belongs in the playlist. A record that's never been
 * dropped by its owner is always active, regardless of its point total (a song
 * can sit at 0 or even negative points from downvotes and still be in the
 * playlist; dropping it is a deliberate act, not an automatic consequence of a
 * bad score). Once the owner drops it (a single '-'), it stays active only as
 * long as its total support points are still above zero, other people's support
 * can keep a dropped nomination alive; it disappears the moment points hit zero.
 */
export function isRecordActive(record) {
  if (!record) return false;
  if (!record.droppedByOwner) return true;
  return supportPoints(record) > 0;
}

/**
 * Replays every post in thread order (post 1 -> N) and folds nomination/support
 * commands into a final record set, keyed by normalized (game, song) identity.
 *
 * Three rules make this work:
 *  - Authority rule: only a single '-' (never '--') from the song's current owner
 *    (the author of its most recent '+'/'++') marks it dropped. Anything else
 *    with '-' polarity is a vote, never a drop. A dropped record isn't removed
 *    outright, see isRecordActive: it stays in the playlist as long as its points
 *    stay positive, and reverting/reclaiming (see below) un-drops it.
 *  - Two points max per author: every +/++/-/-- from the same author on the same
 *    song accumulates onto their running total for it (across as many separate
 *    posts as they like, one ++ and two separate +'s both get you to the same
 *    place), but that running total is clamped to [-2, 2] after each event. A
 *    third '+' on top of an already-maxed pair of them is a no-op; a later '-'
 *    still pulls a maxed-out total back down, it just can't be pushed past the
 *    cap. This is what stops one person inflating or tanking a song's score by
 *    reposting, while still counting genuine repeat show-of-support.
 *  - Ordinal stability: a key's `ordinal` is assigned once, the first time it's ever
 *    introduced, and is never reassigned, not even across a drop. Votes persist
 *    across a drop/re-add too, for the same reason an inactive song keeps its
 *    slot: the record's identity doesn't reset just because it's temporarily
 *    inactive.
 *  - Lock-order stability: like `ordinal`, a record's `lockedOrder` is assigned
 *    once, the moment its running support total first reaches LOCK_THRESHOLD,
 *    and is never reassigned or cleared, even if support later gets pulled and
 *    its total drops back below the threshold. This is what lets the Locked
 *    Noms tab (see partitionStandings in src/lib/vgmcStandings.js) sort by the
 *    order songs actually qualified in, rather than by their current point
 *    total. Because replay is always full and deterministic (see below), this
 *    falls out naturally: rerunning the same history always finds the same
 *    first-crossing point for a given record, nothing extra needs to persist
 *    across runs to keep it sticky.
 *
 * Always replays from the full post set, never call this with a delta. Returns the
 * full record map (including inactive/dropped records); use buildReconcileEntries
 * to get the desired playlist order plus each record's total support points.
 */
export function foldThread(posts) {
  const records = new Map();
  let nextOrdinal = 0;
  let nextLockSequence = 0;

  // Called after every vote change; records are append-only, so this only
  // ever assigns lockedOrder once, per the lock-order stability rule above.
  function markLockOrder(record) {
    if (record.lockedOrder == null && supportPoints(record) >= LOCK_THRESHOLD) {
      record.lockedOrder = nextLockSequence++;
    }
  }

  const sortedPosts = [...(posts || [])]
    .filter((post) => post && typeof post.text === 'string' && post.author)
    .sort((a, b) => comparePostIds(a.postId, b.postId));

  for (const post of sortedPosts) {
    for (const line of post.text.split(/\r?\n/)) {
      const command = parseCommandLine(line);
      if (!command) continue;

      const {
        sign,
        magnitude,
        value,
        sourceKey,
        game,
        song,
        videoId,
        provider,
      } = command;
      const existing = records.get(sourceKey);

      if (sign === '+') {
        if (existing) {
          // Only the owner (the current nominator) can change what the record
          // points at. Anyone else's '+'/'++' is pure support, it must not silently
          // edit the link/game/song, and critically must not steal drop rights
          // away from the person who actually nominated it (see the authority-rule
          // regression this guards: a supporter's '++' used to reassign `owner` to
          // themselves, which meant the original nominator could no longer drop
          // their own nomination). A fresh re-add of an inactive record is the one
          // exception, whoever revives it becomes the new owner.
          const wasInactive = !isRecordActive(existing);
          const isOwnerAction = wasInactive || existing.owner === post.author;

          if (isOwnerAction) {
            existing.videoId = videoId;
            existing.provider = provider;
            existing.game = game;
            existing.song = song;
            existing.owner = post.author;
            existing.droppedByOwner = false;
          }
          applyVote(existing.votes, post.author, value);
          markLockOrder(existing);
        } else {
          const votes = new Map();
          applyVote(votes, post.author, value);
          const record = {
            sourceKey,
            game,
            song,
            videoId,
            provider,
            droppedByOwner: false,
            owner: post.author,
            ordinal: nextOrdinal++,
            lockedOrder: null,
            votes,
          };
          records.set(sourceKey, record);
          // A single new nomination can only start at magnitude <=2, well
          // under LOCK_THRESHOLD, but check anyway rather than assume - this
          // stays correct even if the per-author cap ever changes.
          markLockOrder(record);
        }
        continue;
      }

      // sign === '-': nothing to vote on or drop if the song was never nominated.
      if (!existing) continue;

      // Authority rule, only a single '-' (magnitude 1) from the current owner
      // marks it dropped. A '--' (magnitude 2) never drops, only votes. Dropping
      // isn't an immediate removal, see isRecordActive: the record stays active
      // as long as its points stay above zero.
      if (magnitude === 1 && existing.owner === post.author) {
        existing.droppedByOwner = true;
      }

      // No markLockOrder call here: '-'/'--' only ever subtracts, so it can
      // never newly cross LOCK_THRESHOLD upward, only the '+' branch above
      // can trigger a fresh lock.
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

/** Counts the authors currently contributing a nonzero vote to a record. An
 * author who cast a vote but later cancelled it back out (e.g. supported then
 * un-supported, or an owner whose own drop nets their running total to 0
 * alongside an earlier '+') keeps a 0-value entry in `record.votes` (see
 * applyVote), but isn't a current supporter and must not be counted as one. */
function activeVoterCount(record) {
  let count = 0;
  for (const value of record.votes.values()) {
    if (value !== 0) count += 1;
  }
  return count;
}

/** Maps a folded record set to the ordered payload reconcile_vgmc_playlist expects.
 *
 * Every record with a resolved videoId is included here, active or not -
 * `records` only ever grows (foldThread's map is append-only), so this list
 * is stable across reruns. `is_active` (see isRecordActive) tells the RPC
 * whether to mark the row dropped rather than to delete it: a dropped
 * nomination's game/song/support history stays in user_playlist_tracks so it
 * can be shown again behind the "show dropped nominations" toggle, it just
 * stops counting toward the live playlist/standings by default.
 *
 * `support_voters` is the count of distinct authors with a currently nonzero
 * running total in the record's vote map, see activeVoterCount. It's a
 * headcount, deliberately separate from `support_points`: a song with two ++'s
 * and one + reads as 5 points from 3 people, not 5 points from some unknown
 * number of double-counted votes. See VgmcStandingsView for where this is
 * displayed.
 *
 * `locked_order` is the record's lockedOrder from foldThread (null if it's
 * never reached LOCK_THRESHOLD support points) - the sequence number of when
 * it first qualified, sticky even if its points later dip back down. Lets
 * the Locked Noms tab sort by qualification order instead of current points,
 * see partitionStandings in src/lib/vgmcStandings.js. */
export function buildReconcileEntries(records) {
  return [...records.values()]
    .filter((record) => record.videoId)
    .sort((a, b) => a.ordinal - b.ordinal)
    .map((record) => ({
      source_key: record.sourceKey,
      video_id: record.videoId,
      provider: record.provider || 'youtube',
      game: record.game,
      song: record.song,
      support_points: supportPoints(record),
      support_voters: activeVoterCount(record),
      is_active: isRecordActive(record),
      locked_order: record.lockedOrder,
    }));
}
