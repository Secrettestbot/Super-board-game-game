/* ZÈRTZ — UI (built for this codebase). The shrinking hex ring-board with neutral
   marbles, a forced capture-jump flow, a place-then-remove flow, the shared colour
   supply, and both players' captured sets. Seat-relative: you play `mySeat` (0 local,
   0 or 1 online); the other seat is the AI (solo) or a remote opponent (online).
   useGameSession drives AI for empty seats and syncs online play. */

import { useEffect, useRef, useState } from 'react'
import { GameShell } from '../../framework/GameShell'
import { Modal } from '../../framework/Modal'
import { useGameKeys } from '../../framework/useGameKeys'
import { OnlineBar } from '../../framework/OnlineBar'
import { useGameSession } from '../../net/useGameSession'
import { zertzAdapter } from './net'
import * as Z from './logic'
import type { ZertzState, Color, Player, Jump, Key } from './logic'

const TITLE_MARK = (
  <svg className="title-mark" viewBox="0 0 48 48" aria-hidden="true">
    <rect x="3" y="3" width="42" height="42" rx="11" fill="#1a242e" stroke="#36495a" strokeWidth="1.5" />
    <circle cx="18" cy="16" r="6" fill="none" stroke="#34d8c0" strokeWidth="2" />
    <circle cx="30" cy="16" r="6" fill="none" stroke="#3d5666" strokeWidth="2" />
    <circle cx="24" cy="27" r="6" fill="none" stroke="#3d5666" strokeWidth="2" />
    <circle cx="18" cy="16" r="2.6" fill="#f3f1ea" />
    <circle cx="30" cy="16" r="2.6" fill="#8b97a0" />
    <circle cx="24" cy="33.5" r="3.4" fill="#1c2228" stroke="#3a444d" strokeWidth="0.8" />
  </svg>
)

// Pixel layout for an axial hex (flat board, pointy-top spaces).
const HEXR = 30                       // ring radius in svg units
const GAP = 2
const SPACING = HEXR * 2 + GAP
function pixel(q: number, r: number): { x: number; y: number } {
  const x = SPACING * (q + r / 2)
  const y = SPACING * (r * Math.sqrt(3) / 2)
  return { x, y }
}

interface Pending { color: Color; place: Key }

