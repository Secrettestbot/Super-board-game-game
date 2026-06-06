/* ZOMBIE DICE — push-your-luck logic (built for this codebase).
   A cup of 13 dice: 6 GREEN (3 brain, 2 runner, 1 shotgun), 4 YELLOW (2/2/2),
   3 RED (1 brain, 2 runner, 3 shotgun). On your turn you draw 3 dice and roll them.
   Brains are set aside as score, shotguns as wounds, runners stay to be re-rolled.
   Roll again (refill to 3 from the cup) or STOP to bank your brains. 3 shotguns in a
   turn busts you to 0 for that turn. First to 13 banked brains wins. */

export type Color = 'g' | 'y' | 'r'
export type Face = 'brain' | 'shot' | 'run'
export type Player = 'you' | 'ai'

export interface Die { color: Color }
export interface Rolled { color: Color; face: Face }
export interface LogEntry { t: string; x: string }

export interface ZombieState {
  cup: Die[]                 // dice still available to draw this turn
  hand: Rolled[]             // the 3 dice currently rolled (runners kept on re-roll)
  brains: number            // brains set aside THIS turn
  shots: number             // shotguns set aside THIS turn
  rolling: boolean          // true once a roll has happened this turn (hand is live)
  turn: Player | null       // whose turn it is (null once the game is won)
  scores: { you: number; ai: number }
  winner: Player | null
  log: LogEntry[]
}

export const GOAL = 13

// 13-die cup composition. Faces per color below.
const CUP: Die[] = [
  ...Array.from({ length: 6 }, () => ({ color: 'g' as Color })),
  ...Array.from({ length: 4 }, () => ({ color: 'y' as Color })),
  ...Array.from({ length: 3 }, () => ({ color: 'r' as Color })),
]

// six-face layouts: brains / runners / shotguns
const FACES: Record<Color, Face[]> = {
  g: ['brain', 'brain', 'brain', 'run', 'run', 'shot'],
  y: ['brain', 'brain', 'run', 'run', 'shot', 'shot'],
  r: ['brain', 'run', 'run', 'shot', 'shot', 'shot'],
}

export const COLOR_NAME: Record<Color, string> = { g: 'green', y: 'yellow', r: 'red' }

function push(log: LogEntry[], t: string, x: string) { return log.concat([{ t, x }]).slice(-24) }

function freshCup(): Die[] { return CUP.map(d => ({ color: d.color })) }

export function makeGame(): ZombieState {
  return {
    cup: freshCup(),
    hand: [],
    brains: 0,
    shots: 0,
    rolling: false,
    turn: 'you',
    scores: { you: 0, ai: 0 },
    winner: null,
    log: [{ t: 'sys', x: 'Roll 3 dice. Brains score, runners re-roll, three shotguns bust your turn. First to 13 brains wins.' }],
  }
}

export function cupCount(cup: Die[]): Record<Color, number> {
  const c: Record<Color, number> = { g: 0, y: 0, r: 0 }
  for (const d of cup) c[d.color]++
  return c
}

// draw n dice at random (without replacement) from cup; returns [drawn, remaining]
export function draw(cup: Die[], n: number): { drawn: Die[]; cup: Die[] } {
  const pool = cup.slice()
  const drawn: Die[] = []
  for (let k = 0; k < n && pool.length; k++) {
    const i = (Math.random() * pool.length) | 0
    drawn.push(pool[i])
    pool.splice(i, 1)
  }
  return { drawn, cup: pool }
}

// roll a single drawn die to a face
export function rollDie(d: Die): Rolled {
  const faces = FACES[d.color]
  return { color: d.color, face: faces[(Math.random() * faces.length) | 0] }
}

/* Resolve a freshly rolled hand: brains/shotguns are set aside, runners are kept in
   `keep` to be re-rolled next time. Returns the new tallies + runners + whether busted. */
export function resolveRoll(rolled: Rolled[], brains: number, shots: number): {
  brains: number; shots: number; keep: Rolled[]; busted: boolean
} {
  let b = brains, s = shots
  const keep: Rolled[] = []
  for (const r of rolled) {
    if (r.face === 'brain') b++
    else if (r.face === 'shot') s++
    else keep.push(r)
  }
  return { brains: b, shots: s, keep, busted: s >= 3 }
}

