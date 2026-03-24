"""Minesweeper - Classic mine-finding game with single and two-player modes."""

import random

from engine.base import BaseGame, input_with_quit, clear_screen


# Variation configs: (rows, cols, mines, label)
VARIATION_CONFIG = {
    "beginner": {
        "rows": 9,
        "cols": 9,
        "mines": 10,
        "label": "Beginner",
    },
    "intermediate": {
        "rows": 16,
        "cols": 16,
        "mines": 40,
        "label": "Intermediate",
    },
    "expert": {
        "rows": 16,
        "cols": 30,
        "mines": 99,
        "label": "Expert",
    },
}


class MinesweeperGame(BaseGame):
    """Minesweeper - find all safe cells without hitting a mine."""

    name = "Minesweeper"
    description = "Classic mine-finding puzzle game"
    min_players = 1
    max_players = 2
    variations = {
        "beginner": "Beginner (9x9, 10 mines)",
        "intermediate": "Intermediate (16x16, 40 mines)",
        "expert": "Expert (16x30, 99 mines)",
    }

    def __init__(self, variation=None):
        super().__init__(variation)
        config = VARIATION_CONFIG.get(self.variation, VARIATION_CONFIG["beginner"])
        self.rows = config["rows"]
        self.cols = config["cols"]
        self.num_mines = config["mines"]
        self.label = config["label"]
        # Game state
        self.mine_grid = []       # True if mine at (r, c)
        self.revealed = []        # True if cell revealed
        self.flagged = []         # True if cell flagged
        self.adjacent = []        # Count of adjacent mines
        self.first_reveal = True  # First reveal is always safe
        self.num_players = 1
        self.scores = [0, 0]      # Cells revealed by each player (2p mode)
        self.loser = None         # Player who hit a mine (2p mode)

    # ------------------------------------------------------------------ setup
    def setup(self):
        """Initialize game state and prompt for player count."""
        self.mine_grid = [[False] * self.cols for _ in range(self.rows)]
        self.revealed = [[False] * self.cols for _ in range(self.rows)]
        self.flagged = [[False] * self.cols for _ in range(self.rows)]
        self.adjacent = [[0] * self.cols for _ in range(self.rows)]
        self.first_reveal = True
        self.scores = [0, 0]
        self.loser = None
        self.game_over = False
        self.winner = None

        # Ask for player count
        clear_screen()
        print(f"\n{'='*50}")
        print(f"  MINESWEEPER ({self.label})")
        print(f"{'='*50}")
        print(f"\n  Grid: {self.rows}x{self.cols} with {self.num_mines} mines\n")
        print("  How many players?")
        print("    1. Single player (classic)")
        print("    2. Two players (take turns revealing)")
        while True:
            choice = input_with_quit("\n  Enter 1 or 2: ").strip()
            if choice in ("1", "2"):
                self.num_players = int(choice)
                break
            print("  Please enter 1 or 2.")

        if self.num_players == 1:
            self.players = ["Player 1"]
        else:
            self.players = ["Player 1", "Player 2"]

        # Mines are placed on first reveal to guarantee safety
        self.current_player = 1

    def _place_mines(self, safe_row, safe_col):
        """Place mines randomly, keeping a 3x3 area around (safe_row, safe_col) clear."""
        safe_cells = set()
        for dr in range(-1, 2):
            for dc in range(-1, 2):
                nr, nc = safe_row + dr, safe_col + dc
                if 0 <= nr < self.rows and 0 <= nc < self.cols:
                    safe_cells.add((nr, nc))

        candidates = [
            (r, c)
            for r in range(self.rows)
            for c in range(self.cols)
            if (r, c) not in safe_cells
        ]
        mines = random.sample(candidates, min(self.num_mines, len(candidates)))
        for r, c in mines:
            self.mine_grid[r][c] = True

        # Compute adjacency counts
        self._compute_adjacent()

    def _compute_adjacent(self):
        """Compute adjacent mine counts for every cell."""
        for r in range(self.rows):
            for c in range(self.cols):
                count = 0
                for dr in range(-1, 2):
                    for dc in range(-1, 2):
                        if dr == 0 and dc == 0:
                            continue
                        nr, nc = r + dr, c + dc
                        if 0 <= nr < self.rows and 0 <= nc < self.cols and self.mine_grid[nr][nc]:
                            count += 1
                self.adjacent[r][c] = count

    def _flood_reveal(self, row, col):
        """Reveal cell and flood-fill if adjacent count is 0."""
        stack = [(row, col)]
        revealed_count = 0
        while stack:
            r, c = stack.pop()
            if self.revealed[r][c]:
                continue
            if self.flagged[r][c]:
                continue
            self.revealed[r][c] = True
            revealed_count += 1
            if self.adjacent[r][c] == 0:
                for dr in range(-1, 2):
                    for dc in range(-1, 2):
                        if dr == 0 and dc == 0:
                            continue
                        nr, nc = r + dr, c + dc
                        if 0 <= nr < self.rows and 0 <= nc < self.cols and not self.revealed[nr][nc]:
                            stack.append((nr, nc))
        return revealed_count

    # --------------------------------------------------------------- display
    def display(self):
        """Display the Minesweeper grid."""
        print(f"\n{'='*60}")
        print(f"  === Minesweeper ({self.label}) ===")
        if self.num_players == 2:
            print(f"  {self.players[0]}: {self.scores[0]} cells | {self.players[1]}: {self.scores[1]} cells")
            print(f"  Current turn: {self.players[self.current_player - 1]}")
        print(f"  Mines: {self.num_mines} | Flags: {self._count_flags()}")
        print(f"{'='*60}\n")

        # Column headers
        col_header = "     "
        col_sep = "     "
        for c in range(self.cols):
            col_header += f"{c:>3}"
            col_sep += "---"
        print(col_header)
        print(col_sep)

        for r in range(self.rows):
            row_str = f"  {r:>2}|"
            for c in range(self.cols):
                if self.revealed[r][c]:
                    if self.mine_grid[r][c]:
                        row_str += "  *"
                    elif self.adjacent[r][c] == 0:
                        row_str += "  ."
                    else:
                        row_str += f"  {self.adjacent[r][c]}"
                elif self.flagged[r][c]:
                    row_str += "  F"
                else:
                    row_str += "  #"
            print(row_str)

        print()

        if self.game_over:
            # Reveal all mines
            print("  Mine locations:")
            mine_str = "     "
            # Already shown in grid via revealed state; this is just a note
            print("  (Mines shown as * on the grid above)\n")

    def _count_flags(self):
        """Count total flags placed."""
        return sum(self.flagged[r][c] for r in range(self.rows) for c in range(self.cols))

    # --------------------------------------------------------------- get_move
    def get_move(self):
        """Prompt current player for an action."""
        if self.num_players == 2:
            player_name = self.players[self.current_player - 1]
        else:
            player_name = self.players[0]

        print(f"  {player_name}'s turn.")
        print("  Commands: 'r ROW COL' to reveal, 'f ROW COL' to flag/unflag")
        print(f"  (ROW: 0-{self.rows-1}, COL: 0-{self.cols-1})")
        raw = input_with_quit(f"  > ").strip()
        return raw

    # --------------------------------------------------------------- make_move
    def make_move(self, move):
        """Parse and apply a move. Returns True if valid."""
        parts = move.lower().split()
        if len(parts) != 3:
            print("  Invalid format. Use 'r ROW COL' or 'f ROW COL'.")
            input_with_quit("  Press Enter to try again...")
            return False

        action = parts[0]
        if action not in ('r', 'f'):
            print("  Action must be 'r' (reveal) or 'f' (flag/unflag).")
            input_with_quit("  Press Enter to try again...")
            return False

        try:
            row, col = int(parts[1]), int(parts[2])
        except ValueError:
            print("  ROW and COL must be numbers.")
            input_with_quit("  Press Enter to try again...")
            return False

        if not (0 <= row < self.rows and 0 <= col < self.cols):
            print(f"  Out of bounds. ROW: 0-{self.rows-1}, COL: 0-{self.cols-1}.")
            input_with_quit("  Press Enter to try again...")
            return False

        if action == 'f':
            # Flag / unflag
            if self.revealed[row][col]:
                print("  Cannot flag a revealed cell.")
                input_with_quit("  Press Enter to try again...")
                return False
            self.flagged[row][col] = not self.flagged[row][col]
            # Flagging does not consume a turn in 2p mode
            # We return True but will handle turn switching in check_game_over
            self._last_action = 'flag'
            return True

        # action == 'r' (reveal)
        if self.revealed[row][col]:
            print("  Cell already revealed.")
            input_with_quit("  Press Enter to try again...")
            return False

        if self.flagged[row][col]:
            print("  Cell is flagged. Unflag it first with 'f ROW COL'.")
            input_with_quit("  Press Enter to try again...")
            return False

        # Place mines on first reveal
        if self.first_reveal:
            self._place_mines(row, col)
            self.first_reveal = False

        # Check for mine
        if self.mine_grid[row][col]:
            self.revealed[row][col] = True
            self._last_action = 'mine_hit'
            # Reveal all mines for display
            for r in range(self.rows):
                for c in range(self.cols):
                    if self.mine_grid[r][c]:
                        self.revealed[r][c] = True
            return True

        # Safe reveal
        count = self._flood_reveal(row, col)
        if self.num_players == 2:
            self.scores[self.current_player - 1] += count
        self._last_action = 'reveal'
        return True

    # --------------------------------------------------------- check_game_over
    def check_game_over(self):
        """Check win/lose conditions."""
        if hasattr(self, '_last_action') and self._last_action == 'mine_hit':
            if self.num_players == 1:
                # Single player: hit a mine = lose
                self.game_over = True
                self.winner = None  # No winner, player lost
            else:
                # Two player: hitting a mine ends the game, other player wins
                self.game_over = True
                self.loser = self.current_player
                self.winner = 2 if self.current_player == 1 else 1
            return

        # Check if all non-mine cells are revealed
        total_safe = self.rows * self.cols - self.num_mines
        total_revealed = sum(
            1 for r in range(self.rows) for c in range(self.cols)
            if self.revealed[r][c] and not self.mine_grid[r][c]
        )

        if total_revealed >= total_safe:
            self.game_over = True
            if self.num_players == 1:
                self.winner = 1  # Player wins
            else:
                # Player with more revealed cells wins
                if self.scores[0] > self.scores[1]:
                    self.winner = 1
                elif self.scores[1] > self.scores[0]:
                    self.winner = 2
                else:
                    self.winner = None  # Tie
            return

        # Flagging does not switch turn in 2p
        if hasattr(self, '_last_action') and self._last_action == 'flag':
            # Don't switch player for flag actions - override the base class switch
            # We store the current player so we can restore after base class switches
            self._skip_switch = True

    def switch_player(self):
        """Override to skip switching on flag actions in 2p mode."""
        if self.num_players == 1:
            return  # Single player, never switch
        if hasattr(self, '_skip_switch') and self._skip_switch:
            self._skip_switch = False
            return
        super().switch_player()

    # ----------------------------------------------------------- state save/load
    def get_state(self):
        """Return serializable game state for saving."""
        return {
            "rows": self.rows,
            "cols": self.cols,
            "num_mines": self.num_mines,
            "label": self.label,
            "mine_grid": self.mine_grid,
            "revealed": self.revealed,
            "flagged": self.flagged,
            "adjacent": self.adjacent,
            "first_reveal": self.first_reveal,
            "num_players": self.num_players,
            "scores": self.scores,
        }

    def load_state(self, state):
        """Restore game state from saved data."""
        self.rows = state["rows"]
        self.cols = state["cols"]
        self.num_mines = state["num_mines"]
        self.label = state.get("label", "Beginner")
        self.mine_grid = state["mine_grid"]
        self.revealed = state["revealed"]
        self.flagged = state["flagged"]
        self.adjacent = state["adjacent"]
        self.first_reveal = state.get("first_reveal", False)
        self.num_players = state.get("num_players", 1)
        self.scores = state.get("scores", [0, 0])
        if self.num_players == 1:
            self.players = ["Player 1"]
        else:
            self.players = ["Player 1", "Player 2"]

    # -------------------------------------------------------------- tutorial
    def get_tutorial(self):
        """Return comprehensive tutorial for Minesweeper."""
        return f"""
{'='*60}
  MINESWEEPER - Tutorial
{'='*60}

  OVERVIEW:
  Minesweeper is a puzzle game where you uncover cells on a
  grid while avoiding hidden mines. Numbers on revealed cells
  indicate how many adjacent cells (including diagonals)
  contain mines.

  CURRENT VARIATION: {self.label}
  - Grid size: {self.rows} x {self.cols}
  - Number of mines: {self.num_mines}

  GRID SYMBOLS:
    #   Unrevealed cell
    F   Flagged cell (suspected mine)
    .   Revealed cell with 0 adjacent mines
   1-8  Revealed cell with that many adjacent mines
    *   Mine (shown when hit or game ends)

  HOW TO PLAY:
  1. Enter 'r ROW COL' to reveal a cell.
     Example: r 3 5  (reveals row 3, column 5)
  2. Enter 'f ROW COL' to flag/unflag a cell.
     Example: f 2 4  (toggles flag on row 2, column 4)
  3. The first cell you reveal is always safe.
  4. When you reveal a cell with 0 adjacent mines, all
     neighboring safe cells are automatically revealed
     (flood fill).
  5. If you reveal a mine, you lose!

  SINGLE PLAYER MODE:
  - Clear all non-mine cells to win.
  - Flagging is optional but helps track suspected mines.

  TWO PLAYER MODE:
  - Players take turns revealing cells.
  - Each player scores points for cells they reveal.
  - Hitting a mine ends the game; the other player wins.
  - If all safe cells are revealed, the player with the
    most revealed cells wins.
  - Flagging does not consume your turn.

  STRATEGY TIPS:
  - Start at a corner or edge for better opening chances.
  - Use numbers to deduce mine locations. If a '1' cell
    has only one unrevealed neighbor, that neighbor is a
    mine.
  - Flag known mines to help with deduction.
  - Count remaining mines around numbered cells to find
    safe cells to reveal.
  - In 2-player mode, balance safe reveals against giving
    your opponent easy cells.

  EXAMPLE:
  If you see:
    . 1 #
    . 2 #
    . 1 #
  The middle-right cell must be a mine (the '2' already
  touches one mine via the top-right or bottom-right, and
  needs exactly 2 adjacent mines).

  COMMANDS:
  'quit' / 'q'     - Quit game
  'save' / 's'     - Save and suspend game
  'help' / 'h'     - Show help
  'tutorial' / 't' - Show this tutorial
{'='*60}
"""
