"""Onitama - A two-player martial-arts-themed abstract strategy game with movement cards."""

import random
from engine.base import BaseGame, input_with_quit, clear_screen


# Piece constants
EMPTY = 0
P1_STUDENT = 1
P1_MASTER = 2
P2_STUDENT = 3
P2_MASTER = 4

PIECE_SYMBOLS = {
    EMPTY: ' . ',
    P1_STUDENT: ' s ',
    P1_MASTER: ' M ',
    P2_STUDENT: ' S ',
    P2_MASTER: ' m ',
}


def _owner(piece):
    """Return which player (1 or 2) owns a piece, or 0 for empty."""
    if piece in (P1_STUDENT, P1_MASTER):
        return 1
    if piece in (P2_STUDENT, P2_MASTER):
        return 2
    return 0


def _is_master(piece):
    """Return True if the piece is a master."""
    return piece in (P1_MASTER, P2_MASTER)


def _is_student(piece):
    """Return True if the piece is a student."""
    return piece in (P1_STUDENT, P2_STUDENT)


# ---------------------------------------------------------------------------
# Card definitions
# ---------------------------------------------------------------------------
# Each card has a list of (dx, dy) offsets from the piece's perspective.
# For Player 1 (starting on row 0, moving toward row 4):
#   dx = column offset (positive = right)
#   dy = row offset (negative = forward/toward opponent for P1 at row 0)
# We store them from a neutral "P1 forward = -dy" perspective and flip for P2.
#
# Actually, we store (dr, dc) as board deltas for Player 1, where:
#   dr > 0 means moving toward higher rows (forward for P1 since P1 starts row 0)
#   dc > 0 means moving right
# For Player 2, we negate both dr and dc.

CARD_DEFINITIONS = {
    'Tiger':    [(2, 0), (-1, 0)],
    'Dragon':   [(1, -2), (1, 2), (-1, -1), (-1, 1)],
    'Frog':     [(0, -2), (1, -1), (-1, 1)],
    'Rabbit':   [(0, 2), (1, 1), (-1, -1)],
    'Crab':     [(2, 0), (0, -2), (0, 2)],
    'Elephant': [(1, -1), (1, 1), (0, -1), (0, 1)],
    'Goose':    [(1, -1), (0, -1), (-1, 1), (0, 1)],
    'Rooster':  [(1, 1), (0, 1), (-1, -1), (0, -1)],
    'Monkey':   [(1, -1), (1, 1), (-1, -1), (-1, 1)],
    'Mantis':   [(1, -1), (1, 1), (-1, 0)],
    'Horse':    [(1, 0), (0, -1), (-1, 0)],
    'Ox':       [(1, 0), (0, 1), (-1, 0)],
    'Crane':    [(1, 0), (-1, -1), (-1, 1)],
    'Boar':     [(1, 0), (0, -1), (0, 1)],
    'Eel':      [(1, -1), (-1, -1), (0, 1)],
    'Cobra':    [(1, 1), (-1, 1), (0, -1)],
}

ALL_CARD_NAMES = list(CARD_DEFINITIONS.keys())


