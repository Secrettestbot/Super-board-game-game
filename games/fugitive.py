"""Fugitive - Asymmetric number-card chase game (2-player)."""

import random

from engine.base import BaseGame, input_with_quit, clear_screen


class FugitiveGame(BaseGame):
    """Fugitive - The Fugitive plays hideouts; the Marshal hunts them down."""

    name = "Fugitive"
    description = "Asymmetric number-card chase game"
    min_players = 2
    max_players = 2
    variations = {
        "standard": "Standard game (cards 0-42)",
        "short": "Short game (cards 0-28)",
    }

    def __init__(self, variation=None):
        super().__init__(variation)
        self.max_card = 42 if self.variation != "short" else 28
        self.fugitive_hand = []
        self.marshal_hand = []
        self.hideouts = []  # list of {"value": int, "revealed": bool, "sprint_cards": []}
        self.draw_pile = []
        self.phase = "fugitive_play"  # fugitive_play, marshal_guess, fugitive_draw, marshal_draw
        self.log = []
        self.sprint_distance = 3
        self.fugitive_player = 1
        self.marshal_player = 2

    def _add_log(self, msg):
        self.log.append(msg)
        if len(self.log) > 8:
            self.log = self.log[-8:]

    def setup(self):
        self.max_card = 42 if self.variation != "short" else 28
        # Create deck: cards 1 to max_card-1 (0 and max_card are special)
        all_cards = list(range(1, self.max_card))
        random.shuffle(all_cards)

        # Deal starting hands
        # Fugitive gets card 0 on table, cards 1-3 guaranteed + 4 random
        self.hideouts = [{"value": 0, "revealed": True, "sprint_cards": []}]

        guaranteed_fugitive = [1, 2, 3]
        remaining = [c for c in all_cards if c not in guaranteed_fugitive]
        random.shuffle(remaining)

        self.fugitive_hand = guaranteed_fugitive + remaining[:4]
        # Add card max_card to fugitive hand
        self.fugitive_hand.append(self.max_card)
        self.fugitive_hand.sort()

        draw_cards = remaining[4:]

        # Marshal gets 5 cards from the remaining
        self.marshal_hand = draw_cards[:5]
        self.marshal_hand.sort()
        self.draw_pile = draw_cards[5:]
        random.shuffle(self.draw_pile)

        self.phase = "fugitive_play"
        self.log = []
        self.game_over = False
        self.winner = None
        self.current_player = self.fugitive_player
        self.fugitive_player = 1
        self.marshal_player = 2

    def _last_hideout_value(self):
        return self.hideouts[-1]["value"]

    def _max_sprint(self, num_sprint_cards=0):
        return self.sprint_distance + (num_sprint_cards * 2)

    def display(self):
        clear_screen()
        print("=" * 56)
        print("            F U G I T I V E")
        print("=" * 56)
        print(f"  Cards range: 0 to {self.max_card}")
        print(f"  Draw pile: {len(self.draw_pile)} cards")
        print()

        # Hideout trail
        print("  === HIDEOUT TRAIL ===")
        trail_parts = []
        for h in self.hideouts:
            if h["revealed"]:
                sprint_str = f"(+{len(h['sprint_cards'])} sprint)" if h["sprint_cards"] else ""
                trail_parts.append(f"[{h['value']}]{sprint_str}")
            else:
                trail_parts.append("[??]")
        print("  " + " -> ".join(trail_parts))
        print()

        unrevealed = [h for h in self.hideouts if not h["revealed"]]
        revealed = [h for h in self.hideouts if h["revealed"]]
        print(f"  Revealed hideouts: {len(revealed)} | Hidden: {len(unrevealed)}")
        print()

        # Player info
        if self.current_player == self.fugitive_player:
            print(f"  >>> {self.players[0]} (Fugitive) - Your turn <<<")
            print(f"  Your hand: {self.fugitive_hand}")
            last_val = self._last_hideout_value()
            print(f"  Last hideout: {last_val} | Base sprint range: {last_val + 1} to {last_val + self.sprint_distance}")
            print(f"  (Discard extra cards as sprint cards for +2 range each)")
        else:
            print(f"  >>> {self.players[1]} (Marshal) - Your turn <<<")
            print(f"  Your hand: {self.marshal_hand}")
            print(f"  Hidden hideouts to find: {len(unrevealed)}")

        if self.log:
            print(f"\n  --- Log ---")
            for msg in self.log[-5:]:
                print(f"  {msg}")
        print()

    def get_move(self):
        if self.phase == "fugitive_play":
            print("  Play a hideout card. Format: <card_number> [sprint_card1 sprint_card2 ...]")
            print("  Example: '15' or '20 8 9' (20 as hideout, 8 and 9 as sprint cards)")
            return ("fugitive_play", input_with_quit("  Enter move: "))
        elif self.phase == "marshal_guess":
            print("  Guess a hideout number, or type 'pass' to end guessing.")
            return ("marshal_guess", input_with_quit("  Guess a number: "))
        elif self.phase == "fugitive_draw":
            return ("fugitive_draw", input_with_quit("  Press Enter to draw a card: "))
        elif self.phase == "marshal_draw":
            return ("marshal_draw", input_with_quit("  Press Enter to draw a card: "))
        return ("unknown", "")

    def make_move(self, move):
        action, value = move

        if action == "fugitive_play":
            parts = value.strip().split()
            if not parts:
                return False
            try:
                card_val = int(parts[0])
                sprint_vals = [int(x) for x in parts[1:]]
            except ValueError:
                return False

            # Validate card is in hand
            if card_val not in self.fugitive_hand:
                print(f"  You don't have card {card_val}!")
                return False

            # Validate sprint cards are in hand (and different from played card)
            temp_hand = list(self.fugitive_hand)
            temp_hand.remove(card_val)
            for sv in sprint_vals:
                if sv not in temp_hand:
                    print(f"  You don't have sprint card {sv}!")
                    return False
                temp_hand.remove(sv)

            # Check range
            last_val = self._last_hideout_value()
            max_reach = last_val + self._max_sprint(len(sprint_vals))
            if card_val <= last_val or card_val > max_reach:
                print(f"  Card {card_val} is out of range! Must be {last_val + 1} to {max_reach}.")
                return False

            # Play the hideout
            self.fugitive_hand.remove(card_val)
            for sv in sprint_vals:
                self.fugitive_hand.remove(sv)

            self.hideouts.append({
                "value": card_val,
                "revealed": False,
                "sprint_cards": sprint_vals,
            })
            sprint_msg = f" (with sprint cards: {sprint_vals})" if sprint_vals else ""
            self._add_log(f"Fugitive plays a hideout{sprint_msg}.")

            # Check if fugitive played the final card
            if card_val == self.max_card:
                self._add_log(f"Fugitive reaches hideout {self.max_card}!")
                # Marshal gets one last chance
                self.phase = "marshal_guess"
                self.current_player = self.marshal_player
            else:
                self.phase = "marshal_guess"
                self.current_player = self.marshal_player
            return True

        elif action == "marshal_guess":
            val = value.strip().lower()
            if val == "pass":
                self._add_log("Marshal passes.")
                # Both draw cards
                self.phase = "fugitive_draw"
                self.current_player = self.fugitive_player
                return True

            try:
                guess = int(val)
            except ValueError:
                return False

            # Check if guess matches any unrevealed hideout
            found = False
            for h in self.hideouts:
                if h["value"] == guess and not h["revealed"]:
                    h["revealed"] = True
                    found = True
                    self._add_log(f"Marshal reveals hideout {guess}!")
                    break

            if not found:
                self._add_log(f"Marshal guesses {guess} - MISS!")
                # On a miss, marshal's turn ends for guessing
                self.phase = "fugitive_draw"
                self.current_player = self.fugitive_player
            else:
                # Check if all hideouts are revealed
                unrevealed = [h for h in self.hideouts if not h["revealed"]]
                if not unrevealed:
                    self._add_log("All hideouts revealed! Marshal wins!")
                    self.game_over = True
                    self.winner = 2  # Marshal wins
                    return True
                # Marshal can keep guessing
                self._add_log("Marshal can guess again or pass.")
            return True

        elif action == "fugitive_draw":
            if self.draw_pile:
                card = self.draw_pile.pop()
                self.fugitive_hand.append(card)
                self.fugitive_hand.sort()
                self._add_log(f"Fugitive draws a card.")
            else:
                self._add_log("Draw pile empty - no card drawn.")
            self.phase = "marshal_draw"
            self.current_player = self.marshal_player
            return True

        elif action == "marshal_draw":
            if self.draw_pile:
                card = self.draw_pile.pop()
                self.marshal_hand.append(card)
                self.marshal_hand.sort()
                self._add_log(f"Marshal draws a card.")
            else:
                self._add_log("Draw pile empty - no card drawn.")
            self.phase = "fugitive_play"
            self.current_player = self.fugitive_player
            return True

        return False

    def check_game_over(self):
        # Fugitive wins if card max_card is played and not all hideouts are revealed
        if self.game_over:
            return

        last_hideout = self.hideouts[-1]
        if last_hideout["value"] == self.max_card:
            unrevealed = [h for h in self.hideouts if not h["revealed"]]
            if unrevealed and self.phase != "marshal_guess":
                self.game_over = True
                self.winner = 1  # Fugitive wins
                return

        # Check if all hideouts revealed (marshal wins)
        unrevealed = [h for h in self.hideouts if not h["revealed"]]
        if not unrevealed and len(self.hideouts) > 1:
            self.game_over = True
            self.winner = 2
            return

        # If fugitive has no playable cards and hasn't reached max_card
        if self.phase == "fugitive_play" and not self._has_playable_card():
            self._add_log("Fugitive has no playable cards! Marshal wins!")
            self.game_over = True
            self.winner = 2

    def _has_playable_card(self):
        last_val = self._last_hideout_value()
        hand = list(self.fugitive_hand)
        for card in hand:
            if card <= last_val:
                continue
            # Check if reachable with sprint cards
            other_cards = [c for c in hand if c != card]
            for num_sprint in range(len(other_cards) + 1):
                max_reach = last_val + self._max_sprint(num_sprint)
                if card <= max_reach:
                    return True
        return False

    def get_state(self):
        return {
            "max_card": self.max_card,
            "fugitive_hand": self.fugitive_hand,
            "marshal_hand": self.marshal_hand,
            "hideouts": self.hideouts,
            "draw_pile": self.draw_pile,
            "phase": self.phase,
            "log": self.log,
            "fugitive_player": self.fugitive_player,
            "marshal_player": self.marshal_player,
        }

    def load_state(self, state):
        self.max_card = state["max_card"]
        self.fugitive_hand = state["fugitive_hand"]
        self.marshal_hand = state["marshal_hand"]
        self.hideouts = state["hideouts"]
        self.draw_pile = state["draw_pile"]
        self.phase = state["phase"]
        self.log = state["log"]
        self.fugitive_player = state["fugitive_player"]
        self.marshal_player = state["marshal_player"]
        self._resumed = True

    def get_tutorial(self):
        return """
=== FUGITIVE TUTORIAL ===

Fugitive is an asymmetric 2-player game of cat and mouse.

ROLES:
  Player 1 = FUGITIVE - Trying to escape by laying down hideout cards
  Player 2 = MARSHAL  - Trying to catch the fugitive by guessing hideout numbers

HOW TO PLAY:

Fugitive's Turn:
  1. Play a hideout card face-down from your hand
  2. The card must be HIGHER than your last hideout
  3. The card must be within sprint distance (+3 of last hideout)
  4. You can discard extra cards as "sprint cards" for +2 range each
     Example: Last hideout is 10, base range is 11-13
     With 1 sprint card: range becomes 11-15
     With 2 sprint cards: range becomes 11-17
  5. Format: '<card> [sprint1 sprint2 ...]'  e.g. '15 8 9'

Marshal's Turn:
  1. Guess a number to try to reveal a hidden hideout
  2. If correct, the hideout is revealed!
  3. If wrong, your guessing turn ends
  4. If correct, you can keep guessing or type 'pass'
  5. Type 'pass' to end your turn without guessing

After guessing, both players draw a card from the deck.

WINNING:
  Fugitive wins by playing card {max_card} (the final hideout)
  Marshal wins by revealing ALL hidden hideouts

STRATEGY:
  Fugitive: Space your hideouts unpredictably; use sprint cards wisely
  Marshal: Use your hand cards as clues (cards you hold can't be hideouts)
           Track the possible range of each hidden hideout
"""
