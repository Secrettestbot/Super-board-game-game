/* GO — UI (built for this codebase). 9x9 goban on the framework shell. Solo: you are
   Black (0) vs a fast capture/influence heuristic White (1). Online: seat-relative —
   your stone colour comes from mySeat, the empty seat is driven by the AI via the hook.
   Stones sit on intersections; last move + ko are marked. Two passes end the game;
   Chinese area scoring + komi. */

import { useMemo, useState } from 'react'
import { GameShell } from '../../framework/GameShell'
import { Modal } from '../../framework/Modal'
import { useGameKeys } from '../../framework/useGameKeys'
import { OnlineBar } from '../../framework/OnlineBar'
import { useGameSession } from '../../net/useGameSession'
import { goAdapter } from './net'
import * as GO from './logic'
import type { GoState, Player } from './logic'

const SIZE = 9
const COLS = 'ABCDEFGHJ' // Go skips "I"

const TITLE_MARK = (
  <svg className="title-mark" viewBox="0 0 48 48" aria-hidden="true">
    <rect x="3" y="3" width="42" height="42" rx="9" fill="#c89a55" stroke="#9a6f33" strokeWidth="1.5" />
    <path d="M11 11 H37 M11 24 H37 M11 37 H37 M11 11 V37 M24 11 V37 M37 11 V37" stroke="#6e4a1f" strokeWidth="1.1" fill="none" opacity="0.65" />
    <circle cx="11" cy="11" r="5.4" fill="#1b1b1b" stroke="#000" strokeWidth="0.5" />
    <circle cx="24" cy="24" r="5.4" fill="#f3efe4" stroke="#bdb7a4" strokeWidth="0.5" />
    <circle cx="37" cy="37" r="5.4" fill="#1b1b1b" stroke="#000" strokeWidth="0.5" />
  </svg>
)

// star points (hoshi) for 9x9
const STARS = new Set([
  GO.idx(SIZE, 2, 2), GO.idx(SIZE, 2, 6), GO.idx(SIZE, 6, 2), GO.idx(SIZE, 6, 6), GO.idx(SIZE, 4, 4),
])

