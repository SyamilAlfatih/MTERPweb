import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['hard-hat.svg', 'apple-touch-icon-180x180.png'],
      manifest: {
        name: 'MTERP – Construction Project Management',
        short_name: 'MTERP',
        description: 'Manage construction projects, tools, materials, attendance, and reports.',
        theme_color: '#001c65',
        background_color: '#001c65',
        display: 'standalone',
        scope: '/',
        start_url: '/',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024, // 5 MB
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365, // 1 year
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'gstatic-fonts-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365, // 1 year
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
        ],
      },
    }),
  ],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          // ── Core framework ────────────────────────────────────────────────
          'vendor-react':  ['react', 'react-dom', 'react-router-dom'],
          // ── Visualisation ─────────────────────────────────────────────────
          'vendor-charts': ['chart.js', 'react-chartjs-2', 'recharts'],
          // ── PDF / export ──────────────────────────────────────────────────
          'vendor-pdf':    ['jspdf', 'jspdf-autotable', 'pdfjs-dist'],
          // ── UI utilities ──────────────────────────────────────────────────
          'vendor-ui':     ['lucide-react', 'react-photo-view', 'qrcode'],
          // ── Animation ─────────────────────────────────────────────────────
          'vendor-anim':   ['gsap'],
          // ── i18n ──────────────────────────────────────────────────────────
          'vendor-i18n':   ['i18next', 'react-i18next', 'i18next-browser-languagedetector', 'i18next-http-backend'],
        },
        // Give every dynamic-import page its own named chunk file
        chunkFileNames: 'assets/[name]-[hash].js',
        entryFileNames: 'assets/[name]-[hash].js',
        assetFileNames: (assetInfo) => {
          if (assetInfo.name && assetInfo.name.endsWith('.mjs')) {
            return 'assets/[name]-[hash].js';
          }
          return 'assets/[name]-[hash][extname]';
        },
      },
    },
    // pdf.worker is legitimately large — suppress its warning
    chunkSizeWarningLimit: 2000,
  },
})
