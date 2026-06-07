/* CRYPTID — UI (built for this codebase). A 9x6 hex map of terrain + structures on the
   framework shell, vs a deducing AI. You hold one secret clue; the AI holds another. ASK the
   rival about a hex (it places a disc=fits or cube=no) or SEARCH a hex to win. Deduce the
   rival's clue from its answers to corner the unique cryptid. The AI asks/searches over turns,
   so its driver re-arms on a monotonic tick. End state is shown by default. */

import { useEffect, useRef, useState } from 'react'
import { GameShell } from '../../framework/GameShell'
import { Modal } from '../../framework/Modal'
import { OnlineBar } from '../../framework/OnlineBar'
import { useGameKeys } from '../../framework/useGameKeys'
import { useGameSession } from '../../net/useGameSession'
import { cryptidAdapter } from './net'
import * as C from './logic'
import type { Player, Terrain, StructColor } from './logic'

const TITLE_MARK = (
  <svg className="title-mark" viewBox="0 0 48 48" aria-hidden="true">
    <rect x="3" y="3" width="42" height="42" rx="10" fill="#152a26" stroke="#2f5e52" strokeWidth="1.5" />
    <path d="M14 30 L24 12 L34 30 Z" fill="#3aa884" opacity="0.85" />
    <circle cx="24" cy="27" r="6.5" fill="#0d1c19" stroke="#6fe0c0" strokeWidth="1.4" />
    <circle cx="21.6" cy="26" r="1.7" fill="#ffd56b" />
    <circle cx="26.4" cy="26" r="1.7" fill="#ffd56b" />
    <path d="M20 31 Q24 34 28 31" stroke="#6fe0c0" strokeWidth="1.3" fill="none" strokeLinecap="round" />
  </svg>
)

const TERRAIN_ABBR: Record<Terrain, string> = {
  forest: 'F', desert: 'D', water: 'W', mountain: 'M', swamp: 'S',
}

// Pointy-top hex points for a unit cell of given width/height.
function hexPoints(w: number, h: number): string {
  const x0 = w / 2
  return [
    [x0, 0], [w, h * 0.25], [w, h * 0.75], [x0, h], [0, h * 0.75], [0, h * 0.25],
  ].map((p) => p.join(',')).join(' ')
}

