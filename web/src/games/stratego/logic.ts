/* STRATEGO — pure logic (built for this codebase, not ported).
   8x8 reduced board. You are player 0 (bottom rows 6 & 7); the AI is player 1 (top rows 0 & 1).
   Each side has 16 pieces hidden on its back two rows. Two central lake squares are impassable.

   RANK CONVENTION: higher value beats lower value.
     MARSHAL 10 (highest mobile) · GENERAL 9 · COLONEL 8 · MAJOR 7 · CAPTAIN 6 ·
     LIEUTENANT 5 · SERGEANT 4 · MINER 3 · SCOUT 2 · SPY 1.
   Special, non-numeric pieces use sentinel rank values:
     BOMB  = RANK_BOMB (immovable; destroys any attacker EXCEPT a Miner, which defuses it)
     FLAG  = RANK_FLAG (immovable; capturing it wins the game)
   Special combat:
     SPY (1) attacking the MARSHAL (10) wins; the spy loses to everything else (and a
       marshal that attacks a spy still wins).
     MINER (3) attacking (or being attacked by) a BOMB wins and removes the bomb; any other
       attacker dies to a bomb (bomb survives).
   Movement: one square orthogonally; a SCOUT (2) slides any distance in a straight line over
     empty squares and may strike an enemy at the end of the slide. BOMB & FLAG never move.
   Win: capture the enemy FLAG, or leave the opponent with no movable pieces.

   The AI (player 1) only ever reads REVEALED enemy ranks + a per-piece belief distribution it
   maintains from movement (a piece that has moved cannot be a Bomb or Flag) and from combats it
   has observed. It never inspects your hidden ranks. */

export const N = 8

export type Player = 0 | 1

// Sentinel ranks for the immobile specials. Kept well outside the 1..10 mobile range.
export const RANK_FLAG = 0
export const RANK_BOMB = 11

export interface Piece {
  rank: number          // 1..10 mobile, RANK_FLAG, or RANK_BOMB
  owner: Player
  revealed: boolean     // has this piece been exposed in combat (visible to both sides)?
  moved: boolean        // has it ever moved (proves it is neither Bomb nor Flag)?
  id: number            // stable identity for belief tracking
}

export type Lake = 'lake'
export type Cell = Piece | Lake | null

export interface Move { from: number; to: number }

export interface Captured { rank: number; owner: Player }

export interface LogEntry { t: 'you' | 'ai' | 'sys'; x: string }

// The AI's belief about one of YOUR (player 0) hidden pieces: a weight per possible rank.
export interface Belief { weights: Record<number, number> }

export interface StrategoState {
  board: Cell[]                      // length 64, index = r*N + c
  turn: Player | null                // whose move; null when finished
  you: Player                        // always 0
  winner: Player | null
  captured: Captured[]               // every removed piece, in order
  last: Move | null                  // last move (for highlight)
  reveal: { from: number; to: number; atk: number; def: number; result: 'atk' | 'def' | 'both' | 'bomb' | 'flag' } | null
  belief: Record<number, Belief>     // AI belief over player-0 pieces, keyed by piece id
  log: LogEntry[]
}

export const isLake = (c: Cell): c is Lake => c === 'lake'
export const isPiece = (c: Cell): c is Piece => c != null && c !== 'lake'

const idx = (r: number, c: number) => r * N + c
const rowOf = (i: number) => Math.floor(i / N)
const colOf = (i: number) => i % N
const other = (p: Player): Player => (p === 0 ? 1 : 0)

// Lake squares: two 1x1 lakes in the central band (rows 3 & 4), columns 2 and 5.
const LAKES = [idx(3, 2), idx(3, 5), idx(4, 2), idx(4, 5)]

export const RANK_NAME: Record<number, string> = {
  10: 'Marshal', 9: 'General', 8: 'Colonel', 7: 'Major', 6: 'Captain',
  5: 'Lieutenant', 4: 'Sergeant', 3: 'Miner', 2: 'Scout', 1: 'Spy',
  [RANK_BOMB]: 'Bomb', [RANK_FLAG]: 'Flag',
}

export const RANK_SHORT: Record<number, string> = {
  10: '10', 9: '9', 8: '8', 7: '7', 6: '6', 5: '5', 4: '4',
  3: '3', 2: '2', 1: 'S', [RANK_BOMB]: 'B', [RANK_FLAG]: 'F',
}

