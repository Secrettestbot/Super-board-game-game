/* ALQUERQUE — UI (built for this codebase). The ancient incised-stone 5x5 lattice on the framework
   shell, vs an alpha-beta AI or a remote opponent. Click a piece to see its steps and capture jumps
   along the lattice lines; capturing is mandatory and multi-jumps chain. Capture every rival piece to
   win. Online play is seat-relative: seat 0 = White (Bone), seat 1 = Black (Obsidian). */

import { useMemo, useState } from 'react'
import { GameShell } from '../../framework/GameShell'
import { Modal } from '../../framework/Modal'
import { useGameKeys } from '../../framework/useGameKeys'
import { OnlineBar } from '../../framework/OnlineBar'
import { useGameSession } from '../../net/useGameSession'
import { alquerqueAdapter } from './net'
import * as AQ from './logic'
import type { AlquerqueState, Move, Side } from './logic'

const { N } = AQ

const SIDE: Side[] = ['w', 'b'] // seat 0 -> White, seat 1 -> Black

// Lattice geometry in an N×N unit field, points at integer coords 0..N-1.
const STEP = 100 / (N - 1)
const px = (i: number) => `${(i % N) * STEP}%`
const py = (i: number) => `${Math.floor(i / N) * STEP}%`
const cx = (i: number) => (i % N) * STEP
const cy = (i: number) => Math.floor(i / N) * STEP

// Pre-compute the connecting line segments (each undirected edge once) for the engraved board.
const EDGES: Array<[number, number]> = (() => {
  const seen = new Set<string>()
  const out: Array<[number, number]> = []
  for (let i = 0; i < N * N; i++) {
    for (const j of AQ.neighbors(i)) {
      const key = i < j ? `${i}-${j}` : `${j}-${i}`
      if (seen.has(key)) continue
      seen.add(key)
      out.push([Math.min(i, j), Math.max(i, j)])
    }
  }
  return out
})()

const TITLE_MARK = (
  <svg className="title-mark" viewBox="0 0 48 48" aria-hidden="true">
    <rect x="3" y="3" width="42" height="42" rx="7" fill="#2a241c" stroke="#5a4d3a" strokeWidth="1.5" />
    <g stroke="#7a6a4e" strokeWidth="1.2" strokeLinecap="round">
      <path d="M12 12 H36 M12 24 H36 M12 36 H36 M12 12 V36 M24 12 V36 M36 12 V36" />
      <path d="M12 12 L36 36 M36 12 L12 36" />
    </g>
    <circle cx="12" cy="12" r="3.4" fill="#ece4d2" />
    <circle cx="36" cy="36" r="3.4" fill="#1a1712" stroke="#000" strokeWidth="0.5" />
  </svg>
)

