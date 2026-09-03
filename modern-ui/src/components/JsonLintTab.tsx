import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { basicSetup } from 'codemirror'
import { EditorView, keymap } from '@codemirror/view'
import { EditorState } from '@codemirror/state'
import { json, jsonParseLinter } from '@codemirror/lang-json'
import { linter, lintGutter } from '@codemirror/lint'
import { oneDark } from '@codemirror/theme-one-dark'
import {
  AlertCircle,
  Braces,
  Check,
  Copy,
  Download,
  Eraser,
  FileJson,
  FolderOpen,
  Minus,
  Sparkles,
  Upload,
  Wand2,
  Wrench,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from './ui/button'
import { Badge } from './ui/badge'
import { cn } from '@/lib/utils'
import { actionGroup, actionBtnMuted, pageDescription, pageHeader, pageTitle, sectionCard, mono, monoXs } from '@/lib/ui-tokens'
import { THEME_CHANGE_EVENT } from '@/lib/themes'
import {
  SAMPLE_JSON,
  analyzeJson,
  formatBytes,
  minifyJson,
  prettifyJson,
  repairJson,
  sortJsonKeys,
  type JsonLintResult,
} from '@/lib/json-lint'

const STORAGE_KEY = 'rfid-emulator-jsonlint'
const MAX_TREE_NODES = 240

const lightTheme = EditorView.theme({
  '&': { backgroundColor: 'transparent', color: 'hsl(var(--foreground))' },
  '.cm-gutters': {
    backgroundColor: 'hsl(var(--muted) / 0.45)',
    color: 'hsl(var(--muted-foreground))',
    border: 'none',
  },
  '.cm-activeLineGutter': { backgroundColor: 'hsl(var(--accent))' },
  '.cm-activeLine': { backgroundColor: 'hsl(var(--accent) / 0.28)' },
  '.cm-cursor': { borderLeftColor: 'hsl(var(--foreground))' },
  '.cm-selectionBackground': { backgroundColor: 'hsl(var(--primary) / 0.18) !important' },
  '&.cm-focused .cm-selectionBackground': { backgroundColor: 'hsl(var(--primary) / 0.24) !important' },
  '.cm-tooltip': {
    backgroundColor: 'hsl(var(--popover))',
    color: 'hsl(var(--popover-foreground))',
    border: '1px solid hsl(var(--border))',
  },
})

function loadSaved(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? SAMPLE_JSON
  } catch {
    return SAMPLE_JSON
  }
}

function typeLabel(value: unknown): string {
  if (Array.isArray(value)) return `array[${value.length}]`
  if (value === null) return 'null'
  return typeof value
}

function JsonTree({
  value,
  name,
  depth = 0,
  budget,
}: {
  value: unknown
  name?: string
  depth?: number
  budget: { left: number }
}) {
  const [open, setOpen] = useState(depth < 2)
  if (budget.left <= 0) {
    return <div className="text-[11px] text-muted-foreground">…truncated</div>
  }
  budget.left--

  const isExpandable = value !== null && typeof value === 'object'
  const label = name != null ? `${name}` : 'root'

  if (!isExpandable) {
    const preview =
      typeof value === 'string' ? JSON.stringify(value) : value === undefined ? 'undefined' : String(value)
    return (
      <div className={cn('flex gap-2 py-0.5 font-mono text-[12px]', depth > 0 && 'pl-3')}>
        {name != null && <span className="text-sky-600 dark:text-sky-400">{label}</span>}
        {name != null && <span className="text-muted-foreground">:</span>}
        <span className="min-w-0 break-all text-foreground/90">{preview}</span>
      </div>
    )
  }

  const entries = Array.isArray(value)
    ? value.map((item, i) => [String(i), item] as const)
    : Object.entries(value as Record<string, unknown>)

  return (
    <div className={cn(depth > 0 && 'pl-2')}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-1.5 rounded-md px-1 py-0.5 text-left text-[12px] hover:bg-muted/50"
      >
        <span className="w-3 text-muted-foreground">{open ? '▾' : '▸'}</span>
        <span className={cn(monoXs, 'text-sky-600 dark:text-sky-400')}>{label}</span>
        <span className="text-[10px] text-muted-foreground">{typeLabel(value)}</span>
      </button>
      {open && (
        <div className="ml-2 border-l border-border/40 pl-2">
          {entries.map(([key, child]) => (
            <JsonTree key={key} name={key} value={child} depth={depth + 1} budget={budget} />
          ))}
        </div>
      )}
    </div>
  )
}

