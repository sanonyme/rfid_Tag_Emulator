import { useEffect, useMemo, useRef, useState } from 'react'
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

/** Survives dialog close/reopen so we don't hide saved fields behind a network round-trip. */
const blockParamDefsCache = new Map<string, EdgeBlockParam[]>()

type EdgeAutomationNodeConfigProps = {
  step: AutomationStep
  onSaveParams: (id: string, updates: Partial<AutomationStep['params']>) => void
}

function fieldsFromSavedParams(
  saved: Record<string, string>,
  order?: string[],
): EdgeBlockParam[] {
  const names = order && order.length > 0 ? order : Object.keys(saved)
  return names.map((name) => ({ name }))
}

export function EdgeBlockNodeConfig({ step, onSaveParams }: EdgeAutomationNodeConfigProps) {
  const edge = useEdgeSessionOptional()
  const blockName = step.params.edgeBlockName ?? ''
  const savedParams = step.params.edgeParams ?? {}
  const [paramDefs, setParamDefs] = useState<EdgeBlockParam[]>(() => {
    if (!blockName) return []
    return blockParamDefsCache.get(blockName) ?? fieldsFromSavedParams(savedParams, step.params.edgeParamOrder)
  })
  const [loadingParams, setLoadingParams] = useState(() => {
    if (!blockName) return false
    if (blockParamDefsCache.has(blockName)) return false
    return Object.keys(savedParams).length === 0
  })
  const paramValuesRef = useRef<Record<string, string>>({ ...savedParams })
  const onSaveParamsRef = useRef(onSaveParams)
  onSaveParamsRef.current = onSaveParams
  const stepIdRef = useRef(step.id)
  stepIdRef.current = step.id
  const fetchBlockParamsRef = useRef(edge?.fetchBlockParams)
  fetchBlockParamsRef.current = edge?.fetchBlockParams

  const tcpConnected = edge?.tcpConnected ?? false
  const edgeReady = edge?.edgeReady ?? false
  const sortedBlocks = useMemo(
    () => (edge ? [...edge.blocks].sort((a, b) => a.name.localeCompare(b.name)) : []),
    [edge?.blocks],
  )

  const commitParams = (extra?: Partial<AutomationStep['params']>) => {
    onSaveParamsRef.current(stepIdRef.current, {
      edgeParams: paramValuesRef.current,
      ...extra,
    })
  }

  useEffect(() => {
    paramValuesRef.current = { ...(step.params.edgeParams ?? {}) }
    const cached = blockName ? blockParamDefsCache.get(blockName) : undefined
    if (cached) {
      setParamDefs(cached)
      setLoadingParams(false)
    } else if (blockName) {
      const fallback = fieldsFromSavedParams(step.params.edgeParams ?? {}, step.params.edgeParamOrder)
      setParamDefs(fallback)
      setLoadingParams(fallback.length === 0)
    } else {
      setParamDefs([])
      setLoadingParams(false)
    }
  }, [step.id, blockName])

  useEffect(() => () => {
    onSaveParamsRef.current(stepIdRef.current, { edgeParams: paramValuesRef.current })
  }, [])

  useEffect(() => {
    if (!edgeReady || !blockName) {
      if (!blockName) {
        setParamDefs([])
        setLoadingParams(false)
      }
      return
    }
    let cancelled = false
    const cached = blockParamDefsCache.get(blockName)
    if (!cached && paramDefs.length === 0) setLoadingParams(true)
    void fetchBlockParamsRef.current?.(blockName).then((defs) => {
      if (cancelled) return
      blockParamDefsCache.set(blockName, defs)
      const initial: Record<string, string> = { ...paramValuesRef.current }
      let changed = false
      for (const p of defs) {
        if (initial[p.name] === undefined) {
          initial[p.name] = p.defaultValue ?? ''
          changed = true
        }
      }
      paramValuesRef.current = initial
      setParamDefs(defs)
      if (changed) {
        commitParams({ edgeParamOrder: defs.map((p) => p.name) })
      }
    }).finally(() => {
      if (!cancelled) setLoadingParams(false)
    })
    return () => {
      cancelled = true
    }
  }, [blockName, edgeReady, step.id])

  if (!edge) {
    return (
      <p className="text-sm text-muted-foreground">Edge session unavailable.</p>
    )
  }

  if (!tcpConnected || !edgeReady) {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-200">
        <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
        Connect to an Edge IP first (connection bubble), then configure this node.
      </div>
    )
  }

  const visibleFields = paramDefs.length > 0
    ? paramDefs
    : fieldsFromSavedParams(paramValuesRef.current, step.params.edgeParamOrder)

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
            {sortedBlocks.map((b) => (
              <SelectItem key={b.name} value={b.name} className="font-mono text-sm">
                {b.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {blockName ? (
        visibleFields.length === 0 && loadingParams ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            Loading parameters…
          </div>
        ) : visibleFields.length === 0 ? (
          <p className="text-xs text-muted-foreground">No parameters for this block.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {visibleFields.map((p) => (
              <div key={p.name} className="space-y-1">
                <Label className="text-[11px] font-mono">
                  {edgeParamInvokeKey(p.name)}
                  {p.type ? (
                    <span className="text-muted-foreground font-sans"> · {p.type}</span>
                  ) : null}
                </Label>
                <Input
                  defaultValue={paramValuesRef.current[p.name] ?? ''}
                  onChange={(e) => {
                    paramValuesRef.current = { ...paramValuesRef.current, [p.name]: e.target.value }
                    commitParams()
                  }}
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
