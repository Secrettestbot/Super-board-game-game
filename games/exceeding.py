"""Exceed Fighting System - A dueling card game with range and speed mechanics."""

import random
from engine.base import BaseGame, input_with_quit, clear_screen

BOLD = "\033[1m"
DIM = "\033[2m"
RESET = "\033[0m"
RED = "\033[91m"
BLUE = "\033[94m"
GREEN = "\033[92m"
YELLOW = "\033[93m"
CYAN = "\033[96m"

# Attack cards with range, speed, power, guard
FULL_DECK = [
    # Name, Range(min,max), Speed, Power, Guard, type
    {"name": "Jab", "range_min": 1, "range_max": 1, "speed": 7, "power": 2, "guard": 0, "type": "attack"},
    {"name": "Jab", "range_min": 1, "range_max": 1, "speed": 7, "power": 2, "guard": 0, "type": "attack"},
    {"name": "Cross", "range_min": 1, "range_max": 2, "speed": 5, "power": 4, "guard": 1, "type": "attack"},
    {"name": "Cross", "range_min": 1, "range_max": 2, "speed": 5, "power": 4, "guard": 1, "type": "attack"},
    {"name": "Hook", "range_min": 1, "range_max": 1, "speed": 4, "power": 5, "guard": 2, "type": "attack"},
    {"name": "Hook", "range_min": 1, "range_max": 1, "speed": 4, "power": 5, "guard": 2, "type": "attack"},
    {"name": "Sweep", "range_min": 1, "range_max": 2, "speed": 3, "power": 4, "guard": 3, "type": "attack"},
    {"name": "Sweep", "range_min": 1, "range_max": 2, "speed": 3, "power": 4, "guard": 3, "type": "attack"},
    {"name": "Thrust", "range_min": 2, "range_max": 3, "speed": 6, "power": 3, "guard": 0, "type": "attack"},
    {"name": "Thrust", "range_min": 2, "range_max": 3, "speed": 6, "power": 3, "guard": 0, "type": "attack"},
    {"name": "Lunge", "range_min": 2, "range_max": 4, "speed": 5, "power": 4, "guard": 0, "type": "attack"},
    {"name": "Lunge", "range_min": 2, "range_max": 4, "speed": 5, "power": 4, "guard": 0, "type": "attack"},
    {"name": "Spike", "range_min": 3, "range_max": 4, "speed": 4, "power": 5, "guard": 1, "type": "attack"},
    {"name": "Spike", "range_min": 3, "range_max": 4, "speed": 4, "power": 5, "guard": 1, "type": "attack"},
    {"name": "Fireball", "range_min": 3, "range_max": 5, "speed": 3, "power": 6, "guard": 0, "type": "attack"},
    {"name": "Fireball", "range_min": 3, "range_max": 5, "speed": 3, "power": 6, "guard": 0, "type": "attack"},
    {"name": "Uppercut", "range_min": 1, "range_max": 1, "speed": 2, "power": 7, "guard": 3, "type": "attack"},
    {"name": "Uppercut", "range_min": 1, "range_max": 1, "speed": 2, "power": 7, "guard": 3, "type": "attack"},
    {"name": "Dash Strike", "range_min": 2, "range_max": 3, "speed": 6, "power": 3, "guard": 1, "type": "attack"},
    {"name": "Dash Strike", "range_min": 2, "range_max": 3, "speed": 6, "power": 3, "guard": 1, "type": "attack"},
    # Move cards
    {"name": "Advance", "move": 1, "type": "move", "direction": "forward"},
    {"name": "Advance", "move": 1, "type": "move", "direction": "forward"},
    {"name": "Advance", "move": 1, "type": "move", "direction": "forward"},
    {"name": "Retreat", "move": 1, "type": "move", "direction": "backward"},
    {"name": "Retreat", "move": 1, "type": "move", "direction": "backward"},
    {"name": "Retreat", "move": 1, "type": "move", "direction": "backward"},
    {"name": "Dash", "move": 2, "type": "move", "direction": "forward"},
    {"name": "Dash", "move": 2, "type": "move", "direction": "forward"},
    {"name": "Backstep", "move": 2, "type": "move", "direction": "backward"},
    {"name": "Backstep", "move": 2, "type": "move", "direction": "backward"},
]

