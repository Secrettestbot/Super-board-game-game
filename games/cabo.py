"""Cabo - Memory card game.

Try to have the lowest total card value. Peek at your own cards, spy on
opponents, swap cards, and call Cabo when you think you have the lowest total.
"""

import random

from engine.base import BaseGame, input_with_quit, clear_screen

# Card values: 0-13, two of each (plus some special)
DECK_COMPOSITION = (
    [0] * 2 + [1] * 2 + [2] * 2 + [3] * 2 + [4] * 2 + [5] * 2 +
    [6] * 2 + [7] * 2 + [8] * 2 + [9] * 2 + [10] * 2 + [11] * 2 +
    [12] * 2 + [13] * 2
)

# Special abilities by card value
ABILITIES = {
    7: "peek",     # Look at one of your own cards
    8: "peek",     # Look at one of your own cards
    9: "spy",      # Look at one opponent card
    10: "spy",     # Look at one opponent card
    11: "swap",    # Swap one of your cards with opponent's (blind)
    12: "swap",    # Swap one of your cards with opponent's (blind)
}


class CaboGame(BaseGame):
    """Cabo - Memory card game with lowest score wins."""

    name = "Cabo"
    description = "Memory card game - have the lowest total to win"
    min_players = 2
    max_players = 2
    variations = {
        "standard": "Standard Cabo",
        "quick": "Quick Game (3 cards)",
    }

    def __init__(self, variation=None):
        super().__init__(variation)
        self.hand_size = 3 if self.variation == "quick" else 4
        self.deck = []
        self.discard = []
        self.hands = {}       # player -> list of card values
        self.known = {}       # player -> list of bools (cards they've seen)
        self.phase = "turn"   # turn, ability
        self.cabo_called_by = None
        self.cabo_final_turns = 0
        self.log = []

    def setup(self):
        self.deck = list(DECK_COMPOSITION)
        random.shuffle(self.deck)
        self.discard = []
        self.hands = {}
        self.known = {}

        for p in [1, 2]:
            sp = str(p)
            self.hands[sp] = [self.deck.pop() for _ in range(self.hand_size)]
            # Players initially see their two outer cards
            k = [False] * self.hand_size
            k[0] = True
            k[-1] = True
            self.known[sp] = k

        self.discard.append(self.deck.pop())
        self.cabo_called_by = None
        self.cabo_final_turns = 0
        self.phase = "turn"
        self.log = ["Game started! You can see your first and last cards."]

    def _draw_card(self):
        if not self.deck:
            # Reshuffle discard except top
            if len(self.discard) <= 1:
                return None
            top = self.discard.pop()
            self.deck = self.discard
            random.shuffle(self.deck)
            self.discard = [top]
        return self.deck.pop()

    def _hand_total(self, player):
        sp = str(player)
        return sum(self.hands[sp])

    def _display_hand(self, player, viewer):
        """Show a player's hand. If viewer==player, show known cards."""
        sp = str(player)
        vp = str(viewer)
        cards = self.hands[sp]
        result = []
        for i, val in enumerate(cards):
            if player == viewer and self.known[sp][i]:
                result.append(f"[{val:2d}]")
            elif player == viewer:
                result.append("[ ? ]")
            else:
                result.append("[ ? ]")
        return " ".join(result)

    def display(self):
        clear_screen()
        variant_label = "Quick" if self.variation == "quick" else "Standard"
        print(f"{'=' * 55}")
        print(f"  CABO - {variant_label} | Turn {self.turn_number + 1}")
        print(f"{'=' * 55}")

        discard_top = self.discard[-1] if self.discard else "empty"
        print(f"\n  Deck: {len(self.deck)} cards | Discard top: [{discard_top}]")
        if self.cabo_called_by:
            print(f"  *** CABO called by {self.players[self.cabo_called_by - 1]}! ***")

        for p in [1, 2]:
            sp = str(p)
            marker = " << your turn" if p == self.current_player else ""
            # Current player sees their known cards
            hand_str = self._display_hand(p, self.current_player)
            indices = "  ".join(f" {i+1}  " for i in range(len(self.hands[sp])))
            print(f"\n  {self.players[p-1]}{marker}")
            print(f"    Cards: {hand_str}")
            print(f"    Index: {indices}")

        print(f"\n  Phase: {self.phase}")
        if self.log:
            print(f"  Last: {self.log[-1]}")
        print()

    def get_move(self):
        cp = self.current_player
        sp = str(cp)

        if self.phase == "turn":
            print(f"  {self.players[cp-1]}, choose an action:")
            print(f"    [1] Draw from deck")
            print(f"    [2] Take discard ({self.discard[-1] if self.discard else 'empty'})")
            if self.cabo_called_by is None:
                print(f"    [3] Call CABO (last round!)")
            choice = input_with_quit("  Choice: ").strip()
            if choice == "1":
                return {"action": "draw_deck"}
            elif choice == "2":
                return {"action": "take_discard"}
            elif choice == "3" and self.cabo_called_by is None:
                return {"action": "call_cabo"}
            return None

        elif self.phase == "drawn":
            print(f"  You drew a card. What do you want to do?")
            print(f"    [1] Swap with one of your cards")
            print(f"    [2] Discard it" +
                  (f" (ability: {ABILITIES.get(self._drawn_card, 'none')})"
                   if self._drawn_card in ABILITIES else ""))
            choice = input_with_quit("  Choice: ").strip()
            if choice == "1":
                idx = input_with_quit(
                    f"  Replace which card? (1-{len(self.hands[sp])}): ").strip()
                try:
                    i = int(idx) - 1
                    if 0 <= i < len(self.hands[sp]):
                        return {"action": "swap_drawn", "index": i}
                except ValueError:
                    pass
                return None
            elif choice == "2":
                return {"action": "discard_drawn"}
            return None

        elif self.phase == "ability":
            ability = ABILITIES.get(self._drawn_card, None)
            if ability == "peek":
                unknown = [i for i, k in enumerate(self.known[sp]) if not k]
                if not unknown:
                    print("  You already know all your cards!")
                    input_with_quit("  Press Enter...")
                    return {"action": "ability_skip"}
                print(f"  PEEK: Look at one of your own cards.")
                for i in unknown:
                    print(f"    [{i+1}] Card {i+1} (unknown)")
                idx = input_with_quit("  Which card? ").strip()
                try:
                    i = int(idx) - 1
                    if i in unknown:
                        return {"action": "ability_peek", "index": i}
                except ValueError:
                    pass
                return None

            elif ability == "spy":
                opp = "2" if sp == "1" else "1"
                print(f"  SPY: Look at one of {self.players[int(opp)-1]}'s cards.")
                for i in range(len(self.hands[opp])):
                    print(f"    [{i+1}] Card {i+1}")
                idx = input_with_quit("  Which card? ").strip()
                try:
                    i = int(idx) - 1
                    if 0 <= i < len(self.hands[opp]):
                        return {"action": "ability_spy", "index": i}
                except ValueError:
                    pass
                return None

            elif ability == "swap":
                opp = "2" if sp == "1" else "1"
                print(f"  SWAP: Swap one of your cards with opponent's (blind).")
                my_idx = input_with_quit(
                    f"  Your card (1-{len(self.hands[sp])}): ").strip()
                opp_idx = input_with_quit(
                    f"  Opponent's card (1-{len(self.hands[opp])}): ").strip()
                try:
                    mi = int(my_idx) - 1
                    oi = int(opp_idx) - 1
                    if (0 <= mi < len(self.hands[sp]) and
                            0 <= oi < len(self.hands[opp])):
                        return {"action": "ability_swap", "my_index": mi,
                                "opp_index": oi}
                except ValueError:
                    pass
                return None
            else:
                return {"action": "ability_skip"}
        return None

    def make_move(self, move):
        if move is None:
            return False
        cp = self.current_player
        sp = str(cp)
        opp = "2" if sp == "1" else "1"
        action = move.get("action")

        if action == "draw_deck":
            card = self._draw_card()
            if card is None:
                self.log.append("Deck empty! Game ending.")
                self.game_over = True
                return True
            self._drawn_card = card
            self.phase = "drawn"
            self.log.append(f"{self.players[cp-1]} drew from deck.")
            return True

        if action == "take_discard":
            if not self.discard:
                return False
            card = self.discard.pop()
            self._drawn_card = card
            print(f"\n  You took [{card}] from discard.")
            idx = input_with_quit(
                f"  Replace which card? (1-{len(self.hands[sp])}): ").strip()
            try:
                i = int(idx) - 1
                if 0 <= i < len(self.hands[sp]):
                    old = self.hands[sp][i]
                    self.hands[sp][i] = card
                    self.known[sp][i] = True
                    self.discard.append(old)
                    self.log.append(
                        f"{self.players[cp-1]} took [{card}] from discard, "
                        f"replaced card {i+1}.")
                    self.phase = "turn"
                    return True
            except ValueError:
                pass
            # Put it back if invalid
            self.discard.append(card)
            return False

        if action == "call_cabo":
            self.cabo_called_by = cp
            self.cabo_final_turns = 0
            self.log.append(f"{self.players[cp-1]} called CABO!")
            self.phase = "turn"
            return True

        if action == "swap_drawn":
            i = move["index"]
            old = self.hands[sp][i]
            self.hands[sp][i] = self._drawn_card
            self.known[sp][i] = True
            self.discard.append(old)
            self.log.append(f"{self.players[cp-1]} swapped card {i+1}.")
            self.phase = "turn"
            return True

        if action == "discard_drawn":
            self.discard.append(self._drawn_card)
            ability = ABILITIES.get(self._drawn_card, None)
            if ability:
                self.phase = "ability"
                self.log.append(
                    f"{self.players[cp-1]} discarded [{self._drawn_card}] "
                    f"- using {ability} ability!")
                return True
            else:
                self.log.append(
                    f"{self.players[cp-1]} discarded [{self._drawn_card}].")
                self.phase = "turn"
                return True

        if action == "ability_peek":
            i = move["index"]
            val = self.hands[sp][i]
            self.known[sp][i] = True
            print(f"\n  Your card {i+1} is [{val}]!")
            input_with_quit("  Press Enter to continue...")
            self.log.append(f"{self.players[cp-1]} peeked at card {i+1}.")
            self.phase = "turn"
            return True

        if action == "ability_spy":
            i = move["index"]
            val = self.hands[opp][i]
            print(f"\n  {self.players[int(opp)-1]}'s card {i+1} is [{val}]!")
            input_with_quit("  Press Enter to continue...")
            self.log.append(
                f"{self.players[cp-1]} spied on opponent's card {i+1}.")
            self.phase = "turn"
            return True

        if action == "ability_swap":
            mi = move["my_index"]
            oi = move["opp_index"]
            self.hands[sp][mi], self.hands[opp][oi] = (
                self.hands[opp][oi], self.hands[sp][mi])
            # Knowledge swaps too
            self.known[sp][mi] = False
            self.known[opp][oi] = False
            self.log.append(
                f"{self.players[cp-1]} swapped card {mi+1} with "
                f"opponent's card {oi+1}.")
            self.phase = "turn"
            return True

        if action == "ability_skip":
            self.phase = "turn"
            return True

        return False

    def check_game_over(self):
        if self.cabo_called_by is not None and self.phase == "turn":
            self.cabo_final_turns += 1
            # After cabo caller's opponent gets one more turn
            if self.cabo_final_turns >= 2:
                self.game_over = True
                s1 = self._hand_total(1)
                s2 = self._hand_total(2)
                # Cabo caller gets penalty if they don't have lowest
                caller = str(self.cabo_called_by)
                other = "2" if caller == "1" else "1"
                caller_total = sum(self.hands[caller])
                other_total = sum(self.hands[other])
                if caller_total > other_total:
                    # Penalty: add 10
                    caller_total += 10
                # Lower score wins
                if caller_total < other_total:
                    self.winner = self.cabo_called_by
                elif other_total < caller_total:
                    self.winner = int(other)
                else:
                    self.winner = None
                self.log.append(
                    f"Final scores: {self.players[0]}={s1}, "
                    f"{self.players[1]}={s2}")

        # Also end if deck is empty
        if not self.deck and not self.game_over:
            self.game_over = True
            s1 = self._hand_total(1)
            s2 = self._hand_total(2)
            if s1 < s2:
                self.winner = 1
            elif s2 < s1:
                self.winner = 2
            else:
                self.winner = None

    def get_state(self):
        return {
            "deck": self.deck,
            "discard": self.discard,
            "hands": self.hands,
            "known": self.known,
            "phase": self.phase,
            "cabo_called_by": self.cabo_called_by,
            "cabo_final_turns": self.cabo_final_turns,
            "log": self.log,
        }

    def load_state(self, state):
        self.deck = state["deck"]
        self.discard = state["discard"]
        self.hands = state["hands"]
        self.known = state["known"]
        self.phase = state["phase"]
        self.cabo_called_by = state["cabo_called_by"]
        self.cabo_final_turns = state["cabo_final_turns"]
        self.log = state.get("log", [])

    def get_tutorial(self):
        return """
============================================================
  CABO - Tutorial
============================================================

  OVERVIEW:
  Cabo is a memory card game where you try to have the
  lowest total card value in your hand. You can peek at
  your own cards, spy on opponents, and swap cards.

  SETUP:
  - Each player gets 4 cards (3 in quick mode) face-down
  - You initially see your first and last cards
  - A discard pile is started with one card

  ON YOUR TURN:
  1. Draw from deck OR take the top discard card
  2. If drawing from deck, you can:
     - Swap it with one of your hand cards, OR
     - Discard it (may trigger a special ability)
  3. If taking from discard, you MUST swap it with a hand card

  SPECIAL ABILITIES (when discarded):
  - 7, 8: PEEK at one of your own unknown cards
  - 9, 10: SPY on one opponent card
  - 11, 12: SWAP one of your cards with opponent's

  CABO:
  - Instead of drawing, you can call "CABO"
  - Each other player gets one final turn
  - If you DON'T have the lowest total, add 10 penalty!
  - Lowest total wins

  QUICK VARIANT: 3 cards per player for faster games.
============================================================
"""
