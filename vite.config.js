import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
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
