import { useState, useCallback } from 'react'
import * as React from 'react'
import { Tabs, TabsContent } from './components/ui/tabs'
import { FixedTab } from './components/FixedTab'
import { HandheldTab, type HandheldSlot } from './components/HandheldTab'
import { OCRTab } from './components/OCRTab'
import { DecoderTab } from './components/DecoderTab'
import { AutomationTab } from './components/AutomationTab'
import { CustomTab } from './components/CustomTab'
import { AdamTab } from './components/AdamTab'
import { ApiTab } from './components/Api'
import { BarcodeGenerator } from './components/BarcodeGenerator'
import { TitleBar } from './components/TitleBar'
import { ProfileManager, type Profile } from './components/ProfileManager'
import type { AutomationSequence } from './lib/automation-types'
import { migrateStepsToSequences } from './lib/automation-types'
import { TCPEmulatorClient, HandheldServerClient, OCRClient } from './lib/tcp-client'
import { applyTheme, getSavedTheme, THEME_CHANGE_EVENT } from './lib/themes'
import { loadSettings } from './lib/settings'
import { SnowOverlay } from './components/SnowOverlay'
import { ConnectionStatus } from './components/ConnectionStatus'
import { TabNavBar } from './components/TabNavBar'
import { CommandPalette } from './components/CommandPalette'
import { KeyboardShortcutsDialog } from './components/KeyboardShortcutsDialog'
import { BottomMenu } from './components/BottomMenu'
import { TooltipProvider } from './components/ui/tooltip'
import { Toaster } from 'sonner'

const TAB_VALUES = ['fixed', 'handheld', 'ocr', 'custom', 'adam', 'api', 'decoder', 'automation', 'generator'] as const

