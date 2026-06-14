import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { EdgeBlockParam, EdgeLogicalDevice } from '@/lib/edge-api-client'
import { edgeParamInvokeKey, isLogicalDeviceParam } from '@/lib/edge-api-types'
import { formatTime } from '@/lib/utils'
import { toast } from 'sonner'
import { useEdgeSession } from '@/contexts/EdgeSessionContext'
import { EdgeAutomationHintBanner } from './EdgeAutomationLink'
import {
  EdgeConnectionHero,
  EdgeDisconnectedPlaceholder,
  type EdgeMode,
} from './edge/EdgeConnectionHero'
import { EdgeLibraryPanel, type WorkspaceTarget } from './edge/EdgeLibraryPanel'
import { EdgeWorkspace } from './edge/EdgeWorkspace'
import {
  EdgeTelemetryPanel,
  createInvokeResponse,
  type InvokeResponse,
} from './edge/EdgeTelemetryPanel'
import { EdgeCatalogPanel } from './edge/EdgeCatalogPanel'
import {
  getPinnedBlocks,
  getPinnedProcesses,
  getRecentProcesses,
  togglePinnedBlock,
  togglePinnedProcess,
  trackRecentProcess,
} from '@/lib/edge-library-storage'
import { prefersReducedMotion } from '@/lib/motion'

const MAX_LOG_LINES = 80
const MAX_RESPONSE_CHARS = 12_000

type EdgeTabProps = {
  onSwitchTab?: (tab: string) => void
}

