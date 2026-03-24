"""Dara (Derrah) - Nigerian strategy game of alignment and capture."""

from engine.base import BaseGame, input_with_quit, clear_screen


class DaraGame(BaseGame):
    """Dara: Nigerian two-phase strategy game on a 5x6 grid."""

    name = "Dara"
    description = "Nigerian strategy game - place pieces then move to form three in a row"
    min_players = 2
    max_players = 2
    variations = {
        "standard": "Standard Dara",
    }

    SYMBOLS = {0: ".", 1: "X", 2: "O"}
    ROWS = 5
    COLS = 6
    PIECES_PER_PLAYER = 12

    def __init__(self, variation=None):
        super().__init__(variation or "standard")

    # ------------------------------------------------------------------ setup
    def setup(self):
        """Initialize empty 5x6 grid and placement phase."""
        self.board = [[0] * self.COLS for _ in range(self.ROWS)]
        self.phase = 1  # 1 = placement, 2 = movement
        self.pieces_placed = {1: 0, 2: 0}
        self.pieces_on_board = {1: 0, 2: 0}
        self.pending_removal = False  # True when current player must remove a piece

    # --------------------------------------------------------------- display
    def display(self):
        """Display the current game state."""
        s = self.SYMBOLS
        p = self.players[self.current_player - 1]
        phase_name = "Placement" if self.phase == 1 else "Movement"
        print(f"\n  === Dara ({phase_name} Phase) ===  Turn {self.turn_number + 1}")
        print(f"  {self.players[0]} (X)  vs  {self.players[1]} (O)")
        print(f"  Current: {p} ({s[self.current_player]})")

        if self.phase == 1:
            print(f"  Pieces placed: X={self.pieces_placed[1]}/{self.PIECES_PER_PLAYER}"
                  f"  O={self.pieces_placed[2]}/{self.PIECES_PER_PLAYER}")
        else:
            print(f"  Pieces remaining: X={self.pieces_on_board[1]}  O={self.pieces_on_board[2]}")

        if self.pending_removal:
            print(f"  ** Remove one of your opponent's pieces! **")
        print()

        # Column headers
        header = "     "
        for c in range(self.COLS):
            header += f" {c + 1}  "
        print(header)
        print("    +" + "---+" * self.COLS)

        for r in range(self.ROWS):
            row_str = f"  {r + 1} |"
            for c in range(self.COLS):
                row_str += f" {s[self.board[r][c]]} |"
            print(row_str)
            print("    +" + "---+" * self.COLS)
        print()

    # --------------------------------------------------------------- helpers
    def _has_three_in_a_row(self, row, col, player):
        """Check if placing/moving to (row, col) creates 3 in a row for player."""
        # Check horizontal runs through this cell
        for start_c in range(max(0, col - 2), min(self.COLS - 2, col) + 1):
            if all(self.board[row][start_c + i] == player for i in range(3)):
                return True
        # Check vertical runs through this cell
        for start_r in range(max(0, row - 2), min(self.ROWS - 2, row) + 1):
            if all(self.board[start_r + i][col] == player for i in range(3)):
                return True
        return False

    def _count_three_in_a_rows_at(self, row, col, player):
        """Count how many three-in-a-row lines pass through (row, col) for player."""
        count = 0
        for start_c in range(max(0, col - 2), min(self.COLS - 2, col) + 1):
            if all(self.board[row][start_c + i] == player for i in range(3)):
                count += 1
        for start_r in range(max(0, row - 2), min(self.ROWS - 2, row) + 1):
            if all(self.board[start_r + i][col] == player for i in range(3)):
                count += 1
        return count

    def _is_in_three_in_a_row(self, row, col, player):
        """Check if the piece at (row, col) is part of any three-in-a-row."""
        return self._count_three_in_a_rows_at(row, col, player) > 0

    def _get_adjacent(self, row, col):
        """Return list of orthogonally adjacent (row, col) positions."""
        adj = []
        for dr, dc in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
            nr, nc = row + dr, col + dc
            if 0 <= nr < self.ROWS and 0 <= nc < self.COLS:
                adj.append((nr, nc))
        return adj

    def _player_can_move(self, player):
        """Check if player has any legal move in movement phase."""
        for r in range(self.ROWS):
            for c in range(self.COLS):
                if self.board[r][c] == player:
                    for nr, nc in self._get_adjacent(r, c):
                        if self.board[nr][nc] == 0:
                            return True
        return False

    def _opponent_has_removable_piece(self, opponent):
        """Check if opponent has any piece not in a three-in-a-row."""
        for r in range(self.ROWS):
            for c in range(self.COLS):
                if self.board[r][c] == opponent:
                    if not self._is_in_three_in_a_row(r, c, opponent):
                        return True
        return False

    # --------------------------------------------------------------- get_move
    def get_move(self):
        """Get move from current player."""
        player = self.current_player
        sym = self.SYMBOLS[player]

        if self.pending_removal:
            return self._get_removal_move()

        if self.phase == 1:
            return self._get_placement_move()
        else:
            return self._get_movement_move()

    def _get_removal_move(self):
        """Get a piece to remove from the opponent."""
        opponent = 3 - self.current_player
        while True:
            raw = input_with_quit(
                f"  {self.players[self.current_player - 1]}, remove opponent piece (row,col): "
            )
            try:
                parts = raw.strip().split(",")
                r, c = int(parts[0]) - 1, int(parts[1]) - 1
                if not (0 <= r < self.ROWS and 0 <= c < self.COLS):
                    print("  Out of bounds.")
                    continue
                if self.board[r][c] != opponent:
                    print("  That's not an opponent's piece.")
                    continue
                # Can't remove a piece that's in a three-in-a-row (if other pieces available)
                if self._is_in_three_in_a_row(r, c, opponent):
                    if self._opponent_has_removable_piece(opponent):
                        print("  Can't remove a piece that's part of a three-in-a-row.")
                        continue
                return ("remove", r, c)
            except (ValueError, IndexError):
                print("  Invalid input. Enter row,col (e.g. '3,4').")

    def _get_placement_move(self):
        """Get placement position during phase 1."""
        while True:
            raw = input_with_quit(
                f"  {self.players[self.current_player - 1]}, place piece (row,col): "
            )
            try:
                parts = raw.strip().split(",")
                r, c = int(parts[0]) - 1, int(parts[1]) - 1
                if not (0 <= r < self.ROWS and 0 <= c < self.COLS):
                    print("  Out of bounds.")
                    continue
                if self.board[r][c] != 0:
                    print("  That square is occupied.")
                    continue
                return ("place", r, c)
            except (ValueError, IndexError):
                print("  Invalid input. Enter row,col (e.g. '3,4').")

    def _get_movement_move(self):
        """Get from/to positions during phase 2."""
        while True:
            raw = input_with_quit(
                f"  {self.players[self.current_player - 1]}, move piece (from_row,col to_row,col): "
            )
            try:
                parts = raw.strip().split()
                if len(parts) != 2:
                    print("  Enter: row,col row,col (e.g. '3,4 3,5').")
                    continue
                fr, fc = [int(x) - 1 for x in parts[0].split(",")]
                tr, tc = [int(x) - 1 for x in parts[1].split(",")]
                if not (0 <= fr < self.ROWS and 0 <= fc < self.COLS):
                    print("  From position out of bounds.")
                    continue
                if not (0 <= tr < self.ROWS and 0 <= tc < self.COLS):
                    print("  To position out of bounds.")
                    continue
                return ("move", fr, fc, tr, tc)
            except (ValueError, IndexError):
                print("  Invalid input. Enter: row,col row,col (e.g. '3,4 3,5').")

    # -------------------------------------------------------------- make_move
    def make_move(self, move):
        """Apply a move. Returns True if valid."""
        if move[0] == "remove":
            return self._do_removal(move)
        elif move[0] == "place":
            return self._do_placement(move)
        elif move[0] == "move":
            return self._do_movement(move)
        return False

    def _do_removal(self, move):
        """Remove an opponent's piece."""
        _, r, c = move
        opponent = 3 - self.current_player
        if self.board[r][c] != opponent:
            return False
        # Can't remove piece in three-in-a-row if alternatives exist
        if self._is_in_three_in_a_row(r, c, opponent):
            if self._opponent_has_removable_piece(opponent):
                return False
        self.board[r][c] = 0
        self.pieces_on_board[opponent] -= 1
        self.pending_removal = False
        return True

    def _do_placement(self, move):
        """Place a piece during phase 1."""
        _, r, c = move
        player = self.current_player
        if self.board[r][c] != 0:
            return False
        if self.pieces_placed[player] >= self.PIECES_PER_PLAYER:
            return False

        # Temporarily place to check three-in-a-row constraint
        self.board[r][c] = player
        if self._has_three_in_a_row(r, c, player):
            # Not allowed during placement phase
            self.board[r][c] = 0
            print("  Cannot form three in a row during placement phase!")
            return False

        # Placement is valid
        self.pieces_placed[player] += 1
        self.pieces_on_board[player] += 1

        # Check if placement phase is over
        if (self.pieces_placed[1] >= self.PIECES_PER_PLAYER and
                self.pieces_placed[2] >= self.PIECES_PER_PLAYER):
            self.phase = 2

        return True

    def _do_movement(self, move):
        """Move a piece during phase 2."""
        _, fr, fc, tr, tc = move
        player = self.current_player

        if self.board[fr][fc] != player:
            print("  That's not your piece.")
            return False
        if self.board[tr][tc] != 0:
            print("  Destination is not empty.")
            return False
        # Must be orthogonally adjacent
        if (tr, tc) not in self._get_adjacent(fr, fc):
            print("  Must move to an adjacent square (up/down/left/right).")
            return False

        # Make the move
        self.board[fr][fc] = 0
        self.board[tr][tc] = player

        # Check if this forms three in a row
        if self._has_three_in_a_row(tr, tc, player):
            self.pending_removal = True

        return True

    # -------------------------------------------------------- check_game_over
    def check_game_over(self):
        """Check if the game is over."""
        if self.pending_removal:
            return  # Still need to remove a piece

        if self.phase == 2:
            # Win by reducing opponent to 2 pieces
            opponent = 3 - self.current_player
            if self.pieces_on_board[opponent] <= 2:
                self.game_over = True
                self.winner = self.current_player
                return

            # Win by blocking opponent (checked for the NEXT player)
            next_player = 3 - self.current_player
            if not self._player_can_move(next_player):
                self.game_over = True
                self.winner = self.current_player
                return

    # -------------------------------------------------------- switch_player
    def switch_player(self):
        """Override: don't switch if there's a pending removal."""
        if self.pending_removal:
            return
        super().switch_player()

    # ----------------------------------------------------------- state / save
    def get_state(self):
        """Return serializable game state."""
        return {
            "board": [row[:] for row in self.board],
            "phase": self.phase,
            "pieces_placed": dict(self.pieces_placed),
            "pieces_on_board": dict(self.pieces_on_board),
            "pending_removal": self.pending_removal,
        }

    def load_state(self, state):
        """Restore game state from saved data."""
        self.board = [row[:] for row in state["board"]]
        self.phase = state["phase"]
        self.pieces_placed = {int(k): v for k, v in state["pieces_placed"].items()}
        self.pieces_on_board = {int(k): v for k, v in state["pieces_on_board"].items()}
        self.pending_removal = state.get("pending_removal", False)

    # -------------------------------------------------------------- tutorial
    def get_tutorial(self):
        """Return tutorial text for Dara."""
        return """
==============================================================
                      DARA  TUTORIAL
==============================================================

OVERVIEW
  Dara (also called Derrah) is a traditional Nigerian strategy
  game played on a 5x6 grid. Each player has 12 pieces. The
  game has two phases: placement and movement.

--------------------------------------------------------------
BOARD
--------------------------------------------------------------
  The board is a 5-row by 6-column grid. Player 1 uses X and
  Player 2 uses O. Empty squares are shown as dots (.).

--------------------------------------------------------------
PHASE 1: PLACEMENT
--------------------------------------------------------------
  Players alternate placing one piece at a time on any empty
  square. There is one important restriction:

    ** You may NOT form three in a row during placement. **

  Once all 24 pieces (12 per player) are placed, the game
  moves to Phase 2.

  Input: Enter row,col (e.g. '3,4' for row 3, column 4).

--------------------------------------------------------------
PHASE 2: MOVEMENT
--------------------------------------------------------------
  Players take turns moving one of their pieces to an adjacent
  empty square. Movement is orthogonal only (up, down, left,
  right -- no diagonals).

  Input: Enter from and to positions separated by a space
         (e.g. '3,4 3,5' to move from row 3 col 4 to row 3
         col 5).

--------------------------------------------------------------
FORMING THREE IN A ROW
--------------------------------------------------------------
  During the movement phase, if you form exactly three of your
  pieces in a row (horizontal or vertical), you MUST remove
  one of your opponent's pieces from the board.

  Restriction: You cannot remove an opponent's piece that is
  itself part of a three-in-a-row, unless ALL of the
  opponent's pieces are in three-in-a-rows.

--------------------------------------------------------------
WINNING
--------------------------------------------------------------
  You win by either:
    1. Reducing your opponent to only 2 pieces, or
    2. Blocking your opponent so they have no legal moves.

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
  - During placement, spread your pieces out to give yourself
    many movement options in Phase 2.
  - Try to create positions where a single move can form
    three in a row in multiple ways (a fork).
  - Keep your pieces connected so they can support each other.
  - Be mindful of which of your opponent's pieces you remove;
    choose pieces that break their formations.
==============================================================
"""
