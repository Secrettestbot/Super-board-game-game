import { describe, it, expect } from 'vitest'
import { yinshAdapter as A, type YinshIntent } from './net'
import { HostSession, GuestSession } from '../../net/session'
import { memoryPair } from '../../net/transport'

describe('yinsh net adapter', () => {
  it('starts with White (seat 0) to move on a 2-seat placement game', () => {
    const s = A.makeGame()
    expect(A.numSeats(s)).toBe(2)
    expect(A.seatToMove(s)).toBe(0)
    expect(A.isOver(s)).toBe(false)
  })

  it('applies a legal placeRing intent and passes the turn', () => {
    const s = A.makeGame()
    const s2 = A.applyIntent(s, 0, { kind: 'placeRing', cell: '5,5' })
    expect(s2).not.toBe(s)
    expect(s2.rings['5,5']).toBe('w')
    expect(A.seatToMove(s2)).toBe(1) // now Black places
  })

  it('ignores an out-of-turn intent (returns same state ref)', () => {
    const s = A.makeGame()
    // it is seat 0's (White) turn; seat 1 may not act
    expect(A.applyIntent(s, 1, { kind: 'placeRing', cell: '5,5' })).toBe(s)
  })

  it('ignores an illegal intent (returns same state ref)', () => {
    const s = A.makeGame()
    // off-board cell -> placeRing is a no-op, logic returns the same object
    expect(A.applyIntent(s, 0, { kind: 'placeRing', cell: '99,99' })).toBe(s)
    // wrong-kind action for the placement phase
    expect(A.applyIntent(s, 0, { kind: 'dropMarker', cell: '5,5' })).toBe(s)
    expect(A.applyIntent(s, 0, { kind: 'moveRing', to: '5,5' })).toBe(s)
  })

  it('tickKey changes on every action', () => {
    const s = A.makeGame()
    const s2 = A.applyIntent(s, 0, { kind: 'placeRing', cell: '5,5' })
    expect(A.tickKey(s2)).not.toBe(A.tickKey(s))
  })
})

describe('yinsh net session (host + guest over in-memory transport)', () => {
  it('assigns the guest seat 1 and syncs placement turns', () => {
    const host = new HostSession(A)
    const [a, b] = memoryPair()
    host.addGuest(a)
    const guest = new GuestSession(A, b)

    expect(guest.ready()).toBe(true)
    expect(guest.mySeat()).toBe(1) // host seat 0 (White), guest seat 1 (Black)
    expect(host.getSeats().map(x => x.kind)).toEqual(['host', 'guest'])

    // host (White, seat 0) places first
    expect(host.isMyTurn()).toBe(true)
    host.dispatchLocal({ kind: 'placeRing', cell: '5,5' } as YinshIntent)
    expect(host.isMyTurn()).toBe(false)

    // guest (Black, seat 1) is now to move and sees the host's ring
    expect(guest.isMyTurn()).toBe(true)
    expect(guest.getState().rings['5,5']).toBe('w')

    // guest replies; intent travels host-ward and applies authoritatively
    guest.dispatch({ kind: 'placeRing', cell: '5,4' } as YinshIntent)
    expect(host.getFull().rings['5,4']).toBe('b')
    expect(host.isMyTurn()).toBe(true) // back to White
    expect(guest.getState().placed).toEqual(host.getFull().placed)
  })

  it('host ignores an out-of-turn guest intent', () => {
    const host = new HostSession(A)
    const [a, b] = memoryPair()
    host.addGuest(a)
    const guest = new GuestSession(A, b)
    // it is White's (host) turn, but the guest tries to place
    guest.dispatch({ kind: 'placeRing', cell: '5,5' } as YinshIntent)
    expect(host.getFull().rings['5,5']).toBeUndefined()
    expect(host.isMyTurn()).toBe(true)
  })
})
