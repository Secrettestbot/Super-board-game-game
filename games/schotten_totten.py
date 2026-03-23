"""Schotten Totten - A 2-player card battle across boundary stones."""

import random
from engine.base import BaseGame, input_with_quit, clear_screen

COLORS = ['Red', 'Blue', 'Green', 'Yellow', 'Purple', 'Orange']
COLOR_CODES = {
    'Red': '\033[91m',
    'Blue': '\033[94m',
    'Green': '\033[92m',
    'Yellow': '\033[93m',
    'Purple': '\033[95m',
    'Orange': '\033[33m',
}
RESET = '\033[0m'
COLOR_SHORT = {'Red': 'R', 'Blue': 'B', 'Green': 'G', 'Yellow': 'Y', 'Purple': 'P', 'Orange': 'O'}
SHORT_TO_COLOR = {v: k for k, v in COLOR_SHORT.items()}


def card_str(card):
    """Format a card with color."""
    color, value = card
    code = COLOR_CODES.get(color, '')
    short = COLOR_SHORT.get(color, '?')
    return f"{code}{short}{value}{RESET}"


def card_str_plain(card):
    color, value = card
    short = COLOR_SHORT.get(color, '?')
    return f"{short}{value}"


def formation_rank(cards):
    """Rank a 3-card formation. Returns (rank, tiebreaker) where higher is better.
    Ranks: 4=straight flush, 3=three of a kind, 2=flush, 1=straight, 0=sum.
    Tiebreaker is the sum of values."""
    if len(cards) < 3:
        return (-1, 0)
    colors = [c[0] for c in cards]
    values = sorted([c[1] for c in cards])
    total = sum(values)
    is_flush = len(set(colors)) == 1
    is_straight = (values[2] - values[0] == 2) and len(set(values)) == 3
    is_three = len(set(values)) == 1

    if is_flush and is_straight:
        return (4, total)
    if is_three:
        return (3, total)
    if is_flush:
        return (2, total)
    if is_straight:
        return (1, total)
    return (0, total)


def formation_name(rank_val):
    names = {4: "Straight Flush", 3: "Three of a Kind", 2: "Flush", 1: "Straight", 0: "Sum"}
    return names.get(rank_val, "Incomplete")


