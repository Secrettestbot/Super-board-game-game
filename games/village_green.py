"""Village Green - Card-laying village competition."""

import random
from engine.base import BaseGame, input_with_quit, clear_screen

BOLD = "\033[1m"
DIM = "\033[2m"
RESET = "\033[0m"
GREEN = "\033[92m"
BLUE = "\033[94m"
YELLOW = "\033[93m"
RED = "\033[91m"
CYAN = "\033[96m"
MAGENTA = "\033[95m"

# Feature cards with adjacency preferences
FEATURE_CARDS = [
    {"name": "Pond", "symbol": "~", "color": BLUE, "base_pts": 2,
     "likes": ["Flowers", "Tree", "Lawn"],
     "dislikes": ["Path", "Vegetable Patch"]},
    {"name": "Flowers", "symbol": "*", "color": MAGENTA, "base_pts": 1,
     "likes": ["Pond", "Hedge", "Lawn", "Fountain"],
     "dislikes": ["Vegetable Patch"]},
    {"name": "Lawn", "symbol": "m", "color": GREEN, "base_pts": 1,
     "likes": ["Flowers", "Tree", "Fountain", "Pond"],
     "dislikes": ["Path"]},
    {"name": "Vegetable Patch", "symbol": "V", "color": YELLOW, "base_pts": 2,
     "likes": ["Hedge", "Path", "Fountain"],
     "dislikes": ["Pond", "Flowers"]},
    {"name": "Tree", "symbol": "T", "color": GREEN, "base_pts": 2,
     "likes": ["Pond", "Lawn", "Hedge"],
     "dislikes": ["Path", "Vegetable Patch"]},
    {"name": "Hedge", "symbol": "H", "color": GREEN, "base_pts": 1,
     "likes": ["Flowers", "Tree", "Vegetable Patch"],
     "dislikes": ["Pond", "Fountain"]},
    {"name": "Path", "symbol": "=", "color": YELLOW, "base_pts": 1,
     "likes": ["Vegetable Patch", "Fountain"],
     "dislikes": ["Pond", "Tree", "Lawn"]},
    {"name": "Fountain", "symbol": "F", "color": CYAN, "base_pts": 3,
     "likes": ["Flowers", "Lawn", "Path"],
     "dislikes": ["Tree", "Hedge"]},
]

FEATURE_NAMES = [f["name"] for f in FEATURE_CARDS]
FEATURE_BY_NAME = {f["name"]: f for f in FEATURE_CARDS}

# Award cards
AWARD_TEMPLATES = [
    {"name": "Best Bloom", "desc": "Most Flowers in a row/col",
     "target": "Flowers", "type": "most"},
    {"name": "Green Thumb", "desc": "Most Veg Patches in a row/col",
     "target": "Vegetable Patch", "type": "most"},
    {"name": "Arborist", "desc": "Most Trees in a row/col",
     "target": "Tree", "type": "most"},
    {"name": "Waterscape", "desc": "Most Ponds in a row/col",
     "target": "Pond", "type": "most"},
    {"name": "Variety Show", "desc": "Most unique types in a row/col",
     "type": "variety"},
    {"name": "Hedge Master", "desc": "Most Hedges in a row/col",
     "target": "Hedge", "type": "most"},
    {"name": "Pathfinder", "desc": "Most Paths in a row/col",
     "target": "Path", "type": "most"},
    {"name": "Fountain Keeper", "desc": "Most Fountains in a row/col",
     "target": "Fountain", "type": "most"},
]


def feature_short(name):
    """Return short display for a feature."""
    f = FEATURE_BY_NAME.get(name)
    if not f:
        return f"{DIM}  .  {RESET}"
    return f"{f['color']}{f['symbol']:^5}{RESET}"


def feature_label(name):
    """Return colored feature name."""
    f = FEATURE_BY_NAME.get(name)
    if not f:
        return "Empty"
    return f"{f['color']}{f['name']}{RESET}"


