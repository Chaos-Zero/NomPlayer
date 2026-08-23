import { describe, expect, it } from 'vitest';
import {
  buildReconcileEntries,
  extractVideoId,
  foldThread,
  isRecordActive,
  normalizeKey,
  parseCommandLine,
  supportPoints,
} from '../lib/vgmcIngest.js';

describe('normalizeKey', () => {
  it('lowercases, trims, and collapses whitespace', () => {
    expect(normalizeKey('  Zelda  ', 'Song   of Storms')).toBe(
      'zelda|song of storms',
    );
  });

  it('folds curly quote variants onto their straight equivalents', () => {
    // Regression test: a nomination typed with a straight apostrophe and a
    // support line typed with a curly one (common with mobile keyboards/
    // copy-paste) must key identically, or the support silently lands on a
    // phantom duplicate record instead of the real nomination.
    expect(normalizeKey('Furi', "You're Mine")).toBe(
      normalizeKey('Furi', 'You’re Mine'),
    );
    expect(normalizeKey('Game', '“Quoted” Title')).toBe(
      normalizeKey('Game', '"Quoted" Title'),
    );
  });
});

describe('extractVideoId', () => {
  it('extracts an id from a standard watch URL', () => {
    expect(
      extractVideoId('https://www.youtube.com/watch?v=abc12345678'),
    ).toEqual({ videoId: 'abc12345678', provider: 'youtube' });
  });

  it('extracts a SoundCloud track permalink', () => {
    expect(
      extractVideoId('https://soundcloud.com/artist-name/track-name'),
    ).toEqual({
      videoId: 'https://soundcloud.com/artist-name/track-name',
      provider: 'soundcloud',
    });
  });

  it('extracts a Bandcamp track page URL', () => {
    expect(
      extractVideoId('https://artistname.bandcamp.com/track/song-title'),
    ).toEqual({
      videoId: 'https://artistname.bandcamp.com/track/song-title',
      provider: 'bandcamp',
    });
  });

  it('rejects a Bandcamp album URL - a nomination is one song, not a whole album', () => {
    expect(
      extractVideoId('https://artistname.bandcamp.com/album/album-title'),
    ).toBeNull();
  });

  it('returns null for an unrecognized link', () => {
    expect(extractVideoId('https://example.com/song.mp3')).toBeNull();
  });

  it('tolerates a short junk tail glued onto an otherwise-valid YouTube id (live case: VGMC thread 81179417 post #11)', () => {
    expect(
      extractVideoId('https://www.youtube.com/watch?v=t1bzqjoZyeQ38'),
    ).toEqual({ videoId: 't1bzqjoZyeQ', provider: 'youtube' });
  });

  it('still rejects a link that swallowed a whole extra command (lost line break)', () => {
    expect(
      extractVideoId(
        'https://www.youtube.com/watch?v=abc12345678Other Game | Other Song | https://www.youtube.com/watch?v=xyz98765432',
      ),
    ).toBeNull();
  });

  it('rejects a literal placeholder left in a post, even though it happens to be id-charset-only (live regression: a "Youtube_Link" template line got synced as a nomination)', () => {
    expect(extractVideoId('Youtube_Link')).toBeNull();
  });
});

