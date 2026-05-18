import { useCallback } from 'react'

/**
 * Keyboard shortcuts that fire from inside a tag-list textarea.
 *
 * - `save-preset`  → Ctrl/⌘ + S
 * - `load-preset`  → Ctrl/⌘ + L
 * - `send`         → Ctrl/⌘ + Enter
 * - `loop`         → Ctrl/⌘ + Shift + Enter
 *
 * The matcher is kept as a plain function so we can unit-test it without a DOM.
 * Alt is intentionally rejected so we don't steal browser/Electron shortcuts
 * like Alt+Enter (window menus on Windows).
 */
export type TagListShortcut = 'save-preset' | 'load-preset' | 'send' | 'loop'

export interface ShortcutEventLike {
  ctrlKey: boolean
  metaKey: boolean
  shiftKey: boolean
  altKey: boolean
  key: string
}

export function matchTagListShortcut(e: ShortcutEventLike): TagListShortcut | null {
  if (e.altKey) return null
  if (!(e.ctrlKey || e.metaKey)) return null
  const key = e.key.toLowerCase()
  if (key === 's' && !e.shiftKey) return 'save-preset'
  if (key === 'l' && !e.shiftKey) return 'load-preset'
  if (key === 'enter' && e.shiftKey) return 'loop'
  if (key === 'enter' && !e.shiftKey) return 'send'
  return null
}

export interface TagListShortcutHandlers {
  onSavePreset?: () => void
  onLoadPreset?: () => void
  onSend?: () => void
  onLoop?: () => void
}

/**
 * Returns a stable `onKeyDown` handler suitable for `<textarea>` / `<input>`.
 * Each fired shortcut calls preventDefault so Electron's default `Ctrl+S`
 * "Save Page" never reaches the host.
 */
export function useTagListShortcuts({
  onSavePreset,
  onLoadPreset,
  onSend,
  onLoop,
}: TagListShortcutHandlers): React.KeyboardEventHandler<HTMLElement> {
  return useCallback(
    (e: React.KeyboardEvent<HTMLElement>) => {
      const which = matchTagListShortcut(e)
      if (!which) return
      if (which === 'save-preset' && onSavePreset) {
        e.preventDefault()
        onSavePreset()
      } else if (which === 'load-preset' && onLoadPreset) {
        e.preventDefault()
        onLoadPreset()
      } else if (which === 'send' && onSend) {
        e.preventDefault()
        onSend()
      } else if (which === 'loop' && onLoop) {
        e.preventDefault()
        onLoop()
      }
    },
    [onSavePreset, onLoadPreset, onSend, onLoop],
  )
}
