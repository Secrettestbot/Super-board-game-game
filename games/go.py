"""Go - Complete implementation of the ancient board game."""

import copy
from engine.base import BaseGame, input_with_quit, clear_screen


class GoGame(BaseGame):
    """Full implementation of Go with Chinese (area) scoring."""

    name = "Go"
    description = "Ancient strategic board game of territorial control"
    min_players = 2
    max_players = 2
    variations = {
        "9x9": "9x9 board - quick games, good for beginners",
        "13x13": "13x13 board - medium length games",
        "19x19": "19x19 board - standard full-size game",
    }

    # Column labels: A-T skipping I (traditional Go convention)
    COLUMN_LABELS = "ABCDEFGHJKLMNOPQRST"

    # Stone display characters
    BLACK_STONE = "\u25cf"  # ●
    WHITE_STONE = "\u25cb"  # ○

    KOMI = 6.5  # Standard komi for white

    def __init__(self, variation=None):
        super().__init__(variation or "19x19")
        self.size = 0
        self.board = []
        self.captures = {1: 0, 2: 0}  # stones captured by each player
        self.previous_board = None  # for ko detection
        self.consecutive_passes = 0

    def setup(self):
        """Initialize the board based on the selected variation."""
        size_map = {"9x9": 9, "13x13": 13, "19x19": 19}
        self.size = size_map.get(self.variation, 19)
        # Board: 0 = empty, 1 = black, 2 = white
        self.board = [[0] * self.size for _ in range(self.size)]
        self.captures = {1: 0, 2: 0}
        self.previous_board = None
        self.consecutive_passes = 0

    # ------------------------------------------------------------------ #
    #  Display
    # ------------------------------------------------------------------ #

    def display(self):
        """Display the board with coordinates."""
        col_labels = self.COLUMN_LABELS[: self.size]
        captures_black = self.captures[1]
        captures_white = self.captures[2]

        print(f"\n  Go ({self.size}x{self.size})  "
              f"Turn {self.turn_number + 1}")
        print(f"  {self.BLACK_STONE} Black ({self.players[0]}): "
              f"{captures_black} captures")
        print(f"  {self.WHITE_STONE} White ({self.players[1]}): "
              f"{captures_white} captures  |  Komi: {self.KOMI}")
        print()

        # Column header
        header = "    " + "  ".join(col_labels)
        print(header)

        for row in range(self.size):
            row_num = self.size - row  # display top row first
            row_label = f"{row_num:>3} "

            cells = []
            for col in range(self.size):
                stone = self.board[row][col]
                if stone == 1:
                    cells.append(self.BLACK_STONE)
                elif stone == 2:
                    cells.append(self.WHITE_STONE)
                else:
                    cells.append(self._intersection_char(row, col))
            line = "  ".join(cells)
            print(f"{row_label}{line}  {row_num}")

        print(header)
        print()
        current_stone = (self.BLACK_STONE if self.current_player == 1
                         else self.WHITE_STONE)
        print(f"  Current player: {current_stone} "
              f"{self.players[self.current_player - 1]}")

    def _intersection_char(self, row, col):
        """Return the appropriate grid character for an empty intersection."""
        top = row == 0
        bottom = row == self.size - 1
        left = col == 0
        right = col == self.size - 1

        # Star points (hoshi) shown as +
        if self._is_star_point(row, col):
            return "+"

        if top and left:
            return "+"
        if top and right:
            return "+"
        if bottom and left:
            return "+"
        if bottom and right:
            return "+"
        if top:
            return "-"
        if bottom:
            return "-"
        if left:
            return "|"
        if right:
            return "|"
        return "+"

    def _is_star_point(self, row, col):
        """Check if a position is a star point (hoshi)."""
        if self.size == 9:
            points = [2, 4, 6]
        elif self.size == 13:
            points = [3, 6, 9]
        elif self.size == 19:
            points = [3, 9, 15]
        else:
            return False
        return row in points and col in points

    # ------------------------------------------------------------------ #
    #  Coordinate parsing
    # ------------------------------------------------------------------ #

    def _parse_move(self, text):
        """Parse move text like 'D4' into (row, col) or None for pass."""
        text = text.strip().upper()
        if text == "PASS":
            return "pass"
        if len(text) < 2:
            return None

        col_char = text[0]
        if col_char not in self.COLUMN_LABELS[: self.size]:
            return None
        col = self.COLUMN_LABELS.index(col_char)

        try:
            row_num = int(text[1:])
        except ValueError:
            return None

        if row_num < 1 or row_num > self.size:
            return None

        row = self.size - row_num  # convert to internal index
        return (row, col)

    def _format_move(self, row, col):
        """Format an internal (row, col) as a human-readable string."""
        return f"{self.COLUMN_LABELS[col]}{self.size - row}"

    # ------------------------------------------------------------------ #
    #  Move input / validation / execution
    # ------------------------------------------------------------------ #

    def get_move(self):
        """Prompt the current player for a move."""
        col_labels = self.COLUMN_LABELS[: self.size]
        prompt = (f"  Enter move (e.g. {col_labels[0]}1) or 'pass': ")
        while True:
            raw = input_with_quit(prompt)
            move = self._parse_move(raw)
            if move is not None:
                return move
            print("  Invalid format. Use a letter + number (e.g. D4) "
                  "or 'pass'.")

    def make_move(self, move):
        """Apply a move. Returns True if the move is valid."""
        if move == "pass":
            self.consecutive_passes += 1
            return True

        self.consecutive_passes = 0
        row, col = move

        # Must be on the board and empty
        if not self._on_board(row, col):
            return False
        if self.board[row][col] != 0:
            return False

        player = self.current_player
        opponent = 3 - player

        # Tentatively place the stone
        old_board = self._copy_board()
        self.board[row][col] = player

        # Check for captures of opponent groups first
        captured = 0
        for nr, nc in self._neighbors(row, col):
            if self.board[nr][nc] == opponent:
                group = self._get_group(nr, nc)
                if self._count_liberties(group) == 0:
                    captured += len(group)
                    self._remove_group(group)

        # If no captures, check for suicide
        own_group = self._get_group(row, col)
        if self._count_liberties(own_group) == 0:
            # Suicide — illegal
            self.board = old_board
            return False

        # Ko check: board must not repeat the previous state
        if self.previous_board is not None and self.board == self.previous_board:
            self.board = old_board
            return False

        # Move is legal — commit it
        self.captures[player] += captured
        self.previous_board = old_board
        return True

    # ------------------------------------------------------------------ #
    #  Game-over and scoring
    # ------------------------------------------------------------------ #

    def check_game_over(self):
        """Game ends when both players pass consecutively."""
        if self.consecutive_passes >= 2:
            self.game_over = True
            self._score_game()

    def _score_game(self):
        """Score using Chinese (area) scoring: stones on board + territory.

        Territory is defined as empty intersections completely surrounded
        by one colour.  Komi of 6.5 is added to white's score.
        """
        black_score = 0
        white_score = 0

        visited = [[False] * self.size for _ in range(self.size)]

        for r in range(self.size):
            for c in range(self.size):
                stone = self.board[r][c]
                if stone == 1:
                    black_score += 1
                elif stone == 2:
                    white_score += 1
                elif not visited[r][c]:
                    # Flood-fill empty region
                    region, borders = self._flood_empty(r, c, visited)
                    if borders == {1}:
                        black_score += len(region)
                    elif borders == {2}:
                        white_score += len(region)
                    # Else neutral / dame — not counted

        white_score += self.KOMI

        print(f"\n  --- Final Score ---")
        print(f"  {self.BLACK_STONE} Black: {black_score} points")
        print(f"  {self.WHITE_STONE} White: {white_score} points "
              f"(includes {self.KOMI} komi)")

        if black_score > white_score:
            self.winner = 1
        elif white_score > black_score:
            self.winner = 2
        else:
            self.winner = None  # draw (extremely unlikely with 0.5 komi)

    def _flood_empty(self, start_r, start_c, visited):
        """Flood-fill an empty region. Returns (set of coords, set of bordering colours)."""
        region = set()
        borders = set()
        stack = [(start_r, start_c)]
        while stack:
            r, c = stack.pop()
            if visited[r][c]:
                continue
            if self.board[r][c] != 0:
                borders.add(self.board[r][c])
                continue
            visited[r][c] = True
            region.add((r, c))
            for nr, nc in self._neighbors(r, c):
                if not visited[nr][nc]:
                    stack.append((nr, nc))
        return region, borders

    # ------------------------------------------------------------------ #
    #  Board helpers
    # ------------------------------------------------------------------ #

    def _on_board(self, r, c):
        return 0 <= r < self.size and 0 <= c < self.size

    def _neighbors(self, r, c):
        """Yield orthogonal neighbours that are on the board."""
        for dr, dc in ((-1, 0), (1, 0), (0, -1), (0, 1)):
            nr, nc = r + dr, c + dc
            if self._on_board(nr, nc):
                yield nr, nc

    def _get_group(self, r, c):
        """Return the set of coordinates belonging to the group at (r,c)."""
        colour = self.board[r][c]
        if colour == 0:
            return set()
        group = set()
        stack = [(r, c)]
        while stack:
            cr, cc = stack.pop()
            if (cr, cc) in group:
                continue
            if self.board[cr][cc] != colour:
                continue
            group.add((cr, cc))
            for nr, nc in self._neighbors(cr, cc):
                if (nr, nc) not in group and self.board[nr][nc] == colour:
                    stack.append((nr, nc))
        return group

    def _count_liberties(self, group):
        """Count the number of liberties (empty neighbours) of a group."""
        liberties = set()
        for r, c in group:
            for nr, nc in self._neighbors(r, c):
                if self.board[nr][nc] == 0:
                    liberties.add((nr, nc))
        return len(liberties)

    def _remove_group(self, group):
        """Remove all stones in a group from the board."""
        for r, c in group:
            self.board[r][c] = 0

    def _copy_board(self):
        """Return a deep copy of the board."""
        return [row[:] for row in self.board]

    # ------------------------------------------------------------------ #
    #  Save / Load
    # ------------------------------------------------------------------ #

    def get_state(self):
        """Return serializable game state."""
        return {
            "size": self.size,
            "board": self.board,
            "captures": {str(k): v for k, v in self.captures.items()},
            "previous_board": self.previous_board,
            "consecutive_passes": self.consecutive_passes,
        }

    def load_state(self, state):
        """Restore game state from saved data."""
        self.size = state["size"]
        self.board = state["board"]
        self.captures = {int(k): v for k, v in state["captures"].items()}
        self.previous_board = state.get("previous_board")
        self.consecutive_passes = state.get("consecutive_passes", 0)

    # ------------------------------------------------------------------ #
    #  Tutorial
    # ------------------------------------------------------------------ #

    def get_tutorial(self):
        """Return a comprehensive Go tutorial."""
        return f"""\
{'=' * 60}
  GO - Tutorial
{'=' * 60}

  OVERVIEW
  --------
  Go is one of the oldest board games in the world, originating
  in China over 2,500 years ago.  Two players (Black and White)
  take turns placing stones on the intersections of a grid.  The
  goal is to control more territory than your opponent.

  BOARD SIZES
  -----------
  - 9x9   : Small board, great for learning.  ~15 min games.
  - 13x13 : Medium board, good practice.  ~45 min games.
  - 19x19 : Standard tournament size.  1-3 hour games.

  RULES
  -----

  1. PLACEMENT
     Black plays first.  Players alternate placing one stone per
     turn on any empty intersection.  Stones never move once
     placed (but may be captured and removed).

  2. LIBERTIES
     A liberty is an empty point directly adjacent (up/down/
     left/right) to a stone.  A connected group of same-colour
     stones shares its liberties.

  3. CAPTURE
     When a group has zero liberties (completely surrounded), it
     is captured and removed from the board.  The capturing
     player scores one point per stone captured.

  4. SUICIDE RULE
     You may NOT place a stone that would have zero liberties
     UNLESS that placement captures enemy stones first (thereby
     creating liberties).

  5. KO RULE
     You may not make a move that returns the board to the exact
     state it was in after your previous move.  This prevents
     infinite loops of single-stone captures.

  6. PASSING
     Instead of placing a stone you may pass.  When both players
     pass consecutively, the game ends and scoring begins.

  SCORING (Chinese / Area Scoring)
  --------------------------------
  Each player's score = number of their stones on the board
                      + number of empty intersections they
                        completely surround (territory).

  White receives {self.KOMI} points of komi (compensation for
  Black's first-move advantage).

  HOW TO ENTER MOVES
  ------------------
  Intersections are identified by a column letter and row number.
  Columns are labeled A-T (skipping I) left to right.
  Rows are numbered 1-{self.size} from bottom to top.

  Examples:  D4   place a stone at column D, row 4
             PASS  pass your turn

  STRATEGY TIPS
  -------------
  - Corners are the easiest to secure; then edges; the centre
    is hardest to hold.
  - Try to keep your groups connected; isolated stones are weak.
  - Balance between expanding territory and attacking your
    opponent.
  - Learn basic life-and-death patterns (two eyes = alive).

  IN-GAME COMMANDS
  ----------------
  'quit' or 'q'     - Quit the game
  'save' or 's'     - Save and suspend
  'help' or 'h'     - Show help
  'tutorial' or 't' - Show this tutorial

{'=' * 60}
"""
