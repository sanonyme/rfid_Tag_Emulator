import { useEffect, useState } from 'react'
import { Label } from './ui/label'
import { Input } from './ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select'
import { Loader2, AlertCircle } from 'lucide-react'
import type { AutomationStep } from '@/lib/automation-types'
import type { EdgeBlockParam } from '@/lib/edge-api-client'
import { edgeParamInvokeKey } from '@/lib/edge-api-types'
import { useEdgeSessionOptional } from '@/contexts/EdgeSessionContext'

type EdgeAutomationNodeConfigProps = {
  step: AutomationStep
  onSaveParams: (id: string, updates: Partial<AutomationStep['params']>) => void
}

export function EdgeBlockNodeConfig({ step, onSaveParams }: EdgeAutomationNodeConfigProps) {
  const edge = useEdgeSessionOptional()
  const [paramDefs, setParamDefs] = useState<EdgeBlockParam[]>([])
  const [loadingParams, setLoadingParams] = useState(false)

  const blockName = step.params.edgeBlockName ?? ''
  const edgeParams = step.params.edgeParams ?? {}

  useEffect(() => {
    if (!edge?.edgeReady || !blockName) {
      setParamDefs([])
      return
    }
    let cancelled = false
    setLoadingParams(true)
    void edge.fetchBlockParams(blockName).then((defs) => {
      if (cancelled) return
      setParamDefs(defs)
      const initial: Record<string, string> = { ...edgeParams }
      let changed = false
      for (const p of defs) {
        if (initial[p.name] === undefined) {
          initial[p.name] = p.defaultValue ?? ''
          changed = true
        }
      }
      if (changed) {
        onSaveParams(step.id, {
          edgeParams: initial,
          edgeParamOrder: defs.map((p) => p.name),
        })
      }
    }).finally(() => {
      if (!cancelled) setLoadingParams(false)
    })
    return () => {
      cancelled = true
    }
  }, [blockName, edge?.edgeReady, step.id])

  if (!edge) {
    return (
      <p className="text-sm text-muted-foreground">Edge session unavailable.</p>
    )
  }

  if (!edge.tcpConnected || !edge.edgeReady) {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-200">
        <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
        Connect to an Edge IP first (connection bubble), then configure this node.
      </div>
    )
  }

  const setParam = (name: string, value: string) => {
    onSaveParams(step.id, {
      edgeParams: { ...edgeParams, [name]: value },
    })
  }

  return (
    <div className="rounded-xl border border-border/50 bg-muted/10 p-4 space-y-4">
      <div className="space-y-2">
        <Label>Block</Label>
        <Select
          value={blockName || undefined}
          onValueChange={(v) =>
            onSaveParams(step.id, {
              edgeBlockName: v,
              edgeParams: {},
              edgeParamOrder: [],
            })
          }
        >
          <SelectTrigger className="font-mono text-sm h-10">
            <SelectValue placeholder="Select block…" />
          </SelectTrigger>
          <SelectContent>
            {[...edge.blocks]
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((b) => (
                <SelectItem key={b.name} value={b.name} className="font-mono text-sm">
                  {b.name}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
      </div>

      {blockName ? (
        loadingParams ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            Loading parameters…
          </div>
        ) : paramDefs.length === 0 ? (
          <p className="text-xs text-muted-foreground">No parameters for this block.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {paramDefs.map((p) => (
              <div key={p.name} className="space-y-1">
                <Label className="text-[11px] font-mono">
                  {edgeParamInvokeKey(p.name)}
                  {p.type ? (
                    <span className="text-muted-foreground font-sans"> · {p.type}</span>
                  ) : null}
                </Label>
                <Input
                  value={edgeParams[p.name] ?? ''}
                  onChange={(e) => setParam(p.name, e.target.value)}
                  className="font-mono text-xs h-8"
                  placeholder={p.defaultValue ?? ''}
                />
              </div>
            ))}
          </div>
        )
      ) : null}
    </div>
  )
}

export function EdgeProcessNodeConfig({ step, onSaveParams }: EdgeAutomationNodeConfigProps) {
  const edge = useEdgeSessionOptional()
  const processName = step.params.edgeProcessName ?? ''
  const action = step.params.edgeProcessAction ?? 'start'

  if (!edge) {
    return <p className="text-sm text-muted-foreground">Edge session unavailable.</p>
  }

  if (!edge.tcpConnected || !edge.edgeReady) {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-200">
        <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
        Connect to an Edge IP first (connection bubble), then configure this node.
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-border/50 bg-muted/10 p-4 space-y-4">
      <div className="space-y-2">
        <Label>Workflow</Label>
        <Select
          value={processName || undefined}
          onValueChange={(v) => onSaveParams(step.id, { edgeProcessName: v })}
        >
          <SelectTrigger className="font-mono text-sm h-10">
            <SelectValue placeholder="Select process…" />
          </SelectTrigger>
          <SelectContent>
            {[...edge.processes]
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((p) => (
                <SelectItem key={p.name} value={p.name} className="font-mono text-sm">
                  {p.name}
                  {p.started != null ? (p.started ? ' · running' : ' · stopped') : ''}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label>Action</Label>
        <Select
          value={action}
          onValueChange={(v) =>
            onSaveParams(step.id, { edgeProcessAction: v as 'start' | 'stop' })
          }
        >
          <SelectTrigger className="h-10">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="start">Start process</SelectItem>
            <SelectItem value="stop">Stop process</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}
