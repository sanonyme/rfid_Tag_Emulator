import { useState, useMemo, useRef, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '../ui/dialog'
import { Button } from '../ui/button'
import { Badge } from '../ui/badge'
import {
  GitCompare,
  Columns,
  AlignJustify,
  ArrowLeftRight,
  FolderOpen,
  AlertCircle,
  FileText,
  UploadCloud,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

interface DiffLine {
  type: 'equal' | 'add' | 'delete' | 'modify'
  lineNumA?: number
  lineNumB?: number
  textA?: string
  textB?: string
}

function computeDiff(textA: string, textB: string): { lines: DiffLine[]; adds: number; deletes: number } {
  const linesA = textA.split(/\r?\n/)
  const linesB = textB.split(/\r?\n/)

  const result: DiffLine[] = []
  let i = 0
  let j = 0
  let adds = 0
  let deletes = 0

  while (i < linesA.length || j < linesB.length) {
    if (i < linesA.length && j < linesB.length) {
      if (linesA[i] === linesB[j]) {
        result.push({
          type: 'equal',
          lineNumA: i + 1,
          lineNumB: j + 1,
          textA: linesA[i],
          textB: linesB[j],
        })
        i++
        j++
      } else {
        // Check if next lines match (simple single-step lookahead)
        if (i + 1 < linesA.length && linesA[i + 1] === linesB[j]) {
          result.push({
            type: 'delete',
            lineNumA: i + 1,
            textA: linesA[i],
          })
          deletes++
          i++
        } else if (j + 1 < linesB.length && linesA[i] === linesB[j + 1]) {
          result.push({
            type: 'add',
            lineNumB: j + 1,
            textB: linesB[j],
          })
          adds++
          j++
        } else {
          // Line was modified
          result.push({
            type: 'modify',
            lineNumA: i + 1,
            lineNumB: j + 1,
            textA: linesA[i],
            textB: linesB[j],
          })
          adds++
          deletes++
          i++
          j++
        }
      }
    } else if (i < linesA.length) {
      result.push({
        type: 'delete',
        lineNumA: i + 1,
        textA: linesA[i],
      })
      deletes++
      i++
    } else {
      result.push({
        type: 'add',
        lineNumB: j + 1,
        textB: linesB[j],
      })
      adds++
      j++
    }
  }

  return { lines: result, adds, deletes }
}

export interface LocalCandidateFile {
  name: string
  path: string
  type: 'file' | 'folder'
}

interface SftpFileDiffDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  nameA: string
  contentA: string
  nameB: string
  contentB: string
  localFilePath?: string
  expectedLocalName?: string
  localRows?: LocalCandidateFile[]
  onLocalFileLoaded?: (name: string, content: string, path?: string) => void
}

export function SftpFileDiffDialog({
  open,
  onOpenChange,
  nameA,
  contentA,
  nameB,
  contentB,
  localFilePath,
  expectedLocalName,
  localRows,
  onLocalFileLoaded,
}: SftpFileDiffDialogProps) {
  const [layout, setLayout] = useState<'split' | 'unified'>('split')
  const [activeContentA, setActiveContentA] = useState(contentA)
  const [activeNameA, setActiveNameA] = useState(nameA)
  const [activeContentB, setActiveContentB] = useState(contentB)
  const [activeNameB, setActiveNameB] = useState(nameB)
  const [isDragOver, setIsDragOver] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)

  // Synchronize when incoming props change or dialog reopens
  useEffect(() => {
    if (open) {
      setActiveContentA(contentA)
      setActiveNameA(nameA)
      setActiveContentB(contentB)
      setActiveNameB(nameB)
      setIsDragOver(false)
    }
  }, [open, contentA, nameA, contentB, nameB])

  const { lines, adds, deletes } = useMemo(() => {
    return computeDiff(activeContentA, activeContentB)
  }, [activeContentA, activeContentB])

  const handleBrowseLocal = async () => {
    try {
      if (window.electronAPI?.localPickFile) {
        const res = await window.electronAPI.localPickFile({
          title: 'Select Local File to Compare',
          defaultPath: localFilePath,
        })
        if (res.ok && res.path) {
          const readRes = await window.electronAPI.localReadFile?.(res.path)
          if (readRes?.ok && readRes.content !== undefined) {
            const fname = res.path.split(/[/\\]/).pop() || 'local_file'
            const newName = `Local (${fname})`
            setActiveNameB(newName)
            setActiveContentB(readRes.content)
            onLocalFileLoaded?.(fname, readRes.content, res.path)
            toast.success(`Loaded local file: ${fname}`)
            return
          } else {
            toast.error(readRes?.error || 'Failed to read local file')
          }
        }
        return
      }
    } catch (e: any) {
      console.warn('Electron pick file failed, using fallback', e)
    }

    // Fallback: browser file input
    fileInputRef.current?.click()
  }

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const text = typeof reader.result === 'string' ? reader.result : ''
      const newName = `Local (${file.name})`
      setActiveNameB(newName)
      setActiveContentB(text)
      onLocalFileLoaded?.(file.name, text)
      toast.success(`Loaded local file: ${file.name}`)
    }
    reader.onerror = () => toast.error('Failed to read file')
    reader.readAsText(file)
    e.target.value = ''
  }

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (!file) return

    const electronPath = (file as any).path
    if (electronPath && window.electronAPI?.localReadFile) {
      const r = await window.electronAPI.localReadFile(electronPath)
      if (r.ok && r.content !== undefined) {
        const fname = file.name
        const newName = `Local (${fname})`
        setActiveNameB(newName)
        setActiveContentB(r.content)
        onLocalFileLoaded?.(fname, r.content, electronPath)
        toast.success(`Loaded dropped file: ${fname}`)
        return
      }
    }

    const reader = new FileReader()
    reader.onload = () => {
      const text = typeof reader.result === 'string' ? reader.result : ''
      const newName = `Local (${file.name})`
      setActiveNameB(newName)
      setActiveContentB(text)
      onLocalFileLoaded?.(file.name, text)
      toast.success(`Loaded dropped file: ${file.name}`)
    }
    reader.readAsText(file)
  }

  const handleSwap = () => {
    setActiveContentA(activeContentB)
    setActiveNameA(activeNameB)
    setActiveContentB(activeContentA)
    setActiveNameB(activeNameA)
  }

  const handleSelectFromLocalRows = async (path: string) => {
    if (!window.electronAPI?.localReadFile) return
    const loc = await window.electronAPI.localReadFile(path)
    if (loc.ok && loc.content !== undefined) {
      const fname = path.split(/[/\\]/).pop() || 'local_file'
      const newName = `Local (${fname})`
      setActiveNameB(newName)
      setActiveContentB(loc.content)
      onLocalFileLoaded?.(fname, loc.content, path)
      toast.success(`Loaded local file: ${fname}`)
    } else {
      toast.error(loc.error || 'Failed to read local file')
    }
  }

  const availableLocalFiles = useMemo(() => {
    return (localRows ?? []).filter((r) => r.type === 'file')
  }, [localRows])

  const hasEmptyLocalContent = !activeContentB.trim() && !!activeContentA.trim()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-5xl max-h-[85vh] flex flex-col p-0 gap-0 overflow-hidden bg-background"
        onDragOver={(e) => {
          e.preventDefault()
          setIsDragOver(true)
        }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={handleDrop}
      >
        {/* Hidden file input for universal fallback */}
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={handleFileInputChange}
        />

        <DialogHeader className="p-4 border-b border-border/50 shrink-0">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <GitCompare className="w-5 h-5 text-primary shrink-0" />
              <div>
                <DialogTitle className="text-base font-semibold">Compare Files</DialogTitle>
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground font-mono mt-0.5">
                  <span className="text-destructive font-medium truncate max-w-[200px]" title={activeNameA}>
                    {activeNameA}
                  </span>
                  <button
                    type="button"
                    onClick={handleSwap}
                    className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                    title="Swap sides"
                  >
                    <ArrowLeftRight className="w-3.5 h-3.5" />
                  </button>
                  <span className="text-emerald-500 font-medium truncate max-w-[200px]" title={activeNameB}>
                    {activeNameB}
                  </span>

                  {/* Change / Select Local File Button */}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-6 px-2 text-[11px] gap-1 ml-1 text-foreground/80 hover:text-foreground bg-background border-border/70"
                    onClick={handleBrowseLocal}
                    title="Choose a different local file to compare"
                  >
                    <FolderOpen className="w-3 h-3 text-primary" />
                    Choose Local File...
                  </Button>

                  {/* Quick file switcher if local directory has files */}
                  {availableLocalFiles.length > 1 && (
                    <select
                      className="h-6 rounded border border-border/70 bg-background px-1.5 text-[11px] text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                      value=""
                      onChange={(e) => {
                        if (e.target.value) void handleSelectFromLocalRows(e.target.value)
                      }}
                      title="Quick-switch local file from active folder"
                    >
                      <option value="" disabled>
                        Switch local file… ({availableLocalFiles.length})
                      </option>
                      {availableLocalFiles.map((f) => (
                        <option key={f.path} value={f.path}>
                          {f.name}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <Badge variant="outline" className="text-xs gap-1 font-mono text-emerald-500 border-emerald-500/30 bg-emerald-500/10">
                +{adds} added
              </Badge>
              <Badge variant="outline" className="text-xs gap-1 font-mono text-destructive border-destructive/30 bg-destructive/10">
                -{deletes} removed
              </Badge>
              <div className="h-4 w-px bg-border mx-1" />
              <div className="flex items-center bg-muted/40 p-0.5 rounded-lg border border-border/50">
                <Button
                  variant={layout === 'split' ? 'secondary' : 'ghost'}
                  size="sm"
                  className="h-7 px-2 text-xs gap-1"
                  onClick={() => setLayout('split')}
                >
                  <Columns className="w-3.5 h-3.5" />
                  Split
                </Button>
                <Button
                  variant={layout === 'unified' ? 'secondary' : 'ghost'}
                  size="sm"
                  className="h-7 px-2 text-xs gap-1"
                  onClick={() => setLayout('unified')}
                >
                  <AlignJustify className="w-3.5 h-3.5" />
                  Unified
                </Button>
              </div>
            </div>
          </div>
        </DialogHeader>

        {/* Empty Local File Banner */}
        {hasEmptyLocalContent && (
          <div className="bg-amber-500/10 border-b border-amber-500/25 px-4 py-2.5 flex items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2 text-amber-500">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>
                No local file loaded yet for <strong>{expectedLocalName || activeNameB}</strong>. Select a local file or drop one here to compare.
              </span>
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 text-xs gap-1.5 border-amber-500/40 hover:bg-amber-500/10 text-amber-500 bg-background shrink-0"
              onClick={handleBrowseLocal}
            >
              <FolderOpen className="w-3.5 h-3.5" />
              Select Local File
            </Button>
          </div>
        )}

        {/* Drag & Drop Overlay */}
        {isDragOver && (
          <div className="absolute inset-0 z-50 bg-background/90 backdrop-blur-sm border-2 border-dashed border-primary flex flex-col items-center justify-center gap-2 pointer-events-none">
            <UploadCloud className="w-12 h-12 text-primary animate-bounce" />
            <div className="text-base font-semibold">Drop file to compare</div>
            <div className="text-xs text-muted-foreground">The dropped file will be loaded into the diff comparison immediately</div>
          </div>
        )}

        {/* Diff View Area */}
        <div className="flex-1 min-h-[400px] max-h-[60vh] overflow-auto p-2 bg-muted/10 font-mono text-xs select-text">
          {lines.length === 0 ? (
            <div className="py-16 text-center text-muted-foreground text-sm">
              Files are completely identical
            </div>
          ) : layout === 'split' ? (
            <div className="flex flex-col divide-y divide-border/30">
              {/* Header row */}
              <div className="grid grid-cols-2 bg-muted/40 py-1.5 px-2 font-semibold text-[11px] border-b border-border/60">
                <div className="truncate text-destructive">{activeNameA}</div>
                <div className="truncate text-emerald-500 flex items-center justify-between">
                  <span>{activeNameB}</span>
                  {hasEmptyLocalContent && (
                    <span className="text-[10px] text-amber-500 font-normal">(not loaded)</span>
                  )}
                </div>
              </div>

              {lines.map((l, idx) => (
                <div key={idx} className="grid grid-cols-2 divide-x divide-border/40">
                  {/* Left Column (A) */}
                  <div
                    className={cn(
                      'flex items-start gap-2 py-0.5 px-2 min-h-[22px]',
                      l.type === 'delete' && 'bg-destructive/15 text-destructive',
                      l.type === 'modify' && 'bg-amber-500/15 text-amber-500',
                    )}
                  >
                    <span className="w-7 text-right select-none opacity-40 shrink-0 text-[10px]">
                      {l.lineNumA ?? ''}
                    </span>
                    <span className="whitespace-pre-wrap break-all flex-1">
                      {l.textA !== undefined ? l.textA : ''}
                    </span>
                  </div>

                  {/* Right Column (B) */}
                  <div
                    className={cn(
                      'flex items-start gap-2 py-0.5 px-2 min-h-[22px]',
                      l.type === 'add' && 'bg-emerald-500/15 text-emerald-500',
                      l.type === 'modify' && 'bg-amber-500/15 text-amber-500',
                    )}
                  >
                    <span className="w-7 text-right select-none opacity-40 shrink-0 text-[10px]">
                      {l.lineNumB ?? ''}
                    </span>
                    <span className="whitespace-pre-wrap break-all flex-1">
                      {l.textB !== undefined ? l.textB : ''}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col">
              {lines.map((l, idx) => (
                <div key={idx} className="flex flex-col">
                  {l.type === 'equal' && (
                    <div className="flex items-start gap-2 py-0.5 px-2 hover:bg-muted/20">
                      <span className="w-7 text-right select-none opacity-40 shrink-0 text-[10px]">{l.lineNumA}</span>
                      <span className="w-7 text-right select-none opacity-40 shrink-0 text-[10px]">{l.lineNumB}</span>
                      <span className="w-4 select-none opacity-30 shrink-0"> </span>
                      <span className="whitespace-pre-wrap break-all flex-1">{l.textA}</span>
                    </div>
                  )}
                  {(l.type === 'delete' || l.type === 'modify') && l.textA !== undefined && (
                    <div className="flex items-start gap-2 py-0.5 px-2 bg-destructive/15 text-destructive">
                      <span className="w-7 text-right select-none opacity-40 shrink-0 text-[10px]">{l.lineNumA}</span>
                      <span className="w-7 text-right select-none opacity-40 shrink-0 text-[10px]"> </span>
                      <span className="w-4 select-none font-bold shrink-0">-</span>
                      <span className="whitespace-pre-wrap break-all flex-1">{l.textA}</span>
                    </div>
                  )}
                  {(l.type === 'add' || l.type === 'modify') && l.textB !== undefined && (
                    <div className="flex items-start gap-2 py-0.5 px-2 bg-emerald-500/15 text-emerald-500">
                      <span className="w-7 text-right select-none opacity-40 shrink-0 text-[10px]"> </span>
                      <span className="w-7 text-right select-none opacity-40 shrink-0 text-[10px]">{l.lineNumB}</span>
                      <span className="w-4 select-none font-bold shrink-0">+</span>
                      <span className="whitespace-pre-wrap break-all flex-1">{l.textB}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <DialogFooter className="p-3 border-t border-border/50 bg-muted/10 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <FileText className="w-3.5 h-3.5 text-muted-foreground" />
            <span>Showing {lines.length} total lines</span>
            <span className="opacity-40">·</span>
            <span>Drag & drop any file to compare</span>
          </div>
          <Button type="button" size="sm" className="h-8 text-xs" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
