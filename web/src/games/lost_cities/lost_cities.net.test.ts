/* LOST CITIES — netplay tests. Adapter round-trip (legal play+draw, illegal/out-of-turn
 * rejection) + a real host/guest integration over an in-memory transport, plus a hidden-info
 * LEAK test proving the guest's view never carries the other seat's private hand or the
 * face-down deck. */

import { describe, it, expect } from 'vitest'
import { lostCitiesAdapter as A } from './net'
import type { LostCitiesIntent } from './net'
import * as LC from './logic'
import type { LostCitiesState } from './logic'
import { HostSession, GuestSession } from '../../net/session'
import { memoryPair } from '../../net/transport'

describe('lost_cities net adapter', () => {
  it('starts with seat 0 to move on a 2-seat game', () => {
    const s = A.makeGame()
    expect(A.numSeats()).toBe(2)
    expect(A.seatToMove(s)).toBe(0)
    expect(A.isOver(s)).toBe(false)
  })

  it('round-trips a play then a draw, with the turn passing to seat 1', () => {
    const s = A.makeGame()
    const card = s.hands.you[0]
    // PLAY phase: lay the first card onto its (empty) expedition.
    const afterPlay = A.applyIntent(s, 0, { kind: 'play', cardId: card.id })
    expect(afterPlay).not.toBe(s)
    expect(afterPlay.phase).toBe('draw')
    expect(afterPlay.turn).toBe('you') // still seat 0 until they draw
    expect(afterPlay.expeditions.you[card.colour].some(c => c.id === card.id)).toBe(true)
    expect(A.tickKey(afterPlay)).not.toBe(A.tickKey(s))

    // DRAW phase: draw from the deck; the turn now passes to seat 1.
    const afterDraw = A.applyIntent(afterPlay, 0, { kind: 'draw', source: 'deck' })
    expect(afterDraw).not.toBe(afterPlay)
    expect(afterDraw.phase).toBe('play')
    expect(afterDraw.turn).toBe('ai')
    expect(A.seatToMove(afterDraw)).toBe(1)
    expect(afterDraw.hands.you.length).toBe(8) // played one, drew one
    expect(A.tickKey(afterDraw)).not.toBe(A.tickKey(afterPlay))
  })

  it('round-trips a discard then a draw from a discard pile', () => {
    const s = A.makeGame()
    const card = s.hands.you[0]
    const afterDiscard = A.applyIntent(s, 0, { kind: 'discard', cardId: card.id })
    expect(afterDiscard).not.toBe(s)
    expect(afterDiscard.phase).toBe('draw')
    expect(afterDiscard.discards[card.colour].some(c => c.id === card.id)).toBe(true)

    // Take that same card back from its discard pile.
    const afterDraw = A.applyIntent(afterDiscard, 0, { kind: 'draw', source: { discard: card.colour } })
    expect(afterDraw.turn).toBe('ai')
    expect(afterDraw.hands.you.some(c => c.id === card.id)).toBe(true)
  })

  it('ignores out-of-turn intents (returns the same ref)', () => {
    const s = A.makeGame()
    // seat 1 tries to play while it is seat 0's turn
    expect(A.applyIntent(s, 1, { kind: 'play', cardId: s.hands.ai[0].id })).toBe(s)
  })

  it('ignores illegal / wrong-phase intents (returns the same ref)', () => {
    const s = A.makeGame()
    // a card id not in this seat's hand
    expect(A.applyIntent(s, 0, { kind: 'play', cardId: 9999 })).toBe(s)
    // drawing during the play phase is wrong-phase
    expect(A.applyIntent(s, 0, { kind: 'draw', source: 'deck' })).toBe(s)
    // play a card to start the draw phase, then try to play again (wrong phase)
    const afterPlay = A.applyIntent(s, 0, { kind: 'play', cardId: s.hands.you[0].id })
    expect(A.applyIntent(afterPlay, 0, { kind: 'play', cardId: s.hands.you[1].id })).toBe(afterPlay)
    // drawing from an empty discard pile is illegal
    expect(A.applyIntent(afterPlay, 0, { kind: 'draw', source: { discard: 'Y' } })).toBe(afterPlay)
  })

  it('reports no seat to move once the game is over', () => {
    const over: LostCitiesState = { ...A.makeGame(), winner: 'you', turn: null }
    expect(A.isOver(over)).toBe(true)
    expect(A.seatToMove(over)).toBeNull()
    expect(A.applyIntent(over, 0, { kind: 'play', cardId: 0 })).toBe(over)
  })
})

