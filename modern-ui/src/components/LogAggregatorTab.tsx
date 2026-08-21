import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from './ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import {
  Archive,
  FolderInput,
  FolderOpen,
  Layers,
  Play,
  RefreshCw,
  Trash2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import type { LogAggregatorProgress, LogAggregatorResult } from '@/types/log-aggregator'

function formatBytes(n: number): string {
  if (n >= 1024 ** 3) return (n / 1024 ** 3).toFixed(2) + ' GB'
  if (n >= 1024 ** 2) return (n / 1024 ** 2).toFixed(2) + ' MB'
  if (n >= 1024) return (n / 1024).toFixed(2) + ' KB'
  return n + ' B'
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms} ms`
  const s = ms / 1000
  if (s < 60) return `${s.toFixed(1)} s`
  return `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`
}

function suggestedOutputName(zipPath: string): string {
  const base = zipPath.replace(/\\/g, '/').split('/').pop() ?? 'merged_logs'
  return base.replace(/\.zip$/i, '_merged')
}

export function LogAggregatorTab() {
  const [zipPath, setZipPath] = useState<string | null>(null)
  const [outputDir, setOutputDir] = useState<string | null>(null)
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState<LogAggregatorProgress | null>(null)
  const [result, setResult] = useState<LogAggregatorResult | null>(null)
  const [dragActive, setDragActive] = useState(false)
  const dragCounterRef = useRef(0)
  const unsubRef = useRef<(() => void) | null>(null)

  const resolveDroppedFilePath = useCallback((file: File): string | null => {
    const fromApi = window.electronAPI?.getPathForFile?.(file)
    if (fromApi) return fromApi
    const legacy = (file as File & { path?: string }).path
    return legacy ?? null
  }, [])

  const applyZipPath = useCallback(
    (filePath: string) => {
      setZipPath(filePath)
      setResult(null)
      if (!outputDir) {
        const parent = filePath.replace(/[/\\][^/\\]+$/, '')
        setOutputDir(`${parent}/${suggestedOutputName(filePath)}`)
      }
    },
    [outputDir],
  )

  useEffect(() => {
    return () => {
      unsubRef.current?.()
    }
  }, [])

  const hasElectron = Boolean(window.electronAPI?.logAggregatorRun)

  const pickZip = useCallback(async () => {
    const res = await window.electronAPI?.logAggregatorPickZip?.()
    if (!res) return
    if ('cancelled' in res && res.cancelled) return
    if (res.ok && 'path' in res) {
      applyZipPath(res.path)
    } else if (!res.ok && 'error' in res) {
      toast.error('Could not pick zip', { description: res.error })
    }
  }, [applyZipPath])

  const pickOutput = useCallback(async () => {
    const res = await window.electronAPI?.logAggregatorPickOutput?.()
    if (!res) return
    if ('cancelled' in res && res.cancelled) return
    if (res.ok && 'path' in res) {
      if (zipPath) {
        setOutputDir(`${res.path}/${suggestedOutputName(zipPath)}`)
      } else {
        setOutputDir(res.path)
      }
      setResult(null)
    }
  }, [zipPath])

  const handleDragEnter = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault()
      e.stopPropagation()
      if (!hasElectron) return
      dragCounterRef.current += 1
      if (e.dataTransfer.types.includes('Files')) {
        setDragActive(true)
      }
    },
    [hasElectron],
  )

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounterRef.current -= 1
    if (dragCounterRef.current <= 0) {
      dragCounterRef.current = 0
      setDragActive(false)
    }
  }, [])

  const handleDragOver = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault()
      e.stopPropagation()
      if (hasElectron) {
        e.dataTransfer.dropEffect = 'copy'
      }
    },
    [hasElectron],
  )

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault()
      e.stopPropagation()
      dragCounterRef.current = 0
      setDragActive(false)
      if (!hasElectron) return

      const file = e.dataTransfer.files?.[0]
      if (!file) return

      const name = file.name.toLowerCase()
      if (!name.endsWith('.zip')) {
        toast.error('Drop a .zip file')
        return
      }

      const filePath = resolveDroppedFilePath(file)
      if (!filePath) {
        toast.error('Could not read dropped file path', {
          description: 'Use Choose zip or restart the desktop app.',
        })
        return
      }

      applyZipPath(filePath)
    },
    [applyZipPath, hasElectron, resolveDroppedFilePath],
  )

  const handleRun = useCallback(async () => {
    if (!zipPath || !outputDir || running) return
    setRunning(true)
    setProgress({ phase: 'extract', message: 'Starting…' })
    setResult(null)

    unsubRef.current?.()
    unsubRef.current =
      window.electronAPI?.onLogAggregatorProgress?.((p) => setProgress(p)) ?? null

    try {
      const res = await window.electronAPI!.logAggregatorRun!(zipPath, outputDir)
      if (res.ok) {
        setResult(res)
        toast.success('Logs aggregated', {
          description: `${res.stats.filesProcessed} files → ${res.stats.categories.length} categories`,
        })
      } else {
        toast.error('Aggregation failed', { description: res.error })
      }
    } catch (err) {
      toast.error('Aggregation failed', { description: String(err) })
    } finally {
      unsubRef.current?.()
      unsubRef.current = null
      setRunning(false)
    }
  }, [zipPath, outputDir, running])

  const handleClear = () => {
    setZipPath(null)
    setOutputDir(null)
    setProgress(null)
    setResult(null)
  }

  const progressPct =
    progress?.total && progress.current != null
      ? Math.round((progress.current / progress.total) * 100)
      : progress?.phase === 'extract'
        ? 15
        : progress?.phase === 'done'
          ? 100
          : undefined

  return (
    <div className="stagger-children space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Layers className="w-5 h-5" />
            Log Aggregator
          </CardTitle>
          <CardDescription>
            Drop an Edge daily log zip (e.g.{' '}
            <code className="text-xs">ALL-day-RuralHall-260529072159.zip</code>). Files are sorted
            into category folders and hourly rotations are merged into{' '}
            <code className="text-xs">aggregated_*.log</code> files — same layout as a manual
            hanes merge.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!hasElectron && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">
              Run the desktop app (Electron) to process large zip archives on disk. Browser mode
              cannot access local zip paths.
            </div>
          )}

          <div
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDragOverCapture={handleDragOver}
            onDropCapture={handleDrop}
            className={cn(
              'flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed p-8 text-center transition-colors',
              dragActive
                ? 'border-primary bg-primary/5'
                : 'border-border/60 bg-muted/20 hover:bg-muted/30',
            )}
          >
            <Archive className="h-10 w-10 text-muted-foreground" />
            <div className="space-y-1">
              <p className="text-sm font-medium">
                {zipPath ? (
                  <>
                    Input: <span className="font-mono text-primary break-all">{zipPath}</span>
                  </>
                ) : (
                  'Drop a daily log .zip here'
                )}
              </p>
              {outputDir && (
                <p className="text-xs text-muted-foreground break-all">
                  Output: <span className="font-mono text-foreground/90">{outputDir}</span>
                </p>
              )}
            </div>

            <div className="flex flex-wrap justify-center gap-2">
              <Button size="sm" onClick={() => void pickZip()} disabled={!hasElectron || running}>
                <Archive className="w-4 h-4 mr-1.5" />
                Choose zip
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => void pickOutput()}
                disabled={!hasElectron || running}
              >
                <FolderInput className="w-4 h-4 mr-1.5" />
                Output folder
              </Button>
              <Button
                size="sm"
                onClick={() => void handleRun()}
                disabled={!hasElectron || !zipPath || !outputDir || running}
              >
                {running ? (
                  <RefreshCw className="w-4 h-4 mr-1.5 animate-spin" />
                ) : (
                  <Play className="w-4 h-4 mr-1.5" />
                )}
                {running ? 'Processing…' : 'Aggregate'}
              </Button>
              {(zipPath || result) && (
                <Button size="sm" variant="outline" onClick={handleClear} disabled={running}>
                  <Trash2 className="w-4 h-4 mr-1.5" />
                  Clear
                </Button>
              )}
              {result && (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => void window.electronAPI?.logAggregatorShowOutput?.(result.outputDir)}
                >
                  <FolderOpen className="w-4 h-4 mr-1.5" />
                  Open output
                </Button>
              )}
            </div>
          </div>

          {running && progress && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span className="capitalize">{progress.phase}</span>
                <span>{progress.message}</span>
              </div>
              {progressPct != null && (
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full bg-primary transition-all duration-300"
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
              )}
            </div>
          )}

          {result && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 text-sm">
                <div className="rounded-lg border border-border/50 bg-background/40 p-3">
                  <p className="text-xs text-muted-foreground">Files</p>
                  <p className="font-semibold">{result.stats.filesProcessed}</p>
                </div>
                <div className="rounded-lg border border-border/50 bg-background/40 p-3">
                  <p className="text-xs text-muted-foreground">VSBL folders</p>
                  <p className="font-semibold">{result.stats.vsblFolders}</p>
                </div>
                <div className="rounded-lg border border-border/50 bg-background/40 p-3">
                  <p className="text-xs text-muted-foreground">Duration</p>
                  <p className="font-semibold">{formatDuration(result.stats.durationMs)}</p>
                </div>
                <div className="rounded-lg border border-border/50 bg-background/40 p-3">
                  <p className="text-xs text-muted-foreground">Engine</p>
                  <p className="font-semibold text-xs leading-snug">
                    {result.stats.extractMethod}
                    {result.stats.usedGitBash ? ' + git bash cat' : ' + node streams'}
                  </p>
                </div>
              </div>

              <div className="rounded-lg border border-border/50 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-xs text-muted-foreground">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium">Category</th>
                      <th className="text-right px-3 py-2 font-medium">Files</th>
                      <th className="text-left px-3 py-2 font-medium">Aggregated</th>
                      <th className="text-right px-3 py-2 font-medium">Size</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.stats.categories.map((cat) => (
                      <tr key={cat.name} className="border-t border-border/40">
                        <td className="px-3 py-2 font-mono">{cat.name}</td>
                        <td className="px-3 py-2 text-right">{cat.files}</td>
                        <td className="px-3 py-2">
                          {cat.aggregated ? (
                            <code className="text-xs">aggregated_{cat.name}.log</code>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right text-muted-foreground">
                          {cat.aggregatedBytes != null ? formatBytes(cat.aggregatedBytes) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