export function Cryptid() {
  const { state: s, mySeat, isMyTurn, dispatch, newGame: netNew, net } = useGameSession(cryptidAdapter)
  const me = mySeat as Player
  const opp = (1 - me) as Player
  const [showRules, setShowRules] = useState(false)
  const [mode, setMode] = useState<'ask' | 'search'>('ask')
  const logRef = useRef<HTMLDivElement>(null)

  function newGame() { netNew(); setShowRules(false); setMode('ask') }

  useEffect(() => { if (logRef.current) logRef.current.scrollTop = 0 }, [s.log])

  const yourTurn = s.winner == null && isMyTurn

  useGameKeys({
    onNew: newGame,
    onToggleRules: () => setShowRules((v) => !v),
    onEscape: () => setShowRules(false),
    extra: (e) => {
      if (!yourTurn) return false
      if (e.key === 'a' || e.key === 'A') { setMode('ask'); return true }
      if (e.key === 's' || e.key === 'S') { setMode('search'); return true }
      return false
    },
  })

  function onHex(h: number) {
    if (!yourTurn) return
    if (mode === 'ask') {
      if (s.markers[opp][h] != null) return // already answered
      dispatch({ kind: 'question', target: opp, cell: h })
    } else {
      dispatch({ kind: 'search', cell: h })
    }
  }

  // Deduction hints from YOUR seat's perspective.
  const myCand = C.candidateHexes(s, me)
  const oppClues = C.consistentOpponentClues(s, me)
  const forced = myCand.filter((h) => oppClues.every((cl) => C.clueFits(cl, h, s.map)))

  const oppLabel = net.online ? 'Opponent' : 'rival'
  const myWin = s.winner === me

  let banner: string, bk = ''
  if (s.winner != null && myWin) { bk = 'win'; banner = 'You found the cryptid — you win!' }
  else if (s.winner != null) { bk = 'lose'; banner = `The ${oppLabel} cornered the cryptid first` }
  else if (yourTurn) {
    bk = 'you'
    banner = mode === 'ask' ? `ASK: click a hex to question the ${oppLabel}` : 'SEARCH: click the hex you believe hides the cryptid'
  } else { bk = 'foe'; banner = `The ${oppLabel} is deducing…` }

  // Geometry constants for the SVG board.
  const HW = 62, HH = 64           // hex bounding box
  const stepX = HW * 0.86          // horizontal spacing
  const stepY = HH * 0.75          // vertical spacing
  const pad = 8
  const boardW = pad * 2 + (C.COLS) * stepX + stepX / 2
  const boardH = pad * 2 + (C.ROWS - 1) * stepY + HH

  function hexXY(r: number, c: number): [number, number] {
    const x = pad + c * stepX + (r & 1 ? stepX / 2 : 0)
    const y = pad + r * stepY
    return [x, y]
  }

  return (
    <>
      <GameShell
        mark={TITLE_MARK}
        eyebrow="Cryptid · hex-map deduction"
        title="Cryptid"
        subtitle="two naturalists, one secret clue each — deduce the rival’s hint and corner the beast before they do"
        onRules={() => setShowRules(true)}
        onNew={newGame}
        modeLeft={`Candidates ${myCand.length} · ${oppLabel} clues left ${oppClues.length}`}
        banner={banner}
        bannerClass={bk}
        modeRight={<>a · ask &nbsp; s · search &nbsp; N · new</>}
      >
        <div className="cr-wrap">
          <svg className="cr-board" viewBox={`0 0 ${boardW} ${boardH}`} role="img" aria-label="hex map">
            {Array.from({ length: C.NHEX }, (_, i) => i).map((h) => {
              const r = C.rowOf(h), c = C.colOf(h)
              const [x, y] = hexXY(r, c)
              const hex = s.map[h]
              const youM = s.markers[me][h]
              const aiM = s.markers[opp][h]
              const isWin = s.winner != null && h === s.cryptid
              const isCand = yourTurn && myCand.includes(h)
              const isForced = forced.length <= 3 && forced.includes(h)
              const clickable = yourTurn && (mode === 'search' || s.markers[opp][h] == null)
              return (
                <g key={h} transform={`translate(${x},${y})`}
                  className={'cr-hexg' + (clickable ? ' clickable' : '')}
                  onClick={() => onHex(h)}>
                  <polygon
                    className={'cr-hex t-' + hex.terrain + (isWin ? ' win' : '') + (isForced ? ' forced' : isCand ? ' cand' : '')}
                    points={hexPoints(HW, HH)}
                  />
                  <text className="cr-tt" x={HW / 2} y={HH * 0.5} textAnchor="middle" dominantBaseline="central">
                    {TERRAIN_ABBR[hex.terrain]}
                  </text>
                  <text className="cr-coord" x={HW / 2} y={HH * 0.83} textAnchor="middle" dominantBaseline="central">
                    {C.coord(h)}
                  </text>
                  {hex.structure && (
                    hex.structure.kind === 'stone' ? (
                      <rect className={'cr-struct st-' + hex.structure.color} x={HW / 2 - 5} y={6} width={10} height={15} rx={4} />
                    ) : (
                      <polygon className={'cr-struct st-' + hex.structure.color}
                        points={`${HW / 2 - 7},20 ${HW / 2},6 ${HW / 2 + 7},20`} />
                    )
                  )}
                  {/* markers: your disc/cube top-left, AI disc/cube top-right */}
                  {youM && <circle className={'cr-mk you ' + youM} cx={13} cy={HH - 14} r={youM === 'disc' ? 6 : 0} />}
                  {youM === 'cube' && <rect className="cr-mk you cube" x={8} y={HH - 19} width={10} height={10} rx={2} />}
                  {aiM && <circle className={'cr-mk foe ' + aiM} cx={HW - 13} cy={HH - 14} r={aiM === 'disc' ? 6 : 0} />}
                  {aiM === 'cube' && <rect className="cr-mk foe cube" x={HW - 18} y={HH - 19} width={10} height={10} rx={2} />}
                </g>
              )
            })}
          </svg>
        </div>

        <div className="side">
          <div className="panel">
            <OnlineBar net={net} />
          </div>

          <div className="panel cr-clue">
            <div className="panel-l">your secret clue</div>
            <div className="cr-cluetext">{C.clueText(s.clues[me])}</div>
          </div>

          <div className="panel cr-control">
            <div className="panel-l">your move</div>
            <div className="cr-modebtns">
              <button className={'cr-btn' + (mode === 'ask' ? ' on' : '')} disabled={!yourTurn}
                onClick={() => setMode('ask')}>Ask</button>
              <button className={'cr-btn' + (mode === 'search' ? ' on' : '')} disabled={!yourTurn}
                onClick={() => setMode('search')}>Search</button>
            </div>
            <div className="cr-hint">
              {mode === 'ask'
                ? `Pick a hex to ask the ${oppLabel}. A disc means it fits their clue; a cube means it does not.`
                : 'Pick the hex you think hides the cryptid. Wrong guesses cost a cube and end your turn.'}
            </div>
            {forced.length === 1 && yourTurn && (
              <div className="cr-deduce">Deduction: only <b>{C.coord(forced[0])}</b> fits every remaining possibility — Search it!</div>
            )}
            {forced.length > 1 && yourTurn && (
              <div className="cr-deduce">Possible cryptid hexes narrowed to {forced.length}. Keep asking.</div>
            )}
          </div>

          <div className="panel cr-legend">
            <div className="panel-l">terrain</div>
            <div className="cr-legrow">
              {(['forest', 'desert', 'water', 'mountain', 'swamp'] as Terrain[]).map((t) => (
                <span key={t} className="cr-legitem"><span className={'cr-swatch t-' + t} />{t}</span>
              ))}
            </div>
            <div className="panel-l" style={{ marginTop: 8 }}>structures</div>
            <div className="cr-legrow">
              {(['white', 'blue', 'green'] as StructColor[]).map((col) => (
                <span key={col} className="cr-legitem"><span className={'cr-swatch st-' + col} />{col}</span>
              ))}
            </div>
            <div className="cr-legnote">▮ standing stone · ▲ shack · ● disc (fits) · ■ cube (no)</div>
          </div>

          <div className="panel logbox" ref={logRef}>
            {s.log.slice().reverse().map((l, i) => <div key={i} className={'log-line ' + l.t}>{l.x}</div>)}
          </div>
        </div>
      </GameShell>

      {s.winner != null && <ResultModal won={myWin} cryptid={C.coord(s.cryptid)} rivalLabel={oppLabel} rivalClue={C.clueText(s.clues[opp])} onNew={newGame} />}
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </>
  )
}

