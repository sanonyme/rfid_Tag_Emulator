/**
 * Line iterators that avoid `String.split()` on huge tag lists.
 * Splitting multi-million-line pastes allocates a massive array and can OOM the renderer.
 */

/** Non-blank lines from trimmed list text (UPC/EPC compact lists). */
export function* iterateNonBlankLines(text: string): Generator<string> {
  const trimmed = text.trim()
  if (!trimmed) return
  let start = 0
  const len = trimmed.length
  for (let i = 0; i <= len; i++) {
    if (i === len || trimmed[i] === '\n') {
      let end = i
      if (end > start && trimmed[end - 1] === '\r') end--
      const line = trimmed.slice(start, end).trim()
      if (line) yield line
      start = i + 1
    }
  }
}

/** Every source line with 1-based lineNumber (blank lines included, trimmed payload). */
export function* iterateSourceLines(text: string): Generator<{ lineNumber: number; trimmed: string }> {
  const raw = text ?? ''
  if (!raw) return
  let lineNumber = 0
  let start = 0
  const len = raw.length
  for (let i = 0; i <= len; i++) {
    if (i === len || raw[i] === '\n') {
      lineNumber++
      let end = i
      if (end > start && raw[end - 1] === '\r') end--
      yield { lineNumber, trimmed: raw.slice(start, end).trim() }
      start = i + 1
    }
  }
}
