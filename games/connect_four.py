"""Connect Four game with multiple variations."""

from engine.base import BaseGame, input_with_quit, clear_screen


class ConnectFourGame(BaseGame):
    """Connect Four with standard, five-in-a-row, and pop-out variations."""

    name = "Connect Four"
    description = "Drop pieces to connect them in a row -- with standard, five, and pop-out modes"
    min_players = 2
    max_players = 2
    variations = {
        "standard": "7 columns x 6 rows, connect 4 to win",
        "five": "9 columns x 7 rows, connect 5 to win",
        "pop_out": "7x6 board, connect 4 -- but you can also pop your own bottom piece",
    }

    SYMBOLS = {0: " ", 1: "\u25cf", 2: "\u25cb"}  # ● filled, ○ open

    def __init__(self, variation=None):
        super().__init__(variation or "standard")

    # ------------------------------------------------------------------ setup
    def setup(self):
        if self.variation == "five":
            self.cols = 9
            self.rows = 7
            self.win_length = 5
        else:
            self.cols = 7
            self.rows = 6
            self.win_length = 4
        # board[row][col], row 0 = top
        self.board = [[0] * self.cols for _ in range(self.rows)]

    # --------------------------------------------------------------- display
    def display(self):
        s = self.SYMBOLS
        p = self.players[self.current_player - 1]
        print(f"\n  {self.name} ({self.variation})  --  Turn {self.turn_number + 1}")
        print(f"  {self.players[0]} ({s[1]})  vs  {self.players[1]} ({s[2]})")
        print(f"  Current: {p} ({s[self.current_player]})\n")

        # Column headers
        header = "   " + "  ".join(str(c + 1) for c in range(self.cols))
        print(header)

        # Top border
        print("  " + "\u250c" + ("\u2500\u2500\u252c" * (self.cols - 1)) + "\u2500\u2500\u2510")

        for r in range(self.rows):
            row_str = "  \u2502"
            for c in range(self.cols):
                row_str += f"{s[self.board[r][c]]} \u2502"
            print(row_str)
            if r < self.rows - 1:
                print(
                    "  \u251c" + ("\u2500\u2500\u253c" * (self.cols - 1)) + "\u2500\u2500\u2524"
                )

        # Bottom border
        print("  \u2514" + ("\u2500\u2500\u2534" * (self.cols - 1)) + "\u2500\u2500\u2518")

        if self.variation == "pop_out":
            print("  Moves: 'drop <col>' or 'pop <col>'")
        print()

    # --------------------------------------------------------------- get_move
    def get_move(self):
        if self.variation == "pop_out":
            return self._get_move_pop_out()
        else:
            return self._get_move_standard()

    def _get_move_standard(self):
        while True:
            raw = input_with_quit(
                f"  {self.players[self.current_player - 1]}, choose column (1-{self.cols}): "
            )
            try:
                col = int(raw.strip()) - 1
                if 0 <= col < self.cols:
                    return ("drop", col)
            except ValueError:
                pass
            print(f"  Invalid input. Enter a column number 1-{self.cols}.")

    def _get_move_pop_out(self):
        while True:
            raw = input_with_quit(
                f"  {self.players[self.current_player - 1]}, enter move (drop <col> / pop <col>): "
            )
            raw = raw.strip().lower()
            parts = raw.split()
            if len(parts) == 2 and parts[0] in ("drop", "pop"):
                try:
                    col = int(parts[1]) - 1
                    if 0 <= col < self.cols:
                        return (parts[0], col)
                except ValueError:
                    pass
            # Also accept bare number as a drop
            try:
                col = int(raw) - 1
                if 0 <= col < self.cols:
                    return ("drop", col)
            except ValueError:
                pass
            print(f"  Invalid input. Use 'drop <col>' or 'pop <col>' (col 1-{self.cols}).")

    # -------------------------------------------------------------- make_move
    def make_move(self, move):
        action, col = move
        if action == "drop":
            return self._drop(col)
        elif action == "pop":
            return self._pop(col)
        return False

    def _drop(self, col):
        """Drop a piece into column col. Returns True if successful."""
        for r in range(self.rows - 1, -1, -1):
            if self.board[r][col] == 0:
                self.board[r][col] = self.current_player
                return True
        # Column is full
        return False

    def _pop(self, col):
        """Pop-out: remove your own piece from the bottom of col."""
        if self.variation != "pop_out":
            return False
        bottom = self.rows - 1
        if self.board[bottom][col] != self.current_player:
            print("  You can only pop your own piece from the bottom!")
            return False
        # Shift everything down by one
        for r in range(bottom, 0, -1):
            self.board[r][col] = self.board[r - 1][col]
        self.board[0][col] = 0
        return True

    # -------------------------------------------------------- check_game_over
    def check_game_over(self):
        winner = self._find_winner()
        if winner:
            self.game_over = True
            self.winner = winner
            return
        # Draw if top row is completely full (no legal drops)
        if all(self.board[0][c] != 0 for c in range(self.cols)):
            # In pop_out, game can continue if a pop is possible
            if self.variation == "pop_out":
                # Check if the next player can pop anything
                next_p = 2 if self.current_player == 1 else 1
                for c in range(self.cols):
                    if self.board[self.rows - 1][c] == next_p:
                        return  # At least one pop available
            self.game_over = True
            self.winner = None

    def _find_winner(self):
        """Return the winning player (1 or 2), or 0 if no winner yet."""
        wl = self.win_length
        rows, cols = self.rows, self.cols
        board = self.board

        for r in range(rows):
            for c in range(cols):
                if board[r][c] == 0:
                    continue
                p = board[r][c]
                # horizontal
                if c + wl <= cols and all(board[r][c + i] == p for i in range(wl)):
                    return p
                # vertical
                if r + wl <= rows and all(board[r + i][c] == p for i in range(wl)):
                    return p
                # diagonal down-right
                if (
                    r + wl <= rows
                    and c + wl <= cols
                    and all(board[r + i][c + i] == p for i in range(wl))
                ):
                    return p
                # diagonal down-left
                if (
                    r + wl <= rows
                    and c - wl + 1 >= 0
                    and all(board[r + i][c - i] == p for i in range(wl))
                ):
                    return p
        return 0

    # ----------------------------------------------------------- state / save
    def get_state(self):
        return {
            "variation": self.variation,
            "rows": self.rows,
            "cols": self.cols,
            "win_length": self.win_length,
            "board": [row[:] for row in self.board],
        }

    def load_state(self, state):
        self.variation = state["variation"]
        self.rows = state["rows"]
        self.cols = state["cols"]
        self.win_length = state["win_length"]
        self.board = [row[:] for row in state["board"]]

    # -------------------------------------------------------------- tutorial
    def get_tutorial(self):
        return """
==============================================================
                   CONNECT FOUR  TUTORIAL
==============================================================

OVERVIEW
  Two players take turns dropping pieces into columns of a
  vertical grid.  Pieces fall to the lowest available row.
  The first player to connect enough pieces in a straight
  line (horizontal, vertical, or diagonal) wins.

--------------------------------------------------------------
VARIATION: standard
--------------------------------------------------------------
  Board : 7 columns x 6 rows.
  Goal  : Connect 4 of your pieces in a row.
  Input : Enter a column number (1-7).

  Pieces:
    Player 1 : \u25cf  (filled circle)
    Player 2 : \u25cb  (open circle)

--------------------------------------------------------------
VARIATION: five
--------------------------------------------------------------
  Board : 9 columns x 7 rows.
  Goal  : Connect 5 of your pieces in a row.
  Input : Enter a column number (1-9).

--------------------------------------------------------------
VARIATION: pop_out
--------------------------------------------------------------
  Board : 7 columns x 6 rows  (same as standard).
  Goal  : Connect 4 of your pieces in a row.

  Special rule -- Pop Out:
    On your turn you may EITHER drop a new piece into a column
    OR remove ("pop") your own piece from the BOTTOM of any
    column.  When you pop a piece, every piece above it in
    that column slides down one row.

  Input :
    'drop <col>'  -- drop a piece into column <col>
    'pop  <col>'  -- pop your bottom piece from column <col>
    A bare number (e.g. '4') is treated as 'drop 4'.

  Strategy tip: popping can disrupt your opponent's plans
  while opening new possibilities for your own connections.

--------------------------------------------------------------
CONTROLS
--------------------------------------------------------------
  'quit'  / 'q'  -- Quit the game
  'save'  / 's'  -- Save and suspend the game
  'help'  / 'h'  -- Show quick help
  'tutorial' / 't' -- Show this tutorial
==============================================================
"""
