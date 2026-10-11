import { useEffect, useRef, useState, type FocusEvent, type FormEvent, type KeyboardEvent, type PointerEvent } from 'react'
import {
  ArrowLeftRight,
  Backpack,
  Crown,
  MessageCircle,
  Pencil,
  Pin,
  PinOff,
  Smile,
  Snowflake,
  TreePine,
  Users,
  Volume2,
  VolumeX,
} from 'lucide-react'
import { toast } from 'sonner'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { subscribeWorkshopActivity } from '@/lib/workshop-activity'
import { ITEM_BY_ID, RARITY_INFO, rarityAt } from '@/lib/workshop-items'
import { ACHIEVEMENT_BY_ID, loadProfile, returnEscrow, saveProfile } from '@/lib/workshop-profile'
import {
  WORKSHOP_CHAT_MAX,
  WORKSHOP_HAT_COUNT,
  WORKSHOP_NAME_MAX,
  normalizeWorkshopRoom,
  parseWorkshopMessage,
  sanitizeWorkshopName,
  type WorkshopPayload,
} from '@/lib/workshop-protocol'
import {
  TREE_MILESTONES,
  loadWorkshopDay,
  nextTreeMilestone,
  pickLeader,
  pruneWorkshopDays,
  saveWorkshopDay,
  treeStage,
  treeTotal,
  workshopDayKey,
} from '@/lib/workshop-state'
import type { TradeCloseReason } from '@/lib/workshop-trade'
import { ELF_OUTFITS, EMOTES } from './workshop-draw'
import {
  JOIN_QUIET_MS,
  MINI_H,
  MINI_W,
  PANEL_H,
  arrive,
  chooseTitle,
  claimDailyGift,
  clamp,
  createGame,
  dropFromBag,
  elfAt,
  equipFromBag,
  flushProfile,
  handleActivity,
  layoutFor,
  lockedUids,
  netTick,
  receive,
  renderMini,
  renderPanel,
  roster,
  sendChat,
  sendEmote,
  step,
  throwSnowball,
  tradeAccept,
  tradeCancel,
  tradeDismiss,
  tradeLockIn,
  tradeOffer,
  tradeRequest,
  type GameEvent,
  type Net,
  type RosterEntry,
} from './workshop-engine'
import { ItemIcon, PixelArt } from './workshop-ui'
import { WorkshopBag } from './WorkshopBag'
import { WorkshopTrade } from './WorkshopTrade'

const NAME_KEY = 'workshop-name'
const HAT_KEY = 'workshop-hat'
const MUTED_KEY = 'workshop-muted'
const HINT_KEY = 'workshop-hint-v2'
const PIN_KEY = 'workshop-pinned'

const UNLOCK_NAMES: Record<number, string> = {
  [TREE_MILESTONES[0]]: 'the star',
  [TREE_MILESTONES[1]]: 'the lights',
  [TREE_MILESTONES[2]]: 'the train',
}

const CLOSED_TOAST: Partial<Record<TradeCloseReason, (partner: string) => string>> = {
  declined: (p) => `${p} declined your trade.`,
  busy: (p) => `${p} is busy with another trade.`,
  cancelled: (p) => `${p} cancelled the trade.`,
  timeout: (p) => `Your trade with ${p} timed out.`,
  left: (p) => `${p} left the floor, so the trade was cancelled.`,
  invalid: () => 'That trade had an item this version of Zeus does not know.',
}

const CHIP_FRAME = 'relative flex h-10 shrink-0 items-center gap-1.5 rounded-xl border border-border/50 bg-card p-1 pr-2 shadow-sm'
const MINI_SKY = 'bg-gradient-to-b from-sky-200/80 via-sky-100/70 to-white dark:from-[#081627] dark:via-[#0c2038] dark:to-[#13304f]'
const TOOL =
  'inline-flex h-6 cursor-pointer items-center gap-1 rounded-md border border-border/50 bg-background/80 px-1.5 text-[11px] font-medium text-foreground/90 shadow-sm backdrop-blur-sm outline-none transition-colors hover:bg-background focus-visible:ring-1 focus-visible:ring-primary/50'

type Snapshot = { roster: RosterEntry[]; total: number }

function readStored(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function writeStored(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    // storage unavailable; the preference just won't stick
  }
}

function initialHat(): number {
  const raw = readStored(HAT_KEY)
  const saved = raw === null ? NaN : Number(raw)
  if (Number.isInteger(saved) && saved >= 0 && saved < WORKSHOP_HAT_COUNT) return saved
  const picked = Math.floor(Math.random() * WORKSHOP_HAT_COUNT)
  writeStored(HAT_KEY, String(picked))
  return picked
}

function fit(canvas: HTMLCanvasElement, width: number, height: number, dpr: number) {
  const bw = Math.round(width * dpr)
  const bh = Math.round(height * dpr)
  if (canvas.width !== bw || canvas.height !== bh) {
    canvas.width = bw
    canvas.height = bh
  }
}

