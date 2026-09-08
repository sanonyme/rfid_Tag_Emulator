import { createEngine, type TDTEngine } from '@mimasu/tdt'

export type TdtBridgeOutput =
  | 'BINARY'
  | 'HEX'
  | 'PURE_IDENTITY'
  | 'TAG_ENCODING'
  | 'LEGACY'
  | 'LEGACY_AI'
  | 'BARE_IDENTIFIER'
  | 'GS1_DIGITAL_LINK'
  | 'GS1_AI_JSON'
  | 'TEI'

export interface TdtBridgeOptions {
  filter?: number
  gcpLength?: number
  tagLength?: number
  uriStem?: string
  dataToggle?: number
  scheme?: string
}

export interface TdtBridgeResult {
  ok: true
  input: string
  inputLevel: 'HEX' | 'BINARY' | 'OTHER'
  scheme?: string
  fields: Record<string, string>
  outputs: Partial<Record<TdtBridgeOutput, string>>
}

let enginePromise: Promise<TDTEngine> | null = null

function getEngine(): Promise<TDTEngine> {
  enginePromise ??= createEngine()
  return enginePromise
}

const HEX_RE = /^[0-9A-Fa-f]+$/
const BINARY_RE = /^[01]+$/

/** Output levels that work for classic TDS 1.x schemes. */
const CLASSIC_LEVELS: TdtBridgeOutput[] = [
  'BINARY',
  'PURE_IDENTITY',
  'TAG_ENCODING',
  'BARE_IDENTIFIER',
  'LEGACY',
  'GS1_DIGITAL_LINK',
  'GS1_AI_JSON',
  'TEI',
]

/**
 * `+` / `++` schemes do not define PURE_IDENTITY or TAG_ENCODING —
 * requesting those throws TDTLevelNotFound. Prefer bare / Digital Link.
 */
const PLUS_LEVELS: TdtBridgeOutput[] = [
  'BINARY',
  'BARE_IDENTIFIER',
  'LEGACY',
  'GS1_DIGITAL_LINK',
  'GS1_AI_JSON',
  'TEI',
]

const FIELD_TO_AI: Record<string, string> = {
  gtin: '01',
  sscc: '00',
  gln: '414',
  giai: '8004',
  itip: '8006',
  gsrn: '8018',
  gsrnp: '8017',
  gdti: '253',
  gcn: '255',
  cpi: '8010',
  cpiserial: '8011',
  serial: '21',
}

function cleanInput(raw: string): string {
  return (raw || '').trim()
}

function isPlusScheme(scheme?: string): boolean {
  return Boolean(scheme && /\+{1,2}$/.test(scheme))
}

function inferTagLengthFromScheme(scheme?: string): number | undefined {
  const match = scheme?.match(/-(\d+)$/)
  if (!match) return undefined
  const n = Number(match[1])
  return Number.isFinite(n) ? n : undefined
}

function buildParameterList(options: TdtBridgeOptions = {}): string {
  const pairs: string[] = []
  if (options.scheme) pairs.push(`scheme=${options.scheme}`)
  if (typeof options.filter === 'number') pairs.push(`filter=${options.filter}`)
  if (typeof options.gcpLength === 'number') pairs.push(`gs1companyprefixlength=${options.gcpLength}`)
  if (typeof options.tagLength === 'number') pairs.push(`tagLength=${options.tagLength}`)
  if (typeof options.dataToggle === 'number') pairs.push(`dataToggle=${options.dataToggle}`)
  if (options.uriStem) pairs.push(`uriStem=${options.uriStem}`)
  return pairs.join(';')
}

function normalizeInput(
  engine: TDTEngine,
  input: string,
): { value: string; level: 'HEX' | 'BINARY' | 'OTHER' } {
  if (HEX_RE.test(input) && input.length % 2 === 0 && !BINARY_RE.test(input)) {
    return { value: engine.hexToBinary(input), level: 'HEX' }
  }
  if (BINARY_RE.test(input)) return { value: input, level: 'BINARY' }
  return { value: input, level: 'OTHER' }
}

function safeTranslate(
  engine: TDTEngine,
  input: string,
  params: string,
  level: TdtBridgeOutput,
): string | null {
  try {
    const value = engine.tryTranslate(input, params, level)
    return value && value.length > 0 ? value : null
  } catch {
    return null
  }
}

function safeDetails(
  engine: TDTEngine,
  input: string,
  params: string,
  level: TdtBridgeOutput,
): { output: string; fields: Record<string, string> } | null {
  try {
    return engine.translateDetails(input, params, level)
  } catch {
    return null
  }
}

/** Prefer identity fields; skip engine metadata keys. */
const META_FIELD_KEYS = new Set([
  '1',
  'optionKey',
  'schemeName',
  'dataToggle',
  'filter',
  'tagLength',
  'gs1companyprefixlength',
])

function synthesizeBare(fields: Record<string, string>): string {
  return Object.entries(fields)
    .filter(([k, v]) => v && !META_FIELD_KEYS.has(k))
    .map(([k, v]) => `${k}=${v}`)
    .join(';')
}

