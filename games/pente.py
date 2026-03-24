"""Pente -- five in a row with custodial captures on a Go-style board."""

from engine.base import BaseGame, input_with_quit, clear_screen


class PenteGame(BaseGame):
    """Pente with standard (19x19) and small (13x13) variations."""

    name = "Pente"
    description = "Five in a row with custodial captures"
    min_players = 2
    max_players = 2
    variations = {
        "standard": "Standard Pente (19x19)",
        "small": "Small Pente (13x13)",
    }

    SYMBOLS = {0: "\u00b7", 1: "\u25cf", 2: "\u25cb"}  # · ● ○

    # Eight directions for line checks and captures
    DIRECTIONS = [(0, 1), (0, -1), (1, 0), (-1, 0),
                  (1, 1), (1, -1), (-1, 1), (-1, -1)]

    def __init__(self, variation=None):
        super().__init__(variation or "standard")

    # ------------------------------------------------------------------ setup
    def setup(self):
        self.size = 19 if self.variation == "standard" else 13
        self.center = self.size // 2
        # board[row][col]: 0=empty, 1=black, 2=white
        self.board = [[0] * self.size for _ in range(self.size)]
        # captures[player] = number of *opponent stones* captured (pairs count as 2)
        self.captures = {1: 0, 2: 0}

    # --------------------------------------------------------------- display
    def display(self):
        s = self.SYMBOLS
        p = self.players[self.current_player - 1]
        sym = s[self.current_player]

        print(f"\n  {self.name} ({self.variation}, {self.size}x{self.size})"
              f"  --  Turn {self.turn_number + 1}")
        print(f"  {self.players[0]} (Black {s[1]})  vs  {self.players[1]} (White {s[2]})")
        print(f"  Captures:  Black {self.captures[1]}   White {self.captures[2]}")
        print(f"  Current: {p} ({sym})\n")

        col_labels = self._col_labels()

        # Header
        print("     " + "  ".join(col_labels))

        star_points = self._star_points()

        for r in range(self.size):
            row_num = self.size - r
            row_str = f"  {row_num:2d}  "
            for c in range(self.size):
                cell = self.board[r][c]
                if cell != 0:
                    row_str += f"{s[cell]}  "
                elif (r, c) in star_points:
                    row_str += "+  "
                else:
                    row_str += f"{s[0]}  "
            row_str += f"{row_num}"
            print(row_str)

        # Footer
        print("     " + "  ".join(col_labels))
        print()

    def _col_labels(self):
        """Column letters A-T (skipping I) for 19x19, A-N (skipping I) for 13x13."""
        labels = []
        ch = ord('A')
        for _ in range(self.size):
            if chr(ch) == 'I':
                ch += 1  # skip I
            labels.append(chr(ch))
            ch += 1
        return labels

    def _star_points(self):
        """Return set of (row, col) star-point intersections for display."""
        pts = set()
        if self.size == 19:
            for r in (3, 9, 15):
                for c in (3, 9, 15):
                    pts.add((r, c))
        elif self.size == 13:
            for r in (3, 6, 9):
                for c in (3, 6, 9):
                    pts.add((r, c))
        return pts

    # --------------------------------------------------------------- get_move
    def get_move(self):
        while True:
            raw = input_with_quit(
                f"  {self.players[self.current_player - 1]}, enter move (e.g. J10): "
            )
            parsed = self._parse_move(raw)
            if parsed is None:
                print("  Invalid format. Use column letter + row number, e.g. J10, A1.")
                continue
            row, col = parsed

            if self.board[row][col] != 0:
                print("  That intersection is already occupied.")
                continue

            # Tournament rule: first move must be at center
            if self.turn_number == 0:
                if row != self.center or col != self.center:
                    print(f"  First move must be at the center intersection "
                          f"({self._pos_to_str(self.center, self.center)}).")
                    continue

            # Tournament rule: player 1's second move (turn 2) must be 3+
            # intersections from center (Chebyshev distance)
            if self.turn_number == 2:
                dist = max(abs(row - self.center), abs(col - self.center))
                if dist < 3:
                    print("  Your second stone must be at least 3 intersections "
                          "from the center (tournament rule).")
                    continue

            return (row, col)

    def _parse_move(self, move_str):
        """Parse 'J10' style input into (row, col). Returns None on failure.

        Columns use letters A-T (skipping I) on a 19x19 board,
        A-N (skipping I) on a 13x13 board.
        """
        raw = move_str.strip().upper()
        if len(raw) < 2 or len(raw) > 3:
            return None
        col_ch = raw[0]
        row_str = raw[1:]
        if not col_ch.isalpha() or not row_str.isdigit():
            return None

        # Map letter to column index (skip I)
        col = self._letter_to_col(col_ch)
        if col is None or col < 0 or col >= self.size:
            return None

        row_num = int(row_str)
        if row_num < 1 or row_num > self.size:
            return None

        # Row 19 is board index 0 (top), row 1 is board index 18 (bottom)
        row = self.size - row_num
        return (row, col)

    def _letter_to_col(self, ch):
        """Convert column letter to index, accounting for skipped I."""
        ch = ch.upper()
        if ch < 'A' or ch > 'T':
            return None
        idx = ord(ch) - ord('A')
        if ch == 'I':
            return None  # I is not used
        if ch > 'I':
            idx -= 1  # shift down because I is skipped
        return idx

    def _col_to_letter(self, col):
        """Convert column index back to display letter (skipping I)."""
        ch = ord('A') + col
        if ch >= ord('I'):
            ch += 1  # skip I
        return chr(ch)

    def _pos_to_str(self, row, col):
        """Convert (row, col) to display string like 'J10'."""
        return f"{self._col_to_letter(col)}{self.size - row}"

    # -------------------------------------------------------------- make_move
    def make_move(self, move):
        row, col = move
        if self.board[row][col] != 0:
            return False
        self.board[row][col] = self.current_player
        # Check and perform custodial captures
        self._do_captures(row, col)
        return True

    def _do_captures(self, row, col):
        """Perform custodial captures after placing a stone at (row, col).

        A custodial capture occurs when the placed stone flanks exactly two
        consecutive opponent stones against another friendly stone in any
        of the eight directions.
        Pattern: current X X current  (where X is the opponent)
        """
        player = self.current_player
        opponent = 3 - player

        for dr, dc in self.DIRECTIONS:
            # Check positions 1 and 2 steps away for opponent stones
            r1, c1 = row + dr, col + dc
            r2, c2 = row + 2 * dr, col + 2 * dc
            # Check position 3 steps away for own stone
            r3, c3 = row + 3 * dr, col + 3 * dc

            if not (0 <= r1 < self.size and 0 <= c1 < self.size):
                continue
            if not (0 <= r2 < self.size and 0 <= c2 < self.size):
                continue
            if not (0 <= r3 < self.size and 0 <= c3 < self.size):
                continue

            if (self.board[r1][c1] == opponent and
                    self.board[r2][c2] == opponent and
                    self.board[r3][c3] == player):
                # Capture!
                self.board[r1][c1] = 0
                self.board[r2][c2] = 0
                self.captures[player] += 2

    # -------------------------------------------------------- check_game_over
    def check_game_over(self):
        # Check five-in-a-row for the player who just moved
        if self._has_five_in_a_row(self.current_player):
            self.game_over = True
            self.winner = self.current_player
            return

        # Check capture win (5 captures = 10 stones removed)
        if self.captures[self.current_player] >= 10:
            self.game_over = True
            self.winner = self.current_player
            return

        # Draw if board is full (extremely rare in Pente)
        if all(self.board[r][c] != 0
               for r in range(self.size)
               for c in range(self.size)):
            self.game_over = True
            self.winner = None

    def _has_five_in_a_row(self, player):
        """Check if player has 5 or more consecutive stones in any direction."""
        # Only need to check 4 unique directions (the other 4 are reverses)
        directions = [(0, 1), (1, 0), (1, 1), (1, -1)]
        for r in range(self.size):
            for c in range(self.size):
                if self.board[r][c] != player:
                    continue
                for dr, dc in directions:
                    count = self._count_consecutive(r, c, dr, dc, player)
                    if count >= 5:
                        return True
        return False

    def _count_consecutive(self, row, col, dr, dc, player):
        """Count consecutive stones starting from (row, col) in direction (dr, dc).
        Only counts if (row-dr, col-dc) is not the same player (start of run)."""
        pr, pc = row - dr, col - dc
        if 0 <= pr < self.size and 0 <= pc < self.size and self.board[pr][pc] == player:
            return 0  # not the start of the run
        count = 0
        r, c = row, col
        while 0 <= r < self.size and 0 <= c < self.size and self.board[r][c] == player:
            count += 1
            r += dr
            c += dc
        return count

    # ----------------------------------------------------------- state / save
    def get_state(self):
        return {
            "variation": self.variation,
            "size": self.size,
            "board": [row[:] for row in self.board],
            "captures": {str(k): v for k, v in self.captures.items()},
            "center": self.center,
        }

    def load_state(self, state):
        self.variation = state["variation"]
        self.size = state["size"]
        self.board = [row[:] for row in state["board"]]
        self.captures = {int(k): v for k, v in state["captures"].items()}
        self.center = state["center"]

    # -------------------------------------------------------------- tutorial
    def get_tutorial(self):
        return """
==============================================================
                       PENTE  TUTORIAL
==============================================================

OVERVIEW
  Pente is a two-player strategy game played on a Go-style
  board (19x19 standard, or 13x13 small).  Players take turns
  placing stones on the intersections.  There are two ways
  to win:

    1. Get FIVE (or more) of your stones in a row
       (horizontally, vertically, or diagonally).

    2. Make FIVE custodial captures (removing 10 opponent
       stones total).

  Player 1 plays Black (\u25cf) and always goes first.
  Player 2 plays White (\u25cb).

--------------------------------------------------------------
HOW TO PLAY
--------------------------------------------------------------
  The board uses Go-style coordinates:
    Columns : A through T, skipping I  (left to right)
    Rows    : 1 through 19 (bottom to top)

  Enter your move as a column letter + row number, e.g.:
    J10  = column J, row 10  (center on a 19x19 board)
    A1   = bottom-left corner
    T19  = top-right corner

--------------------------------------------------------------
TOURNAMENT OPENING RULES
--------------------------------------------------------------
  To balance the first-move advantage, Pente uses two
  restrictions on the first player (Black):

  1. Black's FIRST stone must be placed at the center
     intersection of the board.

  2. Black's SECOND stone (their second turn, i.e. the third
     move of the game) must be placed at least 3 intersections
     away from the center.  Distance is measured as the
     maximum of horizontal and vertical distance (Chebyshev
     distance), so the 5x5 area around the center is off
     limits for this move.

--------------------------------------------------------------
CUSTARD CAPTURES
--------------------------------------------------------------
  If you place a stone so that exactly two consecutive
  opponent stones are flanked between your new stone and
  another of your stones in a straight line, those two
  opponent stones are removed from the board.

  Example (X places at position marked *):

    Before:  X O O *     After:  X . . X
                                (two O stones captured)

  Captures can happen in any of the 8 directions
  (horizontal, vertical, or diagonal) and multiple captures
  can occur from a single move.

  Each capture removes 2 stones.  When a player has captured
  a total of 10 opponent stones (5 pairs), that player wins.

--------------------------------------------------------------
VARIATIONS
--------------------------------------------------------------
  standard  : 19x19 board (classic Pente)
  small     : 13x13 board (quicker games)

--------------------------------------------------------------
STRATEGY TIPS
--------------------------------------------------------------
  - Control the center of the board early.
  - Build threats in multiple directions at once.
  - Watch out for capture setups -- do not leave pairs of
    your stones with open ends on both sides.
  - Sometimes sacrificing stones for a capture can open
    up winning lines.
  - An open four (four in a row with both ends open) is
    unstoppable, so try to force your opponent into
    defensive play.
  - Keep track of your capture count and your opponent's.
    A capture win can sneak up on either player.

--------------------------------------------------------------
CONTROLS
--------------------------------------------------------------
  'quit'     / 'q'  -- Quit the game
  'save'     / 's'  -- Save and suspend the game
  'help'     / 'h'  -- Show quick help
  'tutorial' / 't'  -- Show this tutorial
==============================================================
"""
