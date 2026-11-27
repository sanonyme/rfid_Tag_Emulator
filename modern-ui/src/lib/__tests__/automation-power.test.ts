import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { executeHttpRequest, executeRunScript } from '../automation-blocks'
import {
  CRON_PRESETS,
  cronMinuteKey,
  getNextCronDate,
  matchesCron,
  validateCronExpression,
} from '../automation-cron'
import { getNodeOutputs } from '../automation-layout'
import { NODE_CATALOG } from '../automation-node-catalog'
import { getStepSummary, NODE_VISUAL_STYLES } from '../automation-node-styles'
import {
  buildWebhookPayload,
  decodeJwtPayload,
  executeClipboard,
  executeCryptoHash,
  executeCsvJson,
  executeDateTime,
  executeOpenApp,
  executePingPort,
  executeSshExec,
  executeWebhookSend,
  executeWebSocket,
  formatDateTime,
  parseCsv,
  toCsv,
} from '../automation-power-blocks'
import { WORKFLOW_TEMPLATES } from '../automation-templates'
import {
  ALL_ACTION_TYPES,
  CODE_LANGUAGE_OPTIONS,
  CODE_STARTERS,
  DEFAULT_STEP_NAMES,
  defaultParamsForType,
  type ActionType,
  type AutomationSequence,
  type AutomationStep,
} from '../automation-types'
import { validateSequence } from '../automation-validation'
import { buildVaultRunVars, normalizeVaultEntries, redactSecrets } from '../automation-vault'

function makeStep(
  type: ActionType,
  params: Partial<AutomationStep['params']> = {},
  id = 'step_1',
): AutomationStep {
  return {
    id,
    type,
    name: DEFAULT_STEP_NAMES[type],
    params: { ...defaultParamsForType(type), ...params },
  }
}

describe('Automation Cron Engine', () => {
  it('validates standard 5-field cron expressions and rejects malformed ones', () => {
    for (const preset of CRON_PRESETS) {
      expect(validateCronExpression(preset.expr).valid).toBe(true)
    }
    expect(validateCronExpression('0 9 * * 1-5').valid).toBe(true)
    expect(validateCronExpression('*/10 8-18 1,15 * 0,7').valid).toBe(true)

    expect(validateCronExpression('* * *').valid).toBe(false)
    expect(validateCronExpression('65 * * * *').valid).toBe(false)
    expect(validateCronExpression('* 25 * * *').valid).toBe(false)
    expect(validateCronExpression('*/0 * * * *').valid).toBe(false)
    expect(validateCronExpression('10-5 * * * *').valid).toBe(false)
  })

  it('matches dates against cron expressions (including Sunday 0 and 7)', () => {
    // 2026-11-27 is a Friday (dayOfWeek = 5)
    const friday0830 = new Date(2026, 10, 27, 8, 30, 0, 0)
    expect(matchesCron('30 8 * * 1-5', friday0830)).toBe(true)
    expect(matchesCron('30 8 * * 0,6', friday0830)).toBe(false)
    expect(matchesCron('*/15 8 * * *', friday0830)).toBe(true)

    // 2026-11-29 is a Sunday (dayOfWeek = 0)
    const sunday1200 = new Date(2026, 10, 29, 12, 0, 0, 0)
    expect(matchesCron('0 12 * * 0', sunday1200)).toBe(true)
    expect(matchesCron('0 12 * * 7', sunday1200)).toBe(true)
  })

  it('computes the next matching run date and minute key', () => {
    const base = new Date(2026, 10, 27, 8, 25, 42, 0)
    const next = getNextCronDate('30 8 * * *', base)
    expect(next).not.toBeNull()
    expect(next!.getHours()).toBe(8)
    expect(next!.getMinutes()).toBe(30)
    expect(next!.getSeconds()).toBe(0)
    expect(cronMinuteKey(next!)).toBe('2026-11-27 08:30')
  })
})

