/**
 * Peer-to-peer item trades over lossy multicast, with no server to arbitrate. Each side commits
 * on its own once both have locked in on identical terms (`give`/`get` must mirror each other),
 * so a stale or reordered message can never complete a deal neither player saw. Locking in is
 * one-way; only cancelling backs out, and a cancel that crosses the partner's commit still
 * honours the deal it was locked into.
 */
import { WORKSHOP_TRADE_MAX_ITEMS, type WorkshopTradePayload } from './workshop-protocol'

export const TRADE_REQUEST_TIMEOUT_MS = 20_000
export const TRADE_IDLE_TIMEOUT_MS = 180_000
export const TRADE_RESEND_MS = 600
const REQUEST_RESEND_MS = 2000
const DONE_SENDS = 4
const LATE_DONE_MS = 10_000

export type TradePhase = 'outgoing' | 'incoming' | 'open' | 'done' | 'closed'
export type TradeCloseReason = 'declined' | 'cancelled' | 'timeout' | 'left' | 'busy' | 'invalid'

export type TradeSession = {
  tid: string
  partner: string
  partnerName: string
  phase: TradePhase
  /** Our offered bag entry uids, and their item ids in the same order. */
  mine: string[]
  mineItems: string[]
  theirs: string[]
  myReady: boolean
  theirReady: { give: string[]; get: string[] } | null
  updatedAt: number
  lastSent: number
  doneSends: number
  reason: TradeCloseReason | null
}

export type TradeMessage = WorkshopTradePayload & { id: string }
/** What a completed trade does to the local bag: remove `uids`, add `items`. */
export type TradeCommit = { uids: string[]; items: string[] }
export type TradeResult = { session: TradeSession | null; out: WorkshopTradePayload[]; commit: TradeCommit | null }

function result(session: TradeSession | null, out: WorkshopTradePayload[] = [], commit: TradeCommit | null = null): TradeResult {
  return { session, out, commit }
}

export function sameItems(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false
  const x = [...a].sort()
  const y = [...b].sort()
  return x.every((v, i) => v === y[i])
}

const simple = (s: TradeSession, op: 'req' | 'accept' | 'cancel'): WorkshopTradePayload => ({
  t: 'trade',
  op,
  tid: s.tid,
  to: s.partner,
})
const offerMsg = (s: TradeSession): WorkshopTradePayload => ({ t: 'trade', op: 'offer', tid: s.tid, to: s.partner, items: [...s.mineItems] })
const termsMsg = (s: TradeSession, op: 'ready' | 'done'): WorkshopTradePayload => ({
  t: 'trade',
  op,
  tid: s.tid,
  to: s.partner,
  give: [...s.mineItems],
  get: [...s.theirs],
})

function session(tid: string, partner: string, partnerName: string, phase: TradePhase, now: number): TradeSession {
  return {
    tid,
    partner,
    partnerName,
    phase,
    mine: [],
    mineItems: [],
    theirs: [],
    myReady: false,
    theirReady: null,
    updatedAt: now,
    lastSent: now,
    doneSends: 0,
    reason: null,
  }
}

function close(s: TradeSession, reason: TradeCloseReason, now: number): TradeSession {
  return { ...s, phase: 'closed', reason, updatedAt: now }
}

function isActive(s: TradeSession | null): s is TradeSession {
  return s !== null && (s.phase === 'outgoing' || s.phase === 'incoming' || s.phase === 'open')
}

function tryCommit(s: TradeSession, now: number): TradeResult | null {
  if (!s.myReady || !s.theirReady) return null
  if (!sameItems(s.theirReady.give, s.theirs) || !sameItems(s.theirReady.get, s.mineItems)) return null
  const done: TradeSession = { ...s, phase: 'done', reason: null, updatedAt: now, lastSent: now, doneSends: 1 }
  return result(done, [termsMsg(done, 'done')], { uids: [...s.mine], items: [...s.theirs] })
}

export function openTrade(tid: string, partner: string, partnerName: string, now: number): TradeResult {
  const s = session(tid, partner, partnerName, 'outgoing', now)
  return result(s, [simple(s, 'req')])
}

export function acceptTrade(s: TradeSession, now: number): TradeResult {
  if (s.phase !== 'incoming') return result(s)
  const next: TradeSession = { ...s, phase: 'open', updatedAt: now }
  return result(next, [simple(next, 'accept')])
}

export function cancelTrade(s: TradeSession, now: number): TradeResult {
  if (!isActive(s)) return result(s)
  return result(close(s, s.phase === 'incoming' ? 'declined' : 'cancelled', now), [simple(s, 'cancel')])
}

/** Replaces our offer. Locked-in offers can't change; that's what makes locking in meaningful. */
export function offerItems(s: TradeSession, uids: readonly string[], itemIds: readonly string[], now: number): TradeResult {
  if (s.phase !== 'open' || s.myReady) return result(s)
  if (uids.length !== itemIds.length || uids.length > WORKSHOP_TRADE_MAX_ITEMS || new Set(uids).size !== uids.length) {
    return result(s)
  }
  const next: TradeSession = { ...s, mine: [...uids], mineItems: [...itemIds], theirReady: null, updatedAt: now }
  return result(next, [offerMsg(next)])
}

