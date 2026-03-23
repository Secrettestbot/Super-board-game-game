"""Targi Expansion - Worker placement on a 5x5 grid with sand dunes and new goods.

2-player worker placement game expanding on the original Targi. Adds sand dune
cards that block interior positions and new goods (Water). Players place workers
on the border to claim resources and buy tribe cards.
"""

import random

from engine.base import BaseGame, input_with_quit, clear_screen

RESOURCES = ["Dates", "Salt", "Pepper", "Gold", "Water"]
RES_ABBREV = {"Dates": "D", "Salt": "S", "Pepper": "P", "Gold": "G", "Water": "W"}

BORDER_CARDS = [
    {"name": "Dates Trader", "type": "resource", "gives": {"Dates": 2}},
    {"name": "Salt Caravan", "type": "resource", "gives": {"Salt": 2}},
    {"name": "Pepper Merchant", "type": "resource", "gives": {"Pepper": 2}},
    {"name": "Gold Mine", "type": "resource", "gives": {"Gold": 1}},
    {"name": "Oasis", "type": "resource", "gives": {"Dates": 1, "Water": 1}},
    {"name": "Silversmith", "type": "resource", "gives": {"Gold": 1, "Pepper": 1}},
    {"name": "Noble", "type": "action", "action": "steal", "desc": "Take 1 resource from opponent"},
    {"name": "Targia", "type": "action", "action": "extra_worker", "desc": "Place an extra worker"},
    {"name": "Caravan Leader", "type": "action", "action": "any_resource", "desc": "Take any 2 resources"},
    {"name": "Well", "type": "resource", "gives": {"Water": 2}},
    {"name": "Spice Garden", "type": "resource", "gives": {"Pepper": 2}},
    {"name": "Treasury", "type": "resource", "gives": {"Gold": 1, "Water": 1}},
]

BORDER_POSITIONS = [
    (0, 1), (0, 2), (0, 3),
    (1, 4), (2, 4), (3, 4),
    (4, 3), (4, 2), (4, 1),
    (3, 0), (2, 0), (1, 0),
]

CORNER_POSITIONS = [(0, 0), (0, 4), (4, 4), (4, 0)]

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
    {"name": "Water Bearer", "cost": {"Water": 2}, "points": 3, "ability": None},
    {"name": "Dune Rider", "cost": {"Water": 1, "Dates": 1}, "points": 3, "ability": None},
    {"name": "Sand Witch", "cost": {"Water": 1, "Salt": 1}, "points": 4, "ability": None},
    {"name": "Storm Caller", "cost": {"Water": 1, "Gold": 1}, "points": 5, "ability": None},
    {"name": "Artisan", "cost": {"Gold": 1, "Pepper": 1, "Salt": 1}, "points": 6, "ability": None},
    {"name": "Storyteller", "cost": {"Pepper": 1, "Salt": 1, "Dates": 1}, "points": 4, "ability": None},
]


