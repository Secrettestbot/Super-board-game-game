/* PONG HAU K'I — UI (built for this codebase). A 5-point blocking board (square + one
   diagonal) on the framework shell. Solo: you are Red vs a perfect minimax AI. Online:
   the hook fills the empty seat with the AI or a remote guest, and the view is rendered
   relative to your seat (seat 0 = Red, seat 1 = Blue). Pick your disc, then the
   highlighted empty point it can slide to. Trap the opponent to win. */

import { useMemo, useState } from 'react'
import { GameShell } from '../../framework/GameShell'
import { Modal } from '../../framework/Modal'
import { useGameKeys } from '../../framework/useGameKeys'
import { OnlineBar } from '../../framework/OnlineBar'
import { useGameSession } from '../../net/useGameSession'
import { pongHauKiAdapter } from './net'
import * as PHK from './logic'
import type { Disc, Move } from './logic'

const { PT } = PHK

// Board geometry in a 0..100 viewBox.
const M = 18, X0 = M, X1 = 100 - M, Y0 = M, Y1 = 100 - M, XC = 50, YC = 50
const POS: { x: number; y: number }[] = [
  { x: X0, y: Y0 }, // TL
  { x: X1, y: Y0 }, // TR
  { x: X0, y: Y1 }, // BL
  { x: X1, y: Y1 }, // BR
  { x: XC, y: YC }, // C
]
// Edges to draw: the four square sides + the single TL-BR diagonal through the centre.
// (Matches the authentic Pong Hau K'i graph in logic.ts — see the note there.)
const LINES: [number, number][] = [
  [PT.TL, PT.TR], [PT.TR, PT.BR], [PT.BR, PT.BL], [PT.BL, PT.TL],
  [PT.TL, PT.BR],
]

const TITLE_MARK = (
  <svg className="title-mark" viewBox="0 0 48 48" aria-hidden="true">
    <rect x="3" y="3" width="42" height="42" rx="9" fill="#1a1410" stroke="#5a4632" strokeWidth="1.5" />
    <g stroke="#8a6f4e" strokeWidth="1.4" fill="none">
      <rect x="13" y="13" width="22" height="22" />
      <path d="M13 13 L35 35" />
    </g>
    <circle cx="13" cy="13" r="4" fill="#d8543f" />
    <circle cx="35" cy="13" r="4" fill="#d8543f" />
    <circle cx="13" cy="35" r="4" fill="#4f80c8" />
    <circle cx="35" cy="35" r="4" fill="#4f80c8" />
  </svg>
)

