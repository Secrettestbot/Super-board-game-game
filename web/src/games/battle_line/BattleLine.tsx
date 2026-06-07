/* BATTLE LINE — UI (built for this codebase). Nine flagpoles march down the centre of the
   campaign map; you (lower) and the enemy (upper) build three-card formations on each side.
   Pick a troop from your hand, then click a flag to deploy it — then draw from the deck.
   When your side of a flag is complete (or provably decided), CLAIM it. Three adjacent flags
   or five total breaks the line.

   Online-capable: useGameSession drives solo (you = seat 0 vs AI) and online (host = seat 0,
   guest = seat 1) through one path. Everything below is rendered RELATIVE to `mySeat` — your
   hand is s.hands[mySeat], your formations are the flag side for mySeat, the opponent's are
   the other side — so a guest sitting in seat 1 sees their own army at the bottom. */

import { useState } from 'react'
import { GameShell } from '../../framework/GameShell'
import { Modal } from '../../framework/Modal'
import { useGameKeys } from '../../framework/useGameKeys'
import { OnlineBar } from '../../framework/OnlineBar'
import { useGameSession } from '../../net/useGameSession'
import { battleLineAdapter } from './net'
import * as BL from './logic'
import type { Card, Seat, Flag } from './logic'

const COLNAME = BL.COLNAME

const TITLE_MARK = (
  <svg className="title-mark" viewBox="0 0 48 48" aria-hidden="true">
    <rect x="3" y="3" width="42" height="42" rx="9" fill="#2a1d18" stroke="#5a3a2a" strokeWidth="1.5" />
    <path d="M14 8 V40" stroke="#d8a24a" strokeWidth="2.2" strokeLinecap="round" />
    <path d="M14 9 L33 13 L26 18 L33 23 L14 23 Z" fill="#e05b4f" stroke="#8c2e26" strokeWidth="1" strokeLinejoin="round" />
    <circle cx="14" cy="7" r="2.2" fill="#f1c873" />
  </svg>
)

function rankLabel(cards: Card[]): string {
  if (cards.length < 3) return ''
  const cat = BL.formationCategory(cards)
  return BL.CATEGORY_NAME[cat]
}

