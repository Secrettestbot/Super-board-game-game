"""Photosynthesis - A strategic nature game about growing trees."""

import random
from engine.base import BaseGame, input_with_quit, clear_screen

# The board is a hex grid with 37 cells arranged in rings:
#   Ring 0 (center): 1 cell  -> richest soil (4 pts)
#   Ring 1: 6 cells           -> 3 pts
#   Ring 2: 12 cells          -> 2 pts
#   Ring 3 (edge): 18 cells   -> 1 pt
#
# We use axial coordinates (q, r). The center is (0,0).

HEX_DIRECTIONS = [(1, 0), (1, -1), (0, -1), (-1, 0), (-1, 1), (0, 1)]

RING_SCORES = {0: 4, 1: 3, 2: 2, 3: 1}

# Tree sizes
SEED = 0
SMALL = 1
MEDIUM = 2
LARGE = 3
SIZE_NAMES = {SEED: "Seed", SMALL: "Small", MEDIUM: "Medium", LARGE: "Large"}
SIZE_CHARS = {SEED: ".", SMALL: "t", MEDIUM: "T", LARGE: "A"}

# Costs to buy from player board to available supply
BUY_COST = {
    SEED: 1,
    SMALL: 2,
    MEDIUM: 3,
    LARGE: 4,
}
# Costs to plant/grow on the main board (from available supply)
GROW_COST = {
    SEED: 1,      # cost to plant a seed
    SMALL: 1,     # cost to grow seed -> small
    MEDIUM: 2,    # cost to grow small -> medium
    LARGE: 3,     # cost to grow medium -> large
}
COLLECT_COST = 4  # cost to collect a large tree


def _make_hex_grid():
    """Generate all hex coordinates within radius 3."""
    cells = []
    for q in range(-3, 4):
        for r in range(-3, 4):
            s = -q - r
            if abs(q) <= 3 and abs(r) <= 3 and abs(s) <= 3:
                cells.append((q, r))
    return cells


def _hex_ring(q, r):
    """Get the ring number (distance from center) of a hex."""
    s = -q - r
    return max(abs(q), abs(r), abs(s))


def _hex_distance(q1, r1, q2, r2):
    return max(abs(q1 - q2), abs(r1 - r2), abs((-q1 - r1) - (-q2 - r2)))


def _hex_neighbor(q, r, direction):
    dq, dr = HEX_DIRECTIONS[direction]
    return (q + dq, r + dr)


def _cells_in_shadow(q, r, size, sun_dir):
    """Return list of cells shadowed by a tree at (q,r) of given size.
    Shadow extends 'size' cells in the direction the sun is shining toward."""
    if size == SEED:
        return []
    dq, dr = HEX_DIRECTIONS[sun_dir]
    shadow = []
    cq, cr = q, r
    for _ in range(size):
        cq, cr = cq + dq, cr + dr
        shadow.append((cq, cr))
    return shadow


