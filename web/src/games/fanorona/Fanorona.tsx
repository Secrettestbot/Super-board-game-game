/* FANORONA (Fanoron-Tsivy) — UI (built for this codebase). A 5x9 Malagasy line board on the
   framework shell, vs an alpha-beta AI or a remote opponent. Click your piece to see its legal
   destinations (only captures when a capture exists — it's mandatory); click a destination; if a
   move can capture by both approach and withdrawal you choose; continue or end a capture chain.
   Capture all to win. Online play is host-authoritative via useGameSession — you sit on your seat
   (White = seat 0, Black = seat 1) and everything renders relative to it. */

import { useMemo, useState } from 'react'
import { GameShell } from '../../framework/GameShell'
import { Modal } from '../../framework/Modal'
import { useGameKeys } from '../../framework/useGameKeys'
import { OnlineBar } from '../../framework/OnlineBar'
import { useGameSession } from '../../net/useGameSession'
import { fanoronaAdapter, SEAT_PIECE } from './net'
import * as FN from './logic'
import type { Move, Piece } from './logic'

const { ROWS, COLS, rc, isStrong, neighbours } = FN
const CELL = 64                       // svg layout unit (board scales via viewBox)
const PAD = 40
const W = PAD * 2 + (COLS - 1) * CELL
const H = PAD * 2 + (ROWS - 1) * CELL
const px = (i: number) => { const [r, c] = rc(i); return { x: PAD + c * CELL, y: PAD + r * CELL } }

const TITLE_MARK = (
  <svg className="title-mark" viewBox="0 0 48 48" aria-hidden="true">
    <rect x="3" y="3" width="42" height="42" rx="9" fill="#6e2c14" stroke="#b8642e" strokeWidth="1.5" />
    <g stroke="#e7b770" strokeWidth="1.4" opacity="0.9">
      <path d="M10 14 H38 M10 24 H38 M10 34 H38 M10 14 V34 M24 14 V34 M38 14 V34 M10 14 L38 34 M38 14 L10 34" fill="none" />
    </g>
    <circle cx="17" cy="24" r="4" fill="#f0e9d8" stroke="#9a8f76" strokeWidth="0.6" />
    <circle cx="31" cy="24" r="4" fill="#211a16" stroke="#000" strokeWidth="0.6" />
  </svg>
)

// precompute the unique board line segments (each adjacency once)
const SEGMENTS: [number, number][] = (() => {
  const seen = new Set<string>()
  const out: [number, number][] = []
  for (let i = 0; i < FN.N; i++) {
    for (const j of neighbours(i)) {
      const key = Math.min(i, j) + '-' + Math.max(i, j)
      if (seen.has(key)) continue
      seen.add(key); out.push([i, j])
    }
  }
  return out
})()

