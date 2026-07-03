import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const defaultKeyPath = path.join(os.homedir(), '.tauri', 'zeus.key')

/** Load minisign credentials into env for the Tauri CLI bundler. */
export function applyTauriSigningEnv(env) {
  let keyPath = env.TAURI_SIGNING_PRIVATE_KEY_PATH?.trim()
  if (!keyPath && !env.TAURI_SIGNING_PRIVATE_KEY?.trim() && fs.existsSync(defaultKeyPath)) {
    keyPath = defaultKeyPath
  }

  if (keyPath && fs.existsSync(keyPath)) {
    // Forward slashes avoid Windows path parsing issues in the Rust signer.
    env.TAURI_SIGNING_PRIVATE_KEY_PATH = keyPath.replace(/\\/g, '/')
    if (!env.TAURI_SIGNING_PRIVATE_KEY?.trim()) {
      env.TAURI_SIGNING_PRIVATE_KEY = fs.readFileSync(keyPath, 'utf8').trim()
    }
    // Key was generated without a password — avoid an interactive prompt during build.
    if (env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD === undefined) {
      env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD = ''
    }
  }

  return Boolean(
    env.TAURI_SIGNING_PRIVATE_KEY?.trim() || env.TAURI_SIGNING_PRIVATE_KEY_PATH?.trim(),
  )
}

export function readTauriConfPubkey(root) {
  try {
    const conf = JSON.parse(
      fs.readFileSync(path.join(root, 'src-tauri', 'tauri.conf.json'), 'utf8'),
    )
    return conf?.plugins?.updater?.pubkey?.trim() ?? ''
  } catch {
    return ''
  }
}

export function resolveUpdaterPublicKey(env, root) {
  const publicKey =
    env.TAURI_SIGNING_PUBLIC_KEY?.trim() ||
    env.ZEUS_UPDATER_PUBKEY?.trim() ||
    readTauriConfPubkey(root)

  if (publicKey && !env.TAURI_SIGNING_PUBLIC_KEY) {
    env.TAURI_SIGNING_PUBLIC_KEY = publicKey
  }

  return publicKey
}
