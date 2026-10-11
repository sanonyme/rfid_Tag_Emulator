import { useId } from 'react'
import { useSettings } from '@/lib/settings-context'
import type { LogTheme } from '@/lib/settings'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { Switch } from '@/components/ui/switch'

const THEMES: { id: LogTheme; color: string; title: string }[] = [
  { id: 'default', color: 'bg-blue-500', title: 'Original (Classic)' },
  { id: 'neon', color: 'bg-fuchsia-500', title: 'Neon' },
  { id: 'hacker', color: 'bg-green-500', title: 'Hacker' },
  { id: 'ocean', color: 'bg-sky-500', title: 'Ocean' },
]

export function LogThemeSelector() {
  const { settings, setSettings } = useSettings()
  const switchId = useId()

  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <Label
          htmlFor={switchId}
          className="cursor-pointer text-xs font-medium text-muted-foreground"
        >
          Log colors
        </Label>
        <Switch
          id={switchId}
          checked={settings.logColorsEnabled}
          onCheckedChange={(v) => setSettings({ logColorsEnabled: v })}
        />
      </div>
      {settings.logColorsEnabled && (
        <div className="flex flex-col gap-2 pt-2 border-t border-border/50">
          <Label className="text-xs text-muted-foreground">Color Theme</Label>
          <div className="flex items-center gap-3 py-1">
            {THEMES.map((t) => {
              const isActive = settings.logTheme === t.id
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setSettings({ logTheme: t.id })}
                  className={cn(
                    'h-6 w-6 rounded-full border-2 transition-all focus:outline-none cursor-pointer',
                    t.color,
                    isActive
                      ? 'border-background ring-2 ring-ring ring-offset-1'
                      : 'border-transparent hover:scale-110 shadow-sm opacity-80 hover:opacity-100',
                  )}
                  title={t.title}
                />
              )
            })}
          </div>
        </div>
      )}
    </>
  )
}
