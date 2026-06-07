/* COUP — UI (built for this codebase). Three seats around a felt table. Your influence is shown
   face-up at the bottom (derived from `mySeat`); the other two seats are rivals with hidden cards.
   On your action turn you pick an action (and a target where needed); when another seat acts you
   get modal prompts to challenge or block. Online play is host-authoritative via useGameSession:
   the host runs logic.ts, guests send kinded intents and render a per-seat redacted view, and the
   hook fills empty seats with the existing AI. Solo play is the same hook with no guests. */

import { useMemo, useState } from 'react'
import { GameShell } from '../../framework/GameShell'
import { Modal } from '../../framework/Modal'
import { OnlineBar } from '../../framework/OnlineBar'
import { useGameKeys } from '../../framework/useGameKeys'
import { useGameSession } from '../../net/useGameSession'
import { coupAdapter } from './net'
import * as C from './logic'
import type { CoupState, Character, ActionType } from './logic'

const TITLE_MARK = (
  <svg className="title-mark" viewBox="0 0 48 48" aria-hidden="true">
    <rect x="4" y="4" width="40" height="40" rx="9" fill="#4a0e16" stroke="#a01e2e" strokeWidth="1.5" />
    <path d="M24 9 L31 14 V24 C31 31 24 38 24 38 C24 38 17 31 17 24 V14 Z" fill="#d4a24a" stroke="#f0c673" strokeWidth="1.2" strokeLinejoin="round" />
    <circle cx="24" cy="21" r="4" fill="#4a0e16" stroke="#f0c673" strokeWidth="1" />
  </svg>
)

const GLYPH: Record<Character, string> = { Duke: '♛', Assassin: '🗡', Captain: '⚓', Ambassador: '✦', Contessa: '♔' }
const CHAR_BLURB: Record<Character, string> = {
  Duke: 'Tax +3 · blocks Aid', Assassin: 'Assassinate (pay 3)', Captain: 'Steal 2 · blocks Steal',
  Ambassador: 'Exchange · blocks Steal', Contessa: 'Blocks assassination',
}

const ACTION_INFO: Record<ActionType, { sub: string }> = {
  income: { sub: '+1 coin' }, foreign_aid: { sub: '+2 · Duke blocks' }, coup: { sub: 'pay 7 · kill' },
  tax: { sub: 'Duke · +3' }, assassinate: { sub: 'Assassin · pay 3' }, steal: { sub: 'Captain · take 2' },
  exchange: { sub: 'Ambassador' },
}

/** Seat-relative display name: your seat is "You"; others are the game name solo, or
    "Opponent"/"Player N" online (we don't know remote players' real names). */
function seatName(s: CoupState, id: number, mySeat: number, online: boolean, numOpp: number): string {
  if (id === mySeat) return 'You'
  if (!online) return s.players[id].name
  return numOpp <= 1 ? 'Opponent' : `Player ${id + 1}`
}

