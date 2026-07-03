import { useState, useCallback, useEffect } from 'react'
import { MobileFixedTab } from './components/mobile/MobileFixedTab'
import { MobileHandheldTab } from './components/mobile/MobileHandheldTab'
import { MobileOCRTab } from './components/mobile/MobileOCRTab'
import type { HandheldSlot } from './components/HandheldTab'
import { DecoderTab } from './components/DecoderTab'
import { CustomTab } from './components/CustomTab'
import { BarcodeGenerator } from './components/BarcodeGenerator'
import { ProfileManager, type Profile } from './components/ProfileManager'
import type { AutomationSequence } from './lib/automation-types'
import { migrateStepsToSequences } from './lib/automation-types'
import { TCPEmulatorClient } from './lib/tcp-client'
import { applyTheme, getSavedTheme, THEME_CHANGE_EVENT } from './lib/themes'
import { loadSettings } from './lib/settings'
import { useSettings } from './lib/settings-context'
import {
  useSettingsNavigationRequest,
  type SettingsHighlightTarget,
} from './lib/settings-navigation'
import { MobileHeader } from './components/mobile/MobileHeader'
import { MobileBottomNav } from './components/mobile/MobileBottomNav'
import { MobileMoreMenu } from './components/mobile/MobileMoreMenu'
import { MobileConnectionSheet } from './components/mobile/MobileConnectionSheet'
import { SettingsDialog } from './components/SettingsDialog'
import { TooltipProvider } from './components/ui/tooltip'
import { Toaster } from 'sonner'
import { TabSlideEnter } from './components/TabSlideEnter'

