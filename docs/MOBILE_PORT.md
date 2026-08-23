# Taking Super Board Game Game Mobile

**Status:** analysis and planning only — no code changes proposed here have been made.
**Scope:** what it would take to ship the 244-game library as an iOS + Android app.
**Date:** August 2026

---

## 1. The short version

The game *logic* is in good shape and is the valuable asset. The problem is that this
program's entire input/output model — a TTY that you `print()` to and `input()` from —
**does not exist on iOS at all**, and is not a user-facing surface on Android. This is not a
styling problem that a mobile-friendly theme can solve. Per the CPython iOS documentation,
mobile devices "do not provide a TTY-style console and do not provide stdin, stdout or
stderr."

So the port is not "make the terminal look nice on a phone." It is:

1. **Separate the rules from the terminal.** Today they are interleaved — 64 game modules
   stop and ask a human a question from inside `make_move()`, a method the engine calls
   expecting a pure state transition.
2. **Build a real touch UI** for roughly a half-dozen interaction families.
3. **Do per-game triage** across 244 games / 514 variations. This is the bulk of the cost and
   it does not compress well.

There is an important asset already in the repo: `design/` contains a high-fidelity React
design handoff for the library shell and ~90 games. **It is a parallel reimplementation, not
a port** — its rules live in `*_logic.jsx`, written independently of the Python. Reconciling
those two codebases is a decision that has to be made early (§4.1), because it changes
everything downstream.

---

## 2. What exists today

Measured from the current tree, not estimated.

| | |
|---|---|
| Game modules | 244 registered (`games/*.py`), 514 game+variation combinations |
| Game code | 145,417 lines |
| Engine | 1,416 lines (`engine/base.py` 246, `engine/menu.py` 1,133) |
| `engine/menu.py` split | 747 lines are the `GAME_REGISTRY` data table; 386 lines are terminal UI |
| Third-party dependencies | **none** — pure stdlib (`random`, `copy`, `collections`, `itertools`, `json`, `re`, `heapq`, `abc`) |
| Type annotations | none |
| Tutorial text | 244 tutorials, ~482 KB of prose |
| Design handoff | `design/` — React/JSX prototypes, 29 files, ~5,310 lines (shell + 6 example games) |

**Terminal coupling, counted:**

| Signal | Count |
|---|---|
| `print()` calls | 6,814 |
| `input_with_quit()` calls | 740 |
| Raw `input()` calls | 47 |
| `clear_screen()` calls | 168 |
| `os.system()` calls | 1 |
| Files using raw ANSI escape codes | 30 |
| Files using box-drawing characters | 26 |
| Literal input prompts | 695, across 224 of 244 modules |

**What the architecture gets right**, and which the port should preserve:

- `BaseGame` already defines a clean contract: `setup / display / get_move / make_move /
  check_game_over / get_state / load_state`.
- `get_state()` / `load_state()` already round-trip through JSON. State is small — median
  1.1 KB, 90th percentile 3.8 KB, largest 21.5 KB (Innovation). This is a ready-made
  save-game and cloud-sync payload.
- The AI is cheap. At `hard` difficulty on desktop CPython the worst single move across all
  244 games is **341 ms** (Tic-Tac-Toe 3×3); only 4 games exceed 100 ms and none exceed 1 s.
  Even at a 3–5× mobile/interpreted penalty this stays inside a "the opponent is thinking"
  animation. **AI performance is not a porting risk.**
- No network calls anywhere. Fully offline by construction — a genuine product advantage.

---

## 3. The blockers, in order of severity

### 3.1 Blocking I/O inside the rules engine — the hard one

The engine's contract is that `make_move(move)` applies a move and returns a bool. In 64
modules it instead *stops and asks the human a follow-up question* via `input_with_quit()`:

```
make_move          64 modules
check_game_over     6 modules
setup               3 modules
get_ai_move         1 module
                   ─────────
                   66 distinct modules
```

Examples: `coup` (challenge/block prompts mid-resolution), `ticket_to_ride_card` (ticket
selection during `setup`), `race_for_the_galaxy` (role choice from inside `get_ai_move`),
`battleship`, `hearts`, `yahtzee`, `power_grid`, `sudoku`, `minesweeper`.

