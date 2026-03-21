"""Carnac board game - domino placement with largest connected group scoring."""

from engine.base import BaseGame, input_with_quit, clear_screen


class CarnacGame(BaseGame):
    """Carnac: a two-player domino placement game scored by largest connected group."""

    name = "Carnac"
    description = "Place dominoes on a grid -- score by building the largest connected group of your symbol"
    min_players = 2
    max_players = 2
    variations = {
        "standard": "Standard Carnac (6x7)",
        "small": "Small Carnac (5x5)",
    }

    SYMBOLS = {0: ".", 1: "X", 2: "O"}

    def __init__(self, variation=None):
        super().__init__(variation or "standard")

    # ------------------------------------------------------------------ setup
    def setup(self):
        if self.variation == "small":
            self.rows = 5
            self.cols = 5
        else:
            self.rows = 6
            self.cols = 7
        # board[row][col]: 0 = empty, 1 = X, 2 = O
        self.board = [[0] * self.cols for _ in range(self.rows)]
        self.dominoes_placed = 0

    # --------------------------------------------------------------- display
    def display(self):
        sym = self.SYMBOLS
        p = self.players[self.current_player - 1]
        print(f"\n  {self.name} ({self.variation})  --  Turn {self.turn_number + 1}")
        print(f"  {self.players[0]} (X)  vs  {self.players[1]} (O)")
        print(f"  Current: {p} ({sym[self.current_player]})\n")

        # Column headers
        header = "     " + "  ".join(str(c) for c in range(self.cols))
        print(header)

        # Top border
        print("   \u250c" + ("\u2500\u2500\u252c" * (self.cols - 1)) + "\u2500\u2500\u2510")

        for r in range(self.rows):
            row_str = f" {r} \u2502"
            for c in range(self.cols):
                row_str += f"{sym[self.board[r][c]]} \u2502"
            print(row_str)
            if r < self.rows - 1:
                print(
                    "   \u251c" + ("\u2500\u2500\u253c" * (self.cols - 1)) + "\u2500\u2500\u2524"
                )

        # Bottom border
        print("   \u2514" + ("\u2500\u2500\u2534" * (self.cols - 1)) + "\u2500\u2500\u2518")

        # Show scores so far
        scores = self._compute_scores()
        print(f"\n  Largest group -- X: {scores[1]}  |  O: {scores[2]}")
        print(f"  Dominoes placed: {self.dominoes_placed}")
        print()

    # --------------------------------------------------------------- get_move
    def get_move(self):
        while True:
            raw = input_with_quit(
                f"  {self.players[self.current_player - 1]}, enter move "
                f"(row,col dir symbols  e.g. '2,3 right XO'): "
            )
            move = self._parse_move(raw)
            if move is not None:
                return move
            print("  Invalid format. Use: row,col dir symbols")
            print("    dir = 'right' or 'down'")
            print("    symbols = two characters from X and O (e.g. XO, OX, XX, OO)")
            print("    Example: 2,3 right XO")

    def _parse_move(self, raw):
        """Parse move string. Returns (r, c, dr, dc, sym1, sym2) or None."""
        raw = raw.strip()
        parts = raw.split()
        if len(parts) != 3:
            return None

        # Parse row,col
        coord = parts[0]
        if "," not in coord:
            return None
        coord_parts = coord.split(",")
        if len(coord_parts) != 2:
            return None
        try:
            r = int(coord_parts[0].strip())
            c = int(coord_parts[1].strip())
        except ValueError:
            return None

        # Parse direction
        direction = parts[1].lower()
        if direction in ("right", "r"):
            dr, dc = 0, 1
        elif direction in ("down", "d"):
            dr, dc = 1, 0
        else:
            return None

        # Parse symbols
        symbols = parts[2].upper()
        if len(symbols) != 2:
            return None
        if symbols[0] not in ("X", "O") or symbols[1] not in ("X", "O"):
            return None

        sym1 = 1 if symbols[0] == "X" else 2
        sym2 = 1 if symbols[1] == "X" else 2

        return (r, c, dr, dc, sym1, sym2)

    # -------------------------------------------------------------- make_move
    def make_move(self, move):
        r, c, dr, dc, sym1, sym2 = move
        r2, c2 = r + dr, c + dc

        # Validate bounds
        if not (0 <= r < self.rows and 0 <= c < self.cols):
            print(f"  Cell ({r},{c}) is out of bounds.")
            return False
        if not (0 <= r2 < self.rows and 0 <= c2 < self.cols):
            print(f"  Cell ({r2},{c2}) is out of bounds.")
            return False

        # Validate cells are empty
        if self.board[r][c] != 0:
            print(f"  Cell ({r},{c}) is already occupied.")
            return False
        if self.board[r2][c2] != 0:
            print(f"  Cell ({r2},{c2}) is already occupied.")
            return False

        # Place domino
        self.board[r][c] = sym1
        self.board[r2][c2] = sym2
        self.dominoes_placed += 1
        return True

    # -------------------------------------------------------- check_game_over
    def check_game_over(self):
        # Game ends when no more dominoes can be placed
        if not self._has_valid_placement():
            self.game_over = True
            scores = self._compute_scores()
            if scores[1] > scores[2]:
                self.winner = 1
            elif scores[2] > scores[1]:
                self.winner = 2
            else:
                self.winner = None  # draw

    def _has_valid_placement(self):
        """Check if any domino can still be placed (two adjacent empty cells)."""
        for r in range(self.rows):
            for c in range(self.cols):
                if self.board[r][c] != 0:
                    continue
                # Check right
                if c + 1 < self.cols and self.board[r][c + 1] == 0:
                    return True
                # Check down
                if r + 1 < self.rows and self.board[r + 1][c] == 0:
                    return True
        return False

    def _compute_scores(self):
        """Return {1: largest_X_group, 2: largest_O_group}."""
        scores = {1: 0, 2: 0}
        visited = [[False] * self.cols for _ in range(self.rows)]

        for r in range(self.rows):
            for c in range(self.cols):
                if visited[r][c] or self.board[r][c] == 0:
                    continue
                player = self.board[r][c]
                size = self._flood_fill(r, c, player, visited)
                if size > scores[player]:
                    scores[player] = size

        return scores

    def _flood_fill(self, start_r, start_c, player, visited):
        """BFS to find the size of a connected group of `player` cells."""
        queue = [(start_r, start_c)]
        visited[start_r][start_c] = True
        size = 0
        while queue:
            r, c = queue.pop(0)
            size += 1
            for dr, dc in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
                nr, nc = r + dr, c + dc
                if (
                    0 <= nr < self.rows
                    and 0 <= nc < self.cols
                    and not visited[nr][nc]
                    and self.board[nr][nc] == player
                ):
                    visited[nr][nc] = True
                    queue.append((nr, nc))
        return size

    # ----------------------------------------------------------- state / save
    def get_state(self):
        return {
            "variation": self.variation,
            "rows": self.rows,
            "cols": self.cols,
            "board": [row[:] for row in self.board],
            "dominoes_placed": self.dominoes_placed,
        }

    def load_state(self, state):
        self.variation = state["variation"]
        self.rows = state["rows"]
        self.cols = state["cols"]
        self.board = [row[:] for row in state["board"]]
        self.dominoes_placed = state["dominoes_placed"]

    # -------------------------------------------------------------- tutorial
    def get_tutorial(self):
        return """
==============================================================
                     CARNAC  TUTORIAL
==============================================================

OVERVIEW
  Carnac is a two-player strategy game played on a rectangular
  grid. Players take turns placing dominoes (1x2 blocks) onto
  the board. Each domino covers exactly two adjacent cells.
  The twist: the placer chooses which symbol (X or O) appears
  on each half of the domino, meaning you can place your
  opponent's symbol as well as your own.

  The goal is to build the largest connected group of your
  symbol. At the end of the game, each player's score equals
  the size of their single largest connected group (orthogonal
  adjacency only -- no diagonals). The higher score wins.

--------------------------------------------------------------
PLAYERS & SYMBOLS
--------------------------------------------------------------
  Player 1 : X
  Player 2 : O

  The board shows:
    X  -- a cell belonging to Player 1
    O  -- a cell belonging to Player 2
    .  -- an empty cell

--------------------------------------------------------------
VARIATIONS
--------------------------------------------------------------
  standard : 6 rows x 7 columns
  small    : 5 rows x 5 columns

--------------------------------------------------------------
PLACING A DOMINO
--------------------------------------------------------------
  On your turn, you place one domino on the board.  A domino
  covers two adjacent cells -- either horizontally (right) or
  vertically (down).

  Input format:  row,col  direction  symbols

    row,col   -- the coordinates of the first cell (0-indexed)
    direction -- 'right' (or 'r') for horizontal placement
                 'down'  (or 'd') for vertical placement
    symbols   -- two characters (X or O) indicating what symbol
                 goes in each cell covered by the domino

  The first symbol goes in the cell at (row, col).
  The second symbol goes in the adjacent cell determined by
  the direction:
    right -> (row, col+1)
    down  -> (row+1, col)

  Examples:
    2,3 right XO   -- Place X at (2,3) and O at (2,4)
    0,0 down OX    -- Place O at (0,0) and X at (1,0)
    4,2 right XX   -- Place X at (4,2) and X at (4,3)
    1,5 down OO    -- Place O at (1,5) and O at (2,5)

  Both cells must be empty for the placement to be valid.

--------------------------------------------------------------
STRATEGY
--------------------------------------------------------------
  You can place ANY combination of X and O on your domino.
  This creates deep strategic choices:

  * Place XX to grow your own group, but you give your
    opponent a free turn to extend theirs.

  * Place OO to deny territory, but you are helping your
    opponent's largest group grow.

  * Place XO or OX to balance -- extend your group while
    fragmenting your opponent's.

  * Block your opponent by placing their symbol in isolated
    positions that cannot connect to their main group.

  * Think ahead: sometimes it is worth sacrificing a cell to
    prevent your opponent from forming a large connected
    region.

  Connected groups are measured by orthogonal adjacency
  (up, down, left, right -- not diagonal). Only the single
  LARGEST group counts toward your score.

--------------------------------------------------------------
GAME END & SCORING
--------------------------------------------------------------
  The game ends when no more dominoes can be placed (i.e.,
  there are no two adjacent empty cells remaining).

  Each player's score is the size of their largest connected
  group of their symbol on the board.

  The player with the larger largest-group wins.
  If both players' largest groups are the same size, the
  game is a draw.

--------------------------------------------------------------
CONTROLS
--------------------------------------------------------------
  'quit'     / 'q'  -- Quit the game
  'save'     / 's'  -- Save and suspend the game
  'help'     / 'h'  -- Show quick help
  'tutorial' / 't'  -- Show this tutorial
==============================================================
"""
