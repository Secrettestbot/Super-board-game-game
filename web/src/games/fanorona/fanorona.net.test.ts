import { describe, it, expect } from 'vitest'
import { fanoronaAdapter as A, type FanoronaIntent } from './net'
import * as FN from './logic'
import { HostSession, GuestSession } from '../../net/session'
import { memoryPair } from '../../net/transport'

const intentOf = (m: FN.Move): FanoronaIntent => ({ kind: 'move', from: m.from, to: m.to, cap: m.kind })

describe('fanorona net adapter', () => {
  it('starts with White (seat 0) to move on a 2-seat game', () => {
    const s = A.makeGame()
    expect(A.numSeats(s)).toBe(2)
    expect(A.seatToMove(s)).toBe(0)
    expect(A.isOver(s)).toBe(false)
  })

  it('round-trips a legal intent and passes the turn', () => {
    const s = A.makeGame()
    const m = FN.legalMoves(s)[0]
    const s2 = A.applyIntent(s, 0, intentOf(m))
    expect(s2).not.toBe(s)
    // opening is a forced single capture (no chain) -> seat 1 to move
    expect(A.seatToMove(s2)).toBe(1)
    expect(A.tickKey(s2)).not.toBe(A.tickKey(s))
  })

  it('returns the SAME state for an out-of-turn intent', () => {
    const s = A.makeGame()
    const m = FN.legalMoves(s)[0]
    expect(A.applyIntent(s, 1, intentOf(m))).toBe(s) // seat 1 acting on seat 0's turn
  })

  it('returns the SAME state for an illegal intent', () => {
    const s = A.makeGame()
    expect(A.applyIntent(s, 0, { kind: 'move', from: 0, to: 0, cap: null })).toBe(s)
    // a 'stop' with no chain in progress is a no-op
    expect(A.applyIntent(s, 0, { kind: 'stop' })).toBe(s)
  })

  it('aiStep advances the AI seat and re-arms the tick', () => {
    // aiMove only plays Black (seat 1). Move seat 0 first, then let the AI reply.
    let s = A.makeGame()
    s = A.applyIntent(s, 0, intentOf(FN.legalMoves(s)[0]))
    expect(A.seatToMove(s)).toBe(1)
    const tk = A.tickKey(s)
    s = A.aiStep(s, 1) // resolves the AI's whole turn (incl. any capture chain)
    expect(A.tickKey(s)).not.toBe(tk)
    if (!A.isOver(s)) expect(A.seatToMove(s)).toBe(0) // control back to the human
  })

  it('keeps the same seat to move mid-chain, and stop/continue both change the tick', () => {
    // Walk the human side forward looking for a capture that opens a chain.
    let s = A.makeGame()
    let found = false
    for (let step = 0; step < 60 && !A.isOver(s); step++) {
      const seat = A.seatToMove(s)!
      if (seat === 0) {
        // try to keep the human chaining
        const cap = FN.legalMoves(s).find(m => m.kind) ?? FN.legalMoves(s)[0]
        const before = A.tickKey(s)
        const next = A.applyIntent(s, 0, intentOf(cap))
        expect(next).not.toBe(s)
        expect(A.tickKey(next)).not.toBe(before) // tick re-arms on every step
        if ((next as FN.FanoronaState).chainAt !== null) {
          found = true
          expect(A.seatToMove(next)).toBe(0) // same seat continues the chain
          const stopped = A.applyIntent(next, 0, { kind: 'stop' })
          expect(stopped).not.toBe(next)
          expect(A.tickKey(stopped)).not.toBe(A.tickKey(next))
          expect(A.seatToMove(stopped)).not.toBe(0) // stopping passes the turn
          break
        }
        s = next
      } else {
        s = A.aiStep(s, 1)
      }
    }
    expect(found).toBe(true)
  })
})

describe('fanorona netplay session (host + guest over in-memory transport)', () => {
  function connect() {
    const host = new HostSession(A)
    const [a, b] = memoryPair()
    host.addGuest(a)
    const guest = new GuestSession(A, b)
    return { host, guest }
  }

  it('assigns the guest seat 1 and syncs the initial view', () => {
    const { host, guest } = connect()
    expect(guest.ready()).toBe(true)
    expect(guest.mySeat()).toBe(1)
    expect(host.getSeats().map(s => s.kind)).toEqual(['host', 'guest'])
    expect(guest.getState().board.length).toBe(FN.N)
  })

  it('relays host + guest intents and stays in sync', () => {
    const { host, guest } = connect()
    expect(host.isMyTurn()).toBe(true)
    expect(guest.isMyTurn()).toBe(false)

    // host (White, seat 0) plays its forced opening capture
    const m0 = FN.legalMoves(host.getFull())[0]
    host.dispatchLocal(intentOf(m0))
    expect(host.isMyTurn()).toBe(false)
    expect(guest.isMyTurn()).toBe(true) // turn passed to the guest, view synced
    expect(guest.getState().turn).toBe('b')

    // guest (Black, seat 1) replies with a legal move
    const m1 = FN.legalMoves(guest.getState())[0]
    guest.dispatch(intentOf(m1))
    // host applied the guest's intent authoritatively
    expect(host.getFull().last).toEqual({ from: m1.from, to: m1.to })
    // guest's view reflects the host's authoritative state
    expect(A.tickKey(guest.getState())).toBe(A.tickKey(host.getFull()))
  })

  it('ignores an out-of-turn guest intent (host is authoritative)', () => {
    const { host, guest } = connect()
    const before = A.tickKey(host.getFull())
    // it is the host's turn, but the guest tries to move
    const m = FN.legalMoves(host.getFull())[0]
    guest.dispatch(intentOf(m))
    expect(A.tickKey(host.getFull())).toBe(before) // rejected, nothing changed
  })
})
