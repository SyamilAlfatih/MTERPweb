import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

function readGit(cmd: string): string {
  try {
    return execSync(`git ${cmd}`, {
      cwd: path.resolve(__dirname, '..'),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 2000,
    }).trim()
  } catch {
    return ''
  }
}

function getBuildMetadata() {
  let pkgVersion = '1.0.0'
  try {
    const pkgRaw = fs.readFileSync(path.resolve(__dirname, '../mterp-backend/package.json'), 'utf8')
    pkgVersion = JSON.parse(pkgRaw).version || pkgVersion
  } catch {
    // fallback
  }

  return {
    version: process.env.VITE_APP_VERSION || pkgVersion,
    commitHash: readGit('rev-parse --short HEAD') || process.env.VITE_APP_COMMIT || 'unknown',
    fullCommitHash: readGit('rev-parse HEAD') || process.env.VITE_APP_COMMIT_FULL || 'unknown',
    branch: readGit('rev-parse --abbrev-ref HEAD') || process.env.VITE_APP_BRANCH || 'main',
    commitDate: readGit('log -1 --format=%cI') || new Date().toISOString(),
    commitMessage: readGit('log -1 --format=%s') || 'Build',
    buildTime: new Date().toISOString(),
  }
}

const buildMetadata = getBuildMetadata()

function emitVersionJsonPlugin(): Plugin {
  const payload = JSON.stringify(buildMetadata, null, 2)
  return {
    name: 'mterp-emit-version-json',
    configureServer(server) {
      server.middlewares.use('/version.json', (_req, res) => {
        res.setHeader('Content-Type', 'application/json')
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate')
        res.end(payload)
      })
    },
    configurePreviewServer(server) {
      server.middlewares.use('/version.json', (_req, res) => {
        res.setHeader('Content-Type', 'application/json')
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate')
        res.end(payload)
      })
    },
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'version.json',
        source: payload,
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(buildMetadata.version),
    __APP_COMMIT__: JSON.stringify(buildMetadata.commitHash),
    __APP_COMMIT_FULL__: JSON.stringify(buildMetadata.fullCommitHash),
    __APP_COMMIT_DATE__: JSON.stringify(buildMetadata.commitDate),
    __APP_COMMIT_MESSAGE__: JSON.stringify(buildMetadata.commitMessage),
    __APP_BRANCH__: JSON.stringify(buildMetadata.branch),
    __APP_BUILD_TIME__: JSON.stringify(buildMetadata.buildTime),
  },
  plugins: [
    react(),
    tailwindcss(),
    emitVersionJsonPlugin(),
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
        importScripts: ['/push-sw.js'],
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
        navigateFallbackDenylist: [/^\/api\//, /^\/version\.json$/],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024, // 3 MB
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        globIgnores: ['**/pdf.worker*.js', '**/vendor-pdf*.js', '**/version.json'],
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
