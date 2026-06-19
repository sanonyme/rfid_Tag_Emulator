// GS1 Tag Data Translation (TDT) wrapper for the Decoder app.
//
// Loads `TDTtranslator.js` next to the app HTML (public/ → dist/), from sanonyme/TDT:
// expects global JSZip and fetches `./TDT_JSON_artefacts.zip` + `./gcpprefixformatlist.json`
// and exposes a clean, typed API mirroring the upstream demo's usage pattern:
//
//   let detected = myTDTencoder.autodetect(input);
//   let inputLevel = detected[0].level;
//   for (match of detected) {
//     for (level of match.supportedLevels) {
//       myTDTencoder.translate(input, match.scheme, level, options);
//     }
//   }

import JSZip from 'jszip'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TdtOutputLevel =
  | 'BINARY'
  | 'HEX'
  | 'PURE_IDENTITY'
  | 'TAG_ENCODING'
  | 'LEGACY'
  | 'GS1_DIGITAL_LINK'
  | 'GS1_AI_JSON'
  | 'BARE_IDENTIFIER'
  | 'TEI'

export interface TdtDetectedScheme {
  scheme: string
  level: string
  optionKey?: { property: string; value: string }
  supportedLevels?: string[]
  detectedGCPLength?: number
}

interface TDTtranslatorInstance {
  initialized: Promise<unknown>
  processData?: () => void
  autodetect: (inputString: string) => TdtDetectedScheme[] | undefined
  translate: (
    inputString: string,
    scheme: string,
    outputLevel: string,
    options?: Record<string, unknown>
  ) => string | undefined
  hex2bin?: (s: string) => string
}

declare global {
  interface Window {
    JSZip?: unknown
    TDTtranslator?: new () => TDTtranslatorInstance
  }
}

export interface TdtAi {
  ai: string
  label: string
  value: string
}

export interface TdtDecodeResult {
  scheme: string
  inputLevel: string
  detectedGCPLength?: number
  detectedSchemes: TdtDetectedScheme[]
  outputs: Partial<Record<TdtOutputLevel, string>>
  ais: TdtAi[]
  /** When the input was hex, this is the binary-equivalent string for visualisers. */
  binary?: string
  /** Trimmed input. */
  input: string
}

// ---------------------------------------------------------------------------
// Loader
// ---------------------------------------------------------------------------

let scriptPromise: Promise<void> | null = null
let translatorPromise: Promise<TDTtranslatorInstance> | null = null

function ensureGlobals() {
  if (typeof window === 'undefined') return
  if (!window.JSZip) {
    (window as unknown as { JSZip: unknown }).JSZip = JSZip
  }
}

/** Same folder as the app HTML — required when `vite.config` uses `base: './'` / `file:` (Electron). */
function tdtTranslatorScriptUrl(): string {
  if (typeof document === 'undefined') return './TDTtranslator.js'
  return new URL('TDTtranslator.js', document.baseURI).href
}

function loadScriptOnce(src: string): Promise<void> {
  if (scriptPromise) return scriptPromise
  scriptPromise = new Promise<void>((resolve, reject) => {
    if (typeof document === 'undefined') {
      reject(new Error('TDT translator requires a browser environment'))
      return
    }
    if (window.TDTtranslator) {
      resolve()
      return
    }
    const el = document.createElement('script')
    el.src = src
    el.async = true
    el.onload = () => resolve()
    el.onerror = () => reject(new Error(`Failed to load ${src}`))
    document.head.appendChild(el)
  })
  return scriptPromise
}

/** Load the translator + artefacts. Safe to call many times; caches the instance. */
export async function getTdtTranslator(): Promise<TDTtranslatorInstance> {
  if (translatorPromise) return translatorPromise
  translatorPromise = (async () => {
    ensureGlobals()
    await loadScriptOnce(tdtTranslatorScriptUrl())
    if (!window.TDTtranslator) throw new Error('TDTtranslator did not register on window')
    const t = new window.TDTtranslator()
    await t.initialized
    try { t.processData?.() } catch { /* ignore */ }
    return t
  })()
  return translatorPromise
}

