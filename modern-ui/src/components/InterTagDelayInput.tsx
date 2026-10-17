import type { ClipboardEvent, KeyboardEvent } from 'react'
import { Input } from '@/components/ui/input'
import { sanitizeInterTagDelayInput } from '@/lib/automation-template'
import { cn } from '@/lib/utils'

function allowDelayKey(e: KeyboardEvent<HTMLInputElement>) {
  if (e.ctrlKey || e.metaKey || e.altKey) return
  const nav = ['Backspace', 'Delete', 'Tab', 'Escape', 'Enter', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End']
  if (nav.includes(e.key)) return
  if (/^\d$/.test(e.key)) return
  e.preventDefault()
}

type Props = {
  id?: string
  value: string
  onValueChange: (value: string) => void
  className?: string
  placeholder?: string
  disabled?: boolean
}

/** Inter-tag delay: digits only (no minus, decimals, or letters). */
export function InterTagDelayInput({ id, value, onValueChange, className, placeholder, disabled }: Props) {
  const commit = (next: string) => onValueChange(sanitizeInterTagDelayInput(next))

  const onPaste = (e: ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault()
    const paste = sanitizeInterTagDelayInput(e.clipboardData.getData('text'))
    const el = e.currentTarget
    const start = el.selectionStart ?? value.length
    const end = el.selectionEnd ?? value.length
    commit(value.slice(0, start) + paste + value.slice(end))
  }

  return (
    <Input
      id={id}
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      autoComplete="off"
      spellCheck={false}
      value={value}
      disabled={disabled}
      placeholder={placeholder}
      onKeyDown={allowDelayKey}
      onChange={(e) => commit(e.target.value)}
      onPaste={onPaste}
      className={cn('font-mono tabular-nums', className)}
    />
  )
}
