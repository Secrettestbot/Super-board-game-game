/* DOTS AND BOXES — UI (built for this codebase). A 4x4 blueprint board on the framework shell.
   Click thin edge slots between dots to draw; closing a box claims it and grants another move.
   Online-capable via useGameSession: seat 0 = 'you' (first), seat 1 = 'ai'/remote. The hook
   drives the AI for any empty seat, so this component carries no useAITurn of its own — and
   because completing a box keeps the same seat to move, the hook simply lets you keep going
   while isMyTurn stays true. Everything (your side, score, banners, result) is relative to
   mySeat, so a guest sitting in seat 1 sees their own boxes as "You". */

import { useMemo, useState } from 'react'
import { GameShell } from '../../framework/GameShell'
import { Modal } from '../../framework/Modal'
import { useGameKeys } from '../../framework/useGameKeys'
import { OnlineBar } from '../../framework/OnlineBar'
import { useGameSession } from '../../net/useGameSession'
import { dotsBoxesAdapter } from './net'
import * as DB from './logic'
import type { EdgeId, Player } from './logic'

const { SIZE, DOTS } = DB

const TITLE_MARK = (
  <svg className="title-mark" viewBox="0 0 48 48" aria-hidden="true">
    <rect x="3" y="3" width="42" height="42" rx="9" fill="#0e1c24" stroke="#1f4d5e" strokeWidth="1.5" />
    <rect x="14" y="14" width="20" height="20" rx="2" fill="#11808f" opacity="0.28" stroke="#37d2e0" strokeWidth="1.6" />
    <circle cx="14" cy="14" r="2.6" fill="#cfe9ee" />
    <circle cx="34" cy="14" r="2.6" fill="#cfe9ee" />
    <circle cx="14" cy="34" r="2.6" fill="#cfe9ee" />
    <circle cx="34" cy="34" r="2.6" fill="#ee6f5e" />
  </svg>
)

