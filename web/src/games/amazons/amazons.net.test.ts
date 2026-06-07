import { describe, it, expect } from 'vitest'
import { amazonsAdapter as A, type AmazonsIntent } from './net'
import * as AZ from './logic'
import { HostSession, GuestSession } from '../../net/session'
import { memoryPair } from '../../net/transport'

// A full legal amazons turn for the side to move = glide an amazon, then burn a square.
function legalTurn(s: AZ.AmazonsState, side: AZ.Side): AmazonsIntent {
  // Prefer a turn whose arrow does NOT land back on the origin (a legal but special case),
  // so callers can assert the origin square ends up empty.
  let t = AZ.randomTurn(s.board, side)!
  for (let k = 0; k < 60 && t.shoot === t.from; k++) t = AZ.randomTurn(s.board, side)!
  return { from: t.from, to: t.to, arrow: t.shoot }
}

describe('amazons net adapter', () => {
  it('starts with White (seat 0) to move on a 2-seat game', () => {
    const s = A.makeGame()
    expect(A.numSeats(s)).toBe(2)
    expect(A.seatToMove(s)).toBe(0)
    expect(A.isOver(s)).toBe(false)
  })

  it('round-trips a full move+arrow intent and passes the turn', () => {
    const s = A.makeGame()
    const i = legalTurn(s, 'w')
    const s2 = A.applyIntent(s, 0, i)
    expect(s2).not.toBe(s)
    expect(s2.board[i.from]).toBe(null)  // amazon left its origin
    expect(s2.board[i.to]).toBe('w')     // amazon glided to destination
    expect(s2.board[i.arrow]).toBe('x')  // arrow burned the square
    expect(s2.turn).toBe('b')
    expect(A.seatToMove(s2)).toBe(1)
    expect(A.tickKey(s2)).not.toBe(A.tickKey(s))
  })

  it('ignores an out-of-turn intent (returns same state ref)', () => {
    const s = A.makeGame()
    const i = legalTurn(s, 'w')
    // seat 1 cannot move when it is seat 0's turn
    expect(A.applyIntent(s, 1, i)).toBe(s)
  })

  it('ignores an illegal intent (returns same state ref)', () => {
    const s = A.makeGame()
    const i = legalTurn(s, 'w')
    // gliding from an empty square is illegal
    expect(A.applyIntent(s, 0, { from: 50, to: 51, arrow: 52 })).toBe(s)
    // legal glide but illegal arrow (cannot burn a square occupied by an amazon)
    expect(A.applyIntent(s, 0, { from: i.from, to: i.to, arrow: AZ.amazonsOf(s.board, 'b')[0] })).toBe(s)
  })

  it('aiStep advances the AI seat (Black) and hands back to White', () => {
    let s = A.applyIntent(A.makeGame(), 0, legalTurn(A.makeGame(), 'w'))
    expect(A.seatToMove(s)).toBe(1)
    const before = A.tickKey(s)
    s = A.aiStep(s, 1)
    expect(A.tickKey(s)).not.toBe(before)
    if (!A.isOver(s)) expect(A.seatToMove(s)).toBe(0)
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

describe('amazons net session (host + guest over in-memory transport)', () => {
  it('assigns the guest seat 1 and syncs the initial view', () => {
    const { host, guest } = connect()
    expect(guest.ready()).toBe(true)
    expect(guest.mySeat()).toBe(1)
    expect(host.getSeats().map(s => s.kind)).toEqual(['host', 'guest'])
    expect(guest.getState().board.length).toBe(100)
  })

  it('host + guest stay in sync across full turns', () => {
    const { host, guest } = connect()
    // host (White, seat 0) plays a complete turn locally
    const hw = legalTurn(host.getFull(), 'w')
    host.dispatchLocal(hw)
    expect(host.isMyTurn()).toBe(false)
    expect(guest.isMyTurn()).toBe(true) // now Black's (guest's) turn, view synced
    expect(guest.getState().board[hw.to]).toBe('w')
    expect(guest.getState().board[hw.arrow]).toBe('x')

    // guest (Black, seat 1) replies with a full turn; it travels host-ward and applies
    const gb = legalTurn(guest.getState(), 'b')
    guest.dispatch(gb)
    expect(host.getFull().board[gb.to]).toBe('b')
    expect(host.getFull().turn).toBe('w') // back to White
    expect(host.isMyTurn()).toBe(true)
    expect(guest.getState().turn).toBe(host.getFull().turn)
  })

  it('host rejects an out-of-turn guest intent (host authoritative)', () => {
    const { host, guest } = connect()
    const before = A.tickKey(host.getFull())
    // it's White's (host) turn, but the guest tries to move
    guest.dispatch(legalTurn(host.getFull(), 'b'))
    expect(A.tickKey(host.getFull())).toBe(before) // rejected, nothing changed
  })
})
