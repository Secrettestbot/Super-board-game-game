"""Alquerque - Ancient predecessor to checkers."""

from engine.base import BaseGame, input_with_quit, clear_screen


class AlquerqueGame(BaseGame):
    """Alquerque (also known as Qirkat).

    An ancient board game played on a 5x5 grid with diagonal connections.
    Each player starts with 12 pieces. Pieces move to adjacent connected
    empty points, or jump over an enemy piece to capture it.
    Captures are mandatory. Multi-jumps are allowed.
    """

    name = "Alquerque"
    description = "Ancient predecessor to checkers"
    min_players = 2
    max_players = 2
    variations = {"standard": "Standard Alquerque"}

    def __init__(self, variation=None):
        super().__init__(variation)

    def _build_adjacency(self):
        """Build adjacency map for the 5x5 board with diagonal connections.

        Board positions numbered 0-24 (row * 5 + col).
        All positions connect orthogonally to neighbors.
        Diagonal connections exist on positions where (row+col) is even.
        """
        adj = {}
        for r in range(5):
            for c in range(5):
                pos = r * 5 + c
                neighbors = []
                # Orthogonal
                for dr, dc in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
                    nr, nc = r + dr, c + dc
                    if 0 <= nr < 5 and 0 <= nc < 5:
                        neighbors.append(nr * 5 + nc)
                # Diagonal connections exist when (row+col) is even
                if (r + c) % 2 == 0:
                    for dr, dc in [(-1, -1), (-1, 1), (1, -1), (1, 1)]:
                        nr, nc = r + dr, c + dc
                        if 0 <= nr < 5 and 0 <= nc < 5:
                            neighbors.append(nr * 5 + nc)
                adj[pos] = neighbors
        return adj

    def _get_jump_target(self, frm, mid):
        """Given a piece at frm jumping over mid, return the landing position,
        or None if the jump geometry is invalid."""
        fr, fc = divmod(frm, 5)
        mr, mc = divmod(mid, 5)
        dr, dc = mr - fr, mc - fc
        lr, lc = mr + dr, mc + dc
        if 0 <= lr < 5 and 0 <= lc < 5:
            land = lr * 5 + lc
            # The landing must be adjacent to mid in the adjacency graph
            if land in self.adjacency[mid] and mid in self.adjacency[frm]:
                return land
        return None

    def setup(self):
        """Initialize the 5x5 board.

        Standard setup: Player 1 fills rows 3-4 and left 2 of row 2.
        Player 2 fills rows 0-1 and right 2 of row 2. Center is empty.
        """
        self.adjacency = self._build_adjacency()

        # board[pos] = 0 (empty), 1 (player 1), 2 (player 2)
        self.board = [0] * 25

        # Player 2 (O) occupies rows 0-1 fully (positions 0-9)
        for i in range(10):
            self.board[i] = 2
        # Row 2: player 2 gets cols 3,4; player 1 gets cols 0,1; center empty
        self.board[10] = 1  # row 2, col 0
        self.board[11] = 1  # row 2, col 1
        self.board[12] = 0  # row 2, col 2 (center - empty)
        self.board[13] = 2  # row 2, col 3
        self.board[14] = 2  # row 2, col 4
        # Player 1 (X) occupies rows 3-4 fully (positions 15-24)
        for i in range(15, 25):
            self.board[i] = 1

        self.must_continue_from = None  # for multi-jump tracking
        self.pieces_count = {1: 12, 2: 12}

    def display(self):
        """Display the board with connections."""
        symbols = {0: '.', 1: 'X', 2: 'O'}
        print(f"\n  Alquerque   Turn {self.turn_number}")
        print(f"  {self.players[0]} (X:{self.pieces_count[1]}) vs "
              f"{self.players[1]} (O:{self.pieces_count[2]})")
        print(f"  Current: {self.players[self.current_player - 1]}")
        if self.must_continue_from is not None:
            r, c = divmod(self.must_continue_from, 5)
            print(f"  ** Must continue jumping from {r},{c} **")
        print()

        # Display board with connections
        # Row by row with connection lines between
        for r in range(5):
            # Piece row
            row_str = "    "
            for c in range(5):
                pos = r * 5 + c
                row_str += symbols[self.board[pos]]
                if c < 4:
                    row_str += "---"
            row_str += f"   row {r}"
            print(row_str)

            # Connection row (between rows)
            if r < 4:
                conn_str = "    "
                for c in range(5):
                    if (r + c) % 2 == 0:
                        # This position has diagonal connections
                        if c < 4:
                            conn_str += "|  \\  "[0:2]
                            # Check if next col also has diag
                        else:
                            conn_str += "|"
                    else:
                        if c < 4:
                            conn_str += "|  /  "[0:2]
                        else:
                            conn_str += "|"
                # Simpler approach: hard-code connection patterns
                if r % 2 == 0:
                    print(f"    | \\ | / | \\ | / |")
                else:
                    print(f"    | / | \\ | / | \\ |")

        print()
        print(f"  Positions: row,col (e.g. '4,0 3,1')")
        print(f"  Or position numbers 0-24 (e.g. '20 16')")
        print()

    def _parse_pos(self, s):
        """Parse a position string. Accepts 'row,col' or a flat number 0-24."""
        s = s.strip()
        if ',' in s:
            parts = s.split(',')
            if len(parts) == 2:
                try:
                    r, c = int(parts[0]), int(parts[1])
                    if 0 <= r < 5 and 0 <= c < 5:
                        return r * 5 + c
                except ValueError:
                    pass
        else:
            try:
                pos = int(s)
                if 0 <= pos < 25:
                    return pos
            except ValueError:
                pass
        return None

    def _get_captures_from(self, pos, player):
        """Return list of (jumped_pos, landing_pos) for captures from pos."""
        captures = []
        opponent = 2 if player == 1 else 1
        for mid in self.adjacency[pos]:
            if self.board[mid] == opponent:
                land = self._get_jump_target(pos, mid)
                if land is not None and self.board[land] == 0:
                    captures.append((mid, land))
        return captures

    def _player_has_captures(self, player):
        """Check if any piece of player can capture."""
        for pos in range(25):
            if self.board[pos] == player:
                if self._get_captures_from(pos, player):
                    return True
        return False

    def get_move(self):
        """Get move as 'from to'."""
        prompt = f"  {self.players[self.current_player - 1]}, enter move (from to): "
        move_str = input_with_quit(prompt)
        parts = move_str.strip().split()
        if len(parts) != 2:
            return None
        frm = self._parse_pos(parts[0])
        to = self._parse_pos(parts[1])
        if frm is None or to is None:
            return None
        return (frm, to)

    def make_move(self, move):
        """Apply a move. Returns True if valid.
        Handles mandatory captures and multi-jumps."""
        if move is None:
            return False
        frm, to = move

        if self.board[frm] != self.current_player:
            return False
        if self.board[to] != 0:
            return False

        # If continuing a multi-jump, must move from that piece
        if self.must_continue_from is not None:
            if frm != self.must_continue_from:
                print(f"  Must continue jumping from position {frm}!")
                return False

        # Check if this is a capture (jump)
        captures = self._get_captures_from(frm, self.current_player)
        is_capture = False
        captured_pos = None
        for mid, land in captures:
            if land == to:
                is_capture = True
                captured_pos = mid
                break

        # If any captures are available for this player, must capture
        if not is_capture:
            if self.must_continue_from is not None:
                # Must keep jumping or can't - this shouldn't happen normally
                return False
            if self._player_has_captures(self.current_player):
                print("  Capture is mandatory!")
                return False
            # Simple move - must be to adjacent connected point
            if to not in self.adjacency[frm]:
                return False

        # Execute the move
        self.board[frm] = 0
        self.board[to] = self.current_player

        if is_capture:
            opponent = 2 if self.current_player == 1 else 1
            self.board[captured_pos] = 0
            self.pieces_count[opponent] -= 1

            # Check for further jumps from the new position
            further = self._get_captures_from(to, self.current_player)
            if further:
                self.must_continue_from = to
                # Don't switch player yet - display and ask for next jump
                # We mark this as a valid move but the player continues
                print(f"  Captured! You can jump again from {to // 5},{to % 5}.")
                return True
            else:
                self.must_continue_from = None
        else:
            self.must_continue_from = None

        return True

    def check_game_over(self):
        """Check if game is over. If a multi-jump is in progress, don't switch yet."""
        if self.must_continue_from is not None:
            # Multi-jump in progress - don't end turn or switch
            # We need to prevent switch_player from being called
            # The play() loop calls switch_player after check_game_over
            # We handle this by keeping track and overriding in make_move
            return

        opponent = 2 if self.current_player == 1 else 1

        # Win by eliminating all opponent pieces
        if self.pieces_count[opponent] == 0:
            self.game_over = True
            self.winner = self.current_player
            return

        # Win by blocking opponent from any move
        has_move = False
        for pos in range(25):
            if self.board[pos] == opponent:
                # Check simple moves
                for adj in self.adjacency[pos]:
                    if self.board[adj] == 0:
                        has_move = True
                        break
                # Check captures
                if not has_move:
                    if self._get_captures_from(pos, opponent):
                        has_move = True
                if has_move:
                    break

        if not has_move:
            self.game_over = True
            self.winner = self.current_player

    def get_state(self):
        return {
            "board": self.board[:],
            "pieces_count": self.pieces_count.copy(),
            "must_continue_from": self.must_continue_from,
        }

    def load_state(self, state):
        self.board = state["board"]
        self.pieces_count = state["pieces_count"]
        self.must_continue_from = state.get("must_continue_from")

    def switch_player(self):
        """Override to prevent switching during multi-jumps."""
        if self.must_continue_from is not None:
            return  # Don't switch - multi-jump in progress
        super().switch_player()

    def get_tutorial(self):
        return """
==================================================
  ALQUERQUE - Tutorial
==================================================

  OVERVIEW
  --------
  Alquerque is an ancient board game, considered
  the ancestor of modern checkers/draughts.
  It is played on a 5x5 grid with diagonal
  connections on alternating intersections.

  BOARD
  -----
  The board is a 5x5 grid. Positions are
  identified by row,col (both 0-4) or flat
  numbers 0-24 (row*5 + col).

    O---O---O---O---O   row 0
    | \\ | / | \\ | / |
    O---O---O---O---O   row 1
    | / | \\ | / | \\ |
    X---X---.---O---O   row 2
    | \\ | / | \\ | / |
    X---X---X---X---X   row 3
    | / | \\ | / | \\ |
    X---X---X---X---X   row 4

  SETUP
  -----
  Player 1 (X): 12 pieces on rows 3-4 and
    the left two positions of row 2.
  Player 2 (O): 12 pieces on rows 0-1 and
    the right two positions of row 2.
  The center point (2,2) starts empty.

  HOW TO PLAY
  -----------
  Players alternate turns. On your turn you
  may either:

  1. MOVE: Slide one piece to an adjacent
     connected empty point.

  2. CAPTURE: Jump over an adjacent enemy
     piece to land on the empty point beyond
     it (in a straight line). The jumped piece
     is removed from the board.

  MANDATORY CAPTURES: If a capture is available,
  you MUST capture. You cannot make a simple
  move when a jump is possible.

  MULTI-JUMPS: After capturing, if the same
  piece can capture again, it must continue
  jumping until no more captures are possible.

  MOVE INPUT
  ----------
  Enter moves as: from to
  Use row,col format: "4,0 3,1"
  Or flat position numbers: "20 16"

  WINNING
  -------
  You win by either:
  - Capturing all of your opponent's pieces
  - Blocking your opponent so they have no
    legal moves

  COMMANDS
  --------
  Type 'quit' to quit, 'save' to save,
  'help' for help, 'tutorial' for this text.
==================================================
"""
