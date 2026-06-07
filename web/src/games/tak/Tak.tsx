/* TAK — UI (built for this codebase). A 5x5 wooden board of stone stacks. Place flats,
   walls and your capstone — or pick up a stack you control and slide it, dropping pieces
   along a straight line — racing to link two opposite edges with a road of flats/capstone.
   Seat-relative for online play: you are mySeat (0 solo), the AI/remote human is the other
   seat. The AI for any empty seat is driven by useGameSession. */

import { useState } from 'react'
import { GameShell } from '../../framework/GameShell'
import { Modal } from '../../framework/Modal'
import { useGameKeys } from '../../framework/useGameKeys'
import { OnlineBar } from '../../framework/OnlineBar'
import { useGameSession } from '../../net/useGameSession'
import { takAdapter } from './net'
import * as T from './logic'
import type { PieceType, Move, Owner } from './logic'

const TITLE_MARK = (
  <svg className="title-mark" viewBox="0 0 48 48" aria-hidden="true">
    <rect x="3" y="3" width="42" height="42" rx="10" fill="#3a2a1c" stroke="#6b4a2e" strokeWidth="1.5" />
    <rect x="9" y="30" width="30" height="6" rx="1.5" fill="#caa472" />
    <rect x="12" y="22" width="24" height="6" rx="1.5" fill="#d8b483" />
    <rect x="20" y="8" width="6" height="14" rx="1.5" fill="#9c5a3a" />
    <circle cx="23" cy="11" r="3.4" fill="#e7c79a" stroke="#7a4a28" strokeWidth="1" />
  </svg>
)

type PendingMove = { from: number; carried: number; dir: number | null; drops: number[] }

