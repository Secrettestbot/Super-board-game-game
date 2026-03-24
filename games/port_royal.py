"""Port Royal - Push-your-luck card game.

Flip cards from a deck - ships can sink you, people can be hired for their
abilities and victory points. Push your luck by flipping more cards for more
choices, but two ships of the same color means bust!
"""

import random

from engine.base import BaseGame, input_with_quit, clear_screen

SHIP_COLORS = ["Red", "Blue", "Green", "Yellow", "Black"]

SHIP_CARDS = [
    {"name": f"{color} Ship", "type": "ship", "color": color, "coins": coins}
    for color in SHIP_COLORS
    for coins in [1, 2, 3]
]

PERSON_CARDS = [
    {"name": "Settler", "type": "person", "cost": 1, "points": 1, "ability": "settle",
     "desc": "+1 when settling"},
    {"name": "Captain", "type": "person", "cost": 2, "points": 1, "ability": "captain",
     "desc": "+1 ship defense"},
    {"name": "Priest", "type": "person", "cost": 3, "points": 2, "ability": "priest",
     "desc": "+1 for hiring church"},
    {"name": "Governor", "type": "person", "cost": 4, "points": 3, "ability": "governor",
     "desc": "Draw extra card when hiring"},
    {"name": "Jester", "type": "person", "cost": 1, "points": 1, "ability": "jester",
     "desc": "+1 coin per card flip"},
    {"name": "Trader", "type": "person", "cost": 2, "points": 1, "ability": "trader",
     "desc": "+1 coin per ship defeated"},
    {"name": "Admiral", "type": "person", "cost": 5, "points": 3, "ability": "admiral",
     "desc": "+2 coins at end of turn"},
    {"name": "Pirate", "type": "person", "cost": 3, "points": 2, "ability": "pirate",
     "desc": "Steal 1 coin from opponent"},
    {"name": "Explorer", "type": "person", "cost": 2, "points": 1, "ability": "explorer",
     "desc": "+1 to all expeditions"},
    {"name": "Mademoiselle", "type": "person", "cost": 4, "points": 2, "ability": "mademoiselle",
     "desc": "All persons cost 1 less"},
    {"name": "Sailor", "type": "person", "cost": 1, "points": 0, "ability": "sailor",
     "desc": "+1 sword strength"},
    {"name": "Guard", "type": "person", "cost": 2, "points": 1, "ability": "guard",
     "desc": "+2 sword strength"},
]

# Expedition cards (expansion only)
EXPEDITION_CARDS = [
    {"name": "Trade Route", "type": "expedition", "requirement": "trader", "count": 2,
     "points": 3, "desc": "Need 2 Traders"},
    {"name": "Colony", "type": "expedition", "requirement": "settler", "count": 2,
     "points": 4, "desc": "Need 2 Settlers"},
    {"name": "Naval Campaign", "type": "expedition", "requirement": "captain", "count": 2,
     "points": 3, "desc": "Need 2 Captains"},
    {"name": "Holy Mission", "type": "expedition", "requirement": "priest", "count": 2,
     "points": 5, "desc": "Need 2 Priests"},
]

TARGET_POINTS = 12


