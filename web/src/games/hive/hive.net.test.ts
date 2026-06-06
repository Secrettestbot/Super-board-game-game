import { describe, it, expect } from 'vitest'
import { hiveAdapter as A, type HiveIntent } from './net'
import * as H from './logic'
import { HostSession, GuestSession } from '../../net/session'
import { memoryPair } from '../../net/transport'

// Helper: a legal placement intent for the seat to move.
function placeIntent(s: H.HiveState, seat: H.Player): HiveIntent {
  const type = H.placeableTypes(s, seat)[0]
  const to = H.legalPlacements(s, seat)[0]
  return { kind: 'place', bug: type, to }
}

describe('hive net adapter', () => {
  it('starts with seat 0 to move on a 2-seat game', () => {
    const s = A.makeGame()
    expect(A.numSeats(s)).toBe(2)
    expect(A.seatToMove(s)).toBe(0)
    expect(A.isOver(s)).toBe(false)
  })

  it('round-trips a legal place then a legal move, advancing the turn each time', () => {
    let s = A.makeGame()
    const tick0 = A.tickKey(s)

    // seat 0 places (opening at 0,0)
    const s1 = A.applyIntent(s, 0, placeIntent(s, 0))
    expect(s1).not.toBe(s)
    expect(A.seatToMove(s1)).toBe(1)
    expect(A.tickKey(s1)).not.toBe(tick0)
    s = s1

    // play out legal turns until a placed (non-queen-less) piece of seat 0 can move
    // — keep both queens down so movement is unlocked.
    // Drive forward with placements until seat 0 has its queen + another piece down.
    for (let i = 0; i < 6 && A.seatToMove(s) != null; i++) {
      const seat = A.seatToMove(s)! as H.Player
      s = A.applyIntent(s, seat, placeIntent(s, seat))
    }

    // Find a legal MOVE for whichever seat is to move (queen now placed for both).
    const seat = A.seatToMove(s)! as H.Player
    expect(H.queenPlaced(s, seat)).toBe(true)
    let moveIntent: HiveIntent | null = null
    for (const h of H.allHexes(s)) {
      const top = H.topPiece(s, h)
      if (!top || top.owner !== seat) continue
      const tos = H.legalMoves(s, h)
      if (tos.length) { moveIntent = { kind: 'move', from: h, to: tos[0] }; break }
    }
    expect(moveIntent).not.toBeNull()
    const before = s
    const moved = A.applyIntent(s, seat, moveIntent!)
    expect(moved).not.toBe(before)
    expect(A.seatToMove(moved)).toBe(H.other(seat))
  })

  it('ignores an out-of-turn intent (returns same ref)', () => {
    const s = A.makeGame()
    // seat 1 tries to act on seat 0's turn
    expect(A.applyIntent(s, 1, placeIntent(s, 0))).toBe(s)
  })

  it('ignores an illegal intent (returns same ref)', () => {
    const s = A.makeGame()
    // a move with no piece at `from`, and a place at a far-off hex
    expect(A.applyIntent(s, 0, { kind: 'move', from: '5,5', to: '6,5' })).toBe(s)
    expect(A.applyIntent(s, 0, { kind: 'place', bug: 'Q', to: '9,9' })).toBe(s)
  })
})

describe('hive netplay session (host + guest over in-memory transport)', () => {
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
  })

  it('relays intents both directions and stays in sync', () => {
    const { host, guest } = connect()
    expect(host.isMyTurn()).toBe(true)
    expect(guest.isMyTurn()).toBe(false)

    // host (seat 0) plays a legal placement
    host.dispatchLocal(placeIntent(host.getFull(), 0))
    expect(host.isMyTurn()).toBe(false)
    expect(guest.isMyTurn()).toBe(true)

    // guest (seat 1) replies; intent travels host-ward and applies authoritatively
    const gIntent = placeIntent(guest.getState(), 1)
    guest.dispatch(gIntent)
    expect(host.isMyTurn()).toBe(true)
    // guest's view reflects the host's authoritative state
    expect(H.allHexes(guest.getState()).length).toBe(H.allHexes(host.getFull()).length)
    expect(H.allHexes(host.getFull()).length).toBe(2)
  })
})
