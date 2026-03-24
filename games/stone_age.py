"""Stone Age - Worker placement with dice rolling for resource gathering."""

import random
from engine.base import BaseGame, input_with_quit, clear_screen

RESOURCE_NAMES = {"wood": "Wood", "brick": "Brick", "stone": "Stone", "gold": "Gold", "food": "Food"}
RESOURCE_VALUES = {"wood": 3, "brick": 4, "stone": 5, "gold": 6}

# Hut definitions: (name, cost_dict, points)
HUT_CARDS = [
    {"name": "Wooden Hut", "cost": {"wood": 3}, "points": 6},
    {"name": "Clay Hut", "cost": {"brick": 3}, "points": 8},
    {"name": "Stone House", "cost": {"stone": 2, "wood": 1}, "points": 10},
    {"name": "Grand Manor", "cost": {"stone": 2, "brick": 2}, "points": 14},
    {"name": "Gold Lodge", "cost": {"gold": 2}, "points": 16},
    {"name": "Mixed Cottage", "cost": {"wood": 1, "brick": 1, "stone": 1}, "points": 10},
    {"name": "Brick Manor", "cost": {"brick": 2, "wood": 2}, "points": 11},
    {"name": "Timber Hall", "cost": {"wood": 4}, "points": 9},
    {"name": "Granite Fort", "cost": {"stone": 3}, "points": 14},
    {"name": "Gilded Palace", "cost": {"gold": 2, "stone": 1}, "points": 20},
    {"name": "Trading Post", "cost": {"wood": 2, "brick": 1}, "points": 8},
    {"name": "Workshop", "cost": {"brick": 1, "stone": 1}, "points": 7},
]

# Civilization cards: (name, type, value)
CIV_CARDS = [
    {"name": "Pottery", "type": "tech", "value": 1},
    {"name": "Weaving", "type": "tech", "value": 1},
    {"name": "Medicine", "type": "tech", "value": 2},
    {"name": "Writing", "type": "tech", "value": 2},
    {"name": "Architecture", "type": "tech", "value": 3},
    {"name": "Agriculture", "type": "food_bonus", "value": 3},
    {"name": "Animal Husbandry", "type": "food_bonus", "value": 5},
    {"name": "Music", "type": "points", "value": 6},
    {"name": "Art", "type": "points", "value": 8},
    {"name": "Astronomy", "type": "tech", "value": 3},
    {"name": "Masonry", "type": "resource_bonus", "value": 2},
    {"name": "Irrigation", "type": "food_bonus", "value": 4},
]

EXTRA_CIV_CARDS = [
    {"name": "Philosophy", "type": "tech", "value": 3},
    {"name": "Metallurgy", "type": "resource_bonus", "value": 3},
    {"name": "Navigation", "type": "points", "value": 10},
    {"name": "Calendar", "type": "tech", "value": 2},
]

LOCATIONS = ["forest", "quarry", "river", "mine", "hunt", "farm", "hut", "breed", "tool", "civ"]


