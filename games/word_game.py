"""Scrabble-like word game."""

import random
from engine.base import BaseGame, input_with_quit, clear_screen


# Tile point values
TILE_VALUES = {
    'A': 1, 'B': 3, 'C': 3, 'D': 2, 'E': 1, 'F': 4, 'G': 2, 'H': 4,
    'I': 1, 'J': 8, 'K': 5, 'L': 1, 'M': 3, 'N': 1, 'O': 1, 'P': 3,
    'Q': 10, 'R': 1, 'S': 1, 'T': 1, 'U': 1, 'V': 4, 'W': 4, 'X': 8,
    'Y': 4, 'Z': 10, ' ': 0,
}

# Tile distribution (100 tiles total)
TILE_DISTRIBUTION = {
    'A': 9, 'B': 2, 'C': 2, 'D': 4, 'E': 12, 'F': 2, 'G': 3, 'H': 2,
    'I': 9, 'J': 1, 'K': 1, 'L': 4, 'M': 2, 'N': 6, 'O': 8, 'P': 2,
    'Q': 1, 'R': 6, 'S': 4, 'T': 6, 'U': 4, 'V': 2, 'W': 2, 'X': 1,
    'Y': 2, 'Z': 1, ' ': 2,
}

# Premium square positions for 15x15 board (row, col) -> type
# TW = Triple Word, DW = Double Word, TL = Triple Letter, DL = Double Letter
def _build_premium_map(size):
    """Build premium square map for standard 15x15 board."""
    premiums = {}
    if size == 15:
        # Triple Word squares
        tw = [(0,0),(0,7),(0,14),(7,0),(7,14),(14,0),(14,7),(14,14)]
        for r, c in tw:
            premiums[(r, c)] = 'TW'

        # Double Word squares
        dw = [(1,1),(2,2),(3,3),(4,4),(1,13),(2,12),(3,11),(4,10),
              (13,1),(12,2),(11,3),(10,4),(13,13),(12,12),(11,11),(10,10),
              (7,7)]
        for r, c in dw:
            premiums[(r, c)] = 'DW'

        # Triple Letter squares
        tl = [(1,5),(1,9),(5,1),(5,5),(5,9),(5,13),
              (9,1),(9,5),(9,9),(9,13),(13,5),(13,9)]
        for r, c in tl:
            premiums[(r, c)] = 'TL'

        # Double Letter squares
        dl = [(0,3),(0,11),(2,6),(2,8),(3,0),(3,7),(3,14),
              (6,2),(6,6),(6,8),(6,12),
              (7,3),(7,11),
              (8,2),(8,6),(8,8),(8,12),
              (11,0),(11,7),(11,14),(12,6),(12,8),
              (14,3),(14,11)]
        for r, c in dl:
            premiums[(r, c)] = 'DL'

    elif size == 11:
        # Scaled-down premium layout for quick game
        tw = [(0,0),(0,5),(0,10),(5,0),(5,10),(10,0),(10,5),(10,10)]
        for r, c in tw:
            premiums[(r, c)] = 'TW'
        dw = [(1,1),(2,2),(3,3),(1,9),(2,8),(3,7),
              (9,1),(8,2),(7,3),(9,9),(8,8),(7,7),(5,5)]
        for r, c in dw:
            premiums[(r, c)] = 'DW'
        tl = [(1,4),(1,6),(4,1),(4,4),(4,6),(4,9),
              (6,1),(6,4),(6,6),(6,9),(9,4),(9,6)]
        for r, c in tl:
            premiums[(r, c)] = 'TL'
        dl = [(0,2),(0,8),(2,5),(3,0),(3,10),(5,2),(5,8),
              (7,0),(7,10),(8,5),(10,2),(10,8)]
        for r, c in dl:
            premiums[(r, c)] = 'DL'

    return premiums


