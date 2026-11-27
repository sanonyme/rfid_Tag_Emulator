import {
  useState,
  useCallback,
  useMemo,
  useRef,
  useEffect,
  type DragEvent,
  type MouseEvent as ReactMouseEvent,
} from 'react'
import { createPortal } from 'react-dom'
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  ConnectionMode,
  MiniMap,
  Panel,
  MarkerType,
  SelectionMode,
  applyNodeChanges,
  useReactFlow,
  type Node,
  type NodeChange,
  type Connection,
  type NodeTypes,
  type EdgeTypes,
  type OnConnectEnd,
  type OnConnectStartParams,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { toPng } from 'html-to-image'
import { motion, AnimatePresence } from 'framer-motion'
import {
  MousePointer2,
  Hand,
  Undo2,
  Redo2,
  Spline,
  Link2Off,
  Grid,
  Magnet,
  Maximize,
  CornerDownRight,
  MoveRight,
  Frame,
  Zap,
  AlignHorizontalJustifyCenter,
  AlignVerticalJustifyCenter,
  Copy,
  Trash2,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Play,
  Square,
  Plus,
  Settings2,
  Eye,
  EyeOff,
  LayoutGrid,
  ArrowRightLeft,
  ArrowDownUp,
  Search,
  X,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Camera,
  Eraser,
  Key,
} from 'lucide-react'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { THEME_CHANGE_EVENT } from '@/lib/themes'
import { useCrispFlowViewport } from '@/lib/use-crisp-flow-viewport'
import type {
  ActionType,
  AutomationEdge,
  AutomationFrame,
  AutomationSequence,
  AutomationStep,
} from '@/lib/automation-types'
import {
  COMMENT_HEIGHT,
  COMMENT_WIDTH,
  getNodeHeight,
  getNodeOutputs,
  NODE_WIDTH,
  type LayoutDirection,
  type NodeRunTelemetry,
} from '@/lib/automation-layout'
import { NODE_VISUAL_STYLES } from '@/lib/automation-node-styles'
import type { ValidationIssue } from '@/lib/automation-validation'
import { WorkflowStepNode, type WorkflowStepFlowNode } from './WorkflowStepNode'
import { WorkflowFrameNode, type WorkflowFrameFlowNode } from './WorkflowFrameNode'
import { WorkflowEdge, type EdgeStyle, type WorkflowFlowEdge } from './WorkflowEdge'
import { DND_NODE_MIME } from './NodeLibrarySidebar'

export type EditorTool = 'select' | 'pan'
export type GridStyle = 'dots' | 'lines' | 'none'

const GRID_SIZE = 20

const EDGE_STYLE_META: Record<EdgeStyle, { label: string; hint: string }> = {
  curved: { label: 'Curved', hint: 'Smooth bezier curves' },
  step: { label: 'Step', hint: 'Right-angled elbows' },
  straight: { label: 'Straight', hint: 'Direct straight lines' },
}

const nodeTypes: NodeTypes = {
  workflowStep: WorkflowStepNode,
  workflowFrame: WorkflowFrameNode,
}

const edgeTypes: EdgeTypes = {
  workflowEdge: WorkflowEdge,
}

type AnyFlowNode = WorkflowStepFlowNode | WorkflowFrameFlowNode

type CtxItem =
  | { separator: true }
  | {
      separator?: false
      label: string
      icon?: React.ReactNode
      shortcut?: string
      danger?: boolean
      disabled?: boolean
      onClick: () => void
    }

