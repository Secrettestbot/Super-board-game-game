"""Canadian Checkers - 12x12 draughts with flying kings and maximum capture rule."""

import re
from engine.base import BaseGame, input_with_quit, clear_screen

# Piece constants
EMPTY = 0
BLACK_MAN = 1
BLACK_KING = 2
WHITE_MAN = 3
WHITE_KING = 4

PIECE_CHARS = {
    EMPTY: ' ',
    BLACK_MAN: 'b',
    BLACK_KING: 'B',
    WHITE_MAN: 'w',
    WHITE_KING: 'W',
}


def _owner(piece):
    """Return 1 (black), 2 (white), or 0 (empty)."""
    if piece in (BLACK_MAN, BLACK_KING):
        return 1
    if piece in (WHITE_MAN, WHITE_KING):
        return 2
    return 0


def _is_king(piece):
    return piece in (BLACK_KING, WHITE_KING)


class CanadianCheckersGame(BaseGame):
    """Canadian Checkers: 12x12 board with flying kings and maximum capture rule."""

    name = "Canadian Checkers"
    description = "12x12 draughts with flying kings and maximum capture rule"
    min_players = 2
    max_players = 2
    variations = {
        "standard": "Standard Canadian Checkers (12x12)",
        "quick": "Quick (10x10, 15 pieces)",
    }

    def __init__(self, variation=None):
        super().__init__(variation)
        if self.variation not in self.variations:
            self.variation = "standard"
        self.board = []
        self.size = 0
        self.must_continue_from = None  # (row, col) during multi-jump

    # ------------------------------------------------------------------
    # Setup
    # ------------------------------------------------------------------

    def setup(self):
        if self.variation == "quick":
            self.size = 10
            rows_per_player = 3  # 15 pieces on 10x10 (3 rows * 5 dark squares)
        else:
            self.size = 12
            rows_per_player = 5  # 30 pieces on 12x12 (5 rows * 6 dark squares)

        self.board = [[EMPTY] * self.size for _ in range(self.size)]
        self.must_continue_from = None

        # Player 2 (white) at top rows, Player 1 (black) at bottom rows.
        # Pieces on dark squares only: (r + c) % 2 == 1
        for r in range(rows_per_player):
            for c in range(self.size):
                if (r + c) % 2 == 1:
                    self.board[r][c] = WHITE_MAN
        for r in range(self.size - rows_per_player, self.size):
            for c in range(self.size):
                if (r + c) % 2 == 1:
                    self.board[r][c] = BLACK_MAN

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def _in_bounds(self, r, c):
        return 0 <= r < self.size and 0 <= c < self.size

    def _promotion_row(self, player):
        """Row where player's men promote to kings."""
        return 0 if player == 1 else self.size - 1

    def _pieces_of(self, player):
        pieces = []
        for r in range(self.size):
            for c in range(self.size):
                if _owner(self.board[r][c]) == player:
                    pieces.append((r, c))
        return pieces

    def _man_move_dirs(self, player):
        """Men move diagonally forward only."""
        forward = -1 if player == 1 else 1
        return [(forward, -1), (forward, 1)]

    def _man_capture_dirs(self):
        """Men can capture in all four diagonal directions."""
        return [(-1, -1), (-1, 1), (1, -1), (1, 1)]

    def _king_dirs(self):
        return [(-1, -1), (-1, 1), (1, -1), (1, 1)]

    # ------------------------------------------------------------------
    # Capture logic
    # ------------------------------------------------------------------

    def _single_captures_from(self, r, c, player, removed=None):
        """Return list of (land_r, land_c, cap_r, cap_c) for one jump from (r,c)."""
        if removed is None:
            removed = set()
        piece = self.board[r][c]
        is_k = _is_king(piece)
        opponent = 3 - player

        dirs = self._king_dirs() if is_k else self._man_capture_dirs()
        results = []

        for dr, dc in dirs:
            if is_k:
                # Flying king: slide until opponent piece, then land beyond
                cr, cc = r + dr, c + dc
                while self._in_bounds(cr, cc):
                    if (cr, cc) in removed:
                        cr += dr
                        cc += dc
                        continue
                    if self.board[cr][cc] == EMPTY:
                        cr += dr
                        cc += dc
                        continue
                    break
                if not self._in_bounds(cr, cc):
                    continue
                if (cr, cc) in removed:
                    continue
                if _owner(self.board[cr][cc]) != opponent:
                    continue
                cap_r, cap_c = cr, cc
                # Landing squares beyond the captured piece
                lr, lc = cap_r + dr, cap_c + dc
                while self._in_bounds(lr, lc):
                    if (lr, lc) in removed:
                        lr += dr
                        lc += dc
                        continue
                    if self.board[lr][lc] == EMPTY or (lr, lc) == (r, c):
                        results.append((lr, lc, cap_r, cap_c))
                    else:
                        break
                    lr += dr
                    lc += dc
            else:
                # Man: single-step capture (jump over adjacent opponent)
                mr, mc = r + dr, c + dc
                if not self._in_bounds(mr, mc):
                    continue
                if (mr, mc) in removed:
                    continue
                if _owner(self.board[mr][mc]) != opponent:
                    continue
                lr, lc = mr + dr, mc + dc
                if not self._in_bounds(lr, lc):
                    continue
                if (lr, lc) in removed:
                    continue
                if self.board[lr][lc] != EMPTY and (lr, lc) != (r, c):
                    continue
                results.append((lr, lc, mr, mc))

        return results

    def _all_capture_sequences(self, r, c, player, removed=None, path=None):
        """Return all maximal capture sequences from (r,c).

        Each sequence is a list of (land_r, land_c, cap_r, cap_c) tuples.
        """
        if removed is None:
            removed = set()
        if path is None:
            path = []

        jumps = self._single_captures_from(r, c, player, removed)
        if not jumps:
            if path:
                return [list(path)]
            return []

        sequences = []
        for lr, lc, cap_r, cap_c in jumps:
            path.append((lr, lc, cap_r, cap_c))
            new_removed = removed | {(cap_r, cap_c)}

            piece = self.board[r][c]
            promotes_now = (not _is_king(piece)) and (lr == self._promotion_row(player))

            # Temporarily upgrade piece if promoted mid-chain for sub-searches
            orig_piece = self.board[r][c]
            if promotes_now:
                self.board[r][c] = BLACK_KING if player == 1 else WHITE_KING

            sub = self._all_capture_sequences(lr, lc, player, new_removed, path)
            if sub:
                sequences.extend(sub)
            else:
                sequences.append(list(path))

            self.board[r][c] = orig_piece
            path.pop()

        return sequences

    def _mandatory_captures(self, player):
        """Return {(r,c): [sequences]} enforcing maximum capture rule."""
        all_caps = {}
        for r, c in self._pieces_of(player):
            seqs = self._all_capture_sequences(r, c, player)
            if seqs:
                all_caps[(r, c)] = seqs

        if not all_caps:
            return {}

        # Maximum capture rule: must pick sequence capturing the most pieces
        max_len = 0
        for seqs in all_caps.values():
            for seq in seqs:
                if len(seq) > max_len:
                    max_len = len(seq)

        filtered = {}
        for pos, seqs in all_caps.items():
            best = [s for s in seqs if len(s) == max_len]
            if best:
                filtered[pos] = best
        return filtered

    # ------------------------------------------------------------------
    # Non-capture moves
    # ------------------------------------------------------------------

    def _simple_moves_from(self, r, c, player):
        piece = self.board[r][c]
        is_k = _is_king(piece)
        dirs = self._king_dirs() if is_k else self._man_move_dirs(player)
        results = []

        for dr, dc in dirs:
            if is_k:
                # Flying king: slide any distance
                nr, nc = r + dr, c + dc
                while self._in_bounds(nr, nc) and self.board[nr][nc] == EMPTY:
                    results.append((nr, nc))
                    nr += dr
                    nc += dc
            else:
                nr, nc = r + dr, c + dc
                if self._in_bounds(nr, nc) and self.board[nr][nc] == EMPTY:
                    results.append((nr, nc))
        return results

    def _all_simple_moves(self, player):
        moves = {}
        for r, c in self._pieces_of(player):
            dests = self._simple_moves_from(r, c, player)
            if dests:
                moves[(r, c)] = dests
        return moves

    # ------------------------------------------------------------------
    # Display
    # ------------------------------------------------------------------

    def _pos_to_str(self, row, col):
        return f"{chr(ord('a') + col)}{self.size - row}"

    def _parse_pos(self, s):
        s = s.strip().lower()
        m = re.match(r'^([a-l])(\d+)$', s)
        if m:
            col = ord(m.group(1)) - ord('a')
            display_row = int(m.group(2))
            row = self.size - display_row
            if self._in_bounds(row, col):
                return (row, col)
        return None

    def display(self):
        p1_count = sum(1 for r in range(self.size) for c in range(self.size)
                       if _owner(self.board[r][c]) == 1)
        p2_count = sum(1 for r in range(self.size) for c in range(self.size)
                       if _owner(self.board[r][c]) == 2)

        var_label = self.variations[self.variation]
        print(f"\n  {'Canadian Checkers':^{self.size * 3 + 4}}")
        print(f"  {self.players[0]} (b/B): {p1_count}   {self.players[1]} (w/W): {p2_count}")
        print(f"  Turn {self.turn_number + 1} - {self.players[self.current_player - 1]}'s move")
        if self.must_continue_from:
            r, c = self.must_continue_from
            print(f"  ** Multi-jump in progress from {self._pos_to_str(r, c)} -- must continue **")
        print()

        # Column headers
        col_labels = [chr(ord('a') + c) for c in range(self.size)]
        print("    " + "  ".join(col_labels))
        print("  +" + "---" * self.size + "+")

        for r in range(self.size):
            row_str = f"{self.size - r:2}|"
            for c in range(self.size):
                piece = self.board[r][c]
                if piece != EMPTY:
                    row_str += f" {PIECE_CHARS[piece]} "
                else:
                    is_dark = (r + c) % 2 == 1
                    row_str += " . " if is_dark else "   "
            row_str += f"|{self.size - r}"
            print(row_str)

        print("  +" + "---" * self.size + "+")
        print("    " + "  ".join(col_labels))
        print()

    # ------------------------------------------------------------------
    # Input
    # ------------------------------------------------------------------

    def _parse_move_input(self, raw):
        """Parse move input. Returns list of (row, col) positions or None.

        Supports:
          'a3 b4'        - simple move (2 positions)
          'a3 c5 e7'     - chain capture (3+ positions)
        """
        raw = raw.strip().lower()
        # Split by spaces, dashes, or 'to'
        raw = raw.replace('-', ' ').replace(' to ', ' ')
        tokens = raw.split()
        if len(tokens) < 2:
            return None

        positions = []
        for tok in tokens:
            pos = self._parse_pos(tok)
            if pos is None:
                return None
            positions.append(pos)
        return positions

    def get_move(self):
        player = self.current_player
        captures = self._mandatory_captures(player)

        if self.must_continue_from:
            fr, fc = self.must_continue_from
            seqs = self._all_capture_sequences(fr, fc, player)
            if not seqs:
                self.must_continue_from = None
                return None
            captures = {(fr, fc): seqs}
            # Re-apply maximum capture filter
            max_len = max(len(s) for s in seqs)
            captures = {(fr, fc): [s for s in seqs if len(s) == max_len]}

        if captures:
            return self._get_capture_move(player, captures)
        else:
            simple = self._all_simple_moves(player)
            if not simple:
                return None
            return self._get_simple_move(player, simple)

    def _get_simple_move(self, player, simple_moves):
        while True:
            raw = input_with_quit(
                f"  {self.players[player - 1]}, enter move (e.g. a3 b4): "
            )
            positions = self._parse_move_input(raw)
            if positions is None or len(positions) != 2:
                print("  Invalid format. Use e.g. 'a3 b4'.")
                continue
            src, dst = positions
            if src not in simple_moves:
                print(f"  No movable piece at {self._pos_to_str(*src)}.")
                continue
            if dst not in simple_moves[src]:
                valid = ', '.join(self._pos_to_str(*d) for d in simple_moves[src])
                print(f"  Cannot move to {self._pos_to_str(*dst)}. Valid: {valid}")
                continue
            return ('simple', src[0], src[1], dst[0], dst[1])

    def _get_capture_move(self, player, captures):
        src_set = set(captures.keys())
        print(f"  *** Capture is mandatory! ***")
        pieces_str = ", ".join(self._pos_to_str(*s) for s in sorted(src_set))
        print(f"  Pieces that must capture: {pieces_str}")

        while True:
            raw = input_with_quit(
                f"  {self.players[player - 1]}, enter capture (e.g. a3 c5 e7): "
            )
            positions = self._parse_move_input(raw)
            if positions is None or len(positions) < 2:
                print("  Invalid format. Use e.g. 'a3 c5' or 'a3 c5 e7' for chain.")
                continue

            src = positions[0]
            if src not in captures:
                print(f"  Piece at {self._pos_to_str(*src)} cannot capture.")
                continue

            # Match the input path against valid sequences
            input_path = positions[1:]  # landing squares the user specified
            matching_seqs = []
            for seq in captures[src]:
                seq_landings = [(s[0], s[1]) for s in seq]
                if len(input_path) <= len(seq_landings):
                    if seq_landings[:len(input_path)] == input_path:
                        matching_seqs.append(seq)

            if not matching_seqs:
                # Show valid first destinations
                first_dests = set()
                for seq in captures[src]:
                    first_dests.add((seq[0][0], seq[0][1]))
                valid = ', '.join(self._pos_to_str(*d) for d in sorted(first_dests))
                print(f"  Invalid capture path. Valid first destinations: {valid}")
                continue

            # If user gave partial path, use the first matching full sequence
            seq = matching_seqs[0]

            # If user specified the full chain, execute all at once
            # If partial, execute what was given and set up continuation
            steps_given = len(input_path)
            return ('capture', src[0], src[1], seq, steps_given)

    # ------------------------------------------------------------------
    # Make move
    # ------------------------------------------------------------------

    def make_move(self, move):
        if move is None:
            return False

        player = self.current_player

        if move[0] == 'simple':
            _, fr, fc, tr, tc = move
            piece = self.board[fr][fc]
            if _owner(piece) != player:
                return False
            self.board[tr][tc] = piece
            self.board[fr][fc] = EMPTY
            if not _is_king(piece) and tr == self._promotion_row(player):
                self.board[tr][tc] = BLACK_KING if player == 1 else WHITE_KING
            self.must_continue_from = None
            return True

        if move[0] == 'capture':
            _, fr, fc, sequence, steps_given = move
            piece = self.board[fr][fc]
            if _owner(piece) != player:
                return False

            # Execute the steps the user specified
            cur_r, cur_c = fr, fc
            for i in range(steps_given):
                lr, lc, cap_r, cap_c = sequence[i]
                self.board[lr][lc] = self.board[cur_r][cur_c]
                self.board[cur_r][cur_c] = EMPTY
                self.board[cap_r][cap_c] = EMPTY

                # Check promotion
                p = self.board[lr][lc]
                if not _is_king(p) and lr == self._promotion_row(player):
                    self.board[lr][lc] = BLACK_KING if player == 1 else WHITE_KING

                cur_r, cur_c = lr, lc

            # Check if there are remaining steps in the sequence
            if steps_given < len(sequence):
                self.must_continue_from = (cur_r, cur_c)
            else:
                self.must_continue_from = None

            return True

        return False

    # ------------------------------------------------------------------
    # Game over
    # ------------------------------------------------------------------

    def check_game_over(self):
        if self.must_continue_from:
            return

        next_player = 3 - self.current_player
        next_pieces = self._pieces_of(next_player)
        if not next_pieces:
            self.game_over = True
            self.winner = self.current_player
            return

        caps = self._mandatory_captures(next_player)
        if caps:
            return
        simple = self._all_simple_moves(next_player)
        if simple:
            return

        self.game_over = True
        self.winner = self.current_player

    def switch_player(self):
        if not self.must_continue_from:
            super().switch_player()

    # ------------------------------------------------------------------
    # Serialisation
    # ------------------------------------------------------------------

    def get_state(self):
        return {
            'board': [row[:] for row in self.board],
            'size': self.size,
            'must_continue_from': self.must_continue_from,
        }

    def load_state(self, state):
        self.board = [row[:] for row in state['board']]
        self.size = state['size']
        self.must_continue_from = state.get('must_continue_from')

    # ------------------------------------------------------------------
    # Tutorial
    # ------------------------------------------------------------------

    def get_tutorial(self):
        return """
+==============================================================+
|              CANADIAN CHECKERS TUTORIAL                       |
+==============================================================+

OVERVIEW
--------
Canadian Checkers is a draughts variant played on a 12x12 board
with 30 pieces per player. It features flying kings and the
maximum capture rule, making it one of the more strategic
draughts variants.

PIECES
------
  Player 1 (Black): b (man)  B (king)
  Player 2 (White): w (man)  W (white king)

  Player 1 (Black) moves UP the board.
  Player 2 (White) moves DOWN the board.

  Pieces are placed on dark squares only.

MOVEMENT
--------
  Men:   Move diagonally forward one square to an empty dark
         square.

  Kings: "Flying kings" -- move diagonally ANY number of squares
         in any direction, like a bishop in chess, but only on
         dark squares.

CAPTURING
---------
  Men:   Jump diagonally over an adjacent opponent piece in any
         direction (forward or backward) to land on the empty
         square beyond.

  Kings: Fly diagonally toward an opponent piece, jump over it,
         and land on ANY empty square beyond it along the same
         diagonal.

  - Capturing is MANDATORY. If you can capture, you must.
  - Multiple jumps: if after a capture the same piece can capture
    again, it MUST continue jumping.
  - MAXIMUM CAPTURE RULE: if multiple capture sequences are
    possible, you must choose the one that captures the MOST
    opponent pieces.
  - Captured pieces are removed from the board.

PROMOTION
---------
  A man reaching the far row (row 1 for white, row 12 for black)
  is promoted to a king. If promoted mid-chain, the piece
  continues capturing as a king.

WINNING
-------
  You win by:
  - Capturing all of your opponent's pieces, or
  - Blocking all of your opponent's moves.

ENTERING MOVES
--------------
  Simple move:    a3 b4
  Chain capture:  a3 c5 e7   (list each landing square)
  You can also use dashes:   a3-b4 or a3-c5-e7

QUICK VARIANT
-------------
  10x10 board with 15 pieces per player (3 rows each).
  Same flying king and maximum capture rules apply.

COMMANDS
--------
  Type your move   - Move a piece (e.g. a3 b4)
  'quit' or 'q'    - Quit the game
  'save' or 's'    - Save and suspend the game
  'help' or 'h'    - Show help
  'tutorial' / 't' - Show this tutorial
"""
