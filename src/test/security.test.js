// Tests covering the three security fixes from migrations 20260510120000–20260510120002.
//
// 20260510120000: identities view, security_invoker = true
//   Pure DB permission change; no JS code accesses public.identities, so no JS test applies.
//
// 20260510120001: profiles anon column restriction
//   anon lost table-level SELECT and now only gets (id, username, avatar_url, gamefaqs_username).
//   Tests below assert that every community-facing query never requests `email`.
//
// 20260510120002: get_user_activity_summary ownership guard
//   The function raises "Unauthorized" when auth.uid() !== req_user_id.
//   Tests below assert that fetchDetailedUserActivity handles that error gracefully and
//   always passes the correct user identity to the RPC.

import { describe, expect, it, vi } from 'vitest';
import {
  fetchDetailedUserActivity,
  fetchCommunityFeedback,
  fetchRecentComments,
  fetchAllCommunityFeedback,
} from '../lib/feedback.js';

// Builds a chainable Supabase query mock that resolves to { data, error } when awaited.
// Every builder method returns the chain itself; `then` makes it a thenable.
function makeChain({ data = null, error = null } = {}) {
  const chain = {};
  const returnSelf = () => chain;

  chain.select = vi.fn(returnSelf);
  chain.eq = vi.fn(returnSelf);
  chain.order = vi.fn(returnSelf);
  chain.not = vi.fn(returnSelf);
  chain.limit = vi.fn(returnSelf);
  chain.in = vi.fn(returnSelf);
  chain.then = (resolve, reject) =>
    Promise.resolve({ data, error }).then(resolve, reject);
  chain.catch = (fn) => Promise.resolve({ data, error }).catch(fn);

  return chain;
}

// ─── get_user_activity_summary ownership guard ───────────────────────────────

describe('fetchDetailedUserActivity, ownership guard', () => {
  it('returns empty collections immediately when supabase or userId is missing', async () => {
    expect(await fetchDetailedUserActivity(null, 'user-1')).toEqual({
      personal: [],
      peer: [],
      highlights: [],
    });
    expect(await fetchDetailedUserActivity({ rpc: vi.fn() }, null)).toEqual({
      personal: [],
      peer: [],
      highlights: [],
    });
  });

  it('calls get_user_activity_summary with the correct user identity', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { personal: [], peer: [], highlights: [] },
      error: null,
    });

    await fetchDetailedUserActivity({ rpc }, 'user-abc', [
      'track-1',
      'track-2',
    ]);

    expect(rpc).toHaveBeenCalledWith('get_user_activity_summary', {
      req_user_id: 'user-abc',
      nominated_track_ids: ['track-1', 'track-2'],
    });
  });

  it('passes an empty nominated_track_ids array when none are provided', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { personal: [], peer: [], highlights: [] },
      error: null,
    });

    await fetchDetailedUserActivity({ rpc }, 'user-abc');

    expect(rpc).toHaveBeenCalledWith('get_user_activity_summary', {
      req_user_id: 'user-abc',
      nominated_track_ids: [],
    });
  });

  it('returns empty collections when the DB raises Unauthorized (cross-user attempt)', async () => {
    // Simulates the DB guard: auth.uid() IS DISTINCT FROM req_user_id → RAISE EXCEPTION 'Unauthorized'
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { message: 'Unauthorized', code: 'P0001' },
    });

    const result = await fetchDetailedUserActivity({ rpc }, 'user-abc');

    expect(result).toEqual({ personal: [], peer: [], highlights: [] });
  });

  it('maps returned data into personal, peer, and highlights arrays', async () => {
    const mockData = {
      personal: [
        { rating: 9, note: 'Favourite', updated_at: '2026-01-01T00:00:00Z' },
      ],
      peer: [
        {
          rating: 7,
          note: 'Good',
          updated_at: '2026-01-02T00:00:00Z',
          user_id: 'peer-1',
        },
      ],
      highlights: [
        {
          rating: 8,
          note: 'Top pick',
          updated_at: '2026-01-03T00:00:00Z',
          user_id: 'other-1',
        },
      ],
    };
    const rpc = vi.fn().mockResolvedValue({ data: mockData, error: null });

    const result = await fetchDetailedUserActivity({ rpc }, 'user-abc');

    expect(result.personal).toHaveLength(1);
    expect(result.peer).toHaveLength(1);
    expect(result.highlights).toHaveLength(1);
    expect(result.personal[0].rating).toBe(9);
    expect(result.highlights[0].note).toBe('Top pick');
  });
});

// ─── profiles anon column restriction ────────────────────────────────────────

describe('community feedback queries, no email column exposed to anon', () => {
  it('fetchCommunityFeedback only selects non-sensitive profile columns', async () => {
    const chain = makeChain({ data: [], error: null });
    const supabase = { from: vi.fn().mockReturnValue(chain) };

    await fetchCommunityFeedback(supabase, 'track-123');

    const selectArg = chain.select.mock.calls[0][0];
    expect(selectArg).not.toMatch(/\bemail\b/);
    expect(selectArg).toContain('username');
    expect(selectArg).toContain('avatar_url');
  });

  it('fetchRecentComments only selects non-sensitive profile columns', async () => {
    const chain = makeChain({ data: [], error: null });
    const supabase = { from: vi.fn().mockReturnValue(chain) };

    await fetchRecentComments(supabase);

    const selectArg = chain.select.mock.calls[0][0];
    expect(selectArg).not.toMatch(/\bemail\b/);
    expect(selectArg).toContain('username');
    expect(selectArg).toContain('avatar_url');
  });

  it('fetchAllCommunityFeedback only selects non-sensitive profile columns', async () => {
    // Returns empty data so the second from() call (track_catalog) is skipped.
    const chain = makeChain({ data: [], error: null });
    const supabase = { from: vi.fn().mockReturnValue(chain) };

    await fetchAllCommunityFeedback(supabase);

    const selectArg = chain.select.mock.calls[0][0];
    expect(selectArg).not.toMatch(/\bemail\b/);
    expect(selectArg).toContain('username');
    expect(selectArg).toContain('avatar_url');
  });
});
