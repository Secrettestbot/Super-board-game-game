"""Eminent Domain - Deck-building with role selection."""

import random

from engine.base import BaseGame, input_with_quit, clear_screen


# Planet definitions
PLANET_TYPES = [
    {"name": "Fertile World", "cost_colonize": 3, "cost_warfare": 2,
     "resource_type": "food", "influence": 2, "slots": 1},
    {"name": "Metallic World", "cost_colonize": 4, "cost_warfare": 3,
     "resource_type": "metal", "influence": 3, "slots": 2},
    {"name": "Advanced World", "cost_colonize": 5, "cost_warfare": 4,
     "resource_type": "tech", "influence": 4, "slots": 2},
    {"name": "Prestige World", "cost_colonize": 6, "cost_warfare": 5,
     "resource_type": "luxury", "influence": 5, "slots": 3},
    {"name": "Barren World", "cost_colonize": 2, "cost_warfare": 1,
     "resource_type": "metal", "influence": 1, "slots": 1},
    {"name": "Lush World", "cost_colonize": 3, "cost_warfare": 3,
     "resource_type": "food", "influence": 3, "slots": 2},
    {"name": "Tech World", "cost_colonize": 5, "cost_warfare": 3,
     "resource_type": "tech", "influence": 4, "slots": 2},
    {"name": "Paradise World", "cost_colonize": 4, "cost_warfare": 4,
     "resource_type": "luxury", "influence": 4, "slots": 2},
]

# Resource trade values
TRADE_VALUES = {"food": 1, "metal": 2, "tech": 3, "luxury": 4}

# Role cards
ROLE_TYPES = ["Survey", "Colonize", "Warfare", "Produce", "Trade"]

ROLE_DESCRIPTIONS = {
    "Survey": "Explore the galaxy to find new planets",
    "Colonize": "Settle planets peacefully (need colonize symbols)",
    "Warfare": "Conquer planets by force (need warfare symbols)",
    "Produce": "Produce resources on settled planets",
    "Trade": "Trade resources for influence points",
}

# Starting deck composition
STARTING_DECK = [
    {"role": "Survey", "symbols": 1},
    {"role": "Survey", "symbols": 1},
    {"role": "Colonize", "symbols": 1},
    {"role": "Colonize", "symbols": 1},
    {"role": "Warfare", "symbols": 1},
    {"role": "Warfare", "symbols": 1},
    {"role": "Produce", "symbols": 1},
    {"role": "Trade", "symbols": 1},
]