class PortRoyalGame(BaseGame):
    """Port Royal - Push-your-luck card game."""

    name = "Port Royal"
    description = "Push-your-luck card flipping with pirates, ships, and hiring"
    min_players = 2
    max_players = 2
    variations = {
        "standard": "Standard Game",
        "expansion": "With Contracts",
    }

    def __init__(self, variation=None):
        super().__init__(variation)
        self.with_contracts = self.variation == "expansion"
        self.deck = []
        self.harbor = []  # currently flipped cards
        self.ship_colors_in_harbor = []
        self.coins = {}
        self.crew = {}  # player -> list of hired persons
        self.contracts = {}  # player -> list of completed expeditions
        self.available_expeditions = []
        self.phase = "flip"  # flip, hire, opponent_hire
        self.busted = False
        self.hires_remaining = 0
        self.opponent_hires = 0
        self.round_number = 1
        self.log = []

    def setup(self):
        self.deck = list(SHIP_CARDS) + list(PERSON_CARDS) * 2
        if self.with_contracts:
            self.available_expeditions = list(EXPEDITION_CARDS)
            random.shuffle(self.available_expeditions)
        random.shuffle(self.deck)
        for p in [1, 2]:
            sp = str(p)
            self.coins[sp] = 3
            self.crew[sp] = []
            self.contracts[sp] = []
        self.harbor = []
        self.ship_colors_in_harbor = []
        self.phase = "flip"
        self.busted = False
        self.hires_remaining = 0
        self.opponent_hires = 0
        self.round_number = 1
        self.log = ["Welcome to Port Royal! Flip cards to discover your harbor."]

    def _get_sword_strength(self, player):
        sp = str(player)
        strength = 0
        for person in self.crew[sp]:
            if person["ability"] == "sailor":
                strength += 1
            elif person["ability"] == "guard":
                strength += 2
            elif person["ability"] == "captain":
                strength += 1
        return strength

    def _get_hire_discount(self, player):
        sp = str(player)
        discount = 0
        for person in self.crew[sp]:
            if person["ability"] == "mademoiselle":
                discount += 1
        return discount

    def _count_ability(self, player, ability):
        sp = str(player)
        return sum(1 for p in self.crew[sp] if p["ability"] == ability)

    def _max_hires(self):
        """Number of persons the active player can hire from harbor."""
        # Base: 1 hire, +1 if 3+ cards, +1 if 5+ cards
        num_cards = len(self.harbor)
        hires = 1
        if num_cards >= 3:
            hires = 2
        if num_cards >= 5:
            hires = 3
        return hires

    def _reshuffle_if_needed(self):
        if not self.deck:
            self.deck = list(SHIP_CARDS) + list(PERSON_CARDS) * 2
            random.shuffle(self.deck)

    def display(self):
        clear_screen()
        mode = "With Contracts" if self.with_contracts else "Standard"
        print(f"{'=' * 60}")
        print(f"  PORT ROYAL - {mode} | Round {self.round_number}")
        print(f"{'=' * 60}")

        for p in [1, 2]:
            sp = str(p)
            marker = " <<" if p == self.current_player else ""
            pts = sum(c["points"] for c in self.crew[sp])
            pts += sum(c["points"] for c in self.contracts[sp])
            crew_names = ", ".join(c["name"] for c in self.crew[sp][:5])
            if len(self.crew[sp]) > 5:
                crew_names += f" +{len(self.crew[sp])-5} more"
            print(f"  {self.players[p-1]}: {self.coins[sp]} coins | {pts}/{TARGET_POINTS} pts | "
                  f"Crew: {crew_names or 'none'}{marker}")

        print(f"\n  Harbor ({len(self.harbor)} cards):")
        if self.harbor:
            for i, card in enumerate(self.harbor):
                if card["type"] == "ship":
                    print(f"    [{i+1}] {card['name']} - {card['coins']}c to defeat")
                else:
                    cost = max(0, card["cost"] - self._get_hire_discount(self.current_player))
                    print(f"    [{i+1}] {card['name']} ({cost}c) {card['points']}pts {card['desc']}")
        else:
            print("    [empty - flip some cards!]")

        print(f"\n  Deck: {len(self.deck)} cards remaining")
        if self.ship_colors_in_harbor:
            print(f"  Ships in harbor: {', '.join(self.ship_colors_in_harbor)}")

        if self.with_contracts and self.available_expeditions:
            print(f"\n  Available Expeditions:")
            for i, exp in enumerate(self.available_expeditions[:3]):
                print(f"    {exp['name']}: {exp['desc']} -> {exp['points']}pts")

        print(f"\n  Phase: {self.phase}")
        if self.phase == "flip":
            print(f"  Swords: {self._get_sword_strength(self.current_player)}")
        elif self.phase == "hire":
            print(f"  Hires remaining: {self.hires_remaining}")
        if self.log:
            print(f"  Last: {self.log[-1]}")
        print()

    def get_move(self):
        cp = self.current_player
        sp = str(cp)

        if cp == 2:
            return self._ai_get_move()

        if self.phase == "flip":
            print(f"  {self.players[0]}: Flip another card or stop?")
            print(f"  [f] Flip a card    [s] Stop and hire")
            choice = input_with_quit("  Choice: ").strip().lower()
            if choice in ('f', 'flip'):
                return {"action": "flip"}
            elif choice in ('s', 'stop'):
                return {"action": "stop_flip"}
            return None

        elif self.phase == "hire":
            persons = [(i, c) for i, c in enumerate(self.harbor) if c["type"] == "person"]
            ships = [(i, c) for i, c in enumerate(self.harbor) if c["type"] == "ship"]
            if not persons and not ships:
                return {"action": "end_hire"}
            print(f"  Hire a person or defeat a ship? ({self.hires_remaining} hires left)")
            print(f"  Card number, 'expedition' to complete one, or 'done':")
            choice = input_with_quit("  Choice: ").strip().lower()
            if choice in ('done', 'd', ''):
                return {"action": "end_hire"}
            if choice in ('expedition', 'exp', 'e') and self.with_contracts:
                return {"action": "expedition"}
            try:
                idx = int(choice) - 1
                if 0 <= idx < len(self.harbor):
                    return {"action": "hire", "index": idx}
            except ValueError:
                pass
            return None

        elif self.phase == "opponent_hire":
            persons = [(i, c) for i, c in enumerate(self.harbor) if c["type"] == "person"]
            if not persons or self.opponent_hires <= 0:
                return {"action": "end_opponent_hire"}
            print(f"  {self.players[cp-1]}, hire from the harbor? (pay 1 extra coin)")
            choice = input_with_quit("  Card number or 'done': ").strip().lower()
            if choice in ('done', 'd', ''):
                return {"action": "end_opponent_hire"}
            try:
                idx = int(choice) - 1
                if 0 <= idx < len(self.harbor):
                    return {"action": "opponent_hire", "index": idx}
            except ValueError:
                pass
            return None

        return None

    def _ai_get_move(self):
        """AI decision making."""
        sp = "2"

        if self.phase == "flip":
            ship_count = len(self.ship_colors_in_harbor)
            unique_colors = len(set(self.ship_colors_in_harbor))
            if ship_count > 0 and ship_count != unique_colors:
                return {"action": "stop_flip"}  # would bust
            if len(self.harbor) >= 4:
                return {"action": "stop_flip"}
            return {"action": "flip"}

        elif self.phase == "hire":
            if self.hires_remaining <= 0:
                return {"action": "end_hire"}
            # Try to hire best affordable person
            best_idx = None
            best_val = -1
            discount = self._get_hire_discount(2)
            for i, card in enumerate(self.harbor):
                if card["type"] == "person":
                    cost = max(0, card["cost"] - discount)
                    if cost <= self.coins[sp] and card["points"] > best_val:
                        best_val = card["points"]
                        best_idx = i
                elif card["type"] == "ship":
                    if self._get_sword_strength(2) >= card["coins"]:
                        if card["coins"] > best_val:
                            best_val = card["coins"]
                            best_idx = i
            if best_idx is not None:
                return {"action": "hire", "index": best_idx}
            return {"action": "end_hire"}

        elif self.phase == "opponent_hire":
            if self.opponent_hires <= 0:
                return {"action": "end_opponent_hire"}
            for i, card in enumerate(self.harbor):
                if card["type"] == "person":
                    cost = max(0, card["cost"] - self._get_hire_discount(2)) + 1
                    if cost <= self.coins[sp] and card["points"] >= 2:
                        return {"action": "opponent_hire", "index": i}
            return {"action": "end_opponent_hire"}

        return {"action": "end_hire"}

    def make_move(self, move):
        if move is None:
            return False
        cp = self.current_player
        sp = str(cp)
        action = move.get("action")

        if action == "flip":
            self._reshuffle_if_needed()
            if not self.deck:
                self.phase = "hire"
                self.hires_remaining = self._max_hires()
                return True
            card = self.deck.pop()
            self.harbor.append(card)
            if card["type"] == "ship":
                color = card["color"]
                if color in self.ship_colors_in_harbor:
                    # BUST!
                    self.busted = True
                    self.log.append(f"BUST! Two {color} ships! {self.players[cp-1]} gets nothing.")
                    self.harbor = []
                    self.ship_colors_in_harbor = []
                    self.phase = "flip"
                    # End turn
                    self._end_active_turn()
                    return True
                self.ship_colors_in_harbor.append(color)
                self.log.append(f"Flipped {card['name']} ({card['coins']} coins)")
            else:
                self.log.append(f"Flipped {card['name']} ({card['cost']} cost, {card['points']}pts)")
            return True

        if action == "stop_flip":
            if not self.harbor:
                return False
            # Defeat all ships first (collect their coins)
            ships_defeated = []
            strength = self._get_sword_strength(cp)
            for card in self.harbor[:]:
                if card["type"] == "ship":
                    if strength >= card["coins"]:
                        self.coins[sp] += card["coins"]
                        trader_bonus = self._count_ability(cp, "trader")
                        self.coins[sp] += trader_bonus
                        ships_defeated.append(card)
            for s in ships_defeated:
                if s in self.harbor:
                    self.harbor.remove(s)
            if ships_defeated:
                self.log.append(f"Defeated {len(ships_defeated)} ships, earned coins!")
            self.ship_colors_in_harbor = []
            self.hires_remaining = self._max_hires()
            self.phase = "hire"
            self.log.append(f"{self.players[cp-1]} stops flipping. {self.hires_remaining} hires available.")
            return True

        if action == "hire":
            idx = move["index"]
            if idx < 0 or idx >= len(self.harbor):
                return False
            if self.hires_remaining <= 0:
                return False
            card = self.harbor[idx]
            if card["type"] == "person":
                discount = self._get_hire_discount(cp)
                cost = max(0, card["cost"] - discount)
                if self.coins[sp] < cost:
                    return False
                self.coins[sp] -= cost
                self.crew[sp].append(card)
                self.harbor.pop(idx)
                self.hires_remaining -= 1
                self.log.append(f"{self.players[cp-1]} hired {card['name']} for {cost} coins")
                # Pirate ability
                if card["ability"] == "pirate":
                    opp = "2" if sp == "1" else "1"
                    stolen = min(1, self.coins[opp])
                    self.coins[opp] -= stolen
                    self.coins[sp] += stolen
                return True
            elif card["type"] == "ship":
                strength = self._get_sword_strength(cp)
                if strength < card["coins"]:
                    return False
                self.coins[sp] += card["coins"]
                self.harbor.pop(idx)
                self.hires_remaining -= 1
                self.log.append(f"{self.players[cp-1]} defeated {card['name']} for {card['coins']} coins")
                return True
            return False

        if action == "expedition" and self.with_contracts:
            if not self.available_expeditions:
                return False
            # Check if player meets any expedition requirement
            for i, exp in enumerate(self.available_expeditions[:3]):
                count = self._count_ability(cp, exp["requirement"])
                if count >= exp["count"]:
                    self.contracts[sp].append(exp)
                    self.available_expeditions.pop(i)
                    self.log.append(f"{self.players[cp-1]} completed {exp['name']}!")
                    return True
            return False

        if action == "end_hire":
            # Admiral bonus
            admiral_count = self._count_ability(cp, "admiral")
            if admiral_count > 0:
                bonus = admiral_count * 2
                self.coins[sp] += bonus
            # Opponent gets a chance to hire
            self.opponent_hires = 1
            self.phase = "opponent_hire"
            return True

        if action == "opponent_hire":
            idx = move["index"]
            if idx < 0 or idx >= len(self.harbor):
                return False
            if self.opponent_hires <= 0:
                return False
            card = self.harbor[idx]
            if card["type"] != "person":
                return False
            discount = self._get_hire_discount(cp)
            cost = max(0, card["cost"] - discount) + 1  # +1 for opponent hire
            if self.coins[sp] < cost:
                return False
            self.coins[sp] -= cost
            opp = "2" if sp == "1" else "1"
            # Pay 1 coin to active player
            self.coins[opp] = self.coins.get(opp, 0)
            self.crew[sp].append(card)
            self.harbor.pop(idx)
            self.opponent_hires -= 1
            self.log.append(f"{self.players[cp-1]} hired {card['name']} from opponent's harbor")
            return True

        if action == "end_opponent_hire":
            self._end_active_turn()
            return True

        return False

    def _end_active_turn(self):
        """End the active player's full turn and start next round."""
        self.harbor = []
        self.ship_colors_in_harbor = []
        self.busted = False
        self.phase = "flip"
        self.hires_remaining = 0
        self.opponent_hires = 0
        self.round_number += 1

    def check_game_over(self):
        for p in [1, 2]:
            sp = str(p)
            pts = sum(c["points"] for c in self.crew[sp])
            pts += sum(c["points"] for c in self.contracts[sp])
            if pts >= TARGET_POINTS:
                self.game_over = True
                s1 = sum(c["points"] for c in self.crew["1"]) + sum(c["points"] for c in self.contracts["1"])
                s2 = sum(c["points"] for c in self.crew["2"]) + sum(c["points"] for c in self.contracts["2"])
                if s1 > s2:
                    self.winner = 1
                elif s2 > s1:
                    self.winner = 2
                else:
                    # Tiebreaker: most coins
                    if self.coins["1"] > self.coins["2"]:
                        self.winner = 1
                    elif self.coins["2"] > self.coins["1"]:
                        self.winner = 2
                    else:
                        self.winner = None
                return

    def get_state(self):
        return {
            "deck": self.deck,
            "harbor": self.harbor,
            "ship_colors_in_harbor": self.ship_colors_in_harbor,
            "coins": self.coins,
            "crew": self.crew,
            "contracts": self.contracts,
            "available_expeditions": self.available_expeditions,
            "phase": self.phase,
            "busted": self.busted,
            "hires_remaining": self.hires_remaining,
            "opponent_hires": self.opponent_hires,
            "round_number": self.round_number,
            "log": self.log,
        }

    def load_state(self, state):
        self.deck = state["deck"]
        self.harbor = state["harbor"]
        self.ship_colors_in_harbor = state["ship_colors_in_harbor"]
        self.coins = state["coins"]
        self.crew = state["crew"]
        self.contracts = state.get("contracts", {"1": [], "2": []})
        self.available_expeditions = state.get("available_expeditions", [])
        self.phase = state["phase"]
        self.busted = state["busted"]
        self.hires_remaining = state["hires_remaining"]
        self.opponent_hires = state.get("opponent_hires", 0)
        self.round_number = state.get("round_number", 1)
        self.log = state.get("log", [])

    def get_tutorial(self):
        return """
============================================================
  PORT ROYAL - Tutorial
============================================================
  Push your luck flipping cards. Ships can bust you, people
  can be hired for points. First to 12 points wins!

  FLIP: Flip cards into harbor. Two same-color ships = BUST!
  HIRE: Hire people (pay cost) or defeat ships (need swords).
  Hires allowed: 1 (base), 2 (3+ cards), 3 (5+ cards).
  Opponent may hire 1 person (pays +1 coin extra).
  Abilities: Sailor/Guard=swords, Trader=bonus coins,
  Admiral=+2 coins, Pirate=steal, Mademoiselle=discount.
============================================================
"""
