"""Quixo board game implementation."""

from engine.base import BaseGame, input_with_quit, clear_screen


class QuixoGame(BaseGame):
    """Quixo -- push cubes to get five in a row on a 5x5 grid."""

    name = "Quixo"
    description = "Push cubes on a 5x5 grid to get five of your symbols in a row"
    min_players = 2
    max_players = 2
    variations = {
        "standard": "Standard 5x5 Quixo",
    }
    side_labels = ("X", "O")

    SYMBOLS = {0: ".", 1: "X", 2: "O"}

    def __init__(self, variation=None):
        super().__init__(variation or "standard")

    # ------------------------------------------------------------------ setup
    def setup(self):
        # 0 = blank, 1 = X (player 1), 2 = O (player 2)
        # board[row][col], 0-indexed internally, displayed 1-indexed
        self.board = [[0] * 5 for _ in range(5)]

    # --------------------------------------------------------------- display
    def display(self):
        s = self.SYMBOLS
        p = self.players[self.current_player - 1]
        print(f"\n  {self.name} ({self.variation})  --  Turn {self.turn_number + 1}")
        print(f"  {self.players[0]} (X)  vs  {self.players[1]} (O)")
        print(f"  Current: {p} ({s[self.current_player]})\n")

        # Column headers
        print("      1   2   3   4   5")
        print("    +---+---+---+---+---+")
        for r in range(5):
            row_str = f"  {r + 1} |"
            for c in range(5):
                row_str += f" {s[self.board[r][c]]} |"
            print(row_str)
            print("    +---+---+---+---+---+")

        print(f"\n  Move format: row col direction  (e.g. '1 3 D')")
        print(f"  Directions: U=up, D=down, L=left, R=right")
        print()

    # --------------------------------------------------------------- helpers
    def _is_border(self, r, c):
        """Return True if (r, c) is on the outer border of the 5x5 grid."""
        return r == 0 or r == 4 or c == 0 or c == 4

    def _get_valid_directions(self, r, c):
        """Return the set of valid slide directions for a border cell (r, c).

        A direction indicates which way the OTHER cubes shift, or equivalently
        the direction from which the picked-up cube re-enters. The cube cannot
        be placed back in its original position without sliding, so the
        direction that would leave it in place is excluded.

        Directions: U, D, L, R  (the direction the row/column slides).
        """
        dirs = set()
        # The cube must slide along its row or column from one border edge
        # to the opposite edge. We enumerate all valid push directions.

        # Can push the row LEFT (cube enters from right side)?
        #   Valid when the cell is on the right edge or on a top/bottom edge.
        #   But the cube must actually move -- it cannot stay in place.
        #   Pushing row left means cube re-enters at col 4 (rightmost).
        #   The cube stays in place only if it is already at col 4, BUT
        #   wait -- the rule is: you remove the cube, slide the row, and
        #   place your cube at the vacated end. So pushing LEFT means
        #   cubes shift left and your cube goes to col 4.
        #   This is invalid only if the cube is at col 4 AND that is the
        #   only border it touches... Actually, re-reading the rules:
        #   you pick up a border cube, then push it back from one of the
        #   opposite ends. "Opposite" means from the other side of the
        #   row or column. You can push along the row or column the cube
        #   is in, but not from the same edge (you can't just put it back).

        # Let's enumerate properly:
        # For a cube at (r, c), possible pushes are along its row or column,
        # but only from the opposite end of where the cube was.

        # Along the ROW (horizontal push):
        if c == 0:
            # Cube is on the left edge -> can push from the right (push LEFT)
            dirs.add("L")
        elif c == 4:
            # Cube is on the right edge -> can push from the left (push RIGHT)
            dirs.add("R")
        else:
            # Cube is on top or bottom edge but not a corner on left/right
            # It's in the interior of the row, so can push from either end
            dirs.add("L")
            dirs.add("R")

        # Along the COLUMN (vertical push):
        if r == 0:
            # Cube is on the top edge -> can push from the bottom (push UP)
            dirs.add("U")
        elif r == 4:
            # Cube is on the bottom edge -> can push from the top (push DOWN)
            dirs.add("D")
        else:
            # Cube is on left or right edge but not a corner on top/bottom
            # It's in the interior of the column, so can push from either end
            dirs.add("U")
            dirs.add("D")

        return dirs

    def _apply_slide(self, r, c, direction, symbol):
        """Remove cube at (r, c), slide the row/column in the given direction,
        and place the cube (now showing `symbol`) at the vacated end.

        Direction indicates which way cubes shift:
          U = column shifts up, cube enters at bottom (row 4)
          D = column shifts down, cube enters at top (row 0)
          L = row shifts left, cube enters at right (col 4)
          R = row shifts right, cube enters at left (col 0)
        """
        if direction == "L":
            # Slide row r to the left; cube enters at col 4
            row = self.board[r]
            # Remove the cube at col c
            removed = row.pop(c)
            # Append the symbol at the right end
            row.append(symbol)
        elif direction == "R":
            # Slide row r to the right; cube enters at col 0
            row = self.board[r]
            removed = row.pop(c)
            row.insert(0, symbol)
        elif direction == "U":
            # Slide column c upward; cube enters at row 4
            col_vals = [self.board[rr][c] for rr in range(5)]
            removed = col_vals.pop(r)
            col_vals.append(symbol)
            for rr in range(5):
                self.board[rr][c] = col_vals[rr]
        elif direction == "D":
            # Slide column c downward; cube enters at row 0
            col_vals = [self.board[rr][c] for rr in range(5)]
            removed = col_vals.pop(r)
            col_vals.insert(0, symbol)
            for rr in range(5):
                self.board[rr][c] = col_vals[rr]

    # --------------------------------------------------------------- get_move
    def get_move(self):
        symbol = self.SYMBOLS[self.current_player]
        while True:
            raw = input_with_quit(
                f"  {self.players[self.current_player - 1]}, enter move (row col dir): "
            )
            parts = raw.strip().upper().split()
            if len(parts) != 3:
                print("  Invalid format. Use: row col direction (e.g. '1 3 D')")
                continue
            try:
                r = int(parts[0]) - 1
                c = int(parts[1]) - 1
            except ValueError:
                print("  Row and column must be numbers 1-5.")
                continue
            d = parts[2]
            if not (0 <= r <= 4 and 0 <= c <= 4):
                print("  Row and column must be between 1 and 5.")
                continue
            if not self._is_border(r, c):
                print("  You must pick a cube from the outer border.")
                continue
            cell = self.board[r][c]
            opponent = 2 if self.current_player == 1 else 1
            if cell == opponent:
                print(f"  That cube shows {self.SYMBOLS[opponent]}. "
                      f"You can only pick blank (.) or your own ({symbol}).")
                continue
            if d not in ("U", "D", "L", "R"):
                print("  Direction must be U, D, L, or R.")
                continue
            valid_dirs = self._get_valid_directions(r, c)
            if d not in valid_dirs:
                print(f"  Cannot push direction {d} from that position. "
                      f"Valid: {', '.join(sorted(valid_dirs))}")
                continue
            return (r, c, d)

    # -------------------------------------------------------------- make_move
    def make_move(self, move):
        if move is None:
            return False
        r, c, d = move
        # Validate once more
        if not self._is_border(r, c):
            return False
        cell = self.board[r][c]
        opponent = 2 if self.current_player == 1 else 1
        if cell == opponent:
            return False
        valid_dirs = self._get_valid_directions(r, c)
        if d not in valid_dirs:
            return False

        self._apply_slide(r, c, d, self.current_player)
        return True

    # -------------------------------------------------------- check_game_over
    def get_ai_move(self):
        import random as rand
        difficulty = getattr(self, 'ai_difficulty', 'medium')
        p = self.current_player
        opp = 3 - p

        moves = []
        for r in range(5):
            for c in range(5):
                if not self._is_border(r, c):
                    continue
                if self.board[r][c] == opp:
                    continue
                for d in self._get_valid_directions(r, c):
                    moves.append((r, c, d))

        if not moves:
            return (0, 0, "L")

        if difficulty == "easy":
            return rand.choice(moves)

        def _simulate(board, r, c, d, symbol):
            b = [row[:] for row in board]
            if d == "L":
                row = b[r]
                row.pop(c)
                row.append(symbol)
            elif d == "R":
                row = b[r]
                row.pop(c)
                row.insert(0, symbol)
            elif d == "U":
                col_vals = [b[rr][c] for rr in range(5)]
                col_vals.pop(r)
                col_vals.append(symbol)
                for rr in range(5):
                    b[rr][c] = col_vals[rr]
            elif d == "D":
                col_vals = [b[rr][c] for rr in range(5)]
                col_vals.pop(r)
                col_vals.insert(0, symbol)
                for rr in range(5):
                    b[rr][c] = col_vals[rr]
            return b

        def _count_lines(board, player):
            count = 0
            for r in range(5):
                n = sum(1 for c in range(5) if board[r][c] == player)
                if n >= 3:
                    count += n ** 2
            for c in range(5):
                n = sum(1 for r in range(5) if board[r][c] == player)
                if n >= 3:
                    count += n ** 2
            d1 = sum(1 for i in range(5) if board[i][i] == player)
            if d1 >= 3:
                count += d1 ** 2
            d2 = sum(1 for i in range(5) if board[i][4 - i] == player)
            if d2 >= 3:
                count += d2 ** 2
            return count

        def _has_five_b(board, player):
            for r in range(5):
                if all(board[r][c] == player for c in range(5)):
                    return True
            for c in range(5):
                if all(board[r][c] == player for r in range(5)):
                    return True
            if all(board[i][i] == player for i in range(5)):
                return True
            if all(board[i][4 - i] == player for i in range(5)):
                return True
            return False

        scored = []
        sample = moves if difficulty == "hard" else rand.sample(moves, min(30, len(moves)))
        for r, c, d in sample:
            b = _simulate(self.board, r, c, d, p)
            if _has_five_b(b, p) and not _has_five_b(b, opp):
                return (r, c, d)
            if _has_five_b(b, opp):
                score = -1000
            else:
                score = _count_lines(b, p) - _count_lines(b, opp) * 1.2
            if difficulty == "medium":
                score += rand.uniform(-3, 3)
            scored.append((score, r, c, d))

        scored.sort(reverse=True)
        return (scored[0][1], scored[0][2], scored[0][3])

    def check_game_over(self):
        p1_wins = self._has_five(1)
        p2_wins = self._has_five(2)

        if p1_wins and p2_wins:
            # Both have 5 in a row -- the player who moved LOSES
            self.game_over = True
            opponent = 2 if self.current_player == 1 else 1
            self.winner = opponent
        elif p1_wins:
            self.game_over = True
            self.winner = 1
        elif p2_wins:
            self.game_over = True
            self.winner = 2
        # Standard Quixo has no draw, but two players can slide the same
        # cubes back and forth forever, so treat a repeat as a draw.
        elif self._repetition_draw():
            self.game_over = True
            self.winner = None

    def _has_five(self, player):
        """Return True if `player` has 5 in a row (horizontal, vertical, or diagonal)."""
        b = self.board
        # Horizontal rows
        for r in range(5):
            if all(b[r][c] == player for c in range(5)):
                return True
        # Vertical columns
        for c in range(5):
            if all(b[r][c] == player for r in range(5)):
                return True
        # Diagonal top-left to bottom-right
        if all(b[i][i] == player for i in range(5)):
            return True
        # Diagonal top-right to bottom-left
        if all(b[i][4 - i] == player for i in range(5)):
            return True
        return False

    # ----------------------------------------------------------- state / save
    def get_state(self):
        return {
            "board": [row[:] for row in self.board],
        }

    def load_state(self, state):
        self.board = [row[:] for row in state["board"]]

    # -------------------------------------------------------------- tutorial
    def get_tutorial(self):
        return """
==============================================================
                     QUIXO  TUTORIAL
==============================================================

OVERVIEW
  Quixo is a two-player abstract strategy game played on a
  5x5 grid of cubes. All cubes start blank (shown as '.').
  Player 1 plays as X and Player 2 plays as O. The goal is
  to be the first to get 5 of your symbols in a row --
  horizontally, vertically, or diagonally.

--------------------------------------------------------------
HOW TO PLAY
--------------------------------------------------------------
  On your turn you must:

  1. PICK UP a cube from the outer border (row 1, row 5,
     column 1, or column 5). The cube must be either blank
     (.) or showing YOUR symbol. You may never pick up a
     cube showing your opponent's symbol.

  2. SLIDE the cube back into the same row or column from
     the OPPOSITE end. This pushes the remaining cubes in
     that line over by one position. The cube you picked up
     now displays YOUR symbol.

  You cannot place the cube back in its original position
  without sliding -- it must push from a different edge.

--------------------------------------------------------------
MOVE FORMAT
--------------------------------------------------------------
  Enter your move as:  row col direction

    row  : 1-5 (the row of the cube you pick up)
    col  : 1-5 (the column of the cube you pick up)
    dir  : U, D, L, or R (the direction cubes slide)

  The direction indicates how the OTHER cubes shift:
    U = column slides UP,   your cube enters at the bottom
    D = column slides DOWN, your cube enters at the top
    L = row slides LEFT,    your cube enters at the right
    R = row slides RIGHT,   your cube enters at the left

  Example: '1 3 D'
    Pick up the cube at row 1, column 3. Push the column
    downward (cubes shift down, your cube enters at row 1).

  Not all directions are available for every position. You
  can only push from the opposite side of where the cube
  sits. The game will tell you which directions are valid.

--------------------------------------------------------------
WINNING AND LOSING
--------------------------------------------------------------
  - Get 5 of your symbols in a row (horizontal, vertical,
    or diagonal) to win.

  - IMPORTANT: if your move creates 5-in-a-row for BOTH
    players simultaneously, YOU LOSE. The opponent wins.
    Be careful with your slides!

--------------------------------------------------------------
STRATEGY TIPS
--------------------------------------------------------------
  - The center cube (row 3, col 3) cannot be picked up
    since it is not on the border. Once a symbol is placed
    there it stays until pushed by a slide.

  - Corner cubes can be pushed in two directions; edge
    cubes (non-corner border) can be pushed in three
    directions, giving more flexibility.

  - Blank cubes are available to either player. Claiming
    key border positions early limits your opponent's
    options.

  - Watch out for creating 5-in-a-row for your opponent
    when you slide! A careless push can hand them the win.

  - Try to build multiple threats at once. A single line
    of 4 is easy to block, but two simultaneous threats
    are much harder to stop.

--------------------------------------------------------------
CONTROLS
--------------------------------------------------------------
  'quit'     / 'q'  -- Quit the game
  'save'     / 's'  -- Save and suspend the game
  'help'     / 'h'  -- Show quick help
  'tutorial' / 't'  -- Show this tutorial
==============================================================
"""