A terminal can do this because `input()` blocks the whole program. **A touch UI cannot.** A
mobile app has an event loop; you cannot block it waiting for a tap without freezing the
frame. Every one of these needs to become an explicit state machine:

```
make_move(move) -> Result
    where Result is either  APPLIED(new_state)
                     or     NEEDS_INPUT(prompt_spec)   # UI renders it, calls back
```

This is the single largest and least mechanical piece of work. It cannot be automated,
because deciding what the intermediate states *are* requires understanding each game's rules.
**Estimate: 64 modules × meaningful redesign each.**

### 3.2 Five games bypass the engine loop entirely

`battleship`, `blackjack`, `ludo`, `parcheesi`, `ur` override `play()` and run their own
loop. Any headless engine must either absorb these or they get rewritten. They are also the
games most likely to hide extra terminal assumptions.

### 3.3 The screens do not fit a phone

Rendered width of one `display()` call, measured across all 244 games:

- median **60 columns**, 90th percentile **83**, maximum **188** (Samurai)
- median **24 rows**, maximum **121**
- **217 of 244 games (89%) render wider than 40 columns**

A phone in portrait at a legible font size gives roughly 30–40 columns. So the cheapest
conceivable option — ship the existing terminal UI inside a mobile terminal emulator — fails
for the overwhelming majority of the library. This measurement is the main justification for
building a real UI rather than a shim.

### 3.4 Filesystem assumptions

`engine/base.py` computes `SAVE_DIR` as a `saves/` folder **next to the source code**. On both
iOS and Android the app bundle is read-only; writes must go to the platform's designated
container (`Application Support` / `getFilesDir()`). One-line change, but it will fail 100% of
the time until made, and it needs a migration story once real users have saves.

### 3.5 Interaction grammar is text-shaped

The 695 literal prompts break down roughly as:

| Grammar | Prompts |
|---|---|
| Coordinate / move strings (`"c3 d3"`, `"e2 e3"`, `"3,4"`, `"P*e3"`) | 312 |
| Acknowledgement (`"Press Enter to continue..."`) | 226 |
| Index into a list (`"Replace which card? (1-4)"`) | 72 |
| Menu letter / yes-no | 72 |
| Free text (a word) | 9 |
| Numeric amount (a bid) | 4 |

The 226 "Press Enter" prompts are the easy case — they become tap-to-continue, or better,
disappear into animation timing. The 312 coordinate prompts are the interesting ones: on a
phone nobody should ever type `c3 d3`. That interaction must become *tap the piece, see legal
destinations highlight, tap one* — which requires something the engine does not currently
expose: **a legal-move enumerator**.

### 3.6 There is no `get_legal_moves()`

Today the only way to know whether a move is legal is to attempt it and see if `make_move`
returns `False`. Touch UI needs the opposite: given a tapped piece, *show me every square it
can go to* before the player commits.

Some AI implementations already enumerate moves internally and could be refactored to expose
it. Many do not. This is a per-game addition to the `BaseGame` contract and is a prerequisite
for the tap-tap interaction model in §6.

---

## 4. Strategy options

### 4.1 The decision that comes first: which codebase is the source of truth?

The repo contains two implementations of overlapping games:

- **Python** — 244 games, complete, and (as of the recent audit) verified to run to completion
  across every game and variation, with save/resume round-tripping.
- **`design/*_logic.jsx`** — an independent JS reimplementation, ~90 games claimed, 6 present
  in this repo. High-fidelity visual design, and its README explicitly says "treat that file
  as the spec" for game behaviour.

These will have diverged in rules and edge cases. **Do not plan to maintain both.** The three
honest positions:

1. **Python is truth; the JSX is a visual spec only.** Keeps the audited, tested logic. Costs
   a Python runtime on device (§4.2 option B) or a transpile effort.
2. **JS is truth; retire the Python.** Best mobile-native path, but discards the 145k lines of
   audited logic and the bug-fix work, and the JSX covers ~90 games not 244.
