export type ActionType =
  | 'DELAY'
  | 'OCR'
  | 'FIXED_TAG'
  | 'HANDHELD_TAG'
  | 'CUSTOM_MESSAGE'
  | 'EDGE_BLOCK'
  | 'EDGE_PROCESS'
  | 'SET_VARIABLE'
  | 'DB_QUERY'
  | 'DB_EXEC'
  | 'RUN_SCRIPT'
  | 'HTTP_REQUEST'
  | 'CALL_SEQUENCE'
  | 'CODE'
  | 'CONDITION'
  | 'ASSERT'
  | 'WAIT_UNTIL'
  | 'FOR_EACH'
  | 'STOP'
  | 'GENERATE'
  | 'COMMENT'
  | 'LOG'
  | 'TRANSFORM'
  | 'NOTIFY'
  | 'LOOP_N'
  | 'SWITCH'
  | 'RANDOM'
  | 'FILE_READ'
  | 'FILE_WRITE'
  | 'FILE_LIST'
  | 'SSH_EXEC'
  | 'PING_PORT'
  | 'WEBSOCKET'
  | 'WEBHOOK_SEND'
  | 'CSV_JSON'
  | 'CRYPTO_HASH'
  | 'DATETIME'
  | 'CLIPBOARD'
  | 'OPEN_APP'
  | 'PROMPT_INPUT'
  | 'PARALLEL_BRANCH'

export type FrameColor = 'blue' | 'emerald' | 'amber' | 'purple' | 'cyan' | 'rose' | 'slate'

export interface AutomationFrame {
  id: string
  name: string
  color: FrameColor
  x: number
  y: number
  width: number
  height: number
  notes?: string
}

export type TriggerType = 'webhook' | 'file_watcher' | 'interval' | 'cron'

export interface AutomationTrigger {
  id: string
  name: string
  type: TriggerType
  enabled: boolean
  targetSequenceId: string
  // Webhook settings
  webhookPath?: string
  webhookPort?: number
  webhookMethod?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'ANY'
  // File watcher settings
  watcherPath?: string
  watcherPattern?: string
  watchEvents?: 'all' | 'change' | 'add' | 'unlink'
  // Interval settings
  intervalSeconds?: number
  // Cron settings (5-field standard: min hour dom month dow)
  cronExpression?: string
}

/** TCP node action mode (mirrors the TCP Client & TCP Server tab). */
export type TcpNodeMode =
  | 'oneshot'
  | 'client_connect'
  | 'client_send'
  | 'client_disconnect'
  | 'server_start'
  | 'server_send'
  | 'server_wait'
  | 'server_stop'

export type TcpLineEnding = 'none' | 'lf' | 'crlf' | 'cr'

export const TCP_NODE_MODES: { value: TcpNodeMode; label: string; group: 'Client' | 'Server'; hint: string }[] = [
  { value: 'oneshot', label: 'One-Shot Send (Connect → Send → Close)', group: 'Client', hint: 'Open a temporary socket, send ASCII or HEX, optionally capture reply, then close' },
  { value: 'client_connect', label: 'TCP Client: Connect (Persistent)', group: 'Client', hint: 'Open the persistent TCP Client socket (synced live with the TCP tab)' },
  { value: 'client_send', label: 'TCP Client: Send Payload', group: 'Client', hint: 'Send ASCII or HEX over the active TCP Client and optionally await a reply' },
  { value: 'client_disconnect', label: 'TCP Client: Disconnect', group: 'Client', hint: 'Close the persistent TCP Client socket' },
  { value: 'server_start', label: 'TCP Server: Start Listening', group: 'Server', hint: 'Start the built-in TCP Server on the chosen bind host and port' },
  { value: 'server_send', label: 'TCP Server: Send / Broadcast', group: 'Server', hint: 'Send ASCII or HEX to all connected clients or a specific client ID' },
  { value: 'server_wait', label: 'TCP Server: Wait for Incoming Data', group: 'Server', hint: 'Pause until a connected TCP client sends data, then capture it into a variable' },
  { value: 'server_stop', label: 'TCP Server: Stop Listening', group: 'Server', hint: 'Disconnect all clients and stop the built-in TCP Server' },
]

export type EdgeProcessAction = 'start' | 'stop'

export type ProbeMode = 'tcp' | 'http' | 'dns'
export type WebhookPreset = 'slack' | 'discord' | 'teams' | 'generic'
export type CsvJsonOp =
  | 'csvToJson'
  | 'jsonToCsv'
  | 'filterArray'
  | 'mapField'
  | 'sortArray'
  | 'aggregate'
  | 'mergeJson'
export type AggregateOp = 'count' | 'sum' | 'avg' | 'min' | 'max' | 'unique' | 'join'
export type CryptoOp =
  | 'sha256'
  | 'sha512'
  | 'sha1'
  | 'md5'
  | 'hmacSha256'
  | 'hmacSha512'
  | 'jwtDecode'
  | 'randomToken'
export type DateTimeOp = 'now' | 'add' | 'diff' | 'format'
export type DateTimeUnit = 'seconds' | 'minutes' | 'hours' | 'days'
export type ScriptLang = 'auto' | 'ps1' | 'sh' | 'py' | 'js' | 'cmd'
export type HttpAuthType = 'none' | 'bearer' | 'basic' | 'apiKey' | 'ale'
export type PromptInputMode = 'text' | 'select' | 'confirm'
export type ParallelWaitMode = 'all' | 'allSettled' | 'race'
export interface ParallelBranchItem {
  label?: string
}

export const CSV_JSON_OPS: { value: CsvJsonOp; label: string; hint: string }[] = [
  { value: 'csvToJson', label: 'CSV → JSON Array', hint: 'Parse CSV text into a JSON array of objects' },
  { value: 'jsonToCsv', label: 'JSON Array → CSV', hint: 'Serialize a JSON array of objects into CSV text' },
  { value: 'filterArray', label: 'Filter JSON Array', hint: 'Keep items matching a field condition' },
  { value: 'mapField', label: 'Map / Extract Field', hint: 'Pluck a single property from every array item' },
  { value: 'sortArray', label: 'Sort JSON Array', hint: 'Sort array items by a field ascending or descending' },
  { value: 'aggregate', label: 'Aggregate (Sum/Avg/Min/Max)', hint: 'Compute count, sum, avg, min, max, unique, or join' },
  { value: 'mergeJson', label: 'Merge Two JSON Values', hint: 'Shallow-merge two objects or concatenate two arrays' },
]

export const CRYPTO_OPS: { value: CryptoOp; label: string; hint: string }[] = [
  { value: 'sha256', label: 'SHA-256 Hash', hint: 'Hex digest of UTF-8 input' },
  { value: 'sha512', label: 'SHA-512 Hash', hint: 'Hex digest of UTF-8 input' },
  { value: 'sha1', label: 'SHA-1 Hash', hint: 'Hex digest of UTF-8 input' },
  { value: 'md5', label: 'MD5 Hash', hint: 'Hex MD5 checksum of UTF-8 input' },
  { value: 'hmacSha256', label: 'HMAC-SHA256', hint: 'Sign payload with a shared secret key' },
  { value: 'hmacSha512', label: 'HMAC-SHA512', hint: 'Sign payload with a shared secret key (512-bit)' },
  { value: 'jwtDecode', label: 'Decode JWT Payload', hint: 'Decode JWT header & payload claims as JSON (without verifying sig)' },
  { value: 'randomToken', label: 'Random Secure Token', hint: 'Generate a URL-safe cryptographic token' },
]

export const DATETIME_OPS: { value: DateTimeOp; label: string; hint: string }[] = [
  { value: 'now', label: 'Current Time', hint: 'Format the current date/time' },
  { value: 'add', label: 'Add / Subtract Time', hint: 'Offset a timestamp by ± seconds, minutes, hours, or days' },
  { value: 'diff', label: 'Difference Between Dates', hint: 'Compute difference between two timestamps' },
  { value: 'format', label: 'Parse & Reformat Date', hint: 'Parse a date/epoch string and format it' },
]

export const WEBHOOK_PRESETS: { value: WebhookPreset; label: string; hint: string }[] = [
  { value: 'slack', label: 'Slack Incoming Webhook', hint: 'Formats { text } or Rich Block attachment' },
  { value: 'discord', label: 'Discord Webhook', hint: 'Formats { username, content, embeds }' },
  { value: 'teams', label: 'Microsoft Teams', hint: 'Formats MessageCard { title, text, themeColor }' },
  { value: 'generic', label: 'Generic JSON POST', hint: 'Posts your JSON payload or { title, message, level, timestamp }' },
]

