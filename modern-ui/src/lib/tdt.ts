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

interface TdtArtefactField {
  name: string
  length?: number
  characterSet?: string
  seq?: number
}

interface TdtArtefactOption {
  optionKey?: string
  pattern?: string
  grammar?: string
  aiSequence?: string[]
  field?: TdtArtefactField[]
}

interface TdtArtefactLevel {
  type: string
  prefixMatch?: string
  requiredFormattingParameters?: string
  requiredParsingParameters?: string
  option?: TdtArtefactOption[]
}

interface TdtArtefactScheme {
  name?: string
  optionKey?: string
  level?: TdtArtefactLevel[]
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
  schemes?: () => string[]
  hex2bin?: (s: string) => string
  /** Loaded TDT JSON artefacts (present after initialized). */
  tdtData?: {
    scheme?: Record<string, Record<string, { scheme: TdtArtefactScheme }>>
  }
}

export interface TdtSchemeField {
  name: string
  label: string
  length?: number
  characterSet?: string
  placeholder: string
}

export interface TdtSchemeInputs {
  scheme: string
  fields: TdtSchemeField[]
  /** GS1 AI codes in field order, when the scheme has a GS1_AI_JSON level. */
  aiSequence: string[]
  optionKey?: string
  requiresGcpLength: boolean
  hasFilter: boolean
  /** Identifier-level examples derived from the scheme's TDT fields. */
  examples: Array<{ label: string; value: string }>
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

export async function tdtListSchemes(): Promise<string[]> {
  const t = await getTdtTranslator()
  return (t.schemes?.() ?? []).sort((a, b) => a.localeCompare(b))
}

const TDT_CONTAINER = 'tdt:epcTagDataTranslation'

const SAMPLE_FIELD_VALUES: Record<string, string> = {
  gtin: '09521234123453',
  serial: '123',
  prodDate: '240101',
  sscc: '006141411234567890',
  grai: '09521234123453123',
  graiprefix: '061414112345',
  valueOf8003: '0061414112345123',
  giai: '9521234ABC123',
  gln: '0614141123452',
  itip: '095212341234531201',
  gcn: '0614141123452123',
  sgcnprefix: '0614141123452',
  gdtiprefix: '061414112345',
  gdti: '0614141123452123',
  gsrn: '061414112345678901',
  gsrnp: '061414112345678901',
  cpi: '12345.ABC',
  cpiserial: '1',
  cageordodaac: '2S194',
  cage: '2S194',
  urnEncodedSerial: '12345',
  generalmanager: '5',
  objectclass: '1',
  gs1companyprefix: '9521234',
  indassetref: 'ABC123',
}

function humanizeFieldName(name: string): string {
  const known: Record<string, string> = {
    gtin: 'GTIN',
    sscc: 'SSCC',
    grai: 'GRAI',
    graiprefix: 'GRAI prefix',
    valueOf8003: 'GRAI (AI 8003)',
    giai: 'GIAI',
    gln: 'GLN',
    itip: 'ITIP',
    gcn: 'GCN',
    gdti: 'GDTI',
    gdtiprefix: 'GDTI prefix',
    gsrn: 'GSRN',
    gsrnp: 'GSRN — Provider',
    cpi: 'CPI',
    cpiserial: 'CPI serial',
    sgcnprefix: 'SGCN prefix',
    cageordodaac: 'CAGE / DoDAAC',
    cage: 'CAGE',
    urnEncodedSerial: 'Serial (URN-encoded)',
    generalmanager: 'General manager',
    objectclass: 'Object class',
    serial: 'Serial number',
    prodDate: 'Production date',
    indassetref: 'Individual asset ref',
    gs1companyprefix: 'GS1 company prefix',
  }
  if (known[name]) return known[name]
  return name
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

function sampleValueForField(field: TdtArtefactField): string {
  if (SAMPLE_FIELD_VALUES[field.name]) return SAMPLE_FIELD_VALUES[field.name]
  if (field.characterSet?.includes('0-9') && !/[A-Za-z]/.test(field.characterSet)) {
    const len = Math.min(field.length ?? 6, 12)
    return '1'.padStart(Math.max(len, 1), '0')
  }
  return 'ABC123'
}

/** Build a bare-identifier string from TDT field values (`gtin=…;serial=…`). */
export function buildTdtBareIdentifier(values: Record<string, string>): string {
  return Object.entries(values)
    .filter(([, v]) => (v ?? '').trim().length > 0)
    .map(([name, v]) => `${name}=${v.trim()}`)
    .join(';')
}

/** Build a GS1 AI JSON string when the scheme exposes an AI sequence. */
export function buildTdtAiJson(
  aiSequence: string[],
  fields: TdtSchemeField[],
  values: Record<string, string>,
): string | null {
  if (!aiSequence.length || aiSequence.length > fields.length) return null
  const obj: Record<string, string> = {}
  for (let i = 0; i < aiSequence.length; i++) {
    const v = (values[fields[i].name] ?? '').trim()
    if (!v) return null
    obj[aiSequence[i]] = v
  }
  return JSON.stringify(obj)
}

function pickLevelFields(levels: TdtArtefactLevel[] | undefined): {
  fields: TdtArtefactField[]
  aiSequence: string[]
  requiresGcpLength: boolean
  hasFilter: boolean
  optionKey?: string
} | null {
  if (!levels?.length) return null
  const bare = levels.find((l) => l.type === 'BARE_IDENTIFIER')
  const aiJson = levels.find((l) => l.type === 'GS1_AI_JSON')
  const pure = levels.find((l) => l.type === 'PURE_IDENTITY')
  const tag = levels.find((l) => l.type === 'TAG_ENCODING')
  const binary = levels.find((l) => l.type === 'BINARY')

  const source =
    bare?.option?.[0]?.field?.length ? bare.option[0]
      : aiJson?.option?.[0]?.field?.length ? aiJson.option[0]
        : pure?.option?.[0]?.field?.length ? pure.option[0]
          : tag?.option?.[0]?.field?.length ? tag.option[0]
            : null
  if (!source?.field?.length) return null

  // Skip filter in identity/tag field lists — it's an encode option, not a key field.
  const fields = source.field.filter((f) => f?.name && f.name !== 'filter')
  if (!fields.length) return null

  return {
    fields,
    aiSequence: aiJson?.option?.[0]?.aiSequence?.filter(Boolean) ?? [],
    requiresGcpLength:
      (bare?.requiredParsingParameters ?? '').includes('gs1companyprefixlength'),
    hasFilter:
      (binary?.requiredFormattingParameters ?? '').includes('filter') ||
      binary?.option?.[0]?.field?.some((f) => f.name === 'filter') === true,
    optionKey: undefined,
  }
}

/**
 * Read encode-time input fields for a TDT scheme from the loaded artefacts.
 * Prefers BARE_IDENTIFIER, then GS1_AI_JSON, then PURE_IDENTITY / TAG_ENCODING
 * so every scheme (including ADI-var) can drive the quick-fields UI.
 */
export async function tdtGetSchemeInputs(schemeName: string): Promise<TdtSchemeInputs | null> {
  const scheme = schemeName.trim()
  if (!scheme) return null

  const t = await getTdtTranslator()
  const root = t.tdtData?.scheme?.[scheme]?.[TDT_CONTAINER]?.scheme
  if (!root?.level?.length) return null

  const picked = pickLevelFields(root.level)
  if (!picked) return null

  const requiresGcpLength =
    root.optionKey === 'gs1companyprefixlength' || picked.requiresGcpLength

  const seen = new Set<string>()
  const fields: TdtSchemeField[] = []
  for (const f of picked.fields) {
    if (seen.has(f.name)) continue
    seen.add(f.name)
    const sample = sampleValueForField(f)
    fields.push({
      name: f.name,
      label: humanizeFieldName(f.name),
      length: f.length,
      characterSet: f.characterSet,
      placeholder: f.length ? `e.g. ${sample} (${f.length} chars)` : `e.g. ${sample}`,
    })
  }
  if (!fields.length) return null

  const sampleValues: Record<string, string> = {}
  for (const f of fields) sampleValues[f.name] = sampleValueForField(f)

  const examples: Array<{ label: string; value: string }> = []
  const bareId = buildTdtBareIdentifier(sampleValues)
  if (bareId) examples.push({ label: 'Bare ID', value: bareId })
  const ai = buildTdtAiJson(picked.aiSequence, fields, sampleValues)
  if (ai) examples.push({ label: 'AI JSON', value: ai })

  return {
    scheme,
    fields,
    aiSequence: picked.aiSequence,
    optionKey: root.optionKey,
    requiresGcpLength,
    hasFilter: picked.hasFilter,
    examples,
  }
}

function pickTdtScheme(
  detected: TdtDetectedScheme[],
  forced?: string,
): TdtDetectedScheme | undefined {
  const scheme = forced?.trim()
  if (!scheme) {
    return (
      detected.find((d) => (d.detectedGCPLength ?? -1) > 0) ||
      detected[0]
    )
  }
  return detected.find((d) => d.scheme === scheme) ?? { scheme, level: detected[0]?.level ?? '' }
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
  const forced = overrides.scheme?.trim()
  if (!detected.length && !forced) {
    return { ok: false, error: 'No TDT scheme matched this input', detected }
  }

  const known = t.schemes?.() ?? []
  if (forced && known.length && !known.includes(forced)) {
    return { ok: false, error: `Unknown scheme: ${forced}`, detected }
  }

  const chosen = pickTdtScheme(detected, forced)
  if (!chosen) {
    return { ok: false, error: 'No TDT scheme matched this input', detected }
  }

  const inputLevel = detected[0]?.level ?? chosen.level

  const baseOptions: Record<string, unknown> = {
    filter: overrides.filter ?? 0,
    uriStem: overrides.uriStem ?? 'https://id.gs1.org',
    gs1companyprefixlength:
      overrides.gcpLength ?? chosen.detectedGCPLength ?? -1,
  }

  // Apply autodetected optionKey only when caller didn't set gcpLength (optionKey would clobber it).
  const options: Record<string, unknown> = { ...baseOptions }
  if (overrides.gcpLength === undefined) {
    if (chosen.optionKey?.property && chosen.optionKey.property !== chosen.optionKey.value) {
      options[chosen.optionKey.property] = chosen.optionKey.value
    }
    if (
      chosen.optionKey?.property === 'gs1companyprefixlength' &&
      PROVIDES_GCP_LENGTH.has(inputLevel)
    ) {
      options.gs1companyprefixlength = chosen.optionKey.value
    }
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
  const forced = overrides.scheme?.trim()
  if (!detected.length && !forced) {
    return { ok: false, error: 'No TDT scheme matched this input' }
  }

  const known = t.schemes?.() ?? []
  if (forced && known.length && !known.includes(forced)) {
    return { ok: false, error: `Unknown scheme: ${forced}` }
  }

  const chosen = pickTdtScheme(detected, forced)
  if (!chosen) return { ok: false, error: 'No TDT scheme matched this input' }

  const options: Record<string, unknown> = {
    filter: overrides.filter ?? 0,
    uriStem: overrides.uriStem ?? 'https://id.gs1.org',
    gs1companyprefixlength: overrides.gcpLength ?? chosen.detectedGCPLength ?? -1,
  }
  // ponytail: autodetect optionKey loses to explicit gcpLength (e.g. all-zero GTIN → wrong partition)
  if (
    overrides.gcpLength === undefined &&
    chosen.optionKey?.property &&
    chosen.optionKey.property !== chosen.optionKey.value
  ) {
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
