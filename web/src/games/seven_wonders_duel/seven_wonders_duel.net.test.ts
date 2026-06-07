/* SEVEN WONDERS DUEL — netplay tests. Adapter round-trip (legal/illegal/out-of-turn),
 * a real host/guest integration over an in-memory transport, and a hidden-info structural
 * LEAK test proving the guest's view never carries the identity of FACE-DOWN pyramid cards
 * (their card id is masked while their slot position/layout stays intact). */

import { describe, it, expect } from 'vitest'
import { sevenWondersDuelAdapter as A, type SWDIntent } from './net'
import * as G from './logic'
import { HostSession, GuestSession } from '../../net/session'
import { memoryPair } from '../../net/transport'

/** A deterministic game so every assertion is reproducible. */
function game() { return G.makeGame({ noShuffle: true }) }

describe('seven wonders duel net adapter', () => {
  it('starts with seat 0 to move on a 2-seat game', () => {
    const s = game()
    expect(A.numSeats(s)).toBe(2)
    expect(A.seatToMove(s)).toBe(0)
    expect(A.isOver(s)).toBe(false)
  })

  it('takes (builds) an accessible card and passes the turn to seat 1', () => {
    const s = game()
    const acc = G.accessibleCards(s)
    const target = acc.find(c => G.canAfford(s, 0, c)) ?? acc[0]
    const isBuildable = G.canAfford(s, 0, target)
    const s2 = A.applyIntent(s, 0, { kind: 'take', cardId: target.id })
    if (isBuildable) {
      expect(s2).not.toBe(s)
      expect(s2.turn).toBe(1)
      expect(A.seatToMove(s2)).toBe(1)
      expect(G.isAccessible(s2, target.id)).toBe(false) // card left the pyramid
      expect(A.tickKey(s2)).not.toBe(A.tickKey(s)) // tickKey changed (step advanced)
    } else {
      // unaffordable build is rejected -> same ref
      expect(s2).toBe(s)
    }
  })

  it('discards an accessible card for coins and advances', () => {
    const s = game()
    const target = G.accessibleCards(s)[0]
    const before = s.players[0].coins
    const s2 = A.applyIntent(s, 0, { kind: 'discard', cardId: target.id })
    expect(s2).not.toBe(s)
    expect(s2.players[0].coins).toBeGreaterThan(before)
    expect(s2.turn).toBe(1)
    expect(A.tickKey(s2)).not.toBe(A.tickKey(s))
  })

  it('feeds a card to one of the seat\'s own wonders', () => {
    const s = game()
    const target = G.accessibleCards(s)[0]
    const w = s.players[0].wonders.find(x => !x.built && G.canAffordWonder(s, 0, x))
    if (w) {
      const s2 = A.applyIntent(s, 0, { kind: 'wonder', cardId: target.id, wonderId: w.id })
      expect(s2).not.toBe(s)
      expect(s2.players[0].wonders.find(x => x.id === w.id)!.built).toBe(true)
      expect(s2.turn).toBe(1)
    }
  })

  it('ignores an out-of-turn intent (returns the same ref)', () => {
    const s = game()
    const target = G.accessibleCards(s)[0]
    // seat 1 tries to act while it is seat 0's turn
    expect(A.applyIntent(s, 1, { kind: 'discard', cardId: target.id })).toBe(s)
  })

  it('ignores illegal intents (returns the same ref)', () => {
    const s = game()
    // a covered (inaccessible) card: the very top slot is covered by the row below
    const topId = s.pyramid[0].cardId!
    expect(G.isAccessible(s, topId)).toBe(false)
    expect(A.applyIntent(s, 0, { kind: 'take', cardId: topId })).toBe(s)
    expect(A.applyIntent(s, 0, { kind: 'discard', cardId: topId })).toBe(s)
    // a card id that does not exist
    expect(A.applyIntent(s, 0, { kind: 'take', cardId: 'nope' })).toBe(s)
    // a wonder that does not belong to the seat
    const acc = G.accessibleCards(s)[0]
    expect(A.applyIntent(s, 0, { kind: 'wonder', cardId: acc.id, wonderId: 'not-a-wonder' })).toBe(s)
  })
})

