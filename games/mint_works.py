"""Mint Works - A tiny worker-placement game with mint tokens."""

import random
from engine.base import BaseGame, input_with_quit, clear_screen

BOLD = "\033[1m"
DIM = "\033[2m"
RESET = "\033[0m"
GREEN = "\033[92m"
BLUE = "\033[94m"
YELLOW = "\033[93m"
RED = "\033[91m"
CYAN = "\033[96m"
MAGENTA = "\033[95m"

# Plan cards (buildings you can buy and build)
PLAN_CARDS = [
    # name, buy_cost, build_cost, stars, bonus_type, bonus_desc
    {"name": "Lotto Stand", "buy_cost": 2, "build_cost": 1, "stars": 1,
     "bonus": "lotto", "desc": "When built: Gain 2 mints at round start"},
    {"name": "Bridge", "buy_cost": 3, "build_cost": 2, "stars": 2,
     "bonus": "mints", "bonus_val": 1, "desc": "When built: +1 mint income"},
    {"name": "Gardens", "buy_cost": 2, "build_cost": 2, "stars": 2,
     "bonus": None, "desc": "Pure victory points"},
    {"name": "Assembly Hall", "buy_cost": 4, "build_cost": 2, "stars": 3,
     "bonus": "mints", "bonus_val": 2, "desc": "When built: +2 mint income"},
    {"name": "Statue", "buy_cost": 3, "build_cost": 3, "stars": 3,
     "bonus": None, "desc": "Pure victory points"},
    {"name": "Windmill", "buy_cost": 2, "build_cost": 1, "stars": 1,
     "bonus": "supplier_discount", "desc": "When built: Plans cost 1 less to buy"},
    {"name": "Crane", "buy_cost": 2, "build_cost": 1, "stars": 1,
     "bonus": "builder_discount", "desc": "When built: Plans cost 1 less to build"},
    {"name": "Well", "buy_cost": 1, "build_cost": 1, "stars": 1,
     "bonus": "mints", "bonus_val": 1, "desc": "When built: +1 mint income"},
    {"name": "Obelisk", "buy_cost": 5, "build_cost": 3, "stars": 4,
     "bonus": None, "desc": "Expensive but high stars"},
    {"name": "Market", "buy_cost": 3, "build_cost": 2, "stars": 2,
     "bonus": "draw", "desc": "When built: See 1 extra plan at Supplier"},
    {"name": "Tavern", "buy_cost": 2, "build_cost": 2, "stars": 1,
     "bonus": "lotto", "desc": "When built: Gain 2 mints at round start"},
    {"name": "Tower", "buy_cost": 4, "build_cost": 3, "stars": 3,
     "bonus": "mints", "bonus_val": 1, "desc": "When built: +1 mint income"},
    {"name": "Chapel", "buy_cost": 3, "build_cost": 2, "stars": 2,
     "bonus": None, "desc": "Pure victory points"},
    {"name": "Fountain", "buy_cost": 2, "build_cost": 1, "stars": 1,
     "bonus": "mints", "bonus_val": 1, "desc": "When built: +1 mint income"},
    {"name": "Workshop", "buy_cost": 3, "build_cost": 1, "stars": 2,
     "bonus": "builder_discount", "desc": "When built: Plans cost 1 less to build"},
    {"name": "Warehouse", "buy_cost": 2, "build_cost": 2, "stars": 1,
     "bonus": "hold", "desc": "When built: Keep 2 extra mints between rounds"},
]

# Locations where workers can be placed
LOCATIONS = [
    {"name": "Supplier", "cost": 1, "desc": "Buy a plan card",
     "slots": 2},
    {"name": "Builder", "cost": 2, "desc": "Build a plan you own",
     "slots": 2},
    {"name": "Wholesaler", "cost": 1, "desc": "Gain 2 mints",
     "slots": 2},
    {"name": "Lotto", "cost": 3, "desc": "Gain 5 mints (gamble!)",
     "slots": 1},
    {"name": "Leadership", "cost": 1, "desc": "Take first player marker",
     "slots": 1},
]


