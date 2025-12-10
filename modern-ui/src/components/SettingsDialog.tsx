import { Settings, Palette } from 'lucide-react'
import { Button } from './ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from './ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select'
import { Label } from './ui/label'
import { themes, applyTheme, saveTheme, getSavedTheme } from '../lib/themes'
import { useState, useEffect } from 'react'

export function SettingsDialog() {
  const [currentTheme, setCurrentTheme] = useState(getSavedTheme())

  useEffect(() => {
    // Initial application of theme
    const isDark = document.documentElement.classList.contains('dark')
    applyTheme(currentTheme, isDark)
  }, [])

  const handleThemeChange = (value: string) => {
    setCurrentTheme(value)
    saveTheme(value)
    const isDark = document.documentElement.classList.contains('dark')
    applyTheme(value, isDark)
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="rounded-full">
          <Settings className="h-5 w-5" />
          <span className="sr-only">Settings</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>
            Customize the application appearance and behavior.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="theme" className="text-right">
              Theme
            </Label>
            <div className="col-span-3">
              <Select value={currentTheme} onValueChange={handleThemeChange}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select a theme" />
                </SelectTrigger>
                <SelectContent>
                  {themes.map((theme) => (
                    <SelectItem key={theme.name} value={theme.name}>
                      <div className="flex items-center gap-2">
                        <Palette className="w-4 h-4" />
                        {theme.label}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}