export function Fanorona() {
  const { state: s, mySeat, isMyTurn, dispatch, newGame: netNew, net } = useGameSession(fanoronaAdapter)
  const myPiece: Piece = SEAT_PIECE[mySeat]            // seat 0 = white, seat 1 = black
  const oppPiece: Piece = FN.other(myPiece)
  const [showRules, setShowRules] = useState(false)
  const [sel, setSel] = useState<number | null>(null)
  const [pending, setPending] = useState<{ from: number; to: number; opts: Move[] } | null>(null)

  function newGame() { netNew(); setSel(null); setPending(null); setShowRules(false) }

  useGameKeys({
    onNew: newGame,
    onToggleRules: () => setShowRules(v => !v),
    onEscape: () => { if (pending) setPending(null); else if (sel !== null) setSel(null); else setShowRules(false) },
  })

  const yourTurn = !s.winner && isMyTurn
  const legal = useMemo(() => yourTurn ? FN.legalMoves(s) : [], [yourTurn, s])
  const movablePieces = useMemo(() => new Set(legal.map(m => m.from)), [legal])
  const { w, b } = FN.counts(s.board)
  const myCount = myPiece === 'w' ? w : b
  const oppCount = myPiece === 'w' ? b : w

  // when a chain is in progress (and it's mine) the active piece is forced-selected
  const activeSel = (yourTurn && s.chainAt !== null) ? s.chainAt : sel
  const destsFor = useMemo(() => {
    const map = new Map<number, Move[]>()
    if (activeSel === null) return map
    for (const m of legal) if (m.from === activeSel) { const a = map.get(m.to) || []; a.push(m); map.set(m.to, a) }
    return map
  }, [legal, activeSel])

  const inChain = yourTurn && s.chainAt !== null

  function clickPiece(i: number) {
    if (!yourTurn || pending) return
    if (s.chainAt !== null) return            // locked to the chaining piece
    if (movablePieces.has(i)) setSel(prev => prev === i ? null : i)
  }

  function clickDest(to: number) {
    if (!yourTurn || activeSel === null) return
    const opts = destsFor.get(to)
    if (!opts || !opts.length) return
    if (opts.length === 1) { commit(opts[0]); return }
    setPending({ from: activeSel, to, opts })   // approach vs withdrawal choice
  }

  function commit(m: Move) {
    setPending(null)
    setSel(null)
    dispatch({ kind: 'move', from: m.from, to: m.to, cap: m.kind })
  }

  function endChain() { dispatch({ kind: 'stop' }) }

  const oppLabel = net.online ? 'Opponent' : 'Rival'
  const myWin = s.winner === myPiece
  const oppWin = s.winner === oppPiece

  let banner: string, bk = ''
  if (myWin) { bk = 'win'; banner = 'You win — every rival piece captured' }
  else if (oppWin) { bk = 'lose'; banner = `${oppLabel} wins — you were wiped out` }
  else if (inChain) { bk = 'you'; banner = 'Capture chain — continue or end your turn' }
  else if (yourTurn) { bk = 'you'; banner = legal.some(m => m.kind) ? 'Your turn — a capture is forced' : 'Your turn — slide a piece' }
  else { bk = 'foe'; banner = net.online ? `${oppLabel} is moving…` : 'The rival is thinking…' }

  const myToMove = s.turn === myPiece && !s.winner
  const oppToMove = s.turn === oppPiece && !s.winner

  return (
    <>
      <GameShell
        mark={TITLE_MARK}
        eyebrow="Fanorona · approach &amp; withdrawal"
        title="Fanorona"
        subtitle="slide along the lines to flank an enemy file — capture is forced, and chains run deep"
        onRules={() => setShowRules(true)}
        onNew={newGame}
        modeLeft="5 × 9 · Fanoron-Tsivy"
        banner={banner}
        bannerClass={bk}
        modeRight={<>N · new &nbsp; ? · rules</>}
      >
        <div className="fn-wrap">
          <svg className="fn-board" viewBox={`0 0 ${W} ${H}`} role="img">
            <rect className="fn-bg" x="0" y="0" width={W} height={H} rx="14" />
            <g className="fn-lines">
              {SEGMENTS.map(([i, j], k) => {
                const a = px(i), bp = px(j)
                return <line key={k} x1={a.x} y1={a.y} x2={bp.x} y2={bp.y} />
              })}
            </g>
            {/* last-move trail */}
            {s.last && (() => { const a = px(s.last.from), bp = px(s.last.to); return <line className="fn-trail" x1={a.x} y1={a.y} x2={bp.x} y2={bp.y} /> })()}
            {/* node markers (faint) */}
            {Array.from({ length: FN.N }, (_, i) => {
              const p = px(i)
              const strong = isStrong(i)
              return <circle key={'n' + i} cx={p.x} cy={p.y} r={strong ? 3.5 : 2.5} className={'fn-node' + (strong ? ' strong' : '')} />
            })}
            {Array.from(destsFor.keys()).map(to => {
              const p = px(to)
              const cap = (destsFor.get(to) || []).some(m => m.kind)
              return <circle key={'d' + to} cx={p.x} cy={p.y} r={11} className={'fn-hint' + (cap ? ' cap' : '')} onClick={() => clickDest(to)} />
            })}
            {s.board.map((v, i) => {
              if (!v) return null
              const p = px(i)
              const selected = activeSel === i
              const movable = yourTurn && s.chainAt === null && movablePieces.has(i)
              return (
                <g key={'p' + i} className={'fn-piece-g' + (movable ? ' movable' : '')} onClick={() => clickPiece(i)}>
                  <circle cx={p.x} cy={p.y} r={15} className={'fn-piece ' + v + (selected ? ' sel' : '')} />
                </g>
              )
            })}
          </svg>
        </div>

        <div className="side">
          <div className="panel">
            <OnlineBar net={net} />
          </div>

          <div className="panel scoreboard">
            <div className={'sc ' + myPiece + (myToMove ? ' on' : '')}>
              <span className={'sc-disc ' + myPiece}></span><span className="sc-name">You · {myPiece === 'w' ? 'White' : 'Black'}</span><span className="sc-n">{myCount}</span>
            </div>
            <div className={'sc ' + oppPiece + (oppToMove ? ' on' : '')}>
              <span className={'sc-disc ' + oppPiece}></span><span className="sc-name">{oppLabel} · {oppPiece === 'w' ? 'White' : 'Black'}</span><span className="sc-n">{oppCount}</span>
            </div>
            <div className="sc-bar"><div className="sc-bar-w" style={{ width: `${(myCount / (myCount + oppCount || 1)) * 100}%` }} /></div>
          </div>

          {inChain && (
            <div className="panel chainbox">
              <div className="panel-l">Capture chain</div>
              <p>This piece can keep capturing. Pick another flash to continue, or end your turn.</p>
              <button className="fn-end" onClick={endChain}>End turn</button>
            </div>
          )}

          <div className="panel logbox">{s.log.slice().reverse().map((l, i) => <div key={i} className={'log-line ' + l.t}>{l.x}</div>)}</div>
        </div>
      </GameShell>

      {pending && (
        <Modal
          eyebrow="Two captures available"
          title="Approach or Withdrawal?"
          onClose={() => setPending(null)}
          actions={
            <>
              {pending.opts.find(o => o.kind === 'approach') && (
                <button className="btn-modal" onClick={() => commit(pending.opts.find(o => o.kind === 'approach')!)}>Approach</button>
              )}
              {pending.opts.find(o => o.kind === 'withdrawal') && (
                <button className="btn-modal" onClick={() => commit(pending.opts.find(o => o.kind === 'withdrawal')!)}>Withdrawal</button>
              )}
            </>
          }
        >
          <div className="modal-body">
            <p><b>Approach</b> captures the enemy line ahead of where you land. <b>Withdrawal</b> captures the line behind where you started. Choose which file to sweep.</p>
          </div>
        </Modal>
      )}

      {s.winner && <ResultModal won={myWin} oppLabel={oppLabel} myCount={myCount} oppCount={oppCount} onNew={newGame} />}
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </>
  )
}

