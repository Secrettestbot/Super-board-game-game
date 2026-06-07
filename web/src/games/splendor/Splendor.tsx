/* SPLENDOR — UI (built for this codebase).
   Gem engine-building on the framework shell. Take tokens, buy development cards (owned
   bonuses discount future costs, gold is wild), attract nobles, and race to 15 prestige.
   Solo, the empty seat is a greedy AI; online (useGameSession) a remote guest fills it.
   Everything is seat-relative: "you" is mySeat, the other seat is the opponent. The hook
   drives the AI for empty seats and re-arms on tickKey.
*/

import { useEffect, useRef, useState } from 'react'
import { GameShell } from '../../framework/GameShell'
import { Modal } from '../../framework/Modal'
import { OnlineBar } from '../../framework/OnlineBar'
import { useGameKeys } from '../../framework/useGameKeys'
import { useGameSession } from '../../net/useGameSession'
import { splendorAdapter } from './net'
import * as SP from './logic'
import type { Card, Noble, Gem, Tok, PlayerState } from './logic'

const TITLE_MARK = (
  <svg className="title-mark" viewBox="0 0 48 48" aria-hidden="true">
    <rect x="3" y="3" width="42" height="42" rx="10" fill="#1d1930" stroke="#443c66" strokeWidth="1.5" />
    <path d="M24 9 L33 19 L24 38 L15 19 Z" fill="#4a86ff" stroke="#9fc0ff" strokeWidth="1" />
    <path d="M24 9 L33 19 L24 22 L15 19 Z" fill="#7aa6ff" />
    <path d="M15 19 L24 22 L24 38 Z" fill="#3a6ad8" />
    <circle cx="13" cy="34" r="3.2" fill="#2fbf71" />
    <circle cx="35" cy="34" r="3.2" fill="#f04668" />
    <circle cx="35" cy="13" r="2.6" fill="#e9c46a" />
  </svg>
)

const GEM_LABEL: Record<Gem, string> = {
  emerald: 'Emerald', sapphire: 'Sapphire', ruby: 'Ruby', diamond: 'Diamond', onyx: 'Onyx',
}
const GEM_INIT: Record<Tok, string> = {
  emerald: 'E', sapphire: 'S', ruby: 'R', diamond: 'D', onyx: 'O', gold: '★',
}
const gemClass = (t: Tok) => 'gem-' + t

