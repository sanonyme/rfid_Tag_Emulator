import { useMemo } from 'react'

import { cn } from '@/lib/utils'

import { useSettings } from '@/lib/settings-context'

import { requestOpenSettings } from '@/lib/settings-navigation'

import {

  analyzeUpcDigits,

  analyzeUpcListCheckDigits,

  extractUpcDigitsFromLine,

  getLineAtIndex,

  type UpcCheckDigitStatus,

} from '@/lib/upc-check-digit'

import { HintInfoPopover } from './HintInfoPopover'



interface UpcCheckDigitHintProps {

  value: string

  /** 1-based line index where the textarea cursor sits. */

  activeLine: number

  className?: string

}



const SETTINGS_HINT =

  'Live GTIN check-digit hints are on by default. You can turn them off in Settings → UPC → Live check-digit hints.'



function StatusBanner({ status }: { status: UpcCheckDigitStatus }) {

  if (status.kind === 'hint13') {

    return (

      <p className="text-[11px] leading-relaxed text-muted-foreground">

        Calculated check digit{' '}

        <span className="rounded-md bg-primary/10 px-1.5 py-0.5 font-mono text-xs font-semibold tabular-nums text-primary ring-1 ring-primary/15">

          {status.calculatedCheck}

        </span>

      </p>

    )

  }



  if (status.kind === 'valid14') {

    return (

      <p className="text-[11px] leading-snug text-emerald-800 dark:text-emerald-300">

        Check digit is valid.

      </p>

    )

  }



  if (status.kind === 'invalid14') {

    return (

      <p className="text-[11px] leading-snug text-amber-900 dark:text-amber-200">

        Check digit mismatch (expected {status.expected}, got {status.provided}). You can still send — EPCs use

        the digits as entered.

      </p>

    )

  }



  return null

}



function CheckDigitHintPanel({

  children,

  tone = 'neutral',

}: {

  children: React.ReactNode

  tone?: 'neutral' | 'valid' | 'invalid'

}) {

  return (

    <div

      className={cn(

        'rounded-lg border px-2.5 py-2 ring-1',

        tone === 'valid' &&

          'border-emerald-500/30 bg-emerald-500/[0.06] ring-emerald-500/15',

        tone === 'invalid' &&

          'border-amber-500/40 bg-amber-500/[0.06] ring-amber-500/15',

        tone === 'neutral' && 'border-border/35 bg-muted/15 ring-border/15',

      )}

    >

      <div className="flex items-start gap-2">

        <div className="min-w-0 flex-1 space-y-2">{children}</div>

        <HintInfoPopover

          description={SETTINGS_HINT}

          actionLabel="Turn off in Settings"

          onAction={() => requestOpenSettings('upcCheckDigitHints')}

        />

      </div>

    </div>

  )

}



/**

 * Live GTIN check-digit hint for UPC tag-list textareas (Decoder tab style).

 * Shows feedback for the active line; lists other lines with mismatches when present.

 */

export function UpcCheckDigitHint({ value, activeLine, className }: UpcCheckDigitHintProps) {

  const { settings } = useSettings()

  const enabled = settings.upcCheckDigitHintsEnabled ?? true



  const activeStatus = useMemo(() => {

    const line = getLineAtIndex(value, activeLine).trim()

    if (!line) return { kind: 'none' } as const

    return analyzeUpcDigits(extractUpcDigitsFromLine(line))

  }, [value, activeLine])



  const otherInvalidLines = useMemo(() => {

    return analyzeUpcListCheckDigits(value).filter(

      (entry) => entry.lineNumber !== activeLine && entry.status.kind === 'invalid14',

    )

  }, [value, activeLine])



  if (!enabled) return null



  if (activeStatus.kind === 'none' && otherInvalidLines.length === 0) return null



  const panelTone =

    activeStatus.kind === 'valid14'

      ? 'valid'

      : activeStatus.kind === 'invalid14' || otherInvalidLines.length > 0

        ? 'invalid'

        : 'neutral'



  return (

    <div className={cn('space-y-2', className)}>

      <CheckDigitHintPanel tone={panelTone}>

        {activeStatus.kind !== 'none' && <StatusBanner status={activeStatus} />}

        {otherInvalidLines.length > 0 && (

          <ul className="space-y-1 text-[11px] leading-snug text-amber-800 dark:text-amber-200">

            {otherInvalidLines.map((entry) => {

              if (entry.status.kind !== 'invalid14') return null

              return (

                <li key={entry.lineNumber}>

                  Line {entry.lineNumber}: check digit mismatch (expected {entry.status.expected}).

                </li>

              )

            })}

          </ul>

        )}

      </CheckDigitHintPanel>

    </div>

  )

}


