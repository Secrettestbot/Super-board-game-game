/* THAT'S PRETTY CLEVER! — UI (built for this codebase). Six chunky coloured dice on a dark
   tray, a silver platter for set-aside dice, five colour tracks per sheet. You take a 3-pick
   active turn; the AI takes its own 3-pick turns AND a single platter die on your turns. The
   AI's many sub-steps (roll, pick, pick, pick, platter) are driven by useAITurn's `tick` — a
   monotonic action counter that changes on every AI sub-action so the timer keeps re-arming. */

import { useMemo, useState } from 'react'
import { GameShell } from '../../framework/GameShell'
import { Modal } from '../../framework/Modal'
import { useAITurn } from '../../framework/useAITurn'
import { useGameKeys } from '../../framework/useGameKeys'
import * as G from './logic'
import type { State, Die, Color } from './logic'

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
  const [s, setS] = useState<State>(() => G.makeGame())
  const [showRules, setShowRules] = useState(false)
  const [sel, setSel] = useState<number | null>(null)          // selected die index in current roll/platter
  const [aiActs, setAiActs] = useState(0)                       // monotonic AI action counter (the tick)

  function newGame() { setS(G.makeGame()); setSel(null); setShowRules(false); setAiActs(0) }

  const ai = (s.you === 0 ? 1 : 0) as 0 | 1
  const yourActiveTurn = s.winner == null && s.active === s.you
  const youArePlatter = s.winner == null && s.phase === 'platter' && s.platterPending.includes(s.you)
  const aiActiveStep = s.winner == null && s.active === ai && (s.phase === 'roll' || s.phase === 'pick')
  const aiPlatterStep = s.winner == null && s.phase === 'platter' && s.platterPending.includes(ai)
  const aiBusy = aiActiveStep || aiPlatterStep

  // ONE scheduled AI sub-action. Returns true-ish progress via the action counter so the tick
  // changes and re-arms the timer for the NEXT sub-action.
  useAITurn(aiBusy, () => {
    setS(prev => {
      if (prev.winner != null) return prev
      if (prev.active === ai && (prev.phase === 'roll' || prev.phase === 'pick')) return G.aiActiveTurn(prev)
      if (prev.phase === 'platter' && prev.platterPending.includes(ai)) return G.aiPlatterPick(prev, ai)
      return prev
    })
    setAiActs(n => n + 1)
  }, { delayMs: 480, tick: aiActs })

  useGameKeys({
    onNew: newGame,
    onToggleRules: () => setShowRules(v => !v),
    onEscape: () => { setShowRules(false); setSel(null) },
    extra: (e) => {
      if ((e.key === ' ' || e.key === 'Enter') && yourActiveTurn && s.phase === 'roll') { setS(G.rollDice(s)); return true }
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
    if (!yourActiveTurn || s.phase !== 'pick') return
    const d = s.roll[i]
    if (d.color === 'white') { setSel(i); return }      // need a colour chip next
    setS(G.pickDie(s, i)); setSel(null)
  }
  function clickPlatterDie(i: number) {
    if (!youArePlatter) return
    const d = s.platter[i]
    if (d.color === 'white') { setSel(i); return }
    setS(G.platterPick(s, s.you, i)); setSel(null)
  }
  function chooseWild(c: Exclude<Color, 'white'>) {
    if (sel == null) return
    if (s.phase === 'pick' && yourActiveTurn) { setS(G.pickDie(s, sel, c)); setSel(null) }
    else if (s.phase === 'platter' && youArePlatter) { setS(G.platterPick(s, s.you, sel, c)); setSel(null) }
  }
  function roll() { if (yourActiveTurn && s.phase === 'roll') setS(G.rollDice(s)) }
  function stopTurn() { if (yourActiveTurn && s.phase === 'pick') { setS(G.forfeitPick(s)); setSel(null) } }

  const t0 = G.totalScore(s.sheets[0]), t1 = G.totalScore(s.sheets[1])
  const noLegal = yourActiveTurn && s.phase === 'pick' && !G.hasLegalPick(s)

  // banner
  let banner: string, bk = ''
  if (s.winner === s.you) { bk = 'win'; banner = `You win — ${Math.max(t0, t1)} to ${Math.min(t0, t1)}` }
  else if (s.winner === ai) { bk = 'lose'; banner = `The rival wins — ${Math.max(t0, t1)} to ${Math.min(t0, t1)}` }
  else if (s.winner === 'draw') { bk = ''; banner = `A tie — ${t0}–${t1}` }
  else if (yourActiveTurn && s.phase === 'roll') { bk = 'you'; banner = `Your turn — roll (${s.picksLeft} pick${s.picksLeft === 1 ? '' : 's'} left)` }
  else if (yourActiveTurn && s.phase === 'pick') { bk = 'you'; banner = selDie?.color === 'white' ? 'White die — choose a colour track' : noLegal ? 'No legal die — end your turn' : 'Pick a die into its colour track' }
  else if (youArePlatter) { bk = 'you'; banner = selDie?.color === 'white' ? 'White from the platter — choose a colour' : 'Take ONE die from the silver platter' }
  else if (aiBusy) { bk = 'foe'; banner = aiPlatterStep ? 'Rival is taking a platter die…' : 'Rival is rolling & picking…' }
  else { bk = 'foe'; banner = 'Rival is thinking…' }

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
              <span className="tpc-tray-title">{yourActiveTurn ? 'Your tray' : 'Rival’s tray'}</span>
              <span className="tpc-tray-sub">{whiteVal != null ? `white = ${whiteVal} (adds to blue)` : 'roll to begin'}</span>
              <span className="tpc-picks">{(s.active === s.you || aiActiveStep) && s.winner == null ? `${s.picksLeft} pick${s.picksLeft === 1 ? '' : 's'} left` : ''}</span>
            </div>

            <div className="tpc-dicerow">
              {s.roll.length === 0
                ? <span className="tpc-hint">{s.phase === 'platter' ? 'Turn over — platter below.' : 'No dice on the table.'}</span>
                : s.roll.map((d, i) => (
                  <DieView
                    key={i}
                    d={d}
                    className={sel === i ? 'selected' : ''}
                    onClick={yourActiveTurn && s.phase === 'pick' ? () => clickRollDie(i) : undefined}
                  />
                ))}
            </div>

            {/* white wild colour chooser */}
            {selDie?.color === 'white' && (
              <div className="tpc-wild">
                <span className="tpc-wild-l">use white ({selDie.value}) as:</span>
                {G.TRACK_COLORS.map(c => {
                  const sheet = s.sheets[s.phase === 'platter' ? s.you : s.you]
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
                      className={(youArePlatter && sel === i ? 'selected' : '') + (!youArePlatter ? ' dim' : '')}
                      onClick={youArePlatter ? () => clickPlatterDie(i) : undefined}
                    />
                  ))}
              </div>
            </div>

            <div className="tpc-actions">
              {yourActiveTurn && s.phase === 'roll' && <button className="tpc-btn primary" onClick={roll}>Roll dice</button>}
              {yourActiveTurn && s.phase === 'pick' && <button className="tpc-btn warn" onClick={stopTurn}>End turn</button>}
            </div>
          </div>

          {/* sheets */}
          <div className="tpc-sheets">
            {s.sheets.map((sheet, pi) => (
              <SheetView key={pi} sheet={sheet} name={pi === s.you ? 'You' : 'Rival'} active={s.active === pi && s.winner == null} />
            ))}
          </div>
        </div>

        <div className="side">
          <div className="panel tpc-scorebox">
            <div className={'tpc-score' + (s.active === s.you && s.winner == null ? ' on' : '')}>
              <span className="tpc-score-name">You</span>
              <span className="tpc-score-fox">{G.foxCount(s.sheets[s.you])}🦊</span>
              <span className="tpc-score-n">{t0}</span>
            </div>
            <div className={'tpc-score' + (s.active === ai && s.winner == null ? ' on' : '')}>
              <span className="tpc-score-name">Rival</span>
              <span className="tpc-score-fox">{G.foxCount(s.sheets[ai])}🦊</span>
              <span className="tpc-score-n">{t1}</span>
            </div>
            <div className="tpc-hint">Foxes 🦊 multiply your <b>lowest</b> track at the end.</div>
          </div>
          <div className="panel logbox">
            {s.log.slice().reverse().map((l, i) => <div key={i} className={'log-line ' + l.t}>{l.x}</div>)}
          </div>
        </div>
      </GameShell>

      {s.winner != null && <ResultModal s={s} t0={t0} t1={t1} onNew={newGame} />}
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

function ResultModal({ s, t0, t1, onNew }: { s: State; t0: number; t1: number; onNew: () => void }) {
  const won = s.winner === s.you, draw = s.winner === 'draw'
  return (
    <Modal
      eyebrow={draw ? 'Dead even' : won ? 'Pretty clever!' : 'Out-played'}
      title={draw ? 'A Tie' : won ? 'You Win' : 'Rival Wins'}
      closeOnOverlay={false}
      actions={<button className="btn-modal" onClick={onNew}>Play again</button>}
    >
      <div className="finalsc"><span className="you">You {t0}</span><span className="foe">Rival {t1}</span></div>
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
        <p>After your 3 picks, the <b>rival takes one die from the platter</b> for a single placement (and vice-versa on their turn).</p>
        <p><b>Tracks:</b> <b>Yellow</b> 4×4 grid (full columns score, the diagonal grants a fox) · <b>Blue</b> 3×3 grid filled by white+blue · <b>Green</b> rising threshold, further = more points · <b>Orange</b> write the value, some cells ×2/×3 · <b>Purple</b> each value must beat the last (a 6 resets it). <b>Foxes 🦊</b> multiply your lowest-scoring track at the end.</p>
        <p>Play <b>6 rounds</b>; highest total wins. <b>Keys:</b> <kbd>Space</kbd> roll · <kbd>N</kbd> new · <kbd>?</kbd> rules · <kbd>Esc</kbd> close.</p>
      </div>
    </Modal>
  )
}
