/* THE QUACKS OF QUEDLINBURG — UI (built for this codebase).
   Push-your-luck bag-building. Online-capable via useGameSession: the host runs the real
   logic.ts, guests send draw/stop/buy intents and render their per-seat view (which hides
   the contents/order of other players' bags — see net.ts redactFor). The AI fills any seat
   without a human. Everything is rendered RELATIVE to mySeat: "your" pot/bag/score come
   from mySeat, and isMyTurn gates draw/stop/buy. Solo play is unchanged (mySeat === 0). */

import { useEffect, useRef, useState } from 'react'
import { GameShell } from '../../framework/GameShell'
import { Modal } from '../../framework/Modal'
import { OnlineBar } from '../../framework/OnlineBar'
import { useGameKeys } from '../../framework/useGameKeys'
import { useGameSession } from '../../net/useGameSession'
import { quacksAdapter } from './net'
import * as Q from './logic'
import type { QuacksState, PlayerState, Chip, Color } from './logic'

const TITLE_MARK = (
  <svg className="title-mark" viewBox="0 0 48 48" aria-hidden="true">
    <rect x="4" y="4" width="40" height="40" rx="11" fill="#2a1f38" stroke="#e8a33c" strokeWidth="1.5" />
    <path d="M14 22 q10 8 20 0" fill="none" stroke="#5fd6c0" strokeWidth="2.4" strokeLinecap="round" />
    <ellipse cx="24" cy="30" rx="11" ry="6" fill="#392b50" stroke="#b98bdc" strokeWidth="1.5" />
    <circle cx="18" cy="17" r="2.4" fill="#f0903a" />
    <circle cx="30" cy="16" r="2.4" fill="#a96fe0" />
    <circle cx="24" cy="13" r="2.4" fill="#5fb86a" />
  </svg>
)

function chipGlyph(value: number) { return String(value) }

/** A chip resting on a pot space. */
function OnChip({ c }: { c: Chip }) {
  return <span className={'qk-onchip qk-chip ' + c.color} title={`${c.color} ${c.value}`}>{chipGlyph(c.value)}</span>
}