class SchottenTottenGame(BaseGame):
    """Schotten Totten card game implementation."""

    name = "Schotten Totten"
    description = "Card battle across boundary stones - claim 5 or 3 adjacent to win"
    min_players = 2
    max_players = 2
    variations = {
        "standard": "Standard game with 9 boundary stones",
        "quick": "Quick game with 7 boundary stones",
    }

    def __init__(self, variation=None):
        super().__init__(variation)
        self.num_stones = 9 if self.variation != "quick" else 7
        self.deck = []
        self.hands = {1: [], 2: []}
        # Each stone: {1: [cards], 2: [cards], 'claimed': 0 (unclaimed), 1 or 2}
        self.stones = []
        self.log = []

    def setup(self):
        self.deck = []
        for color in COLORS:
            for val in range(1, 10):
                self.deck.append([color, val])
        random.shuffle(self.deck)
        self.hands = {1: [], 2: []}
        for _ in range(6):
            self.hands[1].append(self.deck.pop())
            self.hands[2].append(self.deck.pop())
        self.stones = []
        for _ in range(self.num_stones):
            self.stones.append({"1": [], "2": [], "claimed": 0})
        self.log = []

    def _sort_hand(self, player):
        self.hands[player].sort(key=lambda c: (COLORS.index(c[0]), c[1]))

    def display(self):
        clear_screen()
        p = self.current_player
        opp = 2 if p == 1 else 1
        print(f"{'=' * 60}")
        print(f"  SCHOTTEN TOTTEN - {self.players[0]} vs {self.players[1]}")
        print(f"  Deck: {len(self.deck)} cards | Turn: {self.players[p - 1]}")
        print(f"{'=' * 60}")

        # Show stones
        header = "  Stone: "
        for i in range(self.num_stones):
            header += f" {i + 1:^9}"
        print(header)

        # Opponent side (top)
        print(f"  {self.players[opp - 1]:>6}:", end="")
        for i in range(self.num_stones):
            s = self.stones[i]
            cards = s[str(opp)]
            if cards:
                cstr = ",".join(card_str_plain([c[0], c[1]]) for c in cards)
            else:
                cstr = "---"
            print(f" {cstr:^9}", end="")
        print()

        # Claimed status
        print(f"  Status:", end="")
        for i in range(self.num_stones):
            s = self.stones[i]
            if s["claimed"] == 1:
                marker = f"[P1]"
            elif s["claimed"] == 2:
                marker = f"[P2]"
            else:
                marker = f"[ ]"
            print(f" {marker:^9}", end="")
        print()

        # Current player side (bottom)
        print(f"  {self.players[p - 1]:>6}:", end="")
        for i in range(self.num_stones):
            s = self.stones[i]
            cards = s[str(p)]
            if cards:
                cstr = ",".join(card_str_plain([c[0], c[1]]) for c in cards)
            else:
                cstr = "---"
            print(f" {cstr:^9}", end="")
        print()

        # Formation info
        print()
        print("  Formations (yours):", end="")
        for i in range(self.num_stones):
            cards_list = self.stones[i][str(p)]
            if len(cards_list) == 3:
                rank, _ = formation_rank(cards_list)
                fname = formation_name(rank)
                short = fname[:5]
            else:
                short = f"{len(cards_list)}/3"
            print(f" {short:^9}", end="")
        print()

        # Hand
        self._sort_hand(p)
        print(f"\n  Your hand: ", end="")
        for idx, c in enumerate(self.hands[p]):
            print(f"  [{idx + 1}]{card_str(c)}", end="")
        print()
        print()

        if self.log:
            print(f"  Last: {self.log[-1]}")
        print()

    def get_move(self):
        p = self.current_player
        hand = self.hands[p]
        if not hand:
            return "pass"

        while True:
            raw = input_with_quit(f"  {self.players[p - 1]}, choose card [1-{len(hand)}] and stone [1-{self.num_stones}] (e.g. '1 3'): ")
            parts = raw.strip().split()
            if len(parts) != 2:
                print("  Enter card# and stone# separated by space.")
                continue
            try:
                ci = int(parts[0]) - 1
                si = int(parts[1]) - 1
            except ValueError:
                print("  Enter numbers only.")
                continue
            if ci < 0 or ci >= len(hand):
                print(f"  Card must be 1-{len(hand)}.")
                continue
            if si < 0 or si >= self.num_stones:
                print(f"  Stone must be 1-{self.num_stones}.")
                continue
            stone = self.stones[si]
            if stone["claimed"] != 0:
                print(f"  Stone {si + 1} is already claimed.")
                continue
            if len(stone[str(p)]) >= 3:
                print(f"  You already have 3 cards at stone {si + 1}.")
                continue
            return {"card_idx": ci, "stone_idx": si}

    def make_move(self, move):
        if move == "pass":
            return True
        p = self.current_player
        ci = move["card_idx"]
        si = move["stone_idx"]
        hand = self.hands[p]

        if ci < 0 or ci >= len(hand):
            return False
        stone = self.stones[si]
        if stone["claimed"] != 0 or len(stone[str(p)]) >= 3:
            return False

        card = hand.pop(ci)
        stone[str(p)].append(card)
        self.log.append(f"{self.players[p - 1]} played {card_str_plain(card)} at stone {si + 1}")

        # Try to claim stones
        self._try_claim_stones()

        # Draw a card if deck has cards
        if self.deck:
            self.hands[p].append(self.deck.pop())
        return True

    def _try_claim_stones(self):
        """Check all stones and claim those where winner can be determined."""
        for i, stone in enumerate(self.stones):
            if stone["claimed"] != 0:
                continue
            c1 = stone["1"]
            c2 = stone["2"]
            # Both sides must have 3 cards to claim
            if len(c1) == 3 and len(c2) == 3:
                r1 = formation_rank(c1)
                r2 = formation_rank(c2)
                if r1 > r2:
                    stone["claimed"] = 1
                elif r2 > r1:
                    stone["claimed"] = 2
                else:
                    # Tie goes to the player who completed their side first (player 1 advantage)
                    stone["claimed"] = 1

    def check_game_over(self):
        claims = {1: 0, 2: 0}
        for s in self.stones:
            if s["claimed"] in (1, 2):
                claims[s["claimed"]] += 1

        # Win by 5 stones
        for player in (1, 2):
            if claims[player] >= 5:
                self.game_over = True
                self.winner = player
                return

        # Win by 3 adjacent
        for player in (1, 2):
            consecutive = 0
            for s in self.stones:
                if s["claimed"] == player:
                    consecutive += 1
                    if consecutive >= 3:
                        self.game_over = True
                        self.winner = player
                        return
                else:
                    consecutive = 0

        # Check if all stones are claimed
        all_claimed = all(s["claimed"] != 0 for s in self.stones)
        if all_claimed:
            self.game_over = True
            if claims[1] > claims[2]:
                self.winner = 1
            elif claims[2] > claims[1]:
                self.winner = 2
            else:
                self.winner = None
            return

        # Check if both players have empty hands and deck is empty
        if not self.hands[1] and not self.hands[2] and not self.deck:
            # Check remaining unclaimed stones - if all filled, resolve
            all_filled = True
            for s in self.stones:
                if s["claimed"] == 0:
                    if len(s["1"]) < 3 or len(s["2"]) < 3:
                        all_filled = False
                        break
            if all_filled:
                self._try_claim_stones()
            self.game_over = True
            c1 = sum(1 for s in self.stones if s["claimed"] == 1)
            c2 = sum(1 for s in self.stones if s["claimed"] == 2)
            if c1 > c2:
                self.winner = 1
            elif c2 > c1:
                self.winner = 2
            else:
                self.winner = None

    def get_state(self):
        return {
            "num_stones": self.num_stones,
            "deck": self.deck,
            "hands": {"1": self.hands[1], "2": self.hands[2]},
            "stones": self.stones,
            "log": self.log[-10:],
        }

    def load_state(self, state):
        self.num_stones = state["num_stones"]
        self.deck = state["deck"]
        self.hands = {1: state["hands"]["1"], 2: state["hands"]["2"]}
        self.stones = state["stones"]
        self.log = state.get("log", [])

    def get_tutorial(self):
        return f"""
{'=' * 60}
  SCHOTTEN TOTTEN - Tutorial
{'=' * 60}

  OBJECTIVE:
  Claim 5 of {self.num_stones} boundary stones, or 3 adjacent stones.

  THE DECK:
  54 cards: 6 colors (R/B/G/Y/P/O) x values 1-9.

  EACH TURN:
  1. Play one card from your hand to any unclaimed stone
     (max 3 cards per side at each stone).
  2. Draw a card from the deck.

  CLAIMING STONES:
  When both sides have 3 cards at a stone, compare formations:
    Straight Flush (same color, consecutive) - BEST
    Three of a Kind (same value)
    Flush (same color)
    Straight (consecutive values)
    Sum (total of values) - WORST
  Higher formation wins. Ties broken by higher sum.

  WINNING:
  First to claim 5 stones OR 3 adjacent stones wins!

  INPUT FORMAT: card# stone# (e.g., '1 3' plays card 1 to stone 3)
{'=' * 60}
"""
