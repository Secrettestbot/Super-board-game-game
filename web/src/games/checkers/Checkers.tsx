/* CHECKERS / ENGLISH DRAUGHTS — UI (built for this codebase). Hardwood 8x8 board on the
   framework shell, glossy red & black discs, vs a minimax alpha-beta AI. Click a piece to
   see its legal landings; captures are forced and multi-jumps resolve in one move. */

import { useMemo, useState } from 'react'
import { GameShell } from '../../framework/GameShell'
import { Modal } from '../../framework/Modal'
import { useAITurn } from '../../framework/useAITurn'
import { useGameKeys } from '../../framework/useGameKeys'
import * as CK from './logic'
import type { CheckersState, Move } from './logic'

const { N } = CK

const TITLE_MARK = (
  <svg className="title-mark" viewBox="0 0 48 48" aria-hidden="true">
    <rect x="3" y="3" width="42" height="42" rx="9" fill="#3a2417" stroke="#6b4427" strokeWidth="1.5" />
    <rect x="3" y="3" width="21" height="21" fill="#caa06a" />
    <rect x="24" y="24" width="21" height="21" fill="#caa06a" />
    <circle cx="16" cy="32" r="7" fill="#cf3030" stroke="#7e1414" strokeWidth="1" />
    <circle cx="32" cy="16" r="7" fill="#23262b" stroke="#000" strokeWidth="1" />
  </svg>
)

export function Checkers() {
  const [s, setS] = useState<CheckersState>(() => CK.makeGame())
  const [sel, setSel] = useState<number | null>(null)
  const [showRules, setShowRules] = useState(false)

  function newGame() { setS(CK.makeGame()); setSel(null); setShowRules(false) }

  useAITurn(!s.winner && s.turn === 'b', () => setS(p => CK.aiMove(p)), { delayMs: 520 })
  useGameKeys({
    onNew: newGame,
    onToggleRules: () => setShowRules(v => !v),
    onEscape: () => { if (showRules) setShowRules(false); else setSel(null) },
  })

  const yourTurn = !s.winner && s.turn === 'r'

  // all legal moves for the human this turn, and which source squares can move
  const legal = useMemo(() => (yourTurn ? CK.legalMoves(s.board, 'r') : []), [yourTurn, s.board])
  const movableFrom = useMemo(() => new Set(legal.map(m => m.from)), [legal])
  // landings (and capture squares) for the currently selected piece
  const selMoves = useMemo<Move[]>(() => (sel == null ? [] : legal.filter(m => m.from === sel)), [sel, legal])
  const targets = useMemo(() => new Set(selMoves.map(m => m.to)), [selMoves])

  const c = CK.counts(s.board)

  function clickCell(i: number) {
    if (!yourTurn) return
    const p = s.board[i]
    // selecting one of your movable pieces
    if ((p === 'r' || p === 'R') && movableFrom.has(i)) {
      setSel(i === sel ? null : i)
      return
    }
    // moving to a highlighted target
    if (sel != null && targets.has(i)) {
      const m = selMoves.find(mv => mv.to === i)!
      setS(CK.move(s, m, 'r'))
      setSel(null)
    }
  }

  let banner: string, bk = ''
  if (s.winner === 'r') { bk = 'win'; banner = 'You win — the board is yours' }
  else if (s.winner === 'b') { bk = 'lose'; banner = 'The rival wins this one' }
  else if (yourTurn) { bk = 'you'; banner = movableFrom.size ? 'Your turn — move a red disc' : 'Your turn' }
  else { bk = 'foe'; banner = 'The rival is thinking…' }

  const lastSet = s.last ? new Set([s.last.from, s.last.to]) : new Set<number>()

  return (
    <>
      <GameShell
        mark={TITLE_MARK}
        eyebrow="Checkers · jump &amp; crown"
        title="Checkers"
        subtitle="march your men up the dark squares, force the jumps, and crown a king"
        onRules={() => setShowRules(true)}
        onNew={newGame}
        modeLeft="8 × 8 · draughts"
        banner={banner}
        bannerClass={bk}
        modeRight={<>N · new &nbsp; ? · rules</>}
      >
        <div className="ck-wrap">
          <div className="ck-board">
            {s.board.map((p, i) => {
              const dark = (Math.floor(i / N) + (i % N)) % 2 === 1
              const cls =
                'ck-cell ' + (dark ? 'dark' : 'light') +
                (i === sel ? ' sel' : '') +
                (targets.has(i) ? ' target' : '') +
                (lastSet.has(i) ? ' last' : '')
              const pickable = yourTurn && ((p === 'r' || p === 'R') && movableFrom.has(i) || targets.has(i))
              return (
                <div key={i} className={cls + (pickable ? ' pick' : '')} onClick={() => clickCell(i)}>
                  {p && (
                    <div className={'ck-disc ' + (p === 'r' || p === 'R' ? 'r' : 'b')}>
                      {(p === 'R' || p === 'B') && <span className="ck-crown" />}
                    </div>
                  )}
                  {!p && targets.has(i) && <div className="ck-dot" />}
                </div>
              )
            })}
          </div>
        </div>

        <div className="side">
          <div className="panel scoreboard">
            <div className={'sc r' + (s.turn === 'r' && !s.winner ? ' on' : '')}>
              <span className="sc-disc r" />
              <span className="sc-name">You · Red</span>
              <span className="sc-n">{c.r}</span>
            </div>
            <div className={'sc b' + (s.turn === 'b' && !s.winner ? ' on' : '')}>
              <span className="sc-disc b" />
              <span className="sc-name">Rival · Black</span>
              <span className="sc-n">{c.b}</span>
            </div>
            <div className="sc-kings">
              <span>{c.rk} king{c.rk === 1 ? '' : 's'}</span>
              <span>{c.bk} king{c.bk === 1 ? '' : 's'}</span>
            </div>
          </div>
          <div className="panel logbox">
            {s.log.slice().reverse().map((l, i) => <div key={i} className={'log-line ' + l.t}>{l.x}</div>)}
          </div>
        </div>
      </GameShell>

      {s.winner && <ResultModal s={s} c={c} onNew={newGame} />}
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </>
  )
}

