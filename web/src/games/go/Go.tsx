/* GO — UI (built for this codebase). 9x9 goban on the framework shell, vs a fast
   capture/influence heuristic White. Stones sit on intersections; last move + ko are marked.
   You are Black (0) and move first. Two passes end the game; Chinese area scoring + komi. */

import { useMemo, useState } from 'react'
import { GameShell } from '../../framework/GameShell'
import { Modal } from '../../framework/Modal'
import { useAITurn } from '../../framework/useAITurn'
import { useGameKeys } from '../../framework/useGameKeys'
import * as GO from './logic'
import type { GoState } from './logic'

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
  const [s, setS] = useState<GoState>(() => GO.makeGame(SIZE))
  const [showRules, setShowRules] = useState(false)
  const [moveTick, setMoveTick] = useState(0)

  function newGame() { setS(GO.makeGame(SIZE)); setMoveTick(t => t + 1); setShowRules(false) }

  const aiActive = s.winner == null && s.turn === 1
  useAITurn(aiActive, () => { setS(p => GO.aiMove(p)); setMoveTick(t => t + 1) }, { delayMs: 460, tick: moveTick })

  const yourTurn = s.winner == null && s.turn === 0
  const legal = useMemo(
    () => (yourTurn ? new Set(GO.legalMoves(s)) : new Set<number>()),
    [yourTurn, s],
  )

  function clickPoint(p: number) {
    if (!yourTurn || !legal.has(p)) return
    setS(GO.place(s, 0, p))
    setMoveTick(t => t + 1)
  }
  function doPass() {
    if (!yourTurn) return
    setS(GO.pass(s))
    setMoveTick(t => t + 1)
  }

  useGameKeys({
    onNew: newGame,
    onToggleRules: () => setShowRules(v => !v),
    onEscape: () => setShowRules(false),
    extra: (e) => { if ((e.key === 'p' || e.key === 'P') && yourTurn) { doPass(); return true } },
  })

  const live = GO.areaScore(s)
  const bScore = live.black
  const wScore = live.white

  let banner = '', bk = ''
  if (s.winner === 'black') { bk = 'win'; banner = `You win — ${fmt(bScore)} to ${fmt(wScore)}` }
  else if (s.winner === 'white') { bk = 'lose'; banner = `White wins — ${fmt(wScore)} to ${fmt(bScore)}` }
  else if (s.winner === 'draw') { bk = ''; banner = `A jigo (tie) — ${fmt(bScore)}` }
  else if (s.consecutivePasses === 1) { bk = yourTurn ? 'you' : 'foe'; banner = yourTurn ? 'White passed — your move (pass to end)' : 'You passed — White is thinking…' }
  else if (yourTurn) { bk = 'you'; banner = 'Your turn — place a black stone' }
  else { bk = 'foe'; banner = 'White is thinking…' }

  return (
    <>
      <GameShell
        mark={TITLE_MARK}
        eyebrow="Go · surround &amp; live"
        title="Go"
        subtitle="9×9 — capture stones, mark territory, and out-score White past the komi"
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
          <div className="panel scoreboard">
            <div className={"sc black" + (s.turn === 0 && s.winner == null ? " on" : "")}>
              <span className="sc-stone black" />
              <span className="sc-name">You · Black</span>
              <span className="sc-n">{fmt(bScore)}</span>
            </div>
            <div className={"sc white" + (s.turn === 1 && s.winner == null ? " on" : "")}>
              <span className="sc-stone white" />
              <span className="sc-name">White +{s.komi}</span>
              <span className="sc-n">{fmt(wScore)}</span>
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

      {s.winner != null && <ResultModal s={s} b={bScore} w={wScore} onNew={newGame} />}
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </>
  )
}

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1)
}

function ResultModal({ s, b, w, onNew }: { s: GoState; b: number; w: number; onNew: () => void }) {
  const won = s.winner === 'black', draw = s.winner === 'draw'
  return (
    <Modal
      eyebrow={draw ? 'Dead even' : won ? 'Territory secured' : 'Out-surrounded'}
      title={draw ? 'A Tie' : won ? 'You Win' : 'White Wins'}
      closeOnOverlay={false}
      actions={<button className="btn-modal" onClick={onNew}>Play again</button>}
    >
      <div className="finalsc"><span className="you">You {fmt(b)}</span><span className="foe">White {fmt(w)}</span></div>
      <div className="modal-body"><p>Final Chinese area score, komi included. Margin: <b>{fmt(Math.abs(b - w))}</b>.</p></div>
    </Modal>
  )
}

function RulesModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal eyebrow="How to play" title="Go (9×9)" onClose={onClose}
      actions={<button className="btn-modal" onClick={onClose}>Begin</button>}>
      <div className="modal-body">
        <p>You are <b>Black</b> and move first. Click an empty intersection to place a stone. White (the AI) answers.</p>
        <p><b>Capture:</b> a group of connected same-colour stones is removed when it has no adjacent empty points (<i>liberties</i>). <b>Suicide</b> — a move leaving your own group with no liberties — is illegal unless it captures first. <b>Ko:</b> you may not immediately recreate the previous board position.</p>
        <p><b>Ending:</b> <i>pass</i> when you have nothing useful to play. <b>Two passes</b> in a row end the game.</p>
        <p><b>Scoring</b> (Chinese / area): your stones on the board plus the empty points your colour alone surrounds. White adds <b>{GO.DEFAULT_KOMI}</b> komi. Highest total wins.</p>
        <p><b>Keys:</b> <kbd>P</kbd> pass · <kbd>N</kbd> new · <kbd>?</kbd> rules · <kbd>Esc</kbd> close.</p>
      </div>
    </Modal>
  )
}
