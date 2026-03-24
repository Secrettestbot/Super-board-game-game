"""Blokus Duo - 2-player polyomino territory game."""

import random
from engine.base import BaseGame, input_with_quit, clear_screen

RESET = '\033[0m'
RED = '\033[91m'
BLUE = '\033[94m'
DIM = '\033[2m'
WHITE = '\033[97m'

# All 21 standard Blokus pieces (defined as relative coordinates from origin)
STANDARD_PIECES = {
    '1': [(0, 0)],
    '2': [(0, 0), (0, 1)],
    'I3': [(0, 0), (0, 1), (0, 2)],
    'L3': [(0, 0), (1, 0), (1, 1)],
    'I4': [(0, 0), (0, 1), (0, 2), (0, 3)],
    'L4': [(0, 0), (1, 0), (1, 1), (1, 2)],
    'T4': [(0, 0), (0, 1), (0, 2), (1, 1)],
    'S4': [(0, 0), (0, 1), (1, 1), (1, 2)],
    'O4': [(0, 0), (0, 1), (1, 0), (1, 1)],
    'I5': [(0, 0), (0, 1), (0, 2), (0, 3), (0, 4)],
    'L5': [(0, 0), (1, 0), (1, 1), (1, 2), (1, 3)],
    'Y5': [(0, 0), (0, 1), (0, 2), (0, 3), (1, 1)],
    'T5': [(0, 0), (0, 1), (0, 2), (1, 1), (2, 1)],
    'U5': [(0, 0), (0, 2), (1, 0), (1, 1), (1, 2)],
    'P5': [(0, 0), (0, 1), (1, 0), (1, 1), (2, 0)],
    'S5': [(0, 0), (0, 1), (1, 1), (1, 2), (2, 2)],
    'Z5': [(0, 0), (1, 0), (1, 1), (1, 2), (2, 2)],
    'W5': [(0, 0), (1, 0), (1, 1), (2, 1), (2, 2)],
    'F5': [(0, 1), (0, 2), (1, 0), (1, 1), (2, 1)],
    'N5': [(0, 0), (0, 1), (1, 1), (1, 2), (1, 3)],
    'X5': [(0, 1), (1, 0), (1, 1), (1, 2), (2, 1)],
}

# Smaller set for small variation
SMALL_PIECES = {k: v for k, v in list(STANDARD_PIECES.items())[:12]}

PLAYER_COLORS = {1: BLUE, 2: RED}
PLAYER_CHARS = {1: 'B', 2: 'R'}


def _rotate_piece(cells):
    """Rotate piece 90 degrees clockwise."""
    return [(c, -r) for r, c in cells]


def _flip_piece(cells):
    """Flip piece horizontally."""
    return [(r, -c) for r, c in cells]


def _normalize(cells):
    """Normalize piece so minimum r,c is 0,0."""
    min_r = min(r for r, c in cells)
    min_c = min(c for r, c in cells)
    normalized = sorted((r - min_r, c - min_c) for r, c in cells)
    return tuple(normalized)


def _all_orientations(cells):
    """Get all unique orientations of a piece."""
    orientations = set()
    current = list(cells)
    for _ in range(4):
        orientations.add(_normalize(current))
        flipped = _flip_piece(current)
        orientations.add(_normalize(flipped))
        current = _rotate_piece(current)
    return [list(o) for o in orientations]


