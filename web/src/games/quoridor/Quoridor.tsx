/* QUORIDOR — UI (built for this codebase). A 9x9 agate board with groove slots for walls on the
   framework shell. Solo: vs a BFS-greedy AI. Online: host is the bottom pawn (seat 0), the guest
   is the top pawn (seat 1) via useGameSession. Click a highlighted neighbour to move; toggle wall
   mode to drop a 2-cell wall into a legal groove. The board is oriented so YOUR pawn is at the
   bottom (seat 1 sees the board rotated 180°). */

import { useMemo, useState } from 'react'
import { GameShell } from '../../framework/GameShell'
import { Modal } from '../../framework/Modal'
import { useGameKeys } from '../../framework/useGameKeys'
import { OnlineBar } from '../../framework/OnlineBar'
import { useGameSession } from '../../net/useGameSession'
import { quoridorAdapter } from './net'
import * as QD from './logic'
import type { QuoridorState, Wall, Who } from './logic'

const { N, WALL_N } = QD

const SEAT_WHO: Who[] = ['you', 'ai']

const TITLE_MARK = (
  <svg className="title-mark" viewBox="0 0 48 48" aria-hidden="true">
    <rect x="3" y="3" width="42" height="42" rx="9" fill="#3a2a18" stroke="#6b4e2c" strokeWidth="1.5" />
    <rect x="9" y="9" width="30" height="30" rx="3" fill="#caa86a" stroke="#8a6a38" strokeWidth="1" />
    <circle cx="18" cy="30" r="4.5" fill="#2b6f8e" />
    <circle cx="30" cy="18" r="4.5" fill="#c45a3a" />
    <rect x="22.4" y="13" width="3.2" height="22" rx="1.2" fill="#6b4e2c" />
  </svg>
)

const wallKey = (w: Wall) => `${w.o}${w.r}-${w.c}`

