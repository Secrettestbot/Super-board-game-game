/* WATERGATE — UI. A 1970s-newsprint tug-of-war between the Washington Post EDITOR (pulls
   evidence to the front page) and NIXON's administration (pushes momentum to his wall).
   Play a card for its VALUE (pick a token to move) or its EVENT.

   Online-capable & seat-relative: the local player controls mySeat's side (seat 0 = Editor,
   seat 1 = Nixon), sees only its own hand, and the tug track is drawn so the local side's
   end is on the right ("your side"). Empty seats are driven by the existing AI via the hook;
   isMyTurn gates all actions. Solo play is unchanged (mySeat 0 = Editor, AI = Nixon). */

import { useEffect, useRef, useState } from 'react'
import { GameShell } from '../../framework/GameShell'
import { Modal } from '../../framework/Modal'
import { useGameKeys } from '../../framework/useGameKeys'
import { OnlineBar } from '../../framework/OnlineBar'
import { useGameSession } from '../../net/useGameSession'
import { watergateAdapter } from './net'
import * as W from './logic'
import type { Card, Token, Player } from './logic'

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

export function Watergate() {
  const { state: s, mySeat, isMyTurn, dispatch, newGame: netNew, net } = useGameSession(watergateAdapter)
  const me = mySeat as Player          // 0 = Editor, 1 = Nixon
  const foe = (1 - me) as Player
  const iAmEditor = me === W.EDITOR

  const [showRules, setShowRules] = useState(false)
  const [sel, setSel] = useState<{ id: number; kind: 'value' | 'event' } | null>(null)
  const logRef = useRef<HTMLDivElement>(null)

  function newGame() {
    netNew()
    setShowRules(false)
    setSel(null)
  }

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

  const yourTurn = s.winner == null && isMyTurn
  const links = W.linkCount(s)
  const mom = W.momentum(s)
  const evs = W.evidenceTokens(s)
  const infs = W.informantTokens(s)

  // fraction 0..1 across the track for left-offset rendering, oriented so the LOCAL
  // player's wall/goal is on the right. Editor's goal is +TRACK; Nixon's wall is -TRACK.
  function frac(p: number): number {
    const raw = (p + W.TRACK) / (W.TRACK * 2)
    return iAmEditor ? raw : 1 - raw
  }

  // selected card object (must be in MY live hand)
  const selCard: Card | undefined = sel ? s.hands[me].find((c) => c.id === sel.id) : undefined
  // when a VALUE card is selected, which tokens may I click to move?
  const movableIds = new Set(W.movableTokens(s, me).map((t) => t.id))
  const awaitingToken = !!(selCard && sel?.kind === 'value')

  function pickCard(c: Card, kind: 'value' | 'event') {
    if (!yourTurn) return
    if (kind === 'event') {
      dispatch({ kind: 'play', cardId: c.id, useFor: 'event' })
      setSel(null)
      return
    }
    // value: arm token-selection
    setSel((cur) => (cur && cur.id === c.id && cur.kind === kind ? null : { id: c.id, kind }))
  }

  function clickToken(t: Token) {
    if (!awaitingToken || !selCard) return
    if (!movableIds.has(t.id)) return
    dispatch({
      kind: 'play',
      cardId: selCard.id,
      useFor: 'value',
      tokens: [{ id: t.id, amount: selCard.value }],
    })
    setSel(null)
  }

  // seat-relative labels
  const oppLabel = net.online ? 'Opponent' : iAmEditor ? 'Nixon' : 'The Post'
  const myName = iAmEditor ? 'The Post' : 'Nixon'
  const myWin = s.winner === me

  let banner: string, bk = ''
  if (s.winner != null) {
    if (myWin) {
      bk = 'win'
      banner = iAmEditor ? 'The story runs — you win!' : 'You buried it — you win!'
    } else {
      bk = 'lose'
      banner = iAmEditor ? 'The administration buries it — you lose' : 'The story runs — you lose'
    }
  } else if (yourTurn) {
    bk = 'you'
    banner = awaitingToken
      ? `Choose a token to ${iAmEditor ? 'pull toward the Post' : 'shove toward Nixon'}`
      : 'Your move — play a card for value or event'
  } else {
    bk = 'foe'
    banner = net.online
      ? `${oppLabel} is deciding…`
      : "Nixon's people are working the phones…"
  }

  // group momentum + informant + evidence for the board lanes
  const laneTokens: Token[] = [mom, ...infs, ...evs]
  // momentum progress toward Nixon's wall (-TRACK), shown on the Nixon bar.
  const momToWall = mom.pos <= -W.TRACK ? 'WALL' : -mom.pos + W.TRACK

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
          {/* tug-of-war board, oriented so MY end is on the right */}
          <div className="wg-board">
            <div className="wg-ends">
              <div className={'wg-end ' + (iAmEditor ? 'foe' : 'you')}>
                <span className="wg-end-l">NIXON</span>
                <span className="wg-end-s">momentum wall</span>
              </div>
              <div className={'wg-end ' + (iAmEditor ? 'you' : 'foe')}>
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

          {/* hand — always MY own hand (redacted views hide the opponent's) */}
          <div className="wg-hand">
            <div className="wg-hand-l">
              your hand {yourTurn ? '' : '· (waiting)'}
            </div>
            <div className="wg-cards">
              {s.hands[me].length === 0 && <div className="wg-empty">no cards — round resolving…</div>}
              {s.hands[me].map((c) => {
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
                {iAmEditor ? 'Pulling' : 'Shoving'} with <b>{selCard.value}</b> power — click a glowing token.
                <button className="wg-cancel" onClick={() => setSel(null)}>cancel</button>
              </div>
            )}
          </div>
        </div>

        {/* side panel */}
        <div className="side">
          <div className="panel">
            <OnlineBar net={net} />
          </div>

          <div className="panel wg-status">
            <div className={'wg-srow ' + (iAmEditor ? 'you-row' : 'foe-row')}>
              <span className={'wg-dot ' + (iAmEditor ? 'you' : 'foe')} />
              <span className="wg-who">The Post{iAmEditor ? ' (you)' : ''}</span>
              <span className="wg-goal">{links}/{W.LINKS_TO_WIN} links</span>
            </div>
            <div className="wg-bar">
              <div className={'wg-bar-fill ' + (iAmEditor ? 'you' : 'foe')} style={{ width: (links / W.LINKS_TO_WIN) * 100 + '%' }} />
            </div>
            <div className={'wg-srow ' + (iAmEditor ? 'foe-row' : 'you-row')}>
              <span className={'wg-dot ' + (iAmEditor ? 'foe' : 'you')} />
              <span className="wg-who">Nixon{iAmEditor ? '' : ' (you)'}</span>
              <span className="wg-goal">momentum {momToWall}{momToWall === 'WALL' ? '' : '/' + W.TRACK * 2}</span>
            </div>
            <div className="wg-bar">
              <div className={'wg-bar-fill ' + (iAmEditor ? 'foe' : 'you')} style={{ width: ((mom.pos <= -W.TRACK ? W.TRACK * 2 : -mom.pos + W.TRACK) / (W.TRACK * 2)) * 100 + '%' }} />
            </div>
            <div className="wg-round">
              Round {s.round} of {W.ROUNDS} · you hold {s.hands[me].length} · {oppLabel} holds {s.hands[foe].length}
            </div>
          </div>

          <div className="panel logbox" ref={logRef}>
            {s.log.slice().reverse().map((l, i) => (
              <div key={i} className={'log-line ' + l.t}>{l.x}</div>
            ))}
          </div>
        </div>
      </GameShell>

      {s.winner != null && <ResultModal won={myWin} iAmEditor={iAmEditor} online={net.online} onNew={newGame} />}
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </>
  )
}

