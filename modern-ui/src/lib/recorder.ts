/**
 * In-memory recorder for tag-send activity.
 *
 * A single global session captures every batch of tags sent from the Fixed
 * and Handheld tabs (one record per send call), along with the timestamp
 * delta from the start of the recording. Recordings can be saved to disk
 * as `.zeusrec.json` files for later analysis or repro.
 *
 * This module is intentionally Electron-free so it can be reused in
 * tests and (eventually) in the mobile build.
 */

export const TAG_RECORD_FORMAT = 'zeus-tag-record'
export const TAG_RECORD_FORMAT_VERSION = 1

export type RecordSource = 'fixed' | 'handheld'

export interface RecordedTag {
  epc: string
  tid?: string
  rssi?: string
  antenna?: number
  uid?: string
}

export interface RecordedEvent {
  /** Milliseconds since the recording started. */
  t: number
  source: RecordSource
  sourceLabel?: string
  port?: number
  driver?: string
  count: number
  tags: RecordedTag[]
}

export interface RecorderState {
  active: boolean
  startedAt: number | null
  stoppedAt: number | null
  events: RecordedEvent[]
}

export interface TagRecordFile {
  format: typeof TAG_RECORD_FORMAT
  formatVersion: number
  startedAt: string
  stoppedAt: string
  appVersion?: string
  events: RecordedEvent[]
}

let state: RecorderState = {
  active: false,
  startedAt: null,
  stoppedAt: null,
  events: [],
}

const listeners = new Set<(s: RecorderState) => void>()

function snapshot(): RecorderState {
  return {
    active: state.active,
    startedAt: state.startedAt,
    stoppedAt: state.stoppedAt,
    events: state.events.slice(),
  }
}

function emit(): void {
  const snap = snapshot()
  for (const listener of listeners) {
    try {
      listener(snap)
    } catch {
      // ignore subscriber errors so one bad caller can't kill recording
    }
  }
}

export function getRecorderState(): RecorderState {
  return snapshot()
}

export function isRecording(): boolean {
  return state.active
}

export function startRecording(): void {
  state = {
    active: true,
    startedAt: Date.now(),
    stoppedAt: null,
    events: [],
  }
  emit()
}

export function stopRecording(): void {
  if (!state.active) return
  state = {
    ...state,
    active: false,
    stoppedAt: Date.now(),
  }
  emit()
}

export function clearRecording(): void {
  state = {
    active: false,
    startedAt: null,
    stoppedAt: null,
    events: [],
  }
  emit()
}

export interface RecordSendEventInput {
  source: RecordSource
  sourceLabel?: string
  port?: number
  driver?: string
  tags: RecordedTag[]
}

/**
 * Append a send batch to the current recording. No-op when not recording.
 *
 * Tag payloads are shallow-copied so subsequent mutations on the caller side
 * don't poison the recording.
 */
export function recordSendEvent(input: RecordSendEventInput): void {
  if (!state.active || state.startedAt === null) return
  const now = Date.now()
  const event: RecordedEvent = {
    t: now - state.startedAt,
    source: input.source,
    sourceLabel: input.sourceLabel,
    port: input.port,
    driver: input.driver,
    count: input.tags.length,
    tags: input.tags.map((t) => ({
      epc: t.epc,
      tid: t.tid,
      rssi: t.rssi,
      antenna: t.antenna,
      uid: t.uid,
    })),
  }
  state = { ...state, events: [...state.events, event] }
  emit()
}

export function subscribeRecorder(listener: (s: RecorderState) => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/* -------------------------------------------------------------------------- */
/* Save / load                                                                 */
/* -------------------------------------------------------------------------- */

export function buildRecordingFile(appVersion?: string): TagRecordFile {
  const startedIso = state.startedAt
    ? new Date(state.startedAt).toISOString()
    : new Date().toISOString()
  const stoppedIso = state.stoppedAt
    ? new Date(state.stoppedAt).toISOString()
    : new Date().toISOString()
  return {
    format: TAG_RECORD_FORMAT,
    formatVersion: TAG_RECORD_FORMAT_VERSION,
    startedAt: startedIso,
    stoppedAt: stoppedIso,
    appVersion,
    events: state.events.slice(),
  }
}

export function isTagRecordFile(value: unknown): value is TagRecordFile {
  if (!value || typeof value !== 'object') return false
  const v = value as Partial<TagRecordFile>
  return (
    v.format === TAG_RECORD_FORMAT &&
    typeof v.formatVersion === 'number' &&
    Array.isArray(v.events)
  )
}

export function downloadRecording(appVersion?: string, filename?: string): void {
  const file = buildRecordingFile(appVersion)
  const json = JSON.stringify(file, null, 2)
  const blob = new Blob([json], { type: 'application/json;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const a = document.createElement('a')
  a.href = url
  a.download = filename ?? `zeus-recording-${stamp}.zeusrec.json`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

/** Internal test-only: reset the singleton without emitting. */
export function __resetRecorderForTests(): void {
  state = {
    active: false,
    startedAt: null,
    stoppedAt: null,
    events: [],
  }
  listeners.clear()
}
