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
  Clock, 
  ScanLine, 
  Radio, 
  Smartphone,
  Terminal,
  Plus,
  ChevronDown,
  ArrowRight,
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
import type { AutomationStep, AutomationSequence, ActionType } from '@/lib/automation-types'
import { normalizeSequences, migrateStepsToSequences } from '@/lib/automation-types'
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

const NODE_WIDTH = 200
const NODE_HEIGHT = 100

const STEP_TYPE_STYLES: Record<ActionType, { border: string; bg: string; icon: string; label: string }> = {
  DELAY: { border: 'border-amber-400/40', bg: 'bg-amber-400/10', icon: 'text-amber-400', label: 'DELAY' },
  OCR: { border: 'border-pink-400/40', bg: 'bg-pink-400/10', icon: 'text-pink-400', label: 'OCR' },
  FIXED_TAG: { border: 'border-blue-400/40', bg: 'bg-blue-400/10', icon: 'text-blue-400', label: 'ACTION' },
  HANDHELD_TAG: { border: 'border-emerald-400/40', bg: 'bg-emerald-400/10', icon: 'text-emerald-400', label: 'ACTION' },
  CUSTOM_MESSAGE: { border: 'border-violet-400/40', bg: 'bg-violet-400/10', icon: 'text-violet-400', label: 'CUSTOM' },
  EDGE_BLOCK: { border: 'border-cyan-400/40', bg: 'bg-cyan-400/10', icon: 'text-cyan-400', label: 'EDGE' },
  EDGE_PROCESS: { border: 'border-teal-400/40', bg: 'bg-teal-400/10', icon: 'text-teal-400', label: 'EDGE' },
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
  onDragStart,
  onDrag,
  onDragEnd,
  onConfigure,
  onDelete,
}: {
  step: AutomationStep
  pos: { x: number; y: number }
  canvasZoom: number
  style: { border: string; bg: string; icon: string; label: string }
  isDragging: boolean
  isActive: boolean
  isSelected: boolean
  isRunning: boolean
  onDragStart: (id: string) => void
  onDrag: (id: string, x: number, y: number) => void
  onDragEnd: (id: string, x: number, y: number) => void
  onConfigure: (id: string) => void
  onDelete: (id: string) => void
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
      case 'FIXED_TAG': return step.params.upcList || step.params.epcList ? 'Tag list' : (step.params.upc || step.params.epc || 'Configure')
      case 'HANDHELD_TAG': return step.params.epcList || step.params.upcList ? 'Tag list' : 'Configure'
      case 'CUSTOM_MESSAGE': return step.params.message ? `Send ${(step.params.message || '').length} chars` : 'Configure'
      case 'EDGE_BLOCK': return step.params.edgeBlockName || 'Select block'
      case 'EDGE_PROCESS': {
        const action = step.params.edgeProcessAction === 'stop' ? 'Stop' : 'Start'
        return step.params.edgeProcessName ? `${action} ${step.params.edgeProcessName}` : 'Select process'
      }
      default: return ''
    }
  }

  return (
    <motion.div
      style={{ x, y, width: NODE_WIDTH, transformOrigin: '0 0' }}
      className={cn('absolute', isDragging && 'z-50 cursor-grabbing')}
      initial={false}
      whileHover={isDragging ? undefined : { scale: 1.02 }}
    >
      <Card
        className={`group/node relative w-full overflow-hidden rounded-xl border ${style.border} ${style.bg} bg-background/70 p-3 ${isDragging ? '' : 'backdrop-blur'} transition-shadow hover:shadow-lg cursor-pointer select-none focus:outline-none ${isDragging ? 'shadow-xl ring-2 ring-primary/50' : ''} ${isActive ? 'ring-2 ring-green-500 shadow-[0_0_12px_rgba(34,197,94,0.25)]' : ''}`}
        onPointerDown={(e) => { if (!(e.target as HTMLElement).closest('button')) { e.preventDefault(); onConfigure(step.id) } }}
      >
        <div className="relative space-y-2">
          <div className="flex items-center gap-2">
            <div
              className="flex h-8 w-8 shrink-0 cursor-grab active:cursor-grabbing items-center justify-center rounded-lg border border-border/40 bg-background/60 touch-none"
              onPointerDown={handleGripPointerDown}
            >
              <GripVertical className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${style.border} ${style.bg} bg-background/80 backdrop-blur`}>
              {step.type === 'DELAY' && <Clock className={`h-4 w-4 ${style.icon}`} />}
              {step.type === 'OCR' && <ScanLine className={`h-4 w-4 ${style.icon}`} />}
              {step.type === 'FIXED_TAG' && <Radio className={`h-4 w-4 ${style.icon}`} />}
              {step.type === 'HANDHELD_TAG' && <Smartphone className={`h-4 w-4 ${style.icon}`} />}
              {step.type === 'CUSTOM_MESSAGE' && <Terminal className={`h-4 w-4 ${style.icon}`} />}
              {step.type === 'EDGE_BLOCK' && <Box className={`h-4 w-4 ${style.icon}`} />}
              {step.type === 'EDGE_PROCESS' && <Workflow className={`h-4 w-4 ${style.icon}`} />}
            </div>
            <div className="min-w-0 flex-1">
              <span className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">{style.label}</span>
              <h3 className="truncate text-xs font-semibold text-foreground">{step.name}</h3>
            </div>
            {!isRunning && (
              <div className="flex items-center gap-0.5 shrink-0">
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
          <p className="line-clamp-2 text-[10px] leading-relaxed text-foreground/70">{getDescription()}</p>
          <div className="flex items-center gap-1.5 text-[10px] text-foreground/50">
            <ArrowRight className="h-2.5 w-2.5" />
            <span className="uppercase tracking-wider">Connected</span>
          </div>
        </div>
      </Card>
    </motion.div>
  )
})

const WorkflowConnectionLine = memo(function WorkflowConnectionLine({
  from,
  to,
  steps,
  dragPreview,
}: {
  from: string
  to: string
  steps: AutomationStep[]
  dragPreview: { nodeId: string; x: number; y: number } | null
}) {
  const fromStep = steps.find((s) => s.id === from)
  const toStep = steps.find((s) => s.id === to)
  if (!fromStep || !toStep) return null

  const fromPos =
    dragPreview?.nodeId === from
      ? { x: dragPreview.x, y: dragPreview.y }
      : (fromStep.position ?? { x: 0, y: 0 })
  const toPos =
    dragPreview?.nodeId === to
      ? { x: dragPreview.x, y: dragPreview.y }
      : (toStep.position ?? { x: 0, y: 0 })

  const startX = fromPos.x + NODE_WIDTH
  const startY = fromPos.y + NODE_HEIGHT / 2
  const endX = toPos.x
  const endY = toPos.y + NODE_HEIGHT / 2

  const cp1X = startX + (endX - startX) * 0.5
  const cp2X = endX - (endX - startX) * 0.5
  const path = `M${startX},${startY} C${cp1X},${startY} ${cp2X},${endY} ${endX},${endY}`

  return (
    <path
      d={path}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeDasharray="8,6"
      strokeLinecap="round"
      opacity={0.35}
      className="text-foreground"
    />
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
  const [, setCurrentStepIndex] = useState<number | null>(null)
  const [, setCurrentSequenceIndex] = useState<number | null>(null)
  const [currentRunningStepId, setCurrentRunningStepId] = useState<string | null>(null)
  const [loopCount, setLoopCount] = useState<string>('1')
  const [customLoopCount, setCustomLoopCount] = useState<string>('3')
  const [runMode, setRunMode] = useState<'loops' | 'duration'>('loops')
  const [runDurationSeconds, setRunDurationSeconds] = useState<string>('300')
  const [log, setLog] = useState<string[]>([])
  const [fullActivityLog, setFullActivityLog] = useState(() => getAutomationFullActivityLog())
  const fullActivityLogRef = useRef(fullActivityLog)
  fullActivityLogRef.current = fullActivityLog
  const logEndRef = useRef<HTMLDivElement>(null)
  const abortControllerRef = useRef<AbortController | null>(null)
  const importInputRef = useRef<HTMLInputElement>(null)

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
  }, [log])

  const updateStepsForSequence = useCallback((seqId: string, updater: (steps: AutomationStep[]) => AutomationStep[]) => {
    setSequences(prev => prev.map(seq =>
      seq.id === seqId ? { ...seq, steps: updater(seq.steps) } : seq
    ))
  }, [setSequences])

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

    updateStepsForSequence(selectedSequenceId, (prev) => {
      const updated = prev.map((s) =>
        s.id === nodeId ? { ...s, position: { x: newX, y: newY } } : { ...s, position: s.position ?? { x: 0, y: 0 } },
      )
      return [...updated].sort((a, b) => a.position!.x - b.position!.x)
    })
    setContentSize((prev) => ({
      width: Math.max(prev.width, newX + NODE_WIDTH + 50),
      height: Math.max(prev.height, newY + NODE_HEIGHT + 50),
    }))
  }, [selectedSequenceId, updateStepsForSequence])

  const handleAddStep = (type: ActionType) => {
    if (!selectedSequenceId) {
      toast.error('Select a sequence first')
      return
    }
    const last = steps[steps.length - 1]
    const newPosition = last?.position
      ? { x: last.position!.x + 250, y: last.position!.y }
      : { x: 50, y: 100 }

    const defaultNames: Record<ActionType, string> = {
      DELAY: 'Wait',
      OCR: 'Send OCR',
      FIXED_TAG: 'Fixed Reader Scan',
      HANDHELD_TAG: 'Handheld Scan',
      CUSTOM_MESSAGE: 'Custom Message',
      EDGE_BLOCK: 'Invoke Edge Block',
      EDGE_PROCESS: 'Edge Process',
    }
    const newStep: AutomationStep = {
      id: crypto.randomUUID(),
      type,
      name: defaultNames[type],
      position: newPosition,
      params: {
        duration: 1000,
        message: type === 'CUSTOM_MESSAGE' ? '' : '{"test":1}',
        port: type === 'CUSTOM_MESSAGE' ? customPort : undefined,
        epc: '', upc: '', count: 1, startSerial: 1, tid: '', uid: '0000',
        antenna: '1', rssi: '-45.0', driver: 'llrp', epcList: '', upcList: '', deviceId: '',
        edgeBlockName: edgeSession.blocks[0]?.name ?? '',
        edgeParams: {},
        edgeParamOrder: [],
        edgeProcessName: edgeSession.processes[0]?.name ?? '',
        edgeProcessAction: 'start',
      }
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
    updateStepsForSequence(selectedSequenceId, prev => prev.filter(s => s.id !== id))
    if (selectedStepId === id) {
      setSelectedStepId(null)
      setConfigDialogOpen(false)
    }
  }

  const handleAddSequence = () => {
    const newSeq: AutomationSequence = {
      id: crypto.randomUUID(),
      name: `Sequence ${sortedSeqs.length + 1}`,
      order: sortedSeqs.length,
      steps: []
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
    const clonedSteps: AutomationStep[] = seq.steps.map(s => ({
      ...s,
      id: crypto.randomUUID(),
      position: s.position ? { ...s.position } : undefined,
    }))
    const newSeq: AutomationSequence = {
      id: crypto.randomUUID(),
      name: `${seq.name} (copy)`,
      order: sortedSeqs.length,
      steps: clonedSteps,
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

      case 'OCR':
        addLog(`Sending OCR message...`)
        if (!host) throw new Error('Host not configured')
        await new Promise<void>((resolve, reject) => {
          ocrClient.sendMessage(host, step.params.message || '', 
            (msg) => { addLog(`OCR Success: ${msg}`); resolve() },
            (err) => { addLog(`OCR Error: ${err}`); reject(new Error(err)) }
          )
        })
        break

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
        await new Promise<void>((resolve, reject) => {
          customClient.sendMessage(host, portNum, step.params.message || '',
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

        const getTagRssi = makeRssiPicker(step.params)
        if (step.params.upcList) {
            const expanded = expandUpcListToEpcs(
              step.params.upcList,
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
        if (step.params.epcList) {
            const lines = step.params.epcList.split('\n')
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
        if (fixedTags.length === 0 && (step.params.upc || step.params.epc)) {
             if (step.params.upc) {
                const epcs = EPCGenerator.generateFromUpc(
                    step.params.upc, 
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
             } else if (step.params.epc) {
                for (const targetUid of targetUids) {
                  for (const ant of stepAntennas) {
                    fixedTags.push({
                        epc: step.params.epc,
                        tid: step.params.tid || step.params.epc,
                        uid: targetUid,
                        antenna: ant,
                        rssi: getTagRssi()
                    })
                  }
                }
             }
        }
        
        if (fixedTags.length === 0) throw new Error('No valid EPCs or UPCs specified')

        await emulator.sendTags(fixedTags, step.params.driver || 'llrp', parseInt(delay) || 20, 
          (msg) => addLog(`Fixed: ${msg}`),
          (msg) => addLog(`Fixed Complete: ${msg}`)
        )
        break
      }

      case 'HANDHELD_TAG': {
        addLog(`Emulating Handheld Tags...`)
        const getHhTagRssi = makeRssiPicker(step.params)
        const allHhTags: { epc: string; tid?: string; rssi?: string }[] = []

        // Parse UPC List
        if (step.params.upcList) {
            const expanded = expandUpcListToEpcs(
              step.params.upcList,
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
        if (step.params.epcList) {
            const lines = step.params.epcList.split('\n')
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
    
    abortControllerRef.current = new AbortController()
    const signal = abortControllerRef.current.signal

    const useDuration = runMode === 'duration'
    const durationSec = Math.max(1, parseInt(runDurationSeconds) || 300)
    const endTime = useDuration ? Date.now() + durationSec * 1000 : 0

    const loops = useDuration ? Infinity : (loopCount === 'Inf' ? Infinity : parseInt(loopCount) || 1)
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
        
        let globalStepIdx = 0
        for (let seqIdx = 0; seqIdx < sortedSeqs.length; seqIdx++) {
          const seq = sortedSeqs[seqIdx]
          if (seq.steps.length === 0) continue
          addLog(`▶ Sequence ${seqIdx + 1}: ${seq.name}`)
          setCurrentSequenceIndex(seqIdx)
          for (let j = 0; j < seq.steps.length; j++) {
            if (signal.aborted) break
            setCurrentStepIndex(globalStepIdx)
            setCurrentRunningStepId(seq.steps[j].id)
            try {
              await executeStep(seq.steps[j], signal)
            } catch (error: any) {
              addLog(`Error at Sequence ${seqIdx + 1} step ${j + 1}: ${error.message}`)
              if (error.message === 'Aborted') break
              throw error
            }
            globalStepIdx++
          }
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
      setCurrentStepIndex(null)
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
        const validTypes: ActionType[] = ['DELAY', 'OCR', 'FIXED_TAG', 'HANDHELD_TAG', 'CUSTOM_MESSAGE']
        const normalized = normalizeSequences(seqs.map((s: any) => ({
          id: crypto.randomUUID(),
          name: String(s.name || 'Imported').slice(0, 100),
          order: typeof s.order === 'number' ? s.order : 0,
          steps: (s.steps || []).map((st: any) => ({
            id: crypto.randomUUID(),
            type: validTypes.includes(st.type) ? st.type : 'DELAY',
            name: String(st.name || 'Step').slice(0, 100),
            position: Array.isArray(st.position) ? { x: st.position[0] ?? 0, y: st.position[1] ?? 0 } : (st.position && typeof st.position.x === 'number' ? st.position : { x: 0, y: 0 }),
            params: typeof st.params === 'object' && st.params !== null ? st.params : {},
          })),
        })))
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

              {/* SVG Connections */}
              <svg
                className="absolute top-0 left-0 pointer-events-none"
                width={contentSize.width}
                height={contentSize.height}
                style={{ overflow: 'visible' }}
                aria-hidden
              >
                {steps.slice(0, -1).map((_, i) => (
                  <WorkflowConnectionLine
                    key={`${steps[i].id}-${steps[i + 1].id}`}
                    from={steps[i].id}
                    to={steps[i + 1].id}
                    steps={steps}
                    dragPreview={dragPreview}
                  />
                ))}
              </svg>

              {/* Nodes */}
              {steps.map((step, index) => (
                <WorkflowNode
                  key={step.id}
                  step={step}
                  pos={step.position ?? { x: 50 + index * 250, y: 100 }}
                  canvasZoom={canvasZoom}
                  style={STEP_TYPE_STYLES[step.type]}
                  isDragging={draggingNodeId === step.id}
                  isActive={currentRunningStepId === step.id}
                  isSelected={selectedStepId === step.id}
                  isRunning={isRunning}
                  onDragStart={handleDragStart}
                  onDrag={handleDrag}
                  onDragEnd={handleDragEnd}
                  onConfigure={handleConfigureNode}
                  onDelete={handleDeleteStep}
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
                  'flex-1 min-h-[120px] max-h-[320px] border border-border/50 rounded-xl bg-muted/10 overflow-hidden flex flex-col',
                  !fullActivityLog && 'opacity-80',
                )}
              >
                <ScrollArea className="flex-1 h-full">
                  <div className="p-3 font-mono text-xs space-y-0">
                    {log.length === 0 && (
                      <div className="text-muted-foreground text-center py-4">
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
                    <div ref={logEndRef} />
                  </div>
                </ScrollArea>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-4 py-2 border-t border-border/50 bg-card/50 text-xs text-muted-foreground">
        <span>• {sortedSeqs.length} SEQUENCES • {steps.length} NODES • {Math.max(0, steps.length - 1)} CONNECTIONS</span>
        <span>Double-click sequence to rename • Click node or ⚙ to configure • ⋮⋮ Drag to move • Drag background to pan</span>
      </div>

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
      />
    </div>
  )
}

