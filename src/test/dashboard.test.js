import { describe, expect, it } from 'vitest';
import {
  buildDiscoveryCandidates,
  fetchGameFaqsThreadsFromRss,
  normalizeNominationDashboardUpdate,
  pickNextDiscoveryCandidate,
} from '../lib/dashboard.js';
import { vi } from 'vitest';

describe('dashboard helpers', () => {
  it('normalizes public nomination updates', () => {
    const normalized = normalizeNominationDashboardUpdate({
      user_id: 'user-1',
      username: 'Calzone',
      gamefaqs_username: 'CalzoneB',
      avatar_url: 'https://example.com/avatar.png',
      updated_at: '2026-03-17T00:00:00Z',
      nominations: [
        {
          videoId: 'alpha1234567',
          title: 'Alpha',
          thumbnail: 'alpha.jpg',
          channelTitle: 'Channel',
        },
      ],
    });

    expect(normalized).toEqual({
      userId: 'user-1',
      username: 'Calzone',
      gamefaqsUsername: 'CalzoneB',
      avatarUrl: 'https://example.com/avatar.png',
      updatedAt: '2026-03-17T00:00:00Z',
      nominations: [
        {
          videoId: 'alpha1234567',
          title: 'Alpha',
          thumbnail: 'alpha.jpg',
          channelTitle: 'Channel',
        },
      ],
    });
  });

  it('builds discovery candidates from nomination updates', () => {
    const candidates = buildDiscoveryCandidates(
      [
        {
          userId: 'user-1',
          username: 'Alice',
          avatarUrl: null,
          updatedAt: '2026-03-17T10:00:00Z',
          nominations: [
            {
              videoId: 'alpha1234567',
              title: 'Alpha',
              thumbnail: 'alpha.jpg',
              channelTitle: '',
            },
            {
              videoId: 'beta12345678',
              title: 'Beta',
              thumbnail: 'beta.jpg',
              channelTitle: '',
            },
          ],
        },
        {
          userId: 'user-2',
          username: 'Bob',
          avatarUrl: null,
          updatedAt: '2026-03-17T11:00:00Z',
          nominations: [
            {
              videoId: 'alpha1234567',
              title: 'Alpha',
              thumbnail: 'alpha.jpg',
              channelTitle: '',
            },
          ],
        },
      ],
      {
        currentPlaylistIds: new Set(['beta12345678']),
        listenedStatusById: {},
      },
    );

    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      videoId: 'alpha1234567',
      title: 'Alpha',
      nominationCount: 2,
    });
    expect(
      candidates[0].nominators.map((nominator) => nominator.username),
    ).toEqual(['Alice', 'Bob']);
  });

  it('rotates to the next discovery candidate', () => {
    const candidates = [
      { videoId: 'alpha1234567', title: 'Alpha' },
      { videoId: 'beta12345678', title: 'Beta' },
    ];

    expect(pickNextDiscoveryCandidate(candidates, null)).toEqual(candidates[0]);
    expect(pickNextDiscoveryCandidate(candidates, 'alpha1234567')).toEqual(
      candidates[1],
    );
    expect(pickNextDiscoveryCandidate(candidates, 'beta12345678')).toBeNull();
  });

  it('extracts only VGMC threads from the GameFAQs RSS feed xml', async () => {
    const mockXml = `
      <rss>
        <channel>
          <item>
            <title>VGMC Summer Thread</title>
            <link>https://gamefaqs.gamespot.com/boards/8-gamefaqs-contests/111-vgmc-summer-thread</link>
          </item>
          <item>
            <title>Other Thread</title>
            <link>https://gamefaqs.gamespot.com/boards/8-gamefaqs-contests/222-other-thread</link>
          </item>
          <item>
            <title><![CDATA[VGMC & Finals]]></title>
            <link><![CDATA[https://gamefaqs.gamespot.com/boards/8-gamefaqs-contests/333-vgmc-finals]]></link>
          </item>
        </channel>
      </rss>
    `;

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(mockXml),
    });

    const threads = await fetchGameFaqsThreadsFromRss('http://test.rss');

    expect(threads).toEqual([
      {
        title: 'VGMC Summer Thread',
        url: 'https://gamefaqs.gamespot.com/boards/8-gamefaqs-contests/111-vgmc-summer-thread',
      },
      {
        title: 'VGMC & Finals',
        url: 'https://gamefaqs.gamespot.com/boards/8-gamefaqs-contests/333-vgmc-finals',
      },
    ]);
  });
});
