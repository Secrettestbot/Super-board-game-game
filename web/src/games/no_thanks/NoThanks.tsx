/* NO THANKS! — UI (built for this codebase). A single face-up number card with a pile of
   poker chips on it, two players' chip stacks and run-grouped collections. Plays solo vs a
   heuristic AI, or online via useGameSession (host-authoritative; the other seat is a remote
   human or, if unfilled, the AI). Seat-relative: "you" are always whichever seat you sit in. */

import { useState } from 'react'
import { GameShell } from '../../framework/GameShell'
import { Modal } from '../../framework/Modal'
import { useGameKeys } from '../../framework/useGameKeys'
import { OnlineBar } from '../../framework/OnlineBar'
import { useGameSession } from '../../net/useGameSession'
import { noThanksAdapter } from './net'
import * as NT from './logic'
import type { NoThanksState, Who } from './logic'

const TITLE_MARK = (
  <svg className="title-mark" viewBox="0 0 48 48" aria-hidden="true">
    <rect x="4" y="7" width="30" height="38" rx="5" fill="#f5f1e8" stroke="#cdbf9c" strokeWidth="1.5" transform="rotate(-9 19 26)" />
    <rect x="14" y="3" width="30" height="38" rx="5" fill="#fff" stroke="#d8b15a" strokeWidth="1.5" />
    <text x="29" y="27" textAnchor="middle" fontFamily="Space Grotesk, sans-serif" fontWeight="700" fontSize="17" fill="#1d2330">7</text>
  </svg>
)

const fmt = (n: number) => (n > 0 ? `+${n}` : `${n}`)
/** A chip count of -1 means the value was redacted (a rival's secret stack). */
const HIDDEN = -1

export function NoThanks() {
  const { state: s, mySeat, isMyTurn, dispatch, newGame: netNew, net } = useGameSession(noThanksAdapter)
  const [showRules, setShowRules] = useState(false)

  // Seat-relative identities: seat 0 = 'you', seat 1 = 'ai'.
  const me: Who = mySeat === 0 ? 'you' : 'ai'
  const opp: Who = me === 'you' ? 'ai' : 'you'

  function newGame() { netNew(); setShowRules(false) }

  useGameKeys({ onNew: newGame, onToggleRules: () => setShowRules(v => !v), onEscape: () => setShowRules(false) })

  const yourTurn = !s.winner && isMyTurn
  // Score depends on chip count; a redacted rival stack means we can't (and shouldn't) score them.
  const myScore = NT.scoreHand(s.taken[me], s.chips[me])
  const oppKnown = s.chips[opp] !== HIDDEN
  const oppScore = oppKnown ? NT.scoreHand(s.taken[opp], s.chips[opp]) : null
  const remaining = s.deck.length + (s.card !== null ? 1 : 0)
  const canPass = yourTurn && s.chips[me] > 0

  const oppName = net.online ? 'Opponent' : 'Rival'
  const myLabel = 'You'

  function doPass() { if (canPass) dispatch({ kind: 'pass' }) }
  function doTake() { if (yourTurn) dispatch({ kind: 'take' }) }

  // Did I win? winner is encoded in the seat's Who ('you'/'ai') or 'tie'.
  const iWon = s.winner === me
  const oppWon = s.winner === opp

  let banner: string, bk = ''
  if (iWon) { bk = 'win'; banner = oppScore != null ? `You win — ${myScore} to ${oppScore}` : 'You win' }
  else if (oppWon) { bk = 'lose'; banner = oppScore != null ? `${oppName} wins — ${oppScore} to ${myScore}` : `${oppName} wins` }
  else if (s.winner === 'tie') { bk = ''; banner = `A dead tie — ${myScore} each` }
  else if (yourTurn) { bk = 'you'; banner = 'Your call — no thanks, or take the card?' }
  else { bk = 'foe'; banner = net.online ? 'Waiting for your opponent…' : `${oppName} is deciding…` }

  return (
    <>
      <GameShell
        mark={TITLE_MARK}
        eyebrow="No Thanks! · push your luck"
        title="No Thanks!"
        subtitle="pay a chip to dodge a card — or scoop it and the chips piled on it. Lowest score wins."
        onRules={() => setShowRules(true)}
        onNew={newGame}
        modeLeft={`${remaining} card${remaining === 1 ? '' : 's'} left`}
        banner={banner}
        bannerClass={bk}
        modeRight={<>N · new &nbsp; ? · rules</>}
      >
        <div className="nt-wrap">
          <div className="nt-table">
            {s.card !== null ? (
              <div className={"nt-card" + (yourTurn ? " live" : "")}>
                <span className="nt-corner tl">{s.card}</span>
                <span className="nt-big">{s.card}</span>
                <span className="nt-corner br">{s.card}</span>
                {s.pot > 0 && (
                  <div className="nt-pot" aria-label={`${s.pot} chips`}>
                    {Array.from({ length: Math.min(s.pot, 8) }).map((_, i) => (
                      <span key={i} className="nt-chip" style={{ bottom: `${i * 7}px` }} />
                    ))}
                    <span className="nt-pot-n">{s.pot}</span>
                  </div>
                )}
              </div>
            ) : (
              <div className="nt-card empty"><span className="nt-empty-t">deck<br />empty</span></div>
            )}
          </div>

          <div className="nt-actions">
            <button className="nt-btn pass" disabled={!canPass} onClick={doPass}>
              No Thanks <small>−1 chip</small>
            </button>
            <button className="nt-btn take" disabled={!yourTurn} onClick={doTake}>
              Take card {s.card !== null && s.pot > 0 ? <small>+{s.pot} chips</small> : <small>&nbsp;</small>}
            </button>
          </div>
        </div>

        <div className="side">
          <div className="panel"><OnlineBar net={net} /></div>
          <PlayerPanel who={me} label={myLabel} s={s} score={myScore} active={!s.winner && isMyTurn} />
          <PlayerPanel who={opp} label={oppName} s={s} score={oppScore} active={!s.winner && !isMyTurn && s.turn != null} />
          <div className="panel logbox">{s.log.slice().reverse().map((l, i) => <div key={i} className={"log-line " + l.t}>{l.x}</div>)}</div>
        </div>
      </GameShell>

      {s.winner && <ResultModal s={s} me={me} myScore={myScore} oppScore={oppScore} oppName={oppName} onNew={newGame} />}
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </>
  )
}

