/**
 * Central catalog of automation node types — the single source of truth for the
 * node palette / add-menu (labels, categories, search keywords, descriptions).
 * Icons and colour styles live in the components (they need React), keyed by the
 * same ActionType.
 */
import type { ActionType } from './automation-types'

export type NodeCategory = 'devices' | 'data' | 'flow' | 'utility' | 'edge'

export interface NodeCatalogEntry {
  type: ActionType
  /** Menu label (may differ from the node's default name). */
  label: string
  category: NodeCategory
  /** One-line description shown in the palette. */
  description: string
  /** Extra terms to match when searching (beyond label/description). */
  keywords: string[]
}

export const NODE_CATEGORY_META: Record<NodeCategory, { label: string; order: number }> = {
  devices: { label: 'Devices & I/O', order: 0 },
  data: { label: 'Data & Variables', order: 1 },
  flow: { label: 'Flow Control', order: 2 },
  utility: { label: 'Utility', order: 3 },
  edge: { label: 'Edge API', order: 4 },
}

export const NODE_CATALOG: NodeCatalogEntry[] = [
  // Devices & I/O
  { type: 'FIXED_TAG', label: 'Fixed Reader Scan', category: 'devices', description: 'Emulate tags on a fixed reader (LLRP, etc.)', keywords: ['rfid', 'epc', 'upc', 'antenna', 'llrp', 'read'] },
  { type: 'HANDHELD_TAG', label: 'Handheld Scan', category: 'devices', description: 'Broadcast tags from a handheld device', keywords: ['rfid', 'epc', 'mobile', 'scanner'] },
  { type: 'OCR', label: 'Send OCR', category: 'devices', description: 'Send an OCR message payload', keywords: ['vision', 'camera', 'text'] },
  { type: 'CUSTOM_MESSAGE', label: 'Custom Message', category: 'devices', description: 'Send a raw TCP message to any port', keywords: ['tcp', 'socket', 'raw', 'json'] },

  // Data & Variables
  { type: 'SET_VARIABLE', label: 'Set Variable', category: 'data', description: 'Assign a typed value to a variable', keywords: ['assign', 'let', 'const', 'store'] },
  { type: 'TRANSFORM', label: 'Transform', category: 'data', description: 'Reshape a value — text, number, or JSON ops', keywords: ['map', 'convert', 'uppercase', 'round', 'replace', 'math', 'json'] },
  { type: 'GENERATE', label: 'Generate Value', category: 'data', description: 'Make a UUID, timestamp, or random value', keywords: ['uuid', 'random', 'timestamp', 'hex'] },
  { type: 'DB_QUERY', label: 'Database Query', category: 'data', description: 'Run a SELECT and capture a cell into a variable', keywords: ['sql', 'mysql', 'select', 'read'] },
  { type: 'DB_EXEC', label: 'SQL Statement', category: 'data', description: 'Run any SQL: INSERT / UPDATE / DELETE / DDL', keywords: ['sql', 'mysql', 'insert', 'update', 'delete', 'write'] },
  { type: 'HTTP_REQUEST', label: 'HTTP Request', category: 'data', description: 'Call a REST endpoint; capture status/body/JSON', keywords: ['rest', 'api', 'get', 'post', 'fetch', 'webhook'] },
  { type: 'CODE', label: 'Code (JavaScript)', category: 'data', description: 'Run JavaScript in-process over the variables', keywords: ['js', 'script', 'function', 'compute'] },
  { type: 'RUN_SCRIPT', label: 'Run Script', category: 'data', description: 'Execute a shell / PowerShell script', keywords: ['shell', 'powershell', 'bash', 'exec', 'process'] },

  // Flow Control
  { type: 'DELAY', label: 'Delay', category: 'flow', description: 'Wait a fixed number of milliseconds', keywords: ['wait', 'sleep', 'pause', 'timer'] },
  { type: 'CONDITION', label: 'Condition (if / branch)', category: 'flow', description: 'Route TRUE / FALSE by comparing values', keywords: ['if', 'else', 'branch', 'compare', 'boolean'] },
  { type: 'SWITCH', label: 'Switch', category: 'flow', description: 'Route to one of many cases by value', keywords: ['case', 'match', 'branch', 'multiplex', 'router'] },
  { type: 'RANDOM', label: 'Random Branch', category: 'flow', description: 'Pick a weighted-random path', keywords: ['chance', 'probability', 'weighted', 'dice', 'ab test'] },
  { type: 'FOR_EACH', label: 'For Each', category: 'flow', description: 'Run a sub-sequence once per list item', keywords: ['loop', 'iterate', 'map', 'list'] },
  { type: 'LOOP_N', label: 'Loop N Times', category: 'flow', description: 'Run a sub-sequence a fixed number of times', keywords: ['loop', 'repeat', 'times', 'count', 'for'] },
  { type: 'CALL_SEQUENCE', label: 'Call Sequence', category: 'flow', description: 'Run another sequence as a sub-routine', keywords: ['subroutine', 'function', 'reuse', 'invoke'] },
  { type: 'WAIT_UNTIL', label: 'Wait Until', category: 'flow', description: 'Poll a condition until true or timeout', keywords: ['poll', 'await', 'block', 'retry'] },
  { type: 'ASSERT', label: 'Assert', category: 'flow', description: 'Fail the run when a condition is false', keywords: ['test', 'expect', 'check', 'verify'] },
  { type: 'STOP', label: 'Stop', category: 'flow', description: 'End the sequence or the whole run', keywords: ['halt', 'end', 'abort', 'break', 'return'] },

  // Utility
  { type: 'LOG', label: 'Log Message', category: 'utility', description: 'Write a line to the activity log', keywords: ['print', 'console', 'debug', 'trace'] },
  { type: 'NOTIFY', label: 'Notify', category: 'utility', description: 'Pop a toast notification', keywords: ['toast', 'alert', 'message', 'popup'] },
  { type: 'COMMENT', label: 'Comment', category: 'utility', description: 'A note on the canvas — does nothing at runtime', keywords: ['note', 'sticky', 'doc', 'label'] },

  // Edge API
  { type: 'EDGE_BLOCK', label: 'Invoke Edge Block', category: 'edge', description: 'POST an Edge activity block', keywords: ['edge', 'activity', 'invoke', 'block'] },
  { type: 'EDGE_PROCESS', label: 'Edge Process', category: 'edge', description: 'Start or stop an Edge workflow process', keywords: ['edge', 'process', 'workflow', 'start', 'stop'] },
]

