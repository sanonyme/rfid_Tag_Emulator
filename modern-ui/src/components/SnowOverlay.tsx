import { useEffect, useRef, useState } from 'react'
import { THEME_CHANGE_EVENT } from '../lib/themes'

type Flake = {
  x: number
  y: number
  r: number
  vy: number
  vx: number
  wobble: number
  wobbleSpeed: number
  opacity: number
  kind: 'dot' | 'crystal'
}

function makeFlake(w: number, h: number, anywhere: boolean, dark: boolean): Flake {
  const depth = Math.random()
  return {
    x: Math.random() * w,
    y: anywhere ? Math.random() * h : -12 - Math.random() * 40,
    r: 1.1 + depth * 3.4,
    vy: 0.22 + depth * 0.7,
    vx: (Math.random() - 0.5) * 0.2,
    wobble: Math.random() * Math.PI * 2,
    wobbleSpeed: 0.004 + Math.random() * 0.012,
    opacity: (dark ? 0.55 : 0.35) + depth * (dark ? 0.4 : 0.3),
    kind: Math.random() > 0.42 ? 'crystal' : 'dot',
  }
}

function drawCrystal(ctx: CanvasRenderingContext2D, radius: number) {
  ctx.lineWidth = Math.max(0.6, radius * 0.28)
  ctx.lineCap = 'round'
  for (let i = 0; i < 6; i++) {
    ctx.save()
    ctx.rotate((Math.PI / 3) * i)
    ctx.beginPath()
    ctx.moveTo(0, 0)
    ctx.lineTo(0, radius * 2.6)
    ctx.moveTo(0, radius * 1.15)
    ctx.lineTo(radius * 0.7, radius * 1.7)
    ctx.moveTo(0, radius * 1.15)
    ctx.lineTo(-radius * 0.7, radius * 1.7)
    ctx.stroke()
    ctx.restore()
  }
}

function SnowCanvas() {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
    let reduce = motion.matches
    let raf = 0
    let flakes: Flake[] = []
    let width = 0
    let height = 0

    const dark = () => document.documentElement.classList.contains('dark')

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      width = window.innerWidth
      height = window.innerHeight
      canvas.width = Math.floor(width * dpr)
      canvas.height = Math.floor(height * dpr)
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      const count = Math.round(Math.min(72, Math.max(28, width / 24)))
      const isDark = dark()
      flakes = Array.from({ length: count }, () => makeFlake(width, height, true, isDark))
    }

    const frame = () => {
      ctx.clearRect(0, 0, width, height)
      ctx.fillStyle = '#fffdf8'
      ctx.strokeStyle = '#fffdf8'
      for (const flake of flakes) {
        if (!reduce) {
          flake.wobble += flake.wobbleSpeed
          flake.y += flake.vy
          flake.x += flake.vx + Math.sin(flake.wobble) * 0.28
          if (flake.y > height + 10) {
            const next = makeFlake(width, height, false, dark())
            flake.x = next.x
            flake.y = -8
            flake.r = next.r
            flake.vy = next.vy
            flake.vx = next.vx
            flake.opacity = next.opacity
            flake.kind = next.kind
          }
          if (flake.x < -12) flake.x = width + 6
          if (flake.x > width + 12) flake.x = -6
        }
        ctx.save()
        ctx.globalAlpha = flake.opacity
        ctx.translate(flake.x, flake.y)
        if (flake.kind === 'dot') {
          ctx.beginPath()
          ctx.arc(0, 0, flake.r, 0, Math.PI * 2)
          ctx.fill()
        } else {
          drawCrystal(ctx, flake.r)
        }
        ctx.restore()
      }
      if (!reduce) raf = requestAnimationFrame(frame)
    }

    const onMotion = () => {
      reduce = motion.matches
      cancelAnimationFrame(raf)
      if (!reduce) raf = requestAnimationFrame(frame)
      else frame()
    }

    resize()
    frame()
    window.addEventListener('resize', resize)
    motion.addEventListener('change', onMotion)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
      motion.removeEventListener('change', onMotion)
    }
  }, [])

  return (
    <canvas
      ref={ref}
      className="pointer-events-none fixed inset-0 z-[15]"
      aria-hidden
    />
  )
}

export function SnowOverlay() {
  const [active, setActive] = useState(
    () => document.documentElement.dataset.theme === 'christmas',
  )

  useEffect(() => {
    const sync = () => setActive(document.documentElement.dataset.theme === 'christmas')
    sync()
    window.addEventListener(THEME_CHANGE_EVENT, sync)
    return () => window.removeEventListener(THEME_CHANGE_EVENT, sync)
  }, [])

  if (!active) return null
  return (
    <>
      <div className="xmas-garland" aria-hidden>
        <div className="xmas-lights" />
      </div>
      <div className="xmas-drift" aria-hidden />
      <SnowCanvas />
    </>
  )
}
