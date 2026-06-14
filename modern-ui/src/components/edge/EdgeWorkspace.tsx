import { Loader2, RotateCcw, Square, Workflow, Box } from 'lucide-react'
import { motion } from 'framer-motion'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { Button } from '../ui/button'
import { Badge } from '../ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select'
import { cn } from '@/lib/utils'
import { sectionCard, sectionLabel } from '@/lib/ui-tokens'
import { SendButton } from '../SendControls'
import { isLogicalDeviceParam } from '@/lib/edge-api-types'
import type { EdgeBlockParam, EdgeLogicalDevice, EdgeProcessInfo } from '@/lib/edge-api-client'
import type { WorkspaceTarget } from './EdgeLibraryPanel'

type EdgeWorkspaceProps = {
  uiEnabled: boolean
  workspaceTarget: WorkspaceTarget | null
  blockParamDefs: EdgeBlockParam[]
  paramValues: Record<string, string>
  onParamChange: (name: string, value: string) => void
  onResetParams: () => void
  loadingBlockParams: boolean
  logicalDevices: EdgeLogicalDevice[]
  invokingBlock: boolean
  onInvoke: () => void
  selectedProcessInfo: EdgeProcessInfo | undefined
  processAction: 'start' | 'stop' | null
  onStartProcess: () => void
  onStopProcess: () => void
}

export function EdgeWorkspace({
  uiEnabled,
  workspaceTarget,
  blockParamDefs,
  paramValues,
  onParamChange,
  onResetParams,
  loadingBlockParams,
  logicalDevices,
  invokingBlock,
  onInvoke,
  selectedProcessInfo,
  processAction,
  onStartProcess,
  onStopProcess,
}: EdgeWorkspaceProps) {
  if (!workspaceTarget) {
    return (
      <div
        className={cn(
          sectionCard,
          'flex min-h-0 flex-1 flex-col items-center justify-center gap-3 p-8 text-center',
        )}
      >
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted/50 ring-1 ring-border/30">
          <Box className="h-7 w-7 text-muted-foreground" />
        </div>
        <p className="text-sm text-muted-foreground">
          Select a block or process from the library to begin.
        </p>
      </div>
    )
  }

  if (workspaceTarget.type === 'process') {
    const running = selectedProcessInfo?.started === true
    return (
      <div className={cn(sectionCard, 'flex min-h-0 flex-1 flex-col overflow-hidden')}>
        <div className="border-b border-border/30 px-4 py-3">
          <div className="flex items-center gap-2">
            <Workflow className="h-4 w-4 text-primary" />
            <span className={sectionLabel}>Process</span>
          </div>
          <h3 className="mt-1 truncate font-mono text-base font-semibold">{workspaceTarget.name}</h3>
        </div>

        <div className="flex flex-1 flex-col gap-4 p-4">
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className={cn(
              'relative overflow-hidden rounded-xl border px-4 py-5',
              running
                ? 'border-success/40 bg-success/5 ring-1 ring-success/20'
                : 'border-border/40 bg-muted/20',
            )}
          >
            {running && (
              <span className="pointer-events-none absolute inset-0 bg-gradient-to-br from-success/10 to-transparent" />
            )}
            <div className="relative flex items-center gap-3">
              <span
                className={cn(
                  'relative flex h-3 w-3 shrink-0 rounded-full',
                  running ? 'bg-success' : 'bg-muted-foreground/50',
                )}
              >
                {running && (
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-50" />
                )}
              </span>
              <div>
                <p className="font-medium">{running ? 'Running' : 'Stopped'}</p>
                <p className="font-mono text-xs text-muted-foreground">{workspaceTarget.name}</p>
              </div>
              <Badge variant={running ? 'success' : 'secondary'} className="ml-auto">
                {running ? 'Active' : 'Idle'}
              </Badge>
            </div>
          </motion.div>

          <div className="mt-auto flex gap-2">
            <Button
              type="button"
              className="flex-1 gap-2 h-11"
              onClick={() => void onStartProcess()}
              disabled={!uiEnabled || processAction !== null}
            >
              {processAction === 'start' ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Workflow className="h-4 w-4" />
              )}
              Start
            </Button>
            <Button
              type="button"
              variant="destructive"
              className="flex-1 gap-2 h-11"
              onClick={() => void onStopProcess()}
              disabled={!uiEnabled || processAction !== null}
            >
              {processAction === 'stop' ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Square className="h-4 w-4" />
              )}
              Stop
            </Button>
          </div>
        </div>
      </div>
    )
  }

  const hasModifiedParams = blockParamDefs.some(
    (p) => (paramValues[p.name] ?? '') !== (p.defaultValue ?? ''),
  )

  return (
    <div className={cn(sectionCard, 'flex min-h-0 flex-1 flex-col overflow-hidden')}>
      <div className="flex items-start justify-between gap-2 border-b border-border/30 px-4 py-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Box className="h-4 w-4 shrink-0 text-info" />
            <span className={sectionLabel}>Block</span>
          </div>
          <h3 className="mt-1 truncate font-mono text-base font-semibold" title={workspaceTarget.name}>
            {workspaceTarget.name}
          </h3>
        </div>
        {hasModifiedParams && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 shrink-0 gap-1 text-xs"
            onClick={onResetParams}
            disabled={!uiEnabled || loadingBlockParams}
          >
            <RotateCcw className="h-3 w-3" />
            Reset
          </Button>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">
        {loadingBlockParams ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading parameters…
          </div>
        ) : blockParamDefs.length === 0 ? (
          <p className="text-sm text-muted-foreground">No parameters required for this block.</p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {blockParamDefs.map((p) => (
              <div key={p.name} className="space-y-1.5">
                <Label htmlFor={`edge-param-${p.name}`} className="font-mono text-[11px] leading-tight">
                  {p.name}
                  {p.type && (
                    <Badge variant="outline" className="ml-1.5 px-1 py-0 text-[9px] font-sans">
                      {p.type}
                    </Badge>
                  )}
                </Label>
                {isLogicalDeviceParam(p) && logicalDevices.length > 0 ? (
                  <Select
                    value={paramValues[p.name] ?? ''}
                    onValueChange={(v) => onParamChange(p.name, v)}
                    disabled={!uiEnabled}
                  >
                    <SelectTrigger id={`edge-param-${p.name}`} className="h-9 font-mono text-xs">
                      <SelectValue placeholder={p.defaultValue || 'Select device…'} />
                    </SelectTrigger>
                    <SelectContent>
                      {logicalDevices.map((d) => (
                        <SelectItem key={d.name} value={d.name} className="font-mono text-xs">
                          {d.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    id={`edge-param-${p.name}`}
                    value={paramValues[p.name] ?? ''}
                    onChange={(e) => onParamChange(p.name, e.target.value)}
                    className="h-9 font-mono text-xs"
                    disabled={!uiEnabled}
                    placeholder={p.defaultValue || ''}
                  />
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="shrink-0 border-t border-border/30 bg-card/95 p-4 backdrop-blur-sm">
        <SendButton
          type="button"
          label={invokingBlock ? 'Invoking…' : 'Invoke Block'}
          shortcut="⌃↵"
          className="w-full"
          onClick={() => void onInvoke()}
          disabled={!uiEnabled || invokingBlock || loadingBlockParams}
        />
      </div>
    </div>
  )
}
