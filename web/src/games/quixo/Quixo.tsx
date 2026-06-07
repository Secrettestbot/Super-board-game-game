/* QUIXO — UI (built for this codebase). A 5x5 grid of cubes on the framework shell, vs an
   alpha-beta AI. Click a takeable border cube (blank or yours), then pick a slide direction —
   the cube slides home from the chosen end. Line up five of your symbol to win. You are X. */

import { useState } from 'react'
import { GameShell } from '../../framework/GameShell'
import { Modal } from '../../framework/Modal'
import { useGameKeys } from '../../framework/useGameKeys'
import { OnlineBar } from '../../framework/OnlineBar'
import { useGameSession } from '../../net/useGameSession'
import { quixoAdapter } from './net'
import * as Q from './logic'
import type { Dir, Move, Mark, Player } from './logic'

const TITLE_MARK = (
  <svg className="title-mark" viewBox="0 0 48 48" aria-hidden="true">
    <rect x="3" y="3" width="42" height="42" rx="10" fill="#16202e" stroke="#2c4a63" strokeWidth="1.5" />
    <rect x="9" y="9" width="13" height="13" rx="3" fill="#3a5a74" />
    <rect x="26" y="9" width="13" height="13" rx="3" fill="#3a5a74" />
    <rect x="9" y="26" width="13" height="13" rx="3" fill="#3a5a74" />
    <rect x="26" y="26" width="13" height="13" rx="3" fill="#46c7b0" />
    <path d="M30 30 l6 6 M36 30 l-6 6" stroke="#0c1620" strokeWidth="2.2" strokeLinecap="round" />
  </svg>
)

const DIR_LABEL: Record<Dir, string> = { up: '↑ up', down: '↓ down', left: '← left', right: '→ right' }

function CubeFace({ v }: { v: Q.Mark }) {
  if (v === 1) return (
    <svg className="qx-glyph x" viewBox="0 0 32 32" aria-hidden="true">
      <path d="M8 8 L24 24 M24 8 L8 24" stroke="currentColor" strokeWidth="4.5" strokeLinecap="round" />
    </svg>
  )
  if (v === -1) return (
    <svg className="qx-glyph o" viewBox="0 0 32 32" aria-hidden="true">
      <circle cx="16" cy="16" r="9" fill="none" stroke="currentColor" strokeWidth="4.5" />
    </svg>
  )
  return null
}

