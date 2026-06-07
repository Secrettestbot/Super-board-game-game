import { describe, it, expect } from 'vitest'
import { foxHoundsAdapter as A, type FoxHoundsIntent } from './net'
import { HostSession, GuestSession } from '../../net/session'
import { memoryPair } from '../../net/transport'
import * as FH from './logic'

describe('fox-and-hounds net adapter', () => {
  it('starts with the fox (seat 0) to move on a 2-seat game', () => {
    const s = A.makeGame()
    expect(A.numSeats(s)).toBe(2)
    expect(A.seatToMove(s)).toBe(0)
    expect(A.isOver(s)).toBe(false)
  })

  it('applies a legal fox intent and passes the turn to the hounds (seat 1)', () => {
    const s = A.makeGame()
    const to = FH.legalMoves({ fox: s.fox, hounds: s.hounds }, 'fox')[0]
    const s2 = A.applyIntent(s, 0, { to })
    expect(s2).not.toBe(s)
    expect(s2.fox).toBe(to)
    expect(A.seatToMove(s2)).toBe(1)
  })

  it('applies a legal hound intent and passes the turn back to the fox (seat 0)', () => {
    // advance one fox move so it is the hounds' turn
    const s0 = A.makeGame()
    const foxTo = FH.legalMoves({ fox: s0.fox, hounds: s0.hounds }, 'fox')[0]
    const s = A.applyIntent(s0, 0, { to: foxTo })
    expect(A.seatToMove(s)).toBe(1)
    // find a legal hound move
    const occ = new Set<number>([s.fox, ...s.hounds])
    let hi = -1, to = -1
    for (let h = 0; h < s.hounds.length; h++) {
      const ms = FH.houndMoves(s.hounds[h], occ)
      if (ms.length) { hi = h; to = ms[0]; break }
    }
    expect(hi).toBeGreaterThanOrEqual(0)
    const s2 = A.applyIntent(s, 1, { to, hi })
    expect(s2).not.toBe(s)
    expect(s2.hounds).toContain(to)
    expect(A.seatToMove(s2)).toBe(0)
  })

  it('ignores an out-of-turn intent (returns same state)', () => {
    const s = A.makeGame() // fox's turn (seat 0)
    // the hound seat (1) tries to move on the fox's turn
    const occ = new Set<number>([s.fox, ...s.hounds])
    let hi = 0, to = -1
    for (let h = 0; h < s.hounds.length; h++) {
      const ms = FH.houndMoves(s.hounds[h], occ)
      if (ms.length) { hi = h; to = ms[0]; break }
    }
    expect(A.applyIntent(s, 1, { to, hi })).toBe(s)
  })

  it('ignores an illegal fox intent (returns same state)', () => {
    const s = A.makeGame()
    expect(A.applyIntent(s, 0, { to: s.fox })).toBe(s)       // staying put is illegal
    expect(A.applyIntent(s, 0, { to: -1 })).toBe(s)          // off-board
  })

  it('ignores an illegal hound intent — bad hand or bad destination (returns same state)', () => {
    const s0 = A.makeGame()
    const foxTo = FH.legalMoves({ fox: s0.fox, hounds: s0.hounds }, 'fox')[0]
    const s = A.applyIntent(s0, 0, { to: foxTo }) // hounds' turn
    expect(A.applyIntent(s, 1, { to: 0 })).toBe(s)            // no hi supplied
    expect(A.applyIntent(s, 1, { to: 0, hi: 99 })).toBe(s)    // bad hound index
    expect(A.applyIntent(s, 1, { to: s.fox, hi: 0 })).toBe(s) // illegal destination
  })

  it('aiStep advances the hounds and alternates seats', () => {
    const s0 = A.makeGame()
    const foxTo = FH.legalMoves({ fox: s0.fox, hounds: s0.hounds }, 'fox')[0]
    const s = A.applyIntent(s0, 0, { to: foxTo }) // hounds' turn (seat 1)
    expect(A.seatToMove(s)).toBe(1)
    const s2 = A.aiStep(s, 1)
    expect(s2).not.toBe(s)
    expect(A.seatToMove(s2)).toBe(0)
    expect(A.tickKey(s2)).toBeTypeOf('string')
    expect(A.tickKey(s2)).not.toBe(A.tickKey(s))
  })
})

describe('fox-and-hounds netplay session (host fox + guest hounds over in-memory transport)', () => {
  function connect() {
    const host = new HostSession(A)
    const [a, b] = memoryPair()
    host.addGuest(a)
    const guest = new GuestSession(A, b)
    return { host, guest }
  }

  it('assigns the guest the opposite side (hounds = seat 1) and syncs the start', () => {
    const { host, guest } = connect()
    expect(guest.ready()).toBe(true)
    expect(guest.mySeat()).toBe(1) // host fox (seat 0), guest hounds (seat 1)
    expect(host.getSeats().map(s => s.kind)).toEqual(['host', 'guest'])
    expect(guest.getState().hounds).toHaveLength(4)
  })

  it('relays moves both ways — host fox, then guest hounds — staying in sync', () => {
    const { host, guest } = connect()
    expect(host.isMyTurn()).toBe(true) // fox to move
    expect(guest.isMyTurn()).toBe(false)

    // host (fox, seat 0) moves
    const foxTo = FH.legalMoves({ fox: host.getFull().fox, hounds: host.getFull().hounds }, 'fox')[0]
    host.dispatchLocal({ to: foxTo })
    expect(host.getFull().fox).toBe(foxTo)
    expect(host.isMyTurn()).toBe(false)
    expect(guest.isMyTurn()).toBe(true) // now the hounds' (guest's) turn, view synced
    expect(guest.getState().fox).toBe(foxTo)

    // guest (hounds, seat 1) replies with a legal hound move
    const gs = guest.getState()
    const occ = new Set<number>([gs.fox, ...gs.hounds])
    let hi = 0, to = -1
    for (let h = 0; h < gs.hounds.length; h++) {
      const ms = FH.houndMoves(gs.hounds[h], occ)
      if (ms.length) { hi = h; to = ms[0]; break }
    }
    guest.dispatch({ to, hi } as FoxHoundsIntent)
    expect(host.getFull().hounds).toContain(to) // host applied the guest's hound move
    expect(host.isMyTurn()).toBe(true)          // back to the fox
    expect(guest.getState().hounds).toContain(to)
  })

  it('ignores an out-of-turn guest intent (host is authoritative)', () => {
    const { host, guest } = connect()
    const before = host.getFull()
    // it is the fox's (host) turn; the guest (hounds) tries to move
    const occ = new Set<number>([before.fox, ...before.hounds])
    let hi = 0, to = -1
    for (let h = 0; h < before.hounds.length; h++) {
      const ms = FH.houndMoves(before.hounds[h], occ)
      if (ms.length) { hi = h; to = ms[0]; break }
    }
    guest.dispatch({ to, hi } as FoxHoundsIntent)
    expect(host.getFull().hounds).toEqual(before.hounds) // rejected, nothing changed
  })
})
