/* HEARTS — netplay tests. Proves the adapter round-trips legal intents (pass + play),
 * rejects illegal / out-of-turn ones, that a HostSession + GuestSession stay in sync over
 * an in-memory transport, and — the crucial guard for a hidden-info game — that a guest's
 * view never contains any other seat's hand cards or pass selections. */

import { describe, it, expect } from 'vitest'
import { heartsAdapter as A } from './net'
import type { HeartsNetState } from './net'
import { HostSession, GuestSession } from '../../net/session'
import { memoryPair } from '../../net/transport'
import * as H from './logic'

/** Build a fresh game on hand 2 (passDir 'right') so passing is always active, with a
 * fully-known deck so we can assert on specific card ids. Deck order = seats 0,1,2,3. */
function passingGame(): HeartsNetState {
  return H.makeGame(H.buildDeck(), 2) as HeartsNetState
}

/** Drive every seat's pass through the adapter, returning the resolved playing state. */
function resolveAllPasses(s0: HeartsNetState): HeartsNetState {
  let s = s0
  for (let guard = 0; guard < 4; guard++) {
    const seat = A.seatToMove(s)
    if (seat == null || s.phase !== 'passing') break
    s = A.applyIntent(s, seat, { kind: 'pass', cardIds: H.aiPass(s, seat) })
  }
  return s
}

describe('hearts net adapter', () => {
  it('round-trips a legal pass and rejects illegal / out-of-turn passes', () => {
    const s = passingGame()
    expect(s.phase).toBe('passing')
    expect(A.numSeats(s)).toBe(4)
    expect(A.seatToMove(s)).toBe(0) // seat 0 owes the first pass

    const myPass = s.hands[0].slice(0, 3).map(c => c.id)

    // out-of-turn: seat 1 cannot pass while seat 0 still owes one -> unchanged (===)
    expect(A.applyIntent(s, 1, { kind: 'pass', cardIds: s.hands[1].slice(0, 3).map(c => c.id) })).toBe(s)
    // illegal: wrong count -> unchanged
    expect(A.applyIntent(s, 0, { kind: 'pass', cardIds: myPass.slice(0, 2) })).toBe(s)
    // illegal: a card seat 0 does not own -> unchanged
    expect(A.applyIntent(s, 0, { kind: 'pass', cardIds: [s.hands[1][0].id, myPass[0], myPass[1]] })).toBe(s)
    // wrong intent kind during passing -> unchanged
    expect(A.applyIntent(s, 0, { kind: 'play', cardId: myPass[0] })).toBe(s)

    // legal: seat 0 passes -> state changes, now seat 1 owes a pass
    const s1 = A.applyIntent(s, 0, { kind: 'pass', cardIds: myPass })
    expect(s1).not.toBe(s)
    expect(A.seatToMove(s1)).toBe(1)
    expect(A.tickKey(s1)).not.toBe(A.tickKey(s))

    // double-pass by the same seat now rejected
    expect(A.applyIntent(s1, 0, { kind: 'pass', cardIds: myPass })).toBe(s1)
  })

  it('resolves all four passes into the playing phase, then round-trips a play', () => {
    const playing = resolveAllPasses(passingGame())
    expect(playing.phase).toBe('playing')
    const lead = A.seatToMove(playing)!
    expect(lead).not.toBeNull()

    // out-of-turn play -> unchanged
    const other = (lead + 1) % 4
    expect(A.applyIntent(playing, other, { kind: 'play', cardId: playing.hands[other][0].id })).toBe(playing)
    // illegal card (not in hand) -> unchanged
    expect(A.applyIntent(playing, lead, { kind: 'play', cardId: -999 })).toBe(playing)

    // legal play (the 2 of clubs must lead the first trick)
    const legal = H.legalPlays(playing, lead)
    const after = A.applyIntent(playing, lead, { kind: 'play', cardId: legal[0].id })
    expect(after).not.toBe(playing)
    expect(after.trick.length).toBe(1)
    expect(A.tickKey(after)).not.toBe(A.tickKey(playing))
  })

  it('host + guest stay in sync over an in-memory transport', () => {
    const host = new HostSession(A)
    const [a, b] = memoryPair(); host.addGuest(a)
    const guest = new GuestSession(A, b)
    expect(guest.mySeat()).toBe(1) // host=0, guest gets the next open seat

    // Hand 1 is 'left' pass (passing phase). Seat 0 (host) owes the first pass.
    const full = host.getFull()
    if (full.phase === 'passing') {
      expect(host.isMyTurn()).toBe(true)
      host.dispatchLocal({ kind: 'pass', cardIds: full.hands[0].slice(0, 3).map(c => c.id) })
      // now seat 1 (the guest) owes a pass
      expect(guest.isMyTurn()).toBe(true)
      const gv = guest.getState()
      guest.dispatch({ kind: 'pass', cardIds: gv.hands[1].slice(0, 3).map(c => c.id) })
      // AI fills seats 2 and 3 automatically via the host's stepAI loop
      while (host.aiSeat() != null) host.stepAI()
      expect(host.getFull().phase).toBe('playing')
    }
    // guest's view tracks the host's authoritative hand/trick counts
    expect(guest.getState().phase).toBe(host.getFull().phase)
    expect(guest.getState().handNo).toBe(host.getFull().handNo)
  })

  it('LEAK: a guest never sees any other seat\'s hand cards or pass picks', () => {
    const host = new HostSession(A)
    const [a, b] = memoryPair(); host.addGuest(a)
    const guest = new GuestSession(A, b)
    const mySeat = guest.mySeat() // 1

    // Submit the host's secret pass so a pass selection exists on the wire too.
    const full = host.getFull()
    if (full.phase === 'passing') {
      host.dispatchLocal({ kind: 'pass', cardIds: full.hands[0].slice(0, 3).map(c => c.id) })
    }

    const view = guest.getState()
    const blob = JSON.stringify(view)

    // The guest sees its own real hand...
    const myIds = new Set(view.hands[mySeat].map(c => c.id))
    expect(view.hands[mySeat].every(c => c.id > 0)).toBe(true)

    // ...but every OTHER seat's hand is placeholders (count kept, ids hidden).
    for (let seat = 0; seat < A.numSeats(view); seat++) {
      if (seat === mySeat) continue
      expect(view.hands[seat].length).toBe(host.getFull().hands[seat].length) // count preserved
      expect(view.hands[seat].every(c => c.id === -1)).toBe(true)             // ids stripped
    }

    // None of the OTHER seats' real card ids appear anywhere in the wire blob.
    const authFull = host.getFull()
    for (let seat = 0; seat < authFull.hands.length; seat++) {
      if (seat === mySeat) continue
      for (const c of authFull.hands[seat]) {
        if (myIds.has(c.id)) continue // shared-deck ids can collide only if equal; they don't here
        expect(blob).not.toContain(`"id":${c.id}`)
      }
    }
    // The host's secret pass selection is redacted in the guest's _passes view: present
    // but blanked to -1 placeholders (the host has passed; seat 0's entry is non-null).
    const hostFull = host.getFull() as HeartsNetState
    if (hostFull._passes && hostFull._passes[0]) {
      const vp = (view as HeartsNetState)._passes
      expect(vp).toBeTruthy()
      expect(vp![0]).toEqual([-1, -1, -1]) // seat 0's real pick ids hidden from the guest
      // and those real ids never crossed the wire (already covered by the hand-id check,
      // since during passing the pass cards are still in seat 0's hand)
      for (const id of hostFull._passes[0]) expect(blob).not.toContain(`"id":${id}`)
    }
  })
})
