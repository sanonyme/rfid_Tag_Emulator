import { useState, useRef, useEffect, useCallback, useMemo, memo } from 'react'
import { motion, AnimatePresence, Reorder } from 'framer-motion'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from './ui/tooltip'
import { ScrollArea } from './ui/scroll-area'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select'
import {
  Play,
  Square,
  Trash2,
  Copy,
  Check,
  Terminal,
  Plus,
  ChevronDown,
  GripVertical,
  ListOrdered,
  ChevronUp,
  RotateCcw,
  Upload,
  Download,
  Maximize2,
  Braces,
  ChevronRight,
  Sparkles,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  History,
  CheckCircle2 as CircleCheck,
  XCircle as CircleX,
  CircleSlash,
  Loader2 as LoaderCircle,
  Boxes,
  LayoutTemplate,
  Search,
  AlertTriangle,
  Activity,
} from 'lucide-react'
import { useEdgeSession } from '@/contexts/EdgeSessionContext'
import { publishStatus, clearStatus } from '@/lib/workspace-status'
import {
  TCPEmulatorClient,
  HandheldServerClient,
  OCRClient,
  type TagData,
  EPCGenerator,
  expandUpcListToEpcs,
  parseEpcListLine,
} from '@/lib/tcp-client'
import { toast } from 'sonner'
import { cn, formatTime } from '@/lib/utils'
import { getHandheldFullActivityLog } from '@/lib/handheld-log-settings'
import {
  getAutomationFullActivityLog,
  setAutomationFullActivityLog,
} from '@/lib/automation-log-settings'
import { Switch } from './ui/switch'
import type {
  AutomationStep,
  AutomationSequence,
  AutomationEdge,
  ActionType,
  AutomationFrame,
  AutomationTrigger,
} from '@/lib/automation-types'
import {
  normalizeSequences,
  parseWorkflowSequences,
  deriveLinearEdges,
  DEFAULT_STEP_NAMES,
  defaultParamsForType,
  ERROR_HANDLE,
  resolveNodePolicy,
  isRegularOutputHandle,
  findNextEdge,
} from '@/lib/automation-types'
import {
  loadExecutions,
  saveExecutions,
  pushExecution,
  updateExecution,
  snapshotLog,
  formatDuration,
  formatRelativeTime,
  type ExecutionRecord,
  type ExecutionStatus,
} from '@/lib/automation-executions'
import {
  createRunContext,
  applyTemplate,
  captureEpcsToVars,
  resolveStartSerial,
  advanceNextSerial,
  parseInterTagDelayMs,
  evaluateCondition,
  parseListItems,
  switchHandle,
  pickWeightedIndex,
  AutomationStopSignal,
  STANDARD_AUTOMATION_VARS,
  type AutomationVars,
} from '@/lib/automation-template'
import {
  executeDbQuery,
  executeDbExec,
  executeRunScript,
  executeSetVariable,
  executeHttpRequest,
  executeCode,
  executeAssert,
  executeWaitUntil,
  executeStop,
  executeGenerate,
  executeComment,
  executeTransform,
  executeFileRead,
  executeFileWrite,
  executeFileList,
  executeTcpNode,
} from '@/lib/automation-blocks'
import {
  computeAutoLayout,
  NODE_HEIGHT,
  NODE_WIDTH,
  type LayoutDirection,
  type NodeRunTelemetry,
} from '@/lib/automation-layout'
import { validateSequence } from '@/lib/automation-validation'
import { AutomationTriggersDialog, loadSavedTriggers, TRIGGERS_STORAGE_KEY } from './automation/AutomationTriggersDialog'
import { AutomationCanvas, type EditorTool } from './automation/AutomationCanvas'
import { NodeLibraryDrawer, WorkflowTemplatesDrawer } from './automation/NodeLibrarySidebar'
import type { EdgeStyle } from './automation/WorkflowEdge'
import { NodeConfigDialog } from './NodeConfigDialog'
import { NodePalette } from './NodePalette'
import { DEMO_WORKFLOW } from '@/lib/automation-demo-workflow'

export type { EdgeStyle, EditorTool }

interface AutomationTabProps {
  emulator: TCPEmulatorClient
  handheldServer: HandheldServerClient
  ocrClient: OCRClient
  host: string
  alePort: string
  customPort: string
  delay: string
  handheldDelay: string
  sequences: AutomationSequence[]
  setSequences: React.Dispatch<React.SetStateAction<AutomationSequence[]>>
}

const PASTE_OFFSET = 36
const MAX_GRAPH_STEPS = 10000
const MAX_AUTOMATION_LOG_LINES = 1000
const MAX_CALL_DEPTH = 20
const EDGE_STYLE_ORDER: EdgeStyle[] = ['curved', 'step', 'straight']

function makeRssiPicker(params: AutomationStep['params']): () => string {
  const baseRssiStr = params.rssi || '-45.0'
  const baseRssiNumber = (() => {
    const n = parseFloat(baseRssiStr)
    return Number.isFinite(n) ? n : -45.0
  })()
  const defaultRandomMin = -90
  const defaultRandomMax = -20
  const rssiRandomize = params.rssiRandomize === true

  const parseMaybeNumber = (s?: string) => {
    if (!s || !s.trim()) return null
    const n = parseFloat(s)
    return Number.isFinite(n) ? n : null
  }

  let effectiveMin = baseRssiNumber
  let effectiveMax = baseRssiNumber
  if (rssiRandomize) {
    const minN = parseMaybeNumber(params.rssiRandMin)
    const maxN = parseMaybeNumber(params.rssiRandMax)
    effectiveMin = minN ?? defaultRandomMin
    effectiveMax = maxN ?? defaultRandomMax
    if (effectiveMin > effectiveMax) {
      ;[effectiveMin, effectiveMax] = [effectiveMax, effectiveMin]
    }
  }

  return () => {
    if (!rssiRandomize) return baseRssiStr
    const val =
      effectiveMin === effectiveMax
        ? effectiveMin
        : effectiveMin + Math.random() * (effectiveMax - effectiveMin)
    return val.toFixed(1)
  }
}

const STANDARD_VAR_NAMES = new Set(STANDARD_AUTOMATION_VARS.map((v) => v.name))
const STANDARD_VAR_DESCRIPTIONS: Record<string, string> = Object.fromEntries(
  STANDARD_AUTOMATION_VARS.map((v) => [v.name, v.description]),
)

function VariableListBody({
  vars,
  size = 'sm',
}: {
  vars: AutomationVars
  size?: 'sm' | 'md'
}) {
  const entries = Object.entries(vars)
  const standard = entries
    .filter(([k]) => STANDARD_VAR_NAMES.has(k))
    .sort((a, b) => a[0].localeCompare(b[0]))
  const custom = entries
    .filter(([k]) => !STANDARD_VAR_NAMES.has(k))
    .sort((a, b) => a[0].localeCompare(b[0]))
  const textSize = size === 'sm' ? 'text-[11px]' : 'text-sm'
  const nameWidth = size === 'sm' ? 'max-w-[42%]' : 'max-w-[36%]'

  const Row = ([name, value]: [string, string]) => (
    <div key={name} className="flex items-start gap-2 rounded px-2 py-1 hover:bg-accent/40">
      <code
        className={cn('shrink-0 truncate font-mono font-semibold text-primary', nameWidth, textSize)}
        title={STANDARD_VAR_DESCRIPTIONS[name] ? `${name} — ${STANDARD_VAR_DESCRIPTIONS[name]}` : name}
      >
        {name}
      </code>
      <span
        className={cn('min-w-0 flex-1 whitespace-pre-wrap break-words font-mono text-foreground/80', textSize)}
        title={value}
      >
        {value === '' ? <span className="italic text-muted-foreground/60">empty</span> : value}
      </span>
    </div>
  )

  if (entries.length === 0) {
    return (
      <p className={cn('px-2 py-3 text-center text-muted-foreground', textSize)}>
        No variables yet. Run a workflow to capture values.
      </p>
    )
  }

  return (
    <>
      {standard.map(Row)}
      {custom.length > 0 && standard.length > 0 && (
        <div className="my-1 border-t border-border/50" />
      )}
      {custom.map(Row)}
    </>
  )
}

const VariableInspector = memo(function VariableInspector({
  vars,
  open,
  onToggle,
  onReset,
  onExpand,
  isRunning,
}: {
  vars: AutomationVars
  open: boolean
  onToggle: () => void
  onReset: () => void
  onExpand: () => void
  isRunning: boolean
}) {
  const entries = Object.entries(vars)

  return (
    <div className="shrink-0 rounded-xl border border-border/50 bg-muted/10 overflow-hidden">
      <div className="flex w-full items-center gap-1 px-3 py-2">
        <button
          type="button"
          onClick={onToggle}
          className="flex min-w-0 flex-1 items-center gap-2 text-left focus:outline-none select-none hover:bg-accent/30 rounded -mx-1 px-1 py-0.5"
        >
          <Braces className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Variables</span>
          <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-muted-foreground">
            {entries.length}
          </span>
          {isRunning && <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse-slow" title="Updating live" />}
          <ChevronRight className={cn('ml-auto h-4 w-4 text-muted-foreground transition-transform', open && 'rotate-90')} />
        </button>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              disabled={isRunning}
              onClick={onReset}
              className="shrink-0 rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-40 focus:outline-none select-none"
              aria-label="Reset variables"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="left" className="max-w-[14rem] text-xs">
            Reset variables to connection defaults (host, ports)
          </TooltipContent>
        </Tooltip>
      </div>
      {open && (
        <div
          className={cn(
            'group/expand relative border-t border-border/40 transition-shadow',
            'ring-1 ring-transparent hover:ring-border/80 hover:shadow-sm',
          )}
        >
          <div className="max-h-[min(28vh,200px)] overflow-y-auto overscroll-contain">
            <div className="space-y-0.5 px-1 py-1 pb-2 pr-11">
              <VariableListBody vars={vars} />
            </div>
          </div>
          <div
            className={cn(
              'pointer-events-none absolute right-1.5 top-1.5 z-10 flex flex-row items-start gap-1',
              'opacity-60 sm:scale-95 sm:opacity-0',
              'sm:group-hover/expand:scale-100 sm:group-hover/expand:opacity-100',
              'transition-all duration-200 ease-out',
            )}
          >
            <Tooltip delayDuration={400}>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="secondary"
                  size="icon"
                  className="pointer-events-auto h-7 w-7 shrink-0 rounded-md border border-border/60 bg-background/90 shadow-sm backdrop-blur-sm hover:bg-accent"
                  aria-label="Expand variables"
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    onExpand()
                  }}
                >
                  <Maximize2 className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="left" className="text-xs">Expand variables</TooltipContent>
            </Tooltip>
          </div>
        </div>
      )}
    </div>
  )
})

function ExecutionStatusIcon({ status, className }: { status: ExecutionStatus; className?: string }) {
  switch (status) {
    case 'running':
      return <LoaderCircle className={cn('animate-spin text-primary', className)} aria-label="Running" />
    case 'success':
      return <CircleCheck className={cn('text-emerald-500', className)} aria-label="Succeeded" />
    case 'error':
      return <CircleX className={cn('text-destructive', className)} aria-label="Failed" />
    default:
      return <CircleSlash className={cn('text-muted-foreground', className)} aria-label="Stopped" />
  }
}

const EXECUTION_STATUS_LABEL: Record<ExecutionStatus, string> = {
  running: 'Running',
  success: 'Succeeded',
  error: 'Failed',
  stopped: 'Stopped',
}

function classifyLogLine(line: string): 'error' | 'warn' | 'success' | 'step' | 'normal' {
  if (/error|failed|✖|exception/i.test(line)) return 'error'
  if (/⚠|warn|retry|skipped|stopped/i.test(line)) return 'warn'
  if (/completed successfully|succeeded|✓|ok\b|success/i.test(line)) return 'success'
  if (/▶|◇|⌥|🎲|⚡|↳|↩|--- Loop/i.test(line)) return 'step'
  return 'normal'
}

type LeftSidebarTab = 'sequences' | 'nodes' | 'templates'
type LogFilter = 'all' | 'errors' | 'steps'