class WordGame(BaseGame):
    """Scrabble-like word game for two players."""

    name = "Word Game"
    description = "A Scrabble-like word game with premium squares and tile racks"
    min_players = 2
    max_players = 2
    variations = {
        "standard": "Standard (15x15 board)",
        "quick": "Quick (11x11 board)",
    }

    def __init__(self, variation=None):
        super().__init__(variation or "standard")

    # ------------------------------------------------------------------ setup
    def setup(self):
        self.size = 15 if self.variation == "standard" else 11
        self.center = self.size // 2
        self.board = [[None] * self.size for _ in range(self.size)]
        self.premiums = _build_premium_map(self.size)
        self.scores = [0, 0]
        self.racks = [[], []]
        self.bag = []
        self.consecutive_passes = 0
        self.last_play = None  # for challenge system
        self.last_play_tiles = []  # positions of last placed tiles
        self.last_play_score = 0
        self.last_player = None

        # Fill the bag
        for letter, count in TILE_DISTRIBUTION.items():
            self.bag.extend([letter] * count)
        random.shuffle(self.bag)

        # Draw initial racks
        for i in range(2):
            self._draw_tiles(i, 7)

    def _draw_tiles(self, player_idx, count):
        """Draw tiles from bag into player's rack."""
        drawn = min(count, len(self.bag))
        for _ in range(drawn):
            self.racks[player_idx].append(self.bag.pop())

    # --------------------------------------------------------------- display
    def display(self):
        size = self.size
        p = self.players[self.current_player - 1]
        print(f"\n  {self.name} ({self.variation})  --  Turn {self.turn_number + 1}")
        print(f"  {self.players[0]}: {self.scores[0]} pts  |  "
              f"{self.players[1]}: {self.scores[1]} pts")
        print(f"  Tiles in bag: {len(self.bag)}")
        print(f"  Current: {p}\n")

        # Column headers
        col_hdr = "     " + " ".join(f"{c:>3}" for c in range(size))
        print(col_hdr)
        print("     " + "----" * size + "-")

        for r in range(size):
            row_str = f" {r:>2} |"
            for c in range(size):
                cell = self.board[r][c]
                if cell is not None:
                    letter, is_blank = cell
                    if is_blank:
                        row_str += f" {letter.lower()} "
                    else:
                        row_str += f" {letter}  "
                else:
                    prem = self.premiums.get((r, c))
                    if prem:
                        row_str += f" {prem}"
                        if len(prem) == 2:
                            row_str += " "
                    elif r == self.center and c == self.center:
                        row_str += " *  "
                    else:
                        row_str += " .  "
            row_str += "|"
            print(row_str)

        print("     " + "----" * size + "-")

        # Show current player's rack
        rack = self.racks[self.current_player - 1]
        rack_display = " ".join(
            f"[{t if t != ' ' else '_'}]" for t in rack
        )
        print(f"\n  Your rack: {rack_display}")
        print(f"  Commands: play WORD row col across/down | exchange TILES | pass")
        if self.last_play is not None:
            print(f"  (Type 'challenge' to challenge the last word: "
                  f"'{self.last_play}')")
        print()

    # --------------------------------------------------------------- get_move
    def get_move(self):
        while True:
            raw = input_with_quit(
                f"  {self.players[self.current_player - 1]}'s move: "
            )
            raw = raw.strip()
            if not raw:
                print("  Please enter a command.")
                continue

            parts = raw.split()
            cmd = parts[0].lower()

            if cmd == "play" and len(parts) == 5:
                word = parts[1]
                try:
                    row = int(parts[2])
                    col = int(parts[3])
                except ValueError:
                    print("  Row and column must be numbers.")
                    continue
                direction = parts[4].lower()
                if direction not in ("across", "down"):
                    print("  Direction must be 'across' or 'down'.")
                    continue
                if not (0 <= row < self.size and 0 <= col < self.size):
                    print(f"  Row/col must be 0-{self.size - 1}.")
                    continue
                return ("play", word, row, col, direction)

            elif cmd == "exchange" and len(parts) == 2:
                tiles = parts[1].upper().replace('_', ' ')
                return ("exchange", tiles)

            elif cmd == "pass":
                return ("pass",)

            elif cmd == "challenge":
                return ("challenge",)

            else:
                print("  Invalid command. Use:")
                print("    play WORD row col across/down")
                print("    exchange TILES")
                print("    pass")
                if self.last_play is not None:
                    print("    challenge")

    # -------------------------------------------------------------- make_move
    def make_move(self, move):
        if move[0] == "challenge":
            return self._do_challenge()
        elif move[0] == "pass":
            return self._do_pass()
        elif move[0] == "exchange":
            return self._do_exchange(move[1])
        elif move[0] == "play":
            return self._do_play(move[1], move[2], move[3], move[4])
        return False

    def _do_challenge(self):
        """Challenge the last played word. If challenged, remove it."""
        if self.last_play is None:
            print("  No word to challenge.")
            return False

        # The challenged player loses their word
        challenger = self.current_player
        challenged_player = self.last_player

        print(f"\n  {self.players[challenger - 1]} challenges '{self.last_play}'!")
        print(f"  Does {self.players[challenged_player - 1]} accept the challenge?")
        print(f"  (If the word is invalid, type 'remove'. If valid, type 'keep')")

        while True:
            resp = input_with_quit("  remove/keep: ").strip().lower()
            if resp in ("remove", "keep"):
                break
            print("  Please type 'remove' or 'keep'.")

        if resp == "remove":
            # Remove tiles from board, return to player's rack
            for r, c, letter, is_blank in self.last_play_tiles:
                self.board[r][c] = None
                tile = ' ' if is_blank else letter
                self.racks[challenged_player - 1].append(tile)
            # Remove score
            self.scores[challenged_player - 1] -= self.last_play_score
            print(f"  Word removed! {self.players[challenged_player - 1]} "
                  f"loses {self.last_play_score} points.")
            input_with_quit("  Press Enter to continue...")
        else:
            print(f"  Word kept. {self.players[challenger - 1]} loses their turn.")
            input_with_quit("  Press Enter to continue...")

        self.last_play = None
        self.last_play_tiles = []
        self.last_play_score = 0
        self.last_player = None
        self.consecutive_passes = 0
        return True

    def _do_pass(self):
        self.consecutive_passes += 1
        self.last_play = None
        self.last_play_tiles = []
        self.last_play_score = 0
        self.last_player = None
        return True

    def _do_exchange(self, tiles_str):
        """Exchange tiles: put them back in bag, draw new ones."""
        if len(self.bag) == 0:
            print("  No tiles left in bag to exchange.")
            return False

        rack = self.racks[self.current_player - 1]
        tiles_to_exchange = list(tiles_str)

        # Check player has all these tiles
        temp_rack = rack[:]
        for t in tiles_to_exchange:
            if t in temp_rack:
                temp_rack.remove(t)
            else:
                print(f"  You don't have tile '{t}' in your rack.")
                return False

        # Remove tiles from rack, put back in bag
        for t in tiles_to_exchange:
            rack.remove(t)
            self.bag.append(t)
        random.shuffle(self.bag)

        # Draw new tiles
        self._draw_tiles(self.current_player - 1, len(tiles_to_exchange))

        self.consecutive_passes = 0
        self.last_play = None
        self.last_play_tiles = []
        self.last_play_score = 0
        self.last_player = None
        return True

    def _do_play(self, word, row, col, direction):
        """Place a word on the board."""
        size = self.size
        player_idx = self.current_player - 1
        rack = self.racks[player_idx]

        dr = 0 if direction == "across" else 1
        dc = 1 if direction == "across" else 0

        # Parse the word: lowercase = blank tile used as that letter
        tiles_needed = []  # (letter_to_place, is_blank)
        for ch in word:
            if ch.islower():
                tiles_needed.append((ch.upper(), True))
            else:
                tiles_needed.append((ch, False))

        # Check word fits on board
        end_r = row + dr * (len(word) - 1)
        end_c = col + dc * (len(word) - 1)
        if end_r >= size or end_c >= size:
            print("  Word doesn't fit on the board.")
            return False

        # Determine which tiles come from rack vs already on board
        tiles_from_rack = []
        placed_positions = []
        temp_rack = rack[:]

        for i, (letter, is_blank) in enumerate(tiles_needed):
            r = row + dr * i
            c = col + dc * i
            existing = self.board[r][c]

            if existing is not None:
                # Tile already on board - must match
                if existing[0] != letter:
                    print(f"  Conflict at ({r},{c}): board has '{existing[0]}', "
                          f"word needs '{letter}'.")
                    return False
            else:
                # Need to place from rack
                if is_blank:
                    if ' ' in temp_rack:
                        temp_rack.remove(' ')
                        tiles_from_rack.append((' ', letter, is_blank))
                    else:
                        print("  You don't have a blank tile.")
                        return False
                else:
                    if letter in temp_rack:
                        temp_rack.remove(letter)
                        tiles_from_rack.append((letter, letter, is_blank))
                    else:
                        print(f"  You don't have tile '{letter}' in your rack.")
                        return False
                placed_positions.append((r, c, letter, is_blank))

        if len(placed_positions) == 0:
            print("  You must place at least one new tile.")
            return False

        # Check first move crosses center
        is_first_move = all(
            self.board[r][c] is None
            for r in range(size) for c in range(size)
        )
        if is_first_move:
            crosses_center = False
            for i in range(len(word)):
                r = row + dr * i
                c = col + dc * i
                if r == self.center and c == self.center:
                    crosses_center = True
                    break
            if not crosses_center:
                print(f"  First word must cross center square ({self.center},{self.center}).")
                return False
        else:
            # Check connectivity: at least one new tile must be adjacent to
            # or overlap with an existing tile
            connected = False
            for i in range(len(word)):
                r = row + dr * i
                c = col + dc * i
                if self.board[r][c] is not None:
                    connected = True
                    break
                # Check neighbors
                for nr, nc in [(r-1,c),(r+1,c),(r,c-1),(r,c+1)]:
                    if 0 <= nr < size and 0 <= nc < size:
                        if self.board[nr][nc] is not None:
                            connected = True
                            break
                if connected:
                    break
            if not connected:
                print("  Word must connect to existing tiles on the board.")
                return False

        # Place tiles on board
        for r, c, letter, is_blank in placed_positions:
            self.board[r][c] = (letter, is_blank)

        # Calculate score
        score = self._calculate_score(word, row, col, dr, dc, placed_positions)

        # 50-point bonus for using all 7 tiles
        if len(tiles_from_rack) == 7:
            score += 50
            print("  BINGO! 50 bonus points for using all 7 tiles!")

        self.scores[player_idx] += score
        print(f"  '{word}' scores {score} points!")

        # Update rack
        for tile_char, letter, is_blank in tiles_from_rack:
            rack.remove(tile_char)

        # Draw new tiles
        self._draw_tiles(player_idx, len(tiles_from_rack))

        # Store for challenge
        self.last_play = word
        self.last_play_tiles = placed_positions
        self.last_play_score = score
        self.last_player = self.current_player
        self.consecutive_passes = 0

        input_with_quit("  Press Enter to continue...")
        return True

    def _calculate_score(self, word, row, col, dr, dc, placed_positions):
        """Calculate score for a played word including premiums."""
        placed_set = {(r, c) for r, c, _, _ in placed_positions}
        word_multiplier = 1
        word_score = 0

        for i in range(len(word)):
            r = row + dr * i
            c = col + dc * i
            cell = self.board[r][c]
            letter, is_blank = cell
            tile_value = 0 if is_blank else TILE_VALUES.get(letter, 0)

            # Only apply premium if tile was just placed
            if (r, c) in placed_set:
                prem = self.premiums.get((r, c))
                if prem == 'DL':
                    tile_value *= 2
                elif prem == 'TL':
                    tile_value *= 3
                elif prem == 'DW':
                    word_multiplier *= 2
                elif prem == 'TW':
                    word_multiplier *= 3

            word_score += tile_value

        word_score *= word_multiplier

        # Also score any cross-words formed
        cross_dr = 1 - dr
        cross_dc = 1 - dc
        for r, c, _, _ in placed_positions:
            cross_score = self._score_cross_word(r, c, cross_dr, cross_dc, placed_set)
            if cross_score > 0:
                word_score += cross_score

        return word_score

    def _score_cross_word(self, r, c, dr, dc, placed_set):
        """Score a cross-word formed perpendicular to placed tile at (r,c)."""
        size = self.size

        # Find start of cross word
        sr, sc = r, c
        while True:
            nr, nc = sr - dr, sc - dc
            if 0 <= nr < size and 0 <= nc < size and self.board[nr][nc] is not None:
                sr, sc = nr, nc
            else:
                break

        # Find end and collect tiles
        cr, cc = sr, sc
        tiles = []
        while 0 <= cr < size and 0 <= cc < size and self.board[cr][cc] is not None:
            tiles.append((cr, cc))
            cr += dr
            cc += dc

        if len(tiles) <= 1:
            return 0  # No cross word formed

        # Calculate cross word score
        word_multiplier = 1
        cross_score = 0
        for tr, tc in tiles:
            cell = self.board[tr][tc]
            letter, is_blank = cell
            tile_value = 0 if is_blank else TILE_VALUES.get(letter, 0)

            if (tr, tc) in placed_set:
                prem = self.premiums.get((tr, tc))
                if prem == 'DL':
                    tile_value *= 2
                elif prem == 'TL':
                    tile_value *= 3
                elif prem == 'DW':
                    word_multiplier *= 2
                elif prem == 'TW':
                    word_multiplier *= 3

            cross_score += tile_value

        return cross_score * word_multiplier

    # -------------------------------------------------------- check_game_over
    def check_game_over(self):
        # Game ends if:
        # 1. A player uses all tiles and bag is empty
        # 2. Both players pass consecutively (6 passes = 3 rounds)
        for i in range(2):
            if len(self.racks[i]) == 0 and len(self.bag) == 0:
                # Deduct remaining tiles from other player, add to this player
                other = 1 - i
                deduction = sum(
                    TILE_VALUES.get(t, 0) for t in self.racks[other]
                )
                self.scores[other] -= deduction
                self.scores[i] += deduction
                self.game_over = True
                break

        if self.consecutive_passes >= 6:
            # Deduct remaining tiles from both players
            for i in range(2):
                deduction = sum(
                    TILE_VALUES.get(t, 0) for t in self.racks[i]
                )
                self.scores[i] -= deduction
            self.game_over = True

        if self.game_over:
            if self.scores[0] > self.scores[1]:
                self.winner = 1
            elif self.scores[1] > self.scores[0]:
                self.winner = 2
            else:
                self.winner = None

    # ----------------------------------------------------------- state / save
    def get_state(self):
        # Convert board to serializable format
        serial_board = []
        for r in range(self.size):
            row = []
            for c in range(self.size):
                cell = self.board[r][c]
                if cell is None:
                    row.append(None)
                else:
                    row.append([cell[0], cell[1]])
            serial_board.append(row)

        return {
            "size": self.size,
            "board": serial_board,
            "scores": self.scores[:],
            "racks": [r[:] for r in self.racks],
            "bag": self.bag[:],
            "consecutive_passes": self.consecutive_passes,
            "last_play": self.last_play,
            "last_play_tiles": self.last_play_tiles,
            "last_play_score": self.last_play_score,
            "last_player": self.last_player,
        }

    def load_state(self, state):
        self.size = state["size"]
        self.center = self.size // 2
        self.premiums = _build_premium_map(self.size)
        self.scores = state["scores"][:]
        self.racks = [r[:] for r in state["racks"]]
        self.bag = state["bag"][:]
        self.consecutive_passes = state["consecutive_passes"]
        self.last_play = state["last_play"]
        self.last_play_tiles = [
            tuple(t) for t in state.get("last_play_tiles", [])
        ]
        self.last_play_score = state.get("last_play_score", 0)
        self.last_player = state.get("last_player", None)

        # Restore board
        self.board = []
        for row in state["board"]:
            board_row = []
            for cell in row:
                if cell is None:
                    board_row.append(None)
                else:
                    board_row.append((cell[0], cell[1]))
            self.board.append(board_row)

    # -------------------------------------------------------------- tutorial
    def get_tutorial(self):
        return """
==============================================================
                    WORD GAME TUTORIAL
==============================================================

OVERVIEW
  A Scrabble-like word game for 2 players. Take turns placing
  words on the board to score points. Premium squares multiply
  letter and word values.

--------------------------------------------------------------
BOARD
--------------------------------------------------------------
  Standard: 15x15 grid   Quick: 11x11 grid

  Premium squares:
    TW = Triple Word     DW = Double Word
    TL = Triple Letter   DL = Double Letter
    *  = Center square (first word must cross it)

--------------------------------------------------------------
TILES
--------------------------------------------------------------
  Each player has a rack of 7 tiles. After playing, draw from
  the bag to refill. Blanks (shown as _) can represent any
  letter but score 0 points.

  Point values:
    1 pt: A, E, I, L, N, O, R, S, T, U
    2 pt: D, G
    3 pt: B, C, M, P
    4 pt: F, H, V, W, Y
    5 pt: K
    8 pt: J, X
   10 pt: Q, Z
    0 pt: Blank

--------------------------------------------------------------
PLAYING WORDS
--------------------------------------------------------------
  play WORD row col direction

  Examples:
    play HELLO 7 7 across  - Place HELLO starting at row 7,
                              col 7, going right
    play WORLD 5 9 down    - Place WORLD starting at row 5,
                              col 9, going down

  Using blanks: use lowercase for blank tiles.
    play hELLO 7 7 across  - Uses a blank as 'H'

  Rules:
    - First word must cross the center square
    - All subsequent words must connect to existing tiles
    - You can extend existing words or cross them

--------------------------------------------------------------
SCORING
--------------------------------------------------------------
  - Sum tile values, applying premium square bonuses
  - Premium squares only apply when a tile is first placed
  - 50 bonus points for using all 7 tiles in one turn (BINGO)

--------------------------------------------------------------
OTHER MOVES
--------------------------------------------------------------
  exchange TILES  - Return tiles to bag, draw new ones
                    e.g. "exchange QZV" (lose your turn)
                    Use _ for blank: "exchange Q_"
  pass            - Pass your turn (no tiles placed)
  challenge       - Challenge opponent's last word
                    (honor system: they remove if invalid)

--------------------------------------------------------------
GAME END
--------------------------------------------------------------
  The game ends when:
    - A player uses all tiles and the bag is empty
    - Both players pass 3 consecutive rounds (6 passes)

  Final scoring: remaining tiles are deducted from each
  player's score.

--------------------------------------------------------------
CONTROLS
--------------------------------------------------------------
  'quit'  / 'q'  -- Quit the game
  'save'  / 's'  -- Save and suspend the game
  'help'  / 'h'  -- Show quick help
  'tutorial' / 't' -- Show this tutorial
==============================================================
"""
