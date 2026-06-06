/* CATHEDRAL — UI. A 10x10 stone field with one neutral cathedral and two rival building sets.
   Select a piece from your tray, rotate it (R / click), then click a board cell to drop its
   anchor. Enclose empty ground with your own walls to claim territory and raze a trapped rival
   building. In solo play seat 1 is a greedy AI; online, seat 1 is a remote opponent. The hook
   (useGameSession) drives the AI for any unfilled seat and keeps host/guest in sync. */

import { useMemo, useState } from 'react'
import { GameShell } from '../../framework/GameShell'
import { Modal } from '../../framework/Modal'
import { OnlineBar } from '../../framework/OnlineBar'
import { useGameKeys } from '../../framework/useGameKeys'
import { useGameSession } from '../../net/useGameSession'
import { cathedralAdapter } from './net'
import * as C from './logic'
import type { Player, Cell } from './logic'

const TITLE_MARK = (
  <svg className="title-mark" viewBox="0 0 48 48" aria-hidden="true">
    <rect x="3" y="3" width="42" height="42" rx="10" fill="#2a2620" stroke="#544b3c" strokeWidth="1.5" />
    <rect x="11" y="22" width="6" height="17" rx="1" fill="#9a8466" />
    <rect x="31" y="22" width="6" height="17" rx="1" fill="#9a8466" />
    <rect x="19" y="15" width="10" height="24" rx="1.5" fill="#c8b48c" />
    <path d="M24 5 L30 15 L18 15 Z" fill="#d8c79e" />
    <rect x="22.5" y="26" width="3" height="13" fill="#5a4f3d" />
  </svg>
)

const N = C.N

