"""Dokmus - Grid exploration temple game."""

import random
import copy
from engine.base import BaseGame, input_with_quit, clear_screen


# Terrain types
FOREST = "F"
MOUNTAIN = "M"
WATER = "W"
RUINS = "R"
TEMPLE = "T"
EMPTY = "."

TERRAIN_DISPLAY = {
    FOREST: " F ",
    MOUNTAIN: " M ",
    WATER: " ~ ",
    RUINS: " R ",
    TEMPLE: " T ",
    EMPTY: " . ",
}

# Player tokens
P1_TOKEN = " 1 "
P2_TOKEN = " 2 "


def _generate_tile(tile_id, has_temple=True):
    """Generate a 5x5 terrain tile."""
    grid = []
    for r in range(5):
        row = []
        for c in range(5):
            # Edges are more likely forest, center more varied
            roll = random.random()
            if roll < 0.40:
                row.append(FOREST)
            elif roll < 0.55:
                row.append(MOUNTAIN)
            elif roll < 0.70:
                row.append(WATER)
            elif roll < 0.80:
                row.append(RUINS)
            else:
                row.append(EMPTY)
        grid.append(row)

    # Place a temple in a random non-edge cell
    if has_temple:
        tr = random.randint(1, 3)
        tc = random.randint(1, 3)
        grid[tr][tc] = TEMPLE

    return {"id": tile_id, "grid": grid, "tokens": {}}


