import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  defaultParamsForType,
  findNextEdge,
  isRegularOutputHandle,
  type ActionType,
  type AutomationEdge,
  type AutomationSequence,
  type AutomationStep,
} from '../automation-types'
import {
  applyTransform,
  executeDbQuery,
  executeFileList,
  executeFileRead,
  executeFileWrite,
  executeGenerate,
  executeHttpRequest,
  executeTcpNode,
} from '../automation-blocks'
import { NODE_CATALOG } from '../automation-node-catalog'
import { computeAutoLayout, getNodeHeight, getNodeOutputs, NODE_HEIGHT } from '../automation-layout'
import { validateSequence } from '../automation-validation'
import { WORKFLOW_TEMPLATES } from '../automation-templates'
import { getStepSummary, NODE_VISUAL_STYLES } from '../automation-node-styles'

function makeStep(
  id: string,
  type: ActionType,
  params: Partial<AutomationStep['params']> = {},
  name: string = type,
): AutomationStep {
  return {
    id,
    type,
    name,
    position: { x: 0, y: 0 },
    params: { ...defaultParamsForType(type), ...params },
  }
}

describe('automation-layout', () => {
  it('computes LR hierarchical positions with increasing x along directed edges', () => {
    const steps = [
      makeStep('a', 'DELAY'),
      makeStep('b', 'CONDITION'),
      makeStep('c', 'LOG'),
      makeStep('d', 'NOTIFY'),
    ]
    const edges: AutomationEdge[] = [
      { id: 'e1', from: 'a', to: 'b', sourceHandle: 'out' },
      { id: 'e2', from: 'b', to: 'c', sourceHandle: 'true' },
      { id: 'e3', from: 'b', to: 'd', sourceHandle: 'false' },
    ]
    const pos = computeAutoLayout(steps, edges, 'LR')
    expect(pos.size).toBe(4)
    expect(pos.get('a')!.x).toBeLessThan(pos.get('b')!.x)
    expect(pos.get('b')!.x).toBeLessThan(pos.get('c')!.x)
    expect(pos.get('b')!.x).toBeLessThan(pos.get('d')!.x)
    expect(pos.get('c')!.y).not.toBe(pos.get('d')!.y)
  })

  it('computes TB hierarchical positions and places standalone comments below the graph', () => {
    const steps = [
      makeStep('a', 'DELAY'),
      makeStep('b', 'LOG'),
      makeStep('note', 'COMMENT', { commentText: 'Heads up' }),
    ]
    const edges: AutomationEdge[] = [{ id: 'e1', from: 'a', to: 'b', sourceHandle: 'out' }]
    const pos = computeAutoLayout(steps, edges, 'TB')
    expect(pos.get('a')!.y).toBeLessThan(pos.get('b')!.y)
    expect(pos.get('note')!.y).toBeGreaterThan(pos.get('b')!.y)
  })

  it('tolerates self-loops without throwing', () => {
    const steps = [makeStep('a', 'DELAY')]
    const edges: AutomationEdge[] = [{ id: 'loop', from: 'a', to: 'a', sourceHandle: 'out' }]
    const pos = computeAutoLayout(steps, edges, 'LR')
    expect(pos.has('a')).toBe(true)
  })

  it('exposes multi-branch and error output ports accurately', () => {
    const cond = makeStep('c', 'CONDITION')
    expect(getNodeOutputs(cond).map((o) => o.handle)).toEqual(['true', 'false'])

    const httpWithErr = makeStep('h', 'HTTP_REQUEST', { onError: 'errorOutput' })
    expect(getNodeOutputs(httpWithErr).map((o) => o.handle)).toEqual(['out', 'error'])

    const sw = makeStep('s', 'SWITCH', {
      switchCases: [
        { value: '1', label: 'One' },
        { value: '2', label: 'Two' },
        { value: '3', label: 'Three' },
      ],
      switchHasDefault: true,
    })
    expect(getNodeOutputs(sw)).toHaveLength(4)
    expect(getNodeHeight(sw)).toBeGreaterThanOrEqual(NODE_HEIGHT)
  })
})

