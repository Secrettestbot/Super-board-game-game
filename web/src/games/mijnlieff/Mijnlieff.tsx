/* MIJNLIEFF — UI (built for this codebase). A 4x4 brass-and-teal board on the framework
   shell, vs a heuristic AI. Pick one of your remaining piece TYPES, then click a highlighted
   legal cell; the type you place dictates where the AI may answer. */

import { useMemo, useState } from 'react'
import { GameShell } from '../../framework/GameShell'
import { Modal } from '../../framework/Modal'
import { OnlineBar } from '../../framework/OnlineBar'
import { useGameKeys } from '../../framework/useGameKeys'
import { useGameSession } from '../../net/useGameSession'
import { mijnlieffAdapter } from './net'
import * as M from './logic'
import type { PieceType, Player } from './logic'

const TYPE_LABEL: Record<PieceType, string> = {
  straight: 'Straight',
  diagonal: 'Diagonal',
  near: 'Near',
  far: 'Far',
}
const TYPE_HINT: Record<PieceType, string> = {
  straight: 'foe must answer on this row or column',
  diagonal: 'foe must answer on a diagonal',
  near: 'foe must answer adjacent',
  far: 'foe must answer far away',
}

function Glyph({ type }: { type: PieceType }) {
  // four distinct piece-type glyphs
  const common = { className: 'mj-glyph', viewBox: '0 0 24 24', 'aria-hidden': true as const }
  switch (type) {
    case 'straight':
      return <svg {...common}><path d="M12 3 V21 M3 12 H21" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" /></svg>
    case 'diagonal':
      return <svg {...common}><path d="M4 4 L20 20 M20 4 L4 20" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" /></svg>
    case 'near':
      return <svg {...common}><circle cx="12" cy="12" r="7.5" fill="none" stroke="currentColor" strokeWidth="2.6" /></svg>
    case 'far':
      return <svg {...common}><rect x="4" y="4" width="16" height="16" rx="3" fill="none" stroke="currentColor" strokeWidth="2.4" /><circle cx="12" cy="12" r="2.6" fill="currentColor" /></svg>
  }
}

const TITLE_MARK = (
  <svg className="title-mark" viewBox="0 0 48 48" aria-hidden="true">
    <rect x="3" y="3" width="42" height="42" rx="9" fill="#1b2c30" stroke="#2d4549" strokeWidth="1.5" />
    <path d="M16 16 L32 32 M32 16 L16 32" stroke="#58c8b0" strokeWidth="2" strokeLinecap="round" opacity="0.85" />
    <circle cx="24" cy="24" r="6.5" fill="none" stroke="#d8a84a" strokeWidth="2" />
  </svg>
)

