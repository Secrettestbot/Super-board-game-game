"""Fox and Hounds - Asymmetric chase game on a checkerboard."""

from engine.base import BaseGame, input_with_quit, clear_screen


class FoxHoundsGame(BaseGame):
    """Fox and Hounds.

    An asymmetric game played on the dark squares of an 8x8 checkerboard.
    Player 1 controls the Fox (1 piece, moves diagonally forward and backward).
    Player 2 controls 4 Hounds (move diagonally forward only).
    The Fox wins by reaching the opposite end (row 0).
    The Hounds win by trapping the Fox so it cannot move.
    """

    name = "Fox and Hounds"
    description = "Asymmetric chase game - Fox vs 4 Hounds"
    min_players = 2
    max_players = 2
    variations = {"standard": "Standard 8x8 board, 1 Fox vs 4 Hounds"}

    # Column labels for chess-like notation
    COL_LABELS = "abcdefgh"

    def __init__(self, variation=None):
        super().__init__(variation)

    def setup(self):
        """Initialize the board.

        Hounds start on the dark squares of row 0 (top): b8, d8, f8, h8.
        Fox starts on a dark square of row 7 (bottom): e1.
        We store positions as (row, col) where row 0 = top, row 7 = bottom.
        In chess notation, row 0 = rank 8, row 7 = rank 1.
        """
        # Board: 8x8, 0 = empty, 1 = fox, 2 = hound
        self.board = [[0] * 8 for _ in range(8)]

        # Hounds on row 0 (rank 8), dark squares: cols 1, 3, 5, 7
        self.hounds = [(0, 1), (0, 3), (0, 5), (0, 7)]
        for r, c in self.hounds:
            self.board[r][c] = 2

        # Fox on row 7 (rank 1), a dark square
        self.fox = (7, 4)
        self.board[7][4] = 1

    def _pos_to_chess(self, row, col):
        """Convert (row, col) to chess notation like 'a1'."""
        return f"{self.COL_LABELS[col]}{8 - row}"

    def _chess_to_pos(self, s):
        """Convert chess notation like 'a1' to (row, col). Returns None if invalid."""
        s = s.strip().lower()
        if len(s) != 2:
            return None
        col_ch, rank_ch = s[0], s[1]
        if col_ch not in self.COL_LABELS:
            return None
        try:
            rank = int(rank_ch)
        except ValueError:
            return None
        if rank < 1 or rank > 8:
            return None
        col = self.COL_LABELS.index(col_ch)
        row = 8 - rank
        return (row, col)

    def display(self):
        """Display the checkerboard with F for fox and H for hounds."""
        symbols = {0: '.', 1: 'F', 2: 'H'}

        print(f"\n  Fox and Hounds   Turn {self.turn_number}")
        print(f"  {self.players[0]} (F - Fox) vs {self.players[1]} (H - Hounds)")
        print(f"  Current: {self.players[self.current_player - 1]}"
              f" ({'Fox' if self.current_player == 1 else 'Hounds'})")
        print()
        print("      a   b   c   d   e   f   g   h")
        print("    +---+---+---+---+---+---+---+---+")
        for r in range(8):
            rank = 8 - r
            row_str = f"  {rank} |"
            for c in range(8):
                piece = self.board[r][c]
                if piece != 0:
                    row_str += f" {symbols[piece]} |"
                elif (r + c) % 2 == 1:
                    # Dark square (playable)
                    row_str += "   |"
                else:
                    # Light square (not used)
                    row_str += "   |"
            row_str += f" {rank}"
            print(row_str)
            print("    +---+---+---+---+---+---+---+---+")
        print("      a   b   c   d   e   f   g   h")
        print()

    def _get_fox_moves(self):
        """Get all valid moves for the fox (diagonal in all 4 directions)."""
        r, c = self.fox
        moves = []
        for dr, dc in [(-1, -1), (-1, 1), (1, -1), (1, 1)]:
            nr, nc = r + dr, c + dc
            if 0 <= nr < 8 and 0 <= nc < 8 and self.board[nr][nc] == 0:
                moves.append(((r, c), (nr, nc)))
        return moves

    def _get_hound_moves(self):
        """Get all valid moves for the hounds (diagonal forward only = increasing row)."""
        moves = []
        for r, c in self.hounds:
            # Hounds move forward = increasing row (toward fox's starting side)
            for dc in [-1, 1]:
                nr, nc = r + 1, c + dc
                if 0 <= nr < 8 and 0 <= nc < 8 and self.board[nr][nc] == 0:
                    moves.append(((r, c), (nr, nc)))
        return moves

    def get_move(self):
        """Get move as 'from to' using chess-like notation (e.g. 'e1 d2')."""
        if self.current_player == 1:
            label = "Fox"
        else:
            label = "Hounds"
        prompt = f"  {self.players[self.current_player - 1]} ({label}), enter move (from to): "
        move_str = input_with_quit(prompt)
        parts = move_str.strip().split()
        if len(parts) != 2:
            return None
        frm = self._chess_to_pos(parts[0])
        to = self._chess_to_pos(parts[1])
        if frm is None or to is None:
            return None
        return (frm, to)

    def make_move(self, move):
        """Apply a move. Returns True if valid."""
        if move is None:
            return False
        frm, to = move
        fr, fc = frm
        tr, tc = to

        # Validate the piece belongs to current player
        if self.current_player == 1:
            # Fox
            if (fr, fc) != self.fox:
                return False
            # Fox can move diagonally in any direction
            if abs(tr - fr) != 1 or abs(tc - fc) != 1:
                return False
        else:
            # Hounds
            if (fr, fc) not in self.hounds:
                return False
            # Hounds move diagonally forward only (row increases)
            if tr - fr != 1 or abs(tc - fc) != 1:
                return False

        # Target must be empty and in bounds
        if not (0 <= tr < 8 and 0 <= tc < 8):
            return False
        if self.board[tr][tc] != 0:
            return False

        # Execute the move
        self.board[fr][fc] = 0
        self.board[tr][tc] = self.current_player

        if self.current_player == 1:
            self.fox = (tr, tc)
        else:
            idx = self.hounds.index((fr, fc))
            self.hounds[idx] = (tr, tc)

        return True

    def check_game_over(self):
        """Check if the game is over.

        Fox wins: reaches row 0 (rank 8, the hounds' starting row).
        Hounds win: fox has no legal moves.
        """
        # Fox wins by reaching row 0
        if self.fox[0] == 0:
            self.game_over = True
            self.winner = 1
            return

        # Check if fox can move (if it's about to be fox's turn)
        # After a move, current_player hasn't switched yet.
        # If fox just moved, check if hounds can move next.
        # If hounds just moved, check if fox can move next.
        opponent = 2 if self.current_player == 1 else 1
        if opponent == 1:
            if not self._get_fox_moves():
                self.game_over = True
                self.winner = 2  # Hounds win
        else:
            if not self._get_hound_moves():
                self.game_over = True
                self.winner = 1  # Fox wins (hounds can't move)

    def get_state(self):
        """Return serializable game state."""
        return {
            "fox": list(self.fox),
            "hounds": [list(h) for h in self.hounds],
        }

    def load_state(self, state):
        """Restore game state."""
        self.fox = tuple(state["fox"])
        self.hounds = [tuple(h) for h in state["hounds"]]
        # Rebuild board
        self.board = [[0] * 8 for _ in range(8)]
        self.board[self.fox[0]][self.fox[1]] = 1
        for r, c in self.hounds:
            self.board[r][c] = 2

    def get_tutorial(self):
        return """
==================================================
  FOX AND HOUNDS - Tutorial
==================================================

  OVERVIEW
  --------
  Fox and Hounds is an asymmetric board game
  played on the dark squares of an 8x8 board.
  One player controls the Fox and the other
  controls four Hounds.

  SETUP
  -----
  The 4 Hounds start on the dark squares of
  the top row (rank 8): b8, d8, f8, h8.
  The Fox starts on e1 (bottom of the board).

  PLAYERS
  -------
  Player 1: Fox (F)
    - Can move diagonally in ALL four directions
      (forward and backward), one square at a time.

  Player 2: Hounds (H)
    - Each Hound can move diagonally FORWARD only
      (toward the bottom of the board), one square.
    - On each turn, Player 2 moves exactly one Hound.

  WINNING
  -------
  Fox wins: by reaching the top row (rank 8),
    i.e. getting past all the Hounds.
  Hounds win: by trapping the Fox so it has no
    legal moves available.

  NOTE: Hounds can also lose if none of them
  can move (all blocked), which is rare.

  MOVE INPUT
  ----------
  Enter moves using chess-like notation:
    from to
  Example: "e1 d2" moves the Fox from e1 to d2.
  Columns: a-h (left to right)
  Rows: 1-8 (bottom to top)

  STRATEGY TIPS
  -------------
  Fox: Try to find gaps between the Hounds and
    slip through. Use backward moves to reposition.
  Hounds: Advance together in a line. Don't leave
    gaps the Fox can exploit. Push the Fox into
    a corner.

  COMMANDS
  --------
  Type 'quit' to quit, 'save' to save,
  'help' for help, 'tutorial' for this text.
==================================================
"""
