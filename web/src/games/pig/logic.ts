/* PIG — push-your-luck dice logic (built for this codebase, not ported).
   You vs the AI, first to 100. On your turn you repeatedly ROLL a single d6: a 2–6 adds
   to your TURN TOTAL (you may roll again or HOLD); a 1 ("pig") wipes the turn total and
   passes the turn. HOLD banks the turn total into your permanent score and passes the turn.
   The AI uses a "hold at 20" policy with endgame awareness. Math.random is used for dice. */

export const GOAL = 100

export type Player = 'you' | 'ai'
export interface LogEntry { t: string; x: string }

export interface PigState {
  scores: { you: number; ai: number }  // banked, permanent
  turn: Player                          // whose turn it is
  turnTotal: number                     // points accumulated this turn (unbanked)
  die: number | null                    // the face currently shown (last roll)
  rollCount: number                     // rolls taken this turn (drives the AI tick + die animation)
  busted: boolean                       // true the moment a 1 is rolled (cleared on next turn)
  winner: Player | null
  log: LogEntry[]
}

const other = (p: Player): Player => (p === 'you' ? 'ai' : 'you')

function push(log: LogEntry[], t: string, x: string) { return log.concat([{ t, x }]).slice(-24) }

export function rollDie(): number { return 1 + ((Math.random() * 6) | 0) }

export function makeGame(): PigState {
  return {
    scores: { you: 0, ai: 0 },
    turn: 'you',
    turnTotal: 0,
    die: null,
    rollCount: 0,
    busted: false,
    winner: null,
    log: [{ t: 'sys', x: 'First to 100. Roll to build your turn — but a 1 wipes it. Hold to bank.' }],
  }
}

/* Pure: apply a specific die value for the player whose turn it is. Used by the UI (with a
   random value) and by tests (with a fixed value) so dice never need to be mocked. */
export function applyRoll(s: PigState, value: number): PigState {
  if (s.winner) return s
  const who = s.turn
  const name = who === 'you' ? 'You' : 'Rival'
  if (value === 1) {
    // pig — turn total lost, turn passes
    const log = push(s.log, who === 'you' ? 'you' : 'ai', `${name} rolled a 1 — ${who === 'you' ? 'you bust' : 'busted'}!`)
    return Object.assign({}, s, {
      turn: other(who), turnTotal: 0, die: 1, rollCount: s.rollCount + 1, busted: true, log,
    })
  }
  const turnTotal = s.turnTotal + value
  const log = push(s.log, who === 'you' ? 'you' : 'ai', `${name} rolled ${value} (turn ${turnTotal}).`)
  return Object.assign({}, s, {
    turnTotal, die: value, rollCount: s.rollCount + 1, busted: false, log,
  })
}

/* Roll for the side to move using a random die. */
export function roll(s: PigState, who: Player): PigState {
  if (s.winner || s.turn !== who) return s
  return applyRoll(s, rollDie())
}

/* Bank the current turn total and pass the turn (or win). */
export function hold(s: PigState, who: Player): PigState {
  if (s.winner || s.turn !== who) return s
  if (s.turnTotal === 0) return s
  const banked = s.scores[who] + s.turnTotal
  const scores = Object.assign({}, s.scores, { [who]: banked })
  const name = who === 'you' ? 'You' : 'Rival'
  let log = push(s.log, who === 'you' ? 'you' : 'ai', `${name} banked ${s.turnTotal} → ${banked}.`)
  if (banked >= GOAL) {
    log = push(log, who === 'you' ? 'you' : 'ai', `${name} reached ${GOAL} — ${who === 'you' ? 'you win' : 'rival wins'}!`)
    return Object.assign({}, s, { scores, turnTotal: 0, die: null, busted: false, winner: who, log })
  }
  return Object.assign({}, s, {
    scores, turn: other(who), turnTotal: 0, die: null, rollCount: 0, busted: false, log,
  })
}

/* AI policy: hold at 20, but never short of a winning bank, and push higher when far behind.
   Returns the threshold (turn total at which the AI should hold) for the current state. */
export function aiHoldTarget(s: PigState): number {
  const me = s.scores.ai
  const them = s.scores.you
  // If banking would win, the implied target is whatever reaches the goal.
  const toWin = GOAL - me
  let target = 20
  const behind = them - me
  if (behind >= 30) target = 28        // far behind — push your luck
  else if (behind >= 15) target = 24
  // Never hold for less than what wins the game outright (so it keeps rolling toward a win).
  return Math.min(target, toWin)
}

/* One AI step: roll (animated, one die per tick) until the policy says hold, then hold.
   Caller drives this on a timer; the changing rollCount/turnTotal re-arms the tick so the
   dice appear one at a time. */
export function aiStep(s: PigState): PigState {
  if (s.winner || s.turn !== 'ai') return s
  const target = aiHoldTarget(s)
  // If we've already met the policy target this turn, bank.
  if (s.turnTotal >= target) return hold(s, 'ai')
  return roll(s, 'ai')
}
