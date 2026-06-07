/* SEVEN WONDERS DUEL — UI (built for this codebase).
   Draft cards from a three-age pyramid against a greedy AI (solo) or a remote human
   (online) on the framework shell. Only accessible (uncovered) cards are highlighted;
   click one to choose BUILD / raise a WONDER / DISCARD. The shared military track sits
   between the tableaus, and a science strip warns when either side nears the six-symbol
   win. State + the AI driver live in useGameSession(sevenWondersDuelAdapter); everything
   is rendered seat-relative to mySeat, so a guest on seat 1 sees "their" tableau, wonders
   and military lead correctly. Solo play is unchanged (mySeat = 0). UI shows the end state.
*/

import { useState } from 'react'
import type { ReactNode } from 'react'
import { GameShell } from '../../framework/GameShell'
import { Modal } from '../../framework/Modal'
import { OnlineBar } from '../../framework/OnlineBar'
import { useGameKeys } from '../../framework/useGameKeys'
import { useGameSession } from '../../net/useGameSession'
import { sevenWondersDuelAdapter } from './net'
import * as G from './logic'
import type { SWDState, Card, PlayerState, Wonder, Resource, Color, Science } from './logic'

const TITLE_MARK = (
  <svg className="title-mark" viewBox="0 0 48 48" aria-hidden="true">
    <rect x="3" y="3" width="42" height="42" rx="10" fill="#241a10" stroke="#5a4426" strokeWidth="1.5" />
    <path d="M24 8 L40 40 L8 40 Z" fill="#d9a441" stroke="#f0cd7e" strokeWidth="1" />
    <path d="M24 8 L24 40 L8 40 Z" fill="#b9842c" />
    <path d="M16 24 L32 24" stroke="#241a10" strokeWidth="1.4" />
    <path d="M12 32 L36 32" stroke="#241a10" strokeWidth="1.4" />
    <circle cx="24" cy="8" r="2.4" fill="#f6e3a8" />
  </svg>
)

const RES_GLYPH: Record<Resource, string> = {
  wood: 'W', clay: 'C', stone: 'S', glass: 'G', papyrus: 'P',
}
const RES_LABEL: Record<Resource, string> = {
  wood: 'Wood', clay: 'Clay', stone: 'Stone', glass: 'Glass', papyrus: 'Papyrus',
}
const SCI_GLYPH: Record<Science, string> = {
  wheel: '☼', tablet: '▤', gear: '✦', compass: '◎', pen: '✎', mortar: '⚱',
}
const SCI_LABEL: Record<Science, string> = {
  wheel: 'Wheel', tablet: 'Tablet', gear: 'Gear', compass: 'Compass', pen: 'Pen', mortar: 'Mortar',
}
const COLOR_LABEL: Record<Color, string> = {
  brown: 'Resource', grey: 'Manufactured', blue: 'Civic', green: 'Science',
  yellow: 'Commerce', red: 'Military', purple: 'Guild',
}

