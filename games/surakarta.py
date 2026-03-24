"""Surakarta - Ancient Javanese board game with circular capture loops."""

from engine.base import BaseGame, input_with_quit, clear_screen


class SurakartaGame(BaseGame):
    """Surakarta.

    An ancient Javanese strategy game played on a 6x6 grid with circular
    loop paths at the corners and edges. Each player starts with 12 pieces
    on their first two rows.

    Pieces move one step in any of 8 directions (like a chess king).
    There are NO normal captures. Captures are performed exclusively by
    traveling along the circular loop paths that arc around the corners
    of the board. A piece must traverse at least one loop arc to capture
    an enemy piece it lands on.

    Win by capturing all opponent pieces or leaving the opponent with no
    legal moves.
    """

    name = "Surakarta"
    description = "Ancient Javanese game with circular capture loops"
    min_players = 2
    max_players = 2
    variations = {"standard": "Standard Surakarta"}

    EMPTY = 0
    P1 = 1
    P2 = 2

    COL_LABELS = "abcdef"

    # The board has two sets of concentric loops (inner and outer).
    # Each loop is a closed path of board positions connected by arcs
    # that curve around corners. We define each loop as an ordered list
    # of (row, col) positions. A capturing piece travels along a loop,
    # must pass through at least one arc (corner curve), and captures
    # the first enemy piece it encounters (if the path is unobstructed
    # by friendly pieces).
    #
    # Outer loops (radius 2 from edges - using rows/cols 0 and 5):
    # Inner loops (radius 1 from edges - using rows/cols 1 and 4):
    #
    # There are 8 loop paths total (4 outer arcs + 4 inner arcs, but
    # actually the loops are full circles). In Surakarta, there are
    # two concentric circular loops on each corner, giving a total of
    # 2 complete loop circuits.
    #
    # We define the loops as ordered sequences of positions.
    # The OUTER loop passes through row/col indices 0 and 5.
    # The INNER loop passes through row/col indices 1 and 4.

    def _build_loops(self):
        """Build the two circular loop paths.

        Each loop is a closed circuit of positions on the board edges,
        with arcs curving around each corner. A piece traveling along
        a loop moves through these positions in order.

        Outer loop: passes through positions on rows 0,5 and cols 0,5
        Inner loop: passes through positions on rows 1,4 and cols 1,4
        """
        # Outer loop (clockwise): top edge -> right arc -> right edge ->
        # bottom arc -> bottom edge -> left arc -> left edge -> top arc
        # Positions along the outer loop (row 0 / col 5 / row 5 / col 0):
        outer = []
        # Top edge, left to right: (0,0) to (0,5)
        for c in range(6):
            outer.append((0, c))
        # Right edge arc then going down: (1,5) to (5,5)
        for r in range(1, 6):
            outer.append((r, 5))
        # Bottom edge, right to left: (5,4) to (5,0)
        for c in range(4, -1, -1):
            outer.append((5, c))
        # Left edge, going up: (4,0) to (1,0)
        for r in range(4, 0, -1):
            outer.append((r, 0))

        # Inner loop (clockwise): same pattern but on rows 1,4 / cols 1,4
        inner = []
        # Top inner edge: (1,1) to (1,4)
        for c in range(1, 5):
            inner.append((1, c))
        # Right inner edge: (2,4) to (4,4)
        for r in range(2, 5):
            inner.append((r, 4))
        # Bottom inner edge: (4,3) to (4,1)
        for c in range(3, 0, -1):
            inner.append((4, c))
        # Left inner edge: (3,1) to (2,1)
        for r in range(3, 1, -1):
            inner.append((r, 1))

        return [outer, inner]

    def _build_arc_positions(self):
        """Identify which positions in each loop are 'arc' corners.

        For the outer loop, the arcs are at the four corners of the board:
        (0,0), (0,5), (5,5), (5,0).
        For the inner loop, the arcs are at:
        (1,1), (1,4), (4,4), (4,1).

        A capture move must pass through at least one arc position.
        """
        outer_arcs = {(0, 0), (0, 5), (5, 5), (5, 0)}
        inner_arcs = {(1, 1), (1, 4), (4, 4), (4, 1)}
        return [outer_arcs, inner_arcs]

    def __init__(self, variation=None):
        super().__init__(variation or "standard")

    def setup(self):
        """Initialize the 6x6 board with 12 pieces per player."""
        self.board = [[self.EMPTY] * 6 for _ in range(6)]

        # Player 1 (X) on rows 0-1 (top two rows)
        for r in range(2):
            for c in range(6):
                self.board[r][c] = self.P1

        # Player 2 (O) on rows 4-5 (bottom two rows)
        for r in range(4, 6):
            for c in range(6):
                self.board[r][c] = self.P2

        self.loops = self._build_loops()
        self.arc_positions = self._build_arc_positions()
        self.pieces_count = {self.P1: 12, self.P2: 12}

    def _pos_to_notation(self, row, col):
        """Convert (row, col) to chess-like notation."""
        return f"{self.COL_LABELS[col]}{6 - row}"

    def _notation_to_pos(self, s):
        """Convert chess-like notation to (row, col). Returns None if invalid."""
        s = s.strip().lower()
        if len(s) < 2:
            return None
        col_ch = s[0]
        rank_str = s[1:]
        if col_ch not in self.COL_LABELS:
            return None
        try:
            rank = int(rank_str)
        except ValueError:
            return None
        if rank < 1 or rank > 6:
            return None
        col = self.COL_LABELS.index(col_ch)
        row = 6 - rank
        return (row, col)

    def display(self):
        """Display the board."""
        symbols = {self.EMPTY: '.', self.P1: 'X', self.P2: 'O'}

        print(f"\n  Surakarta   Turn {self.turn_number}")
        print(f"  {self.players[0]} (X:{self.pieces_count[self.P1]}) vs "
              f"{self.players[1]} (O:{self.pieces_count[self.P2]})")
        print(f"  Current: {self.players[self.current_player - 1]}")
        print()

        # Show loop indicators on corners
        print("  ~~ Outer loop arcs at corners ~~")
        print("  ~  Inner loop arcs at (b5,e5,b2,e2)  ~")
        print()

        # Column labels
        col_header = "      " + "   ".join(self.COL_LABELS[c] for c in range(6))
        print(col_header)
        print("    +" + "---+" * 6)

        for r in range(6):
            rank = 6 - r
            row_str = f"  {rank:>2} |"
            for c in range(6):
                piece = self.board[r][c]
                cell = symbols[piece]
                # Mark loop arc positions
                if piece == self.EMPTY:
                    if (r, c) in self.arc_positions[0]:
                        cell = '@'  # outer arc
                    elif (r, c) in self.arc_positions[1]:
                        cell = 'o'  # inner arc
                row_str += f" {cell} |"
            row_str += f" {rank}"
            print(row_str)
            print("    +" + "---+" * 6)

        print(col_header)
        print()
        print("  Legend: X=P1  O=P2  @=Outer loop arc  o=Inner loop arc")
        print("  Move: 'a1 b2' | Loop capture: 'a1 L b2'")
        print()

    def _find_loop_captures(self, start_r, start_c, player):
        """Find all possible loop captures from a given position.

        A piece travels along a loop path from its position, must pass
        through at least one arc (corner), and can capture the first
        enemy piece encountered if the path is clear of friendly pieces.

        Returns list of (target_r, target_c, loop_index) for valid captures.
        """
        captures = []
        opponent = self.P2 if player == self.P1 else self.P1

        for loop_idx, loop in enumerate(self.loops):
            arcs = self.arc_positions[loop_idx]

            # Check if start position is on this loop
            if (start_r, start_c) not in loop:
                continue

            start_idx = loop.index((start_r, start_c))
            loop_len = len(loop)

            # Travel in both directions along the loop
            for direction in [1, -1]:
                passed_arc = False
                idx = start_idx

                for step in range(1, loop_len):
                    idx = (start_idx + direction * step) % loop_len
                    pos = loop[idx]
                    r, c = pos

                    # Check if we've passed through an arc
                    if pos in arcs:
                        passed_arc = True

                    cell = self.board[r][c]

                    if cell == player:
                        # Blocked by own piece
                        break
                    elif cell == opponent:
                        # Can capture if we passed at least one arc
                        if passed_arc:
                            captures.append((r, c, loop_idx))
                        break
                    # else: empty, continue traveling

        return captures

    def get_move(self):
        """Get move input. Regular: 'a1 b2'. Loop capture: 'a1 L b2'."""
        prompt = (f"  {self.players[self.current_player - 1]}, "
                  f"enter move (from to) or (from L to): ")
        move_str = input_with_quit(prompt)
        parts = move_str.strip().split()

        if len(parts) == 3 and parts[1].upper() == 'L':
            # Loop capture
            frm = self._notation_to_pos(parts[0])
            to = self._notation_to_pos(parts[2])
            if frm is None or to is None:
                return None
            return ('loop', frm, to)
        elif len(parts) == 2:
            # Normal move
            frm = self._notation_to_pos(parts[0])
            to = self._notation_to_pos(parts[1])
            if frm is None or to is None:
                return None
            return ('move', frm, to)
        else:
            return None

    def make_move(self, move):
        """Apply a move. Returns True if valid."""
        if move is None:
            return False

        move_type = move[0]
        player = self.current_player

        if move_type == 'move':
            _, (fr, fc), (tr, tc) = move
            return self._make_normal_move(fr, fc, tr, tc, player)
        elif move_type == 'loop':
            _, (fr, fc), (tr, tc) = move
            return self._make_loop_capture(fr, fc, tr, tc, player)
        return False

    def _make_normal_move(self, fr, fc, tr, tc, player):
        """Make a normal 1-step move (no capture)."""
        # Validate piece belongs to current player
        if self.board[fr][fc] != player:
            return False

        # Must move exactly 1 step in any of 8 directions
        dr = abs(tr - fr)
        dc = abs(tc - fc)
        if dr > 1 or dc > 1 or (dr == 0 and dc == 0):
            return False

        # Target must be empty (no normal captures allowed)
        if self.board[tr][tc] != self.EMPTY:
            return False

        # Bounds check
        if not (0 <= tr < 6 and 0 <= tc < 6):
            return False

        # Execute
        self.board[fr][fc] = self.EMPTY
        self.board[tr][tc] = player
        return True

    def _make_loop_capture(self, fr, fc, tr, tc, player):
        """Make a loop capture move."""
        if self.board[fr][fc] != player:
            return False

        opponent = self.P2 if player == self.P1 else self.P1
        if self.board[tr][tc] != opponent:
            return False

        # Verify this is a valid loop capture
        valid_captures = self._find_loop_captures(fr, fc, player)
        valid = False
        for cr, cc, _ in valid_captures:
            if cr == tr and cc == tc:
                valid = True
                break

        if not valid:
            return False

        # Execute capture
        self.board[fr][fc] = self.EMPTY
        self.board[tr][tc] = player
        self.pieces_count[opponent] -= 1
        return True

    def check_game_over(self):
        """Check if game is over."""
        opponent = self.P2 if self.current_player == self.P1 else self.P1

        # Win by capturing all opponent pieces
        if self.pieces_count[opponent] == 0:
            self.game_over = True
            self.winner = self.current_player
            return

        # Win if opponent has no legal moves
        if not self._has_any_moves(opponent):
            self.game_over = True
            self.winner = self.current_player

    def _has_any_moves(self, player):
        """Check if a player has any legal moves (normal or loop capture)."""
        for r in range(6):
            for c in range(6):
                if self.board[r][c] != player:
                    continue
                # Check normal moves (8 directions)
                for dr in [-1, 0, 1]:
                    for dc in [-1, 0, 1]:
                        if dr == 0 and dc == 0:
                            continue
                        nr, nc = r + dr, c + dc
                        if 0 <= nr < 6 and 0 <= nc < 6:
                            if self.board[nr][nc] == self.EMPTY:
                                return True
                # Check loop captures
                if self._find_loop_captures(r, c, player):
                    return True
        return False

    def get_state(self):
        """Return serializable game state."""
        return {
            "board": [row[:] for row in self.board],
            "pieces_count": {str(k): v for k, v in self.pieces_count.items()},
        }

    def load_state(self, state):
        """Restore game state."""
        self.board = [row[:] for row in state["board"]]
        self.pieces_count = {int(k): v for k, v in state["pieces_count"].items()}
        self.loops = self._build_loops()
        self.arc_positions = self._build_arc_positions()

    def get_tutorial(self):
        return """
==================================================
  SURAKARTA - Tutorial
==================================================

  OVERVIEW
  --------
  Surakarta is an ancient Javanese strategy game
  named after the city of Surakarta (Solo) in
  central Java. It is played on a 6x6 grid with
  unique circular loop paths that enable captures.

  BOARD
  -----
  A 6x6 grid with two concentric circular loops
  that arc around each corner of the board.

  The outer loop connects positions along the
  outermost rows and columns, curving around
  all four corners.

  The inner loop connects positions along the
  second rows and columns, curving around the
  inner corners (b5, e5, e2, b2).

  SETUP
  -----
  Player 1 (X): 12 pieces on rows 5-6 (top).
  Player 2 (O): 12 pieces on rows 1-2 (bottom).
  Each player fills their two closest rows.

  MOVEMENT
  --------
  A piece moves exactly ONE step in any of 8
  directions (horizontally, vertically, or
  diagonally) - like a king in chess.

  Normal moves CANNOT capture. You cannot take
  an enemy piece by moving onto its square.

  CAPTURE (Loop Capture)
  ----------------------
  The only way to capture is via the loop paths.
  A piece enters a loop from its position on
  the loop, travels along the path (passing
  through at least ONE arc/corner curve), and
  captures the first enemy piece it encounters.

  The path must be clear of friendly pieces
  between the capturing piece and its target.

  After capturing, the capturing piece takes
  the position of the captured piece.

  LOOP ARC POSITIONS
  ------------------
  Outer arcs: a6, f6, f1, a1 (board corners)
  Inner arcs: b5, e5, e2, b2

  A piece must pass through at least one arc
  for the capture to be valid.

  MOVE INPUT
  ----------
  Normal move:  "a1 b2"  (from to)
  Loop capture: "a1 L f1" (from L to)

  Use chess-like notation: columns a-f,
  rows 1 (bottom) to 6 (top).

  WINNING
  -------
  You win by either:
  - Capturing all of your opponent's pieces
  - Leaving your opponent with no legal moves

  STRATEGY TIPS
  -------------
  - Position pieces on loop paths to threaten
    captures from unexpected directions.
  - Guard your pieces on loop positions, as
    they can be captured from afar.
  - A piece deep in enemy territory on a loop
    can capture pieces on the far side of the
    board via the circular paths.

  COMMANDS
  --------
  Type 'quit' to quit, 'save' to save,
  'help' for help, 'tutorial' for this text.
==================================================
"""
