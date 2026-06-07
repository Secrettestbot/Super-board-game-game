/* THE FOX IN THE FOREST — netplay adapter tests. Three parts:
 *   1. adapter round-trip: a legal play advances the state; illegal / out-of-turn intents
 *      return the input state unchanged (===).
 *   2. host + guest stay in sync over an in-memory transport, with the guest playing seat 1.
 *   3. leak test: the guest's redacted view never carries the host's private hand cards or
 *      the face-down draw pile.
 */

import { describe, it, expect } from 'vitest'
import { foxInForestAdapter as A, type FoxNetState } from './net'
import { HostSession, GuestSession } from '../../net/session'
import { memoryPair } from '../../net/transport'
import * as FX from './logic'
import type { Player } from './logic'

const seatOf = (p: Player) => (p === 'you' ? 0 : 1)
const playerOf = (seat: number): Player => (seat === 1 ? 'ai' : 'you')

/** A legal card id for the seat to move in a normal play position. */
function aLegalPlay(s: FoxNetState): { seat: number; cardId: number } {
  const seat = A.seatToMove(s)!
  const who = playerOf(seat)
  const led = s.trick.length ? s.trick[0].card : null
  const legal = FX.legalPlays(s.hands[who], led, s.trump)
  return { seat, cardId: legal[0].id }
}

describe('fox in the forest net adapter', () => {
  it('reports two seats and the leader as the seat to move', () => {
    const s = A.makeGame()
    expect(A.numSeats(s)).toBe(2)
    expect(A.isOver(s)).toBe(false)
    expect(A.seatToMove(s)).toBe(seatOf(s.leader))
  })

  it('round-trips a legal play and rejects illegal / out-of-turn intents', () => {
    const s = A.makeGame()
    const { seat, cardId } = aLegalPlay(s)
    const other = seat === 0 ? 1 : 0

    // out-of-turn: the non-leader tries to play -> unchanged
    expect(A.applyIntent(s, other, { kind: 'play', cardId })).toBe(s)
    // illegal card id (not in hand) -> unchanged
    expect(A.applyIntent(s, seat, { kind: 'play', cardId: -999 })).toBe(s)
    // collect / nextHand out of phase -> unchanged
    expect(A.applyIntent(s, seat, { kind: 'collect' })).toBe(s)
    expect(A.applyIntent(s, 0, { kind: 'nextHand' })).toBe(s)

    // legal play -> state changes, the card leaves the hand, tickKey moves
    const before = A.tickKey(s)
    const ns = A.applyIntent(s, seat, { kind: 'play', cardId })
    expect(ns).not.toBe(s)
    expect(ns.hands[playerOf(seat)].some(c => c.id === cardId)).toBe(false)
    expect(ns.trick.some(t => t.card.id === cardId)).toBe(true)
    expect(A.tickKey(ns)).not.toBe(before)
  })

  it('drives a completed trick through pending -> collect to the next leader', () => {
    let s = A.makeGame()
    // play both cards of the first trick (lead then follow)
    for (let n = 0; n < 2; n++) {
      const { seat, cardId } = aLegalPlay(s)
      s = A.applyIntent(s, seat, { kind: 'play', cardId })
    }
    // both cards down -> a completed trick parks in pending; seatToMove = the winner
    expect(s.pending).not.toBeNull()
    const winnerSeat = seatOf(s.pending!.winner)
    expect(A.seatToMove(s)).toBe(winnerSeat)
    // only the winner can collect; the loser's collect is ignored
    const loser = winnerSeat === 0 ? 1 : 0
    expect(A.applyIntent(s, loser, { kind: 'collect' })).toBe(s)
    const collected = A.applyIntent(s, winnerSeat, { kind: 'collect' })
    expect(collected.pending).toBeNull()
    expect(collected.trick).toHaveLength(0)
    expect(A.seatToMove(collected)).toBe(seatOf(collected.leader))
  })

  it('plays a full game to a winner via the adapter + AI without throwing', () => {
    let s = A.makeGame()
    let guard = 0
    while (!A.isOver(s) && guard++ < 6000) {
      const seat = A.seatToMove(s)
      if (seat == null) break
      if (s.phase === 'handEnd') { s = A.applyIntent(s, 0, { kind: 'nextHand' }); continue }
      if (s.pending) { s = A.applyIntent(s, seat, { kind: 'collect' }); continue }
      const who = playerOf(seat)
      // A Swan (1) lead window: the leader must decide. seat 0 keeps the trump; seat 1 (AI)
      // resolves it through aiStep. This is a real to-move state with no card to play.
      if (FX.canSwapDecree(s, who) && s.trick.length === 1 && s.trick[0].player === who) {
        s = seat === 0 ? A.applyIntent(s, 0, { kind: 'keepDecree' }) : A.aiStep(s, seat)
        continue
      }
      // seat 0 plays via the adapter's intent path, seat 1 via the AI
      if (seat === 0) { const { cardId } = aLegalPlay(s); s = A.applyIntent(s, 0, { kind: 'play', cardId }) }
      else s = A.aiStep(s, seat)
    }
    expect(guard).toBeLessThan(6000)
    expect(A.isOver(s)).toBe(true)
    expect(['you', 'ai', 'tie']).toContain(s.winner)
  })
})

