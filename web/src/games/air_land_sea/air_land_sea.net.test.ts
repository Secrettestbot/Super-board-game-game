/* AIR, LAND & SEA — netplay tests. Adapter round-trip (legal deploy + out-of-turn/illegal
 * rejection), a real host/guest integration over an in-memory transport, and a hidden-info
 * LEAK test proving the guest's view never carries the other seat's private hand cards or the
 * face-down deck. The leak test checks the redacted regions STRUCTURALLY (counts preserved,
 * every masked entry is the placeholder) — it does NOT substring-scan the serialized view for
 * a card id, because card ids are not globally unique (they repeat every battle's deck). */

import { describe, it, expect } from 'vitest'
import { airLandSeaAdapter as A, type AirLandSeaIntent } from './net'
import * as ALS from './logic'
import type { State, Card } from './logic'
import { HostSession, GuestSession } from '../../net/session'
import { memoryPair } from '../../net/transport'

/** A deterministic game: buildDeck() order => seat 0's hand = the 6 AIR cards (values 1..6),
 *  seat 1's hand = the 6 LAND cards, the leftover deck = the 6 SEA cards. */
function game(): State { return ALS.makeGame(ALS.buildDeck()) }
const HIDDEN: Card = { id: -1, theater: 'air', value: -1, ability: 'none', name: '' }

describe('air land sea net adapter', () => {
  it('starts with seat 0 to move on a 2-seat game', () => {
    const s = game()
    expect(A.numSeats(s)).toBe(2)
    expect(A.seatToMove(s)).toBe(0)
    expect(A.isOver(s)).toBe(false)
  })

  it('round-trips a legal deploy and passes the turn to seat 1', () => {
    const s = game()
    const air3 = s.hands[0].find(c => c.theater === 'air' && c.value === 3)!
    const s2 = A.applyIntent(s, 0, { kind: 'deploy', cardId: air3.id, theater: 0, faceDown: false })
    expect(s2).not.toBe(s)
    expect(s2.turn).toBe(1)
    expect(A.seatToMove(s2)).toBe(1)
    // the card left the hand and sits face-up in AIR (theater 0)
    expect(s2.hands[0].some(c => c.id === air3.id)).toBe(false)
    expect(s2.theaters[0][0].length).toBe(1)
    expect(s2.theaters[0][0][0].faceDown).toBe(false)
    // tickKey changed
    expect(A.tickKey(s2)).not.toBe(A.tickKey(s))
  })

  it('rejects an out-of-turn intent (returns the same ref)', () => {
    const s = game()
    const land3 = s.hands[1].find(c => c.theater === 'land' && c.value === 3)!
    // seat 1 tries to act while it is seat 0's turn
    expect(A.applyIntent(s, 1, { kind: 'deploy', cardId: land3.id, theater: 1, faceDown: false })).toBe(s)
  })

  it('rejects illegal intents (returns the same ref)', () => {
    const s = game()
    const air3 = s.hands[0].find(c => c.theater === 'air' && c.value === 3)!
    // a face-up AIR card may NOT go to LAND (theater 1)
    expect(A.applyIntent(s, 0, { kind: 'deploy', cardId: air3.id, theater: 1, faceDown: false })).toBe(s)
    // a card not in this seat's hand (seat 1's land card)
    const land3 = s.hands[1].find(c => c.theater === 'land' && c.value === 3)!
    expect(A.applyIntent(s, 0, { kind: 'deploy', cardId: land3.id, theater: 1, faceDown: false })).toBe(s)
    // a 'next' intent is illegal mid-battle
    expect(A.applyIntent(s, 0, { kind: 'next' })).toBe(s)
  })

  it('only the host (seat 0) may advance between battles', () => {
    // Build a battle-over state: seat 0 withdraws immediately.
    let s = game()
    s = ALS.withdraw(s, 0)
    expect(s.phase).toBe('battleOver')
    expect(s.winner).toBeNull()
    expect(A.seatToMove(s)).toBe(0) // host owes the advance
    // a guest (seat 1) cannot advance
    expect(A.applyIntent(s, 1, { kind: 'next' })).toBe(s)
    // the host advances to a fresh battle
    const s2 = A.applyIntent(s, 0, { kind: 'next' })
    expect(s2).not.toBe(s)
    expect(s2.phase).toBe('battle')
    expect(s2.battleNo).toBe(s.battleNo + 1)
  })
})

