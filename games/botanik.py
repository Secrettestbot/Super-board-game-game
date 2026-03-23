"""Botanik - Tile-drafting greenhouse building game."""

import random

from engine.base import BaseGame, input_with_quit, clear_screen


# Plant types
FLOWER = "F"
TREE = "T"
SHRUB = "S"
EMPTY = "."

PLANT_NAMES = {FLOWER: "Flower", TREE: "Tree", SHRUB: "Shrub", EMPTY: "Empty"}
PLANT_SYMBOLS = {FLOWER: "*", TREE: "T", SHRUB: "s", EMPTY: "."}

# Pipe directions: N, E, S, W
PIPE_DIRS = ["N", "E", "S", "W"]
OPPOSITE = {"N": "S", "S": "N", "E": "W", "W": "E"}
DIR_DELTA = {"N": (-1, 0), "S": (1, 0), "E": (0, 1), "W": (0, -1)}


def _generate_tile():
    """Generate a random plant tile with pipe connections."""
    plant = random.choice([FLOWER, TREE, SHRUB])
    # Each tile has 2-3 pipe openings
    num_pipes = random.choice([2, 2, 3])
    pipes = sorted(random.sample(PIPE_DIRS, num_pipes))
    value = random.randint(1, 3)
    return {"plant": plant, "pipes": pipes, "value": value}


def _tile_display(tile):
    """Return a compact string representation of a tile."""
    if tile is None:
        return " .... "
    plant = PLANT_SYMBOLS[tile["plant"]]
    pipes = "".join(d[0] for d in tile["pipes"])
    return f"{plant}{tile['value']}({pipes})"


def _tile_art(tile, width=7):
    """Return 3-line ASCII art for a tile."""
    if tile is None:
        return [
            "+-----+",
            "|     |",
            "+-----+",
        ]
    n = "|" if "N" in tile["pipes"] else " "
    s = "|" if "S" in tile["pipes"] else " "
    e = "-" if "E" in tile["pipes"] else " "
    w = "-" if "W" in tile["pipes"] else " "
    plant = PLANT_SYMBOLS[tile["plant"]]
    val = str(tile["value"])
    return [
        f"+--{n}--+",
        f"|{w} {plant}{val} {e}|",
        f"+--{s}--+",
    ]