class OnitamaGame(BaseGame):
    """Onitama: A card-driven abstract strategy game on a 5x5 grid."""

    name = "Onitama"
    description = "Card-driven martial arts strategy game on a 5x5 grid"
    min_players = 2
    max_players = 2
    variations = {
        "standard": "Standard Onitama",
        "sensei": "Sensei's Path (alternate win)",
    }

    def __init__(self, variation=None):
        super().__init__(variation or "standard")
        self.board = []
        self.size = 5
        self.player_cards = {1: [], 2: []}
        self.spare_card = None
        # Temple positions: where each player's master starts (opponent must reach it)
        self.temples = {1: None, 2: None}

    # ------------------------------------------------------------------ setup

    def setup(self):
        """Initialize the 5x5 board, place pieces, and deal 5 movement cards."""
        self.size = 5
        self.board = [[EMPTY] * self.size for _ in range(self.size)]

        # Player 1 pieces on row 0, master at (0, 2)
        for c in range(self.size):
            self.board[0][c] = P1_STUDENT
        self.board[0][2] = P1_MASTER

        # Player 2 pieces on row 4, master at (4, 2)
        for c in range(self.size):
            self.board[4][c] = P2_STUDENT
        self.board[4][2] = P2_MASTER

        # Temple squares: the opponent needs to reach YOUR temple to win.
        # P1's temple is (0, 2); P2's temple is (4, 2).
        self.temples = {1: (0, 2), 2: (4, 2)}

        # Deal 5 random cards from the 16
        cards = random.sample(ALL_CARD_NAMES, 5)
        self.player_cards = {1: [cards[0], cards[1]], 2: [cards[2], cards[3]]}
        self.spare_card = cards[4]

    # ------------------------------------------------------------------ card helpers

    def _get_moves_for_card(self, card_name, player):
        """Get (dr, dc) movement offsets for a card, adjusted for player.

        P1 offsets are stored as-is.  P2 offsets are negated (mirrored).
        """
        offsets = CARD_DEFINITIONS[card_name]
        if player == 1:
            return offsets
        else:
            return [(-dr, -dc) for dr, dc in offsets]

    def _get_all_valid_moves(self, player):
        """Return list of (card_name, fr, fc, tr, tc) for every legal move."""
        moves = []
        for card_name in self.player_cards[player]:
            offsets = self._get_moves_for_card(card_name, player)
            for r in range(self.size):
                for c in range(self.size):
                    if _owner(self.board[r][c]) != player:
                        continue
                    for dr, dc in offsets:
                        nr, nc = r + dr, c + dc
                        if 0 <= nr < self.size and 0 <= nc < self.size:
                            target = self.board[nr][nc]
                            if _owner(target) != player:
                                moves.append((card_name, r, c, nr, nc))
        return moves

    # ------------------------------------------------------------------ display

    def _format_card_grid(self, card_name, player):
        """Return a 5x5 mini-grid showing the card's movement pattern.

        X marks the piece position (center), * marks destinations, . marks empty.
        """
        offsets = self._get_moves_for_card(card_name, player)
        lines = []
        for dr in range(-2, 3):
            row_str = ""
            for dc in range(-2, 3):
                if dr == 0 and dc == 0:
                    row_str += " X"
                elif (dr, dc) in offsets:
                    row_str += " *"
                else:
                    row_str += " ."
            lines.append(row_str)
        return lines

    def _display_cards_side_by_side(self, card_names, player, indent="    "):
        """Print two (or more) cards side by side with their movement grids."""
        if not card_names:
            return
        grids = [self._format_card_grid(name, player) for name in card_names]

        # Card names
        name_line = indent
        for name in card_names:
            name_line += f"  {name:^11}   "
        print(name_line)

        # Grids row by row
        for row_idx in range(5):
            line = indent
            for g in grids:
                line += f"  {g[row_idx]}   "
            print(line)

    def display(self):
        """Display the board, cards for both players, and the spare card."""
        var_label = ""
        if self.variation == "sensei":
            var_label = " [Sensei's Path]"

        print(f"\n  === Onitama{var_label} ===")
        print(f"  Turn {self.turn_number + 1} - {self.players[self.current_player - 1]}'s move")
        print()

        # Player 2 cards (top of display)
        print(f"  {self.players[1]}'s cards (P2: S/m):")
        self._display_cards_side_by_side(self.player_cards[2], 2)
        print()

        # Column headers
        col_hdr = "       " + "   ".join(str(c) for c in range(self.size))
        print(col_hdr)
        print("     +" + "---+" * self.size)

        for r in range(self.size):
            row_str = f"  {r}  |"
            for c in range(self.size):
                piece = self.board[r][c]
                sym = PIECE_SYMBOLS[piece]
                row_str += f"{sym}|"
            # Mark temple squares
            markers = []
            if (r, 2) == self.temples[1]:
                markers.append("P1 temple")
            if (r, 2) == self.temples[2]:
                markers.append("P2 temple")
            if markers:
                row_str += "  <-- " + ", ".join(markers)
            print(row_str)
            print("     +" + "---+" * self.size)

        print(col_hdr)
        print()

        # Spare card
        print(f"  Spare card: {self.spare_card}")
        spare_lines = self._format_card_grid(self.spare_card, self.current_player)
        for line in spare_lines:
            print(f"      {line}")
        print()

        # Player 1 cards (bottom of display)
        print(f"  {self.players[0]}'s cards (P1: s/M):")
        self._display_cards_side_by_side(self.player_cards[1], 1)
        print()

    # ------------------------------------------------------------------ input

    def get_move(self):
        """Get a move from the current player.

        Format: card_name piece_row,piece_col dest_row,dest_col
        Example: Tiger 0,2 2,2

        If no moves are available, the player must choose a card to discard.
        """
        player = self.current_player
        name = self.players[player - 1]
        cards = self.player_cards[player]
        valid_moves = self._get_all_valid_moves(player)

        if not valid_moves:
            # No legal moves: player must still play a card (it gets swapped)
            print(f"  {name} has no valid moves. You must discard a card.")
            while True:
                raw = input_with_quit(
                    f"  Choose a card to discard ({', '.join(cards)}): "
                ).strip()
                matched = None
                for card in cards:
                    if raw.lower() == card.lower():
                        matched = card
                        break
                if matched:
                    return ('pass', matched)
                print(f"  Invalid card. Choose from: {', '.join(cards)}")

        while True:
            raw = input_with_quit(
                f"  {name}, enter move (card row,col row,col): "
            ).strip()

            parts = raw.split()
            if len(parts) != 3:
                print("  Format: card_name piece_row,piece_col dest_row,dest_col")
                print("  Example: Tiger 0,2 2,2")
                continue

            card_input, piece_input, dest_input = parts

            # Match card name (case-insensitive)
            matched_card = None
            for card in cards:
                if card.lower() == card_input.lower():
                    matched_card = card
                    break
            if matched_card is None:
                print(f"  Unknown card '{card_input}'. Your cards: {', '.join(cards)}")
                continue

            # Parse piece position
            piece_pos = self._parse_rc(piece_input)
            if piece_pos is None:
                print(f"  Invalid piece position '{piece_input}'. Use row,col (e.g. 0,2).")
                continue
            fr, fc = piece_pos

            if _owner(self.board[fr][fc]) != player:
                print(f"  No friendly piece at ({fr},{fc}).")
                continue

            # Parse destination
            dest_pos = self._parse_rc(dest_input)
            if dest_pos is None:
                print(f"  Invalid destination '{dest_input}'. Use row,col (e.g. 2,2).")
                continue
            tr, tc = dest_pos

            # Validate move
            if (matched_card, fr, fc, tr, tc) in valid_moves:
                return ('move', matched_card, fr, fc, tr, tc)

            # Give a helpful error
            offsets = self._get_moves_for_card(matched_card, player)
            dr, dc = tr - fr, tc - fc
            if (dr, dc) not in offsets:
                print(f"  {matched_card} does not allow moving from ({fr},{fc}) to ({tr},{tc}).")
            elif not (0 <= tr < self.size and 0 <= tc < self.size):
                print(f"  Destination ({tr},{tc}) is off the board.")
            elif _owner(self.board[tr][tc]) == player:
                print(f"  Cannot capture your own piece at ({tr},{tc}).")
            else:
                print("  Invalid move. Try again.")

    @staticmethod
    def _parse_rc(s):
        """Parse 'row,col' string. Returns (row, col) tuple or None."""
        s = s.strip()
        parts = s.split(',')
        if len(parts) != 2:
            return None
        try:
            r = int(parts[0].strip())
            c = int(parts[1].strip())
        except ValueError:
            return None
        return (r, c)

    # ------------------------------------------------------------------ make_move

    def make_move(self, move):
        """Apply a move to the game state. Returns True if valid."""
        player = self.current_player

        if move[0] == 'pass':
            # No valid moves: exchange the chosen card with the spare
            _, card_name = move
            cards = self.player_cards[player]
            if card_name not in cards:
                return False
            cards.remove(card_name)
            cards.append(self.spare_card)
            self.spare_card = card_name
            return True

        _, card_name, fr, fc, tr, tc = move
        cards = self.player_cards[player]

        # Validate card ownership
        if card_name not in cards:
            return False

        # Validate piece ownership
        if _owner(self.board[fr][fc]) != player:
            return False

        # Validate destination bounds
        if not (0 <= tr < self.size and 0 <= tc < self.size):
            return False

        # Cannot land on own piece
        if _owner(self.board[tr][tc]) == player:
            return False

        # Validate move matches card
        offsets = self._get_moves_for_card(card_name, player)
        dr, dc = tr - fr, tc - fc
        if (dr, dc) not in offsets:
            return False

        # Execute the move
        self.board[tr][tc] = self.board[fr][fc]
        self.board[fr][fc] = EMPTY

        # Card rotation: used card becomes spare, old spare goes to player
        cards.remove(card_name)
        cards.append(self.spare_card)
        self.spare_card = card_name

        return True

    # ------------------------------------------------------------------ game over

    def check_game_over(self):
        """Check win conditions.

        Way of the Stone: capture opponent's master.
        Way of the Stream: move your master to opponent's temple.
        Sensei variation: also win if you have only your master left and
        reach the opponent's temple.
        """
        p1_master_pos = None
        p2_master_pos = None
        p1_students = 0
        p2_students = 0

        for r in range(self.size):
            for c in range(self.size):
                piece = self.board[r][c]
                if piece == P1_MASTER:
                    p1_master_pos = (r, c)
                elif piece == P2_MASTER:
                    p2_master_pos = (r, c)
                elif piece == P1_STUDENT:
                    p1_students += 1
                elif piece == P2_STUDENT:
                    p2_students += 1

        # Way of the Stone: master captured
        if p2_master_pos is None:
            self.game_over = True
            self.winner = 1
            return
        if p1_master_pos is None:
            self.game_over = True
            self.winner = 2
            return

        # Way of the Stream: master reaches opponent's temple
        # P1 wins by reaching P2's temple (4, 2). P2 wins by reaching P1's temple (0, 2).
        if p1_master_pos == self.temples[2]:
            self.game_over = True
            self.winner = 1
            return
        if p2_master_pos == self.temples[1]:
            self.game_over = True
            self.winner = 2
            return

        # Sensei's Path variation: win if all your students are captured and
        # your master reaches the opponent's temple. (Already handled above
        # since temple check doesn't require students.) Additionally, in
        # Sensei's Path, if a player loses all students, their master gains
        # the ability to win by simply surviving with temple control.
        if self.variation == "sensei":
            # Alternate win: if you have no students left and your master is
            # on the opponent's temple, you win. This is already covered by
            # Way of the Stream above. The Sensei variation adds: if all of
            # a player's students are captured, the opponent can also win by
            # capturing the now-unprotected master (standard), but the player
            # with only a master left can still win via temple.
            # Additional sensei rule: a player also wins if their opponent
            # has lost all students AND the player's master occupies any
            # square on the opponent's home row.
            if p2_students == 0 and p1_master_pos[0] == 4:
                self.game_over = True
                self.winner = 1
                return
            if p1_students == 0 and p2_master_pos[0] == 0:
                self.game_over = True
                self.winner = 2
                return

    # ------------------------------------------------------------------ state

    def get_state(self):
        """Return serializable game state for saving."""
        return {
            'board': [row[:] for row in self.board],
            'player_cards': {str(k): v[:] for k, v in self.player_cards.items()},
            'spare_card': self.spare_card,
            'temples': {str(k): list(v) for k, v in self.temples.items()},
        }

    def load_state(self, state):
        """Restore game state from saved data."""
        self.board = [row[:] for row in state['board']]
        self.player_cards = {int(k): v[:] for k, v in state['player_cards'].items()}
        self.spare_card = state['spare_card']
        self.temples = {int(k): tuple(v) for k, v in state['temples'].items()}

    # ------------------------------------------------------------------ tutorial

    def get_tutorial(self):
        """Return comprehensive tutorial text for Onitama."""
        return """
==============================================================
                   ONITAMA TUTORIAL
==============================================================

OVERVIEW
--------------------------------------------------------------
  Onitama is a two-player abstract strategy game played on a
  5x5 grid. Each player controls 4 students and 1 master.
  The game uses movement cards that dictate how pieces can
  move. Mastery of the card rotation mechanic is the key to
  victory.

SETUP
--------------------------------------------------------------
  Player 1 (P1) starts with pieces on row 0:
    - 4 students (displayed as 's') and 1 master ('M') at
      column 2 (the temple square).

  Player 2 (P2) starts with pieces on row 4:
    - 4 students (displayed as 'S') and 1 master ('m') at
      column 2 (the temple square).

  From a deck of 16 unique movement cards, 5 are dealt:
    - 2 cards to Player 1
    - 2 cards to Player 2
    - 1 spare card placed to the side

MOVEMENT CARDS
--------------------------------------------------------------
  Each card defines a set of relative moves a piece can make.
  On the card display grid:
    X = the piece's current position (center)
    * = positions the piece can move to
    . = empty / not a valid move

  The 16 cards are:
    Tiger    - Forward 2, back 1
    Dragon   - Far diagonal forward, close diagonal back
    Frog     - Left 2, forward-left, back-right
    Rabbit   - Right 2, forward-right, back-left
    Crab     - Forward 2, left 2, right 2
    Elephant - Forward-left, forward-right, left, right
    Goose    - Forward-left, left, back-right, right
    Rooster  - Forward-right, right, back-left, left
    Monkey   - All four diagonals
    Mantis   - Forward-left, forward-right, back
    Horse    - Forward, left, back
    Ox       - Forward, right, back
    Crane    - Forward, back-left, back-right
    Boar     - Forward, left, right
    Eel      - Forward-left, back-left, right
    Cobra    - Forward-right, back-right, left

  Movement directions are relative to each player:
    - P1 moves "forward" toward row 4 (higher row numbers)
    - P2 moves "forward" toward row 0 (lower row numbers)
  Card patterns are automatically mirrored for P2.

HOW TO PLAY
--------------------------------------------------------------
  On your turn:
  1. Choose one of your two movement cards.
  2. Pick one of your pieces (student or master).
  3. Move that piece to one of the destinations allowed by
     the chosen card.
  4. If an opponent's piece is on the destination, it is
     captured and removed from the board.
  5. CARD ROTATION: Your used card becomes the new spare card,
     and the old spare card is added to your hand.

  This means the card you play now will eventually become
  available to your opponent! Plan accordingly.

  If you have no valid moves with either card, you must still
  choose a card to discard (it swaps with the spare).

MOVE INPUT FORMAT
--------------------------------------------------------------
  Enter moves as:
    card_name piece_row,piece_col dest_row,dest_col

  Examples:
    Tiger 0,2 2,2    -- Use Tiger card, move piece from
                        (0,2) to (2,2)
    Frog 1,3 1,1     -- Use Frog card, move piece from
                        (1,3) to (1,1)

  Rows are 0-4 (top to bottom), columns are 0-4 (left to
  right). The board display shows row and column numbers.

WINNING CONDITIONS
--------------------------------------------------------------
  There are two ways to win:

  1. WAY OF THE STONE:
     Capture your opponent's master piece. Land one of your
     pieces on the square occupied by the enemy master.

  2. WAY OF THE STREAM:
     Move YOUR master onto your opponent's temple square
     (the center of their starting row).
     - P1 must move their master 'M' to position (4, 2)
     - P2 must move their master 'm' to position (0, 2)

  SENSEI'S PATH VARIATION:
     In addition to the standard win conditions, if your
     opponent has lost all their students, you can also win
     by moving your master to any square on the opponent's
     home row.

BOARD NOTATION
--------------------------------------------------------------
  The board is displayed with row,col coordinates:

       0   1   2   3   4
     +---+---+---+---+---+
  0  | s | s | M | s | s |  <-- P1 temple (0,2)
     +---+---+---+---+---+
  1  | . | . | . | . | . |
     +---+---+---+---+---+
  2  | . | . | . | . | . |
     +---+---+---+---+---+
  3  | . | . | . | . | . |
     +---+---+---+---+---+
  4  | S | S | m | S | S |  <-- P2 temple (4,2)
     +---+---+---+---+---+
       0   1   2   3   4

  Pieces:
    s = Player 1 student    M = Player 1 master
    S = Player 2 student    m = Player 2 master

STRATEGY TIPS
--------------------------------------------------------------
  - Protect your master, but keep it mobile enough to
    threaten the opponent's temple.
  - Pay attention to the card rotation. The card you use now
    will reach your opponent in two turns.
  - Sometimes the best move is to use a card defensively just
    to deny it to your opponent.
  - Control the center of the board to maximize your options.
  - Threatening the temple can force your opponent into
    defensive moves, giving you the initiative.
  - Students are expendable -- sacrifice them to open paths
    for your master or to eliminate key enemy pieces.

CONTROLS
--------------------------------------------------------------
  'quit'     / 'q'  -- Quit the game
  'save'     / 's'  -- Save and suspend the game
  'help'     / 'h'  -- Show quick help
  'tutorial' / 't'  -- Show this tutorial
==============================================================
"""
