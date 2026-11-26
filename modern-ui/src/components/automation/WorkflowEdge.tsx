import { memo, useState } from 'react'
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  getSmoothStepPath,
  getStraightPath,
  type Edge,
  type EdgeProps,
} from '@xyflow/react'
import { Plus, X } from 'lucide-react'
import { NODE_HEIGHT, NODE_WIDTH } from '@/lib/automation-layout'
import { cn } from '@/lib/utils'

export type EdgeStyle = 'curved' | 'step' | 'straight'

export interface WorkflowEdgeData extends Record<string, unknown> {
  edgeStyle: EdgeStyle
  sourceHandle?: string
  branchLabel?: string
  strokeColor?: string
  isSelfLoop?: boolean
  isActiveFlow?: boolean
  onDeleteEdge: (edgeId: string) => void
  onInsertOnEdge: (edgeId: string, midpoint: { x: number; y: number }) => void
}

export type WorkflowFlowEdge = Edge<WorkflowEdgeData, 'workflowEdge'>

export const WorkflowEdge = memo(function WorkflowEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  selected,
  markerEnd,
  data,
}: EdgeProps<WorkflowFlowEdge>) {
  const [hovered, setHovered] = useState(false)
  const edgeStyle = data?.edgeStyle ?? 'curved'
  const isActiveFlow = data?.isActiveFlow === true
  const isSelfLoop = data?.isSelfLoop === true

  let edgePath: string
  let labelX: number
  let labelY: number

  if (isSelfLoop) {
    const drop = NODE_HEIGHT * 0.78 + 38
    const midY = Math.max(sourceY, targetY) + drop
    edgePath = `M ${sourceX} ${sourceY} C ${sourceX + 48} ${sourceY + 12}, ${sourceX + 38} ${midY}, ${(sourceX + targetX) / 2} ${midY} C ${targetX - 38} ${midY}, ${targetX - 48} ${targetY + 12}, ${targetX} ${targetY}`
    labelX = (sourceX + targetX) / 2
    labelY = midY
  } else if (edgeStyle === 'step') {
    ;[edgePath, labelX, labelY] = getSmoothStepPath({
      sourceX,
      sourceY,
      sourcePosition,
      targetX,
      targetY,
      targetPosition,
      borderRadius: 14,
    })
  } else if (edgeStyle === 'straight') {
    ;[edgePath, labelX, labelY] = getStraightPath({
      sourceX,
      sourceY,
      targetX,
      targetY,
    })
  } else {
    ;[edgePath, labelX, labelY] = getBezierPath({
      sourceX,
      sourceY,
      sourcePosition,
      targetX,
      targetY,
      targetPosition,
      curvature: 0.35,
    })
  }

  const baseColor = isActiveFlow
    ? '#10b981'
    : selected || hovered
      ? 'hsl(var(--primary))'
      : data?.strokeColor
        ? data.strokeColor
        : 'hsl(var(--muted-foreground) / 0.55)'

  const showControls = hovered || selected

  return (
    <>
      {/* Wide invisible hit target for easy hover & selection */}
      <path
        d={edgePath}
        fill="none"
        stroke="transparent"
        strokeWidth={22}
        className="cursor-pointer"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      />

      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          stroke: baseColor,
          strokeWidth: isActiveFlow ? 2.5 : selected || hovered ? 2.25 : 1.75,
          strokeDasharray: isActiveFlow ? '6 4' : undefined,
          transition: 'stroke 150ms ease, stroke-width 150ms ease',
        }}
      />

      <EdgeLabelRenderer>
        <div
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            pointerEvents: 'all',
          }}
          className="nodrag nopan"
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
        >
          {showControls ? (
            <div className="flex items-center gap-1 rounded-full border border-border/80 bg-popover p-0.5 shadow-md">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  data?.onInsertOnEdge(id, {
                    x: Math.round(labelX - NODE_WIDTH / 2),
                    y: Math.round(labelY - NODE_HEIGHT / 2),
                  })
                }}
                className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/15 text-primary transition-colors hover:bg-primary hover:text-primary-foreground"
                title="Insert a node on this connection"
              >
                <Plus className="h-3 w-3" />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  data?.onDeleteEdge(id)
                }}
                className="flex h-5 w-5 items-center justify-center rounded-full bg-destructive/10 text-destructive transition-colors hover:bg-destructive hover:text-destructive-foreground"
                title="Remove connection"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ) : data?.branchLabel ? (
            <span
              className={cn(
                'rounded-full border px-1.5 py-px font-mono text-[9px] font-bold uppercase tracking-wider shadow-sm',
                data.sourceHandle === 'true'
                  ? 'border-emerald-500/45 bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                  : data.sourceHandle === 'false'
                    ? 'border-rose-500/45 bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300'
                    : data.sourceHandle === 'error'
                      ? 'border-orange-500/45 bg-orange-50 text-orange-700 dark:bg-orange-950 dark:text-orange-300'
                      : 'border-border bg-popover text-muted-foreground',
              )}
            >
              {data.branchLabel}
            </span>
          ) : null}
        </div>
      </EdgeLabelRenderer>
    </>
  )
})