class StoneAgeGame(BaseGame):
    """Stone Age: Place workers, roll dice, gather resources, build civilization."""

    name = "Stone Age"
    description = "Worker placement with dice rolling - gather resources and build huts"
    min_players = 2
    max_players = 2
    variations = {
        "standard": "Classic Stone Age gameplay",
        "anniversary": "Extra civilization cards and bonus scoring",
    }

    def __init__(self, variation=None):
        super().__init__(variation)
        self.workers = [5, 5]
        self.workers_available = [5, 5]
        self.food = [12, 12]
        self.resources = [{"wood": 0, "brick": 0, "stone": 0, "gold": 0},
                          {"wood": 0, "brick": 0, "stone": 0, "gold": 0}]
        self.tools = [[0, 0, 0], [0, 0, 0]]  # 3 tool slots per player
        self.tools_used = [[False, False, False], [False, False, False]]
        self.score = [0, 0]
        self.huts_built = [[], []]
        self.civ_cards = [[], []]
        self.placements = [{}, {}]  # location -> worker count
        self.phase = "place"  # place, resolve, feed
        self.hut_display = []
        self.civ_display = []
        self.hut_deck = []
        self.civ_deck = []
        self.round_number = 0
        self.location_taken = {}  # farm/breed/tool can only be taken by one player
        self.food_production = [0, 0]

    def setup(self):
        """Initialize game: shuffle huts, civilization cards, display."""
        self.hut_deck = [dict(h) for h in HUT_CARDS]
        random.shuffle(self.hut_deck)
        self.hut_display = [self.hut_deck.pop() for _ in range(4) if self.hut_deck]

        cards = [dict(c) for c in CIV_CARDS]
        if self.variation == "anniversary":
            cards.extend([dict(c) for c in EXTRA_CIV_CARDS])
        random.shuffle(cards)
        self.civ_deck = cards
        self.civ_display = [self.civ_deck.pop() for _ in range(4) if self.civ_deck]

        self.round_number = 1
        self.phase = "place"
        self.location_taken = {}

    def _roll_dice(self, count):
        """Roll count dice, return list of values."""
        return [random.randint(1, 6) for _ in range(count)]

    def _resource_for_location(self, loc):
        """Map location to resource type."""
        return {"forest": "wood", "quarry": "brick", "river": "stone", "mine": "gold"}.get(loc)

    def _divisor_for_resource(self, res):
        """Get divisor for resource gathering."""
        return RESOURCE_VALUES.get(res, 3)

    def display(self):
        """Display the game board."""
        print(f"\n{'='*60}")
        print(f"  STONE AGE  (Round {self.round_number}, Phase: {self.phase.upper()})")
        print(f"{'='*60}")

        # Resource locations
        print(f"\n  --- GATHERING LOCATIONS ---")
        for loc in ["forest", "quarry", "river", "mine"]:
            res = self._resource_for_location(loc)
            div = self._divisor_for_resource(res)
            workers = []
            for pi in range(2):
                cnt = self.placements[pi].get(loc, 0)
                if cnt > 0:
                    workers.append(f"P{pi+1}:{cnt}")
            w_str = f" [{', '.join(workers)}]" if workers else ""
            print(f"    {loc.capitalize():12s} -> {res.capitalize():6s} (dice/{div}){w_str}")

        # Special locations
        print(f"\n  --- SPECIAL LOCATIONS ---")
        for loc, desc in [("hunt", "Food (dice/2)"), ("farm", "+1 food track"),
                          ("breed", "+1 worker"), ("tool", "+1 tool level"),
                          ("hut", "Build a hut"), ("civ", "Buy civ card")]:
            workers = []
            for pi in range(2):
                cnt = self.placements[pi].get(loc, 0)
                if cnt > 0:
                    workers.append(f"P{pi+1}:{cnt}")
            w_str = f" [{', '.join(workers)}]" if workers else ""
            taken_str = ""
            if loc in ("farm", "breed", "tool") and loc in self.location_taken:
                taken_str = f" (taken by P{self.location_taken[loc]+1})"
            print(f"    {loc.capitalize():12s} - {desc}{w_str}{taken_str}")

        # Hut display
        print(f"\n  --- HUTS AVAILABLE ---")
        for j, hut in enumerate(self.hut_display):
            cost_str = ", ".join(f"{v} {k}" for k, v in hut["cost"].items())
            print(f"    {j+1}. {hut['name']} ({cost_str}) -> {hut['points']} pts")

        # Civ card display
        print(f"\n  --- CIVILIZATION CARDS ---")
        for j, civ in enumerate(self.civ_display):
            print(f"    {j+1}. {civ['name']} ({civ['type']}: +{civ['value']})")

        # Player stats
        print(f"\n  --- PLAYER STATUS ---")
        for pi in range(2):
            tool_str = "/".join(str(t) for t in self.tools[pi])
            res_str = " ".join(f"{k[0].upper()}:{v}" for k, v in self.resources[pi].items())
            print(f"  P{pi+1}: Score:{self.score[pi]} Workers:{self.workers_available[pi]}/{self.workers[pi]} "
                  f"Food:{self.food[pi]}(+{self.food_production[pi]}) Tools:[{tool_str}]")
            print(f"       Resources: {res_str}")
            if self.huts_built[pi]:
                print(f"       Huts: {', '.join(h['name'] for h in self.huts_built[pi])}")
            if self.civ_cards[pi]:
                print(f"       Civs: {', '.join(c['name'] for c in self.civ_cards[pi])}")
        print(f"{'='*60}")

    def get_move(self):
        """Get player action based on current phase."""
        pi = self.current_player - 1
        print(f"\n  {self.players[self.current_player-1]}'s turn ({self.phase} phase):")
        if self.phase == "place":
            print("  Commands: place <location> <#workers> | done")
            print(f"  Locations: forest, quarry, river, mine, hunt, farm, breed, tool, hut, civ")
        elif self.phase == "resolve":
            print("  Commands: resolve <location> [+tool#] | build <hut#> | buycard <card#> | done")
        elif self.phase == "feed":
            print("  Commands: feed | starve <resource>")
        return input_with_quit("  > ").strip().lower()

    def make_move(self, move):
        """Process player action."""
        pi = self.current_player - 1
        parts = move.split()
        if not parts:
            return False
        cmd = parts[0]

        if self.phase == "place":
            if cmd == "place" and len(parts) >= 3:
                loc = parts[1]
                try:
                    count = int(parts[2])
                except ValueError:
                    return False
                if loc not in LOCATIONS or count < 1:
                    return False
                if count > self.workers_available[pi]:
                    print(f"  Only {self.workers_available[pi]} workers available!")
                    return False
                # Single-worker locations
                if loc in ("farm", "breed", "tool"):
                    if loc in self.location_taken:
                        print(f"  {loc.capitalize()} already taken!")
                        return False
                    count = 1
                    self.location_taken[loc] = pi
                if loc in ("hut", "civ"):
                    count = 1  # one worker to claim
                self.placements[pi][loc] = self.placements[pi].get(loc, 0) + count
                self.workers_available[pi] -= count
                return True
            elif cmd == "done":
                if self.workers_available[pi] > 0:
                    print("  Must place all workers first! (or place remaining)")
                self.phase = "resolve"
                return True

        elif self.phase == "resolve":
            if cmd == "resolve" and len(parts) >= 2:
                loc = parts[1]
                placed = self.placements[pi].get(loc, 0)
                if placed == 0:
                    print(f"  No workers at {loc}!")
                    return False
                # Gather resources
                res = self._resource_for_location(loc)
                if res:
                    dice = self._roll_dice(placed)
                    total = sum(dice)
                    # Apply tool
                    if len(parts) >= 3:
                        try:
                            tidx = int(parts[2]) - 1
                            if 0 <= tidx < 3 and not self.tools_used[pi][tidx]:
                                total += self.tools[pi][tidx]
                                self.tools_used[pi][tidx] = True
                        except ValueError:
                            pass
                    gained = total // self._divisor_for_resource(res)
                    self.resources[pi][res] += gained
                    print(f"  Rolled {dice} = {total}, gained {gained} {res}")
                    input("  Press Enter to continue...")
                elif loc == "hunt":
                    dice = self._roll_dice(placed)
                    total = sum(dice)
                    gained = total // 2
                    self.food[pi] += gained
                    print(f"  Rolled {dice} = {total}, gained {gained} food")
                    input("  Press Enter to continue...")
                elif loc == "farm":
                    self.food_production[pi] += 1
                    print(f"  Food production increased to {self.food_production[pi]}!")
                    input("  Press Enter to continue...")
                elif loc == "breed":
                    if self.workers[pi] < 10:
                        self.workers[pi] += 1
                        print(f"  New worker! Total: {self.workers[pi]}")
                    else:
                        print("  Max workers reached!")
                    input("  Press Enter to continue...")
                elif loc == "tool":
                    upgraded = False
                    for i in range(3):
                        if self.tools[pi][i] < 4:
                            self.tools[pi][i] += 1
                            print(f"  Tool {i+1} upgraded to level {self.tools[pi][i]}!")
                            upgraded = True
                            break
                    if not upgraded:
                        print("  All tools at max level!")
                    input("  Press Enter to continue...")
                else:
                    return False
                del self.placements[pi][loc]
                return True

            elif cmd == "build" and len(parts) == 2:
                if self.placements[pi].get("hut", 0) == 0:
                    print("  No worker at hut location!")
                    return False
                try:
                    idx = int(parts[1]) - 1
                except ValueError:
                    return False
                if idx < 0 or idx >= len(self.hut_display):
                    return False
                hut = self.hut_display[idx]
                # Check resources
                for res, needed in hut["cost"].items():
                    if self.resources[pi].get(res, 0) < needed:
                        print(f"  Not enough {res}! Need {needed}, have {self.resources[pi].get(res, 0)}")
                        return False
                for res, needed in hut["cost"].items():
                    self.resources[pi][res] -= needed
                self.score[pi] += hut["points"]
                self.huts_built[pi].append(hut)
                self.hut_display.pop(idx)
                if self.hut_deck:
                    self.hut_display.append(self.hut_deck.pop())
                if "hut" in self.placements[pi]:
                    del self.placements[pi]["hut"]
                return True

            elif cmd == "buycard" and len(parts) == 2:
                if self.placements[pi].get("civ", 0) == 0:
                    print("  No worker at civ location!")
                    return False
                try:
                    idx = int(parts[1]) - 1
                except ValueError:
                    return False
                if idx < 0 or idx >= len(self.civ_display):
                    return False
                card = self.civ_display[idx]
                # Civ cards cost 1 resource of any type per card position
                cost = idx + 1
                total_res = sum(self.resources[pi].values())
                if total_res < cost:
                    print(f"  Need {cost} total resources to buy card at position {idx+1}!")
                    return False
                # Auto-pay cheapest resources
                remaining = cost
                for res in ["wood", "brick", "stone", "gold"]:
                    take = min(remaining, self.resources[pi][res])
                    self.resources[pi][res] -= take
                    remaining -= take
                    if remaining <= 0:
                        break
                self.civ_cards[pi].append(card)
                self.civ_display.pop(idx)
                if self.civ_deck:
                    self.civ_display.append(self.civ_deck.pop())
                if "civ" in self.placements[pi]:
                    del self.placements[pi]["civ"]
                return True

            elif cmd == "done":
                if self.placements[pi]:
                    # Remove unresolved placements
                    self.placements[pi] = {}
                self.phase = "feed"
                return True

        elif self.phase == "feed":
            if cmd == "feed":
                needed = self.workers[pi]
                produced = self.food_production[pi]
                self.food[pi] += produced
                if self.food[pi] >= needed:
                    self.food[pi] -= needed
                    print(f"  Fed {needed} workers. Food remaining: {self.food[pi]}")
                else:
                    deficit = needed - self.food[pi]
                    self.food[pi] = 0
                    self.score[pi] -= deficit * 3
                    print(f"  Not enough food! Lost {deficit*3} points.")
                input("  Press Enter to continue...")
                # Reset for next player or next round
                self.tools_used[pi] = [False, False, False]
                self.workers_available[pi] = self.workers[pi]
                self.phase = "place"
                return True
            elif cmd == "starve" and len(parts) == 2:
                # Pay resource instead of food
                res = parts[1]
                if res in self.resources[pi] and self.resources[pi][res] > 0:
                    self.resources[pi][res] -= 1
                    self.food[pi] += 2
                    print(f"  Traded 1 {res} for 2 food.")
                    return True
                print(f"  No {res} to trade!")
                return False

        return False

    def check_game_over(self):
        """Game ends when hut deck or civ deck runs out."""
        if (not self.hut_deck and len(self.hut_display) == 0) or \
           (not self.civ_deck and len(self.civ_display) == 0) or \
           self.round_number > 15:
            self.game_over = True
            # Final scoring
            for pi in range(2):
                # Civ card bonuses
                tech_count = sum(1 for c in self.civ_cards[pi] if c["type"] == "tech")
                tech_value = sum(c["value"] for c in self.civ_cards[pi] if c["type"] == "tech")
                self.score[pi] += tech_count * tech_value
                for c in self.civ_cards[pi]:
                    if c["type"] == "points":
                        self.score[pi] += c["value"]
                    elif c["type"] == "food_bonus":
                        self.score[pi] += c["value"]
                    elif c["type"] == "resource_bonus":
                        total_res = sum(self.resources[pi].values())
                        self.score[pi] += total_res * c["value"]
                # Leftover resources worth 1 point each
                self.score[pi] += sum(self.resources[pi].values())
            if self.score[0] > self.score[1]:
                self.winner = 1
            elif self.score[1] > self.score[0]:
                self.winner = 2
            else:
                self.winner = None
        # Track round
        if self.current_player == 2 and self.phase == "place":
            self.round_number += 1
            self.location_taken = {}

    def get_state(self):
        """Return serializable game state."""
        return {
            "workers": self.workers, "workers_available": self.workers_available,
            "food": self.food, "resources": self.resources, "tools": self.tools,
            "tools_used": self.tools_used, "score": self.score,
            "huts_built": self.huts_built, "civ_cards": self.civ_cards,
            "placements": self.placements, "phase": self.phase,
            "hut_display": self.hut_display, "civ_display": self.civ_display,
            "hut_deck": self.hut_deck, "civ_deck": self.civ_deck,
            "round_number": self.round_number, "location_taken": self.location_taken,
            "food_production": self.food_production,
        }

    def load_state(self, state):
        """Restore game state."""
        self.workers = state["workers"]
        self.workers_available = state["workers_available"]
        self.food = state["food"]
        self.resources = state["resources"]
        self.tools = state["tools"]
        self.tools_used = state["tools_used"]
        self.score = state["score"]
        self.huts_built = state["huts_built"]
        self.civ_cards = state["civ_cards"]
        self.placements = state["placements"]
        self.phase = state["phase"]
        self.hut_display = state["hut_display"]
        self.civ_display = state["civ_display"]
        self.hut_deck = state["hut_deck"]
        self.civ_deck = state["civ_deck"]
        self.round_number = state["round_number"]
        self.location_taken = state["location_taken"]
        self.food_production = state["food_production"]

    def get_tutorial(self):
        """Return tutorial text."""
        extra = "\n  ANNIVERSARY BONUS: Extra civilization cards in\n  the deck for more strategic variety!" if self.variation == "anniversary" else ""
        return f"""
==================================================
  Stone Age - Tutorial
==================================================

  OVERVIEW:
  Stone Age is a worker placement game set in
  prehistoric times. Place workers to gather
  resources, hunt food, build huts, and advance
  your civilization. Dice determine your yield!
{extra}
  PHASES (each turn):
  1. PLACE WORKERS: Send workers to locations
     Command: place <location> <count>
     Command: done (when finished placing)

  2. RESOLVE: Collect resources from placements
     Command: resolve <location> [+tool#]
     Command: build <hut#> | buycard <card#>
     Command: done (finish resolving)

  3. FEED: Feed your workers (1 food each)
     Command: feed
     Command: starve <resource> (trade for food)

  GATHERING LOCATIONS:
  - Forest: Wood (dice total / 3)
  - Quarry: Brick (dice total / 4)
  - River: Stone (dice total / 5)
  - Mine: Gold (dice total / 6)
  - Hunt: Food (dice total / 2)

  SPECIAL LOCATIONS (1 worker, 1 per player):
  - Farm: +1 permanent food production
  - Breed: +1 worker (max 10)
  - Tool: +1 tool level (add to dice rolls)

  HUTS:
  Pay resources to build huts for points.
  Command: build <hut#>

  CIVILIZATION CARDS:
  Buy with resources (cost = card position).
  Tech cards multiply at end game!

  TOOLS:
  3 tool slots, each upgradable to level 4.
  Add tool value to any gathering roll.
  Command: resolve forest +1 (use tool slot 1)

  FEEDING:
  Each worker needs 1 food per round.
  Food production gives free food each round.
  Deficit costs 3 points per missing food.
  Trade resources for emergency food.

  WINNING:
  Game ends when hut/civ decks run out.
  Final scoring adds civ card bonuses.
  Tech cards: count x total tech value!
  Highest score wins.

==================================================
"""
