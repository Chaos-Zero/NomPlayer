import { describe, expect, it } from 'vitest';
import {
  buildReconcileEntries,
  extractVideoId,
  foldThread,
  normalizeKey,
  parseCommandLine,
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
});
