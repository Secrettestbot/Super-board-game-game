import { describe, it, expect } from 'vitest'
import { cathedralAdapter as A, type CathedralIntent } from './net'
import * as C from './logic'
import { HostSession, GuestSession } from '../../net/session'
import { memoryPair } from '../../net/transport'

/** Turn a logic Placement into a wire intent the adapter accepts. */
function intentFrom(pl: C.Placement): CathedralIntent {
  return { piece: pl.pieceId, cell: C.idx(pl.anchor[0], pl.anchor[1]), orientation: pl.ori }
}

describe('cathedral net adapter', () => {
  it('starts with you (seat 0) to move on a 2-seat game', () => {
    const s = A.makeGame()
    expect(A.numSeats(s)).toBe(2)
    expect(A.seatToMove(s)).toBe(0)
    expect(A.isOver(s)).toBe(false)
  })

  it('applies a legal placement and passes the turn', () => {
    const s = A.makeGame()
    const pl = C.legalPlacements(s, 0)[0]
    const s2 = A.applyIntent(s, 0, intentFrom(pl))
    expect(s2).not.toBe(s)
    expect(A.seatToMove(s2)).toBe(1)
    // the placed piece left the human's hand
    expect(s2.remaining[0].includes(pl.pieceId)).toBe(false)
  })

  it('ignores an out-of-turn intent (returns same state ref)', () => {
    const s = A.makeGame()
    const pl = C.legalPlacements(s, 1)[0]
    expect(A.applyIntent(s, 1, intentFrom(pl))).toBe(s)
  })

  it('ignores an illegal intent (returns same state ref)', () => {
    const s = A.makeGame()
    // anchor on top of the neutral cathedral so the placement cannot fit
    const illegal: CathedralIntent = { piece: 'tavern', cell: C.idx(3, 5), orientation: 0 }
    expect(A.applyIntent(s, 0, illegal)).toBe(s)
    // an unknown / non-anchorable orientation off the board edge
    const offBoard: CathedralIntent = { piece: 'bridge', cell: C.idx(0, 9), orientation: 0 }
    expect(A.applyIntent(s, 0, offBoard)).toBe(s)
  })

  it('aiStep advances and alternates seats', () => {
    let s = A.makeGame()
    let last = A.seatToMove(s)
    for (let i = 0; i < 6 && !A.isOver(s); i++) {
      const seat = A.seatToMove(s)!
      const pl = C.legalPlacements(s, seat as C.Player)[0]
      s = seat === 0 ? A.applyIntent(s, 0, intentFrom(pl)) : A.aiStep(s, seat)
      const now = A.seatToMove(s)
      if (now != null && last != null) { expect(now).not.toBe(last) }
      last = now
    }
    expect(A.tickKey(s)).toBeTypeOf('string')
  })
})

describe('cathedral host + guest over an in-memory transport', () => {
  function connect() {
    const host = new HostSession(A)
    const [a, b] = memoryPair()
    host.addGuest(a)
    const guest = new GuestSession(A, b)
    return { host, guest }
  }

  it('assigns the guest seat 1 and syncs the initial view', () => {
    const { host, guest } = connect()
    expect(guest.mySeat()).toBe(1)
    expect(host.getSeats().map(s => s.kind)).toEqual(['host', 'guest'])
    expect(guest.getState().board.length).toBe(C.N * C.N)
  })

  it('relays host + guest placements and keeps both in sync', () => {
    const { host, guest } = connect()
    // host (seat 0) plays a legal placement
    const pl0 = C.legalPlacements(host.getFull(), 0)[0]
    host.dispatchLocal(intentFrom(pl0))
    expect(host.isMyTurn()).toBe(false)
    expect(guest.isMyTurn()).toBe(true)
    expect(guest.getState().turn).toBe(1)

    // guest (seat 1) replies; intent travels host-ward and applies
    const pl1 = C.legalPlacements(guest.getState(), 1)[0]
    guest.dispatch(intentFrom(pl1))
    expect(host.getFull().turn).toBe(0)
    expect(host.isMyTurn()).toBe(true)
    expect(guest.getState().step).toBe(host.getFull().step)
  })
})
