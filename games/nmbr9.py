"""NMBR 9 - Tile-stacking number puzzle.

Place number-shaped tiles to build layers. Tiles on higher layers score
more: tile_value * layer_number. Build a stable foundation to stack high.
"""

import random
import copy

from engine.base import BaseGame, input_with_quit, clear_screen

# Number tile shapes as (row, col) offsets from top-left
# Each number 0-9 appears twice in the deck (standard) or has larger versions (plus)
TILE_SHAPES = {
    0: [(0, 0), (0, 1), (0, 2), (1, 0), (1, 2), (2, 0), (2, 1), (2, 2)],
    1: [(0, 1), (1, 0), (1, 1), (2, 1), (3, 1)],
    2: [(0, 0), (0, 1), (0, 2), (1, 2), (2, 0), (2, 1), (2, 2)],
    3: [(0, 0), (0, 1), (0, 2), (1, 2), (2, 0), (2, 1), (2, 2)],
    4: [(0, 0), (0, 2), (1, 0), (1, 1), (1, 2), (2, 2)],
    5: [(0, 0), (0, 1), (0, 2), (1, 0), (2, 0), (2, 1), (2, 2)],
    6: [(0, 0), (0, 1), (0, 2), (1, 0), (2, 0), (2, 1), (2, 2), (1, 2)],
    7: [(0, 0), (0, 1), (0, 2), (1, 2), (2, 2)],
    8: [(0, 0), (0, 1), (0, 2), (1, 0), (1, 2), (2, 0), (2, 1), (2, 2)],
    9: [(0, 0), (0, 1), (0, 2), (1, 0), (1, 2), (2, 0), (2, 1), (2, 2)],
}

# Larger tiles for NMBR 9++ variant
TILE_SHAPES_PLUS = {
    0: [(0, 0), (0, 1), (0, 2), (0, 3), (1, 0), (1, 3), (2, 0), (2, 3),
        (3, 0), (3, 1), (3, 2), (3, 3)],
    1: [(0, 1), (0, 2), (1, 1), (2, 1), (3, 1), (4, 0), (4, 1), (4, 2)],
    2: [(0, 0), (0, 1), (0, 2), (0, 3), (1, 3), (2, 0), (2, 1), (2, 2), (2, 3)],
    3: [(0, 0), (0, 1), (0, 2), (1, 2), (2, 0), (2, 1), (2, 2), (3, 2),
        (4, 0), (4, 1), (4, 2)],
    4: [(0, 0), (0, 3), (1, 0), (1, 3), (2, 0), (2, 1), (2, 2), (2, 3), (3, 3)],
    5: [(0, 0), (0, 1), (0, 2), (1, 0), (2, 0), (2, 1), (2, 2), (3, 2),
        (4, 0), (4, 1), (4, 2)],
    6: [(0, 0), (0, 1), (0, 2), (1, 0), (2, 0), (2, 1), (2, 2), (3, 0), (3, 2),
        (4, 0), (4, 1), (4, 2)],
    7: [(0, 0), (0, 1), (0, 2), (0, 3), (1, 3), (2, 3), (3, 3)],
    8: [(0, 0), (0, 1), (0, 2), (1, 0), (1, 2), (2, 0), (2, 1), (2, 2),
        (3, 0), (3, 2), (4, 0), (4, 1), (4, 2)],
    9: [(0, 0), (0, 1), (0, 2), (1, 0), (1, 2), (2, 0), (2, 1), (2, 2),
        (3, 2), (4, 0), (4, 1), (4, 2)],
}

GRID_SIZE = 15
MAX_LAYERS = 5


def rotate_shape(shape, times=1):
    """Rotate shape 90 degrees clockwise, 'times' times."""
    s = list(shape)
    for _ in range(times % 4):
        s = [(c, -r) for r, c in s]
        min_r = min(r for r, c in s)
        min_c = min(c for r, c in s)
        s = [(r - min_r, c - min_c) for r, c in s]
    return s


def flip_shape(shape):
    """Flip shape horizontally."""
    max_c = max(c for r, c in shape)
    return [(r, max_c - c) for r, c in shape]


