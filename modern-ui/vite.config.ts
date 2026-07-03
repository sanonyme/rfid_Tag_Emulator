import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron/simple'
import path from 'path'
import { fileURLToPath } from 'url'
import dotenv from 'dotenv'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

/** Optional `.env` for build-time or future main-process values. */
dotenv.config({ path: path.join(__dirname, '.env') })

/** Baked into the Electron main bundle so packaged installs work without `.env` beside the .exe. */
const embedInstallRegistryUrl = (process.env.INSTALL_REGISTRY_URL ?? '').trim()
const embedRegistryToken = (process.env.REGISTRY_TOKEN ?? '').trim()
const embedReleaseOwner = (process.env.ZEUS_RELEASE_OWNER ?? '').trim()
const embedReleaseRepo = (process.env.ZEUS_RELEASE_REPO ?? '').trim()
const embedSecondReleaseOwner = (process.env.ZEUS_SECOND_RELEASE_OWNER ?? '').trim()
const embedSecondReleaseRepo = (process.env.ZEUS_SECOND_RELEASE_REPO ?? '').trim()
const embedAleUsername = (process.env.ZEUS_ALE_USERNAME ?? process.env.VITE_ALE_USERNAME ?? '').trim()
const embedAlePassword = (process.env.ZEUS_ALE_PASSWORD ?? process.env.VITE_ALE_PASSWORD ?? '').trim()

const isTauri = Boolean(process.env.TAURI_ENV)

export default defineConfig({
  plugins: [
    react(),
    ...(isTauri
      ? []
      : [
          electron({
      main: {
        entry: 'electron/main.ts',
        vite: {
          define: {
            __ZEUS_EMBED_INSTALL_REGISTRY_URL__: JSON.stringify(embedInstallRegistryUrl),
            __ZEUS_EMBED_REGISTRY_TOKEN__: JSON.stringify(embedRegistryToken),
            __ZEUS_EMBED_RELEASE_OWNER__: JSON.stringify(embedReleaseOwner),
            __ZEUS_EMBED_RELEASE_REPO__: JSON.stringify(embedReleaseRepo),
            __ZEUS_EMBED_SECOND_RELEASE_OWNER__: JSON.stringify(embedSecondReleaseOwner),
            __ZEUS_EMBED_SECOND_RELEASE_REPO__: JSON.stringify(embedSecondReleaseRepo),
            __ZEUS_EMBED_ALE_USERNAME__: JSON.stringify(embedAleUsername),
            __ZEUS_EMBED_ALE_PASSWORD__: JSON.stringify(embedAlePassword),
          },
          build: {
            outDir: 'dist-electron',
            rollupOptions: {
              external: ['electron', 'electron-updater', 'node-pty', 'mysql2', 'mysql2/promise', 'ssh2'],
            },
          },
        },
      },
      preload: {
        input: path.join(__dirname, 'electron/preload.ts'),
        vite: {
          build: {
            outDir: 'dist-electron',
          },
        },
      },
      // Ensure renderer process handling is correct
      renderer: {},
    }),
        ]),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  optimizeDeps: {
    entries: [path.join(__dirname, 'index.html')],
  },
  server: {
    port: 5173,
    host: true,
    strictPort: true,
    proxy: {
      '/labelary': {
        target: 'http://api.labelary.com',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/labelary/, ''),
      },
    },
    fs: {
      deny: ['**/android/**', '**/ios/**'],
    },
    watch: {
      ignored: ['**/android/**', '**/ios/**', '**/node_modules/**'],
    },
  },
  base: './', 
})
