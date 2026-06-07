/* WATERGATE — netplay tests. (1) adapter round-trip: a legal play advances the game,
 * out-of-turn / illegal plays return the SAME state. (2) host + guest stay in sync over an
 * in-memory transport. (3) leak test: the guest's view never carries the host seat's hand
 * cards or either face-down deck's secret card ids. */

import { describe, it, expect } from 'vitest'
import { watergateAdapter as A, type WatergateIntent } from './net'
import { HostSession, GuestSession } from '../../net/session'
import { memoryPair } from '../../net/transport'
import * as W from './logic'

describe('watergate net adapter', () => {
  it('round-trips a legal intent and rejects illegal / out-of-turn', () => {
    const s = A.makeGame(/* no deck — random hands are fine for shape checks */)
    expect(A.seatToMove(s)).toBe(W.EDITOR) // Editor (seat 0) moves first

    // a legal Editor value play (let the logic pick the default token) -> state changes
    const card = s.hands[W.EDITOR][0]
    const next = A.applyIntent(s, W.EDITOR, { kind: 'play', cardId: card.id, useFor: 'value' })
    expect(next).not.toBe(s)
    expect(next.hands[W.EDITOR].some(c => c.id === card.id)).toBe(false) // card spent

    // out-of-turn: Nixon (seat 1) tries to play while it is the Editor's turn -> unchanged
    const nixonCard = s.hands[W.NIXON][0]
    expect(A.applyIntent(s, W.NIXON, { kind: 'play', cardId: nixonCard.id, useFor: 'value' })).toBe(s)

    // illegal: a card id that is not in the Editor's hand -> unchanged
    expect(A.applyIntent(s, W.EDITOR, { kind: 'play', cardId: 999999, useFor: 'value' })).toBe(s)

    // illegal: value play targeting a token the Editor may not move (the momentum token) -> unchanged
    expect(
      A.applyIntent(s, W.EDITOR, { kind: 'play', cardId: card.id, useFor: 'value', tokens: [{ id: 'M', amount: card.value }] }),
    ).toBe(s)
  })

  it('host + guest stay in sync over an in-memory transport', () => {
    const host = new HostSession(A)
    const [a, b] = memoryPair()
    host.addGuest(a)
    const guest = new GuestSession(A, b)

    expect(guest.mySeat()).toBe(1) // host is seat 0 (Editor), guest gets seat 1 (Nixon)
    expect(host.isMyTurn()).toBe(true)
    expect(guest.isMyTurn()).toBe(false)

    // host (Editor, seat 0) plays a legal value card
    const eCard = host.getFull().hands[W.EDITOR][0]
    host.dispatchLocal({ kind: 'play', cardId: eCard.id, useFor: 'value' })

    expect(host.isMyTurn()).toBe(false)
    expect(guest.isMyTurn()).toBe(true) // now Nixon's (guest's) turn, view synced
    expect(host.getFull().turn).toBe(W.NIXON)

    // guest (Nixon, seat 1) replies with one of ITS visible hand cards
    const nCard = guest.getState().hands[W.NIXON][0]
    guest.dispatch({ kind: 'play', cardId: nCard.id, useFor: 'value' })

    // host applied the guest's intent: that card is gone from Nixon's authoritative hand
    expect(host.getFull().hands[W.NIXON].some(c => c.id === nCard.id)).toBe(false)
  })

  it('rejects a guest intent that is out of turn (host stays authoritative)', () => {
    const host = new HostSession(A)
    const [a, b] = memoryPair()
    host.addGuest(a)
    const guest = new GuestSession(A, b)

    // it is the Editor's (host) turn; the guest (Nixon) tries to move anyway
    const before = JSON.stringify(host.getFull().tokens)
    const nCard = guest.getState().hands[W.NIXON][0]
    guest.dispatch({ kind: 'play', cardId: nCard.id, useFor: 'value' })
    expect(JSON.stringify(host.getFull().tokens)).toBe(before) // nothing changed
    expect(host.getFull().turn).toBe(W.EDITOR)
  })

  it('leak test: the guest never sees the host hand or either face-down deck', () => {
    // distinct per-player decks (Editor ids 0..17, Nixon ids 2000..2017) so a redacted
    // Editor card id can never coincide with a still-visible Nixon hand id.
    const full = A.makeGame()
    // build the guest's (seat 1 = Nixon) view directly
    const view = A.redactFor!(full, W.NIXON)

    // the guest keeps its OWN real hand...
    expect(view.hands[W.NIXON]).toEqual(full.hands[W.NIXON])
    // ...but the Editor's hand is blanked (counts preserved, real cards gone)
    expect(view.hands[W.EDITOR].length).toBe(full.hands[W.EDITOR].length)
    expect(view.hands[W.EDITOR].every(c => c.id === -1)).toBe(true)
    // both face-down decks are blanked, counts preserved
    expect(view.decks[W.EDITOR].length).toBe(full.decks[W.EDITOR].length)
    expect(view.decks[W.NIXON].length).toBe(full.decks[W.NIXON].length)
    expect(view.decks[W.EDITOR].every(c => c.id === -1)).toBe(true)
    expect(view.decks[W.NIXON].every(c => c.id === -1)).toBe(true)

    // none of the Editor's secret card ids (nor the Editor's deck ids, nor Nixon's deck ids)
    // may appear anywhere in the serialized view.
    const wire = JSON.stringify(view)
    const secretIds = [
      ...full.hands[W.EDITOR].map(c => c.id),
      ...full.decks[W.EDITOR].map(c => c.id),
      ...full.decks[W.NIXON].map(c => c.id),
    ]
    for (const id of secretIds) {
      // skip the placeholder id itself; assert the real secret id is absent. The id is
      // always serialized as `"id":<n>,` (followed by "value"), so match the trailing
      // comma to avoid prefix collisions (e.g. secret 2 vs visible 2002).
      if (id === -1) continue
      expect(wire).not.toContain(`"id":${id},`)
    }

    // round-trip the same redaction over the real transport and re-assert no host hand leaks
    const host = new HostSession(A)
    const [a, b] = memoryPair()
    host.addGuest(a)
    const guest = new GuestSession(A, b)
    const gView = guest.getState()
    expect(gView.hands[W.EDITOR].every(c => c.id === -1)).toBe(true)
    expect(gView.decks[W.EDITOR].every(c => c.id === -1)).toBe(true)
  })
})
