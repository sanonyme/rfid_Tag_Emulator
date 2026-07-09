import { execFile } from 'child_process'
import fs from 'fs'
import path from 'path'
import { app } from 'electron'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)

const MAX_STDOUT = 256 * 1024
const DEFAULT_SCRIPT_TIMEOUT = 30_000
const MAX_SCRIPT_TIMEOUT = 120_000

export type RunScriptPayload = {
  /** Absolute path under userData/scripts, or inline script text when inline=true */
  scriptPath?: string
  inline?: boolean
  inlineScript?: string
  args?: string[]
  env?: Record<string, string>
  timeoutMs?: number
  cwd?: string
}

export type RunScriptResult =
  | { ok: true; stdout: string; stderr: string; exitCode: number }
  | { ok: false; error: string }

function getScriptsRoot(): string {
  return path.join(app.getPath('userData'), 'scripts')
}

export function ensureScriptsDir(): string {
  const root = getScriptsRoot()
  if (!fs.existsSync(root)) fs.mkdirSync(root, { recursive: true })
  return root
}

function resolveScriptPath(scriptPath: string): string | null {
  const root = path.resolve(ensureScriptsDir())
  const resolved = path.resolve(scriptPath)
  if (!resolved.startsWith(root + path.sep) && resolved !== root) return null
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) return null
  return resolved
}

export async function runAutomationScript(payload: RunScriptPayload): Promise<RunScriptResult> {
  const timeoutMs = Math.min(
    MAX_SCRIPT_TIMEOUT,
    Math.max(1000, Number(payload.timeoutMs) || DEFAULT_SCRIPT_TIMEOUT),
  )
  const env = {
    ...process.env,
    ...(payload.env && typeof payload.env === 'object' ? payload.env : {}),
  }
  const args = Array.isArray(payload.args)
    ? payload.args.filter((a) => typeof a === 'string').slice(0, 32)
    : []

  let fileToRun: string
  let cleanup: string | null = null

  if (payload.inline) {
    const text = String(payload.inlineScript || '')
    if (!text.trim()) return { ok: false, error: 'Inline script is empty' }
    if (text.length > 64 * 1024) return { ok: false, error: 'Inline script too large' }
    const root = ensureScriptsDir()
    const ext = process.platform === 'win32' ? '.ps1' : '.sh'
    cleanup = path.join(root, `_inline_${Date.now()}${ext}`)
    fs.writeFileSync(cleanup, text, 'utf-8')
    fileToRun = cleanup
  } else {
    const p = String(payload.scriptPath || '').trim()
    if (!p) return { ok: false, error: 'Script path is required' }
    const resolved = resolveScriptPath(p)
    if (!resolved) {
      return {
        ok: false,
        error: `Script must be a file under ${getScriptsRoot()}`,
      }
    }
    fileToRun = resolved
  }

  const cwdRoot = ensureScriptsDir()
  let cwd = cwdRoot
  if (payload.cwd) {
    const resolvedCwd = path.resolve(payload.cwd)
    if (resolvedCwd.startsWith(cwdRoot + path.sep) || resolvedCwd === cwdRoot) {
      cwd = resolvedCwd
    }
  }

  try {
    const isWin = process.platform === 'win32'
    const ext = path.extname(fileToRun).toLowerCase()
    let cmd: string
    let cmdArgs: string[]

    if (isWin && (ext === '.ps1' || ext === '.psm1')) {
      cmd = 'powershell.exe'
      cmdArgs = ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', fileToRun, ...args]
    } else if (isWin && (ext === '.bat' || ext === '.cmd')) {
      cmd = process.env.COMSPEC || 'cmd.exe'
      cmdArgs = ['/c', fileToRun, ...args]
    } else if (ext === '.sh' || ext === '.bash') {
      cmd = process.env.SHELL || '/bin/bash'
      cmdArgs = [fileToRun, ...args]
    } else if (ext === '.js' || ext === '.mjs' || ext === '.cjs') {
      cmd = process.execPath
      cmdArgs = [fileToRun, ...args]
    } else if (isWin) {
      cmd = process.env.COMSPEC || 'cmd.exe'
      cmdArgs = ['/c', fileToRun, ...args]
    } else {
      cmd = fileToRun
      cmdArgs = args
    }

    const { stdout, stderr } = await execFileAsync(cmd, cmdArgs, {
      cwd,
      env,
      timeout: timeoutMs,
      maxBuffer: MAX_STDOUT,
      windowsHide: true,
    })
    return {
      ok: true,
      stdout: String(stdout || '').slice(0, MAX_STDOUT),
      stderr: String(stderr || '').slice(0, MAX_STDOUT),
      exitCode: 0,
    }
  } catch (err: any) {
    const stdout = String(err?.stdout || '').slice(0, MAX_STDOUT)
    const stderr = String(err?.stderr || err?.message || String(err)).slice(0, MAX_STDOUT)
    const code = typeof err?.code === 'number' ? err.code : 1
    if (err?.killed) {
      return { ok: false, error: `Script timed out after ${timeoutMs}ms` }
    }
    return {
      ok: true,
      stdout,
      stderr,
      exitCode: code,
    }
  } finally {
    if (cleanup) {
      try {
        fs.unlinkSync(cleanup)
      } catch {
        /* ignore */
      }
    }
  }
}

export function openScriptsFolder(): { ok: true; path: string } | { ok: false; error: string } {
  try {
    const root = ensureScriptsDir()
    return { ok: true, path: root }
  } catch (err: any) {
    return { ok: false, error: err?.message || String(err) }
  }
}
