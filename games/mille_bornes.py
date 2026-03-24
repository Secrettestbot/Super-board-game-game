"""Mille Bornes - A French card racing game for 2 players."""

import random
from engine.base import BaseGame, input_with_quit, clear_screen


# Card types
DISTANCE = "distance"
HAZARD = "hazard"
REMEDY = "remedy"
SAFETY = "safety"

# Distance cards: (value, count_in_deck)
DISTANCE_CARDS = [
    (25, 10),
    (50, 10),
    (75, 10),
    (100, 12),
    (200, 4),
]

# Hazard cards: (name, count_in_deck)
HAZARD_CARDS = [
    ("Out of Gas", 3),
    ("Flat Tire", 3),
    ("Accident", 3),
    ("Speed Limit", 4),
    ("Stop", 5),
]

# Remedy cards: (name, count_in_deck)
REMEDY_CARDS = [
    ("Gasoline", 6),
    ("Spare Tire", 6),
    ("Repairs", 6),
    ("End of Limit", 6),
    ("Go", 14),
]

# Safety cards: (name, count_in_deck)
SAFETY_CARDS = [
    ("Extra Tank", 1),
    ("Puncture Proof", 1),
    ("Driving Ace", 1),
    ("Right of Way", 1),
]

# Mapping: which safety counters which hazard
SAFETY_COUNTERS = {
    "Out of Gas": "Extra Tank",
    "Flat Tire": "Puncture Proof",
    "Accident": "Driving Ace",
    "Speed Limit": "Right of Way",
    "Stop": "Right of Way",
}

# Mapping: which remedy fixes which hazard
REMEDY_FOR_HAZARD = {
    "Out of Gas": "Gasoline",
    "Flat Tire": "Spare Tire",
    "Accident": "Repairs",
    "Speed Limit": "End of Limit",
    "Stop": "Go",
}

# Reverse: which hazard does a remedy fix
HAZARD_FOR_REMEDY = {v: k for k, v in REMEDY_FOR_HAZARD.items()}

# Card display symbols
CARD_SYMBOLS = {
    DISTANCE: "\u2693",   # distance marker
    HAZARD: "\u26A0",     # warning
    REMEDY: "\u2705",     # check
    SAFETY: "\u2B50",     # star
}


def make_deck():
    """Create and shuffle the full 106-card Mille Bornes deck."""
    deck = []
    for value, count in DISTANCE_CARDS:
        for _ in range(count):
            deck.append({"type": DISTANCE, "value": value})
    for name, count in HAZARD_CARDS:
        for _ in range(count):
            deck.append({"type": HAZARD, "name": name})
    for name, count in REMEDY_CARDS:
        for _ in range(count):
            deck.append({"type": REMEDY, "name": name})
    for name, count in SAFETY_CARDS:
        for _ in range(count):
            deck.append({"type": SAFETY, "name": name})
    random.shuffle(deck)
    return deck


def card_to_str(card):
    """Format a card for display."""
    if card["type"] == DISTANCE:
        return f"{card['value']} km"
    else:
        return card["name"]


def card_to_short(card):
    """Short label for a card."""
    if card["type"] == DISTANCE:
        return f"{card['value']}km"
    return card["name"]


def card_type_label(card):
    """Return the type label of a card."""
    return card["type"].capitalize()


def card_to_dict(card):
    """Convert card to a serializable dict (already is one)."""
    return dict(card)


def dict_to_card(d):
    """Convert dict back to a card dict."""
    return dict(d)