function ResultModal({ won, cryptid, rivalLabel, rivalClue, onNew }: { won: boolean; cryptid: string; rivalLabel: string; rivalClue: string; onNew: () => void }) {
  const rivalCap = rivalLabel.charAt(0).toUpperCase() + rivalLabel.slice(1)
  return (
    <Modal
      eyebrow={won ? 'Beast cornered' : 'Outdeduced'}
      title={won ? 'You Win' : `${rivalCap} Wins`}
      closeOnOverlay={false}
      actions={<button className="btn-modal" onClick={onNew}>Play again</button>}
    >
      <div className="modal-body">
        <div className="finalsc">
          {won ? <span className="you">You found the cryptid at {cryptid}</span> : <span className="foe">The {rivalLabel} found it at {cryptid}</span>}
        </div>
        <p>The {rivalLabel}'s secret clue was: <b>{rivalClue}</b>.</p>
      </div>
    </Modal>
  )
}

function RulesModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal eyebrow="How to play" title="Cryptid" onClose={onClose}
      actions={<button className="btn-modal" onClick={onClose}>Track it</button>}>
      <div className="modal-body">
        <p>A <b>cryptid</b> hides on exactly one of the 54 hexes. You and the rival each hold a <b>secret clue</b> the cryptid's hex satisfies — the beast sits on the <i>only</i> hex that fits <b>both</b>.</p>
        <p>Clues come in flavors like <i>"within one space of forest"</i>, <i>"on water or swamp"</i>, <i>"within two spaces of a blue structure"</i>, or <i>"within three spaces of a standing stone"</i>. You know yours; deduce the rival's from its answers.</p>
        <p>On your turn either <b>Ask</b> — pick a hex and the rival drops a <b>disc</b> (fits my clue) or a <b>cube</b> (no) — or <b>Search</b> a hex you believe is the lair. A correct search <b>wins</b>; a wrong one costs a cube and ends your turn.</p>
        <p>Watch the side panel: it tracks your remaining <b>candidate hexes</b> and how many of the rival's possible clues survive. When one hex fits every survivor, search it.</p>
        <p><b>Keys:</b> <kbd>A</kbd> ask mode · <kbd>S</kbd> search mode · <kbd>N</kbd> new game · <kbd>?</kbd> rules · <kbd>Esc</kbd> close.</p>
      </div>
    </Modal>
  )
}