// One army = 16 pieces (fills two rows of 8 on an 8-wide board).
export const ARMY: number[] = [
  RANK_FLAG,
  RANK_BOMB, RANK_BOMB,
  10, 9, 8, 7, 6, 5, 4,
  3, 3,
  2, 2, 2,
  1,
]

// Ranks the AI must spread belief over — the mobile + special composition of YOUR army.
const BELIEF_RANKS = ARMY.slice()

function push(log: LogEntry[], t: LogEntry['t'], x: string): LogEntry[] {
  return log.concat([{ t, x }]).slice(-26)
}

function coord(i: number): string {
  return `${'abcdefgh'[colOf(i)]}${N - rowOf(i)}`
}

// ---- deterministic / seeded shuffle so tests are reproducible -------------------------------
function mulberry32(seed: number) {
  let a = seed >>> 0
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function shuffled<T>(arr: T[], rnd: () => number): T[] {
  const a = arr.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = (rnd() * (i + 1)) | 0
    const t = a[i]; a[i] = a[j]; a[j] = t
  }
  return a
}

/** Build a setup for one side that keeps the Flag in the back corner-ish and bombs nearby. */
function placeArmy(board: Cell[], owner: Player, rows: [number, number], ids: { n: number }, rnd: () => number) {
  const cells: number[] = []
  for (const r of rows) for (let c = 0; c < N; c++) cells.push(idx(r, c))
  // Back row is the one farther from the centre.
  const backRow = owner === 0 ? Math.max(rows[0], rows[1]) : Math.min(rows[0], rows[1])

  const army = ARMY.slice()
  // Reserve flag + protect with the two bombs.
  const flagPos = idx(backRow, rnd() < 0.5 ? 0 : N - 1)
  const flag = { rank: RANK_FLAG, owner, revealed: false, moved: false, id: ids.n++ }
  board[flagPos] = flag
  removeOne(army, RANK_FLAG)

  // Place two bombs adjacent to the flag where possible.
  const guard = neighbours(flagPos).filter(i => cells.includes(i) && board[i] == null)
  const gshuf = shuffled(guard, rnd)
  let bombsLeft = 2
  for (const g of gshuf) {
    if (bombsLeft <= 0) break
    board[g] = { rank: RANK_BOMB, owner, revealed: false, moved: false, id: ids.n++ }
    removeOne(army, RANK_BOMB); bombsLeft--
  }

  // Fill the rest randomly.
  const rest = shuffled(army, rnd)
  const open = shuffled(cells.filter(i => board[i] == null), rnd)
  let k = 0
  for (const rank of rest) {
    board[open[k++]] = { rank, owner, revealed: false, moved: false, id: ids.n++ }
  }
}

function removeOne(arr: number[], v: number) {
  const i = arr.indexOf(v)
  if (i >= 0) arr.splice(i, 1)
}

function neighbours(i: number): number[] {
  const r = rowOf(i), c = colOf(i)
  const out: number[] = []
  if (r > 0) out.push(idx(r - 1, c))
  if (r < N - 1) out.push(idx(r + 1, c))
  if (c > 0) out.push(idx(r, c - 1))
  if (c < N - 1) out.push(idx(r, c + 1))
  return out
}

/** Initial belief: uniform over the multiset of your army ranks. */
function freshBelief(): Belief {
  const weights: Record<number, number> = {}
  for (const r of BELIEF_RANKS) weights[r] = (weights[r] ?? 0) + 1
  return { weights }
}

export interface SetupOptions {
  seed?: number
  /** Force the deterministic seeded placement (used by tests). */
}

export function makeGame(opts: SetupOptions = {}): StrategoState {
  const seed = opts.seed ?? ((Math.random() * 1e9) | 0)
  const rnd = mulberry32(seed)
  const board: Cell[] = new Array(N * N).fill(null)
  for (const l of LAKES) board[l] = 'lake'

  const ids = { n: 1 }
  placeArmy(board, 1, [0, 1], ids, rnd)   // AI top
  placeArmy(board, 0, [6, 7], ids, rnd)   // you bottom

  // AI belief over every player-0 piece.
  const belief: Record<number, Belief> = {}
  for (const c of board) if (isPiece(c) && c.owner === 0) belief[c.id] = freshBelief()

  return {
    board,
    turn: 0,
    you: 0,
    winner: null,
    captured: [],
    last: null,
    reveal: null,
    belief,
    log: [{ t: 'sys', x: 'Armies deployed. Your ranks are visible to you; the enemy is face-down until combat reveals it.' }],
  }
}

