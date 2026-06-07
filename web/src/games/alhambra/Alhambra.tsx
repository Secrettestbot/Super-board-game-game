/* ALHAMBRA — UI (built for this codebase).
   Tile-buying with 4 currencies vs two rival architects on the framework shell. Take
   money cards, buy building tiles (priced in a specific currency; exact pay = extra
   turn), and build type majorities scored across 3 rounds.

   Online-capable via useGameSession(alhambraAdapter): the host runs the real logic and
   fills empty seats with the greedy AI; a guest plays a non-host seat over the wire and
   only ever sees its OWN money hand (opponents' hands + the face-down decks are redacted).
   Everything is seat-relative — "you" is mySeat, opponents are AI in solo and "Opponent"/
   "Player N" online. Solo play (mySeat 0, seats 1/2 AI) is unchanged.
*/

import { useEffect, useRef, useState } from 'react'
import { GameShell } from '../../framework/GameShell'
import { Modal } from '../../framework/Modal'
import { useGameKeys } from '../../framework/useGameKeys'
import { OnlineBar } from '../../framework/OnlineBar'
import { useGameSession } from '../../net/useGameSession'
import { alhambraAdapter } from './net'
import * as A from './logic'
import type { AlhambraState, Currency, Building, PlayerState, PlayerIdx, Tile } from './logic'

const TITLE_MARK = (
  <svg className="title-mark" viewBox="0 0 48 48" aria-hidden="true">
    <rect x="3" y="3" width="42" height="42" rx="10" fill="#261c15" stroke="#574230" strokeWidth="1.5" />
    <path d="M24 8 L33 17 L33 40 L15 40 L15 17 Z" fill="#d98c4a" stroke="#f0ac6e" strokeWidth="1" />
    <path d="M24 8 L33 17 L24 20 L15 17 Z" fill="#f0ac6e" />
    <rect x="21" y="28" width="6" height="12" rx="3" fill="#1f1610" />
    <circle cx="9" cy="34" r="3" fill="#5fae5a" />
    <circle cx="39" cy="34" r="3" fill="#4a8fd6" />
    <circle cx="39" cy="13" r="2.4" fill="#e6c34a" />
  </svg>
)

const CUR_LABEL: Record<Currency, string> = { green: 'Green', blue: 'Blue', orange: 'Orange', yellow: 'Yellow' }
const curBg = (c: Currency) => 'bg-' + c
const buildClass = (b: Building) => 'b-' + b

