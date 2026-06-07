/* SUSHI GO! — netplay tests. Adapter round-trip (serialized simultaneous picks) + a real
 * host/guest integration over an in-memory transport, plus a hidden-info LEAK test proving
 * the guest's view never carries another seat's private hand OR their not-yet-revealed pick. */

import { describe, it, expect } from 'vitest'
import { sushiGoAdapter as A, type SushiGoIntent } from './net'
import * as SG from './logic'
import { HostSession, GuestSession } from '../../net/session'
import { memoryPair } from '../../net/transport'

/** A deterministic game (ordered deck) so every assertion is reproducible. */
function game() { return SG.makeGame(SG.buildDeck()) }

describe('sushi_go net adapter', () => {
  it('starts with seat 0 to move on a 3-seat game', () => {
    const s = game()
    expect(A.numSeats(s)).toBe(3)
    expect(A.seatToMove(s)).toBe(0)
    expect(A.isOver(s)).toBe(false)
  })

  it('walks seats that still owe a pick, then reveals when all have picked', () => {
    const s = game()
    // seat 0 picks -> the move passes to seat 1 (not a reveal yet)
    const s0 = A.applyIntent(s, 0, { kind: 'pick', cardId: s.hands[0][0].id })
    expect(s0).not.toBe(s)
    expect(s0.phase).toBe('draft')
    expect(s0.pending[0]).toBe(s.hands[0][0].id)
    expect(A.seatToMove(s0)).toBe(1)
    expect(A.tickKey(s0)).not.toBe(A.tickKey(s))

    // seat 1 picks -> passes to seat 2
    const s1 = A.applyIntent(s0, 1, { kind: 'pick', cardId: s0.hands[1][0].id })
    expect(A.seatToMove(s1)).toBe(2)

    // seat 2 picks -> the turn completes: reveal fires, hands rotate, pending resets
    const handLenBefore = s1.hands[0].length
    const s2 = A.applyIntent(s1, 2, { kind: 'pick', cardId: s1.hands[2][0].id })
    expect(s2.pending).toEqual([null, null, null])
    expect(s2.collected[0].length).toBe(1) // seat 0 kept its card
    expect(s2.hands[0].length).toBe(handLenBefore - 1) // a card was drafted out of the passed hand
    expect(A.seatToMove(s2)).toBe(0) // a fresh draft turn begins
  })

  it('ignores an out-of-turn intent (returns the same ref)', () => {
    const s = game()
    // it is seat 0's turn; seat 1 tries to pick
    expect(A.applyIntent(s, 1, { kind: 'pick', cardId: s.hands[1][0].id })).toBe(s)
  })

  it('ignores already-picked and illegal intents (returns the same ref)', () => {
    const s = game()
    const s0 = A.applyIntent(s, 0, { kind: 'pick', cardId: s.hands[0][0].id })
    // seat 0 already picked -> not its turn anymore
    expect(A.applyIntent(s0, 0, { kind: 'pick', cardId: s.hands[0][1].id })).toBe(s0)
    // a card id not in the active seat's hand -> illegal, unchanged
    expect(A.applyIntent(s, 0, { kind: 'pick', cardId: 99999 })).toBe(s)
    // a malformed intent -> unchanged
    expect(A.applyIntent(s, 0, { kind: 'nope' } as unknown as SushiGoIntent)).toBe(s)
  })
})

function connect() {
  const host = new HostSession(A)
  const [a, b] = memoryPair()
  host.addGuest(a)
  const guest = new GuestSession(A, b)
  return { host, guest }
}

describe('sushi_go host + guest over an in-memory transport', () => {
  it('assigns the guest seat 1 and syncs the initial view', () => {
    const { host, guest } = connect()
    expect(guest.ready()).toBe(true)
    expect(guest.mySeat()).toBe(1)
    expect(host.getSeats().map(s => s.kind)).toEqual(['host', 'guest', 'ai'])
  })

  it('relays the host pick, then a guest pick, staying in sync', () => {
    const { host, guest } = connect()
    // host (seat 0) picks first; turn moves to the guest (seat 1)
    host.dispatchLocal({ kind: 'pick', cardId: host.getFull().hands[0][0].id } as SushiGoIntent)
    expect(host.isMyTurn()).toBe(false)
    expect(guest.isMyTurn()).toBe(true)

    // guest (seat 1) replies; intent travels host-ward and applies. The guest can only see
    // its OWN hand, so it picks from the redacted view's seat-1 hand.
    const before = host.getFull().step
    guest.dispatch({ kind: 'pick', cardId: guest.getState().hands[1][0].id } as SushiGoIntent)
    expect(host.getFull().step).toBeGreaterThan(before)
    // seat 2 is an AI seat; the host's AI driver finishes that pick + reveal in real play,
    // but at minimum it's no longer the guest's turn.
    expect(guest.isMyTurn()).toBe(false)
    // guest's view tracks the host's authoritative step.
    expect(guest.getState().step).toBe(host.getFull().step)
  })

  it('rejects an out-of-turn guest intent (host stays authoritative)', () => {
    const { host, guest } = connect()
    const before = host.getFull().step
    // it is the host's (seat 0) turn, but the guest tries to pick
    guest.dispatch({ kind: 'pick', cardId: guest.getState().hands[1][0].id } as SushiGoIntent)
    expect(host.getFull().step).toBe(before) // nothing changed
  })
})

describe('sushi_go hidden-info redaction (leak test)', () => {
  it("the guest's view never carries another seat's hand or unrevealed pick", () => {
    const { host, guest } = connect()
    // Host (seat 0) picks but does NOT reveal yet: pending[0] is set and secret.
    host.dispatchLocal({ kind: 'pick', cardId: host.getFull().hands[0][0].id } as SushiGoIntent)
    const full = host.getFull()
    const view = guest.getState() // guest is seat 1

    // The guest sees its OWN real hand intact...
    expect(view.hands[1]).toEqual(full.hands[1])
    // ...but every other seat's hand is blanked to placeholders.
    expect(view.hands[0].every(c => c.id === -1)).toBe(true)
    expect(view.hands[2].every(c => c.id === -1)).toBe(true)
    expect(view.hands[0].length).toBe(full.hands[0].length) // shape preserved

    // The host's unrevealed pick id is hidden (masked to -1) but its "has picked" bit shows.
    expect(full.pending[0]).not.toBeNull()
    expect(view.pending[0]).toBe(-1)
    expect(view.pending[1]).toBeNull() // guest hasn't picked

    // Defence in depth: in the redacted regions (other seats' hands), EVERY card is the
    // -1 placeholder — so no other seat's real card id/kind survives there. (Card ids are
    // not globally unique across hands, so a blanket string scan would false-positive on
    // the guest's own legitimately-visible cards; the per-region checks above are the
    // correct guarantee.)
    expect(view.hands[0].some(c => c.id !== -1)).toBe(false)
    expect(view.hands[2].some(c => c.id !== -1)).toBe(false)
    // The host's _deck (full future card order) must never cross the wire.
    expect((view as unknown as { _deck?: unknown })._deck).toBeUndefined()
  })
})
