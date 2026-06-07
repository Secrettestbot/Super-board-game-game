/* THAT'S PRETTY CLEVER! — netplay adapter tests. Part 1 exercises the adapter directly
 * (round-tripping a legal intent and rejecting illegal / out-of-turn ones). Part 2 wires a
 * HostSession + GuestSession through an in-memory transport pair and proves the active->passive
 * platter hand-off stays in sync across the wire. Everything is public, so no leak test. */

import { describe, it, expect } from 'vitest'
import { thatsPrettyCleverAdapter as A, type ThatsPrettyCleverIntent } from './net'
import { HostSession, GuestSession } from '../../net/session'
import { memoryPair } from '../../net/transport'
import * as G from './logic'
import type { State, Die } from './logic'

function die(color: G.Color, value: number): Die { return { color, value } }

describe('thats_pretty_clever net adapter', () => {
  it('reports the active seat and the right seat count', () => {
    const s = A.makeGame()
    expect(A.numSeats(s)).toBe(2)
    expect(A.seatToMove(s)).toBe(0) // active player rolls first
    expect(A.isOver(s)).toBe(false)
  })

  it('round-trips a legal roll then an active pick, and rejects out-of-turn / illegal intents', () => {
    const s0 = A.makeGame()

    // out-of-turn: seat 1 cannot act while seat 0 is active -> state unchanged (===)
    expect(A.applyIntent(s0, 1, { kind: 'roll' })).toBe(s0)
    // a 'pick' during the 'roll' phase is illegal -> unchanged
    expect(A.applyIntent(s0, 0, { kind: 'pick', die: 0 })).toBe(s0)

    // legal roll by the active seat advances into the 'pick' phase
    const s1 = A.applyIntent(s0, 0, { kind: 'roll' })
    expect(s1).not.toBe(s0)
    expect(s1.phase).toBe('pick')
    expect(s1.roll.length).toBeGreaterThan(0)
    expect(A.tickKey(s1)).not.toBe(A.tickKey(s0))

    // an out-of-range die index is illegal -> unchanged
    expect(A.applyIntent(s1, 0, { kind: 'pick', die: 999 })).toBe(s1)

    // pick the first (non-white) coloured die -> it lands on its track; tickKey changes
    const di = s1.roll.findIndex(d => d.color !== 'white')
    const idx = di >= 0 ? di : 0
    const target = s1.roll[idx].color === 'white' ? ('orange' as const) : undefined
    const s2 = A.applyIntent(s1, 0, { kind: 'pick', die: idx, target })
    expect(s2).not.toBe(s1)
    expect(A.tickKey(s2)).not.toBe(A.tickKey(s1))
  })

  it('walks the passive opponent through the platter phase, then null when over', () => {
    // Force an end-of-turn: 1 pick left, choose a high die so the rest fall to the platter.
    const base = G.makeGame()
    const roll = [die('orange', 5), die('green', 2), die('purple', 3)]
    let s: State = Object.assign({}, base, { active: 0 as 0 | 1, phase: 'pick' as const, roll, picksLeft: 1 })
    s = A.applyIntent(s, 0, { kind: 'pick', die: 0 }) // places orange 5; turn ends -> platter phase
    expect(s.phase).toBe('platter')
    expect(A.seatToMove(s)).toBe(1) // the opponent now owes a platter pick

    // the ACTIVE seat may not act during the opponent's platter window
    expect(A.applyIntent(s, 0, { kind: 'roll' })).toBe(s)

    // the opponent takes platter die 0 -> the turn resolves and the active pointer advances
    const after = A.applyIntent(s, 1, { kind: 'pick', die: 0 })
    expect(after).not.toBe(s)
    expect(A.tickKey(after)).not.toBe(A.tickKey(s))
  })
})

describe('thats_pretty_clever host + guest over an in-memory transport', () => {
  it('syncs the active roll/pick then the guest\'s platter pick', () => {
    const host = new HostSession(A)
    const [a, b] = memoryPair()
    host.addGuest(a)
    const guest = new GuestSession(A, b)

    expect(guest.mySeat()).toBe(1) // host is seat 0, guest gets seat 1
    expect(host.isMyTurn()).toBe(true) // seat 0 active, rolls first
    expect(guest.isMyTurn()).toBe(false)

    // host (seat 0) rolls, then plays its three picks via the active sequence until the turn ends.
    host.dispatchLocal({ kind: 'roll' })
    let guard = 0
    while (host.getFull().phase !== 'platter' && host.getFull().winner == null && guard++ < 50) {
      const full = host.getFull()
      if (full.phase === 'roll') { host.dispatchLocal({ kind: 'roll' }); continue }
      // phase 'pick': use the AI's choice to make a guaranteed-legal active pick.
      const pick = G.bestActivePick(full)
      if (!pick) { host.dispatchLocal({ kind: 'done' }); continue }
      const intent: ThatsPrettyCleverIntent = { kind: 'pick', die: pick.dieIndex, target: pick.asColor }
      host.dispatchLocal(intent)
    }

    // now it's the guest's (seat 1) platter turn — the view crossed the wire
    expect(host.getFull().phase).toBe('platter')
    expect(guest.isMyTurn()).toBe(true)
    expect(host.isMyTurn()).toBe(false)
    expect(guest.getState().platter.length).toBeGreaterThan(0)

    // guest replies with a platter pick; the host applies it authoritatively and the turn advances
    const beforeKey = A.tickKey(host.getFull())
    guest.dispatch({ kind: 'pick', die: 0 })
    expect(A.tickKey(host.getFull())).not.toBe(beforeKey)
    expect(host.getFull().platterPending).toHaveLength(0)
    // guest's view reflects the host's authoritative state
    expect(A.tickKey(guest.getState())).toBe(A.tickKey(host.getFull()))
  })
})
