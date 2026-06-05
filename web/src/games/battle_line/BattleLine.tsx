/* BATTLE LINE — UI (built for this codebase). Nine flagpoles march down the centre of the
   campaign map; you (lower) and the enemy AI (upper) build three-card formations on each side.
   Pick a troop from your hand, then click a flag to deploy it — then the deck draws for you.
   When your side of a flag is complete (or provably decided), CLAIM it. Three adjacent flags or
   five total breaks the line. */

import { useState } from 'react'
import { GameShell } from '../../framework/GameShell'
import { Modal } from '../../framework/Modal'
import { useAITurn } from '../../framework/useAITurn'
import { useGameKeys } from '../../framework/useGameKeys'
import * as BL from './logic'
import type { BattleLineState, Card, Seat, Flag } from './logic'

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
  const [s, setS] = useState<BattleLineState>(() => BL.makeGame())
  const [showRules, setShowRules] = useState(false)
  const [sel, setSel] = useState<number | null>(null)

  function newGame() { setS(BL.makeGame()); setSel(null); setShowRules(false) }

  // AI drives across many actions (play→draw, claims). tick changes on every AI action, so the
  // timer re-arms each step rather than stalling. active = AI's turn AND no winner.
  useAITurn(s.winner == null && s.turn === 1, () => setS(p => BL.aiTurn(p)), { delayMs: 560, tick: s.tick })
  useGameKeys({ onNew: newGame, onToggleRules: () => setShowRules(v => !v), onEscape: () => { setSel(null); setShowRules(false) } })

  const yourTurn = s.winner == null && s.turn === 0
  const yourPlay = yourTurn && s.phase === 'play'
  const yourDraw = yourTurn && s.phase === 'draw'

  const selCard = sel != null ? s.hands[0].find(c => c.id === sel) ?? null : null
  const legalFlags = yourPlay ? BL.legalPlays(s, 0) : []
  const canPlaceSel = yourPlay && selCard != null

  function pick(id: number) { if (yourPlay) setSel(prev => (prev === id ? null : id)) }
  function deploy(flagIndex: number) {
    if (yourPlay && selCard != null && legalFlags.includes(flagIndex)) {
      setS(BL.playCard(s, 0, selCard, flagIndex))
      setSel(null)
    }
  }
  function doDraw() { if (yourDraw) setS(BL.drawCard(s, 0)) }
  function doClaim(flagIndex: number) {
    if (s.winner == null && BL.canClaim(s, flagIndex, 0)) setS(BL.claimFlag(s, flagIndex, 0))
  }

  // If you have no legal play on your play phase (every open flag-side is full), allow a forced draw.
  const noLegalPlay = yourPlay && legalFlags.length === 0

  const youFlags = BL.flagCount(s, 0)
  const foeFlags = BL.flagCount(s, 1)
  const claimableByYou = s.flags.map((_, i) => s.winner == null && BL.canClaim(s, i, 0))

  let banner: string, bk = ''
  if (s.winner === 0) { bk = 'win'; banner = 'You broke the line — victory!' }
  else if (s.winner === 1) { bk = 'lose'; banner = 'The enemy broke through — you lose' }
  else if (yourPlay) { bk = 'you'; banner = sel != null ? 'Click a flag to deploy this troop' : 'Your turn — choose a troop from your hand' }
  else if (yourDraw) { bk = 'you'; banner = noLegalPlay ? 'No deployment possible — draw to pass' : 'Now draw a card to end your turn' }
  else { bk = 'foe'; banner = 'The enemy is manoeuvring…' }

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
                live={canPlaceSel && legalFlags.includes(i)}
                claimableYou={claimableByYou[i]}
                onDeploy={() => deploy(i)}
                onClaim={() => doClaim(i)}
              />
            ))}
          </div>

          {/* Your hand */}
          <div className="bl-hand">
            {s.hands[0]
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
                ? (sel == null ? 'Select a troop, then click a flag to deploy it.' : 'Click a highlighted flag to deploy — or claim a decided flag.')
                : yourDraw ? 'Draw a card to finish your turn.'
                : 'The enemy is taking its turn.'}
            </span>
          </div>
        </div>

        <div className="side">
          <div className="panel bl-scoreboard">
            <ScoreRow name="You" flags={youFlags} on={s.turn === 0 && s.winner == null} you />
            <ScoreRow name="Enemy" flags={foeFlags} on={s.turn === 1 && s.winner == null} />
            <div className="bl-deckline"><span>Deck</span><span>{s.deck.length} cards</span></div>
          </div>
          <div className="panel logbox">
            {s.log.slice().reverse().map((l, i) => <div key={i} className={'log-line ' + l.t}>{l.x}</div>)}
          </div>
        </div>
      </GameShell>

      {s.winner != null && <ResultModal s={s} you={youFlags} foe={foeFlags} onNew={newGame} />}
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

function FlagColumn({ index, flag, live, claimableYou, onDeploy, onClaim }:
  { index: number; flag: Flag; live: boolean; claimableYou: boolean; onDeploy: () => void; onClaim: () => void }) {
  const claimed = flag.claimedBy
  let cls = 'bl-flag'
  if (live) cls += ' live'
  if (claimed === 0) cls += ' claim-you'
  else if (claimed === 1) cls += ' claim-foe'

  let bannerCls = 'bl-banner'
  let bannerText = String(index + 1)
  if (claimed === 0) { bannerCls += ' you'; bannerText = '★' }
  else if (claimed === 1) { bannerCls += ' foe'; bannerText = '★' }
  else if (claimableYou) { bannerCls += ' you claimable' }

  return (
    <div className={cls} onClick={live ? onDeploy : undefined}>
      {/* enemy side on top */}
      <Side cards={flag.foe} foe />
      <div className="bl-rank">{claimed === 1 ? '' : rankLabel(flag.foe)}</div>

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

      <div className="bl-rank">{claimed === 0 ? '' : rankLabel(flag.you)}</div>
      {/* your side on bottom */}
      <Side cards={flag.you} />
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

function ResultModal({ s, you, foe, onNew }: { s: BattleLineState; you: number; foe: number; onNew: () => void }) {
  const won = s.winner === 0
  return (
    <Modal
      eyebrow={won ? 'The line is broken' : 'The line has held against you'}
      title={won ? 'You Win' : 'Enemy Wins'}
      closeOnOverlay={false}
      actions={<button className="btn-modal" onClick={onNew}>Play again</button>}
    >
      <div className="bl-final"><span className="you">You {you}</span><span className="foe">Enemy {foe}</span></div>
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
        <p><b>Claim</b> a flag once your side is complete and either both sides are full or the enemy provably can't beat you with the cards still unseen.</p>
        <p>Take <b>three adjacent flags</b> — a breakthrough — or <b>five flags total</b> to win.</p>
        <p><b>Keys:</b> <kbd>N</kbd> new game · <kbd>?</kbd> rules · <kbd>Esc</kbd> deselect / close.</p>
      </div>
    </Modal>
  )
}
