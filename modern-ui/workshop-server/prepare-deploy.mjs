import { build } from 'esbuild'
import { copyFile, mkdir, readdir, stat } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const root = new URL('./', import.meta.url)
const output = new URL('.workshop-deploy/', root)
await mkdir(output, { recursive: true })
// Copy an explicit allowlist: desktop .env files and credentials never enter the package.
const files = ['package.json', 'package-lock.json', 'Dockerfile', '.dockerignore',
  'compose.yaml', 'Caddyfile', '.env.example', 'README.md', 'install-systemd.sh', 'zeus-workshop.service']
for (const name of files) await copyFile(new URL(`hosting/${name}`, root), new URL(name, output))
await copyFile(new URL('schema.sql', root), new URL('schema.sql', output))
const result = await build({
  entryPoints: [fileURLToPath(new URL('start.ts', root))],
  outfile: fileURLToPath(new URL('server.mjs', output)),
  bundle: true, platform: 'node', format: 'esm', target: 'node22', packages: 'external',
  define: { 'process.env.NODE_ENV': '"production"' }, minifySyntax: true, metafile: true,
})
const imports = Object.values(result.metafile.outputs).flatMap(v => v.imports)
if (imports.some(v => v.path.includes('pglite'))) throw new Error('Development database included in production bundle')
const size = (await stat(new URL('server.mjs', output))).size
console.log(`Server-only deployment prepared: ${fileURLToPath(output)} (${Math.ceil(size / 1024)} KiB bundle)`)
// A previous deployment's .env is preserved so rebuilding never resets its credentials.
if ((await readdir(output)).includes('.env')) console.log('Existing server .env preserved. Keep it private when transferring files.')
