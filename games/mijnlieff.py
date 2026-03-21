"""Mijnlieff - A strategic tile placement game on a 4x4 grid."""

from engine.base import BaseGame, input_with_quit, clear_screen


class MijnlieffGame(BaseGame):
    """Mijnlieff: place pieces that dictate where your opponent must play next."""

    name = "Mijnlieff"
    description = "Strategic placement game where each piece dictates where your opponent can play next"
    min_players = 2
    max_players = 2
    variations = {
        "standard": "Standard 4x4 Mijnlieff",
    }

    # Piece types per player
    # Player 1: uppercase P, U, S, D
    # Player 2: lowercase p, u, s, d
    PIECE_TYPES = ["P", "U", "S", "D"]
    PIECE_NAMES = {
        "P": "Pusher",
        "U": "Puller",
        "S": "Straight",
        "D": "Diagonal",
    }
    PIECE_SYMBOLS = {
        "P": "\u2191",  # up arrow
        "U": "\u2193",  # down arrow
        "S": "+",
        "D": "\u00d7",  # multiplication sign
    }

    def __init__(self, variation=None):
        super().__init__(variation or "standard")

    # ------------------------------------------------------------------ setup
    def setup(self):
        # 4x4 board, None means empty
        self.board = [[None for _ in range(4)] for _ in range(4)]
        # Each player has 2 of each piece type (8 total)
        self.pieces = {
            1: {"P": 2, "U": 2, "S": 2, "D": 2},
            2: {"P": 2, "U": 2, "S": 2, "D": 2},
        }
        # The constraint imposed by the last placed piece (None = place anywhere)
        self.constraint = None  # Will be (piece_type, row, col) of last placed piece
        self.last_move = None

    # --------------------------------------------------------------- get_move
    def get_move(self):
        player = self.current_player
        while True:
            raw = input_with_quit(
                f"  {self.players[player - 1]}, enter move (type row col, e.g. 'P 2 3'): "
            )
            raw = raw.strip()
            parts = raw.split()
            if len(parts) != 3:
                print("  Invalid format. Use: type row col (e.g. 'P 2 3')")
                continue

            piece_str, row_str, col_str = parts

            # Normalize piece type to uppercase for validation
            piece_type = piece_str.upper()
            if piece_type not in self.PIECE_TYPES:
                print(f"  Invalid piece type '{piece_str}'. Use P, U, S, or D.")
                continue

            try:
                row = int(row_str) - 1
                col = int(col_str) - 1
            except ValueError:
                print("  Row and column must be numbers (1-4).")
                continue

            if not (0 <= row < 4 and 0 <= col < 4):
                print("  Row and column must be between 1 and 4.")
                continue

            if self.board[row][col] is not None:
                print("  That cell is already occupied.")
                continue

            if self.pieces[player][piece_type] <= 0:
                display_letter = piece_type if player == 1 else piece_type.lower()
                print(f"  You have no {display_letter} ({self.PIECE_NAMES[piece_type]}) pieces left.")
                continue

            # Check constraint
            valid = self._get_valid_positions()
            if valid and (row, col) not in valid:
                print("  That position does not satisfy the current placement constraint.")
                continue

            return (piece_type, row, col)

    # -------------------------------------------------------------- make_move
    def make_move(self, move):
        piece_type, row, col = move
        player = self.current_player

        # Place piece on the board
        display_letter = piece_type if player == 1 else piece_type.lower()
        self.board[row][col] = display_letter
        self.pieces[player][piece_type] -= 1

        # Set constraint for the next player based on the piece just placed
        self.constraint = (piece_type, row, col)
        self.last_move = (player, piece_type, row, col)

        return True

    # -------------------------------------------------------- constraint logic
    def _get_valid_positions(self):
        """Get valid positions based on the current constraint.
        Returns a list of (row, col) tuples, or empty list if no constraint
        or no valid constrained positions (meaning play anywhere empty).
        """
        if self.constraint is None:
            return []

        piece_type, pr, pc = self.constraint
        candidates = self._get_constrained_cells(piece_type, pr, pc)

        # Filter to empty cells only
        valid = [(r, c) for r, c in candidates if self.board[r][c] is None]
        return valid

    def _get_constrained_cells(self, piece_type, pr, pc):
        """Get the cells where the opponent must place based on piece_type at (pr, pc)."""
        cells = []

        if piece_type == "P":
            # Pusher: opponent must place in a straight line (orthogonal) from this piece
            # All cells in same row or column (not the piece itself)
            for c in range(4):
                if c != pc:
                    cells.append((pr, c))
            for r in range(4):
                if r != pr:
                    cells.append((r, pc))

        elif piece_type == "U":
            # Puller: opponent must place adjacent (orthogonally) to this piece
            for dr, dc in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
                nr, nc = pr + dr, pc + dc
                if 0 <= nr < 4 and 0 <= nc < 4:
                    cells.append((nr, nc))

        elif piece_type == "S":
            # Straight: opponent must place in a straight line (orthogonal) but NOT adjacent
            # Same row/column but at distance >= 2
            for c in range(4):
                if abs(c - pc) >= 2:
                    cells.append((pr, c))
            for r in range(4):
                if abs(r - pr) >= 2:
                    cells.append((r, pc))

        elif piece_type == "D":
            # Diagonal: opponent must place on a diagonal from this piece
            for dr in [-1, 1]:
                for dc in [-1, 1]:
                    nr, nc = pr + dr, pc + dc
                    while 0 <= nr < 4 and 0 <= nc < 4:
                        cells.append((nr, nc))
                        nr += dr
                        nc += dc

        return cells

    # -------------------------------------------------------- check_game_over
    def check_game_over(self):
        # Check if board is full
        empty_count = sum(1 for r in range(4) for c in range(4) if self.board[r][c] is None)
        if empty_count == 0:
            self._score_and_finish()
            return

        # Check if neither player can place (both out of pieces)
        p1_total = sum(self.pieces[1].values())
        p2_total = sum(self.pieces[2].values())
        if p1_total == 0 and p2_total == 0:
            self._score_and_finish()
            return

        # Check if the next player (already switched by play loop? No -- switch happens
        # after check_game_over returns in the base play loop) has no pieces
        # Actually, switch_player is called AFTER check_game_over in the base loop.
        # So current_player is still the player who just moved.
        # The next player is the other one.
        next_player = 2 if self.current_player == 1 else 1
        next_total = sum(self.pieces[next_player].values())
        if next_total == 0:
            # Next player has no pieces. Check if the current player also has none.
            curr_total = sum(self.pieces[self.current_player].values())
            if curr_total == 0:
                self._score_and_finish()
                return
            # If only next player is out, game still continues -- they'll be skipped
            # Actually in Mijnlieff both players have exactly 8 pieces each and
            # the board has 16 cells, so they'll run out at the same time or the
            # board fills first. But let's handle it generically.
            # If next player can't place, game ends.
            self._score_and_finish()
            return

    def _score_and_finish(self):
        """Calculate scores and determine winner."""
        score1, groups1 = self._calculate_score(1)
        score2, groups2 = self._calculate_score(2)

        self.game_over = True
        self.score1 = score1
        self.score2 = score2
        self.groups1 = groups1
        self.groups2 = groups2

        if score1 > score2:
            self.winner = 1
        elif score2 > score1:
            self.winner = 2
        else:
            self.winner = None  # Draw

    def _calculate_score(self, player):
        """Calculate score for a player.
        Find groups of connected pieces (orthogonal adjacency).
        Each group scores (size)^2 points.
        Returns (total_score, list_of_group_sizes).
        """
        visited = [[False] * 4 for _ in range(4)]
        groups = []

        # Determine which cells belong to this player
        if player == 1:
            is_mine = lambda r, c: self.board[r][c] is not None and self.board[r][c].isupper()
        else:
            is_mine = lambda r, c: self.board[r][c] is not None and self.board[r][c].islower()

        for r in range(4):
            for c in range(4):
                if not visited[r][c] and is_mine(r, c):
                    # BFS to find connected group
                    group_size = 0
                    queue = [(r, c)]
                    visited[r][c] = True
                    while queue:
                        cr, cc = queue.pop(0)
                        group_size += 1
                        for dr, dc in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
                            nr, nc = cr + dr, cc + dc
                            if 0 <= nr < 4 and 0 <= nc < 4 and not visited[nr][nc] and is_mine(nr, nc):
                                visited[nr][nc] = True
                                queue.append((nr, nc))
                    groups.append(group_size)

        total = sum(s * s for s in groups)
        return total, groups

    # ----------------------------------------------------------- display override for game over
    def display(self):
        p = self.players[self.current_player - 1]
        print(f"\n  {self.name}  --  Turn {self.turn_number + 1}")
        print(f"  {self.players[0]} (UPPERCASE)  vs  {self.players[1]} (lowercase)")
        if not self.game_over:
            print(f"  Current: {p}\n")
        else:
            print()

        # Column headers
        print("        1   2   3   4")
        print("      +---+---+---+---+")
        for r in range(4):
            row_str = f"    {r + 1} |"
            for c in range(4):
                cell = self.board[r][c]
                if cell is None:
                    row_str += "   |"
                else:
                    row_str += f" {cell} |"
            print(row_str)
            print("      +---+---+---+---+")

        # Show remaining pieces
        print()
        for player in [1, 2]:
            label = "UPPERCASE" if player == 1 else "lowercase"
            parts = []
            for pt in self.PIECE_TYPES:
                display_letter = pt if player == 1 else pt.lower()
                count = self.pieces[player][pt]
                name = self.PIECE_NAMES[pt]
                symbol = self.PIECE_SYMBOLS[pt]
                parts.append(f"{display_letter}({name}{symbol}):{count}")
            print(f"  {self.players[player - 1]} [{label}]: {', '.join(parts)}")

        if self.game_over:
            # Show scores
            print()
            print(f"  === FINAL SCORES ===")
            for player in [1, 2]:
                if player == 1:
                    score, groups = self.score1, self.groups1
                else:
                    score, groups = self.score2, self.groups2
                group_strs = [f"{s}^2={s*s}" for s in groups] if groups else ["no groups"]
                print(f"  {self.players[player - 1]}: {score} points "
                      f"(groups: {', '.join(group_strs)})")
        else:
            # Show constraint
            print()
            valid = self._get_valid_positions()
            if self.constraint is not None:
                piece_type, pr, pc = self.constraint
                cell_letter = self.board[pr][pc]
                name = self.PIECE_NAMES[piece_type]
                if valid:
                    print(f"  Constraint from {cell_letter} at ({pr+1},{pc+1}): "
                          f"{name} -- must place in allowed positions.")
                    pos_strs = [f"({r+1},{c+1})" for r, c in valid]
                    print(f"  Valid positions: {', '.join(pos_strs)}")
                else:
                    print(f"  No valid positions from constraint -- place anywhere on an empty cell.")
            else:
                print("  No constraint -- place on any empty cell.")
            print()

    # ----------------------------------------------------------- state / save
    def get_state(self):
        return {
            "board": [row[:] for row in self.board],
            "pieces": {
                str(k): dict(v) for k, v in self.pieces.items()
            },
            "constraint": self.constraint,
            "last_move": self.last_move,
            "score1": getattr(self, "score1", None),
            "score2": getattr(self, "score2", None),
            "groups1": getattr(self, "groups1", None),
            "groups2": getattr(self, "groups2", None),
        }

    def load_state(self, state):
        self.board = [row[:] for row in state["board"]]
        self.pieces = {
            int(k): dict(v) for k, v in state["pieces"].items()
        }
        self.constraint = state["constraint"]
        if self.constraint is not None:
            # Ensure it's a tuple
            self.constraint = tuple(self.constraint)
        self.last_move = state["last_move"]
        if self.last_move is not None:
            self.last_move = tuple(self.last_move)
        self.score1 = state.get("score1")
        self.score2 = state.get("score2")
        self.groups1 = state.get("groups1")
        self.groups2 = state.get("groups2")

    # -------------------------------------------------------------- tutorial
    def get_tutorial(self):
        return """
==============================================================
                    MIJNLIEFF  TUTORIAL
==============================================================

OVERVIEW
  Mijnlieff is a two-player strategy game played on a 4x4
  grid. Players take turns placing pieces on the board. The
  key twist: each piece you place dictates WHERE your opponent
  is allowed to place their next piece.

--------------------------------------------------------------
PIECES
--------------------------------------------------------------
  Each player has 8 pieces: 2 of each of the 4 types.

  Player 1 uses UPPERCASE letters: P, U, S, D
  Player 2 uses lowercase letters: p, u, s, d

  The four piece types and their placement restrictions:

  PUSHER (P/p) - Arrow Up symbol
    After you place a Pusher, your opponent must place their
    next piece in a straight line (orthogonal: same row or
    same column) from the Pusher. Any distance is allowed.

  PULLER (U/u) - Arrow Down symbol
    After you place a Puller, your opponent must place their
    next piece orthogonally adjacent to the Puller (directly
    up, down, left, or right -- distance of exactly 1).

  STRAIGHT (S/s) - Plus symbol
    After you place a Straight, your opponent must place their
    next piece in a straight line (same row or column) from
    the Straight, but NOT adjacent. The piece must be at
    least 2 cells away along the row or column.

  DIAGONAL (D/d) - X symbol
    After you place a Diagonal, your opponent must place their
    next piece on any diagonal line extending from the
    Diagonal piece (any distance along a diagonal).

--------------------------------------------------------------
PLACEMENT RULES
--------------------------------------------------------------
  1. Players alternate turns, starting with Player 1.

  2. On the very first turn, there is no constraint -- the
     first player can place anywhere on the empty board.

  3. On every subsequent turn, the piece your opponent just
     placed determines WHERE you can place your next piece
     (see piece types above).

  4. You choose WHICH piece type to place, but the POSITION
     must satisfy the constraint set by your opponent's last
     piece.

  5. If the constraint leaves no valid empty cells, the
     constraint is lifted and you may place on any empty cell.

  6. You can only place on empty cells.

--------------------------------------------------------------
MOVE FORMAT
--------------------------------------------------------------
  Enter your move as: type row col

  Examples:
    P 2 3  -- Place a Pusher at row 2, column 3
    d 1 4  -- Place a Diagonal at row 1, column 4
    S 4 1  -- Place a Straight at row 4, column 1

  Rows and columns are numbered 1 through 4.
  You may use uppercase or lowercase for the piece type
  regardless of which player you are.

--------------------------------------------------------------
GAME END
--------------------------------------------------------------
  The game ends when:
    - The board is completely full (all 16 cells occupied), OR
    - Neither player has any pieces remaining to place.

--------------------------------------------------------------
SCORING
--------------------------------------------------------------
  After the game ends, each player's score is calculated:

  1. Find all groups of connected pieces belonging to each
     player. Two pieces are "connected" if they are
     orthogonally adjacent (horizontally or vertically
     neighboring).

  2. Each group scores points equal to the square of its
     size:
       - A single isolated piece scores 1^2 = 1 point
       - A group of 2 connected pieces scores 2^2 = 4 points
       - A group of 3 connected pieces scores 3^2 = 9 points
       - A group of 4 connected pieces scores 4^2 = 16 points
       - And so on...

  3. A player's total score is the sum of all their group
     scores.

  4. The player with the highest total score wins.
     If scores are tied, the game is a draw.

--------------------------------------------------------------
STRATEGY TIPS
--------------------------------------------------------------
  - Think about WHERE your piece will force your opponent to
    play, not just where you want to place it.

  - Try to build connected groups of your own pieces while
    forcing your opponent into scattered placements.

  - A Puller placed in a corner only has 2 adjacent cells,
    giving your opponent very limited options.

  - A Diagonal placed in the center has many diagonal cells,
    giving your opponent more freedom.

  - Try to use constraints to force your opponent into cells
    that break up their groups.

--------------------------------------------------------------
CONTROLS
--------------------------------------------------------------
  'quit'  / 'q'  -- Quit the game
  'save'  / 's'  -- Save and suspend the game
  'help'  / 'h'  -- Show quick help
  'tutorial' / 't' -- Show this tutorial
==============================================================
"""
