/**
 * Register this Zeus install with a URL you control (e.g. Supabase Edge Function; see /supabase/README.md).
 * POST { machineId, macAddress, version, os, arch }: auto-send at most once per 24h. "Send now" bypasses
 * that but is throttled to once per SEND_NOW_COOLDOWN_MS.
 */
import { app } from 'electron'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { machineIdSync } from 'node-machine-id'

const STATE_FILE = 'install-registry.json'
const MIN_INTERVAL_MS = 24 * 60 * 60 * 1000
/** Minimum time between two "Send now" attempts (stops button spam; separate from 24h auto-send). */
const SEND_NOW_COOLDOWN_MS = 60_000

export type InstallRegistryPayload = {
  machineId: string
  macAddress: string | null
  version: string
  os: string
  arch: string
}

type RegistryState = {
  enabled: boolean
  lastSentAt: number | null
  /** Set when a forced ("Send now") request is started; throttles the next force. */
  lastManualSendAt: number | null
  lastSentStatus: 'success' | 'error' | 'disabled' | 'skipped' | null
  lastSentError: string | null
}

function getRegistryUrl(): string {
  return (process.env['INSTALL_REGISTRY_URL'] || '').trim()
}

function getRegistryToken(): string {
  return (process.env['REGISTRY_TOKEN'] || '').trim()
}

function statePath(): string {
  return path.join(app.getPath('userData'), STATE_FILE)
}

function defaultState(): RegistryState {
  return {
    enabled: true,
    lastSentAt: null,
    lastManualSendAt: null,
    lastSentStatus: null,
    lastSentError: null,
  }
}

function readState(): RegistryState {
  const p = statePath()
  if (!fs.existsSync(p)) return defaultState()
  try {
    const raw = fs.readFileSync(p, 'utf-8')
    const parsed = JSON.parse(raw) as Partial<RegistryState>
    if (!parsed || typeof parsed !== 'object' || typeof parsed.enabled !== 'boolean') {
      return defaultState()
    }
    return {
      enabled: parsed.enabled,
      lastSentAt: typeof parsed.lastSentAt === 'number' ? parsed.lastSentAt : null,
      lastManualSendAt: typeof parsed.lastManualSendAt === 'number' ? parsed.lastManualSendAt : null,
      lastSentStatus: parsed.lastSentStatus ?? null,
      lastSentError: typeof parsed.lastSentError === 'string' ? parsed.lastSentError : null,
    }
  } catch {
    return defaultState()
  }
}

function writeState(s: RegistryState) {
  try {
    fs.writeFileSync(statePath(), JSON.stringify(s, null, 2), 'utf-8')
  } catch (err) {
    console.warn('[install-registry] failed to persist state:', err)
  }
}

function patchState(partial: Partial<RegistryState>): RegistryState {
  const next = { ...readState(), ...partial }
  writeState(next)
  return next
}

/** First non-loopback interface with a usable MAC. */
export function getPrimaryMacAddress(): string | null {
  const ifaces = os.networkInterfaces()
  for (const name of Object.keys(ifaces).sort()) {
    const addrs = ifaces[name]
    if (!addrs) continue
    for (const a of addrs) {
      if (a.internal) continue
      const m = a.mac
      if (m && m !== '00:00:00:00:00:00') return m
    }
  }
  return null
}

export function getMachineIdString(): string {
  try {
    return machineIdSync()
  } catch (err) {
    console.warn('[install-registry] machineIdSync failed:', err)
    return ''
  }
}

function currentPayload(): InstallRegistryPayload {
  return {
    machineId: getMachineIdString(),
    macAddress: getPrimaryMacAddress(),
    version: app.getVersion(),
    os: process.platform,
    arch: process.arch,
  }
}

export type InstallRegistryStatus = {
  enabled: boolean
  endpoint: string | null
  lastSentAt: number | null
  /** Remaining ms before "Send now" is allowed; 0 if ready. */
  sendNowAfterMs: number
  lastSentStatus: 'success' | 'error' | 'disabled' | 'skipped' | null
  lastSentError: string | null
  hasToken: boolean
  nextPayload: InstallRegistryPayload
}

function sendNowCooldownRemainingMs(s: RegistryState): number {
  if (s.lastManualSendAt == null) return 0
  return Math.max(0, SEND_NOW_COOLDOWN_MS - (Date.now() - s.lastManualSendAt))
}

export function getInstallRegistryStatus(): InstallRegistryStatus {
  const url = getRegistryUrl()
  const s = readState()
  return {
    enabled: s.enabled,
    endpoint: url || null,
    lastSentAt: s.lastSentAt,
    sendNowAfterMs: sendNowCooldownRemainingMs(s),
    lastSentStatus: s.lastSentStatus,
    lastSentError: s.lastSentError,
    hasToken: Boolean(getRegistryToken()),
    nextPayload: currentPayload(),
  }
}

export function setInstallRegistryEnabled(value: boolean): boolean {
  patchState({ enabled: value })
  return readState().enabled
}

export function getInstallRegistryEnabled(): boolean {
  return readState().enabled
}

export async function sendInstallRegistry(
  opts: { force?: boolean } = {},
): Promise<{
  status: 'success' | 'error' | 'disabled' | 'skipped'
  error?: string
  sendNowAfterMs?: number
  payload?: InstallRegistryPayload
}> {
  const url = getRegistryUrl()
  if (!url) {
    patchState({ lastSentStatus: 'disabled', lastSentError: 'INSTALL_REGISTRY_URL not set' })
    return { status: 'disabled', error: 'INSTALL_REGISTRY_URL not set' }
  }
  if (!getInstallRegistryEnabled()) {
    patchState({ lastSentStatus: 'disabled', lastSentError: 'disabled by user' })
    return { status: 'disabled', error: 'disabled by user' }
  }

  const payload = currentPayload()
  if (!payload.machineId) {
    patchState({ lastSentStatus: 'error', lastSentError: 'no machine id' })
    return { status: 'error', error: 'no machine id', payload }
  }

  const now = Date.now()
  const s = readState()
  if (opts.force) {
    if (s.lastManualSendAt != null && now - s.lastManualSendAt < SEND_NOW_COOLDOWN_MS) {
      const sendNowAfterMs = Math.max(0, SEND_NOW_COOLDOWN_MS - (now - s.lastManualSendAt))
      return {
        status: 'skipped',
        error: 'Send now: please wait before sending again.',
        sendNowAfterMs,
        payload,
      }
    }
    patchState({ lastManualSendAt: now })
  }
  if (!opts.force && s.lastSentAt && now - s.lastSentAt < MIN_INTERVAL_MS) {
    return { status: 'skipped', payload }
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  const token = getRegistryToken()
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    })
    if (!res.ok) {
      const errText = await res.text().catch(() => res.statusText)
      const msg = `HTTP ${res.status}: ${errText.slice(0, 200)}`
      patchState({ lastSentAt: now, lastSentStatus: 'error', lastSentError: msg })
      return { status: 'error', error: msg, payload }
    }
    patchState({ lastSentAt: now, lastSentStatus: 'success', lastSentError: null })
    return { status: 'success', payload }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    patchState({ lastSentAt: now, lastSentStatus: 'error', lastSentError: msg })
    return { status: 'error', error: msg, payload }
  }
}
