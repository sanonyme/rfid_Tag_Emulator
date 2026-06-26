import { useState, useEffect, useRef, useMemo } from 'react'
import { useEdgeSession } from '@/contexts/EdgeSessionContext'
import { EdgeAutomationHintBanner } from './EdgeAutomationLink'
import { EdgeConnectionHero, EdgeDisconnectedPlaceholder } from './edge/EdgeConnectionHero'
import {
  EdgeLibraryPanel,
  type WorkspaceTarget,
  type LibraryCategory,
} from './edge/EdgeLibraryPanel'
import { EdgeActionDialog } from './edge/EdgeActionDialog'
import {
  getPinnedBlocks,
  getPinnedProcesses,
  togglePinnedBlock,
  togglePinnedProcess,
} from '@/lib/edge-library-storage'

type EdgeTabProps = {
  onSwitchTab?: (tab: string) => void
  edgeTabActive?: boolean
}

export function EdgeTab({ onSwitchTab, edgeTabActive = false }: EdgeTabProps = {}) {
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

  const [libraryCategory, setLibraryCategory] = useState<LibraryCategory>('block')
  const [dialogTarget, setDialogTarget] = useState<WorkspaceTarget | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [blockSearch, setBlockSearch] = useState('')
  const [processSearch, setProcessSearch] = useState('')
  const [pinnedBlocks, setPinnedBlocks] = useState<string[]>(() => getPinnedBlocks())
  const [pinnedProcesses, setPinnedProcesses] = useState<string[]>(() => getPinnedProcesses())
  const [edgeMeta, setEdgeMeta] = useState<{
    version: string | null
    setup: string | null
    licenseValid: boolean | null
  }>({ version: null, setup: null, licenseValid: null })

  const blockSearchRef = useRef<HTMLInputElement>(null)
  const processSearchRef = useRef<HTMLInputElement>(null)

  const uiEnabled = tcpConnected && edgeReady
  const runningProcessCount = useMemo(() => processes.filter((p) => p.started).length, [processes])

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

  const dialogProcessInfo = useMemo(() => {
    if (dialogTarget?.type !== 'process') return undefined
    return processes.find((p) => p.name === dialogTarget.name)
  }, [processes, dialogTarget])

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

  const openDialog = (target: WorkspaceTarget) => {
    setDialogTarget(target)
    setDialogOpen(true)
    if (target.type === 'process') {
      notifySelectedProcess(target.name)
    }
  }

  const openBlock = (name: string) => {
    setLibraryCategory('block')
    openDialog({ type: 'block', name })
  }

  const openProcess = (name: string) => {
    setLibraryCategory('process')
    openDialog({ type: 'process', name })
  }

  const handleDialogOpenChange = (open: boolean) => {
    setDialogOpen(open)
    if (!open) setDialogTarget(null)
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
    if (!edgeTabActive) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (!uiEnabled || dialogOpen) return
      const target = e.target as HTMLElement
      const inInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable
      if (e.key === '/' && !inInput) {
        e.preventDefault()
        if (libraryCategory === 'block') blockSearchRef.current?.focus()
        else processSearchRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [edgeTabActive, uiEnabled, libraryCategory, dialogOpen])

  return (
    <div className="stagger-children flex h-full min-h-0 flex-col gap-3 overflow-hidden" data-tour="tour-edge">
      <EdgeConnectionHero
        tcpConnected={tcpConnected}
        edgeReady={edgeReady}
        edgeConnecting={edgeConnecting}
        edgeError={edgeError}
        edgeApiBaseUrl={edgeApiBaseUrl}
        onRefreshAll={() => void refreshAll()}
        loading={loadingBlocks || loadingProcesses}
        version={edgeMeta.version}
        setup={edgeMeta.setup}
        licenseValid={edgeMeta.licenseValid}
        blockCount={blocks.length}
        processCount={processes.length}
        runningProcessCount={runningProcessCount}
      />

      {uiEnabled && <EdgeAutomationHintBanner onSwitchTab={onSwitchTab} />}

      {!tcpConnected ? (
        <EdgeDisconnectedPlaceholder />
      ) : (
        <EdgeLibraryPanel
          uiEnabled={uiEnabled}
          category={libraryCategory}
          onCategoryChange={setLibraryCategory}
          blocks={blocks}
          processes={processes}
          filteredBlocks={filteredBlocks}
          filteredProcesses={filteredProcesses}
          blockSearch={blockSearch}
          processSearch={processSearch}
          onBlockSearchChange={setBlockSearch}
          onProcessSearchChange={setProcessSearch}
          onOpenBlock={openBlock}
          onOpenProcess={openProcess}
          pinnedBlocks={pinnedBlocks}
          pinnedProcesses={pinnedProcesses}
          onTogglePinBlock={handleTogglePinBlock}
          onTogglePinProcess={handleTogglePinProcess}
          loadingBlocks={loadingBlocks}
          loadingProcesses={loadingProcesses}
          onRefreshBlocks={() => void refreshBlocks()}
          onRefreshProcesses={() => void refreshProcesses()}
          blockSearchRef={blockSearchRef}
          processSearchRef={processSearchRef}
        />
      )}

      <EdgeActionDialog
        open={dialogOpen}
        onOpenChange={handleDialogOpenChange}
        target={dialogTarget}
        uiEnabled={uiEnabled}
        processInfo={dialogProcessInfo}
        fetchBlockParams={fetchBlockParams}
        listLogicalDevices={listLogicalDevices}
        invokeBlock={invokeBlock}
        startProcess={startProcess}
        stopProcess={stopProcess}
        onProcessUsed={notifySelectedProcess}
      />
    </div>
  )
}
