/* KING OF TOKYO — UI. Three monsters brawl with six dice. Online-capable via
   useGameSession(kingOfTokyoAdapter): the host runs the real logic, empty seats are
   filled by the AI, and a guest plays a non-host monster. Everything is public so no
   redaction is needed. The view is seat-relative — "your" monster is mySeat, isMyTurn
   gates every action, and remote opponents are labelled "Opponent" / "Player N". */

import { useEffect, useRef, useState } from 'react'
import { GameShell } from '../../framework/GameShell'
import { Modal } from '../../framework/Modal'
import { OnlineBar } from '../../framework/OnlineBar'
import { useGameKeys } from '../../framework/useGameKeys'
import { useGameSession } from '../../net/useGameSession'
import { kingOfTokyoAdapter } from './net'
import * as KOT from './logic'
import type { KotState, Monster } from './logic'

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

function MonsterCard({ m, on, you, label }: { m: Monster; on: boolean; you: boolean; label: string }) {
  return (
    <div className={'kot-mon' + (you ? ' you-mon' : '') + (on ? ' on' : '') + (m.alive ? '' : ' dead') + (m.inTokyo ? ' in-tokyo' : '')}>
      <div className="kot-mon-head">
        <span className="kot-mon-emoji">{MON_EMOJI[m.id]}</span>
        <span className="kot-mon-name">{label}</span>
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

/** Seat-relative display name for a monster: "You" for your own seat; the monster's name
 *  in solo play; and "Opponent" (2-player) or "Player N" (3+) for remote seats online. */
function nameFor(s: KotState, id: number, mySeat: number, online: boolean): string {
  if (id === mySeat) return 'You'
  if (!online) return s.monsters[id].name
  return s.monsters.length === 2 ? 'Opponent' : `Player ${id + 1}`
}

export function KingOfTokyo() {
  const { state: s, mySeat, isMyTurn, dispatch, newGame: netNew, net } = useGameSession(kingOfTokyoAdapter)
  const [showRules, setShowRules] = useState(false)
  const logRef = useRef<HTMLDivElement>(null)

  function newGame() { netNew(); setShowRules(false) }

  const yourTurn = s.winner == null && isMyTurn
  // During a yield prompt the seat-to-move is the Tokyo defender, so isMyTurn already
  // becomes true for whoever must answer — but the roll/resolve/end actions still belong
  // to the turn player, so gate those on the turn proper (not the yield).
  const myTurnProper = s.winner == null && s.turn === mySeat && s.phase !== 'yield'
  const yourRoll = myTurnProper && s.phase === 'roll'
  const yourYield = s.winner == null && s.phase === 'yield' && s.pendingYield != null && s.pendingYield.defender === mySeat

  function doRoll() { if (yourRoll && s.rerollsLeft > 0) dispatch({ kind: 'roll' }) }
  function doResolve() { if (yourRoll && s.rolled) dispatch({ kind: 'resolve' }) }
  function doEnd() { if (myTurnProper && s.phase === 'resolved') dispatch({ kind: 'end' }) }
  function doToggle(i: number) { if (yourRoll && s.rolled) dispatch({ kind: 'hold', i }) }
  function doYield(yes: boolean) { if (yourYield) dispatch({ kind: 'yield', yes }) }

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
        if (myTurnProper && s.phase === 'resolved') { doEnd(); return true }
      }
      if ((e.key === 'y' || e.key === 'Y') && yourYield) { doYield(true); return true }
      return false
    },
  })

  const tokyoOcc = s.tokyoOccupant
  const live = s.monsters.filter(m => m.alive).length

  let banner: string, bk = ''
  if (s.winner != null) {
    if (s.winner === mySeat) { bk = 'win'; banner = 'You win — King of Tokyo!' }
    else { bk = 'lose'; banner = `${nameFor(s, s.winner, mySeat, net.online)} wins.` }
  } else if (yourYield) {
    bk = 'you'; banner = `You're hit in Tokyo for ${s.pendingYield?.damage} — yield or hold?`
  } else if (myTurnProper) {
    bk = 'you'
    if (!s.rolled) banner = 'Your turn — roll the dice'
    else if (s.phase === 'roll') banner = s.rerollsLeft > 0 ? 'Keep dice & reroll, or resolve' : 'Out of rerolls — resolve'
    else banner = 'Turn resolved — end turn'
  } else {
    const actor = s.phase === 'yield' && s.pendingYield != null ? s.pendingYield.defender : s.turn
    const verb = s.phase === 'yield' ? 'is deciding whether to yield Tokyo…' : 'is rampaging…'
    bk = 'foe'; banner = `${nameFor(s, actor, mySeat, net.online)} ${verb}`
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
                <MonsterCard key={m.id} m={m} you={m.id === mySeat} on={s.turn === m.id && s.winner == null} label={nameFor(s, m.id, mySeat, net.online)} />
              ))}
            </div>

            <div className="kot-arena">
              <span className="kot-tokyo-plate">🗼 TOKYO</span>
              <span className="kot-tokyo-occ">
                {tokyoOcc == null ? 'empty — claim it with a claw' : <>held by <b>{nameFor(s, tokyoOcc, mySeat, net.online)}</b></>}
              </span>
            </div>

            <div className="kot-tray">
              <div className="kot-tray-head">
                <span className="kot-tray-l">{!s.rolled ? 'press roll to begin' : yourRoll ? 'your dice · click to keep' : `${nameFor(s, s.turn, mySeat, net.online)}'s dice`}</span>
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
                  <button className="kot-btn" onClick={doEnd} disabled={!myTurnProper || s.phase !== 'resolved'}>End Turn</button>
                </div>
              )}
            </div>
          </div>

          <div className="kot-side">
            <div className="panel">
              <OnlineBar net={net} />
            </div>
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

      {s.winner != null && <ResultModal s={s} mySeat={mySeat} online={net.online} onNew={newGame} />}
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </>
  )
}

function ResultModal({ s, mySeat, online, onNew }: { s: KotState; mySeat: number; online: boolean; onNew: () => void }) {
  const won = s.winner === mySeat
  const champ = s.winner != null ? nameFor(s, s.winner, mySeat, online) : ''
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
          Final VP — {s.monsters.map(m => `${nameFor(s, m.id, mySeat, online)}: ${m.vp}`).join(' · ')}
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
