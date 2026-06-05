# Handoff: Super Board Game Game — Playable Game Library

## Overview

**Super Board Game Game** is a library of ~115 classic and modern tabletop games, each presented as a self-contained, playable single-screen web implementation with a one-on-one AI opponent (or a solitaire/co-op flow where the game is single-player or cooperative). A selection shell ("Game Library") lets users browse, filter, and launch any game.

This handoff covers the **playable game pages** (~90 games hand-built in this engagement, listed below) and the **library shell** that links them.

## About the Design Files

The files in this bundle are **design references created in HTML/CSS + React (via in-browser Babel)** — working prototypes that show the intended look, layout, theming, and interaction model for each game. They are **not** intended to be shipped as-is.

The task is to **recreate these designs in the target codebase's environment**, using its established framework, component patterns, state management, and build pipeline. If no environment exists yet, choose an appropriate stack (the prototypes map most naturally onto **React + TypeScript with a bundler**, since the UI is already React, but the architecture is framework-agnostic — see "Architecture" below).

Each prototype cleanly separates **pure game logic** from **presentation**, so the logic layer can largely be ported verbatim while the view layer is rebuilt in the target component system.

## Fidelity

**High-fidelity (hifi).** Every game page is a pixel-considered, fully-themed mockup with final colors, typography, spacing, bespoke iconography, animations, and a complete working rule engine + AI. Recreate the UI faithfully using the codebase's component library, and port the logic modules with their behavior intact. Each game has its own distinct visual theme (see "Per-Game Theming").

---

## Architecture

Every playable game follows the **same three-file + entry pattern**, all under `/games/`:

| File | Role | Loaded as |
|---|---|---|
| `<Game Name>.html` | Entry point. Pulls in React 18.3.1 + ReactDOM + Babel standalone (pinned CDN URLs w/ SRI), the game's fonts, its CSS, then the logic + UI scripts. Renders into `<div id="root">`. | — |
| `<game>_logic.jsx` | **Pure game logic.** Rules, state transitions, win detection, and AI. Exposes a single global object, e.g. `window.SkullKingLogic`. No React, no DOM. Plain `<script>`. | `<script src>` |
| `<game>.jsx` | **React UI.** Reads the logic global, renders the board/cards/dice, handles input, drives the AI on a timer. `<script type="text/babel">`. | Babel |
| `<game>.css` | **Bespoke theme** for that one game (color tokens, typography, board, pieces, panels, modals). | `<link>` |

A few logic-heavy games split further (e.g. `azul_logic.jsx` + `azul.jsx`, or shared data files like `word_dict.js`). Card/word games may ship a data module (dictionary, deck).

### Entry HTML (canonical template)

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Skull King · Super Board Game Game</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@500;600;700&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="skull_king.css" />
</head>
<body>
  <div id="root"></div>
  <script src="https://unpkg.com/react@18.3.1/umd/react.development.js" integrity="sha384-…" crossorigin="anonymous"></script>
  <script src="https://unpkg.com/react-dom@18.3.1/umd/react-dom.development.js" integrity="sha384-…" crossorigin="anonymous"></script>
  <script src="https://unpkg.com/@babel/standalone@7.29.0/babel.min.js" integrity="sha384-…" crossorigin="anonymous"></script>
  <script src="skull_king_logic.jsx"></script>
  <script type="text/babel" src="skull_king.jsx"></script>