export function Quacks() {
  const { state: s, mySeat, isMyTurn, dispatch, newGame: netNew, net } = useGameSession(quacksAdapter)
  const [showRules, setShowRules] = useState(false)
  const logRef = useRef<HTMLDivElement>(null)

  function newGame() {
    netNew()
    setShowRules(false)
  }

  const over = s.phase === 'over'
  const you = s.players[mySeat]
  const oppSeat = mySeat === 0 ? 1 : 0
  const opp = s.players[oppSeat]
  const oppName = net.online ? 'Opponent' : opp.name

  // isMyTurn already encodes "it is this seat's turn to act and game not over".
  const yourDraw = isMyTurn && s.phase === 'draw' && !you.done
  const yourShop = isMyTurn && s.phase === 'shop'

  function doDraw() { if (yourDraw) dispatch({ kind: 'draw' }) }
  function doStop() { if (yourDraw) dispatch({ kind: 'stop' }) }
  function doBuy(id: string) { if (yourShop) dispatch({ kind: 'buy', card: id }) }
  function doEndShop() { if (yourShop) dispatch({ kind: 'endShop' }) }

  useEffect(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight }, [s.log])

  useGameKeys({
    onNew: newGame,
    onToggleRules: () => setShowRules(v => !v),
    onEscape: () => setShowRules(false),
    extra: (e) => {
      if (yourDraw) {
        if (e.key === ' ' || e.key === 'Spacebar') { doDraw(); return true }
        if (e.key === 's' || e.key === 'S') { doStop(); return true }
      }
      if (yourShop && (e.key === 'Enter')) { doEndShop(); return true }
      return false
    },
  })

  // banner — relative to mySeat
  let banner: string, bk = ''
  if (over) {
    const won = s.winner === mySeat
    bk = won ? 'win' : 'lose'
    banner = won
      ? `You win the brewing contest — ${you.vp} VP!`
      : `${oppName} wins — ${opp.vp} VP to your ${you.vp}.`
  } else if (yourDraw) {
    bk = 'you'
    const risk = Q.nextDrawBustProb(you)
    banner = you.pool.length === 0
      ? 'Bag empty — stop to bank your pot'
      : `Your brew · draw a chip or stop (bust risk ${(risk * 100).toFixed(0)}%)`
  } else if (s.phase === 'draw') {
    bk = 'foe'
    banner = `${oppName} is brewing…`
  } else if (yourShop) {
    bk = 'you'
    banner = `Shop · spend coins on ingredients, then brew the next round (you have ${you.coins} coins)`
  } else if (s.phase === 'shop') {
    bk = 'foe'
    banner = `${oppName} is shopping…`
  } else {
    bk = 'foe'
    banner = `${oppName} is brewing…`
  }

  const risk = Q.nextDrawBustProb(you)
  const limitPct = (Q.EXPLODE_LIMIT / (Q.EXPLODE_LIMIT * 1.35)) * 100
  const fillPct = (you.whiteTotal / (Q.EXPLODE_LIMIT * 1.35)) * 100

  // build a small pot track display of the drawn chips up to current head
  const SPACES = Q.TRACK_LEN
  // map each drawn chip to the space it landed on (cumulative pos)
  const landed: Record<number, Chip> = {}
  let acc = 0
  for (const c of you.drawn) { acc += c.value; landed[acc] = c }

  return (
    <>
      <GameShell
        mark={TITLE_MARK}
        eyebrow="Quacks of Quedlinburg · push your luck"
        title="Quacks"
        subtitle="brew the deepest potion — but one cherry bomb too many and the whole pot blows"
        onRules={() => setShowRules(true)}
        onNew={newGame}
        modeLeft={`Round ${Math.min(s.round, Q.ROUNDS)} / ${Q.ROUNDS}`}
        banner={banner}
        bannerClass={bk}
        modeRight={<>space · draw &nbsp; S · stop &nbsp; ↵ · next round &nbsp; N · new</>}
      >
        <div className="qk-main">
          {/* cherry-bomb gauge */}
          <div className="panel qk-gauge-panel">
            <div className="qk-gauge-head">
              <div className="panel-l">Cherry bombs (white total)</div>
              <div className={'qk-gauge-num' + (you.exploded ? '' : you.whiteTotal <= Q.EXPLODE_LIMIT ? ' safe' : '')}>
                <b>{you.whiteTotal}</b> <span className="qk-gauge-sub">/ {Q.EXPLODE_LIMIT} max</span>
              </div>
            </div>
            <div className="qk-gauge-track">
              <div className="qk-gauge-fill" style={{ width: `${Math.min(fillPct, 100)}%` }} />
              <div className="qk-gauge-limit" style={{ left: `${limitPct}%` }} />
            </div>
            <div className="qk-gauge-sub">
              {you.exploded
                ? 'POT EXPLODED — you bank points OR coins this round, not both.'
                : `${Q.whitesLeft(you)} cherry bombs still in your bag · exceed ${Q.EXPLODE_LIMIT} and it blows`}
            </div>
          </div>

          {/* pot track */}
          <div className="panel qk-pot-panel">
            <div className="panel-l">Your pot · space {you.pos} → +{Q.vpForPos(you.pos)} VP, +{Q.coinsForPos(you.pos)} coins</div>
            <div className="qk-pot">
              {Array.from({ length: SPACES }, (_, i) => {
                const n = i + 1
                const chip = landed[n]
                const reached = n <= you.pos
                const head = n === you.pos
                return (
                  <div key={n} className={'qk-space' + (reached ? ' reached' : '') + (head ? ' head' : '')}>
                    <span className="qk-space-n">{n}</span>
                    {chip ? <OnChip c={chip} /> : <span className="qk-space-vp">{Q.vpForPos(n)}</span>}
                  </div>
                )
              })}
            </div>
          </div>

          {/* controls / shop */}
          {s.phase === 'shop' ? (
            <div className="panel qk-pot-panel">
              <div className="panel-l">Apothecary shop · {you.coins} coins to spend</div>
              <div className="qk-shop">
                {s.shop.map(item => {
                  const afford = you.coins >= item.cost
                  return (
                    <button key={item.id} className="qk-shop-item" disabled={!yourShop || !afford} onClick={() => doBuy(item.id)}>
                      <div className="qk-shop-top">
                        <span className={'qk-shop-swatch qk-chip ' + item.color}>{item.value}</span>
                        <span className="qk-shop-name">{item.label}</span>
                        <span className="qk-shop-cost">{item.cost}¢</span>
                      </div>
                      <span className="qk-shop-eff">{item.effect}</span>
                    </button>
                  )
                })}
              </div>
              <div className="qk-actions" style={{ marginTop: 10 }}>
                <button className="qk-btn ghost" onClick={doEndShop} disabled={!yourShop}>Done shopping — brew next round ↵</button>
              </div>
            </div>
          ) : (
            <div className="panel">
              <div className="qk-actions">
                <button className="qk-btn" onClick={doDraw} disabled={!yourDraw || you.pool.length === 0}>Draw a chip</button>
                <button className="qk-btn stop" onClick={doStop} disabled={!yourDraw}>Stop &amp; bank</button>
                <span className={'qk-risk' + (risk < 0.2 ? ' low' : '')}>
                  next-draw bust <b>{(risk * 100).toFixed(0)}%</b>
                </span>
              </div>
            </div>
          )}
        </div>

        <div className="side">
          <OnlineBar net={net} />

          <div className="panel qk-scores">
            <PlayerCard p={you} name="You" active={!over && yourDraw} />
            <PlayerCard p={opp} name={oppName} active={!over && s.phase === 'draw' && !opp.done} />
            <div className="qk-goal">9 rounds · most victory points wins</div>
          </div>

          <div className="panel logbox" ref={logRef}>
            {s.log.map((l, i) => <div key={i} className={'log-line ' + l.t}>{l.x}</div>)}
          </div>
        </div>
      </GameShell>

      {over && <ResultModal s={s} mySeat={mySeat} oppName={oppName} onNew={newGame} />}
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </>
  )
}

