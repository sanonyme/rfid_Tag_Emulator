import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'
import { fileURLToPath } from 'url'
import { createConnection } from 'net'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' }

/** In-process API middleware - runs FIRST, handles ALE proxy + OCR TCP */
function mobileProxyPlugin() {
  return {
    name: 'mobile-proxy',
    configureServer(server: { middlewares: { use: (fn: (r: any, s: any, n: () => void) => void) => void; stack?: Array<{ route: string; handle: (r: any, s: any, n: () => void) => void }> } }) {
      const handle = (req: any, res: any, next: () => void) => {
        const p = (req.url || '').split('?')[0]
        if (req.method === 'OPTIONS' && (p.includes('ale-proxy') || p.includes('ocr-send'))) {
          res.writeHead(204, CORS)
          res.end()
          return
        }
        if (p.includes('ping')) {
          res.writeHead(200, { ...CORS, 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ ok: true, message: 'Proxy reachable' }))
          return
        }
        if (p.includes('ale-proxy') && req.method === 'POST') {
          let buf = ''
          req.on('data', (c: Buffer) => { buf += c.toString() })
          req.on('end', async () => {
            try {
              const { url, method = 'GET', headers = {}, body } = JSON.parse(buf)
              const r = await fetch(url, { method, headers: headers as Record<string, string>, body: body || undefined })
              const text = await r.text()
              const h: Record<string, string> = {}
              r.headers.forEach((v: string, k: string) => { h[k] = v })
              res.writeHead(200, { ...CORS, 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ ok: r.ok, status: r.status, statusText: r.statusText, data: text, headers: h }))
            } catch (e: unknown) {
              res.writeHead(500, { ...CORS, 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ ok: false, status: 0, statusText: (e as Error).message, data: null, headers: {} }))
            }
          })
          return
        }
        if (p.includes('ocr-send') && req.method === 'POST') {
          let buf = ''
          req.on('data', (c: Buffer) => { buf += c.toString() })
          req.on('end', () => {
            try {
              const { host, message } = JSON.parse(buf)
              const sock = createConnection(10482, host, () => {
                sock.write(message + '\n', 'utf8', (err) => {
                  sock.end()
                  res.writeHead(err ? 500 : 200, { ...CORS, 'Content-Type': 'application/json' })
                  res.end(JSON.stringify({ success: !err, message: err ? err.message : `Sent: ${message}` }))
                })
              })
              sock.on('error', (e: Error) => {
                res.writeHead(500, { ...CORS, 'Content-Type': 'application/json' })
                res.end(JSON.stringify({ success: false, message: e.message }))
              })
              sock.setTimeout(8000, () => { sock.destroy(); res.writeHead(500, { ...CORS, 'Content-Type': 'application/json' }); res.end(JSON.stringify({ success: false, message: 'Timeout' })) })
            } catch (e: unknown) {
              res.writeHead(500, { ...CORS, 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ success: false, message: (e as Error).message }))
            }
          })
          return
        }
        next()
      }
      if (Array.isArray(server.middlewares.stack)) {
        server.middlewares.stack.unshift({ route: '', handle })
      } else {
        server.middlewares.use(handle)
      }
      console.log('[mobile-proxy] API middleware registered (ALE + OCR)')
    },
  }
}

/** Vite config for mobile builds (PWA - installable app). No Electron. */
export default defineConfig({
  root: __dirname,
  publicDir: path.join(__dirname, 'public'),
  server: {
    port: 5174,
    host: true,
    strictPort: false,
    fs: {
      allow: [__dirname, path.join(__dirname, 'node_modules')],
      deny: ['**/android/**', '**/ios/**'],
    },
    watch: {
      ignored: ['**/android/**', '**/ios/**', '**/node_modules/**'],
    },
  },
  optimizeDeps: {
    entries: [path.join(__dirname, 'index.html')],
  },
  plugins: [
    mobileProxyPlugin(),
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['zeus-removebg-preview.png'],
      manifest: {
        name: 'Zeus RFID Emulator',
        short_name: 'Zeus Emulator',
        description: 'RFID Tag Emulator for Fixed Reader, Handheld, and OCR',
        theme_color: '#3b82f6',
        background_color: '#0f172a',
        display: 'standalone',
        orientation: 'portrait',
        scope: './',
        start_url: './',
        icons: [
          {
            src: 'zeus-removebg-preview.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'zeus-removebg-preview.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
        ],
      },
    }),
  ],
  define: {
    'import.meta.env.VITE_IS_MOBILE': JSON.stringify('true'),
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    outDir: 'dist',
  },
  base: './',
})
