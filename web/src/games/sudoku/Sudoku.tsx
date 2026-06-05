/* SUDOKU — UI (built for this codebase, solitaire / no AI). A crisp newspaper-puzzle
   9x9 grid on the framework shell: bold 3x3 box rules, serif givens, conflict cells in
   red, row/col/box highlight on selection, a 1-9 number pad, difficulty selector,
   hint button and a running timer. Win when the grid matches the stored solution. */

import { useEffect, useMemo, useState } from 'react'
import { GameShell } from '../../framework/GameShell'
import { Modal } from '../../framework/Modal'
import { useGameKeys } from '../../framework/useGameKeys'
import * as SK from './logic'
import type { SudokuState, Difficulty } from './logic'

const { N, BOX } = SK
const DIFFS: Difficulty[] = ['easy', 'medium', 'hard']

const TITLE_MARK = (
  <svg className="title-mark" viewBox="0 0 48 48" aria-hidden="true">
    <rect x="3" y="3" width="42" height="42" rx="7" fill="#f7f3e8" stroke="#cfc6ad" strokeWidth="1.5" />
    <path d="M19 4 V44 M33 4 V44 M4 19 H44 M4 33 H44" stroke="#cfc6ad" strokeWidth="1" />
    <path d="M19 4 V44 M33 4 V44 M4 19 H44 M4 33 H44" stroke="#3a3525" strokeWidth="0" />
    <text x="11" y="16" fontFamily="Spectral, serif" fontSize="11" fill="#23201a">5</text>
    <text x="25" y="30" fontFamily="Spectral, serif" fontSize="11" fill="#23201a">9</text>
    <text x="11" y="44" fontFamily="Spectral, serif" fontSize="11" fill="#23201a">3</text>
  </svg>
)

function fmtTime(sec: number): string {
  const m = Math.floor(sec / 60), s = sec % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

export function Sudoku() {
  const [s, setS] = useState<SudokuState>(() => SK.makeGame('easy'))
  const [showRules, setShowRules] = useState(false)
  const [showWin, setShowWin] = useState(false)
  const [seconds, setSeconds] = useState(0)

  function newGame(diff: Difficulty = s.difficulty) {
    setS(SK.makeGame(diff))
    setSeconds(0)
    setShowRules(false)
    setShowWin(false)
  }

  // running timer (stops on solve)
  useEffect(() => {
    if (s.solved) return
    const id = setInterval(() => setSeconds(n => n + 1), 1000)
    return () => clearInterval(id)
  }, [s.solved])

  // surface the win modal once
  useEffect(() => { if (s.solved) setShowWin(true) }, [s.solved])

  function fill(v: number) { setS(p => SK.fillSelected(p, v)) }

  useGameKeys({
    onNew: () => newGame(),
    onToggleRules: () => setShowRules(v => !v),
    onEscape: () => { setShowRules(false); setS(p => SK.select(p, null)) },
    extra: (e) => {
      if (s.selected === null || s.solved) return false
      if (e.key >= '1' && e.key <= '9') { fill(Number(e.key)); return true }
      if (e.key === '0' || e.key === 'Backspace' || e.key === 'Delete') { fill(0); return true }
      return false
    },
  })

  const conflictSet = useMemo(() => SK.conflicts(s.board), [s.board])
  const filled = SK.filledCount(s.board)
  const remaining = N * N - filled
  const sel = s.selected
  const selRC = sel !== null ? SK.rc(sel) : null
  const selVal = sel !== null ? s.board[sel] : 0

  // count of each digit already placed (for number-pad "done" styling)
  const digitCounts = useMemo(() => {
    const counts = new Array(N + 1).fill(0)
    for (const v of s.board) if (v) counts[v]++
    return counts
  }, [s.board])

  function clickCell(i: number) {
    if (s.solved) return
    setS(SK.select(s, i))
  }

  function peerOf(i: number): boolean {
    if (!selRC) return false
    const { r, c } = SK.rc(i)
    const sameBox = Math.floor(r / BOX) === Math.floor(selRC.r / BOX) && Math.floor(c / BOX) === Math.floor(selRC.c / BOX)
    return r === selRC.r || c === selRC.c || sameBox
  }

  let banner: string, bk = ''
  if (s.solved) { bk = 'win'; banner = `Solved in ${fmtTime(seconds)}` }
  else if (conflictSet.size) { bk = 'lose'; banner = 'Conflicts on the grid — fix the red cells' }
  else if (sel !== null) { bk = 'you'; banner = 'Type 1–9 to fill · 0 to clear' }
  else { bk = 'you'; banner = 'Pick a cell to begin' }

  return (
    <>
      <GameShell
        mark={TITLE_MARK}
        eyebrow="Sudoku · fill the grid"
        title="Sudoku"
        subtitle="each row, column and 3×3 box holds 1 through 9 exactly once"
        onRules={() => setShowRules(true)}
        onNew={() => newGame()}
        modeLeft={SK.DIFF_LABEL[s.difficulty]}
        banner={banner}
        bannerClass={bk}
        modeRight={<>1–9 · fill &nbsp; N · new &nbsp; ? · rules</>}
      >
        <div className="sk-wrap">
          <div className="sk-grid">
            {s.board.map((v, i) => {
              const { r, c } = SK.rc(i)
              const cls = ['sk-cell']
              if (s.given[i]) cls.push('given')
              if (i === sel) cls.push('sel')
              else if (peerOf(i)) cls.push('peer')
              if (conflictSet.has(i)) cls.push('conflict')
              if (v && selVal && v === selVal) cls.push('same')
              if (c % BOX === 0 && c !== 0) cls.push('bl')
              if (r % BOX === 0 && r !== 0) cls.push('bt')
              return (
                <div key={i} className={cls.join(' ')} onClick={() => clickCell(i)}>
                  {v !== 0 ? v : ''}
                </div>
              )
            })}
          </div>
        </div>

        <div className="side">
          <div className="panel sk-diffs">
            <div className="panel-l">Difficulty · new puzzle</div>
            <div className="sk-diff-row">
              {DIFFS.map(d => (
                <button
                  key={d}
                  className={'sk-diff' + (s.difficulty === d ? ' on' : '')}
                  onClick={() => newGame(d)}
                >
                  {SK.DIFF_LABEL[d]}
                </button>
              ))}
            </div>
          </div>

          <div className="panel sk-padbox">
            <div className="panel-l">Number pad</div>
            <div className="sk-pad">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => (
                <button
                  key={n}
                  className={'sk-key' + (digitCounts[n] >= N ? ' done' : '')}
                  disabled={sel === null || s.solved}
                  onClick={() => fill(n)}
                >
                  {n}
                </button>
              ))}
              <button
                className="sk-key sk-clear"
                disabled={sel === null || s.solved}
                onClick={() => fill(0)}
              >
                ⌫
              </button>
              <button
                className="sk-key sk-hint"
                disabled={sel === null || s.given[sel ?? 0] || s.solved}
                onClick={() => setS(p => SK.hint(p, null))}
              >
                Hint
              </button>
            </div>
          </div>

          <div className="panel sk-stats">
            <div className="sk-stat"><span className="sk-stat-l">Time</span><span className="sk-stat-v mono">{fmtTime(seconds)}</span></div>
            <div className="sk-stat"><span className="sk-stat-l">Remaining</span><span className="sk-stat-v">{remaining}</span></div>
            <div className="sk-stat"><span className="sk-stat-l">Conflicts</span><span className={'sk-stat-v' + (conflictSet.size ? ' warn' : '')}>{conflictSet.size}</span></div>
          </div>
        </div>
      </GameShell>

      {showWin && s.solved && <WinModal seconds={seconds} difficulty={s.difficulty} onNew={() => newGame()} onClose={() => setShowWin(false)} />}
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </>
  )
}

