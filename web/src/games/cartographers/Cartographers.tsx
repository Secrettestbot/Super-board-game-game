/* CARTOGRAPHERS — UI (built for this codebase). A roll-and-write map-drawing duel on the
   framework shell. You fill your own 11x11 map; the greedy AI fills its own beside you.
   Pick a shape option, rotate/flip it, choose an allowed terrain, then hover the board and
   click to stamp it. Two edicts score each season; highest total over 4 seasons wins.

   Online-capable via useGameSession(cartographersAdapter): the hook drives the rival seat
   (AI when local, a remote human when hosting/joining) and re-arms on the logic's tickKey.
   Everything is seat-relative — your map/score/edicts come from mySeat — so a guest plays
   seat 1 just as the host plays seat 0. The end state is shown by default. */

import { useEffect, useMemo, useState } from 'react'
import { GameShell } from '../../framework/GameShell'
import { Modal } from '../../framework/Modal'
import { OnlineBar } from '../../framework/OnlineBar'
import { useGameKeys } from '../../framework/useGameKeys'
import { useGameSession } from '../../net/useGameSession'
import { cartographersAdapter } from './net'
import * as C from './logic'
import type { State, Terrain, Shape, Cell, Edict, Player } from './logic'

const TITLE_MARK = (
  <svg className="title-mark" viewBox="0 0 48 48" aria-hidden="true">
    <rect x="3" y="3" width="42" height="42" rx="9" fill="#e9d8b0" stroke="#9c7a44" strokeWidth="1.5" />
    <path d="M7 30 Q14 22 22 28 T41 26" fill="none" stroke="#5b8a6a" strokeWidth="2.4" strokeLinecap="round" />
    <path d="M7 18 L15 10 L23 18 L17 18 L17 26 L13 26 L13 18 Z" fill="#8a6b3a" />
    <circle cx="34" cy="14" r="4.5" fill="#c98a3a" stroke="#8a5a1e" strokeWidth="1.2" />
    <path d="M34 9.5 L34 18.5 M29.5 14 L38.5 14" stroke="#5a3a14" strokeWidth="1" />
  </svg>
)

const TERRAIN_LABEL: Record<Terrain, string> = {
  forest: 'Forest', village: 'Village', farm: 'Farm', water: 'Water', monster: 'Monster',
}
const TERRAIN_GLYPH: Record<Terrain, string> = {
  forest: '🌲', village: '🏠', farm: '🌾', water: '🌊', monster: '👹',
}

function cellClass(v: Cell): string {
  if (v === '') return 'ct-cell empty'
  if (v === 'mountain') return 'ct-cell mountain'
  if (v === 'ruins') return 'ct-cell ruins'
  return 'ct-cell t-' + v
}

