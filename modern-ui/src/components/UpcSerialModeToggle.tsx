import { Button } from './ui/button'
import { cn } from '@/lib/utils'

interface UpcSerialModeToggleProps {
  continuesAcrossLines: boolean
  onContinuesAcrossLinesChange: (value: boolean) => void
  className?: string
  idPrefix?: string
}

/** Choose whether SGTIN serials reset on each UPC line or continue across the list. */
export function UpcSerialModeToggle({
  continuesAcrossLines,
  onContinuesAcrossLinesChange,
  className,
  idPrefix = 'upc-serial',
}: UpcSerialModeToggleProps) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <p className="text-[11px] font-medium text-muted-foreground">Serial across UPC lines</p>
      <div
        className="flex rounded-lg bg-muted/35 p-1 ring-1 ring-border/25"
        role="group"
        aria-label="Serial numbering across UPC lines"
      >
        <Button
          type="button"
          id={`${idPrefix}-per-line`}
          variant={continuesAcrossLines ? 'ghost' : 'default'}
          size="sm"
          className={cn(
            'h-8 flex-1 rounded-md text-xs shadow-none',
            !continuesAcrossLines && 'shadow-sm',
          )}
          onClick={() => onContinuesAcrossLinesChange(false)}
        >
          Reset per line
        </Button>
        <Button
          type="button"
          id={`${idPrefix}-continue`}
          variant={continuesAcrossLines ? 'default' : 'ghost'}
          size="sm"
          className={cn(
            'h-8 flex-1 rounded-md text-xs shadow-none',
            continuesAcrossLines && 'shadow-sm',
          )}
          onClick={() => onContinuesAcrossLinesChange(true)}
        >
          Continue
        </Button>
      </div>
      <p className="text-[11px] leading-relaxed text-muted-foreground">
        {continuesAcrossLines
          ? 'Each new UPC line picks up where the previous line left off.'
          : 'Every UPC line starts from the starting serial (count still increments within a line).'}
      </p>
    </div>
  )
}
