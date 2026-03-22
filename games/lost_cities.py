"""Lost Cities - A 2-player card game of expeditions and risk."""

import random
from engine.base import BaseGame, input_with_quit, clear_screen


STANDARD_COLORS = {
    'R': ('Red', '\033[91m'),
    'G': ('Green', '\033[92m'),
    'B': ('Blue', '\033[94m'),
    'W': ('White', '\033[97m'),
    'Y': ('Yellow', '\033[93m'),
}

EXTENDED_COLORS = {
    **STANDARD_COLORS,
    'P': ('Purple', '\033[95m'),
}

RESET = '\033[0m'

INVESTMENT_SYMBOL = 'x'


def make_deck(colors):
    """Create the full deck for the given color set."""
    deck = []
    for color in colors:
        for _ in range(3):
            deck.append((color, INVESTMENT_SYMBOL))
        for value in range(2, 11):
            deck.append((color, value))
    random.shuffle(deck)
    return deck


def card_str(card, colors):
    """Format a card for display with color."""
    color_code = colors[card[0]][1]
    val = 'X' if card[1] == INVESTMENT_SYMBOL else str(card[1])
    return f"{color_code}{card[0]}{val}{RESET}"


def card_str_plain(card):
    """Format a card without ANSI colors (for input echo)."""
    val = 'X' if card[1] == INVESTMENT_SYMBOL else str(card[1])
    return f"{card[0]}{val}"


def card_sort_key(card):
    """Sort key: by color then value (investments first)."""
    color_order = 'RGBWYP'
    c_idx = color_order.index(card[0]) if card[0] in color_order else 99
    v = 0 if card[1] == INVESTMENT_SYMBOL else card[1]
    return (c_idx, v)


def score_expedition(cards):
    """Score a single expedition column.

    Returns (raw_sum, multiplier, bonus, total).
    If no cards played, returns all zeros.
    """
    if not cards:
        return (0, 0, 0, 0)
    investments = sum(1 for c in cards if c[1] == INVESTMENT_SYMBOL)
    numbered_sum = sum(c[1] for c in cards if c[1] != INVESTMENT_SYMBOL)
    raw = numbered_sum - 20
    multiplier = 1 + investments
    subtotal = raw * multiplier
    bonus = 20 if len(cards) >= 8 else 0
    total = subtotal + bonus
    return (raw, multiplier, bonus, total)


