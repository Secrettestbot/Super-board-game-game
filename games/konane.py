"""Konane - Hawaiian checkers board game."""

from engine.base import BaseGame, input_with_quit, clear_screen


class KonaneGame(BaseGame):
    """Konane (Hawaiian Checkers).

    The board starts completely full with alternating black and white pieces
    (like a checkerboard). The first two moves remove one piece each
    (from center or corner positions). After that, players jump orthogonally
    (not diagonally) over single opponent pieces to capture them.
    Multi-jumps are allowed but must continue in the same direction.
    A player who cannot make a jump on their turn loses.

    Player 1 = Black (goes first, removes first piece).
    Player 2 = White (removes second piece, then normal play).
    """

    name = "Konane"
    description = "Hawaiian checkers with orthogonal jumping captures"
    min_players = 2
    max_players = 2
    variations = {
        "6x6": "6x6 Board",
        "8x8": "8x8 Board (Standard)",
    }

    EMPTY = 0
    BLACK = 1
    WHITE = 2

    COL_LABELS = "abcdefgh"

    def __init__(self, variation=None):
        super().__init__(variation or "8x8")

    def setup(self):
        """Initialize the board completely full with alternating pieces."""
        if self.variation == "6x6":
            self.size = 6
        else:
            self.size = 8

        self.board = [[self.EMPTY] * self.size for _ in range(self.size)]
        self.phase = "remove"  # "remove" for first 2 moves, then "play"
        self.removals_done = 0

        # Fill the board with alternating black and white pieces
        # Convention: (0,0) = top-left = Black
        for r in range(self.size):
            for c in range(self.size):
                if (r + c) % 2 == 0:
                    self.board[r][c] = self.BLACK
                else:
                    self.board[r][c] = self.WHITE

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

    def _get_valid_removal_positions(self):
        """Return list of valid positions for piece removal in the opening phase."""
        positions = []
        mid = self.size // 2

        if self.removals_done == 0:
            # Player 1 (Black) removes a black piece from center or corner
            # Center positions (the 4 center squares)
            center_positions = [
                (mid - 1, mid - 1), (mid - 1, mid),
                (mid, mid - 1), (mid, mid),
            ]
            # Corner positions
            corner_positions = [
                (0, 0), (0, self.size - 1),
                (self.size - 1, 0), (self.size - 1, self.size - 1),
            ]
            for r, c in center_positions + corner_positions:
                if self.board[r][c] == self.BLACK:
                    positions.append((r, c))
        else:
            # Player 2 (White) removes a white piece adjacent to the first removal
            # Find the empty square (first removal)
            empty_pos = None
            for r in range(self.size):
                for c in range(self.size):
                    if self.board[r][c] == self.EMPTY:
                        empty_pos = (r, c)
                        break
                if empty_pos:
                    break

            if empty_pos:
                er, ec = empty_pos
                for dr, dc in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
                    nr, nc = er + dr, ec + dc
                    if (0 <= nr < self.size and 0 <= nc < self.size
                            and self.board[nr][nc] == self.WHITE):
                        positions.append((nr, nc))

        return positions

    def _get_all_jumps(self, player):
        """Return dict {(from_r, from_c): [(to_r, to_c), ...]} of all valid jumps.

        Each jump may be a single jump or a multi-jump (must be in same direction).
        Multi-jumps land 4, 6, etc. squares away from the start.
        """
        piece = self.BLACK if player == 1 else self.WHITE
        opponent = self.WHITE if player == 1 else self.BLACK
        all_jumps = {}

        for r in range(self.size):
            for c in range(self.size):
                if self.board[r][c] != piece:
                    continue

                # Try each orthogonal direction
                for dr, dc in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
                    destinations = self._get_jump_destinations(r, c, dr, dc, opponent)
                    if destinations:
                        if (r, c) not in all_jumps:
                            all_jumps[(r, c)] = []
                        all_jumps[(r, c)].extend(destinations)

        return all_jumps

    def _get_jump_destinations(self, r, c, dr, dc, opponent):
        """Get all valid jump destinations from (r,c) in direction (dr,dc).

        Returns list of (dest_r, dest_c) for single and multi-jumps.
        Multi-jumps must continue in the same direction.
        """
        destinations = []
        cr, cc = r, c

        while True:
            # Next square must have an opponent piece
            mr, mc = cr + dr, cc + dc
            if not (0 <= mr < self.size and 0 <= mc < self.size):
                break
            if self.board[mr][mc] != opponent:
                break

            # Landing square must be empty
            lr, lc = mr + dr, mc + dc
            if not (0 <= lr < self.size and 0 <= lc < self.size):
                break
            if self.board[lr][lc] != self.EMPTY:
                break

            destinations.append((lr, lc))
            cr, cc = lr, lc

        return destinations

    def _validate_jump(self, from_r, from_c, to_r, to_c, player):
        """Validate a jump move and return the list of captured positions, or None if invalid."""
        piece = self.BLACK if player == 1 else self.WHITE
        opponent = self.WHITE if player == 1 else self.BLACK

        if self.board[from_r][from_c] != piece:
            return None

        # Determine direction
        dr = to_r - from_r
        dc = to_c - from_c

        # Must be orthogonal
        if dr != 0 and dc != 0:
            return None
        if dr == 0 and dc == 0:
            return None

        # Must jump an even number of squares (2 per jump)
        distance = abs(dr) + abs(dc)
        if distance < 2 or distance % 2 != 0:
            return None

        # Normalize direction
        step_r = 0 if dr == 0 else (1 if dr > 0 else -1)
        step_c = 0 if dc == 0 else (1 if dc > 0 else -1)

        # Verify each jump in the chain
        captured = []
        cr, cc = from_r, from_c
        num_jumps = distance // 2

        for _ in range(num_jumps):
            # Middle square must have opponent piece
            mr, mc = cr + step_r, cc + step_c
            if not (0 <= mr < self.size and 0 <= mc < self.size):
                return None
            if self.board[mr][mc] != opponent:
                return None

            # Landing square must be empty (or the starting position for multi-jumps)
            lr, lc = mr + step_r, mc + step_c
            if not (0 <= lr < self.size and 0 <= lc < self.size):
                return None
            if self.board[lr][lc] != self.EMPTY and (lr, lc) != (from_r, from_c):
                return None

            captured.append((mr, mc))
            cr, cc = lr, lc

        return captured

    def _count_pieces(self):
        """Count pieces on the board."""
        black = 0
        white = 0
        for r in range(self.size):
            for c in range(self.size):
                if self.board[r][c] == self.BLACK:
                    black += 1
                elif self.board[r][c] == self.WHITE:
                    white += 1
        return black, white

    def display(self):
        """Display the board."""
        black_count, white_count = self._count_pieces()

        print(f"\n  Konane ({self.variation})   Turn {self.turn_number}")
        print(f"  {self.players[0]} (\u25cf - Black: {black_count}) vs "
              f"{self.players[1]} (\u25cb - White: {white_count})")
        print(f"  Current: {self.players[self.current_player - 1]}"
              f" ({'Black' if self.current_player == 1 else 'White'})")

        if self.phase == "remove":
            if self.removals_done == 0:
                print("  Phase: Remove a black piece (center or corner)")
            else:
                print("  Phase: Remove a white piece (adjacent to removed)")
        else:
            print("  Phase: Jump over opponent pieces")
        print()

        # Column labels
        col_header = "      " + "   ".join(
            self.COL_LABELS[c] for c in range(self.size))
        print(col_header)
        print("    +" + "---+" * self.size)

        for r in range(self.size):
            rank = self.size - r
            row_str = f"  {rank:>2} |"
            for c in range(self.size):
                cell = self.board[r][c]
                if cell == self.BLACK:
                    sym = '\u25cf'  # ●
                elif cell == self.WHITE:
                    sym = '\u25cb'  # ○
                else:
                    sym = '\u00b7'  # ·
                row_str += f" {sym} |"
            row_str += f" {rank:>2}"
            print(row_str)
            print("    +" + "---+" * self.size)

        print(col_header)
        print()
        print(f"  Legend: \u25cf=Black  \u25cb=White  \u00b7=Empty")
        print()

    def get_move(self):
        """Get a move from the current player."""
        if self.current_player == 1:
            label = "Black"
        else:
            label = "White"

        if self.phase == "remove":
            valid = self._get_valid_removal_positions()
            valid_strs = [self._pos_to_chess(r, c) for r, c in valid]
            print(f"  Valid removal positions: {', '.join(valid_strs)}")
            prompt = (f"  {self.players[self.current_player - 1]} ({label}), "
                      f"pick a piece to remove: ")
            move_str = input_with_quit(prompt)
            pos = self._chess_to_pos(move_str.strip())
            if pos is None:
                return None
            return ("remove", pos)
        else:
            prompt = (f"  {self.players[self.current_player - 1]} ({label}), "
                      f"enter jump (from to): ")
            move_str = input_with_quit(prompt)
            parts = move_str.strip().split()
            if len(parts) != 2:
                return None
            frm = self._chess_to_pos(parts[0])
            to = self._chess_to_pos(parts[1])
            if frm is None or to is None:
                return None
            return ("jump", frm, to)

    def make_move(self, move):
        """Apply a move. Returns True if valid."""
        if move is None:
            return False

        if move[0] == "remove":
            _, pos = move
            r, c = pos
            valid = self._get_valid_removal_positions()
            if (r, c) not in valid:
                return False
            self.board[r][c] = self.EMPTY
            self.removals_done += 1
            if self.removals_done >= 2:
                self.phase = "play"
            return True

        if move[0] == "jump":
            _, frm, to = move
            fr, fc = frm
            tr, tc = to

            captured = self._validate_jump(fr, fc, tr, tc, self.current_player)
            if captured is None:
                return False

            # Execute the jump
            piece = self.board[fr][fc]
            self.board[fr][fc] = self.EMPTY
            self.board[tr][tc] = piece

            # Remove captured pieces
            for cr, cc in captured:
                self.board[cr][cc] = self.EMPTY

            return True

        return False

    def check_game_over(self):
        """Check if the game is over. A player loses if they cannot jump."""
        if self.phase == "remove":
            return

        opponent = 2 if self.current_player == 1 else 1
        jumps = self._get_all_jumps(opponent)
        if not jumps:
            self.game_over = True
            self.winner = self.current_player

    def get_state(self):
        """Return serializable game state."""
        return {
            "size": self.size,
            "board": [row[:] for row in self.board],
            "phase": self.phase,
            "removals_done": self.removals_done,
        }

    def load_state(self, state):
        """Restore game state."""
        self.size = state["size"]
        self.board = [row[:] for row in state["board"]]
        self.phase = state["phase"]
        self.removals_done = state["removals_done"]

    def get_tutorial(self):
        return """
==================================================
  KONANE (Hawaiian Checkers) - Tutorial
==================================================

  OVERVIEW
  --------
  Konane is an ancient Hawaiian strategy game
  sometimes called "Hawaiian Checkers." The board
  starts completely filled with alternating black
  and white pieces. Players take turns jumping
  over opponent pieces to capture them.

  VARIATIONS
  ----------
  6x6: Smaller board for quicker games.
  8x8: Standard board size.

  PLAYERS
  -------
  Player 1: Black (solid circles, goes first)
  Player 2: White (open circles)

  BOARD SYMBOLS
  -------------
  Black pieces shown as filled circles.
  White pieces shown as open circles.
  Empty squares shown as dots.

  SETUP PHASE (First Two Moves)
  -----------------------------
  The board starts completely filled.

  Move 1: Player 1 (Black) removes one of their
    own black pieces from either the center of
    the board or a corner square.

  Move 2: Player 2 (White) removes one of their
    own white pieces that is adjacent (orthogonally)
    to the piece just removed.

  This creates two adjacent empty spaces that
  allow jumping to begin.

  JUMPING (Main Phase)
  --------------------
  After the two removal moves, players take turns
  jumping over opponent pieces:

  - Jumps are ORTHOGONAL only (horizontal or
    vertical -- never diagonal).
  - You jump over exactly one adjacent opponent
    piece, landing on the empty square beyond it.
  - The jumped piece is captured and removed.

  MULTI-JUMPS
  -----------
  After making a jump, if the same piece can
  continue jumping in THE SAME DIRECTION, it
  may do so. Multi-jumps must all be in the
  same direction.

  Enter multi-jumps by specifying the final
  destination: "a1 a5" jumps over two pieces
  in the same direction.

  MOVE INPUT
  ----------
  Removal phase:
    Enter the position of the piece to remove.
    Example: "d4"

  Jump phase:
    Enter start and end positions separated by
    a space.
    Example: "a1 a3" (single jump)
    Example: "a1 a5" (double jump, same direction)

  Columns: a-f (6x6) or a-h (8x8).
  Rows: 1 = bottom, up to 6 or 8.

  WINNING
  -------
  A player who cannot make any jump on their
  turn loses. Strategy involves creating
  situations where your opponent runs out of
  valid jumps before you do.

  STRATEGY TIPS
  -------------
  - Early removals shape the whole game. Think
    carefully about which piece to remove.
  - Try to maintain mobility across the board.
  - Create isolated opponent pieces that cannot
    be jumped over.
  - Think ahead -- removing a piece now may open
    opportunities for your opponent.
  - Control regions of the board by creating
    patterns your opponent cannot break through.

  COMMANDS
  --------
  Type 'quit' to quit, 'save' to save,
  'help' for help, 'tutorial' for this text.
==================================================
"""
