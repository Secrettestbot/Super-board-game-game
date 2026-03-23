"""Sobek - A market tile drafting game set in ancient Egypt."""

import random

from engine.base import BaseGame, input_with_quit, clear_screen


GOODS_TYPES = ["Ivory", "Ebony", "Marble", "Wheat", "Cattle"]
GOODS_VALUES = {"Ivory": 5, "Ebony": 4, "Marble": 3, "Wheat": 2, "Cattle": 1}

# Special action tiles
SPECIAL_ACTIONS = ["Swap", "Steal", "Discard", "Peek"]

# Tile: {"type": "good"/"special", "good": name, "value": int, "scarab": bool, "action": str}


def _build_full_deck():
    """Build the standard 45-tile deck."""
    tiles = []
    # Goods tiles: varied counts per type
    counts = {"Ivory": 6, "Ebony": 7, "Marble": 8, "Wheat": 9, "Cattle": 9}
    for good, count in counts.items():
        for i in range(count):
            scarab = (i == 0)  # first tile of each type has scarab
            tiles.append({
                "type": "good",
                "good": good,
                "value": GOODS_VALUES[good],
                "scarab": scarab,
                "action": None,
            })
    # Special tiles
    for action in SPECIAL_ACTIONS:
        tiles.append({
            "type": "special",
            "good": None,
            "value": 0,
            "scarab": False,
            "action": action,
        })
    # Fill remaining to 45
    while len(tiles) < 45:
        g = random.choice(GOODS_TYPES)
        tiles.append({
            "type": "good", "good": g, "value": GOODS_VALUES[g],
            "scarab": False, "action": None,
        })
    random.shuffle(tiles)
    return tiles


def _build_quick_deck():
    """Build the quick 30-tile deck."""
    tiles = []
    counts = {"Ivory": 4, "Ebony": 5, "Marble": 5, "Wheat": 6, "Cattle": 6}
    for good, count in counts.items():
        for i in range(count):
            scarab = (i == 0)
            tiles.append({
                "type": "good",
                "good": good,
                "value": GOODS_VALUES[good],
                "scarab": scarab,
                "action": None,
            })
    for action in SPECIAL_ACTIONS[:2]:  # Only Swap and Steal in quick
        tiles.append({
            "type": "special", "good": None, "value": 0,
            "scarab": False, "action": action,
        })
    random.shuffle(tiles)
    return tiles


