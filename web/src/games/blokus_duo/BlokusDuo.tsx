/* BLOKUS DUO — UI (built for this codebase). A 14x14 corner-to-corner polyomino duel.
   Pick a piece from your tray, rotate/flip it, then click a board cell to drop it (the cell
   becomes the piece's top-left anchor). Legal anchors light up; an illegal preview shows red.
   Seat-relative: you play `mySeat` (0 solo / vs AI, 0 or 1 online). The opponent seat is
   driven by the AI (solo) or a remote human (online) through useGameSession. */

import { useMemo, useRef, useState, useEffect } from 'react'
import { GameShell } from '../../framework/GameShell'
import { Modal } from '../../framework/Modal'
import { OnlineBar } from '../../framework/OnlineBar'
import { useGameKeys } from '../../framework/useGameKeys'
import { useGameSession } from '../../net/useGameSession'
import { blokusDuoAdapter } from './net'
import * as B from './logic'
import type { State, Shape, Player } from './logic'

const TITLE_MARK = (
  <svg className="title-mark" viewBox="0 0 48 48" aria-hidden="true">
    <rect x="3" y="3" width="42" height="42" rx="10" fill="#1a212e" stroke="#3a4557" strokeWidth="1.5" />
    <rect x="9" y="9" width="9" height="9" rx="2" fill="#3fd0b3" />
    <rect x="18" y="18" width="9" height="9" rx="2" fill="#3fd0b3" />
    <rect x="27" y="9" width="9" height="9" rx="2" fill="#ff855f" />
    <rect x="27" y="27" width="9" height="9" rx="2" fill="#ff855f" />
    <rect x="9" y="27" width="9" height="9" rx="2" fill="#f2b13c" />
  </svg>
)

/** A tiny grid render of a shape (for tray + preview). cls: which color class. */
function ShapeGrid({ shape, cell, on, off }: { shape: Shape; cell: string; on: string; off: string }) {
  const maxR = Math.max(...shape.map(c => c[0]))
  const maxC = Math.max(...shape.map(c => c[1]))
  const filled = new Set(shape.map(([r, c]) => r * 100 + c))
  const rows: number[] = Array.from({ length: maxR + 1 }, (_, i) => i)
  const cols: number[] = Array.from({ length: maxC + 1 }, (_, i) => i)
  return (
    <div className={cell} style={{ gridTemplateColumns: `repeat(${cols.length}, auto)` }}>
      {rows.flatMap(r => cols.map(c => (
        <div key={r * 100 + c} className={(filled.has(r * 100 + c) ? on : off)} />
      )))}
    </div>
  )
}

