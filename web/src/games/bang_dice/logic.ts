/* BANG! THE DICE GAME — pure western-shootout dice logic (built for this codebase).
   4 players (you = player 0, AI = players 1,2,3) sit in a CIRCLE, each with 8 life.
   On a turn you roll 5 dice up to 3 times (Yahtzee-style keep), BUT:
     - a DYNAMITE die can NOT be re-rolled (once shown it sticks),
     - rolling a 3rd DYNAMITE immediately ENDS your rolling and explodes (you lose 1 life).
   Then RESOLVE the kept dice:
     [1]      shoot the player 1 seat away (clockwise) for 1
     [2]      shoot the player 2 seats away for 1
     ARROW    take an arrow from the central pile; if the pile empties an INDIAN
              ATTACK fires — every player loses life equal to their arrow count, then
              all arrows return to the pile.
     BEER     heal 1 life (capped at max), useless once you've taken lethal-on-self.
     GATLING  collect 3 GATLINGs to fire at ALL other players for 1 each AND discard
              all of YOUR arrows back to the pile.
   Dead players (life 0) are removed from the circle for shot targeting (shots skip
   them to the next live seat). Win: last player alive (free-for-all, simplified roles).

   No React/DOM. Randomness in rollDice() is injectable for tests via setRng(). */

export type Face = 1 | 2 | 'arrow' | 'dynamite' | 'beer' | 'gatling'
export type Phase = 'roll' | 'resolved' | 'over'

export interface Player {
  id: number
  name: string
  seat: number
  life: number
  arrows: number
  alive: boolean
}

export interface LogEntry { t: string; x: string }

export interface BangState {
  players: Player[]
  /** arrows remaining in the central pile */
  arrowPile: number
  /** the 5 dice faces for the current roller */
  dice: Face[]
  /** which dice are kept between rolls */
  kept: boolean[]
  rerollsLeft: number
  /** has the dice been rolled at least once this turn */
  rolled: boolean
  /** whose turn it is (index into players) */
  turn: number
  phase: Phase
  winner: number | null
  /** monotonic counter that increments on every state-advancing action (AI tick) */
  step: number
  log: LogEntry[]
}

export const NUM_PLAYERS = 4
export const MAX_LIFE = 8
export const NUM_DICE = 5
export const NUM_REROLLS = 3
export const ARROW_PILE = 9
export const FACES: Face[] = [1, 2, 'arrow', 'dynamite', 'beer', 'gatling']

const NAMES = ['You', 'Slab', 'Calamity', 'El Gringo']

function push(log: LogEntry[], t: string, x: string): LogEntry[] {
  return log.concat([{ t, x }]).slice(-40)
}

function who(s: BangState, i: number): string {
  return s.players[i].name
}

export function makeGame(): BangState {
  const players: Player[] = NAMES.map((name, id) => ({
    id, name, seat: id, life: MAX_LIFE, arrows: 0, alive: true,
  }))
  return {
    players,
    arrowPile: ARROW_PILE,
    dice: [1, 1, 1, 1, 1],
    kept: [false, false, false, false, false],
    rerollsLeft: NUM_REROLLS,
    rolled: false,
    turn: 0,
    phase: 'roll',
    winner: null,
    step: 0,
    log: [{ t: 'sys', x: 'Roll five dice (3 chances). Shoot seats 1 & 2 away, take arrows, drink beer, collect gatlings. Watch the dynamite — three ends your roll and burns you. Last gunslinger standing wins.' }],
  }
}

let _rng: () => number = Math.random
/** Inject a deterministic RNG (for tests). Returns the previous one. */
export function setRng(fn: () => number): () => number {
  const prev = _rng
  _rng = fn
  return prev
}
function rndFace(): Face { return FACES[(_rng() * FACES.length) | 0] }

/* ---- dice ---- */

function countDynamite(dice: Face[]): number {
  return dice.filter(d => d === 'dynamite').length
}

/** Roll: re-roll every die that is NOT kept AND not a dynamite (dynamite can't reroll).
    Consumes one reroll. If a 3rd dynamite appears, rolling stops (rerollsLeft → 0).
    Pure given _rng. */
export function rollDice(s: BangState): BangState {
  if (s.phase !== 'roll' || s.winner != null || s.rerollsLeft <= 0) return s
  const dice = s.dice.map((d, i) => {
    if (s.rolled && s.kept[i]) return d
    if (s.rolled && d === 'dynamite') return d // dynamite sticks, can't be re-rolled
    return rndFace()
  })
  let rerollsLeft = s.rerollsLeft - 1
  let log = s.log
  // 3rd dynamite ends rolling immediately
  if (countDynamite(dice) >= 3) {
    rerollsLeft = 0
    log = push(log, s.turn === 0 ? 'you' : 'ai', `${who(s, s.turn)} rolled a third dynamite — the fuse is lit!`)
  }
  return Object.assign({}, s, {
    dice,
    rerollsLeft,
    rolled: true,
    log,
    step: s.step + 1,
  })
}