const isMobile = (rank: number) => rank !== RANK_FLAG && rank !== RANK_BOMB

/** All legal moves for `player`. */
export function legalMoves(s: StrategoState, player: Player): Move[] {
  const out: Move[] = []
  for (let i = 0; i < N * N; i++) {
    const cell = s.board[i]
    if (!isPiece(cell) || cell.owner !== player || !isMobile(cell.rank)) continue
    const r = rowOf(i), c = colOf(i)
    const isScout = cell.rank === 2
    const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]]
    for (const [dr, dc] of dirs) {
      let nr = r + dr, nc = c + dc
      while (nr >= 0 && nr < N && nc >= 0 && nc < N) {
        const t = s.board[idx(nr, nc)]
        if (isLake(t)) break
        if (t == null) {
          out.push({ from: i, to: idx(nr, nc) })
        } else {
          // enemy piece — may strike it; cannot pass through or hit own piece
          if (isPiece(t) && t.owner !== player) out.push({ from: i, to: idx(nr, nc) })
          break
        }
        if (!isScout) break          // non-scouts move exactly one square
        nr += dr; nc += dc
      }
    }
  }
  return out
}

function rankLabel(rank: number): string {
  return RANK_NAME[rank] ?? String(rank)
}

/** Resolve an attack of attacker(atk) onto defender(def). Returns who survives. */
function resolveCombat(atk: Piece, def: Piece): 'atk' | 'def' | 'both' | 'bomb' | 'flag' {
  if (def.rank === RANK_FLAG) return 'flag'        // attacker captures the flag
  if (def.rank === RANK_BOMB) return atk.rank === 3 ? 'atk' : 'bomb' // miner defuses, else dies
  // Spy / Marshal special: spy attacking marshal wins.
  if (atk.rank === 1 && def.rank === 10) return 'atk'
  if (atk.rank === def.rank) return 'both'
  return atk.rank > def.rank ? 'atk' : 'def'
}

function movableCount(s: StrategoState, player: Player): number {
  return legalMoves(s, player).length
}

function finish(s: Partial<StrategoState> & { board: Cell[]; log: LogEntry[] }, base: StrategoState, winner: Player): StrategoState {
  const youWon = winner === base.you
  return Object.assign({}, base, s, {
    turn: null,
    winner,
    log: push(s.log, youWon ? 'you' : 'ai', youWon ? 'You captured the enemy flag — victory!' : 'Your flag has fallen. The enemy wins.'),
  })
}

/** Update the AI's belief about a player-0 piece after it MOVED (so it's mobile). */
function beliefAfterMove(belief: Record<number, Belief>, piece: Piece): Record<number, Belief> {
  if (piece.owner !== 0) return belief
  const b = belief[piece.id]
  if (!b) return belief
  const weights = { ...b.weights }
  // A piece that moved cannot be a Bomb or Flag.
  weights[RANK_BOMB] = 0
  weights[RANK_FLAG] = 0
  return { ...belief, [piece.id]: { weights } }
}

/** Once a player-0 piece is revealed, belief collapses to certainty. */
function beliefReveal(belief: Record<number, Belief>, piece: Piece): Record<number, Belief> {
  if (piece.owner !== 0) return belief
  return { ...belief, [piece.id]: { weights: { [piece.rank]: 1 } } }
}