export function PongHauKi() {
  const { state: s, mySeat, isMyTurn, dispatch, newGame: netNew, net } = useGameSession(pongHauKiAdapter)
  const myDisc: Disc = mySeat === 1 ? 'b' : 'r'
  const oppDisc: Disc = myDisc === 'r' ? 'b' : 'r'
  const [showRules, setShowRules] = useState(false)
  const [from, setFrom] = useState<number | null>(null)

  function newGame() { netNew(); setShowRules(false); setFrom(null) }

  useGameKeys({
    onNew: newGame,
    onToggleRules: () => setShowRules(v => !v),
    onEscape: () => { if (showRules) setShowRules(false); else setFrom(null) },
  })

  const yourTurn = !s.winner && isMyTurn
  const myMoves = useMemo(() => yourTurn ? PHK.legalMoves(s.board, myDisc) : [], [yourTurn, s.board, myDisc])
  const movableFrom = useMemo(() => new Set(myMoves.map(m => m.from)), [myMoves])
  const targets = useMemo(() => new Set(from === null ? [] : myMoves.filter(m => m.from === from).map(m => m.to)), [from, myMoves])

  function clickPoint(i: number) {
    if (!yourTurn) return
    if (s.board[i] === myDisc && movableFrom.has(i)) { setFrom(i === from ? null : i); return }
    if (from !== null && targets.has(i)) {
      dispatch({ from, to: i }); setFrom(null)
    }
  }

  const oppLabel = net.online ? 'The opponent' : 'The rival'
  const oppName = net.online ? 'Opponent' : 'Rival'
  const myWin = s.winner === myDisc
  const oppWin = s.winner === oppDisc
  const myColorName = myDisc === 'r' ? 'Red' : 'Blue'
  const oppColorName = oppDisc === 'r' ? 'Red' : 'Blue'

  let banner: string, bk = ''
  if (myWin) { bk = 'win'; banner = `You win — ${oppLabel.toLowerCase()} is trapped` }
  else if (oppWin) { bk = 'lose'; banner = `${oppLabel} wins — you were trapped` }
  else if (yourTurn) { bk = 'you'; banner = from === null ? `Your turn — pick a ${myColorName.toLowerCase()} disc to slide` : 'Now choose where to slide it' }
  else { bk = 'foe'; banner = `${oppLabel} is thinking…` }

  const myOn = !s.winner && s.turn === myDisc
  const oppOn = !s.winner && s.turn === oppDisc

  return (
    <>
      <GameShell
        mark={TITLE_MARK}
        eyebrow="Pong Hau K'i · trap the opponent"
        title="Pong Hau K'i"
        subtitle="slide a disc into the open point — and box the opponent in so it can't move"
        onRules={() => setShowRules(true)}
        onNew={newGame}
        modeLeft="5 points · 2 each"
        banner={banner}
        bannerClass={bk}
        modeRight={<>N · new &nbsp; ? · rules</>}
      >
        <div className="phk-wrap">
          <svg className="phk-board" viewBox="0 0 100 100">
            {LINES.map(([a, b], i) => (
              <line key={i} className="phk-edge" x1={POS[a].x} y1={POS[a].y} x2={POS[b].x} y2={POS[b].y} />
            ))}
            {POS.map((p, i) => {
              const v = s.board[i]
              const isTarget = targets.has(i)
              const isMovable = v === myDisc && movableFrom.has(i)
              const cls = 'phk-point'
                + (isTarget ? ' target' : '')
                + (isMovable ? ' movable' : '')
                + (i === from ? ' sel' : '')
                + (s.last === i ? ' last' : '')
              return (
                <g key={i} className={cls} onClick={() => clickPoint(i)}>
                  <circle className="phk-hit" cx={p.x} cy={p.y} r={12} />
                  <circle className="phk-node" cx={p.x} cy={p.y} r={2.4} />
                  {isTarget && <circle className="phk-dot" cx={p.x} cy={p.y} r={3} />}
                  {v && <circle className={'phk-disc ' + v} cx={p.x} cy={p.y} r={7.2} />}
                </g>
              )
            })}
          </svg>
        </div>

        <div className="side">
          <div className="panel">
            <OnlineBar net={net} />
          </div>
          <div className="panel turnbox">
            <div className={'tn ' + myDisc + (myOn ? ' on' : '')}><span className={'tn-disc ' + myDisc} /><span className="tn-name">You · {myColorName}</span></div>
            <div className={'tn ' + oppDisc + (oppOn ? ' on' : '')}><span className={'tn-disc ' + oppDisc} /><span className="tn-name">{oppName} · {oppColorName}</span></div>
            <div className="tn-hint">It's all about not getting boxed in — keep an escape square open.</div>
          </div>
          <div className="panel logbox">{s.log.slice().reverse().map((l, i) => <div key={i} className={'log-line ' + l.t}>{l.x}</div>)}</div>
        </div>
      </GameShell>

      {s.winner && <ResultModal won={myWin} oppName={oppName} onNew={newGame} />}
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </>
  )
}

function ResultModal({ won, oppName, onNew }: { won: boolean; oppName: string; onNew: () => void }) {
  return (
    <Modal
      eyebrow={won ? 'Boxed them in' : 'Trapped'}
      title={won ? 'You Win' : `${oppName} Wins`}
      closeOnOverlay={false}
      actions={<button className="btn-modal" onClick={onNew}>Play again</button>}
    >
      <div className="finalmsg">{won ? `${oppName} had no slide left.` : 'You ran out of room to move.'}</div>
    </Modal>
  )
}

function RulesModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal eyebrow="How to play" title="Pong Hau K'i" onClose={onClose}
      actions={<button className="btn-modal" onClick={onClose}>Begin</button>}>
      <div className="modal-body">
        <p>You are <b>Red</b> and move first. The board has <b>five points</b> — four corners and the centre — joined by the square's four sides and one <b>diagonal</b> through the centre.</p>
        <p>Each side has <b>two discs</b> and one point is always empty. On your turn, <b>slide</b> one disc along a line into the adjacent <i>empty</i> point. There are no captures.</p>
        <p>You <b>win</b> by <b>boxing the opponent in</b>: if it's their turn and none of their discs sit next to the empty point, they can't move and lose.</p>
        <p><b>Keys:</b> <kbd>N</kbd> new game · <kbd>?</kbd> rules · <kbd>Esc</kbd> deselect / close.</p>
      </div>
    </Modal>
  )
}
