"""Dixit Duel - A storytelling and guessing card game for two players."""

import random

from engine.base import BaseGame, input_with_quit, clear_screen


# Image cards represented as themed word descriptions
CARD_THEMES = [
    "A castle floating in the clouds",
    "A clock melting over a tree branch",
    "A fox reading a book by candlelight",
    "An ocean inside a teacup",
    "A staircase leading into the sky",
    "A forest of giant mushrooms at dusk",
    "A whale swimming through a city",
    "A mirror reflecting a different world",
    "A train made of flowers",
    "An astronaut planting a garden on the moon",
    "A lighthouse in a field of wheat",
    "A violin playing itself in an empty room",
    "A door standing alone in a desert",
    "A tree with roots made of rivers",
    "A bird carrying a lantern through fog",
    "A bridge between two floating islands",
    "A snowflake under a magnifying glass",
    "A dragon sleeping on a pile of books",
    "A ship in a bottle on a stormy sea",
    "A child drawing stars that come alive",
    "A library where books fly like birds",
    "An hourglass filled with butterflies",
    "A garden growing on a rooftop in rain",
    "A cat wearing a crown of flowers",
    "A compass that points to memories",
    "A key made of ice in a warm hand",
    "A windmill powered by singing",
    "A labyrinth made of bookshelves",
    "A rainbow that casts shadows",
    "A telescope that shows the past",
    "A candle whose flame is a tiny dancer",
    "A boat made of autumn leaves",
    "A mountain that hums a lullaby",
    "A window that opens to the sea floor",
    "A crown woven from moonbeams",
    "A river that flows upward into clouds",
    "A pocket watch that ticks backward",
    "A rose growing through cracked stone",
    "A swing hanging from a crescent moon",
    "A wolf howling colors into the sky",
    "A kite tangled in the northern lights",
    "A door knocker shaped like a riddle",
    "A piano with keys of falling water",
    "A nest built from old love letters",
    "A sundial casting shadows of tomorrow",
    "A feather that weighs more than stone",
    "A balloon animal that came alive",
    "A photograph that changes with seasons",
    "A thunderstorm in a glass jar",
    "A tortoise carrying a tiny village",
]