class Nmbr9Game(BaseGame):
    """NMBR 9 - Tile-stacking number puzzle."""

    name = "NMBR 9"
    description = "Tile-stacking puzzle: place number tiles, higher layers score more"
    min_players = 2
    max_players = 2
    variations = {
        "standard": "Standard Game",
        "plus": "Nmbr 9++ (larger tiles)",
    }

    def __init__(self, variation=None):
        super().__init__(variation)
        self.use_plus = (self.variation == "plus")
        # Each player has their own 3D grid (layer -> 2D grid)
        # Grid cells store tile number or None
        self.boards = {}  # player -> list of layers, each layer is 2D grid
        self.deck = []
        self.current_tile = None
        self.tiles_played = 0
        self.total_tiles = 20 if not self.use_plus else 20
        self.log = []

    def _init_board(self):
        """Create empty layered board."""
        return [[None] * GRID_SIZE for _ in range(GRID_SIZE * MAX_LAYERS)]

    def _get_cell(self, board, layer, row, col):
        """Get cell value at layer, row, col."""
        idx = layer * GRID_SIZE + row
        if 0 <= idx < len(board) and 0 <= col < GRID_SIZE:
            return board[idx][col]
        return None

    def _set_cell(self, board, layer, row, col, value):
        """Set cell value at layer, row, col."""
        idx = layer * GRID_SIZE + row
        if 0 <= idx < len(board) and 0 <= col < GRID_SIZE:
            board[idx][col] = value

    def setup(self):
        self.boards = {"1": self._init_board(), "2": self._init_board()}
        shapes = TILE_SHAPES_PLUS if self.use_plus else TILE_SHAPES
        self.deck = []
        for num in range(10):
            self.deck.append(num)
            self.deck.append(num)
        random.shuffle(self.deck)
        self.tiles_played = 0
        self.total_tiles = len(self.deck)
        self.current_tile = self.deck.pop() if self.deck else None
        self.log = [f"NMBR 9 begins! First tile: {self.current_tile}"]

    def _get_shape(self, number):
        shapes = TILE_SHAPES_PLUS if self.use_plus else TILE_SHAPES
        return shapes.get(number, [(0, 0)])

    def _can_place(self, player, layer, row, col, shape):
        """Check if a shape can be placed at the given position and layer."""
        sp = str(player)
        board = self.boards[sp]

        cells = [(row + dr, col + dc) for dr, dc in shape]

        # Check bounds
        for r, c in cells:
            if r < 0 or r >= GRID_SIZE or c < 0 or c >= GRID_SIZE:
                return False

        # Check cells are empty at this layer
        for r, c in cells:
            if self._get_cell(board, layer, r, c) is not None:
                return False

        if layer == 0:
            # Layer 0: must be adjacent to existing tile OR first placement
            has_any = False
            for l in range(MAX_LAYERS):
                for r in range(GRID_SIZE):
                    for c2 in range(GRID_SIZE):
                        if self._get_cell(board, l, r, c2) is not None:
                            has_any = True
                            break
                    if has_any:
                        break
                if has_any:
                    break
            if not has_any:
                return True  # First tile, anywhere is fine

            # Must be adjacent to existing tiles
            adjacent = False
            for r, c in cells:
                for dr2, dc2 in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
                    nr, nc = r + dr2, c + dc2
                    if self._get_cell(board, layer, nr, nc) is not None:
                        adjacent = True
                        break
                if adjacent:
                    break
            return adjacent
        else:
            # Higher layers: must be fully supported AND span at least 2 different tiles below
            tiles_below = set()
            for r, c in cells:
                below = self._get_cell(board, layer - 1, r, c)
                if below is None:
                    return False  # not fully supported
                tiles_below.add(f"{below}_{r}_{c}")

            # Must rest on at least 2 different tile placements
            below_values = set()
            for r, c in cells:
                val = self._get_cell(board, layer - 1, r, c)
                below_values.add(val)
            return len(below_values) >= 2

    def _place_tile(self, player, layer, row, col, shape, number):
        sp = str(player)
        board = self.boards[sp]
        for dr, dc in shape:
            self._set_cell(board, layer, row + dr, col + dc, number)

    def _score(self, player):
        sp = str(player)
        board = self.boards[sp]
        total = 0
        for layer in range(MAX_LAYERS):
            for r in range(GRID_SIZE):
                for c in range(GRID_SIZE):
                    val = self._get_cell(board, layer, r, c)
                    if val is not None:
                        total += val * layer
        return total

    def _display_board(self, player):
        sp = str(player)
        board = self.boards[sp]
        # Find bounds of placed tiles
        min_r, max_r, min_c, max_c = GRID_SIZE, 0, GRID_SIZE, 0
        max_layer = 0
        for layer in range(MAX_LAYERS):
            for r in range(GRID_SIZE):
                for c in range(GRID_SIZE):
                    if self._get_cell(board, layer, r, c) is not None:
                        min_r = min(min_r, r)
                        max_r = max(max_r, r)
                        min_c = min(min_c, c)
                        max_c = max(max_c, c)
                        max_layer = max(max_layer, layer)

        if max_r < min_r:
            print("    (empty)")
            return

        # Expand view slightly
        min_r = max(0, min_r - 1)
        max_r = min(GRID_SIZE - 1, max_r + 1)
        min_c = max(0, min_c - 1)
        max_c = min(GRID_SIZE - 1, max_c + 1)

        # Show top-down view with highest layer value
        header = "      " + "".join(f"{c:3d}" for c in range(min_c, max_c + 1))
        print(header)
        for r in range(min_r, max_r + 1):
            row_s = f"    {r:2d} "
            for c in range(min_c, max_c + 1):
                # Show the highest layer's content
                cell = "  ."
                for layer in range(max_layer, -1, -1):
                    val = self._get_cell(board, layer, r, c)
                    if val is not None:
                        cell = f" {val}{layer}"
                        break
                row_s += cell
            print(row_s)

    def display(self):
        clear_screen()
        mode = "NMBR 9++" if self.use_plus else "NMBR 9"
        print(f"{'=' * 60}")
        print(f"  {mode} | Tiles played: {self.tiles_played}/{self.total_tiles}")
        print(f"{'=' * 60}")

        for p in [1, 2]:
            marker = " <<" if p == self.current_player else ""
            score = self._score(p)
            print(f"  {self.players[p-1]}: Score={score}{marker}")
            self._display_board(p)
            print()

        if self.current_tile is not None:
            shape = self._get_shape(self.current_tile)
            print(f"  Current tile: {self.current_tile}")
            max_r = max(dr for dr, dc in shape) + 1
            max_c = max(dc for dr, dc in shape) + 1
            grid = [["." for _ in range(max_c)] for _ in range(max_r)]
            for dr, dc in shape:
                grid[dr][dc] = str(self.current_tile)
            for row in grid:
                print(f"    {''.join(row)}")
        print()
        if self.log:
            print(f"  Last: {self.log[-1]}")
        print()

    def get_move(self):
        cp = self.current_player
        if self.current_tile is None:
            return None

        print(f"  {self.players[cp-1]}, place tile {self.current_tile}.")
        print("  Rotation: 0=none, 1=90, 2=180, 3=270, add 'f' to flip (e.g. '1f')")
        rot_input = input_with_quit("  Rotation: ").strip().lower()
        do_flip = 'f' in rot_input
        rot_input = rot_input.replace('f', '')
        try:
            rotation = int(rot_input) if rot_input else 0
        except ValueError:
            return None

        pos = input_with_quit("  Position (layer,row,col): ").strip()
        try:
            parts = pos.split(",")
            layer, row, col = int(parts[0]), int(parts[1]), int(parts[2])
        except (ValueError, IndexError):
            return None

        return {"action": "place", "layer": layer, "row": row, "col": col,
                "rotation": rotation, "flip": do_flip}

    def make_move(self, move):
        if move is None:
            return False
        cp = self.current_player
        action = move["action"]

        if action == "place":
            layer = move["layer"]
            row, col = move["row"], move["col"]
            rotation = move.get("rotation", 0)
            do_flip = move.get("flip", False)

            number = self.current_tile
            shape = self._get_shape(number)
            shape = rotate_shape(shape, rotation)
            if do_flip:
                shape = flip_shape(shape)

            if layer < 0 or layer >= MAX_LAYERS:
                return False
            if not self._can_place(cp, layer, row, col, shape):
                return False

            self._place_tile(cp, layer, row, col, shape, number)
            self.log.append(
                f"{self.players[cp-1]} placed {number} at layer {layer}, ({row},{col})")

            # Both players place the same tile
            if cp == 1:
                self.current_player = 2
                return True
            else:
                self.tiles_played += 1
                if self.deck:
                    self.current_tile = self.deck.pop()
                else:
                    self.current_tile = None
                self.current_player = 1
                return True

        return False

    def check_game_over(self):
        if self.current_tile is None and self.tiles_played >= self.total_tiles:
            self.game_over = True
            s1 = self._score(1)
            s2 = self._score(2)
            if s1 > s2:
                self.winner = 1
            elif s2 > s1:
                self.winner = 2
            else:
                self.winner = None

    def get_state(self):
        return {
            "boards": self.boards,
            "deck": self.deck,
            "current_tile": self.current_tile,
            "tiles_played": self.tiles_played,
            "total_tiles": self.total_tiles,
            "log": self.log,
        }

    def load_state(self, state):
        self.boards = state["boards"]
        self.deck = state["deck"]
        self.current_tile = state["current_tile"]
        self.tiles_played = state["tiles_played"]
        self.total_tiles = state["total_tiles"]
        self.log = state.get("log", [])

    def get_tutorial(self):
        return """
============================================================
  NMBR 9 - Tutorial
============================================================

  OVERVIEW:
  Place number-shaped tiles (0-9) on a shared grid to build
  layers. Tiles on higher layers score their number value
  multiplied by the layer number.

  PLACEMENT RULES:
  - Layer 0: Place anywhere, but must be adjacent to existing tiles
    (first tile can go anywhere)
  - Layer 1+: Must be FULLY supported by tiles below AND must
    rest on at least 2 DIFFERENT tile numbers
  - Tiles cannot overlap on the same layer

  TILE MANIPULATION:
  - Rotate: 0=none, 1=90deg, 2=180deg, 3=270deg
  - Flip: Add 'f' to rotation (e.g., '1f' = rotate 90 + flip)

  SCORING:
  - tile_value x layer_number for each cell
  - Layer 0 tiles score 0 (0 x value = 0)
  - Layer 1 tiles score 1 x value per cell
  - Layer 2 tiles score 2 x value per cell, etc.

  BOARD DISPLAY:
  - Each cell shows: [number][layer] (e.g., "52" = tile 5 on layer 2)
  - "." = empty space

  WINNING: After all tiles placed, highest score wins!
============================================================
"""
