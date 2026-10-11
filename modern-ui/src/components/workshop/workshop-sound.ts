let audio: AudioContext | null = null

function context(): AudioContext | null {
  const AC =
    typeof window === 'undefined'
      ? undefined
      : window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!AC) return null
  if (!audio) {
    try {
      audio = new AC()
    } catch {
      return null
    }
  }
  if (audio.state === 'suspended') void audio.resume().catch(() => {})
  return audio
}

function tone(ac: AudioContext, freq: number, start: number, duration: number, volume: number, type: OscillatorType) {
  const osc = ac.createOscillator()
  const gain = ac.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, start)
  gain.gain.setValueAtTime(0.0001, start)
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.008)
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration)
  osc.connect(gain).connect(ac.destination)
  osc.start(start)
  osc.stop(start + duration + 0.05)
}

/** Handbell: a fundamental plus the slightly inharmonic partials that make it read as metal. */
function bell(ac: AudioContext, freq: number, start: number, volume: number) {
  tone(ac, freq, start, 1.6, volume, 'sine')
  tone(ac, freq * 2.01, start, 0.9, volume * 0.45, 'sine')
  tone(ac, freq * 2.76, start, 0.6, volume * 0.25, 'sine')
  tone(ac, freq * 5.4, start, 0.25, volume * 0.12, 'sine')
}

export function playBell() {
  const ac = context()
  if (!ac) return
  const now = ac.currentTime
  bell(ac, 1046.5, now, 0.07)
  bell(ac, 1318.5, now + 0.14, 0.05)
}

export function playPop() {
  const ac = context()
  if (!ac) return
  const now = ac.currentTime
  const osc = ac.createOscillator()
  const gain = ac.createGain()
  osc.type = 'triangle'
  osc.frequency.setValueAtTime(520, now)
  osc.frequency.exponentialRampToValueAtTime(1180, now + 0.09)
  gain.gain.setValueAtTime(0.0001, now)
  gain.gain.exponentialRampToValueAtTime(0.08, now + 0.01)
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.16)
  osc.connect(gain).connect(ac.destination)
  osc.start(now)
  osc.stop(now + 0.2)
  bell(ac, 2093, now + 0.05, 0.025)
}

export function playFanfare() {
  const ac = context()
  if (!ac) return
  const now = ac.currentTime
  ;[1046.5, 1318.5, 1568, 2093].forEach((f, i) => bell(ac, f, now + i * 0.11, 0.05))
}

function sweep(ac: AudioContext, from: number, to: number, start: number, duration: number, volume: number, type: OscillatorType) {
  const osc = ac.createOscillator()
  const gain = ac.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(from, start)
  osc.frequency.exponentialRampToValueAtTime(to, start + duration)
  gain.gain.setValueAtTime(0.0001, start)
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.008)
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration)
  osc.connect(gain).connect(ac.destination)
  osc.start(start)
  osc.stop(start + duration + 0.05)
}

/** Present opening, richer for rarer loot: 0 common … 4 legendary. */
export function playLoot(tier: number) {
  const ac = context()
  if (!ac) return
  const now = ac.currentTime
  if (tier <= 0) {
    playPop()
    return
  }
  sweep(ac, 520, 1180, now, 0.12, 0.07, 'triangle')
  const notes = [
    [1318.5, 1568],
    [1046.5, 1318.5, 1568],
    [1046.5, 1318.5, 1568, 2093],
    [784, 1046.5, 1318.5, 1568, 2093, 2637],
  ][Math.min(3, tier - 1)]
  notes.forEach((f, i) => bell(ac, f, now + 0.06 + i * 0.09, 0.045))
  if (tier >= 4) [3136, 3520, 4186].forEach((f, i) => tone(ac, f, now + 0.7 + i * 0.05, 0.4, 0.02, 'sine'))
}

/** A soft two-step blip for someone else's chat bubble. */
export function playBlip() {
  const ac = context()
  if (!ac) return
  const now = ac.currentTime
  tone(ac, 880, now, 0.06, 0.035, 'square')
  tone(ac, 1320, now + 0.05, 0.08, 0.03, 'square')
}

export function playThrow() {
  const ac = context()
  if (!ac) return
  sweep(ac, 900, 260, ac.currentTime, 0.18, 0.05, 'triangle')
}

export function playSplat() {
  const ac = context()
  if (!ac) return
  const now = ac.currentTime
  sweep(ac, 300, 70, now, 0.16, 0.08, 'sawtooth')
  sweep(ac, 1400, 500, now, 0.06, 0.03, 'square')
}

export function playChime() {
  const ac = context()
  if (!ac) return
  const now = ac.currentTime
  bell(ac, 1568, now, 0.05)
  bell(ac, 2093, now + 0.12, 0.05)
  bell(ac, 2637, now + 0.24, 0.04)
}

export function playUnlock() {
  const ac = context()
  if (!ac) return
  const now = ac.currentTime
  ;[784, 988, 1175, 1568].forEach((f, i) => tone(ac, f, now + i * 0.07, 0.22, 0.05, 'square'))
  bell(ac, 2093, now + 0.3, 0.04)
}