class SobekGame(BaseGame):
    """Sobek - a market tile drafting game set in ancient Egypt."""

    name = "Sobek"
    description = "Draft tiles from the market, collect sets of goods"
    min_players = 2
    max_players = 2
    variations = {
        "standard": "Standard game (45-tile deck)",
        "quick": "Quick game (30-tile deck)",
    }

    def __init__(self, variation=None):
        super().__init__(variation)
        self.deck = []
        # 3x3 market grid, each cell is a tile dict or None
        self.market = [[None] * 3 for _ in range(3)]
        # Player collections: list of tiles
        self.collections = {1: [], 2: []}
        # Corruption tiles (skipped tiles become corruption)
        self.corruption = {1: [], 2: []}
        # Cooked/scored sets
        self.scored_sets = {1: [], 2: []}
        self.scores = {1: 0, 2: 0}
        self.log = []
        self.last_take_direction = None  # track direction of last take

    def _fill_market(self):
        """Fill empty market slots from deck."""
        for r in range(3):
            for c in range(3):
                if self.market[r][c] is None and self.deck:
                    self.market[r][c] = self.deck.pop()

    def _get_edge_positions(self):
        """Get positions accessible from market edges."""
        edges = []
        # All positions on the edges of the 3x3 grid
        for r in range(3):
            for c in range(3):
                if r == 0 or r == 2 or c == 0 or c == 2:
                    if self.market[r][c] is not None:
                        edges.append((r, c))
        return edges

    def _get_available_positions(self):
        """Get all positions with tiles, marking corruption cost."""
        available = []
        edges = self._get_edge_positions()
        # Also include center if all edges in a line are empty
        center = (1, 1)
        if self.market[1][1] is not None:
            edges.append(center)
        for pos in edges:
            available.append(pos)
        return available

    def _tile_display(self, tile):
        """Short display string for a tile."""
        if tile is None:
            return "  .  "
        if tile["type"] == "special":
            return f" [{tile['action'][:3]}]"
        scarab = "*" if tile["scarab"] else " "
        return f"{scarab}{tile['good'][:3]}{tile['value']}"

    def setup(self):
        if self.variation == "quick":
            self.deck = _build_quick_deck()
        else:
            self.deck = _build_full_deck()
        random.shuffle(self.deck)
        self.market = [[None] * 3 for _ in range(3)]
        self.collections = {1: [], 2: []}
        self.corruption = {1: [], 2: []}
        self.scored_sets = {1: [], 2: []}
        self.scores = {1: 0, 2: 0}
        self._fill_market()

    def display(self):
        clear_screen()
        print("=" * 55)
        print("  SOBEK - Market Tile Drafting")
        print("=" * 55)
        print(f"  Deck remaining: {len(self.deck)} tiles")
        print()

        # Market display
        print("  Market (3x3):")
        print("       Col 1    Col 2    Col 3")
        for r in range(3):
            row_str = f"  R{r + 1}  "
            for c in range(3):
                tile = self.market[r][c]
                row_str += f" {self._tile_display(tile):7s}"
            print(row_str)
        print()
        print("  Legend: * = scarab bonus, [Xxx] = special action tile")
        print()

        # Player info
        for p in [1, 2]:
            print(f"  {self.players[p - 1]} (Score: {self.scores[p]}):")
            # Group collection by good type
            goods_count = {}
            for t in self.collections[p]:
                if t["type"] == "good":
                    g = t["good"]
                    goods_count[g] = goods_count.get(g, 0) + 1
            if goods_count:
                parts = [f"{g}:{c}" for g, c in sorted(goods_count.items())]
                print(f"    Collection: {', '.join(parts)}")
            else:
                print(f"    Collection: (empty)")
            print(f"    Corruption: {len(self.corruption[p])} tiles (-{self._corruption_penalty(p)} pts)")
            if self.scored_sets[p]:
                print(f"    Scored sets: {len(self.scored_sets[p])}")
            print()

        # Recent log
        if self.log:
            for entry in self.log[-4:]:
                print(f"  {entry}")
            print()

    def _corruption_penalty(self, player):
        n = len(self.corruption[player])
        # Corruption penalty scales: 1,3,6,10,15...
        return n * (n + 1) // 2

    def get_move(self):
        p = self.current_player
        print(f"  {self.players[p - 1]}'s turn:")
        print("  Actions:")
        print("    take R C  - Take tile at row R, col C (e.g., 'take 1 2')")
        print("    sell TYPE  - Sell 2+ matching goods for sticks (e.g., 'sell Ivory')")
        print("    score TYPE - Score 3+ matching goods (e.g., 'score Wheat')")
        move = input_with_quit("  > ").strip()
        return move

    def make_move(self, move):
        p = self.current_player
        parts = move.split()
        if not parts:
            return False

        action = parts[0].lower()

        if action == "take" and len(parts) == 3:
            try:
                r, c = int(parts[1]) - 1, int(parts[2]) - 1
            except ValueError:
                return False
            if r < 0 or r > 2 or c < 0 or c > 2:
                return False
            if self.market[r][c] is None:
                return False

            # Calculate corruption: tiles skipped on the edge
            edges = self._get_edge_positions()
            if (r, c) not in edges and (r, c) != (1, 1):
                return False

            # Corruption: count non-None tiles closer to edges than target
            # Simple rule: if target is not in the first available position
            # along any edge line, tiles skipped become corruption
            corruption_tiles = self._calc_corruption(r, c)
            for cr, cc in corruption_tiles:
                self.corruption[p].append(self.market[cr][cc])
                self.market[cr][cc] = None

            tile = self.market[r][c]
            self.market[r][c] = None

            if tile["type"] == "special":
                self._handle_special(p, tile)
                self.log.append(f"{self.players[p - 1]} takes special: {tile['action']}")
            else:
                self.collections[p].append(tile)
                self.log.append(f"{self.players[p - 1]} takes {tile['good']} (val {tile['value']})")

            self._fill_market()
            return True

        elif action == "sell" and len(parts) >= 2:
            good_type = parts[1].capitalize()
            if good_type not in GOODS_TYPES:
                return False
            matching = [t for t in self.collections[p]
                        if t["type"] == "good" and t["good"] == good_type]
            if len(matching) < 2:
                print(f"  Need at least 2 {good_type} to sell (have {len(matching)})")
                input("  Press Enter...")
                return False
            # Sell: remove 2 matching, gain points equal to their values
            sold = matching[:2]
            for t in sold:
                self.collections[p].remove(t)
            points = sum(t["value"] for t in sold)
            self.scores[p] += points
            self.log.append(f"{self.players[p - 1]} sells 2 {good_type} for {points} pts")
            return True

        elif action == "score" and len(parts) >= 2:
            good_type = parts[1].capitalize()
            if good_type not in GOODS_TYPES:
                return False
            matching = [t for t in self.collections[p]
                        if t["type"] == "good" and t["good"] == good_type]
            if len(matching) < 3:
                print(f"  Need at least 3 {good_type} to score (have {len(matching)})")
                input("  Press Enter...")
                return False
            # Score set: remove all matching, big bonus
            for t in matching:
                self.collections[p].remove(t)
            # Points: count * value * set bonus
            base = sum(t["value"] for t in matching)
            scarabs = sum(1 for t in matching if t["scarab"])
            bonus = len(matching) * 2 + scarabs * 3
            total = base + bonus
            self.scores[p] += total
            self.scored_sets[p].append({"good": good_type, "count": len(matching), "points": total})
            self.log.append(f"{self.players[p - 1]} scores {len(matching)} {good_type} for {total} pts!")
            return True

        return False

    def _calc_corruption(self, r, c):
        """Calculate which tiles are skipped (become corruption) when taking (r,c)."""
        # Simple approach: tiles between an edge and the target in same row/col
        corruption = []
        # Check from each direction
        best = []
        # From top of column
        if r > 0:
            path = [(rr, c) for rr in range(0, r) if self.market[rr][c] is not None]
            if path:
                best.append(path)
        # From bottom
        if r < 2:
            path = [(rr, c) for rr in range(2, r, -1) if self.market[rr][c] is not None]
            if path:
                best.append(path)
        # From left
        if c > 0:
            path = [(r, cc) for cc in range(0, c) if self.market[r][cc] is not None]
            if path:
                best.append(path)
        # From right
        if c < 2:
            path = [(r, cc) for cc in range(2, c, -1) if self.market[r][cc] is not None]
            if path:
                best.append(path)

        # Choose the path with least corruption (or empty if directly accessible)
        if not best:
            return []
        best.sort(key=len)
        return best[0]

    def _handle_special(self, player, tile):
        """Handle special action tiles."""
        action = tile["action"]
        other = 2 if player == 1 else 1

        if action == "Swap":
            # Swap two tiles in the market
            positions = [(r, c) for r in range(3) for c in range(3) if self.market[r][c] is not None]
            if len(positions) >= 2:
                a, b = positions[0], positions[1]
                self.market[a[0]][a[1]], self.market[b[0]][b[1]] = \
                    self.market[b[0]][b[1]], self.market[a[0]][a[1]]
                self.log.append(f"  Swap rearranges market!")

        elif action == "Steal":
            # Steal a random tile from opponent's collection
            if self.collections[other]:
                stolen = random.choice(self.collections[other])
                self.collections[other].remove(stolen)
                self.collections[player].append(stolen)
                self.log.append(f"  Steal: took {stolen.get('good', '?')} from opponent!")

        elif action == "Discard":
            # Discard a corruption tile
            if self.corruption[player]:
                self.corruption[player].pop()
                self.log.append(f"  Discard: removed 1 corruption tile")

        elif action == "Peek":
            # Peek at top of deck and optionally take it
            if self.deck:
                peeked = self.deck[-1]
                if peeked["type"] == "good":
                    self.collections[player].append(self.deck.pop())
                    self.log.append(f"  Peek: took {peeked['good']} from deck!")
                else:
                    self.log.append(f"  Peek: saw a special tile, left it")

    def check_game_over(self):
        # Game ends when market can't be refilled and is mostly empty
        tiles_in_market = sum(1 for r in range(3) for c in range(3) if self.market[r][c] is not None)
        if tiles_in_market == 0 and not self.deck:
            self.game_over = True
            # Final scoring: subtract corruption
            for p in [1, 2]:
                # Score remaining collection
                for t in self.collections[p]:
                    if t["type"] == "good":
                        self.scores[p] += t["value"]
                # Subtract corruption
                self.scores[p] -= self._corruption_penalty(p)
                self.scores[p] = max(0, self.scores[p])

            if self.scores[1] > self.scores[2]:
                self.winner = 1
            elif self.scores[2] > self.scores[1]:
                self.winner = 2
            else:
                self.winner = None  # draw

    def get_state(self):
        return {
            "deck": self.deck,
            "market": self.market,
            "collections": {str(k): v for k, v in self.collections.items()},
            "corruption": {str(k): v for k, v in self.corruption.items()},
            "scored_sets": {str(k): v for k, v in self.scored_sets.items()},
            "scores": {str(k): v for k, v in self.scores.items()},
            "log": self.log[-20:],
        }

    def load_state(self, state):
        self.deck = state["deck"]
        self.market = state["market"]
        self.collections = {int(k): v for k, v in state["collections"].items()}
        self.corruption = {int(k): v for k, v in state["corruption"].items()}
        self.scored_sets = {int(k): v for k, v in state["scored_sets"].items()}
        self.scores = {int(k): v for k, v in state["scores"].items()}
        self.log = state.get("log", [])

    def get_tutorial(self):
        return """
==================================================
  SOBEK - Tutorial
==================================================

  OVERVIEW:
  Sobek is a market tile drafting game for 2 players.
  Collect sets of matching goods to score points.

  THE MARKET:
  Tiles are arranged in a 3x3 grid. On your turn, you can
  take a tile from any edge position. If you skip over tiles
  to reach one further in, the skipped tiles become your
  CORRUPTION (penalty points at end of game).

  TILE TYPES:
  - Goods: Ivory(5), Ebony(4), Marble(3), Wheat(2), Cattle(1)
    Values shown are per-tile point values.
  - Special: Action tiles that give you bonus effects.
  - Scarab (*): Tiles marked with * give bonus points when scored.

  ACTIONS ON YOUR TURN:
  1. TAKE a tile: 'take R C' (e.g., 'take 1 2')
  2. SELL 2+ matching goods: 'sell TYPE' (e.g., 'sell Ivory')
     Earns points equal to tile values.
  3. SCORE 3+ matching goods: 'score TYPE' (e.g., 'score Wheat')
     Earns tile values + set bonus + scarab bonuses.

  CORRUPTION:
  Each corruption tile costs increasing points: 1, 3, 6, 10...
  Be careful about skipping tiles!

  GAME END:
  When the market empties and no tiles remain in the deck,
  final scoring happens. Highest score wins.

  COMMANDS:
  Type 'quit' to quit, 'save' to save, 'help' for help.
==================================================
"""
