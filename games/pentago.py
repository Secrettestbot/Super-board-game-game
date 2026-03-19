"""Pentago - Twisting marble strategy game on a 6x6 board."""

from engine.base import BaseGame, input_with_quit, clear_screen


class PentagoGame(BaseGame):
    """Pentago: Place a marble then rotate a quadrant to get 5 in a row."""

    name = "Pentago"
    description = "Place a marble and twist a quadrant - first to 5 in a row wins"
    min_players = 2
    max_players = 2
    variations = {
        "standard": "Standard Pentago",
    }

    SIZE = 6
    HALF = 3
    SYMBOLS = {0: ".", 1: "X", 2: "O"}

    QUADRANT_MAP = {
        "TL": (0, 0),  # top-left:     rows 0-2, cols 0-2
        "TR": (0, 3),  # top-right:    rows 0-2, cols 3-5
        "BL": (3, 0),  # bottom-left:  rows 3-5, cols 0-2
        "BR": (3, 3),  # bottom-right: rows 3-5, cols 3-5
    }

    def __init__(self, variation=None):
        super().__init__(variation or "standard")

    # ------------------------------------------------------------------ setup
    def setup(self):
        """Initialize empty 6x6 board."""
        self.board = [[0] * self.SIZE for _ in range(self.SIZE)]

    # --------------------------------------------------------------- display
    def display(self):
        """Display the board with quadrant dividers."""
        s = self.SYMBOLS
        p = self.players[self.current_player - 1]
        print(f"\n  === Pentago ===  Turn {self.turn_number + 1}")
        print(f"  {self.players[0]} (X)  vs  {self.players[1]} (O)")
        print(f"  Current: {p} ({s[self.current_player]})")
        print()

        # Column headers
        header = "       "
        for c in range(self.SIZE):
            header += f" {c + 1} "
            if c == 2:
                header += " "
        print(header)

        # Top border
        print("      +" + "---" * 3 + "+" + "---" * 3 + "+")

        for r in range(self.SIZE):
            row_str = f"  {r + 1}   |"
            for c in range(self.SIZE):
                row_str += f" {s[self.board[r][c]]} "
                if c == 2:
                    row_str += "|"
            row_str += "|"
            print(row_str)
            if r == 2:
                print("      +" + "---" * 3 + "+" + "---" * 3 + "+")

        # Bottom border
        print("      +" + "---" * 3 + "+" + "---" * 3 + "+")

        # Quadrant labels
        print("        TL         TR")
        print("        BL         BR")
        print()

    # --------------------------------------------------------------- helpers
    def _get_quadrant(self, name):
        """Extract a 3x3 quadrant from the board as a list of lists."""
        r0, c0 = self.QUADRANT_MAP[name]
        return [[self.board[r0 + r][c0 + c] for c in range(self.HALF)]
                for r in range(self.HALF)]

    def _set_quadrant(self, name, quad):
        """Write a 3x3 quadrant back to the board."""
        r0, c0 = self.QUADRANT_MAP[name]
        for r in range(self.HALF):
            for c in range(self.HALF):
                self.board[r0 + r][c0 + c] = quad[r][c]

    def _rotate_cw(self, quad):
        """Rotate a 3x3 grid 90 degrees clockwise."""
        n = self.HALF
        return [[quad[n - 1 - c][r] for c in range(n)] for r in range(n)]

    def _rotate_ccw(self, quad):
        """Rotate a 3x3 grid 90 degrees counter-clockwise."""
        n = self.HALF
        return [[quad[c][n - 1 - r] for c in range(n)] for r in range(n)]

    def _check_five(self, player):
        """Check if player has 5 in a row anywhere on the board."""
        b = self.board
        n = self.SIZE

        # Horizontal
        for r in range(n):
            for c in range(n - 4):
                if all(b[r][c + i] == player for i in range(5)):
                    return True

        # Vertical
        for r in range(n - 4):
            for c in range(n):
                if all(b[r + i][c] == player for i in range(5)):
                    return True

        # Diagonal (top-left to bottom-right)
        for r in range(n - 4):
            for c in range(n - 4):
                if all(b[r + i][c + i] == player for i in range(5)):
                    return True

        # Diagonal (top-right to bottom-left)
        for r in range(n - 4):
            for c in range(4, n):
                if all(b[r + i][c - i] == player for i in range(5)):
                    return True

        return False

    def _board_full(self):
        """Check if all 36 positions are filled."""
        return all(self.board[r][c] != 0
                   for r in range(self.SIZE) for c in range(self.SIZE))

    # --------------------------------------------------------------- get_move
    def get_move(self):
        """Get placement and rotation from current player."""
        name = self.players[self.current_player - 1]
        sym = self.SYMBOLS[self.current_player]

        while True:
            print(f"  {name} ({sym}), enter move: row,col quadrant direction")
            print("  Example: 2,3 TR CW  (place at row 2 col 3, rotate top-right clockwise)")
            print("  Quadrants: TL TR BL BR   Directions: CW CCW")
            raw = input_with_quit("  Your move: ").strip().upper()

            try:
                parts = raw.split()
                if len(parts) != 3:
                    print("  Need 3 parts: row,col quadrant direction")
                    continue

                coords = parts[0].split(",")
                if len(coords) != 2:
                    print("  Position format: row,col (e.g. 2,3)")
                    continue

                row = int(coords[0]) - 1
                col = int(coords[1]) - 1

                if not (0 <= row < self.SIZE and 0 <= col < self.SIZE):
                    print(f"  Row and column must be 1-{self.SIZE}.")
                    continue

                if self.board[row][col] != 0:
                    print("  That position is already occupied.")
                    continue

                quadrant = parts[1]
                if quadrant not in self.QUADRANT_MAP:
                    print("  Invalid quadrant. Use: TL, TR, BL, BR")
                    continue

                direction = parts[2]
                if direction not in ("CW", "CCW"):
                    print("  Invalid direction. Use: CW or CCW")
                    continue

                return (row, col, quadrant, direction)

            except (ValueError, IndexError):
                print("  Invalid input. Format: row,col quadrant direction")

    # -------------------------------------------------------------- make_move
    def make_move(self, move):
        """Place marble and rotate quadrant. Returns True if valid."""
        row, col, quadrant, direction = move

        if not (0 <= row < self.SIZE and 0 <= col < self.SIZE):
            return False
        if self.board[row][col] != 0:
            return False
        if quadrant not in self.QUADRANT_MAP:
            return False
        if direction not in ("CW", "CCW"):
            return False

        # 1. Place the marble
        self.board[row][col] = self.current_player

        # 2. Rotate the quadrant
        quad = self._get_quadrant(quadrant)
        if direction == "CW":
            rotated = self._rotate_cw(quad)
        else:
            rotated = self._rotate_ccw(quad)
        self._set_quadrant(quadrant, rotated)

        return True

    # -------------------------------------------------------- check_game_over
    def check_game_over(self):
        """Check for 5 in a row after rotation. Both players can win (draw)."""
        p1_wins = self._check_five(1)
        p2_wins = self._check_five(2)

        if p1_wins and p2_wins:
            # Both have 5 in a row - it's a draw
            self.game_over = True
            self.winner = None
        elif p1_wins:
            self.game_over = True
            self.winner = 1
        elif p2_wins:
            self.game_over = True
            self.winner = 2
        elif self._board_full():
            self.game_over = True
            self.winner = None  # draw

    # ----------------------------------------------------------- state / save
    def get_state(self):
        """Return serializable game state."""
        return {
            "board": [row[:] for row in self.board],
        }

    def load_state(self, state):
        """Restore game state from saved data."""
        self.board = [row[:] for row in state["board"]]

    # -------------------------------------------------------------- tutorial
    def get_tutorial(self):
        """Return tutorial text for Pentago."""
        return """
==============================================================
                     PENTAGO  TUTORIAL
==============================================================

OVERVIEW
  Pentago is a two-player strategy game played on a 6x6 board
  divided into four 3x3 quadrants. Each turn has two parts:
  place a marble, then rotate a quadrant. The first player to
  get 5 marbles in a row wins.

  Player 1 uses X, Player 2 uses O.

--------------------------------------------------------------
BOARD LAYOUT
--------------------------------------------------------------
  The 6x6 board is divided into four 3x3 quadrants:

       1  2  3   4  5  6
      +---------+---------+
  1   | .  .  . | .  .  . |
  2   | .  .  . | .  .  . |   TL = Top-Left
  3   | .  .  . | .  .  . |   TR = Top-Right
      +---------+---------+
  4   | .  .  . | .  .  . |   BL = Bottom-Left
  5   | .  .  . | .  .  . |   BR = Bottom-Right
  6   | .  .  . | .  .  . |
      +---------+---------+

--------------------------------------------------------------
HOW TO PLAY
--------------------------------------------------------------
  Each turn consists of TWO actions in order:

  1. PLACE a marble on any empty position on the board.

  2. ROTATE any one of the four quadrants 90 degrees,
     either clockwise (CW) or counter-clockwise (CCW).

  You MUST do both actions every turn. You may rotate ANY
  quadrant, including one that is empty or the one you just
  placed in. The rotation is mandatory even if it helps your
  opponent.

--------------------------------------------------------------
HOW TO ENTER MOVES
--------------------------------------------------------------
  Format: row,col quadrant direction

  Examples:
    2,3 TR CW    Place at row 2 col 3, rotate Top-Right CW
    5,1 BL CCW   Place at row 5 col 1, rotate Bottom-Left CCW
    1,6 TL CW    Place at row 1 col 6, rotate Top-Left CW

  Quadrants: TL (top-left), TR (top-right),
             BL (bottom-left), BR (bottom-right)
  Directions: CW (clockwise), CCW (counter-clockwise)

--------------------------------------------------------------
WINNING
--------------------------------------------------------------
  Get 5 of your marbles in a row -- horizontally, vertically,
  or diagonally. The check happens AFTER the rotation.

  Special case: if the rotation creates 5 in a row for BOTH
  players simultaneously, the game is a draw.

  If the board fills up with no 5 in a row, it's also a draw.

--------------------------------------------------------------
CONTROLS
--------------------------------------------------------------
  'quit'  / 'q'  -- Quit the game
  'save'  / 's'  -- Save and suspend the game
  'help'  / 'h'  -- Show quick help
  'tutorial' / 't' -- Show this tutorial

--------------------------------------------------------------
STRATEGY TIPS
--------------------------------------------------------------
  - Think about BOTH the placement and rotation together.
    A seemingly weak placement can become powerful after a
    clever rotation.

  - Watch out for your opponent's setups. Sometimes the best
    move is a defensive rotation that breaks their line.

  - The center positions of each quadrant don't move during
    rotation -- they're safe anchors for your lines.

  - Corner and edge positions of a quadrant swap places
    during rotation. Track where pieces will end up.

  - Try to build threats in multiple quadrants so that no
    single rotation can stop you.

  - Early game: spread your pieces across quadrants to
    maximize future options.

  - Late game: count carefully. A forced rotation might
    complete your opponent's line instead of yours.

  - Remember: you MUST rotate. Sometimes every rotation
    helps your opponent, so plan ahead to avoid that.
==============================================================
"""