class PhotosynthesisGame(BaseGame):
    """Photosynthesis: Grow trees, collect light, score by harvesting."""

    name = "Photosynthesis"
    description = "A strategic nature game about growing trees with sunlight"
    min_players = 2
    max_players = 2
    variations = {
        "standard": "Standard game (3 full sun revolutions)",
        "beginner": "Beginner game (2 sun revolutions, relaxed rules)",
    }

    def __init__(self, variation=None):
        super().__init__(variation)
        self.all_cells = []
        self.board = {}          # (q,r) -> {"player": 1 or 2, "size": 0-3} or None
        self.sun_direction = 0   # 0-5, rotates each round
        self.sun_revolutions = 0
        self.max_revolutions = 3
        self.round_number = 0
        self.player_light = [0, 0]       # light points (currency)
        self.player_score = [0, 0]       # victory points
        # Available pieces (bought from player board, ready to place/grow)
        self.player_available = [
            {SEED: 2, SMALL: 2, MEDIUM: 1, LARGE: 0},
            {SEED: 2, SMALL: 2, MEDIUM: 1, LARGE: 0},
        ]
        # Pieces remaining on player board (can buy to make available)
        self.player_board = [
            {SEED: 2, SMALL: 2, MEDIUM: 2, LARGE: 2},
            {SEED: 2, SMALL: 2, MEDIUM: 2, LARGE: 2},
        ]
        self.player_actions_this_turn = [[], []]  # track what cells were acted on
        self.scoring_tokens = {0: [], 1: [], 2: [], 3: []}
        self.phase = "photosynthesis"  # photosynthesis or life_cycle
        self.both_passed_life = [False, False]

    def setup(self):
        beginner = self.variation == "beginner"
        self.max_revolutions = 2 if beginner else 3
        self.all_cells = _make_hex_grid()
        self.board = {cell: None for cell in self.all_cells}

        # Generate scoring tokens for each ring tier
        self.scoring_tokens = {
            0: [22, 21, 20, 19],    # center ring
            1: [17, 16, 14, 13],    # ring 1
            2: [13, 12, 11, 10],    # ring 2
            3: [8, 7, 6, 5],        # ring 3
        }

        # Starting setup: each player places 2 small trees on edge (ring 3)
        edge_cells = [c for c in self.all_cells if _hex_ring(*c) == 3]
        random.shuffle(edge_cells)

        # Spread starting positions
        p1_starts = [edge_cells[0], edge_cells[9]]
        p2_starts = [edge_cells[4], edge_cells[13]]

        for cell in p1_starts:
            self.board[cell] = {"player": 1, "size": SMALL}
        for cell in p2_starts:
            self.board[cell] = {"player": 2, "size": SMALL}

        # Both players start with some light
        start_light = 4 if beginner else 2
        self.player_light = [start_light, start_light]
        self.player_score = [0, 0]

        self.sun_direction = 0
        self.sun_revolutions = 0
        self.round_number = 0
        self.phase = "life_cycle"
        self.both_passed_life = [False, False]

        if beginner:
            # Give more starting pieces
            for i in range(2):
                self.player_available[i] = {SEED: 3, SMALL: 3, MEDIUM: 1, LARGE: 0}

    def _collect_light(self):
        """Photosynthesis phase: each tree collects light based on size, minus shadows."""
        shadowed = set()
        # Find all shadows
        for (q, r), tree in self.board.items():
            if tree is not None and tree["size"] > SEED:
                shadows = _cells_in_shadow(q, r, tree["size"], self.sun_direction)
                for sq, sr in shadows:
                    cell = (sq, sr)
                    if cell in self.board and self.board[cell] is not None:
                        # A tree is only shadowed if the shadow-casting tree is >= its size
                        if self.board[cell]["size"] <= tree["size"]:
                            shadowed.add(cell)

        for (q, r), tree in self.board.items():
            if tree is not None and (q, r) not in shadowed:
                pi = tree["player"] - 1
                self.player_light[pi] += tree["size"]  # seeds give 0

    def _display_hex_board(self):
        """Render the hex board as ASCII art."""
        # Map hex coords to a display grid
        # Using offset: col = q + 3, row determined by r and q
        lines = []
        lines.append("  Board (Sun direction: {} {})".format(
            self.sun_direction,
            ["->", "SE", "SW", "<-", "NW", "NE"][self.sun_direction]
        ))
        lines.append("")

        # Simple flat-top hex rendering
        # We'll render row by row using the axial coords
        for r in range(-3, 4):
            row_cells = []
            for q in range(-3, 4):
                s = -q - r
                if max(abs(q), abs(r), abs(s)) <= 3:
                    row_cells.append((q, r))

            if not row_cells:
                continue

            indent = "  " + " " * (3 - len(row_cells)) * 2
            parts = []
            for (cq, cr) in row_cells:
                tree = self.board.get((cq, cr))
                if tree is None:
                    ring = _hex_ring(cq, cr)
                    parts.append(f" {ring} ")
                else:
                    p = tree["player"]
                    ch = SIZE_CHARS[tree["size"]]
                    if p == 1:
                        parts.append(f"{ch.upper()}{p} ")
                    else:
                        parts.append(f"{ch.lower()}{p} ")
            lines.append(indent + " ".join(parts))

        lines.append("")
        lines.append("  Legend: number=empty(ring score)  .=seed  t/T=small/medium  A=large")
        lines.append("         Uppercase+1 = P1, lowercase+2 = P2")
        return "\n".join(lines)

    def display(self):
        mode = "Standard" if self.variation == "standard" else "Beginner"
        rev_str = f"Sun revolution {self.sun_revolutions + 1}/{self.max_revolutions}"
        print(f"\n  === Photosynthesis ({mode}) ===")
        print(f"  {rev_str}, Direction: {self.sun_direction}/5")
        print(f"  Phase: {self.phase.replace('_', ' ').title()}")
        print(f"  {self.players[0]} vs {self.players[1]}")
        print(f"  Current turn: {self.players[self.current_player - 1]}")
        print()

        print(self._display_hex_board())
        print()

        # Scoring tokens remaining
        print("  Scoring tokens remaining:")
        for ring in range(4):
            tokens = self.scoring_tokens[ring]
            top = tokens[0] if tokens else "--"
            print(f"    Ring {ring}: {len(tokens)} left (top: {top})")
        print()

        for i in range(2):
            marker = " <<" if i == self.current_player - 1 else ""
            avail = " ".join(f"{SIZE_NAMES[s]}:{self.player_available[i][s]}" for s in range(4))
            board_pcs = " ".join(f"{SIZE_NAMES[s]}:{self.player_board[i][s]}" for s in range(4))
            print(f"  {self.players[i]}: score={self.player_score[i]} light={self.player_light[i]}{marker}")
            print(f"    Available: {avail}")
            print(f"    On board:  {board_pcs}")
        print()

    def get_move(self):
        pi = self.current_player - 1
        if self.phase == "life_cycle":
            print(f"  {self.players[pi]}, Life Cycle actions (light pts: {self.player_light[pi]}):")
            print("    plant Q R       - plant seed near one of your trees (cost 1 light)")
            print("    grow Q R        - grow tree at Q,R to next size")
            print("    collect Q R     - collect large tree at Q,R for points (cost 4)")
            print("    buy SIZE        - buy piece from board (seed/small/medium/large)")
            print("    pass            - end your life cycle turn")
            print("  (Q R are hex coordinates, center is 0 0)")
        move_str = input_with_quit("  Your move: ").strip()
        return move_str

    def make_move(self, move):
        pi = self.current_player - 1
        parts = move.lower().split()
        if not parts:
            return False

        action = parts[0]

        if self.phase == "life_cycle":
            if action == "pass":
                self.both_passed_life[pi] = True
                return True

            if action == "buy":
                if len(parts) < 2:
                    return False
                size_map = {"seed": SEED, "small": SMALL, "medium": MEDIUM, "large": LARGE}
                size = size_map.get(parts[1])
                if size is None:
                    print("  Invalid size. Use: seed, small, medium, large")
                    return False
                cost = BUY_COST[size]
                if self.player_light[pi] < cost:
                    print(f"  Need {cost} light points.")
                    return False
                if self.player_board[pi][size] <= 0:
                    print(f"  No {SIZE_NAMES[size]} pieces left on your board.")
                    return False
                self.player_light[pi] -= cost
                self.player_board[pi][size] -= 1
                self.player_available[pi][size] += 1
                return True

            if action == "plant":
                if len(parts) < 3:
                    print("  Usage: plant Q R (target cell to place seed)")
                    return False
                try:
                    tq, tr = int(parts[1]), int(parts[2])
                except ValueError:
                    return False
                target = (tq, tr)
                if target not in self.board:
                    print("  Invalid cell.")
                    return False
                if self.board[target] is not None:
                    print("  Cell is occupied.")
                    return False
                if target in self.player_actions_this_turn[pi]:
                    print("  Already acted on this cell this turn.")
                    return False

                # Must be adjacent to one of player's trees (within that tree's seed range = size)
                can_plant = False
                for (q, r), tree in self.board.items():
                    if tree is not None and tree["player"] == pi + 1 and tree["size"] >= SMALL:
                        if (q, r) not in self.player_actions_this_turn[pi]:
                            dist = _hex_distance(q, r, tq, tr)
                            if 1 <= dist <= tree["size"]:
                                can_plant = True
                                break
                if not can_plant:
                    print("  Must plant adjacent to one of your trees (range = tree size).")
                    return False

                cost = GROW_COST[SEED]
                if self.player_light[pi] < cost:
                    print(f"  Need {cost} light to plant.")
                    return False
                if self.player_available[pi][SEED] <= 0:
                    print("  No seeds available. Buy one first.")
                    return False

                self.player_light[pi] -= cost
                self.player_available[pi][SEED] -= 1
                self.board[target] = {"player": pi + 1, "size": SEED}
                self.player_actions_this_turn[pi].append(target)
                return True

            if action == "grow":
                if len(parts) < 3:
                    print("  Usage: grow Q R")
                    return False
                try:
                    gq, gr = int(parts[1]), int(parts[2])
                except ValueError:
                    return False
                cell = (gq, gr)
                if cell not in self.board or self.board[cell] is None:
                    print("  No tree there.")
                    return False
                tree = self.board[cell]
                if tree["player"] != pi + 1:
                    print("  Not your tree.")
                    return False
                if tree["size"] >= LARGE:
                    print("  Already max size. Use 'collect' to harvest.")
                    return False
                if cell in self.player_actions_this_turn[pi]:
                    print("  Already acted on this cell this turn.")
                    return False

                new_size = tree["size"] + 1
                cost = GROW_COST[new_size]
                if self.player_light[pi] < cost:
                    print(f"  Need {cost} light to grow to {SIZE_NAMES[new_size]}.")
                    return False
                if self.player_available[pi][new_size] <= 0:
                    print(f"  No {SIZE_NAMES[new_size]} pieces available. Buy one first.")
                    return False

                self.player_light[pi] -= cost
                self.player_available[pi][new_size] -= 1
                # Return old piece to player board
                old_size = tree["size"]
                self.player_board[pi][old_size] += 1
                tree["size"] = new_size
                self.player_actions_this_turn[pi].append(cell)
                return True

            if action == "collect":
                if len(parts) < 3:
                    print("  Usage: collect Q R")
                    return False
                try:
                    cq, cr = int(parts[1]), int(parts[2])
                except ValueError:
                    return False
                cell = (cq, cr)
                if cell not in self.board or self.board[cell] is None:
                    print("  No tree there.")
                    return False
                tree = self.board[cell]
                if tree["player"] != pi + 1:
                    print("  Not your tree.")
                    return False
                if tree["size"] != LARGE:
                    print("  Can only collect large trees.")
                    return False
                if cell in self.player_actions_this_turn[pi]:
                    print("  Already acted on this cell this turn.")
                    return False
                if self.player_light[pi] < COLLECT_COST:
                    print(f"  Need {COLLECT_COST} light to collect.")
                    return False

                self.player_light[pi] -= COLLECT_COST
                ring = _hex_ring(cq, cr)
                tokens = self.scoring_tokens[ring]
                if tokens:
                    score = tokens.pop(0)
                    self.player_score[pi] += score
                else:
                    # No tokens left for this ring, still score ring base
                    self.player_score[pi] += RING_SCORES[ring]

                self.board[cell] = None
                # Large tree goes back to board
                self.player_board[pi][LARGE] += 1
                self.player_actions_this_turn[pi].append(cell)
                return True

            print("  Unknown action. Use: plant, grow, collect, buy, or pass")
            return False

        return False

    def switch_player(self):
        """Override to handle round/phase transitions."""
        if self.phase == "life_cycle":
            if self.both_passed_life[self.current_player - 1]:
                # Current player passed. Check if both have passed.
                other = 2 if self.current_player == 1 else 1
                if self.both_passed_life[other - 1]:
                    # Both passed: advance sun, new photosynthesis
                    self._advance_sun()
                    return
            # Switch to other player for their life cycle actions
            self.current_player = 2 if self.current_player == 1 else 1
        else:
            super().switch_player()

    def _advance_sun(self):
        """Advance sun direction, do photosynthesis, start new life cycle."""
        self.sun_direction = (self.sun_direction + 1) % 6
        if self.sun_direction == 0:
            self.sun_revolutions += 1
        self.round_number += 1

        # Photosynthesis phase (automatic)
        self._collect_light()

        # Reset for new life cycle
        self.phase = "life_cycle"
        self.both_passed_life = [False, False]
        self.player_actions_this_turn = [[], []]
        self.current_player = 1

    def check_game_over(self):
        if self.sun_revolutions >= self.max_revolutions:
            self.game_over = True
            s1 = self.player_score[0] + self.player_light[0] // 3
            s2 = self.player_score[1] + self.player_light[1] // 3
            if s1 > s2:
                self.winner = 1
            elif s2 > s1:
                self.winner = 2
            else:
                self.winner = None

    def get_state(self):
        # Convert board tuples to string keys for JSON
        board_ser = {}
        for (q, r), v in self.board.items():
            board_ser[f"{q},{r}"] = v
        actions_ser = []
        for acts in self.player_actions_this_turn:
            actions_ser.append([f"{q},{r}" for q, r in acts])
        return {
            "board": board_ser,
            "sun_direction": self.sun_direction,
            "sun_revolutions": self.sun_revolutions,
            "max_revolutions": self.max_revolutions,
            "round_number": self.round_number,
            "player_light": list(self.player_light),
            "player_score": list(self.player_score),
            "player_available": [dict(a) for a in self.player_available],
            "player_board": [dict(b) for b in self.player_board],
            "player_actions_this_turn": actions_ser,
            "scoring_tokens": {str(k): list(v) for k, v in self.scoring_tokens.items()},
            "phase": self.phase,
            "both_passed_life": list(self.both_passed_life),
        }

    def load_state(self, state):
        self.board = {}
        for key, v in state["board"].items():
            q, r = key.split(",")
            self.board[(int(q), int(r))] = v
        self.all_cells = list(self.board.keys())
        self.sun_direction = state["sun_direction"]
        self.sun_revolutions = state["sun_revolutions"]
        self.max_revolutions = state["max_revolutions"]
        self.round_number = state["round_number"]
        self.player_light = list(state["player_light"])
        self.player_score = list(state["player_score"])
        self.player_available = []
        for a in state["player_available"]:
            self.player_available.append({int(k): v for k, v in a.items()})
        self.player_board = []
        for b in state["player_board"]:
            self.player_board.append({int(k): v for k, v in b.items()})
        self.player_actions_this_turn = []
        for acts in state["player_actions_this_turn"]:
            parsed = []
            for s in acts:
                q, r = s.split(",")
                parsed.append((int(q), int(r)))
            self.player_actions_this_turn.append(parsed)
        self.scoring_tokens = {}
        for k, v in state["scoring_tokens"].items():
            self.scoring_tokens[int(k)] = list(v)
        self.phase = state["phase"]
        self.both_passed_life = list(state["both_passed_life"])

    def get_tutorial(self):
        return """
==================================================
  Photosynthesis - Tutorial
==================================================

  OVERVIEW:
  Photosynthesis is a strategic nature game where
  players grow trees on a hex board. Trees collect
  light based on sun position, and larger trees
  cast shadows. Score points by growing trees to
  full size and harvesting them.

  THE BOARD:
  A hex grid with 37 cells in 4 rings:
    Ring 0 (center): highest scoring
    Ring 3 (edge):   lowest scoring
  Coordinates use axial system (Q R), center = 0 0

  SUN & LIGHT:
  The sun rotates through 6 directions each round.
  During photosynthesis, each unshadowed tree earns
  light points equal to its size:
    Seed=0  Small=1  Medium=2  Large=3
  A tree casts a shadow equal to its size in cells.
  Shadowed trees (same size or smaller) earn nothing.

  TREE SIZES & SYMBOLS:
    . = Seed    t = Small    T = Medium    A = Large

  ON YOUR TURN (Life Cycle phase):

  1. PLANT A SEED
     Place a seed adjacent to one of your trees.
     Range = tree's size. Costs 1 light + 1 seed.
     Command: plant Q R

  2. GROW A TREE
     Grow a tree one size up. Costs light + piece.
     Seed->Small(1) Small->Med(2) Med->Large(3)
     Command: grow Q R

  3. COLLECT A TREE
     Harvest a large tree for scoring tokens.
     Costs 4 light. Token value depends on ring.
     Command: collect Q R

  4. BUY PIECES
     Move a piece from your player board to your
     available supply. Cost = piece size in light.
     Command: buy seed/small/medium/large

  5. PASS
     End your turn. When both players pass, the
     sun advances and a new round begins.
     Command: pass

  Each cell can only be acted on once per turn.

  WINNING:
  After all sun revolutions complete:
  Score = scoring tokens + (leftover light / 3)
  Highest score wins.

  Standard: 3 revolutions (18 rounds)
  Beginner: 2 revolutions (12 rounds), extra start

  STRATEGY HINTS:
  - Position trees where they get light but cast
    shadows on opponents.
  - Center cells score highest but are contested.
  - Build up an engine of trees before harvesting.
  - Watch the sun direction to plan shadow effects.
  - Buy pieces early so they're available later.

==================================================
"""
