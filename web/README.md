# Super Board Game Game — Web

A React + TypeScript + Vite rebuild of the design handoff in [`../design/`](../design):
a "Game Library" selection screen plus self-contained, playable game pages with an AI
opponent. This is the real, compiled app (no CDN React / in-browser Babel) — the
prototypes in `../design/` remain the visual reference.

The library shell + the framework + **fifty-three fully-playable games** are done (6 ported
from the design prototypes + 47 built from scratch on the framework). The latest batch added
Backgammon, Love Letter, No Thanks!, Zombie Dice, Royal Game of Ur, Shut the Box, Coloretto,
and Entropy. Highlights of the
later batches: classic abstracts (Quoridor, Quarto, Pentago, Nine Men's Morris, Ataxx,
Konane, Pong Hau K'i, Fox & Hounds, Amazons, Lines of Action, Santorini, Tablut, Surakarta,
Yote, Alquerque, Dara, Fanorona, Abalone, Kamisado), connection/territory (Hex, Pente, Tsuro),
solo puzzles (Sudoku, Minesweeper, Mastermind), and dice/card games (Pig, Liar's Dice).
Originally:

- **Ported from the design handoff prototypes** (6): Yahtzee, Xiangqi, Skull King,
  The Crew, Yinsh, Tiny Towns.
- **Built from scratch on the framework** (15) — the remaining catalog games have no
  prototypes, so these were designed + implemented directly: Tic-Tac-Toe (perfect minimax),
  Connect Four (alpha-beta), Reversi (positional alpha-beta), Checkers (alpha-beta, mandatory
  captures), Gomoku (threat heuristic), Nim (perfect nim-sum), Dots and Boxes (safe-move
  heuristic), Blackjack (fixed-rule dealer), Mancala/Kalah (alpha-beta + extra-turns),
  Breakthrough (alpha-beta), Pig (push-your-luck, hold-at-20 AI), Mastermind (deduction),
  Battleship (hunt/target AI), Onitama (alpha-beta over move cards), Hex (connection-distance
  heuristic).

The other ~85 catalog games still render cards but show a "coming soon" notice on launch.

Each game from `breakthrough` onward also ships a Vitest logic test
(`src/games/<id>/<id>.test.ts`) that plays full games against its own AI and asserts
invariants. Run the whole suite in parallel with `npm test`.

## Run

```bash
cd web
npm install
npm run dev       # dev server at http://localhost:5173
npm run build     # type-check + production build to dist/
npm run preview   # serve the production build
```

## How it's organized

It's a **multi-page app** (Vite MPA): the library is the root entry and every game is
its own HTML entry. This mirrors the handoff's "one self-contained page per game" model
and keeps each game's global CSS (`.app`, `.masthead`, `.modal`, …) isolated from the
library's. Navigation between screens is plain `<a href>`.

```
index.html                  library entry  -> src/shell/main.tsx
games/yahtzee.html          game entry     -> src/games/yahtzee/main.tsx
src/
  types.ts                  catalog types (Game, Category)
  data/
    games.ts                GAMES[] + CATEGORIES[]  (ported from games-data.js)
    playable.ts             id -> built game page (which games can actually launch)
  framework/                SHARED, reused by every game:
    tokens.css                token contract + structural classes (.app/.masthead/...)
    GameShell.tsx             masthead + modebar + stage skeleton
    Modal.tsx                 overlay + modal primitive (rules / result)
    useAITurn.ts              drives the AI opponent on a timer
    useGameKeys.ts            N = new · ? = rules · Esc = close (+ per-game keys)
  shell/                     the library selection screen
    LibraryApp.tsx, GameCard.tsx, GameModal.tsx, GameTypo.tsx, selection.css
    tweaks/                   the appearance/layout/sort panel (useTweaks + TweaksPanel)
  games/
    yahtzee/  xiangqi/  skull_king/  the_crew/  yinsh/  tiny_towns/
                              each: logic.ts (pure rules + AI) · <Game>.tsx (UI) · <game>.css
```

### The token contract

`framework/tokens.css` owns the shared page skeleton and reads a fixed set of CSS custom
properties; each game's theme CSS supplies the values in a `:root` block. The names:

```
Surfaces  --bg --bg-2 --panel --panel-2
Text      --ink --ink-2 --ink-3
Lines     --line --line-2
Primary   --accent --accent-d --accent-hi       (buttons)
Trim      --trim --trim-hi                       (eyebrow, hovers, modal eye)
Turn      --you --foe                            (banner colors)
Status    --good --warn
Fonts     --sans --display --mono
```

## Adding a game

Each game follows the same shape Yahtzee does (logic / UI / theme):

1. **`src/games/<id>/logic.ts`** — port the prototype's `*_logic.jsx`: drop the IIFE +
   `window.*Logic` global, export the pure transition functions and a `State` type. The
   bodies (immutable `Object.assign(...)` transitions) port over almost verbatim.
2. **`src/games/<id>/<Game>.tsx`** — port the `*.jsx` UI: render through `GameShell` +
   `Modal`, drive the AI with `useAITurn` and shortcuts with `useGameKeys`.
3. **`src/games/<id>/<game>.css`** — the `:root` token values + game-specific board
   classes (the shared shell already lives in `tokens.css`).
4. **`src/games/<id>/main.tsx`** — import `framework/tokens.css` + the game CSS, mount it.
5. **`games/<id>.html`** — entry HTML (copy `games/yahtzee.html`, swap the title, fonts,
   and the `main.tsx` path).
6. Register the entry in **`vite.config.ts`** (`rollupOptions.input`) and add the row to
   **`src/data/playable.ts`** so the library can launch it.

## Notes

- `tsconfig.app.json` runs with relaxed strictness for this first port of the
  dynamically-typed prototype code (module boundaries are typed; internals are loose).
  Tightening to full strict is a follow-up.
- Google Fonts are loaded per-entry via `<link>` in each HTML file.
