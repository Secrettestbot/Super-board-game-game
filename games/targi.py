"""Targi - Worker placement on a 5x5 grid border.

Players place 3 workers on border cards (not corners). Interior intersections
of worker rows/columns are also claimed. Collect resources and buy tribe cards
for points.
"""

import random

from engine.base import BaseGame, input_with_quit, clear_screen

# Resources
RESOURCES = ["Dates", "Salt", "Pepper", "Gold"]
RES_ABBREV = {"Dates": "D", "Salt": "S", "Pepper": "P", "Gold": "G"}

# Border card types (16 border positions, 4 corners excluded = 12 usable)
BORDER_CARDS = [
    # Top row (positions 1-3, skipping corners 0 and 4)
    {"name": "Dates Trader", "type": "resource", "gives": {"Dates": 2}},
    {"name": "Salt Caravan", "type": "resource", "gives": {"Salt": 2}},
    {"name": "Pepper Merchant", "type": "resource", "gives": {"Pepper": 2}},
    # Right column (positions 5-7, skipping corners)
    {"name": "Gold Mine", "type": "resource", "gives": {"Gold": 1}},
    {"name": "Oasis", "type": "resource", "gives": {"Dates": 1, "Salt": 1}},
    {"name": "Silversmith", "type": "resource", "gives": {"Gold": 1, "Pepper": 1}},
    # Bottom row (positions 9-11, skipping corners)
    {"name": "Noble", "type": "action", "action": "steal", "desc": "Take 1 resource from opponent"},
    {"name": "Targia", "type": "action", "action": "extra_worker", "desc": "Place an extra worker"},
    {"name": "Caravan Leader", "type": "action", "action": "any_resource", "desc": "Take any 2 resources"},
    # Left column (positions 13-15, skipping corners)
    {"name": "Market", "type": "resource", "gives": {"Salt": 1, "Dates": 1}},
    {"name": "Spice Garden", "type": "resource", "gives": {"Pepper": 2}},
    {"name": "Treasury", "type": "resource", "gives": {"Gold": 1}},
]

# Tribe cards (interior, randomly dealt)
TRIBE_CARDS_POOL = [
    {"name": "Merchant", "cost": {"Dates": 1, "Salt": 1}, "points": 2, "ability": None},
    {"name": "Nomad", "cost": {"Pepper": 2}, "points": 3, "ability": None},
    {"name": "Elder", "cost": {"Gold": 1}, "points": 3, "ability": None},
    {"name": "Scout", "cost": {"Dates": 2}, "points": 2, "ability": "extra_date"},
    {"name": "Trader", "cost": {"Salt": 2}, "points": 2, "ability": "extra_salt"},
    {"name": "Warrior", "cost": {"Pepper": 1, "Gold": 1}, "points": 4, "ability": None},
    {"name": "Mystic", "cost": {"Dates": 1, "Pepper": 1}, "points": 3, "ability": None},
    {"name": "Chieftain", "cost": {"Gold": 2}, "points": 5, "ability": None},
    {"name": "Craftsman", "cost": {"Salt": 1, "Pepper": 1}, "points": 3, "ability": None},
    {"name": "Herbalist", "cost": {"Dates": 1, "Gold": 1}, "points": 4, "ability": None},
    {"name": "Guide", "cost": {"Salt": 1, "Gold": 1}, "points": 4, "ability": None},
    {"name": "Camel Driver", "cost": {"Dates": 3}, "points": 3, "ability": None},
    {"name": "Storyteller", "cost": {"Pepper": 1, "Salt": 1, "Dates": 1}, "points": 4, "ability": None},
    {"name": "Artisan", "cost": {"Gold": 1, "Pepper": 1, "Salt": 1}, "points": 6, "ability": None},
    {"name": "Water Bearer", "cost": {"Dates": 2, "Salt": 1}, "points": 3, "ability": None},
    {"name": "Weaver", "cost": {"Pepper": 1, "Dates": 1}, "points": 2, "ability": None},
]

