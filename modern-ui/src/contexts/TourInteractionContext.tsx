import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

export type TourInteractionState = {
  dbMysqlConnected: boolean
  dbTableSelected: boolean
  sftpShellConnected: boolean
  sftpRemoteListed: boolean
  dbQueryRanThisTour: boolean
  /** True while the Edge connection hover panel is open (tour expands spotlight cutout + nudges tooltip). */
  connectionPopoverOpen: boolean
}

type TourInteractionApi = TourInteractionState & {
  setDbMysqlConnected: (v: boolean) => void
  setDbTableSelected: (v: boolean) => void
  setSftpShellConnected: (v: boolean) => void
  setSftpRemoteListed: (v: boolean) => void
  markDbQueryRan: () => void
  setConnectionPopoverOpen: (v: boolean) => void
}

const TourInteractionContext = createContext<TourInteractionApi | null>(null)

export function TourInteractionProvider({
  children,
  tourRun,
}: {
  children: ReactNode
  tourRun: boolean
}) {
  const [dbMysqlConnected, setDbMysqlConnected] = useState(false)
  const [dbTableSelected, setDbTableSelected] = useState(false)
  const [sftpShellConnected, setSftpShellConnected] = useState(false)
  const [sftpRemoteListed, setSftpRemoteListed] = useState(false)
  const [dbQueryRanThisTour, setDbQueryRanThisTour] = useState(false)
  const [connectionPopoverOpen, setConnectionPopoverOpen] = useState(false)

  useEffect(() => {
    if (!tourRun) return
    setDbQueryRanThisTour(false)
  }, [tourRun])

  useEffect(() => {
    if (!tourRun) setConnectionPopoverOpen(false)
  }, [tourRun])

  const markDbQueryRan = useCallback(() => {
    setDbQueryRanThisTour(true)
  }, [])

  const value = useMemo(
    () =>
      ({
        dbMysqlConnected,
        dbTableSelected,
        sftpShellConnected,
        sftpRemoteListed,
        dbQueryRanThisTour,
        connectionPopoverOpen,
        setDbMysqlConnected,
        setDbTableSelected,
        setSftpShellConnected,
        setSftpRemoteListed,
        markDbQueryRan,
        setConnectionPopoverOpen,
      }) satisfies TourInteractionApi,
    [
      dbMysqlConnected,
      dbTableSelected,
      sftpShellConnected,
      sftpRemoteListed,
      dbQueryRanThisTour,
      connectionPopoverOpen,
      markDbQueryRan,
    ],
  )

  return <TourInteractionContext.Provider value={value}>{children}</TourInteractionContext.Provider>
}

export function useTourInteractionOptional() {
  return useContext(TourInteractionContext)
}
