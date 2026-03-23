"""Trajan - Mancala-based action selection game.

Pick up and distribute markers in a mancala bowl to select from 6 action types:
military, senate, construction, shipping, forum, and Trajan tiles.
Set in ancient Rome with multiple scoring paths.
"""

import random
from engine.base import BaseGame, input_with_quit, clear_screen

# Action types mapped to bowl positions (0-5)
ACTION_NAMES = ["Military", "Senate", "Construction", "Shipping", "Forum", "Trajan"]

# Trajan tiles - bonus scoring conditions
TRAJAN_TILES = [
    {"name": "Military Commander", "condition": "military >= 3", "vp": 5, "check": "military"},
    {"name": "Senator", "condition": "senate >= 3", "vp": 5, "check": "senate"},
    {"name": "Architect", "condition": "buildings >= 3", "vp": 5, "check": "construction"},
    {"name": "Merchant", "condition": "goods >= 3", "vp": 5, "check": "shipping"},
    {"name": "Tribune", "condition": "forum_cards >= 3", "vp": 5, "check": "forum"},
    {"name": "Conqueror", "condition": "military >= 5", "vp": 9, "check": "military"},
    {"name": "Consul", "condition": "senate >= 5", "vp": 9, "check": "senate"},
    {"name": "Master Builder", "condition": "buildings >= 5", "vp": 9, "check": "construction"},
    {"name": "Trade Baron", "condition": "goods >= 5", "vp": 9, "check": "shipping"},
    {"name": "People's Champion", "condition": "forum_cards >= 5", "vp": 9, "check": "forum"},
    {"name": "Diplomat", "condition": "any_two >= 3", "vp": 7, "check": "any_two"},
    {"name": "Governor", "condition": "all >= 2", "vp": 12, "check": "all"},
]

# Goods for shipping
GOODS = ["wheat", "wine", "cloth", "pottery", "oil", "spice"]

# Forum cards
FORUM_CARDS = [
    {"name": "Bread and Games", "effect": "+3 VP", "vp": 3},
    {"name": "Tax Collector", "effect": "+2 VP per quarter", "vp": 2},
    {"name": "Extra Worker", "effect": "+1 action marker", "bonus": "marker"},
    {"name": "Trade Route", "effect": "+1 good of choice", "bonus": "good"},
    {"name": "Senate Influence", "effect": "+2 senate", "bonus": "senate"},
    {"name": "Military Levy", "effect": "+2 military", "bonus": "military"},
    {"name": "Public Works", "effect": "+1 building", "bonus": "construction"},
    {"name": "Festival", "effect": "+4 VP", "vp": 4},
]

# Construction tiles
CONSTRUCTION_TILES = [
    {"name": "Aqueduct", "vp": 3, "bonus": "water"},
    {"name": "Temple", "vp": 4, "bonus": "religion"},
    {"name": "Forum Building", "vp": 2, "bonus": "draw_forum"},
    {"name": "Barracks", "vp": 2, "bonus": "military_bonus"},
    {"name": "Harbor", "vp": 3, "bonus": "shipping_bonus"},
    {"name": "Villa", "vp": 5, "bonus": None},
    {"name": "Colosseum", "vp": 6, "bonus": None},
    {"name": "Amphitheatre", "vp": 4, "bonus": "entertainment"},
]

# Marker colors for the mancala
COLORS = ["R", "G", "B", "Y", "W", "K"]  # Red Green Blue Yellow White blacK


def _init_player():
    return {
        "vp": 0,
        "bowls": [2, 2, 2, 2, 2, 2],  # 6 bowls, each starts with 2 markers
        "military": 0,
        "senate": 0,
        "buildings": [],
        "goods": [],
        "forum_cards": [],
        "trajan_tiles": [],
        "completed_trajan": [],
    }


