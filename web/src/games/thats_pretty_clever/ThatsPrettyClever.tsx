/* THAT'S PRETTY CLEVER! — UI (built for this codebase). Six chunky coloured dice on a dark
   tray, a silver platter for set-aside dice, five colour tracks per sheet. Online-capable via
   useGameSession: the host runs the real logic, guests send move intents and render the public
   view. Seat-relative — your own sheet/score come from `mySeat`, your picks are gated by
   `isMyTurn`, and banners/score/result are stated from your seat's point of view. The AI fills
   any empty seat (driven inside the hook); solo play is unchanged (you are seat 0, the rival is
   an AI seat). */

import { useMemo, useState } from 'react'
import { GameShell } from '../../framework/GameShell'
import { Modal } from '../../framework/Modal'
import { OnlineBar } from '../../framework/OnlineBar'
import { useGameKeys } from '../../framework/useGameKeys'
import { useGameSession } from '../../net/useGameSession'
import { thatsPrettyCleverAdapter } from './net'
import * as G from './logic'
import type { Die, Color } from './logic'

const TITLE_MARK = (
  <svg className="title-mark" viewBox="0 0 48 48" aria-hidden="true">
    <rect x="4" y="4" width="18" height="18" rx="5" fill="#f2c10a" />
    <rect x="26" y="4" width="18" height="18" rx="5" fill="#2f86e0" />
    <rect x="4" y="26" width="18" height="18" rx="5" fill="#ef7e2e" />
    <rect x="26" y="26" width="18" height="18" rx="5" fill="#9b5de5" />
    <circle cx="13" cy="13" r="2.4" fill="#3a2c00" />
    <circle cx="35" cy="13" r="2.4" fill="#fff" />
    <circle cx="13" cy="35" r="2.4" fill="#fff" />
    <circle cx="35" cy="35" r="2.4" fill="#fff" />
  </svg>
)

const TRACK_LETTER: Record<Exclude<Color, 'white'>, string> = {
  yellow: 'Y', blue: 'B', green: 'G', orange: 'O', purple: 'P',
}

function DieView({ d, className = '', onClick, small }: { d: Die; className?: string; onClick?: () => void; small?: boolean }) {
  return (
    <button
      className={'tpc-die ' + d.color + (small ? ' small' : '') + (onClick ? ' pickable' : '') + (className ? ' ' + className : '')}
      onClick={onClick}
      disabled={!onClick}
    >
      {d.value}
    </button>
  )
}