function connect() {
  const host = new HostSession(A)
  const [a, b] = memoryPair()
  host.addGuest(a)
  const guest = new GuestSession(A, b)
  return { host, guest }
}

describe('lost_cities host + guest over an in-memory transport', () => {
  it('assigns the guest seat 1 and syncs the initial view', () => {
    const { host, guest } = connect()
    expect(guest.ready()).toBe(true)
    expect(guest.mySeat()).toBe(1)
    expect(host.getSeats().map(s => s.kind)).toEqual(['host', 'guest'])
    expect(guest.getState().discards.Y.length).toBe(0)
  })

  it('relays the host turn, then a guest reply, staying in sync', () => {
    const { host, guest } = connect()
    // host (seat 0 = 'you') plays then draws.
    const hCard = host.getFull().hands.you[0]
    host.dispatchLocal({ kind: 'play', cardId: hCard.id } as LostCitiesIntent)
    expect(host.getFull().phase).toBe('draw')
    host.dispatchLocal({ kind: 'draw', source: 'deck' } as LostCitiesIntent)
    expect(host.getFull().turn).toBe('ai')
    expect(host.isMyTurn()).toBe(false)
    expect(guest.isMyTurn()).toBe(true)

    // guest (seat 1 = 'ai') replies; intents travel host-ward and apply.
    const gCard = guest.getState().hands.ai[0]
    guest.dispatch({ kind: 'play', cardId: gCard.id } as LostCitiesIntent)
    expect(host.getFull().phase).toBe('draw')
    guest.dispatch({ kind: 'draw', source: 'deck' } as LostCitiesIntent)
    expect(host.getFull().turn).toBe('you') // back to the host
    expect(host.isMyTurn()).toBe(true)
    // guest's view reflects the host's authoritative state
    expect(guest.getState().deck.length).toBe(host.getFull().deck.length)
  })

  it('rejects an out-of-turn guest intent (host stays authoritative)', () => {
    const { host, guest } = connect()
    const before = A.tickKey(host.getFull())
    // it is the host's (seat 0) turn, but the guest tries to play.
    const gCard = guest.getState().hands.ai[0]
    guest.dispatch({ kind: 'play', cardId: gCard.id } as LostCitiesIntent)
    expect(A.tickKey(host.getFull())).toBe(before) // nothing changed
  })
})

describe('lost_cities hidden-info redaction (leak test)', () => {
  it("the guest's view never carries the other seat's hand or the face-down deck", () => {
    const { host, guest } = connect()
    const full = host.getFull()
    const view = guest.getState() // guest is seat 1 = 'ai'

    // The guest sees its OWN real hand intact...
    expect(view.hands.ai).toEqual(full.hands.ai)
    // ...but the host's hand is blanked to placeholders (count preserved).
    expect(view.hands.you.length).toBe(full.hands.you.length)
    expect(view.hands.you.every(c => c.id === -1 && c.value === -1)).toBe(true)
    // ...and the face-down deck is fully blanked (count preserved).
    expect(view.deck.length).toBe(full.deck.length)
    expect(view.deck.every(c => c.id === -1 && c.value === -1)).toBe(true)

    // None of the host's secret hand cards, nor any deck card, may appear (as a whole
    // serialized card object) anywhere in the wire view.
    const wire = JSON.stringify(view)
    for (const c of [...full.hands.you, ...full.deck]) {
      expect(wire).not.toContain(JSON.stringify(c))
    }

    // Discards are public face-up info and stay intact (start empty here).
    expect(view.discards).toEqual(full.discards)
  })

  it("the host's own view keeps its hand but still hides the deck", () => {
    const host = new HostSession(A)
    const view = host.getState() // host is seat 0 = 'you'
    expect(view.hands.you.every(c => c.id !== -1)).toBe(true)
    expect(view.hands.ai.every(c => c.id === -1)).toBe(true)
    expect(view.deck.every(c => c.id === -1)).toBe(true)
  })
})
