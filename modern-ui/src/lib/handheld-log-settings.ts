import { getBoolPref, setBoolPref } from './bool-pref'

/**
 * Persisted handheld activity log level.
 * Same storage key as the legacy "per-tag logs" toggle so existing prefs stay valid.
 * - Full (`'1'` / default): all sends, completions, per-tag progress, loop rounds, etc.
 * - Minimal (`'0'`): only VSBL client connect/disconnect (with totals), server listen / already-running, and errors.
 */
export const HANDHELD_FULL_ACTIVITY_LOG_KEY = 'rfid-emulator-handheld-detail-logs'

export function getHandheldFullActivityLog(): boolean {
  return getBoolPref(HANDHELD_FULL_ACTIVITY_LOG_KEY)
}

export function setHandheldFullActivityLog(full: boolean): void {
  setBoolPref(HANDHELD_FULL_ACTIVITY_LOG_KEY, full)
}

/**
 * When `fullActivity` is false (minimal mode), only connection-related and error lines are kept.
 * Call with the raw message text (no timestamp / port prefix).
 */
export function shouldAppendHandheldLogLine(message: string, fullActivity: boolean): boolean {
  if (fullActivity) return true
  const m = message.trim()
  if (!m) return false
  if (/^error:/i.test(m) || /^error\s/i.test(m) || m.startsWith('Error:')) return true
  if (/handheld device connected/i.test(m)) return true
  if (/handheld device disconnected/i.test(m)) return true
  if (/handheld server listening on port/i.test(m)) return true
  if (/handheld server already running on port/i.test(m)) return true
  if (/no handheld connected/i.test(m)) return true
  if (/no server running on port/i.test(m)) return true
  if (/server error:/i.test(m)) return true
  if (/^stopped:/i.test(m) || /cancelled by user/i.test(m)) return true
  return false
}