export function SevenWondersDuel() {
  const { state: s, mySeat, isMyTurn, dispatch, newGame: netNew, net } = useGameSession(sevenWondersDuelAdapter)
  const [showRules, setShowRules] = useState(false)
  // Currently selected accessible card id (you pick an action for it).
  const [sel, setSel] = useState<string | null>(null)

  function newGame() { netNew(); setSel(null); setShowRules(false) }

  // Seat-relative: your seat vs the opponent seat (0/1). Military sign is fixed to the
  // logic's convention (positive = toward seat-0's win), so flip it for a seat-1 viewer.
  const oppSeat: 0 | 1 = (1 - mySeat) as 0 | 1
  const myMilSign = mySeat === 0 ? 1 : -1
  const oppName = net.online ? 'Opponent' : 'AI'

  const yourTurn = s.winner == null && isMyTurn

  useGameKeys({
    onNew: newGame,
    onToggleRules: () => setShowRules((v) => !v),
    onEscape: () => { setShowRules(false); setSel(null) },
  })

  const me = s.players[mySeat]
  const opp = s.players[oppSeat]

  const selCard: Card | null = sel != null && G.isAccessible(s, sel) ? s.cards[sel] : null

  function pick(id: string) {
    if (!yourTurn) return
    if (!G.isAccessible(s, id)) return
    setSel((cur) => (cur === id ? null : id))
  }
  function doBuild() {
    if (!yourTurn || !selCard) return
    if (!G.canAfford(s, mySeat as 0 | 1, selCard)) return
    dispatch({ kind: 'take', cardId: selCard.id }); setSel(null)
  }
  function doDiscard() {
    if (!yourTurn || !selCard) return
    dispatch({ kind: 'discard', cardId: selCard.id }); setSel(null)
  }
  function doWonder(wid: string) {
    if (!yourTurn || !selCard) return
    dispatch({ kind: 'wonder', cardId: selCard.id, wonderId: wid }); setSel(null)
  }

  // ---- banner (relative to mySeat) ----
  const myWin = s.winner === mySeat
  let banner: string, bk = ''
  if (s.winner === mySeat) {
    bk = 'win'
    banner = s.winBy === 'military' ? 'Military victory — capital seized!'
      : s.winBy === 'science' ? 'Science victory — all six symbols!'
      : `You win — ${G.scoreVP(s, mySeat as 0 | 1)} VP`
  } else if (s.winner === oppSeat) {
    bk = 'lose'
    banner = s.winBy === 'military' ? 'Your capital fell — military defeat'
      : s.winBy === 'science' ? `${oppName} mastered all six sciences`
      : `${oppName} wins — ${G.scoreVP(s, oppSeat)} VP`
  } else if (yourTurn) {
    bk = 'you'
    banner = selCard ? `${selCard.name} — choose an action` : 'Your turn — draft an accessible card'
  } else { bk = 'foe'; banner = `${oppName} is drafting…` }

  const ageLabel = s.age === 0 ? 'I' : s.age === 1 ? 'II' : 'III'

  return (
    <>
      <GameShell
        mark={TITLE_MARK}
        eyebrow="Seven Wonders Duel · drafting"
        title="Seven Wonders Duel"
        subtitle="draft a civilization across three ages — outscore, out-science, or conquer the capital"
        onRules={() => setShowRules(true)}
        onNew={newGame}
        modeLeft={`Age ${ageLabel} · You ${G.scoreVP(s, mySeat as 0 | 1)} VP · ${oppName} ${G.scoreVP(s, oppSeat)} VP`}
        banner={banner}
        bannerClass={bk}
        modeRight={<>click a lit card · build / wonder / discard &nbsp; N · new</>}
      >
        <div className="swd-main">
          <MilitaryTrack pos={s.military * myMilSign} />

          <div className="swd-pyramid-wrap">
            <div className="swd-section-l">Age {ageLabel} — accessible cards are lit</div>
            <Pyramid s={s} mySeat={mySeat as 0 | 1} sel={sel} yourTurn={yourTurn} onPick={pick} />
          </div>

          <ActionBar
            s={s} mySeat={mySeat as 0 | 1} selCard={selCard} me={me} yourTurn={yourTurn}
            onBuild={doBuild} onDiscard={doDiscard} onWonder={doWonder} onClear={() => setSel(null)}
          />
        </div>

        <div className="side">
          <div className="panel"><OnlineBar net={net} /></div>
          <Tableau label="You" who="you" p={me} mil={s.military * myMilSign} forYou active={yourTurn} />
          <Tableau label={oppName} who="ai" p={opp} mil={s.military * myMilSign} active={s.turn === oppSeat && s.winner == null} />
          <div className="panel swd-log">
            {s.log.slice().reverse().map((l, i) => (
              <div key={i} className={'log-line ' + l.t}>{l.x}</div>
            ))}
          </div>
        </div>
      </GameShell>

      {s.winner != null && <ResultModal s={s} mySeat={mySeat as 0 | 1} won={myWin} oppName={oppName} onNew={newGame} />}
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </>
  )
}

// ---------------------------------------------------------------------------
// Pyramid
// ---------------------------------------------------------------------------

function Pyramid({ s, mySeat, sel, yourTurn, onPick }: {
  s: SWDState; mySeat: 0 | 1; sel: string | null; yourTurn: boolean; onPick: (id: string) => void
}) {
  // Group slots by row for layout.
  const rows: number[][] = []
  for (let i = 0; i < s.pyramid.length; i++) {
    const r = s.pyramid[i].row
    if (!rows[r]) rows[r] = []
    rows[r].push(i)
  }
  return (
    <div className="swd-pyramid">
      {rows.map((slotIdxs, r) => (
        <div className="swd-prow" key={r}>
          {slotIdxs.map((idx) => {
            const sl = s.pyramid[idx]
            if (sl.cardId == null) return <div className="swd-slot empty" key={idx} />
            const card = s.cards[sl.cardId]
            const accessible = isSlotAccessible(s, idx)
            const selected = sel === sl.cardId
            const afford = G.canAfford(s, mySeat, card)
            return (
              <CardFace
                key={idx}
                card={card}
                faceUp={sl.faceUp}
                accessible={accessible}
                selectable={yourTurn && accessible}
                selected={selected}
                afford={afford}
                onClick={() => onPick(sl.cardId!)}
              />
            )
          })}
        </div>
      ))}
    </div>
  )
}

