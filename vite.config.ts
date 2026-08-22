import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'node:path';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // A hand-written worker, because a generated one cannot carry the
      // `periodicsync` listener the reminders need. See src/sw.ts.
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      // Not 'autoUpdate', which is the one that sounds right: it makes the
      // generated registration reload the window the moment a new worker
      // activates, which is a page pulled out from under whoever is mid-answer.
      // 'prompt' only means the registration adds no reload of its own — the
      // app has no update prompt at all. `src/sw.ts` skips waiting during
      // install, so a new build is live for the next load either way.
      registerType: 'prompt',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Doomsday Trainer',
        short_name: 'Doomsday',
        description:
          'Memorise the 100 year codes of the Doomsday method. Seven buttons, spaced repetition, latency-graded.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#FAF8F3',
        theme_color: '#1F4636',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icon-512-maskable.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      // `strategies: 'injectManifest'` reads this instead of `workbox`. The
      // woff2 files are self-hosted, so they have to be in the precache or a
      // cold offline load falls back to a system font.
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
      },
      devOptions: { enabled: false },
    }),
  ],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  server: {
    // Fixed high port, well clear of the usual 3000/5173/8080 collisions.
    port: 47318,
    strictPort: true,
    host: '127.0.0.1',
  },
  preview: {
    port: 47319,
    strictPort: true,
    host: '127.0.0.1',
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
  },
});
