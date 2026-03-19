import { fetchGameFaqsThreadsFromRss } from '../../src/lib/dashboard.js';

export async function onRequestGet(context) {
  const requestUrl = new URL(context.request.url);
  const parsedLimit = Number.parseInt(
    requestUrl.searchParams.get('limit') || '8',
    10,
  );
  const limit = Number.isFinite(parsedLimit) ? parsedLimit : 8;

  const rssUrl = context.env.VITE_GAMEFAQS_RSS_URL;

  try {
    const threads = await fetchGameFaqsThreadsFromRss(rssUrl, limit);

    return Response.json(
      {
        threads,
        fetchedAt: new Date().toISOString(),
      },
      {
        headers: {
          'cache-control': 'public, max-age=0, s-maxage=14400',
        },
      },
    );
  } catch (error) {
    return Response.json(
      {
        threads: [],
        error: error.message || 'Failed to load VGMC updates.',
      },
      {
        status: 502,
        headers: {
          'cache-control': 'no-store',
        },
      },
    );
  }
}