const CATALOG_BY_TYPE = new Map(NODE_CATALOG.map((e) => [e.type, e]))

export function catalogEntry(type: ActionType): NodeCatalogEntry | undefined {
  return CATALOG_BY_TYPE.get(type)
}

/**
 * Filter + rank catalog entries against a free-text query. An empty query
 * returns everything (catalog order). Matches on label, description, keywords,
 * and category label; ranks exact/prefix label hits first.
 */
export function searchCatalog(query: string): NodeCatalogEntry[] {
  const q = query.trim().toLowerCase()
  if (!q) return NODE_CATALOG
  const terms = q.split(/\s+/).filter(Boolean)

  const scored: { entry: NodeCatalogEntry; score: number }[] = []
  for (const entry of NODE_CATALOG) {
    const label = entry.label.toLowerCase()
    const haystack = [
      label,
      entry.description.toLowerCase(),
      entry.type.toLowerCase(),
      NODE_CATEGORY_META[entry.category].label.toLowerCase(),
      ...entry.keywords,
    ].join(' ')

    let score = 0
    let matchedAll = true
    for (const term of terms) {
      if (!haystack.includes(term)) {
        matchedAll = false
        break
      }
      if (label === term) score += 100
      else if (label.startsWith(term)) score += 40
      else if (label.includes(term)) score += 20
      else if (entry.keywords.some((k) => k.includes(term))) score += 8
      else score += 3
    }
    if (matchedAll) scored.push({ entry, score })
  }

  return scored.sort((a, b) => b.score - a.score).map((s) => s.entry)
}