# The border has 16 positions (4x4 border of a 5x5 grid)
# Corners are 0, 4, 8, 12 (or using row,col: (0,0),(0,4),(4,0),(4,4))
# We map border positions to row,col on a 5x5 grid border
BORDER_POSITIONS = [
    # Top row left to right
    (0, 1), (0, 2), (0, 3),
    # Right column top to bottom
    (1, 4), (2, 4), (3, 4),
    # Bottom row right to left
    (4, 3), (4, 2), (4, 1),
    # Left column bottom to top
    (3, 0), (2, 0), (1, 0),
]

CORNER_POSITIONS = [(0, 0), (0, 4), (4, 4), (4, 0)]


class TargiGame(BaseGame):
    """Targi - Worker placement game on a 5x5 border grid."""

    name = "Targi"
    description = "Worker placement on a 5x5 grid border with resource collection"
    min_players = 2
    max_players = 2
    variations = {
        "standard": "Standard game (12 tribe cards to win)",
        "quick": "Quick game (8 tribe cards to win)",
    }

    def __init__(self, variation=None):
        super().__init__(variation)
        if self.variation == "quick":
            self.target_tribes = 8
        else:
            self.target_tribes = 12
        # Board state
        self.border_cards = []  # 12 border card slots
        self.interior_cards = []  # 3x3 = 9 interior slots, list of lists
        self.interior_deck = []
        # Player state
        self.resources = {}
        self.tribe_cards_owned = {}
        self.worker_positions = {}  # player -> list of (row,col) placements
        self.phase = "place_workers"  # place_workers, resolve, buy
        self.workers_placed = 0
        self.robber_pos = 0  # Robber moves around border each round
        self.log = []

    def setup(self):
        self.border_cards = list(BORDER_CARDS)
        # Shuffle tribe cards for interior
        self.interior_deck = list(TRIBE_CARDS_POOL)
        random.shuffle(self.interior_deck)
        # Fill 3x3 interior
        self.interior_cards = []
        for r in range(3):
            row = []
            for c in range(3):
                if self.interior_deck:
                    row.append(self.interior_deck.pop())
                else:
                    row.append(None)
            self.interior_cards.append(row)

        for p in [1, 2]:
            sp = str(p)
            self.resources[sp] = {"Dates": 1, "Salt": 1, "Pepper": 1, "Gold": 0}
            self.tribe_cards_owned[sp] = []
            self.worker_positions[sp] = []

        self.robber_pos = 0
        self.phase = "place_workers"
        self.workers_placed = 0
        self.log = ["Game started! Place your workers on the border."]

    def _get_border_card(self, row, col):
        """Get the border card at a given border position."""
        for i, (br, bc) in enumerate(BORDER_POSITIONS):
            if br == row and bc == col:
                return self.border_cards[i], i
        return None, -1

    def _is_border(self, row, col):
        return (row, col) in BORDER_POSITIONS

    def _is_corner(self, row, col):
        return (row, col) in CORNER_POSITIONS

    def _is_interior(self, row, col):
        return 1 <= row <= 3 and 1 <= col <= 3

    def _get_intersection_cards(self, player):
        """Find interior cards at intersections of player's worker rows and columns."""
        sp = str(player)
        positions = self.worker_positions[sp]
        rows = set()
        cols = set()
        for r, c in positions:
            rows.add(r)
            cols.add(c)
        # Also add the opposing axis for border workers
        intersections = []
        for r in rows:
            for c in cols:
                if self._is_interior(r, c):
                    ir, ic = r - 1, c - 1
                    if 0 <= ir < 3 and 0 <= ic < 3:
                        card = self.interior_cards[ir][ic]
                        if card is not None:
                            intersections.append((r, c, card))
        return intersections

    def _occupied(self, row, col):
        """Check if a position is occupied by any worker."""
        for sp in ["1", "2"]:
            if (row, col) in self.worker_positions[sp]:
                return True
        # Check robber
        robber_r, robber_c = BORDER_POSITIONS[self.robber_pos % len(BORDER_POSITIONS)]
        if row == robber_r and col == robber_c:
            return True
        return False

    def display(self):
        clear_screen()
        print(f"{'=' * 60}")
        print(f"  TARGI - {self.variation.title()} | Round {self.turn_number // 2 + 1}")
        print(f"{'=' * 60}")
        for p in [1, 2]:
            sp = str(p)
            marker = " <<" if p == self.current_player else ""
            res_str = " ".join(f"{RES_ABBREV[r]}:{self.resources[sp][r]}" for r in RESOURCES)
            tribes = len(self.tribe_cards_owned[sp])
            pts = sum(tc["points"] for tc in self.tribe_cards_owned[sp])
            print(f"  {self.players[p-1]}: {res_str} | Tribes: {tribes}/{self.target_tribes} | "
                  f"Pts: {pts}{marker}")
        print()
        # Display 5x5 grid
        print("  Board (5x5):")
        print("       0       1       2       3       4")
        for r in range(5):
            row_str = f"  {r} "
            for c in range(5):
                cell = "       "
                if self._is_corner(r, c):
                    cell = "  [X]  "
                elif self._is_border(r, c):
                    card, idx = self._get_border_card(r, c)
                    if card:
                        label = card["name"][:5]
                        cell = f" {label:>5} "
                elif self._is_interior(r, c):
                    ir, ic = r - 1, c - 1
                    icard = self.interior_cards[ir][ic]
                    if icard:
                        label = icard["name"][:5]
                        cell = f" {label:>5} "
                    else:
                        cell = "  ---  "
                # Mark workers
                w1 = (r, c) in self.worker_positions.get("1", [])
                w2 = (r, c) in self.worker_positions.get("2", [])
                robber_r, robber_c = BORDER_POSITIONS[self.robber_pos % len(BORDER_POSITIONS)]
                is_robber = (r == robber_r and c == robber_c)
                if w1:
                    cell = f"*1{cell[2:]}"
                if w2:
                    cell = f"{cell[:5]}2*"
                if is_robber:
                    cell = " [ROB] "
                row_str += cell
            print(row_str)
        print()
        # Border card reference
        print("  Border Cards:")
        for i, (br, bc) in enumerate(BORDER_POSITIONS):
            card = self.border_cards[i]
            if card["type"] == "resource":
                gives = ", ".join(f"{RES_ABBREV[r]}x{v}" for r, v in card["gives"].items())
                print(f"    ({br},{bc}) {card['name']}: gives {gives}")
            else:
                print(f"    ({br},{bc}) {card['name']}: {card['desc']}")
        print()
        # Interior cards
        print("  Interior Tribe Cards:")
        for ir in range(3):
            for ic in range(3):
                card = self.interior_cards[ir][ic]
                if card:
                    cost = ", ".join(f"{RES_ABBREV[r]}x{v}" for r, v in card["cost"].items())
                    print(f"    ({ir+1},{ic+1}) {card['name']}: cost={cost}, pts={card['points']}")
        print()
        print(f"  Phase: {self.phase} | Workers placed: {self.workers_placed}/3")
        if self.log:
            print(f"  Last: {self.log[-1]}")
        print()

    def get_move(self):
        cp = self.current_player
        sp = str(cp)

        if self.phase == "place_workers":
            print(f"  {self.players[cp-1]}, place a worker on a border position.")
            print(f"  Workers placed: {len(self.worker_positions[sp])}/3")
            pos_input = input_with_quit("  Position (row,col): ").strip()
            try:
                parts = pos_input.split(",")
                row, col = int(parts[0]), int(parts[1])
            except (ValueError, IndexError):
                return None
            return {"action": "place_worker", "row": row, "col": col}

        elif self.phase == "resolve":
            # Show what the player gets and let them collect
            print(f"  {self.players[cp-1]}, resolve your worker positions.")
            # Show border cards claimed
            border_claimed = []
            for r, c in self.worker_positions[sp]:
                if self._is_border(r, c):
                    card, idx = self._get_border_card(r, c)
                    if card:
                        border_claimed.append((r, c, card))
            intersections = self._get_intersection_cards(cp)

            print("  Your border cards:")
            for r, c, card in border_claimed:
                if card["type"] == "resource":
                    gives = ", ".join(f"{v} {r_name}" for r_name, v in card["gives"].items())
                    print(f"    ({r},{c}) {card['name']}: {gives}")
                else:
                    print(f"    ({r},{c}) {card['name']}: {card['desc']}")

            if intersections:
                print("  Your intersection tribe cards (available to buy):")
                for i, (r, c, card) in enumerate(intersections):
                    cost = ", ".join(f"{v} {r_name}" for r_name, v in card["cost"].items())
                    print(f"    [{i+1}] ({r},{c}) {card['name']}: cost={cost}, pts={card['points']}")

            input_with_quit("  Press Enter to collect resources...")
            return {"action": "resolve"}

        elif self.phase == "buy":
            intersections = self._get_intersection_cards(cp)
            if not intersections:
                return {"action": "end_buy"}
            print(f"  {self.players[cp-1]}, buy tribe cards?")
            print("  Available tribe cards at intersections:")
            can_buy = []
            for i, (r, c, card) in enumerate(intersections):
                cost = ", ".join(f"{v} {r_name}" for r_name, v in card["cost"].items())
                affordable = all(self.resources[sp].get(res, 0) >= amt
                                 for res, amt in card["cost"].items())
                status = "" if affordable else " (can't afford)"
                print(f"    [{i+1}] {card['name']}: cost={cost}, pts={card['points']}{status}")
                if affordable:
                    can_buy.append(i)
            if not can_buy:
                print("  Can't afford any tribe cards.")
                input_with_quit("  Press Enter to continue...")
                return {"action": "end_buy"}
            choice = input_with_quit("  Buy which card? (number or 'done'): ").strip()
            if choice.lower() == 'done':
                return {"action": "end_buy"}
            try:
                idx = int(choice) - 1
                if 0 <= idx < len(intersections):
                    r, c, card = intersections[idx]
                    return {"action": "buy", "row": r, "col": c}
            except ValueError:
                pass
            return None
        return None

    def make_move(self, move):
        if move is None:
            return False
        cp = self.current_player
        sp = str(cp)
        action = move.get("action")

        if action == "place_worker":
            row, col = move["row"], move["col"]
            if not self._is_border(row, col):
                return False
            if self._is_corner(row, col):
                return False
            if self._occupied(row, col):
                return False
            if len(self.worker_positions[sp]) >= 3:
                return False
            self.worker_positions[sp].append((row, col))
            self.log.append(f"{self.players[cp-1]} placed worker at ({row},{col})")

            # Check if both players have placed all 3 workers
            all_placed = all(len(self.worker_positions[s]) >= 3 for s in ["1", "2"])
            if all_placed:
                self.phase = "resolve"
                self.current_player = 1  # P1 resolves first
                return True

            # Alternate placement: after each worker, switch player
            if len(self.worker_positions[sp]) < 3:
                # Don't switch yet if current player needs more workers
                # But alternate: each player places 1 at a time
                pass
            return True

        if action == "resolve":
            # Collect resources from border cards
            for r, c in self.worker_positions[sp]:
                if self._is_border(r, c):
                    card, idx = self._get_border_card(r, c)
                    if card and card["type"] == "resource":
                        for res, amt in card["gives"].items():
                            self.resources[sp][res] = self.resources[sp].get(res, 0) + amt
                    elif card and card["type"] == "action":
                        if card["action"] == "any_resource":
                            self.resources[sp]["Dates"] += 1
                            self.resources[sp]["Salt"] += 1
                        elif card["action"] == "steal":
                            opp = "2" if sp == "1" else "1"
                            for res in RESOURCES:
                                if self.resources[opp][res] > 0:
                                    self.resources[opp][res] -= 1
                                    self.resources[sp][res] += 1
                                    break
            self.log.append(f"{self.players[cp-1]} collected resources.")
            self.phase = "buy"
            return True

        if action == "buy":
            row, col = move["row"], move["col"]
            if not self._is_interior(row, col):
                return False
            ir, ic = row - 1, col - 1
            card = self.interior_cards[ir][ic]
            if card is None:
                return False
            # Check cost
            for res, amt in card["cost"].items():
                if self.resources[sp].get(res, 0) < amt:
                    return False
            # Pay cost
            for res, amt in card["cost"].items():
                self.resources[sp][res] -= amt
            # Add tribe card
            self.tribe_cards_owned[sp].append(card)
            self.interior_cards[ir][ic] = None
            # Refill from deck
            if self.interior_deck:
                self.interior_cards[ir][ic] = self.interior_deck.pop()
            self.log.append(f"{self.players[cp-1]} bought {card['name']} for {card['points']} pts")
            return True

        if action == "end_buy":
            # Check if both players have resolved
            if cp == 1:
                self.phase = "resolve"
                self.current_player = 2
            else:
                # Both done - new round
                self.worker_positions = {"1": [], "2": []}
                self.robber_pos = (self.robber_pos + 1) % len(BORDER_POSITIONS)
                self.phase = "place_workers"
                self.current_player = 1
            self.log.append(f"{self.players[cp-1]} finished buying.")
            return True

        return False

    def check_game_over(self):
        for p in [1, 2]:
            sp = str(p)
            if len(self.tribe_cards_owned[sp]) >= self.target_tribes:
                self.game_over = True
                # Score comparison
                s1 = sum(tc["points"] for tc in self.tribe_cards_owned["1"])
                s2 = sum(tc["points"] for tc in self.tribe_cards_owned["2"])
                # Bonus for remaining resources: 1 pt per 3 resources
                for p2 in [1, 2]:
                    sp2 = str(p2)
                    total_res = sum(self.resources[sp2].values())
                    bonus = total_res // 3
                    if p2 == 1:
                        s1 += bonus
                    else:
                        s2 += bonus
                if s1 > s2:
                    self.winner = 1
                elif s2 > s1:
                    self.winner = 2
                else:
                    self.winner = None
                return

    def get_state(self):
        return {
            "border_cards": self.border_cards,
            "interior_cards": self.interior_cards,
            "interior_deck": self.interior_deck,
            "resources": {k: dict(v) for k, v in self.resources.items()},
            "tribe_cards_owned": {k: list(v) for k, v in self.tribe_cards_owned.items()},
            "worker_positions": {k: [list(pos) for pos in v]
                                 for k, v in self.worker_positions.items()},
            "phase": self.phase,
            "robber_pos": self.robber_pos,
            "workers_placed": self.workers_placed,
            "log": self.log,
        }

    def load_state(self, state):
        self.border_cards = state["border_cards"]
        self.interior_cards = state["interior_cards"]
        self.interior_deck = state["interior_deck"]
        self.resources = state["resources"]
        self.tribe_cards_owned = state["tribe_cards_owned"]
        # Convert position lists back to tuples
        self.worker_positions = {
            k: [(pos[0], pos[1]) for pos in v]
            for k, v in state["worker_positions"].items()
        }
        self.phase = state["phase"]
        self.robber_pos = state["robber_pos"]
        self.workers_placed = state.get("workers_placed", 0)
        self.log = state.get("log", [])

    def get_tutorial(self):
        return """
============================================================
  TARGI - Tutorial
============================================================

  OVERVIEW:
  Targi is a 2-player worker placement game set in the Sahara.
  Place workers on the border of a 5x5 grid to claim resources
  and buy tribe cards for points.

  GAME BOARD:
  - 5x5 grid with 4 corners (unusable, marked [X])
  - 12 border positions with fixed action/resource cards
  - 9 interior positions with tribe cards (purchasable)
  - A robber token blocks one border position each round

  WORKER PLACEMENT:
  - Each player places 3 workers on unoccupied border spots
  - Workers cannot go on corners or the robber's position
  - Both players' workers cannot share the same position
  - After placing, intersection points are automatically claimed

  INTERSECTIONS:
  - Where your workers' rows and columns cross in the interior,
    you get access to those tribe cards for purchase

  RESOURCES:
  - D = Dates, S = Salt, P = Pepper, G = Gold
  - Collected from border cards when resolving workers
  - Spent to buy tribe cards from the interior

  TRIBE CARDS:
  - Each has a resource cost and point value
  - Collect them to reach the target number to end the game

  WINNING:
  - Game ends when a player reaches the tribe card target
  - Highest total tribe card points wins
  - Tiebreaker: remaining resources (3 resources = 1 point)
============================================================
"""