3. **Port Python → TypeScript game by game, with the Python as the conformance oracle.** Most
   expensive up front, best long-term. The Python suite can be used to generate golden test
   vectors (seeded game transcripts) that the TS port must reproduce — this is a genuinely
   strong option because the state is already JSON-serializable.

My recommendation is **(3), staged** — see §9. But this is a product/ownership call, not a
technical one, and it should be made explicitly rather than by drift.

### 4.2 Runtime options

| Option | What it is | Verdict |
|---|---|---|
| **A. Terminal emulator app** | Ship the TTY UI inside a mobile terminal | **Rejected.** 89% of games exceed a phone's usable column count (§3.3); also likely to fail App Store 4.2 "beyond a repackaged website / app-like" |
| **B. Embedded CPython + native UI** | Bundle libPython (Tier 3 supported since 3.13 via PEP 730/738), native Swift/Kotlin UI calls into it | Viable and keeps the audited logic. Costs: no subprocess/multiprocessing/IPC on iOS; the stdlib needs patching to pass App Store automated checks; app size grows by the interpreter + stdlib; two native UIs to build |
| **C. Python → WASM (Pyodide) in a webview** | Run the Python unmodified in a browser runtime | **Rejected for shipping.** Multi-megabyte runtime download, slow cold start, and materially slower than CPython — all cost paid for logic that is already cheap (§2) |
| **D. Port logic to TypeScript, React Native / Expo UI** | One codebase, native shell, JS logic | Best mobile ergonomics and smallest binary; highest up-front port cost; directly reuses the existing React design work |
| **E. Flutter / Dart** | One codebase, excellent rendering | Same port cost as D but throws away the existing React prototypes |

**Recommendation: D**, using the Python suite as the conformance oracle for the port
(§4.1 option 3). Rationale: the AI is cheap so there is no performance argument for keeping
CPython; the design language already exists in React; and it sidesteps the App Store
interpreter grey area entirely.

**If keeping Python is a hard requirement**, choose B, and read §5.1 carefully.

---

## 5. Platform-specific requirements

### 5.1 iOS

- **No console I/O.** Per CPython's iOS documentation, iOS provides no TTY and no stdin,
  stdout or stderr. `print()`/`input()` are not a user interface. `stdout`/`stderr` *can* be
  redirected to the system log for debugging only.
- **No subprocess, multiprocessing, or IPC.** An iOS app that attempts to create a subprocess
  "will either lock up, or crash." Not currently used by this codebase — keep it that way.
- **Embedded mode only.** Python on iOS is usable only by writing a native app and embedding
  `libPython`.
- **App Store review, guideline 2.5.2** (verbatim): *"Apps should be self-contained in their
  bundles, and may not read or write data outside the designated container area, nor may they
  download, install, or execute code which introduces or changes features or functionality of
  the app…"* Bundling an interpreter to run your own bundled code is common and generally
  accepted; **downloading** game logic post-review is not. This rules out over-the-air
  content updates that ship new rules.
- **Guideline 4.2 (minimum functionality)** — an app must be more than a repackaged website.
  Relevant if the port is a thin webview wrapper.
- **Guideline 4.7** explicitly permits HTML5/JavaScript mini-games, which is a point in
  favour of the JS route.
- The Python standard library "contains some code that is known to violate these automated
  rules" and **must be modified** for an app to pass review — a real, ongoing maintenance tax
  on option B.

### 5.2 Android

- **Target API level: Android 16 (API 36) is required for new apps and updates from
  31 August 2026**, with an extension available to 1 November 2026. Existing apps must target
  at least API 35 to stay available to new users on newer devices. This is a live deadline
  *now*, not a future one.
- Android does have a stdout, but it goes to logcat — again, not a user interface.
- Larger device/OS matrix than iOS: plan for back-button handling, split-screen, foldables,
  and aggressive process death (see §7.3).

### 5.3 Both

- **Touch targets:** Apple HIG specifies a minimum 44×44 pt; Material Design specifies 48×48
  dp with 8 dp spacing. A 19×19 Go board or a 24×24 TwixT board cannot present every
  intersection at 44 pt on a phone — those games need pan/zoom, or a magnifier loupe, or a
  tablet-only designation. This needs a decision per large-board game.