export const SCRIPT_LANG_OPTIONS: { value: ScriptLang; label: string; ext?: string }[] = [
  { value: 'auto', label: 'Auto (OS default)' },
  { value: 'ps1', label: 'PowerShell (.ps1)', ext: '.ps1' },
  { value: 'sh', label: 'Bash / Shell (.sh)', ext: '.sh' },
  { value: 'py', label: 'Python (.py)', ext: '.py' },
  { value: 'js', label: 'Node.js (.js)', ext: '.js' },
  { value: 'cmd', label: 'Windows Batch (.cmd)', ext: '.cmd' },
]

export const HTTP_AUTH_TYPES: { value: HttpAuthType; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'bearer', label: 'Bearer Token' },
  { value: 'basic', label: 'Basic Auth (User / Password)' },
  { value: 'apiKey', label: 'API Key Header' },
  { value: 'ale', label: 'Saved ALE Basic Auth' },
]

/** HTTP verbs supported by the HTTP Request node. */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD'

/** Value type applied by the Set Variable node (validated + canonicalized on set). */
export type VarType =
  | 'string'
  | 'number'
  | 'integer'
  | 'boolean'
  | 'array'
  | 'object'
  | 'json'

/**
 * UI metadata for the Set Variable type picker. `java` names the closest Java
 * equivalent so it reads familiarly. Values are stored as strings (numbers/booleans
 * canonicalized; arrays/objects/JSON stored as compact JSON) so templating stays simple.
 */
export const VAR_TYPES: { value: VarType; label: string; hint: string; java: string }[] = [
  { value: 'string', label: 'String', hint: 'Any text', java: 'String' },
  { value: 'number', label: 'Number', hint: 'Any number, e.g. 3.5 or -42', java: 'double / float' },
  { value: 'integer', label: 'Integer', hint: 'A whole number, e.g. 42 (no decimals)', java: 'int / long' },
  { value: 'boolean', label: 'Boolean', hint: 'true / false (also 1/0, yes/no)', java: 'boolean' },
  { value: 'array', label: 'Array', hint: 'JSON array, or a comma/newline list — stored as JSON', java: 'List / T[]' },
  { value: 'object', label: 'Object', hint: 'A JSON object — stored as compact JSON', java: 'Map / POJO' },
  { value: 'json', label: 'JSON (any)', hint: 'Any valid JSON value', java: 'Object' },
]

/**
 * Supported languages for the Custom Code node.
 * - `javascript`: instant in-process execution with mutable `vars` and `log()`
 * - `nodejs` / `typescript`: built-in Electron Node runtime (no external install required)
 * - `python` / `powershell` / `bash` / `batch` / `java` / `go` / `ruby` / `php`: subprocess execution
 */
export type CodeLanguage =
  | 'javascript'
  | 'nodejs'
  | 'typescript'
  | 'python'
  | 'powershell'
  | 'bash'
  | 'batch'
  | 'java'
  | 'go'
  | 'ruby'
  | 'php'

export interface CodeLanguageOption {
  value: CodeLanguage
  label: string
  badge: string
  ext: string
  runtimeHint: string
  builtIn?: boolean
  commentPrefix: string
}

export const CODE_LANGUAGE_OPTIONS: CodeLanguageOption[] = [
  {
    value: 'javascript',
    label: 'JavaScript (In-Process · Instant)',
    badge: 'JS',
    ext: '.js',
    runtimeHint: 'Runs instantly in-process — mutate `vars` or `return { key: value }`.',
    builtIn: true,
    commentPrefix: '//',
  },
  {
    value: 'nodejs',
    label: 'Node.js (Built-in Runtime)',
    badge: 'NODE',
    ext: '.mjs',
    runtimeHint: 'Runs on Zeus built-in Node runtime (supports fs, fetch, crypto). Print JSON on last line to set vars.',
    builtIn: true,
    commentPrefix: '//',
  },
  {
    value: 'typescript',
    label: 'TypeScript (Built-in Node TS)',
    badge: 'TS',
    ext: '.ts',
    runtimeHint: 'Runs TypeScript directly via built-in Node type stripping — no tsc needed.',
    builtIn: true,
    commentPrefix: '//',
  },
  {
    value: 'python',
    label: 'Python 3',
    badge: 'PY',
    ext: '.py',
    runtimeHint: 'Requires `python` (Windows) or `python3` on PATH. Read os.environ["ZEUS_VARS_JSON"].',
    commentPrefix: '#',
  },
  {
    value: 'powershell',
    label: 'PowerShell',
    badge: 'PS1',
    ext: '.ps1',
    runtimeHint: 'Built-in on Windows (`powershell.exe`); `pwsh` on macOS/Linux.',
    commentPrefix: '#',
  },
  {
    value: 'bash',
    label: 'Bash / Shell',
    badge: 'SH',
    ext: '.sh',
    runtimeHint: 'Uses `/bin/bash` (macOS/Linux) or `bash` (Git Bash/WSL on Windows).',
    commentPrefix: '#',
  },
  {
    value: 'batch',
    label: 'Windows Batch (CMD)',
    badge: 'CMD',
    ext: '.cmd',
    runtimeHint: 'Runs via Windows `cmd.exe`. Emit KEY=VALUE lines to set variables.',
    commentPrefix: 'REM',
  },
  {
    value: 'java',
    label: 'Java (JDK 11+ Single-File)',
    badge: 'JAVA',
    ext: '.java',
    runtimeHint: 'Requires JDK 11+ `java` on PATH (use `public class Main`).',
    commentPrefix: '//',
  },
  {
    value: 'go',
    label: 'Go',
    badge: 'GO',
    ext: '.go',
    runtimeHint: 'Requires `go` on PATH (`go run`).',
    commentPrefix: '//',
  },
  {
    value: 'ruby',
    label: 'Ruby',
    badge: 'RB',
    ext: '.rb',
    runtimeHint: 'Requires `ruby` on PATH.',
    commentPrefix: '#',
  },
  {
    value: 'php',
    label: 'PHP',
    badge: 'PHP',
    ext: '.php',
    runtimeHint: 'Requires `php` on PATH.',
    commentPrefix: '//',
  },
]

export const CODE_STARTERS: Record<CodeLanguage, string> = {
  javascript: `// Manipulate variables in-process (runs instantly, no install).
// \`vars\` is a map of the current variables (all strings) — mutate it,
// and/or return an object. Returned/mutated values are merged back.
const tagCount = Number(vars.tagCount || 0)
vars.doubled = tagCount * 2
return { note: \`Saw \${tagCount} tag(s) on \${vars.host || 'localhost'}\` }
`,
  nodejs: `// Node.js (runs on Zeus built-in Node runtime — print JSON on the last line to update vars)
const vars = JSON.parse(process.env.ZEUS_VARS_JSON || '{}')
const count = Number(vars.tagCount || 0)
console.log('Node runtime active, host =', vars.host || 'none')
console.log(JSON.stringify({ doubled: count * 2, nodeStatus: 'ok' }))
`,
  typescript: `// TypeScript (runs directly via built-in Node type stripping)
const vars: Record<string, string> = JSON.parse(process.env.ZEUS_VARS_JSON || '{}')
const count: number = Number(vars.tagCount || 0)
const result: { doubled: number; tsReady: string } = { doubled: count * 2, tsReady: 'true' }
console.log(JSON.stringify(result))
`,
  python: `# Python 3 — read workflow vars from ZEUS_VARS_JSON; print a JSON object to update vars
import json, os

vars_map = json.loads(os.environ.get("ZEUS_VARS_JSON", "{}"))
tag_count = int(float(vars_map.get("tagCount") or 0))
host = vars_map.get("host", "localhost")

print(f"Python processing host={host}, tagCount={tag_count}")
print(json.dumps({"doubled": tag_count * 2, "pySummary": f"Processed {tag_count} on {host}"}))
`,
  powershell: `# PowerShell — read $env:ZEUS_VARS_JSON; output JSON on the last line to update vars
$vars = $env:ZEUS_VARS_JSON | ConvertFrom-Json
$count = [int]($vars.tagCount ?? 0)
@{ doubled = $count * 2; psHost = ($vars.host ?? 'localhost') } | ConvertTo-Json -Compress
`,
  bash: `# Bash / Shell — output KEY=VALUE lines or a final JSON line to update vars
echo "Running on host=\${ZEUS_HOST:-localhost}"
echo "shellNote=Executed custom bash block"
`,
  batch: `@echo off
REM Windows CMD — output KEY=VALUE lines to set workflow variables
echo cmdStatus=ok
echo cmdHost=%ZEUS_HOST%
`,
  java: `// Java 11+ single-file source (keep class name Main)
public class Main {
  public static void main(String[] args) {
    String host = System.getenv().getOrDefault("ZEUS_HOST", "localhost");
    System.out.println("Java executing for host=" + host);
    System.out.println("{\"javaStatus\":\"ok\",\"javaHost\":\"" + host.replace("\"", "") + "\"}");
  }
}
`,
  go: `// Go — runs with \`go run\`
package main

import (
	"encoding/json"
	"fmt"
	"os"
)

func main() {
	vars := map[string]string{}
	_ = json.Unmarshal([]byte(os.Getenv("ZEUS_VARS_JSON")), &vars)
	out, _ := json.Marshal(map[string]string{
		"goStatus": "ok",
		"goHost":   vars["host"],
	})
	fmt.Println(string(out))
}
`,
  ruby: `# Ruby — read ZEUS_VARS_JSON and print JSON to update workflow variables
require 'json'
vars = JSON.parse(ENV['ZEUS_VARS_JSON'] || '{}')
puts({ rubyStatus: 'ok', host: vars['host'].to_s }.to_json)
`,
  php: `<?php
// PHP — read ZEUS_VARS_JSON and echo JSON to update workflow variables
$vars = json_decode(getenv('ZEUS_VARS_JSON') ?: '{}', true);
echo json_encode(['phpStatus' => 'ok', 'host' => $vars['host'] ?? '']) . "\n";
`,
}

