import { describe, expect, it } from 'vitest'
import type { WorkshopTradePayload } from '../workshop-protocol'
import {
  TRADE_IDLE_TIMEOUT_MS,
  TRADE_REQUEST_TIMEOUT_MS,
  TRADE_RESEND_MS,
  acceptTrade,
  cancelTrade,
  lockIn,
  offerItems,
  openTrade,
  partnerLeft,
  receiveTrade,
  sameItems,
  tickTrade,
  type TradeCommit,
  type TradeResult,
  type TradeSession,
} from '../workshop-trade'

const A = 'aaaaaaaa'
const B = 'bbbbbbbb'
const known = (id: string) => id !== 'unknown-item'

type Side = { id: string; session: TradeSession | null; commits: TradeCommit[]; inbox: WorkshopTradePayload[] }

function side(id: string): Side {
  return { id, session: null, commits: [], inbox: [] }
}

/** Applies a local action and queues its messages for the other side. */
function apply(from: Side, to: Side, r: TradeResult) {
  from.session = r.session
  if (r.commit) from.commits.push(r.commit)
  to.inbox.push(...r.out)
}

function deliver(from: Side, to: Side, now = 0, keep: (m: WorkshopTradePayload) => boolean = () => true) {
  const batch = to.inbox.splice(0)
  for (const msg of batch) {
    if (!keep(msg)) continue
    apply(to, from, receiveTrade(to.session, { ...msg, id: from.id }, to.id, from.id === A ? 'Ada' : 'Bo', now, known))
  }
}

function openPair() {
  const a = side(A)
  const b = side(B)
  apply(a, b, openTrade('trade01', B, 'Bo', 0))
  deliver(a, b)
  expect(b.session?.phase).toBe('incoming')
  apply(b, a, acceptTrade(b.session!, 0))
  deliver(b, a)
  expect(a.session?.phase).toBe('open')
  return { a, b }
}

