"""Machi Koro - Dice-based city building card game (2-player)."""

import random

from engine.base import BaseGame, input_with_quit, clear_screen


# Building definitions: name, cost, activation, color, effect
# Colors: blue=anyone's turn, green=your turn, red=opponent's turn, purple=your turn
BUILDINGS = {
    # Blue buildings (activate on anyone's roll)
    "Wheat Field": {"cost": 1, "activation": [1], "color": "blue",
                    "coins": 1, "desc": "Get 1 coin (anyone's turn)"},
    "Ranch": {"cost": 1, "activation": [2], "color": "blue",
              "coins": 1, "desc": "Get 1 coin (anyone's turn)"},
    "Bakery": {"cost": 1, "activation": [2, 3], "color": "green",
               "coins": 1, "desc": "Get 1 coin (your turn)"},
    "Forest": {"cost": 3, "activation": [5], "color": "blue",
               "coins": 1, "desc": "Get 1 coin (anyone's turn)"},
    "Mine": {"cost": 6, "activation": [9], "color": "blue",
             "coins": 5, "desc": "Get 5 coins (anyone's turn)"},
    "Apple Orchard": {"cost": 3, "activation": [10], "color": "blue",
                      "coins": 3, "desc": "Get 3 coins (anyone's turn)"},
    # Green buildings (activate on your turn only)
    "Convenience Store": {"cost": 2, "activation": [4], "color": "green",
                          "coins": 3, "desc": "Get 3 coins (your turn)"},
    "Cheese Factory": {"cost": 5, "activation": [7], "color": "green",
                       "coins_per": "Ranch", "coins": 3,
                       "desc": "Get 3 coins per Ranch (your turn)"},
    "Furniture Factory": {"cost": 3, "activation": [8], "color": "green",
                          "coins_per": "Forest", "coins": 3,
                          "desc": "Get 3 coins per Forest/Mine (your turn)"},
    "Fruit & Veg Market": {"cost": 2, "activation": [11, 12], "color": "green",
                           "coins_per": "Wheat Field", "coins": 2,
                           "desc": "Get 2 coins per Wheat/Apple (your turn)"},
    # Red buildings (take from opponent on THEIR turn)
    "Cafe": {"cost": 2, "activation": [3], "color": "red",
             "steal": 1, "desc": "Take 1 coin from roller (opponent's turn)"},
    "Family Restaurant": {"cost": 3, "activation": [9, 10], "color": "red",
                          "steal": 2, "desc": "Take 2 coins from roller (opponent's turn)"},
    # Purple buildings (activate on your turn, special)
    "Stadium": {"cost": 6, "activation": [6], "color": "purple",
                "tax": 2, "desc": "Take 2 coins from each opponent (your turn)"},
    "TV Station": {"cost": 7, "activation": [6], "color": "purple",
                   "steal": 5, "desc": "Take 5 coins from one opponent (your turn)"},
    "Business Center": {"cost": 8, "activation": [6], "color": "purple",
                        "swap": True, "desc": "Trade a building with opponent (your turn)"},
}

# Harbor expansion marketplace buildings
HARBOR_BUILDINGS = {
    "Sushi Bar": {"cost": 2, "activation": [1], "color": "red",
                  "steal": 3, "harbor_req": True,
                  "desc": "Take 3 coins if you have Harbor (opp turn)"},
    "Flower Garden": {"cost": 2, "activation": [4], "color": "blue",
                      "coins": 1, "desc": "Get 1 coin (anyone's turn)"},
    "Flower Shop": {"cost": 1, "activation": [6], "color": "green",
                    "coins_per": "Flower Garden", "coins": 1,
                    "desc": "Get 1 coin per Flower Garden (your turn)"},
    "Pizza Joint": {"cost": 1, "activation": [7], "color": "red",
                    "steal": 1, "desc": "Take 1 coin from roller (opp turn)"},
    "Hamburger Stand": {"cost": 1, "activation": [8], "color": "red",
                        "steal": 1, "desc": "Take 1 coin from roller (opp turn)"},
    "Publisher": {"cost": 5, "activation": [7], "color": "purple",
                  "tax_type": "red_green", "tax": 1,
                  "desc": "Take 1 coin per Cafe/Shop opponent owns (your turn)"},
    "Tuna Boat": {"cost": 5, "activation": [12, 13, 14], "color": "blue",
                  "tuna": True, "desc": "Roll for coins if Harbor (anyone's turn)"},
    "Food Warehouse": {"cost": 2, "activation": [12, 13], "color": "green",
                       "coins_per": "Cafe", "coins": 2,
                       "desc": "Get 2 coins per Cafe/Restaurant (your turn)"},
}

