import {
  defaultParamsForType,
  type AutomationEdge,
  type AutomationFrame,
  type AutomationSequence,
  type AutomationStep,
} from './automation-types'

export interface WorkflowTemplate {
  id: string
  name: string
  category: 'RFID & Edge' | 'API & Data' | 'Files & Batch' | 'Testing & QA'
  description: string
  nodeCount: number
  build: () => AutomationSequence[]
}

function makeStep(
  id: string,
  type: AutomationStep['type'],
  name: string,
  x: number,
  y: number,
  params: Partial<AutomationStep['params']> = {},
): AutomationStep {
  return {
    id,
    type,
    name,
    position: { x, y },
    params: { ...defaultParamsForType(type), ...params },
  }
}

function makeEdge(from: string, to: string, sourceHandle = 'out'): AutomationEdge {
  return { id: crypto.randomUUID(), from, to, sourceHandle }
}

export const WORKFLOW_TEMPLATES: WorkflowTemplate[] = [
  {
    id: 'rfid-burst-verify',
    name: 'Fixed Scan → Delay → HTTP Verify',
    category: 'RFID & Edge',
    description: 'Emulate a 5-tag fixed reader burst, wait for Edge ingestion, then query an HTTP endpoint and assert HTTP 200.',
    nodeCount: 5,
    build: () => {
      const s1 = crypto.randomUUID()
      const s2 = crypto.randomUUID()
      const s3 = crypto.randomUUID()
      const s4 = crypto.randomUUID()
      const s5 = crypto.randomUUID()
      const frame: AutomationFrame = {
        id: crypto.randomUUID(),
        name: 'Verify & Notify',
        color: 'emerald',
        x: 640,
        y: 28,
        width: 590,
        height: 220,
      }
      return [
        {
          id: crypto.randomUUID(),
          name: 'RFID Burst & Verify',
          order: 0,
          steps: [
            makeStep(s1, 'FIXED_TAG', 'Emit 5 Carton Tags', 40, 80, {
              upcList: '00000000000001,5',
              startSerial: '{{nextSerial}}',
              driver: 'llrp',
            }),
            makeStep(s2, 'DELAY', 'Wait for Processing', 350, 80, { duration: 1500 }),
            makeStep(s3, 'HTTP_REQUEST', 'Check Edge Status', 665, 80, {
              httpMethod: 'GET',
              httpUrl: 'http://{{host}}/health',
              httpSaveStatusAs: 'httpStatus',
              httpFailOnError: false,
            }),
            makeStep(s4, 'ASSERT', 'Expect HTTP 200', 960, 80, {
              condLeft: '{{httpStatus}}',
              condOp: 'eq',
              condRight: '200',
              assertMessage: 'Expected HTTP 200, got {{httpStatus}}',
            }),
            makeStep(s5, 'NOTIFY', 'Notify Success', 960, 260, {
              notifyLevel: 'success',
              notifyTitle: 'Burst Verified',
              notifyMessage: 'Sent {{tagCount}} tags and verified HTTP {{httpStatus}}',
            }),
          ],
          edges: [
            makeEdge(s1, s2),
            makeEdge(s2, s3),
            makeEdge(s3, s4),
            makeEdge(s4, s5),
          ],
          frames: [frame],
        },
      ]
    },
  },
  {
    id: 'api-branch-alert',
    name: 'HTTP Fetch → Branch (Pass / Fail)',
    category: 'API & Data',
    description: 'Call a REST endpoint, extract a JSON field, branch on TRUE/FALSE, and log or notify accordingly.',
    nodeCount: 5,
    build: () => {
      const s1 = crypto.randomUUID()
      const s2 = crypto.randomUUID()
      const s3 = crypto.randomUUID()
      const s4 = crypto.randomUUID()
      const s5 = crypto.randomUUID()
      return [
        {
          id: crypto.randomUUID(),
          name: 'API Branch Check',
          order: 0,
          steps: [
            makeStep(s1, 'HTTP_REQUEST', 'Fetch Inventory API', 40, 140, {
              httpMethod: 'GET',
              httpUrl: 'http://{{host}}/api/status',
              httpSaveStatusAs: 'status',
              httpSaveBodyAs: 'body',
              httpFailOnError: false,
            }),
            makeStep(s2, 'CONDITION', 'HTTP 200?', 350, 140, {
              condLeft: '{{status}}',
              condOp: 'eq',
              condRight: '200',
            }),
            makeStep(s3, 'TRANSFORM', 'Extract Count', 680, 50, {
              transformInput: '{{body}}',
              transformOp: 'jsonExtract',
              transformArg: 'count',
              transformSaveAs: 'itemCount',
            }),
            makeStep(s4, 'LOG', 'Log OK', 980, 50, {
              logLevel: 'info',
              logMessage: 'API OK — count={{itemCount}}',
            }),
            makeStep(s5, 'NOTIFY', 'Alert Failure', 680, 240, {
              notifyLevel: 'error',
              notifyTitle: 'API Check Failed',
              notifyMessage: 'HTTP {{status}} from {{host}}',
            }),
          ],
          edges: [
            makeEdge(s1, s2),
            makeEdge(s2, s3, 'true'),
            makeEdge(s3, s4),
            makeEdge(s2, s5, 'false'),
          ],
          frames: [],
        },
      ]
    },
  },
  {
    id: 'db-poll-verify',
    name: 'Handheld Read → DB Query → Assert',
    category: 'Testing & QA',
    description: 'Broadcast handheld EPC tags, wait briefly, query the database for the latest EPC, and assert it landed.',
    nodeCount: 4,
    build: () => {
      const s1 = crypto.randomUUID()
      const s2 = crypto.randomUUID()
      const s3 = crypto.randomUUID()
      const s4 = crypto.randomUUID()
      return [
        {
          id: crypto.randomUUID(),
          name: 'HH Read → DB Check',
          order: 0,
          steps: [
            makeStep(s1, 'HANDHELD_TAG', 'Handheld Scan', 40, 100, {
              upcList: '00000000000001,3',
              startSerial: '{{nextSerial}}',
            }),
            makeStep(s2, 'DELAY', 'Settle Time', 340, 100, { duration: 1000 }),
            makeStep(s3, 'DB_QUERY', 'Query Last EPC', 640, 100, {
              dbSql: "SELECT COUNT(*) AS cnt FROM tags WHERE epc = '{{epc}}'",
              dbSaveAs: 'dbCount',
            }),
            makeStep(s4, 'ASSERT', 'Verify Persisted', 940, 100, {
              condLeft: '{{dbCount}}',
              condOp: 'gt',
              condRight: '0',
              assertMessage: 'EPC {{epc}} not found in DB!',
            }),
          ],
          edges: [makeEdge(s1, s2), makeEdge(s2, s3), makeEdge(s3, s4)],
          frames: [],
        },
      ]
    },
  },
  {
    id: 'file-foreach-send',
    name: 'Read File → For Each → Send OCR',
    category: 'Files & Batch',
    description: 'Read a newline-separated file of codes and iterate through every item using a linked sub-sequence.',
    nodeCount: 4,
    build: () => {
      const workerSeqId = crypto.randomUUID()
      const w1 = crypto.randomUUID()
      const w2 = crypto.randomUUID()
      const m1 = crypto.randomUUID()
      const m2 = crypto.randomUUID()
      return [
        {
          id: crypto.randomUUID(),
          name: 'File Batch Runner',
          order: 0,
          steps: [
            makeStep(m1, 'FILE_READ', 'Read Barcode List', 40, 100, {
              fileStorageProvider: 'local',
              filePath: './data/barcodes.txt',
              fileSaveAs: 'lines',
            }),
            makeStep(m2, 'FOR_EACH', 'Send Each Line', 360, 100, {
              forEachSource: '{{lines}}',
              forEachItemAs: 'code',
              forEachIndexAs: 'idx',
              forEachSequenceId: workerSeqId,
            }),
          ],
          edges: [makeEdge(m1, m2)],
          frames: [],
        },
        {
          id: workerSeqId,
          name: '↳ Send One OCR',
          order: 1,
          steps: [
            makeStep(w1, 'OCR', 'Send OCR Payload', 40, 100, {
              message: '{{code}}',
            }),
            makeStep(w2, 'DELAY', 'Pace Delay', 350, 100, { duration: 250 }),
          ],
          edges: [makeEdge(w1, w2)],
          frames: [],
        },
      ]
    },
  },
  {
    id: 'weighted-traffic-sim',
    name: 'Weighted Random Traffic Simulator',
    category: 'RFID & Edge',
    description: 'Simulate realistic warehouse traffic: 70% normal fixed reads, 20% handheld reads, 10% OCR exceptions.',
    nodeCount: 5,
    build: () => {
      const r = crypto.randomUUID()
      const a = crypto.randomUUID()
      const b = crypto.randomUUID()
      const c = crypto.randomUUID()
      const d = crypto.randomUUID()
      return [
        {
          id: crypto.randomUUID(),
          name: 'Warehouse Traffic Mix',
          order: 0,
          steps: [
            makeStep(r, 'RANDOM', 'Traffic Split', 40, 160, {
              randomBranches: [
                { weight: 70, label: 'Fixed 70%' },
                { weight: 20, label: 'HH 20%' },
                { weight: 10, label: 'OCR 10%' },
              ],
            }),
            makeStep(a, 'FIXED_TAG', 'Dock Portal Read', 370, 20, {
              upcList: '00000000000001,10',
              startSerial: '{{nextSerial}}',
            }),
            makeStep(b, 'HANDHELD_TAG', 'Cycle Count Scan', 370, 160, {
              upcList: '00000000000002,3',
              startSerial: '{{nextSerial}}',
            }),
            makeStep(c, 'OCR', 'Exception Barcode', 370, 300, {
              message: 'EXC-{{runId}}',
            }),
            makeStep(d, 'DELAY', 'Cooldown', 700, 160, { duration: 1000 }),
          ],
          edges: [
            makeEdge(r, a, 'branch-0'),
            makeEdge(r, b, 'branch-1'),
            makeEdge(r, c, 'branch-2'),
            makeEdge(a, d),
            makeEdge(b, d),
            makeEdge(c, d),
          ],
          frames: [],
        },
      ]
    },
  },
]
