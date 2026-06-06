/* GOMOKU / FIVE IN A ROW — UI (built for this codebase). A 15x15 wooden goban on the
   framework shell, vs a pattern/threat AI or a remote opponent online. Stones sit on the
   intersections; the winning five lights up at the end. Seat-relative: your stone colour
   comes from mySeat (0 = Black, 1 = White). */

import { useMemo, useState } from 'react'
import { GameShell } from '../../framework/GameShell'
import { Modal } from '../../framework/Modal'
import { useGameKeys } from '../../framework/useGameKeys'
import { OnlineBar } from '../../framework/OnlineBar'
import { useGameSession } from '../../net/useGameSession'
import { gomokuAdapter } from './net'
import * as GK from './logic'
import type { Stone } from './logic'

const { N } = GK
const STAR = new Set([3 * N + 3, 3 * N + 11, 11 * N + 3, 11 * N + 11, 7 * N + 7])

const TITLE_MARK = (
  <svg className="title-mark" viewBox="0 0 48 48" aria-hidden="true">
    <rect x="3" y="3" width="42" height="42" rx="9" fill="#c69a5e" stroke="#9a703b" strokeWidth="1.5" />
    <path d="M13 13 H35 M13 24 H35 M13 35 H35 M13 13 V35 M24 13 V35 M35 13 V35" stroke="#6e4a23" strokeWidth="1" opacity="0.7" />
    <circle cx="13" cy="35" r="5.5" fill="#1b1c1d" stroke="#000" strokeWidth="0.5" />
    <circle cx="35" cy="13" r="5.5" fill="#f4f1e7" stroke="#c8c2af" strokeWidth="0.5" />
  </svg>
)

export function Gomoku() {
  const { state: s, mySeat, isMyTurn, dispatch, newGame: netNew, net } = useGameSession(gomokuAdapter)
  const [showRules, setShowRules] = useState(false)

  function newGame() { netNew(); setShowRules(false) }

  useGameKeys({ onNew: newGame, onToggleRules: () => setShowRules(v => !v), onEscape: () => setShowRules(false) })

  const myStone: Stone = mySeat === 1 ? 'w' : 'b'
  const oppStone: Stone = myStone === 'b' ? 'w' : 'b'
  const myName = myStone === 'b' ? 'Black' : 'White'
  const oppName = oppStone === 'b' ? 'Black' : 'White'
  const oppLabel = net.online ? 'Opponent' : 'Rival'

  const yourTurn = !s.winner && isMyTurn
  const winSet = useMemo(() => new Set(s.win ?? []), [s.win])
  const counts = useMemo(() => {
    let b = 0, w = 0
    for (const v of s.board) { if (v === 'b') b++; else if (v === 'w') w++ }
    return { b, w }
  }, [s.board])

  function clickPoint(i: number) { if (yourTurn && !s.board[i]) dispatch(i) }

  const iWon = s.winner === myStone
  const oppWon = s.winner === oppStone

  let banner: string, bk = ''
  if (iWon) { bk = 'win'; banner = 'Five in a row — you win!' }
  else if (oppWon) { bk = 'lose'; banner = `${oppLabel} lines up five — you lose` }
  else if (s.winner === 'draw') { bk = ''; banner = 'The board is full — a draw' }
  else if (yourTurn) { bk = 'you'; banner = `Your turn — place a ${myName.toLowerCase()} stone` }
  else { bk = 'foe'; banner = net.online ? `Waiting for ${oppLabel}…` : `${oppLabel} is thinking…` }

  const myCount = myStone === 'b' ? counts.b : counts.w
  const oppCount = oppStone === 'b' ? counts.b : counts.w

  return (
    <>
      <GameShell
        mark={TITLE_MARK}
        eyebrow="Gomoku · five in a row"
        title="Gomoku"
        subtitle="line up five of your stones in a row before the rival does — across, down, or diagonally"
        onRules={() => setShowRules(true)}
        onNew={newGame}
        modeLeft="15 × 15"
        banner={banner}
        bannerClass={bk}
        modeRight={<>N · new &nbsp; ? · rules</>}
      >
        <div className="gk-wrap">
          <div className="gk-board">
            <div className="gk-grid">
              {s.board.map((v, i) => {
                const r = Math.floor(i / N), c = i % N
                return (
                  <div key={i} className={'gk-pt' + (yourTurn && !v ? ' clickable' : '')} onClick={() => clickPoint(i)}>
                    {/* grid lines: half-segments so the outer edges sit flush */}
                    <span className={'gk-h' + (c === 0 ? ' l0' : '') + (c === N - 1 ? ' r0' : '')} />
                    <span className={'gk-v' + (r === 0 ? ' t0' : '') + (r === N - 1 ? ' b0' : '')} />
                    {STAR.has(i) && !v && <span className="gk-star" />}
                    {v && (
                      <span className={'gk-stone ' + v + (s.last === i ? ' last' : '') + (winSet.has(i) ? ' win' : '')} />
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
            <div className={'sc ' + myStone + (s.turn === myStone && !s.winner ? ' on' : '')}><span className={'sc-stone ' + myStone} /><span className="sc-name">You · {myName}</span><span className="sc-n">{myCount}</span></div>
            <div className={'sc ' + oppStone + (s.turn === oppStone && !s.winner ? ' on' : '')}><span className={'sc-stone ' + oppStone} /><span className="sc-name">{oppLabel} · {oppName}</span><span className="sc-n">{oppCount}</span></div>
          </div>
          <div className="panel logbox">{s.log.slice().reverse().map((l, i) => <div key={i} className={'log-line ' + l.t}>{l.x}</div>)}</div>
        </div>
      </GameShell>

      {s.winner && <ResultModal won={iWon} draw={s.winner === 'draw'} oppLabel={oppLabel} onNew={newGame} />}
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </>
  )
}

function ResultModal({ won, draw, oppLabel, onNew }: { won: boolean; draw: boolean; oppLabel: string; onNew: () => void }) {
  return (
    <Modal
      eyebrow={draw ? 'Stalemate' : won ? 'Five in a row' : 'Out-played'}
      title={draw ? 'A Draw' : won ? 'You Win' : `${oppLabel} Wins`}
      closeOnOverlay={false}
      actions={<button className="btn-modal" onClick={onNew}>Play again</button>}
    >
      <div className="finalsc">
        {draw
          ? <span className="you">No five was made</span>
          : won
            ? <span className="you">Your five completes the line</span>
            : <span className="foe">{oppLabel} completes its line</span>}
      </div>
    </Modal>
  )
}

function RulesModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal eyebrow="How to play" title="Gomoku" onClose={onClose}
      actions={<button className="btn-modal" onClick={onClose}>Begin</button>}>
      <div className="modal-body">
        <p>You are <b>Black</b> and move first. <b>Click an empty intersection</b> to place a stone — stones sit on the crossing points of the grid, not inside the squares.</p>
        <p>The first player to make an unbroken row of <b>five stones</b> — <i>horizontally, vertically, or diagonally</i> — wins. Six or more in a line counts too.</p>
        <p>If the whole board fills with no five made, it's a <b>draw</b> (rare). The last move is marked, and the winning five lights up at the end.</p>
        <p><b>Keys:</b> <kbd>N</kbd> new game · <kbd>?</kbd> rules · <kbd>Esc</kbd> close.</p>
      </div>
    </Modal>
  )
}
