import { execSync } from 'node:child_process'

/** Stop any process listening on `port` (best-effort, dev only). */
export function freeDevPort(port) {
  if (process.platform === 'win32') {
    try {
      // netstat is much faster than PowerShell Get-NetTCPConnection on Windows.
      const out = execSync(`netstat -ano -p tcp | findstr ":${port} " | findstr LISTENING`, {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      })
      const pids = [
        ...new Set(
          out
            .split(/\r?\n/)
            .map((line) => parseInt(line.trim().split(/\s+/).pop() ?? '', 10))
            .filter((n) => Number.isFinite(n) && n > 0 && n !== process.pid),
        ),
      ]
      for (const pid of pids) {
        try {
          execSync(`taskkill /PID ${pid} /F`, { stdio: 'ignore' })
          console.warn(`[tauri:dev] Freed port ${port} (stopped PID ${pid})`)
        } catch {
          /* ignore */
        }
      }
    } catch {
      /* port already free */
    }
    return
  }

  try {
    execSync(`lsof -ti tcp:${port} | xargs kill -9 2>/dev/null`, {
      shell: true,
      stdio: 'ignore',
    })
  } catch {
    /* port already free */
  }
}