export function Go() {
  const { state: s, mySeat, isMyTurn, dispatch, newGame: netNew, net } = useGameSession(goAdapter)
  const myColor = mySeat as Player // seat 0 = Black, seat 1 = White
  const oppColor: Player = GO.other(myColor)
  const [showRules, setShowRules] = useState(false)

  function newGame() { netNew(); setShowRules(false) }

  const yourTurn = s.winner == null && isMyTurn
  const legal = useMemo(
    () => (yourTurn ? new Set(GO.legalMoves(s)) : new Set<number>()),
    [yourTurn, s],
  )

  function clickPoint(p: number) {
    if (!yourTurn || !legal.has(p)) return
    dispatch({ kind: 'play', point: p })
  }
  function doPass() {
    if (!yourTurn) return
    dispatch({ kind: 'pass' })
  }

  useGameKeys({
    onNew: newGame,
    onToggleRules: () => setShowRules(v => !v),
    onEscape: () => setShowRules(false),
    extra: (e) => { if ((e.key === 'p' || e.key === 'P') && yourTurn) { doPass(); return true } },
  })

  const live = GO.areaScore(s)
  const myScore = myColor === 0 ? live.black : live.white
  const oppScore = myColor === 0 ? live.white : live.black

  // result relative to mySeat
  const myWin = (s.winner === 'black' && myColor === 0) || (s.winner === 'white' && myColor === 1)
  const oppName = net.online ? 'Opponent' : oppColor === 1 ? 'White' : 'Black'
  const myName = myColor === 0 ? 'Black' : 'White'
  const thinking = net.online ? 'waiting for opponent…' : `${oppName} is thinking…`

  let banner = '', bk = ''
  if (s.winner === 'draw') { bk = ''; banner = `A jigo (tie) — ${fmt(myScore)}` }
  else if (s.winner != null) {
    bk = myWin ? 'win' : 'lose'
    banner = myWin ? `You win — ${fmt(myScore)} to ${fmt(oppScore)}` : `${oppName} wins — ${fmt(oppScore)} to ${fmt(myScore)}`
  }
  else if (s.consecutivePasses === 1) {
    bk = yourTurn ? 'you' : 'foe'
    banner = yourTurn ? `${oppName} passed — your move (pass to end)` : `You passed — ${thinking}`
  }
  else if (yourTurn) { bk = 'you'; banner = `Your turn — place a ${myName.toLowerCase()} stone` }
  else { bk = 'foe'; banner = thinking }

  return (
    <>
      <GameShell
        mark={TITLE_MARK}
        eyebrow="Go · surround &amp; live"
        title="Go"
        subtitle="9×9 — capture stones, mark territory, and out-score your opponent past the komi"
        onRules={() => setShowRules(true)}
        onNew={newGame}
        modeLeft={`9 × 9 · komi ${s.komi}`}
        banner={banner}
        bannerClass={bk}
        modeRight={<>P · pass &nbsp; N · new &nbsp; ? · rules</>}
      >
        <div className="go-wrap">
          <div className={"go-board" + (yourTurn ? " active" : "")}>
            {/* grid lines drawn via background; stones + hit-cells laid in a grid */}
            {Array.from({ length: SIZE * SIZE }, (_, p) => {
              const r = Math.floor(p / SIZE), c = p % SIZE
              const v = s.board[p]
              const isLegal = legal.has(p)
              return (
                <div
                  key={p}
                  className={"go-pt"
                    + (isLegal ? " hint" : "")
                    + (STARS.has(p) ? " star" : "")}
                  style={{ gridColumn: c + 1, gridRow: r + 1 }}
                  onClick={() => clickPoint(p)}
                  title={`${COLS[c]}${SIZE - r}`}
                >
                  {v != null && (
                    <div className={"go-stone " + (v === 0 ? "black" : "white") + (s.last === p ? " last" : "")} />
                  )}
                  {v == null && s.koPoint === p && <div className="go-ko" />}
                  {v == null && isLegal && <div className="go-ghost" />}
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
            <div className={"sc black" + (s.turn === myColor && s.winner == null ? " on" : "")}>
              <span className={"sc-stone " + (myColor === 0 ? "black" : "white")} />
              <span className="sc-name">You · {myName}{myColor === 1 ? ` +${s.komi}` : ''}</span>
              <span className="sc-n">{fmt(myScore)}</span>
            </div>
            <div className={"sc white" + (s.turn === oppColor && s.winner == null ? " on" : "")}>
              <span className={"sc-stone " + (oppColor === 0 ? "black" : "white")} />
              <span className="sc-name">{oppName}{oppColor === 1 ? ` +${s.komi}` : ''}</span>
              <span className="sc-n">{fmt(oppScore)}</span>
            </div>
            <div className="cap-row">
              <span>Captures</span>
              <span className="cap-n">B {s.captures[0]} · W {s.captures[1]}</span>
            </div>
          </div>

          <div className="panel info">
            <p className="info-line">Area score (live): stones on the board plus the empty points your colour fully surrounds. White carries <b>{s.komi}</b> komi.</p>
            <button className="pass-btn" onClick={doPass} disabled={!yourTurn}>Pass</button>
            <p className="info-hint">Two passes in a row end the game.</p>
          </div>
        </div>
      </GameShell>

      {s.winner != null && <ResultModal myWin={myWin} draw={s.winner === 'draw'} my={myScore} opp={oppScore} oppName={oppName} onNew={newGame} />}
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </>
  )
}

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1)
}

function ResultModal({ myWin, draw, my, opp, oppName, onNew }: { myWin: boolean; draw: boolean; my: number; opp: number; oppName: string; onNew: () => void }) {
  return (
    <Modal
      eyebrow={draw ? 'Dead even' : myWin ? 'Territory secured' : 'Out-surrounded'}
      title={draw ? 'A Tie' : myWin ? 'You Win' : `${oppName} Wins`}
      closeOnOverlay={false}
      actions={<button className="btn-modal" onClick={onNew}>Play again</button>}
    >
      <div className="finalsc"><span className="you">You {fmt(my)}</span><span className="foe">{oppName} {fmt(opp)}</span></div>
      <div className="modal-body"><p>Final Chinese area score, komi included. Margin: <b>{fmt(Math.abs(my - opp))}</b>.</p></div>
    </Modal>
  )
}

function RulesModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal eyebrow="How to play" title="Go (9×9)" onClose={onClose}
      actions={<button className="btn-modal" onClick={onClose}>Begin</button>}>
      <div className="modal-body">
        <p>Black moves first. Click an empty intersection to place a stone on your turn.</p>
        <p><b>Capture:</b> a group of connected same-colour stones is removed when it has no adjacent empty points (<i>liberties</i>). <b>Suicide</b> — a move leaving your own group with no liberties — is illegal unless it captures first. <b>Ko:</b> you may not immediately recreate the previous board position.</p>
        <p><b>Ending:</b> <i>pass</i> when you have nothing useful to play. <b>Two passes</b> in a row end the game.</p>
        <p><b>Scoring</b> (Chinese / area): your stones on the board plus the empty points your colour alone surrounds. White adds <b>{GO.DEFAULT_KOMI}</b> komi. Highest total wins.</p>
        <p><b>Keys:</b> <kbd>P</kbd> pass · <kbd>N</kbd> new · <kbd>?</kbd> rules · <kbd>Esc</kbd> close.</p>
      </div>
    </Modal>
  )
}
