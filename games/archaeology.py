"""Archaeology - A set collection treasure card game."""

import random

from engine.base import BaseGame, input_with_quit, clear_screen


# Treasure types and their counts in the full deck
TREASURES_STANDARD = {
    "Talisman": 3,
    "Scroll": 4,
    "Pottery": 5,
    "Coin": 7,
    "Mask": 3,
    "Pharaoh": 2,
}

TREASURES_QUICK = {
    "Talisman": 4,
    "Scroll": 5,
    "Coin": 7,
    "Mask": 4,
}

# Set scoring: number of matching treasures -> points
SET_SCORES = {1: 1, 2: 3, 3: 7, 4: 13, 5: 22}

SANDSTORM_COUNT_STANDARD = 6
SANDSTORM_COUNT_QUICK = 4
THIEF_COUNT = 4

TREASURE_ICONS = {
    "Talisman": "[TAL]",
    "Scroll": "[SCR]",
    "Pottery": "[POT]",
    "Coin": "[COI]",
    "Mask": "[MSK]",
    "Pharaoh": "[PHA]",
}


def _build_deck(variation):
    """Build the card deck for the given variation."""
    deck = []
    treasures = TREASURES_STANDARD if variation == "standard" else TREASURES_QUICK
    for treasure, count in treasures.items():
        deck.extend([treasure] * count)
    sandstorm_count = SANDSTORM_COUNT_STANDARD if variation == "standard" else SANDSTORM_COUNT_QUICK
    deck.extend(["Sandstorm"] * sandstorm_count)
    deck.extend(["Thief"] * THIEF_COUNT)
    random.shuffle(deck)
    return deck


def _score_hand(hand):
    """Score a list of treasure cards."""
    counts = {}
    for card in hand:
        if card in TREASURE_ICONS:
            counts[card] = counts.get(card, 0) + 1
    total = 0
    for treasure, count in counts.items():
        # Score each group
        while count > 0:
            group = min(count, 5)
            total += SET_SCORES.get(group, 0)
            count -= group
    return total


def _count_treasures(hand):
    """Count treasure cards in hand (exclude Sandstorm/Thief)."""
    return sum(1 for c in hand if c in TREASURE_ICONS)