</body>
</html>
```

> In production, drop the CDN-React + in-browser Babel approach. Compile JSX at build time and import the logic module normally. The CDN/Babel setup exists only so the prototypes run by opening a file.

### Logic module shape

Each `*_logic.jsx` is an IIFE that builds an immutable-style state object and pure transition functions, then assigns them to a `window.*Logic` global. State is treated as immutable — every action returns a new state object (`Object.assign({}, s, …)`), which ports directly to a reducer / store action in any framework. Example surface (Skull King):

```js
window.SkullKingLogic = {
  makeInitial, submitBid, playCard, collectTrick, nextRound, aiStep,
  legalPlays, isLegal, resolveTrick, cardLabel, …
};
```

The UI never mutates state directly: it calls a logic function and `setState`s the result. The AI is exposed as a function (`aiStep`, `aiMove`, `aiTurn`, …) that the UI invokes on a `setTimeout` so the opponent appears to "think."

### UI module shape

A single React tree (function components + hooks, no JSX class components). Common conventions across all games:
- A top `<App>` holding the whole game state in `useState(() => Logic.makeInitial())`.
- An effect that runs the AI when it's the opponent's turn: `useEffect(() => { if (!s.winner && s.turn === "ai") t = setTimeout(() => setS(p => Logic.aiStep(p)), 600); }, [s.turn, …])`.
- Keyboard shortcuts via a `keydown` effect: **N** = new game, **?** = rules, **Esc** = close/cancel/deselect (plus game-specific keys like **Space** = roll, **R** = rotate).
- Rules modal + win/result modal components at the bottom of the file.
- `ReactDOM.createRoot(document.getElementById("root")).render(<App />)`.

---

## Shared Page Layout (every game)

All games share a consistent screen skeleton. Recreate this as a reusable layout shell:

```
.app  (grid-template-rows: auto auto 1fr; height: 100vh; max-width ~1060–1280px; centered)
├── .masthead   (grid: 1fr auto 1fr)
│   ├── .back-link  ← "library" link back to ../Game Library.html (mono, uppercase, arrow icon)
│   ├── .title-block  (center: SVG logo mark + eyebrow + H1 title + italic subtitle)
│   └── .tools  (right: "Rules" button + primary "New Game" button)
├── .modebar   (grid: 1fr auto 1fr)
│   ├── .mb-l   (left status, mono uppercase — e.g. "Round 3 / 10")
│   ├── .turn-banner   (center, large display font — current prompt / turn / result)
│   │      modifier classes: .you / .foe / .win / .lose
│   └── .mb-r   (right: keyboard hint, e.g. "N · new   ? · rules")
└── .stage   (grid: <board area> <side panel ~230–320px>; the play area)
    ├── board / table / felt column
    └── .side  (panels: scores, hand, log, controls)