function App() {
  const [emulator] = useState(() => new TCPEmulatorClient())
  const [handheldServer] = useState(() => new HandheldServerClient(10472))
  const [ocrClient] = useState(() => new OCRClient())
  
  // Shared state across tabs (like Java EmulatorUI fields - lines 11-24)
  const [host, setHost] = useState('')
  const [connected, setConnected] = useState(false)
  const [delay, setDelay] = useState('20') // Shared delay like delaySpinner in Java

  // Fixed Tab persistent state
  const [port, setPort] = useState('12352')
  const [alePort, setAlePort] = useState('80')
  const [driver, setDriver] = useState('llrp')
  const [uid, setUid] = useState('')
  const [antenna, setAntenna] = useState('1')
  const [rssi, setRssi] = useState('-45.0')
  const [startSerial, setStartSerial] = useState('1')
  const [fixedUpcList, setFixedUpcList] = useState('00000000000001,5')
  const [fixedEpcList, setFixedEpcList] = useState('')

  // Handheld Tab persistent state (multi-port slots)
  const [handheldSlots, setHandheldSlots] = useState<HandheldSlot[]>([
    { id: crypto.randomUUID(), port: 10472, upcList: '00000000000001,5\n00000000000002,3', epcList: '' }
  ])

  // OCR Tab persistent state
  const [ocrMessage, setOcrMessage] = useState('')

  // Custom Tab persistent state
  const [customPort, setCustomPort] = useState('12345')
  const [customMessage, setCustomMessage] = useState('')

  // ADAM Tab persistent state
  const [adamHost, setAdamHost] = useState('')

  // Automation Tab persistent state (sequences run in order: 1, 2, 3...)
  const [automationSequences, setAutomationSequences] = useState<AutomationSequence[]>(() => [
    { id: crypto.randomUUID(), name: 'Sequence 1', order: 0, steps: [] }
  ])

  const [activeTab, setActiveTab] = useState<string>(() => loadSettings().defaultTab)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [profilesOpen, setProfilesOpen] = useState(false)
  const [saveProfileOpen, setSaveProfileOpen] = useState(false)
  const [base64Open, setBase64Open] = useState(false)

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
    setActiveTab('api')
    setBase64Open(true)
  }, [])

  const handleLoadProfile = (profile: Profile) => {
    setHost(profile.host)
    setPort(profile.port)
    setAlePort(profile.alePort ?? '8080')
    setDriver(profile.driver)
    setUid(profile.uid)
    setAntenna(profile.antenna)
    setRssi(profile.rssi)
    setStartSerial(profile.startSerial)
    setFixedUpcList(profile.fixedUpcList)
    setFixedEpcList(profile.fixedEpcList)
    if (profile.handheldSlots?.length) {
      setHandheldSlots(profile.handheldSlots)
    } else if (profile.hhUpcList !== undefined || profile.hhEpcList !== undefined) {
      setHandheldSlots([{ id: crypto.randomUUID(), port: 10472, upcList: profile.hhUpcList || '', epcList: profile.hhEpcList || '' }])
    }
    setOcrMessage(profile.ocrMessage)
    if (profile.customPort) setCustomPort(profile.customPort)
    if (profile.customMessage) setCustomMessage(profile.customMessage)
    if (profile.adamHost) setAdamHost(profile.adamHost)
    setDelay(profile.delay)
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
    fixedUpcList,
    fixedEpcList,
    handheldSlots,
    ocrMessage,
    customPort,
    customMessage,
    adamHost,
    delay,
    automationSequences
  }

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

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === '?' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const target = e.target as HTMLElement
        if (!target.closest('input') && !target.closest('textarea')) {
          e.preventDefault()
          setShortcutsOpen((v) => !v)
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
          setActiveTab(TAB_VALUES[num - 1])
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  return (
    <TooltipProvider delayDuration={300}>
    <div className="h-screen flex flex-col bg-background relative overflow-hidden">
      {currentTheme === 'christmas' && <SnowOverlay />}
      {/* Animated Background Elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-primary/5 rounded-full blur-3xl animate-pulse-slow animate-float"></div>
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-primary/3 rounded-full blur-3xl animate-pulse-slow animate-float-reverse" style={{ animationDelay: '1s' }}></div>
        <div className="absolute top-1/4 right-1/3 w-64 h-64 bg-accent/5 rounded-full blur-2xl animate-pulse-slow animate-float" style={{ animationDelay: '0.5s' }}></div>
        <div className="absolute bottom-1/3 left-1/3 w-48 h-48 bg-primary/3 rounded-full blur-2xl animate-pulse-slow animate-float-reverse" style={{ animationDelay: '1.5s' }}></div>
        <div className="absolute inset-0 bg-[linear-gradient(hsl(var(--primary)/0.03)_1px,transparent_1px),linear-gradient(90deg,hsl(var(--primary)/0.03)_1px,transparent_1px)] bg-[size:64px_64px] [mask-image:radial-gradient(ellipse_80%_50%_at_50%_50%,#000,transparent)]"></div>
      </div>

      {/* Custom Titlebar (Windows/Mac only) */}
      {showCustomTitlebar && (
        <TitleBar 
          connected={connected} 
          host={host} 
          port={port} 
          settingsOpen={settingsOpen}
          onSettingsOpenChange={setSettingsOpen}
          actionsMenu={
            <BottomMenu
              activeTab={activeTab}
              onSwitchTab={setActiveTab}
              onOpenProfiles={() => setProfilesOpen(true)}
              onOpenSaveCurrent={() => setSaveProfileOpen(true)}
              onOpenSettings={() => setSettingsOpen(true)}
              onOpenShortcuts={() => setShortcutsOpen(true)}
              inline
            />
          }
        />
      )}
      {/* Profile dialogs (triggered by BottomMenu) */}
      <ProfileManager 
        currentState={currentProfileState} 
        onLoadProfile={handleLoadProfile}
        externalOpen={profilesOpen}
        onExternalOpenChange={setProfilesOpen}
        externalSaveOpen={saveProfileOpen}
        onExternalSaveOpenChange={setSaveProfileOpen}
        dialogsOnly
      />

      <div className="flex flex-1 overflow-hidden relative z-10">
        
        {/* Main Content */}
        <main className="flex-1 container px-6 py-6 overflow-hidden">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full flex flex-col">
            <div className="flex flex-col md:flex-row items-center justify-center gap-4 mb-4">
              <ConnectionStatus
                emulator={emulator}
                host={host}
                setHost={setHost}
                connected={connected}
                setConnected={setConnected}
              />
              <TabNavBar value={activeTab} className="animate-scale-in" />
            </div>

            <div className="flex-1 min-h-0 overflow-hidden">
            <TabsContent value="fixed" className="h-full mt-0 p-6 bg-background/60 backdrop-blur-sm rounded-xl border border-border/50 animate-fade-in overflow-y-auto">
              <FixedTab 
                emulator={emulator} 
                host={host}
                setHost={setHost}
                port={port}
                setPort={setPort}
                alePort={alePort}
                setAlePort={setAlePort}
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
              />
            </TabsContent>

            <TabsContent value="handheld" className="h-full mt-0 p-6 bg-background/60 backdrop-blur-sm rounded-xl border border-border/50 animate-fade-in overflow-y-auto">
              <HandheldTab 
                slots={handheldSlots}
                setSlots={setHandheldSlots}
                delay={delay}
                setDelay={setDelay}
              />
            </TabsContent>

            <TabsContent value="ocr" className="h-full mt-0 p-6 bg-background/60 backdrop-blur-sm rounded-xl border border-border/50 animate-fade-in overflow-y-auto">
              <OCRTab 
                host={host} 
                connected={connected} 
                ocrClient={ocrClient}
                message={ocrMessage}
                setMessage={setOcrMessage}
              />
            </TabsContent>

            <TabsContent value="custom" className="h-full mt-0 p-6 bg-background/60 backdrop-blur-sm rounded-xl border border-border/50 animate-fade-in overflow-y-auto">
              <CustomTab 
                host={host} 
                message={customMessage}
                setMessage={setCustomMessage}
                port={customPort}
                setPort={setCustomPort}
              />
            </TabsContent>

            <TabsContent value="adam" className="h-full mt-0 p-6 bg-background/60 backdrop-blur-sm rounded-xl border border-border/50 animate-fade-in overflow-y-auto">
              <AdamTab 
                host={adamHost} 
                setHost={setAdamHost}
              />
            </TabsContent>

            <TabsContent value="api" className="h-full mt-0 p-6 bg-background/60 backdrop-blur-sm rounded-xl border border-border/50 animate-fade-in overflow-y-auto">
              <ApiTab base64Open={base64Open} onBase64OpenChange={setBase64Open} />
            </TabsContent>

            <TabsContent value="decoder" className="h-full mt-0 p-6 bg-background/60 backdrop-blur-sm rounded-xl border border-border/50 animate-fade-in overflow-y-auto">
              <DecoderTab />
            </TabsContent>

            <TabsContent value="automation" className="h-full mt-0 p-6 bg-background/60 backdrop-blur-sm rounded-xl border border-border/50 animate-fade-in overflow-hidden">
              <AutomationTab 
                emulator={emulator}
                handheldServer={handheldServer}
                ocrClient={ocrClient}
                host={host}
                alePort={alePort}
                delay={delay}
                sequences={automationSequences}
                setSequences={setAutomationSequences}
              />
            </TabsContent>

            <TabsContent value="generator" className="h-full mt-0 p-6 bg-background/60 backdrop-blur-sm rounded-xl border border-border/50 animate-fade-in overflow-y-auto">
              <BarcodeGenerator />
            </TabsContent>
          </div>
        </Tabs>
      </main>
      </div>
    </div>
    <KeyboardShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
    <CommandPalette
      open={paletteOpen}
      onOpenChange={setPaletteOpen}
      onSwitchTab={setActiveTab}
      connected={connected}
      onConnect={handlePaletteConnect}
      onDisconnect={handlePaletteDisconnect}
      onToggleTheme={toggleTheme}
      isDark={isDark}
      onOpenSettings={() => setSettingsOpen(true)}
      onOpenProfiles={() => setProfilesOpen(true)}
      onOpenBase64={handleOpenBase64}
      host={host}
    />
    <Toaster richColors position="bottom-right" />
    </TooltipProvider>
  )
}

export default App

