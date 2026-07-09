import { useState, useCallback, Suspense } from 'react'
import * as React from 'react'
import { Tabs, TabsContent } from './components/ui/tabs'
import { type HandheldSlot } from './components/HandheldTab'
import { TitleBar } from './components/TitleBar'
import { ProfileManager, type Profile } from './components/ProfileManager'
import type { AutomationSequence } from './lib/automation-types'
import { migrateStepsToSequences } from './lib/automation-types'
import { TCPEmulatorClient, HandheldServerClient, OCRClient } from './lib/tcp-client'
import { applyTheme, getSavedTheme, THEME_CHANGE_EVENT } from './lib/themes'
import { loadSettings } from './lib/settings'
import { useSettings } from './lib/settings-context'
import {
  useSettingsNavigationRequest,
  type SettingsHighlightTarget,
} from './lib/settings-navigation'
import { cn } from './lib/utils'
import { IS_MOBILE } from './lib/platform'
import AppMobile from './AppMobile'
import { SnowOverlay } from './components/SnowOverlay'
import { ConnectionStatus } from './components/ConnectionStatus'
import { publishStatus } from './lib/workspace-status'
import { TabNavBar } from './components/TabNavBar'
import { TabSidebar } from './components/TabSidebar'
import { CommandPalette } from './components/CommandPalette'
import { TabLoadingSkeleton } from './components/EmptyState'
import { KeyboardShortcutsDialog } from './components/KeyboardShortcutsDialog'
import { BottomMenu } from './components/BottomMenu'
import { TooltipProvider } from './components/ui/tooltip'
import { Toaster, toast } from 'sonner'
import { AppTour } from './components/AppTour'
import { TourInteractionProvider } from './contexts/TourInteractionContext'
import { EdgeSessionProvider } from './contexts/EdgeSessionContext'
import { PopoutTitleBar } from './components/PopoutTitleBar'
import { PopOutPlaceholder } from './components/PopOutPlaceholder'
import { getPopoutTabFromHash, getPopoutTabLabel, isPopoutableTab } from './lib/popout-tabs'
import { applyPopoutInitState } from './lib/apply-popout-state'

const FixedTab = React.lazy(() => import('./components/FixedTab').then((m) => ({ default: m.FixedTab })))
const HandheldTab = React.lazy(() => import('./components/HandheldTab').then((m) => ({ default: m.HandheldTab })))
const OCRTab = React.lazy(() => import('./components/OCRTab').then((m) => ({ default: m.OCRTab })))
const DecoderTab = React.lazy(() => import('./components/DecoderTab').then((m) => ({ default: m.DecoderTab })))
const AutomationTab = React.lazy(() => import('./components/AutomationTab').then((m) => ({ default: m.AutomationTab })))
const CustomTab = React.lazy(() => import('./components/CustomTab').then((m) => ({ default: m.CustomTab })))
const ApiTab = React.lazy(() => import('./components/Api').then((m) => ({ default: m.ApiTab })))
const EdgeTab = React.lazy(() => import('./components/EdgeTab').then((m) => ({ default: m.EdgeTab })))
const BarcodeGenerator = React.lazy(() => import('./components/BarcodeGenerator').then((m) => ({ default: m.BarcodeGenerator })))
const DatabaseTab = React.lazy(() => import('./components/database/DatabaseTab').then((m) => ({ default: m.DatabaseTab })))
const SftpTab = React.lazy(() => import('./components/SftpTab').then((m) => ({ default: m.SftpTab })))
const NetScanTab = React.lazy(() => import('./components/NetScanTab').then((m) => ({ default: m.NetScanTab })))
const LinkToUidTab = React.lazy(() => import('./components/LinkToUidTab').then((m) => ({ default: m.LinkToUidTab })))
const AdminTerminalTab = React.lazy(() => import('./components/AdminTerminalTab').then((m) => ({ default: m.AdminTerminalTab })))
const SystemLogAnalyzerTab = React.lazy(() =>
  import('./components/SystemLogAnalyzerTab').then((m) => ({ default: m.SystemLogAnalyzerTab })),
)
const LogAggregatorTab = React.lazy(() => import('./components/LogAggregatorTab').then((m) => ({ default: m.LogAggregatorTab })))