class EminentDomainGame(BaseGame):
    """Eminent Domain: Build your deck, choose roles, conquer the galaxy."""

    name = "Eminent Domain"
    description = "Deck-building with role selection - survey, colonize, and trade across the galaxy"
    min_players = 2
    max_players = 2
    variations = {
        "standard": "Full planet deck, target 20 influence",
        "quick": "Fewer planets, target 15 influence",
    }

    def __init__(self, variation=None):
        super().__init__(variation)
        self.planet_deck = []
        self.hands = [[], []]
        self.draw_piles = [[], []]
        self.discard_piles = [[], []]
        self.surveyed_planets = [[], []]  # planets found but not settled
        self.settled_planets = [[], []]  # settled planets
        self.colonize_progress = [{}, {}]  # planet_idx -> colonize tokens
        self.warfare_tokens = [0, 0]
        self.resources = [[], []]  # list of resource types on planets
        self.influence = [0, 0]
        self.target_influence = 20
        self.role_supply = {}  # role -> count remaining in supply
        self.phase = "action"  # "action", "role", "follow"
        self.current_role = None
        self.follow_player = None
        self.hand_size = 5

    def setup(self):
        if self.variation == "quick":
            self.target_influence = 15
            planet_count = 8
        else:
            self.target_influence = 20
            planet_count = 16

        # Build planet deck
        self.planet_deck = []
        while len(self.planet_deck) < planet_count:
            for pt in PLANET_TYPES:
                if len(self.planet_deck) < planet_count:
                    self.planet_deck.append(dict(pt))
        random.shuffle(self.planet_deck)

        # Role supply
        supply_count = 16 if self.variation != "quick" else 10
        self.role_supply = {role: supply_count for role in ROLE_TYPES}

        # Set up each player
        for p in range(2):
            deck = [dict(card) for card in STARTING_DECK]
            random.shuffle(deck)
            self.draw_piles[p] = deck
            self.hands[p] = []
            self.discard_piles[p] = []
            self.surveyed_planets[p] = []
            self.settled_planets[p] = []
            self.colonize_progress[p] = {}
            self.warfare_tokens[p] = 0
            self.resources[p] = []
            self.influence[p] = 0
            # Draw starting hand
            for _ in range(self.hand_size):
                self._draw_card(p)

        self.phase = "action"
        self.current_role = None

    def _draw_card(self, player):
        if not self.draw_piles[player]:
            self.draw_piles[player] = list(self.discard_piles[player])
            self.discard_piles[player] = []
            random.shuffle(self.draw_piles[player])
        if self.draw_piles[player]:
            card = self.draw_piles[player].pop()
            self.hands[player].append(card)

    def _count_symbols(self, player, role):
        """Count symbols of a given role in player's hand."""
        return sum(card["symbols"] for card in self.hands[player] if card["role"] == role)

    def _play_role_cards(self, player, role):
        """Remove role cards from hand (they're 'played'). Returns count of symbols."""
        played = [c for c in self.hands[player] if c["role"] == role]
        self.hands[player] = [c for c in self.hands[player] if c["role"] != role]
        total = sum(c["symbols"] for c in played)
        self.discard_piles[player].extend(played)
        return total

    def display(self):
        clear_screen()
        p = self.current_player - 1

        print(f"{'=' * 65}")
        print(f"  EMINENT DOMAIN - Target: {self.target_influence} Influence")
        print(f"{'=' * 65}")

        # Planet deck info
        print(f"\n  Planet Deck: {len(self.planet_deck)} planets remaining")
        print(f"  Role Supply: ", end="")
        supply_parts = [f"{role}:{self.role_supply[role]}" for role in ROLE_TYPES]
        print(" | ".join(supply_parts))

        # Both players
        for pi in range(2):
            marker = " <<< ACTIVE" if pi == p else ""
            print(f"\n  {'-' * 55}")
            print(f"  {self.players[pi]} - Influence: {self.influence[pi]}/{self.target_influence}"
                  f" | Warfare: {self.warfare_tokens[pi]}{marker}")
            print(f"    Hand: {len(self.hands[pi])} | Deck: {len(self.draw_piles[pi])} | "
                  f"Discard: {len(self.discard_piles[pi])}")

            # Surveyed planets
            if self.surveyed_planets[pi]:
                print(f"    Surveyed (unsettled):")
                for i, planet in enumerate(self.surveyed_planets[pi]):
                    col_prog = self.colonize_progress[pi].get(str(i), 0)
                    col_str = f" [Colonize: {col_prog}/{planet['cost_colonize']}]" if col_prog > 0 else ""
                    print(f"      [{i + 1}] {planet['name']} (Col:{planet['cost_colonize']} "
                          f"War:{planet['cost_warfare']} Inf:{planet['influence']}){col_str}")

            # Settled planets
            if self.settled_planets[pi]:
                print(f"    Settled planets:")
                for i, planet in enumerate(self.settled_planets[pi]):
                    res_str = ""
                    res_on = [r for r in self.resources[pi] if r.get("planet_idx") == i]
                    if res_on:
                        res_str = f" Resources: {', '.join(r['type'] for r in res_on)}"
                    print(f"      {planet['name']} ({planet['resource_type']}, "
                          f"Inf:{planet['influence']}, Slots:{planet['slots']}){res_str}")

        # Current player's hand
        print(f"\n  {'-' * 55}")
        print(f"  Your Hand ({self.players[p]}):")
        if self.hands[p]:
            for i, card in enumerate(self.hands[p]):
                sym_str = "*" * card["symbols"]
                print(f"    [{i + 1}] {card['role']} ({sym_str})")
        else:
            print(f"    (empty)")

        # Role symbol counts
        counts = {role: self._count_symbols(p, role) for role in ROLE_TYPES}
        count_str = " | ".join(f"{r}:{counts[r]}" for r in ROLE_TYPES if counts[r] > 0)
        if count_str:
            print(f"    Symbols: {count_str}")

        print(f"\n  Phase: {self.phase}")
        print(f"{'=' * 65}")

    def get_move(self):
        p = self.current_player - 1

        if self.phase == "action":
            print(f"  ACTION PHASE: Play cards from hand for their action.")
            print(f"  (p)lay a card action, or (s)kip to role selection:")
            choice = input_with_quit("  > ").strip().lower()

            if choice in ("s", "skip", "n"):
                return ("skip_action", "")

            if choice in ("p", "play"):
                print(f"  Play which card? (number):")
                idx = input_with_quit("  > ").strip()
                return ("play_action", idx)

            return ("invalid", "")

        elif self.phase == "role":
            print(f"  ROLE PHASE: Choose a role to execute.")
            print(f"  Available roles:")
            for i, role in enumerate(ROLE_TYPES):
                if self.role_supply[role] > 0:
                    desc = ROLE_DESCRIPTIONS[role]
                    syms = self._count_symbols(p, role)
                    print(f"    [{i + 1}] {role} (you have {syms} symbols) - {desc}")
            print(f"  Choose role (1-{len(ROLE_TYPES)}):")
            choice = input_with_quit("  > ").strip()
            return ("choose_role", choice)

        elif self.phase == "follow":
            opp = 1 - p
            role = self.current_role
            syms = self._count_symbols(p, role)
            print(f"  {self.players[p]}: {self.players[1 - p]} chose {role}!")
            print(f"  (f)ollow (play your {role} cards too) or (d)issent (draw 1 card)?")
            choice = input_with_quit("  > ").strip().lower()
            if choice in ("f", "follow"):
                return ("follow", "")
            return ("dissent", "")

        return ("invalid", "")

    def make_move(self, move):
        action, data = move
        p = self.current_player - 1
        opp = 1 - p

        if action == "skip_action":
            self.phase = "role"
            return True

        if action == "play_action":
            try:
                idx = int(data) - 1
                if idx < 0 or idx >= len(self.hands[p]):
                    return False
            except (ValueError, TypeError):
                return False

            card = self.hands[p][idx]
            role = card["role"]

            # Execute action based on card role
            if role == "Survey":
                if self.planet_deck:
                    planet = self.planet_deck.pop()
                    self.surveyed_planets[p].append(planet)
                    print(f"  Surveyed: {planet['name']}!")
                else:
                    print(f"  No planets left to survey!")
                    return False

            elif role == "Colonize":
                if self.surveyed_planets[p]:
                    print(f"  Add colonize token to which surveyed planet? (1-{len(self.surveyed_planets[p])}):")
                    target = input_with_quit("  > ").strip()
                    try:
                        tidx = int(target) - 1
                        if tidx < 0 or tidx >= len(self.surveyed_planets[p]):
                            return False
                    except (ValueError, TypeError):
                        return False
                    key = str(tidx)
                    self.colonize_progress[p][key] = self.colonize_progress[p].get(key, 0) + card["symbols"]
                    planet = self.surveyed_planets[p][tidx]
                    if self.colonize_progress[p][key] >= planet["cost_colonize"]:
                        # Planet is settled!
                        settled = self.surveyed_planets[p].pop(tidx)
                        self.settled_planets[p].append(settled)
                        self.influence[p] += settled["influence"]
                        # Clean up progress keys
                        del self.colonize_progress[p][key]
                        # Reindex remaining progress
                        new_progress = {}
                        for k, v in self.colonize_progress[p].items():
                            ki = int(k)
                            if ki > tidx:
                                new_progress[str(ki - 1)] = v
                            else:
                                new_progress[k] = v
                        self.colonize_progress[p] = new_progress
                        print(f"  {settled['name']} SETTLED! +{settled['influence']} influence!")
                    else:
                        current = self.colonize_progress[p][key]
                        needed = planet["cost_colonize"]
                        print(f"  Colonize progress: {current}/{needed}")
                else:
                    print(f"  No surveyed planets to colonize!")
                    return False

            elif role == "Warfare":
                self.warfare_tokens[p] += card["symbols"]
                print(f"  Gained {card['symbols']} warfare token(s)! Total: {self.warfare_tokens[p]}")
                # Check if can conquer any surveyed planet
                conquerable = [
                    (i, pl) for i, pl in enumerate(self.surveyed_planets[p])
                    if pl["cost_warfare"] <= self.warfare_tokens[p]
                ]
                if conquerable:
                    print(f"  You can conquer:")
                    for i, pl in conquerable:
                        print(f"    [{i + 1}] {pl['name']} (cost: {pl['cost_warfare']})")
                    print(f"  Conquer a planet? (number or 'n'):")
                    target = input_with_quit("  > ").strip().lower()
                    if target not in ("n", "no", ""):
                        try:
                            tidx = int(target) - 1
                            if tidx < 0 or tidx >= len(self.surveyed_planets[p]):
                                pass
                            else:
                                planet = self.surveyed_planets[p][tidx]
                                if self.warfare_tokens[p] >= planet["cost_warfare"]:
                                    self.warfare_tokens[p] -= planet["cost_warfare"]
                                    settled = self.surveyed_planets[p].pop(tidx)
                                    self.settled_planets[p].append(settled)
                                    self.influence[p] += settled["influence"]
                                    # Clean up colonize progress
                                    key = str(tidx)
                                    if key in self.colonize_progress[p]:
                                        del self.colonize_progress[p][key]
                                    new_progress = {}
                                    for k, v in self.colonize_progress[p].items():
                                        ki = int(k)
                                        if ki > tidx:
                                            new_progress[str(ki - 1)] = v
                                        else:
                                            new_progress[k] = v
                                    self.colonize_progress[p] = new_progress
                                    print(f"  {settled['name']} CONQUERED! +{settled['influence']} influence!")
                        except (ValueError, TypeError):
                            pass

            elif role == "Produce":
                produced = 0
                for i, planet in enumerate(self.settled_planets[p]):
                    current_res = len([r for r in self.resources[p] if r.get("planet_idx") == i])
                    if current_res < planet["slots"]:
                        self.resources[p].append({
                            "type": planet["resource_type"],
                            "planet_idx": i,
                        })
                        produced += 1
                if produced:
                    print(f"  Produced {produced} resource(s)!")
                else:
                    print(f"  No empty slots to produce!")
                    return False

            elif role == "Trade":
                if self.resources[p]:
                    total_value = sum(TRADE_VALUES.get(r["type"], 1) for r in self.resources[p])
                    self.influence[p] += total_value
                    self.resources[p] = []
                    print(f"  Traded all resources for {total_value} influence!")
                else:
                    print(f"  No resources to trade!")
                    return False

            # Discard the played card
            self.hands[p].pop(idx)
            self.discard_piles[p].append(card)
            input("  Press Enter...")
            return True

        if action == "choose_role":
            try:
                idx = int(data) - 1
                if idx < 0 or idx >= len(ROLE_TYPES):
                    return False
            except (ValueError, TypeError):
                return False

            role = ROLE_TYPES[idx]
            if self.role_supply[role] <= 0:
                print(f"  No {role} cards left in supply!")
                input("  Press Enter...")
                return False

            self.current_role = role
            # Take role card from supply into discard
            self.role_supply[role] -= 1
            new_card = {"role": role, "symbols": 1}
            self.discard_piles[p].append(new_card)

            # Execute role with all matching cards from hand
            symbols = self._play_role_cards(p, role) + 1  # +1 for the role card itself

            self._execute_role(p, role, symbols)

            # Switch to follow phase for opponent
            self.phase = "follow"
            self.follow_player = opp
            self.current_player = opp + 1
            input("  Press Enter...")
            return True

        if action == "follow":
            role = self.current_role
            symbols = self._play_role_cards(p, role)
            if symbols > 0:
                self._execute_role(p, role, symbols)
                print(f"  Followed with {symbols} {role} symbols!")
            else:
                print(f"  No {role} cards to follow with! Drawing instead.")
                self._draw_card(p)
            self._end_turn()
            input("  Press Enter...")
            return True

        if action == "dissent":
            self._draw_card(p)
            print(f"  Drew 1 card.")
            self._end_turn()
            input("  Press Enter...")
            return True

        return False

    def _execute_role(self, player, role, symbols):
        """Execute a role with the given number of symbols."""
        if role == "Survey":
            for _ in range(symbols):
                if self.planet_deck:
                    planet = self.planet_deck.pop()
                    self.surveyed_planets[player].append(planet)
                    print(f"  Surveyed: {planet['name']}!")

        elif role == "Colonize":
            if self.surveyed_planets[player]:
                # Auto-apply to first surveyed planet
                for i, planet in enumerate(self.surveyed_planets[player]):
                    key = str(i)
                    remaining = planet["cost_colonize"] - self.colonize_progress[player].get(key, 0)
                    if remaining > 0:
                        applied = min(symbols, remaining)
                        self.colonize_progress[player][key] = self.colonize_progress[player].get(key, 0) + applied
                        symbols -= applied
                        if self.colonize_progress[player][key] >= planet["cost_colonize"]:
                            settled = self.surveyed_planets[player].pop(i)
                            self.settled_planets[player].append(settled)
                            self.influence[player] += settled["influence"]
                            del self.colonize_progress[player][key]
                            new_progress = {}
                            for k, v in self.colonize_progress[player].items():
                                ki = int(k)
                                if ki > i:
                                    new_progress[str(ki - 1)] = v
                                else:
                                    new_progress[k] = v
                            self.colonize_progress[player] = new_progress
                            print(f"  {settled['name']} SETTLED! +{settled['influence']} influence!")
                        else:
                            current = self.colonize_progress[player][key]
                            print(f"  Colonize progress on {planet['name']}: {current}/{planet['cost_colonize']}")
                        if symbols <= 0:
                            break

        elif role == "Warfare":
            self.warfare_tokens[player] += symbols
            print(f"  Gained {symbols} warfare tokens! Total: {self.warfare_tokens[player]}")
            # Auto-conquer cheapest planet if possible
            while self.surveyed_planets[player]:
                cheapest_idx = None
                cheapest_cost = 999
                for i, pl in enumerate(self.surveyed_planets[player]):
                    if pl["cost_warfare"] <= self.warfare_tokens[player] and pl["cost_warfare"] < cheapest_cost:
                        cheapest_idx = i
                        cheapest_cost = pl["cost_warfare"]
                if cheapest_idx is not None:
                    planet = self.surveyed_planets[player][cheapest_idx]
                    self.warfare_tokens[player] -= planet["cost_warfare"]
                    settled = self.surveyed_planets[player].pop(cheapest_idx)
                    self.settled_planets[player].append(settled)
                    self.influence[player] += settled["influence"]
                    key = str(cheapest_idx)
                    if key in self.colonize_progress[player]:
                        del self.colonize_progress[player][key]
                    new_progress = {}
                    for k, v in self.colonize_progress[player].items():
                        ki = int(k)
                        if ki > cheapest_idx:
                            new_progress[str(ki - 1)] = v
                        else:
                            new_progress[k] = v
                    self.colonize_progress[player] = new_progress
                    print(f"  {settled['name']} CONQUERED! +{settled['influence']} influence!")
                else:
                    break

        elif role == "Produce":
            produced = 0
            for i, planet in enumerate(self.settled_planets[player]):
                current_res = len([r for r in self.resources[player] if r.get("planet_idx") == i])
                if current_res < planet["slots"] and produced < symbols:
                    self.resources[player].append({
                        "type": planet["resource_type"],
                        "planet_idx": i,
                    })
                    produced += 1
            print(f"  Produced {produced} resource(s)!")

        elif role == "Trade":
            if self.resources[player]:
                # Trade up to 'symbols' resources
                to_trade = min(symbols, len(self.resources[player]))
                traded = self.resources[player][:to_trade]
                self.resources[player] = self.resources[player][to_trade:]
                total_value = sum(TRADE_VALUES.get(r["type"], 1) for r in traded)
                self.influence[player] += total_value
                print(f"  Traded {to_trade} resource(s) for {total_value} influence!")

    def _end_turn(self):
        """End the current turn cycle and set up for next player's turn."""
        # The original active player draws up
        leader = 1 - (self.current_player - 1)  # the player who chose the role
        while len(self.hands[leader]) < self.hand_size:
            self._draw_card(leader)

        follower = self.current_player - 1
        while len(self.hands[follower]) < self.hand_size:
            self._draw_card(follower)

        # Next turn: the leader's opponent becomes active
        self.current_player = leader + 1  # switch_player will be called by game loop
        self.phase = "action"
        self.current_role = None

    def switch_player(self):
        """Override to handle follow phase player switching."""
        if self.phase != "follow":
            self.current_player = 2 if self.current_player == 1 else 1

    def check_game_over(self):
        for pi in range(2):
            if self.influence[pi] >= self.target_influence:
                self.game_over = True
                if self.influence[0] > self.influence[1]:
                    self.winner = 1
                elif self.influence[1] > self.influence[0]:
                    self.winner = 2
                else:
                    # Tiebreak: most settled planets
                    if len(self.settled_planets[0]) > len(self.settled_planets[1]):
                        self.winner = 1
                    elif len(self.settled_planets[1]) > len(self.settled_planets[0]):
                        self.winner = 2
                    else:
                        self.winner = None
                return

        # Also end if planet deck is empty and no one has surveyed planets
        if not self.planet_deck:
            all_surveyed_empty = all(len(self.surveyed_planets[pi]) == 0 for pi in range(2))
            if all_surveyed_empty:
                self.game_over = True
                if self.influence[0] > self.influence[1]:
                    self.winner = 1
                elif self.influence[1] > self.influence[0]:
                    self.winner = 2
                else:
                    self.winner = None

        # End if any role supply is depleted
        depleted = sum(1 for r in ROLE_TYPES if self.role_supply[r] <= 0)
        if depleted >= 2:
            self.game_over = True
            if self.influence[0] > self.influence[1]:
                self.winner = 1
            elif self.influence[1] > self.influence[0]:
                self.winner = 2
            else:
                self.winner = None

    def get_state(self):
        return {
            "planet_deck": self.planet_deck,
            "hands": self.hands,
            "draw_piles": self.draw_piles,
            "discard_piles": self.discard_piles,
            "surveyed_planets": self.surveyed_planets,
            "settled_planets": self.settled_planets,
            "colonize_progress": self.colonize_progress,
            "warfare_tokens": self.warfare_tokens,
            "resources": self.resources,
            "influence": self.influence,
            "target_influence": self.target_influence,
            "role_supply": self.role_supply,
            "phase": self.phase,
            "current_role": self.current_role,
            "follow_player": self.follow_player,
            "hand_size": self.hand_size,
        }

    def load_state(self, state):
        self.planet_deck = state["planet_deck"]
        self.hands = state["hands"]
        self.draw_piles = state["draw_piles"]
        self.discard_piles = state["discard_piles"]
        self.surveyed_planets = state["surveyed_planets"]
        self.settled_planets = state["settled_planets"]
        self.colonize_progress = state["colonize_progress"]
        self.warfare_tokens = state["warfare_tokens"]
        self.resources = state["resources"]
        self.influence = state["influence"]
        self.target_influence = state["target_influence"]
        self.role_supply = state["role_supply"]
        self.phase = state["phase"]
        self.current_role = state["current_role"]
        self.follow_player = state["follow_player"]
        self.hand_size = state["hand_size"]

    def get_tutorial(self):
        return """
====================================
  EMINENT DOMAIN - Tutorial
====================================

OVERVIEW:
  Build your deck and conquer the galaxy! Use role selection
  to survey planets, settle them, produce resources, and trade
  for influence points.

TURN STRUCTURE:
  1. ACTION PHASE: Optionally play cards from hand for their action
     - Each card type does something different when played as an action
  2. ROLE PHASE: Choose a role card from the supply
     - The role card goes to your discard (grows your deck!)
     - Play all matching cards from hand to boost the role
     - Your opponent can FOLLOW (play their matching cards) or DISSENT (draw 1)
  3. CLEANUP: Draw back up to 5 cards

ROLES:
  Survey   - Explore to find new planets
  Colonize - Peacefully settle surveyed planets (need enough symbols)
  Warfare  - Gain warfare tokens; conquer planets by force
  Produce  - Generate resources on settled planets
  Trade    - Sell resources for influence points

PLANETS:
  Each planet has colonize cost, warfare cost, influence value,
  resource type, and production slots.

WINNING:
  First to reach the target influence wins!
  Game also ends if 2+ role supplies run out.

STRATEGY:
  - Specialize! Adding role cards to your deck makes you stronger
    at that role over time (deck-building!)
  - Follow opponents' roles when it benefits you
  - Balance between settling planets and producing/trading

COMMANDS:
  (p)lay  - Play a card from hand as an action
  (s)kip  - Skip to role selection
  (f)ollow / (d)issent - When opponent picks a role
  Type 'help' for controls, 'quit' to exit
"""
