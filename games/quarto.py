"""Quarto - A strategy game where your opponent picks the piece you must place."""

from engine.base import BaseGame, input_with_quit, clear_screen


# Piece property bit masks
BIT_HEIGHT = 0  # bit 0: tall(1) / short(0)
BIT_COLOR = 1   # bit 1: dark(1) / light(0)
BIT_SHAPE = 2   # bit 2: round(1) / square(0)
BIT_FILL = 3    # bit 3: hollow(1) / solid/full(0)

# Property characters for display
PROP_CHARS = [
    ('T', 'S'),  # bit 0: Tall / Short
    ('D', 'L'),  # bit 1: Dark / Light
    ('R', 'Q'),  # bit 2: Round / sQuare
    ('H', 'F'),  # bit 3: Hollow / Full (solid)
]


def piece_code(piece_num):
    """Convert a piece number (0-15) to its 4-character code like TDRF."""
    code = ''
    for bit in range(4):
        if piece_num & (1 << bit):
            code += PROP_CHARS[bit][0]
        else:
            code += PROP_CHARS[bit][1]
    return code


def code_to_piece(code):
    """Convert a 4-character code like TDRF to a piece number (0-15).
    Returns None if the code is invalid."""
    code = code.upper().strip()
    if len(code) != 4:
        return None
    num = 0
    for bit in range(4):
        high, low = PROP_CHARS[bit]
        ch = code[bit]
        if ch == high:
            num |= (1 << bit)
        elif ch == low:
            pass  # bit stays 0
        else:
            return None
    return num


def pieces_share_attribute(pieces):
    """Check if all pieces in the list share at least one common attribute.
    Each piece is an int 0-15. Returns True if they share any bit position
    where all are 1 or all are 0."""
    if len(pieces) < 2:
        return False
    for bit in range(4):
        mask = 1 << bit
        vals = [bool(p & mask) for p in pieces]
        if all(vals) or not any(vals):
            return True
    return False