class TrajanGame(BaseGame):
    name = "Trajan"
    description = "Mancala-based action selection in ancient Rome with 6 action paths."
    min_players = 1
    max_players = 2
    variations = {
        "standard": "Full game - 4 quarters (16 rounds), full scoring",
        "quick": "Quick game - 2 quarters (8 rounds), accelerated scoring",
    }

    def setup(self):
        is_quick = self.variation == "quick"
        self.num_quarters = 2 if is_quick else 4
        self.rounds_per_quarter = 4
        self.current_quarter = 1
        self.current_round_in_quarter = 1
        self.total_rounds = self.num_quarters * self.rounds_per_quarter

        # Setup pools
        self.construction_pool = list(range(len(CONSTRUCTION_TILES)))
        random.shuffle(self.construction_pool)
        self.forum_deck = list(range(len(FORUM_CARDS)))
        random.shuffle(self.forum_deck)
        self.trajan_pool = list(range(len(TRAJAN_TILES)))
        random.shuffle(self.trajan_pool)
        self.goods_pool = list(GOODS) * 3
        random.shuffle(self.goods_pool)
        self.available_goods = self.goods_pool[:4]
        self.goods_pool = self.goods_pool[4:]

        self.player_data = {}
        for i in range(1, len(self.players) + 1):
            p = _init_player()
            # Deal trajan tiles
            for _ in range(3):
                if self.trajan_pool:
                    p["trajan_tiles"].append(self.trajan_pool.pop())
            self.player_data[str(i)] = p

        self.message = "Quarter 1 begins! Pick up markers from a bowl to select your action."

    def display(self):
        clear_screen()
        rnd = (self.current_quarter - 1) * self.rounds_per_quarter + self.current_round_in_quarter
        print(f"{'=' * 65}")
        print(f"  TRAJAN - Quarter {self.current_quarter}/{self.num_quarters} | "
              f"Round {self.current_round_in_quarter}/{self.rounds_per_quarter} "
              f"(Turn {rnd}/{self.total_rounds})")
        print(f"{'=' * 65}")

        for i in range(1, len(self.players) + 1):
            pd = self.player_data[str(i)]
            marker = " <<" if i == self.current_player else ""
            print(f"  {self.players[i-1]}: {pd['vp']} VP{marker}")
            print(f"    Military:{pd['military']} Senate:{pd['senate']} "
                  f"Buildings:{len(pd['buildings'])} Goods:{len(pd['goods'])} "
                  f"Forum:{len(pd['forum_cards'])}")

        p = self.player_data[str(self.current_player)]
        print(f"{'-' * 65}")
        print(f"  >> {self.players[self.current_player - 1]}'s Mancala Board:")
        print()
        # Display bowls in a circle-like layout
        #    [5]  [0]
        #  [4]      [1]
        #    [3]  [2]
        b = p["bowls"]
        print(f"       [{ACTION_NAMES[5]:^12}]   [{ACTION_NAMES[0]:^12}]")
        print(f"          {b[5]:2d} markers       {b[0]:2d} markers")
        print(f"    [{ACTION_NAMES[4]:^12}]           [{ACTION_NAMES[1]:^12}]")
        print(f"       {b[4]:2d} markers              {b[1]:2d} markers")
        print(f"       [{ACTION_NAMES[3]:^12}]   [{ACTION_NAMES[2]:^12}]")
        print(f"          {b[3]:2d} markers       {b[2]:2d} markers")
        print()

        # Show available goods
        if self.available_goods:
            print(f"  Available Goods: {', '.join(self.available_goods)}")

        # Show trajan tiles
        if p["trajan_tiles"]:
            print(f"  Trajan Tiles:")
            for ti in p["trajan_tiles"]:
                t = TRAJAN_TILES[ti]
                print(f"    - {t['name']}: {t['condition']} -> {t['vp']} VP")

        if p["completed_trajan"]:
            names = ", ".join(TRAJAN_TILES[t]["name"] for t in p["completed_trajan"])
            print(f"  Completed Trajan: {names}")

        if p["goods"]:
            print(f"  Your Goods: {', '.join(p['goods'])}")
        if p["buildings"]:
            bnames = ", ".join(CONSTRUCTION_TILES[b]["name"] for b in p["buildings"])
            print(f"  Your Buildings: {bnames}")

        if self.message:
            print(f"\n  {self.message}")
        print()

    def get_move(self):
        move = input_with_quit(
            f"  Pick up markers from which bowl? (1-6, "
            f"1={ACTION_NAMES[0]}, 2={ACTION_NAMES[1]}, ..., 6={ACTION_NAMES[5]}): ")
        return move.strip()

    def make_move(self, move):
        p = self.player_data[str(self.current_player)]
        self.message = ""
        try:
            bowl_idx = int(move) - 1
            if bowl_idx < 0 or bowl_idx > 5:
                self.message = "Choose bowl 1-6."
                return False
        except ValueError:
            self.message = "Enter a number 1-6."
            return False

        if p["bowls"][bowl_idx] == 0:
            self.message = "That bowl is empty! Choose another."
            return False

        # Mancala mechanic: pick up all markers, distribute one per bowl clockwise
        markers = p["bowls"][bowl_idx]
        p["bowls"][bowl_idx] = 0
        pos = bowl_idx
        for _ in range(markers):
            pos = (pos + 1) % 6
            p["bowls"][pos] += 1

        # The action is determined by where the last marker lands
        action_idx = pos
        action_name = ACTION_NAMES[action_idx]
        self.message = f"Distributed {markers} markers. Last marker landed on {action_name}."

        # Execute the action
        self._execute_action(action_idx, p)

        # Check trajan tiles
        self._check_trajan_tiles(p)

        # Advance round
        self.current_round_in_quarter += 1
        if self.current_round_in_quarter > self.rounds_per_quarter:
            self._end_quarter()

        return True

    def _execute_action(self, action_idx, p):
        if action_idx == 0:  # Military
            p["military"] += 1
            bonus_vp = p["military"]  # VP = military level
            p["vp"] += bonus_vp
            self.message += f" Military +1 (now {p['military']}). +{bonus_vp} VP."

        elif action_idx == 1:  # Senate
            p["senate"] += 1
            if p["senate"] % 2 == 0:
                p["vp"] += 3
                self.message += f" Senate +1 (now {p['senate']}). +3 VP for even level!"
            else:
                self.message += f" Senate +1 (now {p['senate']})."

        elif action_idx == 2:  # Construction
            if not self.construction_pool:
                p["vp"] += 2
                self.message += " No buildings available. +2 VP instead."
                return
            print("  Available buildings:")
            show = self.construction_pool[:4]
            for idx, ci in enumerate(show):
                c = CONSTRUCTION_TILES[ci]
                bonus = f" ({c['bonus']})" if c["bonus"] else ""
                print(f"    {idx + 1}. {c['name']} - {c['vp']} VP{bonus}")
            print(f"    {len(show) + 1}. Skip (+1 VP instead)")
            bi = input_with_quit("  Choose building: ").strip()
            try:
                bi = int(bi) - 1
                if bi == len(show):
                    p["vp"] += 1
                    self.message += " Skipped construction. +1 VP."
                    return
                if bi < 0 or bi >= len(show):
                    p["vp"] += 1
                    self.message += " Invalid choice. +1 VP."
                    return
            except ValueError:
                p["vp"] += 1
                return
            ci = show[bi]
            ct = CONSTRUCTION_TILES[ci]
            p["buildings"].append(ci)
            p["vp"] += ct["vp"]
            self.construction_pool.remove(ci)
            self.message += f" Built {ct['name']}! +{ct['vp']} VP."

        elif action_idx == 3:  # Shipping
            if not self.available_goods:
                p["vp"] += 2
                self.message += " No goods available. +2 VP instead."
                return
            print("  Available goods:")
            for idx, g in enumerate(self.available_goods):
                print(f"    {idx + 1}. {g}")
            gi = input_with_quit("  Choose good to collect: ").strip()
            try:
                gi = int(gi) - 1
                if gi < 0 or gi >= len(self.available_goods):
                    self.message += " Invalid, no good collected."
                    return
            except ValueError:
                return
            good = self.available_goods.pop(gi)
            p["goods"].append(good)
            # Check for set collection
            unique_goods = len(set(p["goods"]))
            if unique_goods >= 3:
                bonus = unique_goods * 2
                p["vp"] += bonus
                self.message += f" Collected {good}. Set bonus: +{bonus} VP ({unique_goods} types)!"
            else:
                self.message += f" Collected {good}."
            # Refill
            if self.goods_pool:
                self.available_goods.append(self.goods_pool.pop())

        elif action_idx == 4:  # Forum
            if not self.forum_deck:
                p["vp"] += 2
                self.message += " No forum cards available. +2 VP instead."
                return
            fi = self.forum_deck.pop()
            fc = FORUM_CARDS[fi]
            p["forum_cards"].append(fi)
            vp_gain = fc.get("vp", 0)
            p["vp"] += vp_gain
            bonus = fc.get("bonus", None)
            if bonus == "marker":
                # Add a marker to the smallest bowl
                min_bowl = min(range(6), key=lambda x: p["bowls"][x])
                p["bowls"][min_bowl] += 1
                self.message += f" Drew {fc['name']}: +1 marker!"
            elif bonus == "good":
                if self.available_goods:
                    g = self.available_goods.pop(0)
                    p["goods"].append(g)
                    self.message += f" Drew {fc['name']}: gained {g}!"
                else:
                    p["vp"] += 1
                    self.message += f" Drew {fc['name']}: +1 VP (no goods)."
            elif bonus == "senate":
                p["senate"] += 2
                self.message += f" Drew {fc['name']}: senate +2!"
            elif bonus == "military":
                p["military"] += 2
                self.message += f" Drew {fc['name']}: military +2!"
            elif bonus == "construction":
                if self.construction_pool:
                    ci = self.construction_pool.pop(0)
                    ct = CONSTRUCTION_TILES[ci]
                    p["buildings"].append(ci)
                    p["vp"] += ct["vp"]
                    self.message += f" Drew {fc['name']}: free {ct['name']}!"
                else:
                    p["vp"] += 2
                    self.message += f" Drew {fc['name']}: +2 VP."
            else:
                self.message += f" Drew {fc['name']}: +{vp_gain} VP."

        elif action_idx == 5:  # Trajan
            if not self.trajan_pool and not p["trajan_tiles"]:
                p["vp"] += 3
                self.message += " No Trajan tiles. +3 VP."
                return
            # Draw a new tile or try to complete one
            print("  Trajan options:")
            print("    1. Draw a new Trajan tile")
            if p["trajan_tiles"]:
                print("    2. Attempt to complete a Trajan tile")
            ti = input_with_quit("  Choose: ").strip()
            if ti == "1":
                if self.trajan_pool:
                    new_tile = self.trajan_pool.pop()
                    p["trajan_tiles"].append(new_tile)
                    t = TRAJAN_TILES[new_tile]
                    self.message += f" Drew Trajan tile: {t['name']} ({t['condition']} -> {t['vp']} VP)."
                else:
                    p["vp"] += 2
                    self.message += " No tiles left. +2 VP."
            elif ti == "2" and p["trajan_tiles"]:
                self._attempt_trajan(p)
            else:
                self.message += " Invalid choice."

    def _check_trajan_tiles(self, p):
        """Auto-check if any trajan tiles are satisfied."""
        pass  # Manual completion via Trajan action

    def _attempt_trajan(self, p):
        """Let player try to complete a trajan tile."""
        print("  Your Trajan tiles:")
        for idx, ti in enumerate(p["trajan_tiles"]):
            t = TRAJAN_TILES[ti]
            print(f"    {idx + 1}. {t['name']}: {t['condition']} -> {t['vp']} VP")
        ci = input_with_quit("  Choose tile to complete: ").strip()
        try:
            ci = int(ci) - 1
            if ci < 0 or ci >= len(p["trajan_tiles"]):
                self.message += " Invalid tile."
                return
        except ValueError:
            return
        ti = p["trajan_tiles"][ci]
        t = TRAJAN_TILES[ti]
        # Check condition
        satisfied = False
        check = t["check"]
        if check == "military":
            satisfied = p["military"] >= (5 if t["vp"] >= 9 else 3)
        elif check == "senate":
            satisfied = p["senate"] >= (5 if t["vp"] >= 9 else 3)
        elif check == "construction":
            satisfied = len(p["buildings"]) >= (5 if t["vp"] >= 9 else 3)
        elif check == "shipping":
            satisfied = len(p["goods"]) >= (5 if t["vp"] >= 9 else 3)
        elif check == "forum":
            satisfied = len(p["forum_cards"]) >= (5 if t["vp"] >= 9 else 3)
        elif check == "any_two":
            counts = [p["military"], p["senate"], len(p["buildings"]),
                      len(p["goods"]), len(p["forum_cards"])]
            satisfied = sum(1 for c in counts if c >= 3) >= 2
        elif check == "all":
            counts = [p["military"], p["senate"], len(p["buildings"]),
                      len(p["goods"]), len(p["forum_cards"])]
            satisfied = all(c >= 2 for c in counts)

        if satisfied:
            p["vp"] += t["vp"]
            p["completed_trajan"].append(ti)
            p["trajan_tiles"].pop(ci)
            self.message += f" Completed {t['name']}! +{t['vp']} VP!"
        else:
            self.message += f" Condition not met: {t['condition']}."

    def _end_quarter(self):
        """End of quarter scoring."""
        self.current_round_in_quarter = 1
        for i in range(1, len(self.players) + 1):
            pd = self.player_data[str(i)]
            # Quarter bonus: +1 VP per 2 senate
            senate_bonus = pd["senate"] // 2
            pd["vp"] += senate_bonus
            # Tax collector bonus
            for fi in pd["forum_cards"]:
                if FORUM_CARDS[fi]["name"] == "Tax Collector":
                    pd["vp"] += 2

        self.current_quarter += 1
        if self.current_quarter <= self.num_quarters:
            # Replenish goods
            for _ in range(2):
                if self.goods_pool:
                    self.available_goods.append(self.goods_pool.pop())
            self.message = (f"Quarter {self.current_quarter} begins! "
                            f"Senate bonus VP awarded.")

    def check_game_over(self):
        if self.current_quarter > self.num_quarters:
            self.game_over = True
            # Final scoring
            for i in range(1, len(self.players) + 1):
                pd = self.player_data[str(i)]
                # Military dominance
                pd["vp"] += pd["military"] * 2
                # Leftover goods
                pd["vp"] += len(pd["goods"])
                # Building count
                pd["vp"] += len(pd["buildings"])
            best = max(range(1, len(self.players) + 1),
                       key=lambda i: self.player_data[str(i)]["vp"])
            self.winner = best

    def get_state(self):
        return {
            "num_quarters": self.num_quarters,
            "rounds_per_quarter": self.rounds_per_quarter,
            "current_quarter": self.current_quarter,
            "current_round_in_quarter": self.current_round_in_quarter,
            "total_rounds": self.total_rounds,
            "construction_pool": self.construction_pool,
            "forum_deck": self.forum_deck,
            "trajan_pool": self.trajan_pool,
            "goods_pool": self.goods_pool,
            "available_goods": self.available_goods,
            "player_data": self.player_data,
            "message": self.message,
        }

    def load_state(self, state):
        self.num_quarters = state["num_quarters"]
        self.rounds_per_quarter = state["rounds_per_quarter"]
        self.current_quarter = state["current_quarter"]
        self.current_round_in_quarter = state["current_round_in_quarter"]
        self.total_rounds = state["total_rounds"]
        self.construction_pool = state["construction_pool"]
        self.forum_deck = state["forum_deck"]
        self.trajan_pool = state["trajan_pool"]
        self.goods_pool = state["goods_pool"]
        self.available_goods = state["available_goods"]
        self.player_data = state["player_data"]
        self.message = state.get("message", "")

    def get_tutorial(self):
        return """
=== TRAJAN TUTORIAL ===

Trajan is set in ancient Rome. You use a unique mancala mechanism to select
from 6 different actions each turn.

THE MANCALA MECHANISM:
  You have 6 bowls arranged in a circle, each containing markers.
  On your turn, pick up ALL markers from one bowl, then distribute
  them one-by-one clockwise into subsequent bowls.
  The bowl where your LAST marker lands determines your action!

  Example: Bowl 3 has 4 markers. Pick them up, drop one each in
  bowls 4, 5, 6, and 1. You perform Action 1 (Senate).

THE 6 ACTIONS:
  1. Military - Gain military strength, VP = military level
  2. Senate - Gain senate influence, +3 VP at even levels
  3. Construction - Build a structure for VP and bonuses
  4. Shipping - Collect goods, set collection bonus VP
  5. Forum - Draw forum cards for various benefits
  6. Trajan - Draw or complete Trajan tiles for big VP

TRAJAN TILES:
  Bonus scoring tiles with specific conditions (e.g. "military >= 3").
  Complete them via the Trajan action for bonus VP.

QUARTERS:
  The game is divided into quarters. At the end of each quarter:
  - Senate provides bonus VP (1 per 2 senate levels)
  - Goods market refreshes

STRATEGY:
  - The mancala is KEY: plan your marker distribution carefully
  - Don't let bowls get too full or too empty
  - Balance between multiple action types for Trajan tiles
  - Shipping set collection can score huge points
  - Military gives escalating returns
"""
