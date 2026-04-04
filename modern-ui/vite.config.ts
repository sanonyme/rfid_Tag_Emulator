import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron/simple'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export default defineConfig({
  plugins: [
    react(),
    electron({
      main: {
        entry: 'electron/main.ts',
        vite: {
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
    fs: {
      deny: ['**/android/**', '**/ios/**'],
    },
    watch: {
      ignored: ['**/android/**', '**/ios/**', '**/node_modules/**'],
    },
  },
  base: './', 
})
