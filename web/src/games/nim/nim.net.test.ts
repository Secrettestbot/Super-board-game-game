import { describe, it, expect } from 'vitest'
import { nimAdapter as A } from './net'
import type { NimIntent } from './net'
import { HostSession, GuestSession } from '../../net/session'
import { memoryPair } from '../../net/transport'

describe('nim net adapter', () => {
  it('round-trips a legal intent and rejects illegal/out-of-turn', () => {
    const s = A.makeGame()
    expect(A.numSeats(s)).toBe(2)
    expect(A.seatToMove(s)).toBe(0)
    expect(A.isOver(s)).toBe(false)

    // legal seat-0 move: take 2 from heap 0 (start heaps [3,4,5]) -> state changes, turn passes
    const s2 = A.applyIntent(s, 0, { heap: 0, count: 2 })
    expect(s2).not.toBe(s)
    expect(s2.heaps[0]).toBe(1)
    expect(A.seatToMove(s2)).toBe(1)

    // out-of-turn: seat 1 cannot move when it's seat 0's turn -> SAME ref
    expect(A.applyIntent(s, 1, { heap: 0, count: 1 })).toBe(s)

    // illegal: taking more than the heap holds -> SAME ref
    expect(A.applyIntent(s, 0, { heap: 0, count: 99 })).toBe(s)
    // illegal: out-of-range heap -> SAME ref
    expect(A.applyIntent(s, 0, { heap: 7, count: 1 })).toBe(s)
  })

  it('host + guest stay in sync over an in-memory transport', () => {
    const host = new HostSession(A)
    const [a, b] = memoryPair()
    host.addGuest(a)
    const guest = new GuestSession(A, b)

    expect(guest.mySeat()).toBe(1) // host is seat 0, guest gets seat 1
    expect(host.isMyTurn()).toBe(true)
    expect(guest.isMyTurn()).toBe(false)

    // host (seat 0) plays a legal move
    host.dispatchLocal({ heap: 0, count: 2 } as NimIntent)
    expect(host.isMyTurn()).toBe(false)
    expect(guest.isMyTurn()).toBe(true) // synced to guest
    expect(guest.getState().heaps[0]).toBe(1)

    // guest (seat 1) replies; intent travels host-ward and advances the authoritative state
    guest.dispatch({ heap: 1, count: 4 } as NimIntent)
    expect(host.getFull().heaps[1]).toBe(0)
    expect(host.isMyTurn()).toBe(true) // back to host
    expect(guest.getState().heaps[1]).toBe(0)
  })
})
