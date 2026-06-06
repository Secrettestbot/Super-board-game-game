/* Browser-free tests of the dvonn netplay path: adapter round-trip (placement + move
 * intents, out-of-turn / illegal rejection) and a HostSession+GuestSession synced over
 * an in-memory transport pair, playing real dvonn. */

import { describe, it, expect } from 'vitest'
import { dvonnAdapter as A, type DvonnIntent } from './net'
import * as D from './logic'
import type { DvonnState } from './logic'
import { HostSession, GuestSession } from '../../net/session'
import { memoryPair } from '../../net/transport'

// Fill the whole board through legal placements, alternating seats by s.turn, to reach
// the movement phase deterministically (the AI is not used here).
function fillToMove(): DvonnState {
  let s = A.makeGame()
  let guard = 0
  while (s.phase === 'place' && guard++ < 200) {
    const cells = D.legalPlacements(s)
    s = A.applyIntent(s, s.turn, { cell: cells[0] })
  }
  return s
}

describe('dvonn net adapter', () => {
  it('starts with seat 0 to move on a 2-seat game', () => {
    const s = A.makeGame()
    expect(A.numSeats(s)).toBe(2)
    expect(A.seatToMove(s)).toBe(0)
    expect(A.isOver(s)).toBe(false)
  })

  it('round-trips a legal placement intent and advances', () => {
    const s = A.makeGame()
    const cell = D.legalPlacements(s)[0]
    const s2 = A.applyIntent(s, 0, { cell })
    expect(s2).not.toBe(s)
    expect(s2.board[cell]).not.toBeNull()
    expect(A.tickKey(s2)).not.toBe(A.tickKey(s))
  })

  it('round-trips a legal move intent in the movement phase', () => {
    const s = fillToMove()
    expect(s.phase).toBe('move')
    const seat = A.seatToMove(s)!
    const m = D.legalMoves(s, seat as D.Player)[0]
    const s2 = A.applyIntent(s, seat, { from: m.from, to: m.to })
    expect(s2).not.toBe(s)
    expect(A.tickKey(s2)).not.toBe(A.tickKey(s))
  })

  it('ignores an out-of-turn intent (returns same ref)', () => {
    const s = A.makeGame()
    const cell = D.legalPlacements(s)[0]
    expect(A.applyIntent(s, 1, { cell })).toBe(s) // seat 1 acting on seat 0's turn
  })

  it('ignores an illegal placement (occupied / missing cell) — same ref', () => {
    const s = A.applyIntent(A.makeGame(), 0, { cell: 0 }) // cell 0 now occupied
    expect(A.applyIntent(s, 0, { cell: 0 })).toBe(s)      // can't place on occupied
    expect(A.applyIntent(s, 0, {})).toBe(s)               // no cell given
    expect(A.applyIntent(s, 0, { cell: 999 })).toBe(s)    // off-board
  })

  it('ignores an illegal move (no such legal move) — same ref', () => {
    const s = fillToMove()
    const seat = A.seatToMove(s)!
    expect(A.applyIntent(s, seat, { from: 0, to: 0 })).toBe(s)
    expect(A.applyIntent(s, seat, { from: 0 })).toBe(s) // missing `to`
  })
})

describe('dvonn host + guest over in-memory transport', () => {
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
    expect(guest.getState().board.length).toBe(D.NCELLS)
  })

  it('relays host + guest placement intents and keeps state in sync', () => {
    const { host, guest } = connect()
    // Host places the 3 red anchors (turn stays 0 while reds remain).
    for (let k = 0; k < 3; k++) {
      const cell = D.legalPlacements(host.getFull())[0]
      host.dispatchLocal({ cell } as DvonnIntent)
    }
    expect(host.getFull().redLeft).toBe(0)
    expect(host.isMyTurn()).toBe(true) // first own-disc placer is seat 0

    // Host places a white disc -> turn passes to the guest (seat 1).
    const hc = D.legalPlacements(host.getFull())[0]
    host.dispatchLocal({ cell: hc } as DvonnIntent)
    expect(host.isMyTurn()).toBe(false)
    expect(guest.isMyTurn()).toBe(true)
    expect(guest.getState().board[hc]).not.toBeNull() // view synced

    // Guest replies; intent travels host-ward and applies.
    const gc = D.legalPlacements(guest.getState())[0]
    guest.dispatch({ cell: gc } as DvonnIntent)
    expect(host.getFull().board[gc]).not.toBeNull()
    expect(host.isMyTurn()).toBe(true) // back to seat 0
  })

  it('ignores an out-of-turn guest intent (host is authoritative)', () => {
    const { host, guest } = connect()
    const before = A.tickKey(host.getFull())
    // It's seat 0's turn, but the guest tries to place.
    const cell = D.legalPlacements(host.getFull())[0]
    guest.dispatch({ cell } as DvonnIntent)
    expect(A.tickKey(host.getFull())).toBe(before) // rejected, nothing changed
  })
})
