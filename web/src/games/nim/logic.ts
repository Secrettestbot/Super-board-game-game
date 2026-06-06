/* NIM — logic + AI (built for this codebase, not ported).
   Three heaps [3,4,5]. Players alternate; on a turn you remove one or more tokens
   from a single heap. NORMAL play: whoever takes the LAST token wins.
   You move first. The AI plays perfectly using the nim-sum (XOR of heap sizes):
   from a winning position it moves to make the XOR zero; from a losing position
   (XOR already 0) it stalls by taking one from the largest heap. */

export type Player = 'you' | 'ai'
export interface LogEntry { t: string; x: string }

export interface NimState {
  heaps: number[]          // tokens remaining per heap
  turn: Player | null
  winner: Player | null
  last: { heap: number; count: number } | null  // most recent removal
  log: LogEntry[]
}

export const HEAP_LABELS = ['A', 'B', 'C']
const START = [3, 4, 5]

const other = (p: Player): Player => p === 'you' ? 'ai' : 'you'
function push(log: LogEntry[], t: string, x: string) { return log.concat([{ t, x }]).slice(-24) }

export function makeGame(): NimState {
  return {
    heaps: START.slice(),
    turn: 'you',
    winner: null,
    last: null,
    log: [{ t: 'sys', x: 'You move first. Take any number of tokens from a single heap — taking the last token wins.' }],
  }
}

export function empty(heaps: number[]): boolean {
  return heaps.every(h => h === 0)
}

export function nimSum(heaps: number[]): number {
  return heaps.reduce((a, b) => a ^ b, 0)
}

// remove `count` tokens from `heap` for player `who`
export function take(s: NimState, heap: number, count: number, who: Player): NimState {
  if (s.winner || s.turn !== who) return s
  if (heap < 0 || heap >= s.heaps.length) return s
  if (count < 1 || count > s.heaps[heap]) return s
  const heaps = s.heaps.slice()
  heaps[heap] -= count
  const name = who === 'you' ? 'You' : 'Rival'
  const noun = count === 1 ? 'token' : 'tokens'
  let log = push(s.log, who === 'you' ? 'you' : 'ai', `${name} took ${count} ${noun} from heap ${HEAP_LABELS[heap]}.`)
  if (empty(heaps)) {
    log = push(log, who === 'you' ? 'you' : 'ai', `${name} took the last token — ${who === 'you' ? 'you win' : 'rival wins'}.`)
    return Object.assign({}, s, { heaps, turn: null, winner: who, last: { heap, count }, log })
  }
  return Object.assign({}, s, { heaps, turn: other(who), last: { heap, count }, log })
}

// ===== AI: perfect play via nim-sum =====
export function aiMove(s: NimState): NimState {
  if (s.winner || s.turn !== 'ai') return s
  const heaps = s.heaps
  const ns = nimSum(heaps)
  if (ns !== 0) {
    // winning position: drive nim-sum to zero
    for (let h = 0; h < heaps.length; h++) {
      const target = heaps[h] ^ ns
      if (target < heaps[h]) return take(s, h, heaps[h] - target, 'ai')
    }
  }
  // losing position (or fallback): take one from the largest heap
  let big = -1
  for (let h = 0; h < heaps.length; h++) if (heaps[h] > 0 && (big < 0 || heaps[h] > heaps[big])) big = h
  if (big < 0) return s
  return take(s, big, 1, 'ai')
}
