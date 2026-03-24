"""Sushi Go! - A card drafting game."""

import random

from engine.base import BaseGame, input_with_quit, clear_screen


# Card definitions: (name, short_code)
STANDARD_CARDS = {
    "Tempura": 14,
    "Sashimi": 14,
    "Dumpling": 14,
    "Maki1": 6,
    "Maki2": 12,
    "Maki3": 8,
    "SalmonNigiri": 10,
    "SquidNigiri": 5,
    "EggNigiri": 5,
    "Wasabi": 6,
    "Pudding": 10,
    "Chopsticks": 4,
}

PARTY_EXTRA_CARDS = {
    "Tofu": 8,
    "Eel": 8,
    "Edamame": 8,
}

# Short display codes
CARD_SHORT = {
    "Tempura": "TMP",
    "Sashimi": "SSH",
    "Dumpling": "DMP",
    "Maki1": "MK1",
    "Maki2": "MK2",
    "Maki3": "MK3",
    "SalmonNigiri": "SAL",
    "SquidNigiri": "SQD",
    "EggNigiri": "EGG",
    "Wasabi": "WAS",
    "Pudding": "PUD",
    "Chopsticks": "CHP",
    "Tofu": "TFU",
    "Eel": "EEL",
    "Edamame": "EDM",
}


def _build_deck(variation):
    """Build the full deck for the given variation."""
    deck = []
    for card, count in STANDARD_CARDS.items():
        deck.extend([card] * count)
    if variation == "party":
        for card, count in PARTY_EXTRA_CARDS.items():
            deck.extend([card] * count)
    random.shuffle(deck)
    return deck


def _score_maki(plates):
    """Return maki icon counts for two players (list of two ints)."""
    counts = []
    for plate in plates:
        total = 0
        for card in plate:
            if card == "Maki1":
                total += 1
            elif card == "Maki2":
                total += 2
            elif card == "Maki3":
                total += 3
        counts.append(total)
    return counts


