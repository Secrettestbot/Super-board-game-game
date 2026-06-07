/* HANAMIKOJI — netplay tests. Adapter round-trip + a real host/guest integration over an
   in-memory transport, plus a hidden-info LEAK test proving the guest's view never carries
   the opponent's hand, its face-down committed secret card, the draw deck, or the removed card. */

import { describe, it, expect } from 'vitest'
import { hanamikojiAdapter as A, type HanamikojiIntent } from './net'
import * as H from './logic'
import type { Geisha } from './logic'
import { HostSession, GuestSession } from '../../net/session'
import { memoryPair } from '../../net/transport'

/** A deterministic game from the ordered full deck [0,0,1,1,1,2,2,2,...]. */
function game() { return H.makeGame(H.fullDeck()) }

describe('hanamikoji net adapter', () => {
  it('starts with seat 0 to move on a 2-seat game', () => {
    const s = game()
    expect(A.numSeats(s)).toBe(2)
    expect(A.seatToMove(s)).toBe(0)
    expect(A.isOver(s)).toBe(false)
  })

  it('applies a legal secret action and passes the turn to seat 1', () => {
    const s = game()
    const card = s.hands[0][0]
    const s2 = A.applyIntent(s, 0, { kind: 'secret', card })
    expect(s2).not.toBe(s)
    expect(s2.used[0].secret).toBe(true)
    expect(s2.secret[0]).toBe(card)
    expect(A.seatToMove(s2)).toBe(1)
    expect(A.tickKey(s2)).not.toBe(A.tickKey(s))
  })

  it('ignores an out-of-turn intent (returns the same ref)', () => {
    const s = game()
    // seat 1 tries to act while it is seat 0's turn
    expect(A.applyIntent(s, 1, { kind: 'secret', card: s.hands[1][0] })).toBe(s)
  })

  it('ignores illegal intents (returns the same ref)', () => {
    const s = game()
    // a card not in seat 0's hand (-1 is never a real geisha)
    expect(A.applyIntent(s, 0, { kind: 'secret', card: -1 as Geisha })).toBe(s)
    // wrong card count for tradeoff/gift/competition
    expect(A.applyIntent(s, 0, { kind: 'tradeoff', cards: [s.hands[0][0]] })).toBe(s)
    expect(A.applyIntent(s, 0, { kind: 'gift', cards: [s.hands[0][0]] })).toBe(s)
    expect(A.applyIntent(s, 0, { kind: 'competition', pairs: [[s.hands[0][0], s.hands[0][1]]] })).toBe(s)
    // a choose intent with no pending choice
    expect(A.applyIntent(s, 0, { kind: 'choose', choiceIndex: 0 })).toBe(s)
    // a next intent while the round is live
    expect(A.applyIntent(s, 0, { kind: 'next' })).toBe(s)
  })

  it('routes a gift reveal to the chooser and resolves their choose intent', () => {
    const s = game()
    const cards = s.hands[0].slice(0, 3) as Geisha[]
    const s2 = A.applyIntent(s, 0, { kind: 'gift', cards })
    expect(s2.pending?.kind).toBe('gift')
    expect(A.seatToMove(s2)).toBe(1) // the chooser (opponent) must act
    // the giver (seat 0) cannot resolve their own gift
    expect(A.applyIntent(s2, 0, { kind: 'choose', choiceIndex: 0 })).toBe(s2)
    // the chooser takes option 0
    const s3 = A.applyIntent(s2, 1, { kind: 'choose', choiceIndex: 0 })
    expect(s3).not.toBe(s2)
    expect(s3.pending).toBeNull()
  })
})

function connect() {
  const host = new HostSession(A)
  const [a, b] = memoryPair()
  host.addGuest(a)
  const guest = new GuestSession(A, b)
  return { host, guest }
}

