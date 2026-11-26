import { memo, useState } from 'react'
import { NodeResizer, type Node, type NodeProps } from '@xyflow/react'
import { Frame, Palette, Trash2 } from 'lucide-react'
import type { AutomationFrame, FrameColor } from '@/lib/automation-types'
import { cn } from '@/lib/utils'

const FRAME_COLORS: Record<
  FrameColor,
  { border: string; bg: string; text: string; header: string; resizer: string }
> = {
  slate: {
    border: 'border-slate-500/40',
    bg: 'bg-slate-500/[0.04]',
    text: 'text-slate-600 dark:text-slate-300',
    header: 'bg-slate-500/12',
    resizer: '#64748b',
  },
  blue: {
    border: 'border-blue-500/40',
    bg: 'bg-blue-500/[0.04]',
    text: 'text-blue-600 dark:text-blue-400',
    header: 'bg-blue-500/12',
    resizer: '#3b82f6',
  },
  emerald: {
    border: 'border-emerald-500/40',
    bg: 'bg-emerald-500/[0.04]',
    text: 'text-emerald-600 dark:text-emerald-400',
    header: 'bg-emerald-500/12',
    resizer: '#10b981',
  },
  amber: {
    border: 'border-amber-500/40',
    bg: 'bg-amber-500/[0.04]',
    text: 'text-amber-600 dark:text-amber-400',
    header: 'bg-amber-500/12',
    resizer: '#f59e0b',
  },
  purple: {
    border: 'border-purple-500/40',
    bg: 'bg-purple-500/[0.04]',
    text: 'text-purple-600 dark:text-purple-400',
    header: 'bg-purple-500/12',
    resizer: '#a855f7',
  },
  rose: {
    border: 'border-rose-500/40',
    bg: 'bg-rose-500/[0.04]',
    text: 'text-rose-600 dark:text-rose-400',
    header: 'bg-rose-500/12',
    resizer: '#f43f5e',
  },
  cyan: {
    border: 'border-cyan-500/40',
    bg: 'bg-cyan-500/[0.04]',
    text: 'text-cyan-600 dark:text-cyan-400',
    header: 'bg-cyan-500/12',
    resizer: '#06b6d4',
  },
}

const FRAME_COLOR_KEYS: FrameColor[] = ['slate', 'blue', 'emerald', 'amber', 'purple', 'rose', 'cyan']

export interface WorkflowFrameNodeData extends Record<string, unknown> {
  frame: AutomationFrame
  onUpdate: (id: string, updates: Partial<AutomationFrame>) => void
  onDelete: (id: string) => void
}

export type WorkflowFrameFlowNode = Node<WorkflowFrameNodeData, 'workflowFrame'>

export const WorkflowFrameNode = memo(function WorkflowFrameNode({
  data,
  selected,
}: NodeProps<WorkflowFrameFlowNode>) {
  const { frame, onUpdate, onDelete } = data
  const [editingTitle, setEditingTitle] = useState(false)
  const [draftTitle, setDraftTitle] = useState(frame.name)
  const [showColorPicker, setShowColorPicker] = useState(false)
  const c = FRAME_COLORS[frame.color] ?? FRAME_COLORS.slate

  const submitTitle = () => {
    setEditingTitle(false)
    if (draftTitle.trim() && draftTitle.trim() !== frame.name) {
      onUpdate(frame.id, { name: draftTitle.trim() })
    }
  }

  return (
    <>
      <NodeResizer
        minWidth={240}
        minHeight={140}
        isVisible={selected}
        lineStyle={{ borderColor: c.resizer, borderWidth: 1.5 }}
        handleStyle={{
          width: 9,
          height: 9,
          borderRadius: 3,
          backgroundColor: c.resizer,
          border: '2px solid hsl(var(--background))',
        }}
        onResizeEnd={(_evt, params) => {
          onUpdate(frame.id, {
            x: Math.round(params.x),
            y: Math.round(params.y),
            width: Math.round(params.width),
            height: Math.round(params.height),
          })
        }}
      />
      <div
        className={cn(
          'group flex h-full w-full flex-col rounded-xl border border-dashed transition-colors',
          c.border,
          c.bg,
          selected && 'ring-2 ring-primary/30',
        )}
      >
        {/* Header Drag Bar */}
        <div
          className={cn(
            'flex items-center justify-between gap-2 rounded-t-[11px] border-b border-inherit/40 px-3 py-1.5 cursor-grab active:cursor-grabbing',
            c.header,
          )}
        >
          <div className="flex min-w-0 items-center gap-2">
            <Frame className={cn('h-3.5 w-3.5 shrink-0', c.text)} />
            {editingTitle ? (
              <input
                type="text"
                value={draftTitle}
                autoFocus
                onChange={(e) => setDraftTitle(e.target.value)}
                onBlur={submitTitle}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') submitTitle()
                  if (e.key === 'Escape') {
                    setDraftTitle(frame.name)
                    setEditingTitle(false)
                  }
                }}
                className="nodrag h-6 rounded border border-primary/50 bg-background/90 px-1.5 text-xs font-semibold text-foreground outline-none"
              />
            ) : (
              <span
                onDoubleClick={(e) => {
                  e.stopPropagation()
                  setDraftTitle(frame.name)
                  setEditingTitle(true)
                }}
                className={cn('truncate text-xs font-semibold tracking-wide', c.text)}
                title="Double-click to rename group"
              >
                {frame.name}
              </span>
            )}
          </div>

          <div className="nodrag flex items-center gap-1 opacity-60 transition-opacity group-hover:opacity-100">
            <div className="relative">
              <button
                type="button"
                className="flex h-5 w-5 items-center justify-center rounded hover:bg-background/50"
                onClick={(e) => {
                  e.stopPropagation()
                  setShowColorPicker((v) => !v)
                }}
                title="Change frame color"
              >
                <Palette className="h-3 w-3" />
              </button>
              {showColorPicker && (
                <div
                  className="absolute right-0 top-full z-50 mt-1 flex items-center gap-1 rounded-lg border border-border bg-popover p-1.5 shadow-xl"
                  onPointerDown={(e) => e.stopPropagation()}
                >
                  {FRAME_COLOR_KEYS.map((clr) => (
                    <button
                      key={clr}
                      type="button"
                      className={cn(
                        'h-4 w-4 rounded-full border transition-transform hover:scale-110',
                        FRAME_COLORS[clr].header,
                        FRAME_COLORS[clr].border,
                        frame.color === clr && 'scale-125 ring-2 ring-primary',
                      )}
                      onClick={() => {
                        onUpdate(frame.id, { color: clr })
                        setShowColorPicker(false)
                      }}
                    />
                  ))}
                </div>
              )}
            </div>
            <button
              type="button"
              className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-destructive/15 hover:text-destructive"
              onClick={(e) => {
                e.stopPropagation()
                onDelete(frame.id)
              }}
              title="Delete frame (keeps nodes)"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        </div>
      </div>
    </>
  )
})