export function Cathedral() {
  const { state: s, mySeat, isMyTurn, dispatch, newGame: netNew, net } = useGameSession(cathedralAdapter)
  const me = mySeat as Player // seat 0 = you, seat 1 = rival/opponent
  const opp = (1 - me) as Player
  const [showRules, setShowRules] = useState(false)
  const [selPiece, setSelPiece] = useState<string | null>(null)
  const [ori, setOri] = useState(0)
  const [hover, setHover] = useState<number | null>(null)

  function newGame() {
    netNew()
    setSelPiece(null)
    setOri(0)
    setHover(null)
    setShowRules(false)
  }

  const yourTurn = s.winner == null && isMyTurn

  const oris = useMemo(() => (selPiece ? C.orientations(selPiece) : []), [selPiece])
  const curOri = oris.length ? oris[ori % oris.length] : null

  function selectPiece(id: string) {
    if (!yourTurn) return
    if (selPiece === id) {
      setOri((o) => (oris.length ? (o + 1) % oris.length : 0))
    } else {
      setSelPiece(id)
      setOri(0)
    }
  }

  function rotateSel() {
    if (!selPiece) return
    setOri((o) => (oris.length ? (o + 1) % oris.length : 0))
  }

  useGameKeys({
    onNew: newGame,
    onToggleRules: () => setShowRules((v) => !v),
    onEscape: () => {
      if (showRules) setShowRules(false)
      else setSelPiece(null)
    },
    extra: (e) => {
      if ((e.key === 'r' || e.key === 'R') && selPiece) {
        rotateSel()
        return true
      }
      return false
    },
  })

  // Given an anchor cell, compute the absolute cells of the current orientation, clamped check.
  function cellsAt(anchor: number): number[] | null {
    if (!curOri) return null
    const ar = Math.floor(anchor / N)
    const ac = anchor % N
    const cells: number[] = []
    for (const [dr, dc] of curOri) {
      const r = ar + dr
      const c = ac + dc
      if (!C.inBounds(r, c)) return null
      cells.push(C.idx(r, c))
    }
    return cells
  }

  // Preview cells (and whether the placement is legal) for the hovered anchor.
  const preview = useMemo(() => {
    if (!yourTurn || hover == null || !selPiece) return { cells: new Set<number>(), legal: false }
    const cells = cellsAt(hover)
    if (!cells) return { cells: new Set<number>(), legal: false }
    const sorted = [...cells].sort((a, b) => a - b)
    const legal = C.placementsForPiece(s, me, selPiece).some(
      (pl) => pl.cells.length === sorted.length && [...pl.cells].sort((a, b) => a - b).every((v, i) => v === sorted[i]),
    )
    return { cells: new Set(cells), legal }
  }, [yourTurn, hover, selPiece, ori, s, oris, me])

  function clickCell(i: number) {
    if (!yourTurn || !selPiece) return
    const cells = cellsAt(i)
    if (!cells) return
    // validate locally so we don't clear selection on an illegal drop
    const sorted = [...cells].sort((a, b) => a - b)
    const legal = C.placementsForPiece(s, me, selPiece).some(
      (pl) => pl.cells.length === sorted.length && [...pl.cells].sort((a, b) => a - b).every((v, k) => v === sorted[k]),
    )
    if (!legal) return
    dispatch({ piece: selPiece, cell: i, orientation: ori % (oris.length || 1) })
    // the piece is consumed — clear selection.
    setSelPiece(null)
    setHover(null)
  }

  const oppLabel = net.online ? 'The opponent' : 'The rival'

  // ----- banner (relative to your seat) -----
  let banner: string
  let bk = ''
  if (s.winner === me) {
    bk = 'win'
    banner = 'You win — the most ground built'
  } else if (s.winner === opp) {
    bk = 'lose'
    banner = `${oppLabel} builds the most — you lose`
  } else if (s.winner === 'tie') {
    bk = ''
    banner = 'A draw — equal ground held'
  } else if (yourTurn) {
    bk = 'you'
    banner = selPiece ? 'Place your building — click the board' : 'Your move — pick a building'
  } else {
    bk = 'foe'
    banner = `${oppLabel} is building…`
  }

  const youLeft = C.leftoverSquares(s, me)
  const aiLeft = C.leftoverSquares(s, opp)

  return (
    <>
      <GameShell
        mark={TITLE_MARK}
        eyebrow="Cathedral · territory & walls"
        title="Cathedral"
        subtitle="raise your buildings around the neutral cathedral — wall off ground to claim it and raze trapped rival halls; build the most to win"
        onRules={() => setShowRules(true)}
        onNew={newGame}
        modeLeft={`Leftover — You ${youLeft} · Rival ${aiLeft}`}
        banner={banner}
        bannerClass={bk}
        modeRight={
          <>
            click · place &nbsp; R · rotate &nbsp; N · new
          </>
        }
      >
        <div className="ca-wrap">
          <div className="ca-board-wrap">
            <div
              className="ca-board"
              onMouseLeave={() => setHover(null)}
            >
              {s.board.map((cell, i) => {
                const inPrev = preview.cells.has(i)
                return (
                  <CellView
                    key={i}
                    cell={cell}
                    me={me}
                    inPreview={inPrev}
                    previewLegal={preview.legal}
                    selectable={yourTurn && selPiece != null}
                    onEnter={() => setHover(i)}
                    onClick={() => clickCell(i)}
                  />
                )
              })}
            </div>
          </div>

          <div className="side">
            <div className="panel">
              <OnlineBar net={net} />
            </div>

            <div className="panel ca-score">
              <div className={'ca-srow' + (yourTurn ? ' on' : '')}>
                <span className="ca-chip you" />
                <span className="ca-who">You</span>
                <span className="ca-left">{C.placedSquares(s, me)} built</span>
              </div>
              <div className={'ca-srow' + (s.turn === opp && s.winner == null ? ' on' : '')}>
                <span className="ca-chip foe" />
                <span className="ca-who">{net.online ? 'Opponent' : 'Rival'}</span>
                <span className="ca-left">{C.placedSquares(s, opp)} built</span>
              </div>
              <div className="ca-leftnote">
                fewest leftover squares wins · you {youLeft} · {net.online ? 'opponent' : 'rival'} {aiLeft}
              </div>
            </div>

            <div className="panel ca-tray">
              <div className="panel-l">your buildings</div>
              <div className="ca-pieces">
                {C.PIECES.map((pc) => {
                  const have = s.remaining[me].includes(pc.id)
                  if (!have) return null
                  const sel = selPiece === pc.id
                  const shape = sel && curOri ? curOri : pc.cells
                  return (
                    <button
                      key={pc.id}
                      className={'ca-piece' + (sel ? ' sel' : '')}
                      disabled={!yourTurn}
                      onClick={() => selectPiece(pc.id)}
                      title={pc.name + ' (' + pc.size + ')'}
                    >
                      <PieceGlyph cells={shape} />
                      <span className="ca-pname">{pc.name}</span>
                    </button>
                  )
                })}
                {s.remaining[me].length === 0 && <div className="ca-empty">all built</div>}
              </div>
              {selPiece && (
                <button className="ca-rotate" onClick={rotateSel} disabled={!yourTurn}>
                  Rotate ↻
                </button>
              )}
            </div>

            <div className="panel logbox ca-log">
              {s.log
                .slice()
                .reverse()
                .map((l, i) => (
                  <div key={i} className={'log-line ' + l.t}>
                    {l.x}
                  </div>
                ))}
            </div>
          </div>
        </div>
      </GameShell>

      {s.winner != null && (
        <ResultModal won={s.winner === me} tie={s.winner === 'tie'} you={youLeft} ai={aiLeft} online={net.online} onNew={newGame} />
      )}
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </>
  )
}

