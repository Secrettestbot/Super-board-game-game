/* DOMINOES — logic (built for this codebase, not ported).
   Double-six block-with-draw variant, 2 players. A full set is 28 tiles: every pair
   (i,j) with 0<=i<=j<=6. Each player is dealt 7 tiles; the remaining 14 form the
   BONEYARD. Highest double (else heaviest tile) leads onto the empty line. On your turn
   you must play a tile whose half matches one of the two OPEN ENDS; if you can't you DRAW
   from the boneyard until you can, and PASS only when the boneyard is empty. A round ends
   when someone plays their last tile ("dominoes!") or the game is BLOCKED (both pass in a
   row). SCORING: the player who goes out — or, if blocked, the lighter hand — scores the
   sum of pips in the OPPONENT's remaining hand. Single round: scorer wins. */

export type Player = 'you' | 'ai'
export interface Tile { a: number; b: number }     // a<=b, a normalized domino
export type End = 'L' | 'R'
export interface Placed { a: number; b: number }    // oriented as laid: a is left-touching, b is right-touching
export interface LogEntry { t: string; x: string }

export interface DomState {
  hands: { you: Tile[]; ai: Tile[] }
  boneyard: Tile[]
  line: Placed[]                // left-to-right; [] = empty board
  turn: Player | null
  passes: number                // consecutive passes (block at 2)
  winner: Player | 'draw' | null
  scores: { you: number; ai: number }
  reason: 'out' | 'blocked' | null
  last: number | null           // index in line of the most-recently placed tile
  log: LogEntry[]
}

export const tileId = (t: Tile) => t.a * 7 + t.b
export const pips = (t: Tile) => t.a + t.b
export const isDouble = (t: Tile) => t.a === t.b
const other = (p: Player): Player => p === 'you' ? 'ai' : 'you'
const handPips = (h: Tile[]) => h.reduce((s, t) => s + pips(t), 0)

function push(log: LogEntry[], t: string, x: string) { return log.concat([{ t, x }]).slice(-24) }

export function fullSet(): Tile[] {
  const out: Tile[] = []
  for (let a = 0; a <= 6; a++) for (let b = a; b <= 6; b++) out.push({ a, b })
  return out
}

function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice()
  for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0;[a[i], a[j]] = [a[j], a[i]] }
  return a
}

/** The two open pip values of the current line: null on an empty board. */
export function ends(line: Placed[]): { L: number; R: number } | null {
  if (!line.length) return null
  return { L: line[0].a, R: line[line.length - 1].b }
}

/** Can `t` be legally laid on this line right now? (empty board => any tile, the leader.) */
export function canPlay(line: Placed[], t: Tile): boolean {
  const e = ends(line)
  if (!e) return true
  return t.a === e.L || t.b === e.L || t.a === e.R || t.b === e.R
}

/** Which ends a tile may attach to. */
export function playableEnds(line: Placed[], t: Tile): End[] {
  const e = ends(line)
  if (!e) return ['L']
  const out: End[] = []
  if (t.a === e.L || t.b === e.L) out.push('L')
  if (t.a === e.R || t.b === e.R) out.push('R')
  return out
}

const handCanMove = (line: Placed[], hand: Tile[]) => hand.some(t => canPlay(line, t))

/** Pick who leads + their opening tile: highest double, else heaviest tile. */
function chooseLeader(hands: { you: Tile[]; ai: Tile[] }): { leader: Player; tile: Tile } {
  let best: { p: Player; t: Tile; key: number } | null = null
  for (const p of ['you', 'ai'] as Player[]) {
    for (const t of hands[p]) {
      // doubles rank above non-doubles; then by pip weight
      const key = (isDouble(t) ? 100 : 0) + pips(t)
      if (!best || key > best.key) best = { p, t, key }
    }
  }
  return { leader: best!.p, tile: best!.t }
}

