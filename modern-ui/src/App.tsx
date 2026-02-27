import { useState } from 'react'
import * as React from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from './components/ui/tabs'
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
import { TCPEmulatorClient, HandheldServerClient, OCRClient } from './lib/tcp-client'
import { Radio, Smartphone, ScanLine, Code2, Workflow, QrCode, Terminal, Server, Globe } from 'lucide-react'
import { applyTheme, getSavedTheme, THEME_CHANGE_EVENT } from './lib/themes'
import { SnowOverlay } from './components/SnowOverlay'
import { ConnectionStatus } from './components/ConnectionStatus'

function App() {
  const [emulator] = useState(() => new TCPEmulatorClient())
  const [handheldServer] = useState(() => new HandheldServerClient(10472))
  const [ocrClient] = useState(() => new OCRClient())
  
  // Shared state across tabs (like Java EmulatorUI fields - lines 11-24)
  const [host, setHost] = useState('')
  const [connected, setConnected] = useState(false)
  const [delay, setDelay] = useState('100') // Shared delay like delaySpinner in Java

  // Fixed Tab persistent state
  const [port, setPort] = useState('12352')
  const [driver, setDriver] = useState('llrp')
  const [uid, setUid] = useState('0000')
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

  // Automation Tab persistent state
  const [automationSteps, setAutomationSteps] = useState<any[]>([])

  const [showCustomTitlebar, setShowCustomTitlebar] = React.useState(true)
  const [currentTheme, setCurrentTheme] = useState(getSavedTheme())

  const handleLoadProfile = (profile: Profile) => {
    setHost(profile.host)
    setPort(profile.port)
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
    if (profile.automationSteps) setAutomationSteps(profile.automationSteps)
  }

  const currentProfileState = {
    host,
    port,
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
    automationSteps
  }

  React.useEffect(() => {
    // Hide custom titlebar on Linux (uses native titlebar)
    if (window.electronAPI?.platform === 'linux') {
      setShowCustomTitlebar(false)
    }

    // Initialize theme colors
    const savedTheme = getSavedTheme()
    setCurrentTheme(savedTheme)
    const isDark = document.documentElement.classList.contains('dark') || 
                   window.matchMedia('(prefers-color-scheme: dark)').matches
    applyTheme(savedTheme, isDark)

    // Listen for theme changes
    const handleThemeChange = (e: Event) => {
      const customEvent = e as CustomEvent
      setCurrentTheme(customEvent.detail.theme)
    }

    window.addEventListener(THEME_CHANGE_EVENT, handleThemeChange)
    return () => window.removeEventListener(THEME_CHANGE_EVENT, handleThemeChange)
  }, [])

  return (
    <div className="h-screen flex flex-col bg-background relative overflow-hidden">
      {currentTheme === 'christmas' && <SnowOverlay />}
      {/* Animated Background Elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {/* Large floating orbs */}
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-primary/5 rounded-full blur-3xl animate-pulse-slow animate-float"></div>
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-purple-500/5 rounded-full blur-3xl animate-pulse-slow animate-float-reverse" style={{ animationDelay: '1s' }}></div>
        
        {/* Additional floating particles */}
        <div className="absolute top-1/4 right-1/3 w-64 h-64 bg-blue-400/5 rounded-full blur-2xl animate-pulse-slow animate-float" style={{ animationDelay: '0.5s' }}></div>
        <div className="absolute bottom-1/3 left-1/3 w-48 h-48 bg-pink-400/5 rounded-full blur-2xl animate-pulse-slow animate-float-reverse" style={{ animationDelay: '1.5s' }}></div>
        
        {/* Grid pattern overlay */}
        <div className="absolute inset-0 bg-[linear-gradient(rgba(59,130,246,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(59,130,246,0.03)_1px,transparent_1px)] bg-[size:64px_64px] [mask-image:radial-gradient(ellipse_80%_50%_at_50%_50%,#000,transparent)]"></div>
      </div>

      {/* Custom Titlebar (Windows/Mac only) */}
      {showCustomTitlebar && (
        <TitleBar 
          connected={connected} 
          host={host} 
          port={port} 
          profileManager={
            <ProfileManager 
              currentState={currentProfileState} 
              onLoadProfile={handleLoadProfile}
            />
          }
        />
      )}

      <div className="flex flex-1 overflow-hidden relative z-10">
        
        {/* Main Content */}
        <main className="flex-1 container px-6 py-6 overflow-hidden">
          <Tabs defaultValue="fixed" className="h-full flex flex-col">
            <div className="flex flex-col md:flex-row items-center justify-center gap-4 mb-4">
              <ConnectionStatus
                emulator={emulator}
                host={host}
                setHost={setHost}
                connected={connected}
                setConnected={setConnected}
              />
              <TabsList className="flex w-auto h-auto flex-wrap justify-center bg-background/60 backdrop-blur-sm border border-border/50 p-1 animate-scale-in">
                <TabsTrigger value="fixed" className="px-4 flex items-center justify-center gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                  <Radio className="w-4 h-4 shrink-0" />
                  <span className="font-medium whitespace-nowrap">Fixed</span>
                </TabsTrigger>
                <TabsTrigger value="handheld" className="px-4 flex items-center justify-center gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                  <Smartphone className="w-4 h-4 shrink-0" />
                  <span className="font-medium whitespace-nowrap">Handheld</span>
                </TabsTrigger>
                <TabsTrigger value="ocr" className="px-4 flex items-center justify-center gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                  <ScanLine className="w-4 h-4 shrink-0" />
                  <span className="font-medium whitespace-nowrap">OCR</span>
                </TabsTrigger>
                <TabsTrigger value="custom" className="px-4 flex items-center justify-center gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                  <Terminal className="w-4 h-4 shrink-0" />
                  <span className="font-medium whitespace-nowrap">Custom</span>
                </TabsTrigger>
                <TabsTrigger value="adam" className="px-4 flex items-center justify-center gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                  <Server className="w-4 h-4 shrink-0" />
                  <span className="font-medium whitespace-nowrap">ADAM</span>
                </TabsTrigger>
                <TabsTrigger value="api" className="px-4 flex items-center justify-center gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                  <Globe className="w-4 h-4 shrink-0" />
                  <span className="font-medium whitespace-nowrap">API</span>
                </TabsTrigger>
                <TabsTrigger value="decoder" className="px-4 flex items-center justify-center gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                  <Code2 className="w-4 h-4 shrink-0" />
                  <span className="font-medium whitespace-nowrap">Decoder</span>
                </TabsTrigger>
                <TabsTrigger value="automation" className="px-4 flex items-center justify-center gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                  <Workflow className="w-4 h-4 shrink-0" />
                  <span className="font-medium whitespace-nowrap">Auto</span>
                </TabsTrigger>
                <TabsTrigger value="generator" className="px-4 flex items-center justify-center gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                  <QrCode className="w-4 h-4 shrink-0" />
                  <span className="font-medium whitespace-nowrap">Gen</span>
                </TabsTrigger>
              </TabsList>
            </div>

            <div className="flex-1 min-h-0 overflow-auto">
            <TabsContent value="fixed" className="h-full mt-0 p-6 bg-background/60 backdrop-blur-sm rounded-xl border border-border/50 animate-fade-in">
              <FixedTab 
                emulator={emulator} 
                host={host}
                setHost={setHost}
                port={port}
                setPort={setPort}
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

            <TabsContent value="handheld" className="h-full mt-0 p-6 bg-background/60 backdrop-blur-sm rounded-xl border border-border/50 animate-fade-in">
              <HandheldTab 
                slots={handheldSlots}
                setSlots={setHandheldSlots}
                delay={delay}
                setDelay={setDelay}
              />
            </TabsContent>

            <TabsContent value="ocr" className="h-full mt-0 p-6 bg-background/60 backdrop-blur-sm rounded-xl border border-border/50 animate-fade-in">
              <OCRTab 
                host={host} 
                connected={connected} 
                ocrClient={ocrClient}
                message={ocrMessage}
                setMessage={setOcrMessage}
              />
            </TabsContent>

            <TabsContent value="custom" className="h-full mt-0 p-6 bg-background/60 backdrop-blur-sm rounded-xl border border-border/50 animate-fade-in">
              <CustomTab 
                host={host} 
                message={customMessage}
                setMessage={setCustomMessage}
                port={customPort}
                setPort={setCustomPort}
              />
            </TabsContent>

            <TabsContent value="adam" className="h-full mt-0 p-6 bg-background/60 backdrop-blur-sm rounded-xl border border-border/50 animate-fade-in">
              <AdamTab 
                host={adamHost} 
                setHost={setAdamHost}
              />
            </TabsContent>

            <TabsContent value="api" className="h-full mt-0 p-6 bg-background/60 backdrop-blur-sm rounded-xl border border-border/50 animate-fade-in">
              <ApiTab />
            </TabsContent>

            <TabsContent value="decoder" className="h-full mt-0 p-6 bg-background/60 backdrop-blur-sm rounded-xl border border-border/50 animate-fade-in">
              <DecoderTab />
            </TabsContent>

            <TabsContent value="automation" className="h-full mt-0 p-6 bg-background/60 backdrop-blur-sm rounded-xl border border-border/50 animate-fade-in">
              <AutomationTab 
                emulator={emulator}
                handheldServer={handheldServer}
                ocrClient={ocrClient}
                host={host}
                steps={automationSteps}
                setSteps={setAutomationSteps}
              />
            </TabsContent>

            <TabsContent value="generator" className="h-full mt-0 p-6 bg-background/60 backdrop-blur-sm rounded-xl border border-border/50 animate-fade-in">
              <BarcodeGenerator />
            </TabsContent>
          </div>
        </Tabs>
      </main>
      </div>

    </div>
  )
}

export default App

