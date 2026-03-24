"""Game of the Amazons - Strategic territory board game."""

from engine.base import BaseGame, input_with_quit, clear_screen


class AmazonsGame(BaseGame):
    """Game of the Amazons.

    A two-player strategy game on a 10x10 (or 6x6) board.
    Each player controls amazons that move like chess queens.
    After moving, the amazon shoots an arrow (also queen-like movement)
    that permanently burns the landing square. Neither amazons nor arrows
    can pass through other amazons or burned squares.
    A player who cannot move on their turn loses.

    Player 1 = White (W), Player 2 = Black (B).
    """

    name = "Amazons"
    description = "Strategic territory game with queen-moving amazons and burning arrows"
    min_players = 2
    max_players = 2
    variations = {
        "standard": "Standard (10x10)",
        "small": "Small (6x6, 2 amazons each)",
    }

    EMPTY = 0
    WHITE = 1
    BLACK = 2
    BURNED = 3

    COL_LABELS = "abcdefghij"

    def __init__(self, variation=None):
        super().__init__(variation or "standard")

    def setup(self):
        """Initialize the board based on variation."""
        if self.variation == "small":
            self._setup_small()
        else:
            self._setup_standard()

    def _setup_standard(self):
        """Set up the standard 10x10 board with 4 amazons each."""
        self.size = 10
        self.board = [[self.EMPTY] * self.size for _ in range(self.size)]

        # White amazons (Player 1): a4, d1, g1, j4
        white_positions = [
            (self.size - 4, 0),   # a4
            (self.size - 1, 3),   # d1
            (self.size - 1, 6),   # g1
            (self.size - 4, 9),   # j4
        ]
        # Black amazons (Player 2): a7, d10, g10, j7
        black_positions = [
            (self.size - 7, 0),   # a7
            (self.size - 10, 3),  # d10
            (self.size - 10, 6),  # g10
            (self.size - 7, 9),   # j7
        ]

        for r, c in white_positions:
            self.board[r][c] = self.WHITE
        for r, c in black_positions:
            self.board[r][c] = self.BLACK

    def _setup_small(self):
        """Set up the 6x6 board with 2 amazons each."""
        self.size = 6
        self.board = [[self.EMPTY] * self.size for _ in range(self.size)]

        # White amazons (Player 1): a2, f2
        white_positions = [
            (self.size - 2, 0),   # a2
            (self.size - 2, 5),   # f2
        ]
        # Black amazons (Player 2): a5, f5
        black_positions = [
            (self.size - 5, 0),   # a5
            (self.size - 5, 5),   # f5
        ]

        for r, c in white_positions:
            self.board[r][c] = self.WHITE
        for r, c in black_positions:
            self.board[r][c] = self.BLACK

    def _pos_to_chess(self, row, col):
        """Convert (row, col) to chess-like notation."""
        return f"{self.COL_LABELS[col]}{self.size - row}"

    def _chess_to_pos(self, s):
        """Convert chess-like notation to (row, col). Returns None if invalid."""
        s = s.strip().lower()
        if len(s) < 2:
            return None
        col_ch = s[0]
        rank_str = s[1:]
        if col_ch not in self.COL_LABELS[:self.size]:
            return None
        try:
            rank = int(rank_str)
        except ValueError:
            return None
        if rank < 1 or rank > self.size:
            return None
        col = self.COL_LABELS.index(col_ch)
        row = self.size - rank
        return (row, col)

    def _is_valid_queen_path(self, from_r, from_c, to_r, to_c, ignore_pos=None):
        """Check if a queen-style move from (from_r, from_c) to (to_r, to_c) is valid.

        The path must be a straight line (horizontal, vertical, or diagonal),
        and all intermediate squares must be empty (not amazons or burned).
        ignore_pos can be set to a position to treat as empty (used for arrow shooting
        where the amazon's original position is now vacated).
        """
        dr = to_r - from_r
        dc = to_c - from_c

        if dr == 0 and dc == 0:
            return False
        if dr != 0 and dc != 0 and abs(dr) != abs(dc):
            return False

        step_r = 0 if dr == 0 else (1 if dr > 0 else -1)
        step_c = 0 if dc == 0 else (1 if dc > 0 else -1)

        cr, cc = from_r + step_r, from_c + step_c
        while (cr, cc) != (to_r, to_c):
            if not (0 <= cr < self.size and 0 <= cc < self.size):
                return False
            if ignore_pos and (cr, cc) == ignore_pos:
                pass
            elif self.board[cr][cc] != self.EMPTY:
                return False
            cr += step_r
            cc += step_c

        if ignore_pos and (to_r, to_c) == ignore_pos:
            return True
        return self.board[to_r][to_c] == self.EMPTY

    def _get_amazon_positions(self, player):
        """Return list of (row, col) for all amazons of the given player."""
        piece = self.WHITE if player == 1 else self.BLACK
        positions = []
        for r in range(self.size):
            for c in range(self.size):
                if self.board[r][c] == piece:
                    positions.append((r, c))
        return positions

    def _get_queen_moves(self, from_r, from_c, ignore_pos=None):
        """Return all valid queen-style destinations from a position."""
        moves = []
        for step_r, step_c in [(-1, 0), (1, 0), (0, -1), (0, 1),
                                (-1, -1), (-1, 1), (1, -1), (1, 1)]:
            cr, cc = from_r + step_r, from_c + step_c
            while 0 <= cr < self.size and 0 <= cc < self.size:
                cell = self.board[cr][cc]
                if ignore_pos and (cr, cc) == ignore_pos:
                    moves.append((cr, cc))
                elif cell == self.EMPTY:
                    moves.append((cr, cc))
                else:
                    break
                cr += step_r
                cc += step_c
        return moves

    def _has_any_moves(self, player):
        """Check if the given player can make any move."""
        piece = self.WHITE if player == 1 else self.BLACK
        for r in range(self.size):
            for c in range(self.size):
                if self.board[r][c] == piece:
                    amazon_moves = self._get_queen_moves(r, c)
                    if amazon_moves:
                        for mr, mc in amazon_moves:
                            arrow_targets = self._get_queen_moves(mr, mc, ignore_pos=(r, c))
                            if arrow_targets:
                                return True
        return False

    def display(self):
        """Display the board."""
        symbols = {
            self.EMPTY: '\u00b7',
            self.WHITE: 'W',
            self.BLACK: 'B',
            self.BURNED: 'X',
        }

        white_count = sum(1 for r in range(self.size) for c in range(self.size)
                          if self.board[r][c] == self.WHITE)
        black_count = sum(1 for r in range(self.size) for c in range(self.size)
                          if self.board[r][c] == self.BLACK)

        print(f"\n  Amazons ({self.variation})   Turn {self.turn_number}")
        print(f"  {self.players[0]} (W - White: {white_count}) vs "
              f"{self.players[1]} (B - Black: {black_count})")
        print(f"  Current: {self.players[self.current_player - 1]}"
              f" ({'White' if self.current_player == 1 else 'Black'})")
        print()

        col_header = "      " + "   ".join(
            self.COL_LABELS[c] for c in range(self.size))
        print(col_header)
        print("    +" + "---+" * self.size)

        for r in range(self.size):
            rank = self.size - r
            row_str = f"  {rank:>2} |"
            for c in range(self.size):
                cell = symbols[self.board[r][c]]
                row_str += f" {cell} |"
            row_str += f" {rank:>2}"
            print(row_str)
            print("    +" + "---+" * self.size)

        print(col_header)
        print()
        print(f"  Legend: W=White amazon  B=Black amazon  X=Burned  \u00b7=Empty")
        print()

    def get_move(self):
        """Get move as 'from to arrow_target' using chess-like notation."""
        if self.current_player == 1:
            label = "White"
        else:
            label = "Black"
        prompt = (f"  {self.players[self.current_player - 1]} ({label}), "
                  f"enter move (from to arrow): ")
        move_str = input_with_quit(prompt)
        parts = move_str.strip().split()
        if len(parts) != 3:
            return None
        frm = self._chess_to_pos(parts[0])
        to = self._chess_to_pos(parts[1])
        arrow = self._chess_to_pos(parts[2])
        if frm is None or to is None or arrow is None:
            return None
        return (frm, to, arrow)

    def make_move(self, move):
        """Apply a move: move amazon from 'frm' to 'to', then shoot arrow at 'arrow'.

        Returns True if valid.
        """
        if move is None:
            return False

        frm, to, arrow = move
        fr, fc = frm
        tr, tc = to
        ar, ac = arrow

        piece = self.board[fr][fc]

        # Validate piece belongs to current player
        expected = self.WHITE if self.current_player == 1 else self.BLACK
        if piece != expected:
            return False

        # Validate amazon move (queen-style path)
        if not self._is_valid_queen_path(fr, fc, tr, tc):
            return False

        # Move the amazon
        self.board[fr][fc] = self.EMPTY
        self.board[tr][tc] = piece

        # Validate arrow shot from new position
        if not self._is_valid_queen_path(tr, tc, ar, ac):
            # Undo the amazon move
            self.board[tr][tc] = self.EMPTY
            self.board[fr][fc] = piece
            return False

        # Burn the arrow target
        self.board[ar][ac] = self.BURNED

        return True

    def check_game_over(self):
        """Check if the game is over. A player loses if they cannot move."""
        opponent = 2 if self.current_player == 1 else 1
        if not self._has_any_moves(opponent):
            self.game_over = True
            self.winner = self.current_player

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
        return """
==================================================
  GAME OF THE AMAZONS - Tutorial
==================================================

  OVERVIEW
  --------
  The Game of the Amazons is a two-player
  territory strategy game played on a 10x10 board
  (or 6x6 in the small variant). Each player
  controls amazons that move like chess queens.
  After each move, the amazon shoots a flaming
  arrow that permanently blocks a square.

  VARIATIONS
  ----------
  Standard: 10x10 board, 4 amazons per player.
  Small: 6x6 board, 2 amazons per player.

  PLAYERS
  -------
  Player 1: White (W)
    Standard start: a4, d1, g1, j4
  Player 2: Black (B)
    Standard start: a7, d10, g10, j7

  BOARD SYMBOLS
  -------------
  W = White amazon
  B = Black amazon
  X = Burned square (permanently blocked)
  . = Empty square

  HOW A TURN WORKS
  ----------------
  Each turn has two parts:

  1. MOVE an amazon: Choose one of your amazons
     and move it like a chess queen (any number of
     squares horizontally, vertically, or
     diagonally). It cannot jump over or land on
     other amazons or burned squares.

  2. SHOOT an arrow: From the amazon's NEW
     position, shoot an arrow in any queen-like
     direction. The arrow travels in a straight
     line and burns the square where it lands.
     The arrow also cannot pass through amazons
     or burned squares.

  MOVE INPUT
  ----------
  Enter your move as three positions separated
  by spaces:

    from to arrow

  Example: "a4 a8 a6"
    - Moves the amazon from a4 to a8
    - Then shoots an arrow from a8 to a6

  Columns: a-j (standard) or a-f (small).
  Rows: 1 = bottom, 10 (or 6) = top.

  WINNING
  -------
  A player who cannot move any of their amazons
  on their turn loses. As the board fills with
  burned squares, territory shrinks until one
  player is trapped.

  STRATEGY TIPS
  -------------
  - Think of the board as territory. Try to
    claim more space for your amazons.
  - Use arrows to wall off your opponent and
    restrict their movement.
  - Keep your amazons mobile with room to move.
  - Isolate opponent amazons into small regions.
  - The arrow shot is just as important as the
    amazon move. Plan both carefully.

  COMMANDS
  --------
  Type 'quit' to quit, 'save' to save,
  'help' for help, 'tutorial' for this text.
==================================================
"""
