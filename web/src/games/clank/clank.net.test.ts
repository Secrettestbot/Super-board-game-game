/* CLANK! — netplay tests. Three parts per PORTING.md:
 *   1. adapter round-trip: a legal kinded intent advances state; illegal / out-of-turn
 *      intents return the input state unchanged (===).
 *   2. host + guest stay in sync over an in-memory transport (the headless proof of the
 *      online path), including a multi-action turn ending with 'end'.
 *   3. leak test: the guest's view never carries the host's private hand / draw deck card
 *      keys, and the face-down market deck is blanked too. */

import { describe, it, expect } from 'vitest'
import { clankAdapter as A, type ClankIntent } from './net'
import { HostSession, GuestSession } from '../../net/session'
import { memoryPair } from '../../net/transport'
import * as CK from './logic'

describe('clank net adapter', () => {
  it('reports seats and the seat to move', () => {
    const s = A.makeGame()
    expect(A.numSeats(s)).toBe(2)
    expect(A.seatToMove(s)).toBe(0)
    expect(A.isOver(s)).toBe(false)
  })

  it('round-trips a legal play intent and rejects illegal / out-of-turn', () => {
    const s = A.makeGame(7)
    const handCard = s.players[0].hand[0]
    expect(handCard).toBeTruthy()

    // legal: seat 0 plays a card from its own hand -> the card leaves the hand and is
    // recorded as played (clank's logic mutates + returns the same object, which is fine
    // for the host since it commits whatever applyIntent returns).
    const after = A.applyIntent(s, 0, { kind: 'play', cardId: handCard.id })
    expect(after.players[0].hand.some(c => c.id === handCard.id)).toBe(false)
    expect(after.players[0].played.some(c => c.id === handCard.id)).toBe(true)

    // For the illegal / out-of-turn cases the input state must come back UNCHANGED
    // (===), never throwing — verified on a fresh game so the legal play above can't
    // have mutated it.
    const fresh = A.makeGame(7)
    const card0 = fresh.players[0].hand[0]

    // out of turn: seat 1 tries to act on seat 0's turn
    expect(A.applyIntent(fresh, 1, { kind: 'play', cardId: card0.id })).toBe(fresh)
    // illegal: a card id not in hand
    expect(A.applyIntent(fresh, 0, { kind: 'play', cardId: 999999 })).toBe(fresh)
    // illegal: buying an empty / out-of-range market slot
    expect(A.applyIntent(fresh, 0, { kind: 'buy', marketIndex: 99 })).toBe(fresh)
    // illegal: moving to a non-adjacent / unaffordable room
    expect(A.applyIntent(fresh, 0, { kind: 'move', room: CK.DEEPEST })).toBe(fresh)
    // illegal: grabbing where there is no artifact (start room)
    expect(A.applyIntent(fresh, 0, { kind: 'grab' })).toBe(fresh)
  })

  it('tickKey changes on every action', () => {
    const s = A.makeGame(7)
    const before = A.tickKey(s)
    const after = A.applyIntent(s, 0, { kind: 'play', cardId: s.players[0].hand[0].id })
    expect(A.tickKey(after)).not.toBe(before)
  })

  it('host + guest stay in sync over an in-memory transport', () => {
    const host = new HostSession(A)
    const [a, b] = memoryPair(); host.addGuest(a)
    const guest = new GuestSession(A, b)

    expect(guest.mySeat()).toBe(1)
    expect(host.isMyTurn()).toBe(true)   // host is seat 0, moves first
    expect(guest.isMyTurn()).toBe(false)

    // host plays its whole hand, then ends the turn (a multi-action clank turn)
    let hand = host.getFull().players[0].hand.slice()
    for (const c of hand) host.dispatchLocal({ kind: 'play', cardId: c.id })
    expect(host.getFull().players[0].hand.length).toBe(0)
    host.dispatchLocal({ kind: 'end' })

    // turn passes to the guest (seat 1); the guest's view reflects it
    expect(host.isMyTurn()).toBe(false)
    expect(guest.isMyTurn()).toBe(true)
    expect(guest.getState().turn).toBe(1)
    expect(guest.getState().actions).toBe(host.getFull().actions)

    // guest replies: plays its hand + ends -> host advances and turn comes back to seat 0
    hand = guest.getState().players[1].hand.slice()
    for (const c of hand) guest.dispatch({ kind: 'play', cardId: c.id })
    guest.dispatch({ kind: 'end' })
    expect(host.getFull().turn).toBe(0)
    expect(host.isMyTurn()).toBe(true)
  })

  it('an out-of-turn guest intent is ignored (host is authoritative)', () => {
    const host = new HostSession(A)
    const [a, b] = memoryPair(); host.addGuest(a)
    const guest = new GuestSession(A, b)
    const before = host.getFull().actions
    // it is seat 0's (host) turn, but the guest tries to play
    const c = guest.getState().players[1].hand[0]
    if (c) guest.dispatch({ kind: 'play', cardId: c.id })
    expect(host.getFull().actions).toBe(before) // rejected, nothing changed
  })
})

describe('clank hidden-info redaction', () => {
  it("the guest's view never leaks the host's hand or draw-deck order", () => {
    const host = new HostSession(A)
    const [a, b] = memoryPair(); host.addGuest(a)
    const guest = new GuestSession(A, b)

    const full = host.getFull()
    const view = guest.getState()

    // The viewing seat (1) keeps its OWN real hand + deck.
    expect(view.players[1].hand.map(c => c.key)).toEqual(full.players[1].hand.map(c => c.key))
    expect(view.players[1].deck.map(c => c.key)).toEqual(full.players[1].deck.map(c => c.key))

    // The OTHER seat's hand + deck are face-down placeholders, counts preserved.
    expect(view.players[0].hand.length).toBe(full.players[0].hand.length)
    expect(view.players[0].deck.length).toBe(full.players[0].deck.length)
    expect(view.players[0].hand.every(c => c.key === '?' && c.id === -1)).toBe(true)
    expect(view.players[0].deck.every(c => c.key === '?' && c.id === -1)).toBe(true)

    // The face-down market deck is blanked; the face-up market row stays public.
    expect(view.marketDeck.length).toBe(full.marketDeck.length)
    expect(view.marketDeck.every(c => c.key === '?')).toBe(true)
    expect(view.market.map(c => c?.key ?? null)).toEqual(full.market.map(c => c?.key ?? null))

    // None of the host's secret card instances (hand + draw deck + market deck) may
    // appear anywhere in the serialized view that crossed the wire. Match the full card
    // token (`"id":N,"key":`) so neither a longer id (11 vs 1) nor a room sharing the
    // numeric id can false-positive.
    const json = JSON.stringify(view)
    for (const c of [...full.players[0].hand, ...full.players[0].deck, ...full.marketDeck]) {
      expect(json).not.toContain(`"id":${c.id},"key":`)
    }
  })
})
