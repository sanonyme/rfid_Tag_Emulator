import { useCallback, useEffect, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type MouseEvent as ReactMouseEvent } from 'react'

export type SftpColKey = 'name' | 'size' | 'changed' | 'rights' | 'owner'

/** @deprecated Prefer SftpColKey — kept for call sites that only resize meta cols. */
export type SftpMetaColKey = Exclude<SftpColKey, 'name'>

export type SftpColumnWidths = Record<SftpColKey, number>

export const SFTP_COL_WIDTH_DEFAULTS: SftpColumnWidths = {
  name: 200,
  size: 80,
  changed: 156,
  rights: 100,
  owner: 72,
}

const SFTP_COL_WIDTH_MIN: SftpColumnWidths = {
  name: 140,
  size: 56,
  changed: 110,
  rights: 72,
  owner: 56,
}

const SFTP_COL_WIDTH_MAX: SftpColumnWidths = {
  name: 900,
  size: 220,
  changed: 320,
  rights: 200,
  owner: 160,
}

/** Bumped when layout model changed (Name = flex fill). */
const STORAGE_KEY = 'zeus-sftp-column-widths-v4'

function clamp(key: SftpColKey, width: number): number {
  return Math.round(Math.min(SFTP_COL_WIDTH_MAX[key], Math.max(SFTP_COL_WIDTH_MIN[key], width)))
}

function readStoredWidths(): SftpColumnWidths {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...SFTP_COL_WIDTH_DEFAULTS }
    const parsed = JSON.parse(raw) as Partial<SftpColumnWidths>
    return {
      name: clamp('name', Number(parsed.name) || SFTP_COL_WIDTH_DEFAULTS.name),
      size: clamp('size', Number(parsed.size) || SFTP_COL_WIDTH_DEFAULTS.size),
      changed: clamp('changed', Number(parsed.changed) || SFTP_COL_WIDTH_DEFAULTS.changed),
      rights: clamp('rights', Number(parsed.rights) || SFTP_COL_WIDTH_DEFAULTS.rights),
      owner: clamp('owner', Number(parsed.owner) || SFTP_COL_WIDTH_DEFAULTS.owner),
    }
  } catch {
    return { ...SFTP_COL_WIDTH_DEFAULTS }
  }
}

let sharedWidths: SftpColumnWidths =
  typeof window === 'undefined' ? { ...SFTP_COL_WIDTH_DEFAULTS } : readStoredWidths()
const listeners = new Set<(next: SftpColumnWidths) => void>()

function publishWidths(next: SftpColumnWidths) {
  sharedWidths = next
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    /* ignore quota */
  }
  for (const listener of listeners) listener(next)
}

export function sftpVisibleColOrder(opts: {
  showUnixMeta?: boolean
  local?: boolean
} = {}): SftpColKey[] {
  if (opts.local) return ['name', 'size', 'changed', 'rights']
  if (opts.showUnixMeta === false) return ['name', 'size', 'changed']
  return ['name', 'size', 'changed', 'rights', 'owner']
}

/**
 * Name fills leftover panel width (`1fr`); meta columns are fixed px and resizable.
 * Header + every row must use this exact template so columns stay aligned.
 */
export function sftpColumnGridStyle(
  widths: SftpColumnWidths,
  opts: { selectMode?: boolean; showUnixMeta?: boolean; local?: boolean } = {},
): CSSProperties {
  const tracks: string[] = []
  if (opts.selectMode) tracks.push('14px')
  for (const key of sftpVisibleColOrder(opts)) {
    if (key === 'name') {
      tracks.push(`minmax(${SFTP_COL_WIDTH_MIN.name}px, 1fr)`)
    } else {
      tracks.push(`${widths[key]}px`)
    }
  }
  return {
    display: 'grid',
    gridTemplateColumns: tracks.join(' '),
    columnGap: 0,
    alignItems: 'center',
    width: '100%',
  }
}