export function Coup() {
  const { state: s, mySeat, isMyTurn, dispatch, newGame: netNew, net } = useGameSession(coupAdapter)
  const [showRules, setShowRules] = useState(false)
  const [pendingAction, setPendingAction] = useState<ActionType | null>(null)   // awaiting a target pick

  function newGame() { netNew(); setShowRules(false); setPendingAction(null) }

  useGameKeys({ onNew: newGame, onToggleRules: () => setShowRules(v => !v), onEscape: () => { setShowRules(false); setPendingAction(null) } })

  const p = s.pending
  const numSeats = s.players.length
  const numOpp = numSeats - 1
  const me = s.players[mySeat]
  // The two seats that are not me, in seat order (rivals shown up top).
  const oppIds = s.players.map((_, i) => i).filter(i => i !== mySeat)

  const yourActionTurn = s.winner == null && p == null && s.turn === mySeat && isMyTurn
  const legal = useMemo(() => yourActionTurn ? new Set(C.legalActions(s, mySeat)) : new Set<ActionType>(), [yourActionTurn, s, mySeat])

  // ---- human reactive decision flags (gated on isMyTurn so a guest only acts when it's theirs) ----
  const youChallenge = s.winner == null && isMyTurn && p != null
    && (p.kind === 'action_challenge' || p.kind === 'block_challenge') && p.decider === mySeat
  const youBlock = s.winner == null && isMyTurn && p != null && p.kind === 'block' && p.decider === mySeat
  const youLose = s.winner == null && isMyTurn && p != null && p.kind === 'lose' && p.loser === mySeat
  const youExchange = s.winner == null && isMyTurn && p != null && p.kind === 'exchange' && p.actor === mySeat

  // ---- action / target handlers ----
  function chooseAction(a: ActionType) {
    if (!legal.has(a)) return
    if (C.actionNeedsTarget(a)) { setPendingAction(a); return }
    dispatch({ kind: 'action', type: a, target: null }); setPendingAction(null)
  }
  function chooseTarget(t: number) {
    if (pendingAction == null) return
    dispatch({ kind: 'action', type: pendingAction, target: t }); setPendingAction(null)
  }

  // ---- banner ----
  let banner: string, bk = ''
  if (s.winner === mySeat) { bk = 'win'; banner = 'You hold the last influence — the court is yours' }
  else if (s.winner != null) { bk = 'lose'; banner = `${seatName(s, s.winner, mySeat, net.online, numOpp)} outlasts the table` }
  else if (youChallenge) { bk = 'you'; banner = challengePromptText(s, mySeat, net.online, numOpp) }
  else if (youBlock) { bk = 'you'; banner = 'A move targets you — block it, or let it pass' }
  else if (youLose) { bk = 'you'; banner = 'You must surrender an influence — choose a card' }
  else if (youExchange) { bk = 'you'; banner = 'Ambassador — choose the influence to keep' }
  else if (pendingAction != null) { bk = 'you'; banner = `${C.ACTION_LABEL[pendingAction]} — pick a target` }
  else if (yourActionTurn) { bk = 'you'; banner = me.coins >= C.FORCE_COUP_AT ? 'You hold 10+ coins — you must Coup' : 'Your turn — choose an action' }
  else { bk = 'foe'; banner = 'The court deliberates…' }

  const targetIds = pendingAction != null ? C.legalTargets(s, mySeat) : []

  return (
    <>
      <GameShell
        mark={TITLE_MARK}
        eyebrow="Coup · deception at court"
        title="Coup"
        subtitle="bluff your character, challenge the liars, and be the last influence standing"
        onRules={() => setShowRules(true)}
        onNew={newGame}
        modeLeft={<>Players {C.alivePlayers(s).length}/{numSeats} · deck {s.deck.length}</>}
        banner={banner}
        bannerClass={bk}
        modeRight={<>N · new &nbsp; ? · rules</>}
      >
        <div className="coup-wrap">
          {/* rivals */}
          <div className="coup-opps">
            {oppIds.map(id => (
              <OppSeat key={id} s={s} id={id} name={seatName(s, id, mySeat, net.online, numOpp)}
                active={seatIsActing(s, id)}
                highlightTarget={targetIds.includes(id)} onTarget={() => chooseTarget(id)} />
            ))}
          </div>

          {/* you */}
          <YouSeat s={s} mySeat={mySeat} active={yourActionTurn || youLose || youExchange} />

          {/* action bar */}
          {yourActionTurn && (
            <div className="action-bar">
              {(['income', 'foreign_aid', 'tax', 'steal', 'assassinate', 'exchange', 'coup'] as ActionType[]).map(a => (
                <button
                  key={a}
                  className={'act-btn' + (a === 'coup' ? ' coup' : '')}
                  disabled={!legal.has(a)}
                  onClick={() => chooseAction(a)}
                >
                  {C.ACTION_LABEL[a]}
                  <span className="a-sub">{ACTION_INFO[a].sub}</span>
                </button>
              ))}
            </div>
          )}
          {pendingAction != null && (
            <div className="action-bar">
              <button className="act-btn" onClick={() => setPendingAction(null)}>Cancel<span className="a-sub">choose another action</span></button>
            </div>
          )}
        </div>

        <div className="side">
          <div className="panel">
            <div className="panel-l">Influence</div>
            {s.players.map(pl => (
              <div key={pl.id} className={'score-row' + (C.isAlive(pl) ? '' : ' dead-row')}>
                <span className={'dot ' + (pl.id === mySeat ? 'you' : 'foe')} />
                <span className="who">{seatName(s, pl.id, mySeat, net.online, numOpp)}</span>
                <span className="infl">{C.isAlive(pl) ? '●'.repeat(C.aliveInfluence(pl)) + '○'.repeat(2 - C.aliveInfluence(pl)) : 'out'} · {pl.coins}c</span>
              </div>
            ))}
          </div>
          <OnlineBar net={net} />
          <div className="panel logbox">
            {s.log.slice().reverse().map((l, i) => <div key={i} className={'log-line ' + l.t}>{l.x}</div>)}
          </div>
        </div>
      </GameShell>

      {youChallenge && <ChallengeModal s={s} mySeat={mySeat} online={net.online} numOpp={numOpp} onChallenge={() => dispatch({ kind: 'challenge' })} onPass={() => dispatch({ kind: 'allow' })} />}
      {youBlock && <BlockModal s={s} mySeat={mySeat} online={net.online} numOpp={numOpp} onBlock={(ch) => dispatch({ kind: 'block', as: ch })} onPass={() => dispatch({ kind: 'allow' })} />}
      {youLose && <LoseModal s={s} mySeat={mySeat} onPick={(i) => dispatch({ kind: 'reveal', card: i })} />}
      {youExchange && <ExchangeModal s={s} mySeat={mySeat} onKeep={(keep) => dispatch({ kind: 'exchange', keep })} />}
      {s.winner != null && <ResultModal s={s} mySeat={mySeat} online={net.online} numOpp={numOpp} onNew={newGame} />}
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </>
  )
}

