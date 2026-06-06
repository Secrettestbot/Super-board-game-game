/* YAHTZEE — UI.
   Ported from design/examples/dice_yahtzee/yahtzee.jsx. The single App component now
   renders through the shared GameShell + Modal and drives the AI / keyboard via the
   framework hooks; logic comes from ./logic instead of window.YahtLogic. */

import { Fragment, useEffect, useRef, useState } from 'react'
import { GameShell } from '../../framework/GameShell'
import { Modal } from '../../framework/Modal'
import { useAITurn } from '../../framework/useAITurn'
import { useGameKeys } from '../../framework/useGameKeys'
import * as YA from './logic'
import type { YahtzeeState, Totals } from './logic'

const PIPS: Record<number, number[]> = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] }

interface DieProps { v: number; held: boolean; onClick: () => void; rolling: boolean }
function Die({ v, held, onClick, rolling }: DieProps) {
  const pips = PIPS[v] || []
  return (
    <button className={"die" + (held ? " held" : "") + (rolling ? " rolling" : "")} onClick={onClick} style={{ width: "56px", height: "56px", flex: "0 0 auto" }}>
      <div className="pips">{[0, 1, 2, 3, 4, 5, 6, 7, 8].map(i => <span key={i} className={"pip" + (pips.includes(i) ? " on" : "")}></span>)}</div>
    </button>
  )
}

const TITLE_MARK = (
  <svg className="title-mark" viewBox="0 0 48 48" aria-hidden="true">
    <rect x="6" y="6" width="36" height="36" rx="8" fill="#f0ece0" stroke="#c0392b" strokeWidth="2" transform="rotate(-8 24 24)" />
    <circle cx="17" cy="18" r="3" fill="#c0392b" /><circle cx="24" cy="24" r="3" fill="#c0392b" /><circle cx="31" cy="30" r="3" fill="#c0392b" />
  </svg>
)

interface Anim { roll: boolean[]; faces: number[] }