describe('parseCommandLine', () => {
  it('parses a well-formed add line', () => {
    expect(
      parseCommandLine(
        '+ Zelda | Song of Storms | https://www.youtube.com/watch?v=abc12345678',
      ),
    ).toEqual({
      sign: '+',
      magnitude: 1,
      value: 1,
      game: 'Zelda',
      song: 'Song of Storms',
      videoId: 'abc12345678',
      provider: 'youtube',
      sourceKey: 'zelda|song of storms',
    });
  });

  it('parses a well-formed add line with a SoundCloud link', () => {
    expect(
      parseCommandLine(
        '+ Zelda | Song of Storms | https://soundcloud.com/artist/track',
      ),
    ).toEqual({
      sign: '+',
      magnitude: 1,
      value: 1,
      game: 'Zelda',
      song: 'Song of Storms',
      videoId: 'https://soundcloud.com/artist/track',
      provider: 'soundcloud',
      sourceKey: 'zelda|song of storms',
    });
  });

  it('parses a well-formed remove line even with a garbage link', () => {
    const parsed = parseCommandLine('- Zelda | Song of Storms | not a link');
    expect(parsed).toMatchObject({
      sign: '-',
      game: 'Zelda',
      song: 'Song of Storms',
      videoId: null,
      provider: null,
    });
  });

  it('rejects an add line with no resolvable video link', () => {
    expect(
      parseCommandLine('+ Zelda | Song of Storms | not a link'),
    ).toBeNull();
  });

  it('parses a doubled "++" as magnitude 2', () => {
    expect(
      parseCommandLine(
        '++ Zelda | Song of Storms | https://www.youtube.com/watch?v=abc12345678',
      ),
    ).toMatchObject({ sign: '+', magnitude: 2, value: 2 });
  });

  it('parses a doubled "--" as magnitude 2, negative', () => {
    expect(parseCommandLine('-- Zelda | Song of Storms | link')).toMatchObject({
      sign: '-',
      magnitude: 2,
      value: -2,
    });
  });

  it('rejects lines missing a pipe-delimited field', () => {
    expect(
      parseCommandLine('+ Zelda | https://youtu.be/abc12345678'),
    ).toBeNull();
  });

  it('rejects prose that is not a command line', () => {
    expect(parseCommandLine('I really like this one, great pick!')).toBeNull();
  });

  it('rejects an empty game or song field', () => {
    expect(
      parseCommandLine('+  | Song of Storms | https://youtu.be/abc12345678'),
    ).toBeNull();
  });
});

