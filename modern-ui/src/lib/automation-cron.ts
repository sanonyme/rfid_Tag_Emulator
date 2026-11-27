/**
 * Lightweight 5-field cron expression parser, matcher, and next-run calculator
 * (`minute hour dayOfMonth month dayOfWeek`), with zero external dependencies.
 */

export interface CronPreset {
  label: string
  expr: string
}

export const CRON_PRESETS: CronPreset[] = [
  { label: 'Every min', expr: '* * * * *' },
  { label: 'Every 5m', expr: '*/5 * * * *' },
  { label: 'Every 15m', expr: '*/15 * * * *' },
  { label: 'Hourly', expr: '0 * * * *' },
  { label: 'Daily 09:00', expr: '0 9 * * *' },
  { label: 'Weekdays 08:30', expr: '30 8 * * 1-5' },
]

function parseFieldSegment(
  segment: string,
  min: number,
  max: number,
  mapValue?: (n: number) => number,
): Set<number> | null {
  const trimmed = segment.trim()
  if (!trimmed) return null

  const out = new Set<number>()
  const parts = trimmed.split(',')

  for (const part of parts) {
    const p = part.trim()
    if (!p) return null

    const [rangePart, stepPart] = p.split('/')
    if (p.split('/').length > 2) return null

    const step = stepPart !== undefined ? Number(stepPart) : 1
    if (!Number.isInteger(step) || step < 1) return null

    let start: number
    let end: number

    if (rangePart === '*') {
      start = min
      end = max
    } else if (rangePart.includes('-')) {
      const [aStr, bStr] = rangePart.split('-')
      if (rangePart.split('-').length !== 2 || !aStr || !bStr) return null
      const a = Number(aStr)
      const b = Number(bStr)
      if (!Number.isInteger(a) || !Number.isInteger(b) || a < min || b > max || a > b) {
        return null
      }
      start = a
      end = b
    } else {
      const val = Number(rangePart)
      if (!Number.isInteger(val) || val < min || val > max) return null
      start = val
      end = stepPart !== undefined ? max : val
    }

    for (let v = start; v <= end; v += step) {
      out.add(mapValue ? mapValue(v) : v)
    }
  }

  return out.size > 0 ? out : null
}

interface ParsedCron {
  minutes: Set<number>
  hours: Set<number>
  daysOfMonth: Set<number>
  months: Set<number>
  daysOfWeek: Set<number>
}

function parseCron(expr: string): { parsed: ParsedCron; error?: undefined } | { parsed?: undefined; error: string } {
  const fields = String(expr || '').trim().split(/\s+/).filter(Boolean)
  if (fields.length !== 5) {
    return { error: 'Expected 5 space-separated fields: min hour day month weekday' }
  }

  const minutes = parseFieldSegment(fields[0]!, 0, 59)
  if (!minutes) return { error: `Invalid minute field "${fields[0]}" (0–59)` }

  const hours = parseFieldSegment(fields[1]!, 0, 23)
  if (!hours) return { error: `Invalid hour field "${fields[1]}" (0–23)` }

  const daysOfMonth = parseFieldSegment(fields[2]!, 1, 31)
  if (!daysOfMonth) return { error: `Invalid day-of-month field "${fields[2]}" (1–31)` }

  const months = parseFieldSegment(fields[3]!, 1, 12)
  if (!months) return { error: `Invalid month field "${fields[3]}" (1–12)` }

  const daysOfWeek = parseFieldSegment(fields[4]!, 0, 7, (n) => (n === 7 ? 0 : n))
  if (!daysOfWeek) return { error: `Invalid day-of-week field "${fields[4]}" (0–7)` }

  return { parsed: { minutes, hours, daysOfMonth, months, daysOfWeek } }
}

export function validateCronExpression(expr: string): { valid: boolean; error?: string } {
  const res = parseCron(expr)
  return res.parsed ? { valid: true } : { valid: false, error: res.error }
}

export function matchesCron(expr: string, date: Date): boolean {
  const { parsed } = parseCron(expr)
  if (!parsed) return false
  return (
    parsed.minutes.has(date.getMinutes()) &&
    parsed.hours.has(date.getHours()) &&
    parsed.daysOfMonth.has(date.getDate()) &&
    parsed.months.has(date.getMonth() + 1) &&
    parsed.daysOfWeek.has(date.getDay())
  )
}

/**
 * Find the next Date strictly after `from` (minute precision) matching `expr`.
 * Scans at most 366 days forward; returns `null` if invalid or unmatched.
 */
export function getNextCronDate(expr: string, from: Date = new Date()): Date | null {
  const { parsed } = parseCron(expr)
  if (!parsed) return null

  const candidate = new Date(from.getTime())
  candidate.setSeconds(0, 0)
  candidate.setMinutes(candidate.getMinutes() + 1)

  const maxMinutes = 366 * 24 * 60
  for (let i = 0; i < maxMinutes; i++) {
    if (
      parsed.months.has(candidate.getMonth() + 1) &&
      parsed.daysOfMonth.has(candidate.getDate()) &&
      parsed.daysOfWeek.has(candidate.getDay()) &&
      parsed.hours.has(candidate.getHours()) &&
      parsed.minutes.has(candidate.getMinutes())
    ) {
      return candidate
    }
    candidate.setMinutes(candidate.getMinutes() + 1)
  }
  return null
}

/** Format a stable minute key (`YYYY-MM-DD HH:mm`) for deduplicating cron fires. */
export function cronMinuteKey(date: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())} ${p(date.getHours())}:${p(date.getMinutes())}`
}