/** Starter snippet for new Code nodes (JavaScript). */
export const CODE_STARTER = CODE_STARTERS.javascript

/** What a GENERATE node produces. */
export type GenerateKind = 'uuid' | 'timestamp' | 'unixMs' | 'randomInt' | 'randomHex' | 'randomUpc' | 'epcFromUpc'

export const GENERATE_KINDS: { value: GenerateKind; label: string; hint: string }[] = [
  { value: 'uuid', label: 'UUID', hint: 'Random UUID v4' },
  { value: 'timestamp', label: 'ISO timestamp', hint: 'e.g. 2026-07-11T06:00:00.000Z' },
  { value: 'unixMs', label: 'Unix ms', hint: 'Milliseconds since epoch' },
  { value: 'randomInt', label: 'Random integer', hint: 'Inclusive min…max' },
  { value: 'randomHex', label: 'Random hex', hint: 'Lowercase hex string of N chars' },
  { value: 'randomUpc', label: 'Random GTIN-14 / UPC', hint: 'Valid Mod-10 check-digit 14-digit GTIN/UPC' },
  { value: 'epcFromUpc', label: 'SGTIN-96 EPC from UPC', hint: 'Encode a UPC + serial into a 24-hex SGTIN-96 EPC' },
]

/** How far a STOP node ends execution. */
export type StopScope = 'sequence' | 'run'

/** Operations available to the TRANSFORM node (in-process value manipulation). */
export type TransformOp =
  | 'upper'
  | 'lower'
  | 'trim'
  | 'length'
  | 'replace'
  | 'slice'
  | 'prefix'
  | 'suffix'
  | 'padStart'
  | 'default'
  | 'jsonExtract'
  | 'regexExtract'
  | 'base64Encode'
  | 'base64Decode'
  | 'urlEncode'
  | 'urlDecode'
  | 'decodeEpc'
  | 'round'
  | 'floor'
  | 'ceil'
  | 'abs'
  | 'add'
  | 'subtract'
  | 'multiply'
  | 'divide'
  | 'modulo'
  | 'toFixed'
  | 'toProperties'

export type TransformCategory = 'text' | 'number' | 'json' | 'array' | 'encoding'

/**
 * UI metadata for the TRANSFORM op picker. `arg`/`arg2` name the extra inputs a
 * given op needs (undefined = no input shown).
 */
export const TRANSFORM_OPS: {
  value: TransformOp
  label: string
  category: TransformCategory
  arg?: string
  arg2?: string
  hint: string
}[] = [
  { value: 'upper', label: 'UPPERCASE', category: 'text', hint: 'Convert to upper case' },
  { value: 'lower', label: 'lowercase', category: 'text', hint: 'Convert to lower case' },
  { value: 'trim', label: 'Trim whitespace', category: 'text', hint: 'Remove leading/trailing whitespace' },
  { value: 'length', label: 'Length', category: 'text', hint: 'Number of characters' },
  { value: 'replace', label: 'Replace', category: 'text', arg: 'Find', arg2: 'Replace with', hint: 'Replace all occurrences (plain text)' },
  { value: 'slice', label: 'Substring', category: 'text', arg: 'Start index', arg2: 'End index (optional)', hint: 'Characters from start to end index' },
  { value: 'prefix', label: 'Add prefix', category: 'text', arg: 'Prefix', hint: 'Prepend text' },
  { value: 'suffix', label: 'Add suffix', category: 'text', arg: 'Suffix', hint: 'Append text' },
  { value: 'padStart', label: 'Pad start', category: 'text', arg: 'Target length', arg2: 'Pad char (default 0)', hint: 'Left-pad to a length' },
  { value: 'default', label: 'Default if empty', category: 'text', arg: 'Fallback value', hint: 'Use fallback when the input is empty' },
  { value: 'regexExtract', label: 'Regex extract', category: 'text', arg: 'Pattern (e.g. PO-(\\d+))', arg2: 'Capture group (default 1 or 0)', hint: 'Extract matching substring or capture group via regex' },
  { value: 'jsonExtract', label: 'Extract JSON path', category: 'json', arg: 'Path (e.g. data.items.0.epc)', hint: 'Parse input as JSON and read a dot/bracket path' },
  { value: 'base64Encode', label: 'Base64 encode', category: 'encoding', hint: 'Encode UTF-8 text to Base64' },
  { value: 'base64Decode', label: 'Base64 decode', category: 'encoding', hint: 'Decode Base64 back to UTF-8 text' },
  { value: 'urlEncode', label: 'URL encode', category: 'encoding', hint: 'Percent-encode text for URLs / query params' },
  { value: 'urlDecode', label: 'URL decode', category: 'encoding', hint: 'Decode percent-encoded URL text' },
  { value: 'decodeEpc', label: 'Decode EPC (GTIN / Serial)', category: 'encoding', hint: 'Decode an SGTIN-96 / RFID hex EPC via TDT/Decoder into JSON (gtin, serial, pureIdentity)' },
  { value: 'round', label: 'Round', category: 'number', hint: 'Round to nearest integer' },
  { value: 'floor', label: 'Floor', category: 'number', hint: 'Round down' },
  { value: 'ceil', label: 'Ceil', category: 'number', hint: 'Round up' },
  { value: 'abs', label: 'Absolute value', category: 'number', hint: 'Magnitude (drop sign)' },
  { value: 'add', label: 'Add (+)', category: 'number', arg: 'Amount', hint: 'Add a number' },
  { value: 'subtract', label: 'Subtract (−)', category: 'number', arg: 'Amount', hint: 'Subtract a number' },
  { value: 'multiply', label: 'Multiply (×)', category: 'number', arg: 'Factor', hint: 'Multiply by a number' },
  { value: 'divide', label: 'Divide (÷)', category: 'number', arg: 'Divisor', hint: 'Divide by a number' },
  { value: 'modulo', label: 'Modulo (%)', category: 'number', arg: 'Divisor', hint: 'Remainder after division' },
  { value: 'toFixed', label: 'Fixed decimals', category: 'number', arg: 'Decimal places', hint: 'Format with N decimal places' },
  { value: 'toProperties', label: 'Array to Properties Map', category: 'array', hint: 'Converts array or comma/newline list into {Item1={}, Item2={}}' },
]

/** Severity levels for the NOTIFY (toast) node. */
export type NotifyLevel = 'info' | 'success' | 'warning' | 'error'

