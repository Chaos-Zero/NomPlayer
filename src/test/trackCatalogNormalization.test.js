import { describe, expect, it } from 'vitest';
import { normalizeTrackCatalogEntry } from '../lib/trackCatalog.js';

describe('track catalog normalization', () => {
  const baseEntry = {
    track_id: 'track-123',
    source_external_id: 'abcdefghijk',
    game_title: 'Test Game',
    track_title: 'Test Track',
    display_title: 'Test Game - Test Track',
  };

  it('correctly maps tournament fields from the database (snake_case to camelCase)', () => {
    const entryWithTournaments = {
      ...baseEntry,
      tournaments: [
        {
          sequence_number: 24,
          placement: '9',
          highest_round: '3',
          notes: 'Great track',
        },
      ],
    };

    const normalized = normalizeTrackCatalogEntry(entryWithTournaments);

    expect(normalized.tournaments[0]).toEqual(
      expect.objectContaining({
        sequenceNumber: 24,
        placement: '9',
        highestRound: '3',
        notes: 'Great track',
      }),
    );
  });

  it('demonstrates the regression: missing highest_round in database response results in null highestRound', () => {
    // This simulates the data returned by the BROKEN track_catalog view
    const brokenEntry = {
      ...baseEntry,
      tournaments: [
        {
          sequence_number: 24,
          placement: '9',
          // highest_round is MISSING here in the current broken state
          notes: 'Regression test',
        },
      ],
    };

    const normalized = normalizeTrackCatalogEntry(brokenEntry);

    expect(normalized.tournaments[0].highestRound).toBeNull();
  });

  it('handles numeric placements by converting them to strings', () => {
    const entry = {
      ...baseEntry,
      tournaments: [
        {
          sequence_number: 1,
          placement: 1, // numeric in DB
        },
      ],
    };

    const normalized = normalizeTrackCatalogEntry(entry);
    expect(normalized.tournaments[0].placement).toBe('1');
  });

  it('handles multiple tournament appearances', () => {
    const entry = {
      ...baseEntry,
      tournaments: [
        { sequence_number: 10, placement: '1' },
        { sequence_number: 20, highest_round: '5' },
      ],
    };

    const normalized = normalizeTrackCatalogEntry(entry);
    expect(normalized.tournaments).toHaveLength(2);
    expect(normalized.tournaments[0].placement).toBe('1');
    expect(normalized.tournaments[1].highestRound).toBe('5');
  });
});
