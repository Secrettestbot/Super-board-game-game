"""Kingdomino Duel - Roll-and-write domino kingdom builder.

Roll dice showing terrain types and crowns. Players draft dice pairs
to fill a grid. Score = territory_size * crowns_in_territory for each
connected region.
"""

import random

from engine.base import BaseGame, input_with_quit, clear_screen

TERRAINS = ["Wheat", "Forest", "Water", "Grass", "Swamp", "Mine"]
TERRAIN_ABBREV = {"Wheat": "W", "Forest": "F", "Water": "~", "Grass": "G",
                  "Swamp": "S", "Mine": "M", "Castle": "C", "Empty": "."}
TERRAIN_SHORT = {v: k for k, v in TERRAIN_ABBREV.items()}

# Each die face: (terrain, crowns)
DIE_FACES = [
    ("Wheat", 0), ("Wheat", 0), ("Forest", 0), ("Forest", 0), ("Water", 0), ("Water", 1),
    ("Grass", 0), ("Grass", 0), ("Grass", 1), ("Swamp", 0), ("Swamp", 1), ("Mine", 0),
    ("Mine", 1), ("Mine", 2), ("Forest", 1), ("Water", 0), ("Wheat", 1), ("Swamp", 0),
    ("Grass", 0), ("Forest", 0), ("Wheat", 0), ("Mine", 0), ("Swamp", 1), ("Water", 1),
]


def _roll_die():
    """Roll one die, returning (terrain, crowns)."""
    return random.choice(DIE_FACES)