export const NOTIFY_LEVELS: { value: NotifyLevel; label: string }[] = [
  { value: 'info', label: 'Info' },
  { value: 'success', label: 'Success' },
  { value: 'warning', label: 'Warning' },
  { value: 'error', label: 'Error' },
]

/** A single case in a SWITCH node — matched (by equality) against the switch value. */
export interface SwitchCase {
  /** Value to compare against the switch value (supports {{vars}}). */
  value: string
  /** Optional friendly label shown on the output port. */
  label?: string
}

/** A single weighted branch in a RANDOM node. */
export interface RandomBranch {
  /** Relative weight (>= 0). Higher = more likely. */
  weight: number
  /** Optional friendly label shown on the output port. */
  label?: string
}

/**
 * Comparison operators for the CONDITION node.
 * Both operands support `{{variable}}` templating; numeric operators coerce to
 * numbers, the rest compare as strings (see `evaluateCondition`).
 */
export type ConditionOp =
  | 'eq'
  | 'neq'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'contains'
  | 'notContains'
  | 'startsWith'
  | 'endsWith'
  | 'matches'
  | 'isEmpty'
  | 'isNotEmpty'
  | 'isTrue'
  | 'isFalse'

/** UI metadata for condition operators. `needsRight: false` ops ignore the right operand. */
export const CONDITION_OPS: { value: ConditionOp; label: string; needsRight: boolean }[] = [
  { value: 'eq', label: 'equals (=)', needsRight: true },
  { value: 'neq', label: 'not equals (≠)', needsRight: true },
  { value: 'gt', label: 'greater than (>)', needsRight: true },
  { value: 'gte', label: 'greater or equal (≥)', needsRight: true },
  { value: 'lt', label: 'less than (<)', needsRight: true },
  { value: 'lte', label: 'less or equal (≤)', needsRight: true },
  { value: 'contains', label: 'contains', needsRight: true },
  { value: 'notContains', label: 'does not contain', needsRight: true },
  { value: 'startsWith', label: 'starts with', needsRight: true },
  { value: 'endsWith', label: 'ends with', needsRight: true },
  { value: 'matches', label: 'matches regex', needsRight: true },
  { value: 'isEmpty', label: 'is empty', needsRight: false },
  { value: 'isNotEmpty', label: 'is not empty', needsRight: false },
  { value: 'isTrue', label: 'is true / non-zero', needsRight: false },
  { value: 'isFalse', label: 'is false / zero / empty', needsRight: false },
]

export type LogLevel = 'info' | 'warn' | 'error'

/**
 * What happens when a node throws (n8n-style "On Error" setting).
 *  - `stop`        — fail the whole run (default, matches historical behaviour)
 *  - `continue`    — log the error and follow the normal `out` edge
 *  - `errorOutput` — route through a dedicated `error` output port
 */
export type NodeOnError = 'stop' | 'continue' | 'errorOutput'

export const NODE_ON_ERROR_OPTIONS: { value: NodeOnError; label: string; hint: string }[] = [
  { value: 'stop', label: 'Stop the run', hint: 'Fail immediately — the whole automation stops' },
  { value: 'continue', label: 'Continue (regular output)', hint: 'Log it and keep going along the normal connection' },
  { value: 'errorOutput', label: 'Continue (error output)', hint: 'Adds a red “err” port; the error path follows it' },
]

/** Handle id of the optional error output port. */
export const ERROR_HANDLE = 'error'

/** Node types that never execute an action, so retry / on-error settings don't apply. */
export const NON_EXECUTING_TYPES: ReadonlySet<ActionType> = new Set<ActionType>([
  'COMMENT',
  'CONDITION',
  'SWITCH',
  'RANDOM',
  'PARALLEL_BRANCH',
  'STOP',
])

export function nodeSupportsErrorPolicy(type: ActionType): boolean {
  return !NON_EXECUTING_TYPES.has(type)
}

/** Effective retry / on-error policy for a node, with clamped defaults. */
export function resolveNodePolicy(params: AutomationStep['params']): {
  maxTries: number
  retryWaitMs: number
  onError: NodeOnError
} {
  const retry = params.retryOnFail === true
  const rawTries = Number(params.retryMaxTries)
  const maxTries = retry ? Math.min(10, Math.max(1, Number.isFinite(rawTries) ? Math.floor(rawTries) : 3)) : 1
  const rawWait = Number(params.retryWaitMs)
  const retryWaitMs = Math.min(60_000, Math.max(0, Number.isFinite(rawWait) ? Math.floor(rawWait) : 1000))
  const onError: NodeOnError =
    params.onError === 'continue' || params.onError === 'errorOutput' ? params.onError : 'stop'
  return { maxTries, retryWaitMs, onError }
}

