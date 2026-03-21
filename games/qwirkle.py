"""Qwirkle - A tile-matching game of lines and colors."""

import random

from engine.base import BaseGame, input_with_quit, clear_screen


# Standard: 6 shapes x 6 colors
STANDARD_SHAPES = ["Ci", "Di", "Sq", "St", "Cl", "Cr"]  # Circle, Diamond, Square, Star, Clover, Cross
STANDARD_COLORS = ["R", "O", "Y", "G", "B", "P"]  # Red, Orange, Yellow, Green, Blue, Purple

# Simple: 4 shapes x 4 colors
SIMPLE_SHAPES = ["Ci", "Di", "Sq", "St"]
SIMPLE_COLORS = ["R", "Y", "G", "B"]

SHAPE_NAMES = {
    "Ci": "Circle",
    "Di": "Diamond",
    "Sq": "Square",
    "St": "Star",
    "Cl": "Clover",
    "Cr": "Cross",
}

COLOR_NAMES = {
    "R": "Red",
    "O": "Orange",
    "Y": "Yellow",
    "G": "Green",
    "B": "Blue",
    "P": "Purple",
}

HAND_SIZE = 6
COPIES_PER_TILE = 3
QWIRKLE_BONUS = 6


class QwirkleGame(BaseGame):
    """Qwirkle: Match tiles by color or shape to score points."""

    name = "Qwirkle"
    description = "A tile-matching game of lines and colors"
    min_players = 2
    max_players = 2
    variations = {
        "standard": "Standard Qwirkle (6 shapes x 6 colors)",
        "simple": "Simplified (4 shapes x 4 colors)",
    }

    def __init__(self, variation=None):
        super().__init__(variation)
        self.bag = []
        self.hands = [[], []]
        self.scores = [0, 0]
        self.board = {}  # (row, col) -> (color, shape)
        self.shapes = STANDARD_SHAPES
        self.colors = STANDARD_COLORS

    def setup(self):
        """Initialize the game for a new session."""
        if self.variation == "simple":
            self.shapes = list(SIMPLE_SHAPES)
            self.colors = list(SIMPLE_COLORS)
        else:
            self.shapes = list(STANDARD_SHAPES)
            self.colors = list(STANDARD_COLORS)

        # Build bag: each unique tile appears COPIES_PER_TILE times
        self.bag = []
        for color in self.colors:
            for shape in self.shapes:
                for _ in range(COPIES_PER_TILE):
                    self.bag.append((color, shape))
        random.shuffle(self.bag)

        self.board = {}
        self.hands = [[], []]
        self.scores = [0, 0]

        # Deal starting hands
        for p in range(2):
            self._draw_tiles(p, HAND_SIZE)

        self.current_player = 1

    def _draw_tiles(self, p, count):
        """Draw up to count tiles from bag into player p's hand."""
        for _ in range(count):
            if self.bag:
                self.hands[p].append(self.bag.pop())

    def _tile_str(self, tile):
        """Format a tile as 'ColorShape' e.g. 'RCi'."""
        return f"{tile[0]}{tile[1]}"

    def _board_bounds(self):
        """Return (min_row, max_row, min_col, max_col) of occupied cells, or None."""
        if not self.board:
            return None
        rows = [r for r, c in self.board]
        cols = [c for r, c in self.board]
        return min(rows), max(rows), min(cols), max(cols)

    def display(self):
        """Display the full game state."""
        var_label = "Standard" if self.variation != "simple" else "Simple"
        print(f"\n  === Qwirkle ({var_label}) ===")
        print(f"  {self.players[0]} (P1): {self.scores[0]} pts   |   "
              f"{self.players[1]} (P2): {self.scores[1]} pts")
        print(f"  Tiles in bag: {len(self.bag)}")
        print(f"  Current turn: {self.players[self.current_player - 1]}")

        # Display board
        bounds = self._board_bounds()
        if bounds is None:
            print("\n  Board is empty. Place the first tile at (0,0).")
        else:
            min_r, max_r, min_c, max_c = bounds
            # Expand display by 1 in each direction to show possible placement area
            min_r -= 1
            max_r += 1
            min_c -= 1
            max_c += 1

            # Column headers
            col_header = "       "
            for c in range(min_c, max_c + 1):
                col_header += f"{c:>5}"
            print(f"\n{col_header}")
            print("       " + "-----" * (max_c - min_c + 1))

            for r in range(min_r, max_r + 1):
                row_str = f"  {r:>3} |"
                for c in range(min_c, max_c + 1):
                    if (r, c) in self.board:
                        tile = self.board[(r, c)]
                        row_str += f" {self._tile_str(tile):>4}"
                    else:
                        row_str += "    ."
                print(row_str)

        # Display current player's hand
        p = self.current_player - 1
        hand_strs = [f"{i+1}:{self._tile_str(t)}" for i, t in enumerate(self.hands[p])]
        print(f"\n  Your hand: {' '.join(hand_strs)}")

    def get_move(self):
        """Get move from current player."""
        print(f"\n  {self.players[self.current_player - 1]}, place tiles or swap.")
        print("  PLACE: 'p hand_idx row col [hand_idx row col ...]'")
        print("    e.g. 'p 1 0 0' = place hand tile 1 at (0,0)")
        print("    e.g. 'p 1 0 0 3 0 1' = place tiles 1 and 3")
        print("  SWAP:  'x hand_indices'  e.g. 'x 1 3 5' = swap tiles 1, 3, 5")
        move_str = input_with_quit("  Your move: ").strip()
        return move_str

    def make_move(self, move):
        """Apply move. Returns True if valid."""
        parts = move.strip().split()
        if not parts:
            return False

        action = parts[0].lower()
        p = self.current_player - 1

        if action == 'x':
            return self._do_swap(p, parts[1:])
        elif action == 'p':
            return self._do_place(p, parts[1:])
        else:
            return False

    def _do_swap(self, p, args):
        """Swap tiles from hand back into bag. Only allowed if bag is non-empty."""
        if not self.bag:
            print("  Cannot swap: bag is empty.")
            return False

        try:
            indices = [int(a) for a in args]
        except ValueError:
            return False

        if not indices:
            return False

        # Validate indices (1-based)
        for idx in indices:
            if idx < 1 or idx > len(self.hands[p]):
                return False

        # Check for duplicate indices
        if len(set(indices)) != len(indices):
            return False

        # Return tiles to bag, then draw replacements
        tiles_to_return = []
        for idx in sorted(indices, reverse=True):
            tiles_to_return.append(self.hands[p].pop(idx - 1))

        for tile in tiles_to_return:
            self.bag.append(tile)
        random.shuffle(self.bag)

        self._draw_tiles(p, len(tiles_to_return))
        return True

    def _do_place(self, p, args):
        """Place one or more tiles on the board."""
        if len(args) % 3 != 0 or len(args) == 0:
            return False

        placements = []
        try:
            for i in range(0, len(args), 3):
                hand_idx = int(args[i])
                row = int(args[i + 1])
                col = int(args[i + 2])
                placements.append((hand_idx, row, col))
        except (ValueError, IndexError):
            return False

        # Validate hand indices
        hand_indices = [h for h, r, c in placements]
        if len(set(hand_indices)) != len(hand_indices):
            return False
        for idx in hand_indices:
            if idx < 1 or idx > len(self.hands[p]):
                return False

        # All target cells must be empty
        for h, r, c in placements:
            if (r, c) in self.board:
                return False

        # Check for duplicate positions
        positions = [(r, c) for h, r, c in placements]
        if len(set(positions)) != len(positions):
            return False

        # All placed tiles must be in one line (same row or same col)
        if len(placements) > 1:
            rows = set(r for h, r, c in placements)
            cols = set(c for h, r, c in placements)
            if len(rows) != 1 and len(cols) != 1:
                return False

        # If board is empty, first tile must go at (0,0) for simplicity;
        # actually, let's allow any position but first placement must be contiguous
        # For empty board, just place tiles - they form a single line
        if not self.board and len(placements) == 1:
            # Single tile on empty board is always valid
            pass
        elif not self.board and len(placements) > 1:
            # Multiple tiles on empty board: must be in a single line (already checked)
            # and contiguous
            if not self._positions_contiguous(positions):
                return False
        else:
            # Board is non-empty: at least one placed tile must be adjacent to existing
            has_adjacent = False
            for h, r, c in placements:
                for dr, dc in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
                    nr, nc = r + dr, c + dc
                    if (nr, nc) in self.board:
                        has_adjacent = True
                        break
                if has_adjacent:
                    break
            if not has_adjacent:
                return False

            # Tiles in the line must be contiguous with existing tiles
            # (no gaps between placed tiles along the line)
            if len(placements) > 1:
                rows_set = set(r for h, r, c in placements)
                if len(rows_set) == 1:
                    # horizontal line
                    row = placements[0][1]
                    all_cols = sorted(c for h, r, c in placements)
                    for c in range(all_cols[0], all_cols[-1] + 1):
                        if (row, c) not in self.board and c not in [cc for hh, rr, cc in placements]:
                            return False
                else:
                    # vertical line
                    col = placements[0][2]
                    all_rows = sorted(r for h, r, c in placements)
                    for r in range(all_rows[0], all_rows[-1] + 1):
                        if (r, col) not in self.board and r not in [rr for hh, rr, cc in placements]:
                            return False

        # Build a temporary board with the new tiles to validate lines
        tiles_map = {}
        for h, r, c in placements:
            tile = self.hands[p][h - 1]
            tiles_map[(r, c)] = tile

        temp_board = dict(self.board)
        temp_board.update(tiles_map)

        # Validate every line that includes a newly placed tile
        for h, r, c in placements:
            # Check horizontal line through (r, c)
            h_line = self._get_line(temp_board, r, c, 0, 1)
            if not self._valid_line(h_line):
                return False

            # Check vertical line through (r, c)
            v_line = self._get_line(temp_board, r, c, 1, 0)
            if not self._valid_line(v_line):
                return False

        # Move is valid - apply it
        # Score the move
        score = self._calc_score(placements, tiles_map)

        # Remove tiles from hand (highest index first to avoid shifting)
        for idx in sorted(hand_indices, reverse=True):
            self.hands[p].pop(idx - 1)

        # Place on board
        self.board.update(tiles_map)

        # Add score
        self.scores[p] += score

        # Draw replacement tiles
        self._draw_tiles(p, len(placements))

        return True

    def _positions_contiguous(self, positions):
        """Check if a set of positions in a line are contiguous (no gaps)."""
        if len(positions) <= 1:
            return True
        rows = set(r for r, c in positions)
        cols = set(c for r, c in positions)
        if len(rows) == 1:
            sorted_cols = sorted(c for r, c in positions)
            return sorted_cols[-1] - sorted_cols[0] == len(positions) - 1
        elif len(cols) == 1:
            sorted_rows = sorted(r for r, c in positions)
            return sorted_rows[-1] - sorted_rows[0] == len(positions) - 1
        return False

    def _get_line(self, board, row, col, dr, dc):
        """Get all tiles in a line through (row, col) in direction (dr, dc) and (-dr, -dc)."""
        tiles = [board[(row, col)]]
        # Forward
        r, c = row + dr, col + dc
        while (r, c) in board:
            tiles.append(board[(r, c)])
            r += dr
            c += dc
        # Backward
        r, c = row - dr, col - dc
        while (r, c) in board:
            tiles.append(board[(r, c)])
            r -= dr
            c -= dc
        return tiles

    def _valid_line(self, line):
        """Check if a line of tiles is valid: all same color or all same shape, no duplicates, max 6."""
        if len(line) <= 1:
            return True
        if len(line) > len(self.colors):
            # Max line length = number of distinct values (6 for standard, 4 for simple)
            return False

        # Check for duplicate tiles
        if len(set(line)) != len(line):
            return False

        colors = [t[0] for t in line]
        shapes = [t[1] for t in line]

        same_color = len(set(colors)) == 1
        same_shape = len(set(shapes)) == 1

        if not same_color and not same_shape:
            return False

        return True

    def _calc_score(self, placements, tiles_map):
        """Calculate score for a set of placements."""
        temp_board = dict(self.board)
        temp_board.update(tiles_map)

        scored_lines = set()
        total = 0

        for h, r, c in placements:
            # Horizontal line
            h_line_key, h_line_len = self._get_line_key_and_len(temp_board, r, c, 0, 1)
            if h_line_len > 1 and h_line_key not in scored_lines:
                scored_lines.add(h_line_key)
                total += h_line_len
                if h_line_len == len(self.colors):
                    total += QWIRKLE_BONUS

            # Vertical line
            v_line_key, v_line_len = self._get_line_key_and_len(temp_board, r, c, 1, 0)
            if v_line_len > 1 and v_line_key not in scored_lines:
                scored_lines.add(v_line_key)
                total += v_line_len
                if v_line_len == len(self.colors):
                    total += QWIRKLE_BONUS

        # If only one tile placed and it has no neighbors, it scores 1
        if total == 0 and len(placements) == 1:
            total = 1

        return total

    def _get_line_key_and_len(self, board, row, col, dr, dc):
        """Get a hashable key and length for the line through (row, col) in direction (dr, dc)."""
        positions = [(row, col)]
        # Forward
        r, c = row + dr, col + dc
        while (r, c) in board:
            positions.append((r, c))
            r += dr
            c += dc
        # Backward
        r, c = row - dr, col - dc
        while (r, c) in board:
            positions.append((r, c))
            r -= dr
            c -= dc
        key = tuple(sorted(positions))
        return key, len(positions)

    def check_game_over(self):
        """Check if game is over: bag empty and a player has no tiles."""
        for p in range(2):
            if not self.hands[p] and not self.bag:
                self.scores[p] += QWIRKLE_BONUS  # bonus for going out
                self.game_over = True
                if self.scores[0] > self.scores[1]:
                    self.winner = 1
                elif self.scores[1] > self.scores[0]:
                    self.winner = 2
                else:
                    self.winner = None
                return

        # Also check if no player can make a legal move (both must swap but bag is empty)
        if not self.bag:
            can_play = False
            for p in range(2):
                if self._player_can_place(p):
                    can_play = True
                    break
            if not can_play:
                self.game_over = True
                if self.scores[0] > self.scores[1]:
                    self.winner = 1
                elif self.scores[1] > self.scores[0]:
                    self.winner = 2
                else:
                    self.winner = None

    def _player_can_place(self, p):
        """Check if player p can place at least one tile."""
        if not self.board:
            return bool(self.hands[p])
        for tile in self.hands[p]:
            for (r, c) in self.board:
                for dr, dc in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
                    nr, nc = r + dr, c + dc
                    if (nr, nc) not in self.board:
                        # Try placing this tile here
                        temp_board = dict(self.board)
                        temp_board[(nr, nc)] = tile
                        h_line = self._get_line(temp_board, nr, nc, 0, 1)
                        v_line = self._get_line(temp_board, nr, nc, 1, 0)
                        if self._valid_line(h_line) and self._valid_line(v_line):
                            return True
        return False

    def get_state(self):
        """Return serializable game state."""
        # Convert board keys from tuples to strings for JSON
        board_serial = {f"{r},{c}": list(v) for (r, c), v in self.board.items()}
        return {
            "bag": [list(t) for t in self.bag],
            "hands": [[list(t) for t in h] for h in self.hands],
            "scores": list(self.scores),
            "board": board_serial,
            "shapes": list(self.shapes),
            "colors": list(self.colors),
        }

    def load_state(self, state):
        """Restore game state."""
        self.bag = [tuple(t) for t in state["bag"]]
        self.hands = [[tuple(t) for t in h] for h in state["hands"]]
        self.scores = list(state["scores"])
        self.board = {}
        for key, val in state["board"].items():
            r, c = key.split(",")
            self.board[(int(r), int(c))] = tuple(val)
        self.shapes = list(state["shapes"])
        self.colors = list(state["colors"])

    def get_tutorial(self):
        """Return tutorial with rules and strategy hints."""
        return """
==================================================
  Qwirkle - Tutorial
==================================================

  OVERVIEW:
  Qwirkle is a tile-matching game where you place
  tiles to form lines. Each line must contain tiles
  that share either the same color or the same
  shape, but no two tiles in a line can be identical.

  TILES:
  Each tile has a COLOR and a SHAPE.
  Colors: R=Red, O=Orange, Y=Yellow, G=Green,
          B=Blue, P=Purple
  Shapes: Ci=Circle, Di=Diamond, Sq=Square,
          St=Star, Cl=Clover, Cr=Cross
  A tile is shown as ColorShape, e.g. 'RCi' = Red Circle.

  Standard game: 6 colors x 6 shapes x 3 copies = 108 tiles
  Simple game: 4 colors x 4 shapes x 3 copies = 48 tiles

  RULES:
  - Each player starts with 6 tiles in hand.
  - On your turn, either:
    (a) PLACE one or more tiles in a single line, or
    (b) SWAP any number of tiles from your hand.
  - Placed tiles must all go in the same row or
    column and extend or create valid lines.
  - A valid line: all tiles share the same color
    OR the same shape. No duplicate tiles allowed.
  - Maximum line length is 6 (standard) or 4 (simple).

  SCORING:
  - For each line you create or extend, score 1
    point per tile in that line (including tiles
    already on the board).
  - Completing a line of 6 (a "Qwirkle") earns a
    bonus of 6 extra points.
  - A single tile placed with no neighbors scores 1.

  GAME END:
  - When the bag is empty and a player plays all
    their remaining tiles, that player gets +6 bonus
    points.
  - The game also ends if no player can make a move.
  - Highest score wins.

  HOW TO ENTER MOVES:
  PLACE tiles:
    Format: p hand_index row col [hand_index row col ...]
    - hand_index: 1-6 (position in your hand)
    - row, col: board coordinates (integers)

    Examples:
    - "p 1 0 0"         = place hand tile 1 at row 0, col 0
    - "p 1 0 0 3 0 1"   = place tiles 1 and 3 in a line

  SWAP tiles:
    Format: x hand_indices
    - "x 1 3 5" = swap tiles 1, 3, and 5 from hand

  STRATEGY HINTS:
  - Try to complete Qwirkles (lines of 6) for the
    big +6 bonus.
  - Place tiles that score in two directions at once
    (both a row and a column).
  - Watch what tiles remain -- with 3 copies each,
    track what has been played.
  - Avoid leaving openings for your opponent to
    complete Qwirkles.

  SIMPLE VARIATION:
  Uses 4 colors and 4 shapes for a quicker game.
  Max line length is 4.

==================================================
"""