function CellView({
  cell,
  me,
  inPreview,
  previewLegal,
  selectable,
  onEnter,
  onClick,
}: {
  cell: Cell
  me: Player
  inPreview: boolean
  previewLegal: boolean
  selectable: boolean
  onEnter: () => void
  onClick: () => void
}) {
  const myTerr = me === 0 ? 't0' : 't1'
  const oppTerr = me === 0 ? 't1' : 't0'
  let cls = 'ca-cell'
  if (cell === me) cls += ' you'
  else if (cell === (1 - me)) cls += ' foe'
  else if (cell === 'cath') cls += ' cath'
  else if (cell === myTerr) cls += ' terr-you'
  else if (cell === oppTerr) cls += ' terr-foe'
  if (inPreview) cls += previewLegal ? ' prev-ok' : ' prev-bad'
  if (selectable) cls += ' pickable'
  return <div className={cls} onMouseEnter={onEnter} onClick={onClick} />
}

function PieceGlyph({ cells }: { cells: [number, number][] }) {
  const maxR = Math.max(...cells.map((c) => c[0]))
  const maxC = Math.max(...cells.map((c) => c[1]))
  const set = new Set(cells.map((c) => c[0] + ':' + c[1]))
  const rows = []
  for (let r = 0; r <= maxR; r++) {
    const cols = []
    for (let c = 0; c <= maxC; c++) {
      cols.push(<span key={c} className={'ca-gcell' + (set.has(r + ':' + c) ? ' on' : '')} />)
    }
    rows.push(
      <div key={r} className="ca-grow">
        {cols}
      </div>,
    )
  }
  return <div className="ca-glyph">{rows}</div>
}

function ResultModal({
  won,
  tie,
  you,
  ai,
  online,
  onNew,
}: {
  won: boolean
  tie: boolean
  you: number
  ai: number
  online: boolean
  onNew: () => void
}) {
  const oppName = online ? 'Opponent' : 'Rival'
  return (
    <Modal
      eyebrow={tie ? 'Even ground' : won ? 'Ground held' : 'Outbuilt'}
      title={tie ? 'A Draw' : won ? 'You Win' : `${oppName} Wins`}
      closeOnOverlay={false}
      actions={<button className="btn-modal" onClick={onNew}>Build again</button>}
    >
      <div className="ca-final">
        <div className="ca-fscore">
          <span className="you">You · {you} leftover</span>
          <span className="foe">{oppName} · {ai} leftover</span>
        </div>
        <p className="ca-fnote">
          {tie
            ? 'Both of you left the same ground unbuilt.'
            : won
              ? 'You squeezed the most buildings onto the field.'
              : `The ${oppName.toLowerCase()} fit more of its set onto the board.`}
        </p>
      </div>
    </Modal>
  )
}

function RulesModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal
      eyebrow="How to play"
      title="Cathedral"
      onClose={onClose}
      actions={<button className="btn-modal" onClick={onClose}>Start building</button>}
    >
      <div className="modal-body">
        <p>
          A neutral <b>cathedral</b> stands at the centre of a <b>10×10</b> field. You and the
          rival each hold an identical set of <b>building polyominoes</b>. Take turns placing one
          piece on empty (or your own claimed) ground — no overlaps, within bounds. Pieces may
          <b> rotate but not flip</b>.
        </p>
        <p>
          When a piece you place, together with your other buildings and the board edges, fully
          <b> encloses</b> an empty region, you <b>claim</b> it. If that region holds <b>at most
          one</b> rival building and no cathedral, the trapped building is <b>razed</b> (returned
          to the rival) and the ground becomes yours — only you may build there afterward.
        </p>
        <p>
          The game ends when neither side can place. The player with the <b>fewest leftover
          squares</b> — i.e. who built the most — <b>wins</b>.
        </p>
        <p>
          <b>Keys:</b> <kbd>click</kbd> place · <kbd>R</kbd> rotate · <kbd>N</kbd> new · <kbd>?</kbd>{' '}
          rules · <kbd>Esc</kbd> deselect.
        </p>
      </div>
    </Modal>
  )
}
