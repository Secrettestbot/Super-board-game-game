/* RUMMIKUB — UI. You vs a greedy AI (solo) or a remote human (online) on a felt table of
   melds. Your sorted rack sits below; select tiles to FORM a new meld or EXTEND a table meld,
   then Play. Or Draw. Online play is host-authoritative via useGameSession(rummikubAdapter):
   the AI fills any empty seat, and the view is redacted per seat so you never see the other
   rack or the bag. Seat-relative: "your" rack is racks[mySeat], the opponent is the other seat. */

import { useEffect, useRef, useState } from 'react'
import { GameShell } from '../../framework/GameShell'
import { Modal } from '../../framework/Modal'
import { useGameKeys } from '../../framework/useGameKeys'
import { OnlineBar } from '../../framework/OnlineBar'
import { useGameSession } from '../../net/useGameSession'
import { rummikubAdapter } from './net'
import * as R from './logic'
import type { State, Tile, Meld } from './logic'

const TITLE_MARK = (
  <svg className="title-mark" viewBox="0 0 48 48" aria-hidden="true">
    <rect x="3" y="3" width="42" height="42" rx="10" fill="#161b26" stroke="#2c3650" strokeWidth="1.5" />
    <rect x="9" y="13" width="11" height="16" rx="2.5" fill="#f3efe4" stroke="#c9b487" strokeWidth="1" />
    <rect x="20.5" y="13" width="11" height="16" rx="2.5" fill="#f3efe4" stroke="#c9b487" strokeWidth="1" />
    <rect x="32" y="13" width="7" height="16" rx="2.5" fill="#f3efe4" stroke="#c9b487" strokeWidth="1" transform="rotate(9 35 21)" />
    <text x="14.5" y="25" fontFamily="JetBrains Mono, monospace" fontSize="9" fontWeight="700" fill="#cf4b40" textAnchor="middle">7</text>
    <text x="26" y="25" fontFamily="JetBrains Mono, monospace" fontSize="9" fontWeight="700" fill="#3f7fd0" textAnchor="middle">8</text>
    <text x="35.5" y="25" fontFamily="JetBrains Mono, monospace" fontSize="9" fontWeight="700" fill="#1f2733" textAnchor="middle" transform="rotate(9 35.5 21)">9</text>
  </svg>
)

const COLOR_CLASS: Record<string, string> = {
  red: 'c-red', blue: 'c-blue', orange: 'c-orange', black: 'c-black', joker: 'c-joker',
}

function TileView({
  tile, selected, dim, onClick, small,
}: {
  tile: Tile
  selected?: boolean
  dim?: boolean
  onClick?: () => void
  small?: boolean
}) {
  const cls = [
    'rk-tile',
    COLOR_CLASS[tile.color],
    small ? 'small' : '',
    selected ? 'sel' : '',
    dim ? 'dim' : '',
    onClick ? 'click' : '',
  ].filter(Boolean).join(' ')
  return (
    <div className={cls} onClick={onClick}>
      {tile.joker ? <span className="rk-joker">★</span> : <span className="rk-num">{tile.num}</span>}
    </div>
  )
}

/** Sort a rack: jokers last; otherwise by color then number. */
function sortRack(rack: Tile[]): Tile[] {
  const order: Record<string, number> = { red: 0, blue: 1, orange: 2, black: 3, joker: 4 }
  return rack.slice().sort((a, b) => {
    if (a.joker !== b.joker) return a.joker ? 1 : -1
    if (a.color !== b.color) return order[a.color] - order[b.color]
    return a.num - b.num
  })
}