function ResultModal({ won, oppLabel, myCount, oppCount, onNew }: { won: boolean; oppLabel: string; myCount: number; oppCount: number; onNew: () => void }) {
  return (
    <Modal
      eyebrow={won ? 'Total capture' : 'Swept off the board'}
      title={won ? 'You Win' : `${oppLabel} Wins`}
      closeOnOverlay={false}
      actions={<button className="btn-modal" onClick={onNew}>Play again</button>}
    >
      <div className="finalsc"><span className="you">You {myCount}</span><span className="foe">{oppLabel} {oppCount}</span></div>
    </Modal>
  )
}

function RulesModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal eyebrow="How to play" title="Fanorona" onClose={onClose}
      actions={<button className="btn-modal" onClick={onClose}>Begin</button>}>
      <div className="modal-body">
        <p>You are <b>White</b> and move first. A piece slides one step along a drawn <b>line</b> to an adjacent empty point. Strong points (where the diagonals meet) connect eight ways; weak points only four.</p>
        <p>You capture by lining up against an enemy file. <b>Approach:</b> land so the next point ahead — in your move's direction — holds an enemy; that piece and every contiguous enemy behind it are taken. <b>Withdrawal:</b> step away from an enemy sitting directly behind you; that whole file is taken. If both are possible you <i>choose</i>.</p>
        <p><b>Capturing is mandatory</b> — if any capture exists you must capture. After a capture the same piece may <b>chain</b> another capture in a new direction (never repeating a direction or revisiting a point); continue or stop. A turn with no capture is a single quiet step.</p>
        <p><b>Capture every rival piece to win.</b></p>
        <p><b>Keys:</b> <kbd>N</kbd> new game · <kbd>?</kbd> rules · <kbd>Esc</kbd> deselect / close.</p>
      </div>
    </Modal>
  )
}
