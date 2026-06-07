/* Carnac netplay: adapter round-trip + a host/guest integration run over an in-memory
 * transport (the headless substitute for a live WebRTC end-to-end). Carnac is perfect
 * information, so there is no redaction/leak test. */

import { describe, it, expect } from 'vitest'
import { carnacAdapter as A } from './net'
import * as CK from './logic'
import { HostSession, GuestSession } from '../../net/session'
import { memoryPair } from '../../net/transport'

describe('carnac net adapter', () => {
  it('starts with Menhir (seat 0) to move on a 2-seat game', () => {
    const s = A.makeGame()
    expect(A.numSeats(s)).toBe(2)
    expect(A.seatToMove(s)).toBe(0)
    expect(A.isOver(s)).toBe(false)
  })

  it('applies a legal intent and passes the turn to seat 1', () => {
    const s = A.makeGame()
    const i = CK.legalMoves(s.board, 'm')[0]
    const s2 = A.applyIntent(s, 0, { i })
    expect(s2).not.toBe(s)
    expect(A.seatToMove(s2)).toBe(1)
  })

  it('ignores an out-of-turn intent (returns same state)', () => {
    const s = A.makeGame()
    const i = CK.legalMoves(s.board, 'd')[0]
    // seat 1 tries to move while it is seat 0's turn
    expect(A.applyIntent(s, 1, { i })).toBe(s)
  })

  it('ignores an illegal intent (returns same state)', () => {
    const s = A.makeGame()
    // anchor in the bottom row has no cell below it -> illegal vertical placement
    const bottomAnchor = (CK.ROWS - 1) * CK.COLS
    expect(A.applyIntent(s, 0, { i: bottomAnchor })).toBe(s)
    // a wildly out-of-range anchor is also rejected
    expect(A.applyIntent(s, 0, { i: 9999 })).toBe(s)
  })

  it('aiStep drives the dolmen seat, advancing the game and bumping tickKey', () => {
    // aiMove only acts for the dolmen ('d', seat 1), so reach seat 1 with a menhir move,
    // then verify aiStep advances and changes tickKey on every transition.
    let s = A.makeGame()
    for (let n = 0; n < 6 && !A.isOver(s); n++) {
      const before = A.tickKey(s)
      if (A.seatToMove(s) === 0) {
        const i = CK.legalMoves(s.board, 'm')[0]
        s = A.applyIntent(s, 0, { i })
      } else {
        s = A.aiStep(s, 1)
      }
      expect(A.tickKey(s)).not.toBe(before) // tickKey changes every action
    }
  })
})

describe('carnac netplay session (host + guest over in-memory transport)', () => {
  function connect() {
    const host = new HostSession(A)
    const [a, b] = memoryPair()
    host.addGuest(a)
    const guest = new GuestSession(A, b)
    return { host, guest }
  }

  it('assigns the guest the open seat and syncs the initial view', () => {
    const { host, guest } = connect()
    expect(guest.ready()).toBe(true)
    expect(guest.mySeat()).toBe(1) // host is seat 0 (Menhir), guest gets seat 1 (Dolmen)
    expect(host.getSeats().map(s => s.kind)).toEqual(['host', 'guest'])
    expect(guest.getState().board.length).toBe(CK.COLS * CK.ROWS)
  })

  it('relays intents both ways and stays in sync', () => {
    const { host, guest } = connect()
    // host (Menhir, seat 0) places first
    const mMove = CK.legalMoves(host.getFull().board, 'm')[0]
    host.dispatchLocal({ i: mMove })
    expect(host.isMyTurn()).toBe(false)
    expect(guest.isMyTurn()).toBe(true) // now the Dolmen (guest) to move, view synced

    // guest (Dolmen, seat 1) replies; intent travels host-ward and applies
    const dMove = CK.legalMoves(guest.getState().board, 'd')[0]
    guest.dispatch({ i: dMove })
    expect(host.getFull().turn).toBe('m') // back to the Menhir
    expect(host.isMyTurn()).toBe(true)
    // guest's view reflects the host's authoritative board
    expect(guest.getState().board).toEqual(host.getFull().board)
  })

  it('ignores an out-of-turn guest intent (host is authoritative)', () => {
    const { host, guest } = connect()
    const before = host.getFull().board.filter(v => v).length
    // it is the Menhir's (host) turn, but the guest tries to place a dolmen
    const dMove = CK.legalMoves(host.getFull().board, 'd')[0]
    guest.dispatch({ i: dMove })
    expect(host.getFull().board.filter(v => v).length).toBe(before) // rejected
  })
})
