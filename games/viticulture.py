"""Viticulture Essential - Wine-making worker placement game.

Plant vines, harvest grapes, make wine, fill wine orders for victory points.
Features summer/winter worker placement seasons with different action spaces.
"""

import random
from engine.base import BaseGame, input_with_quit, clear_screen

# Vine cards: each has red/white grape values
VINE_CARDS = [
    {"name": "Sangiovese", "red": 1, "white": 0},
    {"name": "Merlot", "red": 2, "white": 0},
    {"name": "Cabernet", "red": 3, "white": 0},
    {"name": "Syrah", "red": 4, "white": 0},
    {"name": "Pinot Grigio", "red": 0, "white": 1},
    {"name": "Chardonnay", "red": 0, "white": 2},
    {"name": "Sauvignon Blanc", "red": 0, "white": 3},
    {"name": "Riesling", "red": 0, "white": 4},
    {"name": "Trebbiano", "red": 1, "white": 1},
    {"name": "Malvasia", "red": 2, "white": 1},
    {"name": "Primitivo", "red": 1, "white": 2},
    {"name": "Moscato", "red": 2, "white": 2},
    {"name": "Nebbiolo", "red": 3, "white": 1},
    {"name": "Vermentino", "red": 1, "white": 3},
]

# Wine orders: type, min_value, victory_points, bonus_lira
WINE_ORDERS = [
    {"type": "red", "min_value": 2, "vp": 2, "lira": 1},
    {"type": "red", "min_value": 3, "vp": 3, "lira": 1},
    {"type": "red", "min_value": 4, "vp": 4, "lira": 2},
    {"type": "white", "min_value": 2, "vp": 2, "lira": 1},
    {"type": "white", "min_value": 3, "vp": 3, "lira": 1},
    {"type": "white", "min_value": 4, "vp": 4, "lira": 2},
    {"type": "blush", "min_value": 4, "vp": 3, "lira": 2},
    {"type": "blush", "min_value": 5, "vp": 4, "lira": 2},
    {"type": "blush", "min_value": 6, "vp": 5, "lira": 3},
    {"type": "sparkling", "min_value": 7, "vp": 5, "lira": 3},
    {"type": "sparkling", "min_value": 8, "vp": 6, "lira": 4},
    {"type": "sparkling", "min_value": 9, "vp": 7, "lira": 5},
]

SUMMER_ACTIONS = [
    "draw_vine", "plant_vine", "give_tour", "build_structure", "play_summer_visitor", "sell_grape"
]
SUMMER_ACTION_LABELS = {
    "draw_vine": "Draw a Vine card",
    "plant_vine": "Plant a Vine from hand",
    "give_tour": "Give a Tour (+2 Lira)",
    "build_structure": "Build a Structure",
    "play_summer_visitor": "Play Summer Visitor (+1 VP, +1 Lira)",
    "sell_grape": "Sell a Grape from crush pad",
}

WINTER_ACTIONS = [
    "draw_order", "harvest", "make_wine", "fill_order", "play_winter_visitor", "train_worker"
]
WINTER_ACTION_LABELS = {
    "draw_order": "Draw a Wine Order card",
    "harvest": "Harvest a Field (grapes to crush pad)",
    "make_wine": "Make Wine (crush grapes into wine)",
    "fill_order": "Fill a Wine Order",
    "play_winter_visitor": "Play Winter Visitor (+1 VP, +1 Lira)",
    "train_worker": "Train a new Worker (cost: 4 Lira)",
}

STRUCTURES = {
    "trellis": {"cost": 2, "desc": "Plant vines with value > 3"},
    "irrigation": {"cost": 3, "desc": "Plant vines with combined value > 4"},
    "yoke": {"cost": 2, "desc": "Harvest 2 fields at once"},
    "windmill": {"cost": 5, "desc": "+1 VP when planting"},
    "cottage": {"cost": 4, "desc": "Draw 1 extra vine when drawing"},
    "tasting_room": {"cost": 6, "desc": "+1 VP when giving tour"},
    "medium_cellar": {"cost": 4, "desc": "Store wine up to value 6"},
    "large_cellar": {"cost": 6, "desc": "Store wine up to value 9"},
}