class KingdominoDuelGame(BaseGame):
    """Kingdomino Duel - Roll-and-write kingdom builder."""

    name = "Kingdomino Duel"
    description = "Roll-and-write domino kingdom builder with dice drafting"
    min_players = 2
    max_players = 2
    variations = {
        "standard": "Standard game (5x5 grid)",
        "large": "Large game (7x7 grid)",
    }

    def __init__(self, variation=None):
        super().__init__(variation)
        if self.variation == "large":
            self.grid_size = 7
            self.max_turns = 24
        else:
            self.grid_size = 5
            self.max_turns = 12
        self.grids = {}  # player -> 2D list
        self.crowns = {}  # player -> 2D list of crown counts
        self.scores = {}
        self.dice_results = []
        self.available_pairs = []
        self.phase = "roll"  # roll, draft_p1, draft_p2
        self.log = []
        self.rounds_played = 0

    def setup(self):
        center = self.grid_size // 2
        for p in [1, 2]:
            sp = str(p)
            grid = [["Empty"] * self.grid_size for _ in range(self.grid_size)]
            crown_grid = [[0] * self.grid_size for _ in range(self.grid_size)]
            grid[center][center] = "Castle"
            self.grids[sp] = grid
            self.crowns[sp] = crown_grid
            self.scores[sp] = 0
        self.log = ["Game started! Roll dice to begin."]
        self._roll_dice()

    def _roll_dice(self):
        """Roll 4 dice and create pairs for drafting."""
        self.dice_results = [_roll_die() for _ in range(4)]
        # Sort dice by value for pairing
        self.available_pairs = [
            (0, 1), (0, 2), (0, 3), (1, 2), (1, 3), (2, 3)
        ]
        self.phase = "draft_p1"

    def _format_die(self, idx):
        terrain, crown = self.dice_results[idx]
        crown_str = f"+{'*' * crown}" if crown > 0 else ""
        return f"{TERRAIN_ABBREV[terrain]}{crown_str}"

    def _get_adjacent(self, row, col):
        """Get valid adjacent positions."""
        adj = []
        for dr, dc in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
            nr, nc = row + dr, col + dc
            if 0 <= nr < self.grid_size and 0 <= nc < self.grid_size:
                adj.append((nr, nc))
        return adj

    def _can_place(self, player, terrain, row, col):
        """Check if terrain can be placed at position."""
        sp = str(player)
        grid = self.grids[sp]
        if grid[row][col] != "Empty":
            return False
        # Must be adjacent to Castle or matching terrain
        for nr, nc in self._get_adjacent(row, col):
            adj_terrain = grid[nr][nc]
            if adj_terrain == "Castle" or adj_terrain == terrain or adj_terrain != "Empty":
                return True
        return False

    def _find_territory(self, player, row, col):
        """Find connected territory of same terrain type using BFS."""
        sp = str(player)
        grid = self.grids[sp]
        terrain = grid[row][col]
        if terrain in ("Empty", "Castle"):
            return [], 0
        visited = set()
        queue = [(row, col)]
        visited.add((row, col))
        total_crowns = 0
        while queue:
            r, c = queue.pop(0)
            total_crowns += self.crowns[sp][r][c]
            for nr, nc in self._get_adjacent(r, c):
                if (nr, nc) not in visited and grid[nr][nc] == terrain:
                    visited.add((nr, nc))
                    queue.append((nr, nc))
        return list(visited), total_crowns

    def _calculate_scores(self):
        """Calculate scores for both players."""
        for p in [1, 2]:
            sp = str(p)
            grid = self.grids[sp]
            scored = set()
            total = 0
            for r in range(self.grid_size):
                for c in range(self.grid_size):
                    if (r, c) not in scored and grid[r][c] not in ("Empty", "Castle"):
                        territory, crown_count = self._find_territory(p, r, c)
                        for pos in territory:
                            scored.add(pos)
                        total += len(territory) * crown_count
            self.scores[sp] = total

    def display(self):
        clear_screen()
        print(f"{'=' * 60}")
        print(f"  KINGDOMINO DUEL - {self.variation.title()} | Round {self.rounds_played + 1}/{self.max_turns}")
        print(f"{'=' * 60}")
        self._calculate_scores()
        for p in [1, 2]:
            sp = str(p)
            marker = " <<" if p == self.current_player else ""
            print(f"  {self.players[p-1]}: {self.scores[sp]} pts{marker}")
        print()
        # Display both grids side by side
        print(f"  {self.players[0]}'s Kingdom" + " " * (self.grid_size * 4) +
              f"{self.players[1]}'s Kingdom")
        header = "  " + " ".join(f"{c:>3}" for c in range(self.grid_size))
        print(header + "    " + header)
        for r in range(self.grid_size):
            row1 = f"  "
            row2 = f"  "
            for c in range(self.grid_size):
                t1 = self.grids["1"][r][c]
                t2 = self.grids["2"][r][c]
                cr1 = self.crowns["1"][r][c]
                cr2 = self.crowns["2"][r][c]
                c1_str = f"{'*' * cr1}" if cr1 > 0 else ""
                c2_str = f"{'*' * cr2}" if cr2 > 0 else ""
                row1 += f" {TERRAIN_ABBREV[t1]}{c1_str:>2}"
                row2 += f" {TERRAIN_ABBREV[t2]}{c2_str:>2}"
            print(f"{r} {row1}    {r} {row2}")
        print()
        # Show dice
        if self.dice_results:
            print("  Rolled Dice:")
            for i, (terrain, crown) in enumerate(self.dice_results):
                crown_str = f" +{'*' * crown}" if crown > 0 else ""
                print(f"    Die {i+1}: {terrain}{crown_str}")
            print()
            if self.available_pairs:
                print("  Available Pairs:")
                for pi, (a, b) in enumerate(self.available_pairs):
                    print(f"    [{pi+1}] Die {a+1} ({self._format_die(a)}) + "
                          f"Die {b+1} ({self._format_die(b)})")
        print()
        if self.log:
            print(f"  Last: {self.log[-1]}")
        print()

    def get_move(self):
        cp = self.current_player
        if not self.available_pairs:
            return {"action": "roll"}

        print(f"  {self.players[cp-1]}, choose a dice pair:")
        pair_input = input_with_quit("  Pair number: ").strip()
        try:
            pair_idx = int(pair_input) - 1
            if pair_idx < 0 or pair_idx >= len(self.available_pairs):
                return None
        except ValueError:
            return None

        a, b = self.available_pairs[pair_idx]
        placements = []
        for die_idx in [a, b]:
            terrain, crown = self.dice_results[die_idx]
            print(f"\n  Place {terrain}{'*' * crown if crown else ''} (Die {die_idx+1}):")
            pos_input = input_with_quit("  Position (row,col) or 'skip': ").strip()
            if pos_input.lower() == 'skip':
                placements.append({"die": die_idx, "skip": True})
            else:
                try:
                    parts = pos_input.split(",")
                    row, col = int(parts[0]), int(parts[1])
                    placements.append({"die": die_idx, "row": row, "col": col, "skip": False})
                except (ValueError, IndexError):
                    return None

        return {"action": "draft", "pair_idx": pair_idx, "placements": placements}

    def make_move(self, move):
        if move is None:
            return False
        cp = str(self.current_player)
        action = move.get("action")

        if action == "roll":
            self._roll_dice()
            self.log.append("New dice rolled!")
            return True

        if action == "draft":
            pair_idx = move["pair_idx"]
            if pair_idx < 0 or pair_idx >= len(self.available_pairs):
                return False
            placements = move["placements"]
            # Validate all placements first
            temp_placements = []
            for pl in placements:
                if pl.get("skip"):
                    temp_placements.append(None)
                    continue
                die_idx = pl["die"]
                row, col = pl["row"], pl["col"]
                terrain, crown = self.dice_results[die_idx]
                if row < 0 or row >= self.grid_size or col < 0 or col >= self.grid_size:
                    return False
                if self.grids[cp][row][col] != "Empty":
                    return False
                # Adjacency check - must be next to something non-empty
                has_adj = False
                for nr, nc in self._get_adjacent(row, col):
                    if self.grids[cp][nr][nc] != "Empty":
                        has_adj = True
                        break
                if not has_adj:
                    return False
                temp_placements.append((row, col, terrain, crown))

            # Apply placements
            placed_desc = []
            for tp in temp_placements:
                if tp is None:
                    placed_desc.append("skipped")
                    continue
                row, col, terrain, crown = tp
                self.grids[cp][row][col] = terrain
                self.crowns[cp][row][col] = crown
                placed_desc.append(f"{TERRAIN_ABBREV[terrain]} at ({row},{col})")

            # Remove chosen pair, keep complementary pair for other player
            a, b = self.available_pairs[pair_idx]
            used_dice = {a, b}
            remaining_dice = [i for i in range(4) if i not in used_dice]
            self.available_pairs = [(remaining_dice[0], remaining_dice[1])]

            self.log.append(f"{self.players[self.current_player-1]} drafted: {', '.join(placed_desc)}")

            # If this was second player's draft, start new round
            if self.phase == "draft_p2":
                self.rounds_played += 1
                self.available_pairs = []
                self.dice_results = []
                if self.rounds_played < self.max_turns:
                    self._roll_dice()
                self.phase = "draft_p1"
            else:
                self.phase = "draft_p2"

            return True
        return False

    def check_game_over(self):
        if self.rounds_played >= self.max_turns:
            self.game_over = True
            self._calculate_scores()
            s1 = self.scores["1"]
            s2 = self.scores["2"]
            if s1 > s2:
                self.winner = 1
            elif s2 > s1:
                self.winner = 2
            else:
                self.winner = None

    def get_state(self):
        return {
            "grids": {k: v for k, v in self.grids.items()},
            "crowns": {k: v for k, v in self.crowns.items()},
            "scores": dict(self.scores),
            "dice_results": self.dice_results,
            "available_pairs": self.available_pairs,
            "phase": self.phase,
            "rounds_played": self.rounds_played,
            "log": self.log,
        }

    def load_state(self, state):
        self.grids = state["grids"]
        self.crowns = state["crowns"]
        self.scores = state["scores"]
        self.dice_results = [list(d) if isinstance(d, list) else d for d in state["dice_results"]]
        # Convert dice_results back to tuples for internal use
        self.dice_results = [(d[0], d[1]) if isinstance(d, list) else d for d in self.dice_results]
        self.available_pairs = [list(p) if isinstance(p, list) else p for p in state["available_pairs"]]
        self.available_pairs = [(p[0], p[1]) if isinstance(p, list) else p for p in self.available_pairs]
        self.phase = state["phase"]
        self.rounds_played = state["rounds_played"]
        self.log = state.get("log", [])

    def get_tutorial(self):
        return """
============================================================
  KINGDOMINO DUEL - Tutorial
============================================================

  OVERVIEW:
  Build a kingdom by drafting dice and placing terrain types
  onto your personal grid. Score points based on the size of
  connected territories multiplied by their crown count.

  GAMEPLAY:
  1. Four dice are rolled showing terrain types and crowns
  2. Player 1 picks a pair of dice
  3. Player 2 gets the remaining pair
  4. Both players place their terrains on their grids

  PLACEMENT RULES:
  - Each die becomes a tile placed on your grid
  - Must be adjacent to your Castle or another placed tile
  - You may skip placing a die if you can't/don't want to

  SCORING:
  - Each connected group of same terrain = one territory
  - Score = territory_size x crowns_in_territory
  - Territories without crowns score 0!
  - Castle does not count as any terrain

  TERRAIN TYPES:
  W = Wheat, F = Forest, ~ = Water
  G = Grass, S = Swamp, M = Mine
  C = Castle, . = Empty
  * = Crown (shown after terrain letter)

  STRATEGY:
  - Group same terrains together for larger territories
  - Ensure territories have crowns or they score nothing
  - Block your opponent from getting useful dice pairs
============================================================
"""