class PlayerState:
    """Tracks state for one player in Mille Bornes."""

    def __init__(self):
        self.hand = []
        self.mileage = 0
        self.distance_played = []  # list of distance values played
        self.battle_area = None     # current hazard affecting player, or None
        self.speed_limit = False    # True if speed limit is active
        self.is_rolling = False     # True if player has played Go
        self.safeties = []          # list of safety card names played
        self.coup_fourres = 0       # number of coup fourre plays
        self.two_hundreds_played = 0  # count of 200km cards played

    def has_safety(self, safety_name):
        """Check if player has a given safety card played."""
        return safety_name in self.safeties

    def can_play_distance(self, value, target_miles):
        """Check if a distance card can be played."""
        if not self.is_rolling and not self.has_safety("Right of Way"):
            return False
        if self.battle_area is not None:
            return False
        if self.speed_limit and value > 50 and not self.has_safety("Right of Way"):
            return False
        if value == 200 and self.two_hundreds_played >= 2:
            return False
        if self.mileage + value > target_miles:
            return False
        return True

    def to_dict(self):
        """Serialize player state."""
        return {
            "hand": [card_to_dict(c) for c in self.hand],
            "mileage": self.mileage,
            "distance_played": list(self.distance_played),
            "battle_area": self.battle_area,
            "speed_limit": self.speed_limit,
            "is_rolling": self.is_rolling,
            "safeties": list(self.safeties),
            "coup_fourres": self.coup_fourres,
            "two_hundreds_played": self.two_hundreds_played,
        }

    @staticmethod
    def from_dict(d):
        """Deserialize player state."""
        ps = PlayerState()
        ps.hand = [dict_to_card(c) for c in d["hand"]]
        ps.mileage = d["mileage"]
        ps.distance_played = list(d["distance_played"])
        ps.battle_area = d["battle_area"]
        ps.speed_limit = d["speed_limit"]
        ps.is_rolling = d["is_rolling"]
        ps.safeties = list(d["safeties"])
        ps.coup_fourres = d["coup_fourres"]
        ps.two_hundreds_played = d["two_hundreds_played"]
        return ps