def _init_player():
    """Create a fresh player state."""
    return {
        "vp": 0,
        "lira": 3,
        "workers": 3,
        "workers_placed": 0,
        "hand_vines": [],
        "hand_orders": [],
        "fields": [[], [], []],  # 3 fields, each a list of planted vines
        "crush_pad_red": [0] * 10,  # index = value, 1 if present
        "crush_pad_white": [0] * 10,
        "cellar_red": [0] * 10,
        "cellar_white": [0] * 10,
        "cellar_blush": [0] * 10,
        "cellar_sparkling": [0] * 10,
        "structures": [],
    }


class ViticultureGame(BaseGame):
    name = "Viticulture Essential"
    description = "Wine-making worker placement: plant vines, harvest, make wine, fill orders."
    min_players = 1
    max_players = 2
    variations = {
        "standard": "Full game - play to 20 VP across up to 7 years",
        "quick": "Quick game - play to 15 VP across up to 5 years, start with extra resources",
    }

    def setup(self):
        is_quick = self.variation == "quick"
        self.max_years = 5 if is_quick else 7
        self.target_vp = 15 if is_quick else 20
        self.year = 1
        self.season = "summer"
        self.vine_deck = list(VINE_CARDS)
        random.shuffle(self.vine_deck)
        self.order_deck = list(WINE_ORDERS)
        random.shuffle(self.order_deck)
        self.player_data = {}
        for i in range(1, len(self.players) + 1):
            p = _init_player()
            if is_quick:
                p["lira"] = 5
                p["workers"] = 4
            # Deal starting cards
            for _ in range(3):
                if self.vine_deck:
                    p["hand_vines"].append(self.vine_deck.pop())
            for _ in range(2):
                if self.order_deck:
                    p["hand_orders"].append(self.order_deck.pop())
            self.player_data[str(i)] = p
        self.used_actions = {"summer": [], "winter": []}
        self.phase_done = {str(i): False for i in range(1, len(self.players) + 1)}
        self.message = "Year 1 begins! Summer season."

    def display(self):
        clear_screen()
        p = self.player_data[str(self.current_player)]
        print(f"{'=' * 60}")
        print(f"  VITICULTURE ESSENTIAL - Year {self.year}/{self.max_years} | "
              f"Season: {self.season.upper()} | Target: {self.target_vp} VP")
        print(f"{'=' * 60}")
        # Show both players' summary
        for i in range(1, len(self.players) + 1):
            pd = self.player_data[str(i)]
            marker = " <<" if i == self.current_player else ""
            print(f"  {self.players[i-1]}: {pd['vp']} VP | {pd['lira']} Lira | "
                  f"Workers: {pd['workers'] - pd['workers_placed']}/{pd['workers']}{marker}")
        print(f"{'-' * 60}")
        # Current player details
        print(f"  >> {self.players[self.current_player - 1]}'s turn <<")
        # Hand
        if p["hand_vines"]:
            vines_str = ", ".join(f"{v['name']}(R{v['red']}W{v['white']})" for v in p["hand_vines"])
            print(f"  Vine cards: {vines_str}")
        if p["hand_orders"]:
            orders_str = ", ".join(
                f"{o['type']}>{o['min_value']}={o['vp']}VP" for o in p["hand_orders"])
            print(f"  Orders: {orders_str}")
        # Fields
        for fi, field in enumerate(p["fields"]):
            if field:
                planted = ", ".join(v["name"] for v in field)
                print(f"  Field {fi + 1}: {planted}")
            else:
                print(f"  Field {fi + 1}: (empty)")
        # Crush pad
        reds = [i for i in range(1, 10) if p["crush_pad_red"][i]]
        whites = [i for i in range(1, 10) if p["crush_pad_white"][i]]
        if reds or whites:
            print(f"  Crush Pad - Red: {reds if reds else 'none'}, White: {whites if whites else 'none'}")
        # Cellar
        wines = []
        for wtype in ["red", "white", "blush", "sparkling"]:
            vals = [i for i in range(1, 10) if p[f"cellar_{wtype}"][i]]
            if vals:
                wines.append(f"{wtype}: {vals}")
        if wines:
            print(f"  Cellar: {', '.join(wines)}")
        # Structures
        if p["structures"]:
            print(f"  Structures: {', '.join(p['structures'])}")
        print(f"{'-' * 60}")
        # Available actions
        actions = SUMMER_ACTIONS if self.season == "summer" else WINTER_ACTIONS
        labels = SUMMER_ACTION_LABELS if self.season == "summer" else WINTER_ACTION_LABELS
        print("  Available actions:")
        for idx, act in enumerate(actions):
            used = "X" if act in self.used_actions[self.season] else " "
            print(f"    {idx + 1}. [{used}] {labels[act]}")
        print(f"    {len(actions) + 1}. Pass (end your season)")
        if self.message:
            print(f"\n  {self.message}")
        print()

    def get_move(self):
        actions = SUMMER_ACTIONS if self.season == "summer" else WINTER_ACTIONS
        n = len(actions) + 1
        move = input_with_quit(f"  {self.players[self.current_player - 1]}, choose action (1-{n}): ")
        return move.strip()

    def make_move(self, move):
        actions = SUMMER_ACTIONS if self.season == "summer" else WINTER_ACTIONS
        p = self.player_data[str(self.current_player)]
        self.message = ""
        try:
            choice = int(move)
        except ValueError:
            self.message = "Enter a number."
            return False
        if choice < 1 or choice > len(actions) + 1:
            self.message = "Invalid choice."
            return False
        # Pass
        if choice == len(actions) + 1:
            self.phase_done[str(self.current_player)] = True
            self.message = f"{self.players[self.current_player - 1]} passes."
            self._advance_season()
            return True
        action = actions[choice - 1]
        # Check workers
        if p["workers_placed"] >= p["workers"]:
            self.message = "No workers left! You must pass."
            return False
        # Check if action used (in 2p, each action used once)
        if len(self.players) <= 2 and action in self.used_actions[self.season]:
            self.message = "Action already taken this season!"
            return False
        # Execute action
        success = self._execute_action(action, p)
        if success:
            p["workers_placed"] += 1
            self.used_actions[self.season].append(action)
            self._advance_season()
        return success

    def _execute_action(self, action, p):
        if action == "draw_vine":
            count = 2 if "cottage" in p["structures"] else 1
            drawn = []
            for _ in range(count):
                if self.vine_deck:
                    drawn.append(self.vine_deck.pop())
                else:
                    card = random.choice(VINE_CARDS)
                    drawn.append(dict(card))
            p["hand_vines"].extend(drawn)
            names = ", ".join(v["name"] for v in drawn)
            self.message = f"Drew vine(s): {names}"
            return True

        elif action == "plant_vine":
            if not p["hand_vines"]:
                self.message = "No vine cards in hand!"
                return False
            # Pick a vine
            print("  Your vines:")
            for i, v in enumerate(p["hand_vines"]):
                print(f"    {i + 1}. {v['name']} (Red:{v['red']} White:{v['white']})")
            vi = input_with_quit("  Choose vine to plant: ").strip()
            try:
                vi = int(vi) - 1
                if vi < 0 or vi >= len(p["hand_vines"]):
                    self.message = "Invalid vine."
                    return False
            except ValueError:
                self.message = "Invalid input."
                return False
            vine = p["hand_vines"][vi]
            # Check trellis requirement
            total = vine["red"] + vine["white"]
            if vine["red"] > 3 or vine["white"] > 3:
                if "trellis" not in p["structures"]:
                    self.message = "Need Trellis to plant vines with value > 3!"
                    return False
            if total > 4 and "irrigation" not in p["structures"]:
                self.message = "Need Irrigation for combined value > 4!"
                return False
            # Pick a field
            print("  Fields:")
            for fi, field in enumerate(p["fields"]):
                curr = sum(v["red"] + v["white"] for v in field)
                print(f"    {fi + 1}. Field {fi + 1} (current total: {curr}/6)")
            fi = input_with_quit("  Choose field (1-3): ").strip()
            try:
                fi = int(fi) - 1
                if fi < 0 or fi >= 3:
                    self.message = "Invalid field."
                    return False
            except ValueError:
                return False
            curr_total = sum(v["red"] + v["white"] for v in p["fields"][fi])
            if curr_total + total > 6:
                self.message = "Field capacity exceeded (max 6)!"
                return False
            p["fields"][fi].append(vine)
            p["hand_vines"].pop(vi)
            self.message = f"Planted {vine['name']} in Field {fi + 1}."
            if "windmill" in p["structures"]:
                p["vp"] += 1
                self.message += " +1 VP from Windmill!"
            return True

        elif action == "give_tour":
            p["lira"] += 2
            self.message = "Gave a tour! +2 Lira."
            if "tasting_room" in p["structures"]:
                p["vp"] += 1
                self.message += " +1 VP from Tasting Room!"
            return True

        elif action == "build_structure":
            available = {k: v for k, v in STRUCTURES.items() if k not in p["structures"]}
            if not available:
                self.message = "All structures already built!"
                return False
            print("  Structures:")
            keys = sorted(available.keys())
            for i, k in enumerate(keys):
                s = available[k]
                print(f"    {i + 1}. {k.replace('_', ' ').title()} - Cost: {s['cost']} Lira - {s['desc']}")
            si = input_with_quit("  Choose structure to build: ").strip()
            try:
                si = int(si) - 1
                if si < 0 or si >= len(keys):
                    self.message = "Invalid choice."
                    return False
            except ValueError:
                return False
            struct = keys[si]
            cost = STRUCTURES[struct]["cost"]
            if p["lira"] < cost:
                self.message = f"Not enough Lira! Need {cost}, have {p['lira']}."
                return False
            p["lira"] -= cost
            p["structures"].append(struct)
            self.message = f"Built {struct.replace('_', ' ').title()}!"
            return True

        elif action == "play_summer_visitor":
            p["vp"] += 1
            p["lira"] += 1
            self.message = "Played Summer Visitor! +1 VP, +1 Lira."
            return True

        elif action == "sell_grape":
            reds = [i for i in range(1, 10) if p["crush_pad_red"][i]]
            whites = [i for i in range(1, 10) if p["crush_pad_white"][i]]
            all_grapes = [(v, "red") for v in reds] + [(v, "white") for v in whites]
            if not all_grapes:
                self.message = "No grapes on crush pad!"
                return False
            print("  Grapes on crush pad:")
            for i, (v, t) in enumerate(all_grapes):
                lira = max(1, v - 1)
                print(f"    {i + 1}. {t.title()} value {v} (sell for {lira} Lira)")
            gi = input_with_quit("  Choose grape to sell: ").strip()
            try:
                gi = int(gi) - 1
                if gi < 0 or gi >= len(all_grapes):
                    return False
            except ValueError:
                return False
            val, gtype = all_grapes[gi]
            lira = max(1, val - 1)
            p[f"crush_pad_{gtype}"][val] = 0
            p["lira"] += lira
            self.message = f"Sold {gtype} grape (value {val}) for {lira} Lira."
            return True

        elif action == "draw_order":
            if self.order_deck:
                card = self.order_deck.pop()
            else:
                card = dict(random.choice(WINE_ORDERS))
            p["hand_orders"].append(card)
            self.message = f"Drew order: {card['type']} wine >= {card['min_value']} for {card['vp']} VP."
            return True

        elif action == "harvest":
            planted = [(fi, f) for fi, f in enumerate(p["fields"]) if f]
            if not planted:
                self.message = "No planted fields to harvest!"
                return False
            print("  Fields to harvest:")
            for fi, field in planted:
                names = ", ".join(v["name"] for v in field)
                print(f"    {fi + 1}. Field {fi + 1}: {names}")
            hi = input_with_quit("  Choose field to harvest: ").strip()
            try:
                hi = int(hi)
                if hi < 1 or hi > 3 or not p["fields"][hi - 1]:
                    self.message = "Invalid field."
                    return False
            except ValueError:
                return False
            field = p["fields"][hi - 1]
            red_val = sum(v["red"] for v in field)
            white_val = sum(v["white"] for v in field)
            red_val = min(red_val, 9)
            white_val = min(white_val, 9)
            if red_val > 0:
                p["crush_pad_red"][red_val] = 1
            if white_val > 0:
                p["crush_pad_white"][white_val] = 1
            msg = f"Harvested Field {hi}!"
            if red_val > 0:
                msg += f" Red grape value {red_val}."
            if white_val > 0:
                msg += f" White grape value {white_val}."
            # Second field with yoke
            if "yoke" in p["structures"]:
                other_planted = [(fi, f) for fi, f in enumerate(p["fields"]) if f and fi != hi - 1]
                if other_planted:
                    fi2, field2 = other_planted[0]
                    r2 = min(sum(v["red"] for v in field2), 9)
                    w2 = min(sum(v["white"] for v in field2), 9)
                    if r2 > 0:
                        p["crush_pad_red"][r2] = 1
                    if w2 > 0:
                        p["crush_pad_white"][w2] = 1
                    msg += f" Yoke: also harvested Field {fi2 + 1}!"
            self.message = msg
            return True

        elif action == "make_wine":
            reds = [i for i in range(1, 10) if p["crush_pad_red"][i]]
            whites = [i for i in range(1, 10) if p["crush_pad_white"][i]]
            if not reds and not whites:
                self.message = "No grapes to crush!"
                return False
            max_val = 9
            if "large_cellar" in p["structures"]:
                max_val = 9
            elif "medium_cellar" in p["structures"]:
                max_val = 6
            else:
                max_val = 3
            print("  Wine making options:")
            options = []
            idx = 0
            for rv in reds:
                if rv <= max_val:
                    idx += 1
                    options.append(("red", rv, 0))
                    print(f"    {idx}. Make Red wine value {rv}")
            for wv in whites:
                if wv <= max_val:
                    idx += 1
                    options.append(("white", 0, wv))
                    print(f"    {idx}. Make White wine value {wv}")
            for rv in reds:
                for wv in whites:
                    blush_val = rv + wv
                    if blush_val <= max_val:
                        idx += 1
                        options.append(("blush", rv, wv))
                        print(f"    {idx}. Make Blush wine value {blush_val} (R{rv}+W{wv})")
            if not options:
                self.message = f"Cannot make wine - cellar max is {max_val}. Build a cellar upgrade!"
                return False
            wi = input_with_quit("  Choose wine to make: ").strip()
            try:
                wi = int(wi) - 1
                if wi < 0 or wi >= len(options):
                    return False
            except ValueError:
                return False
            wtype, rv, wv = options[wi]
            if rv > 0:
                p["crush_pad_red"][rv] = 0
            if wv > 0:
                p["crush_pad_white"][wv] = 0
            if wtype == "red":
                p["cellar_red"][rv] = 1
                self.message = f"Made Red wine value {rv}!"
            elif wtype == "white":
                p["cellar_white"][wv] = 1
                self.message = f"Made White wine value {wv}!"
            elif wtype == "blush":
                val = min(rv + wv, 9)
                p["cellar_blush"][val] = 1
                self.message = f"Made Blush wine value {val}!"
            return True

        elif action == "fill_order":
            if not p["hand_orders"]:
                self.message = "No wine orders in hand!"
                return False
            print("  Your orders:")
            for i, o in enumerate(p["hand_orders"]):
                print(f"    {i + 1}. {o['type'].title()} >= {o['min_value']} => {o['vp']} VP + {o['lira']} Lira")
            oi = input_with_quit("  Choose order to fill: ").strip()
            try:
                oi = int(oi) - 1
                if oi < 0 or oi >= len(p["hand_orders"]):
                    return False
            except ValueError:
                return False
            order = p["hand_orders"][oi]
            wtype = order["type"]
            min_val = order["min_value"]
            cellar_key = f"cellar_{wtype}"
            available = [i for i in range(min_val, 10) if p[cellar_key][i]]
            if not available:
                self.message = f"No {wtype} wine with value >= {min_val}!"
                return False
            # Use lowest sufficient wine
            wine_val = available[0]
            p[cellar_key][wine_val] = 0
            p["vp"] += order["vp"]
            p["lira"] += order["lira"]
            p["hand_orders"].pop(oi)
            self.message = (f"Filled order! Used {wtype} wine value {wine_val}. "
                            f"+{order['vp']} VP, +{order['lira']} Lira.")
            return True

        elif action == "play_winter_visitor":
            p["vp"] += 1
            p["lira"] += 1
            self.message = "Played Winter Visitor! +1 VP, +1 Lira."
            return True

        elif action == "train_worker":
            if p["lira"] < 4:
                self.message = "Need 4 Lira to train a worker!"
                return False
            if p["workers"] >= 6:
                self.message = "Maximum workers (6) reached!"
                return False
            p["lira"] -= 4
            p["workers"] += 1
            self.message = "Trained a new worker! -4 Lira."
            return True

        return False

    def _advance_season(self):
        """Check if all players have passed, advance season/year."""
        all_done = all(
            self.phase_done[str(i)] or
            self.player_data[str(i)]["workers_placed"] >= self.player_data[str(i)]["workers"]
            for i in range(1, len(self.players) + 1)
        )
        if all_done:
            if self.season == "summer":
                self.season = "winter"
                self.used_actions["winter"] = []
                for i in range(1, len(self.players) + 1):
                    self.phase_done[str(i)] = False
                self.message = f"Winter season begins!"
            else:
                # End of year
                self.year += 1
                self.season = "summer"
                self.used_actions = {"summer": [], "winter": []}
                for i in range(1, len(self.players) + 1):
                    self.player_data[str(i)]["workers_placed"] = 0
                    self.phase_done[str(i)] = False
                    # Age wines (increase value by 1)
                    pd = self.player_data[str(i)]
                    for wtype in ["red", "white", "blush", "sparkling"]:
                        key = f"cellar_{wtype}"
                        for v in range(8, 0, -1):
                            if pd[key][v]:
                                pd[key][v] = 0
                                pd[key][v + 1] = 1
                    # Age grapes
                    for gtype in ["red", "white"]:
                        key = f"crush_pad_{gtype}"
                        for v in range(8, 0, -1):
                            if pd[key][v]:
                                pd[key][v] = 0
                                pd[key][v + 1] = 1
                    # Residual income
                    pd["lira"] += 1
                if self.year <= self.max_years:
                    self.message = f"Year {self.year} begins! Summer season."

    def check_game_over(self):
        for i in range(1, len(self.players) + 1):
            if self.player_data[str(i)]["vp"] >= self.target_vp:
                self.game_over = True
                self.winner = i
                return
        if self.year > self.max_years:
            self.game_over = True
            best = max(range(1, len(self.players) + 1),
                       key=lambda i: (self.player_data[str(i)]["vp"], self.player_data[str(i)]["lira"]))
            self.winner = best

    def get_state(self):
        return {
            "year": self.year,
            "season": self.season,
            "max_years": self.max_years,
            "target_vp": self.target_vp,
            "vine_deck": self.vine_deck,
            "order_deck": self.order_deck,
            "player_data": self.player_data,
            "used_actions": self.used_actions,
            "phase_done": self.phase_done,
            "message": self.message,
        }

    def load_state(self, state):
        self.year = state["year"]
        self.season = state["season"]
        self.max_years = state["max_years"]
        self.target_vp = state["target_vp"]
        self.vine_deck = state["vine_deck"]
        self.order_deck = state["order_deck"]
        self.player_data = state["player_data"]
        self.used_actions = state["used_actions"]
        self.phase_done = state["phase_done"]
        self.message = state.get("message", "")

    def get_tutorial(self):
        return """
=== VITICULTURE ESSENTIAL TUTORIAL ===

Viticulture is a wine-making worker placement game. You manage a vineyard
through the seasons, trying to earn victory points by making and selling wine.

SEASONS:
  Each year has two seasons - Summer and Winter.
  In each season, you place workers on action spaces.

SUMMER ACTIONS:
  - Draw Vine: Add vine cards to your hand
  - Plant Vine: Plant a vine card in one of your 3 fields
  - Give Tour: Earn 2 Lira
  - Build Structure: Build improvements for your vineyard
  - Summer Visitor: Gain 1 VP and 1 Lira
  - Sell Grape: Sell grapes from your crush pad for Lira

WINTER ACTIONS:
  - Draw Order: Get wine order cards
  - Harvest: Move grapes from fields to crush pad
  - Make Wine: Turn grapes into wine (stored in cellar)
  - Fill Order: Use wine to fill orders for VP and Lira
  - Winter Visitor: Gain 1 VP and 1 Lira
  - Train Worker: Pay 4 Lira for an extra worker

WINE TYPES:
  Red wine = red grapes only
  White wine = white grapes only
  Blush wine = red + white grapes combined
  Sparkling wine = requires large cellar

KEY STRUCTURES:
  Trellis - Plant high-value vines
  Medium/Large Cellar - Store higher-value wines
  Windmill - Bonus VP when planting
  Yoke - Harvest 2 fields at once

STRATEGY:
  Plant vines -> Harvest grapes -> Make wine -> Fill orders
  Build structures to unlock better capabilities.
  Balance income (Lira) with VP generation.
"""
