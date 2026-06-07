/* THE QUACKS OF QUEDLINBURG — netplay adapter. Maps the pure push-your-luck logic
 * onto the uniform GameAdapter so useGameSession can host/join it.
 *
 * HIDDEN INFO: each player draws chips from their OWN bag (host RNG) into their pot.
 * Chips already DRAWN this round are PUBLIC (they sit on the board). The bag's remaining
 * contents/order are HIDDEN — only the COUNT of undrawn chips is public. redactFor strips
 * the contents/order of every OTHER seat's bag/pool to opaque placeholder chips while
 * keeping the count, so a guest can render "N chips left" without learning what or in
 * which order. The acting seat keeps full sight of its own bag/pool.
 *
 * TURN MODEL: brewing is simultaneous in the tabletop game, but we serialize it. In the
 * draw phase seatToMove walks the lowest-indexed player who is still drawing; in the shop
 * phase it walks the lowest-indexed player who has not yet finished shopping. The host RNG
 * is the authority for every draw — guests just request {kind:'draw'}.
 *
 * INTENTS:
 *   { kind: 'draw' }            — draw one chip from your bag (host RNG)
 *   { kind: 'stop' }            — stop drawing this round and bank your pot
 *   { kind: 'buy', card }       — buy a shop ingredient into your bag (shop phase)
 *   { kind: 'endShop' }         — finish shopping for your seat (shop phase)
 *
 * applyIntent validates against the pure logic and returns the input state UNCHANGED for
 * any illegal / out-of-turn intent (never throws). tickKey changes on every action via the
 * monotonic s.step counter. */

import * as Q from './logic'
import type { QuacksState, PlayerState, Chip } from './logic'
import type { GameAdapter } from '../../net/protocol'

export type QuacksIntent =
  | { kind: 'draw' }
  | { kind: 'stop' }
  | { kind: 'buy'; card: string }
  | { kind: 'endShop' }

/** Track which seats have finished shopping this shop phase (host-side, not in logic). */
interface ShopMeta {
  /** Seats that have pressed "done shopping" this shop phase. */
  shopDone?: boolean[]
}
type NetState = QuacksState & ShopMeta

/** Lowest seat (0..n-1) still drawing this round, or null if all are done. */
function drawingSeat(s: QuacksState): number | null {
  for (let i = 0; i < s.players.length; i++) if (!s.players[i].done) return i
  return null
}

/** Lowest seat that has not yet finished shopping, or null if everyone is done. */
function shoppingSeat(s: NetState): number | null {
  const done = s.shopDone ?? []
  for (let i = 0; i < s.players.length; i++) if (!done[i]) return i
  return null
}

/**
 * Whose turn it is to act. In the draw phase: the lowest seat still drawing. When all are
 * done drawing the round still needs resolving — that is host bookkeeping done inside
 * applyIntent/aiStep, so seatToMove falls through to null there only transiently. In the
 * shop phase: the lowest seat still shopping. Null when the game is over.
 */
function seatToMove(s: NetState): number | null {
  if (s.winner != null || s.phase === 'over') return null
  if (s.phase === 'draw') return drawingSeat(s)
  if (s.phase === 'shop') return shoppingSeat(s)
  return null
}

/** Resolve the round once every player has finished drawing. No-op otherwise. */
function maybeResolve(s: NetState): NetState {
  if (s.phase !== 'draw') return s
  if (drawingSeat(s) != null) return s
  const out = Q.resolveRound(s) as NetState
  // Entering the shop: reset per-seat shopping completion.
  if (out.phase === 'shop') return { ...out, shopDone: out.players.map(() => false) }
  return out
}

/** Advance to the next round once every player has finished shopping. No-op otherwise. */
function maybeEndShop(s: NetState): NetState {
  if (s.phase !== 'shop') return s
  if (shoppingSeat(s) != null) return s
  const out = Q.endShop(s) as NetState
  const { shopDone: _drop, ...rest } = out
  return rest as NetState
}

