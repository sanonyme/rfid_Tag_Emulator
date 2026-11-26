import { memo, useEffect } from 'react'
import { NodeToolbar, Position, useUpdateNodeInternals, type Node, type NodeProps } from '@xyflow/react'
import {
  Play,
  FastForward,
  Settings2,
  Copy,
  Eye,
  EyeOff,
  Trash2,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Loader2,
  StickyNote,
  ArrowRight,
  RotateCw,
} from 'lucide-react'
import { resolveNodePolicy, type AutomationStep } from '@/lib/automation-types'
import {
  COMMENT_HEIGHT,
  COMMENT_WIDTH,
  getNodeOutputs,
  NODE_WIDTH,
  type NodeRunTelemetry,
} from '@/lib/automation-layout'
import { getStepSummary, NODE_VISUAL_STYLES } from '@/lib/automation-node-styles'
import type { ValidationIssue } from '@/lib/automation-validation'
import {
  BaseHandle,
  BaseNode,
  BaseNodeContent,
  BaseNodeFooter,
  BaseNodeHeader,
  BaseNodeHeaderTitle,
  LabeledHandle,
} from './BaseNode'
import { cn } from '@/lib/utils'

export interface WorkflowStepNodeData extends Record<string, unknown> {
  step: AutomationStep
  telemetry?: NodeRunTelemetry
  issues?: ValidationIssue[]
  sequenceNameById: Map<string, string>
  isSearchMatch?: boolean
  onConfigure: (id: string) => void
  onDelete: (id: string) => void
  onDuplicate: (id: string) => void
  onToggleDisable: (id: string, disabled: boolean) => void
  onRunNode: (id: string, singleNode: boolean) => void
}

export type WorkflowStepFlowNode = Node<WorkflowStepNodeData, 'workflowStep'>

const CHIP_TONES = {
  neutral: 'bg-muted text-muted-foreground',
  emerald: 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-400',
  blue: 'bg-blue-500/12 text-blue-600 dark:text-blue-400',
  amber: 'bg-amber-500/12 text-amber-700 dark:text-amber-300',
  rose: 'bg-rose-500/12 text-rose-600 dark:text-rose-400',
  violet: 'bg-violet-500/12 text-violet-600 dark:text-violet-400',
} as const

function formatMs(ms?: number): string {
  if (ms === undefined) return ''
  if (ms < 1000) return `${Math.round(ms)}ms`
  return `${(ms / 1000).toFixed(ms >= 10000 ? 1 : 2)}s`
}

