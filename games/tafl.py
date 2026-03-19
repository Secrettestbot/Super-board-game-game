"""Hnefatafl family - Viking strategy board games."""

from engine.base import BaseGame, input_with_quit, clear_screen


class TaflGame(BaseGame):
    """Hnefatafl family of Viking board games.

    Asymmetric strategy games where one side (defenders) protects a King
    who must escape to a corner, while the other side (attackers) tries
    to capture the King by surrounding it.

    All pieces move like rooks (any distance in a straight line).
    Capture is custodial (sandwiching an enemy between two of your pieces).
    The King is captured when surrounded on all 4 sides (or 3 sides + edge).
    Corner squares and the throne are hostile (count as enemy for capture).

    Player 1 = Attackers (move first), Player 2 = Defenders (with King).

    Variations:
      Hnefatafl: 11x11, King + 12 defenders vs 24 attackers.
      Tawlbwrdd: 11x11, King + 12 defenders vs 24 attackers (different layout).
    """

    name = "Tafl"
    description = "Viking Hnefatafl family board games with asymmetric sides"
    min_players = 2
    max_players = 2
    variations = {
        "hnefatafl": "Hnefatafl (11x11)",
        "tawlbwrdd": "Tawlbwrdd (11x11, different setup)",
    }

    # Piece constants
    EMPTY = 0
    ATTACKER = 1
    DEFENDER = 2
    KING = 3

    COL_LABELS = "abcdefghijk"

    def __init__(self, variation=None):
        super().__init__(variation or "hnefatafl")

    def setup(self):
        """Initialize the board based on variation."""
        if self.variation == "tawlbwrdd":
            self._setup_tawlbwrdd()
        else:
            self._setup_hnefatafl()

    def _setup_hnefatafl(self):
        """Set up the 11x11 Hnefatafl board.

        King + 12 defenders in cross pattern at center.
        24 attackers arranged at the four edges.
        """
        self.size = 11
        self.board = [[self.EMPTY] * self.size for _ in range(self.size)]
        self.center = (5, 5)
        self.corners = [(0, 0), (0, 10), (10, 0), (10, 10)]

        # King at center
        self.board[5][5] = self.KING
        self.king_pos = (5, 5)

        # 12 Defenders in cross pattern around king
        defender_positions = [
            (3, 5), (4, 4), (4, 5), (4, 6),
            (5, 3), (5, 4), (5, 6), (5, 7),
            (6, 4), (6, 5), (6, 6), (7, 5),
        ]
        for r, c in defender_positions:
            self.board[r][c] = self.DEFENDER

        # 24 Attackers at edges
        attacker_positions = [
            # Top edge
            (0, 3), (0, 4), (0, 5), (0, 6), (0, 7), (1, 5),
            # Bottom edge
            (10, 3), (10, 4), (10, 5), (10, 6), (10, 7), (9, 5),
            # Left edge
            (3, 0), (4, 0), (5, 0), (6, 0), (7, 0), (5, 1),
            # Right edge
            (3, 10), (4, 10), (5, 10), (6, 10), (7, 10), (5, 9),
        ]
        for r, c in attacker_positions:
            self.board[r][c] = self.ATTACKER

    def _setup_tawlbwrdd(self):
        """Set up the 11x11 Tawlbwrdd board.

        Same board size as Hnefatafl but with a different starting layout.
        King + 12 defenders vs 24 attackers.
        """
        self.size = 11
        self.board = [[self.EMPTY] * self.size for _ in range(self.size)]
        self.center = (5, 5)
        self.corners = [(0, 0), (0, 10), (10, 0), (10, 10)]

        # King at center
        self.board[5][5] = self.KING
        self.king_pos = (5, 5)

        # 12 Defenders - diamond/cross pattern
        defender_positions = [
            (4, 4), (4, 5), (4, 6),
            (5, 3), (5, 4), (5, 6), (5, 7),
            (6, 4), (6, 5), (6, 6),
            (3, 5), (7, 5),
        ]
        for r, c in defender_positions:
            self.board[r][c] = self.DEFENDER

        # 24 Attackers - distributed along edges, offset from Hnefatafl
        attacker_positions = [
            # Top side
            (0, 4), (0, 5), (0, 6), (1, 4), (1, 5), (1, 6),
            # Bottom side
            (10, 4), (10, 5), (10, 6), (9, 4), (9, 5), (9, 6),
            # Left side
            (4, 0), (5, 0), (6, 0), (4, 1), (5, 1), (6, 1),
            # Right side
            (4, 10), (5, 10), (6, 10), (4, 9), (5, 9), (6, 9),
        ]
        for r, c in attacker_positions:
            self.board[r][c] = self.ATTACKER

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

    def _count_pieces(self):
        """Count pieces on the board."""
        attackers = 0
        defenders = 0
        for r in range(self.size):
            for c in range(self.size):
                if self.board[r][c] == self.ATTACKER:
                    attackers += 1
                elif self.board[r][c] == self.DEFENDER:
                    defenders += 1
                elif self.board[r][c] == self.KING:
                    defenders += 1
        return attackers, defenders

    def display(self):
        """Display the board."""
        symbols = {
            self.EMPTY: '.',
            self.ATTACKER: 'A',
            self.DEFENDER: 'D',
            self.KING: 'K',
        }
        attackers, defenders = self._count_pieces()

        var_label = self.variation.capitalize()
        print(f"\n  Tafl ({var_label})   Turn {self.turn_number}")
        print(f"  {self.players[0]} (A - Attackers: {attackers}) vs "
              f"{self.players[1]} (D/K - Defenders: {defenders})")
        print(f"  Current: {self.players[self.current_player - 1]}"
              f" ({'Attackers' if self.current_player == 1 else 'Defenders'})")
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
                piece = self.board[r][c]
                cell = symbols[piece]
                # Mark special squares when empty
                if piece == self.EMPTY:
                    if (r, c) == self.center:
                        cell = '*'  # throne
                    elif (r, c) in self.corners:
                        cell = '#'  # corner
                row_str += f" {cell} |"
            row_str += f" {rank:>2}"
            print(row_str)
            print("    +" + "---+" * self.size)

        print(col_header)
        print()
        print(f"  Legend: A=Attacker  D=Defender  K=King  *=Throne  #=Corner")
        print()

    def _is_hostile(self, row, col, for_piece):
        """Check if a square is hostile to the given piece type.

        For attackers: defenders and king are hostile.
        For defenders/king: attackers are hostile.
        The throne (center) and corners are hostile to all when empty.
        """
        if not (0 <= row < self.size and 0 <= col < self.size):
            return False

        cell = self.board[row][col]

        if for_piece == self.ATTACKER:
            if cell == self.DEFENDER or cell == self.KING:
                return True
        else:
            # Hostile to defenders/king: attackers
            if cell == self.ATTACKER:
                return True

        # Empty throne and corners are hostile to everyone
        if cell == self.EMPTY:
            if (row, col) == self.center or (row, col) in self.corners:
                return True

        return False

    def _check_captures_after_move(self, row, col):
        """Check and perform custodial captures around the piece that just moved."""
        mover = self.board[row][col]
        captured = []

        for dr, dc in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
            nr, nc = row + dr, col + dc
            if not (0 <= nr < self.size and 0 <= nc < self.size):
                continue

            neighbor = self.board[nr][nc]
            if neighbor == self.EMPTY:
                continue

            # Can't capture your own pieces
            if mover == self.ATTACKER and neighbor == self.ATTACKER:
                continue
            if mover in (self.DEFENDER, self.KING) and neighbor in (self.DEFENDER, self.KING):
                continue

            # Check if the neighbor is the king (special capture rules)
            if neighbor == self.KING:
                if self._is_king_captured(nr, nc):
                    captured.append((nr, nc))
                continue

            # Regular custodial capture: check if piece on the other side is hostile
            far_r, far_c = nr + dr, nc + dc
            if self._is_hostile(far_r, far_c, neighbor):
                captured.append((nr, nc))

        # Remove captured pieces
        for cr, cc in captured:
            if self.board[cr][cc] == self.KING:
                self.king_pos = None
            self.board[cr][cc] = self.EMPTY

        return captured

    def _is_king_captured(self, kr, kc):
        """Check if the king at (kr, kc) is captured.

        King is captured when surrounded on all 4 orthogonal sides by
        attackers, the edge of the board, or hostile empty squares
        (throne/corners).
        """
        hostile_count = 0

        for dr, dc in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
            nr, nc = kr + dr, kc + dc
            if not (0 <= nr < self.size and 0 <= nc < self.size):
                # Edge of board counts as hostile for king capture
                hostile_count += 1
                continue
            cell = self.board[nr][nc]
            if cell == self.ATTACKER:
                hostile_count += 1
            elif cell == self.EMPTY and ((nr, nc) == self.center or (nr, nc) in self.corners):
                # Empty throne/corner is hostile
                hostile_count += 1

        return hostile_count == 4

    def get_move(self):
        """Get move as 'from to' using chess-like notation."""
        if self.current_player == 1:
            label = "Attackers"
        else:
            label = "Defenders"
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
        """Apply a move. Pieces move like rooks. Returns True if valid."""
        if move is None:
            return False
        frm, to = move
        fr, fc = frm
        tr, tc = to

        piece = self.board[fr][fc]

        # Validate piece belongs to current player
        if self.current_player == 1:
            if piece != self.ATTACKER:
                return False
        else:
            if piece not in (self.DEFENDER, self.KING):
                return False

        # Must move in a straight line (rook-like)
        if fr != tr and fc != tc:
            return False
        if fr == tr and fc == tc:
            return False

        # Target must be empty
        if self.board[tr][tc] != self.EMPTY:
            return False

        # Only the king can land on corners
        if (tr, tc) in self.corners and piece != self.KING:
            return False

        # Only the king can stop on the throne
        if (tr, tc) == self.center and piece != self.KING:
            return False

        # Path must be clear
        if fr == tr:
            step = 1 if tc > fc else -1
            for c in range(fc + step, tc, step):
                if self.board[fr][c] != self.EMPTY:
                    return False
        else:
            step = 1 if tr > fr else -1
            for r in range(fr + step, tr, step):
                if self.board[r][fc] != self.EMPTY:
                    return False

        # Non-king pieces cannot pass through the throne when empty
        if piece != self.KING:
            cr, cc = self.center
            if fr == tr == cr and min(fc, tc) < cc < max(fc, tc):
                # Check if throne is in the path
                if self.board[cr][cc] == self.EMPTY:
                    return False
            if fc == tc == cc and min(fr, tr) < cr < max(fr, tr):
                if self.board[cr][cc] == self.EMPTY:
                    return False

        # Execute the move
        self.board[fr][fc] = self.EMPTY
        self.board[tr][tc] = piece
        if piece == self.KING:
            self.king_pos = (tr, tc)

        # Check for captures
        self._check_captures_after_move(tr, tc)

        return True

    def check_game_over(self):
        """Check if game is over.

        King reaches a corner: Defenders (player 2) win.
        King is captured: Attackers (player 1) win.
        A player has no legal moves: they lose.
        """
        # King captured
        if self.king_pos is None:
            self.game_over = True
            self.winner = 1  # Attackers win
            return

        # King reached a corner
        if self.king_pos in self.corners:
            self.game_over = True
            self.winner = 2  # Defenders win
            return

        # Check if next player has any moves
        opponent = 2 if self.current_player == 1 else 1
        if not self._has_any_moves(opponent):
            self.game_over = True
            self.winner = self.current_player

    def _has_any_moves(self, player):
        """Check if a player has any legal moves."""
        for r in range(self.size):
            for c in range(self.size):
                piece = self.board[r][c]
                if player == 1 and piece != self.ATTACKER:
                    continue
                if player == 2 and piece not in (self.DEFENDER, self.KING):
                    continue

                # Check if this piece can move in any direction
                for dr, dc in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
                    nr, nc = r + dr, c + dc
                    if 0 <= nr < self.size and 0 <= nc < self.size:
                        if self.board[nr][nc] == self.EMPTY:
                            # Check special square restrictions
                            if (nr, nc) in self.corners and piece != self.KING:
                                continue
                            if (nr, nc) == self.center and piece != self.KING:
                                continue
                            return True
        return False

    def get_state(self):
        """Return serializable game state."""
        return {
            "size": self.size,
            "board": [row[:] for row in self.board],
            "king_pos": list(self.king_pos) if self.king_pos else None,
            "center": list(self.center),
            "corners": [list(c) for c in self.corners],
        }

    def load_state(self, state):
        """Restore game state."""
        self.size = state["size"]
        self.board = [row[:] for row in state["board"]]
        self.king_pos = tuple(state["king_pos"]) if state["king_pos"] else None
        self.center = tuple(state["center"])
        self.corners = [tuple(c) for c in state["corners"]]

    def get_tutorial(self):
        return """
==================================================
  HNEFATAFL (TAFL) - Tutorial
==================================================

  OVERVIEW
  --------
  Hnefatafl (pronounced "nef-ah-tah-fel") is a
  family of ancient Viking strategy board games.
  The games are asymmetric: one side defends a
  King who must escape to a corner, while the
  other side tries to capture the King.

  VARIATIONS
  ----------
  Hnefatafl: 11x11 board.
    King + 12 Defenders vs 24 Attackers.
    Defenders start in a cross pattern at center.
    Attackers start at the four edges.

  Tawlbwrdd: 11x11 board.
    King + 12 Defenders vs 24 Attackers.
    Different starting layout with attackers
    grouped in rectangular formations at edges.

  PLAYERS
  -------
  Player 1: Attackers (A) - moves first
    Goal: capture the King by surrounding it
    on all 4 orthogonal sides.

  Player 2: Defenders (D) with King (K)
    Goal: move the King to any corner square (#).

  BOARD SYMBOLS
  -------------
  A = Attacker
  D = Defender
  K = King
  * = Throne (center square)
  # = Corner square (King's escape target)
  . = Empty square

  MOVEMENT
  --------
  All pieces move like rooks in chess: any
  number of squares in a straight line
  (horizontally or vertically), but cannot
  jump over other pieces.

  Only the King may land on the throne (*) or
  corner squares (#). Non-king pieces cannot
  stop on or pass through the empty throne.

  CAPTURE
  -------
  Custodial capture: A piece is captured when
  it is sandwiched between two enemy pieces on
  opposite sides (horizontally or vertically)
  as a result of the opponent's move.

  The empty throne and corner squares count as
  hostile for capture purposes (they act as
  enemy pieces when sandwiching).

  You cannot be captured by moving your own
  piece between two enemies -- only the moving
  side captures.

  KING CAPTURE
  ------------
  The King is harder to capture. It must be
  surrounded on ALL FOUR orthogonal sides by
  attackers, edges of the board, or hostile
  empty squares (throne/corners).

  WINNING
  -------
  Defenders win: King reaches any corner (#).
  Attackers win: King is captured (surrounded
    on 4 sides).
  Also: if a player has no legal moves on
  their turn, they lose.

  MOVE INPUT
  ----------
  Enter moves using chess-style notation:
    from to
  Example: "a1 a5" moves a piece from a1 to a5.
  Columns: a-k (11x11).
  Rows: 1 = bottom, 11 = top.

  STRATEGY TIPS
  -------------
  Attackers: Form a net around the defenders.
    Block escape routes to corners. Coordinate
    pieces to close in on the King. Try to
    control the diagonals leading to corners.

  Defenders: Create paths for the King to escape
    to corners. Use defenders as blockers and
    sacrifice them to open routes. The King is
    safest near the center early in the game.

  COMMANDS
  --------
  Type 'quit' to quit, 'save' to save,
  'help' for help, 'tutorial' for this text.
==================================================
"""