class DixitDuelGame(BaseGame):
    """Dixit Duel: Give clues about image cards and guess which one matches."""

    name = "Dixit Duel"
    description = "A storytelling and guessing card game for two"
    min_players = 2
    max_players = 2
    variations = {
        "standard": "Standard game - play to 15 points, 6-card hands",
        "quick": "Quick game - play to 8 points, 4-card hands",
    }

    def __init__(self, variation=None):
        super().__init__(variation)
        self.deck = []
        self.discard = []
        self.hands = [[], []]       # cards in each player's hand
        self.scores = [0, 0]
        self.target_score = 15
        self.hand_size = 6
        self.storyteller = 0        # index 0 or 1
        self.round_phase = "clue"   # "clue", "lineup", "guess", "reveal"
        self.current_clue = ""
        self.storyteller_card = None
        self.lineup = []            # cards on the table
        self.lineup_sources = []    # which player played each card (index)
        self.round_number = 0
        self.last_round_summary = ""

    def setup(self):
        if self.variation == "quick":
            self.target_score = 8
            self.hand_size = 4
        else:
            self.target_score = 15
            self.hand_size = 6

        # Build and shuffle deck
        self.deck = list(CARD_THEMES)
        random.shuffle(self.deck)
        self.discard = []

        # Deal hands
        self.hands = [[], []]
        for _ in range(self.hand_size):
            for pi in range(2):
                if self.deck:
                    self.hands[pi].append(self.deck.pop())

        self.scores = [0, 0]
        self.storyteller = 0
        self.round_phase = "clue"
        self.current_clue = ""
        self.storyteller_card = None
        self.lineup = []
        self.lineup_sources = []
        self.round_number = 1
        self.last_round_summary = ""
        self.current_player = 1  # storyteller is player 1 first

    def _refill_deck(self):
        """Shuffle discard pile back into the deck if deck is empty."""
        if not self.deck and self.discard:
            self.deck = self.discard[:]
            self.discard = []
            random.shuffle(self.deck)

    def _draw_card(self, player_idx):
        """Draw a card for a player."""
        self._refill_deck()
        if self.deck:
            self.hands[player_idx].append(self.deck.pop())

    def display(self):
        st = self.storyteller  # 0 or 1
        guesser = 1 - st

        print(f"\n  === DIXIT DUEL === Round {self.round_number}")
        print(f"  {self.players[0]}: {self.scores[0]} pts  |  {self.players[1]}: {self.scores[1]} pts")
        print(f"  Target: {self.target_score} points")
        print(f"  Storyteller: {self.players[st]}")
        print()

        if self.last_round_summary:
            print(self.last_round_summary)
            print()

        if self.round_phase == "clue":
            # Show storyteller their hand
            print(f"  {self.players[st]}'s hand (STORYTELLER):")
            print(f"  {'=' * 56}")
            for i, card in enumerate(self.hands[st]):
                print(f"    {i + 1}. {card}")
            print(f"  {'=' * 56}")
            print()
            print("  Choose a card and give a clue about it.")
            print("  The clue can be a word, phrase, or sentence.")

        elif self.round_phase == "lineup":
            # Show guesser their hand and the clue
            print(f"  The clue is: \"{self.current_clue}\"")
            print()
            print(f"  {self.players[guesser]}'s hand (GUESSER):")
            print(f"  {'=' * 56}")
            for i, card in enumerate(self.hands[guesser]):
                print(f"    {i + 1}. {card}")
            print(f"  {'=' * 56}")
            print()
            print("  Choose a card to add to the lineup (to mislead!).")

        elif self.round_phase == "guess":
            # Show the lineup
            print(f"  The clue is: \"{self.current_clue}\"")
            print()
            print(f"  === LINEUP ===")
            for i, card in enumerate(self.lineup):
                print(f"    {i + 1}. {card}")
            print(f"  {'=' * 56}")
            print()
            print(f"  {self.players[guesser]}, which card matches the clue?")

    def get_move(self):
        st = self.storyteller
        guesser = 1 - st

        if self.round_phase == "clue":
            self.current_player = st + 1
            print()
            card_input = input_with_quit(f"  Choose card number (1-{len(self.hands[st])}): ").strip()
            try:
                card_idx = int(card_input) - 1
                if card_idx < 0 or card_idx >= len(self.hands[st]):
                    return None
            except ValueError:
                return None
            clue = input_with_quit("  Enter your clue: ").strip()
            if not clue:
                return None
            return ("clue", card_idx, clue)

        elif self.round_phase == "lineup":
            self.current_player = guesser + 1
            print()
            card_input = input_with_quit(f"  Choose card number (1-{len(self.hands[guesser])}): ").strip()
            try:
                card_idx = int(card_input) - 1
                if card_idx < 0 or card_idx >= len(self.hands[guesser]):
                    return None
            except ValueError:
                return None
            return ("lineup", card_idx)

        elif self.round_phase == "guess":
            self.current_player = guesser + 1
            print()
            guess_input = input_with_quit(f"  Choose card number (1-{len(self.lineup)}): ").strip()
            try:
                guess_idx = int(guess_input) - 1
                if guess_idx < 0 or guess_idx >= len(self.lineup):
                    return None
            except ValueError:
                return None
            return ("guess", guess_idx)

        return None

    def make_move(self, move):
        if move is None:
            return False

        st = self.storyteller
        guesser = 1 - st

        if move[0] == "clue":
            _, card_idx, clue = move
            self.storyteller_card = self.hands[st].pop(card_idx)
            self.current_clue = clue
            self.round_phase = "lineup"
            return True

        elif move[0] == "lineup":
            _, card_idx = move
            guesser_card = self.hands[guesser].pop(card_idx)

            # Build lineup: storyteller's card + guesser's card + 1 from deck
            self.lineup = [self.storyteller_card, guesser_card]
            self.lineup_sources = [st, guesser]

            # Add a random card from the deck as a decoy
            self._refill_deck()
            if self.deck:
                decoy = self.deck.pop()
                self.lineup.append(decoy)
                self.lineup_sources.append(-1)  # deck card

            # Shuffle the lineup
            combined = list(zip(self.lineup, self.lineup_sources))
            random.shuffle(combined)
            self.lineup, self.lineup_sources = zip(*combined)
            self.lineup = list(self.lineup)
            self.lineup_sources = list(self.lineup_sources)

            self.round_phase = "guess"
            return True

        elif move[0] == "guess":
            _, guess_idx = move
            chosen_source = self.lineup_sources[guess_idx]
            correct = (chosen_source == st)

            # Scoring
            summary_lines = []
            summary_lines.append(f"  --- Round {self.round_number} Results ---")
            summary_lines.append(f"  Clue: \"{self.current_clue}\"")
            summary_lines.append(f"  Storyteller's card: {self.storyteller_card}")
            summary_lines.append(f"  {self.players[guesser]} chose: {self.lineup[guess_idx]}")

            if correct:
                # Guesser found it: both score 3 points
                self.scores[st] += 3
                self.scores[guesser] += 3
                summary_lines.append(f"  CORRECT! Both players score 3 points.")
            else:
                # Guesser wrong
                if chosen_source == guesser:
                    # Chose their own card (whoops) - storyteller gets 3
                    self.scores[st] += 3
                    summary_lines.append(f"  WRONG! {self.players[guesser]} picked their own card!")
                    summary_lines.append(f"  {self.players[st]} scores 3 points.")
                else:
                    # Chose the decoy - storyteller's clue was too hard
                    self.scores[guesser] += 1
                    summary_lines.append(f"  WRONG! That was a decoy card.")
                    summary_lines.append(f"  {self.players[guesser]} scores 1 consolation point.")

            summary_lines.append(f"  Score: {self.players[0]} {self.scores[0]} - {self.scores[1]} {self.players[1]}")

            self.last_round_summary = "\n".join(summary_lines)

            # Discard lineup cards
            self.discard.extend(self.lineup)

            # Draw back up
            self._draw_card(st)
            self._draw_card(guesser)

            # Switch storyteller and start new round
            self.storyteller = 1 - self.storyteller
            self.round_phase = "clue"
            self.round_number += 1
            self.lineup = []
            self.lineup_sources = []
            self.storyteller_card = None
            self.current_clue = ""
            self.current_player = self.storyteller + 1

            # Show the results before continuing
            clear_screen()
            print("\n".join(summary_lines))
            input("\n  Press Enter to continue...")
            return True

        return False

    def check_game_over(self):
        for i in range(2):
            if self.scores[i] >= self.target_score:
                self.game_over = True
                # Highest score wins; if tie the one who reached first
                if self.scores[0] > self.scores[1]:
                    self.winner = 1
                elif self.scores[1] > self.scores[0]:
                    self.winner = 2
                else:
                    self.winner = None  # draw
                return
        # Also end if no cards left
        if not self.deck and not self.discard and not self.hands[0] and not self.hands[1]:
            self.game_over = True
            if self.scores[0] > self.scores[1]:
                self.winner = 1
            elif self.scores[1] > self.scores[0]:
                self.winner = 2
            else:
                self.winner = None

    def get_state(self):
        return {
            "deck": self.deck,
            "discard": self.discard,
            "hands": self.hands,
            "scores": self.scores,
            "target_score": self.target_score,
            "hand_size": self.hand_size,
            "storyteller": self.storyteller,
            "round_phase": self.round_phase,
            "current_clue": self.current_clue,
            "storyteller_card": self.storyteller_card,
            "lineup": self.lineup,
            "lineup_sources": self.lineup_sources,
            "round_number": self.round_number,
            "last_round_summary": self.last_round_summary,
            "current_player": self.current_player,
            "turn_number": self.turn_number,
            "game_over": self.game_over,
            "winner": self.winner,
        }

    def load_state(self, state):
        self.deck = state["deck"]
        self.discard = state["discard"]
        self.hands = state["hands"]
        self.scores = state["scores"]
        self.target_score = state["target_score"]
        self.hand_size = state["hand_size"]
        self.storyteller = state["storyteller"]
        self.round_phase = state["round_phase"]
        self.current_clue = state["current_clue"]
        self.storyteller_card = state["storyteller_card"]
        self.lineup = state["lineup"]
        self.lineup_sources = state["lineup_sources"]
        self.round_number = state["round_number"]
        self.last_round_summary = state["last_round_summary"]
        self.current_player = state["current_player"]
        self.turn_number = state["turn_number"]
        self.game_over = state["game_over"]
        self.winner = state["winner"]

    def get_tutorial(self):
        return """
=== DIXIT DUEL TUTORIAL ===

OVERVIEW:
  Dixit Duel is a storytelling game where players take turns as the
  Storyteller. Each "image card" is represented by a themed description.

GOAL:
  Be the first to reach the target score (15 standard, 8 quick).

EACH ROUND:
  1. STORYTELLER phase:
     The Storyteller looks at their hand of cards and picks one.
     They give a CLUE about it - a word, phrase, sound, or sentence.
     The clue should be creative but not too obvious or too vague.

  2. LINEUP phase:
     The Guesser picks a card from their own hand to add to the
     lineup as a decoy. A random card from the deck is also added.
     All cards are shuffled together.

  3. GUESS phase:
     The Guesser tries to identify the Storyteller's card from the
     lineup based on the clue.

SCORING:
  - Correct guess: BOTH players score 3 points
  - Wrong guess (picked decoy): Guesser gets 1 consolation point
  - Wrong guess (picked own card): Storyteller gets 3 points

STRATEGY:
  As Storyteller: Give a clue that's not too easy (obvious) and not
  too hard (impossible). You WANT the guesser to find your card!
  As Guesser: Pick a card to mislead. Then analyze the lineup carefully.

COMMANDS:
  Enter card numbers when prompted
  quit/q    - Quit game
  save/s    - Save game
  help/h    - Show help
"""
