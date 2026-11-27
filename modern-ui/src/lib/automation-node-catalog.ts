/**
 * Central catalog of automation node types — the single source of truth for the
 * node palette / add-menu (labels, categories, search keywords, descriptions).
 * Icons and colour styles live in the components (they need React), keyed by the
 * same ActionType.
 */
import type { ActionType } from './automation-types'

export type NodeCategory = 'integrations' | 'data' | 'flow' | 'utility' | 'devices' | 'edge'

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
  integrations: { label: 'Integrations & Net', order: 0 },
  data: { label: 'Data & Pipeline', order: 1 },
  flow: { label: 'Flow Control', order: 2 },
  utility: { label: 'Desktop & Utility', order: 3 },
  devices: { label: 'RFID & Sockets', order: 4 },
  edge: { label: 'Edge API', order: 5 },
}

export const NODE_CATALOG: NodeCatalogEntry[] = [
  // Integrations & Net
  { type: 'HTTP_REQUEST', label: 'HTTP Request', category: 'integrations', description: 'Call any REST API with Bearer/Basic/API Key auth; capture headers & JSON', keywords: ['rest', 'api', 'get', 'post', 'fetch', 'bearer', 'auth', 'json'] },
  { type: 'SSH_EXEC', label: 'SSH Command', category: 'integrations', description: 'Execute remote commands on any Linux/Unix server over SSH', keywords: ['ssh', 'remote', 'server', 'linux', 'exec', 'deploy', 'bash'] },
  { type: 'PING_PORT', label: 'Health / Port Probe', category: 'integrations', description: 'Check TCP port reachability, HTTP health status, or DNS resolution', keywords: ['ping', 'port', 'health', 'check', 'dns', 'tcp', 'uptime', 'latency'] },
  { type: 'WEBSOCKET', label: 'WebSocket', category: 'integrations', description: 'Connect to ws:// or wss://, send payload, and await matching reply', keywords: ['ws', 'wss', 'websocket', 'stream', 'socket', 'realtime'] },
  { type: 'WEBHOOK_SEND', label: 'Slack / Teams / Discord', category: 'integrations', description: 'Post formatted alerts to Slack, Discord, Microsoft Teams, or generic webhooks', keywords: ['slack', 'discord', 'teams', 'webhook', 'alert', 'chat', 'notify'] },
  { type: 'DB_QUERY', label: 'Database Query', category: 'integrations', description: 'Run a SELECT and capture a cell or full JSON rows into variables', keywords: ['sql', 'mysql', 'postgres', 'select', 'read', 'database'] },
  { type: 'DB_EXEC', label: 'SQL Statement', category: 'integrations', description: 'Run any SQL: INSERT / UPDATE / DELETE / DDL / CALL', keywords: ['sql', 'mysql', 'postgres', 'insert', 'update', 'delete', 'write'] },

  // Data & Pipeline
  { type: 'SET_VARIABLE', label: 'Set Variable', category: 'data', description: 'Assign a typed value to a variable', keywords: ['assign', 'let', 'const', 'store'] },
  { type: 'TRANSFORM', label: 'Transform', category: 'data', description: 'Reshape text, numbers, JSON, regex, Base64, URL, or EPC data', keywords: ['map', 'convert', 'uppercase', 'round', 'replace', 'regex', 'base64', 'json'] },
  { type: 'CSV_JSON', label: 'CSV & JSON Pipeline', category: 'data', description: 'Convert CSV↔JSON, filter, sort, map, aggregate (sum/avg/min/max), or merge', keywords: ['csv', 'json', 'filter', 'sort', 'aggregate', 'sum', 'table', 'pipeline'] },
  { type: 'CRYPTO_HASH', label: 'Hash / HMAC / JWT', category: 'data', description: 'Compute SHA-256/512/MD5, HMAC signatures, decode JWTs, or make tokens', keywords: ['hash', 'sha256', 'md5', 'hmac', 'jwt', 'token', 'crypto', 'sign'] },
  { type: 'DATETIME', label: 'Date & Time', category: 'data', description: 'Get current timestamp, add/subtract intervals, diff dates, or format', keywords: ['date', 'time', 'now', 'iso', 'add', 'diff', 'format', 'clock'] },
  { type: 'GENERATE', label: 'Generate Value', category: 'data', description: 'Make a UUID, timestamp, random int/hex, UPC, or SGTIN-96 EPC', keywords: ['uuid', 'random', 'timestamp', 'hex', 'upc', 'epc'] },
  { type: 'CODE', label: 'Custom Code (Multi-Lang)', category: 'data', description: 'Write & run custom JavaScript, Python, Node.js, TypeScript, PowerShell, Bash, Java, Go, Ruby, or PHP', keywords: ['code', 'js', 'javascript', 'node', 'typescript', 'python', 'powershell', 'bash', 'java', 'go', 'ruby', 'php', 'custom', 'function', 'compute'] },
  { type: 'RUN_SCRIPT', label: 'Run Script (Multi-Lang)', category: 'data', description: 'Execute PowerShell, Bash, Python, Node.js, or CMD scripts with stdout/stderr capture', keywords: ['shell', 'powershell', 'bash', 'python', 'node', 'cmd', 'exec', 'script'] },
  { type: 'FILE_READ', label: 'Read File', category: 'data', description: 'Read local, SFTP, FTP, or S3 file into a variable', keywords: ['file', 'read', 'load', 'csv', 'json', 'sftp', 'ftp', 's3', 'storage'] },
  { type: 'FILE_WRITE', label: 'Write File', category: 'data', description: 'Write or append text/data to local, SFTP, FTP, or S3', keywords: ['file', 'write', 'save', 'append', 'csv', 'export', 'sftp', 'ftp', 's3'] },
  { type: 'FILE_LIST', label: 'List Files', category: 'data', description: 'List files in local, SFTP, FTP, or S3 directory with glob filter', keywords: ['file', 'directory', 'list', 'folder', 'ls', 'glob', 'sftp', 'ftp', 's3'] },

  // Flow Control
  { type: 'DELAY', label: 'Delay', category: 'flow', description: 'Wait a fixed number of milliseconds', keywords: ['wait', 'sleep', 'pause', 'timer'] },
  { type: 'CONDITION', label: 'Condition (if / branch)', category: 'flow', description: 'Route TRUE / FALSE by comparing values', keywords: ['if', 'else', 'branch', 'compare', 'boolean'] },
  { type: 'SWITCH', label: 'Switch', category: 'flow', description: 'Route to one of many cases by value', keywords: ['case', 'match', 'branch', 'multiplex', 'router'] },
  { type: 'PARALLEL_BRANCH', label: 'Parallel Fork & Join', category: 'flow', description: 'Run multiple branches concurrently, then continue on AFTER ALL', keywords: ['parallel', 'concurrent', 'fork', 'join', 'fanout', 'async', 'promise'] },
  { type: 'RANDOM', label: 'Random Branch', category: 'flow', description: 'Pick a weighted-random path', keywords: ['chance', 'probability', 'weighted', 'dice', 'ab test'] },
  { type: 'FOR_EACH', label: 'For Each', category: 'flow', description: 'Run a sub-sequence once per list item', keywords: ['loop', 'iterate', 'map', 'list'] },
  { type: 'LOOP_N', label: 'Loop N Times', category: 'flow', description: 'Run a sub-sequence a fixed number of times', keywords: ['loop', 'repeat', 'times', 'count', 'for'] },
  { type: 'CALL_SEQUENCE', label: 'Call Sequence', category: 'flow', description: 'Run another sequence as a sub-routine', keywords: ['subroutine', 'function', 'reuse', 'invoke'] },
  { type: 'WAIT_UNTIL', label: 'Wait Until', category: 'flow', description: 'Poll a condition until true or timeout', keywords: ['poll', 'await', 'block', 'retry'] },
  { type: 'ASSERT', label: 'Assert', category: 'flow', description: 'Fail the run when a condition is false', keywords: ['test', 'expect', 'check', 'verify'] },
  { type: 'STOP', label: 'Stop', category: 'flow', description: 'End the sequence or the whole run', keywords: ['halt', 'end', 'abort', 'break', 'return'] },

  // Desktop & Utility
  { type: 'CLIPBOARD', label: 'Clipboard', category: 'utility', description: 'Read from or write templated text to the OS clipboard', keywords: ['clipboard', 'copy', 'paste', 'os'] },
  { type: 'OPEN_APP', label: 'Open URL / File', category: 'utility', description: 'Open a URL in browser, launch a file in default app, or reveal in Explorer', keywords: ['open', 'browser', 'url', 'launch', 'explorer', 'finder', 'file'] },
  { type: 'PROMPT_INPUT', label: 'User Prompt', category: 'utility', description: 'Pause mid-run and ask the user for input, a choice, or confirmation', keywords: ['prompt', 'input', 'ask', 'confirm', 'modal', 'human', 'interactive'] },
  { type: 'LOG', label: 'Log Message', category: 'utility', description: 'Write a line to the activity log', keywords: ['print', 'console', 'debug', 'trace'] },
  { type: 'NOTIFY', label: 'Notify (Toast & Desktop)', category: 'utility', description: 'Pop an in-app toast and/or native OS desktop notification', keywords: ['toast', 'alert', 'message', 'popup', 'desktop', 'notification', 'os'] },
  { type: 'COMMENT', label: 'Comment', category: 'utility', description: 'A note on the canvas — does nothing at runtime', keywords: ['note', 'sticky', 'doc', 'label'] },

  // RFID & Sockets
  { type: 'FIXED_TAG', label: 'Fixed Reader Scan', category: 'devices', description: 'Emulate tags on a fixed reader (LLRP, auto-connect, antennas, RSSI)', keywords: ['rfid', 'epc', 'upc', 'antenna', 'llrp', 'read', 'fixed'] },
  { type: 'HANDHELD_TAG', label: 'Handheld Scan', category: 'devices', description: 'Broadcast tags from a handheld server (multi-port, RSSI, TID)', keywords: ['rfid', 'epc', 'mobile', 'scanner', 'handheld', 'port'] },
  { type: 'OCR', label: 'Send OCR', category: 'devices', description: 'Send an OCR / barcode payload and capture the response', keywords: ['vision', 'camera', 'text', 'ocr', 'inditex'] },
  { type: 'CUSTOM_MESSAGE', label: 'TCP (Client / Server)', category: 'devices', description: 'TCP Client (connect, send ASCII/HEX, capture reply) or TCP Server (listen, broadcast, wait)', keywords: ['tcp', 'socket', 'raw', 'json', 'hex', 'server', 'client', 'hercules', 'custom'] },

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
