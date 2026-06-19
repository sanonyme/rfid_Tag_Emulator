/** Simple sound effects using Web Audio API - no external files */

let audioContext: AudioContext | null = null

function getContext(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (!audioContext) {
    try {
      audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()
    } catch {
      return null
    }
  }
  return audioContext
}

function beep(frequency: number, duration: number, type: OscillatorType = 'sine'): void {
  const ctx = getContext()
  if (!ctx) return
  try {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.frequency.value = frequency
    osc.type = type
    gain.gain.setValueAtTime(0.1, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration)
    osc.start(ctx.currentTime)
    osc.stop(ctx.currentTime + duration)
  } catch {
    /* Web Audio unavailable */
  }
}

export function playSuccess(): void {
  if (!loadSettings().soundEnabled) return
  beep(523, 0.1)
  setTimeout(() => beep(659, 0.1), 80)
  setTimeout(() => beep(784, 0.15), 160)
}

export function playError(): void {
  if (!loadSettings().soundEnabled) return
  beep(200, 0.2, 'square')
  setTimeout(() => beep(150, 0.25, 'square'), 150)
}

export function playConnect(): void {
  if (!loadSettings().soundEnabled) return
  beep(440, 0.08)
  setTimeout(() => beep(554, 0.12), 100)
}

export function playDisconnect(): void {
  if (!loadSettings().soundEnabled) return
  beep(400, 0.1)
  setTimeout(() => beep(300, 0.15), 80)
}

import { loadSettings } from './settings'
