"""Circle of Life - Ecosystem food chain card game for 2 players."""

import random

from engine.base import BaseGame, input_with_quit, clear_screen


# Card types with predator/prey relationships
# Each animal: (name, tier, prey_tiers, base_points)
# tier: 0=plant, 1=herbivore, 2=predator, 3=apex
ANIMALS_FULL = [
    # Plants (tier 0) - 16 cards
    ("Grass", 0, [], 1),
    ("Grass", 0, [], 1),
    ("Grass", 0, [], 1),
    ("Grass", 0, [], 1),
    ("Fern", 0, [], 1),
    ("Fern", 0, [], 1),
    ("Fern", 0, [], 1),
    ("Berry Bush", 0, [], 2),
    ("Berry Bush", 0, [], 2),
    ("Berry Bush", 0, [], 2),
    ("Oak Tree", 0, [], 2),
    ("Oak Tree", 0, [], 2),
    ("Algae", 0, [], 1),
    ("Algae", 0, [], 1),
    ("Wildflower", 0, [], 1),
    ("Wildflower", 0, [], 1),
    # Herbivores (tier 1) - 20 cards
    ("Rabbit", 1, [0], 3),
    ("Rabbit", 1, [0], 3),
    ("Rabbit", 1, [0], 3),
    ("Rabbit", 1, [0], 3),
    ("Deer", 1, [0], 4),
    ("Deer", 1, [0], 4),
    ("Deer", 1, [0], 4),
    ("Mouse", 1, [0], 2),
    ("Mouse", 1, [0], 2),
    ("Mouse", 1, [0], 2),
    ("Mouse", 1, [0], 2),
    ("Squirrel", 1, [0], 3),
    ("Squirrel", 1, [0], 3),
    ("Caterpillar", 1, [0], 2),
    ("Caterpillar", 1, [0], 2),
    ("Beetle", 1, [0], 2),
    ("Beetle", 1, [0], 2),
    ("Sparrow", 1, [0], 3),
    ("Sparrow", 1, [0], 3),
    ("Sparrow", 1, [0], 3),
    # Predators (tier 2) - 16 cards
    ("Fox", 2, [1], 5),
    ("Fox", 2, [1], 5),
    ("Fox", 2, [1], 5),
    ("Hawk", 2, [1], 5),
    ("Hawk", 2, [1], 5),
    ("Snake", 2, [1], 4),
    ("Snake", 2, [1], 4),
    ("Snake", 2, [1], 4),
    ("Owl", 2, [1], 5),
    ("Owl", 2, [1], 5),
    ("Frog", 2, [1], 3),
    ("Frog", 2, [1], 3),
    ("Weasel", 2, [1], 4),
    ("Weasel", 2, [1], 4),
    ("Heron", 2, [1], 5),
    ("Heron", 2, [1], 5),
    # Apex Predators (tier 3) - 8 cards
    ("Wolf", 3, [1, 2], 7),
    ("Wolf", 3, [1, 2], 7),
    ("Wolf", 3, [1, 2], 7),
    ("Eagle", 3, [1, 2], 8),
    ("Eagle", 3, [1, 2], 8),
    ("Bear", 3, [1, 2], 9),
    ("Bear", 3, [1, 2], 9),
    ("Mountain Lion", 3, [1, 2], 10),
]

ANIMALS_QUICK = [
    # Plants - 10 cards
    ("Grass", 0, [], 1),
    ("Grass", 0, [], 1),
    ("Grass", 0, [], 1),
    ("Fern", 0, [], 1),
    ("Fern", 0, [], 1),
    ("Berry Bush", 0, [], 2),
    ("Berry Bush", 0, [], 2),
    ("Oak Tree", 0, [], 2),
    ("Wildflower", 0, [], 1),
    ("Wildflower", 0, [], 1),
    # Herbivores - 14 cards
    ("Rabbit", 1, [0], 3),
    ("Rabbit", 1, [0], 3),
    ("Rabbit", 1, [0], 3),
    ("Deer", 1, [0], 4),
    ("Deer", 1, [0], 4),
    ("Mouse", 1, [0], 2),
    ("Mouse", 1, [0], 2),
    ("Mouse", 1, [0], 2),
    ("Squirrel", 1, [0], 3),
    ("Squirrel", 1, [0], 3),
    ("Caterpillar", 1, [0], 2),
    ("Caterpillar", 1, [0], 2),
    ("Sparrow", 1, [0], 3),
    ("Sparrow", 1, [0], 3),
    # Predators - 10 cards
    ("Fox", 2, [1], 5),
    ("Fox", 2, [1], 5),
    ("Hawk", 2, [1], 5),
    ("Hawk", 2, [1], 5),
    ("Snake", 2, [1], 4),
    ("Snake", 2, [1], 4),
    ("Owl", 2, [1], 5),
    ("Owl", 2, [1], 5),
    ("Frog", 2, [1], 3),
    ("Frog", 2, [1], 3),
    # Apex - 6 cards
    ("Wolf", 3, [1, 2], 7),
    ("Wolf", 3, [1, 2], 7),
    ("Eagle", 3, [1, 2], 8),
    ("Eagle", 3, [1, 2], 8),
    ("Bear", 3, [1, 2], 9),
    ("Mountain Lion", 3, [1, 2], 10),
]

