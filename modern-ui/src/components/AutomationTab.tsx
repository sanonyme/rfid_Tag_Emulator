import { useState, useRef, useEffect, useLayoutEffect, useCallback, useMemo, memo, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence, Reorder, useMotionValue } from 'framer-motion'
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
  Code2,
  ShieldCheck,
  Timer,
  Ban,
  Sparkles,
  StickyNote,
  Wand2,
  Bell,
  Repeat2,
  Split,
  Shuffle,
  Undo2,
  Redo2,
  Maximize,
  Grid,
  Magnet,
  AlignHorizontalJustifyCenter,
  AlignVerticalJustifyCenter,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  CornerDownRight,
  MoveRight,
  Hand,
  MousePointer2,
  Eye,
  EyeOff,
  Frame,
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
import type { AutomationStep, AutomationSequence, AutomationEdge, ActionType } from '@/lib/automation-types'
import {
  normalizeSequences,
  parseWorkflowSequences,
  deriveLinearEdges,
  DEFAULT_STEP_NAMES,
  defaultParamsForType,
  CONDITION_OPS,
} from '@/lib/automation-types'
import {
  createRunContext,
  applyTemplate,
  captureEpcsToVars,
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
} from '@/lib/automation-blocks'
import { NodeConfigDialog } from './NodeConfigDialog'
import { NodePalette } from './NodePalette'
import { DEMO_WORKFLOW } from '@/lib/automation-demo-workflow'

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
/** Canvas grid pitch (px) for the dotted background and optional snapping. */
const GRID_SIZE = 20
/** Offset applied to pasted/duplicated nodes so they don't stack exactly. */
const PASTE_OFFSET = 32
/** Guards graph execution against runaway loops (cyclic edges, incl. self-loops). */
const MAX_GRAPH_STEPS = 10000
/** Cap activity-log lines so a verbose run cannot unbounded-grow React state. */
const MAX_AUTOMATION_LOG_LINES = 1000
/** Max nesting depth for Call Sequence (guards against runaway sub-routine chains). */
const MAX_CALL_DEPTH = 20
/** How far a self-loop arc dips below its node. */
const SELF_LOOP_DROP = 46

/** Vertical offset (px, relative to node top) of the single input port. */
const INPUT_PORT_Y = NODE_HEIGHT / 2

/** How connections are drawn between nodes (user-selectable, persisted). */
export type EdgeStyle = 'curved' | 'step' | 'straight'

export const EDGE_STYLE_META: Record<EdgeStyle, { label: string; hint: string }> = {
  curved: { label: 'Curved', hint: 'Smooth bezier curves' },
  step: { label: 'Step', hint: 'Right-angled elbows' },
  straight: { label: 'Straight', hint: 'Direct straight lines' },
}

const EDGE_STYLE_ORDER: EdgeStyle[] = ['curved', 'step', 'straight']

/**
 * Canvas interaction tool. `select` = left-drag rubber-band selects (default);
 * `pan` = left-drag moves the view like a hand tool. Space / middle-mouse always
 * pan regardless of tool.
 */
export type EditorTool = 'select' | 'pan'

/**
 * Compute the SVG path for a connection plus the midpoint used for its delete
 * affordance. `curved` is a horizontal bezier; `step` is a rounded orthogonal
 * elbow; `straight` is a direct line. Self-loops are handled separately by the
 * caller (they always arc below the node regardless of style).
 */
function buildEdgeGeometry(
  sx: number,
  sy: number,
  ex: number,
  ey: number,
  style: EdgeStyle,
): { d: string; midX: number; midY: number } {
  if (style === 'straight') {
    return { d: `M${sx},${sy} L${ex},${ey}`, midX: (sx + ex) / 2, midY: (sy + ey) / 2 }
  }
  if (style === 'step') {
    const midX = Math.max(sx + 30, (sx + ex) / 2)
    if (Math.abs(ey - sy) < 1) {
      return { d: `M${sx},${sy} L${ex},${ey}`, midX: (sx + ex) / 2, midY: sy }
    }
    const dir = ey >= sy ? 1 : -1
    const r = Math.min(12, Math.abs(ey - sy) / 2, Math.abs(midX - sx), Math.abs(ex - midX))
    if (r < 2) {
      return {
        d: `M${sx},${sy} L${midX},${sy} L${midX},${ey} L${ex},${ey}`,
        midX,
        midY: (sy + ey) / 2,
      }
    }
    const d = `M${sx},${sy} L${midX - r},${sy} Q${midX},${sy} ${midX},${sy + dir * r} L${midX},${ey - dir * r} Q${midX},${ey} ${midX + r},${ey} L${ex},${ey}`
    return { d, midX, midY: (sy + ey) / 2 }
  }
  // curved (default)
  const cp1X = sx + Math.max(40, Math.abs(ex - sx) * 0.5)
  const cp2X = ex - Math.max(40, Math.abs(ex - sx) * 0.5)
  return {
    d: `M${sx},${sy} C${cp1X},${sy} ${cp2X},${ey} ${ex},${ey}`,
    midX: (sx + ex) / 2,
    midY: (sy + ey) / 2,
  }
}

interface NodeOutput {
  handle: string
  label?: string
  /** Tailwind bg class for the port dot. */
  color: string
}

/**
 * The ordered set of output ports a node exposes. Most nodes have one (`out`);
 * CONDITION has true/false; SWITCH has one port per case (+ default); RANDOM has
 * one per weighted branch. Driven by params so ports update live as the node is
 * configured.
 */
function getNodeOutputs(step: AutomationStep): NodeOutput[] {
  switch (step.type) {
    case 'CONDITION':
      return [
        { handle: 'true', label: 'T', color: 'bg-green-500' },
        { handle: 'false', label: 'F', color: 'bg-red-500' },
      ]
    case 'SWITCH': {
      const cases = step.params.switchCases ?? []
      const outs: NodeOutput[] = cases.map((c, i) => ({
        handle: `case-${i}`,
        label: (c.label?.trim() || c.value?.trim() || `${i + 1}`).slice(0, 7),
        color: 'bg-sky-500',
      }))
      if (step.params.switchHasDefault !== false) {
        outs.push({ handle: 'default', label: 'def', color: 'bg-stone-400' })
      }
      return outs.length > 0 ? outs : [{ handle: 'default', label: 'def', color: 'bg-stone-400' }]
    }
    case 'RANDOM': {
      const branches = step.params.randomBranches ?? []
      const outs: NodeOutput[] = branches.map((b, i) => ({
        handle: `branch-${i}`,
        label: (b.label?.trim() || `w${b.weight ?? 1}`).slice(0, 7),
        color: 'bg-purple-500',
      }))
      return outs.length > 0 ? outs : [{ handle: 'branch-0', label: '1', color: 'bg-purple-500' }]
    }
    default:
      return [{ handle: 'out', color: 'bg-primary' }]
  }
}

/** Vertical center (px from node top) of output port `index` of `count` total. */
function outputPortTop(index: number, count: number): number {
  if (count <= 1) return NODE_HEIGHT / 2
  const pad = 22
  const span = NODE_HEIGHT - pad * 2
  return pad + (span * index) / (count - 1)
}