describe('automation-validation', () => {
  it('returns zero issues for a valid wired workflow', () => {
    const seq: AutomationSequence = {
      id: 'seq-1',
      name: 'Clean Flow',
      order: 0,
      steps: [
        makeStep('s1', 'FIXED_TAG', { upcList: '00000000000001,2' }),
        makeStep('s2', 'HTTP_REQUEST', { httpUrl: 'http://localhost/ping' }),
      ],
      edges: [{ id: 'e1', from: 's1', to: 's2', sourceHandle: 'out' }],
    }
    expect(validateSequence(seq, [seq])).toEqual([])
  })

  it('reports configuration errors, broken references, and disconnected nodes', () => {
    const seq: AutomationSequence = {
      id: 'seq-1',
      name: 'Broken Flow',
      order: 0,
      steps: [
        makeStep('s1', 'HTTP_REQUEST', { httpUrl: '' }, 'Empty HTTP'),
        makeStep('s2', 'CALL_SEQUENCE', { callSequenceId: 'deleted-seq-id' }, 'Broken Call'),
        makeStep('s3', 'CONDITION', {}, 'Unwired Cond'),
        makeStep('s4', 'FIXED_TAG', { upcList: '', epcList: '', upc: '', epc: '' }, 'No Tags'),
      ],
      edges: [],
    }
    const issues = validateSequence(seq, [seq])
    expect(issues.some((i) => i.stepId === 's1' && i.severity === 'error')).toBe(true)
    expect(issues.some((i) => i.stepId === 's2' && i.message.includes('deleted'))).toBe(true)
    expect(issues.some((i) => i.stepId === 's3' && i.severity === 'warning')).toBe(true)
    expect(issues.some((i) => i.stepId === 's4' && i.severity === 'error')).toBe(true)
    expect(issues.filter((i) => i.message.includes('disconnected')).length).toBe(4)
  })

  it('skips validation for disabled nodes and comments', () => {
    const seq: AutomationSequence = {
      id: 'seq-1',
      name: 'Disabled Node',
      order: 0,
      steps: [
        makeStep('s1', 'HTTP_REQUEST', { httpUrl: '', disabled: true }),
        makeStep('note', 'COMMENT', { commentText: 'Doc note' }),
      ],
      edges: [],
    }
    expect(validateSequence(seq, [seq])).toEqual([])
  })
})

describe('automation-templates', () => {
  it('builds valid sequences with matching edge endpoints for every template', () => {
    expect(WORKFLOW_TEMPLATES.length).toBeGreaterThanOrEqual(5)
    for (const tpl of WORKFLOW_TEMPLATES) {
      const seqs = tpl.build()
      expect(seqs.length).toBeGreaterThan(0)
      for (const seq of seqs) {
        expect(seq.steps.length).toBeGreaterThan(0)
        const stepIds = new Set(seq.steps.map((s) => s.id))
        for (const edge of seq.edges ?? []) {
          expect(stepIds.has(edge.from)).toBe(true)
          expect(stepIds.has(edge.to)).toBe(true)
        }
        // Templates should have zero validation errors out of the box
        const errors = validateSequence(seq, seqs).filter((i) => i.severity === 'error')
        expect(errors).toEqual([])
      }
    }
  })
})

