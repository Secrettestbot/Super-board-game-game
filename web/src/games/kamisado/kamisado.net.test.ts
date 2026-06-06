import { describe, it, expect } from 'vitest'
import { kamisadoAdapter as A, type KamisadoIntent } from './net'
import * as KM from './logic'
import { HostSession, GuestSession } from '../../net/session'
import { memoryPair } from '../../net/transport'

describe('kamisado net adapter', () => {
  it('starts with seat 0 ("you") to move on a 2-seat game', () => {
    const s = A.makeGame()
    expect(A.numSeats(s)).toBe(2)
    expect(A.seatToMove(s)).toBe(0)
    expect(A.isOver(s)).toBe(false)
  })

  it('applies a legal intent and passes the turn to seat 1', () => {
    const s = A.makeGame()
    const m = KM.legalMoves(s, 'you')[0]
    const s2 = A.applyIntent(s, 0, { from: m.from, to: m.to })
    expect(s2).not.toBe(s)
    expect(A.seatToMove(s2)).toBe(1) // rival forced to move next
  })

  it('ignores an out-of-turn intent (returns same ref)', () => {
    const s = A.makeGame()
    const m = KM.legalMoves(s, 'you')[0]
    // seat 1 has no business moving on the opening turn
    expect(A.applyIntent(s, 1, { from: m.from, to: m.to })).toBe(s)
  })

  it('ignores an illegal intent (returns same ref)', () => {
    const s = A.makeGame()
    // from an empty middle cell to nowhere reasonable -> not in legalMoves
    expect(A.applyIntent(s, 0, { from: 27, to: 28 })).toBe(s)
  })

  it('rejects a sideways/backward move not in the legal set', () => {
    const s = A.makeGame()
    const from = KM.idx(7, 0) // a "you" home tower
    // sideways is never legal
    expect(A.applyIntent(s, 0, { from, to: KM.idx(7, 1) })).toBe(s)
  })

  it('enforces the forced-colour constraint on the second move', () => {
    const s = A.makeGame()
    const m0 = KM.legalMoves(s, 'you')[0]
    const s1 = A.applyIntent(s, 0, { from: m0.from, to: m0.to })
    expect(s1.required).not.toBeNull()
    // seat 1's legal moves are restricted to the required-colour tower
    const aiLegal = KM.legalMoves(s1, 'ai')
    expect(aiLegal.every(m => m.color === s1.required)).toBe(true)
    // a move with the WRONG tower (a different colour) must be rejected
    const wrong = KM.findTower(s1.board, 'ai', (s1.required! + 1) % 8)
    const wrongDest = KM.movesFor(s1.board, wrong)[0]
    if (wrongDest != null) {
      expect(A.applyIntent(s1, 1, { from: wrong, to: wrongDest })).toBe(s1)
    }
    // the correct required tower advances
    const ok = aiLegal[0]
    const s2 = A.applyIntent(s1, 1, { from: ok.from, to: ok.to })
    expect(s2).not.toBe(s1)
  })

  it('tickKey changes on every move', () => {
    const s = A.makeGame()
    const k0 = A.tickKey(s)
    const m = KM.legalMoves(s, 'you')[0]
    const s2 = A.applyIntent(s, 0, { from: m.from, to: m.to })
    expect(A.tickKey(s2)).not.toBe(k0)
  })
})

describe('kamisado host + guest sync over an in-memory transport', () => {
  function connect() {
    const host = new HostSession(A)
    const [a, b] = memoryPair()
    host.addGuest(a)
    const guest = new GuestSession(A, b)
    return { host, guest }
  }

  it('assigns the guest seat 1 and syncs the initial board', () => {
    const { host, guest } = connect()
    expect(guest.ready()).toBe(true)
    expect(guest.mySeat()).toBe(1)
    expect(host.getSeats().map(s => s.kind)).toEqual(['host', 'guest'])
    expect(guest.getState().board.length).toBe(64)
  })

  it('relays moves both directions and keeps host + guest in sync', () => {
    const { host, guest } = connect()
    expect(host.isMyTurn()).toBe(true)
    expect(guest.isMyTurn()).toBe(false)

    // host (seat 0 = 'you') makes the free opening move
    const m0 = KM.legalMoves(host.getFull(), 'you')[0]
    host.dispatchLocal({ from: m0.from, to: m0.to })
    expect(host.isMyTurn()).toBe(false)
    expect(guest.isMyTurn()).toBe(true) // forced colour now on the guest

    // guest (seat 1 = 'ai') replies with its required-colour tower
    const m1 = KM.legalMoves(guest.getState(), 'ai')[0]
    guest.dispatch({ from: m1.from, to: m1.to })
    expect(host.getFull().last).toEqual({ from: m1.from, to: m1.to })
    // guest's view matches the host's authoritative state
    expect(guest.getState().last).toEqual(host.getFull().last)
  })

  it('ignores an out-of-turn guest intent (host stays authoritative)', () => {
    const { host, guest } = connect()
    const before = host.getFull()
    // it's the host's turn, but the guest tries to move one of seat 1's towers
    const aiTower = KM.findTower(before.board, 'ai', 0)
    const dest = KM.movesFor(before.board, aiTower)[0]
    guest.dispatch({ from: aiTower, to: dest } as KamisadoIntent)
    expect(host.getFull()).toBe(before) // nothing changed
  })
})
