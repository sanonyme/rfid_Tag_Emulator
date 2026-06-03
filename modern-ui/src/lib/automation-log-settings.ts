/**
 * Persisted automation execution log on/off.
 * When off, no lines are written during a run.
 */
export const AUTOMATION_FULL_ACTIVITY_LOG_KEY = 'rfid-emulator-automation-activity-logs'

export function getAutomationFullActivityLog(): boolean {
  try {
    return localStorage.getItem(AUTOMATION_FULL_ACTIVITY_LOG_KEY) !== '0'
  } catch {
    return true
  }
}

export function setAutomationFullActivityLog(enabled: boolean): void {
  try {
    localStorage.setItem(AUTOMATION_FULL_ACTIVITY_LOG_KEY, enabled ? '1' : '0')
  } catch {
    /* ignore */
  }
}
