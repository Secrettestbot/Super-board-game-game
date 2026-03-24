"""Nusfjord - Fishing village worker placement game.

Catch fish, build buildings, employ elders, issue shares. Fish must be
distributed among workers and elders. Manage your fishing fleet and village.
"""

import random
from engine.base import BaseGame, input_with_quit, clear_screen

ELDER_CARDS = [
    {"name": "Olaf the Fisher", "bonus": "fish", "value": 2, "feed": 1},
    {"name": "Sigrid the Builder", "bonus": "gold", "value": 1, "feed": 1},
    {"name": "Bjorn the Strong", "bonus": "wood", "value": 2, "feed": 2},
    {"name": "Ingrid the Wise", "bonus": "vp", "value": 2, "feed": 1},
    {"name": "Harald the Old", "bonus": "fish", "value": 1, "feed": 1},
    {"name": "Astrid the Fair", "bonus": "gold", "value": 2, "feed": 2},
    {"name": "Erik the Red", "bonus": "wood", "value": 1, "feed": 1},
    {"name": "Freya the Kind", "bonus": "vp", "value": 1, "feed": 1},
    {"name": "Gunnar the Bold", "bonus": "fish", "value": 3, "feed": 2},
    {"name": "Helga the Tall", "bonus": "gold", "value": 1, "feed": 1},
]

BUILDING_CARDS = [
    {"name": "Smokehouse", "cost_wood": 1, "cost_gold": 0, "vp": 2,
     "bonus": "Smoked fish: +1 fish/round", "type": "production"},
    {"name": "Lumber Mill", "cost_wood": 2, "cost_gold": 0, "vp": 3,
     "bonus": "+2 wood when forestry", "type": "production"},
    {"name": "Fishing Pier", "cost_wood": 2, "cost_gold": 1, "vp": 4,
     "bonus": "+1 ship capacity", "type": "harbor"},
    {"name": "Elder Hall", "cost_wood": 1, "cost_gold": 1, "vp": 3,
     "bonus": "Elders cost 1 less fish", "type": "village"},
    {"name": "Warehouse", "cost_wood": 2, "cost_gold": 0, "vp": 2,
     "bonus": "Store unlimited fish", "type": "storage"},
    {"name": "Shipyard", "cost_wood": 3, "cost_gold": 0, "vp": 5,
     "bonus": "Build ships cheaper", "type": "harbor"},
    {"name": "Market", "cost_wood": 1, "cost_gold": 1, "vp": 2,
     "bonus": "Trade fish for gold 2:1", "type": "village"},
    {"name": "Chapel", "cost_wood": 2, "cost_gold": 2, "vp": 6,
     "bonus": "+1 VP per elder", "type": "village"},
    {"name": "Town Hall", "cost_wood": 3, "cost_gold": 1, "vp": 5,
     "bonus": "+1 VP per building", "type": "village"},
    {"name": "Boathouse", "cost_wood": 1, "cost_gold": 0, "vp": 1,
     "bonus": "+1 fish when fishing", "type": "harbor"},
    {"name": "Tavern", "cost_wood": 1, "cost_gold": 1, "vp": 3,
     "bonus": "+2 gold at game end", "type": "village"},
    {"name": "Sawmill", "cost_wood": 0, "cost_gold": 2, "vp": 3,
     "bonus": "+1 wood/round", "type": "production"},
    {"name": "Forge", "cost_wood": 2, "cost_gold": 1, "vp": 4,
     "bonus": "Ships +1 capacity", "type": "production"},
    {"name": "Fish Market", "cost_wood": 1, "cost_gold": 2, "vp": 4,
     "bonus": "Sell fish for 2 gold each", "type": "village"},
    {"name": "Cottage", "cost_wood": 1, "cost_gold": 0, "vp": 1,
     "bonus": "+1 worker slot", "type": "village"},
]

