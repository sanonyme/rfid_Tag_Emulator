import { useState, useRef, useEffect, useCallback, useMemo, memo } from 'react'
import { motion, Reorder, useMotionValue } from 'framer-motion'
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
} from "./ui/select"
import { 
  Play, 
  Square, 
  Trash2, 
  Copy,
  Check,
  Clock, 
  ScanLine, 
  Radio, 
  Smartphone,
  Terminal,
  Plus,
  ChevronDown,
  GripVertical,
  Settings2,
  ListOrdered,
  ChevronUp,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Upload,
  Download,
  Box,
  Workflow,
  Variable,
  Database,
  FileCode2,
  Maximize2,
  GitBranch,
  FileText,
  Spline,
  Link2Off,
  Repeat,
  Globe,
  Server,
  Network,
  Braces,
  ChevronRight,
} from 'lucide-react'
import { useEdgeSession } from '@/contexts/EdgeSessionContext'
import { publishStatus, clearStatus } from '@/lib/workspace-status'
import {
  TCPEmulatorClient,
  HandheldServerClient,
  OCRClient,
  CustomClient,
  type TagData,
  EPCGenerator,
  expandUpcListToEpcs,
} from '@/lib/tcp-client'
import { toast } from 'sonner'
import { cn, formatTime } from '@/lib/utils'
import { getHandheldFullActivityLog } from '@/lib/handheld-log-settings'
import {
  getAutomationFullActivityLog,
  setAutomationFullActivityLog,
} from '@/lib/automation-log-settings'
import { Switch } from './ui/switch'
import type { AutomationStep, AutomationSequence, AutomationEdge, ActionType } from '@/lib/automation-types'
import {
  normalizeSequences,
  migrateStepsToSequences,
  deriveLinearEdges,
  DEFAULT_STEP_NAMES,
  defaultParamsForType,
  ALL_ACTION_TYPES,
  CONDITION_OPS,
} from '@/lib/automation-types'
import {
  createRunContext,
  applyTemplate,
  captureEpcsToVars,
  evaluateCondition,
  STANDARD_AUTOMATION_VARS,
  type AutomationVars,
} from '@/lib/automation-template'
import {
  executeDbQuery,
  executeDbExec,
  executeRunScript,
  executeSetVariable,
  executeHttpRequest,
} from '@/lib/automation-blocks'
import { NodeConfigDialog } from './NodeConfigDialog'
import { PortaledAnchoredMenu } from './ui/portaled-anchored-menu'

interface AutomationTabProps {
  emulator: TCPEmulatorClient
  handheldServer: HandheldServerClient
  ocrClient: OCRClient
  host: string
  alePort: string
  customPort: string
  /** Inter-tag delay for fixed reader sends */
  delay: string
  /** Inter-tag delay for handheld broadcasts (separate from `delay`) */
  handheldDelay: string
  sequences: AutomationSequence[]
  setSequences: React.Dispatch<React.SetStateAction<AutomationSequence[]>>
}

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
      [effectiveMin, effectiveMax] = [effectiveMax, effectiveMin]
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

// Sized to comfortably fit a 2-line node name plus a 2-line description without clipping.
const NODE_WIDTH = 220
const NODE_HEIGHT = 138
/** Guards graph execution against runaway loops (cyclic edges, incl. self-loops). */
const MAX_GRAPH_STEPS = 10000
/** Max nesting depth for Call Sequence (guards against runaway sub-routine chains). */
const MAX_CALL_DEPTH = 20
/** How far a self-loop arc dips below its node. */
const SELF_LOOP_DROP = 46

/** Vertical offsets (px, relative to node top) of each connection port. */
const PORT_Y = {
  input: NODE_HEIGHT / 2,
  out: NODE_HEIGHT / 2,
  /** CONDITION true branch (upper-right) */
  true: NODE_HEIGHT * 0.32,
  /** CONDITION false branch (lower-right) */
  false: NODE_HEIGHT * 0.68,
} as const

/** Y offset of a source port for a given handle. */
function sourcePortY(handle: string | undefined): number {
  if (handle === 'true') return PORT_Y.true
  if (handle === 'false') return PORT_Y.false
  return PORT_Y.out
}

const STEP_TYPE_STYLES: Record<ActionType, { border: string; bg: string; icon: string; label: string }> = {
  DELAY: { border: 'border-amber-400/40', bg: 'bg-amber-400/10', icon: 'text-amber-400', label: 'DELAY' },
  OCR: { border: 'border-pink-400/40', bg: 'bg-pink-400/10', icon: 'text-pink-400', label: 'OCR' },
  FIXED_TAG: { border: 'border-blue-400/40', bg: 'bg-blue-400/10', icon: 'text-blue-400', label: 'ACTION' },
  HANDHELD_TAG: { border: 'border-emerald-400/40', bg: 'bg-emerald-400/10', icon: 'text-emerald-400', label: 'ACTION' },
  CUSTOM_MESSAGE: { border: 'border-violet-400/40', bg: 'bg-violet-400/10', icon: 'text-violet-400', label: 'CUSTOM' },
  EDGE_BLOCK: { border: 'border-cyan-400/40', bg: 'bg-cyan-400/10', icon: 'text-cyan-400', label: 'EDGE' },
  EDGE_PROCESS: { border: 'border-teal-400/40', bg: 'bg-teal-400/10', icon: 'text-teal-400', label: 'EDGE' },
  SET_VARIABLE: { border: 'border-orange-400/40', bg: 'bg-orange-400/10', icon: 'text-orange-400', label: 'VAR' },
  DB_QUERY: { border: 'border-indigo-400/40', bg: 'bg-indigo-400/10', icon: 'text-indigo-400', label: 'DB' },
  DB_EXEC: { border: 'border-indigo-400/40', bg: 'bg-indigo-400/10', icon: 'text-indigo-400', label: 'SQL' },
  RUN_SCRIPT: { border: 'border-lime-400/40', bg: 'bg-lime-400/10', icon: 'text-lime-400', label: 'SCRIPT' },
  HTTP_REQUEST: { border: 'border-rose-400/40', bg: 'bg-rose-400/10', icon: 'text-rose-400', label: 'HTTP' },
  CALL_SEQUENCE: { border: 'border-purple-400/40', bg: 'bg-purple-400/10', icon: 'text-purple-400', label: 'CALL' },
  CONDITION: { border: 'border-fuchsia-400/40', bg: 'bg-fuchsia-400/10', icon: 'text-fuchsia-400', label: 'IF' },
  LOG: { border: 'border-sky-400/40', bg: 'bg-sky-400/10', icon: 'text-sky-400', label: 'LOG' },
}

function StepTypeIcon({ type, className }: { type: ActionType; className?: string }) {
  switch (type) {
    case 'DELAY': return <Clock className={className} />
    case 'OCR': return <ScanLine className={className} />
    case 'FIXED_TAG': return <Radio className={className} />
    case 'HANDHELD_TAG': return <Smartphone className={className} />
    case 'CUSTOM_MESSAGE': return <Terminal className={className} />
    case 'EDGE_BLOCK': return <Box className={className} />
    case 'EDGE_PROCESS': return <Workflow className={className} />
    case 'SET_VARIABLE': return <Variable className={className} />
    case 'DB_QUERY': return <Database className={className} />
    case 'DB_EXEC': return <Server className={className} />
    case 'RUN_SCRIPT': return <FileCode2 className={className} />
    case 'HTTP_REQUEST': return <Globe className={className} />
    case 'CALL_SEQUENCE': return <Network className={className} />
    case 'CONDITION': return <GitBranch className={className} />
    case 'LOG': return <FileText className={className} />
    default: return null
  }
}