/** Is seat `id` the one currently acting/reacting? (used to glow the active rival seat). */
function seatIsActing(s: CoupState, id: number): boolean {
  if (s.winner != null) return false
  const p = s.pending
  if (p == null) return s.turn === id
  if (p.kind === 'action_challenge' || p.kind === 'block_challenge' || p.kind === 'block') return p.decider === id
  if (p.kind === 'lose') return p.loser === id
  if (p.kind === 'exchange') return p.actor === id
  return false
}

// ===== Seats =====
function OppSeat({ s, id, name, active, highlightTarget, onTarget }: { s: CoupState; id: number; name: string; active: boolean; highlightTarget: boolean; onTarget: () => void }) {
  const pl = s.players[id]
  const alive = C.isAlive(pl)
  return (
    <div className={'seat' + (active ? ' active' : '') + (alive ? '' : ' gone') + (highlightTarget ? ' choose-target' : '')}
      onClick={highlightTarget ? onTarget : undefined}
      style={highlightTarget ? { cursor: 'pointer', outline: '2px solid var(--accent)' } : undefined}>
      <div className="seat-head">
        <span className="seat-name foe-name">{name}</span>
        {active && alive && <span className="seat-tag turn">acting</span>}
        {!alive && <span className="seat-tag out">out</span>}
      </div>
      <div className="coins"><span className="coin" /><span className="coin-n">{pl.coins}</span></div>
      <div className="cards">
        {pl.cards.map((c, i) => c.revealed
          ? <div key={i} className="card dead"><span className="c-glyph">{GLYPH[c.char]}</span><span className="c-name">{c.char}</span></div>
          : <div key={i} className="card back"><span className="crest">{'❦'}</span></div>)}
      </div>
    </div>
  )
}

