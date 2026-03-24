"""Breakthrough - A simple but deep strategy game where pieces race to the opposite side."""

from engine.base import BaseGame, input_with_quit, clear_screen


class BreakthroughGame(BaseGame):
    """Breakthrough: Race your pieces to the opponent's back row to win."""

    name = "Breakthrough"
    description = "Race your pieces across the board - first to reach the other side wins"
    min_players = 2
    max_players = 2
    variations = {
        "standard": "Standard (8x8)",
        "small": "Small (6x6)",
        "large": "Large (10x10)",
    }

    def __init__(self, variation=None):
        super().__init__(variation or "standard")
        self.size = 0
        self.board = []

    def setup(self):
        """Initialize the board with two rows of pieces per player."""
        if self.variation == "small":
            self.size = 6
        elif self.variation == "large":
            self.size = 10
        else:
            self.size = 8

        self.board = [[0] * self.size for _ in range(self.size)]

        # Player 2 (Black) occupies the top two rows
        for r in range(2):
            for c in range(self.size):
                self.board[r][c] = 2

        # Player 1 (White) occupies the bottom two rows
        for r in range(self.size - 2, self.size):
            for c in range(self.size):
                self.board[r][c] = 1

    def display(self):
        """Display the board with W and B pieces."""
        symbols = {0: ".", 1: "W", 2: "B"}
        p1_count = sum(1 for r in range(self.size) for c in range(self.size)
                       if self.board[r][c] == 1)
        p2_count = sum(1 for r in range(self.size) for c in range(self.size)
                       if self.board[r][c] == 2)

        print(f"\n  === Breakthrough ({self.variations[self.variation]}) ===")
        print(f"  {self.players[0]} (W): {p1_count} pieces")
        print(f"  {self.players[1]} (B): {p2_count} pieces")
        print(f"  Turn {self.turn_number + 1} - {self.players[self.current_player - 1]}'s move")
        print()

        # Column headers
        col_labels = [chr(ord('a') + c) for c in range(self.size)]
        print("    " + "  ".join(col_labels))
        print("  +" + "---" * self.size + "+")

        for r in range(self.size):
            row_num = self.size - r
            row_str = f"{row_num:2}|"
            for c in range(self.size):
                row_str += f" {symbols[self.board[r][c]]} "
            row_str += f"|{row_num}"
            print(row_str)

        print("  +" + "---" * self.size + "+")
        print("    " + "  ".join(col_labels))
        print()

    def _parse_pos(self, s):
        """Parse a position string like 'a2' into (row, col) or None."""
        s = s.strip().lower()
        if len(s) < 2:
            return None
        col_char = s[0]
        if not col_char.isalpha():
            return None
        try:
            row_num = int(s[1:])
        except ValueError:
            return None
        col = ord(col_char) - ord('a')
        row = self.size - row_num
        if 0 <= row < self.size and 0 <= col < self.size:
            return (row, col)
        return None

    def _pos_to_str(self, row, col):
        """Convert (row, col) to display string like 'a2'."""
        return f"{chr(ord('a') + col)}{self.size - row}"

    def get_move(self):
        """Get move as 'from to', e.g. 'a2 b3'."""
        player = self.current_player
        player_name = self.players[player - 1]
        max_col = chr(ord('a') + self.size - 1)

        while True:
            raw = input_with_quit(
                f"  {player_name}, enter move (e.g. a2 b3): "
            ).strip()

            # Split by space, dash, or 'to'
            parts = raw.replace('-', ' ').replace(' to ', ' ').split()
            if len(parts) != 2:
                print(f"  Invalid format. Enter source and destination, e.g. 'a2 b3'.")
                continue

            src = self._parse_pos(parts[0])
            dst = self._parse_pos(parts[1])

            if src is None:
                print(f"  Invalid source position. Use letter+number (a-{max_col}, 1-{self.size}).")
                continue
            if dst is None:
                print(f"  Invalid destination position. Use letter+number (a-{max_col}, 1-{self.size}).")
                continue

            return (src, dst)

    def make_move(self, move):
        """Apply a move. Returns True if valid."""
        (sr, sc), (dr, dc) = move
        player = self.current_player
        opponent = 3 - player

        # Must move own piece
        if self.board[sr][sc] != player:
            print("  You must move your own piece.")
            return False

        # Direction: Player 1 (W) moves up (decreasing row), Player 2 (B) moves down (increasing row)
        if player == 1:
            forward = -1
        else:
            forward = 1

        # Must move exactly one step forward
        row_diff = dr - sr
        col_diff = dc - sc

        if row_diff != forward:
            print("  Pieces can only move one step forward.")
            return False

        if abs(col_diff) > 1:
            print("  Pieces can only move straight or diagonally forward.")
            return False

        # Straight forward: destination must be empty
        if col_diff == 0:
            if self.board[dr][dc] != 0:
                print("  Cannot move straight forward into an occupied square.")
                return False
        else:
            # Diagonal forward: can move to empty or capture opponent
            if self.board[dr][dc] == player:
                print("  Cannot move onto your own piece.")
                return False
            # Can capture opponent or move to empty

        # Execute the move
        self.board[sr][sc] = 0
        self.board[dr][dc] = player
        return True

    def check_game_over(self):
        """Check if a player has reached the opponent's back row, or opponent has no pieces."""
        # Player 1 wins by reaching row 0
        for c in range(self.size):
            if self.board[0][c] == 1:
                self.game_over = True
                self.winner = 1
                return

        # Player 2 wins by reaching the last row
        for c in range(self.size):
            if self.board[self.size - 1][c] == 2:
                self.game_over = True
                self.winner = 2
                return

        # Check if either player has no pieces left
        p1_count = 0
        p2_count = 0
        for r in range(self.size):
            for c in range(self.size):
                if self.board[r][c] == 1:
                    p1_count += 1
                elif self.board[r][c] == 2:
                    p2_count += 1

        if p1_count == 0:
            self.game_over = True
            self.winner = 2
            return
        if p2_count == 0:
            self.game_over = True
            self.winner = 1
            return

        # Check if current player's opponent has any legal moves
        next_player = 3 - self.current_player
        if not self._has_legal_moves(next_player):
            self.game_over = True
            self.winner = self.current_player

    def _has_legal_moves(self, player):
        """Check if the given player has any legal moves."""
        forward = -1 if player == 1 else 1
        for r in range(self.size):
            for c in range(self.size):
                if self.board[r][c] != player:
                    continue
                nr = r + forward
                if nr < 0 or nr >= self.size:
                    continue
                # Straight forward
                if self.board[nr][c] == 0:
                    return True
                # Diagonal left
                if c - 1 >= 0 and self.board[nr][c - 1] != player:
                    return True
                # Diagonal right
                if c + 1 < self.size and self.board[nr][c + 1] != player:
                    return True
        return False

    def get_state(self):
        """Return serializable game state."""
        return {
            "size": self.size,
            "board": [row[:] for row in self.board],
        }

    def load_state(self, state):
        """Restore game state."""
        self.size = state["size"]
        self.board = [row[:] for row in state["board"]]

    def get_tutorial(self):
        """Return tutorial text."""
        return """
==============================================================
                  BREAKTHROUGH TUTORIAL
==============================================================

OVERVIEW
  Breakthrough is a two-player abstract strategy game. Each
  player starts with two rows of pieces and tries to be the
  first to move a piece to the opponent's back row.

--------------------------------------------------------------
RULES
--------------------------------------------------------------
  1. Player 1 (W - White) starts at the bottom and moves UP.
     Player 2 (B - Black) starts at the top and moves DOWN.

  2. On your turn, move one of your pieces forward one step:
     - Straight forward (one square ahead)
     - Diagonally forward-left (one square)
     - Diagonally forward-right (one square)

  3. Moving straight forward is only allowed if the
     destination square is EMPTY.

  4. Moving diagonally forward is allowed if the destination
     is empty OR occupied by an opponent's piece (capture).

  5. Captured pieces are removed from the board.

  6. There is NO backward movement of any kind.

--------------------------------------------------------------
WINNING
--------------------------------------------------------------
  You win by:
  - Moving any one of your pieces to the opponent's back row
    (row 1 for Black, row 8 for White on a standard board)
  - Capturing all of your opponent's pieces
  - Your opponent having no legal moves

--------------------------------------------------------------
HOW TO ENTER MOVES
--------------------------------------------------------------
  Enter the source and destination squares separated by a
  space, dash, or 'to':

    a2 b3     - move piece from a2 to b3
    a2-b3     - same move with dash
    a2 to b3  - same move with 'to'

  Columns are letters (a-h on standard), rows are numbers
  (1-8 on standard) from bottom to top.

--------------------------------------------------------------
VARIATIONS
--------------------------------------------------------------
  Standard (8x8):  Classic board, 16 pieces per player
  Small (6x6):     Faster games, 12 pieces per player
  Large (10x10):   Longer games, 20 pieces per player

--------------------------------------------------------------
STRATEGY HINTS
--------------------------------------------------------------
  - Advance pieces together in groups for mutual protection.
  - A piece with a friendly piece diagonally behind it is
    protected from capture.
  - Try to create a "breakthrough" - a piece that cannot be
    stopped from reaching the back row.
  - Control the center columns for more mobility.
  - Sacrificing a piece can sometimes open a path to victory.
  - Watch for diagonal threats - your opponent can capture
    only diagonally.

--------------------------------------------------------------
CONTROLS
--------------------------------------------------------------
  'quit'  / 'q'  -- Quit the game
  'save'  / 's'  -- Save and suspend the game
  'help'  / 'h'  -- Show quick help
  'tutorial' / 't' -- Show this tutorial
==============================================================
"""
