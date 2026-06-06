/* WATERGATE — UI (built for this codebase). A 1970s-newsprint tug-of-war: you are the
   Washington Post EDITOR pulling evidence to your side; the AI is NIXON pushing momentum
   to his wall. Play a card for its VALUE (pick a token to move) or its EVENT. The AI plays
   one card per turn across rounds, so its driver re-arms on a monotonic tick. */

import { useEffect, useRef, useState } from 'react'
import { GameShell } from '../../framework/GameShell'
import { Modal } from '../../framework/Modal'
import { useAITurn } from '../../framework/useAITurn'
import { useGameKeys } from '../../framework/useGameKeys'
import * as W from './logic'
import type { WatergateState, Card, Token } from './logic'

const TITLE_MARK = (
  <svg className="title-mark" viewBox="0 0 48 48" aria-hidden="true">
    <rect x="3" y="3" width="42" height="42" rx="9" fill="#f4ecd8" stroke="#3a3530" strokeWidth="1.5" />
    <rect x="9" y="10" width="30" height="4" rx="1" fill="#3a3530" />
    <rect x="9" y="18" width="13" height="2.4" rx="1" fill="#6b6258" />
    <rect x="9" y="23" width="13" height="2.4" rx="1" fill="#6b6258" />
    <rect x="9" y="28" width="13" height="2.4" rx="1" fill="#6b6258" />
    <rect x="9" y="33" width="13" height="2.4" rx="1" fill="#6b6258" />
    <rect x="25" y="18" width="14" height="17.4" rx="1" fill="#b5462f" />
    <path d="M27 22 H37 M27 26 H37 M27 30 H35" stroke="#f4ecd8" strokeWidth="1.4" strokeLinecap="round" />
  </svg>
)

const EVENT_DESC: Record<string, string> = {
  surge: 'Surge — shove momentum 2 toward your side',
  shred: 'Shred — push the leading evidence 2 toward Nixon',
  subpoena: 'Subpoena — pull every evidence 1 toward the Post',
  recount: 'Recount — pull momentum 2 back toward center',
  draw2: 'Source Tip — draw 2 extra cards',
}
const EVENT_TAG: Record<string, string> = {
  surge: 'SURGE', shred: 'SHRED', subpoena: 'SUBPOENA', recount: 'RECOUNT', draw2: 'TIP',
}

// fraction 0..1 of position p across the full track for left-offset rendering
function frac(p: number): number {
  return (p + W.TRACK) / (W.TRACK * 2)
}

