"""Stratego - A classic two-player strategy board game of hidden information."""

from engine.base import BaseGame, input_with_quit, clear_screen


# Piece definitions: (symbol, count_per_player)
STANDARD_PIECES = {
    "F": 1,   # Flag
    "B": 6,   # Bomb
    "1": 1,   # Spy
    "2": 8,   # Scout
    "3": 5,   # Miner
    "4": 4,   # Sergeant
    "5": 4,   # Lieutenant
    "6": 4,   # Captain
    "7": 3,   # Major
    "8": 2,   # Colonel
    "9": 1,   # General
    "10": 1,  # Marshal
}

QUICK_PIECES = {
    "F": 1,
    "B": 3,
    "1": 1,
    "2": 4,
    "3": 3,
    "4": 2,
    "5": 2,
    "6": 2,
    "7": 1,
    "8": 1,
}

# Standard lakes on 10x10 board (row, col)
STANDARD_LAKES = {
    (4, 2), (5, 2), (4, 3), (5, 3),
    (4, 6), (5, 6), (4, 7), (5, 7),
}

# Quick lakes on 8x8 board
QUICK_LAKES = {
    (3, 2), (4, 2), (3, 5), (4, 5),
}

RANK_NAMES = {
    "F": "Flag",
    "B": "Bomb",
    "1": "Spy",
    "2": "Scout",
    "3": "Miner",
    "4": "Sergeant",
    "5": "Lieutenant",
    "6": "Captain",
    "7": "Major",
    "8": "Colonel",
    "9": "General",
    "10": "Marshal",
}


