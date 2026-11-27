import { useState, useEffect } from 'react'
import { MessageSquare } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select'
import type { PromptInputMode } from '@/lib/automation-types'

export interface PromptRequestState {
  mode: PromptInputMode
  title: string
  message: string
  defaultValue: string
  options: string[]
  resolve: (value: string | null) => void
}

export function AutomationPromptModal({
  prompt,
}: {
  prompt: PromptRequestState | null
}) {
  const [value, setValue] = useState('')

  useEffect(() => {
    if (!prompt) return
    if (prompt.mode === 'select') {
      setValue(prompt.defaultValue || prompt.options[0] || '')
    } else {
      setValue(prompt.defaultValue || '')
    }
  }, [prompt])

  if (!prompt) return null

  const submit = (val: string | null) => {
    prompt.resolve(val)
  }

  return (
    <Dialog open onOpenChange={(open) => !open && submit(null)}>
      <DialogContent className="max-w-md bg-background">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <MessageSquare className="h-4 w-4 text-amber-500" />
            {prompt.title || 'Workflow Input Required'}
          </DialogTitle>
          <DialogDescription className="text-xs whitespace-pre-wrap pt-1 text-foreground/90">
            {prompt.message}
          </DialogDescription>
        </DialogHeader>

        {prompt.mode === 'text' && (
          <div className="space-y-1.5 py-2">
            <Label className="text-xs">Response</Label>
            <Input
              autoFocus
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submit(value)
              }}
              placeholder="Enter value…"
              className="h-9 font-mono text-xs"
            />
          </div>
        )}

        {prompt.mode === 'select' && (
          <div className="space-y-1.5 py-2">
            <Label className="text-xs">Select Option</Label>
            <Select value={value} onValueChange={setValue}>
              <SelectTrigger className="h-9 text-xs">
                <SelectValue placeholder="Choose…" />
              </SelectTrigger>
              <SelectContent>
                {prompt.options.map((opt) => (
                  <SelectItem key={opt} value={opt} className="text-xs font-mono">
                    {opt}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <DialogFooter className="gap-2">
          {prompt.mode === 'confirm' ? (
            <>
              <Button type="button" variant="outline" size="sm" onClick={() => submit('false')}>
                No
              </Button>
              <Button type="button" size="sm" onClick={() => submit('true')}>
                Yes, Continue
              </Button>
            </>
          ) : (
            <>
              <Button type="button" variant="outline" size="sm" onClick={() => submit(null)}>
                Cancel
              </Button>
              <Button type="button" size="sm" onClick={() => submit(value)}>
                Submit
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