export function BlokusDuo() {
  const { state: s, mySeat, isMyTurn, dispatch, newGame: netNew, net } = useGameSession(blokusDuoAdapter)
  const me = mySeat as Player
  const opp = (1 - me) as Player
  const [showRules, setShowRules] = useState(false)
  // currently selected piece id (null = none) and its orientation index
  const [selPiece, setSelPiece] = useState<number | null>(null)
  const [orient, setOrient] = useState(0)
  const [hover, setHover] = useState<{ r: number; c: number } | null>(null)
  const logRef = useRef<HTMLDivElement>(null)

  function newGame() {
    netNew(); setSelPiece(null); setOrient(0); setHover(null); setShowRules(false)
  }

  useEffect(() => { if (logRef.current) logRef.current.scrollTop = 0 }, [s.log])

  const yourTurn = s.winner == null && isMyTurn
  const myRemaining = s.remaining[me]
  const oppLabel = net.online ? 'Opponent' : 'AI'

  // If the selected piece got placed or it's not yours anymore, clear selection.
  useEffect(() => {
    if (selPiece != null && !myRemaining.includes(selPiece)) { setSelPiece(null); setOrient(0) }
  }, [selPiece, myRemaining])

  const selShape: Shape | null = selPiece != null ? B.ORIENTS[selPiece][orient] : null

  // Precompute the set of legal anchor cells for the selected piece's current orientation.
  const legalAnchors = useMemo(() => {
    const set = new Set<number>()
    if (!yourTurn || selShape == null) return set
    for (let r = 0; r < B.N; r++) for (let c = 0; c < B.N; c++) {
      const cells = B.placedCells(selShape, r, c)
      if (cells && B.isLegal(s, me, cells)) set.add(r * B.N + c)
    }
    return set
  }, [s, selShape, yourTurn, me])

  // Whether you have any legal move at all (for the auto-pass affordance).
  const youCanMove = useMemo(() => (yourTurn ? B.canPlaceAny(s, me) : false), [s, yourTurn, me])

  // Preview cells for the current hover (absolute board indices) + whether legal.
  const preview = useMemo(() => {
    if (!yourTurn || selShape == null || !hover) return { cells: new Set<number>(), ok: false }
    const cells = B.placedCells(selShape, hover.r, hover.c)
    if (!cells) return { cells: new Set<number>(), ok: false }
    const ok = B.isLegal(s, me, cells)
    return { cells: new Set(cells.map(([r, c]) => r * B.N + c)), ok }
  }, [s, selShape, hover, yourTurn, me])

  function rotateSel() { if (selPiece != null) setOrient(o => (o + 1) % B.ORIENTS[selPiece].length) }
  function flipSel() {
    if (selPiece == null) return
    // map current orientation to its flipped sibling within the dedup'd orientation list
    const orients = B.ORIENTS[selPiece]
    const flipped = B.flip(orients[orient])
    const key = flipped.map(c => c.join(',')).join(';')
    const i = orients.findIndex(o => o.map(c => c.join(',')).join(';') === key)
    setOrient(i >= 0 ? i : (orient + 1) % orients.length)
  }

  function tryPlace(r: number, c: number) {
    if (!yourTurn || selPiece == null || selShape == null) return
    const cells = B.placedCells(selShape, r, c)
    if (!cells || !B.isLegal(s, me, cells)) return
    dispatch({ pieceId: selPiece, orient, r, c })
    setSelPiece(null); setOrient(0); setHover(null)
  }

  function passTurn() {
    if (yourTurn && !youCanMove) dispatch({ pieceId: null })
  }

  useGameKeys({
    onNew: newGame,
    onToggleRules: () => setShowRules(v => !v),
    onEscape: () => { if (showRules) setShowRules(false); else { setSelPiece(null); setOrient(0) } },
    extra: (e) => {
      if (!yourTurn) return false
      if (e.key === 'r' || e.key === 'R') { rotateSel(); return true }
      if (e.key === 'f' || e.key === 'F') { flipSel(); return true }
      if (e.key === 'p' || e.key === 'P') { passTurn(); return true }
      return false
    },
  })

  // Banner (relative to your seat)
  const myScore = s.scores[me], oppScore = s.scores[opp]
  let banner: string, bk = ''
  if (s.winner === me) { bk = 'win'; banner = `You win ${myScore}–${oppScore}!` }
  else if (s.winner === opp) { bk = 'lose'; banner = `${oppLabel} wins ${oppScore}–${myScore}` }
  else if (s.winner === -1) { bk = ''; banner = `It's a draw, ${myScore}–${oppScore}` }
  else if (yourTurn) {
    bk = 'you'
    banner = !youCanMove ? 'No legal move — press Pass'
      : selPiece == null ? 'Select a piece from your tray'
      : 'Click a glowing cell to place it'
  } else { bk = 'foe'; banner = net.online ? 'Waiting for the opponent…' : 'The AI is placing a piece…' }

  return (
    <>
      <GameShell
        mark={TITLE_MARK}
        eyebrow="Blokus Duo · corner-to-corner"
        title="Blokus Duo"
        subtitle="grow your color from one corner, touching only at the diagonals — never edge to edge — and cover more squares than the AI"
        onRules={() => setShowRules(true)}
        onNew={newGame}
        modeLeft={`You ${myScore} · ${oppLabel} ${oppScore} cells`}
        banner={banner}
        bannerClass={bk}
        modeRight={<>R · rotate &nbsp; F · flip &nbsp; P · pass &nbsp; N · new</>}
      >
        <div className="bd-wrap">
          <div className="bd-board" onMouseLeave={() => setHover(null)}>
            {Array.from({ length: B.N * B.N }, (_, i) => {
              const r = Math.floor(i / B.N), c = i % B.N
              const owner = s.board[i]
              const isStart0 = B.STARTS[0][0] === r && B.STARTS[0][1] === c && owner == null
              const isStart1 = B.STARTS[1][0] === r && B.STARTS[1][1] === c && owner == null
              const legal = owner == null && legalAnchors.has(i)
              const inPrev = preview.cells.has(i)
              let cls = 'bd-cell'
              if (isStart0) cls += ' start0'
              if (isStart1) cls += ' start1'
              if (legal && !inPrev) cls += ' legal'
              if (inPrev) cls += preview.ok ? ' preview-ok' : ' preview-bad'
              if (yourTurn && selPiece != null) cls += ' clickable'
              return (
                <div
                  key={i}
                  className={cls}
                  onMouseEnter={() => yourTurn && selPiece != null ? setHover({ r, c }) : undefined}
                  onClick={() => tryPlace(r, c)}
                >
                  {owner != null && <div className={'bd-tile p' + owner} />}
                </div>
              )
            })}
          </div>
        </div>

        <div className="side">
          <div className="panel">
            <OnlineBar net={net} />
          </div>
          <div className="panel bd-score">
            <div className={'bd-row' + (yourTurn ? ' on' : '')}>
              <span className={'bd-chip p' + me} />
              <span className="bd-who">You</span>
              <span className="bd-cells">{myScore}<small>/{B.TOTAL_CELLS}</small></span>
            </div>
            <div className={'bd-row' + (s.turn === opp && s.winner == null ? ' on' : '')}>
              <span className={'bd-chip p' + opp} />
              <span className="bd-who">{oppLabel}</span>
              <span className="bd-cells">{oppScore}<small>/{B.TOTAL_CELLS}</small></span>
            </div>
          </div>

          <div className="panel bd-control">
            <div className="bd-ctitle">selected piece</div>
            <div className="bd-preview">
              {selShape
                ? <ShapeGrid shape={selShape} cell="bd-pgrid" on="bd-pcell on" off="bd-pcell off" />
                : <span className="bd-hint">none — pick one below</span>}
            </div>
            <div className="bd-ctrls">
              <button className="bd-cbtn" disabled={selPiece == null} onClick={rotateSel}>Rotate</button>
              <button className="bd-cbtn" disabled={selPiece == null} onClick={flipSel}>Flip</button>
            </div>
            {yourTurn && !youCanMove && (
              <button className="bd-cbtn primary" onClick={passTurn}>Pass — no moves</button>
            )}
            <div className="bd-hint">
              {yourTurn
                ? (selPiece == null ? 'pick a piece, then click a glowing square' : 'R rotate · F flip · click to drop')
                : (s.winner == null ? (net.online ? 'waiting for the opponent…' : 'the AI is thinking…') : 'game over')}
            </div>
          </div>

          <div className="bd-tray-wrap">
            <div className="bd-ctitle">your pieces · {myRemaining.length} left</div>
            <div className="bd-tray panel">
              {B.PIECES.map(p => {
                const have = myRemaining.includes(p.id)
                if (!have) return null
                const shape = B.ORIENTS[p.id][p.id === selPiece ? orient : 0]
                return (
                  <div
                    key={p.id}
                    className={'bd-piece' + (selPiece === p.id ? ' sel' : '') + (yourTurn ? '' : ' dim')}
                    onClick={() => { if (yourTurn) { setSelPiece(p.id); setOrient(0); setHover(null) } }}
                  >
                    <ShapeGrid shape={shape} cell="bd-mini" on="bd-mcell on" off="bd-mcell off" />
                  </div>
                )
              })}
            </div>
          </div>

          <div className="panel logbox" ref={logRef}>
            {s.log.slice().reverse().map((l, i) => <div key={i} className={'log-line ' + l.t}>{l.x}</div>)}
          </div>
        </div>
      </GameShell>

      {s.winner != null && (
        <ResultModal s={s} me={me} opp={opp} oppLabel={oppLabel} onNew={newGame} />
      )}
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </>
  )
}