function YouSeat({ s, mySeat, active }: { s: CoupState; mySeat: number; active: boolean }) {
  const pl = s.players[mySeat]
  const alive = C.isAlive(pl)
  return (
    <div className={'seat you-seat' + (active ? ' active' : '') + (alive ? '' : ' gone')}>
      <div className="seat-head">
        <span className="seat-name you-name">You</span>
        {active && <span className="seat-tag turn">your move</span>}
        {!alive && <span className="seat-tag out">out</span>}
        <div className="coins" style={{ marginLeft: 'auto' }}><span className="coin" /><span className="coin-n">{pl.coins}</span></div>
      </div>
      <div className="cards">
        {pl.cards.map((c, i) => c.revealed
          ? <div key={i} className="card dead"><span className="c-glyph">{GLYPH[c.char]}</span><span className="c-name">{c.char}</span></div>
          : <FaceCard key={i} ch={c.char} />)}
      </div>
    </div>
  )
}

function FaceCard({ ch, onClick, selected, className }: { ch: Character; onClick?: () => void; selected?: boolean; className?: string }) {
  return (
    <div className={'card face' + (onClick ? ' choose' : '') + (selected ? ' sel' : '') + (className ? ' ' + className : '')} onClick={onClick}>
      <span className="c-glyph">{GLYPH[ch]}</span>
      <span className="c-name">{ch}</span>
      <span className="c-tag">{CHAR_BLURB[ch]}</span>
    </div>
  )
}

// ===== Modals =====
function challengePromptText(s: CoupState, mySeat: number, online: boolean, numOpp: number): string {
  const p = s.pending!
  const isBlock = p.kind === 'block_challenge'
  const claimant = isBlock ? p.blocker! : p.actor
  const ch = isBlock ? p.blockClaim! : p.claim!
  return `${seatName(s, claimant, mySeat, online, numOpp)} claims the ${ch} — challenge it?`
}

function ChallengeModal({ s, mySeat, online, numOpp, onChallenge, onPass }: { s: CoupState; mySeat: number; online: boolean; numOpp: number; onChallenge: () => void; onPass: () => void }) {
  const p = s.pending!
  const isBlock = p.kind === 'block_challenge'
  const claimant = isBlock ? p.blocker! : p.actor
  const ch = isBlock ? p.blockClaim! : p.claim!
  return (
    <Modal eyebrow="A claim on the table" title="Challenge?" closeOnOverlay={false}
      actions={<>
        <button className="choice-btn ghost" onClick={onPass}>Let it pass</button>
        <button className="choice-btn danger" onClick={onChallenge}>Challenge the {ch}</button>
      </>}>
      <div className="prompt-claim">
        <div className="prompt-line"><b>{seatName(s, claimant, mySeat, online, numOpp)}</b> {isBlock ? 'blocks by claiming' : 'claims'} the <b>{ch}</b>.</div>
        <div className="prompt-line">If they are bluffing they lose an influence — but if they hold it, <b>you</b> do.</div>
      </div>
    </Modal>
  )
}

function BlockModal({ s, mySeat, online, numOpp, onBlock, onPass }: { s: CoupState; mySeat: number; online: boolean; numOpp: number; onBlock: (ch: Character) => void; onPass: () => void }) {
  const p = s.pending!
  const opts = C.blockers(p.action)
  return (
    <Modal eyebrow="You may block" title={`Block the ${C.ACTION_LABEL[p.action]}?`} closeOnOverlay={false}
      actions={<button className="choice-btn ghost" onClick={onPass}>Allow it</button>}>
      <div className="prompt-claim">
        <div className="prompt-line"><b>{seatName(s, p.actor, mySeat, online, numOpp)}</b> is acting against you. Claim a blocker (you may bluff — it can be challenged).</div>
      </div>
      <div className="choice-row">
        {opts.map(ch => <button key={ch} className="choice-btn" onClick={() => onBlock(ch)}>Block with {ch}</button>)}
      </div>
    </Modal>
  )
}

