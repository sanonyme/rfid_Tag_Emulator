import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Terminal, Code2, QrCode, Settings, Sun, Moon, FolderOpen, Save } from 'lucide-react'

const MORE_ITEMS = [
  { id: 'custom', label: 'Custom TCP', icon: Terminal },
  { id: 'decoder', label: 'Decoder', icon: Code2 },
  { id: 'generator', label: 'Barcode', icon: QrCode },
] as const

interface MobileMoreMenuProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSelect: (tab: string) => void
  onSettings: () => void
  onProfiles: () => void
  onSaveProfile: () => void
  onToggleTheme: () => void
  isDark: boolean
}

export function MobileMoreMenu({
  open,
  onOpenChange,
  onSelect,
  onSettings,
  onProfiles,
  onSaveProfile,
  onToggleTheme,
  isDark,
}: MobileMoreMenuProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(100%,400px)] max-w-[calc(100vw-1.5rem)] rounded-[1.35rem] p-0 gap-0 border-0 bg-card shadow-2xl ring-1 ring-black/[0.06] dark:ring-white/[0.08] translate-y-[-56%]">
        <DialogHeader className="px-5 pt-5 pb-2 text-left border-b border-border/40">
          <DialogTitle className="text-xl font-semibold tracking-tight">More</DialogTitle>
          <p className="text-sm text-muted-foreground font-normal pt-1">Extra tools & app options</p>
        </DialogHeader>
        <div className="px-3 py-3 max-h-[min(70dvh,520px)] overflow-y-auto overscroll-contain">
          <p className="px-2 pt-1 pb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Tools</p>
          <div className="grid gap-1">
            {MORE_ITEMS.map((item) => {
              const Icon = item.icon
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    onSelect(item.id)
                    onOpenChange(false)
                  }}
                  className="flex items-center gap-3 w-full px-4 py-3.5 rounded-2xl bg-muted/40 hover:bg-muted active:bg-muted/80 transition-colors text-left min-h-[52px]"
                >
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-background shadow-sm ring-1 ring-border/50">
                    <Icon className="w-5 h-5 text-primary" />
                  </span>
                  <span className="font-semibold text-[15px]">{item.label}</span>
                </button>
              )
            })}
          </div>
          <p className="px-2 pt-4 pb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Profiles</p>
          <div className="grid gap-1">
            <button
              type="button"
              onClick={() => {
                onProfiles()
                onOpenChange(false)
              }}
              className="flex items-center gap-3 w-full px-4 py-3.5 rounded-2xl bg-muted/40 hover:bg-muted active:bg-muted/80 transition-colors text-left min-h-[52px]"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-background shadow-sm ring-1 ring-border/50">
                <FolderOpen className="w-5 h-5 text-primary" />
              </span>
              <span className="font-semibold text-[15px]">Load profile</span>
            </button>
            <button
              type="button"
              onClick={() => {
                onSaveProfile()
                onOpenChange(false)
              }}
              className="flex items-center gap-3 w-full px-4 py-3.5 rounded-2xl bg-muted/40 hover:bg-muted active:bg-muted/80 transition-colors text-left min-h-[52px]"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-background shadow-sm ring-1 ring-border/50">
                <Save className="w-5 h-5 text-primary" />
              </span>
              <span className="font-semibold text-[15px]">Save profile</span>
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2 pt-4 px-0 pb-safe">
            <button
              type="button"
              onClick={onToggleTheme}
              className="flex items-center justify-center gap-2 px-3 py-3.5 rounded-2xl bg-muted font-semibold text-sm min-h-[48px] active:scale-[0.98] transition-transform ring-1 ring-border/40"
            >
              {isDark ? <Sun className="w-5 h-5 text-amber-500" /> : <Moon className="w-5 h-5 text-slate-600" />}
              {isDark ? 'Light' : 'Dark'}
            </button>
            <button
              type="button"
              onClick={() => {
                onSettings()
                onOpenChange(false)
              }}
              className="flex items-center justify-center gap-2 px-3 py-3.5 rounded-2xl bg-primary text-primary-foreground font-semibold text-sm min-h-[48px] active:scale-[0.98] transition-transform shadow-md"
            >
              <Settings className="w-5 h-5" />
              Settings
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
