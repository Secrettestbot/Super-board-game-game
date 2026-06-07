/* WELCOME TO… — netplay adapter. Maps the pure flip-and-write logic onto the uniform
 * GameAdapter so useGameSession can host/join it.
 *
 * Each round the host flips three PUBLIC number+effect PAIRS (s.flips) from the two
 * face-down decks. Every player simultaneously picks ONE pair, writes its number onto an
 * empty lot of their OWN street (strictly ascending) and resolves the paired effect. The
 * simultaneous pick is SERIALIZED: seatToMove walks the players who have not chosen this
 * round (s.turn always points at the next unpicked player; advance() hands off / flips a
 * fresh round once everyone has acted). The flip RNG and the round-advance live inside the
 * logic, which only ever runs on the authority (host/local), so guests never draw.
 *
 * PUBLIC: the revealed pairs (s.flips), both sheets, the city plans, the scores, the log.
 * HIDDEN: the face-down deck ORDER (numberDeck / effectDeck) — redactFor strips both so a
 * guest can never read upcoming cards. Everything a guest needs to render and pick is public.
 *
 * Seats map directly to player indices: seat 0 = the original human, seat 1 = the rival.
 * numSeats reads the real player count off the state.
 *
 * Intent:
 *   { kind: 'pick',   pairIndex, streetIndex, lotIndex, number?, fenceSide? }
 *   { kind: 'refuse' }   // no flipped number can be legally placed -> permit refusal
 * applyIntent re-validates against the logic (place() / refuse() re-check turn + legality and
 * return the SAME reference when illegal/out-of-turn). tickKey changes on EVERY action via the
 * monotonic s.step counter the logic bumps on each pick, refusal, hand-off and round flip. */

import * as W from './logic'
import type { State } from './logic'
import type { GameAdapter } from '../../net/protocol'

export type WelcomeToIntent =
  | { kind: 'pick'; pairIndex: number; streetIndex: number; lotIndex: number; number?: number; fenceSide?: 'left' | 'right' }
  | { kind: 'refuse' }

const seatToMove = (s: State): number | null =>
  s.winner == null && !s.picked[s.turn] ? s.turn : null

export const welcomeToAdapter: GameAdapter<State, WelcomeToIntent> = {
  makeGame: () => W.makeGame(),
  // The match is a fixed pair of sheets; read it off the state so it stays honest.
  numSeats: s => s.sheets.length,
  seatToMove,
  isOver: s => s.winner != null,
  applyIntent: (s, seat, i) => {
    // Must be this seat's turn and a seat that has not yet picked this round.
    if (seatToMove(s) !== seat || !i) return s
    switch (i.kind) {
      case 'pick': {
        if (typeof i.pairIndex !== 'number' || typeof i.streetIndex !== 'number' || typeof i.lotIndex !== 'number') return s
        // place() re-validates against legalPlacements and returns the SAME state if illegal.
        return W.place(s, seat as 0 | 1, i.pairIndex, i.streetIndex, i.lotIndex, {
          number: i.number,
          fenceSide: i.fenceSide,
        })
      }
      case 'refuse':
        // refuse() is only legal when there is genuinely no placement; it still re-checks
        // turn + picked and returns the SAME state when illegal.
        return W.canPlaceAny(s.sheets[seat], s.flips) ? s : W.refuse(s, seat as 0 | 1)
      default:
        return s
    }
  },
  // The game's aiTurn resolves ONE action (place or refuse) for the seat at s.turn and bumps
  // s.step, so tickKey changes and the driver re-arms. The flip RNG / round-advance run inside
  // the logic here on the host (the authority); guests never roll.
  aiStep: (s, seat) => (s.winner == null && s.turn === seat && !s.picked[seat] ? W.aiTurn(s, seat as 0 | 1) : s),
  // Changes on EVERY action: s.step is a monotonic counter the logic bumps on each pick,
  // refusal, turn hand-off and round flip.
  tickKey: s => `${s.step}-${s.turn}-${s.winner ?? ''}`,
  // Hidden info: strip the face-down deck order so a guest can never see upcoming cards.
  // Everything else (flips, sheets, plans, scores, log) is public.
  redactFor: s => ({ ...s, numberDeck: [], effectDeck: [] }),
}
