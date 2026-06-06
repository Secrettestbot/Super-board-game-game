import { describe, it, expect } from 'vitest'
import { santoriniAdapter as A, type SantoriniIntent } from './net'
import * as ST from './logic'
import { HostSession, GuestSession } from '../../net/session'
import { memoryPair } from '../../net/transport'

// Find a legal full turn (worker + climb destination + build cell) for the given side.
function findTurn(s: ST.SantoriniState, side: ST.Side): SantoriniIntent {
  for (const wi of ST.workerIndices(s, side)) {
    for (const to of ST.legalMoves(s, wi)) {
      if (s.levels[to] === 3) return { worker: wi, moveTo: to } // instant win, no build
      const workers = s.workers.map((x, k) => k === wi ? { side: x.side, pos: to } : x)
      const builds = ST.legalBuilds(s.levels, workers, to)
      if (builds.length) return { worker: wi, moveTo: to, buildAt: builds[0] }
    }
  }
  throw new Error('no legal turn for ' + side)
}

describe('santorini net adapter', () => {
  it('starts with the human (seat 0) to move on a 2-seat game', () => {
    const s = A.makeGame()
    expect(A.numSeats(s)).toBe(2)
    expect(A.seatToMove(s)).toBe(0)
    expect(A.isOver(s)).toBe(false)
  })

  it('round-trips a full legal move+build and passes the turn', () => {
    const s = A.makeGame()
    const intent = findTurn(s, 'you')
    const s2 = A.applyIntent(s, 0, intent)
    expect(s2).not.toBe(s)
    expect(s2.levels[intent.buildAt!]).toBe(s.levels[intent.buildAt!] + 1) // the build landed
    expect(s2.workers[intent.worker].pos).toBe(intent.moveTo)               // the worker climbed
    expect(A.seatToMove(s2)).toBe(1)                                        // turn passed to seat 1
    expect(A.tickKey(s2)).not.toBe(A.tickKey(s))
  })

  it('ignores an out-of-turn intent (returns same state)', () => {
    const s = A.makeGame()
    const intent = findTurn(s, 'you') // a turn that is legal for seat 0, submitted by seat 1
    expect(A.applyIntent(s, 1, intent)).toBe(s)
  })

  it('ignores an illegal intent (returns same state)', () => {
    const s = A.makeGame()
    // moveTo is a far-away, non-adjacent cell — never a legal climb
    expect(A.applyIntent(s, 0, { worker: 0, moveTo: 24, buildAt: 0 })).toBe(s)
    // a worker index that is not seat 0's worker
    expect(A.applyIntent(s, 0, { worker: 2, moveTo: 12, buildAt: 0 })).toBe(s)
  })

  it('aiStep advances the AI seat (reuses aiMove)', () => {
    // aiMove only plays the 'ai' side, so hand it a position where seat 1 is to move.
    let s = A.makeGame()
    s = A.applyIntent(s, 0, findTurn(s, 'you')) // human plays -> now seat 1's turn
    expect(A.seatToMove(s)).toBe(1)
    const before = A.tickKey(s)
    s = A.aiStep(s, 1)                           // AI seat advances
    expect(A.tickKey(s)).not.toBe(before)
    if (!A.isOver(s)) expect(A.seatToMove(s)).toBe(0) // turn back to the human
  })
})

describe('santorini netplay session (host + guest over in-memory transport)', () => {
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
    expect(host.getSeats().map(x => x.kind)).toEqual(['host', 'guest'])
    expect(guest.getState().levels.length).toBe(25)
  })

  it('relays a full turn from host to guest and back', () => {
    const { host, guest } = connect()
    // host (seat 0, 'you') plays first
    const i0 = findTurn(host.getFull(), 'you')
    host.dispatchLocal(i0)
    expect(host.isMyTurn()).toBe(false)
    expect(guest.isMyTurn()).toBe(true)                 // now seat 1's ('ai') turn, view synced
    expect(guest.getState().workers[i0.worker].pos).toBe(i0.moveTo)

    // guest (seat 1, 'ai') replies; intent travels host-ward and applies
    const i1 = findTurn(guest.getState(), 'ai')
    guest.dispatch(i1)
    expect(host.getFull().turn).toBe('you')             // back to the human side
    expect(host.isMyTurn()).toBe(true)
    expect(host.getFull().workers[i1.worker].pos).toBe(i1.moveTo)
  })

  it('ignores an out-of-turn guest intent (host is authoritative)', () => {
    const { host, guest } = connect()
    const before = A.tickKey(host.getFull())
    const i = findTurn(host.getFull(), 'you') // host's turn, guest tries to act
    guest.dispatch(i)
    expect(A.tickKey(host.getFull())).toBe(before)
  })
})
