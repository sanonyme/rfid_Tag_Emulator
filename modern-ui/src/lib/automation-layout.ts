import dagre from '@dagrejs/dagre'
import {
  ERROR_HANDLE,
  nodeSupportsErrorPolicy,
  type AutomationEdge,
  type AutomationStep,
} from './automation-types'

export const NODE_WIDTH = 272
export const NODE_HEIGHT = 104
export const COMMENT_WIDTH = 248
export const COMMENT_HEIGHT = 128

export interface NodeOutputPort {
  handle: string
  label?: string
  /** Tailwind dot/handle bg class */
  color: string
  /** Hex stroke color for edges leaving this port */
  strokeColor: string
}

export type NodeRunState = 'idle' | 'running' | 'success' | 'error' | 'skipped'

export interface NodeRunTelemetry {
  state: NodeRunState
  durationMs?: number
  runCount: number
  lastError?: string
  updatedAt: number
}

/**
 * Ordered output ports exposed by a node.
 * Drives React Flow handles, edge coloring, and port badges.
 */
export function getNodeOutputs(step: AutomationStep): NodeOutputPort[] {
  const base = getBranchOutputs(step)
  if (nodeSupportsErrorPolicy(step.type) && step.params.onError === 'errorOutput') {
    return [
      ...base,
      {
        handle: ERROR_HANDLE,
        label: 'ERR',
        color: '!bg-orange-500',
        strokeColor: '#f97316',
      },
    ]
  }
  return base
}

function getBranchOutputs(step: AutomationStep): NodeOutputPort[] {
  switch (step.type) {
    case 'CONDITION':
      return [
        { handle: 'true', label: 'TRUE', color: '!bg-emerald-500', strokeColor: '#10b981' },
        { handle: 'false', label: 'FALSE', color: '!bg-rose-500', strokeColor: '#f43f5e' },
      ]
    case 'SWITCH': {
      const cases = step.params.switchCases ?? []
      const outs: NodeOutputPort[] = cases.map((c, i) => ({
        handle: `case-${i}`,
        label: (c.label?.trim() || c.value?.trim() || `#${i + 1}`).slice(0, 9),
        color: '!bg-sky-500',
        strokeColor: '#0ea5e9',
      }))
      if (step.params.switchHasDefault !== false) {
        outs.push({ handle: 'default', label: 'DEFAULT', color: '!bg-slate-400', strokeColor: '#94a3b8' })
      }
      return outs.length > 0
        ? outs
        : [{ handle: 'default', label: 'DEFAULT', color: '!bg-slate-400', strokeColor: '#94a3b8' }]
    }
    case 'RANDOM': {
      const branches = step.params.randomBranches ?? []
      const outs: NodeOutputPort[] = branches.map((b, i) => ({
        handle: `branch-${i}`,
        label: (b.label?.trim() || `w${b.weight ?? 1}`).slice(0, 9),
        color: '!bg-purple-500',
        strokeColor: '#a855f7',
      }))
      return outs.length > 0
        ? outs
        : [{ handle: 'branch-0', label: '1', color: '!bg-purple-500', strokeColor: '#a855f7' }]
    }
    case 'PARALLEL_BRANCH': {
      const branches = step.params.parallelBranches ?? [{ label: 'Branch A' }, { label: 'Branch B' }]
      const outs: NodeOutputPort[] = (branches.length > 0 ? branches : [{ label: 'Branch A' }]).map(
        (b, i) => ({
          handle: `branch-${i}`,
          label: (b.label?.trim() || `Branch ${i + 1}`).slice(0, 10),
          color: '!bg-cyan-500',
          strokeColor: '#06b6d4',
        }),
      )
      outs.push({
        handle: 'done',
        label: 'AFTER ALL',
        color: '!bg-emerald-500',
        strokeColor: '#10b981',
      })
      return outs
    }
    case 'COMMENT':
      return []
    default:
      return [{ handle: 'out', color: '!bg-primary', strokeColor: '' }]
  }
}

export function getNodeHeight(step: AutomationStep): number {
  if (step.type === 'COMMENT') return COMMENT_HEIGHT
  const outs = getNodeOutputs(step)
  if (outs.length > 1) return Math.max(NODE_HEIGHT, 92 + outs.length * 29)
  return NODE_HEIGHT
}

export type LayoutDirection = 'LR' | 'TB'

/**
 * Automatic hierarchical DAG layout powered by @dagrejs/dagre.
 * Leaves COMMENT sticky notes neatly tucked above/beside the laid-out graph
 * unless explicitly connected.
 */
export function computeAutoLayout(
  steps: AutomationStep[],
  edges: AutomationEdge[],
  direction: LayoutDirection = 'LR',
): Map<string, { x: number; y: number }> {
  const result = new Map<string, { x: number; y: number }>()
  if (steps.length === 0) return result

  const g = new dagre.graphlib.Graph()
  g.setDefaultEdgeLabel(() => ({}))
  g.setGraph({
    rankdir: direction,
    nodesep: direction === 'LR' ? 56 : 72,
    ranksep: direction === 'LR' ? 96 : 84,
    edgesep: 28,
    marginx: 40,
    marginy: 40,
  })

  const connectedIds = new Set<string>()
  for (const e of edges) {
    connectedIds.add(e.from)
    connectedIds.add(e.to)
  }

  const graphSteps = steps.filter((s) => s.type !== 'COMMENT' || connectedIds.has(s.id))
  const floatingNotes = steps.filter((s) => s.type === 'COMMENT' && !connectedIds.has(s.id))

  for (const step of graphSteps) {
    const w = step.type === 'COMMENT' ? COMMENT_WIDTH : NODE_WIDTH
    const h = getNodeHeight(step)
    g.setNode(step.id, { width: w, height: h })
  }

  // Filter out self-loops for dagre (dagre ignores/errors on some self-loops)
  for (const edge of edges) {
    if (edge.from !== edge.to && g.hasNode(edge.from) && g.hasNode(edge.to)) {
      g.setEdge(edge.from, edge.to)
    }
  }

  dagre.layout(g)

  let maxY = 40
  let minX = 40
  for (const step of graphSteps) {
    const node = g.node(step.id)
    if (!node) continue
    const w = step.type === 'COMMENT' ? COMMENT_WIDTH : NODE_WIDTH
    const h = getNodeHeight(step)
    const x = Math.round(node.x - w / 2)
    const y = Math.round(node.y - h / 2)
    result.set(step.id, { x, y })
    maxY = Math.max(maxY, y + h)
    minX = Math.min(minX, x)
  }

  // Place standalone comment notes in a clean row below the graph
  floatingNotes.forEach((note, idx) => {
    result.set(note.id, {
      x: Math.round(minX + idx * (COMMENT_WIDTH + 32)),
      y: Math.round(maxY + 56),
    })
  })

  return result
}