function ContextMenuPortal({
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
  useEffect(() => {
    const close = () => onClose()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('pointerdown', close)
    window.addEventListener('keydown', onKey)
    window.addEventListener('blur', close)
    return () => {
      window.removeEventListener('pointerdown', close)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('blur', close)
    }
  }, [onClose])

  if (typeof document === 'undefined') return null
  const left = Math.min(x, window.innerWidth - 230)
  const top = Math.min(y, window.innerHeight - Math.min(items.length * 32 + 16, 420))

  return createPortal(
    <div
      style={{ left, top }}
      className="fixed z-[250] min-w-[216px] rounded-xl border border-border/80 bg-popover/95 p-1 shadow-2xl backdrop-blur-md"
      onPointerDown={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((item, idx) =>
        item.separator ? (
          <div key={idx} className="my-1 h-px bg-border/60" />
        ) : (
          <button
            key={idx}
            type="button"
            disabled={item.disabled}
            onClick={() => {
              onClose()
              item.onClick()
            }}
            className={cn(
              'flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs transition-colors disabled:pointer-events-none disabled:opacity-40',
              item.danger
                ? 'text-destructive hover:bg-destructive/15'
                : 'text-foreground hover:bg-accent',
            )}
          >
            <span className="flex h-4 w-4 shrink-0 items-center justify-center opacity-80">
              {item.icon}
            </span>
            <span className="flex-1 truncate font-medium">{item.label}</span>
            {item.shortcut && (
              <kbd className="rounded border border-border/60 bg-muted/60 px-1 py-px font-mono text-[9.5px] text-muted-foreground">
                {item.shortcut}
              </kbd>
            )}
          </button>
        ),
      )}
    </div>,
    document.body,
  )
}

export interface AutomationCanvasProps {
  selectedSequenceId: string | null
  steps: AutomationStep[]
  edges: AutomationEdge[]
  frames: AutomationFrame[]
  allSequences: AutomationSequence[]
  selectedIds: Set<string>
  setSelectedIds: React.Dispatch<React.SetStateAction<Set<string>>>
  nodeTelemetry: Record<string, NodeRunTelemetry>
  onClearTelemetry: () => void
  validationIssues: ValidationIssue[]
  currentRunningStepId: string | null
  isRunning: boolean
  runMode: 'loops' | 'duration' | 'parallel'
  sequenceRunScope: 'all' | 'current' | 'selected'
  checkedSequenceIds: Set<string>
  runningSeqId: string | null
  runningSeqIds: Set<string>
  loopCount: string
  customLoopCount: string
  runDurationSeconds: string
  rightPanelOpen: boolean
  tool: EditorTool
  setTool: (t: EditorTool) => void
  edgeStyle: EdgeStyle
  onCycleEdgeStyle: () => void
  canUndo: boolean
  canRedo: boolean
  onUndo: () => void
  onRedo: () => void
  activeTriggerCount: number
  onOpenTriggers: () => void
  vaultCount: number
  onOpenVault: () => void
  hasClipboard: boolean
  onPositionsCommit: (updates: Map<string, { x: number; y: number }>) => void
  onAddEdge: (from: string, to: string, sourceHandle: string, targetHandle?: string) => void
  onDeleteEdge: (edgeId: string) => void
  onReconnectEdge: (
    oldEdgeId: string,
    from: string,
    to: string,
    sourceHandle: string,
    targetHandle?: string,
  ) => void
  onAutoLink: () => void
  onClearLinks: () => void
  onAutoLayout: (dir: LayoutDirection) => void
  onConfigureNode: (id: string) => void
  onDeleteSteps: (ids: Set<string>) => void
  onDuplicateSteps: (ids: Set<string>) => void
  onCopySteps: (ids: Set<string>) => void
  onPasteSteps: (at?: { x: number; y: number }) => void
  onSetDisabled: (ids: Set<string>, disabled: boolean) => void
  onAlignSelected: (mode: 'hcenter' | 'vcenter') => void
  onRunFromNode: (stepId: string, singleNode: boolean) => void
  onAddFrame: (at?: { x: number; y: number }) => void
  onCreateFrameFromSelected: () => void
  onUpdateFrame: (id: string, updates: Partial<AutomationFrame>) => void
  onDeleteFrame: (id: string) => void
  onMoveFrameWithNodes: (frameId: string, newX: number, newY: number, dx: number, dy: number) => void
  onDropNodeAt: (type: ActionType, pos: { x: number; y: number }) => void
  onOpenPaletteAt: (pos: { x: number; y: number }) => void
  onRequestInsertOnEdge: (edgeId: string, midpoint: { x: number; y: number }) => void
  onRequestConnectNewNode: (fromStepId: string, sourceHandle: string, pos: { x: number; y: number }) => void
  onRun: () => void
  onStop: () => void
}

function AutomationCanvasInner(props: AutomationCanvasProps) {
  const {
    selectedSequenceId,
    steps,
    edges,
    frames,
    allSequences,
    selectedIds,
    setSelectedIds,
    nodeTelemetry,
    onClearTelemetry,
    validationIssues,
    currentRunningStepId,
    isRunning,
    runMode,
    sequenceRunScope,
    checkedSequenceIds,
    runningSeqId,
    runningSeqIds,
    loopCount,
    customLoopCount,
    runDurationSeconds,
    rightPanelOpen,
    tool,
    setTool,
    edgeStyle,
    onCycleEdgeStyle,
    canUndo,
    canRedo,
    onUndo,
    onRedo,
    activeTriggerCount,
    onOpenTriggers,
    vaultCount,
    onOpenVault,
    hasClipboard,
    onPositionsCommit,
    onAddEdge,
    onDeleteEdge,
    onReconnectEdge,
    onAutoLink,
    onClearLinks,
    onAutoLayout,
    onConfigureNode,
    onDeleteSteps,
    onDuplicateSteps,
    onCopySteps,
    onPasteSteps,
    onSetDisabled,
    onAlignSelected,
    onRunFromNode,
    onAddFrame,
    onCreateFrameFromSelected,
    onUpdateFrame,
    onDeleteFrame,
    onMoveFrameWithNodes,
    onDropNodeAt,
    onOpenPaletteAt,
    onRequestInsertOnEdge,
    onRequestConnectNewNode,
    onRun,
    onStop,
  } = props

  const rf = useReactFlow()
  const wrapperRef = useRef<HTMLDivElement>(null)

  const [gridStyle, setGridStyle] = useState<GridStyle>(() => {
    const saved = localStorage.getItem('automation-grid-style')
    return saved === 'lines' || saved === 'none' || saved === 'dots' ? saved : 'dots'
  })
  const [snapToGrid, setSnapToGrid] = useState<boolean>(
    () => localStorage.getItem('automation-snap-grid') === '1',
  )
  const [zoomPct, setZoomPct] = useState(100)

  const handleSetViewport = useCallback(
    (vp: { x: number; y: number; zoom: number }, options?: { duration?: number }) => {
      void rf.setViewport(vp, options)
    },
    [rf],
  )
  const handleMoveZoomLabel = useCallback((vp: { zoom: number }) => {
    const pct = Math.round(vp.zoom * 100)
    setZoomPct((cur) => (cur === pct ? cur : pct))
  }, [])
  const { handleMove, handleMoveEnd } = useCrispFlowViewport({
    containerRef: wrapperRef,
    setViewport: handleSetViewport,
    onMoveZoom: handleMoveZoomLabel,
  })
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [validationOpen, setValidationOpen] = useState(false)
  const [ctxMenu, setCtxMenu] = useState<{
    x: number
    y: number
    nodeId: string | null
  } | null>(null)
  const [showMinimap, setShowMinimap] = useState(true)
  const [selectedFrameId, setSelectedFrameId] = useState<string | null>(null)
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null)
  const [colorMode, setColorMode] = useState<'dark' | 'light'>(() =>
    typeof document !== 'undefined' && document.documentElement.classList.contains('dark')
      ? 'dark'
      : 'light',
  )

  useEffect(() => {
    const syncColorMode = () => {
      setColorMode(document.documentElement.classList.contains('dark') ? 'dark' : 'light')
    }
    syncColorMode()
    window.addEventListener(THEME_CHANGE_EVENT, syncColorMode)
    const observer = new MutationObserver(syncColorMode)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => {
      window.removeEventListener(THEME_CHANGE_EVENT, syncColorMode)
      observer.disconnect()
    }
  }, [])

  const connectStartRef = useRef<OnConnectStartParams | null>(null)
  const connectSucceededRef = useRef(false)
  const frameDragStartRef = useRef<Map<string, { x: number; y: number }>>(new Map())

  useEffect(() => {
    localStorage.setItem('automation-grid-style', gridStyle)
  }, [gridStyle])
  useEffect(() => {
    localStorage.setItem('automation-snap-grid', snapToGrid ? '1' : '0')
  }, [snapToGrid])

  const sequenceNameById = useMemo(
    () => new Map(allSequences.map((s) => [s.id, s.name])),
    [allSequences],
  )

  const issuesByStepId = useMemo(() => {
    const map = new Map<string, ValidationIssue[]>()
    for (const issue of validationIssues) {
      const list = map.get(issue.stepId) ?? []
      list.push(issue)
      map.set(issue.stepId, list)
    }
    return map
  }, [validationIssues])

  const searchMatches = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return new Set<string>()
    return new Set(
      steps
        .filter(
          (s) =>
            s.name.toLowerCase().includes(q) ||
            s.type.toLowerCase().includes(q) ||
            JSON.stringify(s.params).toLowerCase().includes(q),
        )
        .map((s) => s.id),
    )
  }, [steps, searchQuery])

  // Stable callbacks passed into node data
  const handleDuplicateSingle = useCallback(
    (id: string) => onDuplicateSteps(new Set([id])),
    [onDuplicateSteps],
  )
  const handleDeleteSingle = useCallback(
    (id: string) => onDeleteSteps(new Set([id])),
    [onDeleteSteps],
  )
  const handleToggleDisableSingle = useCallback(
    (id: string, disabled: boolean) => onSetDisabled(new Set([id]), disabled),
    [onSetDisabled],
  )

  // Build React Flow nodes from frames + steps
  const externalNodes = useMemo<AnyFlowNode[]>(() => {
    const frameNodes: WorkflowFrameFlowNode[] = frames.map((frame) => ({
      id: `frame:${frame.id}`,
      type: 'workflowFrame',
      position: { x: frame.x, y: frame.y },
      style: { width: frame.width, height: frame.height },
      zIndex: 0,
      selected: selectedFrameId === frame.id,
      data: {
        frame,
        onUpdate: onUpdateFrame,
        onDelete: onDeleteFrame,
      },
    }))

    const stepNodes: WorkflowStepFlowNode[] = steps.map((step, index) => ({
      id: step.id,
      type: 'workflowStep',
      position: step.position ?? { x: 60 + index * (NODE_WIDTH + 80), y: 100 },
      zIndex: 10,
      selected: selectedIds.has(step.id),
      data: {
        step,
        telemetry: nodeTelemetry[step.id],
        issues: issuesByStepId.get(step.id),
        sequenceNameById,
        isSearchMatch: searchOpen && searchMatches.has(step.id),
        onConfigure: onConfigureNode,
        onDelete: handleDeleteSingle,
        onDuplicate: handleDuplicateSingle,
        onToggleDisable: handleToggleDisableSingle,
        onRunNode: onRunFromNode,
      },
    }))

    return [...frameNodes, ...stepNodes]
  }, [
    frames,
    steps,
    selectedIds,
    selectedFrameId,
    nodeTelemetry,
    issuesByStepId,
    sequenceNameById,
    searchOpen,
    searchMatches,
    onUpdateFrame,
    onDeleteFrame,
    onConfigureNode,
    handleDeleteSingle,
    handleDuplicateSingle,
    handleToggleDisableSingle,
    onRunFromNode,
  ])

  // Internal nodes state for 60fps drag responsiveness, synchronized cleanly with externalNodes
  const [rfNodes, setRfNodes] = useState<AnyFlowNode[]>(externalNodes)
  const draggingRef = useRef(false)

  useEffect(() => {
    if (!draggingRef.current) {
      setRfNodes(externalNodes)
    }
  }, [externalNodes])

  const rfEdges = useMemo<WorkflowFlowEdge[]>(() => {
    const stepMap = new Map(steps.map((s) => [s.id, s]))
    return edges
      .filter((e) => stepMap.has(e.from) && stepMap.has(e.to))
      .map((edge) => {
        const srcStep = stepMap.get(edge.from)!
        const outs = getNodeOutputs(srcStep)
        const handleId = edge.sourceHandle ?? 'out'
        const port = outs.find((o) => o.handle === handleId)
        const active = isRunning && currentRunningStepId === edge.from
        return {
          id: edge.id,
          source: edge.from,
          target: edge.to,
          sourceHandle: handleId,
          targetHandle: edge.targetHandle ?? 'in',
          type: 'workflowEdge',
          selected: selectedEdgeId === edge.id,
          animated: active,
          markerEnd: {
            type: MarkerType.ArrowClosed,
            width: 14,
            height: 14,
            color: active
              ? '#10b981'
              : port?.strokeColor
                ? port.strokeColor
                : 'hsl(var(--muted-foreground) / 0.7)',
          },
          data: {
            edgeStyle,
            sourceHandle: handleId,
            branchLabel: port?.label,
            strokeColor: port?.strokeColor || undefined,
            isSelfLoop: edge.from === edge.to,
            isActiveFlow: active,
            onDeleteEdge,
            onInsertOnEdge: onRequestInsertOnEdge,
          },
        }
      })
  }, [steps, edges, edgeStyle, selectedEdgeId, isRunning, currentRunningStepId, onDeleteEdge, onRequestInsertOnEdge])

  // Auto-fit when switching sequences
  const lastSeqRef = useRef<string | null>(null)
  useEffect(() => {
    if (selectedSequenceId !== lastSeqRef.current) {
      lastSeqRef.current = selectedSequenceId
      setSelectedFrameId(null)
      setSelectedEdgeId(null)
      if (steps.length > 0) {
        const t = window.setTimeout(() => {
          void rf.fitView({ padding: 0.18, maxZoom: 1.15, duration: 220 })
        }, 40)
        return () => window.clearTimeout(t)
      }
    }
  }, [selectedSequenceId, steps.length, rf])

  const onNodesChange = useCallback(
    (changes: NodeChange<AnyFlowNode>[]) => {
      setRfNodes((nds) => applyNodeChanges(changes, nds))

      const stepSelectChanges: Array<{ id: string; selected: boolean }> = []
      for (const ch of changes) {
        if (ch.type !== 'select') continue
        if (ch.id.startsWith('frame:')) {
          const fid = ch.id.slice('frame:'.length)
          if (ch.selected) {
            setSelectedFrameId(fid)
            setSelectedEdgeId(null)
          } else {
            setSelectedFrameId((cur) => (cur === fid ? null : cur))
          }
        } else {
          stepSelectChanges.push({ id: ch.id, selected: ch.selected })
          if (ch.selected) setSelectedEdgeId(null)
        }
      }

      if (stepSelectChanges.length > 0) {
        setSelectedIds((prev) => {
          const next = new Set(prev)
          let changed = false
          for (const ch of stepSelectChanges) {
            if (ch.selected) {
              if (!next.has(ch.id)) {
                next.add(ch.id)
                changed = true
              }
            } else if (next.has(ch.id)) {
              next.delete(ch.id)
              changed = true
            }
          }
          return changed ? next : prev
        })
      }
    },
    [setSelectedIds],
  )

  const handleNodeDragStart = useCallback(
    (_evt: ReactMouseEvent, node: Node) => {
      draggingRef.current = true
      if (node.id.startsWith('frame:')) {
        frameDragStartRef.current.set(node.id, { x: node.position.x, y: node.position.y })
      }
    },
    [],
  )

  const handleNodeDragStop = useCallback(
    (_evt: ReactMouseEvent, draggedNode: Node, allDraggedNodes: Node[]) => {
      draggingRef.current = false

      if (draggedNode.id.startsWith('frame:')) {
        const frameId = draggedNode.id.slice('frame:'.length)
        const start = frameDragStartRef.current.get(draggedNode.id)
        frameDragStartRef.current.delete(draggedNode.id)
        const nx = Math.round(draggedNode.position.x)
        const ny = Math.round(draggedNode.position.y)
        const dx = start ? nx - Math.round(start.x) : 0
        const dy = start ? ny - Math.round(start.y) : 0
        if (dx !== 0 || dy !== 0) {
          onMoveFrameWithNodes(frameId, nx, ny, dx, dy)
        }
        return
      }

      const updates = new Map<string, { x: number; y: number }>()
      for (const n of allDraggedNodes) {
        if (!n.id.startsWith('frame:')) {
          updates.set(n.id, { x: Math.round(n.position.x), y: Math.round(n.position.y) })
        }
      }
      if (updates.size > 0) {
        onPositionsCommit(updates)
      }
    },
    [onMoveFrameWithNodes, onPositionsCommit],
  )

  const handleConnect = useCallback(
    (conn: Connection) => {
      if (!conn.source || !conn.target) return
      if (conn.source.startsWith('frame:') || conn.target.startsWith('frame:')) return
      connectSucceededRef.current = true
      onAddEdge(
        conn.source,
        conn.target,
        conn.sourceHandle ?? 'out',
        conn.targetHandle ?? 'in',
      )
    },
    [onAddEdge],
  )

  const handleConnectStart = useCallback(
    (_evt: MouseEvent | TouchEvent, params: OnConnectStartParams) => {
      connectStartRef.current = params
      connectSucceededRef.current = false
    },
    [],
  )

  const handleConnectEnd: OnConnectEnd = useCallback(
    (event) => {
      const start = connectStartRef.current
      connectStartRef.current = null
      if (!start || connectSucceededRef.current || start.handleType !== 'source') return
      if (!start.nodeId || start.nodeId.startsWith('frame:')) return

      // Only trigger drop-to-create when released on empty canvas pane
      const target = event.target as HTMLElement | null
      if (!target?.classList.contains('react-flow__pane')) return

      const clientPt =
        'changedTouches' in event && event.changedTouches[0]
          ? { x: event.changedTouches[0].clientX, y: event.changedTouches[0].clientY }
          : 'clientX' in event
            ? { x: event.clientX, y: event.clientY }
            : null
      if (!clientPt) return

      const flowPos = rf.screenToFlowPosition(clientPt)
      onRequestConnectNewNode(start.nodeId, start.handleId ?? 'out', {
        x: Math.round(flowPos.x),
        y: Math.round(flowPos.y - 52),
      })
    },
    [rf, onRequestConnectNewNode],
  )

  const handleReconnect = useCallback(
    (oldEdge: WorkflowFlowEdge, newConn: Connection) => {
      if (!newConn.source || !newConn.target) return
      onReconnectEdge(
        oldEdge.id,
        newConn.source,
        newConn.target,
        newConn.sourceHandle ?? 'out',
        newConn.targetHandle ?? 'in',
      )
    },
    [onReconnectEdge],
  )

  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    if (e.dataTransfer.types.includes(DND_NODE_MIME)) {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'copy'
    }
  }, [])

  const handleDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      const nodeType = e.dataTransfer.getData(DND_NODE_MIME) as ActionType | ''
      if (!nodeType) return
      e.preventDefault()
      const flowPos = rf.screenToFlowPosition({ x: e.clientX, y: e.clientY })
      onDropNodeAt(nodeType, {
        x: Math.round(flowPos.x - NODE_WIDTH / 2),
        y: Math.round(flowPos.y - 52),
      })
    },
    [rf, onDropNodeAt],
  )

  const focusNode = useCallback(
    (stepId: string) => {
      const step = steps.find((s) => s.id === stepId)
      if (!step) return
      const pos = step.position ?? { x: 0, y: 0 }
      const w = step.type === 'COMMENT' ? COMMENT_WIDTH : NODE_WIDTH
      const h = step.type === 'COMMENT' ? COMMENT_HEIGHT : getNodeHeight(step)
      setSelectedIds(new Set([stepId]))
      void rf.setCenter(pos.x + w / 2, pos.y + h / 2, { zoom: 1.05, duration: 300 })
    },
    [steps, rf, setSelectedIds],
  )

  const handleFitView = useCallback(() => {
    void rf.fitView({ padding: 0.18, maxZoom: 1.2, duration: 260 })
  }, [rf])

  const handleZoomToSelection = useCallback(() => {
    const ids = [...selectedIds]
    if (ids.length === 0) {
      handleFitView()
      return
    }
    void rf.fitView({
      nodes: ids.map((id) => ({ id })),
      padding: 0.25,
      maxZoom: 1.25,
      duration: 260,
    })
  }, [rf, selectedIds, handleFitView])

  const handleAutoLayoutAndFit = useCallback(
    (dir: LayoutDirection) => {
      onAutoLayout(dir)
      window.setTimeout(() => {
        void rf.fitView({ padding: 0.16, maxZoom: 1.15, duration: 280 })
      }, 40)
    },
    [onAutoLayout, rf],
  )

  const handleExportPng = useCallback(async () => {
    const el = wrapperRef.current?.querySelector('.react-flow__viewport') as HTMLElement | null
    if (!el || steps.length === 0) {
      toast.error('Nothing on canvas to export')
      return
    }
    try {
      const dataUrl = await toPng(wrapperRef.current!, {
        pixelRatio: 2,
        backgroundColor: getComputedStyle(document.documentElement).getPropertyValue('--background')
          ? `hsl(${getComputedStyle(document.documentElement).getPropertyValue('--background').trim()})`
          : '#0f172a',
        filter: (node) => {
          if (!(node instanceof HTMLElement)) return true
          return !node.classList.contains('react-flow__panel')
        },
      })
      const a = document.createElement('a')
      a.download = `zeus-workflow-${new Date().toISOString().slice(0, 10)}.png`
      a.href = dataUrl
      a.click()
      toast.success('Workflow diagram exported as PNG')
    } catch (err) {
      toast.error('Export failed', { description: String(err) })
    }
  }, [steps.length])

  // Canvas keyboard shortcuts
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      const target = e.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return
      }
      const mod = e.ctrlKey || e.metaKey
      if (mod && e.key.toLowerCase() === 'f') {
        e.preventDefault()
        setSearchOpen(true)
        return
      }
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) onRedo()
        else onUndo()
        return
      }
      if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault()
        onRedo()
        return
      }
      if (mod && e.key.toLowerCase() === 'c' && selectedIds.size > 0) {
        e.preventDefault()
        onCopySteps(selectedIds)
        return
      }
      if (mod && e.key.toLowerCase() === 'v' && hasClipboard) {
        e.preventDefault()
        onPasteSteps()
        return
      }
      if (mod && e.key.toLowerCase() === 'd' && selectedIds.size > 0) {
        e.preventDefault()
        onDuplicateSteps(selectedIds)
        return
      }
      if (mod && e.key.toLowerCase() === 'a') {
        e.preventDefault()
        setSelectedIds(new Set(steps.map((s) => s.id)))
        return
      }
      if (!mod && !e.altKey) {
        if (e.key === 'Delete' || e.key === 'Backspace') {
          if (selectedIds.size > 0) {
            e.preventDefault()
            onDeleteSteps(selectedIds)
          } else if (selectedEdgeId) {
            e.preventDefault()
            onDeleteEdge(selectedEdgeId)
            setSelectedEdgeId(null)
          } else if (selectedFrameId) {
            e.preventDefault()
            onDeleteFrame(selectedFrameId)
            setSelectedFrameId(null)
          }
        } else if (
          selectedIds.size > 0 &&
          (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowRight')
        ) {
          e.preventDefault()
          const delta = e.shiftKey ? 1 : snapToGrid ? GRID_SIZE : 10
          const dx = e.key === 'ArrowLeft' ? -delta : e.key === 'ArrowRight' ? delta : 0
          const dy = e.key === 'ArrowUp' ? -delta : e.key === 'ArrowDown' ? delta : 0
          const updates = new Map<string, { x: number; y: number }>()
          for (const s of steps) {
            if (!selectedIds.has(s.id)) continue
            const p = s.position ?? { x: 0, y: 0 }
            updates.set(s.id, { x: Math.round(p.x + dx), y: Math.round(p.y + dy) })
          }
          if (updates.size > 0) onPositionsCommit(updates)
        } else if (e.key.toLowerCase() === 'v') {
          e.preventDefault()
          setTool('select')
        } else if (e.key.toLowerCase() === 'h') {
          e.preventDefault()
          setTool('pan')
        } else if (e.key.toLowerCase() === 'f') {
          e.preventDefault()
          if (e.shiftKey) handleZoomToSelection()
          else handleFitView()
        } else if (e.key === 'Escape') {
          setSelectedIds(new Set())
          setSelectedFrameId(null)
          setSelectedEdgeId(null)
          setSearchOpen(false)
          setValidationOpen(false)
        }
      }
    },
    [
      selectedIds,
      selectedEdgeId,
      selectedFrameId,
      snapToGrid,
      steps,
      hasClipboard,
      onUndo,
      onRedo,
      onCopySteps,
      onPasteSteps,
      onDuplicateSteps,
      onDeleteSteps,
      onDeleteEdge,
      onDeleteFrame,
      onPositionsCommit,
      setSelectedIds,
      setTool,
      handleFitView,
      handleZoomToSelection,
    ],
  )

  const cycleGridStyle = () => {
    setGridStyle((g) => (g === 'dots' ? 'lines' : g === 'lines' ? 'none' : 'dots'))
  }

  const hasTelemetry = Object.keys(nodeTelemetry).length > 0
  const errorIssueCount = validationIssues.filter((i) => i.severity === 'error').length
  const warnIssueCount = validationIssues.filter((i) => i.severity === 'warning').length

  const contextMenuItems = useMemo<CtxItem[]>(() => {
    if (!ctxMenu) return []
    const flowPt = rf.screenToFlowPosition({ x: ctxMenu.x, y: ctxMenu.y })
    const roundedPt = { x: Math.round(flowPt.x), y: Math.round(flowPt.y) }

    if (ctxMenu.nodeId) {
      const targetIds = selectedIds.has(ctxMenu.nodeId)
        ? selectedIds
        : new Set([ctxMenu.nodeId])
      const n = targetIds.size
      const ctxStep = steps.find((s) => s.id === ctxMenu.nodeId)
      const ctxRunnable = Boolean(ctxStep && ctxStep.type !== 'COMMENT' && !ctxStep.params.disabled)
      const anyEnabled = [...targetIds].some(
        (id) => !steps.find((s) => s.id === id)?.params.disabled,
      )
      return [
        {
          label: 'Configure node',
          icon: <Settings2 className="h-3.5 w-3.5" />,
          shortcut: 'Dbl-Click',
          onClick: () => onConfigureNode(ctxMenu.nodeId!),
        },
        {
          label: isRunning ? 'Stop & run from here' : 'Run from here',
          icon: <Play className="h-3.5 w-3.5" />,
          disabled: !ctxRunnable,
          onClick: () => onRunFromNode(ctxMenu.nodeId!, false),
        },
        {
          label: isRunning ? 'Stop & run this node' : 'Run this node only',
          icon: <MousePointer2 className="h-3.5 w-3.5" />,
          disabled: !ctxRunnable,
          onClick: () => onRunFromNode(ctxMenu.nodeId!, true),
        },
        { separator: true },
        {
          label: n > 1 ? `Duplicate ${n} nodes` : 'Duplicate',
          icon: <Copy className="h-3.5 w-3.5" />,
          shortcut: 'Ctrl+D',
          onClick: () => onDuplicateSteps(targetIds),
        },
        {
          label: n > 1 ? `Copy ${n} nodes` : 'Copy',
          icon: <Copy className="h-3.5 w-3.5" />,
          shortcut: 'Ctrl+C',
          onClick: () => onCopySteps(targetIds),
        },
        {
          label: anyEnabled
            ? n > 1
              ? `Disable ${n} nodes`
              : 'Disable'
            : n > 1
              ? `Enable ${n} nodes`
              : 'Enable',
          icon: anyEnabled ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />,
          onClick: () => onSetDisabled(targetIds, anyEnabled),
        },
        ...(n >= 2
          ? ([
              { separator: true },
              {
                label: 'Align horizontal centers',
                icon: <AlignHorizontalJustifyCenter className="h-3.5 w-3.5" />,
                onClick: () => onAlignSelected('hcenter'),
              },
              {
                label: 'Align vertical centers',
                icon: <AlignVerticalJustifyCenter className="h-3.5 w-3.5" />,
                onClick: () => onAlignSelected('vcenter'),
              },
            ] as CtxItem[])
          : []),
        { separator: true },
        {
          label: n > 1 ? `Group ${n} nodes in frame` : 'Wrap in frame',
          icon: <Frame className="h-3.5 w-3.5" />,
          onClick: onCreateFrameFromSelected,
        },
        {
          label: 'Zoom to selection',
          icon: <Maximize className="h-3.5 w-3.5" />,
          shortcut: 'Shift+F',
          onClick: handleZoomToSelection,
        },
        { separator: true },
        {
          label: n > 1 ? `Delete ${n} nodes` : 'Delete',
          icon: <Trash2 className="h-3.5 w-3.5" />,
          shortcut: 'Del',
          danger: true,
          onClick: () => onDeleteSteps(targetIds),
        },
      ]
    }

    return [
      {
        label: 'Add node here…',
        icon: <Plus className="h-3.5 w-3.5" />,
        shortcut: 'Tab',
        disabled: !selectedSequenceId,
        onClick: () => onOpenPaletteAt(roundedPt),
      },
      {
        label: 'Add visual frame here',
        icon: <Frame className="h-3.5 w-3.5" />,
        disabled: !selectedSequenceId,
        onClick: () => onAddFrame(roundedPt),
      },
      {
        label: 'Paste here',
        icon: <Copy className="h-3.5 w-3.5" />,
        shortcut: 'Ctrl+V',
        disabled: !hasClipboard,
        onClick: () => onPasteSteps(roundedPt),
      },
      { separator: true },
      {
        label: 'Auto-layout (Left → Right)',
        icon: <ArrowRightLeft className="h-3.5 w-3.5" />,
        disabled: steps.length < 2,
        onClick: () => handleAutoLayoutAndFit('LR'),
      },
      {
        label: 'Auto-layout (Top → Bottom)',
        icon: <ArrowDownUp className="h-3.5 w-3.5" />,
        disabled: steps.length < 2,
        onClick: () => handleAutoLayoutAndFit('TB'),
      },
      { separator: true },
      {
        label: 'Select all',
        shortcut: 'Ctrl+A',
        disabled: steps.length === 0,
        onClick: () => setSelectedIds(new Set(steps.map((s) => s.id))),
      },
      {
        label: 'Fit to view',
        icon: <Maximize className="h-3.5 w-3.5" />,
        shortcut: 'F',
        disabled: steps.length === 0,
        onClick: handleFitView,
      },
    ]
  }, [
    ctxMenu,
    rf,
    selectedIds,
    steps,
    isRunning,
    selectedSequenceId,
    hasClipboard,
    onConfigureNode,
    onRunFromNode,
    onDuplicateSteps,
    onCopySteps,
    onSetDisabled,
    onAlignSelected,
    onCreateFrameFromSelected,
    onDeleteSteps,
    onOpenPaletteAt,
    onAddFrame,
    onPasteSteps,
    setSelectedIds,
    handleZoomToSelection,
    handleFitView,
    handleAutoLayoutAndFit,
  ])

  return (
    <div
      ref={wrapperRef}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      data-tour="tour-automation-canvas"
      className="relative flex-1 min-h-0 h-full overflow-hidden bg-background/40 focus:outline-none"
    >
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        colorMode={colorMode}
        connectionMode={ConnectionMode.Loose}
        onNodesChange={onNodesChange}
        onNodeDragStart={handleNodeDragStart}
        onNodeDragStop={handleNodeDragStop}
        onConnect={handleConnect}
        onConnectStart={handleConnectStart}
        onConnectEnd={handleConnectEnd}
        onReconnect={handleReconnect}
        onMove={handleMove}
        onMoveEnd={handleMoveEnd}
        onEdgeClick={(_e, edge) => {
          setSelectedEdgeId(edge.id)
          setSelectedIds(new Set())
          setSelectedFrameId(null)
        }}
        onPaneContextMenu={(e) => {
          e.preventDefault()
          setCtxMenu({ x: e.clientX, y: e.clientY, nodeId: null })
        }}
        onNodeContextMenu={(e, node) => {
          e.preventDefault()
          if (node.id.startsWith('frame:')) return
          if (!selectedIds.has(node.id)) {
            setSelectedIds(new Set([node.id]))
          }
          setCtxMenu({ x: e.clientX, y: e.clientY, nodeId: node.id })
        }}
        onPaneClick={() => {
          setSelectedIds(new Set())
          setSelectedFrameId(null)
          setSelectedEdgeId(null)
          setValidationOpen(false)
        }}
        snapToGrid={snapToGrid}
        snapGrid={[GRID_SIZE, GRID_SIZE]}
        panOnDrag={tool === 'pan' ? true : [1, 2]}
        selectionOnDrag={tool === 'select'}
        selectionMode={SelectionMode.Partial}
        panOnScroll={false}
        zoomOnScroll
        minZoom={0.2}
        maxZoom={2}
        deleteKeyCode={null}
        proOptions={{ hideAttribution: true }}
        className="zeus-flow-canvas zeus-crisp-flow"
      >
        {gridStyle !== 'none' && (
          <Background
            variant={gridStyle === 'lines' ? BackgroundVariant.Lines : BackgroundVariant.Dots}
            gap={GRID_SIZE}
            size={gridStyle === 'lines' ? 1 : 1.15}
            color="hsl(var(--muted-foreground) / 0.22)"
          />
        )}

        {/* Top-Left Primary Editor Toolbar */}
        <Panel position="top-left" className="flex flex-wrap items-center gap-1.5 !m-3">
          {/* Select / Pan */}
          <div className="flex items-center gap-0.5 rounded-xl border border-border/60 bg-card/90 p-1 shadow-sm backdrop-blur-md">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={tool === 'select' ? 'secondary' : 'ghost'}
                  size="icon"
                  className={cn('h-7 w-7 rounded-lg', tool === 'select' && 'text-primary')}
                  onClick={() => setTool('select')}
                >
                  <MousePointer2 className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Select &amp; marquee (V)</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={tool === 'pan' ? 'secondary' : 'ghost'}
                  size="icon"
                  className={cn('h-7 w-7 rounded-lg', tool === 'pan' && 'text-primary')}
                  onClick={() => setTool('pan')}
                >
                  <Hand className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Pan canvas (H)</TooltipContent>
            </Tooltip>
          </div>

          {/* Undo / Redo */}
          <div className="flex items-center gap-0.5 rounded-xl border border-border/60 bg-card/90 p-1 shadow-sm backdrop-blur-md">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg" onClick={onUndo} disabled={!canUndo}>
                  <Undo2 className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Undo (Ctrl+Z)</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg" onClick={onRedo} disabled={!canRedo}>
                  <Redo2 className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Redo (Ctrl+Shift+Z)</TooltipContent>
            </Tooltip>
          </div>

          {/* Dagre Auto-Layout + Links */}
          <div className="flex items-center gap-0.5 rounded-xl border border-border/60 bg-card/90 p-1 shadow-sm backdrop-blur-md">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1 rounded-lg px-2 text-xs"
                  onClick={() => handleAutoLayoutAndFit('LR')}
                  disabled={steps.length < 2}
                >
                  <ArrowRightLeft className="h-3.5 w-3.5 text-primary" />
                  <span className="hidden xl:inline">Tidy LR</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Auto-layout horizontally (Dagre)</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 rounded-lg"
                  onClick={() => handleAutoLayoutAndFit('TB')}
                  disabled={steps.length < 2}
                >
                  <ArrowDownUp className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Auto-layout vertically (Dagre)</TooltipContent>
            </Tooltip>
            <div className="mx-0.5 h-4 w-px bg-border/60" />
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg" onClick={onAutoLink} disabled={steps.length < 2}>
                  <Spline className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Auto-link nodes left-to-right</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg" onClick={onClearLinks} disabled={edges.length === 0}>
                  <Link2Off className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Clear all connections</TooltipContent>
            </Tooltip>
          </div>

          {/* Edge Style / Grid / Snap / Fit */}
          <div className="flex items-center gap-0.5 rounded-xl border border-border/60 bg-card/90 p-1 shadow-sm backdrop-blur-md">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="sm" className="h-7 gap-1 rounded-lg px-2 text-xs" onClick={onCycleEdgeStyle}>
                  {edgeStyle === 'curved' ? (
                    <Spline className="h-3.5 w-3.5" />
                  ) : edgeStyle === 'step' ? (
                    <CornerDownRight className="h-3.5 w-3.5" />
                  ) : (
                    <MoveRight className="h-3.5 w-3.5" />
                  )}
                  <span className="hidden 2xl:inline">{EDGE_STYLE_META[edgeStyle].label}</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Edge style: {EDGE_STYLE_META[edgeStyle].hint}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className={cn('h-7 w-7 rounded-lg', gridStyle !== 'none' && 'text-primary')}
                  onClick={cycleGridStyle}
                >
                  <Grid className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Grid: {gridStyle} (click to cycle)</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className={cn('h-7 w-7 rounded-lg', snapToGrid && 'text-primary bg-primary/10')}
                  onClick={() => setSnapToGrid((v) => !v)}
                >
                  <Magnet className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">{snapToGrid ? 'Snap to grid: ON' : 'Snap to grid: OFF'}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg" onClick={handleFitView} disabled={steps.length === 0}>
                  <Maximize className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Fit to view (F)</TooltipContent>
            </Tooltip>
          </div>

          {/* Frame + Triggers */}
          <div className="flex items-center gap-0.5 rounded-xl border border-border/60 bg-card/90 p-1 shadow-sm backdrop-blur-md">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1 rounded-lg px-2 text-xs"
                  onClick={() => onAddFrame()}
                  disabled={!selectedSequenceId}
                >
                  <Frame className="h-3.5 w-3.5" />
                  <span className="hidden xl:inline">Frame</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Add visual group frame</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={activeTriggerCount > 0 ? 'secondary' : 'ghost'}
                  size="sm"
                  className={cn(
                    'h-7 gap-1 rounded-lg px-2 text-xs',
                    activeTriggerCount > 0 && 'text-amber-500 font-semibold',
                  )}
                  onClick={onOpenTriggers}
                >
                  <Zap className="h-3.5 w-3.5" />
                  <span className="hidden xl:inline">Triggers</span>
                  {activeTriggerCount > 0 && (
                    <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500/20 px-1 text-[10px] font-bold text-amber-500">
                      {activeTriggerCount}
                    </span>
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Event triggers (Webhook, File Watcher, Interval, Cron)</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={vaultCount > 0 ? 'secondary' : 'ghost'}
                  size="sm"
                  className={cn(
                    'h-7 gap-1 rounded-lg px-2 text-xs',
                    vaultCount > 0 && 'text-primary font-semibold',
                  )}
                  onClick={onOpenVault}
                >
                  <Key className="h-3.5 w-3.5" />
                  <span className="hidden xl:inline">Vault</span>
                  {vaultCount > 0 && (
                    <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-primary/15 px-1 text-[10px] font-bold text-primary">
                      {vaultCount}
                    </span>
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Environment variables &amp; encrypted secrets vault</TooltipContent>
            </Tooltip>
          </div>

          {/* Multi-Selection Actions */}
          {selectedIds.size >= 2 && (
            <div className="flex items-center gap-0.5 rounded-xl border border-primary/40 bg-card/95 p-1 shadow-md backdrop-blur-md">
              <span className="px-1.5 font-mono text-[10px] font-bold text-primary">{selectedIds.size}</span>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg" onClick={() => onAlignSelected('hcenter')}>
                    <AlignHorizontalJustifyCenter className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Align horizontal centers</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg" onClick={() => onAlignSelected('vcenter')}>
                    <AlignVerticalJustifyCenter className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Align vertical centers</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg" onClick={onCreateFrameFromSelected}>
                    <Frame className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Group selected in frame</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg" onClick={() => onDuplicateSteps(selectedIds)}>
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Duplicate (Ctrl+D)</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg text-destructive" onClick={() => onDeleteSteps(selectedIds)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Delete selected (Del)</TooltipContent>
              </Tooltip>
            </div>
          )}
        </Panel>

        {/* Top-Right Utility Bar: Validation + Search + PNG Export + Clear Run Badges */}
        <Panel position="top-right" className="flex items-center gap-1.5 !m-3">
          {/* Validation pill */}
          {steps.length > 0 && (
            <div className="relative">
              <button
                type="button"
                onClick={() => setValidationOpen((o) => !o)}
                className={cn(
                  'flex h-9 items-center gap-1.5 rounded-xl border px-2.5 text-xs font-medium shadow-sm backdrop-blur-md transition-colors',
                  errorIssueCount > 0
                    ? 'border-destructive/40 bg-destructive/10 text-destructive hover:bg-destructive/15'
                    : warnIssueCount > 0
                      ? 'border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400 hover:bg-amber-500/15'
                      : 'border-emerald-500/35 bg-card/90 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10',
                )}
                title="Workflow validation status"
              >
                {errorIssueCount > 0 ? (
                  <AlertCircle className="h-3.5 w-3.5" />
                ) : warnIssueCount > 0 ? (
                  <AlertTriangle className="h-3.5 w-3.5" />
                ) : (
                  <CheckCircle2 className="h-3.5 w-3.5" />
                )}
                <span>
                  {validationIssues.length === 0
                    ? 'Valid'
                    : `${validationIssues.length} issue${validationIssues.length === 1 ? '' : 's'}`}
                </span>
              </button>

              {validationOpen && (
                <div className="absolute right-0 top-full z-40 mt-2 w-80 overflow-hidden rounded-xl border border-border/80 bg-popover/95 shadow-2xl backdrop-blur-md">
                  <div className="flex items-center justify-between border-b border-border/60 px-3 py-2">
                    <span className="text-xs font-semibold">Workflow Validation</span>
                    <button
                      type="button"
                      onClick={() => setValidationOpen(false)}
                      className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="max-h-64 overflow-y-auto p-1.5">
                    {validationIssues.length === 0 ? (
                      <div className="flex flex-col items-center gap-1.5 py-6 text-center text-xs text-muted-foreground">
                        <CheckCircle2 className="h-6 w-6 text-emerald-500" />
                        <span className="font-medium text-foreground">All nodes look good</span>
                        <span>No configuration or wiring problems detected.</span>
                      </div>
                    ) : (
                      validationIssues.map((issue) => (
                        <button
                          key={issue.id}
                          type="button"
                          onClick={() => {
                            focusNode(issue.stepId)
                            setValidationOpen(false)
                          }}
                          className="flex w-full items-start gap-2 rounded-lg px-2.5 py-2 text-left text-xs transition-colors hover:bg-accent"
                        >
                          {issue.severity === 'error' ? (
                            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
                          ) : (
                            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
                          )}
                          <div className="min-w-0 flex-1">
                            <div className="truncate font-semibold text-foreground">{issue.stepName}</div>
                            <div className="text-[11px] text-muted-foreground">{issue.message}</div>
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Quick tools: Search / Clear Run Badges / Export PNG */}
          <div className="flex items-center gap-0.5 rounded-xl border border-border/60 bg-card/90 p-1 shadow-sm backdrop-blur-md">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={searchOpen ? 'secondary' : 'ghost'}
                  size="icon"
                  className={cn('h-7 w-7 rounded-lg', searchOpen && 'text-primary')}
                  onClick={() => setSearchOpen((o) => !o)}
                  disabled={steps.length === 0}
                >
                  <Search className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Find node on canvas (Ctrl+F)</TooltipContent>
            </Tooltip>
            {hasTelemetry && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 rounded-lg"
                    onClick={onClearTelemetry}
                    disabled={isRunning}
                  >
                    <Eraser className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Clear run status badges from nodes</TooltipContent>
              </Tooltip>
            )}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 rounded-lg"
                  onClick={() => void handleExportPng()}
                  disabled={steps.length === 0}
                >
                  <Camera className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Export workflow diagram as PNG</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={showMinimap ? 'secondary' : 'ghost'}
                  size="icon"
                  className={cn('h-7 w-7 rounded-lg', showMinimap && 'text-primary')}
                  onClick={() => setShowMinimap((m) => !m)}
                >
                  <LayoutGrid className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">{showMinimap ? 'Hide minimap' : 'Show minimap'}</TooltipContent>
            </Tooltip>
          </div>
        </Panel>

        {/* Floating In-Canvas Search Bar */}
        {searchOpen && (
          <Panel position="top-center" className="!mt-14">
            <div className="flex w-80 flex-col overflow-hidden rounded-xl border border-border/80 bg-popover/95 shadow-2xl backdrop-blur-md">
              <div className="flex items-center gap-2 px-3 py-1.5">
                <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <Input
                  autoFocus
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      setSearchOpen(false)
                      setSearchQuery('')
                    } else if (e.key === 'Enter' && searchMatches.size > 0) {
                      focusNode([...searchMatches][0])
                    }
                  }}
                  placeholder="Jump to node…"
                  className="h-7 border-0 bg-transparent px-0 text-xs shadow-none focus-visible:ring-0"
                />
                {searchQuery && (
                  <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                    {searchMatches.size}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setSearchOpen(false)
                    setSearchQuery('')
                  }}
                  className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              {searchQuery.trim() && (
                <div className="max-h-48 overflow-y-auto border-t border-border/50 p-1">
                  {searchMatches.size === 0 ? (
                    <div className="py-3 text-center text-xs text-muted-foreground">No matching nodes</div>
                  ) : (
                    steps
                      .filter((s) => searchMatches.has(s.id))
                      .map((s) => {
                        const vis = NODE_VISUAL_STYLES[s.type]
                        const Icon = vis.Icon
                        return (
                          <button
                            key={s.id}
                            type="button"
                            onClick={() => focusNode(s.id)}
                            className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs hover:bg-accent"
                          >
                            <Icon className={cn('h-3.5 w-3.5 shrink-0', vis.iconText)} />
                            <span className="flex-1 truncate font-medium">{s.name}</span>
                            <span className="font-mono text-[9.5px] text-muted-foreground">{vis.badge}</span>
                          </button>
                        )
                      })
                  )}
                </div>
              )}
            </div>
          </Panel>
        )}

        {/* Bottom-Right Zoom Pill */}
        <Panel position="bottom-right" className="!m-3 flex items-center gap-0.5 rounded-xl border border-border/60 bg-card/90 p-1 shadow-sm backdrop-blur-md">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg" onClick={() => void rf.zoomOut({ duration: 150 })}>
                <ZoomOut className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">Zoom out</TooltipContent>
          </Tooltip>
          <span className="w-10 text-center font-mono text-[11px] font-medium tabular-nums">
            {zoomPct}%
          </span>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg" onClick={() => void rf.zoomIn({ duration: 150 })}>
                <ZoomIn className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">Zoom in</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 rounded-lg"
                onClick={() => {
                  void rf.zoomTo(1, { duration: 180 })
                  setZoomPct(100)
                }}
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">Reset zoom to 100%</TooltipContent>
          </Tooltip>
        </Panel>

        {/* Bottom-Left Interactive MiniMap */}
        {showMinimap && steps.length > 0 && (
          <MiniMap
            position="bottom-left"
            pannable
            zoomable
            className="!m-3 !rounded-xl !border !border-border/60 !bg-card/90 !shadow-md backdrop-blur-md"
            style={{ width: 176, height: 112 }}
            maskColor="hsl(var(--background) / 0.65)"
            nodeColor={(n) => {
              if (n.type === 'workflowFrame') return 'hsl(var(--muted) / 0.35)'
              const tel = nodeTelemetry[n.id]
              if (tel?.state === 'running' || tel?.state === 'success') return '#10b981'
              if (tel?.state === 'error') return '#ef4444'
              const step = steps.find((s) => s.id === n.id)
              return step ? NODE_VISUAL_STYLES[step.type].hex : '#64748b'
            }}
          />
        )}

        {/* Floating Run Control when Right Panel is Hidden */}
        <Panel position="bottom-center" className="!mb-3">
          <AnimatePresence>
            {!rightPanelOpen && (
              <motion.div
                initial={{ opacity: 0, y: 14, scale: 0.94 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 14, scale: 0.94 }}
                transition={{ type: 'spring', stiffness: 400, damping: 28 }}
                className="flex items-center gap-2 rounded-full border border-border/60 bg-card/95 py-1.5 pl-1.5 pr-4 shadow-xl backdrop-blur-md"
              >
                {runMode === 'parallel' ? (
                  <>
                    <Button
                      size="sm"
                      className="h-8 rounded-full"
                      onClick={onRun}
                      disabled={sequenceRunScope === 'selected' && checkedSequenceIds.size === 0}
                    >
                      <Play className="mr-1.5 h-3.5 w-3.5" />
                      {sequenceRunScope === 'current'
                        ? 'Start'
                        : sequenceRunScope === 'selected'
                          ? `Start selected${checkedSequenceIds.size > 0 ? ` (${checkedSequenceIds.size})` : ''}`
                          : 'Start All ∥'}
                    </Button>
                    {runningSeqIds.size > 0 && (
                      <Button size="sm" variant="destructive" className="h-8 rounded-full" onClick={onStop}>
                        <Square className="mr-1.5 h-3.5 w-3.5" /> Stop All
                      </Button>
                    )}
                  </>
                ) : !isRunning ? (
                  <Button
                    size="sm"
                    className="h-8 rounded-full"
                    onClick={onRun}
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
                  <Button size="sm" variant="destructive" className="h-8 rounded-full" onClick={onStop}>
                    <Square className="mr-1.5 h-3.5 w-3.5" /> Stop
                  </Button>
                )}
                <span className="text-[11px] text-muted-foreground">
                  {isRunning
                    ? runMode === 'parallel'
                      ? `${runningSeqIds.size} running`
                      : runningSeqId
                        ? `Running: ${sequenceNameById.get(runningSeqId) ?? ''}`
                        : 'Running…'
                    : runMode === 'parallel'
                      ? 'Parallel ∞'
                      : runMode === 'duration'
                        ? `${runDurationSeconds || '300'}s`
                        : loopCount === 'Inf'
                          ? 'Loop ∞'
                          : `×${loopCount === 'custom' ? customLoopCount || '1' : loopCount}`}
                </span>
              </motion.div>
            )}
          </AnimatePresence>
        </Panel>
      </ReactFlow>

      {/* Rich Empty State Overlay */}
      {steps.length === 0 && (
        <div className="pointer-events-none absolute inset-0 z-[5] flex items-center justify-center p-6">
          <div className="pointer-events-auto max-w-sm rounded-2xl border border-dashed border-border/70 bg-card/85 p-6 text-center shadow-lg backdrop-blur-md space-y-3">
            <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/20">
              <Plus className="h-5 w-5" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-semibold text-foreground">
                {!selectedSequenceId ? 'No sequence selected' : 'Start building your workflow'}
              </p>
              <p className="text-xs leading-relaxed text-muted-foreground">
                {!selectedSequenceId
                  ? 'Pick a sequence on the left or click + to create a new one.'
                  : 'Drag nodes from the Nodes tab on the left, drop a template, or press Tab to add your first node.'}
              </p>
            </div>
            {selectedSequenceId && (
              <Button
                size="sm"
                className="rounded-lg gap-1.5"
                onClick={() => onOpenPaletteAt({ x: 120, y: 120 })}
              >
                <Plus className="h-3.5 w-3.5" />
                Add First Node
              </Button>
            )}
          </div>
        </div>
      )}

      {ctxMenu && (
        <ContextMenuPortal
          x={ctxMenu.x}
          y={ctxMenu.y}
          items={contextMenuItems}
          onClose={() => setCtxMenu(null)}
        />
      )}
    </div>
  )
}

export function AutomationCanvas(props: AutomationCanvasProps) {
  return (
    <ReactFlowProvider>
      <AutomationCanvasInner {...props} />
    </ReactFlowProvider>
  )
}
