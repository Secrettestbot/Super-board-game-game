"""Shogi (Japanese Chess) - Strategy game with piece drops."""

from engine.base import BaseGame, input_with_quit, clear_screen


class ShogiGame(BaseGame):
    """Shogi: Japanese Chess with piece drops and promotion."""

    name = "Shogi"
    description = "Japanese Chess with piece drops"
    min_players = 2
    max_players = 2
    variations = {
        "standard": "Standard Shogi (9x9)",
        "mini": "Mini Shogi (5x5)",
    }

    # Piece types
    KING = 'K'
    ROOK = 'R'
    BISHOP = 'B'
    GOLD = 'G'
    SILVER = 'S'
    KNIGHT = 'N'
    LANCE = 'L'
    PAWN = 'P'
    # Promoted pieces
    PROOK = '+R'
    PBISHOP = '+B'
    PSILVER = '+S'
    PKNIGHT = '+N'
    PLANCE = '+L'
    PPAWN = '+P'

    PROMOTABLE = {'R', 'B', 'S', 'N', 'L', 'P'}
    PROMOTION_MAP = {'R': '+R', 'B': '+B', 'S': '+S', 'N': '+N', 'L': '+L', 'P': '+P'}
    UNPROMOTION_MAP = {'+R': 'R', '+B': 'B', '+S': 'S', '+N': 'N', '+L': 'L', '+P': 'P'}

    # Display symbols
    PIECE_DISPLAY = {
        'K': 'K', 'R': 'R', 'B': 'B', 'G': 'G', 'S': 'S',
        'N': 'N', 'L': 'L', 'P': 'P',
        '+R': 'D', '+B': 'H', '+S': 'g', '+N': 'n', '+L': 'l', '+P': 'p',
    }
    PIECE_NAMES = {
        'K': 'King', 'R': 'Rook', 'B': 'Bishop', 'G': 'Gold', 'S': 'Silver',
        'N': 'Knight', 'L': 'Lance', 'P': 'Pawn',
        '+R': 'Dragon', '+B': 'Horse', '+S': 'P.Silver', '+N': 'P.Knight',
        '+L': 'P.Lance', '+P': 'Tokin',
    }

    def __init__(self, variation=None):
        super().__init__(variation or "standard")
        self.board = {}
        self.hands = {1: [], 2: []}
        self.in_check = {1: False, 2: False}

    def setup(self):
        self.board = {}
        self.hands = {1: [], 2: []}
        self.in_check = {1: False, 2: False}

        if self.variation == "mini":
            self._setup_mini()
        else:
            self._setup_standard()

    def _setup_standard(self):
        self.rows = 9
        self.cols = 9
        # Player 2 (Gote) - top of board (rows 0-2)
        # Back row (row 0)
        back2 = ['L', 'N', 'S', 'G', 'K', 'G', 'S', 'N', 'L']
        for c, piece in enumerate(back2):
            self.board[(0, c)] = (2, piece)
        # Rook and Bishop
        self.board[(1, 1)] = (2, 'B')
        self.board[(1, 7)] = (2, 'R')
        # Pawns
        for c in range(9):
            self.board[(2, c)] = (2, 'P')

        # Player 1 (Sente) - bottom of board (rows 6-8)
        back1 = ['L', 'N', 'S', 'G', 'K', 'G', 'S', 'N', 'L']
        for c, piece in enumerate(back1):
            self.board[(8, c)] = (1, piece)
        self.board[(7, 7)] = (1, 'B')
        self.board[(7, 1)] = (1, 'R')
        for c in range(9):
            self.board[(6, c)] = (1, 'P')

    def _setup_mini(self):
        self.rows = 5
        self.cols = 5
        # Player 2 (top)
        mini2 = ['K', 'G', 'S', 'B', 'R']
        for c, piece in enumerate(mini2):
            self.board[(0, c)] = (2, piece)
        self.board[(1, 0)] = (2, 'P')

        # Player 1 (bottom)
        mini1 = ['R', 'B', 'S', 'G', 'K']
        for c, piece in enumerate(mini1):
            self.board[(4, c)] = (1, piece)
        self.board[(3, 4)] = (1, 'P')

    def _col_to_letter(self, c):
        return chr(ord('a') + c)

    def _letter_to_col(self, ch):
        return ord(ch.lower()) - ord('a')

    def _row_to_num(self, r):
        return self.rows - r

    def _num_to_row(self, n):
        return self.rows - n

    def _sq_to_str(self, r, c):
        return f"{self._col_to_letter(c)}{self._row_to_num(r)}"

    def _parse_sq(self, s):
        if len(s) < 2:
            return None
        col = self._letter_to_col(s[0])
        try:
            row = self._num_to_row(int(s[1:]))
        except ValueError:
            return None
        if 0 <= row < self.rows and 0 <= col < self.cols:
            return (row, col)
        return None

    def display(self):
        p = self.players[self.current_player - 1]
        print(f"\n  {self.name} ({self.variation})  --  Turn {self.turn_number + 1}")
        print(f"  {self.players[0]} (Sente/v)  vs  {self.players[1]} (Gote/^)")
        print(f"  Current: {p}\n")

        # Show Player 2's hand
        hand2_str = self._format_hand(2)
        print(f"  Gote hand: [{hand2_str}]")
        print()

        # Column headers
        cols_hdr = "   " + "  ".join(self._col_to_letter(c) for c in range(self.cols))
        print(cols_hdr)
        print("  +" + "---" * self.cols + "+")

        for r in range(self.rows):
            row_parts = []
            for c in range(self.cols):
                if (r, c) in self.board:
                    player, piece = self.board[(r, c)]
                    sym = self.PIECE_DISPLAY.get(piece, piece[0])
                    if player == 1:
                        row_parts.append(f" {sym}v")
                    else:
                        row_parts.append(f"^{sym} ")
                else:
                    row_parts.append(" . ")
            print(f"{self._row_to_num(r):2d}|{'|'.join(row_parts)}|")

        print("  +" + "---" * self.cols + "+")

        # Show Player 1's hand
        hand1_str = self._format_hand(1)
        print(f"  Sente hand: [{hand1_str}]")

        if self.in_check.get(self.current_player, False):
            print(f"\n  *** CHECK! ***")
        print()

    def _format_hand(self, player):
        hand = sorted(self.hands[player])
        if not hand:
            return "empty"
        counts = {}
        for p in hand:
            counts[p] = counts.get(p, 0) + 1
        parts = []
        for piece in sorted(counts.keys()):
            if counts[piece] > 1:
                parts.append(f"{piece}x{counts[piece]}")
            else:
                parts.append(piece)
        return " ".join(parts)

    def get_move(self):
        player_name = self.players[self.current_player - 1]
        while True:
            raw = input_with_quit(f"  {player_name}, enter move (e.g. e2 e3) or drop (P*e3): ")
            raw = raw.strip()
            if not raw:
                continue

            # Check for drop: P*e3
            if len(raw) >= 3 and '*' in raw:
                parts = raw.split('*')
                if len(parts) == 2:
                    piece = parts[0].upper()
                    sq = self._parse_sq(parts[1].strip())
                    if sq and piece in self.PROMOTABLE | {'G'}:
                        return ('drop', piece, sq)

            # Regular move: e2 e3 or e2 e3+
            parts = raw.split()
            if len(parts) >= 2:
                promote = parts[-1].endswith('+') or (len(parts) > 2 and parts[2] == '+')
                dest_str = parts[1].rstrip('+')
                fr = self._parse_sq(parts[0])
                to = self._parse_sq(dest_str)
                if fr and to:
                    return ('move', fr, to, promote)

            print("  Invalid format. Use 'e2 e3' for move, 'e2 e3+' to promote, 'P*e3' for drop.")

    def make_move(self, move):
        if move[0] == 'drop':
            return self._do_drop(move[1], move[2])
        else:
            return self._do_move(move[1], move[2], move[3])

    def _do_drop(self, piece, sq):
        player = self.current_player
        if piece not in self.hands[player]:
            print("  You don't have that piece in hand.")
            return False
        if sq in self.board:
            print("  That square is occupied.")
            return False

        # Pawn drop restrictions
        if piece == 'P':
            # No two pawns in same column
            for (r, c), (pl, pc) in self.board.items():
                if pl == player and pc == 'P' and c == sq[1]:
                    print("  Can't drop pawn - you already have a pawn in that column.")
                    return False
            # Can't drop on last rank
            if player == 1 and sq[0] == 0:
                print("  Can't drop pawn on last rank.")
                return False
            if player == 2 and sq[0] == self.rows - 1:
                print("  Can't drop pawn on last rank.")
                return False

        # Lance can't drop on last rank
        if piece == 'L':
            if player == 1 and sq[0] == 0:
                return False
            if player == 2 and sq[0] == self.rows - 1:
                return False

        # Knight can't drop on last 2 ranks
        if piece == 'N':
            if player == 1 and sq[0] <= 1:
                return False
            if player == 2 and sq[0] >= self.rows - 2:
                return False

        # Place piece
        self.board[sq] = (player, piece)
        self.hands[player].remove(piece)

        # Check if this causes self-check
        if self._is_in_check(player):
            # Undo
            del self.board[sq]
            self.hands[player].append(piece)
            print("  Drop would leave you in check.")
            return False

        return True

    def _do_move(self, fr, to, promote):
        player = self.current_player
        if fr not in self.board:
            print("  No piece there.")
            return False

        pl, piece = self.board[fr]
        if pl != player:
            print("  Not your piece.")
            return False

        # Check if move is legal for this piece type
        if not self._is_valid_piece_move(player, piece, fr, to):
            print("  Illegal move for that piece.")
            return False

        # Can't capture own piece
        if to in self.board and self.board[to][0] == player:
            print("  Can't capture your own piece.")
            return False

        # Execute move
        captured = self.board.get(to)
        del self.board[fr]
        self.board[to] = (player, piece)

        # Check for self-check
        if self._is_in_check(player):
            # Undo
            self.board[fr] = (player, piece)
            if captured:
                self.board[to] = captured
            else:
                del self.board[to]
            print("  Move would leave you in check.")
            return False

        # Handle capture - add to hand (unpromoted)
        if captured:
            cap_player, cap_piece = captured
            base = self.UNPROMOTION_MAP.get(cap_piece, cap_piece)
            if base != 'K':
                self.hands[player].append(base)

        # Handle promotion
        in_promo_zone = self._in_promotion_zone(player, fr) or self._in_promotion_zone(player, to)
        base_piece = self.UNPROMOTION_MAP.get(piece, piece)

        if promote and in_promo_zone and base_piece in self.PROMOTABLE:
            self.board[to] = (player, self.PROMOTION_MAP[base_piece])
        elif not promote and in_promo_zone and base_piece in self.PROMOTABLE:
            # Check mandatory promotion
            if self._must_promote(player, base_piece, to):
                self.board[to] = (player, self.PROMOTION_MAP[base_piece])

        return True

    def _in_promotion_zone(self, player, sq):
        if self.variation == "mini":
            return (player == 1 and sq[0] == 0) or (player == 2 and sq[0] == self.rows - 1)
        return (player == 1 and sq[0] <= 2) or (player == 2 and sq[0] >= self.rows - 3)

    def _must_promote(self, player, piece, to):
        if piece == 'P' or piece == 'L':
            if player == 1 and to[0] == 0:
                return True
            if player == 2 and to[0] == self.rows - 1:
                return True
        if piece == 'N':
            if player == 1 and to[0] <= 1:
                return True
            if player == 2 and to[0] >= self.rows - 2:
                return True
        return False

    def _is_valid_piece_move(self, player, piece, fr, to):
        dr = to[0] - fr[0]
        dc = to[1] - fr[1]
        base = self.UNPROMOTION_MAP.get(piece, piece)
        is_promoted = piece != base
        fwd = -1 if player == 1 else 1  # Forward direction

        if base == 'K':
            return abs(dr) <= 1 and abs(dc) <= 1 and (dr != 0 or dc != 0)

        if base == 'G' or (is_promoted and base in ('S', 'N', 'L', 'P')):
            # Gold movement: 1 step in any direction except diag backward
            if abs(dr) <= 1 and abs(dc) <= 1 and (dr != 0 or dc != 0):
                if abs(dc) == 1 and dr == -fwd:
                    return False
                return True
            return False

        if base == 'S' and not is_promoted:
            # Silver: 1 step diag any direction, or 1 step forward
            if dr == fwd and dc == 0:
                return True
            if abs(dr) == 1 and abs(dc) == 1:
                return True
            return False

        if base == 'N' and not is_promoted:
            # Knight: L-shape forward only
            return dr == 2 * fwd and abs(dc) == 1

        if base == 'L' and not is_promoted:
            # Lance: straight forward any distance
            if dc != 0:
                return False
            if dr == 0:
                return False
            step = fwd
            if (dr > 0) != (step > 0):
                return False
            # Check path clear
            r = fr[0] + step
            while r != to[0]:
                if (r, fr[1]) in self.board:
                    return False
                r += step
            return True

        if base == 'P' and not is_promoted:
            return dr == fwd and dc == 0

        if base == 'R':
            if is_promoted:
                # Dragon: rook + king (1 step diagonal)
                if abs(dr) == 1 and abs(dc) == 1:
                    return True
            # Rook movement
            if dr != 0 and dc != 0:
                return False
            return self._path_clear(fr, to)

        if base == 'B':
            if is_promoted:
                # Horse: bishop + king (1 step orthogonal)
                if (abs(dr) + abs(dc) == 1):
                    return True
            # Bishop movement
            if abs(dr) != abs(dc) or dr == 0:
                return False
            return self._path_clear(fr, to)

        return False

    def _path_clear(self, fr, to):
        dr = to[0] - fr[0]
        dc = to[1] - fr[1]
        steps = max(abs(dr), abs(dc))
        if steps <= 1:
            return True
        sr = (1 if dr > 0 else -1) if dr != 0 else 0
        sc = (1 if dc > 0 else -1) if dc != 0 else 0
        r, c = fr[0] + sr, fr[1] + sc
        for _ in range(steps - 1):
            if (r, c) in self.board:
                return False
            r += sr
            c += sc
        return True

    def _find_king(self, player):
        for sq, (pl, piece) in self.board.items():
            if pl == player and self.UNPROMOTION_MAP.get(piece, piece) == 'K':
                return sq
        return None

    def _is_in_check(self, player):
        king_sq = self._find_king(player)
        if not king_sq:
            return True
        opp = 3 - player
        for sq, (pl, piece) in self.board.items():
            if pl == opp and self._is_valid_piece_move(opp, piece, sq, king_sq):
                return True
        return False

    def _has_legal_moves(self, player):
        # Check all piece moves
        pieces = [(sq, pl, piece) for sq, (pl, piece) in self.board.items() if pl == player]
        for sq, pl, piece in pieces:
            for r in range(self.rows):
                for c in range(self.cols):
                    to = (r, c)
                    if to == sq:
                        continue
                    if to in self.board and self.board[to][0] == player:
                        continue
                    if self._is_valid_piece_move(player, piece, sq, to):
                        # Try move
                        captured = self.board.get(to)
                        del self.board[sq]
                        self.board[to] = (player, piece)
                        in_check = self._is_in_check(player)
                        # Undo
                        self.board[sq] = (player, piece)
                        if captured:
                            self.board[to] = captured
                        else:
                            del self.board[to]
                        if not in_check:
                            return True

        # Check drops
        for piece in set(self.hands[player]):
            for r in range(self.rows):
                for c in range(self.cols):
                    if (r, c) not in self.board:
                        # Quick validation
                        if piece == 'P':
                            has_pawn_col = any(
                                pc == 'P' and pl2 == player and c2 == c
                                for (r2, c2), (pl2, pc2) in self.board.items()
                            )
                            if has_pawn_col:
                                continue
                            if player == 1 and r == 0:
                                continue
                            if player == 2 and r == self.rows - 1:
                                continue
                        if piece == 'L':
                            if player == 1 and r == 0:
                                continue
                            if player == 2 and r == self.rows - 1:
                                continue
                        if piece == 'N':
                            if player == 1 and r <= 1:
                                continue
                            if player == 2 and r >= self.rows - 2:
                                continue

                        self.board[(r, c)] = (player, piece)
                        in_check = self._is_in_check(player)
                        del self.board[(r, c)]
                        if not in_check:
                            return True
        return False

    def check_game_over(self):
        opp = 3 - self.current_player
        self.in_check[opp] = self._is_in_check(opp)

        if self.in_check[opp] and not self._has_legal_moves(opp):
            self.game_over = True
            self.winner = self.current_player

        # Also check if current player's king was captured (shouldn't happen but safety)
        if not self._find_king(opp):
            self.game_over = True
            self.winner = self.current_player

    def get_state(self):
        board_state = {}
        for (r, c), (pl, piece) in self.board.items():
            board_state[f"{r},{c}"] = [pl, piece]
        return {
            "board": board_state,
            "hands": {str(k): list(v) for k, v in self.hands.items()},
            "rows": self.rows,
            "cols": self.cols,
        }

    def load_state(self, state):
        self.board = {}
        for key, (pl, piece) in state["board"].items():
            r, c = key.split(",")
            self.board[(int(r), int(c))] = (pl, piece)
        self.hands = {int(k): list(v) for k, v in state["hands"].items()}
        self.rows = state.get("rows", 9)
        self.cols = state.get("cols", 9)
        self.in_check = {1: False, 2: False}

    def get_tutorial(self):
        return """
==============================================================
                      SHOGI TUTORIAL
==============================================================

OVERVIEW
  Shogi (Japanese Chess) is played on a 9x9 board. The key
  unique feature is that captured pieces can be dropped back
  onto the board as your own pieces.

--------------------------------------------------------------
PIECES (Standard)
--------------------------------------------------------------
  K  King      - Moves 1 square any direction
  R  Rook      - Moves any distance orthogonally
  B  Bishop    - Moves any distance diagonally
  G  Gold      - 1 square: forward, sideways, or diag-forward
  S  Silver    - 1 square: forward or any diagonal
  N  Knight    - 2 forward + 1 sideways (like chess, forward only)
  L  Lance     - Any distance straight forward only
  P  Pawn      - 1 square forward only

--------------------------------------------------------------
PROMOTION
--------------------------------------------------------------
  When a piece enters, moves within, or leaves the last 3
  ranks (opponent's territory), it may promote:
    R -> Dragon (Rook + 1-sq diagonal)
    B -> Horse  (Bishop + 1-sq orthogonal)
    S -> Promoted Silver (moves like Gold)
    N -> Promoted Knight (moves like Gold)
    L -> Promoted Lance  (moves like Gold)
    P -> Tokin          (moves like Gold)
  Promotion is mandatory if the piece couldn't move otherwise.
  King and Gold cannot promote.

--------------------------------------------------------------
DROPS
--------------------------------------------------------------
  Captured pieces join your "hand" and can be dropped onto
  any empty square on your turn (instead of moving).
  Restrictions:
    - Pawns: no two unpromoted pawns in the same column
    - Pawns: cannot drop to deliver checkmate
    - Pieces cannot be dropped where they have no legal move

--------------------------------------------------------------
INPUT FORMAT
--------------------------------------------------------------
  Move:   "e2 e3"    (from square to square)
  Promote: "e2 e3+"  (add + to promote)
  Drop:   "P*e3"     (piece * target square)

  Columns: a-i (left to right)
  Rows: 1-9 (bottom to top, 1=bottom for Sente)

--------------------------------------------------------------
MINI SHOGI (5x5)
--------------------------------------------------------------
  Simplified version on 5x5 board with fewer pieces:
  King, Gold, Silver, Bishop, Rook, and 1 Pawn per player.

--------------------------------------------------------------
CONTROLS
--------------------------------------------------------------
  'quit'/'q'     - Quit the game
  'save'/'s'     - Save the game
  'help'/'h'     - Quick help
  'tutorial'/'t' - Show this tutorial
==============================================================
"""