function connect() {
  const host = new HostSession(A)
  const [a, b] = memoryPair()
  host.addGuest(a)
  const guest = new GuestSession(A, b)
  return { host, guest }
}

describe('fox in the forest host + guest sync', () => {
  it('assigns the guest seat 1 and syncs the initial view', () => {
    const { host, guest } = connect()
    expect(guest.ready()).toBe(true)
    expect(guest.mySeat()).toBe(1)
    expect(host.getSeats().map(s => s.kind)).toEqual(['host', 'guest'])
  })

  it('relays a guest play to the host and broadcasts the new view back', () => {
    const { host, guest } = connect()
    const full = host.getFull()
    const leaderSeat = seatOf(full.leader)

    if (leaderSeat === 0) {
      // host leads: play, then it should become the guest's (seat 1) turn
      const { cardId } = aLegalPlay(full)
      host.dispatchLocal({ kind: 'play', cardId })
      expect(host.isMyTurn()).toBe(false)
      expect(guest.isMyTurn()).toBe(true)
      // guest follows; its play travels host-ward and applies to the authority
      const gv = guest.getState()
      const led = gv.trick[0].card
      const gLegal = FX.legalPlays(gv.hands.ai, led, gv.trump)
      const beforeTrick = host.getFull().trick.length
      guest.dispatch({ kind: 'play', cardId: gLegal[0].id })
      expect(host.getFull().trick.length).not.toBe(beforeTrick)
    } else {
      // guest leads (seat 1): it is the guest's turn first
      expect(guest.isMyTurn()).toBe(true)
      expect(host.isMyTurn()).toBe(false)
      const gv = guest.getState()
      const gLegal = FX.legalPlays(gv.hands.ai, null, gv.trump)
      guest.dispatch({ kind: 'play', cardId: gLegal[0].id })
      // now the host (seat 0) should be on the move with one card down
      expect(host.getFull().trick).toHaveLength(1)
      expect(host.isMyTurn()).toBe(true)
    }
  })
})

describe('fox in the forest redaction (leak test)', () => {
  it("the guest's view never carries the host's hand or the draw pile", () => {
    const host = new HostSession(A)
    const [a, b] = memoryPair()
    host.addGuest(a)
    const guest = new GuestSession(A, b)

    const full = host.getFull() // seat 0 = 'you' is the host's private hand
    const view = guest.getState() // guest is seat 1 = 'ai'

    // the guest sees its own real hand intact
    expect(view.hands.ai.map(c => c.id).sort()).toEqual(full.hands.ai.map(c => c.id).sort())
    // the host's hand is redacted to placeholders (count preserved)
    expect(view.hands.you).toHaveLength(full.hands.you.length)
    expect(view.hands.you.every(c => c.id === -1)).toBe(true)
    // the face-down draw pile is fully hidden (count preserved)
    expect(view.draw).toHaveLength(full.draw.length)
    expect(view.draw.every(c => c.id === -1)).toBe(true)

    // none of the host's private card ids appear anywhere in what crossed the wire
    const wire = JSON.stringify(view)
    for (const c of full.hands.you) expect(wire).not.toContain(`"id":${c.id}`)
    for (const c of full.draw) expect(wire).not.toContain(`"id":${c.id}`)

    // direct adapter round-trip: redactFor for seat 1 hides 'you', keeps 'ai'
    const red = A.redactFor!(full, 1)
    expect(red.hands.ai.map(c => c.id).sort()).toEqual(full.hands.ai.map(c => c.id).sort())
    expect(red.hands.you.every(c => c.id === -1)).toBe(true)
  })
})