/** Pre-warm the translator at app startup so the first decode is instant. */
export function prewarmTdt(): void {
  void getTdtTranslator().catch(() => { /* surfaced again at first use */ })
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const HEX_RE = /^[0-9A-Fa-f]+$/
const BINARY_RE = /^[01]+$/

function cleanInput(raw: string): string {
  return (raw || '').trim()
}

function hexToBinary(hex: string): string {
  let out = ''
  for (const c of hex) out += parseInt(c, 16).toString(2).padStart(4, '0')
  return out
}

const AI_LABELS: Record<string, string> = {
  '00': 'SSCC',
  '01': 'GTIN',
  '02': 'GTIN of contained items',
  '10': 'Batch / Lot',
  '11': 'Production date',
  '12': 'Due date',
  '13': 'Packaging date',
  '15': 'Best before',
  '16': 'Sell by',
  '17': 'Expiration date',
  '20': 'Variant',
  '21': 'Serial number',
  '22': 'CPV',
  '240': 'Additional ID',
  '241': 'Customer part no.',
  '242': 'Made-to-order variation',
  '243': 'Component / Part',
  '250': 'Secondary serial',
  '251': 'Source identifier',
  '253': 'GDTI',
  '254': 'GLN extension',
  '255': 'GCN',
  '30': 'Variable count',
  '37': 'Count of trade items',
  '400': 'Customer PO',
  '401': 'GINC',
  '402': 'GSIN',
  '410': 'Ship-to GLN',
  '411': 'Bill-to GLN',
  '412': 'Purchased-from GLN',
  '414': 'GLN',
  '415': 'Invoicing GLN',
  '417': 'Party GLN',
  '420': 'Ship-to postal',
  '421': 'Ship-to postal+ISO',
  '422': 'Country of origin',
  '423': 'Country of processing',
  '8003': 'GRAI',
  '8004': 'GIAI',
  '8005': 'Price per unit',
  '8006': 'ITIP',
  '8010': 'CPID',
  '8011': 'CPID serial',
  '8017': 'GSRN provider',
  '8018': 'GSRN recipient',
  '8019': 'SRIN',
}

export function aiLabel(ai: string): string {
  if (AI_LABELS[ai]) return AI_LABELS[ai]
  if (ai.length === 4 && AI_LABELS[ai.slice(0, 3)]) return AI_LABELS[ai.slice(0, 3)]
  return `AI ${ai}`
}

function parseAiJson(json: string | undefined): TdtAi[] {
  if (!json) return []
  try {
    const obj = JSON.parse(json) as Record<string, string>
    return Object.entries(obj).map(([ai, value]) => ({ ai, value, label: aiLabel(ai) }))
  } catch {
    return []
  }
}

// All output levels we want to attempt. Many schemes don't support every level
// — translate() will simply return undefined for unsupported ones, and we skip.
const ALL_LEVELS: TdtOutputLevel[] = [
  'BINARY',
  'HEX',
  'PURE_IDENTITY',
  'TAG_ENCODING',
  'LEGACY',
  'GS1_DIGITAL_LINK',
  'GS1_AI_JSON',
  'BARE_IDENTIFIER',
  'TEI',
]

const PROVIDES_GCP_LENGTH = new Set(['BINARY', 'TAG_ENCODING', 'PURE_IDENTITY'])

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function tdtAutodetect(rawInput: string): Promise<TdtDetectedScheme[]> {
  const t = await getTdtTranslator()
  const input = cleanInput(rawInput)
  if (!input) return []
  return t.autodetect(input) || []
}

/**
 * Decode an input (hex / binary / URN / DL / JSON / bare identifier) by
 * autodetecting the scheme and translating to every supported output level.
 *
 * Mirrors the upstream demo's pattern (sanonyme/TDT/demo/index.html):
 *   - inputLevel = detected[0].level
 *   - for each match, iterate match.supportedLevels and translate to each
 *   - propagate optionKey.property/value into options when present
 */
export async function tdtDecode(
  rawInput: string,
  overrides: { scheme?: string; gcpLength?: number; filter?: number; uriStem?: string } = {}
): Promise<{ ok: true; result: TdtDecodeResult } | { ok: false; error: string; detected?: TdtDetectedScheme[] }> {
  const input = cleanInput(rawInput)
  if (!input) return { ok: false, error: 'Empty input' }

  const t = await getTdtTranslator()
  const detected = (t.autodetect(input) || []).filter((d) => d && d.scheme)
  if (!detected.length) {
    return { ok: false, error: 'No TDT scheme matched this input', detected }
  }

  const inputLevel = detected[0].level

  // Pick the requested scheme, else the first detection. Prefer one that detected GCP length.
  const chosen =
    (overrides.scheme && detected.find((d) => d.scheme === overrides.scheme)) ||
    detected.find((d) => (d.detectedGCPLength ?? -1) > 0) ||
    detected[0]

  const baseOptions: Record<string, unknown> = {
    filter: overrides.filter ?? 0,
    uriStem: overrides.uriStem ?? 'https://id.gs1.org',
    gs1companyprefixlength:
      overrides.gcpLength ?? chosen.detectedGCPLength ?? -1,
  }

  // Apply the matched scheme's optionKey when present, just like the demo does.
  const options: Record<string, unknown> = { ...baseOptions }
  if (chosen.optionKey?.property && chosen.optionKey.property !== chosen.optionKey.value) {
    options[chosen.optionKey.property] = chosen.optionKey.value
  }
  // Some schemes encode their GCP length as the option key value.
  if (
    chosen.optionKey?.property === 'gs1companyprefixlength' &&
    PROVIDES_GCP_LENGTH.has(inputLevel)
  ) {
    options.gs1companyprefixlength = chosen.optionKey.value
  }

  // Translate to every supported level. Use the scheme's `supportedLevels` if
  // available so we don't waste calls; otherwise fall back to ALL_LEVELS.
  const levels = (chosen.supportedLevels?.length ? chosen.supportedLevels : ALL_LEVELS) as TdtOutputLevel[]
  const outputs: Partial<Record<TdtOutputLevel, string>> = {}

  // Always include HEX too (it's BINARY+conversion in the upstream code).
  const targets = new Set<TdtOutputLevel>([...levels, 'HEX'])

  for (const level of targets) {
    if (level === inputLevel) continue
    try {
      const v = t.translate(input, chosen.scheme, level, options)
      if (typeof v === 'string' && v.length > 0) {
        outputs[level] = v
      }
    } catch {
      /* a given scheme may not support every level — skip */
    }
  }

  // Compute binary equivalent when the input is hex (for visualisers).
  let binary: string | undefined
  const hexOnly = input.replace(/[^0-9A-Fa-f]/g, '')
  if (HEX_RE.test(hexOnly) && !BINARY_RE.test(hexOnly) && hexOnly.length === input.length) {
    binary = hexToBinary(hexOnly)
  }

  // Try to ensure GS1_AI_JSON is populated even if the scheme didn't list it,
  // since we use it to derive the AI breakdown.
  if (!outputs.GS1_AI_JSON) {
    try {
      const v = t.translate(input, chosen.scheme, 'GS1_AI_JSON', options)
      if (typeof v === 'string' && v.length > 0) outputs.GS1_AI_JSON = v
    } catch { /* ignore */ }
  }

  const ais = parseAiJson(outputs.GS1_AI_JSON)

  return {
    ok: true,
    result: {
      scheme: chosen.scheme,
      inputLevel,
      detectedGCPLength: chosen.detectedGCPLength,
      detectedSchemes: detected,
      outputs,
      ais,
      binary,
      input,
    },
  }
}

/** Encode an input into a single requested output level (e.g. HEX). */
export async function tdtEncode(
  rawInput: string,
  outputLevel: TdtOutputLevel,
  overrides: { scheme?: string; gcpLength?: number; filter?: number; uriStem?: string } = {}
): Promise<{ ok: true; value: string; scheme: string } | { ok: false; error: string }> {
  const input = cleanInput(rawInput)
  if (!input) return { ok: false, error: 'Empty input' }

  const t = await getTdtTranslator()
  const detected = (t.autodetect(input) || []).filter((d) => d && d.scheme)
  if (!detected.length) return { ok: false, error: 'No TDT scheme matched this input' }

  const chosen =
    (overrides.scheme && detected.find((d) => d.scheme === overrides.scheme)) || detected[0]

  const options: Record<string, unknown> = {
    filter: overrides.filter ?? 0,
    uriStem: overrides.uriStem ?? 'https://id.gs1.org',
    gs1companyprefixlength: overrides.gcpLength ?? chosen.detectedGCPLength ?? -1,
  }
  if (chosen.optionKey?.property && chosen.optionKey.property !== chosen.optionKey.value) {
    options[chosen.optionKey.property] = chosen.optionKey.value
  }

  try {
    const value = t.translate(input, chosen.scheme, outputLevel, options)
    if (!value) return { ok: false, error: `Failed to translate to ${outputLevel}` }
    return { ok: true, value, scheme: chosen.scheme }
  } catch (e) {
    return { ok: false, error: (e as Error).message || 'Translation failed' }
  }
}

// Backwards-compatible wrapper used by older callers.
export async function tdtDecodeFromHex(hexEpc: string) {
  const r = await tdtDecode(hexEpc)
  if (!r.ok) {
    return { error: r.error, detected: r.detected }
  }
  return {
    scheme: r.result.scheme,
    detected: r.result.detectedSchemes,
    digitalLink: r.result.outputs.GS1_DIGITAL_LINK,
    pureIdentity: r.result.outputs.PURE_IDENTITY,
  }
}
