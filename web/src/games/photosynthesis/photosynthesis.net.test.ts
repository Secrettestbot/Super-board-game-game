import { describe, it, expect } from 'vitest'
import { photosynthesisAdapter as A } from './net'
import * as P from './logic'
import { HostSession, GuestSession } from '../../net/session'
import { memoryPair } from '../../net/transport'

/** First non-'end' legal action for the given seat, or null. */
function firstRealAction(s: P.State, seat: P.Player): P.Action | null {
  return P.legalActions(s, seat).find(a => a.type !== 'end') ?? null
}

describe('photosynthesis net adapter', () => {
  it('reports the real seat count and the active player', () => {
    const s = A.makeGame()
    expect(A.numSeats(s)).toBe(2)
    expect(A.seatToMove(s)).toBe(0)
    expect(A.isOver(s)).toBe(false)
  })

  it('applies a legal intent (state advances) and changes tickKey', () => {
    const s = A.makeGame()
    const a = firstRealAction(s, 0)
    expect(a).not.toBeNull()
    const before = A.tickKey(s)
    const s2 = A.applyIntent(s, 0, a!)
    expect(s2).not.toBe(s)
    expect(A.tickKey(s2)).not.toBe(before)
    // still seat 0's turn until they end (multi-action turns), and game not over
    expect(A.seatToMove(s2)).toBe(0)
  })

  it('end-turn intent hands the turn to seat 1', () => {
    const s = A.makeGame()
    const s2 = A.applyIntent(s, 0, { type: 'end' })
    expect(s2).not.toBe(s)
    expect(A.seatToMove(s2)).toBe(1)
  })

  it('ignores an out-of-turn intent (returns same state ref)', () => {
    const s = A.makeGame()
    const a = firstRealAction(s, 1)
    // seat 1 acts while it is seat 0's turn -> unchanged
    expect(A.applyIntent(s, 1, a ?? { type: 'end' })).toBe(s)
  })

  it('ignores an illegal intent (returns same state ref)', () => {
    const s = A.makeGame()
    // grow a tree on an empty/non-owned cell -> illegal
    const illegal: P.Action = { type: 'grow', q: 0, r: 0 }
    expect(P.isLegal(s, 0, illegal)).toBe(false)
    expect(A.applyIntent(s, 0, illegal)).toBe(s)
  })

  it('aiStep advances the AI seat and re-arms the tick', () => {
    let s = A.makeGame()
    s = A.applyIntent(s, 0, { type: 'end' }) // hand to AI seat 1
    expect(A.seatToMove(s)).toBe(1)
    const before = A.tickKey(s)
    const s2 = A.aiStep(s, 1)
    expect(s2).not.toBe(s)
    expect(A.tickKey(s2)).not.toBe(before)
  })
})

describe('photosynthesis host + guest over an in-memory transport', () => {
  it('assigns the guest seat 1 and stays in sync across a full round', () => {
    const host = new HostSession(A)
    const [a, b] = memoryPair()
    host.addGuest(a)
    const guest = new GuestSession(A, b)

    expect(guest.ready()).toBe(true)
    expect(guest.mySeat()).toBe(1)
    expect(host.isMyTurn()).toBe(true)
    expect(guest.isMyTurn()).toBe(false)

    // host (seat 0) plays a real action then ends its turn
    const ha = firstRealAction(host.getFull(), 0)
    if (ha) host.dispatchLocal(ha)
    host.dispatchLocal({ type: 'end' })

    // now seat 1 (the guest) is to move, and its view reflects the host state
    expect(host.isMyTurn()).toBe(false)
    expect(guest.isMyTurn()).toBe(true)
    expect(guest.getState().turn).toBe(1)
    expect(guest.getState().step).toBe(host.getFull().step)

    // guest replies via the wire; the host's authority advances
    const ga = firstRealAction(guest.getState(), 1)
    const stepBefore = host.getFull().step
    if (ga) guest.dispatch(ga)
    guest.dispatch({ type: 'end' })

    // both ended -> the round advanced (sun rotated) back to seat 0
    expect(host.getFull().step).toBeGreaterThan(stepBefore)
    expect(host.getFull().round).toBe(2)
    expect(host.isMyTurn()).toBe(true)
    expect(guest.getState().round).toBe(2)
  })

  it('rejects an out-of-turn guest intent (host stays authoritative)', () => {
    const host = new HostSession(A)
    const [a, b] = memoryPair()
    host.addGuest(a)
    const guest = new GuestSession(A, b)

    const stepBefore = host.getFull().step
    // it is the host's (seat 0) turn, but the guest tries to act
    guest.dispatch({ type: 'end' })
    expect(host.getFull().step).toBe(stepBefore)
    expect(host.isMyTurn()).toBe(true)
  })
})