describe('hanamikoji host + guest over an in-memory transport', () => {
  it('assigns the guest seat 1 and syncs the initial view', () => {
    const { host, guest } = connect()
    expect(guest.ready()).toBe(true)
    expect(guest.mySeat()).toBe(1)
    expect(host.getSeats().map(s => s.kind)).toEqual(['host', 'guest'])
    expect(guest.getState().placed.length).toBe(2)
  })

  it('relays the host action, then a guest reply, staying in sync', () => {
    const { host, guest } = connect()
    // host (seat 0) acts first: hide a card with the secret marker
    const hCard = host.getFull().hands[0][0]
    host.dispatchLocal({ kind: 'secret', card: hCard } as HanamikojiIntent)
    expect(host.isMyTurn()).toBe(false)
    expect(guest.isMyTurn()).toBe(true)

    // guest (seat 1) replies; intent travels host-ward and applies
    const gCard = guest.getState().hands[1][0]
    guest.dispatch({ kind: 'secret', card: gCard } as HanamikojiIntent)
    expect(host.getFull().used[1].secret).toBe(true)
    expect(host.getFull().turn).toBe(0) // back to the host
    expect(host.isMyTurn()).toBe(true)
    // guest's view reflects the host's authoritative tick
    expect(A.tickKey(guest.getState())).toBe(A.tickKey(host.getFull()))
  })

  it('rejects an out-of-turn guest intent (host stays authoritative)', () => {
    const { host, guest } = connect()
    const before = A.tickKey(host.getFull())
    // it is the host's (seat 0) turn, but the guest tries to act
    const gCard = guest.getState().hands[1][0]
    guest.dispatch({ kind: 'secret', card: gCard } as HanamikojiIntent)
    expect(A.tickKey(host.getFull())).toBe(before) // nothing changed
  })
})

describe('hanamikoji hidden-info redaction (leak test)', () => {
  it("the guest never sees the opponent's hand, committed secret, deck, or removed card", () => {
    const { host, guest } = connect()

    // Host (seat 0) commits a SECRET card face-down — the guest must not learn it.
    const secretCard = host.getFull().hands[0][0]
    host.dispatchLocal({ kind: 'secret', card: secretCard } as HanamikojiIntent)

    const full = host.getFull()
    const view = guest.getState() // guest is seat 1

    // The guest sees its OWN real hand intact...
    expect(view.hands[1]).toEqual(full.hands[1])
    // ...but seat 0's hand is fully blanked to placeholders.
    expect(view.hands[0]).toEqual(full.hands[0].map(() => -1))
    // ...the opponent's face-down committed secret is hidden (-1), not its real value...
    expect(full.secret[0]).toBe(secretCard)
    expect(view.secret[0]).toBe(-1)
    // ...the viewing seat's own (still unused) secret slot is untouched (null)...
    expect(view.secret[1]).toBe(full.secret[1])
    // ...the face-down draw deck is fully blanked...
    expect(view.deck.every(c => c === -1)).toBe(true)
    expect(view.deck.length).toBe(full.deck.length)
    // ...and the set-aside removed card is hidden.
    expect(full.removed).not.toBeNull()
    expect(view.removed).toBe(-1)

    // The opponent's real secret value and hand must not survive anywhere on the wire view,
    // beyond what the guest legitimately knows. Reconstruct the secret region & assert it changed.
    expect(JSON.stringify(view.secret)).not.toBe(JSON.stringify(full.secret))
    expect(JSON.stringify(view.hands[0])).not.toBe(JSON.stringify(full.hands[0]))
  })

  it('a gift/competition reveal stays PUBLIC in the guest view (both players see it)', () => {
    const { host, guest } = connect()
    // host reveals 3 cards as a gift — these are public to the chooser.
    const cards = host.getFull().hands[0].slice(0, 3) as Geisha[]
    host.dispatchLocal({ kind: 'gift', cards } as HanamikojiIntent)
    const view = guest.getState()
    expect(view.pending?.kind).toBe('gift')
    // the revealed options are intact (not -1), so the chooser can decide
    expect(view.pending?.options.flat().every(g => g >= 0)).toBe(true)
    expect(view.pending?.options).toEqual(host.getFull().pending?.options)
  })
})
