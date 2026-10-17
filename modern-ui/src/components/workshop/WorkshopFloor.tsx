import { useEffect, useRef, useState, type FocusEvent, type FormEvent, type KeyboardEvent, type PointerEvent } from 'react'
import {
  ArrowLeftRight,
  Backpack,
  Crown,
  Heart,
  MessageCircle,
  Pencil,
  Pin,
  PinOff,
  Home,
  Smile,
  Snowflake,
  TreePine,
  Users,
  Volume2,
  VolumeX,
  X,
  Send,
} from 'lucide-react'
import { toast } from 'sonner'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { subscribeWorkshopActivity } from '@/lib/workshop-activity'
import { ITEM_BY_ID, RARITIES, RARITY_INFO, rarityAt } from '@/lib/workshop-items'
import { ACHIEVEMENT_BY_ID, WEARABLE_SLOTS, loadProfile, personalWorldRoom, returnEscrow, saveProfile } from '@/lib/workshop-profile'
import { CloudApi, CloudConnection, SessionLostError, cacheAccount, clearLocalSession, isWorkshopStaging, parseSnapshot, restoreGuestSession, storedAccount, workshopEndpoint } from '@/lib/workshop-cloud'
import { CREWS, ROOMS, canModerate, eventActive, mergeBag, type DirectoryPlayer, type Dm, type EventView, type Identity, type RoomId } from '@/lib/workshop-cloud-model'
import {
  WORKSHOP_CHAT_MAX,
  WORKSHOP_HAT_COUNT,
  WORKSHOP_NAME_MAX,
  sanitizeWorkshopName,
} from '@/lib/workshop-protocol'
import {
  TREE_MILESTONES,
  loadWorkshopDay,
  nextTreeMilestone,
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
  placeableAt,
  receive,
  renderMini,
  renderPanel,
  roster,
  sendChat,
  sendEmote,
  step,
  syncSelf,
  throwSnowball,
  takePlaceable,
  useFromBag,
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
import { WorkshopAccount } from './WorkshopAccount'
import { WorkshopFriends } from './WorkshopFriends'

const NAME_KEY = 'workshop-name'
const HAT_KEY = 'workshop-hat'
const MUTED_KEY = 'workshop-muted'
const HINT_KEY = 'workshop-hint-v2'
const PIN_KEY = 'workshop-pinned'
type World = RoomId | 'home'

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
  'inline-flex h-6 shrink-0 cursor-pointer items-center gap-1 rounded-md border border-border/50 bg-background/80 px-1.5 text-[11px] font-medium text-foreground/90 shadow-sm backdrop-blur-sm outline-none transition-colors hover:bg-background focus-visible:ring-1 focus-visible:ring-primary/50'

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
 * Cloud rooms share gameplay independently of readers. Home stays on this device.
 */
export function WorkshopFloor({
  className,
  anchor = 'titlebar',
}: {
  className?: string
  /** Title-bar chips drop a wide panel anchored to the chip; row chips stretch full-width. */
  anchor?: 'titlebar' | 'row'
}) {
  const [world, setWorld] = useState<World>(() => { restoreGuestSession(); return 'anexya-general' })
  const [generation, setGeneration] = useState(0)
  const [device] = useState(() => { const profile = loadProfile(); saveProfile(profile); return profile.device })
  const activeRoom = world === 'home' ? personalWorldRoom(device) : world
  return (
    <Floor
      key={`${activeRoom}:${generation}`}
      room={activeRoom}
      className={className}
      anchor={anchor}
      online={world !== 'home'}
      world={world}
      onWorld={setWorld}
      onIdentityChange={() => setGeneration(n => n+1)}
    />
  )
}

function Floor({
  room,
  className,
  anchor,
  online,
  world,
  onWorld,
  onIdentityChange,
}: {
  room: string
  className?: string
  anchor: 'titlebar' | 'row'
  online: boolean
  world: World
  onWorld: (next: World) => void
  onIdentityChange: () => void
}) {
  const wrapperRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLCanvasElement>(null)
  const miniRef = useRef<HTMLCanvasElement>(null)
  const [name, setName] = useState(() => storedAccount()?.identity.name ?? sanitizeWorkshopName(readStored(NAME_KEY) ?? 'Elf'))
  const [hat, setHat] = useState(initialHat)
  const [muted, setMuted] = useState(() => readStored(MUTED_KEY) === '1')
  const [link, setLink] = useState<'joining' | 'live' | 'offline' | 'solo'>(online ? 'joining' : 'solo')
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
  const [panelPosition, setPanelPosition] = useState({ left: 12, top: 60 })
  const [accountOpen, setAccountOpen] = useState(false)
  const [friendsOpen,setFriendsOpen]=useState(false)
  const [socialTick,setSocialTick]=useState(0)
  const [socialBadge,setSocialBadge]=useState(0)
  const [endpoint, setEndpoint] = useState('')
  const [identity, setIdentity] = useState<Identity | null>(() => storedAccount()?.identity ?? null)
  const [admission, setAdmission] = useState<'inside' | 'knock' | 'pending' | 'denied'>(online ? 'pending' : 'inside')
  const [knocks, setKnocks] = useState<{ subject: string; name: string }[]>([])
  const [players, setPlayers] = useState<DirectoryPlayer[]>([])
  const [counts, setCounts] = useState<Partial<Record<RoomId, number>>>({})
  const [events, setEvents] = useState<EventView[]>([])
  const [eventTime, setEventTime] = useState(Date.now)
  const [dmTo, setDmTo] = useState('')
  const [dms, setDms] = useState<Dm[]>([])
  const cloudRef = useRef<CloudConnection | null>(null)
  const admissionRef = useRef(admission)
  const [game] = useState(() => createGame(room, name, hat, loadProfile()))
  const sendRef = useRef<Net['send']>(() => {})
  const mutedRef = useRef(muted)
  const focusedRef = useRef(false)
  const openRef = useRef(false)
  const paintFloorRef = useRef(false)
  const guestEventsRef = useRef(new Map<string, { baseline: number; optedIn: boolean }>())
  const tradeViewRef = useRef(false)
  const selfCancelRef = useRef<string | null>(null)
  const hoverTimer = useRef<number | undefined>(undefined)

  const trade = game.trade
  const pending = trade?.phase === 'incoming' || trade?.phase === 'outgoing'
  const cardPeer = card ? game.peers.get(card.id) : undefined
  const open =
    pinned || hovered || focusWithin || chatOpen || emotesOpen || cardPeer !== undefined || pending || bagOpen || tradeView || accountOpen || friendsOpen

  const net = (): Net => ({ send: sendRef.current, sound: !mutedRef.current })

  useEffect(() => {
    if (anchor !== 'titlebar') return
    const place = () => {
      const bounds = wrapperRef.current?.getBoundingClientRect()
      if (!bounds) return
      const width = Math.min(920, window.innerWidth - 24)
      setPanelPosition({ left: Math.max(12, Math.min(bounds.right - width, window.innerWidth - width - 12)), top: bounds.bottom + 8 })
    }
    place(); window.addEventListener('resize', place)
    return () => window.removeEventListener('resize', place)
  }, [anchor, open])

  useEffect(() => {
    mutedRef.current = muted
  }, [muted])

  useEffect(() => {
    focusedRef.current = focusWithin
    openRef.current = open
    paintFloorRef.current = open && !accountOpen && !bagOpen && !tradeView && !friendsOpen
    tradeViewRef.current = tradeView
  }, [focusWithin, open, tradeView, accountOpen, bagOpen, friendsOpen])

  useEffect(()=>{if(socialBadge>0)setAttention(true)},[socialBadge])

  useEffect(() => {
    if (open) setAttention(false)
  }, [open])

  useEffect(() => { admissionRef.current = admission }, [admission])

  useEffect(() => {
    if (!online) return
    let alive = true
    void workshopEndpoint().then(url => { if (alive) setEndpoint(url) }).catch(() => { /* invalid saved endpoint stays offline */ })
    return () => { alive = false }
  }, [online])

  useEffect(() => {
    game.self.name = name
    game.self.hat = hat
    game.lastFull = 0
  }, [game, name, hat])

  useEffect(() => () => window.clearTimeout(hoverTimer.current), [])

  const dropDeadSession = (announce = true) => {
    const dropped = clearLocalSession()
    // Always reload from storage so a stale in-memory account bag cannot seed signup.
    Object.assign(game.profile, loadProfile())
    setIdentity(null)
    if (!dropped) return
    if (announce) toast.info('Signed out — that account is no longer available.')
    onIdentityChange()
  }

  useEffect(() => {
    if (!online) { setLink('solo'); return }
    if (!endpoint) { setLink('offline'); setAdmission('inside'); return }
    let alive = true
    setAdmission('pending')
    const account = storedAccount()
    const cloud = new CloudConnection(endpoint, {
      op: 'hello', device: game.profile.device, session: game.self.id,
      name: game.self.name, token: account?.token ?? null,
    }, room, notice => {
      if (!alive) return
      if (notice.op === 'packet' && admissionRef.current === 'inside') receive(game, notice.message, net())
      else if (notice.op === 'snapshot' && admissionRef.current === 'inside') {
        const seqs = new Map(game.seqs)
        for (const message of notice.messages) {
          game.seqs.delete(message.id)
          receive(game, message, net())
          seqs.set(message.id, Math.max(seqs.get(message.id) ?? -1, message.seq))
        }
        game.seqs = seqs
      }
      else if (notice.op === 'joined') {
        if (notice.room !== room) { onWorld(notice.room); return }
        const own = game.tree[game.self.id] ?? 0
        game.tree = { ...notice.tree, [game.self.id]: Math.max(own, notice.tree[game.self.id] ?? 0) }
        game.stage = treeStage(treeTotal(game.tree))
        setIdentity(notice.identity); setAdmission('inside'); admissionRef.current = 'inside'
        game.lastFull = 0; game.quietUntil = performance.now() + JOIN_QUIET_MS
      } else if (notice.op === 'waiting') {
        game.peers.clear(); setAdmission(notice.status); admissionRef.current = notice.status
      } else if (notice.op === 'directory') {
        setPlayers(notice.players); setCounts(notice.counts)
        const me = notice.players.find(p => p.id === game.self.id)
        if (me) setIdentity(me)
      } else if (notice.op === 'knocks') setKnocks(notice.entries)
      else if (notice.op === 'notice') {
        toast.info(notice.text)
        game.chatLog.push({ key: ++game.chatKey, id: 'system', name: 'Workshop', text: notice.text, self: false })
        game.chatLog = game.chatLog.slice(-50)
      }
      else if (notice.op === 'dm') { setDms(prev => [...prev, notice.message].slice(-50)); if (notice.message.from !== game.self.id) { setDmTo(notice.message.from); setChatOpen(true) } }
      else if (notice.op === 'history') setDms(notice.messages)
      else if (notice.op === 'social') setSocialTick(n=>n+1)
    }, live => {
      if (!alive) return
      setLink(live ? 'live' : 'offline')
      if (!live) { game.peers.clear(); setPlayers([]); setCounts({}); setKnocks([]); setAdmission('inside'); admissionRef.current = 'inside' }
    }, () => { if (alive) dropDeadSession(false) })
    cloudRef.current = cloud
    sendRef.current = payload => {
      if (admissionRef.current !== 'inside') return
      cloud.send({ op: 'packet', message: { ...payload, id: game.self.id, seq: ++game.seq } })
    }
    return () => { alive = false; cloud.close(); cloudRef.current = null; sendRef.current = () => {}; game.peers.clear() }
  }, [game, room, online, endpoint])

  useEffect(() => {
    const directory = new Map(players.map(player => [player.id, player]))
    const applyIdentity = () => {
      for (const elf of [game.self, ...game.peers.values()]) {
        const who = directory.get(elf.id) ?? (elf === game.self ? identity : null)
        elf.cloudKing = !!who?.userId && !!who.king
        elf.cloudTitle = [who?.king ? 'King ' + who.king : '', ...(who?.titles ?? [])].filter(Boolean).join(' · ')
        elf.signedIn = !!who?.userId
      }
    }
    applyIdentity()
    const timer = window.setInterval(applyIdentity, 1000)
    return () => window.clearInterval(timer)
  }, [game, players, identity])

  useEffect(() => {
    if (!endpoint || !online) return
    const api = new CloudApi(endpoint)
    let alive = true, busy = false
    const poll = async () => {
      try { const next = await api.events(); if (alive) setEvents(next) } catch { /* cached windows expire locally */ }
    }
    const sync = async () => {
      const account = storedAccount()
      if (!account || busy || admissionRef.current !== 'inside') return
      busy = true
      const before = JSON.stringify(game.profile)
      try {
        let raw: unknown, conflict = false
        try { raw = await api.request('/profile', { profile: game.profile, name: game.self.name, revision: account.revision }) }
        catch (error) {
          if (!(error instanceof Error) || !error.message.includes('Profile changed')) throw error
          conflict = true
          raw = await api.request('/profile')
        }
        if (!alive) return
        const next = parseSnapshot(raw)
        account.revision = next.revision; account.identity = next.identity; cacheAccount(account)
        const removed = new Set(next.removedBagUids)
        if (conflict) {
          // Server bag wins on revision conflict (admin edits / other device). Never re-push
          // locally cached copies of items the server already deleted.
          const device = game.profile.device
          const escrow = game.profile.escrow
          Object.assign(game.profile, next.profile)
          game.profile.device = device
          game.profile.escrow = escrow
          game.profile.bag = game.profile.bag.filter((entry) => !removed.has(entry.uid))
          for (const slot of WEARABLE_SLOTS) {
            if (game.profile.equipped[slot] && !game.profile.bag.some((entry) => entry.item === game.profile.equipped[slot])) {
              game.profile.equipped[slot] = null
            }
          }
        } else if (JSON.stringify(game.profile) === before) {
          next.profile.device = game.profile.device
          next.profile.escrow = game.profile.escrow
          const held = new Set(next.profile.escrow.map(e => e.entry.uid))
          next.profile.bag = next.profile.bag.filter(e => !held.has(e.uid) && !removed.has(e.uid))
          Object.assign(game.profile, next.profile)
        } else {
          const sent = JSON.parse(before) as typeof game.profile
          const serverUids = new Set(next.profile.bag.map((e) => e.uid))
          // Keep in-flight local loot, but drop anything the server explicitly tombstoned
          // or that vanished from the server bag while our revision still matched.
          const keepLocal = game.profile.bag.filter((entry) => !removed.has(entry.uid) && (serverUids.has(entry.uid) || !sent.bag.some((old) => old.uid === entry.uid)))
          const additions = next.profile.bag.filter((e) => !sent.bag.some((old) => old.uid === e.uid))
          game.profile.bag = mergeBag(keepLocal, additions)
          for (const slot of WEARABLE_SLOTS) {
            if (game.profile.equipped[slot] && !game.profile.bag.some((entry) => entry.item === game.profile.equipped[slot])) {
              game.profile.equipped[slot] = null
            }
          }
        }
        setIdentity(next.identity); syncSelf(game); saveProfile(game.profile)
        localStorage.setItem(`workshop-account-cache:${next.identity.userId}`,JSON.stringify(game.profile))
      } catch (error) {
        if (error instanceof SessionLostError) dropDeadSession()
        /* otherwise account cache remains playable offline */
      } finally { busy = false }
    }
    void poll(); void sync()
    const eventsTimer = window.setInterval(() => void poll(), 60000)
    const profileTimer = window.setInterval(() => void sync(), 10000)
    const onOpen = () => void poll()
    window.addEventListener('workshop-open', onOpen)
    return () => { alive = false; window.clearInterval(eventsTimer); window.clearInterval(profileTimer); window.removeEventListener('workshop-open', onOpen) }
  }, [endpoint, online, game])

  useEffect(() => { if (open && online) window.dispatchEvent(new Event('workshop-open')) }, [open, online])

  useEffect(() => {
    if (!events.length) return
    const timer = window.setInterval(() => setEventTime(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [events.length])

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
      game.leader = null
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
    let dpr = 1
    const measure = () => {
      const width = panel.clientWidth || game.width
      const height = panel.clientHeight || PANEL_H
      dpr = Math.min(2, window.devicePixelRatio || 1)
      game.width = width
      game.height = height
      game.layout = layoutFor(width, height)
      fit(panel, width, height, dpr)
      fit(mini, MINI_W, MINI_H, 1)
    }
    measure()
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure)
    observer?.observe(panel)
    window.addEventListener('resize', measure)
    // Presence is independent of canvas rendering, including minimized windows.
    const presenceTimer = window.setInterval(() => netTick(game, performance.now(), sendRef.current), 60)
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame)
      const expanded = paintFloorRef.current && !document.hidden
      // Visible canvases follow the display refresh rate, including the collapsed widget.
      if (document.hidden && now - last < 100) return
      const dt = Math.min(0.05, Math.max(0, (now - last) / 1000))
      last = now
      if (!arrived) {
        arrived = true
        arrive(game)
      }
      const net: Net = { send: sendRef.current, sound: !mutedRef.current }
      if (admissionRef.current === 'inside') step(game, dt, now, focusedRef.current, net)
      if (expanded) renderPanel(panelCtx, game, now, dpr)
      if (!document.hidden) renderMini(miniCtx, game, now, 1, MINI_W, MINI_H)
    }
    raf = requestAnimationFrame(frame)
    return () => {
      cancelAnimationFrame(raf)
      window.clearInterval(presenceTimer)
      observer?.disconnect()
      window.removeEventListener('resize', measure)
    }
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
    if (dmTo) {
      cloudRef.current?.send({ op: 'dm', to: dmTo, text: chatDraft }); setChatDraft(''); return
    }
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
    const decor = placeableAt(game, x, y)
    const ownedDecor = decor !== null && game.floorItems.get(decor)?.owner === s.id
    setEmotesOpen(false)
    if (hit && hit !== s) {
      setCard((prev) => (prev?.id === hit.id ? null : { id: hit.id, x }))
    } else if (ownedDecor && decor && takePlaceable(game, decor, net(), performance.now())) {
      setCard(null)
    } else if (hit === s) {
      game.jumpQueued = true
      setCard(null)
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

  const guestEvent = (event: EventView) => {
    const key = `workshop-event:${event.id}:${game.profile.device}`
    let state = guestEventsRef.current.get(key)
    if (!state) {
      try { state = JSON.parse(readStored(key) ?? 'null') ?? { baseline: game.profile.stats[event.metric], optedIn: !event.optIn } }
      catch { state = { baseline: game.profile.stats[event.metric], optedIn: !event.optIn } }
      state ??= { baseline: game.profile.stats[event.metric], optedIn: !event.optIn }
      guestEventsRef.current.set(key, state)
      writeStored(key, JSON.stringify(state))
    }
    return { key, ...state, value: state.optedIn ? Math.max(0,game.profile.stats[event.metric] - state.baseline) : 0 }
  }
  const activeEvents = events.filter(event => eventActive(event, identity?.crew ?? (readStored('workshop-guest-crew') as typeof CREWS[number] | null), eventTime))

  const profile = game.profile
  const others = Math.max(0, snapshot.roster.length - 1)
  const presence =
    link === 'live' && admission !== 'inside' ? 'Outside room' : link === 'solo'
      ? 'Your world'
      : link === 'offline'
        ? 'Offline'
        : link === 'joining'
          ? 'Joining…'
          : others === 0
            ? 'Just you'
            : `${others + 1} here`
  const nextUnlock = nextTreeMilestone(snapshot.total)
  const recentChat = game.chatLog.slice(-4)
  const cardInfo = cardPeer ? snapshot.roster.find((r) => r.id === cardPeer.id) : undefined
  const cardTitle = cardPeer ? cardPeer.cloudTitle || ACHIEVEMENT_BY_ID.get(cardPeer.title)?.title : undefined
  const cardGear = cardPeer
    ? [cardPeer.equip.hat, cardPeer.equip.shirt, cardPeer.equip.pet, cardPeer.equip.trail].flatMap((id) => {
        const def = id ? ITEM_BY_ID.get(id) : undefined
        return def ? [def] : []
      })
    : []

  return (
    <div ref={wrapperRef} className={cn('relative', className)}>
      <button
        data-workshop-chip
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
        data-workshop-panel
        className={cn(
          'z-40 flex flex-col overflow-y-auto overscroll-contain rounded-xl border border-border/50 bg-card/[0.97] text-foreground shadow-elev-lg',
          'transition-[opacity,visibility] duration-100',
          anchor === 'titlebar' ? 'fixed w-[min(920px,calc(100vw-1.5rem))]' : 'absolute top-full inset-x-0 mt-2',
          open ? 'visible opacity-100' : 'pointer-events-none invisible opacity-0',
        )}
        style={{ ...(anchor === 'titlebar' ? panelPosition : {}), maxHeight: anchor === 'titlebar' ? 'calc(100dvh - ' + (panelPosition.top + 12) + 'px)' : 'calc(100dvh - 100px)' }}
        onMouseEnter={hoverIn}
        onMouseLeave={hoverOut}
        onFocus={() => setFocusWithin(true)}
        onBlur={onBlur}
      >
        <div data-workshop-stage className="relative shrink-0 overflow-hidden" style={{ height: PANEL_H }}>
        <canvas
          ref={panelRef}
          tabIndex={open ? 0 : -1}
          aria-label="Workshop floor. Click to walk or click an elf, arrow keys or A and D to move, Space to jump, jump again with wings, Enter to chat, F to throw a snowball, 1 to 5 for emotes, B for your bag."
          className="absolute inset-0 h-full w-full cursor-pointer outline-none"
          onPointerDown={onPointerDown}
          onKeyDown={onKeyDown}
          onKeyUp={onKeyUp}
        />

        <div className="absolute left-2 right-2 top-2 z-10 flex flex-wrap items-center gap-1.5">
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
            <button type="button" className={cn(TOOL, world === 'anexya-general' && 'bg-primary/10 text-primary')} aria-pressed={world === 'anexya-general'} onClick={() => onWorld('anexya-general')}>General</button>
            <select aria-label="Workshop room" value={world === 'home' ? '' : world} onChange={e => onWorld(e.target.value as World)} className="h-6 max-w-[125px] cursor-pointer rounded-md border border-border/50 bg-background/80 px-1.5 text-[11px] text-foreground shadow-sm outline-none focus-visible:ring-1 focus-visible:ring-primary/50">
              {world === 'home' && <option value="">Crew rooms</option>}
              {ROOMS.map(r => <option key={r.id} value={r.id}>{r.id === 'anexya-general' ? 'Crew rooms' : r.name + ' · ' + (counts[r.id] ?? 0)}</option>)}
            </select>
            <button type="button" className={cn(TOOL, world === 'home' && 'bg-primary/10 text-primary')} aria-pressed={world === 'home'} onClick={() => onWorld('home')}><Home className="h-3 w-3" />Home</button>
          <span className={cn(TOOL, 'cursor-default hover:bg-background/80')} title={link === 'offline' ? 'The Workshop server is unavailable. You can still play locally.' : 'Shared cloud room'}><Users className="h-3 w-3 opacity-70" />{presence}</span>
          <button type="button" className={TOOL} onClick={() => setAccountOpen(true)}>{identity?.userId ? '✓ ' + identity.crew : 'Guest · ' + (readStored('workshop-guest-crew') || 'Unaffiliated')}</button>
          <button type="button" aria-label="Friends & messages" className={TOOL} onClick={() => setFriendsOpen(true)}><Heart className="h-3 w-3 text-rose-500" />Friends{socialBadge > 0 && <span className="min-w-4 rounded-full bg-emerald-700 px-1 text-[10px] leading-4 text-white">{socialBadge}</span>}</button>
          <button type="button" className={TOOL} onClick={toggleMute} title={muted ? 'Unmute sounds' : 'Mute sounds'} aria-label={muted ? 'Unmute sounds' : 'Mute sounds'}>{muted ? <VolumeX className="h-3 w-3" /> : <Volume2 className="h-3 w-3" />}</button>
          <button type="button" className={cn(TOOL, pinned && 'text-primary')} onClick={togglePin} aria-label={pinned ? 'Unpin the floor' : 'Pin the floor open'} aria-pressed={pinned}>{pinned ? <PinOff className="h-3 w-3" /> : <Pin className="h-3 w-3" />}</button>
          <button type="button" className={TOOL} aria-label="Close Workshop" onClick={e => { window.clearTimeout(hoverTimer.current); setPinned(false); writeStored(PIN_KEY,'0'); setHovered(false); setFocusWithin(false); setChatOpen(false); setEmotesOpen(false); setCard(null); panelRef.current?.blur(); e.currentTarget.blur() }}><X className="h-3 w-3" /></button>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className={cn(TOOL, 'ml-auto')}
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
        {!pending && !hintSeen && <div className="pointer-events-none absolute left-1/2 top-[68px] hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-background/70 px-2 py-0.5 text-[10px] text-muted-foreground backdrop-blur-sm xl:block">Click to walk · Space jump · Enter chat · F snowball · B bag</div>}

        {admission !== 'inside' && link !== 'offline' && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-card/95 p-5 text-center text-sm text-foreground">
            <b>{ROOMS.find(r => r.id === room)?.name}</b>
            <span>{admission === 'pending' ? 'Waiting outside. This room’s King must allow your knock.' : admission === 'denied' ? 'Your knock was denied.' : 'Knock to ask this room’s King for entry.'}</span>
            {admission !== 'pending' && <button type="button" className={TOOL} onClick={() => cloudRef.current?.send({ op: 'knock' })}>Knock</button>}
            <button type="button" className={TOOL} onClick={() => onWorld('anexya-general')}>Return to General</button>
          </div>
        )}
        {emotesOpen && (
          <div className="absolute left-2 top-16 z-20 flex gap-1 rounded-lg border border-border/60 bg-popover/95 p-1 shadow-elev-md backdrop-blur-sm">
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




        </div>
        {cardPeer && card && (
          <div
            className="mx-2 my-2 w-72 shrink-0 rounded-lg border border-border/60 bg-popover/95 p-2.5 text-xs shadow-elev-lg backdrop-blur-sm animate-in fade-in-0 zoom-in-95"
          >
            <div className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: ELF_OUTFITS[cardPeer.hat % ELF_OUTFITS.length].hat }} />
              <span className="truncate font-semibold">{cardPeer.name}{cardPeer.signedIn ? ' ✓' : ''}</span>
              {cardInfo?.leader && <Crown className="h-3 w-3 shrink-0 text-amber-500" />}
            </div>
            {players.find(p=>p.id===cardPeer.id)?.handle&&<p className="mt-1 truncate font-mono text-[10px] text-muted-foreground">@{players.find(p=>p.id===cardPeer.id)?.handle}</p>}
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
                  <span key={def.id} title={def.name} className="grid h-7 w-7 place-items-center rounded-md bg-muted">
                    <ItemIcon item={def} size={20} />
                  </span>
                ))
              )}
            </div>
            {identity && world !== 'home' && canModerate(identity, world) && <button type="button" className={TOOL} onClick={() => {
              const target = players.find(p => p.id === cardPeer.id)
              if (target) cloudRef.current?.send({ op: 'moderate', subject: target.userId ? 'user:' + target.userId : target.subject, action: 'kick' })
              setCard(null)
            }}>Kick to General</button>}
            {identity?.userId&&players.find(p=>p.id===cardPeer.id)?.handle&&<button type="button" className={TOOL} onClick={async()=>{
              const target=players.find(p=>p.id===cardPeer.id)
              if(!target?.handle)return
              try{await new CloudApi(endpoint).friendAction('request',target.handle);setSocialTick(n=>n+1);setFriendsOpen(true);setCard(null)}catch(e){toast.info(e instanceof Error?e.message:'Could not add friend')}
            }}><Heart className="h-3.5 w-3.5"/>Add friend</button>}
            <button type="button" className={TOOL} onClick={() => { setDmTo(cardPeer.id); setChatOpen(true); cloudRef.current?.send({ op: 'history', to: cardPeer.id, text: '' }); setCard(null) }}>Private message</button>
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
        {isWorkshopStaging(endpoint) && (
          <div role="status" className="shrink-0 border-b border-amber-600/50 bg-amber-400 px-3 py-1.5 text-center text-[11px] font-semibold tracking-wide text-amber-950">
            Staging — not production. Accounts, bags, and events here are separate.
          </div>
        )}
        {admission === 'inside' && activeEvents.length > 0 && <div className="flex max-h-32 shrink-0 gap-3 overflow-auto border-b border-border/50 bg-amber-500/5 px-3 py-2 text-xs">{activeEvents.map(event => {
          const progress = identity?.userId ? event : { ...event, ...guestEvent(event) }
          return <div key={event.id} className="min-w-[240px] flex-1 rounded-lg border border-amber-400/30 bg-background p-3"><b>{event.title}</b><p>{event.body}</p>{event.kind !== 'announcement' && <span>{progress.value}/{event.target} · {event.metric}{!identity?.userId ? ' · local progress, no cloud reward' : ''}</span>}{event.optIn && !progress.optedIn && <button type="button" className={TOOL} onClick={async () => {
            try {
              if (identity?.userId) { await new CloudApi(endpoint).request(`/events/${encodeURIComponent(event.id)}/join`, {}); setEvents(await new CloudApi(endpoint).events()) }
              else { const local = guestEvent(event); const next = { baseline: game.profile.stats[event.metric], optedIn: true }; guestEventsRef.current.set(local.key,next); writeStored(local.key, JSON.stringify(next)); setVersion(n => n+1) }
            } catch (e) { toast.info(String(e)) }
          }}>Join</button>}{event.pairingStatus && <p>{event.pairingStatus}</p>}</div>
        })}</div>}

        {knocks.length > 0 && <div className="max-h-32 shrink-0 overflow-y-auto border-b border-amber-400/30 bg-amber-500/5 px-4 py-3 text-xs"><b>Knocks</b>{knocks.map(k => <div key={k.subject} className="mt-1 flex items-center gap-2"><span>{k.name}</span>{(['allow','deny'] as const).map(action => <button key={action} type="button" className={TOOL} onClick={() => cloudRef.current?.send({ op: 'moderate', subject: k.subject, action })}>{action === 'allow' ? 'Allow' : 'Deny'}</button>)}</div>)}</div>}


        {chatOpen && (
          <form onSubmit={submitChat} className="shrink-0 space-y-2 border-t border-border/60 bg-background p-3">
            <div className="flex items-center gap-2"><MessageCircle className="h-4 w-4 text-muted-foreground" /><select aria-label="Chat recipient" value={dmTo} onChange={e => { setDmTo(e.target.value); if (e.target.value) cloudRef.current?.send({ op: 'history', to: e.target.value, text: '' }) }} className="h-8 min-w-0 flex-1 rounded-md border bg-background px-2 text-xs">
              <option value="">Room chat</option>
              {players.filter(p => p.id !== game.self.id).map(p => <option key={p.id} value={p.id}>Private · {p.name} · {p.room}</option>)}
            </select><button type="button" className={TOOL} aria-label="Close chat" onClick={() => closeChat(true)}><X className="h-3.5 w-3.5" /></button></div>
            {dmTo && <div className="max-h-24 overflow-auto rounded bg-background/90 p-1 text-xs">{dms.filter(m => m.from === dmTo || m.to === dmTo).slice(-8).map((m,i) => <div key={i}><b>{m.name}:</b> {m.text}</div>)}</div>}
            {!dmTo && recentChat.length > 0 && (
              <div className="max-h-24 space-y-1 overflow-y-auto rounded-lg bg-muted/40 px-3 py-2 text-xs leading-5">
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
            <div className="flex gap-2"><input
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
              className="h-10 min-w-0 flex-1 rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
            /><button type="submit" className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground hover:bg-primary/90"><Send className="h-3.5 w-3.5" />Send</button></div>
            {chatNote && <div className="mt-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-300">{chatNote}</div>}
          </form>
        )}


      </div>

      <WorkshopAccount open={accountOpen} onOpenChange={setAccountOpen} identity={identity} online={online} endpoint={endpoint} name={name} profile={profile}
        onPrepare={() => flushProfile(game)}
        onAccountChanged={() => { Object.assign(game.profile,loadProfile()); onIdentityChange() }}
        onEndpoint={setEndpoint}
        onGuestCrewChange={() => setVersion(n => n+1)}
      />
      <WorkshopFriends open={friendsOpen} onOpenChange={setFriendsOpen} identity={identity} online={online} endpoint={endpoint} refreshToken={socialTick} onBadge={setSocialBadge} onSignIn={()=>setAccountOpen(true)}/>

      <WorkshopBag
        open={bagOpen}
        onOpenChange={setBagOpen}
        profile={profile}
        locked={lockedUids(game)}
        onEquip={(slot, id) => equipFromBag(game, slot, id)}
        onTitle={(id) => chooseTitle(game, id)}
        onConsume={(uid) => {
          useFromBag(game, uid, net(), performance.now())
        }}
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
