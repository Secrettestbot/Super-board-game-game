# Adding online play to a game

Online play is **host-authoritative**: the host runs the real `logic.ts`, guests send
move *intents* and render a per-seat *view*. Empty seats are filled by the existing AI.
You add online play to a game by writing a small **adapter** (`net.ts`) and making the
game **seat-relative** (so a guest can play a non-host seat). **Never edit `logic.ts`.**

## The adapter contract (`src/net/protocol.ts`)

```ts
interface GameAdapter<S, I> {
  makeGame(): S
  numSeats(s: S): number
  seatToMove(s: S): number | null      // seat index whose turn it is; null if game over
  isOver(s: S): boolean
  applyIntent(s: S, seat: number, intent: I): S  // validate + apply; return s unchanged if illegal/not seat's turn
  aiStep(s: S, seat: number): S         // reuse aiMove/aiTurn (plays for s.turn)
  tickKey(s: S): string                 // changes on EVERY transition (re-arms the AI timer)
  redactFor?(s: S, seat: number): S     // hidden-info only: strip what `seat` may not see
}
```

**Seat convention:** seat 0 = the original human side, seat 1 (and 2,3,…) = the AI
side(s). Map the game's turn encoding to seat indices. Examples:
`'r'→0,'y'→1` (connect_four), `'b'→0,'w'→1` (gomoku), `0→0,1→1` (chinese_checkers).

`applyIntent` MUST validate (use the game's `legalMoves`/`legalCols`/etc.) and return
the **input state unchanged** for an illegal or out-of-turn intent — never throw. Intents
must be JSON-serializable plain objects (square indices, column numbers, card ids…).

### Worked example — `src/games/chess/net.ts`

```ts
import * as C from './logic'
import type { ChessState, PieceType } from './logic'
import type { GameAdapter } from '../../net/protocol'

export interface ChessIntent { from: number; to: number; promo?: PieceType }

export const chessAdapter: GameAdapter<ChessState, ChessIntent> = {
  makeGame: () => C.makeGame(),
  numSeats: () => 2,
  seatToMove: s => (s.result == null ? s.turn : null),   // turn 0/1 == seat
  isOver: s => s.result != null,
  applyIntent: (s, seat, i) => {
    if (s.result != null || s.turn !== seat) return s
    const m = C.legalMoves(s).find(mv => mv.from === i.from && mv.to === i.to && (mv.promo ?? null) === (i.promo ?? null))
    return m ? C.applyMove(s, m) : s
  },
  aiStep: s => C.aiMove(s),
  tickKey: s => `${s.fullmove}-${s.turn}-${s.result ?? ''}`,
}
```

## Making the component seat-relative

Replace the bespoke `useState` + `useAITurn` + `setS(apply…)` wiring with the hook:

```ts
import { useGameSession } from '../../net/useGameSession'
import { OnlineBar } from '../../framework/OnlineBar'
import { gameAdapter } from './net'

const { state: s, mySeat, isMyTurn, dispatch, newGame: netNew, net } = useGameSession(gameAdapter)
```

Then:
- **Delete** the game's own `useAITurn(...)` call — the hook drives AI for empty seats.
- `dispatch(intent)` instead of `setS(p => apply(p, …))`. Build a JSON intent.
- Derive "your side" from `mySeat` (map seat→turn encoding), NOT a hardcoded color.
  `const myTurnVal = SIDE[mySeat]` and use it everywhere the code hardcoded the human side.
- `yourTurn = !over && isMyTurn`. Use this for clickability/highlights.
- Make banners/result/player-panels **relative to `mySeat`** (you win iff your side won).
  When `net.online`, call the opponent "Opponent" instead of "Engine"/"Rival".
- For board games where the human sat at the bottom, optionally flip the board when
  `mySeat !== 0` so the local player's pieces are nearest them (see chess's `order`/`flip`).
- Render `<OnlineBar net={net} />` somewhere in a side panel.
- `newGame()` should call `netNew()` plus reset local UI state (selection, etc.).

Keep solo play identical: in local mode `mySeat` is 0 and seats 1+ are AI, exactly as before.

## Tests — `src/games/<id>/<id>.net.test.ts`

Three parts (the integration test is what proves the online path headlessly):

```ts
import { describe, it, expect } from 'vitest'
import { gameAdapter as A } from './net'
import { HostSession, GuestSession } from '../../net/session'
import { memoryPair } from '../../net/transport'

describe('<id> net adapter', () => {
  it('round-trips a legal intent and rejects illegal/out-of-turn', () => {
    const s = A.makeGame()
    expect(A.seatToMove(s)).toBe(0)
    // apply a legal seat-0 intent -> state changes, turn passes
    // apply an out-of-turn intent (seat 1) -> returns the SAME state (===)
    // apply an illegal intent -> returns the SAME state (===)
  })

  it('host + guest stay in sync over an in-memory transport', () => {
    const host = new HostSession(A)
    const [a, b] = memoryPair(); host.addGuest(a)
    const guest = new GuestSession(A, b)
    expect(guest.mySeat()).toBe(1)
    // host (seat 0) plays a legal move via host.dispatchLocal(intent)
    // expect guest.isMyTurn() === true and guest.getState() reflects it
    // guest replies via guest.dispatch(intent); expect host.getFull() advanced
  })
})
```

For **hidden-information** games, also add a **leak test**: build the guest's view and
assert `JSON.stringify(view)` contains none of the other seats' secret ids/values.

## Rules

- Create/modify ONLY: `src/games/<id>/net.ts`, `src/games/<id>/<Component>.tsx`,
  `src/games/<id>/<id>.net.test.ts`. **Do NOT** edit `logic.ts`, `src/framework/*`,
  `src/net/*`, `vite.config.ts`, `src/data/*`, or any other game's folder.
- Before finishing, run from `web/`: `npx tsc --noEmit -p tsconfig.app.json` (clean) and
  `npx vitest run src/games/<id>` (green). Fix anything that fails.
- Solo play must still work unchanged.
```
