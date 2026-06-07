/* KING OF TOKYO — pure dice-brawl logic (built for this codebase).
   3 monsters (you = player 0, AI = players 1,2). Each has 10 health, 0 VP, energy.
   One space is TOKYO. On a turn: roll 6 dice up to 3 times (Yahtzee-style keep),
   then resolve. Numbers (1/2/3): a set of three of value N scores N VP, each extra
   matching die +1 VP. CLAW: from outside Tokyo hit the Tokyo monster; from inside
   hit everyone outside. HEART: heal 1 each (max 10) but only outside Tokyo. ENERGY:
   gain energy cubes (currency track only — no shop). Tokyo: must enter on a claw if
   empty (+1 VP); +2 VP at start of your turn if you hold it; cannot heal; may yield
   to an attacker. Win: first to 20 VP, or be the last monster alive.

   No React/DOM. Randomness in rollDice() is injectable for tests via _rng. */

export type Face = 1 | 2 | 3 | 'claw' | 'heart' | 'energy'
export type Phase = 'roll' | 'resolved' | 'yield' | 'over'

export interface Monster {
  id: number
  name: string
  health: number
  vp: number
  energy: number
  alive: boolean
  inTokyo: boolean
}

export interface LogEntry { t: string; x: string }

export interface PendingYield {
  /** the monster currently in Tokyo being asked to yield */
  defender: number
  /** the attacker who would take Tokyo if the defender yields */
  attacker: number
  /** damage being dealt (already applied) — informational */
  damage: number
}

export interface KotState {
  monsters: Monster[]
  /** 6 dice faces */
  dice: Face[]
  /** which dice are kept between rolls */
  kept: boolean[]
  rerollsLeft: number
  /** has the dice been rolled at least once this turn */
  rolled: boolean
  /** index into monsters of whoever holds Tokyo, or null if empty */
  tokyoOccupant: number | null
  /** whose turn it is (index into monsters) */
  turn: number
  phase: Phase
  pendingYield: PendingYield | null
  winner: number | null
  /** monotonic counter that increments on every state-advancing action (AI tick) */
  step: number
  log: LogEntry[]
}

export const NUM_MONSTERS = 3
export const MAX_HEALTH = 10
export const WIN_VP = 20
export const NUM_DICE = 6
export const FACES: Face[] = [1, 2, 3, 'claw', 'heart', 'energy']

const NAMES = ['Gigazaur', 'Cyber Kitty', 'The Kraken']

function push(log: LogEntry[], t: string, x: string): LogEntry[] {
  return log.concat([{ t, x }]).slice(-40)
}

function who(s: KotState, i: number): string {
  return i === 0 ? 'You' : s.monsters[i].name
}