export function Splendor() {
  const { state: s, mySeat, isMyTurn, dispatch, newGame: netNew, net } = useGameSession(splendorAdapter)
  const [showRules, setShowRules] = useState(false)
  // Currently selected gem colors for a "take" action (your seat only).
  const [picks, setPicks] = useState<Gem[]>([])
  const logRef = useRef<HTMLDivElement>(null)

  function newGame() { netNew(); setPicks([]); setShowRules(false) }

  const yourTurn = s.winner == null && isMyTurn

  // The hook drives the AI for any empty seat and re-arms on tickKey — no useAITurn here.
  useEffect(() => { if (!yourTurn) setPicks([]) }, [yourTurn, s.step])

  useGameKeys({
    onNew: newGame,
    onToggleRules: () => setShowRules((v) => !v),
    onEscape: () => { setShowRules(false); setPicks([]) },
  })

  const oppSeat = mySeat === 0 ? 1 : 0
  const me = s.players[mySeat]
  const opp = s.players[oppSeat]
  const oppLabel = net.online ? 'Opponent' : 'AI'

  // ---- pick logic for taking tokens ----
  function togglePick(g: Gem) {
    if (!yourTurn) return
    setPicks((cur) => {
      if (cur.includes(g)) return cur.filter((x) => x !== g)
      if (cur.length >= 3) return cur
      if (s.bank[g] < 1) return cur
      return cur.concat([g])
    })
  }

  function doTake3() {
    if (!yourTurn || picks.length < 1) return
    if (!SP.canTake3(s, picks)) return
    dispatch({ kind: 'take', gems: picks })
    setPicks([])
  }
  function doTake2() {
    if (!yourTurn || picks.length !== 1) return
    const g = picks[0]
    if (!SP.canTake2(s, g)) return
    dispatch({ kind: 'take', gems: [g, g] })
    setPicks([])
  }
  function doBuy(id: string) {
    if (!yourTurn) return
    dispatch({ kind: 'buy', cardId: id })
    setPicks([])
  }
  function doReserveVisible(id: string) {
    if (!yourTurn) return
    dispatch({ kind: 'reserve', cardId: id })
    setPicks([])
  }
  function doReserveDeck(tier: 1 | 2 | 3) {
    if (!yourTurn) return
    dispatch({ kind: 'reserve', deckLevel: tier })
    setPicks([])
  }

  // ---- banner (relative to your seat) ----
  let banner: string, bk = ''
  if (s.winner === mySeat) { bk = 'win'; banner = `You win — ${me.prestige} prestige!` }
  else if (s.winner === oppSeat) { bk = 'lose'; banner = `${oppLabel} wins with ${opp.prestige} prestige` }
  else if (yourTurn) {
    bk = 'you'
    if (picks.length) banner = `Take selected — ${picks.length} chosen`
    else banner = s.finalRound ? 'Final round — your move' : 'Your turn — gather or buy'
  } else { bk = 'foe'; banner = net.online ? 'Waiting for opponent…' : 'The AI is plotting…' }

  const can2 = picks.length === 1 && SP.canTake2(s, picks[0])
  const can3 = picks.length >= 1 && SP.canTake3(s, picks)
  const reservedFull = me.reserved.length >= SP.MAX_RESERVED

  return (
    <>
      <GameShell
        mark={TITLE_MARK}
        eyebrow="Splendor · gem engine"
        title="Splendor"
        subtitle="acquire gems, develop your trade, and attract nobles — first merchant to 15 prestige wins"
        onRules={() => setShowRules(true)}
        onNew={newGame}
        modeLeft={`You ${me.prestige} · ${oppLabel} ${opp.prestige} — to ${SP.WIN_PRESTIGE}`}
        banner={banner}
        bannerClass={bk}
        modeRight={<>click gems · buy / reserve cards &nbsp; N · new</>}
      >
        <div className="sp-main">
          {/* Nobles */}
          <div>
            <div className="sp-section-l">Nobles · auto-visit at requirement</div>
            <div className="sp-nobles">
              {s.nobles.length === 0 && <div className="sp-control-hint">all nobles have been claimed</div>}
              {s.nobles.map((n) => <NobleTile key={n.id} n={n} />)}
            </div>
          </div>

          {/* Tiers */}
          <div className="sp-tiers">
            {([3, 2, 1] as const).map((tierNum) => {
              const t = tierNum - 1
              const deckLeft = s.decks[t].length
              return (
                <div className="sp-tier" key={tierNum}>
                  <div
                    className={'sp-tier-deck' + (yourTurn && deckLeft > 0 && !reservedFull ? ' can' : '')}
                    onClick={yourTurn && deckLeft > 0 && !reservedFull ? () => doReserveDeck(tierNum) : undefined}
                    title={yourTurn && deckLeft > 0 && !reservedFull ? 'Reserve a blind card from this deck (+1 gold)' : undefined}
                  >
                    <span className="tnum">{tierNum}</span>
                    <span className="tcount">{deckLeft} left</span>
                  </div>
                  <div className="sp-row">
                    {s.visible[t].map((card, i) => (
                      <CardView
                        key={card ? card.id : 't' + t + 'e' + i}
                        card={card}
                        me={me}
                        yourTurn={yourTurn}
                        reservedFull={reservedFull}
                        onBuy={doBuy}
                        onReserve={doReserveVisible}
                      />
                    ))}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Bank + take controls */}
          <div>
            <div className="sp-section-l">Token bank · click to select, then take</div>
            <div className="sp-bank">
              {SP.TOKS.map((tk) => {
                const n = s.bank[tk]
                const isGem = tk !== 'gold'
                const chosen = isGem && picks.includes(tk as Gem)
                const pickable = yourTurn && isGem && n > 0
                return (
                  <div className="sp-bank-tok" key={tk}>
                    <div
                      className={
                        'sp-coin ' + gemClass(tk) +
                        (pickable ? ' pick' : isGem ? ' disabled' : '') +
                        (chosen ? ' chosen' : '') +
                        (n === 0 ? ' empty' : '')
                      }
                      onClick={pickable ? () => togglePick(tk as Gem) : undefined}
                      title={tk === 'gold' ? 'Gold (wild) — gained only by reserving' : GEM_LABEL[tk as Gem]}
                    >
                      {n}
                    </div>
                    <span className="sp-bank-lbl">{tk === 'gold' ? 'gold' : GEM_LABEL[tk as Gem]}</span>
                  </div>
                )
              })}
            </div>

            <div className="sp-controls" style={{ marginTop: 10 }}>
              <div className="sp-btns">
                <button className="sp-btn" disabled={!can3} onClick={doTake3}>
                  Take {picks.length || '—'} different
                </button>
                <button className="sp-btn ghost" disabled={!can2} onClick={doTake2}>
                  Take 2 same
                </button>
                {picks.length > 0 && (
                  <button className="sp-btn ghost" onClick={() => setPicks([])}>Clear</button>
                )}
              </div>
              <div className="sp-control-hint">
                {yourTurn
                  ? 'Pick up to 3 different gems, OR one gem (with ≥4 in bank) to take 2. Buy or reserve a card from the rows above. Reserving grants a gold.'
                  : net.online ? 'Waiting for the opponent…' : 'Waiting for the AI…'}
              </div>
            </div>
          </div>
        </div>

        {/* Side: online lobby + tableaus + log */}
        <div className="side">
          <div className="panel"><OnlineBar net={net} /></div>
          <Tableau
            label="You" who="you" p={me} active={yourTurn}
            yourTurn={yourTurn} onBuyReserved={doBuy}
          />
          <Tableau
            label={oppLabel} who="ai" p={opp} active={s.winner == null && s.turn === oppSeat}
            yourTurn={false} onBuyReserved={() => {}}
          />
          <div className="panel logbox" ref={logRef}>
            {s.log.slice().reverse().map((l, i) => (
              <div key={i} className={'log-line ' + l.t}>{l.x}</div>
            ))}
          </div>
        </div>
      </GameShell>

      {s.winner != null && <ResultModal won={s.winner === mySeat} you={me} opp={opp} oppLabel={oppLabel} onNew={newGame} />}
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </>
  )
}

// ---------------------------------------------------------------------------

function NobleTile({ n }: { n: Noble }) {
  return (
    <div className="sp-noble">
      <span className="sp-noble-pts">{n.points}</span>
      <div className="sp-noble-reqs">
        {SP.GEMS.map((g) => {
          const r = n.req[g] ?? 0
          if (!r) return null
          return (
            <span className="sp-req" key={g}>
              <span className={'sp-dot ' + gemClass(g)} />{r}
            </span>
          )
        })}
      </div>
    </div>
  )
}

function CardView({
  card, me, yourTurn, reservedFull, onBuy, onReserve,
}: {
  card: Card | null
  me: PlayerState
  yourTurn: boolean
  reservedFull: boolean
  onBuy: (id: string) => void
  onReserve: (id: string) => void
}) {
  if (!card) return <div className="sp-card empty" />
  const affordable = SP.canAfford(me, card)
  const canBuy = yourTurn && affordable
  const canReserve = yourTurn && !reservedFull
  return (
    <div className={'sp-card' + (affordable ? ' afford' : '')}>
      <div className="sp-card-top">
        <span className={'sp-card-pts' + (card.points === 0 ? ' zero' : '')}>{card.points || ''}</span>
        <span className={'sp-card-bonus ' + gemClass(card.bonus)} title={GEM_LABEL[card.bonus] + ' bonus'} />
      </div>
      <div className="sp-card-cost">
        <div className="sp-cost-row">
          {SP.GEMS.map((g) => {
            const c = card.cost[g] ?? 0
            if (!c) return null
            return <span key={g} className={'sp-cost-pill ' + gemClass(g)}>{c}</span>
          })}
        </div>
      </div>
      <div className="sp-card-actions">
        <button className="sp-mini-btn buy" disabled={!canBuy} onClick={canBuy ? () => onBuy(card.id) : undefined}>Buy</button>
        <button className="sp-mini-btn" disabled={!canReserve} onClick={canReserve ? () => onReserve(card.id) : undefined}>Hold</button>
      </div>
    </div>
  )
}

function Tableau({
  label, who, p, active, yourTurn, onBuyReserved,
}: {
  label: string
  who: 'you' | 'ai'
  p: PlayerState
  active: boolean
  yourTurn: boolean
  onBuyReserved: (id: string) => void
}) {
  let tokenTotal = 0
  for (const k of SP.TOKS) tokenTotal += p.tokens[k]
  return (
    <div className={'panel sp-tableau' + (active ? ' on' : '')}>
      <div className="sp-tab-head">
        <span className={'sp-pawn ' + who} />
        <span className="sp-tab-name">{label}</span>
        <span className="sp-tab-prestige">{p.prestige}<small> pts</small></span>
      </div>

      <div className="sp-tab-gems">
        {SP.GEMS.map((g) => (
          <span className="sp-tab-gem" key={g} title={GEM_LABEL[g]}>
            <span className={'sp-swatch ' + gemClass(g)} />
            <span className="sp-bcount">{p.bonuses[g]}</span>
            <span className="sep">·</span>
            <span className="sp-tcount">{p.tokens[g]}</span>
          </span>
        ))}
        <span className="sp-tab-gem" title="Gold (wild)">
          <span className="sp-swatch gem-gold" />
          <span className="sp-tcount">{p.tokens.gold}</span>
        </span>
      </div>

      <div className="sp-tab-meta">
        <span>tokens <b>{tokenTotal}</b>/{SP.TOKEN_LIMIT}</span>
        <span>cards <b>{p.bought.length}</b></span>
        <span>nobles <b>{p.nobles.length}</b></span>
      </div>

      {p.reserved.length > 0 && (
        <div>
          <div className="sp-section-l" style={{ marginBottom: 5 }}>Reserved ({p.reserved.length}/{SP.MAX_RESERVED})</div>
          <div className="sp-reserved">
            {p.reserved.map((card) => {
              const buyable = yourTurn && SP.canAfford(p, card)
              return (
                <span
                  key={card.id}
                  className={'sp-res-chip' + (buyable ? ' buyable' : '')}
                  onClick={buyable ? () => onBuyReserved(card.id) : undefined}
                  title={buyable ? 'Buy this reserved card' : 'Reserved'}
                >
                  <span className={'sp-swatch ' + gemClass(card.bonus)} />
                  T{card.tier}{card.points ? ` ·${card.points}` : ''}
                </span>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

function ResultModal({ won, you, opp, oppLabel, onNew }: { won: boolean; you: PlayerState; opp: PlayerState; oppLabel: string; onNew: () => void }) {
  return (
    <Modal
      eyebrow={won ? 'Merchant prince' : 'Outmaneuvered'}
      title={won ? 'You Win' : `${oppLabel} Wins`}
      closeOnOverlay={false}
      actions={<button className="btn-modal" onClick={onNew}>Play again</button>}
    >
      <div className="modal-body">
        <p style={{ textAlign: 'center', fontSize: 15 }}>
          <span className="sp-tab-prestige" style={{ color: won ? 'var(--you)' : 'var(--ink-2)' }}>You {you.prestige}</span>
          {'   ·   '}
          <span className="sp-tab-prestige" style={{ color: won ? 'var(--ink-2)' : 'var(--foe)' }}>{oppLabel} {opp.prestige}</span>
        </p>
        <p style={{ textAlign: 'center' }}>
          {you.prestige === opp.prestige
            ? 'Prestige tied — won on fewer cards.'
            : won ? 'You reached the most prestige.' : `${oppLabel} built the stronger engine.`}
        </p>
      </div>
    </Modal>
  )
}

function RulesModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal eyebrow="How to play" title="Splendor" onClose={onClose}
      actions={<button className="btn-modal" onClick={onClose}>Begin trading</button>}>
      <div className="modal-body">
        <p>Build a gem-trading engine and reach <b>15 prestige</b> before the AI. On your turn do <b>one</b> action:</p>
        <p>• <b>Take 3</b> tokens of different colors, or <b>take 2</b> of one color (only if that pile has ≥4).</p>
        <p>• <b>Reserve</b> a face-up card, or a blind top-deck card via the tier deck — you gain <b>1 gold</b> (wild) and may hold up to 3 reserved.</p>
        <p>• <b>Buy</b> a face-up or reserved card by paying its cost. Your owned card <b>bonuses</b> permanently discount that color, and <b>gold</b> substitutes for any missing gem.</p>
        <p>Bought cards grant a permanent gem bonus and prestige. <b>Nobles</b> visit automatically (+3) once your bonuses meet their requirement. You may hold at most <b>10 tokens</b> — extras are returned at end of turn.</p>
        <p>Reaching <b>15 prestige</b> triggers a final round so both players take equal turns; highest prestige wins (tie → fewest cards).</p>
        <p><b>Keys:</b> <kbd>N</kbd> new game · <kbd>?</kbd> rules · <kbd>Esc</kbd> clear / close.</p>
      </div>
    </Modal>
  )
}