export function EdgeTab({ onSwitchTab }: EdgeTabProps = {}) {
  const {
    tcpConnected,
    edgeReady,
    edgeConnecting,
    edgeError,
    blocks,
    processes,
    loadingBlocks,
    loadingProcesses,
    refreshBlocks,
    refreshProcesses,
    refreshAll,
    fetchBlockParams,
    listLogicalDevices,
    notifySelectedProcess,
    invokeBlock,
    startProcess,
    stopProcess,
    edgeApiBaseUrl,
    fetchEdgeMeta,
  } = useEdgeSession()

  const [edgeMode, setEdgeMode] = useState<EdgeMode>('operate')
  const [workspaceTarget, setWorkspaceTarget] = useState<WorkspaceTarget | null>(null)
  const [blockSearch, setBlockSearch] = useState('')
  const [processSearch, setProcessSearch] = useState('')
  const [catalogSearch, setCatalogSearch] = useState('')
  const [blockParamDefs, setBlockParamDefs] = useState<EdgeBlockParam[]>([])
  const [paramValues, setParamValues] = useState<Record<string, string>>({})
  const [loadingBlockParams, setLoadingBlockParams] = useState(false)
  const paramValuesByBlockRef = useRef<Record<string, Record<string, string>>>({})
  const [invokingBlock, setInvokingBlock] = useState(false)
  const [processAction, setProcessAction] = useState<'start' | 'stop' | null>(null)
  const [log, setLog] = useState<string[]>([])
  const [lastInvokeResponse, setLastInvokeResponse] = useState<InvokeResponse | null>(null)
  const [logicalDevices, setLogicalDevices] = useState<EdgeLogicalDevice[]>([])
  const [pinnedBlocks, setPinnedBlocks] = useState<string[]>(() => getPinnedBlocks())
  const [pinnedProcesses, setPinnedProcesses] = useState<string[]>(() => getPinnedProcesses())
  const [recentProcesses, setRecentProcesses] = useState<string[]>(() => getRecentProcesses())
  const [edgeMeta, setEdgeMeta] = useState<{
    version: string | null
    setup: string | null
    licenseValid: boolean | null
  }>({ version: null, setup: null, licenseValid: null })

  const logScrollRef = useRef<HTMLDivElement>(null)
  const blockSearchRef = useRef<HTMLInputElement>(null)
  const sessionLoggedRef = useRef({ connecting: false, ready: false })
  const lastInvokeParamsRef = useRef<{ block: string; params: Record<string, unknown>; order: string[] } | null>(
    null,
  )

  const uiEnabled = tcpConnected && edgeReady
  const reduced = prefersReducedMotion()

  const filteredBlocks = useMemo(() => {
    const q = blockSearch.trim().toLowerCase()
    const sorted = [...blocks].sort((a, b) => a.name.localeCompare(b.name))
    if (!q) return sorted
    return sorted.filter((b) => b.name.toLowerCase().includes(q))
  }, [blocks, blockSearch])

  const filteredProcesses = useMemo(() => {
    const q = processSearch.trim().toLowerCase()
    const sorted = [...processes].sort((a, b) => a.name.localeCompare(b.name))
    if (!q) return sorted
    return sorted.filter((p) => p.name.toLowerCase().includes(q))
  }, [processes, processSearch])

  const selectedProcessInfo = useMemo(() => {
    if (workspaceTarget?.type !== 'process') return undefined
    return processes.find((p) => p.name === workspaceTarget.name)
  }, [processes, workspaceTarget])

  const addLog = useCallback((msg: string) => {
    setLog((prev) => {
      const next = [...prev, `[${formatTime()}] ${msg}`]
      return next.length > MAX_LOG_LINES ? next.slice(-MAX_LOG_LINES) : next
    })
  }, [])

  useEffect(() => {
    const el = logScrollRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [log, lastInvokeResponse])

  useEffect(() => {
    if (blocks.length && !workspaceTarget) {
      setWorkspaceTarget({ type: 'block', name: blocks[0].name })
    }
  }, [blocks, workspaceTarget])

  const selectedBlock =
    workspaceTarget?.type === 'block' ? workspaceTarget.name : ''

  useEffect(() => {
    if (!selectedBlock || !uiEnabled) {
      setBlockParamDefs([])
      setParamValues({})
      return
    }

    let cancelled = false
    setLoadingBlockParams(true)

    const loadId = window.setTimeout(() => {
      void (async () => {
        try {
          const defs = await fetchBlockParams(selectedBlock)
          if (cancelled) return

          setBlockParamDefs(defs)
          const saved = paramValuesByBlockRef.current[selectedBlock]
          const initial: Record<string, string> = {}
          for (const p of defs) {
            const legacyKey = p.type ? `${p.name}:${p.type}` : p.name
            initial[p.name] = saved?.[p.name] ?? saved?.[legacyKey] ?? p.defaultValue ?? ''
          }
          if (saved) {
            for (const [k, v] of Object.entries(saved)) {
              const clean = edgeParamInvokeKey(k)
              if (clean !== k && initial[clean] === '') initial[clean] = v
            }
          }
          setParamValues(initial)
        } catch (e: unknown) {
          if (cancelled) return
          const msg = e instanceof Error ? e.message : String(e)
          toast.error(msg)
          setBlockParamDefs([])
          setParamValues({})
        } finally {
          if (!cancelled) setLoadingBlockParams(false)
        }
      })()
    }, 80)

    return () => {
      cancelled = true
      window.clearTimeout(loadId)
    }
  }, [selectedBlock, uiEnabled, fetchBlockParams])

  const setParamValue = (name: string, value: string) => {
    setParamValues((prev) => {
      const next = { ...prev, [name]: value }
      if (selectedBlock) {
        paramValuesByBlockRef.current[selectedBlock] = next
      }
      return next
    })
  }

  const resetParams = useCallback(() => {
    const initial: Record<string, string> = {}
    for (const p of blockParamDefs) {
      initial[p.name] = p.defaultValue ?? ''
    }
    setParamValues(initial)
    if (selectedBlock) {
      paramValuesByBlockRef.current[selectedBlock] = initial
    }
  }, [blockParamDefs, selectedBlock])

  useEffect(() => {
    if (workspaceTarget?.type === 'process') {
      notifySelectedProcess(workspaceTarget.name)
    }
  }, [workspaceTarget, notifySelectedProcess])

  useEffect(() => {
    if (!tcpConnected) {
      sessionLoggedRef.current = { connecting: false, ready: false }
      return
    }
    if (edgeConnecting && !sessionLoggedRef.current.connecting) {
      sessionLoggedRef.current.connecting = true
      addLog('Signing in to Edge API…')
    }
  }, [tcpConnected, edgeConnecting, addLog])

  useEffect(() => {
    if (edgeReady && !sessionLoggedRef.current.ready) {
      sessionLoggedRef.current.ready = true
      addLog('Edge API ready')
    }
    if (!edgeReady) sessionLoggedRef.current.ready = false
  }, [edgeReady, addLog])

  useEffect(() => {
    if (edgeError) addLog(`Error: ${edgeError}`)
  }, [edgeError, addLog])

  useEffect(() => {
    if (!edgeReady) {
      setEdgeMeta({ version: null, setup: null, licenseValid: null })
      return
    }
    let cancelled = false
    void (async () => {
      const meta = await fetchEdgeMeta()
      if (!cancelled) setEdgeMeta(meta)
    })()
    return () => {
      cancelled = true
    }
  }, [edgeReady, fetchEdgeMeta])

  const needsLogicalDeviceList = useMemo(
    () => blockParamDefs.some(isLogicalDeviceParam),
    [blockParamDefs],
  )

  useEffect(() => {
    if (!uiEnabled || !needsLogicalDeviceList) {
      setLogicalDevices([])
      return
    }
    let cancelled = false
    void (async () => {
      try {
        const devices = await listLogicalDevices()
        if (!cancelled) setLogicalDevices(devices)
      } catch {
        if (!cancelled) setLogicalDevices([])
      }
    })()
    return () => {
      cancelled = true
    }
  }, [uiEnabled, needsLogicalDeviceList, listLogicalDevices])

  const buildInvokeParams = (): Record<string, unknown> => {
    const out: Record<string, unknown> = {}
    for (const p of blockParamDefs) {
      out[p.name] = (paramValues[p.name] ?? p.defaultValue ?? '').trim()
    }
    return out
  }

  const handleInvokeBlock = useCallback(async () => {
    if (!selectedBlock) {
      toast.error('Select a block')
      return
    }
    const params = buildInvokeParams()
    const paramOrder = blockParamDefs.map((p) => p.name)
    lastInvokeParamsRef.current = { block: selectedBlock, params, order: paramOrder }
    setInvokingBlock(true)
    addLog(`Invoke → ${selectedBlock}`)
    try {
      const { status, response } = await invokeBlock(selectedBlock, params, paramOrder)
      addLog(`✓ Block ${selectedBlock}`)
      setLastInvokeResponse(createInvokeResponse(selectedBlock, status, response, MAX_RESPONSE_CHARS))
      toast.success('Block invoked')
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      for (const line of msg.split('\n')) {
        addLog(`✗ ${line}`)
      }
      toast.error(msg.split('\n')[0], {
        description: msg.length > 120 ? msg.slice(0, 500) : undefined,
        duration: 8000,
      })
    } finally {
      setInvokingBlock(false)
    }
  }, [selectedBlock, blockParamDefs, paramValues, invokeBlock, addLog])

  const handleReInvoke = () => {
    void handleInvokeBlock()
  }

  const handleStartProcess = async () => {
    if (workspaceTarget?.type !== 'process') return
    const name = workspaceTarget.name
    trackRecentProcess(name)
    setRecentProcesses(getRecentProcesses())
    setProcessAction('start')
    try {
      await startProcess(name)
      addLog(`▶ Started ${name}`)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      addLog(`✗ Start: ${msg}`)
      toast.error(msg)
    } finally {
      setProcessAction(null)
    }
  }

  const handleStopProcess = async () => {
    if (workspaceTarget?.type !== 'process') return
    const name = workspaceTarget.name
    setProcessAction('stop')
    try {
      await stopProcess(name)
      addLog(`■ Stopped ${name}`)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      addLog(`✗ Stop: ${msg}`)
      toast.error(msg)
    } finally {
      setProcessAction(null)
    }
  }

  const selectBlock = (name: string) => {
    setWorkspaceTarget({ type: 'block', name })
    if (edgeMode === 'catalog') setEdgeMode('operate')
  }

  const selectProcess = (name: string) => {
    trackRecentProcess(name)
    setRecentProcesses(getRecentProcesses())
    setWorkspaceTarget({ type: 'process', name })
    notifySelectedProcess(name)
    if (edgeMode === 'catalog') setEdgeMode('operate')
  }

  const handleTogglePinBlock = (name: string) => {
    togglePinnedBlock(name)
    setPinnedBlocks(getPinnedBlocks())
  }

  const handleTogglePinProcess = (name: string) => {
    togglePinnedProcess(name)
    setPinnedProcesses(getPinnedProcesses())
  }

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!uiEnabled || edgeMode !== 'operate') return
      const target = e.target as HTMLElement
      const inInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable

      if (e.key === '/' && !inInput) {
        e.preventDefault()
        blockSearchRef.current?.focus()
        return
      }

      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && workspaceTarget?.type === 'block') {
        e.preventDefault()
        void handleInvokeBlock()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [uiEnabled, edgeMode, workspaceTarget, handleInvokeBlock])

  const showOperateLayout = edgeMode === 'operate' && tcpConnected

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-hidden" data-tour="tour-edge">
      <EdgeConnectionHero
        tcpConnected={tcpConnected}
        edgeReady={edgeReady}
        edgeConnecting={edgeConnecting}
        edgeError={edgeError}
        edgeApiBaseUrl={edgeApiBaseUrl}
        edgeMode={edgeMode}
        onModeChange={setEdgeMode}
        onRefreshAll={() => void refreshAll()}
        loading={loadingBlocks || loadingProcesses}
        version={edgeMeta.version}
        setup={edgeMeta.setup}
        licenseValid={edgeMeta.licenseValid}
      />

      {uiEnabled && <EdgeAutomationHintBanner onSwitchTab={onSwitchTab} />}

      {!tcpConnected ? (
        <EdgeDisconnectedPlaceholder />
      ) : (
        <AnimatePresence mode="wait">
          {edgeMode === 'operate' && (
            <motion.div
              key="operate"
              initial={reduced ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduced ? { opacity: 0 } : { opacity: 0, y: -6 }}
              transition={{ duration: reduced ? 0 : 0.25 }}
              className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden xl:flex-row"
            >
              {showOperateLayout ? (
                <>
                  <EdgeLibraryPanel
                    uiEnabled={uiEnabled}
                    blocks={blocks}
                    processes={processes}
                    filteredBlocks={filteredBlocks}
                    filteredProcesses={filteredProcesses}
                    blockSearch={blockSearch}
                    processSearch={processSearch}
                    onBlockSearchChange={setBlockSearch}
                    onProcessSearchChange={setProcessSearch}
                    workspaceTarget={workspaceTarget}
                    onSelectBlock={selectBlock}
                    onSelectProcess={selectProcess}
                    pinnedBlocks={pinnedBlocks}
                    pinnedProcesses={pinnedProcesses}
                    recentProcesses={recentProcesses}
                    onTogglePinBlock={handleTogglePinBlock}
                    onTogglePinProcess={handleTogglePinProcess}
                    loadingBlocks={loadingBlocks}
                    loadingProcesses={loadingProcesses}
                    onRefreshBlocks={() => void refreshBlocks()}
                    onRefreshProcesses={() => void refreshProcesses()}
                    blockSearchRef={blockSearchRef}
                  />
                  <EdgeWorkspace
                    uiEnabled={uiEnabled}
                    workspaceTarget={workspaceTarget}
                    blockParamDefs={blockParamDefs}
                    paramValues={paramValues}
                    onParamChange={setParamValue}
                    onResetParams={resetParams}
                    loadingBlockParams={loadingBlockParams}
                    logicalDevices={logicalDevices}
                    invokingBlock={invokingBlock}
                    onInvoke={() => void handleInvokeBlock()}
                    selectedProcessInfo={selectedProcessInfo}
                    processAction={processAction}
                    onStartProcess={() => void handleStartProcess()}
                    onStopProcess={() => void handleStopProcess()}
                  />
                  <EdgeTelemetryPanel
                    log={log}
                    lastInvokeResponse={lastInvokeResponse}
                    onClear={() => {
                      setLog([])
                      setLastInvokeResponse(null)
                    }}
                    onReInvoke={workspaceTarget?.type === 'block' ? handleReInvoke : undefined}
                    logScrollRef={logScrollRef}
                  />
                </>
              ) : null}
            </motion.div>
          )}

          {edgeMode === 'catalog' && (
            <motion.div
              key="catalog"
              initial={reduced ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduced ? { opacity: 0 } : { opacity: 0, y: -6 }}
              transition={{ duration: reduced ? 0 : 0.25 }}
              className="min-h-0 flex-1 overflow-hidden"
            >
              <EdgeCatalogPanel
                uiEnabled={uiEnabled}
                blocks={blocks}
                processes={processes}
                search={catalogSearch}
                onSearchChange={setCatalogSearch}
                pinnedBlocks={pinnedBlocks}
                pinnedProcesses={pinnedProcesses}
                onSelectBlock={selectBlock}
                onSelectProcess={selectProcess}
                onTogglePinBlock={handleTogglePinBlock}
                onTogglePinProcess={handleTogglePinProcess}
              />
            </motion.div>
          )}
        </AnimatePresence>
      )}
    </div>
  )
}
