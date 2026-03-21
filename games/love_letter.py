"""Love Letter - A 2-player card game of risk, deduction, and luck."""

import random

from engine.base import BaseGame, input_with_quit, clear_screen


# Card definitions: (name, value, count_in_deck)
STANDARD_CARDS = [
    ("Guard", 1, 5),
    ("Priest", 2, 2),
    ("Baron", 3, 2),
    ("Handmaid", 4, 2),
    ("Prince", 5, 2),
    ("King", 6, 1),
    ("Countess", 7, 1),
    ("Princess", 8, 1),
]

PREMIUM_CARDS = [
    ("Spy", 0, 2),
    ("Guard", 1, 6),
    ("Priest", 2, 2),
    ("Baron", 3, 2),
    ("Handmaid", 4, 2),
    ("Prince", 5, 2),
    ("Chancellor", 6, 2),
    ("King", 7, 1),
    ("Countess", 8, 1),
    ("Princess", 9, 1),
]

CARD_NAMES_STANDARD = {
    1: "Guard", 2: "Priest", 3: "Baron", 4: "Handmaid",
    5: "Prince", 6: "King", 7: "Countess", 8: "Princess",
}

CARD_NAMES_PREMIUM = {
    0: "Spy", 1: "Guard", 2: "Priest", 3: "Baron", 4: "Handmaid",
    5: "Prince", 6: "Chancellor", 7: "King", 8: "Countess", 9: "Princess",
}


