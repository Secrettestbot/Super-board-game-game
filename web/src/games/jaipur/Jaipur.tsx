/* JAIPUR — UI (built for this codebase). A Rajasthan bazaar on the framework shell:
   a 5-slot market, your goods hand + camel herd, the opponent's tallies, the goods-token
   stacks, and a short log. You TAKE goods/camels (or swap) or SELL a selected set.

   Online-capable via useGameSession(jaipurAdapter): the hook drives the AI for any empty
   seat and serves guests a per-seat redacted view, so the opponent's private hand cards and
   the face-down deck never reach you. Everything below is rendered relative to mySeat —
   your caravan, herd and tokens are your own seat's; the other seat is the opponent. Single
   round — most rupees wins. */

import { useMemo, useState } from 'react'
import { GameShell } from '../../framework/GameShell'
import { Modal } from '../../framework/Modal'
import { useGameKeys } from '../../framework/useGameKeys'
import { OnlineBar } from '../../framework/OnlineBar'
import { useGameSession } from '../../net/useGameSession'
import { jaipurAdapter } from './net'
import * as JP from './logic'
import type { Good, Side } from './logic'

const { GOODS, GOOD_LABEL, EXPENSIVE, HAND_LIMIT } = JP

const GOOD_GLYPH: Record<Good, string> = {
  diamond: '◆', gold: '⬤', silver: '⬤', cloth: '⬗', spice: '✦', leather: '❖',
}

/** Seat 0 <-> 'you', seat 1 <-> 'foe' (matches the adapter). */
const SIDE: Side[] = ['you', 'foe']

const TITLE_MARK = (
  <svg className="title-mark" viewBox="0 0 48 48" aria-hidden="true">
    <rect x="3" y="3" width="42" height="42" rx="9" fill="#3a1d10" stroke="#c98a3a" strokeWidth="1.5" />
    <path d="M14 30 q3 -10 10 -10 q7 0 10 10" fill="none" stroke="#f0c860" strokeWidth="2" strokeLinecap="round" />
    <circle cx="24" cy="15" r="3.4" fill="#7fd0c0" stroke="#0c2a26" strokeWidth="0.6" />
    <circle cx="17" cy="33" r="2.2" fill="#f0c860" />
    <circle cx="31" cy="33" r="2.2" fill="#f0c860" />
  </svg>
)

