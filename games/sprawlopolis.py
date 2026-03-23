"""Sprawlopolis - Cooperative city-building card placement game."""

import random

from engine.base import BaseGame, input_with_quit, clear_screen


ZONES = ["R", "C", "I", "P"]  # Residential, Commercial, Industrial, Park
ZONE_NAMES = {"R": "Residential", "C": "Commercial", "I": "Industrial", "P": "Park"}
ZONE_DISPLAY = {"R": "Res", "C": "Com", "I": "Ind", "P": "Prk"}
ZONE_CHARS = {"R": "#", "C": "$", "I": "%", "P": "*"}

# Scoring conditions for objective cards
OBJECTIVE_CONDITIONS = [
    {"name": "Sprawl Containment", "id": "sprawl_containment",
     "desc": "Score 1 pt per row where all cells are the same zone"},
    {"name": "Super Park", "id": "super_park",
     "desc": "Score 2 pts per Park group of size 3+"},
    {"name": "Block Party", "id": "block_party",
     "desc": "Score 1 pt per Residential block adjacent to a Commercial block"},
    {"name": "Industrial Corridor", "id": "industrial_corridor",
     "desc": "Score 2 pts if all Industrial blocks are in one group"},
    {"name": "Looping Streets", "id": "looping_streets",
     "desc": "Score -1 per road segment (reduces penalty)"},
    {"name": "Skyscrapers", "id": "skyscrapers",
     "desc": "Score 1 pt per column with 3+ Commercial blocks"},
    {"name": "Green Belt", "id": "green_belt",
     "desc": "Score 2 pts per Park block on the edge of the city"},
    {"name": "Commerce Hub", "id": "commerce_hub",
     "desc": "Score 3 pts if largest Commercial group has 5+ blocks"},
    {"name": "Suburbia", "id": "suburbia",
     "desc": "Score 1 pt per Residential block not adjacent to Industrial"},
    {"name": "Mixed Use", "id": "mixed_use",
     "desc": "Score 2 pts per 2x2 area with 3+ different zone types"},
]


def generate_block():
    """Generate a random 2x2 city block grid."""
    grid = [[random.choice(ZONES) for _ in range(2)] for _ in range(2)]
    roads = random.randint(0, 2)
    return {"grid": grid, "roads": roads}


def generate_card():
    """Generate a card with block side and scoring condition side."""
    block = generate_block()
    condition = random.choice(OBJECTIVE_CONDITIONS)
    return {
        "block": block,
        "condition": {"name": condition["name"], "id": condition["id"], "desc": condition["desc"]},
    }


