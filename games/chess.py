"""Chess with variations: Standard, Chess960, King of the Hill, Three-Check."""

import random
import copy
from engine.base import BaseGame, input_with_quit, clear_screen

PIECES = {
    'K': '♔', 'Q': '♕', 'R': '♖', 'B': '♗', 'N': '♘', 'P': '♙',
    'k': '♚', 'q': '♛', 'r': '♜', 'b': '♝', 'n': '♞', 'p': '♟'
}

PIECE_VALUES = {'P': 1, 'N': 3, 'B': 3, 'R': 5, 'Q': 9, 'K': 0}


def is_white(piece):
    return piece is not None and piece.isupper()


def is_black(piece):
    return piece is not None and piece.islower()


def piece_color(piece):
    if piece is None:
        return None
    return 1 if piece.isupper() else 2


class ChessGame(BaseGame):
    name = "Chess"
    description = "The classic strategy game of kings and queens"
    variations = {
        "standard": "Standard Chess",
        "chess960": "Chess960 (Fischer Random)",
        "king_of_hill": "King of the Hill",
        "three_check": "Three-Check Chess"
    }

    def __init__(self, variation=None):
        super().__init__(variation or "standard")
        self.board = [[None]*8 for _ in range(8)]
        self.castling = {'K': True, 'Q': True, 'k': True, 'q': True}
        self.en_passant = None  # (row, col) of en passant target square
        self.halfmove_clock = 0
        self.checks_given = {1: 0, 2: 0}
        self.king_pos = {1: (7, 4), 2: (0, 4)}
        self.rook_start = {'K': 7, 'Q': 0, 'k': 7, 'q': 0}  # columns for castling rooks

    def setup(self):
        if self.variation == "chess960":
            self._setup_960()
        else:
            self._setup_standard()

    def _setup_standard(self):
        # Black pieces
        self.board[0] = ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r']
        self.board[1] = ['p'] * 8
        for r in range(2, 6):
            self.board[r] = [None] * 8
        self.board[6] = ['P'] * 8
        self.board[7] = ['R', 'N', 'B', 'Q', 'K', 'B', 'N', 'R']
        self.king_pos = {1: (7, 4), 2: (0, 4)}
        self.rook_start = {'K': 7, 'Q': 0, 'k': 7, 'q': 0}

    def _setup_960(self):
        # Generate Fischer Random starting position
        pieces = [None] * 8
        # Place bishops on opposite colors
        pieces[random.choice([0, 2, 4, 6])] = 'B'
        pieces[random.choice([1, 3, 5, 7])] = 'B'
        # Place queen on random empty
        empties = [i for i in range(8) if pieces[i] is None]
        pieces[random.choice(empties)] = 'Q'
        # Place knights on random empties
        empties = [i for i in range(8) if pieces[i] is None]
        pieces[random.choice(empties)] = 'N'
        empties = [i for i in range(8) if pieces[i] is None]
        pieces[random.choice(empties)] = 'N'
        # Remaining 3 squares: R K R (left to right)
        empties = [i for i in range(8) if pieces[i] is None]
        pieces[empties[0]] = 'R'
        pieces[empties[1]] = 'K'
        pieces[empties[2]] = 'R'

        self.board[7] = list(pieces)
        self.board[6] = ['P'] * 8
        for r in range(2, 6):
            self.board[r] = [None] * 8
        self.board[1] = ['p'] * 8
        self.board[0] = [p.lower() for p in pieces]

        # Find king and rook positions for castling
        king_col = pieces.index('K')
        self.king_pos = {1: (7, king_col), 2: (0, king_col)}
        rook_cols = [i for i, p in enumerate(pieces) if p == 'R']
        self.rook_start = {
            'Q': rook_cols[0], 'K': rook_cols[1],
            'q': rook_cols[0], 'k': rook_cols[1]
        }

    def display(self):
        print(f"\n  {self.name} ({self.variation})")
        v_info = ""
        if self.variation == "three_check":
            v_info = f"  Checks - White: {self.checks_given[1]}/3  Black: {self.checks_given[2]}/3"
        print(f"  Turn {self.turn_number} | {self.players[self.current_player - 1]}"
              f" ({'White' if self.current_player == 1 else 'Black'})")
        if v_info:
            print(v_info)
        print()
        print("    a  b  c  d  e  f  g  h")
        print("  ┌──┬──┬──┬──┬──┬──┬──┬──┐")
        for r in range(8):
            row_num = 8 - r
            row_str = f"{row_num} │"
            for c in range(8):
                piece = self.board[r][c]
                if piece:
                    row_str += PIECES.get(piece, piece) + " │"
                else:
                    bg = "· " if (r + c) % 2 == 0 else "  "
                    row_str += bg + "│"
            print(f"  {row_str} {row_num}")
            if r < 7:
                print("  ├──┼──┼──┼──┼──┼──┼──┼──┤")
        print("  └──┴──┴──┴──┴──┴──┴──┴──┘")
        print("    a  b  c  d  e  f  g  h")

        if self._is_in_check(self.current_player):
            print("  *** CHECK! ***")
        print()

    def _parse_square(self, s):
        """Parse 'e4' to (row, col)."""
        if len(s) != 2:
            return None
        col = ord(s[0].lower()) - ord('a')
        row = 8 - int(s[1])
        if 0 <= row <= 7 and 0 <= col <= 7:
            return (row, col)
        return None

    def _square_name(self, row, col):
        return chr(ord('a') + col) + str(8 - row)

    def get_move(self):
        move_str = input_with_quit(
            f"  {'White' if self.current_player == 1 else 'Black'}'s move "
            f"(e.g. e2e4, e2-e4): "
        )
        return move_str.strip().replace('-', '').replace(' ', '')

    def make_move(self, move_str):
        move_str = move_str.lower()

        # Handle castling notation
        if move_str in ('o-o', 'oo', '0-0', 'o-o-o', 'ooo', '0-0-0'):
            return self._try_castle(move_str)

        # Parse from-to
        if len(move_str) == 4:
            fr = self._parse_square(move_str[:2])
            to = self._parse_square(move_str[2:4])
            promo = None
        elif len(move_str) == 5:
            fr = self._parse_square(move_str[:2])
            to = self._parse_square(move_str[2:4])
            promo = move_str[4]
        else:
            return False

        if fr is None or to is None:
            return False

        piece = self.board[fr[0]][fr[1]]
        if piece is None:
            return False
        if piece_color(piece) != self.current_player:
            return False

        # Check if move is in legal moves
        legal = self._get_legal_moves(fr[0], fr[1])
        if to not in legal:
            return False

        # Execute move
        return self._execute_move(fr, to, promo)

    def _execute_move(self, fr, to, promo=None):
        r1, c1 = fr
        r2, c2 = to
        piece = self.board[r1][c1]
        captured = self.board[r2][c2]
        is_pawn = piece.upper() == 'P'

        # En passant capture
        if is_pawn and to == self.en_passant:
            cap_row = r1  # captured pawn is on same row as moving pawn
            self.board[cap_row][c2] = None
            captured = True

        # Update en passant
        old_ep = self.en_passant
        self.en_passant = None
        if is_pawn and abs(r2 - r1) == 2:
            self.en_passant = ((r1 + r2) // 2, c1)

        # Castling - detect king moving 2+ squares
        if piece.upper() == 'K' and abs(c2 - c1) >= 2:
            # This is a castling move
            if c2 > c1:  # Kingside
                rook_from = self.rook_start['K' if self.current_player == 1 else 'k']
                rook_to = c2 - 1
                rook_row = r1
                rook = 'R' if self.current_player == 1 else 'r'
                self.board[rook_row][rook_from] = None
                self.board[rook_row][rook_to] = rook
            else:  # Queenside
                rook_from = self.rook_start['Q' if self.current_player == 1 else 'q']
                rook_to = c2 + 1
                rook_row = r1
                rook = 'R' if self.current_player == 1 else 'r'
                self.board[rook_row][rook_from] = None
                self.board[rook_row][rook_to] = rook

        # Move piece
        self.board[r2][c2] = piece
        self.board[r1][c1] = None

        # Pawn promotion
        if is_pawn and (r2 == 0 or r2 == 7):
            if promo and promo in 'qrbn':
                new_piece = promo.upper() if self.current_player == 1 else promo.lower()
            else:
                new_piece = 'Q' if self.current_player == 1 else 'q'
            self.board[r2][c2] = new_piece

        # Update king position
        if piece.upper() == 'K':
            self.king_pos[self.current_player] = (r2, c2)

        # Update castling rights
        if piece.upper() == 'K':
            if self.current_player == 1:
                self.castling['K'] = False
                self.castling['Q'] = False
            else:
                self.castling['k'] = False
                self.castling['q'] = False

        if piece.upper() == 'R':
            row = 7 if self.current_player == 1 else 0
            if r1 == row:
                if c1 == self.rook_start.get('K' if self.current_player == 1 else 'k'):
                    self.castling['K' if self.current_player == 1 else 'k'] = False
                if c1 == self.rook_start.get('Q' if self.current_player == 1 else 'q'):
                    self.castling['Q' if self.current_player == 1 else 'q'] = False

        # If rook captured on starting square, remove castling right
        if captured:
            if r2 == 0:
                if c2 == self.rook_start.get('k'):
                    self.castling['k'] = False
                if c2 == self.rook_start.get('q'):
                    self.castling['q'] = False
            if r2 == 7:
                if c2 == self.rook_start.get('K'):
                    self.castling['K'] = False
                if c2 == self.rook_start.get('Q'):
                    self.castling['Q'] = False

        # Track checks for three_check
        opponent = 2 if self.current_player == 1 else 1
        if self._is_in_check(opponent):
            self.checks_given[self.current_player] += 1

        # Halfmove clock
        if is_pawn or captured:
            self.halfmove_clock = 0
        else:
            self.halfmove_clock += 1

        return True

    def _try_castle(self, notation):
        row = 7 if self.current_player == 1 else 0
        kr, kc = self.king_pos[self.current_player]

        if 'ooo' in notation or '0-0-0' in notation:
            # Queenside
            side = 'Q' if self.current_player == 1 else 'q'
            target_kc = 2
            target_rc = 3
        else:
            # Kingside
            side = 'K' if self.current_player == 1 else 'k'
            target_kc = 6
            target_rc = 5

        if not self.castling.get(side, False):
            return False

        rook_col = self.rook_start[side]
        rook = self.board[row][rook_col]
        if rook is None or rook.upper() != 'R':
            return False

        # Check king not in check
        if self._is_in_check(self.current_player):
            return False

        # Check squares between king and target are empty (excluding king and rook)
        min_c = min(kc, target_kc, rook_col, target_rc)
        max_c = max(kc, target_kc, rook_col, target_rc)
        for c in range(min_c, max_c + 1):
            if c == kc or c == rook_col:
                continue
            if self.board[row][c] is not None:
                return False

        # Check king doesn't pass through check
        step = 1 if target_kc > kc else -1
        for c in range(kc, target_kc + step, step):
            # Temporarily place king
            old_kp = self.king_pos[self.current_player]
            self.king_pos[self.current_player] = (row, c)
            old_piece = self.board[row][c]
            self.board[row][c] = 'K' if self.current_player == 1 else 'k'
            orig_piece = self.board[row][kc]
            if c != kc:
                self.board[row][kc] = None
            in_check = self._is_in_check(self.current_player)
            self.board[row][c] = old_piece
            if c != kc:
                self.board[row][kc] = orig_piece
            self.king_pos[self.current_player] = old_kp
            if in_check:
                return False

        # Execute castling
        king = self.board[row][kc]
        rook = self.board[row][rook_col]
        self.board[row][kc] = None
        self.board[row][rook_col] = None
        self.board[row][target_kc] = king
        self.board[row][target_rc] = rook
        self.king_pos[self.current_player] = (row, target_kc)

        if self.current_player == 1:
            self.castling['K'] = False
            self.castling['Q'] = False
        else:
            self.castling['k'] = False
            self.castling['q'] = False

        self.en_passant = None
        self.halfmove_clock += 1
        return True

    def _get_pseudo_moves(self, r, c):
        """Get pseudo-legal moves (ignoring check)."""
        piece = self.board[r][c]
        if piece is None:
            return []
        moves = []
        color = piece_color(piece)
        pt = piece.upper()

        if pt == 'P':
            direction = -1 if color == 1 else 1
            start_row = 6 if color == 1 else 1
            # Forward
            nr = r + direction
            if 0 <= nr <= 7 and self.board[nr][c] is None:
                moves.append((nr, c))
                # Double forward
                if r == start_row:
                    nr2 = r + 2 * direction
                    if self.board[nr2][c] is None:
                        moves.append((nr2, c))
            # Captures
            for dc in [-1, 1]:
                nc = c + dc
                if 0 <= nc <= 7 and 0 <= nr <= 7:
                    target = self.board[nr][nc]
                    if target is not None and piece_color(target) != color:
                        moves.append((nr, nc))
                    if self.en_passant == (nr, nc):
                        moves.append((nr, nc))

        elif pt == 'N':
            for dr, dc in [(-2,-1),(-2,1),(-1,-2),(-1,2),(1,-2),(1,2),(2,-1),(2,1)]:
                nr, nc = r+dr, c+dc
                if 0 <= nr <= 7 and 0 <= nc <= 7:
                    target = self.board[nr][nc]
                    if target is None or piece_color(target) != color:
                        moves.append((nr, nc))

        elif pt == 'B':
            for dr, dc in [(-1,-1),(-1,1),(1,-1),(1,1)]:
                nr, nc = r+dr, c+dc
                while 0 <= nr <= 7 and 0 <= nc <= 7:
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

        elif pt == 'R':
            for dr, dc in [(-1,0),(1,0),(0,-1),(0,1)]:
                nr, nc = r+dr, c+dc
                while 0 <= nr <= 7 and 0 <= nc <= 7:
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

        elif pt == 'Q':
            for dr, dc in [(-1,-1),(-1,0),(-1,1),(0,-1),(0,1),(1,-1),(1,0),(1,1)]:
                nr, nc = r+dr, c+dc
                while 0 <= nr <= 7 and 0 <= nc <= 7:
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

        elif pt == 'K':
            for dr in [-1, 0, 1]:
                for dc in [-1, 0, 1]:
                    if dr == 0 and dc == 0:
                        continue
                    nr, nc = r+dr, c+dc
                    if 0 <= nr <= 7 and 0 <= nc <= 7:
                        target = self.board[nr][nc]
                        if target is None or piece_color(target) != color:
                            moves.append((nr, nc))
            # Castling moves (king moves 2 squares)
            king_row = 7 if color == 1 else 0
            if r == king_row:
                # Kingside
                ks = 'K' if color == 1 else 'k'
                if self.castling.get(ks, False):
                    target_kc = 6
                    moves.append((king_row, target_kc))
                # Queenside
                qs = 'Q' if color == 1 else 'q'
                if self.castling.get(qs, False):
                    target_kc = 2
                    moves.append((king_row, target_kc))

        return moves

    def _get_legal_moves(self, r, c):
        """Get legal moves for piece at (r, c), filtering out moves that leave king in check."""
        piece = self.board[r][c]
        if piece is None:
            return []
        color = piece_color(piece)
        pseudo = self._get_pseudo_moves(r, c)
        legal = []

        for to_r, to_c in pseudo:
            # For castling (king moving 2+ squares), validate separately
            if piece.upper() == 'K' and abs(to_c - c) >= 2:
                # Will be validated in make_move via _try_castle
                legal.append((to_r, to_c))
                continue

            # Simulate move
            old_board = [row[:] for row in self.board]
            old_kp = dict(self.king_pos)
            old_ep = self.en_passant

            # En passant capture
            if piece.upper() == 'P' and (to_r, to_c) == self.en_passant:
                self.board[r][to_c] = None

            self.board[to_r][to_c] = piece
            self.board[r][c] = None
            if piece.upper() == 'K':
                self.king_pos[color] = (to_r, to_c)

            if not self._is_in_check(color):
                legal.append((to_r, to_c))

            # Restore
            self.board = old_board
            self.king_pos = old_kp
            self.en_passant = old_ep

        return legal

    def _is_in_check(self, color):
        """Check if the given color's king is in check."""
        kr, kc = self.king_pos[color]
        opponent = 2 if color == 1 else 1

        # Check from all opponent pieces
        for r in range(8):
            for c in range(8):
                piece = self.board[r][c]
                if piece is not None and piece_color(piece) == opponent:
                    attacks = self._get_attacks(r, c)
                    if (kr, kc) in attacks:
                        return True
        return False

    def _get_attacks(self, r, c):
        """Get squares attacked by piece at (r,c) - simpler than pseudo_moves, no castling."""
        piece = self.board[r][c]
        if piece is None:
            return []
        color = piece_color(piece)
        attacks = []
        pt = piece.upper()

        if pt == 'P':
            direction = -1 if color == 1 else 1
            for dc in [-1, 1]:
                nr, nc = r + direction, c + dc
                if 0 <= nr <= 7 and 0 <= nc <= 7:
                    attacks.append((nr, nc))

        elif pt == 'N':
            for dr, dc in [(-2,-1),(-2,1),(-1,-2),(-1,2),(1,-2),(1,2),(2,-1),(2,1)]:
                nr, nc = r+dr, c+dc
                if 0 <= nr <= 7 and 0 <= nc <= 7:
                    attacks.append((nr, nc))

        elif pt == 'B':
            for dr, dc in [(-1,-1),(-1,1),(1,-1),(1,1)]:
                nr, nc = r+dr, c+dc
                while 0 <= nr <= 7 and 0 <= nc <= 7:
                    attacks.append((nr, nc))
                    if self.board[nr][nc] is not None:
                        break
                    nr += dr
                    nc += dc

        elif pt == 'R':
            for dr, dc in [(-1,0),(1,0),(0,-1),(0,1)]:
                nr, nc = r+dr, c+dc
                while 0 <= nr <= 7 and 0 <= nc <= 7:
                    attacks.append((nr, nc))
                    if self.board[nr][nc] is not None:
                        break
                    nr += dr
                    nc += dc

        elif pt == 'Q':
            for dr, dc in [(-1,-1),(-1,0),(-1,1),(0,-1),(0,1),(1,-1),(1,0),(1,1)]:
                nr, nc = r+dr, c+dc
                while 0 <= nr <= 7 and 0 <= nc <= 7:
                    attacks.append((nr, nc))
                    if self.board[nr][nc] is not None:
                        break
                    nr += dr
                    nc += dc

        elif pt == 'K':
            for dr in [-1, 0, 1]:
                for dc in [-1, 0, 1]:
                    if dr == 0 and dc == 0:
                        continue
                    nr, nc = r+dr, c+dc
                    if 0 <= nr <= 7 and 0 <= nc <= 7:
                        attacks.append((nr, nc))

        return attacks

    def _has_legal_moves(self, color):
        for r in range(8):
            for c in range(8):
                piece = self.board[r][c]
                if piece is not None and piece_color(piece) == color:
                    if self._get_legal_moves(r, c):
                        return True
        return False

    def check_game_over(self):
        opponent = 2 if self.current_player == 1 else 1

        # Three-Check variant
        if self.variation == "three_check":
            if self.checks_given[self.current_player] >= 3:
                self.game_over = True
                self.winner = self.current_player
                return

        # King of the Hill variant
        if self.variation == "king_of_hill":
            center = [(3,3),(3,4),(4,3),(4,4)]
            kr, kc = self.king_pos[self.current_player]
            if (kr, kc) in center:
                self.game_over = True
                self.winner = self.current_player
                return

        # Checkmate/Stalemate (check for next player = opponent)
        if not self._has_legal_moves(opponent):
            self.game_over = True
            if self._is_in_check(opponent):
                self.winner = self.current_player  # Checkmate
            else:
                self.winner = None  # Stalemate

        # 50-move rule
        if self.halfmove_clock >= 100:
            self.game_over = True
            self.winner = None

    def get_state(self):
        return {
            'board': [row[:] for row in self.board],
            'castling': dict(self.castling),
            'en_passant': self.en_passant,
            'halfmove_clock': self.halfmove_clock,
            'checks_given': dict(self.checks_given),
            'king_pos': {str(k): list(v) for k, v in self.king_pos.items()},
            'rook_start': dict(self.rook_start)
        }

    def load_state(self, state):
        self.board = state.get('board', [[None]*8 for _ in range(8)])
        self.castling = state.get('castling', {'K': True, 'Q': True, 'k': True, 'q': True})
        ep = state.get('en_passant')
        self.en_passant = tuple(ep) if ep else None
        self.halfmove_clock = state.get('halfmove_clock', 0)
        self.checks_given = {int(k): v for k, v in state.get('checks_given', {1: 0, 2: 0}).items()}
        self.king_pos = {int(k): tuple(v) for k, v in state.get('king_pos', {}).items()}
        self.rook_start = state.get('rook_start', {'K': 7, 'Q': 0, 'k': 7, 'q': 0})

    def get_tutorial(self):
        return """
╔══════════════════════════════════════════════════════════════╗
║                      CHESS TUTORIAL                         ║
╠══════════════════════════════════════════════════════════════╣
║                                                              ║
║  OVERVIEW                                                    ║
║  Chess is a two-player strategy game played on an 8x8 board.║
║  White moves first. The goal is to checkmate the opponent's  ║
║  king (put it in check with no escape).                      ║
║                                                              ║
║  PIECES AND MOVEMENT                                         ║
║  ♔ King   - Moves 1 square in any direction                  ║
║  ♕ Queen  - Moves any number of squares in any direction     ║
║  ♖ Rook   - Moves any number of squares horizontally/vert.   ║
║  ♗ Bishop - Moves any number of squares diagonally           ║
║  ♘ Knight - Moves in an L-shape (2+1), can jump over pieces  ║
║  ♙ Pawn   - Moves forward 1 (or 2 from start), captures diag║
║                                                              ║
║  SPECIAL MOVES                                               ║
║  • Castling: King moves 2 squares toward a rook, rook jumps  ║
║    over. Requires: king and rook haven't moved, no pieces     ║
║    between them, king not in/through/into check.              ║
║    Type: o-o (kingside) or o-o-o (queenside)                 ║
║                                                              ║
║  • En Passant: If a pawn moves 2 squares forward and lands   ║
║    beside an opponent pawn, the opponent can capture it as    ║
║    if it had only moved 1 square (on the next turn only).    ║
║                                                              ║
║  • Promotion: When a pawn reaches the 8th rank, it becomes   ║
║    a queen (or add q/r/b/n after your move, e.g. e7e8q).     ║
║                                                              ║
║  HOW TO ENTER MOVES                                          ║
║  Type the from-square and to-square: e2e4 or e2-e4           ║
║  For castling: o-o or o-o-o                                  ║
║  For promotion: e7e8q (promote to queen)                     ║
║                                                              ║
║  CHECK, CHECKMATE, STALEMATE                                 ║
║  • Check: King is under attack. Must escape check.           ║
║  • Checkmate: King is in check with no legal moves. Game over║
║  • Stalemate: Not in check but no legal moves. Draw.         ║
║                                                              ║
║  VARIATIONS                                                  ║
║  • Standard: Normal chess rules                              ║
║  • Chess960: Pieces on the back rank are randomized          ║
║  • King of the Hill: Win by moving your king to a center     ║
║    square (d4, d5, e4, e5)                                   ║
║  • Three-Check: Win by giving check 3 times                  ║
║                                                              ║
║  Type 'help' during play for commands, 'save' to suspend.    ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
"""
