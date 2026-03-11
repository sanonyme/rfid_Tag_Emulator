import { useState, useRef, useCallback } from 'react'
import { Textarea, type TextareaProps } from './ui/textarea'
import { Upload } from 'lucide-react'
import { cn } from '@/lib/utils'

interface DropTextareaProps extends TextareaProps {
  onFileImport: (content: string) => void
}

function looksLikeHeader(line: string): boolean {
  const lower = line.toLowerCase()
  return /^(upc|epc|barcode|code|serial|sku|gtin|item|tid|tag)/i.test(lower)
    || lower.includes(',') && /[a-z]{3,}/i.test(lower.split(',')[0]) && !/^\d/.test(lower)
}

function parseFileContent(raw: string): string {
  const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  if (lines.length === 0) return ''

  const start = looksLikeHeader(lines[0]) ? 1 : 0
  return lines.slice(start).join('\n')
}

export function DropTextarea({ onFileImport, className, ...props }: DropTextareaProps) {
  const [dragging, setDragging] = useState(false)
  const dragCounter = useRef(0)

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounter.current++
    if (e.dataTransfer.types.includes('Files')) {
      setDragging(true)
    }
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounter.current--
    if (dragCounter.current === 0) {
      setDragging(false)
    }
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragging(false)
    dragCounter.current = 0

    const files = Array.from(e.dataTransfer.files)
    const valid = files.filter((f) =>
      f.name.endsWith('.txt') || f.name.endsWith('.csv') || f.type === 'text/plain' || f.type === 'text/csv'
    )

    if (valid.length === 0) return

    valid.forEach((file) => {
      const reader = new FileReader()
      reader.onload = () => {
        const parsed = parseFileContent(reader.result as string)
        if (parsed) onFileImport(parsed)
      }
      reader.readAsText(file)
    })
  }, [onFileImport])

  return (
    <div
      className="relative"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <Textarea
        className={cn(
          className,
          dragging && "border-primary border-dashed border-2 opacity-50"
        )}
        {...props}
      />
      {dragging && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-md bg-primary/10 border-2 border-dashed border-primary pointer-events-none">
          <Upload className="w-6 h-6 text-primary" />
          <span className="text-xs font-medium text-primary">Drop .csv or .txt file</span>
        </div>
      )}
    </div>
  )
}
