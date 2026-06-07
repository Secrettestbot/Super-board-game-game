import { describe, it, expect } from 'vitest'
import { pentagoAdapter as A, type PentagoIntent } from './net'
import { HostSession, GuestSession } from '../../net/session'
import { memoryPair } from '../../net/transport'

// A full legal pentago turn = place a marble AND rotate a quadrant, as one atomic intent.
const TURN0: PentagoIntent = { cell: 0, quad: 1, dir: 'cw' } // place TL corner, twist TR (won't disturb it)

describe('pentago net adapter', () => {
  it('starts with White (seat 0) to move on a 2-seat game', () => {
    const s = A.makeGame()
    expect(A.numSeats(s)).toBe(2)
    expect(A.seatToMove(s)).toBe(0)
    expect(A.isOver(s)).toBe(false)
  })

  it('round-trips a full place+rotate intent and passes the turn', () => {
    const s = A.makeGame()
    const s2 = A.applyIntent(s, 0, TURN0)
    expect(s2).not.toBe(s)
    expect(s2.board[0]).toBe('w')   // marble placed
    expect(s2.phase).toBe('place')  // rotation completed the turn
    expect(s2.turn).toBe('b')
    expect(A.seatToMove(s2)).toBe(1)
    // tickKey changed (a completed turn)
    expect(A.tickKey(s2)).not.toBe(A.tickKey(s))
  })

  it('ignores an out-of-turn intent (returns same state ref)', () => {
    const s = A.makeGame()
    expect(A.applyIntent(s, 1, TURN0)).toBe(s) // seat 1 cannot move when it's seat 0's turn
  })

  it('ignores an illegal intent (returns same state ref)', () => {
    const s = A.makeGame()
    // occupied cell after a legal turn
    const s2 = A.applyIntent(s, 0, TURN0)
    // seat 1 places on an occupied cell -> rejected
    // note: after TURN0 the placed marble moved nowhere (TR twist), cell 0 still 'w'
    expect(A.applyIntent(s2, 1, { cell: 0, quad: 0, dir: 'cw' })).toBe(s2)
    // out-of-range cell
    expect(A.applyIntent(s, 0, { cell: 99, quad: 0, dir: 'cw' })).toBe(s)
    // bad direction
    expect(A.applyIntent(s, 0, { cell: 5, quad: 0, dir: 'nope' as never })).toBe(s)
    // bad quadrant
    expect(A.applyIntent(s, 0, { cell: 5, quad: 9, dir: 'cw' })).toBe(s)
  })

  it('aiStep advances the AI seat (Black) and hands back to White', () => {
    // aiMove (reused by aiStep) plays Black, so seat 1 must be to move.
    let s = A.applyIntent(A.makeGame(), 0, TURN0) // White plays a full turn first
    expect(A.seatToMove(s)).toBe(1)
    const before = A.tickKey(s)
    s = A.aiStep(s, 1)                            // AI (Black) plays its full turn
    expect(A.tickKey(s)).not.toBe(before)
    if (!A.isOver(s)) expect(A.seatToMove(s)).toBe(0) // back to White
    expect(A.tickKey(s)).toBeTypeOf('string')
  })
})

function connect() {
  const host = new HostSession(A)
  const [a, b] = memoryPair()
  host.addGuest(a)
  const guest = new GuestSession(A, b)
  return { host, guest }
}

describe('pentago net session (host + guest over in-memory transport)', () => {
  it('assigns the guest seat 1 and syncs the initial view', () => {
    const { host, guest } = connect()
    expect(guest.ready()).toBe(true)
    expect(guest.mySeat()).toBe(1)
    expect(host.getSeats().map(s => s.kind)).toEqual(['host', 'guest'])
    expect(guest.getState().board.length).toBe(36)
  })

  it('host + guest stay in sync across full turns', () => {
    const { host, guest } = connect()
    // host (White, seat 0) plays a complete turn locally
    host.dispatchLocal(TURN0)
    expect(host.isMyTurn()).toBe(false)
    expect(guest.isMyTurn()).toBe(true) // now Black's (guest's) turn, view synced
    expect(guest.getState().board[0]).toBe('w')

    // guest (Black, seat 1) replies with a full turn; it travels host-ward and applies
    guest.dispatch({ cell: 35, quad: 0, dir: 'ccw' }) // place BR corner, twist TL
    expect(host.getFull().board[35]).toBe('b')
    expect(host.getFull().turn).toBe('w') // back to White
    expect(host.isMyTurn()).toBe(true)
    expect(guest.getState().turn).toBe(host.getFull().turn)
  })

  it('host rejects an out-of-turn guest intent (host authoritative)', () => {
    const { host, guest } = connect()
    const before = A.tickKey(host.getFull())
    // it's White's (host) turn, but the guest tries to move
    guest.dispatch({ cell: 10, quad: 0, dir: 'cw' })
    expect(A.tickKey(host.getFull())).toBe(before) // rejected, nothing changed
  })
})