class LostCitiesGame(BaseGame):
    """Lost Cities card game implementation."""

    name = "Lost Cities"
    description = "A 2-player card game of expeditions and risk"
    min_players = 2
    max_players = 2
    variations = {
        "standard": "Standard Lost Cities",
        "extended": "Extended (6 expeditions)",
    }

    def __init__(self, variation=None):
        super().__init__(variation)
        self.colors = {}
        self.deck = []
        self.hands = {1: [], 2: []}
        self.expeditions = {1: {}, 2: {}}
        self.discard_piles = {}
        self.round_number = 1
        self.total_rounds = 3
        self.round_scores = {1: [], 2: []}
        self.phase = 'play'  # 'play' or 'draw'
        self.pending_action = None  # stores the play/discard action for the turn

    def setup(self):
        """Initialize the game state."""
        if self.variation == 'extended':
            self.colors = dict(EXTENDED_COLORS)
        else:
            self.colors = dict(STANDARD_COLORS)
        self._setup_round()

    def _setup_round(self):
        """Set up a new round."""
        self.deck = make_deck(self.colors)
        self.hands = {1: [], 2: []}
        self.expeditions = {1: {c: [] for c in self.colors}, 2: {c: [] for c in self.colors}}
        self.discard_piles = {c: [] for c in self.colors}
        self.phase = 'play'
        self.pending_action = None
        # Deal 8 cards to each player
        for _ in range(8):
            self.hands[1].append(self.deck.pop())
            self.hands[2].append(self.deck.pop())
        self.hands[1].sort(key=card_sort_key)
        self.hands[2].sort(key=card_sort_key)

    def display(self):
        """Display the current game state."""
        color_keys = list(self.colors.keys())
        opponent = 2 if self.current_player == 1 else 1
        player = self.current_player

        print(f"\n{'=' * 60}")
        print(f"  LOST CITIES - Round {self.round_number}/{self.total_rounds}"
              f"   |   Deck: {len(self.deck)} cards")
        print(f"{'=' * 60}")

        # Cumulative scores
        for p in [1, 2]:
            cum = sum(self.round_scores[p])
            if cum:
                print(f"  {self.players[p-1]} cumulative: {cum}")

        # Opponent expeditions
        print(f"\n  {self.players[opponent-1]}'s Expeditions:")
        self._display_expeditions(opponent, color_keys)

        # Discard piles
        print(f"\n  Discard Piles:")
        parts = []
        for c in color_keys:
            color_code = self.colors[c][1]
            if self.discard_piles[c]:
                top = self.discard_piles[c][-1]
                parts.append(f"  {color_code}{self.colors[c][0]}{RESET}: [{card_str(top, self.colors)}]")
            else:
                parts.append(f"  {color_code}{self.colors[c][0]}{RESET}: [empty]")
        print("  " + "  ".join(parts))

        # Current player expeditions
        print(f"\n  {self.players[player-1]}'s Expeditions (YOU):")
        self._display_expeditions(player, color_keys)

        # Show scores for each started expedition
        print(f"\n  Your Expedition Scores:")
        score_parts = []
        for c in color_keys:
            cards = self.expeditions[player][c]
            if cards:
                _, _, _, total = score_expedition(cards)
                color_code = self.colors[c][1]
                score_parts.append(f"{color_code}{c}:{total}{RESET}")
        if score_parts:
            print("  " + "  ".join(score_parts))
            total_score = sum(score_expedition(self.expeditions[player][c])[3] for c in color_keys)
            print(f"  Round total so far: {total_score}")
        else:
            print("  (no expeditions started)")

        # Hand
        print(f"\n  Your Hand:")
        hand = self.hands[player]
        hand_strs = [f"{card_str(card, self.colors)}" for card in hand]
        print("  " + "  ".join(hand_strs))
        print()

    def _display_expeditions(self, player, color_keys):
        """Display expedition columns for a player."""
        for c in color_keys:
            cards = self.expeditions[player][c]
            color_code = self.colors[c][1]
            label = f"{color_code}{c}{RESET}"
            if cards:
                card_strs = [card_str(card, self.colors) for card in cards]
                print(f"    {label}: " + " ".join(card_strs))
            else:
                print(f"    {label}: ---")

    def get_move(self):
        """Get a move from the current player."""
        if self.phase == 'play':
            print(f"  {self.players[self.current_player-1]}'s turn - Phase 1: Play or Discard")
            print(f"  Commands: 'play <color> <value>' or 'discard <color> <value>'")
            print(f"  (use 'x' for investment cards, e.g., 'play R x')")
            move_str = input_with_quit("  > ").strip().lower()
            return ('play_phase', move_str)
        else:
            print(f"  Phase 2: Draw a card")
            print(f"  Commands: 'draw deck' or 'draw <color>' (from discard pile)")
            move_str = input_with_quit("  > ").strip().lower()
            return ('draw_phase', move_str)

    def make_move(self, move):
        """Apply a move. Returns True if valid."""
        phase, move_str = move
        if phase == 'play_phase':
            return self._handle_play_phase(move_str)
        else:
            return self._handle_draw_phase(move_str)

    def _parse_card_input(self, parts):
        """Parse color and value from input parts. Returns (color, value) or None."""
        if len(parts) < 2:
            return None
        color = parts[0].upper()
        if color not in self.colors:
            print(f"  Invalid color '{color}'. Valid: {', '.join(self.colors.keys())}")
            return None
        val_str = parts[1].lower()
        if val_str == 'x':
            value = INVESTMENT_SYMBOL
        else:
            try:
                value = int(val_str)
                if value < 2 or value > 10:
                    print("  Card values must be between 2 and 10 (or 'x' for investment).")
                    return None
            except ValueError:
                print("  Invalid card value. Use 2-10 or 'x' for investment.")
                return None
        return (color, value)

    def _handle_play_phase(self, move_str):
        """Handle play/discard phase."""
        parts = move_str.split()
        if len(parts) < 3:
            print("  Format: 'play <color> <value>' or 'discard <color> <value>'")
            return False

        action = parts[0]
        if action not in ('play', 'discard'):
            print("  First word must be 'play' or 'discard'.")
            return False

        parsed = self._parse_card_input(parts[1:])
        if parsed is None:
            return False
        color, value = parsed
        card = (color, value)

        hand = self.hands[self.current_player]
        if card not in hand:
            print(f"  You don't have that card in your hand.")
            return False

        if action == 'play':
            expedition = self.expeditions[self.current_player][color]
            if not self._can_play_on_expedition(expedition, card):
                if value == INVESTMENT_SYMBOL:
                    print("  Cannot play investment card - numbered cards already placed.")
                else:
                    print("  Card value must be higher than the last numbered card in this expedition.")
                return False
            hand.remove(card)
            expedition.append(card)
        else:
            hand.remove(card)
            self.discard_piles[color].append(card)

        self.pending_action = (action, card)
        self.phase = 'draw'
        return True

    def _can_play_on_expedition(self, expedition, card):
        """Check if a card can be played on an expedition."""
        if not expedition:
            return True
        if card[1] == INVESTMENT_SYMBOL:
            # Investment cards can only be played if no numbered cards exist
            return all(c[1] == INVESTMENT_SYMBOL for c in expedition)
        # Numbered card: must be higher than any existing numbered card
        highest = 0
        for c in expedition:
            if c[1] != INVESTMENT_SYMBOL:
                highest = max(highest, c[1])
        return card[1] > highest

    def _handle_draw_phase(self, move_str):
        """Handle draw phase."""
        parts = move_str.split()
        if not parts:
            print("  Format: 'draw deck' or 'draw <color>'")
            return False

        if parts[0] != 'draw':
            print("  Command must start with 'draw'.")
            return False

        if len(parts) < 2:
            print("  Specify 'deck' or a color to draw from.")
            return False

        source = parts[1].upper()

        if source == 'DECK':
            if not self.deck:
                print("  Deck is empty!")
                return False
            drawn = self.deck.pop()
            self.hands[self.current_player].append(drawn)
        else:
            if source not in self.colors:
                print(f"  Invalid draw source. Use 'deck' or a color: {', '.join(self.colors.keys())}")
                return False
            if not self.discard_piles[source]:
                print(f"  The {self.colors[source][0]} discard pile is empty.")
                return False
            # Cannot draw from the pile you just discarded to
            if self.pending_action and self.pending_action[0] == 'discard':
                discarded_color = self.pending_action[1][0]
                if source == discarded_color:
                    print("  You cannot draw from the pile you just discarded to!")
                    return False
            drawn = self.discard_piles[source].pop()
            self.hands[self.current_player].append(drawn)

        self.hands[self.current_player].sort(key=card_sort_key)
        self.phase = 'play'
        self.pending_action = None
        return True

    def check_game_over(self):
        """Check if the round/game is over."""
        if len(self.deck) == 0:
            self._end_round()

    def _end_round(self):
        """End the current round and tally scores."""
        color_keys = list(self.colors.keys())
        clear_screen()
        print(f"\n{'=' * 60}")
        print(f"  ROUND {self.round_number} COMPLETE!")
        print(f"{'=' * 60}")

        for p in [1, 2]:
            print(f"\n  {self.players[p-1]}:")
            round_total = 0
            for c in color_keys:
                cards = self.expeditions[p][c]
                if cards:
                    raw, mult, bonus, total = score_expedition(cards)
                    color_code = self.colors[c][1]
                    card_count = len(cards)
                    bonus_str = f" + {bonus} bonus" if bonus else ""
                    print(f"    {color_code}{self.colors[c][0]}{RESET}: "
                          f"({raw}) x {mult}{bonus_str} = {total}  [{card_count} cards]")
                    round_total += total
            print(f"    Round {self.round_number} score: {round_total}")
            self.round_scores[p].append(round_total)

        print()
        for p in [1, 2]:
            cum = sum(self.round_scores[p])
            print(f"  {self.players[p-1]} total: {cum}")

        if self.round_number < self.total_rounds:
            self.round_number += 1
            input_with_quit("\n  Press Enter to start the next round...")
            self._setup_round()
        else:
            # Game over
            self.game_over = True
            s1 = sum(self.round_scores[1])
            s2 = sum(self.round_scores[2])
            if s1 > s2:
                self.winner = 1
            elif s2 > s1:
                self.winner = 2
            else:
                self.winner = None
            input_with_quit("\n  Press Enter to see final results...")

    def get_state(self):
        """Return serializable game state."""
        def serialize_cards(cards):
            return [(c[0], c[1]) for c in cards]

        def serialize_expeditions(exp):
            return {color: serialize_cards(cards) for color, cards in exp.items()}

        return {
            'variation': self.variation,
            'deck': serialize_cards(self.deck),
            'hands': {str(k): serialize_cards(v) for k, v in self.hands.items()},
            'expeditions': {str(k): serialize_expeditions(v) for k, v in self.expeditions.items()},
            'discard_piles': {c: serialize_cards(cards) for c, cards in self.discard_piles.items()},
            'round_number': self.round_number,
            'total_rounds': self.total_rounds,
            'round_scores': {str(k): v for k, v in self.round_scores.items()},
            'phase': self.phase,
            'pending_action': self.pending_action,
        }

    def load_state(self, state):
        """Restore game state from saved data."""
        self.variation = state.get('variation', 'standard')
        if self.variation == 'extended':
            self.colors = dict(EXTENDED_COLORS)
        else:
            self.colors = dict(STANDARD_COLORS)

        def deserialize_card(c):
            return (c[0], INVESTMENT_SYMBOL if c[1] == INVESTMENT_SYMBOL else (int(c[1]) if c[1] != INVESTMENT_SYMBOL else c[1]))

        def deserialize_cards(cards):
            return [deserialize_card(c) for c in cards]

        self.deck = deserialize_cards(state['deck'])
        self.hands = {int(k): deserialize_cards(v) for k, v in state['hands'].items()}
        self.expeditions = {}
        for pk, exp in state['expeditions'].items():
            self.expeditions[int(pk)] = {c: deserialize_cards(cards) for c, cards in exp.items()}
        self.discard_piles = {c: deserialize_cards(cards) for c, cards in state['discard_piles'].items()}
        self.round_number = state['round_number']
        self.total_rounds = state['total_rounds']
        self.round_scores = {int(k): v for k, v in state['round_scores'].items()}
        self.phase = state.get('phase', 'play')
        self.pending_action = state.get('pending_action')

    def get_tutorial(self):
        """Return tutorial text for Lost Cities."""
        colors_desc = ", ".join(f"{v[0]} ({k})" for k, v in self.colors.items())
        return f"""
{'=' * 60}
  LOST CITIES - Tutorial
{'=' * 60}

  OVERVIEW:
  Lost Cities is a 2-player card game about funding expeditions.
  Each expedition you start costs 20 points, so you need enough
  high cards to turn a profit!

  THE CARDS:
  There are {len(self.colors)} expedition colors: {colors_desc}.
  Each color has:
    - 3 Investment (handshake) cards marked 'X' (multiply your score)
    - Numbered cards from 2 to 10

  SETUP:
  Each player is dealt 8 cards. The game is played over
  {self.total_rounds} rounds.

  ON YOUR TURN:
  1) PLAY or DISCARD a card from your hand:
     - 'play R 5'    -> Play the Red 5 on your Red expedition
     - 'play G x'    -> Play a Green investment card
     - 'discard B 3' -> Discard the Blue 3

  2) DRAW a card:
     - 'draw deck'   -> Draw from the main deck
     - 'draw R'      -> Draw from the Red discard pile
     (You cannot draw from a pile you just discarded to)

  EXPEDITION RULES:
  - Cards in an expedition must be played in ascending order.
  - Investment (X) cards must be played BEFORE any numbered cards.
  - Once a numbered card is placed, no more investments for that color.
  - You cannot play a card lower than the highest in that expedition.

  SCORING:
  - Each started expedition costs 20 points.
  - Score = (sum of numbered cards - 20) x (1 + investment cards)
  - If you have 8 or more cards in one expedition: +20 bonus
  - Unstarted expeditions score 0 (no penalty).

  STRATEGY TIPS:
  - Don't start an expedition unless you have enough high cards.
  - Investment cards multiply both gains AND losses!
  - Watch what your opponent discards - you might pick it up.
  - Keep track of the deck size; the game ends when it's empty.

  The game plays {self.total_rounds} rounds. Highest total score wins!

{'=' * 60}
"""