/** Y offset of a source port for a given handle on a given node. */
function sourcePortY(step: AutomationStep | undefined, handle: string | undefined): number {
  if (!step) return NODE_HEIGHT / 2
  const outs = getNodeOutputs(step)
  const idx = outs.findIndex((o) => o.handle === (handle ?? 'out'))
  if (idx < 0) return NODE_HEIGHT / 2
  return outputPortTop(idx, outs.length)
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
  CODE: { border: 'border-yellow-400/40', bg: 'bg-yellow-400/10', icon: 'text-yellow-400', label: 'CODE' },
  CONDITION: { border: 'border-fuchsia-400/40', bg: 'bg-fuchsia-400/10', icon: 'text-fuchsia-400', label: 'IF' },
  ASSERT: { border: 'border-red-400/40', bg: 'bg-red-400/10', icon: 'text-red-400', label: 'ASSERT' },
  WAIT_UNTIL: { border: 'border-cyan-400/40', bg: 'bg-cyan-400/10', icon: 'text-cyan-400', label: 'WAIT' },
  FOR_EACH: { border: 'border-purple-400/40', bg: 'bg-purple-400/10', icon: 'text-purple-400', label: 'LOOP' },
  STOP: { border: 'border-stone-400/40', bg: 'bg-stone-400/10', icon: 'text-stone-400', label: 'STOP' },
  GENERATE: { border: 'border-amber-400/40', bg: 'bg-amber-400/10', icon: 'text-amber-400', label: 'GEN' },
  COMMENT: { border: 'border-border/60', bg: 'bg-muted/20', icon: 'text-muted-foreground', label: 'NOTE' },
  LOG: { border: 'border-sky-400/40', bg: 'bg-sky-400/10', icon: 'text-sky-400', label: 'LOG' },
  TRANSFORM: { border: 'border-teal-400/40', bg: 'bg-teal-400/10', icon: 'text-teal-400', label: 'MAP' },
  NOTIFY: { border: 'border-sky-400/40', bg: 'bg-sky-400/10', icon: 'text-sky-400', label: 'TOAST' },
  LOOP_N: { border: 'border-purple-400/40', bg: 'bg-purple-400/10', icon: 'text-purple-400', label: 'LOOP' },
  SWITCH: { border: 'border-blue-400/40', bg: 'bg-blue-400/10', icon: 'text-blue-400', label: 'SWITCH' },
  RANDOM: { border: 'border-purple-400/40', bg: 'bg-purple-400/10', icon: 'text-purple-400', label: 'RAND' },
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
    case 'CODE': return <Code2 className={className} />
    case 'CONDITION': return <GitBranch className={className} />
    case 'ASSERT': return <ShieldCheck className={className} />
    case 'WAIT_UNTIL': return <Timer className={className} />
    case 'FOR_EACH': return <Repeat className={className} />
    case 'STOP': return <Ban className={className} />
    case 'GENERATE': return <Sparkles className={className} />
    case 'COMMENT': return <StickyNote className={className} />
    case 'LOG': return <FileText className={className} />
    case 'TRANSFORM': return <Wand2 className={className} />
    case 'NOTIFY': return <Bell className={className} />
    case 'LOOP_N': return <Repeat2 className={className} />
    case 'SWITCH': return <Split className={className} />
    case 'RANDOM': return <Shuffle className={className} />
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
  isSelected,
  isRunning,
  isLinkTarget,
  groupDelta,
  onDragStart,
  onDrag,
  onDragEnd,
  onConfigure,
  onSelect,
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
  /** Live offset applied while this node is part of a group being dragged by another node */
  groupDelta: { x: number; y: number } | null
  onDragStart: (id: string) => void
  onDrag: (id: string, x: number, y: number) => void
  onDragEnd: (id: string, x: number, y: number) => void
  onConfigure: (id: string) => void
  onSelect: (id: string, additive: boolean) => void
  onDelete: (id: string) => void
  onStartLink: (id: string, handle: string, e: React.PointerEvent) => void
}) {
  const x = useMotionValue(pos.x)
  const y = useMotionValue(pos.y)

  // Follow a group drag live: when another selected node is being dragged, this
  // node shifts by the same delta (committed to real positions on drop).
  const gdx = groupDelta && isSelected && !isDragging ? groupDelta.x : 0
  const gdy = groupDelta && isSelected && !isDragging ? groupDelta.y : 0

  useEffect(() => {
    if (!isDragging) {
      x.set(pos.x + gdx)
      y.set(pos.y + gdy)
    }
  }, [pos.x, pos.y, isDragging, x, y, gdx, gdy])

  const handleGripPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    // Left button only — right/middle clicks bubble up for the context menu / pan.
    if (e.button !== 0) return
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

    // No lower clamp: nodes move freely anywhere on the canvas (incl. negative
    // coordinates), so the workspace behaves like an infinite map.
    const onMove = (ev: PointerEvent) => {
      const nx = startX + (ev.clientX - startClientX) / zoom
      const ny = startY + (ev.clientY - startClientY) / zoom
      x.set(nx)
      y.set(ny)
      onDrag(step.id, nx, ny)
    }

    const onUp = (ev: PointerEvent) => {
      grip.releasePointerCapture(ev.pointerId)
      grip.removeEventListener('pointermove', onMove)
      grip.removeEventListener('pointerup', onUp)
      grip.removeEventListener('pointercancel', onUp)
      const nx = startX + (ev.clientX - startClientX) / zoom
      const ny = startY + (ev.clientY - startClientY) / zoom
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
      case 'HANDHELD_TAG': {
        const tagList = step.params.epcList || step.params.upcList ? 'Tag list' : 'Configure'
        const delayLabel = step.params.tagDelay?.trim()
        return delayLabel ? `${tagList} · ${delayLabel}ms` : tagList
      }
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
      case 'CODE': return 'JavaScript'
      case 'CONDITION': {
        const opMeta = CONDITION_OPS.find((o) => o.value === (step.params.condOp ?? 'eq'))
        const left = step.params.condLeft || '?'
        return opMeta?.needsRight === false
          ? `${left} ${opMeta.label}`
          : `${left} ${opMeta?.label ?? '='} ${step.params.condRight ?? ''}`
      }
      case 'ASSERT': {
        const opMeta = CONDITION_OPS.find((o) => o.value === (step.params.condOp ?? 'eq'))
        return `Assert ${step.params.condLeft || '?'} ${opMeta?.label ?? ''}`
      }
      case 'WAIT_UNTIL': return `Wait ≤${step.params.waitTimeoutMs ?? 10000}ms`
      case 'FOR_EACH': return step.params.forEachSource ? `Each ${step.params.forEachItemAs || 'item'}` : 'Configure'
      case 'STOP': return step.params.stopScope === 'run' ? 'End whole run' : 'End sequence'
      case 'GENERATE': return `${step.params.generateKind ?? 'uuid'} → ${step.params.generateSaveAs || '?'}`
      case 'COMMENT': return step.params.commentText ? step.params.commentText.slice(0, 44) : 'Note'
      case 'LOG': return step.params.logMessage ? step.params.logMessage.slice(0, 44) : 'Configure'
      case 'TRANSFORM': {
        const op = step.params.transformOp ?? 'trim'
        return `${op} → ${step.params.transformSaveAs || '?'}`
      }
      case 'NOTIFY': return step.params.notifyMessage ? step.params.notifyMessage.slice(0, 44) : 'Configure'
      case 'LOOP_N': return step.params.loopSequenceId ? `×${step.params.loopCount || '?'}` : 'Configure'
      case 'SWITCH': {
        const n = step.params.switchCases?.length ?? 0
        return `${n} case${n !== 1 ? 's' : ''}${step.params.switchHasDefault !== false ? ' + default' : ''}`
      }
      case 'RANDOM': {
        const n = step.params.randomBranches?.length ?? 0
        return `${n} branch${n !== 1 ? 'es' : ''}`
      }
      default: return ''
    }
  }

  const outputs = getNodeOutputs(step)
  const disabled = step.params.disabled === true

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
        <span className="pointer-events-none ml-1 max-w-[68px] truncate rounded bg-background/70 px-0.5 text-[8px] font-bold uppercase tracking-wide text-foreground/70">{label}</span>
      )}
    </div>
  )

  return (
    <motion.div
      style={{ x, y, width: NODE_WIDTH, height: NODE_HEIGHT, transformOrigin: '0 0' }}
      className={cn('absolute pointer-events-auto', isDragging && 'z-50 cursor-grabbing')}
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
        style={{ left: -7, top: INPUT_PORT_Y - 7 }}
        title="Input"
      />
      {/* Output port(s) (right) — one per branch for CONDITION/SWITCH/RANDOM */}
      {outputs.map((o, i) => (
        <OutputPort
          key={o.handle}
          handle={o.handle}
          top={outputPortTop(i, outputs.length)}
          color={o.color}
          label={o.label}
        />
      ))}

      <Card
        className={cn(
          'group/node relative flex h-full w-full flex-col overflow-hidden rounded-xl border bg-background/70 p-3 transition-shadow hover:shadow-lg cursor-pointer select-none focus:outline-none',
          style.border, style.bg,
          !isDragging && 'backdrop-blur',
          isDragging && 'shadow-xl ring-2 ring-primary/50',
          isSelected && !isDragging && 'ring-2 ring-primary/70 shadow-[0_0_0_2px_hsl(var(--primary)/0.15)]',
          isActive && 'ring-2 ring-green-500 shadow-[0_0_12px_rgba(34,197,94,0.25)]',
          disabled && 'opacity-55 saturate-[0.4]',
        )}
        onPointerDown={(e) => {
          // Left click selects; right/middle bubble up for context menu / pan.
          if (e.button !== 0) return
          if ((e.target as HTMLElement).closest('button')) return
          e.preventDefault()
          onSelect(step.id, e.shiftKey || e.metaKey || e.ctrlKey)
        }}
        onDoubleClick={(e) => { e.stopPropagation(); onConfigure(step.id) }}
        title="Click to select · drag the handle to move · right-click for actions"
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
            {disabled && (
              <span className="flex shrink-0 items-center gap-0.5 rounded bg-muted px-1 py-0.5 text-[8px] font-bold uppercase tracking-wide text-muted-foreground" title="Muted — skipped at run time">
                <EyeOff className="h-2.5 w-2.5" /> Off
              </span>
            )}
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
  edgeStyle,
  isLinking,
  isActive,
  onDelete,
}: {
  edge: AutomationEdge
  steps: AutomationStep[]
  dragPreview: { nodeId: string; x: number; y: number } | null
  isRunning: boolean
  /** How connections are drawn (curved / step / straight). */
  edgeStyle: EdgeStyle
  /** True while a link is being dragged — edges become drop targets. */
  isLinking: boolean
  /** True when this edge leaves the currently-executing node (animated flow). */
  isActive: boolean
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
  const startY = fromPos.y + sourcePortY(fromStep, edge.sourceHandle)
  const endX = toPos.x
  const endY = toPos.y + INPUT_PORT_Y

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
    const geo = buildEdgeGeometry(startX, startY, endX, endY, edgeStyle)
    path = geo.d
    midX = geo.midX
    midY = geo.midY
  }
  // Active non-loop edges show a flowing dash; self-loops keep their static dash.
  const flowing = isActive && !isSelfLoop

  const handle = edge.sourceHandle ?? 'out'
  const branchColor = isSelfLoop
    ? 'text-amber-500'
    : handle === 'true' ? 'text-green-500'
    : handle === 'false' ? 'text-red-500'
    : handle === 'default' ? 'text-stone-400'
    : handle.startsWith('case-') ? 'text-sky-500'
    : handle.startsWith('branch-') ? 'text-purple-500'
    : 'text-foreground'

  return (
    <g className="group/edge">
      {/* Visible curve */}
      <path
        d={path}
        fill="none"
        stroke="currentColor"
        strokeWidth={isActive ? 3 : 2}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray={isSelfLoop ? '5,4' : undefined}
        markerEnd="url(#wf-arrow)"
        className={cn(
          branchColor,
          'transition-[stroke-width,opacity]',
          flowing && 'animate-edge-flow',
          isActive ? 'opacity-100' : isLinking ? 'opacity-80' : 'opacity-50',
          'group-hover/edge:opacity-90',
        )}
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
      {/* Wide invisible hit area. While idle it reveals the delete affordance on
          hover; while linking it's a drop target that routes a new connection to
          this edge's own target node ("arrow → arrow → same node"). */}
      {!isRunning && (
        <>
          <path
            d={path}
            fill="none"
            stroke="transparent"
            strokeWidth={20}
            strokeLinecap="round"
            data-edge-hit="true"
            data-edge-to={edge.to}
            className={cn('pointer-events-auto', isLinking ? 'cursor-copy' : 'cursor-default')}
          >
            <title>
              {isLinking
                ? 'Drop here to connect to the same node this arrow leads to'
                : 'Hover, then click ✕ to remove this link'}
            </title>
          </path>
          {/* Explicit delete button — only this removes the link (a stray click on
              the line no longer deletes it). Hidden while linking. */}
          {!isLinking && (
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
          )}
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
 * Shared variable rows for the inline inspector and expanded dialog.
 */
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
        <div
          className={cn(
            'group/expand relative border-t border-border/40 transition-shadow',
            'ring-1 ring-transparent hover:ring-border/80 hover:shadow-sm',
          )}
        >
          <div className="max-h-[min(32vh,220px)] overflow-y-auto overscroll-contain">
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
                  className={cn(
                    'pointer-events-auto h-8 w-8 shrink-0 rounded-md',
                    'border border-border/60 bg-background/90 shadow-sm backdrop-blur-sm',
                    'hover:bg-accent hover:text-accent-foreground',
                    'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                  )}
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
              <TooltipContent side="left" className="max-w-[14rem] text-xs">
                Expand variables
              </TooltipContent>
            </Tooltip>
          </div>
        </div>
      )}
    </div>
  )
})

/** One entry in the canvas right-click menu. */
type CtxItem =
  | { separator: true }
  | {
      separator?: false
      label: string
      icon?: ReactNode
      shortcut?: string
      onClick: () => void
      disabled?: boolean
      danger?: boolean
    }

/**
 * A lightweight right-click menu rendered at the cursor via a portal. Flips to
 * stay on-screen, and closes on outside-click, Escape, or after an action runs.
 */
