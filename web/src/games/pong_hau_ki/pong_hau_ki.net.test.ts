import { describe, it, expect } from 'vitest'
import { pongHauKiAdapter as A, type PHKIntent } from './net'
import * as PHK from './logic'
import { HostSession, GuestSession } from '../../net/session'
import { memoryPair } from '../../net/transport'

const { PT } = PHK

describe("pong hau k'i net adapter", () => {
  it('starts with Red (seat 0) to move on a 2-seat game', () => {
    const s = A.makeGame()
    expect(A.numSeats(s)).toBe(2)
    expect(A.seatToMove(s)).toBe(0)
    expect(A.isOver(s)).toBe(false)
  })

  it('applies a legal intent and passes the turn (tickKey changes)', () => {
    const s = A.makeGame()
    const m = PHK.legalMoves(s.board, 'r')[0] // opening: only TL -> Centre
    const before = A.tickKey(s)
    const s2 = A.applyIntent(s, 0, { from: m.from, to: m.to })
    expect(s2).not.toBe(s)
    expect(A.seatToMove(s2)).toBe(1)
    expect(A.tickKey(s2)).not.toBe(before)
  })

  it('ignores an out-of-turn intent (returns same state)', () => {
    const s = A.makeGame()
    const m = PHK.legalMoves(s.board, 'r')[0]
    // seat 1 (Blue) tries to move on Red's turn -> unchanged ref
    expect(A.applyIntent(s, 1, { from: m.from, to: m.to })).toBe(s)
  })

  it('ignores an illegal intent (returns same state)', () => {
    const s = A.makeGame()
    // TR is not adjacent to the empty centre -> illegal -> unchanged ref
    expect(A.applyIntent(s, 0, { from: PT.TR, to: PT.C })).toBe(s)
  })

  it('aiStep plays the Blue (seat 1) side and changes tickKey', () => {
    // This game's aiMove only ever plays Blue, so drive Red manually and Blue via aiStep.
    let s = A.makeGame()
    const m = PHK.legalMoves(s.board, 'r')[0]
    s = A.applyIntent(s, 0, { from: m.from, to: m.to }) // Red opens -> Blue (seat 1) to move
    expect(A.seatToMove(s)).toBe(1)
    const before = A.tickKey(s)
    const s2 = A.aiStep(s, 1)
    expect(s2).not.toBe(s)
    expect(A.tickKey(s2)).not.toBe(before)
  })
})

describe("pong hau k'i netplay (host + guest over in-memory transport)", () => {
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
    expect(guest.mySeat()).toBe(1) // host seat 0 (Red), guest seat 1 (Blue)
    expect(host.getSeats().map(s => s.kind)).toEqual(['host', 'guest'])
    expect(guest.getState().board).toHaveLength(5)
  })

  it('relays moves both ways and stays in sync', () => {
    const { host, guest } = connect()
    // host (Red, seat 0) plays the opening slide
    const m0 = PHK.legalMoves(host.getFull().board, 'r')[0]
    host.dispatchLocal({ from: m0.from, to: m0.to })
    expect(host.isMyTurn()).toBe(false)
    expect(guest.isMyTurn()).toBe(true) // now Blue's (guest's) turn, view synced
    expect(guest.getState().board[PT.C]).toBe('r')

    // guest (Blue, seat 1) replies with a legal slide; intent travels host-ward.
    // (In this tiny game Blue's only reply traps Red, ending the match — that's fine;
    // what we assert is the round-trip: the host applied it and both views agree.)
    const beforeKey = A.tickKey(host.getFull())
    const gm = PHK.legalMoves(guest.getState().board, 'b')[0]
    guest.dispatch({ from: gm.from, to: gm.to })
    expect(A.tickKey(host.getFull())).not.toBe(beforeKey) // host advanced from the guest move
    expect(guest.getState().board[gm.to]).toBe('b')        // guest's view reflects its own slide
    expect(guest.getState().board).toEqual(host.getFull().board) // authoritative sync
  })

  it('ignores an out-of-turn guest intent (host authoritative)', () => {
    const { host, guest } = connect()
    const before = A.tickKey(host.getFull())
    // it's Red's (host) turn, but the guest tries to move
    const gm: PHKIntent = { from: PT.BR, to: PT.C }
    guest.dispatch(gm)
    expect(A.tickKey(host.getFull())).toBe(before) // rejected, nothing changed
  })
})
