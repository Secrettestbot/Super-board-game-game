"""Hanabi - A cooperative card game of fireworks."""

import random
from engine.base import BaseGame, input_with_quit, clear_screen


COLORS_5 = ['Red', 'Blue', 'Green', 'Yellow', 'White']
COLORS_4 = ['Red', 'Blue', 'Green', 'Yellow']

COLOR_CODES = {
    'Red': '\033[91m',
    'Blue': '\033[94m',
    'Green': '\033[92m',
    'Yellow': '\033[93m',
    'White': '\033[97m',
}
RESET = '\033[0m'

CARD_DISTRIBUTION = {1: 3, 2: 2, 3: 2, 4: 2, 5: 1}


def make_deck(colors):
    """Create and shuffle the Hanabi deck."""
    deck = []
    for color in colors:
        for number, count in CARD_DISTRIBUTION.items():
            for _ in range(count):
                deck.append({'color': color, 'number': number})
    random.shuffle(deck)
    return deck


def card_str(card):
    """Format a card with ANSI color."""
    cc = COLOR_CODES.get(card['color'], '')
    return f"{cc}{card['color'][0]}{card['number']}{RESET}"


def card_str_known(known):
    """Format what a player knows about their own card."""
    color_part = known.get('color', '?')
    if color_part != '?':
        cc = COLOR_CODES.get(color_part, '')
        color_part = f"{cc}{color_part[0]}{RESET}"
    number_part = str(known.get('number', '?'))
    return f"{color_part}{number_part}"