export function Quixo() {
  const { state: s, mySeat, isMyTurn, dispatch, newGame: netNew, net } = useGameSession(quixoAdapter)
  const [showRules, setShowRules] = useState(false)
  const [sel, setSel] = useState<number | null>(null)   // selected cube awaiting a direction

  // seat 0 = 'you' (X, mark 1), seat 1 = 'ai' (O, mark -1)
  const myPlayer: Player = mySeat === 0 ? 'you' : 'ai'
  const myMark: Mark = mySeat === 0 ? 1 : -1
  const oppMark: Mark = mySeat === 0 ? -1 : 1
  const oppLabel = net.online ? 'Opponent' : 'Rival'

  function newGame() { netNew(); setSel(null); setShowRules(false) }

  const yourTurn = s.winner == null && isMyTurn
  const oppTurn = s.winner == null && !isMyTurn

  // legal moves for me when it's my turn, grouped by cube. legalMoves keys off s.turn,
  // which equals my player whenever it's my turn — so this is exactly my move set.
  const legal: Move[] = yourTurn ? Q.legalMoves(s) : []
  const takeable = new Set(legal.map(m => m.cell))
  const selDirs: Dir[] = sel != null ? legal.filter(m => m.cell === sel).map(m => m.dir) : []

  function clickCube(i: number) {
    if (!yourTurn) return
    if (!takeable.has(i)) return
    setSel(prev => (prev === i ? null : i))
  }
  function pickDir(d: Dir) {
    if (sel == null) return
    dispatch({ cell: sel, dir: d })
    setSel(null)
  }

  useGameKeys({
    onNew: newGame,
    onToggleRules: () => setShowRules(v => !v),
    onEscape: () => { if (sel != null) setSel(null); else setShowRules(false) },
  })

  const iWon = s.winner === myPlayer

  let banner: string, bk = ''
  if (s.winner === 'you' || s.winner === 'ai') {
    if (iWon) { bk = 'win'; banner = 'You win — five in a row!' }
    else { bk = 'lose'; banner = `${oppLabel} lined up five` }
  }
  else if (s.winner === 'draw') { bk = 'foe'; banner = 'A draw' }
  else if (yourTurn) {
    bk = 'you'
    banner = sel == null ? 'Take a border cube (blank or yours)' : 'Choose an end to slide it in from'
  } else { bk = 'foe'; banner = `${oppLabel} is choosing a cube…` }

  // counts from my perspective: "mine" = my mark, "opp" = opponent's mark
  const counts = (() => {
    let mine = 0, opp = 0
    for (const v of s.board) { if (v === myMark) mine++; else if (v === oppMark) opp++ }
    return { mine, opp }
  })()

  // winning line (for highlight) once decided
  const winLine = (() => {
    if (s.winner == null || s.winner === 'draw') return new Set<number>()
    const want: Mark = s.winner === 'you' ? 1 : -1
    for (const line of Q.LINES) if (line.every(i => s.board[i] === want)) return new Set(line)
    return new Set<number>()
  })()

  return (
    <>
      <GameShell
        mark={TITLE_MARK}
        eyebrow="Quixo · slide & line up five"
        title="Quixo"
        subtitle="take a cube from the rim, slide it home, and build an unbroken line of five before the rival does"
        onRules={() => setShowRules(true)}
        onNew={newGame}
        modeLeft={<>You <b>{counts.mine}</b> · {oppLabel} <b>{counts.opp}</b></>}
        banner={banner}
        bannerClass={bk}
        modeRight={<>click cube · pick end &nbsp; Esc · cancel &nbsp; N · new</>}
      >
        <div className="qx-wrap">
          <div className={'qx-board' + (sel != null ? ' picking' : '')}>
            {s.board.map((v, i) => {
              const can = takeable.has(i)
              const isSel = sel === i
              const isLast = s.last?.to === i
              const inWin = winLine.has(i)
              const cls =
                'qx-cube'
                + (v === 1 ? ' x' : v === -1 ? ' o' : ' blank')
                + (Q.isBorder(i) ? ' border' : ' inner')
                + (can ? ' takeable' : '')
                + (isSel ? ' sel' : '')
                + (isLast ? ' last' : '')
                + (inWin ? ' win' : '')
              return (
                <button key={i} className={cls} onClick={() => clickCube(i)} disabled={!yourTurn || !can}>
                  <CubeFace v={v} />
                </button>
              )
            })}
          </div>
        </div>

        <div className="side">
          <div className="panel">
            <OnlineBar net={net} />
          </div>
          <div className="panel qx-score">
            <div className={'qx-row' + (yourTurn ? ' on' : '')}>
              <span className={'qx-chip ' + (myMark === 1 ? 'x' : 'o')}><CubeFace v={myMark} /></span>
              <span className="qx-who">You ({myMark === 1 ? 'X' : 'O'})</span>
              <span className="qx-num">{counts.mine}</span>
            </div>
            <div className={'qx-row' + (oppTurn ? ' on' : '')}>
              <span className={'qx-chip ' + (oppMark === 1 ? 'x' : 'o')}><CubeFace v={oppMark} /></span>
              <span className="qx-who">{oppLabel} ({oppMark === 1 ? 'X' : 'O'})</span>
              <span className="qx-num">{counts.opp}</span>
            </div>
          </div>

          <div className="panel qx-control">
            <div className="qx-pl">slide direction</div>
            {sel == null ? (
              <div className="qx-hint">
                {yourTurn ? 'Pick a highlighted cube on the rim, then choose which end it slides in from.'
                  : oppTurn ? `Watching ${oppLabel.toLowerCase()}…` : 'Game over — start a new game.'}
              </div>
            ) : (
              <div className="qx-dirs">
                {(['up', 'down', 'left', 'right'] as Dir[]).map(d => {
                  const ok = selDirs.includes(d)
                  return (
                    <button key={d} className={'qx-dir' + (ok ? '' : ' off')} disabled={!ok}
                      onClick={ok ? () => pickDir(d) : undefined}>
                      {DIR_LABEL[d]}
                    </button>
                  )
                })}
                <button className="qx-dir cancel" onClick={() => setSel(null)}>cancel</button>
              </div>
            )}
          </div>

          <div className="panel logbox">
            {s.log.slice().reverse().map((l, i) => <div key={i} className={'log-line ' + l.t}>{l.x}</div>)}
          </div>
        </div>
      </GameShell>

      {s.winner != null && <ResultModal winner={s.winner} won={iWon} oppLabel={oppLabel} onNew={newGame} />}
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </>
  )
}

function ResultModal({ winner, won, oppLabel, onNew }: { winner: 'you' | 'ai' | 'draw'; won: boolean; oppLabel: string; onNew: () => void }) {
  const draw = winner === 'draw'
  return (
    <Modal
      eyebrow={draw ? 'No line' : won ? 'Line of five' : 'Out-slid'}
      title={draw ? 'Draw' : won ? 'You Win' : `${oppLabel} Wins`}
      closeOnOverlay={false}
      actions={<button className="btn-modal" onClick={onNew}>Play again</button>}
    >
      <div className="finalsc">
        {draw ? <span>A rare deadlock — no five in a row.</span>
          : won ? <span className="you">Five of your cubes in an unbroken line.</span>
          : <span className="foe">{oppLabel} completed a line of five first.</span>}
      </div>
    </Modal>
  )
}

function RulesModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal eyebrow="How to play" title="Quixo" onClose={onClose}
      actions={<button className="btn-modal" onClick={onClose}>Got it</button>}>
      <div className="modal-body">
        <p>The board is a <b>5×5 grid of cubes</b>. You play <b>X</b> and move first; the rival plays <b>O</b>.</p>
        <p>On your turn, <b>take one cube from the outer rim</b> (the 16 border cells) that is either <b>blank</b> or <b>already yours</b> — you may not take a rival cube. The cube becomes your symbol.</p>
        <p>Then <b>slide it back into the grid</b> from one of the available ends of its row or column. Every cube in that line shifts toward the vacated end and your cube goes in at the far end. You can't push it straight back into the same spot it came from.</p>
        <p>First to make an unbroken <b>line of five</b> — row, column, or diagonal — of their own symbol <b>wins</b>. If a single move completes a line for <i>both</i> players, the player who did <b>not</b> move wins.</p>
        <p><b>Keys:</b> <kbd>N</kbd> new game · <kbd>?</kbd> rules · <kbd>Esc</kbd> cancel selection / close.</p>
      </div>
    </Modal>
  )
}
