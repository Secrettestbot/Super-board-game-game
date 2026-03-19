"""Checkers (Draughts) - Classic board game with multiple international variations."""

import re
from engine.base import BaseGame, input_with_quit, clear_screen


# Piece constants
EMPTY = 0
P1_MAN = 1
P1_KING = 2
P2_MAN = 3
P2_KING = 4


def _owner(piece):
    """Return 1, 2, or 0 for the player who owns a piece."""
    if piece in (P1_MAN, P1_KING):
        return 1
    if piece in (P2_MAN, P2_KING):
        return 2
    return 0


def _is_king(piece):
    return piece in (P1_KING, P2_KING)


class CheckersGame(BaseGame):
    """Checkers/Draughts implementation supporting multiple international variations."""

    name = "Checkers"
    description = "Classic board game of diagonal (or orthogonal) jumping and captures"
    min_players = 2
    max_players = 2
    variations = {
        "american": "8x8 board, 12 pieces each, single-step kings, forward-only captures for men",
        "international": "10x10 board, 20 pieces each, flying kings, backward captures for all",
        "brazilian": "8x8 board, 12 pieces each, international rules (flying kings)",
        "turkish": "8x8 board, 16 pieces each, orthogonal movement, no backward moves for men",
    }

    # Unicode symbols
    SYMBOLS = {
        EMPTY: ' ',
        P1_MAN: '⛀',
        P1_KING: '⛁',
        P2_MAN: '⛂',
        P2_KING: '⛃',
    }

    def __init__(self, variation=None):
        super().__init__(variation)
        if self.variation not in self.variations:
            self.variation = "american"
        self.board = []
        self.size = 0
        self.must_continue_from = None  # (row, col) when mid-multi-jump

    # ------------------------------------------------------------------
    # Variation helpers
    # ------------------------------------------------------------------

    def _is_diagonal(self):
        """Whether movement is diagonal (False only for turkish)."""
        return self.variation != "turkish"

    def _flying_kings(self):
        """Whether kings can slide multiple squares."""
        return self.variation in ("international", "brazilian")

    def _men_capture_backward(self):
        """Whether regular pieces can capture backwards."""
        return self.variation in ("international", "brazilian")

    def _promotion_row(self, player):
        """Row index where *player*'s pieces promote."""
        return 0 if player == 1 else self.size - 1

    # ------------------------------------------------------------------
    # Setup
    # ------------------------------------------------------------------

    def setup(self):
        if self.variation == "international":
            self.size = 10
            rows_per_player = 4
        elif self.variation == "turkish":
            self.size = 8
            rows_per_player = 2  # rows 1-2 and 5-6 (leaving row 0 and 7 empty)
        else:
            # american, brazilian
            self.size = 8
            rows_per_player = 3

        self.board = [[EMPTY] * self.size for _ in range(self.size)]
        self.must_continue_from = None

        if self.variation == "turkish":
            # Turkish: fill rows 1-2 for player 2, rows 5-6 for player 1
            # All squares in each row (orthogonal game)
            for r in range(1, 1 + rows_per_player):
                for c in range(self.size):
                    self.board[r][c] = P2_MAN
            for r in range(self.size - 1 - rows_per_player, self.size - 1):
                for c in range(self.size):
                    self.board[r][c] = P1_MAN
        else:
            # Diagonal variants: pieces on dark squares only
            for r in range(rows_per_player):
                for c in range(self.size):
                    if (r + c) % 2 == 1:
                        self.board[r][c] = P2_MAN
            for r in range(self.size - rows_per_player, self.size):
                for c in range(self.size):
                    if (r + c) % 2 == 1:
                        self.board[r][c] = P1_MAN

    # ------------------------------------------------------------------
    # Movement directions
    # ------------------------------------------------------------------

    def _man_move_dirs(self, player):
        """Non-capture move directions for a regular piece."""
        if self.variation == "turkish":
            # forward and sideways, no backward
            if player == 1:
                return [(-1, 0), (0, -1), (0, 1)]
            else:
                return [(1, 0), (0, -1), (0, 1)]
        else:
            # diagonal forward
            forward = -1 if player == 1 else 1
            return [(forward, -1), (forward, 1)]

    def _man_capture_dirs(self, player):
        """Capture directions for a regular piece."""
        if self.variation == "turkish":
            if player == 1:
                return [(-1, 0), (0, -1), (0, 1)]  # no backward
            else:
                return [(1, 0), (0, -1), (0, 1)]
        else:
            forward = -1 if player == 1 else 1
            dirs = [(forward, -1), (forward, 1)]
            if self._men_capture_backward():
                backward = -forward
                dirs += [(backward, -1), (backward, 1)]
            return dirs

    def _king_dirs(self):
        """All directions a king can move/capture."""
        if self.variation == "turkish":
            return [(-1, 0), (1, 0), (0, -1), (0, 1)]
        else:
            return [(-1, -1), (-1, 1), (1, -1), (1, 1)]

    # ------------------------------------------------------------------
    # Board helpers
    # ------------------------------------------------------------------

    def _in_bounds(self, r, c):
        return 0 <= r < self.size and 0 <= c < self.size

    def _pieces_of(self, player):
        """Return list of (r, c) for all pieces belonging to player."""
        pieces = []
        for r in range(self.size):
            for c in range(self.size):
                if _owner(self.board[r][c]) == player:
                    pieces.append((r, c))
        return pieces

    # ------------------------------------------------------------------
    # Capture logic
    # ------------------------------------------------------------------

    def _single_captures_from(self, r, c, player, removed=None):
        """Return list of (land_r, land_c, captured_r, captured_c) for one jump from (r,c).

        *removed* is a set of already-captured positions in a multi-jump (not yet
        physically removed from the board but logically gone).
        """
        if removed is None:
            removed = set()
        piece = self.board[r][c]
        is_k = _is_king(piece)
        opponent = 3 - player

        if is_k:
            dirs = self._king_dirs()
        else:
            dirs = self._man_capture_dirs(player)

        results = []

        for dr, dc in dirs:
            if is_k and self._flying_kings():
                # Flying king: slide until we hit an opponent piece, then must
                # land on an empty square beyond it.
                cr, cc = r + dr, c + dc
                while self._in_bounds(cr, cc) and self.board[cr][cc] == EMPTY and (cr, cc) not in removed:
                    cr += dr
                    cc += dc
                if not self._in_bounds(cr, cc):
                    continue
                if (cr, cc) in removed:
                    continue
                if _owner(self.board[cr][cc]) != opponent:
                    continue
                cap_r, cap_c = cr, cc
                # Landing squares beyond the captured piece
                lr, lc = cap_r + dr, cap_c + dc
                while self._in_bounds(lr, lc) and (self.board[lr][lc] == EMPTY or (lr, lc) == (r, c)) and (lr, lc) not in removed:
                    if (lr, lc) != (r, c) or True:
                        # The piece can return to its starting square only if it
                        # is truly empty (which it will be during the jump).
                        if self.board[lr][lc] == EMPTY or (lr, lc) == (r, c):
                            results.append((lr, lc, cap_r, cap_c))
                    lr += dr
                    lc += dc
            else:
                # Single-step capture
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
        """Return list of full capture sequences from (r, c).

        Each sequence is a list of (land_r, land_c, captured_r, captured_c).
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

            # Check if piece would promote mid-chain (american: stop; international/brazilian: continue)
            piece = self.board[r][c]
            promotes_now = (not _is_king(piece)) and (lr == self._promotion_row(player))

            if promotes_now and self.variation == "american":
                # American rules: promotion ends the turn
                sequences.append(list(path))
            else:
                # Temporarily treat piece as king if it promoted for sub-searches
                orig_piece = self.board[r][c]
                if promotes_now and self.variation != "american":
                    # For international/brazilian, piece becomes king mid-chain
                    self.board[r][c] = P1_KING if player == 1 else P2_KING

                sub = self._all_capture_sequences(lr, lc, player, new_removed, path)
                if sub:
                    sequences.extend(sub)
                else:
                    sequences.append(list(path))

                self.board[r][c] = orig_piece

            path.pop()

        return sequences

    def _mandatory_captures(self, player):
        """Return dict {(r,c): [sequence, ...]} of all mandatory captures.

        In international/brazilian rules, must choose the sequence that captures
        the most pieces (maximum capture rule).
        """
        all_caps = {}
        for r, c in self._pieces_of(player):
            seqs = self._all_capture_sequences(r, c, player)
            if seqs:
                all_caps[(r, c)] = seqs

        if not all_caps:
            return {}

        # International / Brazilian: maximum capture rule
        if self.variation in ("international", "brazilian"):
            max_len = 0
            for seqs in all_caps.values():
                for seq in seqs:
                    if len(seq) > max_len:
                        max_len = len(seq)
            # Keep only sequences of maximum length
            filtered = {}
            for pos, seqs in all_caps.items():
                best = [s for s in seqs if len(s) == max_len]
                if best:
                    filtered[pos] = best
            return filtered

        return all_caps

    # ------------------------------------------------------------------
    # Non-capture moves
    # ------------------------------------------------------------------

    def _simple_moves_from(self, r, c, player):
        """Return list of (dest_r, dest_c) for non-capture moves from (r,c)."""
        piece = self.board[r][c]
        is_k = _is_king(piece)

        if is_k:
            dirs = self._king_dirs()
        else:
            dirs = self._man_move_dirs(player)

        results = []
        for dr, dc in dirs:
            if is_k and self._flying_kings():
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
        """Return dict {(r,c): [(dest_r, dest_c), ...]}."""
        moves = {}
        for r, c in self._pieces_of(player):
            dests = self._simple_moves_from(r, c, player)
            if dests:
                moves[(r, c)] = dests
        return moves

    # ------------------------------------------------------------------
    # Display
    # ------------------------------------------------------------------

    def display(self):
        p1_count = sum(1 for r in range(self.size) for c in range(self.size)
                       if _owner(self.board[r][c]) == 1)
        p2_count = sum(1 for r in range(self.size) for c in range(self.size)
                       if _owner(self.board[r][c]) == 2)

        var_label = self.variation.capitalize()
        print(f"\n  {'Checkers (' + var_label + ')':^{self.size * 3 + 4}}")
        print(f"  {self.players[0]} (⛀/⛁): {p1_count}   {self.players[1]} (⛂/⛃): {p2_count}")
        print(f"  Turn {self.turn_number + 1} - {self.players[self.current_player - 1]}'s move")
        if self.must_continue_from:
            r, c = self.must_continue_from
            print(f"  ** Multi-jump in progress from {self._pos_to_str(r, c)} — must continue **")
        print()

        # Column headers
        col_labels = [chr(ord('a') + c) for c in range(self.size)]
        print("    " + "  ".join(col_labels))
        print("  +" + "---" * self.size + "+")

        dark_bg = True  # whether (0,0) is dark
        for r in range(self.size):
            row_str = f"{self.size - r:2}|"
            for c in range(self.size):
                piece = self.board[r][c]
                if piece != EMPTY:
                    row_str += f" {self.SYMBOLS[piece]} "
                else:
                    # Show dark / light squares
                    if self._is_diagonal():
                        is_dark = (r + c) % 2 == 1
                    else:
                        is_dark = False
                    row_str += " · " if is_dark else "   "
            row_str += f"|{self.size - r}"
            print(row_str)

        print("  +" + "---" * self.size + "+")
        print("    " + "  ".join(col_labels))
        print()

    def _pos_to_str(self, row, col):
        """Convert internal (row, col) to display string like 'a3'."""
        return f"{chr(ord('a') + col)}{self.size - row}"

    def _parse_pos(self, s):
        """Parse a position string like 'a3' or '3,2' into (row, col) or None."""
        s = s.strip().lower()

        # Letter-number format: a3, b5, etc.
        m = re.match(r'^([a-z])(\d+)$', s)
        if m:
            col = ord(m.group(1)) - ord('a')
            display_row = int(m.group(2))
            row = self.size - display_row
            if self._in_bounds(row, col):
                return (row, col)
            return None

        # Numeric format: row,col (0-indexed display)
        m = re.match(r'^(\d+)\s*,\s*(\d+)$', s)
        if m:
            # Treat as (display_row, display_col) — 1-indexed
            dr, dc = int(m.group(1)), int(m.group(2))
            row = self.size - dr
            col = dc - 1
            if self._in_bounds(row, col):
                return (row, col)
            return None

        return None

    # ------------------------------------------------------------------
    # Input
    # ------------------------------------------------------------------

    def get_move(self):
        """Get a move from the current player.

        Returns either:
          ('simple', from_r, from_c, to_r, to_c)
          ('capture', from_r, from_c, sequence)  where sequence is a list of
              (land_r, land_c, cap_r, cap_c)
        """
        player = self.current_player

        captures = self._mandatory_captures(player)

        # Multi-jump continuation
        if self.must_continue_from:
            fr, fc = self.must_continue_from
            seqs = self._all_capture_sequences(fr, fc, player)
            if not seqs:
                # No more jumps possible (shouldn't happen if called correctly)
                self.must_continue_from = None
                return None
            captures = {(fr, fc): seqs}

        if captures:
            return self._get_capture_move(player, captures)
        else:
            simple = self._all_simple_moves(player)
            if not simple:
                return None  # no moves at all
            return self._get_simple_move(player, simple)

    def _get_simple_move(self, player, simple_moves):
        """Prompt for a non-capture move."""
        while True:
            raw = input_with_quit(
                f"  {self.players[player - 1]}, enter move (e.g. a3-b4 or 3,1 to 4,2): "
            )
            parsed = self._parse_move_input(raw)
            if parsed is None:
                print("  Invalid format. Use e.g. 'a3-b4', 'a3 b4', or '3,1 to 4,2'.")
                continue
            src, dst = parsed
            if src not in simple_moves:
                print(f"  No movable piece at {self._pos_to_str(*src)}.")
                continue
            if dst not in simple_moves[src]:
                print(f"  Cannot move to {self._pos_to_str(*dst)}. "
                      f"Valid destinations: {', '.join(self._pos_to_str(*d) for d in simple_moves[src])}")
                continue
            return ('simple', src[0], src[1], dst[0], dst[1])

    def _get_capture_move(self, player, captures):
        """Prompt for a capture move. Mandatory capture enforced."""
        # Build a set of valid (src, dst) first-steps
        valid_first = {}  # (src, dst) -> [sequences that start with this step]
        for src, seqs in captures.items():
            for seq in seqs:
                first = seq[0]
                dst = (first[0], first[1])
                key = (src, dst)
                if key not in valid_first:
                    valid_first[key] = []
                valid_first[key].append(seq)

        src_set = set(s for s, _ in valid_first)
        print(f"  *** Capture is mandatory! ***")
        pieces_str = ", ".join(self._pos_to_str(*s) for s in sorted(src_set))
        print(f"  Pieces that must capture: {pieces_str}")

        while True:
            raw = input_with_quit(
                f"  {self.players[player - 1]}, enter capture (e.g. a3-b4 or 3,1 to 4,2): "
            )
            parsed = self._parse_move_input(raw)
            if parsed is None:
                print("  Invalid format. Use e.g. 'a3-b4', 'a3 b4', or '3,1 to 4,2'.")
                continue
            src, dst = parsed
            key = (src, dst)
            if key not in valid_first:
                if src not in src_set:
                    print(f"  Piece at {self._pos_to_str(*src)} cannot capture.")
                else:
                    dests = [d for s, d in valid_first if s == src]
                    print(f"  Invalid capture destination. Valid: "
                          f"{', '.join(self._pos_to_str(*d) for d in dests)}")
                continue

            # If there's exactly one sequence that starts this way, use it.
            matching = valid_first[key]
            # Return the first step; the game loop will handle multi-jump via
            # must_continue_from.
            seq = matching[0]
            return ('capture', src[0], src[1], seq)

    def _parse_move_input(self, raw):
        """Parse move input in various formats. Returns ((r1,c1),(r2,c2)) or None.

        Supported formats:
          a3-b4, a3 b4, a3 to b4
          3,2-4,3, 3,2 to 4,3, 3,2 4,3
        """
        raw = raw.strip().lower()
        # Normalise separators
        raw = raw.replace(' to ', '-').replace('  ', ' ')

        # Try splitting by '-' or space
        parts = None
        if '-' in raw:
            parts = raw.split('-', 1)
        elif ' ' in raw:
            parts = raw.split(None, 1)

        if not parts or len(parts) != 2:
            return None

        src = self._parse_pos(parts[0])
        dst = self._parse_pos(parts[1])
        if src is None or dst is None:
            return None
        return (src, dst)

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
            # Promotion
            if not _is_king(piece) and tr == self._promotion_row(player):
                self.board[tr][tc] = P1_KING if player == 1 else P2_KING
            self.must_continue_from = None
            return True

        if move[0] == 'capture':
            _, fr, fc, sequence = move
            piece = self.board[fr][fc]
            if _owner(piece) != player:
                return False

            # Execute only the first jump of the sequence
            first = sequence[0]
            lr, lc, cap_r, cap_c = first

            self.board[lr][lc] = piece
            self.board[fr][fc] = EMPTY
            self.board[cap_r][cap_c] = EMPTY

            # Promotion check
            promoted = False
            if not _is_king(piece) and lr == self._promotion_row(player):
                self.board[lr][lc] = P1_KING if player == 1 else P2_KING
                promoted = True

            # Check if there are more jumps in the sequence
            if len(sequence) > 1 and not (promoted and self.variation == "american"):
                # If promoted mid-chain (non-american), update piece type
                self.must_continue_from = (lr, lc)
                # Re-check if further captures are actually possible
                further = self._single_captures_from(
                    lr, lc, player, removed=set()
                )
                if further:
                    self.must_continue_from = (lr, lc)
                else:
                    self.must_continue_from = None
            else:
                self.must_continue_from = None

            return True

        return False

    # ------------------------------------------------------------------
    # Game over
    # ------------------------------------------------------------------

    def check_game_over(self):
        # If in multi-jump, game isn't over yet
        if self.must_continue_from:
            return

        next_player = 3 - self.current_player

        # Check if next player has any pieces
        next_pieces = self._pieces_of(next_player)
        if not next_pieces:
            self.game_over = True
            self.winner = self.current_player
            return

        # Check if next player has any moves
        caps = self._mandatory_captures(next_player)
        if caps:
            return  # has moves
        simple = self._all_simple_moves(next_player)
        if simple:
            return  # has moves

        # Next player has pieces but no moves — they lose
        self.game_over = True
        self.winner = self.current_player

    def switch_player(self):
        """Override: only switch if not in a multi-jump."""
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
╔══════════════════════════════════════════════════════════════╗
║                    CHECKERS (DRAUGHTS) TUTORIAL              ║
╚══════════════════════════════════════════════════════════════╝

OVERVIEW
--------
Checkers (also called Draughts) is a two-player strategy game played on
a square board. Players move their pieces diagonally (or orthogonally in
the Turkish variant) and capture opponent pieces by jumping over them.

  Player 1 plays light pieces:  ⛀ (man)  ⛁ (king)
  Player 2 plays dark pieces:   ⛂ (man)  ⛃ (king)

Player 1 moves UP the board; Player 2 moves DOWN.

═══════════════════════════════════════════════════════════════
VARIATIONS
═══════════════════════════════════════════════════════════════

AMERICAN CHECKERS (English Draughts)
  Board:     8x8 with 12 pieces per player
  Movement:  Diagonal only, on dark squares
  Men:       Move and capture forward only (one square)
  Kings:     Move and capture forward and backward (one square)
  Captures:  Single jump; mandatory if available
  Promotion: Ends the turn immediately (no continuing a chain)

INTERNATIONAL DRAUGHTS
  Board:     10x10 with 20 pieces per player
  Movement:  Diagonal only, on dark squares
  Men:       Move forward one square; capture forward AND backward
  Kings:     "Flying kings" — slide any number of squares diagonally
             and capture by flying over an opponent piece to land on
             any empty square beyond it
  Captures:  Mandatory; must choose the sequence that captures the
             MOST pieces (maximum capture rule)
  Promotion: A man reaching the last row becomes a king and may
             continue capturing in the same turn if possible

BRAZILIAN DRAUGHTS
  Board:     8x8 with 12 pieces per player
  Movement:  Identical to International rules
  Men:       Move forward; capture forward and backward
  Kings:     Flying kings (same as International)
  Captures:  Maximum capture rule applies
  Note:      Essentially International rules on a smaller board

TURKISH DRAUGHTS
  Board:     8x8 with 16 pieces per player
  Movement:  ORTHOGONAL (horizontal and vertical), NOT diagonal
  Men:       Move forward or sideways (not backward); capture the
             same directions
  Kings:     Move and capture in all four orthogonal directions,
             one square at a time
  Layout:    Pieces start on rows 2-3 (Player 2) and rows 6-7
             (Player 1), filling every square in those rows
  Captures:  Mandatory; captured pieces are removed immediately
             during a multi-jump chain

═══════════════════════════════════════════════════════════════
HOW TO PLAY
═══════════════════════════════════════════════════════════════

ENTERING MOVES
  You can type moves in several formats:
    a3-b4       (letter+number separated by dash)
    a3 b4       (separated by space)
    a3 to b4    (with "to" keyword)
    3,1 to 4,2  (row,column numbers — 1-indexed from bottom-left)

  Columns are labelled a-h (or a-j on 10x10) left to right.
  Rows are numbered 1-8 (or 1-10) from bottom to top.

MANDATORY CAPTURES
  If you can capture, you MUST capture — you cannot make a simple
  move instead. The game will tell you which pieces must jump.

  In International and Brazilian variants, if multiple capture
  sequences are possible, you must choose the one that captures
  the MOST opponent pieces.

MULTI-JUMP CHAINS
  After capturing one piece, if the same piece can jump again, it
  must continue jumping. The game will prompt you for each step of
  the chain. Your turn does not end until no more jumps are possible.

  In American checkers, if a man reaches the promotion row during a
  multi-jump, it becomes a king and the turn ends immediately.

KINGS
  When a man reaches the opposite end of the board, it is promoted
  to a king.

  American / Turkish:
    Kings move one square in any allowed direction (diagonal or
    orthogonal respectively), both forward and backward.

  International / Brazilian:
    Kings are "flying" — they slide any number of empty squares in
    a diagonal line. When capturing, they jump over an opponent
    piece and may land on any empty square beyond it.

WINNING
  You win when your opponent has no pieces left, or when your
  opponent has pieces but no legal moves.

═══════════════════════════════════════════════════════════════
STRATEGY TIPS
═══════════════════════════════════════════════════════════════

  - Control the center of the board for more mobility.
  - Keep your back row intact as long as possible — it prevents
    your opponent from getting kings.
  - Try to get kings early; they are much more powerful.
  - Set up double/triple jump opportunities by sacrificing a piece.
  - In International/Brazilian, watch out for the maximum capture
    rule — your opponent may force you into an unfavorable sequence.
  - In Turkish checkers, sideways movement is key to trapping
    opponent pieces against the board edge.

═══════════════════════════════════════════════════════════════
COMMANDS
═══════════════════════════════════════════════════════════════

  Type your move   - Move a piece (e.g. a3-b4)
  'quit' or 'q'    - Quit the game
  'save' or 's'    - Save and suspend the game
  'help' or 'h'    - Show help
  'tutorial' / 't' - Show this tutorial
"""