export function DotsBoxes() {
  const { state: s, mySeat, isMyTurn, dispatch, newGame: netNew, net } = useGameSession(dotsBoxesAdapter)
  const [showRules, setShowRules] = useState(false)

  // Seat-relative sides: seat 0 = 'you', seat 1 = 'ai'. "mine" is always rendered as You.
  const mySide: Player = mySeat === 0 ? 'you' : 'ai'
  const oppSide: Player = mySeat === 0 ? 'ai' : 'you'
  const oppLabel = net.online ? 'Opponent' : 'Rival'

  function newGame() { netNew(); setShowRules(false) }

  const yourTurn = !s.winner && isMyTurn

  function clickEdge(id: EdgeId) { if (yourTurn && !s.edges[id]) dispatch({ edge: id }) }

  useGameKeys({ onNew: newGame, onToggleRules: () => setShowRules(v => !v), onEscape: () => setShowRules(false) })

  // Scores relative to my seat: "mine" / "theirs".
  const raw = DB.counts(s.owners)
  const mine = mySide === 'you' ? raw.you : raw.ai
  const theirs = mySide === 'you' ? raw.ai : raw.you
  const total = SIZE * SIZE

  // ----- board geometry (CSS grid of 2*SIZE+1 tracks each way) -----
  const dots = useMemo(() => {
    const out: { r: number; c: number }[] = []
    for (let r = 0; r < DOTS; r++) for (let c = 0; c < DOTS; c++) out.push({ r, c })
    return out
  }, [])

  const iWon = s.winner === mySide
  let banner: string, bk = ''
  if (iWon) { bk = 'win'; banner = `You win — ${mine} to ${theirs}` }
  else if (s.winner === oppSide) { bk = 'lose'; banner = `${oppLabel} wins — ${theirs} to ${mine}` }
  else if (s.winner === 'draw') { bk = ''; banner = `A tie — ${mine}–${theirs}` }
  else if (yourTurn) { bk = 'you'; banner = 'Your turn — draw an edge' }
  else { bk = 'foe'; banner = net.online ? `${oppLabel} is moving…` : `${oppLabel} is thinking…` }

  const trackPos = (i: number) => i * 2 + 1                 // dot at even index -> grid line
  const span = (a: number) => `${a} / span 1`

  // CSS classes for a drawn edge / filled box are keyed by ownership relative to me:
  // 'you' class for my marks, 'ai' class for the opponent's, regardless of seat.
  const ownClass = (o: Player) => (o === mySide ? 'you' : 'ai')

  return (
    <>
      <GameShell
        mark={TITLE_MARK}
        eyebrow="Dots &amp; Boxes · claim the grid"
        title="Dots &amp; Boxes"
        subtitle="join the dots to close squares — finish a box to claim it and draw again"
        onRules={() => setShowRules(true)}
        onNew={newGame}
        modeLeft={`${SIZE} × ${SIZE} boxes`}
        banner={banner}
        bannerClass={bk}
        modeRight={<>N · new &nbsp; ? · rules</>}
      >
        <div className="db-wrap">
          <div className="db-board">
            {/* box fills */}
            {s.owners.map((o, i) => {
              const r = Math.floor(i / SIZE), c = i % SIZE
              return (
                <div
                  key={'box-' + i}
                  className={'db-box' + (o ? ' filled ' + ownClass(o) : '')}
                  style={{ gridColumn: span(trackPos(c) + 1), gridRow: span(trackPos(r) + 1) }}
                >
                  {o && <span className="db-init">{o === mySide ? 'Y' : 'R'}</span>}
                </div>
              )
            })}

            {/* horizontal edges */}
            {Array.from({ length: SIZE + 1 }).flatMap((_, r) =>
              Array.from({ length: SIZE }).map((__, c) => {
                const id = `h-${r}-${c}`
                const drawn = s.edges[id]
                return (
                  <div
                    key={id}
                    className={'db-edge h' + (drawn ? ' drawn ' + ownClass(drawn) : '') + (s.last === id ? ' last' : '') + (yourTurn && !drawn ? ' open' : '')}
                    style={{ gridColumn: span(trackPos(c) + 1), gridRow: span(trackPos(r)) }}
                    onClick={() => clickEdge(id)}
                  >
                    <span className="db-line" />
                  </div>
                )
              })
            )}

            {/* vertical edges */}
            {Array.from({ length: SIZE }).flatMap((_, r) =>
              Array.from({ length: SIZE + 1 }).map((__, c) => {
                const id = `v-${r}-${c}`
                const drawn = s.edges[id]
                return (
                  <div
                    key={id}
                    className={'db-edge v' + (drawn ? ' drawn ' + ownClass(drawn) : '') + (s.last === id ? ' last' : '') + (yourTurn && !drawn ? ' open' : '')}
                    style={{ gridColumn: span(trackPos(c)), gridRow: span(trackPos(r) + 1) }}
                    onClick={() => clickEdge(id)}
                  >
                    <span className="db-line" />
                  </div>
                )
              })
            )}

            {/* dots on top */}
            {dots.map(({ r, c }) => (
              <div key={`d-${r}-${c}`} className="db-dot" style={{ gridColumn: span(trackPos(c)), gridRow: span(trackPos(r)) }} />
            ))}
          </div>
        </div>

        <div className="side">
          <div className="panel"><OnlineBar net={net} /></div>
          <div className="panel scoreboard">
            <div className={'sc you' + (yourTurn ? ' on' : '')}>
              <span className="sc-chip you" />
              <span className="sc-name">You</span>
              <span className="sc-n">{mine}</span>
            </div>
            <div className={'sc ai' + (!s.winner && !isMyTurn && s.turn != null ? ' on' : '')}>
              <span className="sc-chip ai" />
              <span className="sc-name">{oppLabel}</span>
              <span className="sc-n">{theirs}</span>
            </div>
            <div className="sc-bar">
              <div className="sc-bar-you" style={{ width: `${(mine / total) * 100}%` }} />
              <div className="sc-bar-ai" style={{ width: `${(theirs / total) * 100}%` }} />
            </div>
            <div className="sc-foot">{total - mine - theirs} squares left</div>
          </div>
          <div className="panel logbox">{s.log.slice().reverse().map((l, i) => <div key={i} className={'log-line ' + l.t}>{l.x}</div>)}</div>
        </div>
      </GameShell>

      {s.winner && <ResultModal won={iWon} draw={s.winner === 'draw'} mine={mine} theirs={theirs} oppLabel={oppLabel} onNew={newGame} />}
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </>
  )
}

function ResultModal({ won, draw, mine, theirs, oppLabel, onNew }: { won: boolean; draw: boolean; mine: number; theirs: number; oppLabel: string; onNew: () => void }) {
  return (
    <Modal
      eyebrow={draw ? 'Split decision' : won ? 'Grid claimed' : 'Out-boxed'}
      title={draw ? 'A Tie' : won ? 'You Win' : `${oppLabel} Wins`}
      closeOnOverlay={false}
      actions={<button className="btn-modal" onClick={onNew}>Play again</button>}
    >
      <div className="finalsc"><span className="you">You {mine}</span><span className="foe">{oppLabel} {theirs}</span></div>
    </Modal>
  )
}

function RulesModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal eyebrow="How to play" title="Dots &amp; Boxes" onClose={onClose}
      actions={<button className="btn-modal" onClick={onClose}>Begin</button>}>
      <div className="modal-body">
        <p>On your turn, draw one <b>edge</b> between two adjacent dots. Click any of the thin slots between the dots — horizontal or vertical.</p>
        <p>Whoever draws the <b>fourth side</b> of a box <b>claims</b> it (marked with their initial) and immediately <i>draws again</i>. Chaining boxes lets you take several in a row.</p>
        <p>When every edge is drawn, the player with the <b>most boxes wins</b>. You move first.</p>
        <p>Tip: avoid drawing the third side of a box — it hands your rival a free square.</p>
        <p><b>Keys:</b> <kbd>N</kbd> new game · <kbd>?</kbd> rules · <kbd>Esc</kbd> close.</p>
      </div>
    </Modal>
  )
}