function bagCounts(bag: Chip[]): { color: Color; n: number; hidden: number }[] {
  const order: Color[] = ['white', 'orange', 'green', 'blue', 'red', 'purple']
  // Redacted chips (from net.ts) have id -1 / value 0; count them as "hidden" so an
  // opponent's bag shows a single opaque count instead of leaking its composition.
  const hidden = bag.filter(c => c.id === -1).length
  const real = order
    .map(color => ({ color, n: bag.filter(c => c.id !== -1 && c.color === color).length, hidden: 0 }))
    .filter(o => o.n > 0)
  return real
    .concat(hidden > 0 ? [{ color: 'white', n: 0, hidden }] : [])
}

function PlayerCard({ p, name, active }: { p: PlayerState; name: string; active: boolean }) {
  const counts = bagCounts(p.bag)
  return (
    <div className={'qk-pc' + (p.seat === 0 ? ' you' : ' ai') + (active ? ' on' : '')}>
      <div className="qk-pc-head">
        <span className="qk-pc-ic">{p.seat === 0 ? '🧪' : '🧙'}</span>
        <span className="qk-pc-name">{name}</span>
        <span className="qk-pc-vp">{p.vp} VP</span>
      </div>
      <div className="qk-pc-row">
        <span>pot {p.pos}</span>
        <span>{p.coins}¢</span>
        {p.exploded && <span className="qk-x">💥 exploded</span>}
      </div>
      <div className="qk-pc-bag">
        {counts.map(({ color, n, hidden }, i) =>
          hidden > 0
            ? <span key={'h' + i} className="qk-bagchip qk-chip" title={`${hidden} chips (hidden)`}>{hidden}?</span>
            : <span key={color} className={'qk-bagchip qk-chip ' + color} title={`${n} ${color}`}>{n}</span>,
        )}
      </div>
    </div>
  )
}

function ResultModal({ s, mySeat, oppName, onNew }: { s: QuacksState; mySeat: number; oppName: string; onNew: () => void }) {
  const won = s.winner === mySeat
  const you = s.players[mySeat]
  const oppSeat = mySeat === 0 ? 1 : 0
  const opp = s.players[oppSeat]
  return (
    <Modal
      eyebrow={won ? 'Brew master' : 'Out-brewed'}
      title={won ? 'You Win' : `${oppName} Wins`}
      closeOnOverlay={false}
      actions={<button className="btn-modal" onClick={onNew}>Brew again</button>}
    >
      <div className="qk-final">
        {[you, opp].map((p, i) => (
          <span key={p.seat} className={'qk-final-row' + (p.seat === s.winner ? ' win' : '')}>
            <b>{i === 0 ? 'You' : oppName}</b> {p.vp} VP · {p.coins}¢ · {p.bag.length} chips
          </span>
        ))}
      </div>
    </Modal>
  )
}

function RulesModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal eyebrow="How to play" title="Quacks of Quedlinburg" onClose={onClose}
      actions={<button className="btn-modal" onClick={onClose}>Brew on</button>}>
      <div className="modal-body">
        <p>You and <b>Hex the Witch</b> each have a <b>bag of chips</b> and a <b>pot</b>. Each round you draw chips one at a time; every chip advances your pot pointer by its <b>value</b> (1/2/4).</p>
        <p><b>White cherry bombs</b> (values 1/2/3) are dangerous: keep a running total of white values. If it ever <b>exceeds {Q.EXPLODE_LIMIT}</b>, your pot <b>explodes</b>.</p>
        <p>You may <b>stop</b> at any time. The space you reach gives <b>victory points</b> and <b>coins</b>. If you did not explode you bank <b>both</b>; if you exploded you bank <b>either points or coins</b> (whichever is larger), not both.</p>
        <p>Spend coins in the <b>shop</b> on colored ingredients: orange advances more, <b>green</b> = bonus VP, <b>red</b> = bonus coins, <b>purple</b> = +2 VP when safe, <b>blue</b> a cheap utility chip. New chips go into your bag for future rounds.</p>
        <p>Play <b>9 rounds</b>. Most victory points wins.</p>
        <p><b>Keys:</b> <kbd>Space</kbd> draw · <kbd>S</kbd> stop · <kbd>Enter</kbd> next round · <kbd>N</kbd> new · <kbd>?</kbd> rules · <kbd>Esc</kbd> close.</p>
      </div>
    </Modal>
  )
}
