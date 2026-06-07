/* THE ISLE OF CATS — netplay tests. Adapter round-trip + a real host/guest integration over an
 * in-memory transport, plus a hidden-info LEAK test proving the guest's view never carries the
 * identities/order of the face-down draw bag (only its count). */

import { describe, it, expect } from 'vitest'
import { isleOfCatsAdapter as A, type IsleOfCatsIntent } from './net'
import * as G from './logic'
import { HostSession, GuestSession } from '../../net/session'
import { memoryPair } from '../../net/transport'

/** A deterministic game so every assertion is reproducible. */
function game() { return G.makeGame(G.makeBag(42)) }

/** First legal (tileId, cells) for the seat to move, drafting from the shared market. */
function firstMove(s: G.State, player: G.Player): IsleOfCatsIntent {
  for (const tile of s.market) {
    const pls = G.legalPlacements(s.boats[player], tile.shape)
    if (pls.length > 0) return { tileId: tile.id, cells: pls[0].cells }
  }
  throw new Error('no legal move available in deterministic fixture')
}

describe('isle of cats net adapter', () => {
  it('starts with seat 0 to move on a 2-seat game', () => {
    const s = game()
    expect(A.numSeats(s)).toBe(2)
    expect(A.seatToMove(s)).toBe(0)
    expect(A.isOver(s)).toBe(false)
  })

  it('applies a legal draft+placement and passes the turn to seat 1', () => {
    const s = game()
    const mv = firstMove(s, 0)
    const s2 = A.applyIntent(s, 0, mv)
    expect(s2).not.toBe(s)
    expect(s2.turn).toBe(1)
    expect(A.seatToMove(s2)).toBe(1)
    // the drafted tile left the market and the cat covered the boat cells
    expect(s2.market.find(t => t.id === mv.tileId)).toBeUndefined()
    for (const idx of mv.cells) expect(s2.boats[0][idx].cat).not.toBe(-1)
    // tickKey changed (market shrank / log grew / turn flipped)
    expect(A.tickKey(s2)).not.toBe(A.tickKey(s))
  })

  it('ignores an out-of-turn intent (returns the same ref)', () => {
    const s = game()
    const mv = firstMove(s, 1)
    // seat 1 tries to act while it is seat 0's turn
    expect(A.applyIntent(s, 1, mv)).toBe(s)
  })

  it('ignores illegal intents (returns the same ref)', () => {
    const s = game()
    // a tile id that is not in the market
    expect(A.applyIntent(s, 0, { tileId: 99999, cells: [7, 8] })).toBe(s)
    // a real market tile but with cells that do not form an orientation of its shape
    const t = s.market[0]
    expect(A.applyIntent(s, 0, { tileId: t.id, cells: [0, 35] })).toBe(s)
    // basket cell (0,0) is index 0 — never placeable
    expect(A.applyIntent(s, 0, { tileId: t.id, cells: [0] })).toBe(s)
  })
})

function connect() {
  const host = new HostSession(A)
  const [a, b] = memoryPair()
  host.addGuest(a)
  const guest = new GuestSession(A, b)
  return { host, guest }
}

describe('isle of cats host + guest over an in-memory transport', () => {
  it('assigns the guest seat 1 and syncs the initial view', () => {
    const { host, guest } = connect()
    expect(guest.ready()).toBe(true)
    expect(guest.mySeat()).toBe(1)
    expect(host.getSeats().map(s => s.kind)).toEqual(['host', 'guest'])
    expect(guest.getState().market.length).toBe(G.MARKET_SIZE)
  })

  it('relays the host move, then a guest reply, staying in sync', () => {
    const { host, guest } = connect()
    // host (seat 0) drafts+places first
    host.dispatchLocal(firstMove(host.getFull(), 0))
    expect(host.isMyTurn()).toBe(false)
    expect(guest.isMyTurn()).toBe(true)

    // guest (seat 1) replies; intent travels host-ward and applies
    const before = host.getFull().log.length
    guest.dispatch(firstMove(guest.getState(), 1))
    expect(host.getFull().log.length).toBe(before + 1)
    expect(host.getFull().turn).toBe(0) // back to the host
    expect(host.isMyTurn()).toBe(true)
    // guest's view reflects the host's authoritative state
    expect(guest.getState().log.length).toBe(host.getFull().log.length)
    expect(guest.getState().market.length).toBe(host.getFull().market.length)
  })

  it('rejects an out-of-turn guest intent (host stays authoritative)', () => {
    const { host, guest } = connect()
    const before = host.getFull().log.length
    // it is the host's (seat 0) turn, but the guest tries to place
    guest.dispatch(firstMove(guest.getState(), 1))
    expect(host.getFull().log.length).toBe(before) // nothing changed
  })
})

describe('isle of cats hidden-info redaction (leak test)', () => {
  it("the guest's view never carries the face-down bag's identities, only its count", () => {
    const { host, guest } = connect()
    const full = host.getFull()
    const view = guest.getState() // guest is seat 1

    // Count is preserved so the UI can show how many tiles remain.
    expect(view.bag.length).toBe(full.bag.length)
    // Every bag tile is blanked to a neutral placeholder.
    expect(view.bag.every(t => t.id === -1 && t.color === -1 && t.shape.length === 0)).toBe(true)

    // The public market and both boats are unchanged (face-up / public info).
    expect(view.market).toEqual(full.market)
    expect(view.boats).toEqual(full.boats)

    // None of the real bag tiles' ids may appear anywhere in the wire view.
    const wire = JSON.stringify(view)
    for (const tile of full.bag) {
      // ids in this deterministic bag are >= MARKET_SIZE (the first few went to the market),
      // so check a tile that is genuinely still hidden.
      expect(wire).not.toContain(`"id":${tile.id},"color":${tile.color}`)
    }
  })
})
