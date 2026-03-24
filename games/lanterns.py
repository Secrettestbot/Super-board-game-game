"""Lanterns - Tile-laying lake decoration game.

Players place tiles on a shared lake grid. Each tile has 4 colored sides.
When placed, each player receives lantern cards based on the colors facing them.
Collect sets of lanterns to make dedications for points.
"""

import random

from engine.base import BaseGame, input_with_quit, clear_screen

COLORS = ["Red", "Blue", "Green", "Orange", "Purple", "White", "Black"]
COLOR_ABBREV = {"Red": "R", "Blue": "B", "Green": "G", "Orange": "O",
                "Purple": "P", "White": "W", "Black": "K"}
ABBREV_TO_COLOR = {v: k for k, v in COLOR_ABBREV.items()}

# Directions: North, East, South, West (indices 0,1,2,3)
DIR_NAMES = ["North", "East", "South", "West"]
DIR_OFFSETS = [(-1, 0), (0, 1), (1, 0), (0, -1)]
OPPOSITE = [2, 3, 0, 1]

# Dedication scoring tiers (decreasing as game progresses)
FOUR_OF_KIND_POINTS = [10, 9, 8, 7, 6, 5, 5, 5]
THREE_PAIRS_POINTS = [9, 8, 7, 6, 5, 4, 4, 4]
ALL_SEVEN_POINTS = [12, 11, 10, 9, 8, 7, 7, 7]


def _generate_tiles(count):
    """Generate random tiles with 4 colored sides each."""
    tiles = []
    for _ in range(count):
        sides = [random.choice(COLORS) for _ in range(4)]
        tiles.append(sides)
    return tiles


def _rotate_tile(tile, rotations):
    """Rotate a tile clockwise by the given number of 90-degree rotations."""
    r = rotations % 4
    return tile[r:] + tile[:r]


