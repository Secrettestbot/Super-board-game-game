"""Yoté - West African strategy game of placement, movement, and capture."""

from engine.base import BaseGame, input_with_quit, clear_screen


class YoteGame(BaseGame):
    """Yoté: West African two-player strategy game with a unique capture mechanic."""

    name = "Yoté"
    description = "West African strategy game - place and move pieces with powerful capture jumps"
    min_players = 2
    max_players = 2
    variations = {
        "standard": "Standard Yoté (5x6 board, 12 pieces each)",
        "small": "Small Yoté (4x5 board, 8 pieces each)",
    }

    SYMBOLS = {0: " ", 1: "\u25cf", 2: "\u25cb"}  # ● and ○

    BOARD_CONFIGS = {
        "standard": {"rows": 5, "cols": 6, "pieces": 12},
        "small": {"rows": 4, "cols": 5, "pieces": 8},
    }

    def __init__(self, variation=None):
        super().__init__(variation or "standard")
        config = self.BOARD_CONFIGS.get(self.variation, self.BOARD_CONFIGS["standard"])
        self.rows = config["rows"]
        self.cols = config["cols"]
        self.total_pieces = config["pieces"]

    # ------------------------------------------------------------------ setup
    def setup(self):
        """Initialize empty board and reserves."""
        self.board = [[0] * self.cols for _ in range(self.rows)]
        self.reserve = {1: self.total_pieces, 2: self.total_pieces}
        self.pieces_on_board = {1: 0, 2: 0}
        self.pending_removal = False  # True after a capture, awaiting bonus removal

    # --------------------------------------------------------------- helpers
    def _row_label(self, r):
        """Convert row index to label (a, b, c, ...)."""
        return chr(ord('a') + r)

    def _parse_row_label(self, label):
        """Convert row label to index. Returns -1 if invalid."""
        label = label.strip().lower()
        if len(label) == 1 and 'a' <= label <= chr(ord('a') + self.rows - 1):
            return ord(label) - ord('a')
        return -1

    def _parse_cell(self, text):
        """Parse a cell reference like 'a3' into (row, col). Returns None if invalid."""
        text = text.strip().lower()
        if len(text) < 2:
            return None
        row_label = text[0]
        col_str = text[1:]
        r = self._parse_row_label(row_label)
        if r < 0:
            return None
        try:
            c = int(col_str) - 1
        except ValueError:
            return None
        if not (0 <= c < self.cols):
            return None
        return (r, c)

    def _get_adjacent(self, r, c):
        """Return list of orthogonally adjacent (row, col) positions."""
        adj = []
        for dr, dc in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
            nr, nc = r + dr, c + dc
            if 0 <= nr < self.rows and 0 <= nc < self.cols:
                adj.append((nr, nc))
        return adj

    def _is_capture_move(self, fr, fc, tr, tc):
        """Check if a move from (fr,fc) to (tr,tc) is a valid capture jump.

        Returns the position of the captured piece (mr, mc) or None.
        """
        dr = tr - fr
        dc = tc - fc
        # Must be exactly 2 squares away in one orthogonal direction
        if not ((abs(dr) == 2 and dc == 0) or (dr == 0 and abs(dc) == 2)):
            return None
        mr, mc = fr + dr // 2, fc + dc // 2
        opponent = 3 - self.current_player
        if self.board[mr][mc] != opponent:
            return None
        if self.board[tr][tc] != 0:
            return None
        return (mr, mc)

    def _player_has_moves(self, player):
        """Check if a player can place or move any piece."""
        # Can place from reserve
        if self.reserve[player] > 0:
            for r in range(self.rows):
                for c in range(self.cols):
                    if self.board[r][c] == 0:
                        return True
        # Can move a piece on the board
        for r in range(self.rows):
            for c in range(self.cols):
                if self.board[r][c] == player:
                    for nr, nc in self._get_adjacent(r, c):
                        if self.board[nr][nc] == 0:
                            return True
                    # Check capture jumps
                    for dr, dc in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
                        nr, nc = r + 2 * dr, c + 2 * dc
                        mr, mc = r + dr, c + dc
                        if (0 <= nr < self.rows and 0 <= nc < self.cols
                                and self.board[mr][mc] == 3 - player
                                and self.board[nr][nc] == 0):
                            return True
        return False

    def _player_total_pieces(self, player):
        """Total pieces a player has (reserve + on board)."""
        return self.reserve[player] + self.pieces_on_board[player]

    def _opponent_has_pieces_on_board(self, opponent):
        """Check if opponent has any pieces on the board."""
        return self.pieces_on_board[opponent] > 0

    # --------------------------------------------------------------- display
    def display(self):
        """Display the current game state."""
        s = self.SYMBOLS
        var_label = "Standard" if self.variation == "standard" else "Small"
        print(f"\n  === Yot\u00e9 ({var_label}) ===")
        print(f"  {self.players[0]} ({s[1]}) vs {self.players[1]} ({s[2]})")
        print(f"  Reserve: {s[1]} x{self.reserve[1]}  |  {s[2]} x{self.reserve[2]}")

        if self.pending_removal:
            print(f"  ** {self.players[self.current_player - 1]}: Remove an opponent's piece! **")
        print()

        # Column headers
        header = "    "
        for c in range(self.cols):
            header += f" {c + 1}  "
        print(header)

        for r in range(self.rows):
            row_str = f"  {self._row_label(r)} "
            for c in range(self.cols):
                row_str += f"[{s[self.board[r][c]]}] "
            print(row_str)
        print()

    # --------------------------------------------------------------- get_move
    def get_move(self):
        """Get move from current player."""
        if self.pending_removal:
            return self._get_removal_input()

        player = self.current_player
        sym = self.SYMBOLS[player]
        name = self.players[player - 1]

        can_place = self.reserve[player] > 0
        can_move = self.pieces_on_board[player] > 0

        while True:
            if can_place and can_move:
                prompt = f"  {name} ({sym}), enter 'place row col' or 'from to' (e.g. a2 a3): "
            elif can_place:
                prompt = f"  {name} ({sym}), enter 'place row col' (e.g. place a 3): "
            else:
                prompt = f"  {name} ({sym}), enter move 'from to' (e.g. a2 a3): "

            raw = input_with_quit(prompt).strip().lower()

            if raw.startswith("place"):
                if not can_place:
                    print("  No pieces left in reserve to place.")
                    continue
                parts = raw.split()
                if len(parts) != 3:
                    print("  Format: place row col (e.g. 'place a 3')")
                    continue
                r = self._parse_row_label(parts[1])
                if r < 0:
                    print(f"  Invalid row. Use {self._row_label(0)}-{self._row_label(self.rows - 1)}.")
                    continue
                try:
                    c = int(parts[2]) - 1
                except ValueError:
                    print(f"  Invalid column. Use 1-{self.cols}.")
                    continue
                if not (0 <= c < self.cols):
                    print(f"  Column out of range. Use 1-{self.cols}.")
                    continue
                if self.board[r][c] != 0:
                    print("  That cell is occupied.")
                    continue
                return ("place", r, c)
            else:
                # Parse as "from to" move (e.g. "a2 a3" or "a2 a4")
                parts = raw.split()
                if len(parts) != 2:
                    print("  Format: 'place row col' or 'from to' (e.g. 'a2 a3').")
                    continue
                from_cell = self._parse_cell(parts[0])
                to_cell = self._parse_cell(parts[1])
                if from_cell is None:
                    print("  Invalid 'from' cell. Use format like 'a2'.")
                    continue
                if to_cell is None:
                    print("  Invalid 'to' cell. Use format like 'a3'.")
                    continue
                fr, fc = from_cell
                tr, tc = to_cell
                if self.board[fr][fc] != player:
                    print("  That's not your piece.")
                    continue
                return ("move", fr, fc, tr, tc)

    def _get_removal_input(self):
        """Prompt current player to remove an opponent's piece (bonus removal)."""
        opponent = 3 - self.current_player
        name = self.players[self.current_player - 1]
        while True:
            raw = input_with_quit(
                f"  {name}, remove an opponent's piece (row col, e.g. 'a 3'): "
            ).strip().lower()
            parts = raw.split()
            if len(parts) != 2:
                print("  Format: row col (e.g. 'a 3')")
                continue
            r = self._parse_row_label(parts[0])
            if r < 0:
                print(f"  Invalid row. Use {self._row_label(0)}-{self._row_label(self.rows - 1)}.")
                continue
            try:
                c = int(parts[1]) - 1
            except ValueError:
                print(f"  Invalid column. Use 1-{self.cols}.")
                continue
            if not (0 <= c < self.cols):
                print(f"  Column out of range. Use 1-{self.cols}.")
                continue
            if self.board[r][c] != opponent:
                print("  That cell does not contain an opponent's piece.")
                continue
            return ("remove", r, c)

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
        """Remove an opponent's piece as the bonus after a capture."""
        _, r, c = move
        opponent = 3 - self.current_player
        if self.board[r][c] != opponent:
            return False
        self.board[r][c] = 0
        self.pieces_on_board[opponent] -= 1
        self.pending_removal = False
        return True

    def _do_placement(self, move):
        """Place a piece from reserve onto the board."""
        _, r, c = move
        player = self.current_player
        if self.board[r][c] != 0:
            return False
        if self.reserve[player] <= 0:
            return False
        self.board[r][c] = player
        self.reserve[player] -= 1
        self.pieces_on_board[player] += 1
        return True

    def _do_movement(self, move):
        """Move a piece on the board, possibly capturing."""
        _, fr, fc, tr, tc = move
        player = self.current_player

        if self.board[fr][fc] != player:
            return False

        # Check for simple adjacent move
        if (tr, tc) in self._get_adjacent(fr, fc):
            if self.board[tr][tc] != 0:
                print("  Destination is not empty.")
                return False
            self.board[fr][fc] = 0
            self.board[tr][tc] = player
            return True

        # Check for capture jump
        captured = self._is_capture_move(fr, fc, tr, tc)
        if captured is not None:
            mr, mc = captured
            opponent = 3 - player
            self.board[fr][fc] = 0
            self.board[mr][mc] = 0
            self.board[tr][tc] = player
            self.pieces_on_board[opponent] -= 1
            # Trigger bonus removal if opponent still has pieces on the board
            if self.pieces_on_board[opponent] > 0:
                self.pending_removal = True
            return True

        print("  Invalid move. Move to an adjacent cell or jump over an opponent's piece.")
        return False

    # -------------------------------------------------------- switch_player
    def switch_player(self):
        """Override: don't switch if there's a pending removal."""
        if self.pending_removal:
            return
        super().switch_player()

    # -------------------------------------------------------- check_game_over
    def check_game_over(self):
        """Check if the game is over."""
        if self.pending_removal:
            return  # Still need to remove a piece

        # Check if either player has no pieces at all
        for p in [1, 2]:
            if self._player_total_pieces(p) == 0:
                self.game_over = True
                self.winner = 3 - p
                return

        # Check if the next player has no legal moves
        next_player = 3 - self.current_player
        if not self._player_has_moves(next_player):
            self.game_over = True
            self.winner = self.current_player
            return

    # ----------------------------------------------------------- state / save
    def get_state(self):
        """Return serializable game state."""
        return {
            "board": [row[:] for row in self.board],
            "reserve": {str(k): v for k, v in self.reserve.items()},
            "pieces_on_board": {str(k): v for k, v in self.pieces_on_board.items()},
            "pending_removal": self.pending_removal,
            "rows": self.rows,
            "cols": self.cols,
            "total_pieces": self.total_pieces,
        }

    def load_state(self, state):
        """Restore game state from saved data."""
        self.board = [row[:] for row in state["board"]]
        self.reserve = {int(k): v for k, v in state["reserve"].items()}
        self.pieces_on_board = {int(k): v for k, v in state["pieces_on_board"].items()}
        self.pending_removal = state.get("pending_removal", False)
        self.rows = state.get("rows", 5)
        self.cols = state.get("cols", 6)
        self.total_pieces = state.get("total_pieces", 12)

    # -------------------------------------------------------------- tutorial
    def get_tutorial(self):
        """Return tutorial text for Yoté."""
        return """
==============================================================
                     YOT\u00c9  TUTORIAL
==============================================================

OVERVIEW
  Yot\u00e9 is a traditional West African strategy game originating
  from Senegal and neighboring countries. It is a game of
  placement, movement, and a devastating capture mechanic that
  makes every piece precious.

--------------------------------------------------------------
BOARD & PIECES
--------------------------------------------------------------
  Standard: 5 rows (a-e) x 6 columns (1-6), 12 pieces each.
  Small:    4 rows (a-d) x 5 columns (1-5), 8 pieces each.

  Player 1 uses \u25cf (filled circles).
  Player 2 uses \u25cb (open circles).
  Empty cells are shown as [ ].

  Each player begins with all pieces in reserve (off-board).

--------------------------------------------------------------
TURNS
--------------------------------------------------------------
  Players alternate turns. On your turn you must do ONE of:

  1. PLACE a piece from your reserve onto any empty cell.
     Input: place row col
     Example: place a 3  (places on row a, column 3)

  2. MOVE one of your pieces already on the board to an
     adjacent empty cell (up, down, left, or right -- no
     diagonals).
     Input: from to
     Example: a2 a3  (move piece from a2 to a3)

--------------------------------------------------------------
CAPTURING
--------------------------------------------------------------
  Instead of a simple move, you may JUMP over an adjacent
  opponent's piece and land on the empty cell beyond it
  (orthogonally, exactly like checkers but only in straight
  lines -- no diagonals).

  Input: from to  (where 'to' is two squares away)
  Example: a2 a4  (jump from a2 over a3 to a4)

  The jumped piece is removed from the game.

  ** BONUS REMOVAL **  (This is the key mechanic!)
  After a capture, you MUST also remove one additional
  opponent piece of your choice from anywhere on the board.
  You will be prompted to select which piece to remove.

  Input when prompted: row col
  Example: c 5  (removes the opponent's piece at c5)

  This means every capture costs your opponent TWO pieces,
  making captures extremely powerful and dangerous.

--------------------------------------------------------------
WINNING
--------------------------------------------------------------
  You win when your opponent:
    1. Has no pieces left (both on the board and in reserve),
       OR
    2. Cannot make any legal move on their turn.

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
  - Captures are devastating (removing 2 pieces at once), so
    avoid leaving your pieces where they can be jumped.

  - Don't rush to place all your pieces. Keeping pieces in
    reserve means they can't be captured, and you maintain
    flexibility about where to deploy them.

  - Try to keep your pieces close together so they can
    support each other and avoid being isolated.

  - When you earn a bonus removal after a capture, choose
    wisely. Remove a piece that is well-positioned or that
    protects other opponent pieces from future captures.

  - Control the center of the board to maximize your
    movement and capture options.

  - In the endgame, even a one-piece advantage can be
    decisive. Play cautiously when ahead and aggressively
    when behind.
==============================================================
"""
