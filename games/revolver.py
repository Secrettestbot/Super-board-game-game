"""Revolver - Asymmetric timeline card duel (2-player)."""

import random

from engine.base import BaseGame, input_with_quit, clear_screen


class RevolverGame(BaseGame):
    """Asymmetric duel: Outlaw gang flees across locations while Colonel pursues."""

    name = "Revolver"
    description = "Asymmetric Old West timeline card duel"
    min_players = 2
    max_players = 2
    variations = {
        "standard": "Standard showdown (5 locations)",
        "quick": "Quick draw (3 locations)",
        "epic": "Epic chase (5 locations, larger hands)",
    }

    ALL_LOCATIONS = [
        {"name": "Bank", "symbol": "$", "outlaw_slots": 3, "desc": "The heist begins here"},
        {"name": "Saloon", "symbol": "S", "outlaw_slots": 3, "desc": "A rowdy hideout"},
        {"name": "Canyon", "symbol": "^", "outlaw_slots": 4, "desc": "Narrow passes and ambushes"},
        {"name": "Bridge", "symbol": "=", "outlaw_slots": 3, "desc": "A dangerous crossing"},
        {"name": "Train", "symbol": "T", "outlaw_slots": 4, "desc": "The final escape"},
    ]

    OUTLAW_NAMES = [
        "Snake-Eye", "Mad Dog", "El Diablo", "Coyote",
        "Rattler", "Two-Gun", "Dusty", "Scorpion",
        "Sidewinder", "The Kid", "One-Eye", "Red",
    ]

    LAWMAN_NAMES = [
        "Sheriff", "Deputy", "Marshal", "Ranger",
        "Bounty Hunter", "Posse Leader", "Scout", "Sniper",
        "Cavalry", "Detective", "Judge", "Warden",
    ]

    def __init__(self, variation=None):
        super().__init__(variation)
        self.locations = []
        self.current_location_idx = 0
        self.outlaw_hand = []
        self.colonel_hand = []
        self.outlaw_deployed = {}  # location_idx -> list of {name, strength}
        self.colonel_deployed = {}  # location_idx -> list of {name, strength}
        self.phase = "outlaw_play"  # outlaw_play, colonel_play, resolve, location_end, game_end
        self.outlaw_deck = []
        self.colonel_deck = []
        self.hand_size = 5
        self.log = []
        self.locations_cleared = 0
        self.outlaw_passed = False
        self.colonel_passed = False

    def _add_log(self, msg):
        self.log.append(msg)
        if len(self.log) > 8:
            self.log = self.log[-8:]

    def setup(self):
        if self.variation == "quick":
            self.locations = [dict(loc) for loc in self.ALL_LOCATIONS[:3]]
            self.hand_size = 4
        elif self.variation == "epic":
            self.locations = [dict(loc) for loc in self.ALL_LOCATIONS]
            self.hand_size = 7
        else:
            self.locations = [dict(loc) for loc in self.ALL_LOCATIONS]
            self.hand_size = 5

        self.current_location_idx = 0
        self.outlaw_deployed = {}
        self.colonel_deployed = {}
        self.locations_cleared = 0
        self.phase = "outlaw_play"
        self.log = []
        self.outlaw_passed = False
        self.colonel_passed = False
        self.game_over = False
        self.winner = None
        self.current_player = 1

        # Build decks
        self._build_decks()
        self._draw_hands()

        # Pre-deploy some outlaws at first location
        loc = self.locations[0]
        initial = []
        for i in range(min(2, loc["outlaw_slots"])):
            name = self.OUTLAW_NAMES[i]
            strength = random.randint(2, 4)
            initial.append({"name": name, "strength": strength})
        self.outlaw_deployed[0] = initial

        self._add_log(f"The chase begins at the {loc['name']}!")
        self._add_log(f"{self.players[0]} is the Outlaw, {self.players[1]} is the Colonel.")

    def _build_decks(self):
        """Build card decks for both sides."""
        self.outlaw_deck = []
        used_names = [o["name"] for outlaws in self.outlaw_deployed.values() for o in outlaws]
        available_names = [n for n in self.OUTLAW_NAMES if n not in used_names]
        for i in range(15):
            name = available_names[i % len(available_names)]
            strength = random.randint(1, 5)
            self.outlaw_deck.append({"name": name, "strength": strength, "type": "gang"})
        # Add special cards
        for _ in range(3):
            self.outlaw_deck.append({"name": "Dynamite", "strength": 0, "type": "special_destroy"})
        for _ in range(2):
            self.outlaw_deck.append({"name": "Ambush", "strength": 0, "type": "special_ambush"})
        random.shuffle(self.outlaw_deck)

        self.colonel_deck = []
        for i in range(15):
            name = self.LAWMAN_NAMES[i % len(self.LAWMAN_NAMES)]
            strength = random.randint(1, 5)
            self.colonel_deck.append({"name": name, "strength": strength, "type": "lawman"})
        # Add special cards
        for _ in range(3):
            self.colonel_deck.append({"name": "Reinforcements", "strength": 0, "type": "special_reinforce"})
        for _ in range(2):
            self.colonel_deck.append({"name": "Warrant", "strength": 0, "type": "special_warrant"})
        random.shuffle(self.colonel_deck)

    def _draw_hands(self):
        """Draw up to hand size for both players."""
        while len(self.outlaw_hand) < self.hand_size and self.outlaw_deck:
            self.outlaw_hand.append(self.outlaw_deck.pop())
        while len(self.colonel_hand) < self.hand_size and self.colonel_deck:
            self.colonel_hand.append(self.colonel_deck.pop())

    def display(self):
        clear_screen()
        loc = self.locations[self.current_location_idx]
        print(f"{'=' * 60}")
        print(f"  REVOLVER  |  Location: {loc['name']} [{loc['symbol']}]  |  {loc['desc']}")
        print(f"{'=' * 60}")

        # Location timeline
        print(f"\n  TIMELINE:")
        timeline = "  "
        for i, l in enumerate(self.locations):
            if i < self.current_location_idx:
                timeline += f"[CLEARED]--"
            elif i == self.current_location_idx:
                timeline += f"[>>{l['symbol']}<<]--"
            else:
                timeline += f"[ {l['symbol']} ]--"
        print(timeline.rstrip("-"))

        # Current location battle
        print(f"\n  {'~' * 50}")
        print(f"  OUTLAWS at {loc['name']}:")
        outlaws_here = self.outlaw_deployed.get(self.current_location_idx, [])
        if outlaws_here:
            total_outlaw = sum(o["strength"] for o in outlaws_here)
            for o in outlaws_here:
                bar = "*" * o["strength"]
                print(f"    {o['name']:<14} [{bar:<5}] str:{o['strength']}")
            print(f"    {'Total Outlaw Strength:':<20} {total_outlaw}")
        else:
            print(f"    (none)")

        print(f"\n  LAWMEN at {loc['name']}:")
        lawmen_here = self.colonel_deployed.get(self.current_location_idx, [])
        if lawmen_here:
            total_law = sum(l["strength"] for l in lawmen_here)
            for l in lawmen_here:
                bar = "+" * l["strength"]
                print(f"    {l['name']:<14} [{bar:<5}] str:{l['strength']}")
            print(f"    {'Total Lawman Strength:':<20} {total_law}")
        else:
            print(f"    (none)")
        print(f"  {'~' * 50}")

        # Deck info
        print(f"\n  Outlaw deck: {len(self.outlaw_deck)} cards  |  Colonel deck: {len(self.colonel_deck)} cards")

        # Player hands (show only current player's hand)
        cp = self.current_player
        if cp == 1 and self.phase in ("outlaw_play",):
            print(f"\n  {self.players[0]}'s hand (OUTLAW):")
            for i, card in enumerate(self.outlaw_hand):
                if card["type"] == "gang":
                    print(f"    [{i + 1}] {card['name']} (str:{card['strength']})")
                else:
                    desc = self._special_desc(card)
                    print(f"    [{i + 1}] {card['name']} - {desc}")
        elif cp == 2 and self.phase in ("colonel_play",):
            print(f"\n  {self.players[1]}'s hand (COLONEL):")
            for i, card in enumerate(self.colonel_hand):
                if card["type"] == "lawman":
                    print(f"    [{i + 1}] {card['name']} (str:{card['strength']})")
                else:
                    desc = self._special_desc(card)
                    print(f"    [{i + 1}] {card['name']} - {desc}")

        # Phase info
        if self.phase == "outlaw_play":
            print(f"\n  >> Outlaw ({self.players[0]}): Deploy gang or pass")
        elif self.phase == "colonel_play":
            print(f"\n  >> Colonel ({self.players[1]}): Deploy lawmen or pass")

        # Log
        if self.log:
            print(f"\n  {'~' * 40}")
            for entry in self.log[-5:]:
                print(f"  {entry}")

    def _special_desc(self, card):
        if card["type"] == "special_destroy":
            return "Remove 1 opposing card from this location"
        elif card["type"] == "special_ambush":
            return "All outlaws here get +1 strength"
        elif card["type"] == "special_reinforce":
            return "All lawmen here get +1 strength"
        elif card["type"] == "special_warrant":
            return "Remove 1 outlaw card from this location"
        return ""

    def get_move(self):
        if self.phase == "outlaw_play":
            self.current_player = 1
            return self._get_player_move(1, self.outlaw_hand, "Outlaw")
        elif self.phase == "colonel_play":
            self.current_player = 2
            return self._get_player_move(2, self.colonel_hand, "Colonel")
        elif self.phase == "resolve":
            input_with_quit("\n  Press Enter to resolve the battle...")
            return "resolve"
        elif self.phase == "location_end":
            input_with_quit("\n  Press Enter to advance...")
            return "advance"
        elif self.phase == "game_end":
            input_with_quit("\n  Press Enter to see results...")
            return "end"
        return None

    def _get_player_move(self, player, hand, role):
        loc = self.locations[self.current_location_idx]
        deployed = self.outlaw_deployed.get(self.current_location_idx, []) if player == 1 \
            else self.colonel_deployed.get(self.current_location_idx, [])

        max_slots = loc["outlaw_slots"] if player == 1 else 5
        can_deploy = len(deployed) < max_slots and len(hand) > 0

        if not can_deploy and not hand:
            return ["pass"]

        while True:
            prompt = f"  Play card (1-{len(hand)}) or [P]ass: "
            choice = input_with_quit(prompt).strip().upper()
            if choice == "P":
                return ["pass"]
            try:
                idx = int(choice) - 1
                if 0 <= idx < len(hand):
                    if not can_deploy and hand[idx]["type"] == "gang":
                        print(f"  Location full! No more {role} slots.")
                        continue
                    return ["deploy", idx]
            except ValueError:
                pass
            print(f"  Invalid. Enter 1-{len(hand)} or P.")

    def make_move(self, move):
        if move[0] == "deploy":
            _, idx = move

            if self.phase == "outlaw_play":
                card = self.outlaw_hand.pop(idx)
                self._deploy_card(1, card)
                if not self.colonel_passed:
                    self.phase = "colonel_play"
                elif self.outlaw_passed:
                    self.phase = "resolve"
            elif self.phase == "colonel_play":
                card = self.colonel_hand.pop(idx)
                self._deploy_card(2, card)
                if not self.outlaw_passed:
                    self.phase = "outlaw_play"
                elif self.colonel_passed:
                    self.phase = "resolve"
            return True

        elif move[0] == "pass":
            if self.phase == "outlaw_play":
                self.outlaw_passed = True
                self._add_log(f"{self.players[0]} (Outlaw) passes.")
                if self.colonel_passed:
                    self.phase = "resolve"
                else:
                    self.phase = "colonel_play"
            elif self.phase == "colonel_play":
                self.colonel_passed = True
                self._add_log(f"{self.players[1]} (Colonel) passes.")
                if self.outlaw_passed:
                    self.phase = "resolve"
                else:
                    self.phase = "outlaw_play"
            return True

        elif move == "resolve":
            self._resolve_location()
            return True

        elif move == "advance":
            self._advance_location()
            return True

        elif move == "end":
            return True

        return False

    def _deploy_card(self, player, card):
        loc_idx = self.current_location_idx
        if player == 1:
            if card["type"] == "gang":
                if loc_idx not in self.outlaw_deployed:
                    self.outlaw_deployed[loc_idx] = []
                self.outlaw_deployed[loc_idx].append(card)
                self._add_log(f"Outlaw deploys {card['name']} (str:{card['strength']})")
            elif card["type"] == "special_destroy":
                lawmen = self.colonel_deployed.get(loc_idx, [])
                if lawmen:
                    removed = lawmen.pop(random.randint(0, len(lawmen) - 1))
                    self._add_log(f"Dynamite! {removed['name']} is eliminated!")
                else:
                    self._add_log("Dynamite fizzles - no lawmen here!")
            elif card["type"] == "special_ambush":
                outlaws = self.outlaw_deployed.get(loc_idx, [])
                for o in outlaws:
                    o["strength"] += 1
                self._add_log(f"Ambush! All outlaws get +1 strength!")
        else:
            if card["type"] == "lawman":
                if loc_idx not in self.colonel_deployed:
                    self.colonel_deployed[loc_idx] = []
                self.colonel_deployed[loc_idx].append(card)
                self._add_log(f"Colonel deploys {card['name']} (str:{card['strength']})")
            elif card["type"] == "special_reinforce":
                lawmen = self.colonel_deployed.get(loc_idx, [])
                for l in lawmen:
                    l["strength"] += 1
                self._add_log(f"Reinforcements! All lawmen get +1 strength!")
            elif card["type"] == "special_warrant":
                outlaws = self.outlaw_deployed.get(loc_idx, [])
                if outlaws:
                    removed = outlaws.pop(random.randint(0, len(outlaws) - 1))
                    self._add_log(f"Warrant! {removed['name']} is arrested!")
                else:
                    self._add_log("Warrant fails - no outlaws here!")

    def _resolve_location(self):
        """Compare forces at current location."""
        loc_idx = self.current_location_idx
        loc = self.locations[loc_idx]
        outlaws = self.outlaw_deployed.get(loc_idx, [])
        lawmen = self.colonel_deployed.get(loc_idx, [])

        outlaw_str = sum(o["strength"] for o in outlaws)
        lawman_str = sum(l["strength"] for l in lawmen)

        self._add_log(f"Battle at {loc['name']}: Outlaws {outlaw_str} vs Lawmen {lawman_str}")

        if lawman_str > outlaw_str:
            # Colonel wins - location cleared
            self.locations_cleared += 1
            self._add_log(f"Colonel clears {loc['name']}! ({self.locations_cleared}/{len(self.locations)})")
            self.outlaw_deployed[loc_idx] = []
            self.colonel_deployed[loc_idx] = []

            if self.locations_cleared >= len(self.locations):
                self.phase = "game_end"
                self._add_log("The Colonel has caught the gang!")
            elif self.current_location_idx + 1 >= len(self.locations):
                self.phase = "game_end"
                self._add_log("Final location resolved!")
            else:
                self.phase = "location_end"
        else:
            # Outlaw holds or ties
            self._add_log(f"Outlaws hold {loc['name']}!")
            # Surviving outlaws lose strength from battle
            casualties = lawman_str
            for o in outlaws:
                if casualties <= 0:
                    break
                dmg = min(o["strength"] - 1, casualties)
                if dmg > 0:
                    o["strength"] -= dmg
                    casualties -= dmg
            # Remove dead outlaws
            self.outlaw_deployed[loc_idx] = [o for o in outlaws if o["strength"] > 0]
            self.colonel_deployed[loc_idx] = []

            if self.current_location_idx + 1 >= len(self.locations):
                self.phase = "game_end"
                self._add_log("The gang reaches the final stop!")
            else:
                self.phase = "location_end"

    def _advance_location(self):
        """Move to next location."""
        self.current_location_idx += 1
        if self.current_location_idx >= len(self.locations):
            self.phase = "game_end"
            return

        loc = self.locations[self.current_location_idx]
        self.outlaw_passed = False
        self.colonel_passed = False
        self.phase = "outlaw_play"

        # Surviving outlaws move forward
        prev_idx = self.current_location_idx - 1
        survivors = self.outlaw_deployed.get(prev_idx, [])
        if survivors:
            self.outlaw_deployed[self.current_location_idx] = list(survivors)
            self.outlaw_deployed[prev_idx] = []
        else:
            # Spawn some outlaws if none survived
            new_outlaws = []
            for i in range(2):
                name = random.choice(self.OUTLAW_NAMES)
                strength = random.randint(1, 3)
                new_outlaws.append({"name": name, "strength": strength})
            self.outlaw_deployed[self.current_location_idx] = new_outlaws

        # Draw new cards
        self._draw_hands()
        self._add_log(f"The chase moves to {loc['name']}!")

    def check_game_over(self):
        if self.phase == "game_end":
            self.game_over = True
            # Colonel wins if cleared all locations
            if self.locations_cleared >= len(self.locations):
                self.winner = 2  # Colonel
                self._add_log("COLONEL WINS! The outlaws are captured!")
            else:
                self.winner = 1  # Outlaw
                self._add_log("OUTLAW WINS! The gang escapes!")

    def switch_player(self):
        """Override: game manages player turns internally."""
        pass

    def get_state(self):
        return {
            "locations": self.locations,
            "current_location_idx": self.current_location_idx,
            "outlaw_hand": self.outlaw_hand,
            "colonel_hand": self.colonel_hand,
            "outlaw_deployed": {str(k): v for k, v in self.outlaw_deployed.items()},
            "colonel_deployed": {str(k): v for k, v in self.colonel_deployed.items()},
            "phase": self.phase,
            "outlaw_deck": self.outlaw_deck,
            "colonel_deck": self.colonel_deck,
            "hand_size": self.hand_size,
            "log": self.log,
            "locations_cleared": self.locations_cleared,
            "outlaw_passed": self.outlaw_passed,
            "colonel_passed": self.colonel_passed,
        }

    def load_state(self, state):
        self.locations = state["locations"]
        self.current_location_idx = state["current_location_idx"]
        self.outlaw_hand = state["outlaw_hand"]
        self.colonel_hand = state["colonel_hand"]
        self.outlaw_deployed = {int(k): v for k, v in state["outlaw_deployed"].items()}
        self.colonel_deployed = {int(k): v for k, v in state["colonel_deployed"].items()}
        self.phase = state["phase"]
        self.outlaw_deck = state["outlaw_deck"]
        self.colonel_deck = state["colonel_deck"]
        self.hand_size = state["hand_size"]
        self.log = state["log"]
        self.locations_cleared = state["locations_cleared"]
        self.outlaw_passed = state["outlaw_passed"]
        self.colonel_passed = state["colonel_passed"]

    def get_tutorial(self):
        return """
========================================
  REVOLVER - Tutorial
========================================

OVERVIEW:
  An asymmetric Old West duel! Player 1 is the Outlaw gang
  fleeing across locations. Player 2 is the Colonel pursuing
  with lawmen. Each location is a battleground.

ROLES:
  OUTLAW (Player 1):
    - Deploy gang members to hold locations
    - Use Dynamite to remove lawmen
    - Use Ambush to boost your gang (+1 all)
    - Win by surviving across all locations

  COLONEL (Player 2):
    - Deploy lawmen to overpower outlaws
    - Use Reinforcements to boost lawmen (+1 all)
    - Use Warrant to remove an outlaw
    - Win by clearing all locations

LOCATIONS:
  Bank -> Saloon -> Canyon -> Bridge -> Train
  (Quick mode: Bank -> Saloon -> Canyon)

BATTLE RESOLUTION:
  After both players pass, compare total strength:
    - Lawmen > Outlaws: Location cleared (Colonel scores)
    - Outlaws >= Lawmen: Outlaws hold (but take casualties)
  Surviving outlaws move to the next location.

STRATEGY:
  Outlaw: Spread strength across locations, save specials
  Colonel: Concentrate force, clear locations decisively

COMMANDS:
  Type 'quit' to quit, 'save' to save, 'help' for help.
========================================
"""