class QuartoGame(BaseGame):
    """Quarto: A game where your opponent picks the piece you must place."""

    name = "Quarto"
    description = "Your opponent picks the piece you must place - get 4 in a row sharing an attribute"
    min_players = 2
    max_players = 2
    variations = {
        "standard": "Standard Quarto (lines only)",
        "advanced": "Advanced Quarto (lines + 2x2 squares count)",
    }

    def __init__(self, variation=None):
        super().__init__(variation or "standard")

    # ------------------------------------------------------------------ setup
    def setup(self):
        """Initialize empty 4x4 board and full piece pool."""
        # Board is 4x4, each cell is None (empty) or a piece number (0-15)
        self.board = [[None] * 4 for _ in range(4)]
        # All 16 pieces available at the start
        self.available = list(range(16))
        # The piece that must be placed this turn (chosen by opponent)
        self.piece_to_place = None
        # True on the very first turn (player just picks a piece, no placement)
        self.first_turn = True

    # --------------------------------------------------------------- display
    def display(self):
        """Display the board, available pieces, and piece to place."""
        var_label = "Standard" if self.variation == "standard" else "Advanced"
        print(f"\n  === Quarto ({var_label}) ===  Turn {self.turn_number + 1}")
        print(f"  {self.players[0]} vs {self.players[1]}")
        print(f"  Current: {self.players[self.current_player - 1]}")
        print()

        # Board header
        print("     1    2    3    4")
        print("  +----+----+----+----+")
        for r in range(4):
            row_str = "  |"
            for c in range(4):
                cell = self.board[r][c]
                if cell is not None:
                    row_str += piece_code(cell)
                else:
                    row_str += "    "
                row_str += "|"
            row_str += f"  {r + 1}"
            print(row_str)
            print("  +----+----+----+----+")

        print()

        # Piece to place
        if self.piece_to_place is not None:
            print(f"  Piece to place: {piece_code(self.piece_to_place)}")
        elif self.first_turn:
            print("  First turn: choose a piece for your opponent.")

        # Available pieces
        if self.available:
            avail_codes = [piece_code(p) for p in self.available]
            # Display in rows of 8
            print(f"  Available: {', '.join(avail_codes[:8])}")
            if len(avail_codes) > 8:
                print(f"             {', '.join(avail_codes[8:])}")
        print()

    # --------------------------------------------------------------- get_move
    def get_move(self):
        """Get move from current player.

        On first turn: player only picks a piece for the opponent.
        On normal turns: player places the chosen piece, then picks a piece for opponent.
        On last piece turn: player only places (no piece to pick).

        Returns a dict with keys:
          'row', 'col' - placement position (None if first turn)
          'chosen_piece' - piece chosen for opponent (None if last piece)
        """
        name = self.players[self.current_player - 1]

        if self.first_turn:
            # First turn: just choose a piece for the opponent
            chosen = self._input_choose_piece(name)
            return {'row': None, 'col': None, 'chosen_piece': chosen}

        # Normal turn: place the piece first
        row, col = self._input_placement(name)

        # After placing, choose a piece for opponent (if any remain)
        # We need to check: after placing, will there be available pieces left?
        # The piece_to_place is being removed from available already,
        # so available list represents what's left to choose from.
        remaining_after = len(self.available)
        # After this placement, if opponent has nothing to choose from (no available),
        # then no need to pick
        if remaining_after == 0:
            return {'row': row, 'col': col, 'chosen_piece': None}

        chosen = self._input_choose_piece(name)
        return {'row': row, 'col': col, 'chosen_piece': chosen}

    def _input_placement(self, name):
        """Ask the player to place the current piece on the board."""
        pc = piece_code(self.piece_to_place)
        while True:
            print(f"  {name}, place piece {pc} on the board.")
            raw = input_with_quit("  Enter position (row col): ").strip()
            try:
                parts = raw.split()
                if len(parts) != 2:
                    print("  Please enter row and column (e.g., '2 3').")
                    continue
                row = int(parts[0]) - 1
                col = int(parts[1]) - 1
                if not (0 <= row < 4 and 0 <= col < 4):
                    print("  Row and column must be 1-4.")
                    continue
                if self.board[row][col] is not None:
                    print("  That position is already occupied.")
                    continue
                return row, col
            except ValueError:
                print("  Invalid input. Enter two numbers (e.g., '2 3').")

    def _input_choose_piece(self, name):
        """Ask the player to choose a piece for the opponent."""
        while True:
            print(f"\n  {name}, choose a piece for your opponent.")
            print(f"  Available: {', '.join(piece_code(p) for p in self.available)}")
            raw = input_with_quit("  Enter piece code (e.g., TLQH) or number (0-15): ").strip().upper()

            # Try as piece code first
            piece_num = code_to_piece(raw)
            if piece_num is not None:
                if piece_num in self.available:
                    return piece_num
                else:
                    print(f"  Piece {piece_code(piece_num)} is not available.")
                    continue

            # Try as number
            try:
                piece_num = int(raw)
                if 0 <= piece_num <= 15:
                    if piece_num in self.available:
                        return piece_num
                    else:
                        print(f"  Piece {piece_code(piece_num)} ({piece_num}) is not available.")
                        continue
                else:
                    print("  Number must be 0-15.")
                    continue
            except ValueError:
                pass

            print("  Invalid input. Enter a 4-letter piece code (e.g., TDRF) or number (0-15).")

    # -------------------------------------------------------------- make_move
    def make_move(self, move):
        """Apply a move to the game state. Returns True if valid."""
        row = move.get('row')
        col = move.get('col')
        chosen_piece = move.get('chosen_piece')

        if self.first_turn:
            # First turn: only choosing a piece
            if chosen_piece is None or chosen_piece not in self.available:
                return False
            self.available.remove(chosen_piece)
            self.piece_to_place = chosen_piece
            self.first_turn = False
            return True

        # Normal turn: place the piece
        if row is None or col is None:
            return False
        if not (0 <= row < 4 and 0 <= col < 4):
            return False
        if self.board[row][col] is not None:
            return False

        self.board[row][col] = self.piece_to_place
        self.piece_to_place = None

        # Choose piece for opponent
        if chosen_piece is not None:
            if chosen_piece not in self.available:
                return False
            self.available.remove(chosen_piece)
            self.piece_to_place = chosen_piece
        else:
            # No pieces left to choose - that's fine on the last move
            self.piece_to_place = None

        return True

    # -------------------------------------------------------- check_game_over
    def check_game_over(self):
        """Check if someone has won or if the board is full (draw)."""
        if self._check_win():
            self.game_over = True
            self.winner = self.current_player
            return

        # Check for draw: board full with no winner
        if all(self.board[r][c] is not None for r in range(4) for c in range(4)):
            self.game_over = True
            self.winner = None
            return

    def _check_win(self):
        """Check if the current player just created a winning line (or square in advanced)."""
        # Check rows
        for r in range(4):
            pieces = [self.board[r][c] for c in range(4)]
            if all(p is not None for p in pieces) and pieces_share_attribute(pieces):
                return True

        # Check columns
        for c in range(4):
            pieces = [self.board[r][c] for r in range(4)]
            if all(p is not None for p in pieces) and pieces_share_attribute(pieces):
                return True

        # Check diagonals
        diag1 = [self.board[i][i] for i in range(4)]
        if all(p is not None for p in diag1) and pieces_share_attribute(diag1):
            return True

        diag2 = [self.board[i][3 - i] for i in range(4)]
        if all(p is not None for p in diag2) and pieces_share_attribute(diag2):
            return True

        # Advanced variation: check 2x2 squares
        if self.variation == "advanced":
            for r in range(3):
                for c in range(3):
                    pieces = [
                        self.board[r][c], self.board[r][c + 1],
                        self.board[r + 1][c], self.board[r + 1][c + 1],
                    ]
                    if all(p is not None for p in pieces) and pieces_share_attribute(pieces):
                        return True

        return False

    # ----------------------------------------------------------- state / save
    def get_state(self):
        """Return serializable game state."""
        return {
            "board": [
                [cell if cell is not None else -1 for cell in row]
                for row in self.board
            ],
            "available": list(self.available),
            "piece_to_place": self.piece_to_place if self.piece_to_place is not None else -1,
            "first_turn": self.first_turn,
        }

    def load_state(self, state):
        """Restore game state from saved data."""
        self.board = [
            [cell if cell != -1 else None for cell in row]
            for row in state["board"]
        ]
        self.available = list(state["available"])
        ptp = state["piece_to_place"]
        self.piece_to_place = ptp if ptp != -1 else None
        self.first_turn = state["first_turn"]

    # -------------------------------------------------------------- tutorial
    def get_tutorial(self):
        """Return tutorial text for Quarto."""
        return """
==============================================================
                      QUARTO  TUTORIAL
==============================================================

OVERVIEW
  Quarto is a two-player strategy game played on a 4x4 board
  with 16 unique pieces. The twist: your opponent chooses which
  piece you must place! Win by creating a line of four pieces
  that share at least one common attribute.

--------------------------------------------------------------
THE PIECES
--------------------------------------------------------------
  Each piece has 4 binary properties:

    Height:  Tall (T) or Short (S)
    Color:   Dark (D) or Light (L)
    Shape:   Round (R) or sQuare (Q)
    Fill:    Hollow (H) or Full/solid (F)

  This gives 16 unique pieces, each shown as a 4-letter code:

    TDRF = Tall, Dark, Round, Full
    SLQH = Short, Light, sQuare, Hollow

  The letter order is always: Height, Color, Shape, Fill.

  All 16 pieces:
    SLQF  TLQF  SDQF  TDQF  SLRF  TLRF  SDRF  TDRF
    SLQH  TLQH  SDQH  TDQH  SLRH  TLRH  SDRH  TDRH

--------------------------------------------------------------
HOW TO PLAY
--------------------------------------------------------------
  The game alternates between two players. Each turn has
  two phases:

  1. PLACE the piece your opponent chose for you onto any
     empty square on the board.

  2. CHOOSE a piece from the remaining pool for your
     opponent to place on their next turn.

  FIRST TURN EXCEPTION: On the very first turn of the game,
  there is no piece to place yet. The first player simply
  chooses a piece for the opponent.

--------------------------------------------------------------
HOW TO ENTER MOVES
--------------------------------------------------------------
  Placing a piece:
    Enter the row and column numbers separated by a space.
    Example: 2 3  (places on row 2, column 3)
    Rows and columns are numbered 1-4.

  Choosing a piece for your opponent:
    Enter the 4-letter piece code (e.g., TLQH) or the piece
    number (0-15).

--------------------------------------------------------------
WINNING
--------------------------------------------------------------
  You win by placing a piece that completes a line of 4 pieces
  (horizontal, vertical, or diagonal) where all 4 pieces share
  AT LEAST ONE common attribute. For example:

    - All 4 are Tall (regardless of other attributes)
    - All 4 are Round (regardless of other attributes)
    - All 4 are Light AND all 4 are Full (two shared attributes)

  A line can share multiple attributes - you only need one.

  ADVANCED VARIATION: In advanced mode, a 2x2 square of pieces
  sharing a common attribute also counts as a win.

  If the board fills up with no winning line, the game is a
  draw.

--------------------------------------------------------------
BOARD DISPLAY
--------------------------------------------------------------
     1    2    3    4
  +----+----+----+----+
  |TDRF|    |SLQF|    |  1
  +----+----+----+----+
  |    |TLRH|    |    |  2
  +----+----+----+----+
  |    |    |SDRH|    |  3
  +----+----+----+----+
  |SDQF|    |    |TLQH|  4
  +----+----+----+----+

  Each cell shows the 4-letter code for the piece placed there,
  or is blank if empty.

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
  - When choosing a piece for your opponent, look for pieces
    that do NOT complete any of their potential lines.

  - Pay attention to ALL four attributes. It's easy to miss
    a shared attribute among seemingly different pieces.

  - Think defensively when picking a piece. The most dangerous
    pieces are the ones that share attributes with pieces
    already forming partial lines on the board.

  - In the early game, try to avoid giving your opponent pieces
    that share attributes with pieces already on the board.

  - In the late game, every piece becomes dangerous. Look for
    forced wins where any piece you give creates a line.

  - The choosing phase is just as important as the placing
    phase. A good Quarto player wins by giving the right
    piece as much as by placing in the right spot.

  - In advanced mode, watch out for 2x2 squares as well as
    lines. This makes the game much harder to defend.
==============================================================
"""