```

Structural CSS values are consistent across games (only the color/font tokens change per theme):
- Masthead padding `13px 30px 3px`; modebar `2px 30px 6px`; stage `6px 28px 16px`.
- `.tool-btn`: mono 11px, 600, uppercase, letter-spacing 0.1em, padding `9px 13px`, radius 8px, 1.5px border. `.primary` variant fills with the theme accent.
- `.panel`: theme `--panel-2` bg, 1.5px `--line` border, radius 12–13px, padding ~12px.
- `.panel-l`: mono 9px, uppercase, letter-spacing 0.16em, muted — panel label.
- `.turn-banner`: display font, ~20–23px, weight 600–700.
- `.log-line`: 11px, line-height 1.5; classes `.you` (accent), `.ai` (foe color), `.sys` (muted italic).
- Modals: fixed full-screen `.overlay` (bg `rgba(…,0.8)`, `backdrop-filter: blur(4px)`), centered `.modal` (max-width ~510px, radius 18px, padding `26px 30px`). Header `.modal-eye` (mono, letter-spacing 0.3em, accent) + `.modal-title` (display, ~31–34px) + `.modal-body` + `.modal-actions`.

---

## Design Tokens

There is **no single global palette** — each game defines its own token set in a `:root` block at the top of its CSS, tuned to a theme (jeweller's velvet, Viking birch, deep-space console, terracotta clay, casino felt, etc.). The **token *names* are consistent**, so a shared token contract can be defined and themed per game:

```css
:root {
  --bg, --bg-2;                 /* page background, darker */
  --panel, --panel-2;           /* raised surfaces */
  --ink, --ink-2, --ink-3;      /* text: primary, secondary, muted */
  --line, --line-2;             /* borders: subtle, stronger */
  --gold/--accent + -d + -hi;   /* primary accent, darker, highlight (name varies per theme) */
  --good, --warn, --bad;        /* semantic status */
  /* + game-specific tokens: piece colors, suit colors, board colors */
  --sans:    "Inter", system-ui, sans-serif;     /* body — consistent across all games */
  --display: "<theme serif/display>", …;          /* headings — varies per game */
  --mono:    "JetBrains Mono", monospace;          /* labels/HUD — consistent across all games */
}
```

**Typography system (consistent across all games):**
- **Body / UI text:** `Inter` (400–700).
- **Labels, HUD, keyboard hints, eyebrows:** `JetBrains Mono` (400–600), uppercase, wide letter-spacing.
- **Display / headings / titles / scores:** a per-game display face that sets the theme, e.g. Cinzel (Skull King), Saira Condensed (Stratego), Spectral (Sudoku), Marcellus (Surakarta), Chakra Petch (The Crew), Jost (The Mind), Space Grotesk (Tic-Tac-Toe), Bitter (Tiny Towns), Sora (Trax/Yinsh/ZÈRTZ), Cormorant Garamond (Tak), Caudex (Tablut), Gowun Batang (Tsuro), Outfit (TwixT), Lora (Wari), Poppins (Welcome To…), Source Serif 4 (Wingspan), Fraunces (Word/Yote), Noto Serif SC (Xiangqi), Rubik (Yahtzee/Zombie Dice).
- Minimum on-screen sizes respected: board/HUD text ≥ 11px; large prompts 20px+.

**Spacing / radius / shadow conventions (consistent):**
- Radii: buttons 8–9px, panels 12–13px, modals 18px, board/cards 8–16px.
- Borders: 1.5px standard, 2–3px for boards/emphasis.
- Panel/card shadows: soft, e.g. `0 16px 40px rgba(0,0,0,0.5)` for boards, `0 30px 70px rgba(0,0,0,0.6)` for modals.
- Stage gap: `clamp(14px, 2vw, 26–40px)`.

---

## Sizing & Responsiveness

Games are **single-screen, no page scroll** (`height: 100vh; overflow: hidden`). The board scales to the viewport using `clamp()` / `min()` on a CSS variable, e.g.:

```css
.board { --cell: clamp(34px, min(7.4vh, 4.6vw), 52px); }
```

> **Important porting note:** prefer **fixed or `min()`-capped** sizes for piece/dice/tile elements over raw `vw`/`vh` where exact dimensions matter — during development a die sized with `8vw` overflowed its column on wide viewports. Inline-style or hard-capped sizes proved most reliable. Side panels are fixed-width (~230–320px); the board area takes the remaining space.

---

## Interactions & Behavior (shared patterns)

- **Turn loop:** human acts → state updates → if it becomes the AI's turn, a `setTimeout` (~400–900ms) runs the AI function and updates again. Always `clearTimeout` on cleanup.
- **Selection model (board games):** click your piece → legal destinations highlight (dots for moves, rings/red for captures) → click a destination to move; click elsewhere/Esc to deselect.
- **Multi-step actions** (e.g. Tak stack carry/drop, ZÈRTZ place-then-remove, Yote capture-then-pull, Yahtzee roll-then-hold) use a small local UI state machine layered over the logic state.
- **Press-and-hold / real-time** where the game demands it (The Mind uses a `setInterval` clock; AI "players" act when their value-timed moment arrives).
- **Animations:** entrance/drop animations on pieces and dice (CSS keyframes). **Gate any `opacity:0 → 1` entrance animation so the visible end-state is the default** — preview iframes can freeze a backgrounded animation at frame 0 and hide content. Prefer animating `transform` only.
- **Win/result:** logic sets `s.winner`; UI shows the result modal with a "Play again" action.
- **Keyboard:** N / ? / Esc universally; game-specific keys documented in each rules modal.

---

## State Management

Per game, a single immutable state object holds everything: board/cards/dice, whose turn, scores, phase, pending sub-action, winner, and a capped activity `log` array. All transitions are pure functions returning new state. This maps cleanly to:
- React `useReducer` or a store (Zustand/Redux) with the logic functions as reducers/actions, **or**
- keeping the logic module as a pure TS module and calling it from component state (closest to the prototype).

No network/data-fetching anywhere — games are fully local. The AI is synchronous and deterministic given `Math.random()`; for testability you may inject a seeded RNG.

---

## The Library Shell

Files at project root drive the browse/launch screen:

| File | Role |
|---|---|
| `Game Library.html` | Entry for the selection screen. |
| `app.jsx` | The library React app: search, category filter, game grid/cards, and a `PLAYABLE` map (`game.id → "games/<Name>.html"`) that turns a card into a launch link. |
| `games-data.js` | The catalog: array of `{ id, name, cat, type, desc, time, complex, variants }`. `type` drives the generated thumbnail style; `cat` drives filtering. |
| `selection.css` | Theme for the library screen. |
| `tweaks-panel.jsx` | Optional in-page "tweaks" panel scaffold (host-protocol controls). |

To add/register a playable game: add its entry to `PLAYABLE` in `app.jsx` keyed by the catalog `id`, pointing at the game's HTML file. Cards for non-playable games still render but don't launch.

---

## Games Included (playable, this engagement)

Skull King · Stratego · Sudoku · Surakarta · Sushi Go! · Tablut · Tak · The Crew · The Mind · Tic-Tac-Toe (incl. Ultimate) · Tiny Towns · Trax · Tsuro · TwixT · Wari · Watergate · Welcome To… · Wingspan Card · Word Game · Xiangqi · Yahtzee · Yinsh · Yote · ZÈRTZ · Zombie Dice — plus the earlier A–S catalog (Abalone through Splendor) following the identical architecture. The full registry lives in `app.jsx` (`PLAYABLE`) and `games-data.js`.

Game families & representative mechanics to preserve when porting:
- **Perfect-information abstracts** (Tic-Tac-Toe, Xiangqi, Yinsh, Trax, TwixT, Surakarta, Tablut, Tak, Yote, ZÈRTZ): minimax/alpha-beta or heuristic AI; exact rule engines (check/mate, connection wins, custodial/loop/forced captures, road/flat scoring).
- **Trick-taking** (Skull King competitive; The Crew cooperative): follow-suit, trumps, bidding/tasks, co-op-aware AI.
- **Push-your-luck / dice** (Yahtzee, Zombie Dice): roll/hold/bank, bust rules, category scoring, press-luck AI.
- **Engine / set / tile builders** (Wingspan Card, Tiny Towns, Welcome To…, Sushi Go!, Sudoku, Word Game): resource engines, pattern matching, draft-and-score, generators, dictionary validation.
- **Hidden info / asymmetric** (Stratego, Watergate, The Mind): fog of war, asymmetric win conditions, real-time timing.

Each game's exact rules, scoring tables, and AI heuristics are encoded in its `*_logic.jsx` — **treat that file as the spec** for that game's behavior.

---

## Files in This Bundle

Representative, fully-worked examples (one per major family) are included so the per-game pattern is concrete; the rest of the library follows the identical structure in the main project's `/games/` folder.

```
design_handoff_super_board_game_game/
├── README.md                       ← this file
├── shell/                          ← the library/browse screen
│   ├── Game Library.html
│   ├── app.jsx
│   ├── games-data.js
│   ├── selection.css
│   └── tweaks-panel.jsx
└── examples/                       ← one complete game per family (HTML + logic + UI + CSS)
    ├── strategy_xiangqi/           ← perfect-info board game + alpha-beta AI
    ├── trick_skull_king/           ← competitive trick-taking + bidding
    ├── coop_the_crew/              ← cooperative trick-taking
    ├── dice_yahtzee/               ← push-your-luck dice + scorecard
    ├── builder_tiny_towns/         ← solitaire pattern-building + scoring
    └── connection_yinsh/           ← GIPF-style ring/marker game
```

To see any other game, open its four files in the main project's `/games/` directory (`<Name>.html`, `<game>.jsx`, `<game>_logic.jsx`, `<game>.css`).

## Implementation Recommendation

1. Build the **shared layout shell** first (masthead / modebar / stage / side panels / modal primitives) as reusable components with the token contract above, themeable per game.
2. Port one game per family from `examples/` to validate the logic-module → store/reducer mapping and the view conventions.
3. Port the remaining games: lift each `*_logic.jsx` largely verbatim (it's framework-agnostic pure functions) and rebuild its view against the shared shell with that game's token theme + display font.
4. Wire the **library shell** (`games-data.js` catalog + `PLAYABLE` map) to route to each implemented game.
```
