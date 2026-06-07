/* POWER GRID — netplay adapter. Maps the multi-phase economic engine onto the uniform
 * GameAdapter so useGameSession can host/join it.
 *
 * Hidden information:
 *   - Each player's MONEY (cash on hand) is SECRET. redactFor blanks every other seat's
 *     `money` to -1 while preserving the viewer's own.
 *   - The face-DOWN plant DECK order is secret. redactFor replaces each deck plant with an
 *     anonymous face-down stand-in (id -1, cost 0) preserving only its LENGTH so the UI can
 *     still show "deck exhausted" / remaining count.
 * Everything else is PUBLIC: the face-up plant market, the resource market/supply, each
 * player's owned plants, fuel stocks, city network, powered count, the log.
 *
 * Seats map directly to player ids: seat 0 = you, seat 1 = the rival utility. numSeats
 * reads the real player count off the state so 3+ players would report correctly.
 *
 * Turn structure: every round runs auction -> resources -> build -> bureau, and within a
 * phase a single seat may take SEVERAL consecutive sub-steps (buy a plant, buy each fuel
 * batch, build each city, then end the phase). seatToMove returns whoever must act now;
 * the session re-arms the AI after each step because tickKey changes on every transition. */

import * as PG from './logic'
import type { State, Plant, ResourceId } from './logic'
import type { GameAdapter } from '../../net/protocol'

/** A move reduced to the wire essentials, kinded per phase. Plant buys carry the plant id
 * (not a market index) so they survive any redaction/reorder; the host resolves to index. */
export type PowerGridIntent =
  | { kind: 'buyPlant'; plantId: number }
  | { kind: 'passAuction' }
  | { kind: 'buyResource'; res: ResourceId; qty: number }
  | { kind: 'endResources' }
  | { kind: 'buildCity'; cityId: string }
  | { kind: 'endBuild' }
  | { kind: 'power'; plantIds: number[] }

/** Seat whose turn it is: the current actor while the game is live; null when over. */
function seatToMove(s: State): number | null {
  return s.winner != null || s.phase === 'over' ? null : s.turn
}

/** An anonymous face-down stand-in for a deck plant: keeps it JSON-serializable and shaped
 * like a Plant, but carries no cost/fuel/capacity identity or ordering information. */
function hiddenPlant(): Plant {
  return { id: -1, cost: 0, fuel: 'wind', burn: 0, capacity: 0 }
}

export const powerGridAdapter: GameAdapter<State, PowerGridIntent> = {
  makeGame: () => PG.makeGame(),
  numSeats: s => s.players.length,
  seatToMove,
  isOver: s => s.winner != null || s.phase === 'over',

  applyIntent: (s, seat, intent) => {
    if (s.winner != null || s.phase === 'over') return s
    if (s.turn !== seat) return s

    switch (intent.kind) {
      case 'buyPlant': {
        if (s.phase !== 'auction') return s
        // Resolve the plant id to its current market index; never trust a raw index.
        const idx = s.market.findIndex(p => p.id === intent.plantId)
        if (idx < 0) return s
        if (!PG.canBuyPlant(s, seat, idx)) return s
        return PG.buyPlant(s, seat, idx)
      }
      case 'passAuction':
        if (s.phase !== 'auction') return s
        return PG.passAuction(s, seat)
      case 'buyResource':
        if (s.phase !== 'resources') return s
        if (!PG.canBuyResource(s, seat, intent.res, intent.qty)) return s
        return PG.buyResource(s, seat, intent.res, intent.qty)
      case 'endResources':
        if (s.phase !== 'resources') return s
        return PG.endResources(s, seat)
      case 'buildCity':
        if (s.phase !== 'build') return s
        if (!PG.canBuildCity(s, seat, intent.cityId)) return s
        return PG.buildCity(s, seat, intent.cityId)
      case 'endBuild':
        if (s.phase !== 'build') return s
        return PG.endBuild(s, seat)
      case 'power': {
        if (s.phase !== 'bureau') return s
        // Only run plants the player actually owns; logic ignores unknown ids anyway.
        const owned = new Set(s.players[seat].plants.map(p => p.id))
        const ids = intent.plantIds.filter(id => owned.has(id))
        return PG.powerCities(s, seat, ids)
      }
      default:
        return s
    }
  },

  aiStep: s => PG.aiTurn(s),
  // Changes on every transition: phase/turn/orderIdx flip across steps, done flags and the
  // log length advance within a phase, round/step bump between rounds.
  tickKey: s => `${s.round}-${s.phase}-${s.turn}-${s.orderIdx}-${s.done.join('')}-${s.step}-${s.log.length}-${s.winner ?? ''}`,

  // Hide each other seat's cash and the face-down deck order; everything else is public.
  redactFor: (s, seat) => ({
    ...s,
    players: s.players.map((p, i) => (i === seat ? p : { ...p, money: -1 })),
    deck: s.deck.map(hiddenPlant),
  }),
}
