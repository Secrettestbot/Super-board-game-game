"""Onitama - A two-player martial-arts-themed abstract strategy game with movement cards."""

import random
from engine.base import BaseGame, input_with_quit, clear_screen


# Piece constants
EMPTY = 0
P1_PAWN = 1
P1_MASTER = 2
P2_PAWN = 3
P2_MASTER = 4

PIECE_SYMBOLS = {
    EMPTY: '  ',
    P1_PAWN: 'p1',
    P1_MASTER: 'M1',
    P2_PAWN: 'p2',
    P2_MASTER: 'M2',
}


def _owner(piece):
    if piece in (P1_PAWN, P1_MASTER):
        return 1
    if piece in (P2_PAWN, P2_MASTER):
        return 2
    return 0


def _is_master(piece):
    return piece in (P1_MASTER, P2_MASTER)


# Card definitions: each card has a name and a list of (dr, dc) movement offsets.
# Offsets are from Player 1's perspective (positive row = forward for P1 = toward row 0).
# For P1, forward means row decreases (dr < 0). For P2, offsets are mirrored.
# Convention: dr negative = forward (toward opponent), dr positive = backward.
CARD_DEFINITIONS = {
    'Tiger':    [(-2, 0), (1, 0)],
    'Dragon':   [(-1, -2), (-1, 2), (1, -1), (1, 1)],
    'Frog':     [(0, -2), (-1, -1), (1, 1)],
    'Rabbit':   [(0, 2), (-1, 1), (1, -1)],
    'Crab':     [(-1, 0), (0, -2), (0, 2)],
    'Elephant': [(-1, -1), (-1, 1), (0, -1), (0, 1)],
    'Goose':    [(-1, -1), (0, -1), (1, 1), (0, 1)],
    'Rooster':  [(-1, 1), (0, 1), (1, -1), (0, -1)],
    'Monkey':   [(-1, -1), (-1, 1), (1, -1), (1, 1)],
    'Mantis':   [(-1, -1), (-1, 1), (1, 0)],
    'Horse':    [(-1, 0), (0, -1), (1, 0)],
    'Ox':       [(-1, 0), (0, 1), (1, 0)],
    'Crane':    [(-1, 0), (1, -1), (1, 1)],
    'Boar':     [(-1, 0), (0, -1), (0, 1)],
    'Eel':      [(-1, -1), (1, -1), (0, 1)],
    'Cobra':    [(-1, 1), (1, 1), (0, -1)],
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
    }

    def __init__(self, variation=None):
        super().__init__(variation or "standard")
        self.board = []
        self.size = 5
        # Cards: {1: [card1, card2], 2: [card1, card2]}
        self.player_cards = {1: [], 2: []}
        self.neutral_card = None
        # Temple positions (where opponent's master started)
        self.temples = {1: None, 2: None}

    def setup(self):
        """Initialize the 5x5 board, pieces, and deal cards."""
        self.size = 5
        self.board = [[EMPTY] * self.size for _ in range(self.size)]

        # Player 1 at bottom (row 4), Player 2 at top (row 0)
        for c in range(self.size):
            self.board[4][c] = P1_PAWN
            self.board[0][c] = P2_PAWN

        # Masters in center of their rows
        mid = self.size // 2
        self.board[4][mid] = P1_MASTER
        self.board[0][mid] = P2_MASTER

        # Temple positions: opponent's master starting square
        self.temples = {1: (0, mid), 2: (4, mid)}

        # Deal 5 random cards from the 16
        cards = random.sample(ALL_CARD_NAMES, 5)
        self.player_cards = {1: [cards[0], cards[1]], 2: [cards[2], cards[3]]}
        self.neutral_card = cards[4]

    def _get_moves_for_card(self, card_name, player):
        """Get movement offsets for a card, adjusted for player perspective."""
        offsets = CARD_DEFINITIONS[card_name]
        if player == 1:
            # P1 is at bottom, forward = row decreasing
            return offsets
        else:
            # P2: mirror offsets (negate both dr and dc)
            return [(-dr, -dc) for dr, dc in offsets]

    def _get_all_valid_moves(self, player):
        """Return list of (card_name, from_r, from_c, to_r, to_c) for all valid moves."""
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

    def _format_card(self, card_name, player):
        """Format a card's movement pattern as a mini grid for display."""
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

    def display(self):
        """Display the board, cards, and game state."""
        print(f"\n  === Onitama ===")
        print(f"  Turn {self.turn_number + 1} - {self.players[self.current_player - 1]}'s move")
        print()

        # Show Player 2's cards at top
        print(f"  {self.players[1]} (P2) cards:")
        self._display_cards_side_by_side(self.player_cards[2], 2, "    ")

        # Board
        print()
        col_header = "      " + "  ".join(chr(ord('a') + c) for c in range(self.size))
        print(col_header)
        print("    +" + "---+" * self.size)
        for r in range(self.size):
            row_str = f"  {self.size - r} |"
            for c in range(self.size):
                piece = self.board[r][c]
                # Mark temple squares
                cell = PIECE_SYMBOLS[piece]
                row_str += f" {cell}|"
            row_str += f" {self.size - r}"
            print(row_str)
            print("    +" + "---+" * self.size)
        print(col_header)
        print()

        # Neutral card
        print(f"  Neutral card: {self.neutral_card}")
        n_lines = self._format_card(self.neutral_card, self.current_player)
        for line in n_lines:
            print(f"    {line}")
        print()

        # Show Player 1's cards at bottom
        print(f"  {self.players[0]} (P1) cards:")
        self._display_cards_side_by_side(self.player_cards[1], 1, "    ")
        print()

    def _display_cards_side_by_side(self, card_names, player, indent):
        """Display two cards side by side with their movement grids."""
        if not card_names:
            return
        grids = []
        for name in card_names:
            grids.append(self._format_card(name, player))

        # Print card names
        name_str = indent
        for name in card_names:
            name_str += f"  {name:^11}   "
        print(name_str)

        # Print grids side by side
        for row_idx in range(5):
            line = indent
            for g in grids:
                line += f"  {g[row_idx]}   "
            print(line)

    def _parse_position(self, s):
        """Parse a position like 'a1', 'c3', etc. Returns (row, col) or None."""
        s = s.strip().lower()
        if len(s) < 2:
            return None
        col_char = s[0]
        if col_char < 'a' or col_char > 'e':
            return None
        try:
            display_row = int(s[1:])
        except ValueError:
            return None
        col = ord(col_char) - ord('a')
        row = self.size - display_row
        if 0 <= row < self.size and 0 <= col < self.size:
            return (row, col)
        return None

    def _pos_to_str(self, r, c):
        return f"{chr(ord('a') + c)}{self.size - r}"

    def get_move(self):
        """Get a move: 'card_name piece_pos' (e.g., 'tiger c1')."""
        player = self.current_player
        name = self.players[player - 1]
        cards = self.player_cards[player]
        valid_moves = self._get_all_valid_moves(player)

        if not valid_moves:
            # No valid moves: player must still use a card (pass with card exchange)
            while True:
                raw = input_with_quit(
                    f"  {name}, no moves available. Choose a card to discard ({', '.join(cards)}): "
                ).strip().lower()
                for card in cards:
                    if raw == card.lower():
                        return ('pass', card)
                print(f"  Invalid card. Choose from: {', '.join(cards)}")

        while True:
            raw = input_with_quit(
                f"  {name}, enter move (card_name piece_pos, e.g. 'tiger c1'): "
            ).strip().lower()

            parts = raw.split()
            if len(parts) != 2:
                print("  Format: card_name piece_position (e.g. 'tiger c1')")
                continue

            card_input, pos_input = parts

            # Find matching card
            matched_card = None
            for card in cards:
                if card.lower() == card_input:
                    matched_card = card
                    break
            if matched_card is None:
                print(f"  Unknown card '{card_input}'. Your cards: {', '.join(cards)}")
                continue

            pos = self._parse_position(pos_input)
            if pos is None:
                print(f"  Invalid position '{pos_input}'. Use format like 'c1'.")
                continue

            fr, fc = pos
            if _owner(self.board[fr][fc]) != player:
                print(f"  No friendly piece at {self._pos_to_str(fr, fc)}.")
                continue

            # Find valid destinations for this card and piece
            offsets = self._get_moves_for_card(matched_card, player)
            destinations = []
            for dr, dc in offsets:
                nr, nc = fr + dr, fc + dc
                if 0 <= nr < self.size and 0 <= nc < self.size:
                    if _owner(self.board[nr][nc]) != player:
                        destinations.append((nr, nc))

            if not destinations:
                print(f"  No valid moves for piece at {self._pos_to_str(fr, fc)} using {matched_card}.")
                continue

            if len(destinations) == 1:
                tr, tc = destinations[0]
                return ('move', matched_card, fr, fc, tr, tc)

            # Multiple destinations: ask which one
            dest_strs = [self._pos_to_str(r, c) for r, c in destinations]
            print(f"  Destinations: {', '.join(dest_strs)}")
            while True:
                dest_input = input_with_quit(
                    f"  Choose destination: "
                ).strip().lower()
                dest_pos = self._parse_position(dest_input)
                if dest_pos and dest_pos in destinations:
                    return ('move', matched_card, fr, fc, dest_pos[0], dest_pos[1])
                print(f"  Invalid. Choose from: {', '.join(dest_strs)}")

    def make_move(self, move):
        """Apply a move. Returns True if valid."""
        player = self.current_player

        if move[0] == 'pass':
            # No valid moves: exchange card with neutral
            _, card_name = move
            cards = self.player_cards[player]
            if card_name not in cards:
                return False
            cards.remove(card_name)
            cards.append(self.neutral_card)
            self.neutral_card = card_name
            return True

        _, card_name, fr, fc, tr, tc = move
        cards = self.player_cards[player]

        if card_name not in cards:
            return False
        if _owner(self.board[fr][fc]) != player:
            return False
        if not (0 <= tr < self.size and 0 <= tc < self.size):
            return False
        if _owner(self.board[tr][tc]) == player:
            return False

        # Verify the move matches the card
        offsets = self._get_moves_for_card(card_name, player)
        dr, dc = tr - fr, tc - fc
        if (dr, dc) not in offsets:
            return False

        # Execute move
        captured = self.board[tr][tc]
        self.board[tr][tc] = self.board[fr][fc]
        self.board[fr][fc] = EMPTY

        # Exchange card with neutral
        cards.remove(card_name)
        cards.append(self.neutral_card)
        self.neutral_card = card_name

        return True

    def check_game_over(self):
        """Check for win: capture opponent's master or move master to opponent's temple."""
        # Check if either master is missing (captured)
        p1_master_found = False
        p2_master_found = False
        p1_master_pos = None
        p2_master_pos = None

        for r in range(self.size):
            for c in range(self.size):
                if self.board[r][c] == P1_MASTER:
                    p1_master_found = True
                    p1_master_pos = (r, c)
                elif self.board[r][c] == P2_MASTER:
                    p2_master_found = True
                    p2_master_pos = (r, c)

        if not p2_master_found:
            self.game_over = True
            self.winner = 1
            return
        if not p1_master_found:
            self.game_over = True
            self.winner = 2
            return

        # Check "Way of the Stone": master reaches opponent's temple
        if p1_master_pos == self.temples[1]:
            self.game_over = True
            self.winner = 1
            return
        if p2_master_pos == self.temples[2]:
            self.game_over = True
            self.winner = 2
            return

    def get_state(self):
        """Return serializable game state."""
        return {
            'board': [row[:] for row in self.board],
            'player_cards': {str(k): v[:] for k, v in self.player_cards.items()},
            'neutral_card': self.neutral_card,
            'temples': {str(k): list(v) for k, v in self.temples.items()},
        }

    def load_state(self, state):
        """Restore game state."""
        self.board = [row[:] for row in state['board']]
        self.player_cards = {int(k): v[:] for k, v in state['player_cards'].items()}
        self.neutral_card = state['neutral_card']
        self.temples = {int(k): tuple(v) for k, v in state['temples'].items()}

    def get_tutorial(self):
        """Return tutorial text."""
        return """
==============================================================
                   ONITAMA TUTORIAL
==============================================================

OVERVIEW
  Onitama is a two-player abstract strategy game played on a
  5x5 grid. Each player controls 4 pawns and 1 master. The
  game uses movement cards that define how pieces can move.

--------------------------------------------------------------
SETUP
--------------------------------------------------------------
  Each player starts with 5 pieces on their home row:
    - 4 pawns and 1 master (in the center)

  5 movement cards are dealt from a set of 16:
    - Each player receives 2 cards
    - 1 card is placed to the side (neutral card)

  Player 1 (P1) is at the bottom, Player 2 (P2) at the top.

--------------------------------------------------------------
MOVEMENT CARDS
--------------------------------------------------------------
  Each card shows a pattern of moves relative to a piece.
  On the card display:
    X = piece's current position
    * = positions the piece can move to
    . = empty space

  Available cards:
    Tiger    - Forward 2, back 1
    Dragon   - Diagonal-forward 2, diagonal-back 1
    Frog     - Left 2, forward-left 1, back-right 1
    Rabbit   - Right 2, forward-right 1, back-left 1
    Crab     - Forward 1, left 2, right 2
    Elephant - Forward-left 1, forward-right 1, left 1, right 1
    Goose    - Forward-left 1, left 1, back-right 1, right 1
    Rooster  - Forward-right 1, right 1, back-left 1, left 1
    Monkey   - All 4 diagonals
    Mantis   - Forward-left 1, forward-right 1, back 1
    Horse    - Forward 1, left 1, back 1
    Ox       - Forward 1, right 1, back 1
    Crane    - Forward 1, back-left 1, back-right 1
    Boar     - Forward 1, left 1, right 1
    Eel      - Forward-left 1, back-left 1, right 1
    Cobra    - Forward-right 1, back-right 1, left 1

--------------------------------------------------------------
HOW TO PLAY
--------------------------------------------------------------
  1. On your turn, choose one of your two cards.
  2. Move one of your pieces according to that card's pattern.
  3. You may capture an opponent's piece by landing on it.
  4. The used card goes to the side (becomes the new neutral
     card), and the old neutral card comes to your hand.

  Move input format:
    card_name piece_position
    Example: tiger c1

  The piece at the given position will move using the card.
  If multiple destinations are possible, you will be prompted
  to choose one.

--------------------------------------------------------------
WINNING
--------------------------------------------------------------
  There are two ways to win:

  1. WAY OF THE STONE (capture):
     Capture your opponent's master piece.

  2. WAY OF THE STREAM (temple):
     Move YOUR master to your opponent's temple square
     (the center of their starting row).

--------------------------------------------------------------
BOARD NOTATION
--------------------------------------------------------------
  Columns: a-e (left to right)
  Rows: 1-5 (bottom to top)

  Pieces:
    p1 = Player 1 pawn     M1 = Player 1 master
    p2 = Player 2 pawn     M2 = Player 2 master

--------------------------------------------------------------
STRATEGY HINTS
--------------------------------------------------------------
  - Keep your master protected but not too far from center.
  - Watch which cards cycle to your opponent.
  - Sometimes threatening the temple forces the opponent to
    retreat their master instead of attacking.
  - Think two turns ahead: the card you use now goes to your
    opponent after your next turn.

--------------------------------------------------------------
CONTROLS
--------------------------------------------------------------
  'quit'  / 'q'  -- Quit the game
  'save'  / 's'  -- Save and suspend the game
  'help'  / 'h'  -- Show quick help
  'tutorial' / 't' -- Show this tutorial
==============================================================
"""