def _score_plate(plate):
    """Score a single player's plate (excluding maki and pudding)."""
    score = 0

    # Tempura: pairs worth 5
    tempura = plate.count("Tempura")
    score += (tempura // 2) * 5

    # Sashimi: sets of 3 worth 10
    sashimi = plate.count("Sashimi")
    score += (sashimi // 3) * 10

    # Dumpling: 1=1, 2=3, 3=6, 4=10, 5+=15
    dumpling_scores = [0, 1, 3, 6, 10, 15]
    dumplings = plate.count("Dumpling")
    if dumplings >= 5:
        score += 15
    else:
        score += dumpling_scores[dumplings]

    # Nigiri (with wasabi)
    wasabi_pending = 0
    for card in plate:
        if card == "Wasabi":
            wasabi_pending += 1
        elif card in ("SalmonNigiri", "SquidNigiri", "EggNigiri"):
            base = {"SalmonNigiri": 2, "SquidNigiri": 3, "EggNigiri": 1}[card]
            if wasabi_pending > 0:
                score += base * 3
                wasabi_pending -= 1
            else:
                score += base

    # Party cards
    # Tofu: 1=2pts, 2=6pts, 3+=0pts
    tofu = plate.count("Tofu")
    if tofu == 1:
        score += 2
    elif tofu == 2:
        score += 6
    # 3+ = 0

    # Eel: 1=-3pts, 2+=7pts
    eel = plate.count("Eel")
    if eel == 1:
        score -= 3
    elif eel >= 2:
        score += 7

    # Edamame: 1pt per opponent who has edamame (in 2p, max 1)
    # Handled externally since it depends on opponent's plate

    return score


class SushiGoGame(BaseGame):
    """Sushi Go!: A fast-playing card drafting game."""

    name = "Sushi Go!"
    description = "Card drafting game with cute sushi artwork"
    min_players = 2
    max_players = 2
    variations = {
        "standard": "Standard Sushi Go!",
        "party": "Party (with Tofu, Eel, Edamame)",
    }

    def __init__(self, variation=None):
        super().__init__(variation)
        self.deck = []
        self.hands = [[], []]        # current hands for each player
        self.plates = [[], []]        # cards played this round
        self.scores = [0, 0]
        self.puddings = [0, 0]        # pudding counts persist across rounds
        self.round_number = 0
        self.total_rounds = 3
        self.cards_per_hand = 10
        self.phase = "pick"           # "pick" or "resolve"
        self.pending_picks = [None, None]  # cards chosen but not yet revealed
        self.chopsticks_active = [False, False]  # using chopsticks this turn
        self.dummy_hand = []          # 2-player variant: third hand face down

    def setup(self):
        """Initialize game for a new session."""
        self.deck = _build_deck(self.variation)
        self.hands = [[], []]
        self.plates = [[], []]
        self.scores = [0, 0]
        self.puddings = [0, 0]
        self.round_number = 0
        self.game_over = False
        self.winner = None
        self.current_player = 1
        self._start_new_round()

    def _start_new_round(self):
        """Deal cards for a new round."""
        self.round_number += 1
        self.plates = [[], []]

        # Rebuild and shuffle deck each round
        self.deck = _build_deck(self.variation)

        # Deal hands
        self.hands[0] = [self.deck.pop() for _ in range(self.cards_per_hand)]
        self.hands[1] = [self.deck.pop() for _ in range(self.cards_per_hand)]
        # Dummy hand for 2-player adaptation
        self.dummy_hand = [self.deck.pop() for _ in range(self.cards_per_hand)]

        self.hands[0].sort()
        self.hands[1].sort()
        self.pending_picks = [None, None]
        self.chopsticks_active = [False, False]

    def display(self):
        """Display the full game state."""
        var_label = "Standard" if self.variation != "party" else "Party"
        print(f"\n  === Sushi Go! ({var_label}) === Round {self.round_number}/{self.total_rounds}")
        print(f"  {self.players[0]} (P1): {self.scores[0]} pts (Pudding: {self.puddings[0]})")
        print(f"  {self.players[1]} (P2): {self.scores[1]} pts (Pudding: {self.puddings[1]})")
        cards_left = len(self.hands[0])
        print(f"  Cards remaining in hand: {cards_left}")

        # Show both plates
        for p in range(2):
            plate_str = self._format_plate(p)
            print(f"\n  {self.players[p]}'s plate: {plate_str}")

        # Show current player's hand
        p = self.current_player - 1
        print(f"\n  {self.players[p]}'s hand:")
        hand = self.hands[p]
        for i, card in enumerate(hand):
            short = CARD_SHORT.get(card, card[:3].upper())
            print(f"    {i + 1}. {card} [{short}]")

        # Show if chopsticks are available
        has_chopsticks = "Chopsticks" in self.plates[p]
        if has_chopsticks:
            print("  (You have Chopsticks on your plate -- you may play 2 cards!)")

    def _format_plate(self, p):
        """Format a player's plate for display."""
        if not self.plates[p]:
            return "(empty)"
        counts = {}
        for card in self.plates[p]:
            counts[card] = counts.get(card, 0) + 1
        parts = []
        for card, count in sorted(counts.items()):
            short = CARD_SHORT.get(card, card[:3].upper())
            if count > 1:
                parts.append(f"{short}x{count}")
            else:
                parts.append(short)
        return " ".join(parts)

    def get_move(self):
        """Get card pick from current player."""
        p = self.current_player - 1
        has_chopsticks = "Chopsticks" in self.plates[p]

        if has_chopsticks:
            print(f"\n  {self.players[p]}, pick a card (or two with chopsticks).")
            print("  Enter card number, or two numbers separated by space (e.g. '3 7').")
        else:
            print(f"\n  {self.players[p]}, pick a card.")
            print("  Enter the card number.")
        move_str = input_with_quit("  Your pick: ").strip()
        return move_str

    def make_move(self, move):
        """Apply a card pick. Returns True if valid."""
        p = self.current_player - 1
        hand = self.hands[p]

        try:
            parts = move.split()
            indices = [int(x) - 1 for x in parts]
        except (ValueError, IndexError):
            return False

        if len(indices) == 0 or len(indices) > 2:
            return False

        # Validate indices
        for idx in indices:
            if idx < 0 or idx >= len(hand):
                return False

        # If picking 2, must have chopsticks on plate
        if len(indices) == 2:
            if "Chopsticks" not in self.plates[p]:
                print("  You need Chopsticks on your plate to pick two cards!")
                return False
            if indices[0] == indices[1]:
                return False

        # Pick the cards (sort indices descending to remove safely)
        picked = []
        for idx in sorted(indices, reverse=True):
            picked.append(hand.pop(idx))

        # Add picked cards to plate
        for card in picked:
            self.plates[p].append(card)

        # If used chopsticks, return chopsticks to hand
        if len(indices) == 2:
            self.plates[p].remove("Chopsticks")
            hand.append("Chopsticks")
            hand.sort()

        # After both players have picked, pass hands
        # In this 2-player implementation, we alternate turns within a pick cycle.
        # Player 1 picks, then Player 2 picks, then hands are passed.
        if self.current_player == 1:
            # Don't switch yet -- Player 2 still needs to pick
            # (switch_player is called by the base play loop)
            return True
        else:
            # Both players have picked. Now pass hands.
            self._pass_hands()
            # Check if round is over (hands empty)
            if len(self.hands[0]) == 0:
                self._score_round()
                if self.round_number >= self.total_rounds:
                    self._score_end_game()
                else:
                    self._start_new_round()
            return True

    def _pass_hands(self):
        """Pass hands clockwise (swap for 2 players), incorporating dummy hand."""
        # Three-way rotation: P1 -> P2 -> Dummy -> P1
        old_p1 = self.hands[0]
        old_p2 = self.hands[1]
        old_dummy = self.dummy_hand

        if self.round_number % 2 == 1:
            # Odd rounds: pass left (P1->P2, P2->Dummy, Dummy->P1)
            self.hands[0] = old_dummy
            self.hands[1] = old_p1
            self.dummy_hand = old_p2
        else:
            # Even rounds: pass right (P1->Dummy, Dummy->P2, P2->P1)
            self.hands[0] = old_p2
            self.hands[1] = old_dummy
            self.dummy_hand = old_p1

        self.hands[0].sort()
        self.hands[1].sort()

    def _score_round(self):
        """Score the current round's plates."""
        for p in range(2):
            plate_score = _score_plate(self.plates[p])

            # Edamame cross-scoring (party mode)
            if self.variation == "party":
                my_edamame = self.plates[p].count("Edamame")
                opp = 1 - p
                opp_has_edamame = self.plates[opp].count("Edamame") > 0
                if my_edamame > 0 and opp_has_edamame:
                    plate_score += my_edamame  # 1pt per edamame if opponent also has some

            self.scores[p] += plate_score

            # Track puddings
            self.puddings[p] += self.plates[p].count("Pudding")

        # Maki scoring
        maki_counts = _score_maki(self.plates)
        if maki_counts[0] > maki_counts[1]:
            self.scores[0] += 6
            self.scores[1] += 3
        elif maki_counts[1] > maki_counts[0]:
            self.scores[1] += 6
            self.scores[0] += 3
        elif maki_counts[0] > 0:
            # Tie: split the 6 points
            self.scores[0] += 3
            self.scores[1] += 3

    def _score_end_game(self):
        """Score pudding at game end and determine winner."""
        if self.puddings[0] > self.puddings[1]:
            self.scores[0] += 6
        elif self.puddings[1] > self.puddings[0]:
            self.scores[1] += 6
        # Tie: no pudding points

        # Fewest puddings loses 6 (only in 3+ players normally, but we apply it)
        if self.puddings[0] < self.puddings[1]:
            self.scores[0] -= 6
        elif self.puddings[1] < self.puddings[0]:
            self.scores[1] -= 6

        self.game_over = True
        if self.scores[0] > self.scores[1]:
            self.winner = 1
        elif self.scores[1] > self.scores[0]:
            self.winner = 2
        else:
            # Tie-break: most puddings
            if self.puddings[0] > self.puddings[1]:
                self.winner = 1
            elif self.puddings[1] > self.puddings[0]:
                self.winner = 2
            else:
                self.winner = None  # true tie

    def check_game_over(self):
        """Game over is handled in _score_end_game. No-op here."""
        pass

    def get_state(self):
        """Return serializable game state."""
        return {
            "hands": [list(h) for h in self.hands],
            "plates": [list(p) for p in self.plates],
            "scores": list(self.scores),
            "puddings": list(self.puddings),
            "round_number": self.round_number,
            "total_rounds": self.total_rounds,
            "dummy_hand": list(self.dummy_hand),
            "deck": list(self.deck),
        }

    def load_state(self, state):
        """Restore game state."""
        self.hands = [list(h) for h in state["hands"]]
        self.plates = [list(p) for p in state["plates"]]
        self.scores = list(state["scores"])
        self.puddings = list(state["puddings"])
        self.round_number = state["round_number"]
        self.total_rounds = state["total_rounds"]
        self.dummy_hand = list(state["dummy_hand"])
        self.deck = list(state["deck"])

    def get_tutorial(self):
        """Return tutorial with rules and strategy hints."""
        return """
==================================================
  Sushi Go! - Tutorial
==================================================

  OVERVIEW:
  Sushi Go! is a fast-playing card drafting game.
  Pick cards from your hand and pass the rest to
  build the best combination of sushi dishes!

  CARD TYPES AND SCORING:

  NIGIRI (base points):
    Egg Nigiri     [EGG] = 1 point
    Salmon Nigiri  [SAL] = 2 points
    Squid Nigiri   [SQD] = 3 points

  WASABI [WAS]:
    Triples the value of the NEXT nigiri you play.
    (e.g. Wasabi + Squid Nigiri = 9 points)

  TEMPURA [TMP]:
    Collect pairs: 2 Tempura = 5 points
    (1 Tempura alone = 0 points)

  SASHIMI [SSH]:
    Collect sets of 3: 3 Sashimi = 10 points
    (1 or 2 alone = 0 points)

  DUMPLING [DMP]:
    Progressive scoring:
    1=1pt, 2=3pts, 3=6pts, 4=10pts, 5+=15pts

  MAKI ROLLS [MK1/MK2/MK3]:
    The number indicates maki roll icons (1, 2, or 3).
    At round end, most maki icons = 6 pts,
    second most = 3 pts. Ties split evenly.

  PUDDING [PUD]:
    Kept across all 3 rounds!
    At game end: most pudding = +6 pts
    Fewest pudding = -6 pts

  CHOPSTICKS [CHP]:
    Goes on your plate. On a future turn, you may
    play TWO cards instead of one. The Chopsticks
    then return to your hand to be passed.

  PARTY VARIATION (extra cards):
    Tofu  [TFU]: 1=2pts, 2=6pts, 3+=0pts (too much!)
    Eel   [EEL]: 1=-3pts, 2+=7pts
    Edamame [EDM]: 1pt each if opponent also has some

  HOW TO PLAY:
  1. Each round, you are dealt 10 cards.
  2. Pick one card (enter its number).
  3. With Chopsticks, you may pick two (e.g. '3 7').
  4. Hands are passed after both players pick.
  5. Repeat until hands are empty.
  6. Score the round, then start the next.
  7. After 3 rounds, pudding is scored and the
     player with the most points wins!

  2-PLAYER ADAPTATION:
  A dummy third hand rotates with the deal, so
  you won't see the same cards coming back.

  STRATEGY HINTS:
  - Sashimi is risky: you need exactly 3.
  - Dumplings get very valuable in quantity.
  - Watch what your opponent is collecting.
  - Wasabi + Squid Nigiri is the dream combo (9pts).
  - Don't ignore pudding -- -6 pts hurts!
  - Chopsticks let you grab two key cards at once.

==================================================
"""