- **Accessibility** is now a legal requirement in the EU under the European Accessibility Act
  for apps in scope. Colour-only piece differentiation (used widely in the current ANSI
  colouring) fails contrast/colour-independence requirements; screen-reader labelling of
  board state is a substantial design problem for 244 games and should be scoped, not
  discovered late.

---

## 6. Touch control design

Reusable interaction families, so that 244 games do not become 244 bespoke UIs. **Caveat:
I attempted to classify the library automatically twice, by code keywords and by prompt
grammar, and the two runs disagreed substantially** (e.g. Chess landed in different buckets).
The families below are sound; the per-game assignment needs manual triage, and that triage is
itself part of the work.

| Family | Gesture model | Engine support needed |
|---|---|---|
| **Single-target grid** (Connect Four, Reversi, Go, Gomoku, Minesweeper) | Tap a cell. Long-press to flag/preview. | Legal-cell set |
| **Source → destination** (Chess, Checkers, Xiangqi, Shogi, Abalone, Amazons) | Tap piece → legal destinations highlight → tap one. Drag-and-drop as an alternative, never the only path. | `get_legal_moves(from)` |
| **Card hand** (Hearts, Spades, Love Letter, Coup, Splendor) | Horizontally scrollable fan; tap to select, tap a zone to commit; the illegal cards dimmed. | Legal-play filter |
| **Dice / push-your-luck** (Yahtzee, Pig, Backgammon, Liar's Dice) | Big roll button; tap individual dice to hold; explicit Bank action. | Existing state is sufficient |
| **Tile with orientation** (Blokus, Cathedral, Tsuro, Carcassonne, Pentago) | Pick piece → rotate/flip control → ghost preview on the board → confirm. **Rotation must be a button, not a gesture** — pinch/twist conflicts with pan/zoom. | Placement validity preview |
| **Action menu / worker placement** (Power Grid, Res Arcana, Targi, Nusfjord) | Bottom sheet listing legal actions, then a sub-sheet for parameters. This is where the §3.1 state machine work pays off. | Explicit action enumeration |
| **Free text** (Boggle, Word Game, Jotto, Codenames Duet) | OS keyboard, with an on-screen letter tray for Boggle-style grids. | Dictionary validation (exists) |

**Cross-cutting touch rules:**

- **Confirmation for destructive/irreversible moves.** A misplaced tap in chess is a lost
  game. Either a confirm step or an undo affordance — and undo needs engine support the
  codebase does not have today (state snapshots are cheap, at ~1 KB, so this is feasible).
- **No hover.** Any information currently conveyed by "look at the board text" needs an
  explicit tap-to-inspect.
- **The 226 "Press Enter to continue" prompts** should mostly not become taps. They exist to
  paginate a scrolling terminal. On mobile most become animation beats or transient toasts;
  keeping them all as taps would make the games feel like paperwork.
- **Landscape vs portrait** must be decided per family — board games generally want portrait,
  card games with a wide tableau generally want landscape.

---

## 7. Considerations that are easy to miss

### 7.1 Content and store listing
- The README advertises **115 games; the registry actually contains 244.** Store metadata,
  screenshots, and marketing all need reconciling against reality.
- 482 KB of tutorial prose is a localization surface. English-only is a legitimate v1
  decision, but make it deliberately.
- Several games are recognizable implementations of **commercial, in-copyright designs**
  (Wingspan, Splendor, Azul, Res Arcana, Patchwork, Power Grid, Ticket to Ride, Carcassonne,
  and more). Game *mechanics* are generally not copyrightable but *names, artwork, and
  themes* are trademarked. Shipping a commercial app using these names is a legal exposure
  that must be reviewed before any store submission. This is the highest-severity non-technical
  risk in this document.

### 7.2 Persistence and sync
- Saves are small JSON (§2) — well suited to iCloud/Play Games sync.
- Needs a **schema version field**, which `get_state()` does not currently emit. Without it,
  any rules fix silently corrupts existing saves. Add before launch, not after.
- Mobile apps are killed without warning. Autosave must happen on every state transition, not
  on an explicit "suspend" action as the terminal version does.

### 7.3 Lifecycle
- The desktop assumption "the process lives until the player quits" is false on mobile.
  Backgrounding, incoming calls, and low-memory kills all need the game to resume exactly
  where it was — which the existing `get_state`/`load_state` supports, and which the recent
  audit verified round-trips correctly for all 244 games. **This is the single most valuable
  thing already in place.**

### 7.4 Non-determinism
- `games/splendor.py` calls `random.seed()` with no argument inside deck generation, reseeding
  the global RNG from system entropy. This makes runs unreproducible and would break both
  seeded replay and any golden-vector conformance testing (§4.1 option 3). Worth fixing
  regardless of platform.

### 7.5 Fairness and feel
- The engine currently sleeps 0.5 s to simulate AI thinking. On mobile that should be a real
  animation, and it should scale with move complexity so the AI feels considered rather than
  laggy.
- Several fixes from the recent audit introduced turn caps and repetition draws to guarantee
  termination. These are correct, but on mobile a game that ends in "draw by repetition" needs
  an explanation in the UI or it reads as a bug.

### 7.6 Monetization, if relevant
- 244 offline games with no network is an unusually good fit for a one-time purchase or a
  small paid tier, and a poor fit for ads (which would require adding the network dependency
  the app currently does not have, plus a privacy policy, ATT prompts on iOS, and a Play Data
  Safety declaration).

---

## 8. What does *not* need to change

Worth stating explicitly, because it bounds the work:

- The rules engines themselves. 145k lines of game logic, recently audited to run to
  completion across all 244 games × 514 variations, with clean save/resume. Whether it is
  executed as Python or ported to TypeScript, **the logic is the asset and it is sound.**
- The AI. Fast enough for mobile with large margin.
- The state model. Already JSON, already small, already round-trips.
- The `GAME_REGISTRY` table (747 lines) — this is data, and it maps almost directly onto the
  design handoff's `games-data.js` catalog.

---

## 9. Suggested phasing

Sequenced to de-risk early rather than to look fast.

**Phase 0 — Decisions (blocking everything).**
Source-of-truth codebase (§4.1). Runtime option (§4.2). Legal review of game names (§7.1).
Target device classes (phone-only vs phone+tablet, and what happens to 19×19 Go).

**Phase 1 — Engine separation, no UI.**
Extract a headless core from `engine/`. Add `get_legal_moves()` and a versioned state schema.
Convert the 64 blocking-`make_move` modules to explicit state machines (§3.1). Fix `SAVE_DIR`.
This is valuable on its own and is a prerequisite for every option in §4.2.

**Phase 2 — One game per interaction family, end to end.**
Six or seven games (§6), shipped to a device, including store submission dry-runs on both
platforms. Validates the touch model and the review process before committing to volume.

**Phase 3 — Volume port.**
The remaining games, family by family. This is where the per-game triage cost lands and it is
roughly linear in game count — the honest planning assumption is that **244 games is the
dominant cost of the project**, not the engine work.

**Phase 4 — Store readiness.**
Accessibility pass, localization decision, Play target-API compliance (§5.2 — note the
31 August 2026 deadline), privacy declarations, sync.

**On effort:** I am deliberately not giving a total figure. The engine work in Phase 1 is
estimable (64 modules of known shape plus ~1,400 lines of engine). Phase 3 is not, until
Phase 2 has produced a real per-game cost from a representative sample. Anyone quoting a
number before Phase 2 is guessing.

---

## References

- Apple, *App Store Review Guidelines* (2.5.2, 4.2, 4.7) — https://developer.apple.com/app-store/review/guidelines/
- Python, *Using Python on iOS* — https://docs.python.org/3/using/ios.html
- PEP 730, *Adding iOS as a supported platform* — https://peps.python.org/pep-0730/
- PEP 738, *Adding Android as a supported platform* — https://peps.python.org/pep-0738/
- Google Play, *Target API level requirements* — https://support.google.com/googleplay/android-developer/answer/11926878
- Pyodide, *Downloading and deploying* — https://pyodide.org/en/stable/usage/downloading-and-deploying.html
- `design/README.md` in this repository — the existing React design handoff