export function Zertz() {
  const { state: s, mySeat, isMyTurn, dispatch, newGame: netNew, net } = useGameSession(zertzAdapter)
  const me = mySeat as Player          // seat 0/1 == player 0/1
  const opp: Player = me === 0 ? 1 : 0
  const oppName = net.online ? 'Opponent' : 'Rival'

  const [showRules, setShowRules] = useState(false)
  const [pickColor, setPickColor] = useState<Color>('w')
  const [pending, setPending] = useState<Pending | null>(null)  // placed, awaiting ring removal
  const [jumpSrc, setJumpSrc] = useState<Key | null>(null)      // chosen jumping marble
  const logRef = useRef<HTMLDivElement>(null)

  function newGame() {
    netNew(); setShowRules(false); setPending(null); setJumpSrc(null); setPickColor('w')
  }

  const yourTurn = s.winner == null && isMyTurn
  const forced = yourTurn && Z.mustCapture(s)

  // keep a valid pick color
  useEffect(() => {
    const avail = Z.availableColors(s)
    if (avail.length && !avail.includes(pickColor)) setPickColor(avail[0])
  }, [s, pickColor])

  // clear stale interaction when it stops being our turn (e.g. opponent's view sync)
  useEffect(() => {
    if (!yourTurn) { setPending(null); setJumpSrc(null) }
  }, [yourTurn])

  useEffect(() => { if (logRef.current) logRef.current.scrollTop = 0 }, [s.log])

  useGameKeys({
    onNew: newGame,
    onToggleRules: () => setShowRules(v => !v),
    onEscape: () => { setPending(null); setJumpSrc(null); setShowRules(false) },
  })

  // ----- interaction helpers -----
  const captures = forced ? Z.legalCaptures(s, me) : []
  const jumpSources = new Set(captures.map(j => j.from))
  const activeJumps = jumpSrc != null ? Z.jumpsFrom(s, jumpSrc) : []
  const jumpDsts = new Map<Key, Jump>()  // landing space -> the jump
  for (const j of activeJumps) jumpDsts.set(j.to, j)

  const removablesNow = (() => {
    if (!pending) return new Set<Key>()
    // recompute removables on the board AFTER the pending placement
    const tmp: ZertzState = { ...s, board: { ...s.board, [pending.place]: pending.color } }
    return new Set(Z.removableCells(tmp))
  })()
  const canRemoveAny = pending != null && removablesNow.size > 0

  function clickSpace(k: Key) {
    if (!yourTurn) return
    // --- capture phase ---
    if (forced) {
      if (jumpSrc == null) {
        if (jumpSources.has(k)) setJumpSrc(k)
        return
      }
      // choosing a landing space for the current jumping marble
      const j = jumpDsts.get(k)
      if (j) {
        // dispatch ONE leap; the adapter keeps the turn here if the chain continues.
        dispatch({ kind: 'capture', from: j.from, to: j.to })
        // continue the chain on the same marble if more jumps remain after this leap
        const after = Z.applyCapture(s, [j])
        if (after.winner == null && Z.jumpsFrom(after, j.to).length > 0) setJumpSrc(j.to)
        else setJumpSrc(null)
        return
      }
      // re-pick a different source marble
      if (jumpSources.has(k)) setJumpSrc(k)
      return
    }

    // --- place + remove phase ---
    if (pending == null) {
      // place: empty live space
      if (s.board[k] == null && Z.onBoard(s, k)) {
        if (s.supply[pickColor] <= 0) return
        // if no ring can be removed after placing, resolve immediately (place-only)
        const tmp: ZertzState = { ...s, board: { ...s.board, [k]: pickColor } }
        if (Z.removableCells(tmp).length === 0) {
          dispatch({ kind: 'placeRemove', color: pickColor, place: k, remove: null })
        } else {
          setPending({ color: pickColor, place: k })
        }
      }
      return
    }
    // remove: a free edge ring (after the pending placement)
    if (k === pending.place) return
    if (removablesNow.has(k)) {
      dispatch({ kind: 'placeRemove', color: pending.color, place: pending.place, remove: k })
      setPending(null)
    }
  }

  function cancelPending() { setPending(null) }
  function cancelJump() { setJumpSrc(null) }

  // ----- banner -----
  let banner: string, bk = ''
  if (s.winner === me) { bk = 'win'; banner = 'You win — your captured set is complete!' }
  else if (s.winner != null) { bk = 'lose'; banner = `${oppName} completed a set first` }
  else if (yourTurn) {
    bk = 'you'
    if (forced) banner = jumpSrc == null ? 'A jump is open — you MUST capture. Pick a glowing marble.' : 'Choose a landing space to leap.'
    else if (pending) banner = canRemoveAny ? 'Now slide a dashed edge ring off the board.' : 'No ring can be removed — placing only.'
    else banner = 'Place a marble, then remove an edge ring.'
  } else { bk = 'foe'; banner = net.online ? 'Waiting for the opponent…' : 'The rival is plotting…' }

  // ----- render board -----
  const cells = Z.allCells()
  const pts = cells.map(c => ({ ...c, ...pixel(c.q, c.r) }))
  const xs = pts.map(p => p.x), ys = pts.map(p => p.y)
  const minX = Math.min(...xs) - HEXR - 6, maxX = Math.max(...xs) + HEXR + 6
  const minY = Math.min(...ys) - HEXR - 6, maxY = Math.max(...ys) + HEXR + 6
  const vb = `${minX} ${minY} ${maxX - minX} ${maxY - minY}`
  const lastSet = new Set(s.last)

  function spaceClass(k: Key, removed: boolean): string {
    const cls = ['zt-space']
    if (removed) return ''
    const isEmpty = s.board[k] == null
    if (forced) {
      if (jumpSrc === k) cls.push('jump-src selectable')
      else if (jumpSrc == null && jumpSources.has(k)) cls.push('selectable jump-src')
      else if (jumpSrc != null && jumpDsts.has(k)) cls.push('jump-dst')
    } else if (pending) {
      if (removablesNow.has(k)) cls.push('remove-target')
    } else {
      if (isEmpty && yourTurn && s.supply[pickColor] > 0) cls.push('selectable')
      if (Z.isRemovable(s, k)) cls.push('removable')
    }
    if (lastSet.has(k)) cls.push('last')
    return cls.join(' ')
  }

  return (
    <>
      <GameShell
        mark={TITLE_MARK}
        eyebrow="ZÈRTZ · GIPF project"
        title="ZÈRTZ"
        subtitle="capture neutral marbles on a board that shrinks every turn — win 3 of a colour, or 1 of each"
        onRules={() => setShowRules(true)}
        onNew={newGame}
        modeLeft={<>Rings: {Z.liveCells(s).length} &nbsp;·&nbsp; You {Z.total(s.captured[me])} · {oppName} {Z.total(s.captured[opp])}</>}
        banner={banner}
        bannerClass={bk}
        modeRight={<>click · play &nbsp; Esc · cancel &nbsp; N · new</>}
      >
        <div className="zt-wrap">
          <div className="zt-board">
            <svg className="zt-svg" viewBox={vb} role="img" aria-label="ZÈRTZ board">
              <defs>
                <radialGradient id="gw" cx="35%" cy="30%"><stop offset="0%" stopColor="var(--mw-hi)" /><stop offset="55%" stopColor="var(--mw)" /><stop offset="100%" stopColor="var(--mw-d)" /></radialGradient>
                <radialGradient id="gg" cx="35%" cy="30%"><stop offset="0%" stopColor="var(--mg-hi)" /><stop offset="55%" stopColor="var(--mg)" /><stop offset="100%" stopColor="var(--mg-d)" /></radialGradient>
                <radialGradient id="gk" cx="35%" cy="30%"><stop offset="0%" stopColor="var(--mk-hi)" /><stop offset="60%" stopColor="var(--mk)" /><stop offset="100%" stopColor="var(--mk-d)" /></radialGradient>
              </defs>
              {pts.map(p => {
                const k = Z.key(p.q, p.r)
                const removed = k in s.removed
                if (removed) return null
                const marble = s.board[k]
                const cls = spaceClass(k, removed)
                return (
                  <g key={k} className={cls} onClick={() => clickSpace(k)}>
                    <circle className="zt-ring" cx={p.x} cy={p.y} r={HEXR} />
                    <circle className="zt-ring-inner" cx={p.x} cy={p.y} r={HEXR - 7} />
                    {pending && pending.place === k && (
                      <circle className={'zt-marble ' + pending.color} cx={p.x} cy={p.y} r={HEXR - 11} opacity={0.85} />
                    )}
                    {marble != null && (
                      <>
                        <circle className={'zt-marble ' + marble} cx={p.x} cy={p.y} r={HEXR - 11} />
                        <ellipse className="zt-mh" cx={p.x - 5} cy={p.y - 6} rx={5} ry={3.2} />
                      </>
                    )}
                  </g>
                )
              })}
            </svg>
          </div>
        </div>

        <div className="side">
          <div className="panel">
            <OnlineBar net={net} />
          </div>

          <div className="panel">
            <div className="panel-l">marble supply · click to pick</div>
            <div className="zt-supply">
              {Z.COLORS.map(c => {
                const avail = s.supply[c] > 0
                const on = pickColor === c
                const interactive = yourTurn && !forced && !pending
                return (
                  <div key={c}
                    className={'zt-srow' + (interactive ? ' pick' : '') + (on ? ' on' : '') + (interactive && !avail ? ' dim' : '')}
                    onClick={interactive && avail ? () => setPickColor(c) : undefined}>
                    <span className={'zt-chip ' + c} />
                    <span className="zt-clabel">{Z.colorName(c)}</span>
                    <span className="zt-ccount">{s.supply[c]}</span>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="panel">
            <div className="panel-l">captured sets · 3-of-a-colour or 1-of-each wins</div>
            <div className="zt-scores">
              <PlayerSet label="You" who="you" on={yourTurn} c={s.captured[me]} />
              <PlayerSet label={oppName} who="foe" on={s.winner == null && !isMyTurn} c={s.captured[opp]} />
            </div>
          </div>

          <div className="panel zt-control">
            <div className="panel-l">turn</div>
            {yourTurn && forced && (
              <div className="zt-step"><b>Forced capture.</b> {jumpSrc == null ? 'Click a glowing marble that can jump.' : 'Click a highlighted landing space — chains continue automatically.'}</div>
            )}
            {yourTurn && !forced && !pending && (
              <div className="zt-step">Pick a colour at left, click an empty ring to <b>place</b>. Edge rings (teal-rimmed) can be removed next.</div>
            )}
            {yourTurn && pending && (
              <div className="zt-step">{canRemoveAny ? <>Click a <b>dashed</b> edge ring to slide it off the board.</> : <>No ring is removable.</>}</div>
            )}
            {!yourTurn && s.winner == null && <div className="zt-step">{net.online ? `Waiting for ${oppName.toLowerCase()}…` : 'Watching the rival…'}</div>}
            {s.winner != null && <div className="zt-step">{s.winner === me ? 'You completed a set.' : `${oppName} completed a set.`}</div>}

            <div className="zt-btnrow">
              {pending && <button className="zt-btn" onClick={cancelPending}>Undo place</button>}
              {forced && jumpSrc != null && <button className="zt-btn" onClick={cancelJump}>Pick other</button>}
              {pending && !canRemoveAny && <button className="zt-btn go" onClick={() => { dispatch({ kind: 'placeRemove', color: pending.color, place: pending.place, remove: null }); setPending(null) }}>Confirm place</button>}
            </div>
          </div>

          <div className="panel logbox" ref={logRef}>
            {s.log.slice().reverse().map((l, i) => <div key={i} className={'log-line ' + l.t}>{l.x}</div>)}
          </div>
        </div>
      </GameShell>

      {s.winner != null && <ResultModal won={s.winner === me} oppName={oppName} onNew={newGame} />}
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </>
  )
}

function PlayerSet({ label, who, on, c }: { label: string; who: 'you' | 'foe'; on: boolean; c: Z.Counts }) {
  return (
    <div className={'zt-player' + (on ? ' on' : '')}>
      <div className="zt-phead">
        <span className={'zt-pawn ' + who} />
        <span className="zt-pname">{label}</span>
      </div>
      <div className="zt-set">
        {Z.COLORS.map(col => (
          <div key={col} className="zt-setcol">
            <span className={'zt-dot ' + col} />
            <span className={'zt-num' + (c[col] > 0 ? ' has' : '')}>{c[col]}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function ResultModal({ won, oppName, onNew }: { won: boolean; oppName: string; onNew: () => void }) {
  return (
    <Modal
      eyebrow={won ? 'Set complete' : 'Outmanoeuvred'}
      title={won ? 'You Win' : `${oppName} Wins`}
      closeOnOverlay={false}
      actions={<button className="btn-modal" onClick={onNew}>Play again</button>}
    >
      <div className="finalsc">{won ? <span className="you">You captured a winning set first</span> : <span className="foe">{oppName} captured a winning set first</span>}</div>
    </Modal>
  )
}

function RulesModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal eyebrow="How to play" title="ZÈRTZ" onClose={onClose}
      actions={<button className="btn-modal" onClick={onClose}>Got it</button>}>
      <div className="modal-body">
        <p>The board is a hexagon of <b>37 rings</b>. Marbles come in <b>white, grey, black</b> from a <b>shared, neutral</b> supply — nobody owns a marble until it's captured.</p>
        <p>On your turn you do <b>one</b> of:</p>
        <p><b>Place &amp; remove</b> — put one marble of any available colour on any empty ring, then slide one <b>free edge ring</b> (an empty ring on the rim) off the board. The board shrinks each turn.</p>
        <p><b>Capture</b> — if a <b>jump</b> is available you <b>must</b> capture instead of placing. A marble leaps over an adjacent marble into the empty ring straight beyond; the jumped marble joins <b>your</b> captured pile. Jumps <b>chain</b> — keep leaping with the same marble while jumps remain.</p>
        <p><b>Isolation</b> — if removing a ring cuts off a region where <i>every</i> ring holds a marble, you capture all of those marbles.</p>
        <p><b>Win</b> by capturing a set: <b>3 of one colour</b>, or <b>1 of each</b> of the three colours.</p>
        <p><b>Keys:</b> <kbd>Esc</kbd> cancel · <kbd>N</kbd> new game · <kbd>?</kbd> rules.</p>
      </div>
    </Modal>
  )
}