describe('Automation Env Vars & Secrets Vault', () => {
  it('normalizes entries, builds flat template vars, and redacts sensitive secrets', () => {
    const normalized = normalizeVaultEntries([
      { key: 'BASE_URL', value: 'https://api.example.com' },
      { key: 'BASE_URL', value: 'duplicate-ignored' },
      { key: '123INVALID', value: 'bad-key' },
      { key: 'SHORT', value: 'ab' },
    ])
    expect(normalized).toEqual([
      { key: 'BASE_URL', value: 'https://api.example.com' },
      { key: 'SHORT', value: 'ab' },
    ])

    const vars = buildVaultRunVars(
      [{ key: 'HOST', value: '10.0.0.5' }],
      [
        { key: 'API_KEY', value: 'super-secret-token-123' },
        { key: 'PIN', value: '12' }, // too short (<4 chars) to avoid noisy redaction
      ],
    )
    expect(vars['env.HOST']).toBe('10.0.0.5')
    expect(vars['secret.API_KEY']).toBe('super-secret-token-123')
    expect(vars['secret.PIN']).toBe('12')

    const redacted = redactSecrets(
      'Authorization Bearer super-secret-token-123 PIN=12 ok',
      ['super-secret-token-123', '12'],
    )
    expect(redacted).toBe('Authorization Bearer *** PIN=12 ok')
  })
})

describe('CSV / JSON Pipeline Block', () => {
  it('parses RFC-4180 CSV with quotes/newlines and serializes back to CSV', () => {
    const csv = 'epc,note,qty\nE20001,"hello, world",3\nE20002,"quote ""hi""",5'
    const parsed = parseCsv(csv, ',', true) as Record<string, string>[]
    expect(parsed).toHaveLength(2)
    expect(parsed[0]).toEqual({ epc: 'E20001', note: 'hello, world', qty: '3' })
    expect(parsed[1]).toEqual({ epc: 'E20002', note: 'quote "hi"', qty: '5' })

    const back = toCsv(parsed, ',')
    expect(back).toContain('"hello, world"')
    expect(back).toContain('"quote ""hi"""')
  })

  it('executes filterArray, mapField, sortArray, aggregate, and mergeJson', async () => {
    const log = vi.fn()
    const items = [
      { id: 1, tag: 'alpha', score: 10, meta: { zone: 'A' } },
      { id: 2, tag: 'beta', score: 35, meta: { zone: 'B' } },
      { id: 3, tag: 'gamma', score: 25, meta: { zone: 'A' } },
    ]
    const vars: Record<string, string> = { items: JSON.stringify(items) }

    await executeCsvJson(
      makeStep('CSV_JSON', {
        csvJsonOp: 'filterArray',
        csvJsonInput: '{{items}}',
        csvFilterField: 'meta.zone',
        csvFilterOp: 'eq',
        csvFilterValue: 'A',
        csvJsonSaveAs: 'zoneA',
      }),
      vars,
      log,
    )
    expect(vars.zoneA_count).toBe('2')
    expect(JSON.parse(vars.zoneA)).toHaveLength(2)

    await executeCsvJson(
      makeStep('CSV_JSON', {
        csvJsonOp: 'sortArray',
        csvJsonInput: '{{zoneA}}',
        csvSortField: 'score',
        csvSortDir: 'desc',
        csvJsonSaveAs: 'sorted',
      }),
      vars,
      log,
    )
    expect(JSON.parse(vars.sorted).map((r: any) => r.id)).toEqual([3, 1])

    await executeCsvJson(
      makeStep('CSV_JSON', {
        csvJsonOp: 'mapField',
        csvJsonInput: '{{sorted}}',
        csvMapField: 'tag',
        csvJsonSaveAs: 'tags',
      }),
      vars,
      log,
    )
    expect(JSON.parse(vars.tags)).toEqual(['gamma', 'alpha'])

    await executeCsvJson(
      makeStep('CSV_JSON', {
        csvJsonOp: 'aggregate',
        csvJsonInput: '{{items}}',
        csvMapField: 'score',
        csvAggOp: 'sum',
        csvJsonSaveAs: 'totalScore',
      }),
      vars,
      log,
    )
    expect(vars.totalScore).toBe('70')

    await executeCsvJson(
      makeStep('CSV_JSON', {
        csvJsonOp: 'mergeJson',
        csvJsonInput: '{"a":1,"b":2}',
        csvJsonInput2: '{"b":99,"c":3}',
        csvJsonSaveAs: 'merged',
      }),
      vars,
      log,
    )
    expect(JSON.parse(vars.merged)).toEqual({ a: 1, b: 99, c: 3 })
  })
})