export function Jaipur() {
  const { state: s, mySeat, isMyTurn, dispatch, newGame: netNew, net } = useGameSession(jaipurAdapter)
  const [showRules, setShowRules] = useState(false)
  const [pickGood, setPickGood] = useState<Good | null>(null)

  const mine: Side = SIDE[mySeat] // your side in the logic's encoding
  const opp: Side = mine === 'you' ? 'foe' : 'you'

  function newGame() { netNew(); setShowRules(false); setPickGood(null) }

  useGameKeys({ onNew: newGame, onToggleRules: () => setShowRules(v => !v), onEscape: () => { setShowRules(false); setPickGood(null) } })

  const yourTurn = s.winner == null && isMyTurn
  const handFull = JP.handCount(s, mine) >= HAND_LIMIT

  const handCounts = useMemo(() => {
    const m = {} as Record<Good, number>
    for (const g of GOODS) m[g] = s.hand[mine].filter(x => x === g).length
    return m
  }, [s.hand, mine])

  function take(i: number) { if (yourTurn && !handFull) dispatch({ kind: 'take', i }) }
  function camels() { if (yourTurn && JP.marketCamels(s) > 0 && !handFull) dispatch({ kind: 'takeCamels' }) }
  function doSell() {
    if (yourTurn && pickGood && JP.canSell(s, mine, pickGood)) {
      dispatch({ kind: 'sell', good: pickGood, n: handCounts[pickGood] }); setPickGood(null)
    }
  }

  const yourScore = JP.totalScore(s, mine), oppScore = JP.totalScore(s, opp)
  const camelsInMarket = JP.marketCamels(s)
  const sellable = pickGood ? JP.canSell(s, mine, pickGood) : false
  const oppLabel = net.online ? 'Opponent' : 'Rival'

  const iWon = s.winner === mine, oppWon = s.winner === opp

  let banner: string, bk = ''
  if (iWon) { bk = 'win'; banner = `You win the round — ${yourScore} rupees` }
  else if (oppWon) { bk = 'lose'; banner = `${oppLabel} wins — ${oppScore} rupees` }
  else if (s.winner === 'tie') { bk = ''; banner = `An even purse — ${yourScore} each` }
  else if (yourTurn) { bk = 'you'; banner = handFull ? 'Hand full — sell a set' : 'Your move — take or sell' }
  else { bk = 'foe'; banner = net.online ? `The ${oppLabel.toLowerCase()} is trading…` : 'The rival is trading…' }

  return (
    <>
      <GameShell
        mark={TITLE_MARK}
        eyebrow="Jaipur · bazaar trade"
        title="Jaipur"
        subtitle="take goods and camels, then sell your sets for the richest tokens before they run dry"
        onRules={() => setShowRules(true)}
        onNew={newGame}
        modeLeft={<>Deck {s.deck.length} · Empty stacks {JP.emptyStacks(s)}/3</>}
        banner={banner}
        bannerClass={bk}
        modeRight={<>N · new &nbsp; ? · rules</>}
      >
        <div className="jp-main">
          {/* opponent strip */}
          <div className="jp-rival">
            <span className="jp-rl">{oppLabel}</span>
            <span className="jp-chip">{JP.handCount(s, opp)} goods</span>
            <span className="jp-chip camel">🐪 {s.herd[opp]}</span>
            <span className="jp-chip rupee">{oppScore} rupees</span>
          </div>

          {/* market */}
          <div className="jp-block">
            <div className="jp-label">The Market</div>
            <div className="jp-market">
              {s.market.map((c, i) => (
                c === 'camel' ? (
                  <button key={i} className="jp-card camel" onClick={camels} disabled={!yourTurn || handFull} title="Take all camels">
                    <span className="jp-glyph">🐪</span><span className="jp-cname">Camel</span>
                  </button>
                ) : (
                  <button key={i} className={'jp-card g-' + c} onClick={() => take(i)} disabled={!yourTurn || handFull} title={`Take ${GOOD_LABEL[c as Good]}`}>
                    <span className="jp-glyph">{GOOD_GLYPH[c as Good]}</span>
                    <span className="jp-cname">{GOOD_LABEL[c as Good]}</span>
                    <span className="jp-tval">{JP.tokenTop(s, c as Good)}</span>
                  </button>
                )
              ))}
            </div>
            <div className="jp-actions">
              <button className="jp-btn" onClick={camels} disabled={!yourTurn || camelsInMarket === 0 || handFull}>Take all camels ({camelsInMarket})</button>
              <button className="jp-btn sell" onClick={doSell} disabled={!yourTurn || !sellable}>
                {pickGood ? `Sell ${handCounts[pickGood]} ${GOOD_LABEL[pickGood]}` : 'Select a set to sell'}
              </button>
            </div>
          </div>

          {/* your hand + herd */}
          <div className="jp-block">
            <div className="jp-label">Your Caravan &nbsp;<span className="jp-sub">hand {JP.handCount(s, mine)}/{HAND_LIMIT} · herd 🐪 {s.herd[mine]}</span></div>
            <div className="jp-hand">
              {GOODS.filter(g => handCounts[g] > 0).map(g => {
                const can = JP.canSell(s, mine, g)
                return (
                  <button
                    key={g}
                    className={'jp-good g-' + g + (pickGood === g ? ' sel' : '') + (!can ? ' locked' : '')}
                    onClick={() => yourTurn && can && setPickGood(p => p === g ? null : g)}
                    disabled={!yourTurn || !can}
                    title={can ? `Sell ${handCounts[g]} ${GOOD_LABEL[g]}` : `${GOOD_LABEL[g]} needs a pair to sell`}
                  >
                    <span className="jp-glyph">{GOOD_GLYPH[g]}</span>
                    <span className="jp-cname">{GOOD_LABEL[g]}</span>
                    <span className="jp-qty">×{handCounts[g]}</span>
                  </button>
                )
              })}
              {s.hand[mine].length === 0 && <div className="jp-empty">No goods yet — take a card from the market.</div>}
              {s.herd[mine] > 0 && <div className="jp-good camel"><span className="jp-glyph">🐪</span><span className="jp-cname">Herd</span><span className="jp-qty">×{s.herd[mine]}</span></div>}
            </div>
          </div>
        </div>

        <div className="side">
          <OnlineBar net={net} />

          <div className="panel jp-scoreboard">
            <div className={'jp-sc' + (yourTurn ? ' on' : '')}><span className="jp-scn you">You</span><span className="jp-scv">{yourScore}</span></div>
            <div className={'jp-sc' + (s.winner == null && !isMyTurn ? ' on' : '')}><span className="jp-scn foe">{oppLabel}</span><span className="jp-scv">{oppScore}</span></div>
            <div className="jp-camelrow">Camels &nbsp; You {s.herd[mine]} · {oppLabel} {s.herd[opp]} <span className="jp-camelbonus">(+5 to the bigger herd)</span></div>
          </div>

          <div className="panel jp-tokens">
            <div className="panel-l">Goods tokens · top value</div>
            {GOODS.map(g => (
              <div key={g} className={'jp-trow g-' + g}>
                <span className="jp-tglyph">{GOOD_GLYPH[g]}</span>
                <span className="jp-tname">{GOOD_LABEL[g]}{EXPENSIVE.includes(g) ? ' *' : ''}</span>
                <span className="jp-tstack">{s.tokens[g].length ? `${s.tokens[g][0]} · ${s.tokens[g].length} left` : 'empty'}</span>
              </div>
            ))}
          </div>

          <div className="panel logbox">{s.log.slice().reverse().map((l, i) => <div key={i} className={'log-line ' + l.t}>{l.x}</div>)}</div>
        </div>
      </GameShell>

      {s.winner && <ResultModal won={iWon} tie={s.winner === 'tie'} you={yourScore} opp={oppScore} oppLabel={oppLabel} onNew={newGame} />}
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </>
  )
}

