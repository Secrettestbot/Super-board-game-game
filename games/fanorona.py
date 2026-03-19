"""Fanorona - Traditional Malagasy strategy game with approach and withdrawal captures."""

from engine.base import BaseGame, input_with_quit, clear_screen


class FanoronaGame(BaseGame):
    """Fanorona.

    A traditional strategy game from Madagascar played on a grid of
    intersecting lines. Two players each start with 22 pieces (on the
    standard 9x5 board). Captures are made by either approaching an
    enemy piece (moving toward it) or withdrawing from an enemy piece
    (moving away from it). A capture removes an entire line of
    consecutive enemy pieces in the capture direction. After a capture,
    the same piece may continue capturing in other directions (but
    cannot reverse direction). Win by capturing all opponent pieces.
    """

    name = "Fanorona"
    description = "Malagasy strategy game with approach and withdrawal captures"
    min_players = 2
    max_players = 2
    variations = {
        "standard": "Standard (9x5)",
        "small": "Fanoron-Telo (3x3)",
    }

    EMPTY = 0
    P1 = 1
    P2 = 2

    def __init__(self, variation=None):
        super().__init__(variation or "standard")

    def setup(self):
        """Initialize the board with pieces."""
        if self.variation == "small":
            self.cols = 3
            self.rows = 3
            self._setup_small()
        else:
            self.cols = 9
            self.rows = 5
            self._setup_standard()

        self.connections = self._build_connections()
        # Track multi-capture state
        self.chain_piece = None        # (r, c) of piece doing chain capture
        self.chain_visited = set()     # positions already visited in this chain
        self.chain_last_dir = None     # last direction moved (cannot reverse)
        self.pieces_count = {self.P1: 0, self.P2: 0}
        self._count_pieces()

    def _setup_standard(self):
        """Set up the standard 9x5 board. 22 pieces per player."""
        self.board = [[self.EMPTY] * self.cols for _ in range(self.rows)]
        # Rows 0-1: Player 2 (top)
        for r in range(2):
            for c in range(self.cols):
                self.board[r][c] = self.P2
        # Row 2 (middle): alternating pattern
        # Standard Fanorona middle row pattern
        for c in range(self.cols):
            if c % 2 == 0:
                if c < self.cols // 2:
                    self.board[2][c] = self.P2
                elif c > self.cols // 2:
                    self.board[2][c] = self.P1
                else:
                    self.board[2][c] = self.EMPTY  # center is empty
            else:
                if c < self.cols // 2:
                    self.board[2][c] = self.P1
                elif c > self.cols // 2:
                    self.board[2][c] = self.P2
                else:
                    self.board[2][c] = self.P1
        # Rows 3-4: Player 1 (bottom)
        for r in range(3, 5):
            for c in range(self.cols):
                self.board[r][c] = self.P1

    def _setup_small(self):
        """Set up the 3x3 board (Fanoron-Telo)."""
        self.board = [[self.EMPTY] * 3 for _ in range(3)]
        # Top row: P2
        for c in range(3):
            self.board[0][c] = self.P2
        # Middle: P2, empty, P1
        self.board[1][0] = self.P2
        self.board[1][1] = self.EMPTY
        self.board[1][2] = self.P1
        # Bottom row: P1
        for c in range(3):
            self.board[2][c] = self.P1

    def _count_pieces(self):
        """Count pieces on the board."""
        self.pieces_count = {self.P1: 0, self.P2: 0}
        for r in range(self.rows):
            for c in range(self.cols):
                if self.board[r][c] in (self.P1, self.P2):
                    self.pieces_count[self.board[r][c]] += 1

    def _build_connections(self):
        """Build the connection map for the board.

        On a Fanorona board, not all intersections have diagonal connections.
        Diagonal connections exist only where (row + col) is even (strong points).
        All points have orthogonal connections to adjacent points.
        """
        conns = {}
        for r in range(self.rows):
            for c in range(self.cols):
                neighbors = []
                for dr in [-1, 0, 1]:
                    for dc in [-1, 0, 1]:
                        if dr == 0 and dc == 0:
                            continue
                        nr, nc = r + dr, c + dc
                        if not (0 <= nr < self.rows and 0 <= nc < self.cols):
                            continue
                        # Diagonal connections only at strong points
                        if dr != 0 and dc != 0:
                            if (r + c) % 2 != 0:
                                continue
                        neighbors.append((nr, nc, dr, dc))
                conns[(r, c)] = neighbors
        return conns

    def display(self):
        """Display the board with connection lines."""
        symbols = {self.EMPTY: '.', self.P1: 'X', self.P2: 'O'}

        print(f"\n  Fanorona ({self.variations[self.variation]})   Turn {self.turn_number}")
        print(f"  {self.players[0]} (X:{self.pieces_count[self.P1]}) vs "
              f"{self.players[1]} (O:{self.pieces_count[self.P2]})")
        print(f"  Current: {self.players[self.current_player - 1]}")

        if self.chain_piece is not None:
            cr, cc = self.chain_piece
            print(f"  ** Chain capture in progress from ({cr},{cc}) **")
            print(f"  ** Enter 'done' or 'd' to end chain **")
        print()

        for r in range(self.rows):
            # Piece row
            row_str = f"  {r} "
            for c in range(self.cols):
                piece = self.board[r][c]
                sym = symbols[piece]
                if c < self.cols - 1:
                    row_str += f" {sym} -"
                else:
                    row_str += f" {sym}"
            print(row_str)

            # Connection row (between piece rows)
            if r < self.rows - 1:
                conn_str = "    "
                for c in range(self.cols):
                    # Vertical connection always exists
                    has_diag_right = ((r + c) % 2 == 0 and
                                     c + 1 < self.cols)
                    has_diag_left = ((r + c) % 2 == 0 and c > 0)
                    # But we also need to check from (r+1,c-1) going up-right
                    has_diag_left_from_below = ((r + 1 + c - 1) % 2 == 0 and
                                                c > 0) if c > 0 else False

                    if has_diag_left or has_diag_left_from_below:
                        conn_str += " / "
                    else:
                        conn_str += "   "

                    if c < self.cols - 1:
                        # Check for diagonal right connection
                        if has_diag_right:
                            conn_str += "\\"
                        else:
                            conn_str += " "
                print(conn_str.rstrip())

        # Column labels
        col_str = "    "
        for c in range(self.cols):
            col_str += f" {c}  "
        print(col_str)
        print()
        print("  Move: 'row,col row,col' then 'A' (approach) or 'W' (withdrawal)")
        print("  Type 'quit' to quit, 'save' to save, 'help' for help")
        print()

    def _get_direction(self, fr, fc, tr, tc):
        """Get the direction vector from (fr,fc) to (tr,tc). Returns (dr,dc) or None."""
        dr = tr - fr
        dc = tc - fc
        if abs(dr) <= 1 and abs(dc) <= 1 and (dr != 0 or dc != 0):
            return (dr, dc)
        return None

    def _is_connected(self, fr, fc, tr, tc):
        """Check if two adjacent positions are connected on the board."""
        for nr, nc, dr, dc in self.connections.get((fr, fc), []):
            if nr == tr and nc == tc:
                return True
        return False

    def _get_approach_captures(self, fr, fc, tr, tc, player):
        """Get pieces captured by approaching.

        When moving from (fr,fc) to (tr,tc), approach capture removes
        consecutive enemy pieces starting from the position beyond (tr,tc)
        in the direction of movement.
        """
        opponent = self.P2 if player == self.P1 else self.P1
        direction = self._get_direction(fr, fc, tr, tc)
        if direction is None:
            return []

        dr, dc = direction
        captured = []
        cr, cc = tr + dr, tc + dc
        while 0 <= cr < self.rows and 0 <= cc < self.cols:
            if self.board[cr][cc] == opponent:
                captured.append((cr, cc))
                cr += dr
                cc += dc
            else:
                break
        return captured

    def _get_withdrawal_captures(self, fr, fc, tr, tc, player):
        """Get pieces captured by withdrawal.

        When moving from (fr,fc) to (tr,tc), withdrawal capture removes
        consecutive enemy pieces starting from the position behind (fr,fc)
        in the opposite direction of movement.
        """
        opponent = self.P2 if player == self.P1 else self.P1
        direction = self._get_direction(fr, fc, tr, tc)
        if direction is None:
            return []

        dr, dc = direction
        captured = []
        # Look behind the starting position (opposite direction)
        cr, cc = fr - dr, fc - dc
        while 0 <= cr < self.rows and 0 <= cc < self.cols:
            if self.board[cr][cc] == opponent:
                captured.append((cr, cc))
                cr -= dr
                cc -= dc
            else:
                break
        return captured

    def _get_all_capturing_moves(self, player):
        """Get all possible capturing moves for a player.

        Returns list of (fr, fc, tr, tc, capture_type, captured_list) tuples.
        """
        moves = []
        opponent = self.P2 if player == self.P1 else self.P1
        for r in range(self.rows):
            for c in range(self.cols):
                if self.board[r][c] != player:
                    continue
                for nr, nc, dr, dc in self.connections.get((r, c), []):
                    if self.board[nr][nc] != self.EMPTY:
                        continue
                    # Check approach captures
                    approach = self._get_approach_captures(r, c, nr, nc, player)
                    if approach:
                        moves.append((r, c, nr, nc, 'A', approach))
                    # Check withdrawal captures
                    withdrawal = self._get_withdrawal_captures(r, c, nr, nc, player)
                    if withdrawal:
                        moves.append((r, c, nr, nc, 'W', withdrawal))
        return moves

    def _get_chain_capturing_moves(self, r, c, player, visited, last_dir):
        """Get capturing moves for a piece in a chain capture.

        The piece at (r,c) can continue capturing, but:
        - Cannot reverse direction (opposite of last_dir)
        - Cannot revisit positions in visited set
        """
        moves = []
        opponent = self.P2 if player == self.P1 else self.P1
        reverse_dir = (-last_dir[0], -last_dir[1]) if last_dir else None

        for nr, nc, dr, dc in self.connections.get((r, c), []):
            if self.board[nr][nc] != self.EMPTY:
                continue
            if (nr, nc) in visited:
                continue
            # Cannot reverse direction
            if reverse_dir and (dr, dc) == reverse_dir:
                continue

            approach = self._get_approach_captures(r, c, nr, nc, player)
            if approach:
                moves.append((r, c, nr, nc, 'A', approach))
            withdrawal = self._get_withdrawal_captures(r, c, nr, nc, player)
            if withdrawal:
                moves.append((r, c, nr, nc, 'W', withdrawal))
        return moves

    def _get_non_capturing_moves(self, player):
        """Get all non-capturing moves for a player."""
        moves = []
        for r in range(self.rows):
            for c in range(self.cols):
                if self.board[r][c] != player:
                    continue
                for nr, nc, dr, dc in self.connections.get((r, c), []):
                    if self.board[nr][nc] == self.EMPTY:
                        moves.append((r, c, nr, nc))
        return moves

    def get_move(self):
        """Get move from current player."""
        player = self.current_player

        # Chain capture in progress
        if self.chain_piece is not None:
            cr, cc = self.chain_piece
            chain_moves = self._get_chain_capturing_moves(
                cr, cc, player, self.chain_visited, self.chain_last_dir
            )
            if not chain_moves:
                # No more chain captures possible, auto-end
                self.chain_piece = None
                self.chain_visited = set()
                self.chain_last_dir = None
                return ('end_chain',)

            prompt = (f"  {self.players[self.current_player - 1]}, "
                      f"chain from ({cr},{cc}) - enter 'row,col' or 'done': ")
            raw = input_with_quit(prompt)
            raw = raw.strip().lower()

            if raw in ('done', 'd'):
                return ('end_chain',)

            return self._parse_chain_input(raw, cr, cc, chain_moves)

        # Normal turn
        capturing_moves = self._get_all_capturing_moves(player)

        if capturing_moves:
            print("  *** Capture is mandatory! ***")

        prompt = (f"  {self.players[self.current_player - 1]}, "
                  f"enter move (row,col row,col): ")
        raw = input_with_quit(prompt)
        return self._parse_move_input(raw, capturing_moves)

    def _parse_chain_input(self, raw, cr, cc, chain_moves):
        """Parse input during a chain capture."""
        parts = raw.replace(',', ' ').split()
        try:
            if len(parts) >= 2:
                tr, tc = int(parts[0]), int(parts[1])
            else:
                return None
        except ValueError:
            return None

        if not (0 <= tr < self.rows and 0 <= tc < self.cols):
            return None

        # Find matching chain moves
        matching = [(f, fi, t, ti, ct, caps) for f, fi, t, ti, ct, caps
                     in chain_moves if t == tr and ti == tc]

        if not matching:
            return None

        if len(matching) == 1:
            _, _, _, _, ct, caps = matching[0]
            return ('chain_capture', cr, cc, tr, tc, ct, caps)

        # Need to ask approach or withdrawal
        approach_match = [m for m in matching if m[4] == 'A']
        withdraw_match = [m for m in matching if m[4] == 'W']

        if approach_match and withdraw_match:
            while True:
                choice = input_with_quit("  Approach (A) or Withdrawal (W)? ").strip().upper()
                if choice in ('A', 'W'):
                    m = approach_match[0] if choice == 'A' else withdraw_match[0]
                    _, _, _, _, ct, caps = m
                    return ('chain_capture', cr, cc, tr, tc, ct, caps)
                print("  Enter 'A' or 'W'.")
        elif approach_match:
            _, _, _, _, ct, caps = approach_match[0]
            return ('chain_capture', cr, cc, tr, tc, ct, caps)
        else:
            _, _, _, _, ct, caps = withdraw_match[0]
            return ('chain_capture', cr, cc, tr, tc, ct, caps)

    def _parse_move_input(self, raw, capturing_moves):
        """Parse move input for a normal turn."""
        raw = raw.strip().lower()
        # Parse "row,col row,col" or "r c r c" etc.
        parts = raw.replace(',', ' ').split()
        try:
            if len(parts) >= 4:
                fr, fc, tr, tc = int(parts[0]), int(parts[1]), int(parts[2]), int(parts[3])
            elif len(parts) == 2:
                # Try "rc rc" two-digit format
                return None
            else:
                return None
        except ValueError:
            return None

        if not (0 <= fr < self.rows and 0 <= fc < self.cols and
                0 <= tr < self.rows and 0 <= tc < self.cols):
            return None

        # If captures are mandatory, filter to capture moves
        if capturing_moves:
            matching = [(f, fi, t, ti, ct, caps) for f, fi, t, ti, ct, caps
                         in capturing_moves if f == fr and fi == fc and t == tr and ti == tc]
            if not matching:
                return None

            if len(matching) == 1:
                _, _, _, _, ct, caps = matching[0]
                return ('capture', fr, fc, tr, tc, ct, caps)

            # Both approach and withdrawal possible
            approach_match = [m for m in matching if m[4] == 'A']
            withdraw_match = [m for m in matching if m[4] == 'W']

            if approach_match and withdraw_match:
                while True:
                    choice = input_with_quit("  Approach (A) or Withdrawal (W)? ").strip().upper()
                    if choice in ('A', 'W'):
                        m = approach_match[0] if choice == 'A' else withdraw_match[0]
                        _, _, _, _, ct, caps = m
                        return ('capture', fr, fc, tr, tc, ct, caps)
                    print("  Enter 'A' or 'W'.")
            elif approach_match:
                _, _, _, _, ct, caps = approach_match[0]
                return ('capture', fr, fc, tr, tc, ct, caps)
            else:
                _, _, _, _, ct, caps = withdraw_match[0]
                return ('capture', fr, fc, tr, tc, ct, caps)
        else:
            return ('move', fr, fc, tr, tc)

    def make_move(self, move):
        """Apply a move. Returns True if valid."""
        if move is None:
            return False

        player = self.current_player

        if move[0] == 'end_chain':
            self.chain_piece = None
            self.chain_visited = set()
            self.chain_last_dir = None
            return True

        if move[0] == 'move':
            _, fr, fc, tr, tc = move
            return self._make_simple_move(fr, fc, tr, tc, player)

        if move[0] in ('capture', 'chain_capture'):
            _, fr, fc, tr, tc, capture_type, captured = move
            return self._make_capture_move(fr, fc, tr, tc, capture_type, captured, player)

        return False

    def _make_simple_move(self, fr, fc, tr, tc, player):
        """Make a non-capturing move."""
        if self.board[fr][fc] != player:
            return False
        if self.board[tr][tc] != self.EMPTY:
            return False
        if not self._is_connected(fr, fc, tr, tc):
            return False

        # Ensure no captures are available (captures are mandatory)
        if self._get_all_capturing_moves(player):
            print("  Capture is mandatory!")
            return False

        self.board[fr][fc] = self.EMPTY
        self.board[tr][tc] = player
        self.chain_piece = None
        self.chain_visited = set()
        self.chain_last_dir = None
        return True

    def _make_capture_move(self, fr, fc, tr, tc, capture_type, captured, player):
        """Make a capturing move."""
        if self.board[fr][fc] != player:
            return False
        if self.board[tr][tc] != self.EMPTY:
            return False
        if not self._is_connected(fr, fc, tr, tc):
            return False
        if not captured:
            return False

        opponent = self.P2 if player == self.P1 else self.P1

        # Execute the move
        self.board[fr][fc] = self.EMPTY
        self.board[tr][tc] = player

        # Remove captured pieces
        for cr, cc in captured:
            if self.board[cr][cc] == opponent:
                self.board[cr][cc] = self.EMPTY
                self.pieces_count[opponent] -= 1

        direction = self._get_direction(fr, fc, tr, tc)

        # Set up chain capture state
        visited = self.chain_visited.copy() if self.chain_visited else set()
        visited.add((fr, fc))
        visited.add((tr, tc))

        # Check for continuation
        chain_moves = self._get_chain_capturing_moves(
            tr, tc, player, visited, direction
        )
        if chain_moves:
            self.chain_piece = (tr, tc)
            self.chain_visited = visited
            self.chain_last_dir = direction
        else:
            self.chain_piece = None
            self.chain_visited = set()
            self.chain_last_dir = None

        return True

    def check_game_over(self):
        """Check if the game is over."""
        # Don't end game during chain capture
        if self.chain_piece is not None:
            return

        opponent = self.P2 if self.current_player == 1 else self.P1

        # Win by capturing all opponent pieces
        if self.pieces_count[opponent] == 0:
            self.game_over = True
            self.winner = self.current_player
            return

        # Check if opponent has any moves at all
        next_player_val = opponent
        cap_moves = self._get_all_capturing_moves(next_player_val)
        if cap_moves:
            return
        non_cap_moves = self._get_non_capturing_moves(next_player_val)
        if non_cap_moves:
            return

        # Opponent has no moves
        self.game_over = True
        self.winner = self.current_player

    def switch_player(self):
        """Only switch if not in a chain capture."""
        if self.chain_piece is None:
            super().switch_player()

    def get_state(self):
        """Return serializable game state."""
        return {
            "board": [row[:] for row in self.board],
            "rows": self.rows,
            "cols": self.cols,
            "pieces_count": {str(k): v for k, v in self.pieces_count.items()},
            "chain_piece": list(self.chain_piece) if self.chain_piece else None,
            "chain_visited": [list(p) for p in self.chain_visited] if self.chain_visited else [],
            "chain_last_dir": list(self.chain_last_dir) if self.chain_last_dir else None,
        }

    def load_state(self, state):
        """Restore game state."""
        self.board = [row[:] for row in state["board"]]
        self.rows = state["rows"]
        self.cols = state["cols"]
        self.pieces_count = {int(k): v for k, v in state["pieces_count"].items()}
        cp = state.get("chain_piece")
        self.chain_piece = tuple(cp) if cp else None
        cv = state.get("chain_visited", [])
        self.chain_visited = {tuple(p) for p in cv}
        cd = state.get("chain_last_dir")
        self.chain_last_dir = tuple(cd) if cd else None
        self.connections = self._build_connections()

    def get_tutorial(self):
        return """
==================================================
  FANORONA - Tutorial
==================================================

  OVERVIEW
  --------
  Fanorona is a traditional strategy game from
  Madagascar. It is the national game of the
  Malagasy people and is known for its unique
  capture mechanics involving approach and
  withdrawal.

  BOARD
  -----
  Standard: 9 columns x 5 rows of intersections
  connected by lines. "Strong" intersections
  (where row+col is even) have diagonal connections
  in addition to orthogonal ones.

  Small (Fanoron-Telo): 3x3 grid.

  SETUP
  -----
  Standard: Each player starts with 22 pieces.
  Player 1 (X) occupies the bottom two rows and
  part of the middle row.
  Player 2 (O) occupies the top two rows and
  part of the middle row.
  The center intersection starts empty.

  MOVEMENT
  --------
  A piece moves one step along a line to an
  adjacent empty intersection.

  CAPTURE
  -------
  Captures are MANDATORY. If you can capture,
  you must capture.

  There are two types of capture:

  1. APPROACH: Move toward an enemy piece. All
     consecutive enemy pieces in the direction
     of movement (beyond your destination) are
     captured and removed.

  2. WITHDRAWAL: Move away from an enemy piece.
     All consecutive enemy pieces in the opposite
     direction of movement (behind your start
     position) are captured and removed.

  If a move could be either approach or withdrawal,
  you must choose which type of capture to make.

  CHAIN CAPTURES
  --------------
  After making a capture, the same piece may
  continue capturing if it can move to another
  adjacent empty intersection and capture more
  enemy pieces. Rules for chain captures:

  - The piece CANNOT reverse direction (move
    back the way it came).
  - The piece CANNOT revisit a position it has
    already occupied during the chain.
  - Chain captures are optional - you may stop
    the chain at any point by entering 'done'.

  MOVE INPUT
  ----------
  Enter moves as: row,col row,col
  Example: "2,3 1,3" moves from row 2, col 3
  to row 1, col 3.

  If both approach and withdrawal are possible,
  you will be asked to choose 'A' or 'W'.

  During a chain capture, enter just the
  destination: row,col  or type 'done' to stop.

  Coordinates are 0-indexed from top-left.

  WINNING
  -------
  You win by capturing all of your opponent's
  pieces or leaving them with no legal moves.

  STRATEGY TIPS
  -------------
  - Chain captures can remove many pieces in a
    single turn - set them up carefully.
  - Control the center of the board.
  - Watch out for forced captures that leave
    your pieces vulnerable.
  - In the endgame, try to corner opponent
    pieces against the board edge.

  COMMANDS
  --------
  Type 'quit' to quit, 'save' to save,
  'help' for help, 'tutorial' for this text.
==================================================
"""
