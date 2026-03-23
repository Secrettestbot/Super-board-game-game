"""Isle of Skye - Tile-laying with price-setting auction mechanics."""

import random
from engine.base import BaseGame, input_with_quit, clear_screen

# Terrain types
TERRAINS = ["mountain", "lake", "pasture", "forest", "village"]
TERRAIN_SHORT = {"mountain": "MT", "lake": "LK", "pasture": "PA", "forest": "FO", "village": "VI"}

# Scoring objectives (4 chosen per game, scored in different rounds)
SCORING_OBJECTIVES = [
    {"name": "Sheep Herder", "desc": "1 pt per pasture tile", "type": "count", "terrain": "pasture"},
    {"name": "Loch Ness", "desc": "2 pts per lake tile", "type": "count", "terrain": "lake"},
    {"name": "Highlander", "desc": "1 pt per mountain tile", "type": "count", "terrain": "mountain"},
    {"name": "Woodcutter", "desc": "1 pt per forest tile", "type": "count", "terrain": "forest"},
    {"name": "Mayor", "desc": "3 pts per village tile", "type": "count", "terrain": "village"},
    {"name": "Road Builder", "desc": "2 pts per completed road", "type": "roads"},
    {"name": "Cartographer", "desc": "1 pt per tile in largest group", "type": "largest_group"},
    {"name": "Farmer", "desc": "1 pt per 5 gold", "type": "wealth"},
]

JOURNEYMAN_OBJECTIVES = [
    {"name": "Explorer", "desc": "2 pts per unique terrain type", "type": "unique_terrains"},
    {"name": "Merchant", "desc": "3 pts per set of 3 different terrains", "type": "terrain_sets"},
]

# Tile definitions
def _generate_tile():
    """Generate a random tile with terrain, features, and edges."""
    terrain = random.choice(TERRAINS)
    has_road = random.random() < 0.4
    has_scroll = random.random() < 0.2
    gold_bonus = random.choice([0, 0, 0, 1, 2]) if not has_scroll else 0
    edges = [random.choice(TERRAINS) for _ in range(4)]  # N, E, S, W
    edges[0] = terrain  # at least one edge matches main terrain
    return {
        "terrain": terrain,
        "edges": edges,
        "has_road": has_road,
        "has_scroll": has_scroll,
        "gold_bonus": gold_bonus,
    }


def _generate_tile_pool(count):
    """Generate a pool of random tiles."""
    return [_generate_tile() for _ in range(count)]