/** Warm tab JS chunks in the background so first click rarely hits Suspense. */
const TAB_MODULE_LOADERS: Record<string, () => Promise<unknown>> = {
  fixed: () => import('./components/FixedTab'),
  handheld: () => import('./components/HandheldTab'),
  ocr: () => import('./components/OCRTab'),
  custom: () => import('./components/CustomTab'),
  api: () => import('./components/Api'),
  edge: () => import('./components/EdgeTab'),
  decoder: () => import('./components/DecoderTab'),
  automation: () => import('./components/AutomationTab'),
  generator: () => import('./components/BarcodeGenerator'),
  database: () => import('./components/database/DatabaseTab'),
  sftp: () => import('./components/SftpTab'),
  netscan: () => import('./components/NetScanTab'),
  link2uid: () => import('./components/LinkToUidTab'),
  terminal: () => import('./components/AdminTerminalTab'),
  logs: () => import('./components/SystemLogAnalyzerTab'),
  logagg: () => import('./components/LogAggregatorTab'),
}

function preloadTabModules(): void {
  const loaders = [
    TAB_MODULE_LOADERS.fixed,
    TAB_MODULE_LOADERS.handheld,
    TAB_MODULE_LOADERS.ocr,
    TAB_MODULE_LOADERS.edge,
    TAB_MODULE_LOADERS.api,
    TAB_MODULE_LOADERS.automation,
    TAB_MODULE_LOADERS.database,
  ]
  const run = () => loaders.forEach((load) => void load())
  if (typeof requestIdleCallback !== 'undefined') {
    requestIdleCallback(run, { timeout: 2000 })
  } else {
    window.setTimeout(run, 100)
  }
}

const TAB_PANEL_CLASS =
  'h-full mt-0 rounded-xl border border-border/50 tab-content-animate data-[state=inactive]:hidden bg-background data-[state=active]:bg-background/95 data-[state=active]:backdrop-blur-sm'

/** Tabs that unmount when inactive (e.g. terminal shell). */
const UNMOUNT_ON_LEAVE = new Set(['terminal'])

function TabLoadingFallback() {
  return <TabLoadingSkeleton />
}

function TabPanel({
  tabId,
  visited,
  className,
  children,
}: {
  tabId: string
  visited: boolean
  className?: string
  children: React.ReactNode
}) {
  return (
    <TabsContent
      value={tabId}
      forceMount={visited && !UNMOUNT_ON_LEAVE.has(tabId) ? true : undefined}
      className={className}
    >
      <Suspense fallback={<TabLoadingFallback />}>{children}</Suspense>
    </TabsContent>
  )
}

const TAB_VALUES_FULL = [
  'fixed',
  'handheld',
  'ocr',
  'custom',
  'api',
  'decoder',
  'automation',
  'generator',
  'database',
  'sftp',
  'netscan',
] as const
const TAB_VALUES = (IS_MOBILE
  ? TAB_VALUES_FULL.filter((t) => t !== 'netscan')
  : TAB_VALUES_FULL) as readonly string[]

const ADMIN_TAB_VALUES = ['link2uid', 'terminal', 'logs', 'logagg'] as const