describe('workshop trades', () => {
  it('compares item lists as multisets', () => {
    expect(sameItems(['a', 'b', 'a'], ['a', 'a', 'b'])).toBe(true)
    expect(sameItems(['a', 'b'], ['a', 'a'])).toBe(false)
    expect(sameItems([], [])).toBe(true)
  })

  it('completes a swap with mirrored commits on both sides', () => {
    const { a, b } = openPair()
    apply(a, b, offerItems(a.session!, ['uidA1'], ['golden-epc'], 1))
    apply(b, a, offerItems(b.session!, ['uidB1', 'uidB2'], ['penguin', 'snowball'], 1))
    deliver(a, b)
    deliver(b, a)
    apply(a, b, lockIn(a.session!, 2))
    expect(a.commits).toEqual([])
    deliver(a, b)
    apply(b, a, lockIn(b.session!, 3))
    expect(b.commits).toEqual([{ uids: ['uidB1', 'uidB2'], items: ['golden-epc'] }])
    deliver(b, a)
    expect(a.commits).toEqual([{ uids: ['uidA1'], items: ['penguin', 'snowball'] }])
    expect(a.session?.phase).toBe('done')
    expect(b.session?.phase).toBe('done')
  })

  it('does not let a locked-in offer change', () => {
    const { a } = openPair()
    apply(a, side(B), offerItems(a.session!, ['u1'], ['snowball'], 1))
    apply(a, side(B), lockIn(a.session!, 2))
    const r = offerItems(a.session!, ['u2'], ['golden-epc'], 3)
    expect(r.out).toEqual([])
    expect(r.session?.mineItems).toEqual(['snowball'])
  })

  it('unlocks us when the partner changes their offer, and ignores stale locks', () => {
    const { a, b } = openPair()
    apply(a, b, offerItems(a.session!, ['u1'], ['snowball'], 1))
    deliver(a, b)
    apply(a, b, lockIn(a.session!, 2))
    // B changes its offer before seeing A's lock; A's stale lock must not complete the new deal.
    apply(b, a, offerItems(b.session!, ['v1'], ['penguin'], 2))
    deliver(a, b)
    expect(b.commits).toEqual([])
    deliver(b, a)
    expect(a.session?.myReady).toBe(false)
    apply(b, a, lockIn(b.session!, 3))
    deliver(b, a)
    expect(a.commits).toEqual([])
    apply(a, b, lockIn(a.session!, 4))
    expect(a.commits).toEqual([{ uids: ['u1'], items: ['penguin'] }])
    deliver(a, b)
    expect(b.commits).toEqual([{ uids: ['v1'], items: ['snowball'] }])
  })

  it('recovers when an offer is lost', () => {
    const { a, b } = openPair()
    apply(a, b, offerItems(a.session!, ['u1'], ['snowball'], 1))
    b.inbox.length = 0 // the offer never arrives
    apply(b, a, lockIn(b.session!, 2)) // B locks in expecting nothing from A
    deliver(b, a) // A sees a stale view and resends its offer
    expect(a.commits).toEqual([])
    deliver(a, b)
    expect(b.session?.theirs).toEqual(['snowball'])
    expect(b.session?.myReady).toBe(false)
    apply(a, b, lockIn(a.session!, 3))
    deliver(a, b)
    apply(b, a, lockIn(b.session!, 4))
    deliver(b, a)
    expect(b.commits).toEqual([{ uids: [], items: ['snowball'] }])
    expect(a.commits).toEqual([{ uids: ['u1'], items: [] }])
  })

  it('honours a deal when a cancel crosses the partner commit', () => {
    const { a, b } = openPair()
    apply(a, b, offerItems(a.session!, ['u1'], ['snowball'], 1))
    deliver(a, b)
    apply(a, b, lockIn(a.session!, 2))
    deliver(a, b)
    apply(b, a, lockIn(b.session!, 3)) // B commits and sends done
    expect(b.commits).toHaveLength(1)
    apply(a, b, cancelTrade(a.session!, 3)) // ...while A cancels
    deliver(b, a, 4)
    expect(a.commits).toEqual([{ uids: ['u1'], items: [] }])
    expect(a.session?.phase).toBe('done')
  })

  it('declines, reports busy, and rejects unknown items', () => {
    const { a, b } = openPair()
    const c = side('cccccccc')
    apply(c, b, openTrade('trade02', B, 'Bo', 0))
    deliver(c, b)
    deliver(b, c)
    expect(c.session?.phase).toBe('closed')
    expect(c.session?.reason).toBe('busy')
    expect(b.session?.tid).toBe('trade01')

    apply(b, a, offerItems(b.session!, ['x'], ['unknown-item'], 1))
    deliver(b, a)
    expect(a.session?.reason).toBe('invalid')
    deliver(a, b)
    expect(b.session?.phase).toBe('closed')
  })

  it('times out requests and idle trades, and resends what matters', () => {
    const req = openTrade('trade03', B, 'Bo', 0).session!
    expect(tickTrade(req, 2500).out[0]).toMatchObject({ op: 'req' })
    expect(tickTrade(req, TRADE_REQUEST_TIMEOUT_MS + 1).session?.reason).toBe('timeout')

    const { a } = openPair()
    const locked = lockIn(a.session!, 10).session!
    expect(tickTrade(locked, 10 + TRADE_RESEND_MS + 1).out[0]).toMatchObject({ op: 'ready' })
    expect(tickTrade(locked, 10 + TRADE_IDLE_TIMEOUT_MS + 1).session?.reason).toBe('timeout')
    expect(partnerLeft(locked, 20)?.reason).toBe('left')
  })

  it('ignores messages for someone else or another trade', () => {
    const { a } = openPair()
    const before = a.session
    const r = receiveTrade(a.session, { t: 'trade', op: 'cancel', tid: 'other01', to: A, id: B }, A, 'Bo', 1, known)
    expect(r.session).toBe(before)
    const r2 = receiveTrade(a.session, { t: 'trade', op: 'cancel', tid: 'trade01', to: 'zzzzzzzz', id: B }, A, 'Bo', 1, known)
    expect(r2.session).toBe(before)
  })
})