class IsleOfSkyeGame(BaseGame):
    """Isle of Skye: Tile-laying with price-setting auction."""

    name = "Isle of Skye"
    description = "Tile-laying with price-setting auction - build your Scottish landscape"
    min_players = 2
    max_players = 2
    variations = {
        "standard": "Classic Isle of Skye with 4 scoring objectives",
        "journeyman": "Extra objectives and journey track scoring",
    }

    def __init__(self, variation=None):
        super().__init__(variation)
        self.gold = [5, 5]
        self.scores = [0, 0]
        self.landscapes = [[], []]  # placed tiles per player
        self.landscape_grid = [self._empty_grid() for _ in range(2)]
        self.tile_pool = []
        self.drawn_tiles = [[], []]  # 3 tiles drawn each round
        self.prices = [[-1, -1, -1], [-1, -1, -1]]  # prices set: -1=discard, 0+=price
        self.discarded = [[False, False, False], [False, False, False]]
        self.objectives = []
        self.round_number = 0
        self.max_rounds = 6
        self.phase = "draw"  # draw, price, buy, place
        self.scoring_schedule = []  # which objectives score each round
        self.journey_track = [0, 0]
        self.bought_this_round = [None, None]

    def _empty_grid(self):
        """9x9 grid with castle at center."""
        grid = [[None for _ in range(9)] for _ in range(9)]
        grid[4][4] = {"terrain": "village", "edges": ["village"] * 4,
                       "has_road": False, "has_scroll": False, "gold_bonus": 0}
        return grid

    def setup(self):
        """Initialize objectives, tile pool, and starting state."""
        self.tile_pool = _generate_tile_pool(60)
        # Choose 4 scoring objectives
        all_obj = list(SCORING_OBJECTIVES)
        if self.variation == "journeyman":
            all_obj.extend(JOURNEYMAN_OBJECTIVES)
        random.shuffle(all_obj)
        self.objectives = all_obj[:4]
        # Scoring schedule: rounds 1-6, each round scores specific objectives
        # Round 1: obj A, Round 2: obj B, Round 3: obj A+C, Round 4: obj B+D,
        # Round 5: obj A+C, Round 6: all
        self.scoring_schedule = [
            [0], [1], [0, 2], [1, 3], [0, 2], [0, 1, 2, 3]
        ]
        self.round_number = 1
        self.phase = "draw"

    def _score_objective(self, pi, obj):
        """Calculate score for one objective for one player."""
        if obj["type"] == "count":
            target = obj["terrain"]
            count = sum(1 for t in self.landscapes[pi] if t["terrain"] == target)
            multiplier = {"pasture": 1, "lake": 2, "mountain": 1, "forest": 1, "village": 3}.get(target, 1)
            return count * multiplier
        elif obj["type"] == "roads":
            return sum(1 for t in self.landscapes[pi] if t["has_road"]) * 2
        elif obj["type"] == "largest_group":
            return self._largest_connected_group(pi)
        elif obj["type"] == "wealth":
            return self.gold[pi] // 5
        elif obj["type"] == "unique_terrains":
            unique = set(t["terrain"] for t in self.landscapes[pi])
            return len(unique) * 2
        elif obj["type"] == "terrain_sets":
            terrain_counts = {}
            for t in self.landscapes[pi]:
                terrain_counts[t["terrain"]] = terrain_counts.get(t["terrain"], 0) + 1
            if not terrain_counts:
                return 0
            sets = min(terrain_counts.values()) if len(terrain_counts) >= 3 else 0
            return sets * 3
        return 0

    def _largest_connected_group(self, pi):
        """Find largest group of same-terrain connected tiles."""
        grid = self.landscape_grid[pi]
        visited = set()
        max_size = 0
        for r in range(9):
            for c in range(9):
                if grid[r][c] is not None and (r, c) not in visited:
                    terrain = grid[r][c]["terrain"]
                    size = 0
                    stack = [(r, c)]
                    while stack:
                        cr, cc = stack.pop()
                        if (cr, cc) in visited:
                            continue
                        if cr < 0 or cr >= 9 or cc < 0 or cc >= 9:
                            continue
                        if grid[cr][cc] is None or grid[cr][cc]["terrain"] != terrain:
                            continue
                        visited.add((cr, cc))
                        size += 1
                        for dr, dc in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
                            stack.append((cr + dr, cc + dc))
                    max_size = max(max_size, size)
        return max_size

    def display(self):
        """Display game state."""
        print(f"\n{'='*60}")
        print(f"  ISLE OF SKYE  (Round {self.round_number}/{self.max_rounds}, "
              f"Phase: {self.phase.upper()})")
        print(f"{'='*60}")

        # Scoring objectives
        print(f"\n  --- SCORING OBJECTIVES ---")
        for j, obj in enumerate(self.objectives):
            rounds_active = [i + 1 for i, sched in enumerate(self.scoring_schedule) if j in sched]
            active_str = ", ".join(str(r) for r in rounds_active)
            current = "*" if self.round_number <= len(self.scoring_schedule) and \
                      j in self.scoring_schedule[self.round_number - 1] else " "
            print(f"  {current} {chr(65+j)}. {obj['name']}: {obj['desc']} (rounds: {active_str})")

        # Player stats
        print(f"\n  --- PLAYERS ---")
        for pi in range(2):
            print(f"  P{pi+1}: Score:{self.scores[pi]} Gold:{self.gold[pi]} "
                  f"Tiles:{len(self.landscapes[pi])}")

        # Drawn tiles (during price/buy phase)
        pi = self.current_player - 1
        if self.phase in ("price", "buy", "place"):
            for pj in range(2):
                if self.drawn_tiles[pj]:
                    print(f"\n  P{pj+1}'s drawn tiles:")
                    for j, tile in enumerate(self.drawn_tiles[pj]):
                        ts = TERRAIN_SHORT[tile["terrain"]]
                        features = []
                        if tile["has_road"]:
                            features.append("road")
                        if tile["has_scroll"]:
                            features.append("scroll")
                        if tile["gold_bonus"]:
                            features.append(f"+{tile['gold_bonus']}g")
                        feat_str = f" [{', '.join(features)}]" if features else ""
                        price_str = ""
                        if self.prices[pj][j] >= 0:
                            price_str = f" Price:{self.prices[pj][j]}g"
                        elif self.discarded[pj][j]:
                            price_str = " [DISCARDED]"
                        print(f"    {j+1}. {tile['terrain'].capitalize()} ({ts}){feat_str}{price_str}")

        # Landscape grid for current player
        print(f"\n  --- P{pi+1}'s LANDSCAPE ---")
        print("      0   1   2   3   4   5   6   7   8")
        for r in range(9):
            row_str = f"  {r}: "
            for c in range(9):
                tile = self.landscape_grid[pi][r][c]
                if tile is None:
                    row_str += " .  "
                else:
                    row_str += f" {TERRAIN_SHORT[tile['terrain']]} "
            print(row_str)

        if self.variation == "journeyman":
            print(f"\n  Journey: P1={self.journey_track[0]} P2={self.journey_track[1]}")
        print(f"{'='*60}")

    def get_move(self):
        """Get player action based on phase."""
        pi = self.current_player - 1
        print(f"\n  {self.players[self.current_player-1]}'s turn ({self.phase} phase):")
        if self.phase == "draw":
            print("  Command: draw (draw 3 tiles)")
        elif self.phase == "price":
            print("  Command: price <tile#> <amount> | discard <tile#>")
            print("  (Set price on 2 tiles, discard 1)")
        elif self.phase == "buy":
            print("  Command: buy <player#> <tile#> | pass")
            print("  (Buy opponent's priced tile or pass)")
        elif self.phase == "place":
            print("  Command: place <tile#> <row> <col> | keep (keep unplaced)")
        return input_with_quit("  > ").strip().lower()

    def make_move(self, move):
        """Process player action."""
        pi = self.current_player - 1
        parts = move.split()
        if not parts:
            return False
        cmd = parts[0]

        if self.phase == "draw" and cmd == "draw":
            self.drawn_tiles[pi] = []
            for _ in range(3):
                if self.tile_pool:
                    self.drawn_tiles[pi].append(self.tile_pool.pop())
            if len(self.drawn_tiles[pi]) < 3:
                while len(self.drawn_tiles[pi]) < 3:
                    self.drawn_tiles[pi].append(_generate_tile())
            self.prices[pi] = [-1, -1, -1]
            self.discarded[pi] = [False, False, False]
            # If both players have drawn, move to price phase
            if all(len(self.drawn_tiles[p]) == 3 for p in range(2)):
                self.phase = "price"
            return True

        elif self.phase == "price":
            if cmd == "price" and len(parts) == 3:
                try:
                    tidx = int(parts[1]) - 1
                    amount = int(parts[2])
                except ValueError:
                    return False
                if tidx < 0 or tidx >= 3:
                    return False
                if amount < 0 or amount > self.gold[pi]:
                    print(f"  Price must be 0-{self.gold[pi]} gold!")
                    return False
                if self.discarded[pi][tidx]:
                    print("  That tile is discarded!")
                    return False
                self.prices[pi][tidx] = amount
                return True
            elif cmd == "discard" and len(parts) == 2:
                try:
                    tidx = int(parts[1]) - 1
                except ValueError:
                    return False
                if tidx < 0 or tidx >= 3:
                    return False
                # Check constraints: exactly 1 discard, 2 priced
                current_discards = sum(1 for d in self.discarded[pi] if d)
                if current_discards >= 1:
                    print("  Already discarded one tile!")
                    return False
                self.discarded[pi][tidx] = True
                self.prices[pi][tidx] = -1
                # Check if pricing is complete (1 discarded, 2 priced)
                priced = sum(1 for p in self.prices[pi] if p >= 0)
                discards = sum(1 for d in self.discarded[pi] if d)
                if priced == 2 and discards == 1:
                    # Check if both players done pricing
                    opp = 1 - pi
                    opp_priced = sum(1 for p in self.prices[opp] if p >= 0)
                    opp_disc = sum(1 for d in self.discarded[opp] if d)
                    if opp_priced == 2 and opp_disc == 1:
                        self.phase = "buy"
                        self.bought_this_round = [None, None]
                return True

        elif self.phase == "buy":
            if cmd == "buy" and len(parts) == 3:
                try:
                    target_player = int(parts[1]) - 1
                    tidx = int(parts[2]) - 1
                except ValueError:
                    return False
                if target_player < 0 or target_player > 1:
                    return False
                if tidx < 0 or tidx >= 3:
                    return False
                if self.discarded[target_player][tidx]:
                    print("  That tile was discarded!")
                    return False
                if self.prices[target_player][tidx] < 0:
                    print("  That tile has no price!")
                    return False
                if target_player == pi:
                    # Buying own tile: pay your set price (goes to bank)
                    price = self.prices[pi][tidx]
                    self.gold[pi] -= price
                    self.bought_this_round[pi] = self.drawn_tiles[pi][tidx]
                    return True
                else:
                    # Buying opponent's tile: pay price to opponent
                    price = self.prices[target_player][tidx]
                    if self.gold[pi] < price:
                        print(f"  Need {price} gold, have {self.gold[pi]}!")
                        return False
                    self.gold[pi] -= price
                    self.gold[target_player] += price
                    self.bought_this_round[pi] = self.drawn_tiles[target_player][tidx]
                    # Opponent keeps their tile's price as refund
                    self.drawn_tiles[target_player][tidx] = None
                    return True
            elif cmd == "pass":
                # Don't buy anything, keep unsold tiles
                if self.bought_this_round[pi] is None:
                    # Player gets back their unsold priced tiles
                    for j in range(3):
                        if not self.discarded[pi][j] and self.prices[pi][j] >= 0:
                            if self.drawn_tiles[pi][j] is not None:
                                if self.bought_this_round[pi] is None:
                                    self.bought_this_round[pi] = self.drawn_tiles[pi][j]
                                    self.gold[pi] -= self.prices[pi][j]
                                    break
                self.phase = "place"
                return True

        elif self.phase == "place":
            if cmd == "place" and len(parts) == 3:
                try:
                    row = int(parts[1])
                    col = int(parts[2])
                except ValueError:
                    return False
                tile = self.bought_this_round[pi]
                if tile is None:
                    print("  No tile to place!")
                    return False
                if row < 0 or row >= 9 or col < 0 or col >= 9:
                    return False
                if self.landscape_grid[pi][row][col] is not None:
                    print("  Cell occupied!")
                    return False
                adjacent = False
                for dr, dc in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
                    nr, nc = row + dr, col + dc
                    if 0 <= nr < 9 and 0 <= nc < 9 and self.landscape_grid[pi][nr][nc] is not None:
                        adjacent = True
                        break
                if not adjacent:
                    print("  Must place adjacent to existing tile!")
                    return False
                self.landscape_grid[pi][row][col] = tile
                self.landscapes[pi].append(tile)
                self.gold[pi] += tile.get("gold_bonus", 0)
                if self.variation == "journeyman" and tile.get("has_scroll"):
                    self.journey_track[pi] += 1
                self.bought_this_round[pi] = None
                # Check if round is complete
                if all(bt is None for bt in self.bought_this_round):
                    self._end_round()
                return True
            elif cmd == "keep":
                # Skip placing (keep for scoring but tile is lost)
                self.bought_this_round[pi] = None
                if all(bt is None for bt in self.bought_this_round):
                    self._end_round()
                return True

        return False

    def _end_round(self):
        """Score the round and advance."""
        if self.round_number <= len(self.scoring_schedule):
            obj_indices = self.scoring_schedule[self.round_number - 1]
            for pi in range(2):
                round_score = 0
                for oi in obj_indices:
                    if oi < len(self.objectives):
                        round_score += self._score_objective(pi, self.objectives[oi])
                self.scores[pi] += round_score
                # Income: 5 gold per round
                self.gold[pi] += 5
            print(f"\n  --- END OF ROUND {self.round_number} ---")
            for pi in range(2):
                print(f"  P{pi+1}: Score={self.scores[pi]}, Gold={self.gold[pi]}")
            if self.variation == "journeyman":
                for pi in range(2):
                    self.scores[pi] += self.journey_track[pi]
                    print(f"  P{pi+1} journey bonus: +{self.journey_track[pi]}")
            input("  Press Enter to continue...")
        self.round_number += 1
        self.phase = "draw"
        self.drawn_tiles = [[], []]

    def check_game_over(self):
        """Game ends after max rounds."""
        if self.round_number > self.max_rounds:
            self.game_over = True
            if self.scores[0] > self.scores[1]:
                self.winner = 1
            elif self.scores[1] > self.scores[0]:
                self.winner = 2
            else:
                # Tiebreak: most gold
                if self.gold[0] > self.gold[1]:
                    self.winner = 1
                elif self.gold[1] > self.gold[0]:
                    self.winner = 2
                else:
                    self.winner = None

    def get_state(self):
        """Return serializable game state."""
        return {
            "gold": self.gold, "scores": self.scores,
            "landscapes": self.landscapes, "landscape_grid": [
                [[cell for cell in row] for row in grid]
                for grid in self.landscape_grid
            ],
            "tile_pool": self.tile_pool, "drawn_tiles": self.drawn_tiles,
            "prices": self.prices, "discarded": self.discarded,
            "objectives": self.objectives, "round_number": self.round_number,
            "phase": self.phase, "scoring_schedule": self.scoring_schedule,
            "journey_track": self.journey_track,
            "bought_this_round": self.bought_this_round,
        }

    def load_state(self, state):
        """Restore game state."""
        self.gold = state["gold"]
        self.scores = state["scores"]
        self.landscapes = state["landscapes"]
        self.landscape_grid = [
            [[cell for cell in row] for row in grid]
            for grid in state["landscape_grid"]
        ]
        self.tile_pool = state["tile_pool"]
        self.drawn_tiles = state["drawn_tiles"]
        self.prices = state["prices"]
        self.discarded = state["discarded"]
        self.objectives = state["objectives"]
        self.round_number = state["round_number"]
        self.phase = state["phase"]
        self.scoring_schedule = state["scoring_schedule"]
        self.journey_track = state["journey_track"]
        self.bought_this_round = state["bought_this_round"]

    def get_tutorial(self):
        """Return tutorial text."""
        journey_note = """
  JOURNEYMAN VARIANT:
  Scroll tiles advance your journey track.
  Journey track points added each round.
  Extra objectives available for scoring.
""" if self.variation == "journeyman" else ""
        return f"""
==================================================
  Isle of Skye - Tutorial
==================================================

  OVERVIEW:
  Build your Scottish clan's landscape! Each round,
  draw tiles, set prices, and buy from opponents.
  Different scoring objectives activate each round.

  ROUND PHASES:
  1. DRAW: Each player draws 3 tiles.
     Command: draw

  2. PRICE: Secretly set prices on 2 tiles,
     discard 1 tile.
     Command: price <tile#> <amount>
     Command: discard <tile#>
     (Must price exactly 2, discard exactly 1)

  3. BUY: Buy a tile from any player.
     Command: buy <player#> <tile#>
     Command: pass
     - Buying own tile: pay your price to bank
     - Buying opponent's: pay price to them
     - Unsold tiles return to their owner

  4. PLACE: Place acquired tile on landscape.
     Command: place <row> <col>
     Command: keep (forfeit placement)
     Must be adjacent to existing tiles.

  LANDSCAPE:
  9x9 grid, castle at center (4,4).
  Terrains: Mountain(MT), Lake(LK), Pasture(PA),
            Forest(FO), Village(VI)

  SCORING OBJECTIVES:
  4 objectives chosen each game (A, B, C, D).
  Different objectives score in different rounds:
  - Round 1: A    - Round 4: B+D
  - Round 2: B    - Round 5: A+C
  - Round 3: A+C  - Round 6: All

  INCOME: 5 gold per round.

  TILE FEATURES:
  - Roads: score with Road Builder objective
  - Scrolls: special bonus tiles
  - Gold bonus: immediate gold when placed
{journey_note}
  STRATEGY:
  - Price tiles high to earn gold if bought
  - Price low if you want to keep them
  - Watch which objectives score this round
  - Build connected terrain groups
  - Time big scoring tiles for double-objective
    rounds

==================================================
"""