export function toggleKeep(s: BangState, i: number): BangState {
  if (!s.rolled || s.phase !== 'roll') return s
  if (i < 0 || i >= s.dice.length) return s
  if (s.dice[i] === 'dynamite') return s // dynamite is always effectively kept; no toggle
  const kept = s.kept.slice()
  kept[i] = !kept[i]
  return Object.assign({}, s, { kept })
}

function countFace(dice: Face[], f: Face): number {
  return dice.filter(d => d === f).length
}

function aliveCount(players: Player[]): number {
  return players.filter(p => p.alive).length
}

/** Has the game ended? Returns winner index or null (last standing). */
function findWinner(players: Player[]): number | null {
  const alive = players.filter(p => p.alive)
  if (alive.length === 1) return alive[0].id
  if (alive.length === 0) return null
  return null
}

/** From player `from`, walk `dist` live seats clockwise and return that player's id,
    skipping dead players. Returns null if no other live player exists. */
export function targetAt(players: Player[], from: number, dist: number): number | null {
  const n = players.length
  let remaining = dist
  let idx = from
  // step forward to live players only, `dist` of them
  for (let guard = 0; guard < n * 4 && remaining > 0; guard++) {
    idx = (idx + 1) % n
    if (idx === from) continue
    if (players[idx].alive) remaining--
  }
  if (remaining > 0) return null
  if (!players[idx].alive || idx === from) return null
  return idx
}

/* ---- resolving dice ---- */

/** Resolve the kept dice for the current player: shots (1/2 seat away), arrows (+ Indian
    attack when the pile empties), beer heals, and a 3-gatling fire-at-all (which also
    discards the roller's arrows). A 3rd-dynamite explosion burns the roller for 1. */
export function resolveDice(s: BangState): BangState {
  if (s.phase !== 'roll' || s.winner != null || !s.rolled) return s
  const cur = s.turn
  const players = s.players.map(p => Object.assign({}, p))
  let arrowPile = s.arrowPile
  let log = s.log
  const dice = s.dice

  const damage = (id: number, amt: number, reason: string) => {
    const p = players[id]
    if (!p.alive || amt <= 0) return
    p.life = Math.max(0, p.life - amt)
    if (p.life === 0) {
      p.alive = false
      log = push(log, 'sys', `${players[id].name} is gunned down (${reason}).`)
    }
  }

  // 1. Dynamite explosion (3+) — burn the roller for 1.
  if (countDynamite(dice) >= 3) {
    log = push(log, cur === 0 ? 'you' : 'ai', `${who(s, cur)}'s dynamite explodes for 1.`)
    damage(cur, 1, 'dynamite')
  }

  // 2. Beers — heal the roller (only while alive).
  const beers = countFace(dice, 'beer')
  if (beers > 0 && players[cur].alive) {
    const before = players[cur].life
    players[cur].life = Math.min(MAX_LIFE, players[cur].life + beers)
    if (players[cur].life > before) {
      log = push(log, cur === 0 ? 'you' : 'ai', `${who(s, cur)} drinks ${beers} beer (+${players[cur].life - before} life).`)
    }
  }

  // 3. Shots — [1] hits seat 1 away, [2] hits seat 2 away (circular, skipping the dead).
  const ones = countFace(dice, 1)
  const twos = countFace(dice, 2)
  if (ones > 0) {
    const t = targetAt(players, cur, 1)
    if (t != null) { log = push(log, cur === 0 ? 'you' : 'ai', `${who(s, cur)} shoots ${players[t].name} (1 away) for ${ones}.`); damage(t, ones, 'shot') }
  }
  if (twos > 0) {
    const t = targetAt(players, cur, 2)
    if (t != null) { log = push(log, cur === 0 ? 'you' : 'ai', `${who(s, cur)} shoots ${players[t].name} (2 away) for ${twos}.`); damage(t, twos, 'shot') }
  }

  // 4. Arrows — take from the pile; an Indian attack fires when it empties.
  const arrows = countFace(dice, 'arrow')
  if (arrows > 0 && players[cur].alive) {
    for (let a = 0; a < arrows; a++) {
      if (arrowPile <= 0) break
      players[cur].arrows += 1
      arrowPile -= 1
      if (arrowPile === 0) {
        // INDIAN ATTACK: everyone loses life = their arrow count, then arrows reset.
        log = push(log, 'sys', 'The arrows run out — INDIAN ATTACK!')
        for (const p of players) {
          if (p.alive && p.arrows > 0) damage(p.id, p.arrows, 'indians')
        }
        for (const p of players) p.arrows = 0
        arrowPile = ARROW_PILE
      }
    }
  }

  // 5. Gatling — 3+ gatlings fire at ALL other live players for 1 and discard the
  //    roller's own arrows back to the pile.
  const gatlings = countFace(dice, 'gatling')
  if (gatlings >= 3 && players[cur].alive) {
    log = push(log, cur === 0 ? 'you' : 'ai', `${who(s, cur)} unloads the GATLING on everyone!`)
    for (const p of players) {
      if (p.id !== cur && p.alive) damage(p.id, 1, 'gatling')
    }
    // discard the roller's arrows back to the pile
    arrowPile = Math.min(ARROW_PILE, arrowPile + players[cur].arrows)
    players[cur].arrows = 0
  }

  let ns = Object.assign({}, s, {
    players,
    arrowPile,
    log,
    phase: 'resolved' as Phase,
    step: s.step + 1,
  })

  const w = findWinner(players)
  if (w != null) {
    ns = Object.assign({}, ns, { winner: w, phase: 'over' as Phase })
    ns.log = push(ns.log, w === 0 ? 'you' : 'ai', `${who(ns, w)} ${w === 0 ? 'win' : 'wins'} — last gunslinger standing!`)
  }
  return ns
}