export function Watergate() {
  const [s, setS] = useState<WatergateState>(() => W.makeGame())
  const [showRules, setShowRules] = useState(false)
  const [sel, setSel] = useState<{ id: number; kind: 'value' | 'event' } | null>(null)
  const [aiTick, setAiTick] = useState(0)
  const logRef = useRef<HTMLDivElement>(null)

  function newGame() {
    setS(W.makeGame())
    setShowRules(false)
    setSel(null)
    setAiTick((t) => t + 1)
  }

  // The AI plays one card per turn, across rounds — re-arm on a monotonic tick that
  // changes every AI action so the driver never stalls.
  useAITurn(
    s.winner == null && s.turn === W.NIXON,
    () => {
      setS((p) => W.aiTurn(p))
      setAiTick((t) => t + 1)
    },
    { delayMs: 650, tick: aiTick },
  )

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = 0
  }, [s.log])

  useGameKeys({
    onNew: newGame,
    onToggleRules: () => setShowRules((v) => !v),
    onEscape: () => {
      if (sel) setSel(null)
      else setShowRules(false)
    },
  })

  const yourTurn = s.winner == null && s.turn === W.EDITOR
  const links = W.linkCount(s)
  const mom = W.momentum(s)
  const evs = W.evidenceTokens(s)
  const infs = W.informantTokens(s)

  // selected card object (if any)
  const selCard: Card | undefined = sel ? s.hands[W.EDITOR].find((c) => c.id === sel.id) : undefined
  // when a VALUE card is selected, which tokens may the editor click to move?
  const movableIds = new Set(W.movableTokens(s, W.EDITOR).map((t) => t.id))
  const awaitingToken = !!(selCard && sel?.kind === 'value')

  function pickCard(c: Card, kind: 'value' | 'event') {
    if (!yourTurn) return
    if (kind === 'event') {
      // events resolve immediately
      setS(W.playEvent(s, W.EDITOR, c.id))
      setSel(null)
      setAiTick((t) => t + 1)
      return
    }
    // value: arm token-selection
    setSel((cur) => (cur && cur.id === c.id && cur.kind === kind ? null : { id: c.id, kind }))
  }

  function clickToken(t: Token) {
    if (!awaitingToken || !selCard) return
    if (!movableIds.has(t.id)) return
    setS(W.playValue(s, W.EDITOR, selCard.id, [{ id: t.id, amount: selCard.value }]))
    setSel(null)
    setAiTick((tk) => tk + 1)
  }

  let banner: string, bk = ''
  if (s.winner === W.EDITOR) {
    bk = 'win'
    banner = 'The story runs — the Post wins!'
  } else if (s.winner === W.NIXON) {
    bk = 'lose'
    banner = 'The administration buries it — Nixon wins'
  } else if (yourTurn) {
    bk = 'you'
    banner = awaitingToken ? 'Choose a token to pull toward the Post' : 'Your move — play a card for value or event'
  } else {
    bk = 'foe'
    banner = "Nixon's people are working the phones…"
  }

  // group evidence + informant for the board lanes
  const laneTokens: Token[] = [mom, ...infs, ...evs]

  return (
    <>
      <GameShell
        mark={TITLE_MARK}
        eyebrow="Watergate · all the president's cards"
        title="Watergate"
        subtitle="pull two evidence links to the front page before Nixon runs out the clock or pulls momentum to the wall"
        onRules={() => setShowRules(true)}
        onNew={newGame}
        modeLeft={
          <>
            Round {s.round}/{W.ROUNDS} · Links {links}/{W.LINKS_TO_WIN}
          </>
        }
        banner={banner}
        bannerClass={bk}
        modeRight={<>click card · click token &nbsp; N · new &nbsp; ? · rules</>}
      >
        <div className="wg-wrap">
          {/* tug-of-war board */}
          <div className="wg-board">
            <div className="wg-ends">
              <div className="wg-end foe">
                <span className="wg-end-l">NIXON</span>
                <span className="wg-end-s">momentum wall</span>
              </div>
              <div className="wg-end you">
                <span className="wg-end-l">THE POST</span>
                <span className="wg-end-s">front page</span>
              </div>
            </div>

            <div className="wg-lanes">
              {laneTokens.map((t) => {
                const linked = t.kind === 'evidence' && t.pos >= W.LINK_AT
                const atWall = t.kind === 'momentum' && t.pos <= -W.TRACK
                const clickable = awaitingToken && movableIds.has(t.id)
                return (
                  <div className="wg-lane" key={t.id}>
                    <div className="wg-rail">
                      <div className="wg-center" />
                      <button
                        className={
                          'wg-tok ' +
                          t.kind +
                          (linked ? ' linked' : '') +
                          (atWall ? ' atwall' : '') +
                          (clickable ? ' pickable' : '')
                        }
                        style={{ left: frac(t.pos) * 100 + '%' }}
                        onClick={() => clickToken(t)}
                        disabled={!clickable}
                        title={t.kind + ' @ ' + t.pos}
                      >
                        {t.kind === 'momentum' ? 'M' : t.kind === 'informant' ? 'I' : 'E'}
                      </button>
                    </div>
                    <div className="wg-lane-tag">
                      {t.kind === 'momentum'
                        ? 'MOMENTUM'
                        : t.kind === 'informant'
                          ? 'INFORMANT'
                          : linked
                            ? 'LINKED ✓'
                            : 'EVIDENCE'}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* hand */}
          <div className="wg-hand">
            <div className="wg-hand-l">
              your hand {yourTurn ? '' : '· (waiting)'}
            </div>
            <div className="wg-cards">
              {s.hands[W.EDITOR].length === 0 && <div className="wg-empty">no cards — round resolving…</div>}
              {s.hands[W.EDITOR].map((c) => {
                const isSelVal = sel?.id === c.id && sel.kind === 'value'
                return (
                  <div className={'wg-card' + (isSelVal ? ' armed' : '')} key={c.id}>
                    <div className="wg-card-val">{c.value}</div>
                    <div className="wg-card-ev">{EVENT_TAG[c.event]}</div>
                    <div className="wg-card-btns">
                      <button
                        className="wg-cbtn val"
                        disabled={!yourTurn}
                        onClick={() => pickCard(c, 'value')}
                      >
                        Value
                      </button>
                      <button
                        className="wg-cbtn ev"
                        disabled={!yourTurn}
                        onClick={() => pickCard(c, 'event')}
                        title={EVENT_DESC[c.event]}
                      >
                        Event
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
            {awaitingToken && selCard && (
              <div className="wg-prompt">
                Pulling with <b>{selCard.value}</b> power — click a glowing evidence or informant token.
                <button className="wg-cancel" onClick={() => setSel(null)}>cancel</button>
              </div>
            )}
          </div>
        </div>

        {/* side panel */}
        <div className="side">
          <div className="panel wg-status">
            <div className="wg-srow you-row">
              <span className="wg-dot you" />
              <span className="wg-who">The Post</span>
              <span className="wg-goal">{links}/{W.LINKS_TO_WIN} links</span>
            </div>
            <div className="wg-bar">
              <div className="wg-bar-fill you" style={{ width: (links / W.LINKS_TO_WIN) * 100 + '%' }} />
            </div>
            <div className="wg-srow foe-row">
              <span className="wg-dot foe" />
              <span className="wg-who">Nixon</span>
              <span className="wg-goal">momentum {mom.pos <= -W.TRACK ? 'WALL' : (-mom.pos + W.TRACK)}/{W.TRACK * 2}</span>
            </div>
            <div className="wg-bar">
              <div className="wg-bar-fill foe" style={{ width: (frac(-mom.pos) * 100) + '%' }} />
            </div>
            <div className="wg-round">Round {s.round} of {W.ROUNDS} · {s.hands[W.EDITOR].length + s.hands[W.NIXON].length} cards in play</div>
          </div>

          <div className="panel logbox" ref={logRef}>
            {s.log.slice().reverse().map((l, i) => (
              <div key={i} className={'log-line ' + l.t}>{l.x}</div>
            ))}
          </div>
        </div>
      </GameShell>

      {s.winner != null && <ResultModal winner={s.winner} onNew={newGame} />}
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </>
  )
}

function ResultModal({ winner, onNew }: { winner: W.Player; onNew: () => void }) {
  const won = winner === W.EDITOR
  return (
    <Modal
      eyebrow={won ? 'Above the fold' : 'Spiked'}
      title={won ? 'The Post Wins' : 'Nixon Wins'}
      closeOnOverlay={false}
      actions={<button className="btn-modal" onClick={onNew}>Run it again</button>}
    >
      <div className="finalsc">
        {won ? (
          <span className="you">Two evidence links printed — the story holds.</span>
        ) : (
          <span className="foe">The administration ran out the clock.</span>
        )}
      </div>
    </Modal>
  )
}

function RulesModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal
      eyebrow="How to play"
      title="Watergate"
      onClose={onClose}
      actions={<button className="btn-modal" onClick={onClose}>Go to press</button>}
    >
      <div className="modal-body">
        <p>An asymmetric tug-of-war. <b>You are the Washington Post editor</b>; the AI plays <b>Nixon's administration</b>. Tokens sit on a track running from Nixon's wall (left) through center to the Post's front page (right).</p>
        <p>Each round you both hold a hand of cards. A card has a <b>value</b> (power) and an <b>event</b>. On your turn, play one card for its <b>Value</b> — then click a glowing <b>evidence</b> or <b>informant</b> token to pull it toward your side — <i>or</i> for its <b>Event</b> (a special effect, resolved at once).</p>
        <p><b>You win</b> by completing <b>two links</b>: pull two evidence tokens all the way to the front page. <b>Nixon wins</b> by pulling the <b>momentum</b> token to his wall, or by <b>surviving all {W.ROUNDS} rounds</b> with the story unproven.</p>
        <p><b>Events:</b> Surge (momentum your way), Subpoena (pull all evidence), Recount (momentum to center), Source Tip (draw 2). Nixon also wields Shred (knock back your leading evidence).</p>
        <p><b>Keys:</b> <kbd>N</kbd> new game · <kbd>?</kbd> rules · <kbd>Esc</kbd> cancel / close.</p>
      </div>
    </Modal>
  )
}
