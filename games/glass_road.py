"""Glass Road - Card-driven resource management with production wheel mechanic.

Play specialist cards for actions, produce glass and bricks using unique
production wheels. Build buildings to earn victory points.
"""

import random
from engine.base import BaseGame, input_with_quit, clear_screen

# Resources
RESOURCES = ["wood", "clay", "quartz", "food", "charcoal", "brick", "glass"]

# Specialist cards: each has two actions (top and bottom)
SPECIALIST_CARDS = [
    {"name": "Lumberjack", "top": {"gain": {"wood": 3}}, "bottom": {"gain": {"food": 1}}},
    {"name": "Clay Molder", "top": {"gain": {"clay": 3}}, "bottom": {"gain": {"brick": 1}}},
    {"name": "Quartz Miner", "top": {"gain": {"quartz": 2}}, "bottom": {"gain": {"glass": 1}}},
    {"name": "Charcoal Burner", "top": {"convert": {"wood": 1}, "gain": {"charcoal": 2}},
     "bottom": {"gain": {"food": 1}}},
    {"name": "Baker", "top": {"convert": {"food": 2}, "gain_vp": 3},
     "bottom": {"gain": {"food": 2}}},
    {"name": "Builder", "top": {"gain": {"wood": 1, "clay": 1}}, "bottom": {"gain": {"brick": 1}}},
    {"name": "Glazier", "top": {"gain": {"quartz": 1, "charcoal": 1}},
     "bottom": {"gain": {"glass": 1}}},
    {"name": "Farmer", "top": {"gain": {"food": 3}}, "bottom": {"gain": {"wood": 1}}},
    {"name": "Potter", "top": {"convert": {"clay": 1}, "gain": {"brick": 2}},
     "bottom": {"gain": {"clay": 1}}},
    {"name": "Mason", "top": {"gain": {"brick": 1, "clay": 1}}, "bottom": {"gain_vp": 1}},
    {"name": "Glass Blower", "top": {"convert": {"quartz": 1, "charcoal": 1}, "gain": {"glass": 2}},
     "bottom": {"gain": {"quartz": 1}}},
    {"name": "Forest Warden", "top": {"gain": {"wood": 2, "food": 1}},
     "bottom": {"gain": {"charcoal": 1}}},
    {"name": "Merchant", "top": {"gain_vp": 2}, "bottom": {"gain": {"food": 1, "clay": 1}}},
    {"name": "Village Elder", "top": {"gain": {"wood": 1, "clay": 1, "quartz": 1}},
     "bottom": {"gain_vp": 1}},
    {"name": "Master Builder", "top": {"gain": {"brick": 1, "glass": 1}},
     "bottom": {"gain": {"wood": 1, "clay": 1}}},
]

# Buildings: cost, VP, bonus
BUILDINGS = [
    {"name": "Shed", "cost": {"wood": 1}, "vp": 1, "bonus": None},
    {"name": "Cottage", "cost": {"wood": 1, "brick": 1}, "vp": 3, "bonus": None},
    {"name": "Manor", "cost": {"wood": 2, "brick": 1, "glass": 1}, "vp": 7, "bonus": None},
    {"name": "Chapel", "cost": {"brick": 2}, "vp": 3, "bonus": "brick_discount"},
    {"name": "Workshop", "cost": {"wood": 2}, "vp": 2, "bonus": "extra_resource"},
    {"name": "Kiln", "cost": {"clay": 2, "charcoal": 1}, "vp": 4, "bonus": None},
    {"name": "Glassworks", "cost": {"quartz": 2, "charcoal": 1}, "vp": 5, "bonus": None},
    {"name": "Brickyard", "cost": {"clay": 3}, "vp": 4, "bonus": None},
    {"name": "Cathedral", "cost": {"brick": 2, "glass": 1}, "vp": 8, "bonus": None},
    {"name": "Market", "cost": {"wood": 1, "clay": 1}, "vp": 2, "bonus": "trade"},
    {"name": "Inn", "cost": {"food": 2, "wood": 1}, "vp": 2, "bonus": None},
    {"name": "Warehouse", "cost": {"wood": 2, "clay": 1}, "vp": 3, "bonus": "storage"},
    {"name": "Tower", "cost": {"brick": 1, "glass": 1}, "vp": 6, "bonus": None},
    {"name": "Palace", "cost": {"brick": 2, "glass": 2}, "vp": 12, "bonus": None},
    {"name": "Forge", "cost": {"charcoal": 2, "clay": 1}, "vp": 4, "bonus": None},
    {"name": "Tavern", "cost": {"food": 1, "wood": 1}, "vp": 1, "bonus": "food_income"},
]

