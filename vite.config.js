import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fetchGameFaqsVgmcThreads } from './src/lib/dashboard.js';

function gameFaqsUpdatesPlugin() {
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

          const requestUrl = new URL(
            req.url || '/api/gamefaqs-vgmc-updates',
            'http://localhost',
          );
          const parsedLimit = Number.parseInt(
            requestUrl.searchParams.get('limit') || '8',
            10,
          );
          const limit = Number.isFinite(parsedLimit) ? parsedLimit : 8;

          try {
            const threads = await fetchGameFaqsVgmcThreads(fetch, limit);

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