export function Cartographers() {
  const { state: s, mySeat, isMyTurn, dispatch, newGame: netNew, net } = useGameSession(cartographersAdapter)
  const me = mySeat as Player // seat 0 = you, seat 1 = rival
  const opp = (1 - me) as Player
  const [showRules, setShowRules] = useState(false)
  // Player input scratch state (reset per card).
  const [shapeIdx, setShapeIdx] = useState(0)
  const [oriIdx, setOriIdx] = useState(0)
  const [terrain, setTerrain] = useState<Terrain | null>(null)
  const [hover, setHover] = useState<number | null>(null)

  function newGame() {
    netNew()
    setShowRules(false)
    setShapeIdx(0); setOriIdx(0); setHover(null); setTerrain(null)
  }

  // It's your move when the session says so AND you still owe a placement this card.
  const yourTurn = s.phase === 'placing' && isMyTurn && !s.maps[me].placed

  // Current card's chosen shape, all its orientations.
  const shapes: Shape[] = s.card ? s.card.shapes : []
  const oris: Shape[] = useMemo(() => {
    if (!s.card) return []
    const sh = shapes[Math.min(shapeIdx, shapes.length - 1)]
    return sh ? C.orientations(sh) : []
  }, [s.card, shapeIdx])
  const ori: Shape = oris.length ? oris[oriIdx % oris.length] : []

  // Legal anchor offsets for the currently-selected orientation on your map.
  const legalAnchors = useMemo(() => {
    if (!yourTurn || !s.card || !ori.length) return new Set<number>()
    // A placement is legal if its absolute cells are all open AND (ruins rule) — we test
    // each anchor directly, matching legalPlacements but keyed by the anchor cell.
    const set = new Set<number>()
    const grid = s.maps[me].grid
    const maxR = Math.max(...ori.map(c => c[0]))
    const maxC = Math.max(...ori.map(c => c[1]))
    const ruinsOpen = grid.some(v => v === 'ruins')
    let anyRuinsHit = false
    const candidates: { anchor: number; cells: [number, number][]; hitsRuins: boolean }[] = []
    for (let r0 = 0; r0 + maxR < C.SIZE; r0++) {
      for (let c0 = 0; c0 + maxC < C.SIZE; c0++) {
        const cells = ori.map(([dr, dc]) => [r0 + dr, c0 + dc] as [number, number])
        if (!cells.every(([r, c]) => C.isOpen(grid, r, c))) continue
        const hitsRuins = cells.some(([r, c]) => grid[C.idx(r, c)] === 'ruins')
        if (hitsRuins) anyRuinsHit = true
        candidates.push({ anchor: C.idx(r0, c0), cells, hitsRuins })
      }
    }
    for (const cand of candidates) {
      if (ruinsOpen && anyRuinsHit && !cand.hitsRuins) continue
      set.add(cand.anchor)
    }
    return set
  }, [yourTurn, s.card, ori, s.maps[me].grid])

  // Cells of the previewed placement at the hovered anchor.
  const previewCells = useMemo(() => {
    if (hover == null || !ori.length) return null
    const r0 = Math.floor(hover / C.SIZE), c0 = hover % C.SIZE
    const cells = ori.map(([dr, dc]) => [r0 + dr, c0 + dc] as [number, number])
    return cells
  }, [hover, ori])

  const previewSet = useMemo(() => {
    const m = new Set<number>()
    if (previewCells) for (const [r, c] of previewCells) if (C.inBounds(r, c)) m.add(C.idx(r, c))
    return m
  }, [previewCells])

  function clickCell(i: number) {
    if (!yourTurn || !s.card || terrain == null) return
    if (!legalAnchors.has(i)) return
    const r0 = Math.floor(i / C.SIZE), c0 = i % C.SIZE
    const cells = ori.map(([dr, dc]) => [r0 + dr, c0 + dc] as [number, number])
    dispatch({ kind: 'place', shapeId: shapeIdx, cells, terrain })
    // After you place, the host advances (rival/AI, then next card). Keep input ready.
    setHover(null)
  }

  // When the card changes (id / season / index), reset shape + orientation selection and
  // default the terrain to the card's first allowed type.
  const cardKey = (s.card ? s.card.id : 'none') + ':' + s.season + ':' + s.cardIdx
  useEffect(() => {
    setShapeIdx(0)
    setOriIdx(0)
    setHover(null)
    if (s.card) setTerrain(prev => (prev && s.card!.terrains.includes(prev) ? prev : s.card!.terrains[0]))
    else setTerrain(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cardKey])

  function canPlaceAnywhere(): boolean {
    if (!s.card) return false
    for (const sh of s.card.shapes) {
      if (C.legalPlacements(s.maps[me].grid, sh).length > 0) return true
    }
    return false
  }
  const deadlocked = yourTurn && !canPlaceAnywhere()

  useGameKeys({
    onNew: newGame,
    onToggleRules: () => setShowRules(v => !v),
    onEscape: () => setShowRules(false),
    extra: (e) => {
      if (!yourTurn) return false
      if (e.key === 'r' || e.key === 'R') { setOriIdx(v => (v + 1) % Math.max(1, oris.length)); return true }
      if (e.key === 'f' || e.key === 'F') { setOriIdx(v => (v + 4) % Math.max(1, oris.length)); return true }
      if (e.key === 'c' || e.key === 'C') { if (shapes.length > 1) { setShapeIdx(v => (v + 1) % shapes.length); setOriIdx(0) } return true }
      return false
    },
  })

  const curPair = C.edictPair(s.season)
  const you = s.maps[me], foe = s.maps[opp]
  const myWin = s.winner === me
  const foeLabel = net.online ? `Player ${opp + 1}` : 'the rival'
  const foeName = net.online ? `Player ${opp + 1}` : 'Rival'
  const foeDrawing = net.online ? `${foeName} is drawing their map…` : 'The rival is drawing their map…'

  let banner: string, bk = ''
  if (s.phase === 'over') {
    if (myWin) { bk = 'win'; banner = `You win — ${you.score} to ${foe.score}!` }
    else if (s.winner === opp) { bk = 'lose'; banner = `${foeName} wins — ${foe.score} to ${you.score}` }
    else { banner = `A draw — ${you.score} all` }
  } else if (s.phase === 'seasonEnd') {
    bk = 'you'; banner = `${C.SEASON_NAMES[s.season]} scored — begin ${C.SEASON_NAMES[s.season + 1]}`
  } else if (deadlocked) {
    bk = 'foe'; banner = 'No legal placement — skip this card'
  } else if (yourTurn) {
    bk = 'you'; banner = terrain ? `Draw the ${s.card?.name} as ${TERRAIN_LABEL[terrain]}` : 'Choose a terrain'
  } else {
    bk = 'foe'; banner = `${foeDrawing}`
  }

  return (
    <>
      <GameShell
        mark={TITLE_MARK}
        eyebrow="Cartographers · roll & write"
        title="Cartographers"
        subtitle="chart the realm season by season — stamp explore shapes into terrain, satisfy the queen's edicts, and out-map your rival"
        onRules={() => setShowRules(true)}
        onNew={newGame}
        modeLeft={`${C.SEASON_NAMES[s.season]} · ${s.season + 1}/4 · time ${Math.min(s.time, C.TIME_BUDGET[s.season])}/${C.TIME_BUDGET[s.season]}`}
        banner={banner}
        bannerClass={bk}
        modeRight={<>R · rotate &nbsp; F · flip &nbsp; C · swap &nbsp; N · new</>}
      >
        <div className="ct-main">
          {/* YOUR MAP */}
          <div className="ct-mapwrap">
            <div className="ct-maptitle"><span className="ct-dot you" />Your realm <b>{you.score}</b></div>
            <div className="ct-grid"
              onMouseLeave={() => setHover(null)}
            >
              {you.grid.map((v, i) => {
                const legal = legalAnchors.has(i)
                const inPrev = previewSet.has(i)
                const prevLegal = inPrev && hover != null && legalAnchors.has(hover)
                return (
                  <div
                    key={i}
                    className={cellClass(v)
                      + (legal ? ' anchor' : '')
                      + (inPrev ? (prevLegal ? ' prev ok' : ' prev bad') : '')
                      + (inPrev && prevLegal && terrain ? ' pt-' + terrain : '')}
                    onMouseEnter={() => setHover(i)}
                    onClick={() => clickCell(i)}
                  />
                )
              })}
            </div>
          </div>

          {/* CENTER — card + terrain + season panel */}
          <div className="ct-side">
            <div className="panel ct-card">
              <div className="ct-cardhead">
                <span className="ct-cardname">{s.card ? s.card.name : '—'}</span>
                <span className="ct-time">⏳ {s.card ? s.card.time : 0}{s.card?.coin ? ' · 🪙' : ''}</span>
              </div>
              <div className="ct-shapes">
                {shapes.map((sh, si) => (
                  <button key={si}
                    className={'ct-shape' + (si === shapeIdx ? ' sel' : '')}
                    disabled={!yourTurn}
                    onClick={() => { setShapeIdx(si); setOriIdx(0) }}
                    title={si === shapeIdx ? 'selected shape' : 'use this shape'}
                  >
                    <ShapeMini shape={si === shapeIdx ? ori : C.normalize(sh)} />
                  </button>
                ))}
              </div>
              <div className="ct-terrs">
                {s.card?.terrains.map(t => (
                  <button key={t}
                    className={'ct-terr t-' + t + (terrain === t ? ' sel' : '')}
                    disabled={!yourTurn}
                    onClick={() => setTerrain(t)}
                  >
                    <span className="ct-tg">{TERRAIN_GLYPH[t]}</span>{TERRAIN_LABEL[t]}
                  </button>
                ))}
              </div>
              {yourTurn && (
                <div className="ct-actions">
                  <button className="ct-btn" onClick={() => setOriIdx(v => (v + 1) % Math.max(1, oris.length))}>Rotate</button>
                  <button className="ct-btn" onClick={() => setOriIdx(v => (v + 4) % Math.max(1, oris.length))}>Flip</button>
                  {deadlocked && <button className="ct-btn skip" onClick={() => dispatch({ kind: 'skip' })}>Skip</button>}
                </div>
              )}
              <div className="ct-hint">
                {s.phase === 'seasonEnd' ? 'Season scored — press Continue.'
                  : deadlocked ? 'This shape fits nowhere. Skip the card.'
                  : yourTurn ? 'Pick terrain + orientation, then click a glowing cell to stamp.'
                  : s.phase === 'over' ? 'The realm is fully charted.'
                  : `${foeName} is drawing…`}
              </div>
            </div>

            <div className="panel ct-edicts">
              <div className="ct-el">Edicts this season</div>
              {[curPair[0], curPair[1]].map(ei => (
                <EdictRow key={ei} e={s.edicts[ei]} active />
              ))}
              <div className="ct-el dim">Coming edicts</div>
              {C.EDICTS.map((e, ei) => (
                (ei !== curPair[0] && ei !== curPair[1]) ? <EdictRow key={ei} e={e} /> : null
              ))}
            </div>
          </div>

          {/* OPPONENT MAP (smaller) */}
          <div className="ct-mapwrap foe">
            <div className="ct-maptitle"><span className="ct-dot foe" />{foeName} <b>{foe.score}</b></div>
            <div className="ct-grid small">
              {foe.grid.map((v, i) => <div key={i} className={cellClass(v)} />)}
            </div>
            <div className="ct-scoreline">
              <SeasonBar label="You" scores={seatScores(s.seasonScores, me)} total={you.score} cls="you" />
              <SeasonBar label={foeName} scores={seatScores(s.seasonScores, opp)} total={foe.score} cls="foe" />
            </div>
            <OnlineBar net={net} />
          </div>
        </div>
      </GameShell>

      {s.phase === 'seasonEnd' && (
        <SeasonModal s={s} me={me} opp={opp} foeName={foeName} canContinue={isMyTurn}
          onContinue={() => dispatch({ kind: 'next' })} />
      )}
      {s.phase === 'over' && <ResultModal s={s} me={me} opp={opp} foeName={foeName} onNew={newGame} />}
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </>
  )
}

/** seasonScores is interleaved [p0, p1, p0, p1, …]; pull out one seat's per-season deltas. */
function seatScores(a: number[], seat: number): number[] { return a.filter((_, i) => i % 2 === seat) }

function ShapeMini({ shape }: { shape: Shape }) {
  const norm = C.normalize(shape)
  const maxR = Math.max(0, ...norm.map(c => c[0]))
  const maxC = Math.max(0, ...norm.map(c => c[1]))
  const set = new Set(norm.map(([r, c]) => r * (maxC + 1) + c))
  const cells = []
  for (let r = 0; r <= maxR; r++) for (let c = 0; c <= maxC; c++) {
    cells.push(<span key={r + '-' + c} className={'ct-mini' + (set.has(r * (maxC + 1) + c) ? ' on' : '')} />)
  }
  return (
    <div className="ct-minigrid" style={{ gridTemplateColumns: `repeat(${maxC + 1}, 1fr)` }}>{cells}</div>
  )
}

function EdictRow({ e, active }: { e: Edict; active?: boolean }) {
  return (
    <div className={'ct-edict' + (active ? ' on' : '')}>
      <span className="ct-ek">{e.id}</span>
      <span className="ct-ename">{e.name}</span>
      <span className="ct-edesc">{e.desc}</span>
    </div>
  )
}

function SeasonBar({ label, scores, total, cls }: { label: string; scores: number[]; total: number; cls: string }) {
  return (
    <div className={'ct-sb ' + cls}>
      <span className="ct-sblabel">{label}</span>
      <span className="ct-sbvals">{[0, 1, 2, 3].map(i => (
        <span key={i} className={'ct-sbv' + (i < scores.length ? '' : ' empty')}>{i < scores.length ? scores[i] : '·'}</span>
      ))}</span>
      <span className="ct-sbtotal">{total}</span>
    </div>
  )
}

function SeasonModal({ s, me, opp, foeName, canContinue, onContinue }: { s: State; me: Player; opp: Player; foeName: string; canContinue: boolean; onContinue: () => void }) {
  const pair = s.scoredEdicts
  const es: [Edict, Edict] = [s.edicts[pair[0]], s.edicts[pair[1]]]
  const yd = C.seasonScore({ ...s.maps[me] }, es)
  const fd = C.seasonScore({ ...s.maps[opp] }, es)
  return (
    <Modal
      eyebrow={`${C.SEASON_NAMES[s.season]} · season ${s.season + 1} scored`}
      title={`${es[0].name} + ${es[1].name}`}
      closeOnOverlay={false}
      actions={canContinue
        ? <button className="btn-modal" onClick={onContinue}>Continue</button>
        : <button className="btn-modal" disabled>Waiting for host…</button>}
    >
      <div className="modal-body">
        <div className="ct-seasontable">
          <div className="ct-st-row head"><span /><span>You</span><span>{foeName}</span></div>
          <div className="ct-st-row"><span>This season</span><span className="you">+{yd}</span><span className="foe">+{fd}</span></div>
          <div className="ct-st-row total"><span>Running total</span><span className="you">{s.maps[me].score}</span><span className="foe">{s.maps[opp].score}</span></div>
        </div>
        <p>Next: <b>{C.SEASON_NAMES[s.season + 1]}</b> scores <b>{C.EDICTS[C.edictPair(s.season + 1)[0]].name}</b> + <b>{C.EDICTS[C.edictPair(s.season + 1)[1]].name}</b>.</p>
      </div>
    </Modal>
  )
}

function ResultModal({ s, me, opp, foeName, onNew }: { s: State; me: Player; opp: Player; foeName: string; onNew: () => void }) {
  const won = s.winner === me
  const draw = s.winner === 2
  return (
    <Modal
      eyebrow={draw ? 'Evenly charted' : won ? 'The realm is yours' : 'Out-mapped'}
      title={draw ? 'A Draw' : won ? 'You Win' : `${foeName} Wins`}
      closeOnOverlay={false}
      actions={<button className="btn-modal" onClick={onNew}>Play again</button>}
    >
      <div className="modal-body">
        <div className="finalsc">
          <span className="you">You {s.maps[me].score}</span>
          <span className="foe">{foeName} {s.maps[opp].score}</span>
        </div>
        <p>Four seasons charted across the eleven-by-eleven realm. Highest cumulative edict and coin total wins.</p>
      </div>
    </Modal>
  )
}

function RulesModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal eyebrow="How to play" title="Cartographers" onClose={onClose}
      actions={<button className="btn-modal" onClick={onClose}>Start mapping</button>}>
      <div className="modal-body">
        <p>Both you and the rival fill your <b>own 11×11 map</b>. Play <b>4 seasons</b>; each has a time budget. Every turn a shared <b>explore card</b> shows a polyomino <b>shape</b> and one or more allowed <b>terrains</b> (forest, village, farm, water, monster).</p>
        <p>Pick a shape option, <b>rotate (R)</b> / <b>flip (F)</b> it, choose a terrain, then click a glowing cell to stamp it onto empty land. <b>Mountains</b> block placement; <b>ruins</b> force the next shape to overlap one of them. Some cards grant a <b>🪙 coin</b>; surrounding a mountain on all four sides also earns a coin. Coins are 1 point each, every season.</p>
        <p>At each season's end, <b>two of four edicts</b> are scored, rotating A+B, B+C, C+D, D+A:</p>
        <p><b>A Tradeway</b> 3 pts / filled row or column · <b>B Greenbough</b> 1 pt / edge forest · <b>C Wildholds</b> 6 pts / village cluster of 6+ · <b>D Borderlands</b> 1 pt / empty cell beside a mountain.</p>
        <p>Highest cumulative score after four seasons wins. <b>Keys:</b> <kbd>R</kbd> rotate · <kbd>F</kbd> flip · <kbd>C</kbd> swap shape · <kbd>N</kbd> new · <kbd>?</kbd> rules · <kbd>Esc</kbd> close.</p>
      </div>
    </Modal>
  )
}