export interface AutomationStep {
  id: string
  type: ActionType
  name: string
  position?: { x: number; y: number }
  params: {
    /** When true, the node is skipped at run time — execution passes straight
     * through to its first outgoing edge without running the node's action. */
    disabled?: boolean

    // --- Node settings (apply to every executing node) ---
    /** Retry the node when it throws (see retryMaxTries / retryWaitMs). */
    retryOnFail?: boolean
    /** Total attempts including the first (1–10, default 3). */
    retryMaxTries?: number
    /** Pause between attempts in ms (default 1000). */
    retryWaitMs?: number
    /** What to do when the node still fails after retries (default 'stop'). */
    onError?: NodeOnError
    /** Free-form note shown in the config dialog (n8n-style node notes). */
    notes?: string

    duration?: number
    message?: string
    port?: string
    // --- TCP Client / Server (CUSTOM_MESSAGE) ---
    /** Action mode matching the TCP tab (defaults to 'oneshot' for legacy nodes) */
    tcpMode?: TcpNodeMode
    /** Target host or bind address (supports {{vars}}; empty falls back to app host or 0.0.0.0) */
    tcpHost?: string
    /** Send payload parsed as space/colon-separated HEX bytes */
    tcpHex?: boolean
    /** Line ending appended in ASCII/UTF-8 mode */
    tcpLineEnding?: TcpLineEnding
    /** Wait for a response chunk after sending */
    tcpWaitForResponse?: boolean
    /** Timeout in ms for connect / response wait / server receive */
    tcpTimeoutMs?: number
    /** Save received payload text into this variable (plus `<name>_hex`) */
    tcpSaveResponseAs?: string
    /** TCP Server Send: target client id, or empty / 'all' to broadcast */
    tcpClientId?: string

    // --- OCR ---
    /** Optional host override for OCR send (supports {{vars}}; empty uses app host) */
    ocrHost?: string
    /** Optional variable name to capture the OCR response (in addition to lastOcrResponse) */
    ocrSaveAs?: string

    // --- FIXED_TAG / HANDHELD_TAG ---
    /** FIXED_TAG: auto-connect emulator before sending if not already connected */
    fixedAutoConnect?: boolean
    /** FIXED_TAG: optional host override when auto-connecting (supports {{vars}}) */
    fixedHost?: string
    /** FIXED_TAG: optional emulator port override when auto-connecting (default 12352) */
    fixedPort?: string
    /** HANDHELD_TAG: target handheld TCP server port (supports {{vars}}; default 10472) */
    handheldPort?: string
    epc?: string
    upc?: string
    count?: number
    /** Number or template (e.g. `{{nextSerial}}`) — Auto advances nextSerial after UPC expands. */
    startSerial?: number | string
    /** When true, SGTIN serial continues across UPC lines in upcList. Default true for new Fixed/HH nodes. */
    serialContinuesAcrossUpcLines?: boolean
    tid?: string
    uid?: string
    antenna?: string
    rssi?: string
    /** When true, each emitted tag gets its own RSSI between rssiRandMin/rssiRandMax */
    rssiRandomize?: boolean
    /** Optional random RSSI range; if empty, falls back to rssi */
    rssiRandMin?: string
    /** Optional random RSSI range; if empty, falls back to rssi */
    rssiRandMax?: string
    driver?: string
    /** FIXED_TAG / HANDHELD_TAG: ms between tags; empty uses Fixed/Handheld tab default */
    tagDelay?: string
    epcList?: string
    upcList?: string
    deviceId?: string
    /** Edge: block name for POST /activity/invoke */
    edgeBlockName?: string
    /** Edge: invoke param values keyed by param name */
    edgeParams?: Record<string, string>
    /** Edge: param order when invoking (matches block definition order) */
    edgeParamOrder?: string[]
    /** Edge: workflow name */
    edgeProcessName?: string
    edgeProcessAction?: EdgeProcessAction

    // --- Building blocks ---
    /** SET_VARIABLE: variable name */
    varName?: string
    /** SET_VARIABLE: value template (supports {{vars}}) */
    varValue?: string
    /** SET_VARIABLE: value type — validated & canonicalized on set (default 'string') */
    varType?: VarType

    // --- CODE ---
    /** CODE: programming language ('javascript' in-process, or external/built-in runtime) */
    codeLanguage?: CodeLanguage
    /** CODE: the source to run */
    codeSource?: string
    /** CODE: timeout for subprocess languages (ms) */
    codeTimeoutMs?: number
    /** CODE (subprocess): optional variable name to save full stdout */
    codeSaveStdoutAs?: string
    /** CODE (subprocess): optional variable name to save stderr */
    codeSaveStderrAs?: string
    /** CODE (subprocess): optional variable name to save process exit code */
    codeSaveExitCodeAs?: string
    /** CODE (subprocess): fail step when exit code !== 0 (default true) */
    codeFailOnNonZero?: boolean
    /** CODE (subprocess): substitute {{var}} placeholders before writing script file (default false) */
    codeInterpolateVars?: boolean

    /** DB_QUERY / DB_EXEC */
    dbSql?: string
    dbDatabase?: string
    /** Save first cell / named column into this variable */
    dbSaveAs?: string
    /** DB_QUERY: save all returned rows as a JSON array string */
    dbSaveRowsAs?: string
    dbSaveColumn?: string
    dbSaveRowIndex?: number
    /** DB_EXEC: save affected-row count into this variable */
    dbSaveAffectedAs?: string
    /** DB_EXEC: save INSERT auto-increment id into this variable */
    dbSaveInsertIdAs?: string

    // --- HTTP_REQUEST ---
    httpMethod?: HttpMethod
    /** Request URL (supports {{vars}}) */
    httpUrl?: string
    /** Raw header lines "Key: Value", one per line (supports {{vars}}) */
    httpHeaders?: string
    /** Request body (supports {{vars}}); ignored for GET/HEAD */
    httpBody?: string
    httpTimeoutMs?: number
    /** Save numeric HTTP status into this variable */
    httpSaveStatusAs?: string
    /** Save full response body text into this variable */
    httpSaveBodyAs?: string
    /** Dot/bracket path into a JSON response, saved into httpSaveJsonAs (e.g. data.items.0.epc) */
    httpJsonPath?: string
    httpSaveJsonAs?: string
    /** Fail the step (throw) on a non-2xx response */
    httpFailOnError?: boolean
    /** Attach saved ALE Basic Auth Authorization header automatically */
    httpUseAleAuth?: boolean
    /** Structured auth preset ('none' | 'bearer' | 'basic' | 'apiKey' | 'ale') */
    httpAuthType?: HttpAuthType
    httpAuthToken?: string
    httpAuthUser?: string
    httpAuthPass?: string
    httpAuthHeaderName?: string
    /** Save response headers JSON object string into this variable */
    httpSaveHeadersAs?: string

    // --- CALL_SEQUENCE ---
    /** Id of the sequence to run as a sub-routine (shares run variables) */
    callSequenceId?: string

    /** RUN_SCRIPT */
    scriptPath?: string
    scriptInline?: boolean
    scriptInlineText?: string
    scriptLang?: ScriptLang
    scriptArgs?: string
    scriptTimeoutMs?: number
    scriptSaveStdoutAs?: string
    scriptSaveStderrAs?: string
    scriptSaveExitCodeAs?: string
    /** Fail when exit code !== 0 */
    scriptFailOnNonZero?: boolean

    // --- CONDITION (branch) ---
    /** Left operand template (supports {{vars}}) */
    condLeft?: string
    /** Comparison operator */
    condOp?: ConditionOp
    /** Right operand template (ignored for unary operators) */
    condRight?: string
    /** When true, string comparisons are case-sensitive (default: insensitive) */
    condCaseSensitive?: boolean

    // --- LOG (annotate / emit message) ---
    /** Message template written to the activity log (supports {{vars}}) */
    logMessage?: string
    /** Severity — `error` can optionally abort the run */
    logLevel?: LogLevel
    /** When true and level is `error`, stop the whole run */
    logAbort?: boolean

    // --- ASSERT ---
    /** Failure message template (supports {{vars}}) */
    assertMessage?: string

    // --- WAIT_UNTIL ---
    /** Max time to wait for the condition (ms) */
    waitTimeoutMs?: number
    /** How often to re-check the condition (ms) */
    waitPollMs?: number
    /** On timeout: fail the step, or continue as if true */
    waitOnTimeout?: 'fail' | 'continue'

    // --- FOR_EACH ---
    /** List source template — JSON array, newlines, or commas (supports {{vars}}) */
    forEachSource?: string
    /** Variable name for the current item */
    forEachItemAs?: string
    /** Variable name for the 0-based index */
    forEachIndexAs?: string
    /** Sequence to run once per item (shares run variables) */
    forEachSequenceId?: string
    /** Safety cap on iterations */
    forEachMax?: number

    // --- STOP ---
    stopScope?: StopScope
    /** Optional message written to the log */
    stopMessage?: string

    // --- GENERATE ---
    generateKind?: GenerateKind
    /** Variable to store the generated value */
    generateSaveAs?: string
    generateMin?: number
    generateMax?: number
    generateHexLength?: number
    /** GENERATE (epcFromUpc): UPC/GTIN input (supports {{vars}}) */
    generateUpc?: string
    /** GENERATE (epcFromUpc): serial number (supports {{vars}}, e.g. {{nextSerial}}) */
    generateSerial?: string

    // --- COMMENT ---
    commentText?: string

    // --- TRANSFORM ---
    /** Source value template (supports {{vars}}) */
    transformInput?: string
    /** Operation applied to the input */
    transformOp?: TransformOp
    /** First argument (op-dependent; supports {{vars}}) */
    transformArg?: string
    /** Second argument (op-dependent; supports {{vars}}) */
    transformArg2?: string
    /** Variable to store the result in */
    transformSaveAs?: string

    // --- NOTIFY ---
    /** Toast title (optional; supports {{vars}}) */
    notifyTitle?: string
    /** Toast message (supports {{vars}}) */
    notifyMessage?: string
    /** Toast severity */
    notifyLevel?: NotifyLevel
    /** Also fire a native OS desktop notification */
    notifyDesktop?: boolean

    // --- LOOP_N (count-based loop) ---
    /** How many times to run the target sequence (template → number) */
    loopCount?: string
    /** Variable name for the 1-based iteration number */
    loopIndexAs?: string
    /** Sequence to run each iteration (shares run variables) */
    loopSequenceId?: string
    /** Safety cap on iterations */
    loopMax?: number

    // --- SWITCH (multi-branch) ---
    /** Value compared against each case (supports {{vars}}) */
    switchValue?: string
    /** Ordered cases; first match routes through that port */
    switchCases?: SwitchCase[]
    /** When true, comparisons are case-sensitive (default: insensitive) */
    switchCaseSensitive?: boolean
    /** When true (default), an unmatched value routes through a `default` port */
    switchHasDefault?: boolean

    // --- RANDOM (weighted branch) ---
    /** Weighted branches; one is chosen at random each run */
    randomBranches?: RandomBranch[]
    /** Optional variable to store the chosen branch index (0-based) */
    randomSaveAs?: string

    // --- FILE_READ, FILE_WRITE, FILE_LIST ---
    fileLocation?: 'local' | 'sftp' | 'ftp' | 's3'
    fileStorageProvider?: 'local' | 'sftp' | 'ftp' | 's3'
    fileConnectionId?: string
    filePath?: string
    fileContent?: string
    fileSaveAs?: string
    fileEncoding?: 'utf8' | 'utf-8' | 'json' | 'base64' | 'hex'
    filePattern?: string
    fileFilter?: string
    fileRecursive?: boolean
    fileSaveListAs?: string
    fileAppend?: boolean

    // --- SSH_EXEC ---
    sshHost?: string
    sshPort?: string
    sshUser?: string
    sshPassword?: string
    sshPrivateKeyPath?: string
    sshPassphrase?: string
    sshCommand?: string
    sshTimeoutMs?: number
    sshSaveStdoutAs?: string
    sshSaveStderrAs?: string
    sshSaveExitCodeAs?: string
    sshFailOnNonZero?: boolean

    // --- PING_PORT ---
    probeMode?: ProbeMode
    probeHost?: string
    probePort?: string
    probeUrl?: string
    probeExpectedStatus?: number
    probeTimeoutMs?: number
    probeSaveAliveAs?: string
    probeSaveLatencyAs?: string
    probeFailIfDown?: boolean

    // --- WEBSOCKET ---
    wsUrl?: string
    wsHeaders?: string
    wsSendMessage?: string
    wsWaitForMessage?: boolean
    wsMatchRegex?: string
    wsTimeoutMs?: number
    wsSaveAs?: string

    // --- WEBHOOK_SEND ---
    webhookPreset?: WebhookPreset
    webhookUrl?: string
    webhookTitle?: string
    webhookMessage?: string
    webhookColor?: string
    webhookSaveStatusAs?: string
    webhookFailOnError?: boolean

    // --- CSV_JSON ---
    csvJsonOp?: CsvJsonOp
    csvJsonInput?: string
    csvJsonInput2?: string
    csvDelimiter?: string
    csvHasHeader?: boolean
    csvFilterField?: string
    csvFilterOp?: ConditionOp
    csvFilterValue?: string
    csvMapField?: string
    csvSortField?: string
    csvSortDir?: 'asc' | 'desc'
    csvAggOp?: AggregateOp
    csvJoinSeparator?: string
    csvJsonSaveAs?: string

    // --- CRYPTO_HASH ---
    cryptoOp?: CryptoOp
    cryptoInput?: string
    cryptoSecret?: string
    cryptoByteLength?: number
    cryptoSaveAs?: string

    // --- DATETIME ---
    dtOp?: DateTimeOp
    dtInput?: string
    dtInput2?: string
    dtAmount?: number
    dtUnit?: DateTimeUnit
    dtFormat?: string
    dtSaveAs?: string

    // --- CLIPBOARD ---
    clipboardMode?: 'read' | 'write'
    clipboardText?: string
    clipboardSaveAs?: string

    // --- OPEN_APP ---
    openMode?: 'url' | 'file' | 'reveal'
    openTarget?: string

    // --- PROMPT_INPUT ---
    promptMode?: PromptInputMode
    promptTitle?: string
    promptMessage?: string
    promptDefault?: string
    promptOptions?: string
    promptSaveAs?: string
    promptCancelBehavior?: 'abort' | 'empty'

    // --- PARALLEL_BRANCH ---
    parallelBranches?: ParallelBranchItem[]
    parallelWaitMode?: ParallelWaitMode
  }
}