# Landmarks (must build all to win)
LANDMARKS_STANDARD = {
    "Train Station": {"cost": 4, "desc": "Roll 1 or 2 dice", "effect": "two_dice"},
    "Shopping Mall": {"cost": 10, "desc": "+1 coin on Cafe/Bakery activations",
                      "effect": "mall_bonus"},
    "Amusement Park": {"cost": 16, "desc": "Take another turn on doubles",
                       "effect": "doubles"},
    "Radio Tower": {"cost": 22, "desc": "Reroll once per turn", "effect": "reroll"},
}

LANDMARKS_HARBOR = {
    "City Hall": {"cost": 7, "desc": "Get 1 coin if you have 0 at start of turn",
                  "effect": "city_hall"},
    "Harbor": {"cost": 2, "desc": "Get +3 coins when you roll 10+",
               "effect": "harbor_bonus"},
    "Train Station": {"cost": 4, "desc": "Roll 1 or 2 dice", "effect": "two_dice"},
    "Shopping Mall": {"cost": 10, "desc": "+1 coin on Cafe/Bakery activations",
                      "effect": "mall_bonus"},
    "Amusement Park": {"cost": 16, "desc": "Take another turn on doubles",
                       "effect": "doubles"},
    "Airport": {"cost": 30, "desc": "Get 10 coins if you build nothing",
                "effect": "airport"},
}

COLOR_SYMBOLS = {"blue": "[B]", "green": "[G]", "red": "[R]", "purple": "[P]"}