describe('foldThread', () => {
  it('adds a song and includes it in reconcile order', () => {
    const records = foldThread([
      {
        postId: '1',
        author: 'alice',
        text: '+ Zelda | Song of Storms | https://youtu.be/abc12345678',
      },
    ]);

    expect(buildReconcileEntries(records)).toEqual([
      {
        source_key: 'zelda|song of storms',
        video_id: 'abc12345678',
        provider: 'youtube',
        game: 'Zelda',
        song: 'Song of Storms',
        support_points: 1,
        support_voters: 1,
        is_active: true,
        locked_order: null,
      },
    ]);
  });

  it('carries a non-YouTube provider through to the reconcile entry', () => {
    const records = foldThread([
      {
        postId: '1',
        author: 'alice',
        text: '+ Zelda | Song of Storms | https://soundcloud.com/artist/track',
      },
    ]);

    expect(buildReconcileEntries(records)).toEqual([
      {
        source_key: 'zelda|song of storms',
        video_id: 'https://soundcloud.com/artist/track',
        provider: 'soundcloud',
        game: 'Zelda',
        song: 'Song of Storms',
        support_points: 1,
        support_voters: 1,
        is_active: true,
        locked_order: null,
      },
    ]);
  });

  it('lets the owning author remove their own nomination, but keeps it as a dropped entry', () => {
    const records = foldThread([
      {
        postId: '1',
        author: 'alice',
        text: '+ Zelda | Song of Storms | https://youtu.be/abc12345678',
      },
      { postId: '2', author: 'alice', text: '- Zelda | Song of Storms | link' },
    ]);

    // Alice's own '-' drops it (owner, magnitude 1) and her net vote nets to
    // 0, so isRecordActive reads false - but the record still has a resolved
    // videoId, so it's still emitted here, just flagged is_active: false
    // rather than omitted. The RPC marks the row dropped instead of deleting
    // it, so its history survives to be shown behind the toggle.
    expect(buildReconcileEntries(records)).toEqual([
      expect.objectContaining({
        source_key: 'zelda|song of storms',
        support_points: 0,
        is_active: false,
      }),
    ]);
  });

  it('treats a non-owner "-" as a no-op, not a removal (authority rule)', () => {
    const records = foldThread([
      {
        postId: '1',
        author: 'alice',
        text: '+ Zelda | Song of Storms | https://youtu.be/abc12345678',
      },
      { postId: '2', author: 'bob', text: '- Zelda | Song of Storms | link' },
    ]);

    expect(buildReconcileEntries(records)).toHaveLength(1);
  });

  it('keeps ordinal position stable when the owner updates the link', () => {
    const records = foldThread([
      {
        postId: '1',
        author: 'alice',
        text: '+ Game A | Song A | https://youtu.be/aaaaaaaaaaa',
      },
      {
        postId: '2',
        author: 'bob',
        text: '+ Game B | Song B | https://youtu.be/bbbbbbbbbbb',
      },
      {
        postId: '3',
        author: 'alice',
        text: '- Game A | Song A | link',
      },
      {
        postId: '4',
        author: 'alice',
        text: '+ Game A | Song A | https://youtu.be/ccccccccccc',
      },
    ]);

    const entries = buildReconcileEntries(records);
    expect(entries.map((e) => e.game)).toEqual(['Game A', 'Game B']);
    expect(entries[0].video_id).toBe('ccccccccccc');
  });

  it('returns a tombstoned re-add to its original slot, not the end', () => {
    const records = foldThread([
      {
        postId: '1',
        author: 'alice',
        text: '+ Game A | Song A | https://youtu.be/aaaaaaaaaaa',
      },
      {
        postId: '2',
        author: 'bob',
        text: '+ Game B | Song B | https://youtu.be/bbbbbbbbbbb',
      },
      { postId: '3', author: 'alice', text: '- Game A | Song A | link' },
      {
        postId: '4',
        author: 'carol',
        text: '+ Game A | Song A | https://youtu.be/ddddddddddd',
      },
    ]);

    const entries = buildReconcileEntries(records);
    expect(entries.map((e) => e.game)).toEqual(['Game A', 'Game B']);
  });

  it('replays out-of-order posts by post id, not array order', () => {
    const records = foldThread([
      { postId: '5', author: 'alice', text: '- Game A | Song A | link' },
      {
        postId: '1',
        author: 'alice',
        text: '+ Game A | Song A | https://youtu.be/aaaaaaaaaaa',
      },
    ]);

    // Replayed in post-id order, post 1's '+' creates the record, then post
    // 5's '-' (owner, magnitude 1) drops it, nets her to 0 points. It's still
    // emitted, just flagged dropped, not array order.
    expect(buildReconcileEntries(records)).toEqual([
      expect.objectContaining({ support_points: 0, is_active: false }),
    ]);
  });

  it('ignores malformed and prose lines mixed in with real commands', () => {
    const records = foldThread([
      {
        postId: '1',
        author: 'alice',
        text: [
          'Great thread everyone!',
          '+ Game A | Song A | https://youtu.be/aaaaaaaaaaa',
          '+ missing pipe field',
          'Looking forward to more nominations.',
        ].join('\n'),
      },
    ]);

    expect(buildReconcileEntries(records)).toHaveLength(1);
  });

  it('ignores posts with no author or non-string text', () => {
    const records = foldThread([
      {
        postId: '1',
        author: '',
        text: '+ Game A | Song A | https://youtu.be/aaaaaaaaaaa',
      },
      { postId: '2', author: 'alice', text: null },
    ]);

    expect(buildReconcileEntries(records)).toEqual([]);
  });

  it('a plain nomination starts at 1 support point, ++ starts at 2', () => {
    const plusRecords = foldThread([
      {
        postId: '1',
        author: 'alice',
        text: '+ Game A | Song A | https://youtu.be/aaaaaaaaaaa',
      },
    ]);
    const doublePlusRecords = foldThread([
      {
        postId: '1',
        author: 'alice',
        text: '++ Game B | Song B | https://youtu.be/bbbbbbbbbbb',
      },
    ]);

    expect(buildReconcileEntries(plusRecords)[0].support_points).toBe(1);
    expect(buildReconcileEntries(doublePlusRecords)[0].support_points).toBe(2);
  });

  it("sums other authors' votes on top of the nominator's", () => {
    const records = foldThread([
      {
        postId: '1',
        author: 'alice',
        text: '+ Game A | Song A | https://youtu.be/aaaaaaaaaaa',
      },
      {
        postId: '2',
        author: 'bob',
        text: '++ Game A | Song A | https://youtu.be/aaaaaaaaaaa',
      },
    ]);

    expect(buildReconcileEntries(records)[0].support_points).toBe(3);
  });

  it("alice can still drop her own nomination, but bob's ++ support keeps it in the playlist", () => {
    const records = foldThread([
      {
        postId: '1',
        author: 'alice',
        text: '+ Game A | Song A | https://youtu.be/aaaaaaaaaaa',
      },
      {
        postId: '2',
        author: 'bob',
        text: '++ Game A | Song A | https://youtu.be/aaaaaaaaaaa',
      },
      { postId: '3', author: 'alice', text: '- Game A | Song A | link' },
    ]);

    // alice's drop still fires (authority rule: owner, magnitude 1), but it's
    // no longer an immediate removal, it only excludes the record once points
    // hit zero. bob's ++ (2 points) outweighs alice's net (1 - 1 = 0), so the
    // record stays active at 2 points.
    const record = records.get('game a|song a');
    expect(record.droppedByOwner).toBe(true);
    expect(buildReconcileEntries(records)).toEqual([
      expect.objectContaining({ support_points: 2 }),
    ]);
  });

  it("a supporter's ++ never edits the record's link/game/song", () => {
    const records = foldThread([
      {
        postId: '1',
        author: 'alice',
        text: '+ Game A | Song A | https://youtu.be/aaaaaaaaaaa',
      },
      {
        postId: '2',
        author: 'bob',
        text: '++ Game A | Song A | https://youtu.be/bbbbbbbbbbb',
      },
    ]);

    expect(buildReconcileEntries(records)[0].video_id).toBe('aaaaaaaaaaa');
  });

  it("a later vote accumulates onto the same author's running total, not replaces it", () => {
    const records = foldThread([
      {
        postId: '1',
        author: 'alice',
        text: '+ Game A | Song A | https://youtu.be/aaaaaaaaaaa',
      },
      {
        postId: '2',
        author: 'bob',
        text: '++ Game A | Song A | https://youtu.be/aaaaaaaaaaa',
      },
      { postId: '3', author: 'bob', text: '-- Game A | Song A | link' },
    ]);

    // alice: +1. bob: ++ (2) then -- (-2) accumulate to a net 0, not a
    // replacement down to -2, bob effectively took his support back.
    // Total: 1 + 0 = 1. (Still present in the playlist itself,
    // buildReconcileEntries only filters on presence, not score; the >1-point
    // threshold is the standings view's job.)
    expect(buildReconcileEntries(records)[0].support_points).toBe(1);
  });

  it("a third '+' on top of an already-maxed pair from the same author is a no-op", () => {
    const records = foldThread([
      {
        postId: '1',
        author: 'alice',
        text: '+ Game A | Song A | https://youtu.be/aaaaaaaaaaa',
      },
      {
        postId: '2',
        author: 'alice',
        text: '+ Game A | Song A | https://youtu.be/aaaaaaaaaaa',
      },
      {
        postId: '3',
        author: 'alice',
        text: '+ Game A | Song A | https://youtu.be/aaaaaaaaaaa',
      },
    ]);

    // Two separate +'s already max alice out at 2, a third contributes nothing.
    expect(buildReconcileEntries(records)[0].support_points).toBe(2);
  });

  it('an author can never exceed 2 points total, however they get there', () => {
    const viaTwoPlusRecords = foldThread([
      {
        postId: '1',
        author: 'alice',
        text: '+ Game A | Song A | https://youtu.be/aaaaaaaaaaa',
      },
      {
        postId: '2',
        author: 'alice',
        text: '+ Game A | Song A | https://youtu.be/aaaaaaaaaaa',
      },
    ]);
    const viaDoublePlusRecords = foldThread([
      {
        postId: '1',
        author: 'alice',
        text: '++ Game A | Song A | https://youtu.be/aaaaaaaaaaa',
      },
    ]);
    const viaDoublePlusThenPlusRecords = foldThread([
      {
        postId: '1',
        author: 'alice',
        text: '++ Game A | Song A | https://youtu.be/aaaaaaaaaaa',
      },
      {
        postId: '2',
        author: 'alice',
        text: '+ Game A | Song A | https://youtu.be/aaaaaaaaaaa',
      },
    ]);

    expect(buildReconcileEntries(viaTwoPlusRecords)[0].support_points).toBe(2);
    expect(buildReconcileEntries(viaDoublePlusRecords)[0].support_points).toBe(
      2,
    );
    expect(
      buildReconcileEntries(viaDoublePlusThenPlusRecords)[0].support_points,
    ).toBe(2);
  });

  it('the same cap applies symmetrically on the negative side', () => {
    const records = foldThread([
      {
        postId: '1',
        author: 'alice',
        text: '+ Game A | Song A | https://youtu.be/aaaaaaaaaaa',
      },
      // bob isn't the owner, so his '-'s are pure opposition votes, never removals.
      { postId: '2', author: 'bob', text: '- Game A | Song A | link' },
      { postId: '3', author: 'bob', text: '- Game A | Song A | link' },
      { postId: '4', author: 'bob', text: '- Game A | Song A | link' },
    ]);

    // bob's three separate -1's cap at -2, not -3.
    expect(buildReconcileEntries(records)[0].support_points).toBe(1 + -2);
  });

  it('a partial reversal that never hit the cap nets normally (+1, +1, -1 = 1)', () => {
    const records = foldThread([
      {
        postId: '1',
        author: 'alice',
        text: '+ Game A | Song A | https://youtu.be/aaaaaaaaaaa',
      },
      {
        postId: '2',
        author: 'alice',
        text: '+ Game A | Song A | https://youtu.be/aaaaaaaaaaa',
      },
      { postId: '3', author: 'alice', text: '- Game A | Song A | link' },
    ]);

    // alice is the owner, this '-' marks the record dropped and casts her -1
    // vote, but her own earlier double '+' left her net at 1 point, so the
    // record stays active: isRecordActive only excludes a dropped record once
    // its points hit zero, regardless of whose points those are. Scoring still
    // accumulates regardless: 1 + 1 - 1 = 1.
    const record = records.get('game a|song a');
    expect(record.droppedByOwner).toBe(true);
    expect(isRecordActive(record)).toBe(true);
    expect(supportPoints(record)).toBe(1);
  });

  it('a drop only takes effect once points reach zero; other supporters keep it in the playlist', () => {
    const records = foldThread([
      {
        postId: '1',
        author: 'alice',
        text: '+ Game A | Song A | https://youtu.be/aaaaaaaaaaa',
      },
      {
        postId: '2',
        author: 'bob',
        text: '++ Game A | Song A | https://youtu.be/aaaaaaaaaaa',
      },
      { postId: '3', author: 'alice', text: '- Game A | Song A | link' },
    ]);

    // alice drops her own nomination (1 - 1 = 0 for her), but bob's separate
    // ++ support (2 points) keeps the total above zero, so it stays active and
    // still gets reconciled into the playlist.
    const record = records.get('game a|song a');
    expect(record.droppedByOwner).toBe(true);
    expect(isRecordActive(record)).toBe(true);
    expect(supportPoints(record)).toBe(2);
    expect(buildReconcileEntries(records)).toHaveLength(1);
  });

  it('a dropped-but-still-supported nomination becomes inactive once later downvotes bring it to zero, but is still reconciled as a dropped entry', () => {
    const records = foldThread([
      {
        postId: '1',
        author: 'alice',
        text: '+ Game A | Song A | https://youtu.be/aaaaaaaaaaa',
      },
      {
        postId: '2',
        author: 'bob',
        text: '+ Game A | Song A | https://youtu.be/aaaaaaaaaaa',
      },
      { postId: '3', author: 'alice', text: '- Game A | Song A | link' },
      { postId: '4', author: 'carol', text: '- Game A | Song A | link' },
    ]);

    // After alice's drop: alice 0, bob 1 -> total 1, still active. carol's
    // opposition vote (non-owner, so a vote only, not a second drop) brings it
    // to 0, which finally excludes it from the live playlist - but it's still
    // emitted here (is_active: false) so the RPC marks it dropped rather than
    // deleting it.
    const record = records.get('game a|song a');
    expect(supportPoints(record)).toBe(0);
    expect(isRecordActive(record)).toBe(false);
    expect(buildReconcileEntries(records)).toEqual([
      expect.objectContaining({ support_points: 0, is_active: false }),
    ]);
  });

  it('"--" never drops the nomination, only affects its score', () => {
    const records = foldThread([
      {
        postId: '1',
        author: 'alice',
        text: '++ Game A | Song A | https://youtu.be/aaaaaaaaaaa',
      },
      { postId: '2', author: 'alice', text: '-- Game A | Song A | link' },
    ]);

    // alice's own total accumulates (2 + -2 = 0, clamped no-op); '--' only ever
    // affects score, it never marks the record dropped, so it's still active
    // even though its points are down to 0.
    const record = records.get('game a|song a');
    expect(record.droppedByOwner).toBe(false);
    expect(isRecordActive(record)).toBe(true);
    expect(supportPoints(record)).toBe(0);
  });

  it('support_voters counts distinct authors, not total point weight', () => {
    // Two ++'s and one + -> 5 points, but only 3 people cast them.
    const records = foldThread([
      {
        postId: '1',
        author: 'alice',
        text: '++ Game A | Song A | https://youtu.be/aaaaaaaaaaa',
      },
      {
        postId: '2',
        author: 'bob',
        text: '++ Game A | Song A | https://youtu.be/aaaaaaaaaaa',
      },
      {
        postId: '3',
        author: 'carol',
        text: '+ Game A | Song A | https://youtu.be/aaaaaaaaaaa',
      },
    ]);

    const entry = buildReconcileEntries(records)[0];
    expect(entry.support_points).toBe(5);
    expect(entry.support_voters).toBe(3);
  });

  it('support_voters does not grow when the same author votes again (clamped, not duplicated)', () => {
    const records = foldThread([
      {
        postId: '1',
        author: 'alice',
        text: '+ Game A | Song A | https://youtu.be/aaaaaaaaaaa',
      },
      {
        postId: '2',
        author: 'alice',
        text: '+ Game A | Song A | https://youtu.be/aaaaaaaaaaa',
      },
    ]);

    const entry = buildReconcileEntries(records)[0];
    expect(entry.support_points).toBe(2);
    expect(entry.support_voters).toBe(1);
  });

  it('support_voters excludes an author whose own votes now net to zero', () => {
    // alice nominates then drops her own nomination (+1, -1 -> nets to 0), but
    // bob's support keeps it alive. Only bob is currently attributing points,
    // so support_voters must read 1, not 2.
    const records = foldThread([
      {
        postId: '1',
        author: 'alice',
        text: '+ Game A | Song A | https://youtu.be/aaaaaaaaaaa',
      },
      {
        postId: '2',
        author: 'bob',
        text: '+ Game A | Song A | https://youtu.be/aaaaaaaaaaa',
      },
      { postId: '3', author: 'alice', text: '- Game A | Song A | link' },
    ]);

    const entry = buildReconcileEntries(records)[0];
    expect(entry.support_points).toBe(1);
    expect(entry.support_voters).toBe(1);
  });

  it('assigns locked_order the first time a record reaches 7 support points', () => {
    const records = foldThread([
      {
        postId: '1',
        author: 'alice',
        text: '++ Game A | Song A | https://youtu.be/aaaaaaaaaaa',
      },
      {
        postId: '2',
        author: 'bob',
        text: '++ Game A | Song A | https://youtu.be/aaaaaaaaaaa',
      },
      {
        postId: '3',
        author: 'carol',
        text: '++ Game A | Song A | https://youtu.be/aaaaaaaaaaa',
      },
      // 2+2+2 = 6, not locked yet.
      {
        postId: '4',
        author: 'dave',
        text: '+ Game A | Song A | https://youtu.be/aaaaaaaaaaa',
      },
      // 6+1 = 7, locks here.
    ]);

    const entry = buildReconcileEntries(records)[0];
    expect(entry.support_points).toBe(7);
    expect(entry.locked_order).toBe(0);
  });

  it('leaves locked_order null for a record still under the threshold', () => {
    const records = foldThread([
      {
        postId: '1',
        author: 'alice',
        text: '++ Game A | Song A | https://youtu.be/aaaaaaaaaaa',
      },
    ]);

    expect(buildReconcileEntries(records)[0].locked_order).toBeNull();
  });

  it('assigns locked_order in the chronological order songs qualified, not point-total order', () => {
    const records = foldThread([
      // Song B reaches 7 first even though it ends up with fewer total
      // points than Song A, which locks in later - locked_order must
      // reflect qualification order, not final score.
      {
        postId: '1',
        author: 'alice',
        text: '++ Game B | Song B | https://youtu.be/bbbbbbbbbbb',
      },
      {
        postId: '2',
        author: 'bob',
        text: '++ Game B | Song B | https://youtu.be/bbbbbbbbbbb',
      },
      {
        postId: '3',
        author: 'carol',
        text: '++ Game B | Song B | https://youtu.be/bbbbbbbbbbb',
      },
      {
        postId: '4',
        author: 'dave',
        text: '+ Game B | Song B | https://youtu.be/bbbbbbbbbbb',
      },
      // Song B: 7 points, locks at post 4.
      {
        postId: '5',
        author: 'erin',
        text: '++ Game A | Song A | https://youtu.be/aaaaaaaaaaa',
      },
      {
        postId: '6',
        author: 'frank',
        text: '++ Game A | Song A | https://youtu.be/aaaaaaaaaaa',
      },
      {
        postId: '7',
        author: 'grace',
        text: '++ Game A | Song A | https://youtu.be/aaaaaaaaaaa',
      },
      {
        postId: '8',
        author: 'heidi',
        text: '++ Game A | Song A | https://youtu.be/aaaaaaaaaaa',
      },
      // Song A: 8 points, locks at post 8, after Song B.
    ]);

    const entries = buildReconcileEntries(records);
    const songA = entries.find((e) => e.source_key === 'game a|song a');
    const songB = entries.find((e) => e.source_key === 'game b|song b');
    expect(songA.support_points).toBe(8);
    expect(songB.support_points).toBe(7);
    expect(songB.locked_order).toBeLessThan(songA.locked_order);
  });

  it('keeps locked_order sticky even after points drop back below the threshold', () => {
    const records = foldThread([
      {
        postId: '1',
        author: 'alice',
        text: '++ Game A | Song A | https://youtu.be/aaaaaaaaaaa',
      },
      {
        postId: '2',
        author: 'bob',
        text: '++ Game A | Song A | https://youtu.be/aaaaaaaaaaa',
      },
      {
        postId: '3',
        author: 'carol',
        text: '++ Game A | Song A | https://youtu.be/aaaaaaaaaaa',
      },
      {
        postId: '4',
        author: 'dave',
        text: '+ Game A | Song A | https://youtu.be/aaaaaaaaaaa',
      },
      // 7 points, locks here.
      { postId: '5', author: 'dave', text: '-- Game A | Song A | link' },
      // Dave pulls his own support back down (-2), 7 -> 5, but locked_order
      // must stay set, not clear.
    ]);

    const entry = buildReconcileEntries(records)[0];
    expect(entry.support_points).toBe(5);
    expect(entry.locked_order).toBe(0);
  });

  it('still locks a record that reaches the threshold at or before lockCutoffPostId', () => {
    const posts = [
      {
        postId: '1',
        author: 'alice',
        text: '++ Game A | Song A | https://youtu.be/aaaaaaaaaaa',
      },
      {
        postId: '2',
        author: 'bob',
        text: '++ Game A | Song A | https://youtu.be/aaaaaaaaaaa',
      },
      {
        postId: '3',
        author: 'carol',
        text: '++ Game A | Song A | https://youtu.be/aaaaaaaaaaa',
      },
      {
        postId: '4',
        author: 'dave',
        text: '+ Game A | Song A | https://youtu.be/aaaaaaaaaaa',
      },
      // 7 points, locks at post 4 - at the cutoff, not after it.
    ];

    const entry = buildReconcileEntries(
      foldThread(posts, { lockCutoffPostId: '4' }),
    )[0];
    expect(entry.support_points).toBe(7);
    expect(entry.locked_order).toBe(0);
  });

  it('never locks a record that only reaches the threshold after lockCutoffPostId', () => {
    // Same history as the sticky-lock_order test above, but frozen as of
    // post 3 - the request this exists for: "no more songs can move to
    // locked, anything after this time stays in the other view".
    const posts = [
      {
        postId: '1',
        author: 'alice',
        text: '++ Game A | Song A | https://youtu.be/aaaaaaaaaaa',
      },
      {
        postId: '2',
        author: 'bob',
        text: '++ Game A | Song A | https://youtu.be/aaaaaaaaaaa',
      },
      {
        postId: '3',
        author: 'carol',
        text: '++ Game A | Song A | https://youtu.be/aaaaaaaaaaa',
      },
      // 6 points as of the cutoff.
      {
        postId: '4',
        author: 'dave',
        text: '+ Game A | Song A | https://youtu.be/aaaaaaaaaaa',
      },
      // 7 points, but this post is after the cutoff - must not lock.
    ];

    const entry = buildReconcileEntries(
      foldThread(posts, { lockCutoffPostId: '3' }),
    )[0];
    expect(entry.support_points).toBe(7);
    expect(entry.locked_order).toBeNull();
  });

  it('a record blocked by lockCutoffPostId never locks later either, no matter how much more support it gets', () => {
    const posts = [
      {
        postId: '1',
        author: 'alice',
        text: '++ Game A | Song A | https://youtu.be/aaaaaaaaaaa',
      },
      {
        postId: '2',
        author: 'bob',
        text: '++ Game A | Song A | https://youtu.be/aaaaaaaaaaa',
      },
      // 4 points as of the cutoff.
      {
        postId: '3',
        author: 'carol',
        text: '++ Game A | Song A | https://youtu.be/aaaaaaaaaaa',
      },
      {
        postId: '4',
        author: 'dave',
        text: '++ Game A | Song A | https://youtu.be/aaaaaaaaaaa',
      },
      // 8 points, well past LOCK_THRESHOLD, but every one of these posts is
      // after the cutoff - the door stays shut regardless of how it's
      // crossed.
    ];

    const entry = buildReconcileEntries(
      foldThread(posts, { lockCutoffPostId: '2' }),
    )[0];
    expect(entry.support_points).toBe(8);
    expect(entry.locked_order).toBeNull();
  });

  it('lockCutoffPostId does not affect a record that already locked before it', () => {
    const posts = [
      {
        postId: '1',
        author: 'alice',
        text: '++ Game A | Song A | https://youtu.be/aaaaaaaaaaa',
      },
      {
        postId: '2',
        author: 'bob',
        text: '++ Game A | Song A | https://youtu.be/aaaaaaaaaaa',
      },
      {
        postId: '3',
        author: 'carol',
        text: '++ Game A | Song A | https://youtu.be/aaaaaaaaaaa',
      },
      {
        postId: '4',
        author: 'dave',
        text: '+ Game A | Song A | https://youtu.be/aaaaaaaaaaa',
      },
      // 7 points, locks at post 4, well before the cutoff below.
    ];

    const entry = buildReconcileEntries(
      foldThread(posts, { lockCutoffPostId: '100' }),
    )[0];
    expect(entry.locked_order).toBe(0);
  });
});

describe('supportPoints', () => {
  it('sums every vote in a record', () => {
    const record = {
      votes: new Map([
        ['alice', 1],
        ['bob', 2],
        ['carol', -1],
      ]),
    };

    expect(supportPoints(record)).toBe(2);
  });
});