export function BattleLine() {
  const { state: s, mySeat, isMyTurn, dispatch, newGame: netNew, net } = useGameSession(battleLineAdapter)
  const me = mySeat as Seat
  const foe: Seat = me === 0 ? 1 : 0
  const [showRules, setShowRules] = useState(false)
  const [sel, setSel] = useState<number | null>(null)

  function newGame() { netNew(); setSel(null); setShowRules(false) }

  useGameKeys({ onNew: newGame, onToggleRules: () => setShowRules(v => !v), onEscape: () => { setSel(null); setShowRules(false) } })

  const yourTurn = s.winner == null && isMyTurn
  const yourPlay = yourTurn && s.phase === 'play'
  const yourDraw = yourTurn && s.phase === 'draw'

  const myHand = s.hands[me]
  const selCard = sel != null ? myHand.find(c => c.id === sel) ?? null : null
  const legalFlags = yourPlay ? BL.legalPlays(s, me) : []
  const canPlaceSel = yourPlay && selCard != null

  function pick(id: number) { if (yourPlay) setSel(prev => (prev === id ? null : id)) }
  function deploy(flagIndex: number) {
    if (yourPlay && selCard != null && legalFlags.includes(flagIndex)) {
      dispatch({ kind: 'play', cardId: selCard.id, flag: flagIndex })
      setSel(null)
    }
  }
  function doDraw() { if (yourDraw || noLegalPlay) dispatch({ kind: 'draw', deck: 'troop' }) }
  function doClaim(flagIndex: number) {
    if (s.winner == null && yourTurn && BL.canClaim(s, flagIndex, me)) dispatch({ kind: 'claim', flag: flagIndex })
  }

  // If you have no legal play on your play phase (every open flag-side is full), allow a forced draw.
  const noLegalPlay = yourPlay && legalFlags.length === 0

  const myFlags = BL.flagCount(s, me)
  const foeFlags = BL.flagCount(s, foe)
  const claimableByYou = s.flags.map((_, i) => s.winner == null && yourTurn && BL.canClaim(s, i, me))

  const oppLabel = net.online ? 'Opponent' : 'enemy'
  const oppLabelCap = net.online ? 'Opponent' : 'The enemy'

  let banner: string, bk = ''
  if (s.winner === me) { bk = 'win'; banner = 'You broke the line — victory!' }
  else if (s.winner === foe) { bk = 'lose'; banner = `${oppLabelCap} broke through — you lose` }
  else if (yourPlay) { bk = 'you'; banner = sel != null ? 'Click a flag to deploy this troop' : 'Your turn — choose a troop from your hand' }
  else if (yourDraw) { bk = 'you'; banner = noLegalPlay ? 'No deployment possible — draw to pass' : 'Now draw a card to end your turn' }
  else { bk = 'foe'; banner = net.online ? 'Waiting for the opponent…' : 'The enemy is manoeuvring…' }

  return (
    <>
      <GameShell
        mark={TITLE_MARK}
        eyebrow="Battle Line · nine flags"
        title="Battle Line"
        subtitle="build three-card formations across nine flags — take three in a row, or five in all, to break the enemy line"
        onRules={() => setShowRules(true)}
        onNew={newGame}
        modeLeft={`${s.deck.length} in deck`}
        banner={banner}
        bannerClass={bk}
        modeRight={<>N · new &nbsp; ? · rules</>}
      >
        <div className="bl-field">
          <div className="bl-line">
            {s.flags.map((flag, i) => (
              <FlagColumn
                key={i}
                index={i}
                flag={flag}
                me={me}
                foe={foe}
                live={canPlaceSel && legalFlags.includes(i)}
                claimableYou={claimableByYou[i]}
                onDeploy={() => deploy(i)}
                onClaim={() => doClaim(i)}
              />
            ))}
          </div>

          {/* Your hand */}
          <div className="bl-hand">
            {myHand
              .slice()
              .sort((a, b) => BL.COLOURS.indexOf(a.colour) - BL.COLOURS.indexOf(b.colour) || a.value - b.value)
              .map(c => (
                <button
                  key={c.id}
                  className={'bl-hand-card c-' + c.colour + (sel === c.id ? ' sel' : '')}
                  onClick={() => pick(c.id)}
                  disabled={!yourPlay}
                  title={COLNAME[c.colour] + ' ' + c.value}
                >
                  <span className="bl-hand-c">{c.colour}</span>
                  <span className="bl-hand-v">{c.value}</span>
                  <span className="bl-hand-pip" />
                </button>
              ))}
          </div>

          {/* Action bar */}
          <div className="bl-actions">
            <button
              className="bl-btn primary"
              disabled={!yourDraw && !noLegalPlay}
              onClick={doDraw}
            >
              Draw
            </button>
            <span className="bl-hint">
              {yourPlay
                ? (sel == null ? 'Select a troop, then click a flag to deploy it — or claim a decided flag.' : 'Click a highlighted flag to deploy it.')
                : yourDraw ? 'Draw a card to finish your turn.'
                : net.online ? 'The opponent is taking their turn.'
                : 'The enemy is taking its turn.'}
            </span>
          </div>
        </div>

        <div className="side">
          <div className="panel">
            <OnlineBar net={net} />
          </div>
          <div className="panel bl-scoreboard">
            <ScoreRow name="You" flags={myFlags} on={yourTurn} you />
            <ScoreRow name={net.online ? 'Opponent' : 'Enemy'} flags={foeFlags} on={s.turn === foe && s.winner == null} />
            <div className="bl-deckline"><span>Deck</span><span>{s.deck.length} cards</span></div>
          </div>
          <div className="panel logbox">
            {s.log.slice().reverse().map((l, i) => <div key={i} className={'log-line ' + l.t}>{l.x}</div>)}
          </div>
        </div>
      </GameShell>

      {s.winner != null && <ResultModal won={s.winner === me} you={myFlags} foe={foeFlags} online={net.online} onNew={newGame} />}
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </>
  )
}

function PlacedCard({ card }: { card: Card }) {
  return (
    <div className={'bl-card c-' + card.colour}>
      <span className="pip" />
      <span>{card.value}</span>
    </div>
  )
}

function Side({ cards, foe }: { cards: Card[]; foe?: boolean }) {
  const slots: (Card | null)[] = [cards[0] ?? null, cards[1] ?? null, cards[2] ?? null]
  return (
    <div className={'bl-side' + (foe ? ' foe' : '')}>
      {slots.map((c, i) => (
        <div key={i} className={'bl-slot' + (c ? '' : ' empty')}>
          {c ? <PlacedCard card={c} /> : null}
        </div>
      ))}
    </div>
  )
}

