import { describe, expect, it, vi } from 'vitest';
import { fetchUserPublicLists } from '../lib/sharedUserLists.js';

function makeSupabase({ data = null, error = null } = {}) {
  return {
    rpc: vi.fn().mockResolvedValue({ data, error }),
  };
}

describe('fetchUserPublicLists', () => {
  it('returns username + both lists for a real user', async () => {
    const supabase = makeSupabase({
      data: {
        username: 'calzoneb',
        nominationList: [{ videoId: 'aaaaaaaaaaa' }],
        supportList: [{ videoId: 'bbbbbbbbbbb' }],
      },
    });

    const result = await fetchUserPublicLists(supabase, 'user-1');

    expect(supabase.rpc).toHaveBeenCalledWith('get_user_public_lists', {
      target_user_id: 'user-1',
    });
    expect(result).toEqual({
      username: 'calzoneb',
      nominationList: [{ videoId: 'aaaaaaaaaaa' }],
      supportList: [{ videoId: 'bbbbbbbbbbb' }],
    });
  });

  it('returns null when the target user id matches no profile', async () => {
    const supabase = makeSupabase({
      data: { username: null, nominationList: [], supportList: [] },
    });
    expect(await fetchUserPublicLists(supabase, 'nobody')).toBeNull();
  });

  it('defaults missing/malformed list fields to empty arrays', async () => {
    const supabase = makeSupabase({
      data: { username: 'calzoneb', nominationList: null },
    });
    const result = await fetchUserPublicLists(supabase, 'user-1');
    expect(result.nominationList).toEqual([]);
    expect(result.supportList).toEqual([]);
  });

  it('throws on a genuine RPC error', async () => {
    const supabase = makeSupabase({ error: new Error('boom') });
    await expect(fetchUserPublicLists(supabase, 'user-1')).rejects.toThrow(
      'boom',
    );
  });
});
