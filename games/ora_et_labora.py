"""Ora et Labora - Resource conversion and building placement monastery game.

Build settlements along the coast, convert resources through production chains
(grain->flour->bread, clay->bricks). Rondel-based resource production.
"""

import random
from engine.base import BaseGame, input_with_quit, clear_screen

# Resources and their production chain order
RESOURCES = ["wood", "peat", "grain", "clay", "coin", "livestock",
             "flour", "grape", "stone", "bread", "ceramic", "brick",
             "whiskey", "wine", "ornament", "book"]

# Rondel positions: each accumulates resources over time
RONDEL_SLOTS = [
    {"resource": "wood", "rate": 1},
    {"resource": "peat", "rate": 1},
    {"resource": "grain", "rate": 1},
    {"resource": "clay", "rate": 1},
    {"resource": "coin", "rate": 1},
    {"resource": "livestock", "rate": 1},
    {"resource": "grape", "rate": 1},
    {"resource": "stone", "rate": 1},
]

# Buildings with costs, VP, and conversion abilities
BUILDINGS = [
    # Basic buildings
    {"name": "Farmyard", "cost": {"wood": 1}, "vp": 2,
     "converts": None, "produces": {"grain": 1, "livestock": 1},
     "tier": 1, "type": "farm"},
    {"name": "Clay Mound", "cost": {"wood": 1}, "vp": 1,
     "converts": None, "produces": {"clay": 2},
     "tier": 1, "type": "resource"},
    {"name": "Cloister Office", "cost": {"wood": 2}, "vp": 2,
     "converts": None, "produces": {"coin": 2},
     "tier": 1, "type": "commerce"},
    {"name": "Malt House", "cost": {"wood": 1, "clay": 1}, "vp": 3,
     "converts": {"grain": 1}, "produces": {"flour": 1},
     "tier": 1, "type": "production"},
    {"name": "Bakery", "cost": {"wood": 1, "stone": 1}, "vp": 4,
     "converts": {"flour": 1}, "produces": {"bread": 2},
     "tier": 2, "type": "production"},
    {"name": "Brewery", "cost": {"wood": 1, "brick": 1}, "vp": 5,
     "converts": {"grain": 2}, "produces": {"whiskey": 1},
     "tier": 2, "type": "production"},
    {"name": "Winery", "cost": {"stone": 1, "brick": 1}, "vp": 5,
     "converts": {"grape": 2}, "produces": {"wine": 1},
     "tier": 2, "type": "production"},
    {"name": "Quarry", "cost": {"wood": 2}, "vp": 3,
     "converts": None, "produces": {"stone": 2},
     "tier": 1, "type": "resource"},
    {"name": "Brickworks", "cost": {"clay": 2, "peat": 1}, "vp": 4,
     "converts": {"clay": 2}, "produces": {"brick": 2},
     "tier": 2, "type": "production"},
    {"name": "Kiln", "cost": {"stone": 1, "clay": 1}, "vp": 4,
     "converts": {"clay": 1}, "produces": {"ceramic": 1},
     "tier": 2, "type": "production"},
    {"name": "Scriptorium", "cost": {"stone": 2, "brick": 1}, "vp": 7,
     "converts": {"peat": 1, "coin": 1}, "produces": {"book": 1},
     "tier": 3, "type": "production"},
    {"name": "Goldsmith", "cost": {"stone": 1, "brick": 1, "coin": 2}, "vp": 8,
     "converts": {"coin": 3}, "produces": {"ornament": 1},
     "tier": 3, "type": "production"},
    # Settlements
    {"name": "Village", "cost": {"wood": 2, "brick": 1}, "vp": 5,
     "converts": None, "produces": None,
     "tier": 2, "type": "settlement"},
    {"name": "Hilltop Village", "cost": {"wood": 1, "stone": 2, "brick": 1}, "vp": 7,
     "converts": None, "produces": None,
     "tier": 2, "type": "settlement"},
    {"name": "Fishing Village", "cost": {"wood": 3, "stone": 1}, "vp": 6,
     "converts": None, "produces": {"coin": 1},
     "tier": 2, "type": "settlement"},
    {"name": "Market Town", "cost": {"brick": 2, "stone": 1, "coin": 2}, "vp": 10,
     "converts": None, "produces": None,
     "tier": 3, "type": "settlement"},
    {"name": "Monastery", "cost": {"stone": 3, "brick": 2}, "vp": 12,
     "converts": None, "produces": {"book": 1},
     "tier": 3, "type": "settlement"},
    # Bonus buildings
    {"name": "Peat Bog", "cost": {}, "vp": 1,
     "converts": None, "produces": {"peat": 2},
     "tier": 1, "type": "resource"},
    {"name": "Forest", "cost": {}, "vp": 1,
     "converts": None, "produces": {"wood": 2},
     "tier": 1, "type": "resource"},
    {"name": "Vineyard", "cost": {"wood": 1, "coin": 1}, "vp": 3,
     "converts": None, "produces": {"grape": 2},
     "tier": 1, "type": "farm"},
]

