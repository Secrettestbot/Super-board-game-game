/* PENTE — UI (built for this codebase). 13x13 wood goban on the framework shell, vs a
   threat/capture heuristic AI. Two paths to victory: five in a row, or five captured pairs.
   Captured pairs are removed; the last move and the winning five are highlighted. */

import { useMemo, useState } from 'react'
import { GameShell } from '../../framework/GameShell'
import { Modal } from '../../framework/Modal'
import { useAITurn } from '../../framework/useAITurn'
import { useGameKeys } from '../../framework/useGameKeys'
import * as PT from './logic'
import type { PenteState } from './logic'

const { N } = PT
// star points (handicap dots) for the 13x13 goban
const STAR = new Set([3 * N + 3, 3 * N + 9, 6 * N + 6, 9 * N + 3, 9 * N + 9])

const TITLE_MARK = (
  <svg className="title-mark" viewBox="0 0 48 48" aria-hidden="true">
    <rect x="3" y="3" width="42" height="42" rx="9" fill="#b07e44" stroke="#7c5526" strokeWidth="1.5" />
    <path d="M12 12 H36 M12 24 H36 M12 36 H36 M12 12 V36 M24 12 V36 M36 12 V36" stroke="#6e4a23" strokeWidth="1" />
    <circle cx="12" cy="24" r="5" fill="#1b1c1d" />
    <circle cx="36" cy="24" r="5" fill="#f4f1e7" stroke="#c8c2af" strokeWidth="0.5" />
  </svg>
)

export function Pente() {
  const [s, setS] = useState<PenteState>(() => PT.makeGame())
  const [showRules, setShowRules] = useState(false)

  function newGame() { setS(PT.makeGame()); setShowRules(false) }

  useAITurn(!s.winner && s.turn === 'w', () => setS(p => PT.aiMove(p)), { delayMs: 460 })
  useGameKeys({ onNew: newGame, onToggleRules: () => setShowRules(v => !v), onEscape: () => setShowRules(false) })

  const yourTurn = !s.winner && s.turn === 'b'
  const winSet = useMemo(() => new Set(s.win ?? []), [s.win])

  function clickPt(i: number) { if (yourTurn && !s.board[i]) setS(PT.place(s, i, 'b')) }

  let banner: string, bk = ''
  if (s.winner === 'b') { bk = 'win'; banner = 'You win' }
  else if (s.winner === 'w') { bk = 'lose'; banner = 'The rival wins' }
  else if (s.winner === 'draw') { bk = ''; banner = 'The board is full — a tie' }
  else if (yourTurn) { bk = 'you'; banner = 'Your turn — place a black stone' }
  else { bk = 'foe'; banner = 'The rival is thinking…' }

  return (
    <>
      <GameShell
        mark={TITLE_MARK}
        eyebrow="Pente · flank &amp; capture"
        title="Pente"
        subtitle="five in a row — or capture five pairs by bracketing the rival's stones"
        onRules={() => setShowRules(true)}
        onNew={newGame}
        modeLeft={`${N} × ${N}`}
        banner={banner}
        bannerClass={bk}
        modeRight={<>N · new &nbsp; ? · rules</>}
      >
        <div className="pt-wrap">
          <div className="pt-board">
            <div className="pt-grid">
              {s.board.map((v, i) => {
                const r = Math.floor(i / N), c = i % N
                return (
                  <div key={i} className="pt-pt" onClick={() => clickPt(i)}>
                    <div className={"pt-h" + (c === 0 ? " l0" : "") + (c === N - 1 ? " r0" : "")} />
                    <div className={"pt-v" + (r === 0 ? " t0" : "") + (r === N - 1 ? " b0" : "")} />
                    {STAR.has(i) && !v && <div className="pt-star" />}
                    {v && <div className={"pt-stone " + v + (s.last === i ? " last" : "") + (winSet.has(i) ? " win" : "")} />}
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        <div className="side">
          <div className="panel scoreboard">
            <div className={"sc b" + (s.turn === 'b' && !s.winner ? " on" : "")}>
              <span className="sc-stone b"></span><span className="sc-name">You · Black</span>
              <span className="sc-n">{s.pairs.b}<span className="sc-cap">/5</span></span>
            </div>
            <div className={"sc w" + (s.turn === 'w' && !s.winner ? " on" : "")}>
              <span className="sc-stone w"></span><span className="sc-name">Rival · White</span>
              <span className="sc-n">{s.pairs.w}<span className="sc-cap">/5</span></span>
            </div>
            <div className="sc-legend">pairs captured · five wins</div>
          </div>
          <div className="panel logbox">{s.log.slice().reverse().map((l, i) => <div key={i} className={"log-line " + l.t}>{l.x}</div>)}</div>
        </div>
      </GameShell>

      {s.winner && <ResultModal s={s} onNew={newGame} />}
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </>
  )
}

function ResultModal({ s, onNew }: { s: PenteState; onNew: () => void }) {
  const won = s.winner === 'b', draw = s.winner === 'draw'
  return (
    <Modal
      eyebrow={draw ? 'Stalemate' : won ? 'Line or capture' : 'Out-played'}
      title={draw ? 'A Tie' : won ? 'You Win' : 'Rival Wins'}
      closeOnOverlay={false}
      actions={<button className="btn-modal" onClick={onNew}>Play again</button>}
    >
      <div className="finalsc"><span className="you">You {s.pairs.b} pairs</span><span className="foe">Rival {s.pairs.w} pairs</span></div>
    </Modal>
  )
}

function RulesModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal eyebrow="How to play" title="Pente" onClose={onClose}
      actions={<button className="btn-modal" onClick={onClose}>Begin</button>}>
      <div className="modal-body">
        <p>You are <b>Black</b> and move first. Click an empty intersection to place a stone. Win in one of two ways: get <b>five in a row</b> (horizontal, vertical, or diagonal), <i>or</i> <b>capture five pairs</b> of the rival's stones.</p>
        <p><b>Custodial capture:</b> when you place a stone so that exactly <b>two</b> rival stones are flanked between your new stone and another of yours — the pattern <i>YOU · OPP · OPP · YOU</i> along any line — those two stones are <b>captured</b> and removed. Only exact pairs are taken (never a single stone or three).</p>
        <p>You may safely move <i>into</i> a bracket: capture only triggers from the side that <i>completes</i> the bracket by placing.</p>
        <p><b>Keys:</b> <kbd>N</kbd> new game · <kbd>?</kbd> rules · <kbd>Esc</kbd> close.</p>
      </div>
    </Modal>
  )
}
