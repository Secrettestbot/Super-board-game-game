"""Air, Land & Sea - A 2-player card game about controlling 3 theaters of war."""

import random

from engine.base import BaseGame, input_with_quit, clear_screen


# Card definitions: (name, theater, strength, power_description)
# Each theater has cards with strengths 1-6
CARD_DEFS = [
    # Air theater
    ("Support",       "Air", 1, "reinforce_adjacent"),
    ("Air Drop",      "Air", 2, "play_to_any"),
    ("Maneuver",      "Air", 3, "move_card"),
    ("Aerobatics",    "Air", 4, "flip_card"),
    ("Containment",   "Air", 5, "suppress"),
    ("Heavy Bombers", "Air", 6, None),
    # Land theater
    ("Reinforce",     "Land", 1, "reinforce_adjacent"),
    ("Ambush",        "Land", 2, "flip_opponent"),
    ("Cover Fire",    "Land", 3, "play_to_any"),
    ("Disrupt",       "Land", 4, "move_card"),
    ("Blockade",      "Land", 5, "suppress"),
    ("Heavy Tanks",   "Land", 6, None),
    # Sea theater
    ("Transport",     "Sea", 1, "play_to_any"),
    ("Escalation",    "Sea", 2, "reinforce_adjacent"),
    ("Redeploy",      "Sea", 3, "move_card"),
    ("Torpedo",       "Sea", 4, "flip_opponent"),
    ("Barrage",       "Sea", 5, "suppress"),
    ("Dreadnought",   "Sea", 6, None),
]

THEATERS = ["Air", "Land", "Sea"]

# Points awarded based on how many cards the loser still has when withdrawing
# If the loser withdraws with N cards remaining, the winner gets:
WITHDRAWAL_POINTS = {
    6: 2,   # withdrew immediately (all 6 cards in hand)
    5: 2,   # withdrew with 5 cards
    4: 3,   # withdrew with 4 cards
    3: 3,   # withdrew with 3 cards
    2: 4,   # withdrew with 2 cards
    1: 4,   # withdrew with 1 card
    0: 6,   # played all cards / round ended naturally
}

POINTS_TO_WIN = 12


