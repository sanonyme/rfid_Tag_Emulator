import type { Profile } from '@/components/ProfileManager'
import type { HandheldSlot } from '@/components/HandheldTab'
import type { AutomationSequence } from '@/lib/automation-types'
import { migrateStepsToSequences } from '@/lib/automation-types'

import type { AppSettings } from '@/lib/settings'

export type PopoutStateSetters = {
  setHost: (v: string) => void
  setPort: (v: string) => void
  setAlePort: (v: string) => void
  setDriver: (v: string) => void
  setUid: (v: string) => void
  setAntenna: (v: string) => void
  setRssi: (v: string) => void
  setStartSerial: (v: string) => void
  setFixedUpcList: (v: string) => void
  setFixedEpcList: (v: string) => void
  setHandheldSlots: (v: HandheldSlot[]) => void
  setOcrMessage: (v: string) => void
  setCustomPort: (v: string) => void
  setCustomMessage: (v: string) => void
  setAdamHost: (v: string) => void
  setDelay: (v: string) => void
  setHandheldDelay: (v: string) => void
  setAutomationSequences: (v: AutomationSequence[]) => void
  setConnected: (v: boolean) => void
  setSettings: (patch: Partial<AppSettings>) => void
}

/** Apply a profile-shaped snapshot when a pop-out window opens. */
export function applyPopoutInitState(
  raw: Record<string, unknown>,
  setters: PopoutStateSetters,
): void {
  const s = raw as Partial<Profile>

  if (s.host != null) setters.setHost(s.host)
  if (s.port != null) setters.setPort(s.port)
  if (s.alePort != null) setters.setAlePort(s.alePort)
  if (s.driver != null) setters.setDriver(s.driver)
  if (s.uid != null) setters.setUid(s.uid)
  if (s.antenna != null) setters.setAntenna(s.antenna)
  if (s.rssi != null) setters.setRssi(s.rssi)
  if (s.startSerial != null) setters.setStartSerial(s.startSerial)
  if (s.fixedUpcList != null) setters.setFixedUpcList(s.fixedUpcList)
  if (s.fixedEpcList != null) setters.setFixedEpcList(s.fixedEpcList)
  if (s.ocrMessage != null) setters.setOcrMessage(s.ocrMessage)
  if (s.customPort != null) setters.setCustomPort(s.customPort)
  if (s.customMessage != null) setters.setCustomMessage(s.customMessage)
  if (s.adamHost != null) setters.setAdamHost(s.adamHost)
  if (s.delay != null) setters.setDelay(s.delay)
  if (s.handheldDelay != null) setters.setHandheldDelay(s.handheldDelay)

  if (s.handheldSlots?.length) {
    setters.setHandheldSlots(s.handheldSlots)
  } else if (s.hhUpcList !== undefined || s.hhEpcList !== undefined) {
    setters.setHandheldSlots([
      {
        id: crypto.randomUUID(),
        port: 10472,
        upcList: s.hhUpcList || '',
        epcList: s.hhEpcList || '',
        startSerial: '1',
      },
    ])
  }

  if (s.automationSequences?.length) {
    setters.setAutomationSequences(s.automationSequences)
  } else if (s.automationSteps?.length) {
    setters.setAutomationSequences(migrateStepsToSequences(s.automationSteps))
  }

  if (
    s.fixedSerialContinuesAcrossUpcLines !== undefined ||
    s.handheldSerialContinuesAcrossUpcLines !== undefined
  ) {
    setters.setSettings({
      ...(s.fixedSerialContinuesAcrossUpcLines !== undefined && {
        fixedSerialContinuesAcrossUpcLines: s.fixedSerialContinuesAcrossUpcLines,
      }),
      ...(s.handheldSerialContinuesAcrossUpcLines !== undefined && {
        handheldSerialContinuesAcrossUpcLines: s.handheldSerialContinuesAcrossUpcLines,
      }),
    })
  } else if (s.serialContinuesAcrossUpcLines !== undefined) {
    setters.setSettings({
      fixedSerialContinuesAcrossUpcLines: s.serialContinuesAcrossUpcLines,
      handheldSerialContinuesAcrossUpcLines: s.serialContinuesAcrossUpcLines,
    })
  }
}
