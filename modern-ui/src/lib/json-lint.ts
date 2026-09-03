export interface JsonLintError {
  message: string
  position: number
  line: number
  column: number
}

export interface JsonStats {
  bytes: number
  characters: number
  lines: number
  keys: number
  arrays: number
  objects: number
  maxDepth: number
  rootType: string
}

export type JsonLintResult =
  | { ok: true; value: unknown; stats: JsonStats }
  | { ok: false; error: JsonLintError }

export function positionToLineCol(text: string, position: number): { line: number; column: number } {
  const clamped = Math.max(0, Math.min(position, text.length))
  let line = 1
  let lastBreak = -1
  for (let i = 0; i < clamped; i++) {
    if (text.charCodeAt(i) === 10) {
      line++
      lastBreak = i
    }
  }
  return { line, column: clamped - lastBreak }
}

export function parseJsonErrorPosition(message: string, text: string): number {
  const atPos = message.match(/at position (\d+)/i)
  if (atPos) return Number(atPos[1])
  const lineCol = message.match(/line (\d+) column (\d+)/i)
  if (lineCol) {
    const targetLine = Number(lineCol[1])
    const targetCol = Number(lineCol[2])
    let line = 1
    let col = 1
    for (let i = 0; i < text.length; i++) {
      if (line === targetLine && col === targetCol) return i
      if (text.charCodeAt(i) === 10) {
        line++
        col = 1
      } else {
        col++
      }
    }
    return text.length
  }
  return 0
}

function walkStats(value: unknown, depth: number, acc: { keys: number; arrays: number; objects: number; maxDepth: number }) {
  acc.maxDepth = Math.max(acc.maxDepth, depth)
  if (Array.isArray(value)) {
    acc.arrays++
    for (const item of value) walkStats(item, depth + 1, acc)
    return
  }
  if (value && typeof value === 'object') {
    acc.objects++
    const entries = Object.entries(value as Record<string, unknown>)
    acc.keys += entries.length
    for (const [, child] of entries) walkStats(child, depth + 1, acc)
  }
}

export function collectJsonStats(text: string, value: unknown): JsonStats {
  const acc = { keys: 0, arrays: 0, objects: 0, maxDepth: 0 }
  walkStats(value, 1, acc)
  const lines = text.length === 0 ? 0 : text.split(/\r\n|\n|\r/).length
  return {
    bytes: new TextEncoder().encode(text).length,
    characters: text.length,
    lines,
    keys: acc.keys,
    arrays: acc.arrays,
    objects: acc.objects,
    maxDepth: acc.maxDepth,
    rootType: Array.isArray(value) ? 'array' : value === null ? 'null' : typeof value,
  }
}

export function analyzeJson(text: string): JsonLintResult {
  const trimmed = text.trim()
  if (!trimmed) {
    return {
      ok: false,
      error: { message: 'Empty — paste or drop a JSON document', position: 0, line: 1, column: 1 },
    }
  }
  try {
    const value = JSON.parse(text) as unknown
    return { ok: true, value, stats: collectJsonStats(text, value) }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const position = parseJsonErrorPosition(message, text)
    const { line, column } = positionToLineCol(text, position)
    return { ok: false, error: { message, position, line, column } }
  }
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue)
  if (value && typeof value === 'object') {
    const sorted: Record<string, unknown> = {}
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      sorted[key] = sortValue((value as Record<string, unknown>)[key])
    }
    return sorted
  }
  return value
}

export function prettifyJson(text: string, indent = 2): string {
  const result = analyzeJson(text)
  if (!result.ok) throw new Error(result.error.message)
  return JSON.stringify(result.value, null, indent) + '\n'
}

export function minifyJson(text: string): string {
  const result = analyzeJson(text)
  if (!result.ok) throw new Error(result.error.message)
  return JSON.stringify(result.value)
}

export function sortJsonKeys(text: string, indent = 2): string {
  const result = analyzeJson(text)
  if (!result.ok) throw new Error(result.error.message)
  return JSON.stringify(sortValue(result.value), null, indent) + '\n'
}

/** Strip comments and trailing commas so messy payloads can often be parsed. */
export function repairJson(text: string): string {
  let out = ''
  let i = 0
  let inString = false
  let escape = false
  while (i < text.length) {
    const ch = text[i]
    if (inString) {
      out += ch
      if (escape) {
        escape = false
      } else if (ch === '\\') {
        escape = true
      } else if (ch === '"') {
        inString = false
      }
      i++
      continue
    }
    if (ch === '"') {
      inString = true
      out += ch
      i++
      continue
    }
    if (ch === '/' && text[i + 1] === '/') {
      while (i < text.length && text[i] !== '\n') i++
      continue
    }
    if (ch === '/' && text[i + 1] === '*') {
      i += 2
      while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) i++
      i += 2
      continue
    }
    out += ch
    i++
  }
  out = out.replace(/,\s*([}\]])/g, '$1')
  return prettifyJson(out)
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(2)} MB`
}

export const SAMPLE_JSON = `{
  "00": "1",
  "03": "1",
  "04": "1253",
  "05": "640",
  "06": "100",
  "07": "38",
  "10": "6",
  "items": [
    { "epc": "1048C088004C3250027282210414F641", "qty": 1 }
  ]
}
`
