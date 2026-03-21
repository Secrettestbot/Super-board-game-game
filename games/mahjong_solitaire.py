"""Mahjong Solitaire - A tile matching puzzle game (2-player competitive variant)."""

import random
from engine.base import BaseGame, input_with_quit, clear_screen


# Tile definitions: 36 unique tiles, 4 copies each = 144 tiles
# Suits: Bamboo (B1-B9), Circles (C1-C9), Characters (H1-H9)
# Honors: Winds (W1-W4), Dragons (D1-D3)
# Bonus: Seasons (S1-S4), Flowers (F1-F4)

SUIT_TILES = (
    [f"B{i}" for i in range(1, 10)] +
    [f"C{i}" for i in range(1, 10)] +
    [f"H{i}" for i in range(1, 10)]
)
HONOR_TILES = [f"W{i}" for i in range(1, 5)] + [f"D{i}" for i in range(1, 4)]
SEASON_TILES = [f"S{i}" for i in range(1, 5)]
FLOWER_TILES = [f"F{i}" for i in range(1, 5)]

ALL_UNIQUE = SUIT_TILES + HONOR_TILES  # 34 tiles that come in quads
# Seasons and flowers are unique but match any of their group


def build_tile_pool():
    """Build the full 144-tile pool."""
    pool = []
    # 4 copies of each suit and honor tile
    for tile in ALL_UNIQUE:
        pool.extend([tile] * 4)
    # Seasons: 4 unique tiles (each appears once, but we need 4 copies total for matching)
    # In traditional mahjong, seasons/flowers are unique but we need groups of 4
    # We'll have 4 of each season and flower label for the pool
    for tile in SEASON_TILES:
        pool.append(tile)
    for tile in FLOWER_TILES:
        pool.append(tile)
    # That gives us 34*4 + 4 + 4 = 144 tiles
    return pool


def tiles_match(t1, t2):
    """Check if two tiles form a valid matching pair."""
    if t1 == t2:
        return True
    # Seasons match any other season
    if t1[0] == 'S' and t2[0] == 'S':
        return True
    # Flowers match any other flower
    if t1[0] == 'F' and t2[0] == 'F':
        return True
    return False