class StrategoGame(BaseGame):
    """Stratego: A two-player strategy game of hidden information."""

    name = "Stratego"
    description = "A classic strategy game - find and capture the enemy flag"
    min_players = 2
    max_players = 2
    variations = {
        "standard": "Standard Stratego (10x10)",
        "quick": "Quick Stratego (8x8, fewer pieces)",
    }

    def __init__(self, variation=None):
        super().__init__(variation)
        self.board_size = 10 if self.variation == "standard" else 8
        self.board = []  # board[row][col] = None or (player, rank)
        self.lakes = set()
        self.last_battle_msg = ""

    def setup(self):
        """Initialize the board and auto-place pieces."""
        size = self.board_size
        self.board = [[None for _ in range(size)] for _ in range(size)]

        if self.variation == "standard":
            self.lakes = set(STANDARD_LAKES)
            pieces = STANDARD_PIECES
            p1_rows = range(0, 4)
            p2_rows = range(6, 10)
        else:
            self.lakes = set(QUICK_LAKES)
            pieces = QUICK_PIECES
            p1_rows = range(0, 3)
            p2_rows = range(5, 8)

        p1_pieces = self._build_piece_list(pieces)
        p2_pieces = self._build_piece_list(pieces)

        self._place_formation(p1_pieces, p1_rows, player=1)
        self._place_formation(p2_pieces, p2_rows, player=2)

    def _build_piece_list(self, piece_counts):
        """Build a flat list of piece ranks from the count dictionary."""
        pieces = []
        for rank, count in piece_counts.items():
            pieces.extend([rank] * count)
        return pieces

    def _place_formation(self, pieces, rows, player):
        """Place pieces in a standard formation across the given rows."""
        size = self.board_size
        idx = 0
        row_list = list(rows)
        if player == 2:
            row_list = list(reversed(row_list))

        # Place flag in back row center, surrounded by bombs
        back_row = row_list[0]
        flag_col = size // 2

        # Build a formation: flag in back, bombs around it, then others
        ordered = []
        remaining = list(pieces)

        # Pull out flag and bombs
        flags = [r for r in remaining if r == "F"]
        bombs = [r for r in remaining if r == "B"]
        others = [r for r in remaining if r not in ("F", "B")]

        # Sort others by rank descending (strongest in back)
        def rank_sort_key(r):
            try:
                return int(r)
            except ValueError:
                return 0
        others.sort(key=rank_sort_key, reverse=True)

        # Place flag first, then bombs around it, then ranked pieces
        ordered = flags + bombs + others

        idx = 0
        for row in row_list:
            for col in range(size):
                if idx < len(ordered):
                    self.board[row][col] = (player, ordered[idx])
                    idx += 1

    def display(self):
        """Display the board from current player's perspective."""
        size = self.board_size
        variant = "Standard" if self.variation == "standard" else "Quick"
        print(f"\n  === Stratego ({variant} {size}x{size}) ===")
        print(f"  {self.players[0]} (P1) vs {self.players[1]} (P2)")
        print(f"  Current turn: {self.players[self.current_player - 1]} (P{self.current_player})")

        if self.last_battle_msg:
            print(f"  Last battle: {self.last_battle_msg}")

        # Column headers
        col_header = "     " + "".join(f" {c:2d} " for c in range(size))
        print(col_header)
        print("    +" + "----" * size + "+")

        for row in range(size):
            row_str = f" {row:2d} |"
            for col in range(size):
                if (row, col) in self.lakes:
                    row_str += " ~~ "
                elif self.board[row][col] is None:
                    row_str += "  . "
                else:
                    player, rank = self.board[row][col]
                    if player == self.current_player:
                        row_str += f" {rank:>2s} "
                    else:
                        row_str += "  ? "
            row_str += "|"
            print(row_str)

        print("    +" + "----" * size + "+")
        print()

    def get_move(self):
        """Get move as 'from_row from_col to_row to_col'."""
        player_name = self.players[self.current_player - 1]
        print(f"  {player_name}, enter your move.")
        print("  Format: from_row from_col to_row to_col (e.g. '3 4 4 4')")
        move_str = input_with_quit("  Your move: ").strip()
        return move_str

    def make_move(self, move):
        """Apply move. Returns True if valid."""
        try:
            parts = move.split()
            if len(parts) != 4:
                print("  Please enter exactly 4 numbers: from_row from_col to_row to_col")
                return False
            fr, fc, tr, tc = int(parts[0]), int(parts[1]), int(parts[2]), int(parts[3])
        except (ValueError, IndexError):
            print("  Invalid input. Use numbers for row and column.")
            return False

        size = self.board_size
        player = self.current_player

        # Bounds check
        if not (0 <= fr < size and 0 <= fc < size and 0 <= tr < size and 0 <= tc < size):
            print("  Coordinates out of bounds.")
            return False

        # Must have own piece at source
        piece = self.board[fr][fc]
        if piece is None or piece[0] != player:
            print("  No friendly piece at that position.")
            return False

        rank = piece[1]

        # Bombs and flag cannot move
        if rank in ("B", "F"):
            print("  Bombs and Flags cannot move.")
            return False

        # Cannot move onto lakes
        if (tr, tc) in self.lakes:
            print("  Cannot move onto a lake.")
            return False

        # Cannot move onto friendly piece
        target = self.board[tr][tc]
        if target is not None and target[0] == player:
            print("  Cannot move onto your own piece.")
            return False

        # Movement validation
        dr = tr - fr
        dc = tc - fc

        if dr != 0 and dc != 0:
            print("  Pieces can only move orthogonally (not diagonally).")
            return False

        if dr == 0 and dc == 0:
            print("  You must move to a different square.")
            return False

        distance = abs(dr) + abs(dc)

        if rank == "2":
            # Scout: can move multiple squares in a straight line
            if distance < 1:
                print("  Invalid move distance.")
                return False
            # Check path is clear
            step_r = 0 if dr == 0 else (1 if dr > 0 else -1)
            step_c = 0 if dc == 0 else (1 if dc > 0 else -1)
            cr, cc = fr + step_r, fc + step_c
            while (cr, cc) != (tr, tc):
                if (cr, cc) in self.lakes:
                    print("  Path is blocked by a lake.")
                    return False
                if self.board[cr][cc] is not None:
                    print("  Path is blocked by another piece.")
                    return False
                cr += step_r
                cc += step_c
        else:
            # All other movable pieces: exactly 1 square
            if distance != 1:
                print("  This piece can only move one square.")
                return False

        # Execute move
        if target is not None:
            # Battle!
            self._resolve_battle(fr, fc, tr, tc)
        else:
            # Simple move
            self.board[tr][tc] = self.board[fr][fc]
            self.board[fr][fc] = None
            self.last_battle_msg = ""

        return True

    def _resolve_battle(self, fr, fc, tr, tc):
        """Resolve an attack between two pieces."""
        attacker = self.board[fr][fc]
        defender = self.board[tr][tc]
        a_player, a_rank = attacker
        d_player, d_rank = defender

        a_name = RANK_NAMES.get(a_rank, a_rank)
        d_name = RANK_NAMES.get(d_rank, d_rank)

        # Special case: attacking a bomb
        if d_rank == "B":
            if a_rank == "3":
                # Miner defuses bomb
                self.board[tr][tc] = attacker
                self.board[fr][fc] = None
                self.last_battle_msg = f"{a_name}({a_rank}) defused {d_name}! Miner survives."
            else:
                # Bomb destroys attacker
                self.board[fr][fc] = None
                self.last_battle_msg = f"{a_name}({a_rank}) hit a {d_name}! Attacker destroyed."
            return

        # Special case: attacking the flag
        if d_rank == "F":
            self.board[tr][tc] = attacker
            self.board[fr][fc] = None
            self.last_battle_msg = f"{a_name}({a_rank}) captured the {d_name}!"
            return

        # Special case: spy attacks marshal
        if a_rank == "1" and d_rank == "10":
            self.board[tr][tc] = attacker
            self.board[fr][fc] = None
            self.last_battle_msg = f"{a_name} assassinated the {d_name}!"
            return

        # Normal combat: higher rank wins
        try:
            a_val = int(a_rank)
        except ValueError:
            a_val = 0
        try:
            d_val = int(d_rank)
        except ValueError:
            d_val = 0

        if a_val > d_val:
            self.board[tr][tc] = attacker
            self.board[fr][fc] = None
            self.last_battle_msg = f"{a_name}({a_rank}) defeated {d_name}({d_rank}). Attacker wins!"
        elif a_val < d_val:
            self.board[fr][fc] = None
            self.last_battle_msg = f"{a_name}({a_rank}) lost to {d_name}({d_rank}). Defender wins!"
        else:
            self.board[fr][fc] = None
            self.board[tr][tc] = None
            self.last_battle_msg = f"{a_name}({a_rank}) vs {d_name}({d_rank}). Both destroyed!"

    def check_game_over(self):
        """Check if a flag is captured or a player cannot move."""
        size = self.board_size

        # Check if each player still has a flag
        p1_flag = False
        p2_flag = False
        p1_can_move = False
        p2_can_move = False

        for row in range(size):
            for col in range(size):
                cell = self.board[row][col]
                if cell is None:
                    continue
                player, rank = cell
                if rank == "F":
                    if player == 1:
                        p1_flag = True
                    else:
                        p2_flag = True
                # Check if this piece can move
                if rank not in ("B", "F"):
                    if player == 1 and not p1_can_move:
                        if self._has_valid_move(row, col, player):
                            p1_can_move = True
                    elif player == 2 and not p2_can_move:
                        if self._has_valid_move(row, col, player):
                            p2_can_move = True

        if not p1_flag:
            self.game_over = True
            self.winner = 2
        elif not p2_flag:
            self.game_over = True
            self.winner = 1
        elif not p1_can_move and self.current_player == 1:
            self.game_over = True
            self.winner = 2
        elif not p2_can_move and self.current_player == 2:
            self.game_over = True
            self.winner = 1

    def _has_valid_move(self, row, col, player):
        """Check if a piece at (row, col) has at least one valid move."""
        size = self.board_size
        for dr, dc in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
            nr, nc = row + dr, col + dc
            if 0 <= nr < size and 0 <= nc < size:
                if (nr, nc) not in self.lakes:
                    target = self.board[nr][nc]
                    if target is None or target[0] != player:
                        return True
        return False

    def get_state(self):
        """Return serializable game state."""
        return {
            "board_size": self.board_size,
            "board": self.board,
            "lakes": [list(pos) for pos in self.lakes],
            "last_battle_msg": self.last_battle_msg,
        }

    def load_state(self, state):
        """Restore game state."""
        self.board_size = state["board_size"]
        self.board = state["board"]
        # Convert lists back to tuples for piece representation
        for row in range(self.board_size):
            for col in range(self.board_size):
                cell = self.board[row][col]
                if cell is not None:
                    self.board[row][col] = tuple(cell)
        self.lakes = {tuple(pos) for pos in state["lakes"]}
        self.last_battle_msg = state.get("last_battle_msg", "")

    def get_tutorial(self):
        """Return tutorial with rules and strategy hints."""
        return """
==================================================
  Stratego - Tutorial
==================================================

  OVERVIEW:
  - Stratego is a two-player strategy game of
    hidden information on a 10x10 board.
  - Each player has 40 pieces of various ranks.
  - The goal is to capture your opponent's Flag.

  PIECES (rank: name, count):
  - 10: Marshal (1)     - Highest rank
  -  9: General (1)
  -  8: Colonel (2)
  -  7: Major (3)
  -  6: Captain (4)
  -  5: Lieutenant (4)
  -  4: Sergeant (4)
  -  3: Miner (5)       - Can defuse Bombs
  -  2: Scout (8)       - Moves multiple squares
  -  1: Spy (1)         - Kills Marshal on attack
  -  B: Bomb (6)        - Cannot move, destroys attackers
  -  F: Flag (1)        - Cannot move, capture to win

  MOVEMENT:
  - Pieces move one square orthogonally (up, down,
    left, right). No diagonal movement.
  - Scouts (2) can move any number of squares in a
    straight line (like a rook in chess).
  - Bombs and Flags cannot move.
  - Pieces cannot enter lake squares (marked ~~).
  - Pieces cannot move onto friendly pieces.

  COMBAT:
  - Move onto an opponent's piece to attack.
  - Higher rank wins; lower rank is removed.
  - If ranks are equal, both pieces are removed.

  SPECIAL RULES:
  - Spy (1) defeats Marshal (10) when the Spy
    attacks, but loses if the Marshal attacks.
  - Miners (3) can defuse Bombs and survive.
  - All other pieces that attack a Bomb are
    destroyed (the Bomb remains).

  HOW TO ENTER MOVES:
  - Format: from_row from_col to_row to_col
  - Example: "3 4 4 4" moves the piece at row 3,
    column 4 to row 4, column 4.

  DISPLAY:
  - Your pieces show their rank number/letter.
  - Opponent pieces appear as '?'.
  - Lakes are shown as '~~'.
  - Empty squares are shown as '.'.

  STRATEGY HINTS:
  - Protect your Flag by surrounding it with Bombs.
  - Use Scouts to probe enemy positions from afar.
  - Keep your Miners alive to defuse enemy Bombs.
  - Your Spy is fragile but invaluable against the
    Marshal. Guard it carefully.
  - Sacrifice lower-ranked pieces to discover the
    identity of opponent pieces.

  VARIATIONS:
  - Standard: 10x10 board, 40 pieces per player.
  - Quick: 8x8 board with fewer pieces for a
    faster game.

==================================================
"""
