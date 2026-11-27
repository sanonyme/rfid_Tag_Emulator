import { useState, type KeyboardEvent } from 'react'
import { Play, RotateCcw, CheckCircle2, AlertCircle, Loader2, Terminal } from 'lucide-react'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { Switch } from '../ui/switch'
import { Textarea } from '../ui/textarea'
import { Badge } from '../ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select'
import { StandardVariablesReference } from '../VariablePresetPicker'
import { executeCode } from '@/lib/automation-blocks'
import type { AutomationVars } from '@/lib/automation-template'
import {
  CODE_LANGUAGE_OPTIONS,
  CODE_STARTERS,
  type AutomationStep,
  type CodeLanguage,
} from '@/lib/automation-types'

interface Props {
  step: AutomationStep
  patchParams: (updates: Partial<AutomationStep['params']>) => void
  host?: string
}

export function CustomCodeConfigFields({ step, patchParams, host }: Props) {
  const p = step.params
  const lang: CodeLanguage = p.codeLanguage ?? 'javascript'
  const meta = CODE_LANGUAGE_OPTIONS.find((o) => o.value === lang) ?? CODE_LANGUAGE_OPTIONS[0]!
  const source = p.codeSource ?? ''

  const [testing, setTesting] = useState(false)
  const [testLogs, setTestLogs] = useState<string[]>([])
  const [testError, setTestError] = useState<string | null>(null)
  const [testChanged, setTestChanged] = useState<Record<string, string> | null>(null)
  const [testDurationMs, setTestDurationMs] = useState<number | null>(null)

  const handleLanguageChange = (nextLang: CodeLanguage) => {
    const trimmed = source.trim()
    const isExistingStarter =
      !trimmed ||
      Object.values(CODE_STARTERS).some((starter) => starter.trim() === trimmed)

    if (isExistingStarter) {
      patchParams({
        codeLanguage: nextLang,
        codeSource: CODE_STARTERS[nextLang],
      })
    } else {
      patchParams({ codeLanguage: nextLang })
    }
    setTestError(null)
    setTestChanged(null)
    setTestLogs([])
  }

  const handleEditorKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== 'Tab') return
    e.preventDefault()
    const el = e.currentTarget
    const start = el.selectionStart
    const end = el.selectionEnd
    const next = source.slice(0, start) + '  ' + source.slice(end)
    patchParams({ codeSource: next })
    requestAnimationFrame(() => {
      el.selectionStart = el.selectionEnd = start + 2
    })
  }

  const handleTestRun = async () => {
    setTesting(true)
    setTestError(null)
    setTestChanged(null)
    setTestDurationMs(null)
    const logs: string[] = []
    const seed: AutomationVars = {
      host: host || 'localhost',
      tagCount: '3',
      epc: '303400000000000000000001',
      upc: '00000000000001',
      i: '0',
      item: 'sample',
    }
    const vars: AutomationVars = { ...seed }
    const t0 = performance.now()
    try {
      await executeCode(step, vars, (msg) => logs.push(msg))
      const diff: Record<string, string> = {}
      for (const [k, v] of Object.entries(vars)) {
        if (seed[k] !== v) diff[k] = v
      }
      setTestChanged(diff)
      setTestLogs(logs)
    } catch (err: any) {
      setTestLogs(logs)
      setTestError(err?.message || String(err))
    } finally {
      setTestDurationMs(Math.max(0, Math.round(performance.now() - t0)))
      setTesting(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border/50 bg-muted/10 p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Label className="text-xs font-semibold">Language</Label>
          <Badge variant={meta.builtIn ? 'secondary' : 'outline'} className="h-5 text-[10px]">
            {meta.builtIn ? 'Built-in Runtime' : 'Local CLI Runtime'}
          </Badge>
        </div>

        <Select value={lang} onValueChange={(v) => handleLanguageChange(v as CodeLanguage)}>
          <SelectTrigger className="h-9 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CODE_LANGUAGE_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value} className="text-xs">
                <span className="font-mono font-semibold mr-2">[{opt.badge}]</span>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <p className="text-[11px] text-muted-foreground rounded-lg border border-border/40 bg-background/50 px-2.5 py-2">
          {meta.runtimeHint}
        </p>

        <div className="flex items-center justify-between gap-2 pt-1">
          <Label className="text-xs font-semibold">Code ({meta.ext})</Label>
          <div className="flex items-center gap-1.5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 px-2.5 text-[11px] gap-1"
              onClick={() => patchParams({ codeSource: CODE_STARTERS[lang] })}
            >
              <RotateCcw className="h-3 w-3" />
              Reset Starter
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={testing || !source.trim()}
              onClick={handleTestRun}
              className="h-7 px-2.5 text-[11px] gap-1 bg-emerald-600/15 text-emerald-600 hover:bg-emerald-600/25 dark:text-emerald-400 border border-emerald-500/30"
            >
              {testing ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Play className="h-3 w-3" />
              )}
              {testing ? 'Running…' : 'Test Run'}
            </Button>
          </div>
        </div>

        <Textarea
          value={source}
          onChange={(e) => patchParams({ codeSource: e.target.value })}
          onKeyDown={handleEditorKeyDown}
          rows={14}
          spellCheck={false}
          className="font-mono text-xs leading-relaxed bg-background/70"
          placeholder={`Write your ${meta.label} code here…`}
        />

        <div className="rounded-lg border border-border/40 bg-muted/20 p-2.5 text-[11px] text-muted-foreground space-y-1">
          {lang === 'javascript' ? (
            <p>
              Use <code className="font-mono text-foreground">vars.name</code> to read/write workflow variables,
              call <code className="font-mono text-foreground">log(...)</code>, and{' '}
              <code className="font-mono text-foreground">return {'{ key: val }'}</code>. Works identically inside{' '}
              <span className="font-semibold text-foreground">Call Sequence</span>,{' '}
              <span className="font-semibold text-foreground">Loop N</span>, and{' '}
              <span className="font-semibold text-foreground">For Each</span>.
            </p>
          ) : (
            <p>
              Reads workflow variables from env <code className="font-mono text-foreground">ZEUS_VARS_JSON</code>{' '}
              (plus <code className="font-mono text-foreground">ZEUS_HOST</code>,{' '}
              <code className="font-mono text-foreground">ZEUS_EPC</code>, etc.). Print a final{' '}
              <code className="font-mono text-foreground">{'{"myVar":"value"}'}</code> JSON line (or{' '}
              <code className="font-mono text-foreground">KEY=VALUE</code> lines) to update downstream variables!
            </p>
          )}
        </div>

        {(testError !== null || testChanged !== null || testLogs.length > 0) && (
          <div className="rounded-lg border border-border/60 bg-background/80 p-3 space-y-2">
            <div className="flex items-center justify-between text-xs font-medium">
              <span className="inline-flex items-center gap-1.5">
                {testError ? (
                  <>
                    <AlertCircle className="h-3.5 w-3.5 text-destructive" />
                    <span className="text-destructive">Test Run Failed</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                    <span className="text-emerald-600 dark:text-emerald-400">Test Run Passed</span>
                  </>
                )}
              </span>
              {testDurationMs !== null && (
                <span className="text-[10.5px] font-mono text-muted-foreground">{testDurationMs}ms</span>
              )}
            </div>

            {testError && (
              <p className="text-xs font-mono text-destructive whitespace-pre-wrap break-all">{testError}</p>
            )}

            {testLogs.length > 0 && (
              <div className="rounded bg-muted/40 p-2 font-mono text-[11px] text-foreground/90 max-h-28 overflow-y-auto space-y-0.5">
                {testLogs.map((l, idx) => (
                  <div key={idx} className="whitespace-pre-wrap break-all">
                    {l}
                  </div>
                ))}
              </div>
            )}

            {testChanged && Object.keys(testChanged).length > 0 && (
              <div className="space-y-1">
                <div className="text-[10.5px] font-medium text-muted-foreground">Updated variables:</div>
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(testChanged).map(([k, v]) => (
                    <span
                      key={k}
                      className="inline-flex items-center gap-1 rounded border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 font-mono text-[11px]"
                    >
                      <span className="font-semibold text-emerald-700 dark:text-emerald-300">{k}</span>
                      <span className="text-muted-foreground">=</span>
                      <span className="max-w-[180px] truncate text-foreground" title={v}>
                        {v}
                      </span>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {lang !== 'javascript' && (
        <div className="rounded-xl border border-border/50 bg-muted/10 p-4 space-y-3">
          <div className="flex items-center gap-1.5 text-xs font-semibold">
            <Terminal className="h-3.5 w-3.5 text-primary" />
            Runtime &amp; Output Capture
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-1">
              <Label className="text-[11px]">Save stdout as</Label>
              <Input
                value={p.codeSaveStdoutAs || ''}
                onChange={(e) => patchParams({ codeSaveStdoutAs: e.target.value })}
                placeholder="codeOut"
                className="h-8 font-mono text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px]">Save stderr as</Label>
              <Input
                value={p.codeSaveStderrAs || ''}
                onChange={(e) => patchParams({ codeSaveStderrAs: e.target.value })}
                placeholder="codeErr"
                className="h-8 font-mono text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px]">Save exit code as</Label>
              <Input
                value={p.codeSaveExitCodeAs || ''}
                onChange={(e) => patchParams({ codeSaveExitCodeAs: e.target.value })}
                placeholder="codeExit"
                className="h-8 font-mono text-xs"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-1">
            <div className="space-y-1">
              <Label className="text-[11px]">Timeout (ms)</Label>
              <Input
                type="number"
                min={1000}
                max={120000}
                value={p.codeTimeoutMs ?? 15000}
                onChange={(e) =>
                  patchParams({ codeTimeoutMs: Math.max(1000, Number(e.target.value) || 15000) })
                }
                className="h-8 font-mono text-xs"
              />
            </div>
            <div className="flex items-center justify-between gap-2 rounded-lg border border-border/40 bg-background/40 px-2.5 py-1.5">
              <div>
                <div className="text-[11px] font-medium">Fail on non-zero exit</div>
                <div className="text-[10px] text-muted-foreground">Throw if exit ≠ 0</div>
              </div>
              <Switch
                checked={p.codeFailOnNonZero !== false}
                onCheckedChange={(v) => patchParams({ codeFailOnNonZero: v })}
              />
            </div>
          </div>

          <div className="flex items-center justify-between gap-2 rounded-lg border border-border/40 bg-background/40 px-2.5 py-2">
            <div>
              <div className="text-[11px] font-medium">Pre-interpolate {'{{var}}'} in code</div>
              <div className="text-[10px] text-muted-foreground">
                Off by default (safe for {'{{}}'} syntax in JS/Go/Java); read env ZEUS_VARS_JSON instead.
              </div>
            </div>
            <Switch
              checked={p.codeInterpolateVars === true}
              onCheckedChange={(v) => patchParams({ codeInterpolateVars: v })}
            />
          </div>
        </div>
      )}

      <StandardVariablesReference />
    </div>
  )
}