class VillageGreenGame(BaseGame):
    """Village Green - Card-laying village competition."""

    name = "Village Green"
    description = "Build the best village garden by laying feature cards in a grid"
    min_players = 2
    max_players = 2
    variations = {
        "standard": "Standard game - 3x4 grid, 8 awards",
        "quick": "Quick game - 3x3 grid, 5 awards",
    }

    def __init__(self, variation=None):
        super().__init__(variation)
        if self.variation == "quick":
            self.rows = 3
            self.cols = 3
            self.num_awards = 5
        else:
            self.rows = 3
            self.cols = 4
            self.num_awards = 8
        self.grids = {1: [], 2: []}
        self.hands = {1: [], 2: []}
        self.deck = []
        self.awards = []
        self.scores = {1: 0, 2: 0}
        self.log = []
        self.cards_placed = {1: 0, 2: 0}
        self.total_slots = self.rows * self.cols

    def setup(self):
        """Initialize game."""
        # Build deck with multiple copies of each feature
        self.deck = []
        copies = max(4, (self.total_slots * 2 + 10) // len(FEATURE_CARDS) + 1)
        for feat in FEATURE_CARDS:
            for _ in range(copies):
                self.deck.append(feat["name"])
        random.shuffle(self.deck)

        # Initialize grids (None = empty)
        for p in [1, 2]:
            self.grids[p] = []
            for r in range(self.rows):
                row = []
                for c in range(self.cols):
                    row.append(None)
                self.grids[p].append(row)

        # Deal hands
        self.hands = {1: [], 2: []}
        for _ in range(5):
            if self.deck:
                self.hands[1].append(self.deck.pop())
            if self.deck:
                self.hands[2].append(self.deck.pop())

        # Select awards
        awards = list(AWARD_TEMPLATES)
        random.shuffle(awards)
        self.awards = awards[:self.num_awards]

        self.scores = {1: 0, 2: 0}
        self.cards_placed = {1: 0, 2: 0}
        self.log = []

    def _get_neighbors(self, row, col):
        """Get adjacent cell coordinates."""
        neighbors = []
        for dr, dc in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
            nr, nc = row + dr, col + dc
            if 0 <= nr < self.rows and 0 <= nc < self.cols:
                neighbors.append((nr, nc))
        return neighbors

    def _calc_adjacency_score(self, player, row, col, feature_name):
        """Calculate adjacency bonus for placing a feature at a position."""
        feat = FEATURE_BY_NAME[feature_name]
        score = feat["base_pts"]
        for nr, nc in self._get_neighbors(row, col):
            neighbor = self.grids[player][nr][nc]
            if neighbor:
                if neighbor in feat["likes"]:
                    score += 2
                if neighbor in feat["dislikes"]:
                    score -= 1
                # Also check if the neighbor likes/dislikes us
                nfeat = FEATURE_BY_NAME[neighbor]
                if feature_name in nfeat["likes"]:
                    score += 1
                if feature_name in nfeat["dislikes"]:
                    score -= 1
        return score

    def _calc_award_score(self, player, award):
        """Calculate award bonus for a player."""
        best = 0
        grid = self.grids[player]

        # Check rows
        for r in range(self.rows):
            row_cards = [grid[r][c] for c in range(self.cols) if grid[r][c]]
            if award["type"] == "most":
                count = sum(1 for c in row_cards if c == award["target"])
                best = max(best, count)
            elif award["type"] == "variety":
                best = max(best, len(set(row_cards)))

        # Check columns
        for c in range(self.cols):
            col_cards = [grid[r][c] for r in range(self.rows) if grid[r][c]]
            if award["type"] == "most":
                count = sum(1 for card in col_cards if card == award["target"])
                best = max(best, count)
            elif award["type"] == "variety":
                best = max(best, len(set(col_cards)))

        return best * 2  # 2 pts per match

    def _calc_total_score(self, player):
        """Calculate total score for a player."""
        score = 0
        grid = self.grids[player]

        # Base + adjacency points
        for r in range(self.rows):
            for c in range(self.cols):
                if grid[r][c]:
                    feat = FEATURE_BY_NAME[grid[r][c]]
                    score += feat["base_pts"]
                    for nr, nc in self._get_neighbors(r, c):
                        neighbor = grid[nr][nc]
                        if neighbor:
                            if neighbor in feat["likes"]:
                                score += 1
                            if neighbor in feat["dislikes"]:
                                score -= 1

        # Award bonuses
        for award in self.awards:
            score += self._calc_award_score(player, award)

        return score

    def _draw_grid(self, player):
        """Draw a player's garden grid."""
        grid = self.grids[player]
        lines = []

        # Column headers
        header = "     "
        for c in range(self.cols):
            header += f"  {c + 1}   "
        lines.append(header)

        # Grid
        border = "     " + "+-----" * self.cols + "+"
        for r in range(self.rows):
            lines.append(border)
            row_str = f"  {chr(65 + r)}  "
            for c in range(self.cols):
                cell = grid[r][c]
                row_str += "|" + feature_short(cell)
            row_str += "|"
            lines.append(row_str)

            # Show feature names below symbols
            name_str = "     "
            for c in range(self.cols):
                cell = grid[r][c]
                if cell:
                    short = cell[:5]
                    name_str += f"|{DIM}{short:^5}{RESET}"
                else:
                    name_str += f"|     "
            name_str += "|"
            lines.append(name_str)
        lines.append(border)

        return "\n".join(lines)

    def display(self):
        """Display the game state."""
        clear_screen()
        p = self.current_player

        print(f"{BOLD}=== VILLAGE GREEN ==={RESET}")
        print(f"Cards remaining in deck: {len(self.deck)}")
        print()

        # Show both grids
        for pl in [1, 2]:
            placed = self.cards_placed[pl]
            score = self._calc_total_score(pl)
            marker = " <<< " if pl == p else ""
            print(f"{BOLD}{self.players[pl - 1]}'s Garden{RESET} "
                  f"({placed}/{self.total_slots} placed, "
                  f"Score: {score}){marker}")
            print(self._draw_grid(pl))
            print()

        # Awards
        print(f"{BOLD}--- Awards ---{RESET}")
        for i, award in enumerate(self.awards):
            p1_score = self._calc_award_score(1, award)
            p2_score = self._calc_award_score(2, award)
            print(f"  {award['name']}: {award['desc']} "
                  f"(P1: +{p1_score}, P2: +{p2_score})")
        print()

        # Hand
        print(f"{BOLD}--- {self.players[p - 1]}'s Hand ---{RESET}")
        for i, card_name in enumerate(self.hands[p]):
            feat = FEATURE_BY_NAME[card_name]
            likes = ", ".join(feat["likes"][:3])
            dislikes = ", ".join(feat["dislikes"][:2])
            print(f"  [{i + 1}] {feature_label(card_name)} "
                  f"(Base: {feat['base_pts']}pts) "
                  f"{GREEN}Likes: {likes}{RESET} "
                  f"{RED}Dislikes: {dislikes}{RESET}")
        print()

        if self.log:
            print(f"{DIM}Last: {self.log[-1]}{RESET}")

    def get_move(self):
        """Get card placement from current player."""
        p = self.current_player

        if not self.hands[p]:
            print("No cards in hand!")
            input_with_quit("Press Enter...")
            return ("skip",)

        card_idx = input_with_quit(
            f"Card to place (1-{len(self.hands[p])}): ").strip()
        pos = input_with_quit(
            "Position (e.g. A1, B3): ").strip().upper()

        return ("place", card_idx, pos)

    def make_move(self, move):
        """Process a move."""
        p = self.current_player

        if move[0] == "skip":
            return True

        if move[0] == "place":
            try:
                card_idx = int(move[1]) - 1
            except (ValueError, IndexError):
                return False

            if card_idx < 0 or card_idx >= len(self.hands[p]):
                return False

            pos = move[2]
            if len(pos) < 2:
                return False

            try:
                row = ord(pos[0]) - ord('A')
                col = int(pos[1:]) - 1
            except (ValueError, IndexError):
                return False

            if row < 0 or row >= self.rows or col < 0 or col >= self.cols:
                self.log.append("Invalid position!")
                return False

            if self.grids[p][row][col] is not None:
                self.log.append("That space is already occupied!")
                return False

            card_name = self.hands[p].pop(card_idx)
            self.grids[p][row][col] = card_name
            self.cards_placed[p] += 1

            adj_score = self._calc_adjacency_score(p, row, col, card_name)
            self.log.append(
                f"{self.players[p - 1]} placed {card_name} "
                f"at {pos} (+{adj_score} pts)")

            # Draw a card
            if self.deck:
                self.hands[p].append(self.deck.pop())

            return True

        return False

    def check_game_over(self):
        """Check if both players have filled their grids."""
        if (self.cards_placed[1] >= self.total_slots
                and self.cards_placed[2] >= self.total_slots):
            self.game_over = True
            s1 = self._calc_total_score(1)
            s2 = self._calc_total_score(2)
            self.scores = {1: s1, 2: s2}
            if s1 > s2:
                self.winner = 1
            elif s2 > s1:
                self.winner = 2
            else:
                self.winner = None
            return

        # Also end if both players have no cards and deck is empty
        if (not self.hands[1] and not self.hands[2] and not self.deck):
            self.game_over = True
            s1 = self._calc_total_score(1)
            s2 = self._calc_total_score(2)
            self.scores = {1: s1, 2: s2}
            if s1 > s2:
                self.winner = 1
            elif s2 > s1:
                self.winner = 2
            else:
                self.winner = None

    def get_state(self):
        """Return serializable game state."""
        return {
            "grids": {"1": self.grids[1], "2": self.grids[2]},
            "hands": {"1": self.hands[1], "2": self.hands[2]},
            "deck": self.deck,
            "awards": self.awards,
            "cards_placed": {"1": self.cards_placed[1],
                             "2": self.cards_placed[2]},
            "scores": {"1": self.scores[1], "2": self.scores[2]},
            "log": self.log,
            "rows": self.rows,
            "cols": self.cols,
            "num_awards": self.num_awards,
            "total_slots": self.total_slots,
        }

    def load_state(self, state):
        """Restore game state."""
        self.grids = {1: state["grids"]["1"], 2: state["grids"]["2"]}
        self.hands = {1: state["hands"]["1"], 2: state["hands"]["2"]}
        self.deck = state["deck"]
        self.awards = state["awards"]
        self.cards_placed = {1: state["cards_placed"]["1"],
                             2: state["cards_placed"]["2"]}
        self.scores = {1: state["scores"]["1"], 2: state["scores"]["2"]}
        self.log = state.get("log", [])
        self.rows = state.get("rows", 3)
        self.cols = state.get("cols", 4)
        self.num_awards = state.get("num_awards", 8)
        self.total_slots = self.rows * self.cols

    def get_tutorial(self):
        """Return tutorial text."""
        return f"""{BOLD}=== VILLAGE GREEN - Tutorial ==={RESET}

Village Green is a card-laying game where you build the most
beautiful village garden on a {self.rows}x{self.cols} grid.

{BOLD}GOAL:{RESET}
  Score the most points by placing feature cards with good
  adjacency combinations and earning award bonuses.

{BOLD}FEATURE CARDS:{RESET}
  {BLUE}Pond (~){RESET}      - Base 2pts. Likes: Flowers, Tree, Lawn
  {MAGENTA}Flowers (*){RESET}   - Base 1pt.  Likes: Pond, Hedge, Lawn, Fountain
  {GREEN}Lawn (m){RESET}      - Base 1pt.  Likes: Flowers, Tree, Fountain, Pond
  {YELLOW}Veg Patch (V){RESET} - Base 2pts. Likes: Hedge, Path, Fountain
  {GREEN}Tree (T){RESET}      - Base 2pts. Likes: Pond, Lawn, Hedge
  {GREEN}Hedge (H){RESET}     - Base 1pt.  Likes: Flowers, Tree, Veg Patch
  {YELLOW}Path (=){RESET}      - Base 1pt.  Likes: Veg Patch, Fountain
  {CYAN}Fountain (F){RESET}  - Base 3pts. Likes: Flowers, Lawn, Path

{BOLD}SCORING:{RESET}
  - Each card has base points
  - +1 point for each adjacent card it likes (up/down/left/right)
  - -1 point for each adjacent card it dislikes
  - Award bonuses for having the most of a type in a row/column

{BOLD}AWARDS:{RESET}
  {self.num_awards} award cards are in play. Each checks all your
  rows and columns for the best match and awards bonus points.

{BOLD}ON YOUR TURN:{RESET}
  1. Choose a card from your hand
  2. Place it in an empty cell (e.g., A1, B3)
  3. Draw a replacement card

{BOLD}STRATEGY:{RESET}
  - Plan adjacencies carefully before placing
  - Focus on a few award categories for big bonuses
  - Avoid placing cards next to their dislikes
  - Fountains are high-value but picky neighbors

Type 'q' to quit, 's' to save, 'h' for help during play.
"""
