/* DOTS AND BOXES — UI (built for this codebase). A 4x4 blueprint board on the framework shell,
   vs a greedy safe-move AI. Click thin edge slots between dots to draw; closing a box claims it
   and grants another move — so the AI may chain several moves, hence the useAITurn tick. */

import { useMemo, useState } from 'react'
import { GameShell } from '../../framework/GameShell'
import { Modal } from '../../framework/Modal'
import { useAITurn } from '../../framework/useAITurn'
import { useGameKeys } from '../../framework/useGameKeys'
import * as DB from './logic'
import type { DotsState, EdgeId } from './logic'

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
  const [s, setS] = useState<DotsState>(() => DB.makeGame())
  const [showRules, setShowRules] = useState(false)

  function newGame() { setS(DB.makeGame()); setShowRules(false) }

  // Closing a box grants the same player another move, so the AI may move several times while
  // it's still its turn. Re-arm the timer on every move via a tick that changes each move.
  useAITurn(!s.winner && s.turn === 'ai', () => setS(p => DB.aiMove(p)), { delayMs: 560, tick: `${s.moves}-${s.turn}` })
  useGameKeys({ onNew: newGame, onToggleRules: () => setShowRules(v => !v), onEscape: () => setShowRules(false) })

  const yourTurn = !s.winner && s.turn === 'you'
  const { you, ai } = DB.counts(s.owners)
  const total = SIZE * SIZE

  function clickEdge(id: EdgeId) { if (yourTurn && !s.edges[id]) setS(DB.drawEdge(s, id, 'you')) }

  // ----- board geometry (CSS grid of 2*SIZE+1 tracks each way) -----
  const dots = useMemo(() => {
    const out: { r: number; c: number }[] = []
    for (let r = 0; r < DOTS; r++) for (let c = 0; c < DOTS; c++) out.push({ r, c })
    return out
  }, [])

  let banner: string, bk = ''
  if (s.winner === 'you') { bk = 'win'; banner = `You win — ${you} to ${ai}` }
  else if (s.winner === 'ai') { bk = 'lose'; banner = `The rival wins — ${ai} to ${you}` }
  else if (s.winner === 'draw') { bk = ''; banner = `A tie — ${you}–${ai}` }
  else if (yourTurn) { bk = 'you'; banner = 'Your turn — draw an edge' }
  else { bk = 'foe'; banner = 'The rival is thinking…' }

  const trackPos = (i: number) => i * 2 + 1                 // dot at even index -> grid line
  const span = (a: number) => `${a} / span 1`

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
                  className={'db-box' + (o ? ' filled ' + o : '')}
                  style={{ gridColumn: span(trackPos(c) + 1), gridRow: span(trackPos(r) + 1) }}
                >
                  {o && <span className="db-init">{o === 'you' ? 'Y' : 'R'}</span>}
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
                    className={'db-edge h' + (drawn ? ' drawn ' + drawn : '') + (s.last === id ? ' last' : '') + (yourTurn && !drawn ? ' open' : '')}
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
                    className={'db-edge v' + (drawn ? ' drawn ' + drawn : '') + (s.last === id ? ' last' : '') + (yourTurn && !drawn ? ' open' : '')}
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
          <div className="panel scoreboard">
            <div className={'sc you' + (s.turn === 'you' && !s.winner ? ' on' : '')}>
              <span className="sc-chip you" />
              <span className="sc-name">You</span>
              <span className="sc-n">{you}</span>
            </div>
            <div className={'sc ai' + (s.turn === 'ai' && !s.winner ? ' on' : '')}>
              <span className="sc-chip ai" />
              <span className="sc-name">Rival</span>
              <span className="sc-n">{ai}</span>
            </div>
            <div className="sc-bar">
              <div className="sc-bar-you" style={{ width: `${(you / total) * 100}%` }} />
              <div className="sc-bar-ai" style={{ width: `${(ai / total) * 100}%` }} />
            </div>
            <div className="sc-foot">{total - you - ai} squares left</div>
          </div>
          <div className="panel logbox">{s.log.slice().reverse().map((l, i) => <div key={i} className={'log-line ' + l.t}>{l.x}</div>)}</div>
        </div>
      </GameShell>

      {s.winner && <ResultModal s={s} you={you} ai={ai} onNew={newGame} />}
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </>
  )
}

function ResultModal({ s, you, ai, onNew }: { s: DotsState; you: number; ai: number; onNew: () => void }) {
  const won = s.winner === 'you', draw = s.winner === 'draw'
  return (
    <Modal
      eyebrow={draw ? 'Split decision' : won ? 'Grid claimed' : 'Out-boxed'}
      title={draw ? 'A Tie' : won ? 'You Win' : 'Rival Wins'}
      closeOnOverlay={false}
      actions={<button className="btn-modal" onClick={onNew}>Play again</button>}
    >
      <div className="finalsc"><span className="you">You {you}</span><span className="foe">Rival {ai}</span></div>
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
