import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { Bookmark, Save, Trash2, Pencil, Check, X, PlusSquare, Download, Upload } from 'lucide-react'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { ScrollArea } from './ui/scroll-area'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import {
  type TagPreset,
  type TagPresetKind,
  createTagPreset,
  deleteTagPreset,
  downloadTagPresets,
  getTagPresets,
  importTagPresets,
  readTagPresetsFile,
  subscribeTagPresets,
  updateTagPreset,
} from '@/lib/tag-presets'

interface TagPresetMenuProps {
  kind: TagPresetKind
  /** Current textarea content; used as the default body when saving a new preset. */
  currentValue: string
  /** Called when the user picks a preset to load. */
  onLoad: (content: string, mode: 'replace' | 'append') => void
  /** Visual style — `compact` matches the small icon-only ghost buttons in Handheld slot tabs. */
  variant?: 'default' | 'compact'
  /** Optional label override for the trigger button (default: "Presets"). */
  label?: string
}

/**
 * Imperative handle returned via `ref`. Lets callers open the dialog from
 * keyboard shortcuts (Ctrl+L, Ctrl+S) without re-implementing the dialog state.
 */
export interface TagPresetMenuHandle {
  /** Open in the default "browse list" mode. */
  open: () => void
  /** Open and focus the "save current as preset" input. */
  openSave: () => void
}

const KIND_TITLE: Record<TagPresetKind, string> = {
  upc: 'UPC presets',
  epc: 'EPC presets',
}

const KIND_HINT: Record<TagPresetKind, string> = {
  upc: 'Saved UPC,Count,TID snippets. Available on both Fixed and Handheld tabs.',
  epc: 'Saved EPC[,TID] snippets. Available on both Fixed and Handheld tabs.',
}

function formatPreview(content: string): string {
  const trimmed = content.trim()
  if (!trimmed) return '(empty)'
  const first = trimmed.split('\n')[0]
  const lineCount = trimmed.split('\n').filter((l) => l.trim()).length
  const preview = first.length > 48 ? first.slice(0, 45) + '…' : first
  return `${preview} — ${lineCount} line${lineCount === 1 ? '' : 's'}`
}