class MintWorksGame(BaseGame):
    """Mint Works - Tiny worker-placement game."""

    name = "Mint Works"
    description = "Place mint tokens as workers to buy and build plans for victory stars"
    min_players = 2
    max_players = 2
    variations = {
        "standard": "Standard game - first to 7 stars wins",
        "quick": "Quick game - first to 5 stars wins",
    }

    def __init__(self, variation=None):
        super().__init__(variation)
        self.stars_to_win = 7 if self.variation != "quick" else 5
        self.mints = {1: 0, 2: 0}
        self.plans_hand = {1: [], 2: []}  # Bought but not built
        self.buildings = {1: [], 2: []}  # Built plans
        self.stars = {1: 0, 2: 0}
        self.plan_deck = []
        self.plan_display = []  # Plans available at Supplier
        self.locations = []  # Worker placement slots
        self.first_player = 1
        self.round_num = 1
        self.passed = {1: False, 2: False}
        self.log = []

    def setup(self):
        """Initialize the game."""
        # Build plan deck
        self.plan_deck = [dict(c) for c in PLAN_CARDS]
        random.shuffle(self.plan_deck)

        # Display 3 plans at supplier
        self.plan_display = []
        for _ in range(3):
            if self.plan_deck:
                self.plan_display.append(self.plan_deck.pop())

        # Starting mints
        self.mints = {1: 3, 2: 3}
        self.plans_hand = {1: [], 2: []}
        self.buildings = {1: [], 2: []}
        self.stars = {1: 0, 2: 0}
        self.first_player = 1
        self.current_player = 1
        self.round_num = 1
        self.passed = {1: False, 2: False}
        self.log = []

        # Initialize location slots
        self._reset_locations()

    def _reset_locations(self):
        """Reset location worker slots for a new round."""
        self.locations = []
        for loc in LOCATIONS:
            self.locations.append({
                "name": loc["name"],
                "cost": loc["cost"],
                "desc": loc["desc"],
                "max_slots": loc["slots"],
                "workers": [],  # List of player numbers who placed here
            })

    def _get_income(self, player):
        """Calculate mint income for a player."""
        base = 3
        for bld in self.buildings[player]:
            if bld.get("bonus") == "mints":
                base += bld.get("bonus_val", 1)
            elif bld.get("bonus") == "lotto":
                base += 2
        return base

    def _get_supplier_discount(self, player):
        """Check if player has a supplier discount building."""
        for bld in self.buildings[player]:
            if bld.get("bonus") == "supplier_discount":
                return 1
        return 0

    def _get_builder_discount(self, player):
        """Check if player has a builder discount building."""
        for bld in self.buildings[player]:
            if bld.get("bonus") == "builder_discount":
                return 1
        return 0

    def _get_hold_bonus(self, player):
        """Check if player keeps extra mints between rounds."""
        bonus = 0
        for bld in self.buildings[player]:
            if bld.get("bonus") == "hold":
                bonus += 2
        return bonus

    def _new_round(self):
        """Start a new round: income, refill supplier, reset locations."""
        self.round_num += 1

        # Income phase
        for p in [1, 2]:
            income = self._get_income(p)
            self.mints[p] += income
            # Cap mints (keep up to 7 + hold bonus)
            max_mints = 7 + self._get_hold_bonus(p)
            self.mints[p] = min(self.mints[p], max_mints)

        # Refill supplier display
        while len(self.plan_display) < 3 and self.plan_deck:
            self.plan_display.append(self.plan_deck.pop())

        # Reset locations
        self._reset_locations()
        self.passed = {1: False, 2: False}

        # First player goes first
        self.current_player = self.first_player
        self.log.append(f"=== Round {self.round_num} begins! ===")

    def display(self):
        """Display the game state."""
        clear_screen()
        p = self.current_player

        print(f"{BOLD}=== MINT WORKS ==={RESET}")
        print(f"Round {self.round_num} | "
              f"Stars to win: {self.stars_to_win} | "
              f"Plans in deck: {len(self.plan_deck)}")
        print()

        # Player summaries
        for pl in [1, 2]:
            marker = " <<<" if pl == p else ""
            fp = " [1st]" if pl == self.first_player else ""
            star_display = "*" * self.stars[pl]
            print(f"  {self.players[pl - 1]}{fp}: "
                  f"{YELLOW}{self.mints[pl]} mints{RESET} | "
                  f"{GREEN}{star_display} ({self.stars[pl]} stars){RESET} | "
                  f"Plans: {len(self.plans_hand[pl])} | "
                  f"Buildings: {len(self.buildings[pl])}{marker}")
        print()

        # Locations
        print(f"{BOLD}--- Locations ---{RESET}")
        for i, loc in enumerate(self.locations):
            slots_used = len(loc["workers"])
            slots_left = loc["max_slots"] - slots_used
            slot_display = ""
            for w in loc["workers"]:
                slot_display += f"[P{w}]"
            for _ in range(slots_left):
                slot_display += "[ ]"

            available = (slots_left > 0 and self.mints[p] >= loc["cost"]
                         and not self.passed[p])
            avail_mark = f" {GREEN}<< available{RESET}" if available else ""

            print(f"  [{i + 1}] {CYAN}{loc['name']}{RESET} "
                  f"(Cost: {loc['cost']} mints) {slot_display} "
                  f"- {loc['desc']}{avail_mark}")
        print()

        # Supplier display
        print(f"{BOLD}--- Plans at Supplier ---{RESET}")
        if self.plan_display:
            for i, plan in enumerate(self.plan_display):
                discount = self._get_supplier_discount(p)
                actual_cost = max(1, plan["buy_cost"] - discount)
                disc_str = f" (discounted from {plan['buy_cost']})" if discount else ""
                print(f"  [{i + 1}] {MAGENTA}{plan['name']}{RESET} "
                      f"- Buy: {actual_cost} mints{disc_str}, "
                      f"Build: {plan['build_cost']} mints, "
                      f"Stars: {'*' * plan['stars']} ({plan['stars']})")
                print(f"        {DIM}{plan['desc']}{RESET}")
        else:
            print(f"  {DIM}(No plans available){RESET}")
        print()

        # Current player's plans in hand
        if self.plans_hand[p]:
            print(f"{BOLD}--- Your Plans (bought, not built) ---{RESET}")
            for i, plan in enumerate(self.plans_hand[p]):
                discount = self._get_builder_discount(p)
                actual_cost = max(1, plan["build_cost"] - discount)
                disc_str = f" (discounted from {plan['build_cost']})" if discount else ""
                print(f"  [{i + 1}] {MAGENTA}{plan['name']}{RESET} "
                      f"- Build cost: {actual_cost}{disc_str}, "
                      f"Stars: {plan['stars']}")

        # Current player's buildings
        if self.buildings[p]:
            print(f"{BOLD}--- Your Buildings ---{RESET}")
            for bld in self.buildings[p]:
                print(f"  {GREEN}{bld['name']}{RESET} "
                      f"({'*' * bld['stars']}) {DIM}{bld['desc']}{RESET}")
        print()

        if self.log:
            print(f"{DIM}Last: {self.log[-1]}{RESET}")

    def get_move(self):
        """Get player's action."""
        p = self.current_player

        if self.passed[p]:
            return ("pass",)

        print("Choose action:")
        print("  [1-5] Place worker at a location")
        print("  [P] Pass (done for this round)")
        choice = input_with_quit("Your choice: ").strip().upper()

        if choice == "P":
            return ("pass",)

        try:
            loc_idx = int(choice) - 1
            if loc_idx < 0 or loc_idx >= len(self.locations):
                return ("invalid",)
        except ValueError:
            return ("invalid",)

        loc = self.locations[loc_idx]

        if loc["name"] == "Supplier":
            if not self.plan_display:
                print("No plans available!")
                input_with_quit("Press Enter...")
                return ("invalid",)
            plan_choice = input_with_quit(
                f"Which plan to buy (1-{len(self.plan_display)}): ").strip()
            return ("supplier", loc_idx, plan_choice)

        elif loc["name"] == "Builder":
            if not self.plans_hand[p]:
                print("No plans in hand to build!")
                input_with_quit("Press Enter...")
                return ("invalid",)
            plan_choice = input_with_quit(
                f"Which plan to build (1-{len(self.plans_hand[p])}): ").strip()
            return ("builder", loc_idx, plan_choice)

        else:
            return ("location", loc_idx)

    def make_move(self, move):
        """Process a move."""
        p = self.current_player

        if move[0] == "invalid":
            return False

        if move[0] == "pass":
            self.passed[p] = True
            self.log.append(f"{self.players[p - 1]} passed")

            # Check if both passed - start new round
            opp = 2 if p == 1 else 1
            if self.passed[opp]:
                self._new_round()
                return True
            return True

        if move[0] == "supplier":
            loc_idx = move[1]
            loc = self.locations[loc_idx]

            # Check slot available
            if len(loc["workers"]) >= loc["max_slots"]:
                self.log.append("No slots available at Supplier!")
                return False

            # Check cost
            if self.mints[p] < loc["cost"]:
                self.log.append("Not enough mints!")
                return False

            try:
                plan_idx = int(move[2]) - 1
            except (ValueError, IndexError):
                return False

            if plan_idx < 0 or plan_idx >= len(self.plan_display):
                return False

            plan = self.plan_display[plan_idx]
            discount = self._get_supplier_discount(p)
            actual_buy_cost = max(1, plan["buy_cost"] - discount)
            total_cost = loc["cost"] + actual_buy_cost

            if self.mints[p] < total_cost:
                self.log.append(
                    f"Not enough mints! Need {total_cost} "
                    f"({loc['cost']} placement + {actual_buy_cost} buy)")
                return False

            # Buy plan
            self.mints[p] -= total_cost
            loc["workers"].append(p)
            bought = self.plan_display.pop(plan_idx)
            self.plans_hand[p].append(bought)

            # Refill supplier
            if self.plan_deck:
                self.plan_display.append(self.plan_deck.pop())

            self.log.append(
                f"{self.players[p - 1]} bought {bought['name']} "
                f"for {total_cost} mints")
            return True

        elif move[0] == "builder":
            loc_idx = move[1]
            loc = self.locations[loc_idx]

            if len(loc["workers"]) >= loc["max_slots"]:
                self.log.append("No slots available at Builder!")
                return False

            if self.mints[p] < loc["cost"]:
                self.log.append("Not enough mints!")
                return False

            try:
                plan_idx = int(move[2]) - 1
            except (ValueError, IndexError):
                return False

            if plan_idx < 0 or plan_idx >= len(self.plans_hand[p]):
                return False

            plan = self.plans_hand[p][plan_idx]
            discount = self._get_builder_discount(p)
            actual_build_cost = max(1, plan["build_cost"] - discount)
            total_cost = loc["cost"] + actual_build_cost

            if self.mints[p] < total_cost:
                self.log.append(
                    f"Not enough mints! Need {total_cost} "
                    f"({loc['cost']} placement + {actual_build_cost} build)")
                return False

            # Build plan
            self.mints[p] -= total_cost
            loc["workers"].append(p)
            built = self.plans_hand[p].pop(plan_idx)
            self.buildings[p].append(built)
            self.stars[p] += built["stars"]

            self.log.append(
                f"{self.players[p - 1]} built {built['name']}! "
                f"(+{built['stars']} stars, total: {self.stars[p]})")
            return True

        elif move[0] == "location":
            loc_idx = move[1]
            loc = self.locations[loc_idx]

            if len(loc["workers"]) >= loc["max_slots"]:
                self.log.append(f"No slots available at {loc['name']}!")
                return False

            if self.mints[p] < loc["cost"]:
                self.log.append("Not enough mints!")
                return False

            self.mints[p] -= loc["cost"]
            loc["workers"].append(p)

            if loc["name"] == "Wholesaler":
                self.mints[p] += 2
                self.log.append(
                    f"{self.players[p - 1]} used Wholesaler "
                    f"(gained 2 mints)")

            elif loc["name"] == "Lotto":
                # Gamble: 60% chance of 5 mints, 40% chance of 0
                if random.random() < 0.6:
                    self.mints[p] += 5
                    self.log.append(
                        f"{self.players[p - 1]} won the Lotto! "
                        f"(+5 mints)")
                else:
                    self.log.append(
                        f"{self.players[p - 1]} lost at the Lotto!")

            elif loc["name"] == "Leadership":
                self.first_player = p
                self.log.append(
                    f"{self.players[p - 1]} took the Leadership marker")

            return True

        return False

    def check_game_over(self):
        """Check if someone has enough stars."""
        for player in [1, 2]:
            if self.stars[player] >= self.stars_to_win:
                self.game_over = True
                if self.stars[1] > self.stars[2]:
                    self.winner = 1
                elif self.stars[2] > self.stars[1]:
                    self.winner = 2
                else:
                    # Tiebreak by mints
                    if self.mints[1] > self.mints[2]:
                        self.winner = 1
                    elif self.mints[2] > self.mints[1]:
                        self.winner = 2
                    else:
                        self.winner = None
                return

        # If deck and display are empty, game ends by exhaustion
        if not self.plan_deck and not self.plan_display:
            if not self.plans_hand[1] and not self.plans_hand[2]:
                self.game_over = True
                if self.stars[1] > self.stars[2]:
                    self.winner = 1
                elif self.stars[2] > self.stars[1]:
                    self.winner = 2
                else:
                    self.winner = None

    def get_state(self):
        """Return serializable game state."""
        # Convert locations workers lists (already JSON-safe)
        return {
            "mints": {"1": self.mints[1], "2": self.mints[2]},
            "plans_hand": {"1": self.plans_hand[1], "2": self.plans_hand[2]},
            "buildings": {"1": self.buildings[1], "2": self.buildings[2]},
            "stars": {"1": self.stars[1], "2": self.stars[2]},
            "plan_deck": self.plan_deck,
            "plan_display": self.plan_display,
            "locations": self.locations,
            "first_player": self.first_player,
            "round_num": self.round_num,
            "passed": {"1": self.passed[1], "2": self.passed[2]},
            "log": self.log,
            "stars_to_win": self.stars_to_win,
        }

    def load_state(self, state):
        """Restore game state."""
        self.mints = {1: state["mints"]["1"], 2: state["mints"]["2"]}
        self.plans_hand = {1: state["plans_hand"]["1"],
                           2: state["plans_hand"]["2"]}
        self.buildings = {1: state["buildings"]["1"],
                          2: state["buildings"]["2"]}
        self.stars = {1: state["stars"]["1"], 2: state["stars"]["2"]}
        self.plan_deck = state["plan_deck"]
        self.plan_display = state["plan_display"]
        self.locations = state["locations"]
        self.first_player = state["first_player"]
        self.round_num = state["round_num"]
        self.passed = {1: state["passed"]["1"], 2: state["passed"]["2"]}
        self.log = state.get("log", [])
        self.stars_to_win = state.get("stars_to_win", 7)

    def get_tutorial(self):
        """Return tutorial text."""
        return f"""{BOLD}=== MINT WORKS - Tutorial ==={RESET}

Mint Works is a tiny worker-placement game where your workers
are mint tokens! Buy and build plans to earn victory stars.

{BOLD}GOAL:{RESET}
  First player to {self.stars_to_win} victory stars wins!

{BOLD}LOCATIONS:{RESET}
  {CYAN}Supplier{RESET}   (1 mint) - Buy a plan card from the display
  {CYAN}Builder{RESET}    (2 mints) - Build a plan you own
  {CYAN}Wholesaler{RESET} (1 mint) - Gain 2 mints
  {CYAN}Lotto{RESET}      (3 mints) - 60% chance to gain 5 mints!
  {CYAN}Leadership{RESET} (1 mint) - Take the first player marker

{BOLD}HOW PLANS WORK:{RESET}
  1. Buy a plan from the Supplier (placement cost + buy cost)
  2. Build it at the Builder (placement cost + build cost)
  3. Built plans become buildings that give stars + bonuses!

{BOLD}BUILDING BONUSES:{RESET}
  Some buildings give ongoing benefits:
  - Extra mint income each round
  - Discounts on buying or building
  - Extra mints to keep between rounds

{BOLD}ROUND STRUCTURE:{RESET}
  - Players alternate placing 1 worker at a time
  - When a player can't or won't act, they pass
  - When both pass, the round ends
  - Each round: gain income, refill supplier, reset locations

{BOLD}COSTS:{RESET}
  Placing at a location costs mints PLUS any additional costs.
  Example: Supplier costs 1 mint to place + the plan's buy cost.

{BOLD}STRATEGY:{RESET}
  - Buy cheap plans early for income bonuses
  - Discount buildings (Windmill, Crane) save mints over time
  - Balance between buying new plans and building existing ones
  - Leadership is key - going first lets you grab limited slots
  - The Lotto is risky but can pay off big!

Type 'q' to quit, 's' to save, 'h' for help during play.
"""