export function Rummikub() {
  const { state: s, mySeat, isMyTurn, dispatch, newGame: netNew, net } = useGameSession(rummikubAdapter)
  const oppSeat = mySeat === 0 ? 1 : 0
  const [showRules, setShowRules] = useState(false)
  const [sel, setSel] = useState<Set<number>>(new Set())       // selected rack tile ids
  const [target, setTarget] = useState<number | null>(null)    // table meld index to extend (null = new meld)
  const logRef = useRef<HTMLDivElement>(null)

  function newGame() { netNew(); setSel(new Set()); setTarget(null); setShowRules(false) }

  useEffect(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight }, [s.log])

  const over = s.winner != null
  const yourTurn = !over && isMyTurn

  // Labels: a remote human is "Opponent"; the AI is "AI". You are "You" / "Player N" online.
  const oppLabel = net.online ? 'Opponent' : 'AI'
  const youLabel = net.online ? `Player ${mySeat + 1}` : 'You'

  useGameKeys({
    onNew: newGame,
    onToggleRules: () => setShowRules((v) => !v),
    onEscape: () => { setShowRules(false); setSel(new Set()); setTarget(null) },
    extra: (e) => {
      if (!yourTurn) return false
      if (e.key === 'd' || e.key === 'D') { doDraw(); return true }
      if (e.key === 'p' || e.key === 'P') { doPlay(); return true }
      return false
    },
  })

  function toggleSel(id: number) {
    if (!yourTurn) return
    setSel((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const myRack = s.racks[mySeat]
  const selTiles = (): Tile[] => myRack.filter((t) => sel.has(t.id))

  // Build the candidate play for the current selection + target.
  function buildPlay(): { table: Meld[]; used: number[]; ok: boolean; reason: string } {
    const chosen = selTiles()
    if (chosen.length === 0) return { table: s.table, used: [], ok: false, reason: 'Select tiles from your rack.' }

    let newTable: Meld[]
    if (target == null) {
      // form a NEW meld from the selection
      newTable = [...s.table.map((m) => m.slice()), chosen.slice()]
    } else {
      // extend an existing meld: merge selection into table meld `target`, re-sort runs
      newTable = s.table.map((m, i) => (i === target ? mergeIntoMeld(m, chosen) : m.slice()))
    }
    const used = chosen.map((t) => t.id)
    // validate via engine dry-run
    const res = R.play(s, mySeat as R.Player, newTable, used)
    if (!res) {
      let reason = 'That is not a legal play.'
      if (!R.isValidTable(newTable)) reason = 'Those tiles do not form valid melds.'
      else if (!s.hasMelded[mySeat]) reason = `Your first play must total ${R.INITIAL_MIN}+ from new tiles.`
      return { table: newTable, used, ok: false, reason }
    }
    return { table: newTable, used, ok: true, reason: '' }
  }

  function doPlay() {
    if (!yourTurn) return
    const p = buildPlay()
    if (!p.ok) return
    dispatch({ kind: 'play', table: p.table, used: p.used })
    setSel(new Set()); setTarget(null)
  }

  function doDraw() {
    if (!yourTurn) return
    dispatch({ kind: 'draw' })
    setSel(new Set())
    setTarget(null)
  }

  const preview = yourTurn ? buildPlay() : { ok: false, reason: '' }
  const selScore = R.tableScore(sel.size ? [selTiles()] : [])

  // banner — relative to mySeat
  let banner = '', bk = ''
  if (s.winner === mySeat) { bk = 'win'; banner = 'You emptied your rack — you win!' }
  else if (s.winner === oppSeat) { bk = 'lose'; banner = `${oppLabel} emptied their rack first.` }
  else if (yourTurn) { bk = 'you'; banner = s.hasMelded[mySeat] ? 'Your turn — form melds, extend, or draw' : `Your turn — first play needs ${R.INITIAL_MIN}+ points` }
  else { bk = 'foe'; banner = net.online ? `${oppLabel} is taking their turn…` : 'The AI is taking its turn…' }

  const rack = sortRack(myRack)

  return (
    <>
      <GameShell
        mark={TITLE_MARK}
        eyebrow="Rummikub · tile rummy"
        title="Rummikub"
        subtitle="lay your numbered tiles into groups and runs, race to empty your rack before your opponent — but your first play must total thirty"
        onRules={() => setShowRules(true)}
        onNew={newGame}
        modeLeft={<>{youLabel} <b className="rk-cnt">{myRack.length}</b> · {oppLabel} <b className="rk-cnt">{s.racks[oppSeat].length}</b> · Bag <b className="rk-cnt">{s.bag.length}</b></>}
        banner={banner}
        bannerClass={bk}
        modeRight={<>P · play &nbsp; D · draw &nbsp; N · new</>}
      >
        <div className="rk-table">
          <div className="rk-foe-bar">
            <span className="rk-dot foe" /> {oppLabel}
            <span className="rk-meta">{s.racks[oppSeat].length} tiles{s.hasMelded[oppSeat] ? '' : ' · not melded'}</span>
            <span className="rk-foe-tiles">
              {s.racks[oppSeat].map((t) => <span key={t.id} className="rk-backtile" />)}
            </span>
          </div>

          <div className="rk-board">
            <div className="rk-board-label">Table · {s.table.length} meld{s.table.length === 1 ? '' : 's'}</div>
            {s.table.length === 0 ? (
              <div className="rk-empty-board">No melds yet. Build one from your rack.</div>
            ) : (
              <div className="rk-melds">
                {s.table.map((m, i) => {
                  const isTarget = target === i
                  const kind = meldKind(m)
                  return (
                    <div
                      key={i}
                      className={'rk-meld' + (isTarget ? ' target' : '') + (yourTurn ? ' click' : '')}
                      onClick={yourTurn ? () => setTarget(isTarget ? null : i) : undefined}
                      title={yourTurn ? 'Click to extend this meld with selected tiles' : undefined}
                    >
                      {m.map((t) => <TileView key={t.id} tile={t} small />)}
                      <span className="rk-meld-tag">{kind}</span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          <div className="rk-you-bar">
            <span className="rk-dot you" /> Your rack
            <span className="rk-meta">{myRack.length} tiles{s.hasMelded[mySeat] ? '' : ' · not melded'}</span>
          </div>
          <div className="rk-rack">
            {rack.map((t) => (
              <TileView
                key={t.id}
                tile={t}
                selected={sel.has(t.id)}
                onClick={yourTurn ? () => toggleSel(t.id) : undefined}
              />
            ))}
          </div>
        </div>

        <div className="side">
          <OnlineBar net={net} />

          <div className="panel rk-control">
            <div className="rk-mode">
              <div className={'rk-modeline' + (target == null ? ' on' : '')}>
                {target == null ? '◆' : '◇'} Forming a <b>new meld</b>
              </div>
              <div className={'rk-modeline' + (target != null ? ' on' : '')}>
                {target != null ? '◆' : '◇'} {target != null ? <>Extending <b>meld {target + 1}</b></> : 'Click a table meld to extend it'}
              </div>
            </div>

            <div className="rk-selinfo">
              <span>Selected: <b>{sel.size}</b></span>
              {sel.size > 0 && <span className="rk-selsc">{selScore} pts</span>}
            </div>

            <div className="rk-hint">
              {yourTurn
                ? (sel.size === 0
                    ? 'Tap rack tiles to select them.'
                    : preview.ok
                      ? <span className="ok">Legal play — go!</span>
                      : <span className="warn">{preview.reason}</span>)
                : net.online ? `Waiting for ${oppLabel.toLowerCase()}…` : 'Waiting for the AI…'}
            </div>

            <div className="rk-btnrow">
              <button className="rk-btn primary" disabled={!yourTurn || !preview.ok} onClick={doPlay}>Play</button>
              <button className="rk-btn" disabled={!yourTurn} onClick={doDraw}>Draw</button>
            </div>
            {sel.size > 0 && (
              <button className="rk-btn ghost wide" onClick={() => { setSel(new Set()); setTarget(null) }}>Clear selection</button>
            )}
          </div>

          <div className="panel logbox" ref={logRef}>
            {s.log.map((l, i) => <div key={i} className={'log-line ' + l.t}>{l.x}</div>)}
          </div>
        </div>
      </GameShell>

      {over && (
        <ResultModal s={s} mySeat={mySeat} oppLabel={oppLabel} onNew={newGame} />
      )}
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </>
  )
}

/** Merge selected rack tiles into a table meld and re-sort if it's a run. */
function mergeIntoMeld(meld: Meld, add: Tile[]): Meld {
  const combined = [...meld, ...add]
  // if it looks like a run (same color among reals), sort by number with jokers placed in gaps
  const reals = combined.filter((t) => !t.joker)
  const sameColor = reals.length > 0 && reals.every((t) => t.color === reals[0].color)
  if (sameColor) {
    // sort reals ascending; jokers appended (engine validates via span anyway)
    const sortedReals = reals.slice().sort((a, b) => a.num - b.num)
    const jokers = combined.filter((t) => t.joker)
    return [...sortedReals, ...jokers]
  }
  return combined
}

function meldKind(m: Meld): string {
  const reals = m.filter((t) => !t.joker)
  if (reals.length === 0) return ''
  const sameNum = reals.every((t) => t.num === reals[0].num)
  if (sameNum && reals.length >= 1) {
    const distinctColors = new Set(reals.map((t) => t.color)).size === reals.length
    if (distinctColors) return 'group'
  }
  return 'run'
}

function ResultModal({ s, mySeat, oppLabel, onNew }: { s: State; mySeat: number; oppLabel: string; onNew: () => void }) {
  const youWin = s.winner === mySeat
  const r = s.result
  const oppSeat = mySeat === 0 ? 1 : 0
  // result.youCount/aiCount are seat-0/seat-1; map to mySeat perspective.
  const myCount = r ? (mySeat === 0 ? r.youCount : r.aiCount) : s.racks[mySeat].length
  const oppCount = r ? (oppSeat === 0 ? r.youCount : r.aiCount) : s.racks[oppSeat].length
  return (
    <Modal
      eyebrow={youWin ? 'Rack cleared' : 'Outpaced'}
      title={youWin ? 'You Win!' : `${oppLabel} Wins`}
      closeOnOverlay={false}
      actions={<button className="btn-modal" onClick={onNew}>Play again</button>}
    >
      <div className="modal-body">
        <div className="rk-result-grid">
          <div className="rk-rcol">
            <div className="rk-rname you">You</div>
            <div className="rk-rdead">{myCount} tiles left</div>
          </div>
          <div className="rk-rvs">{youWin ? '✓' : '✕'}</div>
          <div className="rk-rcol">
            <div className="rk-rname foe">{oppLabel}</div>
            <div className="rk-rdead">{oppCount} tiles left</div>
          </div>
        </div>
        {r?.kind === 'bag-empty' && (
          <div className="rk-rnote">Bag emptied with no plays left — fewest tiles wins.</div>
        )}
      </div>
    </Modal>
  )
}

function RulesModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal eyebrow="How to play" title="Rummikub" onClose={onClose}
      actions={<button className="btn-modal" onClick={onClose}>Deal me in</button>}>
      <div className="modal-body">
        <p>You and your opponent each hold <b>14 tiles</b>. On your turn, lay tiles onto the table or <b>draw</b> one.</p>
        <p>A valid <b>meld</b> is a <i>group</i> (3–4 tiles of the <b>same number</b>, all <b>different colors</b>) or a <i>run</i> (3+ <b>consecutive</b> numbers in one <b>color</b>). <b>Jokers</b> (★) substitute for any tile.</p>
        <p>Your <b>first play</b> must total at least <b>30 points</b> from tiles off your own rack (jokers count as the tile they stand for). After that you may form new melds or <b>extend</b> existing ones — click a table meld to target it.</p>
        <p>First to <b>empty their rack</b> wins. If the bag runs out and nobody can play, the smaller rack wins.</p>
        <p><b>Online:</b> host a game and share the code, or paste a code to join — your opponent fills the second seat; any empty seat is played by the AI.</p>
        <p><b>Keys:</b> click tiles to select · click a meld to extend · <kbd>P</kbd> play · <kbd>D</kbd> draw · <kbd>N</kbd> new · <kbd>?</kbd> rules · <kbd>Esc</kbd> clear.</p>
      </div>
    </Modal>
  )
}