/**
 * Christmas-only workshop: a snow-globe chip (title bar, next to What's New) that opens into
 * a shared floor for everyone connected to the same reader host on the LAN.
 */
export function WorkshopFloor({
  room,
  connected,
  className,
  anchor = 'titlebar',
}: {
  room: string
  connected: boolean
  className?: string
  /** Title-bar chips drop a wide panel anchored to the chip; row chips stretch full-width. */
  anchor?: 'titlebar' | 'row'
}) {
  const roomKey = connected ? normalizeWorkshopRoom(room) : null
  if (!roomKey) return <IdleChip className={className} />
  return <Floor key={roomKey} room={roomKey} className={className} anchor={anchor} />
}

function IdleChip({ className }: { className?: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div tabIndex={0} aria-label="Workshop floor: connect to a reader to join" className={cn(CHIP_FRAME, 'outline-none', className)}>
          <div className={cn('relative overflow-hidden rounded-lg', MINI_SKY)} style={{ width: MINI_W, height: MINI_H }}>
            <div className="absolute inset-x-0 bottom-0 h-1 bg-white dark:bg-slate-200/85" />
            <Snowflake className="absolute left-1/2 top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 text-sky-500/60 dark:text-sky-300/60" />
          </div>
          <div className="flex flex-col text-[10px] leading-tight text-muted-foreground">
            <span>Workshop</span>
            <span>offline</span>
          </div>
        </div>
      </TooltipTrigger>
      <TooltipContent side="bottom">Connect to a reader to open the workshop floor.</TooltipContent>
    </Tooltip>
  )
}