class SprawlopolisGame(BaseGame):
    """Sprawlopolis: Cooperatively build a city to meet scoring objectives."""

    name = "Sprawlopolis"
    description = "Cooperative city-building with card placement and scoring objectives"
    min_players = 2
    max_players = 2
    variations = {
        "standard": "Target score of 20 points to win",
        "hard": "Target score of 25 points to win",
    }

    def __init__(self, variation=None):
        super().__init__(variation)
        self.city_grid = {}  # (row, col) -> zone character
        self.city_roads = 0  # total road count
        self.objectives = []  # 3 scoring objectives
        self.play_deck = []  # remaining cards to play
        self.current_card = None
        self.cards_played = 0
        self.total_cards = 15
        self.target_score = 20
        self.city_bounds = [0, 0, 1, 1]  # min_r, min_c, max_r, max_c

    def setup(self):
        if self.variation == "hard":
            self.target_score = 25
        else:
            self.target_score = 20

        # Generate 18 cards total
        all_cards = [generate_card() for _ in range(18)]
        random.shuffle(all_cards)

        # First 3 become objectives (use their condition side)
        self.objectives = []
        for i in range(3):
            self.objectives.append(all_cards[i]["condition"])

        # Remaining 15 are play cards (use their block side)
        self.play_deck = [card["block"] for card in all_cards[3:]]

        # Place first card in center
        first_block = self.play_deck.pop(0)
        self._place_block(first_block, 0, 0)
        self.cards_played = 1

        # Draw next card
        self.current_card = self.play_deck.pop(0) if self.play_deck else None

    def _place_block(self, block, row, col):
        """Place a 2x2 block at the given position, overwriting existing cells."""
        for dr in range(2):
            for dc in range(2):
                r, c = row + dr, col + dc
                self.city_grid[f"{r},{c}"] = block["grid"][dr][dc]
        self.city_roads += block["roads"]
        # Update bounds
        self.city_bounds[0] = min(self.city_bounds[0], row)
        self.city_bounds[1] = min(self.city_bounds[1], col)
        self.city_bounds[2] = max(self.city_bounds[2], row + 1)
        self.city_bounds[3] = max(self.city_bounds[3], col + 1)

    def _get_valid_placements(self):
        """Get all valid positions where a new 2x2 block can be placed."""
        positions = []
        min_r, min_c = self.city_bounds[0], self.city_bounds[1]
        max_r, max_c = self.city_bounds[2], self.city_bounds[3]

        for r in range(min_r - 2, max_r + 2):
            for c in range(min_c - 2, max_c + 2):
                # Must overlap or be adjacent to existing city
                overlaps = False
                adjacent = False
                for dr in range(2):
                    for dc in range(2):
                        key = f"{r + dr},{c + dc}"
                        if key in self.city_grid:
                            overlaps = True
                        # Check adjacency
                        for ar, ac in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
                            adj_key = f"{r + dr + ar},{c + dc + ac}"
                            if adj_key in self.city_grid:
                                adjacent = True

                if overlaps or adjacent:
                    # Cannot completely overlap the exact same 2x2 that already exists
                    # (must extend the city somehow or overlap partially)
                    positions.append((r, c))

        return positions

    def display(self):
        clear_screen()
        print(f"{'=' * 60}")
        print(f"  SPRAWLOPOLIS - Cooperative City Building")
        print(f"  Cards played: {self.cards_played}/{self.total_cards} | "
              f"Target: {self.target_score} pts | Roads: {self.city_roads}")
        print(f"{'=' * 60}")

        # Objectives
        print("\n  Scoring Objectives:")
        for i, obj in enumerate(self.objectives):
            print(f"    {i + 1}. {obj['name']}: {obj['desc']}")

        # City grid
        min_r, min_c = self.city_bounds[0], self.city_bounds[1]
        max_r, max_c = self.city_bounds[2], self.city_bounds[3]

        print(f"\n  City Map (R=Residential, C=Commercial, I=Industrial, P=Park):")
        # Column headers
        header = "     "
        for c in range(min_c, max_c + 1):
            header += f" {c:>2}"
        print(header)

        for r in range(min_r, max_r + 1):
            row_str = f"  {r:>2} "
            for c in range(min_c, max_c + 1):
                key = f"{r},{c}"
                if key in self.city_grid:
                    zone = self.city_grid[key]
                    row_str += f"  {zone}"
                else:
                    row_str += "  ."
            print(row_str)

        # Current card to place
        if self.current_card:
            print(f"\n  Current Card to Place ({self.players[self.current_player - 1]}):")
            print(f"    Roads: {self.current_card['roads']}")
            print(f"    +---+---+")
            for dr in range(2):
                row_str = "    |"
                for dc in range(2):
                    zone = self.current_card["grid"][dr][dc]
                    row_str += f" {ZONE_DISPLAY[zone]} |"
                print(row_str)
                print(f"    +---+---+")

        # Zone group sizes for reference
        groups = self._find_zone_groups()
        print(f"\n  Zone Groups:")
        for zone in ZONES:
            zone_groups = [g for g in groups if g[0] == zone]
            if zone_groups:
                sizes = sorted([g[1] for g in zone_groups], reverse=True)
                print(f"    {ZONE_NAMES[zone]}: {', '.join(str(s) for s in sizes)}")

        print(f"\n{'=' * 60}")

    def _find_zone_groups(self):
        """Find connected groups of same-zone cells. Returns list of (zone, size)."""
        visited = {}
        groups = []

        for key, zone in self.city_grid.items():
            if key in visited:
                continue
            # BFS
            group_size = 0
            queue = [key]
            while queue:
                cell = queue.pop(0)
                if cell in visited:
                    continue
                if self.city_grid.get(cell) != zone:
                    continue
                visited[cell] = True
                group_size += 1
                r, c = [int(x) for x in cell.split(",")]
                for dr, dc in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
                    nkey = f"{r + dr},{c + dc}"
                    if nkey not in visited and nkey in self.city_grid:
                        queue.append(nkey)
            if group_size > 0:
                groups.append((zone, group_size))

        return groups

    def _score_objective(self, obj_id):
        """Score a single objective."""
        min_r, min_c = self.city_bounds[0], self.city_bounds[1]
        max_r, max_c = self.city_bounds[2], self.city_bounds[3]
        groups = self._find_zone_groups()
        pts = 0

        if obj_id == "sprawl_containment":
            for r in range(min_r, max_r + 1):
                zones_in_row = []
                for c in range(min_c, max_c + 1):
                    key = f"{r},{c}"
                    if key in self.city_grid:
                        zones_in_row.append(self.city_grid[key])
                if zones_in_row and len(set(zones_in_row)) == 1:
                    pts += 1

        elif obj_id == "super_park":
            for zone, size in groups:
                if zone == "P" and size >= 3:
                    pts += 2

        elif obj_id == "block_party":
            for key, zone in self.city_grid.items():
                if zone == "R":
                    r, c = [int(x) for x in key.split(",")]
                    for dr, dc in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
                        nkey = f"{r + dr},{c + dc}"
                        if self.city_grid.get(nkey) == "C":
                            pts += 1
                            break

        elif obj_id == "industrial_corridor":
            ind_groups = [g for g in groups if g[0] == "I"]
            if len(ind_groups) <= 1:
                pts += 2

        elif obj_id == "looping_streets":
            pts = -1  # reduces road penalty by making roads count less

        elif obj_id == "skyscrapers":
            for c in range(min_c, max_c + 1):
                com_count = 0
                for r in range(min_r, max_r + 1):
                    if self.city_grid.get(f"{r},{c}") == "C":
                        com_count += 1
                if com_count >= 3:
                    pts += 1

        elif obj_id == "green_belt":
            for key, zone in self.city_grid.items():
                if zone == "P":
                    r, c = [int(x) for x in key.split(",")]
                    if r == min_r or r == max_r or c == min_c or c == max_c:
                        pts += 2

        elif obj_id == "commerce_hub":
            com_groups = [g for g in groups if g[0] == "C"]
            if com_groups and max(g[1] for g in com_groups) >= 5:
                pts += 3

        elif obj_id == "suburbia":
            for key, zone in self.city_grid.items():
                if zone == "R":
                    r, c = [int(x) for x in key.split(",")]
                    adj_industrial = False
                    for dr, dc in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
                        if self.city_grid.get(f"{r + dr},{c + dc}") == "I":
                            adj_industrial = True
                            break
                    if not adj_industrial:
                        pts += 1

        elif obj_id == "mixed_use":
            for r in range(min_r, max_r):
                for c in range(min_c, max_c):
                    types_in_2x2 = set()
                    all_present = True
                    for dr in range(2):
                        for dc in range(2):
                            key = f"{r + dr},{c + dc}"
                            if key in self.city_grid:
                                types_in_2x2.add(self.city_grid[key])
                            else:
                                all_present = False
                    if all_present and len(types_in_2x2) >= 3:
                        pts += 2

        return pts

    def get_move(self):
        if not self.current_card:
            return ("done", "")

        print(f"  {self.players[self.current_player - 1]}, place the card.")
        print(f"  Enter position as 'row col' (e.g., '0 2'):")
        print(f"  The card's top-left corner will be at that position.")
        print(f"  You can overlap existing blocks or place adjacent.")
        pos = input_with_quit("  > ").strip()
        return ("place", pos)

    def make_move(self, move):
        action, data = move

        if action == "done":
            return True

        if action == "place":
            try:
                parts = data.split()
                if len(parts) != 2:
                    return False
                row, col = int(parts[0]), int(parts[1])
            except (ValueError, TypeError):
                return False

            # Validate placement: must be adjacent to or overlapping existing city
            has_connection = False
            for dr in range(2):
                for dc in range(2):
                    key = f"{row + dr},{col + dc}"
                    if key in self.city_grid:
                        has_connection = True
                    for ar, ac in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
                        adj_key = f"{row + dr + ar},{col + dc + ac}"
                        if adj_key in self.city_grid:
                            has_connection = True

            if not has_connection:
                print("  Card must be adjacent to or overlapping the existing city!")
                input("  Press Enter...")
                return False

            self._place_block(self.current_card, row, col)
            self.cards_played += 1

            # Draw next card
            if self.play_deck:
                self.current_card = self.play_deck.pop(0)
            else:
                self.current_card = None

            return True

        return False

    def check_game_over(self):
        if self.current_card is None and not self.play_deck:
            self.game_over = True

            # Calculate final score
            groups = self._find_zone_groups()

            # Largest group per zone type
            largest_groups = {}
            for zone, size in groups:
                if zone not in largest_groups or size > largest_groups[zone]:
                    largest_groups[zone] = size

            total = 0
            print(f"\n{'=' * 60}")
            print("  FINAL SCORING")
            print(f"{'=' * 60}")

            # Score from largest zone groups
            for zone in ZONES:
                if zone in largest_groups:
                    pts = largest_groups[zone]
                    print(f"  Largest {ZONE_NAMES[zone]} group: {pts} pts")
                    total += pts

            # Score from objectives
            for obj in self.objectives:
                pts = self._score_objective(obj["id"])
                print(f"  {obj['name']}: {pts} pts")
                total += pts

            # Subtract roads
            road_penalty = self.city_roads
            print(f"  Road penalty: -{road_penalty} pts")
            total -= road_penalty

            print(f"\n  TOTAL: {total} pts (Target: {self.target_score})")

            if total >= self.target_score:
                print(f"  YOU WIN! City is a success!")
                self.winner = 1  # Co-op win
            else:
                print(f"  City failed to meet the target. Better luck next time!")
                self.winner = None

            input("\n  Press Enter...")

    def get_state(self):
        return {
            "city_grid": self.city_grid,
            "city_roads": self.city_roads,
            "objectives": self.objectives,
            "play_deck": self.play_deck,
            "current_card": self.current_card,
            "cards_played": self.cards_played,
            "total_cards": self.total_cards,
            "target_score": self.target_score,
            "city_bounds": self.city_bounds,
        }

    def load_state(self, state):
        self.city_grid = state["city_grid"]
        self.city_roads = state["city_roads"]
        self.objectives = state["objectives"]
        self.play_deck = state["play_deck"]
        self.current_card = state["current_card"]
        self.cards_played = state["cards_played"]
        self.total_cards = state["total_cards"]
        self.target_score = state["target_score"]
        self.city_bounds = state["city_bounds"]

    def get_tutorial(self):
        return """
====================================
  SPRAWLOPOLIS - Tutorial
====================================

OVERVIEW:
  A cooperative city-building game! Work together to build a city
  that scores enough points to win.

CARDS:
  Each card shows a 2x2 city block with zones:
    R = Residential  C = Commercial  I = Industrial  P = Park
  Cards also have roads that add to the road penalty.

HOW TO PLAY:
  1. Three cards become scoring objectives at game start
  2. Take turns placing the remaining 15 cards
  3. Each card must be placed adjacent to or overlapping the city
  4. Overlapping replaces existing zones - use this strategically!

SCORING:
  + Points from largest connected group of each zone type
  + Points from the 3 objective conditions
  - Road penalty (total roads across all placed cards)

  You WIN if your total score meets the target!

PLACEMENT:
  Enter 'row col' to place the card's top-left corner at that position.
  Example: '0 2' places the card starting at row 0, column 2.

COMMANDS:
  Type 'help' for controls, 'quit' to exit
"""
