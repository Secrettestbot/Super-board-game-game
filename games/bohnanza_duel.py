"""Bohnanza Duel - 2-player bean trading card game.

Plant beans in fields, harvest for coins based on set collection. Draw and
gift beans, manage your fields. First to target coins wins.
"""

import random

from engine.base import BaseGame, input_with_quit, clear_screen

# Bean types with harvest values: (count_needed, coins_earned)
BEAN_TYPES = {
    "Coffee":    {"color": "Brn", "harvests": [(4, 1), (7, 2), (10, 3), (12, 4)], "total": 24},
    "Wax":       {"color": "Ylw", "harvests": [(4, 1), (7, 2), (9, 3), (11, 4)], "total": 22},
    "Blue":      {"color": "Blu", "harvests": [(4, 1), (6, 2), (8, 3), (10, 4)], "total": 20},
    "Chili":     {"color": "Red", "harvests": [(3, 1), (6, 2), (8, 3), (9, 4)], "total": 18},
    "Stink":     {"color": "Grn", "harvests": [(3, 1), (5, 2), (7, 3), (8, 4)], "total": 16},
    "Green":     {"color": "Grn", "harvests": [(3, 1), (5, 2), (6, 3), (7, 4)], "total": 14},
    "Soy":       {"color": "Ylw", "harvests": [(2, 1), (4, 2), (6, 3), (7, 4)], "total": 12},
    "Black-eyed":{"color": "Blk", "harvests": [(2, 1), (4, 2), (5, 3), (6, 4)], "total": 10},
    "Red":       {"color": "Red", "harvests": [(2, 1), (3, 2), (4, 3), (5, 4)], "total": 8},
    "Garden":    {"color": "Grn", "harvests": [(2, 1), (3, 2), (3, 3), (4, 4)], "total": 6},
    "Cocoa":     {"color": "Brn", "harvests": [(2, 1), (3, 2), (4, 3), (4, 4)], "total": 4},
}

TARGET_COINS_STANDARD = 13
TARGET_COINS_CHALLENGE = 16


def build_deck():
    """Build the full bean deck."""
    deck = []
    for bean_name, info in BEAN_TYPES.items():
        for _ in range(info["total"]):
            deck.append(bean_name)
    random.shuffle(deck)
    return deck


def calc_harvest_value(bean_name, count):
    """Calculate coins earned from harvesting a field."""
    if count == 0:
        return 0
    info = BEAN_TYPES[bean_name]
    value = 0
    for needed, coins in info["harvests"]:
        if count >= needed:
            value = coins
    return value


