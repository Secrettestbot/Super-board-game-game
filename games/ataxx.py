"""Ataxx - A territory control strategy game."""

from engine.base import BaseGame, input_with_quit, clear_screen


class AtaxxGame(BaseGame):
    """Ataxx: Expand your territory by cloning and jumping pieces."""

    name = "Ataxx"
    description = "A territory control game - clone and jump to dominate the board"
    min_players = 2
    max_players = 2
    variations = {
        "standard": "Standard Ataxx (7x7)",
        "small": "Small Ataxx (5x5)",
    }

    def __init__(self, variation=None):
        super().__init__(variation)
        self.board = []
        self.size = 0
        self.blocked = set()
        self.passed_last = [False, False]

    def setup(self):
        """Initialize the board with starting positions."""
        if self.variation == "small":
            self.size = 5
        else:
            self.size = 7

        n = self.size
        self.board = [['.' for _ in range(n)] for _ in range(n)]
        self.blocked = set()

        # Place starting pieces in corners
        last = n - 1
        self.board[0][0] = 'X'
        self.board[last][last] = 'X'
        self.board[0][last] = 'O'
        self.board[last][0] = 'O'

    def display(self):
        """Display the board with row/column numbers."""
        n = self.size
        p1_count = sum(row.count('X') for row in self.board)
        p2_count = sum(row.count('O') for row in self.board)
        label = "7x7" if self.variation != "small" else "5x5"

        print(f"\n  === Ataxx ({label}) ===")
        print(f"  {self.players[0]} (X) vs {self.players[1]} (O)")
        print(f"  Current turn: {self.players[self.current_player - 1]}")
        print()

        # Column headers
        header = "    " + " ".join(str(c) for c in range(n))
        print(header)
        print("    " + "-" * (n * 2 - 1))

        for r in range(n):
            row_str = " ".join(self.board[r][c] for c in range(n))
            print(f"  {r}| {row_str}")

        print()
        print(f"  Score: X={p1_count}  O={p2_count}")
        print()

    def _get_player_char(self, player):
        """Return the board character for a player number."""
        return 'X' if player == 1 else 'O'

    def _get_opponent_char(self, player):
        """Return the board character for the opponent."""
        return 'O' if player == 1 else 'X'

    def _has_valid_moves(self, player):
        """Check if the given player has any valid moves."""
        char = self._get_player_char(player)
        n = self.size
        for r in range(n):
            for c in range(n):
                if self.board[r][c] == char:
                    # Check all destinations within distance 2
                    for dr in range(-2, 3):
                        for dc in range(-2, 3):
                            if dr == 0 and dc == 0:
                                continue
                            nr, nc = r + dr, c + dc
                            if 0 <= nr < n and 0 <= nc < n and self.board[nr][nc] == '.':
                                return True
        return False

    def _find_nearest_piece(self, to_r, to_c, player):
        """Find the nearest piece that can clone to the target square.

        Returns (row, col) of the piece, or None if ambiguous or not found.
        Only considers clone-distance (adjacent) pieces.
        """
        char = self._get_player_char(player)
        candidates = []
        for dr in range(-1, 2):
            for dc in range(-1, 2):
                if dr == 0 and dc == 0:
                    continue
                fr, fc = to_r + dr, to_c + dc
                if 0 <= fr < self.size and 0 <= fc < self.size:
                    if self.board[fr][fc] == char:
                        candidates.append((fr, fc))
        if len(candidates) == 1:
            return candidates[0]
        return None

    def get_move(self):
        """Get move from current player."""
        char = self._get_player_char(self.current_player)

        if not self._has_valid_moves(self.current_player):
            print(f"  {self.players[self.current_player - 1]} ({char}) has no valid moves. Passing.")
            input_with_quit("  Press Enter to continue...")
            return "pass"

        print(f"  {self.players[self.current_player - 1]} ({char}), enter your move.")
        print("  Format: from_row from_col to_row to_col (e.g. '0 0 1 1')")
        print("  Or for clone: to_row to_col (if unambiguous)")
        move_str = input_with_quit("  Your move: ").strip()
        return move_str

    def make_move(self, move):
        """Apply move. Returns True if valid."""
        char = self._get_player_char(self.current_player)
        opp = self._get_opponent_char(self.current_player)
        n = self.size

        # Handle pass
        if move == "pass":
            if not self._has_valid_moves(self.current_player):
                self.passed_last[self.current_player - 1] = True
                return True
            return False

        self.passed_last[self.current_player - 1] = False

        try:
            parts = move.split()
            if len(parts) == 4:
                fr, fc, tr, tc = int(parts[0]), int(parts[1]), int(parts[2]), int(parts[3])
            elif len(parts) == 2:
                tr, tc = int(parts[0]), int(parts[1])
                result = self._find_nearest_piece(tr, tc, self.current_player)
                if result is None:
                    print("  Ambiguous or no adjacent piece found. Use full format: from_row from_col to_row to_col")
                    return False
                fr, fc = result
            else:
                return False
        except (ValueError, IndexError):
            return False

        # Validate source
        if not (0 <= fr < n and 0 <= fc < n):
            return False
        if self.board[fr][fc] != char:
            return False

        # Validate destination
        if not (0 <= tr < n and 0 <= tc < n):
            return False
        if self.board[tr][tc] != '.':
            return False

        # Check distance
        dr = abs(tr - fr)
        dc = abs(tc - fc)
        dist = max(dr, dc)

        if dist < 1 or dist > 2:
            return False

        # Apply the move
        if dist == 1:
            # Clone: piece stays at source, new piece at destination
            self.board[tr][tc] = char
        else:
            # Jump: piece moves from source to destination
            self.board[fr][fc] = '.'
            self.board[tr][tc] = char

        # Convert adjacent opponent pieces
        for adj_r in range(tr - 1, tr + 2):
            for adj_c in range(tc - 1, tc + 2):
                if 0 <= adj_r < n and 0 <= adj_c < n:
                    if self.board[adj_r][adj_c] == opp:
                        self.board[adj_r][adj_c] = char

        return True

    def check_game_over(self):
        """Check if the game is over."""
        n = self.size
        p1_count = sum(row.count('X') for row in self.board)
        p2_count = sum(row.count('O') for row in self.board)
        empty_count = sum(row.count('.') for row in self.board)

        # Board is full
        if empty_count == 0:
            self.game_over = True
        # Both players passed (neither has valid moves)
        elif self.passed_last[0] and self.passed_last[1]:
            self.game_over = True
        # One side has been eliminated
        elif p1_count == 0 or p2_count == 0:
            self.game_over = True

        if self.game_over:
            if p1_count > p2_count:
                self.winner = 1
            elif p2_count > p1_count:
                self.winner = 2
            else:
                self.winner = None  # Draw

    def get_state(self):
        """Return serializable game state."""
        return {
            "board": [list(row) for row in self.board],
            "size": self.size,
            "blocked": list(self.blocked),
            "passed_last": list(self.passed_last),
        }

    def load_state(self, state):
        """Restore game state."""
        self.board = [list(row) for row in state["board"]]
        self.size = state["size"]
        self.blocked = set(tuple(b) for b in state.get("blocked", []))
        self.passed_last = list(state.get("passed_last", [False, False]))

    def get_tutorial(self):
        """Return tutorial with rules and strategy hints."""
        return """
==================================================
  Ataxx - Tutorial
==================================================

  RULES:
  - Ataxx is played on a 7x7 grid (or 5x5 in the
    small variant).
  - Player 1 (X) starts at corners (0,0) and
    (6,6). Player 2 (O) starts at (0,6) and (6,0).
  - On your turn you move one of your pieces to an
    empty square. There are two types of moves:

    1. CLONE (distance 1): Move to any adjacent
       square (including diagonal). Your piece is
       duplicated - the original stays and a new
       piece appears at the destination.

    2. JUMP (distance 2): Move to a square exactly
       2 away (including diagonal). The piece moves
       from the source to the destination (it is
       not duplicated).

  - After moving, ALL opponent pieces adjacent to
    the destination square are converted to your
    color.
  - If a player has no valid moves, they pass.
  - The game ends when the board is full or both
    players pass consecutively.
  - The player with more pieces wins.

  HOW TO ENTER MOVES:
  - Full format: from_row from_col to_row to_col
    Example: "0 0 1 1" (clone from (0,0) to (1,1))
    Example: "0 0 2 2" (jump from (0,0) to (2,2))
  - Short format (clone only): to_row to_col
    Example: "1 1" (auto-clone from nearest piece)
    This only works when exactly one of your pieces
    is adjacent to the target square.

  STRATEGY HINTS:
  - Cloning is almost always better than jumping,
    since you gain a piece instead of just moving.
  - Try to maximize conversions by moving next to
    clusters of opponent pieces.
  - Control the center of the board to limit your
    opponent's options.
  - Avoid jumping unless it leads to a large number
    of conversions or a critical positional gain.

==================================================
"""
