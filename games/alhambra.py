"""Alhambra - Buy building tiles with exact change to build your palace."""

import random
from engine.base import BaseGame, input_with_quit, clear_screen

CURRENCIES = ["blue", "green", "orange", "yellow"]
CURRENCY_SHORT = {"blue": "B", "green": "G", "orange": "O", "yellow": "Y"}

BUILDING_TYPES = [
    {"type": "Pavilion", "color": "blue", "walls": "N", "points": [1, 2, 3]},
    {"type": "Seraglio", "color": "green", "walls": "NE", "points": [2, 3, 5]},
    {"type": "Arcade", "color": "orange", "walls": "NS", "points": [3, 5, 7]},
    {"type": "Chamber", "color": "yellow", "walls": "NES", "points": [4, 6, 9]},
    {"type": "Garden", "color": "blue", "walls": "E", "points": [2, 3, 4]},
    {"type": "Tower", "color": "green", "walls": "NEW", "points": [3, 5, 8]},
]

# Tile definitions: (building_type_index, currency, cost, wall_sides)
def _generate_tiles():
    tiles = []
    for _ in range(3):
        for i, bt in enumerate(BUILDING_TYPES):
            currency = random.choice(CURRENCIES)
            cost = random.randint(2, 9)
            walls = list(bt["walls"])
            tiles.append({
                "type": bt["type"],
                "type_idx": i,
                "currency": currency,
                "cost": cost,
                "walls": walls,
                "points_tiers": bt["points"],
            })
    return tiles


