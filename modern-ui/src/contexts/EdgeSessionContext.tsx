import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { toast } from 'sonner'
import {
  EdgeApiClient,
  mergeProcessIntoList,
  type EdgeBlockInfo,
  type EdgeBlockParam,
  type EdgeProcessInfo,
} from '@/lib/edge-api-client'
import { aleResponseIsInvokeSuccess, formatEdgeApiError } from '@/lib/edge-api-errors'
import { ALE_ENV_MISSING_MSG, getAleEnvCredentials } from '@/lib/edge-env-credentials'
import { publishStatus, clearStatus } from '@/lib/workspace-status'

type EdgeSessionContextValue = {
  tcpConnected: boolean
  edgeReady: boolean
  edgeConnecting: boolean
  edgeError: string | null
  host: string
  alePort: string
  /** e.g. http://192.168.10.36:80 — match Bruno base URL (port 80 if omitted there). */
  edgeApiBaseUrl: string
  blocks: EdgeBlockInfo[]
  processes: EdgeProcessInfo[]
  loadingBlocks: boolean
  loadingProcesses: boolean
  refreshBlocks: () => Promise<void>
  refreshProcesses: (options?: { silent?: boolean }) => Promise<void>
  refreshProcessByName: (processName: string) => Promise<void>
  refreshAll: () => Promise<void>
  fetchBlockParams: (blockName: string) => Promise<EdgeBlockParam[]>
  listLogicalDevices: () => Promise<{ name: string }[]>
  notifySelectedProcess: (name: string) => void
  client: EdgeApiClient
  invokeBlock: (
    name: string,
    params: Record<string, unknown>,
    orderedParamNames?: string[],
  ) => Promise<{ status: number; response: string | null }>
  startProcess: (name: string) => Promise<void>
  stopProcess: (name: string) => Promise<void>
  fetchEdgeMeta: () => Promise<{
    version: string | null
    setup: string | null
    licenseValid: boolean | null
  }>
}

const EdgeSessionContext = createContext<EdgeSessionContextValue | null>(null)

export function useEdgeSession(): EdgeSessionContextValue {
  const ctx = useContext(EdgeSessionContext)
  if (!ctx) throw new Error('useEdgeSession must be used within EdgeSessionProvider')
  return ctx
}

export function useEdgeSessionOptional(): EdgeSessionContextValue | null {
  return useContext(EdgeSessionContext)
}

type EdgeSessionProviderProps = {
  host: string
  alePort: string
  tcpConnected: boolean
  /** When false, background process polling is paused (saves re-renders on unrelated tabs). */
  pollActive?: boolean
  children: ReactNode
}