/**
 * A directed connection between two steps in a sequence.
 * `sourceHandle` selects which output port of the source node the edge leaves:
 * `'out'` for ordinary nodes, `'true'` / `'false'` for a CONDITION node's branches,
 * `'error'` for a node whose On Error setting is “error output”.
 */
export interface AutomationEdge {
  id: string
  /** Source step id */
  from: string
  /** Target step id */
  to: string
  /** Output port on the source node: 'out' | 'top' | 'bottom' | 'in' | 'true' | 'false' | 'case-*' | 'branch-*' | 'error' */
  sourceHandle?: string
  /** Optional target port on the destination node: 'in' | 'top' | 'bottom' | 'out' */
  targetHandle?: string
}

/**
 * True when a `sourceHandle` represents one of a standard node's 4 directional
 * regular flow handles (as opposed to an explicit branch or error port).
 */
export function isRegularOutputHandle(handle?: string): boolean {
  return !handle || handle === 'out' || handle === 'top' || handle === 'bottom' || handle === 'in'
}

/**
 * Resolve the next outgoing edge for a node given the logical output handle
 * returned by the runner (`'out'`, `'true'`, `'false'`, `'error'`, `'case-0'`, etc.).
 */
export function findNextEdge(
  edges: AutomationEdge[],
  fromId: string,
  handle: string,
): AutomationEdge | undefined {
  const exact = edges.find((e) => e.from === fromId && (e.sourceHandle ?? 'out') === handle)
  if (exact) return exact
  if (handle === 'out') {
    return edges.find((e) => e.from === fromId && isRegularOutputHandle(e.sourceHandle))
  }
  return undefined
}

export interface AutomationSequence {
  id: string
  name: string
  order: number
  steps: AutomationStep[]
  /**
   * Explicit node connections. When present (even empty), the sequence runs as a
   * graph: execution starts at the node(s) with no incoming edge and follows edges.
   * When `undefined` (legacy files), it is migrated to linear edges on load
   * (see `deriveLinearEdges` / `ensureSequenceEdges`).
   */
  edges?: AutomationEdge[]
  /** Visual group frames on canvas */
  frames?: AutomationFrame[]
}

export const ALL_ACTION_TYPES: ActionType[] = [
  'DELAY',
  'OCR',
  'FIXED_TAG',
  'HANDHELD_TAG',
  'CUSTOM_MESSAGE',
  'EDGE_BLOCK',
  'EDGE_PROCESS',
  'SET_VARIABLE',
  'DB_QUERY',
  'DB_EXEC',
  'RUN_SCRIPT',
  'HTTP_REQUEST',
  'CALL_SEQUENCE',
  'CODE',
  'CONDITION',
  'ASSERT',
  'WAIT_UNTIL',
  'FOR_EACH',
  'STOP',
  'GENERATE',
  'COMMENT',
  'LOG',
  'TRANSFORM',
  'NOTIFY',
  'LOOP_N',
  'SWITCH',
  'RANDOM',
  'FILE_READ',
  'FILE_WRITE',
  'FILE_LIST',
  'SSH_EXEC',
  'PING_PORT',
  'WEBSOCKET',
  'WEBHOOK_SEND',
  'CSV_JSON',
  'CRYPTO_HASH',
  'DATETIME',
  'CLIPBOARD',
  'OPEN_APP',
  'PROMPT_INPUT',
  'PARALLEL_BRANCH',
]

/**
 * Build a straight chain of edges connecting steps in array order
 * (step[0] → step[1] → …). Used to migrate legacy sequences that had no
 * explicit connections, preserving their original top-to-bottom run order.
 */
export function deriveLinearEdges(steps: AutomationStep[]): AutomationEdge[] {
  const edges: AutomationEdge[] = []
  for (let i = 0; i < steps.length - 1; i++) {
    edges.push({
      id: crypto.randomUUID(),
      from: steps[i].id,
      to: steps[i + 1].id,
      sourceHandle: 'out',
    })
  }
  return edges
}

/** Ensure a sequence has an `edges` array, deriving a linear chain if missing. */
export function ensureSequenceEdges(seq: AutomationSequence): AutomationSequence {
  if (seq.edges !== undefined) return seq
  return { ...seq, edges: deriveLinearEdges(seq.steps) }
}

/** Migrate legacy flat steps to sequences (one sequence with all steps) */
export function migrateStepsToSequences(steps: AutomationStep[]): AutomationSequence[] {
  if (!steps || steps.length === 0) {
    return [{ id: crypto.randomUUID(), name: 'Sequence 1', order: 0, steps: [], edges: [] }]
  }
  const migratedSteps = steps.map(s => ({ ...s, position: s.position ?? { x: 0, y: 0 } }))
  return [{
    id: crypto.randomUUID(),
    name: 'Sequence 1',
    order: 0,
    steps: migratedSteps,
    edges: deriveLinearEdges(migratedSteps),
  }]
}

/**
 * Parse an exported workflow payload (or a bare sequence array / legacy flat
 * `steps` file) into fresh, normalized sequences. Regenerates all step and
 * sequence ids, re-points edges at the new step ids, and re-points cross-sequence
 * references (Call Sequence / For Each / Loop N) at the new sequence ids so an
 * imported workflow's sub-routine links keep working. Returns `null` when the
 * payload shape is unrecognized.
 */