class TargiExpansionGame(BaseGame):
    """Targi Expansion - Worker placement with sand dunes and new goods."""

    name = "Targi Expansion"
    description = "Expanded Targi with sand dunes and water resource on a 5x5 grid"
    min_players = 2
    max_players = 2
    variations = {
        "standard": "Standard Expansion",
        "sand_dunes": "Sand Dunes Mode",
    }

    def __init__(self, variation=None):
        super().__init__(variation)
        self.target_tribes = 12
        self.sand_dune_mode = self.variation == "sand_dunes"
        self.border_cards = []
        self.interior_cards = []
        self.interior_deck = []
        self.resources = {}
        self.tribe_cards_owned = {}
        self.worker_positions = {}
        self.phase = "place_workers"
        self.workers_placed = 0
        self.robber_pos = 0
        self.sand_dunes = []  # positions blocked by sand dunes
        self.round_number = 1
        self.log = []

    def setup(self):
        self.border_cards = list(BORDER_CARDS)
        self.interior_deck = list(TRIBE_CARDS_POOL)
        random.shuffle(self.interior_deck)
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
            self.resources[sp] = {"Dates": 1, "Salt": 1, "Pepper": 1, "Gold": 0, "Water": 1}
            self.tribe_cards_owned[sp] = []
            self.worker_positions[sp] = []
        self.robber_pos = 0
        self.sand_dunes = []
        if self.sand_dune_mode:
            # Place 2 random sand dunes on interior positions
            positions = [(r, c) for r in range(3) for c in range(3)]
            random.shuffle(positions)
            self.sand_dunes = positions[:2]
        self.phase = "place_workers"
        self.workers_placed = 0
        self.round_number = 1
        self.log = ["Game started! Place your workers on the border."]

    def _get_border_card(self, row, col):
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

    def _is_sand_dune(self, ir, ic):
        return (ir, ic) in self.sand_dunes

    def _get_intersection_cards(self, player):
        sp = str(player)
        positions = self.worker_positions[sp]
        rows = set()
        cols = set()
        for r, c in positions:
            rows.add(r)
            cols.add(c)
        intersections = []
        for r in rows:
            for c in cols:
                if self._is_interior(r, c):
                    ir, ic = r - 1, c - 1
                    if 0 <= ir < 3 and 0 <= ic < 3:
                        if not self._is_sand_dune(ir, ic):
                            card = self.interior_cards[ir][ic]
                            if card is not None:
                                intersections.append((r, c, card))
        return intersections

    def _occupied(self, row, col):
        for sp in ["1", "2"]:
            if (row, col) in self.worker_positions[sp]:
                return True
        robber_r, robber_c = BORDER_POSITIONS[self.robber_pos % len(BORDER_POSITIONS)]
        if row == robber_r and col == robber_c:
            return True
        return False

    def display(self):
        clear_screen()
        print(f"{'=' * 65}")
        print(f"  TARGI EXPANSION - {self.variation.replace('_', ' ').title()} | Round {self.round_number}")
        if self.sand_dune_mode:
            print(f"  Sand Dunes active at: {', '.join(f'({r+1},{c+1})' for r, c in self.sand_dunes)}")
        print(f"{'=' * 65}")
        for p in [1, 2]:
            sp = str(p)
            marker = " <<" if p == self.current_player else ""
            res_str = " ".join(f"{RES_ABBREV[r]}:{self.resources[sp][r]}" for r in RESOURCES)
            tribes = len(self.tribe_cards_owned[sp])
            pts = sum(tc["points"] for tc in self.tribe_cards_owned[sp])
            print(f"  {self.players[p-1]}: {res_str} | Tribes: {tribes}/{self.target_tribes} | Pts: {pts}{marker}")
        print()
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
                    if self._is_sand_dune(ir, ic):
                        cell = " ~DUN~ "
                    else:
                        icard = self.interior_cards[ir][ic]
                        if icard:
                            label = icard["name"][:5]
                            cell = f" {label:>5} "
                        else:
                            cell = "  ---  "
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
        print("  Border Cards:")
        for i, (br, bc) in enumerate(BORDER_POSITIONS):
            card = self.border_cards[i]
            if card["type"] == "resource":
                gives = ", ".join(f"{RES_ABBREV[r]}x{v}" for r, v in card["gives"].items())
                print(f"    ({br},{bc}) {card['name']}: gives {gives}")
            else:
                print(f"    ({br},{bc}) {card['name']}: {card['desc']}")
        print()
        print("  Interior Tribe Cards:")
        for ir in range(3):
            for ic in range(3):
                if self._is_sand_dune(ir, ic):
                    print(f"    ({ir+1},{ic+1}) [SAND DUNE - blocked]")
                else:
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
            print(f"  {self.players[cp-1]}, resolve your worker positions.")
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
                    gives = ", ".join(f"{v} {rn}" for rn, v in card["gives"].items())
                    print(f"    ({r},{c}) {card['name']}: {gives}")
                else:
                    print(f"    ({r},{c}) {card['name']}: {card['desc']}")
            if intersections:
                print("  Your intersection tribe cards (available to buy):")
                for i, (r, c, card) in enumerate(intersections):
                    cost = ", ".join(f"{v} {rn}" for rn, v in card["cost"].items())
                    print(f"    [{i+1}] ({r},{c}) {card['name']}: cost={cost}, pts={card['points']}")
            input_with_quit("  Press Enter to collect resources...")
            return {"action": "resolve"}
        elif self.phase == "buy":
            intersections = self._get_intersection_cards(cp)
            if not intersections:
                return {"action": "end_buy"}
            print(f"  {self.players[cp-1]}, buy tribe cards?")
            can_buy = []
            for i, (r, c, card) in enumerate(intersections):
                cost = ", ".join(f"{v} {rn}" for rn, v in card["cost"].items())
                affordable = all(self.resources[sp].get(res, 0) >= amt for res, amt in card["cost"].items())
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
            all_placed = all(len(self.worker_positions[s]) >= 3 for s in ["1", "2"])
            if all_placed:
                self.phase = "resolve"
                self.current_player = 1
                return True
            return True

        if action == "resolve":
            for r, c in self.worker_positions[sp]:
                if self._is_border(r, c):
                    card, idx = self._get_border_card(r, c)
                    if card and card["type"] == "resource":
                        for res, amt in card["gives"].items():
                            self.resources[sp][res] = self.resources[sp].get(res, 0) + amt
                    elif card and card["type"] == "action":
                        if card["action"] == "any_resource":
                            self.resources[sp]["Dates"] += 1
                            self.resources[sp]["Water"] += 1
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
            if self._is_sand_dune(ir, ic):
                return False
            card = self.interior_cards[ir][ic]
            if card is None:
                return False
            for res, amt in card["cost"].items():
                if self.resources[sp].get(res, 0) < amt:
                    return False
            for res, amt in card["cost"].items():
                self.resources[sp][res] -= amt
            self.tribe_cards_owned[sp].append(card)
            self.interior_cards[ir][ic] = None
            if self.interior_deck:
                self.interior_cards[ir][ic] = self.interior_deck.pop()
            self.log.append(f"{self.players[cp-1]} bought {card['name']} for {card['points']} pts")
            return True

        if action == "end_buy":
            if cp == 1:
                self.phase = "resolve"
                self.current_player = 2
            else:
                self.worker_positions = {"1": [], "2": []}
                self.robber_pos = (self.robber_pos + 1) % len(BORDER_POSITIONS)
                if self.sand_dune_mode and self.round_number % 3 == 0:
                    # Shift sand dunes
                    new_dunes = []
                    for dr, dc in self.sand_dunes:
                        nr, nc = (dr + 1) % 3, (dc + 1) % 3
                        new_dunes.append((nr, nc))
                    self.sand_dunes = new_dunes
                self.phase = "place_workers"
                self.current_player = 1
                self.round_number += 1
            self.log.append(f"{self.players[cp-1]} finished buying.")
            return True

        return False

    def check_game_over(self):
        for p in [1, 2]:
            sp = str(p)
            if len(self.tribe_cards_owned[sp]) >= self.target_tribes:
                self.game_over = True
                s1 = sum(tc["points"] for tc in self.tribe_cards_owned["1"])
                s2 = sum(tc["points"] for tc in self.tribe_cards_owned["2"])
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
            "worker_positions": {k: [list(pos) for pos in v] for k, v in self.worker_positions.items()},
            "phase": self.phase,
            "robber_pos": self.robber_pos,
            "sand_dunes": self.sand_dunes,
            "round_number": self.round_number,
            "log": self.log,
        }

    def load_state(self, state):
        self.border_cards = state["border_cards"]
        self.interior_cards = state["interior_cards"]
        self.interior_deck = state["interior_deck"]
        self.resources = state["resources"]
        self.tribe_cards_owned = state["tribe_cards_owned"]
        self.worker_positions = {
            k: [(pos[0], pos[1]) for pos in v] for k, v in state["worker_positions"].items()
        }
        self.phase = state["phase"]
        self.robber_pos = state["robber_pos"]
        self.sand_dunes = [tuple(d) for d in state.get("sand_dunes", [])]
        self.round_number = state.get("round_number", 1)
        self.log = state.get("log", [])

    def get_tutorial(self):
        return """
============================================================
  TARGI EXPANSION - Tutorial
============================================================

  OVERVIEW:
  The Targi Expansion adds Water as a 5th resource and Sand
  Dune cards that can block interior positions.

  NEW FEATURES:
  - Water resource (W): collected from Oasis, Well, Treasury
  - Sand Dunes: block interior tribe card positions
  - New tribe cards that require Water
  - In Sand Dunes mode, dunes shift every 3 rounds

  GAMEPLAY:
  Same as base Targi - place 3 workers on border positions,
  collect resources, and buy tribe cards at intersections.
  First to 12 tribe cards triggers end. Highest points wins.

  COMMANDS:
  - Enter row,col to place workers (e.g. 0,2)
  - Enter card number to buy, or 'done' to skip
============================================================
"""