function PlayerPanel({ who, label, s, score, active }: { who: Who; label: string; s: NoThanksState; score: number | null; active: boolean }) {
  const grouped = NT.runs(s.taken[who])
  const chips = s.chips[who]
  const chipsHidden = chips === HIDDEN
  return (
    <div className={"panel pp " + who + (active ? " on" : "")}>
      <div className="pp-head">
        <span className="pp-name">{label}</span>
        <span className="pp-chips"><span className="pp-chipdot" />{chipsHidden ? '?' : chips}</span>
        {score != null && <span className={"pp-score" + (score <= 0 ? " good" : "")}>{fmt(score)}</span>}
      </div>
      <div className="pp-coll">
        {grouped.length === 0 && <span className="pp-empty">no cards yet</span>}
        {grouped.map((run, ri) => (
          <span key={ri} className={"pp-run" + (run.length > 1 ? " multi" : "")}>
            {run.map((c, ci) => <span key={c} className={"pp-mini" + (ci === 0 ? " low" : "")}>{c}</span>)}
          </span>
        ))}
      </div>
    </div>
  )
}

function ResultModal({ s, me, myScore, oppScore, oppName, onNew }: { s: NoThanksState; me: Who; myScore: number; oppScore: number | null; oppName: string; onNew: () => void }) {
  const won = s.winner === me, tie = s.winner === 'tie'
  return (
    <Modal
      eyebrow={tie ? 'Level pegging' : won ? 'Lean and clever' : 'Out-folded'}
      title={tie ? 'A Tie' : won ? 'You Win' : `${oppName} Wins`}
      closeOnOverlay={false}
      actions={<button className="btn-modal" onClick={onNew}>Play again</button>}
    >
      <div className="finalsc">
        <span className="you">You {fmt(myScore)}</span>
        <span className="foe">{oppName} {oppScore != null ? fmt(oppScore) : '?'}</span>
      </div>
      <p className="finalsub">Lowest score wins — runs count only their lowest card, and every chip is worth −1.</p>
    </Modal>
  )
}

function RulesModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal eyebrow="How to play" title="No Thanks!" onClose={onClose}
      actions={<button className="btn-modal" onClick={onClose}>Begin</button>}>
      <div className="modal-body">
        <p>A deck of cards numbered <b>3 to 35</b> — but <b>nine cards are removed unseen</b>, so you never know quite what's coming. You each start with <b>11 chips</b>.</p>
        <p>One card is turned face-up. On your turn you either pay <b>one chip</b> onto the card to say <i>"no thanks"</i> and pass, or <b>take the card</b> and <b>every chip</b> piled on it. After a card is taken, the next one is flipped. You can't pass with zero chips — you must take.</p>
        <p>Your score is the <b>sum of your cards minus your chips</b>. Within a <b>run</b> of consecutive numbers only the <b>lowest</b> card counts — so 7-8-9 scores just <b>7</b>. Each chip is <b>−1</b>. The <b>lowest total wins</b>.</p>
        <p><b>Keys:</b> <kbd>N</kbd> new game · <kbd>?</kbd> rules · <kbd>Esc</kbd> close.</p>
      </div>
    </Modal>
  )
}
