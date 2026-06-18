import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog'
import { ScrollArea } from '../ui/scroll-area'
import { Loader2, Folder, File, Search } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { formatSftpSize, formatSftpMtime } from './sftp-column-format'

export interface SftpFindMatchRow {
  path: string
  name: string
  type: 'file' | 'folder'
  size?: number
  mtime?: number
}

function parentDir(filePath: string): string {
  if (filePath === '/' || !filePath) return '/'
  const trimmed = filePath.replace(/\/+$/, '')
  const i = trimmed.lastIndexOf('/')
  if (i <= 0) return '/'
  return trimmed.slice(0, i) || '/'
}

import type { SftpSessionApi } from '@/lib/sftp-session-api'

interface SftpFindDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  defaultRootPath: string
  onGoToPath: (path: string) => void
  sftp: SftpSessionApi | null
}

export function SftpFindDialog({
  open,
  onOpenChange,
  defaultRootPath,
  onGoToPath,
  sftp,
}: SftpFindDialogProps) {
  const api = window.electronAPI

  const [rootPath, setRootPath] = useState('/')
  const [pattern, setPattern] = useState('*')
  const [recursive, setRecursive] = useState(true)
  const [caseSensitive, setCaseSensitive] = useState(false)
  const [includeFiles, setIncludeFiles] = useState(true)
  const [includeFolders, setIncludeFolders] = useState(false)

  const [searching, setSearching] = useState(false)
  const [results, setResults] = useState<SftpFindMatchRow[]>([])
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [progress, setProgress] = useState({
    scannedDirs: 0,
    matchCount: 0,
    currentDir: '',
    limitReached: false,
  })

  const operationIdRef = useRef<string | null>(null)

  useEffect(() => {
    if (!open) return
    setRootPath(defaultRootPath || '/')
    setResults([])
    setSelectedPath(null)
    setProgress({ scannedDirs: 0, matchCount: 0, currentDir: '', limitReached: false })
  }, [open, defaultRootPath])

  const cancelSearch = useCallback(async () => {
    await sftp?.findCancel()
  }, [sftp])

  const startSearch = useCallback(async () => {
    if (!sftp?.findFiles) {
      toast.error('Find requires the desktop app')
      return
    }
    const trimmedRoot = rootPath.trim() || '/'
    const trimmedPattern = pattern.trim() || '*'
    const filesOnly = includeFiles && !includeFolders
    const foldersOnly = includeFolders && !includeFiles

    const operationId = `find-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    operationIdRef.current = operationId
    setSearching(true)
    setResults([])
    setSelectedPath(null)
    setProgress({ scannedDirs: 0, matchCount: 0, currentDir: trimmedRoot, limitReached: false })

    const unsubProgress = api?.onSftpFindProgress?.((payload) => {
      if (payload.operationId !== operationId) return
      setProgress({
        scannedDirs: payload.scannedDirs,
        matchCount: payload.matchCount,
        currentDir: payload.currentDir,
        limitReached: payload.limitReached ?? false,
      })
    })
    const unsubMatch = api?.onSftpFindMatch?.((payload) => {
      if (payload.operationId !== operationId) return
      setResults((prev) => [...prev, payload.match])
    })

    try {
      const r = await sftp.findFiles(
        {
          rootPath: trimmedRoot,
          pattern: trimmedPattern,
          recursive,
          caseSensitive,
          filesOnly,
          foldersOnly,
        },
        operationId,
      )
      if (!r.ok) {
        toast.error(r.error)
        return
      }
      if (r.cancelled) {
        toast.message('Search stopped', { description: `${r.matchCount} match(es) found` })
      } else if (r.limitReached) {
        toast.message('Result limit reached', {
          description: `Showing first ${r.matchCount} matches`,
        })
      } else {
        toast.success(`Found ${r.matchCount} match(es)`)
      }
    } finally {
      unsubProgress?.()
      unsubMatch?.()
      if (operationIdRef.current === operationId) {
        operationIdRef.current = null
        setSearching(false)
      }
    }
  }, [
    api,
    rootPath,
    pattern,
    recursive,
    caseSensitive,
    includeFiles,
    includeFolders,
  ])

  const handleOpenChange = (next: boolean) => {
    if (!next && searching) void cancelSearch()
    onOpenChange(next)
  }

  const goToSelected = () => {
    if (!selectedPath) return
    onOpenChange(false)
    onGoToPath(selectedPath)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] flex flex-col gap-0 p-0">
        <DialogHeader className="px-6 pt-6 pb-2">
          <DialogTitle className="flex items-center gap-2">
            <Search className="w-5 h-5" />
            Find files
          </DialogTitle>
          <DialogDescription>
            Search remote files by name mask (<span className="font-mono">*</span> and{' '}
            <span className="font-mono">?</span> wildcards; separate patterns with{' '}
            <span className="font-mono">;</span>)
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 space-y-3 shrink-0">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Remote path</Label>
              <Input
                value={rootPath}
                onChange={(e) => setRootPath(e.target.value)}
                className="font-mono text-sm"
                disabled={searching}
                placeholder="/"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">File mask</Label>
              <Input
                value={pattern}
                onChange={(e) => setPattern(e.target.value)}
                className="font-mono text-sm"
                disabled={searching}
                placeholder="*"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !searching) void startSearch()
                }}
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                className="rounded border-input accent-primary"
                checked={recursive}
                onChange={(e) => setRecursive(e.target.checked)}
                disabled={searching}
              />
              Search subdirectories
            </label>
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                className="rounded border-input accent-primary"
                checked={caseSensitive}
                onChange={(e) => setCaseSensitive(e.target.checked)}
                disabled={searching}
              />
              Case sensitive
            </label>
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                className="rounded border-input accent-primary"
                checked={includeFiles}
                onChange={(e) => setIncludeFiles(e.target.checked)}
                disabled={searching}
              />
              Files
            </label>
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                className="rounded border-input accent-primary"
                checked={includeFolders}
                onChange={(e) => setIncludeFolders(e.target.checked)}
                disabled={searching}
              />
              Directories
            </label>
          </div>

          {(searching || progress.matchCount > 0) && (
            <div className="text-xs text-muted-foreground font-mono truncate">
              {searching ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="w-3 h-3 animate-spin shrink-0" />
                  Scanning {progress.currentDir} — {progress.matchCount} match(es),{' '}
                  {progress.scannedDirs} folder(s)
                </span>
              ) : (
                <span>
                  {progress.matchCount} match(es) in {progress.scannedDirs} folder(s)
                  {progress.limitReached ? ' (limit reached)' : ''}
                </span>
              )}
            </div>
          )}
        </div>

        <div className="flex-1 min-h-0 px-6 py-3">
          <div className="rounded-md border border-border/60 overflow-hidden h-[min(280px,40vh)]">
            <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_5rem_9rem] gap-2 px-3 py-1.5 text-[10px] uppercase tracking-wide text-muted-foreground border-b border-border/50 bg-muted/30">
              <span>Name</span>
              <span>Directory</span>
              <span className="text-right">Size</span>
              <span>Changed</span>
            </div>
            <ScrollArea className="h-[calc(min(280px,40vh)-28px)]">
              {results.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  {searching ? 'Searching…' : 'No results yet. Click Start to search.'}
                </p>
              ) : (
                <ul>
                  {results.map((row) => (
                    <li key={row.path}>
                      <button
                        type="button"
                        className={cn(
                          'w-full grid grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_5rem_9rem] gap-2 px-3 py-1 text-left text-sm hover:bg-accent/60 transition-colors items-center',
                          selectedPath === row.path && 'bg-accent',
                        )}
                        onClick={() => setSelectedPath(row.path)}
                        onDoubleClick={() => {
                          onOpenChange(false)
                          onGoToPath(row.path)
                        }}
                      >
                        <span className="flex items-center gap-1.5 truncate font-mono text-xs">
                          {row.type === 'folder' ? (
                            <Folder className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                          ) : (
                            <File className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                          )}
                          <span className="truncate">{row.name}</span>
                        </span>
                        <span className="truncate font-mono text-xs text-muted-foreground">
                          {parentDir(row.path)}
                        </span>
                        <span className="text-right tabular-nums text-xs text-muted-foreground">
                          {formatSftpSize(row.size, row.type === 'folder')}
                        </span>
                        <span className="truncate text-xs text-muted-foreground">
                          {formatSftpMtime(row.mtime)}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </ScrollArea>
          </div>
        </div>

        <DialogFooter className="px-6 pb-6 pt-2 gap-2 sm:gap-2 flex-wrap">
          {searching ? (
            <Button variant="outline" onClick={() => void cancelSearch()}>
              Stop
            </Button>
          ) : (
            <Button onClick={() => void startSearch()} className="gap-1.5">
              <Search className="w-4 h-4" />
              Start
            </Button>
          )}
          <Button
            variant="secondary"
            disabled={!selectedPath}
            onClick={goToSelected}
          >
            Go to
          </Button>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