function WinModal({ seconds, difficulty, onNew, onClose }: { seconds: number; difficulty: Difficulty; onNew: () => void; onClose: () => void }) {
  return (
    <Modal
      eyebrow="Puzzle complete"
      title="Solved!"
      closeOnOverlay={true}
      onClose={onClose}
      actions={<button className="btn-modal" onClick={onNew}>New Game</button>}
    >
      <div className="sk-final">
        <span className="you">{SK.DIFF_LABEL[difficulty]}</span>
        <span className="foe">{fmtTime(seconds)}</span>
      </div>
      <div className="modal-body"><p>Every row, column and 3×3 box holds 1 through 9 exactly once. Nicely done.</p></div>
    </Modal>
  )
}

function RulesModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal eyebrow="How to play" title="Sudoku" onClose={onClose}
      actions={<button className="btn-modal" onClick={onClose}>Begin</button>}>
      <div className="modal-body">
        <p>Fill the 9×9 grid so that <b>each row</b>, <b>each column</b>, and <b>each 3×3 box</b> contains the digits <b>1 through 9 exactly once</b>.</p>
        <p>The <b>printed</b> clue numbers are fixed. Click any empty cell, then type a digit <b>1–9</b> or tap the number pad to fill it. A number that repeats in its row, column, or box is shown in <i>red</i> — clear it with <b>0</b> or <b>⌫</b>.</p>
        <p>Stuck? The <b>Hint</b> button fills the selected cell from the solution. Switch <b>Easy / Medium / Hard</b> to deal a fresh puzzle.</p>
        <p><b>Keys:</b> <kbd>1</kbd>–<kbd>9</kbd> fill · <kbd>0</kbd>/<kbd>⌫</kbd> clear · <kbd>N</kbd> new · <kbd>?</kbd> rules · <kbd>Esc</kbd> deselect.</p>
      </div>
    </Modal>
  )
}
