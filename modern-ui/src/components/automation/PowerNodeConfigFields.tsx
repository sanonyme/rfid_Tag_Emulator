import { Plus, Trash2, FolderOpen } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select'
import { Switch } from '../ui/switch'
import { Textarea } from '../ui/textarea'
import { VariableAutocompleteInput } from './VariableAutocompleteInput'
import {
  CONDITION_OPS,
  CRYPTO_OPS,
  CSV_JSON_OPS,
  DATETIME_OPS,
  WEBHOOK_PRESETS,
  type AggregateOp,
  type AutomationStep,
  type ConditionOp,
  type CryptoOp,
  type CsvJsonOp,
  type DateTimeOp,
  type DateTimeUnit,
  type ParallelBranchItem,
  type ParallelWaitMode,
  type ProbeMode,
  type PromptInputMode,
  type WebhookPreset,
} from '@/lib/automation-types'

interface PowerNodeConfigFieldsProps {
  step: AutomationStep
  patchParams: (updates: Partial<AutomationStep['params']>) => void
  upstreamVariables: string[]
  host: string
}

export function PowerNodeConfigFields({
  step,
  patchParams,
  upstreamVariables,
  host,
}: PowerNodeConfigFieldsProps) {
  switch (step.type) {
    case 'SSH_EXEC':
      return (
        <div className="rounded-xl border border-border/50 bg-muted/10 p-4 space-y-3">
          <div className="grid grid-cols-[1fr_90px_130px] gap-2">
            <div className="space-y-1">
              <Label className="text-xs">SSH Host</Label>
              <VariableAutocompleteInput
                value={step.params.sshHost || ''}
                onChange={(v) => patchParams({ sshHost: v })}
                upstreamVariables={upstreamVariables}
                placeholder={host || '{{host}}'}
                className="h-9 font-mono text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Port</Label>
              <Input
                value={step.params.sshPort || '22'}
                onChange={(e) => patchParams({ sshPort: e.target.value })}
                className="h-9 font-mono text-xs"
                placeholder="22"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Username</Label>
              <VariableAutocompleteInput
                value={step.params.sshUser || ''}
                onChange={(v) => patchParams({ sshUser: v })}
                upstreamVariables={upstreamVariables}
                placeholder="root"
                className="h-9 font-mono text-xs"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Password (or {'{{secret.SSH_PASS}}'})</Label>
              <VariableAutocompleteInput
                value={step.params.sshPassword || ''}
                onChange={(v) => patchParams({ sshPassword: v })}
                upstreamVariables={upstreamVariables}
                placeholder="{{secret.SSH_PASS}}"
                className="h-9 font-mono text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Private Key Path (optional)</Label>
              <div className="flex items-center gap-1">
                <Input
                  value={step.params.sshPrivateKeyPath || ''}
                  onChange={(e) => patchParams({ sshPrivateKeyPath: e.target.value })}
                  placeholder="C:\Users\...\id_ed25519"
                  className="h-9 font-mono text-xs flex-1"
                />
                <Button
                  type="button"
                  variant="secondary"
                  size="icon"
                  className="h-9 w-9 shrink-0"
                  title="Browse key file"
                  onClick={async () => {
                    const res = await window.electronAPI?.localPickFile?.({ title: 'Select SSH Private Key' })
                    if (!res) {
                      toast.info('File picker requires Electron desktop build')
                      return
                    }
                    if (res.ok && res.path) patchParams({ sshPrivateKeyPath: res.path })
                  }}
                >
                  <FolderOpen className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Remote Command</Label>
            <VariableAutocompleteInput
              multiline
              rows={4}
              value={step.params.sshCommand || ''}
              onChange={(v) => patchParams({ sshCommand: v })}
              upstreamVariables={upstreamVariables}
              placeholder="systemctl restart edge && systemctl is-active edge"
              className="font-mono text-xs"
            />
          </div>

          <div className="grid grid-cols-4 gap-2">
            <div className="space-y-1">
              <Label className="text-[11px]">Stdout var</Label>
              <Input
                value={step.params.sshSaveStdoutAs || ''}
                onChange={(e) => patchParams({ sshSaveStdoutAs: e.target.value })}
                placeholder="sshOut"
                className="h-8 font-mono text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px]">Stderr var</Label>
              <Input
                value={step.params.sshSaveStderrAs || ''}
                onChange={(e) => patchParams({ sshSaveStderrAs: e.target.value })}
                placeholder="sshErr"
                className="h-8 font-mono text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px]">Exit code var</Label>
              <Input
                value={step.params.sshSaveExitCodeAs || ''}
                onChange={(e) => patchParams({ sshSaveExitCodeAs: e.target.value })}
                placeholder="sshCode"
                className="h-8 font-mono text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px]">Timeout (ms)</Label>
              <Input
                type="number"
                value={step.params.sshTimeoutMs ?? 15000}
                onChange={(e) => patchParams({ sshTimeoutMs: parseInt(e.target.value, 10) || 15000 })}
                className="h-8 font-mono text-xs"
              />
            </div>
          </div>

          <div className="flex items-center gap-2 pt-1">
            <Switch
              checked={step.params.sshFailOnNonZero !== false}
              onCheckedChange={(v) => patchParams({ sshFailOnNonZero: v })}
            />
            <Label className="text-xs">Fail step when exit code is non-zero</Label>
          </div>
        </div>
      )

    case 'PING_PORT': {
      const mode: ProbeMode = step.params.probeMode ?? 'tcp'
      return (
        <div className="rounded-xl border border-border/50 bg-muted/10 p-4 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Probe Mode</Label>
              <Select value={mode} onValueChange={(v) => patchParams({ probeMode: v as ProbeMode })}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="tcp">TCP Port Reachability</SelectItem>
                  <SelectItem value="http">HTTP Endpoint Health</SelectItem>
                  <SelectItem value="dns">DNS Host Resolution</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Timeout (ms)</Label>
              <Input
                type="number"
                min={200}
                value={step.params.probeTimeoutMs ?? 4000}
                onChange={(e) => patchParams({ probeTimeoutMs: parseInt(e.target.value, 10) || 4000 })}
                className="h-9 font-mono text-xs"
              />
            </div>
          </div>

          {mode === 'http' ? (
            <div className="grid grid-cols-[1fr_115px] gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Health URL</Label>
                <VariableAutocompleteInput
                  value={step.params.probeUrl || ''}
                  onChange={(v) => patchParams({ probeUrl: v })}
                  upstreamVariables={upstreamVariables}
                  placeholder="http://{{host}}:8080/health"
                  className="h-9 font-mono text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Expected Status</Label>
                <Input
                  type="number"
                  value={step.params.probeExpectedStatus ?? 200}
                  onChange={(e) => patchParams({ probeExpectedStatus: parseInt(e.target.value, 10) || 0 })}
                  className="h-9 font-mono text-xs"
                />
              </div>
            </div>
          ) : (
            <div className={mode === 'tcp' ? 'grid grid-cols-[1fr_110px] gap-2' : 'space-y-1'}>
              <div className="space-y-1">
                <Label className="text-xs">Host / Domain</Label>
                <VariableAutocompleteInput
                  value={step.params.probeHost || ''}
                  onChange={(v) => patchParams({ probeHost: v })}
                  upstreamVariables={upstreamVariables}
                  placeholder="{{host}}"
                  className="h-9 font-mono text-xs"
                />
              </div>
              {mode === 'tcp' && (
                <div className="space-y-1">
                  <Label className="text-xs">TCP Port</Label>
                  <VariableAutocompleteInput
                    value={step.params.probePort || ''}
                    onChange={(v) => patchParams({ probePort: v })}
                    upstreamVariables={upstreamVariables}
                    placeholder="80"
                    className="h-9 font-mono text-xs"
                  />
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Save alive (`true`/`false`) as</Label>
              <Input
                value={step.params.probeSaveAliveAs || ''}
                onChange={(e) => patchParams({ probeSaveAliveAs: e.target.value })}
                placeholder="isAlive"
                className="h-9 font-mono text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Save latency (ms) as</Label>
              <Input
                value={step.params.probeSaveLatencyAs || ''}
                onChange={(e) => patchParams({ probeSaveLatencyAs: e.target.value })}
                placeholder="latencyMs"
                className="h-9 font-mono text-xs"
              />
            </div>
          </div>

          <div className="flex items-center gap-2 pt-1">
            <Switch
              checked={step.params.probeFailIfDown === true}
              onCheckedChange={(v) => patchParams({ probeFailIfDown: v })}
            />
            <Label className="text-xs">Fail step when target is unreachable / down</Label>
          </div>
        </div>
      )
    }

    case 'WEBSOCKET':
      return (
        <div className="rounded-xl border border-border/50 bg-muted/10 p-4 space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">WebSocket URL (`ws://` or `wss://`)</Label>
            <VariableAutocompleteInput
              value={step.params.wsUrl || ''}
              onChange={(v) => patchParams({ wsUrl: v })}
              upstreamVariables={upstreamVariables}
              placeholder="wss://example.com/ws"
              className="h-9 font-mono text-xs"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Headers (optional, `Key: Value` per line)</Label>
            <Textarea
              value={step.params.wsHeaders || ''}
              onChange={(e) => patchParams({ wsHeaders: e.target.value })}
              rows={2}
              className="font-mono text-xs"
              placeholder="Authorization: Bearer {{secret.WS_TOKEN}}"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Payload to Send (optional)</Label>
            <VariableAutocompleteInput
              multiline
              rows={3}
              value={step.params.wsSendMessage || ''}
              onChange={(v) => patchParams({ wsSendMessage: v })}
              upstreamVariables={upstreamVariables}
              placeholder='{"subscribe":"events"}'
              className="font-mono text-xs"
            />
          </div>
          <div className="flex items-center gap-2">
            <Switch
              checked={step.params.wsWaitForMessage !== false}
              onCheckedChange={(v) => patchParams({ wsWaitForMessage: v })}
            />
            <Label className="text-xs">Wait for an incoming message before closing</Label>
          </div>
          {step.params.wsWaitForMessage !== false && (
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1">
                <Label className="text-[11px]">Match regex (opt)</Label>
                <Input
                  value={step.params.wsMatchRegex || ''}
                  onChange={(e) => patchParams({ wsMatchRegex: e.target.value })}
                  placeholder="status.*ok"
                  className="h-8 font-mono text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px]">Save reply as</Label>
                <Input
                  value={step.params.wsSaveAs || ''}
                  onChange={(e) => patchParams({ wsSaveAs: e.target.value })}
                  placeholder="wsMessage"
                  className="h-8 font-mono text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px]">Timeout (ms)</Label>
                <Input
                  type="number"
                  value={step.params.wsTimeoutMs ?? 8000}
                  onChange={(e) => patchParams({ wsTimeoutMs: parseInt(e.target.value, 10) || 8000 })}
                  className="h-8 font-mono text-xs"
                />
              </div>
            </div>
          )}
        </div>
      )

    case 'WEBHOOK_SEND': {
      const preset: WebhookPreset = step.params.webhookPreset ?? 'slack'
      const presetMeta = WEBHOOK_PRESETS.find((w) => w.value === preset)
      return (
        <div className="rounded-xl border border-border/50 bg-muted/10 p-4 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Platform Preset</Label>
              <Select value={preset} onValueChange={(v) => patchParams({ webhookPreset: v as WebhookPreset })}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {WEBHOOK_PRESETS.map((p) => (
                    <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Accent Color (Hex)</Label>
              <Input
                value={step.params.webhookColor || '#10b981'}
                onChange={(e) => patchParams({ webhookColor: e.target.value })}
                className="h-9 font-mono text-xs"
                placeholder="#10b981"
              />
            </div>
          </div>
          {presetMeta && <p className="text-[11px] text-muted-foreground">{presetMeta.hint}</p>}
          <div className="space-y-1">
            <Label className="text-xs">Webhook URL</Label>
            <VariableAutocompleteInput
              value={step.params.webhookUrl || ''}
              onChange={(v) => patchParams({ webhookUrl: v })}
              upstreamVariables={upstreamVariables}
              placeholder="{{secret.SLACK_WEBHOOK}}"
              className="h-9 font-mono text-xs"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Title (optional)</Label>
            <VariableAutocompleteInput
              value={step.params.webhookTitle || ''}
              onChange={(v) => patchParams({ webhookTitle: v })}
              upstreamVariables={upstreamVariables}
              placeholder="Deployment Status"
              className="h-9 font-mono text-xs"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Message / JSON Payload</Label>
            <VariableAutocompleteInput
              multiline
              rows={4}
              value={step.params.webhookMessage || ''}
              onChange={(v) => patchParams({ webhookMessage: v })}
              upstreamVariables={upstreamVariables}
              placeholder="Build finished in {{latencyMs}}ms"
              className="font-mono text-xs"
            />
          </div>
          <div className="grid grid-cols-2 gap-2 items-center">
            <div className="space-y-1">
              <Label className="text-xs">Save HTTP status as (optional)</Label>
              <Input
                value={step.params.webhookSaveStatusAs || ''}
                onChange={(e) => patchParams({ webhookSaveStatusAs: e.target.value })}
                placeholder="webhookStatus"
                className="h-8 font-mono text-xs"
              />
            </div>
            <div className="flex items-center gap-2 pt-4">
              <Switch
                checked={step.params.webhookFailOnError !== false}
                onCheckedChange={(v) => patchParams({ webhookFailOnError: v })}
              />
              <Label className="text-xs">Fail on non-2xx</Label>
            </div>
          </div>
        </div>
      )
    }

    case 'CSV_JSON': {
      const op: CsvJsonOp = step.params.csvJsonOp ?? 'csvToJson'
      const opMeta = CSV_JSON_OPS.find((o) => o.value === op)
      return (
        <div className="rounded-xl border border-border/50 bg-muted/10 p-4 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Operation</Label>
              <Select value={op} onValueChange={(v) => patchParams({ csvJsonOp: v as CsvJsonOp })}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CSV_JSON_OPS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Save result as</Label>
              <Input
                value={step.params.csvJsonSaveAs || ''}
                onChange={(e) => patchParams({ csvJsonSaveAs: e.target.value })}
                placeholder="rows"
                className="h-9 font-mono text-xs"
              />
            </div>
          </div>
          {opMeta && <p className="text-[11px] text-muted-foreground">{opMeta.hint}</p>}

          <div className="space-y-1">
            <Label className="text-xs">Input Data (CSV text or JSON array)</Label>
            <VariableAutocompleteInput
              multiline
              rows={3}
              value={step.params.csvJsonInput || ''}
              onChange={(v) => patchParams({ csvJsonInput: v })}
              upstreamVariables={upstreamVariables}
              placeholder="{{fileContent}}"
              className="font-mono text-xs"
            />
          </div>

          {(op === 'csvToJson' || op === 'jsonToCsv') && (
            <div className="grid grid-cols-2 gap-2 items-center">
              <div className="space-y-1">
                <Label className="text-xs">Delimiter</Label>
                <Input
                  value={step.params.csvDelimiter || ','}
                  onChange={(e) => patchParams({ csvDelimiter: e.target.value })}
                  className="h-8 font-mono text-xs w-24"
                />
              </div>
              {op === 'csvToJson' && (
                <div className="flex items-center gap-2 pt-4">
                  <Switch
                    checked={step.params.csvHasHeader !== false}
                    onCheckedChange={(v) => patchParams({ csvHasHeader: v })}
                  />
                  <Label className="text-xs">First row is header</Label>
                </div>
              )}
            </div>
          )}

          {op === 'filterArray' && (
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1">
                <Label className="text-[11px]">Field path</Label>
                <Input
                  value={step.params.csvFilterField || ''}
                  onChange={(e) => patchParams({ csvFilterField: e.target.value })}
                  placeholder="status"
                  className="h-8 font-mono text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px]">Operator</Label>
                <Select
                  value={step.params.csvFilterOp ?? 'eq'}
                  onValueChange={(v) => patchParams({ csvFilterOp: v as ConditionOp })}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CONDITION_OPS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-[11px]">Compare value</Label>
                <VariableAutocompleteInput
                  value={step.params.csvFilterValue || ''}
                  onChange={(v) => patchParams({ csvFilterValue: v })}
                  upstreamVariables={upstreamVariables}
                  placeholder="active"
                  className="h-8 font-mono text-xs"
                />
              </div>
            </div>
          )}

          {op === 'mapField' && (
            <div className="space-y-1">
              <Label className="text-xs">Property path to extract from each item</Label>
              <Input
                value={step.params.csvMapField || ''}
                onChange={(e) => patchParams({ csvMapField: e.target.value })}
                placeholder="email"
                className="h-9 font-mono text-xs"
              />
            </div>
          )}

          {op === 'sortArray' && (
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Sort by field (optional)</Label>
                <Input
                  value={step.params.csvSortField || ''}
                  onChange={(e) => patchParams({ csvSortField: e.target.value })}
                  placeholder="price"
                  className="h-9 font-mono text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Direction</Label>
                <Select
                  value={step.params.csvSortDir ?? 'asc'}
                  onValueChange={(v) => patchParams({ csvSortDir: v as 'asc' | 'desc' })}
                >
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="asc">Ascending (A→Z / 0→9)</SelectItem>
                    <SelectItem value="desc">Descending (Z→A / 9→0)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {op === 'aggregate' && (
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1">
                <Label className="text-[11px]">Aggregation</Label>
                <Select
                  value={step.params.csvAggOp ?? 'sum'}
                  onValueChange={(v) => patchParams({ csvAggOp: v as AggregateOp })}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="count">Count items</SelectItem>
                    <SelectItem value="sum">Sum</SelectItem>
                    <SelectItem value="avg">Average</SelectItem>
                    <SelectItem value="min">Minimum</SelectItem>
                    <SelectItem value="max">Maximum</SelectItem>
                    <SelectItem value="unique">Unique values</SelectItem>
                    <SelectItem value="join">Join strings</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-[11px]">Field path (opt)</Label>
                <Input
                  value={step.params.csvMapField || ''}
                  onChange={(e) => patchParams({ csvMapField: e.target.value })}
                  placeholder="amount"
                  className="h-8 font-mono text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px]">Join sep (if join)</Label>
                <Input
                  value={step.params.csvJoinSeparator ?? ', '}
                  onChange={(e) => patchParams({ csvJoinSeparator: e.target.value })}
                  className="h-8 font-mono text-xs"
                />
              </div>
            </div>
          )}

          {op === 'mergeJson' && (
            <div className="space-y-1">
              <Label className="text-xs">Second JSON Object / Array</Label>
              <VariableAutocompleteInput
                multiline
                rows={2}
                value={step.params.csvJsonInput2 || ''}
                onChange={(v) => patchParams({ csvJsonInput2: v })}
                upstreamVariables={upstreamVariables}
                placeholder='{"extra": true}'
                className="font-mono text-xs"
              />
            </div>
          )}
        </div>
      )
    }

    case 'CRYPTO_HASH': {
      const op: CryptoOp = step.params.cryptoOp ?? 'sha256'
      const opMeta = CRYPTO_OPS.find((c) => c.value === op)
      return (
        <div className="rounded-xl border border-border/50 bg-muted/10 p-4 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Operation</Label>
              <Select value={op} onValueChange={(v) => patchParams({ cryptoOp: v as CryptoOp })}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CRYPTO_OPS.map((c) => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Save output as</Label>
              <Input
                value={step.params.cryptoSaveAs || ''}
                onChange={(e) => patchParams({ cryptoSaveAs: e.target.value })}
                placeholder="hash"
                className="h-9 font-mono text-xs"
              />
            </div>
          </div>
          {opMeta && <p className="text-[11px] text-muted-foreground">{opMeta.hint}</p>}

          {op === 'randomToken' ? (
            <div className="space-y-1">
              <Label className="text-xs">Entropy Bytes (4–256)</Label>
              <Input
                type="number"
                min={4}
                max={256}
                value={step.params.cryptoByteLength ?? 24}
                onChange={(e) => patchParams({ cryptoByteLength: parseInt(e.target.value, 10) || 24 })}
                className="h-9 font-mono text-xs w-32"
              />
            </div>
          ) : (
            <div className="space-y-1">
              <Label className="text-xs">{op === 'jwtDecode' ? 'JWT Token' : 'Input Payload'}</Label>
              <VariableAutocompleteInput
                multiline
                rows={3}
                value={step.params.cryptoInput || ''}
                onChange={(v) => patchParams({ cryptoInput: v })}
                upstreamVariables={upstreamVariables}
                placeholder="{{httpBody}}"
                className="font-mono text-xs"
              />
            </div>
          )}

          {(op === 'hmacSha256' || op === 'hmacSha512') && (
            <div className="space-y-1">
              <Label className="text-xs">HMAC Secret Key</Label>
              <VariableAutocompleteInput
                value={step.params.cryptoSecret || ''}
                onChange={(v) => patchParams({ cryptoSecret: v })}
                upstreamVariables={upstreamVariables}
                placeholder="{{secret.API_SECRET}}"
                className="h-9 font-mono text-xs"
              />
            </div>
          )}
        </div>
      )
    }

    case 'DATETIME': {
      const op: DateTimeOp = step.params.dtOp ?? 'now'
      const opMeta = DATETIME_OPS.find((d) => d.value === op)
      return (
        <div className="rounded-xl border border-border/50 bg-muted/10 p-4 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Operation</Label>
              <Select value={op} onValueChange={(v) => patchParams({ dtOp: v as DateTimeOp })}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DATETIME_OPS.map((d) => (
                    <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Save result as</Label>
              <Input
                value={step.params.dtSaveAs || ''}
                onChange={(e) => patchParams({ dtSaveAs: e.target.value })}
                placeholder="now"
                className="h-9 font-mono text-xs"
              />
            </div>
          </div>
          {opMeta && <p className="text-[11px] text-muted-foreground">{opMeta.hint}</p>}

          {op !== 'now' && (
            <div className="space-y-1">
              <Label className="text-xs">{op === 'diff' ? 'Start Date / Epoch' : 'Input Date / Epoch (empty = now)'}</Label>
              <VariableAutocompleteInput
                value={step.params.dtInput || ''}
                onChange={(v) => patchParams({ dtInput: v })}
                upstreamVariables={upstreamVariables}
                placeholder="ISO date, unix ms, or empty for now"
                className="h-9 font-mono text-xs"
              />
            </div>
          )}

          {op === 'diff' && (
            <div className="space-y-1">
              <Label className="text-xs">End Date / Epoch</Label>
              <VariableAutocompleteInput
                value={step.params.dtInput2 || ''}
                onChange={(v) => patchParams({ dtInput2: v })}
                upstreamVariables={upstreamVariables}
                placeholder="Empty = now"
                className="h-9 font-mono text-xs"
              />
            </div>
          )}

          {(op === 'add' || op === 'diff') && (
            <div className={op === 'add' ? 'grid grid-cols-2 gap-2' : 'space-y-1'}>
              {op === 'add' && (
                <div className="space-y-1">
                  <Label className="text-xs">Amount (±)</Label>
                  <Input
                    type="number"
                    value={step.params.dtAmount ?? 1}
                    onChange={(e) => patchParams({ dtAmount: parseFloat(e.target.value) || 0 })}
                    className="h-9 font-mono text-xs"
                  />
                </div>
              )}
              <div className="space-y-1">
                <Label className="text-xs">Unit</Label>
                <Select
                  value={step.params.dtUnit ?? 'hours'}
                  onValueChange={(v) => patchParams({ dtUnit: v as DateTimeUnit })}
                >
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="seconds">Seconds</SelectItem>
                    <SelectItem value="minutes">Minutes</SelectItem>
                    <SelectItem value="hours">Hours</SelectItem>
                    <SelectItem value="days">Days</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {op !== 'diff' && (
            <div className="space-y-1.5">
              <Label className="text-xs">Output Format</Label>
              <Input
                value={step.params.dtFormat || 'ISO'}
                onChange={(e) => patchParams({ dtFormat: e.target.value })}
                className="h-9 font-mono text-xs"
                placeholder="ISO | YYYY-MM-DD HH:mm:ss | unixSec | unixMs"
              />
              <div className="flex flex-wrap gap-1">
                {['ISO', 'YYYY-MM-DD', 'YYYY-MM-DD HH:mm:ss', 'YYYYMMDD_HHmmss', 'unixSec', 'unixMs'].map((fmt) => (
                  <Button
                    key={fmt}
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-6 px-2 font-mono text-[10px]"
                    onClick={() => patchParams({ dtFormat: fmt })}
                  >
                    {fmt}
                  </Button>
                ))}
              </div>
            </div>
          )}
        </div>
      )
    }

    case 'CLIPBOARD': {
      const mode = step.params.clipboardMode ?? 'write'
      return (
        <div className="rounded-xl border border-border/50 bg-muted/10 p-4 space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">Mode</Label>
            <Select value={mode} onValueChange={(v) => patchParams({ clipboardMode: v as 'read' | 'write' })}>
              <SelectTrigger className="h-9 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="write">Write text to OS Clipboard</SelectItem>
                <SelectItem value="read">Read text from OS Clipboard</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {mode === 'write' ? (
            <div className="space-y-1">
              <Label className="text-xs">Text / Template to Copy</Label>
              <VariableAutocompleteInput
                multiline
                rows={4}
                value={step.params.clipboardText || ''}
                onChange={(v) => patchParams({ clipboardText: v })}
                upstreamVariables={upstreamVariables}
                placeholder="{{epcs}}"
                className="font-mono text-xs"
              />
            </div>
          ) : (
            <div className="space-y-1">
              <Label className="text-xs">Save clipboard contents as</Label>
              <Input
                value={step.params.clipboardSaveAs || 'clipboardText'}
                onChange={(e) => patchParams({ clipboardSaveAs: e.target.value })}
                className="h-9 font-mono text-xs"
              />
            </div>
          )}
        </div>
      )
    }

    case 'OPEN_APP': {
      const mode = step.params.openMode ?? 'url'
      return (
        <div className="rounded-xl border border-border/50 bg-muted/10 p-4 space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">Action</Label>
            <Select value={mode} onValueChange={(v) => patchParams({ openMode: v as 'url' | 'file' | 'reveal' })}>
              <SelectTrigger className="h-9 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="url">Open URL in Default Browser</SelectItem>
                <SelectItem value="file">Open File / Folder with Default App</SelectItem>
                <SelectItem value="reveal">Reveal File in Explorer / Finder</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{mode === 'url' ? 'URL' : 'File / Folder Path'}</Label>
            <VariableAutocompleteInput
              value={step.params.openTarget || ''}
              onChange={(v) => patchParams({ openTarget: v })}
              upstreamVariables={upstreamVariables}
              placeholder={mode === 'url' ? 'https://example.com' : 'C:\\export\\report.csv'}
              className="h-9 font-mono text-xs"
            />
          </div>
        </div>
      )
    }

    case 'PROMPT_INPUT': {
      const mode: PromptInputMode = step.params.promptMode ?? 'text'
      return (
        <div className="rounded-xl border border-border/50 bg-muted/10 p-4 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Prompt Type</Label>
              <Select value={mode} onValueChange={(v) => patchParams({ promptMode: v as PromptInputMode })}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="text">Text Input</SelectItem>
                  <SelectItem value="select">Dropdown Choice</SelectItem>
                  <SelectItem value="confirm">Yes / No Confirmation</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Save response as</Label>
              <Input
                value={step.params.promptSaveAs || 'userInput'}
                onChange={(e) => patchParams({ promptSaveAs: e.target.value })}
                className="h-9 font-mono text-xs"
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Dialog Title</Label>
            <VariableAutocompleteInput
              value={step.params.promptTitle || ''}
              onChange={(v) => patchParams({ promptTitle: v })}
              upstreamVariables={upstreamVariables}
              placeholder="Input Required"
              className="h-9 text-xs"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Message Shown to User</Label>
            <VariableAutocompleteInput
              multiline
              rows={2}
              value={step.params.promptMessage || ''}
              onChange={(v) => patchParams({ promptMessage: v })}
              upstreamVariables={upstreamVariables}
              placeholder="Approve deploy to {{host}}?"
              className="text-xs"
            />
          </div>

          {mode === 'select' && (
            <div className="space-y-1">
              <Label className="text-xs">Options (comma or newline separated)</Label>
              <Textarea
                value={step.params.promptOptions || ''}
                onChange={(e) => patchParams({ promptOptions: e.target.value })}
                rows={2}
                placeholder="Staging, Production, QA"
                className="font-mono text-xs"
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Default value (optional)</Label>
              <Input
                value={step.params.promptDefault || ''}
                onChange={(e) => patchParams({ promptDefault: e.target.value })}
                className="h-8 font-mono text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">If user cancels</Label>
              <Select
                value={step.params.promptCancelBehavior ?? 'abort'}
                onValueChange={(v) => patchParams({ promptCancelBehavior: v as 'abort' | 'empty' })}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="abort">Fail / Abort step</SelectItem>
                  <SelectItem value="empty">Continue with empty / false</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      )
    }

    case 'PARALLEL_BRANCH': {
      const branches: ParallelBranchItem[] = step.params.parallelBranches ?? [
        { label: 'Branch A' },
        { label: 'Branch B' },
      ]
      const updateBranches = (next: ParallelBranchItem[]) => patchParams({ parallelBranches: next })
      return (
        <div className="rounded-xl border border-border/50 bg-muted/10 p-4 space-y-3">
          <p className="text-xs text-muted-foreground">
            Runs all wired branch paths concurrently, then continues through the green{' '}
            <span className="font-semibold text-emerald-500">AFTER ALL</span> port.
          </p>
          <div className="space-y-1">
            <Label className="text-xs">Join Mode</Label>
            <Select
              value={step.params.parallelWaitMode ?? 'all'}
              onValueChange={(v) => patchParams({ parallelWaitMode: v as ParallelWaitMode })}
            >
              <SelectTrigger className="h-9 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Wait for all — fail if any branch fails</SelectItem>
                <SelectItem value="allSettled">Wait for all — continue even if a branch fails</SelectItem>
                <SelectItem value="race">Race — continue as soon as first branch finishes</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Concurrent Branches ({branches.length})</Label>
            {branches.map((b, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <span className="w-20 shrink-0 rounded bg-cyan-500/15 px-1.5 py-1 text-center font-mono text-[10px] font-semibold text-cyan-600 dark:text-cyan-400">
                  branch {i + 1}
                </span>
                <Input
                  value={b.label ?? ''}
                  onChange={(e) =>
                    updateBranches(branches.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))
                  }
                  placeholder={`Branch ${i + 1}`}
                  className="h-8 text-xs flex-1"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={branches.length <= 2}
                  className="h-8 w-8 shrink-0 text-destructive disabled:opacity-30"
                  onClick={() => updateBranches(branches.filter((_, j) => j !== i))}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
            {branches.length < 6 && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 gap-1 text-xs"
                onClick={() => updateBranches([...branches, { label: `Branch ${branches.length + 1}` }])}
              >
                <Plus className="h-3 w-3" /> Add Branch
              </Button>
            )}
          </div>
        </div>
      )
    }

    default:
      return null
  }
}
