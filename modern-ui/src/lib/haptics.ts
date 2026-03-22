import { Capacitor } from '@capacitor/core'
import { Haptics, ImpactStyle } from '@capacitor/haptics'

async function safeCall(fn: () => Promise<void>, label?: string) {
  try {
    await fn()
  } catch (err) {
    if (label) {
      console.warn(`[haptics] ${label} failed:`, err)
    } else {
      console.warn('[haptics] failed:', err)
    }
  }
}

function canVibrate() {
  return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function'
}

async function impact(style: ImpactStyle, fallbackMs?: number) {
  // Prefer the native haptics plugin, but fall back to Web vibrate
  // (helpful if Capacitor platform detection is off).
  if (Capacitor.isNativePlatform()) {
    await safeCall(() => Haptics.impact({ style }), `impact(${style})`)
    return
  }

  if (canVibrate() && fallbackMs && fallbackMs > 0) {
    try {
      navigator.vibrate(fallbackMs)
    } catch {
      // ignore
    }
  }
}

export async function hapticButton() {
  await impact(ImpactStyle.Medium, 12)
}

export async function hapticConnect() {
  await impact(ImpactStyle.Medium, 20)
}

export async function hapticDisconnect() {
  await impact(ImpactStyle.Heavy, 30)
}

export async function hapticSliderTick() {
  // Throttle outside this function; this function should be cheap.
  await safeCall(() => Haptics.selectionChanged(), 'selectionChanged')
}

export async function hapticSliderStart() {
  await safeCall(() => Haptics.selectionStart(), 'selectionStart')
}

export async function hapticSliderEnd() {
  await safeCall(() => Haptics.selectionEnd(), 'selectionEnd')
}

