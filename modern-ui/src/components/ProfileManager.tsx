import * as React from 'react'
import { Button } from './ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  // DialogTrigger,
  DialogFooter,
} from './ui/dialog'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { ScrollArea } from './ui/scroll-area'
import { Save, Trash2, Upload, Download, FolderOpen } from 'lucide-react'
import { toast } from 'sonner'
import type { HandheldSlot } from './HandheldTab'

export interface Profile {
  id: string
  name: string
  // Fixed Tab State
  host: string
  port: string
  driver: string
  uid: string
  antenna: string
  rssi: string
  startSerial: string
  fixedUpcList: string
  fixedEpcList: string
  // Handheld Tab State (multi-port slots)
  handheldSlots?: HandheldSlot[]
  hhUpcList?: string
  hhEpcList?: string
  // OCR Tab State
  ocrMessage: string
  // Custom Tab State
  customPort?: string
  customMessage?: string
  // ADAM Tab State
  adamHost?: string
  // Shared
  delay: string
  automationSteps?: any[]
}

interface ProfileManagerProps {
  currentState: Omit<Profile, 'id' | 'name'>
  onLoadProfile: (profile: Profile) => void
}

export function ProfileManager({ currentState, onLoadProfile }: ProfileManagerProps) {
  const [isOpen, setIsOpen] = React.useState(false)
  const [profiles, setProfiles] = React.useState<Profile[]>([])
  const [newProfileName, setNewProfileName] = React.useState('')
  const [showSaveDialog, setShowSaveDialog] = React.useState(false)

  // Load profiles from localStorage on mount
  React.useEffect(() => {
    const savedProfiles = localStorage.getItem('rfid-emulator-profiles')
    if (savedProfiles) {
      try {
        setProfiles(JSON.parse(savedProfiles))
      } catch (e) {
        console.error('Failed to parse profiles', e)
      }
    }
  }, [])

  const saveProfiles = (newProfiles: Profile[]) => {
    setProfiles(newProfiles)
    localStorage.setItem('rfid-emulator-profiles', JSON.stringify(newProfiles))
  }

  const handleSaveProfile = () => {
    if (!newProfileName.trim()) {
      toast.error('Please enter a profile name')
      return
    }

    const newProfile: Profile = {
      id: crypto.randomUUID(),
      name: newProfileName,
      ...currentState
    }

    saveProfiles([...profiles, newProfile])
    setNewProfileName('')
    setShowSaveDialog(false)
    toast.success('Profile saved successfully')
  }

  const handleDeleteProfile = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    const newProfiles = profiles.filter(p => p.id !== id)
    saveProfiles(newProfiles)
    toast.success('Profile deleted')
  }

  const handleLoad = (profile: Profile) => {
    onLoadProfile(profile)
    setIsOpen(false)
    toast.success(`Loaded profile: ${profile.name}`)
  }

  const handleExport = () => {
    const dataStr = JSON.stringify(profiles, null, 2)
    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr)
    const exportFileDefaultName = 'rfid-emulator-profiles.json'
    const linkElement = document.createElement('a')
    linkElement.setAttribute('href', dataUri)
    linkElement.setAttribute('download', exportFileDefaultName)
    linkElement.click()
  }

  const handleImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    const fileReader = new FileReader()
    fileReader.readAsText(file, "UTF-8")
    
    // Reset the input so the same file can be selected again if needed
    event.target.value = ''

      fileReader.onload = (e) => {
        try {
          if (e.target?.result) {
          const content = JSON.parse(e.target.result as string)
          
          let newProfiles: Profile[] = []
          
          // Handle both array of profiles and single profile object
          if (Array.isArray(content)) {
            newProfiles = content
          } else if (typeof content === 'object' && content !== null && content.id && content.name) {
            newProfiles = [content as Profile]
          }

            // Basic validation
          if (newProfiles.length > 0 && newProfiles.every(p => p.id && p.name)) {
              // Merge with existing profiles
            const merged = [...profiles, ...newProfiles]
              // Deduplicate by ID
              const unique = Array.from(new Map(merged.map(item => [item.id, item])).values())
              saveProfiles(unique)
            toast.success(`Imported ${newProfiles.length} profiles`)
            } else {
            console.error('Invalid profile format:', content)
              toast.error('Invalid profile file format')
            }
          }
        } catch (error) {
        console.error('Import failed:', error)
          toast.error('Failed to parse profile file')
      }
    }
  }

  return (
    <>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={() => setIsOpen(true)} className="gap-2">
          <FolderOpen className="w-4 h-4" />
          Profiles
        </Button>
        <Button variant="outline" size="sm" onClick={() => setShowSaveDialog(true)} className="gap-2">
          <Save className="w-4 h-4" />
          Save Current
        </Button>
      </div>

      {/* Profile List Dialog */}
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Manage Profiles</DialogTitle>
          </DialogHeader>
          
          <div className="flex justify-between mb-4">
             <div className="relative">
                <input
                  type="file"
                  accept=".json"
                  onChange={handleImport}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                />
                <Button variant="outline" size="sm" className="gap-2">
                  <Upload className="w-4 h-4" /> Import
                </Button>
             </div>
             <Button variant="outline" size="sm" onClick={handleExport} className="gap-2">
                <Download className="w-4 h-4" /> Export
             </Button>
          </div>

          <ScrollArea className="h-[300px] rounded-md border p-4">
            {profiles.length === 0 ? (
              <div className="text-center text-muted-foreground py-8">
                No profiles saved yet.
              </div>
            ) : (
              <div className="space-y-2">
                {profiles.map((profile) => (
                  <div
                    key={profile.id}
                    className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent/50 cursor-pointer transition-colors group"
                    onClick={() => handleLoad(profile)}
                  >
                    <span className="font-medium">{profile.name}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="opacity-0 group-hover:opacity-100 transition-opacity h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                      onClick={(e) => handleDeleteProfile(profile.id, e)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* Save Profile Dialog */}
      <Dialog open={showSaveDialog} onOpenChange={setShowSaveDialog}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Save Profile</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="name" className="text-right">
                Name
              </Label>
              <Input
                id="name"
                value={newProfileName}
                onChange={(e) => setNewProfileName(e.target.value)}
                placeholder="e.g. Warehouse Setup"
                className="col-span-3"
                autoFocus
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSaveDialog(false)}>Cancel</Button>
            <Button onClick={handleSaveProfile}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