export function move(s: StrategoState, player: Player, from: number, to: number): StrategoState {
  if (s.winner != null || s.turn !== player) return s
  if (!legalMoves(s, player).some(m => m.from === from && m.to === to)) return s

  const board = s.board.slice()
  const mover = board[from]
  if (!isPiece(mover)) return s
  const target = board[to]
  const me = player === s.you ? 'you' : 'ai'
  let belief = s.belief
  let captured = s.captured
  let reveal: StrategoState['reveal'] = null

  // mark mover as having moved (mobility info), update belief if it's yours
  const movedPiece: Piece = { ...mover, moved: true }
  belief = beliefAfterMove(belief, movedPiece)

  let log = s.log

  if (target == null) {
    // simple relocation
    board[from] = null
    board[to] = movedPiece
    log = push(log, me, `${me === 'you' ? 'You' : 'Enemy'} moved ${coord(from)}→${coord(to)}.`)
  } else if (isPiece(target)) {
    // combat — both pieces reveal
    const atk = movedPiece
    const def = target
    const result = resolveCombat(atk, def)
    reveal = { from, to, atk: atk.rank, def: def.rank, result }

    // reveal collapses belief for whichever piece is yours
    const atkR: Piece = { ...atk, revealed: true }
    const defR: Piece = { ...def, revealed: true }
    belief = beliefReveal(belief, atkR)
    belief = beliefReveal(belief, defR)

    if (result === 'flag') {
      board[from] = null
      board[to] = atkR
      captured = captured.concat([{ rank: def.rank, owner: def.owner }])
      log = push(log, me, `${me === 'you' ? 'You' : 'Enemy'} ${rankLabel(atk.rank)} stormed the flag at ${coord(to)}!`)
      return finish({ board, captured, last: { from, to }, reveal, belief, log }, s, player)
    }
    if (result === 'atk') {
      board[from] = null
      board[to] = atkR
      captured = captured.concat([{ rank: def.rank, owner: def.owner }])
      log = push(log, me, `${rankLabel(atk.rank)} defeated ${rankLabel(def.rank)} at ${coord(to)}.`)
    } else if (result === 'def') {
      // attacker dies, defender stays (revealed)
      board[from] = null
      board[to] = defR
      captured = captured.concat([{ rank: atk.rank, owner: atk.owner }])
      log = push(log, me, `${rankLabel(atk.rank)} fell to ${rankLabel(def.rank)} at ${coord(to)}.`)
    } else if (result === 'bomb') {
      // attacker dies, bomb stays (revealed)
      board[from] = null
      board[to] = defR
      captured = captured.concat([{ rank: atk.rank, owner: atk.owner }])
      log = push(log, me, `${rankLabel(atk.rank)} hit a Bomb at ${coord(to)} and was destroyed.`)
    } else if (result === 'both') {
      board[from] = null
      board[to] = null
      captured = captured.concat([{ rank: atk.rank, owner: atk.owner }, { rank: def.rank, owner: def.owner }])
      log = push(log, me, `Both ${rankLabel(atk.rank)}s were lost in a clash at ${coord(to)}.`)
    }
  }

  // win checks for the opponent of `player`
  const opp = other(player)
  let next: StrategoState = Object.assign({}, s, {
    board, turn: opp, captured, last: { from, to }, reveal, belief, log,
  })

  // opponent flag gone?
  if (!hasFlag(board, opp)) return finish({ board, captured, last: { from, to }, reveal, belief, log }, s, player)
  // opponent has no movable piece?
  if (movableCount(next, opp) === 0) {
    log = push(log, 'sys', `${opp === s.you ? 'You have' : 'The enemy has'} no movable pieces left.`)
    return finish({ board, captured, last: { from, to }, reveal, belief, log }, s, player)
  }
  next = Object.assign({}, next, { log })
  return next
}

function hasFlag(board: Cell[], owner: Player): boolean {
  for (const c of board) if (isPiece(c) && c.owner === owner && c.rank === RANK_FLAG) return true
  return false
}

export function counts(board: Cell[]): { you: number; ai: number } {
  let you = 0, ai = 0
  for (const c of board) if (isPiece(c)) { if (c.owner === 0) you++; else ai++ }
  return { you, ai }
}

// =====================================================================================
// AI (player 1) — belief-based heuristic. Uses ONLY: its own piece ranks, your revealed
// ranks, your pieces' moved/!moved status, and the maintained belief distribution.
// =====================================================================================

/** Expected rank the AI ascribes to one of YOUR pieces (for risk estimates). */
function expectedRank(s: StrategoState, piece: Piece): number {
  if (piece.revealed) return piece.rank
  const b = s.belief[piece.id]
  if (!b) return 5
  let num = 0, den = 0
  for (const k in b.weights) {
    const w = b.weights[k]
    if (w <= 0) continue
    const r = Number(k)
    // treat bomb as "deadly to non-miners" — use a high effective value for averaging risk
    const eff = r === RANK_BOMB ? 10.5 : r === RANK_FLAG ? 0 : r
    num += eff * w; den += w
  }
  return den > 0 ? num / den : 5
}

