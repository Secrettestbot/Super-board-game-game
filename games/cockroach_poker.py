"""Cockroach Poker - Bluffing card game.

Pass cards face-down claiming what they are. The receiver must either
accept the claim (and guess if it's true or a bluff) or peek and pass
it to someone else with a new claim.
"""

import random

from engine.base import BaseGame, input_with_quit, clear_screen

# Bug types
STANDARD_BUGS = ["Cockroach", "Rat", "Stink Bug", "Fly", "Bat", "Scorpion", "Spider", "Toad"]
ROYAL_BUGS = STANDARD_BUGS + ["Royal Cockroach", "Royal Rat"]

BUG_ICONS = {
    "Cockroach": "CKR", "Rat": "RAT", "Stink Bug": "STK", "Fly": "FLY",
    "Bat": "BAT", "Scorpion": "SCR", "Spider": "SPD", "Toad": "TOD",
    "Royal Cockroach": "RCK", "Royal Rat": "RRT",
}


class CockroachPokerGame(BaseGame):
    """Cockroach Poker - Bluffing card game."""

    name = "Cockroach Poker"
    description = "Bluffing game - pass cards and lie about what they are"
    min_players = 2
    max_players = 2
    variations = {
        "standard": "Standard Game",
        "royal": "Royal Variant (special cards)",
    }

    def __init__(self, variation=None):
        super().__init__(variation)
        self.hands = {}
        self.face_up = {}  # player -> dict of bug_type -> count (penalty cards)
        self.offered_card = None
        self.offered_claim = None
        self.offered_by = None
        self.phase = "offer"  # offer, respond
        self.log = []

    def setup(self):
        # Build deck
        bugs = ROYAL_BUGS if self.variation == "royal" else STANDARD_BUGS
        deck = []
        for bug in bugs:
            copies = 6 if bug.startswith("Royal") else 8
            for _ in range(copies):
                deck.append(bug)
        random.shuffle(deck)

        # Deal equally
        half = len(deck) // 2
        self.hands = {
            "1": deck[:half],
            "2": deck[half:half * 2],
        }
        self.face_up = {"1": {}, "2": {}}
        self.offered_card = None
        self.offered_claim = None
        self.offered_by = None
        self.phase = "offer"
        self.log = ["Game started! Offer a card to your opponent."]

    def _bug_types(self):
        return ROYAL_BUGS if self.variation == "royal" else STANDARD_BUGS

    def display(self):
        clear_screen()
        mode = "Royal" if self.variation == "royal" else "Standard"
        print(f"{'=' * 60}")
        print(f"  COCKROACH POKER - {mode}")
        print(f"{'=' * 60}")

        for p in [1, 2]:
            sp = str(p)
            marker = " <<" if p == self.current_player else ""
            n_cards = len(self.hands[sp])
            print(f"\n  {self.players[p-1]}: {n_cards} cards in hand{marker}")

            # Face-up penalty cards
            if self.face_up[sp]:
                penalties = []
                for bug, count in sorted(self.face_up[sp].items()):
                    penalties.append(f"{BUG_ICONS.get(bug, bug)}x{count}")
                print(f"    Face-up: {' '.join(penalties)}")
                # Check for 4 of a kind
                for bug, count in self.face_up[sp].items():
                    if count >= 4:
                        print(f"    *** DANGER: {count} {bug}s! ***")
            else:
                print("    Face-up: (none)")

        print()
        if self.offered_card and self.phase == "respond":
            receiver = "2" if self.offered_by == "1" else "1"
            p_idx = int(receiver) - 1
            print(f"  A card was offered to {self.players[p_idx]}")
            print(f"  Claim: 'This is a {self.offered_claim}'")
        print()

        if self.log:
            print(f"  Last: {self.log[-1]}")
        print()

    def get_move(self):
        cp = str(self.current_player)
        bugs = self._bug_types()

        if self.phase == "offer":
            if not self.hands[cp]:
                return {"action": "no_cards"}

            print(f"  Your hand ({len(self.hands[cp])} cards):")
            # Group cards
            counts = {}
            for card in self.hands[cp]:
                counts[card] = counts.get(card, 0) + 1
            for i, (bug, count) in enumerate(sorted(counts.items())):
                print(f"    [{i+1}] {bug} x{count}")

            card_choice = input_with_quit("  Choose a card type to offer: ").strip()
            try:
                idx = int(card_choice) - 1
                sorted_bugs = sorted(counts.keys())
                if 0 <= idx < len(sorted_bugs):
                    chosen_bug = sorted_bugs[idx]
                else:
                    return None
            except ValueError:
                return None

            # Choose claim (can lie!)
            print(f"\n  You selected: {chosen_bug}")
            print("  What do you CLAIM it is?")
            for i, b in enumerate(bugs):
                print(f"    [{i+1}] {b}")
            claim_choice = input_with_quit("  Claim: ").strip()
            try:
                cidx = int(claim_choice) - 1
                if 0 <= cidx < len(bugs):
                    claim = bugs[cidx]
                    return {"action": "offer", "card": chosen_bug, "claim": claim}
            except ValueError:
                pass
            return None

        elif self.phase == "respond":
            print(f"  You were offered a card claimed to be: {self.offered_claim}")
            print("  Options:")
            print("    [1] Accept and say TRUE (you believe the claim)")
            print("    [2] Accept and say FALSE (you think it's a lie)")
            choice = input_with_quit("  Choice: ").strip()
            if choice == "1":
                return {"action": "accept_true"}
            elif choice == "2":
                return {"action": "accept_false"}
            return None

        return None

    def make_move(self, move):
        if move is None:
            return False
        cp = str(self.current_player)
        action = move.get("action")

        if action == "no_cards":
            # Player with no cards loses
            self.game_over = True
            self.winner = 2 if cp == "1" else 1
            return True

        if action == "offer":
            card = move["card"]
            claim = move["claim"]
            if card not in self.hands[cp]:
                return False
            self.hands[cp].remove(card)
            self.offered_card = card
            self.offered_claim = claim
            self.offered_by = cp
            self.phase = "respond"
            self.log.append(f"{self.players[self.current_player-1]} offers a card: 'This is a {claim}'")
            return True

        if action == "accept_true":
            # Receiver believes the claim is TRUE
            actual = self.offered_card
            claim = self.offered_claim
            receiver = cp
            offerer = self.offered_by

            if actual == claim:
                # Claim was true - offerer was honest. Receiver takes the card face-up (penalty to offerer? No.)
                # In Cockroach Poker: if you say TRUE and it IS true, you keep the card (penalty to you)
                # Wait - rules: if you accept and guess correctly, the offerer takes it
                # If you accept and guess wrong, you take it
                # "Accept TRUE" means you think the claim IS correct
                # If correct guess: offerer gets penalty
                # If wrong guess: receiver gets penalty
                loser = offerer if actual == claim else receiver
            else:
                loser = receiver  # Guessed wrong

            sp_loser = loser
            self.face_up[sp_loser][actual] = self.face_up[sp_loser].get(actual, 0) + 1
            winner_name = "offerer" if loser != offerer else "receiver"
            loser_p = int(sp_loser)
            self.log.append(
                f"Card was {actual}. Claim was {claim}. "
                f"{self.players[loser_p-1]} takes the penalty!"
            )

            self.offered_card = None
            self.offered_claim = None
            self.offered_by = None
            self.phase = "offer"
            # The loser must offer next
            self.current_player = int(sp_loser)
            return True

        if action == "accept_false":
            # Receiver believes the claim is FALSE (a lie)
            actual = self.offered_card
            claim = self.offered_claim
            receiver = cp
            offerer = self.offered_by

            if actual != claim:
                # Claim WAS a lie - receiver guessed correctly, offerer gets penalty
                loser = offerer
            else:
                # Claim was true - receiver guessed wrong
                loser = receiver

            sp_loser = loser
            self.face_up[sp_loser][actual] = self.face_up[sp_loser].get(actual, 0) + 1
            loser_p = int(sp_loser)
            self.log.append(
                f"Card was {actual}. Claim was {claim}. "
                f"{self.players[loser_p-1]} takes the penalty!"
            )

            self.offered_card = None
            self.offered_claim = None
            self.offered_by = None
            self.phase = "offer"
            self.current_player = int(sp_loser)
            return True

        return False

    def switch_player(self):
        # Override: switching is handled in make_move based on who lost
        pass

    def check_game_over(self):
        lose_threshold = 4
        if self.variation == "royal":
            lose_threshold = 4  # Royal cards count: 3 royals loses

        for sp in ["1", "2"]:
            for bug, count in self.face_up[sp].items():
                if bug.startswith("Royal") and count >= 3:
                    self.game_over = True
                    self.winner = 2 if sp == "1" else 1
                    self.log.append(f"{self.players[int(sp)-1]} collected 3 {bug}s and loses!")
                    return
                elif count >= lose_threshold:
                    self.game_over = True
                    self.winner = 2 if sp == "1" else 1
                    self.log.append(f"{self.players[int(sp)-1]} collected {count} {bug}s and loses!")
                    return

        # Also lose if you have no cards and must offer
        for sp in ["1", "2"]:
            if not self.hands[sp] and self.phase == "offer" and str(self.current_player) == sp:
                self.game_over = True
                self.winner = 2 if sp == "1" else 1
                return

    def get_state(self):
        return {
            "hands": {k: list(v) for k, v in self.hands.items()},
            "face_up": {k: dict(v) for k, v in self.face_up.items()},
            "offered_card": self.offered_card,
            "offered_claim": self.offered_claim,
            "offered_by": self.offered_by,
            "phase": self.phase,
            "log": self.log,
        }

    def load_state(self, state):
        self.hands = state["hands"]
        self.face_up = state["face_up"]
        self.offered_card = state.get("offered_card")
        self.offered_claim = state.get("offered_claim")
        self.offered_by = state.get("offered_by")
        self.phase = state.get("phase", "offer")
        self.log = state.get("log", [])

    def get_tutorial(self):
        return """
============================================================
  COCKROACH POKER - Tutorial
============================================================

  OVERVIEW:
  Cockroach Poker is a bluffing game. There is no winner -
  only a loser! Pass pest cards to your opponent and try
  to avoid collecting 4 of any one type.

  GAMEPLAY:
  1. OFFER: Pick a card from your hand and pass it face-down
     to your opponent. Claim what it is (you can lie!).

  2. RESPOND: When offered a card, you must either:
     - Say TRUE (you believe the claim) - if right, offerer
       takes penalty; if wrong, you take penalty
     - Say FALSE (you think it's a lie) - if right, offerer
       takes penalty; if wrong, you take penalty

  3. The penalty card goes face-up in front of the loser.

  LOSING:
  - Collect 4 of any one bug type = YOU LOSE
  - Run out of cards when you must offer = YOU LOSE

  ROYAL VARIANT:
  - Adds Royal Cockroach and Royal Rat cards
  - Only 3 Royal cards of one type needed to lose

  BUG TYPES:
  Cockroach, Rat, Stink Bug, Fly, Bat, Scorpion, Spider, Toad
============================================================
"""
