/* CARCASSONNE — netplay tests. Adapter round-trip (legal vs illegal/out-of-turn),
   a host+guest sync over an in-memory transport, and a leak test proving the hidden
   deck order never reaches a guest. Browser-free; the in-memory pair stands in for
   the real WebRTC path. */

import { describe, it, expect } from 'vitest'
import { carcassonneAdapter as A } from './net'
import { HostSession, GuestSession } from '../../net/session'
import { memoryPair } from '../../net/transport'
import * as CC from './logic'

describe('carcassonne net adapter', () => {
  it('round-trips a legal intent and rejects illegal / out-of-turn', () => {
    const s = A.makeGame()
    expect(A.seatToMove(s)).toBe(0)
    expect(A.isOver(s)).toBe(false)
    expect(A.numSeats(s)).toBe(2)
    expect(s.current).not.toBeNull()

    const places = CC.legalPlacements(s, s.current!)
    expect(places.length).toBeGreaterThan(0)
    const p = places[0]

    // out-of-turn: seat 1 cannot move on seat 0's turn -> same state (===)
    expect(A.applyIntent(s, 1, { x: p.x, y: p.y, rotation: p.rotation })).toBe(s)

    // illegal: a cell with no neighbour (far away) -> same state (===)
    expect(A.applyIntent(s, 0, { x: 99, y: 99, rotation: 0 })).toBe(s)

    // legal seat-0 placement -> state changes, tile consumed, turn passes to seat 1
    const ns = A.applyIntent(s, 0, { x: p.x, y: p.y, rotation: p.rotation })
    expect(ns).not.toBe(s)
    expect(ns.board[CC.key(p.x, p.y)]).toBeDefined()
    expect(A.seatToMove(ns)).toBe(1)
    expect(A.tickKey(ns)).not.toBe(A.tickKey(s))
  })

  it('forwards a meeple claim through the intent', () => {
    const s = A.makeGame()
    const places = CC.legalPlacements(s, s.current!)
    // find a placement whose tile exposes at least one claimable segment
    let placed = false
    for (const p of places) {
      const segs = s.current!.segments
      if (segs.length === 0) continue
      const seg = segs[0]
      const claimable = CC.isFeatureUnoccupied(
        { ...s, board: { ...s.board, [CC.key(p.x, p.y)]: { def: s.current!, rotation: p.rotation, meeples: {} } } },
        p.x, p.y, seg,
      )
      if (!claimable) continue
      const ns = A.applyIntent(s, 0, { x: p.x, y: p.y, rotation: p.rotation, meepleSegId: seg.id })
      if (ns === s) continue
      // a meeple was claimed: either it's still committed (count dropped) or the feature
      // completed immediately and returned it while scoring.
      const spent = ns.players[0].meeplesLeft < s.players[0].meeplesLeft
      const scored = ns.players[0].score > s.players[0].score
      expect(spent || scored).toBe(true)
      placed = true
      break
    }
    expect(placed).toBe(true)
  })
})

function connect() {
  const host = new HostSession(A)
  const [a, b] = memoryPair()
  host.addGuest(a)
  const guest = new GuestSession(A, b)
  return { host, guest }
}

describe('carcassonne host + guest over in-memory transport', () => {
  it('assigns the guest seat 1 and keeps the two in sync', () => {
    const { host, guest } = connect()
    expect(guest.ready()).toBe(true)
    expect(guest.mySeat()).toBe(1)
    expect(host.isMyTurn()).toBe(true)
    expect(guest.isMyTurn()).toBe(false)

    // host (seat 0) plays a legal placement
    const full = host.getFull()
    const p = CC.legalPlacements(full, full.current!)[0]
    host.dispatchLocal({ x: p.x, y: p.y, rotation: p.rotation })

    // turn passes to the guest and its view reflects the new tile
    expect(host.isMyTurn()).toBe(false)
    expect(guest.isMyTurn()).toBe(true)
    expect(guest.getState().board[CC.key(p.x, p.y)]).toBeDefined()

    // guest (seat 1) replies with a legal placement of the now-current tile
    const gv = guest.getState()
    const gp = CC.legalPlacements(gv, gv.current!)[0]
    guest.dispatch({ x: gp.x, y: gp.y, rotation: gp.rotation })

    // host's authoritative state advanced and turn is back to the host
    expect(host.getFull().board[CC.key(gp.x, gp.y)]).toBeDefined()
    expect(host.isMyTurn()).toBe(true)
  })

  it('never leaks the hidden deck order to a guest', () => {
    const { host, guest } = connect()
    const full = host.getFull()
    const view = guest.getState()

    // length is preserved so the "tiles left" counter still works...
    expect(view.deck.length).toBe(full.deck.length)
    expect(view.deck.length).toBeGreaterThan(0)
    // ...but every entry is the opaque placeholder, not a real tile.
    expect(view.deck.every(t => t.id === 'hidden')).toBe(true)

    // none of the real upcoming tile ids appear anywhere in what crossed the wire.
    const wire = JSON.stringify(view)
    for (const t of full.deck) {
      expect(wire).not.toContain(t.id)
    }
  })
})