class DokmusGame(BaseGame):
    """Dokmus: Explore tiles, place tokens, reach temples."""

    name = "Dokmus"
    description = "Grid exploration temple game - shift tiles, place tokens, reach temples"
    min_players = 2
    max_players = 2
    variations = {
        "standard": "Standard map (8 tiles, 2x4 grid)",
        "small": "Small map (4 tiles, 2x2 grid)",
        "large": "Large map (8 tiles, 4x2, more temples)",
    }

    def __init__(self, variation=None):
        super().__init__(variation)
        self.tile_count = 8
        self.grid_rows = 2
        self.grid_cols = 4
        self.tiles = []
        self.tile_layout = []  # 2D array of tile indices
        self.player_tokens_remaining = [25, 25]
        self.player_tokens_placed = [0, 0]
        self.phase = "manipulate"  # manipulate or place
        self.tokens_placed_this_turn = 0
        self.max_place_per_turn = 3
        self.round_number = 0
        self.max_rounds = 8

    def setup(self):
        if self.variation == "small":
            self.tile_count = 4
            self.grid_rows = 2
            self.grid_cols = 2
            self.max_rounds = 6
            self.player_tokens_remaining = [15, 15]
        elif self.variation == "large":
            self.tile_count = 8
            self.grid_rows = 4
            self.grid_cols = 2
            self.max_rounds = 10

        # Generate tiles
        self.tiles = []
        for i in range(self.tile_count):
            self.tiles.append(_generate_tile(i, has_temple=True))

        # Layout: 2D grid of tile indices
        self.tile_layout = []
        idx = 0
        for r in range(self.grid_rows):
            row = []
            for c in range(self.grid_cols):
                row.append(idx)
                idx += 1
            self.tile_layout.append(row)

        self.round_number = 1
        self.phase = "manipulate"

    def _get_cell(self, global_r, global_c):
        """Get terrain at global coordinates (across all tiles)."""
        tile_r = global_r // 5
        tile_c = global_c // 5
        if tile_r < 0 or tile_r >= self.grid_rows:
            return None
        if tile_c < 0 or tile_c >= self.grid_cols:
            return None
        local_r = global_r % 5
        local_c = global_c % 5
        tile_idx = self.tile_layout[tile_r][tile_c]
        return self.tiles[tile_idx]["grid"][local_r][local_c]

    def _get_token_at(self, global_r, global_c):
        """Get token player at global coordinates, or None."""
        tile_r = global_r // 5
        tile_c = global_c // 5
        if tile_r < 0 or tile_r >= self.grid_rows:
            return None
        if tile_c < 0 or tile_c >= self.grid_cols:
            return None
        local_r = global_r % 5
        local_c = global_c % 5
        tile_idx = self.tile_layout[tile_r][tile_c]
        key = f"{local_r},{local_c}"
        return self.tiles[tile_idx]["tokens"].get(key)

    def _set_token_at(self, global_r, global_c, player):
        """Place a token at global coordinates."""
        tile_r = global_r // 5
        tile_c = global_c // 5
        local_r = global_r % 5
        local_c = global_c % 5
        tile_idx = self.tile_layout[tile_r][tile_c]
        key = f"{local_r},{local_c}"
        self.tiles[tile_idx]["tokens"][key] = player

    def _is_edge_cell(self, global_r, global_c):
        """Check if a cell is on the edge of the entire map."""
        total_r = self.grid_rows * 5
        total_c = self.grid_cols * 5
        return (global_r == 0 or global_r == total_r - 1 or
                global_c == 0 or global_c == total_c - 1)

    def _is_adjacent_to_own_token(self, global_r, global_c, player):
        """Check if cell is adjacent to one of the player's tokens."""
        for dr, dc in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
            nr, nc = global_r + dr, global_c + dc
            if self._get_token_at(nr, nc) == player:
                return True
        return False

    def _can_place_token(self, global_r, global_c, player):
        """Check if a token can be placed here."""
        total_r = self.grid_rows * 5
        total_c = self.grid_cols * 5
        if global_r < 0 or global_r >= total_r or global_c < 0 or global_c >= total_c:
            return False

        terrain = self._get_cell(global_r, global_c)
        if terrain is None or terrain == MOUNTAIN or terrain == WATER:
            return False

        if self._get_token_at(global_r, global_c) is not None:
            return False

        p_idx = player - 1
        # First token must be on edge
        if self.player_tokens_placed[p_idx] == 0:
            return self._is_edge_cell(global_r, global_c)

        # Subsequent tokens must be adjacent to existing token or on edge
        return self._is_edge_cell(global_r, global_c) or \
               self._is_adjacent_to_own_token(global_r, global_c, player)

    def display(self):
        clear_screen()
        p = self.current_player - 1
        total_r = self.grid_rows * 5
        total_c = self.grid_cols * 5

        print(f"{'='*65}")
        print(f"  DOKMUS - Round {self.round_number}/{self.max_rounds} | Phase: {self.phase.upper()}")
        print(f"  {self.players[p]}'s turn | Tokens left: P1={self.player_tokens_remaining[0]} P2={self.player_tokens_remaining[1]}")
        print(f"{'='*65}")
        print()

        # Column numbers
        header = "     "
        for c in range(total_c):
            if c % 5 == 0 and c > 0:
                header += "|"
            header += f"{c:^3}"
        print(header)

        sep_line = "     " + "+".join(["---" * 5] * self.grid_cols)
        print(sep_line)

        for r in range(total_r):
            if r > 0 and r % 5 == 0:
                print(sep_line)

            line = f"  {r:2} "
            for c in range(total_c):
                if c > 0 and c % 5 == 0:
                    line += "|"
                token = self._get_token_at(r, c)
                if token is not None:
                    line += P1_TOKEN if token == 1 else P2_TOKEN
                else:
                    terrain = self._get_cell(r, c)
                    line += TERRAIN_DISPLAY.get(terrain, " ? ")
            print(line)

        print()
        print("  Legend: F=Forest .=Open R=Ruins T=Temple M=Mountain ~=Water")
        print(f"         1=P1 token  2=P2 token")
        print()

        # Scores
        s1 = self._calc_score(1)
        s2 = self._calc_score(2)
        print(f"  SCORES: {self.players[0]}: {s1} pts | {self.players[1]}: {s2} pts")
        print()

    def get_move(self):
        p = self.current_player - 1

        if self.phase == "manipulate":
            print("  MANIPULATE PHASE - Shift or rotate a tile:")
            print("    shift <tile_row> <tile_col> <direction>  - Shift a tile (up/down/left/right)")
            print("    rotate <tile_row> <tile_col>             - Rotate tile 90 degrees clockwise")
            print("    skip                                     - Skip to placement phase")
            print()
            print(f"  Tile grid is {self.grid_rows}x{self.grid_cols} (row 0-{self.grid_rows-1}, col 0-{self.grid_cols-1})")
        elif self.phase == "place":
            remaining = self.max_place_per_turn - self.tokens_placed_this_turn
            print(f"  PLACEMENT PHASE - Place tokens ({remaining} remaining):")
            print("    place <row> <col>  - Place a token at global coordinates")
            print("    done               - End turn")

        print()
        move = input_with_quit(f"  {self.players[p]}> ")
        return move.strip()

    def make_move(self, move):
        p = self.current_player - 1
        parts = move.lower().split()
        if not parts:
            return False

        action = parts[0]

        if self.phase == "manipulate":
            if action == "shift":
                return self._do_shift(parts)
            elif action == "rotate":
                return self._do_rotate(parts)
            elif action == "skip":
                self.phase = "place"
                self.tokens_placed_this_turn = 0
                return True
            return False

        elif self.phase == "place":
            if action == "place":
                return self._do_place(p, parts)
            elif action == "done":
                self.phase = "manipulate"
                self.tokens_placed_this_turn = 0
                self.round_number += 1
                return True
            return False

        return False

    def _do_shift(self, parts):
        """Shift a row or column of tiles."""
        if len(parts) < 4:
            print("  Usage: shift <tile_row> <tile_col> <up/down/left/right>")
            input("  Press Enter...")
            return False
        try:
            tr = int(parts[1])
            tc = int(parts[2])
        except ValueError:
            return False
        direction = parts[3]

        if tr < 0 or tr >= self.grid_rows or tc < 0 or tc >= self.grid_cols:
            print("  Invalid tile position.")
            input("  Press Enter...")
            return False

        if direction == "up" and self.grid_rows > 1:
            # Shift the column up: move tiles in column tc
            col = [self.tile_layout[r][tc] for r in range(self.grid_rows)]
            col = col[1:] + [col[0]]  # shift up
            for r in range(self.grid_rows):
                self.tile_layout[r][tc] = col[r]
        elif direction == "down" and self.grid_rows > 1:
            col = [self.tile_layout[r][tc] for r in range(self.grid_rows)]
            col = [col[-1]] + col[:-1]
            for r in range(self.grid_rows):
                self.tile_layout[r][tc] = col[r]
        elif direction == "left" and self.grid_cols > 1:
            row = self.tile_layout[tr]
            self.tile_layout[tr] = row[1:] + [row[0]]
        elif direction == "right" and self.grid_cols > 1:
            row = self.tile_layout[tr]
            self.tile_layout[tr] = [row[-1]] + row[:-1]
        else:
            print("  Invalid direction or grid too small.")
            input("  Press Enter...")
            return False

        self.phase = "place"
        self.tokens_placed_this_turn = 0
        return True

    def _do_rotate(self, parts):
        """Rotate a tile 90 degrees clockwise."""
        if len(parts) < 3:
            print("  Usage: rotate <tile_row> <tile_col>")
            input("  Press Enter...")
            return False
        try:
            tr = int(parts[1])
            tc = int(parts[2])
        except ValueError:
            return False

        if tr < 0 or tr >= self.grid_rows or tc < 0 or tc >= self.grid_cols:
            print("  Invalid tile position.")
            input("  Press Enter...")
            return False

        tile_idx = self.tile_layout[tr][tc]
        tile = self.tiles[tile_idx]

        # Rotate grid 90 degrees clockwise
        old_grid = tile["grid"]
        n = 5
        new_grid = [[old_grid[n - 1 - c][r] for c in range(n)] for r in range(n)]
        tile["grid"] = new_grid

        # Rotate token positions
        new_tokens = {}
        for key, val in tile["tokens"].items():
            r, c = map(int, key.split(","))
            new_r = c
            new_c = n - 1 - r
            new_tokens[f"{new_r},{new_c}"] = val
        tile["tokens"] = new_tokens

        self.phase = "place"
        self.tokens_placed_this_turn = 0
        return True

    def _do_place(self, p, parts):
        if len(parts) < 3:
            print("  Usage: place <row> <col>")
            input("  Press Enter...")
            return False
        try:
            r = int(parts[1])
            c = int(parts[2])
        except ValueError:
            return False

        player = p + 1

        if self.player_tokens_remaining[p] <= 0:
            print("  No tokens remaining!")
            input("  Press Enter...")
            return False

        if self.tokens_placed_this_turn >= self.max_place_per_turn:
            print(f"  Already placed {self.max_place_per_turn} tokens this turn. Type 'done'.")
            input("  Press Enter...")
            return False

        if not self._can_place_token(r, c, player):
            terrain = self._get_cell(r, c)
            if terrain == MOUNTAIN:
                print("  Can't place on mountains!")
            elif terrain == WATER:
                print("  Can't place on water!")
            elif self._get_token_at(r, c) is not None:
                print("  Cell already occupied!")
            else:
                print("  Must place adjacent to your existing tokens or on a map edge!")
            input("  Press Enter...")
            return False

        self._set_token_at(r, c, player)
        self.player_tokens_remaining[p] -= 1
        self.player_tokens_placed[p] += 1
        self.tokens_placed_this_turn += 1

        if self.tokens_placed_this_turn >= self.max_place_per_turn:
            print(f"  Placed {self.max_place_per_turn} tokens. Turn ending.")
            input("  Press Enter...")
            self.phase = "manipulate"
            self.tokens_placed_this_turn = 0
            self.round_number += 1

        return True

    def _calc_score(self, player):
        """Calculate score for a player."""
        total_r = self.grid_rows * 5
        total_c = self.grid_cols * 5
        score = 0

        # Points for temples reached
        for r in range(total_r):
            for c in range(total_c):
                if self._get_token_at(r, c) == player and self._get_cell(r, c) == TEMPLE:
                    score += 5

        # Points for ruins reached
        for r in range(total_r):
            for c in range(total_c):
                if self._get_token_at(r, c) == player and self._get_cell(r, c) == RUINS:
                    score += 2

        # Points for largest connected group
        visited = set()
        largest = 0
        for r in range(total_r):
            for c in range(total_c):
                if self._get_token_at(r, c) == player and (r, c) not in visited:
                    size = self._flood_fill(r, c, player, visited)
                    largest = max(largest, size)
        score += largest

        # Bonus for connected groups across different tiles
        tiles_reached = set()
        for r in range(total_r):
            for c in range(total_c):
                if self._get_token_at(r, c) == player:
                    tile_r = r // 5
                    tile_c = c // 5
                    tiles_reached.add(f"{tile_r},{tile_c}")
        if len(tiles_reached) >= 3:
            score += 3
        if len(tiles_reached) >= self.tile_count:
            score += 10

        return score

    def _flood_fill(self, start_r, start_c, player, visited):
        """Count connected tokens of the same player."""
        stack = [(start_r, start_c)]
        count = 0
        while stack:
            r, c = stack.pop()
            if (r, c) in visited:
                continue
            if self._get_token_at(r, c) != player:
                continue
            visited.add((r, c))
            count += 1
            for dr, dc in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
                nr, nc = r + dr, c + dc
                if (nr, nc) not in visited:
                    stack.append((nr, nc))
        return count

    def check_game_over(self):
        if self.round_number > self.max_rounds:
            self.game_over = True
            s1 = self._calc_score(1)
            s2 = self._calc_score(2)
            if s1 > s2:
                self.winner = 1
            elif s2 > s1:
                self.winner = 2
            else:
                self.winner = None
        # Also end if both players out of tokens
        if self.player_tokens_remaining[0] <= 0 and self.player_tokens_remaining[1] <= 0:
            self.game_over = True
            s1 = self._calc_score(1)
            s2 = self._calc_score(2)
            if s1 > s2:
                self.winner = 1
            elif s2 > s1:
                self.winner = 2
            else:
                self.winner = None

    def get_state(self):
        # Convert tile tokens (which use string keys already) to serializable form
        tiles_data = []
        for tile in self.tiles:
            tiles_data.append({
                "id": tile["id"],
                "grid": [row[:] for row in tile["grid"]],
                "tokens": dict(tile["tokens"]),
            })
        return {
            "tile_count": self.tile_count,
            "grid_rows": self.grid_rows,
            "grid_cols": self.grid_cols,
            "tiles": tiles_data,
            "tile_layout": [row[:] for row in self.tile_layout],
            "player_tokens_remaining": self.player_tokens_remaining[:],
            "player_tokens_placed": self.player_tokens_placed[:],
            "phase": self.phase,
            "tokens_placed_this_turn": self.tokens_placed_this_turn,
            "max_place_per_turn": self.max_place_per_turn,
            "round_number": self.round_number,
            "max_rounds": self.max_rounds,
        }

    def load_state(self, state):
        self.tile_count = state["tile_count"]
        self.grid_rows = state["grid_rows"]
        self.grid_cols = state["grid_cols"]
        self.tiles = state["tiles"]
        self.tile_layout = state["tile_layout"]
        self.player_tokens_remaining = state["player_tokens_remaining"]
        self.player_tokens_placed = state["player_tokens_placed"]
        self.phase = state["phase"]
        self.tokens_placed_this_turn = state["tokens_placed_this_turn"]
        self.max_place_per_turn = state["max_place_per_turn"]
        self.round_number = state["round_number"]
        self.max_rounds = state["max_rounds"]

    def get_tutorial(self):
        return """
====================================================
  DOKMUS - Tutorial
====================================================

OVERVIEW:
  Explore a modular map of tiles, placing tokens to
  reach ancient temples and ruins. Manipulate the
  map itself by shifting and rotating tiles!

MAP:
  The map is a grid of tiles (2x4 standard). Each
  tile is a 5x5 grid of terrain cells.

TERRAIN:
  F = Forest   - Can place tokens here
  . = Open     - Can place tokens here
  R = Ruins    - Worth 2 points when reached
  T = Temple   - Worth 5 points when reached
  M = Mountain - Impassable, cannot place tokens
  ~ = Water    - Impassable, cannot place tokens

EACH TURN HAS 2 PHASES:

1. MANIPULATE (choose one or skip):
   shift <row> <col> <direction>
     - Shift a row/column of tiles in a direction
     - Tokens on tiles move with them
   rotate <row> <col>
     - Rotate a tile 90 degrees clockwise
   skip - Go straight to placement

2. PLACE TOKENS (up to 3 per turn):
   place <row> <col>
     - Place on map edges or adjacent to your tokens
     - Cannot place on mountains or water
   done - End your turn

SCORING:
  - 5 points per temple reached
  - 2 points per ruins reached
  - Points for largest connected group
  - 3 bonus for reaching 3+ different tiles
  - 10 bonus for reaching ALL tiles

STRATEGY:
  - Shift tiles to connect your paths
  - Rotate to open pathways or block opponents
  - Spread across tiles for bonuses
====================================================
"""