SLIM_DECK = [
    {"name": "Jab", "range_min": 1, "range_max": 1, "speed": 7, "power": 2, "guard": 0, "type": "attack"},
    {"name": "Cross", "range_min": 1, "range_max": 2, "speed": 5, "power": 4, "guard": 1, "type": "attack"},
    {"name": "Hook", "range_min": 1, "range_max": 1, "speed": 4, "power": 5, "guard": 2, "type": "attack"},
    {"name": "Sweep", "range_min": 1, "range_max": 2, "speed": 3, "power": 4, "guard": 3, "type": "attack"},
    {"name": "Thrust", "range_min": 2, "range_max": 3, "speed": 6, "power": 3, "guard": 0, "type": "attack"},
    {"name": "Lunge", "range_min": 2, "range_max": 4, "speed": 5, "power": 4, "guard": 0, "type": "attack"},
    {"name": "Spike", "range_min": 3, "range_max": 4, "speed": 4, "power": 5, "guard": 1, "type": "attack"},
    {"name": "Fireball", "range_min": 3, "range_max": 5, "speed": 3, "power": 6, "guard": 0, "type": "attack"},
    {"name": "Uppercut", "range_min": 1, "range_max": 1, "speed": 2, "power": 7, "guard": 3, "type": "attack"},
    {"name": "Dash Strike", "range_min": 2, "range_max": 3, "speed": 6, "power": 3, "guard": 1, "type": "attack"},
    {"name": "Advance", "move": 1, "type": "move", "direction": "forward"},
    {"name": "Advance", "move": 1, "type": "move", "direction": "forward"},
    {"name": "Retreat", "move": 1, "type": "move", "direction": "backward"},
    {"name": "Retreat", "move": 1, "type": "move", "direction": "backward"},
    {"name": "Dash", "move": 2, "type": "move", "direction": "forward"},
    {"name": "Backstep", "move": 2, "type": "move", "direction": "backward"},
]


def card_str(card):
    """Format a card for display."""
    if card["type"] == "attack":
        rng = f"R:{card['range_min']}-{card['range_max']}"
        return (f"{RED}{card['name']}{RESET} "
                f"[{rng} Spd:{card['speed']} "
                f"Pow:{card['power']} Grd:{card['guard']}]")
    else:
        direction = ">>>" if card["direction"] == "forward" else "<<<"
        return (f"{CYAN}{card['name']}{RESET} "
                f"[Move {card['move']} {direction}]")


