import { getBoolPref, setBoolPref } from './bool-pref'

/** Persisted automation execution log on/off. When off, no lines are written during a run. */
export const AUTOMATION_FULL_ACTIVITY_LOG_KEY = 'rfid-emulator-automation-activity-logs'

export function getAutomationFullActivityLog(): boolean {
  return getBoolPref(AUTOMATION_FULL_ACTIVITY_LOG_KEY)
}

export function setAutomationFullActivityLog(enabled: boolean): void {
  setBoolPref(AUTOMATION_FULL_ACTIVITY_LOG_KEY, enabled)
}
