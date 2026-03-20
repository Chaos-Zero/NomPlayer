import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fetchGameFaqsThreadsFromRss } from './src/lib/dashboard.js';
import { loadEnv } from 'vite';

function gameFaqsUpdatesPlugin() {
  let cachedThreads = null;
  let lastFetchTime = 0;
  const CACHE_DURATION = 14400000; // 4 hours in ms

  return {
    name: 'gamefaqs-updates-dev-endpoint',
    configureServer(server) {
      server.middlewares.use(
        '/api/gamefaqs-vgmc-updates',
        async (req, res, next) => {
          if (req.method !== 'GET') {
            next();
            return;
          }

          const requestUrl = new URL(req.url, 'http://localhost');
          const parsedLimit = Number.parseInt(
            requestUrl.searchParams.get('limit') || '8',
            10,
          );
          const limit = Number.isFinite(parsedLimit) ? parsedLimit : 8;

          const env = loadEnv(server.config.mode, server.config.root);
          const rssUrl = env.VITE_GAMEFAQS_RSS_URL;

          try {
            const now = Date.now();
            let threads;

            if (cachedThreads && now - lastFetchTime < CACHE_DURATION) {
              threads = cachedThreads;
            } else {
              threads = await fetchGameFaqsThreadsFromRss(rssUrl, limit);
              cachedThreads = threads;
              lastFetchTime = now;
            }

            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            res.end(
              JSON.stringify({
                threads,
                fetchedAt: new Date().toISOString(),
              }),
            );
          } catch (error) {
            res.statusCode = 502;
            res.setHeader('Content-Type', 'application/json');
            res.end(
              JSON.stringify({
                threads: [],
                error: error.message || 'Failed to load VGMC updates.',
              }),
            );
          }
        },
      );
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), gameFaqsUpdatesPlugin()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return;

          if (
            id.includes('@supabase/supabase-js') ||
            id.includes('@supabase/auth-js') ||
            id.includes('@supabase/postgrest-js') ||
            id.includes('@supabase/realtime-js') ||
            id.includes('@supabase/storage-js') ||
            id.includes('@supabase/functions-js')
          ) {
            return 'supabase';
          }

          if (id.includes('@dnd-kit/')) {
            return 'dnd-kit';
          }

          if (
            id.includes('react-youtube') ||
            id.includes('/youtube-player/') ||
            id.includes('/sister/')
          ) {
            return 'youtube';
          }

          if (id.includes('@dotlottie/') || id.includes('lottie-react')) {
            return 'lottie';
          }

          if (id.includes('/react/') || id.includes('/react-dom/')) {
            return 'react-vendor';
          }

          return 'vendor';
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.js',
  },
});
