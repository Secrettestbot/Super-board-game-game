"""Sequence board/card game implementation."""

import random
from engine.base import BaseGame, input_with_quit, clear_screen

# Standard 10x10 board layout - each cell has a card label.
# 'FR' = free corner. Cards from 2 decks of 48 (no Jacks in deck = 96 spaces + 4 corners).
# Suits: S=Spades, H=Hearts, D=Diamonds, C=Clubs
# Ranks: 2-9, T=10, Q=Queen, K=King, A=Ace
BOARD_10x10 = [
    ["FR", "2S", "3S", "4S", "5S", "6S", "7S", "8S", "9S", "FR"],
    ["2D", "6S", "7S", "8S", "9S", "TS", "QS", "KS", "AS", "2C"],
    ["3D", "5S", "2H", "3H", "4H", "5H", "6H", "7H", "AC", "3C"],
    ["4D", "4S", "AH", "KD", "QD", "TD", "9D", "8H", "KC", "4C"],
    ["5D", "3S", "KH", "AD", "9C", "8C", "7D", "9H", "QC", "5C"],
    ["6D", "2S", "QH", "2D", "8C", "7C", "6D", "TH", "TC", "6C"],
    ["7D", "AS", "TH", "3D", "7C", "6C", "5D", "QH", "9C", "7C"],
    ["8D", "KS", "9H", "4D", "5C", "4C", "4D", "KH", "8C", "8C"],
    ["9D", "QS", "8H", "7H", "6H", "5H", "3D", "2H", "AH", "9C"],
    ["FR", "TD", "AD", "KD", "QD", "TD", "2D", "3C", "2C", "FR"],
]

# Smaller 7x7 board for quick mode (1 deck, 45 non-corner spaces + 4 corners = 49 = 7x7)
BOARD_7x7 = [
    ["FR", "2S", "3S", "4S", "5S", "6S", "FR"],
    ["2D", "7S", "8S", "9S", "TS", "QS", "2C"],
    ["3D", "6S", "2H", "3H", "4H", "KS", "3C"],
    ["4D", "5S", "AH", "KD", "5H", "AS", "4C"],
    ["5D", "4S", "KH", "QD", "6H", "AC", "5C"],
    ["6D", "3S", "QH", "TD", "7H", "KC", "6C"],
    ["FR", "7D", "8D", "9D", "AD", "QC", "FR"],
]

# All ranks that appear on board (no Jacks on board)
BOARD_RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "T", "Q", "K", "A"]
SUITS = ["S", "H", "D", "C"]


def _make_deck(count=2):
    """Build a deck (count copies) of 52 cards including Jacks."""
    cards = []
    ranks = ["2", "3", "4", "5", "6", "7", "8", "9", "T", "J", "Q", "K", "A"]
    for _ in range(count):
        for r in ranks:
            for s in SUITS:
                cards.append(r + s)
    return cards


def _card_display(card):
    """Pretty-print a card label (2-char)."""
    suit_symbols = {"S": "\u2660", "H": "\u2665", "D": "\u2666", "C": "\u2663"}
    if card == "FR":
        return "**"
    rank = card[:-1]
    suit = card[-1]
    return rank + suit_symbols.get(suit, suit)


def _is_two_eyed_jack(card):
    """Two-eyed Jacks: JD and JC (diamonds and clubs) are wild."""
    return card in ("JD", "JC")


def _is_one_eyed_jack(card):
    """One-eyed Jacks: JS and JH (spades and hearts) remove opponent chip."""
    return card in ("JS", "JH")


