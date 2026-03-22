"""Calico - A tile-laying puzzle game about quilts and cats."""

import random

from engine.base import BaseGame, input_with_quit, clear_screen


# Fabric tile colors and patterns
COLORS = ["navy", "cyan", "lime", "pink", "gold", "plum"]
COLOR_CHARS = {"navy": "N", "cyan": "C", "lime": "L", "pink": "K", "gold": "G", "plum": "U"}
CHAR_TO_COLOR = {v: k for k, v in COLOR_CHARS.items()}

PATTERNS = ["dots", "stripes", "fern", "crosses", "flowers", "swirl"]
PATTERN_CHARS = {"dots": "o", "stripes": "/", "fern": "f", "crosses": "+", "flowers": "*", "swirl": "~"}
CHAR_TO_PATTERN = {v: k for k, v in PATTERN_CHARS.items()}

# Cats: each cat requires a specific pattern arrangement to attract
# Format: (name, required_pattern, group_size, points)
CATS = [
    {"name": "Millie", "pattern": "dots", "group_size": 3, "points": 3},
    {"name": "Tibbit", "pattern": "stripes", "group_size": 3, "points": 3},
    {"name": "Coconut", "pattern": "fern", "group_size": 3, "points": 3},
    {"name": "Cira", "pattern": "crosses", "group_size": 4, "points": 5},
    {"name": "Gwen", "pattern": "flowers", "group_size": 4, "points": 5},
    {"name": "Almond", "pattern": "swirl", "group_size": 4, "points": 5},
]

# Button scoring: groups of 3+ tiles of same color earn a button
BUTTON_SCORES = {3: 3, 4: 5, 5: 7, 6: 8, 7: 10}

# Design goals (placed on specific board cells as objectives)
DESIGN_GOALS = [
    {"name": "AAA-BBB", "desc": "Two groups of 3 matching (color or pattern)", "points": 7},
    {"name": "AA-BB-CC", "desc": "Three pairs of matching tiles", "points": 8},
    {"name": "All Different", "desc": "All 6 surrounding tiles different color", "points": 10},
    {"name": "Not All Same", "desc": "At least 4 of 6 tiles share a property", "points": 5},
]

# Board size
BOARD_ROWS = 5
BOARD_COLS = 5

# Simple variation: smaller board
SIMPLE_ROWS = 4
SIMPLE_COLS = 4


def _generate_tile_bag():
    """Generate the full bag of fabric tiles."""
    tiles = []
    tile_id = 0
    for color in COLORS:
        for pattern in PATTERNS:
            tiles.append({
                "id": tile_id,
                "color": color,
                "pattern": pattern,
            })
            tile_id += 1
            # Add a second copy for more variety
            tiles.append({
                "id": tile_id,
                "color": color,
                "pattern": pattern,
            })
            tile_id += 1
    return tiles