class BlokusDuoGame(BaseGame):
    name = "Blokus Duo"
    description = "2-player polyomino territory game"
    min_players = 2
    max_players = 2
    variations = {
        'standard': 'Standard (14x14, 21 pieces)',
        'small': 'Small (10x10, 12 pieces)',
    }

    def setup(self):
        if self.variation == 'small':
            self.board_size = 10
            piece_defs = dict(SMALL_PIECES)
            self.starts = {1: (2, 2), 2: (7, 7)}
        else:
            self.board_size = 14
            piece_defs = dict(STANDARD_PIECES)
            self.starts = {1: (4, 4), 2: (9, 9)}

        n = self.board_size
        self.board = [[0] * n for _ in range(n)]
        self.pieces = {1: dict(piece_defs), 2: dict(piece_defs)}
        self.first_move = {1: True, 2: True}
        self.passed = {1: False, 2: False}

    def _can_place(self, player, cells, r_off, c_off):
        """Check if piece can be placed at offset."""
        n = self.board_size
        placed = []
        for dr, dc in cells:
            r, c = r_off + dr, c_off + dc
            if r < 0 or r >= n or c < 0 or c >= n:
                return False
            if self.board[r][c] != 0:
                return False
            placed.append((r, c))

        # Check no edge-to-edge with own color
        for r, c in placed:
            for dr, dc in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
                nr, nc = r + dr, c + dc
                if 0 <= nr < n and 0 <= nc < n:
                    if self.board[nr][nc] == player:
                        return False

        # First move must cover start position
        if self.first_move[player]:
            start = self.starts[player]
            if start not in placed:
                return False
            return True

        # Must touch own color diagonally
        has_diagonal = False
        for r, c in placed:
            for dr, dc in [(-1, -1), (-1, 1), (1, -1), (1, 1)]:
                nr, nc = r + dr, c + dc
                if 0 <= nr < n and 0 <= nc < n:
                    if self.board[nr][nc] == player:
                        has_diagonal = True
                        break
            if has_diagonal:
                break

        return has_diagonal

    def _place_piece(self, player, cells, r_off, c_off):
        for dr, dc in cells:
            r, c = r_off + dr, c_off + dc
            self.board[r][c] = player

    def _has_valid_move(self, player):
        """Check if player has any valid placement."""
        n = self.board_size
        for piece_name, cells in self.pieces[player].items():
            for orientation in _all_orientations(cells):
                for r in range(n):
                    for c in range(n):
                        if self._can_place(player, orientation, r, c):
                            return True
        return False

    def _score(self, player):
        """Score = negative total squares of remaining pieces."""
        total = 0
        for piece_name, cells in self.pieces[player].items():
            total += len(cells)
        return -total

    def display(self):
        cp = self.current_player
        n = self.board_size

        print(f"\n{'=' * 55}")
        print(f"  BLOKUS DUO  --  Turn {self.turn_number + 1}")
        print(f"  {self.players[0]} ({BLUE}Blue{RESET}) vs {self.players[1]} ({RED}Red{RESET})")
        print(f"{'=' * 55}")

        # Scores
        for p in (1, 2):
            remaining = sum(len(cells) for cells in self.pieces[p].values())
            marker = " <<" if p == cp else ""
            color = PLAYER_COLORS[p]
            print(f"  {self.players[p-1]}: {remaining} squares remaining, {len(self.pieces[p])} pieces left{marker}")

        # Board
        col_header = "    " + " ".join(f"{c+1:2}" for c in range(n))
        print(f"\n{col_header}")
        for r in range(n):
            row_label = f"  {chr(ord('A') + r)} "
            line = row_label
            for c in range(n):
                cell = self.board[r][c]
                start_1 = self.starts[1]
                start_2 = self.starts[2]
                if cell == 1:
                    line += f" {BLUE}B{RESET}"
                elif cell == 2:
                    line += f" {RED}R{RESET}"
                elif (r, c) == start_1:
                    line += f" {BLUE}+{RESET}"
                elif (r, c) == start_2:
                    line += f" {RED}+{RESET}"
                else:
                    line += f" {DIM}.{RESET}"
            print(line)

        # Available pieces
        if self.pieces[cp]:
            pieces_str = ', '.join(f"{name}({len(cells)})" for name, cells in sorted(self.pieces[cp].items()))
            print(f"\n  Your pieces: {pieces_str}")

    def get_move(self):
        cp = self.current_player

        while True:
            raw = input_with_quit("  Place piece: NAME ROW COL [rotation 0-7] (or 'pass'): ").strip()

            if raw.lower() in ('pass', 'p'):
                return ('pass',)

            if raw.lower().startswith('show '):
                piece_name = raw.split()[1].upper()
                if piece_name in self.pieces[cp]:
                    cells = self.pieces[cp][piece_name]
                    orients = _all_orientations(cells)
                    for i, o in enumerate(orients):
                        coords = ', '.join(f"({r},{c})" for r, c in o)
                        print(f"    Rotation {i}: {coords}")
                continue

            parts = raw.split()
            if len(parts) >= 3:
                piece_name = parts[0].upper()
                row_ch = parts[1].upper()
                col_str = parts[2]
                rotation = int(parts[3]) if len(parts) > 3 else 0

                if piece_name not in self.pieces[cp]:
                    print(f"  No piece '{piece_name}'. Type 'show <name>' to see orientations.")
                    continue

                if len(row_ch) == 1 and row_ch.isalpha() and col_str.isdigit():
                    r = ord(row_ch) - ord('A')
                    c = int(col_str) - 1

                    cells = self.pieces[cp][piece_name]
                    orients = _all_orientations(cells)
                    if rotation >= len(orients):
                        rotation = 0

                    return ('place', piece_name, r, c, rotation)

            print("  Format: PIECE_NAME ROW COL [rotation]")
            print("  Example: 'L4 E 5 2' or 'show L4'")

    def make_move(self, move):
        cp = self.current_player

        if move[0] == 'pass':
            self.passed[cp] = True
            return True

        piece_name = move[1]
        r_off, c_off = move[2], move[3]
        rotation = move[4]

        cells = self.pieces[cp][piece_name]
        orients = _all_orientations(cells)
        if rotation >= len(orients):
            rotation = 0
        oriented = orients[rotation]

        if not self._can_place(cp, oriented, r_off, c_off):
            print("  Invalid placement! Must touch your color diagonally, not edge-to-edge.")
            return False

        self._place_piece(cp, oriented, r_off, c_off)
        del self.pieces[cp][piece_name]
        self.first_move[cp] = False
        self.passed[cp] = False
        return True

    def check_game_over(self):
        # Both passed or both out of pieces
        if self.passed[1] and self.passed[2]:
            self.game_over = True
        elif not self.pieces[1] and not self.pieces[2]:
            self.game_over = True
        elif not self._has_valid_move(1) and not self._has_valid_move(2):
            self.game_over = True

        if self.game_over:
            s1 = self._score(1)
            s2 = self._score(2)
            if s1 > s2:  # less negative = better
                self.winner = 1
            elif s2 > s1:
                self.winner = 2
            else:
                self.winner = None

    def get_state(self):
        return {
            'board_size': self.board_size,
            'board': self.board,
            'pieces': {str(p): {name: cells for name, cells in pieces.items()}
                      for p, pieces in self.pieces.items()},
            'first_move': {str(k): v for k, v in self.first_move.items()},
            'passed': {str(k): v for k, v in self.passed.items()},
            'starts': {str(k): list(v) for k, v in self.starts.items()},
        }

    def load_state(self, state):
        self.board_size = state['board_size']
        self.board = state['board']
        self.pieces = {int(k): {name: [tuple(c) for c in cells] for name, cells in v.items()}
                      for k, v in state['pieces'].items()}
        self.first_move = {int(k): v for k, v in state['first_move'].items()}
        self.passed = {int(k): v for k, v in state['passed'].items()}
        self.starts = {int(k): tuple(v) for k, v in state['starts'].items()}

    def get_tutorial(self):
        return """
  ============================================================
    BLOKUS DUO - Tutorial
  ============================================================

  OVERVIEW
    Place polyomino pieces on a shared board. Each player has
    21 pieces of different shapes (1-5 squares each).

  RULES
    1. First piece must cover your starting corner (+)
    2. Each new piece must touch your own color DIAGONALLY
    3. Pieces must NEVER touch your own color edge-to-edge
    4. Pieces can touch opponent's color any way
    5. Pieces cannot overlap

  PLACING PIECES
    Format: PIECE_NAME ROW COL [rotation]
    Example: 'L4 E 5 2'
    Type 'show PIECE_NAME' to see all rotations.

  PIECE NAMES
    1, 2, I3, L3, I4, L4, T4, S4, O4
    I5, L5, Y5, T5, U5, P5, S5, Z5, W5, F5, N5, X5

  SCORING
    The player with fewer remaining squares wins.
    If tied, it's a draw.

  STRATEGY
    - Place large pieces early when space is available
    - Block your opponent's diagonal connections
    - Keep paths open for your own future placements"""
