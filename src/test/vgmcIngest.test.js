import { describe, expect, it } from 'vitest';
import {
  buildReconcileEntries,
  extractVideoId,
  foldThread,
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
});

describe('extractVideoId', () => {
  it('extracts an id from a standard watch URL', () => {
    expect(extractVideoId('https://www.youtube.com/watch?v=abc12345678')).toBe(
      'abc12345678',
    );
  });

  it('returns null for a non-YouTube link', () => {
    expect(extractVideoId('https://example.com/song.mp3')).toBeNull();
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
        game: 'Zelda',
        song: 'Song of Storms',
        support_points: 1,
      },
    ]);
  });

  it('lets the owning author remove their own nomination', () => {
    const records = foldThread([
      {
        postId: '1',
        author: 'alice',
        text: '+ Zelda | Song of Storms | https://youtu.be/abc12345678',
      },
      { postId: '2', author: 'alice', text: '- Zelda | Song of Storms | link' },
    ]);

    expect(buildReconcileEntries(records)).toEqual([]);
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

    expect(buildReconcileEntries(records)).toEqual([]);
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

  it("a supporter's ++ never steals removal rights from the original nominator", () => {
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

    expect(buildReconcileEntries(records)).toEqual([]);
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

    // alice is the owner, but this '-' is her second event on an already-'+'
    // record, the authority rule only fires on a lone '-' as the very act
    // that would flip present -> false; here it still does (owner, magnitude 1,
    // present), so this also tombstones the record. Scoring still accumulates
    // regardless: 1 + 1 - 1 = 1.
    const record = records.get('game a|song a');
    expect(record.present).toBe(false);
    expect(supportPoints(record)).toBe(1);
  });

  it('"--" never removes the nomination, only affects its score', () => {
    const records = foldThread([
      {
        postId: '1',
        author: 'alice',
        text: '++ Game A | Song A | https://youtu.be/aaaaaaaaaaa',
      },
      { postId: '2', author: 'alice', text: '-- Game A | Song A | link' },
    ]);

    // alice's own total accumulates (2 + -2 = 0, clamped no-op); still present,
    // just below the >1 threshold, '--' only ever affects score, never presence.
    const record = records.get('game a|song a');
    expect(record.present).toBe(true);
    expect(supportPoints(record)).toBe(0);
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