function LoseModal({ s, mySeat, onPick }: { s: CoupState; mySeat: number; onPick: (i: number) => void }) {
  const p = s.pending!
  const pl = s.players[mySeat]
  const live = pl.cards.map((c, i) => ({ c, i })).filter(o => !o.c.revealed)
  return (
    <Modal eyebrow="A blow lands" title="Lose an influence" closeOnOverlay={false}
      actions={live.length === 1 ? <button className="choice-btn danger" onClick={() => onPick(live[0].i)}>Reveal the {live[0].c.char}</button> : <span />}>
      <div className="prompt-claim"><div className="prompt-line">{p.loseReason ? `Reason: ${p.loseReason}.` : ''} Choose the card to reveal (it is then dead).</div></div>
      <div className="lose-cards">
        {live.map(o => <FaceCard key={o.i} ch={o.c.char} onClick={() => onPick(o.i)} />)}
      </div>
    </Modal>
  )
}

function ExchangeModal({ s, mySeat, onKeep }: { s: CoupState; mySeat: number; onKeep: (keep: Character[]) => void }) {
  const p = s.pending!
  const pl = s.players[mySeat]
  const liveChars = pl.cards.filter(c => !c.revealed).map(c => c.char)
  const need = liveChars.length
  // Option pool: each live hand card + each drawn card, as distinct selectable slots.
  const pool: Character[] = liveChars.concat(p.drawn)
  const [sel, setSel] = useState<number[]>([])
  function toggle(i: number) {
    setSel(cur => cur.includes(i) ? cur.filter(x => x !== i) : cur.length < need ? cur.concat(i) : cur)
  }
  const keep = sel.map(i => pool[i])
  return (
    <Modal eyebrow="Ambassador" title={`Keep ${need} influence`} closeOnOverlay={false}
      actions={<button className="choice-btn" disabled={sel.length !== need} onClick={() => onKeep(keep)} style={sel.length !== need ? { opacity: 0.4, pointerEvents: 'none' } : undefined}>Confirm</button>}>
      <div className="prompt-claim"><div className="prompt-line">Pick the {need} card{need === 1 ? '' : 's'} to keep; the rest return to the deck.</div></div>
      <div className="lose-cards">
        {pool.map((ch, i) => <FaceCard key={i} ch={ch} onClick={() => toggle(i)} selected={sel.includes(i)} />)}
      </div>
    </Modal>
  )
}

function ResultModal({ s, mySeat, online, numOpp, onNew }: { s: CoupState; mySeat: number; online: boolean; numOpp: number; onNew: () => void }) {
  const won = s.winner === mySeat
  return (
    <Modal eyebrow={won ? 'The court bows' : 'You are unmasked'} title={won ? 'You Win' : `${seatName(s, s.winner!, mySeat, online, numOpp)} Wins`}
      closeOnOverlay={false} actions={<button className="choice-btn" onClick={onNew}>Play again</button>}>
      <div className="finalsc">
        {s.players.map(p => <span key={p.id} className={p.id === mySeat ? 'you' : 'foe'}>{seatName(s, p.id, mySeat, online, numOpp)} {C.isAlive(p) ? 'survives' : 'out'}</span>)}
      </div>
    </Modal>
  )
}

function RulesModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal eyebrow="How to play" title="Coup" onClose={onClose}
      actions={<button className="choice-btn" onClick={onClose}>To court</button>}>
      <div className="modal-body">
        <p>Each player holds <b>two influence</b> (hidden character cards) and starts with 2 coins. Lose both and you are out; the <b>last player standing wins</b>.</p>
        <p>On your turn take ONE action. <b>Income</b> (+1, safe). <b>Foreign Aid</b> (+2, a Duke blocks). <b>Coup</b> (pay 7, kill an influence — mandatory at 10+ coins). <b>Tax</b> (Duke, +3). <b>Assassinate</b> (Assassin, pay 3; a Contessa blocks). <b>Steal</b> (Captain, take 2; a Captain or Ambassador blocks). <b>Exchange</b> (Ambassador, draw 2 and reshuffle).</p>
        <p>Character actions and blocks are <b>claims you can bluff</b>. Anyone may <b>challenge</b> a claim: if the claimant truly holds it, the challenger loses an influence (and the card is reshuffled); if not, the bluffer loses an influence and the move fails.</p>
        <p><b>Keys:</b> <kbd>N</kbd> new game · <kbd>?</kbd> rules · <kbd>Esc</kbd> close.</p>
      </div>
    </Modal>
  )
}