class HanabiGame(BaseGame):
    """Hanabi cooperative card game implementation."""

    name = "Hanabi"
    description = "A cooperative card game of fireworks"
    min_players = 2
    max_players = 2
    variations = {
        "standard": "Standard Hanabi (5 colors)",
        "simple": "Simple (4 colors)",
    }

    def setup(self):
        """Initialize the game state."""
        colors = COLORS_5 if self.variation == "standard" else COLORS_4
        self.colors = colors
        self.deck = make_deck(colors)
        self.hands = {1: [], 2: []}
        self.known = {1: [], 2: []}
        self.hint_tokens = 8
        self.max_hints = 8
        self.fuse_tokens = 3
        self.piles = {c: 0 for c in colors}
        self.discard_pile = []
        self.final_turns = None
        self.turns_taken_after_empty = 0
        self.score = 0
        self.last_action = ""

        for _ in range(5):
            for p in [1, 2]:
                self._draw_card(p)

    def _draw_card(self, player):
        """Draw a card from the deck into player's hand."""
        if self.deck:
            card = self.deck.pop()
            self.hands[player].append(card)
            self.known[player].append({})

    def display(self):
        """Display the game state."""
        other = 2 if self.current_player == 1 else 1
        max_colors = len(self.colors)

        print(f"\n{'=' * 55}")
        print(f"  HANABI - Cooperative Fireworks!")
        print(f"{'=' * 55}")

        if self.last_action:
            print(f"  Last: {self.last_action}")
            print()

        # Tokens
        hints_display = f"{'*' * self.hint_tokens}{'.' * (self.max_hints - self.hint_tokens)}"
        fuse_display = f"{'*' * self.fuse_tokens}{'.' * (3 - self.fuse_tokens)}"
        print(f"  Hints: [{hints_display}] {self.hint_tokens}/{self.max_hints}"
              f"    Fuses: [{fuse_display}] {self.fuse_tokens}/3")
        print(f"  Deck: {len(self.deck)} cards remaining")
        print()

        # Firework piles
        print("  Firework Piles:")
        for color in self.colors:
            cc = COLOR_CODES.get(color, '')
            val = self.piles[color]
            bar = '#' * val + '.' * (5 - val)
            print(f"    {cc}{color:7s}{RESET} [{bar}] {val}/5")
        print()

        # Other player's hand (you can see it)
        print(f"  {self.players[other - 1]}'s Hand (you can see these):")
        for i, card in enumerate(self.hands[other]):
            print(f"    [{i + 1}] {card_str(card)}")
        print()

        # Your own hand (hidden, show known info)
        print(f"  Your Hand ({self.players[self.current_player - 1]}) - you can't see these:")
        for i, known_info in enumerate(self.known[self.current_player]):
            display = card_str_known(known_info)
            print(f"    [{i + 1}] {display}")
        print()

        # Discard pile
        if self.discard_pile:
            discards = ' '.join(card_str(c) for c in self.discard_pile)
            print(f"  Discard pile: {discards}")
        else:
            print("  Discard pile: (empty)")

        if self.final_turns is not None:
            remaining = self.final_turns - self.turns_taken_after_empty
            print(f"\n  *** Deck empty! {remaining} final turn(s) remaining ***")

        print(f"\n{'=' * 55}")
        print(f"  {self.players[self.current_player - 1]}'s turn")
        print(f"{'=' * 55}")

    def get_move(self):
        """Get a move from the current player."""
        print("\n  Actions:")
        if self.hint_tokens > 0:
            print("    hint color <color>  - e.g. hint color red")
            print("    hint number <num>   - e.g. hint number 3")
        else:
            print("    (no hint tokens available)")
        hand_size = len(self.hands[self.current_player])
        print(f"    play <1-{hand_size}>          - play a card (blind)")
        if self.hint_tokens < self.max_hints:
            print(f"    discard <1-{hand_size}>       - discard a card, regain hint")
        print()

        while True:
            raw = input_with_quit("  Your action: ").strip().lower()
            parts = raw.split()
            if not parts:
                print("  Please enter an action.")
                continue

            if parts[0] == 'hint':
                if self.hint_tokens <= 0:
                    print("  No hint tokens available!")
                    continue
                if len(parts) < 3:
                    print("  Usage: hint color <color> OR hint number <num>")
                    continue
                hint_type = parts[1]
                hint_value = parts[2]

                if hint_type == 'color':
                    matched = None
                    for c in self.colors:
                        if c.lower().startswith(hint_value):
                            matched = c
                            break
                    if not matched:
                        print(f"  Unknown color. Choose from: {', '.join(self.colors)}")
                        continue
                    return ('hint', 'color', matched)

                elif hint_type == 'number':
                    try:
                        num = int(hint_value)
                        if num < 1 or num > 5:
                            raise ValueError
                    except ValueError:
                        print("  Number must be 1-5.")
                        continue
                    return ('hint', 'number', num)
                else:
                    print("  Usage: hint color <color> OR hint number <num>")
                    continue

            elif parts[0] == 'play':
                if len(parts) < 2:
                    print("  Usage: play <card#>")
                    continue
                try:
                    idx = int(parts[1])
                    if idx < 1 or idx > len(self.hands[self.current_player]):
                        raise ValueError
                except ValueError:
                    print(f"  Choose a card number 1-{len(self.hands[self.current_player])}.")
                    continue
                return ('play', idx - 1)

            elif parts[0] == 'discard':
                if self.hint_tokens >= self.max_hints:
                    print("  Hint tokens are full, no need to discard!")
                    continue
                if len(parts) < 2:
                    print("  Usage: discard <card#>")
                    continue
                try:
                    idx = int(parts[1])
                    if idx < 1 or idx > len(self.hands[self.current_player]):
                        raise ValueError
                except ValueError:
                    print(f"  Choose a card number 1-{len(self.hands[self.current_player])}.")
                    continue
                return ('discard', idx - 1)

            else:
                print("  Unknown action. Use: hint, play, or discard.")

    def make_move(self, move):
        """Apply a move. Returns True if valid."""
        player = self.current_player
        other = 2 if player == 1 else 1

        if move[0] == 'hint':
            _, hint_type, hint_value = move
            if self.hint_tokens <= 0:
                return False

            self.hint_tokens -= 1
            matched_positions = []

            for i, card in enumerate(self.hands[other]):
                if hint_type == 'color' and card['color'] == hint_value:
                    self.known[other][i]['color'] = hint_value
                    matched_positions.append(i + 1)
                elif hint_type == 'number' and card['number'] == hint_value:
                    self.known[other][i]['number'] = hint_value
                    matched_positions.append(i + 1)

            if matched_positions:
                pos_str = ', '.join(str(p) for p in matched_positions)
                self.last_action = (
                    f"{self.players[player - 1]} hinted {self.players[other - 1]}: "
                    f"{hint_type} {hint_value} (cards {pos_str})"
                )
            else:
                self.last_action = (
                    f"{self.players[player - 1]} hinted {self.players[other - 1]}: "
                    f"{hint_type} {hint_value} (no cards matched)"
                )
            return True

        elif move[0] == 'play':
            idx = move[1]
            card = self.hands[player].pop(idx)
            self.known[player].pop(idx)

            if self.piles[card['color']] == card['number'] - 1:
                self.piles[card['color']] = card['number']
                self.last_action = (
                    f"{self.players[player - 1]} played {card_str(card)} - Success!"
                )
                # Bonus: completing a 5 gives back a hint token
                if card['number'] == 5 and self.hint_tokens < self.max_hints:
                    self.hint_tokens += 1
                    self.last_action += " +1 hint token!"
            else:
                self.fuse_tokens -= 1
                self.discard_pile.append(card)
                self.last_action = (
                    f"{self.players[player - 1]} played {card_str(card)} - BOOM! "
                    f"Fuse lost! ({self.fuse_tokens} remaining)"
                )

            self._draw_card(player)

            if self.final_turns is not None:
                self.turns_taken_after_empty += 1

            return True

        elif move[0] == 'discard':
            idx = move[1]
            card = self.hands[player].pop(idx)
            self.known[player].pop(idx)
            self.discard_pile.append(card)

            if self.hint_tokens < self.max_hints:
                self.hint_tokens += 1

            self.last_action = (
                f"{self.players[player - 1]} discarded {card_str(card)} "
                f"(hints: {self.hint_tokens})"
            )

            self._draw_card(player)

            if self.final_turns is not None:
                self.turns_taken_after_empty += 1

            return True

        return False

    def check_game_over(self):
        """Check if the game is over."""
        self.score = sum(self.piles.values())

        # All piles complete
        if all(v == 5 for v in self.piles.values()):
            self.game_over = True
            self.winner = None
            self.last_action += f"\n  PERFECT SCORE! {self.score} points!"
            return

        # Fuse tokens depleted
        if self.fuse_tokens <= 0:
            self.game_over = True
            self.winner = None
            self.score = 0
            self.last_action += "\n  All fuses blown! Score: 0"
            return

        # Deck ran out - start final turns
        if not self.deck and self.final_turns is None:
            self.final_turns = 2  # each player gets one more turn

        # Final turns exhausted
        if self.final_turns is not None and self.turns_taken_after_empty >= self.final_turns:
            self.game_over = True
            self.winner = None
            return

    def get_state(self):
        """Return serializable game state."""
        return {
            'colors': self.colors,
            'deck': self.deck,
            'hands': {str(k): v for k, v in self.hands.items()},
            'known': {str(k): v for k, v in self.known.items()},
            'hint_tokens': self.hint_tokens,
            'max_hints': self.max_hints,
            'fuse_tokens': self.fuse_tokens,
            'piles': self.piles,
            'discard_pile': self.discard_pile,
            'final_turns': self.final_turns,
            'turns_taken_after_empty': self.turns_taken_after_empty,
            'score': self.score,
            'last_action': self.last_action,
        }

    def load_state(self, state):
        """Restore game state from saved data."""
        self.colors = state['colors']
        self.deck = state['deck']
        self.hands = {int(k): v for k, v in state['hands'].items()}
        self.known = {int(k): v for k, v in state['known'].items()}
        self.hint_tokens = state['hint_tokens']
        self.max_hints = state['max_hints']
        self.fuse_tokens = state['fuse_tokens']
        self.piles = state['piles']
        self.discard_pile = state['discard_pile']
        self.final_turns = state['final_turns']
        self.turns_taken_after_empty = state['turns_taken_after_empty']
        self.score = state['score']
        self.last_action = state['last_action']

    def get_tutorial(self):
        """Return tutorial text for Hanabi."""
        return """
╔══════════════════════════════════════════════════════╗
║                  HANABI TUTORIAL                     ║
╠══════════════════════════════════════════════════════╣
║                                                      ║
║  Hanabi is a COOPERATIVE card game. Both players     ║
║  work together to build beautiful fireworks!         ║
║                                                      ║
║  THE DECK:                                           ║
║  5 colors (Red, Blue, Green, Yellow, White)          ║
║  Each color has: 1,1,1, 2,2, 3,3, 4,4, 5           ║
║  (50 cards total)                                    ║
║                                                      ║
║  THE TWIST:                                          ║
║  You can see your PARTNER'S cards, but NOT your own! ║
║  You must rely on hints from your partner.           ║
║                                                      ║
║  YOUR TURN - choose one action:                      ║
║                                                      ║
║  1) GIVE A HINT (costs 1 hint token):               ║
║     Tell your partner about ALL cards of one color   ║
║     or ALL cards of one number in their hand.        ║
║     > hint color red                                 ║
║     > hint number 3                                  ║
║                                                      ║
║  2) PLAY A CARD (blind!):                            ║
║     Choose a card position to play. If it's the      ║
║     next number needed for that color's pile,        ║
║     success! Otherwise, you lose a fuse token.       ║
║     > play 2                                         ║
║                                                      ║
║  3) DISCARD A CARD:                                  ║
║     Discard a card to regain 1 hint token.           ║
║     You draw a replacement card.                     ║
║     > discard 4                                      ║
║                                                      ║
║  FIREWORK PILES:                                     ║
║  Each color builds from 1 up to 5 in order.          ║
║  Completing a 5 earns a bonus hint token.            ║
║                                                      ║
║  GAME ENDS WHEN:                                     ║
║  - All 5 piles reach 5 (perfect score of 25!)        ║
║  - 3rd fuse token lost (score becomes 0)             ║
║  - Deck runs out (each player gets 1 final turn)     ║
║                                                      ║
║  SCORING:                                            ║
║  Your score = total cards played across all piles.   ║
║  0-5: Horrible  | 6-10: Mediocre | 11-15: Honorable ║
║  16-20: Excellent | 21-24: Amazing | 25: Legendary! ║
║                                                      ║
╚══════════════════════════════════════════════════════╝
"""