TIER_NAMES = {0: "Plant", 1: "Herbivore", 2: "Predator", 3: "Apex"}
TIER_SYMBOLS = {0: "~", 1: "o", 2: "^", 3: "*"}

# Food chain bonuses: plant->herb->pred = 3pts, plant->herb->pred->apex = 6pts
CHAIN_BONUS = {2: 3, 3: 6, 4: 10}


class CircleOfLifeGame(BaseGame):
    """Circle of Life - an ecosystem food chain card game for 2 players."""

    name = "Circle of Life"
    description = "Build food chains in your ecosystem for points"
    min_players = 2
    max_players = 2
    variations = {
        "standard": "Standard game (60-card deck, 4x4 grid)",
        "quick": "Quick game (40-card deck, 3x3 grid)",
        "strategic": "Strategic game (60-card deck, 4x4 grid, draft from market)",
    }

    def __init__(self, variation=None):
        super().__init__(variation)
        if self.variation == "quick":
            self.grid_size = 3
            self.animal_pool = ANIMALS_QUICK
        else:
            self.grid_size = 4
            self.animal_pool = ANIMALS_FULL

        self.deck = []
        self.market = []  # 4 face-up cards to draft from
        self.hands = {1: [], 2: []}
        # Grid: each cell is a card dict or None
        self.grids = {1: None, 2: None}
        self.scores = {1: 0, 2: 0}
        self.chains_found = {1: [], 2: []}
        self.log = []
        self.phase = "draft"  # draft or place

    def _build_deck(self):
        self.deck = []
        for name, tier, prey_tiers, pts in self.animal_pool:
            self.deck.append({
                "name": name,
                "tier": tier,
                "prey_tiers": list(prey_tiers),
                "points": pts,
            })
        random.shuffle(self.deck)

    def _fill_market(self):
        while len(self.market) < 4 and self.deck:
            self.market.append(self.deck.pop())

    def _init_grids(self):
        for p in [1, 2]:
            self.grids[p] = [[None] * self.grid_size for _ in range(self.grid_size)]

    def setup(self):
        self._build_deck()
        self._init_grids()
        self.market = []
        self._fill_market()
        self.hands = {1: [], 2: []}
        self.scores = {1: 0, 2: 0}
        self.chains_found = {1: [], 2: []}
        # Deal starting hands
        for _ in range(3):
            for p in [1, 2]:
                if self.deck:
                    self.hands[p].append(self.deck.pop())
        self.phase = "draft"

    def _grid_display(self, player):
        """Render a player's grid as ASCII."""
        g = self.grids[player]
        lines = []
        header = "    " + "   ".join(str(c) for c in range(self.grid_size))
        lines.append(header)
        lines.append("   " + "----" * self.grid_size)
        for r in range(self.grid_size):
            row_str = f" {r} |"
            for c in range(self.grid_size):
                cell = g[r][c]
                if cell is None:
                    row_str += " . |"
                else:
                    sym = TIER_SYMBOLS[cell["tier"]]
                    name = cell["name"][:2]
                    row_str += f"{sym}{name}|"
            lines.append(row_str)
            lines.append("   " + "----" * self.grid_size)
        return "\n".join(lines)

    def _card_str(self, card):
        return f"{card['name']}({TIER_NAMES[card['tier']]},{card['points']}pt)"

    def display(self):
        clear_screen()
        print("=" * 60)
        print("  CIRCLE OF LIFE - Ecosystem Food Chain")
        print("=" * 60)
        print(f"  Deck: {len(self.deck)} cards  |  Turn: {self.players[self.current_player - 1]}")
        print()

        # Market
        print("  Market (available to draft):")
        for i, card in enumerate(self.market):
            print(f"    {i + 1}. {self._card_str(card)}")
        print()

        # Both grids
        for p in [1, 2]:
            marker = " << " if p == self.current_player else ""
            print(f"  {self.players[p - 1]}'s Ecosystem (Score: {self.scores[p]}){marker}")
            print(self._grid_display(p))
            if self.chains_found[p]:
                print(f"    Chains: {len(self.chains_found[p])} found")
            print()

        # Current player hand
        p = self.current_player
        print(f"  Your hand:")
        for i, card in enumerate(self.hands[p]):
            prey_str = ""
            if card["prey_tiers"]:
                prey_names = [TIER_NAMES[t] for t in card["prey_tiers"]]
                prey_str = f" [eats: {', '.join(prey_names)}]"
            print(f"    {i + 1}. {self._card_str(card)}{prey_str}")
        print()

        # Tier legend
        print(f"  Tiers: ~=Plant  o=Herbivore  ^=Predator  *=Apex")
        print(f"  Chain bonus: 2-tier=+3  3-tier=+6  4-tier=+10")
        print()

        if self.log:
            for entry in self.log[-4:]:
                print(f"  {entry}")
            print()

    def get_move(self):
        p = self.current_player
        print("  Actions:")
        print("    draft N     - Take card N from market into hand")
        print("    place N R C - Place hand card N at grid position (R, C)")
        print("    swap N R C  - Replace grid card at (R,C) with hand card N")
        move = input_with_quit("  > ").strip()
        return move

    def make_move(self, move):
        p = self.current_player
        parts = move.split()
        if not parts:
            return False

        action = parts[0].lower()

        if action == "draft" and len(parts) >= 2:
            try:
                idx = int(parts[1]) - 1
            except ValueError:
                return False
            if idx < 0 or idx >= len(self.market):
                return False
            if len(self.hands[p]) >= 7:  # hand limit
                print("  Hand full (7 cards max)! Place some cards first.")
                input("  Press Enter...")
                return False
            card = self.market.pop(idx)
            self.hands[p].append(card)
            self.log.append(f"{self.players[p - 1]} drafts {self._card_str(card)}")
            self._fill_market()
            return True

        elif action == "place" and len(parts) >= 4:
            try:
                cidx = int(parts[1]) - 1
                r = int(parts[2])
                c = int(parts[3])
            except ValueError:
                return False
            if cidx < 0 or cidx >= len(self.hands[p]):
                return False
            if r < 0 or r >= self.grid_size or c < 0 or c >= self.grid_size:
                return False
            if self.grids[p][r][c] is not None:
                print("  Cell occupied! Use 'swap' to replace.")
                input("  Press Enter...")
                return False

            card = self.hands[p].pop(cidx)
            self.grids[p][r][c] = card
            self.log.append(f"{self.players[p - 1]} places {self._card_str(card)} at ({r},{c})")
            self._recalculate_score(p)
            return True

        elif action == "swap" and len(parts) >= 4:
            try:
                cidx = int(parts[1]) - 1
                r = int(parts[2])
                c = int(parts[3])
            except ValueError:
                return False
            if cidx < 0 or cidx >= len(self.hands[p]):
                return False
            if r < 0 or r >= self.grid_size or c < 0 or c >= self.grid_size:
                return False
            if self.grids[p][r][c] is None:
                print("  Cell empty! Use 'place' instead.")
                input("  Press Enter...")
                return False

            old_card = self.grids[p][r][c]
            new_card = self.hands[p].pop(cidx)
            self.grids[p][r][c] = new_card
            self.hands[p].append(old_card)
            self.log.append(f"{self.players[p - 1]} swaps {self._card_str(old_card)} "
                            f"with {self._card_str(new_card)} at ({r},{c})")
            self._recalculate_score(p)
            return True

        return False

    def _recalculate_score(self, player):
        """Recalculate score based on cards in grid and food chains."""
        grid = self.grids[player]
        base_score = 0
        chain_score = 0
        chains = []

        # Base score: sum of all card points
        for r in range(self.grid_size):
            for c in range(self.grid_size):
                if grid[r][c] is not None:
                    base_score += grid[r][c]["points"]

        # Find food chains: connected paths of increasing tier
        # Adjacent = orthogonal (up/down/left/right)
        visited_chains = []

        for r in range(self.grid_size):
            for c in range(self.grid_size):
                cell = grid[r][c]
                if cell is not None and cell["tier"] == 0:
                    # Start chain from each plant
                    found = self._find_chains_from(grid, r, c, [])
                    for chain in found:
                        if len(chain) >= 2:
                            chain_key = tuple(sorted((cr, cc) for cr, cc in chain))
                            if chain_key not in visited_chains:
                                visited_chains.append(chain_key)
                                tiers_in_chain = len(chain)
                                bonus = CHAIN_BONUS.get(tiers_in_chain, 0)
                                chain_score += bonus
                                chains.append({
                                    "length": tiers_in_chain,
                                    "bonus": bonus,
                                    "cells": [[cr, cc] for cr, cc in chain],
                                })

        self.scores[player] = base_score + chain_score
        self.chains_found[player] = chains

    def _find_chains_from(self, grid, r, c, current_chain):
        """Find food chains starting from (r,c). Returns list of chains."""
        cell = grid[r][c]
        current_chain = current_chain + [(r, c)]
        current_tier = cell["tier"]

        # Look for adjacent cells with next tier that can eat current tier
        next_cells = []
        for dr, dc in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
            nr, nc = r + dr, c + dc
            if 0 <= nr < self.grid_size and 0 <= nc < self.grid_size:
                neighbor = grid[nr][nc]
                if neighbor is not None and (nr, nc) not in current_chain:
                    if neighbor["tier"] == current_tier + 1:
                        if current_tier in neighbor["prey_tiers"] or current_tier == 0:
                            next_cells.append((nr, nc))

        if not next_cells:
            return [current_chain]

        all_chains = []
        for nr, nc in next_cells:
            sub_chains = self._find_chains_from(grid, nr, nc, current_chain)
            all_chains.extend(sub_chains)

        return all_chains

    def check_game_over(self):
        # Game ends when both grids are full or deck + market exhausted
        both_full = True
        for p in [1, 2]:
            for r in range(self.grid_size):
                for c in range(self.grid_size):
                    if self.grids[p][r][c] is None:
                        both_full = False
                        break
                if not both_full:
                    break
            if not both_full:
                break

        no_cards_left = not self.deck and not self.market

        if both_full or no_cards_left:
            # Final recalculation
            for p in [1, 2]:
                self._recalculate_score(p)
            self.game_over = True
            if self.scores[1] > self.scores[2]:
                self.winner = 1
            elif self.scores[2] > self.scores[1]:
                self.winner = 2
            else:
                self.winner = None

    def get_state(self):
        return {
            "deck": self.deck,
            "market": self.market,
            "hands": {str(k): v for k, v in self.hands.items()},
            "grids": {str(k): v for k, v in self.grids.items()},
            "scores": {str(k): v for k, v in self.scores.items()},
            "chains_found": {str(k): v for k, v in self.chains_found.items()},
            "phase": self.phase,
            "log": self.log[-20:],
        }

    def load_state(self, state):
        self.deck = state["deck"]
        self.market = state["market"]
        self.hands = {int(k): v for k, v in state["hands"].items()}
        self.grids = {int(k): v for k, v in state["grids"].items()}
        self.scores = {int(k): v for k, v in state["scores"].items()}
        self.chains_found = {int(k): v for k, v in state["chains_found"].items()}
        self.phase = state.get("phase", "draft")
        self.log = state.get("log", [])

    def get_tutorial(self):
        return """
==================================================
  CIRCLE OF LIFE - Tutorial
==================================================

  OVERVIEW:
  Build an ecosystem by placing animal cards in your
  personal grid. Create food chains for bonus points!

  TIERS:
  ~ Plant (tier 0)     - Base of food chain
  o Herbivore (tier 1) - Eats plants
  ^ Predator (tier 2)  - Eats herbivores
  * Apex (tier 3)      - Eats herbivores and predators

  FOOD CHAINS:
  A food chain is a connected path (orthogonally adjacent)
  of cards with increasing tiers:
    Plant -> Herbivore        = +3 bonus points
    Plant -> Herb -> Predator = +6 bonus points
    Plant -> Herb -> Pred -> Apex = +10 bonus points

  YOUR TURN (pick one action):
  1. DRAFT: Take a card from the market into your hand.
     'draft 1' (takes card #1 from market)

  2. PLACE: Put a card from your hand onto your grid.
     'place 1 2 3' (place hand card #1 at row 2, col 3)

  3. SWAP: Replace a grid card with one from your hand.
     'swap 1 0 0' (swap hand card #1 into position 0,0)

  SCORING:
  - Each card scores its base points when placed.
  - Food chain bonuses are calculated for connected paths.
  - Longer chains score more!

  STRATEGY:
  - Plan your grid layout to create multiple food chains.
  - Place plants first, then layer herbivores and predators.
  - Adjacency matters: cards must be next to their prey!

  GAME END:
  The game ends when both grids are full or no cards remain.
  Highest score wins!

  COMMANDS:
  Type 'quit' to quit, 'save' to save, 'help' for help.
==================================================
"""