ACTION_SPACES = [
    "go_fishing", "forestry", "build_ship", "build_building",
    "employ_elder", "issue_shares", "trade",
]
ACTION_LABELS = {
    "go_fishing": "Go Fishing (catch fish based on fleet)",
    "forestry": "Forestry (gain wood from forest)",
    "build_ship": "Build a Ship (cost: 2 wood)",
    "build_building": "Build a Building",
    "employ_elder": "Employ an Elder (cost: fish)",
    "issue_shares": "Issue Shares (gain 3 gold, give 1 fish/round)",
    "trade": "Trade (2 fish -> 1 gold, or 2 gold -> 1 wood)",
}


def _init_player():
    return {
        "vp": 0,
        "fish": 5,
        "wood": 3,
        "gold": 0,
        "workers": 3,
        "workers_placed": 0,
        "ships": 1,
        "ship_capacity": 2,
        "shares_issued": 0,
        "elders": [],
        "buildings": [],
        "forest_tiles": 5,  # how many wood available in forest
    }


class NusfjordGame(BaseGame):
    name = "Nusfjord"
    description = "Fishing village worker placement: catch fish, build, employ elders."
    min_players = 1
    max_players = 2
    variations = {
        "standard": "Full game - 7 rounds with all buildings and elders",
        "quick": "Quick game - 5 rounds, smaller building deck, start with extra resources",
    }

    def setup(self):
        is_quick = self.variation == "quick"
        self.max_rounds = 5 if is_quick else 7
        self.current_round = 1
        self.elder_pool = list(range(len(ELDER_CARDS)))
        random.shuffle(self.elder_pool)
        if is_quick:
            self.elder_pool = self.elder_pool[:6]
        self.building_pool = list(range(len(BUILDING_CARDS)))
        random.shuffle(self.building_pool)
        if is_quick:
            self.building_pool = self.building_pool[:8]
        self.used_actions = []
        self.player_data = {}
        for i in range(1, len(self.players) + 1):
            p = _init_player()
            if is_quick:
                p["fish"] = 7
                p["wood"] = 4
                p["gold"] = 2
            self.player_data[str(i)] = p
        self.phase = "actions"  # actions, feed
        self.message = f"Round 1/{self.max_rounds}. Place your workers!"

    def display(self):
        clear_screen()
        print(f"{'=' * 60}")
        print(f"  NUSFJORD - Round {self.current_round}/{self.max_rounds} | Phase: {self.phase.upper()}")
        print(f"{'=' * 60}")
        for i in range(1, len(self.players) + 1):
            pd = self.player_data[str(i)]
            marker = " <<" if i == self.current_player else ""
            avail_w = pd["workers"] - pd["workers_placed"]
            print(f"  {self.players[i-1]}: {pd['vp']} VP | Fish:{pd['fish']} Wood:{pd['wood']} "
                  f"Gold:{pd['gold']} | Workers:{avail_w}/{pd['workers']}{marker}")
            print(f"    Ships:{pd['ships']} (cap {pd['ship_capacity']}/ship) | "
                  f"Forest:{pd['forest_tiles']} | Shares:{pd['shares_issued']}")
            if pd["elders"]:
                elder_names = ", ".join(ELDER_CARDS[e]["name"] for e in pd["elders"])
                print(f"    Elders: {elder_names}")
            if pd["buildings"]:
                bnames = ", ".join(BUILDING_CARDS[b]["name"] for b in pd["buildings"])
                print(f"    Buildings: {bnames}")
        print(f"{'-' * 60}")
        if self.phase == "actions":
            print("  Action spaces:")
            for idx, act in enumerate(ACTION_SPACES):
                used = "X" if act in self.used_actions else " "
                print(f"    {idx + 1}. [{used}] {ACTION_LABELS[act]}")
            print(f"    {len(ACTION_SPACES) + 1}. Pass (end round)")
        elif self.phase == "feed":
            p = self.player_data[str(self.current_player)]
            total_feed = len(p["elders"]) + p["shares_issued"]
            print(f"  Feeding phase: Need {total_feed} fish for elders and shareholders.")
            print(f"  You have {p['fish']} fish.")
        # Elder pool
        if self.elder_pool:
            print(f"\n  Available Elders:")
            for idx, ei in enumerate(self.elder_pool[:4]):  # show top 4
                e = ELDER_CARDS[ei]
                print(f"    {idx + 1}. {e['name']} (+{e['value']} {e['bonus']}, feeds {e['feed']})")
        if self.message:
            print(f"\n  {self.message}")
        print()

    def get_move(self):
        p = self.player_data[str(self.current_player)]
        if self.phase == "feed":
            move = input_with_quit("  Distribute fish (press Enter to auto-feed): ")
        else:
            n = len(ACTION_SPACES) + 1
            move = input_with_quit(f"  {self.players[self.current_player - 1]}, choose action (1-{n}): ")
        return move.strip()

    def make_move(self, move):
        p = self.player_data[str(self.current_player)]
        self.message = ""

        if self.phase == "feed":
            return self._do_feeding(p, move)

        try:
            choice = int(move)
        except ValueError:
            self.message = "Enter a number."
            return False
        if choice < 1 or choice > len(ACTION_SPACES) + 1:
            self.message = "Invalid choice."
            return False

        # Pass
        if choice == len(ACTION_SPACES) + 1:
            self._check_round_end()
            return True

        if p["workers_placed"] >= p["workers"]:
            self.message = "No workers left! You must pass."
            return False

        action = ACTION_SPACES[choice - 1]
        if len(self.players) <= 2 and action in self.used_actions:
            self.message = "Action already taken this round!"
            return False

        success = self._execute_action(action, p)
        if success:
            p["workers_placed"] += 1
            self.used_actions.append(action)
            self._check_round_end()
        return success

    def _execute_action(self, action, p):
        if action == "go_fishing":
            fish_caught = p["ships"] * p["ship_capacity"]
            # Bonus from boathouse
            if any(BUILDING_CARDS[b]["name"] == "Boathouse" for b in p["buildings"]):
                fish_caught += 1
            p["fish"] += fish_caught
            self.message = f"Caught {fish_caught} fish!"
            return True

        elif action == "forestry":
            if p["forest_tiles"] <= 0:
                self.message = "Forest depleted!"
                return False
            wood_gained = min(3, p["forest_tiles"])
            if any(BUILDING_CARDS[b]["name"] == "Lumber Mill" for b in p["buildings"]):
                wood_gained += 2
            p["wood"] += wood_gained
            p["forest_tiles"] = max(0, p["forest_tiles"] - 1)
            self.message = f"Gained {wood_gained} wood from forestry."
            return True

        elif action == "build_ship":
            cost = 2
            if any(BUILDING_CARDS[b]["name"] == "Shipyard" for b in p["buildings"]):
                cost = 1
            if p["wood"] < cost:
                self.message = f"Need {cost} wood to build a ship!"
                return False
            p["wood"] -= cost
            p["ships"] += 1
            self.message = f"Built a ship! Now have {p['ships']} ships."
            return True

        elif action == "build_building":
            if not self.building_pool:
                self.message = "No buildings available!"
                return False
            print("  Available buildings:")
            for idx, bi in enumerate(self.building_pool):
                b = BUILDING_CARDS[bi]
                cost_parts = []
                if b["cost_wood"] > 0:
                    cost_parts.append(f"{b['cost_wood']} wood")
                if b["cost_gold"] > 0:
                    cost_parts.append(f"{b['cost_gold']} gold")
                cost_str = ", ".join(cost_parts) if cost_parts else "free"
                print(f"    {idx + 1}. {b['name']} (Cost: {cost_str}) {b['vp']} VP - {b['bonus']}")
            bi_choice = input_with_quit("  Choose building: ").strip()
            try:
                bi_idx = int(bi_choice) - 1
                if bi_idx < 0 or bi_idx >= len(self.building_pool):
                    self.message = "Invalid choice."
                    return False
            except ValueError:
                return False
            bi = self.building_pool[bi_idx]
            b = BUILDING_CARDS[bi]
            if p["wood"] < b["cost_wood"]:
                self.message = f"Need {b['cost_wood']} wood, have {p['wood']}!"
                return False
            if p["gold"] < b["cost_gold"]:
                self.message = f"Need {b['cost_gold']} gold, have {p['gold']}!"
                return False
            p["wood"] -= b["cost_wood"]
            p["gold"] -= b["cost_gold"]
            p["buildings"].append(bi)
            p["vp"] += b["vp"]
            self.building_pool.pop(bi_idx)
            self.message = f"Built {b['name']}! +{b['vp']} VP."
            return True

        elif action == "employ_elder":
            available = self.elder_pool[:4]
            if not available:
                self.message = "No elders available!"
                return False
            print("  Available elders:")
            for idx, ei in enumerate(available):
                e = ELDER_CARDS[ei]
                hire_cost = e["feed"]
                if any(BUILDING_CARDS[b]["name"] == "Elder Hall" for b in p["buildings"]):
                    hire_cost = max(0, hire_cost - 1)
                print(f"    {idx + 1}. {e['name']} (cost: {hire_cost} fish, "
                      f"bonus: +{e['value']} {e['bonus']}, feeds: {e['feed']}/round)")
            ei_choice = input_with_quit("  Choose elder: ").strip()
            try:
                ei_idx = int(ei_choice) - 1
                if ei_idx < 0 or ei_idx >= len(available):
                    self.message = "Invalid choice."
                    return False
            except ValueError:
                return False
            ei = available[ei_idx]
            e = ELDER_CARDS[ei]
            hire_cost = e["feed"]
            if any(BUILDING_CARDS[b]["name"] == "Elder Hall" for b in p["buildings"]):
                hire_cost = max(0, hire_cost - 1)
            if p["fish"] < hire_cost:
                self.message = f"Need {hire_cost} fish to employ this elder!"
                return False
            p["fish"] -= hire_cost
            p["elders"].append(ei)
            self.elder_pool.remove(ei)
            # Apply immediate bonus
            if e["bonus"] == "fish":
                p["fish"] += e["value"]
            elif e["bonus"] == "wood":
                p["wood"] += e["value"]
            elif e["bonus"] == "gold":
                p["gold"] += e["value"]
            elif e["bonus"] == "vp":
                p["vp"] += e["value"]
            self.message = f"Employed {e['name']}! +{e['value']} {e['bonus']}."
            return True

        elif action == "issue_shares":
            if p["shares_issued"] >= 3:
                self.message = "Maximum shares (3) already issued!"
                return False
            p["gold"] += 3
            p["shares_issued"] += 1
            self.message = f"Issued share #{p['shares_issued']}! +3 gold. Must pay 1 fish/round."
            return True

        elif action == "trade":
            print("  Trade options:")
            print("    1. Sell 2 fish -> 1 gold")
            print("    2. Buy 1 wood for 2 gold")
            ti = input_with_quit("  Choose trade: ").strip()
            if ti == "1":
                if p["fish"] < 2:
                    self.message = "Need 2 fish!"
                    return False
                p["fish"] -= 2
                p["gold"] += 1
                self.message = "Traded 2 fish for 1 gold."
                return True
            elif ti == "2":
                if p["gold"] < 2:
                    self.message = "Need 2 gold!"
                    return False
                p["gold"] -= 2
                p["wood"] += 1
                self.message = "Traded 2 gold for 1 wood."
                return True
            else:
                self.message = "Invalid trade option."
                return False

        return False

    def _do_feeding(self, p, move):
        """Handle the feeding phase."""
        total_feed = sum(ELDER_CARDS[e]["feed"] for e in p["elders"]) + p["shares_issued"]
        # Production bonuses
        for bi in p["buildings"]:
            b = BUILDING_CARDS[bi]
            if b["name"] == "Smokehouse":
                p["fish"] += 1
            elif b["name"] == "Sawmill":
                p["wood"] += 1
        if p["fish"] >= total_feed:
            p["fish"] -= total_feed
            self.message = f"Fed {total_feed} fish to elders and shareholders."
        else:
            deficit = total_feed - p["fish"]
            p["fish"] = 0
            p["vp"] -= deficit * 2
            self.message = f"Couldn't feed all! Lost {deficit * 2} VP."
        self.phase = "actions"
        self._start_new_round()
        return True

    def _check_round_end(self):
        all_done = all(
            self.player_data[str(i)]["workers_placed"] >= self.player_data[str(i)]["workers"]
            for i in range(1, len(self.players) + 1)
        )
        if all_done:
            self.phase = "feed"
            self.message = "All workers placed! Feeding phase."

    def _start_new_round(self):
        self.current_round += 1
        self.used_actions = []
        for i in range(1, len(self.players) + 1):
            self.player_data[str(i)]["workers_placed"] = 0
            # Forest regrows slightly
            self.player_data[str(i)]["forest_tiles"] = min(
                5, self.player_data[str(i)]["forest_tiles"] + 1)
        if self.current_round <= self.max_rounds:
            self.message = f"Round {self.current_round}/{self.max_rounds} begins!"

    def check_game_over(self):
        if self.current_round > self.max_rounds and self.phase == "actions":
            self.game_over = True
            # Final scoring
            for i in range(1, len(self.players) + 1):
                pd = self.player_data[str(i)]
                # Chapel bonus
                if any(BUILDING_CARDS[b]["name"] == "Chapel" for b in pd["buildings"]):
                    pd["vp"] += len(pd["elders"])
                # Town Hall bonus
                if any(BUILDING_CARDS[b]["name"] == "Town Hall" for b in pd["buildings"]):
                    pd["vp"] += len(pd["buildings"])
                # Tavern bonus
                if any(BUILDING_CARDS[b]["name"] == "Tavern" for b in pd["buildings"]):
                    pd["gold"] += 2
                # Gold to VP (3 gold = 1 VP)
                pd["vp"] += pd["gold"] // 3
                # Fish to VP (5 fish = 1 VP)
                pd["vp"] += pd["fish"] // 5
                # Ships to VP
                pd["vp"] += pd["ships"]
                # Shares penalty
                pd["vp"] -= pd["shares_issued"] * 2
            best = max(range(1, len(self.players) + 1),
                       key=lambda i: self.player_data[str(i)]["vp"])
            self.winner = best

    def get_state(self):
        return {
            "current_round": self.current_round,
            "max_rounds": self.max_rounds,
            "phase": self.phase,
            "elder_pool": self.elder_pool,
            "building_pool": self.building_pool,
            "used_actions": self.used_actions,
            "player_data": self.player_data,
            "message": self.message,
        }

    def load_state(self, state):
        self.current_round = state["current_round"]
        self.max_rounds = state["max_rounds"]
        self.phase = state["phase"]
        self.elder_pool = state["elder_pool"]
        self.building_pool = state["building_pool"]
        self.used_actions = state["used_actions"]
        self.player_data = state["player_data"]
        self.message = state.get("message", "")

    def get_tutorial(self):
        return """
=== NUSFJORD TUTORIAL ===

Nusfjord is a worker placement game set in a Norwegian fishing village.
Manage your fleet, catch fish, build your village, and employ elders.

RESOURCES:
  Fish - Primary resource, used for feeding and trading
  Wood - Used for building ships and buildings
  Gold - Alternative currency, earned from shares and trading

ACTIONS (place one worker per action):
  1. Go Fishing - Catch fish based on your fleet size
     (ships x capacity per ship)
  2. Forestry - Harvest wood from your forest (depletes slowly)
  3. Build Ship - Spend 2 wood to add a fishing vessel
  4. Build Building - Construct a village building for VP and bonuses
  5. Employ Elder - Hire a village elder (costs fish, gives ongoing benefits)
  6. Issue Shares - Gain 3 gold now, but must pay 1 fish/round forever
  7. Trade - Convert resources (2 fish -> 1 gold, or 2 gold -> 1 wood)

FEEDING (end of each round):
  You must feed your elders and pay fish for shares issued.
  If you can't pay, lose 2 VP per missing fish!

BUILDING TYPES:
  Production - Generate resources each round
  Harbor - Improve your fishing fleet
  Village - VP and special abilities
  Storage - Resource management bonuses

STRATEGY:
  - Expand your fleet early for more fish income
  - Elders provide powerful bonuses but require feeding
  - Shares give quick gold but long-term fish drain
  - Buildings provide VP and engine-building opportunities
  - Forest management: don't over-harvest!
"""
