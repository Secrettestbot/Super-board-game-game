/* SUDOKU — logic (built for this codebase, solitaire / no AI).
   Standard 9x9. We GENERATE a fully-solved valid grid by seeding the canonical base
   pattern (a sliding-block Latin-square construction) then shuffling rows within bands,
   columns within stacks, the band/stack order, and finally relabelling the digits — all
   transforms that preserve Sudoku validity. We then DIG holes down to a difficulty target
   to make the puzzle, keeping the full solution for checking, hints and win detection. */

export const N = 9
export const BOX = 3
export type Difficulty = 'easy' | 'medium' | 'hard'
export type Cell = number   // 0 = empty, 1..9 = a digit

export const GIVENS: Record<Difficulty, number> = { easy: 40, medium: 32, hard: 26 }
export const DIFF_LABEL: Record<Difficulty, string> = { easy: 'Easy', medium: 'Medium', hard: 'Hard' }

export interface SudokuState {
  solution: Cell[]       // length 81, the full valid solution
  given: boolean[]       // length 81, true where the cell is a locked clue
  board: Cell[]          // length 81, current grid (givens + player entries), 0 = empty
  selected: number | null
  difficulty: Difficulty
  solved: boolean
}

export const rc = (i: number) => ({ r: Math.floor(i / N), c: i % N })
export const idx = (r: number, c: number) => r * N + c

// ---- helpers -------------------------------------------------------------
function shuffle<T>(a: T[]): T[] {
  const out = a.slice()
  for (let i = out.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

// ---- (1) generate a fully-solved valid grid ------------------------------
export function generateSolution(): Cell[] {
  // Canonical base pattern: a valid completed grid via the sliding-block formula.
  const pattern = (r: number, c: number) => (BOX * (r % BOX) + Math.floor(r / BOX) + c) % N
  // Shuffle the structural choices that preserve validity.
  const bands = shuffle([0, 1, 2])                 // order of the 3 row-bands
  const stacks = shuffle([0, 1, 2])                // order of the 3 col-stacks
  const rowsIn = [shuffle([0, 1, 2]), shuffle([0, 1, 2]), shuffle([0, 1, 2])]   // rows within each band
  const colsIn = [shuffle([0, 1, 2]), shuffle([0, 1, 2]), shuffle([0, 1, 2])]   // cols within each stack
  const digits = shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9])   // relabel 0..8 -> 1..9

  const rowOrder: number[] = []
  for (const b of bands) for (const r of rowsIn[b]) rowOrder.push(b * BOX + r)
  const colOrder: number[] = []
  for (const s of stacks) for (const c of colsIn[s]) colOrder.push(s * BOX + c)

  const grid: Cell[] = new Array(N * N).fill(0)
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      const srcR = rowOrder[r], srcC = colOrder[c]
      grid[idx(r, c)] = digits[pattern(srcR, srcC)]
    }
  }
  return grid
}

// ---- (2) dig holes to make a puzzle of a difficulty ----------------------
export function makeGame(difficulty: Difficulty = 'easy'): SudokuState {
  const solution = generateSolution()
  const targetGivens = GIVENS[difficulty]
  const holes = N * N - targetGivens

  const given = new Array(N * N).fill(true)
  // Remove cells in a random order until we hit the hole target.
  const order = shuffle(Array.from({ length: N * N }, (_, i) => i))
  let removed = 0
  for (const i of order) {
    if (removed >= holes) break
    given[i] = false
    removed++
  }

  const board: Cell[] = solution.map((v, i) => (given[i] ? v : 0))
  return { solution, given, board, selected: null, difficulty, solved: false }
}

// ---- validity of a completed grid ----------------------------------------
function groupOk(values: Cell[]): boolean {
  if (values.length !== N) return false
  const seen = new Set<number>()
  for (const v of values) {
    if (v < 1 || v > N || seen.has(v)) return false
    seen.add(v)
  }
  return true
}

export function isValidSolution(grid: Cell[]): boolean {
  for (let r = 0; r < N; r++) {
    const row: Cell[] = [], col: Cell[] = []
    for (let c = 0; c < N; c++) { row.push(grid[idx(r, c)]); col.push(grid[idx(c, r)]) }
    if (!groupOk(row) || !groupOk(col)) return false
  }
  for (let br = 0; br < N; br += BOX) {
    for (let bc = 0; bc < N; bc += BOX) {
      const box: Cell[] = []
      for (let r = 0; r < BOX; r++) for (let c = 0; c < BOX; c++) box.push(grid[idx(br + r, bc + c)])
      if (!groupOk(box)) return false
    }
  }
  return true
}

// ---- conflict detection: does the value at i clash in its row/col/box? ----
// (ignores empties; only compares filled cells)
export function isConflict(board: Cell[], i: number): boolean {
  const v = board[i]
  if (!v) return false
  const { r, c } = rc(i)
  for (let k = 0; k < N; k++) {
    const rowJ = idx(r, k)
    if (rowJ !== i && board[rowJ] === v) return true
    const colJ = idx(k, c)
    if (colJ !== i && board[colJ] === v) return true
  }
  const br = Math.floor(r / BOX) * BOX, bc = Math.floor(c / BOX) * BOX
  for (let dr = 0; dr < BOX; dr++) {
    for (let dc = 0; dc < BOX; dc++) {
      const j = idx(br + dr, bc + dc)
      if (j !== i && board[j] === v) return true
    }
  }
  return false
}

// set of all cell indices that are in conflict
export function conflicts(board: Cell[]): Set<number> {
  const out = new Set<number>()
  for (let i = 0; i < N * N; i++) if (isConflict(board, i)) out.add(i)
  return out
}

export function countGivens(given: boolean[]): number {
  return given.reduce((n, g) => n + (g ? 1 : 0), 0)
}

export function filledCount(board: Cell[]): number {
  return board.reduce((n, v) => n + (v ? 1 : 0), 0)
}

// ---- detection of a complete, correct solve ------------------------------
export function isSolved(board: Cell[], solution: Cell[]): boolean {
  for (let i = 0; i < N * N; i++) if (board[i] !== solution[i]) return false
  return true
}

// ===== player actions =====================================================
export function select(s: SudokuState, i: number | null): SudokuState {
  if (i !== null && s.given[i]) return Object.assign({}, s, { selected: null })
  return Object.assign({}, s, { selected: i })
}

export function setCell(s: SudokuState, i: number, value: Cell): SudokuState {
  if (s.solved || s.given[i] || value < 0 || value > N) return s
  const board = s.board.slice()
  board[i] = value
  const solved = isSolved(board, s.solution)
  return Object.assign({}, s, { board, solved })
}

// fill the selected (or given) cell from the solution
export function hint(s: SudokuState, i: number | null): SudokuState {
  const cell = i ?? s.selected
  if (cell === null || s.given[cell] || s.solved) return s
  return setCell(s, cell, s.solution[cell])
}

// place into the currently-selected cell
export function fillSelected(s: SudokuState, value: Cell): SudokuState {
  if (s.selected === null) return s
  return setCell(s, s.selected, value)
}
