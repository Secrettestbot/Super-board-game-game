"""Coloretto - A set collection card game (2-player variant)."""

import random

from engine.base import BaseGame, input_with_quit, clear_screen


# Colors used per variation
COLORS_STANDARD = ["Red", "Orange", "Yellow", "Green", "Blue", "Indigo", "Violet"]
COLORS_SIMPLE = ["Red", "Yellow", "Green", "Blue", "Violet"]

# Scoring table: index = number of cards in that color, value = points
# 0 cards = 0, 1 = 1, 2 = 3, 3 = 6, 4 = 10, 5 = 15, 6+ = 21
SCORE_TABLE = [0, 1, 3, 6, 10, 15, 21]

# Number of row slots per variation
ROWS_STANDARD = 3
ROWS_SIMPLE = 2

# Cards per color
CARDS_PER_COLOR = 9

# Special card counts
WILD_CARDS = 3
PLUS_TWO_CARDS = 2

# Position in deck where "last round" card is inserted
# (roughly 15 cards from the bottom)
LAST_ROUND_BUFFER = 15


class ColorettoGame(BaseGame):
    """Coloretto - a set collection card game."""

    name = "Coloretto"
    description = "Collect colors wisely -- only your best 3 score positive"
    min_players = 2
    max_players = 2
    variations = {
        "standard": "Standard Coloretto (7 colors, 3 rows)",
        "simple": "Simple (5 colors, 2 rows)",
    }

    def __init__(self, variation=None):
        super().__init__(variation)
        self.deck = []
        self.discard = []
        self.rows = {}          # row_id -> list of cards
        self.num_rows = 0
        self.collections = {1: [], 2: []}  # each player's collected cards
        self.passed = {1: False, 2: False}  # whether player has taken a row this round
        self.last_round = False
        self.last_round_triggered = False
        self.log = []
        self.colors = []

    # ------------------------------------------------------------------ helpers

    def _num_rows(self):
        if self.variation == "simple":
            return ROWS_SIMPLE
        return ROWS_STANDARD

    def _colors(self):
        if self.variation == "simple":
            return list(COLORS_SIMPLE)
        return list(COLORS_STANDARD)

    def _build_deck(self):
        """Build the draw deck with color cards, wilds, +2 cards, and a last-round card."""
        self.colors = self._colors()
        cards = []
        for color in self.colors:
            cards.extend([color] * CARDS_PER_COLOR)
        cards.extend(["Wild"] * WILD_CARDS)
        cards.extend(["+2"] * PLUS_TWO_CARDS)
        random.shuffle(cards)

        # Insert "last round" marker roughly LAST_ROUND_BUFFER cards from the bottom
        buffer = min(LAST_ROUND_BUFFER, len(cards) - 1)
        insert_pos = len(cards) - buffer
        cards.insert(insert_pos, "LAST_ROUND")

        self.deck = cards

    def _draw_card(self):
        """Draw the top card from the deck. Returns the card string or None."""
        if not self.deck:
            return None
        card = self.deck.pop()
        if card == "LAST_ROUND":
            self.last_round = True
            self.last_round_triggered = True
            self._add_log("*** LAST ROUND card drawn! This is the final round. ***")
            # Draw the next actual card
            if self.deck:
                card = self.deck.pop()
            else:
                return None
        return card

    def _init_rows(self):
        """Reset the center rows to empty."""
        self.num_rows = self._num_rows()
        self.rows = {}
        for i in range(1, self.num_rows + 1):
            self.rows[i] = []

    def _all_rows_taken(self):
        """Check if all rows have been taken (all players have passed)."""
        return all(self.passed[p] for p in (1, 2))

    def _reset_round(self):
        """Reset rows and player pass state for a new round."""
        self._init_rows()
        self.passed = {1: False, 2: False}

    def _add_log(self, msg):
        self.log.append(msg)
        if len(self.log) > 10:
            self.log = self.log[-10:]

    def _score_collection(self, player):
        """Calculate score for a player's collection."""
        color_counts = {}
        wild_count = 0
        plus_two_count = 0

        for card in self.collections[player]:
            if card == "Wild":
                wild_count += 1
            elif card == "+2":
                plus_two_count += 1
            else:
                color_counts[card] = color_counts.get(card, 0) + 1

        # Sort colors by count descending to pick the best ones
        sorted_colors = sorted(color_counts.items(), key=lambda x: x[1], reverse=True)

        # Best 3 colors are positive, rest negative
        positive_colors = set()
        num_positive = 3
        for i, (color, _count) in enumerate(sorted_colors):
            if i < num_positive:
                positive_colors.add(color)

        # Distribute wilds optimally: add to positive colors to maximise score
        # First, try adding wilds to existing positive colors
        # Actually, wilds should be assigned to maximize positive score
        # Simple greedy: assign each wild to whichever positive color gains the most
        wild_assignments = {}
        for color in positive_colors:
            wild_assignments[color] = 0

        remaining_wilds = wild_count
        # If we have fewer than 3 colors, wilds can start a new positive color
        if len(positive_colors) < num_positive and remaining_wilds > 0:
            # Create virtual positive colors for unrepresented ones
            unused = [c for c in self.colors if c not in color_counts and c not in positive_colors]
            for uc in unused:
                if len(positive_colors) >= num_positive:
                    break
                positive_colors.add(uc)
                wild_assignments[uc] = 0
                color_counts[uc] = 0

        for _ in range(remaining_wilds):
            best_color = None
            best_gain = -1
            for color in positive_colors:
                current = color_counts.get(color, 0) + wild_assignments.get(color, 0)
                current_score = SCORE_TABLE[min(current, 6)]
                new_score = SCORE_TABLE[min(current + 1, 6)]
                gain = new_score - current_score
                if gain > best_gain:
                    best_gain = gain
                    best_color = color
            if best_color is not None:
                wild_assignments[best_color] = wild_assignments.get(best_color, 0) + 1
            # If no gain possible (all at 6+), wild is wasted

        # Calculate positive score
        positive_score = 0
        for color in positive_colors:
            total = color_counts.get(color, 0) + wild_assignments.get(color, 0)
            positive_score += SCORE_TABLE[min(total, 6)]

        # Calculate negative score (other colors, no wilds assigned)
        negative_score = 0
        for color, count in color_counts.items():
            if color not in positive_colors:
                negative_score += SCORE_TABLE[min(count, 6)]

        # +2 cards
        bonus = plus_two_count * 2

        return positive_score - negative_score + bonus

    def _score_breakdown(self, player):
        """Return a detailed scoring breakdown string."""
        color_counts = {}
        wild_count = 0
        plus_two_count = 0

        for card in self.collections[player]:
            if card == "Wild":
                wild_count += 1
            elif card == "+2":
                plus_two_count += 1
            else:
                color_counts[card] = color_counts.get(card, 0) + 1

        sorted_colors = sorted(color_counts.items(), key=lambda x: x[1], reverse=True)

        lines = []
        positive_colors = set()
        for i, (color, count) in enumerate(sorted_colors):
            if i < 3:
                positive_colors.add(color)

        # Show positive colors
        for color, count in sorted_colors:
            tag = "(+)" if color in positive_colors else "(-)"
            pts = SCORE_TABLE[min(count, 6)]
            sign = "+" if color in positive_colors else "-"
            lines.append(f"    {color:<10} {count} cards = {sign}{pts} pts {tag}")

        if wild_count:
            lines.append(f"    Wild       {wild_count} card(s) (assigned to best colors)")
        if plus_two_count:
            lines.append(f"    +2         {plus_two_count} card(s) = +{plus_two_count * 2} pts")

        return "\n".join(lines)

    def _opponent(self, player=None):
        if player is None:
            player = self.current_player
        return 2 if player == 1 else 1

    # ------------------------------------------------------------------ setup

    def setup(self):
        self._build_deck()
        self._init_rows()
        self.collections = {1: [], 2: []}
        self.passed = {1: False, 2: False}
        self.last_round = False
        self.last_round_triggered = False
        self.log = []
        self.game_over = False
        self.winner = None
        self.turn_number = 0
        self.current_player = 1

    # ---------------------------------------------------------------- display

    def display(self):
        cp = self.current_player
        opp = self._opponent()

        print(f"\n{'=' * 58}")
        title = "COLORETTO"
        if self.last_round:
            title += "  [LAST ROUND!]"
        print(f"  {title}  (Turn {self.turn_number + 1})")
        print(f"{'=' * 58}")

        # Opponent collection summary
        opp_colors = {}
        opp_wild = 0
        opp_plus2 = 0
        for c in self.collections[opp]:
            if c == "Wild":
                opp_wild += 1
            elif c == "+2":
                opp_plus2 += 1
            else:
                opp_colors[c] = opp_colors.get(c, 0) + 1

        print(f"\n  {self.players[opp - 1]}'s collection:")
        if opp_colors or opp_wild or opp_plus2:
            parts = []
            for color in sorted(opp_colors.keys()):
                parts.append(f"{color}:{opp_colors[color]}")
            if opp_wild:
                parts.append(f"Wild:{opp_wild}")
            if opp_plus2:
                parts.append(f"+2:{opp_plus2}")
            print(f"    {', '.join(parts)}")
        else:
            print("    (empty)")
        if self.passed[opp]:
            print("    [Sitting out - already took a row]")

        # Center rows
        print(f"\n  {'─' * 40}")
        print(f"  Center Rows (max 3 cards each):")
        for row_id in sorted(self.rows.keys()):
            cards = self.rows[row_id]
            card_str = ", ".join(cards) if cards else "(empty)"
            full = " [FULL]" if len(cards) >= 3 else ""
            print(f"    Row {row_id}: [{card_str}]{full}")
        print(f"  {'─' * 40}")

        # Deck info
        print(f"\n  Deck: {len(self.deck)} card(s) remaining")

        # Current player collection
        cp_colors = {}
        cp_wild = 0
        cp_plus2 = 0
        for c in self.collections[cp]:
            if c == "Wild":
                cp_wild += 1
            elif c == "+2":
                cp_plus2 += 1
            else:
                cp_colors[c] = cp_colors.get(c, 0) + 1

        print(f"\n  {self.players[cp - 1]}'s collection (you):")
        if cp_colors or cp_wild or cp_plus2:
            parts = []
            for color in sorted(cp_colors.keys()):
                parts.append(f"{color}:{cp_colors[color]}")
            if cp_wild:
                parts.append(f"Wild:{cp_wild}")
            if cp_plus2:
                parts.append(f"+2:{cp_plus2}")
            print(f"    {', '.join(parts)}")
        else:
            print("    (empty)")
        if self.passed[cp]:
            print("    [Sitting out - already took a row]")

        # Scores so far
        s1 = self._score_collection(1)
        s2 = self._score_collection(2)
        print(f"\n  Current scores:  {self.players[0]}: {s1}  |  {self.players[1]}: {s2}")

        # Log
        if self.log:
            print(f"\n  --- Log ---")
            for line in self.log[-6:]:
                print(f"  {line}")

        print()

    # -------------------------------------------------------------- get_move

    def get_move(self):
        cp = self.current_player

        # If this player already took a row, skip their turn
        if self.passed[cp]:
            # This shouldn't happen in normal flow because switch_player skips,
            # but handle it defensively
            return ("skip",)

        # Show options
        can_draw = bool(self.deck) and any(len(self.rows[r]) < 3 for r in self.rows)
        can_take = any(len(self.rows[r]) > 0 for r in self.rows)

        print("  Actions:")
        if can_draw:
            non_full = [r for r in sorted(self.rows.keys()) if len(self.rows[r]) < 3]
            print(f"    draw <row>  - Draw a card and place in row ({', '.join(str(r) for r in non_full)})")
        if can_take:
            non_empty = [r for r in sorted(self.rows.keys()) if len(self.rows[r]) > 0]
            print(f"    take <row>  - Take all cards from a row ({', '.join(str(r) for r in non_empty)})")

        while True:
            move_str = input_with_quit("  Your action: ").strip().lower()
            parts = move_str.split()

            if len(parts) != 2:
                print("  Enter: draw <row> or take <row>")
                continue

            action, row_str = parts

            if not row_str.isdigit():
                print(f"  Row must be a number (1-{self.num_rows}).")
                continue

            row_id = int(row_str)

            if row_id not in self.rows:
                print(f"  Invalid row. Choose from 1-{self.num_rows}.")
                continue

            if action == "draw":
                if not can_draw:
                    print("  Cannot draw: no cards in deck or all rows full.")
                    continue
                if len(self.rows[row_id]) >= 3:
                    print(f"  Row {row_id} is full. Choose a non-full row.")
                    continue
                if not self.deck:
                    print("  The deck is empty. You must take a row.")
                    continue
                return ("draw", row_id)

            elif action == "take":
                if len(self.rows[row_id]) == 0:
                    print(f"  Row {row_id} is empty. Choose a row with cards.")
                    continue
                return ("take", row_id)

            else:
                print("  Unknown action. Use 'draw' or 'take'.")

    # -------------------------------------------------------------- make_move

    def make_move(self, move):
        cp = self.current_player

        if move[0] == "skip":
            return True

        if move[0] == "draw":
            row_id = move[1]
            card = self._draw_card()
            if card is None:
                self._add_log(f"{self.players[cp - 1]} tried to draw but deck is empty.")
                return False
            self.rows[row_id].append(card)
            self._add_log(f"{self.players[cp - 1]} drew {card} and placed it in Row {row_id}.")
            return True

        elif move[0] == "take":
            row_id = move[1]
            taken = list(self.rows[row_id])
            self.collections[cp].extend(taken)
            self.rows[row_id] = []
            self.passed[cp] = True
            self._add_log(f"{self.players[cp - 1]} took Row {row_id}: [{', '.join(taken)}]")
            return True

        return False

    # -------------------------------------------------------- switch_player override

    def switch_player(self):
        """Override to handle passing and round resets."""
        # Check if all players have taken rows -- reset for new round
        if self._all_rows_taken():
            self._reset_round()
            self._add_log("All rows taken. New round begins.")
            # Player 1 starts the new round (or alternate based on who took last)
            self.current_player = 1
            return

        # Switch to the other player, but skip if they've already taken a row
        other = self._opponent()
        if not self.passed[other]:
            self.current_player = other
        # else: current player goes again (opponent is sitting out)

    # -------------------------------------------------------- check_game_over

    def check_game_over(self):
        # Game ends when last round is triggered AND all rows are taken
        # (or deck runs out completely)
        if self.last_round and self._all_rows_taken():
            self._end_game()
            return
        if not self.deck and self._all_rows_taken():
            self._end_game()
            return

    def _end_game(self):
        self.game_over = True
        s1 = self._score_collection(1)
        s2 = self._score_collection(2)
        if s1 > s2:
            self.winner = 1
        elif s2 > s1:
            self.winner = 2
        else:
            self.winner = None  # tie

    # -------------------------------------------------------- display final

    def display(self):
        cp = self.current_player
        opp = self._opponent()

        print(f"\n{'=' * 58}")
        title = "COLORETTO"
        if self.last_round:
            title += "  [LAST ROUND!]"
        print(f"  {title}  (Turn {self.turn_number + 1})")
        print(f"{'=' * 58}")

        # Opponent collection summary
        opp_colors = {}
        opp_wild = 0
        opp_plus2 = 0
        for c in self.collections[opp]:
            if c == "Wild":
                opp_wild += 1
            elif c == "+2":
                opp_plus2 += 1
            else:
                opp_colors[c] = opp_colors.get(c, 0) + 1

        print(f"\n  {self.players[opp - 1]}'s collection:")
        if opp_colors or opp_wild or opp_plus2:
            parts = []
            for color in sorted(opp_colors.keys()):
                parts.append(f"{color}:{opp_colors[color]}")
            if opp_wild:
                parts.append(f"Wild:{opp_wild}")
            if opp_plus2:
                parts.append(f"+2:{opp_plus2}")
            print(f"    {', '.join(parts)}")
        else:
            print("    (empty)")
        if self.passed[opp]:
            print("    [Sitting out - already took a row]")

        # Center rows
        print(f"\n  {'─' * 40}")
        print(f"  Center Rows (max 3 cards each):")
        for row_id in sorted(self.rows.keys()):
            cards = self.rows[row_id]
            card_str = ", ".join(cards) if cards else "(empty)"
            full = " [FULL]" if len(cards) >= 3 else ""
            print(f"    Row {row_id}: [{card_str}]{full}")
        print(f"  {'─' * 40}")

        # Deck info
        print(f"\n  Deck: {len(self.deck)} card(s) remaining")

        # Current player collection
        cp_colors = {}
        cp_wild = 0
        cp_plus2 = 0
        for c in self.collections[cp]:
            if c == "Wild":
                cp_wild += 1
            elif c == "+2":
                cp_plus2 += 1
            else:
                cp_colors[c] = cp_colors.get(c, 0) + 1

        print(f"\n  {self.players[cp - 1]}'s collection (you):")
        if cp_colors or cp_wild or cp_plus2:
            parts = []
            for color in sorted(cp_colors.keys()):
                parts.append(f"{color}:{cp_colors[color]}")
            if cp_wild:
                parts.append(f"Wild:{cp_wild}")
            if cp_plus2:
                parts.append(f"+2:{cp_plus2}")
            print(f"    {', '.join(parts)}")
        else:
            print("    (empty)")
        if self.passed[cp]:
            print("    [Sitting out - already took a row]")

        # Scores so far
        s1 = self._score_collection(1)
        s2 = self._score_collection(2)
        print(f"\n  Current scores:  {self.players[0]}: {s1}  |  {self.players[1]}: {s2}")

        # Show breakdown if game is over
        if self.game_over:
            print(f"\n  --- Final Scoring ---")
            for p in (1, 2):
                print(f"\n  {self.players[p - 1]}:")
                print(self._score_breakdown(p))
                print(f"    Total: {self._score_collection(p)} points")

        # Log
        if self.log:
            print(f"\n  --- Log ---")
            for line in self.log[-6:]:
                print(f"  {line}")

        print()

    # -------------------------------------------------------- save / load

    def get_state(self):
        return {
            "deck": list(self.deck),
            "rows": {str(k): list(v) for k, v in self.rows.items()},
            "num_rows": self.num_rows,
            "collections": {str(k): list(v) for k, v in self.collections.items()},
            "passed": {str(k): v for k, v in self.passed.items()},
            "last_round": self.last_round,
            "last_round_triggered": self.last_round_triggered,
            "log": list(self.log),
            "colors": list(self.colors) if self.colors else [],
        }

    def load_state(self, state):
        self.deck = list(state["deck"])
        self.rows = {int(k): list(v) for k, v in state["rows"].items()}
        self.num_rows = state.get("num_rows", self._num_rows())
        self.collections = {int(k): list(v) for k, v in state["collections"].items()}
        self.passed = {int(k): v for k, v in state["passed"].items()}
        self.last_round = state.get("last_round", False)
        self.last_round_triggered = state.get("last_round_triggered", False)
        self.log = list(state.get("log", []))
        self.colors = list(state.get("colors", self._colors()))

    # ------------------------------------------------------------ tutorial

    def get_tutorial(self):
        if self.variation == "simple":
            color_list = ", ".join(COLORS_SIMPLE)
            row_count = ROWS_SIMPLE
        else:
            color_list = ", ".join(COLORS_STANDARD)
            row_count = ROWS_STANDARD

        return (
            f"\n{'=' * 58}\n"
            f"  COLORETTO - Tutorial ({self.variation.title()})\n"
            f"{'=' * 58}\n\n"
            f"  OVERVIEW:\n"
            f"  Coloretto is a set collection card game for 2 players.\n"
            f"  Collect cards in different colors, but choose carefully --\n"
            f"  only your best 3 colors score positive points!\n\n"
            f"  COMPONENTS:\n"
            f"  - {len(self._colors())} colors ({color_list}), 9 cards each\n"
            f"  - 3 Wild cards (count as any color for scoring)\n"
            f"  - 2 '+2' cards (worth 2 bonus points each)\n"
            f"  - 1 'Last Round' card (shuffled near the bottom)\n"
            f"  - {row_count} row slots in the center (max 3 cards each)\n\n"
            f"  ON YOUR TURN (choose one):\n"
            f"  1. DRAW: Draw the top card from the deck and place it\n"
            f"     in any row that is not yet full (fewer than 3 cards).\n"
            f"     Type: draw <row number>\n\n"
            f"  2. TAKE: Take ALL cards from one non-empty row and add\n"
            f"     them to your collection. You then sit out until all\n"
            f"     rows have been taken, then a new round begins.\n"
            f"     Type: take <row number>\n\n"
            f"  ROUND FLOW:\n"
            f"  Players alternate turns. When a player takes a row,\n"
            f"  they sit out. Once all players have taken a row,\n"
            f"  the rows are cleared and a new round starts.\n\n"
            f"  GAME END:\n"
            f"  When the 'Last Round' card is drawn from the deck,\n"
            f"  the current round is the final round. Once all rows\n"
            f"  are taken, the game ends and scores are tallied.\n\n"
            f"  SCORING:\n"
            f"  - Pick your best 3 colors as POSITIVE.\n"
            f"  - All other colors score NEGATIVE.\n"
            f"  - Points by card count: 1->1, 2->3, 3->6, 4->10, 5->15, 6+->21\n"
            f"  - Wild cards are assigned to your best colors automatically.\n"
            f"  - Each '+2' card is worth +2 bonus points.\n"
            f"  - Highest total score wins!\n\n"
            f"  COMMANDS:\n"
            f"  'draw <row>'  - Draw a card and place in a row\n"
            f"  'take <row>'  - Take all cards from a row\n"
            f"  'quit'        - Exit game\n"
            f"  'save'        - Save and suspend game\n"
            f"  'help'        - Show help\n"
            f"  'tutorial'    - Show this tutorial\n"
            f"{'=' * 58}"
        )
