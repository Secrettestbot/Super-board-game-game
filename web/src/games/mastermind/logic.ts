/* MASTERMIND — code-breaking logic (built for this codebase, not ported).
   A solo deduction game: the computer hides a CODE of 4 pegs, each one of 6 colours,
   with REPEATS ALLOWED. You have up to 10 guesses to crack it. Each guess returns
   exact feedback — black key-pegs (right colour + right position) and white key-pegs
   (right colour, wrong position) — without revealing which positions. Pure: no React/DOM,
   fully immutable. The "opponent" is just the hidden code + the feedback oracle, so there
   is no adversarial AI. */

export const COLORS = 6          // colour ids: 0..5
export const SLOTS = 4           // pegs per row
export const MAX_GUESSES = 10

export type Peg = number         // 0..COLORS-1
export interface Feedback { black: number; white: number }
export interface Row { guess: Peg[]; fb: Feedback }
export interface LogEntry { t: string; x: string }

export interface MastermindState {
  secret: Peg[]                  // length SLOTS, the hidden code
  rows: Row[]                    // submitted guesses, oldest first
  guesses: number                // === rows.length
  over: boolean                  // game finished (won or lost)
  won: boolean                   // true if the code was cracked
  log: LogEntry[]
}

function push(log: LogEntry[], t: string, x: string): LogEntry[] {
  return log.concat([{ t, x }]).slice(-24)
}

function randomCode(): Peg[] {
  const code: Peg[] = []
  for (let i = 0; i < SLOTS; i++) code.push((Math.random() * COLORS) | 0)
  return code
}

export function makeGame(): MastermindState {
  return {
    secret: randomCode(),
    rows: [],
    guesses: 0,
    over: false,
    won: false,
    log: [{ t: 'sys', x: `Crack the ${SLOTS}-peg code in ${MAX_GUESSES} guesses. Repeats are allowed.` }],
  }
}

/**
 * The feedback oracle — standard Mastermind scoring.
 * black = pegs of the right colour in the right position.
 * white = pegs of the right colour in the wrong position (colour overlap minus blacks),
 *         computed via per-colour minimum counts so duplicates are handled correctly.
 * black + white never exceeds SLOTS.
 */
export function feedback(secret: Peg[], guess: Peg[]): Feedback {
  let black = 0
  const sCount = new Array(COLORS).fill(0)
  const gCount = new Array(COLORS).fill(0)
  for (let i = 0; i < SLOTS; i++) {
    if (guess[i] === secret[i]) {
      black++
    } else {
      sCount[secret[i]]++
      gCount[guess[i]]++
    }
  }
  let white = 0
  for (let c = 0; c < COLORS; c++) white += Math.min(sCount[c], gCount[c])
  return { black, white }
}

/** True if every slot is filled with a valid colour id. */
export function isComplete(guess: (Peg | null)[]): guess is Peg[] {
  return guess.length === SLOTS && guess.every(p => p !== null && p >= 0 && p < COLORS)
}

/** Submit a fully-filled guess. Returns a new state; ignored if the game is over or the
 *  guess is not a valid complete row. */
export function submit(s: MastermindState, guess: Peg[]): MastermindState {
  if (s.over) return s
  if (!isComplete(guess)) return s
  const g = guess.slice()
  const fb = feedback(s.secret, g)
  const rows = s.rows.concat([{ guess: g, fb }])
  const guesses = rows.length
  let log = push(s.log, 'you', `Guess ${guesses}: ${fb.black} black, ${fb.white} white.`)
  if (fb.black === SLOTS) {
    log = push(log, 'sys', `Cracked it in ${guesses}!`)
    return Object.assign({}, s, { rows, guesses, over: true, won: true, log })
  }
  if (guesses >= MAX_GUESSES) {
    log = push(log, 'sys', 'Out of guesses — the code is revealed.')
    return Object.assign({}, s, { rows, guesses, over: true, won: false, log })
  }
  return Object.assign({}, s, { rows, guesses, over: false, won: false, log })
}

export const guessesLeft = (s: MastermindState): number => MAX_GUESSES - s.guesses
