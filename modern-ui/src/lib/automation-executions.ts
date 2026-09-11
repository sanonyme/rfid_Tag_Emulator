/**
 * Execution history for the Automation tab (n8n-style "Executions" list).
 *
 * Every run — full, single sequence, or partial (run from a node) — is recorded
 * with its outcome, duration, and a capped snapshot of the activity log so it can
 * be reviewed after the live log has been cleared or overwritten by the next run.
 * Persisted to localStorage so history survives tab switches and reloads.
 */

export type ExecutionStatus = 'running' | 'success' | 'error' | 'stopped'

export interface ExecutionRecord {
  id: string
  /** Epoch ms when the run started. */
  startedAt: number
  /** Epoch ms when the run ended (undefined while running). */
  finishedAt?: number
  status: ExecutionStatus
  /** Human label of what ran, e.g. `sequence "Basics"` or `3 top-level sequences`. */
  scope: string
  /** Partial run: name of the node execution started from. */
  startedFrom?: string
  /** Nodes executed (control-flow nodes included). */
  stepsRun: number
  /** Error message for failed runs. */
  error?: string
  /** Capped copy of the activity log. */
  log: string[]
  /** True when the log had more lines than were kept. */
  logTruncated: boolean
}

export const MAX_EXECUTIONS = 25
export const MAX_EXECUTION_LOG_LINES = 400
const STORAGE_KEY = 'automation-executions'

export function loadExecutions(): ExecutionRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((r): r is ExecutionRecord => r && typeof r.id === 'string' && typeof r.startedAt === 'number')
      // A run that was still "running" when the app closed can't be resumed.
      .map((r) => (r.status === 'running' ? { ...r, status: 'stopped' as ExecutionStatus, finishedAt: r.finishedAt ?? r.startedAt } : r))
      .slice(0, MAX_EXECUTIONS)
  } catch {
    return []
  }
}

export function saveExecutions(records: ExecutionRecord[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records.slice(0, MAX_EXECUTIONS)))
  } catch {
    // Storage full or unavailable — history is best-effort.
  }
}

/** Prepend a record, keeping the list capped. */
export function pushExecution(records: ExecutionRecord[], record: ExecutionRecord): ExecutionRecord[] {
  return [record, ...records.filter((r) => r.id !== record.id)].slice(0, MAX_EXECUTIONS)
}

/** Replace a record in place (used to finalize a running record). */
export function updateExecution(
  records: ExecutionRecord[],
  id: string,
  patch: Partial<ExecutionRecord>,
): ExecutionRecord[] {
  return records.map((r) => (r.id === id ? { ...r, ...patch } : r))
}

/** Keep the tail of a log for storage. */
export function snapshotLog(lines: string[]): { log: string[]; logTruncated: boolean } {
  if (lines.length <= MAX_EXECUTION_LOG_LINES) return { log: [...lines], logTruncated: false }
  return { log: lines.slice(-MAX_EXECUTION_LOG_LINES), logTruncated: true }
}

export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '—'
  if (ms < 1000) return `${Math.round(ms)} ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)} s`
  const m = Math.floor(ms / 60_000)
  const s = Math.round((ms % 60_000) / 1000)
  if (m < 60) return `${m}m ${s.toString().padStart(2, '0')}s`
  const h = Math.floor(m / 60)
  return `${h}h ${(m % 60).toString().padStart(2, '0')}m`
}

export function formatRelativeTime(epochMs: number, now = Date.now()): string {
  const diff = Math.max(0, now - epochMs)
  if (diff < 45_000) return 'just now'
  const min = Math.round(diff / 60_000)
  if (min < 60) return `${min} min ago`
  const h = Math.round(min / 60)
  if (h < 24) return `${h} h ago`
  const d = Math.round(h / 24)
  return `${d} d ago`
}
