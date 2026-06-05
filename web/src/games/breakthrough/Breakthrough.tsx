/* BREAKTHROUGH — UI (built for this codebase). 8x8 two-tone board on the framework shell,
   vs an alpha-beta minimax AI. Click a pawn to see its legal steps & diagonal captures;
   reach the far row to break through. */

import { useMemo, useState } from 'react'
import { GameShell } from '../../framework/GameShell'
import { Modal } from '../../framework/Modal'
import { useAITurn } from '../../framework/useAITurn'
import { useGameKeys } from '../../framework/useGameKeys'
import * as BT from './logic'
import type { BreakthroughState, Move } from './logic'

const { N } = BT

const TITLE_MARK = (
  <svg className="title-mark" viewBox="0 0 48 48" aria-hidden="true">
    <rect x="3" y="3" width="42" height="42" rx="9" fill="#1b2740" stroke="#3a4f7a" strokeWidth="1.5" />
    <circle cx="16" cy="32" r="6" fill="#eef2fb" stroke="#b6c0d8" strokeWidth="0.5" />
    <circle cx="32" cy="16" r="6" fill="#1a2030" stroke="#000" strokeWidth="0.5" />
    <path d="M24 33 L24 16 M19 21 L24 15 L29 21" stroke="#7fd0ff" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

export function Breakthrough() {
  const [s, setS] = useState<BreakthroughState>(() => BT.makeGame())
  const [showRules, setShowRules] = useState(false)
  const [sel, setSel] = useState<number | null>(null)

  function newGame() { setS(BT.makeGame()); setSel(null); setShowRules(false) }

  useAITurn(!s.winner && s.turn === 'b', () => setS(p => BT.aiMove(p)), { delayMs: 520 })
  useGameKeys({
    onNew: newGame,
    onToggleRules: () => setShowRules(v => !v),
    onEscape: () => { if (showRules) setShowRules(false); else setSel(null) },
  })

  const yourTurn = !s.winner && s.turn === 'w'
  const myMoves = useMemo(() => yourTurn ? BT.legalMoves(s.board, 'w') : [], [yourTurn, s.board])
  const dests = useMemo(() => {
    const map = new Map<number, Move>()
    if (sel !== null) for (const m of myMoves) if (m.from === sel) map.set(m.to, m)
    return map
  }, [myMoves, sel])
  const movable = useMemo(() => new Set(myMoves.map(m => m.from)), [myMoves])
  const { w, b } = BT.counts(s.board)

  function clickCell(i: number) {
    if (!yourTurn) return
    const m = dests.get(i)
    if (m) { setS(BT.move(s, m, 'w')); setSel(null); return }
    if (s.board[i] === 'w' && movable.has(i)) { setSel(i === sel ? null : i); return }
    setSel(null)
  }

  let banner: string, bk = ''
  if (s.winner === 'w') { bk = 'win'; banner = 'You broke through — you win!' }
  else if (s.winner === 'b') { bk = 'lose'; banner = 'The rival broke through' }
  else if (yourTurn) { bk = 'you'; banner = sel === null ? 'Your turn — pick a pawn' : 'Choose where to advance' }
  else { bk = 'foe'; banner = 'The rival is thinking…' }

  return (
    <>
      <GameShell
        mark={TITLE_MARK}
        eyebrow="Breakthrough · race the line"
        title="Breakthrough"
        subtitle="march a pawn to the far rank — capture only on the diagonals, never head-on"
        onRules={() => setShowRules(true)}
        onNew={newGame}
        modeLeft="8 × 8"
        banner={banner}
        bannerClass={bk}
        modeRight={<>N · new &nbsp; ? · rules</>}
      >
        <div className="bt-wrap">
          <div className="bt-board">
            {s.board.map((v, i) => {
              const isDark = ((Math.floor(i / N) + (i % N)) % 2) === 1
              const dest = dests.get(i)
              const cls = 'bt-cell' + (isDark ? ' dark' : ' light')
                + (sel === i ? ' sel' : '')
                + (dest ? (dest.cap ? ' cap' : ' move') : '')
                + (s.last && (s.last.from === i || s.last.to === i) ? ' last' : '')
              return (
                <div key={i} className={cls} onClick={() => clickCell(i)}>
                  {v && <div className={'bt-pawn ' + v + (movable.has(i) && yourTurn ? ' live' : '')} />}
                  {!v && dest && <div className="bt-dot" />}
                  {v && dest && dest.cap && <div className="bt-ring" />}
                </div>
              )
            })}
          </div>
        </div>

        <div className="side">
          <div className="panel scoreboard">
            <div className={'sc b' + (s.turn === 'b' && !s.winner ? ' on' : '')}><span className="sc-pawn b"></span><span className="sc-name">Rival · Black</span><span className="sc-n">{b}</span></div>
            <div className={'sc w' + (s.turn === 'w' && !s.winner ? ' on' : '')}><span className="sc-pawn w"></span><span className="sc-name">You · White</span><span className="sc-n">{w}</span></div>
          </div>
          <div className="panel logbox">{s.log.slice().reverse().map((l, i) => <div key={i} className={'log-line ' + l.t}>{l.x}</div>)}</div>
        </div>
      </GameShell>

      {s.winner && <ResultModal s={s} w={w} b={b} onNew={newGame} />}
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </>
  )
}

function ResultModal({ s, w, b, onNew }: { s: BreakthroughState; w: number; b: number; onNew: () => void }) {
  const won = s.winner === 'w'
  return (
    <Modal
      eyebrow={won ? 'Line broken' : 'Outrun'}
      title={won ? 'You Win' : 'Rival Wins'}
      closeOnOverlay={false}
      actions={<button className="btn-modal" onClick={onNew}>Play again</button>}
    >
      <div className="finalsc"><span className="you">You {w}</span><span className="foe">Rival {b}</span></div>
    </Modal>
  )
}

function RulesModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal eyebrow="How to play" title="Breakthrough" onClose={onClose}
      actions={<button className="btn-modal" onClick={onClose}>Begin</button>}>
      <div className="modal-body">
        <p>You are <b>White</b> at the bottom and move <i>up</i>. A pawn steps one square <b>straight- or diagonally-forward</b> onto an empty square.</p>
        <p>You may <b>capture only on the diagonals</b> — landing on an enemy pawn one step forward-left or forward-right and removing it. You can <b>never</b> capture straight ahead, and there is no double move.</p>
        <p>The first player to land a pawn on the <b>far home row</b> wins instantly. You also win if the rival has no pieces or no legal move.</p>
        <p><b>Keys:</b> <kbd>N</kbd> new game · <kbd>?</kbd> rules · <kbd>Esc</kbd> deselect / close.</p>
      </div>
    </Modal>
  )
}
