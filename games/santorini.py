"""Santorini - Abstract strategy board game of building and climbing."""

from engine.base import BaseGame, input_with_quit, clear_screen


class SantoriniGame(BaseGame):
    """Santorini board game.

    A 2-player strategy game on a 5x5 grid. Each player has 2 workers.
    Players take turns moving a worker to an adjacent square and then
    building on an adjacent square. A worker can climb up at most 1 level
    but can descend any number of levels. The first player to move a
    worker onto level 3 wins.
    """

    name = "Santorini"
    description = "Abstract strategy game of building and climbing"
    min_players = 2
    max_players = 2
    variations = {
        "standard": "Standard 5x5 Santorini",
        "simple": "No god powers, simpler display",
    }

    # Worker labels per player
    WORKER_LABELS = {1: ["A", "B"], 2: ["Y", "Z"]}

    def __init__(self, variation=None):
        super().__init__(variation)

    def setup(self):
        """Initialize an empty 5x5 board with no workers placed."""
        # board[r][c] = building level (0-3), 4 means dome/capped
        self.board = [[0 for _ in range(5)] for _ in range(5)]
        # workers: dict mapping label -> (row, col) using 0-indexed coords internally
        self.workers = {}
        # phase: "place" or "move"
        self.phase = "place"
        # Track how many workers have been placed (total across both players)
        self.workers_placed = 0

    def _adjacent(self, r, c):
        """Return list of (row, col) adjacent squares (8 directions)."""
        adj = []
        for dr in (-1, 0, 1):
            for dc in (-1, 0, 1):
                if dr == 0 and dc == 0:
                    continue
                nr, nc = r + dr, c + dc
                if 0 <= nr < 5 and 0 <= nc < 5:
                    adj.append((nr, nc))
        return adj

    def _occupied(self, r, c):
        """Check if a square has a worker on it."""
        for pos in self.workers.values():
            if pos == (r, c):
                return True
        return False

    def _worker_at(self, r, c):
        """Return the worker label at (r, c) or None."""
        for label, pos in self.workers.items():
            if pos == (r, c):
                return label
        return None

    def _owner(self, label):
        """Return the player number (1 or 2) that owns a worker label."""
        if label in ("A", "B"):
            return 1
        return 2

    def display(self):
        """Display the 5x5 grid with levels and worker letters."""
        simple = self.variation == "simple"

        print(f"\n  Santorini   Turn {self.turn_number}")
        print(f"  {self.players[0]} (A,B) vs {self.players[1]} (Y,Z)")
        print(f"  Current: {self.players[self.current_player - 1]}")
        if self.phase == "place":
            print(f"  Phase: Placement ({self.workers_placed}/4 workers placed)")
        else:
            print(f"  Phase: Move")
        print()

        # Column headers
        print("      1   2   3   4   5")
        print("    +---+---+---+---+---+")

        for r in range(5):
            row_label = str(r + 1)
            cells = []
            for c in range(5):
                level = self.board[r][c]
                worker = self._worker_at(r, c)
                if level == 4:
                    # Dome
                    cell = " ^ "
                elif worker:
                    if simple:
                        cell = f"{level}{worker} "
                    else:
                        cell = f"{level}{worker} "
                else:
                    if simple:
                        cell = f"{level}  "
                    else:
                        cell = f"{level}  "
                cells.append(cell)
            print(f"  {row_label} |{'|'.join(cells)}|")
            print("    +---+---+---+---+---+")

        print()
        print("  Legend: number=level, ^=dome, A/B=P1 workers, Y/Z=P2 workers")
        print()

    def get_move(self):
        """Get move input from the current player."""
        if self.phase == "place":
            move_str = input_with_quit(
                f"  {self.players[self.current_player - 1]}, place worker (row col): "
            )
            parts = move_str.strip().split()
            if len(parts) != 2:
                return None
            try:
                row, col = int(parts[0]), int(parts[1])
                return ("place", row, col)
            except ValueError:
                return None
        else:
            move_str = input_with_quit(
                f"  {self.players[self.current_player - 1]}, enter move "
                f"(worker row col build_row build_col): "
            )
            parts = move_str.strip().split()
            if len(parts) != 5:
                return None
            try:
                worker = parts[0].upper()
                row, col = int(parts[1]), int(parts[2])
                br, bc = int(parts[3]), int(parts[4])
                return ("move", worker, row, col, br, bc)
            except ValueError:
                return None

    def make_move(self, move):
        """Apply a move. Returns True if valid."""
        if move is None:
            return False

        if move[0] == "place":
            return self._do_place(move)
        elif move[0] == "move":
            return self._do_move(move)
        return False

    def _do_place(self, move):
        """Handle worker placement. Returns True if valid."""
        _, row, col = move
        # Convert to 0-indexed
        r, c = row - 1, col - 1

        if not (0 <= r < 5 and 0 <= c < 5):
            return False
        if self._occupied(r, c):
            return False

        # Determine which worker label to assign
        labels = self.WORKER_LABELS[self.current_player]
        # Each player places 2 workers; figure out which one
        placed_for_player = [
            l for l in labels if l in self.workers
        ]
        if len(placed_for_player) >= 2:
            return False
        label = labels[len(placed_for_player)]

        self.workers[label] = (r, c)
        self.workers_placed += 1

        # After all 4 workers are placed, switch to move phase
        if self.workers_placed >= 4:
            self.phase = "move"

        return True

    def _do_move(self, move):
        """Handle a move-then-build action. Returns True if valid."""
        _, worker, row, col, br, bc = move
        # Convert to 0-indexed
        mr, mc = row - 1, col - 1
        build_r, build_c = br - 1, bc - 1

        # Validate worker belongs to current player
        if worker not in self.WORKER_LABELS[self.current_player]:
            return False
        if worker not in self.workers:
            return False

        wr, wc = self.workers[worker]

        # Check move destination is adjacent
        if (mr, mc) not in self._adjacent(wr, wc):
            return False

        # Check move destination is in bounds (already guaranteed by _adjacent)
        # Check destination is not occupied by another worker
        if self._occupied(mr, mc):
            return False

        # Check destination is not a dome
        if self.board[mr][mc] == 4:
            return False

        # Check height constraint: can move up at most 1 level
        current_level = self.board[wr][wc]
        dest_level = self.board[mr][mc]
        if dest_level - current_level > 1:
            return False

        # Move the worker
        self.workers[worker] = (mr, mc)

        # Now validate the build
        if not (0 <= build_r < 5 and 0 <= build_c < 5):
            # Undo move
            self.workers[worker] = (wr, wc)
            return False

        # Build must be adjacent to the worker's NEW position
        if (build_r, build_c) not in self._adjacent(mr, mc):
            self.workers[worker] = (wr, wc)
            return False

        # Cannot build on a square occupied by a worker
        if self._occupied(build_r, build_c):
            self.workers[worker] = (wr, wc)
            return False

        # Cannot build on a dome
        if self.board[build_r][build_c] == 4:
            self.workers[worker] = (wr, wc)
            return False

        # Build: add one level (level 3 -> dome which is 4)
        self.board[build_r][build_c] += 1

        return True

    def check_game_over(self):
        """Check if game is over. Win by moving onto level 3.
        Also check if the next player has no legal moves (current player wins)."""
        if self.phase == "place":
            return

        # Check if current player (who just moved) has a worker on level 3
        for label in self.WORKER_LABELS[self.current_player]:
            if label in self.workers:
                r, c = self.workers[label]
                if self.board[r][c] == 3:
                    self.game_over = True
                    self.winner = self.current_player
                    return

        # Check if the opponent has any legal moves
        opponent = 2 if self.current_player == 1 else 1
        if not self._has_any_move(opponent):
            self.game_over = True
            self.winner = self.current_player

    def _has_any_move(self, player):
        """Check if a player has at least one legal move-and-build action."""
        for label in self.WORKER_LABELS[player]:
            if label not in self.workers:
                continue
            wr, wc = self.workers[label]
            current_level = self.board[wr][wc]

            for mr, mc in self._adjacent(wr, wc):
                # Can the worker move here?
                if self._occupied(mr, mc):
                    continue
                if self.board[mr][mc] == 4:
                    continue
                if self.board[mr][mc] - current_level > 1:
                    continue

                # Worker could move to (mr, mc). Can they build from there?
                # Temporarily move the worker to check build options
                old_pos = self.workers[label]
                self.workers[label] = (mr, mc)

                can_build = False
                for br, bc in self._adjacent(mr, mc):
                    if not self._occupied(br, bc) and self.board[br][bc] < 4:
                        can_build = True
                        break

                self.workers[label] = old_pos

                if can_build:
                    return True
        return False

    def get_state(self):
        """Return serializable game state."""
        return {
            "board": [row[:] for row in self.board],
            "workers": {k: list(v) for k, v in self.workers.items()},
            "phase": self.phase,
            "workers_placed": self.workers_placed,
        }

    def load_state(self, state):
        """Restore game state."""
        self.board = [row[:] for row in state["board"]]
        self.workers = {k: tuple(v) for k, v in state["workers"].items()}
        self.phase = state["phase"]
        self.workers_placed = state["workers_placed"]

    def get_tutorial(self):
        return """
==================================================
  SANTORINI - Tutorial
==================================================

  OVERVIEW
  --------
  Santorini is an abstract strategy game for 2
  players on a 5x5 grid. Each player controls
  2 workers. The goal is to be the first to move
  a worker onto the third level of a building.

  SETUP
  -----
  Players take turns placing their workers on
  any empty square. Player 1 places A, then
  Player 2 places Y, then Player 1 places B,
  then Player 2 places Z.

  Enter placement as: row col
  Example: "1 1" places on row 1, column 1.

  HOW TO PLAY
  -----------
  On each turn you must:
    1. MOVE one of your workers to an adjacent
       square (any of 8 directions).
    2. BUILD on a square adjacent to the worker's
       NEW position.

  Enter moves as: worker row col build_row build_col
  Example: "A 2 3 1 3" moves worker A to row 2
  column 3, then builds at row 1 column 3.

  MOVEMENT RULES
  --------------
  - You can move to any adjacent square (including
    diagonals) that is not occupied by a worker
    and does not have a dome.
  - You can move UP at most 1 level per move.
  - You can move DOWN any number of levels.

  BUILDING RULES
  --------------
  - After moving, you must build on a square
    adjacent to your worker's new position.
  - Building adds 1 level to the square.
  - Building levels go: 0 -> 1 -> 2 -> 3 -> dome.
  - You cannot build on a square with a dome or
    a square occupied by a worker.

  DISPLAY
  -------
  Each cell shows: [level][worker]
    0   = empty ground level
    1   = level 1
    2   = level 2
    3   = level 3
    ^   = dome (capped)
    A/B = Player 1 workers
    Y/Z = Player 2 workers

  Example: "2A" means worker A is on level 2.

  WINNING
  -------
  You win by moving one of your workers onto
  a level 3 building. Building to level 3 does
  NOT win -- you must MOVE onto it.

  You also win if your opponent has no legal
  moves on their turn.

  COORDINATES
  -----------
  Rows and columns are numbered 1-5.
  Row 1 is the top, row 5 is the bottom.
  Column 1 is the left, column 5 is the right.

  COMMANDS
  --------
  Type 'quit' to quit, 'save' to save,
  'help' for help, 'tutorial' for this text.
==================================================
"""
