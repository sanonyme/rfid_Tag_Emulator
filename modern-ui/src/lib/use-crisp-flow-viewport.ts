import { useCallback, useEffect, useRef, type RefObject } from 'react'
import type { Viewport } from '@xyflow/react'

const PIXEL_SNAP_EPSILON = 0.01
const ZOOM_DELTA_EPSILON = 0.004
const LIVE_RASTER_DEBOUNCE_MS = 45
const LIVE_RASTER_MAX_WAIT_MS = 110

/**
 * Rounds fractional pan offsets (x, y) to integer CSS pixels so 1px card
 * borders, hairlines, and monospace glyphs stay aligned to the pixel grid
 * across all DPI scales without altering the cursor-anchored zoom factor.
 */
export function snapViewportPixels(vp: Viewport): { snapped: Viewport; changed: boolean } {
  const rx = Math.round(vp.x)
  const ry = Math.round(vp.y)
  const changed =
    Math.abs(vp.x - rx) > PIXEL_SNAP_EPSILON || Math.abs(vp.y - ry) > PIXEL_SNAP_EPSILON
  return {
    snapped: changed ? { x: rx, y: ry, zoom: vp.zoom } : vp,
    changed,
  }
}

/**
 * Flips a zero-visual-impact paint-invalidation attribute on `.react-flow`
 * so Electron/Chromium's compositor drops any stale-scale GPU raster tile
 * immediately after zooming, rather than waiting for a user click.
 */
export function commitFlowCrispRaster(rootEl: HTMLElement | null): void {
  if (!rootEl) return
  const target = rootEl.classList.contains('react-flow')
    ? rootEl
    : (rootEl.querySelector('.react-flow') as HTMLElement | null)
  if (!target) return
  target.dataset.rfRaster = target.dataset.rfRaster === '1' ? '0' : '1'
}

export interface UseCrispFlowViewportOptions {
  containerRef: RefObject<HTMLElement | null>
  setViewport: (vp: Viewport, options?: { duration?: number }) => void
  onMoveZoom?: (vp: Viewport) => void
}

/**
 * Keeps React Flow canvases consistently crisp before, during, and after zoom
 * gestures in Chromium/Electron:
 * 1. Triggers lightweight, flicker-free paint re-rasterization while zooming
 *    (debounced with a short max-wait, skipped completely during plain panning).
 * 2. Snaps fractional viewport x/y offsets to integer CSS pixels on settle
 *    (guarded against re-entrant `setViewport` loops) and commits a crisp
 *    vector raster at the final zoom scale.
 */
export function useCrispFlowViewport({
  containerRef,
  setViewport,
  onMoveZoom,
}: UseCrispFlowViewportOptions) {
  const snappingRef = useRef(false)
  const lastRasterZoomRef = useRef<number>(1)
  const pendingZoomRef = useRef<number>(1)
  const debounceTimerRef = useRef<number | null>(null)
  const maxWaitTimerRef = useRef<number | null>(null)
  const rafRef = useRef<number | null>(null)

  const clearTimers = useCallback(() => {
    if (debounceTimerRef.current !== null) {
      window.clearTimeout(debounceTimerRef.current)
      debounceTimerRef.current = null
    }
    if (maxWaitTimerRef.current !== null) {
      window.clearTimeout(maxWaitTimerRef.current)
      maxWaitTimerRef.current = null
    }
  }, [])

  const scheduleCrispCommit = useCallback(
    (zoom: number) => {
      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current)
      }
      rafRef.current = window.requestAnimationFrame(() => {
        rafRef.current = null
        lastRasterZoomRef.current = zoom
        commitFlowCrispRaster(containerRef.current)
      })
    },
    [containerRef],
  )

  const flushCrispRaster = useCallback(
    (zoom?: number) => {
      clearTimers()
      scheduleCrispCommit(zoom ?? pendingZoomRef.current)
    },
    [clearTimers, scheduleCrispCommit],
  )

  useEffect(() => {
    return () => {
      clearTimers()
      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
    }
  }, [clearTimers])

  const handleMove = useCallback(
    (_event: unknown, vp: Viewport) => {
      pendingZoomRef.current = vp.zoom
      onMoveZoom?.(vp)

      // Pure panning keeps the exact same zoom scale — no re-raster needed.
      if (Math.abs(vp.zoom - lastRasterZoomRef.current) < ZOOM_DELTA_EPSILON) {
        return
      }

      if (debounceTimerRef.current !== null) {
        window.clearTimeout(debounceTimerRef.current)
      }
      debounceTimerRef.current = window.setTimeout(() => {
        debounceTimerRef.current = null
        if (maxWaitTimerRef.current !== null) {
          window.clearTimeout(maxWaitTimerRef.current)
          maxWaitTimerRef.current = null
        }
        scheduleCrispCommit(pendingZoomRef.current)
      }, LIVE_RASTER_DEBOUNCE_MS)

      if (maxWaitTimerRef.current === null) {
        maxWaitTimerRef.current = window.setTimeout(() => {
          maxWaitTimerRef.current = null
          if (debounceTimerRef.current !== null) {
            window.clearTimeout(debounceTimerRef.current)
            debounceTimerRef.current = null
          }
          scheduleCrispCommit(pendingZoomRef.current)
        }, LIVE_RASTER_MAX_WAIT_MS)
      }
    },
    [onMoveZoom, scheduleCrispCommit],
  )

  const handleMoveEnd = useCallback(
    (_event: unknown, vp: Viewport) => {
      pendingZoomRef.current = vp.zoom
      clearTimers()

      if (snappingRef.current) {
        snappingRef.current = false
        scheduleCrispCommit(vp.zoom)
        return
      }

      const { snapped, changed } = snapViewportPixels(vp)
      if (changed) {
        snappingRef.current = true
        try {
          setViewport(snapped, { duration: 0 })
        } finally {
          // Ensure the guard never sticks even if setViewport doesn't re-fire onMoveEnd synchronously.
          window.requestAnimationFrame(() => {
            snappingRef.current = false
          })
        }
      }

      scheduleCrispCommit(vp.zoom)
    },
    [clearTimers, scheduleCrispCommit, setViewport],
  )

  return { handleMove, handleMoveEnd, flushCrispRaster }
}