function synthesizeAiJson(fields: Record<string, string>): string | undefined {
  const obj: Record<string, string> = {}
  for (const [field, ai] of Object.entries(FIELD_TO_AI)) {
    const value = fields[field]
    if (!value) continue
    // CPI++ uses `serial` for AI 8011 (CPID serial), not 21.
    if (field === 'serial' && fields.cpi) {
      obj['8011'] = value
      continue
    }
    if (field === 'serial' && (fields.gtin || fields.itip)) {
      obj['21'] = value
      continue
    }
    if (field === 'serial' && fields.gln) {
      obj['254'] = value
      continue
    }
    obj[ai] = value
  }
  return Object.keys(obj).length ? JSON.stringify(obj) : undefined
}

function detailLevelsFor(scheme?: string, preferred?: TdtBridgeOutput): TdtBridgeOutput[] {
  const plus = isPlusScheme(scheme)
  const base = plus ? PLUS_LEVELS : CLASSIC_LEVELS
  const ordered = preferred && base.includes(preferred)
    ? [preferred, ...base.filter((l) => l !== preferred)]
    : base
  // Always try BARE first for field extraction on plus schemes.
  if (plus && !ordered.includes('BARE_IDENTIFIER')) {
    return ['BARE_IDENTIFIER', ...ordered]
  }
  if (plus) {
    return ['BARE_IDENTIFIER', ...ordered.filter((l) => l !== 'BARE_IDENTIFIER')]
  }
  return ordered
}

export async function tdtBridgeTranslate(
  rawInput: string,
  options: TdtBridgeOptions & { outputLevel?: TdtBridgeOutput } = {},
): Promise<TdtBridgeResult | { ok: false; error: string }> {
  const input = cleanInput(rawInput)
  if (!input) return { ok: false, error: 'Empty input' }

  try {
    const engine = await getEngine()
    const normalized = normalizeInput(engine, input)
    const tagLength = options.tagLength ?? inferTagLengthFromScheme(options.scheme)
    const plus = isPlusScheme(options.scheme)
    const params = buildParameterList({
      scheme: options.scheme,
      filter: options.filter,
      gcpLength: options.gcpLength,
      tagLength,
      // TDS 2.3 encode needs dataToggle; default off unless caller sets it.
      dataToggle: options.dataToggle ?? (plus ? 0 : undefined),
      uriStem: options.uriStem,
    })

    // Decode of hex/binary: empty params let the header select the scheme.
    // Encode / re-encode of identifiers: keep scheme + filter params.
    const translateParams =
      normalized.level === 'HEX' || normalized.level === 'BINARY' ? '' : params

    const levels = detailLevelsFor(options.scheme, options.outputLevel)
    const outputs: Partial<Record<TdtBridgeOutput, string>> = {}

    for (const level of levels) {
      if (level === 'HEX') continue
      const value = safeTranslate(engine, normalized.value, translateParams, level)
      if (value) outputs[level] = value
    }

    // HEX is binary converted — try BINARY even when not listed as supported.
    if (!outputs.BINARY) {
      const binary = safeTranslate(engine, normalized.value, translateParams, 'BINARY')
      if (binary) outputs.BINARY = binary
    }
    if (outputs.BINARY) {
      outputs.HEX = engine.binaryToHex(outputs.BINARY).toUpperCase()
    } else if (normalized.level === 'HEX') {
      // Plus schemes often can't round-trip BINARY; keep the source EPC hex.
      outputs.HEX = input.toUpperCase()
    }

    let fields: Record<string, string> = {}
    let scheme = options.scheme
    for (const level of detailLevelsFor(options.scheme, options.outputLevel)) {
      const details = safeDetails(engine, normalized.value, translateParams, level)
      if (!details) continue
      if (details.fields && Object.keys(details.fields).length) {
        fields = details.fields
        scheme = details.fields.schemeName || scheme
        if (details.output && !outputs[level]) outputs[level] = details.output
        break
      }
      if (details.output && !outputs[level]) outputs[level] = details.output
    }

    // When BARE_IDENTIFIER returns empty but fields parsed (some AIDC payloads),
    // synthesize a usable bare string from the identity fields.
    if (!outputs.BARE_IDENTIFIER && Object.keys(fields).length) {
      const bare = synthesizeBare(fields)
      if (bare) {
        outputs.BARE_IDENTIFIER = bare
        outputs.LEGACY = outputs.LEGACY || bare
      }
    }
    if (!outputs.LEGACY && outputs.BARE_IDENTIFIER) {
      outputs.LEGACY = outputs.BARE_IDENTIFIER
    }
    if (!outputs.GS1_AI_JSON) {
      const ai = synthesizeAiJson(fields)
      if (ai) outputs.GS1_AI_JSON = ai
    }

    if (!Object.keys(outputs).length && !Object.keys(fields).length) {
      return { ok: false, error: 'No TDT scheme matched this input' }
    }

    return {
      ok: true,
      input,
      inputLevel: normalized.level,
      scheme: scheme || fields.schemeName,
      fields,
      outputs,
    }
  } catch (e) {
    return { ok: false, error: (e as Error).message || 'TDT translation failed' }
  }
}
