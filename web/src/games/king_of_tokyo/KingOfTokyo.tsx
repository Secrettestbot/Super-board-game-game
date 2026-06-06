/* KING OF TOKYO — UI. Three monsters brawl with six dice. The AI plays player 1 & 2
   in several sub-steps per turn (roll / keep+reroll / resolve / end / yield), so
   useAITurn re-arms on `s.step` — a monotonic counter the logic bumps on every
   state-advancing action. AI yield decisions are also driven through the same path. */

import { useEffect, useRef, useState } from 'react'
import { GameShell } from '../../framework/GameShell'
import { Modal } from '../../framework/Modal'
import { useAITurn } from '../../framework/useAITurn'
import { useGameKeys } from '../../framework/useGameKeys'
import * as KOT from './logic'
import type { KotState, Face, Monster } from './logic'

const { WIN_VP, MAX_HEALTH } = KOT

const FACE_GLYPH: Record<string, string> = {
  '1': '1️⃣', '2': '2️⃣', '3': '3️⃣', claw: '🦷', heart: '❤️', energy: '⚡',
}
const MON_EMOJI = ['🦖', '🐱', '🐙']

const TITLE_MARK = (
  <svg className="title-mark" viewBox="0 0 48 48" aria-hidden="true">
    <rect x="4" y="4" width="40" height="40" rx="11" fill="#18102a" stroke="#ff2e88" strokeWidth="1.6" />
    <path d="M10 30 L14 18 L18 28 L24 14 L30 28 L34 18 L38 30 Z" fill="#29e0d8" opacity="0.85" />
    <circle cx="19" cy="24" r="2.3" fill="#ff6fb0" />
    <circle cx="29" cy="24" r="2.3" fill="#ff6fb0" />
    <rect x="20" y="32" width="8" height="5" rx="1.4" fill="#ff2e88" />
  </svg>
)

function dieClass(kept: boolean, idle: boolean): string {
  let c = 'kot-die'
  if (kept) c += ' kept'
  if (idle) c += ' idle'
  return c
}

function MonsterCard({ m, on, you }: { m: Monster; on: boolean; you: boolean }) {
  return (
    <div className={'kot-mon' + (you ? ' you-mon' : '') + (on ? ' on' : '') + (m.alive ? '' : ' dead') + (m.inTokyo ? ' in-tokyo' : '')}>
      <div className="kot-mon-head">
        <span className="kot-mon-emoji">{MON_EMOJI[m.id]}</span>
        <span className="kot-mon-name">{m.id === 0 ? 'You' : m.name}</span>
        {m.inTokyo && <span className="kot-tokyo-badge">Tokyo</span>}
      </div>
      <div className="kot-stats">
        <div className="kot-stat-row">
          <span className="kot-stat-ic">❤️</span>
          <span className="kot-bar"><span className="kot-bar-fill hp" style={{ width: `${(m.health / MAX_HEALTH) * 100}%` }} /></span>
          <span className="kot-stat-n">{m.alive ? `${m.health}/${MAX_HEALTH}` : 'KO'}</span>
        </div>
        <div className="kot-stat-row">
          <span className="kot-stat-ic">⭐</span>
          <span className="kot-bar"><span className="kot-bar-fill vp" style={{ width: `${Math.min(100, (m.vp / WIN_VP) * 100)}%` }} /></span>
          <span className="kot-stat-n">{m.vp}/{WIN_VP}</span>
        </div>
        <div className="kot-stat-row">
          <span className="kot-stat-ic">⚡</span>
          <span className="kot-stat-l" />
          <span className="kot-stat-n kot-energy" style={{ minWidth: 0, flex: 1, textAlign: 'left' }}>{m.energy} energy</span>
        </div>
      </div>
    </div>
  )
}

