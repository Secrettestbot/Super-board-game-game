"""Isle of Cats - A card-drafting and polyomino tile-placement game."""

import random

from engine.base import BaseGame, input_with_quit, clear_screen


# Boat grid dimensions
BOAT_ROWS = 7
BOAT_COLS = 11

# Room definitions: each room is a rectangular region on the boat
# Rooms are defined by (top_row, left_col, height, width)
ROOMS = [
    {"name": "Bow", "top": 0, "left": 0, "height": 3, "width": 4},
    {"name": "Upper Deck", "top": 0, "left": 4, "height": 3, "width": 4},
    {"name": "Bridge", "top": 0, "left": 8, "height": 3, "width": 3},
    {"name": "Lower Hold", "top": 3, "left": 0, "height": 4, "width": 4},
    {"name": "Cargo Bay", "top": 3, "left": 4, "height": 4, "width": 4},
    {"name": "Stern", "top": 3, "left": 8, "height": 4, "width": 3},
]

# Cat colors
CAT_COLORS = ["Red", "Blue", "Green", "Purple", "Orange"]
CAT_SYMBOLS = {"Red": "R", "Blue": "B", "Green": "G", "Purple": "P", "Orange": "O"}

# Polyomino cat shapes (each is a list of (row_offset, col_offset) from anchor)
CAT_SHAPES = [
    # Shape 0: single square
    {"name": "Kitten", "cells": [(0, 0)], "size": 1},
    # Shape 1: domino horizontal
    {"name": "Pair-H", "cells": [(0, 0), (0, 1)], "size": 2},
    # Shape 2: domino vertical
    {"name": "Pair-V", "cells": [(0, 0), (1, 0)], "size": 2},
    # Shape 3: L-shape
    {"name": "L-Cat", "cells": [(0, 0), (1, 0), (1, 1)], "size": 3},
    # Shape 4: line of 3 horizontal
    {"name": "Row-Cat", "cells": [(0, 0), (0, 1), (0, 2)], "size": 3},
    # Shape 5: line of 3 vertical
    {"name": "Col-Cat", "cells": [(0, 0), (1, 0), (2, 0)], "size": 3},
    # Shape 6: T-shape
    {"name": "T-Cat", "cells": [(0, 0), (0, 1), (0, 2), (1, 1)], "size": 4},
    # Shape 7: S-shape
    {"name": "S-Cat", "cells": [(0, 1), (0, 2), (1, 0), (1, 1)], "size": 4},
    # Shape 8: square 2x2
    {"name": "Fat-Cat", "cells": [(0, 0), (0, 1), (1, 0), (1, 1)], "size": 4},
    # Shape 9: Z-shape
    {"name": "Z-Cat", "cells": [(0, 0), (0, 1), (1, 1), (1, 2)], "size": 4},
    # Shape 10: L-shape (big)
    {"name": "Big-L", "cells": [(0, 0), (1, 0), (2, 0), (2, 1)], "size": 4},
    # Shape 11: line of 4 horizontal
    {"name": "Long-H", "cells": [(0, 0), (0, 1), (0, 2), (0, 3)], "size": 4},
    # Shape 12: line of 4 vertical
    {"name": "Long-V", "cells": [(0, 0), (1, 0), (2, 0), (3, 0)], "size": 4},
    # Shape 13: plus sign (5 cells)
    {"name": "Plus-Cat", "cells": [(0, 1), (1, 0), (1, 1), (1, 2), (2, 1)], "size": 5},
]

# Lesson cards (scoring conditions)
LESSON_CARDS = [
    {"name": "Colorful Collection", "description": "2 pts per color with 3+ cats",
     "score_type": "color_threshold", "threshold": 3, "per_match": 2},
    {"name": "Row Master", "description": "1 pt per fully filled row on your boat",
     "score_type": "full_rows", "per_match": 1},
    {"name": "Column Master", "description": "2 pts per fully filled column",
     "score_type": "full_cols", "per_match": 2},
    {"name": "Small Families", "description": "1 pt per cat family of exactly 2",
     "score_type": "family_size", "target_size": 2, "per_match": 1},
    {"name": "Big Families", "description": "3 pts per cat family of 5+",
     "score_type": "family_size", "target_size": 5, "per_match": 3},
    {"name": "Cat Collector", "description": "1 pt per 3 cats on your boat",
     "score_type": "total_cats", "divisor": 3, "per_match": 1},
    {"name": "Room Filler", "description": "3 pts per completely filled room",
     "score_type": "full_rooms", "per_match": 3},
    {"name": "Rare Cats", "description": "2 pts per color with exactly 1 cat",
     "score_type": "color_threshold_exact", "threshold": 1, "per_match": 2},
]