describe('Crypto & DateTime Blocks', () => {
  it('decodes JWT headers and payloads and runs WebCrypto SHA-256 / HMAC / RandomToken', async () => {
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
    const payload = Buffer.from(JSON.stringify({ sub: 'user-42', role: 'admin' })).toString('base64url')
    const token = `Bearer ${header}.${payload}.sig`

    const decoded = decodeJwtPayload(token)
    expect(decoded.header).toEqual({ alg: 'HS256', typ: 'JWT' })
    expect(decoded.payload).toEqual({ sub: 'user-42', role: 'admin' })

    const vars: Record<string, string> = { jwt: token, msg: 'zeus' }
    const log = vi.fn()

    await executeCryptoHash(
      makeStep('CRYPTO_HASH', {
        cryptoOp: 'jwtDecode',
        cryptoInput: '{{jwt}}',
        cryptoSaveAs: 'claims',
      }),
      vars,
      log,
    )
    expect(JSON.parse(vars.claims)).toEqual({ sub: 'user-42', role: 'admin' })
    expect(JSON.parse(vars.claims_header)).toEqual({ alg: 'HS256', typ: 'JWT' })

    await executeCryptoHash(
      makeStep('CRYPTO_HASH', {
        cryptoOp: 'sha256',
        cryptoInput: '{{msg}}',
        cryptoSaveAs: 'digest',
      }),
      vars,
      log,
    )
    expect(vars.digest).toMatch(/^[0-9a-f]{64}$/)

    await executeCryptoHash(
      makeStep('CRYPTO_HASH', {
        cryptoOp: 'hmacSha256',
        cryptoInput: '{{msg}}',
        cryptoSecret: 'my-secret',
        cryptoSaveAs: 'sig',
      }),
      vars,
      log,
    )
    expect(vars.sig).toMatch(/^[0-9a-f]{64}$/)

    await executeCryptoHash(
      makeStep('CRYPTO_HASH', {
        cryptoOp: 'randomToken',
        cryptoByteLength: 16,
        cryptoSaveAs: 'nonce',
      }),
      vars,
      log,
    )
    expect(vars.nonce.length).toBeGreaterThanOrEqual(20)
  })

  it('formats dates, adds offsets, and computes diffs', async () => {
    const vars: Record<string, string> = {}
    const log = vi.fn()

    const d = new Date('2026-11-27T10:05:09.123Z')
    expect(formatDateTime(d, 'ISO')).toBe('2026-11-27T10:05:09.123Z')
    expect(formatDateTime(d, 'unixSec')).toBe(String(Math.floor(d.getTime() / 1000)))

    await executeDateTime(
      makeStep('DATETIME', {
        dtOp: 'add',
        dtInput: '2026-11-27T10:00:00.000Z',
        dtAmount: 2,
        dtUnit: 'hours',
        dtFormat: 'ISO',
        dtSaveAs: 'later',
      }),
      vars,
      log,
    )
    expect(vars.later).toBe('2026-11-27T12:00:00.000Z')

    await executeDateTime(
      makeStep('DATETIME', {
        dtOp: 'diff',
        dtInput: '2026-11-27T10:00:00.000Z',
        dtInput2: '{{later}}',
        dtUnit: 'minutes',
        dtSaveAs: 'minsDiff',
      }),
      vars,
      log,
    )
    expect(vars.minsDiff).toBe('120')
    expect(vars.minsDiff_ms).toBe(String(120 * 60_000))
  })
})