// Local accessibility check by slot index (logic exposes by card id via isAccessible).
function isSlotAccessible(s: SWDState, idx: number): boolean {
  const sl = s.pyramid[idx]
  if (!sl || sl.cardId == null) return false
  for (const c of sl.covers) {
    if (s.pyramid[c] && s.pyramid[c].cardId != null) return false
  }
  return true
}

function CardFace({ card, faceUp, accessible, selectable, selected, afford, onClick }: {
  card: Card; faceUp: boolean; accessible: boolean; selectable: boolean
  selected: boolean; afford: boolean; onClick: () => void
}) {
  if (!faceUp) {
    return <div className={'swd-slot swd-card facedown' + (accessible ? ' acc' : '')} title="Face-down card" />
  }
  return (
    <div
      className={
        'swd-slot swd-card color-' + card.color +
        (accessible ? ' acc' : ' locked') +
        (selectable ? ' sel-able' : '') +
        (selected ? ' selected' : '') +
        (selectable && afford ? ' afford' : '')
      }
      onClick={selectable ? onClick : undefined}
      title={card.name + ' · ' + COLOR_LABEL[card.color]}
    >
      <div className="swd-card-top">
        <span className="swd-card-name">{card.name}</span>
      </div>
      <div className="swd-card-mid">
        <CardEffect card={card} />
      </div>
      <div className="swd-card-cost">
        <CostPips card={card} />
      </div>
    </div>
  )
}

function CardEffect({ card }: { card: Card }) {
  const bits: ReactNode[] = []
  if (card.vp) bits.push(<span key="vp" className="swd-eff vp">{card.vp}▲</span>)
  if (card.produces) for (const r of G.RESOURCES) {
    const n = card.produces[r] ?? 0
    if (n) bits.push(<span key={'p' + r} className={'swd-eff res ' + r}>{n}{RES_GLYPH[r]}</span>)
  }
  if (card.science) bits.push(<span key="sci" className="swd-eff sci">{SCI_GLYPH[card.science]}</span>)
  if (card.coins) bits.push(<span key="co" className="swd-eff coin">{card.coins}¢</span>)
  if (card.military) bits.push(<span key="mil" className="swd-eff mil">{'⚔'.repeat(Math.min(card.military, 3))}</span>)
  if (card.guildPer) bits.push(<span key="g" className="swd-eff guild">guild</span>)
  return <div className="swd-eff-row">{bits}</div>
}

function CostPips({ card }: { card: Card }) {
  const pips: ReactNode[] = []
  for (const r of G.RESOURCES) {
    const n = card.cost[r] ?? 0
    for (let k = 0; k < n; k++) pips.push(<span key={r + k} className={'swd-cost-pip ' + r} title={RES_LABEL[r]}>{RES_GLYPH[r]}</span>)
  }
  if (card.coinCost) pips.push(<span key="cc" className="swd-cost-pip coin" title="Coin cost">{card.coinCost}¢</span>)
  if (pips.length === 0) pips.push(<span key="free" className="swd-cost-pip free">free</span>)
  return <div className="swd-cost-row">{pips}</div>
}

// ---------------------------------------------------------------------------
// Action bar
// ---------------------------------------------------------------------------

