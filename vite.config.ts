import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  server: {
    port: 5173,
    strictPort: true,
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      devOptions: {
        enabled: false,
      },
      includeAssets: ['favicon.svg', 'icon-192.svg', 'icon-512.svg'],
      manifest: {
        name: 'Diang-Anglais',
        short_name: 'Diang-Anglais',
        description: 'Apprentissage structuré de l’anglais pour francophones (CECRL A1 à B2)',
        theme_color: '#0F4C3A',
        background_color: '#FAF8F5',
        display: 'standalone',
        orientation: 'portrait',
        lang: 'fr',
        start_url: '/',
        icons: [
          {
            src: 'icon-192.svg',
            sizes: '192x192',
            type: 'image/svg+xml',
            purpose: 'any maskable',
          },
          {
            src: 'icon-512.svg',
            sizes: '512x512',
            type: 'image/svg+xml',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,woff2}'],
        globIgnores: ['**/audio/**/*.mp3'],
        runtimeCaching: [
          {
            urlPattern: /\/audio\/(aminata|fatou|khady|moussa|cheikh|ibrahima)\/[a-f0-9]{12}\.mp3$/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'diang-anglais-voice-audio-v1',
              expiration: {
                maxEntries: 3000,
                maxAgeSeconds: 60 * 60 * 24 * 90,
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          {
            urlPattern: /\/audio\/manifest\.json$/i,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'diang-anglais-audio-manifest-v1',
            },
          },
        ],
      },
    }),
  ],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('/src/data/') || id.includes('\\src\\data\\')) {
            return 'data-catalog';
          }
        },
      },
    },
  },
});