class BohnanzaDuelGame(BaseGame):
    """Bohnanza Duel - 2-player bean trading card game."""

    name = "Bohnanza Duel"
    description = "2-player bean planting and trading card game"
    min_players = 2
    max_players = 2
    variations = {
        "standard": "Standard Duel",
        "challenge": "Challenge Mode",
    }

    def __init__(self, variation=None):
        super().__init__(variation)
        self.target_coins = TARGET_COINS_CHALLENGE if self.variation == "challenge" else TARGET_COINS_STANDARD
        self.deck = []
        self.discard = []
        self.hands = {}  # player -> list of beans (ordered, can only plant from front)
        self.fields = {}  # player -> list of {"bean": name, "count": int} (max 3 fields)
        self.coins = {}
        self.gift_area = []  # beans drawn face-up for gifting phase
        self.phase = "plant"  # plant, gift, resolve_gift
        self.plants_remaining = 0
        self.deck_cycles = 0  # track reshuffles
        self.round_number = 1
        self.log = []

    def setup(self):
        self.deck = build_deck()
        self.discard = []
        for p in [1, 2]:
            sp = str(p)
            self.hands[sp] = [self.deck.pop() for _ in range(5)]
            self.fields[sp] = [None, None, None]  # 3 fields, None = empty
            self.coins[sp] = 0
        self.gift_area = []
        self.phase = "plant"
        self.plants_remaining = 2
        self.deck_cycles = 0
        self.round_number = 1
        self.log = ["Game started! Plant beans from the front of your hand."]

    def _draw_card(self):
        """Draw a card, reshuffling discard if needed."""
        if not self.deck:
            if self.discard:
                self.deck = list(self.discard)
                random.shuffle(self.deck)
                self.discard = []
                self.deck_cycles += 1
            else:
                return None
        if self.deck:
            return self.deck.pop()
        return None

    def _harvest_field(self, player, field_idx):
        """Harvest a field and earn coins."""
        sp = str(player)
        field = self.fields[sp][field_idx]
        if field is None:
            return 0
        coins = calc_harvest_value(field["bean"], field["count"])
        # Beans used as coins are removed, rest go to discard
        remaining = field["count"] - coins
        for _ in range(remaining):
            self.discard.append(field["bean"])
        self.coins[sp] += coins
        self.fields[sp][field_idx] = None
        return coins

    def _find_field_for_bean(self, player, bean):
        """Find best field to plant a bean: matching field, or empty field."""
        sp = str(player)
        # First: matching field
        for i, field in enumerate(self.fields[sp]):
            if field and field["bean"] == bean:
                return i
        # Second: empty field
        for i, field in enumerate(self.fields[sp]):
            if field is None:
                return i
        return None

    def _ai_choose_plant(self):
        """AI decides which beans to plant from hand."""
        sp = "2"
        if not self.hands[sp]:
            return {"action": "end_plant"}
        bean = self.hands[sp][0]
        field_idx = self._find_field_for_bean(2, bean)
        if field_idx is not None:
            return {"action": "plant", "field": field_idx}
        # Must harvest a field first - pick least valuable
        best_harvest = None
        worst_val = float('inf')
        for i, field in enumerate(self.fields[sp]):
            if field:
                val = calc_harvest_value(field["bean"], field["count"])
                if val < worst_val:
                    worst_val = val
                    best_harvest = i
        if best_harvest is not None:
            return {"action": "harvest", "field": best_harvest}
        return {"action": "end_plant"}

    def _ai_resolve_gift(self):
        """AI decides what to do with gift beans."""
        sp = "2"
        if not self.gift_area:
            return {"action": "end_gift"}
        bean = self.gift_area[0]
        field_idx = self._find_field_for_bean(2, bean)
        if field_idx is not None:
            return {"action": "take_gift", "gift_idx": 0, "field": field_idx}
        # Must harvest to make room or give to opponent
        return {"action": "give_gift", "gift_idx": 0}

    def display(self):
        clear_screen()
        mode = "Challenge" if self.variation == "challenge" else "Standard"
        print(f"{'=' * 60}")
        print(f"  BOHNANZA DUEL - {mode} | Round {self.round_number}")
        print(f"{'=' * 60}")

        for p in [1, 2]:
            sp = str(p)
            marker = " <<" if p == self.current_player else ""
            print(f"\n  {self.players[p-1]}: {self.coins[sp]}/{self.target_coins} coins | "
                  f"Hand: {len(self.hands[sp])} cards{marker}")
            print(f"  Fields:")
            for i, field in enumerate(self.fields[sp]):
                if field:
                    val = calc_harvest_value(field["bean"], field["count"])
                    harvest_info = BEAN_TYPES[field["bean"]]["harvests"]
                    next_goal = "-"
                    for needed, coins in harvest_info:
                        if field["count"] < needed:
                            next_goal = f"{needed} for {coins}c"
                            break
                    print(f"    Field {i+1}: {field['bean']} x{field['count']} "
                          f"(worth {val}c, next: {next_goal})")
                else:
                    print(f"    Field {i+1}: [empty]")

        cp = self.current_player
        sp = str(cp)
        if cp == 1:
            print(f"\n  Your Hand (plant from front):")
            if self.hands[sp]:
                hand_str = " | ".join(f"[{self.hands[sp][i]}]" if i == 0
                                      else self.hands[sp][i]
                                      for i in range(len(self.hands[sp])))
                print(f"    {hand_str}")
            else:
                print(f"    (empty)")

        if self.gift_area:
            print(f"\n  Gift Area:")
            for i, bean in enumerate(self.gift_area):
                print(f"    [{i+1}] {bean}")

        print(f"\n  Deck: {len(self.deck)} | Discard: {len(self.discard)} | "
              f"Reshuffles: {self.deck_cycles}")
        print(f"  Phase: {self.phase}", end="")
        if self.phase == "plant":
            print(f" (plant {self.plants_remaining} more)", end="")
        print()

        # Bean reference
        print(f"\n  Bean Harvest Chart:")
        print(f"  {'Bean':<12} {'For 1c':<8} {'For 2c':<8} {'For 3c':<8} {'For 4c':<8}")
        for name, info in list(BEAN_TYPES.items())[:6]:
            h = info["harvests"]
            print(f"  {name:<12} {h[0][0]:<8} {h[1][0]:<8} {h[2][0]:<8} {h[3][0]:<8}")

        if self.log:
            print(f"\n  Last: {self.log[-1]}")
        print()

    def get_move(self):
        cp = self.current_player
        sp = str(cp)

        if cp == 2:
            if self.phase == "plant":
                return self._ai_choose_plant()
            elif self.phase == "gift":
                return {"action": "draw_gifts"}
            elif self.phase == "resolve_gift":
                return self._ai_resolve_gift()
            return {"action": "end_plant"}

        if self.phase == "plant":
            if self.plants_remaining <= 0:
                return {"action": "end_plant"}
            if not self.hands[sp]:
                return {"action": "end_plant"}
            bean = self.hands[sp][0]
            print(f"  Must plant: {bean}")
            print(f"  [p] Plant in matching/empty field")
            print(f"  [h #] Harvest field # first")
            print(f"  [s] Skip (if already planted 1)")
            choice = input_with_quit("  Choice: ").strip().lower()
            if choice == 'p':
                field_idx = self._find_field_for_bean(cp, bean)
                if field_idx is not None:
                    return {"action": "plant", "field": field_idx}
                else:
                    print("  No matching or empty field! Harvest first.")
                    input_with_quit("  Press Enter...")
                    return None
            elif choice.startswith('h'):
                try:
                    parts = choice.split()
                    fidx = int(parts[1]) - 1
                    return {"action": "harvest", "field": fidx}
                except (ValueError, IndexError):
                    return None
            elif choice == 's' and self.plants_remaining < 2:
                return {"action": "end_plant"}
            return None

        elif self.phase == "gift":
            print(f"  Drawing gift beans...")
            input_with_quit("  Press Enter to draw...")
            return {"action": "draw_gifts"}

        elif self.phase == "resolve_gift":
            if not self.gift_area:
                return {"action": "end_gift"}
            print(f"  Gift beans to resolve:")
            for i, bean in enumerate(self.gift_area):
                print(f"    [{i+1}] {bean}")
            print(f"  [t #] Take gift # and plant it")
            print(f"  [g #] Give gift # to opponent")
            choice = input_with_quit("  Choice: ").strip().lower()
            if choice.startswith('t'):
                try:
                    parts = choice.split()
                    gidx = int(parts[1]) - 1
                    field_idx = self._find_field_for_bean(cp, self.gift_area[gidx])
                    if field_idx is not None:
                        return {"action": "take_gift", "gift_idx": gidx, "field": field_idx}
                    else:
                        print("  No room! Harvest a field first or give to opponent.")
                        input_with_quit("  Press Enter...")
                        return None
                except (ValueError, IndexError):
                    return None
            elif choice.startswith('g'):
                try:
                    parts = choice.split()
                    gidx = int(parts[1]) - 1
                    return {"action": "give_gift", "gift_idx": gidx}
                except (ValueError, IndexError):
                    return None
            return None

        return None

    def make_move(self, move):
        if move is None:
            return False
        cp = self.current_player
        sp = str(cp)
        opp = "2" if sp == "1" else "1"
        action = move.get("action")

        if action == "plant":
            field_idx = move["field"]
            if field_idx < 0 or field_idx > 2:
                return False
            if not self.hands[sp]:
                return False
            bean = self.hands[sp][0]
            field = self.fields[sp][field_idx]
            if field is not None and field["bean"] != bean:
                return False
            if field is None:
                self.fields[sp][field_idx] = {"bean": bean, "count": 1}
            else:
                field["count"] += 1
            self.hands[sp].pop(0)
            self.plants_remaining -= 1
            self.log.append(f"{self.players[cp-1]} planted {bean} in field {field_idx+1}")
            if self.plants_remaining <= 0:
                self.phase = "gift"
            return True

        if action == "harvest":
            field_idx = move["field"]
            if field_idx < 0 or field_idx > 2:
                return False
            if self.fields[sp][field_idx] is None:
                return False
            coins = self._harvest_field(cp, field_idx)
            self.log.append(f"{self.players[cp-1]} harvested field {field_idx+1} for {coins} coins")
            return True

        if action == "end_plant":
            self.phase = "gift"
            return True

        if action == "draw_gifts":
            self.gift_area = []
            for _ in range(3):
                card = self._draw_card()
                if card:
                    self.gift_area.append(card)
            self.phase = "resolve_gift"
            if self.gift_area:
                self.log.append(f"Drew gifts: {', '.join(self.gift_area)}")
            else:
                self.log.append("No cards to draw!")
            return True

        if action == "take_gift":
            gidx = move["gift_idx"]
            field_idx = move["field"]
            if gidx < 0 or gidx >= len(self.gift_area):
                return False
            if field_idx < 0 or field_idx > 2:
                return False
            bean = self.gift_area[gidx]
            field = self.fields[sp][field_idx]
            if field is not None and field["bean"] != bean:
                return False
            if field is None:
                self.fields[sp][field_idx] = {"bean": bean, "count": 1}
            else:
                field["count"] += 1
            self.gift_area.pop(gidx)
            self.log.append(f"{self.players[cp-1]} planted gift {bean}")
            if not self.gift_area:
                self._end_turn()
            return True

        if action == "give_gift":
            gidx = move["gift_idx"]
            if gidx < 0 or gidx >= len(self.gift_area):
                return False
            bean = self.gift_area.pop(gidx)
            # Opponent must plant it - find a field
            opp_field = self._find_field_for_bean(int(opp), bean)
            if opp_field is not None:
                field = self.fields[opp][opp_field]
                if field is None:
                    self.fields[opp][opp_field] = {"bean": bean, "count": 1}
                else:
                    field["count"] += 1
                self.log.append(f"{self.players[cp-1]} gave {bean} to {self.players[int(opp)-1]}")
            else:
                # Opponent has no room - goes to discard
                self.discard.append(bean)
                self.log.append(f"{bean} discarded (no room for opponent)")
            if not self.gift_area:
                self._end_turn()
            return True

        if action == "end_gift":
            # Remaining gifts go to discard
            for bean in self.gift_area:
                self.discard.append(bean)
            self.gift_area = []
            self._end_turn()
            return True

        return False

    def _end_turn(self):
        """End current turn: draw cards, switch player."""
        cp = self.current_player
        sp = str(cp)
        # Draw 3 cards to hand (add to back)
        for _ in range(3):
            card = self._draw_card()
            if card:
                self.hands[sp].append(card)
        self.phase = "plant"
        self.plants_remaining = 2
        self.gift_area = []
        self.round_number += 1

    def check_game_over(self):
        # Game ends when deck runs out for 3rd time or someone reaches target
        for p in [1, 2]:
            sp = str(p)
            if self.coins[sp] >= self.target_coins:
                self.game_over = True
                if self.coins["1"] > self.coins["2"]:
                    self.winner = 1
                elif self.coins["2"] > self.coins["1"]:
                    self.winner = 2
                else:
                    self.winner = None
                return
        if self.deck_cycles >= 3:
            self.game_over = True
            # Final harvest: harvest all fields
            for p in [1, 2]:
                sp = str(p)
                for i in range(3):
                    if self.fields[sp][i]:
                        self._harvest_field(p, i)
            if self.coins["1"] > self.coins["2"]:
                self.winner = 1
            elif self.coins["2"] > self.coins["1"]:
                self.winner = 2
            else:
                self.winner = None

    def get_state(self):
        return {
            "deck": self.deck,
            "discard": self.discard,
            "hands": self.hands,
            "fields": self.fields,
            "coins": self.coins,
            "gift_area": self.gift_area,
            "phase": self.phase,
            "plants_remaining": self.plants_remaining,
            "deck_cycles": self.deck_cycles,
            "round_number": self.round_number,
            "log": self.log,
        }

    def load_state(self, state):
        self.deck = state["deck"]
        self.discard = state["discard"]
        self.hands = state["hands"]
        self.fields = state["fields"]
        self.coins = state["coins"]
        self.gift_area = state.get("gift_area", [])
        self.phase = state["phase"]
        self.plants_remaining = state.get("plants_remaining", 2)
        self.deck_cycles = state.get("deck_cycles", 0)
        self.round_number = state.get("round_number", 1)
        self.log = state.get("log", [])

    def get_tutorial(self):
        return f"""
============================================================
  BOHNANZA DUEL - Tutorial
============================================================

  OVERVIEW:
  Plant beans in your 3 fields, harvest them for coins.
  First to {self.target_coins} coins wins!

  YOUR TURN:
  1. PLANT: Plant 1-2 beans from the front of your hand
     into matching or empty fields
  2. GIFT: Draw 3 beans face-up, then either plant them
     yourself or give them to your opponent
  3. DRAW: Draw 3 cards to the back of your hand

  FIELDS:
  - You have 3 bean fields
  - Each field holds one type of bean
  - To plant a different bean, harvest the field first

  HARVESTING:
  - Each bean type has a harvest chart
  - More beans = more coins (check the chart!)
  - Beans used as coins are removed from game
  - Remaining beans go to discard pile

  GAME END:
  - First to {self.target_coins} coins wins
  - Or when the deck is reshuffled 3 times
  - Then harvest all fields and most coins wins
============================================================
"""