class CalicoGame(BaseGame):
    """Calico: Lay fabric tiles to make quilts, attract cats, and earn buttons."""

    name = "Calico"
    description = "A tile-laying puzzle game about quilts and cats"
    min_players = 2
    max_players = 2
    variations = {
        "standard": "Standard Calico (5x5 board, cats + buttons + goals)",
        "simple": "Simple mode (4x4 board, buttons only)",
    }

    def __init__(self, variation=None):
        super().__init__(variation)
        self.rows = BOARD_ROWS
        self.cols = BOARD_COLS
        # Player boards: grid of None or tile dicts
        self.boards = [[], []]
        # Player hands (3 tiles each)
        self.hands = [[], []]
        # Tile bag
        self.tile_bag = []
        # Market (3 face-up tiles to choose from)
        self.market = []
        # Design goal tiles on the board (positions and goals)
        self.design_goals = [{}, {}]
        # Active cats (earned by each player)
        self.earned_cats = [[], []]
        # Earned buttons per player
        self.earned_buttons = [[], []]
        self.scores = [0, 0]
        self.turns_taken = 0
        self.max_turns = 0

    def setup(self):
        """Initialize the game."""
        if self.variation == "simple":
            self.rows = SIMPLE_ROWS
            self.cols = SIMPLE_COLS
        else:
            self.rows = BOARD_ROWS
            self.cols = BOARD_COLS

        # Initialize empty boards
        self.boards = [
            [[None for _ in range(self.cols)] for _ in range(self.rows)]
            for _ in range(2)
        ]

        # Place design goals on board (standard only)
        self.design_goals = [{}, {}]
        if self.variation != "simple":
            goals = list(DESIGN_GOALS)
            random.shuffle(goals)
            # Place 3 design goals on specific cells for each player
            goal_positions = [(1, 1), (2, 3), (3, 1)]
            for p in range(2):
                for i, pos in enumerate(goal_positions):
                    self.design_goals[p][f"{pos[0]},{pos[1]}"] = goals[i % len(goals)]

        # Create and shuffle tile bag
        self.tile_bag = _generate_tile_bag()
        random.shuffle(self.tile_bag)

        # Deal 3 tiles to each player
        self.hands = [[], []]
        for p in range(2):
            for _ in range(3):
                if self.tile_bag:
                    self.hands[p].append(self.tile_bag.pop())

        # Set up market (3 tiles)
        self.market = []
        for _ in range(3):
            if self.tile_bag:
                self.market.append(self.tile_bag.pop())

        self.earned_cats = [[], []]
        self.earned_buttons = [[], []]
        self.scores = [0, 0]
        self.turns_taken = 0
        # Each player needs to fill the board minus design goal cells
        empty_cells = self.rows * self.cols
        if self.variation != "simple":
            empty_cells -= 3  # 3 goal cells
        self.max_turns = empty_cells * 2  # both players
        self.current_player = 1

    def display(self):
        """Display the game state."""
        var_label = "Standard" if self.variation != "simple" else "Simple"
        total_per_player = self.max_turns // 2
        turns_p = self.turns_taken // 2 + (1 if self.turns_taken % 2 == 1 else 0)
        print(f"\n  === Calico ({var_label}) === Turn {min(turns_p + 1, total_per_player)}/{total_per_player}")
        print(f"  Current: {self.players[self.current_player - 1]}")

        # Display market
        print("\n  --- Market ---")
        for i, tile in enumerate(self.market):
            c = COLOR_CHARS[tile["color"]]
            p = PATTERN_CHARS[tile["pattern"]]
            print(f"  Market {i + 1}: [{c}{p}] ({tile['color']} {tile['pattern']})")

        # Display both boards and hands
        for p in range(2):
            self._display_board(p)
            self._display_hand(p)

    def _display_board(self, p):
        """Display one player's quilt board."""
        print(f"\n  --- {self.players[p]}'s Quilt ---")
        print(f"  Cats earned: {', '.join(self.earned_cats[p]) if self.earned_cats[p] else 'none'}")
        buttons_pts = sum(BUTTON_SCORES.get(b, 0) for b in self.earned_buttons[p])
        print(f"  Buttons earned: {len(self.earned_buttons[p])} (worth {buttons_pts} pts)")

        # Column headers
        header = "       "
        for c in range(self.cols):
            header += f"  {c + 1}  "
        print(header)

        for r in range(self.rows):
            row_str = f"  {r + 1}:  "
            for c in range(self.cols):
                goal_key = f"{r},{c}"
                cell = self.boards[p][r][c]
                if cell is not None:
                    ch_c = COLOR_CHARS[cell["color"]]
                    ch_p = PATTERN_CHARS[cell["pattern"]]
                    row_str += f" [{ch_c}{ch_p}] "
                elif goal_key in self.design_goals[p]:
                    goal = self.design_goals[p][goal_key]
                    row_str += f" <{goal['name'][:2]}> "
                else:
                    row_str += "  ..  "
            print(row_str)

    def _display_hand(self, p):
        """Display a player's hand."""
        if self.current_player - 1 != p:
            print(f"  {self.players[p]}'s hand: (hidden)")
            return
        print(f"  {self.players[p]}'s hand:")
        for i, tile in enumerate(self.hands[p]):
            c = COLOR_CHARS[tile["color"]]
            pat = PATTERN_CHARS[tile["pattern"]]
            print(f"    Tile {i + 1}: [{c}{pat}] ({tile['color']} {tile['pattern']})")

    def get_move(self):
        """Get move from current player."""
        p = self.current_player - 1
        print(f"\n  {self.players[p]}, place a tile from your hand.")
        print("  Format: hand_num row col")
        print("  e.g. '2 3 4' = place hand tile 2 at row 3 col 4")
        print("  After placing, you'll pick a tile from the market.")
        move_str = input_with_quit("  Your move: ").strip()
        return move_str

    def make_move(self, move):
        """Apply a move. Returns True if valid."""
        p = self.current_player - 1

        try:
            parts = move.split()
            if len(parts) != 3:
                return False
            hand_idx = int(parts[0]) - 1
            row = int(parts[1]) - 1
            col = int(parts[2]) - 1
        except (ValueError, IndexError):
            return False

        # Validate hand index
        if hand_idx < 0 or hand_idx >= len(self.hands[p]):
            return False

        # Validate position
        if row < 0 or row >= self.rows or col < 0 or col >= self.cols:
            return False

        # Cell must be empty
        if self.boards[p][row][col] is not None:
            print("  That cell is already occupied.")
            return False

        # Cannot place on design goal cells (they are scored separately)
        goal_key = f"{row},{col}"
        if goal_key in self.design_goals[p]:
            print("  That cell has a design goal. Place around it, not on it.")
            return False

        # Place the tile
        tile = self.hands[p].pop(hand_idx)
        self.boards[p][row][col] = tile

        # Check for newly earned cats and buttons
        self._check_cats(p)
        self._check_buttons(p)

        # Pick a replacement tile from market
        if self.market:
            self._pick_from_market(p)

        self.turns_taken += 1
        return True

    def _pick_from_market(self, p):
        """Let the player pick a tile from the market."""
        if not self.market:
            return

        if len(self.market) == 1:
            # Auto-pick the only tile
            self.hands[p].append(self.market.pop(0))
        else:
            print(f"\n  Pick a tile from the market:")
            for i, tile in enumerate(self.market):
                c = COLOR_CHARS[tile["color"]]
                pat = PATTERN_CHARS[tile["pattern"]]
                print(f"    Market {i + 1}: [{c}{pat}] ({tile['color']} {tile['pattern']})")

            while True:
                try:
                    choice = input_with_quit("  Pick market tile (number): ").strip()
                    idx = int(choice) - 1
                    if 0 <= idx < len(self.market):
                        self.hands[p].append(self.market.pop(idx))
                        break
                    else:
                        print("  Invalid choice. Try again.")
                except ValueError:
                    print("  Enter a number.")

        # Refill market from bag
        while len(self.market) < 3 and self.tile_bag:
            self.market.append(self.tile_bag.pop())

    def _check_cats(self, p):
        """Check if player earned any new cats."""
        if self.variation == "simple":
            return

        board = self.boards[p]
        already_earned = set(self.earned_cats[p])

        for cat in CATS:
            if cat["name"] in already_earned:
                continue
            # Find groups of the required pattern
            groups = self._find_pattern_groups(board, cat["pattern"])
            for group in groups:
                if len(group) >= cat["group_size"]:
                    self.earned_cats[p].append(cat["name"])
                    already_earned.add(cat["name"])
                    break

    def _find_pattern_groups(self, board, pattern):
        """Find contiguous groups of tiles with the given pattern."""
        visited = set()
        groups = []
        for r in range(self.rows):
            for c in range(self.cols):
                if (r, c) in visited:
                    continue
                if board[r][c] is None:
                    continue
                if board[r][c]["pattern"] != pattern:
                    continue
                # BFS
                group = []
                queue = [(r, c)]
                while queue:
                    cr, cc = queue.pop(0)
                    if (cr, cc) in visited:
                        continue
                    if cr < 0 or cr >= self.rows or cc < 0 or cc >= self.cols:
                        continue
                    if board[cr][cc] is None:
                        continue
                    if board[cr][cc]["pattern"] != pattern:
                        continue
                    visited.add((cr, cc))
                    group.append((cr, cc))
                    for dr, dc in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
                        nr, nc = cr + dr, cc + dc
                        if (nr, nc) not in visited:
                            queue.append((nr, nc))
                if group:
                    groups.append(group)
        return groups

    def _check_buttons(self, p):
        """Check if player earned any new buttons (color groups of 3+)."""
        board = self.boards[p]
        # Find all color groups
        visited = set()
        for r in range(self.rows):
            for c in range(self.cols):
                if (r, c) in visited:
                    continue
                if board[r][c] is None:
                    continue
                color = board[r][c]["color"]
                # BFS for same-color group
                group = []
                queue = [(r, c)]
                while queue:
                    cr, cc = queue.pop(0)
                    if (cr, cc) in visited:
                        continue
                    if cr < 0 or cr >= self.rows or cc < 0 or cc >= self.cols:
                        continue
                    if board[cr][cc] is None:
                        continue
                    if board[cr][cc]["color"] != color:
                        continue
                    visited.add((cr, cc))
                    group.append((cr, cc))
                    for dr, dc in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
                        nr, nc = cr + dr, cc + dc
                        if (nr, nc) not in visited:
                            queue.append((nr, nc))

                # Award button for groups of 3+
                if len(group) >= 3:
                    # Check if this group already earned a button
                    group_key = tuple(sorted(group))
                    already = any(
                        tuple(sorted(b_group)) == group_key
                        for b_group in self.earned_buttons[p]
                        if isinstance(b_group, list)
                    )
                    if not already:
                        self.earned_buttons[p].append(len(group))

    def _score_design_goals(self, p):
        """Score design goals for a player."""
        board = self.boards[p]
        score = 0
        for key, goal in self.design_goals[p].items():
            r, c = map(int, key.split(","))
            # Get surrounding tiles (orthogonal neighbors)
            neighbors = []
            for dr, dc in [(-1, 0), (1, 0), (0, -1), (0, 1), (-1, -1), (1, 1)]:
                nr, nc = r + dr, c + dc
                if 0 <= nr < self.rows and 0 <= nc < self.cols and board[nr][nc]:
                    neighbors.append(board[nr][nc])

            if not neighbors:
                continue

            if goal["name"] == "All Different":
                colors = [n["color"] for n in neighbors]
                if len(set(colors)) == len(colors) and len(colors) >= 4:
                    score += goal["points"]
            elif goal["name"] == "Not All Same":
                colors = [n["color"] for n in neighbors]
                from collections import Counter
                counts = Counter(colors)
                if counts.most_common(1)[0][1] >= 4:
                    score += goal["points"]
            elif goal["name"] == "AAA-BBB":
                colors = [n["color"] for n in neighbors]
                from collections import Counter
                counts = Counter(colors)
                groups_of_3 = sum(1 for cnt in counts.values() if cnt >= 3)
                if groups_of_3 >= 2:
                    score += goal["points"]
            elif goal["name"] == "AA-BB-CC":
                colors = [n["color"] for n in neighbors]
                from collections import Counter
                counts = Counter(colors)
                pairs = sum(1 for cnt in counts.values() if cnt >= 2)
                if pairs >= 3:
                    score += goal["points"]

        return score

    def check_game_over(self):
        """Check if all cells are filled."""
        if self.turns_taken >= self.max_turns:
            self.game_over = True
            # Final scoring
            for p in range(2):
                score = 0

                # Cat points
                for cat_name in self.earned_cats[p]:
                    for cat in CATS:
                        if cat["name"] == cat_name:
                            score += cat["points"]

                # Button points
                for size in self.earned_buttons[p]:
                    score += BUTTON_SCORES.get(size, BUTTON_SCORES.get(min(size, 7), 0))

                # Design goal points
                if self.variation != "simple":
                    score += self._score_design_goals(p)

                self.scores[p] = score

            if self.scores[0] > self.scores[1]:
                self.winner = 1
            elif self.scores[1] > self.scores[0]:
                self.winner = 2
            else:
                self.winner = None

            print(f"\n  Final Scores:")
            for p in range(2):
                print(f"  {self.players[p]}: {self.scores[p]} pts")
                if self.earned_cats[p]:
                    print(f"    Cats: {', '.join(self.earned_cats[p])}")
                print(f"    Buttons: {len(self.earned_buttons[p])}")

    def get_state(self):
        """Return serializable game state."""
        def serialize_board(board):
            result = []
            for row in board:
                result.append([cell if cell else None for cell in row])
            return result

        return {
            "boards": [serialize_board(b) for b in self.boards],
            "hands": [list(h) for h in self.hands],
            "tile_bag": list(self.tile_bag),
            "market": list(self.market),
            "design_goals": [dict(dg) for dg in self.design_goals],
            "earned_cats": [list(ec) for ec in self.earned_cats],
            "earned_buttons": [list(eb) for eb in self.earned_buttons],
            "scores": list(self.scores),
            "turns_taken": self.turns_taken,
            "max_turns": self.max_turns,
            "rows": self.rows,
            "cols": self.cols,
        }

    def load_state(self, state):
        """Restore game state."""
        self.boards = [
            [[cell if cell else None for cell in row] for row in b]
            for b in state["boards"]
        ]
        self.hands = [list(h) for h in state["hands"]]
        self.tile_bag = list(state["tile_bag"])
        self.market = list(state["market"])
        self.design_goals = [dict(dg) for dg in state["design_goals"]]
        self.earned_cats = [list(ec) for ec in state["earned_cats"]]
        self.earned_buttons = [list(eb) for eb in state["earned_buttons"]]
        self.scores = list(state["scores"])
        self.turns_taken = state["turns_taken"]
        self.max_turns = state["max_turns"]
        self.rows = state["rows"]
        self.cols = state["cols"]

    def get_tutorial(self):
        """Return tutorial text."""
        return """
==================================================
  Calico - Tutorial
==================================================

  OVERVIEW:
  Calico is a tile-laying puzzle game where you
  sew a beautiful quilt to attract cats and earn
  buttons. Place fabric tiles on your personal
  board, matching colors and patterns strategically.

  TILES:
  Each tile has a COLOR and a PATTERN:
  Colors: N=Navy, C=Cyan, L=Lime, K=Pink, G=Gold, U=Plum
  Patterns: o=Dots, /=Stripes, f=Fern, +=Crosses,
            *=Flowers, ~=Swirl

  Tiles are shown as [Cp] where C=color, p=pattern.
  Example: [No] = Navy Dots, [L/] = Lime Stripes

  HOW TO PLAY:
  1. On your turn, place one tile from your hand
     onto an empty cell on your quilt board.
  2. Then pick a replacement tile from the market.
  3. The market is refilled from the bag.

  MOVE FORMAT:
  hand_num row col
  - hand_num: which tile from your hand (1-3)
  - row: row on your board (1-5)
  - col: column on your board (1-5)

  Example: "2 3 4" = place your 2nd hand tile at
  row 3, column 4.

  SCORING:

  BUTTONS (both modes):
  Create a contiguous group of 3+ tiles of the
  SAME COLOR to earn a button.
  3 tiles = 3 pts, 4 = 5 pts, 5 = 7 pts,
  6 = 8 pts, 7+ = 10 pts

  CATS (standard only):
  Each cat requires a contiguous group of tiles
  with a specific PATTERN:
  - Millie (dots, 3 tiles) = 3 pts
  - Tibbit (stripes, 3 tiles) = 3 pts
  - Coconut (fern, 3 tiles) = 3 pts
  - Cira (crosses, 4 tiles) = 5 pts
  - Gwen (flowers, 4 tiles) = 5 pts
  - Almond (swirl, 4 tiles) = 5 pts

  DESIGN GOALS (standard only):
  Special cells on the board marked with <XX>.
  Score bonus points based on tiles surrounding
  the goal cell.

  GAME LENGTH:
  Standard: 22 tile placements per player (5x5
  board minus 3 goal cells).
  Simple: 16 placements per player (4x4 board).

  Highest total score wins!

==================================================
"""
