import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import { visualizer } from 'rollup-plugin-visualizer';

export default defineConfig(({ mode }) => ({
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
        description: 'Apprentissage structuré de l’anglais pour francophones (CECRL A0 à B2)',
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
        globIgnores: ['**/audio/**'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/[a-z0-9-]+\.supabase\.co\/.*/i,
            handler: 'NetworkOnly',
          },
          {
            urlPattern: /\/audio\/(ragui|fatou-sarre|omare|boubacar)\/[a-z0-9-]+\.bin$/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'diang-anglais-audio-packs-v2',
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 60 * 24 * 90,
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          {
            urlPattern: /\/audio\/(ragui|fatou-sarre|omare|boubacar)\/manifest\.json$/i,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'diang-anglais-audio-manifest-v2',
            },
          },
        ],
      },
    }),
    ...(mode === 'analyze'
      ? [
          visualizer({
            filename: 'dist-stats.html',
            gzipSize: true,
            brotliSize: true,
            open: false,
          }),
        ]
      : []),
  ],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (
            id.includes('node_modules/@supabase/') ||
            id.includes('node_modules\\@supabase\\')
          ) {
            return 'supabase';
          }
          if (
            id.includes('node_modules/react/') ||
            id.includes('node_modules/react-dom/') ||
            id.includes('node_modules\\react\\') ||
            id.includes('node_modules\\react-dom\\')
          ) {
            return 'vendor';
          }
        },
      },
    },
  },
}));
