import { useEffect, useState } from 'react'
import { Circle, Square, Download, Trash2 } from 'lucide-react'
import { Button } from './ui/button'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import packageJson from '../../package.json'
import {
  clearRecording,
  downloadRecording,
  getRecorderState,
  startRecording,
  stopRecording,
  subscribeRecorder,
  type RecorderState,
} from '@/lib/recorder'

interface RecorderToolbarProps {
  /** Compact label shown next to the indicator (e.g. "Fixed" / "Handheld"). */
  label?: string
  /** Visual variant; `compact` is icon-only for tight headers. */
  variant?: 'default' | 'compact'
  className?: string
}

function formatDuration(ms: number): string {
  const totalSec = Math.floor(ms / 1000)
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export function RecorderToolbar({ label, variant = 'default', className }: RecorderToolbarProps) {
  const [state, setState] = useState<RecorderState>(() => getRecorderState())
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => subscribeRecorder(setState), [])

  useEffect(() => {
    if (!state.active) return
    const id = window.setInterval(() => setNow(Date.now()), 500)
    return () => window.clearInterval(id)
  }, [state.active])

  const handleToggle = () => {
    if (state.active) {
      stopRecording()
      toast.info('Recording stopped', {
        description: `${state.events.length} event${state.events.length === 1 ? '' : 's'} captured`,
      })
    } else {
      // If a finished recording exists with events, ask before discarding it.
      if (state.events.length > 0 && !state.active) {
        const ok = window.confirm(
          'Start a new recording? This will discard the current one — save it first if you want to keep it.',
        )
        if (!ok) return
        clearRecording()
      }
      startRecording()
      toast.success('Recording started', {
        description: 'All tag sends are being captured. Save when done.',
      })
    }
  }

  const handleSave = () => {
    if (state.events.length === 0) {
      toast.error('Nothing recorded yet')
      return
    }
    downloadRecording(packageJson.version)
    toast.success('Recording saved')
  }

  const handleClear = () => {
    if (state.events.length === 0) return
    if (!window.confirm('Discard the current recording?')) return
    clearRecording()
  }

  const duration = state.active && state.startedAt ? now - state.startedAt : 0
  const hasEvents = state.events.length > 0
  const ringClass = state.active ? 'ring-2 ring-red-500/40' : 'ring-1 ring-border/40'

  return (
    <div
      className={cn(
        'inline-flex items-center gap-1 rounded-lg bg-muted/30 px-1 py-0.5',
        ringClass,
        className,
      )}
    >
      <Button
        variant="ghost"
        size="sm"
        className={cn(
          'h-7 gap-1.5 rounded-md text-xs',
          state.active && 'text-red-600 dark:text-red-400',
        )}
        onClick={handleToggle}
        title={state.active ? 'Stop recording' : 'Start recording'}
      >
        {state.active ? (
          <Square className="h-3.5 w-3.5" />
        ) : (
          <Circle
            className={cn(
              'h-3.5 w-3.5',
              hasEvents ? 'text-red-500' : 'text-muted-foreground',
            )}
          />
        )}
        {variant !== 'compact' && (
          <span className="font-medium">
            {state.active ? 'Stop' : hasEvents ? 'Resume?' : 'Record'}
            {label ? ` ${label}` : ''}
          </span>
        )}
        {state.active && (
          <span className="ml-1 font-mono text-[10px] text-muted-foreground">
            {formatDuration(duration)}
          </span>
        )}
        {!state.active && hasEvents && (
          <span className="ml-1 rounded bg-muted px-1 font-mono text-[10px] text-muted-foreground">
            {state.events.length}
          </span>
        )}
      </Button>

      {hasEvents && (
        <>
          <div className="h-4 w-px bg-border/60" />
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 rounded-md"
            onClick={handleSave}
            title="Save recording (.zeusrec.json)"
          >
            <Download className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 rounded-md text-muted-foreground hover:text-destructive"
            onClick={handleClear}
            title="Discard recording"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </>
      )}
    </div>
  )
}