export function AutomationTab({
  emulator,
  handheldServer,
  ocrClient,
  host,
  alePort,
  customPort,
  delay,
  handheldDelay,
  sequences,
  setSequences,
}: AutomationTabProps) {
  const handheldClientsByPortRef = useRef<Map<number, HandheldServerClient>>(new Map())
  const getHandheldClientForPort = useCallback(
    (portNum: number): HandheldServerClient => {
      if (portNum === handheldServer.getPort()) return handheldServer
      let client = handheldClientsByPortRef.current.get(portNum)
      if (!client) {
        client = new HandheldServerClient(portNum)
        handheldClientsByPortRef.current.set(portNum, client)
      }
      return client
    },
    [handheldServer],
  )
  const edgeSession = useEdgeSession()
  const sequencesRef = useRef(sequences)
  sequencesRef.current = sequences
  const sortedSeqs = useMemo(() => [...sequences].sort((a, b) => a.order - b.order), [sequences])
  const [selectedSequenceId, setSelectedSequenceId] = useState<string | null>(sortedSeqs[0]?.id ?? null)
  const selectedSequence = sortedSeqs.find((s) => s.id === selectedSequenceId)
  const steps = useMemo<AutomationStep[]>(() => selectedSequence?.steps ?? [], [selectedSequence])
  const edges = useMemo<AutomationEdge[]>(
    () => selectedSequence?.edges ?? deriveLinearEdges(selectedSequence?.steps ?? []),
    [selectedSequence],
  )
  const frames = useMemo<AutomationFrame[]>(
    () => selectedSequence?.frames ?? [],
    [selectedSequence],
  )

  const [leftTab, setLeftTab] = useState<LeftSidebarTab>('sequences')
  const [seqSearch, setSeqSearch] = useState('')
  const [logFilter, setLogFilter] = useState<LogFilter>('all')

  // Live validation across sequences
  const validationIssues = useMemo(
    () => validateSequence(selectedSequence, sortedSeqs),
    [selectedSequence, sortedSeqs],
  )

  const issuesCountBySeqId = useMemo(() => {
    const map = new Map<string, { errors: number; warnings: number }>()
    for (const seq of sortedSeqs) {
      const list = validateSequence(seq, sortedSeqs)
      if (list.length > 0) {
        map.set(seq.id, {
          errors: list.filter((i) => i.severity === 'error').length,
          warnings: list.filter((i) => i.severity === 'warning').length,
        })
      }
    }
    return map
  }, [sortedSeqs])

  // Per-node live execution telemetry (status, timing, run counts, last error)
  const [nodeTelemetry, setNodeTelemetry] = useState<Record<string, NodeRunTelemetry>>({})
  const setNodeRunState = useCallback(
    (stepId: string, patch: Partial<NodeRunTelemetry> & { state: NodeRunTelemetry['state']; incrementCount?: boolean }) => {
      setNodeTelemetry((prev) => {
        const cur = prev[stepId]
        return {
          ...prev,
          [stepId]: {
            state: patch.state,
            durationMs: patch.durationMs ?? cur?.durationMs,
            runCount: (cur?.runCount ?? 0) + (patch.incrementCount ? 1 : 0),
            lastError: patch.state === 'error' ? patch.lastError : patch.state === 'running' ? undefined : cur?.lastError,
            updatedAt: Date.now(),
          },
        }
      })
    },
    [],
  )

  const [triggers, setTriggers] = useState<AutomationTrigger[]>(() => loadSavedTriggers())
  const [triggersDialogOpen, setTriggersDialogOpen] = useState(false)
  const activeTriggerCount = useMemo(() => triggers.filter((t) => t.enabled).length, [triggers])
  const triggersRef = useRef(triggers)
  triggersRef.current = triggers

  useEffect(() => {
    localStorage.setItem(TRIGGERS_STORAGE_KEY, JSON.stringify(triggers))
  }, [triggers])

  const [isRunning, setIsRunning] = useState(false)
  const [runStartedAt, setRunStartedAt] = useState<number | null>(null)
  const [runElapsedMs, setRunElapsedMs] = useState(0)
  const [liveStepsRun, setLiveStepsRun] = useState(0)
  const parallelRunnersRef = useRef<Map<string, AbortController>>(new Map())
  const [runningSeqIds, setRunningSeqIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!isRunning || !runStartedAt) return
    const t = window.setInterval(() => setRunElapsedMs(Date.now() - runStartedAt), 250)
    return () => window.clearInterval(t)
  }, [isRunning, runStartedAt])

  useEffect(() => {
    if (isRunning) {
      publishStatus('automation', { status: 'sending', label: 'Automation' })
    } else {
      clearStatus('automation')
    }
    return () => clearStatus('automation')
  }, [isRunning])

  const [selectedStepId, setSelectedStepId] = useState<string | null>(null)
  const [configDialogOpen, setConfigDialogOpen] = useState(false)
  const [deleteConfirmSeq, setDeleteConfirmSeq] = useState<AutomationSequence | null>(null)
  const [editingSeqId, setEditingSeqId] = useState<string | null>(null)
  const [editingSeqName, setEditingSeqName] = useState('')
  const [currentRunningStepId, setCurrentRunningStepId] = useState<string | null>(null)
  const [loopCount, setLoopCount] = useState<string>('1')
  const [customLoopCount, setCustomLoopCount] = useState<string>('3')
  const [runMode, setRunMode] = useState<'loops' | 'duration' | 'parallel'>('loops')
  const [sequenceRunScope, setSequenceRunScope] = useState<'all' | 'current' | 'selected'>('all')
  const [checkedSequenceIds, setCheckedSequenceIds] = useState<Set<string>>(() => new Set())
  const [runDurationSeconds, setRunDurationSeconds] = useState<string>('300')
  const [runningSeqId, setRunningSeqId] = useState<string | null>(null)
  const [paletteOpen, setPaletteOpen] = useState(false)

  // Pending placement context when NodePalette is opened from edge `+`, wire drop, or right-click
  const pendingAddContextRef = useRef<
    | { mode: 'at'; pos: { x: number; y: number } }
    | { mode: 'insertOnEdge'; edgeId: string; pos: { x: number; y: number } }
    | { mode: 'connectFrom'; fromStepId: string; sourceHandle: string; pos: { x: number; y: number } }
    | null
  >(null)

  // --- Layout: collapsible resizable side panels ---
  const SEQ_PANEL_DEFAULT_WIDTH = 296
  const SEQ_PANEL_MIN_WIDTH = 236
  const SEQ_PANEL_MAX_WIDTH = 520
  const EXEC_PANEL_DEFAULT_WIDTH = 348
  const EXEC_PANEL_MIN_WIDTH = 300
  const EXEC_PANEL_MAX_WIDTH = 640
  const rootRef = useRef<HTMLDivElement>(null)
  const [leftPanelOpen, setLeftPanelOpen] = useState<boolean>(() => localStorage.getItem('automation-left-open') !== '0')
  const [rightPanelOpen, setRightPanelOpen] = useState<boolean>(() => localStorage.getItem('automation-right-open') !== '0')
  const [leftPanelWidth, setLeftPanelWidth] = useState<number>(() => {
    const saved = parseInt(localStorage.getItem('automation-left-width') ?? '', 10)
    return Number.isFinite(saved) ? Math.min(SEQ_PANEL_MAX_WIDTH, Math.max(SEQ_PANEL_MIN_WIDTH, saved)) : SEQ_PANEL_DEFAULT_WIDTH
  })
  const [rightPanelWidth, setRightPanelWidth] = useState<number>(() => {
    const saved = parseInt(localStorage.getItem('automation-right-width') ?? '', 10)
    return Number.isFinite(saved) ? Math.min(EXEC_PANEL_MAX_WIDTH, Math.max(EXEC_PANEL_MIN_WIDTH, saved)) : EXEC_PANEL_DEFAULT_WIDTH
  })
  const [isResizingLeft, setIsResizingLeft] = useState(false)
  const [isResizingRight, setIsResizingRight] = useState(false)

  const [edgeStyle, setEdgeStyle] = useState<EdgeStyle>(() => {
    const saved = localStorage.getItem('automation-edge-style')
    return saved === 'step' || saved === 'straight' || saved === 'curved' ? saved : 'curved'
  })
  const [tool, setTool] = useState<EditorTool>(() =>
    localStorage.getItem('automation-tool') === 'pan' ? 'pan' : 'select',
  )

  useEffect(() => { localStorage.setItem('automation-left-open', leftPanelOpen ? '1' : '0') }, [leftPanelOpen])
  useEffect(() => { localStorage.setItem('automation-right-open', rightPanelOpen ? '1' : '0') }, [rightPanelOpen])
  useEffect(() => { localStorage.setItem('automation-left-width', String(leftPanelWidth)) }, [leftPanelWidth])
  useEffect(() => { localStorage.setItem('automation-right-width', String(rightPanelWidth)) }, [rightPanelWidth])
  useEffect(() => { localStorage.setItem('automation-edge-style', edgeStyle) }, [edgeStyle])
  useEffect(() => { localStorage.setItem('automation-tool', tool) }, [tool])

  const cycleEdgeStyle = useCallback(() => {
    setEdgeStyle((prev) => EDGE_STYLE_ORDER[(EDGE_STYLE_ORDER.indexOf(prev) + 1) % EDGE_STYLE_ORDER.length])
  }, [])

  const handleLeftResizeStart = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault()
      const startX = e.clientX
      const startWidth = leftPanelWidth
      setIsResizingLeft(true)
      const onMove = (ev: PointerEvent) => {
        setLeftPanelWidth(Math.min(SEQ_PANEL_MAX_WIDTH, Math.max(SEQ_PANEL_MIN_WIDTH, startWidth + (ev.clientX - startX))))
      }
      const onUp = () => {
        setIsResizingLeft(false)
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
      }
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
    },
    [leftPanelWidth],
  )

  const handleRightResizeStart = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault()
      const startX = e.clientX
      const startWidth = rightPanelWidth
      setIsResizingRight(true)
      const onMove = (ev: PointerEvent) => {
        setRightPanelWidth(Math.min(EXEC_PANEL_MAX_WIDTH, Math.max(EXEC_PANEL_MIN_WIDTH, startWidth + (startX - ev.clientX))))
      }
      const onUp = () => {
        setIsResizingRight(false)
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
      }
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
    },
    [rightPanelWidth],
  )

  // Global shortcuts: [ / ] toggle panels, Tab opens NodePalette
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return
      if (e.key !== '[' && e.key !== ']' && e.key !== 'Tab') return
      if (!rootRef.current || rootRef.current.offsetParent === null) return
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return
      if (t?.closest('[role="dialog"], [data-radix-popper-content-wrapper], [data-node-palette]')) return
      e.preventDefault()
      if (e.key === '[') setLeftPanelOpen((o) => !o)
      else if (e.key === ']') setRightPanelOpen((o) => !o)
      else setPaletteOpen(true)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const [log, setLog] = useState<string[]>([])
  const [logExpandedOpen, setLogExpandedOpen] = useState(false)
  const [logCopied, setLogCopied] = useState(false)
  const [varsExpandedOpen, setVarsExpandedOpen] = useState(false)
  const [varsCopied, setVarsCopied] = useState(false)
  const [fullActivityLog, setFullActivityLog] = useState(() => getAutomationFullActivityLog())
  const fullActivityLogRef = useRef(fullActivityLog)
  fullActivityLogRef.current = fullActivityLog
  const logEndRef = useRef<HTMLDivElement>(null)
  const logExpandEndRef = useRef<HTMLDivElement>(null)
  const logQueueRef = useRef<string[]>([])
  const logFlushTimerRef = useRef<ReturnType<typeof setTimeout>>()
  const runVarsTimerRef = useRef<ReturnType<typeof setTimeout>>()
  const abortControllerRef = useRef<AbortController | null>(null)
  const runPromiseRef = useRef<Promise<void> | null>(null)
  const runLogRef = useRef<string[]>([])
  const runStepCountRef = useRef(0)

  const [executions, setExecutions] = useState<ExecutionRecord[]>(() => loadExecutions())
  const [executionsOpen, setExecutionsOpen] = useState<boolean>(() => localStorage.getItem('automation-executions-open') !== '0')
  const [activityLogOpen, setActivityLogOpen] = useState<boolean>(() => localStorage.getItem('automation-activity-log-open') !== '0')
  const [viewedExecution, setViewedExecution] = useState<ExecutionRecord | null>(null)
  const [, setHistoryTick] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setHistoryTick((n) => n + 1), 30_000)
    return () => clearInterval(t)
  }, [])
  useEffect(() => { saveExecutions(executions) }, [executions])
  useEffect(() => { localStorage.setItem('automation-executions-open', executionsOpen ? '1' : '0') }, [executionsOpen])
  useEffect(() => { localStorage.setItem('automation-activity-log-open', activityLogOpen ? '1' : '0') }, [activityLogOpen])

  const prevExecutionsOpenRef = useRef(executionsOpen)
  useEffect(() => {
    const wasOpen = prevExecutionsOpenRef.current
    prevExecutionsOpenRef.current = executionsOpen
    if (executionsOpen && !wasOpen) setActivityLogOpen(false)
  }, [executionsOpen])

  const runVarsRef = useRef<AutomationVars>({})
  const [runVars, setRunVars] = useState<AutomationVars>({})
  const [inspectorOpen, setInspectorOpen] = useState(true)
  const importInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isRunning) return
    setRunVars((prev) => {
      const conn = createRunContext({ host, alePort, customPort, port: '' })
      return {
        ...prev,
        host: conn.host,
        alePort: conn.alePort,
        customPort: conn.customPort,
        port: conn.port,
        nextSerial: prev.nextSerial?.trim() ? prev.nextSerial : conn.nextSerial,
      }
    })
  }, [host, alePort, customPort, isRunning])

  const handleResetVars = useCallback(() => {
    if (isRunning) return
    const fresh = createRunContext({ host, alePort, customPort, port: '' })
    runVarsRef.current = { ...fresh }
    setRunVars({ ...fresh })
  }, [host, alePort, customPort, isRunning])

  const publishRunVars = useCallback((immediate = false) => {
    if (immediate) {
      if (runVarsTimerRef.current) {
        clearTimeout(runVarsTimerRef.current)
        runVarsTimerRef.current = undefined
      }
      setRunVars({ ...runVarsRef.current })
      return
    }
    if (runVarsTimerRef.current) return
    runVarsTimerRef.current = setTimeout(() => {
      runVarsTimerRef.current = undefined
      setRunVars({ ...runVarsRef.current })
    }, 150)
  }, [])

  useEffect(() => {
    if (sortedSeqs.length > 0 && !selectedSequenceId) setSelectedSequenceId(sortedSeqs[0].id)
    if (selectedSequenceId && !sortedSeqs.find((s) => s.id === selectedSequenceId)) {
      setSelectedSequenceId(sortedSeqs[0]?.id ?? null)
    }
    setCheckedSequenceIds((prev) => {
      const valid = new Set(sortedSeqs.map((s) => s.id))
      let changed = false
      const next = new Set<string>()
      for (const id of prev) {
        if (valid.has(id)) next.add(id)
        else changed = true
      }
      return changed ? next : prev
    })
  }, [sortedSeqs, selectedSequenceId])

  const flushLogQueue = useCallback(() => {
    if (logFlushTimerRef.current) {
      clearTimeout(logFlushTimerRef.current)
      logFlushTimerRef.current = undefined
    }
    const batch = logQueueRef.current
    if (batch.length === 0) return
    logQueueRef.current = []
    setLog((prev) => {
      const next = prev.length === 0 ? batch : prev.concat(batch)
      return next.length > MAX_AUTOMATION_LOG_LINES ? next.slice(-MAX_AUTOMATION_LOG_LINES) : next
    })
  }, [])

  const addLog = useCallback(
    (msg: string) => {
      const line = `[${formatTime()}] ${msg}`
      const hist = runLogRef.current
      hist.push(line)
      if (hist.length > 2000) hist.splice(0, hist.length - 1500)
      if (!fullActivityLogRef.current) return
      logQueueRef.current.push(line)
      if (logFlushTimerRef.current != null) return
      logFlushTimerRef.current = setTimeout(flushLogQueue, 80)
    },
    [flushLogQueue],
  )

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ block: 'nearest' })
    if (logExpandedOpen) {
      logExpandEndRef.current?.scrollIntoView({ block: 'nearest' })
    }
  }, [log, logExpandedOpen])

  const filteredLog = useMemo(() => {
    if (logFilter === 'all') return log
    if (logFilter === 'errors') return log.filter((l) => classifyLogLine(l) === 'error' || classifyLogLine(l) === 'warn')
    return log.filter((l) => classifyLogLine(l) === 'step' || classifyLogLine(l) === 'success' || classifyLogLine(l) === 'error')
  }, [log, logFilter])

  const handleCopyLog = useCallback(async () => {
    const pending = logQueueRef.current
    const lines = pending.length > 0 ? log.concat(pending) : log
    if (lines.length === 0) return
    try {
      await navigator.clipboard.writeText(lines.join('\n'))
      setLogCopied(true)
      setTimeout(() => setLogCopied(false), 2000)
    } catch {
      toast.error('Could not copy log')
    }
  }, [log])

  useEffect(() => { if (!logExpandedOpen) setLogCopied(false) }, [logExpandedOpen])

  const handleCopyVars = useCallback(async () => {
    const text = Object.entries(runVars)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([k, v]) => `${k}: ${v}`)
      .join('\n')
    if (!text) return
    try {
      await navigator.clipboard.writeText(text)
      setVarsCopied(true)
      setTimeout(() => setVarsCopied(false), 2000)
    } catch {
      toast.error('Could not copy variables')
    }
  }, [runVars])

  useEffect(() => { if (!varsExpandedOpen) setVarsCopied(false) }, [varsExpandedOpen])

  // --- Sequence / Step / Edge / Frame mutations ---
  const updateStepsForSequence = useCallback(
    (seqId: string, updater: (steps: AutomationStep[]) => AutomationStep[]) => {
      setSequences((prev) => prev.map((seq) => (seq.id === seqId ? { ...seq, steps: updater(seq.steps) } : seq)))
    },
    [setSequences],
  )

  const updateEdgesForSequence = useCallback(
    (seqId: string, updater: (edges: AutomationEdge[]) => AutomationEdge[]) => {
      setSequences((prev) =>
        prev.map((seq) =>
          seq.id === seqId
            ? { ...seq, edges: updater(seq.edges ?? deriveLinearEdges(seq.steps)) }
            : seq,
        ),
      )
    },
    [setSequences],
  )

  const updateFramesForSequence = useCallback(
    (seqId: string, updater: (frames: AutomationFrame[]) => AutomationFrame[]) => {
      setSequences((prev) =>
        prev.map((seq) => (seq.id === seqId ? { ...seq, frames: updater(seq.frames ?? []) } : seq)),
      )
    },
    [setSequences],
  )

  // One-time migration for legacy sequences without edges
  useEffect(() => {
    setSequences((prev) => {
      if (prev.every((s) => s.edges !== undefined)) return prev
      return prev.map((s) => (s.edges !== undefined ? s : { ...s, edges: deriveLinearEdges(s.steps) }))
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const clipboardRef = useRef<{ steps: AutomationStep[]; edges: AutomationEdge[] } | null>(null)
  const [hasClipboard, setHasClipboard] = useState(false)

  // --- Undo / Redo ---
  type SeqSnapshot = { steps: AutomationStep[]; edges: AutomationEdge[]; frames?: AutomationFrame[] }
  const historyRef = useRef<{ past: SeqSnapshot[]; future: SeqSnapshot[] }>({ past: [], future: [] })
  const applyingHistoryRef = useRef(false)
  const lastSnapRef = useRef<string>('')
  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo] = useState(false)

  useEffect(() => {
    const seq = sortedSeqs.find((s) => s.id === selectedSequenceId)
    historyRef.current = { past: [], future: [] }
    lastSnapRef.current = seq ? JSON.stringify({ steps: seq.steps, edges: seq.edges ?? [], frames: seq.frames ?? [] }) : ''
    setCanUndo(false)
    setCanRedo(false)
    setSelectedIds(new Set())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSequenceId])

  useEffect(() => {
    if (!selectedSequence) return
    const snap = JSON.stringify({
      steps: selectedSequence.steps,
      edges: selectedSequence.edges ?? [],
      frames: selectedSequence.frames ?? [],
    })
    if (applyingHistoryRef.current) {
      applyingHistoryRef.current = false
      lastSnapRef.current = snap
      return
    }
    if (snap === lastSnapRef.current) return
    const timer = window.setTimeout(() => {
      if (lastSnapRef.current) {
        historyRef.current.past.push(JSON.parse(lastSnapRef.current) as SeqSnapshot)
        if (historyRef.current.past.length > 120) historyRef.current.past.shift()
        historyRef.current.future = []
        setCanUndo(true)
        setCanRedo(false)
      }
      lastSnapRef.current = snap
    }, 350)
    return () => window.clearTimeout(timer)
  }, [selectedSequence])

  const applySnapshot = useCallback(
    (snapshot: SeqSnapshot) => {
      if (!selectedSequenceId) return
      applyingHistoryRef.current = true
      lastSnapRef.current = JSON.stringify(snapshot)
      setSequences((seqs) =>
        seqs.map((s) =>
          s.id === selectedSequenceId
            ? { ...s, steps: snapshot.steps, edges: snapshot.edges, frames: snapshot.frames ?? [] }
            : s,
        ),
      )
    },
    [selectedSequenceId, setSequences],
  )

  const handleUndo = useCallback(() => {
    const h = historyRef.current
    if (h.past.length === 0) return
    const prev = h.past.pop()!
    if (lastSnapRef.current) h.future.push(JSON.parse(lastSnapRef.current) as SeqSnapshot)
    applySnapshot(prev)
    setCanUndo(h.past.length > 0)
    setCanRedo(true)
  }, [applySnapshot])

  const handleRedo = useCallback(() => {
    const h = historyRef.current
    if (h.future.length === 0) return
    const next = h.future.pop()!
    if (lastSnapRef.current) h.past.push(JSON.parse(lastSnapRef.current) as SeqSnapshot)
    applySnapshot(next)
    setCanUndo(true)
    setCanRedo(h.future.length > 0)
  }, [applySnapshot])

  // --- Graph Operations ---
  const handlePositionsCommit = useCallback(
    (updates: Map<string, { x: number; y: number }>) => {
      if (!selectedSequenceId) return
      updateStepsForSequence(selectedSequenceId, (prev) =>
        prev.map((s) => {
          const p = updates.get(s.id)
          return p ? { ...s, position: p } : s
        }),
      )
    },
    [selectedSequenceId, updateStepsForSequence],
  )

  const handleAddEdge = useCallback(
    (from: string, to: string, handle: string, targetHandle?: string) => {
      if (!selectedSequenceId) return
      updateEdgesForSequence(selectedSequenceId, (prev) => {
        const regular = isRegularOutputHandle(handle)
        const withoutSamePort = prev.filter((e) => {
          if (e.from !== from) return true
          return regular
            ? !isRegularOutputHandle(e.sourceHandle)
            : (e.sourceHandle ?? 'out') !== handle
        })
        return [
          ...withoutSamePort,
          {
            id: crypto.randomUUID(),
            from,
            to,
            sourceHandle: handle,
            ...(targetHandle && targetHandle !== 'in' ? { targetHandle } : {}),
          },
        ]
      })
    },
    [selectedSequenceId, updateEdgesForSequence],
  )

  const handleDeleteEdge = useCallback(
    (edgeId: string) => {
      if (!selectedSequenceId) return
      updateEdgesForSequence(selectedSequenceId, (prev) => prev.filter((e) => e.id !== edgeId))
    },
    [selectedSequenceId, updateEdgesForSequence],
  )

  const handleReconnectEdge = useCallback(
    (oldEdgeId: string, from: string, to: string, handle: string, targetHandle?: string) => {
      if (!selectedSequenceId) return
      updateEdgesForSequence(selectedSequenceId, (prev) => {
        const regular = isRegularOutputHandle(handle)
        const withoutOld = prev.filter((e) => {
          if (e.id === oldEdgeId) return false
          if (e.from !== from) return true
          return regular
            ? !isRegularOutputHandle(e.sourceHandle)
            : (e.sourceHandle ?? 'out') !== handle
        })
        return [
          ...withoutOld,
          {
            id: oldEdgeId,
            from,
            to,
            sourceHandle: handle,
            ...(targetHandle && targetHandle !== 'in' ? { targetHandle } : {}),
          },
        ]
      })
    },
    [selectedSequenceId, updateEdgesForSequence],
  )

  const buildNewStep = useCallback(
    (type: ActionType, pos: { x: number; y: number }): AutomationStep => {
      const params = defaultParamsForType(type, { customPort })
      if (type === 'EDGE_BLOCK') params.edgeBlockName = edgeSession.blocks[0]?.name ?? ''
      if (type === 'EDGE_PROCESS') params.edgeProcessName = edgeSession.processes[0]?.name ?? ''
      return {
        id: crypto.randomUUID(),
        type,
        name: DEFAULT_STEP_NAMES[type],
        position: pos,
        params,
      }
    },
    [customPort, edgeSession.blocks, edgeSession.processes],
  )

  const handleAddStep = useCallback(
    (type: ActionType) => {
      if (!selectedSequenceId) {
        toast.error('Select a sequence first')
        return
      }
      const ctx = pendingAddContextRef.current
      pendingAddContextRef.current = null

      const last = steps[steps.length - 1]
      const defaultPos = last?.position
        ? { x: Math.round(last.position.x + NODE_WIDTH + 84), y: Math.round(last.position.y) }
        : { x: 80, y: 120 }

      const newPosition = ctx ? ctx.pos : defaultPos
      const newStep = buildNewStep(type, newPosition)

      if (ctx?.mode === 'insertOnEdge') {
        setSequences((prev) =>
          prev.map((seq) => {
            if (seq.id !== selectedSequenceId) return seq
            const seqEdges = seq.edges ?? deriveLinearEdges(seq.steps)
            const targetEdge = seqEdges.find((e) => e.id === ctx.edgeId)
            if (!targetEdge) {
              return { ...seq, steps: [...seq.steps, newStep] }
            }
            const nextEdges = seqEdges.filter((e) => e.id !== ctx.edgeId)
            nextEdges.push({
              id: crypto.randomUUID(),
              from: targetEdge.from,
              to: newStep.id,
              sourceHandle: targetEdge.sourceHandle ?? 'out',
              ...(targetEdge.targetHandle ? { targetHandle: targetEdge.targetHandle } : {}),
            })
            if (type !== 'COMMENT') {
              const outHandle =
                type === 'CONDITION'
                  ? 'true'
                  : type === 'SWITCH'
                    ? 'case-0'
                    : type === 'RANDOM'
                      ? 'branch-0'
                      : isRegularOutputHandle(targetEdge.sourceHandle)
                        ? (targetEdge.sourceHandle ?? 'out')
                        : 'out'
              nextEdges.push({
                id: crypto.randomUUID(),
                from: newStep.id,
                to: targetEdge.to,
                sourceHandle: outHandle,
                ...(targetEdge.targetHandle ? { targetHandle: targetEdge.targetHandle } : {}),
              })
            }
            return { ...seq, steps: [...seq.steps, newStep], edges: nextEdges }
          }),
        )
        toast.success(`Inserted "${newStep.name}" on connection`)
      } else if (ctx?.mode === 'connectFrom') {
        const inferredTarget =
          ctx.sourceHandle === 'bottom'
            ? 'top'
            : ctx.sourceHandle === 'top'
              ? 'bottom'
              : ctx.sourceHandle === 'in'
                ? 'out'
                : undefined
        setSequences((prev) =>
          prev.map((seq) => {
            if (seq.id !== selectedSequenceId) return seq
            const seqEdges = seq.edges ?? deriveLinearEdges(seq.steps)
            const regular = isRegularOutputHandle(ctx.sourceHandle)
            const withoutSamePort = seqEdges.filter((e) => {
              if (e.from !== ctx.fromStepId) return true
              return regular
                ? !isRegularOutputHandle(e.sourceHandle)
                : (e.sourceHandle ?? 'out') !== ctx.sourceHandle
            })
            return {
              ...seq,
              steps: [...seq.steps, newStep],
              edges: [
                ...withoutSamePort,
                {
                  id: crypto.randomUUID(),
                  from: ctx.fromStepId,
                  to: newStep.id,
                  sourceHandle: ctx.sourceHandle,
                  ...(inferredTarget ? { targetHandle: inferredTarget } : {}),
                },
              ],
            }
          }),
        )
      } else {
        updateStepsForSequence(selectedSequenceId, (prev) => [...prev, newStep])
      }

      setSelectedIds(new Set([newStep.id]))
      setSelectedStepId(newStep.id)
      setConfigDialogOpen(true)
    },
    [selectedSequenceId, steps, buildNewStep, setSequences, updateStepsForSequence],
  )

  const handleDropNodeAt = useCallback(
    (type: ActionType, pos: { x: number; y: number }) => {
      if (!selectedSequenceId) {
        toast.error('Select a sequence first')
        return
      }
      const newStep = buildNewStep(type, pos)
      updateStepsForSequence(selectedSequenceId, (prev) => [...prev, newStep])
      setSelectedIds(new Set([newStep.id]))
      setSelectedStepId(newStep.id)
      setConfigDialogOpen(true)
    },
    [selectedSequenceId, buildNewStep, updateStepsForSequence],
  )

  const handleUpdateStep = useCallback(
    (id: string, updates: Partial<AutomationStep>) => {
      if (!selectedSequenceId) return
      updateStepsForSequence(selectedSequenceId, (prev) => prev.map((s) => (s.id === id ? { ...s, ...updates } : s)))
    },
    [selectedSequenceId, updateStepsForSequence],
  )

  const handleUpdateParams = useCallback(
    (id: string, updates: Partial<AutomationStep['params']>) => {
      if (!selectedSequenceId) return
      updateStepsForSequence(selectedSequenceId, (prev) =>
        prev.map((s) => (s.id === id ? { ...s, params: { ...s.params, ...updates } } : s)),
      )
    },
    [selectedSequenceId, updateStepsForSequence],
  )

  const handleDeleteSteps = useCallback(
    (ids: Set<string>) => {
      if (!selectedSequenceId || ids.size === 0) return
      setSequences((prev) =>
        prev.map((seq) => {
          if (seq.id !== selectedSequenceId) return seq
          const seqEdges = seq.edges ?? deriveLinearEdges(seq.steps)
          return {
            ...seq,
            steps: seq.steps.filter((s) => !ids.has(s.id)),
            edges: seqEdges.filter((e) => !ids.has(e.from) && !ids.has(e.to)),
          }
        }),
      )
      if (selectedStepId && ids.has(selectedStepId)) {
        setSelectedStepId(null)
        setConfigDialogOpen(false)
      }
      setSelectedIds((prev) => {
        const next = new Set(prev)
        ids.forEach((id) => next.delete(id))
        return next
      })
    },
    [selectedSequenceId, selectedStepId, setSequences],
  )

  const insertClones = useCallback(
    (srcSteps: AutomationStep[], srcEdges: AutomationEdge[], dx: number, dy: number) => {
      if (!selectedSequenceId || srcSteps.length === 0) return
      const idMap = new Map<string, string>()
      const clones: AutomationStep[] = srcSteps.map((s) => {
        const nid = crypto.randomUUID()
        idMap.set(s.id, nid)
        const base = s.position ?? { x: 0, y: 0 }
        return {
          ...s,
          id: nid,
          params: JSON.parse(JSON.stringify(s.params)),
          position: { x: Math.round(base.x + dx), y: Math.round(base.y + dy) },
        }
      })
      const clonedEdges: AutomationEdge[] = srcEdges
        .filter((e) => idMap.has(e.from) && idMap.has(e.to))
        .map((e) => ({
          id: crypto.randomUUID(),
          from: idMap.get(e.from)!,
          to: idMap.get(e.to)!,
          sourceHandle: e.sourceHandle,
          ...(e.targetHandle ? { targetHandle: e.targetHandle } : {}),
        }))
      setSequences((prev) =>
        prev.map((seq) =>
          seq.id === selectedSequenceId
            ? {
                ...seq,
                steps: [...seq.steps, ...clones],
                edges: [...(seq.edges ?? deriveLinearEdges(seq.steps)), ...clonedEdges],
              }
            : seq,
        ),
      )
      setSelectedIds(new Set(clones.map((c) => c.id)))
    },
    [selectedSequenceId, setSequences],
  )

  const handleDuplicateSteps = useCallback(
    (ids: Set<string>) => {
      if (ids.size === 0) return
      insertClones(
        steps.filter((s) => ids.has(s.id)),
        edges.filter((e) => ids.has(e.from) && ids.has(e.to)),
        PASTE_OFFSET,
        PASTE_OFFSET,
      )
    },
    [steps, edges, insertClones],
  )

  const handleCopySteps = useCallback(
    (ids: Set<string>) => {
      if (ids.size === 0) return
      clipboardRef.current = {
        steps: steps.filter((s) => ids.has(s.id)).map((s) => JSON.parse(JSON.stringify(s)) as AutomationStep),
        edges: edges.filter((e) => ids.has(e.from) && ids.has(e.to)).map((e) => ({ ...e })),
      }
      setHasClipboard(true)
      toast.success(`Copied ${ids.size} node${ids.size !== 1 ? 's' : ''}`)
    },
    [steps, edges],
  )

  const handlePasteSteps = useCallback(
    (at?: { x: number; y: number }) => {
      const clip = clipboardRef.current
      if (!clip || clip.steps.length === 0) return
      if (at) {
        const minX = Math.min(...clip.steps.map((s) => s.position?.x ?? 0))
        const minY = Math.min(...clip.steps.map((s) => s.position?.y ?? 0))
        insertClones(clip.steps, clip.edges, at.x - minX, at.y - minY)
      } else {
        insertClones(clip.steps, clip.edges, PASTE_OFFSET, PASTE_OFFSET)
      }
    },
    [insertClones],
  )

  const handleSetDisabled = useCallback(
    (ids: Set<string>, disabled: boolean) => {
      if (!selectedSequenceId || ids.size === 0) return
      updateStepsForSequence(selectedSequenceId, (prev) =>
        prev.map((s) => (ids.has(s.id) ? { ...s, params: { ...s.params, disabled } } : s)),
      )
    },
    [selectedSequenceId, updateStepsForSequence],
  )

  const handleAlignSelected = useCallback(
    (mode: 'hcenter' | 'vcenter') => {
      if (!selectedSequenceId || selectedIds.size < 2) return
      const sel = steps.filter((s) => selectedIds.has(s.id))
      const xs = sel.map((s) => s.position?.x ?? 0)
      const ys = sel.map((s) => s.position?.y ?? 0)
      const cX = Math.round((Math.min(...xs) + Math.max(...xs)) / 2)
      const cY = Math.round((Math.min(...ys) + Math.max(...ys)) / 2)
      updateStepsForSequence(selectedSequenceId, (prev) =>
        prev.map((s) => {
          if (!selectedIds.has(s.id)) return s
          const p = s.position ?? { x: 0, y: 0 }
          return {
            ...s,
            position: mode === 'hcenter' ? { x: cX, y: p.y } : { x: p.x, y: cY },
          }
        }),
      )
    },
    [selectedSequenceId, selectedIds, steps, updateStepsForSequence],
  )

  const handleAutoLayout = useCallback(
    (direction: LayoutDirection) => {
      if (!selectedSequenceId || steps.length < 2) return
      const positions = computeAutoLayout(steps, edges, direction)
      setSequences((prev) =>
        prev.map((seq) => {
          if (seq.id !== selectedSequenceId) return seq
          const seqEdges = seq.edges ?? deriveLinearEdges(seq.steps)
          const orientedEdges = seqEdges.map((e) => ({
            ...e,
            sourceHandle: isRegularOutputHandle(e.sourceHandle)
              ? direction === 'TB'
                ? 'bottom'
                : 'out'
              : e.sourceHandle,
            targetHandle: direction === 'TB' ? 'top' : 'in',
          }))
          return {
            ...seq,
            steps: seq.steps.map((s) => {
              const pos = positions.get(s.id)
              return pos ? { ...s, position: pos } : s
            }),
            edges: orientedEdges,
          }
        }),
      )
      toast.success(`Auto-laid out ${steps.length} nodes (${direction === 'LR' ? 'Horizontal' : 'Vertical'})`)
    },
    [selectedSequenceId, steps, edges, setSequences],
  )

  const handleAutoLink = useCallback(() => {
    if (!selectedSequenceId) return
    const ordered = [...steps]
      .filter((s) => s.type !== 'COMMENT')
      .sort((a, b) => (a.position?.x ?? 0) - (b.position?.x ?? 0))
    updateEdgesForSequence(selectedSequenceId, () => deriveLinearEdges(ordered))
    toast.success('Nodes linked left-to-right')
  }, [selectedSequenceId, steps, updateEdgesForSequence])

  const handleClearLinks = useCallback(() => {
    if (!selectedSequenceId) return
    updateEdgesForSequence(selectedSequenceId, () => [])
    toast.success('All links cleared')
  }, [selectedSequenceId, updateEdgesForSequence])

  // --- Frame operations ---
  const handleAddFrame = useCallback(
    (at?: { x: number; y: number }) => {
      if (!selectedSequenceId) return
      const newFrame: AutomationFrame = {
        id: crypto.randomUUID(),
        name: `Group ${frames.length + 1}`,
        color: 'blue',
        x: at ? Math.round(at.x) : 60 + frames.length * 40,
        y: at ? Math.round(at.y) : 60 + frames.length * 40,
        width: 520,
        height: 280,
      }
      updateFramesForSequence(selectedSequenceId, (prev) => [...prev, newFrame])
      toast.success('Added visual group frame')
    },
    [selectedSequenceId, frames.length, updateFramesForSequence],
  )

  const handleCreateFrameFromSelected = useCallback(() => {
    if (!selectedSequenceId || selectedIds.size === 0) return
    const sel = steps.filter((s) => selectedIds.has(s.id))
    if (sel.length === 0) return
    const minX = Math.min(...sel.map((s) => s.position?.x ?? 0)) - 32
    const minY = Math.min(...sel.map((s) => s.position?.y ?? 0)) - 52
    const maxX = Math.max(...sel.map((s) => (s.position?.x ?? 0) + NODE_WIDTH)) + 32
    const maxY = Math.max(...sel.map((s) => (s.position?.y ?? 0) + NODE_HEIGHT)) + 32
    const newFrame: AutomationFrame = {
      id: crypto.randomUUID(),
      name: `Group ${frames.length + 1}`,
      color: 'blue',
      x: Math.round(minX),
      y: Math.round(minY),
      width: Math.max(300, Math.round(maxX - minX)),
      height: Math.max(180, Math.round(maxY - minY)),
    }
    updateFramesForSequence(selectedSequenceId, (prev) => [...prev, newFrame])
    toast.success(`Grouped ${sel.length} node${sel.length === 1 ? '' : 's'} into frame`)
  }, [selectedSequenceId, selectedIds, steps, frames.length, updateFramesForSequence])

  const handleUpdateFrame = useCallback(
    (frameId: string, updates: Partial<AutomationFrame>) => {
      if (!selectedSequenceId) return
      updateFramesForSequence(selectedSequenceId, (prev) =>
        prev.map((f) => (f.id === frameId ? { ...f, ...updates } : f)),
      )
    },
    [selectedSequenceId, updateFramesForSequence],
  )

  const handleDeleteFrame = useCallback(
    (frameId: string) => {
      if (!selectedSequenceId) return
      updateFramesForSequence(selectedSequenceId, (prev) => prev.filter((f) => f.id !== frameId))
    },
    [selectedSequenceId, updateFramesForSequence],
  )

  const handleMoveFrameWithNodes = useCallback(
    (frameId: string, newX: number, newY: number, dx: number, dy: number) => {
      if (!selectedSequenceId) return
      setSequences((prev) =>
        prev.map((seq) => {
          if (seq.id !== selectedSequenceId) return seq
          const origFrame = (seq.frames ?? []).find((f) => f.id === frameId)
          if (!origFrame) return seq
          const updatedFrames = (seq.frames ?? []).map((f) =>
            f.id === frameId ? { ...f, x: newX, y: newY } : f,
          )
          const updatedSteps = seq.steps.map((s) => {
            const p = s.position ?? { x: 0, y: 0 }
            const cx = p.x + NODE_WIDTH / 2
            const cy = p.y + NODE_HEIGHT / 2
            if (
              cx >= origFrame.x &&
              cx <= origFrame.x + origFrame.width &&
              cy >= origFrame.y &&
              cy <= origFrame.y + origFrame.height
            ) {
              return { ...s, position: { x: Math.round(p.x + dx), y: Math.round(p.y + dy) } }
            }
            return s
          })
          return { ...seq, frames: updatedFrames, steps: updatedSteps }
        }),
      )
    },
    [selectedSequenceId, setSequences],
  )

  // --- Sequence CRUD ---
  const handleAddSequence = () => {
    const newSeq: AutomationSequence = {
      id: crypto.randomUUID(),
      name: `Sequence ${sortedSeqs.length + 1}`,
      order: sortedSeqs.length,
      steps: [],
      edges: [],
      frames: [],
    }
    setSequences((prev) => normalizeSequences([...prev, newSeq]))
    setSelectedSequenceId(newSeq.id)
    setLeftTab('sequences')
  }

  const handleDeleteSequenceClick = (seqId: string) => {
    const seq = sortedSeqs.find((s) => s.id === seqId)
    if (seq) setDeleteConfirmSeq(seq)
  }

  const handleDeleteSequenceConfirm = () => {
    if (!deleteConfirmSeq) return
    const seqId = deleteConfirmSeq.id
    const normalized = normalizeSequences(sequences.filter((s) => s.id !== seqId))
    setSequences(normalized)
    setDeleteConfirmSeq(null)
    if (selectedSequenceId === seqId) {
      setSelectedSequenceId(normalized[0]?.id ?? null)
    }
    toast.success(`Deleted "${deleteConfirmSeq.name}"`)
  }

  const handleRenameSequence = (seqId: string, newName: string) => {
    const trimmed = newName.trim()
    if (!trimmed) return
    setSequences((prev) => prev.map((s) => (s.id === seqId ? { ...s, name: trimmed } : s)))
    setEditingSeqId(null)
  }

  const startRenameSequence = (seq: AutomationSequence) => {
    setEditingSeqId(seq.id)
    setEditingSeqName(seq.name)
  }

  const handleCloneSequence = (seqId: string) => {
    const seq = sortedSeqs.find((s) => s.id === seqId)
    if (!seq) return
    const idMap = new Map<string, string>()
    const clonedSteps: AutomationStep[] = seq.steps.map((s) => {
      const newId = crypto.randomUUID()
      idMap.set(s.id, newId)
      return { ...s, id: newId, position: s.position ? { ...s.position } : undefined }
    })
    const sourceEdges = seq.edges ?? deriveLinearEdges(seq.steps)
    const clonedEdges: AutomationEdge[] = sourceEdges
      .filter((e) => idMap.has(e.from) && idMap.has(e.to))
      .map((e) => ({
        id: crypto.randomUUID(),
        from: idMap.get(e.from)!,
        to: idMap.get(e.to)!,
        sourceHandle: e.sourceHandle,
        ...(e.targetHandle ? { targetHandle: e.targetHandle } : {}),
      }))
    const newSeq: AutomationSequence = {
      id: crypto.randomUUID(),
      name: `${seq.name} (copy)`,
      order: sortedSeqs.length,
      steps: clonedSteps,
      edges: clonedEdges,
      frames: (seq.frames ?? []).map((f) => ({ ...f, id: crypto.randomUUID() })),
    }
    setSequences((prev) => normalizeSequences([...prev, newSeq]))
    setSelectedSequenceId(newSeq.id)
  }

  const handleSequencesReorder = useCallback(
    (newOrder: AutomationSequence[]) => {
      setSequences(newOrder.map((s, i) => ({ ...s, order: i })))
    },
    [setSequences],
  )

  const handleReorderSequence = (seqId: string, direction: 'up' | 'down') => {
    const idx = sortedSeqs.findIndex((s) => s.id === seqId)
    if (idx < 0) return
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1
    if (swapIdx < 0 || swapIdx >= sortedSeqs.length) return
    const reordered = [...sortedSeqs]
    ;[reordered[idx], reordered[swapIdx]] = [reordered[swapIdx], reordered[idx]]
    setSequences(reordered.map((s, i) => ({ ...s, order: i })))
  }

  const handleConfigureNode = useCallback((stepId: string) => {
    setSelectedStepId(stepId)
    setConfigDialogOpen(true)
  }, [])

  // --- Execution Engine ---
  const executeStep = async (step: AutomationStep, signal: AbortSignal) => {
    if (signal.aborted) throw new Error('Aborted')

    switch (step.type) {
      case 'DELAY':
        addLog(`Waiting ${step.params.duration}ms...`)
        await new Promise<void>((resolve) => {
          const t = setTimeout(resolve, step.params.duration ?? 1000)
          signal.addEventListener('abort', () => { clearTimeout(t); resolve() }, { once: true })
        })
        break

      case 'OCR': {
        const targetHost = applyTemplate(step.params.ocrHost || '', runVarsRef.current).trim() || host
        if (!targetHost) throw new Error('Host not configured')
        const ocrMsg = applyTemplate(step.params.message || '', runVarsRef.current)
        const ocrSaveAs = (step.params.ocrSaveAs || '').trim()
        addLog(`Sending OCR message → ${targetHost}...`)
        await new Promise<void>((resolve, reject) => {
          ocrClient.sendMessage(
            targetHost,
            ocrMsg,
            (msg) => {
              runVarsRef.current.lastOcrResponse = msg
              if (ocrSaveAs) runVarsRef.current[ocrSaveAs] = msg
              addLog(`OCR Success: ${msg}`)
              resolve()
            },
            (err) => {
              addLog(`OCR Error: ${err}`)
              reject(new Error(err))
            },
          )
        })
        break
      }

      case 'CUSTOM_MESSAGE': {
        await executeTcpNode(step, runVarsRef.current, addLog, signal, host, customPort)
        break
      }

      case 'FIXED_TAG': {
        addLog(`Emulating Fixed Tag...`)
        if (step.params.fixedAutoConnect) {
          const alreadyConnected = await emulator.isConnected()
          if (!alreadyConnected) {
            const targetHost = applyTemplate(step.params.fixedHost || '', runVarsRef.current).trim() || host
            const portNum = parseInt(applyTemplate(step.params.fixedPort || '12352', runVarsRef.current).trim(), 10) || 12352
            if (!targetHost) throw new Error('Fixed auto-connect: host is empty')
            addLog(`Auto-connecting Fixed reader → ${targetHost}:${portNum}…`)
            await new Promise<void>((resolve, reject) => {
              void emulator.connect(
                targetHost,
                portNum,
                (msg) => { addLog(`Fixed connected: ${msg}`); resolve() },
                (err) => reject(new Error(err)),
              )
            })
          }
        }
        const fixedTags: TagData[] = []
        const stepAntennas = (step.params.antenna || '1').toString().split(',').filter(Boolean).map(Number)
        if (stepAntennas.length === 0) stepAntennas.push(1)
        const selectedUids = (step.params.uid || '').split(',').filter(Boolean)
        const targetUids = selectedUids.length > 0 ? selectedUids : ['']
        const vars = runVarsRef.current
        const upcList = applyTemplate(step.params.upcList || '', vars)
        const epcList = applyTemplate(step.params.epcList || '', vars)
        const singleUpc = applyTemplate(step.params.upc || '', vars)
        const singleEpc = applyTemplate(step.params.epc || '', vars)
        const startSerial = resolveStartSerial(step.params.startSerial, vars)
        const continuesAcrossLines = step.params.serialContinuesAcrossUpcLines !== false
        let upcEpcCount = 0
        const getTagRssi = makeRssiPicker(step.params)

        if (upcList) {
          const expanded = expandUpcListToEpcs(upcList, startSerial, continuesAcrossLines)
          upcEpcCount = expanded.length
          for (const { epc, customTid, userdata } of expanded) {
            for (const targetUid of targetUids) {
              for (const ant of stepAntennas) {
                fixedTags.push({
                  epc,
                  tid: customTid || step.params.tid || epc,
                  uid: targetUid,
                  antenna: ant,
                  rssi: getTagRssi(),
                  userdata,
                })
              }
            }
          }
        }
        if (epcList) {
          for (const line of epcList.split('\n')) {
            const parsed = parseEpcListLine(line)
            if (!parsed) continue
            for (const targetUid of targetUids) {
              for (const ant of stepAntennas) {
                fixedTags.push({
                  epc: parsed.epc,
                  tid: parsed.tid || step.params.tid || parsed.epc,
                  uid: targetUid,
                  antenna: ant,
                  rssi: getTagRssi(),
                  userdata: parsed.userdata,
                })
              }
            }
          }
        }
        if (fixedTags.length === 0 && (singleUpc || singleEpc)) {
          if (singleUpc) {
            const epcs = EPCGenerator.generateFromUpc(singleUpc, step.params.count || 1, startSerial)
            upcEpcCount = epcs.length
            for (const targetUid of targetUids) {
              for (const epc of epcs) {
                for (const ant of stepAntennas) {
                  fixedTags.push({ epc, tid: step.params.tid || epc, uid: targetUid, antenna: ant, rssi: getTagRssi() })
                }
              }
            }
          } else if (singleEpc) {
            for (const targetUid of targetUids) {
              for (const ant of stepAntennas) {
                fixedTags.push({ epc: singleEpc, tid: step.params.tid || singleEpc, uid: targetUid, antenna: ant, rssi: getTagRssi() })
              }
            }
          }
        }
        if (fixedTags.length === 0) throw new Error('No valid EPCs or UPCs specified')
        if (upcEpcCount > 0) advanceNextSerial(vars, startSerial, upcEpcCount, addLog)
        captureEpcsToVars(runVarsRef.current, fixedTags.map((t) => t.epc))
        addLog(`Captured ${runVarsRef.current.tagCount} unique EPC(s) → {{epcs}} (start serial ${startSerial})`)
        const tagDelayMs = parseInterTagDelayMs(step.params.tagDelay, delay)
        addLog(`Inter-tag delay ${tagDelayMs} ms`)
        await emulator.sendTags(
          fixedTags,
          step.params.driver || 'llrp',
          tagDelayMs,
          (msg) => addLog(`Fixed: ${msg}`),
          (msg) => addLog(`Fixed Complete: ${msg}`),
        )
        break
      }

      case 'HANDHELD_TAG': {
        addLog(`Emulating Handheld Tags...`)
        const getHhTagRssi = makeRssiPicker(step.params)
        const allHhTags: { epc: string; tid?: string; rssi?: string; userdata?: string }[] = []
        const vars = runVarsRef.current
        const upcList = applyTemplate(step.params.upcList || '', vars)
        const epcList = applyTemplate(step.params.epcList || '', vars)
        const startSerial = resolveStartSerial(step.params.startSerial, vars)
        const continuesAcrossLines = step.params.serialContinuesAcrossUpcLines !== false
        let upcEpcCount = 0

        if (upcList) {
          const expanded = expandUpcListToEpcs(upcList, startSerial, continuesAcrossLines)
          upcEpcCount = expanded.length
          allHhTags.push(
            ...expanded.map(({ epc, customTid, userdata }) => ({
              epc,
              tid: customTid || step.params.tid || epc,
              rssi: getHhTagRssi(),
              userdata,
            })),
          )
        }
        if (epcList) {
          for (const line of epcList.split('\n')) {
            const parsed = parseEpcListLine(line)
            if (!parsed) continue
            allHhTags.push({
              epc: parsed.epc,
              tid: parsed.tid || step.params.tid || parsed.epc,
              rssi: getHhTagRssi(),
              userdata: parsed.userdata,
            })
          }
        }
        if (allHhTags.length === 0) throw new Error('No EPCs specified')
        if (upcEpcCount > 0) advanceNextSerial(vars, startSerial, upcEpcCount, addLog)
        captureEpcsToVars(runVarsRef.current, allHhTags.map((t) => t.epc))
        addLog(`Captured ${runVarsRef.current.tagCount} unique EPC(s) → {{epcs}} (start serial ${startSerial})`)

        const hhPortStr = applyTemplate(step.params.handheldPort || '', vars).trim()
        const hhPort = hhPortStr ? parseInt(hhPortStr, 10) : handheldServer.getPort()
        if (!Number.isFinite(hhPort) || hhPort < 1 || hhPort > 65535) {
          throw new Error(`Invalid Handheld port: ${hhPortStr}`)
        }
        const hhClient = getHandheldClientForPort(hhPort)
        const hhRunning = await hhClient.isRunning()
        if (!hhRunning) {
          addLog(`Starting Handheld server on :${hhPort}...`)
          hhClient.start((msg) => addLog(msg), (err) => addLog(`HH Error: ${err}`))
          await new Promise((resolve) => setTimeout(resolve, 500))
        }
        const hhVerbose = getHandheldFullActivityLog()
        const hhDelayMs = parseInterTagDelayMs(step.params.tagDelay, handheldDelay)
        addLog(`Inter-tag delay ${hhDelayMs} ms (port :${hhPort})`)
        await hhClient.sendEpcs(
          allHhTags,
          hhDelayMs,
          (msg) => { if (hhVerbose) addLog(`HH: ${msg}`) },
          (msg) => addLog(`HH Complete: ${msg}`),
          hhVerbose,
        )
        break
      }

      case 'EDGE_BLOCK': {
        if (!edgeSession.edgeReady) throw new Error('Edge API not ready — connect to Edge IP first')
        const blockName = applyTemplate(step.params.edgeBlockName || '', runVarsRef.current).trim()
        if (!blockName) throw new Error('Edge block not configured')
        const raw = step.params.edgeParams ?? {}
        const order = step.params.edgeParamOrder?.filter((k) => k in raw) ?? Object.keys(raw)
        const invokeParams: Record<string, unknown> = {}
        for (const k of order) {
          const v = raw[k] ?? ''
          invokeParams[k] = typeof v === 'string' ? applyTemplate(v, runVarsRef.current) : v
        }
        for (const [k, v] of Object.entries(raw)) {
          if (k in invokeParams) continue
          invokeParams[k] = typeof v === 'string' ? applyTemplate(v, runVarsRef.current) : v
        }
        const paramOrder = order.length > 0 ? order : Object.keys(invokeParams)
        const paramPreview = Object.entries(invokeParams).map(([k, v]) => `${k}=${String(v ?? '')}`).join(', ')
        addLog(`Edge invoke → ${blockName}${paramPreview ? ` (${paramPreview})` : ''}`)
        const { status, response } = await edgeSession.invokeBlock(blockName, invokeParams, paramOrder)
        const preview = response?.trim() ? response.trim().slice(0, 300) + (response.length > 300 ? '…' : '') : '(empty)'
        addLog(`Edge block OK (HTTP ${status}): ${preview}`)
        break
      }

      case 'EDGE_PROCESS': {
        if (!edgeSession.edgeReady) throw new Error('Edge API not ready — connect to Edge IP first')
        const processName = step.params.edgeProcessName?.trim()
        if (!processName) throw new Error('Edge process not configured')
        const action = step.params.edgeProcessAction ?? 'start'
        addLog(`Edge ${action} → ${processName}`)
        if (action === 'stop') await edgeSession.stopProcess(processName)
        else await edgeSession.startProcess(processName)
        addLog(`Edge process ${action} OK: ${processName}`)
        break
      }

      case 'SET_VARIABLE': await executeSetVariable(step, runVarsRef.current, addLog); break
      case 'DB_QUERY': await executeDbQuery(step, runVarsRef.current, addLog); break
      case 'DB_EXEC': await executeDbExec(step, runVarsRef.current, addLog); break
      case 'RUN_SCRIPT': await executeRunScript(step, runVarsRef.current, addLog); break
      case 'HTTP_REQUEST': await executeHttpRequest(step, runVarsRef.current, addLog); break
      case 'CODE': await executeCode(step, runVarsRef.current, addLog); break
      case 'ASSERT': await executeAssert(step, runVarsRef.current, addLog); break
      case 'WAIT_UNTIL': await executeWaitUntil(step, runVarsRef.current, addLog, signal); break
      case 'STOP': await executeStop(step, runVarsRef.current, addLog); break
      case 'GENERATE': await executeGenerate(step, runVarsRef.current, addLog); break
      case 'TRANSFORM': await executeTransform(step, runVarsRef.current, addLog); break
      case 'COMMENT': await executeComment(step, runVarsRef.current, addLog); break
      case 'FILE_READ': await executeFileRead(step, runVarsRef.current, addLog); break
      case 'FILE_WRITE': await executeFileWrite(step, runVarsRef.current, addLog); break
      case 'FILE_LIST': await executeFileList(step, runVarsRef.current, addLog); break

      case 'NOTIFY': {
        const level = step.params.notifyLevel ?? 'info'
        const title = applyTemplate(step.params.notifyTitle || '', runVarsRef.current).trim()
        const message = applyTemplate(step.params.notifyMessage || '', runVarsRef.current)
        const opts = title ? { description: message } : undefined
        const text = title || message
        if (level === 'success') toast.success(text, opts)
        else if (level === 'warning') toast.warning(text, opts)
        else if (level === 'error') toast.error(text, opts)
        else toast(text, opts)
        addLog(`🔔 ${title ? `${title}: ` : ''}${message}`)
        break
      }

      case 'LOG': {
        const level = step.params.logLevel ?? 'info'
        const msg = applyTemplate(step.params.logMessage || '', runVarsRef.current)
        const prefix = level === 'error' ? '✖' : level === 'warn' ? '⚠' : 'ℹ'
        addLog(`${prefix} ${msg}`)
        if (level === 'error' && step.params.logAbort) {
          throw new Error(msg || 'Log node aborted the run')
        }
        break
      }

      case 'CONDITION':
      case 'SWITCH':
      case 'RANDOM':
      case 'CALL_SEQUENCE':
      case 'FOR_EACH':
      case 'LOOP_N':
        break
    }
  }

  const runNodeWithPolicy = async (
    step: AutomationStep,
    signal: AbortSignal,
    action: () => Promise<void>,
  ): Promise<string> => {
    const policy = resolveNodePolicy(step.params)
    let lastError: any = null
    for (let attempt = 1; attempt <= policy.maxTries; attempt++) {
      if (signal.aborted) throw new Error('Aborted')
      try {
        await action()
        if (attempt > 1) addLog(`✓ "${step.name}" succeeded on attempt ${attempt}/${policy.maxTries}`)
        return 'out'
      } catch (error: any) {
        if (error instanceof AutomationStopSignal || error?.message === 'Aborted') throw error
        lastError = error
        if (attempt < policy.maxTries) {
          addLog(`↻ "${step.name}" failed (attempt ${attempt}/${policy.maxTries}): ${error.message} — retrying in ${policy.retryWaitMs}ms`)
          await new Promise<void>((resolve) => {
            const t = setTimeout(resolve, policy.retryWaitMs)
            signal.addEventListener('abort', () => { clearTimeout(t); resolve() }, { once: true })
          })
        }
      }
    }
    const msg = String(lastError?.message ?? lastError ?? 'Unknown error')
    runVarsRef.current.lastError = msg
    runVarsRef.current.lastErrorNode = step.name
    if (policy.onError === 'stop') {
      addLog(`Error at "${step.name}": ${msg}`)
      throw lastError
    }
    if (policy.onError === 'errorOutput') {
      addLog(`⚠ "${step.name}" failed: ${msg} → error output`)
      return ERROR_HANDLE
    }
    addLog(`⚠ "${step.name}" failed: ${msg} → continuing`)
    return 'out'
  }

  const runSequenceGraph = async (
    seq: AutomationSequence,
    signal: AbortSignal,
    callStack: Set<string> = new Set(),
    partial?: { startStepId: string; singleNode?: boolean },
  ) => {
    const seqSteps = seq.steps
    if (seqSteps.length === 0) return
    if (callStack.has(seq.id)) {
      addLog(`Skipped recursive call to "${seq.name}"`)
      return
    }
    const stack = new Set(callStack).add(seq.id)
    if (stack.size > MAX_CALL_DEPTH) {
      addLog(`Stopped: sequence call nesting exceeded ${MAX_CALL_DEPTH}`)
      return
    }

    const seqEdges = seq.edges ?? deriveLinearEdges(seqSteps)
    const byId = new Map(seqSteps.map((s) => [s.id, s]))
    const hasIncoming = new Set(seqEdges.filter((e) => e.from !== e.to).map((e) => e.to))
    const roots = seqSteps
      .filter((s) => s.type !== 'COMMENT' && !hasIncoming.has(s.id))
      .sort((a, b) => (a.position?.x ?? 0) - (b.position?.x ?? 0))
    const partialStart = partial ? byId.get(partial.startStepId) : undefined
    const startNodes = partialStart ? [partialStart] : roots.length > 0 ? roots : [seqSteps[0]]

    for (const root of startNodes) {
      if (signal.aborted) break
      let current: AutomationStep | null = root
      let guard = 0
      while (current && !signal.aborted) {
        if (++guard > MAX_GRAPH_STEPS) {
          addLog(`Stopped: exceeded ${MAX_GRAPH_STEPS} steps (possible infinite loop)`)
          break
        }
        if (partial?.singleNode && guard > 1) break
        runStepCountRef.current++
        setLiveStepsRun(runStepCountRef.current)
        setCurrentRunningStepId(current.id)

        if (current.params.disabled) {
          setNodeRunState(current.id, { state: 'skipped', durationMs: 0 })
          addLog(`⃠ Skipped disabled node "${current.name}"`)
          const passEdge = seqEdges.find((e) => e.from === current!.id && e.to !== current!.id)
          current = passEdge ? byId.get(passEdge.to) ?? null : null
          continue
        }

        const t0 = performance.now()
        setNodeRunState(current.id, { state: 'running', incrementCount: true })

        let handle = 'out'
        try {
          if (current.type === 'CONDITION') {
            const pass = evaluateCondition(current.params, runVarsRef.current)
            addLog(`◇ ${current.name}: ${pass ? 'TRUE' : 'FALSE'} → ${pass ? 'true' : 'false'} branch`)
            handle = pass ? 'true' : 'false'
            setNodeRunState(current.id, { state: 'success', durationMs: performance.now() - t0 })
          } else if (current.type === 'SWITCH') {
            handle = switchHandle(current.params, runVarsRef.current)
            const val = applyTemplate(current.params.switchValue || '', runVarsRef.current)
            const label =
              handle === 'default'
                ? 'default'
                : (() => {
                    const idx = parseInt(handle.slice('case-'.length), 10)
                    const c = current.params.switchCases?.[idx]
                    return c?.label?.trim() || c?.value || handle
                  })()
            addLog(`⌥ ${current.name}: "${val}" → ${label}`)
            setNodeRunState(current.id, { state: 'success', durationMs: performance.now() - t0 })
          } else if (current.type === 'RANDOM') {
            const branches = current.params.randomBranches ?? []
            const weights = branches.map((b) => b.weight ?? 1)
            const idx = branches.length > 0 ? pickWeightedIndex(weights, Math.random()) : 0
            handle = `branch-${idx}`
            const label = branches[idx]?.label?.trim() || `branch ${idx + 1}`
            const saveAs = (current.params.randomSaveAs || '').trim()
            if (saveAs) runVarsRef.current[saveAs] = String(idx)
            addLog(`🎲 ${current.name}: → ${label}`)
            setNodeRunState(current.id, { state: 'success', durationMs: performance.now() - t0 })
          } else {
            const node: AutomationStep = current
            let action: () => Promise<void>
            if (node.type === 'CALL_SEQUENCE') {
              action = async () => {
                const target = sortedSeqs.find((s) => s.id === node.params.callSequenceId)
                if (!target) throw new Error('Call Sequence: no target selected (or it was deleted)')
                addLog(`↳ Call "${target.name}"`)
                await runSequenceGraph(target, signal, stack)
                if (signal.aborted) return
                addLog(`↩ Return from "${target.name}"`)
              }
            } else if (node.type === 'FOR_EACH') {
              action = async () => {
                const source = applyTemplate(node.params.forEachSource || '', runVarsRef.current)
                const items = parseListItems(source)
                const itemAs = (node.params.forEachItemAs || 'item').trim() || 'item'
                const indexAs = (node.params.forEachIndexAs || 'index').trim() || 'index'
                const max = Math.max(1, node.params.forEachMax ?? 500)
                const target = sortedSeqs.find((s) => s.id === node.params.forEachSequenceId)
                if (!target) throw new Error('For Each: no target sequence selected (or it was deleted)')
                if (items.length === 0) {
                  addLog(`For Each: empty list — skipped`)
                  return
                }
                const slice = items.slice(0, max)
                if (items.length > max) addLog(`For Each: capped at ${max} of ${items.length} items`)
                addLog(`For Each: ${slice.length} item(s) → "${target.name}"`)
                for (let i = 0; i < slice.length; i++) {
                  if (signal.aborted) return
                  runVarsRef.current[itemAs] = slice[i]!
                  runVarsRef.current[indexAs] = String(i)
                  publishRunVars()
                  addLog(`  [${i + 1}/${slice.length}] ${itemAs}=${slice[i]}`)
                  await runSequenceGraph(target, signal, stack)
                }
                addLog(`↩ For Each done`)
              }
            } else if (node.type === 'LOOP_N') {
              action = async () => {
                const rawCount = applyTemplate(node.params.loopCount || '', runVarsRef.current).trim()
                const parsed = Math.floor(Number(rawCount))
                const requested = Number.isFinite(parsed) ? parsed : 0
                const cap = Math.max(1, node.params.loopMax ?? 1000)
                const count = Math.min(Math.max(0, requested), cap)
                const indexAs = (node.params.loopIndexAs || 'i').trim() || 'i'
                const target = sortedSeqs.find((s) => s.id === node.params.loopSequenceId)
                if (!target) throw new Error('Loop N: no target sequence selected (or it was deleted)')
                if (count <= 0) {
                  addLog(`Loop N: count is ${requested} — skipped`)
                  return
                }
                if (requested > cap) addLog(`Loop N: capped at ${cap} of ${requested} iterations`)
                addLog(`Loop N: ${count}× → "${target.name}"`)
                for (let i = 0; i < count; i++) {
                  if (signal.aborted) return
                  runVarsRef.current[indexAs] = String(i + 1)
                  publishRunVars()
                  addLog(`  [${i + 1}/${count}]`)
                  await runSequenceGraph(target, signal, stack)
                }
                addLog(`↩ Loop N done`)
              }
            } else {
              action = () => executeStep(node, signal)
            }

            handle = await runNodeWithPolicy(node, signal, action)
            setNodeRunState(node.id, {
              state: handle === ERROR_HANDLE ? 'error' : 'success',
              durationMs: performance.now() - t0,
              lastError: handle === ERROR_HANDLE ? runVarsRef.current.lastError : undefined,
            })
          }
        } catch (error: any) {
          if (error instanceof AutomationStopSignal) {
            setNodeRunState(current.id, { state: 'success', durationMs: performance.now() - t0 })
            if (error.scope === 'run') throw error
            return
          }
          if (error.message === 'Aborted') {
            setNodeRunState(current.id, { state: 'skipped', durationMs: performance.now() - t0 })
            return
          }
          setNodeRunState(current.id, {
            state: 'error',
            durationMs: performance.now() - t0,
            lastError: String(error?.message ?? error),
          })
          throw error
        }

        publishRunVars()
        const nextEdge = findNextEdge(seqEdges, current!.id, handle)
        current = nextEdge ? byId.get(nextEdge.to) ?? null : null
      }
    }
  }

  const resolveTopLevelSequences = useCallback((all: AutomationSequence[]): AutomationSequence[] => {
    const calledIds = new Set<string>()
    for (const s of all) {
      for (const st of s.steps) {
        if (st.type === 'CALL_SEQUENCE' && st.params.callSequenceId) calledIds.add(st.params.callSequenceId)
        if (st.type === 'FOR_EACH' && st.params.forEachSequenceId) calledIds.add(st.params.forEachSequenceId)
        if (st.type === 'LOOP_N' && st.params.loopSequenceId) calledIds.add(st.params.loopSequenceId)
      }
    }
    const topLevelSeqs = all.filter((s) => !calledIds.has(s.id))
    return topLevelSeqs.length > 0 ? topLevelSeqs : all
  }, [])

  type RunOptions = {
    onlyIds?: string[]
    startStepId?: string
    singleNode?: boolean
    initialVars?: Record<string, string>
  }

  const handleRun = async (onlyIds?: string[], options: Omit<RunOptions, 'onlyIds'> = {}) => {
    if (runMode === 'parallel' && !onlyIds && !options.startStepId) {
      let seqs: AutomationSequence[]
      if (sequenceRunScope === 'current') {
        seqs = selectedSequenceId ? [sortedSeqs.find((s) => s.id === selectedSequenceId)!].filter(Boolean) : []
      } else if (sequenceRunScope === 'selected') {
        seqs = sortedSeqs.filter((s) => checkedSequenceIds.has(s.id))
      } else {
        seqs = resolveTopLevelSequences(sortedSeqs)
      }
      if (seqs.length === 0) { toast.error('No sequences to run'); return }
      for (const seq of seqs) {
        void handleRunParallel(seq.id)
      }
      return
    }
    const previous = runPromiseRef.current
    if (previous) {
      handleStop()
      try { await previous } catch { /* previous run already logged */ }
    }
    const run = executeRun({ onlyIds, ...options })
    runPromiseRef.current = run
    try {
      await run
    } finally {
      if (runPromiseRef.current === run) runPromiseRef.current = null
    }
  }

  const handleRunParallel = async (seqId: string) => {
    const existing = parallelRunnersRef.current.get(seqId)
    if (existing) {
      existing.abort()
      parallelRunnersRef.current.delete(seqId)
      setRunningSeqIds((prev) => { const n = new Set(prev); n.delete(seqId); return n })
    }
    const seq = sortedSeqs.find((s) => s.id === seqId)
    if (!seq || seq.steps.length === 0) {
      toast.error(`"${seq?.name ?? seqId}" has no nodes to run`)
      return
    }

    const controller = new AbortController()
    const signal = controller.signal
    parallelRunnersRef.current.set(seqId, controller)
    setRunningSeqIds((prev) => new Set([...prev, seqId]))
    setIsRunning(true)
    setRunStartedAt((prev) => prev ?? Date.now())

    const loops =
      runMode === 'parallel'
        ? Infinity
        : loopCount === 'Inf'
          ? Infinity
          : loopCount === 'custom'
            ? Math.max(1, parseInt(customLoopCount) || 1)
            : parseInt(loopCount) || 1

    const seqVarsRef = { current: { ...createRunContext({ host, alePort, customPort, port: '' }) } as AutomationVars }
    const prefixedLog = (msg: string) => {
      const prefix = parallelRunnersRef.current.size > 1 ? `[${seq.name}] ` : ''
      addLog(`${prefix}${msg}`)
    }

    const execution: ExecutionRecord = {
      id: crypto.randomUUID(),
      startedAt: Date.now(),
      status: 'running',
      scope: `sequence "${seq.name}" (parallel)`,
      stepsRun: 0,
      log: [],
      logTruncated: false,
    }
    setExecutions((prev) => pushExecution(prev, execution))
    prefixedLog(`Starting parallel loop for "${seq.name}" (${loops === Infinity ? '∞' : loops} iteration${loops === 1 ? '' : 's'})…`)

    let loopNum = 0
    let status: ExecutionStatus = 'success'
    let errorMessage: string | undefined
    let stepsRun = 0

    const runSeqGraphIsolated = async (s: AutomationSequence, sig: AbortSignal, callStack: Set<string> = new Set()): Promise<void> => {
      const sSteps = s.steps
      if (sSteps.length === 0) return
      if (callStack.has(s.id)) { prefixedLog(`Skipped recursive call to "${s.name}"`); return }
      const stack = new Set(callStack).add(s.id)
      if (stack.size > MAX_CALL_DEPTH) { prefixedLog(`Stopped: call nesting exceeded ${MAX_CALL_DEPTH}`); return }
      const seqEdges = s.edges ?? deriveLinearEdges(sSteps)
      const byId = new Map(sSteps.map((st) => [st.id, st]))
      const hasIncoming = new Set(seqEdges.filter((e) => e.from !== e.to).map((e) => e.to))
      const roots = sSteps.filter((st) => st.type !== 'COMMENT' && !hasIncoming.has(st.id)).sort((a, b) => (a.position?.x ?? 0) - (b.position?.x ?? 0))
      const startNodes = roots.length > 0 ? roots : [sSteps[0]]

      for (const root of startNodes) {
        if (sig.aborted) break
        let current: AutomationStep | null = root
        let guard = 0
        while (current && !sig.aborted) {
          if (++guard > MAX_GRAPH_STEPS) { prefixedLog(`Stopped: exceeded ${MAX_GRAPH_STEPS} steps`); break }
          stepsRun++
          setCurrentRunningStepId(current.id)
          if (current.params.disabled) {
            setNodeRunState(current.id, { state: 'skipped', durationMs: 0 })
            prefixedLog(`⃠ Skipped disabled node "${current.name}"`)
            const passEdge = seqEdges.find((e) => e.from === current!.id && e.to !== current!.id)
            current = passEdge ? byId.get(passEdge.to) ?? null : null
            continue
          }
          const t0 = performance.now()
          setNodeRunState(current.id, { state: 'running', incrementCount: true })
          let handle = 'out'
          const node = current
          if (node.type === 'CONDITION') {
            const pass = evaluateCondition(node.params, seqVarsRef.current)
            prefixedLog(`◇ ${node.name}: ${pass ? 'TRUE' : 'FALSE'}`)
            handle = pass ? 'true' : 'false'
            setNodeRunState(node.id, { state: 'success', durationMs: performance.now() - t0 })
          } else if (node.type === 'SWITCH') {
            handle = switchHandle(node.params, seqVarsRef.current)
            setNodeRunState(node.id, { state: 'success', durationMs: performance.now() - t0 })
          } else if (node.type === 'RANDOM') {
            const branches = node.params.randomBranches ?? []
            const idx = branches.length > 0 ? pickWeightedIndex(branches.map((b) => b.weight ?? 1), Math.random()) : 0
            handle = `branch-${idx}`
            setNodeRunState(node.id, { state: 'success', durationMs: performance.now() - t0 })
          } else {
            const savedVarsRef = runVarsRef.current
            runVarsRef.current = seqVarsRef.current
            let action: () => Promise<void>
            if (node.type === 'CALL_SEQUENCE') {
              action = async () => {
                const target = sequencesRef.current.find((st) => st.id === node.params.callSequenceId) ?? sortedSeqs.find((st) => st.id === node.params.callSequenceId)
                if (!target) throw new Error('Call Sequence: no target selected')
                await runSeqGraphIsolated(target, sig, stack)
              }
            } else if (node.type === 'FOR_EACH') {
              action = async () => {
                const source = applyTemplate(node.params.forEachSource || '', seqVarsRef.current)
                const items = parseListItems(source)
                const itemAs = (node.params.forEachItemAs || 'item').trim() || 'item'
                const indexAs = (node.params.forEachIndexAs || 'index').trim() || 'index'
                const max = Math.max(1, node.params.forEachMax ?? 500)
                const target = sequencesRef.current.find((st) => st.id === node.params.forEachSequenceId) ?? sortedSeqs.find((st) => st.id === node.params.forEachSequenceId)
                if (!target) throw new Error('For Each: no target sequence selected')
                const slice = items.slice(0, max)
                for (let i = 0; i < slice.length; i++) {
                  if (sig.aborted) return
                  seqVarsRef.current[itemAs] = slice[i]!
                  seqVarsRef.current[indexAs] = String(i)
                  await runSeqGraphIsolated(target, sig, stack)
                }
              }
            } else if (node.type === 'LOOP_N') {
              action = async () => {
                const rawCount = applyTemplate(node.params.loopCount || '', seqVarsRef.current).trim()
                const count = Math.min(Math.max(0, Math.floor(Number(rawCount)) || 0), Math.max(1, node.params.loopMax ?? 1000))
                const indexAs = (node.params.loopIndexAs || 'i').trim() || 'i'
                const target = sequencesRef.current.find((st) => st.id === node.params.loopSequenceId) ?? sortedSeqs.find((st) => st.id === node.params.loopSequenceId)
                if (!target) throw new Error('Loop N: no target sequence selected')
                for (let i = 0; i < count; i++) {
                  if (sig.aborted) return
                  seqVarsRef.current[indexAs] = String(i + 1)
                  await runSeqGraphIsolated(target, sig, stack)
                }
              }
            } else {
              action = () => executeStep(node, sig)
            }
            try {
              handle = await runNodeWithPolicy(node, sig, action)
              setNodeRunState(node.id, { state: handle === ERROR_HANDLE ? 'error' : 'success', durationMs: performance.now() - t0 })
            } catch (err: any) {
              runVarsRef.current = savedVarsRef
              if (err instanceof AutomationStopSignal) {
                setNodeRunState(node.id, { state: 'success', durationMs: performance.now() - t0 })
                if (err.scope === 'run') throw err
                break
              }
              if (err.message === 'Aborted') {
                setNodeRunState(node.id, { state: 'skipped', durationMs: performance.now() - t0 })
                return
              }
              setNodeRunState(node.id, { state: 'error', durationMs: performance.now() - t0, lastError: String(err?.message ?? err) })
              throw err
            }
            seqVarsRef.current = runVarsRef.current
            runVarsRef.current = savedVarsRef
          }
          const nextEdge = findNextEdge(seqEdges, current!.id, handle)
          current = nextEdge ? byId.get(nextEdge.to) ?? null : null
        }
      }
    }

    try {
      for (let i = 0; i < loops; i++) {
        if (signal.aborted) break
        loopNum++
        if (loops > 1 || loops === Infinity) prefixedLog(`--- Loop ${loopNum}${loops === Infinity ? '/∞' : `/${loops}`} ---`)
        const latestSeq = sequencesRef.current.find((st) => st.id === seqId) ?? seq
        await runSeqGraphIsolated(latestSeq, signal)
      }
      if (signal.aborted) { status = 'stopped'; prefixedLog(`"${seq.name}" stopped`) }
      else prefixedLog(`"${seq.name}" completed`)
    } catch (err: any) {
      if (err instanceof AutomationStopSignal) {
        prefixedLog(`"${seq.name}" stopped by Stop node`)
      } else if (err.message !== 'Aborted') {
        status = 'error'
        errorMessage = String(err.message ?? err)
        prefixedLog(`"${seq.name}" failed: ${err.message}`)
        toast.error(`Parallel run failed: ${seq.name}`)
      } else {
        status = 'stopped'
        prefixedLog(`"${seq.name}" stopped`)
      }
    } finally {
      flushLogQueue()
      const snap = snapshotLog(runLogRef.current)
      setExecutions((prev) =>
        updateExecution(prev, execution.id, { status, finishedAt: Date.now(), stepsRun, error: errorMessage, ...snap }),
      )
      parallelRunnersRef.current.delete(seqId)
      setRunningSeqIds((prev) => { const n = new Set(prev); n.delete(seqId); return n })
      if (parallelRunnersRef.current.size === 0) {
        setIsRunning(false)
        setCurrentRunningStepId(null)
        setRunningSeqId(null)
        setRunStartedAt(null)
      }
    }
  }

  const executeRun = async ({ onlyIds, startStepId, singleNode, initialVars }: RunOptions) => {
    let runnableSeqs: AutomationSequence[]
    if (onlyIds && onlyIds.length > 0) {
      const idSet = new Set(onlyIds)
      runnableSeqs = sortedSeqs.filter((s) => idSet.has(s.id))
    } else if (sequenceRunScope === 'current') {
      if (!selectedSequenceId) { toast.error('Select a sequence first'); return }
      runnableSeqs = sortedSeqs.filter((s) => s.id === selectedSequenceId)
    } else if (sequenceRunScope === 'selected') {
      if (checkedSequenceIds.size === 0) { toast.error('Check one or more sequences to run'); return }
      runnableSeqs = sortedSeqs.filter((s) => checkedSequenceIds.has(s.id))
    } else {
      runnableSeqs = resolveTopLevelSequences(sortedSeqs)
    }

    const stepsToRun = runnableSeqs.flatMap((s) => s.steps)
    if (runnableSeqs.length === 0) { toast.error('No sequences to run'); return }
    if (stepsToRun.length === 0) { toast.error('Add steps to the selected sequences first'); return }

    const partialStep = startStepId ? runnableSeqs.flatMap((s) => s.steps).find((st) => st.id === startStepId) : undefined
    const partial = partialStep ? { startStepId: partialStep.id, singleNode } : undefined

    const scopeLabel = partialStep
      ? `${singleNode ? 'node' : 'from node'} "${partialStep.name}" in "${runnableSeqs[0]?.name ?? ''}"`
      : onlyIds
        ? onlyIds.length === 1
          ? `sequence "${runnableSeqs[0]?.name ?? onlyIds[0]}"`
          : `${onlyIds.length} sequences`
        : sequenceRunScope === 'current'
          ? `current sequence "${runnableSeqs[0]?.name ?? ''}"`
          : sequenceRunScope === 'selected'
            ? `${runnableSeqs.length} selected sequence${runnableSeqs.length === 1 ? '' : 's'}`
            : `${runnableSeqs.length} top-level sequence${runnableSeqs.length === 1 ? '' : 's'}`

    setIsRunning(true)
    setRunStartedAt(Date.now())
    setRunElapsedMs(0)
    setLiveStepsRun(0)
    if (!partial) setNodeTelemetry({})
    if (logFlushTimerRef.current) {
      clearTimeout(logFlushTimerRef.current)
      logFlushTimerRef.current = undefined
    }
    logQueueRef.current = []
    runLogRef.current = []
    runStepCountRef.current = 0
    setLog([])
    addLog(`Starting automation (${scopeLabel})...`)

    if (!partial) {
      runVarsRef.current = {
        ...createRunContext({ host, alePort, customPort, port: '' }),
        ...(initialVars ?? {}),
      }
    } else {
      runVarsRef.current = {
        ...runVarsRef.current,
        ...createRunContext({ host, alePort, customPort, port: '' }),
        ...(initialVars ?? {}),
      }
    }
    publishRunVars(true)

    const execution: ExecutionRecord = {
      id: crypto.randomUUID(),
      startedAt: Date.now(),
      status: 'running',
      scope: scopeLabel,
      startedFrom: partialStep?.name,
      stepsRun: 0,
      log: [],
      logTruncated: false,
    }
    setExecutions((prev) => pushExecution(prev, execution))

    abortControllerRef.current = new AbortController()
    const signal = abortControllerRef.current.signal

    const useDuration = !partial && runMode === 'duration'
    const durationSec = Math.max(1, parseInt(runDurationSeconds) || 300)
    const endTime = useDuration ? Date.now() + durationSec * 1000 : 0

    const loops = partial
      ? 1
      : useDuration
        ? Infinity
        : loopCount === 'Inf'
          ? Infinity
          : loopCount === 'custom'
            ? Math.max(1, parseInt(customLoopCount) || 1)
            : parseInt(loopCount) || 1
    let loopNum = 0
    let status: ExecutionStatus = 'success'
    let errorMessage: string | undefined

    try {
      for (let i = 0; i < loops; i++) {
        if (signal.aborted) break
        if (useDuration && Date.now() >= endTime) {
          addLog(`Duration (${durationSec}s) reached. Stopping.`)
          break
        }
        loopNum++
        if (loops > 1 || useDuration) {
          addLog(`--- Loop ${loopNum}${useDuration ? ` (${Math.max(0, Math.ceil((endTime - Date.now()) / 1000))}s left)` : `/${loops === Infinity ? '∞' : loops}`} ---`)
        }
        for (let seqIdx = 0; seqIdx < runnableSeqs.length; seqIdx++) {
          if (signal.aborted) break
          const seq = runnableSeqs[seqIdx]
          if (seq.steps.length === 0) continue
          addLog(`▶ Sequence ${seqIdx + 1}: ${seq.name}`)
          setRunningSeqId(seq.id)
          await runSequenceGraph(seq, signal, undefined, partial)
        }
      }
      if (signal.aborted) { status = 'stopped'; addLog('Automation stopped by user') }
      else addLog('Automation completed successfully')
    } catch (error: any) {
      if (error instanceof AutomationStopSignal) {
        addLog(`Automation stopped by Stop node (${error.scope === 'run' ? 'end run' : 'end sequence'})`)
      } else if (error.message !== 'Aborted') {
        status = 'error'
        errorMessage = String(error.message ?? error)
        addLog(`Automation failed: ${error.message}`)
        toast.error('Automation failed')
      } else {
        status = 'stopped'
        addLog('Automation stopped by user')
      }
    } finally {
      flushLogQueue()
      publishRunVars(true)
      const snap = snapshotLog(runLogRef.current)
      setExecutions((prev) =>
        updateExecution(prev, execution.id, {
          status,
          finishedAt: Date.now(),
          stepsRun: runStepCountRef.current,
          error: errorMessage,
          ...snap,
        }),
      )
      setIsRunning(false)
      setRunStartedAt(null)
      setCurrentRunningStepId(null)
      setRunningSeqId(null)
      abortControllerRef.current = null
    }
  }

  const handleRunFromNode = useCallback(
    (stepId: string, singleNode: boolean) => {
      if (!selectedSequenceId) return
      void handleRun([selectedSequenceId], { startStepId: stepId, singleNode })
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedSequenceId, sortedSeqs, host, alePort, customPort],
  )

  const toggleSequenceChecked = (seqId: string) => {
    setCheckedSequenceIds((prev) => {
      const next = new Set(prev)
      if (next.has(seqId)) next.delete(seqId)
      else next.add(seqId)
      return next
    })
  }

  const handleStop = () => {
    if (abortControllerRef.current) abortControllerRef.current.abort()
    for (const ctrl of parallelRunnersRef.current.values()) ctrl.abort()
    emulator.cancelSend()
    handheldServer.cancelSend()
    for (const client of handheldClientsByPortRef.current.values()) client.cancelSend()
  }

  const handleStopSequence = (seqId: string) => {
    const ctrl = parallelRunnersRef.current.get(seqId)
    if (ctrl) {
      ctrl.abort()
      emulator.cancelSend()
      handheldServer.cancelSend()
      for (const client of handheldClientsByPortRef.current.values()) client.cancelSend()
    } else if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      emulator.cancelSend()
      handheldServer.cancelSend()
      for (const client of handheldClientsByPortRef.current.values()) client.cancelSend()
    }
  }

  // --- Event-Driven Triggers Execution (Webhook, File Watcher, Interval) ---
  useEffect(() => {
    const hasActiveWebhook = triggers.some((t) => t.type === 'webhook' && t.enabled)
    const api = window.electronAPI
    if (!api?.automationWebhookStart) return
    if (hasActiveWebhook) {
      const activePort = triggers.find((t) => t.type === 'webhook' && t.enabled)?.webhookPort || 8989
      void api.automationWebhookStart(activePort).then((res) => {
        if (!res.ok) console.warn('Automation webhook server failed to start:', res.error)
      })
    }
    const unsubscribe = api.onAutomationWebhookReceived?.((payload) => {
      for (const t of triggersRef.current) {
        if (t.type !== 'webhook' || !t.enabled) continue
        if (t.webhookMethod && t.webhookMethod !== 'ANY' && t.webhookMethod.toUpperCase() !== payload.method.toUpperCase()) continue
        if (t.webhookPath?.trim()) {
          const targetPath = t.webhookPath.trim().startsWith('/') ? t.webhookPath.trim() : `/${t.webhookPath.trim()}`
          if (payload.path !== targetPath) continue
        }
        const initialVars: Record<string, string> = {
          trigger_type: 'webhook',
          trigger_name: t.name,
          webhook_method: payload.method,
          webhook_path: payload.path,
          webhook_raw: payload.rawBody,
        }
        if (payload.body && typeof payload.body === 'object') {
          for (const [k, v] of Object.entries(payload.body)) {
            if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
              initialVars[`webhook_${k}`] = String(v)
              initialVars[`body_${k}`] = String(v)
            }
          }
        }
        addLog(`⚡ Webhook trigger "${t.name}" matched ${payload.method} ${payload.path}`)
        void handleRun([t.targetSequenceId], { initialVars })
      }
    })
    return () => { unsubscribe?.() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [triggers, addLog, sortedSeqs])

  useEffect(() => {
    const api = window.electronAPI
    if (!api?.automationFileWatchStart) return
    const activeWatchers = triggers.filter((t) => t.type === 'file_watcher' && t.enabled && t.watcherPath)
    for (const t of activeWatchers) {
      void api.automationFileWatchStart(t.id, t.watcherPath!, t.watcherPattern)
    }
    const unsubscribe = api.onAutomationFileWatchEvent?.((event) => {
      for (const t of triggersRef.current) {
        if (t.type !== 'file_watcher' || !t.enabled) continue
        if (t.id !== event.watchId && t.watcherPath !== event.dirPath) continue
        if (t.watchEvents && t.watchEvents !== 'all') {
          if (t.watchEvents === 'change' && event.eventType !== 'change') continue
          if (t.watchEvents === 'add' && event.eventType !== 'add' && event.eventType !== 'rename') continue
          if (t.watchEvents === 'unlink' && event.eventType !== 'unlink') continue
        }
        const initialVars: Record<string, string> = {
          trigger_type: 'file_watcher',
          trigger_name: t.name,
          watch_event: event.eventType,
          watch_file: event.filename,
          watch_dir: event.dirPath,
          watch_path: event.fullPath,
          watch_size: String(event.size),
        }
        addLog(`⚡ File watch trigger "${t.name}" detected ${event.eventType} on ${event.filename}`)
        void handleRun([t.targetSequenceId], { initialVars })
      }
    })
    return () => {
      unsubscribe?.()
      for (const t of activeWatchers) void api.automationFileWatchStop?.(t.id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [triggers, addLog, sortedSeqs])

  useEffect(() => {
    const activeIntervals = triggers.filter((t) => t.type === 'interval' && t.enabled && (t.intervalSeconds || 60) > 0)
    if (activeIntervals.length === 0) return
    const timers: ReturnType<typeof setInterval>[] = []
    for (const t of activeIntervals) {
      const ms = Math.max(5, t.intervalSeconds || 60) * 1000
      const timer = setInterval(() => {
        const initialVars: Record<string, string> = {
          trigger_type: 'interval',
          trigger_name: t.name,
          trigger_interval: String(t.intervalSeconds || 60),
        }
        addLog(`⚡ Interval trigger "${t.name}" fired (${t.intervalSeconds || 60}s)`)
        void handleRun([t.targetSequenceId], { initialVars })
      }, ms)
      timers.push(timer)
    }
    return () => timers.forEach(clearInterval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [triggers, addLog, sortedSeqs])

  // --- Import / Export / Demo / Templates ---
  const handleExportWorkflow = () => {
    const payload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      sequences: sortedSeqs.map((s) => ({
        ...s,
        steps: s.steps.map((st) => ({ ...st, position: st.position ?? { x: 0, y: 0 } })),
      })),
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `rfid-automation-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
    toast.success('Workflow exported')
  }

  const handleImportWorkflow = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const normalized = parseWorkflowSequences(JSON.parse(reader.result as string))
        if (!normalized) { toast.error('Invalid workflow file format'); return }
        setSequences((prev) => normalizeSequences([...prev, ...normalized]))
        setSelectedSequenceId(normalized[0]?.id ?? null)
        toast.success(`Imported ${normalized.length} sequence(s)`)
      } catch {
        toast.error('Failed to parse workflow file')
      }
    }
    reader.readAsText(file, 'UTF-8')
  }

  const handleLoadDemo = () => {
    const normalized = parseWorkflowSequences(DEMO_WORKFLOW)
    if (!normalized) return
    setSequences((prev) => normalizeSequences([...prev, ...normalized]))
    setSelectedSequenceId(normalized[0]?.id ?? null)
    setLeftTab('sequences')
    toast.success(`Loaded ${normalized.length} demo sequence(s)`)
  }

  const handleInsertTemplate = (tplSeqs: AutomationSequence[], templateName: string) => {
    setSequences((prev) => normalizeSequences([...prev, ...tplSeqs]))
    setSelectedSequenceId(tplSeqs[0]?.id ?? null)
    setLeftTab('sequences')
    toast.success(`Inserted template "${templateName}"`)
  }

  const visibleSequences = useMemo(() => {
    const q = seqSearch.trim().toLowerCase()
    if (!q) return sortedSeqs
    return sortedSeqs.filter((s) => s.name.toLowerCase().includes(q))
  }, [sortedSeqs, seqSearch])

  return (
    <div ref={rootRef} className="stagger-children h-full flex flex-col gap-0 overflow-hidden">
      {/* Modern Studio Header */}
      <div className="relative flex items-center justify-between gap-3 px-3.5 py-2.5 border-b border-border/50 bg-card/70 backdrop-blur-md">
        <div className="flex items-center gap-2 min-w-0">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => setLeftPanelOpen((o) => !o)}>
                {leftPanelOpen ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeftOpen className="h-4 w-4" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">{leftPanelOpen ? 'Hide sidebar' : 'Show sidebar'} <kbd className="ml-1 rounded border border-border px-1 text-[10px]">[</kbd></TooltipContent>
          </Tooltip>

          {isRunning ? (
            <span className="flex shrink-0 items-center gap-1.5 rounded-full border border-emerald-500/40 bg-emerald-500/15 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse-slow" />
              RUNNING
              {runElapsedMs > 0 && (
                <span className="ml-0.5 font-mono text-[10px] tabular-nums opacity-85">
                  {formatDuration(runElapsedMs)}
                </span>
              )}
            </span>
          ) : (
            <span className="flex shrink-0 items-center gap-1.5 rounded-full border border-border/60 bg-muted/40 px-2.5 py-0.5 text-[11px] font-semibold text-muted-foreground">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              READY
            </span>
          )}

          <div className="hidden sm:flex items-center gap-2 min-w-0 pl-1">
            <span className="truncate text-sm font-semibold text-foreground">
              {selectedSequence?.name ?? 'Workflow Studio'}
            </span>
            {selectedSequence && (
              <span className="shrink-0 rounded-md bg-muted/60 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                {steps.length} nodes · {edges.length} links
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {!isRunning ? (
            <Button
              size="sm"
              variant="outline"
              className="h-8 gap-1.5 border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/20"
              onClick={() => void handleRun()}
              disabled={sequenceRunScope === 'selected' && checkedSequenceIds.size === 0}
            >
              <Play className="h-3.5 w-3.5 fill-current" />
              <span className="hidden md:inline">Run</span>
            </Button>
          ) : (
            <Button size="sm" variant="destructive" className="h-8 gap-1.5" onClick={handleStop}>
              <Square className="h-3.5 w-3.5 fill-current" />
              <span className="hidden md:inline">Stop</span>
            </Button>
          )}

          <Button
            size="sm"
            className="h-8 gap-1.5 shadow-sm"
            onClick={() => {
              pendingAddContextRef.current = null
              setPaletteOpen(true)
            }}
          >
            <Plus className="h-3.5 w-3.5" />
            Add Node
            <kbd className="ml-1 hidden rounded border border-primary-foreground/30 px-1 text-[10px] font-medium sm:inline">Tab</kbd>
          </Button>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => setRightPanelOpen((o) => !o)}>
                {rightPanelOpen ? <PanelRightClose className="h-4 w-4" /> : <PanelRightOpen className="h-4 w-4" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">{rightPanelOpen ? 'Hide execution' : 'Show execution'} <kbd className="ml-1 rounded border border-border px-1 text-[10px]">]</kbd></TooltipContent>
          </Tooltip>
        </div>

        <AnimatePresence>
          {isRunning && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-x-0 -bottom-px h-0.5 overflow-hidden"
            >
              <div className="h-full w-1/4 animate-run-bar rounded-full bg-gradient-to-r from-transparent via-emerald-500 to-transparent" />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Main 3-Pane Studio Workspace */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* Left Panel: Sequences / Drag-Drop Nodes / Templates */}
        <motion.div
          className={cn(
            'shrink-0 flex flex-col bg-card/60 overflow-hidden',
            leftPanelOpen && 'border-r border-border/50',
          )}
          data-tour="tour-automation-sequences"
          initial={false}
          animate={{ width: leftPanelOpen ? leftPanelWidth : 0, opacity: leftPanelOpen ? 1 : 0 }}
          transition={isResizingLeft ? { duration: 0 } : { type: 'spring', stiffness: 320, damping: 34 }}
        >
          <div className="flex h-full min-h-0 flex-col" style={{ width: leftPanelWidth }}>
            {/* Segmented Mode Switcher */}
            <div className="grid grid-cols-3 gap-1 border-b border-border/50 bg-muted/20 p-1.5">
              <button
                type="button"
                onClick={() => setLeftTab('sequences')}
                className={cn(
                  'flex items-center justify-center gap-1 rounded-lg py-1.5 text-[11px] font-semibold transition-all',
                  leftTab === 'sequences'
                    ? 'bg-background text-foreground shadow-sm ring-1 ring-border/60'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <ListOrdered className="h-3.5 w-3.5" />
                Flows
              </button>
              <button
                type="button"
                onClick={() => setLeftTab('nodes')}
                className={cn(
                  'flex items-center justify-center gap-1 rounded-lg py-1.5 text-[11px] font-semibold transition-all',
                  leftTab === 'nodes'
                    ? 'bg-background text-foreground shadow-sm ring-1 ring-border/60'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <Boxes className="h-3.5 w-3.5" />
                Nodes
              </button>
              <button
                type="button"
                onClick={() => setLeftTab('templates')}
                className={cn(
                  'flex items-center justify-center gap-1 rounded-lg py-1.5 text-[11px] font-semibold transition-all',
                  leftTab === 'templates'
                    ? 'bg-background text-foreground shadow-sm ring-1 ring-border/60'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <LayoutTemplate className="h-3.5 w-3.5" />
                Templates
              </button>
            </div>

            {leftTab === 'sequences' && (
              <>
                <div className="px-2.5 py-2 border-b border-border/50 space-y-2">
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Sequences ({sortedSeqs.length})
                    </span>
                    <div className="flex items-center gap-0.5">
                      <input
                        ref={importInputRef}
                        type="file"
                        accept=".json"
                        onChange={handleImportWorkflow}
                        className="hidden"
                      />
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-6 w-6 text-primary" onClick={handleLoadDemo}>
                            <Sparkles className="h-3.5 w-3.5" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom">Load demo workflows</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => importInputRef.current?.click()}>
                            <Upload className="h-3.5 w-3.5" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom">Import workflow JSON</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleExportWorkflow} disabled={sortedSeqs.length === 0}>
                            <Download className="h-3.5 w-3.5" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom">Export workflow JSON</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleAddSequence}>
                            <Plus className="h-3.5 w-3.5" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom">New sequence</TooltipContent>
                      </Tooltip>
                    </div>
                  </div>
                  {sortedSeqs.length > 4 && (
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        value={seqSearch}
                        onChange={(e) => setSeqSearch(e.target.value)}
                        placeholder="Filter sequences…"
                        className="h-7 pl-8 text-xs"
                      />
                    </div>
                  )}
                </div>

                <div className="flex-1 min-h-0 overflow-auto py-2">
                  <div className="space-y-0.5 px-2">
                    {visibleSequences.length === 0 ? (
                      <div className="py-8 px-4 text-center">
                        <p className="text-xs text-muted-foreground mb-3">
                          {sortedSeqs.length === 0 ? 'No sequences yet' : 'No matching sequences'}
                        </p>
                        {sortedSeqs.length === 0 && (
                          <Button variant="outline" size="sm" onClick={handleAddSequence} className="w-full">
                            <Plus className="h-3.5 w-3.5 mr-1.5" />
                            Add Sequence
                          </Button>
                        )}
                      </div>
                    ) : seqSearch.trim().length > 0 ? (
                      <div className="space-y-0.5">
                        {visibleSequences.map((seq) => {
                          const realIdx = sortedSeqs.findIndex((s) => s.id === seq.id)
                          const seqIssues = issuesCountBySeqId.get(seq.id)
                          const seqRunning = runningSeqId === seq.id || runningSeqIds.has(seq.id)
                          return (
                            <div
                              key={seq.id}
                              className={cn(
                                'group flex items-center gap-1.5 rounded-lg px-2 py-2 cursor-pointer transition-all duration-150 min-w-0',
                                selectedSequenceId === seq.id
                                  ? 'bg-primary/12 text-primary border border-primary/30 shadow-sm'
                                  : 'border border-transparent hover:bg-muted/60',
                                seqRunning && 'ring-1 ring-emerald-500/60',
                              )}
                              onClick={() => { if (editingSeqId !== seq.id) setSelectedSequenceId(seq.id) }}
                              onDoubleClick={() => startRenameSequence(seq)}
                            >
                              <button
                                type="button"
                                className={cn(
                                  'h-3.5 w-3.5 shrink-0 rounded border flex items-center justify-center focus:outline-none',
                                  checkedSequenceIds.has(seq.id)
                                    ? 'bg-primary border-primary text-primary-foreground'
                                    : 'border-muted-foreground/40 hover:border-primary/60',
                                )}
                                title="Include in Selected run"
                                onClick={(e) => { e.stopPropagation(); toggleSequenceChecked(seq.id) }}
                              >
                                {checkedSequenceIds.has(seq.id) && <Check className="h-2.5 w-2.5" />}
                              </button>
                              <span className="text-[11px] font-mono text-muted-foreground shrink-0 w-4">{realIdx + 1}.</span>
                              {editingSeqId === seq.id ? (
                                <Input
                                  value={editingSeqName}
                                  onChange={(e) => setEditingSeqName(e.target.value)}
                                  onBlur={() => handleRenameSequence(seq.id, editingSeqName)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleRenameSequence(seq.id, editingSeqName)
                                    if (e.key === 'Escape') setEditingSeqId(null)
                                  }}
                                  className="h-6 text-xs flex-1 min-w-0"
                                  onClick={(e) => e.stopPropagation()}
                                  autoFocus
                                />
                              ) : (
                                <span className="flex-1 min-w-0 truncate text-xs font-medium">{seq.name}</span>
                              )}

                              {seqRunning ? (
                                <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-500 animate-pulse-slow" title="Running" />
                              ) : seqIssues ? (
                                <span
                                  className={cn(
                                    'shrink-0',
                                    seqIssues.errors > 0 ? 'text-destructive' : 'text-amber-500',
                                  )}
                                  title={`${seqIssues.errors} error(s), ${seqIssues.warnings} warning(s)`}
                                >
                                  <AlertTriangle className="h-3 w-3" />
                                </span>
                              ) : (
                                <span className="rounded bg-muted/70 px-1 py-px font-mono text-[9.5px] text-muted-foreground shrink-0">
                                  {seq.steps.length}
                                </span>
                              )}

                              <div className={cn('flex gap-0.5 shrink-0 transition-opacity', selectedSequenceId === seq.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100')}>
                                {seqRunning ? (
                                  <button
                                    type="button"
                                    className="p-0.5 rounded text-destructive hover:bg-destructive/15"
                                    title="Stop this sequence"
                                    onClick={(e) => { e.stopPropagation(); handleStopSequence(seq.id) }}
                                  >
                                    <Square className="h-3 w-3" />
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    className="p-0.5 rounded hover:bg-muted disabled:opacity-40"
                                    disabled={seq.steps.length === 0}
                                    title={runMode === 'parallel' ? 'Start parallel loop' : 'Run this sequence'}
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      if (runMode === 'parallel') void handleRunParallel(seq.id)
                                      else void handleRun([seq.id])
                                    }}
                                  >
                                    <Play className="h-3 w-3" />
                                  </button>
                                )}
                                <button
                                  type="button"
                                  className="p-0.5 rounded hover:bg-muted"
                                  title="Clone sequence"
                                  onClick={(e) => { e.stopPropagation(); handleCloneSequence(seq.id) }}
                                >
                                  <Copy className="h-3 w-3" />
                                </button>
                                <button
                                  type="button"
                                  className="p-0.5 rounded text-destructive hover:bg-destructive/15"
                                  title="Delete sequence"
                                  onClick={(e) => { e.stopPropagation(); handleDeleteSequenceClick(seq.id) }}
                                >
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    ) : (
                      <Reorder.Group axis="y" values={sortedSeqs} onReorder={handleSequencesReorder} className="space-y-0.5" as="div">
                        {sortedSeqs.map((seq, idx) => {
                          const seqIssues = issuesCountBySeqId.get(seq.id)
                          const seqRunning = runningSeqId === seq.id || runningSeqIds.has(seq.id)
                          return (
                            <Reorder.Item
                              key={seq.id}
                              value={seq}
                              layout
                              as="div"
                              className="cursor-grab active:cursor-grabbing relative"
                            >
                              <div
                                className={cn(
                                  'group flex items-center gap-1.5 rounded-lg px-2 py-2 cursor-pointer transition-all duration-150 min-w-0',
                                  selectedSequenceId === seq.id
                                    ? 'bg-primary/12 text-primary border border-primary/30 shadow-sm'
                                    : 'border border-transparent hover:bg-muted/60',
                                  seqRunning && 'ring-1 ring-emerald-500/60',
                                )}
                                onClick={() => { if (editingSeqId !== seq.id) setSelectedSequenceId(seq.id) }}
                                onDoubleClick={() => startRenameSequence(seq)}
                              >
                                <GripVertical className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
                                <button
                                  type="button"
                                  className={cn(
                                    'h-3.5 w-3.5 shrink-0 rounded border flex items-center justify-center focus:outline-none',
                                    checkedSequenceIds.has(seq.id)
                                      ? 'bg-primary border-primary text-primary-foreground'
                                      : 'border-muted-foreground/40 hover:border-primary/60',
                                  )}
                                  title="Include in Selected run"
                                  onClick={(e) => { e.stopPropagation(); toggleSequenceChecked(seq.id) }}
                                >
                                  {checkedSequenceIds.has(seq.id) && <Check className="h-2.5 w-2.5" />}
                                </button>
                                <span className="text-[11px] font-mono text-muted-foreground shrink-0 w-4">{idx + 1}.</span>
                                {editingSeqId === seq.id ? (
                                  <Input
                                    value={editingSeqName}
                                    onChange={(e) => setEditingSeqName(e.target.value)}
                                    onBlur={() => handleRenameSequence(seq.id, editingSeqName)}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') handleRenameSequence(seq.id, editingSeqName)
                                      if (e.key === 'Escape') setEditingSeqId(null)
                                    }}
                                    className="h-6 text-xs flex-1 min-w-0"
                                    onClick={(e) => e.stopPropagation()}
                                    autoFocus
                                  />
                                ) : (
                                  <span className="flex-1 min-w-0 truncate text-xs font-medium">{seq.name}</span>
                                )}

                                {seqRunning ? (
                                  <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-500 animate-pulse-slow" title="Running" />
                                ) : seqIssues ? (
                                  <span
                                    className={cn(
                                      'shrink-0',
                                      seqIssues.errors > 0 ? 'text-destructive' : 'text-amber-500',
                                    )}
                                    title={`${seqIssues.errors} error(s), ${seqIssues.warnings} warning(s)`}
                                  >
                                    <AlertTriangle className="h-3 w-3" />
                                  </span>
                                ) : (
                                  <span className="rounded bg-muted/70 px-1 py-px font-mono text-[9.5px] text-muted-foreground shrink-0">
                                    {seq.steps.length}
                                  </span>
                                )}

                                <div className={cn('flex gap-0.5 shrink-0 transition-opacity', selectedSequenceId === seq.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100')}>
                                  {seqRunning ? (
                                    <button
                                      type="button"
                                      className="p-0.5 rounded text-destructive hover:bg-destructive/15"
                                      title="Stop this sequence"
                                      onClick={(e) => { e.stopPropagation(); handleStopSequence(seq.id) }}
                                    >
                                      <Square className="h-3 w-3" />
                                    </button>
                                  ) : (
                                    <button
                                      type="button"
                                      className="p-0.5 rounded hover:bg-muted disabled:opacity-40"
                                      disabled={seq.steps.length === 0}
                                      title={runMode === 'parallel' ? 'Start parallel loop' : 'Run this sequence'}
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        if (runMode === 'parallel') void handleRunParallel(seq.id)
                                        else void handleRun([seq.id])
                                      }}
                                    >
                                      <Play className="h-3 w-3" />
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    className="p-0.5 rounded hover:bg-muted"
                                    title="Clone sequence"
                                    onClick={(e) => { e.stopPropagation(); handleCloneSequence(seq.id) }}
                                  >
                                    <Copy className="h-3 w-3" />
                                  </button>
                                  {sortedSeqs.length > 1 && (
                                    <>
                                      <button
                                        type="button"
                                        className="p-0.5 rounded hover:bg-muted disabled:opacity-40"
                                        disabled={idx === 0}
                                        title="Move up"
                                        onClick={(e) => { e.stopPropagation(); handleReorderSequence(seq.id, 'up') }}
                                      >
                                        <ChevronUp className="h-3 w-3" />
                                      </button>
                                      <button
                                        type="button"
                                        className="p-0.5 rounded hover:bg-muted disabled:opacity-40"
                                        disabled={idx === sortedSeqs.length - 1}
                                        title="Move down"
                                        onClick={(e) => { e.stopPropagation(); handleReorderSequence(seq.id, 'down') }}
                                      >
                                        <ChevronDown className="h-3 w-3" />
                                      </button>
                                    </>
                                  )}
                                  <button
                                    type="button"
                                    className="p-0.5 rounded text-destructive hover:bg-destructive/15"
                                    title="Delete sequence"
                                    onClick={(e) => { e.stopPropagation(); handleDeleteSequenceClick(seq.id) }}
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </button>
                                </div>
                              </div>
                            </Reorder.Item>
                          )
                        })}
                      </Reorder.Group>
                    )}
                  </div>
                </div>
              </>
            )}

            {leftTab === 'nodes' && (
              <NodeLibraryDrawer
                disabled={!selectedSequenceId}
                onAddNode={(type) => {
                  pendingAddContextRef.current = null
                  handleAddStep(type)
                }}
              />
            )}

            {leftTab === 'templates' && (
              <WorkflowTemplatesDrawer
                onInsertSequences={handleInsertTemplate}
                onLoadFullDemo={handleLoadDemo}
              />
            )}
          </div>
        </motion.div>

        {/* Left Resize Handle */}
        {leftPanelOpen && (
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize left panel"
            className={cn(
              'group/resize relative z-10 -ml-0.5 w-1.5 shrink-0 cursor-col-resize select-none',
              isResizingLeft && 'bg-primary/40',
            )}
            onPointerDown={handleLeftResizeStart}
            onDoubleClick={() => setLeftPanelWidth(SEQ_PANEL_DEFAULT_WIDTH)}
          >
            <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-transparent transition-colors group-hover/resize:bg-primary/50" />
          </div>
        )}

        {/* Center React Flow v12 Workflow Canvas */}
        <AutomationCanvas
          selectedSequenceId={selectedSequenceId}
          steps={steps}
          edges={edges}
          frames={frames}
          allSequences={sortedSeqs}
          selectedIds={selectedIds}
          setSelectedIds={setSelectedIds}
          nodeTelemetry={nodeTelemetry}
          onClearTelemetry={() => setNodeTelemetry({})}
          validationIssues={validationIssues}
          currentRunningStepId={currentRunningStepId}
          isRunning={isRunning}
          runMode={runMode}
          sequenceRunScope={sequenceRunScope}
          checkedSequenceIds={checkedSequenceIds}
          runningSeqId={runningSeqId}
          runningSeqIds={runningSeqIds}
          loopCount={loopCount}
          customLoopCount={customLoopCount}
          runDurationSeconds={runDurationSeconds}
          rightPanelOpen={rightPanelOpen}
          tool={tool}
          setTool={setTool}
          edgeStyle={edgeStyle}
          onCycleEdgeStyle={cycleEdgeStyle}
          canUndo={canUndo}
          canRedo={canRedo}
          onUndo={handleUndo}
          onRedo={handleRedo}
          activeTriggerCount={activeTriggerCount}
          onOpenTriggers={() => setTriggersDialogOpen(true)}
          hasClipboard={hasClipboard}
          onPositionsCommit={handlePositionsCommit}
          onAddEdge={handleAddEdge}
          onDeleteEdge={handleDeleteEdge}
          onReconnectEdge={handleReconnectEdge}
          onAutoLink={handleAutoLink}
          onClearLinks={handleClearLinks}
          onAutoLayout={handleAutoLayout}
          onConfigureNode={handleConfigureNode}
          onDeleteSteps={handleDeleteSteps}
          onDuplicateSteps={handleDuplicateSteps}
          onCopySteps={handleCopySteps}
          onPasteSteps={handlePasteSteps}
          onSetDisabled={handleSetDisabled}
          onAlignSelected={handleAlignSelected}
          onRunFromNode={handleRunFromNode}
          onAddFrame={handleAddFrame}
          onCreateFrameFromSelected={handleCreateFrameFromSelected}
          onUpdateFrame={handleUpdateFrame}
          onDeleteFrame={handleDeleteFrame}
          onMoveFrameWithNodes={handleMoveFrameWithNodes}
          onDropNodeAt={handleDropNodeAt}
          onOpenPaletteAt={(pos) => {
            pendingAddContextRef.current = { mode: 'at', pos }
            setPaletteOpen(true)
          }}
          onRequestInsertOnEdge={(edgeId, midpoint) => {
            pendingAddContextRef.current = { mode: 'insertOnEdge', edgeId, pos: midpoint }
            setPaletteOpen(true)
          }}
          onRequestConnectNewNode={(fromStepId, sourceHandle, pos) => {
            pendingAddContextRef.current = { mode: 'connectFrom', fromStepId, sourceHandle, pos }
            setPaletteOpen(true)
          }}
          onRun={() => void handleRun()}
          onStop={handleStop}
        />

        {/* Right Resize Handle */}
        {rightPanelOpen && (
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize execution panel"
            className={cn(
              'group/resize relative z-10 -mr-0.5 w-1.5 shrink-0 cursor-col-resize select-none',
              isResizingRight && 'bg-primary/40',
            )}
            onPointerDown={handleRightResizeStart}
            onDoubleClick={() => setRightPanelWidth(EXEC_PANEL_DEFAULT_WIDTH)}
          >
            <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-transparent transition-colors group-hover/resize:bg-primary/50" />
          </div>
        )}

        {/* Right Panel: Execution, Live Variables, Run History, Filterable Activity Log */}
        <motion.div
          className={cn(
            'shrink-0 flex flex-col min-h-0 overflow-hidden bg-card',
            rightPanelOpen && 'border-l border-border/50',
          )}
          initial={false}
          animate={{ width: rightPanelOpen ? rightPanelWidth : 0, opacity: rightPanelOpen ? 1 : 0 }}
          transition={isResizingRight ? { duration: 0 } : { type: 'spring', stiffness: 320, damping: 34 }}
        >
          <div className="flex h-full min-h-0 flex-col" style={{ width: rightPanelWidth }}>
            <Card className="flex flex-col flex-1 min-h-0 border-0 rounded-none overflow-hidden" data-tour="tour-automation-execution">
              <CardHeader className="pb-2.5 pt-3.5 px-4 shrink-0 border-b border-border/40">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
                      <Activity className="h-4 w-4 text-primary" />
                      Execution
                    </CardTitle>
                    <CardDescription className="text-[11px]">Run controls &amp; live telemetry</CardDescription>
                  </div>
                  {(isRunning || liveStepsRun > 0) && (
                    <div className="flex items-center gap-1.5 font-mono text-[10px] text-muted-foreground">
                      <span className="rounded bg-muted/70 px-1.5 py-0.5 tabular-nums">{liveStepsRun} steps</span>
                      {runElapsedMs > 0 && (
                        <span className="rounded bg-muted/70 px-1.5 py-0.5 tabular-nums">{formatDuration(runElapsedMs)}</span>
                      )}
                    </div>
                  )}
                </div>
              </CardHeader>

              <CardContent className="flex flex-col gap-3 px-4 py-3.5 flex-1 min-h-0 overflow-hidden">
                {/* Playback Controls */}
                <div className="flex flex-col gap-3 p-3 rounded-xl border border-border/50 bg-muted/10 shrink-0">
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                      <Label className="w-20 shrink-0 text-xs">Scope:</Label>
                      <Select
                        value={sequenceRunScope}
                        onValueChange={(v) => setSequenceRunScope(v as 'all' | 'current' | 'selected')}
                        disabled={runMode !== 'parallel' && isRunning}
                      >
                        <SelectTrigger className="h-8 flex-1 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All (top-level)</SelectItem>
                          <SelectItem value="current">Current only</SelectItem>
                          <SelectItem value="selected">
                            Selected{checkedSequenceIds.size > 0 ? ` (${checkedSequenceIds.size})` : ''}
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="flex items-center gap-2">
                      <Label className="w-20 shrink-0 text-xs">Mode:</Label>
                      <Select value={runMode} onValueChange={(v) => setRunMode(v as 'loops' | 'duration' | 'parallel')}>
                        <SelectTrigger className="h-8 flex-1 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="loops">By loop count</SelectItem>
                          <SelectItem value="duration">For duration</SelectItem>
                          <SelectItem value="parallel">Parallel (independent ∞)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {runMode === 'loops' ? (
                      <>
                        <div className="flex items-center gap-2">
                          <Label className="w-20 shrink-0 text-xs">Loops:</Label>
                          <Select value={loopCount} onValueChange={setLoopCount}>
                            <SelectTrigger className="h-8 flex-1 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="1">Run Once</SelectItem>
                              <SelectItem value="5">Loop 5 times</SelectItem>
                              <SelectItem value="10">Loop 10 times</SelectItem>
                              <SelectItem value="custom">Custom count…</SelectItem>
                              <SelectItem value="Inf">Loop Indefinitely</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        {loopCount === 'custom' && (
                          <div className="flex items-center gap-2">
                            <Label className="w-20 shrink-0 text-xs">Times:</Label>
                            <Input
                              type="number"
                              min={1}
                              max={999999}
                              value={customLoopCount}
                              onChange={(e) => setCustomLoopCount(e.target.value)}
                              className="h-8 font-mono text-xs flex-1"
                            />
                          </div>
                        )}
                      </>
                    ) : runMode === 'parallel' ? (
                      <div className="space-y-1.5">
                        <p className="text-[11px] text-muted-foreground leading-snug">
                          Each sequence loops independently. Use ▶ per sequence or Start All below.
                        </p>
                        {runningSeqIds.size > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {[...runningSeqIds].map((id) => {
                              const s = sortedSeqs.find((sq) => sq.id === id)
                              if (!s) return null
                              return (
                                <span key={id} className="flex items-center gap-1 rounded-full border border-emerald-500/35 bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse-slow" />
                                  {s.name}
                                  <button type="button" className="ml-0.5 hover:text-destructive" onClick={() => handleStopSequence(id)}>✕</button>
                                </span>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <Label className="w-20 shrink-0 text-xs">Duration:</Label>
                        <div className="flex items-center gap-1.5 flex-1">
                          <Input
                            type="number"
                            min={1}
                            max={86400}
                            value={runDurationSeconds}
                            onChange={(e) => setRunDurationSeconds(e.target.value)}
                            className="h-8 font-mono text-xs"
                          />
                          <span className="text-xs text-muted-foreground shrink-0">sec</span>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex gap-2">
                    {runMode === 'parallel' ? (
                      <>
                        <Button
                          size="sm"
                          onClick={() => void handleRun()}
                          className="flex-1 h-9"
                          disabled={sequenceRunScope === 'selected' && checkedSequenceIds.size === 0}
                        >
                          <Play className="w-3.5 h-3.5 mr-1.5 fill-current" />
                          {sequenceRunScope === 'current'
                            ? 'Start'
                            : sequenceRunScope === 'selected'
                              ? `Start (${checkedSequenceIds.size})`
                              : 'Start All'}
                        </Button>
                        {runningSeqIds.size > 0 && (
                          <Button size="sm" onClick={handleStop} variant="destructive" className="h-9">
                            <Square className="w-3.5 h-3.5 mr-1.5 fill-current" /> Stop All
                          </Button>
                        )}
                      </>
                    ) : !isRunning ? (
                      <Button
                        size="sm"
                        onClick={() => void handleRun()}
                        className="flex-1 h-9"
                        disabled={sequenceRunScope === 'selected' && checkedSequenceIds.size === 0}
                      >
                        <Play className="w-3.5 h-3.5 mr-1.5 fill-current" />
                        {sequenceRunScope === 'current'
                          ? 'Start current'
                          : sequenceRunScope === 'selected'
                            ? `Start selected${checkedSequenceIds.size > 0 ? ` (${checkedSequenceIds.size})` : ''}`
                            : 'Start all'}
                      </Button>
                    ) : (
                      <Button size="sm" onClick={handleStop} variant="destructive" className="flex-1 h-9">
                        <Square className="w-3.5 h-3.5 mr-1.5 fill-current" /> Stop
                      </Button>
                    )}
                  </div>
                </div>

                {/* Live Variables */}
                <VariableInspector
                  vars={runVars}
                  open={inspectorOpen}
                  onToggle={() => setInspectorOpen((o) => !o)}
                  onReset={handleResetVars}
                  onExpand={() => setVarsExpandedOpen(true)}
                  isRunning={isRunning}
                />

                {/* Execution History */}
                <div className="shrink-0 rounded-xl border border-border/50 bg-muted/10 overflow-hidden">
                  <div className="flex w-full items-center gap-1 px-3 py-2">
                    <button
                      type="button"
                      className="flex min-w-0 flex-1 items-center gap-2 text-left hover:bg-muted/30 rounded -mx-1 px-1 py-0.5 transition-colors"
                      onClick={() => setExecutionsOpen((o) => !o)}
                      aria-expanded={executionsOpen}
                    >
                      <History className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Executions</span>
                      <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-muted-foreground">
                        {executions.length}
                      </span>
                      {executions[0] && executions[0].status !== 'running' && (
                        <ExecutionStatusIcon status={executions[0].status} className="ml-1 h-3 w-3" />
                      )}
                      <ChevronDown className={cn('ml-auto h-3.5 w-3.5 text-muted-foreground transition-transform', executionsOpen && 'rotate-180')} />
                    </button>
                    {executions.length > 0 && (
                      <button
                        type="button"
                        className="shrink-0 rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-40"
                        disabled={isRunning}
                        title="Clear all executions"
                        onClick={(e) => { e.stopPropagation(); setExecutions([]) }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                  {executionsOpen && (
                    <div className="border-t border-border/50">
                      {executions.length === 0 ? (
                        <div className="px-3 py-3 text-center text-[11px] text-muted-foreground">No runs yet</div>
                      ) : (
                        <div className="max-h-32 overflow-y-auto overscroll-contain">
                          <ul className="divide-y divide-border/40">
                            {executions.slice(0, 8).map((ex) => {
                              const duration = ex.finishedAt ? ex.finishedAt - ex.startedAt : Date.now() - ex.startedAt
                              return (
                                <li key={ex.id}>
                                  <button
                                    type="button"
                                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-accent/40 transition-colors"
                                    onClick={() => setViewedExecution(ex)}
                                    title={ex.error ? ex.error : ex.scope}
                                  >
                                    <ExecutionStatusIcon status={ex.status} className="h-3.5 w-3.5 shrink-0" />
                                    <span className="min-w-0 flex-1 truncate text-[11px]">{ex.scope}</span>
                                    <span className="shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground">{formatDuration(duration)}</span>
                                    <span className="shrink-0 text-[10px] text-muted-foreground">{formatRelativeTime(ex.startedAt)}</span>
                                  </button>
                                </li>
                              )
                            })}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Color-Coded Filterable Activity Log */}
                <div
                  className={cn(
                    'flex min-h-10 flex-col overflow-hidden rounded-xl border border-border/50 bg-muted/10',
                    activityLogOpen ? 'flex-1 min-h-10' : 'shrink-0',
                    !fullActivityLog && 'opacity-90',
                  )}
                >
                  <div className="flex shrink-0 items-center gap-1 border-b border-border/50 bg-muted/20 px-3 py-2">
                    <button
                      type="button"
                      className="flex min-w-0 flex-1 items-center gap-2 text-left rounded -mx-1 px-1 py-0.5 hover:bg-muted/30 transition-colors"
                      onClick={() => setActivityLogOpen((o) => !o)}
                      aria-expanded={activityLogOpen}
                    >
                      <Terminal className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Log</span>
                      <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-muted-foreground">
                        {log.length}
                      </span>
                      {isRunning && <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse-slow" />}
                      <ChevronDown className={cn('ml-auto h-3.5 w-3.5 text-muted-foreground transition-transform', activityLogOpen && 'rotate-180')} />
                    </button>
                    <div className="flex shrink-0 items-center gap-0.5">
                      <label
                        htmlFor="automation-detail-logs"
                        className="flex cursor-pointer items-center gap-1 rounded-md border border-border/50 bg-background/60 px-1.5 py-0.5"
                        onClick={(e) => e.stopPropagation()}
                        title="Record detailed step logs"
                      >
                        <Switch
                          id="automation-detail-logs"
                          checked={fullActivityLog}
                          onCheckedChange={(v) => {
                            setFullActivityLog(v)
                            setAutomationFullActivityLog(v)
                          }}
                        />
                        <span className="text-[10px] font-medium text-muted-foreground">Detail</span>
                      </label>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleCopyLog} disabled={log.length === 0} title="Copy log">
                        {logCopied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setLog([])} disabled={log.length === 0} title="Clear log">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setLogExpandedOpen(true)} title="Expand log">
                        <Maximize2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>

                  {activityLogOpen && (
                    <>
                      {log.length > 0 && (
                        <div className="flex items-center gap-1 border-b border-border/40 bg-background/30 px-2.5 py-1">
                          {(['all', 'steps', 'errors'] as LogFilter[]).map((f) => (
                            <button
                              key={f}
                              type="button"
                              onClick={() => setLogFilter(f)}
                              className={cn(
                                'rounded px-2 py-0.5 text-[10px] font-medium capitalize transition-colors',
                                logFilter === f
                                  ? 'bg-primary/15 text-primary'
                                  : 'text-muted-foreground hover:text-foreground',
                              )}
                            >
                              {f}
                            </button>
                          ))}
                        </div>
                      )}
                      <ScrollArea className="min-h-0 flex-1">
                        <div className="space-y-0.5 p-2.5 font-mono text-[11px]">
                          {filteredLog.length === 0 && (
                            <div className="py-6 text-center text-muted-foreground">
                              {log.length === 0
                                ? fullActivityLog
                                  ? 'Ready to run…'
                                  : 'Detail logging off — enable it to record runs'
                                : `No ${logFilter} lines in this run`}
                            </div>
                          )}
                          {filteredLog.map((l, i) => {
                            const kind = classifyLogLine(l)
                            return (
                              <div
                                key={i}
                                className={cn(
                                  'rounded px-2 py-0.5 transition-colors hover:bg-accent/30',
                                  kind === 'error' && 'bg-destructive/10 text-destructive',
                                  kind === 'warn' && 'text-amber-600 dark:text-amber-400',
                                  kind === 'success' && 'text-emerald-600 dark:text-emerald-400',
                                  kind === 'step' && 'text-foreground font-medium',
                                  kind === 'normal' && 'text-muted-foreground',
                                  i === filteredLog.length - 1 && 'animate-log-new',
                                )}
                              >
                                {l}
                              </div>
                            )
                          })}
                          <div ref={logEndRef} />
                        </div>
                      </ScrollArea>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </motion.div>
      </div>

      {/* Footer Status Strip */}
      <div className="flex items-center justify-between gap-4 px-4 py-1.5 border-t border-border/50 bg-card/60 text-[11px] text-muted-foreground">
        <span className="shrink-0 whitespace-nowrap font-mono">
          {sortedSeqs.length} FLOWS · {steps.length} NODES · {edges.length} LINKS
          {selectedIds.size > 0 ? ` · ${selectedIds.size} SELECTED` : ''}
        </span>
        <span className="min-w-0 truncate text-right hidden md:inline">
          Drag nodes from sidebar · Drop a wire on canvas to add &amp; connect · Hover edge for + insert · Ctrl+F find · Tab quick-add
        </span>
      </div>

      {/* Expanded Variables Dialog */}
      <Dialog open={varsExpandedOpen} onOpenChange={setVarsExpandedOpen}>
        <DialogContent className="sm:max-w-4xl h-[90vh] max-h-[90vh] overflow-hidden flex flex-col gap-0 p-0">
          <DialogHeader className="px-6 pt-6 pb-3 shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <Braces className="w-5 h-5" /> Variables
            </DialogTitle>
            <DialogDescription>
              {Object.keys(runVars).length} variable{Object.keys(runVars).length !== 1 ? 's' : ''}
              {isRunning && ' — updating live during the run'}
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 min-h-0 mx-6 mb-4 border border-border/50 rounded-xl bg-muted/10 overflow-y-auto overscroll-contain">
            <div className="space-y-0.5 p-4">
              <VariableListBody vars={runVars} size="md" />
            </div>
          </div>
          <DialogFooter className="px-6 pb-6 pt-0 shrink-0">
            <Button variant="outline" onClick={handleCopyVars} disabled={Object.keys(runVars).length === 0} className="gap-1.5">
              {varsCopied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
              {varsCopied ? 'Copied' : 'Copy'}
            </Button>
            <Button onClick={() => setVarsExpandedOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Expanded Activity Log Dialog */}
      <Dialog open={logExpandedOpen} onOpenChange={setLogExpandedOpen}>
        <DialogContent className="sm:max-w-4xl h-[90vh] max-h-[90vh] overflow-hidden flex flex-col gap-0 p-0">
          <DialogHeader className="px-6 pt-6 pb-3 shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <Terminal className="w-5 h-5" /> Activity log
            </DialogTitle>
            <DialogDescription>
              {log.length} line{log.length !== 1 ? 's' : ''}
              {!fullActivityLog && ' — detail logging is off'}
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 min-h-0 mx-6 mb-4 border border-border/50 rounded-xl bg-muted/10 overflow-y-auto overscroll-contain">
            <div className="p-4 font-mono text-sm space-y-0.5">
              {log.length === 0 && (
                <div className="text-muted-foreground text-center py-8">Ready to run…</div>
              )}
              {log.map((l, i) => {
                const kind = classifyLogLine(l)
                return (
                  <div
                    key={i}
                    className={cn(
                      'py-0.5 px-2 rounded hover:bg-accent/30',
                      kind === 'error' && 'bg-destructive/10 text-destructive',
                      kind === 'warn' && 'text-amber-600 dark:text-amber-400',
                      kind === 'success' && 'text-emerald-600 dark:text-emerald-400',
                      kind === 'normal' && 'text-muted-foreground',
                    )}
                  >
                    {l}
                  </div>
                )
              })}
              <div ref={logExpandEndRef} />
            </div>
          </div>
          <DialogFooter className="px-6 pb-6 pt-0 shrink-0">
            <Button variant="outline" onClick={handleCopyLog} disabled={log.length === 0} className="gap-1.5">
              {logCopied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
              {logCopied ? 'Copied' : 'Copy'}
            </Button>
            <Button variant="outline" onClick={() => setLog([])} disabled={log.length === 0}>Clear</Button>
            <Button onClick={() => setLogExpandedOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Execution History Detail Dialog */}
      <Dialog open={!!viewedExecution} onOpenChange={(open) => !open && setViewedExecution(null)}>
        <DialogContent className="sm:max-w-3xl h-[80vh] max-h-[80vh] overflow-hidden flex flex-col gap-0 p-0">
          {viewedExecution && (() => {
            const ex = executions.find((e) => e.id === viewedExecution.id) ?? viewedExecution
            const duration = ex.finishedAt ? ex.finishedAt - ex.startedAt : Date.now() - ex.startedAt
            return (
              <>
                <DialogHeader className="px-6 pt-6 pb-3 shrink-0">
                  <DialogTitle className="flex items-center gap-2">
                    <ExecutionStatusIcon status={ex.status} className="h-5 w-5" />
                    {EXECUTION_STATUS_LABEL[ex.status]} · {ex.scope}
                  </DialogTitle>
                  <DialogDescription className="flex flex-wrap gap-x-4 gap-y-1">
                    <span>{new Date(ex.startedAt).toLocaleString()}</span>
                    <span>Duration {formatDuration(duration)}</span>
                    <span>{ex.stepsRun} node{ex.stepsRun === 1 ? '' : 's'} executed</span>
                    {ex.startedFrom && <span>Started from “{ex.startedFrom}”</span>}
                  </DialogDescription>
                  {ex.error && (
                    <div className="mt-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 font-mono text-xs text-destructive break-words">
                      {ex.error}
                    </div>
                  )}
                </DialogHeader>
                <div className="flex-1 min-h-0 mx-6 mb-4 border border-border/50 rounded-xl bg-muted/10 overflow-y-auto overscroll-contain">
                  <div className="p-4 font-mono text-xs space-y-0.5">
                    {ex.logTruncated && (
                      <div className="mb-2 text-center text-[11px] text-muted-foreground">… earlier lines trimmed …</div>
                    )}
                    {ex.log.length === 0 && (
                      <div className="text-muted-foreground text-center py-8">No log lines were recorded</div>
                    )}
                    {ex.log.map((l, i) => (
                      <div key={i} className="text-muted-foreground hover:text-foreground py-0.5 px-2 rounded hover:bg-accent/30">
                        {l}
                      </div>
                    ))}
                  </div>
                </div>
                <DialogFooter className="px-6 pb-6 pt-0 shrink-0">
                  <Button
                    variant="outline"
                    className="gap-1.5"
                    disabled={ex.log.length === 0}
                    onClick={() => {
                      void navigator.clipboard.writeText(ex.log.join('\n')).then(
                        () => toast.success('Log copied'),
                        () => toast.error('Could not copy log'),
                      )
                    }}
                  >
                    <Copy className="h-3.5 w-3.5" /> Copy log
                  </Button>
                  <Button
                    variant="outline"
                    disabled={isRunning}
                    onClick={() => {
                      setExecutions((prev) => prev.filter((e) => e.id !== ex.id))
                      setViewedExecution(null)
                    }}
                  >
                    Delete
                  </Button>
                  <Button onClick={() => setViewedExecution(null)}>Close</Button>
                </DialogFooter>
              </>
            )
          })()}
        </DialogContent>
      </Dialog>

      {/* Delete Sequence Confirmation */}
      <Dialog open={!!deleteConfirmSeq} onOpenChange={(open) => !open && setDeleteConfirmSeq(null)}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Delete sequence?</DialogTitle>
            <DialogDescription>
              {deleteConfirmSeq && (
                <>This will permanently delete &quot;{deleteConfirmSeq.name}&quot; and its {deleteConfirmSeq.steps.length} node{deleteConfirmSeq.steps.length !== 1 ? 's' : ''}. This cannot be undone.</>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirmSeq(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDeleteSequenceConfirm}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Searchable Node Palette (⌘K / Tab / Edge Insert / Drop Wire) */}
      <NodePalette
        open={paletteOpen}
        onOpenChange={(open) => {
          if (!open) pendingAddContextRef.current = null
          setPaletteOpen(open)
        }}
        onSelect={handleAddStep}
      />

      {/* Node Configuration Dialog */}
      <NodeConfigDialog
        open={configDialogOpen}
        onOpenChange={setConfigDialogOpen}
        step={selectedStepId ? steps.find((s) => s.id === selectedStepId) ?? null : null}
        onSave={handleUpdateStep}
        onSaveParams={handleUpdateParams}
        host={host}
        alePort={alePort}
        customPort={customPort}
        fixedTabDelay={delay}
        handheldTabDelay={handheldDelay}
        sequences={sortedSeqs}
        currentSequenceId={selectedSequenceId}
      />

      {/* Triggers Manager Dialog */}
      <AutomationTriggersDialog
        open={triggersDialogOpen}
        onOpenChange={setTriggersDialogOpen}
        sequences={sequences}
        triggers={triggers}
        onSaveTriggers={setTriggers}
      />
    </div>
  )
}