export function KingOfTokyo() {
  const [s, setS] = useState<KotState>(() => KOT.makeGame())
  const [showRules, setShowRules] = useState(false)
  const logRef = useRef<HTMLDivElement>(null)

  function newGame() { setS(KOT.makeGame()); setShowRules(false) }

  const yourTurn = s.winner == null && s.turn === 0
  const yourRoll = yourTurn && s.phase === 'roll'
  const yourYield = s.winner == null && s.phase === 'yield' && s.pendingYield != null && s.pendingYield.defender === 0

  function doRoll() { if (yourRoll && s.rerollsLeft > 0) setS(p => KOT.rollDice(p)) }
  function doResolve() { if (yourRoll && s.rolled) setS(p => KOT.resolveDice(p)) }
  function doEnd() { if (yourTurn && s.phase === 'resolved') setS(p => KOT.endTurn(p)) }
  function doToggle(i: number) { if (yourRoll && s.rolled) setS(p => KOT.toggleKeep(p, i)) }
  function doYield(yes: boolean) { if (yourYield) setS(p => KOT.yieldTokyo(p, yes)) }

  // AI is active when it's an AI player's sub-action OR an AI yield decision is pending,
  // and there's no winner. Re-arm on every sub-step via the monotonic counter s.step.
  const aiActive = s.winner == null && (
    (s.turn !== 0 && s.phase !== 'yield') ||
    (s.phase === 'yield' && s.pendingYield != null && s.pendingYield.defender !== 0)
  )
  useAITurn(aiActive, () => setS(p => KOT.aiStep(p)), { delayMs: 560, tick: s.step })

  useEffect(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight }, [s.log])

  useGameKeys({
    onNew: newGame,
    onToggleRules: () => setShowRules(v => !v),
    onEscape: () => setShowRules(false),
    extra: (e) => {
      if (e.key === ' ' || e.key === 'Spacebar') {
        if (yourRoll && s.rerollsLeft > 0) { doRoll(); return true }
      }
      if (e.key === 'Enter') {
        if (yourRoll && s.rolled) { doResolve(); return true }
        if (yourTurn && s.phase === 'resolved') { doEnd(); return true }
      }
      if ((e.key === 'y' || e.key === 'Y') && yourYield) { doYield(true); return true }
      return false
    },
  })

  const tokyoOcc = s.tokyoOccupant
  const live = s.monsters.filter(m => m.alive).length

  let banner: string, bk = ''
  if (s.winner != null) {
    if (s.winner === 0) { bk = 'win'; banner = 'You win — King of Tokyo!' }
    else { bk = 'lose'; banner = `${s.monsters[s.winner].name} wins.` }
  } else if (yourYield) {
    bk = 'you'; banner = `You're hit in Tokyo for ${s.pendingYield?.damage} — yield or hold?`
  } else if (yourTurn) {
    bk = 'you'
    if (!s.rolled) banner = 'Your turn — roll the dice'
    else if (s.phase === 'roll') banner = s.rerollsLeft > 0 ? 'Keep dice & reroll, or resolve' : 'Out of rerolls — resolve'
    else banner = 'Turn resolved — end turn'
  } else {
    bk = 'foe'; banner = `${s.monsters[s.turn].name} is rampaging…`
  }

  return (
    <>
      <GameShell
        mark={TITLE_MARK}
        eyebrow="King of Tokyo · kaiju dice brawl"
        title="King of Tokyo"
        subtitle="roll claws, hearts & energy — smash the others or hit 20 victory points"
        onRules={() => setShowRules(true)}
        onNew={newGame}
        modeLeft={`${live} monsters left · first to ${WIN_VP} VP`}
        banner={banner}
        bannerClass={bk}
        modeRight={<>space · roll &nbsp; ↵ · resolve/end &nbsp; N · new</>}
      >
        <div className="kot-wrap">
          <div>
            <div className="kot-monsters">
              {s.monsters.map(m => (
                <MonsterCard key={m.id} m={m} you={m.id === 0} on={s.turn === m.id && s.winner == null} />
              ))}
            </div>

            <div className="kot-arena">
              <span className="kot-tokyo-plate">🗼 TOKYO</span>
              <span className="kot-tokyo-occ">
                {tokyoOcc == null ? 'empty — claim it with a claw' : <>held by <b>{tokyoOcc === 0 ? 'You' : s.monsters[tokyoOcc].name}</b></>}
              </span>
            </div>

            <div className="kot-tray">
              <div className="kot-tray-head">
                <span className="kot-tray-l">{s.rolled ? 'your dice · click to keep' : 'press roll to begin'}</span>
                <span className="kot-reroll">rolls left: {s.rerollsLeft}</span>
              </div>
              <div className="kot-dice">
                {s.dice.map((d, i) => (
                  <button
                    key={i}
                    className={dieClass(s.kept[i], !s.rolled)}
                    onClick={() => doToggle(i)}
                    disabled={!yourRoll || !s.rolled}
                    title={String(d)}
                  >
                    {s.rolled ? FACE_GLYPH[String(d)] : '·'}
                  </button>
                ))}
              </div>

              {yourYield ? (
                <div className="kot-actions kot-yield">
                  <button className="kot-btn" onClick={() => doYield(true)}>Yield Tokyo</button>
                  <button className="kot-btn ghost" onClick={() => doYield(false)}>Hold (Y)</button>
                </div>
              ) : (
                <div className="kot-actions">
                  <button className="kot-btn" onClick={doRoll} disabled={!yourRoll || s.rerollsLeft <= 0}>
                    {s.rolled ? 'Reroll' : 'Roll'}
                  </button>
                  <button className="kot-btn ghost" onClick={doResolve} disabled={!yourRoll || !s.rolled}>Resolve</button>
                  <button className="kot-btn" onClick={doEnd} disabled={!yourTurn || s.phase !== 'resolved'}>End Turn</button>
                </div>
              )}
            </div>
          </div>

          <div className="kot-side">
            <div className="panel">
              <div className="panel-l">Dice faces</div>
              <div className="kot-legend">
                <div className="kot-leg-row"><span className="kot-leg-ic">1️⃣</span> three of a kind = that many VP (+1 each extra)</div>
                <div className="kot-leg-row"><span className="kot-leg-ic">🦷</span> claw — hit Tokyo (or all, if you're in it)</div>
                <div className="kot-leg-row"><span className="kot-leg-ic">❤️</span> heart — heal 1 (only outside Tokyo)</div>
                <div className="kot-leg-row"><span className="kot-leg-ic">⚡</span> energy — currency cubes</div>
              </div>
            </div>

            <div className="panel">
              <div className="panel-l">Activity</div>
              <div className="kot-logbox" ref={logRef}>
                {s.log.map((l, i) => <div key={i} className={'log-line ' + l.t}>{l.x}</div>)}
              </div>
            </div>
          </div>
        </div>
      </GameShell>

      {s.winner != null && <ResultModal s={s} onNew={newGame} />}
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </>
  )
}