export function Mijnlieff() {
  const { state: s, mySeat, isMyTurn, dispatch, newGame: netNew, net } = useGameSession(mijnlieffAdapter)
  const mySide = mySeat as Player // seat 0 = first player, seat 1 = second
  const oppSide: Player = mySide === 0 ? 1 : 0
  const oppLabel = net.online ? 'Opponent' : 'AI'
  const [showRules, setShowRules] = useState(false)
  const [sel, setSel] = useState<PieceType | null>(null)

  function newGame() {
    netNew()
    setSel(null)
    setShowRules(false)
  }

  const yourTurn = s.winner == null && isMyTurn
  const oppTurn = s.winner == null && s.turn === oppSide

  useGameKeys({ onNew: newGame, onToggleRules: () => setShowRules(v => !v), onEscape: () => { setShowRules(false); setSel(null) } })

  const legal = useMemo(() => new Set(yourTurn ? M.legalPlacements(s) : []), [s, yourTurn])
  const winSet = useMemo(() => new Set((s.lines ?? []).flat()), [s.lines])

  // auto-pick a usable type if the current selection is empty/unset
  const myHand = s.hands[mySide]
  const ownedTypes = M.TYPES.filter(t => myHand[t] > 0)
  const effSel: PieceType | null = sel && myHand[sel] > 0 ? sel : (ownedTypes[0] ?? null)

  function clickCell(i: number) {
    if (!yourTurn || !legal.has(i) || effSel == null) return
    dispatch({ pieceType: effSel, cell: i })
    setSel(null)
  }

  const myWin = s.winner === mySide
  const myScore = s.scores[mySide]
  const oppScore = s.scores[oppSide]
  let banner: string, bk = ''
  if (s.winner === mySide) { bk = 'win'; banner = `You win — ${myScore} to ${oppScore}` }
  else if (s.winner === oppSide) { bk = 'lose'; banner = `${oppLabel} wins — ${oppScore} to ${myScore}` }
  else if (s.winner === 'draw') { bk = ''; banner = `A draw — ${myScore} apiece` }
  else if (yourTurn) {
    bk = 'you'
    banner = legal.size === 0 ? 'No legal square — you must pass' : (effSel ? `Place a ${TYPE_LABEL[effSel].toLowerCase()} piece` : 'Your turn')
  } else { bk = 'foe'; banner = net.online ? 'Waiting for opponent…' : 'The AI is thinking…' }

  return (
    <>
      <GameShell
        mark={TITLE_MARK}
        eyebrow="Mijnlieff · placement duel"
        title="Mijnlieff"
        subtitle="the piece you place dictates where your opponent may answer — build lines of three and four"
        onRules={() => setShowRules(true)}
        onNew={newGame}
        modeLeft="4 × 4 · 8 pieces each"
        banner={banner}
        bannerClass={bk}
        modeRight={<>N · new &nbsp; ? · rules</>}
      >
        <div className="mj-wrap">
          <div className="mj-board">
            <div className="mj-grid">
              {s.board.map((cell, i) => {
                const isCenter = i === M.idx(1, 1) || i === M.idx(1, 2) || i === M.idx(2, 1) || i === M.idx(2, 2)
                const isLegal = legal.has(i)
                return (
                  <div
                    key={i}
                    className={'mj-cell' + (isCenter ? ' center' : '') + (isLegal ? ' legal' : '')}
                    onClick={() => clickCell(i)}
                  >
                    {cell != null && (
                      <div className={'mj-piece p' + cell.owner + (s.last && s.last.cell === i ? ' last' : '') + (winSet.has(i) ? ' win' : '')}>
                        <Glyph type={cell.type} />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        <div className="side">
          <div className="panel">
            <OnlineBar net={net} />
          </div>
          <div className="panel scoreboard">
            <div className={'sc' + (yourTurn ? ' on' : '')}>
              <span className={'sc-dot p' + mySide} /><span className="sc-name">You</span><span className="sc-n">{myScore}</span>
            </div>
            <div className={'sc' + (oppTurn ? ' on' : '')}>
              <span className={'sc-dot p' + oppSide} /><span className="sc-name">{oppLabel}</span><span className="sc-n">{oppScore}</span>
            </div>
          </div>

          <div className="panel">
            <div className="hand-l">Your pieces — pick a type</div>
            <div className="hand">
              {M.TYPES.map(t => {
                const n = myHand[t]
                const empty = n === 0
                const isSel = effSel === t && !empty
                return (
                  <div
                    key={t}
                    className={'htile' + (isSel ? ' sel' : '') + (empty ? ' empty' : '')}
                    title={TYPE_HINT[t]}
                    onClick={() => { if (!empty && yourTurn) setSel(t) }}
                  >
                    <span className="htile-chip"><Glyph type={t} /></span>
                    <span className="htile-name">{TYPE_LABEL[t]}</span>
                    <span className="htile-cnt">{n} left</span>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="panel logbox">
            {s.log.slice().reverse().map((l, i) => <div key={i} className={'log-line ' + l.t}>{l.x}</div>)}
          </div>
        </div>
      </GameShell>

      {s.winner != null && <ResultModal won={myWin} draw={s.winner === 'draw'} myScore={myScore} oppScore={oppScore} oppLabel={oppLabel} onNew={newGame} />}
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </>
  )
}

function ResultModal({ won, draw, myScore, oppScore, oppLabel, onNew }: { won: boolean; draw: boolean; myScore: number; oppScore: number; oppLabel: string; onNew: () => void }) {
  return (
    <Modal
      eyebrow={draw ? 'Even lines' : won ? 'Well placed' : 'Out-placed'}
      title={draw ? 'A Draw' : won ? 'You Win' : `${oppLabel} Wins`}
      closeOnOverlay={false}
      actions={<button className="btn-modal" onClick={onNew}>Play again</button>}
    >
      <div className="finalsc">
        <span className="you">You {myScore}</span>
        <span className="sep">·</span>
        <span className="foe">{oppLabel} {oppScore}</span>
      </div>
      <div className="modal-body">
        <p style={{ textAlign: 'center' }}>
          {draw ? 'Both sides scored the same number of lines.' : won ? 'Your lines of three and four carried the day.' : `${oppLabel} built the stronger set of lines.`}
        </p>
      </div>
    </Modal>
  )
}

function RulesModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal eyebrow="How to play" title="Mijnlieff" onClose={onClose}
      actions={<button className="btn-modal" onClick={onClose}>Begin</button>}>
      <div className="modal-body">
        <p>You and the AI share a <b>4×4</b> board and hold <b>8 pieces</b> each — two of every type. Take turns placing one piece on an empty cell. <b>Pick a type</b> from your hand, then click a highlighted cell. Your opening move may not be on the four <i>centre</i> cells.</p>
        <p>The piece you place <b>dictates the opponent's next square</b>:</p>
        <p>
          <b>Straight</b> — answer on the same <i>row or column</i>.<br />
          <b>Diagonal</b> — answer on a <i>diagonal</i> line.<br />
          <b>Near</b> — answer on an <i>adjacent</i> cell.<br />
          <b>Far</b> — answer on a <i>non-adjacent</i> cell.
        </p>
        <p>If you have pieces but <b>no legal square</b>, you <i>pass</i>. When neither side can place, the game ends.</p>
        <p>Score your <b>lines</b> (orthogonal or diagonal): a line of three is <b>1 point</b>, a line of four is <b>2 points</b>. Most points wins; equal is a draw.</p>
        <p><b>Keys:</b> <kbd>N</kbd> new game · <kbd>?</kbd> rules · <kbd>Esc</kbd> close.</p>
      </div>
    </Modal>
  )
}