class BotanikGame(BaseGame):
    """Botanik: Draft plant tiles and build your greenhouse."""

    name = "Botanik"
    description = "Tile-drafting greenhouse building game"
    min_players = 2
    max_players = 2
    variations = {
        "standard": "Standard (4x4 greenhouse grid)",
        "large": "Large (5x5 greenhouse grid)",
    }

    def __init__(self, variation=None):
        super().__init__(variation)
        self.grid_size = 4
        self.grids = [[], []]  # personal greenhouse grids
        self.display_tiles = []  # shared display of available tiles
        self.display_size = 4  # tiles in display at a time
        self.tile_bag = []
        self.scores = [0, 0]
        self.tiles_placed = [0, 0]
        self.round_number = 0
        self.phase = "draft"  # "draft" or "place"
        self.drafted_tile = None

    def setup(self):
        if self.variation == "large":
            self.grid_size = 5
            self.display_size = 5
        else:
            self.grid_size = 4
            self.display_size = 4

        # Initialize empty grids
        self.grids = [
            [[None for _ in range(self.grid_size)] for _ in range(self.grid_size)]
            for _ in range(2)
        ]

        # Generate tile bag
        total_tiles = self.grid_size * self.grid_size * 2 + 10  # extra tiles
        self.tile_bag = [_generate_tile() for _ in range(total_tiles)]
        random.shuffle(self.tile_bag)

        # Fill display
        self.display_tiles = []
        self._refill_display()

        self.scores = [0, 0]
        self.tiles_placed = [0, 0]
        self.round_number = 1
        self.phase = "draft"
        self.drafted_tile = None

    def _refill_display(self):
        """Refill the display to full."""
        while len(self.display_tiles) < self.display_size and self.tile_bag:
            self.display_tiles.append(self.tile_bag.pop())

    def _count_connected_group(self, player_idx, start_r, start_c, visited):
        """BFS to find connected group of same plant type."""
        grid = self.grids[player_idx]
        if grid[start_r][start_c] is None:
            return 0, set()
        plant_type = grid[start_r][start_c]["plant"]
        queue = [(start_r, start_c)]
        group = set()
        while queue:
            r, c = queue.pop(0)
            if (r, c) in visited or (r, c) in group:
                continue
            if r < 0 or r >= self.grid_size or c < 0 or c >= self.grid_size:
                continue
            cell = grid[r][c]
            if cell is None or cell["plant"] != plant_type:
                continue
            group.add((r, c))
            for dr, dc in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
                queue.append((r + dr, c + dc))
        return len(group), group

    def _count_pipe_connections(self, player_idx):
        """Count matching pipe connections in a grid."""
        grid = self.grids[player_idx]
        connections = 0
        for r in range(self.grid_size):
            for c in range(self.grid_size):
                if grid[r][c] is None:
                    continue
                for d in grid[r][c]["pipes"]:
                    dr, dc = DIR_DELTA[d]
                    nr, nc = r + dr, c + dc
                    if 0 <= nr < self.grid_size and 0 <= nc < self.grid_size:
                        neighbor = grid[nr][nc]
                        if neighbor is not None and OPPOSITE[d] in neighbor["pipes"]:
                            connections += 1
        return connections // 2  # each connection counted twice

    def _calculate_scores(self):
        """Calculate scores for both players."""
        for p in range(2):
            score = 0
            visited = set()
            # Score connected groups
            for r in range(self.grid_size):
                for c in range(self.grid_size):
                    if (r, c) not in visited and self.grids[p][r][c] is not None:
                        size, group = self._count_connected_group(p, r, c, visited)
                        visited |= group
                        # Group bonus: size^2 points for groups of 3+
                        if size >= 3:
                            score += size * size
                        else:
                            score += size
            # Pipe connection bonus
            score += self._count_pipe_connections(p) * 2
            # Tile value sum
            for r in range(self.grid_size):
                for c in range(self.grid_size):
                    if self.grids[p][r][c] is not None:
                        score += self.grids[p][r][c]["value"]
            self.scores[p] = score

    def _check_pipe_match(self, player_idx, r, c, tile):
        """Check if placing tile at (r,c) has at least one matching pipe connection."""
        grid = self.grids[player_idx]
        # If grid is empty, any placement is fine
        has_any_tile = False
        for gr in range(self.grid_size):
            for gc in range(self.grid_size):
                if grid[gr][gc] is not None:
                    has_any_tile = True
                    break
            if has_any_tile:
                break

        if not has_any_tile:
            return True

        # Must be adjacent to an existing tile
        adjacent = False
        for d in PIPE_DIRS:
            dr, dc = DIR_DELTA[d]
            nr, nc = r + dr, c + dc
            if 0 <= nr < self.grid_size and 0 <= nc < self.grid_size:
                if grid[nr][nc] is not None:
                    adjacent = True
                    break
        return adjacent

    def display(self):
        clear_screen()
        print(f"{'='*60}")
        print(f"  BOTANIK - {self.variations[self.variation]}")
        print(f"  Round {self.round_number} | {self.players[self.current_player - 1]}'s turn")
        print(f"  Scores: {self.players[0]}={self.scores[0]}  {self.players[1]}={self.scores[1]}")
        print(f"  Phase: {self.phase.upper()}")
        print(f"{'='*60}")

        # Display available tiles
        if self.phase == "draft":
            print("\n  Available Tiles:")
            for i, tile in enumerate(self.display_tiles):
                art = _tile_art(tile)
                print(f"    [{i}] {art[0]}")
                print(f"        {art[1]}  {PLANT_NAMES[tile['plant']]} (val {tile['value']})")
                print(f"        {art[2]}  Pipes: {','.join(tile['pipes'])}")
            print()

        if self.drafted_tile and self.phase == "place":
            print("  Drafted tile:")
            art = _tile_art(self.drafted_tile)
            for line in art:
                print(f"    {line}")
            print(f"    {PLANT_NAMES[self.drafted_tile['plant']]} "
                  f"val={self.drafted_tile['value']} "
                  f"pipes={','.join(self.drafted_tile['pipes'])}")
            print()

        # Display both greenhouses
        for p in range(2):
            marker = " <<" if self.current_player == p + 1 else ""
            print(f"  {self.players[p]}'s Greenhouse (score: {self.scores[p]}){marker}")
            # Column headers
            hdr = "     "
            for c in range(self.grid_size):
                hdr += f"   {c}   "
            print(hdr)

            for line_idx in range(3):
                row_strs = []
                for r in range(self.grid_size):
                    if line_idx == 0:
                        row_strs.append(f"  {r} ")
                    else:
                        row_strs.append("    ")
                    for c in range(self.grid_size):
                        art = _tile_art(self.grids[p][r][c])
                        row_strs[-1] = ""

                # Print row by row with art
                for r in range(self.grid_size):
                    arts = [_tile_art(self.grids[p][r][c]) for c in range(self.grid_size)]
                    for line in range(3):
                        prefix = f"  {r} " if line == 1 else "    "
                        row_line = prefix
                        for a in arts:
                            row_line += a[line]
                        print(row_line)

            print()

    def get_move(self):
        if self.phase == "draft":
            if not self.display_tiles:
                return "no_tiles"
            print(f"  Choose a tile to draft [0-{len(self.display_tiles) - 1}]: ", end="")
            choice = input_with_quit("")
            return ("draft", choice)
        else:
            # Place phase
            valid = []
            grid = self.grids[self.current_player - 1]
            for r in range(self.grid_size):
                for c in range(self.grid_size):
                    if grid[r][c] is None:
                        if self._check_pipe_match(self.current_player - 1, r, c,
                                                  self.drafted_tile):
                            valid.append((r, c))
            if not valid:
                print("  No valid placements! Tile discarded.")
                input_with_quit("  Press Enter to continue: ")
                return ("discard",)

            print("  Valid positions: " + ", ".join(f"({r},{c})" for r, c in valid))
            move = input_with_quit("  Place tile at (row,col): ")
            return ("place", move)

    def make_move(self, move):
        if move == "no_tiles":
            self._calculate_scores()
            return True

        if move[0] == "draft":
            try:
                idx = int(move[1].strip())
            except (ValueError, IndexError):
                return False
            if idx < 0 or idx >= len(self.display_tiles):
                return False
            self.drafted_tile = self.display_tiles.pop(idx)
            self.phase = "place"
            return True

        if move[0] == "discard":
            self.drafted_tile = None
            self.phase = "draft"
            self._refill_display()
            self.round_number += 1
            self._calculate_scores()
            return True

        if move[0] == "place":
            try:
                parts = move[1].strip().strip("()").split(",")
                r, c = int(parts[0].strip()), int(parts[1].strip())
            except (ValueError, IndexError):
                return False

            p = self.current_player - 1
            if r < 0 or r >= self.grid_size or c < 0 or c >= self.grid_size:
                return False
            if self.grids[p][r][c] is not None:
                return False
            if not self._check_pipe_match(p, r, c, self.drafted_tile):
                return False

            self.grids[p][r][c] = self.drafted_tile
            self.tiles_placed[p] += 1
            self.drafted_tile = None
            self.phase = "draft"
            self._refill_display()
            self.round_number += 1
            self._calculate_scores()
            return True

        return False

    def check_game_over(self):
        # Game ends when both grids are full or no tiles remain
        both_full = all(
            self.tiles_placed[p] >= self.grid_size * self.grid_size for p in range(2)
        )
        no_tiles = not self.tile_bag and not self.display_tiles

        if both_full or no_tiles:
            self._calculate_scores()
            self.game_over = True
            if self.scores[0] > self.scores[1]:
                self.winner = 1
            elif self.scores[1] > self.scores[0]:
                self.winner = 2
            else:
                self.winner = None

    def get_state(self):
        grids_data = []
        for p in range(2):
            grid_data = []
            for r in range(self.grid_size):
                row_data = []
                for c in range(self.grid_size):
                    cell = self.grids[p][r][c]
                    if cell is None:
                        row_data.append(None)
                    else:
                        row_data.append({
                            "plant": cell["plant"],
                            "pipes": cell["pipes"],
                            "value": cell["value"],
                        })
                grid_data.append(row_data)
            grids_data.append(grid_data)

        display_data = [
            {"plant": t["plant"], "pipes": t["pipes"], "value": t["value"]}
            for t in self.display_tiles
        ]
        bag_data = [
            {"plant": t["plant"], "pipes": t["pipes"], "value": t["value"]}
            for t in self.tile_bag
        ]
        drafted = None
        if self.drafted_tile:
            drafted = {
                "plant": self.drafted_tile["plant"],
                "pipes": self.drafted_tile["pipes"],
                "value": self.drafted_tile["value"],
            }

        return {
            "grid_size": self.grid_size,
            "grids": grids_data,
            "display_tiles": display_data,
            "tile_bag": bag_data,
            "scores": self.scores,
            "tiles_placed": self.tiles_placed,
            "round_number": self.round_number,
            "phase": self.phase,
            "drafted_tile": drafted,
            "display_size": self.display_size,
        }

    def load_state(self, state):
        self.grid_size = state["grid_size"]
        self.display_size = state["display_size"]
        self.grids = []
        for p in range(2):
            grid = []
            for row_data in state["grids"][p]:
                row = []
                for cell in row_data:
                    row.append(cell)  # already dict or None
                grid.append(row)
            self.grids.append(grid)
        self.display_tiles = state["display_tiles"]
        self.tile_bag = state["tile_bag"]
        self.scores = list(state["scores"])
        self.tiles_placed = list(state["tiles_placed"])
        self.round_number = state["round_number"]
        self.phase = state["phase"]
        self.drafted_tile = state["drafted_tile"]

    def get_tutorial(self):
        return """
==========================================
  BOTANIK - Tutorial
==========================================

Build the most beautiful greenhouse by drafting and placing plant tiles!

GAMEPLAY:
  Each turn has two phases:
  1. DRAFT: Pick one tile from the shared display
  2. PLACE: Put it in your personal greenhouse grid

TILES:
  Each tile has:
  - A plant type: Flower (*), Tree (T), or Shrub (s)
  - A point value (1-3)
  - Pipe connections (N/E/S/W) shown on tile edges

PLACEMENT RULES:
  - Tiles must be placed adjacent to existing tiles
  - The first tile can go anywhere in your grid

SCORING:
  - Connected groups of same plant: size^2 points if 3+, else 1 per tile
  - Matching pipe connections between adjacent tiles: 2 points each
  - Tile values are added to your score

  Example: A group of 4 Flowers = 16 points!

CONTROLS:
  Draft: Enter tile number (0-3)
  Place: Enter row,col (e.g., 1,2)

STRATEGY:
  - Build large connected groups of the same plant type
  - Match pipe connections for bonus points
  - Watch what your opponent drafts to deny them key tiles
"""