export function ThatsPrettyClever() {
  const { state: s, mySeat, isMyTurn, dispatch, newGame: netNew, net } = useGameSession(thatsPrettyCleverAdapter)
  const [showRules, setShowRules] = useState(false)
  const [sel, setSel] = useState<number | null>(null)          // selected die index in current roll/platter

  const me = mySeat as 0 | 1
  const foe = (me === 0 ? 1 : 0) as 0 | 1
  const over = s.winner != null

  // What to call the other player on this screen.
  const oppName = net.online ? `Player ${foe + 1}` : 'Rival'

  function newGame() { netNew(); setSel(null); setShowRules(false) }

  // My role this turn, from MY seat.
  const yourActiveTurn = !over && s.active === me
  const youArePlatter = !over && s.phase === 'platter' && s.platterPending.includes(me)
  // The opponent (whoever is not me) is acting — show their tray as read-only.
  const foeActive = !over && s.active === foe && (s.phase === 'roll' || s.phase === 'pick')
  const foePlatter = !over && s.phase === 'platter' && s.platterPending.includes(foe)
  const foeBusy = foeActive || foePlatter

  // Gate all of MY interactions on isMyTurn so a guest cannot drive a seat that is not theirs.
  const canPick = isMyTurn && yourActiveTurn && s.phase === 'pick'
  const canRoll = isMyTurn && yourActiveTurn && s.phase === 'roll'
  const canPlatter = isMyTurn && youArePlatter

  useGameKeys({
    onNew: newGame,
    onToggleRules: () => setShowRules(v => !v),
    onEscape: () => { setShowRules(false); setSel(null) },
    extra: (e) => {
      if ((e.key === ' ' || e.key === 'Enter') && canRoll) { dispatch({ kind: 'roll' }); return true }
      return false
    },
  })

  const whiteVal = G.whiteOnTable(s)

  // selected die object (in roll for active turn, in platter for platter phase)
  const selDie: Die | null = useMemo(() => {
    if (sel == null) return null
    const src = s.phase === 'platter' ? s.platter : s.roll
    return sel >= 0 && sel < src.length ? src[sel] : null
  }, [sel, s])

  function clickRollDie(i: number) {
    if (!canPick) return
    const d = s.roll[i]
    if (d.color === 'white') { setSel(i); return }      // need a colour chip next
    dispatch({ kind: 'pick', die: i }); setSel(null)
  }
  function clickPlatterDie(i: number) {
    if (!canPlatter) return
    const d = s.platter[i]
    if (d.color === 'white') { setSel(i); return }
    dispatch({ kind: 'pick', die: i }); setSel(null)
  }
  function chooseWild(c: Exclude<Color, 'white'>) {
    if (sel == null) return
    if (canPick) { dispatch({ kind: 'pick', die: sel, target: c }); setSel(null) }
    else if (canPlatter) { dispatch({ kind: 'pick', die: sel, target: c }); setSel(null) }
  }
  function roll() { if (canRoll) dispatch({ kind: 'roll' }) }
  function stopTurn() { if (canPick) { dispatch({ kind: 'done' }); setSel(null) } }

  const myTotal = G.totalScore(s.sheets[me]), foeTotal = G.totalScore(s.sheets[foe])
  const noLegal = canPick && !G.hasLegalPick(s)

  // banner — stated from MY seat
  let banner: string, bk = ''
  if (s.winner === me) { bk = 'win'; banner = `You win — ${Math.max(myTotal, foeTotal)} to ${Math.min(myTotal, foeTotal)}` }
  else if (s.winner === foe) { bk = 'lose'; banner = `${oppName} wins — ${Math.max(myTotal, foeTotal)} to ${Math.min(myTotal, foeTotal)}` }
  else if (s.winner === 'draw') { bk = ''; banner = `A tie — ${myTotal}–${foeTotal}` }
  else if (canRoll) { bk = 'you'; banner = `Your turn — roll (${s.picksLeft} pick${s.picksLeft === 1 ? '' : 's'} left)` }
  else if (canPick) { bk = 'you'; banner = selDie?.color === 'white' ? 'White die — choose a colour track' : noLegal ? 'No legal die — end your turn' : 'Pick a die into its colour track' }
  else if (canPlatter) { bk = 'you'; banner = selDie?.color === 'white' ? 'White from the platter — choose a colour' : 'Take ONE die from the silver platter' }
  else if (yourActiveTurn || youArePlatter) { bk = 'you'; banner = 'Waiting…' }
  else if (foeBusy) { bk = 'foe'; banner = foePlatter ? `${oppName} is taking a platter die…` : `${oppName} is rolling & picking…` }
  else { bk = 'foe'; banner = `${oppName} is thinking…` }

  return (
    <>
      <GameShell
        mark={TITLE_MARK}
        eyebrow="Ganz schön clever · roll &amp; write"
        title="That's Pretty Clever!"
        subtitle="grab a die, send the lower ones to the platter — fill five colour tracks"
        onRules={() => setShowRules(true)}
        onNew={newGame}
        modeLeft={`Round ${Math.min(s.round, s.rounds)} / ${s.rounds}`}
        banner={banner}
        bannerClass={bk}
        modeRight={<>space · roll &nbsp; N · new &nbsp; ? · rules</>}
      >
        <div className="tpc-main">
          {/* dice tray */}
          <div className="tpc-tray">
            <div className="tpc-tray-head">
              <span className="tpc-tray-title">{yourActiveTurn ? 'Your tray' : `${oppName}’s tray`}</span>
              <span className="tpc-tray-sub">{whiteVal != null ? `white = ${whiteVal} (adds to blue)` : 'roll to begin'}</span>
              <span className="tpc-picks">{(yourActiveTurn || foeActive) && !over ? `${s.picksLeft} pick${s.picksLeft === 1 ? '' : 's'} left` : ''}</span>
            </div>

            <div className="tpc-dicerow">
              {s.roll.length === 0
                ? <span className="tpc-hint">{s.phase === 'platter' ? 'Turn over — platter below.' : 'No dice on the table.'}</span>
                : s.roll.map((d, i) => (
                  <DieView
                    key={i}
                    d={d}
                    className={sel === i ? 'selected' : ''}
                    onClick={canPick ? () => clickRollDie(i) : undefined}
                  />
                ))}
            </div>

            {/* white wild colour chooser */}
            {selDie?.color === 'white' && (
              <div className="tpc-wild">
                <span className="tpc-wild-l">use white ({selDie.value}) as:</span>
                {G.TRACK_COLORS.map(c => {
                  const sheet = s.sheets[me]
                  const ok = G.canPlace(sheet, 'white', c, selDie.value, null)
                  return <button key={c} className={'tpc-chip ' + c} disabled={!ok} onClick={() => chooseWild(c)}>{c}</button>
                })}
              </div>
            )}

            {/* silver platter */}
            <div className="tpc-platter-wrap">
              <span className="tpc-platter-l">silver platter (set aside · opponents take one)</span>
              <div className={'tpc-platter' + (s.platter.length === 0 ? ' empty' : '')}>
                {s.platter.length === 0
                  ? <span className="tpc-hint">empty</span>
                  : s.platter.map((d, i) => (
                    <DieView
                      key={i}
                      d={d}
                      small
                      className={(canPlatter && sel === i ? 'selected' : '') + (!canPlatter ? ' dim' : '')}
                      onClick={canPlatter ? () => clickPlatterDie(i) : undefined}
                    />
                  ))}
              </div>
            </div>

            <div className="tpc-actions">
              {canRoll && <button className="tpc-btn primary" onClick={roll}>Roll dice</button>}
              {canPick && <button className="tpc-btn warn" onClick={stopTurn}>End turn</button>}
            </div>
          </div>

          {/* sheets — my sheet first */}
          <div className="tpc-sheets">
            {([me, foe] as (0 | 1)[]).map(pi => (
              <SheetView
                key={pi}
                sheet={s.sheets[pi]}
                name={pi === me ? 'You' : oppName}
                active={s.active === pi && !over}
              />
            ))}
          </div>
        </div>

        <div className="side">
          <div className="panel tpc-scorebox">
            <div className={'tpc-score' + (s.active === me && !over ? ' on' : '')}>
              <span className="tpc-score-name">You</span>
              <span className="tpc-score-fox">{G.foxCount(s.sheets[me])}🦊</span>
              <span className="tpc-score-n">{myTotal}</span>
            </div>
            <div className={'tpc-score' + (s.active === foe && !over ? ' on' : '')}>
              <span className="tpc-score-name">{oppName}</span>
              <span className="tpc-score-fox">{G.foxCount(s.sheets[foe])}🦊</span>
              <span className="tpc-score-n">{foeTotal}</span>
            </div>
            <div className="tpc-hint">Foxes 🦊 multiply your <b>lowest</b> track at the end.</div>
          </div>
          <OnlineBar net={net} />
          <div className="panel logbox">
            {s.log.slice().reverse().map((l, i) => <div key={i} className={'log-line ' + l.t}>{l.x}</div>)}
          </div>
        </div>
      </GameShell>

      {over && <ResultModal won={s.winner === me} draw={s.winner === 'draw'} myTotal={myTotal} foeTotal={foeTotal} oppName={oppName} onNew={newGame} />}
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </>
  )
}