export function parseWorkflowSequences(raw: unknown): AutomationSequence[] | null {
  const r = raw as any
  let seqs: any[]
  if (r && Array.isArray(r.sequences)) seqs = r.sequences
  else if (Array.isArray(r)) seqs = r
  else if (r && Array.isArray(r.steps)) return migrateStepsToSequences(r.steps)
  else return null

  const validTypes = new Set<string>(ALL_ACTION_TYPES)
  // Pre-assign new sequence ids so cross-sequence references survive.
  const seqIdMap = new Map<string, string>()
  for (const s of seqs) {
    if (s && typeof s.id === 'string') seqIdMap.set(s.id, crypto.randomUUID())
  }
  const remapSeqRef = (id: unknown): string =>
    typeof id === 'string' ? (seqIdMap.get(id) ?? id) : ''

  return normalizeSequences(seqs.map((s: any) => {
    const idMap = new Map<string, string>()
    const steps: AutomationStep[] = (s.steps || []).map((st: any) => {
      const newId = crypto.randomUUID()
      if (typeof st.id === 'string') idMap.set(st.id, newId)
      const type: ActionType = validTypes.has(st.type) ? st.type : 'DELAY'
      const params = typeof st.params === 'object' && st.params !== null ? { ...st.params } : {}
      if (type === 'CALL_SEQUENCE' && 'callSequenceId' in params) params.callSequenceId = remapSeqRef(params.callSequenceId)
      if (type === 'FOR_EACH' && 'forEachSequenceId' in params) params.forEachSequenceId = remapSeqRef(params.forEachSequenceId)
      if (type === 'LOOP_N' && 'loopSequenceId' in params) params.loopSequenceId = remapSeqRef(params.loopSequenceId)
      return {
        id: newId,
        type,
        name: String(st.name || 'Step').slice(0, 100),
        position: Array.isArray(st.position)
          ? { x: st.position[0] ?? 0, y: st.position[1] ?? 0 }
          : (st.position && typeof st.position.x === 'number' ? st.position : { x: 0, y: 0 }),
        params,
      }
    })
    const edges: AutomationEdge[] | undefined = Array.isArray(s.edges)
      ? s.edges
          .filter((e: any) => e && idMap.has(e.from) && idMap.has(e.to))
          .map((e: any) => ({
            id: crypto.randomUUID(),
            from: idMap.get(e.from)!,
            to: idMap.get(e.to)!,
            sourceHandle: typeof e.sourceHandle === 'string' ? e.sourceHandle : 'out',
            ...(typeof e.targetHandle === 'string' ? { targetHandle: e.targetHandle } : {}),
          }))
      : undefined
    const frames: AutomationFrame[] | undefined = Array.isArray(s.frames)
      ? s.frames.map((f: any) => ({
          id: typeof f.id === 'string' ? f.id : crypto.randomUUID(),
          name: String(f.name || 'Group').slice(0, 80),
          color: (['blue', 'emerald', 'amber', 'purple', 'cyan', 'rose', 'slate'].includes(f.color)
            ? f.color
            : 'blue') as FrameColor,
          x: typeof f.x === 'number' ? f.x : 0,
          y: typeof f.y === 'number' ? f.y : 0,
          width: typeof f.width === 'number' ? Math.max(100, f.width) : 400,
          height: typeof f.height === 'number' ? Math.max(60, f.height) : 260,
          notes: typeof f.notes === 'string' ? f.notes : undefined,
        }))
      : []
    return {
      id: (typeof s.id === 'string' && seqIdMap.get(s.id)) || crypto.randomUUID(),
      name: String(s.name || 'Imported').slice(0, 100),
      order: typeof s.order === 'number' ? s.order : 0,
      steps,
      edges,
      frames,
    }
  }))
}

/** Normalize sequences: ensure order is sequential 0,1,2,... and edges exist. */
export function normalizeSequences(seqs: AutomationSequence[]): AutomationSequence[] {
  return [...seqs]
    .sort((a, b) => a.order - b.order)
    .map((s, i) => ({ ...ensureSequenceEdges(s), frames: s.frames ?? [], order: i }))
}

export const DEFAULT_STEP_NAMES: Record<ActionType, string> = {
  DELAY: 'Wait',
  OCR: 'Send OCR',
  FIXED_TAG: 'Fixed Reader Scan',
  HANDHELD_TAG: 'Handheld Scan',
  CUSTOM_MESSAGE: 'TCP',
  EDGE_BLOCK: 'Invoke Edge Block',
  EDGE_PROCESS: 'Edge Process',
  SET_VARIABLE: 'Set Variable',
  DB_QUERY: 'Database Query',
  DB_EXEC: 'SQL Statement',
  RUN_SCRIPT: 'Run Script',
  HTTP_REQUEST: 'HTTP Request',
  CALL_SEQUENCE: 'Call Sequence',
  CODE: 'Custom Code',
  CONDITION: 'Condition',
  ASSERT: 'Assert',
  WAIT_UNTIL: 'Wait Until',
  FOR_EACH: 'For Each',
  STOP: 'Stop',
  GENERATE: 'Generate Value',
  COMMENT: 'Comment',
  LOG: 'Log Message',
  TRANSFORM: 'Transform',
  NOTIFY: 'Notify',
  LOOP_N: 'Loop N Times',
  SWITCH: 'Switch',
  RANDOM: 'Random Branch',
  FILE_READ: 'Read File',
  FILE_WRITE: 'Write File',
  FILE_LIST: 'List Files',
  SSH_EXEC: 'SSH Command',
  PING_PORT: 'Health / Port Probe',
  WEBSOCKET: 'WebSocket',
  WEBHOOK_SEND: 'Slack / Teams / Discord',
  CSV_JSON: 'CSV & JSON Pipeline',
  CRYPTO_HASH: 'Hash / HMAC / JWT',
  DATETIME: 'Date & Time',
  CLIPBOARD: 'Clipboard',
  OPEN_APP: 'Open URL / File',
  PROMPT_INPUT: 'User Prompt',
  PARALLEL_BRANCH: 'Parallel Fork & Join',
}