function ActionBar({ s, mySeat, selCard, me, yourTurn, onBuild, onDiscard, onWonder, onClear }: {
  s: SWDState; mySeat: 0 | 1; selCard: Card | null; me: PlayerState; yourTurn: boolean
  onBuild: () => void; onDiscard: () => void; onWonder: (wid: string) => void; onClear: () => void
}) {
  if (!yourTurn) {
    return <div className="swd-actionbar idle"><span className="swd-control-hint">Waiting for your opponent…</span></div>
  }
  if (!selCard) {
    return (
      <div className="swd-actionbar">
        <span className="swd-control-hint">Pick a lit (accessible) card from the pyramid to build it, raise a wonder, or discard it for coins.</span>
      </div>
    )
  }
  const cost = G.cardCoinCost(me, selCard)
  const canBuild = G.canAfford(s, mySeat, selCard)
  const discGain = G.DISCARD_BASE_COINS + me.cardsByColor.yellow
  const unbuiltWonders = me.wonders.filter((w) => !w.built)
  return (
    <div className="swd-actionbar active">
      <div className="swd-act-head">
        <span className={'swd-chip color-' + selCard.color}>{selCard.name}</span>
        <span className="swd-act-sub">{COLOR_LABEL[selCard.color]} · {cost > 0 ? `${cost}¢ to build` : 'free'}</span>
        <button className="swd-mini ghost" onClick={onClear}>Esc</button>
      </div>
      <div className="swd-act-btns">
        <button className="swd-btn" disabled={!canBuild} onClick={onBuild}>
          Build {cost > 0 ? `· ${cost}¢` : ''}
        </button>
        <button className="swd-btn ghost" onClick={onDiscard}>Discard · +{discGain}¢</button>
      </div>
      {unbuiltWonders.length > 0 && (
        <div className="swd-wonder-opts">
          <span className="swd-control-hint">Raise a wonder with this card:</span>
          <div className="swd-wonder-btns">
            {unbuiltWonders.map((w) => {
              const wc = G.coinsToCover(me, w.cost)
              const ok = G.canAffordWonder(s, mySeat, w)
              return (
                <button key={w.id} className="swd-wonder-btn" disabled={!ok} onClick={() => onWonder(w.id)}
                  title={wonderTitle(w)}>
                  {w.name}{wc > 0 ? ` · ${wc}¢` : ''}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

function wonderTitle(w: Wonder): string {
  const fx: string[] = []
  if (w.vp) fx.push(`+${w.vp} VP`)
  if (w.coins) fx.push(`+${w.coins}¢`)
  if (w.military) fx.push(`+${w.military}⚔`)
  return w.name + (fx.length ? ' — ' + fx.join(', ') : '')
}

// ---------------------------------------------------------------------------
// Military track
// ---------------------------------------------------------------------------

function MilitaryTrack({ pos }: { pos: number }) {
  const max = G.MILITARY_MAX
  const cells = []
  for (let i = -max; i <= max; i++) {
    const here = i === pos
    let cls = 'swd-mil-cell'
    if (i === -max) cls += ' cap foe'
    else if (i === max) cls += ' cap you'
    else if (i === 0) cls += ' center'
    if (here) cls += ' pawn'
    cells.push(
      <div className={cls} key={i} title={i === 0 ? 'Center' : i === max ? 'AI capital' : i === -max ? 'Your capital' : ''}>
        {i === -max ? '⌂' : i === max ? '⌂' : here ? '◆' : ''}
      </div>
    )
  }
  return (
    <div className="swd-military">
      <span className="swd-mil-label foe">AI capital</span>
      <div className="swd-mil-track">{cells}</div>
      <span className="swd-mil-label you">Your capital</span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Tableau
// ---------------------------------------------------------------------------

function Tableau({ label, who, p, mil, forYou, active }: {
  label: string; who: 'you' | 'ai'; p: PlayerState; mil: number; forYou?: boolean; active: boolean
}) {
  const distinct = G.distinctScience(p)
  const milLead = forYou ? Math.max(0, mil) : Math.max(0, -mil)
  return (
    <div className={'panel swd-tableau' + (active ? ' on' : '')}>
      <div className="swd-tab-head">
        <span className={'swd-pawn ' + who} />
        <span className="swd-tab-name">{label}</span>
        <span className="swd-tab-coins" title="Coins">{p.coins}¢</span>
      </div>

      <div className="swd-tab-prod">
        {G.RESOURCES.map((r) => (
          <span className={'swd-prod ' + r} key={r} title={RES_LABEL[r]}>
            <b>{p.production[r]}</b>{RES_GLYPH[r]}
          </span>
        ))}
      </div>

      <div className="swd-tab-sci" title="Distinct science symbols (6 = instant win)">
        {G.SCIENCES.map((sym) => (
          <span className={'swd-sci-dot' + (p.science[sym] > 0 ? ' have' : '')} key={sym} title={SCI_LABEL[sym]}>
            {SCI_GLYPH[sym]}
          </span>
        ))}
        <span className={'swd-sci-count' + (distinct >= 5 ? ' danger' : '')}>{distinct}/6</span>
      </div>

      <div className="swd-tab-meta">
        <span title="Base VP (blue/purple/wonders/progress) + coins">VP <b>{p.vp + Math.floor(p.coins / 3)}</b></span>
        <span title="Military strength">⚔ <b>{p.military}</b>{milLead > 0 ? ` (+${milLead})` : ''}</span>
        <span title="Wonders raised">wonders <b>{p.wonders.filter((w) => w.built).length}/{p.wonders.length}</b></span>
      </div>

      <div className="swd-tab-wonders">
        {p.wonders.map((w) => (
          <span key={w.id} className={'swd-wchip' + (w.built ? ' built' : '')} title={wonderTitle(w)}>
            {w.name}
          </span>
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Modals
// ---------------------------------------------------------------------------

function ResultModal({ s, mySeat, won, oppName, onNew }: { s: SWDState; mySeat: 0 | 1; won: boolean; oppName: string; onNew: () => void }) {
  const oppSeat: 0 | 1 = (1 - mySeat) as 0 | 1
  const reason = s.winBy === 'military'
    ? (won ? 'You marched on the enemy capital.' : `${oppName} overran your capital.`)
    : s.winBy === 'science'
      ? (won ? 'You assembled all six sciences.' : `${oppName} assembled all six sciences.`)
      : (won ? 'You amassed the most victory points.' : `${oppName} amassed the most victory points.`)
  return (
    <Modal
      eyebrow={won ? 'Triumph' : 'Defeat'}
      title={won ? 'You Win' : `${oppName} Wins`}
      closeOnOverlay={false}
      actions={<button className="btn-modal" onClick={onNew}>Play again</button>}
    >
      <div className="modal-body">
        <p style={{ textAlign: 'center', fontSize: 15 }}>
          <span style={{ color: won ? 'var(--you)' : 'var(--ink-2)', fontFamily: 'var(--display)', fontWeight: 700 }}>You {G.scoreVP(s, mySeat)} VP</span>
          {'   ·   '}
          <span style={{ color: won ? 'var(--ink-2)' : 'var(--foe)', fontFamily: 'var(--display)', fontWeight: 700 }}>{oppName} {G.scoreVP(s, oppSeat)} VP</span>
        </p>
        <p style={{ textAlign: 'center' }}>{reason}</p>
        <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--ink-3)' }}>
          Won by {s.winBy} after Age {s.age === 0 ? 'I' : s.age === 1 ? 'II' : 'III'}.
        </p>
      </div>
    </Modal>
  )
}

function RulesModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal eyebrow="How to play" title="Seven Wonders Duel" onClose={onClose}
      actions={<button className="btn-modal" onClick={onClose}>Begin the age</button>}>
      <div className="modal-body">
        <p>Build a civilization across <b>three ages</b>. Each age lays out a pyramid of cards; only <b>accessible</b> cards (not covered by a card below) can be drafted, and they light up. On your turn pick one lit card and do <b>one</b> of:</p>
        <p>• <b>Build</b> it — pay its resource cost from your <b>production</b>; any resource you don't produce is bought with <b>coins</b> (2¢ each).</p>
        <p>• <b>Raise a Wonder</b> — spend the card to build one of your wonders (pay its cost, gain its effect).</p>
        <p>• <b>Discard</b> it for <b>coins</b> (2¢ + 1 per Commerce card you own).</p>
        <p><b>Card colors:</b> brown/grey produce resources · <span style={{ color: 'var(--blue)' }}>blue</span> = victory points · <span style={{ color: 'var(--green)' }}>green</span> = science (each new symbol toward six; a matching pair grants a progress token, +3 VP) · <span style={{ color: 'var(--yellow)' }}>yellow</span> = coins · <span style={{ color: 'var(--red)' }}>red</span> = military · <span style={{ color: 'var(--purple)' }}>purple</span> = guilds (end-game VP from your opponent's cards).</p>
        <p><b>Winning</b> (checked in order): push the shared <b>military pawn</b> to the enemy capital · collect <b>6 distinct sciences</b> · else after Age III the <b>most VP</b> wins.</p>
        <p><b>Keys:</b> <kbd>N</kbd> new · <kbd>?</kbd> rules · <kbd>Esc</kbd> deselect / close.</p>
      </div>
    </Modal>
  )
}