function SheetView({ sheet, name, active }: { sheet: G.Sheet; name: string; active: boolean }) {
  const ts = G.trackScores(sheet)
  return (
    <div className={'tpc-sheet' + (active ? ' active' : '')}>
      <div className="tpc-sheet-head">
        <span className="tpc-sheet-name">{name}</span>
        <span className="tpc-sheet-foxes">{G.foxCount(sheet)}🦊</span>
        <span className="tpc-sheet-score">{G.totalScore(sheet)}</span>
      </div>

      {/* yellow 4x4 */}
      <div className="tpc-track">
        <span className="tpc-track-lbl yellow">{TRACK_LETTER.yellow}</span>
        <div className="tpc-grid yellow">
          {sheet.yellow.cells.map((on, i) => {
            const r = (i / G.YELLOW_COLS) | 0, c = i % G.YELLOW_COLS
            return <span key={i} className={'tpc-cell yellow' + (on ? ' on' : '') + (r === c ? ' diag' : '')}>{G.YELLOW_VALUES[i]}</span>
          })}
        </div>
        <span className="tpc-track-score">{ts.yellow}</span>
      </div>

      {/* blue 3x3 */}
      <div className="tpc-track">
        <span className="tpc-track-lbl blue">{TRACK_LETTER.blue}</span>
        <div className="tpc-grid blue">
          {sheet.blue.cells.map((on, i) => (
            <span key={i} className={'tpc-cell blue' + (on ? ' on' : '')}>{G.BLUE_VALUES[i]}</span>
          ))}
        </div>
        <span className="tpc-track-score">{ts.blue}</span>
      </div>

      {/* green linear */}
      <div className="tpc-track">
        <span className="tpc-track-lbl green">{TRACK_LETTER.green}</span>
        <div className="tpc-line">
          {Array.from({ length: G.GREEN_LEN }, (_, i) => (
            <span key={i} className={'tpc-pip green' + (i < sheet.green.count ? ' on' : '')}>{i < sheet.green.count ? '✓' : '≥' + G.GREEN_THRESH[i]}</span>
          ))}
        </div>
        <span className="tpc-track-score">{ts.green}</span>
      </div>

      {/* orange linear with multipliers */}
      <div className="tpc-track">
        <span className="tpc-track-lbl orange">{TRACK_LETTER.orange}</span>
        <div className="tpc-line">
          {sheet.orange.values.map((v, i) => (
            <span key={i} className={'tpc-pip orange' + (v != null ? ' on' : '') + (G.ORANGE_MULT[i] > 1 ? ' mult' : '')}>
              {v != null ? v : (G.ORANGE_MULT[i] > 1 ? '×' + G.ORANGE_MULT[i] : '·')}
            </span>
          ))}
        </div>
        <span className="tpc-track-score">{ts.orange}</span>
      </div>

      {/* purple linear */}
      <div className="tpc-track">
        <span className="tpc-track-lbl purple">{TRACK_LETTER.purple}</span>
        <div className="tpc-line">
          {Array.from({ length: G.PURPLE_LEN }, (_, i) => {
            const v = sheet.purple.values[i]
            return <span key={i} className={'tpc-pip purple' + (v != null ? ' on' : '')}>{v != null ? v : '·'}</span>
          })}
        </div>
        <span className="tpc-track-score">{ts.purple}</span>
      </div>
    </div>
  )
}