/** Probability (per belief) that YOUR piece is a Bomb. */
function bombProb(s: StrategoState, piece: Piece): number {
  if (piece.revealed) return piece.rank === RANK_BOMB ? 1 : 0
  const b = s.belief[piece.id]
  if (!b) return 0
  let total = 0
  for (const k in b.weights) total += Math.max(0, b.weights[k])
  if (total <= 0) return 0
  return Math.max(0, b.weights[RANK_BOMB] ?? 0) / total
}

/** Score an AI attack onto one of your pieces; higher is better, can be negative. */
function scoreAttack(s: StrategoState, atk: Piece, def: Piece): number {
  // Revealed defender → exact resolution.
  if (def.revealed) {
    const r = resolveCombat(atk, def)
    if (r === 'flag') return 1e6
    if (r === 'atk') return 40 + valueOf(def.rank)
    if (r === 'both') return valueOf(def.rank) - valueOf(atk.rank)
    return -60 - valueOf(atk.rank)   // we lose (def / bomb)
  }
  // Unknown defender → expectation over belief.
  const exp = expectedRank(s, def)
  const pb = bombProb(s, def)
  let score = 0
  // chance we win vs an average mobile piece
  if (atk.rank === 3) {
    // miner: bombs are great targets
    score += pb * (50)
  } else {
    score -= pb * (55 + valueOf(atk.rank))   // hitting a likely bomb is bad for non-miners
  }
  const mobileExp = exp // already blended
  if (atk.rank >= mobileExp) score += 12 + (atk.rank - mobileExp) * 3
  else score -= 18 + (mobileExp - atk.rank) * 4
  // A defender that has NOT moved is more likely flag/bomb — only attack with cheap/miner.
  if (!def.moved) {
    if (atk.rank === 3) score += 10
    else score -= valueOf(atk.rank) * 0.4
  }
  return score
}

function valueOf(rank: number): number {
  if (rank === RANK_FLAG) return 1000
  if (rank === RANK_BOMB) return 12
  if (rank === 1) return 13      // spy is precious (kills marshal)
  return rank
}

/** Rough danger: would moving to `to` expose the mover to a stronger adjacent enemy next turn? */
function dangerAt(s: StrategoState, board: Cell[], to: number, mover: Piece): number {
  let worst = 0
  for (const nb of neighbours(to)) {
    const c = board[nb]
    if (!isPiece(c) || c.owner === mover.owner) continue
    // an adjacent enemy could attack us next turn
    const exp = c.revealed ? c.rank : expectedRank(s, c)
    if (exp > mover.rank) worst = Math.max(worst, (exp - mover.rank))
  }
  return worst
}

export function aiMove(s: StrategoState): StrategoState {
  if (s.winner != null || s.turn !== 1) return s
  const me: Player = 1
  const moves = legalMoves(s, me)
  if (!moves.length) return s

  let best = -Infinity
  const scored: { m: Move; v: number }[] = []
  for (const m of moves) {
    const mover = s.board[m.from]
    const target = s.board[m.to]
    if (!isPiece(mover)) continue
    let v = 0
    if (isPiece(target)) {
      v += scoreAttack(s, mover, target)
    } else {
      // positional: advance toward the enemy home, scouts probe, keep big pieces safer
      const toR = rowOf(m.to), fromR = rowOf(m.from)
      v += (toR - fromR) * 1.4                 // AI advances downward (increasing row)
      if (mover.rank === 2) v += 2.2           // scouts roam to gather info
      // central files slightly preferred
      v += (3.5 - Math.abs(colOf(m.to) - 3.5)) * 0.2
      // don't shove the marshal/general forward recklessly early
      if (mover.rank >= 9) v -= 1.5
    }
    // subtract danger of the destination
    const after = s.board.slice()
    after[m.from] = null
    after[m.to] = { ...mover, moved: true }
    v -= dangerAt(s, after, m.to, mover) * 2.0
    v += Math.random() * 0.6                   // tie-break / variety
    scored.push({ m, v })
    if (v > best) best = v
  }
  if (!scored.length) return s
  const top = scored.filter(o => o.v >= best - 1e-6)
  const choice = top[(Math.random() * top.length) | 0].m
  return move(s, me, choice.from, choice.to)
}
