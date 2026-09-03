import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Terminal, Code2, QrCode, Braces, Settings, Sun, Moon, FolderOpen, Save } from 'lucide-react'

const MORE_ITEMS = [
  { id: 'custom', label: 'Custom', icon: Terminal },
  { id: 'decoder', label: 'Decoder', icon: Code2 },
  { id: 'jsonlint', label: 'JSON Lint', icon: Braces },
  { id: 'generator', label: 'Generator', icon: QrCode },
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
      <DialogContent className="max-w-[min(400px,90vw)] rounded-2xl p-0 gap-0 pb-safe">
        <DialogHeader className="px-4 pt-4 pb-2">
          <DialogTitle>More</DialogTitle>
        </DialogHeader>
        <div className="px-4 pb-6">
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
                  className="flex items-center gap-3 w-full px-4 py-3 rounded-xl hover:bg-muted active:bg-muted transition-colors text-left"
                >
                  <Icon className="w-5 h-5 text-muted-foreground" />
                  <span className="font-medium">{item.label}</span>
                </button>
              )
            })}
          </div>
          <div className="mt-4 pt-4 border-t border-border space-y-2">
            <button
              type="button"
              onClick={() => { onProfiles(); onOpenChange(false) }}
              className="flex items-center gap-3 w-full px-4 py-3 rounded-xl hover:bg-muted active:scale-[0.98] transition-all text-left"
            >
              <FolderOpen className="w-5 h-5 text-muted-foreground" />
              <span className="font-medium">Load Profile</span>
            </button>
            <button
              type="button"
              onClick={() => { onSaveProfile(); onOpenChange(false) }}
              className="flex items-center gap-3 w-full px-4 py-3 rounded-xl hover:bg-muted active:scale-[0.98] transition-all text-left"
            >
              <Save className="w-5 h-5 text-muted-foreground" />
              <span className="font-medium">Save Profile</span>
            </button>
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={onToggleTheme}
                className="flex items-center gap-3 flex-1 px-4 py-3 rounded-xl bg-muted hover:bg-muted/80 active:scale-[0.98] transition-all"
              >
                {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
                <span className="font-medium">{isDark ? 'Light' : 'Dark'}</span>
              </button>
              <button
                type="button"
                onClick={() => { onSettings(); onOpenChange(false) }}
                className="flex items-center gap-3 flex-1 px-4 py-3 rounded-xl bg-muted hover:bg-muted/80 active:scale-[0.98] transition-all"
              >
                <Settings className="w-5 h-5" />
                <span className="font-medium">Settings</span>
              </button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