const who = (p: Player) => (p === 'you' ? 'You' : 'The rival')
const next = (p: Player): Player => (p === 'you' ? 'ai' : 'you')

// Begin a turn for `p`: refill the cup, clear this-turn tallies.
function beginTurn(s: ZombieState, p: Player): ZombieState {
  return Object.assign({}, s, {
    cup: freshCup(), hand: [], brains: 0, shots: 0, rolling: false, turn: p,
  })
}

/* Draw up to 3 (keeping runners already in hand) and roll. Pure given Math.random. */
export function roll(s: ZombieState): ZombieState {
  if (s.winner || !s.turn) return s
  const keptRunners = s.rolling ? s.hand.filter(r => r.face === 'run') : []
  const need = 3 - keptRunners.length
  const { drawn, cup } = draw(s.cup, need)
  // re-roll the kept runner dice along with the newly drawn dice — all dice in hand are
  // rolled fresh each time (otherwise a hand of 3 runners would never change → never ends).
  const rolledNew = keptRunners.map(r => ({ color: r.color })).concat(drawn).map(rollDie)
  const hand = rolledNew
  const res = resolveRoll(rolledNew, s.brains, s.shots)
  const p = s.turn
  let log = push(s.log, p === 'you' ? 'you' : 'ai',
    `${who(p)} rolled ${faceSummary(rolledNew)} — ${res.brains} brain${res.brains === 1 ? '' : 's'}, ${res.shots} shotgun${res.shots === 1 ? '' : 's'} this turn.`)

  const base = Object.assign({}, s, { cup, hand, brains: res.brains, shots: res.shots, rolling: true, log })

  if (res.busted) {
    log = push(log, p === 'you' ? 'you' : 'ai', `${who(p)} took a third shotgun — busted, no brains banked!`)
    const ended = Object.assign({}, base, { log, hand })
    return beginTurn(ended, next(p))
  }
  return base
}

/* Stop: bank this turn's brains, check for the win, else pass the cup. */
export function stop(s: ZombieState): ZombieState {
  if (s.winner || !s.turn || !s.rolling) return s
  const p = s.turn
  const total = s.scores[p] + s.brains
  const scores = Object.assign({}, s.scores, { [p]: total })
  let log = push(s.log, p === 'you' ? 'you' : 'ai',
    `${who(p)} banked ${s.brains} brain${s.brains === 1 ? '' : 's'} (total ${total}).`)

  if (total >= GOAL) {
    log = push(log, p === 'you' ? 'you' : 'ai', `${who(p)} reached ${GOAL} brains — ${p === 'you' ? 'you win' : 'rival wins'}!`)
    return Object.assign({}, s, { scores, winner: p, turn: null, rolling: false, hand: s.hand, log })
  }
  const passed = Object.assign({}, s, { scores, log })
  return beginTurn(passed, next(p))
}

function faceSummary(rolled: Rolled[]): string {
  if (!rolled.length) return 'nothing'
  return rolled.map(r => r.face === 'brain' ? '🧠' : r.face === 'shot' ? '💥' : '👣').join(' ')
}

/* ===== AI: a push-your-luck policy driven step by step via useAITurn =====
   It keeps rolling while it has 0–1 shotguns and hasn't gathered "enough" brains;
   it stops at 2 shotguns, once it has enough to win, or once a safe cushion is met. */
export function aiStep(s: ZombieState): ZombieState {
  if (s.winner || s.turn !== 'ai') return s
  if (!s.rolling) return roll(s)        // first roll of the turn

  const banked = s.scores.ai
  const needToWin = GOAL - banked

  // Stop if this turn already wins, or risk is too high.
  if (banked + s.brains >= GOAL) return stop(s)
  if (s.shots >= 2) return stop(s)
  // With one shotgun, stop once we have a decent haul (or enough to close out).
  if (s.shots >= 1 && (s.brains >= 2 || s.brains >= needToWin)) return stop(s)
  // With no shotguns, press on but cap greed at a 3+ haul to lock in progress.
  if (s.shots === 0 && s.brains >= 4) return stop(s)
  return roll(s)
}