describe('Webhook Builder & Mocked Electron Power Integrations', () => {
  const originalElectronAPI = (window as any).electronAPI

  beforeEach(() => {
    ;(window as any).electronAPI = {
      aleRequest: vi.fn(),
      automationRunScript: vi.fn(),
      automationSshExec: vi.fn(),
      automationNetProbe: vi.fn(),
      automationWsRequest: vi.fn(),
      automationClipboardRead: vi.fn(),
      automationClipboardWrite: vi.fn(),
      automationOpenTarget: vi.fn(),
    }
  })

  afterEach(() => {
    ;(window as any).electronAPI = originalElectronAPI
    vi.restoreAllMocks()
  })

  it('builds Slack, Discord, Teams, and Generic JSON webhook payloads and sends via Electron', async () => {
    const slack = JSON.parse(
      buildWebhookPayload({ preset: 'slack', title: 'Deploy', message: 'Done', color: '#10b981' }),
    )
    expect(slack.text).toContain('*Deploy*')
    expect(slack.attachments[0].color).toBe('#10b981')

    const discord = JSON.parse(
      buildWebhookPayload({ preset: 'discord', title: 'Alert', message: 'Check CPU', color: '#ff0000' }),
    )
    expect(discord.embeds[0].color).toBe(0xff0000)

    const teams = JSON.parse(
      buildWebhookPayload({ preset: 'teams', title: 'Status', message: 'Green', color: '#22c55e' }),
    )
    expect(teams['@type']).toBe('MessageCard')
    expect(teams.themeColor).toBe('22c55e')

    const rawJson = buildWebhookPayload({
      preset: 'generic',
      title: 'Ignored',
      message: '{"event":"ok"}',
    })
    expect(rawJson).toBe('{"event":"ok"}')

    const api = (window as any).electronAPI
    api.aleRequest.mockResolvedValue({ ok: true, status: 204, statusText: 'No Content', headers: {}, body: '' })
    const vars: Record<string, string> = {}
    await executeWebhookSend(
      makeStep('WEBHOOK_SEND', {
        webhookPreset: 'discord',
        webhookUrl: 'https://discord.com/api/webhooks/1/2',
        webhookTitle: 'Hello',
        webhookMessage: 'World',
        webhookSaveStatusAs: 'whStatus',
      }),
      vars,
      vi.fn(),
    )
    expect(vars.whStatus).toBe('204')
    expect(api.aleRequest).toHaveBeenCalledWith(
      'https://discord.com/api/webhooks/1/2',
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('executes SSH_EXEC, PING_PORT, WEBSOCKET, CLIPBOARD, and OPEN_APP via Electron IPC', async () => {
    const api = (window as any).electronAPI
    const vars: Record<string, string> = { 'secret.SSH_PW': 'p4ss' }
    const log = vi.fn()

    api.automationSshExec.mockResolvedValue({
      ok: true,
      stdout: 'up 14 days\n',
      stderr: '',
      exitCode: 0,
    })
    await executeSshExec(
      makeStep('SSH_EXEC', {
        sshHost: '10.0.0.10',
        sshUser: 'ubuntu',
        sshPassword: '{{secret.SSH_PW}}',
        sshCommand: 'uptime',
        sshSaveStdoutAs: 'uptimeOut',
        sshSaveExitCodeAs: 'sshCode',
      }),
      vars,
      log,
    )
    expect(vars.uptimeOut).toBe('up 14 days')
    expect(vars.sshCode).toBe('0')

    api.automationNetProbe.mockResolvedValue({
      ok: true,
      alive: true,
      latencyMs: 14,
      detail: 'TCP 10.0.0.10:22 open',
    })
    await executePingPort(
      makeStep('PING_PORT', {
        probeMode: 'tcp',
        probeHost: '10.0.0.10',
        probePort: '22',
        probeSaveAliveAs: 'sshUp',
        probeSaveLatencyAs: 'sshLat',
      }),
      vars,
      log,
    )
    expect(vars.sshUp).toBe('true')
    expect(vars.sshLat).toBe('14')

    api.automationWsRequest.mockResolvedValue({
      ok: true,
      received: '{"pong":true}',
      latencyMs: 21,
    })
    await executeWebSocket(
      makeStep('WEBSOCKET', {
        wsUrl: 'wss://echo.example.com',
        wsSendMessage: '{"ping":true}',
        wsSaveAs: 'wsRx',
      }),
      vars,
      log,
    )
    expect(vars.wsRx).toBe('{"pong":true}')

    api.automationClipboardWrite.mockResolvedValue({ ok: true })
    await executeClipboard(
      makeStep('CLIPBOARD', { clipboardMode: 'write', clipboardText: '{{uptimeOut}}' }),
      vars,
      log,
    )
    expect(api.automationClipboardWrite).toHaveBeenCalledWith('up 14 days')

    api.automationClipboardRead.mockResolvedValue({ ok: true, text: 'copied-text' })
    await executeClipboard(
      makeStep('CLIPBOARD', { clipboardMode: 'read', clipboardSaveAs: 'clip' }),
      vars,
      log,
    )
    expect(vars.clip).toBe('copied-text')

    api.automationOpenTarget.mockResolvedValue({ ok: true })
    await executeOpenApp(
      makeStep('OPEN_APP', { openMode: 'url', openTarget: 'https://example.com' }),
      vars,
      log,
    )
    expect(api.automationOpenTarget).toHaveBeenCalledWith({
      mode: 'url',
      target: 'https://example.com',
    })
  })

  it('applies HTTP Auth presets, captures response headers, and runs multi-language scripts', async () => {
    const api = (window as any).electronAPI
    const vars: Record<string, string> = { 'secret.TOKEN': 'tok-abc' }
    const log = vi.fn()

    api.aleRequest.mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: { 'x-request-id': 'req-99', 'content-type': 'application/json' },
      body: '{"ok":true}',
    })
    await executeHttpRequest(
      makeStep('HTTP_REQUEST', {
        httpMethod: 'GET',
        httpUrl: 'https://api.example.com/status',
        httpAuthType: 'bearer',
        httpAuthToken: '{{secret.TOKEN}}',
        httpSaveBodyAs: 'apiBody',
        httpSaveHeadersAs: 'apiHeaders',
      }),
      vars,
      log,
    )
    expect(api.aleRequest).toHaveBeenCalledWith(
      'https://api.example.com/status',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer tok-abc' }),
      }),
    )
    expect(JSON.parse(vars.apiHeaders)).toEqual({
      'x-request-id': 'req-99',
      'content-type': 'application/json',
    })

    api.automationRunScript.mockResolvedValue({
      ok: true,
      stdout: 'py-ok\n',
      stderr: 'warn-line\n',
      exitCode: 0,
    })
    await executeRunScript(
      makeStep('RUN_SCRIPT', {
        scriptInline: true,
        scriptLang: 'py',
        scriptInlineText: 'print("py-ok")',
        scriptSaveStdoutAs: 'pyOut',
        scriptSaveStderrAs: 'pyErr',
        scriptSaveExitCodeAs: 'pyCode',
      }),
      vars,
      log,
    )
    expect(api.automationRunScript).toHaveBeenCalledWith(
      expect.objectContaining({ ext: '.py' }),
    )
    expect(vars.pyOut).toBe('py-ok')
    expect(vars.pyErr).toBe('warn-line')
    expect(vars.pyCode).toBe('0')
  })
})