function FlagColumn({ index, flag, me, foe, live, claimableYou, onDeploy, onClaim }:
  { index: number; flag: Flag; me: Seat; foe: Seat; live: boolean; claimableYou: boolean; onDeploy: () => void; onClaim: () => void }) {
  // Seat-relative: your formation is the side belonging to `me`; the opponent's is `foe`.
  const mySide = me === 0 ? flag.you : flag.foe
  const foeSide = foe === 0 ? flag.you : flag.foe
  const claimed = flag.claimedBy
  const claimedByMe = claimed === me
  const claimedByFoe = claimed === foe

  let cls = 'bl-flag'
  if (live) cls += ' live'
  if (claimedByMe) cls += ' claim-you'
  else if (claimedByFoe) cls += ' claim-foe'

  let bannerCls = 'bl-banner'
  let bannerText = String(index + 1)
  if (claimedByMe) { bannerCls += ' you'; bannerText = '★' }
  else if (claimedByFoe) { bannerCls += ' foe'; bannerText = '★' }
  else if (claimableYou) { bannerCls += ' you claimable' }

  return (
    <div className={cls} onClick={live ? onDeploy : undefined}>
      {/* opponent side on top */}
      <Side cards={foeSide} foe />
      <div className="bl-rank">{claimedByFoe ? '' : rankLabel(foeSide)}</div>

      <div className="bl-pole">
        <button
          className={bannerCls}
          onClick={(e) => { e.stopPropagation(); if (claimableYou) onClaim() }}
          disabled={claimed != null || !claimableYou}
          title={claimableYou ? 'Claim this flag' : claimed != null ? 'Claimed' : 'Flag ' + (index + 1)}
        >
          {bannerText}
        </button>
      </div>

      <div className="bl-rank">{claimedByMe ? '' : rankLabel(mySide)}</div>
      {/* your side on bottom */}
      <Side cards={mySide} />
    </div>
  )
}

function ScoreRow({ name, flags, on, you }: { name: string; flags: number; on: boolean; you?: boolean }) {
  return (
    <div className={'bl-sc' + (on ? ' on' : '') + (you ? ' you' : ' foe')}>
      <span className="bl-sc-name">{name}</span>
      <span className="bl-sc-flags">
        <span className="bl-sc-n">{flags}</span>
        <span className="bl-sc-l">flags</span>
      </span>
    </div>
  )
}

function ResultModal({ won, you, foe, online, onNew }: { won: boolean; you: number; foe: number; online: boolean; onNew: () => void }) {
  const oppName = online ? 'Opponent' : 'Enemy'
  return (
    <Modal
      eyebrow={won ? 'The line is broken' : 'The line has held against you'}
      title={won ? 'You Win' : `${oppName} Wins`}
      closeOnOverlay={false}
      actions={<button className="btn-modal" onClick={onNew}>Play again</button>}
    >
      <div className="bl-final"><span className="you">You {you}</span><span className="foe">{oppName} {foe}</span></div>
    </Modal>
  )
}

function RulesModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal eyebrow="How to play" title="Battle Line" onClose={onClose}
      actions={<button className="btn-modal" onClick={onClose}>To arms</button>}>
      <div className="modal-body">
        <p>Nine flags stand between the two armies. Each turn, <b>deploy</b> one troop card to your side of any flag whose side isn't full (three cards per side — a <b>formation</b>), then <b>draw</b> a card.</p>
        <p>Formations rank, high to low: <b>Wedge</b> (three consecutive, same colour) · <b>Phalanx</b> (three of a value) · <b>Battalion</b> (three of a colour) · <b>Skirmish</b> (three consecutive) · <b>Host</b> (anything else — compare sums). Ties break by sum, then by who completed first.</p>
        <p>A flag is <b>claimed</b> automatically once your side is complete and either both sides are full or the foe provably can't beat you with the cards still unseen.</p>
        <p>Take <b>three adjacent flags</b> — a breakthrough — or <b>five flags total</b> to win.</p>
        <p><b>Keys:</b> <kbd>N</kbd> new game · <kbd>?</kbd> rules · <kbd>Esc</kbd> deselect / close.</p>
      </div>
    </Modal>
  )
}