class LoveLetterGame(BaseGame):
    """Love Letter - a 2-player card game of risk, deduction, and luck."""

    name = "Love Letter"
    description = "A game of risk, deduction, and luck"
    min_players = 2
    max_players = 2
    variations = {
        "standard": "Standard Love Letter",
        "premium": "Premium Edition (extra cards)",
    }

    def __init__(self, variation=None):
        super().__init__(variation)
        self.deck = []
        self.hands = {1: [], 2: []}
        self.played = {1: [], 2: []}
        self.tokens = {1: 0, 2: 0}
        self.protected = {1: False, 2: False}
        self.eliminated = {1: False, 2: False}
        self.removed_hidden = []   # face-down removed card(s)
        self.removed_visible = []  # face-up removed cards
        self.log = []
        self.round_over = False
        self.round_winner = None
        self.tokens_to_win = 7
        self._priest_reveal = None  # temporary info from Priest

        if self.variation == "premium":
            self.card_defs = PREMIUM_CARDS
            self.card_names = dict(CARD_NAMES_PREMIUM)
        else:
            self.card_defs = STANDARD_CARDS
            self.card_names = dict(CARD_NAMES_STANDARD)

    # ---------------------------------------------------------------- helpers

    def _opponent(self, player=None):
        if player is None:
            player = self.current_player
        return 2 if player == 1 else 1

    def _build_deck(self):
        self.deck = []
        for name, value, count in self.card_defs:
            for _ in range(count):
                self.deck.append(value)
        random.shuffle(self.deck)

    def _draw(self):
        if self.deck:
            return self.deck.pop()
        return None

    def _card_label(self, value):
        name = self.card_names.get(value, "?")
        return f"{name}({value})"

    def _add_log(self, msg):
        self.log.append(msg)
        if len(self.log) > 10:
            self.log = self.log[-10:]

    def _countess_value(self):
        """Return the value of the Countess card in the current variation."""
        if self.variation == "premium":
            return 8  # Countess is 8 in premium
        return 7

    def _prince_value(self):
        if self.variation == "premium":
            return 5
        return 5

    def _king_value(self):
        if self.variation == "premium":
            return 7
        return 6

    def _princess_value(self):
        if self.variation == "premium":
            return 9
        return 8

    def _must_play_countess(self, hand):
        """Check if the Countess must be played (held with King or Prince)."""
        countess_val = self._countess_value()
        if countess_val not in hand:
            return False
        king_val = self._king_value()
        prince_val = self._prince_value()
        other = [c for c in hand if c != countess_val]
        for c in other:
            if c == king_val or c == prince_val:
                return True
        return False

    def _eliminate(self, player):
        self.eliminated[player] = True
        if self.hands[player]:
            discarded = self.hands[player].pop(0)
            self.played[player].append(discarded)
            self._add_log(f"  {self.players[player - 1]} is eliminated! (discarded {self._card_label(discarded)})")
        else:
            self._add_log(f"  {self.players[player - 1]} is eliminated!")

    # --------------------------------------------------------- round management

    def _start_round(self):
        self._build_deck()
        self.hands = {1: [], 2: []}
        self.played = {1: [], 2: []}
        self.protected = {1: False, 2: False}
        self.eliminated = {1: False, 2: False}
        self.removed_hidden = []
        self.removed_visible = []
        self.round_over = False
        self.round_winner = None
        self._priest_reveal = None
        self.log = []

        # Remove 1 card face-down
        self.removed_hidden.append(self._draw())

        # Remove 3 cards face-up (for 2-player game)
        for _ in range(3):
            card = self._draw()
            if card is not None:
                self.removed_visible.append(card)

        # Deal 1 card to each player
        for p in (1, 2):
            self.hands[p] = [self._draw()]

        self._add_log("New round started.")
        self._add_log(f"  Removed face-up: {', '.join(self._card_label(c) for c in self.removed_visible)}")

    def _resolve_round(self):
        """Determine round winner when deck is empty or someone is eliminated."""
        self.round_over = True

        if self.eliminated[1] and not self.eliminated[2]:
            self.round_winner = 2
        elif self.eliminated[2] and not self.eliminated[1]:
            self.round_winner = 1
        elif self.eliminated[1] and self.eliminated[2]:
            # Both out (shouldn't normally happen), draw
            self.round_winner = None
        else:
            # Compare hand values
            v1 = self.hands[1][0] if self.hands[1] else 0
            v2 = self.hands[2][0] if self.hands[2] else 0
            if v1 > v2:
                self.round_winner = 1
            elif v2 > v1:
                self.round_winner = 2
            else:
                # Tie: compare total of discarded cards
                s1 = sum(self.played[1])
                s2 = sum(self.played[2])
                if s1 > s2:
                    self.round_winner = 1
                elif s2 > s1:
                    self.round_winner = 2
                else:
                    self.round_winner = None  # true draw

        if self.round_winner:
            self.tokens[self.round_winner] += 1
            self._add_log(f"  {self.players[self.round_winner - 1]} wins the round! "
                          f"(Tokens: {self.tokens[1]}-{self.tokens[2]})")
        else:
            self._add_log("  Round is a draw! No token awarded.")

    # ------------------------------------------------------------------ setup

    def setup(self):
        self.tokens = {1: 0, 2: 0}
        self.game_over = False
        self.winner = None
        self.turn_number = 0
        self.current_player = 1
        self._start_round()

    # ---------------------------------------------------------------- display

    def display(self):
        cp = self.current_player
        opp = self._opponent()

        print(f"\n{'=' * 56}")
        print(f"  LOVE LETTER  (Turn {self.turn_number + 1})")
        print(f"{'=' * 56}")

        # Token scores
        print(f"\n  Tokens: {self.players[0]} [{self.tokens[1]}] - "
              f"{self.players[1]} [{self.tokens[2]}]  (first to {self.tokens_to_win} wins)")

        # Opponent info
        print(f"\n  {self.players[opp - 1]}:")
        if self.eliminated[opp]:
            print(f"    ELIMINATED")
        else:
            print(f"    Hand: (hidden)")
            if self.protected[opp]:
                print(f"    ** Protected by Handmaid **")

        if self.played[opp]:
            print(f"    Played: {', '.join(self._card_label(c) for c in self.played[opp])}")

        # Game info
        print(f"\n  Deck: {len(self.deck)} card(s) remaining")
        print(f"  Removed (face-up): {', '.join(self._card_label(c) for c in self.removed_visible)}")
        print(f"  Removed (face-down): 1 unknown card")

        # Current player info
        print(f"\n  {self.players[cp - 1]} (you):")
        if self.eliminated[cp]:
            print(f"    ELIMINATED")
        else:
            hand_str = "  |  ".join(
                f"[{i}] {self._card_label(c)}" for i, c in enumerate(self.hands[cp], 1)
            )
            print(f"    Hand: {hand_str}")
            if self.protected[cp]:
                print(f"    ** Protected by Handmaid **")

        if self.played[cp]:
            print(f"    Played: {', '.join(self._card_label(c) for c in self.played[cp])}")

        # Priest reveal info
        if self._priest_reveal:
            print(f"\n  (Priest info: opponent holds {self._card_label(self._priest_reveal)})")

        # Log
        if self.log:
            print(f"\n  --- Log ---")
            for line in self.log[-6:]:
                print(f"  {line}")

        print()

    # -------------------------------------------------------------- get_move

    def get_move(self):
        cp = self.current_player

        # Check if round is over
        if self.round_over:
            input_with_quit("  Press Enter to start next round...")
            return "next_round"

        # Draw a card
        drawn = self._draw()
        if drawn is None:
            # Deck empty, resolve round
            return "resolve"

        self.hands[cp].append(drawn)
        self._add_log(f"  {self.players[cp - 1]} draws a card.")

        # Check Countess forced play
        if self._must_play_countess(self.hands[cp]):
            countess_val = self._countess_value()
            print(f"\n  You drew {self._card_label(drawn)}.")
            print(f"  You must play the Countess! (holding King or Prince)")
            input_with_quit("  Press Enter to play Countess...")
            idx = self.hands[cp].index(countess_val)
            return ("play", idx)

        # Display the drawn card
        clear_screen()
        self.display()
        print(f"  You drew: {self._card_label(drawn)}")
        print(f"  Your hand: [1] {self._card_label(self.hands[cp][0])}  |  "
              f"[2] {self._card_label(self.hands[cp][1])}")

        # Get play choice
        while True:
            choice = input_with_quit("  Play which card? (play 1 / play 2): ").strip().lower()
            parts = choice.split()
            if len(parts) == 2 and parts[0] == "play" and parts[1] in ("1", "2"):
                idx = int(parts[1]) - 1
                card_val = self.hands[cp][idx]
                # Check Princess self-play warning
                if card_val == self._princess_value():
                    confirm = input_with_quit("  Playing the Princess eliminates you! Are you sure? (yes/no): ").strip().lower()
                    if confirm not in ("yes", "y"):
                        continue
                return ("play", idx)
            elif choice in ("1", "2"):
                idx = int(choice) - 1
                card_val = self.hands[cp][idx]
                if card_val == self._princess_value():
                    confirm = input_with_quit("  Playing the Princess eliminates you! Are you sure? (yes/no): ").strip().lower()
                    if confirm not in ("yes", "y"):
                        continue
                return ("play", idx)
            print("  Invalid. Type 'play 1' or 'play 2'.")

    # -------------------------------------------------------------- make_move

    def make_move(self, move):
        cp = self.current_player

        if move == "next_round":
            self._start_round()
            self.current_player = 1
            return True

        if move == "resolve":
            self._resolve_round()
            return True

        if not isinstance(move, tuple) or move[0] != "play":
            return False

        _, idx = move
        if idx < 0 or idx >= len(self.hands[cp]):
            return False

        card_val = self.hands[cp].pop(idx)
        self.played[cp].append(card_val)
        opp = self._opponent()

        # Remove protection at start of turn
        self.protected[cp] = False

        card_name = self.card_names.get(card_val, "?")
        self._add_log(f"  {self.players[cp - 1]} plays {self._card_label(card_val)}.")

        # Resolve card effect
        if self.variation == "premium":
            self._resolve_premium(card_val, cp, opp)
        else:
            self._resolve_standard(card_val, cp, opp)

        # Check if round should end
        if self.eliminated[1] or self.eliminated[2]:
            self._resolve_round()
        elif not self.deck and not self.round_over:
            # Deck is empty after this turn; round ends
            self._resolve_round()

        return True

    # -------------------------------------------------------- standard effects

    def _resolve_standard(self, card_val, cp, opp):
        if card_val == 1:
            self._effect_guard(cp, opp)
        elif card_val == 2:
            self._effect_priest(cp, opp)
        elif card_val == 3:
            self._effect_baron(cp, opp)
        elif card_val == 4:
            self._effect_handmaid(cp)
        elif card_val == 5:
            self._effect_prince(cp, opp)
        elif card_val == 6:
            self._effect_king(cp, opp)
        elif card_val == 7:
            self._effect_countess(cp)
        elif card_val == 8:
            self._effect_princess(cp)

    # -------------------------------------------------------- premium effects

    def _resolve_premium(self, card_val, cp, opp):
        if card_val == 0:
            self._effect_spy(cp)
        elif card_val == 1:
            self._effect_guard(cp, opp)
        elif card_val == 2:
            self._effect_priest(cp, opp)
        elif card_val == 3:
            self._effect_baron(cp, opp)
        elif card_val == 4:
            self._effect_handmaid(cp)
        elif card_val == 5:
            self._effect_prince(cp, opp)
        elif card_val == 6:
            self._effect_chancellor(cp)
        elif card_val == 7:
            self._effect_king(cp, opp)
        elif card_val == 8:
            self._effect_countess(cp)
        elif card_val == 9:
            self._effect_princess(cp)

    # --------------------------------------------------------- card effects

    def _effect_guard(self, cp, opp):
        """Guard(1): Guess opponent's card (not Guard). If correct, they're out."""
        if self.protected[opp] or self.eliminated[opp]:
            print("  Opponent is protected or eliminated. Guard has no effect.")
            self._add_log("  Guard has no effect (opponent protected/eliminated).")
            return

        # Build list of guessable card names (not Guard)
        if self.variation == "premium":
            guessable = {v: n for v, n in self.card_names.items() if n != "Guard" and v != 1}
        else:
            guessable = {v: n for v, n in self.card_names.items() if n != "Guard" and v != 1}

        print("  Guess opponent's card (not Guard):")
        for v in sorted(guessable.keys()):
            print(f"    {guessable[v].lower()} ({v})")

        while True:
            guess = input_with_quit("  Your guess: ").strip().lower()
            matched_val = None
            for v, n in guessable.items():
                if guess == n.lower() or guess == str(v):
                    matched_val = v
                    break
            if matched_val is not None:
                break
            print("  Invalid guess. Enter a card name or number (not Guard).")

        guess_name = self.card_names[matched_val]
        self._add_log(f"  {self.players[cp - 1]} guesses {guess_name}.")

        if self.hands[opp] and self.hands[opp][0] == matched_val:
            print(f"  Correct! {self.players[opp - 1]} had {self._card_label(matched_val)}!")
            self._add_log(f"  Correct guess! {self.players[opp - 1]} is eliminated!")
            self._eliminate(opp)
        else:
            print(f"  Wrong guess.")
            self._add_log(f"  Wrong guess.")
        input_with_quit("  Press Enter to continue...")

    def _effect_priest(self, cp, opp):
        """Priest(2): Look at opponent's card."""
        if self.protected[opp] or self.eliminated[opp]:
            print("  Opponent is protected or eliminated. Priest has no effect.")
            self._add_log("  Priest has no effect (opponent protected/eliminated).")
            return

        if self.hands[opp]:
            seen = self.hands[opp][0]
            self._priest_reveal = seen
            print(f"  You see opponent's card: {self._card_label(seen)}")
            self._add_log(f"  {self.players[cp - 1]} sees opponent's card.")
        input_with_quit("  Press Enter to continue...")

    def _effect_baron(self, cp, opp):
        """Baron(3): Compare hands. Lower card is out."""
        if self.protected[opp] or self.eliminated[opp]:
            print("  Opponent is protected or eliminated. Baron has no effect.")
            self._add_log("  Baron has no effect (opponent protected/eliminated).")
            input_with_quit("  Press Enter to continue...")
            return

        my_val = self.hands[cp][0] if self.hands[cp] else 0
        opp_val = self.hands[opp][0] if self.hands[opp] else 0

        print(f"  You reveal: {self._card_label(my_val)} vs {self._card_label(opp_val)}")

        if my_val > opp_val:
            print(f"  {self.players[opp - 1]} is eliminated!")
            self._add_log(f"  Baron comparison: {self._card_label(my_val)} > {self._card_label(opp_val)}. "
                          f"{self.players[opp - 1]} eliminated.")
            self._eliminate(opp)
        elif opp_val > my_val:
            print(f"  {self.players[cp - 1]} is eliminated!")
            self._add_log(f"  Baron comparison: {self._card_label(my_val)} < {self._card_label(opp_val)}. "
                          f"{self.players[cp - 1]} eliminated.")
            self._eliminate(cp)
        else:
            print("  Tie! No one is eliminated.")
            self._add_log("  Baron comparison: tie.")
        input_with_quit("  Press Enter to continue...")

    def _effect_handmaid(self, cp):
        """Handmaid(4): Protected until your next turn."""
        self.protected[cp] = True
        print(f"  {self.players[cp - 1]} is now protected until their next turn.")
        self._add_log(f"  {self.players[cp - 1]} is protected (Handmaid).")

    def _effect_prince(self, cp, opp):
        """Prince(5): Opponent discards their hand and draws a new card."""
        if self.protected[opp] or self.eliminated[opp]:
            # Target self if opponent is protected
            target = cp
            print("  Opponent is protected. You must target yourself!")
            self._add_log("  Prince targets self (opponent protected).")
        else:
            print(f"  Choose target: (1) {self.players[cp - 1]} (self)  (2) {self.players[opp - 1]}")
            while True:
                choice = input_with_quit("  Target (1/2): ").strip()
                if choice == "1":
                    target = cp
                    break
                elif choice == "2":
                    target = opp
                    break
                print("  Enter 1 or 2.")

        if self.hands[target]:
            discarded = self.hands[target][0]
            self.hands[target] = []
            self.played[target].append(discarded)
            self._add_log(f"  {self.players[target - 1]} discards {self._card_label(discarded)}.")

            # If Princess is discarded, player is eliminated
            if discarded == self._princess_value():
                print(f"  {self.players[target - 1]} discarded the Princess and is eliminated!")
                self._add_log(f"  {self.players[target - 1]} discarded Princess! Eliminated!")
                self.eliminated[target] = True
                return

            # Draw a new card
            new_card = self._draw()
            if new_card is not None:
                self.hands[target] = [new_card]
            else:
                # Deck empty, draw the hidden removed card
                if self.removed_hidden:
                    self.hands[target] = [self.removed_hidden.pop(0)]
                else:
                    self.eliminated[target] = True

        input_with_quit("  Press Enter to continue...")

    def _effect_king(self, cp, opp):
        """King(6/7): Trade hands with opponent."""
        if self.protected[opp] or self.eliminated[opp]:
            print("  Opponent is protected or eliminated. King has no effect.")
            self._add_log("  King has no effect (opponent protected/eliminated).")
            input_with_quit("  Press Enter to continue...")
            return

        self.hands[cp], self.hands[opp] = self.hands[opp], self.hands[cp]
        print(f"  You traded hands with {self.players[opp - 1]}.")
        print(f"  Your new card: {self._card_label(self.hands[cp][0]) if self.hands[cp] else 'none'}")
        self._add_log(f"  {self.players[cp - 1]} trades hands with {self.players[opp - 1]} (King).")
        self._priest_reveal = None  # Priest info is now stale
        input_with_quit("  Press Enter to continue...")

    def _effect_countess(self, cp):
        """Countess(7/8): No effect when played (but must be played if holding King/Prince)."""
        print("  Countess played. No effect.")
        self._add_log("  Countess played (no effect).")

    def _effect_princess(self, cp):
        """Princess(8/9): If you play or discard this, you are eliminated."""
        print(f"  {self.players[cp - 1]} played the Princess and is eliminated!")
        self._add_log(f"  {self.players[cp - 1]} played the Princess! Eliminated!")
        self._eliminate(cp)

    # -------------------------------------------------------- premium-only effects

    def _effect_spy(self, cp):
        """Spy(0): No immediate effect. (At end of round, if only you played a Spy, gain a token.)"""
        print("  Spy played. No immediate effect.")
        print("  (If only you played a Spy this round and you survive, you gain a bonus token.)")
        self._add_log(f"  {self.players[cp - 1]} plays Spy.")

    def _effect_chancellor(self, cp):
        """Chancellor(6): Draw 2 cards from the deck, keep 1, put 2 on bottom."""
        drawn = []
        for _ in range(2):
            c = self._draw()
            if c is not None:
                drawn.append(c)

        if not drawn:
            print("  No cards to draw. Chancellor has no effect.")
            self._add_log("  Chancellor: no cards to draw.")
            return

        combined = self.hands[cp] + drawn
        print(f"  You drew: {', '.join(self._card_label(c) for c in drawn)}")
        print(f"  Your cards: {', '.join(f'[{i}] {self._card_label(c)}' for i, c in enumerate(combined, 1))}")
        print(f"  Keep 1 card, put the rest on bottom of deck.")

        while True:
            choice = input_with_quit(f"  Keep which card? (1-{len(combined)}): ").strip()
            if choice.isdigit() and 1 <= int(choice) <= len(combined):
                keep_idx = int(choice) - 1
                kept = combined[keep_idx]
                returned = [c for i, c in enumerate(combined) if i != keep_idx]
                self.hands[cp] = [kept]
                random.shuffle(returned)
                self.deck = returned + self.deck  # put on bottom (front of list = bottom)
                # Actually bottom of deck means they go to the end to be drawn last
                self.deck = self.deck[len(returned):] + returned
                print(f"  You kept {self._card_label(kept)}.")
                self._add_log(f"  {self.players[cp - 1]} uses Chancellor (drew {len(drawn)}, kept 1).")
                break
            print("  Invalid choice.")
        input_with_quit("  Press Enter to continue...")

    # -------------------------------------------------------- check_game_over

    def check_game_over(self):
        # Check if someone won enough tokens
        for p in (1, 2):
            if self.tokens[p] >= self.tokens_to_win:
                self.game_over = True
                self.winner = p
                return

        # If round is over, don't end the whole game yet
        # The next get_move will prompt for a new round

    def switch_player(self):
        """Override: don't switch if round is over."""
        if not self.round_over:
            super().switch_player()

    # -------------------------------------------------------- save / load

    def get_state(self):
        return {
            "deck": list(self.deck),
            "hands": {str(k): list(v) for k, v in self.hands.items()},
            "played": {str(k): list(v) for k, v in self.played.items()},
            "tokens": {str(k): v for k, v in self.tokens.items()},
            "protected": {str(k): v for k, v in self.protected.items()},
            "eliminated": {str(k): v for k, v in self.eliminated.items()},
            "removed_hidden": list(self.removed_hidden),
            "removed_visible": list(self.removed_visible),
            "round_over": self.round_over,
            "round_winner": self.round_winner,
            "log": list(self.log),
            "priest_reveal": self._priest_reveal,
        }

    def load_state(self, state):
        self.deck = list(state["deck"])
        self.hands = {int(k): list(v) for k, v in state["hands"].items()}
        self.played = {int(k): list(v) for k, v in state["played"].items()}
        self.tokens = {int(k): v for k, v in state["tokens"].items()}
        self.protected = {int(k): v for k, v in state["protected"].items()}
        self.eliminated = {int(k): v for k, v in state["eliminated"].items()}
        self.removed_hidden = list(state["removed_hidden"])
        self.removed_visible = list(state["removed_visible"])
        self.round_over = state["round_over"]
        self.round_winner = state["round_winner"]
        self.log = list(state.get("log", []))
        self._priest_reveal = state.get("priest_reveal")

    # ------------------------------------------------------------ tutorial

    def get_tutorial(self):
        if self.variation == "premium":
            return (
                f"\n{'=' * 58}\n"
                f"  LOVE LETTER - Tutorial (Premium Edition)\n"
                f"{'=' * 58}\n\n"
                f"  OVERVIEW:\n"
                f"  A 2-player game of risk, deduction, and luck.\n"
                f"  Win 7 tokens by winning rounds.\n\n"
                f"  SETUP:\n"
                f"  21-card deck with cards valued 0-9.\n"
                f"  1 card removed face-down, 3 face-up.\n"
                f"  Each player holds 1 card.\n\n"
                f"  ON YOUR TURN:\n"
                f"  Draw 1 card, then play 1 of your 2 cards.\n"
                f"  Type 'play 1' or 'play 2' to choose.\n\n"
                f"  CARDS:\n"
                f"  Spy(0)        - No effect. Bonus token if only you played one.\n"
                f"  Guard(1)      - Guess opponent's card (not Guard). Correct = out.\n"
                f"  Priest(2)     - See opponent's card.\n"
                f"  Baron(3)      - Compare hands. Lower value is out.\n"
                f"  Handmaid(4)   - Protected until your next turn.\n"
                f"  Prince(5)     - Target discards and draws. Princess discard = out.\n"
                f"  Chancellor(6) - Draw 2, keep 1, return 2 to bottom.\n"
                f"  King(7)       - Trade hands with opponent.\n"
                f"  Countess(8)   - MUST play if holding King or Prince.\n"
                f"  Princess(9)   - Play/discard this = you are out.\n\n"
                f"  ROUND END:\n"
                f"  Deck empty or 1 player remains. Highest card wins.\n"
                f"  First to 7 tokens wins the game!\n\n"
                f"  COMMANDS:\n"
                f"  'play 1'/'play 2' - play left/right card\n"
                f"  'quit' - exit, 'save' - suspend, 'help' - help\n"
                f"{'=' * 58}"
            )

        return (
            f"\n{'=' * 58}\n"
            f"  LOVE LETTER - Tutorial (Standard)\n"
            f"{'=' * 58}\n\n"
            f"  OVERVIEW:\n"
            f"  A 2-player game of risk, deduction, and luck.\n"
            f"  Win 7 tokens by winning rounds.\n\n"
            f"  SETUP:\n"
            f"  16-card deck with cards valued 1-8.\n"
            f"  1 card removed face-down, 3 face-up.\n"
            f"  Each player holds 1 card.\n\n"
            f"  ON YOUR TURN:\n"
            f"  Draw 1 card, then play 1 of your 2 cards.\n"
            f"  Type 'play 1' or 'play 2' to choose.\n\n"
            f"  CARDS:\n"
            f"  Guard(1)    x5 - Guess opponent's card (not Guard). Correct = out.\n"
            f"  Priest(2)   x2 - See opponent's card.\n"
            f"  Baron(3)    x2 - Compare hands. Lower value is out.\n"
            f"  Handmaid(4) x2 - Protected until your next turn.\n"
            f"  Prince(5)   x2 - Target discards and draws. Princess discard = out.\n"
            f"  King(6)     x1 - Trade hands with opponent.\n"
            f"  Countess(7) x1 - MUST play if holding King or Prince.\n"
            f"  Princess(8) x1 - Play/discard this = you are out.\n\n"
            f"  ROUND END:\n"
            f"  Deck empty or 1 player remains. Highest card wins.\n"
            f"  First to 7 tokens wins the game!\n\n"
            f"  COMMANDS:\n"
            f"  'play 1'/'play 2' - play left/right card\n"
            f"  'quit' - exit, 'save' - suspend, 'help' - help\n"
            f"{'=' * 58}"
        )