function App() {
  const { settings, setSettings } = useSettings()
  const [emulator] = useState(() => new TCPEmulatorClient())
  const [handheldServer] = useState(() => new HandheldServerClient(10472))
  const [ocrClient] = useState(() => new OCRClient())
  
  // Shared state across tabs (like Java EmulatorUI fields - lines 11-24)
  const [host, setHost] = useState('')
  const [connected, setConnected] = useState(false)
  const [delay, setDelay] = useState('20') // Fixed reader inter-tag delay (ms)
  const [handheldDelay, setHandheldDelay] = useState('20')

  // Fixed Tab persistent state
  const [port, setPort] = useState('12352')
  const [alePort, setAlePort] = useState('80')
  const [driver, setDriver] = useState('llrp')
  const [uid, setUid] = useState('')
  const [antenna, setAntenna] = useState('1')
  const [rssi, setRssi] = useState('-45.0')
  const [startSerial, setStartSerial] = useState('1')
  const [fixedUpcList, setFixedUpcList] = useState('00000000000000,5')
  const [fixedEpcList, setFixedEpcList] = useState('')

  // Handheld Tab persistent state (multi-port slots)
  const [handheldSlots, setHandheldSlots] = useState<HandheldSlot[]>([
    { id: crypto.randomUUID(), port: 10472, upcList: '00000000000000,5', epcList: '', startSerial: '1' }
  ])

  // OCR Tab persistent state
  const [ocrMessage, setOcrMessage] = useState('')

  // Custom Tab persistent state
  const [customPort, setCustomPort] = useState('12345')
  const [customMessage, setCustomMessage] = useState('')

  // Automation Tab persistent state (sequences run in order: 1, 2, 3...)
  const [automationSequences, setAutomationSequences] = useState<AutomationSequence[]>(() => [
    { id: crypto.randomUUID(), name: 'Sequence 1', order: 0, steps: [] }
  ])

  const [activeTab, setActiveTab] = useState<string>(() => {
    const { defaultTab } = loadSettings()
    return defaultTab
  })

  /**
   * Visited tabs stay mounted (hidden when inactive) so revisiting is instant
   * and tab state is preserved.
   */
  const [visitedTabs, setVisitedTabs] = useState<Set<string>>(() => new Set([activeTab]))

  /** Mark visited in the same tick as the tab change so forceMount does not flip after Suspense starts. */
  const switchTab = useCallback((tab: string) => {
    void TAB_MODULE_LOADERS[tab]?.()
    setActiveTab(tab)
    setVisitedTabs((prev) => (prev.has(tab) ? prev : new Set([...prev, tab])))
  }, [])

  React.useEffect(() => {
    preloadTabModules()
  }, [])
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsHighlight, setSettingsHighlight] = useState<SettingsHighlightTarget | null>(null)
  const [profilesOpen, setProfilesOpen] = useState(false)
  const [saveProfileOpen, setSaveProfileOpen] = useState(false)
  const [base64Open, setBase64Open] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)
  const [tourRun, setTourRun] = useState(false)

  const handleAdminLogin = useCallback(() => {
    setIsAdmin(true)
    switchTab('link2uid')
    toast.success('Admin access granted')
  }, [switchTab])

  const handleAdminLogout = useCallback(() => {
    void window.electronAPI?.adminLogout?.()
    setIsAdmin(false)
    switchTab('fixed')
  }, [switchTab])

  React.useEffect(() => {
    void window.electronAPI?.adminIsAuthenticated?.().then((res) => {
      if (res?.ok) setIsAdmin(true)
    })
  }, [])

  const [popoutTabId] = useState<string | null>(() => getPopoutTabFromHash())
  const isPopoutWindow = Boolean(popoutTabId && window.electronAPI?.popoutGetWindowInfo)
  const [poppedOutTabs, setPoppedOutTabs] = useState<Set<string>>(() => new Set())

  const [showCustomTitlebar, setShowCustomTitlebar] = React.useState(true)
  const [currentTheme, setCurrentTheme] = useState(getSavedTheme())

  const isDark = typeof document !== 'undefined' && document.documentElement.classList.contains('dark')

  const toggleTheme = useCallback(() => {
    const newMode = document.documentElement.classList.contains('dark') ? 'light' : 'dark'
    localStorage.setItem('theme', newMode)
    document.documentElement.classList.toggle('dark', newMode === 'dark')
    applyTheme(getSavedTheme(), newMode === 'dark')
  }, [])

  const handlePaletteConnect = useCallback(() => {
    if (!host) return
    emulator.connect(host, 12352, () => setConnected(true), () => setConnected(false)).catch(console.error)
  }, [host, emulator])

  const handlePaletteDisconnect = useCallback(() => {
    emulator.disconnect(() => setConnected(false))
  }, [emulator])

  const handleOpenBase64 = useCallback(() => {
    switchTab('api')
    setBase64Open(true)
  }, [switchTab])

  const handleOpenSettings = useCallback((highlight?: SettingsHighlightTarget) => {
    setSettingsHighlight(highlight ?? null)
    setSettingsOpen(true)
  }, [])

  const handleSettingsOpenChange = useCallback((open: boolean) => {
    setSettingsOpen(open)
    if (!open) setSettingsHighlight(null)
  }, [])

  useSettingsNavigationRequest(handleOpenSettings)

  const handleLoadProfile = (profile: Profile) => {
    setHost(profile.host)
    setPort(profile.port)
    setAlePort(profile.alePort ?? '8080')
    setDriver(profile.driver)
    setUid(profile.uid)
    setAntenna(profile.antenna)
    setRssi(profile.rssi)
    setStartSerial(profile.startSerial)
    if (
      profile.fixedSerialContinuesAcrossUpcLines !== undefined ||
      profile.handheldSerialContinuesAcrossUpcLines !== undefined
    ) {
      setSettings({
        ...(profile.fixedSerialContinuesAcrossUpcLines !== undefined && {
          fixedSerialContinuesAcrossUpcLines: profile.fixedSerialContinuesAcrossUpcLines,
        }),
        ...(profile.handheldSerialContinuesAcrossUpcLines !== undefined && {
          handheldSerialContinuesAcrossUpcLines: profile.handheldSerialContinuesAcrossUpcLines,
        }),
      })
    } else if (profile.serialContinuesAcrossUpcLines !== undefined) {
      setSettings({
        fixedSerialContinuesAcrossUpcLines: profile.serialContinuesAcrossUpcLines,
        handheldSerialContinuesAcrossUpcLines: profile.serialContinuesAcrossUpcLines,
      })
    }
    setFixedUpcList(profile.fixedUpcList)
    setFixedEpcList(profile.fixedEpcList)
    if (profile.handheldSlots?.length) {
      setHandheldSlots(profile.handheldSlots)
    } else if (profile.hhUpcList !== undefined || profile.hhEpcList !== undefined) {
      setHandheldSlots([{ id: crypto.randomUUID(), port: 10472, upcList: profile.hhUpcList || '', epcList: profile.hhEpcList || '', startSerial: '1' }])
    }
    setOcrMessage(profile.ocrMessage)
    if (profile.customPort) setCustomPort(profile.customPort)
    if (profile.customMessage) setCustomMessage(profile.customMessage)
    setDelay(profile.delay)
    setHandheldDelay(profile.handheldDelay ?? profile.delay)
    if (profile.automationSequences?.length) {
      setAutomationSequences(profile.automationSequences)
    } else if (profile.automationSteps?.length) {
      setAutomationSequences(migrateStepsToSequences(profile.automationSteps))
    }
  }

  const currentProfileState = {
    host,
    port,
    alePort,
    driver,
    uid,
    antenna,
    rssi,
    startSerial,
    fixedSerialContinuesAcrossUpcLines: settings.fixedSerialContinuesAcrossUpcLines,
    handheldSerialContinuesAcrossUpcLines: settings.handheldSerialContinuesAcrossUpcLines,
    fixedUpcList,
    fixedEpcList,
    handheldSlots,
    ocrMessage,
    customPort,
    customMessage,
    delay,
    handheldDelay,
    automationSequences
  }

  const popoutStateSetters = React.useMemo(
    () => ({
      setHost,
      setPort,
      setAlePort,
      setDriver,
      setUid,
      setAntenna,
      setRssi,
      setStartSerial,
      setFixedUpcList,
      setFixedEpcList,
      setHandheldSlots,
      setOcrMessage,
      setCustomPort,
      setCustomMessage,
      setDelay,
      setHandheldDelay,
      setAutomationSequences,
      setConnected,
      setSettings,
    }),
    [setSettings],
  )

  const handlePopOut = useCallback(
    async (tabId: string) => {
      if (!window.electronAPI?.popoutOpen || !isPopoutableTab(tabId)) return
      try {
        const result = await window.electronAPI.popoutOpen(tabId, getPopoutTabLabel(tabId), {
          tabId,
          state: currentProfileState as Record<string, unknown>,
          isAdmin,
        })
        if (result?.ok) {
          setPoppedOutTabs((prev) => new Set(prev).add(tabId))
          if (activeTab === tabId) {
            const next = [...TAB_VALUES, ...(isAdmin ? [...ADMIN_TAB_VALUES] : [])].find(
              (t) => t !== tabId && !poppedOutTabs.has(t),
            )
            if (next) switchTab(next)
          }
          toast.success(`${getPopoutTabLabel(tabId)} opened in new window`)
        }
      } catch (err) {
        console.error(err)
        toast.error('Could not open pop-out window')
      }
    },
    [activeTab, currentProfileState, isAdmin, poppedOutTabs, switchTab],
  )

  const handleDockPopout = useCallback(async (tabId: string) => {
    if (!window.electronAPI?.popoutDock) return
    await window.electronAPI.popoutDock(tabId)
    setPoppedOutTabs((prev) => {
      const next = new Set(prev)
      next.delete(tabId)
      return next
    })
  }, [])

  const handleFocusPopout = useCallback(
    (tabId: string) => {
      void handlePopOut(tabId)
    },
    [handlePopOut],
  )

  React.useEffect(() => {
    if (isPopoutWindow || !window.electronAPI?.popoutGetWindowInfo) return
    void window.electronAPI.popoutGetWindowInfo().then((info) => {
      if (info?.poppedTabs?.length) {
        setPoppedOutTabs(new Set(info.poppedTabs))
      }
    })
    const unsub = window.electronAPI.onPopoutClosed?.((tabId) => {
      setPoppedOutTabs((prev) => {
        const next = new Set(prev)
        next.delete(tabId)
        return next
      })
    })
    return () => unsub?.()
  }, [isPopoutWindow])

  React.useEffect(() => {
    if (!isPopoutWindow || !window.electronAPI?.popoutGetInitState) return
    void window.electronAPI.popoutGetInitState().then((init) => {
      if (!init?.state) return
      applyPopoutInitState(init.state, popoutStateSetters)
      if (init.isAdmin) setIsAdmin(true)
    })
    void window.electronAPI.tcpIsConnected?.().then((c) => {
      if (c) setConnected(true)
    })
  }, [isPopoutWindow, popoutStateSetters])

  React.useEffect(() => {
    if (!isPopoutWindow || !popoutTabId) return
    setVisitedTabs(new Set([popoutTabId]))
    switchTab(popoutTabId)
  }, [isPopoutWindow, popoutTabId, switchTab])

  React.useEffect(() => {
    if (isPopoutWindow || !window.electronAPI?.popoutBroadcastState) return
    if (poppedOutTabs.size === 0) return
    const t = window.setTimeout(() => {
      window.electronAPI?.popoutBroadcastState?.(
        currentProfileState as Record<string, unknown>,
        connected,
      )
    }, 250)
    return () => window.clearTimeout(t)
  }, [isPopoutWindow, poppedOutTabs, currentProfileState, connected])

  React.useEffect(() => {
    if (!isPopoutWindow || !window.electronAPI?.onPopoutStateUpdate) return
    const unsub = window.electronAPI.onPopoutStateUpdate((state, tcpConnected) => {
      applyPopoutInitState(state, popoutStateSetters)
      setConnected(tcpConnected)
    })
    return () => unsub?.()
  }, [isPopoutWindow, popoutStateSetters])

  React.useEffect(() => {
    // Hide custom titlebar on Linux (uses native titlebar)
    if (window.electronAPI?.platform === 'linux') {
      setShowCustomTitlebar(false)
    }

    // Initialize theme colors and dark class (so Tailwind dark: variants work on load)
    const savedTheme = getSavedTheme()
    setCurrentTheme(savedTheme)
    const savedMode = localStorage.getItem('theme')
    const isDark = savedMode === 'dark'
      ? true
      : savedMode === 'light'
        ? false
        : window.matchMedia('(prefers-color-scheme: dark)').matches
    document.documentElement.classList.toggle('dark', isDark)
    applyTheme(savedTheme, isDark)

    // Listen for theme changes
    const handleThemeChange = (e: Event) => {
      const customEvent = e as CustomEvent
      setCurrentTheme(customEvent.detail.theme)
    }

    window.addEventListener(THEME_CHANGE_EVENT, handleThemeChange)
    return () => window.removeEventListener(THEME_CHANGE_EVENT, handleThemeChange)
  }, [])

  // Publish fixed-reader status to the Workspace Bar
  React.useEffect(() => {
    publishStatus('fixed', {
      status: connected ? 'connected' : 'idle',
      host: host || undefined,
      port: connected ? Number(port) || 12352 : undefined,
      label: 'Fixed',
    })
  }, [connected, host, port])

  // Toast when update is available (Electron only)
  React.useEffect(() => {
    const api = window.electronAPI
    if (!api) return
    api.onUpdateAvailable(async () => {
      let autoDownload = true
      try {
        autoDownload = await api.getAutoUpdateEnabled()
      } catch {
        autoDownload = true
      }
      if (autoDownload) {
        toast.info('Update found', {
          description: 'Downloading in the background. Restart from Settings when it is ready.',
          duration: 8000,
        })
      } else {
        toast.info('Update available', {
          description: 'Open Settings → Updates to download and install.',
          duration: 8000,
        })
      }
    })
    api.onUpdateDownloaded(() => {
      toast.success('Update ready', {
        description: 'Restart the app to install the update.',
        duration: 10000,
      })
    })
  }, [])

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
        const target = e.target as HTMLElement
        if (!target.closest('input') && !target.closest('textarea') && !target.closest('[contenteditable="true"]')) {
          e.preventDefault()
          return
        }
      }
      if (e.key === '?' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const target = e.target as HTMLElement
        if (!target.closest('input') && !target.closest('textarea')) {
          e.preventDefault()
          setShortcutsOpen(false)
          setSettingsOpen(false)
          setTourRun(true)
          return
        }
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        setPaletteOpen((v) => !v)
        return
      }
      if (e.ctrlKey || e.metaKey) {
        const num = parseInt(e.key)
        if (num >= 1 && num <= 9) {
          e.preventDefault()
          switchTab(TAB_VALUES[num - 1])
        } else if (e.key === '0') {
          e.preventDefault()
          switchTab(TAB_VALUES[9])
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [switchTab])

  if (IS_MOBILE) {
    return <AppMobile />
  }

  const effectiveActiveTab = isPopoutWindow && popoutTabId ? popoutTabId : activeTab
  const tabContentHidden = !isPopoutWindow && poppedOutTabs.has(activeTab)

  return (
    <TooltipProvider delayDuration={300}>
    <TourInteractionProvider tourRun={tourRun}>
    <EdgeSessionProvider
      host={host}
      alePort={alePort}
      tcpConnected={connected}
      pollActive={effectiveActiveTab === 'edge' || effectiveActiveTab === 'automation'}
    >
    <div className="h-screen flex flex-col bg-background relative overflow-hidden">
      {currentTheme === 'christmas' && <SnowOverlay />}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute inset-0 bg-[linear-gradient(hsl(var(--primary)/0.02)_1px,transparent_1px),linear-gradient(90deg,hsl(var(--primary)/0.02)_1px,transparent_1px)] bg-[size:64px_64px] [mask-image:radial-gradient(ellipse_80%_50%_at_50%_50%,#000,transparent)]" />
      </div>

      {/* Custom Titlebar (Windows/Mac only) */}
      {showCustomTitlebar && isPopoutWindow && popoutTabId && (
        <PopoutTitleBar
          tabId={popoutTabId}
          onDock={() => void handleDockPopout(popoutTabId)}
        />
      )}
      {showCustomTitlebar && !isPopoutWindow && (
        <TitleBar 
          connected={connected} 
          host={host} 
          port={port} 
          settingsOpen={settingsOpen}
          onSettingsOpenChange={handleSettingsOpenChange}
          settingsHighlight={settingsHighlight}
          onSettingsHighlightClear={() => setSettingsHighlight(null)}
          onStartInteractiveTour={() => {
            setSettingsOpen(false)
            setTourRun(true)
          }}
          actionsMenu={
            <BottomMenu
              activeTab={activeTab}
              onSwitchTab={switchTab}
              onOpenProfiles={() => setProfilesOpen(true)}
              onOpenSaveCurrent={() => setSaveProfileOpen(true)}
              onOpenSettings={() => handleOpenSettings()}
              onOpenShortcuts={() => setShortcutsOpen(true)}
              onStartInteractiveTour={() => {
                setSettingsOpen(false)
                setShortcutsOpen(false)
                setTourRun(true)
              }}
              inline
              isAdmin={isAdmin}
              onAdminLogin={handleAdminLogin}
              onAdminLogout={handleAdminLogout}
            />
          }
        />
      )}
      {/* Profile dialogs (triggered by BottomMenu) */}
      {!isPopoutWindow && (
      <ProfileManager 
        currentState={currentProfileState} 
        onLoadProfile={handleLoadProfile}
        externalOpen={profilesOpen}
        onExternalOpenChange={setProfilesOpen}
        externalSaveOpen={saveProfileOpen}
        onExternalSaveOpenChange={setSaveProfileOpen}
        dialogsOnly
      />
      )}

      <div className="electron-no-drag flex flex-1 overflow-hidden relative z-10 min-h-0">
        <Tabs
          value={effectiveActiveTab}
          onValueChange={isPopoutWindow ? undefined : switchTab}
          className="flex flex-1 min-h-0 min-w-0 overflow-hidden"
        >
          {isAdmin && !isPopoutWindow && (
            <TabSidebar
              value={activeTab}
              poppedOutTabs={poppedOutTabs}
              onPopOut={handlePopOut}
            />
          )}

          {/* Main Content */}
          <main
            className={cn(
              'flex-1 min-w-0 container overflow-hidden min-h-0 flex flex-col',
              isAdmin && !isPopoutWindow ? 'px-4 py-4' : 'px-6 py-6',
              isPopoutWindow && 'px-4 py-4',
            )}
          >
            {!isPopoutWindow && (
            <div
              className={cn(
                'flex items-center gap-4',
                isAdmin
                  ? 'flex-row justify-start mb-2'
                  : 'flex-col md:flex-row justify-center mb-4',
              )}
            >
              {!isAdmin && (
                <ConnectionStatus
                  emulator={emulator}
                  host={host}
                  setHost={setHost}
                  alePort={alePort}
                  setAlePort={setAlePort}
                  connected={connected}
                  setConnected={setConnected}
                />
              )}
              {!isAdmin && (
                <TabNavBar
                  value={activeTab}
                  className="animate-scale-in"
                  isAdmin={isAdmin}
                  poppedOutTabs={poppedOutTabs}
                  onPopOut={handlePopOut}
                />
              )}
              {isAdmin && (
                <ConnectionStatus
                  emulator={emulator}
                  host={host}
                  setHost={setHost}
                  alePort={alePort}
                  setAlePort={setAlePort}
                  connected={connected}
                  setConnected={setConnected}
                />
              )}
            </div>
            )}

            {isPopoutWindow && (
              <div className="flex shrink-0 items-center gap-3 mb-3">
                <ConnectionStatus
                  emulator={emulator}
                  host={host}
                  setHost={setHost}
                  alePort={alePort}
                  setAlePort={setAlePort}
                  connected={connected}
                  setConnected={setConnected}
                />
              </div>
            )}

            <div className="flex-1 min-h-0 overflow-hidden">
            {tabContentHidden ? (
              <PopOutPlaceholder
                tabId={activeTab}
                onFocusWindow={() => handleFocusPopout(activeTab)}
                onDock={() => void handleDockPopout(activeTab)}
              />
            ) : (
            <>
            <TabPanel
              tabId="fixed"
              visited={visitedTabs.has('fixed')}
              className={cn(
                TAB_PANEL_CLASS,
                'flex flex-col min-h-0',
                isPopoutWindow && popoutTabId === 'fixed'
                  ? 'p-3 overflow-hidden'
                  : 'p-6 overflow-y-auto',
              )}
            >
              <FixedTab 
                emulator={emulator} 
                host={host}
                setHost={setHost}
                port={port}
                setPort={setPort}
                alePort={alePort}
                connected={connected}
                setConnected={setConnected}
                driver={driver}
                setDriver={setDriver}
                uid={uid}
                setUid={setUid}
                antenna={antenna}
                setAntenna={setAntenna}
                rssi={rssi}
                setRssi={setRssi}
                startSerial={startSerial}
                setStartSerial={setStartSerial}
                upcList={fixedUpcList}
                setUpcList={setFixedUpcList}
                epcList={fixedEpcList}
                setEpcList={setFixedEpcList}
                delay={delay}
                setDelay={setDelay}
                fixedTabActive={effectiveActiveTab === 'fixed'}
                isPopout={isPopoutWindow && popoutTabId === 'fixed'}
              />
            </TabPanel>

            <TabPanel tabId="handheld" visited={visitedTabs.has('handheld')} className={cn(TAB_PANEL_CLASS, 'p-6 overflow-y-auto')}>
              <HandheldTab 
                slots={handheldSlots}
                setSlots={setHandheldSlots}
                handheldDelay={handheldDelay}
                setHandheldDelay={setHandheldDelay}
                rssi={rssi}
              />
            </TabPanel>

            <TabPanel tabId="ocr" visited={visitedTabs.has('ocr')} className={cn(TAB_PANEL_CLASS, 'p-6 overflow-y-auto')}>
              <OCRTab 
                host={host} 
                connected={connected} 
                ocrClient={ocrClient}
                message={ocrMessage}
                setMessage={setOcrMessage}
              />
            </TabPanel>

            <TabPanel tabId="custom" visited={visitedTabs.has('custom')} className={cn(TAB_PANEL_CLASS, 'p-6 overflow-y-auto')}>
              <CustomTab 
                host={host} 
                message={customMessage}
                setMessage={setCustomMessage}
                port={customPort}
                setPort={setCustomPort}
              />
            </TabPanel>

            <TabPanel tabId="api" visited={visitedTabs.has('api')} className={cn(TAB_PANEL_CLASS, 'p-6 overflow-y-auto')}>
              <ApiTab base64Open={base64Open} onBase64OpenChange={setBase64Open} />
            </TabPanel>

            <TabPanel tabId="edge" visited={visitedTabs.has('edge')} className={cn(TAB_PANEL_CLASS, 'p-6 overflow-hidden flex flex-col')}>
              <EdgeTab onSwitchTab={switchTab} edgeTabActive={effectiveActiveTab === 'edge'} />
            </TabPanel>

            <TabPanel tabId="decoder" visited={visitedTabs.has('decoder')} className={cn(TAB_PANEL_CLASS, 'p-6 overflow-y-auto')}>
              <DecoderTab />
            </TabPanel>

            <TabPanel tabId="automation" visited={visitedTabs.has('automation')} className={cn(TAB_PANEL_CLASS, 'p-6 overflow-hidden')}>
              <AutomationTab 
                emulator={emulator}
                handheldServer={handheldServer}
                ocrClient={ocrClient}
                host={host}
                alePort={alePort}
                customPort={customPort}
                delay={delay}
                handheldDelay={handheldDelay}
                sequences={automationSequences}
                setSequences={setAutomationSequences}
              />
            </TabPanel>

            <TabPanel tabId="generator" visited={visitedTabs.has('generator')} className={cn(TAB_PANEL_CLASS, 'p-6 overflow-y-auto')}>
              <BarcodeGenerator />
            </TabPanel>

            <TabPanel tabId="database" visited={visitedTabs.has('database')} className={cn(TAB_PANEL_CLASS, 'p-6 overflow-hidden')}>
              <DatabaseTab host={host} connected={connected} active={effectiveActiveTab === 'database'} />
            </TabPanel>

            <TabPanel tabId="sftp" visited={visitedTabs.has('sftp')} className={cn(TAB_PANEL_CLASS, 'p-6 overflow-hidden')}>
              <SftpTab host={host} setHost={setHost} />
            </TabPanel>

            <TabPanel tabId="netscan" visited={visitedTabs.has('netscan')} className={cn(TAB_PANEL_CLASS, 'p-6 overflow-hidden')}>
              <NetScanTab host={host} setHost={setHost} />
            </TabPanel>

            {isAdmin && (
              <>
                <TabPanel tabId="link2uid" visited={visitedTabs.has('link2uid')} className={cn(TAB_PANEL_CLASS, 'p-6 overflow-y-auto')}>
                  <LinkToUidTab />
                </TabPanel>
                <TabPanel tabId="terminal" visited={visitedTabs.has('terminal')} className={cn(TAB_PANEL_CLASS, 'p-6 overflow-hidden')}>
                  <AdminTerminalTab active={effectiveActiveTab === 'terminal'} />
                </TabPanel>
                <TabPanel tabId="logs" visited={visitedTabs.has('logs')} className={cn(TAB_PANEL_CLASS, 'p-6 overflow-y-auto')}>
                  <SystemLogAnalyzerTab />
                </TabPanel>
                <TabPanel tabId="logagg" visited={visitedTabs.has('logagg')} className={cn(TAB_PANEL_CLASS, 'p-6 overflow-y-auto')}>
                  <LogAggregatorTab />
                </TabPanel>
              </>
            )}
            </>
            )}
            </div>
          </main>
        </Tabs>
      </div>
    </div>
    {!isPopoutWindow && (
    <KeyboardShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
    )}
    {!isPopoutWindow && (
    <CommandPalette
      open={paletteOpen}
      onOpenChange={setPaletteOpen}
      onSwitchTab={switchTab}
      activeTab={effectiveActiveTab}
      connected={connected}
      onConnect={handlePaletteConnect}
      onDisconnect={handlePaletteDisconnect}
      onToggleTheme={toggleTheme}
      isDark={isDark}
      onOpenSettings={() => handleOpenSettings()}
      onOpenProfiles={() => setProfilesOpen(true)}
      onOpenBase64={handleOpenBase64}
      onOpenShortcuts={() => setShortcutsOpen(true)}
      onPopOutTab={handlePopOut}
      host={host}
      isAdmin={isAdmin}
      onAdminLogin={handleAdminLogin}
      onAdminLogout={handleAdminLogout}
    />
    )}
    <Toaster richColors position="bottom-right" />
    {!isPopoutWindow && (
    <AppTour
      run={tourRun}
      onRunChange={setTourRun}
      activeTab={activeTab}
      setActiveTab={switchTab}
      isAdmin={isAdmin}
      emulatorConnected={connected}
    />
    )}
    </EdgeSessionProvider>
    </TourInteractionProvider>
    </TooltipProvider>
  )
}

export default App