class ExceedingGame(BaseGame):
    """Exceed Fighting System - Dueling card game with range mechanics."""

    name = "Exceeding"
    description = "Dueling card game - manage range, speed, and power to defeat your opponent"
    min_players = 2
    max_players = 2
    variations = {
        "standard": "Standard game - 30 HP, full deck",
        "quick": "Quick game - 20 HP, slim deck",
    }

    def __init__(self, variation=None):
        super().__init__(variation)
        self.max_hp = 30 if self.variation != "quick" else 20
        self.track_size = 9
        self.hp = {1: 0, 2: 0}
        self.position = {1: 0, 2: 0}
        self.decks = {1: [], 2: []}
        self.hands = {1: [], 2: []}
        self.discards = {1: [], 2: []}
        self.log = []
        self.phase = "select"  # select, resolve
        self.selected = {1: None, 2: None}
        self.hand_size = 7

    def setup(self):
        """Initialize the game."""
        self.hp = {1: self.max_hp, 2: self.max_hp}
        self.position = {1: 2, 2: 6}  # 0-indexed on 9-space track
        self.log = []
        self.phase = "select"
        self.selected = {1: None, 2: None}

        # Build decks
        template = FULL_DECK if self.variation != "quick" else SLIM_DECK
        for p in [1, 2]:
            self.decks[p] = [dict(c) for c in template]
            random.shuffle(self.decks[p])
            self.hands[p] = []
            self.discards[p] = []
            for _ in range(self.hand_size):
                if self.decks[p]:
                    self.hands[p].append(self.decks[p].pop())

    def _draw_card(self, player):
        """Draw a card for a player."""
        if not self.decks[player]:
            if self.discards[player]:
                self.decks[player] = list(self.discards[player])
                self.discards[player] = []
                random.shuffle(self.decks[player])
        if self.decks[player]:
            self.hands[player].append(self.decks[player].pop())
            return True
        return False

    def _distance(self):
        """Calculate distance between players."""
        return abs(self.position[1] - self.position[2])

    def _draw_track(self):
        """Draw the combat track."""
        track = ["."] * self.track_size
        p1_pos = self.position[1]
        p2_pos = self.position[2]

        lines = []
        # HP bars
        p1_bar = "#" * (self.hp[1] * 20 // self.max_hp)
        p2_bar = "#" * (self.hp[2] * 20 // self.max_hp)
        lines.append(f"  {BLUE}{self.players[0]}: "
                     f"[{p1_bar:<20}] {self.hp[1]}/{self.max_hp} HP{RESET}")
        lines.append(f"  {RED}{self.players[1]}: "
                     f"[{p2_bar:<20}] {self.hp[2]}/{self.max_hp} HP{RESET}")
        lines.append("")

        # Track visualization
        track_str = ""
        for i in range(self.track_size):
            if i == p1_pos and i == p2_pos:
                track_str += f" {YELLOW}[X]{RESET}"
            elif i == p1_pos:
                track_str += f" {BLUE}[1]{RESET}"
            elif i == p2_pos:
                track_str += f" {RED}[2]{RESET}"
            else:
                track_str += f" [{DIM}.{RESET}]"
        lines.append(f"  Track:{track_str}")

        # Number labels
        nums = "         " + "".join(f" {i + 1}  " for i in range(self.track_size))
        lines.append(f"{DIM}{nums}{RESET}")
        lines.append(f"  Distance: {self._distance()}")
        return "\n".join(lines)

    def display(self):
        """Display the game state."""
        clear_screen()
        p = self.current_player

        print(f"{BOLD}=== EXCEEDING - Fighting Card Game ==={RESET}")
        print(f"Deck: {len(self.decks[p])} | "
              f"Discard: {len(self.discards[p])}")
        print()

        print(self._draw_track())
        print()

        # Current player's hand
        print(f"{BOLD}--- {self.players[p - 1]}'s Hand ---{RESET}")
        for i, card in enumerate(self.hands[p]):
            marker = ""
            if card["type"] == "attack":
                dist = self._distance()
                if card["range_min"] <= dist <= card["range_max"]:
                    marker = f" {GREEN}<< IN RANGE{RESET}"
                else:
                    marker = f" {DIM}(out of range){RESET}"
            print(f"  [{i + 1}] {card_str(card)}{marker}")
        print()

        if self.log:
            print(f"{DIM}Last: {self.log[-1]}{RESET}")
            print()

    def get_move(self):
        """Get the current player's card selection."""
        p = self.current_player

        if not self.hands[p]:
            print("No cards in hand! Drawing...")
            input_with_quit("Press Enter...")
            return ("draw",)

        print("Choose action:")
        print(f"  [1-{len(self.hands[p])}] Play a card")
        print(f"  [D] Discard a card to draw 2")

        choice = input_with_quit("Your choice: ").strip().upper()

        if choice == "D":
            idx = input_with_quit(
                f"Card to discard (1-{len(self.hands[p])}): ").strip()
            return ("discard", idx)
        else:
            return ("play", choice)

    def make_move(self, move):
        """Process a move."""
        p = self.current_player
        opp = 2 if p == 1 else 1

        if move[0] == "draw":
            self._draw_card(p)
            self._draw_card(p)
            return True

        if move[0] == "discard":
            try:
                idx = int(move[1]) - 1
            except (ValueError, IndexError):
                return False
            if idx < 0 or idx >= len(self.hands[p]):
                return False
            card = self.hands[p].pop(idx)
            self.discards[p].append(card)
            self._draw_card(p)
            self._draw_card(p)
            self.log.append(
                f"{self.players[p - 1]} discarded {card['name']} "
                f"and drew 2 cards")
            return True

        if move[0] == "play":
            try:
                idx = int(move[1]) - 1
            except (ValueError, IndexError):
                return False
            if idx < 0 or idx >= len(self.hands[p]):
                return False

            card = self.hands[p].pop(idx)

            if card["type"] == "move":
                # Process movement
                direction = 1 if card["direction"] == "forward" else -1
                # Player 1 moves right toward P2, Player 2 moves left toward P1
                if p == 1:
                    actual_dir = direction
                else:
                    actual_dir = -direction

                new_pos = self.position[p] + (card["move"] * actual_dir)
                new_pos = max(0, min(self.track_size - 1, new_pos))

                # Can't move through or onto opponent
                if new_pos == self.position[opp]:
                    # Stop one space short
                    if actual_dir > 0:
                        new_pos = self.position[opp] - 1
                    else:
                        new_pos = self.position[opp] + 1
                    new_pos = max(0, min(self.track_size - 1, new_pos))

                if new_pos == self.position[p]:
                    self.hands[p].insert(idx, card)
                    self.log.append("Can't move there!")
                    return False

                self.position[p] = new_pos
                self.discards[p].append(card)
                self.log.append(
                    f"{self.players[p - 1]} used {card['name']} "
                    f"(moved to position {new_pos + 1})")
                return True

            elif card["type"] == "attack":
                dist = self._distance()
                if not (card["range_min"] <= dist <= card["range_max"]):
                    self.hands[p].insert(idx, card)
                    self.log.append(
                        f"Out of range! Distance is {dist}, "
                        f"need {card['range_min']}-{card['range_max']}")
                    return False

                # Opponent auto-guards with top discard if possible
                guard_val = 0
                opp_guard_card = None

                # Check if opponent has any guard cards in hand
                guard_cards = [c for c in self.hands[opp]
                               if c["type"] == "attack" and c.get("guard", 0) > 0]
                if guard_cards:
                    # Auto-select best guard
                    guard_cards.sort(key=lambda c: c["guard"], reverse=True)
                    opp_guard_card = guard_cards[0]
                    guard_val = opp_guard_card["guard"]
                    self.hands[opp].remove(opp_guard_card)
                    self.discards[opp].append(opp_guard_card)

                damage = max(0, card["power"] - guard_val)
                self.hp[opp] -= damage
                self.discards[p].append(card)

                guard_msg = ""
                if opp_guard_card:
                    guard_msg = (f" {self.players[opp - 1]} guards with "
                                 f"{opp_guard_card['name']} "
                                 f"(Guard: {guard_val})")

                self.log.append(
                    f"{self.players[p - 1]} attacks with {card['name']}! "
                    f"(Power: {card['power']}, Dist: {dist}){guard_msg} "
                    f"=> {damage} damage!")

                # Draw a card after attacking
                self._draw_card(p)
                return True

        return False

    def check_game_over(self):
        """Check if a player's HP reached 0."""
        for player in [1, 2]:
            if self.hp[player] <= 0:
                self.hp[player] = 0
                self.game_over = True
                self.winner = 2 if player == 1 else 1
                return

        # Check if both players have no cards
        for player in [1, 2]:
            if (not self.hands[player] and not self.decks[player]
                    and not self.discards[player]):
                self.game_over = True
                if self.hp[1] > self.hp[2]:
                    self.winner = 1
                elif self.hp[2] > self.hp[1]:
                    self.winner = 2
                else:
                    self.winner = None
                return

    def get_state(self):
        """Return serializable game state."""
        return {
            "hp": {"1": self.hp[1], "2": self.hp[2]},
            "position": {"1": self.position[1], "2": self.position[2]},
            "decks": {"1": self.decks[1], "2": self.decks[2]},
            "hands": {"1": self.hands[1], "2": self.hands[2]},
            "discards": {"1": self.discards[1], "2": self.discards[2]},
            "log": self.log,
            "max_hp": self.max_hp,
            "hand_size": self.hand_size,
        }

    def load_state(self, state):
        """Restore game state."""
        self.hp = {1: state["hp"]["1"], 2: state["hp"]["2"]}
        self.position = {1: state["position"]["1"],
                         2: state["position"]["2"]}
        self.decks = {1: state["decks"]["1"], 2: state["decks"]["2"]}
        self.hands = {1: state["hands"]["1"], 2: state["hands"]["2"]}
        self.discards = {1: state["discards"]["1"],
                         2: state["discards"]["2"]}
        self.log = state.get("log", [])
        self.max_hp = state.get("max_hp", 30)
        self.hand_size = state.get("hand_size", 7)

    def get_tutorial(self):
        """Return tutorial text."""
        return f"""{BOLD}=== EXCEEDING - Tutorial ==={RESET}

Exceeding is a dueling card game where two fighters face off
on a 9-space linear combat track.

{BOLD}GOAL:{RESET}
  Reduce your opponent's HP to 0. ({self.max_hp} HP each)

{BOLD}THE TRACK:{RESET}
  Players start at positions 3 and 7 on a 9-space track.
  Distance between fighters determines which attacks can hit.

{BOLD}CARD TYPES:{RESET}

  {RED}ATTACK CARDS{RESET} have four key stats:
    Range (min-max) - Distance at which the attack can hit
    Speed           - Higher speed strikes first in clashes
    Power           - Base damage dealt
    Guard           - Damage blocked when used defensively

  {CYAN}MOVE CARDS{RESET} reposition your fighter:
    Advance  - Move 1 space toward opponent
    Retreat  - Move 1 space away from opponent
    Dash     - Move 2 spaces toward opponent
    Backstep - Move 2 spaces away from opponent

{BOLD}ON YOUR TURN:{RESET}
  - Play a card (attack or move)
  - OR discard a card to draw 2 new cards

{BOLD}COMBAT:{RESET}
  When you attack, the opponent auto-guards with their best
  guard card (if they have one). Damage = Power - Guard.

{BOLD}STRATEGY:{RESET}
  - Control distance! Close-range attacks are different from ranged
  - Fast attacks (Jab, Thrust) are weak but reliable
  - Slow attacks (Uppercut, Fireball) hit hard
  - Guard cards in hand serve as passive defense
  - Discard wisely to cycle for better cards

Type 'q' to quit, 's' to save, 'h' for help during play.
"""