const CanvasContextMenu = memo(function CanvasContextMenu({
  x,
  y,
  items,
  onClose,
}: {
  x: number
  y: number
  items: CtxItem[]
  onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const m = 8
    const w = el.offsetWidth
    const h = el.offsetHeight
    let left = x
    let top = y
    if (left + w > window.innerWidth - m) left = window.innerWidth - w - m
    if (top + h > window.innerHeight - m) top = window.innerHeight - h - m
    setPos({ left: Math.max(m, left), top: Math.max(m, top) })
  }, [x, y, items])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  if (typeof document === 'undefined') return null

  return createPortal(
    <div
      className="fixed inset-0 z-[300]"
      onPointerDown={onClose}
      onContextMenu={(e) => { e.preventDefault(); onClose() }}
      onWheel={onClose}
    >
      <div
        ref={ref}
        role="menu"
        className="fixed min-w-[13rem] overflow-hidden rounded-lg border border-border/70 bg-popover/95 p-1 text-popover-foreground shadow-2xl backdrop-blur"
        style={pos ? { left: pos.left, top: pos.top } : { left: x, top: y, visibility: 'hidden' }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {items.map((item, i) =>
          item.separator ? (
            <div key={`sep-${i}`} className="my-1 h-px bg-border/60" />
          ) : (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              disabled={item.disabled}
              onClick={() => {
                if (item.disabled) return
                item.onClick()
                onClose()
              }}
              className={cn(
                'flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-sm transition-colors focus:outline-none',
                'disabled:pointer-events-none disabled:opacity-40',
                item.danger
                  ? 'text-destructive hover:bg-destructive/10'
                  : 'hover:bg-accent hover:text-accent-foreground',
              )}
            >
              <span className="flex h-4 w-4 shrink-0 items-center justify-center">{item.icon}</span>
              <span className="min-w-0 flex-1 truncate">{item.label}</span>
              {item.shortcut && (
                <kbd className="shrink-0 rounded border border-border/60 bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                  {item.shortcut}
                </kbd>
              )}
            </button>
          ),
        )}
      </div>
    </div>,
    document.body,
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
  const steps = useMemo<AutomationStep[]>(() => selectedSequence?.steps ?? [], [selectedSequence])
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
  /** Which sequences Start will run: all top-level, the editor's current one, or checked ones. */
  const [sequenceRunScope, setSequenceRunScope] = useState<'all' | 'current' | 'selected'>('all')
  const [checkedSequenceIds, setCheckedSequenceIds] = useState<Set<string>>(() => new Set())
  const [runDurationSeconds, setRunDurationSeconds] = useState<string>('300')
  /** Top-level sequence currently executing (highlights its row in the list). */
  const [runningSeqId, setRunningSeqId] = useState<string | null>(null)
  const [paletteOpen, setPaletteOpen] = useState(false)

  // --- Layout: collapsible side panels + resizable sequence list ---
  const SEQ_PANEL_DEFAULT_WIDTH = 288
  const SEQ_PANEL_MIN_WIDTH = 220
  const SEQ_PANEL_MAX_WIDTH = 520
  const EXEC_PANEL_DEFAULT_WIDTH = 340
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
  // How connections are drawn on the canvas (persisted).
  const [edgeStyle, setEdgeStyle] = useState<EdgeStyle>(() => {
    const saved = localStorage.getItem('automation-edge-style')
    return saved === 'step' || saved === 'straight' || saved === 'curved' ? saved : 'curved'
  })
  // Active canvas tool (persisted). Mirrored to a ref for the pointer handlers.
  const [tool, setTool] = useState<EditorTool>(() =>
    localStorage.getItem('automation-tool') === 'pan' ? 'pan' : 'select',
  )
  const toolRef = useRef(tool); toolRef.current = tool

  useEffect(() => { localStorage.setItem('automation-left-open', leftPanelOpen ? '1' : '0') }, [leftPanelOpen])
  useEffect(() => { localStorage.setItem('automation-right-open', rightPanelOpen ? '1' : '0') }, [rightPanelOpen])
  useEffect(() => { localStorage.setItem('automation-left-width', String(leftPanelWidth)) }, [leftPanelWidth])
  useEffect(() => { localStorage.setItem('automation-right-width', String(rightPanelWidth)) }, [rightPanelWidth])
  useEffect(() => { localStorage.setItem('automation-edge-style', edgeStyle) }, [edgeStyle])
  useEffect(() => { localStorage.setItem('automation-tool', tool) }, [tool])

  const cycleEdgeStyle = useCallback(() => {
    setEdgeStyle((prev) => {
      const idx = EDGE_STYLE_ORDER.indexOf(prev)
      return EDGE_STYLE_ORDER[(idx + 1) % EDGE_STYLE_ORDER.length]
    })
  }, [])

  const handleLeftResizeStart = useCallback((e: React.PointerEvent) => {
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
  }, [leftPanelWidth])

  const handleRightResizeStart = useCallback((e: React.PointerEvent) => {
    e.preventDefault()
    const startX = e.clientX
    const startWidth = rightPanelWidth
    setIsResizingRight(true)
    // Dragging the handle left widens the panel (it's docked on the right edge).
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
  }, [rightPanelWidth])

  // Toggle panels with [ / ], open node palette with Tab — only while this tab
  // is visible and the user isn't typing in a field / dialog.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return
      if (e.key !== '[' && e.key !== ']' && e.key !== 'Tab') return
      if (!rootRef.current || rootRef.current.offsetParent === null) return
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return
      // Let Tab/keys work normally inside open dialogs / menus / the node palette.
      if (t?.closest('[role="dialog"], [data-radix-popper-content-wrapper], [data-node-palette]')) return
      e.preventDefault()
      if (e.key === '[') setLeftPanelOpen(o => !o)
      else if (e.key === ']') setRightPanelOpen(o => !o)
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
    if (selectedSequenceId && !sortedSeqs.find(s => s.id === selectedSequenceId)) {
      setSelectedSequenceId(sortedSeqs[0]?.id ?? null)
    }
    setCheckedSequenceIds(prev => {
      const valid = new Set(sortedSeqs.map(s => s.id))
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

  const addLog = useCallback((msg: string) => {
    if (!fullActivityLogRef.current) return
    logQueueRef.current.push(`[${formatTime()}] ${msg}`)
    if (logFlushTimerRef.current != null) return
    logFlushTimerRef.current = setTimeout(flushLogQueue, 80)
  }, [flushLogQueue])

  useEffect(() => {
    // Instant scroll stays inside the log viewport; smooth scrolling on every
    // batch would fight the user if they try to read earlier lines.
    logEndRef.current?.scrollIntoView({ block: 'nearest' })
    if (logExpandedOpen) {
      logExpandEndRef.current?.scrollIntoView({ block: 'nearest' })
    }
  }, [log, logExpandedOpen])

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

  useEffect(() => {
    if (!logExpandedOpen) setLogCopied(false)
  }, [logExpandedOpen])

  const formatVarsForCopy = useCallback((vars: AutomationVars) => {
    return Object.entries(vars)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([k, v]) => `${k}: ${v}`)
      .join('\n')
  }, [])

  const handleCopyVars = useCallback(async () => {
    const text = formatVarsForCopy(runVars)
    if (!text) return
    try {
      await navigator.clipboard.writeText(text)
      setVarsCopied(true)
      setTimeout(() => setVarsCopied(false), 2000)
    } catch {
      toast.error('Could not copy variables')
    }
  }, [runVars, formatVarsForCopy])

  useEffect(() => {
    if (!varsExpandedOpen) setVarsCopied(false)
  }, [varsExpandedOpen])

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
  const [canvasSize, setCanvasSize] = useState({ w: 0, h: 0 })
  const panStartRef = useRef<{ x: number; y: number; startPanX: number; startPanY: number } | null>(null)

  // --- Selection, grid, clipboard, group-drag (canvas editor UX) ---
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [showGrid, setShowGrid] = useState(true)
  const [snapToGrid, setSnapToGrid] = useState(false)
  const [marquee, setMarquee] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null)
  const [groupDrag, setGroupDrag] = useState<{ anchor: string; dx: number; dy: number } | null>(null)
  const clipboardRef = useRef<{ steps: AutomationStep[]; edges: AutomationEdge[] } | null>(null)
  // Live position lookup for group-drag delta math (avoids stale closures).
  const stepPosRef = useRef<Map<string, { x: number; y: number }>>(new Map())
  const selectedIdsRef = useRef(selectedIds); selectedIdsRef.current = selectedIds
  const snapToGridRef = useRef(snapToGrid); snapToGridRef.current = snapToGrid
  const marqueeStartRef = useRef<{ x: number; y: number } | null>(null)
  const marqueeRectRef = useRef<{ x0: number; y0: number; x1: number; y1: number } | null>(null)
  // Marquee that started with a modifier adds to (rather than replaces) the
  // existing selection; `base` is the selection snapshot at drag start.
  const marqueeAdditiveRef = useRef(false)
  const marqueeBaseRef = useRef<Set<string>>(new Set())
  // Space-held (with the canvas focused) or middle-mouse drag pans; plain
  // left-drag now rubber-band selects.
  const spaceHeldRef = useRef(false)
  const [spacePan, setSpacePan] = useState(false)
  // Right-click context menu (screen coords + the node it targets, if any).
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; nodeId: string | null } | null>(null)
  // When set, the next node added via the palette drops at this content position
  // (used by the canvas right-click → "Add node" action).
  const paletteAddPosRef = useRef<{ x: number; y: number } | null>(null)

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

  // Track the canvas viewport size for the minimap's viewport rectangle.
  useEffect(() => {
    const el = canvasRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => {
      setCanvasSize({ w: el.clientWidth, h: el.clientHeight })
    })
    ro.observe(el)
    setCanvasSize({ w: el.clientWidth, h: el.clientHeight })
    return () => ro.disconnect()
  }, [])

  // Keep a live id→position map for group-drag delta math.
  useEffect(() => {
    const m = new Map<string, { x: number; y: number }>()
    for (const s of steps) m.set(s.id, s.position ?? { x: 0, y: 0 })
    stepPosRef.current = m
  }, [steps])

  const handleDragStart = useCallback((nodeId: string) => {
    setDraggingNodeId(nodeId)
    // Grabbing a node that isn't in the current selection selects it alone, so a
    // drag never silently moves a stale group.
    if (!selectedIdsRef.current.has(nodeId)) {
      setSelectedIds(new Set([nodeId]))
    }
  }, [])

  const handleDrag = useCallback((nodeId: string, x: number, y: number) => {
    pendingDragPreviewRef.current = { nodeId, x, y }
    if (dragPreviewRafRef.current != null) return
    dragPreviewRafRef.current = requestAnimationFrame(() => {
      dragPreviewRafRef.current = null
      const pending = pendingDragPreviewRef.current
      if (!pending) return
      setDragPreview(pending)
      // Drive the live group offset when more than one node is selected.
      const sel = selectedIdsRef.current
      if (sel.size > 1 && sel.has(pending.nodeId)) {
        const start = stepPosRef.current.get(pending.nodeId) ?? { x: 0, y: 0 }
        setGroupDrag({ anchor: pending.nodeId, dx: pending.x - start.x, dy: pending.y - start.y })
      }
    })
  }, [])

  const handleDragEnd = useCallback((nodeId: string, rawX: number, rawY: number) => {
    if (dragPreviewRafRef.current != null) {
      cancelAnimationFrame(dragPreviewRafRef.current)
      dragPreviewRafRef.current = null
    }
    pendingDragPreviewRef.current = null
    setDragPreview(null)
    setDraggingNodeId(null)
    setGroupDrag(null)

    if (!selectedSequenceId) return

    const doSnap = snapToGridRef.current
    const snapV = (v: number) => (doSnap ? Math.round(v / GRID_SIZE) * GRID_SIZE : v)
    // No clamping — nodes can live anywhere (including negative coordinates).
    const newX = snapV(rawX)
    const newY = snapV(rawY)
    const start = stepPosRef.current.get(nodeId) ?? { x: newX, y: newY }
    const dx = newX - start.x
    const dy = newY - start.y

    const sel = selectedIdsRef.current
    const groupMove = sel.size > 1 && sel.has(nodeId)

    // Explicit edges mean array order no longer affects flow — keep order stable
    // to avoid node reshuffling; only positions change.
    updateStepsForSequence(selectedSequenceId, (prev) =>
      prev.map((s) => {
        const base = s.position ?? { x: 0, y: 0 }
        if (s.id === nodeId) return { ...s, position: { x: newX, y: newY } }
        if (groupMove && sel.has(s.id)) {
          return { ...s, position: { x: base.x + dx, y: base.y + dy } }
        }
        return { ...s, position: base }
      }),
    )
    setContentSize((prev) => ({
      width: Math.max(prev.width, newX + NODE_WIDTH + 50),
      height: Math.max(prev.height, newY + NODE_HEIGHT + 50),
    }))
  }, [selectedSequenceId, updateStepsForSequence])

  // --- Selection ---------------------------------------------------------
  const handleSelectNode = useCallback((id: string, additive: boolean) => {
    canvasRef.current?.focus()
    setSelectedIds((prev) => {
      if (additive) {
        const next = new Set(prev)
        next.has(id) ? next.delete(id) : next.add(id)
        return next
      }
      return new Set([id])
    })
  }, [])

  const handleSelectAll = useCallback(() => setSelectedIds(new Set(steps.map((s) => s.id))), [steps])

  // Nudge the current selection by (dx, dy) content px (arrow keys).
  const nudgeSelected = useCallback((dx: number, dy: number) => {
    if (isRunning || !selectedSequenceId) return
    const ids = selectedIdsRef.current
    if (ids.size === 0) return
    updateStepsForSequence(selectedSequenceId, (prev) =>
      prev.map((s) => {
        if (!ids.has(s.id)) return s
        const base = s.position ?? { x: 0, y: 0 }
        return { ...s, position: { x: base.x + dx, y: base.y + dy } }
      }),
    )
  }, [isRunning, selectedSequenceId, updateStepsForSequence])

  // Mute / un-mute the current selection (disabled nodes are skipped at run time).
  const setDisabledForSelected = useCallback((disabled: boolean) => {
    if (isRunning || !selectedSequenceId) return
    const ids = selectedIdsRef.current
    if (ids.size === 0) return
    updateStepsForSequence(selectedSequenceId, (prev) =>
      prev.map((s) => (ids.has(s.id) ? { ...s, params: { ...s.params, disabled } } : s)),
    )
  }, [isRunning, selectedSequenceId, updateStepsForSequence])

  // --- Undo / redo (observes the selected sequence's steps + edges) ------
  type SeqSnapshot = { steps: AutomationStep[]; edges: AutomationEdge[] }
  const historyRef = useRef<{ past: SeqSnapshot[]; future: SeqSnapshot[] }>({ past: [], future: [] })
  const applyingHistoryRef = useRef(false)
  const lastSnapRef = useRef<string>('')
  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo] = useState(false)

  // Reset history when the active sequence changes.
  useEffect(() => {
    const seq = sortedSeqs.find((s) => s.id === selectedSequenceId)
    historyRef.current = { past: [], future: [] }
    lastSnapRef.current = seq ? JSON.stringify({ steps: seq.steps, edges: seq.edges ?? [] }) : ''
    setCanUndo(false)
    setCanRedo(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSequenceId])

  // Record structural changes as history, coalescing rapid config typing into one entry.
  useEffect(() => {
    if (!selectedSequence) return
    const snap = JSON.stringify({ steps: selectedSequence.steps, edges: selectedSequence.edges ?? [] })
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
    }, 400)
    return () => window.clearTimeout(timer)
  }, [selectedSequence])

  const applySnapshot = useCallback((snapshot: SeqSnapshot) => {
    if (!selectedSequenceId) return
    applyingHistoryRef.current = true
    lastSnapRef.current = JSON.stringify(snapshot)
    setSequences((seqs) =>
      seqs.map((s) => (s.id === selectedSequenceId ? { ...s, steps: snapshot.steps, edges: snapshot.edges } : s)),
    )
  }, [selectedSequenceId, setSequences])

  const handleUndo = useCallback(() => {
    if (isRunning) return
    const h = historyRef.current
    if (h.past.length === 0) return
    const prev = h.past.pop()!
    if (lastSnapRef.current) h.future.push(JSON.parse(lastSnapRef.current) as SeqSnapshot)
    applySnapshot(prev)
    setCanUndo(h.past.length > 0)
    setCanRedo(true)
  }, [isRunning, applySnapshot])

  const handleRedo = useCallback(() => {
    if (isRunning) return
    const h = historyRef.current
    if (h.future.length === 0) return
    const next = h.future.pop()!
    if (lastSnapRef.current) h.past.push(JSON.parse(lastSnapRef.current) as SeqSnapshot)
    applySnapshot(next)
    setCanUndo(true)
    setCanRedo(h.future.length > 0)
  }, [isRunning, applySnapshot])

  // --- Delete / duplicate / copy / paste ---------------------------------
  const handleDeleteSelected = useCallback(() => {
    if (isRunning || !selectedSequenceId) return
    const ids = selectedIdsRef.current
    if (ids.size === 0) return
    setSequences((prev) => prev.map((seq) => {
      if (seq.id !== selectedSequenceId) return seq
      const seqEdges = seq.edges ?? deriveLinearEdges(seq.steps)
      return {
        ...seq,
        steps: seq.steps.filter((s) => !ids.has(s.id)),
        edges: seqEdges.filter((e) => !ids.has(e.from) && !ids.has(e.to)),
      }
    }))
    if (selectedStepId && ids.has(selectedStepId)) {
      setSelectedStepId(null)
      setConfigDialogOpen(false)
    }
    setSelectedIds(new Set())
  }, [isRunning, selectedSequenceId, setSequences, selectedStepId])

  const insertClones = useCallback((srcSteps: AutomationStep[], srcEdges: AutomationEdge[], dx: number, dy: number) => {
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
        position: { x: base.x + dx, y: base.y + dy },
      }
    })
    const clonedEdges: AutomationEdge[] = srcEdges
      .filter((e) => idMap.has(e.from) && idMap.has(e.to))
      .map((e) => ({ id: crypto.randomUUID(), from: idMap.get(e.from)!, to: idMap.get(e.to)!, sourceHandle: e.sourceHandle }))
    setSequences((prev) => prev.map((seq) => seq.id === selectedSequenceId
      ? {
          ...seq,
          steps: [...seq.steps, ...clones],
          edges: [...(seq.edges ?? deriveLinearEdges(seq.steps)), ...clonedEdges],
        }
      : seq))
    setSelectedIds(new Set(clones.map((c) => c.id)))
  }, [selectedSequenceId, setSequences])

  const handleDuplicateSelected = useCallback(() => {
    if (isRunning) return
    const ids = selectedIdsRef.current
    if (ids.size === 0) return
    insertClones(
      steps.filter((s) => ids.has(s.id)),
      edges.filter((e) => ids.has(e.from) && ids.has(e.to)),
      PASTE_OFFSET,
      PASTE_OFFSET,
    )
  }, [isRunning, steps, edges, insertClones])

  const handleCopyNodes = useCallback(() => {
    const ids = selectedIdsRef.current
    if (ids.size === 0) return
    clipboardRef.current = {
      steps: steps.filter((s) => ids.has(s.id)).map((s) => JSON.parse(JSON.stringify(s)) as AutomationStep),
      edges: edges.filter((e) => ids.has(e.from) && ids.has(e.to)).map((e) => ({ ...e })),
    }
    toast.success(`Copied ${ids.size} node${ids.size !== 1 ? 's' : ''}`)
  }, [steps, edges])

  const handlePasteNodes = useCallback((at?: { x: number; y: number }) => {
    if (isRunning) return
    const clip = clipboardRef.current
    if (!clip || clip.steps.length === 0) return
    if (at) {
      // Land the pasted group's top-left corner at the cursor.
      const minX = Math.min(...clip.steps.map((s) => s.position?.x ?? 0))
      const minY = Math.min(...clip.steps.map((s) => s.position?.y ?? 0))
      insertClones(clip.steps, clip.edges, at.x - minX, at.y - minY)
    } else {
      insertClones(clip.steps, clip.edges, PASTE_OFFSET, PASTE_OFFSET)
    }
  }, [isRunning, insertClones])

  // --- Alignment ----------------------------------------------------------
  const alignSelected = useCallback((mode: 'left' | 'right' | 'hcenter' | 'top' | 'bottom' | 'vcenter') => {
    if (isRunning || !selectedSequenceId) return
    const ids = selectedIdsRef.current
    if (ids.size < 2) return
    const sel = steps.filter((s) => ids.has(s.id))
    const xs = sel.map((s) => s.position?.x ?? 0)
    const ys = sel.map((s) => s.position?.y ?? 0)
    const minX = Math.min(...xs), maxX = Math.max(...xs)
    const minY = Math.min(...ys), maxY = Math.max(...ys)
    const cX = (minX + maxX) / 2, cY = (minY + maxY) / 2
    updateStepsForSequence(selectedSequenceId, (prev) => prev.map((s) => {
      const p = s.position ?? { x: 0, y: 0 }
      if (!ids.has(s.id)) return { ...s, position: p }
      const np =
        mode === 'left' ? { x: minX, y: p.y }
        : mode === 'right' ? { x: maxX, y: p.y }
        : mode === 'hcenter' ? { x: cX, y: p.y }
        : mode === 'top' ? { x: p.x, y: minY }
        : mode === 'bottom' ? { x: p.x, y: maxY }
        : { x: p.x, y: cY }
      return { ...s, position: np }
    }))
  }, [isRunning, selectedSequenceId, steps, updateStepsForSequence])

  // --- Fit to view --------------------------------------------------------
  /** Pan/zoom so the given nodes fill the viewport (empty list = reset to 100%). */
  const fitToNodes = useCallback((list: AutomationStep[]) => {
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return
    if (list.length === 0) {
      setCanvasZoom(1)
      setCanvasPan({ x: 0, y: 0 })
      return
    }
    const minX = Math.min(...list.map((s) => s.position?.x ?? 0))
    const minY = Math.min(...list.map((s) => s.position?.y ?? 0))
    const maxX = Math.max(...list.map((s) => (s.position?.x ?? 0) + NODE_WIDTH))
    const maxY = Math.max(...list.map((s) => (s.position?.y ?? 0) + NODE_HEIGHT))
    const pad = 60
    const w = maxX - minX + pad * 2
    const h = maxY - minY + pad * 2
    const zoom = Math.min(1.5, Math.max(0.25, Math.min(rect.width / w, rect.height / h)))
    setCanvasZoom(zoom)
    setCanvasPan({
      x: rect.width / 2 - (minX + (maxX - minX) / 2) * zoom,
      y: rect.height / 2 - (minY + (maxY - minY) / 2) * zoom,
    })
  }, [])

  const handleFitView = useCallback(() => fitToNodes(steps), [fitToNodes, steps])
  const handleZoomToSelection = useCallback(() => {
    const sel = steps.filter((s) => selectedIdsRef.current.has(s.id))
    fitToNodes(sel.length > 0 ? sel : steps)
  }, [fitToNodes, steps])

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
      // Prefer dropping on a node; otherwise, dropping on an existing arrow routes
      // the new connection to that arrow's own target node (arrow → arrow).
      const targetNode = el?.closest('[data-node-id]') as HTMLElement | null
      const targetId = targetNode?.getAttribute('data-node-id')
      if (targetId) {
        addEdge(linking.from, targetId, linking.handle)
      } else {
        const edgeEl = el?.closest('[data-edge-to]') as HTMLElement | null
        const edgeTo = edgeEl?.getAttribute('data-edge-to')
        if (edgeTo) addEdge(linking.from, edgeTo, linking.handle)
      }
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
    // If the palette was opened from a canvas right-click, drop the node there
    // (centred on the cursor); otherwise place it to the right of the last node.
    const at = paletteAddPosRef.current
    paletteAddPosRef.current = null
    const last = steps[steps.length - 1]
    const newPosition = at
      ? { x: Math.round(at.x - NODE_WIDTH / 2), y: Math.round(at.y - NODE_HEIGHT / 2) }
      : last?.position
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

  const handleUpdateStep = useCallback((id: string, updates: Partial<AutomationStep>) => {
    if (!selectedSequenceId) return
    updateStepsForSequence(selectedSequenceId, prev =>
      prev.map(s => s.id === id ? { ...s, ...updates } : s)
    )
  }, [selectedSequenceId, updateStepsForSequence])

  const handleUpdateParams = useCallback((id: string, updates: Partial<AutomationStep['params']>) => {
    if (!selectedSequenceId) return
    updateStepsForSequence(selectedSequenceId, prev =>
      prev.map(s => s.id === id ? { ...s, params: { ...s.params, ...updates } } : s)
    )
  }, [selectedSequenceId, updateStepsForSequence])

  const handleDeleteStep = useCallback((id: string) => {
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
    setSelectedIds((prev) => {
      if (!prev.has(id)) return prev
      const next = new Set(prev)
      next.delete(id)
      return next
    })
  }, [selectedSequenceId, selectedStepId, setSequences])

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

  const handleConfigureNode = useCallback((stepId: string) => {
    setSelectedStepId(stepId)
    setConfigDialogOpen(true)
  }, [])

  const handleCanvasPanStart = useCallback((e: React.MouseEvent) => {
    const onBackground = (e.target as HTMLElement).hasAttribute('data-pan-background')
    // Middle-mouse or Space+left-drag always pans (even over a node). In Pan tool
    // mode, a plain left-drag on empty canvas pans too (Shift+drag still marquees).
    const forcePan = e.button === 1 || (e.button === 0 && spaceHeldRef.current)
    const toolPan = e.button === 0 && onBackground && toolRef.current === 'pan' && !e.shiftKey
    if (forcePan || toolPan) {
      e.preventDefault()
      canvasRef.current?.focus()
      panStartRef.current = { x: e.clientX, y: e.clientY, startPanX: canvasPan.x, startPanY: canvasPan.y }
      return
    }
    // Otherwise a left-press on empty canvas starts a rubber-band selection.
    if (e.button !== 0 || !onBackground) return
    canvasRef.current?.focus()
    // Shift/Ctrl/Cmd extends the current selection (Select tool only); in Pan tool,
    // Shift+drag marquees a fresh selection.
    const additive = toolRef.current === 'select' && (e.shiftKey || e.ctrlKey || e.metaKey)
    marqueeAdditiveRef.current = additive
    marqueeBaseRef.current = additive ? new Set(selectedIdsRef.current) : new Set()
    if (!additive) setSelectedIds(new Set())
    const p = clientToContent(e.clientX, e.clientY)
    marqueeStartRef.current = p
    marqueeRectRef.current = { x0: p.x, y0: p.y, x1: p.x, y1: p.y }
    setMarquee({ x0: p.x, y0: p.y, x1: p.x, y1: p.y })
  }, [canvasPan, clientToContent])

  // Right-click anywhere on the canvas opens a context menu. Right-clicking a
  // node that isn't part of the current selection selects it first, so menu
  // actions target what you clicked; right-clicking within a multi-selection
  // keeps that selection so actions apply to the whole group.
  const handleCanvasContextMenu = useCallback((e: React.MouseEvent) => {
    const nodeEl = (e.target as HTMLElement).closest('[data-node-id]') as HTMLElement | null
    const nodeId = nodeEl?.getAttribute('data-node-id') ?? null
    if (nodeId && !selectedIdsRef.current.has(nodeId)) setSelectedIds(new Set([nodeId]))
    e.preventDefault()
    setCtxMenu({ x: e.clientX, y: e.clientY, nodeId })
  }, [])

  // Track Space (while the canvas is focused) to switch left-drag into panning.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || e.repeat) return
      if (document.activeElement !== canvasRef.current) return
      e.preventDefault()
      spaceHeldRef.current = true
      setSpacePan(true)
    }
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return
      spaceHeldRef.current = false
      setSpacePan(false)
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [])

  const handleCanvasWheel = useCallback((e: React.WheelEvent) => {
    if (!canvasRef.current?.contains(e.target as Node)) return
    e.preventDefault()
    const delta = e.deltaY > 0 ? -0.1 : 0.1
    setCanvasZoom(z => Math.min(2, Math.max(0.25, z + delta)))
  }, [])

  const handleZoomIn = () => setCanvasZoom(z => Math.min(2, z + 0.25))
  const handleZoomOut = () => setCanvasZoom(z => Math.max(0.25, z - 0.25))
  const handleZoomReset = () => setCanvasZoom(1)

  /** Canvas-scoped keyboard shortcuts (only fire while the canvas has focus). */
  const handleCanvasKeyDown = (e: React.KeyboardEvent) => {
    const target = e.target as HTMLElement
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable) {
      return
    }
    const mod = e.ctrlKey || e.metaKey
    const k = e.key.toLowerCase()
    if (e.key === 'Escape') { setSelectedIds(new Set()); setCtxMenu(null); return }
    if (k === 'v' && !mod) { e.preventDefault(); setTool('select'); return }
    if (k === 'h' && !mod) { e.preventDefault(); setTool('pan'); return }
    if (k === 'f' && !mod) { e.preventDefault(); e.shiftKey ? handleZoomToSelection() : handleFitView(); return }
    if (e.key === 'Tab') { e.preventDefault(); setPaletteOpen(true); return }
    // Arrow keys nudge the selection (Shift = 1px fine; grid-aware otherwise).
    if (e.key.startsWith('Arrow')) {
      if (selectedIdsRef.current.size === 0) return
      e.preventDefault()
      const step = e.shiftKey ? 1 : (snapToGridRef.current ? GRID_SIZE : 10)
      const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0
      const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0
      if (dx || dy) nudgeSelected(dx, dy)
      return
    }
    if (mod && k === 'a') { e.preventDefault(); handleSelectAll(); return }
    if (mod && k === 'z') { e.preventDefault(); e.shiftKey ? handleRedo() : handleUndo(); return }
    if (mod && k === 'y') { e.preventDefault(); handleRedo(); return }
    if (mod && k === 'c') { e.preventDefault(); handleCopyNodes(); return }
    if (mod && k === 'v') { e.preventDefault(); handlePasteNodes(); return }
    if (mod && k === 'd') { e.preventDefault(); handleDuplicateSelected(); return }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (selectedIdsRef.current.size > 0) { e.preventDefault(); handleDeleteSelected() }
      return
    }
  }

  useEffect(() => {
    // Compute which nodes fall inside the current marquee, unioned with the
    // selection snapshot taken at drag start when the drag was additive.
    const selectionForRect = (r: { x0: number; y0: number; x1: number; y1: number }) => {
      const x0 = Math.min(r.x0, r.x1), x1 = Math.max(r.x0, r.x1)
      const y0 = Math.min(r.y0, r.y1), y1 = Math.max(r.y0, r.y1)
      const hit = new Set<string>(marqueeAdditiveRef.current ? marqueeBaseRef.current : [])
      for (const [id, p] of stepPosRef.current) {
        if (p.x < x1 && p.x + NODE_WIDTH > x0 && p.y < y1 && p.y + NODE_HEIGHT > y0) hit.add(id)
      }
      return hit
    }
    const onMouseUp = () => {
      if (marqueeStartRef.current && marqueeRectRef.current) {
        setSelectedIds(selectionForRect(marqueeRectRef.current))
      }
      panStartRef.current = null
      marqueeStartRef.current = null
      marqueeRectRef.current = null
      setMarquee(null)
    }
    const onMouseMove = (e: MouseEvent) => {
      if (panStartRef.current) {
        setCanvasPan({
          x: panStartRef.current.startPanX + e.clientX - panStartRef.current.x,
          y: panStartRef.current.startPanY + e.clientY - panStartRef.current.y,
        })
      } else if (marqueeStartRef.current) {
        const p = clientToContent(e.clientX, e.clientY)
        const rect = { x0: marqueeStartRef.current.x, y0: marqueeStartRef.current.y, x1: p.x, y1: p.y }
        marqueeRectRef.current = rect
        setMarquee(rect)
        // Live highlight: update the selection as the box sweeps over nodes.
        setSelectedIds(selectionForRect(rect))
      }
    }
    window.addEventListener('mouseup', onMouseUp)
    window.addEventListener('mousemove', onMouseMove)
    return () => {
      window.removeEventListener('mouseup', onMouseUp)
      window.removeEventListener('mousemove', onMouseMove)
    }
  }, [clientToContent])

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

        // Parse EPC List (EPC[,TID[,userdata]] — one per line)
        if (epcList) {
            const lines = epcList.split('\n')
            for (const line of lines) {
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
        const allHhTags: { epc: string; tid?: string; rssi?: string; userdata?: string }[] = []
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
              ...expanded.map(({ epc, customTid, userdata }) => ({
                epc,
                tid: customTid || step.params.tid || epc,
                rssi: getHhTagRssi(),
                userdata,
              })),
            )
        }

        // Add Direct EPCs (EPC[,TID[,userdata]] — one per line)
        if (epcList) {
            const lines = epcList.split('\n')
            for (const line of lines) {
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
        const hhDelayMs = parseInt(step.params.tagDelay?.trim() || handheldDelay, 10) || 20
        await handheldServer.sendEpcs(
          allHhTags,
          hhDelayMs,
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
      case 'CODE':
        await executeCode(step, runVarsRef.current, addLog)
        break
      case 'ASSERT':
        await executeAssert(step, runVarsRef.current, addLog)
        break
      case 'WAIT_UNTIL':
        await executeWaitUntil(step, runVarsRef.current, addLog, signal)
        break
      case 'STOP':
        await executeStop(step, runVarsRef.current, addLog)
        break
      case 'GENERATE':
        await executeGenerate(step, runVarsRef.current, addLog)
        break
      case 'TRANSFORM':
        await executeTransform(step, runVarsRef.current, addLog)
        break
      case 'COMMENT':
        await executeComment(step, runVarsRef.current, addLog)
        break

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

      // Branch / loop nodes are routed by the graph runner, not executed here.
      case 'CONDITION':
      case 'SWITCH':
      case 'RANDOM':
      case 'CALL_SEQUENCE':
      case 'FOR_EACH':
      case 'LOOP_N':
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
        // Disabled (muted) node: skip its action and pass straight through to its
        // first (non-self) outgoing edge, whatever the handle. Keeps the flow intact
        // without a muted self-loop spinning against the step guard.
        if (current.params.disabled) {
          addLog(`⃠ Skipped disabled node "${current.name}"`)
          const passEdge = seqEdges.find((e) => e.from === current!.id && e.to !== current!.id)
          current = passEdge ? byId.get(passEdge.to) ?? null : null
          continue
        }
        let handle = 'out'
        if (current.type === 'CONDITION') {
          const pass = evaluateCondition(current.params, runVarsRef.current)
          addLog(`◇ ${current.name}: ${pass ? 'TRUE' : 'FALSE'} → ${pass ? 'true' : 'false'} branch`)
          handle = pass ? 'true' : 'false'
        } else if (current.type === 'SWITCH') {
          handle = switchHandle(current.params, runVarsRef.current)
          const val = applyTemplate(current.params.switchValue || '', runVarsRef.current)
          const label = handle === 'default'
            ? 'default'
            : (() => {
                const idx = parseInt(handle.slice('case-'.length), 10)
                const c = current.params.switchCases?.[idx]
                return c?.label?.trim() || c?.value || handle
              })()
          addLog(`⌥ ${current.name}: "${val}" → ${label}`)
        } else if (current.type === 'RANDOM') {
          const branches = current.params.randomBranches ?? []
          const weights = branches.map((b) => b.weight ?? 1)
          const idx = branches.length > 0 ? pickWeightedIndex(weights, Math.random()) : 0
          handle = `branch-${idx}`
          const label = branches[idx]?.label?.trim() || `branch ${idx + 1}`
          const saveAs = (current.params.randomSaveAs || '').trim()
          if (saveAs) runVarsRef.current[saveAs] = String(idx)
          addLog(`🎲 ${current.name}: → ${label}`)
        } else if (current.type === 'CALL_SEQUENCE') {
          try {
            const target = sortedSeqs.find(s => s.id === current!.params.callSequenceId)
            if (!target) throw new Error('Call Sequence: no target selected (or it was deleted)')
            addLog(`↳ Call "${target.name}"`)
            await runSequenceGraph(target, signal, stack)
            if (signal.aborted) return
            addLog(`↩ Return from "${target.name}"`)
          } catch (error: any) {
            if (error instanceof AutomationStopSignal) {
              if (error.scope === 'run') throw error
              return
            }
            addLog(`Error at "${current.name}": ${error.message}`)
            if (error.message === 'Aborted') return
            throw error
          }
        } else if (current.type === 'FOR_EACH') {
          try {
            const source = applyTemplate(current.params.forEachSource || '', runVarsRef.current)
            const items = parseListItems(source)
            const itemAs = (current.params.forEachItemAs || 'item').trim() || 'item'
            const indexAs = (current.params.forEachIndexAs || 'index').trim() || 'index'
            const max = Math.max(1, current.params.forEachMax ?? 500)
            const target = sortedSeqs.find(s => s.id === current!.params.forEachSequenceId)
            if (!target) throw new Error('For Each: no target sequence selected (or it was deleted)')
            if (items.length === 0) {
              addLog(`For Each: empty list — skipped`)
            } else {
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
          } catch (error: any) {
            if (error instanceof AutomationStopSignal) {
              if (error.scope === 'run') throw error
              return
            }
            addLog(`Error at "${current.name}": ${error.message}`)
            if (error.message === 'Aborted') return
            throw error
          }
        } else if (current.type === 'LOOP_N') {
          try {
            const rawCount = applyTemplate(current.params.loopCount || '', runVarsRef.current).trim()
            const parsed = Math.floor(Number(rawCount))
            const requested = Number.isFinite(parsed) ? parsed : 0
            const cap = Math.max(1, current.params.loopMax ?? 1000)
            const count = Math.min(Math.max(0, requested), cap)
            const indexAs = (current.params.loopIndexAs || 'i').trim() || 'i'
            const target = sortedSeqs.find(s => s.id === current!.params.loopSequenceId)
            if (!target) throw new Error('Loop N: no target sequence selected (or it was deleted)')
            if (count <= 0) {
              addLog(`Loop N: count is ${requested} — skipped`)
            } else {
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
          } catch (error: any) {
            if (error instanceof AutomationStopSignal) {
              if (error.scope === 'run') throw error
              return
            }
            addLog(`Error at "${current.name}": ${error.message}`)
            if (error.message === 'Aborted') return
            throw error
          }
        } else {
          try {
            await executeStep(current, signal)
          } catch (error: any) {
            if (error instanceof AutomationStopSignal) {
              if (error.scope === 'run') throw error
              return
            }
            addLog(`Error at "${current.name}": ${error.message}`)
            if (error.message === 'Aborted') return
            throw error
          }
        }
        // Surface the latest variable values to the live inspector.
        publishRunVars()
        const nextEdge = seqEdges.find(e => e.from === current!.id && (e.sourceHandle ?? 'out') === handle)
        current = nextEdge ? byId.get(nextEdge.to) ?? null : null
      }
    }
  }

  const resolveTopLevelSequences = useCallback((all: AutomationSequence[]): AutomationSequence[] => {
    // Sequences used purely as sub-routines (targets of Call Sequence / For Each / Loop N)
    // don't auto-run at the top level — they run only when called. If that would leave
    // nothing to run (e.g. mutually-calling sequences), fall back to running them all.
    const calledIds = new Set<string>()
    for (const s of all) {
      for (const st of s.steps) {
        if (st.type === 'CALL_SEQUENCE' && st.params.callSequenceId) calledIds.add(st.params.callSequenceId)
        if (st.type === 'FOR_EACH' && st.params.forEachSequenceId) calledIds.add(st.params.forEachSequenceId)
        if (st.type === 'LOOP_N' && st.params.loopSequenceId) calledIds.add(st.params.loopSequenceId)
      }
    }
    const topLevelSeqs = all.filter(s => !calledIds.has(s.id))
    return topLevelSeqs.length > 0 ? topLevelSeqs : all
  }, [])

  /** Start automation. Pass `onlyIds` to run specific sequence(s) regardless of the scope selector. */
  const handleRun = async (onlyIds?: string[]) => {
    let runnableSeqs: AutomationSequence[]
    if (onlyIds && onlyIds.length > 0) {
      const idSet = new Set(onlyIds)
      runnableSeqs = sortedSeqs.filter(s => idSet.has(s.id))
    } else if (sequenceRunScope === 'current') {
      if (!selectedSequenceId) {
        toast.error('Select a sequence first')
        return
      }
      runnableSeqs = sortedSeqs.filter(s => s.id === selectedSequenceId)
    } else if (sequenceRunScope === 'selected') {
      if (checkedSequenceIds.size === 0) {
        toast.error('Check one or more sequences to run')
        return
      }
      runnableSeqs = sortedSeqs.filter(s => checkedSequenceIds.has(s.id))
    } else {
      runnableSeqs = resolveTopLevelSequences(sortedSeqs)
    }

    const stepsToRun = runnableSeqs.flatMap(s => s.steps)
    if (runnableSeqs.length === 0) {
      toast.error('No sequences to run')
      return
    }
    if (stepsToRun.length === 0) {
      toast.error('Add steps to the selected sequences first')
      return
    }

    const scopeLabel = onlyIds
      ? (onlyIds.length === 1
          ? `sequence "${runnableSeqs[0]?.name ?? onlyIds[0]}"`
          : `${onlyIds.length} sequences`)
      : sequenceRunScope === 'current'
        ? `current sequence "${runnableSeqs[0]?.name ?? ''}"`
        : sequenceRunScope === 'selected'
          ? `${runnableSeqs.length} selected sequence${runnableSeqs.length === 1 ? '' : 's'}`
          : `${runnableSeqs.length} top-level sequence${runnableSeqs.length === 1 ? '' : 's'}`

    setIsRunning(true)
    if (logFlushTimerRef.current) {
      clearTimeout(logFlushTimerRef.current)
      logFlushTimerRef.current = undefined
    }
    logQueueRef.current = []
    setLog([])
    addLog(`Starting automation (${scopeLabel})...`)
    runVarsRef.current = createRunContext({
      host,
      alePort,
      customPort,
      port: '',
    })
    publishRunVars(true)

    abortControllerRef.current = new AbortController()
    const signal = abortControllerRef.current.signal

    const useDuration = runMode === 'duration'
    const durationSec = Math.max(1, parseInt(runDurationSeconds) || 300)
    const endTime = useDuration ? Date.now() + durationSec * 1000 : 0

    const loops = useDuration
      ? Infinity
      : loopCount === 'Inf'
        ? Infinity
        : loopCount === 'custom'
          ? Math.max(1, parseInt(customLoopCount) || 1)
          : parseInt(loopCount) || 1
    let loopNum = 0

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
          setRunningSeqId(seq.id)
          await runSequenceGraph(seq, signal)
        }
      }
      addLog('Automation completed successfully')
    } catch (error: any) {
      if (error instanceof AutomationStopSignal) {
        addLog(`Automation stopped by Stop node (${error.scope === 'run' ? 'end run' : 'end sequence'})`)
      } else if (error.message !== 'Aborted') {
        addLog(`Automation failed: ${error.message}`)
        toast.error('Automation failed')
      } else {
        addLog('Automation stopped by user')
      }
    } finally {
      flushLogQueue()
      publishRunVars(true)
      setIsRunning(false)
      setCurrentSequenceIndex(null)
      setCurrentRunningStepId(null)
      setRunningSeqId(null)
      abortControllerRef.current = null
    }
  }

  const toggleSequenceChecked = (seqId: string) => {
    setCheckedSequenceIds(prev => {
      const next = new Set(prev)
      if (next.has(seqId)) next.delete(seqId)
      else next.add(seqId)
      return next
    })
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
        const normalized = parseWorkflowSequences(JSON.parse(reader.result as string))
        if (!normalized) {
          toast.error('Invalid workflow file format')
          return
        }
        setSequences(prev => [...prev, ...normalized])
        setSelectedSequenceId(normalized[0]?.id ?? null)
        toast.success(`Imported ${normalized.length} sequence(s)`)
      } catch (err) {
        console.error('Import failed:', err)
        toast.error('Failed to parse workflow file')
      }
    }
    reader.readAsText(file, 'UTF-8')
  }

  const handleLoadDemo = () => {
    const normalized = parseWorkflowSequences(DEMO_WORKFLOW)
    if (!normalized) return
    setSequences(prev => [...prev, ...normalized])
    setSelectedSequenceId(normalized[0]?.id ?? null)
    toast.success(`Loaded ${normalized.length} demo sequence(s) — press ▶ Start on “1 · Basics”`)
  }

  return (
    <div ref={rootRef} className="stagger-children h-full flex flex-col gap-0 overflow-hidden">
      {/* Header */}
      <div className="relative flex items-center justify-between px-4 py-3 border-b border-border/50 bg-card/50">
        <div className="flex items-center gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setLeftPanelOpen(o => !o)}>
                {leftPanelOpen ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeftOpen className="h-4 w-4" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">{leftPanelOpen ? 'Hide sequences' : 'Show sequences'} <kbd className="ml-1 rounded border border-border px-1 text-[10px]">[</kbd></TooltipContent>
          </Tooltip>
          {isRunning ? (
            <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-primary/15 text-primary border border-primary/40">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
              </span>
              RUNNING
            </span>
          ) : (
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-green-500/20 text-green-600 dark:text-green-400 border border-green-500/40">
              READY
            </span>
          )}
          <span className="font-semibold text-sm tracking-wide text-muted-foreground">WORKFLOW BUILDER</span>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={() => setPaletteOpen(true)}>
            <Plus className="w-4 h-4 mr-2" />
            ADD NODE
            <kbd className="ml-2 hidden rounded border border-primary-foreground/30 px-1 text-[10px] font-medium sm:inline">Tab</kbd>
          </Button>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setRightPanelOpen(o => !o)}>
                {rightPanelOpen ? <PanelRightClose className="h-4 w-4" /> : <PanelRightOpen className="h-4 w-4" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">{rightPanelOpen ? 'Hide execution' : 'Show execution'} <kbd className="ml-1 rounded border border-border px-1 text-[10px]">]</kbd></TooltipContent>
          </Tooltip>
        </div>
        {/* Indeterminate progress while running */}
        <AnimatePresence>
          {isRunning && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-x-0 -bottom-px h-0.5 overflow-hidden"
            >
              <div className="h-full w-1/4 animate-run-bar rounded-full bg-gradient-to-r from-transparent via-primary to-transparent" />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Main: Sequence list + Canvas + Execution */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* Sequence list (left) */}
        <motion.div
          className={cn(
            'shrink-0 flex flex-col bg-card/50 overflow-hidden',
            leftPanelOpen && 'border-r border-border/50',
          )}
          data-tour="tour-automation-sequences"
          initial={false}
          animate={{ width: leftPanelOpen ? leftPanelWidth : 0, opacity: leftPanelOpen ? 1 : 0 }}
          transition={isResizingLeft ? { duration: 0 } : { type: 'spring', stiffness: 320, damping: 34 }}
        >
          <div className="flex h-full min-h-0 flex-col" style={{ width: leftPanelWidth }}>
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
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-primary" onClick={handleLoadDemo}>
                    <Sparkles className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Load demo workflows (every node type)</TooltipContent>
              </Tooltip>
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
                        className={cn(
                          'group flex items-center gap-1.5 rounded-lg px-2.5 py-2 cursor-pointer transition-all duration-200 min-w-0',
                          selectedSequenceId === seq.id ? 'bg-primary/15 text-primary border border-primary/30' : 'hover:bg-muted/60 hover:translate-x-0.5',
                          runningSeqId === seq.id && 'ring-1 ring-primary/60 shadow-[0_0_12px_hsl(var(--primary)/0.25)]',
                        )}
                        onClick={() => { if (editingSeqId !== seq.id) setSelectedSequenceId(seq.id) }}
                        onDoubleClick={() => startRenameSequence(seq)}
                      >
                        <GripVertical className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              className={`h-4 w-4 shrink-0 rounded border flex items-center justify-center focus:outline-none select-none ${
                                checkedSequenceIds.has(seq.id)
                                  ? 'bg-primary border-primary text-primary-foreground'
                                  : 'border-muted-foreground/40 hover:border-primary/60'
                              }`}
                              aria-label={checkedSequenceIds.has(seq.id) ? 'Uncheck sequence' : 'Check sequence for run'}
                              aria-pressed={checkedSequenceIds.has(seq.id)}
                              onClick={(e) => { e.stopPropagation(); toggleSequenceChecked(seq.id) }}
                            >
                              {checkedSequenceIds.has(seq.id) && <Check className="h-2.5 w-2.5" />}
                            </button>
                          </TooltipTrigger>
                          <TooltipContent side="right">Include in Selected run</TooltipContent>
                        </Tooltip>
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
                        {runningSeqId === seq.id ? (
                          <span className="relative flex h-2 w-2 shrink-0" title="Running">
                            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
                            <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
                          </span>
                        ) : (
                          <span className="text-[10px] text-muted-foreground shrink-0">{seq.steps.length}</span>
                        )}
                        <div className={`flex gap-0.5 shrink-0 transition-opacity ${selectedSequenceId === seq.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                type="button"
                                className="p-0.5 rounded hover:bg-muted focus:outline-none select-none disabled:opacity-40"
                                disabled={isRunning || seq.steps.length === 0}
                                onClick={(e) => { e.stopPropagation(); void handleRun([seq.id]) }}
                              >
                                <Play className="h-3 w-3" />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent side="right">Run this sequence only</TooltipContent>
                          </Tooltip>
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
        </motion.div>

        {/* Resize handle for the sequence panel (drag to resize, double-click to reset) */}
        {leftPanelOpen && (
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize sequence panel"
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

        {/* Workflow Canvas */}
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden relative">
          {/* Editor toolbar (top-left) */}
          <div className="absolute top-3 left-3 z-10 flex flex-wrap items-center gap-1">
            {/* Tool: Select vs Pan (hand) */}
            <div className="flex items-center gap-0.5 rounded-lg border border-border/50 bg-card/90 px-1 py-1 shadow-sm">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant={tool === 'select' ? 'secondary' : 'ghost'}
                    size="icon"
                    className={cn('h-7 w-7', tool === 'select' && 'text-primary')}
                    onClick={() => setTool('select')}
                    aria-pressed={tool === 'select'}
                  >
                    <MousePointer2 className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Select tool — drag to rubber-band select <kbd className="ml-1 rounded border border-border px-1 text-[10px]">V</kbd></TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant={tool === 'pan' ? 'secondary' : 'ghost'}
                    size="icon"
                    className={cn('h-7 w-7', tool === 'pan' && 'text-primary')}
                    onClick={() => setTool('pan')}
                    aria-pressed={tool === 'pan'}
                  >
                    <Hand className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Pan tool — drag to move the canvas <kbd className="ml-1 rounded border border-border px-1 text-[10px]">H</kbd></TooltipContent>
              </Tooltip>
            </div>
            <div className="flex items-center gap-0.5 rounded-lg border border-border/50 bg-card/90 px-1 py-1 shadow-sm">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleUndo} disabled={isRunning || !canUndo}>
                    <Undo2 className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Undo (Ctrl+Z)</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleRedo} disabled={isRunning || !canRedo}>
                    <Redo2 className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Redo (Ctrl+Shift+Z)</TooltipContent>
              </Tooltip>
            </div>
            <div className="flex items-center gap-0.5 rounded-lg border border-border/50 bg-card/90 px-1 py-1 shadow-sm">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleAutoLink} disabled={isRunning || steps.length < 2}>
                    <Spline className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Auto-link nodes left-to-right</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleClearLinks} disabled={isRunning || edges.length === 0}>
                    <Link2Off className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Clear all links</TooltipContent>
              </Tooltip>
            </div>
            <div className="flex items-center gap-0.5 rounded-lg border border-border/50 bg-card/90 px-1 py-1 shadow-sm">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className={cn('h-7 w-7', showGrid && 'text-primary')} onClick={() => setShowGrid((v) => !v)}>
                    <Grid className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">{showGrid ? 'Hide grid' : 'Show grid'}</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className={cn('h-7 w-7', snapToGrid && 'text-primary')} onClick={() => setSnapToGrid((v) => !v)}>
                    <Magnet className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">{snapToGrid ? 'Snapping on' : 'Snap to grid'}</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleFitView} disabled={steps.length === 0}>
                    <Maximize className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Fit to view (F)</TooltipContent>
              </Tooltip>
            </div>
            {/* Connection style — cycle curved → step → straight */}
            <div className="flex items-center gap-0.5 rounded-lg border border-border/50 bg-card/90 px-1 py-1 shadow-sm">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-7 gap-1.5 px-2" onClick={cycleEdgeStyle}>
                    {edgeStyle === 'curved' ? <Spline className="h-3.5 w-3.5" /> : edgeStyle === 'step' ? <CornerDownRight className="h-3.5 w-3.5" /> : <MoveRight className="h-3.5 w-3.5" />}
                    <span className="text-xs font-medium">{EDGE_STYLE_META[edgeStyle].label}</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Connection style: {EDGE_STYLE_META[edgeStyle].hint} — click to cycle</TooltipContent>
              </Tooltip>
            </div>
            {/* Alignment — only while a multi-selection is active */}
            {selectedIds.size >= 2 && !isRunning && (
              <div className="flex items-center gap-0.5 rounded-lg border border-primary/40 bg-card/90 px-1 py-1 shadow-sm">
                <span className="px-1 text-[10px] font-semibold uppercase tracking-wider text-primary">{selectedIds.size}</span>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => alignSelected('hcenter')}>
                      <AlignHorizontalJustifyCenter className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">Align horizontal centers</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => alignSelected('vcenter')}>
                      <AlignVerticalJustifyCenter className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">Align vertical centers</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleDuplicateSelected}>
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">Duplicate (Ctrl+D)</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={handleDeleteSelected}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">Delete selected (Del)</TooltipContent>
                </Tooltip>
              </div>
            )}
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
          {/* Floating run control — visible when the execution panel is hidden */}
          <AnimatePresence>
            {!rightPanelOpen && (
              <div className="pointer-events-none absolute bottom-3 left-1/2 z-10 -translate-x-1/2">
                <motion.div
                  initial={{ opacity: 0, y: 16, scale: 0.9 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 16, scale: 0.9 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 28 }}
                  className="pointer-events-auto flex items-center gap-2 rounded-full border border-border/60 bg-card/95 py-1.5 pl-1.5 pr-4 shadow-lg backdrop-blur"
                >
                  {!isRunning ? (
                    <Button
                      size="sm"
                      className="h-8 rounded-full"
                      onClick={() => void handleRun()}
                      disabled={sequenceRunScope === 'selected' && checkedSequenceIds.size === 0}
                    >
                      <Play className="mr-1.5 h-3.5 w-3.5" />
                      {sequenceRunScope === 'current'
                        ? 'Start current'
                        : sequenceRunScope === 'selected'
                          ? `Start selected${checkedSequenceIds.size > 0 ? ` (${checkedSequenceIds.size})` : ''}`
                          : 'Start all'}
                    </Button>
                  ) : (
                    <Button size="sm" variant="destructive" className="h-8 rounded-full" onClick={handleStop}>
                      <Square className="mr-1.5 h-3.5 w-3.5" /> Stop
                    </Button>
                  )}
                  <span className="text-[11px] text-muted-foreground">
                    {isRunning
                      ? runningSeqId
                        ? `Running: ${sortedSeqs.find(s => s.id === runningSeqId)?.name ?? ''}`
                        : 'Running…'
                      : runMode === 'duration'
                        ? `${runDurationSeconds || '300'}s`
                        : loopCount === 'Inf'
                          ? 'Loop ∞'
                          : `×${loopCount === 'custom' ? customLoopCount || '1' : loopCount}`}
                  </span>
                </motion.div>
              </div>
            )}
          </AnimatePresence>
          {/* Minimap (bottom-left) — overview + click/drag to navigate. Uses a world
              bounding box (nodes + current viewport) so it stays correct even when
              nodes are dragged into negative space. */}
          {steps.length > 0 && (() => {
            const MM_W = 176, MM_H = 116, PAD = 6
            const vp = {
              x: -canvasPan.x / canvasZoom,
              y: -canvasPan.y / canvasZoom,
              w: (canvasSize.w || 1) / canvasZoom,
              h: (canvasSize.h || 1) / canvasZoom,
            }
            let minX = vp.x, minY = vp.y, maxX = vp.x + vp.w, maxY = vp.y + vp.h
            for (const s of steps) {
              const p = s.position ?? { x: 0, y: 0 }
              minX = Math.min(minX, p.x)
              minY = Math.min(minY, p.y)
              maxX = Math.max(maxX, p.x + NODE_WIDTH)
              maxY = Math.max(maxY, p.y + NODE_HEIGHT)
            }
            const bpad = 60
            minX -= bpad; minY -= bpad; maxX += bpad; maxY += bpad
            const worldW = Math.max(maxX - minX, 1)
            const worldH = Math.max(maxY - minY, 1)
            const scale = Math.min((MM_W - PAD * 2) / worldW, (MM_H - PAD * 2) / worldH)
            const navigate = (e: React.MouseEvent) => {
              e.stopPropagation()
              const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
              const contentX = minX + (e.clientX - rect.left - PAD) / scale
              const contentY = minY + (e.clientY - rect.top - PAD) / scale
              setCanvasPan({
                x: (canvasSize.w || 0) / 2 - contentX * canvasZoom,
                y: (canvasSize.h || 0) / 2 - contentY * canvasZoom,
              })
            }
            return (
              <div
                className="absolute bottom-3 left-3 z-10 overflow-hidden rounded-lg border border-border/50 bg-card/90 shadow-sm cursor-pointer"
                style={{ width: MM_W, height: MM_H }}
                onMouseDown={navigate}
                onMouseMove={(e) => { if (e.buttons === 1) navigate(e) }}
                title="Minimap — click to navigate"
              >
                <svg width={MM_W} height={MM_H} className="block">
                  <g transform={`translate(${PAD},${PAD})`}>
                    <rect
                      x={(vp.x - minX) * scale} y={(vp.y - minY) * scale}
                      width={vp.w * scale} height={vp.h * scale}
                      className="fill-primary/10 stroke-primary/60"
                      strokeWidth={1}
                      rx={2}
                    />
                    {steps.map((s) => {
                      const p = s.position ?? { x: 0, y: 0 }
                      const active = currentRunningStepId === s.id
                      const sel = selectedIds.has(s.id)
                      return (
                        <rect
                          key={s.id}
                          x={(p.x - minX) * scale} y={(p.y - minY) * scale}
                          width={NODE_WIDTH * scale} height={NODE_HEIGHT * scale}
                          rx={1.5}
                          className={cn(
                            active ? 'fill-green-500' : sel ? 'fill-primary' : 'fill-muted-foreground/50',
                          )}
                        />
                      )
                    })}
                  </g>
                </svg>
              </div>
            )
          })()}
          <div
            ref={canvasRef}
            className={cn(
              'relative flex-1 min-h-[400px] overflow-hidden rounded-xl border border-border/30 bg-background/40 focus:outline-none',
              spacePan || tool === 'pan' ? 'cursor-grab active:cursor-grabbing' : 'cursor-crosshair',
            )}
            data-tour="tour-automation-canvas"
            role="region"
            aria-label="Workflow canvas"
            tabIndex={0}
            onMouseDown={handleCanvasPanStart}
            onContextMenu={handleCanvasContextMenu}
            onWheel={handleCanvasWheel}
            onKeyDown={handleCanvasKeyDown}
            style={{ minHeight: 400 }}
          >
            {/* Infinite world-aligned grid — covers the full viewport, not just the content box */}
            {showGrid && (
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0 z-0"
                style={{
                  backgroundImage:
                    'radial-gradient(circle, hsl(var(--muted-foreground) / 0.22) 1px, transparent 1px)',
                  backgroundSize: `${GRID_SIZE * canvasZoom}px ${GRID_SIZE * canvasZoom}px`,
                  backgroundPosition: `${canvasPan.x}px ${canvasPan.y}px`,
                }}
              />
            )}
            {/* Full-viewport pan / marquee target (works even outside the content bounding box) */}
            <div data-pan-background className="absolute inset-0 z-0" />
            {/* Empty state is viewport-centered (not world/content-sized) so it stays in the middle of the canvas */}
            {steps.length === 0 && (
              <div className="pointer-events-none absolute inset-0 z-[2] flex items-center justify-center">
                <div className="max-w-[280px] rounded-xl border-2 border-dashed border-border/50 bg-card/50 p-8 text-center text-sm text-muted-foreground">
                  {!selectedSequenceId ? (
                    <>Select a sequence from the list, or add one with the <strong>+</strong> button.</>
                  ) : (
                    <>No nodes yet.<br />Click <strong>ADD NODE</strong> to start.</>
                  )}
                </div>
              </div>
            )}
            <div
              className="relative z-[1] origin-top-left pointer-events-none"
              style={{
                width: contentSize.width,
                height: contentSize.height,
                transform: `translate(${canvasPan.x}px, ${canvasPan.y}px) scale(${canvasZoom})`,
              }}
            >
              {/* Marquee selection rectangle */}
              {marquee && (
                <div
                  className="pointer-events-none absolute z-10 rounded-sm border border-primary/70 bg-primary/10"
                  style={{
                    left: Math.min(marquee.x0, marquee.x1),
                    top: Math.min(marquee.y0, marquee.y1),
                    width: Math.abs(marquee.x1 - marquee.x0),
                    height: Math.abs(marquee.y1 - marquee.y0),
                  }}
                />
              )}

              {/* SVG connections (explicit edges) + live link preview */}
              <svg
                className="absolute top-0 left-0"
                width={contentSize.width}
                height={contentSize.height}
                style={{ overflow: 'visible', pointerEvents: 'none' }}
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
                    edgeStyle={edgeStyle}
                    isLinking={!!linking}
                    isActive={isRunning && currentRunningStepId === edge.from}
                    onDelete={handleDeleteEdge}
                  />
                ))}
                {/* Live preview while dragging a new link */}
                {linking && linkCursor && (() => {
                  const fromStep = steps.find(s => s.id === linking.from)
                  if (!fromStep) return null
                  const pos = fromStep.position ?? { x: 0, y: 0 }
                  const sx = pos.x + NODE_WIDTH
                  const sy = pos.y + sourcePortY(fromStep, linking.handle)
                  const { d } = buildEdgeGeometry(sx, sy, linkCursor.x, linkCursor.y, edgeStyle)
                  return (
                    <path
                      d={d}
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
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
                  isSelected={selectedIds.has(step.id)}
                  isRunning={isRunning}
                  groupDelta={groupDrag && groupDrag.anchor !== step.id ? { x: groupDrag.dx, y: groupDrag.dy } : null}
                  // Every node's input pulses while linking — dropping back onto the
                  // source node itself is valid and creates a self-loop.
                  isLinkTarget={!!linking}
                  onDragStart={handleDragStart}
                  onDrag={handleDrag}
                  onDragEnd={handleDragEnd}
                  onConfigure={handleConfigureNode}
                  onSelect={handleSelectNode}
                  onDelete={handleDeleteStep}
                  onStartLink={handleStartLink}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Resize handle for the execution panel (drag to resize, double-click to reset) */}
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

        {/* Right Sidebar - Execution only (config via dialog) */}
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
                <Label className="w-24 shrink-0">Sequences:</Label>
                <Select
                  value={sequenceRunScope}
                  onValueChange={(v) => setSequenceRunScope(v as 'all' | 'current' | 'selected')}
                  disabled={isRunning}
                >
                  <SelectTrigger className="flex-1">
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
              {sequenceRunScope === 'current' && selectedSequence && (
                <p className="text-[11px] text-muted-foreground pl-[6.5rem] leading-snug">
                  {selectedSequence.name}
                </p>
              )}
              {sequenceRunScope === 'selected' && checkedSequenceIds.size === 0 && (
                <p className="text-[11px] text-muted-foreground pl-[6.5rem] leading-snug">
                  Check sequences in the list
                </p>
              )}
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
                <Button
                  onClick={() => void handleRun()}
                  className="flex-1"
                  disabled={
                    sequenceRunScope === 'selected' && checkedSequenceIds.size === 0
                  }
                >
                  <Play className="w-4 h-4 mr-2" />
                  {sequenceRunScope === 'current'
                    ? 'Start current'
                    : sequenceRunScope === 'selected'
                      ? `Start selected${checkedSequenceIds.size > 0 ? ` (${checkedSequenceIds.size})` : ''}`
                      : 'Start all'}
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
                onExpand={() => setVarsExpandedOpen(true)}
                isRunning={isRunning}
              />
              {/* Activity log — one self-contained card: a fixed header of controls
                  over a scrollable body that fills the remaining panel height. Uses
                  flex-1 + min-h-0 so it can never overflow/clip into its neighbours. */}
              <div
                className={cn(
                  'flex flex-1 min-h-0 flex-col overflow-hidden rounded-xl border border-border/50 bg-muted/10',
                  !fullActivityLog && 'opacity-90',
                )}
              >
                <div className="flex shrink-0 items-center gap-2 border-b border-border/50 bg-muted/20 px-3 py-2">
                  <Terminal className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Activity log</span>
                  <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-muted-foreground">
                    {log.length}
                  </span>
                  {isRunning && <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" title="Recording live" />}
                  <div className="ml-auto flex items-center gap-1">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <label
                          htmlFor="automation-detail-logs"
                          className="flex cursor-pointer items-center gap-1.5 rounded-md border border-border/50 bg-background/60 px-2 py-1"
                        >
                          <Switch
                            id="automation-detail-logs"
                            checked={fullActivityLog}
                            onCheckedChange={(v) => {
                              setFullActivityLog(v)
                              setAutomationFullActivityLog(v)
                            }}
                          />
                          <span className="text-[11px] font-medium text-muted-foreground">Detail</span>
                        </label>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="max-w-[15rem] text-xs">
                        Off: no output while running. On: full step-by-step detail.
                      </TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleCopyLog} disabled={log.length === 0} aria-label="Copy log">
                          {logCopied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom">Copy log</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setLog([])} disabled={log.length === 0} aria-label="Clear log">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom">Clear log</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setLogExpandedOpen(true)} aria-label="Expand log">
                          <Maximize2 className="h-3.5 w-3.5" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom">Expand activity log</TooltipContent>
                    </Tooltip>
                  </div>
                </div>
                <ScrollArea className="min-h-0 flex-1">
                  <div className="space-y-0 p-3 font-mono text-xs">
                    {log.length === 0 && (
                      <div className="py-6 text-center text-muted-foreground">
                        {fullActivityLog ? 'Ready to run…' : 'Detail logging off — enable it to record runs'}
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
            </CardContent>
          </Card>
          </div>
        </motion.div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between gap-4 px-4 py-2 border-t border-border/50 bg-card/50 text-xs text-muted-foreground">
        <span className="shrink-0 whitespace-nowrap">• {sortedSeqs.length} SEQUENCES • {steps.length} NODES • {edges.length} LINKS{selectedIds.size > 0 ? ` • ${selectedIds.size} SELECTED` : ''}</span>
        <span className="min-w-0 truncate text-right">Tools: Select (V) / Pan (H) · drag to select · Space/middle-drag pans · arrows nudge · right-click for actions · drag a port onto a node or arrow to connect · double-click to configure</span>
      </div>

      {/* Expanded variables */}
      <Dialog open={varsExpandedOpen} onOpenChange={setVarsExpandedOpen}>
        <DialogContent className="sm:max-w-4xl h-[90vh] max-h-[90vh] overflow-hidden flex flex-col gap-0 p-0">
          <DialogHeader className="px-6 pt-6 pb-3 shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <Braces className="w-5 h-5" />
              Variables
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
            <Button
              variant="outline"
              onClick={handleCopyVars}
              disabled={Object.keys(runVars).length === 0}
              className="gap-1.5"
            >
              {varsCopied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
              {varsCopied ? 'Copied' : 'Copy'}
            </Button>
            <Button onClick={() => setVarsExpandedOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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

      {/* Right-click context menu (nodes + empty canvas) */}
      {ctxMenu && (
        <CanvasContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          onClose={() => setCtxMenu(null)}
          items={
            ctxMenu.nodeId
              ? (() => {
                  // "Disable" when any selected node is currently enabled, else "Enable".
                  const anyEnabled = [...selectedIds].some((id) => !steps.find((s) => s.id === id)?.params.disabled)
                  const n = selectedIds.size
                  return [
                    {
                      label: 'Configure',
                      icon: <Settings2 className="h-3.5 w-3.5" />,
                      shortcut: '⏎⏎',
                      onClick: () => handleConfigureNode(ctxMenu.nodeId!),
                      disabled: isRunning,
                    },
                    {
                      label: n > 1 ? `Duplicate ${n} nodes` : 'Duplicate',
                      icon: <Copy className="h-3.5 w-3.5" />,
                      shortcut: 'Ctrl+D',
                      onClick: handleDuplicateSelected,
                      disabled: isRunning,
                    },
                    {
                      label: n > 1 ? `Copy ${n} nodes` : 'Copy',
                      icon: <Copy className="h-3.5 w-3.5" />,
                      shortcut: 'Ctrl+C',
                      onClick: handleCopyNodes,
                    },
                    {
                      label: anyEnabled ? (n > 1 ? `Disable ${n} nodes` : 'Disable') : (n > 1 ? `Enable ${n} nodes` : 'Enable'),
                      icon: anyEnabled ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />,
                      onClick: () => setDisabledForSelected(anyEnabled),
                      disabled: isRunning,
                    },
                    ...(n >= 2
                      ? ([
                          { separator: true },
                          {
                            label: 'Align horizontal centers',
                            icon: <AlignHorizontalJustifyCenter className="h-3.5 w-3.5" />,
                            onClick: () => alignSelected('hcenter'),
                            disabled: isRunning,
                          },
                          {
                            label: 'Align vertical centers',
                            icon: <AlignVerticalJustifyCenter className="h-3.5 w-3.5" />,
                            onClick: () => alignSelected('vcenter'),
                            disabled: isRunning,
                          },
                        ] as CtxItem[])
                      : []),
                    { separator: true },
                    {
                      label: 'Zoom to selection',
                      icon: <Frame className="h-3.5 w-3.5" />,
                      shortcut: 'Shift+F',
                      onClick: handleZoomToSelection,
                    },
                    { separator: true },
                    {
                      label: n > 1 ? `Delete ${n} nodes` : 'Delete',
                      icon: <Trash2 className="h-3.5 w-3.5" />,
                      shortcut: 'Del',
                      onClick: handleDeleteSelected,
                      disabled: isRunning,
                      danger: true,
                    },
                  ] as CtxItem[]
                })()
              : [
                  {
                    label: 'Add node here…',
                    icon: <Plus className="h-3.5 w-3.5" />,
                    shortcut: 'Tab',
                    onClick: () => {
                      paletteAddPosRef.current = clientToContent(ctxMenu.x, ctxMenu.y)
                      setPaletteOpen(true)
                    },
                    disabled: isRunning || !selectedSequenceId,
                  },
                  {
                    label: 'Paste here',
                    icon: <Copy className="h-3.5 w-3.5" />,
                    shortcut: 'Ctrl+V',
                    onClick: () => handlePasteNodes(clientToContent(ctxMenu.x, ctxMenu.y)),
                    disabled: isRunning || !clipboardRef.current,
                  },
                  { separator: true },
                  {
                    label: 'Select all',
                    shortcut: 'Ctrl+A',
                    onClick: handleSelectAll,
                    disabled: steps.length === 0,
                  },
                  {
                    label: 'Clear selection',
                    onClick: () => setSelectedIds(new Set()),
                    disabled: selectedIds.size === 0,
                  },
                  { separator: true },
                  {
                    label: selectedIds.size > 0 ? 'Zoom to selection' : 'Fit to view',
                    icon: selectedIds.size > 0 ? <Frame className="h-3.5 w-3.5" /> : <Maximize className="h-3.5 w-3.5" />,
                    shortcut: selectedIds.size > 0 ? 'Shift+F' : 'F',
                    onClick: selectedIds.size > 0 ? handleZoomToSelection : handleFitView,
                    disabled: steps.length === 0,
                  },
                ]
          }
        />
      )}

      {/* Searchable node palette (⌘K / Tab) */}
      <NodePalette
        open={paletteOpen}
        onOpenChange={(open) => {
          // Drop any pending cursor placement when the palette closes so a later
          // Tab-triggered add doesn't reuse a stale right-click position.
          if (!open) paletteAddPosRef.current = null
          setPaletteOpen(open)
        }}
        onSelect={handleAddStep}
      />

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
        handheldTabDelay={handheldDelay}
        sequences={sortedSeqs}
        currentSequenceId={selectedSequenceId}
      />
    </div>
  )
}