export function Alhambra() {
  const { state: s, mySeat, isMyTurn, dispatch, newGame: netNew, net } = useGameSession(alhambraAdapter)
  const me = s.players[mySeat]

  const [showRules, setShowRules] = useState(false)
  // Selected money-market indices for a "take", or selected hand card ids for a buy.
  const [moneyPicks, setMoneyPicks] = useState<number[]>([])
  const [payPicks, setPayPicks] = useState<string[]>([])
  const [buyTarget, setBuyTarget] = useState<number | null>(null)
  const logRef = useRef<HTMLDivElement>(null)

  function newGame() {
    netNew(); setMoneyPicks([]); setPayPicks([]); setBuyTarget(null); setShowRules(false)
  }

  const yourTurn = s.winner == null && isMyTurn

  // Naming relative to mySeat: in solo the others are AIs; online they are remote humans.
  const seatName = (i: number) => {
    if (i === mySeat) return 'You'
    if (net.online) return `Player ${i + 1}`
    return `AI ${i}`
  }
  const oppShort = net.online ? 'a rival' : 'the AI architects'

  // Clear selections whenever it stops being your turn (or the game advances).
  useEffect(() => { if (!yourTurn) { setMoneyPicks([]); setPayPicks([]); setBuyTarget(null) } }, [yourTurn, s.step])

  useGameKeys({
    onNew: newGame,
    onToggleRules: () => setShowRules((v) => !v),
    onEscape: () => { setShowRules(false); setMoneyPicks([]); setPayPicks([]); setBuyTarget(null) },
  })

  // ---- money take selection ----
  function toggleMoney(i: number) {
    if (!yourTurn) return
    setBuyTarget(null); setPayPicks([])
    setMoneyPicks((cur) => {
      if (cur.includes(i)) return cur.filter((x) => x !== i)
      // Enforce the rule live: single card OK, or multi summing <=5.
      const card = s.moneyMarket[i]
      if (!card) return cur
      if (cur.length === 0) return [i]
      let sum = card.value
      for (const j of cur) sum += s.moneyMarket[j]!.value
      if (sum > A.MAX_TAKE_SUM) return cur
      return cur.concat([i])
    })
  }
  function doTake() {
    if (!yourTurn || !A.canTakeMoney(s, moneyPicks)) return
    dispatch({ kind: 'take', indices: moneyPicks })
    setMoneyPicks([])
  }

  // ---- buy selection: pick a market tile, then pick hand cards to pay ----
  function selectBuy(idx: number) {
    if (!yourTurn) return
    const tile = s.buildingMarket[idx]
    if (!tile || !A.canAfford(me, tile)) return
    setMoneyPicks([])
    setBuyTarget(idx)
    // Pre-fill an exact / minimal payment for convenience.
    const pre = A.choosePayment(me, tile)
    setPayPicks(pre ?? [])
  }
  function togglePay(id: string) {
    if (buyTarget == null) return
    const tile = s.buildingMarket[buyTarget]
    if (!tile) return
    const card = me.hand.find((c) => c.id === id)
    if (!card || card.currency !== tile.priceCur) return
    setPayPicks((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : cur.concat([id])))
  }
  function doBuy() {
    if (!yourTurn || buyTarget == null) return
    const tile = s.buildingMarket[buyTarget]
    if (!tile) return
    let sum = 0
    for (const id of payPicks) { const c = me.hand.find((x) => x.id === id); if (c) sum += c.value }
    if (sum < tile.cost) return
    dispatch({ kind: 'buy', marketIndex: buyTarget, payment: payPicks })
    setBuyTarget(null); setPayPicks([])
  }

  // ---- banner ----
  const round = Math.min(s.roundsScored + 1, 3)
  let banner: string, bk = ''
  if (s.winner != null) {
    if (s.winner === mySeat) { bk = 'win'; banner = `You win — ${me.score} points!` }
    else { bk = 'lose'; banner = `${seatName(s.winner)} wins with ${s.players[s.winner].score} points` }
  } else if (yourTurn) {
    bk = 'you'
    if (buyTarget != null) {
      const tile = s.buildingMarket[buyTarget]
      let sum = 0
      for (const id of payPicks) { const c = me.hand.find((x) => x.id === id); if (c) sum += c.value }
      banner = tile ? `Paying ${sum}/${tile.cost} ${tile.priceCur}${tile && sum === tile.cost ? ' — exact, extra turn!' : ''}` : 'Your turn'
    } else if (moneyPicks.length) {
      let sum = 0; for (const j of moneyPicks) sum += s.moneyMarket[j]!.value
      banner = `Take ${moneyPicks.length} card${moneyPicks.length > 1 ? 's' : ''} (sum ${sum})`
    } else banner = 'Your turn — take money or buy a tile'
  } else { bk = 'foe'; banner = `${seatName(s.turn)} is building…` }

  const buySum = payPicks.reduce((a, id) => { const c = me.hand.find((x) => x.id === id); return a + (c ? c.value : 0) }, 0)
  const buyTile = buyTarget != null ? s.buildingMarket[buyTarget] : null
  const canDoBuy = buyTile != null && buySum >= buyTile.cost

  // Seats listed you-first so the scoreboard reads relative to mySeat.
  const seatOrder = s.players.map((_, i) => i).sort((a, b) => (a === mySeat ? -1 : b === mySeat ? 1 : a - b))
  const scoreLine = seatOrder.map(i => `${seatName(i)} ${s.players[i].score}`).join(' · ')

  return (
    <>
      <GameShell
        mark={TITLE_MARK}
        eyebrow="Alhambra · tile builder"
        title="Alhambra"
        subtitle="buy glazed building tiles in four currencies, build the majorities, and out-score two rival architects across three scoring rounds"
        onRules={() => setShowRules(true)}
        onNew={newGame}
        newLabel="New Game"
        modeLeft={`Round ${round}/3 · ${scoreLine}`}
        banner={banner}
        bannerClass={bk}
        modeRight={<>click money / tile · take or buy &nbsp; N · new</>}
      >
        <div className="al-main">
          {/* Building market */}
          <div>
            <div className="al-section-l">Building market · click a tile you can afford</div>
            <div className="al-row">
              {s.buildingMarket.map((tile, i) => (
                <TileView
                  key={tile ? tile.id : 'te' + i}
                  tile={tile}
                  me={me}
                  yourTurn={yourTurn}
                  selected={buyTarget === i}
                  onSelect={() => selectBuy(i)}
                />
              ))}
            </div>
          </div>

          {/* Money market */}
          <div>
            <div className="al-section-l">Money market · take 1 card, or several summing ≤ 5</div>
            <div className="al-row">
              {s.moneyMarket.map((card, i) => {
                const pickable = yourTurn && card != null
                return (
                  <div
                    key={card ? card.id : 'me' + i}
                    className={'al-money' + (card == null ? ' empty' : '') + (pickable ? ' pick' : '') + (moneyPicks.includes(i) ? ' chosen' : '')}
                    onClick={pickable ? () => toggleMoney(i) : undefined}
                  >
                    {card && <>
                      <span className={'al-cur-band ' + curBg(card.currency)} />
                      <span className="al-mval">{card.value}</span>
                      <span className="al-mcur">{CUR_LABEL[card.currency]}</span>
                    </>}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Your hand by currency + pay picker */}
          <div>
            <div className="al-section-l">
              {buyTile ? `Pay ${buyTile.cost} ${buyTile.priceCur} — click ${buyTile.priceCur} cards (overpay ok, no change)` : 'Your money · grouped by currency'}
            </div>
            <div className="al-hand">
              {A.CURRENCIES.map((cur) => {
                const cards = me.hand.filter((c) => c.currency === cur).sort((a, b) => a.value - b.value)
                const tot = A.currencyTotal(me, cur)
                const payable = buyTile != null && buyTile.priceCur === cur
                return (
                  <div className="al-hand-stack" key={cur}>
                    <div className="al-hc-top">
                      <span className={'al-hc-dot ' + curBg(cur)} />
                      <span className="al-hc-lbl">{CUR_LABEL[cur]}</span>
                      <span className="al-hc-tot">{tot}</span>
                    </div>
                    <div className="al-hc-cards">
                      {cards.length === 0 && <span className="al-control-hint">—</span>}
                      {cards.map((c) => (
                        <span
                          key={c.id}
                          className={'al-hc-card ' + curBg(cur) + (payPicks.includes(c.id) ? ' sel' : '') + (payable ? ' payable' : '')}
                          onClick={payable ? () => togglePay(c.id) : undefined}
                        >{c.value}</span>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="al-controls" style={{ marginTop: 11 }}>
              <div className="al-btns">
                <button className="al-btn" disabled={!yourTurn || !A.canTakeMoney(s, moneyPicks)} onClick={doTake}>
                  Take money{moneyPicks.length ? ` (${moneyPicks.length})` : ''}
                </button>
                <button className="al-btn" disabled={!yourTurn || !canDoBuy} onClick={doBuy}>
                  {buyTile ? `Buy ${buyTile.building} (${buySum}/${buyTile.cost})` : 'Buy tile'}
                </button>
                {(moneyPicks.length > 0 || buyTarget != null) && (
                  <button className="al-btn ghost" onClick={() => { setMoneyPicks([]); setBuyTarget(null); setPayPicks([]) }}>Clear</button>
                )}
              </div>
              <div className="al-control-hint">
                {yourTurn
                  ? 'On your turn do ONE: take money (1 card, or several summing ≤5), OR buy a market tile by paying its cost in the required currency. Pay the EXACT cost to earn an extra turn.'
                  : `Waiting for ${oppShort}…`}
              </div>
            </div>
          </div>
        </div>

        {/* Side: online bar + boards + log */}
        <div className="side">
          <div className="panel"><OnlineBar net={net} /></div>
          {seatOrder.map((i) => (
            <Board
              key={i}
              label={seatName(i)}
              who={i === mySeat ? 'you' : i === seatOrder[1] ? 'ai1' : 'ai2'}
              p={s.players[i]}
              idx={i as PlayerIdx}
              active={s.turn === i && s.winner == null}
              all={s.players}
            />
          ))}
          <div className="panel logbox" ref={logRef}>
            {s.log.slice().reverse().map((l, i) => (
              <div key={i} className={'log-line ' + l.t}>{l.x}</div>
            ))}
          </div>
        </div>
      </GameShell>

      {s.winner != null && <ResultModal s={s} mySeat={mySeat} won={s.winner === mySeat} winnerName={seatName(s.winner)} amHost={net.amHost} seatName={seatName} onNew={newGame} />}
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </>
  )
}

// ---------------------------------------------------------------------------

function TileView({
  tile, me, yourTurn, selected, onSelect,
}: {
  tile: Tile | null
  me: PlayerState
  yourTurn: boolean
  selected: boolean
  onSelect: () => void
}) {
  if (!tile) return <div className="al-tile empty" />
  const afford = A.canAfford(me, tile)
  const exact = A.canPayExact(me, tile)
  const canBuy = yourTurn && afford
  return (
    <div className={'al-tile' + (afford ? ' afford' : '') + (exact ? ' exact' : '') + (selected ? ' chosen' : '')}>
      <span className={'al-tile-swatch ' + buildClass(tile.building)} />
      <span className="al-tile-name">{tile.building}</span>
      <span className="al-tile-cost">
        <span className="num">{tile.cost}</span>
        <span className={'chip bg-' + tile.priceCur} />
        <span>{tile.priceCur}</span>
      </span>
      <button className="al-mini-btn buy" disabled={!canBuy} onClick={canBuy ? onSelect : undefined}>
        {selected ? 'Selected' : afford ? (exact ? 'Buy · exact' : 'Buy') : 'Too costly'}
      </button>
    </div>
  )
}

function Board({
  label, who, p, idx, active, all,
}: {
  label: string
  who: 'you' | 'ai1' | 'ai2'
  p: PlayerState
  idx: PlayerIdx
  active: boolean
  all: [PlayerState, PlayerState, PlayerState]
}) {
  const wall = A.longestWall(p)
  return (
    <div className={'al-board' + (active ? ' on' : '')}>
      <div className="al-board-head">
        <span className={'al-pawn ' + who} />
        <span className="al-board-name">{label}</span>
        <span className="al-board-score">{p.score}<small> pts</small></span>
      </div>
      <div className="al-types">
        {A.BUILDINGS.map((b) => {
          const n = A.buildingCount(p, b)
          const max = Math.max(A.buildingCount(all[0], b), A.buildingCount(all[1], b), A.buildingCount(all[2], b))
          const lead = n > 0 && n === max
          return (
            <span className="al-type" key={b} title={b}>
              <span className={'al-tswatch ' + buildClass(b)} />
              <span className={lead ? 'al-tlead' : ''}>{n}</span>
            </span>
          )
        })}
      </div>
      <div className="al-board-meta">
        <span>tiles <b>{p.alhambra.length}</b></span>
        <span>wall <b>{wall}</b></span>
        <span>cards <b>{p.hand.length}</b></span>
      </div>
      {p.alhambra.length > 0 && <MiniGrid p={p} />}
    </div>
  )
}

function MiniGrid({ p }: { p: PlayerState }) {
  // Compute bounds including the fountain at (0,0).
  let minX = 0, maxX = 0, minY = 0, maxY = 0
  for (const pl of p.alhambra) {
    minX = Math.min(minX, pl.x); maxX = Math.max(maxX, pl.x)
    minY = Math.min(minY, pl.y); maxY = Math.max(maxY, pl.y)
  }
  const cell = 36, pad = 0
  const w = (maxX - minX + 1) * cell + pad
  const h = (maxY - minY + 1) * cell + pad
  const px = (x: number) => (x - minX) * cell
  const py = (y: number) => (y - minY) * cell
  return (
    <div className="al-grid-wrap" style={{ marginTop: 8 }}>
      <div className="al-grid" style={{ width: w, height: h }}>
        <div className="al-cell fountain" style={{ left: px(0), top: py(0) }}>⛲</div>
        {p.alhambra.map((pl, i) => (
          <div
            key={i}
            className={'al-cell ' + buildClass(pl.tile.building)}
            style={{ left: px(pl.x), top: py(pl.y) }}
            title={pl.tile.building}
          >{pl.tile.building.slice(0, 2)}</div>
        ))}
      </div>
    </div>
  )
}

function ResultModal({
  s, won, winnerName, seatName, mySeat, amHost, onNew,
}: {
  s: AlhambraState
  mySeat: number
  won: boolean
  winnerName: string
  amHost: boolean
  seatName: (i: number) => string
  onNew: () => void
}) {
  return (
    <Modal
      eyebrow={won ? 'Master architect' : 'Outbuilt'}
      title={won ? 'You Win' : `${winnerName} Wins`}
      closeOnOverlay={false}
      actions={amHost ? <button className="btn-modal" onClick={onNew}>Play again</button> : undefined}
    >
      <div className="modal-body">
        <p style={{ textAlign: 'center', fontSize: 15 }}>
          {s.players.map((p, i) => (
            <b key={i} style={{ color: i === mySeat ? 'var(--you)' : 'var(--ink-2)' }}>
              {seatName(i)} {p.score}{i < s.players.length - 1 ? '   ·   ' : ''}
            </b>
          ))}
        </p>
        <p style={{ textAlign: 'center' }}>
          {won
            ? 'You built the strongest Alhambra over three scoring rounds.'
            : 'A rival architect claimed the majorities.'}
        </p>
      </div>
    </Modal>
  )
}

function RulesModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal eyebrow="How to play" title="Alhambra" onClose={onClose}
      actions={<button className="btn-modal" onClick={onClose}>Start building</button>}>
      <div className="modal-body">
        <p>You and two rival architects compete to build the grandest <b>Alhambra</b>. Money comes in <b>four currencies</b> (green, blue, orange, yellow); each building tile is priced in <b>one specific currency</b>.</p>
        <p>On your turn do <b>one</b> action:</p>
        <p>• <b>Take money</b> — grab one money card from the market, or several cards whose values sum to <b>5 or less</b>.</p>
        <p>• <b>Buy a tile</b> — pay its cost with cards of the required currency. Overpaying is allowed but you get <b>no change</b>. Pay the <b>exact</b> amount and you earn an <b>extra turn</b>!</p>
        <p>Bought tiles are placed into your Alhambra next to the fountain or existing buildings. There are <b>six building types</b> (pavilion, seraglio, arcade, chambers, garden, tower).</p>
        <p>Scoring happens in <b>three rounds</b> as the money deck depletes. For each building type, the player with the <b>most</b> of that type scores (and 2nd place in later rounds), plus a bonus for the <b>longest connected wall</b>. Most points at the end wins.</p>
        <p>Your money hand is <b>private</b> — rivals only see how many cards you hold, never their values.</p>
        <p><b>Keys:</b> <kbd>N</kbd> new game · <kbd>?</kbd> rules · <kbd>Esc</kbd> clear / close.</p>
      </div>
    </Modal>
  )
}