function Floor({ room, className, anchor }: { room: string; className?: string; anchor: 'titlebar' | 'row' }) {
  const panelRef = useRef<HTMLCanvasElement>(null)
  const miniRef = useRef<HTMLCanvasElement>(null)
  const [name, setName] = useState(() => sanitizeWorkshopName(readStored(NAME_KEY) ?? 'Elf'))
  const [hat, setHat] = useState(initialHat)
  const [muted, setMuted] = useState(() => readStored(MUTED_KEY) === '1')
  const [link, setLink] = useState<'joining' | 'live' | 'offline'>('joining')
  const [hovered, setHovered] = useState(false)
  const [focusWithin, setFocusWithin] = useState(false)
  const [pinned, setPinned] = useState(() => readStored(PIN_KEY) === '1')
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [hintSeen, setHintSeen] = useState(() => readStored(HINT_KEY) === '1')
  const [chatOpen, setChatOpen] = useState(false)
  const [chatDraft, setChatDraft] = useState('')
  const [chatNote, setChatNote] = useState<string | null>(null)
  const [emotesOpen, setEmotesOpen] = useState(false)
  const [card, setCard] = useState<{ id: string; x: number } | null>(null)
  const [bagOpen, setBagOpen] = useState(false)
  const [tradeView, setTradeView] = useState(false)
  const [attention, setAttention] = useState(false)
  const [freshLoot, setFreshLoot] = useState(0)
  const [, setVersion] = useState(0)
  const [snapshot, setSnapshot] = useState<Snapshot>({ roster: [], total: 0 })
  const [game] = useState(() => createGame(room, name, hat, loadProfile()))
  const sendRef = useRef<Net['send']>(() => {})
  const mutedRef = useRef(muted)
  const focusedRef = useRef(false)
  const openRef = useRef(false)
  const tradeViewRef = useRef(false)
  const selfCancelRef = useRef<string | null>(null)
  const hoverTimer = useRef<number | undefined>(undefined)

  const trade = game.trade
  const pending = trade?.phase === 'incoming' || trade?.phase === 'outgoing'
  const cardPeer = card ? game.peers.get(card.id) : undefined
  const open =
    pinned || hovered || focusWithin || chatOpen || emotesOpen || cardPeer !== undefined || pending || bagOpen || tradeView

  const net = (): Net => ({ send: sendRef.current, sound: !mutedRef.current })

  useEffect(() => {
    mutedRef.current = muted
  }, [muted])

  useEffect(() => {
    focusedRef.current = focusWithin
    openRef.current = open
    tradeViewRef.current = tradeView
  }, [focusWithin, open, tradeView])

  useEffect(() => {
    if (open) setAttention(false)
  }, [open])

  useEffect(() => {
    game.self.name = name
    game.self.hat = hat
    game.lastFull = 0
  }, [game, name, hat])

  useEffect(() => () => window.clearTimeout(hoverTimer.current), [])

  useEffect(() => {
    const api = window.electronAPI
    if (!api?.workshopJoin || !api.workshopSend) {
      setLink('offline')
      return
    }
    let alive = true
    const send = (payload: WorkshopPayload) => {
      game.seq += 1
      api.workshopSend?.({ id: game.self.id, seq: game.seq, ...payload })
    }
    const off = api.onWorkshopMessage?.((raw) => {
      const msg = alive ? parseWorkshopMessage(raw) : null
      if (msg) receive(game, msg, { send: sendRef.current, sound: !mutedRef.current })
    })
    api.workshopJoin(room).then(
      (res) => {
        if (!alive) return
        if (readStored(NAME_KEY) === null) setName(sanitizeWorkshopName(res.name))
        if (!res.ok) {
          setLink('offline')
          return
        }
        sendRef.current = send
        game.lastFull = 0
        game.quietUntil = performance.now() + JOIN_QUIET_MS
        setLink('live')
      },
      () => {
        if (alive) setLink('offline')
      },
    )
    return () => {
      alive = false
      off?.()
      if (sendRef.current === send) send({ t: 'bye' })
      sendRef.current = () => {}
      void api.workshopLeave?.()
      game.peers.clear()
    }
  }, [game, room])

  // Floor drops vanish for everyone once we leave, so they come straight back to the bag.
  useEffect(
    () => () => {
      returnEscrow(game.profile)
      saveProfile(game.profile)
    },
    [game],
  )

  useEffect(
    () =>
      subscribeWorkshopActivity((activity) =>
        handleActivity(game, activity, { send: sendRef.current, sound: !mutedRef.current }, performance.now()),
      ),
    [game],
  )

  useEffect(() => {
    const timer = window.setTimeout(
      () => claimDailyGift(game, { send: sendRef.current, sound: !mutedRef.current }, performance.now()),
      1800,
    )
    return () => window.clearTimeout(timer)
  }, [game])

  useEffect(() => {
    pruneWorkshopDays()
    const save = () => {
      if (!game.dirty) return
      saveWorkshopDay(game.dayKey, { tree: game.tree, me: game.self.score })
      game.dirty = false
    }
    const tick = () => {
      const key = workshopDayKey(room)
      if (key !== game.dayKey) {
        save()
        const day = loadWorkshopDay(key)
        game.dayKey = key
        game.tree = day.tree
        game.self.score = day.me
        game.stage = treeStage(treeTotal(day.tree))
        claimDailyGift(game, { send: sendRef.current, sound: !mutedRef.current }, performance.now())
      }
      save()
      flushProfile(game)
      game.leader = pickLeader([game.self, ...game.peers.values()])
      const next: Snapshot = { total: treeTotal(game.tree), roster: roster(game) }
      setSnapshot((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next))
    }
    tick()
    const timer = window.setInterval(tick, 1000)
    return () => {
      window.clearInterval(timer)
      save()
      flushProfile(game)
    }
  }, [game, room])

  useEffect(() => {
    const onEvent = (ev: GameEvent) => {
      const visible = openRef.current
      switch (ev.kind) {
        case 'found': {
          if (ev.self) setFreshLoot((n) => n + 1)
          const def = ITEM_BY_ID.get(ev.item)
          if (visible || !def) break
          if (ev.self && ev.rarity >= 3) toast.success(`You found ${def.name}!`, { description: `${RARITY_INFO[def.rarity].label} · it's in your bag.` })
          if (!ev.self && ev.rarity >= 4) toast(`${ev.by} found ${def.name}!`, { description: 'A legendary find on the workshop floor.' })
          if (!ev.self) setAttention(true)
          break
        }
        case 'gift': {
          setFreshLoot((n) => n + 1)
          const def = ITEM_BY_ID.get(ev.item)
          if (!visible && def) toast.success(`${ev.from} gave you ${def.name}`)
          break
        }
        case 'achievement': {
          const a = ACHIEVEMENT_BY_ID.get(ev.id)
          if (a && !visible) toast.success(`Achievement unlocked: ${a.name}`, { description: `New title available: "${a.title}"` })
          break
        }
        case 'daily':
          if (!visible) {
            setAttention(true)
            toast('A daily gift landed on the workshop floor', {
              description: ev.streak > 1 ? `Day ${ev.streak} of your streak.` : 'Come back tomorrow to start a streak.',
              action: { label: 'Open', onClick: () => setPinned(true) },
            })
          }
          break
        case 'chat':
          if (!visible && !ev.self) setAttention(true)
          break
        case 'trade': {
          if (ev.phase === 'incoming') {
            setTradeView(false)
            setAttention(true)
            if (!visible) {
              toast(`${ev.partnerName} wants to trade with you`, {
                description: 'Open the workshop floor to answer.',
                action: { label: 'Open', onClick: () => setPinned(true) },
              })
            }
          } else if (ev.phase === 'open') {
            setTradeView(true)
          } else if (ev.phase === 'done' && !tradeViewRef.current) {
            toast.success(`Trade with ${ev.partnerName} complete!`)
            tradeDismiss(game)
          } else if (ev.phase === 'closed') {
            const text = ev.reason ? CLOSED_TOAST[ev.reason] : undefined
            if (selfCancelRef.current !== ev.tid && text && !tradeViewRef.current) toast.info(text(ev.partnerName))
            if (!tradeViewRef.current) tradeDismiss(game)
          }
          break
        }
      }
    }
    let seen = -1
    const timer = window.setInterval(() => {
      if (game.version !== seen) {
        seen = game.version
        setVersion(seen)
      }
      game.events.splice(0).forEach(onEvent)
      if (!game.trade && tradeViewRef.current) setTradeView(false)
    }, 150)
    return () => window.clearInterval(timer)
  }, [game])

  useEffect(() => {
    const panel = panelRef.current
    const mini = miniRef.current
    const panelCtx = panel?.getContext('2d')
    const miniCtx = mini?.getContext('2d')
    if (!panel || !mini || !panelCtx || !miniCtx) return
    let raf = 0
    let last = performance.now()
    let arrived = false
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame)
      const dt = Math.min(0.05, Math.max(0, (now - last) / 1000))
      last = now
      const width = panel.clientWidth
      if (width === 0) return
      const dpr = window.devicePixelRatio || 1
      game.width = width
      game.height = PANEL_H
      game.layout = layoutFor(width, PANEL_H)
      if (!arrived) {
        arrived = true
        arrive(game)
      }
      const net: Net = { send: sendRef.current, sound: !mutedRef.current }
      step(game, dt, now, focusedRef.current, net)
      netTick(game, now, net.send)
      if (openRef.current) {
        fit(panel, width, PANEL_H, dpr)
        renderPanel(panelCtx, game, now, dpr)
      }
      if (mini.clientWidth > 0) {
        fit(mini, MINI_W, MINI_H, dpr)
        renderMini(miniCtx, game, now, dpr, MINI_W, MINI_H)
      }
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [game])

  const dismissHint = () => {
    if (hintSeen) return
    setHintSeen(true)
    writeStored(HINT_KEY, '1')
  }

  const hoverIn = () => {
    window.clearTimeout(hoverTimer.current)
    hoverTimer.current = window.setTimeout(() => setHovered(true), 150)
  }

  const hoverOut = () => {
    window.clearTimeout(hoverTimer.current)
    hoverTimer.current = window.setTimeout(() => setHovered(false), 300)
  }

  const togglePin = () => {
    const next = !pinned
    setPinned(next)
    writeStored(PIN_KEY, next ? '1' : '0')
  }

  const onBlur = (e: FocusEvent<HTMLDivElement>) => {
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return
    setFocusWithin(false)
    game.keys.left = false
    game.keys.right = false
  }

  const focusFloor = () => panelRef.current?.focus()

  const openChat = () => {
    setChatOpen(true)
    setEmotesOpen(false)
    setCard(null)
    dismissHint()
  }

  const closeChat = (refocus: boolean) => {
    setChatOpen(false)
    setChatDraft('')
    setChatNote(null)
    if (refocus) focusFloor()
  }

  const submitChat = (e: FormEvent) => {
    e.preventDefault()
    const result = sendChat(game, chatDraft, net(), performance.now())
    if (result === 'slow') {
      setChatNote('Easy, little elf. Give it a second.')
      return
    }
    closeChat(true)
  }

  const emote = (i: number) => {
    sendEmote(game, i, net(), performance.now())
    setEmotesOpen(false)
    focusFloor()
  }

  const snowball = (towardId?: string) => {
    const target = towardId ? game.peers.get(towardId) : undefined
    if (target && Math.abs(target.x - game.self.x) > 0.001) game.self.dir = target.x > game.self.x ? 1 : -1
    throwSnowball(game, net(), performance.now())
    dismissHint()
  }

  const startTrade = (peerId: string) => {
    setCard(null)
    if (!tradeRequest(game, peerId, net(), performance.now())) toast.info('Finish your current trade first.')
  }

  const answerTrade = (accept: boolean) => {
    if (!game.trade) return
    if (accept) {
      tradeAccept(game, net(), performance.now())
      setTradeView(true)
    } else {
      selfCancelRef.current = game.trade.tid
      tradeCancel(game, net(), performance.now())
      tradeDismiss(game)
    }
  }

  const closeTrade = () => {
    const t = game.trade
    if (t && (t.phase === 'open' || t.phase === 'outgoing')) {
      selfCancelRef.current = t.tid
      tradeCancel(game, net(), performance.now())
    }
    tradeDismiss(game)
    setTradeView(false)
  }

  const onPointerDown = (e: PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    if (rect.width === 0) return
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    const s = game.self
    const hit = elfAt(game, x, y)
    setEmotesOpen(false)
    if (hit === s) {
      game.jumpQueued = true
      setCard(null)
    } else if (hit) {
      setCard((prev) => (prev?.id === hit.id ? null : { id: hit.id, x }))
    } else {
      s.walkTo = clamp(x / rect.width, 0.02, 0.98)
      setCard(null)
    }
    s.manual = true
    s.nextWander = performance.now() + 12_000
    e.currentTarget.focus()
    dismissHint()
  }

  const onKeyDown = (e: KeyboardEvent<HTMLCanvasElement>) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key
    switch (key) {
      case 'ArrowLeft':
      case 'a':
        game.keys.left = true
        break
      case 'ArrowRight':
      case 'd':
        game.keys.right = true
        break
      case ' ':
      case 'ArrowUp':
      case 'w':
        game.jumpQueued = true
        break
      case 'Enter':
      case 't':
        openChat()
        break
      case 'f':
        snowball()
        break
      case 'b':
        setBagOpen(true)
        setFreshLoot(0)
        break
      case '1':
      case '2':
      case '3':
      case '4':
      case '5':
        emote(Number(key) - 1)
        break
      case 'Escape':
        if (card || emotesOpen) {
          setCard(null)
          setEmotesOpen(false)
        } else {
          e.currentTarget.blur()
        }
        break
      default:
        return
    }
    e.preventDefault()
    e.stopPropagation()
    dismissHint()
  }

  const onKeyUp = (e: KeyboardEvent<HTMLCanvasElement>) => {
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key
    if (key === 'ArrowLeft' || key === 'a') game.keys.left = false
    else if (key === 'ArrowRight' || key === 'd') game.keys.right = false
  }

  const commitName = () => {
    const next = sanitizeWorkshopName(draft)
    setName(next)
    writeStored(NAME_KEY, next)
    setEditing(false)
  }

  const cycleHat = () => {
    const next = (hat + 1) % WORKSHOP_HAT_COUNT
    setHat(next)
    writeStored(HAT_KEY, String(next))
  }

  const toggleMute = () => {
    const next = !muted
    setMuted(next)
    writeStored(MUTED_KEY, next ? '1' : '0')
  }

  const profile = game.profile
  const others = Math.max(0, snapshot.roster.length - 1)
  const presence =
    link === 'offline' ? 'Offline' : link === 'joining' ? 'Joining…' : others === 0 ? 'Just you' : `${others + 1} here`
  const nextUnlock = nextTreeMilestone(snapshot.total)
  const recentChat = game.chatLog.slice(-4)
  const cardInfo = cardPeer ? snapshot.roster.find((r) => r.id === cardPeer.id) : undefined
  const cardTitle = cardPeer ? ACHIEVEMENT_BY_ID.get(cardPeer.title)?.title : undefined
  const cardGear = cardPeer
    ? [cardPeer.equip.hat, cardPeer.equip.pet, cardPeer.equip.trail].flatMap((id) => {
        const def = id ? ITEM_BY_ID.get(id) : undefined
        return def ? [def] : []
      })
    : []

  return (
    <div className={cn('relative', className)}>
      <button
        type="button"
        onClick={togglePin}
        onMouseEnter={hoverIn}
        onMouseLeave={hoverOut}
        aria-expanded={open}
        aria-label={`Workshop floor: ${snapshot.total} ornaments, ${snapshot.roster.length} elves. ${pinned ? 'Unpin' : 'Pin'} the floor open.`}
        className={cn(
          CHIP_FRAME,
          'group cursor-pointer outline-none transition-[box-shadow,transform] duration-200 hover:shadow-md focus-visible:ring-2 focus-visible:ring-primary/40 active:scale-[0.98]',
          open && 'shadow-md ring-1 ring-primary/25',
        )}
      >
        <canvas
          ref={miniRef}
          aria-hidden
          className={cn('rounded-lg', MINI_SKY)}
          style={{ width: MINI_W, height: MINI_H, imageRendering: 'pixelated' }}
        />
        <span className="flex flex-col items-start text-[10px] font-medium leading-tight">
          <span className="flex items-center gap-1 tabular-nums">
            <TreePine className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
            {snapshot.total}
          </span>
          <span className="flex items-center gap-1 tabular-nums text-muted-foreground">
            <Users className="h-3 w-3" />
            {snapshot.roster.length}
          </span>
        </span>
        {pinned && <Pin className="absolute -left-1 -top-1 h-3 w-3 rotate-45 text-primary" />}
        {attention && !open && (
          <span className="absolute -right-1 -top-1 flex h-3 w-3">
            <span className="absolute inset-0 animate-ping rounded-full bg-rose-500/70" />
            <span className="relative h-3 w-3 rounded-full bg-rose-500 ring-2 ring-background" />
          </span>
        )}
      </button>

      <div
        className={cn(
          'absolute top-full z-40 mt-2 overflow-hidden rounded-xl border border-border/50 bg-card/[0.97] shadow-elev-lg',
          'transition-[opacity,transform,visibility] duration-200 ease-out',
          anchor === 'titlebar'
            ? 'right-0 w-[min(920px,calc(100vw-1.5rem))]'
            : 'inset-x-0',
          open ? 'visible translate-y-0 opacity-100' : 'pointer-events-none invisible -translate-y-1 opacity-0',
        )}
        style={{ height: PANEL_H }}
        onMouseEnter={hoverIn}
        onMouseLeave={hoverOut}
        onFocus={() => setFocusWithin(true)}
        onBlur={onBlur}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-gradient-to-b from-sky-100/70 via-sky-50/30 to-transparent dark:from-[#0b1d33]/90 dark:via-[#0b1d33]/40"
        />
        <canvas
          ref={panelRef}
          tabIndex={open ? 0 : -1}
          aria-label="Workshop floor. Click to walk or click an elf, arrow keys or A and D to move, Space to jump, Enter to chat, F to throw a snowball, 1 to 5 for emotes, B for your bag."
          className="absolute inset-0 h-full w-full cursor-pointer outline-none"
          onPointerDown={onPointerDown}
          onKeyDown={onKeyDown}
          onKeyUp={onKeyUp}
        />

        <div className="absolute left-2 top-2 flex items-center gap-1.5">
          {editing ? (
            <input
              autoFocus
              value={draft}
              maxLength={WORKSHOP_NAME_MAX}
              aria-label="Your elf's name"
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commitName}
              onKeyDown={(e) => {
                e.stopPropagation()
                if (e.key === 'Enter') commitName()
                else if (e.key === 'Escape') setEditing(false)
              }}
              className="h-6 w-32 rounded-md border border-primary/50 bg-background/90 px-1.5 text-[11px] outline-none focus:ring-1 focus:ring-primary/40"
            />
          ) : (
            <button
              type="button"
              className={TOOL}
              onClick={() => {
                setDraft(name)
                setEditing(true)
              }}
              title="Rename your elf"
            >
              <Pencil className="h-3 w-3 opacity-70" />
              {name}
            </button>
          )}
          <button type="button" className={TOOL} onClick={cycleHat} title="Change outfit colour" aria-label="Change outfit colour">
            <span className="h-2.5 w-2.5 rounded-full ring-1 ring-black/10" style={{ background: ELF_OUTFITS[hat].hat }} />
          </button>
          <button
            type="button"
            className={cn(TOOL, freshLoot > 0 && 'border-amber-400/70 text-amber-700 dark:text-amber-300')}
            onClick={() => {
              setBagOpen(true)
              setFreshLoot(0)
            }}
            title="Open your bag (B)"
          >
            <Backpack className="h-3 w-3" />
            <span className="tabular-nums">{profile.bag.length}</span>
            {freshLoot > 0 && <span className="rounded bg-amber-400/90 px-1 text-[9px] font-bold text-amber-950">+{freshLoot}</span>}
          </button>
          <button type="button" className={TOOL} onClick={openChat} title="Chat (Enter)" aria-label="Chat">
            <MessageCircle className="h-3 w-3" />
          </button>
          <button
            type="button"
            className={cn(TOOL, emotesOpen && 'bg-background ring-1 ring-primary/40')}
            onClick={() => {
              setEmotesOpen((v) => !v)
              setCard(null)
            }}
            title="Emotes (1–5)"
            aria-label="Emotes"
            aria-expanded={emotesOpen}
          >
            <Smile className="h-3 w-3" />
          </button>
          <button type="button" className={TOOL} onClick={() => snowball()} title="Throw a snowball (F)" aria-label="Throw a snowball">
            <Snowflake className="h-3 w-3 text-sky-500" />
          </button>
          <span
            className={cn(TOOL, 'cursor-default hover:bg-background/80')}
            title={
              link === 'offline'
                ? 'LAN presence is unavailable, so the floor is local only.'
                : 'Everyone connected to this reader host on your network shares this floor.'
            }
          >
            <Users className="h-3 w-3 opacity-70" />
            {presence}
          </span>
          <button
            type="button"
            className={TOOL}
            onClick={toggleMute}
            title={muted ? 'Unmute sounds' : 'Mute sounds'}
            aria-label={muted ? 'Unmute sounds' : 'Mute sounds'}
          >
            {muted ? <VolumeX className="h-3 w-3" /> : <Volume2 className="h-3 w-3" />}
          </button>
          <button
            type="button"
            className={cn(TOOL, pinned && 'text-primary')}
            onClick={togglePin}
            title={pinned ? 'Unpin: close when the mouse leaves' : 'Pin the floor open'}
            aria-label={pinned ? 'Unpin the floor' : 'Pin the floor open'}
            aria-pressed={pinned}
          >
            {pinned ? <PinOff className="h-3 w-3" /> : <Pin className="h-3 w-3" />}
          </button>
        </div>

        {emotesOpen && (
          <div className="absolute left-2 top-10 z-10 flex gap-1 rounded-lg border border-border/60 bg-popover/95 p-1 shadow-elev-md backdrop-blur-sm">
            {EMOTES.map((em, i) => (
              <button
                key={em.name}
                type="button"
                onClick={() => emote(i)}
                title={`${em.name} (${i + 1})`}
                className="grid h-8 w-8 cursor-pointer place-items-center rounded-md outline-none transition-transform hover:scale-110 hover:bg-accent focus-visible:ring-1 focus-visible:ring-primary/50"
              >
                <PixelArt rows={em.rows} palette={em.palette} size={20} />
              </button>
            ))}
          </div>
        )}

        {trade?.phase === 'incoming' && (
          <div className="absolute left-1/2 top-2 z-10 flex -translate-x-1/2 items-center gap-2 rounded-lg border border-sky-400/50 bg-popover/95 py-1 pl-2.5 pr-1 text-xs shadow-elev-md backdrop-blur-sm animate-in fade-in-0 slide-in-from-top-1">
            <ArrowLeftRight className="h-3.5 w-3.5 text-sky-500" />
            <span>
              <b>{trade.partnerName}</b> wants to trade
            </span>
            <button
              type="button"
              onClick={() => answerTrade(true)}
              className="h-6 cursor-pointer rounded-md bg-emerald-600 px-2 font-semibold text-white outline-none hover:bg-emerald-500 focus-visible:ring-2 focus-visible:ring-emerald-400"
            >
              Accept
            </button>
            <button
              type="button"
              onClick={() => answerTrade(false)}
              className="h-6 cursor-pointer rounded-md px-2 text-muted-foreground outline-none hover:bg-accent focus-visible:ring-1 focus-visible:ring-primary/50"
            >
              Decline
            </button>
          </div>
        )}
        {trade?.phase === 'outgoing' && (
          <div className="absolute left-1/2 top-2 z-10 flex -translate-x-1/2 items-center gap-2 rounded-lg border border-border/60 bg-popover/95 py-1 pl-2.5 pr-1 text-xs shadow-elev-md backdrop-blur-sm">
            <ArrowLeftRight className="h-3.5 w-3.5 animate-pulse text-sky-500" />
            <span>Asking {trade.partnerName} to trade…</span>
            <button
              type="button"
              onClick={closeTrade}
              className="h-6 cursor-pointer rounded-md px-2 text-muted-foreground outline-none hover:bg-accent focus-visible:ring-1 focus-visible:ring-primary/50"
            >
              Cancel
            </button>
          </div>
        )}

        {!pending && !hintSeen && (
          <div className="pointer-events-none absolute left-1/2 top-[58px] hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-background/70 px-2 py-0.5 text-[10px] text-muted-foreground backdrop-blur-sm xl:block">
            Click to walk · Space jump · Enter chat · F snowball · 1–5 emotes · click an elf to trade · walk over presents to open them
          </div>
        )}

        {cardPeer && card && (
          <div
            className="absolute top-9 z-20 w-[210px] -translate-x-1/2 rounded-lg border border-border/60 bg-popover/95 p-2.5 text-xs shadow-elev-lg backdrop-blur-sm animate-in fade-in-0 zoom-in-95"
            style={{ left: clamp(card.x, 112, Math.max(112, game.width - 112)) }}
          >
            <div className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: ELF_OUTFITS[cardPeer.hat % ELF_OUTFITS.length].hat }} />
              <span className="truncate font-semibold">{cardPeer.name}</span>
              {cardInfo?.leader && <Crown className="h-3 w-3 shrink-0 text-amber-500" />}
            </div>
            {cardTitle && (
              <div className="mt-0.5 text-[11px] font-medium" style={{ color: RARITY_INFO[rarityAt(cardPeer.prestige)].color }}>
                {cardTitle}
              </div>
            )}
            <div className="mt-2 flex min-h-[28px] items-center gap-1">
              {cardGear.length === 0 ? (
                <span className="text-[11px] text-muted-foreground">No gear yet</span>
              ) : (
                cardGear.map((def) => (
                  <span key={def.id} title={def.name} className="grid h-7 w-7 place-items-center rounded-md bg-slate-900/90">
                    <ItemIcon item={def} size={20} />
                  </span>
                ))
              )}
            </div>
            <div className="mt-2 grid grid-cols-3 gap-1">
              <button
                type="button"
                onClick={() => startTrade(cardPeer.id)}
                className="flex h-7 cursor-pointer items-center justify-center gap-1 rounded-md bg-primary px-1 text-[11px] font-semibold text-primary-foreground outline-none hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-primary/40"
              >
                <ArrowLeftRight className="h-3 w-3" />
                Trade
              </button>
              <button
                type="button"
                onClick={() => {
                  emote(0)
                  setCard(null)
                }}
                className="h-7 cursor-pointer rounded-md border border-border/60 text-[11px] outline-none hover:bg-accent focus-visible:ring-1 focus-visible:ring-primary/50"
              >
                Wave
              </button>
              <button
                type="button"
                onClick={() => {
                  snowball(cardPeer.id)
                  setCard(null)
                }}
                className="h-7 cursor-pointer rounded-md border border-border/60 text-[11px] outline-none hover:bg-accent focus-visible:ring-1 focus-visible:ring-primary/50"
              >
                Snowball
              </button>
            </div>
          </div>
        )}

        {chatOpen && (
          <form onSubmit={submitChat} className="absolute bottom-2 left-2 z-10 w-[min(380px,55%)]">
            {recentChat.length > 0 && (
              <div className="mb-1 space-y-0.5 rounded-md bg-background/75 px-2 py-1 text-[11px] leading-4 shadow-sm backdrop-blur-sm">
                {recentChat.map((line) => (
                  <div key={line.key} className="truncate">
                    <span className={cn('font-semibold', line.self ? 'text-rose-600 dark:text-rose-400' : 'text-sky-700 dark:text-sky-300')}>
                      {line.name}:
                    </span>{' '}
                    {line.text}
                  </div>
                ))}
              </div>
            )}
            <input
              autoFocus
              value={chatDraft}
              maxLength={WORKSHOP_CHAT_MAX}
              aria-label="Chat message"
              placeholder="Say something nice… (Enter to send, Esc to close)"
              onChange={(e) => {
                setChatDraft(e.target.value)
                setChatNote(null)
              }}
              onKeyDown={(e) => {
                e.stopPropagation()
                if (e.key === 'Escape') closeChat(true)
              }}
              onBlur={(e) => {
                if (!e.currentTarget.form?.contains(e.relatedTarget as Node | null) && !chatDraft.trim()) closeChat(false)
              }}
              className="h-7 w-full rounded-md border border-primary/40 bg-background/95 px-2 text-xs shadow-sm outline-none focus:ring-1 focus:ring-primary/40"
            />
            {chatNote && <div className="mt-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-300">{chatNote}</div>}
          </form>
        )}

        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className={cn(TOOL, 'absolute right-[112px] top-2')}
              aria-label={`Workshop tree, ${snapshot.total} ornaments today`}
            >
              <TreePine className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
              <span className="tabular-nums">{snapshot.total}</span>
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom" align="end" className="w-[300px] px-3 py-2.5">
            <div className="space-y-2 text-xs">
              <div>
                <div className="font-medium">
                  Today's tree: {snapshot.total} ornament{snapshot.total === 1 ? '' : 's'}
                </div>
                <div className="text-muted-foreground">
                  {nextUnlock === null
                    ? 'Fully decorated. Merry Christmas!'
                    : `${nextUnlock - snapshot.total} more for ${UNLOCK_NAMES[nextUnlock]} (and a gift for everyone here)`}
                </div>
              </div>
              <div className="space-y-1 border-t border-border/60 pt-2">
                {snapshot.roster.map((r) => (
                  <div key={r.id} className="flex items-center justify-between gap-3">
                    <span className="flex min-w-0 items-center gap-1 truncate">
                      {r.leader && <Crown className="h-3 w-3 shrink-0 text-amber-500" />}
                      <span className="truncate" style={r.prestige >= 1 ? { color: RARITY_INFO[rarityAt(r.prestige)].color } : undefined}>
                        {r.name}
                      </span>
                      {r.self && <span className="text-muted-foreground">(you)</span>}
                      {r.title && <span className="truncate text-[10px] text-muted-foreground">· {r.title}</span>}
                    </span>
                    <span className="shrink-0 tabular-nums text-muted-foreground">
                      {r.score[0]} sends · {r.score[2]} gifts
                    </span>
                  </div>
                ))}
              </div>
              <div className="border-t border-border/60 pt-2 text-muted-foreground">
                Sending tags drops a present; bigger sends roll rarer loot. Walk over a present to open it and keep what's
                inside. Each present opened hangs an ornament, and Edge process starts ring the bell.
              </div>
            </div>
          </TooltipContent>
        </Tooltip>
      </div>

      <WorkshopBag
        open={bagOpen}
        onOpenChange={setBagOpen}
        profile={profile}
        locked={lockedUids(game)}
        onEquip={(slot, id) => equipFromBag(game, slot, id)}
        onTitle={(id) => chooseTitle(game, id)}
        onDrop={(uid) => {
          if (dropFromBag(game, uid, net(), performance.now())) setBagOpen(false)
        }}
      />
      <WorkshopTrade
        open={tradeView}
        session={trade}
        profile={profile}
        onOffer={(uids) => tradeOffer(game, uids, net(), performance.now())}
        onLockIn={() => tradeLockIn(game, net(), performance.now())}
        onClose={closeTrade}
      />
    </div>
  )
}