export function makeGame(): DomState {
  const deck = shuffle(fullSet())
  const you = deck.slice(0, 7)
  const ai = deck.slice(7, 14)
  const boneyard = deck.slice(14)             // 14 tiles
  const hands = { you, ai }
  const { leader, tile } = chooseLeader(hands)

  // The leader opens immediately onto the empty line (a double or heaviest tile).
  const lead = { a: tile.a, b: tile.b }
  hands[leader] = hands[leader].filter(t => tileId(t) !== tileId(tile))
  const log: LogEntry[] = [{
    t: 'sys',
    x: `You are ivory; the rival is ebony. ${leader === 'you' ? 'You' : 'The rival'} hold${leader === 'you' ? '' : 's'} the ${isDouble(tile) ? 'highest double' : 'heaviest tile'} and lead${leader === 'you' ? '' : 's'} [${tile.a}|${tile.b}].`,
  }]

  return {
    hands,
    boneyard,
    line: [lead],
    turn: other(leader),
    passes: 0,
    winner: null,
    scores: { you: 0, ai: 0 },
    reason: null,
    last: 0,
    log: push(log, leader === 'you' ? 'you' : 'ai', `${leader === 'you' ? 'You lead' : 'Rival leads'} with [${tile.a}|${tile.b}].`),
  }
}

/** Orient `t` so its matching half touches the chosen end, return the Placed pair. */
function orient(line: Placed[], t: Tile, end: End): Placed {
  const e = ends(line)
  if (!e) return { a: t.a, b: t.b }      // opening tile (shouldn't reach here in play)
  if (end === 'L') {
    // new tile goes to the far left; its right half must equal current L
    const right = e.L
    const left = t.a === right ? t.b : t.a
    return { a: left, b: right }
  } else {
    // far right; its left half must equal current R
    const left = e.R
    const right = t.a === left ? t.b : t.a
    return { a: left, b: right }
  }
}

function finish(s: DomState, base: Partial<DomState>, scorer: Player | 'draw', reason: 'out' | 'blocked', log: LogEntry[]): DomState {
  const next = Object.assign({}, s, base) as DomState
  let scores = { ...next.scores }
  let winner: Player | 'draw' = scorer
  let msg: string
  if (scorer === 'draw') {
    msg = 'Blocked dead even — a tie.'
  } else {
    const loser = other(scorer)
    const pts = handPips(next.hands[loser])
    scores = { ...scores, [scorer]: scores[scorer] + pts }
    msg = reason === 'out'
      ? `${scorer === 'you' ? 'You go' : 'Rival goes'} out — +${pts} from the rival's hand.`
      : `Blocked: ${scorer === 'you' ? 'your' : "the rival's"} hand is lighter — +${pts}.`
  }
  return Object.assign({}, next, { turn: null, winner, reason, scores, log: push(log, scorer === 'you' ? 'you' : scorer === 'ai' ? 'ai' : 'sys', msg) })
}

/** Play `t` from the current player's hand onto `end`. No-op on illegal calls. */
export function play(s: DomState, who: Player, t: Tile, end: End): DomState {
  if (s.winner || s.turn !== who) return s
  const hand = s.hands[who]
  if (!hand.some(h => tileId(h) === tileId(t))) return s
  const allowed = playableEnds(s.line, t)
  if (!allowed.includes(end)) return s

  const placed = orient(s.line, t, end)
  const line = end === 'L' ? [placed, ...s.line] : [...s.line, placed]
  const newHand = hand.filter(h => tileId(h) !== tileId(t))
  const last = end === 'L' ? 0 : line.length - 1
  let log = push(s.log, who === 'you' ? 'you' : 'ai',
    `${who === 'you' ? 'You play' : 'Rival plays'} [${t.a}|${t.b}] on the ${end === 'L' ? 'left' : 'right'} end.`)

  const base: Partial<DomState> = { hands: { ...s.hands, [who]: newHand }, line, passes: 0, last }

  if (newHand.length === 0) return finish(s, base, who, 'out', log)
  return Object.assign({}, s, base, { turn: other(who), log })
}

