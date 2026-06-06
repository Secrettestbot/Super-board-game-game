/* NO THANKS! — UI (built for this codebase). A single face-up number card with a pile of
   poker chips on it, two players' chip stacks and run-grouped collections, vs a heuristic AI. */

import { useState } from 'react'
import { GameShell } from '../../framework/GameShell'
import { Modal } from '../../framework/Modal'
import { useAITurn } from '../../framework/useAITurn'
import { useGameKeys } from '../../framework/useGameKeys'
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

export function NoThanks() {
  const [s, setS] = useState<NoThanksState>(() => NT.makeGame())
  const [showRules, setShowRules] = useState(false)

  function newGame() { setS(NT.makeGame()); setShowRules(false) }

  useAITurn(!s.winner && s.turn === 'ai', () => setS(p => NT.aiStep(p)), { delayMs: 620, tick: s.card })
  useGameKeys({ onNew: newGame, onToggleRules: () => setShowRules(v => !v), onEscape: () => setShowRules(false) })

  const yourTurn = !s.winner && s.turn === 'you'
  const sc = NT.scores(s)
  const remaining = s.deck.length + (s.card !== null ? 1 : 0)

  function doPass() { if (yourTurn && s.chips.you > 0) setS(NT.pass(s, 'you')) }
  function doTake() { if (yourTurn) setS(NT.take(s, 'you')) }

  let banner: string, bk = ''
  if (s.winner === 'you') { bk = 'win'; banner = `You win — ${sc.you} to ${sc.ai}` }
  else if (s.winner === 'ai') { bk = 'lose'; banner = `The rival wins — ${sc.ai} to ${sc.you}` }
  else if (s.winner === 'tie') { bk = ''; banner = `A dead tie — ${sc.you} each` }
  else if (yourTurn) { bk = 'you'; banner = 'Your call — no thanks, or take the card?' }
  else { bk = 'foe'; banner = 'The rival is deciding…' }

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
            <button className="nt-btn pass" disabled={!yourTurn || s.chips.you <= 0} onClick={doPass}>
              No Thanks <small>−1 chip</small>
            </button>
            <button className="nt-btn take" disabled={!yourTurn} onClick={doTake}>
              Take card {s.card !== null && s.pot > 0 ? <small>+{s.pot} chips</small> : <small>&nbsp;</small>}
            </button>
          </div>
        </div>

        <div className="side">
          <PlayerPanel who="you" label="You" s={s} score={sc.you} active={s.turn === 'you' && !s.winner} />
          <PlayerPanel who="ai" label="Rival" s={s} score={sc.ai} active={s.turn === 'ai' && !s.winner} />
          <div className="panel logbox">{s.log.slice().reverse().map((l, i) => <div key={i} className={"log-line " + l.t}>{l.x}</div>)}</div>
        </div>
      </GameShell>

      {s.winner && <ResultModal s={s} sc={sc} onNew={newGame} />}
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </>
  )
}

function PlayerPanel({ who, label, s, score, active }: { who: Who; label: string; s: NoThanksState; score: number; active: boolean }) {
  const grouped = NT.runs(s.taken[who])
  return (
    <div className={"panel pp " + who + (active ? " on" : "")}>
      <div className="pp-head">
        <span className="pp-name">{label}</span>
        <span className="pp-chips"><span className="pp-chipdot" />{s.chips[who]}</span>
        <span className={"pp-score" + (score <= 0 ? " good" : "")}>{fmt(score)}</span>
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

function ResultModal({ s, sc, onNew }: { s: NoThanksState; sc: Record<Who, number>; onNew: () => void }) {
  const won = s.winner === 'you', tie = s.winner === 'tie'
  return (
    <Modal
      eyebrow={tie ? 'Level pegging' : won ? 'Lean and clever' : 'Out-folded'}
      title={tie ? 'A Tie' : won ? 'You Win' : 'Rival Wins'}
      closeOnOverlay={false}
      actions={<button className="btn-modal" onClick={onNew}>Play again</button>}
    >
      <div className="finalsc"><span className="you">You {fmt(sc.you)}</span><span className="foe">Rival {fmt(sc.ai)}</span></div>
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
