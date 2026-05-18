import { useState } from 'react'
import { Maximize2 } from 'lucide-react'
import { DropTextarea } from './DropTextarea'
import { Button } from './ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from './ui/dialog'
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip'
import { cn } from '@/lib/utils'

import type { TagListKind } from '@/lib/csv-import'

export interface ExpandableTagFieldProps {
  dialogTitle: string
  dialogDescription?: string
  value: string
  onChange: React.ChangeEventHandler<HTMLTextAreaElement>
  onFileImport: (content: string) => void
  placeholder?: string
  compactClassName?: string
  /** Drives smart CSV column reordering on dropped files. */
  kind?: TagListKind
  /** Forwarded to the underlying textareas so callers can install keyboard shortcuts. */
  onKeyDown?: React.KeyboardEventHandler<HTMLTextAreaElement>
}

export function ExpandableTagField({
  dialogTitle,
  dialogDescription,
  value,
  onChange,
  onFileImport,
  placeholder,
  compactClassName,
  kind,
  onKeyDown,
}: ExpandableTagFieldProps) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <div
        className={cn(
          'group/expand relative rounded-md transition-shadow',
          'ring-1 ring-transparent hover:ring-border/80 focus-within:ring-primary/25',
          'hover:shadow-sm focus-within:shadow-sm',
        )}
      >
        <DropTextarea
          value={value}
          onChange={onChange}
          onFileImport={onFileImport}
          kind={kind}
          placeholder={placeholder}
          onKeyDown={onKeyDown}
          className={cn(
            compactClassName,
            'pr-11',
            'transition-[background-color] duration-200 group-hover/expand:bg-muted/20',
          )}
        />

        {/* Touch: subtle always-on affordance; mouse: show on hover / keyboard focus inside field */}
        <div
          className={cn(
            'pointer-events-none absolute right-1.5 top-1.5 z-10 flex',
            'opacity-60 sm:opacity-0 sm:scale-95',
            'sm:group-hover/expand:opacity-100 sm:group-hover/expand:scale-100',
            'sm:group-focus-within/expand:opacity-100 sm:group-focus-within/expand:scale-100',
            'transition-all duration-200 ease-out',
          )}
        >
          <Tooltip delayDuration={400}>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="secondary"
                size="icon"
                className={cn(
                  'pointer-events-auto h-8 w-8 shrink-0 rounded-md',
                  'border border-border/60 bg-background/90 shadow-sm backdrop-blur-sm',
                  'hover:bg-accent hover:text-accent-foreground',
                  'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                )}
                aria-label="Open full editor"
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  setOpen(true)
                }}
              >
                <Maximize2 className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="left" className="max-w-[14rem] text-xs">
              Expand to full editor
            </TooltipContent>
          </Tooltip>
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          data-tag-expand-dialog
          className={cn(
            'flex max-h-[90vh] w-[min(96vw,56rem)] max-w-none flex-col gap-0 overflow-hidden p-0',
            'sm:max-h-[88vh]',
          )}
        >
          <DialogHeader className="shrink-0 space-y-1 border-b border-border/60 bg-muted/20 px-6 py-4 pr-14 text-left">
            <DialogTitle className="text-base font-semibold leading-tight">
              {dialogTitle}
            </DialogTitle>
            {dialogDescription ? (
              <DialogDescription className="text-xs leading-relaxed sm:text-sm">
                {dialogDescription}
              </DialogDescription>
            ) : null}
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-auto p-4 sm:p-6">
            <DropTextarea
              value={value}
              onChange={onChange}
              onFileImport={onFileImport}
              kind={kind}
              placeholder={placeholder}
              onKeyDown={onKeyDown}
              className={cn(
                'font-mono text-sm',
                'min-h-[min(58vh,560px)] w-full resize-y rounded-lg',
                'border border-border bg-background shadow-inner',
              )}
              autoFocus
            />
            <p className="mt-3 text-[11px] text-muted-foreground sm:text-xs">
              Drop a .txt or .csv file to append lines. Escape or the close control returns to the compact view.
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