class LanternsGame(BaseGame):
    """Lanterns - Tile-laying lake decoration game."""

    name = "Lanterns"
    description = "Tile-laying lake decoration game with lantern card collection"
    min_players = 2
    max_players = 4
    variations = {
        "standard": "Standard game (7x7 grid, 36 tiles)",
        "quick": "Quick game (5x5 grid, 18 tiles)",
    }

    def __init__(self, variation=None):
        super().__init__(variation)
        if self.variation == "quick":
            self.grid_size = 5
            self.total_tiles = 18
        else:
            self.grid_size = 7
            self.total_tiles = 36
        self.grid = {}  # (row, col) -> tile (list of 4 colors)
        self.tile_pool = []
        self.player_hands = {}  # player -> list of 3 tiles to choose from
        self.lantern_cards = {}  # player -> {color: count}
        self.scores = {}
        self.favor_tokens = {}  # player -> count
        self.dedication_tier = {"four": 0, "pairs": 0, "seven": 0}
        self.log = []

    def setup(self):
        num = len(self.players)
        self.tile_pool = _generate_tiles(self.total_tiles)
        random.shuffle(self.tile_pool)
        # Place starting tile in center
        center = self.grid_size // 2
        start_tile = self.tile_pool.pop()
        self.grid[f"{center},{center}"] = start_tile
        # Initialize per-player state
        for p in range(1, num + 1):
            self.lantern_cards[str(p)] = {c: 0 for c in COLORS}
            self.scores[str(p)] = 0
            self.favor_tokens[str(p)] = 2
            self.player_hands[str(p)] = []
            for _ in range(3):
                if self.tile_pool:
                    self.player_hands[str(p)].append(self.tile_pool.pop())
        # Give initial lantern cards based on starting tile facing
        self._distribute_starting_lanterns(center, center, start_tile)
        self.log = ["Game started. Starting tile placed in center."]

    def _distribute_starting_lanterns(self, row, col, tile):
        """Give each player a lantern card based on what color faces them."""
        num = len(self.players)
        # Player 1 faces North (sees South side of tile), Player 2 faces South, etc.
        facing = [2, 0, 3, 1]  # Which tile side each player seat sees
        for p in range(1, num + 1):
            side_idx = facing[(p - 1) % 4]
            color = tile[side_idx]
            self.lantern_cards[str(p)][color] += 1

    def _get_valid_positions(self):
        """Return positions adjacent to existing tiles that are empty."""
        valid = set()
        for key in self.grid:
            r, c = map(int, key.split(","))
            for dr, dc in DIR_OFFSETS:
                nr, nc = r + dr, c + dc
                nkey = f"{nr},{nc}"
                if nkey not in self.grid and 0 <= nr < self.grid_size and 0 <= nc < self.grid_size:
                    valid.add(nkey)
        return sorted(valid)

    def _distribute_lanterns(self, row, col, tile):
        """After placing a tile, distribute lantern cards."""
        num = len(self.players)
        # Each direction of the placed tile faces outward
        # Player mapping: P1 is "north" viewer, P2 is "south" viewer
        facing = [2, 0, 3, 1]
        for p in range(1, num + 1):
            side_idx = facing[(p - 1) % 4]
            color = tile[side_idx]
            self.lantern_cards[str(p)][color] += 1
        # Bonus: if placed tile matches color on adjacent tile, current player gets extra
        cp = str(self.current_player)
        for d in range(4):
            dr, dc = DIR_OFFSETS[d]
            adj_key = f"{row + dr},{col + dc}"
            if adj_key in self.grid:
                adj_tile = self.grid[adj_key]
                if tile[d] == adj_tile[OPPOSITE[d]]:
                    self.lantern_cards[cp][tile[d]] += 1

    def display(self):
        clear_screen()
        num = len(self.players)
        print(f"{'=' * 60}")
        print(f"  LANTERNS - {self.variation.title()} | Turn {self.turn_number + 1}")
        print(f"{'=' * 60}")
        # Scores
        for p in range(1, num + 1):
            marker = " <<" if p == self.current_player else ""
            print(f"  {self.players[p-1]}: {self.scores[str(p)]} pts, "
                  f"Favors: {self.favor_tokens[str(p)]}{marker}")
        print()
        # Grid display
        print(f"  Lake Grid ({self.grid_size}x{self.grid_size}):")
        print("    " + "  ".join(f"{c:>2}" for c in range(self.grid_size)))
        for r in range(self.grid_size):
            row_top = []
            row_mid = []
            row_bot = []
            for c in range(self.grid_size):
                key = f"{r},{c}"
                if key in self.grid:
                    t = self.grid[key]
                    n = COLOR_ABBREV[t[0]]
                    e = COLOR_ABBREV[t[1]]
                    s = COLOR_ABBREV[t[2]]
                    w = COLOR_ABBREV[t[3]]
                    row_top.append(f" {n} ")
                    row_mid.append(f"{w}.{e}")
                    row_bot.append(f" {s} ")
                else:
                    row_top.append("   ")
                    row_mid.append(" . ")
                    row_bot.append("   ")
            print(f"  {r} {'|'.join(row_top)}")
            print(f"    {'|'.join(row_mid)}")
            print(f"    {'|'.join(row_bot)}")
            if r < self.grid_size - 1:
                print(f"    " + "-" * (self.grid_size * 4 - 1))
        print()
        # Current player's lantern cards
        cp = str(self.current_player)
        print(f"  {self.players[self.current_player - 1]}'s Lantern Cards:")
        cards_str = "    "
        for color in COLORS:
            cnt = self.lantern_cards[cp][color]
            if cnt > 0:
                cards_str += f"{COLOR_ABBREV[color]}:{cnt}  "
        print(cards_str if cards_str.strip() else "    (none)")
        # Current player's hand tiles
        hand = self.player_hands[cp]
        if hand:
            print(f"\n  Your Tiles:")
            for i, tile in enumerate(hand):
                sides = [COLOR_ABBREV[s] for s in tile]
                print(f"    [{i+1}] N:{sides[0]} E:{sides[1]} S:{sides[2]} W:{sides[3]}")
        print()
        # Dedication point tiers
        fi = min(self.dedication_tier["four"], len(FOUR_OF_KIND_POINTS) - 1)
        pi = min(self.dedication_tier["pairs"], len(THREE_PAIRS_POINTS) - 1)
        si = min(self.dedication_tier["seven"], len(ALL_SEVEN_POINTS) - 1)
        print(f"  Dedication Values: 4-of-kind={FOUR_OF_KIND_POINTS[fi]}, "
              f"3-pairs={THREE_PAIRS_POINTS[pi]}, all-7={ALL_SEVEN_POINTS[si]}")
        print(f"  Tiles remaining: {len(self.tile_pool)}")
        if self.log:
            print(f"\n  Last: {self.log[-1]}")
        print()

    def get_move(self):
        cp = str(self.current_player)
        hand = self.player_hands[cp]
        if not hand:
            print("  No tiles to place. Passing turn.")
            input_with_quit("  Press Enter to continue...")
            return {"action": "pass"}

        # Check if player wants to make a dedication first
        can_dedicate = self._can_dedicate(cp)
        if can_dedicate:
            print("  You can make a dedication before placing a tile.")
            print("  Possible dedications:")
            for d in can_dedicate:
                print(f"    {d}")
            choice = input_with_quit("  Make a dedication? (y/n): ").strip().lower()
            if choice == 'y':
                return self._get_dedication_move(cp, can_dedicate)

        # Optionally use a favor token to exchange lantern cards
        if self.favor_tokens[cp] > 0:
            choice = input_with_quit("  Use a favor token to swap a lantern card? (y/n): ").strip().lower()
            if choice == 'y':
                return self._get_favor_move(cp)

        # Place a tile
        print("  Choose a tile to place:")
        for i, tile in enumerate(hand):
            sides = [COLOR_ABBREV[s] for s in tile]
            print(f"    [{i+1}] N:{sides[0]} E:{sides[1]} S:{sides[2]} W:{sides[3]}")
        tile_choice = input_with_quit("  Tile number: ").strip()
        try:
            tile_idx = int(tile_choice) - 1
            if tile_idx < 0 or tile_idx >= len(hand):
                return None
        except ValueError:
            return None

        # Rotation
        rot_input = input_with_quit("  Rotations clockwise (0-3): ").strip()
        try:
            rotations = int(rot_input)
        except ValueError:
            rotations = 0

        # Position
        valid = self._get_valid_positions()
        if not valid:
            print("  No valid positions available!")
            return None
        print(f"  Valid positions: {', '.join(valid)}")
        pos_input = input_with_quit("  Place at (row,col): ").strip()

        return {"action": "place", "tile_idx": tile_idx, "rotation": rotations, "position": pos_input}

    def _can_dedicate(self, player):
        """Check what dedications a player can make."""
        cards = self.lantern_cards[player]
        possible = []
        # Four of a kind
        for c in COLORS:
            if cards[c] >= 4:
                possible.append(f"four:{c}")
                break
        # Three pairs
        pairs = sum(1 for c in COLORS if cards[c] >= 2)
        if pairs >= 3:
            possible.append("pairs")
        # All seven
        if all(cards[c] >= 1 for c in COLORS):
            possible.append("seven")
        return possible

    def _get_dedication_move(self, player, options):
        print("  Choose dedication type:")
        for i, opt in enumerate(options):
            print(f"    [{i+1}] {opt}")
        choice = input_with_quit("  Choice: ").strip()
        try:
            idx = int(choice) - 1
            if 0 <= idx < len(options):
                return {"action": "dedicate", "type": options[idx]}
        except ValueError:
            pass
        return None

    def _get_favor_move(self, player):
        print("  Give back which color? ", end="")
        cards = self.lantern_cards[player]
        available = [c for c in COLORS if cards[c] > 0]
        print(f"  Available: {', '.join(COLOR_ABBREV[c] for c in available)}")
        give = input_with_quit("  Give color (letter): ").strip().upper()
        take = input_with_quit("  Take color (letter): ").strip().upper()
        return {"action": "favor", "give": give, "take": take}

    def make_move(self, move):
        if move is None:
            return False
        cp = str(self.current_player)
        action = move.get("action")

        if action == "pass":
            self.log.append(f"{self.players[self.current_player-1]} passed.")
            return True

        if action == "favor":
            give_abbr = move["give"]
            take_abbr = move["take"]
            if give_abbr not in ABBREV_TO_COLOR or take_abbr not in ABBREV_TO_COLOR:
                return False
            give_color = ABBREV_TO_COLOR[give_abbr]
            take_color = ABBREV_TO_COLOR[take_abbr]
            if self.lantern_cards[cp][give_color] <= 0 or self.favor_tokens[cp] <= 0:
                return False
            self.lantern_cards[cp][give_color] -= 1
            self.lantern_cards[cp][take_color] += 1
            self.favor_tokens[cp] -= 1
            self.log.append(f"{self.players[self.current_player-1]} used favor: {give_abbr}->{take_abbr}")
            return True

        if action == "dedicate":
            dtype = move["type"]
            cards = self.lantern_cards[cp]
            if dtype.startswith("four:"):
                color = dtype.split(":")[1]
                if cards[color] < 4:
                    return False
                cards[color] -= 4
                ti = min(self.dedication_tier["four"], len(FOUR_OF_KIND_POINTS) - 1)
                pts = FOUR_OF_KIND_POINTS[ti]
                self.scores[cp] += pts
                self.dedication_tier["four"] += 1
                self.log.append(f"{self.players[self.current_player-1]} dedicated 4x{COLOR_ABBREV[color]} for {pts} pts")
            elif dtype == "pairs":
                pair_colors = [c for c in COLORS if cards[c] >= 2]
                if len(pair_colors) < 3:
                    return False
                for c in pair_colors[:3]:
                    cards[c] -= 2
                ti = min(self.dedication_tier["pairs"], len(THREE_PAIRS_POINTS) - 1)
                pts = THREE_PAIRS_POINTS[ti]
                self.scores[cp] += pts
                self.dedication_tier["pairs"] += 1
                self.log.append(f"{self.players[self.current_player-1]} dedicated 3 pairs for {pts} pts")
            elif dtype == "seven":
                if not all(cards[c] >= 1 for c in COLORS):
                    return False
                for c in COLORS:
                    cards[c] -= 1
                ti = min(self.dedication_tier["seven"], len(ALL_SEVEN_POINTS) - 1)
                pts = ALL_SEVEN_POINTS[ti]
                self.scores[cp] += pts
                self.dedication_tier["seven"] += 1
                self.log.append(f"{self.players[self.current_player-1]} dedicated all 7 colors for {pts} pts")
            else:
                return False
            return True

        if action == "place":
            tile_idx = move["tile_idx"]
            rotation = move["rotation"]
            pos_str = move["position"]
            hand = self.player_hands[cp]
            if tile_idx < 0 or tile_idx >= len(hand):
                return False
            try:
                parts = pos_str.split(",")
                row, col = int(parts[0]), int(parts[1])
            except (ValueError, IndexError):
                return False
            key = f"{row},{col}"
            if key in self.grid:
                return False
            if row < 0 or row >= self.grid_size or col < 0 or col >= self.grid_size:
                return False
            # Must be adjacent to existing tile
            adjacent = False
            for dr, dc in DIR_OFFSETS:
                adj_key = f"{row + dr},{col + dc}"
                if adj_key in self.grid:
                    adjacent = True
                    break
            if not adjacent:
                return False
            tile = _rotate_tile(hand[tile_idx], rotation)
            self.grid[key] = tile
            hand.pop(tile_idx)
            # Draw a new tile
            if self.tile_pool:
                hand.append(self.tile_pool.pop())
            # Distribute lanterns
            self._distribute_lanterns(row, col, tile)
            sides = [COLOR_ABBREV[s] for s in tile]
            self.log.append(f"{self.players[self.current_player-1]} placed tile at ({row},{col}) "
                            f"[{'/'.join(sides)}]")
            return True
        return False

    def check_game_over(self):
        # Game over when all tiles placed or no valid positions
        all_empty = all(len(self.player_hands[str(p)]) == 0
                        for p in range(1, len(self.players) + 1))
        no_positions = len(self._get_valid_positions()) == 0
        if (all_empty and len(self.tile_pool) == 0) or no_positions:
            self.game_over = True
            # Final scoring: each remaining lantern card = 1 point
            for p in range(1, len(self.players) + 1):
                sp = str(p)
                bonus = sum(self.lantern_cards[sp].values())
                self.scores[sp] += bonus
            # Determine winner
            best_score = -1
            best_player = None
            for p in range(1, len(self.players) + 1):
                sp = str(p)
                if self.scores[sp] > best_score:
                    best_score = self.scores[sp]
                    best_player = p
            self.winner = best_player

    def get_state(self):
        return {
            "grid": {k: v for k, v in self.grid.items()},
            "tile_pool": self.tile_pool,
            "player_hands": {k: v for k, v in self.player_hands.items()},
            "lantern_cards": {k: dict(v) for k, v in self.lantern_cards.items()},
            "scores": dict(self.scores),
            "favor_tokens": dict(self.favor_tokens),
            "dedication_tier": dict(self.dedication_tier),
            "log": self.log,
        }

    def load_state(self, state):
        self.grid = state["grid"]
        self.tile_pool = state["tile_pool"]
        self.player_hands = state["player_hands"]
        self.lantern_cards = state["lantern_cards"]
        self.scores = state["scores"]
        self.favor_tokens = state["favor_tokens"]
        self.dedication_tier = state["dedication_tier"]
        self.log = state.get("log", [])

    def get_tutorial(self):
        return """
============================================================
  LANTERNS - Tutorial
============================================================

  OVERVIEW:
  Lanterns is a tile-laying game where players decorate a lake
  with floating lantern tiles. By placing tiles strategically,
  you collect lantern cards of various colors, which you then
  trade in as dedications for victory points.

  TILE PLACEMENT:
  - Each tile has 4 colored sides (N/E/S/W)
  - Tiles must be placed adjacent to existing tiles on the lake
  - You may rotate tiles before placing (0-3 clockwise rotations)

  LANTERN CARD DISTRIBUTION:
  - When you place a tile, ALL players receive lantern cards
  - Each player gets a card matching the color of the tile side
    facing them (P1=South side, P2=North side, etc.)
  - If your tile matches an adjacent tile's touching side,
    you get a bonus card of that color

  DEDICATIONS (scoring):
  - Four of a Kind: Turn in 4 cards of one color
  - Three Pairs: Turn in 3 pairs (2 each of 3 colors)
  - All Seven: Turn in one of each color
  - Earlier dedications score more points!

  FAVOR TOKENS:
  - Spend a favor token to swap one lantern card for another
  - You start with 2 favor tokens

  WINNING:
  - Game ends when all tiles are placed
  - Remaining lantern cards = 1 point each
  - Highest score wins!

  CONTROLS:
  - Enter tile number, rotation, and position when prompted
  - Positions are row,col (e.g., "3,4")
  - Color abbreviations: R=Red, B=Blue, G=Green, O=Orange,
    P=Purple, W=White, K=Black
============================================================
"""