describe('automation-node-styles', () => {
  it('defines visual styles and valid summaries for every node type in NODE_CATALOG', () => {
    for (const entry of NODE_CATALOG) {
      const style = NODE_VISUAL_STYLES[entry.type]
      expect(style).toBeDefined()
      expect(style.badge.length).toBeGreaterThan(0)
      expect(style.hex).toMatch(/^#/)

      const step = makeStep(`step-${entry.type}`, entry.type)
      const summary = getStepSummary(step)
      expect(typeof summary.text).toBe('string')
      expect(summary.text.length).toBeGreaterThan(0)
    }
  })
})

describe('4-side edge handle routing', () => {
  it('treats top, bottom, in, and out as regular flow handles while keeping branch ports distinct', () => {
    expect(isRegularOutputHandle(undefined)).toBe(true)
    expect(isRegularOutputHandle('out')).toBe(true)
    expect(isRegularOutputHandle('bottom')).toBe(true)
    expect(isRegularOutputHandle('top')).toBe(true)
    expect(isRegularOutputHandle('in')).toBe(true)

    expect(isRegularOutputHandle('true')).toBe(false)
    expect(isRegularOutputHandle('false')).toBe(false)
    expect(isRegularOutputHandle('error')).toBe(false)
    expect(isRegularOutputHandle('case-0')).toBe(false)
    expect(isRegularOutputHandle('branch-1')).toBe(false)
  })

  it('follows vertical bottom->top edges on regular out and preserves branch routing', () => {
    const edges: AutomationEdge[] = [
      { id: 'e1', from: 'a', to: 'b', sourceHandle: 'bottom', targetHandle: 'top' },
      { id: 'e2', from: 'cond', to: 'yes', sourceHandle: 'true', targetHandle: 'top' },
      { id: 'e3', from: 'cond', to: 'no', sourceHandle: 'false', targetHandle: 'in' },
      { id: 'e4', from: 'http', to: 'recover', sourceHandle: 'error', targetHandle: 'in' },
    ]
    expect(findNextEdge(edges, 'a', 'out')?.to).toBe('b')
    expect(findNextEdge(edges, 'cond', 'true')?.to).toBe('yes')
    expect(findNextEdge(edges, 'cond', 'false')?.to).toBe('no')
    expect(findNextEdge(edges, 'http', 'error')?.to).toBe('recover')
    expect(findNextEdge(edges, 'http', 'out')).toBeUndefined()
  })
})

describe('upgraded node capabilities', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    delete (globalThis as any).window
  })

  it('executes TCP node across one-shot, client, and server modes', async () => {
    const serverListeners: Array<(evt: any) => void> = []
    const clientListeners: Array<(evt: any) => void> = []
    const mockApi = {
      tcpClientSendOnce: vi.fn().mockResolvedValue({
        ok: true,
        byteLength: 4,
        hex: '50 49 4E 47',
        responseText: 'PONG',
        responseHex: '50 4F 4E 47',
      }),
      tcpClientConnect: vi.fn().mockResolvedValue({ ok: true, status: { connected: true, host: '10.0.0.5', port: 9000 } }),
      tcpClientSend: vi.fn().mockImplementation(() => {
        setTimeout(() => {
          clientListeners.forEach((cb) => cb({ host: '10.0.0.5', port: 9000, text: 'ACK', hex: '41 43 4B', byteLength: 3, timestamp: Date.now() }))
        }, 5)
        return Promise.resolve({ ok: true, byteLength: 3, hex: '02 48 03' })
      }),
      tcpClientDisconnect: vi.fn().mockResolvedValue({ ok: true, status: { connected: false, host: null, port: null } }),
      onTcpClientData: vi.fn((cb: (evt: any) => void) => {
        clientListeners.push(cb)
        return () => {
          const i = clientListeners.indexOf(cb)
          if (i >= 0) clientListeners.splice(i, 1)
        }
      }),
      tcpServerStatus: vi.fn().mockResolvedValue({ running: false, host: '0.0.0.0', port: null, clients: [] }),
      tcpServerStart: vi.fn().mockResolvedValue({ ok: true }),
      tcpServerSend: vi.fn().mockResolvedValue({ ok: true, sentCount: 2, byteLength: 2, hex: '4F 4B' }),
      tcpServerStop: vi.fn().mockResolvedValue({ ok: true }),
      onTcpServerData: vi.fn((cb: (evt: any) => void) => {
        serverListeners.push(cb)
        setTimeout(() => {
          cb({ clientId: 'c-1', address: '127.0.0.1', port: 54321, text: 'SCAN 123', hex: '53 43', byteLength: 8, timestamp: Date.now() })
        }, 5)
        return () => {
          const i = serverListeners.indexOf(cb)
          if (i >= 0) serverListeners.splice(i, 1)
        }
      }),
    }
      ; (globalThis as any).window = { electronAPI: mockApi }
    const vars: Record<string, string> = { host: '10.0.0.5' }
    const logs: string[] = []

    // 1. One-shot with response capture
    await executeTcpNode(
      makeStep('t1', 'CUSTOM_MESSAGE', {
        tcpMode: 'oneshot',
        port: '12345',
        message: 'PING',
        tcpLineEnding: 'crlf',
        tcpWaitForResponse: true,
        tcpSaveResponseAs: 'reply',
      }),
      vars,
      (m) => logs.push(m),
      undefined,
      '10.0.0.5',
      '12345',
    )
    expect(vars.reply).toBe('PONG')
    expect(vars.reply_hex).toBe('50 4F 4E 47')
    expect(vars.lastTcpResponse).toBe('PONG')

    // 2. Client connect + send HEX + await reply + disconnect
    await executeTcpNode(
      makeStep('t2', 'CUSTOM_MESSAGE', { tcpMode: 'client_connect', tcpHost: '10.0.0.5', port: '9000' }),
      vars,
      (m) => logs.push(m),
      undefined,
      '10.0.0.5',
      '12345',
    )
    await executeTcpNode(
      makeStep('t3', 'CUSTOM_MESSAGE', {
        tcpMode: 'client_send',
        message: '02 48 03',
        tcpHex: true,
        tcpWaitForResponse: true,
        tcpSaveResponseAs: 'ack',
      }),
      vars,
      (m) => logs.push(m),
      undefined,
      '10.0.0.5',
      '12345',
    )
    expect(vars.ack).toBe('ACK')
    await executeTcpNode(
      makeStep('t4', 'CUSTOM_MESSAGE', { tcpMode: 'client_disconnect' }),
      vars,
      (m) => logs.push(m),
      undefined,
      '10.0.0.5',
      '12345',
    )

    // 3. Server start + wait RX + broadcast + stop
    await executeTcpNode(
      makeStep('t5', 'CUSTOM_MESSAGE', { tcpMode: 'server_start', tcpHost: '0.0.0.0', port: '9100' }),
      vars,
      (m) => logs.push(m),
      undefined,
      '10.0.0.5',
      '12345',
    )
    await executeTcpNode(
      makeStep('t6', 'CUSTOM_MESSAGE', { tcpMode: 'server_wait', tcpSaveResponseAs: 'rx', tcpTimeoutMs: 2000 }),
      vars,
      (m) => logs.push(m),
      undefined,
      '10.0.0.5',
      '12345',
    )
    expect(vars.rx).toBe('SCAN 123')
    expect(vars.rx_clientId).toBe('c-1')
    await executeTcpNode(
      makeStep('t7', 'CUSTOM_MESSAGE', { tcpMode: 'server_send', message: 'OK', tcpSaveResponseAs: 'sentN' }),
      vars,
      (m) => logs.push(m),
      undefined,
      '10.0.0.5',
      '12345',
    )
    expect(vars.sentN).toBe('2')
    await executeTcpNode(
      makeStep('t8', 'CUSTOM_MESSAGE', { tcpMode: 'server_stop' }),
      vars,
      (m) => logs.push(m),
      undefined,
      '10.0.0.5',
      '12345',
    )
    expect(mockApi.tcpServerStop).toHaveBeenCalledOnce()
  })

  it('supports S3 and FTP in File Read / Write / List with active session dispatch and glob filtering', async () => {
    const mockApi = {
      sftpReadFile: vi.fn().mockResolvedValue({ ok: true, text: '{"a":1}', size: 7 }),
      sftpWriteTextFile: vi.fn().mockResolvedValue({ ok: true }),
      sftpReaddir: vi.fn().mockResolvedValue({
        ok: true,
        entries: [
          { name: 'batch1.csv', type: 'file' },
          { name: 'notes.txt', type: 'file' },
          { name: 'batch2.csv', type: 'file' },
        ],
      }),
    }
      ; (globalThis as any).window = { electronAPI: mockApi }
    const vars: Record<string, string> = {}

    await executeFileRead(
      makeStep('f1', 'FILE_READ', { fileLocation: 's3', filePath: '/bucket/in.json', fileEncoding: 'json', fileSaveAs: 'doc' }),
      vars,
      () => { },
    )
    expect(mockApi.sftpReadFile).toHaveBeenCalledWith('default:s3', '/bucket/in.json')
    expect(vars.doc).toBe('{"a":1}')

    await executeFileWrite(
      makeStep('f2', 'FILE_WRITE', { fileLocation: 'ftp', filePath: '/out/log.txt', fileContent: 'hello' }),
      vars,
      () => { },
    )
    expect(mockApi.sftpWriteTextFile).toHaveBeenCalledWith('default:ftp', '/out/log.txt', 'hello')

    await executeFileList(
      makeStep('f3', 'FILE_LIST', { fileLocation: 's3', filePath: '/exports', fileFilter: '*.csv', fileSaveAs: 'csvs' }),
      vars,
      () => { },
    )
    expect(mockApi.sftpReaddir).toHaveBeenCalledWith('default:s3', '/exports')
    expect(JSON.parse(vars.csvs)).toEqual(['batch1.csv', 'batch2.csv'])
    expect(vars.csvsCount).toBe('2')
  })

  it('supports EPC/UPC generation and new encoding/regex/EPC-decode transforms', async () => {
    const vars: Record<string, string> = { nextSerial: '42' }
    await executeGenerate(
      makeStep('g1', 'GENERATE', { generateKind: 'randomUpc', generateSaveAs: 'gtin' }),
      vars,
      () => { },
    )
    expect(vars.gtin).toMatch(/^\d{14}$/)

    await executeGenerate(
      makeStep('g2', 'GENERATE', {
        generateKind: 'epcFromUpc',
        generateUpc: vars.gtin,
        generateSerial: '{{nextSerial}}',
        generateSaveAs: 'epcOut',
      }),
      vars,
      () => { },
    )
    expect(vars.epcOut).toMatch(/^[0-9A-Fa-f]{24}$/)

    const decoded = JSON.parse(applyTransform('decodeEpc', vars.epcOut, '', ''))
    expect(decoded.serial).toBe('42')

    const b64 = applyTransform('base64Encode', 'Hello Zeus', '', '')
    expect(applyTransform('base64Decode', b64, '', '')).toBe('Hello Zeus')
    expect(applyTransform('urlDecode', applyTransform('urlEncode', 'a b&c=1', '', ''), '', '')).toBe('a b&c=1')
    expect(applyTransform('regexExtract', 'ORDER PO-0869795258 READY', 'PO-(\\d+)', '')).toBe('0869795258')
  })

  it('supports ALE Basic Auth injection on HTTP_REQUEST and JSON rows capture on DB_QUERY', async () => {
    const mockApi = {
      aleGetBasicAuthHeader: vi.fn().mockResolvedValue({ ok: true, header: 'Basic dGVzdDp0ZXN0' }),
      aleRequest: vi.fn().mockResolvedValue({ ok: true, status: 200, statusText: 'OK', data: '{"ok":true}' }),
      dbExecuteQuery: vi.fn().mockResolvedValue({
        ok: true,
        rows: [{ epc: 'E1' }, { epc: 'E2' }],
        columns: ['epc'],
      }),
    }
      ; (globalThis as any).window = { electronAPI: mockApi }
    const vars: Record<string, string> = {}

    await executeHttpRequest(
      makeStep('h1', 'HTTP_REQUEST', { httpUrl: 'http://127.0.0.1/ale', httpUseAleAuth: true }),
      vars,
      () => { },
    )
    expect(mockApi.aleRequest).toHaveBeenCalledWith(
      'http://127.0.0.1/ale',
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Basic dGVzdDp0ZXN0' }) }),
    )

    await executeDbQuery(
      makeStep('d1', 'DB_QUERY', { dbSql: 'SELECT epc FROM tags', dbSaveAs: 'firstEpc', dbSaveRowsAs: 'allRows' }),
      vars,
      () => { },
    )
    expect(vars.firstEpc).toBe('E1')
    expect(JSON.parse(vars.allRows)).toEqual([{ epc: 'E1' }, { epc: 'E2' }])
  })

  it('validates TCP node modes accurately', () => {
    const seq: AutomationSequence = {
      id: 'tcp-seq',
      name: 'TCP Flow',
      order: 0,
      steps: [
        makeStep('s1', 'CUSTOM_MESSAGE', { tcpMode: 'server_start', port: '9000', message: '' }),
        makeStep('s2', 'CUSTOM_MESSAGE', { tcpMode: 'server_wait', message: '' }),
        makeStep('s3', 'CUSTOM_MESSAGE', { tcpMode: 'server_stop', message: '' }),
      ],
      edges: [
        { id: 'e1', from: 's1', to: 's2', sourceHandle: 'out' },
        { id: 'e2', from: 's2', to: 's3', sourceHandle: 'out' },
      ],
    }
    expect(validateSequence(seq, [seq])).toEqual([])
  })
})
