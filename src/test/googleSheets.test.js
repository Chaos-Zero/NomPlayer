import { describe, expect, it } from 'vitest';
import {
  buildSheetUpdates,
  columnLetterToIndex,
  filterStaleUpdates,
  findHeaderRow,
  findLinkColumnIndex,
  indexToColumnLetter,
  parseGoogleSheetUrl,
} from '../lib/googleSheets.js';

describe('parseGoogleSheetUrl', () => {
  it('extracts the spreadsheet id and gid from a full edit URL', () => {
    expect(
      parseGoogleSheetUrl(
        'https://docs.google.com/spreadsheets/d/1vRu2CbwGp4RFPTSkarhglnRPl6IzZ5jJu4yqkLr83po/edit?gid=0#gid=0',
      ),
    ).toEqual({
      spreadsheetId: '1vRu2CbwGp4RFPTSkarhglnRPl6IzZ5jJu4yqkLr83po',
      gid: 0,
    });
  });

  it('defaults gid to 0 when the URL has none', () => {
    expect(
      parseGoogleSheetUrl('https://docs.google.com/spreadsheets/d/abc123/edit'),
    ).toEqual({ spreadsheetId: 'abc123', gid: 0 });
  });

  it('returns null for a non-spreadsheet URL', () => {
    expect(parseGoogleSheetUrl('https://example.com/not-a-sheet')).toBeNull();
  });

  it('returns null for an empty/missing URL', () => {
    expect(parseGoogleSheetUrl('')).toBeNull();
    expect(parseGoogleSheetUrl(null)).toBeNull();
  });
});

describe('findHeaderRow', () => {
  it('finds the first row with any content', () => {
    const rows = [
      [],
      [{ value: 'Game' }, { value: 'Song' }, { value: 'Link' }],
      [{ value: 'Zelda' }, { value: 'Song of Storms' }, { value: '' }],
    ];
    expect(findHeaderRow(rows)).toEqual({
      headerIndex: 1,
      headers: ['Game', 'Song', 'Link'],
    });
  });

  it('returns null when every row is empty', () => {
    expect(findHeaderRow([[], [{ value: '' }]])).toBeNull();
  });

  it('skips a sparse banner/status row above the real, wide header row', () => {
    // This is the actual shape of the real reaction sheet, and the actual
    // bug it caused: row 1 is just a status note in one cell ("Main sheet
    // last update: N"), the real headers are in row 2. Treating row 1 as
    // the header row meant every downstream column lookup (including the
    // "ignore LINK IMP" exclusion, which checks the header row's text) was
    // reading the wrong row, and silently matched "LINK IMP." instead of
    // "Link (auto-fill from K2)".
    const rows = [
      [{ value: 'Main sheet last update: 247' }],
      [
        { value: 'Game' },
        { value: 'Song' },
        { value: 'LINK IMP.' },
        { value: 'Link (auto-fill from K2)' },
        { value: 'Cal' },
      ],
      [
        { value: 'Zelda' },
        { value: 'Song of Storms' },
        { value: 'https://www.youtube.com/watch?v=stale0000000' },
        { value: 'https://www.youtube.com/watch?v=abc12345678' },
        { value: '' },
      ],
    ];
    expect(findHeaderRow(rows)).toEqual({
      headerIndex: 1,
      headers: ['Game', 'Song', 'LINK IMP.', 'Link (auto-fill from K2)', 'Cal'],
    });
  });

  it('feeds into findLinkColumnIndex correctly end-to-end, past the banner row', () => {
    // The actual regression: with the banner row misread as the header,
    // findLinkColumnIndex's "imp" exclusion checked the banner row's text
    // (which never mentions "imp"), so it never excluded LINK IMP, and
    // matched it instead of the real link column.
    const rows = [
      [{ value: 'Main sheet last update: 247' }],
      [
        { value: 'Game' },
        { value: 'Song' },
        { value: 'LINK IMP.' },
        { value: 'Link (auto-fill from K2)' },
        { value: 'Cal' },
      ],
      [
        { value: 'Zelda' },
        { value: 'Song of Storms' },
        { value: 'https://www.youtube.com/watch?v=stale0000000' },
        { value: 'https://www.youtube.com/watch?v=abc12345678' },
        { value: '' },
      ],
    ];

    const header = findHeaderRow(rows);
    expect(findLinkColumnIndex(rows, header.headerIndex)).toBe(3); // Link (auto-fill from K2), not LINK IMP. at 2
  });
});