export function makeGame(): KotState {
  const monsters: Monster[] = NAMES.map((name, id) => ({
    id, name: id === 0 ? 'You' : name, health: MAX_HEALTH, vp: 0, energy: 0, alive: true, inTokyo: false,
  }))
  return {
    monsters,
    dice: [1, 1, 1, 1, 1, 1],
    kept: [false, false, false, false, false, false],
    rerollsLeft: 3,
    rolled: false,
    tokyoOccupant: null,
    turn: 0,
    phase: 'roll',
    pendingYield: null,
    winner: null,
    step: 0,
    log: [{ t: 'sys', x: 'Roll six dice (3 chances). Claws attack, hearts heal, numbers score VP. First to 20 VP — or the last monster standing — wins.' }],
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

/** Roll: re-roll every die that is NOT kept. Consumes one reroll. Pure given _rng. */
export function rollDice(s: KotState): KotState {
  if (s.phase !== 'roll' || s.winner != null || s.rerollsLeft <= 0) return s
  const dice = s.dice.map((d, i) => (s.rolled && s.kept[i]) ? d : rndFace())
  return Object.assign({}, s, {
    dice,
    rerollsLeft: s.rerollsLeft - 1,
    rolled: true,
    step: s.step + 1,
  })
}

export function toggleKeep(s: KotState, i: number): KotState {
  if (!s.rolled || s.phase !== 'roll') return s
  if (i < 0 || i >= s.dice.length) return s
  const kept = s.kept.slice()
  kept[i] = !kept[i]
  return Object.assign({}, s, { kept })
}

/** VP scored from number dice: a set of 3 of value N = N VP, each extra die +1. */
export function scoreNumbers(dice: Face[]): number {
  let vp = 0
  for (const n of [1, 2, 3] as const) {
    const c = dice.filter(d => d === n).length
    if (c >= 3) vp += n + (c - 3)
  }
  return vp
}

function countFace(dice: Face[], f: Face): number {
  return dice.filter(d => d === f).length
}

function aliveCount(monsters: Monster[]): number {
  return monsters.filter(m => m.alive).length
}

/** Has the game ended? Returns winner index or null. Sets via checkWin in resolve. */
function findWinner(s: KotState): number | null {
  // last standing
  const alive = s.monsters.filter(m => m.alive)
  if (alive.length === 1) return alive[0].id
  // first to WIN_VP among the alive
  for (const m of s.monsters) if (m.alive && m.vp >= WIN_VP) return m.id
  return null
}

/* ---- resolving dice ---- */

/** Resolve the kept dice for the current player. Applies numbers/claws/hearts/energy,
    Tokyo entry, and sets up a pending yield if the Tokyo monster was attacked from
    outside. After this the phase becomes 'resolved' (or 'yield' / 'over'). */
export function resolveDice(s: KotState): KotState {
  if (s.phase !== 'roll' || s.winner != null || !s.rolled) return s
  const cur = s.turn
  const monsters = s.monsters.map(m => Object.assign({}, m))
  let log = s.log
  let tokyo = s.tokyoOccupant

  const me = monsters[cur]

  // 1. Numbers → VP
  const numVp = scoreNumbers(s.dice)
  if (numVp > 0) {
    me.vp += numVp
    log = push(log, cur === 0 ? 'you' : 'ai', `${who(s, cur)} scored ${numVp} VP from numbers.`)
  }

  // 2. Energy
  const energy = countFace(s.dice, 'energy')
  if (energy > 0) {
    me.energy += energy
    log = push(log, cur === 0 ? 'you' : 'ai', `${who(s, cur)} gained ${energy} energy.`)
  }

  // 3. Hearts (only outside Tokyo)
  const hearts = countFace(s.dice, 'heart')
  if (hearts > 0) {
    if (me.inTokyo) {
      log = push(log, 'sys', `${who(s, cur)} can't heal while holding Tokyo.`)
    } else {
      const before = me.health
      me.health = Math.min(MAX_HEALTH, me.health + hearts)
      if (me.health > before) log = push(log, cur === 0 ? 'you' : 'ai', `${who(s, cur)} healed ${me.health - before}.`)
    }
  }

  // 4. Claws → damage
  const claws = countFace(s.dice, 'claw')
  let pendingYield: PendingYield | null = null
  if (claws > 0) {
    if (me.inTokyo) {
      // hit everyone outside Tokyo
      for (const m of monsters) {
        if (m.id !== cur && m.alive) {
          m.health = Math.max(0, m.health - claws)
          if (m.health === 0) m.alive = false
        }
      }
      log = push(log, cur === 0 ? 'you' : 'ai', `${who(s, cur)} (in Tokyo) hit all others for ${claws}.`)
    } else {
      // hit the Tokyo monster, if any
      if (tokyo != null && monsters[tokyo].alive) {
        const def = monsters[tokyo]
        def.health = Math.max(0, def.health - claws)
        if (def.health === 0) def.alive = false
        log = push(log, cur === 0 ? 'you' : 'ai', `${who(s, cur)} hit ${who(s, tokyo)} in Tokyo for ${claws}.`)
        if (!def.alive) {
          // Tokyo monster died → vacate; current player will enter below.
          def.inTokyo = false
          tokyo = null
        } else {
          // defender may yield
          pendingYield = { defender: tokyo, attacker: cur, damage: claws }
        }
      }
    }
  }

  // 5. Tokyo entry: if empty and the current player is alive & outside, they take it.
  //    Must enter if they rolled a claw; we also let them in if it's simply empty after
  //    a kill. (Core rule: a claw forces entry when empty.) We enter on empty regardless
  //    of claws only when there was a kill this turn; otherwise require a claw.
  if (tokyo == null && me.alive && !me.inTokyo) {
    const killedTokyo = claws > 0 && s.tokyoOccupant != null && !monsters[s.tokyoOccupant].alive
    if (claws > 0 || killedTokyo) {
      me.inTokyo = true
      me.vp += 1
      tokyo = cur
      log = push(log, cur === 0 ? 'you' : 'ai', `${who(s, cur)} entered Tokyo (+1 VP).`)
    }
  }

  let ns = Object.assign({}, s, {
    monsters,
    tokyoOccupant: tokyo,
    log,
    phase: 'resolved' as Phase,
    step: s.step + 1,
  })

  // winner?
  const w = findWinner(ns)
  if (w != null) {
    ns = Object.assign({}, ns, { winner: w, phase: 'over' as Phase, pendingYield: null })
    ns.log = push(ns.log, w === 0 ? 'you' : 'ai', `${who(ns, w)} wins!`)
    return ns
  }

  if (pendingYield && monsters[pendingYield.defender].alive) {
    ns = Object.assign({}, ns, { phase: 'yield' as Phase, pendingYield })
  }
  return ns
}

/** The Tokyo defender answers a yield prompt. yes = leave Tokyo (attacker enters). */
export function yieldTokyo(s: KotState, yes: boolean): KotState {
  if (s.phase !== 'yield' || !s.pendingYield) return s
  const { defender, attacker } = s.pendingYield
  const monsters = s.monsters.map(m => Object.assign({}, m))
  let tokyo = s.tokyoOccupant
  let log = s.log
  if (yes) {
    monsters[defender].inTokyo = false
    // attacker takes Tokyo (must be alive & outside)
    if (monsters[attacker].alive && !monsters[attacker].inTokyo) {
      monsters[attacker].inTokyo = true
      monsters[attacker].vp += 1
      tokyo = attacker
      log = push(log, attacker === 0 ? 'you' : 'ai', `${who(s, defender)} yielded Tokyo — ${who(s, attacker)} moved in (+1 VP).`)
    } else {
      tokyo = null
      log = push(log, 'sys', `${who(s, defender)} yielded Tokyo — it stands empty.`)
    }
  } else {
    log = push(log, defender === 0 ? 'you' : 'ai', `${who(s, defender)} held Tokyo.`)
  }
  let ns = Object.assign({}, s, {
    monsters,
    tokyoOccupant: tokyo,
    pendingYield: null,
    phase: 'resolved' as Phase,
    log,
    step: s.step + 1,
  })
  const w = findWinner(ns)
  if (w != null) ns = Object.assign({}, ns, { winner: w, phase: 'over' as Phase })
  return ns
}

/* ---- turn flow ---- */

function nextAlive(s: KotState, from: number): number {
  for (let k = 1; k <= NUM_MONSTERS; k++) {
    const cand = (from + k) % NUM_MONSTERS
    if (s.monsters[cand].alive) return cand
  }
  return from
}

/** End the current turn and advance to the next alive monster, applying the
    start-of-turn +2 VP for whoever holds Tokyo at that point. */
export function endTurn(s: KotState): KotState {
  if (s.winner != null) return s
  if (s.phase === 'yield') return s // must resolve yield first
  let nt = nextAlive(s, s.turn)
  const monsters = s.monsters.map(m => Object.assign({}, m))
  let log = s.log
  // start-of-turn Tokyo VP for the NEW current player if they hold Tokyo
  if (s.tokyoOccupant != null && s.tokyoOccupant === nt && monsters[nt].alive) {
    monsters[nt].vp += 2
    log = push(log, nt === 0 ? 'you' : 'ai', `${who(s, nt)} holds Tokyo at turn start (+2 VP).`)
  }
  let ns = Object.assign({}, s, {
    monsters,
    turn: nt,
    dice: [1, 1, 1, 1, 1, 1] as Face[],
    kept: [false, false, false, false, false, false],
    rerollsLeft: 3,
    rolled: false,
    phase: 'roll' as Phase,
    pendingYield: null,
    log,
    step: s.step + 1,
  })
  const w = findWinner(ns)
  if (w != null) ns = Object.assign({}, ns, { winner: w, phase: 'over' as Phase })
  return ns
}

/* ===== AI ===== */

/** Decide which dice the AI keeps for its current roll. Returns a kept[] array. */
export function aiKeep(s: KotState): boolean[] {
  const cur = s.turn
  const me = s.monsters[cur]
  const dice = s.dice
  const kept = dice.map(() => false)
  const enemyInTokyo = s.tokyoOccupant != null && s.tokyoOccupant !== cur
  const lowHealth = me.health <= 4

  // keep number sets (and pairs that could become sets)
  const numCount: Record<number, number> = { 1: 0, 2: 0, 3: 0 }
  for (const d of dice) if (d === 1 || d === 2 || d === 3) numCount[d]++
  for (let i = 0; i < dice.length; i++) {
    const d = dice[i]
    if (d === 1 || d === 2 || d === 3) {
      // keep the best number group (>=2 of a kind), prefer 3s
      if (numCount[d] >= 2) kept[i] = true
    } else if (d === 'claw') {
      // keep claws when an enemy is in Tokyo (or to take an empty Tokyo)
      if (enemyInTokyo || s.tokyoOccupant == null || me.inTokyo) kept[i] = true
    } else if (d === 'heart') {
      if (lowHealth && !me.inTokyo) kept[i] = true
    } else if (d === 'energy') {
      // mild value; keep if nothing better going on
      if (!enemyInTokyo && !lowHealth) kept[i] = true
    }
  }
  return kept
}

/** Should the AI defender yield Tokyo? Yields when low or when staying is lethal-ish. */
export function aiShouldYield(s: KotState): boolean {
  if (!s.pendingYield) return false
  const def = s.monsters[s.pendingYield.defender]
  // yield if dropping low on health; hold if healthy (Tokyo gives VP)
  return def.health <= 5
}

/** Run the current AI player's ENTIRE turn to completion (used by tests/self-play).
    The UI instead steps via aiStep() so each sub-action animates. */
export function aiTurn(s: KotState): KotState {
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
export function aiStep(s: KotState): KotState {
  if (s.winner != null) return s

  // 1. A yield decision is pending — answer it (any AI defender; the player answers their own).
  if (s.phase === 'yield' && s.pendingYield) {
    const def = s.pendingYield.defender
    if (def !== 0) return yieldTokyo(s, aiShouldYield(s))
    return s // human's yield — UI handles it
  }

  if (s.turn === 0) return s // not an AI turn

  // 2. Mid-roll: keep dice then reroll, or stop early.
  if (s.phase === 'roll') {
    if (!s.rolled) return rollDice(s) // first roll
    if (s.rerollsLeft > 0) {
      const kept = aiKeep(s)
      // if everything worth keeping is kept, resolve instead of wasting rolls
      const allKept = kept.every(Boolean)
      if (allKept) return resolveDice(s)
      const withKeep = Object.assign({}, s, { kept })
      return rollDice(withKeep)
    }
    return resolveDice(s)
  }

  // 3. Resolved — end the turn.
  if (s.phase === 'resolved') return endTurn(s)

  return s
}
