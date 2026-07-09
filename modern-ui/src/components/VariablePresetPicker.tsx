import { useMemo, useState } from 'react'
import { Button } from './ui/button'
import { Label } from './ui/label'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from './ui/select'
import {
  STANDARD_AUTOMATION_VARS,
  STANDARD_VAR_GROUP_LABELS,
  templateToken,
  type StandardVarGroup,
} from '@/lib/automation-template'
import { cn } from '@/lib/utils'
import { Braces } from 'lucide-react'

type InsertMode = 'append' | 'replace'

interface VariablePresetPickerProps {
  /** Current field value — used for append */
  value?: string
  onInsert: (nextValue: string, token: string) => void
  /** Prefer these variables at the top of the list (e.g. epcs for EPC List) */
  preferred?: string[]
  /** append = add token to end; replace = set field to token only */
  mode?: InsertMode
  className?: string
  /** Compact single-row for tight forms */
  compact?: boolean
}

const GROUP_ORDER: StandardVarGroup[] = ['tags', 'connection', 'ocr']

export function VariablePresetPicker({
  value = '',
  onInsert,
  preferred = [],
  mode = 'append',
  className,
  compact = false,
}: VariablePresetPickerProps) {
  const [selectKey, setSelectKey] = useState(0)

  const grouped = useMemo(() => {
    const prefSet = new Set(preferred)
    const preferredVars = STANDARD_AUTOMATION_VARS.filter((v) => prefSet.has(v.name))
    const rest = STANDARD_AUTOMATION_VARS.filter((v) => !prefSet.has(v.name))

    const byGroup = (list: typeof STANDARD_AUTOMATION_VARS) => {
      const map = new Map<StandardVarGroup, typeof STANDARD_AUTOMATION_VARS>()
      for (const g of GROUP_ORDER) map.set(g, [])
      for (const v of list) {
        const arr = map.get(v.group) ?? []
        arr.push(v)
        map.set(v.group, arr)
      }
      return GROUP_ORDER.map((g) => ({ group: g, vars: map.get(g) ?? [] })).filter((x) => x.vars.length > 0)
    }

    return {
      preferred: preferredVars,
      groups: byGroup(rest.length ? rest : STANDARD_AUTOMATION_VARS.filter((v) => !prefSet.has(v.name))),
    }
  }, [preferred])

  const insert = (name: string) => {
    const token = templateToken(name)
    if (mode === 'replace' || !value.trim()) {
      onInsert(token, token)
    } else {
      const sep = value.endsWith('\n') || value.endsWith(' ') ? '' : value.includes('\n') ? '\n' : ''
      onInsert(`${value}${sep}${token}`, token)
    }
    setSelectKey((k) => k + 1)
  }

  return (
    <div className={cn('space-y-1.5', className)}>
      {!compact && (
        <Label className="text-[11px] text-muted-foreground flex items-center gap-1">
          <Braces className="h-3 w-3" />
          Insert app variable
        </Label>
      )}
      <div className="flex flex-wrap items-center gap-1.5">
        {preferred.map((name) => {
          const meta = STANDARD_AUTOMATION_VARS.find((v) => v.name === name)
          if (!meta) return null
          return (
            <Button
              key={name}
              type="button"
              variant="secondary"
              size="sm"
              className="h-7 px-2 text-[11px] font-mono"
              title={`${meta.description}\nSet by: ${meta.setBy}`}
              onClick={() => insert(name)}
            >
              {templateToken(name)}
            </Button>
          )
        })}
        <Select
          key={selectKey}
          onValueChange={(name) => {
            if (name) insert(name)
          }}
        >
          <SelectTrigger className={cn('h-7 text-[11px]', preferred.length ? 'w-[160px]' : 'w-full max-w-xs')}>
            <SelectValue placeholder={compact ? 'Insert {{var}}…' : 'More variables…'} />
          </SelectTrigger>
          <SelectContent className="max-h-72">
            {grouped.preferred.length > 0 && (
              <SelectGroup>
                <SelectLabel>Suggested</SelectLabel>
                {grouped.preferred.map((v) => (
                  <SelectItem key={v.name} value={v.name} className="text-xs font-mono">
                    {`${templateToken(v.name)} — ${v.label}`}
                  </SelectItem>
                ))}
              </SelectGroup>
            )}
            {grouped.groups.map(({ group, vars }) => (
              <SelectGroup key={group}>
                <SelectLabel>{STANDARD_VAR_GROUP_LABELS[group]}</SelectLabel>
                {vars.map((v) => (
                  <SelectItem key={v.name} value={v.name} className="text-xs font-mono" title={`${v.description} · ${v.setBy}`}>
                    {`${templateToken(v.name)} — ${v.label}`}
                  </SelectItem>
                ))}
              </SelectGroup>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}

/** Full reference panel for Set Variable / Run Script help. */
export function StandardVariablesReference({ showEnv = false }: { showEnv?: boolean }) {
  return (
    <div className="rounded-lg border border-border/40 bg-muted/20 p-3 space-y-2">
      <p className="text-[11px] font-medium text-foreground">App variables (auto-set)</p>
      <ul className="space-y-1.5">
        {STANDARD_AUTOMATION_VARS.map((v) => (
          <li key={v.name} className="text-[11px] leading-snug">
            <code className="font-mono text-foreground">{templateToken(v.name)}</code>
            {showEnv && (
              <code className="font-mono text-muted-foreground ml-1.5">→ $env:{v.envName}</code>
            )}
            <span className="text-muted-foreground"> — {v.description}</span>
            <span className="block text-[10px] text-muted-foreground/80 pl-0.5">{v.setBy}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