export function JsonLintTab() {
  const editorRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [indent, setIndent] = useState(2)
  const indentRef = useRef(2)
  indentRef.current = indent
  const [copied, setCopied] = useState(false)
  const [doc, setDoc] = useState(loadSaved)
  const [isDark, setIsDark] = useState(
    () => typeof document !== 'undefined' && document.documentElement.classList.contains('dark'),
  )

  const result = useMemo<JsonLintResult>(() => analyzeJson(doc), [doc])

  const readDoc = useCallback(() => viewRef.current?.state.doc.toString() ?? doc, [doc])

  const writeDoc = useCallback((next: string, cursor?: number) => {
    const view = viewRef.current
    if (!view) {
      setDoc(next)
      return
    }
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: next },
      selection: { anchor: Math.min(cursor ?? next.length, next.length) },
    })
    setDoc(next)
  }, [])

  const jumpTo = useCallback((position: number) => {
    const view = viewRef.current
    if (!view) return
    const pos = Math.max(0, Math.min(position, view.state.doc.length))
    view.dispatch({ selection: { anchor: pos }, scrollIntoView: true })
    view.focus()
  }, [])

  useEffect(() => {
    const syncTheme = () => setIsDark(document.documentElement.classList.contains('dark'))
    window.addEventListener(THEME_CHANGE_EVENT, syncTheme)
    const observer = new MutationObserver(syncTheme)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => {
      window.removeEventListener(THEME_CHANGE_EVENT, syncTheme)
      observer.disconnect()
    }
  }, [])

  useEffect(() => {
    if (!editorRef.current) return
    const saved = viewRef.current?.state.doc.toString() ?? doc
    viewRef.current?.destroy()

    const state = EditorState.create({
      doc: saved,
      extensions: [
        basicSetup,
        json(),
        lintGutter(),
        linter(jsonParseLinter()),
        keymap.of([
          {
            key: 'Mod-Shift-f',
            run: () => {
              try {
                writeDoc(prettifyJson(readDoc(), indentRef.current))
                toast.success('Prettified')
              } catch (err) {
                toast.error(err instanceof Error ? err.message : 'Cannot prettify')
              }
              return true
            },
          },
        ]),
        isDark ? oneDark : lightTheme,
        EditorView.lineWrapping,
        EditorView.theme({
          '&': { fontSize: '13px', height: '100%' },
          '.cm-scroller': { overflow: 'auto', fontFamily: 'var(--font-mono)', lineHeight: '1.55' },
          '.cm-content': { padding: '12px 0' },
          '.cm-gutters': { minWidth: '2.75rem' },
        }),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) setDoc(update.state.doc.toString())
        }),
      ],
    })
    viewRef.current = new EditorView({ state, parent: editorRef.current })
    return () => {
      viewRef.current?.destroy()
      viewRef.current = null
    }
    // Recreate only when theme changes; content is preserved via `saved`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDark])

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, doc)
    } catch {
      /* ignore quota */
    }
  }, [doc])

  const applyTransform = (label: string, fn: (text: string) => string) => {
    try {
      writeDoc(fn(readDoc()))
      toast.success(label)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : `Cannot ${label.toLowerCase()}`)
    }
  }

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(readDoc())
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1400)
      toast.success('Copied JSON')
    } catch {
      toast.error('Copy failed')
    }
  }

  const handleDownload = () => {
    const blob = new Blob([readDoc()], { type: 'application/json;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'document.json'
    a.click()
    URL.revokeObjectURL(url)
  }

  const loadFileText = (text: string) => {
    writeDoc(text)
    toast.success('Loaded file')
  }

  const handleFiles = (files: FileList | null) => {
    const file = files?.[0]
    if (!file) return
    file.text().then(loadFileText).catch(() => toast.error('Could not read file'))
  }

  const treeBudget = { left: MAX_TREE_NODES }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className={pageHeader}>
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400/20 via-orange-500/15 to-rose-500/15 text-amber-700 ring-1 ring-amber-500/20 dark:text-amber-300">
            <Braces className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h2 className={pageTitle}>JSON Lint</h2>
            <p className={pageDescription}>
              Validate, prettify, minify, and inspect JSON. Drop a file onto the editor or paste from the clipboard.
            </p>
          </div>
        </div>
        {result.ok ? (
          <Badge variant="success" className="h-7 gap-1.5 px-3">
            <Check className="h-3.5 w-3.5" />
            Valid JSON
          </Badge>
        ) : (
          <button
            type="button"
            onClick={() => jumpTo(result.error.position)}
            className="inline-flex h-7 items-center gap-1.5 rounded-full border border-destructive/30 bg-destructive/10 px-3 text-xs font-semibold text-destructive transition-colors hover:bg-destructive/15"
          >
            <AlertCircle className="h-3.5 w-3.5" />
            Line {result.error.line}:{result.error.column}
          </button>
        )}
      </div>

      <div className={cn(actionGroup, 'flex-wrap')}>
        <Button
          variant="ghost"
          size="sm"
          className={actionBtnMuted}
          onClick={() => applyTransform('Prettified', (t) => prettifyJson(t, indent))}
        >
          <Wand2 className="h-3.5 w-3.5" />
          Prettify
        </Button>
        <Button variant="ghost" size="sm" className={actionBtnMuted} onClick={() => applyTransform('Minified', minifyJson)}>
          <Minus className="h-3.5 w-3.5" />
          Minify
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className={actionBtnMuted}
          onClick={() => applyTransform('Sorted keys', (t) => sortJsonKeys(t, indent))}
        >
          <Sparkles className="h-3.5 w-3.5" />
          Sort keys
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className={actionBtnMuted}
          onClick={() => applyTransform('Repaired', repairJson)}
          title="Strip comments and trailing commas, then prettify"
        >
          <Wrench className="h-3.5 w-3.5" />
          Repair
        </Button>
        <div className="mx-1 hidden h-6 w-px bg-border/60 sm:block" />
        <div className="flex items-center gap-1 rounded-lg bg-background/80 px-1.5 ring-1 ring-border/30">
          <span className="px-1 text-[10px] uppercase tracking-wide text-muted-foreground">Indent</span>
          {[2, 4].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setIndent(n)}
              className={cn(
                'h-7 rounded-md px-2 text-xs font-medium',
                indent === n ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {n}
            </button>
          ))}
        </div>
        <div className="mx-1 hidden h-6 w-px bg-border/60 sm:block" />
        <Button variant="ghost" size="sm" className={actionBtnMuted} onClick={handleCopy}>
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          Copy
        </Button>
        <Button variant="ghost" size="sm" className={actionBtnMuted} onClick={() => fileInputRef.current?.click()}>
          <Upload className="h-3.5 w-3.5" />
          Open
        </Button>
        <Button variant="ghost" size="sm" className={actionBtnMuted} onClick={handleDownload}>
          <Download className="h-3.5 w-3.5" />
          Save
        </Button>
        <Button variant="ghost" size="sm" className={actionBtnMuted} onClick={() => writeDoc(SAMPLE_JSON)}>
          <FileJson className="h-3.5 w-3.5" />
          Sample
        </Button>
        <Button variant="ghost" size="sm" className={actionBtnMuted} onClick={() => writeDoc('')}>
          <Eraser className="h-3.5 w-3.5" />
          Clear
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json,.txt,application/json,text/plain"
          className="hidden"
          onChange={(e) => {
            handleFiles(e.target.files)
            e.target.value = ''
          }}
        />
      </div>

      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(0,1.6fr)_minmax(260px,0.9fr)]">
        <div
          className={cn(
            sectionCard,
            'relative flex h-full min-h-[280px] flex-col overflow-hidden',
            dragging && 'ring-2 ring-primary/40',
          )}
          onDragOver={(e) => {
            e.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragging(false)
            handleFiles(e.dataTransfer.files)
          }}
        >
          <div ref={editorRef} className="min-h-0 flex-1" />
          {dragging && (
            <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-background/70 backdrop-blur-[2px]">
              <div className="flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-2 text-sm font-medium text-primary">
                <FolderOpen className="h-4 w-4" />
                Drop JSON to load
              </div>
            </div>
          )}
        </div>

        <aside className={cn(sectionCard, 'flex h-full min-h-0 flex-col overflow-hidden')}>
          <div className="border-b border-border/40 px-4 py-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Inspector</div>
            {result.ok ? (
              <div className="mt-2 grid grid-cols-2 gap-2">
                {(
                  [
                    ['Size', formatBytes(result.stats.bytes)],
                    ['Lines', String(result.stats.lines)],
                    ['Keys', String(result.stats.keys)],
                    ['Depth', String(result.stats.maxDepth)],
                    ['Objects', String(result.stats.objects)],
                    ['Arrays', String(result.stats.arrays)],
                  ] as const
                ).map(([label, value]) => (
                  <div key={label} className="rounded-lg bg-muted/30 px-2.5 py-1.5">
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
                    <div className={cn(mono, 'text-sm font-medium')}>{value}</div>
                  </div>
                ))}
              </div>
            ) : (
              <button
                type="button"
                onClick={() => jumpTo(result.error.position)}
                className="mt-2 w-full rounded-lg border border-destructive/25 bg-destructive/10 px-3 py-2.5 text-left"
              >
                <div className="text-[11px] font-semibold text-destructive">
                  Parse error · L{result.error.line}:{result.error.column}
                </div>
                <p className="mt-1 text-xs leading-relaxed text-destructive/90">{result.error.message}</p>
                <p className="mt-1 text-[11px] text-muted-foreground">Click to jump to the problem</p>
              </button>
            )}
          </div>
          <div className="min-h-0 flex-1 overflow-auto px-3 py-3">
            {result.ok ? (
              <JsonTree value={result.value} budget={treeBudget} />
            ) : (
              <p className="px-1 text-xs leading-relaxed text-muted-foreground">
                Fix the highlighted error, or try <span className="font-medium text-foreground">Repair</span> if this
                was copied from JS (comments / trailing commas).
              </p>
            )}
          </div>
          {result.ok && (
            <div className="border-t border-border/40 px-4 py-2 text-[11px] text-muted-foreground">
              Root is a <span className="font-medium text-foreground">{result.stats.rootType}</span>
              {' · '}
              {result.stats.characters.toLocaleString()} chars
            </div>
          )}
        </aside>
      </div>
    </div>
  )
}