function AppMobile() {
  const { settings, setSettings } = useSettings()
  const [emulator] = useState(() => new TCPEmulatorClient())

  const [host, setHost] = useState('')
  const [connected, setConnected] = useState(false)
  const [delay, setDelay] = useState('20')
  const [handheldDelay, setHandheldDelay] = useState('20')

  const [port, setPort] = useState('12352')
  const [alePort, setAlePort] = useState('80')
  const [driver, setDriver] = useState('llrp')
  const [uid, setUid] = useState('')
  const [antenna, setAntenna] = useState('1')
  const [rssi, setRssi] = useState('-45.0')
  const [startSerial, setStartSerial] = useState('1')
  const [fixedUpcList, setFixedUpcList] = useState('00000000000001,5')
  const [fixedEpcList, setFixedEpcList] = useState('')

  const [handheldSlots, setHandheldSlots] = useState<HandheldSlot[]>([
    { id: crypto.randomUUID(), port: 10472, upcList: '00000000000001,5\n00000000000002,3', epcList: '', startSerial: '1' },
  ])

  const [ocrMessage, setOcrMessage] = useState('')
  const [customPort, setCustomPort] = useState('12345')
  const [customMessage, setCustomMessage] = useState('')

  const [automationSequences, setAutomationSequences] = useState<AutomationSequence[]>(() => [
    { id: crypto.randomUUID(), name: 'Sequence 1', order: 0, steps: [] },
  ])

  const [activeTab, setActiveTab] = useState<string>(() => {
    const { defaultTab } = loadSettings()
    const moreTabs = ['custom', 'decoder', 'generator']
    return moreTabs.includes(defaultTab) ? defaultTab : ['fixed', 'handheld', 'ocr'].includes(defaultTab) ? defaultTab : 'fixed'
  })
  const [connectionSheetOpen, setConnectionSheetOpen] = useState(false)
  const [moreMenuOpen, setMoreMenuOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsHighlight, setSettingsHighlight] = useState<SettingsHighlightTarget | null>(null)
  const [profilesOpen, setProfilesOpen] = useState(false)
  const [saveProfileOpen, setSaveProfileOpen] = useState(false)

  const isDark = typeof document !== 'undefined' && document.documentElement.classList.contains('dark')

  const toggleTheme = useCallback(() => {
    const newMode = document.documentElement.classList.contains('dark') ? 'light' : 'dark'
    localStorage.setItem('theme', newMode)
    document.documentElement.classList.toggle('dark', newMode === 'dark')
    applyTheme(getSavedTheme(), newMode === 'dark')
  }, [])

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
      setHandheldSlots([
        {
          id: crypto.randomUUID(),
          port: 10472,
          upcList: profile.hhUpcList || '',
          epcList: profile.hhEpcList || '',
          startSerial: '1',
        },
      ])
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
    automationSequences,
  }

  useEffect(() => {
    const savedTheme = getSavedTheme()
    const savedMode = localStorage.getItem('theme')
    const dark =
      savedMode === 'dark'
        ? true
        : savedMode === 'light'
          ? false
          : window.matchMedia('(prefers-color-scheme: dark)').matches
    document.documentElement.classList.toggle('dark', dark)
    applyTheme(savedTheme, dark)

    const handleThemeChange = () => {
      applyTheme(getSavedTheme(), document.documentElement.classList.contains('dark'))
    }
    window.addEventListener(THEME_CHANGE_EVENT, handleThemeChange)
    return () => window.removeEventListener(THEME_CHANGE_EVENT, handleThemeChange)
  }, [])

  const renderTabContent = () => {
    const contentClass =
      'p-4 pb-28 min-h-full bg-background/60 rounded-xl max-w-full overflow-x-hidden'
    switch (activeTab) {
      case 'fixed':
        return (
          <div className={contentClass}>
            <MobileFixedTab
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
            />
          </div>
        )
      case 'handheld':
        return (
          <div className={contentClass}>
            <MobileHandheldTab
              slots={handheldSlots}
              setSlots={setHandheldSlots}
              handheldDelay={handheldDelay}
              setHandheldDelay={setHandheldDelay}
              rssi={rssi}
            />
          </div>
        )
      case 'ocr':
        return (
          <div className={contentClass}>
            <MobileOCRTab
              host={host}
              connected={connected}
              message={ocrMessage}
              setMessage={setOcrMessage}
            />
          </div>
        )
      case 'custom':
        return (
          <div className={contentClass}>
            <CustomTab
              host={host}
              message={customMessage}
              setMessage={setCustomMessage}
              port={customPort}
              setPort={setCustomPort}
            />
          </div>
        )
      case 'decoder':
        return (
          <div className={contentClass}>
            <DecoderTab />
          </div>
        )
      case 'generator':
        return (
          <div className={contentClass}>
            <BarcodeGenerator />
          </div>
        )
      default:
        return (
          <div className={contentClass}>
            <MobileFixedTab
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
            />
          </div>
        )
    }
  }

  return (
    <TooltipProvider delayDuration={300}>
      <div className="min-h-screen min-h-[100dvh] bg-background flex flex-col safe-area-padding">
        <MobileHeader
          connected={connected}
          onConnectionPress={() => setConnectionSheetOpen(true)}
          onMenuPress={() => setMoreMenuOpen(true)}
        />

        <main className="flex-1 overflow-y-auto overflow-x-hidden">
          <TabSlideEnter active tabId={activeTab}>
            {renderTabContent()}
          </TabSlideEnter>
        </main>

        <MobileBottomNav
          activeTab={activeTab}
          onTabChange={(tab) => setActiveTab(tab)}
          onMorePress={() => setMoreMenuOpen(true)}
        />

        <MobileConnectionSheet
          open={connectionSheetOpen}
          onOpenChange={setConnectionSheetOpen}
          emulator={emulator}
          host={host}
          setHost={setHost}
          alePort={alePort}
          setAlePort={setAlePort}
          connected={connected}
          setConnected={setConnected}
        />

        <MobileMoreMenu
          open={moreMenuOpen}
          onOpenChange={setMoreMenuOpen}
          onSelect={(tab) => setActiveTab(tab)}
          onSettings={() => handleOpenSettings()}
          onProfiles={() => setProfilesOpen(true)}
          onSaveProfile={() => setSaveProfileOpen(true)}
          onToggleTheme={toggleTheme}
          isDark={isDark}
        />

        <ProfileManager
          currentState={currentProfileState}
          onLoadProfile={handleLoadProfile}
          externalOpen={profilesOpen}
          onExternalOpenChange={setProfilesOpen}
          externalSaveOpen={saveProfileOpen}
          onExternalSaveOpenChange={setSaveProfileOpen}
          dialogsOnly
        />

        <SettingsDialog
          open={settingsOpen}
          onOpenChange={handleSettingsOpenChange}
          highlight={settingsHighlight}
          onHighlightClear={() => setSettingsHighlight(null)}
          noTrigger
        />
      </div>
      <Toaster richColors position="bottom-center" />
    </TooltipProvider>
  )
}

export default AppMobile