function ResultModal({ s, onNew }: { s: KotState; onNew: () => void }) {
  const won = s.winner === 0
  const champ = s.winner != null ? (s.winner === 0 ? 'You' : s.monsters[s.winner].name) : ''
  return (
    <Modal
      eyebrow={won ? 'Tokyo is yours' : 'Crushed'}
      title={won ? 'You Win' : `${champ} Wins`}
      closeOnOverlay={false}
      actions={<button className="btn-modal" onClick={onNew}>Play again</button>}
    >
      <div className="modal-body">
        <p>
          {won
            ? 'You reigned over the city — through victory points or the last monster standing.'
            : `${champ} took the crown. The city trembles.`}
        </p>
        <p>
          Final VP — {s.monsters.map(m => `${m.id === 0 ? 'You' : m.name}: ${m.vp}`).join(' · ')}
        </p>
      </div>
    </Modal>
  )
}

function RulesModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal eyebrow="How to play" title="King of Tokyo" onClose={onClose}
      actions={<button className="btn-modal" onClick={onClose}>Rampage</button>}>
      <div className="modal-body">
        <p>Three monsters, each with <b>10 health</b> and <b>0 victory points</b>. On your turn, roll <b>6 dice</b> up to <b>3 times</b> — click dice to <b>keep</b> them between rolls — then <b>resolve</b>.</p>
        <p><b>Numbers:</b> three of a kind of value N scores <b>N VP</b>, each extra matching die <b>+1 VP</b>. <b>🦷 Claws:</b> if you're outside Tokyo, hit the monster in Tokyo; if you're <i>in</i> Tokyo, hit everyone else. <b>❤️ Hearts:</b> heal 1 each, but only outside Tokyo. <b>⚡ Energy:</b> currency cubes.</p>
        <p><b>Tokyo:</b> roll a claw while it's empty and you <i>must</i> move in (<b>+1 VP</b>). Hold it at the start of your turn for <b>+2 VP</b>. The Tokyo monster can't heal. When attacked from outside, the Tokyo monster may <b>yield</b> — the attacker takes its place.</p>
        <p><b>Win:</b> first to <b>{WIN_VP} VP</b>, or be the <b>last monster alive</b>.</p>
        <p><b>Keys:</b> <kbd>Space</kbd> roll · <kbd>Enter</kbd> resolve/end · <kbd>Y</kbd> yield · <kbd>N</kbd> new · <kbd>?</kbd> rules · <kbd>Esc</kbd> close.</p>
      </div>
    </Modal>
  )
}