def _copy_dict(d):
    return {k: v for k, v in d.items()}


class IsleOfCatsGame(BaseGame):
    """Isle of Cats: Draft cards, rescue cats, and fill your boat."""

    name = "Isle of Cats"
    description = "A card-drafting and polyomino tile-placement game"
    min_players = 2
    max_players = 2
    variations = {
        "standard": "Standard game (5 rounds, card drafting, lessons)",
        "family": "Family mode (no drafting, auto-draw cats, simplified scoring)",
    }

    def __init__(self, variation=None):
        super().__init__(variation)
        self.boats = [None, None]  # 2D grids for each player
        self.fish = [0, 0]  # currency
        self.hands = [[], []]  # drafted cards
        self.lessons = [[], []]  # active lesson cards per player
        self.available_cats = []  # cats available to rescue this round
        self.draft_pool = []  # cards for drafting
        self.round_number = 0
        self.max_rounds = 5
        self.phase = "drafting"  # drafting, rescue, or scoring
        self.scores = [0, 0]
        self.draft_hands = [[], []]  # hands being drafted
        self.draft_step = 0

    def setup(self):
        family = self.variation == "family"
        self.max_rounds = 5

        # Initialize boats - '.' for empty
        for p in range(2):
            self.boats[p] = [['.' for _ in range(BOAT_COLS)] for _ in range(BOAT_ROWS)]

        # Starting fish
        self.fish = [20, 20]

        self.hands = [[], []]
        self.lessons = [[], []]
        self.available_cats = []
        self.round_number = 0
        self.scores = [0, 0]

        if family:
            # Family mode: give each player 2 random lessons automatically
            lessons = list(LESSON_CARDS)
            random.shuffle(lessons)
            self.lessons[0] = [_copy_dict(lessons[0])]
            self.lessons[1] = [_copy_dict(lessons[1])]

        self._start_new_round()

    def _generate_cat_tile(self):
        """Generate a random cat tile."""
        color = random.choice(CAT_COLORS)
        shape = random.choice(CAT_SHAPES)
        return {
            "color": color,
            "shape_name": shape["name"],
            "cells": list(shape["cells"]),
            "size": shape["size"],
        }

    def _start_new_round(self):
        self.round_number += 1
        family = self.variation == "family"

        # Generate available cats for rescue
        num_cats = 6 if not family else 8
        self.available_cats = [self._generate_cat_tile() for _ in range(num_cats)]

        if family:
            # Family mode: skip drafting, go straight to rescue
            self.phase = "rescue"
            # Give each player some fish income
            self.fish[0] += 5
            self.fish[1] += 5
        else:
            # Standard: drafting phase
            self.phase = "drafting"
            self._setup_draft()

    def _setup_draft(self):
        """Set up card drafting for standard mode."""
        # Generate draft cards: mix of lesson cards and fish cards
        draft_cards = []
        # Add some lesson cards
        lessons = list(LESSON_CARDS)
        random.shuffle(lessons)
        for lesson in lessons[:4]:
            card = _copy_dict(lesson)
            card["card_type"] = "lesson"
            draft_cards.append(card)
        # Add fish cards
        for _ in range(3):
            draft_cards.append({"card_type": "fish", "name": "Fish Haul",
                                "description": "Gain 5 fish", "fish": 5})
        for _ in range(3):
            draft_cards.append({"card_type": "fish", "name": "Small Catch",
                                "description": "Gain 3 fish", "fish": 3})
        # Add rescue speed boost cards
        for _ in range(4):
            draft_cards.append({"card_type": "speed", "name": "Speed Boat",
                                "description": "Rescue 1 extra cat this round",
                                "bonus_rescues": 1})

        random.shuffle(draft_cards)

        # Deal 7 cards to each player for drafting
        cards_per_player = min(7, len(draft_cards) // 2)
        self.draft_hands[0] = draft_cards[:cards_per_player]
        self.draft_hands[1] = draft_cards[cards_per_player:cards_per_player * 2]
        self.draft_step = 0
        self.hands = [[], []]  # reset hands for new round

    def _cells_str(self, cells):
        """Format cells as a readable string."""
        return "+".join(f"({r},{c})" for r, c in cells)

    def _display_boat(self, p):
        """Display a player's boat grid with room outlines."""
        print(f"       ", end="")
        for c in range(BOAT_COLS):
            print(f"{c:2}", end="")
        print()
        for r in range(BOAT_ROWS):
            print(f"    {r}: ", end="")
            for c in range(BOAT_COLS):
                cell = self.boats[p][r][c]
                if cell == '.':
                    print(" .", end="")
                else:
                    print(f" {cell}", end="")
            print()

    def _display_cat_tile(self, idx, cat):
        """Display a cat tile info."""
        sym = CAT_SYMBOLS[cat["color"]]
        print(f"    [{idx + 1}] {cat['color']} {cat['shape_name']} "
              f"(size {cat['size']}) cells: {self._cells_str(cat['cells'])}")

    def display(self):
        mode = "Standard" if self.variation != "family" else "Family"
        print(f"\n  === Isle of Cats ({mode}) === "
              f"Round {self.round_number}/{self.max_rounds}")
        print(f"  Phase: {self.phase.upper()}")
        print(f"  {self.players[0]}: {self.scores[0]} pts, {self.fish[0]} fish  |  "
              f"{self.players[1]}: {self.scores[1]} pts, {self.fish[1]} fish")
        print(f"  Current turn: {self.players[self.current_player - 1]}")

        if self.phase == "drafting":
            p = self.current_player - 1
            print(f"\n  --- Draft Hand (pick 1 card, pass the rest) ---")
            print(f"  Draft step {self.draft_step + 1}")
            for i, card in enumerate(self.draft_hands[p]):
                ctype = card.get("card_type", "?")
                if ctype == "lesson":
                    print(f"    [{i + 1}] LESSON: {card['name']} - {card['description']}")
                elif ctype == "fish":
                    print(f"    [{i + 1}] FISH: {card['name']} - {card['description']}")
                elif ctype == "speed":
                    print(f"    [{i + 1}] SPEED: {card['name']} - {card['description']}")

        if self.phase == "rescue":
            print(f"\n  --- Available Cats to Rescue ---")
            if not self.available_cats:
                print("    (none left)")
            for i, cat in enumerate(self.available_cats):
                self._display_cat_tile(i, cat)

        # Show both players' boats
        for p in range(2):
            marker = " <<" if p == self.current_player - 1 else ""
            print(f"\n  --- {self.players[p]} (P{p + 1}) Boat --- "
                  f"{self.scores[p]} pts | {self.fish[p]} fish{marker}")
            self._display_boat(p)

            # Show lessons
            if self.lessons[p]:
                print(f"  Lessons:")
                for lesson in self.lessons[p]:
                    print(f"    - {lesson['name']}: {lesson['description']}")

            # Show held cards in rescue phase
            if self.phase == "rescue" and p == self.current_player - 1:
                speed_cards = [c for c in self.hands[p] if c.get("card_type") == "speed"]
                if speed_cards:
                    print(f"  Speed cards: {len(speed_cards)} (extra rescues)")

    def get_move(self):
        p = self.current_player - 1

        if self.phase == "drafting":
            print(f"\n  {self.players[p]}, pick a card to keep:")
            print("    draft N  - keep card N from your draft hand")
            move_str = input_with_quit("  Your move: ").strip()
            return move_str

        elif self.phase == "rescue":
            print(f"\n  {self.players[p]}, rescue a cat or pass:")
            print("    rescue N R C    - rescue cat N, place at row R col C")
            print("    rotate N        - rotate cat N 90 degrees clockwise")
            print("    flip N          - flip cat N horizontally")
            print(f"    pass            - done rescuing (cost: 3 fish per cat)")
            print(f"  Fish available: {self.fish[p]}")
            move_str = input_with_quit("  Your move: ").strip()
            return move_str

        return input_with_quit("  Your move: ").strip()

    def _can_place_cat(self, p, cat, row, col):
        """Check if a cat tile can be placed at the given position."""
        for dr, dc in cat["cells"]:
            r, c = row + dr, col + dc
            if r < 0 or r >= BOAT_ROWS or c < 0 or c >= BOAT_COLS:
                return False
            if self.boats[p][r][c] != '.':
                return False
        return True

    def _place_cat(self, p, cat, row, col):
        """Place a cat tile on the boat."""
        sym = CAT_SYMBOLS[cat["color"]]
        for dr, dc in cat["cells"]:
            r, c = row + dr, col + dc
            self.boats[p][r][c] = sym

    def _rotate_cells(self, cells):
        """Rotate cells 90 degrees clockwise around origin."""
        rotated = [(dc, -dr) for dr, dc in cells]
        # Normalize to non-negative coordinates
        min_r = min(r for r, c in rotated)
        min_c = min(c for r, c in rotated)
        return [(r - min_r, c - min_c) for r, c in rotated]

    def _flip_cells(self, cells):
        """Flip cells horizontally."""
        max_c = max(c for r, c in cells)
        return [(r, max_c - c) for r, c in cells]

    def make_move(self, move):
        p = self.current_player - 1
        parts = move.strip().split()
        if not parts:
            return False

        action = parts[0].lower()

        # === DRAFTING PHASE ===
        if self.phase == "drafting":
            if action == "draft":
                if len(parts) != 2:
                    return False
                try:
                    idx = int(parts[1]) - 1
                except ValueError:
                    return False
                if idx < 0 or idx >= len(self.draft_hands[p]):
                    print("  Invalid card number.")
                    return False

                card = self.draft_hands[p].pop(idx)
                # Apply card effect
                ctype = card.get("card_type", "")
                if ctype == "lesson":
                    self.lessons[p].append(card)
                elif ctype == "fish":
                    self.fish[p] += card.get("fish", 0)
                elif ctype == "speed":
                    self.hands[p].append(card)

                # Check if this is a simultaneous pick (both players pick from
                # their own hand). For simplicity, alternate turns.
                # After both players have drafted, swap remaining hands.
                if self.current_player == 2:
                    # Both have picked - swap remaining draft hands
                    self.draft_hands[0], self.draft_hands[1] = (
                        self.draft_hands[1], self.draft_hands[0]
                    )
                    self.draft_step += 1

                    # Check if drafting is done
                    if (not self.draft_hands[0] and not self.draft_hands[1]) or \
                       self.draft_step >= 7:
                        self.phase = "rescue"

                return True
            return False

        # === RESCUE PHASE ===
        if self.phase == "rescue":
            if action == "rescue":
                if len(parts) != 4:
                    print("  Format: rescue N R C")
                    return False
                try:
                    cat_idx = int(parts[1]) - 1
                    row = int(parts[2])
                    col = int(parts[3])
                except ValueError:
                    return False
                if cat_idx < 0 or cat_idx >= len(self.available_cats):
                    print("  Invalid cat number.")
                    return False
                # Cost to rescue a cat
                cost = 3
                if self.fish[p] < cost:
                    print(f"  Not enough fish (need {cost}, have {self.fish[p]}).")
                    return False
                cat = self.available_cats[cat_idx]
                if not self._can_place_cat(p, cat, row, col):
                    print("  Cannot place cat there (out of bounds or overlapping).")
                    return False

                self.fish[p] -= cost
                self._place_cat(p, cat, row, col)
                self.available_cats.pop(cat_idx)
                self._calc_scores()
                return True

            elif action == "rotate":
                if len(parts) != 2:
                    return False
                try:
                    cat_idx = int(parts[1]) - 1
                except ValueError:
                    return False
                if cat_idx < 0 or cat_idx >= len(self.available_cats):
                    print("  Invalid cat number.")
                    return False
                cat = self.available_cats[cat_idx]
                cat["cells"] = self._rotate_cells(cat["cells"])
                # Rotation doesn't consume a turn
                return True

            elif action == "flip":
                if len(parts) != 2:
                    return False
                try:
                    cat_idx = int(parts[1]) - 1
                except ValueError:
                    return False
                if cat_idx < 0 or cat_idx >= len(self.available_cats):
                    print("  Invalid cat number.")
                    return False
                cat = self.available_cats[cat_idx]
                cat["cells"] = self._flip_cells(cat["cells"])
                return True

            elif action == "pass":
                # Player is done rescuing for this round
                if self.current_player == 2:
                    # Both players have passed - end round
                    self._calc_scores()
                    if self.round_number >= self.max_rounds:
                        self._final_scoring()
                    else:
                        self._start_new_round()
                return True

            return False

        return False

    def _count_families(self, p):
        """Find connected groups of same-color cats using flood fill."""
        visited = [[False] * BOAT_COLS for _ in range(BOAT_ROWS)]
        families = {}  # color -> list of family sizes

        for r in range(BOAT_ROWS):
            for c in range(BOAT_COLS):
                cell = self.boats[p][r][c]
                if cell == '.' or visited[r][c]:
                    continue
                # Flood fill to find connected group
                size = 0
                stack = [(r, c)]
                while stack:
                    cr, cc = stack.pop()
                    if (cr < 0 or cr >= BOAT_ROWS or cc < 0 or cc >= BOAT_COLS):
                        continue
                    if visited[cr][cc]:
                        continue
                    if self.boats[p][cr][cc] != cell:
                        continue
                    visited[cr][cc] = True
                    size += 1
                    stack.extend([(cr - 1, cc), (cr + 1, cc),
                                  (cr, cc - 1), (cr, cc + 1)])
                # Find original color name from symbol
                color_name = None
                for name, sym in CAT_SYMBOLS.items():
                    if sym == cell:
                        color_name = name
                        break
                if color_name:
                    if color_name not in families:
                        families[color_name] = []
                    families[color_name].append(size)

        return families

    def _count_total_cats(self, p):
        count = 0
        for r in range(BOAT_ROWS):
            for c in range(BOAT_COLS):
                if self.boats[p][r][c] != '.':
                    count += 1
        return count

    def _is_room_filled(self, p, room):
        for r in range(room["top"], room["top"] + room["height"]):
            for c in range(room["left"], room["left"] + room["width"]):
                if r < BOAT_ROWS and c < BOAT_COLS:
                    if self.boats[p][r][c] == '.':
                        return False
        return True

    def _score_lesson(self, p, lesson):
        score_type = lesson.get("score_type", "")
        per_match = lesson.get("per_match", 0)

        if score_type == "color_threshold":
            families = self._count_families(p)
            threshold = lesson.get("threshold", 3)
            count = 0
            for color, sizes in families.items():
                total = sum(sizes)
                if total >= threshold:
                    count += 1
            return count * per_match

        elif score_type == "color_threshold_exact":
            families = self._count_families(p)
            threshold = lesson.get("threshold", 1)
            count = 0
            for color, sizes in families.items():
                total = sum(sizes)
                if total == threshold:
                    count += 1
            return count * per_match

        elif score_type == "full_rows":
            count = 0
            for r in range(BOAT_ROWS):
                if all(self.boats[p][r][c] != '.' for c in range(BOAT_COLS)):
                    count += 1
            return count * per_match

        elif score_type == "full_cols":
            count = 0
            for c in range(BOAT_COLS):
                if all(self.boats[p][r][c] != '.' for r in range(BOAT_ROWS)):
                    count += 1
            return count * per_match

        elif score_type == "family_size":
            families = self._count_families(p)
            target = lesson.get("target_size", 2)
            count = 0
            for color, sizes in families.items():
                for s in sizes:
                    if target >= 5:
                        if s >= target:
                            count += 1
                    else:
                        if s == target:
                            count += 1
            return count * per_match

        elif score_type == "total_cats":
            total = self._count_total_cats(p)
            divisor = lesson.get("divisor", 3)
            return (total // divisor) * per_match

        elif score_type == "full_rooms":
            count = 0
            for room in ROOMS:
                if self._is_room_filled(p, room):
                    count += 1
            return count * per_match

        return 0

    def _calc_scores(self):
        for p in range(2):
            total = 0

            # Family scoring: each family of connected same-color cats
            families = self._count_families(p)
            for color, sizes in families.items():
                for size in sizes:
                    # Points based on family size
                    if size == 1:
                        total += 1
                    elif size == 2:
                        total += 3
                    elif size == 3:
                        total += 5
                    elif size == 4:
                        total += 7
                    elif size >= 5:
                        total += 7 + (size - 4) * 2

            # Room bonus: 5 points per completely filled room
            for room in ROOMS:
                if self._is_room_filled(p, room):
                    total += 5

            # Empty space penalty: -1 per empty space
            for r in range(BOAT_ROWS):
                for c in range(BOAT_COLS):
                    if self.boats[p][r][c] == '.':
                        total -= 1

            # Lesson scoring
            for lesson in self.lessons[p]:
                total += self._score_lesson(p, lesson)

            self.scores[p] = total

    def _final_scoring(self):
        """Apply final scoring and determine winner."""
        self._calc_scores()
        self.game_over = True
        if self.scores[0] > self.scores[1]:
            self.winner = 1
        elif self.scores[1] > self.scores[0]:
            self.winner = 2
        else:
            # Tie-break: most fish remaining
            if self.fish[0] > self.fish[1]:
                self.winner = 1
            elif self.fish[1] > self.fish[0]:
                self.winner = 2
            else:
                self.winner = None

    def check_game_over(self):
        # Game over is handled in make_move when rounds complete
        pass

    def get_state(self):
        return {
            "boats": [[list(row) for row in self.boats[p]] for p in range(2)],
            "fish": list(self.fish),
            "hands": [[_copy_dict(c) for c in h] for h in self.hands],
            "lessons": [[_copy_dict(l) for l in ls] for ls in self.lessons],
            "available_cats": [_copy_dict(c) for c in self.available_cats],
            "draft_hands": [[_copy_dict(c) for c in dh] for dh in self.draft_hands],
            "draft_step": self.draft_step,
            "round_number": self.round_number,
            "max_rounds": self.max_rounds,
            "phase": self.phase,
            "scores": list(self.scores),
        }

    def load_state(self, state):
        self.boats = [[list(row) for row in state["boats"][p]] for p in range(2)]
        self.fish = list(state["fish"])
        self.hands = [[_copy_dict(c) for c in h] for h in state["hands"]]
        self.lessons = [[_copy_dict(l) for l in ls] for ls in state["lessons"]]
        self.available_cats = [_copy_dict(c) for c in state["available_cats"]]
        self.draft_hands = [[_copy_dict(c) for c in dh] for dh in state["draft_hands"]]
        self.draft_step = state["draft_step"]
        self.round_number = state["round_number"]
        self.max_rounds = state["max_rounds"]
        self.phase = state["phase"]
        self.scores = list(state["scores"])

    def get_tutorial(self):
        return """
==================================================
  Isle of Cats - Tutorial
==================================================

  OVERVIEW:
  Isle of Cats is a card-drafting and polyomino
  tile-placement game. You are rescuing cats from
  an island and placing them onto your boat. Score
  points by forming families of same-colored cats,
  filling rooms on your boat, and completing lessons.

  THE BOAT:
  Your boat is a 7x11 grid divided into 6 rooms.
  Empty spaces at the end of the game cost -1 point
  each, so try to fill as much as possible.

  CAT COLORS:
  R = Red, B = Blue, G = Green, P = Purple, O = Orange

  CAT TILES:
  Cats come in various polyomino shapes (1-5 cells).
  You can ROTATE and FLIP them before placing.
  Each cat costs 3 fish to rescue.

  GAME FLOW (5 rounds):

  1. DRAFTING PHASE (standard mode only):
     You are dealt a hand of cards. Pick one to keep,
     then pass the rest to your opponent. Repeat.
     Card types:
     - LESSON: End-game scoring condition
     - FISH: Gain extra fish for rescuing cats
     - SPEED: Rescue extra cats this round
     Command: draft N

  2. RESCUE PHASE:
     Take turns rescuing cats from the available pool.
     Each rescue costs 3 fish. Place the cat tile on
     your boat grid.
     Commands:
     - rescue N R C  (cat N at row R, col C)
     - rotate N      (rotate cat N before placing)
     - flip N        (flip cat N before placing)
     - pass          (done rescuing this round)

  SCORING:
  Cat Families (connected same-color groups):
    1 cat  = 1 pt     4 cats = 7 pts
    2 cats = 3 pts    5+ cats = 7 + 2 per extra
    3 cats = 5 pts

  Room Bonus: +5 pts per completely filled room
  Empty Penalty: -1 pt per empty boat space
  Lesson Cards: Bonus points for meeting conditions

  FAMILY MODE:
  - No card drafting (simplified)
  - More cats available each round
  - Automatic fish income each round
  - Start with 1 random lesson each

  STRATEGY:
  - Group same-colored cats together for family pts
  - Fill entire rooms for the +5 bonus
  - Minimize empty spaces to avoid penalties
  - Pick lessons that match your placement strategy
  - Balance fish spending across all 5 rounds
  - Larger polyomino shapes cover more area but
    are harder to fit

  COORDINATES:
  Rows are 0-6 (top to bottom)
  Columns are 0-10 (left to right)
  When placing, specify the top-left anchor point.

==================================================
"""