describe('columnLetterToIndex', () => {
  it('converts single letters', () => {
    expect(columnLetterToIndex('A')).toBe(0);
    expect(columnLetterToIndex('D')).toBe(3);
    expect(columnLetterToIndex('Z')).toBe(25);
  });

  it('converts double letters', () => {
    expect(columnLetterToIndex('AA')).toBe(26);
    expect(columnLetterToIndex('AB')).toBe(27);
    expect(columnLetterToIndex('AZ')).toBe(51);
    expect(columnLetterToIndex('BA')).toBe(52);
  });

  it('is case-insensitive and trims whitespace', () => {
    expect(columnLetterToIndex('d')).toBe(3);
    expect(columnLetterToIndex('  q  ')).toBe(16);
  });

  it('returns -1 for anything that is not purely letters', () => {
    expect(columnLetterToIndex('')).toBe(-1);
    expect(columnLetterToIndex('1')).toBe(-1);
    expect(columnLetterToIndex('A1')).toBe(-1);
    expect(columnLetterToIndex('not a letter')).toBe(-1); // spaces aren't letters
    expect(columnLetterToIndex(null)).toBe(-1);
  });

  it('still resolves a multi-letter name to *some* column, even if a nonsensical one', () => {
    // "Cal" is syntactically valid as pure letters, it just maps to a column
    // (2065) that's unlikely to exist in any real sheet, not an error case.
    // buildSheetUpdates is what actually catches this, see below, it's the
    // only place that knows the sheet's real width.
    expect(columnLetterToIndex('Cal')).toBeGreaterThan(0);
  });
});

describe('indexToColumnLetter', () => {
  it('is the reverse of columnLetterToIndex', () => {
    expect(indexToColumnLetter(0)).toBe('A');
    expect(indexToColumnLetter(3)).toBe('D');
    expect(indexToColumnLetter(25)).toBe('Z');
    expect(indexToColumnLetter(26)).toBe('AA');
    expect(indexToColumnLetter(51)).toBe('AZ');
    expect(indexToColumnLetter(52)).toBe('BA');
  });
});

function cell(value = '', note = '') {
  return { value, note };
}

