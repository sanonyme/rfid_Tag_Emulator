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
  category:
    | 'DevOps & Infra'
    | 'Desktop & Ops'
    | 'API & Data'
    | 'Files & Batch'
    | 'Testing & QA'
    | 'RFID & Edge'
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
    id: 'devops-health-monitor',
    name: 'Service Health Monitor → Slack & Desktop Alert',
    category: 'DevOps & Infra',
    description: 'Probe an HTTP/TCP endpoint, branch if down or degraded, post a Slack/Discord alert and fire an OS notification.',
    nodeCount: 4,
    build: () => {
      const p1 = crypto.randomUUID()
      const c1 = crypto.randomUUID()
      const ok1 = crypto.randomUUID()
      const alt1 = crypto.randomUUID()
      return [
        {
          id: crypto.randomUUID(),
          name: 'Health Monitor',
          order: 0,
          steps: [
            makeStep(p1, 'PING_PORT', 'Probe API Health', 40, 140, {
              probeMode: 'http',
              probeUrl: 'http://{{host}}:8080/health',
              probeExpectedStatus: 200,
              probeSaveAliveAs: 'serviceUp',
              probeSaveLatencyAs: 'latencyMs',
              probeFailIfDown: false,
            }),
            makeStep(c1, 'CONDITION', 'Service Healthy?', 360, 140, {
              condLeft: '{{serviceUp}}',
              condOp: 'isTrue',
            }),
            makeStep(ok1, 'LOG', 'Log Healthy', 690, 50, {
              logLevel: 'info',
              logMessage: 'Service UP ({{latencyMs}}ms)',
            }),
            makeStep(alt1, 'WEBHOOK_SEND', 'Send Downtime Alert', 690, 230, {
              webhookPreset: 'slack',
              webhookUrl: '{{secret.SLACK_WEBHOOK}}',
              webhookTitle: 'Service Down',
              webhookMessage: 'Health check failed on {{host}} ({{latencyMs}}ms)',
              webhookFailOnError: false,
            }),
          ],
          edges: [
            makeEdge(p1, c1),
            makeEdge(c1, ok1, 'true'),
            makeEdge(c1, alt1, 'false'),
          ],
          frames: [],
        },
      ]
    },
  },
  {
    id: 'ssh-deploy-verify',
    name: 'SSH Deploy Command → Health Check → Desktop Toast',
    category: 'DevOps & Infra',
    description: 'Run a remote SSH command, wait briefly, verify port/service health, and pop a native OS desktop notification.',
    nodeCount: 4,
    build: () => {
      const s1 = crypto.randomUUID()
      const d1 = crypto.randomUUID()
      const p1 = crypto.randomUUID()
      const n1 = crypto.randomUUID()
      return [
        {
          id: crypto.randomUUID(),
          name: 'SSH Restart & Verify',
          order: 0,
          steps: [
            makeStep(s1, 'SSH_EXEC', 'Restart Remote Service', 40, 100, {
              sshHost: '{{host}}',
              sshPort: '22',
              sshUser: 'ubuntu',
              sshPassword: '{{secret.SSH_PASS}}',
              sshCommand: 'systemctl status nginx --no-pager || uptime',
              sshSaveStdoutAs: 'sshOut',
            }),
            makeStep(d1, 'DELAY', 'Settle 2s', 350, 100, { duration: 2000 }),
            makeStep(p1, 'PING_PORT', 'Verify Port 80', 650, 100, {
              probeMode: 'tcp',
              probeHost: '{{host}}',
              probePort: '80',
              probeSaveAliveAs: 'portUp',
              probeSaveLatencyAs: 'latencyMs',
              probeFailIfDown: true,
            }),
            makeStep(n1, 'NOTIFY', 'Desktop Notify', 950, 100, {
              notifyLevel: 'success',
              notifyTitle: 'Remote Check Passed',
              notifyMessage: '{{host}}:80 responding in {{latencyMs}}ms',
              notifyDesktop: true,
            }),
          ],
          edges: [makeEdge(s1, d1), makeEdge(d1, p1), makeEdge(p1, n1)],
          frames: [],
        },
      ]
    },
  },
  {
    id: 'api-csv-export-open',
    name: 'API Fetch → Filter/Sort → Write CSV → Open File',
    category: 'Desktop & Ops',
    description: 'Fetch JSON records over HTTP, convert to CSV, save locally with a formatted date filename, and open in your spreadsheet app.',
    nodeCount: 5,
    build: () => {
      const dt = crypto.randomUUID()
      const h = crypto.randomUUID()
      const cj = crypto.randomUUID()
      const fw = crypto.randomUUID()
      const op = crypto.randomUUID()
      return [
        {
          id: crypto.randomUUID(),
          name: 'API → CSV Report',
          order: 0,
          steps: [
            makeStep(dt, 'DATETIME', 'Stamp Date', 40, 100, {
              dtOp: 'now',
              dtFormat: 'YYYYMMDD_HHmmss',
              dtSaveAs: 'fileStamp',
            }),
            makeStep(h, 'HTTP_REQUEST', 'Fetch JSON Records', 340, 100, {
              httpMethod: 'GET',
              httpUrl: 'https://jsonplaceholder.typicode.com/users',
              httpSaveBodyAs: 'apiJson',
            }),
            makeStep(cj, 'CSV_JSON', 'Convert JSON → CSV', 640, 100, {
              csvJsonOp: 'jsonToCsv',
              csvJsonInput: '{{apiJson}}',
              csvJsonSaveAs: 'csvOutput',
            }),
            makeStep(fw, 'FILE_WRITE', 'Write Report CSV', 940, 100, {
              fileLocation: 'local',
              filePath: './data/report_{{fileStamp}}.csv',
              fileContent: '{{csvOutput}}',
            }),
            makeStep(op, 'OPEN_APP', 'Open Report', 1240, 100, {
              openMode: 'reveal',
              openTarget: './data/report_{{fileStamp}}.csv',
            }),
          ],
          edges: [makeEdge(dt, h), makeEdge(h, cj), makeEdge(cj, fw), makeEdge(fw, op)],
          frames: [],
        },
      ]
    },
  },
  {
    id: 'parallel-endpoint-fanout',
    name: 'Parallel Multi-Endpoint Check (Fork & Join)',
    category: 'DevOps & Infra',
    description: 'Probe two endpoints simultaneously using Parallel Fork & Join, then log and notify once both complete.',
    nodeCount: 4,
    build: () => {
      const f = crypto.randomUUID()
      const a = crypto.randomUUID()
      const b = crypto.randomUUID()
      const j = crypto.randomUUID()
      return [
        {
          id: crypto.randomUUID(),
          name: 'Parallel Health Fan-Out',
          order: 0,
          steps: [
            makeStep(f, 'PARALLEL_BRANCH', 'Fork Probes', 40, 160, {
              parallelBranches: [{ label: 'Primary' }, { label: 'Secondary' }],
              parallelWaitMode: 'allSettled',
            }),
            makeStep(a, 'PING_PORT', 'Probe API 1', 390, 40, {
              probeMode: 'http',
              probeUrl: 'http://{{host}}:8080/health',
              probeSaveAliveAs: 'primaryUp',
              probeFailIfDown: false,
            }),
            makeStep(b, 'PING_PORT', 'Probe DB Port', 390, 260, {
              probeMode: 'tcp',
              probeHost: '{{host}}',
              probePort: '3306',
              probeSaveAliveAs: 'dbUp',
              probeFailIfDown: false,
            }),
            makeStep(j, 'NOTIFY', 'Summary Toast', 730, 160, {
              notifyLevel: 'info',
              notifyTitle: 'Parallel Checks Done',
              notifyMessage: 'Primary={{primaryUp}}, DB={{dbUp}}',
            }),
          ],
          edges: [
            makeEdge(f, a, 'branch-0'),
            makeEdge(f, b, 'branch-1'),
            makeEdge(f, j, 'done'),
          ],
          frames: [],
        },
      ]
    },
  },
  {
    id: 'crypto-hmac-api-call',
    name: 'HMAC-SHA256 Signed API Request',
    category: 'API & Data',
    description: 'Stamp current Unix seconds, compute an HMAC-SHA256 request signature using a Vault secret, and POST signed JSON.',
    nodeCount: 3,
    build: () => {
      const dt = crypto.randomUUID()
      const cr = crypto.randomUUID()
      const hr = crypto.randomUUID()
      return [
        {
          id: crypto.randomUUID(),
          name: 'Signed API Request',
          order: 0,
          steps: [
            makeStep(dt, 'DATETIME', 'Unix Timestamp', 40, 100, {
              dtOp: 'now',
              dtFormat: 'unixSec',
              dtSaveAs: 'ts',
            }),
            makeStep(cr, 'CRYPTO_HASH', 'Sign Payload (HMAC)', 350, 100, {
              cryptoOp: 'hmacSha256',
              cryptoInput: '{{ts}}.ping',
              cryptoSecret: '{{secret.API_SECRET}}',
              cryptoSaveAs: 'signature',
            }),
            makeStep(hr, 'HTTP_REQUEST', 'Send Signed POST', 660, 100, {
              httpMethod: 'POST',
              httpUrl: 'https://httpbin.org/post',
              httpHeaders: 'Content-Type: application/json\nX-Signature: {{signature}}\nX-Timestamp: {{ts}}',
              httpBody: '{"ts":"{{ts}}","event":"ping"}',
              httpSaveStatusAs: 'httpStatus',
            }),
          ],
          edges: [makeEdge(dt, cr), makeEdge(cr, hr)],
          frames: [],
        },
      ]
    },
  },
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
  // ── 16 Additional Ready-to-Use Power Templates ─────────────────────────────
  {
    id: 'discord-ops-digest',
    name: 'Discord Embed Alert & Status Broadcast',
    category: 'DevOps & Infra',
    description: 'Prompt for a quick deployment/status note, probe a target HTTP endpoint, and publish a rich Discord embed with latency via Webhook.',
    nodeCount: 5,
    build: () => {
      const dt = crypto.randomUUID()
      const pr = crypto.randomUUID()
      const pg = crypto.randomUUID()
      const wh = crypto.randomUUID()
      const nt = crypto.randomUUID()
      return [
        {
          id: crypto.randomUUID(),
          name: 'Discord Ops Broadcast',
          order: 0,
          steps: [
            makeStep(dt, 'DATETIME', 'Format Timestamp', 40, 120, {
              dtOp: 'now',
              dtFormat: 'YYYY-MM-DD HH:mm:ss',
              dtSaveAs: 'checkedAt',
            }),
            makeStep(pr, 'PROMPT_INPUT', 'Enter Release Note', 330, 120, {
              promptMode: 'text',
              promptTitle: 'Discord Broadcast Note',
              promptMessage: 'Message to attach to the Discord status card:',
              promptDefault: 'Deployed build & ran smoke probe',
              promptSaveAs: 'releaseNote',
            }),
            makeStep(pg, 'PING_PORT', 'Probe Target Health', 620, 120, {
              probeMode: 'http',
              probeUrl: 'http://{{host}}:8080/health',
              probeExpectedStatus: 200,
              probeSaveAliveAs: 'alive',
              probeSaveLatencyAs: 'latencyMs',
              probeFailIfDown: false,
            }),
            makeStep(wh, 'WEBHOOK_SEND', 'Post Discord Embed', 910, 120, {
              webhookPreset: 'discord',
              webhookUrl: '{{secret.DISCORD_WEBHOOK}}',
              webhookTitle: 'Service Status — {{checkedAt}}',
              webhookMessage: '{{releaseNote}}\nAlive: {{alive}} | Latency: {{latencyMs}}ms | Host: {{host}}',
              webhookColor: '#5865F2',
              webhookFailOnError: true,
            }),
            makeStep(nt, 'NOTIFY', 'Confirm Sent', 1200, 120, {
              notifyLevel: 'success',
              notifyTitle: 'Discord Card Sent',
              notifyMessage: 'Posted status embed (Alive={{alive}}, {{latencyMs}}ms)',
              notifyDesktop: true,
            }),
          ],
          edges: [makeEdge(dt, pr), makeEdge(pr, pg), makeEdge(pg, wh), makeEdge(wh, nt)],
          frames: [],
        },
      ]
    },
  },
  {
    id: 'teams-incident-card',
    name: 'Microsoft Teams Incident Card on Outage',
    category: 'DevOps & Infra',
    description: 'Check an HTTP service continuously via trigger or manual run; if down, post a red MessageCard to Microsoft Teams and trigger an OS notification.',
    nodeCount: 6,
    build: () => {
      const dt = crypto.randomUUID()
      const pg = crypto.randomUUID()
      const cond = crypto.randomUUID()
      const ok = crypto.randomUUID()
      const teams = crypto.randomUUID()
      const desk = crypto.randomUUID()
      return [
        {
          id: crypto.randomUUID(),
          name: 'Teams Outage Alert',
          order: 0,
          steps: [
            makeStep(dt, 'DATETIME', 'Timestamp', 40, 140, {
              dtOp: 'now',
              dtFormat: 'YYYY-MM-DD HH:mm:ss',
              dtSaveAs: 'incidentTime',
            }),
            makeStep(pg, 'PING_PORT', 'Check Production API', 330, 140, {
              probeMode: 'http',
              probeUrl: 'http://{{host}}:8080/health',
              probeExpectedStatus: 200,
              probeSaveAliveAs: 'isUp',
              probeSaveLatencyAs: 'latMs',
              probeFailIfDown: false,
            }),
            makeStep(cond, 'CONDITION', 'Endpoint Healthy?', 620, 140, {
              condLeft: '{{isUp}}',
              condOp: 'isTrue',
            }),
            makeStep(ok, 'LOG', 'Log Healthy', 930, 50, {
              logLevel: 'info',
              logMessage: '[{{incidentTime}}] Service healthy ({{latMs}}ms)',
            }),
            makeStep(teams, 'WEBHOOK_SEND', 'Send Teams Incident Card', 930, 230, {
              webhookPreset: 'teams',
              webhookUrl: '{{secret.TEAMS_WEBHOOK}}',
              webhookTitle: 'Outage Detected on {{host}}',
              webhookMessage: 'Health check failed at {{incidentTime}} (HTTP {{probeHttpStatus}}, {{latMs}}ms).',
              webhookColor: '#ef4444',
              webhookFailOnError: false,
            }),
            makeStep(desk, 'NOTIFY', 'Desktop Incident Alert', 1240, 230, {
              notifyLevel: 'error',
              notifyTitle: 'Outage Reported to Teams',
              notifyMessage: '{{host}} failed health check at {{incidentTime}}',
              notifyDesktop: true,
            }),
          ],
          edges: [
            makeEdge(dt, pg),
            makeEdge(pg, cond),
            makeEdge(cond, ok, 'true'),
            makeEdge(cond, teams, 'false'),
            makeEdge(teams, desk),
          ],
          frames: [],
        },
      ]
    },
  },
  {
    id: 'ssh-disk-memory-audit',
    name: 'SSH Linux Disk & RAM Audit → Team Alert',
    category: 'DevOps & Infra',
    description: 'Connect over SSH to inspect root disk usage (%) and free RAM, alert Discord/Teams if disk exceeds 85%, otherwise log healthy metrics.',
    nodeCount: 6,
    build: () => {
      const sDisk = crypto.randomUUID()
      const sMem = crypto.randomUUID()
      const cond = crypto.randomUUID()
      const alert = crypto.randomUUID()
      const notify = crypto.randomUUID()
      const ok = crypto.randomUUID()
      return [
        {
          id: crypto.randomUUID(),
          name: 'SSH Server Resource Audit',
          order: 0,
          steps: [
            makeStep(sDisk, 'SSH_EXEC', 'Check Root Disk %', 40, 140, {
              sshHost: '{{host}}',
              sshPort: '22',
              sshUser: 'ubuntu',
              sshPassword: '{{secret.SSH_PASS}}',
              sshCommand: "df -P / | awk 'NR==2 {gsub(/%/,\"\",$5); print $5}'",
              sshSaveStdoutAs: 'diskPct',
            }),
            makeStep(sMem, 'SSH_EXEC', 'Check Memory Used', 340, 140, {
              sshHost: '{{host}}',
              sshPort: '22',
              sshUser: 'ubuntu',
              sshPassword: '{{secret.SSH_PASS}}',
              sshCommand: "free -m | awk 'NR==2 {printf \"%d/%dMB\", $3, $2}'",
              sshSaveStdoutAs: 'memInfo',
            }),
            makeStep(cond, 'CONDITION', 'Disk >= 85%?', 640, 140, {
              condLeft: '{{diskPct}}',
              condOp: 'gte',
              condRight: '85',
            }),
            makeStep(alert, 'WEBHOOK_SEND', 'Alert Discord Channel', 950, 50, {
              webhookPreset: 'discord',
              webhookUrl: '{{secret.DISCORD_WEBHOOK}}',
              webhookTitle: 'High Disk Warning: {{host}}',
              webhookMessage: 'Root partition at **{{diskPct}}%** (RAM: {{memInfo}})',
              webhookColor: '#f59e0b',
              webhookFailOnError: false,
            }),
            makeStep(notify, 'NOTIFY', 'OS Warning Toast', 1260, 50, {
              notifyLevel: 'warning',
              notifyTitle: 'Disk {{diskPct}}% on {{host}}',
              notifyMessage: 'RAM {{memInfo}} — alert posted.',
              notifyDesktop: true,
            }),
            makeStep(ok, 'LOG', 'Log Healthy Metrics', 950, 230, {
              logLevel: 'info',
              logMessage: 'Server {{host}} healthy — Disk {{diskPct}}%, RAM {{memInfo}}',
            }),
          ],
          edges: [
            makeEdge(sDisk, sMem),
            makeEdge(sMem, cond),
            makeEdge(cond, alert, 'true'),
            makeEdge(alert, notify),
            makeEdge(cond, ok, 'false'),
          ],
          frames: [],
        },
      ]
    },
  },
  {
    id: 'parallel-service-matrix',
    name: 'Parallel 3-Service Stack Check (Web + DB + WS)',
    category: 'DevOps & Infra',
    description: 'Fork into 3 simultaneous probes (HTTP API, PostgreSQL/MySQL port, and WebSocket), then post one Discord summary card after all finish.',
    nodeCount: 6,
    build: () => {
      const fork = crypto.randomUUID()
      const web = crypto.randomUUID()
      const db = crypto.randomUUID()
      const ws = crypto.randomUUID()
      const wh = crypto.randomUUID()
      const nt = crypto.randomUUID()
      return [
        {
          id: crypto.randomUUID(),
          name: '3-Stack Parallel Monitor',
          order: 0,
          steps: [
            makeStep(fork, 'PARALLEL_BRANCH', 'Fork Stack Probes', 40, 180, {
              parallelBranches: [{ label: 'HTTP API' }, { label: 'Database' }, { label: 'WebSocket' }],
              parallelWaitMode: 'allSettled',
            }),
            makeStep(web, 'PING_PORT', 'Probe HTTP API', 390, 20, {
              probeMode: 'http',
              probeUrl: 'http://{{host}}:8080/health',
              probeSaveAliveAs: 'apiUp',
              probeSaveLatencyAs: 'apiMs',
              probeFailIfDown: false,
            }),
            makeStep(db, 'PING_PORT', 'Probe DB Port 5432', 390, 180, {
              probeMode: 'tcp',
              probeHost: '{{host}}',
              probePort: '5432',
              probeSaveAliveAs: 'dbUp',
              probeSaveLatencyAs: 'dbMs',
              probeFailIfDown: false,
            }),
            makeStep(ws, 'WEBSOCKET', 'Ping WebSocket', 390, 340, {
              wsUrl: 'wss://echo.websocket.events',
              wsSendMessage: 'health-ping',
              wsWaitForMessage: true,
              wsSaveAs: 'wsEcho',
            }),
            makeStep(wh, 'WEBHOOK_SEND', 'Post Stack Digest', 740, 180, {
              webhookPreset: 'discord',
              webhookUrl: '{{secret.DISCORD_WEBHOOK}}',
              webhookTitle: '3-Tier Stack Check Complete',
              webhookMessage: 'API: {{apiUp}} ({{apiMs}}ms) | DB: {{dbUp}} ({{dbMs}}ms) | WS Echo: {{wsEcho}}',
              webhookColor: '#10b981',
              webhookFailOnError: false,
            }),
            makeStep(nt, 'NOTIFY', 'Finish Toast', 1050, 180, {
              notifyLevel: 'info',
              notifyTitle: 'Stack Probe Finished',
              notifyMessage: 'API={{apiUp}}, DB={{dbUp}}',
            }),
          ],
          edges: [
            makeEdge(fork, web, 'branch-0'),
            makeEdge(fork, db, 'branch-1'),
            makeEdge(fork, ws, 'branch-2'),
            makeEdge(fork, wh, 'done'),
            makeEdge(wh, nt),
          ],
          frames: [],
        },
      ]
    },
  },
  {
    id: 'dns-ssl-check-webhook',
    name: 'DNS Lookup + HTTP Health → Teams Summary',
    category: 'DevOps & Infra',
    description: 'Resolve a hostname via DNS, verify HTTPS reachability and status code, then post results to Microsoft Teams.',
    nodeCount: 4,
    build: () => {
      const dnsStep = crypto.randomUUID()
      const httpStep = crypto.randomUUID()
      const wh = crypto.randomUUID()
      const lg = crypto.randomUUID()
      return [
        {
          id: crypto.randomUUID(),
          name: 'DNS + HTTPS → Teams',
          order: 0,
          steps: [
            makeStep(dnsStep, 'PING_PORT', 'Resolve DNS Host', 40, 120, {
              probeMode: 'dns',
              probeHost: 'example.com',
              probeSaveAliveAs: 'dnsOk',
              probeSaveLatencyAs: 'dnsMs',
              probeFailIfDown: true,
            }),
            makeStep(httpStep, 'PING_PORT', 'Probe HTTPS 200', 350, 120, {
              probeMode: 'http',
              probeUrl: 'https://example.com',
              probeExpectedStatus: 200,
              probeSaveAliveAs: 'httpsOk',
              probeSaveLatencyAs: 'httpsMs',
              probeFailIfDown: false,
            }),
            makeStep(wh, 'WEBHOOK_SEND', 'Post Teams Summary', 660, 120, {
              webhookPreset: 'teams',
              webhookUrl: '{{secret.TEAMS_WEBHOOK}}',
              webhookTitle: 'DNS & Endpoint Reachability',
              webhookMessage: 'Resolved IP: {{resolvedIp}} ({{dnsMs}}ms) | HTTPS OK: {{httpsOk}} ({{httpsMs}}ms)',
              webhookColor: '#0ea5e9',
              webhookFailOnError: false,
            }),
            makeStep(lg, 'LOG', 'Record Summary', 970, 120, {
              logLevel: 'info',
              logMessage: 'DNS={{resolvedIp}} HTTPS={{httpsOk}} ({{httpsMs}}ms)',
            }),
          ],
          edges: [makeEdge(dnsStep, httpStep), makeEdge(httpStep, wh), makeEdge(wh, lg)],
          frames: [],
        },
      ]
    },
  },
  {
    id: 'jwt-inspect-to-clipboard',
    name: 'Clipboard JWT Decoder & Claims Inspector',
    category: 'Desktop & Ops',
    description: 'Read a JWT from your clipboard, decode its JSON payload + header without calling any server, extract the subject claim, and copy formatted JSON back.',
    nodeCount: 5,
    build: () => {
      const cr = crypto.randomUUID()
      const dec = crypto.randomUUID()
      const tr = crypto.randomUUID()
      const cw = crypto.randomUUID()
      const nt = crypto.randomUUID()
      return [
        {
          id: crypto.randomUUID(),
          name: 'Clipboard JWT Inspector',
          order: 0,
          steps: [
            makeStep(cr, 'CLIPBOARD', 'Read JWT from Clipboard', 40, 120, {
              clipboardMode: 'read',
              clipboardSaveAs: 'rawJwt',
            }),
            makeStep(dec, 'CRYPTO_HASH', 'Decode JWT Payload', 340, 120, {
              cryptoOp: 'jwtDecode',
              cryptoInput: '{{rawJwt}}',
              cryptoSaveAs: 'jwtClaims',
            }),
            makeStep(tr, 'TRANSFORM', 'Extract Subject (sub)', 640, 120, {
              transformOp: 'jsonExtract',
              transformInput: '{{jwtClaims}}',
              transformArg: 'sub',
              transformSaveAs: 'jwtSub',
            }),
            makeStep(cw, 'CLIPBOARD', 'Copy Decoded Claims', 940, 120, {
              clipboardMode: 'write',
              clipboardText: '{{jwtClaims}}',
            }),
            makeStep(nt, 'NOTIFY', 'Show Token Summary', 1240, 120, {
              notifyLevel: 'success',
              notifyTitle: 'JWT Decoded & Copied',
              notifyMessage: 'sub={{jwtSub}} — full JSON claims placed on clipboard.',
            }),
          ],
          edges: [makeEdge(cr, dec), makeEdge(dec, tr), makeEdge(tr, cw), makeEdge(cw, nt)],
          frames: [],
        },
      ]
    },
  },
  {
    id: 'interactive-ssh-runner',
    name: 'Interactive Service Manager (Prompt → SSH → Clipboard)',
    category: 'Desktop & Ops',
    description: 'Prompt the operator for a service name and action (status/restart/logs), run it over SSH, and copy output to the clipboard.',
    nodeCount: 5,
    build: () => {
      const pSvc = crypto.randomUUID()
      const pAct = crypto.randomUUID()
      const ssh = crypto.randomUUID()
      const cw = crypto.randomUUID()
      const nt = crypto.randomUUID()
      return [
        {
          id: crypto.randomUUID(),
          name: 'Interactive SSH Ops',
          order: 0,
          steps: [
            makeStep(pSvc, 'PROMPT_INPUT', 'Choose Service Name', 40, 120, {
              promptMode: 'text',
              promptTitle: 'Target Linux Service',
              promptMessage: 'Systemd unit name (e.g. nginx, docker, postgresql):',
              promptDefault: 'nginx',
              promptSaveAs: 'serviceName',
            }),
            makeStep(pAct, 'PROMPT_INPUT', 'Choose Action', 340, 120, {
              promptMode: 'select',
              promptTitle: 'Select Operation',
              promptMessage: 'Action to execute on {{serviceName}}:',
              promptOptions: 'status, restart, reload',
              promptDefault: 'status',
              promptSaveAs: 'serviceAction',
            }),
            makeStep(ssh, 'SSH_EXEC', 'Execute Remote Command', 640, 120, {
              sshHost: '{{host}}',
              sshPort: '22',
              sshUser: 'ubuntu',
              sshPassword: '{{secret.SSH_PASS}}',
              sshCommand: 'systemctl {{serviceAction}} {{serviceName}} --no-pager | head -n 20',
              sshSaveStdoutAs: 'svcOutput',
            }),
            makeStep(cw, 'CLIPBOARD', 'Copy Output', 940, 120, {
              clipboardMode: 'write',
              clipboardText: '{{svcOutput}}',
            }),
            makeStep(nt, 'NOTIFY', 'Desktop Result', 1240, 120, {
              notifyLevel: 'success',
              notifyTitle: 'SSH Action Complete',
              notifyMessage: '{{serviceAction}} on {{serviceName}} finished — copied to clipboard.',
              notifyDesktop: true,
            }),
          ],
          edges: [makeEdge(pSvc, pAct), makeEdge(pAct, ssh), makeEdge(ssh, cw), makeEdge(cw, nt)],
          frames: [],
        },
      ]
    },
  },
  {
    id: 'daily-standup-report',
    name: 'Daily Standup Update → Discord / Teams',
    category: 'Desktop & Ops',
    description: 'Stamp today’s date, ask for your daily update via an interactive dialog, and post it straight to your Discord or Teams channel.',
    nodeCount: 4,
    build: () => {
      const dt = crypto.randomUUID()
      const pr = crypto.randomUUID()
      const wh = crypto.randomUUID()
      const nt = crypto.randomUUID()
      return [
        {
          id: crypto.randomUUID(),
          name: 'Daily Team Standup',
          order: 0,
          steps: [
            makeStep(dt, 'DATETIME', 'Today Date', 40, 120, {
              dtOp: 'now',
              dtFormat: 'YYYY-MM-DD',
              dtSaveAs: 'todayDate',
            }),
            makeStep(pr, 'PROMPT_INPUT', 'Write Update', 340, 120, {
              promptMode: 'text',
              promptTitle: 'Daily Standup ({{todayDate}})',
              promptMessage: 'What did you ship or block on today?',
              promptDefault: 'Completed API integration tests and deployed staging.',
              promptSaveAs: 'standupText',
            }),
            makeStep(wh, 'WEBHOOK_SEND', 'Post to Discord', 640, 120, {
              webhookPreset: 'discord',
              webhookUrl: '{{secret.DISCORD_WEBHOOK}}',
              webhookTitle: 'Standup Update — {{todayDate}}',
              webhookMessage: '{{standupText}}',
              webhookColor: '#6366f1',
              webhookFailOnError: true,
            }),
            makeStep(nt, 'NOTIFY', 'Sent', 940, 120, {
              notifyLevel: 'success',
              notifyTitle: 'Standup Posted',
              notifyMessage: 'Delivered update for {{todayDate}}.',
            }),
          ],
          edges: [makeEdge(dt, pr), makeEdge(pr, wh), makeEdge(wh, nt)],
          frames: [],
        },
      ]
    },
  },
  {
    id: 'secret-token-generator',
    name: 'Generate Secure Token + SHA-256 → Copy to Clipboard',
    category: 'Desktop & Ops',
    description: 'Create a cryptographically random 32-byte API token, hash it with SHA-256 for storage, and copy the raw token to your OS clipboard.',
    nodeCount: 4,
    build: () => {
      const tk = crypto.randomUUID()
      const sh = crypto.randomUUID()
      const cw = crypto.randomUUID()
      const nt = crypto.randomUUID()
      return [
        {
          id: crypto.randomUUID(),
          name: 'API Key & Hash Generator',
          order: 0,
          steps: [
            makeStep(tk, 'CRYPTO_HASH', 'Generate 32B Secret', 40, 120, {
              cryptoOp: 'randomToken',
              cryptoByteLength: 32,
              cryptoSaveAs: 'newApiKey',
            }),
            makeStep(sh, 'CRYPTO_HASH', 'Compute SHA-256 Hash', 340, 120, {
              cryptoOp: 'sha256',
              cryptoInput: '{{newApiKey}}',
              cryptoSaveAs: 'apiKeyHash',
            }),
            makeStep(cw, 'CLIPBOARD', 'Copy Raw Token', 640, 120, {
              clipboardMode: 'write',
              clipboardText: '{{newApiKey}}',
            }),
            makeStep(nt, 'NOTIFY', 'Show Hash Digest', 940, 120, {
              notifyLevel: 'success',
              notifyTitle: 'Token Copied to Clipboard',
              notifyMessage: 'SHA-256 stored hash: {{apiKeyHash}}',
            }),
          ],
          edges: [makeEdge(tk, sh), makeEdge(sh, cw), makeEdge(cw, nt)],
          frames: [],
        },
      ]
    },
  },
  {
    id: 'oauth-bearer-api-chain',
    name: 'Login Token → Bearer Auth API → Count Records',
    category: 'API & Data',
    description: 'POST credentials to obtain an access token, authenticate a follow-up GET call with Bearer Auth, capture response headers, and count items.',
    nodeCount: 5,
    build: () => {
      const login = crypto.randomUUID()
      const ext = crypto.randomUUID()
      const fetchItems = crypto.randomUUID()
      const cnt = crypto.randomUUID()
      const lg = crypto.randomUUID()
      return [
        {
          id: crypto.randomUUID(),
          name: 'OAuth Bearer Chain',
          order: 0,
          steps: [
            makeStep(login, 'HTTP_REQUEST', 'Request Access Token', 40, 120, {
              httpMethod: 'POST',
              httpUrl: 'https://httpbin.org/post',
              httpHeaders: 'Content-Type: application/json',
              httpBody: '{"client_id":"zeus","secret":"{{secret.API_SECRET}}"}',
              httpSaveBodyAs: 'authResp',
            }),
            makeStep(ext, 'TRANSFORM', 'Extract Token / Origin', 340, 120, {
              transformOp: 'jsonExtract',
              transformInput: '{{authResp}}',
              transformArg: 'json.client_id',
              transformSaveAs: 'bearerToken',
            }),
            makeStep(fetchItems, 'HTTP_REQUEST', 'Call Protected Endpoint', 640, 120, {
              httpMethod: 'GET',
              httpUrl: 'https://jsonplaceholder.typicode.com/todos',
              httpAuthType: 'bearer',
              httpAuthToken: '{{bearerToken}}',
              httpSaveBodyAs: 'todosJson',
              httpSaveHeadersAs: 'respHeaders',
            }),
            makeStep(cnt, 'CSV_JSON', 'Count Returned Items', 940, 120, {
              csvJsonOp: 'aggregate',
              csvJsonInput: '{{todosJson}}',
              csvAggOp: 'count',
              csvJsonSaveAs: 'itemTotal',
            }),
            makeStep(lg, 'LOG', 'Log API Summary', 1240, 120, {
              logLevel: 'info',
              logMessage: 'Fetched {{itemTotal}} item(s); response headers: {{respHeaders}}',
            }),
          ],
          edges: [makeEdge(login, ext), makeEdge(ext, fetchItems), makeEdge(fetchItems, cnt), makeEdge(cnt, lg)],
          frames: [],
        },
      ]
    },
  },
  {
    id: 'db-export-csv-open',
    name: 'SQL Query → JSON to CSV → Save & Reveal File',
    category: 'API & Data',
    description: 'Run a SQL query against the connected database, export all returned rows as an RFC-4180 CSV file, and reveal it in Explorer/Finder.',
    nodeCount: 5,
    build: () => {
      const dt = crypto.randomUUID()
      const db = crypto.randomUUID()
      const cj = crypto.randomUUID()
      const fw = crypto.randomUUID()
      const op = crypto.randomUUID()
      return [
        {
          id: crypto.randomUUID(),
          name: 'SQL → CSV File Export',
          order: 0,
          steps: [
            makeStep(dt, 'DATETIME', 'Build Filename Date', 40, 120, {
              dtOp: 'now',
              dtFormat: 'YYYYMMDD_HHmmss',
              dtSaveAs: 'exportTs',
            }),
            makeStep(db, 'DB_QUERY', 'Query Database Rows', 340, 120, {
              dbSql: 'SELECT * FROM tags ORDER BY id DESC LIMIT 100',
              dbSaveAs: 'firstCell',
              dbSaveRowsAs: 'dbRowsJson',
            }),
            makeStep(cj, 'CSV_JSON', 'Format Rows as CSV', 640, 120, {
              csvJsonOp: 'jsonToCsv',
              csvJsonInput: '{{dbRowsJson}}',
              csvJsonSaveAs: 'csvText',
            }),
            makeStep(fw, 'FILE_WRITE', 'Save CSV to Disk', 940, 120, {
              fileStorageProvider: 'local',
              filePath: './data/db_export_{{exportTs}}.csv',
              fileContent: '{{csvText}}',
            }),
            makeStep(op, 'OPEN_APP', 'Reveal in Folder', 1240, 120, {
              openMode: 'reveal',
              openTarget: './data/db_export_{{exportTs}}.csv',
            }),
          ],
          edges: [makeEdge(dt, db), makeEdge(db, cj), makeEdge(cj, fw), makeEdge(fw, op)],
          frames: [],
        },
      ]
    },
  },
  {
    id: 'csv-filter-aggregate-export',
    name: 'Read CSV → Filter → Sort → Sum → Export CSV',
    category: 'Files & Batch',
    description: 'Read a local CSV file, parse to JSON, filter matching rows, sort descending, compute a sum total, and write a clean filtered CSV.',
    nodeCount: 7,
    build: () => {
      const fr = crypto.randomUUID()
      const p1 = crypto.randomUUID()
      const flt = crypto.randomUUID()
      const srt = crypto.randomUUID()
      const agg = crypto.randomUUID()
      const c2 = crypto.randomUUID()
      const fw = crypto.randomUUID()
      return [
        {
          id: crypto.randomUUID(),
          name: 'CSV ETL Pipeline',
          order: 0,
          steps: [
            makeStep(fr, 'FILE_READ', 'Read Source CSV', 40, 120, {
              fileStorageProvider: 'local',
              filePath: './data/orders.csv',
              fileSaveAs: 'rawCsv',
            }),
            makeStep(p1, 'CSV_JSON', 'CSV → JSON', 330, 120, {
              csvJsonOp: 'csvToJson',
              csvJsonInput: '{{rawCsv}}',
              csvJsonSaveAs: 'ordersJson',
            }),
            makeStep(flt, 'CSV_JSON', 'Keep status=open', 620, 120, {
              csvJsonOp: 'filterArray',
              csvJsonInput: '{{ordersJson}}',
              csvFilterField: 'status',
              csvFilterOp: 'eq',
              csvFilterValue: 'open',
              csvJsonSaveAs: 'openOrders',
            }),
            makeStep(srt, 'CSV_JSON', 'Sort by qty DESC', 910, 120, {
              csvJsonOp: 'sortArray',
              csvJsonInput: '{{openOrders}}',
              csvSortField: 'qty',
              csvSortDir: 'desc',
              csvJsonSaveAs: 'sortedOrders',
            }),
            makeStep(agg, 'CSV_JSON', 'Sum Open Qty', 1200, 120, {
              csvJsonOp: 'aggregate',
              csvJsonInput: '{{sortedOrders}}',
              csvMapField: 'qty',
              csvAggOp: 'sum',
              csvJsonSaveAs: 'totalQty',
            }),
            makeStep(c2, 'CSV_JSON', 'JSON → Clean CSV', 1490, 120, {
              csvJsonOp: 'jsonToCsv',
              csvJsonInput: '{{sortedOrders}}',
              csvJsonSaveAs: 'cleanCsv',
            }),
            makeStep(fw, 'FILE_WRITE', 'Write Filtered CSV', 1780, 120, {
              fileStorageProvider: 'local',
              filePath: './data/orders_open.csv',
              fileContent: '{{cleanCsv}}',
            }),
          ],
          edges: [
            makeEdge(fr, p1),
            makeEdge(p1, flt),
            makeEdge(flt, srt),
            makeEdge(srt, agg),
            makeEdge(agg, c2),
            makeEdge(c2, fw),
          ],
          frames: [],
        },
      ]
    },
  },
  {
    id: 'python-script-pipeline',
    name: 'Inline Python Script → Assert Exit 0 → Save JSON',
    category: 'Files & Batch',
    description: 'Run an inline Python script with access to Zeus environment variables, capture stdout + exit code, assert clean exit, and write JSON to disk.',
    nodeCount: 4,
    build: () => {
      const dt = crypto.randomUUID()
      const py = crypto.randomUUID()
      const asrt = crypto.randomUUID()
      const fw = crypto.randomUUID()
      return [
        {
          id: crypto.randomUUID(),
          name: 'Python Script Runner',
          order: 0,
          steps: [
            makeStep(dt, 'DATETIME', 'Run Timestamp', 40, 120, {
              dtOp: 'now',
              dtFormat: 'ISO',
              dtSaveAs: 'runTs',
            }),
            makeStep(py, 'RUN_SCRIPT', 'Run Inline Python', 340, 120, {
              scriptInline: true,
              scriptLang: 'py',
              scriptInlineText: 'import json, os\nprint(json.dumps({"host": os.environ.get("ZEUS_HOST", ""), "ts": os.environ.get("ZEUS_RUNTS", "")}))',
              scriptSaveStdoutAs: 'pyJson',
              scriptSaveStderrAs: 'pyErr',
              scriptSaveExitCodeAs: 'pyExit',
              scriptFailOnNonZero: false,
            }),
            makeStep(asrt, 'ASSERT', 'Assert Exit Code 0', 640, 120, {
              condLeft: '{{pyExit}}',
              condOp: 'eq',
              condRight: '0',
              assertMessage: 'Python exited with {{pyExit}}: {{pyErr}}',
            }),
            makeStep(fw, 'FILE_WRITE', 'Write Output JSON', 940, 120, {
              fileStorageProvider: 'local',
              filePath: './data/python_result.json',
              fileContent: '{{pyJson}}',
            }),
          ],
          edges: [makeEdge(dt, py), makeEdge(py, asrt), makeEdge(asrt, fw)],
          frames: [],
        },
      ]
    },
  },
  {
    id: 'folder-watch-webhook',
    name: 'Scan Folder for CSVs → Read First → Teams Notify',
    category: 'Files & Batch',
    description: 'List CSV files in ./data; if at least one exists, extract the first path, read its contents, and post a Microsoft Teams summary.',
    nodeCount: 6,
    build: () => {
      const fl = crypto.randomUUID()
      const cond = crypto.randomUUID()
      const tr = crypto.randomUUID()
      const fr = crypto.randomUUID()
      const wh = crypto.randomUUID()
      const lg = crypto.randomUUID()
      return [
        {
          id: crypto.randomUUID(),
          name: 'Folder CSV Watcher',
          order: 0,
          steps: [
            makeStep(fl, 'FILE_LIST', 'Find CSV Files', 40, 140, {
              fileStorageProvider: 'local',
              filePath: './data',
              fileFilter: '*.csv',
              fileSaveAs: 'csvFiles',
            }),
            makeStep(cond, 'CONDITION', 'Any CSV Found?', 340, 140, {
              condLeft: '{{csvFilesCount}}',
              condOp: 'gt',
              condRight: '0',
            }),
            makeStep(tr, 'TRANSFORM', 'Pick First File Path', 650, 50, {
              transformOp: 'jsonExtract',
              transformInput: '{{csvFilesPaths}}',
              transformArg: '0',
              transformSaveAs: 'firstCsvPath',
            }),
            makeStep(fr, 'FILE_READ', 'Read CSV File', 950, 50, {
              fileStorageProvider: 'local',
              filePath: '{{firstCsvPath}}',
              fileSaveAs: 'csvText',
            }),
            makeStep(wh, 'WEBHOOK_SEND', 'Notify Teams Channel', 1250, 50, {
              webhookPreset: 'teams',
              webhookUrl: '{{secret.TEAMS_WEBHOOK}}',
              webhookTitle: 'Found {{csvFilesCount}} CSV File(s)',
              webhookMessage: 'Latest file: {{firstCsvPath}}',
              webhookColor: '#10b981',
              webhookFailOnError: false,
            }),
            makeStep(lg, 'LOG', 'Log Empty Folder', 650, 240, {
              logLevel: 'info',
              logMessage: 'No CSV files matched in ./data',
            }),
          ],
          edges: [
            makeEdge(fl, cond),
            makeEdge(cond, tr, 'true'),
            makeEdge(tr, fr),
            makeEdge(fr, wh),
            makeEdge(cond, lg, 'false'),
          ],
          frames: [],
        },
      ]
    },
  },
  {
    id: 'api-qa-smoke-suite',
    name: 'Parallel API Smoke Suite → Assert 200s → Report',
    category: 'Testing & QA',
    description: 'Run two REST smoke checks in parallel, assert HTTP 200 on each branch, then send a Slack report + OS desktop toast when both pass.',
    nodeCount: 7,
    build: () => {
      const fork = crypto.randomUUID()
      const h1 = crypto.randomUUID()
      const a1 = crypto.randomUUID()
      const h2 = crypto.randomUUID()
      const a2 = crypto.randomUUID()
      const wh = crypto.randomUUID()
      const nt = crypto.randomUUID()
      return [
        {
          id: crypto.randomUUID(),
          name: 'Parallel QA Smoke Suite',
          order: 0,
          steps: [
            makeStep(fork, 'PARALLEL_BRANCH', 'Fork API Suites', 40, 160, {
              parallelBranches: [{ label: 'Posts API' }, { label: 'Users API' }],
              parallelWaitMode: 'all',
            }),
            makeStep(h1, 'HTTP_REQUEST', 'GET /posts/1', 390, 50, {
              httpMethod: 'GET',
              httpUrl: 'https://jsonplaceholder.typicode.com/posts/1',
              httpSaveStatusAs: 's1',
              httpFailOnError: false,
            }),
            makeStep(a1, 'ASSERT', 'Assert Posts 200', 700, 50, {
              condLeft: '{{s1}}',
              condOp: 'eq',
              condRight: '200',
              assertMessage: '/posts/1 returned HTTP {{s1}}',
            }),
            makeStep(h2, 'HTTP_REQUEST', 'GET /users/1', 390, 260, {
              httpMethod: 'GET',
              httpUrl: 'https://jsonplaceholder.typicode.com/users/1',
              httpSaveStatusAs: 's2',
              httpFailOnError: false,
            }),
            makeStep(a2, 'ASSERT', 'Assert Users 200', 700, 260, {
              condLeft: '{{s2}}',
              condOp: 'eq',
              condRight: '200',
              assertMessage: '/users/1 returned HTTP {{s2}}',
            }),
            makeStep(wh, 'WEBHOOK_SEND', 'Post QA Pass to Slack', 700, 430, {
              webhookPreset: 'slack',
              webhookUrl: '{{secret.SLACK_WEBHOOK}}',
              webhookTitle: 'QA Smoke Suite Passed',
              webhookMessage: '/posts/1={{s1}}, /users/1={{s2}}',
              webhookColor: '#22c55e',
              webhookFailOnError: false,
            }),
            makeStep(nt, 'NOTIFY', 'Desktop QA Toast', 1010, 430, {
              notifyLevel: 'success',
              notifyTitle: 'QA Smoke Passed',
              notifyMessage: 'Both parallel endpoints returned HTTP 200.',
              notifyDesktop: true,
            }),
          ],
          edges: [
            makeEdge(fork, h1, 'branch-0'),
            makeEdge(h1, a1),
            makeEdge(fork, h2, 'branch-1'),
            makeEdge(h2, a2),
            makeEdge(fork, wh, 'done'),
            makeEdge(wh, nt),
          ],
          frames: [],
        },
      ]
    },
  },
  {
    id: 'ws-realtime-monitor',
    name: 'WebSocket Echo & Regex Match Health Check',
    category: 'Testing & QA',
    description: 'Send a timestamped ping payload over WebSocket, validate the streamed reply matches a regex, log it, and pop a notification.',
    nodeCount: 4,
    build: () => {
      const dt = crypto.randomUUID()
      const ws = crypto.randomUUID()
      const lg = crypto.randomUUID()
      const nt = crypto.randomUUID()
      return [
        {
          id: crypto.randomUUID(),
          name: 'WebSocket Health Check',
          order: 0,
          steps: [
            makeStep(dt, 'DATETIME', 'Stamp Ping Time', 40, 120, {
              dtOp: 'now',
              dtFormat: 'ISO',
              dtSaveAs: 'pingTs',
            }),
            makeStep(ws, 'WEBSOCKET', 'Send & Assert WS Reply', 340, 120, {
              wsUrl: 'wss://echo.websocket.events',
              wsSendMessage: 'zeus-ping:{{pingTs}}',
              wsWaitForMessage: true,
              wsMatchRegex: 'zeus-ping',
              wsTimeoutMs: 8000,
              wsSaveAs: 'wsReply',
            }),
            makeStep(lg, 'LOG', 'Log WebSocket Echo', 640, 120, {
              logLevel: 'info',
              logMessage: 'WS matched reply: {{wsReply}}',
            }),
            makeStep(nt, 'NOTIFY', 'Notify Pass', 940, 120, {
              notifyLevel: 'success',
              notifyTitle: 'WebSocket Healthy',
              notifyMessage: 'Echo reply validated for {{pingTs}}',
            }),
          ],
          edges: [makeEdge(dt, ws), makeEdge(ws, lg), makeEdge(lg, nt)],
          frames: [],
        },
      ]
    },
  },
  {
    id: 'custom-code-loop-pipeline',
    name: 'Reusable Custom Code Sub-Sequence (Loop N Times)',
    category: 'API & Data',
    description: 'Initialize a counter variable, loop a linked sub-sequence 5 times executing custom user code each iteration, then notify with the accumulated result.',
    nodeCount: 5,
    build: () => {
      const subId = crypto.randomUUID()
      const init = crypto.randomUUID()
      const loop = crypto.randomUUID()
      const nt = crypto.randomUUID()
      const fnStep = crypto.randomUUID()
      const dly = crypto.randomUUID()
      return [
        {
          id: crypto.randomUUID(),
          name: 'Main Caller (Loop 5×)',
          order: 0,
          steps: [
            makeStep(init, 'SET_VARIABLE', 'Initialize total = 0', 40, 120, {
              varName: 'runningTotal',
              varValue: '0',
              varType: 'number',
            }),
            makeStep(loop, 'LOOP_N', 'Run Custom Code 5×', 340, 120, {
              loopCount: '5',
              loopIndexAs: 'iter',
              loopSequenceId: subId,
            }),
            makeStep(nt, 'NOTIFY', 'Done Summary', 650, 120, {
              notifyLevel: 'success',
              notifyTitle: 'Loop Complete',
              notifyMessage: 'Final accumulated total = {{runningTotal}}',
            }),
          ],
          edges: [makeEdge(init, loop), makeEdge(loop, nt)],
          frames: [],
        },
        {
          id: subId,
          name: '↳ Reusable Code Function',
          order: 1,
          steps: [
            makeStep(fnStep, 'CODE', 'Custom Step Function', 40, 120, {
              codeLanguage: 'javascript',
              codeSource:
                "// Runs once per LOOP_N / CALL_SEQUENCE invocation.\nconst cur = Number(vars.runningTotal || 0)\nconst idx = Number(vars.iter || 0) + 1\nvars.runningTotal = cur + idx * 10\nlog('Iteration', idx, '→ runningTotal =', vars.runningTotal)\n",
            }),
            makeStep(dly, 'DELAY', 'Pace 150ms', 350, 120, { duration: 150 }),
          ],
          edges: [makeEdge(fnStep, dly)],
          frames: [],
        },
      ]
    },
  },
  {
    id: 'polyglot-code-workflow',
    name: 'Python / Multi-Language Custom Code → Branch Alert',
    category: 'API & Data',
    description: 'Pick any language (Python, TypeScript, Node.js, PowerShell, Java, Go, Ruby, PHP) in the Custom Code node, compute results, and branch on output.',
    nodeCount: 5,
    build: () => {
      const sv = crypto.randomUUID()
      const py = crypto.randomUUID()
      const cond = crypto.randomUUID()
      const ok = crypto.randomUUID()
      const err = crypto.randomUUID()
      return [
        {
          id: crypto.randomUUID(),
          name: 'Polyglot Code Runner',
          order: 0,
          steps: [
            makeStep(sv, 'SET_VARIABLE', 'Seed Input Metric', 40, 140, {
              varName: 'tagCount',
              varValue: '12',
              varType: 'number',
            }),
            makeStep(py, 'CODE', 'Run Python Logic', 340, 140, {
              codeLanguage: 'python',
              codeSource:
                'import json, os\nvars_map = json.loads(os.environ.get("ZEUS_VARS_JSON", "{}"))\nscore = int(float(vars_map.get("tagCount") or 0)) * 2\nprint(json.dumps({"computedScore": score, "passed": "true" if score >= 20 else "false"}))\n',
              codeSaveStdoutAs: 'codeOut',
              codeSaveExitCodeAs: 'codeExit',
              codeFailOnNonZero: true,
            }),
            makeStep(cond, 'CONDITION', 'Passed Threshold?', 650, 140, {
              condLeft: '{{passed}}',
              condOp: 'isTrue',
            }),
            makeStep(ok, 'NOTIFY', 'Success Toast', 960, 50, {
              notifyLevel: 'success',
              notifyTitle: 'Code Passed',
              notifyMessage: 'Score={{computedScore}} (exit={{codeExit}})',
            }),
            makeStep(err, 'LOG', 'Below Threshold', 960, 230, {
              logLevel: 'warn',
              logMessage: 'Score {{computedScore}} below threshold',
            }),
          ],
          edges: [
            makeEdge(sv, py),
            makeEdge(py, cond),
            makeEdge(cond, ok, 'true'),
            makeEdge(cond, err, 'false'),
          ],
          frames: [],
        },
      ]
    },
  },
]