function ResultModal({ s, me, opp, oppLabel, onNew }: { s: State; me: Player; opp: Player; oppLabel: string; onNew: () => void }) {
  const won = s.winner === me
  const draw = s.winner === -1
  return (
    <Modal
      eyebrow={draw ? 'Dead even' : won ? 'Board claimed' : 'Outplaced'}
      title={draw ? 'Draw' : won ? 'You Win' : `${oppLabel} Wins`}
      closeOnOverlay={false}
      actions={<button className="btn-modal" onClick={onNew}>Play again</button>}
    >
      <div className="finalsc">
        <span className="you">You {s.scores[me]}</span>
        <span className="foe">{oppLabel} {s.scores[opp]}</span>
      </div>
    </Modal>
  )
}

function RulesModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal eyebrow="How to play" title="Blokus Duo" onClose={onClose}
      actions={<button className="btn-modal" onClick={onClose}>Got it</button>}>
      <div className="modal-body">
        <p>You and the AI share a <b>14×14</b> board. Each side owns the same <b>21 polyominoes</b> — every shape from a single square up to all twelve five-square pentominoes (89 squares in all).</p>
        <p>Your <b>first piece</b> must cover your start square (the teal ring). Every <b>later piece</b> must touch one of your own pieces at a <i>corner</i> (diagonally) and may <i>never</i> share an <b>edge</b> with your own color. Edges and corners may freely touch the <b>opponent</b>. No overlaps.</p>
        <p>Pick a piece from your tray, <b>R</b> to rotate and <b>F</b> to flip, then click a glowing square — that square becomes the piece's top-left anchor. Glowing dots mark legal anchor squares.</p>
        <p>When you have <i>no</i> legal move you <b>pass</b> (press P). When both sides are stuck the game ends. The player who has <b>placed the most squares wins</b>.</p>
        <p><b>Keys:</b> <kbd>R</kbd> rotate · <kbd>F</kbd> flip · <kbd>P</kbd> pass · <kbd>N</kbd> new game · <kbd>?</kbd> rules · <kbd>Esc</kbd> deselect.</p>
      </div>
    </Modal>
  )
}