describe('findLinkColumnIndex', () => {
  it('finds an exact "Link" header', () => {
    const rows = [[cell('Game'), cell('Song'), cell('Link'), cell('Cal')]];
    expect(findLinkColumnIndex(rows, 0)).toBe(2);
  });

  it('matches a header containing "link" as a substring, not just an exact match', () => {
    // The real reaction sheet's header is exactly this, not just "Link",
    // an exact-match search on the old hardcoded column ('K') was what broke
    // when the sheet's structure changed (K -> L) and needed a redeploy.
    const rows = [
      [cell('Game'), cell('Song'), cell('Link (auto-fill from K2)')],
    ];
    expect(findLinkColumnIndex(rows, 0)).toBe(2);
  });

  it('finds the header regardless of which column it moved to', () => {
    const rows = [
      [cell('T/F'), cell('Game'), cell('Song'), cell('Who?'), cell('Link')],
    ];
    expect(findLinkColumnIndex(rows, 0)).toBe(4);
  });

  it('falls back to sniffing cell content when no header mentions "link"', () => {
    const headerRow = [cell('Game'), cell('Song'), cell('URL'), cell('Cal')];
    const dataRows = Array.from({ length: 5 }, (_, i) => [
      cell(`Game ${i}`),
      cell(`Song ${i}`),
      cell(`https://www.youtube.com/watch?v=abc1234567${i}`),
      cell(''),
    ]);
    expect(findLinkColumnIndex([headerRow, ...dataRows], 0)).toBe(2);
  });

  it('requires a strong majority of sampled cells to be YouTube links, not just one', () => {
    const headerRow = [cell('Game'), cell('Notes')];
    // Only one of five sampled cells is actually a YouTube link,a stray
    // mention shouldn't be enough to call this "the link column".
    const dataRows = [
      [cell('Game A'), cell('great pick!')],
      [
        cell('Game B'),
        cell('reminds me of https://www.youtube.com/watch?v=abc12345678'),
      ],
      [cell('Game C'), cell('meh')],
      [cell('Game D'), cell('love it')],
      [cell('Game E'), cell('skip')],
    ];
    expect(findLinkColumnIndex([headerRow, ...dataRows], 0)).toBe(-1);
  });

  it('returns -1 when nothing matches by header or content', () => {
    const rows = [
      [cell('Game'), cell('Song')],
      [cell('Zelda'), cell('Song of Storms')],
    ];
    expect(findLinkColumnIndex(rows, 0)).toBe(-1);
  });

  it('skips a "LINK IMP" header and keeps looking for the real one', () => {
    const rows = [
      [
        cell('Game'),
        cell('Song'),
        cell('LINK IMP'),
        cell('Link (auto-fill from K2)'),
      ],
    ];
    expect(findLinkColumnIndex(rows, 0)).toBe(3);
  });

  it('never falls back to a "LINK IMP" column via content-sniffing either', () => {
    const headerRow = [cell('Game'), cell('Song'), cell('LINK IMP')];
    const dataRows = Array.from({ length: 5 }, (_, i) => [
      cell(`Game ${i}`),
      cell(`Song ${i}`),
      cell(`https://www.youtube.com/watch?v=abc1234567${i}`),
    ]);
    // No other column has anything link-like in it,without the exclusion
    // this would otherwise be the only plausible match.
    expect(findLinkColumnIndex([headerRow, ...dataRows], 0)).toBe(-1);
  });

  it('is case-insensitive about the "imp" exclusion too', () => {
    const rows = [[cell('Game'), cell('Song'), cell('link imp'), cell('Link')]];
    expect(findLinkColumnIndex(rows, 0)).toBe(3);
  });
});

