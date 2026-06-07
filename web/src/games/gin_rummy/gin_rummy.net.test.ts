/* GIN RUMMY — netplay tests. Three parts:
 *   1. adapter round-trip: a legal draw advances; illegal / out-of-turn intents are no-ops.
 *   2. host + guest stay in sync over an in-memory transport (the headless online proof).
 *   3. leak test: the guest's view never contains the host's secret hand or the stock order. */

import { describe, it, expect } from 'vitest'
import { ginRummyAdapter as A, type GinIntent } from './net'
import { HostSession, GuestSession } from '../../net/session'
import { memoryPair } from '../../net/transport'
import * as G from './logic'

/** Build a deterministic match (seeded deal) so tests are stable. */
function game(): G.GinState {
  return G.makeGame(undefined, 12345)
}

describe('gin_rummy net adapter', () => {
  it('round-trips a legal intent and rejects illegal / out-of-turn ones', () => {
    const s = game()
    expect(A.seatToMove(s)).toBe(0) // 'you' draws first
    expect(A.isOver(s)).toBe(false)

    // Out-of-turn: seat 1 cannot act while it's seat 0's turn -> same state object.
    expect(A.applyIntent(s, 1, { kind: 'draw', source: 'stock' })).toBe(s)

    // Illegal for the current phase: you can't discard before drawing -> unchanged.
    const someId = s.you[0].id
    expect(A.applyIntent(s, 0, { kind: 'discard', cardId: someId })).toBe(s)

    // {kind:'next'} is illegal mid-hand -> unchanged.
    expect(A.applyIntent(s, 0, { kind: 'next' })).toBe(s)

    // Legal: seat 0 draws from the stock -> state changes, phase becomes discard.
    const s2 = A.applyIntent(s, 0, { kind: 'draw', source: 'stock' })
    expect(s2).not.toBe(s)
    expect(s2.phase).toBe('discard')
    expect(s2.you.length).toBe(G.HAND_SIZE + 1)
    expect(A.seatToMove(s2)).toBe(0) // still seat 0 (must discard)

    // Drawing again now is illegal (wrong phase) -> unchanged.
    expect(A.applyIntent(s2, 0, { kind: 'draw', source: 'stock' })).toBe(s2)

    // Discarding a card not in hand -> unchanged.
    expect(A.applyIntent(s2, 0, { kind: 'discard', cardId: 9999 })).toBe(s2)

    // Legal discard -> turn passes to seat 1, back to draw phase, tickKey changed.
    const before = A.tickKey(s2)
    const s3 = A.applyIntent(s2, 0, { kind: 'discard', cardId: s2.you[s2.you.length - 1].id })
    expect(s3).not.toBe(s2)
    expect(A.tickKey(s3)).not.toBe(before)
    expect(A.seatToMove(s3)).toBe(1)
    expect(s3.phase).toBe('draw')
  })

  it('host + guest stay in sync over an in-memory transport', () => {
    const host = new HostSession(A)
    const [a, b] = memoryPair(); host.addGuest(a)
    const guest = new GuestSession(A, b)

    expect(guest.mySeat()).toBe(1)
    expect(host.isMyTurn()).toBe(true)   // host = seat 0, draws first
    expect(guest.isMyTurn()).toBe(false)

    // Host (seat 0) plays a full turn: draw stock, then discard.
    host.dispatchLocal({ kind: 'draw', source: 'stock' })
    const hostHand = host.getFull().you
    host.dispatchLocal({ kind: 'discard', cardId: hostHand[hostHand.length - 1].id })

    // It is now the guest's turn and the guest's view reflects it.
    expect(host.isMyTurn()).toBe(false)
    expect(guest.isMyTurn()).toBe(true)
    expect(guest.getState().turn).toBe('ai')
    expect(guest.getState().phase).toBe('draw')

    // Guest (seat 1 = 'ai') replies: draw + discard. Intents travel host-ward and apply.
    const stepBefore = host.getFull().step
    guest.dispatch({ kind: 'draw', source: 'stock' })
    const guestHand = guest.getState().ai
    guest.dispatch({ kind: 'discard', cardId: guestHand[guestHand.length - 1].id })

    expect(host.getFull().step).toBeGreaterThan(stepBefore)
    expect(host.getFull().turn).toBe('you') // back to the host
    expect(host.isMyTurn()).toBe(true)
  })

  it('never leaks the opponent hand or the stock order to the guest', () => {
    const host = new HostSession(A)
    const [a, b] = memoryPair(); host.addGuest(a)
    const guest = new GuestSession(A, b)

    const full = host.getFull()
    const view = guest.getState()

    // The guest (seat 1 = 'ai') sees its own real hand...
    expect(view.ai.map(c => c.id).sort()).toEqual(full.ai.map(c => c.id).sort())
    // ...but the host's hand ('you') is fully blanked (count preserved, ids hidden).
    expect(view.you.length).toBe(full.you.length)
    expect(view.you.every(c => c.id === -1)).toBe(true)
    // ...and the whole stock is face-down (count preserved, order/ids hidden).
    expect(view.stock.length).toBe(full.stock.length)
    expect(view.stock.every(c => c.id === -1)).toBe(true)
    // The public discard top is intact.
    expect(G.topDiscard(view)!.id).toBe(G.topDiscard(full)!.id)

    // Robust leak check: collect every card id present in the wire view and assert none
    // of the host's secret hand/stock ids appear in it (the only non-(-1) ids the guest
    // may see are its own hand and the public discard pile).
    const wire = JSON.stringify(view)
    const seenIds = new Set<number>([...(wire.matchAll(/"id":(-?\d+)/g))].map(m => Number(m[1])))
    const allowed = new Set<number>([...view.ai.map(c => c.id), ...view.discard.map(c => c.id), -1])
    for (const id of seenIds) expect(allowed.has(id)).toBe(true)
    for (const c of full.you) expect(seenIds.has(c.id)).toBe(false)
    for (const c of full.stock) expect(seenIds.has(c.id)).toBe(false)
  })

  it('lets only the host deal the next hand after a round', () => {
    // Drive a real match to a round end: seat 0 plays a trivial "draw stock, dump last
    // card" turn through the adapter, seat 1 uses the AI, until a round resolves.
    let s = game()
    let guard = 0
    while (s.phase !== 'roundOver' && s.phase !== 'gameOver' && guard++ < 500) {
      const seat = A.seatToMove(s)
      if (seat == null) break
      if (seat === 0) {
        s = A.applyIntent(s, 0, { kind: 'draw', source: 'stock' })
        if (s.phase !== 'discard') continue // stock-exhaustion wash etc.
        // Knock if legal, otherwise just discard the last card.
        const last = s.you[s.you.length - 1]
        const canKnock = G.deadwoodOf(s.you.filter(c => c.id !== last.id)) <= 10
        s = A.applyIntent(s, 0, canKnock ? { kind: 'knock', cardId: last.id } : { kind: 'discard', cardId: last.id })
      } else {
        s = A.aiStep(s, 1)
      }
    }
    expect(['roundOver', 'gameOver']).toContain(s.phase)

    if (s.phase === 'roundOver') {
      expect(A.seatToMove(s)).toBe(0) // host controls the deal between rounds
      expect(A.applyIntent(s, 1, { kind: 'next' })).toBe(s) // a guest cannot deal
      const next = A.applyIntent(s, 0, { kind: 'next' })    // the host can
      expect(next).not.toBe(s)
      expect(next.phase).toBe('draw')
    }
  })
})

// Keep the GinIntent import meaningful for type-checking.
export type _I = GinIntent