ACTIONS = [
    "collect_resource", "build_building", "use_building",
    "convert_resources", "buy_settlement", "pass_turn"
]
ACTION_LABELS = {
    "collect_resource": "Collect from Rondel (take accumulated resource)",
    "build_building": "Build a Building (pay costs, place on board)",
    "use_building": "Use a Building (activate production/conversion)",
    "convert_resources": "Convert Resources (basic trades)",
    "buy_settlement": "Found a Settlement",
    "pass_turn": "Pass (end your turn, advance rondel)",
}


def _init_player():
    resources = {r: 0 for r in RESOURCES}
    resources["wood"] = 2
    resources["peat"] = 1
    resources["grain"] = 1
    resources["clay"] = 1
    resources["coin"] = 1
    return {
        "vp": 0,
        "resources": resources,
        "buildings": [],
        "workers": 2,
        "workers_placed": 0,
        "landscape": [],  # list of building indices placed
    }


class OraEtLaboraGame(BaseGame):
    name = "Ora et Labora"
    description = "Monastery resource conversion and building placement with rondel production."
    min_players = 1
    max_players = 2
    variations = {
        "standard": "Full game - 12 rounds with all buildings and settlements",
        "quick": "Quick game - 7 rounds, simpler buildings, extra starting resources",
    }

    def setup(self):
        is_quick = self.variation == "quick"
        self.max_rounds = 7 if is_quick else 12
        self.current_round = 1

        # Setup rondel - each slot accumulates over time
        self.rondel = [0] * len(RONDEL_SLOTS)  # accumulated amounts
        self.rondel_pointer = 0  # which slot gets +1 each round

        # Building availability
        max_tier = 2 if is_quick else 3
        self.building_pool = [i for i, b in enumerate(BUILDINGS) if b["tier"] <= max_tier]
        random.shuffle(self.building_pool)

        self.used_actions = []
        self.player_data = {}
        for i in range(1, len(self.players) + 1):
            p = _init_player()
            if is_quick:
                p["resources"]["wood"] = 3
                p["resources"]["clay"] = 2
                p["resources"]["coin"] = 2
                p["resources"]["grain"] = 2
                p["workers"] = 3
            # Give starting buildings
            for bi, b in enumerate(BUILDINGS):
                if b["name"] in ("Peat Bog", "Forest"):
                    p["buildings"].append(bi)
            self.player_data[str(i)] = p

        self.actions_this_turn = 0
        self.max_actions = 2  # actions per player per round
        self.message = "Round 1: Pray and work! (Ora et Labora)"
        self._advance_rondel()

    def _advance_rondel(self):
        """Advance rondel: add resources to slots."""
        for i in range(len(RONDEL_SLOTS)):
            self.rondel[i] += RONDEL_SLOTS[i]["rate"]
        self.rondel_pointer = (self.rondel_pointer + 1) % len(RONDEL_SLOTS)

    def display(self):
        clear_screen()
        print(f"{'=' * 65}")
        print(f"  ORA ET LABORA - Round {self.current_round}/{self.max_rounds}")
        print(f"{'=' * 65}")

        for i in range(1, len(self.players) + 1):
            pd = self.player_data[str(i)]
            marker = " <<" if i == self.current_player else ""
            avail_w = pd["workers"] - pd["workers_placed"]
            print(f"  {self.players[i-1]}: {pd['vp']} VP | Workers: {avail_w}/{pd['workers']}{marker}")
            # Show resources in groups
            basic = {r: pd["resources"][r] for r in
                     ["wood", "peat", "grain", "clay", "coin", "livestock", "grape", "stone"]
                     if pd["resources"][r] > 0}
            refined = {r: pd["resources"][r] for r in
                       ["flour", "bread", "ceramic", "brick", "whiskey", "wine", "ornament", "book"]
                       if pd["resources"][r] > 0}
            if basic:
                b_str = " ".join(f"{k}:{v}" for k, v in basic.items())
                print(f"    Basic: {b_str}")
            if refined:
                r_str = " ".join(f"{k}:{v}" for k, v in refined.items())
                print(f"    Refined: {r_str}")
            if pd["buildings"]:
                bnames = ", ".join(BUILDINGS[b]["name"] for b in pd["buildings"])
                print(f"    Buildings: {bnames}")

        print(f"{'-' * 65}")
        # Rondel display
        print("  Resource Rondel (accumulated):")
        rondel_parts = []
        for i, slot in enumerate(RONDEL_SLOTS):
            ptr = ">" if i == self.rondel_pointer else " "
            rondel_parts.append(f"  {ptr}{slot['resource']:>9}: {self.rondel[i]}")
        # Print in 2 columns
        mid = len(rondel_parts) // 2
        for j in range(mid):
            left = rondel_parts[j]
            right = rondel_parts[j + mid] if j + mid < len(rondel_parts) else ""
            print(f"  {left:30s} {right}")

        print(f"{'-' * 65}")
        p = self.player_data[str(self.current_player)]
        acts_left = self.max_actions - self.actions_this_turn
        print(f"  Actions remaining this round: {acts_left}")
        print("  Available actions:")
        for idx, act in enumerate(ACTIONS):
            print(f"    {idx + 1}. {ACTION_LABELS[act]}")

        if self.message:
            print(f"\n  {self.message}")
        print()

    def get_move(self):
        move = input_with_quit(
            f"  {self.players[self.current_player - 1]}, choose action (1-{len(ACTIONS)}): ")
        return move.strip()

    def make_move(self, move):
        p = self.player_data[str(self.current_player)]
        self.message = ""
        try:
            choice = int(move)
            if choice < 1 or choice > len(ACTIONS):
                self.message = "Invalid choice."
                return False
        except ValueError:
            self.message = "Enter a number."
            return False

        action = ACTIONS[choice - 1]

        if action == "pass_turn":
            self.actions_this_turn = self.max_actions
            self._check_round_end()
            return True

        if self.actions_this_turn >= self.max_actions:
            self.message = "No actions left! You must pass."
            return False

        success = self._execute_action(action, p)
        if success:
            self.actions_this_turn += 1
            if self.actions_this_turn >= self.max_actions:
                self._check_round_end()
        return success

    def _execute_action(self, action, p):
        if action == "collect_resource":
            print("  Rondel resources:")
            available = [(i, RONDEL_SLOTS[i], self.rondel[i])
                         for i in range(len(RONDEL_SLOTS)) if self.rondel[i] > 0]
            if not available:
                self.message = "No resources accumulated on rondel!"
                return False
            for idx, (i, slot, amt) in enumerate(available):
                print(f"    {idx + 1}. {slot['resource']}: {amt}")
            ri = input_with_quit("  Choose resource to collect: ").strip()
            try:
                ri = int(ri) - 1
                if ri < 0 or ri >= len(available):
                    self.message = "Invalid choice."
                    return False
            except ValueError:
                return False
            slot_idx, slot, amt = available[ri]
            p["resources"][slot["resource"]] += amt
            self.rondel[slot_idx] = 0
            self.message = f"Collected {amt} {slot['resource']} from rondel."
            return True

        elif action == "build_building":
            affordable = []
            for bi in self.building_pool:
                b = BUILDINGS[bi]
                if bi in p["buildings"]:
                    continue
                can_afford = all(
                    p["resources"].get(r, 0) >= amt
                    for r, amt in b["cost"].items()
                )
                affordable.append((bi, b, can_afford))
            if not affordable:
                self.message = "No buildings available to build!"
                return False
            print("  Available buildings:")
            for idx, (bi, b, can) in enumerate(affordable):
                cost_str = ", ".join(f"{v} {k}" for k, v in b["cost"].items()) or "free"
                mark = "" if can else " [can't afford]"
                print(f"    {idx + 1}. {b['name']} (Cost: {cost_str}) "
                      f"{b['vp']} VP - {b['type']}{mark}")
            bi_choice = input_with_quit("  Choose building to construct: ").strip()
            try:
                bi_idx = int(bi_choice) - 1
                if bi_idx < 0 or bi_idx >= len(affordable):
                    self.message = "Invalid choice."
                    return False
            except ValueError:
                return False
            bi, b, can = affordable[bi_idx]
            if not can:
                self.message = "Cannot afford that building!"
                return False
            for r, amt in b["cost"].items():
                p["resources"][r] -= amt
            p["buildings"].append(bi)
            p["vp"] += b["vp"]
            if bi in self.building_pool:
                self.building_pool.remove(bi)
            self.message = f"Built {b['name']}! +{b['vp']} VP."
            return True

        elif action == "use_building":
            usable = [(bi, BUILDINGS[bi]) for bi in p["buildings"]
                      if BUILDINGS[bi]["produces"] or BUILDINGS[bi]["converts"]]
            if not usable:
                self.message = "No usable buildings!"
                return False
            print("  Your production buildings:")
            for idx, (bi, b) in enumerate(usable):
                conv = ""
                if b["converts"]:
                    conv = " (needs: " + ", ".join(
                        f"{v} {k}" for k, v in b["converts"].items()) + ")"
                prod = ""
                if b["produces"]:
                    prod = " -> " + ", ".join(
                        f"{v} {k}" for k, v in b["produces"].items())
                print(f"    {idx + 1}. {b['name']}{conv}{prod}")
            ui = input_with_quit("  Choose building to use: ").strip()
            try:
                ui = int(ui) - 1
                if ui < 0 or ui >= len(usable):
                    self.message = "Invalid choice."
                    return False
            except ValueError:
                return False
            bi, b = usable[ui]
            # Check conversion cost
            if b["converts"]:
                for r, amt in b["converts"].items():
                    if p["resources"].get(r, 0) < amt:
                        self.message = f"Need {amt} {r}, have {p['resources'].get(r, 0)}!"
                        return False
                for r, amt in b["converts"].items():
                    p["resources"][r] -= amt
            # Produce
            if b["produces"]:
                for r, amt in b["produces"].items():
                    p["resources"][r] += amt
            parts = []
            if b["converts"]:
                parts.append("spent " + ", ".join(
                    f"{v} {k}" for k, v in b["converts"].items()))
            if b["produces"]:
                parts.append("gained " + ", ".join(
                    f"{v} {k}" for k, v in b["produces"].items()))
            self.message = f"Used {b['name']}: {'; '.join(parts)}."
            return True

        elif action == "convert_resources":
            print("  Basic conversions:")
            conversions = [
                ("grain", 1, "flour", 1, "Mill grain into flour"),
                ("flour", 1, "bread", 1, "Bake flour into bread"),
                ("clay", 2, "brick", 1, "Fire clay into bricks"),
                ("clay", 1, "ceramic", 1, "Shape clay into ceramic"),
                ("wood", 2, "coin", 1, "Sell wood for coin"),
                ("peat", 2, "coin", 1, "Sell peat for coin"),
                ("livestock", 2, "coin", 1, "Sell livestock for coin"),
            ]
            for idx, (fr, fa, to, ta, desc) in enumerate(conversions):
                can = p["resources"].get(fr, 0) >= fa
                mark = "" if can else " [insufficient]"
                print(f"    {idx + 1}. {desc} ({fa} {fr} -> {ta} {to}){mark}")
            ci = input_with_quit("  Choose conversion: ").strip()
            try:
                ci = int(ci) - 1
                if ci < 0 or ci >= len(conversions):
                    self.message = "Invalid choice."
                    return False
            except ValueError:
                return False
            fr, fa, to, ta, desc = conversions[ci]
            if p["resources"].get(fr, 0) < fa:
                self.message = f"Need {fa} {fr}!"
                return False
            # Ask how many times
            max_times = p["resources"][fr] // fa
            times_str = input_with_quit(
                f"  How many times? (1-{max_times}): ").strip()
            try:
                times = int(times_str)
                if times < 1 or times > max_times:
                    self.message = "Invalid amount."
                    return False
            except ValueError:
                times = 1
            p["resources"][fr] -= fa * times
            p["resources"][to] += ta * times
            self.message = f"Converted {fa * times} {fr} -> {ta * times} {to}."
            return True

        elif action == "buy_settlement":
            settlements = [(bi, BUILDINGS[bi]) for bi in self.building_pool
                           if BUILDINGS[bi]["type"] == "settlement"]
            if not settlements:
                self.message = "No settlements available!"
                return False
            print("  Available settlements:")
            for idx, (bi, b) in enumerate(settlements):
                cost_str = ", ".join(f"{v} {k}" for k, v in b["cost"].items())
                can = all(p["resources"].get(r, 0) >= amt
                          for r, amt in b["cost"].items())
                mark = "" if can else " [can't afford]"
                print(f"    {idx + 1}. {b['name']} (Cost: {cost_str}) "
                      f"{b['vp']} VP{mark}")
            si = input_with_quit("  Choose settlement: ").strip()
            try:
                si = int(si) - 1
                if si < 0 or si >= len(settlements):
                    self.message = "Invalid choice."
                    return False
            except ValueError:
                return False
            bi, b = settlements[si]
            can = all(p["resources"].get(r, 0) >= amt
                      for r, amt in b["cost"].items())
            if not can:
                self.message = "Cannot afford that settlement!"
                return False
            for r, amt in b["cost"].items():
                p["resources"][r] -= amt
            p["buildings"].append(bi)
            p["vp"] += b["vp"]
            self.building_pool.remove(bi)
            self.message = f"Founded {b['name']}! +{b['vp']} VP."
            return True

        return False

    def _check_round_end(self):
        all_done = all(
            self.actions_this_turn >= self.max_actions
            for _ in range(1)  # simplified check for current player
        )
        # In practice, switch to next player or advance round
        # For 2-player: alternate, then new round when both done
        self.actions_this_turn = 0
        # Check if we should advance round (after both players go)
        if self.current_player == len(self.players):
            self.current_round += 1
            if self.current_round <= self.max_rounds:
                self._advance_rondel()
                self.message = f"Round {self.current_round}/{self.max_rounds}. Rondel advances!"
                for i in range(1, len(self.players) + 1):
                    self.player_data[str(i)]["workers_placed"] = 0

    def check_game_over(self):
        if self.current_round > self.max_rounds:
            self.game_over = True
            # Final scoring
            for i in range(1, len(self.players) + 1):
                pd = self.player_data[str(i)]
                # Refined goods bonus
                for r in ["bread", "whiskey", "wine", "ornament", "book"]:
                    pd["vp"] += pd["resources"][r] * 2
                # Settlements bonus
                settlements = [bi for bi in pd["buildings"]
                               if BUILDINGS[bi]["type"] == "settlement"]
                pd["vp"] += len(settlements) * 3
                # Coin to VP
                pd["vp"] += pd["resources"]["coin"]
            best = max(range(1, len(self.players) + 1),
                       key=lambda i: self.player_data[str(i)]["vp"])
            self.winner = best

    def get_state(self):
        return {
            "current_round": self.current_round,
            "max_rounds": self.max_rounds,
            "rondel": self.rondel,
            "rondel_pointer": self.rondel_pointer,
            "building_pool": self.building_pool,
            "player_data": self.player_data,
            "actions_this_turn": self.actions_this_turn,
            "max_actions": self.max_actions,
            "message": self.message,
        }

    def load_state(self, state):
        self.current_round = state["current_round"]
        self.max_rounds = state["max_rounds"]
        self.rondel = state["rondel"]
        self.rondel_pointer = state["rondel_pointer"]
        self.building_pool = state["building_pool"]
        self.player_data = state["player_data"]
        self.actions_this_turn = state["actions_this_turn"]
        self.max_actions = state["max_actions"]
        self.message = state.get("message", "")

    def get_tutorial(self):
        return """
=== ORA ET LABORA TUTORIAL ===

Ora et Labora ("Pray and Work") is a resource conversion and building game
set in a medieval monastery. Build your settlement and convert resources
through production chains to earn victory points.

THE RONDEL:
  Resources accumulate on a circular rondel each round.
  Each slot gains resources over time. When you collect from a slot,
  you take ALL accumulated resources and the slot resets to 0.
  Timing your collection is key - wait for more, but don't wait too long!

RESOURCES:
  Basic: Wood, Peat, Grain, Clay, Coin, Livestock, Grape, Stone
  Refined: Flour, Bread, Ceramic, Brick, Whiskey, Wine, Ornament, Book

PRODUCTION CHAINS:
  Grain -> Flour -> Bread (via Malt House, Bakery)
  Clay -> Brick (via Brickworks)
  Clay -> Ceramic (via Kiln)
  Grain -> Whiskey (via Brewery)
  Grape -> Wine (via Winery)
  Peat + Coin -> Book (via Scriptorium)
  Coin -> Ornament (via Goldsmith)

ACTIONS (2 per round):
  1. Collect Resource - Take accumulated resources from rondel
  2. Build Building - Pay costs to construct a building
  3. Use Building - Activate a building's production/conversion
  4. Convert Resources - Basic resource conversions
  5. Found Settlement - Build a settlement for VP
  6. Pass - End your turn

SETTLEMENTS:
  Settlements are expensive but give lots of VP.
  Village, Hilltop Village, Fishing Village, Market Town, Monastery.

SCORING:
  - Building VP from construction
  - Refined goods are worth 2 VP each at game end
  - Settlements give 3 bonus VP each
  - Coins convert to VP 1:1

STRATEGY:
  - Build production buildings early to convert basic resources
  - Time your rondel collection for maximum value
  - Chain conversions: grain -> flour -> bread for increasing value
  - Save up for expensive settlements in late game
  - Books and ornaments are the most valuable refined goods
"""