function ResultModal({ won, iAmEditor, online, onNew }: { won: boolean; iAmEditor: boolean; online: boolean; onNew: () => void }) {
  const editorWon = won === iAmEditor // true iff the Post took the game
  const eyebrow = won ? 'Above the fold' : 'Spiked'
  const title = won ? 'You Win' : online ? 'Opponent Wins' : iAmEditor ? 'Nixon Wins' : 'The Post Wins'
  return (
    <Modal
      eyebrow={eyebrow}
      title={title}
      closeOnOverlay={false}
      actions={<button className="btn-modal" onClick={onNew}>Run it again</button>}
    >
      <div className="finalsc">
        {editorWon ? (
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
        <p>An asymmetric tug-of-war. One side is the <b>Washington Post editor</b>; the other is <b>Nixon's administration</b>. Tokens sit on a track running from Nixon's wall through center to the Post's front page. Your end is drawn on the right.</p>
        <p>Each round you both hold a hand of cards. A card has a <b>value</b> (power) and an <b>event</b>. On your turn, play one card for its <b>Value</b> — then click a glowing token to move it toward your side — <i>or</i> for its <b>Event</b> (a special effect, resolved at once).</p>
        <p><b>The Post wins</b> by completing <b>two links</b>: pulling two evidence tokens all the way to the front page. <b>Nixon wins</b> by pulling the <b>momentum</b> token to his wall, or by <b>surviving all {W.ROUNDS} rounds</b> with the story unproven.</p>
        <p><b>Events:</b> Surge (momentum your way), Subpoena (pull all evidence), Recount (momentum to center), Source Tip (draw 2). Nixon also wields Shred (knock back the leading evidence).</p>
        <p><b>Keys:</b> <kbd>N</kbd> new game · <kbd>?</kbd> rules · <kbd>Esc</kbd> cancel / close.</p>
      </div>
    </Modal>
  )
}