function connect() {
  const host = new HostSession(A)
  const [a, b] = memoryPair()
  host.addGuest(a)
  const guest = new GuestSession(A, b)
  return { host, guest }
}

describe('seven wonders duel host + guest over an in-memory transport', () => {
  it('assigns the guest seat 1 and syncs the initial view', () => {
    const { host, guest } = connect()
    expect(guest.ready()).toBe(true)
    expect(guest.mySeat()).toBe(1)
    expect(host.getSeats().map(s => s.kind)).toEqual(['host', 'guest'])
    expect(guest.getState().pyramid.length).toBe(host.getFull().pyramid.length)
  })

  it('relays the host move, then a guest reply, staying in sync', () => {
    const { host, guest } = connect()
    // host (seat 0) discards an accessible card first (always legal -> deterministic)
    const h0 = G.accessibleCards(host.getFull())[0]
    host.dispatchLocal({ kind: 'discard', cardId: h0.id } as SWDIntent)
    expect(host.isMyTurn()).toBe(false)
    expect(guest.isMyTurn()).toBe(true)

    // guest (seat 1) replies; intent travels host-ward and applies
    const before = host.getFull().step
    const g0 = G.accessibleCards(guest.getState())[0]
    guest.dispatch({ kind: 'discard', cardId: g0.id } as SWDIntent)
    expect(host.getFull().step).toBe(before + 1)
    expect(host.getFull().turn).toBe(0) // back to the host
    expect(host.isMyTurn()).toBe(true)
    // guest's view reflects the host's authoritative state
    expect(guest.getState().step).toBe(host.getFull().step)
  })

  it('rejects an out-of-turn guest intent (host stays authoritative)', () => {
    const { host, guest } = connect()
    const before = host.getFull().step
    // it is the host's (seat 0) turn, but the guest tries to act
    const g0 = G.accessibleCards(guest.getState())[0]
    guest.dispatch({ kind: 'discard', cardId: g0.id } as SWDIntent)
    expect(host.getFull().step).toBe(before) // nothing changed
  })
})

describe('seven wonders duel hidden-info redaction (leak test)', () => {
  it("the guest's view masks the identity of every face-down pyramid card", () => {
    const { host, guest } = connect()
    const full = host.getFull()
    const view = guest.getState() // guest is seat 1

    // There ARE face-down cards in the fresh Age I pyramid.
    const faceDownIdx = full.pyramid
      .map((sl, i) => ({ sl, i }))
      .filter(({ sl }) => !sl.faceUp && sl.cardId != null)
      .map(({ i }) => i)
    expect(faceDownIdx.length).toBeGreaterThan(0)

    for (const i of faceDownIdx) {
      // The real (secret) card id...
      const secret = full.pyramid[i].cardId!
      // ...must be masked to the placeholder in the wire view.
      expect(view.pyramid[i].cardId).toBe('?')
      expect(view.pyramid[i].cardId).not.toBe(secret)
      // ...but the slot's POSITION / layout is preserved.
      expect(view.pyramid[i].faceUp).toBe(false)
      expect(view.pyramid[i].row).toBe(full.pyramid[i].row)
      expect(view.pyramid[i].covers).toEqual(full.pyramid[i].covers)
    }

    // Face-UP (public) cards keep their real identity, and the count of cards is unchanged.
    for (let i = 0; i < full.pyramid.length; i++) {
      if (full.pyramid[i].faceUp) expect(view.pyramid[i].cardId).toBe(full.pyramid[i].cardId)
    }
    const viewCardCount = view.pyramid.filter(sl => sl.cardId != null).length
    const fullCardCount = full.pyramid.filter(sl => sl.cardId != null).length
    expect(viewCardCount).toBe(fullCardCount)

    // No secret face-down id should appear as any slot's id in the wire view.
    const secrets = faceDownIdx.map(i => full.pyramid[i].cardId!)
    const wireSlotIds = new Set(view.pyramid.map(sl => sl.cardId))
    for (const id of secrets) expect(wireSlotIds.has(id)).toBe(false)
  })
})