export const quacksAdapter: GameAdapter<NetState, QuacksIntent> = {
  makeGame: () => Q.makeGame() as NetState,
  // Read the real player count off the state.
  numSeats: s => s.players.length,
  seatToMove,
  isOver: s => s.winner != null || s.phase === 'over',
  applyIntent: (s, seat, i) => {
    if (seatToMove(s) !== seat || !i) return s
    switch (i.kind) {
      case 'draw': {
        if (s.phase !== 'draw') return s
        const out = Q.drawChip(s, seat) as NetState
        if (out === s) return s // rejected (pool empty / already done)
        // Drawing may have exploded -> player now done -> maybe resolve the round.
        return maybeResolve(out)
      }
      case 'stop': {
        if (s.phase !== 'draw') return s
        const out = Q.stop(s, seat) as NetState
        if (out === s) return s
        return maybeResolve(out)
      }
      case 'buy': {
        if (s.phase !== 'shop' || typeof i.card !== 'string') return s
        const out = Q.buyChip(s, seat, i.card) as NetState
        // Carry the shopDone bookkeeping (buyChip spreads the whole state, but be explicit).
        return out === s ? s : { ...out, shopDone: s.shopDone }
      }
      case 'endShop': {
        if (s.phase !== 'shop') return s
        const done = (s.shopDone ?? s.players.map(() => false)).slice()
        done[seat] = true
        const marked: NetState = { ...s, shopDone: done, step: s.step + 1 }
        return maybeEndShop(marked)
      }
      default:
        return s
    }
  },
  // Reuse the existing AI. Q.aiTurn only acts for the AI (seat 1) in solo design, so for a
  // generic AI seat we replicate its policy by temporarily acting AS that seat. The pure
  // helpers (drawChip/stop/buyChip/endShop) take an explicit player index, so we drive the
  // same heuristics directly for whichever seat the host hands us.
  aiStep: (s, seat) => {
    if (s.winner != null) return s
    if (s.phase === 'draw') {
      const p = s.players[seat]
      if (p.done) return maybeResolve(s) // nothing to draw; settle if everyone's done
      if (aiShouldStop(p)) return maybeResolve(Q.stop(s, seat) as NetState)
      return maybeResolve(Q.drawChip(s, seat) as NetState)
    }
    if (s.phase === 'shop') {
      const p = s.players[seat]
      const cheapest = Math.min(...s.shop.map(it => it.cost))
      if (p.coins >= cheapest && p.bag.length < 18) {
        const pick = aiPick(s, seat)
        if (pick) {
          const out = Q.buyChip(s, seat, pick) as NetState
          if (out !== s) return { ...out, shopDone: s.shopDone }
        }
      }
      // Done shopping for this seat.
      const done = (s.shopDone ?? s.players.map(() => false)).slice()
      done[seat] = true
      const marked: NetState = { ...s, shopDone: done, step: s.step + 1 }
      return maybeEndShop(marked)
    }
    return s
  },
  // Changes on EVERY action via the monotonic step counter (plus round/phase for safety).
  tickKey: s => {
    const sd = (s.shopDone ?? []).map(b => (b ? 1 : 0)).join('')
    return `${s.step}-${s.round}-${s.phase}-${s.turn}-${sd}-${s.winner ?? ''}`
  },
  /**
   * Per-seat view: keep this seat's own bag/pool fully visible; replace every OTHER seat's
   * bag and pool with opaque placeholder chips (same COUNT, no real colors/values/ids and
   * no preserved order). Chips already DRAWN this round stay public for all seats — they
   * are on the board. The RNG seed is also hidden so a guest can't predict future draws.
   */
  redactFor: (s, seat) => {
    const players = s.players.map((p, i) =>
      i === seat ? p : redactPlayer(p),
    ) as [PlayerState, PlayerState]
    return { ...s, players, rng: 0 }
  },
}

/** An opaque chip that reveals nothing about a hidden bag/pool entry. */
function hiddenChip(): Chip {
  return { id: -1, color: 'white', value: 0 }
}

/** Strip the contents/order of a player's bag + draw pool, keeping only their counts. */
function redactPlayer(p: PlayerState): PlayerState {
  return {
    ...p,
    bag: p.bag.map(hiddenChip),
    pool: p.pool.map(hiddenChip),
    // p.drawn stays public (chips drawn this round sit on the board).
  }
}

// ---- AI policy mirrors of logic.ts's private heuristics (logic.ts only exposes aiTurn,
// which is hard-wired to seat 1; we reuse the same numbers for any AI seat). ----

function aiShouldStop(p: PlayerState): boolean {
  if (p.pool.length === 0) return true
  const risk = Q.nextDrawBustProb(p)
  if (risk <= 0) return false
  if (p.pos >= 20) return risk >= 0.18
  if (p.pos >= 12) return risk >= 0.30
  return risk >= 0.45
}

function aiPick(s: NetState, seat: number): string | null {
  const p = s.players[seat]
  const affordable = s.shop.filter(it => it.cost <= p.coins)
  if (affordable.length === 0) return null
  const ranked = affordable
    .map(it => {
      let worth = it.value
      if (it.color === 'green' || it.color === 'purple') worth += 1.2
      if (it.color === 'red') worth += 0.6
      if (it.color === 'white') worth -= 5
      return { it, eff: worth / it.cost }
    })
    .sort((a, b) => b.eff - a.eff)
  return ranked[0].it.id
}
