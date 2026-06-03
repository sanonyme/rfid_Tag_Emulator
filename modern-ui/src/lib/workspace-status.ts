import { useEffect, useState } from 'react'

/**
 * Canonical service keys. Handheld uses dynamic keys like `hh:10472`
 * so the type is widened to `string`.
 */
export type ServiceKey =
  | 'fixed'
  | 'ocr'
  | 'adam'
  | 'edge'
  | 'automation'
  | 'db'
  | 'sftp'
  | string // handheld:<port>

export type ServiceStatus = 'idle' | 'connecting' | 'connected' | 'sending' | 'error'

export interface ServiceState {
  status: ServiceStatus
  host?: string
  port?: number
  /** Human label override (e.g. "HH :10472"). */
  label?: string
  /** Short detail line shown in tooltip / hover row (e.g. "2 tags/s"). */
  detail?: string
  error?: string
  /** Timestamp of last state change, for subtle animations. */
  updatedAt: number
}

export type WorkspaceStatusMap = Record<string, ServiceState>

type Listener = (map: WorkspaceStatusMap) => void

const state: WorkspaceStatusMap = {}
const listeners = new Set<Listener>()

function emit() {
  const snapshot = { ...state }
  listeners.forEach((l) => l(snapshot))
}

/**
 * Publish a service state update. Omit fields to keep previous values.
 * Passing `{ status: 'idle' }` on a service that was previously active is equivalent
 * to "clear it" — the bar will hide optional services when idle.
 */
export function publishStatus(key: ServiceKey, update: Partial<Omit<ServiceState, 'updatedAt'>>) {
  const prev = state[key] ?? { status: 'idle', updatedAt: 0 }
  const next: ServiceState = {
    ...prev,
    ...update,
    updatedAt: Date.now(),
  }
  state[key] = next
  emit()
}

export function clearStatus(key: ServiceKey) {
  if (key in state) {
    delete state[key]
    emit()
  }
}

export function getWorkspaceStatus(): WorkspaceStatusMap {
  return { ...state }
}

export function subscribeWorkspaceStatus(listener: Listener): () => void {
  listeners.add(listener)
  listener({ ...state })
  return () => {
    listeners.delete(listener)
  }
}

/**
 * React hook that re-renders whenever any service state changes.
 */
export function useWorkspaceStatus(): WorkspaceStatusMap {
  const [snapshot, setSnapshot] = useState<WorkspaceStatusMap>(() => ({ ...state }))
  useEffect(() => subscribeWorkspaceStatus(setSnapshot), [])
  return snapshot
}

export function handheldKey(port: number): string {
  return `hh:${port}`
}