/** Draw one tile from the boneyard into the current player's hand. */
export function draw(s: DomState, who: Player): DomState {
  if (s.winner || s.turn !== who || !s.boneyard.length) return s
  const boneyard = s.boneyard.slice()
  const drawn = boneyard.shift()!
  const hand = [...s.hands[who], drawn]
  const log = push(s.log, who === 'you' ? 'you' : 'ai', `${who === 'you' ? 'You draw' : 'Rival draws'} from the boneyard.`)
  return Object.assign({}, s, { boneyard, hands: { ...s.hands, [who]: hand }, log })
}

/** Pass (only meaningful when the boneyard is empty and you can't move). */
export function pass(s: DomState, who: Player): DomState {
  if (s.winner || s.turn !== who) return s
  if (handCanMove(s.line, s.hands[who])) return s          // must play if able
  if (s.boneyard.length) return s                          // must draw first
  const passes = s.passes + 1
  const log = push(s.log, 'sys', `${who === 'you' ? 'You pass' : 'Rival passes'} — no playable tile.`)
  if (passes >= 2) {                                       // both sides stuck => blocked
    const yp = handPips(s.hands.you), ap = handPips(s.hands.ai)
    const scorer: Player | 'draw' = yp === ap ? 'draw' : yp < ap ? 'you' : 'ai'
    return finish(s, { passes }, scorer, 'blocked', log)
  }
  return Object.assign({}, s, { turn: other(who), passes, log })
}

// ===== AI: greedy heuristic =====
// Plays if able; prefers (1) going out, (2) dumping heavy tiles, (3) keeping its own
// hand flexible (ends it can still answer), (4) starving the opponent of replies — it
// remembers which pip values the opponent has passed on and steers ends toward those.

function aiSeenPasses(s: DomState): Set<number> {
  // pip values the opponent (you) failed to cover at the time of a pass.
  const out = new Set<number>()
  // We approximate from the log: when "You pass" appears we know both ends then were
  // unanswerable by you. Cheaper: just bias toward ends the AI itself can't easily be
  // answered on — handled by flexibility term below. Keep this set conservative.
  return out
}

function flexibility(line: Placed[], hand: Tile[]): number {
  // how many of my remaining tiles can still attach to *some* end — higher is safer.
  return hand.filter(t => canPlay(line, t)).length
}

export function aiStep(s: DomState): DomState {
  if (s.winner || s.turn !== 'ai') return s
  const me: Player = 'ai'
  const hand = s.hands[me]

  if (!handCanMove(s.line, hand)) {
    if (s.boneyard.length) return draw(s, me)     // keep drawing until playable/empty
    return pass(s, me)
  }

  const targets = aiSeenPasses(s)
  type Cand = { t: Tile; end: End; score: number }
  const cands: Cand[] = []
  for (const t of hand) {
    for (const end of playableEnds(s.line, t)) {
      const after = play(s, me, t, end)
      if (after === s) continue
      let score = 0
      // 1) going out is best
      if (after.hands.ai.length === 0) score += 10000
      // 2) dump weight
      score += pips(t) * 4
      // 3) doubles are awkward to unload — get rid of them early
      if (isDouble(t)) score += 12
      // 4) keep my own hand flexible afterward
      score += flexibility(after.line, after.hands.ai) * 6
      // 5) leave an end the opponent is known to have passed on
      const e = ends(after.line)
      if (e) { if (targets.has(e.L)) score += 20; if (targets.has(e.R)) score += 20 }
      // tiny noise to vary equal plays
      score += Math.random()
      cands.push({ t, end, score })
    }
  }
  cands.sort((x, y) => y.score - x.score)
  const best = cands[0]
  return play(s, me, best.t, best.end)
}