describe('buildSheetUpdates', () => {
  // Game=A, Song=B, Link=C (found via header text), Cal's actual column=D.
  const headerRow = [cell('Game'), cell('Song'), cell('Link'), cell('Cal')];

  it('queues an update for a row whose link matches a rated video, empty target cell', () => {
    const rows = [
      headerRow,
      [
        cell('Zelda'),
        cell('Song of Storms'),
        cell('https://www.youtube.com/watch?v=abc12345678'),
        cell(''),
      ],
    ];

    const { updates, skippedFilled, noRatingFound } = buildSheetUpdates({
      rows,
      headerRowIndex: 0,
      userColumnLetter: 'D',
      feedbackByVideoId: {
        abc12345678: { rating: 8, note: 'great pick' },
      },
    });

    expect(updates).toEqual([
      {
        rowIndex: 1,
        columnIndex: 3,
        rating: 8,
        note: 'great pick',
        videoId: 'abc12345678',
      },
    ]);
    expect(skippedFilled).toBe(0);
    expect(noRatingFound).toBe(0);
  });

  it('locates the link column automatically wherever it actually is', () => {
    const wideHeaderRow = Array.from({ length: 12 }, (_, i) =>
      i === 11 ? cell('Link (auto-fill from K2)') : cell(`col${i}`),
    );
    wideHeaderRow[3] = cell('Cal');
    const dataRow = Array.from({ length: 12 }, () => cell(''));
    dataRow[11] = cell('https://www.youtube.com/watch?v=abc12345678');

    const { updates } = buildSheetUpdates({
      rows: [wideHeaderRow, dataRow],
      headerRowIndex: 0,
      userColumnLetter: 'D',
      feedbackByVideoId: { abc12345678: { rating: 8, note: '' } },
    });

    expect(updates).toEqual([
      {
        rowIndex: 1,
        columnIndex: 3,
        rating: 8,
        note: '',
        videoId: 'abc12345678',
      },
    ]);
  });

  it('skips a row with no rating for that video', () => {
    const rows = [
      headerRow,
      [
        cell('Zelda'),
        cell('Song of Storms'),
        cell('https://www.youtube.com/watch?v=abc12345678'),
        cell(''),
      ],
    ];

    const { updates, noRatingFound } = buildSheetUpdates({
      rows,
      headerRowIndex: 0,
      userColumnLetter: 'D',
      feedbackByVideoId: {},
    });

    expect(updates).toEqual([]);
    expect(noRatingFound).toBe(1);
  });

  it('skips a row whose target cell already has a value, when overwrite is off', () => {
    const rows = [
      headerRow,
      [
        cell('Zelda'),
        cell('Song of Storms'),
        cell('https://www.youtube.com/watch?v=abc12345678'),
        cell('7'),
      ],
    ];

    const { updates, skippedFilled } = buildSheetUpdates({
      rows,
      headerRowIndex: 0,
      userColumnLetter: 'D',
      feedbackByVideoId: { abc12345678: { rating: 8, note: '' } },
      overwrite: false,
    });

    expect(updates).toEqual([]);
    expect(skippedFilled).toBe(1);
  });

  it('skips a row whose target cell already has just a note, when overwrite is off', () => {
    const rows = [
      headerRow,
      [
        cell('Zelda'),
        cell('Song of Storms'),
        cell('https://www.youtube.com/watch?v=abc12345678'),
        cell('', 'someone left a note here'),
      ],
    ];

    const { updates, skippedFilled } = buildSheetUpdates({
      rows,
      headerRowIndex: 0,
      userColumnLetter: 'D',
      feedbackByVideoId: { abc12345678: { rating: 8, note: '' } },
      overwrite: false,
    });

    expect(updates).toEqual([]);
    expect(skippedFilled).toBe(1);
  });

  it('overwrites an already-filled cell when overwrite is on', () => {
    const rows = [
      headerRow,
      [
        cell('Zelda'),
        cell('Song of Storms'),
        cell('https://www.youtube.com/watch?v=abc12345678'),
        cell('7'),
      ],
    ];

    const { updates } = buildSheetUpdates({
      rows,
      headerRowIndex: 0,
      userColumnLetter: 'D',
      feedbackByVideoId: { abc12345678: { rating: 9, note: 'updated' } },
      overwrite: true,
    });

    expect(updates).toEqual([
      {
        rowIndex: 1,
        columnIndex: 3,
        rating: 9,
        note: 'updated',
        videoId: 'abc12345678',
      },
    ]);
  });

  it('never adds rows, a rated video missing from the sheet is simply unmatched', () => {
    const rows = [headerRow];

    const { updates } = buildSheetUpdates({
      rows,
      headerRowIndex: 0,
      userColumnLetter: 'D',
      feedbackByVideoId: { abc12345678: { rating: 10, note: '' } },
    });

    expect(updates).toEqual([]);
  });

  it('skips rows with a blank or unparseable link', () => {
    const rows = [
      headerRow,
      [cell('Some Game'), cell('Some Song'), cell(''), cell('')],
      [cell('Other Game'), cell('Other Song'), cell('not a link'), cell('')],
    ];

    const { updates } = buildSheetUpdates({
      rows,
      headerRowIndex: 0,
      userColumnLetter: 'D',
      feedbackByVideoId: {},
    });

    expect(updates).toEqual([]);
  });

  it('skips a song whose link appears in more than one row, rather than writing to either', () => {
    const rows = [
      headerRow,
      [
        cell('Zelda'),
        cell('Song of Storms'),
        cell('https://www.youtube.com/watch?v=abc12345678'),
        cell(''),
      ],
      [
        cell('Zelda (archived nomination)'),
        cell('Song of Storms'),
        cell('https://www.youtube.com/watch?v=abc12345678'),
        cell(''),
      ],
    ];

    const { updates, skippedAmbiguous, ambiguousVideoIds } = buildSheetUpdates({
      rows,
      headerRowIndex: 0,
      userColumnLetter: 'D',
      feedbackByVideoId: { abc12345678: { rating: 8, note: '' } },
    });

    expect(updates).toEqual([]);
    expect(skippedAmbiguous).toBe(1);
    expect(ambiguousVideoIds).toEqual(['abc12345678']);
  });

  it('still fills in an unambiguous song even when a different song is duplicated', () => {
    const rows = [
      headerRow,
      [
        cell('Zelda'),
        cell('Song of Storms'),
        cell('https://www.youtube.com/watch?v=abc12345678'),
        cell(''),
      ],
      [
        cell('Zelda (archived nomination)'),
        cell('Song of Storms'),
        cell('https://www.youtube.com/watch?v=abc12345678'),
        cell(''),
      ],
      [
        cell('Chrono Trigger'),
        cell('Corridors of Time'),
        cell('https://www.youtube.com/watch?v=xyz98765432'),
        cell(''),
      ],
    ];

    const { updates, skippedAmbiguous } = buildSheetUpdates({
      rows,
      headerRowIndex: 0,
      userColumnLetter: 'D',
      feedbackByVideoId: {
        abc12345678: { rating: 8, note: '' },
        xyz98765432: { rating: 10, note: 'banger' },
      },
    });

    expect(updates).toEqual([
      {
        rowIndex: 3,
        columnIndex: 3,
        rating: 10,
        note: 'banger',
        videoId: 'xyz98765432',
      },
    ]);
    expect(skippedAmbiguous).toBe(1);
  });

  it('throws a clear error when no link column can be found at all', () => {
    const rows = [[cell('Game'), cell('Song')]];
    expect(() =>
      buildSheetUpdates({
        rows,
        headerRowIndex: 0,
        userColumnLetter: 'D',
        feedbackByVideoId: {},
      }),
    ).toThrow(/YouTube links/);
  });

  it("throws a clear error when the user's column letter is invalid", () => {
    const rows = [headerRow];
    expect(() =>
      buildSheetUpdates({
        rows,
        headerRowIndex: 0,
        userColumnLetter: 'not a letter',
        feedbackByVideoId: {},
      }),
    ).toThrow(/not a letter/);
  });

  it('throws, rather than silently writing miles off-sheet, when the "letter" is really a column name that happens to be typed', () => {
    // headerRow is only 4 columns wide (A-D), and its own D column is
    // literally named "Cal", exactly the real-world case this guards
    // against: typing your column's name instead of its letter.
    const rows = [headerRow];
    expect(() =>
      buildSheetUpdates({
        rows,
        headerRowIndex: 0,
        userColumnLetter: 'Cal',
        feedbackByVideoId: {},
      }),
    ).toThrow(/past the last column/);
  });

  it('hints at the correct letter when the mistaken input matches a real header', () => {
    const rows = [headerRow];
    expect(() =>
      buildSheetUpdates({
        rows,
        headerRowIndex: 0,
        userColumnLetter: 'Cal',
        feedbackByVideoId: {},
      }),
    ).toThrow(/"Cal" column\? That's D\./);
  });

  it('throws with no hint when the out-of-range input matches no header', () => {
    const rows = [headerRow];
    expect(() =>
      buildSheetUpdates({
        rows,
        headerRowIndex: 0,
        userColumnLetter: 'ZZZ',
        feedbackByVideoId: {},
      }),
    ).toThrow(/^"ZZZ" is past the last column in this sheet\.$/);
  });

  it("matches the user's column letter case-insensitively", () => {
    const rows = [
      headerRow,
      [
        cell('Zelda'),
        cell('Song of Storms'),
        cell('https://www.youtube.com/watch?v=abc12345678'),
        cell(''),
      ],
    ];

    const { updates } = buildSheetUpdates({
      rows,
      headerRowIndex: 0,
      userColumnLetter: 'd',
      feedbackByVideoId: { abc12345678: { rating: 6, note: '' } },
    });

    expect(updates).toHaveLength(1);
  });
});

describe('filterStaleUpdates', () => {
  const headerRowFixture = [
    cell('Game'),
    cell('Song'),
    cell('Link'),
    cell('Cal'),
  ];

  it('keeps an update whose row still holds the same video', () => {
    const updates = [
      {
        rowIndex: 1,
        columnIndex: 3,
        rating: 8,
        note: '',
        videoId: 'abc12345678',
      },
    ];
    const freshRows = [
      headerRowFixture,
      [
        cell('Zelda'),
        cell('Song of Storms'),
        cell('https://www.youtube.com/watch?v=abc12345678'),
        cell(''),
      ],
    ];

    const { updates: filtered, skippedStale } = filterStaleUpdates({
      updates,
      freshRows,
      linkColIndex: 2,
    });

    expect(filtered).toEqual(updates);
    expect(skippedStale).toBe(0);
  });

  it('drops an update whose row now resolves to a different video', () => {
    // Mirrors what was actually observed on the real reaction sheet: a
    // rating queued for one video landed on a row that, by write time, had
    // rotated to hold a different song entirely, auto-recalculating "Link
    // (auto-fill from K2)"-style columns can do this between a read and a
    // later write.
    const updates = [
      {
        rowIndex: 1,
        columnIndex: 3,
        rating: 8,
        note: '',
        videoId: 'abc12345678',
      },
    ];
    const freshRows = [
      headerRowFixture,
      [
        cell('Some Other Game'),
        cell('Some Other Song'),
        cell('https://www.youtube.com/watch?v=zzz99999999'),
        cell(''),
      ],
    ];

    const { updates: filtered, skippedStale } = filterStaleUpdates({
      updates,
      freshRows,
      linkColIndex: 2,
    });

    expect(filtered).toEqual([]);
    expect(skippedStale).toBe(1);
  });

  it('drops an update whose row link is now blank or unparseable', () => {
    const updates = [
      {
        rowIndex: 1,
        columnIndex: 3,
        rating: 8,
        note: '',
        videoId: 'abc12345678',
      },
    ];
    const freshRows = [
      headerRowFixture,
      [cell('Some Game'), cell('Some Song'), cell(''), cell('')],
    ];

    const { updates: filtered, skippedStale } = filterStaleUpdates({
      updates,
      freshRows,
      linkColIndex: 2,
    });

    expect(filtered).toEqual([]);
    expect(skippedStale).toBe(1);
  });

  it('only drops the rows that actually changed, keeping the rest', () => {
    const updates = [
      {
        rowIndex: 1,
        columnIndex: 3,
        rating: 8,
        note: '',
        videoId: 'abc12345678',
      },
      {
        rowIndex: 2,
        columnIndex: 3,
        rating: 10,
        note: 'banger',
        videoId: 'xyz98765432',
      },
    ];
    const freshRows = [
      headerRowFixture,
      [
        cell('Some Other Game'),
        cell('Some Other Song'),
        cell('https://www.youtube.com/watch?v=zzz99999999'),
        cell(''),
      ],
      [
        cell('Chrono Trigger'),
        cell('Corridors of Time'),
        cell('https://www.youtube.com/watch?v=xyz98765432'),
        cell(''),
      ],
    ];

    const { updates: filtered, skippedStale } = filterStaleUpdates({
      updates,
      freshRows,
      linkColIndex: 2,
    });

    expect(filtered).toEqual([updates[1]]);
    expect(skippedStale).toBe(1);
  });
});
