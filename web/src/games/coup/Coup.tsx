/* COUP — UI (built for this codebase). Three seats around a felt table: the two AI rivals up top
   (cards hidden, counts + coins shown), you below with your influence face-up. On your turn pick an
   action (and a target where needed); when an AI acts you get modal prompts to challenge or block.
   Two AI players act AND react many times in a row, so the AI driver re-arms on a monotonic action
   counter (`s.log.length` changes on every AI step). The forced coup at 10 coins keeps games finite. */

import { useMemo, useState } from 'react'
import { GameShell } from '../../framework/GameShell'
import { Modal } from '../../framework/Modal'
import { useAITurn } from '../../framework/useAITurn'
import { useGameKeys } from '../../framework/useGameKeys'
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

export function Coup() {
  const [s, setS] = useState<CoupState>(() => C.makeGame())
  const [rng] = useState(() => C.makeRng((Date.now() & 0x7fffffff) || 1))
  const [showRules, setShowRules] = useState(false)
  const [pendingAction, setPendingAction] = useState<ActionType | null>(null)   // awaiting a target pick
  const [aiStepN, setAiStepN] = useState(0)   // monotonic AI-action counter — re-arms the AI driver

  function newGame() { setS(C.makeGame()); setShowRules(false); setPendingAction(null); setAiStepN(0) }

  // The AI acts AND reacts MANY times in a row; re-arm on a counter that bumps every AI step
  // (the log is capped, so it can't serve as the tick once it saturates).
  useAITurn(C.aiToMove(s), () => { setS(p => C.aiStep(p, rng)); setAiStepN(n => n + 1) }, { delayMs: 720, tick: aiStepN })
  useGameKeys({ onNew: newGame, onToggleRules: () => setShowRules(v => !v), onEscape: () => { setShowRules(false); setPendingAction(null) } })

  const p = s.pending
  const yourActionTurn = s.winner == null && p == null && s.turn === 0
  const legal = useMemo(() => yourActionTurn ? new Set(C.legalActions(s, 0)) : new Set<ActionType>(), [yourActionTurn, s])

  // ---- human reactive decision flags ----
  const youChallenge = s.winner == null && p != null
    && (p.kind === 'action_challenge' || p.kind === 'block_challenge') && p.decider === 0
  const youBlock = s.winner == null && p != null && p.kind === 'block' && p.decider === 0
  const youLose = s.winner == null && p != null && p.kind === 'lose' && p.loser === 0
  const youExchange = s.winner == null && p != null && p.kind === 'exchange' && p.actor === 0

  // ---- action / target handlers ----
  function chooseAction(a: ActionType) {
    if (!legal.has(a)) return
    if (C.actionNeedsTarget(a)) { setPendingAction(a); return }
    setS(C.declareAction(s, 0, a, null)); setPendingAction(null)
  }
  function chooseTarget(t: number) {
    if (pendingAction == null) return
    setS(C.declareAction(s, 0, pendingAction, t)); setPendingAction(null)
  }

  // ---- banner ----
  let banner: string, bk = ''
  if (s.winner === 0) { bk = 'win'; banner = 'You hold the last influence — the court is yours' }
  else if (s.winner != null) { bk = 'lose'; banner = `${s.players[s.winner].name} outlasts the table` }
  else if (youChallenge) { bk = 'you'; banner = challengePromptText(s) }
  else if (youBlock) { bk = 'you'; banner = 'A move targets you — block it, or let it pass' }
  else if (youLose) { bk = 'you'; banner = 'You must surrender an influence — choose a card' }
  else if (youExchange) { bk = 'you'; banner = 'Ambassador — choose the influence to keep' }
  else if (pendingAction != null) { bk = 'you'; banner = `${C.ACTION_LABEL[pendingAction]} — pick a target` }
  else if (yourActionTurn) { bk = 'you'; banner = s.players[0].coins >= C.FORCE_COUP_AT ? 'You hold 10+ coins — you must Coup' : 'Your turn — choose an action' }
  else { bk = 'foe'; banner = 'The court deliberates…' }

  const targetIds = pendingAction != null ? C.legalTargets(s, 0) : []

  return (
    <>
      <GameShell
        mark={TITLE_MARK}
        eyebrow="Coup · deception at court"
        title="Coup"
        subtitle="bluff your character, challenge the liars, and be the last influence standing"
        onRules={() => setShowRules(true)}
        onNew={newGame}
        modeLeft={<>Players {C.alivePlayers(s).length}/3 · deck {s.deck.length}</>}
        banner={banner}
        bannerClass={bk}
        modeRight={<>N · new &nbsp; ? · rules</>}
      >
        <div className="coup-wrap">
          {/* rivals */}
          <div className="coup-opps">
            {[1, 2].map(id => <OppSeat key={id} s={s} id={id} highlightTarget={targetIds.includes(id)} onTarget={() => chooseTarget(id)} />)}
          </div>

          {/* you */}
          <YouSeat s={s} active={yourActionTurn || youLose || youExchange} />

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
                <span className={'dot ' + (pl.id === 0 ? 'you' : 'foe')} />
                <span className="who">{pl.name}</span>
                <span className="infl">{C.isAlive(pl) ? '●'.repeat(C.aliveInfluence(pl)) + '○'.repeat(2 - C.aliveInfluence(pl)) : 'out'} · {pl.coins}c</span>
              </div>
            ))}
          </div>
          <div className="panel logbox">
            {s.log.slice().reverse().map((l, i) => <div key={i} className={'log-line ' + l.t}>{l.x}</div>)}
          </div>
        </div>
      </GameShell>

      {youChallenge && <ChallengeModal s={s} onChallenge={() => setS(C.challenge(s, 0))} onPass={() => setS(C.passChallenge(s, 0))} />}
      {youBlock && <BlockModal s={s} onBlock={(ch) => setS(C.block(s, 0, ch))} onPass={() => setS(C.passBlock(s, 0))} />}
      {youLose && <LoseModal s={s} onPick={(i) => setS(C.resolveLossOfInfluence(s, i))} />}
      {youExchange && <ExchangeModal s={s} onKeep={(keep) => setS(C.resolveExchange(s, keep, rng))} />}
      {s.winner != null && <ResultModal s={s} onNew={newGame} />}
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </>
  )
}

