"""Hex - A connection strategy game on a hexagonal grid."""

from collections import deque
from engine.base import BaseGame, input_with_quit, clear_screen


class HexGame(BaseGame):
    """Hex: Connect your two sides of the board to win."""

    name = "Hex"
    description = "Connect your sides of a hexagonal board to win"
    min_players = 2
    max_players = 2
    variations = {
        "7x7": "7x7 hexagonal grid",
        "9x9": "9x9 hexagonal grid",
        "11x11": "11x11 hexagonal grid",
    }

    def __init__(self, variation=None):
        super().__init__(variation or "11x11")
        self.size = 0
        self.board = []
        self.swap_available = False
        self.first_move = None

    def setup(self):
        """Initialize the hex board."""
        self.size = int(self.variation.split("x")[0])
        self.board = [[0] * self.size for _ in range(self.size)]
        self.swap_available = False
        self.first_move = None

    def display(self):
        """Display the hex grid with offset rows and labels."""
        size = self.size
        symbols = {0: ".", 1: "X", 2: "O"}

        print(f"\n  === Hex ({self.variation}) ===")
        print(f"  {self.players[0]} (X): connects Top <-> Bottom")
        print(f"  {self.players[1]} (O): connects Left <-> Right")
        print(f"  Current turn: {self.players[self.current_player - 1]} ({symbols[self.current_player]})")
        if self.swap_available:
            print("  ** Player 2 may type 'swap' to swap with Player 1's first move **")
        print()

        # Column headers
        col_header = "     "
        for c in range(size):
            col_header += f" {chr(65 + c)}"
        print(col_header)

        # Top border for player 1 (X connects top-bottom)
        top_border = "      " + " ".join(["_"] * size)
        print(top_border)

        for r in range(size):
            indent = " " * r
            row_label = f"{r + 1:>3}"
            row_str = f"  {indent}{row_label}  \\"
            cells = []
            for c in range(size):
                cells.append(f" {symbols[self.board[r][c]]}")
            row_str += "".join(cells) + "  \\"
            print(row_str)

        # Bottom border
        bottom_indent = " " * size
        bottom_border = f"  {bottom_indent}     " + " ".join(["‾"] * size)
        print(bottom_border)
        print()

    def get_move(self):
        """Get move as column-letter + row-number (e.g. 'C5') or 'swap'."""
        player_name = self.players[self.current_player - 1]
        size = self.size
        max_col = chr(64 + size)

        while True:
            prompt = f"  {player_name}, enter move (A-{max_col})(1-{size})"
            if self.swap_available:
                prompt += " or 'swap'"
            prompt += ": "
            raw = input_with_quit(prompt).strip()

            if raw.lower() == "swap":
                if self.swap_available:
                    return "swap"
                else:
                    print("  Swap is not available.")
                    continue

            if len(raw) < 2:
                print(f"  Invalid input. Enter like 'C5' (column A-{max_col}, row 1-{size}).")
                continue

            try:
                # Parse column letter and row number
                col_char = raw[0].upper()
                row_num = int(raw[1:])

                if not ('A' <= col_char <= chr(64 + size)):
                    print(f"  Column must be A-{max_col}.")
                    continue
                if row_num < 1 or row_num > size:
                    print(f"  Row must be 1-{size}.")
                    continue

                col = ord(col_char) - 65
                row = row_num - 1
                return (row, col)
            except (ValueError, IndexError):
                print(f"  Invalid input. Enter like 'C5' (column A-{max_col}, row 1-{size}).")

    def make_move(self, move):
        """Apply a move. Returns True if valid."""
        if move == "swap":
            if not self.swap_available:
                return False
            # Swap: player 2 takes player 1's first move position
            r, c = self.first_move
            self.board[r][c] = 2
            self.swap_available = False
            return True

        row, col = move

        if self.board[row][col] != 0:
            print("  That cell is already occupied!")
            return False

        self.board[row][col] = self.current_player

        # After player 1's first move, enable swap rule for player 2
        if self.turn_number == 0 and self.current_player == 1:
            self.first_move = (row, col)
            self.swap_available = True
        else:
            self.swap_available = False

        return True

    def check_game_over(self):
        """Check if either player has connected their sides using BFS."""
        size = self.size

        # Check player 1 (X): top row to bottom row
        if self._check_connection(1):
            self.game_over = True
            self.winner = 1
            return

        # Check player 2 (O): left column to right column
        if self._check_connection(2):
            self.game_over = True
            self.winner = 2
            return

    def _check_connection(self, player):
        """Check if player has a connected path between their sides using BFS."""
        size = self.size
        visited = [[False] * size for _ in range(size)]
        queue = deque()

        # Player 1 connects top to bottom
        if player == 1:
            for c in range(size):
                if self.board[0][c] == player:
                    queue.append((0, c))
                    visited[0][c] = True
            target_check = lambda r, c: r == size - 1
        else:
            # Player 2 connects left to right
            for r in range(size):
                if self.board[r][0] == player:
                    queue.append((r, 0))
                    visited[r][0] = True
            target_check = lambda r, c: c == size - 1

        # Hex neighbors: 6 adjacent cells
        neighbors = [(-1, 0), (-1, 1), (0, -1), (0, 1), (1, -1), (1, 0)]

        while queue:
            r, c = queue.popleft()
            if target_check(r, c):
                return True
            for dr, dc in neighbors:
                nr, nc = r + dr, c + dc
                if 0 <= nr < size and 0 <= nc < size:
                    if not visited[nr][nc] and self.board[nr][nc] == player:
                        visited[nr][nc] = True
                        queue.append((nr, nc))

        return False

    def get_state(self):
        """Return serializable game state."""
        return {
            "size": self.size,
            "board": [row[:] for row in self.board],
            "swap_available": self.swap_available,
            "first_move": self.first_move,
        }

    def load_state(self, state):
        """Restore game state."""
        self.size = state["size"]
        self.board = [row[:] for row in state["board"]]
        self.swap_available = state["swap_available"]
        self.first_move = state["first_move"]

    def get_tutorial(self):
        """Return tutorial with rules."""
        return """
==============================================================
                      HEX  TUTORIAL
==============================================================

OVERVIEW
  Hex is a two-player connection game played on a rhombus-
  shaped board of hexagonal cells. Each player tries to
  connect their two opposite sides of the board.

--------------------------------------------------------------
RULES
--------------------------------------------------------------
  1. Player 1 (X) tries to connect the TOP side to the
     BOTTOM side of the board.

  2. Player 2 (O) tries to connect the LEFT side to the
     RIGHT side of the board.

  3. Players take turns placing one stone on any empty cell.

  4. The first player to complete a connected path of their
     stones between their two sides wins.

  5. Hex can never end in a draw - one player must always
     win (this is a mathematical property of the game).

--------------------------------------------------------------
SWAP RULE
--------------------------------------------------------------
  After Player 1 makes the first move, Player 2 may choose
  to "swap" - taking over Player 1's stone instead of placing
  a new one. This balances the first-move advantage.

  To swap, type 'swap' when prompted for your move.

--------------------------------------------------------------
HOW TO ENTER MOVES
--------------------------------------------------------------
  Type the column letter followed by the row number.
  Examples:
    A1  = top-left corner
    C5  = column C, row 5
    B3  = column B, row 3

  The board is displayed with offset rows to represent the
  hexagonal grid. Each cell has 6 neighbors (not 4).

--------------------------------------------------------------
VARIATIONS
--------------------------------------------------------------
  7x7   : Smaller board, good for learning.
  9x9   : Medium board, balanced play.
  11x11 : Standard tournament size.

--------------------------------------------------------------
STRATEGY HINTS
--------------------------------------------------------------
  - The center of the board is generally the strongest
    opening position (hence the swap rule).
  - Try to build connected groups rather than isolated stones.
  - A "bridge" pattern (two stones with two empty cells
    between them that share both neighbors) is a virtual
    connection - your opponent cannot block both paths.
  - Think about defense and offense simultaneously - a good
    move often serves both purposes.
  - Look for "ladder" patterns that force your opponent to
    respond along a predictable path.

--------------------------------------------------------------
CONTROLS
--------------------------------------------------------------
  'quit'  / 'q'  -- Quit the game
  'save'  / 's'  -- Save and suspend the game
  'help'  / 'h'  -- Show quick help
  'tutorial' / 't' -- Show this tutorial
==============================================================
"""