class MilleBornesGame(BaseGame):
    """Mille Bornes: French card racing game."""

    name = "Mille Bornes"
    description = "A French card racing game - be the first to reach 1000 km!"
    min_players = 2
    max_players = 2
    variations = {
        "standard": "Standard Mille Bornes (1000 km)",
        "short": "Short Race (700 km)",
    }

    def __init__(self, variation=None):
        super().__init__(variation)
        self.target_miles = 1000 if self.variation == "standard" else 700
        self.deck = []
        self.discard_pile = []
        self.player_states = [None, None]
        self.messages = []
        self.coup_fourre_pending = False
        self.pending_hazard = None
        self.pending_hazard_target = None

    def setup(self):
        """Initialize the game: create deck, deal cards."""
        self.deck = make_deck()
        self.discard_pile = []
        self.player_states = [PlayerState(), PlayerState()]
        self.messages = []
        self.coup_fourre_pending = False
        self.pending_hazard = None
        self.pending_hazard_target = None

        # Deal 6 cards to each player
        for _ in range(6):
            for ps in self.player_states:
                if self.deck:
                    ps.hand.append(self.deck.pop())

    def _draw_card(self, player_idx):
        """Draw a card from the deck for the given player."""
        if self.deck:
            self.player_states[player_idx].hand.append(self.deck.pop())
            return True
        return False

    def _opponent_idx(self, player_num):
        """Get opponent index (0-based) from current player number (1-based)."""
        return 1 - (player_num - 1)

    def _current_idx(self):
        """Get current player index (0-based)."""
        return self.current_player - 1

    def _current_state(self):
        """Get current player's state."""
        return self.player_states[self._current_idx()]

    def _opponent_state(self):
        """Get opponent's state."""
        return self.player_states[self._opponent_idx(self.current_player)]

    def display(self):
        """Display the current game state."""
        idx = self._current_idx()
        opp_idx = self._opponent_idx(self.current_player)
        me = self.player_states[idx]
        opp = self.player_states[opp_idx]

        print("=" * 58)
        print(f"  MILLE BORNES - Target: {self.target_miles} km")
        print(f"  Draw pile: {len(self.deck)} cards | "
              f"Discard pile: {len(self.discard_pile)} cards")
        print("=" * 58)

        # Opponent info
        print(f"\n  {self.players[opp_idx]} (Opponent)")
        print(f"    Mileage: {opp.mileage} / {self.target_miles} km")
        opp_status = self._format_status(opp)
        print(f"    Status:  {opp_status}")
        if opp.safeties:
            print(f"    Safeties: {', '.join(opp.safeties)}")
        print(f"    Cards in hand: {len(opp.hand)}")

        print()
        print("-" * 58)

        # Current player info
        print(f"\n  {self.players[idx]} (You)")
        print(f"    Mileage: {me.mileage} / {self.target_miles} km")
        my_status = self._format_status(me)
        print(f"    Status:  {my_status}")
        if me.safeties:
            print(f"    Safeties: {', '.join(me.safeties)}")

        # Display hand
        print(f"\n  Your hand:")
        for i, card in enumerate(me.hand):
            type_tag = card_type_label(card)
            print(f"    {i + 1}. [{type_tag}] {card_to_str(card)}")

        # Messages
        if self.messages:
            print()
            for msg in self.messages:
                print(f"  >> {msg}")
            self.messages = []

        print()

    def _format_status(self, ps):
        """Format battle area status for display."""
        parts = []
        if ps.battle_area:
            parts.append(f"HAZARD: {ps.battle_area}")
        elif ps.is_rolling or ps.has_safety("Right of Way"):
            parts.append("Rolling")
        else:
            parts.append("Stopped")

        if ps.speed_limit and not ps.has_safety("Right of Way"):
            parts.append("Speed Limit (50 km max)")

        return " | ".join(parts)

    def get_move(self):
        """Get the current player's move."""
        prompt = (f"  {self.players[self._current_idx()]}, enter move "
                  f"(play #, discard #): ")
        while True:
            raw = input_with_quit(prompt).strip().lower()
            if not raw:
                continue
            parts = raw.split()
            action = parts[0]

            if action in ("play", "p") and len(parts) == 2:
                try:
                    card_num = int(parts[1])
                    hand = self._current_state().hand
                    if 1 <= card_num <= len(hand):
                        return ("play", card_num - 1)
                    else:
                        print(f"  Invalid card number. Choose 1-{len(hand)}.")
                except ValueError:
                    print("  Enter a card number after 'play'.")

            elif action in ("discard", "d") and len(parts) == 2:
                try:
                    card_num = int(parts[1])
                    hand = self._current_state().hand
                    if 1 <= card_num <= len(hand):
                        return ("discard", card_num - 1)
                    else:
                        print(f"  Invalid card number. Choose 1-{len(hand)}.")
                except ValueError:
                    print("  Enter a card number after 'discard'.")

            else:
                print("  Commands: 'play #' or 'discard #'")

    def make_move(self, move):
        """Apply the player's move. Returns True if valid."""
        action, card_idx = move
        me = self._current_state()
        opp = self._opponent_state()

        # Draw phase: draw a card first
        self._draw_card(self._current_idx())

        card = me.hand[card_idx]

        if action == "discard":
            discarded = me.hand.pop(card_idx)
            self.discard_pile.append(discarded)
            self.messages.append(
                f"{self.players[self._current_idx()]} discarded {card_to_str(discarded)}.")
            return True

        # action == "play"
        if card["type"] == DISTANCE:
            return self._play_distance(me, card, card_idx)
        elif card["type"] == HAZARD:
            return self._play_hazard(me, opp, card, card_idx)
        elif card["type"] == REMEDY:
            return self._play_remedy(me, card, card_idx)
        elif card["type"] == SAFETY:
            return self._play_safety(me, card, card_idx)

        return False

    def _play_distance(self, me, card, card_idx):
        """Play a distance card."""
        value = card["value"]
        if not me.can_play_distance(value, self.target_miles):
            # Put the drawn card back conceptually - undo draw
            self._undo_draw(me)
            if not me.is_rolling and not me.has_safety("Right of Way"):
                print("  You need a Go card (or Right of Way) before playing distance!")
            elif me.battle_area:
                print(f"  You must remedy your hazard ({me.battle_area}) first!")
            elif me.speed_limit and value > 50 and not me.has_safety("Right of Way"):
                print("  Speed Limit! You can only play 50 km or less.")
            elif value == 200 and me.two_hundreds_played >= 2:
                print("  You have already played two 200 km cards!")
            else:
                print(f"  Playing {value} km would exceed {self.target_miles} km target!")
            return False

        me.hand.pop(card_idx)
        me.mileage += value
        me.distance_played.append(value)
        if value == 200:
            me.two_hundreds_played += 1
        self.messages.append(
            f"{self.players[self._current_idx()]} played {value} km. "
            f"(Total: {me.mileage} km)")
        return True

    def _play_hazard(self, me, opp, card, card_idx):
        """Play a hazard card on the opponent."""
        hazard_name = card["name"]

        # Check if opponent has the matching safety
        matching_safety = SAFETY_COUNTERS.get(hazard_name)
        if matching_safety and opp.has_safety(matching_safety):
            self._undo_draw(me)
            print(f"  Opponent has {matching_safety} - immune to {hazard_name}!")
            return False

        # Speed Limit is separate from battle area
        if hazard_name == "Speed Limit":
            if opp.speed_limit:
                self._undo_draw(me)
                print("  Opponent already has a Speed Limit!")
                return False
            me.hand.pop(card_idx)
            opp.speed_limit = True
            self.messages.append(
                f"{self.players[self._current_idx()]} played Speed Limit on "
                f"{self.players[self._opponent_idx(self.current_player)]}!")
            # Check coup fourre opportunity
            self._check_coup_fourre(opp, hazard_name)
            return True

        # Other hazards go into battle area
        if hazard_name == "Stop":
            # Stop can be played regardless of battle area state
            pass
        elif opp.battle_area is not None:
            self._undo_draw(me)
            print(f"  Opponent already has a hazard ({opp.battle_area})!")
            return False

        if hazard_name != "Stop" and not opp.is_rolling and not opp.has_safety("Right of Way"):
            self._undo_draw(me)
            print("  Opponent is already stopped!")
            return False

        me.hand.pop(card_idx)
        opp.battle_area = hazard_name
        if hazard_name == "Stop":
            opp.is_rolling = False
        else:
            opp.is_rolling = False
        self.messages.append(
            f"{self.players[self._current_idx()]} played {hazard_name} on "
            f"{self.players[self._opponent_idx(self.current_player)]}!")
        # Check coup fourre opportunity
        self._check_coup_fourre(opp, hazard_name)
        return True

    def _play_remedy(self, me, card, card_idx):
        """Play a remedy card."""
        remedy_name = card["name"]

        if remedy_name == "Go":
            if me.is_rolling and me.battle_area is None:
                self._undo_draw(me)
                print("  You are already rolling!")
                return False
            if me.battle_area is not None and me.battle_area != "Stop":
                self._undo_draw(me)
                print(f"  You must fix {me.battle_area} before playing Go!")
                return False
            me.hand.pop(card_idx)
            me.battle_area = None
            me.is_rolling = True
            self.messages.append(
                f"{self.players[self._current_idx()]} played Go!")
            return True

        if remedy_name == "End of Limit":
            if not me.speed_limit:
                self._undo_draw(me)
                print("  You don't have a Speed Limit to remove!")
                return False
            me.hand.pop(card_idx)
            me.speed_limit = False
            self.messages.append(
                f"{self.players[self._current_idx()]} removed Speed Limit!")
            return True

        # Other remedies fix specific hazards
        expected_hazard = HAZARD_FOR_REMEDY.get(remedy_name)
        if me.battle_area != expected_hazard:
            self._undo_draw(me)
            if me.battle_area is None:
                print(f"  You don't have a hazard that {remedy_name} fixes!")
            else:
                print(f"  {remedy_name} doesn't fix {me.battle_area}!")
            return False

        me.hand.pop(card_idx)
        me.battle_area = None
        self.messages.append(
            f"{self.players[self._current_idx()]} played {remedy_name}!")
        return True

    def _play_safety(self, me, card, card_idx):
        """Play a safety card."""
        safety_name = card["name"]

        if me.has_safety(safety_name):
            self._undo_draw(me)
            print(f"  You already have {safety_name}!")
            return False

        me.hand.pop(card_idx)
        me.safeties.append(safety_name)

        # Safety cards have immediate effects
        if safety_name == "Right of Way":
            me.speed_limit = False
            if me.battle_area == "Stop":
                me.battle_area = None
            me.is_rolling = True
        elif safety_name == "Extra Tank":
            if me.battle_area == "Out of Gas":
                me.battle_area = None
                me.is_rolling = True
        elif safety_name == "Puncture Proof":
            if me.battle_area == "Flat Tire":
                me.battle_area = None
                me.is_rolling = True
        elif safety_name == "Driving Ace":
            if me.battle_area == "Accident":
                me.battle_area = None
                me.is_rolling = True

        self.messages.append(
            f"{self.players[self._current_idx()]} played safety: {safety_name}!")
        return True

    def _check_coup_fourre(self, target_ps, hazard_name):
        """Check if the target player can play a coup fourre."""
        matching_safety = SAFETY_COUNTERS.get(hazard_name)
        if not matching_safety:
            return

        # Check if target has the matching safety in hand
        has_safety_in_hand = False
        safety_idx = None
        for i, card in enumerate(target_ps.hand):
            if card["type"] == SAFETY and card["name"] == matching_safety:
                has_safety_in_hand = True
                safety_idx = i
                break

        if not has_safety_in_hand:
            return

        # Ask if they want to play coup fourre
        target_player_num = 1 if target_ps is self.player_states[0] else 2
        print(f"\n  {self.players[target_player_num - 1]}: "
              f"You have {matching_safety}! Play as Coup Fourre? (coupe/no): ")
        try:
            response = input_with_quit("  > ").strip().lower()
        except (EOFError, KeyboardInterrupt):
            return

        if response in ("coupe", "coup", "yes", "y"):
            # Play the coup fourre
            target_ps.hand.pop(safety_idx)
            target_ps.safeties.append(matching_safety)
            target_ps.coup_fourres += 1

            # Undo the hazard effect
            if hazard_name == "Speed Limit":
                target_ps.speed_limit = False
            else:
                target_ps.battle_area = None
                target_ps.is_rolling = True

            # Apply safety side effects
            if matching_safety == "Right of Way":
                target_ps.speed_limit = False
                target_ps.is_rolling = True

            self.messages.append(
                f"COUP FOURRE! {self.players[target_player_num - 1]} played "
                f"{matching_safety}! (+300 bonus points)")

            # Coup fourre grants an extra turn: draw a replacement card
            self._draw_card(target_player_num - 1)

    def _undo_draw(self, ps):
        """Undo the automatic draw at start of turn (put last card back)."""
        if ps.hand:
            self.deck.append(ps.hand.pop())

    def check_game_over(self):
        """Check if the game is over."""
        for i, ps in enumerate(self.player_states):
            if ps.mileage == self.target_miles:
                self.game_over = True
                self.winner = i + 1
                return

        # Game also ends when deck is empty and no one can play
        if not self.deck:
            # Check if either player can still play useful cards
            can_continue = False
            for ps in self.player_states:
                for card in ps.hand:
                    if card["type"] == DISTANCE:
                        if ps.can_play_distance(card["value"], self.target_miles):
                            can_continue = True
                            break
                    elif card["type"] != HAZARD:
                        # Remedies and safeties might be playable
                        can_continue = True
                        break
                if can_continue:
                    break

            if not can_continue or all(len(ps.hand) == 0 for ps in self.player_states):
                self.game_over = True
                # Determine winner by scoring
                scores = [self._calculate_score(i) for i in range(2)]
                if scores[0] > scores[1]:
                    self.winner = 1
                elif scores[1] > scores[0]:
                    self.winner = 2
                else:
                    self.winner = None  # draw

                self.messages.append(f"Deck exhausted! Final scores:")
                self.messages.append(
                    f"  {self.players[0]}: {scores[0]} points")
                self.messages.append(
                    f"  {self.players[1]}: {scores[1]} points")

    def _calculate_score(self, player_idx):
        """Calculate the score for a player."""
        ps = self.player_states[player_idx]
        opp = self.player_states[1 - player_idx]
        score = 0

        # Distance points
        score += ps.mileage

        # Safety bonus: 100 per safety
        score += len(ps.safeties) * 100

        # All four safeties bonus
        if len(ps.safeties) == 4:
            score += 300

        # Coup fourre bonus: 300 each
        score += ps.coup_fourres * 300

        # Trip complete (reached target)
        if ps.mileage == self.target_miles:
            score += 400

        # Safe trip (no 200km cards used)
        if ps.mileage == self.target_miles and ps.two_hundreds_played == 0:
            score += 300

        # Shut out (opponent has 0 mileage)
        if ps.mileage == self.target_miles and opp.mileage == 0:
            score += 500

        return score

    def get_state(self):
        """Return serializable game state for saving."""
        return {
            "target_miles": self.target_miles,
            "deck": [card_to_dict(c) for c in self.deck],
            "discard_pile": [card_to_dict(c) for c in self.discard_pile],
            "player_states": [ps.to_dict() for ps in self.player_states],
            "messages": list(self.messages),
        }

    def load_state(self, state):
        """Restore game state from saved data."""
        self.target_miles = state["target_miles"]
        self.deck = [dict_to_card(c) for c in state["deck"]]
        self.discard_pile = [dict_to_card(c) for c in state["discard_pile"]]
        self.player_states = [PlayerState.from_dict(d) for d in state["player_states"]]
        self.messages = list(state["messages"])

    def get_tutorial(self):
        """Return tutorial text for Mille Bornes."""
        return """
==================================================
  Mille Bornes - Tutorial
==================================================

  OVERVIEW:
  Mille Bornes is a French card racing game where
  each player tries to be the first to travel
  exactly 1000 km (or 700 km in the short variant).

  CARD TYPES:
  - Distance (25/50/75/100/200 km): Add to your
    mileage to reach the target distance.
  - Hazards: Play on your opponent to stop them.
      Out of Gas, Flat Tire, Accident, Speed Limit,
      Stop
  - Remedies: Counter hazards played on you.
      Gasoline, Spare Tire, Repairs, End of Limit,
      Go
  - Safeties: Permanent protection from hazards.
      Extra Tank, Puncture Proof, Driving Ace,
      Right of Way

  SETUP:
  - 106-card special deck. Each player is dealt 6
    cards. Remaining cards form the draw pile.

  EACH TURN:
  1. Draw a card from the draw pile.
  2. Play a card OR discard a card.

  PLAYING CARDS:
  - You must play a Go card before playing any
    distance cards (unless you have Right of Way).
  - Distance cards add to your mileage total.
  - You cannot exceed the target distance.
  - Maximum of two 200 km cards per player.
  - Hazards are played on your opponent to hinder
    them.
  - Remedies fix hazards affecting you.
  - Speed Limit restricts opponent to 50 km cards
    until they play End of Limit.

  SAFETIES:
  - Permanent protection against specific hazards.
  - Extra Tank protects from Out of Gas.
  - Puncture Proof protects from Flat Tire.
  - Driving Ace protects from Accident.
  - Right of Way protects from Stop & Speed Limit,
    and acts as a permanent Go card.

  COUP FOURRE:
  - If an opponent plays a hazard on you and you
    hold the matching safety card, you may instantly
    play it as a "Coup Fourre" for a 300 point
    bonus! Type 'coupe' when prompted.

  SCORING:
  - Distance points (your mileage total)
  - Each Safety played: 100 points
  - All 4 Safeties: 300 bonus points
  - Each Coup Fourre: 300 points
  - Trip Complete (reach target): 400 points
  - Safe Trip (no 200km cards): 300 points
  - Shut Out (opponent at 0 km): 500 points

  HOW TO PLAY:
  - 'play #'    - Play card number # from your hand
  - 'discard #' - Discard card number # from hand

  STRATEGY HINTS:
  - Get a Go card out early to start rolling.
  - Save safety cards for Coup Fourre if possible.
  - Use hazards to slow your opponent down.
  - Watch your mileage - you must hit the target
    exactly!

==================================================
"""