class SequenceGame(BaseGame):
    """Sequence board/card game."""

    name = "Sequence"
    description = "Play cards to place chips and form sequences of 5 on the board"
    min_players = 2
    max_players = 2
    variations = {
        "standard": "Standard Sequence",
        "small": "Quick Sequence (7x7)",
    }

    CHIP_SYMBOLS = {0: ".", 1: "X", 2: "O"}

    def __init__(self, variation=None):
        super().__init__(variation or "standard")

    # ------------------------------------------------------------------ setup
    def setup(self):
        if self.variation == "small":
            self.board_layout = [row[:] for row in BOARD_7x7]
            self.rows = 7
            self.cols = 7
            self.sequences_to_win = 1
            deck_copies = 1
        else:
            self.board_layout = [row[:] for row in BOARD_10x10]
            self.rows = 10
            self.cols = 10
            self.sequences_to_win = 2
            deck_copies = 2

        # chips[r][c]: 0=empty, 1=player1, 2=player2, -1=free corner
        self.chips = [[0] * self.cols for _ in range(self.rows)]
        # Mark free corners
        for r in range(self.rows):
            for c in range(self.cols):
                if self.board_layout[r][c] == "FR":
                    self.chips[r][c] = -1  # free corner, counts for everyone

        # Build and shuffle deck
        self.deck = _make_deck(deck_copies)
        random.shuffle(self.deck)

        # Deal 7 cards to each player
        self.hands = {1: [], 2: []}
        for _ in range(7):
            self.hands[1].append(self.deck.pop())
            self.hands[2].append(self.deck.pop())

        # Track which cells are part of completed sequences (can still share 1)
        self.sequence_cells = {1: [], 2: []}  # list of sets

    # --------------------------------------------------------------- display
    def display(self):
        p = self.players[self.current_player - 1]
        sym = self.CHIP_SYMBOLS[self.current_player]
        print(f"\n  Sequence ({self.variation})  --  Turn {self.turn_number + 1}")
        print(f"  {self.players[0]} (X)  vs  {self.players[1]} (O)")
        print(f"  Current: {p} ({sym})    Deck: {len(self.deck)} cards left")
        seq1 = len(self.sequence_cells[1])
        seq2 = len(self.sequence_cells[2])
        need = self.sequences_to_win
        print(f"  Sequences: X={seq1}/{need}  O={seq2}/{need}\n")

        self._display_board()

        # Show current player's hand
        hand = self.hands[self.current_player]
        print(f"\n  Your hand:")
        parts = []
        for i, card in enumerate(hand):
            parts.append(f"  {i + 1}: {_card_display(card)}")
        print("  " + "  ".join(parts))
        print()

    def _display_board(self):
        # Column headers
        hdr = "     "
        for c in range(self.cols):
            hdr += f" c{c:<3}"
        print(hdr)

        for r in range(self.rows):
            row_str = f"  r{r} "
            for c in range(self.cols):
                chip = self.chips[r][c]
                if chip == -1:
                    # Free corner
                    row_str += " [*] "
                elif chip == 1:
                    row_str += " [X] "
                elif chip == 2:
                    row_str += " [O] "
                else:
                    # Show card label
                    label = _card_display(self.board_layout[r][c])
                    row_str += f" {label:<3} "
            print(row_str)
        print()

    # --------------------------------------------------------------- get_move
    def get_move(self):
        hand = self.hands[self.current_player]
        while True:
            raw = input_with_quit(
                f"  {self.players[self.current_player - 1]}, play a card "
                f"(e.g. 'play 3' or 'play 3 r2c5'): "
            )
            raw = raw.strip().lower()
            if not raw.startswith("play "):
                print("  Use 'play N' or 'play N rRcC'. Type 'help' for help.")
                continue

            parts = raw[5:].split()
            if len(parts) < 1:
                print("  Specify which card to play (1-7).")
                continue

            try:
                card_idx = int(parts[0]) - 1
            except ValueError:
                print("  Card number must be an integer.")
                continue

            if card_idx < 0 or card_idx >= len(hand):
                print(f"  Pick a card number 1-{len(hand)}.")
                continue

            card = hand[card_idx]
            pos = None

            if len(parts) >= 2:
                pos = self._parse_pos(parts[1])
                if pos is None:
                    print("  Position format: rRcC, e.g. r2c5")
                    continue

            # Handle dead card discard
            if not _is_two_eyed_jack(card) and not _is_one_eyed_jack(card):
                positions = self._find_board_positions(card)
                open_positions = [(r, c) for r, c in positions if self.chips[r][c] == 0]
                if not open_positions:
                    # Dead card: both spaces occupied, discard and draw
                    print(f"  {_card_display(card)} is a dead card (no open spaces). Discarding and drawing.")
                    hand.pop(card_idx)
                    if self.deck:
                        hand.append(self.deck.pop())
                    input_with_quit("  Press Enter to continue...")
                    return None  # Signal to skip turn processing

            # For Jacks, position is required
            if _is_two_eyed_jack(card):
                if pos is None:
                    pos = self._ask_position("  Place chip at (rRcC): ")
                    if pos is None:
                        continue
                return ("wild", card_idx, pos)
            elif _is_one_eyed_jack(card):
                if pos is None:
                    pos = self._ask_position("  Remove opponent chip at (rRcC): ")
                    if pos is None:
                        continue
                return ("remove", card_idx, pos)
            else:
                # Normal card
                positions = self._find_board_positions(card)
                open_positions = [(r, c) for r, c in positions if self.chips[r][c] == 0]
                if len(open_positions) == 1:
                    pos = open_positions[0]
                elif pos is None:
                    print(f"  Card appears at multiple positions: ", end="")
                    for r, c in open_positions:
                        print(f"r{r}c{c} ", end="")
                    print()
                    pos = self._ask_position("  Choose position (rRcC): ")
                    if pos is None:
                        continue
                    if pos not in open_positions:
                        print("  That position doesn't match this card or is occupied.")
                        continue
                else:
                    if pos not in open_positions:
                        print("  That position doesn't match this card or is occupied.")
                        continue
                return ("place", card_idx, pos)

    def _ask_position(self, prompt):
        raw = input_with_quit(prompt).strip().lower()
        return self._parse_pos(raw)

    def _parse_pos(self, s):
        """Parse 'r3c5' into (3, 5)."""
        s = s.strip().lower()
        if not s.startswith("r"):
            return None
        try:
            rest = s[1:]
            if "c" not in rest:
                return None
            rpart, cpart = rest.split("c")
            r, c = int(rpart), int(cpart)
            if 0 <= r < self.rows and 0 <= c < self.cols:
                return (r, c)
        except (ValueError, IndexError):
            pass
        return None

    def _find_board_positions(self, card):
        """Find all (r, c) on the board matching this card label."""
        positions = []
        for r in range(self.rows):
            for c in range(self.cols):
                if self.board_layout[r][c] == card:
                    positions.append((r, c))
        return positions

    # -------------------------------------------------------------- make_move
    def make_move(self, move):
        if move is None:
            # Dead card discard, already handled
            return True

        action, card_idx, (r, c) = move
        hand = self.hands[self.current_player]
        card = hand[card_idx]

        if action == "wild":
            # Two-eyed Jack: place anywhere empty (not free corner which is already set)
            if self.chips[r][c] != 0:
                print("  That space is not empty.")
                return False
            self.chips[r][c] = self.current_player
        elif action == "remove":
            # One-eyed Jack: remove opponent chip (not free corner, not own, not in sequence)
            opponent = 2 if self.current_player == 1 else 1
            if self.chips[r][c] != opponent:
                print("  You can only remove an opponent's chip.")
                return False
            if self._cell_in_completed_sequence(r, c, opponent):
                print("  Cannot remove a chip that is part of a completed sequence.")
                return False
            self.chips[r][c] = 0
        elif action == "place":
            if self.chips[r][c] != 0:
                print("  That space is already occupied.")
                return False
            # Verify card matches board position
            if self.board_layout[r][c] != card:
                print("  Card doesn't match that board position.")
                return False
            self.chips[r][c] = self.current_player
        else:
            return False

        # Remove card from hand and draw
        hand.pop(card_idx)
        if self.deck:
            hand.append(self.deck.pop())

        return True

    def _cell_in_completed_sequence(self, r, c, player):
        """Check if (r, c) is part of a completed sequence for player."""
        for seq in self.sequence_cells[player]:
            if (r, c) in seq:
                return True
        return False

    # -------------------------------------------------------- check_game_over
    def check_game_over(self):
        for player in [1, 2]:
            seqs = self._find_all_sequences(player)
            self.sequence_cells[player] = seqs
            if len(seqs) >= self.sequences_to_win:
                self.game_over = True
                self.winner = player
                return

        # Check if both players are out of cards and deck is empty
        if not self.deck and not self.hands[1] and not self.hands[2]:
            self.game_over = True
            self.winner = None

    def _find_all_sequences(self, player):
        """Find all non-overlapping sequences of 5 for player.

        A chip counts for the player if chips[r][c] == player or chips[r][c] == -1 (free corner).
        Two sequences may share at most one cell.
        We greedily collect sequences.
        """
        candidates = []
        directions = [(0, 1), (1, 0), (1, 1), (1, -1)]  # horizontal, vertical, diag-down-right, diag-down-left

        for r in range(self.rows):
            for c in range(self.cols):
                for dr, dc in directions:
                    cells = []
                    valid = True
                    for i in range(5):
                        nr, nc = r + dr * i, c + dc * i
                        if not (0 <= nr < self.rows and 0 <= nc < self.cols):
                            valid = False
                            break
                        if self.chips[nr][nc] != player and self.chips[nr][nc] != -1:
                            valid = False
                            break
                        cells.append((nr, nc))
                    if valid and len(cells) == 5:
                        candidates.append(frozenset(cells))

        # Remove duplicates
        candidates = list(set(candidates))

        # Greedily select sequences that share at most 1 cell with any previously selected
        selected = []
        used_cells = {}  # cell -> count of sequences using it

        for seq in candidates:
            overlap = 0
            for cell in seq:
                if used_cells.get(cell, 0) > 0:
                    overlap += 1
            # A sequence can share at most 1 cell with each existing sequence
            # More precisely: each cell can be shared by at most 2 sequences
            can_use = True
            if overlap > 1:
                can_use = False
            else:
                # Check per-cell: no cell already used by 2 sequences
                for cell in seq:
                    if used_cells.get(cell, 0) >= 2:
                        can_use = False
                        break

            if can_use:
                selected.append(seq)
                for cell in seq:
                    used_cells[cell] = used_cells.get(cell, 0) + 1

        return selected

    # ----------------------------------------------------------- state / save
    def get_state(self):
        return {
            "variation": self.variation,
            "rows": self.rows,
            "cols": self.cols,
            "sequences_to_win": self.sequences_to_win,
            "board_layout": self.board_layout,
            "chips": self.chips,
            "deck": self.deck,
            "hands": {str(k): v for k, v in self.hands.items()},
            "sequence_cells": {
                str(k): [list(s) for s in v]
                for k, v in self.sequence_cells.items()
            },
        }

    def load_state(self, state):
        self.variation = state["variation"]
        self.rows = state["rows"]
        self.cols = state["cols"]
        self.sequences_to_win = state["sequences_to_win"]
        self.board_layout = state["board_layout"]
        self.chips = state["chips"]
        self.deck = state["deck"]
        self.hands = {int(k): v for k, v in state["hands"].items()}
        self.sequence_cells = {
            int(k): [frozenset(tuple(c) for c in s) for s in v]
            for k, v in state["sequence_cells"].items()
        }

    # -------------------------------------------------------------- tutorial
    def get_tutorial(self):
        return """
==============================================================
                     SEQUENCE  TUTORIAL
==============================================================

OVERVIEW
  Sequence is a board-and-card game for 2 players. Play cards
  from your hand to place chips on the matching board spaces.
  Form sequences of 5 chips in a row to win!

--------------------------------------------------------------
HOW TO PLAY
--------------------------------------------------------------
  1. Each player is dealt 7 cards.
  2. On your turn, play a card from your hand and place a chip
     on one of the board spaces that shows that card.
  3. Draw a new card from the deck.
  4. Try to form sequences of 5 chips in a row (horizontal,
     vertical, or diagonal).

--------------------------------------------------------------
SPECIAL CARDS: JACKS
--------------------------------------------------------------
  Two-Eyed Jacks (JD, JC) are WILD:
    Play one to place your chip on ANY empty board space.
    Usage: play N rRcC  (e.g. 'play 3 r4c5')

  One-Eyed Jacks (JS, JH) REMOVE:
    Play one to remove an opponent's chip from the board.
    Cannot remove chips in completed sequences.
    Usage: play N rRcC  (e.g. 'play 2 r1c3')

--------------------------------------------------------------
FREE CORNERS
--------------------------------------------------------------
  The four corners of the board are free spaces marked [*].
  They count as part of a sequence for BOTH players.

--------------------------------------------------------------
DEAD CARDS
--------------------------------------------------------------
  If both board spaces matching your card are occupied,
  the card is "dead." You can discard it and draw a new one.

--------------------------------------------------------------
WINNING
--------------------------------------------------------------
  Standard (10x10): Get 2 sequences of 5 in a row.
  Quick (7x7):      Get 1 sequence of 5 in a row.

  Two sequences may share one chip between them.

--------------------------------------------------------------
INPUT FORMAT
--------------------------------------------------------------
  'play N'         -- Play card N from your hand
  'play N rRcC'    -- Play card N at row R, column C
  Example: 'play 3 r2c5'  plays card 3 at row 2, col 5

--------------------------------------------------------------
BOARD DISPLAY
--------------------------------------------------------------
  [X] = Player 1 chip    [O] = Player 2 chip
  [*] = Free corner      Card labels = open spaces

--------------------------------------------------------------
CONTROLS
--------------------------------------------------------------
  'quit'  / 'q'  -- Quit the game
  'save'  / 's'  -- Save and suspend the game
  'help'  / 'h'  -- Show quick help
  'tutorial' / 't' -- Show this tutorial
==============================================================
"""