class AlhambraGame(BaseGame):
    """Alhambra: Buy tiles, build your palace, score for majorities and walls."""

    name = "Alhambra"
    description = "Buy building tiles with exact change to construct your palace"
    min_players = 2
    max_players = 2
    variations = {
        "standard": "Classic Alhambra with 3 scoring rounds",
        "thieves_turn": "Thieves can steal tiles from opponents",
    }

    def __init__(self, variation=None):
        super().__init__(variation)
        self.money = [{c: 0 for c in CURRENCIES} for _ in range(2)]
        self.palace = [[], []]  # list of placed tiles per player
        self.reserve = [[], []]  # tiles held in reserve
        self.tile_bag = []
        self.market = []  # 4 tiles on sale (one per currency)
        self.money_deck = []
        self.money_display = []
        self.scoring_round = 0
        self.scoring_triggered = [False, False, False]
        self.scores = [0, 0]
        self.tiles_remaining_at_scoring = [36, 24, 12]
        self.palace_grid = [self._empty_grid() for _ in range(2)]

    def _empty_grid(self):
        """7x7 grid, center is fountain."""
        grid = [[None for _ in range(7)] for _ in range(7)]
        grid[3][3] = {"type": "Fountain", "walls": [], "type_idx": -1}
        return grid

    def setup(self):
        """Initialize tile bag, money deck, and starting hands."""
        self.tile_bag = _generate_tiles()
        random.shuffle(self.tile_bag)
        # Fill market: one tile per currency slot
        self.market = []
        for c in CURRENCIES:
            if self.tile_bag:
                tile = self.tile_bag.pop()
                tile["market_currency"] = c
                self.market.append(tile)
        # Money deck: values 1-9 for each currency, shuffled
        self.money_deck = []
        for c in CURRENCIES:
            for v in range(1, 10):
                self.money_deck.append({"currency": c, "value": v})
        random.shuffle(self.money_deck)
        # Starting money: deal 4 cards to each player
        for pi in range(2):
            for _ in range(4):
                if self.money_deck:
                    card = self.money_deck.pop()
                    self.money[pi][card["currency"]] += card["value"]
        # Money display
        self._refill_money_display()
        self.scoring_round = 0

    def _refill_money_display(self):
        """Show 4 money cards available to take."""
        self.money_display = []
        while len(self.money_display) < 4 and self.money_deck:
            self.money_display.append(self.money_deck.pop())

    def _refill_market(self):
        """Fill empty market slots."""
        filled_currencies = {t.get("market_currency") for t in self.market}
        for c in CURRENCIES:
            if c not in filled_currencies and self.tile_bag:
                tile = self.tile_bag.pop()
                tile["market_currency"] = c
                self.market.append(tile)

    def _count_walls(self, pi):
        """Count the longest contiguous outer wall for a player."""
        grid = self.palace_grid[pi]
        wall_count = 0
        for r in range(7):
            for c in range(7):
                tile = grid[r][c]
                if tile is None:
                    continue
                walls = tile.get("walls", [])
                for w in walls:
                    # Check if wall faces the outside or an empty cell
                    nr, nc = r, c
                    if w == "N":
                        nr -= 1
                    elif w == "S":
                        nr += 1
                    elif w == "E":
                        nc += 1
                    elif w == "W":
                        nc -= 1
                    if nr < 0 or nr >= 7 or nc < 0 or nc >= 7 or grid[nr][nc] is None:
                        wall_count += 1
        return wall_count

    def _count_building_type(self, pi, type_idx):
        """Count tiles of a given type in player's palace."""
        count = 0
        for tile in self.palace[pi]:
            if tile["type_idx"] == type_idx:
                count += 1
        return count

    def _do_scoring(self, round_idx):
        """Score based on building type majorities and wall length."""
        tier = min(round_idx, 2)
        # Building type majorities
        for bt_idx in range(len(BUILDING_TYPES)):
            counts = [self._count_building_type(pi, bt_idx) for pi in range(2)]
            pts = BUILDING_TYPES[bt_idx]["points"]
            points_for_tier = pts[tier] if tier < len(pts) else pts[-1]
            if counts[0] > counts[1]:
                self.scores[0] += points_for_tier
            elif counts[1] > counts[0]:
                self.scores[1] += points_for_tier
            elif counts[0] > 0:
                half = points_for_tier // 2
                self.scores[0] += half
                self.scores[1] += half
        # Wall bonus
        for pi in range(2):
            self.scores[pi] += self._count_walls(pi)

    def display(self):
        """Display market, money, and palace state."""
        print(f"\n{'='*60}")
        print(f"  ALHAMBRA  (Scoring Round: {self.scoring_round}/3, "
              f"Tiles left: {len(self.tile_bag)})")
        print(f"{'='*60}")

        # Market tiles
        print(f"\n  --- MARKET TILES ---")
        for j, tile in enumerate(self.market):
            wall_str = "".join(tile["walls"]) if tile["walls"] else "none"
            print(f"    {j+1}. {tile['type']} - Cost: {tile['cost']} {tile['market_currency']} "
                  f"(walls: {wall_str})")

        # Money display
        print(f"\n  --- MONEY CARDS ---")
        for j, card in enumerate(self.money_display):
            short = CURRENCY_SHORT[card["currency"]]
            print(f"    {j+1}. {card['value']} {card['currency']} ({short})")

        # Player info
        print(f"\n  --- PLAYERS ---")
        for pi in range(2):
            money_str = " ".join(f"{CURRENCY_SHORT[c]}:{self.money[pi][c]}" for c in CURRENCIES)
            wall_len = self._count_walls(pi)
            print(f"  P{pi+1}: Score:{self.scores[pi]} Money:[{money_str}] "
                  f"Wall:{wall_len} Tiles:{len(self.palace[pi])} "
                  f"Reserve:{len(self.reserve[pi])}")

        # Palace grid for current player
        pi = self.current_player - 1
        print(f"\n  --- P{pi+1}'s PALACE (7x7 grid) ---")
        print("      0   1   2   3   4   5   6")
        for r in range(7):
            row_str = f"  {r}: "
            for c in range(7):
                tile = self.palace_grid[pi][r][c]
                if tile is None:
                    row_str += " .  "
                elif tile["type"] == "Fountain":
                    row_str += " FN "
                else:
                    abbr = tile["type"][:2].upper()
                    row_str += f" {abbr} "
            print(row_str)

        # Reserve
        if self.reserve[pi]:
            print(f"\n  Reserve:")
            for j, tile in enumerate(self.reserve[pi]):
                print(f"    {j+1}. {tile['type']} (walls: {''.join(tile['walls'])})")

        if self.variation == "thieves_turn":
            print(f"\n  [Thieves variant: use 'steal <opponent_tile#>' to take a tile]")
        print(f"{'='*60}")

    def get_move(self):
        """Get player action."""
        print(f"\n  {self.players[self.current_player-1]}'s turn:")
        print("  Commands: buy <market#> | take <money#> [<money#>...] | place <reserve#> <row> <col>")
        print("           | rearrange <row> <col> to_reserve | reserve <market#>")
        if self.variation == "thieves_turn":
            print("           | steal <opponent_palace_idx>")
        return input_with_quit("  > ").strip().lower()

    def make_move(self, move):
        """Process player action."""
        pi = self.current_player - 1
        parts = move.split()
        if not parts:
            return False
        cmd = parts[0]

        if cmd == "buy" and len(parts) == 2:
            try:
                idx = int(parts[1]) - 1
            except ValueError:
                return False
            if idx < 0 or idx >= len(self.market):
                return False
            tile = self.market[idx]
            currency = tile["market_currency"]
            cost = tile["cost"]
            available = self.money[pi][currency]
            if available < cost:
                print(f"  Need {cost} {currency}, have {available}!")
                return False
            exact = (available >= cost)
            self.money[pi][currency] -= cost
            self.reserve[pi].append(tile)
            self.market.pop(idx)
            self._refill_market()
            # Exact change: get another turn (indicated by not switching)
            if self.money[pi][currency] + cost == cost:
                print("  Exact change! Take another action.")
            # Check scoring trigger
            self._check_scoring()
            return True

        elif cmd == "take":
            if len(parts) < 2:
                return False
            indices = []
            total_value = 0
            for p in parts[1:]:
                try:
                    idx = int(p) - 1
                except ValueError:
                    return False
                if idx < 0 or idx >= len(self.money_display):
                    return False
                indices.append(idx)
                total_value += self.money_display[idx]["value"]
            # Can take 1 card of any value, or multiple if total <= 5
            if len(indices) > 1 and total_value > 5:
                print(f"  Can only take multiple cards if total <= 5! (total: {total_value})")
                return False
            # Take cards (remove from end to preserve indices)
            taken = []
            for idx in sorted(indices, reverse=True):
                taken.append(self.money_display.pop(idx))
            for card in taken:
                self.money[pi][card["currency"]] += card["value"]
            self._refill_money_display()
            return True

        elif cmd == "place" and len(parts) == 4:
            try:
                ridx = int(parts[1]) - 1
                row = int(parts[2])
                col = int(parts[3])
            except ValueError:
                return False
            if ridx < 0 or ridx >= len(self.reserve[pi]):
                return False
            if row < 0 or row >= 7 or col < 0 or col >= 7:
                return False
            if self.palace_grid[pi][row][col] is not None:
                print("  Cell already occupied!")
                return False
            # Must be adjacent to existing tile
            adjacent = False
            for dr, dc in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
                nr, nc = row + dr, col + dc
                if 0 <= nr < 7 and 0 <= nc < 7 and self.palace_grid[pi][nr][nc] is not None:
                    adjacent = True
                    break
            if not adjacent:
                print("  Must place adjacent to existing tile!")
                return False
            tile = self.reserve[pi].pop(ridx)
            self.palace_grid[pi][row][col] = tile
            self.palace[pi].append(tile)
            return True

        elif cmd == "reserve" and len(parts) == 2:
            try:
                idx = int(parts[1]) - 1
            except ValueError:
                return False
            if idx < 0 or idx >= len(self.market):
                return False
            tile = self.market[idx]
            currency = tile["market_currency"]
            cost = tile["cost"]
            if self.money[pi][currency] < cost:
                print(f"  Need {cost} {currency}, have {self.money[pi][currency]}!")
                return False
            self.money[pi][currency] -= cost
            self.reserve[pi].append(tile)
            self.market.pop(idx)
            self._refill_market()
            self._check_scoring()
            return True

        elif cmd == "rearrange" and len(parts) >= 4:
            try:
                row = int(parts[1])
                col = int(parts[2])
            except ValueError:
                return False
            if parts[3] == "to_reserve":
                if row < 0 or row >= 7 or col < 0 or col >= 7:
                    return False
                tile = self.palace_grid[pi][row][col]
                if tile is None or tile["type"] == "Fountain":
                    print("  Cannot remove that!")
                    return False
                self.palace_grid[pi][row][col] = None
                self.palace[pi].remove(tile)
                self.reserve[pi].append(tile)
                return True

        elif cmd == "steal" and self.variation == "thieves_turn" and len(parts) == 2:
            opp = 1 - pi
            try:
                idx = int(parts[1]) - 1
            except ValueError:
                return False
            if idx < 0 or idx >= len(self.reserve[opp]):
                print("  Invalid target!")
                return False
            stolen = self.reserve[opp].pop(idx)
            self.reserve[pi].append(stolen)
            print(f"  Stole {stolen['type']} from opponent's reserve!")
            return True

        return False

    def _check_scoring(self):
        """Trigger scoring rounds based on tiles remaining."""
        remaining = len(self.tile_bag)
        for i, threshold in enumerate(self.tiles_remaining_at_scoring):
            if remaining <= threshold and not self.scoring_triggered[i]:
                self.scoring_triggered[i] = True
                self.scoring_round = i + 1
                self._do_scoring(i)
                print(f"\n  *** SCORING ROUND {i+1}! ***")
                for pi in range(2):
                    print(f"  P{pi+1} score: {self.scores[pi]}")
                input("  Press Enter to continue...")

    def check_game_over(self):
        """Game ends after 3rd scoring round."""
        if self.scoring_round >= 3:
            self.game_over = True
            if self.scores[0] > self.scores[1]:
                self.winner = 1
            elif self.scores[1] > self.scores[0]:
                self.winner = 2
            else:
                self.winner = None
        if not self.tile_bag and not self.market:
            self.game_over = True
            if self.scoring_round < 3:
                self._do_scoring(2)
            if self.scores[0] > self.scores[1]:
                self.winner = 1
            elif self.scores[1] > self.scores[0]:
                self.winner = 2
            else:
                self.winner = None

    def get_state(self):
        """Return serializable game state."""
        return {
            "money": self.money, "palace": self.palace, "reserve": self.reserve,
            "tile_bag": self.tile_bag, "market": self.market,
            "money_deck": self.money_deck, "money_display": self.money_display,
            "scoring_round": self.scoring_round, "scoring_triggered": self.scoring_triggered,
            "scores": self.scores, "palace_grid": [
                [[cell if cell else None for cell in row] for row in grid]
                for grid in self.palace_grid
            ],
        }

    def load_state(self, state):
        """Restore game state."""
        self.money = state["money"]
        self.palace = state["palace"]
        self.reserve = state["reserve"]
        self.tile_bag = state["tile_bag"]
        self.market = state["market"]
        self.money_deck = state["money_deck"]
        self.money_display = state["money_display"]
        self.scoring_round = state["scoring_round"]
        self.scoring_triggered = state["scoring_triggered"]
        self.scores = state["scores"]
        self.palace_grid = [
            [[cell if cell else None for cell in row] for row in grid]
            for grid in state["palace_grid"]
        ]

    def get_tutorial(self):
        """Return tutorial text."""
        thief_note = """
  THIEVES VARIANT:
  Use 'steal <#>' to take a tile from your
  opponent's reserve pile. Use this wisely!
""" if self.variation == "thieves_turn" else ""
        return f"""
==================================================
  Alhambra - Tutorial
==================================================

  OVERVIEW:
  Build the most magnificent Alhambra palace!
  Buy building tiles using exact change in four
  currencies. Place tiles to grow your palace.
  Score for building majorities and longest wall.

  CURRENCIES: Blue, Green, Orange, Yellow
  Each tile costs a specific amount in one currency.

  ON YOUR TURN:
  1. BUY a tile from the market:
     Command: buy <market#>
     Pay exact cost in the tile's currency.
     Tile goes to your reserve to place later.

  2. TAKE money cards:
     Command: take <card#> [<card#>...]
     Take 1 card of any value, OR multiple cards
     if their total value is 5 or less.

  3. PLACE a tile from reserve:
     Command: place <reserve#> <row> <col>
     Must be adjacent to existing tile.

  4. REARRANGE your palace:
     Command: rearrange <row> <col> to_reserve
     Remove a tile back to your reserve.

  PALACE GRID:
  7x7 grid with Fountain (FN) at center (3,3).
  Build outward from the fountain.
  Tiles have walls on certain sides (N/E/S/W).

  SCORING (3 rounds):
  - Building majorities: most of each type scores
    increasing points per round.
  - Longest wall: each wall segment facing outside
    or empty space scores 1 point.
  - Scoring triggers when tile supply decreases.

  EXACT CHANGE BONUS:
  If you pay exactly the right amount (no change),
  you may take an additional action!
{thief_note}
  STRATEGY:
  - Diversify currencies to access more tiles
  - Focus on 2-3 building types for majorities
  - Plan wall placement for maximum segments
  - Use reserve to reorganize your palace layout
  - Take high-value money cards early

==================================================
"""