class AirLandSeaGame(BaseGame):
    """Air, Land & Sea - a 2-player card game about controlling 3 theaters of war."""

    name = "Air, Land & Sea"
    description = "Control theaters of war with tactical card play"
    min_players = 2
    max_players = 2
    variations = {
        "standard": "Standard (with card powers)",
        "simple": "Simple (no card powers)",
    }

    def __init__(self, variation=None):
        super().__init__(variation)
        self.scores = {1: 0, 2: 0}
        self.hands = {1: [], 2: []}
        # Each theater has cards played by each player: {theater: {player: [(card_idx, face_up)]}}
        self.theaters = {}
        self.theater_order = list(THEATERS)  # order can be shuffled each round
        self.round_number = 0
        self.round_over = False
        self.round_winner = None
        self.withdrew = None  # player who withdrew, if any
        self.log = []
        self.suppressed = {1: set(), 2: set()}  # theaters where powers are suppressed

    # ------------------------------------------------------------------ helpers
    def _build_deck(self):
        deck = list(range(len(CARD_DEFS)))
        random.shuffle(deck)
        return deck

    def _card(self, card_idx):
        """Return (name, theater, strength, power) for a card index."""
        return CARD_DEFS[card_idx]

    def _card_str(self, card_idx, face_up=True):
        name, theater, strength, _ = self._card(card_idx)
        if face_up:
            return f"{name} ({theater} {strength})"
        else:
            return f"[face-down] (str 2)"

    def _effective_strength(self, card_idx, face_up):
        """Return the effective strength of a card."""
        if not face_up:
            return 2
        return self._card(card_idx)[2]

    def _theater_strength(self, theater, player):
        """Total strength in a theater for a player."""
        total = 0
        for card_idx, face_up in self.theaters[theater][player]:
            total += self._effective_strength_for_token(card_idx, face_up)
        return total

    def _theater_winner(self, theater):
        """Return player who controls theater, or None for tie."""
        s1 = self._theater_strength(theater, 1)
        s2 = self._theater_strength(theater, 2)
        if s1 > s2:
            return 1
        elif s2 > s1:
            return 2
        return None

    def _theaters_won(self, player):
        """Count theaters controlled by player."""
        count = 0
        for t in THEATERS:
            if self._theater_winner(t) == player:
                count += 1
        return count

    def _adjacent_theaters(self, theater):
        """Return list of theaters adjacent to the given one in current order."""
        idx = self.theater_order.index(theater)
        adj = []
        if idx > 0:
            adj.append(self.theater_order[idx - 1])
        if idx < len(self.theater_order) - 1:
            adj.append(self.theater_order[idx + 1])
        return adj

    def _cards_in_hand(self, player):
        return len(self.hands[player])

    def _opponent(self, player=None):
        if player is None:
            player = self.current_player
        return 2 if player == 1 else 1

    def _add_log(self, msg):
        self.log.append(msg)
        if len(self.log) > 10:
            self.log = self.log[-10:]

    # ------------------------------------------------------------------ setup
    def setup(self):
        self.scores = {1: 0, 2: 0}
        self.game_over = False
        self.winner = None
        self.turn_number = 0
        self.round_number = 0
        self.log = []
        self._start_new_round()

    def _start_new_round(self):
        self.round_number += 1
        self.round_over = False
        self.round_winner = None
        self.withdrew = None
        self.suppressed = {1: set(), 2: set()}

        # Shuffle theater order for variety
        self.theater_order = list(THEATERS)
        random.shuffle(self.theater_order)

        # Initialize theater card slots
        self.theaters = {}
        for t in THEATERS:
            self.theaters[t] = {1: [], 2: []}

        # Deal cards
        deck = self._build_deck()
        self.hands = {1: [], 2: []}
        for i in range(6):
            self.hands[1].append(deck[i])
            self.hands[2].append(deck[i + 6])

        # Sort hands by theater then strength for readability
        for p in (1, 2):
            self.hands[p].sort(key=lambda c: (THEATERS.index(self._card(c)[1]), self._card(c)[2]))

        # Alternate who goes first each round
        if self.round_number % 2 == 1:
            self.current_player = 1
        else:
            self.current_player = 2

    # ---------------------------------------------------------------- display
    def display(self):
        cp = self.current_player
        opp = self._opponent()

        print(f"\n{'=' * 60}")
        print(f"  AIR, LAND & SEA  |  Round {self.round_number}  |  Turn {self.turn_number + 1}")
        print(f"  Score: {self.players[0]} {self.scores[1]} - {self.scores[2]} {self.players[1]}")
        print(f"  (First to {POINTS_TO_WIN} wins)")
        print(f"{'=' * 60}")

        # Show theaters in order (columns)
        print(f"\n  Theaters (left to right): {' | '.join(self.theater_order)}")
        print(f"  {'─' * 56}")

        # Opponent's cards (top)
        print(f"\n  {self.players[opp - 1]}'s side:  (hand: {self._cards_in_hand(opp)} cards)")
        for t in self.theater_order:
            cards = self.theaters[t][opp]
            strength = self._theater_strength(t, opp)
            card_strs = []
            for card_idx, face_up in cards:
                if face_up:
                    name, _, s, _ = self._card(card_idx)
                    card_strs.append(f"{name}({s})")
                else:
                    card_strs.append("[down](2)")
            cards_display = ", ".join(card_strs) if card_strs else "(empty)"
            print(f"    {t:4s} [{strength:2d}]: {cards_display}")

        # Theater control summary
        print(f"\n  Theater control:")
        for t in self.theater_order:
            s1 = self._theater_strength(t, 1)
            s2 = self._theater_strength(t, 2)
            winner = self._theater_winner(t)
            if winner:
                ctrl = self.players[winner - 1]
            else:
                ctrl = "Tied"
            print(f"    {t:4s}: {self.players[0]} {s1} vs {s2} {self.players[1]}  -> {ctrl}")

        # Current player's cards (bottom)
        print(f"\n  {self.players[cp - 1]}'s side (you):  (hand: {self._cards_in_hand(cp)} cards)")
        for t in self.theater_order:
            cards = self.theaters[t][cp]
            strength = self._theater_strength(t, cp)
            card_strs = []
            for card_idx, face_up in cards:
                if face_up:
                    name, _, s, _ = self._card(card_idx)
                    card_strs.append(f"{name}({s})")
                else:
                    card_strs.append("[down](2)")
            cards_display = ", ".join(card_strs) if card_strs else "(empty)"
            print(f"    {t:4s} [{strength:2d}]: {cards_display}")

        # Show hand
        print(f"\n  Your hand:")
        for i, card_idx in enumerate(self.hands[cp], 1):
            name, theater, strength, power = self._card(card_idx)
            power_str = ""
            if power and self.variation != "simple":
                power_str = f"  [Power: {self._power_description(power)}]"
            print(f"    {i}. {name} ({theater}, str {strength}){power_str}")

        # Log
        if self.log:
            print(f"\n  --- Log ---")
            for line in self.log[-5:]:
                print(f"  {line}")

        print()

    def _power_description(self, power):
        """Human-readable power description."""
        descs = {
            "reinforce_adjacent": "Add +3 to an adjacent theater",
            "play_to_any": "Can be played face-up to any theater",
            "move_card": "Move one of your cards to a different theater",
            "flip_card": "Flip one of your face-down cards face-up",
            "flip_opponent": "Flip one of opponent's face-up cards face-down",
            "suppress": "Disable powers in this theater for opponent",
        }
        return descs.get(power, power)

    # -------------------------------------------------------------- get_move
    def get_move(self):
        cp = self.current_player

        if not self.hands[cp]:
            # No cards left - auto pass
            return ("pass",)

        print("  Actions:")
        print("    Play a card: enter card number (1-{})".format(len(self.hands[cp])))
        print("    Withdraw: type 'withdraw' to concede this round")

        while True:
            move_input = input_with_quit("  Your action: ").strip().lower()

            if move_input in ("withdraw", "w"):
                print("  Are you sure you want to withdraw? (y/n): ", end="")
                confirm = input_with_quit("").strip().lower()
                if confirm in ("y", "yes"):
                    return ("withdraw",)
                continue

            if not move_input.isdigit():
                print("  Enter a card number or 'withdraw'.")
                continue

            card_choice = int(move_input)
            if card_choice < 1 or card_choice > len(self.hands[cp]):
                print(f"  Invalid card. Choose 1-{len(self.hands[cp])}.")
                continue

            card_idx = self.hands[cp][card_choice - 1]
            name, theater, strength, power = self._card(card_idx)

            # Choose face-up or face-down
            print(f"  Play '{name}' face-up or face-down?")
            print(f"    [U] Face-up (strength {strength}, in {theater} theater"
                  + (f", use power" if power and self.variation != "simple" else "") + ")")
            print(f"    [D] Face-down (strength 2, any theater, no power)")
            print(f"    [C] Cancel")

            while True:
                orientation = input_with_quit("  Choice: ").strip().lower()
                if orientation in ("c", "cancel"):
                    break
                if orientation in ("u", "up", "face-up"):
                    face_up = True
                    break
                if orientation in ("d", "down", "face-down"):
                    face_up = False
                    break
                print("  Enter U, D, or C.")

            if orientation in ("c", "cancel"):
                continue

            # Choose theater
            if face_up and power != "play_to_any" and self.variation != "simple":
                # Must play in matching theater
                target_theater = theater
                print(f"  Playing face-up in {theater} theater.")
            elif face_up and self.variation == "simple":
                # Simple mode: face-up always goes to matching theater
                target_theater = theater
                print(f"  Playing face-up in {theater} theater.")
            elif face_up and power == "play_to_any":
                # This card can go face-up to any theater
                target_theater = self._choose_theater("  Choose theater to play in")
                if target_theater is None:
                    continue
            else:
                # Face-down: any theater
                target_theater = self._choose_theater("  Choose theater to play in")
                if target_theater is None:
                    continue

            return ("play", card_choice - 1, face_up, target_theater)

    def _choose_theater(self, prompt):
        """Let player choose a theater. Returns theater name or None to cancel."""
        print(f"{prompt}:")
        for i, t in enumerate(self.theater_order, 1):
            print(f"    {i}. {t}")
        print(f"    [C] Cancel")
        while True:
            choice = input_with_quit("  Theater: ").strip().lower()
            if choice in ("c", "cancel"):
                return None
            if choice in ("air", "land", "sea"):
                return choice.capitalize()
            # Also accept theater name with capital
            for t in THEATERS:
                if choice == t.lower():
                    return t
            if choice.isdigit() and 1 <= int(choice) <= 3:
                return self.theater_order[int(choice) - 1]
            print("  Invalid. Enter 1-3, a theater name, or C.")

    # -------------------------------------------------------------- make_move
    def make_move(self, move):
        cp = self.current_player
        opp = self._opponent()

        if move[0] == "withdraw":
            self.withdrew = cp
            cards_left = self._cards_in_hand(cp)
            points = WITHDRAWAL_POINTS.get(cards_left, 6)
            self.scores[opp] += points
            self._add_log(f"{self.players[cp - 1]} withdraws! {self.players[opp - 1]} gains {points} points.")
            self.round_over = True
            return True

        if move[0] == "pass":
            self._add_log(f"{self.players[cp - 1]} has no cards left.")
            return True

        if move[0] == "play":
            _, hand_idx, face_up, target_theater = move
            card_idx = self.hands[cp][hand_idx]
            name, theater, strength, power = self._card(card_idx)

            # Validate theater choice for face-up play
            if face_up and power != "play_to_any" and target_theater != theater and self.variation != "simple":
                print(f"  {name} must be played face-up in {theater} theater.")
                return False
            if face_up and self.variation == "simple" and target_theater != theater:
                print(f"  Face-up cards must be played in their matching theater.")
                return False

            # Remove from hand and add to theater
            self.hands[cp].remove(card_idx)
            self.theaters[target_theater][cp].append((card_idx, face_up))

            if face_up:
                self._add_log(f"{self.players[cp - 1]} plays {name} (str {strength}) face-up in {target_theater}.")
            else:
                self._add_log(f"{self.players[cp - 1]} plays a card face-down (str 2) in {target_theater}.")

            # Activate power if face-up and standard variation
            if face_up and power and self.variation != "simple":
                if target_theater not in self.suppressed.get(cp, set()):
                    self._activate_power(cp, card_idx, target_theater, power)

            return True

        return False

    def _activate_power(self, player, card_idx, theater, power):
        """Activate a card's power."""
        opp = self._opponent(player)
        name = self._card(card_idx)[0]

        if power == "reinforce_adjacent":
            # Add +3 strength to an adjacent theater (implemented as a bonus token)
            adj = self._adjacent_theaters(theater)
            if not adj:
                self._add_log(f"  {name} power: no adjacent theaters.")
                return
            if len(adj) == 1:
                target = adj[0]
                print(f"  {name} power: +3 strength in {target}.")
            else:
                print(f"  {name} power: Choose adjacent theater to reinforce (+3):")
                for i, t in enumerate(adj, 1):
                    print(f"    {i}. {t}")
                while True:
                    choice = input_with_quit("  Theater: ").strip()
                    if choice.isdigit() and 1 <= int(choice) <= len(adj):
                        target = adj[int(choice) - 1]
                        break
                    for t in adj:
                        if choice.lower() == t.lower():
                            target = t
                            break
                    else:
                        print("  Invalid choice.")
                        continue
                    break
            # Add a virtual reinforcement card (represented as face-up with strength bonus)
            # We'll use a special marker: card_idx = -1 means reinforcement token
            self.theaters[target][player].append((-1, True))
            self._add_log(f"  {name} power: +3 reinforcement in {target}.")

        elif power == "play_to_any":
            # Already handled in move validation -- card can go to any theater face-up
            self._add_log(f"  {name} power: played to any theater.")

        elif power == "move_card":
            # Move one of your cards to a different theater
            my_cards = []
            for t in THEATERS:
                for i, (cidx, fu) in enumerate(self.theaters[t][player]):
                    if cidx != -1 and cidx != card_idx:  # don't move reinforce tokens or self
                        my_cards.append((t, i, cidx, fu))
            if not my_cards:
                self._add_log(f"  {name} power: no cards to move.")
                return
            print(f"  {name} power: Move one of your cards to another theater.")
            print(f"  Your cards on the board:")
            for j, (t, i, cidx, fu) in enumerate(my_cards, 1):
                cname = self._card(cidx)[0] if fu else "[face-down]"
                print(f"    {j}. {cname} in {t}")
            print(f"    [S] Skip")
            while True:
                choice = input_with_quit("  Card to move: ").strip().lower()
                if choice in ("s", "skip"):
                    return
                if choice.isdigit() and 1 <= int(choice) <= len(my_cards):
                    src_theater, src_idx, cidx, fu = my_cards[int(choice) - 1]
                    break
                print("  Invalid choice.")
            # Choose destination
            other_theaters = [t for t in THEATERS if t != src_theater]
            print(f"  Move to which theater?")
            for j, t in enumerate(other_theaters, 1):
                print(f"    {j}. {t}")
            while True:
                choice = input_with_quit("  Theater: ").strip()
                if choice.isdigit() and 1 <= int(choice) <= len(other_theaters):
                    dest = other_theaters[int(choice) - 1]
                    break
                for t in other_theaters:
                    if choice.lower() == t.lower():
                        dest = t
                        break
                else:
                    print("  Invalid choice.")
                    continue
                break
            # Move the card
            self.theaters[src_theater][player].remove((cidx, fu))
            self.theaters[dest][player].append((cidx, fu))
            self._add_log(f"  {name} power: moved a card from {src_theater} to {dest}.")

        elif power == "flip_card":
            # Flip one of your face-down cards face-up
            down_cards = []
            for t in THEATERS:
                for i, (cidx, fu) in enumerate(self.theaters[t][player]):
                    if not fu and cidx != -1:
                        down_cards.append((t, i, cidx))
            if not down_cards:
                self._add_log(f"  {name} power: no face-down cards to flip.")
                return
            print(f"  {name} power: Flip one of your face-down cards face-up.")
            for j, (t, i, cidx) in enumerate(down_cards, 1):
                cname, _, s, _ = self._card(cidx)
                print(f"    {j}. {cname} (str {s}) in {t}")
            print(f"    [S] Skip")
            while True:
                choice = input_with_quit("  Card to flip: ").strip().lower()
                if choice in ("s", "skip"):
                    return
                if choice.isdigit() and 1 <= int(choice) <= len(down_cards):
                    t, i, cidx = down_cards[int(choice) - 1]
                    # Find and replace in theater
                    idx_in_list = self.theaters[t][player].index((cidx, False))
                    self.theaters[t][player][idx_in_list] = (cidx, True)
                    cname = self._card(cidx)[0]
                    self._add_log(f"  {name} power: flipped {cname} face-up in {t}.")
                    # Trigger the flipped card's power if applicable
                    flipped_power = self._card(cidx)[3]
                    if flipped_power and t not in self.suppressed.get(player, set()):
                        self._activate_power(player, cidx, t, flipped_power)
                    break
                print("  Invalid choice.")

        elif power == "flip_opponent":
            # Flip one of opponent's face-up cards face-down
            up_cards = []
            for t in THEATERS:
                for i, (cidx, fu) in enumerate(self.theaters[t][opp]):
                    if fu and cidx != -1:
                        up_cards.append((t, i, cidx))
            if not up_cards:
                self._add_log(f"  {name} power: no opponent face-up cards to flip.")
                return
            print(f"  {name} power: Flip one of opponent's face-up cards face-down.")
            for j, (t, i, cidx) in enumerate(up_cards, 1):
                cname, _, s, _ = self._card(cidx)
                print(f"    {j}. {cname} (str {s}) in {t}")
            print(f"    [S] Skip")
            while True:
                choice = input_with_quit("  Card to flip: ").strip().lower()
                if choice in ("s", "skip"):
                    return
                if choice.isdigit() and 1 <= int(choice) <= len(up_cards):
                    t, i, cidx = up_cards[int(choice) - 1]
                    idx_in_list = self.theaters[t][opp].index((cidx, True))
                    self.theaters[t][opp][idx_in_list] = (cidx, False)
                    cname = self._card(cidx)[0]
                    self._add_log(f"  {name} power: flipped {cname} face-down in {t}.")
                    break
                print("  Invalid choice.")

        elif power == "suppress":
            # Disable opponent's powers in this theater
            self.suppressed[opp].add(theater)
            self._add_log(f"  {name} power: suppressed opponent's powers in {theater}.")

    # -------------------------------------------------------- check_game_over
    def check_game_over(self):
        # Check if round is over
        if self.round_over:
            self._finish_round()
            return

        # Round ends when both players have no cards
        if not self.hands[1] and not self.hands[2]:
            self.round_over = True
            self._finish_round()
            return

    def _finish_round(self):
        """Score the round and check for overall game end."""
        if self.withdrew:
            # Points already awarded during withdrawal
            pass
        else:
            # Count theaters won by each player
            wins = {1: 0, 2: 0}
            for t in THEATERS:
                w = self._theater_winner(t)
                if w:
                    wins[w] += 1

            if wins[1] >= 2:
                self.round_winner = 1
                self.scores[1] += 6
                self._add_log(f"{self.players[0]} wins the round! +6 points.")
            elif wins[2] >= 2:
                self.round_winner = 2
                self.scores[2] += 6
                self._add_log(f"{self.players[1]} wins the round! +6 points.")
            else:
                # Tie in theaters - whoever controls more strength total wins
                s1 = sum(self._theater_strength(t, 1) for t in THEATERS)
                s2 = sum(self._theater_strength(t, 2) for t in THEATERS)
                if s1 > s2:
                    self.round_winner = 1
                    self.scores[1] += 6
                    self._add_log(f"{self.players[0]} wins the round on total strength! +6 points.")
                elif s2 > s1:
                    self.round_winner = 2
                    self.scores[2] += 6
                    self._add_log(f"{self.players[1]} wins the round on total strength! +6 points.")
                else:
                    # True tie - no points
                    self._add_log("Round is a true tie! No points awarded.")

        # Show round summary
        clear_screen()
        self.display()
        print(f"  Round {self.round_number} over!")
        print(f"  Score: {self.players[0]} {self.scores[1]} - {self.scores[2]} {self.players[1]}")

        # Check for game win
        if self.scores[1] >= POINTS_TO_WIN:
            self.game_over = True
            self.winner = 1
            return
        if self.scores[2] >= POINTS_TO_WIN:
            self.game_over = True
            self.winner = 2
            return

        input_with_quit("  Press Enter to start next round...")
        self._start_new_round()

    def _effective_strength_for_token(self, card_idx, face_up):
        """Strength for a card or reinforcement token."""
        if card_idx == -1:  # reinforcement token
            return 3
        return self._effective_strength(card_idx, face_up)

    # -------------------------------------------------------- save / load
    def get_state(self):
        return {
            "scores": {str(k): v for k, v in self.scores.items()},
            "hands": {str(k): list(v) for k, v in self.hands.items()},
            "theaters": {
                t: {str(p): [(cidx, fu) for cidx, fu in cards]
                    for p, cards in players.items()}
                for t, players in self.theaters.items()
            },
            "theater_order": list(self.theater_order),
            "round_number": self.round_number,
            "round_over": self.round_over,
            "withdrew": self.withdrew,
            "log": list(self.log),
            "suppressed": {str(k): list(v) for k, v in self.suppressed.items()},
        }

    def load_state(self, state):
        self.scores = {int(k): v for k, v in state["scores"].items()}
        self.hands = {int(k): list(v) for k, v in state["hands"].items()}
        self.theaters = {
            t: {int(p): [(cidx, fu) for cidx, fu in cards]
                for p, cards in players.items()}
            for t, players in state["theaters"].items()
        }
        self.theater_order = list(state["theater_order"])
        self.round_number = state["round_number"]
        self.round_over = state.get("round_over", False)
        self.withdrew = state.get("withdrew")
        self.log = list(state.get("log", []))
        self.suppressed = {int(k): set(v) for k, v in state.get("suppressed", {}).items()}

    # ------------------------------------------------------------ tutorial
    def get_tutorial(self):
        power_text = ""
        if self.variation != "simple":
            power_text = (
                "\n  CARD POWERS (when played face-up in matching theater):\n"
                "  - Reinforce Adjacent: Add +3 strength to an adjacent theater\n"
                "  - Play to Any: This card can be played face-up in any theater\n"
                "  - Move Card: Move one of your deployed cards to another theater\n"
                "  - Flip Card: Flip one of your face-down cards face-up (activating its power)\n"
                "  - Flip Opponent: Flip one of opponent's face-up cards face-down (str becomes 2)\n"
                "  - Suppress: Disable opponent's card powers in this theater\n"
            )

        return (
            f"\n{'=' * 60}\n"
            f"  AIR, LAND & SEA - Tutorial ({self.variation.title()})\n"
            f"{'=' * 60}\n\n"
            f"  OVERVIEW:\n"
            f"  Two players battle to control 3 theaters of war: Air, Land, and Sea.\n"
            f"  18 cards total (6 per theater), each with strength 1-6.\n"
            f"  Each round, players are dealt 6 cards and take turns playing one.\n"
            f"  First to {POINTS_TO_WIN} points wins the game.\n\n"
            f"  PLAYING CARDS:\n"
            f"  - Face-up in matching theater: Use full strength and card power\n"
            f"  - Face-down in any theater: Strength is always 2, no power activates\n\n"
            f"  WINNING A ROUND:\n"
            f"  - Each theater is won by the player with higher total strength\n"
            f"  - Win 2 of 3 theaters to win the round (6 points)\n\n"
            f"  WITHDRAWAL:\n"
            f"  - You can withdraw at any time to concede the round\n"
            f"  - Withdrawing early limits opponent's points:\n"
            f"    6 cards left: 2 pts | 4-5 cards left: 2-3 pts\n"
            f"    2-3 cards left: 3-4 pts | 0-1 cards left: 4-6 pts\n"
            f"  - Strategic withdrawal is key to winning!\n"
            f"{power_text}\n"
            f"  COMMANDS:\n"
            f"  Enter card number to play, 'withdraw' to concede round.\n"
            f"  Type 'quit' to exit, 'save' to suspend, 'help' for help.\n"
            f"{'=' * 60}"
        )