const WorkflowNode = memo(function WorkflowNode({
  step,
  pos,
  canvasZoom,
  style,
  isDragging,
  isActive,
  isSelected: _isSelected,
  isRunning,
  isLinkTarget,
  onDragStart,
  onDrag,
  onDragEnd,
  onConfigure,
  onDelete,
  onStartLink,
}: {
  step: AutomationStep
  pos: { x: number; y: number }
  canvasZoom: number
  style: { border: string; bg: string; icon: string; label: string }
  isDragging: boolean
  isActive: boolean
  isSelected: boolean
  isRunning: boolean
  /** True while a link is being dragged and this node can receive it (input port pulses) */
  isLinkTarget: boolean
  onDragStart: (id: string) => void
  onDrag: (id: string, x: number, y: number) => void
  onDragEnd: (id: string, x: number, y: number) => void
  onConfigure: (id: string) => void
  onDelete: (id: string) => void
  onStartLink: (id: string, handle: string, e: React.PointerEvent) => void
}) {
  const x = useMotionValue(pos.x)
  const y = useMotionValue(pos.y)

  useEffect(() => {
    if (!isDragging) {
      x.set(pos.x)
      y.set(pos.y)
    }
  }, [pos.x, pos.y, isDragging, x, y])

  const handleGripPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation()
    e.preventDefault()
    const grip = e.currentTarget
    grip.setPointerCapture(e.pointerId)

    const startX = pos.x
    const startY = pos.y
    const startClientX = e.clientX
    const startClientY = e.clientY
    const zoom = Math.max(canvasZoom, 0.01)

    onDragStart(step.id)

    const onMove = (ev: PointerEvent) => {
      const nx = Math.max(0, startX + (ev.clientX - startClientX) / zoom)
      const ny = Math.max(0, startY + (ev.clientY - startClientY) / zoom)
      x.set(nx)
      y.set(ny)
      onDrag(step.id, nx, ny)
    }

    const onUp = (ev: PointerEvent) => {
      grip.releasePointerCapture(ev.pointerId)
      grip.removeEventListener('pointermove', onMove)
      grip.removeEventListener('pointerup', onUp)
      grip.removeEventListener('pointercancel', onUp)
      const nx = Math.max(0, startX + (ev.clientX - startClientX) / zoom)
      const ny = Math.max(0, startY + (ev.clientY - startClientY) / zoom)
      x.set(nx)
      y.set(ny)
      onDragEnd(step.id, nx, ny)
    }

    grip.addEventListener('pointermove', onMove)
    grip.addEventListener('pointerup', onUp)
    grip.addEventListener('pointercancel', onUp)
  }

  const getDescription = () => {
    switch (step.type) {
      case 'DELAY': return `${step.params.duration ?? 1000}ms wait`
      case 'OCR': return `Send ${(step.params.message || '').length} chars`
      case 'FIXED_TAG': {
        const tagList = step.params.upcList || step.params.epcList ? 'Tag list' : (step.params.upc || step.params.epc || 'Configure')
        const delayLabel = step.params.tagDelay?.trim()
        return delayLabel ? `${tagList} · ${delayLabel}ms` : tagList
      }
      case 'HANDHELD_TAG': return step.params.epcList || step.params.upcList ? 'Tag list' : 'Configure'
      case 'CUSTOM_MESSAGE': return step.params.message ? `Send ${(step.params.message || '').length} chars` : 'Configure'
      case 'EDGE_BLOCK': return step.params.edgeBlockName || 'Select block'
      case 'EDGE_PROCESS': {
        const action = step.params.edgeProcessAction === 'stop' ? 'Stop' : 'Start'
        return step.params.edgeProcessName ? `${action} ${step.params.edgeProcessName}` : 'Select process'
      }
      case 'SET_VARIABLE': return step.params.varName ? `${step.params.varName}=…` : 'Configure'
      case 'DB_QUERY': return step.params.dbSql ? step.params.dbSql.slice(0, 40) : 'Configure'
      case 'DB_EXEC': return step.params.dbSql ? step.params.dbSql.slice(0, 40) : 'Configure'
      case 'RUN_SCRIPT': return step.params.scriptInline ? 'Inline script' : (step.params.scriptPath || 'Configure')
      case 'HTTP_REQUEST': return step.params.httpUrl ? `${step.params.httpMethod || 'GET'} ${step.params.httpUrl}` : 'Configure'
      case 'CALL_SEQUENCE': return step.params.callSequenceId ? 'Run sub-sequence' : 'Select sequence'
      case 'CONDITION': {
        const opMeta = CONDITION_OPS.find((o) => o.value === (step.params.condOp ?? 'eq'))
        const left = step.params.condLeft || '?'
        return opMeta?.needsRight === false
          ? `${left} ${opMeta.label}`
          : `${left} ${opMeta?.label ?? '='} ${step.params.condRight ?? ''}`
      }
      case 'LOG': return step.params.logMessage ? step.params.logMessage.slice(0, 44) : 'Configure'
      default: return ''
    }
  }

  const isCondition = step.type === 'CONDITION'

  // Small circular connection port. Pointer-down starts dragging a new link.
  const OutputPort = ({ handle, top, color, label }: { handle: string; top: number; color: string; label?: string }) => (
    <div
      className="absolute z-20 flex items-center"
      style={{ right: -7, top: top - 7 }}
    >
      <div
        data-node-output
        data-handle={handle}
        onPointerDown={(e) => onStartLink(step.id, handle, e)}
        title={label ? `Drag to connect (${label})` : 'Drag to connect'}
        className={cn(
          'h-3.5 w-3.5 shrink-0 cursor-crosshair rounded-full border-2 border-background shadow transition-transform hover:scale-125',
          color,
        )}
      />
      {label && (
        <span className="pointer-events-none ml-1 text-[8px] font-bold uppercase tracking-wide text-foreground/60">{label}</span>
      )}
    </div>
  )

  return (
    <motion.div
      style={{ x, y, width: NODE_WIDTH, height: NODE_HEIGHT, transformOrigin: '0 0' }}
      className={cn('absolute', isDragging && 'z-50 cursor-grabbing')}
      data-node-id={step.id}
      initial={false}
      whileHover={isDragging ? undefined : { scale: 1.02 }}
    >
      {/* Input port (left) */}
      <div
        data-node-input
        className={cn(
          'absolute z-20 h-3.5 w-3.5 rounded-full border-2 border-background bg-muted-foreground/70 shadow',
          isLinkTarget && 'bg-primary ring-2 ring-primary/40 animate-pulse',
        )}
        style={{ left: -7, top: PORT_Y.input - 7 }}
        title="Input"
      />
      {/* Output port(s) (right) */}
      {isCondition ? (
        <>
          <OutputPort handle="true" top={PORT_Y.true} color="bg-green-500" label="T" />
          <OutputPort handle="false" top={PORT_Y.false} color="bg-red-500" label="F" />
        </>
      ) : (
        <OutputPort handle="out" top={PORT_Y.out} color="bg-primary" />
      )}

      <Card
        className={`group/node relative flex h-full w-full flex-col overflow-hidden rounded-xl border ${style.border} ${style.bg} bg-background/70 p-3 ${isDragging ? '' : 'backdrop-blur'} transition-shadow hover:shadow-lg cursor-pointer select-none focus:outline-none ${isDragging ? 'shadow-xl ring-2 ring-primary/50' : ''} ${isActive ? 'ring-2 ring-green-500 shadow-[0_0_12px_rgba(34,197,94,0.25)]' : ''}`}
        onPointerDown={(e) => { if (!(e.target as HTMLElement).closest('button')) { e.preventDefault(); onConfigure(step.id) } }}
      >
        <div className="relative space-y-1.5">
          <div className="flex items-center gap-2">
            <div
              className="flex h-7 w-7 shrink-0 cursor-grab active:cursor-grabbing items-center justify-center rounded-lg border border-border/40 bg-background/60 touch-none"
              onPointerDown={handleGripPointerDown}
            >
              <GripVertical className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border ${style.border} ${style.bg} bg-background/80 backdrop-blur`}>
              <StepTypeIcon type={step.type} className={`h-4 w-4 ${style.icon}`} />
            </div>
            <span className="min-w-0 flex-1 truncate text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
              {style.label}
            </span>
            {/* Actions reveal on hover so they never crowd the name */}
            {!isRunning && (
              <div className="flex items-center gap-0.5 shrink-0 opacity-0 transition-opacity group-hover/node:opacity-100 focus-within:opacity-100">
                <button
                  type="button"
                  className="p-1.5 rounded hover:bg-primary/20 text-primary shrink-0 focus:outline-none select-none"
                  onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); onConfigure(step.id) }}
                  title="Configure"
                >
                  <Settings2 className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  className="p-1 rounded hover:bg-destructive/20 text-destructive shrink-0 focus:outline-none select-none"
                  onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); onDelete(step.id) }}
                  title="Remove"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            )}
          </div>
          {/* Full-width name — its own row so long names are never squeezed against the icons */}
          <h3
            title={step.name}
            className="line-clamp-2 text-[13px] font-semibold leading-snug text-foreground"
          >
            {step.name}
          </h3>
          <p className="line-clamp-2 text-[10px] leading-relaxed text-foreground/70">{getDescription()}</p>
        </div>
      </Card>
    </motion.div>
  )
})

/**
 * A single directed connection between two nodes, drawn as a bezier curve with
 * an arrowhead. Hovering reveals a red delete affordance; clicking removes it.
 */
const WorkflowEdge = memo(function WorkflowEdge({
  edge,
  steps,
  dragPreview,
  isRunning,
  onDelete,
}: {
  edge: AutomationEdge
  steps: AutomationStep[]
  dragPreview: { nodeId: string; x: number; y: number } | null
  isRunning: boolean
  onDelete: (edgeId: string) => void
}) {
  const fromStep = steps.find((s) => s.id === edge.from)
  const toStep = steps.find((s) => s.id === edge.to)
  if (!fromStep || !toStep) return null

  const isSelfLoop = edge.from === edge.to
  const fromPos =
    dragPreview?.nodeId === edge.from
      ? { x: dragPreview.x, y: dragPreview.y }
      : (fromStep.position ?? { x: 0, y: 0 })
  const toPos = isSelfLoop
    ? fromPos
    : dragPreview?.nodeId === edge.to
      ? { x: dragPreview.x, y: dragPreview.y }
      : (toStep.position ?? { x: 0, y: 0 })

  const startX = fromPos.x + NODE_WIDTH
  const startY = fromPos.y + sourcePortY(edge.sourceHandle)
  const endX = toPos.x
  const endY = toPos.y + PORT_Y.input

  let path: string
  let midX: number
  let midY: number
  if (isSelfLoop) {
    // Loop out of the output port, dip below the node, and back up into the input port —
    // keeps the connection legible instead of a straight line cutting through the card.
    const bottomY = fromPos.y + NODE_HEIGHT + SELF_LOOP_DROP
    const rightBulgeX = fromPos.x + NODE_WIDTH * 0.72
    const leftBulgeX = fromPos.x + NODE_WIDTH * 0.28
    path = `M${startX},${startY} C${startX + 26},${startY + 8} ${rightBulgeX + 20},${bottomY} ${rightBulgeX},${bottomY} L${leftBulgeX},${bottomY} C${leftBulgeX - 20},${bottomY} ${endX - 26},${endY + 8} ${endX},${endY}`
    midX = fromPos.x + NODE_WIDTH / 2
    midY = bottomY
  } else {
    const cp1X = startX + Math.max(40, Math.abs(endX - startX) * 0.5)
    const cp2X = endX - Math.max(40, Math.abs(endX - startX) * 0.5)
    path = `M${startX},${startY} C${cp1X},${startY} ${cp2X},${endY} ${endX},${endY}`
    midX = (startX + endX) / 2
    midY = (startY + endY) / 2
  }

  const branchColor = isSelfLoop
    ? 'text-amber-500'
    : edge.sourceHandle === 'true' ? 'text-green-500' : edge.sourceHandle === 'false' ? 'text-red-500' : 'text-foreground'

  return (
    <g className="group/edge">
      {/* Visible curve */}
      <path
        d={path}
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeDasharray={isSelfLoop ? '5,4' : undefined}
        markerEnd="url(#wf-arrow)"
        className={cn(branchColor, 'opacity-50 transition-opacity group-hover/edge:opacity-90')}
      >
        {isSelfLoop && <title>Self-loop — repeats this node (up to {MAX_GRAPH_STEPS.toLocaleString()}× per run)</title>}
      </path>
      {isSelfLoop && (
        <Repeat
          x={midX - 7}
          y={midY - 7}
          width={14}
          height={14}
          className={cn(branchColor, 'opacity-70 pointer-events-none')}
        />
      )}
      {/* Wide invisible hit area + delete-on-click (disabled while running) */}
      {!isRunning && (
        <>
          <path
            d={path}
            fill="none"
            stroke="transparent"
            strokeWidth={18}
            className="pointer-events-auto cursor-pointer"
            onClick={(e) => { e.stopPropagation(); onDelete(edge.id) }}
          >
            <title>Click to remove this link</title>
          </path>
          <g
            className="pointer-events-auto cursor-pointer opacity-0 transition-opacity group-hover/edge:opacity-100"
            onClick={(e) => { e.stopPropagation(); onDelete(edge.id) }}
          >
            <circle cx={midX} cy={midY} r={9} className="fill-red-500" />
            <path
              d={`M${midX - 3},${midY - 3} L${midX + 3},${midY + 3} M${midX + 3},${midY - 3} L${midX - 3},${midY + 3}`}
              stroke="white"
              strokeWidth={1.6}
              strokeLinecap="round"
            />
            <title>Remove link</title>
          </g>
        </>
      )}
    </g>
  )
})

const STANDARD_VAR_NAMES = new Set(STANDARD_AUTOMATION_VARS.map((v) => v.name))
const STANDARD_VAR_DESCRIPTIONS: Record<string, string> = Object.fromEntries(
  STANDARD_AUTOMATION_VARS.map((v) => [v.name, v.description]),
)

/**
 * Live variable inspector — surfaces the run context that already flows between
 * nodes. Standard app variables are listed first (with descriptions), custom /
 * captured variables after. Updates live as a workflow runs.
 */
const VariableInspector = memo(function VariableInspector({
  vars,
  open,
  onToggle,
  onReset,
  isRunning,
}: {
  vars: AutomationVars
  open: boolean
  onToggle: () => void
  onReset: () => void
  isRunning: boolean
}) {
  const entries = Object.entries(vars)
  const standard = entries
    .filter(([k]) => STANDARD_VAR_NAMES.has(k))
    .sort((a, b) => a[0].localeCompare(b[0]))
  const custom = entries
    .filter(([k]) => !STANDARD_VAR_NAMES.has(k))
    .sort((a, b) => a[0].localeCompare(b[0]))

  const Row = ([name, value]: [string, string]) => (
    <div key={name} className="flex items-start gap-2 rounded px-2 py-1 hover:bg-accent/40">
      <code
        className="shrink-0 max-w-[42%] truncate font-mono text-[11px] font-semibold text-primary"
        title={STANDARD_VAR_DESCRIPTIONS[name] ? `${name} — ${STANDARD_VAR_DESCRIPTIONS[name]}` : name}
      >
        {name}
      </code>
      <span className="min-w-0 flex-1 whitespace-pre-wrap break-words font-mono text-[11px] text-foreground/80" title={value}>
        {value === '' ? <span className="italic text-muted-foreground/60">empty</span> : value}
      </span>
    </div>
  )

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
          {isRunning && <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" title="Updating live" />}
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
        <ScrollArea className="max-h-[180px]">
          <div className="space-y-0.5 px-1 pb-2">
            {entries.length === 0 ? (
              <p className="px-2 py-3 text-center text-[11px] text-muted-foreground">
                No variables yet. Run a workflow to capture values.
              </p>
            ) : (
              <>
                {standard.map(Row)}
                {custom.length > 0 && standard.length > 0 && (
                  <div className="my-1 border-t border-border/50" />
                )}
                {custom.map(Row)}
              </>
            )}
          </div>
        </ScrollArea>
      )}
    </div>
  )
})

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
  const customClient = useMemo(() => new CustomClient(), [])
  const edgeSession = useEdgeSession()
  const sortedSeqs = useMemo(() => [...sequences].sort((a, b) => a.order - b.order), [sequences])
  const [selectedSequenceId, setSelectedSequenceId] = useState<string | null>(sortedSeqs[0]?.id ?? null)
  const selectedSequence = sortedSeqs.find(s => s.id === selectedSequenceId)
  const steps = selectedSequence?.steps ?? []
  // Connections for the selected sequence. Legacy sequences (edges === undefined)
  // fall back to a derived linear chain until the migration effect materializes them.
  const edges = useMemo<AutomationEdge[]>(
    () => selectedSequence?.edges ?? deriveLinearEdges(selectedSequence?.steps ?? []),
    [selectedSequence],
  )

  const [isRunning, setIsRunning] = useState(false)

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
  const [, setCurrentSequenceIndex] = useState<number | null>(null)
  const [currentRunningStepId, setCurrentRunningStepId] = useState<string | null>(null)
  const [loopCount, setLoopCount] = useState<string>('1')
  const [customLoopCount, setCustomLoopCount] = useState<string>('3')
  const [runMode, setRunMode] = useState<'loops' | 'duration'>('loops')
  const [runDurationSeconds, setRunDurationSeconds] = useState<string>('300')
  const [log, setLog] = useState<string[]>([])
  const [logExpandedOpen, setLogExpandedOpen] = useState(false)
  const [logCopied, setLogCopied] = useState(false)
  const [fullActivityLog, setFullActivityLog] = useState(() => getAutomationFullActivityLog())
  const fullActivityLogRef = useRef(fullActivityLog)
  fullActivityLogRef.current = fullActivityLog
  const logEndRef = useRef<HTMLDivElement>(null)
  const logExpandEndRef = useRef<HTMLDivElement>(null)
  const abortControllerRef = useRef<AbortController | null>(null)
  const runVarsRef = useRef<AutomationVars>({})
  // Live snapshot of run variables for the inspector (updated after each node).
  const [runVars, setRunVars] = useState<AutomationVars>({})
  const [inspectorOpen, setInspectorOpen] = useState(true)
  const importInputRef = useRef<HTMLInputElement>(null)

  // Keep connection variables fresh in the inspector while idle, without wiping the
  // values captured by the last run (merge rather than replace).
  useEffect(() => {
    if (isRunning) return
    setRunVars(prev => ({ ...prev, ...createRunContext({ host, alePort, customPort, port: '' }) }))
  }, [host, alePort, customPort, isRunning])

  const handleResetVars = useCallback(() => {
    if (isRunning) return
    const fresh = createRunContext({ host, alePort, customPort, port: '' })
    runVarsRef.current = { ...fresh }
    setRunVars({ ...fresh })
  }, [host, alePort, customPort, isRunning])

  useEffect(() => {
    if (sortedSeqs.length > 0 && !selectedSequenceId) setSelectedSequenceId(sortedSeqs[0].id)
    if (selectedSequenceId && !sortedSeqs.find(s => s.id === selectedSequenceId)) {
      setSelectedSequenceId(sortedSeqs[0]?.id ?? null)
    }
  }, [sortedSeqs, selectedSequenceId])

  const addLog = useCallback((msg: string) => {
    if (!fullActivityLogRef.current) return
    setLog((prev) => [...prev, `[${formatTime()}] ${msg}`])
  }, [])

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    if (logExpandedOpen) {
      logExpandEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [log, logExpandedOpen])

  const handleCopyLog = useCallback(async () => {
    if (log.length === 0) return
    try {
      await navigator.clipboard.writeText(log.join('\n'))
      setLogCopied(true)
      setTimeout(() => setLogCopied(false), 2000)
    } catch {
      toast.error('Could not copy log')
    }
  }, [log])

  useEffect(() => {
    if (!logExpandedOpen) setLogCopied(false)
  }, [logExpandedOpen])

  const updateStepsForSequence = useCallback((seqId: string, updater: (steps: AutomationStep[]) => AutomationStep[]) => {
    setSequences(prev => prev.map(seq =>
      seq.id === seqId ? { ...seq, steps: updater(seq.steps) } : seq
    ))
  }, [setSequences])

  const updateEdgesForSequence = useCallback((seqId: string, updater: (edges: AutomationEdge[]) => AutomationEdge[]) => {
    setSequences(prev => prev.map(seq =>
      seq.id === seqId ? { ...seq, edges: updater(seq.edges ?? deriveLinearEdges(seq.steps)) } : seq
    ))
  }, [setSequences])

  // One-time migration: give any legacy sequence (no `edges`) an explicit linear
  // chain so it keeps its original run order under the new graph engine.
  useEffect(() => {
    setSequences(prev => {
      if (prev.every(s => s.edges !== undefined)) return prev
      return prev.map(s => (s.edges !== undefined ? s : { ...s, edges: deriveLinearEdges(s.steps) }))
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /**
   * Create a link from a source port to a target node — `from === to` is a valid
   * self-loop (a node repeating itself, e.g. a CONDITION whose TRUE branch loops
   * back until it flips FALSE). Each output port keeps at most one outgoing edge
   * (a new link from the same port replaces the old one, and re-dragging the same
   * link removes it), which keeps execution deterministic.
   */
  const addEdge = useCallback((from: string, to: string, handle: string) => {
    if (!selectedSequenceId) return
    updateEdgesForSequence(selectedSequenceId, (prev) => {
      const withoutSamePort = prev.filter(e => !(e.from === from && (e.sourceHandle ?? 'out') === handle))
      if (withoutSamePort.some(e => e.from === from && e.to === to && (e.sourceHandle ?? 'out') === handle)) {
        return withoutSamePort
      }
      return [...withoutSamePort, { id: crypto.randomUUID(), from, to, sourceHandle: handle }]
    })
  }, [selectedSequenceId, updateEdgesForSequence])

  const handleDeleteEdge = useCallback((edgeId: string) => {
    if (!selectedSequenceId) return
    updateEdgesForSequence(selectedSequenceId, (prev) => prev.filter(e => e.id !== edgeId))
  }, [selectedSequenceId, updateEdgesForSequence])

  useEffect(() => {
    if (steps.length === 0) return
    const maxX = Math.max(...steps.map((s) => (s.position?.x ?? 0) + NODE_WIDTH))
    const maxY = Math.max(...steps.map((s) => (s.position?.y ?? 0) + NODE_HEIGHT))
    setContentSize((prev) => ({
      width: Math.max(prev.width, maxX + 50),
      height: Math.max(prev.height, maxY + 50),
    }))
  }, [steps.length])

  const canvasRef = useRef<HTMLDivElement>(null)
  const dragPreviewRafRef = useRef<number | null>(null)
  const pendingDragPreviewRef = useRef<{ nodeId: string; x: number; y: number } | null>(null)
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null)
  const [dragPreview, setDragPreview] = useState<{ nodeId: string; x: number; y: number } | null>(null)
  const [canvasPan, setCanvasPan] = useState({ x: 0, y: 0 })
  const [canvasZoom, setCanvasZoom] = useState(1)
  const panStartRef = useRef<{ x: number; y: number; startPanX: number; startPanY: number } | null>(null)

  // --- Manual linking (drag from an output port to a target node) ---
  const [linking, setLinking] = useState<{ from: string; handle: string } | null>(null)
  const [linkCursor, setLinkCursor] = useState<{ x: number; y: number } | null>(null)
  // Live values read by the window listeners without re-binding on every pan/zoom.
  const canvasPanRef = useRef(canvasPan); canvasPanRef.current = canvasPan
  const canvasZoomRef = useRef(canvasZoom); canvasZoomRef.current = canvasZoom
  const [contentSize, setContentSize] = useState(() => {
    if (steps.length === 0) return { width: 300, height: 250 }
    const maxX = Math.max(...steps.map((s) => (s.position?.x ?? 0) + NODE_WIDTH))
    const maxY = Math.max(...steps.map((s) => (s.position?.y ?? 0) + NODE_HEIGHT))
    return { width: maxX + 50, height: maxY + 50 }
  })

  const handleDragStart = useCallback((nodeId: string) => {
    setDraggingNodeId(nodeId)
  }, [])

  const handleDrag = useCallback((nodeId: string, x: number, y: number) => {
    pendingDragPreviewRef.current = { nodeId, x, y }
    if (dragPreviewRafRef.current != null) return
    dragPreviewRafRef.current = requestAnimationFrame(() => {
      dragPreviewRafRef.current = null
      if (pendingDragPreviewRef.current) {
        setDragPreview(pendingDragPreviewRef.current)
      }
    })
  }, [])

  const handleDragEnd = useCallback((nodeId: string, newX: number, newY: number) => {
    if (dragPreviewRafRef.current != null) {
      cancelAnimationFrame(dragPreviewRafRef.current)
      dragPreviewRafRef.current = null
    }
    pendingDragPreviewRef.current = null
    setDragPreview(null)
    setDraggingNodeId(null)

    if (!selectedSequenceId) return

    // Only update position; connections are explicit edges now, so array order
    // no longer affects the flow — keep it stable to avoid node reshuffling.
    updateStepsForSequence(selectedSequenceId, (prev) =>
      prev.map((s) =>
        s.id === nodeId ? { ...s, position: { x: newX, y: newY } } : { ...s, position: s.position ?? { x: 0, y: 0 } },
      ),
    )
    setContentSize((prev) => ({
      width: Math.max(prev.width, newX + NODE_WIDTH + 50),
      height: Math.max(prev.height, newY + NODE_HEIGHT + 50),
    }))
  }, [selectedSequenceId, updateStepsForSequence])

  /** Convert a client (screen) point to canvas content coordinates. */
  const clientToContent = useCallback((clientX: number, clientY: number) => {
    const rect = canvasRef.current?.getBoundingClientRect()
    const zoom = Math.max(canvasZoomRef.current, 0.01)
    const left = rect?.left ?? 0
    const top = rect?.top ?? 0
    return {
      x: (clientX - left - canvasPanRef.current.x) / zoom,
      y: (clientY - top - canvasPanRef.current.y) / zoom,
    }
  }, [])

  const handleStartLink = useCallback((from: string, handle: string, e: React.PointerEvent) => {
    e.stopPropagation()
    e.preventDefault()
    setLinking({ from, handle })
    setLinkCursor(clientToContent(e.clientX, e.clientY))
  }, [clientToContent])

  // While a link is in progress, track the cursor and complete/cancel on release.
  useEffect(() => {
    if (!linking) return
    const onMove = (ev: PointerEvent) => setLinkCursor(clientToContent(ev.clientX, ev.clientY))
    const onUp = (ev: PointerEvent) => {
      const el = document.elementFromPoint(ev.clientX, ev.clientY) as HTMLElement | null
      const targetNode = el?.closest('[data-node-id]') as HTMLElement | null
      const targetId = targetNode?.getAttribute('data-node-id')
      if (targetId) addEdge(linking.from, targetId, linking.handle)
      setLinking(null)
      setLinkCursor(null)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
  }, [linking, addEdge, clientToContent])

  const handleAddStep = (type: ActionType) => {
    if (!selectedSequenceId) {
      toast.error('Select a sequence first')
      return
    }
    const last = steps[steps.length - 1]
    const newPosition = last?.position
      ? { x: last.position!.x + NODE_WIDTH + 70, y: last.position!.y }
      : { x: 50, y: 100 }

    const params = defaultParamsForType(type, { customPort })
    if (type === 'EDGE_BLOCK') {
      params.edgeBlockName = edgeSession.blocks[0]?.name ?? ''
    }
    if (type === 'EDGE_PROCESS') {
      params.edgeProcessName = edgeSession.processes[0]?.name ?? ''
    }
    const newStep: AutomationStep = {
      id: crypto.randomUUID(),
      type,
      name: DEFAULT_STEP_NAMES[type],
      position: newPosition,
      params,
    }
    updateStepsForSequence(selectedSequenceId, (prev) => [...prev, newStep])
    setSelectedStepId(newStep.id)
    setConfigDialogOpen(true)
    setContentSize((prev) => ({
      width: Math.max(prev.width, newPosition.x + NODE_WIDTH + 50),
      height: Math.max(prev.height, newPosition.y + NODE_HEIGHT + 50),
    }))
  }

  const handleUpdateStep = (id: string, updates: Partial<AutomationStep>) => {
    if (!selectedSequenceId) return
    updateStepsForSequence(selectedSequenceId, prev =>
      prev.map(s => s.id === id ? { ...s, ...updates } : s)
    )
  }

  const handleUpdateParams = (id: string, updates: Partial<AutomationStep['params']>) => {
    if (!selectedSequenceId) return
    updateStepsForSequence(selectedSequenceId, prev =>
      prev.map(s => s.id === id ? { ...s, params: { ...s.params, ...updates } } : s)
    )
  }

  const handleDeleteStep = (id: string) => {
    if (!selectedSequenceId) return
    // Remove the node and any edges connected to it in a single update.
    setSequences(prev => prev.map(seq => {
      if (seq.id !== selectedSequenceId) return seq
      const edges = seq.edges ?? deriveLinearEdges(seq.steps)
      return {
        ...seq,
        steps: seq.steps.filter(s => s.id !== id),
        edges: edges.filter(e => e.from !== id && e.to !== id),
      }
    }))
    if (selectedStepId === id) {
      setSelectedStepId(null)
      setConfigDialogOpen(false)
    }
  }

  /** Reconnect all nodes into a left-to-right chain based on their X position. */
  const handleAutoLink = () => {
    if (!selectedSequenceId) return
    const ordered = [...steps].sort((a, b) => (a.position?.x ?? 0) - (b.position?.x ?? 0))
    updateEdgesForSequence(selectedSequenceId, () => deriveLinearEdges(ordered))
    toast.success('Nodes linked left-to-right')
  }

  /** Remove every connection in the selected sequence. */
  const handleClearLinks = () => {
    if (!selectedSequenceId) return
    updateEdgesForSequence(selectedSequenceId, () => [])
    toast.success('All links cleared')
  }

  const handleAddSequence = () => {
    const newSeq: AutomationSequence = {
      id: crypto.randomUUID(),
      name: `Sequence ${sortedSeqs.length + 1}`,
      order: sortedSeqs.length,
      steps: [],
      edges: [],
    }
    setSequences(prev => normalizeSequences([...prev, newSeq]))
    setSelectedSequenceId(newSeq.id)
  }

  const handleDeleteSequenceClick = (seqId: string) => {
    const seq = sortedSeqs.find(s => s.id === seqId)
    if (seq) setDeleteConfirmSeq(seq)
  }

  const handleDeleteSequenceConfirm = () => {
    if (!deleteConfirmSeq) return
    const seqId = deleteConfirmSeq.id
    const next = sequences.filter(s => s.id !== seqId)
    const normalized = normalizeSequences(next)
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
    setSequences(prev => prev.map(s => s.id === seqId ? { ...s, name: trimmed } : s))
    setEditingSeqId(null)
  }

  const startRenameSequence = (seq: AutomationSequence) => {
    setEditingSeqId(seq.id)
    setEditingSeqName(seq.name)
  }

  const handleCloneSequence = (seqId: string) => {
    const seq = sortedSeqs.find(s => s.id === seqId)
    if (!seq) return
    // Remap step ids and re-point edges at the new ids so links survive the clone.
    const idMap = new Map<string, string>()
    const clonedSteps: AutomationStep[] = seq.steps.map(s => {
      const newId = crypto.randomUUID()
      idMap.set(s.id, newId)
      return { ...s, id: newId, position: s.position ? { ...s.position } : undefined }
    })
    const sourceEdges = seq.edges ?? deriveLinearEdges(seq.steps)
    const clonedEdges: AutomationEdge[] = sourceEdges
      .filter(e => idMap.has(e.from) && idMap.has(e.to))
      .map(e => ({ id: crypto.randomUUID(), from: idMap.get(e.from)!, to: idMap.get(e.to)!, sourceHandle: e.sourceHandle }))
    const newSeq: AutomationSequence = {
      id: crypto.randomUUID(),
      name: `${seq.name} (copy)`,
      order: sortedSeqs.length,
      steps: clonedSteps,
      edges: clonedEdges,
    }
    setSequences(prev => normalizeSequences([...prev, newSeq]))
    setSelectedSequenceId(newSeq.id)
  }

  const handleSequencesReorder = useCallback((newOrder: AutomationSequence[]) => {
    const withOrder = newOrder.map((s, i) => ({ ...s, order: i }))
    setSequences(withOrder)
  }, [setSequences])

  const handleReorderSequence = (seqId: string, direction: 'up' | 'down') => {
    const idx = sortedSeqs.findIndex(s => s.id === seqId)
    if (idx < 0) return
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1
    if (swapIdx < 0 || swapIdx >= sortedSeqs.length) return
    const reordered = [...sortedSeqs]
    ;[reordered[idx], reordered[swapIdx]] = [reordered[swapIdx], reordered[idx]]
    setSequences(reordered.map((s, i) => ({ ...s, order: i })))
  }

  const handleConfigureNode = (stepId: string) => {
    setSelectedStepId(stepId)
    setConfigDialogOpen(true)
  }

  const handleCanvasPanStart = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).hasAttribute('data-pan-background')) {
      panStartRef.current = { x: e.clientX, y: e.clientY, startPanX: canvasPan.x, startPanY: canvasPan.y }
    }
  }, [canvasPan])

  const handleCanvasWheel = useCallback((e: React.WheelEvent) => {
    if (!canvasRef.current?.contains(e.target as Node)) return
    e.preventDefault()
    const delta = e.deltaY > 0 ? -0.1 : 0.1
    setCanvasZoom(z => Math.min(2, Math.max(0.25, z + delta)))
  }, [])

  const handleZoomIn = () => setCanvasZoom(z => Math.min(2, z + 0.25))
  const handleZoomOut = () => setCanvasZoom(z => Math.max(0.25, z - 0.25))
  const handleZoomReset = () => setCanvasZoom(1)

  useEffect(() => {
    const onMouseUp = () => panStartRef.current = null
    const onMouseMove = (e: MouseEvent) => {
      if (panStartRef.current) {
        setCanvasPan({
          x: panStartRef.current.startPanX + e.clientX - panStartRef.current.x,
          y: panStartRef.current.startPanY + e.clientY - panStartRef.current.y,
        })
      }
    }
    window.addEventListener('mouseup', onMouseUp)
    window.addEventListener('mousemove', onMouseMove)
    return () => {
      window.removeEventListener('mouseup', onMouseUp)
      window.removeEventListener('mousemove', onMouseMove)
    }
  }, [])

  const executeStep = async (step: AutomationStep, signal: AbortSignal) => {
    if (signal.aborted) throw new Error('Aborted')

    switch (step.type) {
      case 'DELAY':
        addLog(`Waiting ${step.params.duration}ms...`)
        await new Promise(resolve => setTimeout(resolve, step.params.duration))
        break

      case 'OCR': {
        addLog(`Sending OCR message...`)
        if (!host) throw new Error('Host not configured')
        const ocrMsg = applyTemplate(step.params.message || '', runVarsRef.current)
        await new Promise<void>((resolve, reject) => {
          ocrClient.sendMessage(host, ocrMsg, 
            (msg) => {
              runVarsRef.current.lastOcrResponse = msg
              addLog(`OCR Success: ${msg}`)
              resolve()
            },
            (err) => { addLog(`OCR Error: ${err}`); reject(new Error(err)) }
          )
        })
        break
      }

      case 'CUSTOM_MESSAGE': {
        addLog(`Sending custom message...`)
        if (!host) throw new Error('Host not configured')
        const portStr = step.params.port || customPort
        const portNum = parseInt(portStr)
        if (isNaN(portNum) || portNum <= 0 || portNum > 65535) {
          throw new Error(`Invalid port: ${portStr}`)
        }
        if (!step.params.message?.trim()) {
          throw new Error('Message is empty')
        }
        const customMsg = applyTemplate(step.params.message || '', runVarsRef.current)
        await new Promise<void>((resolve, reject) => {
          customClient.sendMessage(host, portNum, customMsg,
            (msg) => { addLog(`Custom Success: ${msg}`); resolve() },
            (err) => { addLog(`Custom Error: ${err}`); reject(new Error(err)) }
          )
        })
        break
      }

      case 'FIXED_TAG': {
        addLog(`Emulating Fixed Tag...`)
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

        const getTagRssi = makeRssiPicker(step.params)
        if (upcList) {
            const expanded = expandUpcListToEpcs(
              upcList,
              step.params.startSerial ?? 1,
              step.params.serialContinuesAcrossUpcLines === true,
            )
            for (const { epc, customTid } of expanded) {
              for (const targetUid of targetUids) {
                for (const ant of stepAntennas) {
                  fixedTags.push({
                    epc,
                    tid: customTid || step.params.tid || epc,
                    uid: targetUid,
                    antenna: ant,
                    rssi: getTagRssi(),
                  })
                }
              }
            }
        }

        // Parse EPC List (EPC or EPC,TID - one per line, TID optional)
        if (epcList) {
            const lines = epcList.split('\n')
            for (const line of lines) {
                const parts = line.split(',')
                const epc = parts[0]?.trim()
                const customTid = parts[1]?.trim()
                if (epc) {
                    for (const targetUid of targetUids) {
                      for (const ant of stepAntennas) {
                        fixedTags.push({
                            epc,
                            tid: customTid || step.params.tid || epc,
                            uid: targetUid,
                            antenna: ant,
                            rssi: getTagRssi()
                        })
                      }
                    }
                }
            }
        }

        // Fallback for legacy single fields
        if (fixedTags.length === 0 && (singleUpc || singleEpc)) {
             if (singleUpc) {
                const epcs = EPCGenerator.generateFromUpc(
                    singleUpc, 
                    step.params.count || 1, 
                    step.params.startSerial || 1
                )
                for (const targetUid of targetUids) {
                  for (const epc of epcs) {
                    for (const ant of stepAntennas) {
                      fixedTags.push({
                          epc,
                          tid: step.params.tid || epc,
                          uid: targetUid,
                          antenna: ant,
                          rssi: getTagRssi()
                      })
                    }
                  }
                }
             } else if (singleEpc) {
                for (const targetUid of targetUids) {
                  for (const ant of stepAntennas) {
                    fixedTags.push({
                        epc: singleEpc,
                        tid: step.params.tid || singleEpc,
                        uid: targetUid,
                        antenna: ant,
                        rssi: getTagRssi()
                    })
                  }
                }
             }
        }
        
        if (fixedTags.length === 0) throw new Error('No valid EPCs or UPCs specified')

        captureEpcsToVars(runVarsRef.current, fixedTags.map((t) => t.epc))
        addLog(`Captured ${runVarsRef.current.tagCount} EPC(s) → {{epcs}}`)

        const tagDelayMs = parseInt(step.params.tagDelay?.trim() || delay, 10) || 20
        await emulator.sendTags(fixedTags, step.params.driver || 'llrp', tagDelayMs, 
          (msg) => addLog(`Fixed: ${msg}`),
          (msg) => addLog(`Fixed Complete: ${msg}`)
        )
        break
      }

      case 'HANDHELD_TAG': {
        addLog(`Emulating Handheld Tags...`)
        const getHhTagRssi = makeRssiPicker(step.params)
        const allHhTags: { epc: string; tid?: string; rssi?: string }[] = []
        const vars = runVarsRef.current
        const upcList = applyTemplate(step.params.upcList || '', vars)
        const epcList = applyTemplate(step.params.epcList || '', vars)

        // Parse UPC List
        if (upcList) {
            const expanded = expandUpcListToEpcs(
              upcList,
              step.params.startSerial ?? 1,
              step.params.serialContinuesAcrossUpcLines === true,
            )
            allHhTags.push(
              ...expanded.map(({ epc, customTid }) => ({
                epc,
                tid: customTid || step.params.tid || epc,
                rssi: getHhTagRssi(),
              })),
            )
        }

        // Add Direct EPCs (EPC or EPC,TID - one per line, TID optional)
        if (epcList) {
            const lines = epcList.split('\n')
            for (const line of lines) {
                const parts = line.split(',')
                const epc = parts[0]?.trim()
                const customTid = parts[1]?.trim()
                if (epc) {
                    allHhTags.push({
                        epc,
                        tid: customTid || step.params.tid || epc,
                        rssi: getHhTagRssi()
                    })
                }
            }
        }
        
        if (allHhTags.length === 0) throw new Error('No EPCs specified')

        captureEpcsToVars(runVarsRef.current, allHhTags.map((t) => t.epc))
        addLog(`Captured ${runVarsRef.current.tagCount} EPC(s) → {{epcs}}`)
        
        const isRunning = await handheldServer.isRunning()
        if (!isRunning) {
            addLog("Starting Handheld server...")
            handheldServer.start((msg) => addLog(msg), (err) => addLog(`HH Error: ${err}`))
            // Give it a moment to start
            await new Promise(resolve => setTimeout(resolve, 500))
        }

        const hhVerbose = getHandheldFullActivityLog()
        await handheldServer.sendEpcs(
          allHhTags,
          parseInt(handheldDelay, 10) || 20,
          (msg) => {
            if (hhVerbose) addLog(`HH: ${msg}`)
          },
          (msg) => addLog(`HH Complete: ${msg}`),
          hhVerbose
        )
        break
      }

      case 'EDGE_BLOCK': {
        if (!edgeSession.edgeReady) {
          throw new Error('Edge API not ready — connect to Edge IP first')
        }
        const blockName = step.params.edgeBlockName?.trim()
        if (!blockName) throw new Error('Edge block not configured')
        const raw = step.params.edgeParams ?? {}
        const order =
          step.params.edgeParamOrder?.filter((k) => k in raw) ??
          Object.keys(raw)
        const invokeParams: Record<string, unknown> = {}
        for (const k of order) invokeParams[k] = raw[k] ?? ''
        for (const [k, v] of Object.entries(raw)) {
          if (!(k in invokeParams)) invokeParams[k] = v
        }
        const paramOrder =
          order.length > 0 ? order : Object.keys(invokeParams)
        addLog(`Edge invoke → ${blockName}`)
        const { status, response } = await edgeSession.invokeBlock(
          blockName,
          invokeParams,
          paramOrder,
        )
        const preview = response?.trim()
          ? response.trim().slice(0, 300) + (response.length > 300 ? '…' : '')
          : '(empty)'
        addLog(`Edge block OK (HTTP ${status}): ${preview}`)
        break
      }

      case 'EDGE_PROCESS': {
        if (!edgeSession.edgeReady) {
          throw new Error('Edge API not ready — connect to Edge IP first')
        }
        const processName = step.params.edgeProcessName?.trim()
        if (!processName) throw new Error('Edge process not configured')
        const action = step.params.edgeProcessAction ?? 'start'
        addLog(`Edge ${action} → ${processName}`)
        if (action === 'stop') {
          await edgeSession.stopProcess(processName)
        } else {
          await edgeSession.startProcess(processName)
        }
        addLog(`Edge process ${action} OK: ${processName}`)
        break
      }

      case 'SET_VARIABLE':
        await executeSetVariable(step, runVarsRef.current, addLog)
        break
      case 'DB_QUERY':
        await executeDbQuery(step, runVarsRef.current, addLog)
        break
      case 'DB_EXEC':
        await executeDbExec(step, runVarsRef.current, addLog)
        break
      case 'RUN_SCRIPT':
        await executeRunScript(step, runVarsRef.current, addLog)
        break
      case 'HTTP_REQUEST':
        await executeHttpRequest(step, runVarsRef.current, addLog)
        break

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

      // CONDITION (routing) and CALL_SEQUENCE (recursion) are handled by the graph
      // runner itself, not here — they need access to edges / other sequences.
      case 'CONDITION':
      case 'CALL_SEQUENCE':
        break
    }
  }

  /**
   * Run one sequence as a directed graph: start at the node(s) with no incoming
   * edge (left-to-right) and follow edges. CONDITION nodes route through their
   * `true`/`false` port; CALL_SEQUENCE recurses into another sequence (sharing the
   * run variables); every other node uses its single `out` port. A step counter
   * guards cyclic edges, and `callStack` guards recursive sequence calls.
   */
  const runSequenceGraph = async (
    seq: AutomationSequence,
    signal: AbortSignal,
    callStack: Set<string> = new Set(),
  ) => {
    const steps = seq.steps
    if (steps.length === 0) return
    if (callStack.has(seq.id)) {
      addLog(`Skipped recursive call to "${seq.name}"`)
      return
    }
    const stack = new Set(callStack).add(seq.id)
    if (stack.size > MAX_CALL_DEPTH) {
      addLog(`Stopped: sequence call nesting exceeded ${MAX_CALL_DEPTH}`)
      return
    }

    const seqEdges = seq.edges ?? deriveLinearEdges(steps)
    const byId = new Map(steps.map(s => [s.id, s]))
    // A self-loop (from === to) doesn't count as "having an incoming edge" for root
    // detection — otherwise a node that's the natural start of the graph but also
    // loops on itself would be wrongly excluded from the roots.
    const hasIncoming = new Set(seqEdges.filter(e => e.from !== e.to).map(e => e.to))
    const roots = steps
      .filter(s => !hasIncoming.has(s.id))
      .sort((a, b) => (a.position?.x ?? 0) - (b.position?.x ?? 0))
    // Pure-cycle fallback (no root): start at the first node so the run isn't a no-op.
    const startNodes = roots.length > 0 ? roots : [steps[0]]

    for (const root of startNodes) {
      if (signal.aborted) break
      let current: AutomationStep | null = root
      let guard = 0
      while (current && !signal.aborted) {
        if (++guard > MAX_GRAPH_STEPS) {
          addLog(`Stopped: exceeded ${MAX_GRAPH_STEPS} steps (possible infinite loop)`)
          break
        }
        setCurrentRunningStepId(current.id)
        let handle = 'out'
        if (current.type === 'CONDITION') {
          const pass = evaluateCondition(current.params, runVarsRef.current)
          addLog(`◇ ${current.name}: ${pass ? 'TRUE' : 'FALSE'} → ${pass ? 'true' : 'false'} branch`)
          handle = pass ? 'true' : 'false'
        } else if (current.type === 'CALL_SEQUENCE') {
          try {
            const target = sortedSeqs.find(s => s.id === current!.params.callSequenceId)
            if (!target) throw new Error('Call Sequence: no target selected (or it was deleted)')
            addLog(`↳ Call "${target.name}"`)
            await runSequenceGraph(target, signal, stack)
            if (signal.aborted) return
            addLog(`↩ Return from "${target.name}"`)
          } catch (error: any) {
            addLog(`Error at "${current.name}": ${error.message}`)
            if (error.message === 'Aborted') return
            throw error
          }
        } else {
          try {
            await executeStep(current, signal)
          } catch (error: any) {
            addLog(`Error at "${current.name}": ${error.message}`)
            if (error.message === 'Aborted') return
            throw error
          }
        }
        // Surface the latest variable values to the live inspector.
        setRunVars({ ...runVarsRef.current })
        const nextEdge = seqEdges.find(e => e.from === current!.id && (e.sourceHandle ?? 'out') === handle)
        current = nextEdge ? byId.get(nextEdge.to) ?? null : null
      }
    }
  }

  const handleRun = async () => {
    const allSteps = sortedSeqs.flatMap(s => s.steps)
    if (allSteps.length === 0) {
      toast.error('Add steps to sequences first')
      return
    }

    setIsRunning(true)
    setLog([])
    addLog('Starting automation...')
    runVarsRef.current = createRunContext({
      host,
      alePort,
      customPort,
      port: '',
    })
    setRunVars({ ...runVarsRef.current })

    abortControllerRef.current = new AbortController()
    const signal = abortControllerRef.current.signal

    const useDuration = runMode === 'duration'
    const durationSec = Math.max(1, parseInt(runDurationSeconds) || 300)
    const endTime = useDuration ? Date.now() + durationSec * 1000 : 0

    const loops = useDuration ? Infinity : (loopCount === 'Inf' ? Infinity : parseInt(loopCount) || 1)
    let loopNum = 0

    // Sequences used purely as sub-routines (targets of a Call Sequence node) don't
    // auto-run at the top level — they run only when called. If that would leave
    // nothing to run (e.g. mutually-calling sequences), fall back to running them all.
    const calledIds = new Set<string>()
    for (const s of sortedSeqs) {
      for (const st of s.steps) {
        if (st.type === 'CALL_SEQUENCE' && st.params.callSequenceId) calledIds.add(st.params.callSequenceId)
      }
    }
    const topLevelSeqs = sortedSeqs.filter(s => !calledIds.has(s.id))
    const runnableSeqs = topLevelSeqs.length > 0 ? topLevelSeqs : sortedSeqs

    try {
      for (let i = 0; i < loops; i++) {
        if (signal.aborted) break
        if (useDuration && Date.now() >= endTime) {
          addLog(`Duration (${durationSec}s) reached. Stopping.`)
          break
        }
        loopNum++
        if (loops > 1 || useDuration) addLog(`--- Loop ${loopNum}${useDuration ? ` (${Math.max(0, Math.ceil((endTime - Date.now()) / 1000))}s left)` : `/${loops === Infinity ? '∞' : loops}`} ---`)

        for (let seqIdx = 0; seqIdx < runnableSeqs.length; seqIdx++) {
          if (signal.aborted) break
          const seq = runnableSeqs[seqIdx]
          if (seq.steps.length === 0) continue
          addLog(`▶ Sequence ${seqIdx + 1}: ${seq.name}`)
          setCurrentSequenceIndex(seqIdx)
          await runSequenceGraph(seq, signal)
        }
      }
      addLog('Automation completed successfully')
    } catch (error: any) {
      if (error.message !== 'Aborted') {
        addLog(`Automation failed: ${error.message}`)
        toast.error('Automation failed')
      } else {
        addLog('Automation stopped by user')
      }
    } finally {
      setIsRunning(false)
      setCurrentSequenceIndex(null)
      setCurrentRunningStepId(null)
      abortControllerRef.current = null
    }
  }

  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      emulator.cancelSend()
      handheldServer.cancelSend()
    }
  }

  const WORKFLOW_FILE_VERSION = 1
  const handleExportWorkflow = () => {
    const payload = {
      version: WORKFLOW_FILE_VERSION,
      exportedAt: new Date().toISOString(),
      sequences: sortedSeqs.map(s => ({
        ...s,
        steps: s.steps.map(st => ({
          ...st,
          position: st.position ?? { x: 0, y: 0 },
        })),
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
        const raw = JSON.parse(reader.result as string)
        let seqs: AutomationSequence[] = []
        if (raw.sequences && Array.isArray(raw.sequences)) {
          seqs = raw.sequences
        } else if (Array.isArray(raw)) {
          seqs = raw
        } else if (raw.steps && Array.isArray(raw.steps)) {
          seqs = migrateStepsToSequences(raw.steps)
        } else {
          toast.error('Invalid workflow file format')
          return
        }
        const validTypes: ActionType[] = [...ALL_ACTION_TYPES]
        const normalized = normalizeSequences(seqs.map((s: any) => {
          // Regenerate step ids, tracking old→new so we can re-point any edges.
          const idMap = new Map<string, string>()
          const steps: AutomationStep[] = (s.steps || []).map((st: any) => {
            const newId = crypto.randomUUID()
            if (typeof st.id === 'string') idMap.set(st.id, newId)
            return {
              id: newId,
              type: validTypes.includes(st.type) ? st.type : 'DELAY',
              name: String(st.name || 'Step').slice(0, 100),
              position: Array.isArray(st.position) ? { x: st.position[0] ?? 0, y: st.position[1] ?? 0 } : (st.position && typeof st.position.x === 'number' ? st.position : { x: 0, y: 0 }),
              params: typeof st.params === 'object' && st.params !== null ? st.params : {},
            }
          })
          // Preserve saved connections when present; otherwise let normalize derive a linear chain.
          const edges: AutomationEdge[] | undefined = Array.isArray(s.edges)
            ? s.edges
                .filter((e: any) => e && idMap.has(e.from) && idMap.has(e.to))
                .map((e: any) => ({
                  id: crypto.randomUUID(),
                  from: idMap.get(e.from)!,
                  to: idMap.get(e.to)!,
                  sourceHandle: typeof e.sourceHandle === 'string' ? e.sourceHandle : 'out',
                }))
            : undefined
          return {
            id: crypto.randomUUID(),
            name: String(s.name || 'Imported').slice(0, 100),
            order: typeof s.order === 'number' ? s.order : 0,
            steps,
            edges,
          }
        }))
        setSequences(prev => [...prev, ...normalized])
        toast.success(`Imported ${normalized.length} sequence(s)`)
      } catch (err) {
        console.error('Import failed:', err)
        toast.error('Failed to parse workflow file')
      }
    }
    reader.readAsText(file, 'UTF-8')
  }

  const [addMenuOpen, setAddMenuOpen] = useState(false)
  const addNodeBtnRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!addMenuOpen) return
    const close = () => setAddMenuOpen(false)
    const timer = setTimeout(() => window.addEventListener('click', close), 0)
    return () => {
      clearTimeout(timer)
      window.removeEventListener('click', close)
    }
  }, [addMenuOpen])

  return (
    <div className="stagger-children h-full flex flex-col gap-0 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/50 bg-card/50">
        <div className="flex items-center gap-3">
          <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-green-500/20 text-green-600 dark:text-green-400 border border-green-500/40">
            ACTIVE
          </span>
          <span className="font-semibold text-sm tracking-wide text-muted-foreground">WORKFLOW BUILDER</span>
        </div>
        <div className="relative">
          <Button
            ref={addNodeBtnRef}
            size="sm"
            onClick={(e) => {
              e.stopPropagation()
              setAddMenuOpen((open) => !open)
            }}
          >
            <Plus className="w-4 h-4 mr-2" />
            ADD NODE
            <ChevronDown className="w-4 h-4 ml-1" />
          </Button>
          <PortaledAnchoredMenu
            anchorRef={addNodeBtnRef}
            open={addMenuOpen}
            fitContent
            className="py-1 rounded-lg border border-border bg-popover text-popover-foreground shadow-lg min-w-[200px]"
            onClick={(e) => e.stopPropagation()}
          >
            <button className="w-full px-4 py-2 text-left text-sm hover:bg-accent flex items-center gap-2 focus:outline-none select-none" onClick={() => { handleAddStep('DELAY'); setAddMenuOpen(false) }}>
              <Clock className="w-4 h-4 text-amber-500" /> Delay
            </button>
            <button className="w-full px-4 py-2 text-left text-sm hover:bg-accent flex items-center gap-2 focus:outline-none select-none" onClick={() => { handleAddStep('OCR'); setAddMenuOpen(false) }}>
              <ScanLine className="w-4 h-4 text-pink-500" /> OCR
            </button>
            <button className="w-full px-4 py-2 text-left text-sm hover:bg-accent flex items-center gap-2 focus:outline-none select-none" onClick={() => { handleAddStep('FIXED_TAG'); setAddMenuOpen(false) }}>
              <Radio className="w-4 h-4 text-blue-500" /> Fixed Reader
            </button>
            <button className="w-full px-4 py-2 text-left text-sm hover:bg-accent flex items-center gap-2 focus:outline-none select-none" onClick={() => { handleAddStep('HANDHELD_TAG'); setAddMenuOpen(false) }}>
              <Smartphone className="w-4 h-4 text-emerald-500" /> Handheld
            </button>
            <button className="w-full px-4 py-2 text-left text-sm hover:bg-accent flex items-center gap-2 focus:outline-none select-none" onClick={() => { handleAddStep('CUSTOM_MESSAGE'); setAddMenuOpen(false) }}>
              <Terminal className="w-4 h-4 text-violet-500" /> Custom Message
            </button>
            <div className="my-1 border-t border-border/60" />
            <p className="px-4 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Building blocks
            </p>
            <button className="w-full px-4 py-2 text-left text-sm hover:bg-accent flex items-center gap-2 focus:outline-none select-none" onClick={() => { handleAddStep('SET_VARIABLE'); setAddMenuOpen(false) }}>
              <Variable className="w-4 h-4 text-orange-500" /> Set Variable
            </button>
            <button className="w-full px-4 py-2 text-left text-sm hover:bg-accent flex items-center gap-2 focus:outline-none select-none" onClick={() => { handleAddStep('DB_QUERY'); setAddMenuOpen(false) }}>
              <Database className="w-4 h-4 text-indigo-500" /> Database Query
            </button>
            <button className="w-full px-4 py-2 text-left text-sm hover:bg-accent flex items-center gap-2 focus:outline-none select-none" onClick={() => { handleAddStep('DB_EXEC'); setAddMenuOpen(false) }}>
              <Server className="w-4 h-4 text-indigo-500" /> SQL Statement (any)
            </button>
            <button className="w-full px-4 py-2 text-left text-sm hover:bg-accent flex items-center gap-2 focus:outline-none select-none" onClick={() => { handleAddStep('HTTP_REQUEST'); setAddMenuOpen(false) }}>
              <Globe className="w-4 h-4 text-rose-500" /> HTTP Request
            </button>
            <button className="w-full px-4 py-2 text-left text-sm hover:bg-accent flex items-center gap-2 focus:outline-none select-none" onClick={() => { handleAddStep('RUN_SCRIPT'); setAddMenuOpen(false) }}>
              <FileCode2 className="w-4 h-4 text-lime-500" /> Run Script
            </button>
            <div className="my-1 border-t border-border/60" />
            <p className="px-4 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Flow control
            </p>
            <button className="w-full px-4 py-2 text-left text-sm hover:bg-accent flex items-center gap-2 focus:outline-none select-none" onClick={() => { handleAddStep('CONDITION'); setAddMenuOpen(false) }}>
              <GitBranch className="w-4 h-4 text-fuchsia-500" /> Condition (if / branch)
            </button>
            <button className="w-full px-4 py-2 text-left text-sm hover:bg-accent flex items-center gap-2 focus:outline-none select-none" onClick={() => { handleAddStep('CALL_SEQUENCE'); setAddMenuOpen(false) }}>
              <Network className="w-4 h-4 text-purple-500" /> Call Sequence
            </button>
            <button className="w-full px-4 py-2 text-left text-sm hover:bg-accent flex items-center gap-2 focus:outline-none select-none" onClick={() => { handleAddStep('LOG'); setAddMenuOpen(false) }}>
              <FileText className="w-4 h-4 text-sky-500" /> Log Message
            </button>
            <div className="my-1 border-t border-border/60" />
            <p className="px-4 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Edge API
            </p>
            <button className="w-full px-4 py-2 text-left text-sm hover:bg-accent flex items-center gap-2 focus:outline-none select-none" onClick={() => { handleAddStep('EDGE_BLOCK'); setAddMenuOpen(false) }}>
              <Box className="w-4 h-4 text-cyan-500" /> Invoke block
            </button>
            <button className="w-full px-4 py-2 text-left text-sm hover:bg-accent flex items-center gap-2 focus:outline-none select-none" onClick={() => { handleAddStep('EDGE_PROCESS'); setAddMenuOpen(false) }}>
              <Workflow className="w-4 h-4 text-teal-500" /> Start / stop process
            </button>
          </PortaledAnchoredMenu>
        </div>
      </div>

      {/* Main: Sequence list + Canvas + Execution */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* Sequence list (left) */}
        <div className="w-72 shrink-0 flex flex-col border-r border-border/50 bg-card/50 min-w-0" data-tour="tour-automation-sequences">
          <div className="px-3 py-2 border-b border-border/50 flex items-center justify-between gap-1">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5 shrink-0">
              <ListOrdered className="h-3.5 w-3.5" /> Sequences
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
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => importInputRef.current?.click()}>
                    <Upload className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Import workflow</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleExportWorkflow} disabled={sortedSeqs.length === 0}>
                    <Download className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Export workflow</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleAddSequence}>
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Add sequence</TooltipContent>
              </Tooltip>
            </div>
          </div>
          <div className="flex-1 min-h-0 overflow-auto py-2">
            <div className="space-y-0.5 px-2">
              {sortedSeqs.length === 0 ? (
                <div className="py-8 px-4 text-center">
                  <p className="text-sm text-muted-foreground mb-3">No sequences yet</p>
                  <Button variant="outline" size="sm" onClick={handleAddSequence} className="w-full">
                    <Plus className="h-3.5 w-3.5 mr-1.5" />
                    Add Sequence
                  </Button>
                </div>
              ) : (
                <Reorder.Group axis="y" values={sortedSeqs} onReorder={handleSequencesReorder} className="space-y-0.5" as="div">
                  {sortedSeqs.map((seq, idx) => (
                    <Reorder.Item
                      key={seq.id}
                      value={seq}
                      layout
                      as="div"
                      className="cursor-grab active:cursor-grabbing relative"
                    >
                      <div
                        className={`group flex items-center gap-1.5 rounded-lg px-2.5 py-2 cursor-pointer transition-colors min-w-0 ${
                          selectedSequenceId === seq.id ? 'bg-primary/15 text-primary border border-primary/30' : 'hover:bg-muted/60'
                        }`}
                        onClick={() => { if (editingSeqId !== seq.id) setSelectedSequenceId(seq.id) }}
                        onDoubleClick={() => startRenameSequence(seq)}
                      >
                        <GripVertical className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        <span className="text-xs font-medium shrink-0 w-5">{idx + 1}.</span>
                        {editingSeqId === seq.id ? (
                          <Input
                            value={editingSeqName}
                            onChange={(e) => setEditingSeqName(e.target.value)}
                            onBlur={() => handleRenameSequence(seq.id, editingSeqName)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleRenameSequence(seq.id, editingSeqName)
                              if (e.key === 'Escape') setEditingSeqId(null)
                            }}
                            className="h-7 text-sm flex-1 min-w-0"
                            onClick={(e) => e.stopPropagation()}
                            autoFocus
                          />
                        ) : (
                          <span className="flex-1 min-w-0 truncate text-sm font-medium">{seq.name}</span>
                        )}
                        <span className="text-[10px] text-muted-foreground shrink-0">{seq.steps.length}</span>
                        <div className={`flex gap-0.5 shrink-0 transition-opacity ${selectedSequenceId === seq.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                type="button"
                                className="p-0.5 rounded hover:bg-muted focus:outline-none select-none"
                                onClick={(e) => { e.stopPropagation(); handleCloneSequence(seq.id) }}
                              >
                                <Copy className="h-3 w-3" />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent side="right">Clone sequence</TooltipContent>
                          </Tooltip>
                          {sortedSeqs.length > 1 && (
                            <>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <button
                                    type="button"
                                    className="p-0.5 rounded hover:bg-muted disabled:opacity-40 focus:outline-none select-none"
                                    onClick={(e) => { e.stopPropagation(); handleReorderSequence(seq.id, 'up') }}
                                    disabled={idx === 0}
                                  >
                                    <ChevronUp className="h-3 w-3" />
                                  </button>
                                </TooltipTrigger>
                                <TooltipContent side="right">Move up</TooltipContent>
                              </Tooltip>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <button
                                    type="button"
                                    className="p-0.5 rounded hover:bg-muted disabled:opacity-40 focus:outline-none select-none"
                                    onClick={(e) => { e.stopPropagation(); handleReorderSequence(seq.id, 'down') }}
                                    disabled={idx === sortedSeqs.length - 1}
                                  >
                                    <ChevronDown className="h-3 w-3" />
                                  </button>
                                </TooltipTrigger>
                                <TooltipContent side="right">Move down</TooltipContent>
                              </Tooltip>
                            </>
                          )}
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                type="button"
                                className="p-0.5 rounded hover:bg-destructive/20 text-destructive focus:outline-none select-none"
                                onClick={(e) => { e.stopPropagation(); handleDeleteSequenceClick(seq.id) }}
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent side="right">Delete sequence</TooltipContent>
                          </Tooltip>
                        </div>
                      </div>
                    </Reorder.Item>
                  ))}
                </Reorder.Group>
              )}
            </div>
          </div>
        </div>

        {/* Workflow Canvas */}
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden relative">
          {/* Link tools (top-left) */}
          <div className="absolute top-3 left-3 z-10 flex items-center gap-0.5 rounded-lg border border-border/50 bg-card/90 px-1 py-1 shadow-sm">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={handleAutoLink}
                  disabled={isRunning || steps.length < 2}
                >
                  <Spline className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Auto-link nodes left-to-right</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={handleClearLinks}
                  disabled={isRunning || edges.length === 0}
                >
                  <Link2Off className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Clear all links</TooltipContent>
            </Tooltip>
          </div>
          {/* Zoom controls */}
          <div className="absolute bottom-3 right-3 z-10 flex items-center gap-0.5 rounded-lg border border-border/50 bg-card/90 px-1 py-1 shadow-sm">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleZoomOut}>
                  <ZoomOut className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">Zoom out</TooltipContent>
            </Tooltip>
            <span className="text-xs font-medium w-10 text-center tabular-nums">{Math.round(canvasZoom * 100)}%</span>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleZoomIn}>
                  <ZoomIn className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">Zoom in</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleZoomReset}>
                  <RotateCcw className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">Reset zoom</TooltipContent>
            </Tooltip>
          </div>
          <div
            ref={canvasRef}
            className="relative flex-1 min-h-[400px] overflow-hidden rounded-xl border border-border/30 bg-background/40 cursor-grab active:cursor-grabbing"
            data-tour="tour-automation-canvas"
            role="region"
            aria-label="Workflow canvas"
            tabIndex={0}
            onMouseDown={handleCanvasPanStart}
            onWheel={handleCanvasWheel}
            style={{ minHeight: 400 }}
          >
            <div
              className="relative origin-top-left"
              style={{
                minWidth: contentSize.width,
                minHeight: contentSize.height,
                transform: `translate(${canvasPan.x}px, ${canvasPan.y}px) scale(${canvasZoom})`,
              }}
            >
              {/* Pan background - drag to pan canvas */}
              <div
                data-pan-background
                className="absolute inset-0 z-0"
                style={{ minWidth: contentSize.width, minHeight: contentSize.height }}
              />
              {steps.length === 0 && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="text-center text-muted-foreground text-sm border-2 border-dashed border-border/50 rounded-xl p-8 bg-card/50 max-w-[280px]">
                    {!selectedSequenceId ? (
                      <>Select a sequence from the list, or add one with the <strong>+</strong> button.</>
                    ) : (
                      <>No nodes yet.<br />Click <strong>ADD NODE</strong> to start.</>
                    )}
                  </div>
                </div>
              )}

              {/* SVG connections (explicit edges) + live link preview */}
              <svg
                className="absolute top-0 left-0 pointer-events-none"
                width={contentSize.width}
                height={contentSize.height}
                style={{ overflow: 'visible' }}
              >
                <defs>
                  <marker
                    id="wf-arrow"
                    viewBox="0 0 10 10"
                    refX="9"
                    refY="5"
                    markerWidth="7"
                    markerHeight="7"
                    orient="auto-start-reverse"
                  >
                    <path d="M0,0 L10,5 L0,10 z" fill="currentColor" />
                  </marker>
                </defs>
                {edges.map((edge) => (
                  <WorkflowEdge
                    key={edge.id}
                    edge={edge}
                    steps={steps}
                    dragPreview={dragPreview}
                    isRunning={isRunning}
                    onDelete={handleDeleteEdge}
                  />
                ))}
                {/* Live preview while dragging a new link */}
                {linking && linkCursor && (() => {
                  const fromStep = steps.find(s => s.id === linking.from)
                  if (!fromStep) return null
                  const pos = fromStep.position ?? { x: 0, y: 0 }
                  const sx = pos.x + NODE_WIDTH
                  const sy = pos.y + sourcePortY(linking.handle)
                  const cp = Math.max(40, Math.abs(linkCursor.x - sx) * 0.5)
                  return (
                    <path
                      d={`M${sx},${sy} C${sx + cp},${sy} ${linkCursor.x - cp},${linkCursor.y} ${linkCursor.x},${linkCursor.y}`}
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2}
                      strokeDasharray="6,5"
                      className="text-primary"
                    />
                  )
                })()}
              </svg>

              {/* Nodes */}
              {steps.map((step, index) => (
                <WorkflowNode
                  key={step.id}
                  step={step}
                  pos={step.position ?? { x: 50 + index * (NODE_WIDTH + 70), y: 100 }}
                  canvasZoom={canvasZoom}
                  style={STEP_TYPE_STYLES[step.type]}
                  isDragging={draggingNodeId === step.id}
                  isActive={currentRunningStepId === step.id}
                  isSelected={selectedStepId === step.id}
                  isRunning={isRunning}
                  // Every node's input pulses while linking — dropping back onto the
                  // source node itself is valid and creates a self-loop.
                  isLinkTarget={!!linking}
                  onDragStart={handleDragStart}
                  onDrag={handleDrag}
                  onDragEnd={handleDragEnd}
                  onConfigure={handleConfigureNode}
                  onDelete={handleDeleteStep}
                  onStartLink={handleStartLink}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Right Sidebar - Execution only (config via dialog) */}
        <div className="w-[320px] shrink-0 flex flex-col min-h-0 overflow-hidden border-l border-border/50 bg-card">
          {/* Execution */}
          <Card className="flex flex-col flex-1 min-h-0 border-0 border-t border-border/50 rounded-none overflow-hidden" data-tour="tour-automation-execution">
            <CardHeader className="pb-3 pt-4 px-5 shrink-0">
              <CardTitle className="text-base font-semibold">Execution</CardTitle>
              <CardDescription>Control playback</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4 px-5 pb-5 flex-1 min-h-0 overflow-hidden">
              <div className="flex flex-col gap-4 p-4 rounded-xl border border-border/50 bg-muted/10 shrink-0">
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <Label className="w-24 shrink-0">Run:</Label>
                <Select value={runMode} onValueChange={(v) => setRunMode(v as 'loops' | 'duration')}>
                  <SelectTrigger className="flex-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="loops">By loop count</SelectItem>
                    <SelectItem value="duration">For duration</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {runMode === 'loops' ? (
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <Label className="w-24 shrink-0" />
                    <Select value={loopCount} onValueChange={setLoopCount}>
                      <SelectTrigger className="flex-1">
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
                      <Label className="w-24 shrink-0">Times:</Label>
                      <Input
                        type="number"
                        min={1}
                        max={999999}
                        value={customLoopCount}
                        onChange={(e) => setCustomLoopCount(e.target.value)}
                        className="h-9 font-mono flex-1"
                        placeholder="e.g. 25"
                      />
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <Label className="w-24 shrink-0">Duration:</Label>
                  <div className="flex items-center gap-1.5 flex-1">
                    <Input
                      type="number"
                      min={1}
                      max={86400}
                      value={runDurationSeconds}
                      onChange={(e) => setRunDurationSeconds(e.target.value)}
                      className="h-9 font-mono"
                      placeholder="300"
                    />
                    <span className="text-xs text-muted-foreground shrink-0">seconds</span>
                  </div>
                </div>
              )}
            </div>
              <div className="flex gap-2">
                {!isRunning ? (
                <Button onClick={handleRun} className="flex-1">
                  <Play className="w-4 h-4 mr-2" /> Start
                </Button>
              ) : (
                <Button onClick={handleStop} variant="destructive" className="flex-1">
                  <Square className="w-4 h-4 mr-2" /> Stop
                </Button>
              )}
              </div>
              </div>
              <VariableInspector
                vars={runVars}
                open={inspectorOpen}
                onToggle={() => setInspectorOpen((o) => !o)}
                onReset={handleResetVars}
                isRunning={isRunning}
              />
              <div className="flex items-center justify-between gap-2 shrink-0">
                <div className="flex items-center gap-2 rounded-lg border border-border/50 bg-muted/20 px-2.5 py-1.5">
                  <Switch
                    id="automation-detail-logs"
                    checked={fullActivityLog}
                    onCheckedChange={(v) => {
                      setFullActivityLog(v)
                      setAutomationFullActivityLog(v)
                    }}
                  />
                  <Label
                    htmlFor="automation-detail-logs"
                    className="cursor-pointer text-xs font-medium text-muted-foreground"
                    title="Off: no log output while running. On: all step detail."
                  >
                    Activity log
                  </Label>
                </div>
                <Button variant="outline" size="sm" onClick={() => setLog([])} className="shrink-0 h-8">
                  Clear
                </Button>
              </div>
              <div
                className={cn(
                  'group/expand relative flex-1 min-h-[120px] max-h-[320px] rounded-xl transition-shadow',
                  'ring-1 ring-transparent hover:ring-border/80 hover:shadow-sm',
                  !fullActivityLog && 'opacity-80',
                )}
              >
                <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-border/50 bg-muted/10">
                  <ScrollArea className="h-full flex-1">
                    <div className="space-y-0 p-3 pr-11 font-mono text-xs">
                      {log.length === 0 && (
                        <div className="py-4 text-center text-muted-foreground">
                          {fullActivityLog ? 'Ready to run…' : 'Activity log off — enable the switch to record runs'}
                        </div>
                      )}
                      {log.map((l, i) => (
                        <div
                          key={i}
                          className={`rounded px-2 py-0.5 text-muted-foreground transition-colors hover:bg-accent/30 hover:text-foreground ${i === log.length - 1 ? 'animate-log-new' : ''}`}
                        >
                          {l}
                        </div>
                      ))}
                      <div ref={logEndRef} />
                    </div>
                  </ScrollArea>
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
                        className={cn(
                          'pointer-events-auto h-8 w-8 shrink-0 rounded-md',
                          'border border-border/60 bg-background/90 shadow-sm backdrop-blur-sm',
                          'hover:bg-accent hover:text-accent-foreground',
                          'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                        )}
                        aria-label="Expand activity log"
                        onClick={(e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          setLogExpandedOpen(true)
                        }}
                      >
                        <Maximize2 className="h-3.5 w-3.5" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="left" className="max-w-[14rem] text-xs">
                      Expand activity log
                    </TooltipContent>
                  </Tooltip>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-4 py-2 border-t border-border/50 bg-card/50 text-xs text-muted-foreground">
        <span>• {sortedSeqs.length} SEQUENCES • {steps.length} NODES • {edges.length} LINKS</span>
        <span>Drag a node's right dot to another node (or back onto itself to loop) to link • Click a link to remove it • ⋮⋮ Drag to move • Drag background to pan</span>
      </div>

      {/* Expanded activity log */}
      <Dialog open={logExpandedOpen} onOpenChange={setLogExpandedOpen}>
        <DialogContent className="sm:max-w-4xl h-[90vh] max-h-[90vh] overflow-hidden flex flex-col gap-0 p-0">
          <DialogHeader className="px-6 pt-6 pb-3 shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <Terminal className="w-5 h-5" />
              Activity log
            </DialogTitle>
            <DialogDescription>
              {log.length} line{log.length !== 1 ? 's' : ''}
              {!fullActivityLog && ' — detail logging is off; enable the switch to record step output'}
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 min-h-0 mx-6 mb-4 border border-border/50 rounded-xl bg-muted/10 overflow-y-auto overscroll-contain">
            <div className="p-4 font-mono text-sm space-y-0">
              {log.length === 0 && (
                <div className="text-muted-foreground text-center py-8">
                  {fullActivityLog ? 'Ready to run…' : 'Activity log off — enable the switch to record runs'}
                </div>
              )}
              {log.map((l, i) => (
                <div
                  key={i}
                  className={`text-muted-foreground hover:text-foreground transition-colors py-0.5 px-2 rounded hover:bg-accent/30 ${i === log.length - 1 ? 'animate-log-new' : ''}`}
                >
                  {l}
                </div>
              ))}
              <div ref={logExpandEndRef} />
            </div>
          </div>
          <DialogFooter className="px-6 pb-6 pt-0 shrink-0">
            <Button variant="outline" onClick={handleCopyLog} disabled={log.length === 0} className="gap-1.5">
              {logCopied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
              {logCopied ? 'Copied' : 'Copy'}
            </Button>
            <Button variant="outline" onClick={() => setLog([])} disabled={log.length === 0}>
              Clear
            </Button>
            <Button onClick={() => setLogExpandedOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete sequence confirmation */}
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

      {/* Node config popup */}
      <NodeConfigDialog
        open={configDialogOpen}
        onOpenChange={setConfigDialogOpen}
        step={selectedStepId ? steps.find(s => s.id === selectedStepId) ?? null : null}
        onSave={handleUpdateStep}
        onSaveParams={handleUpdateParams}
        host={host}
        alePort={alePort}
        customPort={customPort}
        fixedTabDelay={delay}
        sequences={sortedSeqs}
        currentSequenceId={selectedSequenceId}
      />
    </div>
  )
}