export const TagPresetMenu = forwardRef<TagPresetMenuHandle, TagPresetMenuProps>(function TagPresetMenu(
  { kind, currentValue, onLoad, variant = 'default', label = 'Presets' },
  ref,
) {
  const [open, setOpen] = useState(false)
  const [presets, setPresets] = useState<TagPreset[]>(() => getTagPresets(kind))
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [newName, setNewName] = useState('')
  const importInputRef = useRef<HTMLInputElement>(null)
  const saveInputRef = useRef<HTMLInputElement>(null)
  const focusSaveOnOpenRef = useRef(false)

  const presetCount = useMemo(() => presets.length, [presets])

  useImperativeHandle(
    ref,
    () => ({
      open: () => {
        focusSaveOnOpenRef.current = false
        setOpen(true)
      },
      openSave: () => {
        focusSaveOnOpenRef.current = true
        setOpen(true)
      },
    }),
    [],
  )

  useEffect(() => {
    if (!open || !focusSaveOnOpenRef.current) return
    // Wait one tick so the Dialog has mounted before stealing focus.
    const id = window.setTimeout(() => {
      saveInputRef.current?.focus()
      saveInputRef.current?.select()
      focusSaveOnOpenRef.current = false
    }, 50)
    return () => window.clearTimeout(id)
  }, [open])

  useEffect(() => {
    if (!open) return
    setPresets(getTagPresets(kind))
    return subscribeTagPresets(() => setPresets(getTagPresets(kind)))
  }, [open, kind])

  // Keep the badge count up to date even when the dialog is closed.
  useEffect(() => {
    return subscribeTagPresets(() => setPresets(getTagPresets(kind)))
  }, [kind])

  const handleSaveNew = () => {
    const name = newName.trim()
    if (!name) {
      toast.error('Give the preset a name first')
      return
    }
    if (!currentValue.trim()) {
      toast.error('Nothing to save — the list is empty')
      return
    }
    createTagPreset({ name, kind, content: currentValue })
    setNewName('')
    toast.success(`Saved "${name}"`)
  }

  const handleLoad = (preset: TagPreset, mode: 'replace' | 'append') => {
    onLoad(preset.content, mode)
    setOpen(false)
    toast.success(`${mode === 'replace' ? 'Loaded' : 'Appended'} "${preset.name}"`)
  }

  const handleDelete = (preset: TagPreset) => {
    deleteTagPreset(preset.id)
    toast.success(`Deleted "${preset.name}"`)
  }

  const startRename = (preset: TagPreset) => {
    setRenamingId(preset.id)
    setRenameValue(preset.name)
  }

  const commitRename = (preset: TagPreset) => {
    const name = renameValue.trim()
    if (!name) {
      toast.error('Name cannot be empty')
      return
    }
    if (name !== preset.name) {
      updateTagPreset(preset.id, { name })
    }
    setRenamingId(null)
  }

  const handleOverwrite = (preset: TagPreset) => {
    if (!currentValue.trim()) {
      toast.error('Nothing to save — the list is empty')
      return
    }
    updateTagPreset(preset.id, { content: currentValue })
    toast.success(`Updated "${preset.name}" with current list`)
  }

  const handleExportOne = (preset: TagPreset) => {
    downloadTagPresets([preset])
    toast.success(`Exported "${preset.name}"`)
  }

  const handleExportAll = () => {
    if (presets.length === 0) {
      toast.error('No presets to export')
      return
    }
    downloadTagPresets(presets)
    toast.success(`Exported ${presets.length} preset${presets.length === 1 ? '' : 's'}`)
  }

  const handleImportClick = () => importInputRef.current?.click()

  const handleImportFile: React.ChangeEventHandler<HTMLInputElement> = (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const items = readTagPresetsFile(reader.result as string)
        // The menu is kind-scoped; filter so a UPC menu only imports UPC items.
        const matching = items.filter((it) => it.kind === kind)
        const skipped = items.length - matching.length
        if (matching.length === 0) {
          toast.error(`No ${kind.toUpperCase()} presets in that file`)
          return
        }
        const { imported } = importTagPresets(matching)
        toast.success(
          skipped > 0
            ? `Imported ${imported.length} preset${imported.length === 1 ? '' : 's'} (skipped ${skipped} of other kind)`
            : `Imported ${imported.length} preset${imported.length === 1 ? '' : 's'}`,
        )
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Could not read preset file'
        toast.error(msg)
      }
    }
    reader.onerror = () => toast.error('Could not read file')
    reader.readAsText(file)
  }

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className={cn(
          'gap-1 rounded-md text-xs',
          variant === 'compact' ? 'h-7 px-2' : 'h-7 px-2',
        )}
        onClick={() => setOpen(true)}
        title={`Saved ${kind.toUpperCase()} presets`}
      >
        <Bookmark className="h-3.5 w-3.5" />
        {variant !== 'compact' && <span>{label}</span>}
        {presetCount > 0 && (
          <span className="ml-0.5 rounded bg-muted px-1 text-[10px] font-mono leading-4 text-muted-foreground">
            {presetCount}
          </span>
        )}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>{KIND_TITLE[kind]}</DialogTitle>
            <DialogDescription>{KIND_HINT[kind]}</DialogDescription>
          </DialogHeader>

          <ScrollArea className="h-[280px] rounded-md border bg-muted/10">
            {presets.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">
                No presets yet. Save your current list below.
              </div>
            ) : (
              <ul className="divide-y divide-border/40">
                {presets.map((preset) => (
                  <li key={preset.id} className="px-3 py-2.5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        {renamingId === preset.id ? (
                          <div className="flex items-center gap-1.5">
                            <Input
                              value={renameValue}
                              onChange={(e) => setRenameValue(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') commitRename(preset)
                                if (e.key === 'Escape') setRenamingId(null)
                              }}
                              autoFocus
                              className="h-7 text-xs"
                            />
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => commitRename(preset)}
                              title="Save name"
                            >
                              <Check className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => setRenamingId(null)}
                              title="Cancel rename"
                            >
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleLoad(preset, 'replace')}
                            className="block w-full truncate text-left text-sm font-medium hover:text-primary"
                            title="Load (replace current list)"
                          >
                            {preset.name}
                          </button>
                        )}
                        <div className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">
                          {formatPreview(preset.content)}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-0.5">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 rounded-md px-2 text-[11px]"
                          onClick={() => handleLoad(preset, 'append')}
                          title="Append to current list"
                        >
                          Append
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => handleOverwrite(preset)}
                          title="Overwrite with current list"
                        >
                          <Save className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => handleExportOne(preset)}
                          title="Export this preset as JSON"
                        >
                          <Download className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => startRename(preset)}
                          title="Rename preset"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive hover:bg-destructive/10 hover:text-destructive"
                          onClick={() => handleDelete(preset)}
                          title="Delete preset"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </ScrollArea>

          <div className="space-y-2 rounded-md border border-border/40 bg-muted/10 p-3">
            <Label htmlFor={`new-preset-${kind}`} className="text-xs font-medium">
              Save current list as preset
            </Label>
            <div className="flex items-center gap-2">
              <Input
                id={`new-preset-${kind}`}
                ref={saveInputRef}
                placeholder={kind === 'upc' ? 'e.g. ALO' : 'e.g. Demo EPCs'}
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSaveNew()
                }}
                className="h-9 flex-1 text-sm"
              />
              <Button
                size="sm"
                onClick={handleSaveNew}
                disabled={!newName.trim() || !currentValue.trim()}
                className="h-9 shrink-0 gap-1.5"
              >
                <PlusSquare className="h-3.5 w-3.5" />
                Save
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Click a preset name to load (replace). Use the buttons on the right to append, overwrite,
              rename, or delete.
            </p>
          </div>

          <DialogFooter className="sm:justify-between">
            <div className="flex gap-2">
              <input
                ref={importInputRef}
                type="file"
                accept=".json,application/json"
                onChange={handleImportFile}
                className="hidden"
              />
              <Button variant="outline" size="sm" onClick={handleImportClick} className="gap-1.5">
                <Upload className="h-3.5 w-3.5" /> Import file
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleExportAll}
                disabled={presets.length === 0}
                className="gap-1.5"
              >
                <Download className="h-3.5 w-3.5" /> Export all
              </Button>
            </div>
            <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
})