function ResultModal({ s, c, onNew }: { s: CheckersState; c: ReturnType<typeof CK.counts>; onNew: () => void }) {
  const won = s.winner === 'r'
  return (
    <Modal
      eyebrow={won ? 'Cleared the board' : 'Boxed in'}
      title={won ? 'You Win' : 'Rival Wins'}
      closeOnOverlay={false}
      actions={<button className="btn-modal" onClick={onNew}>Play again</button>}
    >
      <div className="finalsc"><span className="you">Red {c.r}</span><span className="foe">Black {c.b}</span></div>
    </Modal>
  )
}

function RulesModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal eyebrow="How to play" title="Checkers" onClose={onClose}
      actions={<button className="btn-modal" onClick={onClose}>Begin</button>}>
      <div className="modal-body">
        <p>You are <b>Red</b> at the bottom and move first. Men step <b>one diagonal square forward</b> onto an empty dark square — Red moves up, Black moves down.</p>
        <p>To <b>capture</b>, jump diagonally over an adjacent enemy into the empty square beyond. If a further jump is available with the same piece it <b>chains</b> — the whole multi-jump is one move. <i>Captures are mandatory:</i> if any jump exists you must take one.</p>
        <p>Reach the far row and your man is <b>crowned a King</b>, free to move and jump in <b>both</b> directions.</p>
        <p>Lose all your pieces — or have no legal move — and you lose. Click a piece to see its landings, then click a square to move.</p>
        <p><b>Keys:</b> <kbd>N</kbd> new game · <kbd>?</kbd> rules · <kbd>Esc</kbd> deselect.</p>
      </div>
    </Modal>
  )
}