class MahjongSolitaireGame(BaseGame):
    """Mahjong Solitaire: Competitive tile matching puzzle for 2 players."""

    name = "Mahjong Solitaire"
    description = "Tile matching puzzle - find and remove pairs of free tiles"
    min_players = 2
    max_players = 2
    variations = {
        "standard": "Standard Turtle Layout",
        "simple": "Flat Layout (no stacking)",
    }

    def __init__(self, variation=None):
        super().__init__(variation)
        # Layout: list of (row, col, layer) -> tile_code or None
        # We store the board as a dict: (layer, row, col) -> tile_code
        self.board = {}
        self.scores = [0, 0]
        self.layout_positions = []  # ordered list of (layer, row, col) positions

    def setup(self):
        """Initialize the board with tiles in the chosen layout."""
        pool = build_tile_pool()
        random.shuffle(pool)

        if self.variation == "simple":
            self._build_simple_layout()
        else:
            self._build_standard_layout()

        # Place tiles from the shuffled pool onto layout positions
        for i, pos in enumerate(self.layout_positions):
            self.board[pos] = pool[i]

        self.scores = [0, 0]

    def _build_standard_layout(self):
        """Build the turtle/pyramid layout with multiple layers.

        Layer 0 (bottom): 12x8 grid with some edge tiles = ~86 tiles
        Layer 1: 10x6 = 40 tiles (offset inward)
        Layer 2: 4x2 = 8 tiles (offset inward more)
        Layer 3: 2x1 = 2 tiles (top cap)
        Plus wing tiles on layer 0 sides = extra tiles
        Total = 144 tiles
        """
        positions = []

        # Layer 0: Main base - a broad layout
        # Center block: rows 0-7, cols 1-12 (8*12=96)
        for r in range(8):
            for c in range(1, 13):
                positions.append((0, r, c))
        # Left wing: rows 3-4, col 0 (2 tiles)
        for r in range(3, 5):
            positions.append((0, r, 0))
        # Right wing: rows 3-4, col 13 (2 tiles)
        for r in range(3, 5):
            positions.append((0, r, 13))
        # Total layer 0: 96 + 4 = 100

        # Layer 1: 6x6 centered (rows 1-6, cols 3-8) = 36
        for r in range(1, 7):
            for c in range(3, 9):
                positions.append((1, r, c))

        # Layer 2: rows 2-4, cols 4-7 = 3*4 = 12 but we need fewer
        # Actually let's do 2x3 = 6
        for r in range(3, 5):
            for c in range(5, 8):
                positions.append((2, r, c))
        # That's 6 tiles on layer 2

        # Layer 3: top cap - 2 tiles
        positions.append((3, 3, 6))
        positions.append((3, 4, 6))

        # Total: 100 + 36 + 6 + 2 = 144
        self.layout_positions = positions

    def _build_simple_layout(self):
        """Build a flat single-layer grid layout. 144 tiles in a 12x12 grid."""
        positions = []
        # 12 x 12 = 144
        for r in range(12):
            for c in range(12):
                positions.append((0, r, c))
        self.layout_positions = positions

    def _get_bounds(self):
        """Get the bounds of the current board."""
        if not self.board:
            return 0, 0, 0, 0, 0, 0
        positions = list(self.board.keys())
        min_l = min(p[0] for p in positions)
        max_l = max(p[0] for p in positions)
        min_r = min(p[1] for p in positions)
        max_r = max(p[1] for p in positions)
        min_c = min(p[2] for p in positions)
        max_c = max(p[2] for p in positions)
        return min_l, max_l, min_r, max_r, min_c, max_c

    def _is_free(self, pos):
        """Check if a tile at pos is free (can be selected).

        A tile is free if:
        1. No tile is on top of it (on a higher layer at same or overlapping position)
        2. At least one side (left or right) is open
        """
        layer, row, col = pos
        if pos not in self.board:
            return False

        # Check if any tile is on top (layer + 1, same row/col)
        if (layer + 1, row, col) in self.board:
            return False

        # Check left and right sides
        left_blocked = (layer, row, col - 1) in self.board
        right_blocked = (layer, row, col + 1) in self.board

        if left_blocked and right_blocked:
            return False

        return True

    def _get_free_tiles(self):
        """Return list of positions that are free."""
        return [pos for pos in self.board if self._is_free(pos)]

    def _find_available_pairs(self):
        """Find all available matching pairs among free tiles."""
        free = self._get_free_tiles()
        pairs = []
        for i in range(len(free)):
            for j in range(i + 1, len(free)):
                if tiles_match(self.board[free[i]], self.board[free[j]]):
                    pairs.append((free[i], free[j]))
        return pairs

    def display(self):
        """Display the current game state."""
        print(f"\n  === Mahjong Solitaire ===")
        layout_name = self.variations.get(self.variation, self.variation)
        print(f"  Layout: {layout_name}")
        print(f"  {self.players[0]}: {self.scores[0]} pts  |  {self.players[1]}: {self.scores[1]} pts")
        print(f"  Current turn: {self.players[self.current_player - 1]}")
        print(f"  Tiles remaining: {len(self.board)}")

        free_set = set(self._get_free_tiles())
        available_pairs = len(self._find_available_pairs())
        print(f"  Free tiles: {len(free_set)}  |  Available pairs: {available_pairs}")
        print()

        if not self.board:
            print("  Board is empty!")
            return

        min_l, max_l, min_r, max_r, min_c, max_c = self._get_bounds()

        # Display each layer
        for layer in range(max_l, min_l - 1, -1):
            layer_tiles = {k: v for k, v in self.board.items() if k[0] == layer}
            if not layer_tiles:
                continue

            l_min_r = min(p[1] for p in layer_tiles)
            l_max_r = max(p[1] for p in layer_tiles)
            l_min_c = min(p[2] for p in layer_tiles)
            l_max_c = max(p[2] for p in layer_tiles)

            if max_l > 0:
                print(f"  --- Layer {layer} ---")

            # Column headers
            header = "     "
            for c in range(l_min_c, l_max_c + 1):
                header += f"{c:>4}"
            print(header)

            for r in range(l_min_r, l_max_r + 1):
                row_str = f"  {r:2d} "
                for c in range(l_min_c, l_max_c + 1):
                    pos = (layer, r, c)
                    if pos in self.board:
                        tile = self.board[pos]
                        if pos in free_set:
                            row_str += f"[{tile}]"
                        else:
                            row_str += f" {tile} "
                    else:
                        row_str += "  . "
                print(row_str)
            print()

    def get_move(self):
        """Get a pair of tile codes from the current player."""
        print(f"  {self.players[self.current_player - 1]}, enter two tile codes to match.")
        print("  Format: CODE CODE (e.g. 'B3 B3' or 'S1 S2')")
        print("  Use layer,row,col if ambiguous (e.g. '0,3,5 0,4,8')")
        move_str = input_with_quit("  Your move: ").strip()
        return move_str

    def make_move(self, move):
        """Remove a matching pair. Returns True if valid."""
        parts = move.upper().split()
        if len(parts) != 2:
            print("  Please enter exactly two tile codes.")
            return False

        # Parse each part - could be a tile code or layer,row,col coordinates
        pos1 = self._parse_tile_selection(parts[0])
        pos2 = self._parse_tile_selection(parts[1])

        if pos1 is None:
            print(f"  Could not find free tile matching '{parts[0]}'.")
            return False
        if pos2 is None:
            print(f"  Could not find free tile matching '{parts[1]}'.")
            return False

        if pos1 == pos2:
            print("  You must select two different tiles.")
            return False

        # Check both are free
        if not self._is_free(pos1):
            print(f"  Tile at {pos1} is not free.")
            return False
        if not self._is_free(pos2):
            print(f"  Tile at {pos2} is not free.")
            return False

        # Check they match
        t1 = self.board[pos1]
        t2 = self.board[pos2]
        if not tiles_match(t1, t2):
            print(f"  {t1} and {t2} do not match.")
            return False

        # Remove the pair
        del self.board[pos1]
        del self.board[pos2]
        self.scores[self.current_player - 1] += 1
        print(f"  Removed {t1} and {t2}! +1 point.")
        return True

    def _parse_tile_selection(self, text):
        """Parse a tile selection - either a tile code or layer,row,col coordinates.

        For tile codes, finds a free tile with that code. If multiple free tiles
        share the code, picks the first one found (topmost layer first).
        For coordinates, uses exact position.
        """
        # Try layer,row,col format
        if ',' in text:
            try:
                parts = text.split(',')
                layer, row, col = int(parts[0]), int(parts[1]), int(parts[2])
                pos = (layer, row, col)
                if pos in self.board:
                    return pos
            except (ValueError, IndexError):
                pass
            return None

        # Tile code: find a free tile with this code
        code = text.upper()
        free_tiles = self._get_free_tiles()
        # Sort by layer descending so we pick topmost first
        free_tiles.sort(key=lambda p: (-p[0], p[1], p[2]))

        matches = [pos for pos in free_tiles if self.board[pos] == code]
        if matches:
            return matches[0]
        return None

    def check_game_over(self):
        """Game ends when board is empty or no more pairs available."""
        if not self.board:
            self.game_over = True
            if self.scores[0] > self.scores[1]:
                self.winner = 1
            elif self.scores[1] > self.scores[0]:
                self.winner = 2
            else:
                self.winner = None  # draw
            return

        pairs = self._find_available_pairs()
        if not pairs:
            self.game_over = True
            print("\n  No more matching pairs available!")
            if self.scores[0] > self.scores[1]:
                self.winner = 1
            elif self.scores[1] > self.scores[0]:
                self.winner = 2
            else:
                self.winner = None

    def get_state(self):
        """Return serializable game state."""
        # Convert tuple keys to strings for JSON
        board_data = {}
        for (layer, row, col), tile in self.board.items():
            key = f"{layer},{row},{col}"
            board_data[key] = tile
        return {
            "board": board_data,
            "scores": list(self.scores),
            "layout_positions": [[l, r, c] for l, r, c in self.layout_positions],
        }

    def load_state(self, state):
        """Restore game state."""
        self.board = {}
        for key, tile in state["board"].items():
            parts = key.split(",")
            pos = (int(parts[0]), int(parts[1]), int(parts[2]))
            self.board[pos] = tile
        self.scores = list(state["scores"])
        self.layout_positions = [tuple(p) for p in state["layout_positions"]]

    def get_tutorial(self):
        """Return tutorial text."""
        return """
==================================================
  Mahjong Solitaire - Tutorial
==================================================

  OVERVIEW:
  Mahjong Solitaire is a tile matching puzzle using
  144 traditional mahjong tiles arranged in a layered
  formation. Two players compete to remove the most
  pairs.

  TILES (2-character codes):
  - Bamboo:     B1 B2 B3 B4 B5 B6 B7 B8 B9
  - Circles:    C1 C2 C3 C4 C5 C6 C7 C8 C9
  - Characters: H1 H2 H3 H4 H5 H6 H7 H8 H9
  - Winds:      W1 W2 W3 W4
  - Dragons:    D1 D2 D3
  - Seasons:    S1 S2 S3 S4  (match any season)
  - Flowers:    F1 F2 F3 F4  (match any flower)

  FREE TILES:
  A tile is "free" and can be selected if:
    1. No tile is stacked on top of it.
    2. At least one side (left or right) is open
       (no adjacent tile on that side).
  Free tiles are shown in [brackets].
  Blocked tiles are shown without brackets.

  MATCHING RULES:
  - Most tiles match only identical tiles
    (e.g. B3 matches B3).
  - Seasons match ANY other season
    (e.g. S1 matches S3).
  - Flowers match ANY other flower
    (e.g. F2 matches F4).

  HOW TO PLAY:
  - Players alternate turns.
  - On your turn, enter two tile codes to remove
    a matching pair. Example: "B3 B3"
  - If multiple free tiles share a code, the topmost
    is selected first. Use coordinates to be specific:
    "0,3,5 0,4,8" (layer,row,col).
  - Each pair removed scores 1 point.
  - Game ends when no more pairs can be removed or
    the board is cleared.
  - Highest score wins!

  VARIATIONS:
  - Standard: Turtle/pyramid layout with stacking.
  - Simple: Flat single-layer grid (easier to read
    in text mode, no stacking).

  STRATEGY:
  - Look ahead! Removing certain pairs may block
    or free other tiles.
  - Try to keep the board balanced and avoid
    leaving unmatched tiles trapped.
  - In competitive play, deny your opponent easy
    pairs when possible.

==================================================
"""
