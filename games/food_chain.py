"""Food Chain - A restaurant engine-building card game."""

import random
import copy
from engine.base import BaseGame, input_with_quit, clear_screen


# Staff types and their roles
STAFF_TYPES = {
    "Recruiter": {"cost": 5, "desc": "Hire new staff at reduced cost"},
    "Trainer": {"cost": 5, "desc": "Upgrade staff to senior level"},
    "Chef": {"cost": 8, "desc": "Produce food items (Pizza, Burger)"},
    "Waitress": {"cost": 6, "desc": "Serve food to customers for revenue"},
    "Marketer": {"cost": 7, "desc": "Attract customers from the neighborhood"},
    "Pricing Manager": {"cost": 10, "desc": "Increase food prices for more revenue"},
}

FOOD_TYPES = {
    "Pizza": {"base_price": 10, "ingredients": 1},
    "Burger": {"base_price": 8, "ingredients": 1},
    "Soda": {"base_price": 5, "ingredients": 0},
    "Lemonade": {"base_price": 4, "ingredients": 0},
}

FOOD_LIST = list(FOOD_TYPES.keys())


def _make_staff(role, senior=False):
    """Create a staff member."""
    return {
        "role": role,
        "senior": senior,
        "trained_this_turn": False,
    }


class FoodChainGame(BaseGame):
    """Food Chain: Build a restaurant engine, serve food, earn money."""

    name = "Food Chain"
    description = "Restaurant engine-building card game - hire staff, serve food, earn money"
    min_players = 2
    max_players = 2
    variations = {
        "standard": "Standard game (12 turns)",
        "quick": "Quick game (8 turns)",
        "extended": "Extended game (16 turns)",
    }

    def __init__(self, variation=None):
        super().__init__(variation)
        self.max_turns = 12
        self.player_money = [30, 30]
        self.player_staff = [[], []]
        self.player_food = [[], []]
        self.player_customers = [0, 0]
        self.player_revenue = [0, 0]
        self.neighborhood = []
        self.round_phase = "hire"
        self.actions_remaining = 0
        self.food_produced_this_turn = [[], []]

    def setup(self):
        if self.variation == "quick":
            self.max_turns = 8
        elif self.variation == "extended":
            self.max_turns = 16

        # Initialize neighborhood map with customer demand
        self._generate_neighborhood()

        # Each player starts with a basic staff
        for i in range(2):
            self.player_staff[i] = [
                _make_staff("Chef"),
                _make_staff("Waitress"),
            ]
            self.player_money[i] = 30

    def _generate_neighborhood(self):
        """Generate neighborhood tiles with customer demand."""
        self.neighborhood = []
        for i in range(6):
            tile = {
                "id": i,
                "demand": random.choice(FOOD_LIST),
                "customers": random.randint(1, 3),
                "claimed_by": None,
            }
            self.neighborhood.append(tile)

    def _count_staff(self, player_idx, role):
        return sum(1 for s in self.player_staff[player_idx] if s["role"] == role)

    def _count_senior_staff(self, player_idx, role):
        return sum(1 for s in self.player_staff[player_idx]
                   if s["role"] == role and s["senior"])

    def _food_price(self, player_idx, food_type):
        base = FOOD_TYPES[food_type]["base_price"]
        pm_count = self._count_staff(player_idx, "Pricing Manager")
        senior_pm = self._count_senior_staff(player_idx, "Pricing Manager")
        bonus = pm_count * 3 + senior_pm * 2
        return base + bonus

    def _marketing_power(self, player_idx):
        mk = self._count_staff(player_idx, "Marketer")
        senior_mk = self._count_senior_staff(player_idx, "Marketer")
        return mk + senior_mk * 2

    def _cook_capacity(self, player_idx):
        chefs = self._count_staff(player_idx, "Chef")
        senior_chefs = self._count_senior_staff(player_idx, "Chef")
        return chefs + senior_chefs

    def _serve_capacity(self, player_idx):
        waitresses = self._count_staff(player_idx, "Waitress")
        senior_w = self._count_senior_staff(player_idx, "Waitress")
        return waitresses + senior_w

    def display(self):
        clear_screen()
        p = self.current_player - 1
        opp = 1 - p

        print(f"{'='*65}")
        print(f"  FOOD CHAIN - Turn {self.turn_number + 1}/{self.max_turns} | Phase: {self.round_phase.upper()}")
        print(f"{'='*65}")
        print()

        # Opponent
        opp_name = self.players[opp]
        print(f"  {opp_name}: ${self.player_money[opp]}")
        staff_summary = {}
        for s in self.player_staff[opp]:
            key = ("Sr. " if s["senior"] else "") + s["role"]
            staff_summary[key] = staff_summary.get(key, 0) + 1
        staff_str = ", ".join(f"{v}x {k}" for k, v in staff_summary.items())
        print(f"    Staff: {staff_str if staff_str else 'None'}")
        food_str = ", ".join(self.player_food[opp]) if self.player_food[opp] else "None"
        print(f"    Food ready: {food_str}")
        print()

        # Neighborhood
        print("  --- NEIGHBORHOOD ---")
        for tile in self.neighborhood:
            claimed = ""
            if tile["claimed_by"] is not None:
                claimed = f" [Claimed by {self.players[tile['claimed_by']]}]"
            print(f"    [{tile['id']+1}] Wants: {tile['demand']} x{tile['customers']}{claimed}")
        print()

        # Current player
        cur_name = self.players[p]
        print(f"  {cur_name} (YOU): ${self.player_money[p]}")
        print("    Staff:")
        for i, s in enumerate(self.player_staff[p]):
            senior_tag = " [SENIOR]" if s["senior"] else ""
            print(f"      {i+1}. {s['role']}{senior_tag}")
        food_str = ", ".join(self.player_food[p]) if self.player_food[p] else "None"
        print(f"    Food ready: {food_str}")
        print()

        # Capacities
        print(f"    Cooking capacity: {self._cook_capacity(p)} items/turn")
        print(f"    Serving capacity: {self._serve_capacity(p)} customers/turn")
        print(f"    Marketing power: {self._marketing_power(p)}")
        print()

    def get_move(self):
        p = self.current_player - 1
        phase = self.round_phase

        if phase == "hire":
            print("  HIRE PHASE - Choose an action:")
            print("    hire <role>    - Hire staff (Recruiter/Trainer/Chef/Waitress/Marketer/Pricing Manager)")
            print("    train <staff#> - Train staff to senior (need a Trainer)")
            print("    next           - Move to Cook phase")
            print()
            print("  Staff costs:", ", ".join(f"{k}: ${v['cost']}" for k, v in STAFF_TYPES.items()))
        elif phase == "cook":
            print("  COOK PHASE - Choose an action:")
            print("    cook <food>    - Cook food (Pizza/Burger/Soda/Lemonade)")
            print("    next           - Move to Market phase")
        elif phase == "market":
            print("  MARKET PHASE - Choose an action:")
            print(f"    market <tile#>  - Market to a neighborhood tile (power: {self._marketing_power(p)})")
            print("    next            - Move to Serve phase")
        elif phase == "serve":
            print("  SERVE PHASE - Choose an action:")
            print("    serve <tile#> <food> - Serve food to a claimed tile's customers")
            print("    done                 - End turn")

        print()
        move_str = input_with_quit(f"  {self.players[p]}> ")
        return move_str.strip()

    def make_move(self, move):
        p = self.current_player - 1
        parts = move.lower().split()
        if not parts:
            return False

        action = parts[0]

        if self.round_phase == "hire":
            if action == "hire":
                return self._do_hire(p, parts)
            elif action == "train":
                return self._do_train(p, parts)
            elif action == "next":
                self.round_phase = "cook"
                self.food_produced_this_turn[p] = []
                return True
            return False

        elif self.round_phase == "cook":
            if action == "cook":
                return self._do_cook(p, parts)
            elif action == "next":
                self.round_phase = "market"
                return True
            return False

        elif self.round_phase == "market":
            if action == "market":
                return self._do_market(p, parts)
            elif action == "next":
                self.round_phase = "serve"
                return True
            return False

        elif self.round_phase == "serve":
            if action == "serve":
                return self._do_serve(p, parts)
            elif action == "done":
                self.round_phase = "hire"
                self._refresh_neighborhood()
                return True
            return False

        return False

    def _do_hire(self, p, parts):
        if len(parts) < 2:
            print("  Usage: hire <role>")
            input("  Press Enter...")
            return False

        role_input = " ".join(parts[1:]).title()
        # Handle "Pricing Manager"
        if role_input not in STAFF_TYPES:
            print(f"  Unknown role: {role_input}")
            print(f"  Available: {', '.join(STAFF_TYPES.keys())}")
            input("  Press Enter...")
            return False

        cost = STAFF_TYPES[role_input]["cost"]
        # Recruiter discount
        recruiter_count = self._count_staff(p, "Recruiter")
        discount = recruiter_count * 2
        cost = max(1, cost - discount)

        if self.player_money[p] < cost:
            print(f"  Can't afford! Cost: ${cost}, You have: ${self.player_money[p]}")
            input("  Press Enter...")
            return False

        self.player_money[p] -= cost
        self.player_staff[p].append(_make_staff(role_input))
        print(f"  Hired {role_input} for ${cost}!")
        input("  Press Enter...")
        return True

    def _do_train(self, p, parts):
        if len(parts) < 2:
            print("  Usage: train <staff#>")
            input("  Press Enter...")
            return False

        if self._count_staff(p, "Trainer") == 0:
            print("  You need a Trainer to train staff!")
            input("  Press Enter...")
            return False

        try:
            idx = int(parts[1]) - 1
        except ValueError:
            return False

        if idx < 0 or idx >= len(self.player_staff[p]):
            print("  Invalid staff index.")
            input("  Press Enter...")
            return False

        staff = self.player_staff[p][idx]
        if staff["senior"]:
            print("  Already senior!")
            input("  Press Enter...")
            return False

        cost = 5
        if self.player_money[p] < cost:
            print(f"  Training costs ${cost}. You have ${self.player_money[p]}.")
            input("  Press Enter...")
            return False

        self.player_money[p] -= cost
        staff["senior"] = True
        print(f"  {staff['role']} promoted to Senior!")
        input("  Press Enter...")
        return True

    def _do_cook(self, p, parts):
        if len(parts) < 2:
            print("  Usage: cook <food type>")
            input("  Press Enter...")
            return False

        food = parts[1].title()
        if food not in FOOD_TYPES:
            print(f"  Unknown food: {food}. Available: {', '.join(FOOD_LIST)}")
            input("  Press Enter...")
            return False

        cooked_this_turn = len(self.food_produced_this_turn[p])
        capacity = self._cook_capacity(p)
        if cooked_this_turn >= capacity:
            print(f"  At cooking capacity ({capacity})! Need more Chefs.")
            input("  Press Enter...")
            return False

        # Drinks (Soda, Lemonade) don't need ingredients
        if FOOD_TYPES[food]["ingredients"] > 0:
            cost = 3
            if self.player_money[p] < cost:
                print(f"  Ingredients cost ${cost}. You have ${self.player_money[p]}.")
                input("  Press Enter...")
                return False
            self.player_money[p] -= cost

        self.player_food[p].append(food)
        self.food_produced_this_turn[p].append(food)
        return True

    def _do_market(self, p, parts):
        if len(parts) < 2:
            print("  Usage: market <tile#>")
            input("  Press Enter...")
            return False
        try:
            tile_idx = int(parts[1]) - 1
        except ValueError:
            return False

        if tile_idx < 0 or tile_idx >= len(self.neighborhood):
            print("  Invalid tile.")
            input("  Press Enter...")
            return False

        tile = self.neighborhood[tile_idx]
        if tile["claimed_by"] == p:
            print("  Already claimed by you!")
            input("  Press Enter...")
            return False

        power = self._marketing_power(p)
        if power <= 0:
            print("  No marketing power! Hire a Marketer first.")
            input("  Press Enter...")
            return False

        # Can steal from opponent if more marketing power
        opp = 1 - p
        if tile["claimed_by"] == opp:
            opp_power = self._marketing_power(opp)
            if power <= opp_power:
                print(f"  Opponent's marketing power ({opp_power}) blocks you ({power})!")
                input("  Press Enter...")
                return False

        tile["claimed_by"] = p
        return True

    def _do_serve(self, p, parts):
        if len(parts) < 3:
            print("  Usage: serve <tile#> <food>")
            input("  Press Enter...")
            return False
        try:
            tile_idx = int(parts[1]) - 1
        except ValueError:
            return False

        food = parts[2].title()
        if tile_idx < 0 or tile_idx >= len(self.neighborhood):
            print("  Invalid tile.")
            input("  Press Enter...")
            return False

        tile = self.neighborhood[tile_idx]
        if tile["claimed_by"] != p:
            print("  You haven't marketed to this tile!")
            input("  Press Enter...")
            return False
        if tile["customers"] <= 0:
            print("  No customers left at this tile!")
            input("  Press Enter...")
            return False
        if food not in self.player_food[p]:
            print(f"  You don't have {food} ready!")
            input("  Press Enter...")
            return False
        if tile["demand"] != food:
            print(f"  This tile wants {tile['demand']}, not {food}!")
            input("  Press Enter...")
            return False

        serve_cap = self._serve_capacity(p)
        if serve_cap <= 0:
            print("  No serving capacity! Hire a Waitress.")
            input("  Press Enter...")
            return False

        # Serve one customer
        self.player_food[p].remove(food)
        tile["customers"] -= 1
        price = self._food_price(p, food)
        self.player_money[p] += price
        self.player_revenue[p] += price
        print(f"  Served {food} for ${price}!")
        input("  Press Enter...")
        return True

    def _refresh_neighborhood(self):
        """Refresh neighborhood tiles with empty demand."""
        for tile in self.neighborhood:
            if tile["customers"] <= 0:
                tile["demand"] = random.choice(FOOD_LIST)
                tile["customers"] = random.randint(1, 3)
                tile["claimed_by"] = None

    def check_game_over(self):
        # Game ends after max_turns complete rounds
        # Each player gets one turn per round, so max_turns * 2 total turns
        if self.turn_number >= self.max_turns * 2:
            self.game_over = True
            if self.player_money[0] > self.player_money[1]:
                self.winner = 1
            elif self.player_money[1] > self.player_money[0]:
                self.winner = 2
            else:
                self.winner = None  # Draw

    def get_state(self):
        return {
            "max_turns": self.max_turns,
            "player_money": self.player_money[:],
            "player_staff": copy.deepcopy(self.player_staff),
            "player_food": copy.deepcopy(self.player_food),
            "player_customers": self.player_customers[:],
            "player_revenue": self.player_revenue[:],
            "neighborhood": copy.deepcopy(self.neighborhood),
            "round_phase": self.round_phase,
            "food_produced_this_turn": copy.deepcopy(self.food_produced_this_turn),
        }

    def load_state(self, state):
        self.max_turns = state["max_turns"]
        self.player_money = state["player_money"]
        self.player_staff = state["player_staff"]
        self.player_food = state["player_food"]
        self.player_customers = state["player_customers"]
        self.player_revenue = state["player_revenue"]
        self.neighborhood = state["neighborhood"]
        self.round_phase = state["round_phase"]
        self.food_produced_this_turn = state["food_produced_this_turn"]

    def get_tutorial(self):
        return """
====================================================
  FOOD CHAIN - Tutorial
====================================================

OVERVIEW:
  You run a fast-food restaurant! Hire staff, cook
  food, market to neighborhoods, and serve customers.
  The player with the most money wins!

TURN PHASES (in order):
  1. HIRE - Hire new staff or train existing staff
  2. COOK - Use Chefs to prepare food items
  3. MARKET - Claim neighborhood tiles for customers
  4. SERVE - Serve food to customers for revenue

STAFF ROLES:
  Chef ($8)            - Cooks 1 food/turn (2 if Senior)
  Waitress ($6)        - Serves 1 customer/turn (2 if Senior)
  Marketer ($7)        - 1 marketing power (2 if Senior)
  Recruiter ($5)       - Reduces hire costs by $2 each
  Trainer ($5)         - Allows promoting staff to Senior ($5)
  Pricing Manager ($10)- Increases food prices by $3 ($5 if Senior)

FOOD:
  Pizza ($10)    - Needs $3 ingredients
  Burger ($8)    - Needs $3 ingredients
  Soda ($5)      - Free to make
  Lemonade ($4)  - Free to make

STRATEGY TIPS:
  - Balance hiring with earning; staff costs add up
  - Senior staff are very efficient
  - Pricing Managers multiply your revenue
  - Market aggressively to block opponents
====================================================
"""