export function Alquerque() {
  const { state: s, mySeat, isMyTurn, dispatch, newGame: netNew, net } = useGameSession(alquerqueAdapter)
  const mySide = SIDE[mySeat]                      // your colour
  const oppSide: Side = mySide === 'w' ? 'b' : 'w' // your opponent's colour
  const [showRules, setShowRules] = useState(false)
  const [sel, setSel] = useState<number | null>(null)

  function newGame() { netNew(); setSel(null); setShowRules(false) }

  useGameKeys({
    onNew: newGame,
    onToggleRules: () => setShowRules(v => !v),
    onEscape: () => { if (showRules) setShowRules(false); else setSel(null) },
  })

  const yourTurn = !s.winner && isMyTurn

  // When mid-chain (and it's your turn), the chaining piece is auto-selected.
  const effSel = (yourTurn && s.chain !== null) ? s.chain : sel
  const moves: Move[] = useMemo(
    () => (yourTurn && effSel !== null) ? AQ.movesFor(s, effSel) : [],
    [yourTurn, effSel, s],
  )
  const destOf = useMemo(() => {
    const m = new Map<number, Move>()
    for (const mv of moves) m.set(mv.to, mv)
    return m
  }, [moves])

  // Which of your pieces can legally move right now (for the click hint).
  const movable = useMemo(() => {
    if (!yourTurn || s.turn === null) return new Set<number>()
    if (s.chain !== null) return new Set<number>([s.chain])
    return new Set(AQ.legalMoves(s.board, s.turn).map(m => m.from))
  }, [yourTurn, s])

  const mustCapture = yourTurn && s.chain === null && s.turn !== null && AQ.allCaptures(s.board, s.turn).length > 0
  const { w, b } = AQ.counts(s.board)
  const myCount = mySide === 'w' ? w : b
  const oppCount = mySide === 'w' ? b : w

  function clickPoint(i: number) {
    if (!yourTurn) return
    if (effSel !== null && destOf.has(i)) {
      const mv = destOf.get(i)!
      dispatch({ from: mv.from, to: mv.to, cap: mv.cap })
      setSel(null) // chain auto-selects via effSel after the host applies the move
      return
    }
    if (s.chain !== null) return // locked to the chaining piece
    if (s.board[i] === mySide && movable.has(i)) { setSel(i); return }
    setSel(null)
  }

  const oppLabel = net.online ? 'Opponent' : 'Rival'
  const myWin = s.winner === mySide
  const oppWin = s.winner === oppSide

  let banner: string, bk = ''
  if (myWin) { bk = 'win'; banner = `You win — ${myCount} to ${oppCount}` }
  else if (oppWin) { bk = 'lose'; banner = `${oppLabel} wins — ${oppCount} to ${myCount}` }
  else if (yourTurn && s.chain !== null) { bk = 'you'; banner = 'Keep jumping — multi-capture' }
  else if (mustCapture) { bk = 'you'; banner = 'You must capture — jump a rival' }
  else if (yourTurn) { bk = 'you'; banner = 'Your turn — move a bone piece' }
  else { bk = 'foe'; banner = net.online ? `${oppLabel} is moving…` : 'The rival is thinking…' }

  return (
    <>
      <GameShell
        mark={TITLE_MARK}
        eyebrow="Alquerque · the old stone game"
        title="Alquerque"
        subtitle="step or leap along the incised lines — chain your jumps and strip the board bare"
        onRules={() => setShowRules(true)}
        onNew={newGame}
        modeLeft="5 × 5 lattice"
        banner={banner}
        bannerClass={bk}
        modeRight={<>N · new &nbsp; ? · rules</>}
      >
        <div className="aq-wrap">
          <div className="aq-board">
            <svg className="aq-lines" viewBox="-8 -8 116 116" preserveAspectRatio="none" aria-hidden="true">
              {EDGES.map(([a, c], k) => (
                <line key={k} x1={cx(a)} y1={cy(a)} x2={cx(c)} y2={cy(c)} />
              ))}
            </svg>
            {Array.from({ length: N * N }, (_, i) => {
              const v = s.board[i]
              const isSel = effSel === i
              const isDest = destOf.has(i)
              const isCapDest = isDest && destOf.get(i)!.cap !== null
              const canPick = movable.has(i) && s.board[i] === mySide
              const cls = [
                'aq-node',
                AQ.hasDiag(i) ? 'cross' : 'plus',
                isDest ? (isCapDest ? 'jump' : 'step') : '',
                canPick ? 'pickable' : '',
              ].filter(Boolean).join(' ')
              return (
                <div
                  key={i}
                  className={cls}
                  style={{ left: px(i), top: py(i) }}
                  onClick={() => clickPoint(i)}
                >
                  <span className="aq-spot" />
                  {v && <span className={'aq-piece ' + v + (isSel ? ' sel' : '')} />}
                  {isDest && <span className="aq-hint" />}
                </div>
              )
            })}
          </div>
        </div>

        <div className="side">
          <div className="panel">
            <OnlineBar net={net} />
          </div>
          <div className="panel scoreboard">
            <div className={'sc ' + mySide + (s.turn === mySide && !s.winner ? ' on' : '')}>
              <span className={'sc-pc ' + mySide} />
              <span className="sc-name">You · {mySide === 'w' ? 'Bone' : 'Obsidian'}</span>
              <span className="sc-n">{myCount}</span>
            </div>
            <div className={'sc ' + oppSide + (s.turn === oppSide && !s.winner ? ' on' : '')}>
              <span className={'sc-pc ' + oppSide} />
              <span className="sc-name">{oppLabel} · {oppSide === 'w' ? 'Bone' : 'Obsidian'}</span>
              <span className="sc-n">{oppCount}</span>
            </div>
            <div className="sc-bar"><div className="sc-bar-w" style={{ width: `${(myCount / (myCount + oppCount)) * 100}%` }} /></div>
          </div>
          <div className="panel logbox">
            {s.log.slice().reverse().map((l, i) => <div key={i} className={'log-line ' + l.t}>{l.x}</div>)}
          </div>
        </div>
      </GameShell>

      {s.winner && <ResultModal won={myWin} myCount={myCount} oppCount={oppCount} oppLabel={oppLabel} onNew={newGame} />}
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </>
  )
}

function ResultModal({ won, myCount, oppCount, oppLabel, onNew }: { won: boolean; myCount: number; oppCount: number; oppLabel: string; onNew: () => void }) {
  return (
    <Modal
      eyebrow={won ? 'Board swept' : 'Out-jumped'}
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
    <Modal eyebrow="How to play" title="Alquerque" onClose={onClose}
      actions={<button className="btn-modal" onClick={onClose}>Begin</button>}>
      <div className="modal-body">
        <p>One of the oldest board games known. Pieces sit on the <b>nodes</b> of a 5×5 lattice. Lines connect every node <b>orthogonally</b>, and <b>diagonally</b> only where the engraved Xs run — so some nodes have eight neighbours and others four.</p>
        <p>On your turn either <b>step</b> a piece one node along a connecting line into an empty node, or <b>jump</b> an adjacent rival into the empty node directly beyond it — removing the jumped piece, checkers-style, along the lattice line.</p>
        <p><b>Capturing is mandatory:</b> if any jump exists you must take it, and a <i>multi-jump</i> chains with the same piece for as long as further captures are available.</p>
        <p><b>Capture every rival piece</b> (or leave the rival with no legal move) to win.</p>
        <p><b>Keys:</b> <kbd>N</kbd> new game · <kbd>?</kbd> rules · <kbd>Esc</kbd> deselect / close.</p>
      </div>
    </Modal>
  )
}