export function Quoridor() {
  const { state: s, mySeat, isMyTurn, dispatch, newGame: netNew, net } = useGameSession(quoridorAdapter)
  const me: Who = SEAT_WHO[mySeat] ?? 'you'
  const opp: Who = me === 'you' ? 'ai' : 'you'
  const flip = me === 'ai' // seat 1 sees the board rotated so its pawn is at the bottom

  const [showRules, setShowRules] = useState(false)
  const [wallMode, setWallMode] = useState(false)

  function newGame() { netNew(); setShowRules(false); setWallMode(false) }

  useGameKeys({
    onNew: newGame,
    onToggleRules: () => setShowRules(v => !v),
    onEscape: () => { setShowRules(false); setWallMode(false) },
    extra: (e) => { if (e.key === 'w' || e.key === 'W') { setWallMode(v => !v); return true } },
  })

  const yourTurn = !s.winner && isMyTurn

  // display <-> logic coordinate transforms (180° rotation when flipped)
  const dCell = (r: number, c: number): [number, number] => flip ? [N - 1 - r, N - 1 - c] : [r, c]
  const dWall = (r: number, c: number): [number, number] => flip ? [WALL_N - 1 - r, WALL_N - 1 - c] : [r, c]

  const moveTargets = useMemo(
    () => yourTurn && !wallMode ? new Set(QD.legalMoves(s, me).map(([r, c]) => r * N + c)) : new Set<number>(),
    [yourTurn, wallMode, s, me],
  )
  const wallSlots = useMemo(
    () => yourTurn && wallMode ? QD.legalWalls(s, me) : [],
    [yourTurn, wallMode, s, me],
  )
  const wallSlotSet = useMemo(() => new Set(wallSlots.map(wallKey)), [wallSlots])

  function clickCell(r: number, c: number) {
    if (yourTurn && !wallMode && moveTargets.has(r * N + c)) dispatch({ kind: 'move', r, c })
  }
  function clickWall(w: Wall) {
    if (yourTurn && wallMode && wallSlotSet.has(wallKey(w))) { dispatch({ kind: 'wall', r: w.r, c: w.c, o: w.o }); setWallMode(false) }
  }

  const myWin = s.winner === me
  const oppName = net.online ? 'Opponent' : 'Rival'

  let banner: string, bk = ''
  if (s.winner != null) {
    if (myWin) { bk = 'win'; banner = 'You reached your far row — you win!' }
    else { bk = 'lose'; banner = `${oppName} reached its far row — it wins` }
  } else if (yourTurn) {
    bk = 'you'; banner = wallMode ? 'Wall mode — click a groove to place a wall' : 'Your turn — move, or press W for a wall'
  } else {
    bk = 'foe'; banner = net.online ? `${oppName} is thinking…` : 'The rival is thinking…'
  }

  const myPawn = s.pawns[me]
  const oppPawn = s.pawns[opp]

  return (
    <>
      <GameShell
        mark={TITLE_MARK}
        eyebrow="Quoridor · race &amp; wall"
        title="Quoridor"
        subtitle="dash your pawn to the far row while fencing the rival in with walls"
        onRules={() => setShowRules(true)}
        onNew={newGame}
        modeLeft="9 × 9 · 10 walls"
        banner={banner}
        bannerClass={bk}
        modeRight={<>W · wall &nbsp; N · new &nbsp; ? · rules</>}
      >
        <div className="qd-wrap">
          <div className="qd-board">
            {/* cells */}
            {Array.from({ length: N * N }, (_, i) => {
              const r = Math.floor(i / N), c = i % N
              const [dr, dc] = dCell(r, c)
              const isMe = myPawn.r === r && myPawn.c === c
              const isOpp = oppPawn.r === r && oppPawn.c === c
              const target = moveTargets.has(i)
              return (
                <div
                  key={'cell' + i}
                  className={'qd-cell' + (target ? ' target' : '')}
                  style={{ gridColumn: dc * 2 + 1, gridRow: dr * 2 + 1 }}
                  onClick={() => clickCell(r, c)}
                >
                  {isMe && <div className="qd-pawn you" />}
                  {isOpp && <div className="qd-pawn ai" />}
                  {target && !isMe && !isOpp && <div className="qd-dot" />}
                </div>
              )
            })}

            {/* placed walls */}
            {s.walls.map((w) => {
              const [wr, wc] = dWall(w.r, w.c)
              return (
                <div
                  key={'pw' + wallKey(w)}
                  className={'qd-wall ' + w.o}
                  style={w.o === 'h'
                    ? { gridColumn: wc * 2 + 1 + ' / ' + (wc * 2 + 4), gridRow: wr * 2 + 2 }
                    : { gridColumn: wc * 2 + 2, gridRow: wr * 2 + 1 + ' / ' + (wr * 2 + 4) }}
                />
              )
            })}

            {/* legal wall slots (only in wall mode) */}
            {wallSlots.map((w) => {
              const [wr, wc] = dWall(w.r, w.c)
              return (
                <div
                  key={'ws' + wallKey(w)}
                  className={'qd-slot ' + w.o}
                  style={w.o === 'h'
                    ? { gridColumn: wc * 2 + 1 + ' / ' + (wc * 2 + 4), gridRow: wr * 2 + 2 }
                    : { gridColumn: wc * 2 + 2, gridRow: wr * 2 + 1 + ' / ' + (wr * 2 + 4) }}
                  onClick={() => clickWall(w)}
                />
              )
            })}
          </div>
        </div>

        <div className="side">
          <div className="panel">
            <OnlineBar net={net} />
          </div>
          <div className="panel scoreboard">
            <div className={'sc ai' + (s.turn === opp && !s.winner ? ' on' : '')}>
              <span className="sc-pawn ai" /><span className="sc-name">{oppName} · {flip ? 'bottom' : 'top'}</span>
              <span className="sc-walls">{'▮'.repeat(s.left[opp]) || '—'}</span><span className="sc-n">{s.left[opp]}</span>
            </div>
            <div className={'sc you' + (s.turn === me && !s.winner ? ' on' : '')}>
              <span className="sc-pawn you" /><span className="sc-name">You · bottom</span>
              <span className="sc-walls">{'▮'.repeat(s.left[me]) || '—'}</span><span className="sc-n">{s.left[me]}</span>
            </div>
          </div>
          <button
            className={'qd-wallbtn' + (wallMode ? ' active' : '')}
            disabled={!yourTurn || s.left[me] <= 0}
            onClick={() => setWallMode(v => !v)}
          >
            {wallMode ? 'Cancel wall' : 'Place wall (W)'}
          </button>
          <div className="panel logbox">{s.log.slice().reverse().map((l, i) => <div key={i} className={'log-line ' + l.t}>{l.x}</div>)}</div>
        </div>
      </GameShell>

      {s.winner != null && <ResultModal won={myWin} me={me} opp={opp} left={s.left} oppName={oppName} onNew={newGame} />}
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </>
  )
}

function ResultModal({ won, me, opp, left, oppName, onNew }: { won: boolean; me: Who; opp: Who; left: QuoridorState['left']; oppName: string; onNew: () => void }) {
  return (
    <Modal
      eyebrow={won ? 'First to the far row' : 'Out-raced'}
      title={won ? 'You Win' : `${oppName} Wins`}
      closeOnOverlay={false}
      actions={<button className="btn-modal" onClick={onNew}>Play again</button>}
    >
      <div className="finalsc">
        <span className="you">You · {left[me]} walls left</span>
        <span className="foe">{oppName} · {left[opp]} walls left</span>
      </div>
    </Modal>
  )
}

function RulesModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal eyebrow="How to play" title="Quoridor" onClose={onClose}
      actions={<button className="btn-modal" onClick={onClose}>Begin</button>}>
      <div className="modal-body">
        <p>You are the <b>bottom pawn</b>. Reach <b>any cell in the far row</b> before the rival reaches its far row. On your turn you either <b>move</b> one step (up/down/left/right) or <b>place a wall</b>.</p>
        <p>If the rival's pawn is in the square you'd step into, you <i>jump</i> straight over it — or diagonally if a wall or the edge blocks the straight hop.</p>
        <p>Each side has <b>10 walls</b>. A wall is a two-cell fence dropped into the grooves between cells; it blocks movement and can't overlap or cross another. A wall may <b>never</b> completely seal off either pawn from its goal row.</p>
        <p><b>Keys:</b> <kbd>W</kbd> wall mode · <kbd>N</kbd> new game · <kbd>?</kbd> rules · <kbd>Esc</kbd> cancel.</p>
      </div>
    </Modal>
  )
}
