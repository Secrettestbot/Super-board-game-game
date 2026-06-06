import { describe, it, expect } from 'vitest'
import { kalahAdapter as A } from './net'
import * as K from './logic'
import { HostSession, GuestSession } from '../../net/session'
import { memoryPair } from '../../net/transport'

describe('kalah net adapter', () => {
  it('starts with you (seat 0) to move on a 2-seat game', () => {
    const s = A.makeGame()
    expect(A.numSeats(s)).toBe(2)
    expect(A.seatToMove(s)).toBe(0)
    expect(A.isOver(s)).toBe(false)
  })

  it('applies a legal intent and passes the turn to the opponent', () => {
    const s = A.makeGame()
    // pit 0 sows seeds into 1..4 (none reach the store), so the turn passes to seat 1
    const s2 = A.applyIntent(s, 0, { pit: 0 })
    expect(s2).not.toBe(s)
    expect(A.seatToMove(s2)).toBe(1)
  })

  it('extra turn (last seed in own store) keeps the SAME seat to move', () => {
    const s = A.makeGame()
    // pit 2 holds 4 seeds -> sows into 3,4,5,store(6); last seed lands in your store
    const s2 = A.applyIntent(s, 0, { pit: 2 })
    expect(s2).not.toBe(s)
    expect(s2.last).toBe(K.YOUR_STORE)
    expect(A.seatToMove(s2)).toBe(0) // still seat 0's turn — extra turn
    expect(A.tickKey(s2)).not.toBe(A.tickKey(s)) // tick changed so the AI timer re-arms
  })

  it('ignores an out-of-turn intent (returns same state)', () => {
    const s = A.makeGame()
    expect(A.applyIntent(s, 1, { pit: 0 })).toBe(s)
  })

  it('ignores an illegal intent (empty/out-of-side pit) and returns same state', () => {
    const s = A.makeGame()
    expect(A.applyIntent(s, 0, { pit: 7 })).toBe(s)  // an AI-side pit, not seat 0's
    expect(A.applyIntent(s, 0, { pit: 6 })).toBe(s)  // the store, not a sowable pit
    expect(A.applyIntent(s, 0, { pit: -1 })).toBe(s) // out of range
  })

  it('aiStep advances the game and changes the tick', () => {
    let s = A.makeGame()
    const before = A.tickKey(s)
    s = A.applyIntent(s, 0, { pit: 0 }) // hand the turn to the AI (seat 1)
    expect(A.seatToMove(s)).toBe(1)
    const s2 = A.aiStep(s, 1)
    expect(s2).not.toBe(s)
    expect(A.tickKey(s2)).not.toBe(before)
  })
})

describe('kalah host + guest over an in-memory transport', () => {
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
    expect(guest.getState().pits.length).toBe(14)
  })

  it('relays moves both ways and stays in sync, honouring extra turns', () => {
    const { host, guest } = connect()
    // host (seat 0) takes an extra-turn move (pit 2 lands in its store)
    host.dispatchLocal({ pit: 2 })
    expect(host.getFull().last).toBe(K.YOUR_STORE)
    expect(host.isMyTurn()).toBe(true)  // extra turn — still host's move
    expect(guest.isMyTurn()).toBe(false)

    // host then plays a non-extra move to pass the turn to the guest
    host.dispatchLocal({ pit: 0 })
    expect(host.isMyTurn()).toBe(false)
    expect(guest.isMyTurn()).toBe(true) // now seat 1's (guest's) turn, view synced

    // guest replies; intent travels host-ward and applies
    const before = host.getFull().moveCount
    const m = K.legalMoves(guest.getState(), 'ai')[0]
    guest.dispatch({ pit: m })
    expect(host.getFull().moveCount).toBeGreaterThan(before)
    // guest's view reflects the host's authoritative state
    expect(guest.getState().moveCount).toBe(host.getFull().moveCount)
  })

  it('ignores an out-of-turn guest intent (host is authoritative)', () => {
    const { host, guest } = connect()
    const before = host.getFull().moveCount
    // it's seat 0's (host) turn, but the guest tries to move
    guest.dispatch({ pit: 7 })
    expect(host.getFull().moveCount).toBe(before)
  })
})