/* ---- turn flow ---- */

function nextAlive(s: BangState, from: number): number {
  for (let k = 1; k <= NUM_PLAYERS; k++) {
    const cand = (from + k) % NUM_PLAYERS
    if (s.players[cand].alive) return cand
  }
  return from
}

/** End the current turn and advance to the next live player. */
export function endTurn(s: BangState): BangState {
  if (s.winner != null) return s
  if (s.phase !== 'resolved') return s
  const nt = nextAlive(s, s.turn)
  let ns = Object.assign({}, s, {
    turn: nt,
    dice: [1, 1, 1, 1, 1] as Face[],
    kept: [false, false, false, false, false],
    rerollsLeft: NUM_REROLLS,
    rolled: false,
    phase: 'roll' as Phase,
    step: s.step + 1,
  })
  const w = findWinner(ns.players)
  if (w != null) ns = Object.assign({}, ns, { winner: w, phase: 'over' as Phase })
  return ns
}

/* ===== AI ===== */

/** Pick the weakest live opponent's id (lowest life, tie → fewest arrows). */
function weakestEnemy(players: Player[], cur: number): number | null {
  let best: number | null = null
  for (const p of players) {
    if (p.id === cur || !p.alive) continue
    if (best == null || p.life < players[best].life) best = p.id
  }
  return best
}

/** Decide which dice the AI keeps for its current roll. Returns a kept[] array.
    Dynamite is reported as kept (it can't reroll anyway). */
export function aiKeep(s: BangState): boolean[] {
  const cur = s.turn
  const me = s.players[cur]
  const dice = s.dice
  const kept = dice.map(d => d === 'dynamite')
  const lowLife = me.life <= 3
  const gat = countFace(dice, 'gatling')
  const arrowDanger = s.arrowPile <= 2 || me.arrows >= 2
  const enemy = weakestEnemy(s.players, cur)
  const t1 = targetAt(s.players, cur, 1)
  const t2 = targetAt(s.players, cur, 2)

  for (let i = 0; i < dice.length; i++) {
    const d = dice[i]
    if (d === 'dynamite') { kept[i] = true; continue }
    if (d === 'beer') {
      if (lowLife) kept[i] = true // keep heals when hurt
    } else if (d === 'gatling') {
      kept[i] = true // gatlings are valuable — always chase the set of 3
    } else if (d === 1) {
      // keep a 1-shot if it targets a weak/valid enemy
      if (t1 != null && (enemy == null || s.players[t1].life <= s.players[enemy].life + 1)) kept[i] = true
    } else if (d === 2) {
      if (t2 != null && (enemy == null || s.players[t2].life <= s.players[enemy].life + 1)) kept[i] = true
    } else if (d === 'arrow') {
      // arrows are risky — keep only if it won't pile danger on us
      if (!arrowDanger && !lowLife && gat < 2) kept[i] = true
    }
  }
  return kept
}

/** Run the current AI player's ENTIRE turn to completion (used by tests/self-play).
    The UI instead steps via aiStep() so each sub-action animates. */
export function aiTurn(s: BangState): BangState {
  if (s.winner != null) return s
  if (s.turn === 0) return s
  let st = s
  let guard = 0
  while (st.turn !== 0 && st.winner == null && guard < 200) {
    guard++
    st = aiStep(st)
  }
  return st
}

/** Single AI sub-action — exactly one state transition. Drives the UI tick. */
export function aiStep(s: BangState): BangState {
  if (s.winner != null) return s
  if (s.turn === 0) return s // not an AI turn

  if (s.phase === 'roll') {
    if (!s.rolled) return rollDice(s) // first roll
    if (s.rerollsLeft > 0) {
      const kept = aiKeep(s)
      const allKept = kept.every(Boolean)
      if (allKept) return resolveDice(s) // nothing left worth re-rolling
      const withKeep = Object.assign({}, s, { kept })
      return rollDice(withKeep)
    }
    return resolveDice(s)
  }

  if (s.phase === 'resolved') return endTurn(s)

  return s
}

export { aliveCount, countFace }