// ===== Seats =====
function OppSeat({ s, id, highlightTarget, onTarget }: { s: CoupState; id: number; highlightTarget: boolean; onTarget: () => void }) {
  const pl = s.players[id]
  const alive = C.isAlive(pl)
  const active = s.winner == null && ((s.pending == null && s.turn === id) || (s.pending != null && pendingDeciderIs(s, id)))
  return (
    <div className={'seat' + (active ? ' active' : '') + (alive ? '' : ' gone') + (highlightTarget ? ' choose-target' : '')}
      onClick={highlightTarget ? onTarget : undefined}
      style={highlightTarget ? { cursor: 'pointer', outline: '2px solid var(--accent)' } : undefined}>
      <div className="seat-head">
        <span className="seat-name foe-name">{pl.name}</span>
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

function YouSeat({ s, active }: { s: CoupState; active: boolean }) {
  const pl = s.players[0]
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

function pendingDeciderIs(s: CoupState, id: number): boolean {
  const p = s.pending
  if (!p) return false
  if (p.kind === 'action_challenge' || p.kind === 'block_challenge' || p.kind === 'block') return p.decider === id
  if (p.kind === 'lose') return p.loser === id
  if (p.kind === 'exchange') return p.actor === id
  return false
}

// ===== Modals =====
function challengePromptText(s: CoupState): string {
  const p = s.pending!
  const isBlock = p.kind === 'block_challenge'
  const claimant = isBlock ? p.blocker! : p.actor
  const ch = isBlock ? p.blockClaim! : p.claim!
  return `${s.players[claimant].name} claims the ${ch} — challenge it?`
}

function ChallengeModal({ s, onChallenge, onPass }: { s: CoupState; onChallenge: () => void; onPass: () => void }) {
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
        <div className="prompt-line"><b>{s.players[claimant].name}</b> {isBlock ? 'blocks by claiming' : 'claims'} the <b>{ch}</b>.</div>
        <div className="prompt-line">If they are bluffing they lose an influence — but if they hold it, <b>you</b> do.</div>
      </div>
    </Modal>
  )
}

function BlockModal({ s, onBlock, onPass }: { s: CoupState; onBlock: (ch: Character) => void; onPass: () => void }) {
  const p = s.pending!
  const opts = C.blockers(p.action)
  return (
    <Modal eyebrow="You may block" title={`Block the ${C.ACTION_LABEL[p.action]}?`} closeOnOverlay={false}
      actions={<button className="choice-btn ghost" onClick={onPass}>Allow it</button>}>
      <div className="prompt-claim">
        <div className="prompt-line"><b>{s.players[p.actor].name}</b> is acting against you. Claim a blocker (you may bluff — it can be challenged).</div>
      </div>
      <div className="choice-row">
        {opts.map(ch => <button key={ch} className="choice-btn" onClick={() => onBlock(ch)}>Block with {ch}</button>)}
      </div>
    </Modal>
  )
}

function LoseModal({ s, onPick }: { s: CoupState; onPick: (i: number) => void }) {
  const p = s.pending!
  const pl = s.players[p.loser!]
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

function ExchangeModal({ s, onKeep }: { s: CoupState; onKeep: (keep: Character[]) => void }) {
  const p = s.pending!
  const pl = s.players[p.actor]
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

function ResultModal({ s, onNew }: { s: CoupState; onNew: () => void }) {
  const won = s.winner === 0
  return (
    <Modal eyebrow={won ? 'The court bows' : 'You are unmasked'} title={won ? 'You Win' : `${s.players[s.winner!].name} Wins`}
      closeOnOverlay={false} actions={<button className="choice-btn" onClick={onNew}>Play again</button>}>
      <div className="finalsc">
        {s.players.map(p => <span key={p.id} className={p.id === 0 ? 'you' : 'foe'}>{p.name} {C.isAlive(p) ? 'survives' : 'out'}</span>)}
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