export function Tak() {
  const { state: s, mySeat, isMyTurn, dispatch, newGame: netNew, net } = useGameSession(takAdapter)
  const me = mySeat as Owner // seat 0 = player 0, seat 1 = player 1
  const opp = (me === 0 ? 1 : 0) as Owner
  const [showRules, setShowRules] = useState(false)
  const [placeType, setPlaceType] = useState<PieceType>('flat')
  const [pending, setPending] = useState<PendingMove | null>(null)

  function newGame() {
    netNew(); setShowRules(false); setPlaceType('flat'); setPending(null)
  }

  const yourTurn = s.winner == null && isMyTurn

  useGameKeys({
    onNew: newGame,
    onToggleRules: () => setShowRules(v => !v),
    onEscape: () => { if (pending) setPending(null); else setShowRules(false) },
    extra: (e) => {
      if (!yourTurn) return false
      if (e.key === 'f' || e.key === 'F') { setPlaceType('flat'); return true }
      if (e.key === 'w' || e.key === 'W') { setPlaceType('wall'); return true }
      if (e.key === 'c' || e.key === 'C') { if (s.supply[me].capstone > 0) setPlaceType('cap'); return true }
      return false
    },
  })

  const sup = s.supply
  const carryLeft = pending ? pending.carried - pending.drops.reduce((a, b) => a + b, 0) : 0

  function doPlace(at: number, piece: PieceType) {
    dispatch({ kind: 'place', at, piece })
  }

  // Click handler for a board square.
  function onSquare(i: number) {
    if (!yourTurn) return

    // Mid-move: we have a stack picked up and a direction set — keep dropping along the line.
    if (pending) {
      if (pending.dir == null) {
        // Choose the direction by clicking an orthogonally-adjacent square to `from`.
        const dir = adjDir(pending.from, i)
        if (dir == null) { setPending(null); return }
        // Drop 1 (default) on this first square, if legal so far.
        tryDrop(dir, 1, i)
        return
      } else {
        // Continue along the chosen direction: clicking the next square drops 1 more there.
        const nextSquare = squareAlong(pending.from, pending.dir, pending.drops.length + 1)
        if (i === nextSquare && carryLeft > 0) {
          tryDrop(pending.dir, 1, i)
        }
        return
      }
    }

    // No pending move: either place, or begin a stack move if we control this square.
    if (s.board[i].length === 0) {
      if (placeType === 'cap' && sup[me].capstone <= 0) return
      if (placeType !== 'cap' && sup[me].stones <= 0) return
      doPlace(i, placeType)
      return
    }
    if (T.controls(s, i, me)) {
      const max = Math.min(s.board[i].length, T.CARRY)
      setPending({ from: i, carried: max, dir: null, drops: [] })
    }
  }

  // Attempt to extend the pending move by dropping `n` on the next square in `dir`.
  function tryDrop(dir: number, n: number, _square: number) {
    setPending(prev => {
      if (!prev) return prev
      const drops = prev.dir == null ? [n] : prev.drops.concat([n])
      return { from: prev.from, carried: prev.carried, dir, drops }
    })
  }

  // Commit the pending move (must drop everything carried).
  function commitMove() {
    if (!pending || pending.dir == null) return
    if (carryLeft !== 0) return
    const m: Move = { kind: 'move', from: pending.from, dir: pending.dir, drops: pending.drops }
    dispatch(m)
    setPending(null)
  }

  // Adjust how many pieces to pick up (only before a direction is chosen).
  function setCarry(n: number) {
    setPending(prev => (prev && prev.dir == null ? { ...prev, carried: n } : prev))
  }

  const oppLabel = net.online ? 'Opponent' : 'Rival'
  const myWin = s.winner === me
  const oppWin = s.winner === opp

  let banner: string, bk = ''
  if (myWin) { bk = 'win'; banner = 'You complete a road — you win!' }
  else if (oppWin) { bk = 'lose'; banner = `${oppLabel} completes a road` }
  else if (s.winner === 'draw') { bk = ''; banner = 'Board full — a tie on flats' }
  else if (pending) {
    bk = 'you'
    banner = pending.dir == null
      ? `Carrying ${pending.carried} — click an adjacent square to choose a direction`
      : carryLeft > 0
        ? `Dropping ${T.DIR_NAME[pending.dir]} — ${carryLeft} left to place`
        : 'Stack placed — confirm the move'
  } else if (yourTurn) { bk = 'you'; banner = 'Your turn — place a piece, or pick up a stack you control' }
  else { bk = 'foe'; banner = net.online ? `${oppLabel} is plotting a road…` : 'The rival is plotting a road…' }

  const winSet = new Set(s.winRoad)
  const lastSet = new Set(s.last)
  const nextDropSquare = pending && pending.dir != null && carryLeft > 0
    ? squareAlong(pending.from, pending.dir, pending.drops.length + 1)
    : -1

  function Square({ i }: { i: number }) {
    const st = s.board[i]
    const tp = st.length ? st[st.length - 1] : null
    const isFrom = pending?.from === i
    const canStartMove = !pending && yourTurn && T.controls(s, i, me)
    const canPlace = !pending && yourTurn && st.length === 0
    const dropTarget = i === nextDropSquare
    const adjForDir = pending && pending.dir == null && adjDir(pending.from, i) != null

    const cls =
      'tk-sq' +
      (winSet.has(i) ? ' road' : '') +
      (lastSet.has(i) ? ' last' : '') +
      (isFrom ? ' picked' : '') +
      (dropTarget ? ' droptarget' : '') +
      (adjForDir ? ' adjdir' : '') +
      ((canStartMove || canPlace) ? ' clickable' : '')

    return (
      <div className={cls} onClick={() => onSquare(i)}>
        {st.length > 1 && <span className="tk-count">{st.length}</span>}
        {tp == null ? (
          <span className="tk-empty" />
        ) : (
          <span className={'tk-piece ' + ownerCls(tp.owner, me) + ' ' + tp.type}>
            {tp.type === 'cap' ? <span className="tk-cap-dot" /> : null}
          </span>
        )}
        {/* mini stack indicator: dots for buried pieces, colored by owner */}
        {st.length > 1 && (
          <span className="tk-stackbar">
            {st.slice(0, st.length - 1).slice(-6).map((p, k) => (
              <span key={k} className={'tk-seg ' + ownerCls(p.owner, me)} />
            ))}
          </span>
        )}
      </div>
    )
  }

  const capAvail = sup[me].capstone > 0
  const stonesAvail = sup[me].stones > 0
  const oppTurn = s.winner == null && !isMyTurn

  return (
    <>
      <GameShell
        mark={TITLE_MARK}
        eyebrow="Tak · road & stones"
        title="Tak"
        subtitle="a beautiful game — stack stones, raise walls, and carry your capstone to link two opposite edges with an unbroken road"
        onRules={() => setShowRules(true)}
        onNew={newGame}
        modeLeft={`You ${T.flatCount(s, me)} flats · ${oppLabel} ${T.flatCount(s, opp)} flats`}
        banner={banner}
        bannerClass={bk}
        modeRight={<>F · flat &nbsp; W · wall &nbsp; C · cap &nbsp; N · new</>}
      >
        <div className="tk-wrap">
          <div className="tk-boardframe">
            <div className="tk-board">
              {Array.from({ length: T.SIZE * T.SIZE }, (_, i) => <Square key={i} i={i} />)}
            </div>
          </div>
        </div>

        <div className="side">
          <div className="panel">
            <OnlineBar net={net} />
          </div>

          <div className="panel tk-supply">
            <div className="panel-l">supply</div>
            <div className={'tk-srow' + (yourTurn ? ' on' : '')}>
              <span className="tk-pawn you" />
              <span className="tk-who">You</span>
              <span className="tk-cnt">{sup[me].stones}<span className="tk-cl">stones</span></span>
              <span className="tk-cnt">{sup[me].capstone}<span className="tk-cl">cap</span></span>
            </div>
            <div className={'tk-srow' + (oppTurn ? ' on' : '')}>
              <span className="tk-pawn foe" />
              <span className="tk-who">{oppLabel}</span>
              <span className="tk-cnt">{sup[opp].stones}<span className="tk-cl">stones</span></span>
              <span className="tk-cnt">{sup[opp].capstone}<span className="tk-cl">cap</span></span>
            </div>
          </div>

          <div className="panel tk-control">
            <div className="panel-l">place a piece</div>
            <div className="tk-types">
              <button
                className={'tk-type' + (placeType === 'flat' ? ' sel' : '')}
                disabled={!stonesAvail}
                onClick={() => setPlaceType('flat')}
              >
                <span className="tk-ico flat" /> Flat
              </button>
              <button
                className={'tk-type' + (placeType === 'wall' ? ' sel' : '')}
                disabled={!stonesAvail}
                onClick={() => setPlaceType('wall')}
              >
                <span className="tk-ico wall" /> Wall
              </button>
              <button
                className={'tk-type' + (placeType === 'cap' ? ' sel' : '')}
                disabled={!capAvail}
                onClick={() => capAvail && setPlaceType('cap')}
              >
                <span className="tk-ico cap" /> Capstone
              </button>
            </div>

            {pending ? (
              <div className="tk-moveui">
                <div className="panel-l">stack move</div>
                {pending.dir == null ? (
                  <>
                    <div className="tk-carry">
                      <span>Carry</span>
                      <div className="tk-carrybtns">
                        {Array.from({ length: Math.min(s.board[pending.from].length, T.CARRY) }, (_, k) => k + 1).map(n => (
                          <button key={n} className={'tk-cbtn' + (pending.carried === n ? ' sel' : '')} onClick={() => setCarry(n)}>{n}</button>
                        ))}
                      </div>
                    </div>
                    <div className="tk-hint">Now click a square next to the pile to slide that way.</div>
                  </>
                ) : (
                  <>
                    <div className="tk-hint">
                      Sliding <b>{T.DIR_NAME[pending.dir]}</b>. {carryLeft > 0
                        ? `Click the highlighted square to drop the next piece (${carryLeft} left).`
                        : 'All pieces dropped.'}
                    </div>
                    <div className="tk-mvbtns">
                      <button className="tk-btn" disabled={carryLeft !== 0} onClick={commitMove}>Confirm</button>
                      <button className="tk-btn ghost" onClick={() => setPending(null)}>Cancel</button>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <div className="tk-hint">
                {yourTurn
                  ? 'Click an empty square to place the selected piece, or click a stack you control (your piece on top) to carry it.'
                  : `Waiting for the ${oppLabel.toLowerCase()}.`}
              </div>
            )}
          </div>

          <div className="panel logbox">
            {s.log.slice().reverse().map((l, i) => <div key={i} className={'log-line ' + l.t}>{l.x}</div>)}
          </div>
        </div>
      </GameShell>

      {s.winner != null && (
        <ResultModal
          won={myWin}
          draw={s.winner === 'draw'}
          flatMe={T.flatCount(s, me)}
          flatOpp={T.flatCount(s, opp)}
          oppLabel={oppLabel}
          onNew={newGame}
        />
      )}
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </>
  )
}

/** Map a piece owner to a UI class relative to the local seat (you vs foe). */
function ownerCls(o: Owner, me: Owner): string {
  return o === me ? 'you' : 'foe'
}

// Direction index (0 up,1 right,2 down,3 left) from a -> b if orthogonally adjacent, else null.
function adjDir(a: number, b: number): number | null {
  const ar = Math.floor(a / T.SIZE), ac = a % T.SIZE
  const br = Math.floor(b / T.SIZE), bc = b % T.SIZE
  if (ac === bc && br === ar - 1) return 0
  if (ar === br && bc === ac + 1) return 1
  if (ac === bc && br === ar + 1) return 2
  if (ar === br && bc === ac - 1) return 3
  return null
}

// Square `step` cells from `from` along `dir`, or -1 if off board.
function squareAlong(from: number, dir: number, step: number): number {
  const D = [[-1, 0], [0, 1], [1, 0], [0, -1]]
  const r = Math.floor(from / T.SIZE) + D[dir][0] * step
  const c = (from % T.SIZE) + D[dir][1] * step
  if (r < 0 || r >= T.SIZE || c < 0 || c >= T.SIZE) return -1
  return r * T.SIZE + c
}

function ResultModal({ won, draw, flatMe, flatOpp, oppLabel, onNew }: { won: boolean; draw: boolean; flatMe: number; flatOpp: number; oppLabel: string; onNew: () => void }) {
  return (
    <Modal
      eyebrow={draw ? 'A balanced board' : won ? 'Road complete' : 'Outpaced'}
      title={draw ? 'Tie Game' : won ? 'You Win' : `${oppLabel} Wins`}
      closeOnOverlay={false}
      actions={<button className="btn-modal" onClick={onNew}>Play again</button>}
    >
      <div className="finalsc">
        {draw
          ? <span>Equal flats — {flatMe} each.</span>
          : won
            ? <span className="you">You linked two opposite edges.</span>
            : <span className="foe">The {oppLabel.toLowerCase()} linked its edges first.</span>}
      </div>
      <div className="tk-final-flats">Flats — You {flatMe} · {oppLabel} {flatOpp}</div>
    </Modal>
  )
}

function RulesModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal eyebrow="How to play" title="Tak" onClose={onClose}
      actions={<button className="btn-modal" onClick={onClose}>Build roads</button>}>
      <div className="modal-body">
        <p>Tak is a road-building game on a <b>5x5</b> board. Each player has <b>21 stones</b> and <b>1 capstone</b>. Win by building a <b>road</b> — an unbroken chain of your <b>flats</b> and/or <b>capstone</b> linking two opposite edges (top–bottom or left–right).</p>
        <p>On your turn, do <b>one</b> of:</p>
        <p>· <b>Place</b> one piece on an empty square. A <b>flat</b> lies down (counts for roads, can be stacked on). A <b>wall</b> stands up (blocks roads, can't be stacked on). A <b>capstone</b> counts for roads and can flatten a lone wall.</p>
        <p>· <b>Move</b> a stack you control (your piece on top): pick up to <b>5</b> pieces off the top, slide them in one straight orthogonal line, dropping at least one on each square. Click a stack you own, choose how many to carry, click an adjacent square to set direction, then click along the line to drop. A lone <b>capstone</b> may move onto a wall to <b>flatten</b> it.</p>
        <p>If the board fills or someone runs out of pieces, the player controlling more <b>flat-topped</b> squares wins.</p>
        <p><b>Keys:</b> <kbd>F</kbd>/<kbd>W</kbd>/<kbd>C</kbd> pick piece · <kbd>N</kbd> new · <kbd>?</kbd> rules · <kbd>Esc</kbd> cancel/close.</p>
      </div>
    </Modal>
  )
}