class MachiKoroGame(BaseGame):
    """Machi Koro - Roll dice to activate buildings and build your city."""

    name = "Machi Koro"
    description = "Dice-based city building - roll to earn coins and build landmarks"
    min_players = 2
    max_players = 2
    variations = {
        "standard": "Standard Machi Koro",
        "harbor": "Harbor Expansion (marketplace, extra buildings)",
    }

    def __init__(self, variation=None):
        super().__init__(variation)
        # Player coins
        self.coins = {1: 0, 2: 0}
        # Player buildings: dict of {name: count}
        self.buildings = {1: {}, 2: {}}
        # Player landmarks: dict of {name: built (bool)}
        self.landmarks = {1: {}, 2: {}}
        # Dice roll result
        self.dice_result = 0
        self.dice_count = 1
        self.rolled_doubles = False
        # Marketplace (harbor variation): face-up cards
        self.marketplace = []
        # Phase: dice_choice, roll, activate, build, extra_turn
        self.phase = "dice_choice"
        self.log = []
        self.used_reroll = False
        self.built_this_turn = False

    def _add_log(self, msg):
        self.log.append(msg)
        if len(self.log) > 12:
            self.log = self.log[-12:]

    def _opponent(self, p=None):
        if p is None:
            p = self.current_player
        return 2 if p == 1 else 1

    def _has_landmark(self, player, name):
        return self.landmarks[player].get(name, False)

    def _building_count(self, player, name):
        return self.buildings[player].get(name, 0)

    def _all_buildings(self):
        """Return all purchasable building definitions."""
        b = dict(BUILDINGS)
        if self.variation == "harbor":
            b.update(HARBOR_BUILDINGS)
        return b

    def _landmark_defs(self):
        if self.variation == "harbor":
            return dict(LANDMARKS_HARBOR)
        return dict(LANDMARKS_STANDARD)

    def _has_mall(self, player):
        return self._has_landmark(player, "Shopping Mall")

    # ------------------------------------------------------------------ setup
    def setup(self):
        self.coins = {1: 3, 2: 3}
        self.buildings = {
            1: {"Wheat Field": 1, "Bakery": 1},
            2: {"Wheat Field": 1, "Bakery": 1},
        }

        ldefs = self._landmark_defs()
        for p in (1, 2):
            self.landmarks[p] = {name: False for name in ldefs}

        self.dice_result = 0
        self.dice_count = 1
        self.rolled_doubles = False
        self.phase = "dice_choice"
        self.log = []
        self.used_reroll = False
        self.built_this_turn = False

        # Harbor marketplace
        if self.variation == "harbor":
            all_b = list(self._all_buildings().keys())
            random.shuffle(all_b)
            self.marketplace = all_b[:10]
        else:
            self.marketplace = []

        self.game_over = False
        self.winner = None
        self.turn_number = 0
        self.current_player = 1

    # ---------------------------------------------------------------- display
    def display(self):
        cp = self.current_player
        opp = self._opponent()
        mode = "Harbor" if self.variation == "harbor" else "Standard"

        print(f"\n{'=' * 62}")
        print(f"  MACHI KORO  ({mode})  -  Turn {self.turn_number + 1}")
        print(f"  {self.players[cp - 1]}'s turn")
        print(f"{'=' * 62}")

        # Both players
        for p in (1, 2):
            marker = " <<" if p == cp else ""
            print(f"\n  {self.players[p - 1]}{marker}  (Coins: {self.coins[p]})")

            # Buildings
            if self.buildings[p]:
                print(f"    Buildings:")
                all_b = self._all_buildings()
                for bname, count in sorted(self.buildings[p].items()):
                    if count > 0 and bname in all_b:
                        bdef = all_b[bname]
                        color = COLOR_SYMBOLS.get(bdef["color"], "")
                        acts = ",".join(str(a) for a in bdef["activation"])
                        print(f"      {color} {bname} x{count}"
                              f"  [{acts}]")

            # Landmarks
            ldefs = self._landmark_defs()
            print(f"    Landmarks:")
            for lname, built in self.landmarks[p].items():
                status = "BUILT" if built else f"({ldefs[lname]['cost']} coins)"
                print(f"      {'[*]' if built else '[ ]'} {lname} {status}"
                      f" - {ldefs[lname]['desc']}")

        # Marketplace (harbor)
        if self.variation == "harbor" and self.marketplace:
            print(f"\n  Marketplace:")
            all_b = self._all_buildings()
            for i, bname in enumerate(self.marketplace[:10], 1):
                if bname in all_b:
                    bdef = all_b[bname]
                    color = COLOR_SYMBOLS.get(bdef["color"], "")
                    acts = ",".join(str(a) for a in bdef["activation"])
                    print(f"    {i:2d}. {color} {bname}"
                          f" (Cost: {bdef['cost']}) [{acts}]"
                          f" - {bdef['desc']}")

        # Dice result
        if self.dice_result > 0:
            print(f"\n  Dice Roll: {self.dice_result}"
                  f"{'  (DOUBLES!)' if self.rolled_doubles else ''}")

        # Phase
        print(f"\n  Phase: {self.phase.replace('_', ' ').upper()}")

        # Log
        if self.log:
            print(f"\n  --- Log ---")
            for line in self.log[-5:]:
                print(f"  {line}")

        print()

    # -------------------------------------------------------------- get_move
    def get_move(self):
        cp = self.current_player

        if self.phase == "dice_choice":
            return self._get_dice_choice(cp)
        elif self.phase == "roll":
            return "roll"
        elif self.phase == "activate":
            input_with_quit("  Press Enter to activate buildings... ")
            return "activate"
        elif self.phase == "build":
            return self._get_build_move(cp)
        elif self.phase == "extra_turn":
            return "extra_turn"

        return None

    def _get_dice_choice(self, cp):
        has_train = self._has_landmark(cp, "Train Station")
        # City Hall effect
        if self._has_landmark(cp, "City Hall") and self.coins[cp] == 0:
            self.coins[cp] += 1
            self._add_log(f"City Hall: {self.players[cp - 1]} gets 1 coin (had 0)")

        if has_train:
            print(f"  Roll 1 or 2 dice? ('1' or '2')")
            while True:
                move = input_with_quit("  > ").strip()
                if move in ("1", "2"):
                    return f"dice {move}"
                print("  Type '1' or '2'.")
        else:
            print(f"  Type 'roll' to roll 1 die.")
            while True:
                move = input_with_quit("  > ").strip().lower()
                if move == "roll":
                    return "dice 1"
                print("  Type 'roll'.")

    def _get_build_move(self, cp):
        all_b = self._all_buildings()
        ldefs = self._landmark_defs()

        print(f"  Coins: {self.coins[cp]}. Build a building or landmark?")
        print(f"  'build <name>' or 'landmark <name>' or 'pass'")

        # Show affordable options
        affordable = []
        for bname, bdef in sorted(all_b.items(), key=lambda x: x[1]["cost"]):
            if bdef["cost"] <= self.coins[cp]:
                # Purple: max 1 copy
                if bdef["color"] == "purple" and self._building_count(cp, bname) >= 1:
                    continue
                # Harbor marketplace check
                if self.variation == "harbor":
                    if bname not in self.marketplace and bname not in ("Wheat Field", "Bakery"):
                        continue
                affordable.append(f"{bname} ({bdef['cost']})")

        for lname, built in self.landmarks[cp].items():
            if not built and ldefs[lname]["cost"] <= self.coins[cp]:
                affordable.append(f"*{lname}* ({ldefs[lname]['cost']})")

        if affordable:
            print(f"  Affordable: {', '.join(affordable[:8])}")

        while True:
            move = input_with_quit("  > ").strip()
            lower = move.lower()
            if lower == "pass":
                return "pass_build"
            elif lower.startswith("build "):
                name = move[6:].strip()
                # Try to match case-insensitively
                matched = None
                for bname in all_b:
                    if bname.lower() == name.lower():
                        matched = bname
                        break
                if not matched:
                    print(f"  Unknown building '{name}'.")
                    continue
                bdef = all_b[matched]
                if bdef["cost"] > self.coins[cp]:
                    print(f"  Not enough coins (need {bdef['cost']}).")
                    continue
                if bdef["color"] == "purple" and self._building_count(cp, matched) >= 1:
                    print(f"  Can only have 1 purple building of each type.")
                    continue
                if self.variation == "harbor":
                    if matched not in self.marketplace and matched not in ("Wheat Field", "Bakery"):
                        print(f"  Not available in marketplace.")
                        continue
                return f"build_building|{matched}"
            elif lower.startswith("landmark "):
                name = move[9:].strip()
                matched = None
                for lname in ldefs:
                    if lname.lower() == name.lower():
                        matched = lname
                        break
                if not matched:
                    print(f"  Unknown landmark '{name}'.")
                    continue
                if self.landmarks[cp].get(matched, False):
                    print(f"  Already built!")
                    continue
                if ldefs[matched]["cost"] > self.coins[cp]:
                    print(f"  Need {ldefs[matched]['cost']} coins.")
                    continue
                return f"build_landmark|{matched}"
            else:
                print("  Use 'build <name>', 'landmark <name>', or 'pass'.")

    # -------------------------------------------------------------- make_move
    def make_move(self, move):
        cp = self.current_player

        if move.startswith("dice"):
            count = int(move.split()[1])
            return self._do_roll(cp, count)
        elif move == "activate":
            return self._do_activate(cp)
        elif move.startswith("build_building|"):
            name = move.split("|", 1)[1]
            return self._do_build(cp, name)
        elif move.startswith("build_landmark|"):
            name = move.split("|", 1)[1]
            return self._do_build_landmark(cp, name)
        elif move == "pass_build":
            # Airport bonus
            if not self.built_this_turn and self._has_landmark(cp, "Airport"):
                self.coins[cp] += 10
                self._add_log(f"Airport: {self.players[cp - 1]} gets 10 coins for not building")
            self.built_this_turn = False
            self.used_reroll = False
            # Check for doubles + amusement park
            if self.rolled_doubles and self._has_landmark(cp, "Amusement Park"):
                self._add_log(f"Amusement Park: {self.players[cp - 1]} takes another turn!")
                self.phase = "dice_choice"
                self.dice_result = 0
                self.rolled_doubles = False
                self.current_player = cp
                return True
            self.phase = "dice_choice"
            self.dice_result = 0
            self.rolled_doubles = False
            return True
        elif move == "extra_turn":
            self.phase = "dice_choice"
            self.current_player = cp
            return True
        elif move == "roll":
            return self._do_roll(cp, self.dice_count)

        return False

    def _do_roll(self, cp, count):
        self.dice_count = count
        dice = [random.randint(1, 6) for _ in range(count)]
        self.dice_result = sum(dice)
        self.rolled_doubles = (count == 2 and dice[0] == dice[1])

        self._add_log(f"{self.players[cp - 1]} rolls {dice} = {self.dice_result}"
                     f"{'  DOUBLES!' if self.rolled_doubles else ''}")

        # Radio Tower reroll
        if (self._has_landmark(cp, "Radio Tower") and not self.used_reroll):
            clear_screen()
            self.display()
            print(f"  Radio Tower: Reroll? ('yes' or 'no')")
            try:
                choice = input_with_quit("  > ").strip().lower()
            except Exception:
                raise
            if choice == "yes":
                self.used_reroll = True
                dice = [random.randint(1, 6) for _ in range(count)]
                self.dice_result = sum(dice)
                self.rolled_doubles = (count == 2 and dice[0] == dice[1])
                self._add_log(f"Rerolled: {dice} = {self.dice_result}")

        # Harbor bonus
        if self._has_landmark(cp, "Harbor") and self.dice_result >= 10:
            self.coins[cp] += 3
            self._add_log(f"Harbor bonus: +3 coins for rolling {self.dice_result}")

        self.phase = "activate"
        self.current_player = cp
        return True

    def _do_activate(self, cp):
        """Activate buildings based on dice roll."""
        opp = self._opponent(cp)
        roll = self.dice_result
        all_b = self._all_buildings()

        # Order: Red (opponent's buildings steal from roller),
        # then Blue/Green (current player earns), then Purple
        # Red: opponent's red buildings activate on roller's turn
        for bname, count in self.buildings[opp].items():
            if count <= 0 or bname not in all_b:
                continue
            bdef = all_b[bname]
            if bdef["color"] != "red":
                continue
            if roll not in bdef["activation"]:
                continue
            # Harbor requirement check
            if bdef.get("harbor_req") and not self._has_landmark(opp, "Harbor"):
                continue
            steal = bdef.get("steal", 0) * count
            if self._has_mall(opp):
                steal += count  # +1 per copy with mall
            actual = min(steal, self.coins[cp])
            if actual > 0:
                self.coins[cp] -= actual
                self.coins[opp] += actual
                self._add_log(f"{self.players[opp - 1]}'s {bname} takes {actual} "
                             f"from {self.players[cp - 1]}")

        # Blue: everyone's buildings activate
        for p in (1, 2):
            for bname, count in self.buildings[p].items():
                if count <= 0 or bname not in all_b:
                    continue
                bdef = all_b[bname]
                if bdef["color"] != "blue":
                    continue
                if roll not in bdef["activation"]:
                    continue
                earned = bdef["coins"] * count
                self.coins[p] += earned
                if earned > 0:
                    self._add_log(f"{self.players[p - 1]}'s {bname} earns {earned}")

        # Green: current player's buildings
        for bname, count in self.buildings[cp].items():
            if count <= 0 or bname not in all_b:
                continue
            bdef = all_b[bname]
            if bdef["color"] != "green":
                continue
            if roll not in bdef["activation"]:
                continue

            if bdef.get("coins_per"):
                # Coins per other building type
                target = bdef["coins_per"]
                target_count = 0
                # Count related buildings
                if target == "Forest":
                    target_count = (self._building_count(cp, "Forest") +
                                   self._building_count(cp, "Mine"))
                elif target == "Wheat Field":
                    target_count = (self._building_count(cp, "Wheat Field") +
                                   self._building_count(cp, "Apple Orchard"))
                elif target == "Cafe":
                    target_count = (self._building_count(cp, "Cafe") +
                                   self._building_count(cp, "Family Restaurant"))
                else:
                    target_count = self._building_count(cp, target)
                earned = bdef["coins"] * target_count * count
            else:
                earned = bdef["coins"] * count
                if self._has_mall(cp) and bname in ("Bakery", "Convenience Store"):
                    earned += count

            if earned > 0:
                self.coins[cp] += earned
                self._add_log(f"{self.players[cp - 1]}'s {bname} earns {earned}")

        # Purple: current player's special buildings
        for bname, count in self.buildings[cp].items():
            if count <= 0 or bname not in all_b:
                continue
            bdef = all_b[bname]
            if bdef["color"] != "purple":
                continue
            if roll not in bdef["activation"]:
                continue

            if bdef.get("tax"):
                # Stadium: take from opponent
                take = min(bdef["tax"], self.coins[opp])
                if take > 0:
                    self.coins[opp] -= take
                    self.coins[cp] += take
                    self._add_log(f"Stadium: took {take} from {self.players[opp - 1]}")
            elif bdef.get("steal") and bname == "TV Station":
                take = min(bdef["steal"], self.coins[opp])
                if take > 0:
                    self.coins[opp] -= take
                    self.coins[cp] += take
                    self._add_log(f"TV Station: took {take} from {self.players[opp - 1]}")
            elif bdef.get("swap"):
                self._add_log(f"Business Center: swap not implemented in 2p, skipped")

        self.phase = "build"
        self.current_player = cp
        return True

    def _do_build(self, cp, name):
        all_b = self._all_buildings()
        bdef = all_b[name]
        self.coins[cp] -= bdef["cost"]
        self.buildings[cp][name] = self.buildings[cp].get(name, 0) + 1
        self.built_this_turn = True
        self._add_log(f"{self.players[cp - 1]} builds {name} ({bdef['cost']} coins)")

        # Remove from marketplace if harbor
        if self.variation == "harbor" and name in self.marketplace:
            self.marketplace.remove(name)
            # Refill marketplace
            all_names = list(self._all_buildings().keys())
            random.shuffle(all_names)
            for bn in all_names:
                if bn not in self.marketplace and len(self.marketplace) < 10:
                    self.marketplace.append(bn)

        self.current_player = cp
        # Stay in build phase (can only build one per turn normally)
        self.phase = "build"
        # Actually end build phase after one build
        return self._finish_build(cp)

    def _do_build_landmark(self, cp, name):
        ldefs = self._landmark_defs()
        cost = ldefs[name]["cost"]
        self.coins[cp] -= cost
        self.landmarks[cp][name] = True
        self.built_this_turn = True
        self._add_log(f"{self.players[cp - 1]} builds landmark: {name}!")
        return self._finish_build(cp)

    def _finish_build(self, cp):
        # Check for doubles + amusement park
        if self.rolled_doubles and self._has_landmark(cp, "Amusement Park"):
            self._add_log(f"Amusement Park: {self.players[cp - 1]} takes another turn!")
            self.phase = "dice_choice"
            self.dice_result = 0
            self.rolled_doubles = False
            self.built_this_turn = False
            self.used_reroll = False
            self.current_player = cp
            return True

        self.phase = "dice_choice"
        self.dice_result = 0
        self.rolled_doubles = False
        self.built_this_turn = False
        self.used_reroll = False
        return True

    # -------------------------------------------------------- switch_player
    def switch_player(self):
        if self.phase in ("roll", "activate", "build"):
            pass  # Don't switch mid-turn
        else:
            super().switch_player()

    # -------------------------------------------------------- check_game_over
    def check_game_over(self):
        ldefs = self._landmark_defs()
        for p in (1, 2):
            all_built = all(self.landmarks[p].get(l, False) for l in ldefs)
            if all_built:
                self.game_over = True
                self.winner = p
                return

    # -------------------------------------------------------- save / load
    def get_state(self):
        return {
            "coins": {str(k): v for k, v in self.coins.items()},
            "buildings": {str(k): dict(v) for k, v in self.buildings.items()},
            "landmarks": {str(k): dict(v) for k, v in self.landmarks.items()},
            "dice_result": self.dice_result,
            "dice_count": self.dice_count,
            "rolled_doubles": self.rolled_doubles,
            "marketplace": list(self.marketplace),
            "phase": self.phase,
            "log": list(self.log),
            "used_reroll": self.used_reroll,
            "built_this_turn": self.built_this_turn,
        }

    def load_state(self, state):
        self.coins = {int(k): v for k, v in state["coins"].items()}
        self.buildings = {int(k): dict(v) for k, v in state["buildings"].items()}
        self.landmarks = {int(k): dict(v) for k, v in state["landmarks"].items()}
        self.dice_result = state["dice_result"]
        self.dice_count = state.get("dice_count", 1)
        self.rolled_doubles = state.get("rolled_doubles", False)
        self.marketplace = list(state.get("marketplace", []))
        self.phase = state["phase"]
        self.log = list(state.get("log", []))
        self.used_reroll = state.get("used_reroll", False)
        self.built_this_turn = state.get("built_this_turn", False)

    # ------------------------------------------------------------ tutorial
    def get_tutorial(self):
        extra = ""
        if self.variation == "harbor":
            extra = (
                f"\n  HARBOR EXPANSION:\n"
                f"  - Marketplace: Only buy from the 10 face-up cards.\n"
                f"  - New buildings: Sushi Bar, Tuna Boat, Pizza Joint,\n"
                f"    Hamburger Stand, Flower Garden/Shop, Publisher,\n"
                f"    Food Warehouse.\n"
                f"  - New landmarks: City Hall, Harbor, Airport.\n"
                f"  - Harbor: +3 coins when you roll 10 or higher.\n"
                f"  - Airport: +10 coins if you don't build this turn.\n\n"
            )

        return (
            f"\n{'=' * 58}\n"
            f"  MACHI KORO - Tutorial ({self.variation.title()})\n"
            f"{'=' * 58}\n\n"
            f"  OVERVIEW:\n"
            f"  Build your city! Roll dice to activate buildings\n"
            f"  that earn you coins. Use coins to buy more buildings\n"
            f"  and landmarks. First to build all landmarks wins!\n\n"
            f"  BUILDING COLORS:\n"
            f"    [B] Blue   - Activates on ANYONE'S dice roll\n"
            f"    [G] Green  - Activates on YOUR roll only\n"
            f"    [R] Red    - Activates on OPPONENT'S roll\n"
            f"                 (steals coins from the roller)\n"
            f"    [P] Purple - Activates on YOUR roll, special effect\n\n"
            f"  EACH TURN:\n"
            f"  1. Roll dice (1 die, or 2 if you have Train Station)\n"
            f"  2. All buildings matching the roll activate:\n"
            f"     - Red buildings activate first (opponent steals)\n"
            f"     - Blue buildings for all players\n"
            f"     - Green buildings for current player\n"
            f"     - Purple buildings for current player\n"
            f"  3. Build ONE building or landmark (or pass)\n\n"
            f"  LANDMARKS:\n"
            f"  - Train Station (4): Roll 1 or 2 dice\n"
            f"  - Shopping Mall (10): +1 on Cafe/Bakery income\n"
            f"  - Amusement Park (16): Extra turn on doubles\n"
            f"  - Radio Tower (22): Reroll once per turn\n\n"
            f"{extra}"
            f"  WINNING:\n"
            f"  First player to build ALL landmarks wins!\n\n"
            f"  COMMANDS:\n"
            f"  '1' or '2'           - Choose dice count\n"
            f"  'build <name>'       - Buy a building\n"
            f"  'landmark <name>'    - Build a landmark\n"
            f"  'pass'               - Skip building\n"
            f"  'quit' - Exit    'save' - Save game\n"
            f"  'help' - Help    'tutorial' - This tutorial\n"
            f"{'=' * 58}"
        )