export function EdgeSessionProvider({
  host,
  alePort,
  tcpConnected,
  pollActive = true,
  children,
}: EdgeSessionProviderProps) {
  const clientRef = useRef(new EdgeApiClient())
  const [edgeReady, setEdgeReady] = useState(false)
  const [edgeConnecting, setEdgeConnecting] = useState(false)
  const [edgeError, setEdgeError] = useState<string | null>(null)
  const [blocks, setBlocks] = useState<EdgeBlockInfo[]>([])
  const [processes, setProcesses] = useState<EdgeProcessInfo[]>([])
  const [loadingBlocks, setLoadingBlocks] = useState(false)
  const [loadingProcesses, setLoadingProcesses] = useState(false)

  const port = alePort?.trim() || '80'
  const edgeApiBaseUrl = host.trim() ? `http://${host.trim()}:${port}` : ''
  const processesRef = useRef(processes)
  processesRef.current = processes
  const recentProcessNamesRef = useRef<string[]>([])
  const selectedProcessRef = useRef<string>('')

  const trackRecentProcess = (name: string) => {
    recentProcessNamesRef.current = [
      name,
      ...recentProcessNamesRef.current.filter((n) => n !== name),
    ].slice(0, 8)
  }

  const patchProcess = useCallback((name: string, patch: Partial<EdgeProcessInfo>) => {
    setProcesses((prev) => {
      const existing = prev.find((p) => p.name === name)
      return mergeProcessIntoList(prev, { name, ...existing, ...patch })
    })
  }, [])

  const refreshProcessByName = useCallback(
    async (processName: string) => {
      if (!edgeReady || !host.trim() || !processName) return
      trackRecentProcess(processName)
      try {
        const info = await clientRef.current.getProcess(host, port, processName)
        setProcesses((prev) => mergeProcessIntoList(prev, info))
      } catch {
        /* ignore */
      }
    },
    [edgeReady, host, port],
  )

  /** Fetch one process from Edge and merge; poll until `started` matches expected (Edge can lag). */
  const syncProcessStatus = useCallback(
    async (processName: string, expectedStarted: boolean) => {
      if (!edgeReady || !host.trim()) return
      trackRecentProcess(processName)

      const delays = [0, 200, 400, 700, 1100, 1600]
      for (const delayMs of delays) {
        if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs))
        try {
          const info = await clientRef.current.getProcess(host, port, processName)
          setProcesses((prev) => mergeProcessIntoList(prev, info))
          if (info.started === expectedStarted) return
        } catch {
          /* retry */
        }
      }
      try {
        const list = await clientRef.current.listProcesses(host, port)
        setProcesses(list)
      } catch {
        /* keep optimistic state */
      }
    },
    [edgeReady, host, port],
  )

  const refreshBlocks = useCallback(async () => {
    if (!edgeReady || !host.trim()) return
    setLoadingBlocks(true)
    try {
      const list = await clientRef.current.listBlocks(host, port)
      setBlocks(list)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      setEdgeError(msg)
      toast.error(msg)
    } finally {
      setLoadingBlocks(false)
    }
  }, [edgeReady, host, port])

  const refreshProcesses = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!edgeReady || !host.trim()) return
      if (!options?.silent) setLoadingProcesses(true)
      try {
        const list = await clientRef.current.listProcesses(host, port)
        setProcesses(list)
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e)
        setEdgeError(msg)
        if (!options?.silent) toast.error(msg)
      } finally {
        if (!options?.silent) setLoadingProcesses(false)
      }
    },
    [edgeReady, host, port],
  )

  const refreshAll = useCallback(async () => {
    if (!edgeReady || !host.trim()) return
    setLoadingBlocks(true)
    setLoadingProcesses(true)
    try {
      const { blocks: blockList, processes: processList } =
        await clientRef.current.fetchCatalogLists(host, port)
      setBlocks(blockList)
      setProcesses(processList)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      setEdgeError(msg)
      toast.error(msg)
    } finally {
      setLoadingBlocks(false)
      setLoadingProcesses(false)
    }
  }, [edgeReady, host, port])

  useEffect(() => {
    if (!tcpConnected || !host.trim()) {
      clientRef.current.clearSession()
      setEdgeReady(false)
      setEdgeConnecting(false)
      setEdgeError(null)
      setBlocks([])
      setProcesses([])
      clearStatus('edge')
      return
    }

    let cancelled = false
    setEdgeConnecting(true)
    setEdgeError(null)

    void (async () => {
      const creds = await getAleEnvCredentials()
      if (!creds) {
        if (cancelled) return
        setEdgeReady(false)
        setEdgeError(ALE_ENV_MISSING_MSG)
        clearStatus('edge')
        return
      }

      try {
        await clientRef.current.initCredentials(
          creds.username,
          creds.password,
          creds.passwordIsHashed,
        )
        if (cancelled) return
        setEdgeReady(true)
        setEdgeConnecting(false)
        publishStatus('edge', {
          status: 'connected',
          host,
          port: parseInt(port, 10) || 80,
          label: 'Edge',
        })

        setLoadingBlocks(true)
        setLoadingProcesses(true)
        const { blocks: blockList, processes: processList } =
          await clientRef.current.fetchCatalog(
            host,
            port,
            creds.username,
            creds.password,
            creds.passwordIsHashed,
          )
        if (cancelled) return
        setBlocks(blockList)
        setProcesses(processList)
      } catch (e: unknown) {
        if (cancelled) return
        const msg = e instanceof Error ? e.message : String(e)
        setEdgeReady(false)
        setEdgeError(msg)
        clearStatus('edge')
      } finally {
        if (!cancelled) {
          setLoadingBlocks(false)
          setLoadingProcesses(false)
        }
      }
    })()

    return () => {
      cancelled = true
      clientRef.current.clearSession()
      setEdgeReady(false)
      setBlocks([])
      setProcesses([])
      clearStatus('edge')
    }
  }, [tcpConnected, host, port])

  useEffect(() => () => clearStatus('edge'), [])

  // Light poll: refresh process list + status for selected process only (not N× getProcess).
  useEffect(() => {
    if (!pollActive || !tcpConnected || !edgeReady || !host.trim()) return

    let intervalId: number | undefined
    const delayId = window.setTimeout(() => {
      intervalId = window.setInterval(() => {
        void (async () => {
          try {
            const list = await clientRef.current.listProcesses(host, port)
            let merged = list
            const sel = selectedProcessRef.current
            if (sel) {
              const info = await clientRef.current
                .getProcess(host, port, sel)
                .catch(() => ({ name: sel }))
              merged = mergeProcessIntoList(merged, info)
            }
            setProcesses(merged)
          } catch {
            /* ignore background poll errors */
          }
        })()
      }, 10_000)
    }, 15_000)

    return () => {
      window.clearTimeout(delayId)
      if (intervalId != null) window.clearInterval(intervalId)
    }
  }, [pollActive, tcpConnected, edgeReady, host, port])

  const invokeBlock = useCallback(
    async (name: string, params: Record<string, unknown>, orderedParamNames?: string[]) => {
      const res = await clientRef.current.invokeBlock(host, port, name, params, orderedParamNames)
      if (!aleResponseIsInvokeSuccess(res.data, res.status)) {
        const dbg = clientRef.current.lastInvokeDebug
        const detail = dbg
          ? `HTTP ${dbg.status} · cookie=${dbg.hadCookie} · basicAuth=${dbg.hadBasicAuth}\nBody: ${dbg.body}\nResponse: ${dbg.response ?? '(empty)'}`
          : ''
        const msg = formatEdgeApiError(res.data, res.status)
        throw new Error(detail ? `${msg}\n\n---\n${detail}` : msg)
      }
      return { status: res.status, response: res.data }
    },
    [host, port],
  )

  const startProcess = useCallback(
    async (name: string) => {
      trackRecentProcess(name)
      patchProcess(name, { started: true })
      const res = await clientRef.current.startProcess(host, port, name)
      if (!res.ok && res.status !== 204) {
        patchProcess(name, { started: false })
        throw new Error(res.data?.trim() || `Start failed (${res.status})`)
      }
      await syncProcessStatus(name, true)
    },
    [host, port, patchProcess, syncProcessStatus],
  )

  const stopProcess = useCallback(
    async (name: string) => {
      trackRecentProcess(name)
      patchProcess(name, { started: false })
      const res = await clientRef.current.stopProcess(host, port, name)
      if (!res.ok && res.status !== 204) {
        patchProcess(name, { started: true })
        throw new Error(res.data?.trim() || `Stop failed (${res.status})`)
      }
      await syncProcessStatus(name, false)
    },
    [host, port, patchProcess, syncProcessStatus],
  )

  const fetchBlockParams = useCallback(
    async (blockName: string) => {
      if (!edgeReady || !host.trim()) return []
      return clientRef.current.getBlockParams(host, port, blockName)
    },
    [edgeReady, host, port],
  )

  const listLogicalDevices = useCallback(async () => {
    if (!edgeReady || !host.trim()) return []
    return clientRef.current.listLogicalDevices(host, port)
  }, [edgeReady, host, port])

  const notifySelectedProcess = useCallback((name: string) => {
    selectedProcessRef.current = name
  }, [])

  const fetchEdgeMeta = useCallback(async () => {
    if (!edgeReady || !host.trim()) {
      return { version: null, setup: null, licenseValid: null }
    }
    const [version, setup, licenseValid] = await Promise.all([
      clientRef.current.getVersion(host, port).catch(() => null),
      clientRef.current.getSetup(host, port).catch(() => null),
      clientRef.current.checkLicenseValid(host, port).catch(() => null),
    ])
    return { version, setup, licenseValid }
  }, [edgeReady, host, port])

  const value = useMemo(
    () => ({
      tcpConnected,
      edgeReady,
      edgeConnecting,
      edgeError,
      host,
      alePort: port,
      edgeApiBaseUrl,
      blocks,
      processes,
      loadingBlocks,
      loadingProcesses,
      refreshBlocks,
      refreshProcesses,
      refreshProcessByName,
      refreshAll,
      fetchBlockParams,
      listLogicalDevices,
      notifySelectedProcess,
      client: clientRef.current,
      invokeBlock,
      startProcess,
      stopProcess,
      fetchEdgeMeta,
    }),
    [
      tcpConnected,
      edgeReady,
      edgeConnecting,
      edgeError,
      host,
      port,
      edgeApiBaseUrl,
      blocks,
      processes,
      loadingBlocks,
      loadingProcesses,
      refreshBlocks,
      refreshProcesses,
      refreshProcessByName,
      refreshAll,
      fetchBlockParams,
      listLogicalDevices,
      notifySelectedProcess,
      invokeBlock,
      startProcess,
      stopProcess,
      fetchEdgeMeta,
    ],
  )

  return (
    <EdgeSessionContext.Provider value={value}>{children}</EdgeSessionContext.Provider>
  )
}