export const WorkflowStepNode = memo(function WorkflowStepNode({
  id,
  data,
  selected,
}: NodeProps<WorkflowStepFlowNode>) {
  const updateNodeInternals = useUpdateNodeInternals()
  const {
    step,
    telemetry,
    issues,
    sequenceNameById,
    isSearchMatch,
    onConfigure,
    onDelete,
    onDuplicate,
    onToggleDisable,
    onRunNode,
  } = data

  const visual = NODE_VISUAL_STYLES[step.type]
  const Icon = visual.Icon
  const outputs = getNodeOutputs(step)
  const outputsKey = outputs.map((o) => o.handle).join('|')

  useEffect(() => {
    updateNodeInternals(id)
  }, [id, outputsKey, updateNodeInternals])

  const summary = getStepSummary(step, sequenceNameById)
  const disabled = step.params.disabled === true
  const policy = resolveNodePolicy(step.params)
  const runState = telemetry?.state ?? 'idle'
  const isRunning = runState === 'running'
  const isSuccess = runState === 'success'
  const isError = runState === 'error'
  const hasErrors = Boolean(issues?.some((i) => i.severity === 'error'))
  const hasWarnings = Boolean(issues?.some((i) => i.severity === 'warning'))
  const runnable = step.type !== 'COMMENT' && !disabled

  // --- Clean Sticky Note node for COMMENT ---
  if (step.type === 'COMMENT') {
    return (
      <div
        style={{ width: COMMENT_WIDTH, minHeight: COMMENT_HEIGHT }}
        onDoubleClick={(e) => {
          e.stopPropagation()
          onConfigure(step.id)
        }}
        className={cn(
          'relative flex flex-col rounded-xl border border-amber-400/45 bg-amber-50/95 dark:bg-amber-950/40 text-amber-950 dark:text-amber-100 shadow-elev-sm transition-[border-color,box-shadow] duration-150',
          selected && 'border-amber-500 ring-2 ring-amber-500/30 shadow-elev-md',
          isSearchMatch && 'ring-2 ring-primary ring-offset-2 ring-offset-background',
        )}
      >
        <NodeToolbar isVisible={selected} position={Position.Top} offset={8}>
          <div className="flex items-center gap-0.5 rounded-lg border border-border bg-popover p-1 shadow-lg">
            <button
              type="button"
              onClick={() => onConfigure(step.id)}
              className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
              title="Edit note"
            >
              <Settings2 className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => onDuplicate(step.id)}
              className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
              title="Duplicate note"
            >
              <Copy className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => onDelete(step.id)}
              className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/15 hover:text-destructive"
              title="Delete note"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </NodeToolbar>

        <div className="flex items-center gap-2 border-b border-amber-400/25 px-3 py-2">
          <StickyNote className="h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
          <span className="truncate text-xs font-semibold">{step.name || 'Note'}</span>
        </div>
        <div className="flex-1 px-3 py-2.5 text-xs leading-relaxed whitespace-pre-wrap break-words opacity-90">
          {step.params.commentText?.trim() || 'Double-click to edit note…'}
        </div>
      </div>
    )
  }

  const isMultiBranch = outputs.length > 1
  const hasFooter = Boolean((telemetry && telemetry.state !== 'idle') || step.params.notes?.trim())

  return (
    <BaseNode
      selected={selected}
      status={runState}
      style={{ width: NODE_WIDTH }}
      onDoubleClick={(e) => {
        e.stopPropagation()
        onConfigure(step.id)
      }}
      className={cn(
        'flex flex-col',
        isSearchMatch && 'ring-2 ring-amber-400 ring-offset-2 ring-offset-background',
        disabled && 'opacity-55 saturate-50 border-dashed',
      )}
    >
      {/* Floating Quick-Action Toolbar when selected */}
      <NodeToolbar isVisible={selected} position={Position.Top} offset={14}>
        <div className="flex items-center gap-0.5 rounded-lg border border-border bg-popover p-1 shadow-lg">
          <button
            type="button"
            disabled={!runnable}
            onClick={() => onRunNode(step.id, true)}
            className="flex h-6 items-center gap-1 rounded-md px-2 text-[11px] font-medium text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/15 disabled:opacity-40"
            title="Run this node only"
          >
            <Play className="h-3 w-3 fill-current" />
            Run
          </button>
          <button
            type="button"
            disabled={!runnable}
            onClick={() => onRunNode(step.id, false)}
            className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40"
            title="Run workflow from here"
          >
            <FastForward className="h-3.5 w-3.5" />
          </button>
          <div className="mx-0.5 h-3.5 w-px bg-border" />
          <button
            type="button"
            onClick={() => onConfigure(step.id)}
            className="flex h-6 w-6 items-center justify-center rounded-md text-primary hover:bg-primary/15"
            title="Configure node (double-click)"
          >
            <Settings2 className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onDuplicate(step.id)}
            className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
            title="Duplicate (Ctrl+D)"
          >
            <Copy className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onToggleDisable(step.id, !disabled)}
            className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
            title={disabled ? 'Enable node' : 'Disable (skip at runtime)'}
          >
            {disabled ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
          </button>
          <button
            type="button"
            onClick={() => onDelete(step.id)}
            className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/15 hover:text-destructive"
            title="Delete node (Del)"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </NodeToolbar>

      {/* 4-Side Connection Handles (Top, Right, Bottom, Left)
          Standard nodes expose all 4 handles as loose source ports so you can connect
          from or to any side. Multi-branch nodes keep Top/Bottom/Left as target inputs
          and render their labeled branch source handles in dedicated rows below. */}
      {isMultiBranch ? (
        <>
          <BaseHandle type="target" position={Position.Left} id="in" />
          <BaseHandle type="target" position={Position.Top} id="top" />
          <BaseHandle type="target" position={Position.Bottom} id="bottom" />
        </>
      ) : (
        <>
          <BaseHandle type="source" position={Position.Left} id="in" />
          <BaseHandle type="source" position={Position.Top} id="top" />
          <BaseHandle type="source" position={Position.Bottom} id="bottom" />
          {outputs[0] && (
            <BaseHandle
              type="source"
              position={Position.Right}
              id={outputs[0].handle}
              className="!bg-primary"
            />
          )}
        </>
      )}

      {/* Clean React Flow UI Header */}
      <BaseNodeHeader>
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <Icon className={cn('h-4 w-4 shrink-0', visual.iconText)} />
          <BaseNodeHeaderTitle title={step.name}>{step.name}</BaseNodeHeaderTitle>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {disabled && (
            <span className="rounded bg-muted px-1.5 py-px font-mono text-[9px] font-semibold uppercase text-muted-foreground">
              OFF
            </span>
          )}
          {!disabled && step.params.retryOnFail && (
            <span
              className="inline-flex items-center gap-0.5 rounded bg-amber-500/15 px-1.5 py-px font-mono text-[9px] font-semibold text-amber-600 dark:text-amber-400"
              title={`Retries up to ${policy.maxTries}×`}
            >
              <RotateCw className="h-2.5 w-2.5" />
              {policy.maxTries}
            </span>
          )}
          {!disabled && step.params.onError === 'continue' && (
            <span className="rounded bg-orange-500/15 px-1.5 py-px font-mono text-[9px] font-semibold text-orange-600 dark:text-orange-400">
              CONT
            </span>
          )}

          {isRunning ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-500" />
          ) : isError ? (
            <span title={telemetry?.lastError || 'Node failed'}>
              <AlertCircle className="h-3.5 w-3.5 text-destructive" />
            </span>
          ) : isSuccess ? (
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
          ) : hasErrors || hasWarnings ? (
            <span
              title={issues!.map((i) => i.message).join(' · ')}
              className={cn(
                'flex items-center justify-center',
                hasErrors ? 'text-destructive' : 'text-amber-500',
              )}
            >
              <AlertTriangle className="h-3.5 w-3.5" />
            </span>
          ) : (
            <span className="font-mono text-[9.5px] font-medium uppercase tracking-wider text-muted-foreground/80">
              {visual.badge}
            </span>
          )}
        </div>
      </BaseNodeHeader>

      {/* Clean Content Area — spacious, crisp, readable */}
      <BaseNodeContent>
        <div className="flex items-center gap-2 min-w-0">
          {summary.chip && (
            <span
              className={cn(
                'shrink-0 rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold leading-none',
                CHIP_TONES[summary.chipTone ?? 'neutral'],
              )}
            >
              {summary.chip}
            </span>
          )}
          <span
            className="min-w-0 flex-1 truncate font-mono text-[11px] text-foreground/85"
            title={summary.text}
          >
            {summary.text}
          </span>
        </div>

        {summary.outputVar && (
          <div className="flex items-center justify-between gap-2 text-[10.5px] text-muted-foreground">
            <span>Output</span>
            <span
              className="inline-flex items-center gap-1 font-mono font-medium text-primary truncate max-w-[175px]"
              title={`Writes to {{${summary.outputVar}}}`}
            >
              <ArrowRight className="h-2.5 w-2.5 shrink-0" />
              {summary.outputVar}
            </span>
          </div>
        )}
      </BaseNodeContent>

      {/* Dedicated LabeledHandle Rows for Multi-Branch & Error-Output Nodes */}
      {isMultiBranch && (
        <div className={cn(!hasFooter && 'pb-0.5')}>
          {outputs.map((out) => (
            <LabeledHandle
              key={out.handle}
              id={out.handle}
              type="source"
              position={Position.Right}
              title={out.label || out.handle}
              dotColor={out.strokeColor}
              labelClassName={cn(
                out.handle === 'true' && 'text-emerald-600 dark:text-emerald-400',
                out.handle === 'false' && 'text-rose-600 dark:text-rose-400',
                out.handle === 'error' && 'text-orange-600 dark:text-orange-400',
              )}
              handleClassName={out.color}
            />
          ))}
        </div>
      )}

      {/* Telemetry / Notes Footer */}
      {hasFooter && (
        <BaseNodeFooter>
          {telemetry && telemetry.state !== 'idle' ? (
            <div className="flex items-center gap-1.5 min-w-0">
              <span
                className={cn(
                  'font-medium truncate',
                  isRunning && 'text-emerald-600 dark:text-emerald-400',
                  isError && 'text-destructive',
                  isSuccess && 'text-emerald-600 dark:text-emerald-400',
                )}
                title={telemetry.lastError}
              >
                {isRunning
                  ? 'Running…'
                  : isError
                    ? telemetry.lastError?.slice(0, 34) || 'Failed'
                    : telemetry.state === 'skipped'
                      ? 'Skipped'
                      : 'Completed'}
              </span>
              {telemetry.durationMs !== undefined && !isRunning && (
                <span className="shrink-0 font-mono text-[10px] tabular-nums opacity-75">
                  {formatMs(telemetry.durationMs)}
                </span>
              )}
            </div>
          ) : (
            <span className="truncate italic opacity-80">{step.params.notes}</span>
          )}
          {telemetry && telemetry.runCount > 1 && (
            <span className="shrink-0 rounded bg-muted px-1.5 py-px font-mono text-[9.5px] font-semibold tabular-nums">
              ×{telemetry.runCount}
            </span>
          )}
        </BaseNodeFooter>
      )}
    </BaseNode>
  )
})