describe('Node Catalog, Layout, Validation & Templates Completeness', () => {
  it('registers styles, catalog items, default names, params, and summaries for all action types', () => {
    const catalogTypes = new Set(NODE_CATALOG.map((c) => c.type))
    for (const type of ALL_ACTION_TYPES) {
      expect(catalogTypes.has(type)).toBe(true)
      expect(NODE_VISUAL_STYLES[type]).toBeDefined()
      expect(DEFAULT_STEP_NAMES[type]).toBeTruthy()
      const step = makeStep(type)
      expect(typeof getStepSummary(step).text).toBe('string')
    }
  })

  it('exposes starters and summary badges for all multi-language Custom Code options', () => {
    expect(CODE_LANGUAGE_OPTIONS.length).toBeGreaterThanOrEqual(11)
    for (const opt of CODE_LANGUAGE_OPTIONS) {
      expect(CODE_STARTERS[opt.value]).toBeTruthy()
      const summary = getStepSummary(makeStep('CODE', { codeLanguage: opt.value, codeSource: CODE_STARTERS[opt.value] }))
      expect(summary.chip).toBe(opt.badge)
    }
  })

  it('exposes PARALLEL_BRANCH branch handles and AFTER ALL done handle', () => {
    const step = makeStep('PARALLEL_BRANCH', {
      parallelBranches: [{ label: 'A' }, { label: 'B' }, { label: 'C' }],
    })
    const outputs = getNodeOutputs(step)
    expect(outputs.map((o) => o.handle)).toEqual(['branch-0', 'branch-1', 'branch-2', 'done'])
  })

  it('validates new node requirements and loads all 5 new general-purpose templates cleanly', () => {
    const badSeq: AutomationSequence = {
      id: 'bad',
      name: 'Bad',
      order: 0,
      steps: [
        makeStep('SSH_EXEC', { sshHost: '', sshUser: '', sshCommand: '' }, 's1'),
        makeStep('WEBHOOK_SEND', { webhookUrl: '' }, 's2'),
        makeStep('PROMPT_INPUT', { promptSaveAs: '' }, 's3'),
      ],
      edges: [],
    }
    const issues = validateSequence(badSeq, [badSeq])
    expect(issues.some((i) => i.stepId === 's1' && i.severity === 'error')).toBe(true)
    expect(issues.some((i) => i.stepId === 's2' && i.severity === 'error')).toBe(true)
    expect(issues.some((i) => i.stepId === 's3' && i.severity === 'error')).toBe(true)

    expect(WORKFLOW_TEMPLATES.length).toBeGreaterThanOrEqual(24)
    const seenIds = new Set<string>()
    for (const tpl of WORKFLOW_TEMPLATES) {
      expect(seenIds.has(tpl.id)).toBe(false)
      seenIds.add(tpl.id)
      const seqs = tpl.build()
      expect(seqs.length).toBeGreaterThanOrEqual(1)
      const totalSteps = seqs.reduce((acc, s) => acc + s.steps.length, 0)
      expect(tpl.nodeCount).toBe(totalSteps)
      for (const seq of seqs) {
        const tplIssues = validateSequence(seq, seqs)
        expect(tplIssues.filter((i) => i.severity === 'error')).toEqual([])
      }
    }
  })
})