function ResultModal({ won, draw, myTotal, foeTotal, oppName, onNew }: { won: boolean; draw: boolean; myTotal: number; foeTotal: number; oppName: string; onNew: () => void }) {
  return (
    <Modal
      eyebrow={draw ? 'Dead even' : won ? 'Pretty clever!' : 'Out-played'}
      title={draw ? 'A Tie' : won ? 'You Win' : `${oppName} Wins`}
      closeOnOverlay={false}
      actions={<button className="btn-modal" onClick={onNew}>Play again</button>}
    >
      <div className="finalsc"><span className="you">You {myTotal}</span><span className="foe">{oppName} {foeTotal}</span></div>
    </Modal>
  )
}

function RulesModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal eyebrow="How to play" title="That's Pretty Clever!" onClose={onClose}
      actions={<button className="btn-modal" onClick={onClose}>Begin</button>}>
      <div className="modal-body">
        <p>On <b>your</b> turn you get <b>3 picks</b>. Each pick: roll all unused dice, choose <b>one</b> die and place it on its matching colour track. Then <b>every die showing a lower value</b> is set aside on the <b>silver platter</b> (gone for this turn); re-roll the rest and pick again.</p>
        <p>The <b>white</b> die is a <b>wildcard</b> — use it as any colour. The white value also adds to your <b>blue</b> sum.</p>
        <p>After your 3 picks, the <b>opponent takes one die from the platter</b> for a single placement (and vice-versa on their turn).</p>
        <p><b>Tracks:</b> <b>Yellow</b> 4×4 grid (full columns score, the diagonal grants a fox) · <b>Blue</b> 3×3 grid filled by white+blue · <b>Green</b> rising threshold, further = more points · <b>Orange</b> write the value, some cells ×2/×3 · <b>Purple</b> each value must beat the last (a 6 resets it). <b>Foxes 🦊</b> multiply your lowest-scoring track at the end.</p>
        <p>Play <b>6 rounds</b>; highest total wins. <b>Keys:</b> <kbd>Space</kbd> roll · <kbd>N</kbd> new · <kbd>?</kbd> rules · <kbd>Esc</kbd> close.</p>
      </div>
    </Modal>
  )
}