function ResultModal({ won, tie, you, opp, oppLabel, onNew }: { won: boolean; tie: boolean; you: number; opp: number; oppLabel: string; onNew: () => void }) {
  return (
    <Modal
      eyebrow={tie ? 'Even purses' : won ? 'Master merchant' : 'Out-traded'}
      title={tie ? 'A Tie' : won ? 'You Win' : `${oppLabel} Wins`}
      closeOnOverlay={false}
      actions={<button className="btn-modal" onClick={onNew}>Trade again</button>}
    >
      <div className="finalsc"><span className="you">You {you}</span><span className="foe">{oppLabel} {opp}</span></div>
    </Modal>
  )
}

function RulesModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal eyebrow="How to play" title="Jaipur" onClose={onClose}
      actions={<button className="btn-modal" onClick={onClose}>Begin</button>}>
      <div className="modal-body">
        <p>You and a rival merchant trade six goods — <b>Diamond, Gold, Silver</b> (expensive) and <b>Cloth, Spice, Leather</b> (cheap) — plus <b>camels</b>. On your turn do <b>one</b> thing.</p>
        <p><b>Take:</b> grab a single goods card from the market into your hand, <i>or</i> take <b>all the camels</b> into your herd, <i>or</i> swap two-or-more of your cards for the same number of market goods.</p>
        <p><b>Sell:</b> tap one of your goods to select it, then <b>Sell</b> the whole set for the top <b>tokens</b> of that type (one per card) plus a bonus for selling 3, 4, or 5. Expensive goods must be sold in pairs or larger.</p>
        <p>Your hand holds at most <b>7 goods</b> (camels don't count). The round ends when <b>3 token stacks</b> empty or the deck runs out; the bigger camel herd earns <b>+5</b>. Most rupees wins.</p>
        <p><b>Keys:</b> <kbd>N</kbd> new game · <kbd>?</kbd> rules · <kbd>Esc</kbd> close.</p>
      </div>
    </Modal>
  )
}