# Production wheel thresholds: when you have all components, auto-produce
WHEEL_GLASS = {"quartz": 1, "charcoal": 1}  # produces 1 glass
WHEEL_BRICK = {"clay": 1, "food": 1}  # produces 1 brick


def _init_player():
    return {
        "vp": 0,
        "resources": {"wood": 1, "clay": 1, "quartz": 1, "food": 1,
                       "charcoal": 0, "brick": 0, "glass": 0},
        "hand": list(range(len(SPECIALIST_CARDS))),  # indices into SPECIALIST_CARDS
        "selected": [],  # 5 cards selected for this round
        "played": [],
        "buildings": [],
        "glass_wheel": 0,  # 0-5 position
        "brick_wheel": 0,
    }


class GlassRoadGame(BaseGame):
    name = "Glass Road"
    description = "Card-driven resource management with production wheel mechanic."
    min_players = 1
    max_players = 2
    variations = {
        "standard": "Full game - 4 building periods with all buildings",
        "quick": "Quick game - 2 building periods, start with extra resources",
    }

    def setup(self):
        is_quick = self.variation == "quick"
        self.max_rounds = 2 if is_quick else 4
        self.current_round = 1
        self.phase = "select"  # select, play, build
        self.card_index = 0
        self.building_pool = list(range(len(BUILDINGS)))
        random.shuffle(self.building_pool)
        # In quick mode show fewer buildings
        pool_size = 10 if is_quick else len(self.building_pool)
        self.building_pool = self.building_pool[:pool_size]
        self.player_data = {}
        for i in range(1, len(self.players) + 1):
            p = _init_player()
            if is_quick:
                for r in p["resources"]:
                    p["resources"][r] += 1
            self.player_data[str(i)] = p
        self.message = "Round 1: Select 5 specialist cards from your hand."

    def _check_production_wheels(self, p):
        """Auto-produce glass/brick when resources align."""
        produced = []
        # Glass wheel: if have quartz and charcoal
        while p["resources"]["quartz"] >= 1 and p["resources"]["charcoal"] >= 1:
            if p["glass_wheel"] >= 3:
                break
            p["resources"]["quartz"] -= 1
            p["resources"]["charcoal"] -= 1
            p["resources"]["glass"] = p["resources"].get("glass", 0) + 1
            p["glass_wheel"] += 1
            produced.append("glass")
            break  # only one auto-production per check
        # Brick wheel: if have clay and food
        while p["resources"]["clay"] >= 1 and p["resources"]["food"] >= 1:
            if p["brick_wheel"] >= 3:
                break
            p["resources"]["clay"] -= 1
            p["resources"]["food"] -= 1
            p["resources"]["brick"] = p["resources"].get("brick", 0) + 1
            p["brick_wheel"] += 1
            produced.append("brick")
            break
        return produced

    def display(self):
        clear_screen()
        print(f"{'=' * 60}")
        print(f"  GLASS ROAD - Round {self.current_round}/{self.max_rounds} | Phase: {self.phase.upper()}")
        print(f"{'=' * 60}")
        for i in range(1, len(self.players) + 1):
            pd = self.player_data[str(i)]
            marker = " <<" if i == self.current_player else ""
            print(f"  {self.players[i-1]}: {pd['vp']} VP{marker}")
            res = pd["resources"]
            print(f"    Resources: Wood:{res['wood']} Clay:{res['clay']} Quartz:{res['quartz']} "
                  f"Food:{res['food']} Charcoal:{res['charcoal']} Brick:{res['brick']} Glass:{res['glass']}")
            print(f"    Production: Glass wheel {pd['glass_wheel']}/3, Brick wheel {pd['brick_wheel']}/3")
            if pd["buildings"]:
                bnames = ", ".join(BUILDINGS[b]["name"] for b in pd["buildings"])
                print(f"    Buildings: {bnames}")
        print(f"{'-' * 60}")
        p = self.player_data[str(self.current_player)]
        if self.phase == "select":
            print(f"  Select 5 cards (you have {len(p['hand'])} available):")
            for idx, ci in enumerate(p["hand"]):
                card = SPECIALIST_CARDS[ci]
                print(f"    {idx + 1}. {card['name']}")
        elif self.phase == "play":
            print(f"  Cards to play ({len(p['selected']) - self.card_index} remaining):")
            for idx in range(self.card_index, len(p["selected"])):
                ci = p["selected"][idx]
                card = SPECIALIST_CARDS[ci]
                top_desc = self._describe_action(card["top"])
                bot_desc = self._describe_action(card["bottom"])
                print(f"    {idx + 1}. {card['name']} - Top: {top_desc} | Bottom: {bot_desc}")
        elif self.phase == "build":
            print("  Available buildings:")
            for idx, bi in enumerate(self.building_pool):
                b = BUILDINGS[bi]
                cost_str = ", ".join(f"{v} {k}" for k, v in b["cost"].items())
                print(f"    {idx + 1}. {b['name']} ({cost_str}) -> {b['vp']} VP")
        if self.message:
            print(f"\n  {self.message}")
        print()

    def _describe_action(self, action):
        parts = []
        if "convert" in action:
            conv = ", ".join(f"{v} {k}" for k, v in action["convert"].items())
            parts.append(f"spend {conv}")
        if "gain" in action:
            gain = ", ".join(f"+{v} {k}" for k, v in action["gain"].items())
            parts.append(gain)
        if "gain_vp" in action:
            parts.append(f"+{action['gain_vp']} VP")
        return "; ".join(parts) if parts else "nothing"

    def get_move(self):
        p = self.player_data[str(self.current_player)]
        if self.phase == "select":
            move = input_with_quit(f"  Select card # (choose 5 one at a time, {5 - len(p['selected'])} left): ")
        elif self.phase == "play":
            move = input_with_quit("  Play next card: (t)op action, (b)ottom action, or (s)kip: ")
        elif self.phase == "build":
            move = input_with_quit("  Build # (or 'pass' to skip): ")
        else:
            move = input_with_quit("  Enter: ")
        return move.strip()

    def make_move(self, move):
        p = self.player_data[str(self.current_player)]
        self.message = ""

        if self.phase == "select":
            try:
                idx = int(move) - 1
                if idx < 0 or idx >= len(p["hand"]):
                    self.message = "Invalid card number."
                    return False
            except ValueError:
                self.message = "Enter a number."
                return False
            p["selected"].append(p["hand"][idx])
            p["hand"].pop(idx)
            if len(p["selected"]) >= 5:
                self.message = f"{self.players[self.current_player - 1]} selected 5 cards!"
                # Check if all players have selected
                all_selected = all(
                    len(self.player_data[str(i)]["selected"]) >= 5
                    for i in range(1, len(self.players) + 1)
                )
                if all_selected:
                    self.phase = "play"
                    self.card_index = 0
                    self.message = "Card play phase begins!"
            return True

        elif self.phase == "play":
            move = move.lower()
            if move not in ("t", "b", "s", "top", "bottom", "skip"):
                self.message = "Enter 't' for top, 'b' for bottom, or 's' to skip."
                return False
            if self.card_index >= len(p["selected"]):
                self._advance_play_phase()
                return True
            ci = p["selected"][self.card_index]
            card = SPECIALIST_CARDS[ci]
            if move.startswith("t"):
                success = self._apply_action(card["top"], p)
                if not success:
                    return False
                self.message = f"Played {card['name']} top action."
            elif move.startswith("b"):
                success = self._apply_action(card["bottom"], p)
                if not success:
                    return False
                self.message = f"Played {card['name']} bottom action."
            else:
                self.message = f"Skipped {card['name']}."
            # Check production wheels
            produced = self._check_production_wheels(p)
            if produced:
                self.message += f" Auto-produced: {', '.join(produced)}!"
            p["played"].append(ci)
            self.card_index += 1
            if self.card_index >= len(p["selected"]):
                self._advance_play_phase()
            return True

        elif self.phase == "build":
            if move.lower() in ("pass", "p", "0"):
                self.message = f"{self.players[self.current_player - 1]} passes on building."
                self._advance_build_phase()
                return True
            try:
                idx = int(move) - 1
                if idx < 0 or idx >= len(self.building_pool):
                    self.message = "Invalid building number."
                    return False
            except ValueError:
                self.message = "Enter a number or 'pass'."
                return False
            bi = self.building_pool[idx]
            b = BUILDINGS[bi]
            # Check cost
            for res, amt in b["cost"].items():
                if p["resources"].get(res, 0) < amt:
                    self.message = f"Not enough {res}! Need {amt}, have {p['resources'].get(res, 0)}."
                    return False
            # Pay cost
            for res, amt in b["cost"].items():
                p["resources"][res] -= amt
            p["buildings"].append(bi)
            p["vp"] += b["vp"]
            self.building_pool.pop(idx)
            self.message = f"Built {b['name']} for {b['vp']} VP!"
            # Check production after spending
            produced = self._check_production_wheels(p)
            if produced:
                self.message += f" Auto-produced: {', '.join(produced)}!"
            self._advance_build_phase()
            return True

        return False

    def _apply_action(self, action, p):
        # Check conversion cost
        if "convert" in action:
            for res, amt in action["convert"].items():
                if p["resources"].get(res, 0) < amt:
                    self.message = f"Not enough {res} to convert!"
                    return False
            for res, amt in action["convert"].items():
                p["resources"][res] -= amt
        # Apply gains
        if "gain" in action:
            for res, amt in action["gain"].items():
                p["resources"][res] = p["resources"].get(res, 0) + amt
                # Cap resources at 5
                p["resources"][res] = min(p["resources"][res], 7)
        if "gain_vp" in action:
            p["vp"] += action["gain_vp"]
        return True

    def _advance_play_phase(self):
        """Move to next player or to build phase."""
        all_done = all(
            len(self.player_data[str(i)]["played"]) >= 5
            for i in range(1, len(self.players) + 1)
        )
        if all_done:
            self.phase = "build"
            self.message = "Building phase! Choose buildings to construct."

    def _advance_build_phase(self):
        """Check if round should advance."""
        # After each player builds one, move to next round
        self.current_round += 1
        if self.current_round > self.max_rounds:
            return
        # Reset for next round
        self.phase = "select"
        for i in range(1, len(self.players) + 1):
            pd = self.player_data[str(i)]
            # Return played cards to hand
            pd["hand"] = list(range(len(SPECIALIST_CARDS)))
            pd["selected"] = []
            pd["played"] = []
            # Reset wheels partially
            pd["glass_wheel"] = max(0, pd["glass_wheel"] - 1)
            pd["brick_wheel"] = max(0, pd["brick_wheel"] - 1)
        self.message = f"Round {self.current_round} begins! Select 5 specialist cards."

    def check_game_over(self):
        if self.current_round > self.max_rounds:
            self.game_over = True
            # Add building bonus VP
            best = max(range(1, len(self.players) + 1),
                       key=lambda i: self.player_data[str(i)]["vp"])
            self.winner = best

    def get_state(self):
        return {
            "current_round": self.current_round,
            "max_rounds": self.max_rounds,
            "phase": self.phase,
            "card_index": self.card_index,
            "building_pool": self.building_pool,
            "player_data": self.player_data,
            "message": self.message,
        }

    def load_state(self, state):
        self.current_round = state["current_round"]
        self.max_rounds = state["max_rounds"]
        self.phase = state["phase"]
        self.card_index = state["card_index"]
        self.building_pool = state["building_pool"]
        self.player_data = state["player_data"]
        self.message = state.get("message", "")

    def get_tutorial(self):
        return """
=== GLASS ROAD TUTORIAL ===

Glass Road is a card-driven resource management game set in the Bavarian Forest.
You play specialist cards to gather resources, and build buildings for VP.

GAME FLOW (each round):
  1. SELECT: Choose 5 specialist cards from all 15 available
  2. PLAY: Play each selected card, choosing top or bottom action
  3. BUILD: Construct one building using your resources

RESOURCES:
  Basic: Wood, Clay, Quartz, Food, Charcoal
  Refined: Brick (from clay + food), Glass (from quartz + charcoal)

PRODUCTION WHEELS (unique mechanic!):
  Glass Wheel: When you have both Quartz AND Charcoal, one of each is
    automatically converted to Glass. This can happen at any time!
  Brick Wheel: When you have both Clay AND Food, one of each is
    automatically converted to Brick.

  Watch your resources! The wheels can convert things you wanted to keep.

SPECIALIST CARDS:
  Each card has a Top and Bottom action.
  Choose which one to use (or skip the card entirely).
  Cards include: Lumberjack, Clay Molder, Glazier, Baker, etc.

BUILDINGS:
  Pay resource costs to build. Each building awards VP.
  More expensive buildings give more VP.

STRATEGY:
  - Manage your resources carefully around the production wheels
  - Plan your card selections to chain resource gathering
  - Time your building purchases for maximum efficiency
  - The wheels are both helpful and dangerous - plan around them!
"""
