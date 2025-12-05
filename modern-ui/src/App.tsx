import { useState } from 'react'
import * as React from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from './components/ui/tabs'
import { FixedTab } from './components/FixedTab'
import { HandheldTab } from './components/HandheldTab'
import { OCRTab } from './components/OCRTab'
import { DecoderTab } from './components/DecoderTab'
import { TitleBar } from './components/TitleBar'
import { ProfileManager, type Profile } from './components/ProfileManager'
import { TCPEmulatorClient, HandheldServerClient, OCRClient } from './lib/tcp-client'
import { Radio, Smartphone, ScanLine, Code2 } from 'lucide-react'

function App() {
  const [emulator] = useState(() => new TCPEmulatorClient())
  const [handheldServer] = useState(() => new HandheldServerClient())
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

  // Handheld Tab persistent state
  const [deviceId, setDeviceId] = useState('')
  const [hhUpcList, setHhUpcList] = useState('00000000000001,5\n00000000000002,3')
  const [hhEpcList, setHhEpcList] = useState('')

  // OCR Tab persistent state
  const [ocrMessage, setOcrMessage] = useState('')

  const [showCustomTitlebar, setShowCustomTitlebar] = React.useState(true)

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
    setDeviceId(profile.deviceId)
    setHhUpcList(profile.hhUpcList)
    setHhEpcList(profile.hhEpcList)
    setOcrMessage(profile.ocrMessage)
    setDelay(profile.delay)
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
    deviceId,
    hhUpcList,
    hhEpcList,
    ocrMessage,
    delay
  }

  React.useEffect(() => {
    // Hide custom titlebar on Linux (uses native titlebar)
    if (window.electronAPI?.platform === 'linux') {
      setShowCustomTitlebar(false)
    }
  }, [])

  return (
    <div className="h-screen flex flex-col bg-background relative overflow-hidden">
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

      {/* Main Content */}
      <main className="flex-1 container px-6 py-6 overflow-hidden relative z-10">
        <Tabs defaultValue="fixed" className="h-full flex flex-col">
          <TabsList className="grid w-full max-w-2xl mx-auto grid-cols-4 mb-4 bg-background/60 backdrop-blur-sm border border-border/50 p-1 animate-scale-in">
            <TabsTrigger value="fixed" className="flex items-center gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Radio className="w-4 h-4" />
              <span className="font-medium">Fixed Reader</span>
            </TabsTrigger>
            <TabsTrigger value="handheld" className="flex items-center gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Smartphone className="w-4 h-4" />
              <span className="font-medium">Handheld</span>
            </TabsTrigger>
            <TabsTrigger value="ocr" className="flex items-center gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <ScanLine className="w-4 h-4" />
              <span className="font-medium">OCR</span>
            </TabsTrigger>
            <TabsTrigger value="decoder" className="flex items-center gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Code2 className="w-4 h-4" />
              <span className="font-medium">Decoder</span>
            </TabsTrigger>
          </TabsList>

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
                handheldServer={handheldServer} 
                deviceId={deviceId}
                setDeviceId={setDeviceId}
                upcList={hhUpcList}
                setUpcList={setHhUpcList}
                epcList={hhEpcList}
                setEpcList={setHhEpcList}
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

            <TabsContent value="decoder" className="h-full mt-0 p-6 bg-background/60 backdrop-blur-sm rounded-xl border border-border/50 animate-fade-in">
              <DecoderTab />
            </TabsContent>
          </div>
        </Tabs>
      </main>

    </div>
  )
}

export default App

