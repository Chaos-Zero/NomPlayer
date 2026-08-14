import { describe, expect, it } from 'vitest';
import {
  buildSheetUpdates,
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

function cell(value = '', note = '') {
  return { value, note };
}

describe('buildSheetUpdates', () => {
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
      linkColumnHeader: 'Link',
      userColumn: 'Cal',
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
      userColumn: 'Cal',
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
      userColumn: 'Cal',
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
      userColumn: 'Cal',
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
      userColumn: 'Cal',
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
      userColumn: 'Cal',
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
      userColumn: 'Cal',
      feedbackByVideoId: {},
    });

    expect(updates).toEqual([]);
  });

  it('throws a clear error when the Link column is missing', () => {
    const rows = [[cell('Game'), cell('Song')]];
    expect(() =>
      buildSheetUpdates({
        rows,
        headerRowIndex: 0,
        userColumn: 'Cal',
        feedbackByVideoId: {},
      }),
    ).toThrow(/Link/);
  });

  it("throws a clear error when the user's column is missing", () => {
    const rows = [headerRow];
    expect(() =>
      buildSheetUpdates({
        rows,
        headerRowIndex: 0,
        userColumn: 'NotAColumn',
        feedbackByVideoId: {},
      }),
    ).toThrow(/NotAColumn/);
  });

  it('matches column names case-insensitively', () => {
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
      userColumn: 'cal',
      feedbackByVideoId: { abc12345678: { rating: 6, note: '' } },
    });

    expect(updates).toHaveLength(1);
  });
});
