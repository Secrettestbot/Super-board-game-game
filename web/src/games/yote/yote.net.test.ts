import { describe, it, expect } from 'vitest'
import { yoteAdapter as A, type YoteNetState } from './net'
import { HostSession, GuestSession } from '../../net/session'
import { memoryPair } from '../../net/transport'
import * as YT from './logic'

describe('yote net adapter', () => {
  it('starts with dark (seat 0) to move on a 2-seat game', () => {
    const s = A.makeGame()
    expect(A.numSeats(s)).toBe(2)
    expect(A.seatToMove(s)).toBe(0)
    expect(A.isOver(s)).toBe(false)
  })

  it('applies a legal drop and passes the turn', () => {
    const s = A.makeGame()
    const s2 = A.applyIntent(s, 0, { kind: 'drop', cell: 0 })
    expect(s2).not.toBe(s)
    expect(s2.game.board[0]).toBe('d')
    expect(s2.game.hand.d).toBe(YT.HAND0 - 1)
    expect(A.seatToMove(s2)).toBe(1) // now light's turn
    expect(A.tickKey(s2)).not.toBe(A.tickKey(s))
  })

  it('applies a legal slide and passes the turn', () => {
    // hand-craft a state where dark has an on-board piece to slide
    let s = A.makeGame()
    s = A.applyIntent(s, 0, { kind: 'drop', cell: 0 }) // dark at A1 (idx 0)
    s = A.applyIntent(s, 1, { kind: 'drop', cell: 29 }) // light far away
    expect(A.seatToMove(s)).toBe(0)
    const s2 = A.applyIntent(s, 0, { kind: 'move', from: 0, to: 1 }) // slide A1->B1
    expect(s2).not.toBe(s)
    expect(s2.game.board[0]).toBe(null)
    expect(s2.game.board[1]).toBe('d')
    expect(A.seatToMove(s2)).toBe(1)
  })

  it('ignores an out-of-turn intent (returns same ref)', () => {
    const s = A.makeGame()
    expect(A.applyIntent(s, 1, { kind: 'drop', cell: 0 })).toBe(s)
  })

  it('ignores an illegal drop on an occupied cell (returns same ref)', () => {
    const s = A.applyIntent(A.makeGame(), 0, { kind: 'drop', cell: 5 })
    expect(A.seatToMove(s)).toBe(1)
    expect(A.applyIntent(s, 1, { kind: 'drop', cell: 5 })).toBe(s) // cell occupied
  })

  it('ignores an illegal move (no piece there) and a stray remove (returns same ref)', () => {
    const s = A.makeGame()
    expect(A.applyIntent(s, 0, { kind: 'move', from: 0, to: 1 })).toBe(s) // empty origin
    expect(A.applyIntent(s, 0, { kind: 'remove', cell: 0 })).toBe(s)      // not in removal phase
  })

  it('splits a capture into a jump (pending, same seat) then a remove', () => {
    // dark at idx 0, enemy at idx 1, landing idx 2 empty -> jump 0 over 1 to 2.
    // give light a couple of board pieces so a bonus removal exists.
    let s = A.makeGame()
    s = A.applyIntent(s, 0, { kind: 'drop', cell: 0 })   // d @ 0
    s = A.applyIntent(s, 1, { kind: 'drop', cell: 1 })   // l @ 1 (to be jumped)
    s = A.applyIntent(s, 0, { kind: 'drop', cell: 6 })   // d @ 6 (filler, dark turn)
    s = A.applyIntent(s, 1, { kind: 'drop', cell: 7 })   // l @ 7 (bonus-removal target)
    expect(A.seatToMove(s)).toBe(0)

    // the jump: idx 0 over idx 1 to idx 2
    const cap = YT.capturesFrom(s.game.board, 0, 'd').find(c => c.to === 2)
    expect(cap).toBeTruthy()
    const jumped = A.applyIntent(s, 0, { kind: 'move', from: 0, to: 2 })
    expect(jumped).not.toBe(s)
    expect(jumped.pending).not.toBeNull()
    expect(A.seatToMove(jumped)).toBe(0) // SAME seat must remove the bonus
    expect(A.tickKey(jumped)).not.toBe(A.tickKey(s))

    // out-of-turn / wrong-kind during removal phase -> same ref
    expect(A.applyIntent(jumped, 1, { kind: 'remove', cell: 7 })).toBe(jumped)
    expect(A.applyIntent(jumped, 0, { kind: 'drop', cell: 9 })).toBe(jumped)
    // removing a non-removable cell (empty/own) -> same ref
    expect(A.applyIntent(jumped, 0, { kind: 'remove', cell: 9 })).toBe(jumped)

    // legal removal of the bonus enemy at 7 commits the capture and passes the turn
    const done = A.applyIntent(jumped, 0, { kind: 'remove', cell: 7 })
    expect(done).not.toBe(jumped)
    expect(done.pending).toBeNull()
    expect(done.game.board[2]).toBe('d') // landed
    expect(done.game.board[1]).toBe(null) // jumped piece gone
    expect(done.game.board[7]).toBe(null) // bonus piece gone
    expect(A.seatToMove(done)).toBe(1) // turn passed to light
  })

  it('aiStep advances and resolves a whole turn for its seat', () => {
    let s = A.makeGame()
    s = A.applyIntent(s, 0, { kind: 'drop', cell: 12 })
    expect(A.seatToMove(s)).toBe(1)
    const s2 = A.aiStep(s, 1)
    expect(s2).not.toBe(s)
    expect(s2.pending).toBeNull() // AI never leaves a dangling pending
    expect(A.seatToMove(s2)).toBe(0)
    expect(A.tickKey(s2)).toBeTypeOf('string')
  })
})

describe('yote net session (host + guest over in-memory transport)', () => {
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
    expect(guest.getState().game.board.length).toBe(YT.N)
  })

  it('relays intents both directions and stays in sync', () => {
    const { host, guest } = connect()
    expect(host.isMyTurn()).toBe(true)
    expect(guest.isMyTurn()).toBe(false)

    // host (dark, seat 0) drops a seed
    host.dispatchLocal({ kind: 'drop', cell: 10 })
    expect(host.isMyTurn()).toBe(false)
    expect(guest.isMyTurn()).toBe(true) // now light's (guest's) turn, view synced
    const gv = guest.getState() as YoteNetState
    expect(gv.game.board[10]).toBe('d')

    // guest (light, seat 1) replies; intent travels host-ward and applies
    guest.dispatch({ kind: 'drop', cell: 20 })
    expect(host.getFull().game.board[20]).toBe('l')
    expect(host.isMyTurn()).toBe(true) // back to dark
    expect(guest.getState().game.board[20]).toBe('l')
  })

  it('ignores an out-of-turn guest intent (host is authoritative)', () => {
    const { host, guest } = connect()
    // it is dark's (host) turn, but the guest tries to drop
    guest.dispatch({ kind: 'drop', cell: 5 })
    expect(host.getFull().game.board[5]).toBe(null) // rejected
    expect(host.isMyTurn()).toBe(true)
  })
})
