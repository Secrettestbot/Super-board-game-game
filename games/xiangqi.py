"""Xiangqi (Chinese Chess) with variations: Standard, Small (Half-board)."""

import copy
from engine.base import BaseGame, input_with_quit, clear_screen


# Piece representation: uppercase = Red (player 1), lowercase = Black (player 2)
# K=General, A=Advisor, E=Elephant, H=Horse, R=Chariot, C=Cannon, S=Soldier

PIECE_CHARS = {
    'K': '帥', 'A': '仕', 'E': '相', 'H': '傌', 'R': '俥', 'C': '炮', 'S': '兵',
    'k': '將', 'a': '士', 'e': '象', 'h': '馬', 'r': '車', 'c': '砲', 's': '卒',
}

PIECE_LABELS = {
    'K': 'K', 'A': 'A', 'E': 'E', 'H': 'H', 'R': 'R', 'C': 'C', 'S': 'S',
    'k': 'k', 'a': 'a', 'e': 'e', 'h': 'h', 'r': 'r', 'c': 'c', 's': 's',
}


def is_red(piece):
    return piece is not None and piece.isupper()


def is_black(piece):
    return piece is not None and piece.islower()


def piece_color(piece):
    if piece is None:
        return None
    return 1 if piece.isupper() else 2


class XiangqiGame(BaseGame):
    name = "Xiangqi"
    description = "Chinese Chess - ancient strategy game"
    min_players = 2
    max_players = 2
    variations = {
        "standard": "Standard Xiangqi",
        "small": "Half-board Xiangqi (5x9, fewer pieces)",
    }
    side_labels = ("Red", "Black")

    def __init__(self, variation=None):
        super().__init__(variation or "standard")
        if self.variation == "small":
            self.rows = 5
            self.cols = 9
        else:
            self.rows = 10
            self.cols = 9
        self.board = [[None] * self.cols for _ in range(self.rows)]
        self.general_pos = {1: None, 2: None}

    def setup(self):
        if self.variation == "small":
            self._setup_small()
        else:
            self._setup_standard()

    def _setup_standard(self):
        """Set up the standard 9x10 Xiangqi board.
        Row 0 = top (Black's back rank), Row 9 = bottom (Red's back rank).
        Columns 0-8 correspond to a-i.
        """
        self.rows = 10
        self.cols = 9
        self.board = [[None] * self.cols for _ in range(self.rows)]

        # Black pieces (player 2) - top
        self.board[0] = ['r', 'h', 'e', 'a', 'k', 'a', 'e', 'h', 'r']
        self.board[2][1] = 'c'
        self.board[2][7] = 'c'
        for i in range(0, 9, 2):
            self.board[3][i] = 's'

        # Red pieces (player 1) - bottom
        self.board[9] = ['R', 'H', 'E', 'A', 'K', 'A', 'E', 'H', 'R']
        self.board[7][1] = 'C'
        self.board[7][7] = 'C'
        for i in range(0, 9, 2):
            self.board[6][i] = 'S'

        self.general_pos = {1: (9, 4), 2: (0, 4)}

    def _setup_small(self):
        """Set up the small half-board variant (5 rows x 9 cols).
        Simplified: no river, fewer pieces. Each side has General, 2 Advisors,
        2 Horses, 1 Chariot, 1 Cannon, and 3 Soldiers.
        """
        self.rows = 5
        self.cols = 9
        self.board = [[None] * self.cols for _ in range(self.rows)]

        # Black (player 2) - rows 0-1
        self.board[0] = ['r', 'h', 'a', None, 'k', None, 'a', 'h', 'r']
        self.board[1][1] = 'c'
        self.board[1][3] = 's'
        self.board[1][5] = 's'
        self.board[1][7] = 'c'

        # Red (player 1) - rows 3-4
        self.board[4] = ['R', 'H', 'A', None, 'K', None, 'A', 'H', 'R']
        self.board[3][1] = 'C'
        self.board[3][3] = 'S'
        self.board[3][5] = 'S'
        self.board[3][7] = 'C'

        self.general_pos = {1: (4, 4), 2: (0, 4)}

    def display(self):
        print(f"\n  {self.name} ({self.variations.get(self.variation, self.variation)})")
        color_name = 'Red' if self.current_player == 1 else 'Black'
        print(f"  Turn {self.turn_number} | {self.players[self.current_player - 1]}"
              f" ({color_name})")
        print()

        if self.variation == "small":
            self._display_small()
        else:
            self._display_standard()

        if self._is_in_check(self.current_player):
            print("  *** CHECK! ***")
        print()

    def _display_standard(self):
        """Display the standard 10-row board with river."""
        col_labels = "   a   b   c   d   e   f   g   h   i"
        print(col_labels)
        print("  ┌───┬───┬───┬───┬───┬───┬───┬───┬───┐")
        for r in range(self.rows):
            row_num = self.rows - r
            row_str = f"{row_num:>1} │"
            for c in range(self.cols):
                piece = self.board[r][c]
                if piece:
                    label = PIECE_LABELS[piece]
                    if is_red(piece):
                        cell = f" {label} "
                    else:
                        cell = f"({label})"
                else:
                    cell = " · "
                row_str += cell + "│"
            print(f"  {row_str} {row_num}")
            if r == 4:
                # River
                print("  ├───┼───┼───┼───┼───┼───┼───┼───┼───┤")
                print("  │           ~~~  RIVER  ~~~           │")
                print("  ├───┼───┼───┼───┼───┼───┼───┼───┼───┤")
            elif r < self.rows - 1:
                print("  ├───┼───┼───┼───┼───┼───┼───┼───┼───┤")
        print("  └───┴───┴───┴───┴───┴───┴───┴───┴───┘")
        print(col_labels)
        print()
        print("  Red (Player 1): K=General A=Advisor E=Elephant H=Horse R=Chariot C=Cannon S=Soldier")
        print("  Black (Player 2): (k) (a) (e) (h) (r) (c) (s)  [shown in parentheses]")

    def _display_small(self):
        """Display the small variant board."""
        col_labels = "   a   b   c   d   e   f   g   h   i"
        print(col_labels)
        print("  ┌───┬───┬───┬───┬───┬───┬───┬───┬───┐")
        for r in range(self.rows):
            row_num = self.rows - r
            row_str = f"{row_num:>1} │"
            for c in range(self.cols):
                piece = self.board[r][c]
                if piece:
                    label = PIECE_LABELS[piece]
                    if is_red(piece):
                        cell = f" {label} "
                    else:
                        cell = f"({label})"
                else:
                    cell = " · "
                row_str += cell + "│"
            print(f"  {row_str} {row_num}")
            if r < self.rows - 1:
                print("  ├───┼───┼───┼───┼───┼───┼───┼───┼───┤")
        print("  └───┴───┴───┴───┴───┴───┴───┴───┴───┘")
        print(col_labels)
        print()
        print("  Red: K A H R C S | Black: (k) (a) (h) (r) (c) (s)")

    def _parse_square(self, s):
        """Parse 'a1' to (row, col). Row 1 = bottom row."""
        s = s.strip().lower()
        if len(s) < 2:
            return None
        col_ch = s[0]
        row_str = s[1:]
        if not col_ch.isalpha() or not row_str.isdigit():
            return None
        col = ord(col_ch) - ord('a')
        row_num = int(row_str)
        row = self.rows - row_num
        if 0 <= row < self.rows and 0 <= col < self.cols:
            return (row, col)
        return None

    def _square_name(self, row, col):
        return chr(ord('a') + col) + str(self.rows - row)

    def get_move(self):
        color_name = 'Red' if self.current_player == 1 else 'Black'
        move_str = input_with_quit(
            f"  {color_name}'s move (e.g. e1 e2): "
        )
        return move_str.strip()

    def make_move(self, move_str):
        # Parse "a1 a2" or "a1a2" or "a1-a2"
        move_str = move_str.strip().lower().replace('-', ' ')
        parts = move_str.split()
        if len(parts) == 2:
            fr = self._parse_square(parts[0])
            to = self._parse_square(parts[1])
        elif len(parts) == 1 and len(move_str) == 4:
            fr = self._parse_square(move_str[:2])
            to = self._parse_square(move_str[2:])
        elif len(parts) == 1 and len(move_str) >= 4:
            # Try splitting: letter+digits then letter+digits
            # e.g. "a10b10" for the 10-row board
            split_idx = None
            for i in range(2, len(move_str)):
                if move_str[i].isalpha():
                    split_idx = i
                    break
            if split_idx:
                fr = self._parse_square(move_str[:split_idx])
                to = self._parse_square(move_str[split_idx:])
            else:
                return False
        else:
            return False

        if fr is None or to is None:
            return False

        piece = self.board[fr[0]][fr[1]]
        if piece is None:
            return False
        if piece_color(piece) != self.current_player:
            return False

        # Check if move is legal
        legal = self._get_legal_moves(fr[0], fr[1])
        if to not in legal:
            return False

        # Execute the move
        captured = self.board[to[0]][to[1]]
        self.board[to[0]][to[1]] = piece
        self.board[fr[0]][fr[1]] = None

        # Update general position
        if piece.upper() == 'K':
            self.general_pos[self.current_player] = to

        return True

    def _get_pseudo_moves(self, r, c):
        """Get pseudo-legal moves for piece at (r, c), ignoring check."""
        piece = self.board[r][c]
        if piece is None:
            return []
        color = piece_color(piece)
        pt = piece.upper()
        moves = []

        if pt == 'K':
            moves = self._general_moves(r, c, color)
        elif pt == 'A':
            moves = self._advisor_moves(r, c, color)
        elif pt == 'E':
            moves = self._elephant_moves(r, c, color)
        elif pt == 'H':
            moves = self._horse_moves(r, c, color)
        elif pt == 'R':
            moves = self._chariot_moves(r, c, color)
        elif pt == 'C':
            moves = self._cannon_moves(r, c, color)
        elif pt == 'S':
            moves = self._soldier_moves(r, c, color)

        return moves

    def _in_palace(self, r, c, color):
        """Check if (r, c) is within the palace for the given color."""
        if self.variation == "small":
            # In small variant, palace is columns 3-5 for both sides
            if color == 1:
                return 3 <= c <= 5 and (self.rows - 2) <= r <= (self.rows - 1)
            else:
                return 3 <= c <= 5 and 0 <= r <= 1
        # Standard: palace is columns 3-5, rows 0-2 (black) or 7-9 (red)
        if color == 1:
            return 3 <= c <= 5 and 7 <= r <= 9
        else:
            return 3 <= c <= 5 and 0 <= r <= 2

    def _own_side(self, r, color):
        """Check if row r is on the given color's own side of the board."""
        if self.variation == "small":
            # Small board has no river concept; entire board is valid
            return True
        if color == 1:
            return r >= 5  # Red's side: rows 5-9
        else:
            return r <= 4  # Black's side: rows 0-4

    def _crossed_river(self, r, color):
        """Check if row r has crossed the river for the given color."""
        if self.variation == "small":
            # In small variant, treat crossing as being in opponent's half
            if color == 1:
                return r < self.rows // 2
            else:
                return r >= (self.rows + 1) // 2
        if color == 1:
            return r <= 4  # Red crosses into rows 0-4
        else:
            return r >= 5  # Black crosses into rows 5-9

    def _general_moves(self, r, c, color):
        """General (King): moves one step orthogonally within palace."""
        moves = []
        for dr, dc in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
            nr, nc = r + dr, c + dc
            if 0 <= nr < self.rows and 0 <= nc < self.cols:
                if self._in_palace(nr, nc, color):
                    target = self.board[nr][nc]
                    if target is None or piece_color(target) != color:
                        moves.append((nr, nc))
        return moves

    def _advisor_moves(self, r, c, color):
        """Advisor: moves one step diagonally within palace."""
        moves = []
        for dr, dc in [(-1, -1), (-1, 1), (1, -1), (1, 1)]:
            nr, nc = r + dr, c + dc
            if 0 <= nr < self.rows and 0 <= nc < self.cols:
                if self._in_palace(nr, nc, color):
                    target = self.board[nr][nc]
                    if target is None or piece_color(target) != color:
                        moves.append((nr, nc))
        return moves

    def _elephant_moves(self, r, c, color):
        """Elephant: moves two steps diagonally, cannot cross river, blocked by piece at midpoint."""
        moves = []
        for dr, dc in [(-2, -2), (-2, 2), (2, -2), (2, 2)]:
            nr, nc = r + dr, c + dc
            # Midpoint (the "eye" of the elephant)
            mr, mc = r + dr // 2, c + dc // 2
            if 0 <= nr < self.rows and 0 <= nc < self.cols:
                # Must stay on own side (cannot cross river)
                if self._own_side(nr, color):
                    # Check blocking piece at midpoint
                    if self.board[mr][mc] is None:
                        target = self.board[nr][nc]
                        if target is None or piece_color(target) != color:
                            moves.append((nr, nc))
        return moves

    def _horse_moves(self, r, c, color):
        """Horse: moves like chess knight but can be blocked.
        First moves one step orthogonally, then one step diagonally outward.
        Blocked if piece at the orthogonal midpoint (the 'horse leg').
        """
        moves = []
        # (orthogonal step dr, dc), then (two possible diagonal destinations)
        for odr, odc, dests in [
            (-1, 0, [(-2, -1), (-2, 1)]),
            (1, 0, [(2, -1), (2, 1)]),
            (0, -1, [(-1, -2), (1, -2)]),
            (0, 1, [(-1, 2), (1, 2)]),
        ]:
            # Check the blocking leg
            lr, lc = r + odr, c + odc
            if 0 <= lr < self.rows and 0 <= lc < self.cols:
                if self.board[lr][lc] is not None:
                    continue  # Leg is blocked
                for dr, dc in dests:
                    nr, nc = r + dr, c + dc
                    if 0 <= nr < self.rows and 0 <= nc < self.cols:
                        target = self.board[nr][nc]
                        if target is None or piece_color(target) != color:
                            moves.append((nr, nc))
        return moves

    def _chariot_moves(self, r, c, color):
        """Chariot (Rook): moves any number of squares orthogonally."""
        moves = []
        for dr, dc in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
            nr, nc = r + dr, c + dc
            while 0 <= nr < self.rows and 0 <= nc < self.cols:
                target = self.board[nr][nc]
                if target is None:
                    moves.append((nr, nc))
                elif piece_color(target) != color:
                    moves.append((nr, nc))
                    break
                else:
                    break
                nr += dr
                nc += dc
        return moves

    def _cannon_moves(self, r, c, color):
        """Cannon: moves like chariot when not capturing.
        To capture, must jump over exactly one piece (the screen).
        """
        moves = []
        for dr, dc in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
            nr, nc = r + dr, c + dc
            jumped = False
            while 0 <= nr < self.rows and 0 <= nc < self.cols:
                target = self.board[nr][nc]
                if not jumped:
                    if target is None:
                        moves.append((nr, nc))  # Normal move (no capture)
                    else:
                        jumped = True  # Found the screen piece
                else:
                    # After jumping, can only land on an enemy piece
                    if target is not None:
                        if piece_color(target) != color:
                            moves.append((nr, nc))  # Capture
                        break  # Either captured or blocked by friendly
                nr += dr
                nc += dc
        return moves

    def _soldier_moves(self, r, c, color):
        """Soldier (Pawn): moves forward one step.
        After crossing the river, can also move one step sideways.
        """
        moves = []
        # Forward direction
        if color == 1:
            forward = -1  # Red moves up (decreasing row)
        else:
            forward = 1   # Black moves down (increasing row)

        # Forward move
        nr, nc = r + forward, c
        if 0 <= nr < self.rows and 0 <= nc < self.cols:
            target = self.board[nr][nc]
            if target is None or piece_color(target) != color:
                moves.append((nr, nc))

        # Sideways moves (only after crossing river)
        if self._crossed_river(r, color):
            for dc in [-1, 1]:
                nc2 = c + dc
                if 0 <= nc2 < self.cols:
                    target = self.board[r][nc2]
                    if target is None or piece_color(target) != color:
                        moves.append((r, nc2))

        return moves

    def _get_legal_moves(self, r, c):
        """Get legal moves, filtering out moves that leave own general in check
        or violate the generals-facing rule."""
        piece = self.board[r][c]
        if piece is None:
            return []
        color = piece_color(piece)
        pseudo = self._get_pseudo_moves(r, c)
        legal = []

        for to_r, to_c in pseudo:
            # Simulate the move
            old_board = [row[:] for row in self.board]
            old_gp = dict(self.general_pos)

            self.board[to_r][to_c] = piece
            self.board[r][c] = None
            if piece.upper() == 'K':
                self.general_pos[color] = (to_r, to_c)

            # Check if own general is in check after move
            if not self._is_in_check(color) and not self._generals_facing():
                legal.append((to_r, to_c))

            # Restore
            self.board = old_board
            self.general_pos = old_gp

        return legal

    def _is_in_check(self, color):
        """Check if the given color's general is in check."""
        gpos = self.general_pos.get(color)
        if gpos is None:
            return False
        gr, gc = gpos
        opponent = 2 if color == 1 else 1

        for r in range(self.rows):
            for c in range(self.cols):
                piece = self.board[r][c]
                if piece is not None and piece_color(piece) == opponent:
                    # For cannons and chariots, check attacks directly
                    attacks = self._get_attacks(r, c)
                    if (gr, gc) in attacks:
                        return True
        return False

    def _get_attacks(self, r, c):
        """Get squares that piece at (r,c) attacks/can capture.
        This is the same as pseudo_moves for all pieces."""
        return self._get_pseudo_moves(r, c)

    def _generals_facing(self):
        """Check if the two generals face each other on the same column
        with no pieces between them. This is an illegal position."""
        g1 = self.general_pos.get(1)
        g2 = self.general_pos.get(2)
        if g1 is None or g2 is None:
            return False
        r1, c1 = g1
        r2, c2 = g2
        if c1 != c2:
            return False
        # Check for pieces between them
        min_r = min(r1, r2)
        max_r = max(r1, r2)
        for row in range(min_r + 1, max_r):
            if self.board[row][c1] is not None:
                return False
        return True  # Facing each other with nothing between

    def _has_legal_moves(self, color):
        """Check if the given color has any legal move."""
        for r in range(self.rows):
            for c in range(self.cols):
                piece = self.board[r][c]
                if piece is not None and piece_color(piece) == color:
                    if self._get_legal_moves(r, c):
                        return True
        return False

    def get_ai_move(self):
        import random as rand
        difficulty = getattr(self, 'ai_difficulty', 'medium')
        color = self.current_player

        all_moves = []
        for r in range(self.rows):
            for c in range(self.cols):
                piece = self.board[r][c]
                if piece is not None and piece_color(piece) == color:
                    legal = self._get_legal_moves(r, c)
                    for tr, tc in legal:
                        all_moves.append((r, c, tr, tc))

        if not all_moves:
            return "a1 a1"

        if difficulty == 'easy':
            fr, fc, tr, tc = rand.choice(all_moves)
            return f"{self._square_name(fr, fc)} {self._square_name(tr, tc)}"

        piece_val = {'K': 999, 'R': 9, 'C': 4.5, 'H': 4, 'A': 2, 'E': 2, 'S': 1}
        opp = 2 if color == 1 else 1

        scored = []
        for fr, fc, tr, tc in all_moves:
            score = 0
            piece = self.board[fr][fc]
            captured = self.board[tr][tc]
            if captured:
                score += piece_val.get(captured.upper(), 1) * 10

            score += (4 - abs(tc - 4)) * 0.1

            old_board = [row[:] for row in self.board]
            old_gp = dict(self.general_pos)
            self.board[tr][tc] = piece
            self.board[fr][fc] = None
            if piece.upper() == 'K':
                self.general_pos[color] = (tr, tc)
            if self._is_in_check(opp):
                score += 3
            self.board = old_board
            self.general_pos = old_gp

            if piece.upper() == 'S' and self._crossed_river(tr, color):
                score += 1

            scored.append((score, fr, fc, tr, tc))

        scored.sort(key=lambda x: -x[0])

        if difficulty == 'hard':
            choice = scored[0]
        else:
            top = scored[:max(1, len(scored) // 3 + 1)]
            choice = rand.choice(top)

        _, fr, fc, tr, tc = choice
        return f"{self._square_name(fr, fc)} {self._square_name(tr, tc)}"

    def check_game_over(self):
        opponent = 2 if self.current_player == 1 else 1

        # Check if opponent's general is captured (shouldn't happen normally,
        # but handle edge cases)
        opp_general_exists = False
        for r in range(self.rows):
            for c in range(self.cols):
                piece = self.board[r][c]
                if piece is not None and piece.upper() == 'K' and piece_color(piece) == opponent:
                    opp_general_exists = True
                    self.general_pos[opponent] = (r, c)
                    break
            if opp_general_exists:
                break

        if not opp_general_exists:
            self.game_over = True
            self.winner = self.current_player
            return

        # Checkmate or stalemate for the opponent
        if not self._has_legal_moves(opponent):
            self.game_over = True
            if self._is_in_check(opponent):
                self.winner = self.current_player  # Checkmate
            else:
                # In Xiangqi, stalemate is a loss for the stalemated player
                self.winner = self.current_player
            return

    def get_state(self):
        return {
            'board': [row[:] for row in self.board],
            'rows': self.rows,
            'cols': self.cols,
            'general_pos': {str(k): list(v) for k, v in self.general_pos.items()},
        }

    def load_state(self, state):
        self.board = state.get('board', [[None] * self.cols for _ in range(self.rows)])
        self.rows = state.get('rows', self.rows)
        self.cols = state.get('cols', self.cols)
        gp = state.get('general_pos', {})
        self.general_pos = {int(k): tuple(v) for k, v in gp.items()}

    def get_tutorial(self):
        return """
╔══════════════════════════════════════════════════════════════╗
║                    XIANGQI (CHINESE CHESS)                    ║
╠══════════════════════════════════════════════════════════════╣
║                                                              ║
║  OVERVIEW                                                    ║
║  Xiangqi is a two-player strategy game played on a 9x10      ║
║  board with a river dividing the two sides. Red moves first. ║
║  The goal is to checkmate the opponent's General.             ║
║                                                              ║
║  THE BOARD                                                   ║
║  • 9 columns (a-i) and 10 rows (1-10)                        ║
║  • A river divides the board between rows 5 and 6            ║
║  • Each side has a 3x3 palace (columns d-f, rows 1-3 for    ║
║    Red, rows 8-10 for Black)                                 ║
║                                                              ║
║  PIECES AND MOVEMENT                                         ║
║  K  General  - Moves 1 step orthogonally, stays in palace.   ║
║                Cannot face the opposing General on the same   ║
║                column with no pieces between them.            ║
║  A  Advisor  - Moves 1 step diagonally, stays in palace.     ║
║  E  Elephant - Moves 2 steps diagonally. Cannot cross the    ║
║                river. Blocked if a piece is at the midpoint   ║
║                (the "elephant's eye").                        ║
║  H  Horse    - Moves like a chess knight (one step ortho-    ║
║                gonally then one step diagonally outward).     ║
║                Blocked if a piece is at the orthogonal        ║
║                midpoint (the "horse's leg").                  ║
║  R  Chariot  - Moves any number of squares orthogonally      ║
║                (same as a chess Rook).                        ║
║  C  Cannon   - Moves like the Chariot when not capturing.    ║
║                To capture, it must jump over exactly one      ║
║                piece (the "screen") in the line of attack.   ║
║  S  Soldier  - Moves 1 step forward. After crossing the      ║
║                river, can also move 1 step sideways.          ║
║                Cannot move backward.                         ║
║                                                              ║
║  DISPLAY                                                     ║
║  Red pieces are shown as plain letters:  K A E H R C S       ║
║  Black pieces are shown in parentheses:  (k)(a)(e)(h)(r)(c)(s)║
║                                                              ║
║  HOW TO ENTER MOVES                                          ║
║  Type the from-square and to-square separated by a space:    ║
║    e1 e2     (move piece from e1 to e2)                      ║
║    b10 c8    (move piece from b10 to c8)                     ║
║  You can also use: e1e2 or e1-e2                             ║
║                                                              ║
║  CHECK AND CHECKMATE                                         ║
║  • Check: The General is under attack and must escape.       ║
║  • Checkmate: The General is in check with no legal move.    ║
║  • Stalemate: In Xiangqi, a player with no legal moves       ║
║    loses (unlike Western chess where it is a draw).           ║
║                                                              ║
║  SPECIAL RULES                                               ║
║  • Generals cannot face each other on the same column with   ║
║    no intervening pieces (the "flying general" rule).        ║
║  • Perpetual check is forbidden (the checking side must      ║
║    break the cycle).                                         ║
║                                                              ║
║  VARIATIONS                                                  ║
║  • Standard: Full 9x10 board with all pieces.               ║
║  • Small: Half-board (5x9) with fewer pieces for a quicker  ║
║    game.                                                     ║
║                                                              ║
║  COMMANDS                                                    ║
║  Type 'help' during play for commands, 'save' to suspend.    ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
"""
