import { execSync, spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'
import { freeDevPort } from './free-dev-port.mjs'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
dotenv.config({ path: path.join(root, '.env') })
const cargoBin = path.join(os.homedir(), '.cargo', 'bin')
const tauriCli = path.join(root, 'node_modules', '@tauri-apps', 'cli', 'tauri.js')
const DEV_PORT = 5173
const EXE_PATH = path.join(root, 'src-tauri', 'target', 'debug', 'zeus-rfid-emulator.exe')

/** Reuse an already-running Vite dev server (skip beforeDevCommand). */
const rustOnly = process.argv.includes('--rust-only')

function countCargoProcesses() {
  if (process.platform !== 'win32') return 0
  try {
    const out = execSync('tasklist /FI "IMAGENAME eq cargo.exe" /FO CSV /NH', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    return out
      .trim()
      .split(/\r?\n/)
      .filter((line) => line.toLowerCase().includes('cargo.exe')).length
  } catch {
    return 0
  }
}

function warnIfCargoAlreadyRunning() {
  const count = countCargoProcesses()
  if (count > 0) {
    console.warn(
      `[tauri:dev] ${count} cargo.exe process(es) already running. ` +
        'A second build will sit on "Blocking waiting for file lock" until the first finishes. ' +
        'End extra cargo/rustc in Task Manager if this looks stuck.',
    )
  }
}

function printStartupHints() {
  const hasBinary = existsSync(EXE_PATH)

  if (hasBinary && !rustOnly) {
    console.log('[tauri:dev] Debug binary exists — rebuild should be incremental (much faster than first compile).')
    console.log(
      '[tauri:dev] After Vite is ready, "Compiling zeus-rfid-emulator" can sit with no output for 1–3 min (linking). ' +
        'That is normal — wait for "Finished dev profile" then the window opens.',
    )
  } else if (!rustOnly) {
    console.log(
      '[tauri:dev] First Rust compile can take 15–25 min on Windows (753 crates). ' +
        'Vite will be ready in ~5s; the window opens after "Finished dev profile". ' +
        'Do not run cargo check/build in another terminal at the same time.',
    )
  }
}

if (!rustOnly) {
  freeDevPort(DEV_PORT)
}

warnIfCargoAlreadyRunning()
printStartupHints()

const env = {
  ...process.env,
  /** Compile Rust while Vite boots instead of waiting for port 5173 first. */
  TAURI_CLI_NO_DEV_SERVER_WAIT: '1',
}
const pathKey = process.platform === 'win32' ? 'Path' : 'PATH'
env[pathKey] = `${cargoBin}${path.delimiter}${env[pathKey] ?? ''}`

const tauriArgs = ['dev', '--no-dev-server-wait']
if (rustOnly) {
  tauriArgs.push(
    '--config',
    JSON.stringify({
      build: {
        beforeDevCommand: '',
        devUrl: `http://localhost:${DEV_PORT}`,
      },
    }),
  )
  console.log('[tauri:dev] Rust-only — expecting Vite on http://localhost:' + DEV_PORT)
} else {
  console.log('[tauri:dev] Starting Vite + Rust in parallel')
}

const child = spawn(process.execPath, [tauriCli, ...tauriArgs], {
  cwd: root,
  env,
  stdio: 'inherit',
})

child.on('error', (err) => {
  console.error('Failed to start Tauri dev:', err)
  process.exit(1)
})

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal)
    return
  }
  process.exit(code ?? 1)
})