/** Redistribute space between two adjacent fixed columns. */
function splitAdjacent(
  leftKey: SftpColKey,
  rightKey: SftpColKey,
  startLeft: number,
  startRight: number,
  delta: number,
): SftpColumnWidths {
  const sum = startLeft + startRight
  let nextLeft = clamp(leftKey, startLeft + delta)
  let nextRight = sum - nextLeft

  if (nextRight < SFTP_COL_WIDTH_MIN[rightKey]) {
    nextRight = SFTP_COL_WIDTH_MIN[rightKey]
    nextLeft = clamp(leftKey, sum - nextRight)
  } else if (nextRight > SFTP_COL_WIDTH_MAX[rightKey]) {
    nextRight = SFTP_COL_WIDTH_MAX[rightKey]
    nextLeft = clamp(leftKey, sum - nextRight)
  } else {
    nextRight = clamp(rightKey, nextRight)
    nextLeft = clamp(leftKey, sum - nextRight)
  }

  return { ...sharedWidths, [leftKey]: nextLeft, [rightKey]: nextRight }
}

export function useSftpColumnWidths() {
  const [widths, setWidths] = useState<SftpColumnWidths>(() => sharedWidths)

  useEffect(() => {
    const onChange = (next: SftpColumnWidths) => setWidths(next)
    listeners.add(onChange)
    setWidths(sharedWidths)
    return () => {
      listeners.delete(onChange)
    }
  }, [])

  const setColWidth = useCallback((key: SftpColKey, width: number) => {
    const nextW = clamp(key, width)
    if (sharedWidths[key] === nextW) return
    publishWidths({ ...sharedWidths, [key]: nextW })
  }, [])

  const resetColWidth = useCallback((key: SftpColKey, neighborKey?: SftpColKey) => {
    if (neighborKey) {
      publishWidths({
        ...sharedWidths,
        [key]: SFTP_COL_WIDTH_DEFAULTS[key],
        [neighborKey]: SFTP_COL_WIDTH_DEFAULTS[neighborKey],
      })
      return
    }
    publishWidths({ ...sharedWidths, [key]: SFTP_COL_WIDTH_DEFAULTS[key] })
  }, [])

  /**
   * Drag the right edge of `key`.
   * Name is fluid (`1fr`): its handle resizes Size (neighbor). Growing a meta
   * column steals space from Name; dragging Size|Changed splits those two.
   */
  const beginResize = useCallback(
    (key: SftpColKey, e: ReactPointerEvent | ReactMouseEvent, neighborKey?: SftpColKey) => {
      e.preventDefault()
      e.stopPropagation()
      const startX = e.clientX
      const target = e.currentTarget as HTMLElement
      const pointerId = 'pointerId' in e ? e.pointerId : undefined

      // Name handle → adjust Size so Name (1fr) grows/shrinks visually.
      const mode: 'name-size' | 'split' | 'solo' =
        key === 'name' && neighborKey
          ? 'name-size'
          : neighborKey && key !== 'name' && neighborKey !== 'name'
            ? 'split'
            : 'solo'

      const soloKey = mode === 'name-size' ? neighborKey! : key
      const startSolo = sharedWidths[soloKey]
      const startLeft = sharedWidths[key]
      const startRight = neighborKey ? sharedWidths[neighborKey] : 0

      if (typeof pointerId === 'number' && target.setPointerCapture) {
        try {
          target.setPointerCapture(pointerId)
        } catch {
          /* ignore */
        }
      }

      const onMove = (ev: MouseEvent | PointerEvent) => {
        const delta = ev.clientX - startX
        if (mode === 'name-size') {
          // Drag right → Name wider → Size narrower
          setColWidth(soloKey, startSolo - delta)
        } else if (mode === 'split' && neighborKey) {
          const next = splitAdjacent(key, neighborKey, startLeft, startRight, delta)
          if (next[key] === sharedWidths[key] && next[neighborKey] === sharedWidths[neighborKey]) return
          publishWidths(next)
        } else {
          setColWidth(soloKey, startSolo + delta)
        }
      }
      const onUp = () => {
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
        window.removeEventListener('pointercancel', onUp)
        window.removeEventListener('mousemove', onMove)
        window.removeEventListener('mouseup', onUp)
        if (typeof pointerId === 'number' && target.releasePointerCapture) {
          try {
            target.releasePointerCapture(pointerId)
          } catch {
            /* ignore */
          }
        }
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
      }
      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
      window.addEventListener('pointercancel', onUp)
      window.addEventListener('mousemove', onMove)
      window.addEventListener('mouseup', onUp)
    },
    [setColWidth],
  )

  return { widths, setColWidth, resetColWidth, beginResize }
}