class ArchaeologyGame(BaseGame):
    """Archaeology - collect sets of treasure cards for points."""

    name = "Archaeology"
    description = "Dig for treasure, collect sets, and avoid sandstorms"
    min_players = 2
    max_players = 2
    variations = {
        "standard": "Full deck with 6 treasure types (24 treasures + events)",
        "quick": "Smaller deck with 4 treasure types for faster play",
    }

    def __init__(self, variation=None):
        super().__init__(variation)
        self.deck = []
        self.hands = {1: [], 2: []}
        self.scored = {1: [], 2: []}  # banked/scored treasures
        self.marketplace = []  # face-up cards available to trade
        self.discard = []
        self.log = []

    def setup(self):
        """Initialize the game."""
        self.deck = _build_deck(self.variation)
        # Deal 4 cards to each player
        for p in [1, 2]:
            for _ in range(4):
                if self.deck:
                    self.hands[p].append(self.deck.pop())
        # Put 3 cards in marketplace
        for _ in range(3):
            if self.deck:
                card = self.deck.pop()
                if card in TREASURE_ICONS:
                    self.marketplace.append(card)
                else:
                    self.discard.append(card)
        self.log.append("Game begins! Each player has 4 cards.")

    def _resolve_sandstorm(self, player):
        """Force player to discard half their hand (rounded down)."""
        hand = self.hands[player]
        treasure_cards = [c for c in hand if c in TREASURE_ICONS]
        to_discard = len(treasure_cards) // 2
        if to_discard == 0:
            self.log.append(f"  {self.players[player-1]} has few cards - no discard needed.")
            return
        self.log.append(f"  {self.players[player-1]} must discard {to_discard} card(s)!")
        # For current player, let them choose; for opponent, discard randomly
        discarded = []
        if player == self.current_player:
            # Player chooses which to discard
            while len(discarded) < to_discard:
                remaining = [c for c in self.hands[player] if c in TREASURE_ICONS]
                if not remaining:
                    break
                print(f"\n  Sandstorm! Discard {to_discard - len(discarded)} more card(s).")
                print(f"  Your hand: ", end="")
                for i, c in enumerate(remaining):
                    print(f"  {i+1}. {TREASURE_ICONS.get(c, c)}", end="")
                print()
                choice = input_with_quit(f"  Choose card to discard (1-{len(remaining)}): ")
                try:
                    idx = int(choice) - 1
                    if 0 <= idx < len(remaining):
                        card = remaining[idx]
                        self.hands[player].remove(card)
                        self.marketplace.append(card)
                        discarded.append(card)
                    else:
                        print("  Invalid choice.")
                except ValueError:
                    print("  Enter a number.")
        else:
            # Opponent discards randomly
            treasure_in_hand = [c for c in self.hands[player] if c in TREASURE_ICONS]
            random.shuffle(treasure_in_hand)
            for i in range(min(to_discard, len(treasure_in_hand))):
                card = treasure_in_hand[i]
                self.hands[player].remove(card)
                self.marketplace.append(card)
                discarded.append(card)
        if discarded:
            self.log.append(f"  {self.players[player-1]} discarded {len(discarded)} card(s) to marketplace.")

    def _resolve_thief(self, player):
        """Let player steal a card from opponent."""
        opponent = 2 if player == 1 else 1
        opp_treasures = [c for c in self.hands[opponent] if c in TREASURE_ICONS]
        if not opp_treasures:
            self.log.append(f"  {self.players[opponent-1]} has no treasures to steal!")
            return
        # Steal a random card (thief doesn't get to see opponent's hand)
        stolen = random.choice(opp_treasures)
        self.hands[opponent].remove(stolen)
        self.hands[player].append(stolen)
        self.log.append(f"  {self.players[player-1]} stole a card from {self.players[opponent-1]}!")

    def display(self):
        """Display the current game state."""
        clear_screen()
        p = self.current_player
        opp = 2 if p == 1 else 1

        print("=" * 58)
        print(f"  ARCHAEOLOGY - {self.variation.upper()} VARIATION")
        print("=" * 58)
        print(f"  Deck: {len(self.deck)} cards remaining")
        print(f"  Marketplace: ", end="")
        if self.marketplace:
            for c in self.marketplace:
                print(f"{TREASURE_ICONS.get(c, c)} ", end="")
            print()
        else:
            print("(empty)")
        print("-" * 58)

        # Opponent info
        opp_hand_count = len(self.hands[opp])
        opp_score = _score_hand(self.scored[opp])
        print(f"  {self.players[opp-1]}: {opp_hand_count} cards in hand | "
              f"Banked score: {opp_score} pts")
        if self.scored[opp]:
            print(f"    Banked: ", end="")
            banked_counts = {}
            for c in self.scored[opp]:
                banked_counts[c] = banked_counts.get(c, 0) + 1
            for t, cnt in banked_counts.items():
                print(f"{TREASURE_ICONS.get(t, t)}x{cnt} ", end="")
            print()

        print("-" * 58)

        # Current player info
        my_score = _score_hand(self.scored[p])
        print(f"  >> {self.players[p-1]}'s turn | Banked score: {my_score} pts")
        if self.scored[p]:
            print(f"    Banked: ", end="")
            banked_counts = {}
            for c in self.scored[p]:
                banked_counts[c] = banked_counts.get(c, 0) + 1
            for t, cnt in banked_counts.items():
                print(f"{TREASURE_ICONS.get(t, t)}x{cnt} ", end="")
            print()

        print(f"    Hand: ", end="")
        if self.hands[p]:
            for i, c in enumerate(self.hands[p]):
                print(f"{i+1}.{TREASURE_ICONS.get(c, c)} ", end="")
            print()
        else:
            print("(empty)")

        print("-" * 58)
        # Log
        if self.log:
            for line in self.log[-4:]:
                print(f"  {line}")
        print("=" * 58)

    def get_move(self):
        """Get a move from the current player."""
        print("\n  Actions:")
        print("    [D]ig   - Draw a card from the deck")
        print("    [T]rade - Trade cards with marketplace")
        print("    [B]ank  - Bank treasures from hand (score them)")
        if not self.deck and not self.marketplace:
            print("    [P]ass  - Pass (nothing to do)")
        choice = input_with_quit("\n  Choose action (D/T/B/P): ").strip().upper()
        if choice in ("D", "DIG"):
            return "dig"
        elif choice in ("T", "TRADE"):
            return self._get_trade_move()
        elif choice in ("B", "BANK"):
            return self._get_bank_move()
        elif choice in ("P", "PASS"):
            return "pass"
        return choice

    def _get_trade_move(self):
        """Get trade details from the player."""
        p = self.current_player
        if not self.marketplace:
            print("  Marketplace is empty!")
            input_with_quit("  Press Enter to continue...")
            return None
        hand_treasures = [(i, c) for i, c in enumerate(self.hands[p]) if c in TREASURE_ICONS]
        if not hand_treasures:
            print("  You have no treasure cards to trade!")
            input_with_quit("  Press Enter to continue...")
            return None

        print("\n  Marketplace cards:")
        for i, c in enumerate(self.marketplace):
            print(f"    {i+1}. {TREASURE_ICONS.get(c, c)} {c}")
        mkt_choice = input_with_quit("  Choose marketplace card (number): ").strip()
        try:
            mkt_idx = int(mkt_choice) - 1
            if not (0 <= mkt_idx < len(self.marketplace)):
                print("  Invalid choice.")
                return None
        except ValueError:
            print("  Enter a number.")
            return None

        print("  Your treasure cards:")
        for i, c in enumerate(self.hands[p]):
            if c in TREASURE_ICONS:
                print(f"    {i+1}. {TREASURE_ICONS.get(c, c)} {c}")
        hand_choice = input_with_quit("  Choose your card to trade (number): ").strip()
        try:
            hand_idx = int(hand_choice) - 1
            if not (0 <= hand_idx < len(self.hands[p])):
                print("  Invalid choice.")
                return None
            if self.hands[p][hand_idx] not in TREASURE_ICONS:
                print("  Can only trade treasure cards.")
                return None
        except ValueError:
            print("  Enter a number.")
            return None

        return ("trade", hand_idx, mkt_idx)

    def _get_bank_move(self):
        """Get bank details from the player."""
        p = self.current_player
        hand_treasures = [(i, c) for i, c in enumerate(self.hands[p]) if c in TREASURE_ICONS]
        if not hand_treasures:
            print("  You have no treasure cards to bank!")
            input_with_quit("  Press Enter to continue...")
            return None

        print("\n  Choose cards to bank (comma-separated numbers, or 'all'):")
        for i, c in enumerate(self.hands[p]):
            if c in TREASURE_ICONS:
                print(f"    {i+1}. {TREASURE_ICONS.get(c, c)} {c}")
        choice = input_with_quit("  Cards to bank: ").strip().lower()
        if choice == "all":
            indices = [i for i, c in enumerate(self.hands[p]) if c in TREASURE_ICONS]
        else:
            try:
                indices = [int(x.strip()) - 1 for x in choice.split(",")]
                for idx in indices:
                    if not (0 <= idx < len(self.hands[p])):
                        print("  Invalid card number.")
                        return None
                    if self.hands[p][idx] not in TREASURE_ICONS:
                        print(f"  Card {idx+1} is not a treasure.")
                        return None
            except ValueError:
                print("  Enter comma-separated numbers.")
                return None
        return ("bank", indices)

    def make_move(self, move):
        """Apply a move to the game state."""
        if move is None:
            return False

        p = self.current_player
        self.log = []

        if move == "dig":
            if not self.deck:
                self.log.append("Deck is empty! Cannot dig.")
                return False
            card = self.deck.pop()
            self.log.append(f"{self.players[p-1]} digs and finds: {card}")
            if card == "Sandstorm":
                self.log.append("SANDSTORM! Everyone discards half their hand!")
                # Resolve for both players
                self.hands[p].append(card)
                self.hands[p].remove(card)  # Sandstorm is discarded
                self.discard.append(card)
                self._resolve_sandstorm(p)
                opp = 2 if p == 1 else 1
                self._resolve_sandstorm(opp)
            elif card == "Thief":
                self.log.append(f"{self.players[p-1]} plays a Thief!")
                self.discard.append(card)
                self._resolve_thief(p)
            else:
                self.hands[p].append(card)
            return True

        elif move == "pass":
            self.log.append(f"{self.players[p-1]} passes.")
            return True

        elif isinstance(move, tuple) and move[0] == "trade":
            _, hand_idx, mkt_idx = move
            if hand_idx >= len(self.hands[p]) or mkt_idx >= len(self.marketplace):
                return False
            hand_card = self.hands[p][hand_idx]
            mkt_card = self.marketplace[mkt_idx]
            self.hands[p][hand_idx] = mkt_card
            self.marketplace[mkt_idx] = hand_card
            self.log.append(f"{self.players[p-1]} trades {hand_card} for {mkt_card}")
            return True

        elif isinstance(move, tuple) and move[0] == "bank":
            _, indices = move
            indices = sorted(indices, reverse=True)
            banked = []
            for idx in indices:
                if 0 <= idx < len(self.hands[p]):
                    card = self.hands[p].pop(idx)
                    self.scored[p].append(card)
                    banked.append(card)
            if banked:
                self.log.append(f"{self.players[p-1]} banks {len(banked)} card(s)")
                return True
            return False

        return False

    def check_game_over(self):
        """Check if the game is over."""
        # Game ends when deck is empty and both players have no hand cards
        if not self.deck:
            if not self.hands[1] and not self.hands[2]:
                self.game_over = True
            # Also end if neither player has treasure cards in hand
            elif (_count_treasures(self.hands[1]) == 0 and
                  _count_treasures(self.hands[2]) == 0):
                self.game_over = True

        if self.game_over:
            # Bank remaining treasure cards
            for p in [1, 2]:
                for card in list(self.hands[p]):
                    if card in TREASURE_ICONS:
                        self.scored[p].append(card)
                self.hands[p] = []

            score1 = _score_hand(self.scored[1])
            score2 = _score_hand(self.scored[2])
            if score1 > score2:
                self.winner = 1
            elif score2 > score1:
                self.winner = 2
            else:
                self.winner = None  # tie

    def get_state(self):
        """Return serializable game state."""
        return {
            "deck": self.deck,
            "hands": {"1": self.hands[1], "2": self.hands[2]},
            "scored": {"1": self.scored[1], "2": self.scored[2]},
            "marketplace": self.marketplace,
            "discard": self.discard,
            "log": self.log,
        }

    def load_state(self, state):
        """Restore game state from saved data."""
        self.deck = state["deck"]
        self.hands = {1: state["hands"]["1"], 2: state["hands"]["2"]}
        self.scored = {1: state["scored"]["1"], 2: state["scored"]["2"]}
        self.marketplace = state["marketplace"]
        self.discard = state["discard"]
        self.log = state.get("log", [])

    def get_tutorial(self):
        """Return tutorial text."""
        return """
============================================================
  ARCHAEOLOGY - Tutorial
============================================================

  OVERVIEW:
  You are archaeologists digging for ancient treasures!
  Collect sets of matching treasures to score big points.

  TREASURE TYPES:
  [TAL] Talisman  [SCR] Scroll  [POT] Pottery
  [COI] Coin      [MSK] Mask    [PHA] Pharaoh

  SET SCORING (matching treasures):
    1 card  =  1 point
    2 cards =  3 points
    3 cards =  7 points
    4 cards = 13 points
    5 cards = 22 points
  Larger sets score exponentially more!

  ACTIONS PER TURN:
  [D]ig   - Draw a card from the deck
            Treasure cards go to your hand.
            Sandstorm: forces everyone to discard half their hand!
            Thief: steal a random card from your opponent!
  [T]rade - Swap a hand card with a marketplace card
  [B]ank  - Score treasure cards from your hand (safe from storms)

  STRATEGY TIPS:
  - Bank valuable sets before a sandstorm ruins them
  - Build large sets of the same treasure for big points
  - Trade at the marketplace to complete your sets
  - Rare treasures (Pharaoh, Talisman) are harder to collect
    but sets of common ones (Coin) are easier to build

  The game ends when the deck runs out and hands are empty.
  Highest score wins!
============================================================
"""