export function Yahtzee() {
  const [s, setS] = useState<YahtzeeState>(() => YA.makeGame())
  const [showRules, setShowRules] = useState(false)
  const [anim, setAnim] = useState<Anim | null>(null)   // { roll:[bool], faces:[v] }
  const aRef = useRef<number | null>(null)

  function newGame() { setS(YA.makeGame()); setShowRules(false) }

  const yourTurn = !s.winner && s.turn === "you"
  const yt = YA.totals(s.cards.you), at = YA.totals(s.cards.ai)

  // AI plays its whole turn after a short "thinking" pause
  useAITurn(!s.winner && s.turn === "ai", () => setS(p => YA.aiTurn(p)), { delayMs: 900 })

  function animateRoll(rolling: boolean[]) {
    if (aRef.current) clearInterval(aRef.current)
    let t = 0
    aRef.current = window.setInterval(() => {
      t += 70
      setAnim({ roll: rolling, faces: rolling.map(() => 1 + ((Math.random() * 6) | 0)) })
      if (t >= 540) { if (aRef.current) clearInterval(aRef.current); setAnim(null) }
    }, 70)
    setAnim({ roll: rolling, faces: rolling.map(() => 1 + ((Math.random() * 6) | 0)) })
  }
  function rollDice() {
    if (!(yourTurn && s.rollsLeft > 0)) return
    const rolling = s.dice.map((_, i) => !(s.rolled && s.held[i]))
    animateRoll(rolling)
    setS(YA.roll(s, "you"))
  }
  function hold(i: number) { if (yourTurn && s.rolled) setS(YA.toggleHold(s, i)) }
  function pickCat(k: string) { if (yourTurn && s.rolled && s.cards.you[k] == null) setS(YA.pick(s, "you", k)) }

  useGameKeys({
    onNew: newGame,
    onToggleRules: () => setShowRules(v => !v),
    onEscape: () => setShowRules(false),
    extra: (e) => {
      if (e.key === " " && yourTurn && s.rollsLeft > 0) { e.preventDefault(); rollDice(); return true }
    },
  })

  // tidy up the rolling animation timer when leaving the page
  useEffect(() => () => { if (aRef.current) clearInterval(aRef.current) }, [])

  let banner: string, bk = ""
  if (s.winner === "you") { bk = "win"; banner = `You win — ${yt.grand} to ${at.grand}` }
  else if (s.winner === "ai") { bk = "lose"; banner = `Rival wins — ${at.grand} to ${yt.grand}` }
  else if (s.winner === "tie") { banner = "A tie" }
  else if (yourTurn) { bk = "you"; banner = !s.rolled ? "Your turn — roll the dice" : s.rollsLeft > 0 ? "Hold dice and re-roll, or score" : "Choose a category to score" }
  else { bk = "foe"; banner = "The rival is rolling…" }

  return (
    <>
      <GameShell
        mark={TITLE_MARK}
        eyebrow="Yahtzee · five dice"
        title="Yahtzee"
        subtitle="three rolls a turn — chase the categories and beat the rival's card"
        onRules={() => setShowRules(true)}
        onNew={newGame}
        modeLeft={`Round ${s.round}/13`}
        banner={banner}
        bannerClass={bk}
        modeRight={<>space · roll &nbsp; N · new</>}
      >
        <div className="dicearea">
          <div className="dice">
            {s.dice.map((v, i) => { const rolling = !!(anim && anim.roll[i]); return <Die key={i} v={rolling ? anim!.faces[i] : v} held={s.rolled && s.held[i] && !rolling} rolling={rolling} onClick={() => hold(i)} /> })}
          </div>
          <div className="rollzone">
            <button className="rollbtn" disabled={!yourTurn || s.rollsLeft <= 0} onClick={rollDice}>{s.rolled ? `Re-roll` : "Roll"} <span className="rl">{s.rollsLeft} left</span></button>
            {s.rolled && yourTurn && <div className="roll-hint">Tap dice to hold · tap a category to score</div>}
          </div>
        </div>

        <div className="cardwrap">
          <table className="scorecard">
            <thead><tr><th></th><th className="cyou">You</th><th className="cai">Rival</th></tr></thead>
            <tbody>
              {YA.CATS.map((cat, i) => {
                const yv = s.cards.you[cat.k], av = s.cards.ai[cat.k]
                const open = yourTurn && s.rolled && yv == null
                const preview = open ? YA.score(cat.k, s.dice) : null
                return (
                  <Fragment key={cat.k}>
                    {i === 6 && <tr className="divider"><td colSpan={3}>Lower</td></tr>}
                    <tr className={open ? "open" : ""}>
                      <td className="catname" onClick={() => open && pickCat(cat.k)}>{cat.name}</td>
                      <td className={"cell you" + (open ? " sel" : "")} onClick={() => open && pickCat(cat.k)}>{yv != null ? yv : open ? <span className="prev">{preview}</span> : ""}</td>
                      <td className="cell ai">{av != null ? av : ""}</td>
                    </tr>
                    {i === 5 && <tr className="subtot"><td>Upper bonus (63+)</td><td className="you">{yt.bonus || (yt.up >= 63 ? 35 : "—")}</td><td className="ai">{at.bonus || "—"}</td></tr>}
                  </Fragment>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="grand"><td>Total</td><td className="you">{yt.grand}</td><td className="ai">{at.grand}</td></tr>
            </tfoot>
          </table>
        </div>
      </GameShell>

      {s.winner && <WinModal s={s} yt={yt} at={at} onNew={newGame} />}
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </>
  )
}

interface WinModalProps { s: YahtzeeState; yt: Totals; at: Totals; onNew: () => void }
function WinModal({ s, yt, at, onNew }: WinModalProps) {
  const won = s.winner === "you", tie = s.winner === "tie"
  return (
    <Modal
      eyebrow={tie ? "Dead heat" : won ? "Hot dice" : "Cold dice"}
      title={tie ? "A Tie" : won ? "You Win" : "Rival Wins"}
      closeOnOverlay={false}
      actions={<button className="btn-modal" onClick={onNew}>Play again</button>}
    >
      <div className="finalsc"><span className="you">You {yt.grand}</span><span className="foe">Rival {at.grand}</span></div>
    </Modal>
  )
}

function RulesModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal
      eyebrow="How to play"
      title="Yahtzee"
      onClose={onClose}
      actions={<button className="btn-modal" onClick={onClose}>Begin</button>}
    >
      <div className="modal-body">
        <p>Each turn, roll five dice. You may <b>re-roll</b> any dice up to twice — tap a die to <b>hold</b> it. Then score the dice in one open category.</p>
        <p>The <b>upper</b> section (Ones–Sixes) sums that face; reach 63 for a <b>+35 bonus</b>. The <b>lower</b> section: three/four of a kind (sum all), full house (25), small/large straight (30/40), <b>Yahtzee</b> five-of-a-kind (50), and chance (sum). Extra Yahtzees add +100.</p>
        <p>Every category is used exactly once across 13 rounds. Highest grand total wins.</p>
        <p><b>Keys:</b> <kbd>space</kbd> roll · <kbd>N</kbd> new game · <kbd>?</kbd> rules.</p>
      </div>
    </Modal>
  )
}