export function lockIn(s: TradeSession, now: number): TradeResult {
  if (s.phase !== 'open' || s.myReady) return result(s)
  const next: TradeSession = { ...s, myReady: true, updatedAt: now, lastSent: now }
  return tryCommit(next, now) ?? result(next, [termsMsg(next, 'ready')])
}

export function partnerLeft(s: TradeSession | null, now: number): TradeSession | null {
  return isActive(s) ? close(s, 'left', now) : s
}

export function receiveTrade(
  s: TradeSession | null,
  msg: TradeMessage,
  selfId: string,
  partnerName: string,
  now: number,
  isKnownItem: (id: string) => boolean,
): TradeResult {
  if (msg.to !== selfId) return result(s)

  if (msg.op === 'req') {
    if (s?.tid === msg.tid) return result(s)
    if (isActive(s)) return result(s, [{ t: 'trade', op: 'busy', tid: msg.tid, to: msg.id }])
    return result(session(msg.tid, msg.id, partnerName, 'incoming', now))
  }
  if (!s || s.tid !== msg.tid || s.partner !== msg.id) return result(s)

  switch (msg.op) {
    case 'accept':
      return result(s.phase === 'outgoing' ? { ...s, phase: 'open', updatedAt: now } : s)
    case 'busy':
      return result(s.phase === 'outgoing' ? close(s, 'busy', now) : s)
    case 'cancel':
      return result(isActive(s) ? close(s, s.phase === 'outgoing' ? 'declined' : 'cancelled', now) : s)
    case 'offer': {
      // A lost accept shows up as an offer while we're still waiting.
      const base = s.phase === 'outgoing' ? { ...s, phase: 'open' as const } : s
      if (base.phase !== 'open') return result(s)
      if (!msg.items.every(isKnownItem)) return result(close(base, 'invalid', now), [simple(base, 'cancel')])
      return result({ ...base, theirs: [...msg.items], theirReady: null, myReady: false, updatedAt: now })
    }
    case 'ready':
    case 'done': {
      if (s.phase === 'done') return result(s, msg.op === 'ready' ? [termsMsg(s, 'done')] : [])
      if (s.phase === 'closed') {
        const late =
          msg.op === 'done' &&
          s.myReady &&
          now - s.updatedAt < LATE_DONE_MS &&
          sameItems(msg.give, s.theirs) &&
          sameItems(msg.get, s.mineItems)
        if (!late) return result(s)
        return tryCommit({ ...s, phase: 'open', theirReady: { give: [...msg.give], get: [...msg.get] } }, now) ?? result(s)
      }
      let next: TradeSession = s.phase === 'outgoing' ? { ...s, phase: 'open' } : { ...s }
      if (next.phase !== 'open') return result(s)
      if (![...msg.give, ...msg.get].every(isKnownItem)) return result(close(next, 'invalid', now), [simple(next, 'cancel')])
      const out: WorkshopTradePayload[] = []
      if (!sameItems(msg.give, next.theirs)) {
        // Their offer never reached us or arrived out of order: take their terms, but we have to lock in again.
        next = { ...next, theirs: [...msg.give], myReady: false }
      }
      // They locked in against an old view of our offer; resend it so they can catch up.
      if (!sameItems(msg.get, next.mineItems)) out.push(offerMsg(next))
      next = { ...next, theirReady: { give: [...msg.give], get: [...msg.get] }, updatedAt: now }
      const committed = tryCommit(next, now)
      return committed ? { ...committed, out: [...out, ...committed.out] } : result(next, out)
    }
  }
}

/** Timeouts and resends; call every frame or so. */
export function tickTrade(s: TradeSession | null, now: number): TradeResult {
  if (!s) return result(null)
  switch (s.phase) {
    case 'outgoing':
      if (now - s.updatedAt > TRADE_REQUEST_TIMEOUT_MS) return result(close(s, 'timeout', now), [simple(s, 'cancel')])
      if (now - s.lastSent > REQUEST_RESEND_MS) return result({ ...s, lastSent: now }, [simple(s, 'req')])
      return result(s)
    case 'incoming':
      return result(now - s.updatedAt > TRADE_REQUEST_TIMEOUT_MS ? close(s, 'timeout', now) : s)
    case 'open':
      if (now - s.updatedAt > TRADE_IDLE_TIMEOUT_MS) return result(close(s, 'timeout', now), [simple(s, 'cancel')])
      if (s.myReady && now - s.lastSent > TRADE_RESEND_MS) return result({ ...s, lastSent: now }, [termsMsg(s, 'ready')])
      return result(s)
    case 'done':
      if (s.doneSends < DONE_SENDS && now - s.lastSent > TRADE_RESEND_MS) {
        return result({ ...s, lastSent: now, doneSends: s.doneSends + 1 }, [termsMsg(s, 'done')])
      }
      return result(s)
    default:
      return result(s)
  }
}