export function defaultParamsForType(type: ActionType, extras?: { customPort?: string }): AutomationStep['params'] {
  const base: AutomationStep['params'] = {
    duration: 1000,
    message: type === 'CUSTOM_MESSAGE' ? '' : '{"test":1}',
    port: type === 'CUSTOM_MESSAGE' ? extras?.customPort : undefined,
    epc: '',
    upc: '',
    count: 1,
    startSerial: 1,
    tid: '',
    uid: '0000',
    antenna: '1',
    rssi: '-45.0',
    driver: 'llrp',
    epcList: '',
    upcList: '',
    deviceId: '',
    edgeBlockName: '',
    edgeParams: {},
    edgeParamOrder: [],
    edgeProcessName: '',
    edgeProcessAction: 'start',
  }
  if (type === 'SET_VARIABLE') {
    return { ...base, varName: 'myVar', varValue: '', varType: 'string' }
  }
  if (type === 'CODE') {
    return {
      ...base,
      codeLanguage: 'javascript',
      codeSource: CODE_STARTER,
      codeTimeoutMs: 15000,
      codeFailOnNonZero: true,
      codeInterpolateVars: false,
    }
  }
  if (type === 'DB_QUERY') {
    return {
      ...base,
      dbSql: 'SELECT 1 AS ok',
      dbDatabase: '',
      dbSaveAs: 'dbResult',
      dbSaveColumn: '',
      dbSaveRowIndex: 0,
    }
  }
  if (type === 'DB_EXEC') {
    return {
      ...base,
      dbSql: "UPDATE inventory SET last_seen = NOW() WHERE epc = '{{epc}}'",
      dbDatabase: '',
      dbSaveAffectedAs: 'rowsAffected',
      dbSaveInsertIdAs: '',
      dbSaveAs: '',
      dbSaveColumn: '',
      dbSaveRowIndex: 0,
    }
  }
  if (type === 'HTTP_REQUEST') {
    return {
      ...base,
      httpMethod: 'GET',
      httpUrl: 'http://{{host}}/',
      httpHeaders: 'Content-Type: application/json',
      httpBody: '',
      httpTimeoutMs: 15000,
      httpSaveStatusAs: 'httpStatus',
      httpSaveBodyAs: 'httpBody',
      httpJsonPath: '',
      httpSaveJsonAs: '',
      httpFailOnError: true,
    }
  }
  if (type === 'CALL_SEQUENCE') {
    return { ...base, callSequenceId: '' }
  }
  if (type === 'RUN_SCRIPT') {
    return {
      ...base,
      scriptPath: '',
      scriptInline: true,
      scriptInlineText:
        processPlatformHint() === 'win32'
          ? 'Write-Output "host=$env:ZEUS_HOST"'
          : 'echo "host=$ZEUS_HOST"',
      scriptArgs: '',
      scriptTimeoutMs: 30000,
      scriptSaveStdoutAs: 'scriptOut',
      scriptFailOnNonZero: true,
    }
  }
  if (type === 'CUSTOM_MESSAGE') {
    return {
      ...base,
      tcpMode: 'oneshot',
      tcpHost: '',
      port: extras?.customPort || '12345',
      message: '',
      tcpHex: false,
      tcpLineEnding: 'crlf',
      tcpWaitForResponse: false,
      tcpTimeoutMs: 3000,
      tcpSaveResponseAs: '',
      tcpClientId: 'all',
    }
  }
  if (type === 'FIXED_TAG' || type === 'HANDHELD_TAG') {
    return {
      ...base,
      tagDelay: '',
      startSerial: '{{nextSerial}}',
      serialContinuesAcrossUpcLines: true,
      ...(type === 'HANDHELD_TAG' ? { handheldPort: '10472' } : { fixedAutoConnect: false, fixedHost: '', fixedPort: '12352' }),
    }
  }
  if (type === 'CONDITION') {
    return {
      ...base,
      condLeft: '{{tagCount}}',
      condOp: 'gt',
      condRight: '0',
      condCaseSensitive: false,
    }
  }
  if (type === 'ASSERT') {
    return {
      ...base,
      condLeft: '{{tagCount}}',
      condOp: 'gt',
      condRight: '0',
      condCaseSensitive: false,
      assertMessage: 'Assertion failed: expected {{tagCount}} > 0',
    }
  }
  if (type === 'WAIT_UNTIL') {
    return {
      ...base,
      condLeft: '{{dbResult}}',
      condOp: 'isNotEmpty',
      condRight: '',
      condCaseSensitive: false,
      waitTimeoutMs: 10000,
      waitPollMs: 500,
      waitOnTimeout: 'fail',
    }
  }
  if (type === 'FOR_EACH') {
    return {
      ...base,
      forEachSource: '{{epcs}}',
      forEachItemAs: 'item',
      forEachIndexAs: 'index',
      forEachSequenceId: '',
      forEachMax: 500,
    }
  }
  if (type === 'STOP') {
    return {
      ...base,
      stopScope: 'sequence',
      stopMessage: 'Stopped',
    }
  }
  if (type === 'GENERATE') {
    return {
      ...base,
      generateKind: 'uuid',
      generateSaveAs: 'generated',
      generateMin: 0,
      generateMax: 9999,
      generateHexLength: 16,
    }
  }
  if (type === 'COMMENT') {
    return {
      ...base,
      commentText: 'Notes for this part of the flow…',
    }
  }
  if (type === 'LOG') {
    return {
      ...base,
      logMessage: 'Checkpoint reached',
      logLevel: 'info',
      logAbort: false,
    }
  }
  if (type === 'TRANSFORM') {
    return {
      ...base,
      transformInput: '{{epc}}',
      transformOp: 'upper',
      transformArg: '',
      transformArg2: '',
      transformSaveAs: 'transformed',
    }
  }
  if (type === 'NOTIFY') {
    return {
      ...base,
      notifyTitle: '',
      notifyMessage: 'Sent {{tagCount}} tag(s) to {{host}}',
      notifyLevel: 'info',
    }
  }
  if (type === 'LOOP_N') {
    return {
      ...base,
      loopCount: '3',
      loopIndexAs: 'i',
      loopSequenceId: '',
      loopMax: 1000,
    }
  }
  if (type === 'SWITCH') {
    return {
      ...base,
      switchValue: '{{tagCount}}',
      switchCases: [{ value: '0' }, { value: '1' }],
      switchCaseSensitive: false,
      switchHasDefault: true,
    }
  }
  if (type === 'RANDOM') {
    return {
      ...base,
      randomBranches: [
        { weight: 1, label: 'A' },
        { weight: 1, label: 'B' },
      ],
      randomSaveAs: '',
    }
  }
  if (type === 'FILE_READ') {
    return {
      ...base,
      fileLocation: 'local',
      fileStorageProvider: 'local',
      filePath: './data/tags.csv',
      fileEncoding: 'utf-8',
      fileSaveAs: 'fileContent',
    }
  }
  if (type === 'FILE_WRITE') {
    return {
      ...base,
      fileLocation: 'local',
      fileStorageProvider: 'local',
      filePath: './data/output.csv',
      fileContent: '{{epcs}}',
      fileEncoding: 'utf-8',
      fileAppend: false,
    }
  }
  if (type === 'FILE_LIST') {
    return {
      ...base,
      fileLocation: 'local',
      fileStorageProvider: 'local',
      filePath: './data',
      fileFilter: '*.csv',
      fileSaveAs: 'fileList',
    }
  }
  if (type === 'SSH_EXEC') {
    return {
      ...base,
      sshHost: '{{host}}',
      sshPort: '22',
      sshUser: 'root',
      sshPassword: '',
      sshPrivateKeyPath: '',
      sshCommand: 'uptime',
      sshTimeoutMs: 15000,
      sshSaveStdoutAs: 'sshOut',
      sshSaveStderrAs: 'sshErr',
      sshSaveExitCodeAs: 'sshCode',
      sshFailOnNonZero: true,
    }
  }
  if (type === 'PING_PORT') {
    return {
      ...base,
      probeMode: 'tcp',
      probeHost: '{{host}}',
      probePort: '80',
      probeUrl: 'https://httpbin.org/status/200',
      probeExpectedStatus: 200,
      probeTimeoutMs: 4000,
      probeSaveAliveAs: 'isAlive',
      probeSaveLatencyAs: 'latencyMs',
      probeFailIfDown: false,
    }
  }
  if (type === 'WEBSOCKET') {
    return {
      ...base,
      wsUrl: 'wss://echo.websocket.events',
      wsHeaders: '',
      wsSendMessage: 'hello',
      wsWaitForMessage: true,
      wsMatchRegex: '',
      wsTimeoutMs: 8000,
      wsSaveAs: 'wsMessage',
    }
  }
  if (type === 'WEBHOOK_SEND') {
    return {
      ...base,
      webhookPreset: 'slack',
      webhookUrl: '',
      webhookTitle: 'Workflow Alert',
      webhookMessage: 'Sequence completed on {{host}}',
      webhookColor: '#10b981',
      webhookSaveStatusAs: 'webhookStatus',
      webhookFailOnError: true,
    }
  }
  if (type === 'CSV_JSON') {
    return {
      ...base,
      csvJsonOp: 'csvToJson',
      csvJsonInput: '{{fileContent}}',
      csvDelimiter: ',',
      csvHasHeader: true,
      csvFilterOp: 'eq',
      csvSortDir: 'asc',
      csvAggOp: 'sum',
      csvJoinSeparator: ', ',
      csvJsonSaveAs: 'rows',
    }
  }
  if (type === 'CRYPTO_HASH') {
    return {
      ...base,
      cryptoOp: 'sha256',
      cryptoInput: '{{httpBody}}',
      cryptoSecret: '',
      cryptoByteLength: 24,
      cryptoSaveAs: 'hash',
    }
  }
  if (type === 'DATETIME') {
    return {
      ...base,
      dtOp: 'now',
      dtInput: '{{timestamp}}',
      dtAmount: 1,
      dtUnit: 'hours',
      dtFormat: 'YYYY-MM-DD HH:mm:ss',
      dtSaveAs: 'now',
    }
  }
  if (type === 'CLIPBOARD') {
    return {
      ...base,
      clipboardMode: 'write',
      clipboardText: '{{epc}}',
      clipboardSaveAs: 'clipboardText',
    }
  }
  if (type === 'OPEN_APP') {
    return {
      ...base,
      openMode: 'url',
      openTarget: 'https://example.com',
    }
  }
  if (type === 'PROMPT_INPUT') {
    return {
      ...base,
      promptMode: 'text',
      promptTitle: 'Input Required',
      promptMessage: 'Enter value to continue:',
      promptDefault: '',
      promptOptions: 'Option A, Option B',
      promptSaveAs: 'userInput',
      promptCancelBehavior: 'abort',
    }
  }
  if (type === 'PARALLEL_BRANCH') {
    return {
      ...base,
      parallelBranches: [{ label: 'Branch A' }, { label: 'Branch B' }],
      parallelWaitMode: 'all',
    }
  }
  return base
}

function processPlatformHint(): string {
  try {
    return typeof navigator !== 'undefined' && /Win/i.test(navigator.platform) ? 'win32' : 'unix'
  } catch {
    return 'unix'
  }
}