function connect() {
  const host = new HostSession(A)
  const [a, b] = memoryPair()
  host.addGuest(a)
  const guest = new GuestSession(A, b)
  return { host, guest }
}

describe('air land sea host + guest over an in-memory transport', () => {
  it('assigns the guest seat 1 and syncs the initial view', () => {
    const { host, guest } = connect()
    expect(guest.ready()).toBe(true)
    expect(guest.mySeat()).toBe(1)
    expect(host.getSeats().map(s => s.kind)).toEqual(['host', 'guest'])
    expect(guest.getState().theaters.length).toBe(3)
  })

  it('relays the host move, then a guest reply, staying in sync', () => {
    const { host, guest } = connect()
    // host (seat 0) deploys first — pick any legal play from its real hand
    const h0 = ALS.legalPlays(host.getFull(), 0)[0]
    host.dispatchLocal({ kind: 'deploy', cardId: h0.card.id, theater: h0.theater, faceDown: h0.faceDown })
    expect(host.isMyTurn()).toBe(false)
    expect(guest.isMyTurn()).toBe(true)

    // guest (seat 1) replies; intent travels host-ward and applies
    const before = host.getFull().tick
    const g0 = ALS.legalPlays(guest.getState(), 1)[0]
    guest.dispatch({ kind: 'deploy', cardId: g0.card.id, theater: g0.theater, faceDown: g0.faceDown })
    expect(host.getFull().tick).toBe(before + 1)
    expect(host.getFull().turn).toBe(0) // back to the host
    expect(host.isMyTurn()).toBe(true)
    expect(guest.getState().tick).toBe(host.getFull().tick)
  })

  it('rejects an out-of-turn guest intent (host stays authoritative)', () => {
    const { host, guest } = connect()
    const before = host.getFull().tick
    // it is the host's (seat 0) turn, but the guest tries to deploy a card from its own hand
    const card = guest.getState().hands[1][0]
    guest.dispatch({ kind: 'deploy', cardId: card.id, theater: 1, faceDown: true } as AirLandSeaIntent)
    expect(host.getFull().tick).toBe(before) // nothing changed
  })
})

describe('air land sea hidden-info redaction (leak test)', () => {
  it("the guest's view masks the other seat's hand and the deck (structurally)", () => {
    const { host, guest } = connect()
    const full = host.getFull()
    const view = guest.getState() // guest is seat 1

    // The guest sees its OWN real hand intact.
    expect(view.hands[1]).toEqual(full.hands[1])

    // Seat 0's hand is masked: SAME COUNT, every entry is the placeholder (id -1, value -1),
    // and NONE of the real cards survive. We compare the redacted region structurally rather
    // than substring-scanning the whole view (ids repeat each battle, so a scan false-positives
    // on the viewer's own cards).
    expect(view.hands[0].length).toBe(full.hands[0].length)
    expect(view.hands[0]).toEqual(full.hands[0].map(() => HIDDEN))
    expect(view.hands[0].every(c => c.id === -1 && c.value === -1 && c.name === '')).toBe(true)
    // no real seat-0 card id appears in the masked region
    const realIds0 = new Set(full.hands[0].map(c => c.id))
    expect(view.hands[0].some(c => realIds0.has(c.id))).toBe(false)

    // The face-down deck is fully masked but keeps its public count.
    expect(view.deck.length).toBe(full.deck.length)
    expect(view.deck.every(c => c.id === -1 && c.value === -1)).toBe(true)

    // The board, VP and turn are public and untouched.
    expect(view.theaters).toEqual(full.theaters)
    expect(view.vp).toEqual(full.vp)
    expect(view.turn).toBe(full.turn)
  })

  it('redactFor leaves the viewing seat its own cards and is a no-op on public fields', () => {
    const s = game()
    const v0 = A.redactFor!(s, 0)
    // seat 0 keeps its hand, seat 1's hand is masked
    expect(v0.hands[0]).toEqual(s.hands[0])
    expect(v0.hands[1]).toEqual(s.hands[1].map(() => HIDDEN))
    const v1 = A.redactFor!(s, 1)
    expect(v1.hands[1]).toEqual(s.hands[1])
    expect(v1.hands[0]).toEqual(s.hands[0].map(() => HIDDEN))
  })
})
