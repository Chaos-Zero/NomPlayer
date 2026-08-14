import { describe, expect, it } from 'vitest';
import {
  buildSheetUpdates,
  columnLetterToIndex,
  findHeaderRow,
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
    expect(columnLetterToIndex('Cal')).toBeGreaterThan(0);
  });
});

function cell(value = '', note = '') {
  return { value, note };
}

describe('buildSheetUpdates', () => {
  // Game=A, Song=B, Link=C, Cal's actual column=D, the reaction sheet's real
  // link column is K by default (see linkColumnLetter's default below), but
  // these fixtures use C for brevity and pass it explicitly except where a
  // test is specifically checking that default.
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
      linkColumnLetter: 'C',
      userColumnLetter: 'D',
      feedbackByVideoId: {
        abc12345678: { rating: 8, note: 'great pick' },
      },
    });

    expect(updates).toEqual([
      { rowIndex: 1, columnIndex: 3, rating: 8, note: 'great pick' },
    ]);
    expect(skippedFilled).toBe(0);
    expect(noRatingFound).toBe(0);
  });

  it('defaults the link column to K when not specified', () => {
    const wideHeaderRow = Array.from({ length: 11 }, (_, i) =>
      i === 10 ? cell('Link (auto-fill from K2)') : cell(`col${i}`),
    );
    wideHeaderRow[3] = cell('Cal');
    const dataRow = Array.from({ length: 11 }, () => cell(''));
    dataRow[10] = cell('https://www.youtube.com/watch?v=abc12345678');

    const { updates } = buildSheetUpdates({
      rows: [wideHeaderRow, dataRow],
      headerRowIndex: 0,
      userColumnLetter: 'D',
      feedbackByVideoId: { abc12345678: { rating: 8, note: '' } },
    });

    expect(updates).toEqual([
      { rowIndex: 1, columnIndex: 3, rating: 8, note: '' },
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
      linkColumnLetter: 'C',
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
      linkColumnLetter: 'C',
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
      linkColumnLetter: 'C',
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
      linkColumnLetter: 'C',
      userColumnLetter: 'D',
      feedbackByVideoId: { abc12345678: { rating: 9, note: 'updated' } },
      overwrite: true,
    });

    expect(updates).toEqual([
      { rowIndex: 1, columnIndex: 3, rating: 9, note: 'updated' },
    ]);
  });

  it('never adds rows, a rated video missing from the sheet is simply unmatched', () => {
    const rows = [headerRow];

    const { updates } = buildSheetUpdates({
      rows,
      headerRowIndex: 0,
      linkColumnLetter: 'C',
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
      linkColumnLetter: 'C',
      userColumnLetter: 'D',
      feedbackByVideoId: {},
    });

    expect(updates).toEqual([]);
  });

  it('throws a clear error when the link column letter is invalid', () => {
    const rows = [headerRow];
    expect(() =>
      buildSheetUpdates({
        rows,
        headerRowIndex: 0,
        linkColumnLetter: 'also not a letter',
        userColumnLetter: 'D',
        feedbackByVideoId: {},
      }),
    ).toThrow(/also not a letter/);
  });

  it("throws a clear error when the user's column letter is invalid", () => {
    const rows = [headerRow];
    expect(() =>
      buildSheetUpdates({
        rows,
        headerRowIndex: 0,
        linkColumnLetter: 'C',
        userColumnLetter: 'not a letter',
        feedbackByVideoId: {},
      }),
    ).toThrow(/not a letter/);
  });

  it('matches column letters case-insensitively', () => {
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
      linkColumnLetter: 'c',
      userColumnLetter: 'd',
      feedbackByVideoId: { abc12345678: { rating: 6, note: '' } },
    });

    expect(updates).toHaveLength(1);
  });
});
