import { spawnSync } from 'node:child_process'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'
import { finalizeTauriArtifacts } from './tauri-artifacts.mjs'
import { applyTauriSigningEnv, resolveUpdaterPublicKey } from './tauri-signing-env.mjs'
import { syncAppVersion } from './sync-app-version.mjs'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const envPath = path.join(root, '.env')
dotenv.config({ path: envPath })

const version = syncAppVersion()
console.log(`[tauri-build] Building Zeus ${version} (${process.platform})`)

if (process.env.VITE_ALE_USERNAME || process.env.ZEUS_ALE_USERNAME) {
  console.log('[tauri-build] ALE credentials loaded from .env for embed')
} else {
  console.warn(
    '[tauri-build] Warning: no ALE credentials in .env — Fixed tab auth will fail in production builds.',
  )
}

const env = { ...process.env }

const hasSigningPrivateKey = applyTauriSigningEnv(env)

const owner = env.ZEUS_RELEASE_OWNER?.trim() || 'sanonyme'
const repo = env.ZEUS_RELEASE_REPO?.trim() || 'zeus-releases'
const updateEndpoint = `https://github.com/${owner}/${repo}/releases/latest/download/latest.json`

const publicKey = resolveUpdaterPublicKey(env, root)

const cargoBin = path.join(os.homedir(), '.cargo', 'bin')
const tauriCli = path.join(root, 'node_modules', '@tauri-apps', 'cli', 'tauri.js')
const pathKey = process.platform === 'win32' ? 'Path' : 'PATH'
env[pathKey] = `${cargoBin}${path.delimiter}${env[pathKey] ?? ''}`

const args = [tauriCli, 'build']
const config = {
  version,
  plugins: {
    updater: {
      pubkey: publicKey,
      endpoints: [updateEndpoint],
    },
  },
}

if (!hasSigningPrivateKey) {
  console.warn(
    '[tauri-build] No TAURI_SIGNING_PRIVATE_KEY — building installers without signed updater artifacts.',
  )
  config.bundle = {
    createUpdaterArtifacts: false,
    targets: bundleTargetsForPlatform(),
  }
  if (publicKey) {
    delete config.plugins.updater.pubkey
  }
} else {
  console.log('[tauri-build] Updater signing enabled.')
  config.bundle = {
    createUpdaterArtifacts: true,
    targets: bundleTargetsForPlatform(),
  }
}

function bundleTargetsForPlatform() {
  if (process.platform === 'linux') return ['deb', 'appimage']
  if (process.platform === 'win32') return ['nsis', 'msi']
  return 'all'
}

args.push('--config', JSON.stringify(config))

const result = spawnSync(process.execPath, args, {
  cwd: root,
  env,
  stdio: 'inherit',
})

if (result.status !== 0) {
  process.exit(result.status ?? 1)
}

const outputs = finalizeTauriArtifacts(version)
if (outputs.length > 0) {
  console.log('[tauri-build] Versioned artifacts:')
  for (const file of outputs) console.log(`  ${file}`)
}
